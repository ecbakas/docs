# super-app toast redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `BottomSheetModal` toast with a top-banner overlay. It must stay visible above gorhom sheets, rnr dialogs, RN Modals and the keyboard, without changing any of the 99 call sites.

**Architecture:**
- A module-level store (`src/components/toast/store.ts`) owns the queue, the timers and an outlet stack.
- A `<ToastOutlet>` renders the viewport only when it is the top of that stack.
- `ToastHost` (the root outlet) mounts last in `_layout.tsx`. Every RN `<Modal>` mounts its own outlet.
- `useToast`/`useToastRef` keep their names, path and shapes, but bind to the store instead of context.

**Tech Stack:** React Native 0.81, Expo 54, Reanimated 4.1 (worklets 0.5.1, `runOnJS`), gesture-handler 2.28, safe-area-context 5.6, react-native-screens 4.16 (`FullWindowOverlay`), NativeWind 4, jest-expo (two projects).

**Spec:** `docs/superpowers/specs/2026-11-05-superapp-toast-redesign-design.md`

Work happens in `C:\unirefund\super-app-wt-toast`, branch `feat/toast-redesign`. Paths below are relative to it.

## Global Constraints

- **Public API.** Keep it, at module `@/providers/ToastProvider`:
  - `useToast()` → `{ show, success, error, warning, info, dismiss, dismissAll }`
  - `useToastRef()` → `{ current: { show(type, message, options?) → number, dismiss(id), dismissAll() } }`
  - The types `ToastType`, `ToastOptions` (`duration?`, `title?`, `action?`, `haptics?`) and `ToastAction` (`label`, `onPress`).
  - Both hooks return stable objects and never throw.
- **No new dependency, no native rebuild.**
- **Colour.** Only semantic tokens from `src/global.css`, so `tokens.test.ts` passes. No raw hex.
- **Render tests** are named `*.router.test.ts(x)`. A module that imports `react-native` cannot be tested in the node project.
- **Comments.** Far fewer than the repo's existing docblocks; comment only the non-obvious why.
- **Copy.** The only new user-visible string is the close label: reuse `MobileApp.Common.Close`.
- **Values from the spec:**
  - durations: success 3000, info 4000, warning 5000, error 6000
  - length bonus: +40 ms per character beyond 80, capped at 10000
  - screen-reader floor: 10000
  - at most 3 visible, at most 5 queued
  - 1000 ms minimum on resume from background
  - enter about 220 ms, exit about 160 ms
  - top offset `insets.top + 8`, side margin 12, gap 8, max width 560
  - 28dp icon chip, close hit area 44dp, message at most 4 lines

## Review Focus

1. **A Modal closes while a toast is showing.** The toast must reappear at the root with its remaining time, not restart and not vanish. Pinned in Task 2 (`outlet pop keeps the remaining time`).
2. **A toast fires during a burst of identical errors**, such as a retry loop. One card should restart its timer, never stack. Pinned in Task 2 (`dedupes against visible and queued`).
3. **The app is backgrounded right after a toast.** On return the toast must still be readable for at least 1 s. Pinned in Task 2 (`freezes while backgrounded`).
4. **A finger rests on the toast.** It must not expire under the finger. Pinned in Task 2 (`hold pauses and release resumes`). The gesture wiring itself is checked on device.
5. **A Modal added later without an outlet** would silently hide toasts again. Pinned in Task 5 (the guard test).

---

### Task 1: Types and duration rules

**Files:**
- Create: `src/components/toast/types.ts`
- Create: `src/components/toast/durations.ts`
- Test: `src/components/toast/__tests__/durations.test.ts` (node project; no RN import anywhere in the chain)

**Interfaces:**
- Produces from `types.ts`:
  - `ToastType`, `ToastAction`, `ToastOptions` (same shapes as today)
  - `ToastItem = { id: number; type: ToastType; message: string; title?: string; action?: ToastAction; duration: number; haptics: boolean }`
  - `ToastRef = { show(type, message, options?): number; dismiss(id: number): void; dismissAll(): void }`
- Produces from `durations.ts`:
  - `BASE_DURATION: Record<ToastType, number>`
  - `MAX_DURATION = 10000`
  - `SCREEN_READER_MIN_DURATION = 10000`
  - `resolveDuration(type: ToastType, message: string, explicit: number | undefined, a11y: { minTimeoutMs: number; screenReader: boolean }): number`

- [ ] **Step 1: Write the failing tests.** `resolveDuration` must:
  - return `BASE_DURATION[type]` for short messages: 3000 / 4000 / 5000 / 6000
  - give `6000 + 20 * 40 = 6800` for a 100-char error
  - cap a 1000-char info at `10000`
  - return an explicit `2500` as `2500`
  - return `Infinity` for an explicit `0` or `Infinity`
  - raise `minTimeoutMs: 30000` to `30000` (this applies to an explicit duration too)
  - raise to `10000` with `screenReader: true` when shorter
  - never floor a sticky toast: it stays `Infinity`
- [ ] **Step 2: Confirm they fail.** Run `npx jest src/components/toast/__tests__/durations.test.ts`. Expect a FAIL: the module is not found.
- [ ] **Step 3: Implement `types.ts` and `durations.ts`.** These are pure TypeScript.
- [ ] **Step 4: Confirm they pass.** Run the same command. Expect a PASS.
- [ ] **Step 5: Commit** with the message `feat(toast): duration rules for the overlay toast`.

### Task 2: The store

**Files:**
- Create: `src/components/toast/store.ts`
- Test: `src/components/toast/__tests__/store.router.test.ts`. It imports RN (`AccessibilityInfo`, `Platform`) and `expo-haptics`; mock haptics as the old Toast test did.

**Interfaces:**
- Consumes the types and `resolveDuration` from Task 1.
- Produces `toastStore` with these members:
  - `show(type, message, options?) → number`
  - `dismiss(id) → void`
  - `dismissAll() → void`
  - `hold(id) → void` and `release(id) → void`, for a touch that pauses one toast
  - `setBackgrounded(background: boolean) → void`
  - `setAccessibility({ minTimeoutMs, screenReader }) → void`
  - `setCloseLabel(label: string) → void`
  - `registerOutlet() → () => void`: returns the unregister function
  - `consumeEntrance(id) → boolean`: true only the first time it is called for an id
  - `subscribe(listener) → () => void`
  - `getSnapshot() → ToastSnapshot`
- `ToastSnapshot = { visible: ToastItem[]; queued: ToastItem[]; topOutlet: number | null; closeLabel: string }`. The snapshot is immutable and replaced on every change. `visible` is in chronological order.
- Also produces `useToastSnapshot(): ToastSnapshot` (via `useSyncExternalStore`) and `resetToasts(): void` for tests. Reset clears items, timers, outlets and the entrance set, sets the label back to `"Close"`, and turns backgrounded off.

- [ ] **Step 1: Write the failing tests.** Use fake timers and `resetToasts()` in `beforeEach`.
  - **`assigns distinct monotonic ids`:** two shows in one tick give ids `n` and `n+1`.
  - **`auto-dismisses after the resolved duration`:** an error is in `visible` at 5999 ms and gone at 6000.
  - **`keeps duration 0 until dismissed`.**
  - **`dedupes against visible and queued`:**
    - Re-showing the same type + message + title returns the same id and restarts the timer: shown at 0, re-shown at 5000, still present at 10999, gone at 11000.
    - With 3 visible plus one queued, re-showing the queued one returns its id and does not grow `queued`.
  - **`caps visible at 3 and queues the rest`:**
    - After 4 shows, `visible.length === 3` and `queued.length === 1`.
    - Dismissing one promotes the queued toast, and its timer starts at promotion.
  - **`drops the oldest non-error from an overflowing queue`:**
    - Queue 5 (info, error, info, info, info), then queue another info. The first queued info is gone and the error is still there.
    - With all 6 queued as errors, the oldest error is dropped.
  - **`announces and buzzes on becoming visible, not on queueing`:**
    - Check `AccessibilityInfo.announceForAccessibility` with `"Title. Message"`, or just `"Message"` without a title.
    - Check `Haptics.notificationAsync` for success, error and warning, never for info, and never when `haptics: false`.
    - A queued toast announces only when promoted.
  - **`freezes while backgrounded`:** show an error, advance 5500, call `setBackgrounded(true)`, advance 60000 (still visible), call `setBackgrounded(false)`. It is still visible at +999 and gone at +1000.
  - **`hold pauses and release resumes`:** a hold at 1000 ms on a 3000 ms success; advance 10000 (still visible); release; gone after another 2000.
  - **`dismissAll clears visible, queued and timers`.**
  - **`applies the accessibility floor`:** with `setAccessibility({ minTimeoutMs: 0, screenReader: true })`, a success lasts 10000.
  - **`tracks the top outlet`:** register A then B, so `topOutlet === B`. Unregister B, so it is A. Unregister A, so it is `null`.
  - **`outlet pop keeps the remaining time`:** a toast shown under B, B unregistered at 2000 ms; an error is still visible at 5999 total and gone at 6000. Timers do not care about outlets.
  - **`consumeEntrance is true once per id`.**
- [ ] **Step 2: Confirm they fail.** Run `npx jest src/components/toast/__tests__/store.router.test.ts`. Expect a FAIL.
- [ ] **Step 3: Implement `store.ts`.**
  - Each visible toast has a timer `{ handle, remaining, startedAt, held }`. It runs only while it is not held and the app is not backgrounded.
  - `setBackgrounded(false)` restarts every timer with `Math.max(1000, remaining)`.
  - Announce with `AccessibilityInfo.announceForAccessibility`, except on iOS for errors, which use `announceForAccessibilityWithOptions(text, { queue: false })`.
  - Haptics are best-effort: `.catch(() => {})`.
- [ ] **Step 4: Confirm they pass.** Run the same command. Expect a PASS.
- [ ] **Step 5: Commit** with the message `feat(toast): module store with queue, timers and outlet stack`.

### Task 3: The card and the outlet

**Files:**
- Create: `src/components/toast/ToastCard.tsx`
- Create: `src/components/toast/ToastOutlet.tsx`
- Test: `src/components/toast/__tests__/ToastOutlet.router.test.tsx`

**Interfaces:**
- Consumes `toastStore` and `useToastSnapshot` from Task 2.
- Produces:
  - `ToastOutlet({ root?: boolean }): JSX.Element | null`. It registers on mount and unregisters on unmount.
  - `ToastCard({ item, closeLabel }: { item: ToastItem; closeLabel: string })`

- [ ] **Step 1: Write the failing tests.** Mock `../../Ionicons` to a `View` with `testID={"icon-"+name}`, and safe-area insets to `{ top: 47 }`.
  - **`renders nothing when there are no toasts`:** `toJSON()` is null.
  - **`only the top outlet renders`:** mount two outlets (A, then B). Show one toast: the message text appears exactly once (`getAllByText(...).length === 1`). Unmount B: it still appears exactly once.
  - **`newest first`:** show "first" then "second". `"second"` comes before `"first"` in `toJSON()` text order.
  - **`variant chip`:** success, error, warning and info render `icon-checkmark`, `icon-close`, `icon-alert` and `icon-information`.
  - **`close button dismisses`:** pressing the element labelled `"Close"` empties `getSnapshot().visible`. The label comes from `setCloseLabel`; with `setCloseLabel("Kapat")` the button label is `"Kapat"`.
  - **`tapping the card body does not dismiss`.**
  - **`action runs then dismisses`.**
  - **`card is one alert element`:** `accessibilityRole === "alert"`, and the label is `"Title. Message"`.
  - **`top offset clears the status bar`:** the flattened style of the viewport's column (`testID="toast-viewport"`) has `top: 55`.
- [ ] **Step 2: Confirm they fail.** Run `npx jest src/components/toast/__tests__/ToastOutlet.router.test.tsx`. Expect a FAIL.
- [ ] **Step 3: Implement `ToastCard`.**
  - **Layout:** `Animated.View`; `bg-card border border-border rounded-xl p-3 gap-3 flex-row`; `shadow-md`.
  - **Chip:** a 28dp circle on `bg-{variant}-surface` with the glyph in `text-{variant}`.
  - **Text:** the title is `text-sm font-semibold`. The message is `text-sm`, `numberOfLines={4}`, and `text-muted` when there is a title.
  - **Action:** under the message, as `text-sm font-semibold` in the variant token.
  - **Close:** an `Ionicons` "close" button in `text-muted`, `hitSlop` up to 44dp.
  - **Animations:**
    - Entering is a drop-down plus fade (220 ms) when `toastStore.consumeEntrance(id)`, else `FadeIn`. Check the Reanimated preset's direction in source; the card must move *down* into place.
    - Exiting is upward plus fade (160 ms).
    - `layout={LinearTransition}` and `.reduceMotion(ReduceMotion.System)`.
  - **Swipe:**
    - `Gesture.Pan()`: `onBegin` calls `hold`.
    - `onUpdate`: `x` follows the finger; `y` follows only upward.
    - `onEnd`: dismiss when `|x| > 96`, `y < -36`, `|vx| > 800` or `vy < -800`. Animate it off-screen, then `runOnJS(dismiss)`. Otherwise spring back.
    - `onFinalize` calls `release` (a no-op after dismiss).
- [ ] **Step 4: Implement `ToastOutlet`.**
  - Register in an effect.
  - Render when `topOutlet === myId` and (`visible.length > 0` or within 160 ms of becoming empty, so the last exit animation can play).
  - **Container:** absolute full-fill, `pointerEvents="box-none"`, `zIndex` and `elevation` at 9999. It is wrapped in a `GestureHandlerRootView` with style absolute-fill and `box-none`.
  - **On iOS with `root`:** also wrapped in `FullWindowOverlay` from `react-native-screens`.
  - **Column:** `testID="toast-viewport"`, `top: insets.top + 8`, `px-3 gap-2 w-full max-w-[560px] self-center`, cards in reverse order.
- [ ] **Step 5: Confirm they pass.** Run the same command. Expect a PASS.
- [ ] **Step 6: Commit** with the message `feat(toast): top-banner card with swipe-to-dismiss and outlets`.

### Task 4: Wire the host and the API; retire the sheet toast

**Files:**
- Modify: `src/providers/ToastProvider.tsx`. It becomes `ToastHost`, `useToast`, `useToastRef`, and type re-exports; `ToastProvider` is removed.
- Modify: `src/app/_layout.tsx`. Drop `<ToastProvider>` and the inner `<ToastHost />`. Mount `<ToastHost />` right after `<PortalHost />`.
- Delete: `src/components/Toast.tsx`
- Delete: `src/components/__tests__/Toast.router.test.tsx`
- Delete: `src/components/__tests__/ToastStackBehavior.router.test.tsx`
- Modify: `src/app/__tests__/providerOrder.router.test.tsx`
- Test: `src/providers/__tests__/ToastProvider.router.test.tsx`

**Interfaces:**
- Consumes `toastStore` (Task 2) and `ToastOutlet` (Task 3).
- Produces:
  - `ToastHost(): JSX.Element`. It sets the close label from `t("MobileApp.Common.Close")`, binds `AppState` to `setBackgrounded`, and binds `AccessibilityInfo` to `setAccessibility`. On Android it reads `getRecommendedTimeoutMillis(0)` once; on all platforms it reads `isScreenReaderEnabled` and listens to `screenReaderChanged`.
  - `useToast` and `useToastRef`, with the shapes in Global Constraints.

- [ ] **Step 1: Write the failing tests.**
  - **`useToast and useToastRef work without any provider`:** call them in a bare `renderHook`. `success("x")` returns a number and adds to `getSnapshot().visible`.
  - **`both are referentially stable across renders`.**
  - **`ToastHost binds AppState`:** spy on `AppState.addEventListener`. A `"background"` event freezes a toast, which is still visible far past its duration.
  - **`ToastHost sets the translated close label`:** mock `useLocalization` with `t: k => "T:" + k`. The snapshot's `closeLabel` is `"T:MobileApp.Common.Close"`.
  - **`providerOrder.router.test.tsx` rewrite:** keep its "boots the real layout" case. Replace the two ERT-10/12 cases with one: a teleport-host probe outside any provider calls `useToast().error("x")` without throwing and the toast lands in the store.
- [ ] **Step 2: Confirm they fail.** Run `npx jest src/providers/__tests__/ToastProvider.router.test.tsx src/app/__tests__/providerOrder.router.test.tsx`. Expect a FAIL.
- [ ] **Step 3: Implement the changes** listed under Files above.
- [ ] **Step 4: Confirm they pass.** Run the same command, then `npx tsc --noEmit`. Expect a PASS, and tsc shows only the documented `tabBackNavigation:119` error, if typed routes exist.
- [ ] **Step 5: Commit** with the message `feat(toast): mount the overlay host at the root and retire the sheet toast`.

### Task 5: An outlet in every RN Modal, plus the guard

**Files:**
- Modify (add `<ToastOutlet />` as the last child inside `<Modal>…</Modal>`; when a Modal has several returns, add it to each):
  - `src/components/AnchoredDropdown.tsx`
  - `src/components/card/CardScannerModal.tsx`
  - `src/components/card/NfcCardModal.tsx`
  - `src/components/QrScanner.tsx`
  - `src/screens/shared/Tags/Tag/landscape/_components/RailSelect.tsx`
  - `src/screens/shared/Tags/Tag/_components/refund/RefundConfirmSheet.tsx`
  - `src/screens/shared/Tags/Tag/_components/refund/RefundSurface.tsx`
  - `src/screens/shared/Tags/Tag/_components/TagFilterDrawer.tsx`
  - `src/screens/shared/_components/SearchTraveller/KycCameraModal.tsx`
  - `src/screens/shared/_components/SearchTraveller/MrzCameraModal.tsx`
  - `src/screens/shared/_components/SearchTraveller/SearchTraveller.tsx`
  - `src/screens/shared/_components/tag-calculator/SignatureModal.tsx`
  - `src/screens/staff/StickerTag/_components/SearchMerchant.tsx`
  - `src/screens/traveller/Validate/ClaimTagModal.tsx`
  - `src/templates/ListModal.tsx`
- Test: `src/components/toast/__tests__/modalOutlets.test.ts` (node project). It uses `git grep` the way `tokens.test.ts` does.

**Interfaces:**
- Consumes `ToastOutlet` (Task 3).

- [ ] **Step 1: Write the failing guard test.**
  - Find the files in `src` (excluding `__tests__`) that import `Modal` from `"react-native"` and contain `<Modal`.
  - Each must contain `<ToastOutlet`.
  - The failure message lists the offenders.
- [ ] **Step 2: Confirm it fails.** Run `npx jest src/components/toast/__tests__/modalOutlets.test.ts`. Expect a FAIL listing the 15 files.
- [ ] **Step 3: Add the outlets** to those 15 files.
- [ ] **Step 4: Confirm it passes.** Run the guard test, then the existing suites of those Modals: `npx jest SignatureModal RefundSurface SearchTraveller CardScannerModal ClaimTagModal ListModal`. Expect a PASS for all.
- [ ] **Step 5: Commit** with the message `feat(toast): give every RN Modal a toast outlet, guarded by a test`.

### Task 6: Docs, gates, device QA

**Files:**
- Modify `AGENTS.md` under On-device QA traps:
  - Replace the "`Toast` is itself a `BottomSheetModal`" bullet with: every RN `<Modal>` renders `<ToastOutlet />`, guarded by `modalOutlets.test.ts`.
  - In the BottomSheet bullet, drop the `useToast()` throw claim; `useLocalization` still applies.

- [ ] **Step 1: Edit `AGENTS.md`.**
- [ ] **Step 2: Run the gates.**
  - `npm run typecheck`: only `tabBackNavigation:119`.
  - `npm test`: 0 failures.
  - `npx eslint src`: 0 errors.
  - Re-run `npm test` once all new files are committed, because `tokens.test.ts` reads only tracked files.
- [ ] **Step 3: Device QA on the CPad, by serial.** Use settled screenshots (`sleep 2` on the device, then two captures):
  - a toast over an open bottom sheet
  - a toast over an RN Modal
  - a toast with the keyboard up
  - two toasts in quick succession
  - a swipe dismiss
- [ ] **Step 4: Commit** with the message `docs(toast): record the outlet rule in AGENTS.md`.

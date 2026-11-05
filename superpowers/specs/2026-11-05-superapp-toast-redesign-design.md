# super-app toast redesign — design

Date: 2026-11-05 · Repo: `super-app` · Branch: `feat/toast-redesign` (worktree `C:\unirefund\super-app-wt-toast`)

## Why

Toasts in super-app sometimes appear underneath bottom sheets, behind RN Modals,
or behind the keyboard. The cause is structural: the toast UI
(`src/components/Toast.tsx`) is itself a `@gorhom/bottom-sheet`
`BottomSheetModal`.

- **Under sheets.** gorhom paints modals in mount order. A sheet presented while
  a toast is up covers it, re-presenting an already-presented toast does not
  raise it, and the sheet's backdrop dims it.
- **Under rnr dialogs.** `<PortalHost />` mounts after `BottomSheetModalProvider`
  in `src/app/_layout.tsx`, so rnr `Dialog`/`Select`/`Popover` cover it.
- **Under RN Modals.** Every `<Modal>` is its own Android Dialog window. 15 files
  use one, and nothing in the activity window can draw above it.
  `SignatureModal` and `RefundSurface` fire toasts while their Modal is open.
- **Behind the keyboard.** The toast sits at a fixed bottom inset. Edge-to-edge
  (Android 15+) stops the window resizing, so the keyboard covers it.

Being a sheet also caused two past crashes, both recorded in memory: the
provider-order boot crash (ERT-10/12) and the `stackBehavior` restore crash.

## Decided with the user (2026-11-05)

1. **Own overlay layer.** The toast stops being a `BottomSheetModal`. It becomes
   a plain overlay that is drawn last at the app root, plus a small *outlet* that
   each RN Modal mounts so toasts render inside that Modal's window.
2. **Top banner placement.** The toast drops in below the status bar and swipes
   up to dismiss. It never meets the keyboard, a sheet's footer buttons or the
   floating tab island, so keyboard-awareness comes from placement, not tracking.
3. **Look:** a neutral elevated card with a tinted icon chip, replacing the
   current fully tinted surface. The mockup was shown inline in chat and not
   saved. The card spec under "Layout and look" is the authority.

## Goals

- A toast is visible above screens, gorhom sheets and their backdrops, rnr
  dialogs/popovers, RN Modals, and the keyboard.
- Keep the public API so the 99 call sites do not change: `useToast()`
  (`show/success/error/warning/info/dismiss/dismissAll`), `useToastRef()`
  returning a ref whose `current` has `show(type, message, options)`,
  `dismiss(id)`, `dismissAll()`, plus the `ToastType`, `ToastOptions` and
  `ToastAction` types. The module path `@/providers/ToastProvider` is unchanged,
  because 43 suites `jest.mock` it by that path.
- Swipe to dismiss, a queue, sensible durations, four variants, screen-reader
  announcements, safe areas, and phone and tablet in either orientation.
- JS-only: no new dependency and no native rebuild. Reanimated 4.1,
  gesture-handler 2.28 and safe-area-context are already installed.

## Non-goals

- Drawing above *other activities*: Didit, the document scanner, OS pickers.
- Changing toast copy or which flows raise toasts.
- iOS-specific work beyond making the same code correct there (see Risks).

## Anti-goals (failure even if it "works")

- A toast that blocks touches on the screen beneath it outside its own card.
- A toast that steals focus or dismisses the keyboard. That rules out opening a
  transparent RN `Modal` for the toast itself.
- Any dependence on React context reachable from inside a gorhom sheet. That is
  the ERT-10 class of bug.

## Design

### State: a module-level store, no context

- `src/components/toast/store.ts` holds the queue and the outlet stack in a
  module singleton, read through `useSyncExternalStore`.
- `useToast()` and `useToastRef()` return stable objects bound to that store, so
  they work from anywhere: inside sheets, inside Modals, from hooks. They never
  throw.
- **`ToastProvider` is removed.** `ToastHost` stays as the root mount point.
- A test-only `resetToasts()` export clears state between suites.
- **The existing logic carries over:**
  - monotonic ids
  - dedupe: the same type + message + title restarts its timer instead of stacking
  - haptics per variant
  - countdowns frozen while the app is backgrounded, with a 1 s minimum on resume
  - sticky toasts with `duration: 0` or `Infinity`
  - an action that runs, then dismisses

### Where it renders: outlets

- **`<ToastOutlet />`** registers itself on mount, pushing onto the outlet
  stack, and unregisters on unmount. Only the *top* outlet renders the toast
  viewport, so a toast is drawn exactly once.
- **The root outlet.** `ToastHost` renders the root outlet in `_layout.tsx`
  after `<PortalHost />` and before `SplashScreenController`. That puts it above
  the navigator, the gorhom portal host and the rnr portal host. It sets
  `pointerEvents="box-none"` and a high `zIndex` / `elevation` so Android
  elevation cannot reorder it.
- **On iOS, the root outlet is wrapped in `react-native-screens`'
  `FullWindowOverlay`.** *(my call)*
  - Why: iOS presents the `transparentModal` routes (`loading`,
    `(modals)/language-selector`) as modal view controllers. All nine rnr
    overlays already render in `FullWindowOverlay`. Both would cover a plain
    root view.
  - It is the kit's own precedent: `Platform.OS === "ios" ? FullWindowOverlay :
    Fragment`.
  - The outlet renders the overlay only while toasts exist. So a toast raised
    over an open dialog mounts the newer overlay and lands on top.
- **Modal outlets.** Every RN `<Modal>` in `src` gets `<ToastOutlet />` as the
  last child of its content (15 files today). RN unmounts Modal children while
  `visible` is false, so the outlet exists exactly while the Modal is up. With
  nested Modals the innermost one wins, because it mounted last.
- **Hand-over when a Modal closes.** The toasts move back to the root outlet and
  keep their remaining time. They should not replay the full entrance there; a
  plain fade is fine.
- **A guard test.** It greps `src` (tracked files, like `tokens.test.ts`) for
  every file rendering a react-native `<Modal` and fails if that file has no
  `<ToastOutlet`, so a future Modal can't silently lose toasts.
- **Context-free viewport.** The viewport reads nothing from React context
  except `useSafeAreaInsets()`. `SafeAreaProvider` sits above everything, and the
  hook works inside Modals; `SafeAreaView` does not. The close-button label is
  translated once by `ToastHost`, which sits under `LocalizationProvider`, and
  written into the store.
- **Gesture root.** Each outlet wraps its viewport in its own
  `GestureHandlerRootView`. Gestures inside an RN Modal on Android need one.

### Layout and look

- **Top-anchored column.**
  - It starts at `insets.top + 8`, has 12dp side margins and 8dp gaps between
    cards.
  - It is centred at `max-width: 560` so a tablet or landscape window gets a
    banner, not a full-width strip.
  - The newest toast sits at the top and older ones are pushed down.
- **The card.**
  - `bg-card`, a `border-border` hairline, a soft shadow and `rounded-xl`.
  - A 28dp circular icon chip tinted with the variant's `*-surface` background
    and its accent icon colour (success/error/warning/info tokens from
    `global.css`; no raw hex, so `tokens.test.ts` stays green).
  - An optional bold title, the message (at most 4 lines), an optional action as
    accent-coloured text, and a muted close "×" with a 44dp hit area.
- **Card details** *(my calls)*:
  - **Spacing:** padding `p-3`, `gap-3`.
  - **Text:** the title is `text-sm font-semibold text-foreground`. The message
    is `text-sm text-foreground` when there is no title, `text-muted` under a
    title.
  - **Action:** sits under the message, left-aligned, `text-sm font-semibold`
    in the variant's `-strong` / accent token.
  - **Close (×):** top-right.
  - **Shadow:** a soft `shadow-md`, in the same style the rnr popover uses.
  - **Chip glyphs:** Ionicons `checkmark`, `close`, `alert`, `information` in
    the variant colour, on its `-surface`.
- **Motion** uses Reanimated:
  - enter: slide down + fade, about 220 ms
  - exit: slide up + fade, about 160 ms
  - when a card leaves, the others move into place with a layout transition
  - with Reduce Motion on, fade only

### Interaction

- **Swipe up or sideways past a threshold, or a fling, dismisses.** Anything
  less springs back. Pressing on a card pauses its countdown, and releasing
  resumes it.
- **Tapping the card body does nothing.** It used to dismiss, which made a
  mis-tap lose an error unread. Close is the × button or a swipe.
- **The Android back button is no longer intercepted.** A toast is not modal,
  so back keeps its normal meaning.

### Queue and durations

- **At most 3 visible.** Further toasts queue, and their timers start only when
  they become visible. If the queue holds more than 5, the oldest queued
  non-error toast is dropped first. When every queued toast is an error, the
  oldest one goes. *(my call)*
- **Announcements wait for visibility.** A queued toast is announced and
  buzzes when it becomes visible, not when it is queued. *(my call)*
- **Hand-over works both ways.** If a Modal opens while toasts are showing at
  the root, they move into the Modal's outlet, keeping their remaining time.
  *(my call)*
- **Base durations:** success 3 s, info 4 s, warning 5 s, error 6 s. Add 40 ms
  per character beyond 80, capped at 10 s. An explicit `duration` still wins.
- **Accessibility timeout.** On Android, the user's "time to take action"
  setting raises the floor. It is read once with
  `AccessibilityInfo.getRecommendedTimeoutMillis`. While a screen reader is on,
  timed toasts last at least 10 s.

### Accessibility

- **Announcements.** On show, `AccessibilityInfo.announceForAccessibility`
  reads "title. message". This is reliable across windows, where a live region
  is not. Errors use `announceForAccessibilityWithOptions(…, { queue: false })`
  on iOS so they interrupt.
- **Roles and labels.** The card is one accessible element with role `alert`
  and the same label. The close button and the action are separate focusable
  buttons. There are no live regions, so nothing is announced twice.

## Tests

- Rewrite `src/components/__tests__/Toast.router.test.tsx` against the store
  and the viewport. It covers:
  - variants
  - default and length-based durations
  - sticky toasts
  - distinct ids
  - dedupe
  - queueing past 3
  - the close button
  - the action
  - the backgrounded freeze
  - announcements
  - the top inset
- New tests for outlet hand-over (the top outlet renders, a pop falls back) and
  for the `<Modal>` → `<ToastOutlet>` guard.
- Delete `ToastStackBehavior.router.test.tsx`; the prop no longer exists.
- Rewrite the toast half of `providerOrder.router.test.tsx`: the real layout
  boots, and `useToast()` works from a teleported sheet-content probe with no
  provider.
- Swipe is verified on device. RNGH's jest mock does not drive pans.

## Verification

Gates (per `super-app/AGENTS.md`, re-measured on `origin/main` first):

- `npm run typecheck`: only the documented `tabBackNavigation:119` error.
- `npm test`: 0 failures.
- `npx eslint src`: 0 errors.

On a CPad by serial, with settled screenshots (never straight after a tap):

1. a toast over an open bottom sheet
2. a toast over an RN Modal
3. a toast with the keyboard up
4. two toasts in quick succession

Plus swipe-dismiss and TalkBack announcement if time allows.

## Risks / unverified

- **iOS is not testable here.** The `FullWindowOverlay` branch and the Modal
  outlets on iOS are unverified. They need an iOS device pass before release:
  - a toast over the language-selector route
  - a toast over an rnr dialog
  - a toast over an RN Modal
- **A dialog opened while a toast is up** mounts its own overlay later and so
  covers that toast on iOS. That is accepted: it is ordinary stacking, and the
  next toast lands on top.
- **Status-bar offset in some Modals.** A Modal that is not
  `statusBarTranslucent` starts below the status bar on Android, so
  `insets.top` double-counts there and the toast sits about 24dp lower. That is
  cosmetic; fixing it per Modal is left to the builder.

# Design: A generic PageHeader, and no pushed page without a back button

**Date:** 2026-08-26
**Repo:** `super-app`
**Branch point:** `e7baa09` (`main`) — "Merge core/main into latest".

**Scope:** a new `src/components/PageHeader.tsx`; `src/templates/Modal.tsx` and `src/templates/TabPage.tsx` rewired to render it; four screens edited (three gain a prop, one gains an explicit back target); two dead template test suites renamed into the project that runs them, then extended; one new render test; one new localization key in both resources.

## Goal

Every pushed page in super-app shows a back button in its header, and that header comes from one component rather than two divergent copies.

## Why

Every navigator in the app sets `headerShown: false` — [(auth)/_layout.tsx:85](../../../super-app/src/app/(auth)/_layout.tsx#L85), [(public)/_layout.tsx:7](../../../super-app/src/app/(public)/_layout.tsx#L7), [(auth)/(modals)/_layout.tsx:7](../../../super-app/src/app/(auth)/(modals)/_layout.tsx#L7), [(auth)/profile/_layout.tsx:12](../../../super-app/src/app/(auth)/profile/_layout.tsx#L12), [(auth)/tags/_layout.tsx:7](../../../super-app/src/app/(auth)/tags/_layout.tsx#L7). There is no native back affordance anywhere in the app. Every back button is hand-rolled, and whether a page has one is decided per screen.

Two templates draw headers, and they disagree:

1. **`ModalTemplate`** ([Modal.tsx](../../../super-app/src/templates/Modal.tsx)) renders its back arrow only when a `backAction` prop is passed — the prop does double duty as *visibility* and *target*. Eighteen screens use the template; **nine pass nothing and therefore have no back button at all.** The failure is silent: a new screen that forgets the prop ships unnavigable, and nothing in the type system objects because `backAction` is optional.

2. **`TabPage`** ([TabPage.tsx](../../../super-app/src/templates/TabPage.tsx)) has no back button in any form. That is correct for the thirteen tab-root screens that use it, and wrong for the three pushed screens that also use it — `create-tag`, `refund`, and `customs-validate` are all registered with `href: null` in [(auth)/_layout.tsx](../../../super-app/src/app/(auth)/_layout.tsx#L136-L165), meaning they are push-navigable but hidden from the tab bar. On those three the user's only way out is the Android hardware key, and on iOS there is none.

3. **The hardware key is handled in one template only.** `ModalTemplate` mirrors its back arrow onto Android's hardware back via `useFocusEffect` + `BackHandler` ([Modal.tsx:66-84](../../../super-app/src/templates/Modal.tsx#L66-L84)). `TabPage` does not, so the three pushed tab screens do not honor a custom back target on the hardware key either.

## Decisions (agreed with user)

1. **Tab roots keep no back button.** The rule is "no *pushed* page without a back button", not literally every page. `router.back()` on a tab root either no-ops or exits the app, which reads as a broken control.
2. **One `PageHeader`, consumed by the templates** — not a standalone component every screen imports. Screens keep their current template import; the header markup moves to one file.
3. **Back defaults to ON with an explicit opt-out.** `showBack` defaults true in `ModalTemplate` and false in `TabPage`. `backAction` becomes target-only. A future screen that forgets a prop gets a back button rather than losing one — the default fails safe.
4. **Full visual unify at `px-4`.** One page inset app-wide. `ModalTemplate` moves from `px-6` to `px-4`; `TabPage` already is `px-4`. Title unifies on `text-3xl font-bold` (`TabPage`'s weight) over `font-medium`.
5. **Auto-detection via `router.canGoBack()` was rejected.** With expo-router `Tabs`, switching tabs can push history, so the arrow would appear on tab roots inconsistently and could not be tested deterministically.

## The component

```tsx
// src/components/PageHeader.tsx
interface PageHeaderProps {
  title: string;
  description?: string;
  showBack?: boolean;          // default true
  backAction?: () => void;     // default router.back()
  right?: React.ReactNode;     // bell on TabPage, headerRightComponent on Modal
  accessory?: React.ReactNode; // under the title, same column
}
```

`PageHeader` owns:

- the circular bordered back button, debounced through `useDebouncedPress` so a double tap cannot pop two screens (carried over from [Modal.tsx:66-74](../../../super-app/src/templates/Modal.tsx#L66-L74));
- title, optional description, the `right` slot, and the `accessory` slot;
- **the Android hardware-back mirroring.** Moving the `useFocusEffect` + `BackHandler` block out of `ModalTemplate` and into `PageHeader` is what extends it to the three pushed `TabPage` screens. It stays scoped to focus so only the visible screen claims the press, and keeps returning `true` to stop React Navigation running its own pop.

`PageHeader` does **not** own `SafeAreaView`, the scroll view, keyboard handling, or the pinned action button. Those stay with the templates, which differ legitimately.

Horizontal padding: `PageHeader` carries none. Each template keeps its own container padding, so header and content stay aligned. Decision 4 is implemented by changing `ModalTemplate`'s container from `px-6` to `px-4` in three places — the header wrapper, the `ScrollView`, and the pinned action `View` ([Modal.tsx:113](../../../super-app/src/templates/Modal.tsx#L113), [:141](../../../super-app/src/templates/Modal.tsx#L141), [:170](../../../super-app/src/templates/Modal.tsx#L170)) — not by moving padding into the header.

## Scope table

Navigation into every affected route was traced; all inbound calls are `router.push`, so the default `router.back()` is safe. The one exception is called out below.

### Gain a back button, no screen edit (8)

`ModalTemplate` flipping its `showBack` default is the entire change for these:

| Screen | Route | Pushed from |
|---|---|---|
| `debug-menu.tsx` | `/(modals)/debug-menu` | both login screens |
| `DeviceSettingsScreen` | `/(auth)/(modals)/device-settings` | merchant + staff Profile |
| `LanguageSelectionScreen` | `/(modals)/language-selector` | onboarding, RoleGate, 5 Profiles |
| `NotificationsScreen` | `/notifications` | `TabPage`'s bell |
| `EditProfileScreen` | `/(auth)/profile/edit-profile` | 5 Profile screens |
| `ResetPasswordScreen` | `/(public)/reset-password` | `useTravellerDidit.goToReset` |
| `TagPreviewScreen` | `/tag-preview` | `useScanRouting`, `StickerTagScreen` |
| `ValidateScreen` | `/validate` | `useScanRouting` |

### Gain a back button, one prop each (3)

Pushed `TabPage` screens, registered `href: null`:

- `CreateTagScreen` — `/(auth)/create-tag`
- `RefundScreen` — `/(auth)/refund`
- `CustomsValidateScreen` — `/(auth)/customs-validate`

### Gains a back button with an explicit target (1)

`RegisterScreen` (`/(public)/register`). **Nothing in the app navigates to it.** It is declared in [(public)/_layout.tsx:15](../../../super-app/src/app/(public)/_layout.tsx#L15) and holds an outbound `<Link href="/traveller-login">` ([RegisterScreen.tsx:93](../../../super-app/src/screens/traveller/RegisterScreen.tsx#L93)), but no `router.push`, `router.replace`, or `<Link>` anywhere targets it — it is reachable only by deep link, where the history stack is empty and `router.back()` would no-op.

It therefore passes `backAction={() => router.replace("/traveller-login")}`, matching its own Link target and the pattern already used by [StaffLoginScreen.tsx:61](../../../super-app/src/screens/shared/StaffLoginScreen.tsx#L61) and [TravellerLoginScreen.tsx:82](../../../super-app/src/screens/traveller/TravellerLoginScreen.tsx#L82), which both `replace` to `/role-select`.

That `/register` is unreachable is a separate defect. This design does not fix it.

### Already correct, must not regress (9)

`backAction` keeps working as a target: ConnectedDevices, ManualEntry, StaffLogin, TagDetail, StickerTag, Cards, Didit, Documents, TravellerLogin. Two of these pass `router.replace` targets and one (`TagDetail`) passes a computed callback across three render branches — the target-only semantics must be preserved exactly.

### Deliberately no back button (18)

Thirteen tab-root `TabPage` screens (Home ×4 roles, Profile ×4 variants, FAQ ×3, Tags, StaffProfile); `ExploreScreen` (tab root, full-bleed map, no title header); `RoleGateScreen` (first-launch entry, animated panels, nothing behind it); `onboarding`; `+not-found`; `loading` (already blocks hardware back deliberately).

## Accessibility

The arrow gets `accessibilityRole="button"` and a localized `accessibilityLabel`. Today's arrow has neither — it is a bare `TouchableOpacity` wrapping an `Ionicons` glyph, which a screen reader announces as nothing. This adds one key, `MobileApp.Common.Back`, to both `en-US` and `tr-TR` resources, and therefore requires `npm run init` before `tsc` will accept it.

## Testing

### The templates currently have no live test coverage

Jest runs [two projects](../../../super-app/jest.config.js): a `node` project for logic, and a `router` project (`jest-expo/android` preset) matching `**/*.router.test.[jt]s?(x)`. Anything that *renders* must be in the second — under the node preset `@testing-library/react-native` cannot even be imported, because nativewind's web JSX runtime pulls in `react-native-web`, which this app does not depend on.

**`src/templates/__tests__/Modal.test.tsx` and `TabPage.test.tsx` are named `.test.tsx`, so they land in the node project and fail to load.** They are two of the six baseline failures. The two suites covering the exact templates this design rewires do not execute.

This was verified, not assumed: copying both to `*.router.test.tsx` and running them gives `2 passed, 3 tests passed`. They are correct tests in the wrong project, exactly as the config's own comment predicts.

### Plan

1. **Rename `Modal.test.tsx` → `Modal.router.test.tsx` and `TabPage.test.tsx` → `TabPage.router.test.tsx`.** This is prerequisite work, not a nice-to-have: without it there is no regression signal on either template. It also takes the baseline from 6 failing suites to 4.
2. **Extend both suites.** Three tests across two templates is thin cover for a change that rewires both. Add: `ModalTemplate` renders a back button with no props; `showBack={false}` suppresses it; `TabPage` renders none by default; `TabPage` renders one when `showBack` is passed.
3. **New `src/components/__tests__/PageHeader.router.test.tsx`:**
   - renders a back button by default;
   - renders none when `showBack={false}`;
   - calls `backAction` instead of `router.back()` when given;
   - falls back to `router.back()` when not given;
   - Android hardware back runs the same handler;
   - the handler is debounced — a double tap pops once.

The remaining four baseline failures (`BottomSheet`, `DebouncedPressable`, `SafeAreaView`, `Toast` — same misfiling, same root cause) are **out of scope**. They cover components this design does not touch. Fixing them is a worthwhile separate change.

## Verification

1. **Jest baseline, recorded before any edit** (`npx jest`, branch point `e7baa09`, clean tree, no nested worktrees present):

   ```
   Test Suites: 6 failed, 116 passed, 122 total
   Tests:       1 skipped, 955 passed, 956 total
   ```

   This repo does not start green. The after-state is compared against these numbers, not against zero. Target after this work: **4 failed, 119 passed, 123 total**, with test count up by the new cases — two suites fixed by the rename, one suite added.
2. `npx tsc --noEmit` and `npx jest` after.
3. **Functional QA on the attached device** — `OrderPAD 3`, Android 14, 1200×1920 @ 240dpi. Back arrows render, tap pops correctly, Android hardware key matches, no crash. JS-only changes, so Metro reload suffices; no rebuild.
4. **Cosmetic judgement on the `Pixel_9_Pro` AVD.** The attached device is **800dp wide** (1200 / 1.5) — a tablet. An 8px inset change is invisible at 800dp and is ~4.4% of screen width at 360dp, so the `px-6` → `px-4` decision cannot be judged on the physical device. The AVD, plus the prebuilt `android/app/build/outputs/apk/debug/app-debug.apk`, answers it at phone width.
5. Staff login is required to reach `CreateTag`, `Refund`, and `CustomsValidate` — the three screens taking the new `showBack` prop. A traveller session covers the rest.

## Risks

- **The `px-4` unify is the only change that touches screens with no back-button problem.** All eighteen `ModalTemplate` screens get 8px wider content. It is cosmetic and carries the most regression risk of anything here; it is separable from the back-button fix and can be reverted independently if the AVD check looks wrong.
- **`font-bold` over `font-medium` is a judgement call**, made on the grounds that a page title is a heading and the tab screens already use it. It is one word in one file.
- **`TagDetailScreen` passes `backAction` from three separate render branches** ([:220](../../../super-app/src/screens/shared/Tags/TagDetail/TagDetailScreen.tsx#L220), [:230](../../../super-app/src/screens/shared/Tags/TagDetail/TagDetailScreen.tsx#L230), [:277](../../../super-app/src/screens/shared/Tags/TagDetail/TagDetailScreen.tsx#L277)) including loading and error states. It is the most likely place for a subtle regression.
- **The device is shared between agent sessions.** Another session may be driving it; QA steps should not assume exclusive control.

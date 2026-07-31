# Safe-area coverage for every page and modal

**Date:** 2026-07-30
**Scope:** `super-app`, with shared fixes landed upstream in `core` and propagated to `pos-app`
**Status:** Approved, ready for implementation planning

## Problem

`app.config.js` sets `edgeToEdgeEnabled: true` on Android, so every screen draws under the
status bar and navigation bar unless it opts into safe-area insets. Most of the app is already
covered — `templates/Modal.tsx` and `templates/TabPage.tsx` wrap 27 screens, and
`components/BottomSheet.tsx` applies `bottomInset={insets.bottom + 10}` — but three classes of
gap remain:

1. **Six full-screen `<Modal>` components** bypass both templates and handle no insets at all.
   Camera modals compensate with hardcoded magic numbers (`paddingTop: 52`, `bottom: 110`) that
   are wrong on any device whose insets differ from the author's.
2. **Two route-level pages** render a bare `View` with hardcoded padding (`pt-14`, `pb-6`).
3. **The shared `SafeAreaView` primitive is itself broken on iOS**, so even correct call sites
   cannot rely on it.

### The primitive bug

`core/src/components/SafeAreaView.tsx` branches on platform:

```tsx
if (Platform.OS === "ios") {
  return (
    <RNSafeAreaView {...props} className={className}>
      <View className={className} style={{ backgroundColor: "transparent" }}>
        {children}
      </View>
    </RNSafeAreaView>
  );
}
```

Two defects:

- `RNSafeAreaView` is React Native's deprecated `SafeAreaView`, which **ignores the `edges`
  prop**. `TabPage` asks for `edges={["top", "left", "right"]}`; on iOS it silently gets bottom
  padding too, double-padding above the tab bar.
- `className` is applied twice — once to the outer safe-area view and again to a nested `View`
  — duplicating flex, padding and background classes.

`SafeAreaProvider` is already mounted at `src/app/_layout.tsx:43`.

### Prior art: pos-app already solved this

`pos-app` fixed both of these locally and never pushed them back to `core`:

- `66529ae` (2026-04-20) rewrote `pos-app/src/components/SafeAreaView.tsx` to the
  context-only version. It has shipped in production since April, which removes the risk
  that NativeWind's `className` fails to apply to `react-native-safe-area-context`'s view
  on iOS.
- `pos-app/src/templates/Modal.tsx` already owns the bottom inset explicitly, with a comment
  naming the Android edge-to-edge nav-bar problem.

This work ports those upstream rather than reinventing them.

## Repo topology

| Repo | Remote | Role |
|---|---|---|
| `core` | `core-mobile` | Upstream template holding shared components |
| `super-app` | `unirefund-mobile`, plus `core` remote | Consumer |
| `pos-app` | `unirefund-pos`, plus `core` remote | Consumer |
| `web-app` | `unirefund-web-application` | Next.js/turbo — no React Native, out of scope |

Propagation is `git merge core/main` in each consumer; precedent is `342bfbe` (super-app) and
`de64fb4` (pos-app).

Shared files are byte-identical between `core` and `super-app` (modulo CRLF/LF) for
`SafeAreaView.tsx`, `Toast.tsx`, `BottomSheet.tsx`, `templates/Modal.tsx`, `+not-found.tsx`,
`CountrySelectionModal.tsx` and `PhoneCountrySelectionModal.tsx`. Only `TabPage.tsx` diverges
(super-app added a notifications bell).

## Design

### Tier 1 — `core`

Fix the shared layer first so both consumers inherit it.

#### `core/src/components/SafeAreaView.tsx`

Collapse to a single implementation on `react-native-safe-area-context`, matching pos-app's
proven version:

```tsx
import {
  NativeSafeAreaViewProps,
  SafeAreaView as SafeAreaViewContext,
} from "react-native-safe-area-context";

export function SafeAreaView({
  children,
  className,
  ...props
}: NativeSafeAreaViewProps) {
  return (
    <SafeAreaViewContext {...props} className={className}>
      {children}
    </SafeAreaViewContext>
  );
}
```

Removes the deprecated RN import, the platform branch, the duplicated `className` and the
nested `View`. `edges` starts working on iOS.

#### `core/src/components/Toast.tsx`

`bottomInset` currently defaults to a hardcoded `140` (line 140). Because a destructuring
default cannot read a hook called in the component body, resolve it explicitly:

```tsx
({ maxVisible = 3, closeLabel = "Close", onChange, bottomInset, ...props }, ref) => {
  const insets = useSafeAreaInsets();
  const resolvedBottomInset = bottomInset ?? insets.bottom + 90;
```

and pass `bottomInset={resolvedBottomInset}` to `BottomSheetModal`. The prop stays
overridable per call site.

`+ 90` clears the ~50px tab bar on every device while staying close to today's behaviour:
Android gesture nav (48) → 138 vs 140 today; iOS home indicator (34) → 124; legacy Android
(0) → 90.

#### `core/src/components/__tests__/Toast.test.tsx`

Introducing `useSafeAreaInsets` into `Toast` breaks this suite: it mocks
`@gorhom/bottom-sheet`, `../Ionicons` and `expo-haptics`, but not
`react-native-safe-area-context`. Without a `SafeAreaProvider` in the tree the hook throws.

Add the same mock `BottomSheet.test.tsx:41-42` already uses:

```tsx
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
```

With `bottom: 0` the resolved inset is `90`, so no existing assertion needs to change.
This suite passes at baseline in `core` (13 tests), so the fix is verifiable there.

#### `core/src/templates/Modal.tsx`

Port **only** the safe-area parts of pos-app's version:

- `edges={["top", "left", "right"]}` on the `SafeAreaView`, so the template owns the bottom
  inset rather than getting it implicitly.
- Bottom inset applied to whichever bottom element exists — the pinned action bar when there
  is one, otherwise the scroll content's `contentContainerStyle`.

Explicitly **not** ported: pos-app's `noScroll` and `footer` props, and its
`bg-background` → `bg-white` change. Those are pos-specific features and theming.
`TabPage.tsx:22` in super-app documents `bg-background` as a deliberate dark-mode fix, so
switching to `bg-white` would reintroduce a known regression.

#### `core/src/templates/TabPage.tsx`

Add `edges={["top", "left", "right"]}`. core's copy lacks it, so once `SafeAreaView` honours
`edges` this file would start double-padding above the tab bar.

#### `core/src/app/+not-found.tsx`

Outer `View` → `SafeAreaView`, same classes.

#### `core/src/components/BottomSheet.tsx`

No change. `bottomInset={insets.bottom + 10}` is already correct.

### Tier 2 — propagate

`git merge core/main` in each consumer. Two expected conflicts, both small:

- **super-app** — `TabPage.tsx`. Its copy has the notifications bell and *already* has
  `edges`, so resolution is keep-bell.
- **pos-app** — `Modal.tsx`. Keep its `noScroll` / `footer` / `bg-white`, take core's edge
  handling. Its `SafeAreaView.tsx` converges to what it already had.

Commits and merges are made locally in all three repos. **Nothing is pushed** — the user
reviews first.

### Tier 3 — super-app only

No `core` equivalent exists for any of these.

| File | Change |
|---|---|
| `src/components/QrScanner.tsx` | Add `useSafeAreaInsets`. Header `paddingTop: 52` → `insets.top + 12`; status block `bottom: 110` → `insets.bottom + 70`. Camera preview stays full-bleed. The two gate modals (permission, no-device) are centered content with no camera, so wrap those in `SafeAreaView`. |
| `src/screens/shared/_components/SearchTraveller/KycCameraModal.tsx` | Bottom control bar gets `paddingBottom: insets.bottom + 24`; permission branch gets `SafeAreaView`. |
| `src/screens/traveller/Cards/_components/CardScannerModal.tsx` | Same treatment as `KycCameraModal`. |
| `src/screens/shared/_components/SearchTraveller/SearchTraveller.tsx:147` | Outer `View` → `SafeAreaView`, same classes. |
| `src/screens/staff/StickerTag/_components/SearchMerchant.tsx:78` | Same. |
| `src/screens/traveller/Validate/ClaimTagModal.tsx:142` | Same. |
| `src/app/(auth)/(modals)/scan-mrz.tsx` | `SafeAreaView` on both the loading branch and the main tree; drop hardcoded `pt-14` → `pt-4` and `pb-6` → `pb-2` now that insets are real. |
| `src/screens/shared/Explore/ExploreScreen.tsx:12` | Delete the local `Platform`-branched `SafeAreaView` alias; import the shared component. Behaviour identical, one less copy of the logic. |

Camera modals keep their preview edge-to-edge by design — insets are applied to chrome
(headers, button bars) only. Wrapping the whole modal would letterbox the preview with black
bars, a visual regression.

`QrScanner`'s status block uses `+ 70` rather than the `+ 90` used for `Toast`: the scanner is
a full-screen modal with no tab bar to clear, so `+ 70` (118 on Android gesture nav, 104 on
iOS, 70 on legacy Android) stays close to today's `110` while guaranteeing nav-bar clearance.
`+ 90` would push it 28pt higher than it sits today for no benefit.

## Out of scope

Deliberate exclusions, not oversights:

- `src/screens/shared/RoleGateScreen.tsx` — full-bleed animated panels, already correct via
  `useSafeAreaInsets`. A `SafeAreaView` would break the reveal animation.
- All `BottomSheet`-based sheets and modals (`AvatarModal`, `DeleteAccountModal`,
  `QrCodeModal`, `FilterSheet`, `LocationDetailSheet`, `TagFilterSheet`, `CartReviewSheet`,
  `SignatureSheet`, `AddBankSheet`, `AddCardSheet`, `DeleteTokenSheet`,
  `EditNicknameSheet`) — covered by `BottomSheet`'s existing `bottomInset`.
- `src/app/loading.tsx` — centered full-screen overlay with no edge content.
- `src/app/(public)/index.tsx` — returns a `Redirect`, renders no UI.
- `web-app` — not React Native.

## Behaviour changes to verify

Two changes are visible and intentional:

1. **iOS tab screens lose a spurious bottom inset.** `TabPage` has always requested
   `edges={["top", "left", "right"]}`; iOS silently ignored it. Fixing the primitive makes
   the request effective, removing double-padding above the tab bar.
2. **Scanner chrome moves.** Hardcoded `52` / `110` become inset-derived, so header and
   status-block positions shift by a few points per device.

## Verification

- `npm run typecheck` and `npm run lint` in `core`, `super-app` and `pos-app`.
- `npx jest` in `core` — `Toast.test.tsx` must stay green (13 tests) after the mock is added.
- `npx jest` in `super-app` and `pos-app` — must match the recorded baselines below exactly.
- `npm run ios` and `npm run android` for `super-app`, checking the two behaviour changes
  above plus each touched modal: `QrScanner`, `KycCameraModal`, `CardScannerModal`,
  `SearchTraveller`, `SearchMerchant`, `ClaimTagModal`, `scan-mrz`, `ExploreScreen`.
- No automated test covers layout or insets, so the visual checks are manual, per `AGENTS.md`.

### Recorded test baselines (2026-07-30, before any change)

| Repo | Result |
|---|---|
| `core` | `Toast.test.tsx`: 13 passed, 1 suite passed |
| `super-app` | **4 suites failed, 15 passed; 218 tests passed** |

`super-app`'s four failing suites are all its `.tsx` component tests — `BottomSheet`, `Button`,
`DebouncedPressable`, `Toast`. They fail at baseline with a `moduleNameMapper` configuration
error, because `jest.config.js` uses `preset: "jest-expo/node"` with
`testEnvironment: "node"`, which cannot resolve the `react-native` internals that
`@testing-library/react-native` requires. `core` uses `preset: "jest-expo"` and its component
tests pass.

**This is pre-existing and out of scope.** It is recorded here so the implementation is not
mistaken for the cause, and so "tests pass" is never claimed for `super-app`'s component
suites. The requirement is that the baseline does not get worse: still exactly 4 failed / 15
passed and 218 tests passing. It also means the `Toast` change can only be verified by test in
`core`, not in `super-app`.

Fixing `super-app`'s jest preset is a reasonable follow-up but is a separate concern from
safe-area coverage.

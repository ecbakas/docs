# Safe-Area Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every page and every modal in `super-app` respects safe-area insets, with the shared fixes landed upstream in `core` and propagated to `pos-app`.

**Architecture:** Three tiers. Tier 1 fixes the shared component layer in the `core` repo (the `core-mobile` upstream) — the `SafeAreaView` primitive itself is broken on iOS, so it must be fixed before anything can depend on it. Tier 2 propagates `core` into each consumer via `git merge core/main`, the established mechanism. Tier 3 fixes the eight `super-app`-only modals and pages that have no `core` equivalent.

**Tech Stack:** React Native 0.81.5, Expo ~54, Expo Router ~6, NativeWind 4 + Tailwind 3, `react-native-safe-area-context`, `@gorhom/bottom-sheet` 5, TypeScript 5.9 strict, Jest (`jest-expo`).

**Spec:** `docs/superpowers/specs/2026-07-30-safe-area-coverage-design.md`

## Execution status — COMPLETE (2026-07-31)

| Tier | Tasks | Status |
|---|---|---|
| 1 — `core` | 1-4 | ✅ **Complete**, final review clean. Branch `fix/safe-area-coverage`, 6 commits `0178c08..bc2165a`. Jest 42/9. **Not pushed.** |
| 2 — propagate to `super-app` | 5 | ✅ **Complete** — by **cherry-pick, not merge** (see the note in Task 5) |
| 3 — `super-app` only | 6-10 | ✅ **Complete**, all reviewed |
| — final review + fix wave | — | ✅ **Complete**. Branch `fix/safe-area-super-app`, 13 commits `157ab1a..e2ddfec`. Jest 262 passed, typecheck 0. **Not pushed.** |
| 2 — propagate to `pos-app` | 11 | ⛔ **Skipped** by user decision. `pos-app` untouched on `main`. |
| — device verification | 12 | ❌ **NOT RUN.** No iOS or Android build was executed; all visual claims are unverified on hardware. |

### Outstanding

1. **Task 12 device verification.** The two intentional visual changes — iOS tab screens losing their spurious bottom inset, and the scanner chrome shifting — remain unconfirmed on hardware, as does nav-bar clearance on all touched surfaces.
2. **Fix `super-app`'s jest preset** (`preset: "jest-expo/node"` + `testEnvironment: "node"`). This is the highest-value follow-up: the final review proved the safe-area guards are **entirely inert** in `super-app` — reverting both `SafeAreaView.tsx` and `templates/Modal.tsx` to their pre-change state left jest byte-identical at 262 passed, and a targeted run of the three guards reported `Tests: 0 total`. Fixing the preset would activate 7 suites. Out of scope for this plan.
3. **`super-app`'s `fix/safe-area-coverage` branch** (created during setup, before the target branch was reconsidered) accidentally collected an unrelated user commit, `4de9901 feat(tabs): scan from the center slot for every role`. Left untouched; needs the author to sort out.
4. Deferred minors, all triaged acceptable to carry, are itemised in the ledger.

Execution ledger, task briefs, reports and review packages are retained at
`super-app/.superpowers/sdd/2026-07-30-safe-area-coverage/` (gitignored) because Task 12
is still outstanding. It records every plan defect found during execution and the rulings made.

## Global Constraints

- **Three separate git repos.** `c:\unirefund\core` (remote `origin` = `core-mobile`), `c:\unirefund\super-app` (`origin` = `unirefund-mobile`, plus a `core` remote), `c:\unirefund\pos-app` (`origin` = `unirefund-pos`, plus a `core` remote). `c:\unirefund` itself is **not** a git repo. `web-app` is Next.js/turbo — never touch it.
- **Commit locally. Never push.** No `git push` in any task. The user reviews before anything leaves the machine.
- **All three working trees are clean at plan time.** Verify with `git status --porcelain` before starting any task; a dirty tree means something unexpected happened — stop and report.
- **Do not change `bg-background` to `bg-white`.** `super-app/src/templates/TabPage.tsx:22` carries a comment documenting `bg-background` as a deliberate dark-mode fix. pos-app's `Modal.tsx` uses `bg-white`; that is pos-specific and must not be ported into `core`.
- **Do not port pos-app's `noScroll` or `footer` props into `core`.** Safe-area changes only.
- **Styling:** NativeWind `className` with semantic tokens (`bg-background`, `text-foreground`, `text-muted`, `border-border`). Use `cn()` from `@/utils/cn` for conditional classes. Internal imports use the `@/*` alias.
- **Prettier:** `printWidth: 80`, `semi: true`, `singleQuote: false`, `trailingComma: "all"`, `tabWidth: 2`. After editing, run `npx prettier --write <files>` on the files you touched. All three repos have `core.autocrlf=true`, so working-tree files may be CRLF or LF; git normalizes to LF on commit, so mixed endings introduced by an edit are harmless but Prettier keeps them tidy.
- **Inset formulas** (use these exact values):
  - `Toast` default bottom inset: `insets.bottom + 90` (must clear the ~50px tab bar)
  - `QrScanner` status block: `insets.bottom + 70` (full-screen modal, no tab bar to clear)
  - `QrScanner` header: `insets.top + 12`
  - Camera modal bottom control bars: `insets.bottom + 24`
- **Recorded test baselines (2026-07-30, before any change).** These must not get worse:

  | Repo | Baseline |
  |---|---|
  | `core` | Jest: all suites pass, 34 tests at `0178c08`; **42 / 9 suites** after Tier 1. **Typecheck: 1 pre-existing error** (below). |
  | `super-app` | Re-measured 2026-07-31 on the real base `origin/main` `157ab1a`: **4 suites failed, 19 passed, 23 total; 262 tests passed. Typecheck: 0 errors (clean).** |

  > The earlier super-app figure (4 failed / 15 passed / 218 tests) was taken at `2a682b5`, before 14 commits of tenant-selection and quick-access-scan work landed and were merged via PR #3. **Use the 262-test figure.** The four failing suites are unchanged: `BottomSheet`, `Button`, `DebouncedPressable`, `Toast` — all `.tsx` component tests, all failing with the same pre-existing `moduleNameMapper` configuration error. Unlike `core`, super-app's **typecheck is clean**, so any typecheck error at all means the task introduced it.

- **`core`'s typecheck is NOT clean at baseline.** It reports exactly one error, verified present at base commit `0178c08`:

  ```
  src/app/(auth)/_layout.tsx(13,30): error TS2493: Tuple type '[string]' of length '1' has no element at index '2'.
  ```

  This is a `segment?.[2]` tab-bar visibility check, unrelated to safe area. **Do not fix it** — it is outside this plan's scope. Where a task below says "typecheck clean" for `core`, the correct expectation is **this one error and nothing else**. A second error means you introduced it.

  `super-app`'s four failing suites are `BottomSheet`, `Button`, `DebouncedPressable`, `Toast` — all its `.tsx` component tests. They fail at baseline with a `moduleNameMapper` configuration error because `jest.config.js` uses `preset: "jest-expo/node"` with `testEnvironment: "node"`, which cannot resolve the `react-native` internals `@testing-library/react-native` needs. **This is pre-existing and out of scope.** Never report "tests pass" for super-app's component suites. The bar after Task 5 is exactly 7 failed / 19 passed / 26 total and 262 tests passing, unchanged. (It was 4 failed / 19 passed / 23 total before Task 5; the three extra failing suites are core test files that arrived with the cherry-pick and cannot run under this preset.) Consequence: the `Toast` change is only verifiable by test in `core`.

---

## File Structure

**Tier 1 — `core` (shared, propagates):**

| File | Responsibility after change |
|---|---|
| `core/src/components/SafeAreaView.tsx` | Single cross-platform safe-area wrapper on `react-native-safe-area-context`. Honours `edges` on both platforms. |
| `core/src/components/Toast.tsx` | Toast stack; bottom offset derived from insets instead of a hardcoded `140`. |
| `core/src/components/__tests__/Toast.test.tsx` | Covers the new inset-derived default and the caller override. |
| `core/src/templates/Modal.tsx` | Modal page template; owns the bottom inset explicitly rather than implicitly. |
| `core/src/templates/TabPage.tsx` | Tab page template; insets top/left/right only, leaving the bottom to the tab bar. |
| `core/src/app/+not-found.tsx` | 404 page, inset. |

`core/src/components/BottomSheet.tsx` is **unchanged** — `bottomInset={insets.bottom + 10}` is already correct.

**Tier 3 — `super-app` only:**

| File | Responsibility after change |
|---|---|
| `super-app/src/components/QrScanner.tsx` | Full-screen scanner; chrome inset, camera preview still full-bleed. |
| `super-app/src/screens/shared/_components/SearchTraveller/KycCameraModal.tsx` | KYC camera modal; control bar inset, permission branch inset. |
| `super-app/src/screens/traveller/Cards/_components/CardScannerModal.tsx` | Card scanner modal; same treatment. |
| `super-app/src/screens/shared/_components/SearchTraveller/SearchTraveller.tsx` | Traveller search modal; root is a safe area. |
| `super-app/src/screens/staff/StickerTag/_components/SearchMerchant.tsx` | Merchant search modal; root is a safe area. |
| `super-app/src/screens/traveller/Validate/ClaimTagModal.tsx` | Claim-tag modal; root is a safe area. |
| `super-app/src/app/(auth)/(modals)/scan-mrz.tsx` | MRZ scan page; inset instead of hardcoded `pt-14` / `pb-6`. |
| `super-app/src/screens/shared/Explore/ExploreScreen.tsx` | Explore map; uses the shared primitive instead of a local platform-branched copy. |

**Untouched by design:** `super-app/src/screens/shared/RoleGateScreen.tsx` (full-bleed animated panels, already correct via `useSafeAreaInsets`; a `SafeAreaView` would break the reveal), every `BottomSheet`-based sheet, `super-app/src/app/loading.tsx` (centered overlay, no edge content), `super-app/src/app/(public)/index.tsx` (returns a `Redirect`).

---

### Task 1: Collapse the `SafeAreaView` primitive in `core`

The iOS branch uses React Native's deprecated `SafeAreaView`, which **ignores the `edges` prop**, and applies `className` twice — once on the outer view and again on a nested `View`. Every later task depends on `edges` actually working.

This is the version `pos-app` has run in production since `66529ae` (2026-04-20), so it is already proven to work with NativeWind `className` on iOS.

**Files:**
- Modify: `core/src/components/SafeAreaView.tsx` (whole file, 27 lines)

**Interfaces:**
- Consumes: nothing.
- Produces: `SafeAreaView` — a named export accepting `NativeSafeAreaViewProps` from `react-native-safe-area-context`, i.e. `children`, `className`, `edges?: readonly ("top" | "bottom" | "left" | "right")[]`, `mode?: "padding" | "margin"`, plus all `ViewProps`. Tasks 3, 4, 6, 8, 9, 10 rely on `edges` being honoured on **both** platforms.

**Test required.** An earlier draft of this plan claimed a test was infeasible because it would mean mocking `react-native-safe-area-context`, the module under test. **That was wrong** and was corrected during execution. Rendering the component with `@testing-library/react-native` — the pattern `Toast.test.tsx` already uses — needs **zero extra mocking**: the real library normalizes `edges` and passes it to the native `RNCSafeAreaView` node, where the test can assert it.

That assertion is exactly the load-bearing property. The deprecated RN `SafeAreaView` this task removes silently dropped `edges`; a test proving the prop reaches the native layer would have caught the original bug and guards the regression for every task that follows.

Create `core/src/components/__tests__/SafeAreaView.test.tsx` asserting that a rendered `<SafeAreaView edges={["top", "left"]} />` yields a native node whose `edges` prop is `{ top: "additive", right: "off", bottom: "off", left: "additive" }`. Match the surrounding test style.

- [ ] **Step 1: Record the baseline so you can prove nothing regressed**

```bash
cd /c/unirefund/core
git status --porcelain          # must print nothing
npx jest 2>&1 | tail -5
```

Expected: `Tests: 13 passed` for the Toast suite and every other suite green.

- [ ] **Step 2: Replace the whole file**

Overwrite `core/src/components/SafeAreaView.tsx` with:

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

This deletes the `Platform` import, the deprecated `SafeAreaView as RNSafeAreaView` import, the `View` import, the platform branch, the duplicated `className`, and the nested `View`.

- [ ] **Step 3: Confirm no caller was relying on the double-applied `className`**

The nested `View` meant padding/margin classes were applied twice on iOS. Removing it halves such spacing. Verify no `core` caller passes one:

```bash
cd /c/unirefund/core
grep -rn -A3 "<SafeAreaView" src --include=*.tsx | grep -E "className=" | grep -E "\bp-|\bpx-|\bpy-|\bpt-|\bpb-|\bm-|\bmx-|\bmy-"
```

Expected: **no output.** At plan time every `core` caller passes only `flex-1` and a `bg-*` token (`templates/Modal.tsx`, `templates/TabPage.tsx`, `app/(public)/onboarding.tsx`, `components/CountryInput/CountrySelectionModal.tsx`, `components/PhoneInput/PhoneCountrySelectionModal.tsx`), which are unaffected by double application. If this prints anything, stop and report — a caller's spacing will change and needs a decision.

- [ ] **Step 4: Format, typecheck, lint, test**

```bash
cd /c/unirefund/core
npx prettier --write src/components/SafeAreaView.tsx
npm run typecheck
npm run lint
npx jest 2>&1 | tail -5
```

Expected: typecheck and lint clean; test output identical to Step 1.

- [ ] **Step 5: Commit**

```bash
cd /c/unirefund/core
git add src/components/SafeAreaView.tsx
git commit -m "fix(safe-area): honour edges on iOS in the SafeAreaView primitive

React Native's SafeAreaView is deprecated and ignores the edges prop, so
TabPage's edges={['top','left','right']} silently padded the bottom too on
iOS, double-padding above the tab bar. The iOS branch also applied className
twice, once on the safe-area view and again on a nested View.

Collapse to react-native-safe-area-context on both platforms - the version
pos-app has shipped since 66529ae."
```

---

### Task 2: Derive `Toast`'s bottom offset from insets in `core`

`Toast` defaults `bottomInset` to a hardcoded `140`. Mounted at the root, it floats over both tab screens and modals. Replace the magic number with an inset-derived value that still clears the tab bar.

**Files:**
- Modify: `core/src/components/Toast.tsx` (imports; the destructuring at line ~140; the `bottomInset` prop passed at line ~345)
- Test: `core/src/components/__tests__/Toast.test.tsx` (extend the existing gorhom mock; add a `react-native-safe-area-context` mock; add two tests)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `Toast`'s public prop surface is unchanged — `bottomInset?: number` still comes from `BottomSheetModalProps` and still overrides. Only the **default** changes, from `140` to `insets.bottom + 90`.

A destructuring default cannot read a hook called in the component body, so `bottomInset` is destructured with no default and resolved afterwards.

- [ ] **Step 1: Write the failing tests**

In `core/src/components/__tests__/Toast.test.tsx`, first extend the existing gorhom mock so tests can read the props handed to the sheet. Add this declaration next to the existing `mockOnChange` (around line 10):

```tsx
const mockProps: { current?: Record<string, any> } = {};
```

and inside the existing `BottomSheetModal` mock factory, add one line after `mockOnChange.current = props.onChange;`:

```tsx
    mockProps.current = props;
```

Next add a `react-native-safe-area-context` mock alongside the existing `expo-haptics` mock. Use a non-zero `bottom` so the test proves the inset is actually added rather than coincidentally matching:

```tsx
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));
```

Then add this block inside the existing `describe("Toast", ...)`:

```tsx
  describe("bottomInset", () => {
    it("defaults to the bottom safe-area inset plus tab-bar clearance", () => {
      renderToast();
      // 34 (mocked inset) + 90 (tab-bar clearance) — not the old hardcoded 140.
      expect(mockProps.current?.bottomInset).toBe(124);
    });

    it("honours an explicit bottomInset from the caller", () => {
      renderToast({ bottomInset: 12 });
      expect(mockProps.current?.bottomInset).toBe(12);
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /c/unirefund/core
npx jest src/components/__tests__/Toast.test.tsx -t bottomInset
```

Expected: the first test FAILS with `Expected: 124, Received: 140`. The second test PASSES already (an explicit prop has always won).

- [ ] **Step 3: Implement the change**

In `core/src/components/Toast.tsx`, add the import after the existing `react-native` import block (around line 25):

```tsx
import { useSafeAreaInsets } from "react-native-safe-area-context";
```

Change the destructuring (currently at lines 136-142) from:

```tsx
    {
      maxVisible = 3,
      closeLabel = "Close",
      onChange,
      bottomInset = 140,
      ...props
    },
```

to:

```tsx
    {
      maxVisible = 3,
      closeLabel = "Close",
      onChange,
      bottomInset,
      ...props
    },
```

Then, immediately after the `const [items, setItems] = useState<ToastItem[]>([]);` line, add:

```tsx
    const insets = useSafeAreaInsets();
    // Clear the ~50px tab bar on every device instead of trusting a hardcoded
    // 140. Android gesture nav (48) -> 138, iOS home indicator (34) -> 124,
    // legacy Android (0) -> 90. Callers can still override.
    const resolvedBottomInset = bottomInset ?? insets.bottom + 90;
```

Finally, in the `<BottomSheetModal>` JSX (around line 345), change:

```tsx
        bottomInset={bottomInset}
```

to:

```tsx
        bottomInset={resolvedBottomInset}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd /c/unirefund/core
npx jest src/components/__tests__/Toast.test.tsx
```

Expected: PASS, **15 tests** (the original 13 plus the 2 new ones).

- [ ] **Step 5: Format, typecheck, lint, full test run**

```bash
cd /c/unirefund/core
npx prettier --write src/components/Toast.tsx src/components/__tests__/Toast.test.tsx
npm run typecheck
npm run lint
npx jest 2>&1 | tail -5
```

Expected: clean; every suite green.

- [ ] **Step 6: Commit**

```bash
cd /c/unirefund/core
git add src/components/Toast.tsx src/components/__tests__/Toast.test.tsx
git commit -m "fix(safe-area): derive the Toast bottom offset from insets

bottomInset defaulted to a hardcoded 140, which happens to clear the tab bar
on the author's device and nothing else. Resolve it from useSafeAreaInsets
instead - insets.bottom + 90 - keeping the prop overridable."
```

---

### Task 3: Let `templates/Modal` own its bottom inset in `core`

The template currently insets all four edges implicitly. With `edges` now working (Task 1), make it inset top/left/right and apply the bottom inset explicitly to whichever bottom element exists, so a pinned action button clears the Android nav bar under edge-to-edge. This is pos-app's approach, minus its `noScroll` / `footer` / `bg-white` specifics.

**Files:**
- Modify: `core/src/templates/Modal.tsx` (imports; line 84; the `ScrollView` at lines 114-121; the action `View` at line 126)

**Interfaces:**
- Consumes: `SafeAreaView` with a working `edges` prop (Task 1).
- Produces: `ModalTemplate`'s public props are unchanged — `title`, `description`, `children`, `backAction?`, `action?: { onPress, label }`, `headerRightComponent?`, `keyboardShouldPersistTaps?`. No consumer needs updating.

**Test required.** Add `core/src/templates/__tests__/Modal.test.tsx`. Do not mock `react-native-safe-area-context` — wrap the render in a real `SafeAreaProvider initialMetrics={...}` with a **non-zero** bottom inset, which is the library's documented pattern for testing `useSafeAreaInsets` consumers. Mock only `expo-router` (`router`, `useFocusEffect`) and `@/components/Ionicons`, the way `Toast.test.tsx` mocks its dependencies.

Three assertions are required. An earlier draft asked only for the first, which left the task's actual purpose untested — the reviewer caught it:

1. The native safe-area node receives `edges` with `bottom: "off"` and `top`/`left`/`right` additive. Catches someone reverting the `edges` prop.
2. **With** an `action` prop: the action bar's `paddingBottom` equals the supplied bottom inset, and the `ScrollView`'s `contentContainerStyle.paddingBottom` is `0`. This is the safety-critical path — it keeps a tappable button off the Android nav bar — and without this case a regression that deletes the style or hardcodes `0` passes the whole suite.
3. **Without** an `action` prop: the `ScrollView`'s `contentContainerStyle.paddingBottom` equals the supplied bottom inset.

Cases 2 and 3 together prove the `action ? 0 : insets.bottom` branch works in both directions. The non-zero inset matters — a zero inset would pass against a hardcoded `0` and prove nothing.

- [ ] **Step 1: Add the import**

In `core/src/templates/Modal.tsx`, after the `react-native-gesture-handler` import (line 16), add:

```tsx
import { useSafeAreaInsets } from "react-native-safe-area-context";
```

- [ ] **Step 2: Read the insets and note who owns the bottom**

Immediately after `const [isLoading, setIsLoading] = useState(false);`, add:

```tsx
  const insets = useSafeAreaInsets();
  // The bottom inset is owned here (SafeAreaView guards only the other edges),
  // applied to whichever bottom element exists so a pinned action clears the
  // Android nav bar under edge-to-edge. With no action, the scroll content
  // takes the padding instead.
```

- [ ] **Step 3: Restrict the safe area to the non-bottom edges**

Change line 84 from:

```tsx
    <SafeAreaView className="flex-1 bg-background">
```

to:

```tsx
    <SafeAreaView
      edges={["top", "left", "right"]}
      className="flex-1 bg-background"
    >
```

- [ ] **Step 4: Give the scroll content the bottom inset when nothing is pinned**

Change the `ScrollView` (lines 114-121) from:

```tsx
          <ScrollView
            className="flex-1 px-6"
            contentContainerStyle={{ flexGrow: 1 }}
            keyboardShouldPersistTaps={keyboardShouldPersistTaps}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
```

to:

```tsx
          <ScrollView
            className="flex-1 px-6"
            contentContainerStyle={{
              flexGrow: 1,
              paddingBottom: action ? 0 : insets.bottom,
            }}
            keyboardShouldPersistTaps={keyboardShouldPersistTaps}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
```

- [ ] **Step 5: Give the pinned action bar the bottom inset**

Change line 126 from:

```tsx
        <View className="px-6">
```

to:

```tsx
        <View className="px-6" style={{ paddingBottom: insets.bottom }}>
```

- [ ] **Step 6: Format, typecheck, lint, test**

```bash
cd /c/unirefund/core
npx prettier --write src/templates/Modal.tsx
npm run typecheck
npm run lint
npx jest 2>&1 | tail -5
```

Expected: clean; every suite green (15 Toast tests).

- [ ] **Step 7: Commit**

```bash
cd /c/unirefund/core
git add src/templates/Modal.tsx
git commit -m "fix(safe-area): own the bottom inset in the modal template

Inset top/left/right via SafeAreaView and apply the bottom inset directly to
whichever bottom element exists, so a pinned action button clears the Android
nav bar under edge-to-edge instead of sitting behind it."
```

---

### Task 4: Inset `templates/TabPage` and `+not-found` in `core`

`core`'s `TabPage` has no `edges` prop, so once Task 1 makes `edges` effective this file would start padding the bottom and double-pad above the tab bar. `+not-found` renders a bare `View`. Both are small, single-concern safe-area additions in the same repo.

**Files:**
- Modify: `core/src/templates/TabPage.tsx` (line 12)
- Modify: `core/src/app/+not-found.tsx` (imports; the outer `View`)

**Interfaces:**
- Consumes: `SafeAreaView` with a working `edges` prop (Task 1).
- Produces: `TabPage`'s props are unchanged — `title`, `children?`, `noPadding?`. `NotFoundScreen` remains a default export taking no props.

**Test required.** Same technique as Tasks 1 and 3. Add `core/src/templates/__tests__/TabPage.test.tsx` rendering `<TabPage title="t" />` and asserting the native safe-area node receives `edges` with `bottom: "off"` and `top`/`left`/`right` additive — the regression guard for the double-padding-above-the-tab-bar bug this task prevents. Mock whatever `TabPage` pulls in (`expo-router`, `@/components/Ionicons`) but **not** `react-native-safe-area-context`.

`+not-found.tsx` needs no test — it is a static screen with no safe-area logic beyond the wrapper itself, which Task 1's test already covers.

- [ ] **Step 1: Restrict `TabPage` to the non-bottom edges**

In `core/src/templates/TabPage.tsx`, change line 12 from:

```tsx
    <SafeAreaView className="flex-1 bg-background">
```

to:

```tsx
    <SafeAreaView
      className="flex-1 bg-background"
      edges={["top", "left", "right"]}
    >
```

The bottom edge belongs to the tab bar. `super-app`'s copy already has exactly this prop, which is why Task 5's conflict resolution is straightforward.

- [ ] **Step 2: Inset the 404 page**

Overwrite `core/src/app/+not-found.tsx` with:

```tsx
import { SafeAreaView } from "@/components/SafeAreaView";
import { Link, Stack } from "expo-router";
import { Text } from "react-native";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Not Found" }} />
      <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-background p-6">
        <Text className="text-2xl font-bold text-foreground">
          This screen doesn&apos;t exist.
        </Text>
        <Link href="/" className="font-semibold text-primary">
          Go to home screen
        </Link>
      </SafeAreaView>
    </>
  );
}
```

Note the `View` import is dropped — it is no longer used, and leaving it would fail lint.

- [ ] **Step 3: Format, typecheck, lint, test**

```bash
cd /c/unirefund/core
npx prettier --write src/templates/TabPage.tsx src/app/+not-found.tsx
npm run typecheck
npm run lint
npx jest 2>&1 | tail -5
```

Expected: clean; every suite green.

- [ ] **Step 4: Commit**

```bash
cd /c/unirefund/core
git add src/templates/TabPage.tsx src/app/+not-found.tsx
git commit -m "fix(safe-area): inset the tab template and the 404 page

TabPage had no edges prop, so with the primitive fixed it would pad the bottom
and double-pad above the tab bar. +not-found rendered a bare View."
```

---

### Task 5: Merge `core` into `super-app`

**Files:**
- Modify (by merge): `super-app/src/components/SafeAreaView.tsx`, `src/components/Toast.tsx`, `src/components/__tests__/Toast.test.tsx`, `src/templates/Modal.tsx`, `src/templates/TabPage.tsx`, `src/app/+not-found.tsx`

**Interfaces:**
- Consumes: Tasks 1-4, committed in `core` on `main`.
- Produces: a `super-app` working tree where `SafeAreaView` honours `edges`, so Tasks 6-10 can rely on it.

At plan time the committed blobs are byte-identical between `super-app` HEAD and `core/main` for every shared file except `TabPage.tsx` (`SafeAreaView.tsx` `88053421`, `Toast.tsx` `f80b91d9`, `BottomSheet.tsx` `d85a9724`, `Modal.tsx` `f76b4182`, `+not-found.tsx` `6ce8810a`, `Toast.test.tsx` `b0f7dffe`). So **one conflict is expected: `TabPage.tsx`.**

> **Do NOT use `git fetch core`.** `super-app`'s `core` remote points at GitHub (`core-mobile.git`), but Tasks 1-4 commit only to the local `c:/unirefund/core` working copy and the plan forbids pushing. Fetching the GitHub remote would return the pre-change commit and report "Already up to date", propagating nothing while appearing to succeed. Fetch the local path instead, as below.

> **CHERRY-PICK, DO NOT MERGE — corrected 2026-07-31 after a merge attempt was aborted.**
>
> An earlier draft of this task ran `git merge core-local/safe-area`. That is **wrong** and was proven so: the merge base is `88e8a0c`, so a merge replays **seven** commits, not six. The extra one is `0178c08 "Stop the native cookie jar deciding which tenant a request hits"` — core's own fix for a bug **`super-app` already fixed independently** in `82823e1` (present in this branch's history), touching exactly `src/actions/auth/actions.ts` and `src/actions/lib.ts`.
>
> A trial `git merge --no-commit --no-ff` produced **three** conflicts, not one: `TabPage.tsx` as expected, plus genuine conflicts in `actions.ts` and `lib.ts` requiring product judgment about which service-client factories and imports to keep. Merging would force reconciling two independent solutions to an already-solved problem, for no benefit to safe-area coverage.
>
> Cherry-picking the six safe-area commits brings exactly the intended change and nothing else. Consequence to accept knowingly: core's `0178c08` stays unmerged into `super-app`, which is correct — `super-app` has its own version — and the repo's usual `git merge core/main` convention is not followed here.

- [ ] **Step 1: Fetch from the local core repo and confirm the tree is clean**

```bash
cd /c/unirefund/super-app
git status --porcelain          # must print nothing
git fetch "c:/unirefund/core" fix/safe-area-coverage:refs/remotes/core-local/safe-area
git log --oneline core-local/safe-area -7
```

Expected: the six safe-area commits, plus `0178c08` beneath them.

- [ ] **Step 2: Confirm exactly which commits are missing, and that only one is unwanted**

```bash
cd /c/unirefund/super-app
git log --oneline HEAD..core-local/safe-area
```

Expected exactly seven lines: `bc2165a`, `305fbda`, `f27a95b`, `8e58bc6`, `9d89a49`, `647dc52`, and `0178c08`. If the list differs, stop and report — `core` has moved and that needs a decision.

- [ ] **Step 3: Cherry-pick the six safe-area commits, oldest first**

```bash
cd /c/unirefund/super-app
git cherry-pick 647dc52 9d89a49 8e58bc6 f27a95b 305fbda bc2165a
```

The first five should apply cleanly — `super-app`'s blobs for `SafeAreaView.tsx`, `Toast.tsx`, `Toast.test.tsx` and `Modal.tsx` are byte-identical to core's pre-change versions, and the new test files do not exist here yet. **Expect one conflict, on `bc2165a`, in `src/templates/TabPage.tsx`.**

- [ ] **Step 4: Resolve the `TabPage.tsx` conflict**

`super-app`'s copy has a notifications bell and **already** has `edges={["top", "left", "right"]}`; core's commit adds only that same prop. So keep `super-app`'s version:

```bash
cd /c/unirefund/super-app
git checkout --ours src/templates/TabPage.tsx
git add src/templates/TabPage.tsx
```

Note `+not-found.tsx` is also part of `bc2165a` and should apply cleanly — do not discard it while resolving. Confirm both outcomes:

```bash
grep -n "edges\|useNotifications\|unseenCount" src/templates/TabPage.tsx
grep -n "SafeAreaView" src/app/+not-found.tsx
```

Expected: `edges={["top", "left", "right"]}` plus the `useNotifications` import and `unseenCount` badge in `TabPage.tsx`; `SafeAreaView` imported and used in `+not-found.tsx`.

- [ ] **Step 5: Verify nothing else is conflicted, then finish the cherry-pick**

```bash
cd /c/unirefund/super-app
git diff --name-only --diff-filter=U      # must print nothing
git cherry-pick --continue --no-edit
git log --oneline -7
```

- [ ] **Step 6: Confirm the shared files actually arrived**

```bash
cd /c/unirefund/super-app
grep -c "Platform" src/components/SafeAreaView.tsx || echo "0 (correct - platform branch gone)"
grep -n "resolvedBottomInset" src/components/Toast.tsx
grep -n "edges" src/templates/Modal.tsx
```

Expected: no `Platform` in `SafeAreaView.tsx`; `resolvedBottomInset` present in `Toast.tsx`; `edges` present in `Modal.tsx`.

- [ ] **Step 7: Typecheck, lint, and confirm the test baseline has not worsened**

```bash
cd /c/unirefund/super-app
npm run typecheck
npm run lint
npx jest 2>&1 | grep -E "^Tests:|^Test Suites:"
```

Expected: typecheck clean (**0 errors** — super-app's typecheck, unlike core's, has no pre-existing failures) and lint clean. Jest: **`Test Suites: 4 failed, 19 passed, 23 total` and `Tests: 262 passed, 262 total`** — identical to the re-measured baseline on `origin/main` `157ab1a`. The four failures are the pre-existing `jest-expo/node` config problem described in Global Constraints, **not** anything this merge did.

The merge brings in `core`'s new test files (`SafeAreaView.test.tsx`, `templates/__tests__/Modal.test.tsx`, `templates/__tests__/TabPage.test.tsx`). Under super-app's broken `jest-expo/node` preset these will very likely fail with the same `Configuration error` as the other `.tsx` suites — **that is expected and is not a regression**, but it means the suite count will rise. Record the exact new numbers and report them; do not try to fix the preset, which is explicitly out of scope.

---

### Task 6: Inset the `QrScanner` chrome in `super-app`

Three `<Modal>`s in one file. The scanning modal positions its header with a hardcoded `paddingTop: 52` and its status block with `bottom: 110` — both wrong on any device whose insets differ. The camera preview must stay full-bleed; only the chrome moves. The two gate modals (permission denied, no device) are centered content with no camera, so they get a real `SafeAreaView`.

**Files:**
- Modify: `super-app/src/components/QrScanner.tsx` (imports; the two gate modals at lines ~153 and ~178; the `statusBlock` and `header` style entries)

**Interfaces:**
- Consumes: `SafeAreaView` with a working `edges` prop (Tasks 1, 5).
- Produces: `QrScanner`'s props are unchanged — `visible`, `onScanned`, `onCancel`, `codeTypes?`, `isValid?`, `title?`, `subtitle?`, `onManualEntry?`, `manualEntryLabel?`.

`statusBlock` and `header` currently live in the `StyleSheet.create` block at the bottom of the file. Their inset-dependent values must move inline, because a `StyleSheet` is created at module scope where hooks cannot run.

- [ ] **Step 1: Add the imports**

After the existing `react-native-vision-camera` import block, add:

```tsx
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SafeAreaView } from "@/components/SafeAreaView";
```

- [ ] **Step 2: Read the insets**

Inside `QrScanner`, immediately after `const device = useCameraDevice("back");`, add:

```tsx
  const insets = useSafeAreaInsets();
```

This must sit above the `if (!visible) return null;` early return so the hook runs unconditionally on every render.

- [ ] **Step 3: Inset the permission gate modal**

Change the permission modal (line ~153) from:

```tsx
      <Modal visible statusBarTranslucent animationType="fade">
        <View style={s.permScreen}>
```

to:

```tsx
      <Modal visible statusBarTranslucent animationType="fade">
        <SafeAreaView style={s.permScreen}>
```

and its closing tag from `</View>` to `</SafeAreaView>`. This modal has no camera, so insetting the whole surface is correct.

- [ ] **Step 4: Inset the no-device gate modal**

Change the no-device modal (line ~178) from:

```tsx
      <Modal visible statusBarTranslucent animationType="fade">
        <View style={s.permScreen}>
          <ActivityIndicator color="#fff" size="large" />
        </View>
      </Modal>
```

to:

```tsx
      <Modal visible statusBarTranslucent animationType="fade">
        <SafeAreaView style={s.permScreen}>
          <ActivityIndicator color="#fff" size="large" />
        </SafeAreaView>
      </Modal>
```

- [ ] **Step 5: Move the status block's offset inline**

In the scanning modal, change:

```tsx
        <View style={s.statusBlock}>
```

to:

```tsx
        <View style={[s.statusBlock, { bottom: insets.bottom + 70 }]}>
```

Then delete the `bottom: 110` line from the `statusBlock` entry in the `StyleSheet.create` block, leaving:

```tsx
  statusBlock: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 24,
  },
```

`+ 70` rather than Toast's `+ 90`: this is a full-screen modal with no tab bar to clear, so `+ 70` (118 on Android gesture nav, 104 on iOS, 70 on legacy Android) stays close to today's `110` while still guaranteeing nav-bar clearance.

- [ ] **Step 6: Move the header's top padding inline**

Change:

```tsx
        <View style={s.header}>
```

to:

```tsx
        <View style={[s.header, { paddingTop: insets.top + 12 }]}>
```

Then delete the `paddingTop: 52` line from the `header` entry in `StyleSheet.create`, leaving:

```tsx
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
```

- [ ] **Step 7: Confirm no hardcoded inset values remain**

```bash
cd /c/unirefund/super-app
grep -n "paddingTop: 52\|bottom: 110" src/components/QrScanner.tsx
```

Expected: **no output.**

- [ ] **Step 8: Format, typecheck, lint, test**

```bash
cd /c/unirefund/super-app
npx prettier --write src/components/QrScanner.tsx
npm run typecheck
npm run lint
npx jest 2>&1 | grep -E "^Tests:|^Test Suites:"
```

Expected: typecheck and lint clean; Jest still exactly `7 failed, 19 passed, 26 total` / `262 passed` (the post-Task-5 baseline).

- [ ] **Step 9: Commit**

```bash
cd /c/unirefund/super-app
git add src/components/QrScanner.tsx
git commit -m "fix(safe-area): inset the QrScanner chrome

The header's paddingTop: 52 and the status block's bottom: 110 were guesses
that only hold on one device. Derive both from useSafeAreaInsets and inset the
two permission gate modals. The camera preview stays full-bleed by design."
```

---

### Task 7: Inset the camera modal control bars in `super-app`

Both modals put their capture/cancel buttons in an `absolute bottom-0` bar that sits behind the Android nav bar under edge-to-edge, and both have a permission branch with no camera. Same defect, same fix, so they land together.

**Files:**
- Modify: `super-app/src/screens/shared/_components/SearchTraveller/KycCameraModal.tsx` (imports; the permission branch at line ~93; the control bar at line ~118)
- Modify: `super-app/src/screens/traveller/Cards/_components/CardScannerModal.tsx` (imports; the permission branch at line ~95; the control bar at line ~125)

**Interfaces:**
- Consumes: `SafeAreaView` with a working `edges` prop (Tasks 1, 5).
- Produces: no prop changes. `KycCameraModal` keeps `{ visible, onClose, onResolved }`; `CardScannerModal` keeps its existing props.

The outer `<View className="flex-1 bg-black">` stays a plain `View` in both files — insetting it would letterbox the camera preview with black bars.

- [ ] **Step 1: Add the imports to `KycCameraModal.tsx`**

After the existing `react-native` import (line 10), add:

```tsx
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SafeAreaView } from "@/components/SafeAreaView";
```

- [ ] **Step 2: Read the insets in `KycCameraModal`**

After `const closedRef = useRef(false);`, add:

```tsx
  const insets = useSafeAreaInsets();
```

This must sit above `if (!visible) return null;`.

- [ ] **Step 3: Inset the permission branch in `KycCameraModal`**

Change:

```tsx
          <View className="flex-1 items-center justify-center gap-4 p-8">
```

to:

```tsx
          <SafeAreaView className="flex-1 items-center justify-center gap-4 p-8">
```

and its matching closing `</View>` to `</SafeAreaView>`. This branch shows only text and two buttons — no camera — so insetting the whole surface is right.

- [ ] **Step 4: Inset the control bar in `KycCameraModal`**

Change:

```tsx
            <View className="absolute bottom-0 left-0 right-0 items-center gap-3 p-6">
```

to:

```tsx
            <View
              className="absolute bottom-0 left-0 right-0 items-center gap-3 px-6 pt-6"
              style={{ paddingBottom: insets.bottom + 24 }}
            >
```

`p-6` becomes `px-6 pt-6` so the inline `paddingBottom` is not fighting a Tailwind `padding` shorthand for the same edge.

- [ ] **Step 5: Apply Steps 1-4 to `CardScannerModal.tsx`**

Identical treatment. Add the same two imports after the `react-native` import (line 9). Add `const insets = useSafeAreaInsets();` above `if (!visible) return null;`. Change the permission branch's `<View className="flex-1 items-center justify-center gap-4 p-8">` to `<SafeAreaView ...>` with a matching `</SafeAreaView>`. Change the control bar from:

```tsx
            <View className="absolute bottom-0 left-0 right-0 items-center gap-3 p-6">
```

to:

```tsx
            <View
              className="absolute bottom-0 left-0 right-0 items-center gap-3 px-6 pt-6"
              style={{ paddingBottom: insets.bottom + 24 }}
            >
```

Leave the framing-guide overlay (`<View className="absolute inset-0 items-center justify-center">`) untouched — it is centered on the preview and must stay aligned with it.

- [ ] **Step 6: Format, typecheck, lint, test**

```bash
cd /c/unirefund/super-app
npx prettier --write src/screens/shared/_components/SearchTraveller/KycCameraModal.tsx src/screens/traveller/Cards/_components/CardScannerModal.tsx
npm run typecheck
npm run lint
npx jest 2>&1 | grep -E "^Tests:|^Test Suites:"
```

Expected: typecheck and lint clean; Jest still exactly `7 failed, 19 passed, 26 total` / `262 passed` (the post-Task-5 baseline).

- [ ] **Step 7: Commit**

```bash
cd /c/unirefund/super-app
git add src/screens/shared/_components/SearchTraveller/KycCameraModal.tsx src/screens/traveller/Cards/_components/CardScannerModal.tsx
git commit -m "fix(safe-area): inset the camera modal control bars

Both modals pinned their capture/cancel buttons to bottom-0, behind the
Android nav bar under edge-to-edge. Inset the bars and the camera-less
permission branches; the previews stay full-bleed."
```

---

### Task 8: Make the three form modals safe areas in `super-app`

Each renders `<View className="flex-1 bg-background p-4 gap-4">` directly inside a `<Modal>`, so its title row sits under the status bar. All three take the same one-line swap.

**Files:**
- Modify: `super-app/src/screens/shared/_components/SearchTraveller/SearchTraveller.tsx` (import line 26; open tag line 147; close tag line 268)
- Modify: `super-app/src/screens/staff/StickerTag/_components/SearchMerchant.tsx` (import line 9; open tag line 78; close tag line 136)
- Modify: `super-app/src/screens/traveller/Validate/ClaimTagModal.tsx` (imports; open tag line 143; close tag line 260)

**Interfaces:**
- Consumes: `SafeAreaView` (Tasks 1, 5).
- Produces: no prop changes to any of the three components.

Note `ClaimTagModal` has a **second** outer `<View>` at line 279 that closes a fragment wrapping the modal plus sibling content — that one is not inside the `<Modal>` and must not be touched. Only the `View` opened at line 143 changes.

- [ ] **Step 1: Swap the root in `SearchTraveller.tsx`**

Add the import:

```tsx
import { SafeAreaView } from "@/components/SafeAreaView";
```

Change line 147 from:

```tsx
      <View className="flex-1 bg-background p-4 gap-4">
```

to:

```tsx
      <SafeAreaView className="flex-1 bg-background p-4 gap-4">
```

and the matching close at line 268 from `</View>` to `</SafeAreaView>`.

`View` is still used elsewhere in this file (lines 155, 180, 221), so keep it in the `react-native` import.

- [ ] **Step 2: Swap the root in `SearchMerchant.tsx`**

Add the same import. Change line 78 from:

```tsx
      <View className="flex-1 bg-background p-4 gap-4">
```

to:

```tsx
      <SafeAreaView className="flex-1 bg-background p-4 gap-4">
```

and the matching close at line 136 from `</View>` to `</SafeAreaView>`. `View` is still used at line 86, so keep the import.

- [ ] **Step 3: Swap the modal root in `ClaimTagModal.tsx`**

Add the same import. Change line 143 from:

```tsx
        <View className="flex-1 bg-background p-4 gap-4">
```

to:

```tsx
        <SafeAreaView className="flex-1 bg-background p-4 gap-4">
```

and the matching close at line 260 from `</View>` to `</SafeAreaView>`.

**Leave line 279's `</View>` alone** — it closes the outer wrapper around the whole component, outside the `<Modal>`.

- [ ] **Step 4: Verify the JSX still balances**

```bash
cd /c/unirefund/super-app
npm run typecheck
```

Expected: clean. A mismatched open/close tag surfaces here as a TS syntax error, which is the real check that the three swaps were paired correctly.

- [ ] **Step 5: Format, lint, test**

```bash
cd /c/unirefund/super-app
npx prettier --write src/screens/shared/_components/SearchTraveller/SearchTraveller.tsx src/screens/staff/StickerTag/_components/SearchMerchant.tsx src/screens/traveller/Validate/ClaimTagModal.tsx
npm run lint
npx jest 2>&1 | grep -E "^Tests:|^Test Suites:"
```

Expected: lint clean (in particular, no `'View' is defined but never used`); Jest still exactly `7 failed, 19 passed, 26 total` / `262 passed` (the post-Task-5 baseline).

- [ ] **Step 6: Commit**

```bash
cd /c/unirefund/super-app
git add src/screens/shared/_components/SearchTraveller/SearchTraveller.tsx src/screens/staff/StickerTag/_components/SearchMerchant.tsx src/screens/traveller/Validate/ClaimTagModal.tsx
git commit -m "fix(safe-area): make the three full-screen form modals safe areas

SearchTraveller, SearchMerchant and ClaimTagModal each rendered a bare View
inside a Modal, putting the title row under the status bar."
```

---

### Task 9: Inset the `scan-mrz` page in `super-app`

The only route file left rendering a bare `View`. It fakes insets with a hardcoded `pt-14` header and `pb-6` footer.

**Files:**
- Modify: `super-app/src/app/(auth)/(modals)/scan-mrz.tsx` (imports; the loading branch; the main tree; the header's `pt-14`; the action row's `pb-6`)

**Interfaces:**
- Consumes: `SafeAreaView` (Tasks 1, 5).
- Produces: no changes to the route's exported `options` or its default export `ScanIdentifier`.

- [ ] **Step 1: Add the import**

After the existing `react-native` import block, add:

```tsx
import { SafeAreaView } from "@/components/SafeAreaView";
```

- [ ] **Step 2: Inset the loading branch**

Change:

```tsx
      <View className="flex-1 bg-white justify-center items-center gap-4">
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text className="text-gray-700 text-base font-medium">
          Belge taranıyor...
        </Text>
      </View>
```

to:

```tsx
      <SafeAreaView className="flex-1 bg-white justify-center items-center gap-4">
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text className="text-gray-700 text-base font-medium">
          Belge taranıyor...
        </Text>
      </SafeAreaView>
```

- [ ] **Step 3: Inset the main tree**

Change the outer `<View className="flex-1 bg-gray-50">` to:

```tsx
    <SafeAreaView className="flex-1 bg-gray-50">
```

and its matching closing `</View>` — the last one before `);`, after the upload-overlay block — to `</SafeAreaView>`.

- [ ] **Step 4: Drop the faked header inset**

The header row hardcodes `pt-14` to clear the status bar. With a real inset that becomes double padding. Change:

```tsx
        <View className="flex-row justify-between items-center px-5 pt-14 pb-4">
```

to:

```tsx
        <View className="flex-row justify-between items-center px-5 pt-4 pb-4">
```

- [ ] **Step 5: Drop the faked footer inset**

Change:

```tsx
        <View className="flex-row gap-3 pb-6">
```

to:

```tsx
        <View className="flex-row gap-3 pb-2">
```

- [ ] **Step 6: Verify nothing hardcoded remains, then typecheck**

```bash
cd /c/unirefund/super-app
grep -n "pt-14\|pb-6" "src/app/(auth)/(modals)/scan-mrz.tsx"
npm run typecheck
```

Expected: no `grep` output; typecheck clean.

- [ ] **Step 7: Format, lint, test**

```bash
cd /c/unirefund/super-app
npx prettier --write "src/app/(auth)/(modals)/scan-mrz.tsx"
npm run lint
npx jest 2>&1 | grep -E "^Tests:|^Test Suites:"
```

Expected: lint clean; Jest still exactly `7 failed, 19 passed, 26 total` / `262 passed` (the post-Task-5 baseline).

- [ ] **Step 8: Commit**

```bash
cd /c/unirefund/super-app
git add "src/app/(auth)/(modals)/scan-mrz.tsx"
git commit -m "fix(safe-area): inset the scan-mrz page

Replace the hardcoded pt-14 / pb-6 that stood in for insets with a real
SafeAreaView on both the loading branch and the main tree."
```

---

### Task 10: Drop `ExploreScreen`'s local `SafeAreaView` copy in `super-app`

The screen reimplements the platform branch the shared component already owns. Behaviour is identical; this removes the duplicate so the fix from Task 1 is not silently bypassed here.

**Files:**
- Modify: `super-app/src/screens/shared/Explore/ExploreScreen.tsx` (lines 5, 7, 12)

**Interfaces:**
- Consumes: `SafeAreaView` (Tasks 1, 5).
- Produces: no prop changes. `ExploreScreen` remains a default export taking no props.

The floating header stays wrapped and the map stays full-bleed — that layout is deliberate and does not change.

- [ ] **Step 1: Replace the local alias with the shared import**

Change line 5 from:

```tsx
import { Platform, SafeAreaView as SafeAreaViewNative, Text, View } from "react-native";
```

to:

```tsx
import { Text, View } from "react-native";
```

Delete line 7 entirely:

```tsx
import { SafeAreaView as SafeAreaViewContext } from "react-native-safe-area-context";
```

Delete line 12 entirely:

```tsx
const SafeAreaView = Platform.OS === "android" ? SafeAreaViewContext : SafeAreaViewNative;
```

And add, alongside the other `@/` imports:

```tsx
import { SafeAreaView } from "@/components/SafeAreaView";
```

The `<SafeAreaView className="flex-1 flex-row items-center justify-between">` usage at line ~83 needs no change — it now resolves to the shared component.

- [ ] **Step 2: Confirm the local copy is gone**

```bash
cd /c/unirefund/super-app
grep -n "Platform\|SafeAreaViewNative\|SafeAreaViewContext" src/screens/shared/Explore/ExploreScreen.tsx
```

Expected: **no output.**

- [ ] **Step 3: Format, typecheck, lint, test**

```bash
cd /c/unirefund/super-app
npx prettier --write src/screens/shared/Explore/ExploreScreen.tsx
npm run typecheck
npm run lint
npx jest 2>&1 | grep -E "^Tests:|^Test Suites:"
```

Expected: typecheck and lint clean (in particular no unused-import error for `Platform`); Jest still exactly `7 failed, 19 passed, 26 total` / `262 passed` (the post-Task-5 baseline).

- [ ] **Step 4: Commit**

```bash
cd /c/unirefund/super-app
git add src/screens/shared/Explore/ExploreScreen.tsx
git commit -m "refactor(safe-area): use the shared SafeAreaView in ExploreScreen

The screen carried its own platform-branched copy of logic the shared
component already owns, which would have bypassed the primitive fix."
```

---

### Task 11: Merge `core` into `pos-app`

> **SKIPPED — user decision, 2026-07-30.** The user scoped this work to `core` + `super-app` only. `pos-app` stays on `main`, untouched; its `SafeAreaView` is already the fixed version, so it loses nothing, and nothing in `super-app` depends on this task. **Do not run this task.** It is retained below so the merge can be performed later without re-deriving it.
>
> If it is ever run: `pos-app`'s `core` remote also points at GitHub, so the same correction as Task 5 applies — fetch the local path (`git fetch "c:/unirefund/core" fix/safe-area-coverage:refs/remotes/core-local/safe-area`) rather than `git fetch core`, and merge `core-local/safe-area`.

**Files:**
- Modify (by merge): `pos-app/src/components/SafeAreaView.tsx`, `src/components/Toast.tsx`, `src/components/__tests__/Toast.test.tsx`, `src/templates/Modal.tsx`, `src/templates/TabPage.tsx`, `src/app/+not-found.tsx`

**Interfaces:**
- Consumes: Tasks 1-4, committed in `core` on `main`.
- Produces: `pos-app` on the same shared component layer, with its own `noScroll` / `footer` / `bg-white` specifics preserved.

`pos-app`'s `SafeAreaView.tsx` already matches what Task 1 produces, so it converges. Its `Modal.tsx` genuinely diverges (it has `noScroll`, `footer`, `bg-white`, and its own inset handling), so **expect a conflict there.**

- [ ] **Step 1: Fetch and confirm the tree is clean**

```bash
cd /c/unirefund/pos-app
git status --porcelain          # must print nothing
git fetch core
git diff --stat HEAD...core/main
```

- [ ] **Step 2: Record the pre-merge test baseline**

```bash
cd /c/unirefund/pos-app
npx jest 2>&1 | grep -E "^Tests:|^Test Suites:"
```

Write the numbers down — Step 6 compares against them. They were not captured at plan time.

- [ ] **Step 3: Merge**

```bash
cd /c/unirefund/pos-app
git merge core/main -m "Merge core/main into main: safe-area coverage"
```

Expected: a conflict in `src/templates/Modal.tsx`. `SafeAreaView.tsx` may or may not conflict; if it does, take `core`'s version, which is byte-equivalent to what pos-app already had.

- [ ] **Step 4: Resolve `Modal.tsx` by hand**

Do **not** use `--ours` or `--theirs` here; both sides carry wanted changes. Open the file and produce a version that keeps:

- pos-app's `noScroll` and `footer` props, and their JSX branches
- pos-app's `bg-white` on the `SafeAreaView` (pos-specific; do not change it to `bg-background`)
- pos-app's `hasPinnedBottom` logic, which already accounts for both `footer` and `action`
- `edges={["top", "left", "right"]}` on the `SafeAreaView`

In practice pos-app's existing `Modal.tsx` is already a superset of what Task 3 added to `core`, so keeping pos-app's file wholesale is usually correct. Verify that explicitly:

```bash
cd /c/unirefund/pos-app
grep -n "edges\|insets.bottom\|noScroll\|footer" src/templates/Modal.tsx
```

Expected: `edges={["top", "left", "right"]}` present; `insets.bottom` applied to the action bar and the footer; `noScroll` and `footer` branches intact.

- [ ] **Step 5: Complete the merge**

```bash
cd /c/unirefund/pos-app
git diff --name-only --diff-filter=U      # must print nothing
git add -A
git commit --no-edit
```

- [ ] **Step 6: Typecheck, lint, test**

```bash
cd /c/unirefund/pos-app
npm run typecheck
npm run lint
npx jest 2>&1 | grep -E "^Tests:|^Test Suites:"
```

Expected: typecheck and lint clean. Jest must be **no worse** than the Step 2 numbers, and `Toast.test.tsx` should now run 15 tests rather than 13 (it inherits the two new ones from Task 2).

---

### Task 12: Verify on device and report

Nothing in this plan is covered by an automated layout test, so the visual claims have to be earned on real builds. Two changes are intentional and visible; confirm both.

**Files:** none modified.

**Interfaces:**
- Consumes: Tasks 1-10 (and 11 if run).
- Produces: the completion report.

- [ ] **Step 1: Final static checks across the repos you touched**

```bash
cd /c/unirefund/core && npm run typecheck && npm run lint && npx jest 2>&1 | grep -E "^Tests:|^Test Suites:"
cd /c/unirefund/super-app && npm run typecheck && npm run lint && npx jest 2>&1 | grep -E "^Tests:|^Test Suites:"
```

Expected: `core` fully green with 15 Toast tests. `super-app` exactly `4 failed, 15 passed` / `218 passed` — the recorded baseline, unchanged.

- [ ] **Step 2: Build and check on Android (edge-to-edge is enabled there, so this is the important one)**

```bash
cd /c/unirefund/super-app
npm run android
```

Walk each touched surface and confirm no content sits under the status bar or the nav bar:

- A tab screen (home, tags, explore, faq, profile) — header clear of the status bar, content clear of the tab bar
- A modal screen (edit profile, cards, tag detail) — title clear at top, action button clear of the nav bar
- `QrScanner` — camera still fills the screen; header and subtitle clear of system bars
- `KycCameraModal` and `CardScannerModal` — capture/cancel buttons clear of the nav bar; preview still full-bleed
- `SearchTraveller`, `SearchMerchant`, `ClaimTagModal` — title rows clear of the status bar
- `scan-mrz` — header clear of the status bar, action row clear of the nav bar; no doubled padding now `pt-14` is gone
- A toast (trigger any success/error) — floats above the tab bar, not behind the nav bar
- `RoleGateScreen` (clear app data or reset the role preference) — **unchanged**; the reveal animation still plays and the panels are still full-bleed

- [ ] **Step 3: Build and check on iOS — specifically the intentional behaviour change**

```bash
cd /c/unirefund/super-app
npm run ios
```

`TabPage` has always requested `edges={["top", "left", "right"]}`; iOS silently ignored it, so tab screens carried a spurious bottom inset and double-padded above the tab bar. That padding is now gone. Confirm tab screens look correct and tighter, not broken. Then re-walk the Step 2 list.

- [ ] **Step 4: Report honestly**

State plainly:

- Which repos have local commits, and that **nothing was pushed**
- `core`: fully green, 15 Toast tests
- `super-app`: typecheck and lint clean; Jest at the recorded baseline of 4 failed / 15 passed / 218 tests passing — and that **those four failures are pre-existing**, caused by `jest.config.js` using `preset: "jest-expo/node"`, not by this work
- Whether Task 11 (pos-app) was run or skipped
- Which surfaces you actually verified on device and which you did not. If a build did not run — no simulator, no emulator — say so explicitly rather than implying the visual checks passed.
- The follow-up left on the table: fixing `super-app`'s jest preset so its four component suites run again.

---

## Notes for the implementer

**Why `core` first.** The `SafeAreaView` primitive is broken. Fixing call sites before fixing it would mean writing code against a component that ignores `edges` on iOS, and every such fix would need revisiting.

**Insets are added to existing padding, not substituted for it.** `react-native-safe-area-context`'s `SafeAreaView` adds the inset on top of whatever padding the style already specifies. So the form modals in Task 8 keep their `p-4` and gain the inset on top (16 + 47 = 63pt of top padding on an iOS notch device), the `+not-found` page keeps `p-6`, and the camera permission branches keep `p-8`. This is expected and correct — a title row should not hug the notch. Do not "fix" the extra space by stripping the padding class. `pos-app/src/screens/(auth)/Home/HomeScreen.tsx:21` has shipped `<SafeAreaView className="flex-1 bg-white p-4">` against this exact component since April, which is the working proof.

The one place padding *was* being applied twice is the old iOS branch removed in Task 1, which duplicated `className` onto a nested `View`. Task 1 Step 3 verifies no `core` caller depended on that.

**Why some tasks have no test.** These are JSX-structure and layout changes. `super-app` has no working component-test harness (see Global Constraints) and no inset-rendering harness exists in any of the three repos. Where a behavioural assertion *is* possible — `Toast`'s resolved `bottomInset` — Task 2 does it properly, test-first. Everywhere else the honest verification is typecheck, lint, unchanged suites, and the device walk in Task 12. Do not invent tests that assert nothing, and do not claim visual correctness you have not seen.

**On the `super-app` Jest baseline.** Four suites fail before you start. Re-read that table before reporting anything about tests. "Tests pass" is not a true statement about `super-app`'s component suites, and the merge in Task 5 is not what broke them.

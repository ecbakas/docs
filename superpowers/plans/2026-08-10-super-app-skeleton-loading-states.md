# Skeleton Loading States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 11 first-load spinner states in `super-app` with skeletons that mirror the content about to replace them, all built from one shared static primitive.

**Architecture:** A pure class-composition module (`skeletonClassName.ts`) plus a two-component primitive (`Skeleton.tsx`) supply every skeleton in the app. Each of the 11 conversion sites gets a small colocated skeleton component rendered as a *child* of its existing `TabPage`/`ModalTemplate`/`Modal`. The two skeletons that already exist are retrofitted onto the primitive before any new ones are written, so a flaw in the primitive surfaces in 2 components rather than 13.

**Tech Stack:** React Native, Expo, expo-router, NativeWind (Tailwind classes via `className`), `react-native-safe-area-context`, Jest (two projects: `node` and `router`), `@testing-library/react-native`.

## Global Constraints

- **Anything that renders must be named `*.router.test.tsx`.** Per `jest.config.js:8-14`, the `node` project cannot render — a rendered component reaches nativewind's web JSX runtime, which needs `react-native-web` (not a dependency), and `@testing-library/react-native` cannot even be imported there. A plain `.test.tsx` that renders will fail to load.
- **`npm run init` must run after adding an i18n key**, before `npx tsc --noEmit` will accept it. It regenerates `src/data/language-data/*.gen.json`.
- **Never edit `src/data/language-data/*.gen.json` by hand.** Author in `src/localization/resources/{en-US,tr-TR}.json`.
- **Baseline failures — do not read as regressions.** 7 suites under `src/components/__tests__` and `src/templates/__tests__` fail to load before any change (wrong Jest project). `npm test` also picks up sibling worktrees' tests.
- **No animation anywhere.** No `reanimated`, no pulse, no shimmer. Static blocks only.
- **A skeleton never renders its own `SafeAreaView`.** Every skeleton in this plan is a child of a template that already declares `edges={["top", "left", "right"]}`. `AppShellSkeleton` is the sole exception and keeps its own.
- **Never early-return a skeleton above its template.** The loading branch must return the full `ModalTemplate`/`TabPage` with the skeleton as a child, as `TagDetailScreen.tsx:193-203` already does.
- **Tints:** `bg-foreground/10` for foreground elements (text lines, icons, badges, avatars), `bg-foreground/5` for surfaces (cards, panels). Never `bg-border`.
- **No hardcoded user-visible text.** Read strings through `useLocalization()`.
- **Working directory for every command:** `c:\unirefund\super-app`.

---

## File Structure

**Created:**

| File | Responsibility |
| --- | --- |
| `src/components/skeletonClassName.ts` | Pure tint→class mapping. No React, no react-native import, so it is safe in the `node` Jest project. |
| `src/components/Skeleton.tsx` | `Skeleton` block and `SkeletonRoot` a11y wrapper. |
| `src/components/__tests__/skeletonClassName.test.ts` | `node` project. Tint mapping and override precedence. |
| `src/components/__tests__/Skeleton.router.test.tsx` | `router` project. Rendering and the single-progressbar contract. |
| `src/screens/traveller/Cards/_components/CardsSkeleton.tsx` | Conversion 1 |
| `src/screens/traveller/Documents/_components/DocumentsSkeleton.tsx` | Conversion 2 |
| `src/screens/shared/Notifications/_components/NotificationsSkeleton.tsx` | Conversion 3 |
| `src/components/TenantInput/TenantSelectionSkeleton.tsx` | Conversion 11 (flat file — `TenantInput/` has no `_components/`) |
| `src/screens/refund-point/Refund/_components/RefundableTagListSkeleton.tsx` | Conversion 10 |
| `src/screens/shared/Tags/TagDetail/_components/TagDetailSkeleton.tsx` | Conversion 4 |
| `src/screens/shared/_components/TagPreviewSkeleton.tsx` | Conversion 5 |
| `src/screens/traveller/Validate/_components/ClaimTagSkeleton.tsx` | Conversion 8 |
| `src/screens/staff/StickerTag/_components/StickerTagSkeleton.tsx` | Conversion 7 |
| `src/screens/merchant/CreateTag/_components/CreateTagSkeleton.tsx` | Conversion 6 |
| `src/screens/refund-point/Refund/_components/MethodPickerSkeleton.tsx` | Conversion 9 |

**Modified:** the two existing skeletons (`features/AppShellSkeleton.tsx`, `screens/shared/_components/TagStates.tsx`), the 11 host screens, and both localization resource files.

## Which conversions need a template-chrome test

The spec asks for a chrome assertion on each converted screen. That contract only
has meaning where a conversion **returns a template**, because losing the chrome
is only possible if the branch could have returned it and didn't. Splitting the
11 on that line:

**Screen-level, chrome test written (4).** Cards (Task 4), Documents (Task 5),
Notifications (Task 6) and TagDetail (Task 9). In each, the loading branch is
selected by mocking a *single* hook or action module, so the test costs little
and pins a lot.

**Screen-level, covered by the Task 15 review instead (3).** TagPreview
(Task 10), StickerTag (Task 12) and CreateTag (Task 13). Each sits behind a whole
subsystem rather than one hook — QR routing and tag assignment; sticker line
resolution; the merchant context, the calculator and three bottom sheets — so
standing the render up would cost more than the conversion it guards. What makes
that acceptable is that all three already have the correct shape: in every one,
the loading branch is inside an `ModalTemplate`/`TabPage` that the branch itself
returns, so the conversion only replaces a child and cannot introduce an early
return. Task 15 Step 2b checks this by reading the diff.

**In-card or in-modal (4) — no chrome to lose.** MethodPicker (Task 14),
RefundableTagList (Task 8), TenantSelection (Task 7) and ClaimTag (Task 11)
replace a fragment nested inside a card or a modal body. They never return a
template, so the failure mode does not exist for them.

Note for every render test on a `TabPage`-based screen: `TabPage` calls
`useNotifications` from `@novu/react-native` at `TabPage.tsx:25`, so that module
must be mocked or the render throws.

---

### Task 1: The `Skeleton` primitive

**Files:**
- Create: `src/components/skeletonClassName.ts`
- Create: `src/components/Skeleton.tsx`
- Modify: `src/localization/resources/en-US.json`
- Modify: `src/localization/resources/tr-TR.json`
- Test: `src/components/__tests__/skeletonClassName.test.ts`
- Test: `src/components/__tests__/Skeleton.router.test.tsx`

**Interfaces:**
- Consumes: `cn` from `@/utils/cn`, `useLocalization` from `@/providers/LocalizationProvider`.
- Produces — every later task depends on exactly these:
  - `type SkeletonTint = "element" | "surface"`
  - `skeletonClassName(tint: SkeletonTint, className?: string): string`
  - `Skeleton(props: ViewProps & { tint?: SkeletonTint }): JSX.Element` — defaults `tint` to `"element"`
  - `SkeletonRoot(props: { label?: string; className?: string; children: React.ReactNode }): JSX.Element`

Why the class composition is a separate pure module: asserting a NativeWind `className` through a rendered tree is unreliable, because nativewind consumes the prop and resolves it to styles. Extracting the mapping lets the fast `node` project test it directly as a string, and leaves the router test to assert only what rendering can actually observe.

- [ ] **Step 1: Write the failing pure test**

Create `src/components/__tests__/skeletonClassName.test.ts`:

```ts
import { skeletonClassName } from "../skeletonClassName";

it("tints a foreground element at /10 and a surface at /5", () => {
  expect(skeletonClassName("element")).toContain("bg-foreground/10");
  expect(skeletonClassName("surface")).toContain("bg-foreground/5");
});

it("rounds every block by default", () => {
  expect(skeletonClassName("element")).toContain("rounded");
});

// `cn` runs tailwind-merge, so a caller asking for a different radius must not
// end up with both. This is the whole reason the caller's classes come last.
it("lets a caller's radius replace the default", () => {
  const result = skeletonClassName("element", "rounded-full");

  expect(result).toContain("rounded-full");
  expect(result.split(" ")).not.toContain("rounded");
});

it("keeps a caller's size classes", () => {
  expect(skeletonClassName("surface", "h-20 w-40")).toContain("h-20");
  expect(skeletonClassName("surface", "h-20 w-40")).toContain("w-40");
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest src/components/__tests__/skeletonClassName.test.ts`
Expected: FAIL — `Cannot find module '../skeletonClassName'`.

- [ ] **Step 3: Write the pure module**

Create `src/components/skeletonClassName.ts`:

```ts
import { cn } from "@/utils/cn";

/**
 * Which layer a block stands in for. `element` is anything that reads as
 * foreground — a line of text, an icon, a badge, an avatar. `surface` is what
 * those sit on — a card, a panel.
 *
 * Both are theme-aware, which is why neither is `bg-border`: against `bg-card`
 * that token is very nearly invisible in dark mode.
 */
export type SkeletonTint = "element" | "surface";

/**
 * Kept free of any React or react-native import so the `node` Jest project can
 * test it directly — see `jest.config.js`. The caller's classes come last so a
 * requested radius or size always wins the tailwind-merge.
 */
export function skeletonClassName(tint: SkeletonTint, className?: string) {
  return cn(
    "rounded",
    tint === "surface" ? "bg-foreground/5" : "bg-foreground/10",
    className,
  );
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx jest src/components/__tests__/skeletonClassName.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Add the i18n keys**

In `src/localization/resources/en-US.json`, add a top-level `Common` section. The file's top-level keys are section names without the `MobileApp.` prefix — `init.ts` merges them under the `MobileApp` resource — so this becomes `MobileApp.Common.Loading`. Insert it after the closing brace of `"Onboarding"`:

```json
  "Common": {
    "Loading": "Loading"
  },
```

Make the matching addition in `src/localization/resources/tr-TR.json`, in the same position:

```json
  "Common": {
    "Loading": "Yükleniyor"
  },
```

- [ ] **Step 6: Regenerate the language bundles**

Run: `npm run init`
Expected: succeeds and updates `src/data/language-data/en-US.gen.json` and `tr-TR.gen.json`. Without this, `npx tsc --noEmit` rejects the new key.

- [ ] **Step 7: Write the failing render test**

Create `src/components/__tests__/Skeleton.router.test.tsx`. The `.router` suffix is required — see Global Constraints.

```tsx
import { render, screen } from "@testing-library/react-native";
import React from "react";
import { Skeleton, SkeletonRoot } from "../Skeleton";

jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({ t: (key: string) => key }),
}));

it("announces one progress element for the whole group", () => {
  render(
    <SkeletonRoot>
      <Skeleton className="h-4 w-36" />
      <Skeleton tint="surface" className="h-20" />
      <Skeleton className="h-3 w-20" />
    </SkeletonRoot>,
  );

  // Three blocks, one announcement. With the role on each block instead, a
  // screen reader would read a list skeleton out as dozens of progressbars.
  expect(screen.getAllByRole("progressbar")).toHaveLength(1);
});

it("labels the group from the shared loading key by default", () => {
  render(
    <SkeletonRoot>
      <Skeleton className="h-4 w-36" />
    </SkeletonRoot>,
  );

  expect(screen.getByLabelText("MobileApp.Common.Loading")).toBeTruthy();
});

it("lets a screen supply its own label", () => {
  render(
    <SkeletonRoot label="MobileApp.Notifications.Loading">
      <Skeleton className="h-4 w-36" />
    </SkeletonRoot>,
  );

  expect(screen.getByLabelText("MobileApp.Notifications.Loading")).toBeTruthy();
  expect(screen.queryByLabelText("MobileApp.Common.Loading")).toBeNull();
});

it("renders a block that a screen can find by testID", () => {
  render(<Skeleton testID="block" className="h-4 w-36" />);

  expect(screen.getByTestId("block")).toBeTruthy();
});
```

- [ ] **Step 8: Run it to confirm it fails**

Run: `npx jest src/components/__tests__/Skeleton.router.test.tsx`
Expected: FAIL — `Cannot find module '../Skeleton'`.

- [ ] **Step 9: Write the primitive**

Create `src/components/Skeleton.tsx`:

```tsx
import { useLocalization } from "@/providers/LocalizationProvider";
import React from "react";
import { View, type ViewProps } from "react-native";
import { skeletonClassName, type SkeletonTint } from "./skeletonClassName";

/**
 * Skeletons in this app are static. Shape preservation is what earns a skeleton
 * its place over a spinner — nothing shifts when the data lands — and a pulse
 * would carry a reanimated shared value into every one of them for decoration.
 *
 * Skeletons also do not render a `SafeAreaView`. Every one of them is a child of
 * `TabPage`, `ModalTemplate`, or `Modal`, all of which already own
 * `edges={["top", "left", "right"]}`; adding another would apply the top inset
 * twice and push the placeholder out of line with the content replacing it.
 * `AppShellSkeleton` is the single exception, because `(auth)/_layout.tsx`
 * returns it in place of the whole shell, with no template above it.
 */
export function Skeleton({
  tint = "element",
  className,
  ...props
}: ViewProps & { tint?: SkeletonTint }) {
  return <View className={skeletonClassName(tint, className)} {...props} />;
}

/**
 * Wraps a screen's blocks so the group is announced once.
 *
 * `accessible` is what does the work: it collapses the subtree into a single
 * accessibility element on both platforms, so the blocks need no accessibility
 * props of their own. The alternatives don't hold —
 * `importantForAccessibility` is Android-only, and `accessibilityElementsHidden`
 * hides descendants without covering the root itself.
 */
export function SkeletonRoot({
  label,
  className,
  children,
}: {
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { t } = useLocalization();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? t("MobileApp.Common.Loading")}
      className={className}
    >
      {children}
    </View>
  );
}

export type { SkeletonTint };
```

- [ ] **Step 10: Run both suites to confirm they pass**

Run: `npx jest src/components/__tests__/skeletonClassName.test.ts src/components/__tests__/Skeleton.router.test.tsx`
Expected: PASS, 8 tests across 2 suites.

- [ ] **Step 11: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. If it complains the `Common.Loading` key is unknown, `npm run init` did not run — go back to Step 6.

- [ ] **Step 12: Commit**

```bash
git add src/components/skeletonClassName.ts src/components/Skeleton.tsx \
  src/components/__tests__/skeletonClassName.test.ts \
  src/components/__tests__/Skeleton.router.test.tsx \
  src/localization/resources/en-US.json src/localization/resources/tr-TR.json
git commit -m "feat(skeleton): add shared static Skeleton primitive"
```

The regenerated `src/data/language-data/*.gen.json` files are deliberately **not** committed: `.gitignore:27` covers `src/data/*/*.gen.json` and they have never been tracked. They must exist on disk for tsc and the tests to pass, which is why Step 6 is not optional — but they stay untracked, so anyone else on this branch runs `npm run init` themselves.

---

### Task 2: Retrofit `AppShellSkeleton`

Done before any new skeleton, so the primitive is proven against a shape already known to be right.

**Files:**
- Modify: `src/features/AppShellSkeleton.tsx`

**Interfaces:**
- Consumes: `Skeleton`, `SkeletonRoot` from Task 1.
- Produces: nothing new. `AppShellSkeleton()` keeps its signature and its own `SafeAreaView`.

- [ ] **Step 1: Rewrite the component**

Replace the whole body of `src/features/AppShellSkeleton.tsx` below its existing docblock. Keep the docblock and the `SafeAreaView` exactly as they are — this component is the one legitimate self-wrapping skeleton in the app.

```tsx
import { SafeAreaView } from "@/components/SafeAreaView";
import { Skeleton, SkeletonRoot } from "@/components/Skeleton";
import React from "react";
import { View } from "react-native";
```

Then the returned tree becomes:

```tsx
    <SafeAreaView
      className="flex-1 bg-background"
      edges={["top", "left", "right"]}
    >
      <SkeletonRoot className="flex-1">
        <View className="flex-1 px-4 pt-4">
          <View className="mb-6 flex-row items-center justify-between">
            <Skeleton className="h-8 w-40 rounded-lg" />
            <Skeleton className="h-7 w-7 rounded-full" />
          </View>

          <Skeleton tint="surface" className="mb-3 h-20 rounded-2xl" />
          <Skeleton tint="surface" className="mb-6 h-20 rounded-2xl" />

          <Skeleton className="mb-3 h-6 w-32" />
          <Skeleton tint="surface" className="h-56 rounded-3xl" />
        </View>

        {/* Mirrors the real tab bar: four flat slots around one raised centre. */}
        <View className="flex-row items-end justify-around border-t border-border bg-card px-4 pb-8 pt-3">
          {[0, 1, 2, 3, 4].map((slot) =>
            slot === 2 ? (
              <Skeleton key={slot} className="-mt-6 h-16 w-16 rounded-full" />
            ) : (
              <Skeleton key={slot} className="h-7 w-7 rounded-lg" />
            ),
          )}
        </View>
      </SkeletonRoot>
    </SafeAreaView>
```

Every tint is unchanged from the original: what was `bg-foreground/10` is now the default `element`, and what was `bg-foreground/5` is now `tint="surface"`. The only behavioural addition is the `SkeletonRoot`, which this component previously lacked — it was announced to a screen reader as nothing at all.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Confirm the shell guard still renders**

Run: `npx jest src/app/__tests__/rootGuard.router.test.tsx`
Expected: PASS, unchanged from before this task.

- [ ] **Step 4: Commit**

```bash
git add src/features/AppShellSkeleton.tsx
git commit -m "refactor(skeleton): build AppShellSkeleton from the primitive"
```

---

### Task 3: Retrofit `TagCardSkeleton`

**Files:**
- Modify: `src/screens/shared/_components/TagStates.tsx:24-77`

**Interfaces:**
- Consumes: `Skeleton`, `SkeletonRoot` from Task 1.
- Produces: `TagCardSkeleton({ variant }: { variant?: TagCardVariant })` and `TagListSkeleton({ count }: { count?: number })` — both signatures unchanged.

This is the component that motivated the tint rule: it used `bg-border` throughout, which is close to invisible against `bg-card` in dark mode. It also hand-rolled `accessibilityRole="progressbar"`, which now belongs to `SkeletonRoot`.

- [ ] **Step 1: Add the import**

At the top of `src/screens/shared/_components/TagStates.tsx`, add:

```tsx
import { Skeleton, SkeletonRoot } from "@/components/Skeleton";
```

- [ ] **Step 2: Replace `TagCardSkeleton`**

Replace lines 24-66 (the whole `TagCardSkeleton` function, keeping its docblock above it) with:

```tsx
export function TagCardSkeleton({
  variant = "row",
}: {
  variant?: TagCardVariant;
}) {
  const hero = variant === "hero";
  return (
    <SkeletonRoot
      className={cn(
        "flex-row items-stretch overflow-hidden rounded-2xl border border-border bg-card",
        !hero && "mb-3",
      )}
    >
      {/* The rail stays neutral. Colouring it would assert a status we haven't
          loaded. */}
      <Skeleton tint="surface" className="w-1.5 rounded-none" />

      <View
        className={cn("flex-1", hero ? "gap-3 px-5 py-4" : "gap-2 px-4 py-3")}
      >
        <View className="flex-row items-center justify-between">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </View>

        <View>
          <Skeleton className={cn(hero ? "h-8 w-40" : "h-6 w-32")} />
          {/* Only the hero captions its figure, so only the hero reserves a
              line for one. */}
          {hero && <Skeleton className="mt-1.5 h-2.5 w-16" />}
        </View>

        <Skeleton tint="surface" className="h-px rounded-none" />

        <View className="flex-row items-center justify-between">
          <Skeleton className="h-3 w-44" />
          <Skeleton className="h-5 w-5 rounded-full" />
        </View>
      </View>
    </SkeletonRoot>
  );
}
```

Two notes for the reviewer. The rail and the divider take `rounded-none` because `skeletonClassName` applies `rounded` by default and a 1.5-wide rail or a 1pt rule must stay square. Both take `tint="surface"` rather than the default, because they are structure rather than content.

- [ ] **Step 3: Leave `TagListSkeleton` alone**

Make no edit here. `TagListSkeleton` (lines 68-77) is a run of `TagCardSkeleton`s, each of which now announces itself through its own `SkeletonRoot`, so the list needs no root of its own and no other change. It is called out explicitly only so its absence from the diff reads as deliberate rather than forgotten.

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/screens/shared/_components/TagStates.tsx`
Expected: no errors. If `React` is now unused in the file, remove the import.

- [ ] **Step 5: Commit**

```bash
git add src/screens/shared/_components/TagStates.tsx
git commit -m "refactor(tags): build TagCardSkeleton from the primitive"
```

---

### Task 4: Conversion 1 — `CardsSkeleton`

The reference conversion. It establishes the template-chrome test that every later conversion copies, so read its Step 4 carefully.

**Files:**
- Create: `src/screens/traveller/Cards/_components/CardsSkeleton.tsx`
- Modify: `src/screens/traveller/Cards/CardsScreen.tsx:77-80`
- Test: `src/screens/traveller/Cards/__tests__/CardsScreen.router.test.tsx`

**Interfaces:**
- Consumes: `Skeleton`, `SkeletonRoot` from Task 1.
- Produces: `CardsSkeleton(): JSX.Element` — no props.

- [ ] **Step 1: Write the skeleton component**

Create `src/screens/traveller/Cards/_components/CardsSkeleton.tsx`. It mirrors `BankPanel` (the hero) and `CardRow` (the compact rows), twice — once per section, because the screen has two independent defaults and therefore two heroes.

```tsx
import { Skeleton, SkeletonRoot } from "@/components/Skeleton";
import React from "react";
import { View } from "react-native";

/**
 * Mirrors a populated cards screen: per section, a `BankPanel`-shaped hero over
 * three `CardRow`-shaped rows. Three rows because the screen was designed around
 * 2-5 saved methods, so three is the common case and neither over- nor
 * under-reserves the scroll.
 */
function Section() {
  return (
    <View className="gap-3">
      {/* Section heading */}
      <Skeleton className="h-7 w-40" />

      {/* Hero, mirroring BankPanel: icon, title, trailing pills, the grouped
          number line, then the caption-over-value pair.

          The real panel is a saturated slab. The surface tint goes straight on
          this container rather than on an absolutely-positioned block behind it
          — same colour, no stacking to reason about. It stays neutral because
          colouring it would assert which method took the hero slot. */}
      <View className="gap-3 rounded-3xl bg-foreground/5 p-4">
        <View className="flex-row items-start justify-between gap-2">
          <View className="flex-1 flex-row items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-4 w-32" />
          </View>
          <View className="flex-row items-center gap-1">
            <Skeleton className="h-5 w-14 rounded-full" />
          </View>
        </View>
        <Skeleton className="h-4 w-48" />
        <View className="gap-1">
          <Skeleton className="h-2 w-16" />
          <Skeleton className="h-3 w-28" />
        </View>
      </View>

      {/* Three rows, mirroring CardRow: leading icon tile, title with an
          optional badge, subtitle, two trailing actions. */}
      {[0, 1, 2].map((row) => (
        <View
          key={row}
          className="flex-row items-center gap-3 rounded-2xl border border-border p-3"
        >
          <Skeleton className="h-11 w-11 rounded-xl" />
          <View className="flex-1 gap-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-40" />
          </View>
          <Skeleton className="h-5 w-5 rounded-full" />
          <Skeleton className="h-5 w-5 rounded-full" />
        </View>
      ))}
    </View>
  );
}

export function CardsSkeleton() {
  return (
    <SkeletonRoot className="gap-6 pb-8">
      <Section />
      <Section />
    </SkeletonRoot>
  );
}
```

- [ ] **Step 2: Swap the loading branch**

In `src/screens/traveller/Cards/CardsScreen.tsx`, add the import:

```tsx
import { CardsSkeleton } from "./_components/CardsSkeleton";
```

Then replace exactly this:

```tsx
      {loading && cards.length === 0 && banks.length === 0 ? (
        <View className="items-center py-10">
          <ActivityIndicator />
        </View>
      ) : error && cards.length === 0 && banks.length === 0 ? (
```

with:

```tsx
      {loading && cards.length === 0 && banks.length === 0 ? (
        <CardsSkeleton />
      ) : error && cards.length === 0 && banks.length === 0 ? (
```

The skeleton stays *inside* the `ModalTemplate` opened at line 70. Do not lift it above the template.

Then remove `ActivityIndicator` from the `react-native` import on line 9 if nothing else in the file uses it — check with `grep -n ActivityIndicator src/screens/traveller/Cards/CardsScreen.tsx` before removing.

- [ ] **Step 3: Run the existing suite to confirm nothing broke**

Run: `npx jest src/screens/traveller/Cards/__tests__/CardsScreen.router.test.tsx`
Expected: PASS, 3 tests — the existing hero/rows, bank-hero, and empty-state cases are untouched by this change.

- [ ] **Step 4: Write the failing template-chrome test**

This is the test that matters. Append to `src/screens/traveller/Cards/__tests__/CardsScreen.router.test.tsx`:

```tsx
// The failure this pins is not a missing inset — it is a conversion that
// early-returns the skeleton *above* its ModalTemplate, which drops the title,
// the back arrow and the safe-area edges in one move. A snapshot still looks
// plausible; only the chrome assertion catches it.
it("keeps the template chrome while the first load is in flight", async () => {
  // Never resolves, so the screen stays in its loading branch for the assertion.
  fetchCards.mockReturnValue(new Promise(() => {}));

  renderScreen();

  expect(await screen.findByText("MobileApp.Cards.Title")).toBeTruthy();
  expect(screen.getByText("MobileApp.Cards.Description")).toBeTruthy();
  expect(screen.getAllByRole("progressbar")).toHaveLength(1);
});
```

The existing `renderScreen` helper already supplies the `SafeAreaProvider` that `ModalTemplate` needs for `useSafeAreaInsets`, and the existing `jest.mock("@/providers/LocalizationProvider", ...)` makes `t` the identity, which is why the label reads as a raw key.

- [ ] **Step 5: Run it**

Run: `npx jest src/screens/traveller/Cards/__tests__/CardsScreen.router.test.tsx`
Expected: PASS, 4 tests.

Do not modify the source to prove the test can fail — a deliberately broken
branch is too easy to leave behind. The assertions are meaningful by
construction: `MobileApp.Cards.Title` and `MobileApp.Cards.Description` are
rendered by `ModalTemplate` alone, never by `CardsSkeleton`, so they can only
resolve if the template is still in the tree.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npx eslint src/screens/traveller/Cards
git add src/screens/traveller/Cards
git commit -m "feat(cards): skeleton the first load instead of a spinner"
```

---

### Task 5: Conversion 2 — `DocumentsSkeleton`

**Files:**
- Create: `src/screens/traveller/Documents/_components/DocumentsSkeleton.tsx`
- Modify: `src/screens/traveller/Documents/DocumentsScreen.tsx:35-38`
- Test: `src/screens/traveller/Documents/__tests__/DocumentsScreen.router.test.tsx`

**Interfaces:**
- Consumes: `Skeleton`, `SkeletonRoot` from Task 1.
- Produces: `DocumentsSkeleton(): JSX.Element` — no props.

- [ ] **Step 1: Write the skeleton component**

Create `src/screens/traveller/Documents/_components/DocumentsSkeleton.tsx`, mirroring `DocumentCard`: a `rounded-2xl` bordered card with a round icon beside title and subtitle lines, then a wrapping row of badges.

```tsx
import { Skeleton, SkeletonRoot } from "@/components/Skeleton";
import React from "react";
import { View } from "react-native";

/** Mirrors three `DocumentCard`s — icon, title, subtitle, and a badge row. */
export function DocumentsSkeleton() {
  return (
    <SkeletonRoot className="gap-3 py-2">
      {[0, 1, 2].map((card) => (
        <View
          key={card}
          className="gap-2 rounded-2xl border border-border p-4"
        >
          <View className="flex-row items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <View className="flex-1 gap-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3.5 w-28" />
            </View>
          </View>

          {/* DocumentCard badges its status and its evidence level, so the row
              reserves the space both occupy. */}
          <View className="flex-row flex-wrap items-center gap-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </View>
        </View>
      ))}
    </SkeletonRoot>
  );
}
```

- [ ] **Step 2: Swap the loading branch**

In `src/screens/traveller/Documents/DocumentsScreen.tsx`, add:

```tsx
import { DocumentsSkeleton } from "./_components/DocumentsSkeleton";
```

Replace exactly:

```tsx
      {loading && isEmpty ? (
        <View className="items-center py-10">
          <ActivityIndicator />
        </View>
      ) : error && isEmpty ? (
```

with:

```tsx
      {loading && isEmpty ? (
        <DocumentsSkeleton />
      ) : error && isEmpty ? (
```

Then run `grep -n ActivityIndicator src/screens/traveller/Documents/DocumentsScreen.tsx` and drop it from the `react-native` import if it has no other use.

- [ ] **Step 3: Write the failing template-chrome test**

Create `src/screens/traveller/Documents/__tests__/DocumentsScreen.router.test.tsx`. `useTravellerDocuments` is mocked here rather than the API, because this test is about the loading branch and the template around it, not about the fetch wiring:

```tsx
import { render, screen } from "@testing-library/react-native";
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import DocumentsScreen from "../DocumentsScreen";

jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({ t: (key: string) => key }),
}));

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  useFocusEffect: () => undefined,
}));

// The hook is colocated with the screen, not under `@/hooks`.
const useTravellerDocuments = jest.fn();
jest.mock("../useTravellerDocuments", () => ({
  useTravellerDocuments: () => useTravellerDocuments(),
}));

// ModalTemplate reads insets via useSafeAreaInsets, which throws without a
// provider in the tree.
function renderScreen() {
  return render(<DocumentsScreen />, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 375, height: 812 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useTravellerDocuments.mockReturnValue({
    documents: [],
    loading: true,
    error: null,
    refresh: jest.fn(),
    setPrimary: jest.fn(),
    addDocument: jest.fn(),
  });
});

// Pins the skeleton as a child of the template, not a replacement for it.
it("keeps the template chrome while the first load is in flight", () => {
  renderScreen();

  expect(screen.getByText("MobileApp.Documents.Title")).toBeTruthy();
  expect(screen.getByText("MobileApp.Documents.Description")).toBeTruthy();
  expect(screen.getAllByRole("progressbar")).toHaveLength(1);
});
```

The mocked fields are exactly what the screen destructures at `DocumentsScreen.tsx:14-23`: `documents`, `loading`, `error`, `refresh`, `setPrimary`, `addDocument`. `isEmpty` is derived in the screen from `documents.length === 0`, so an empty array plus `loading: true` is what selects the loading branch.

- [ ] **Step 4: Run it**

Run: `npx jest src/screens/traveller/Documents/__tests__/DocumentsScreen.router.test.tsx`
Expected: PASS, 1 test.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npx eslint src/screens/traveller/Documents
git add src/screens/traveller/Documents
git commit -m "feat(documents): skeleton the first load instead of a spinner"
```

---

### Task 6: Conversion 3 — `NotificationsSkeleton`

**Files:**
- Create: `src/screens/shared/Notifications/_components/NotificationsSkeleton.tsx`
- Modify: `src/screens/shared/Notifications/NotificationsScreen.tsx:151-159`

**Interfaces:**
- Consumes: `Skeleton`, `SkeletonRoot` from Task 1.
- Produces: `NotificationsSkeleton(): JSX.Element` — no props.

- [ ] **Step 1: Write the skeleton component**

Create `src/screens/shared/Notifications/_components/NotificationsSkeleton.tsx`, mirroring the notification card at `NotificationsScreen.tsx:44-62` — a `mb-4 rounded-2xl` card whose `p-4` body is a `w-14 h-14 rounded-2xl` icon beside a title and two body lines.

```tsx
import { Skeleton, SkeletonRoot } from "@/components/Skeleton";
import { useLocalization } from "@/providers/LocalizationProvider";
import React from "react";
import { View } from "react-native";

/**
 * Mirrors four notification cards. The existing loading copy moves to the
 * root's label rather than being dropped: it is better as an announcement than
 * as a line of centred text under a spinner.
 */
export function NotificationsSkeleton() {
  const { t } = useLocalization();
  return (
    <SkeletonRoot
      label={t("MobileApp.Notifications.Loading")}
      className="pb-6"
    >
      {/* The real list heads itself with a count summary over a rule. */}
      <View className="mb-4 pb-3 border-b border-border">
        <Skeleton className="h-3.5 w-36" />
      </View>

      {[0, 1, 2, 3].map((card) => (
        <View
          key={card}
          className="mb-4 rounded-2xl border border-border p-4"
        >
          <View className="flex-row items-start gap-3">
            <Skeleton className="w-14 h-14 rounded-2xl" />
            <View className="flex-1 gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </View>
          </View>
        </View>
      ))}
    </SkeletonRoot>
  );
}
```

Note that the key is resolved through `t()` *here*, not inside `SkeletonRoot`. `SkeletonRoot` treats `label` as an already-translated string and passes it straight to `accessibilityLabel`, matching how the codebase hands strings to `QrScanner` and friends. Passing the raw key would leak `MobileApp.Notifications.Loading` to a real screen reader — it only looks fine in tests, where `t` is mocked as the identity.

- [ ] **Step 2: Swap the loading branch**

In `src/screens/shared/Notifications/NotificationsScreen.tsx`, add:

```tsx
import { NotificationsSkeleton } from "./_components/NotificationsSkeleton";
```

Replace exactly:

```tsx
      {isLoading && (!notifications || notifications.length === 0) ? (
        <View className="flex-1 items-center justify-center py-20">
          <View className="w-20 h-20 rounded-full bg-blue-100 items-center justify-center mb-4">
            <ActivityIndicator size="large" color="#3B82F6" />
          </View>
          <Text className="text-gray-600 text-base font-medium mt-2">
            {t("MobileApp.Notifications.Loading")}
          </Text>
        </View>
      ) : !notifications || notifications.length === 0 ? (
```

with:

```tsx
      {isLoading && (!notifications || notifications.length === 0) ? (
        <NotificationsSkeleton />
      ) : !notifications || notifications.length === 0 ? (
```

`ActivityIndicator` is still used by the load-more button at line 184, so it stays in the import. Confirm with `grep -n ActivityIndicator src/screens/shared/Notifications/NotificationsScreen.tsx` — expect one remaining use.

- [ ] **Step 3: Write the failing template-chrome test**

Create `src/screens/shared/Notifications/__tests__/NotificationsScreen.router.test.tsx`. `useNotifications` is a plain hook, so mocking the module is enough — no novu provider needed:

```tsx
import { render, screen } from "@testing-library/react-native";
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import NotificationsScreen from "../NotificationsScreen";

jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({ t: (key: string) => key }),
}));

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  useFocusEffect: () => undefined,
}));

const useNotifications = jest.fn();
jest.mock("@novu/react-native", () => ({
  useNotifications: () => useNotifications(),
}));

function renderScreen() {
  return render(<NotificationsScreen />, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 375, height: 812 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useNotifications.mockReturnValue({
    notifications: [],
    isLoading: true,
    fetchMore: jest.fn(),
    hasMore: false,
    refetch: jest.fn(),
  });
});

// Pins the skeleton as a child of the template, not a replacement for it.
it("keeps the template chrome while the first load is in flight", () => {
  renderScreen();

  expect(screen.getByText("MobileApp.Notifications.Title")).toBeTruthy();
  expect(screen.getAllByRole("progressbar")).toHaveLength(1);
});

// The skeleton carries the loading copy as its label rather than as body text,
// which is what keeps this existing key in use.
it("announces the notifications loading label", () => {
  renderScreen();

  expect(
    screen.getByLabelText("MobileApp.Notifications.Loading"),
  ).toBeTruthy();
});
```

If the render complains about a field the screen reads off `useNotifications` that the mock does not supply, add it to `mockReturnValue` — the screen's usage is at `NotificationsScreen.tsx:151` and around the load-more button at `:178-190`.

- [ ] **Step 4: Run it**

Run: `npx jest src/screens/shared/Notifications/__tests__/NotificationsScreen.router.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/screens/shared/Notifications`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/screens/shared/Notifications
git commit -m "feat(notifications): skeleton the first load instead of a spinner"
```

---

### Task 7: Conversion 11 — `TenantSelectionSkeleton`

**Files:**
- Create: `src/components/TenantInput/TenantSelectionSkeleton.tsx`
- Modify: `src/components/TenantInput/TenantSelectionModal.tsx:118-120`

**Interfaces:**
- Consumes: `Skeleton`, `SkeletonRoot` from Task 1.
- Produces: `TenantSelectionSkeleton(): JSX.Element` — no props.

Note the flat path: `TenantInput/` keeps its files flat, like its `CountryInput` and `PhoneInput` siblings. Do not create a `_components/` directory here.

- [ ] **Step 1: Write the skeleton component**

Create `src/components/TenantInput/TenantSelectionSkeleton.tsx`, mirroring the row at `TenantSelectionModal.tsx:133-140` — `flex-row items-center justify-between border-b border-gray-200 py-3`, a name on the left, a trailing affordance on the right.

```tsx
import { Skeleton, SkeletonRoot } from "@/components/Skeleton";
import React from "react";
import { View } from "react-native";

/** Mirrors four tenant rows: a name line and a trailing affordance, ruled. */
export function TenantSelectionSkeleton() {
  return (
    <SkeletonRoot className="mt-6">
      {[0, 1, 2, 3].map((row) => (
        <View
          key={row}
          className="flex-row items-center justify-between border-b border-border py-3"
        >
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-5 w-5 rounded-full" />
        </View>
      ))}
    </SkeletonRoot>
  );
}
```

- [ ] **Step 2: Swap the loading branch**

In `src/components/TenantInput/TenantSelectionModal.tsx`, add:

```tsx
import { TenantSelectionSkeleton } from "./TenantSelectionSkeleton";
```

Replace exactly:

```tsx
        {isLoading && tenants.length === 0 && (
          <ActivityIndicator className="mt-6" size="large" color="#2563EB" />
        )}
```

with:

```tsx
        {isLoading && tenants.length === 0 && <TenantSelectionSkeleton />}
```

`ActivityIndicator` stays in the import — the refresh button at line 83 still uses it. Confirm with `grep -n ActivityIndicator src/components/TenantInput/TenantSelectionModal.tsx`, expecting one remaining use.

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/components/TenantInput`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/TenantInput
git commit -m "feat(tenant): skeleton the tenant list's first load"
```

---

### Task 8: Conversion 10 — `RefundableTagListSkeleton`

**Files:**
- Create: `src/screens/refund-point/Refund/_components/RefundableTagListSkeleton.tsx`
- Modify: `src/screens/refund-point/Refund/_components/RefundableTagList.tsx:80`

**Interfaces:**
- Consumes: `Skeleton`, `SkeletonRoot` from Task 1.
- Produces: `RefundableTagListSkeleton(): JSX.Element` — no props.

This is an in-card conversion. The card chrome and the export-validated filter pills above it stay exactly as they are — they remain interactive while tags load, so replacing them would take away a control the operator can still use.

- [ ] **Step 1: Write the skeleton component**

Create `src/screens/refund-point/Refund/_components/RefundableTagListSkeleton.tsx`:

```tsx
import { Skeleton, SkeletonRoot } from "@/components/Skeleton";
import React from "react";
import { View } from "react-native";

/**
 * Mirrors three selectable tag rows inside the existing card. Only the rows are
 * replaced: the card chrome and the export-validated filter above stay put,
 * since the operator can still change the filter while these load.
 */
export function RefundableTagListSkeleton() {
  return (
    <SkeletonRoot className="my-2 gap-2">
      {[0, 1, 2].map((row) => (
        <View
          key={row}
          className="flex-row items-center gap-3 rounded-xl border border-border p-3"
        >
          <Skeleton className="h-5 w-5 rounded" />
          <View className="flex-1 gap-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </View>
          <Skeleton className="h-4 w-16" />
        </View>
      ))}
    </SkeletonRoot>
  );
}
```

- [ ] **Step 2: Swap the loading branch**

In `src/screens/refund-point/Refund/_components/RefundableTagList.tsx`, add:

```tsx
import { RefundableTagListSkeleton } from "./RefundableTagListSkeleton";
```

Replace exactly:

```tsx
      {isLoading && <ActivityIndicator className="my-4" />}
```

with:

```tsx
      {isLoading && <RefundableTagListSkeleton />}
```

Then run `grep -n ActivityIndicator src/screens/refund-point/Refund/_components/RefundableTagList.tsx` and remove it from the `react-native` import if that was its only use.

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/screens/refund-point/Refund`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/screens/refund-point/Refund/_components/RefundableTagList.tsx \
  src/screens/refund-point/Refund/_components/RefundableTagListSkeleton.tsx
git commit -m "feat(refund): skeleton the refundable tag rows"
```

---

### Task 9: Conversion 4 — `TagDetailSkeleton`

**Files:**
- Create: `src/screens/shared/Tags/TagDetail/_components/TagDetailSkeleton.tsx`
- Modify: `src/screens/shared/Tags/TagDetail/TagDetailScreen.tsx:198-202`

**Interfaces:**
- Consumes: `Skeleton`, `SkeletonRoot` from Task 1.
- Produces: `TagDetailSkeleton(): JSX.Element` — no props.

This site already returns a full `ModalTemplate` around its loading state (lines 193-203), which is the shape every other conversion imitates. Leave that structure alone; only the inner `View` changes.

- [ ] **Step 1: Write the skeleton component**

Create `src/screens/shared/Tags/TagDetail/_components/TagDetailSkeleton.tsx`. It mirrors the real detail body: a `flex-row flex-wrap border-b` grid of four `w-1/2` label-over-value pairs with the second column right-aligned, then blocks for `TagTimeLine` and `Totals`.

```tsx
import { Skeleton, SkeletonRoot } from "@/components/Skeleton";
import React from "react";
import { View } from "react-native";

/**
 * Mirrors the detail body: a two-column grid of four label-over-value pairs
 * above the rule, then the timeline and totals blocks.
 *
 * The second column is right-aligned because the real grid is — pairs at
 * `w-1/2` alternate `items-end`, so a left-aligned placeholder would slide
 * sideways when the values land.
 */
export function TagDetailSkeleton() {
  return (
    <SkeletonRoot className="w-full flex-1">
      <View className="flex-row flex-wrap border-b border-border pb-4 mb-4">
        {[0, 1, 2, 3].map((pair) => {
          const rightAligned = pair % 2 === 1;
          return (
            <View
              key={pair}
              className={`w-1/2 mb-4 gap-1.5 ${rightAligned ? "items-end" : ""}`}
            >
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-4 w-28" />
            </View>
          );
        })}
      </View>

      {/* TagTimeLine */}
      <Skeleton tint="surface" className="h-40 rounded-2xl mb-4" />

      {/* Totals */}
      <Skeleton tint="surface" className="h-28 rounded-2xl" />

      {/* The real body ends with an h-20 spacer so the last row clears the
          pinned action. */}
      <View className="h-20" />
    </SkeletonRoot>
  );
}
```

- [ ] **Step 2: Swap the loading branch**

In `src/screens/shared/Tags/TagDetail/TagDetailScreen.tsx`, add:

```tsx
import { TagDetailSkeleton } from "./_components/TagDetailSkeleton";
```

Replace exactly:

```tsx
          <View className="w-full flex-1 items-center justify-center">
            <LoadingIcon />
          </View>
```

with:

```tsx
          <TagDetailSkeleton />
```

`LoadingIcon` is still used by the assigning overlay at line 327, so its import stays. Confirm with `grep -n LoadingIcon src/screens/shared/Tags/TagDetail/TagDetailScreen.tsx` — expect the import plus one remaining use.

- [ ] **Step 3: Confirm the detail hook suite still passes**

Run: `npx jest src/screens/shared/Tags/TagDetail/__tests__/useTagDetail.router.test.ts`
Expected: PASS, unchanged.

- [ ] **Step 4: Write the failing template-chrome test**

Create `src/screens/shared/Tags/TagDetail/__tests__/TagDetailScreen.router.test.tsx`. `useTagDetail` returns `{ tagDetailData, status, reload }` (see `TagDetailScreen.tsx:144`), and the loading branch is selected by `!tagDetailData && status === "loading"`:

```tsx
import { render, screen } from "@testing-library/react-native";
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import TagDetailScreen from "../TagDetailScreen";

jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({ t: (key: string) => key }),
}));

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn() },
  useFocusEffect: () => undefined,
}));

const useTagDetail = jest.fn();
jest.mock("../useTagDetail", () => ({
  useTagDetail: () => useTagDetail(),
}));

// The screen takes `{ tagId, tagNumber }` as props (TagDetailScreen.tsx:120-126),
// so there are no route params to mock.
function renderScreen() {
  return render(<TagDetailScreen tagId="tag-1" tagNumber="TAG-1" />, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 375, height: 812 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useTagDetail.mockReturnValue({
    tagDetailData: undefined,
    status: "loading",
    reload: jest.fn(),
  });
});

// This branch already returned its ModalTemplate before the conversion; the test
// pins that it still does, since it is the shape every other conversion copies.
it("keeps the template chrome while the first load is in flight", () => {
  renderScreen();

  expect(screen.getByText("MobileApp.TagDetail.Title")).toBeTruthy();
  expect(screen.getAllByRole("progressbar")).toHaveLength(1);
});
```

The screen reads `useUserStore` for its staff scope and `useToastRef` for its toasts. If either throws without a provider, add the same shape of module mock used for `LocalizationProvider` above — `useUserStore` needs `{ isMerchant: false, isRefundPoint: false }` and `useToastRef` a `{ current: null }`.

- [ ] **Step 5: Run it**

Run: `npx jest src/screens/shared/Tags/TagDetail/__tests__/TagDetailScreen.router.test.tsx`
Expected: PASS, 1 test.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npx eslint src/screens/shared/Tags/TagDetail
git add src/screens/shared/Tags/TagDetail
git commit -m "feat(tag-detail): skeleton the first load instead of a spinner"
```

---

### Task 10: Conversion 5 — `TagPreviewSkeleton`

**Files:**
- Create: `src/screens/shared/_components/TagPreviewSkeleton.tsx`
- Modify: `src/screens/shared/TagPreviewScreen.tsx:230-233`

**Interfaces:**
- Consumes: `Skeleton`, `SkeletonRoot` from Task 1.
- Produces: `TagPreviewSkeleton(): JSX.Element` — no props.

- [ ] **Step 1: Write the skeleton component**

Create `src/screens/shared/_components/TagPreviewSkeleton.tsx`, mirroring the `gap-4 pt-2` success body: a bordered card of label/value rows with a status pill, then the grey note block with its leading icon.

```tsx
import { Skeleton, SkeletonRoot } from "@/components/Skeleton";
import React from "react";
import { View } from "react-native";

/**
 * Mirrors the preview body: the detail card, then the note block beneath it.
 * The second row of the card reserves a pill, because the real card puts the
 * tag's status there and a missing pill is a visible jump.
 */
export function TagPreviewSkeleton() {
  return (
    <SkeletonRoot className="gap-4 pt-2">
      <View className="gap-3 rounded-2xl border border-border p-4">
        <View className="flex-row items-center justify-between">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-4 w-28" />
        </View>

        <View className="flex-row items-center justify-between">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </View>

        <View className="flex-row items-center justify-between">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-4 w-24" />
        </View>

        <View className="flex-row items-center justify-between">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-4 w-32" />
        </View>
      </View>

      {/* The real note block sits on a grey fill, so the tint goes on the
          container rather than behind it. */}
      <View className="flex-row items-start gap-3 rounded-2xl bg-foreground/5 p-4">
        <Skeleton className="h-6 w-6 rounded-full" />
        <View className="flex-1 gap-1.5">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </View>
      </View>
    </SkeletonRoot>
  );
}
```

- [ ] **Step 2: Swap the loading branch**

In `src/screens/shared/TagPreviewScreen.tsx`, add:

```tsx
import { TagPreviewSkeleton } from "./_components/TagPreviewSkeleton";
```

Replace exactly:

```tsx
        {tag === undefined ? (
          <View className="flex-1 items-center justify-center py-16">
            <LoadingIcon />
          </View>
        ) : tag === null ? (
```

with:

```tsx
        {tag === undefined ? (
          <TagPreviewSkeleton />
        ) : tag === null ? (
```

`LoadingIcon` remains in use by the assigning overlay at line 336, so the import stays. Confirm with `grep -n LoadingIcon src/screens/shared/TagPreviewScreen.tsx`.

- [ ] **Step 3: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npx eslint src/screens/shared/TagPreviewScreen.tsx src/screens/shared/_components/TagPreviewSkeleton.tsx
git add src/screens/shared/TagPreviewScreen.tsx src/screens/shared/_components/TagPreviewSkeleton.tsx
git commit -m "feat(tag-preview): skeleton the first load instead of a spinner"
```

---

### Task 11: Conversion 8 — `ClaimTagSkeleton`

**Files:**
- Create: `src/screens/traveller/Validate/_components/ClaimTagSkeleton.tsx`
- Modify: `src/screens/traveller/Validate/ClaimTagModal.tsx:164-167`

**Interfaces:**
- Consumes: `Skeleton`, `SkeletonRoot` from Task 1.
- Produces: `ClaimTagSkeleton(): JSX.Element` — no props.

Only the `isBusy && !tag` branch changes. The `isClaiming` overlay at line 243-255 stays a `LoadingIcon` — that one covers a mutation in flight, where there is no incoming shape to mirror.

- [ ] **Step 1: Write the skeleton component**

Create `src/screens/traveller/Validate/_components/ClaimTagSkeleton.tsx`:

```tsx
import { Skeleton, SkeletonRoot } from "@/components/Skeleton";
import React from "react";
import { View } from "react-native";

/**
 * Mirrors the tag summary the modal shows once the lookup lands. Used only for
 * the lookup — the claim itself keeps its overlay spinner, since a claim has no
 * arriving shape for a skeleton to stand in for.
 */
export function ClaimTagSkeleton() {
  return (
    <SkeletonRoot className="flex-1 gap-3 py-2">
      <View className="gap-3 rounded-2xl border border-border p-4">
        <View className="flex-row items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </View>
        <Skeleton className="h-7 w-36" />
        <Skeleton tint="surface" className="h-px rounded-none" />
        <View className="flex-row items-center justify-between">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-16" />
        </View>
      </View>
    </SkeletonRoot>
  );
}
```

- [ ] **Step 2: Swap the loading branch**

In `src/screens/traveller/Validate/ClaimTagModal.tsx`, add:

```tsx
import { ClaimTagSkeleton } from "./_components/ClaimTagSkeleton";
```

Replace exactly:

```tsx
          {isBusy && !tag ? (
            <View className="flex-1 items-center justify-center">
              <LoadingIcon />
            </View>
          ) : tag ? (
```

with:

```tsx
          {isBusy && !tag ? (
            <ClaimTagSkeleton />
          ) : tag ? (
```

`LoadingIcon` stays imported for the claiming overlay. Confirm with `grep -n LoadingIcon src/screens/traveller/Validate/ClaimTagModal.tsx` — expect the import plus one remaining use at the overlay.

- [ ] **Step 3: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npx eslint src/screens/traveller/Validate
git add src/screens/traveller/Validate
git commit -m "feat(claim-tag): skeleton the tag lookup"
```

---

### Task 12: Conversion 7 — `StickerTagSkeleton`

**Files:**
- Create: `src/screens/staff/StickerTag/_components/StickerTagSkeleton.tsx`
- Modify: `src/screens/staff/StickerTag/StickerTagScreen.tsx:238-243`

**Interfaces:**
- Consumes: `Skeleton`, `SkeletonRoot` from Task 1.
- Produces: `StickerTagSkeleton(): JSX.Element` — no props.

This site keeps its `MobileApp.Qr.StickerTag.Resolving` copy. The state covers a resolution step, so the sentence explains something a skeleton cannot, and only the `LoadingIcon` is replaced.

- [ ] **Step 1: Write the skeleton component**

Create `src/screens/staff/StickerTag/_components/StickerTagSkeleton.tsx`:

```tsx
import { Skeleton, SkeletonRoot } from "@/components/Skeleton";
import React from "react";
import { View } from "react-native";

/** Mirrors the tag card a resolved sticker turns into. */
export function StickerTagSkeleton() {
  return (
    <SkeletonRoot className="w-full gap-3">
      <View className="gap-3 rounded-2xl border border-border p-4">
        <View className="flex-row items-center justify-between">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </View>
        <Skeleton className="h-7 w-40" />
        <Skeleton tint="surface" className="h-px rounded-none" />
        <View className="flex-row items-center justify-between">
          <Skeleton className="h-3 w-44" />
          <Skeleton className="h-5 w-5 rounded-full" />
        </View>
      </View>
    </SkeletonRoot>
  );
}
```

- [ ] **Step 2: Swap the loading branch**

In `src/screens/staff/StickerTag/StickerTagScreen.tsx`, add:

```tsx
import { StickerTagSkeleton } from "./_components/StickerTagSkeleton";
```

Replace exactly:

```tsx
        <View className="flex-1 items-center justify-center gap-3 py-16">
          <LoadingIcon />
          <Text className="text-muted">
            {t("MobileApp.Qr.StickerTag.Resolving")}
          </Text>
        </View>
```

with:

```tsx
        <View className="flex-1 gap-3 py-4">
          <StickerTagSkeleton />
          <Text className="text-center text-muted">
            {t("MobileApp.Qr.StickerTag.Resolving")}
          </Text>
        </View>
```

The centring drops because a skeleton sits at the top of the content area where the card will appear, not in the middle of the screen; the caption keeps `text-center` so it still reads as a caption under the card.

Then run `grep -n LoadingIcon src/screens/staff/StickerTag/StickerTagScreen.tsx` and remove the import if that was its only use.

- [ ] **Step 3: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npx eslint src/screens/staff/StickerTag
git add src/screens/staff/StickerTag
git commit -m "feat(sticker-tag): skeleton the tag while the sticker resolves"
```

---

### Task 13: Conversion 6 — `CreateTagSkeleton`

**Files:**
- Create: `src/screens/merchant/CreateTag/_components/CreateTagSkeleton.tsx`
- Modify: `src/screens/merchant/CreateTag/CreateTagScreen.tsx:116-123`

**Interfaces:**
- Consumes: `Skeleton`, `SkeletonRoot` from Task 1.
- Produces: `CreateTagSkeleton(): JSX.Element` — no props.

- [ ] **Step 1: Write the skeleton component**

Create `src/screens/merchant/CreateTag/_components/CreateTagSkeleton.tsx`, mirroring the form's scroll body: the `flex-row gap-2` action row, the product-group pills, the amount display, then the numpad grid and the submit button.

```tsx
import { Skeleton, SkeletonRoot } from "@/components/Skeleton";
import React from "react";
import { View } from "react-native";

/**
 * Mirrors the create-tag form. The numpad is the tall block at the bottom, and
 * reserving its full height is the point — the merchant's thumb lands in the
 * same place before and after the merchant record loads.
 */
export function CreateTagSkeleton() {
  return (
    <SkeletonRoot className="flex-1">
      {/* The traveller action, beside its clear button. */}
      <View className="flex-row gap-2">
        <Skeleton tint="surface" className="flex-1 h-16 rounded-2xl" />
        <Skeleton className="h-9 w-9 rounded-full self-center" />
      </View>

      {/* Product group pills */}
      <View className="mt-3 flex-row gap-2">
        <Skeleton className="h-8 w-24 rounded-full" />
        <Skeleton className="h-8 w-20 rounded-full" />
        <Skeleton className="h-8 w-16 rounded-full" />
      </View>

      {/* Amount display */}
      <View className="mt-2 items-end gap-2">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-3 w-24" />
      </View>

      {/* Numpad: four rows of three keys. */}
      <View className="mt-4 gap-3">
        {[0, 1, 2, 3].map((row) => (
          <View key={row} className="flex-row gap-3">
            {[0, 1, 2].map((key) => (
              <Skeleton
                key={key}
                tint="surface"
                className="flex-1 h-14 rounded-xl"
              />
            ))}
          </View>
        ))}
      </View>

      <Skeleton className="mt-4 h-14 rounded-full" />
    </SkeletonRoot>
  );
}
```

- [ ] **Step 2: Swap the loading branch**

In `src/screens/merchant/CreateTag/CreateTagScreen.tsx`, add:

```tsx
import { CreateTagSkeleton } from "./_components/CreateTagSkeleton";
```

Replace exactly:

```tsx
  if (merchant.isLoading) {
    return (
      <TabPage title={t("MobileApp.CreateTag.Title")}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#db0000" />
        </View>
      </TabPage>
    );
  }
```

with:

```tsx
  if (merchant.isLoading) {
    return (
      <TabPage title={t("MobileApp.CreateTag.Title")}>
        <CreateTagSkeleton />
      </TabPage>
    );
  }
```

The `TabPage` stays — this branch already returns it, and the skeleton goes inside.

Then run `grep -n ActivityIndicator src/screens/merchant/CreateTag/CreateTagScreen.tsx` and remove it from the `react-native` import if that was its only use.

- [ ] **Step 3: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npx eslint src/screens/merchant/CreateTag
git add src/screens/merchant/CreateTag
git commit -m "feat(create-tag): skeleton the form while the merchant loads"
```

---

### Task 14: Conversion 9 — `MethodPickerSkeleton`

**Files:**
- Create: `src/screens/refund-point/Refund/_components/MethodPickerSkeleton.tsx`
- Modify: `src/screens/refund-point/Refund/_components/MethodPicker.tsx:83-92`

**Interfaces:**
- Consumes: `Skeleton`, `SkeletonRoot` from Task 1.
- Produces: `MethodPickerSkeleton(): JSX.Element` — no props.

- [ ] **Step 1: Write the skeleton component**

Create `src/screens/refund-point/Refund/_components/MethodPickerSkeleton.tsx`, mirroring the option tiles at `MethodPicker.tsx:118-131` — `flex-1 basis-24 items-center gap-1.5 rounded-xl border p-3`, an icon over a label.

```tsx
import { Skeleton, SkeletonRoot } from "@/components/Skeleton";
import React from "react";
import { View } from "react-native";

/** Mirrors three method tiles: an icon over a label, wrapped in a row. */
export function MethodPickerSkeleton() {
  return (
    <SkeletonRoot className="flex-row flex-wrap gap-2">
      {[0, 1, 2].map((tile) => (
        <View
          key={tile}
          className="flex-1 basis-24 items-center gap-1.5 rounded-xl border border-border p-3"
        >
          <Skeleton className="h-6 w-6 rounded-lg" />
          <Skeleton className="h-3 w-14" />
        </View>
      ))}
    </SkeletonRoot>
  );
}
```

- [ ] **Step 2: Swap the loading branch**

In `src/screens/refund-point/Refund/_components/MethodPicker.tsx`, add:

```tsx
import { MethodPickerSkeleton } from "./MethodPickerSkeleton";
```

Replace exactly:

```tsx
  if (methods === null) {
    return (
      <View className="rounded-2xl border border-gray-200 bg-white p-4">
        <Text className="text-xs font-medium text-muted mb-2">
          {t("MobileApp.Refund.Method")}
        </Text>
        <ActivityIndicator />
      </View>
    );
  }
```

with:

```tsx
  if (methods === null) {
    return (
      <View className="rounded-2xl border border-gray-200 bg-white p-4">
        <Text className="text-xs font-medium text-muted mb-2">
          {t("MobileApp.Refund.Method")}
        </Text>
        <MethodPickerSkeleton />
      </View>
    );
  }
```

The card chrome and the `Method` label stay — they are already correct, and only the spinner inside them is wrong.

Then run `grep -n ActivityIndicator src/screens/refund-point/Refund/_components/MethodPicker.tsx` and remove it from the `react-native` import if that was its only use.

- [ ] **Step 3: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npx eslint src/screens/refund-point/Refund
git add src/screens/refund-point/Refund/_components/MethodPicker.tsx \
  src/screens/refund-point/Refund/_components/MethodPickerSkeleton.tsx
git commit -m "feat(refund): skeleton the method tiles"
```

---

### Task 15: Final verification sweep

**Files:** none created or modified unless a check fails.

- [ ] **Step 1: Confirm no skeleton owns a safe area except the shell**

Run: `grep -rn "SafeAreaView" src --include="*Skeleton*.tsx"`
Expected: exactly one match, in `src/features/AppShellSkeleton.tsx`. Any other match violates the safe-area contract and must be removed.

- [ ] **Step 2: Confirm every intended spinner site was converted**

Run: `grep -rn "ActivityIndicator\|LoadingIcon" src --include="*.tsx" | grep -v __tests__ | grep -v "components/LoadingUnirefund" | wc -l`
Expected: 16 remaining uses plus their import lines. Cross-check the remaining sites against the spec's out-of-scope list — the four overlays, the camera and warm-up states, the inline button-busy and background-refetch indicators, `ValidateScreen`'s `Centered` panel, and `app/loading.tsx`. Nothing in that list should have been touched.

- [ ] **Step 2b: Read the diff for the three untested screens**

TagPreview (Task 10), StickerTag (Task 12) and CreateTag (Task 13) have no chrome
test, so this review is what covers them.

Run: `git diff main -- src/screens/shared/TagPreviewScreen.tsx src/screens/staff/StickerTag/StickerTagScreen.tsx src/screens/merchant/CreateTag/CreateTagScreen.tsx`

For each of the three, confirm both:

1. The skeleton is rendered *inside* the `ModalTemplate` or `TabPage` — the diff
   should show a replaced child, with the template's opening tag untouched and
   outside the hunk.
2. No new `return` statement appeared above a template.

If either fails, the conversion has introduced the exact early-return the safe-area
contract forbids. Fix it before continuing.

- [ ] **Step 3: Confirm no skeleton uses the retired token**

Run: `grep -rn "bg-border" src --include="*Skeleton*.tsx" src/screens/shared/_components/TagStates.tsx`
Expected: no matches. `border-border` is fine and will not match this pattern.

- [ ] **Step 4: Typecheck the whole app**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Lint**

Run: `npx eslint src`
Expected: no errors. Unused `React`, `View`, `Text`, `ActivityIndicator` or `LoadingIcon` imports left behind by the conversions are the likely findings — remove them.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: the new suites pass. Read failures against the baseline: the 7 suites under `src/components/__tests__` and `src/templates/__tests__` fail to load before any of this work and still will — with the exception of `Skeleton.router.test.tsx`, which is in the `router` project and must pass. Sibling worktrees' tests also run and are not this plan's concern.

Confirm specifically that these pass:

```bash
npx jest src/components/__tests__/skeletonClassName.test.ts \
  src/components/__tests__/Skeleton.router.test.tsx \
  src/screens/traveller/Cards/__tests__/CardsScreen.router.test.tsx \
  src/screens/traveller/Documents/__tests__/DocumentsScreen.router.test.tsx \
  src/screens/shared/Notifications/__tests__/NotificationsScreen.router.test.tsx \
  src/screens/shared/Tags/TagDetail/__tests__/TagDetailScreen.router.test.tsx
```

Expected: 8 primitive tests plus 4 chrome tests (Cards 1 of its 4, Documents 1,
Notifications 2, TagDetail 1), and the 3 pre-existing Cards cases still passing.

- [ ] **Step 7: See it on a device**

Run: `npx expo start --offline`

The `--offline` flag is required. Walk the three cheapest sites to reach: the Tags tab (`TagListSkeleton`, retrofitted), Cards from the traveller home (`CardsSkeleton`), and Documents (`DocumentsSkeleton`). In each, confirm the skeleton appears below the screen title rather than under the status bar — that is the safe-area contract holding — and that the layout does not jump when the real content lands. Check one screen in dark mode, which is what the `bg-border` retirement was for.

- [ ] **Step 8: Commit any cleanups**

```bash
git add -A
git commit -m "chore(skeleton): tidy imports after the skeleton conversions"
```

If nothing changed in Steps 1-7, skip this commit.

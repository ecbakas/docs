# Skeleton loading states: a shared primitive and eleven conversions

**Date:** 2026-08-10
**Repos:** `super-app`

## Problem

The task arrived as "wrap skeletons in SafeAreaView". Exploration showed that
premise does not hold: all three skeletons in the app are already inside a
`SafeAreaView`. `AppShellSkeleton` wraps itself, because `(auth)/_layout.tsx`
returns it in place of the whole shell; `TagCardSkeleton` and `TagListSkeleton`
are nested inside `TabPage`, which owns the insets. Adding a `SafeAreaView` to
the latter two would apply the top inset twice and push each placeholder out of
alignment with the `TagCard` about to replace it — destroying the one property
that justifies a skeleton over a spinner.

The real gap is upstream of that. Of 27 loading sites in the app (20
`ActivityIndicator`, 7 `LoadingIcon`), 11 are first-load content states still
showing a centred spinner. A spinner communicates "something is happening" and
nothing about what. When the data lands, the screen jumps from a centred dot to
a populated layout, and every one of those 11 screens reflows.

Two secondary problems compound it. There is no shared skeleton primitive, so
the two existing skeletons disagree: `AppShellSkeleton` uses `bg-foreground/10`
and `bg-foreground/5`, while `TagCardSkeleton` uses `bg-border`, which is nearly
invisible against `bg-card` in dark mode. And no skeleton except
`TagCardSkeleton` is announced to a screen reader at all.

## Goal

One skeleton convention, expressed as a primitive, applied to every first-load
content state in the app — so that each of those 11 screens loads into the shape
of its own content and fills in rather than reflows.

## Constraints established up front

- **Static, no animation.** Matching `AppShellSkeleton`, which is the newest and
  best-documented of the two existing skeletons. Shape preservation is what earns
  a skeleton its place; the shimmer is decoration, and a pulse would carry a
  `reanimated` shared value into 13 components for it.
- **A skeleton never owns its safe area unless it *is* the screen root.** All 11
  conversion sites render inside `TabPage`, `ModalTemplate`, or `Modal`, each of
  which already declares `edges={["top", "left", "right"]}`.
  `AppShellSkeleton` remains the sole self-wrapping skeleton in the app.
- **A skeleton is for content arriving, not for work in progress.** This is what
  keeps 16 of the 27 sites as spinners: a submit overlay, a camera warm-up, or a
  button's busy state has no incoming content shape to mirror, so a skeleton
  there would assert something false.
- **Shape fidelity over reuse.** Ruled out two generic configurable skeletons
  (`ListSkeleton rows={n}` / `DetailSkeleton sections={n}`). They are far less
  code, but they load every screen into an identical stack of equal boxes and
  reintroduce exactly the reflow this project exists to remove.

## Scope

### The primitive

| Surface | What changes |
| --- | --- |
| `components/Skeleton.tsx` | **New.** `Skeleton` block + `SkeletonRoot` a11y wrapper |
| `localization/resources/en-US.json` | Adds `Common.Loading` |
| `localization/resources/tr-TR.json` | Adds `Common.Loading` |

### Retrofits, done before the new work

| Surface | What changes |
| --- | --- |
| `features/AppShellSkeleton.tsx` | Hand-rolled blocks become `Skeleton`; gains a `SkeletonRoot` |
| `screens/shared/_components/TagStates.tsx` | `TagCardSkeleton` drops `bg-border` for the primitive's tints; its hand-written `accessibilityRole` moves to `SkeletonRoot` |

### The eleven conversions

| # | New component | Replaces | Mirrors |
| --- | --- | --- | --- |
| 1 | `screens/traveller/Cards/_components/CardsSkeleton.tsx` | `CardsScreen.tsx:77-80` | `BankPanel` + `CardRow`, per section |
| 2 | `screens/traveller/Documents/_components/DocumentsSkeleton.tsx` | `DocumentsScreen.tsx:35-38` | `DocumentCard` ×3 |
| 3 | `screens/shared/Notifications/_components/NotificationsSkeleton.tsx` | `NotificationsScreen.tsx:151-158` | notification card ×4 |
| 4 | `screens/shared/Tags/TagDetail/_components/TagDetailSkeleton.tsx` | `TagDetailScreen.tsx:200` | detail sections |
| 5 | `screens/shared/_components/TagPreviewSkeleton.tsx` | `TagPreviewScreen.tsx:232` | preview card |
| 6 | `screens/merchant/CreateTag/_components/CreateTagSkeleton.tsx` | `CreateTagScreen.tsx:119-121` | create-tag form |
| 7 | `screens/staff/StickerTag/_components/StickerTagSkeleton.tsx` | `StickerTagScreen.tsx:239` | resolved tag card |
| 8 | `screens/traveller/Validate/_components/ClaimTagSkeleton.tsx` | `ClaimTagModal.tsx:164-167` | tag card |
| 9 | `screens/refund-point/Refund/_components/MethodPickerSkeleton.tsx` | `MethodPicker.tsx:89` | option tiles ×3 |
| 10 | `screens/refund-point/Refund/_components/RefundableTagListSkeleton.tsx` | `RefundableTagList.tsx:80` | tag rows ×3 |
| 11 | `components/TenantInput/TenantSelectionSkeleton.tsx` | `TenantSelectionModal.tsx:118-120` | tenant rows ×4 |

`TenantInput/` keeps files flat — no `_components/` subdirectory, matching its
`CountryInput` and `PhoneInput` siblings.

### Deliberately out of scope

- **The 16 sites that stay spinners.** Blocking-action overlays
  (`RefundScreen.tsx:168`, `TagDetailScreen.tsx:327`, `TagPreviewScreen.tsx:336`,
  `ClaimTagModal.tsx:250`), camera and device warm-up (`QrScanner.tsx:183`,
  `KycCameraModal.tsx:137`, `CardScannerModal.tsx:146`, `scan-mrz.tsx` ×3),
  inline button-busy and background-refetch indicators
  (`TagListHeader.tsx:66`, `NotificationsScreen.tsx:184`,
  `TenantSelectionModal.tsx:83`, `debug-menu.tsx:93`), the shared `Centered`
  status panel at `ValidateScreen.tsx:353` — which pairs its spinner with a
  title and body text for a family of non-loading states too — and the root
  `app/loading.tsx` route. Each is work in progress, not content arriving.
  11 conversions plus these 16 accounts for all 27 sites.
- **The 7 mis-projected Jest suites.** `src/components/__tests__` and
  `src/templates/__tests__` fail to load because they sit in the `node` project
  and reach nativewind's web JSX runtime, as `jest.config.js:8-14` already
  explains. Pre-existing, unrelated, and its own piece of work.
- **`LoadingIcon` itself.** It stays, unchanged, for the sites above.
- **The hardcoded Turkish strings in `scan-mrz.tsx`.** A real i18n violation,
  but not this project's.
- **`headerRightComponent` on `NotificationsScreen.tsx:149`.** `ModalTemplate`
  accepts no such prop, so it is dead. Noted, not fixed here.

## Design

### `Skeleton` and `SkeletonRoot`

`components/Skeleton.tsx`, per the repo rule that primitives live in
`src/components/**`.

```tsx
type SkeletonTint = "element" | "surface";

export function Skeleton({
  tint = "element",
  className,
  ...props
}: ViewProps & { tint?: SkeletonTint }) {
  return (
    <View
      className={cn(
        "rounded",
        tint === "surface" ? "bg-foreground/5" : "bg-foreground/10",
        className,
      )}
      {...props}
    />
  );
}
```

The two tints are lifted from `AppShellSkeleton`, which already applies them
consistently: `/10` for things that read as foreground — text lines, icons,
badges, avatars — and `/5` for the surfaces they sit on, such as cards and
panels. Both are theme-aware, which `bg-border` was not. `className` comes last
in `cn` so a caller's radius or size always wins.

`SkeletonRoot` carries the accessibility contract:

```tsx
export function SkeletonRoot({ label, className, children }: SkeletonRootProps) {
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
```

`accessible` on the root is the mechanism that matters. It collapses the whole
subtree into a single accessibility element on both platforms, which is why
blocks need no accessibility props of their own. The alternatives do not work:
`importantForAccessibility` is Android-only, and `accessibilityElementsHidden`
hides descendants without covering the root. Putting the role on each block
instead would make a four-card list skeleton announce dozens of progressbars.

`label` is optional and defaults to a new generic key. Per-screen labels would
read better but cost 11 keys for a state that is visible for a few hundred
milliseconds; a caller who wants one can pass it.

### The safe-area contract

Stated in the docblock of `components/Skeleton.tsx`, because a later reader
seeing an inset-less skeleton is likely to "fix" it:

> Skeletons do not render a `SafeAreaView`. Every one of them is a child of
> `TabPage`, `ModalTemplate`, or `Modal`, all of which own
> `edges={["top", "left", "right"]}` already. `AppShellSkeleton` is the sole
> exception, because `(auth)/_layout.tsx` returns it in place of the shell.

The failure mode this guards against is not a missing inset. It is a conversion
that early-returns its skeleton *above* the template, which loses the header,
the back button, and the insets in one move. `TagDetailScreen.tsx:193-203`
already models the correct shape — its loading branch returns a complete
`ModalTemplate` with the loading state as a child. Every conversion follows it.

### Conversion anatomy

Each skeleton mirrors the metrics of the component it stands in for, so that the
replacement is a fill-in rather than a relayout.

**1 — `CardsSkeleton`.** Two sections, each a label line, then a `rounded-3xl`
surface hero mirroring `BankPanel` (an `h-8 w-8 rounded-lg` icon block, a title
line, a trailing pill cluster, a `tracking-widest` number line, and a caption
plus label pair), then 3 rows mirroring `CardRow` (`h-11 w-11 rounded-xl` icon,
a title line with an optional badge pill, an `text-xs` subtitle line, two 20pt
trailing action blocks). Three rows per section matches the 2–5 typical
methods the cards screen was designed around.

**2 — `DocumentsSkeleton`.** 3 cards, each `rounded-2xl border border-gray-200
bg-white p-4 gap-2`: a row of a `size-10` round icon block with title and
subtitle lines beside it, then a wrapping row of 3 badge pills, matching
`DocumentCard`'s status and evidence-level badges.

**3 — `NotificationsSkeleton`.** 4 cards, each `mb-4 rounded-2xl` with `p-4`
contents: a `w-14 h-14 rounded-2xl` icon block, a title line, and two body
lines. The existing `MobileApp.Notifications.Loading` string is dropped from the
UI and reused as this skeleton's `label` override, so the key stays live.

**4 — `TagDetailSkeleton`.** Mirrors the detail body: a `flex-row flex-wrap
border-b border-gray-200 pb-4 mb-4` grid of 4 label-over-value pairs at `w-1/2`,
the second column right-aligned as the real screen has it, then two surface
blocks standing in for `TagTimeLine` and `Totals`. Rendered inside the
`ModalTemplate` already present at `TagDetailScreen.tsx:193`.

**5 — `TagPreviewSkeleton`.** Mirrors the `gap-4 pt-2` success body: a
`rounded-2xl border border-gray-200 bg-white p-4 gap-3` card of label/value
`Row` pairs with a status pill on its second line, then a `flex-row items-start
gap-3 rounded-2xl bg-gray-100 p-4` note block with a leading icon.

**6 — `CreateTagSkeleton`.** Mirrors the scroll body inside the existing
`TabPage`: a `flex-row gap-2` row (a wide `CardAction` block beside a small
square clear button), an `mt-3` row of product-group pills, an `mt-2` amount
display block, then the `Numpad` grid and a trailing action button.

**7 — `StickerTagSkeleton`.** The resolved tag card. This site keeps its
`MobileApp.Qr.StickerTag.Resolving` copy: the state covers a resolution step, so
the explanatory text is doing work a skeleton cannot, and only `LoadingIcon` is
replaced.

**8 — `ClaimTagSkeleton`.** The tag card, in the `isBusy && !tag` branch only.
The `isClaiming` overlay below it stays a spinner.

**9 — `MethodPickerSkeleton`.** Keeps the card chrome and its `Method` label,
replacing only the bare spinner with 3 tiles at `flex-1 basis-24 rounded-xl
border p-3`, each an icon block over a label line.

**10 — `RefundableTagListSkeleton`.** Keeps the card chrome and the
export-validated filter pills, which stay interactive while tags load; 3 row
placeholders below them.

**11 — `TenantSelectionSkeleton`.** 4 rows at `flex-row items-center
justify-between border-b border-gray-200 py-3`, each a name line and a trailing
chevron block.

## Testing

`components/__tests__/Skeleton.router.test.tsx` — the `.router` suffix is
mandatory for anything that renders, per `jest.config.js:8-14`; a plain
`.test.tsx` would land in the `node` project and fail to load, repeating the
mistake that already breaks 7 suites. It covers:

- `tint="element"` and `tint="surface"` map to `bg-foreground/10` and
  `bg-foreground/5`
- a caller's `className` overrides the default radius
- `SkeletonRoot` exposes exactly one `progressbar`, labelled from
  `Common.Loading`, with its blocks not individually announced
- a `label` override replaces the default

**The template-chrome pins.** For each converted screen, assert that the
template's chrome is still on screen *while loading* — the title renders, and
the back button renders where the screen has one. This is the direct test of the
safe-area contract: a conversion that early-returns above its template still
looks correct in a snapshot but has silently dropped the header and the insets,
and only this assertion catches it. `CardsScreen.router.test.tsx` already
renders end-to-end from a mocked API list, so it hosts the first one.

Baseline, so the implementer does not read known failures as regressions: 7
suites under `src/components/__tests__` and `src/templates/__tests__` fail to
load before any change, and `npm test` also picks up sibling worktrees' tests.

## Sequencing

1. `components/Skeleton.tsx`, the two `Common.Loading` keys, `npm run init`
   (required before tsc accepts a new key), and the primitive's test.
2. Retrofit `AppShellSkeleton` and `TagCardSkeleton`. Deliberately before the
   new work: it proves the primitive against two shapes already known to be
   right, so a flaw surfaces in 2 components rather than 13.
3. Conversions, grouped so that each group reuses the previous one's patterns —
   list-shaped (1, 2, 3, 11, 10), then detail-shaped (4, 5, 8, 7), then
   form- and tile-shaped (6, 9).
4. Verify: `npx tsc --noEmit`, `npm test`, `npx eslint`, read against the
   baseline above.

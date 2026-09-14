# Refund-agent screens adopt the customs-agent layout

**Date:** 2026-09-14
**Repo:** `super-app`
**Status:** approved design, ready for planning

## Goal

The refund-agent's Home and refund surfaces must read as the same screen family
as the customs-agent's Home and its export-validate flow. Today they do not:
customs Home is a full worklist, while refund Home is a launcher card in front
of a separate `/refund` form.

The end state is one refund worklist at Home, built from the same components
customs uses, with the submit-time details collected in a bottom sheet the way
`ExportValidateSheet` collects them.

## Starting point

| | customs-agent | refund-agent |
|---|---|---|
| Home | `screens/customs/Home/HomeScreen.tsx` — pinned traveller filter card, date preset chips, risk summary tiles, select-all controls, `TagCard` rows, floating `ActionFooterRow` | `screens/refund-point/Home/HomeScreen.tsx` — one CTA card plus a centred placeholder string |
| Action surface | `ExportValidateSheet` — a bottom sheet of three optional inputs | `screens/refund-point/Refund/RefundScreen.tsx` at `/(auth)/refund` — traveller card, method picker, bespoke tag rows, signature pads, pinned `RefundSummaryBar`, confirm sheet |

## Decisions

Each was settled during brainstorming; they are recorded here as decisions, not
options.

1. **Home becomes the worklist and `/refund` is retired.** One refund surface,
   as customs has one.
2. **The worklist is refund-point-wide.** It opens onto every refundable tag for
   the refund point; a traveller narrows it. The traveller-less call is
   permitted by the contract (see Constraints).
3. **Ticking a row narrows the list.** The first tick behaves as though the
   operator had picked that row's traveller.
4. **The sheet owns totals, card fields and signature pads.** The scroll body
   reduces to filters plus list, matching customs.
5. **A successful refund keeps its full-screen takeover.** `RefundSuccess`
   survives; its reset returns to a refetched worklist. This is the one
   deliberate divergence from customs, because a cash handover deserves a
   confirmation the operator must acknowledge rather than a dismissable toast.

## Constraints discovered in the code

These bound the design and are not preferences.

- **`GetApiTagServiceTagTagsRefundData` has no date parameters.** Its full
  filter set is `isExportValidated`, `refundPointId`, `refundType`, `tagIds`,
  `travellerDocumentNumber`, plus paging. Customs' Today/Week/Month/All chips
  therefore cannot be ported; that slot takes the export-validated toggle.
- **`travellerDocumentNumber` on the request is optional**, which is what makes
  a refund-point-wide worklist possible at all.
- **`travellerDocumentNumber` on `TagListItemDto` is required** (non-nullable),
  and `travellerFullName` is present, so a ticked row always identifies its
  traveller.
- **`CreateRefundDto` carries only `tagIds`** — no traveller field — and
  `canSubmit` never requires a traveller. The traveller is implicit in the tags.
  Nothing today prevents a selection spanning two people, because the list has
  always been traveller-scoped.
- **`getTravellerByDocumentNumber`** exists in
  `actions/TravellerService/actions.ts`, so a ticked row can be resolved to the
  full traveller record the card needs.
- **Risk is customs-only**, gated behind `TagService.TagRisks.ViewRiskLevel`.
  The summary-tile slot takes the method tiles instead.
- **`/refund` has exactly one caller** — the Home CTA being deleted — plus a
  test stub. The `initialIsExportValidated` docblock claims the tag detail links
  here, but no such caller exists.
- **`ActionFooterRow` is a label-only floating pill chain.** It cannot carry a
  running total, but `MobileApp.Refund.Submit` already accepts an `{amount}`
  parameter, so the pill label carries it.

## Architecture

### Navigation and files

`screens/refund-point/Home/` becomes the worklist, mirroring
`screens/customs/Home/` one for one.

`screens/refund-point/Refund/` is removed entirely; its contents are moved,
split or deleted as listed below.

**Deleted outright**

- `app/(auth)/refund.tsx`
- the `Tabs.Screen name="refund"` registration in `app/(auth)/_layout.tsx`
- `screens/refund-point/Home/HomeScreen.tsx` (the launcher)
- `Refund/RefundScreen.tsx` — its composition moves into the new `Home/HomeScreen.tsx`
- `Refund/useRefundFlow.ts` — absorbed by `Home/useRefundHomeFlow.ts`
- `Refund/_components/RefundSummaryBar.tsx` — replaced by `ActionFooterRow`
- `Refund/_components/RefundableTagList.tsx` — replaced by `Home/_components/RefundTagList.tsx`
- `Refund/_components/RefundableTagListSkeleton.tsx`
- `Refund/_components/TravellerSearchCard.tsx` — folded into shared `TravellerFilterCard`
- `customs/Home/_components/CustomsTravellerCard.tsx` — same
- `customs/Home/_components/CustomsListControls.tsx` — folded into shared `BatchListControls`
- `customs/Home/_components/CustomsTagRow.tsx` — folded into shared `BatchTagRow`

**Split**

- `Refund/_components/MethodPicker.tsx` splits in two: the tile row becomes
  `Home/_components/MethodTiles.tsx` (a filter), and the card-number/expiry
  fields with their blur-gated validation move into the confirm sheet (a
  submit-time detail). `MethodPickerSkeleton.tsx` moves alongside `MethodTiles`.

**Added or moved**

- `Home/HomeScreen.tsx` — the worklist screen
- `Home/useRefundHomeFlow.ts` — absorbs `useRefundFlow` and adds paging/filters
- `Home/_components/MethodTiles.tsx`
- `Home/_components/RefundTagList.tsx` — loading, error, empty and Load more
  around a list of shared `BatchTagRow`s. Mirrors `CustomsTagList` **without**
  its actionable/blocked split: `splitByActionable` is a customs concept, and
  refund's own non-selectable rows are decided by currency and traveller and are
  expressed by omitting the checkbox, not by sinking the row into a folded group.
- `Home/_components/RefundConfirmSheet.tsx` — moved and extended
- `Home/_components/RefundSuccess.tsx` — moved unchanged; it renders in place of
  the worklist inside `TabPage`, exactly as it does inside `RefundScreen` today
- `refund.logic.ts`, `method-labels.ts` — moved unchanged

### Shared components

Three components are promoted into `screens/shared/_components/` rather than
duplicated:

| new shared component | sources |
|---|---|
| `TravellerFilterCard` | `CustomsTravellerCard` + `TravellerSearchCard`, already near-identical |
| `BatchListControls` | `CustomsListControls` |
| `BatchTagRow` | `CustomsTagRow`, with the risk badge behind an optional `footer` prop |

Differing labels are passed as props.

The reason is drift: a copy-paste makes the two screens identical for one week.
The cost is that this edits customs, so customs' four existing router tests are
the safety net and must stay green.

### Data flow — `useRefundHomeFlow`

The hook returns the same shape as `useCustomsHomeFlow` where the concepts
overlap: `traveller`, `setTraveller`, `tags`, `totalCount`, `isLoading`,
`isLoadingMore`, `canLoadMore`, `loadMore`, `hasError`, `errorMessage`,
`selectedIds`, `selectedTags`, `toggleTag`, `selectAll`, `clearSelection`,
`isSubmitting`. It adds `method`, `setMethod`, `isExportValidated`,
`setIsExportValidated`, `card`, `signatures`, `totals`, `canSubmit`, `submit`,
`createdRefund`, `reset`.

**Query mapping.** `refundPointId` always; `refundType` from the selected
method; `isExportValidated` from the toggle; `travellerDocumentNumber` only when
narrowed; `skipCount`/`maxResultCount` behind an explicit Load more, as customs
does rather than an infinite scroll.

No method selected means no `refundType` filter — the list shows everything and
picking a method narrows it. The footer stays disabled until `canSubmit`, which
requires a method, so an operator who ticks before choosing one sees a disabled
pill rather than a silent failure.

**First-tick narrowing.** Ticking a row while the list is wide sets
`travellerDocumentNumber` from that row and refetches narrowed, while resolving
the full traveller through `getTravellerByDocumentNumber` in parallel to fill
the card.

If that lookup fails, the tick and the narrowed query still stand and the card
falls back to the row's `travellerFullName` with no nationality line. A
cosmetic lookup must never block a payout.

**Selection rule.** One rule, no special cases: *after any refetch, the
selection is pruned to tags still present in the new list.* Traveller narrowing
keeps the anchor tick by construction. A method change drops whatever that
method no longer offers. Clearing the traveller returns to the wide list and
clears the selection, because a selection implies a traveller.

Currency compatibility (`isCurrencyCompatible`) continues to apply within a
traveller, unchanged.

**Select all is only offered once narrowed.** On the wide list it would tick
tags belonging to different people, which is not a refund anyone can submit, so
`BatchListControls` renders its Select all only when a traveller is set. The
running count and Clear are always available. Customs keeps Select all
unconditionally — this is a prop, not a behaviour change on their side.

**Focus reset is removed.** `useRefundFlow`'s `useFocusEffect` reset exists only
because `/refund` was a retained `href: null` tab that re-focused with the
previous customer's data in it. As the landing tab, that same reset would wipe a
half-built refund every time the operator glances at another tab and returns.
Reset now happens on a successful refund or an explicit clear.

### Layout mapping

| customs Home slot | refund Home occupant |
|---|---|
| pinned traveller card | same component, refund labels |
| pinned "Assign draft" button | *empty* — refund has no setup action |
| date preset chips | export-validated toggle, two chips, same pill styling |
| `TagSummaryBar` risk tiles | method tiles, reusing the existing `METHOD_ICONS` map |
| `CustomsListControls` | `BatchListControls`, carrying "N selected"; Select all only once narrowed |
| `CustomsTagList` → `TagCard` rows | `RefundTagList` → shared `BatchTagRow` → the same `TagCard`, minus the risk footer and the actionable/blocked split |
| Load more | same |
| floating `ActionFooterRow` "Export validate" | floating `ActionFooterRow` "Refund €55" |
| footer `moreActions: [Deny]` | none |

The footer keeps customs' exact positioning: absolutely positioned, measured
via `onLayout` into the scroller's `paddingBottom`, and inset by
`Math.max(insets.bottom, tabInset) + FOOTER_GAP`.

### The sheet

`RefundConfirmSheet` takes the `ExportValidateSheet` shape — totals breakdown,
card fields when `CreditCard` is selected, signature pads, Confirm and Cancel.
It keeps its current in-flight protections: content panning and pan-down-to-close
disabled while submitting, backdrop taps blocked, Android back deliberately live
because `fetchRequest` has no timeout.

**Nested-sheet hazard.** `SignatureSheet` is itself a `BottomSheetModal`.
Presenting it over the confirm sheet requires `stackBehavior="push"`, or the
confirm sheet minimizes and its dismissal restore-crashes with "index out of
snap points range". This repo has already hit exactly that failure with Toast.
It reproduces only on device, so the unit tests cannot catch it — on-device
verification is required before this is called done.

## Error handling

- Worklist call fails — the list area shows the error message in the same slot
  customs uses, with the server's own explanation when it sent one.
- Traveller lookup after a first tick fails — degrade as described above; do not
  block.
- Payment-methods call fails — the method tile row shows its error state with a
  retry, as `MethodPicker` does today.
- Refund submit fails — the sheet stays open, the form, selection and signatures
  all survive, and the server's own message is preferred over the generic
  string. Unchanged from today.

## Testing

- `Home/__tests__/useRefundHomeFlow.router.test.ts` — filter-to-query-param
  mapping, first-tick narrowing including the lookup-failure path, selection
  pruning across refetches, `canSubmit` transitions.
- `Home/__tests__/RefundPointHomeScreen.router.test.tsx` — worklist renders,
  footer disabled states, sheet presentation.
- `refund.logic.test.ts` carries over unchanged.
- `refundReentry.router.test.tsx` is deleted along with the focus-reset
  behaviour it guards.
- `app/__tests__/tabBackNavigation.router.test.tsx` — remove the
  `"(auth)/refund"` stub.
- Customs' four existing router tests must stay green; they are the guard on the
  shared-component promotion.

Render tests must be named `*.router.test.*` to be picked up. New i18n keys
require `npm run init` before `tsc` will pass.

## Risks carried

- **The traveller-less worklist's real-world size is unverified.** A spike
  against a live environment was offered and declined. Paging carries the volume
  either way, but a busy refund point may make the wide list noisy enough to be
  worth revisiting.
- **The nested-sheet crash is device-only.** No unit test can catch it.

## Out of scope

- The landscape refund-point tag grid (`Tags/Tag/landscape/refund-point/`) is
  untouched; it has no navigation into the refund flow.
- Customs' own behaviour. The shared-component promotion must be a pure
  refactor there.

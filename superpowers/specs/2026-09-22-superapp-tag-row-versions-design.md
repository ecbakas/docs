# Switchable tag-row designs (V1 / V2 / V3)

**Repo:** `super-app` · **Date:** 2026-09-22

## Problem

The portrait tag list row carries five status signals at once — a coloured rail,
a status pill, an early-refund pill, a risk dot and a deadline pill — and two of
them are the same field said twice, because the rail and the status pill both
come from `tagStatusTone`. The headline amount is unlabelled, so a purchase and
a refund look identical even though `tagHeadlineAmountKind` already knows which
it is and only the Home hero prints it. At ~117px a row, five tags fill a phone.

Rather than pick one replacement, we ship **three row designs and let the
install choose**, so the two candidates can be compared on real data by the
people who read these lists all day.

Mockups, every role and state, drawn at 390×844 against the app's own
`global.css` tokens: <https://claude.ai/artifact/KTS1UxY7LjDYgptdXG74vY>

## The three versions

| | Name | Stored value | The row |
|---|---|---|---|
| V1 | Current | `classic` | Today's `TagCard` / `CustomsTagRow`. Untouched. |
| V2 | Pill | `pill` | Flat ledger row; a 6px colour bar flush at the leading edge. |
| V3 | Tinted | `tinted` | The same flat row; no bar, the whole row washed at 10%. |

Exact values, so neither has to be re-derived from the mockups:

- **V2 bar** — `width: 6px`, no left margin, vertically inset 12px, and
  `border-radius: 0 999px 999px 0`: square where it meets the screen edge,
  rounded where it meets the row.
- **V3 wash** — the same token at 10% alpha (`#16A34A1A` and friends), flat
  across the whole row, over a white base. At 10% it lands very close to the
  `-surface` tokens the landscape grid already paints via `customsRiskSurface`,
  so picking V3 makes portrait and landscape agree.

**The trade the switch exposes, in one line:** V2 spends the row background on
*selection*; V3 spends it on *status*. Both cannot have it. In V3 a selected row
has no fill and is marked by its tick and by heavier rules alone.

### What V2 and V3 share

Both are the same **card-less** row: rows sit on one surface, hairline-separated,
running the full width — no per-row border, no 10px gap.

- **Identity left, money right.** Serial (monospace), traveller or store, then
  status and the full date. The money column is right-aligned and captioned
  `PURCHASE` or `REFUND` from `tagHeadlineAmountKind`.
- **Status is said once** — a coloured word, not a word *and* a pill.
- **The full date carries a 4-digit year** (`12 Sep 2026`).
- **Customs colours by RISK; every other role colours by STATUS.** This is the
  one place the two diverge, and it is deliberate: risk is what a customs
  officer triages by, and it is what the summary tiles above the list filter on,
  so pressing **High** leaves exactly the red rows on screen.
- **Dividers** are `#D1D5DB`, stepping up to `#9CA3AF` on any boundary that
  *touches* a selected row — which frames a selected block rather than
  underlining single rows.

### Rejected, and why

Recorded so they are not re-proposed: a 2-line statement row (lost the amount's
prominence), a 3-line "calm" row (too small a gain), day-grouped headers (changed
the list, not the row), tinting the tag **number** itself (two colour systems on
one row in customs, and small text forced darker tints), and a left-to-right
gradient fade (same problem, softer).

## Scope

**In:** the portrait tags list (traveller, merchant, refund point) and the
customs portrait worklist.

**Out:** the Home "latest tag" hero (`LatestTag`, no mockup covers it) and the
landscape grid (`TagGrid`, structurally unrelated). Both keep rendering V1
regardless of the stored choice. This is a deliberate inconsistency for now: a
customs officer who picks V3 sees tinted rows in the tab and today's card on
Home.

## Architecture

### Where the branch lives

**One new row component, chosen at the two list sites.** `TagCard` and
`CustomsTagRow` are not modified, so the switch cannot regress what ships today
and V1's existing tests keep passing untouched.

Rejected: threading a `design` prop *into* `TagCard` — it is already 279 lines
and would then hold three layouts, so every V2/V3 edit would put V1 at risk. Also
rejected: a row registry keyed by variant, which is indirection for three cases
that a branch states more plainly.

### `src/store/tagRowDesign.ts` (new)

A near-copy of `store/profileDesign.ts`, which is the established pattern for a
persisted design-variant choice:

- `export type TagRowDesign = "classic" | "pill" | "tinted"`
- `DEFAULT_TAG_ROW_DESIGN = "classic"` — **nothing changes for anyone until they
  opt in**, and flipping this constant is the whole ship/unship lever.
- `persist` + `createJSONStorage(AsyncStorage)`, `version: 1`, and a `merge` that
  falls back to the default unless the stored value is one of the three. A value
  from a renamed variant must never be cast through, because `design` is typed
  at every read site.
- `useTagRowDesign()` selector hook.

Per install, not per account — the same reasoning as `deviceSettings`: a shared
shop tablet keeps the choice across sign-ins.

### `src/screens/shared/_components/TagRow.tsx` (new)

The flat ledger row, presentational and memoised like `TagCard`.

```
tag, secondary, showRisk, currencyCode, formatDate, formatAmount, onSelect
tint:  "pill" | "wash"      // V2 or V3
tone:  "risk" | "status"    // which field the colour states
leading?: ReactNode         // the customs checkbox
selected?: boolean
```

`tone` is a prop rather than something the row derives from the role, so the row
stays presentational and the decision sits with the list that already knows the
role.

### List wiring

- **`TagScreen`** — `renderItem` branches on the design; for V2/V3 the list
  drops its 12px gaps and renders separators instead. No selection here, so
  every separator is the base weight.
- **`CustomsTagList`** — branches the same way, passing its checkbox as
  `leading`. It owns separator strength, because **only the list knows both
  neighbours** of a boundary; a row cannot decide this alone.

### Profile

A `SettingsGroup` row (`Tag list style`, showing the current choice) opening a
three-option picker, modelled on the existing `ProfileDesignPicker`.

Added to **`StaffProfileScreen`** and **`IdentityTravellerProfile`** only. Those
two cover all four roles under `DEFAULT_PROFILE_DESIGN = "identity"`; the three
classic screens are reachable only from the debug menu, so wiring five screens
would be work nobody sees. Labels translated in `en-US` and `tr-TR` — travellers
see this, so the copy names what changes, not "V2".

## A contrast fix that is not cosmetic

`success` (`#16A34A`) and `warning` (`#D97706`) are ~3.1:1 on white, below AA for
the small text the status word is set in. V2/V3 use `#15803D` and `#B45309`
(~4.6:1). `--color-success-strong` already exists in `global.css` for exactly
this reason on fills; the same problem applies to small text and is not yet
covered. V1 is left alone — fixing it there is a separate change with its own
visual review.

## Testing

- **Store** — an unknown stored value falls back to the default rather than
  being cast through.
- **`TagRow`** — pill vs wash; risk vs status; the money caption; the full date;
  a row with no `leading` renders no checkbox.
- **Lists** — each renders `TagCard`/`CustomsTagRow` for `classic` and `TagRow`
  for the other two; customs passes its checkbox through.
- **Separators** — a boundary touching a selected row is the heavier one.
- **Picker** — writes the store; the Profile row reflects the current value.
- **Regression** — every existing V1 test passes unchanged. If one needs editing,
  the branch is wrong.

Render tests are named `*.router.test.*`, per this repo's jest projects.

## Open, deliberately not decided here

- **Merchant reads risk in the dot and status in the pill — the inverse of
  customs.** V2/V3 make merchant's colour carry status, so the merchant *dot*
  keeps meaning risk; this is the same collision in a new place. Worth settling
  before either variant is made the default.
- **Unknown risk** has no colour: `customsRiskEdge` returns `""` and the row
  falls back to the border token, which is now fainter than the divider beside
  it. V2/V3 draw `#D1D5DB`.

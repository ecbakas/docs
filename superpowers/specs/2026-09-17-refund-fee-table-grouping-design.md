# Group the refund fee detail table by fee type and refund method — web-app

**Date:** 2026-09-17
**Repo:** `web-app` (`unirefund-web`)
**Branch point:** `feat/explore-viewport-layers` @ `2f009058c`
**Route:** `/[lang]/settings/templates/refund-fees/new` and `/[id]`

## Goal

The refund fee detail editor stops being one flat table of every row and becomes
an accordion of sections, each holding its own table rows and its own
visualizer. A selector chooses what the sections are keyed on: fee type +
refund method (the default), refund method alone, or fee type alone.

## Why

The table renders every row of `refundFeeDetails` in one list while the
visualizer immediately below it groups those same rows by
`feeType-refundMethod` and validates each group independently. The user reads a
grouped verdict and then has to find the offending row in an ungrouped table —
the two halves of the same screen disagree about what the unit of work is.
Validation is defined per `feeType + refundMethod` (see `schema.ts`, rules 2.2,
2.4 and 2.5), so the visualizer's grouping is the real one and the table is the
odd one out.

A template needs at least a TouristFee and an AgentFee ladder (rule 2.1) and may
carry up to five fee types across six refund methods. The flat table has no
structure at that size.

## Decisions

Four were put to the user and answered.

1. **Three grouping modes, no flat mode.** Combined (`feeType + refundMethod`)
   is the default and matches validation exactly; the other two are refund
   method alone and fee type alone. An explicit ungrouped mode was rejected —
   expanding every section already gives that view, and a fourth mode would
   keep two rendering paths alive.
2. **All eight columns stay visible in every section**, including the two the
   section header already names. Hiding the columns a grouping holds constant
   was considered and rejected: it would make a row's fee type or method
   editable only in a mode where that column is shown, so moving a row between
   groups would force a mode switch.
3. **Adding works at both levels.** Each section gets an Add that continues its
   own ladder — fee type and method pre-filled, `amountFrom` seeded from the
   last row's `amountTo`. The existing toolbar Add stays as-is for starting a
   combination that has no section yet.
4. **Sections default to all-open**, so the page reads like today's table on
   first load rather than hiding every row behind a closed accordion.

## Design

### Grouping is display-only

The form state stays a single flat `refundFeeDetails` array. Every input is
registered at `refundFeeDetails.${index}.<field>`, and `useFieldArray`'s
`remove(index)` addresses the same flat positions, so **every grouped row must
carry its original index in that array**. Sections are a view over the array,
never a restructuring of it. The submitted payload does not change.

This index mapping is the load-bearing part of the change and the most likely
place for a silent bug — an off-by-one here edits or deletes the wrong row
rather than throwing. It therefore lives in the pure module, where it is
directly testable.

### `sectionRefundFeeDetails(details, mode)`

Added to `_components/detail-groups.ts` alongside the existing
`groupRefundFeeDetails`:

```ts
export type GroupingMode = "combined" | "refundMethod" | "feeType";

export interface RefundFeeSection {
  key: string;               // stable accordion value and React key
  feeType?: string;          // set when the mode fixes it
  refundMethod?: string;     // set when the mode fixes it
  rows: RefundFeeDetail[];   // each carries originalIndex, as groupRefundFeeDetails already does
  issues: RefundFeeIssue[];  // union over the ladders this section contains
}
```

Rows reuse the module's existing `originalIndex` field — the position in the
field array — rather than introducing a second index concept beside it. Do not
add a parallel `index`.

Section rows hold the **raw** form values, uncoerced. Coercion belongs to
`groupRefundFeeDetails`, which is read-only; the table's cells bind through
`Controller` at `refundFeeDetails.${originalIndex}.<field>` and read their value
from react-hook-form directly, never from the section object. Coercing here
would fight the user mid-keystroke, turning a half-typed `"5."` into `5`. The
section's own row values are used only for ordering, for computing `issues`, and
for seeding the per-section Add from the last row's `amountTo`.

`key` is `"TouristFee-Cash"` in combined mode, `"Cash"` grouped by method,
`"TouristFee"` grouped by fee type. Section order follows first appearance in
the field array, which keeps sections from reshuffling as rows are edited.

**Rows inside a section keep field-array order and are not sorted.** Sorting by
`amountFrom` the way `groupRefundFeeDetails` does would re-order rows while the
user is typing into an amount cell, moving the input out from under the caret.
The visualizer can sort because it is read-only; the table cannot.

A section's `issues` is the union of the issues of every ladder it contains,
obtained by running the existing `groupRefundFeeDetails` over the section's
rows. In combined mode that is exactly one ladder; in the other two it may be
several, so a section reads as clean only when all of its ladders are.

### Rendering

`_components/refund-fee-details.tsx` becomes a toolbar over an accordion:

- **Toolbar:** grouping-mode `Select`, the existing visualizer toggle, the
  existing global Add.
- **Body:** `<Accordion type="multiple">`, one `<AccordionItem>` per section,
  `value={section.key}`.
- **Each item's header:** the localized section label, its range count, and a
  validity indicator derived from `section.issues`.
- **Each item's content:** the existing table markup filtered to that section's
  rows, a per-section Add, and `<RefundFeeDetailsVisualizer details={...} />`
  for those rows.

The row markup moves out into a `RefundFeeDetailRow` component taking the
field-array index. `refund-fee-details.tsx` is already 641 lines; keeping eight
inline `Controller` blocks and adding an accordion around them would push it
well past what can be read or edited reliably.

### The visualizer is unchanged

`RefundFeeDetailsVisualizer` already groups whatever rows it is given by
`feeType-refundMethod`. Handing it one section's rows therefore renders one card
per ladder inside that section, and the per-card Copy-to menu keeps working in
all three modes with no change. Grouping by method or by fee type falls out of
the existing component for free.

`availableTargetMethods` is still called with the **full** detail list, not the
section's rows, so an occupied method is excluded no matter which section the
card is rendered in.

### Open state

Open sections live in component state, defaulting to every section key. Changing
the mode changes the key set, which resets it to all-open.

Changing a row's fee type or refund method moves that row to a different
section. If the target section is collapsed the row would appear to vanish, so
that section is opened when a row lands in it.

### Errors

Unchanged. The array-level `formState.errors.refundFeeDetails.root` banner stays
above the accordion, and per-row errors keep calling
`getFieldError(field, originalIndex)` — correct precisely because the original
indices are preserved.

### Localization

Five new keys in both `resources/en.json` and `resources/tr.json`:

| Key suffix | English |
|---|---|
| `refundFeeDetails.groupBy` | Group by |
| `refundFeeDetails.groupBy.combined` | Fee type + refund method |
| `refundFeeDetails.groupBy.refundMethod` | Refund method |
| `refundFeeDetails.groupBy.feeType` | Fee type |
| `refundFeeDetails.addToGroup` | Add to this group |

Section labels reuse the existing `RefundFeeTable.Form.refundFeeDetails.feeType.*`
and `Contracts.refundMethod.*` keys.

## Testing

`_components/detail-groups.test.ts` gains a `sectionRefundFeeDetails` suite. Run
with `npm run test:unit` from `apps/web` (`node --import tsx --test`, which
cannot load JSX — this is why the logic is in a `.ts` module).

- combined mode yields one section per `feeType + refundMethod`
- refund-method mode merges several fee types into one section
- fee-type mode merges several methods into one section
- **every row keeps its original field-array index, in all three modes** — the
  one test that protects against editing or deleting the wrong row
- rows keep field-array order within a section rather than being sorted
- a section containing one clean and one broken ladder reads as broken
- an empty detail list yields no sections

Then `npx tsc --noEmit` and `npx eslint` over the route, both from `apps/web`.
Note that `eslint-plugin-react-require-testid` requires a `data-testid` on every
interactive element, including `AccordionTrigger` and the mode `Select`.

Component rendering stays untested — `apps/web` has no JSX-capable unit runner,
and its Playwright suite needs a signed-in session against a live backend.

## Risks

- **Index mapping** is the one place a bug is silent rather than loud. Mitigated
  by isolating it in the pure module and testing it per mode.
- **Row jumping between sections** on a fee-type or method change is deliberate
  and correct, but is a visible movement the user did not ask for. Opening the
  target section is the mitigation; if it still reads badly, the fallback is to
  scroll the moved row into view.
- **No visual verification.** Nothing here is checked in a browser, so the
  accordion's behaviour at narrow widths and with many sections open is unproven
  until someone looks.

## Out of scope

- The submitted payload, the zod schema and every validation rule in it.
- `preview-calculation.tsx`.
- The `RefundFeeDetailsVisualizer` component itself.

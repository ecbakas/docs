# SP6: tag detail parity — pos-app

**Date:** 2026-09-09
**Repo:** `pos-app` (`unirefund-pos`)
**Branch point:** `feat/tag-list` (SP5), on SP4 → SP3 → SP2 → SP1 — **not `main`**
**Program:** [2026-09-09-posapp-parity-program-design.md](2026-09-09-posapp-parity-program-design.md) — sub-project 6 of 7
**Covers:** T4 (tag detail styles and functionality) and the rest of T5 (action-button style)

## Goal

The merchant's tag detail reads like super-app's — identity card, progress rail,
amounts statement, purchase blocks, documents — with its two actions in the
footer super-app uses, and pos-app's receipt printing untouched.

## Why

pos-app's detail is a 351-line `TagDetailView` rendering a two-column info
grid, a traveller card, an invoice list and a totals card. Three concrete
faults, all subsumed by the rebuild:

- **The traveller's document number is labelled "Tag number."**
  `TagDetailView.tsx:228` passes `t("MobileApp.Tags.TagNumber")` to the field
  holding `travellerDocumentNumber`.
- **`Totals` prints raw enum names.** `totalType` goes to the screen as
  `GrossRefund`, `SalesAmount`, `VatAmount`.
- **A failed fetch spins forever.** `useTagDetail` returns `undefined` both
  while loading and on failure, and the screen renders a spinner for
  `undefined`. There is no error branch and no retry.

## The constraint that shapes everything

**`TagDetailView` is not just the route body.** Both sale screens render it as
an in-place overlay after issuing a tag
(`SaleScreenV2.tsx:975`, `SaleScreen.tsx:591`), passing a locally-built detail
so the receipt prints with no round-trip. It also owns:

- `printTagDetail(silent, onStage)` → `tagPrintTemplate` → `print()` from `usePrinter`
- the auto-print effect with its 10s timeout and `settled` guard
- long-press on Print → `PrinterModal`
- `payoutCard` as a **prop**, deliberately not a store read, so reprinting an
  older tag cannot put the previous customer's card on the receipt

All of that is the POS's core function and **none of it changes**. Its prop
shape stays identical, so both sale screens keep working untouched.

## Decisions

1. **super-app's action engine is not ported.** `tagActions.ts` (324 lines) and
   `actionTier.ts` decide between eight actions — export-validate, deny,
   re-approve, revoke, assign traveller, change sales person, refund, print —
   across customs and merchant scopes, gated on four grant pairs. pos-app has
   **two**: Print and New Sale. A verdict engine for two actions, six of which
   have no endpoint wrapper or route in this app, would be dead code. T5 asks
   for the *style*, which is `ModalTemplate`'s footer — built in SP4.
2. **The two actions move from corner FABs into the footer.** Today they are
   80×80 circular `Pressable`s absolutely positioned bottom-left and
   bottom-right, outside `ModalTemplate`. They become `action` (Print, filled)
   and `secondaryAction` (New Sale, outline). Long-press for printer settings is
   preserved by keeping the sheet and wiring the pill's `onLongPress`.
3. **No deadline strip.** super-app's `TagDeadlineCard` renders only for
   `scope === "Traveller"`. pos-app is merchant-only, so it never would.
4. **`useTagDetail` gains a status.** It returns
   `{ tagDetailData, status, reload }` with `status: "loading" | "ready" |
   "forbidden" | "error"`, so the screen can offer a retry — and withhold one
   on a 403, where retrying cannot help. Only `TagDetailScreen` consumes the
   hook, so this change is contained; `TagDetailView` still takes a
   non-nullable detail.
5. **The scope union collapses.** super-app's `TagDetailData` is a discriminated
   union over `Staff` / `Traveller` DTOs with a `staffTagOf()` accessor, because
   every staff-only field is optional and an `in` check fails open. pos-app has
   one DTO — `UniRefund_TagService_Tags_TagDetailDto` — so the union and the
   accessor are unnecessary. pos-app's existing `TagDetailData` wrapper
   (`{tagDetail, vatStatementHeader?, refundDetail?}`) stays, because the sale
   flow's `buildLocalTagDetail` produces it.
6. **The VAT-statement and refund-detail blocks are out.** Those two wrapper
   fields are never populated — the cross-service reads are commented out in
   `actions.ts` — so their sections would always render empty. Their i18n
   groups (`VatStatementStatus`, `PaymentStatus`, 12 keys) were left out of the
   port for the same reason.

## Structure

| File | Responsibility |
| --- | --- |
| `src/utils/tagAmounts.ts` | canonical total order, deductions, the net row, the rate footnote |
| `src/utils/tagJourney.ts` | the ordered progress steps and each one's state |
| `.../TagDetail/_components/DetailBlock.tsx` | `DetailSection`, `CollapsibleBlock`, `Field` |
| `.../TagIdentityCard.tsx` | status rail, tag number, headline amount, chips |
| `.../TagJourney.tsx` | the five-step rail |
| `.../TagAmounts.tsx` | the totals statement, payout row, collapsible earnings |
| `.../TagPurchase.tsx` | one collapsible per invoice, with line items |
| `.../TagDetailBlocks.tsx` | traveller, store, flight, tour, risk |
| `.../TagDocuments.tsx` | tag number, QR, signatures |
| `.../TagDetailSkeleton.tsx` | the shape, staff variant only |
| `.../TagDetailView.tsx` | **rewritten body, unchanged print logic and props** |
| `.../useTagDetail.tsx` | gains `status` + `reload` |
| `.../Totals.tsx` | **deleted** — `TagAmounts` replaces it, and it is what printed raw enums |

## i18n

super-app's whole `TagDetail` namespace comes across in **both locales with its
real translations** — 129 keys including the `TotalType`, `EarningType`,
`RefundMethod`, `ExportValidationSource`, `ExportValidationStatus`,
`ExpirationReason`, `DenyReason`, `RiskReasonCode` and `PayoutTokenType`
groups. Copying rather than authoring avoids inventing Turkish for 129 strings.
pos-app's own `Print` / `NewSale` / dormant timeline keys are preserved.

Unused keys get trimmed at the end of the sub-project rather than guessed at up
front, because a missing key fails `tsc` mid-port while an extra one is inert.

## Testing

- `tagAmounts`: the display order over `TotalType`; which rows are deductions
  and which nested; how the net row is chosen; the `currencyRate` footnote
  condition; an empty and a partial `totals` array.
- `tagJourney`: the steps for a normal issued → validated → paid tag; a
  cancelled tag replacing the pending tail; a draft; which steps are `done` /
  `current` / `todo` / `failed`.
- `DetailBlock`: `Field` rendering **nothing** when its value is absent — every
  block depends on that to omit empty rows; `CollapsibleBlock` expanding and
  collapsing, and showing its summary when collapsed.
- `useTagDetail`: a 403 yields `forbidden` with no retry offered; another
  failure yields a retryable `error`; an empty answer is an `error` rather than
  perpetual loading; `reload` recovers.
- `TagDetailView`: Print is the primary and New Sale the secondary; long-press
  on Print still opens the printer sheet; auto-print fires once; **the sale
  screens' embedding still renders** — the regression that would break tag
  issuing.

## Risks

**The sale flow is the highest-stakes path in the app.** Rewriting the body of
a component the sale screens embed risks breaking tag issuing, which is what the
terminal exists to do. The mitigation is that the prop shape and every print
code path are untouched, and that a test renders the embedded case.

**Deleting `Totals.tsx`** removes a component with its own fallback logic
(recomputing sales and VAT from invoices when the API's totals are empty).
`tagAmounts` must keep that fallback or a tag with empty `totals` loses its
figures.

**129 i18n keys arrive at once**, most unused until the blocks land. The
end-of-sub-project trim is what stops them accumulating.

## Out of scope

The affiliation switcher UI (SP7). super-app's customs actions, refund routing,
assign-traveller and change-sales-person flows (decision 1). Re-enabling the
dormant timeline and its cross-service reads.

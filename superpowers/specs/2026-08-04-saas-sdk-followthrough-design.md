# SaaS SDK follow-through: batch payout providers, suspension badges, frontline incentive report

**Date:** 2026-08-04
**Repos:** `web-app`
**Source commits:** `web-app@cc920baf` (packages/saas: RefundService, TagService, ContractService, CRMService), `super-app@d86ed3a4` (src/saas: RefundService, TagService)

## Problem

Two SaaS SDK regenerations landed. They are already merged into both repos' `main`
lineage, so the generated clients are current — but the application code that
consumes them was not updated alongside. One change is outright breaking, several
add fields whose stated purpose is a UI affordance that does not exist yet, and one
adds an endpoint a component explicitly left a TODO for.

`tsc --noEmit` at the time of writing:

- **web-app** (`apps/web`) — one error, in `create-batch-dialog.tsx`.
- **super-app** — clean.

## What changed, and what consumes it

| SDK change | Downstream state |
| --- | --- |
| `CreateBatchDto`: `fileTemplateId` removed, `payoutProviderId` now required `string` | **Compile error** in `create-batch-dialog.tsx`; stale doc on `postBatchApi` |
| New `GET /api/refund-service/batches/payout-providers` + `PayoutProviderListItemDto` | No action, no consumer — this is the endpoint the dialog's TODO waits on |
| `MerchantListResponseDto.isSuspended`, `RefundPointListResponseDto.isSuspended` | No consumer; `parties/_components/table.tsx` already renders a status badge in the right slot |
| `RebateSettingDto.rebateTableHeaders[].rebateType` | No consumer; see the caveat in section C |
| `FrontlineIncentiveReportItem.salesPersonName`, and `fromDate`/`toDate`/`merchantId` now required | No caller anywhere — no action wrapper, no page |
| `TagDto`/`TagDetailDto`.`pendingPayoutCardId` | No consumer |
| RefundService `PendingPayoutCards` DTOs | Cross-service inputs; no client endpoints generated, so nothing to call |
| Doc: `payoutTokenId` requires traveller info (rejected on a draft tag) | **Already honoured** — `payout-token-selector.tsx` returns `null` when there is no traveller. No change. |

## Scope

Five work items, A–E below.

Deliberately out of scope:

- **super-app** — typechecks clean and has no consumer for anything in its diff: no
  batch UI, no `payoutTokenId`/`pendingPayoutCardId` usage, no frontline-incentive
  caller. Its diff is generated-code drift only.
- **pos-app** — its `src/saas` was never regenerated, so it still carries the old
  optional frontline params and `fileTemplateId`. Regenerating it is its own commit
  and was not part of this request.
- **`payout-token-selector.tsx`** — the newly documented traveller constraint is
  already satisfied there.

## A. Batch creation: payout-provider picker

`payoutProviderId` is now the only way to create a batch, so the dialog's
"source choice" model has nothing left to choose between. The free-text identifier
field goes away with it — the file's own comment (*"neither list is exposed by any
generated client … swap in a picker once a list endpoint exists"*) is what this
commit enables.

### Action

`getBatchPayoutProvidersApi` in `packages/actions/unirefund/RefundService/actions.ts`,
following the GET pattern: `structuredSuccessResponse` on success, `throw
structuredError` in catch. Doc'd with its permissions
(`RefundService.Batches`, `RefundService.Batches.ViewPayoutProviders`).

### Page

`payout-batches/page.tsx` calls it inside the **existing `Promise.allSettled`
optional block**, not `Promise.all`. Two independent reasons:

- It needs `Batches.ViewPayoutProviders`, which a read-only role may not hold —
  the same rationale already documented for the batchable-refunds call beside it.
- `UniRefund.RefundService:004012` means the payout orchestrator is unreachable.
  A transient orchestrator outage must not blank the batch list.

`payoutProviders` threads through `BatchesTable` to `CreateBatchDialog`.

### Dialog

Remove the `BatchSource` union, the source `Select`, and the identifier `Input`.
In their place, one `Select` over `PayoutProviderListItemDto` holding
`payoutProviderId` state. Option label is `name`, with `code` appended — that is
what `code` is documented for, disambiguating two providers that share a display
name.

An empty provider list is a **legitimate result** per the endpoint doc (a tenant
that pays nothing by bank file has no providers), and is distinct from the failure
that surfaces as `004012`. So it is not an error: submit is disabled and an
explanatory line renders. No toast.

Submit sends `{ refundIds, payoutProviderId }`. The existing per-item failure
handling (results are entries, not exceptions) is unchanged.

### Supporting changes

- Fix the `postBatchApi` doc comment, which still describes the removed
  exactly-one-of rule.
- i18n: drop the five now-dead keys — `Batches.Source`,
  `Batches.Source.FileTemplate`, `Batches.Source.PayoutProvider`,
  `Batches.SourceId`, `Batches.SourceIdRequired`. Add
  `Batches.PayoutProviderRequired` and `Batches.NoPayoutProviders`. The picker's
  own label reuses the existing `Batches.payoutProviderId`.
- No error-code i18n work: `004012` is already present in the generated
  `language-data/i18n/*.gen.json` bundles.

`Batches.fileTemplateId` and `Batches.fileTemplateVersion` stay. `BatchDto` still
carries those fields — only `CreateBatchDto` lost `fileTemplateId`.

## B. Suspended badge on party lists

Both list DTOs state the field's purpose outright: exposed on the list so a
suspended badge can be rendered without a detail call per row. The suspension
i18n keys (`CRM.Suspension.*`) and the suspend/unsuspend actions already exist at
detail level; only the list affordance is missing.

In `parties/_components/table.tsx`:

- `PartyListItem` gains `isSuspended?: boolean`.
- The `name` custom renderer emits a second destructive-variant `Badge` beside the
  existing `StatusBadge`, using `CRM.Suspension.Suspended`, when the row is
  suspended.

No per-party-type configuration. Only the merchant and refund-point DTOs carry the
field, so it is simply `undefined` for the other four types and the badge never
renders for them. `isSuspended` is documented as independent of `status`, so it is
an *additional* badge, never a replacement for the status one.

## C. `rebateType` on rebate settings

This one is narrower than it first appears, and the design says so rather than
inventing a surface for it.

`rebateType` landed **only** on
`RebateSettingRebateTableHeaderInformationDto` — the *saved* assignments inside
`RebateSettingDto`. The combobox in `rebate-settings.tsx` is fed by the
*assignables* endpoint, whose DTO is `{ id, name, isTemplate }` and has no
`rebateType`. The picker therefore cannot show the type for a table the operator
has not yet saved.

What we do: build an `id → rebateType` lookup from
`rebateSettings.rebateTableHeaders` and pass it as a `badges` entry on the
`rebateTableHeader` widget, matching the shape the `Individuals` widget already
uses for `roleName`. A saved row shows its rebate type; a freshly added row shows
none until saved.

That asymmetry is accepted deliberately — it is the honest limit of what the API
now returns. The complete fix is `rebateType` on the assignables DTO, which is a
backend change and not in this scope.

Note also that `rebateType` now rides along in the `formData` spread into the
UpSert form. That is pre-existing behaviour in kind (`id` and `name` already did),
the schema form filters to the UpSert schema, and it is not a defect to fix here.

## D. Frontline Incentive report

A new page under `reports/frontline-incentive`, mirroring the existing
`reports/marketing-incentive` pair. The report has never had a client; this commit
makes it worth building by resolving the sales person's display name server-side.

### Structural difference from the marketing report

`merchantId` is now **required** (alongside `fromDate` and `toDate`), so unlike
the marketing report this page cannot load unfiltered.

**With no merchant selected, the page does not call the API** — it renders a
prompt to pick one. The rejected alternative was defaulting to the first merchant
in the list, which would present one store's numbers as though they answered the
question the operator asked.

### Pieces

- `getFrontlineIncentiveReportApi` action (GET pattern), doc'd with
  `TagService.Reports.FrontlineIncentive`.
- `reports/frontline-incentive/page.tsx` — date range defaults to the current
  month, reusing the marketing page's `resolveRange` approach.
- `_components/report.tsx` — filter bar plus `MasterDataGrid`, same shape as the
  marketing report.
- Merchant filter reuses the existing `MerchantSelector` in `mode: "select"` with
  the ready-made `searchMerchants` fetch action from
  `packages/actions/unirefund/CRMService/search.ts`.

### The two null cases

The DTO documents two distinct nulls, and they must not collapse into one
rendering:

- `individualId === null` — the **unattributed bucket**. Rendered as a labelled
  row, not a blank one.
- `salesPersonName === null` with an `individualId` present — CRM could not
  resolve the person (no longer affiliated, or hidden by RLS). Rendered as a muted
  dash. The field is documented as cosmetic: the report never fails over a missing
  name.

Rows are per (person, currency) — amounts in different currencies are never
summed — so `currency` is a column, not a page-level heading.

### Registration

Nav entry in `components/sidebar-layout/data.ts` beside the marketing-incentive
entry, gated on `TagService.Reports.FrontlineIncentive`. Display name in
`language-data/core/AbpUiNavigation`; report copy and column headers in
`language-data/unirefund/TagService`, following the `MarketingIncentiveReport.*`
key naming. Both `en.json` and `tr.json`.

## E. `pendingPayoutCardId` on tag detail

The obvious home is wrong. The existing payout-card row lives inside
`TravellerDetailsCard`, which returns early — `AssignTraveller` or `null` — when
the tag has no traveller. No-traveller is exactly the state `pendingPayoutCardId`
describes, so a row added to that component's body would never render for the case
it exists to cover.

It goes on `TagSummaryCard` instead: a row shown when `pendingPayoutCardId` is set
**and** no `payoutToken` resolved. Reasons:

- `TagSummaryCard` always renders, so the indicator does not silently disappear
  for a user without the `AssignTraveller` grant.
- It is a tag-level fact, not a traveller-assignment fact.

Once a traveller claims the tag both ids are present, and the existing payout-token
row already shows the real masked card — hence the `!payoutToken` condition, so the
two never show at once.

This is a **presence indicator only**: no masked number, no expiry. There is no
client endpoint for `PendingPayoutCards` — the new DTOs are cross-service inputs —
so the id cannot be resolved to card details. That matches the field's documented
purpose: *lets the UI show "a card is saved for this tag"*.

New `TagService` i18n keys in en/tr for the row label and its explanation.

## Verification

- `pnpm --filter web type-check` (`tsc --noEmit`) clean — the
  `create-batch-dialog.tsx` error is the baseline this must clear.
- `pnpm lint` clean, including the `react-require-testid/testid-missing` rule: the
  new provider `Select`, the report's merchant selector, date inputs and search
  button all need `data-testid`.
- Every new user-visible string present in both `en.json` and `tr.json` before use;
  no hardcoded copy.
- Manual: create a batch through the picker; the batch list with a role lacking
  `ViewPayoutProviders` (page must still render); a suspended merchant and a
  suspended refund point in the party lists; the frontline report with no merchant
  selected, with one selected, and with a period that yields an unattributed row;
  a draft tag carrying a `pendingPayoutCardId`.

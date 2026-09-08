# web-app MasterDataGrid server filters — audit and remediation

**Date:** 2026-09-08
**Scope:** `web-app/apps/web` (all 98 `MasterDataGrid` call sites) plus a one-line
fix in `packages/ayasofyazilim-ui`.

## Problem

`MasterDataGrid`'s `serverFilters` config writes a typed filter bar to the URL,
which the owning `page.tsx` reads back as `searchParams` and forwards to a
`@repo/actions` action. Coverage has drifted from what the generated SDK offers:

- 98 grids exist in `apps/web`; only 21 declare `serverFilters`.
- ~30 grids sit on an endpoint with real query parameters and expose none.
- 10 of the 21 expose fewer parameters than their endpoint accepts.
- One grid (`parties/_components/affiliations/table.tsx`) hardcodes English
  labels and exposes `maxResultCount` as a filter, which collides with the
  pagination control that writes the same key.
- Applying any server filter from page 2 onward does not reset `skipCount`, so
  the user lands on a page beyond the filtered result set.

The audit compared each grid's filter keys against the query parameters of the
`Get…Data` type belonging to the action its own `page.tsx` calls — not merely the
types imported by the page, which include unrelated lookups.

## Non-goals

- No backward compatibility with older parameter spellings. Where the SDK renamed
  a parameter, the new name is the only one wired.
- No changes to `apps/ssr`; it has no `MasterDataGrid` call sites.
- No new filter surface on screens that already own a bespoke one.

## Excluded call sites, with reasons

| Call site | Reason |
| --- | --- |
| `operations/tax-free-tags/_components/{merchant,customs}/*-tags-config.tsx` | The page already renders `MerchantFilter` / `CustomsFilter` sidebars plus `TaxFreeTagsSearchForm`, and sets `enableFiltering: false` deliberately. A second filter surface would compete with it. |
| `finance/vat-statements/_components/{vat-statements,addable-tags}.tsx`, `finance/rebate-statements/_components/rebate-statements.tsx`, `finance/franchise-hq-statements/_components/store-details.tsx`, `*/bulk/{client,drafts-table}.tsx`, `franchise-hq-statements/draft/_components/drafts-table.tsx` | Draft and detail sub-grids, not list screens. They render a selection or a breakdown of one parent record. |
| `finance/{frontline-incentive,marketing-incentive,tour-guide-fee}/_components/report.tsx` | Report screens driven by their own date-range + merchant form. |
| `operations/rule-engine/history`, `refunds/[refundId]/{tags,payments}`, `operations/events/[eventId]/travellers`, `parties/exit-points/[exitPointId]/posts`, `parties/merchants/[partyId]/{product-groups,sector}`, the `contact/*-form.tsx` grids, `travellers/[travellerId]/_components/traveller-documents.tsx`, `permission-templates/propagation/**` | The only query parameter is the parent id already present in the route, or the grid is presentation over data the page holds. |
| `reports/*`, `settings/product/{product-groups,vats}`, `parties/exit-points`, `parties/exit-points/location-types`, `operations/address-geocoding` | Endpoint exposes paging and sorting only. |

## Approach

### Two shared helpers

`FilterWith{0}` is spelled out 57 times today and would reach ~250 after this
work; `toArray` is copy-pasted into 6 pages. Both get one home:

**`apps/web/src/utils/server-filters.ts`** — builders returning
`ServerFilterConfig` values, owning the placeholder convention:

```ts
stringFilter({ key, label, t })
numberFilter({ key, label, t })
selectFilter({ key, label, options, t })
arrayFilter({ key, label, options, t })
booleanFilter({ key, label, t })
dateRangeFilter({ key, keyFrom, keyTo, label, t })
dateFilter({ key, label, t })
```

`t` is the same resources object the grid already receives, so a builder resolves
`t["FilterWith{0}"]` itself. A filter declaration drops from ~8 lines to 1.
Grids keep declaring their own filter *list* inline, matching the existing 21 —
only the per-entry boilerplate moves.

**`apps/web/src/utils/search-params.ts`** — the page side:

```ts
toArray<T>(value: string | string[] | undefined): T[] | undefined
toBool(value: string | boolean | undefined): boolean | undefined
toNumber(value: string | number | undefined): number | undefined
```

Both are plain `.ts` modules, so `pnpm --filter web test:unit` covers them. That
is the only part of this work a test can reach — a grid or page component cannot
be unit-tested in this repo.

Schema-driven filter generation was rejected: SDK query parameters do not map 1:1
onto DTO fields (`nationalities` vs `nationalityCountryName`, `minCreationTime`
vs `creationTime`), labels still need resource keys either way, and the
generation would have to live inside the `ayasofyazilim-ui` submodule.

### Page-side correctness

A `serverFilters` entry only writes to the URL. Three defects make a filter a
silent no-op, so every grid in scope gets its `page.tsx` reviewed:

1. **Boolean `false` is dropped or inverted.** The URL carries the string
   `"false"`. A page typing `searchParams` as the SDK `Data` type declares
   `boolean` and passes a string, which happens to serialise correctly but is a
   type lie; any page that coerces with `Boolean(...)` turns `"false"` into
   `true`. `toBool` maps `"true" → true`, `"false" → false`, anything else
   `→ undefined`, keeping `notActive=false` meaningful rather than unfiltered.
2. **Single vs. array.** The filter bar calls `params.append` once per selected
   value, so Next hands back a bare `string` for one pick and `string[]` for
   several. `operations/refunds/page.tsx` already normalises this and documents
   why; `parties/travellers/page.tsx` types it as an intersection and forwards
   the raw value. Every `array` / `string-array` filter routes through `toArray`.
3. **Cherry-picking pages.** `parties/franchise-hqs`, the three
   `settings/templates/*` pages and the six `parties/*/[partyId]/affiliations`
   pages forward a hand-written subset of `searchParams`. A new filter key must
   be added there too or the URL parameter is discarded.

### GUID parameters

A GUID-typed parameter becomes a filter only when a lookup list is available to
render it as a `select` / `array` — `providerId` from providers, `merchantId`
from merchants, `refundPointIds` from refund points, `editionId` from editions.
Bare-GUID text inputs (`tagIds`, `entityId`, `auditLogId`, `organizationUnitId`,
`relatedId`, `franchiseTenantId`, `tourEventId`) are skipped: staff cannot type
them, and the grid already reaches those rows by navigation.

### Localization

Filter labels resolve through the same resources object the grid passes as
`config.t`. Existing keys are reused wherever one exists — `t.Default` already
carries ~25 `column.*` names plus `FilterWith{0}`. Genuinely new keys are added
to both `en.json` and `tr.json` with a real Turkish translation, not an English
placeholder. `pnpm run init` re-runs after each batch, because the i18n bundle is
gitignored and `tsc` fails on the import rather than the missing key.

## Batches

Each batch is one service's worth of grids, so a reviewer can check the filter
set against one `types.gen.ts` at a time.

| # | Service | Grids | Work |
| --- | --- | --- | --- |
| 0 | — | — | The two helpers plus their unit tests. |
| 1 | Identity / Saas / Account / Administration | 9 | `logs/audit` (13 params, currently none), `identity/users` (+9), both `security-logs` (+`startTime`/`endTime` range, `correlationId`, `userName`), `logs/entity-changes` (+date range, `entityChangeType`, `entityId` skipped as GUID), `saas/tenants` (+`filter`), `identity/claim-types`, `openiddict/{applications,scopes}`, `saas/editions`, `text-templates`, `language-management/languages`, `language-texts` (+`filter`), `account/sessions` and `identity/users/[userId]/sessions` (`clientId`, `device`). |
| 2 | FileService | 8 | `file/list` (8), `file/verification` (5), `file/file-type-groups` (2), `file/file-type-mime-types` (2), `file/mime-types` (2), `file/providers` (1), `file/file-relation-entities` (2 + `fileTypeId` as a picker), `file/file-types` (+`providerId` picker). |
| 3 | CRMService / parties | 8 | **`affiliations` defect fix** (drop the `maxResultCount` filter, add `name` + `roleName`, replace hardcoded English), `parties/individuals` (5), `parties/airports` (6), `operations/events` (date range), `parties/tour-guides/[partyId]/events` (date range), `parties/travellers` (+`email`, `phoneNumber`, `username`), `parties/franchise-hqs` (already complete — verify only). |
| 4 | FinanceService / ContractService | 7 | `finance/vat-statements` (10), `finance/rebate-statements` (8), `finance/franchise-hq-statements` (4 + `franchiseHqId` picker), `finance/cross-tenant-payouts` (3), `contracts/franchise` (`validOn`), `contracts/franchise/[contractId]/earnings` (period range), `parties/franchise-hqs/[partyId]/contracts` (`validOn`), `settings/templates/tour-guide-fee-tables` (2 pickers). |
| 5 | TagService / RefundService / DeviceService / ExportValidation | 8 | `devices` (6), `devices/[deviceId]/commands` (`status`), `operations/stickers` (`merchantId` picker), `operations/stickers/[stickerId]` (`isUsed`), `operations/refunds` (+`filter` paired with `textFilterType`, `refundPointIds`, `refundCreatorIds`), `operations/export-validations` (verify; `tagIds` skipped as GUID), `finance/payout-batches` (already complete — verify only). |
| 6 | `ayasofyazilim-ui` submodule | 1 | The `skipCount` reset below. |

## The submodule defect

`packages/ayasofyazilim-ui/src/custom/master-data-grid/components/filters/server-filter.tsx`,
in `handleApply`:

```ts
params.delete("page");
```

Nothing in the grid writes `page`. Pagination writes `skipCount` and
`maxResultCount` (`components/pagination/pagination.tsx`). So applying a filter
while on page 3 keeps `skipCount=20` in the URL and the filtered request skips
the first 20 matches — usually an empty table. `handleReset` is unaffected; it
pushes a bare pathname.

Fix: delete `skipCount` instead. `maxResultCount` is a page-size preference and
stays.

## Verification

Per batch, and again at the end:

| Command | Expected |
| --- | --- |
| `pnpm run init` | required before `type-check` sees a new i18n key |
| `pnpm --filter web type-check` | 2 errors — the `capture-core/detectors/mrz` TS2307 baseline |
| `pnpm --filter web test:unit` | 80 tests + the new helper tests, 0 failures |
| `pnpm grid:keys` | exit 0 |
| `pnpm i18n:missing --app=web` | NEEDS_KEY 0 |
| `pnpm --filter web lint` | 0 errors |

`prettier --check` is not a gate: the tree is CRLF and prettier emits LF, so every
file reads as changed regardless of this work.

Runtime verification is not available — `pnpm test` is Playwright against a live
deployed environment and its auth-setup file does not exist in the checkout, so no
grid in this change can be driven end to end locally. Correctness rests on the
parameter names matching `types.gen.ts` and on `tsc` accepting each page's
forwarded object against the action's `Data` type.

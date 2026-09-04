# Franchise screens for web-app (host only)

Date: 2026-08-27
Scope: `web-app` — franchise contract screens and franchise finance screens, visible only to a host session (no tenant selected).

## Problem

The franchise domain exists end-to-end in the backend and is completely absent from the web app. `grep -ri franchise apps/web/src` returns only generated SDK types and one unrelated label in `parties/_components/table.tsx`. Every endpoint, permission, JSON schema and SDK client namespace is already generated and waiting; there is no UI, and no server-action wrapper.

## Domain model

The franchise API is **two independent billing tracks**. Conflating them is the main risk in this work.

### Track A — UniRefund bills a franchise tenant

A country operator runs UniRefund under franchise; UniRefund charges them a fee on their own volume.

- `franchise-contracts` (ContractService) — keyed by `franchiseTenantId`. Fee base is `VatAmount | SalesAmount | GrossRefundAmount`; period is `Monthly | Quarterly | Yearly`. Carries optional volume tiers; an empty tier set makes the contract flat-rate at `fixedFeeValue` / `percentFeeValue`.
- `franchise-earnings` (ContractService) — the calculated fee for one contract over one period. Records `matchedTierId`, or null when the contract-level fallback rate applied.
- `franchise-earning-runs/run` (FinanceService) — batch-calculates one period across all tenants. Returns per-tenant outcomes: `Calculated | NoContract | Failed | PeriodNotAligned`.

### Track B — a retail franchise HQ receives commission statements

A global retail brand with stores across several countries; each country tenant produces a monthly commission statement.

- `franchise-hqs` (CRMService) — the HQ itself, plus country links pairing a `countryTenantId` with its `headquarterMerchantId`.
- `franchise-hq-contracts` (ContractService) — keyed by `franchiseHqId` + `countryTenantId`. Brackets plus `minimumMonthlyCommission`.
- `franchise-hq-statements` (FinanceService) — list, per-store drill-down detail, `form-draft` preview, create, `{id}/status`, `currency-totals`.

### Two backend constraints that shape the UI

Both are quoted from the generated types, which carry the backend's own XML doc comments.

1. **Tenant names are not resolved by the backend.** `FranchiseContractDto.franchiseTenantId`: "The tenant's display name is not resolved here — ContractService has no SaaS integration, and the caller already knows the tenant list." Every screen showing a tenant must join names itself. This is a structural reason these screens are host-only: only a host session can enumerate tenants.

2. **HQ contract identity is immutable.** `FranchiseHqContractUpdateDto` deliberately omits HQ, country and currency: "a statement stores amounts in the contract's currency, so changing any of the three would retell what existing statements meant. A different country or currency is a different contract." Edit forms must not offer those three fields.

## Placement

The app groups screens **by function, not by domain**. A merchant's rate tables live in `settings/templates`, its contract under `parties/`, its statement under `finance/`. Franchise follows the same split.

| Area | Route root | Contents |
|---|---|---|
| Parties | `parties/franchise-hqs/` | HQ registry, and the HQ's contracts nested beneath it |
| Contracts | `contracts/franchise/` (new top-level nav group) | Track A tenant contracts and their earnings |
| Finance | `finance/franchise-hq-statements/`, `finance/franchise-earning-runs/` | Money output |

Rationale:

- **HQs belong under `parties/`.** `FranchiseHqDto` is a CRMService entity with `name` / `externalIdentifier` / links — structurally identical to every other party. `parties/merchants/[partyId]/contracts` is the exact precedent for hanging its contracts off it, and the setup workflow is HQ-centric (create HQ, link countries, contract per country). Verified feasible: `GET /franchise-hq-contracts` accepts a `franchiseHqId` filter.
- **Track A contracts need a new top-level `contracts` group.** Their counterparty is a SaaS tenant, which has no party page to nest under. They are signed instance agreements, not reusable rate tables, so `settings/templates` (where `rebate-tables` and `refund-tables` live) would misfile them.
- **Statements belong in `finance/`**, beside `rebate-statements` and `vat-statements`, whose `bulk` draft-to-create flow they closely mirror.

Trade-off accepted: franchise spans three nav groups rather than one. A single `franchise` group was considered — it would reduce the host gate to one flag — but it would pull statements away from `finance` and invent a second home for a CRM party type.

## Host-only gating

**Correction, made during implementation.** An earlier revision of this section claimed there was no route-guard pattern in the app and that nothing redirected to the `unauthorized` page. That was wrong: `isUnauthorized` in `packages/utils/policies/utils.ts` calls `permanentRedirect` to exactly that page, and 109 page files already call it.

So franchise is not introducing route guarding — it is adding a *host* check alongan existing *policy* check. `isUnauthorized` answers "does this user hold these permissions?", which is a different question from "is a tenant selected?", and no combination of policies expresses the latter. That is why a separate guard is still warranted, and the justification does not depend on the false premise above.

### 1. The host signal already exists

No auth-package change is needed. The sidebar is already tenant-aware, and the data behind it *is* the host signal.

`providers.tsx` calls `getInfoForCurrentTenantApi(session)` on every page render and feeds the result into `TenantProvider`. That DTO — `CountrySettingInfoDto` — carries a **nullable** `tenantId` (uuid) alongside `tenantName`. A host session has no tenant, so `tenantId` is null. `nav/main.tsx` already depends on this, rendering `"Platform"` when `tenantName` is empty.

So:

- **Client side** (nav gating): `isHost` is `!useTenant().tenantId`. Already in context; no new plumbing.
- **Server side** (route guard): `requireHost()` calls the same `getInfoForCurrentTenantApi(session)` and redirects when `tenantId` is set.

An earlier draft of this spec proposed extracting an ABP tenant claim in `getUserData` (which declares `tenantId?` on `MyUser` but never populates it). That is rejected: it would have rested on a JWT claim key nobody had verified, in order to rebuild a signal the app already computes and already displays.

`requireHost()` costs one API call per franchise-area navigation. If that proves noticeable, wrap it in React's `cache()` to dedupe within a request — the repo already does exactly this in `settings/tenant/[tenantId]/[group]/_components/cached-api.ts`.

### 2. Nav gating

Add `hostOnly?: boolean` to `NavItem` and `NavItemAction` in `components/sidebar-layout/data.ts`. Thread an `isHost` parameter into `mapNavItem` in `components/sidebar-layout/sidebar-layout.tsx` and return `null` when `hostOnly && !isHost`.

`isHost` derives from `useTenant()`, which is already reachable — `sidebar-layout.tsx` is a client component inside `TenantProvider`, and `nav/main.tsx` already treats an empty `tenantName` as host by rendering `"Platform"`.

Four entries end up carrying `hostOnly: true`: the new `contracts` group, `parties/franchise-hqs`, and the two `finance` entries.

**Each entry ships with its own sub-project, not with the foundation.** A nav entry pointing at a route that does not exist yet is a 404 in the sidebar, so sub-project 0 adds only the mechanism — the `hostOnly` field and the `isHost` filter — and proves it by unit test. Sub-projects 1 through 5 each add their own entry alongside the route it points at.

Note that a group needs no flag of its own when all of its children are host-only: `mapNavItem` already drops any group left with no visible children, so the `contracts` group disappears for a tenant session as a consequence of its leaves disappearing. Flagging the group as well is belt-and-braces, and harmless.

### 3. Route guard

A small server helper `requireHost()` redirects to `/{lang}/unauthorized` when a tenant is selected. Called from the layout of each franchise subtree, so it runs once per area rather than once per page. That is four call sites:

- `parties/franchise-hqs/layout.tsx` (covers the registry and the nested contracts)
- `contracts/layout.tsx` (covers Track A contracts and the earnings tab)
- `finance/franchise-hq-statements/layout.tsx`
- `finance/franchise-earning-runs/layout.tsx`

The two finance subtrees need their own layouts because `finance/` also holds tenant-visible screens and must not be gated wholesale.

The reason a guard is needed at all: nav hiding alone leaves the URL reachable, and a tenant user who happens to hold the permission would otherwise see tenant-scoped data — which for Track A contracts is meaningless, since those are host-owned records *about* tenants.

`requireHost` deliberately does **not** extend `isUnauthorized`, because the two ask different questions and `isUnauthorized`'s signature is policy-shaped. But note the shape divergence for later sub-projects, which will call both in the same layout: `isUnauthorized({requiredPolicies, lang, redirect?})` takes named arguments, returns a boolean, and uses `permanentRedirect`; `requireHost(lang)` is positional, returns void, and uses `redirect`. Converging them is worth considering once a real franchise layout exists and the ergonomics are visible.

**The two halves of the gate are independent and nothing links them.** A `hostOnly` nav entry does not imply a `requireHost()` call, and vice versa. Each of sub-projects 1-5 must add both, and each of their plans should restate this — it is the invariant most likely to be quietly forgotten.

## Forms

The app has two form patterns; franchise needs both.

**Pattern A — `SchemaForm` + generated JSON schema.** `createUiSchemaWithResource({ resources, schema: $GeneratedDto, name })`, as in the merchant contract create form. Used for HQ create/edit, the statement draft's year/month picker, and the earning-run period input. All have generated schemas already.

**Pattern B — `react-hook-form` + hand-written Zod + `useFieldArray` row table.** Used where rows need cross-row validation. `createRebateTableFormSchemas` puts the invariants in `superRefine` with i18n'd messages; `RebateTableDetailsTable` renders the array with `useFieldArray` + `useFormContext` in a `<Table>` with add/remove controls.

Franchise contracts need Pattern B, because the backend documents exactly the cross-row invariants `superRefine` exists for:

- Track A tiers: "must be contiguous and the highest must have no ceiling"; an empty set is legal and means flat-rate.
- Track B brackets: "At least one bracket; a flat deal is a single bracket from 0 with no ceiling."

Design:

- **One shared `FeeBracketsTable`**, mirroring `RebateTableDetailsTable`. Justified because Track A tiers and Track B brackets are the same four fields — `minAmount`, `maxAmount` (null = no ceiling), `fixedFeeValue`, `percentFeeValue`. Track A's update variant adds `id?` to distinguish edited rows from new ones; only that schema carries it.

  **Where it lives** (settled during sub-project 2, superseding two earlier revisions of this line):

  - `apps/web/src/utils/fee-brackets.ts` — the pure contiguity validator
  - `apps/web/src/utils/date-input-value.ts` — the local-date formatter both contract forms need
  - `apps/web/src/components/franchise/schemas.ts` — both Zod factories
  - `apps/web/src/components/franchise/fee-brackets-table.tsx` — the editor

  each beside its test. Route-specific pieces stay in their own route: `contracts/franchise/_components/table.tsx` is Track A's list table and does not move.

  These began colocated in `contracts/franchise/_components/`, which was right while one route family used them. Sub-project 2 made a second family need them — Track B's forms live under `parties/franchise-hqs/[partyId]/contracts/`. Reaching across would mean importing another route's `_components`, and the `_` prefix marks that folder **private to its route** in the App Router, so an alias would be semantically wrong rather than merely unprecedented (no file in this app imports across route trees). This repo already has homes for cross-family code, and both are load-bearing precedents: `components/tag-form` is shared by two route families, `utils/badge-variants` by three.

  `FeeBracketsTable` takes a **required** `allowEmpty` prop. There is no safe default: Track A's empty tier set legitimately means flat-rate, while an empty Track B bracket set is invalid, and a component that guesses will tell one of them something false. Requiring the prop forces every form to declare which family it binds.
- **Two Zod schema factories**, one per contract family, sharing a `superRefine` helper for contiguity and open-topped-highest. Track A permits an empty array; Track B requires at least one row.

The HQ-contract edit form gets its immutability for free: Pattern A drives the form off `FranchiseHqContractUpdateDto`, which has no HQ, country or currency fields. The lock is structural rather than a UI rule someone must remember.

## Data flow: resolving names

Three DTOs carry a bare tenant id the backend will not resolve (`franchiseTenantId`, `countryTenantId`).

`getPublicTenantsApi()` in `packages/actions/core/SaasService/actions.ts` already returns `{id, name}` for all tenants — it is what the login tenant selector uses. A server helper `resolveTenantNames()`, living in `apps/web/src/utils/` beside the other shared helpers, fetches it and returns a `Map<id, name>`. Each franchise page calls it inside its existing `getApiRequests()` block and passes the map into the client table, which renders it through a `customRenderers` entry, following the existing `ContractsTable` shape.

The same approach resolves `headquarterMerchantId` via `getMerchantsApi`. Statement *store* rows already carry `merchantName` from the backend, so only the statement header id needs joining.

## Sub-projects

Dependency order is `0 → 1 → 2 → 3` and `0 → 4 → 5`. Sub-project 4 can run in parallel with 1–3 once 0 lands. Each sub-project gets its own implementation plan.

### 0 — Foundation

No screens. Gates everything else.

- `hostOnly` on `NavItem` / `NavItemAction`; `isHost` in `mapNavItem`, derived from `useTenant().tenantId`.
- `requireHost()` server helper, built on `getInfoForCurrentTenantApi`. No change to the auth package.
- `FeeBracketsTable` and the shared contiguity `superRefine`.
- `resolveTenantNames()` server helper.
- **26 server-action wrappers** — the largest single chunk of work:
  - CRM `franchise-hqs`: list, by id, create, update, delete, set-countries (6)
  - Contract `franchise-contracts`: list, by id, create, update, delete (5)
  - Contract `franchise-hq-contracts`: list, by id, create, update, delete (5)
  - Contract `franchise-earnings`: list, by id, calculate (3)
  - Finance `franchise-hq-statements`: list, by id, create, form-draft, currency-totals, set-status (6)
  - Finance `franchise-earning-runs`: run (1)
- i18n keys across the ContractService, CRMService and FinanceService resource files.

SDK client namespaces already exist and need no work: `franchiseContract`, `franchiseEarning`, `franchiseHqContract`, `franchiseHq`, `franchiseEarningRun`, `franchiseHqStatement`.

### 1 — Franchise HQ registry

Routes: `parties/franchise-hqs/`, `new/`, `[partyId]/{details,countries}`.

`[partyId]/layout.tsx` uses `SidebarTemplate` with permission-gated tabs, following the merchant contract layout. This sub-project ships two tabs, `details` and `countries`; sub-project 2 adds the third, `contracts`. The tab list must not carry a `contracts` entry before that route exists.

The countries page pairs a tenant picker with a merchant picker per row and submits `set-countries`. The merchant picker filters to `typeCodes: ["HEADQUARTER"]` — the field is literally `headquarterMerchantId`, and `finance/rebate-statements/new/page.tsx` already fetches exactly that way.

`set-countries` is a **full replace**, documented as idempotent: "links absent from the list are removed, new ones added." So the page edits the whole set and submits it entire, rather than adding or removing one link at a time.

**Correction, made before implementation.** An earlier revision of this section said the page also surfaces "the store tree from integration". It cannot: there is **no store-tree endpoint in the generated SDK**. `FranchiseHqStoreDto` exists as a type with nothing that returns it, and `CRMService.FranchiseHqs.ViewStoreTreeFromIntegration` exists as a permission with nothing to call. Only six franchise-HQ endpoints exist — list, get by id, create, update, delete, set-countries. The store tree is out of scope until the backend exposes it and the SDK is regenerated.

Delete is included, following the existing contract-delete precedent (`_components/delete-contract.tsx`): a `ConfirmDialog` wrapping a destructive `SidebarMenuButton` in the layout footer, calling `handleDeleteResponse(response, router, "../")` on confirm.

What happens to an HQ that has live statements is the backend's decision, and the UI does not pre-empt it. The client issues the delete and surfaces whatever comes back, so a refusal reaches the user as the backend's own message rather than a rule guessed at in the front end.

### 2 — Franchise HQ contracts

Routes: `parties/franchise-hqs/[partyId]/contracts/`, `new/`, `[contractId]/`.

List is filtered by `franchiseHqId`. Create and edit use Pattern B with `FeeBracketsTable`. Edit locks HQ, country and currency structurally.

### 3 — Franchise HQ statements

Routes: `finance/franchise-hq-statements/`, `[id]/`, `draft/`.

List carries a currency-totals row (per-currency sums, nothing converted). Detail shows the per-store drill-down. The `form-draft` to create flow mirrors `finance/rebate-statements/bulk` — `MasterDataGrid`, detail drawer, create dialog. Status transitions use `PUT {id}/status`.

`FranchiseHqStatementDto.status` is typed `UniRefund_FinanceService_Enums_RebateStatementStatus` — the same enum the rebate statements use. So `getVariantByStatementStatus` in `apps/web/src/utils/badge-variants.ts` already accepts it and is reusable with no change; do not add a franchise-specific status-badge helper.

The draft DTO exposes `hasContract` and `statementAlreadyExists`; both must be surfaced, since a country with no covering contract is listed deliberately so the gap is visible rather than silently absent, and cannot be created.

### 4 — Franchise tenant contracts

Routes: `contracts/franchise/`, `new/`, `[contractId]/`.

Tenant picker sourced from the SaaS tenant list. Pattern B with `FeeBracketsTable`. Tiers may be empty, which means flat-rate — the form must make that legible rather than looking unfinished.

### 5 — Franchise earnings and runs

Routes: `contracts/franchise/[contractId]/earnings`, `finance/franchise-earning-runs/`.

Earnings appear as a tab on the Track A contract, filtered by `franchiseContractId` (verified supported). The runs page posts a period and renders the outcome breakdown, including the counts the backend documents as diagnostic: `noContractCount` is a setup gap to fix and re-run, `periodNotAlignedCount` cannot be fixed by retrying the same window, and `failedCount` above zero means something should retry.

## Deferred

Called out so its absence is a decision, not an oversight.

- **No standalone global earnings list.** `GET /franchise-earnings` unfiltered would give a cross-tenant ledger. The run-result breakdown plus the per-contract tab already cover both views, and it is cheap to add later.

## Verification

| Gate | Command | Applies to |
|---|---|---|
| Types | `pnpm --filter web run type-check` | all |
| i18n visible to tsc | `pnpm run init` in `apps/web`, before type-check | any adding keys |
| Lint | `pnpm --filter web run lint` | all |
| Unit | `pnpm --filter web run test:unit` | 0 |
| E2E | `pnpm --filter web test` (Playwright) | 1, 2, 4 |
| Grid keys | `node scripts/check-grid-keys.mjs` | if grid resource keys change |
| Missing i18n | `pnpm run i18n:missing` | any adding keys |

The bracket contiguity rule is the piece that genuinely warrants unit tests: a pure function over an array, with documented edge cases — gaps, overlaps, a ceiling on the highest bracket, `minAmount >= maxAmount`, empty array (legal for Track A, illegal for Track B), and a single open bracket from zero. Precedent: `finance/vat-statements/_components/tag-selection.test.ts`.

E2E follows the existing party-creation shape in `apps/web/tests/unirefund/parties/*/new/`, using the `_support/` helpers (`app-ready`, `expect-toast`, `retry-utils`).

Prettier is not a gate: `format:check` fails repo-wide on line endings and cannot distinguish new changes from pre-existing noise.

### Type-check baseline

Measured 2026-08-27 on a clean tree, before any franchise work:

```
src/app/[lang]/(main)/(unirefund)/operations/document-capture/_components/detector-controls.tsx(4,36): error TS2307:
  Cannot find module '@ayasofyazilim-clomerce/capture-core/detectors/mrz' or its corresponding type declarations.
src/app/[lang]/(main)/(unirefund)/operations/document-capture/lib.ts(6,36): error TS2307:
  Cannot find module '@ayasofyazilim-clomerce/capture-core/detectors/mrz' or its corresponding type declarations.
```

Exactly 2 errors, both from the private GitHub Packages dependency being absent locally. `tsc` exits non-zero because of them. Treat 2 as green; any third error is a regression introduced by the work.

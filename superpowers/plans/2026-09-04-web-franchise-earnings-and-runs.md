# Franchise Earnings and Runs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship sub-project 5 — a per-contract earnings tab on the Track A franchise contract, and a `finance/franchise-earning-runs` page that runs a period and reports the outcome.

**Architecture:** The Track A contract detail becomes a tabbed `SidebarTemplate` route, exactly as the franchise HQ did in sub-project 1, so earnings can live beside the contract form. The runs page is a period form plus a result breakdown rendered from a single POST response — no list route, because a run result is not persisted.

**Tech Stack:** Next.js 15 App Router, generated ContractService/FinanceService SDK types, `MasterDataGrid`, `SchemaForm`, `SidebarTemplate`.

**Spec:** `C:\unirefund\docs\superpowers\specs\2026-08-27-web-franchise-screens-design.md` — sub-project 5, plus "Placement" and "Deferred".

---

## Global Constraints

- **Host-only.** `contracts/layout.tsx` and the finance nav entry's `hostOnly` flag already gate these areas. Add no host check inside pages.
- **Never test for host with `!tenantId`** — a host session's `tenantId` is `Guid.Empty`, which is truthy. Use `isHostTenant()` / `requireHost(lang)`.
- **Server-action conventions:** GET takes `(data, session?)` and **throws**; POST/PUT takes `(data)` and **returns** a structured response.
- **Type-check baseline is exactly 2 errors**, both `TS2307` for `@ayasofyazilim-clomerce/capture-core/detectors/mrz`. `tsc` exits non-zero because of them; that is the expected green state. A third is a regression.
- Run `pnpm run init` before `type-check`.
- Lint: **0 errors** is the bar. `react-require-testid/testid-missing` is severity error; unused imports are errors.
- **Unit-test totals are a reading, not a constant.** Last reading 76 tests / 14 suites / 75 pass / 1 skip / 0 fail. Zero failures is the bar.
- **The Playwright suite cannot run here** — no `baseURL`, no auth session. Authored-and-listed is the ceiling.
- SchemaForm inputs expose `id`, never `data-testid`; the submit button has neither. Target `#root_<field>` and `#<formId> button[type="submit"]`. `CustomComboboxWidget` items are `root_<field>` / `root_<field>_0` with **no** `-trigger` suffix.
- Array item labels resolve at `<prefix>.<arrayField>.<itemField>`; enum fields need `ui:enumNames` or they render raw values. Both fall back to `lodash.startCase`, which looks fine in English and leaves Turkish untranslated.
- **English says "Tenant", Turkish says "Ülke"** — the established convention. Never write "Kiracı".
- The checkout is **shared with another session**. `git add` only your exact paths, verify `git diff --cached --name-only`, or `git commit -- <paths>`. Never `git add -A`/`.`/`<directory>`, and never `git restore`/`reset`/`checkout` a path you did not create.

### Two endpoints stay unused after this plan, deliberately

Say so rather than inventing screens for them:

- **`postFranchiseEarningCalculateApi`** — `CalculateFranchiseEarningInput` requires `activityByCurrency` (per-currency tag counts, sales, VAT, gross refund). A back-office user has no way to source those figures; this is the integration/job path, which is why `FranchiseEarning.CalculateFromIntegration` exists beside it.
- **`getFranchiseEarningByIdApi`** — `FranchiseEarningDto` already carries every field on the list row, so a detail route would show nothing the grid does not.

---

## File Structure

```
contracts/franchise/[contractId]/
├── layout.tsx            NEW  SidebarTemplate + two permission-gated tabs
├── page.tsx              REPLACED  redirects to ./details
├── loading.tsx           stays
├── details/
│   ├── page.tsx          MOVED from [contractId]/page.tsx
│   └── loading.tsx       NEW
├── _components/          stays (form.tsx, delete-contract.tsx) — imported by details/
└── earnings/
    ├── page.tsx          NEW
    ├── loading.tsx       NEW
    └── _components/table.tsx  NEW

finance/franchise-earning-runs/
├── page.tsx              NEW  policy gate only
├── loading.tsx           NEW
└── _components/
    ├── client.tsx        NEW  holds the run result
    ├── run-form.tsx      NEW  period → POST
    └── result.tsx        NEW  counts + per-tenant outcomes
```

**This moves the contract edit URL** from `/contracts/franchise/{id}` to `/contracts/franchise/{id}/details`. Four referrers must move with it — the list's `RowLink`, the create form's post-save prefix, the delete dialog's redirect, and the E2E spec. That is the price of the tab, and it is the same restructure sub-project 1 performed for HQs.

---

### Task 1: i18n keys

**Files:**
- Modify: `apps/web/src/language-data/unirefund/ContractService/resources/{en,tr}.json`
- Modify: `apps/web/src/language-data/unirefund/FinanceService/resources/{en,tr}.json`
- Modify: `apps/web/src/language-data/core/AbpUiNavigation/resources/{en,tr}.json`

**Interfaces:**
- Produces: earnings keys read by Tasks 2–3, run keys read by Task 4, one nav key read by Task 4.

Add only keys with a consumer in this plan. Verify en/tr parity after, and report both counts.

- [ ] **Step 1: ContractService — the earnings tab**

```json
  "FranchiseContracts.Tab.Details": "Details",
  "FranchiseContracts.Tab.Earnings": "Earnings",
  "FranchiseEarnings.period": "Period",
  "FranchiseEarnings.feeBase": "Fee base",
  "FranchiseEarnings.baseAmount": "Base amount",
  "FranchiseEarnings.tagCount": "Tags",
  "FranchiseEarnings.salesAmount": "Sales",
  "FranchiseEarnings.vatAmount": "VAT",
  "FranchiseEarnings.grossRefundAmount": "Gross refund",
  "FranchiseEarnings.appliedFixedFeeValue": "Fixed fee applied",
  "FranchiseEarnings.appliedPercentFeeValue": "Percent fee applied",
  "FranchiseEarnings.earningAmount": "Earning",
  "FranchiseEarnings.calculatedAt": "Calculated at",
  "FranchiseEarnings.empty": "No earnings calculated for this contract yet."
```

Turkish:

```json
  "FranchiseContracts.Tab.Details": "Detaylar",
  "FranchiseContracts.Tab.Earnings": "Kazançlar",
  "FranchiseEarnings.period": "Dönem",
  "FranchiseEarnings.feeBase": "Ücret matrahı",
  "FranchiseEarnings.baseAmount": "Matrah tutarı",
  "FranchiseEarnings.tagCount": "Etiket",
  "FranchiseEarnings.salesAmount": "Satış",
  "FranchiseEarnings.vatAmount": "KDV",
  "FranchiseEarnings.grossRefundAmount": "Brüt iade",
  "FranchiseEarnings.appliedFixedFeeValue": "Uygulanan sabit ücret",
  "FranchiseEarnings.appliedPercentFeeValue": "Uygulanan yüzde ücret",
  "FranchiseEarnings.earningAmount": "Kazanç",
  "FranchiseEarnings.calculatedAt": "Hesaplanma zamanı",
  "FranchiseEarnings.empty": "Bu sözleşme için henüz kazanç hesaplanmadı."
```

- [ ] **Step 2: FinanceService — the runs page**

```json
  "Finance.FranchiseEarningRuns.title": "Franchise earning runs",
  "Finance.FranchiseEarningRuns.description": "Calculate franchise earnings for every tenant under contract in a period. Running the same period again recalculates it.",
  "Finance.FranchiseEarningRuns.run": "Run",
  "Finance.FranchiseEarningRuns.periodStart": "Period start",
  "Finance.FranchiseEarningRuns.periodEnd": "Period end",
  "Finance.FranchiseEarningRuns.empty": "Pick a period and run it to see the outcome.",
  "Finance.FranchiseEarningRuns.tenantsUnderContract": "Under contract",
  "Finance.FranchiseEarningRuns.tenantsWithActivity": "With activity",
  "Finance.FranchiseEarningRuns.calculatedCount": "Calculated",
  "Finance.FranchiseEarningRuns.noContractCount": "No contract",
  "Finance.FranchiseEarningRuns.periodNotAlignedCount": "Period not aligned",
  "Finance.FranchiseEarningRuns.failedCount": "Failed",
  "Finance.FranchiseEarningRuns.noContractHint": "These tenants had activity but no contract covering the period. Add one and run again.",
  "Finance.FranchiseEarningRuns.periodNotAlignedHint": "Their contract bills on a different cycle, so this window cannot produce an earning. Re-running the same period will not change it.",
  "Finance.FranchiseEarningRuns.failedHint": "Something went wrong for these tenants. They are safe to run again.",
  "Finance.FranchiseEarningRuns.tenant": "Tenant",
  "Finance.FranchiseEarningRuns.outcome": "Outcome",
  "Finance.FranchiseEarningRuns.earning": "Earning",
  "Finance.FranchiseEarningRuns.currenciesMeasured": "Currencies measured",
  "Finance.FranchiseEarningRuns.skipReason": "Reason",
  "Finance.FranchiseEarningRuns.outcome.Calculated": "Calculated",
  "Finance.FranchiseEarningRuns.outcome.NoContract": "No contract",
  "Finance.FranchiseEarningRuns.outcome.Failed": "Failed",
  "Finance.FranchiseEarningRuns.outcome.PeriodNotAligned": "Period not aligned"
```

Turkish:

```json
  "Finance.FranchiseEarningRuns.title": "Franchise kazanç çalıştırmaları",
  "Finance.FranchiseEarningRuns.description": "Bir dönemde sözleşmesi olan her ülke için franchise kazançlarını hesaplar. Aynı dönemi yeniden çalıştırmak hesaplamayı tazeler.",
  "Finance.FranchiseEarningRuns.run": "Çalıştır",
  "Finance.FranchiseEarningRuns.periodStart": "Dönem başlangıcı",
  "Finance.FranchiseEarningRuns.periodEnd": "Dönem bitişi",
  "Finance.FranchiseEarningRuns.empty": "Bir dönem seçip çalıştırın.",
  "Finance.FranchiseEarningRuns.tenantsUnderContract": "Sözleşmeli",
  "Finance.FranchiseEarningRuns.tenantsWithActivity": "Hareketli",
  "Finance.FranchiseEarningRuns.calculatedCount": "Hesaplanan",
  "Finance.FranchiseEarningRuns.noContractCount": "Sözleşmesiz",
  "Finance.FranchiseEarningRuns.periodNotAlignedCount": "Dönem uyumsuz",
  "Finance.FranchiseEarningRuns.failedCount": "Başarısız",
  "Finance.FranchiseEarningRuns.noContractHint": "Bu ülkelerde hareket var ancak dönemi kapsayan sözleşme yok. Sözleşme ekleyip yeniden çalıştırın.",
  "Finance.FranchiseEarningRuns.periodNotAlignedHint": "Sözleşmeleri farklı bir döngüde faturalanıyor, bu pencere kazanç üretemez. Aynı dönemi yeniden çalıştırmak sonucu değiştirmez.",
  "Finance.FranchiseEarningRuns.failedHint": "Bu ülkeler için bir hata oluştu. Yeniden çalıştırmak güvenlidir.",
  "Finance.FranchiseEarningRuns.tenant": "Ülke",
  "Finance.FranchiseEarningRuns.outcome": "Sonuç",
  "Finance.FranchiseEarningRuns.earning": "Kazanç",
  "Finance.FranchiseEarningRuns.currenciesMeasured": "Ölçülen para birimleri",
  "Finance.FranchiseEarningRuns.skipReason": "Neden",
  "Finance.FranchiseEarningRuns.outcome.Calculated": "Hesaplandı",
  "Finance.FranchiseEarningRuns.outcome.NoContract": "Sözleşme yok",
  "Finance.FranchiseEarningRuns.outcome.Failed": "Başarısız",
  "Finance.FranchiseEarningRuns.outcome.PeriodNotAligned": "Dönem uyumsuz"
```

- [ ] **Step 3: The nav key**

`AbpUiNavigation` en / tr, beside the existing `FranchiseHqStatements` pair:

```json
  "FranchiseEarningRuns": "Franchise Earning Runs"
```
```json
  "FranchiseEarningRuns": "Franchise Kazanç Çalıştırmaları"
```

- [ ] **Step 4: Verify and commit**

`pnpm run init`, then `npm run type-check` (expect the 2 baseline errors), then check parity in all six files with `Object.keys(...).length` and a one-sided-key diff. Report the counts. Commit with an explicit pathspec.

---

### Task 2: Make the Track A contract detail tabbed

**Files:**
- Create: `contracts/franchise/[contractId]/layout.tsx`
- Create: `contracts/franchise/[contractId]/details/page.tsx` (moved)
- Create: `contracts/franchise/[contractId]/details/loading.tsx`
- Replace: `contracts/franchise/[contractId]/page.tsx` (becomes a redirect)
- Modify: `contracts/franchise/_components/table.tsx` (row link)
- Modify: `contracts/franchise/new/_components/form.tsx` (post-save prefix)
- Modify: `contracts/franchise/[contractId]/_components/delete-contract.tsx` (redirect)
- Modify: `apps/web/tests/unirefund/contracts/franchise/create.franchise.contract.spec.ts`

**Interfaces:**
- Produces: the tab shell Task 3 hangs `earnings` on.

**Mirror sub-project 1 exactly.** Read these three and follow their shape rather than inventing one:
- `parties/franchise-hqs/[partyId]/layout.tsx` — `SidebarTemplate`, permission-gated tab list
- `parties/franchise-hqs/[partyId]/page.tsx` — the bare-id redirector
- `parties/franchise-hqs/[partyId]/details/page.tsx` — a tab page

- [ ] **Step 1: Move the existing detail page**

`git mv` the current `[contractId]/page.tsx` to `[contractId]/details/page.tsx` so history follows it. Its imports of `./_components/form` and `./_components/delete-contract` become `../_components/...`. **Getting this depth wrong is the single most common defect in this codebase's route moves** — verify by type-check, not by eye.

Add `details/loading.tsx` mirroring the existing `[contractId]/loading.tsx`.

- [ ] **Step 2: The layout with two tabs**

Two tabs, each permission-gated, following the HQ layout's exact `SidebarTemplate` shape:

```ts
{
  id: "details",
  name: languageData["FranchiseContracts.Tab.Details"],
  icon: "Handshake",
  action: `${baseLink}details`,
  permissions: ["ContractService.FranchiseContract.ViewDetail"],
},
{
  id: "earnings",
  name: languageData["FranchiseContracts.Tab.Earnings"],
  icon: "DiamondPercent",
  action: `${baseLink}earnings`,
  permissions: ["ContractService.FranchiseEarning.ViewList"],
},
```

`Handshake` and `DiamondPercent` are both already in `data.ts`. **Do not invent an icon name** — an unknown one renders nothing.

**The `earnings` tab and its route ship in the same commit** (Task 3 creates the route). To avoid a menu entry pointing at nothing, include only the `details` tab in this task and add the `earnings` entry in Task 3. Sub-project 1 shipped a tab before its route and put a 404 in the menu; do not repeat it.

- [ ] **Step 3: The bare-id redirect**

`[contractId]/page.tsx` becomes a server redirect to `./details`, mirroring `parties/franchise-hqs/[partyId]/page.tsx`. Use an **absolute** `/${lang}/…` target — a relative redirect from a nested route lands one level short and 404s.

- [ ] **Step 4: Move the four referrers**

Each currently points at `/contracts/franchise/{id}`; each must now point at `/contracts/franchise/{id}/details`:
1. the list's `RowLink` in `contracts/franchise/_components/table.tsx`
2. `handlePostResponse`'s prefix in `contracts/franchise/new/_components/form.tsx`
3. `handleDeleteResponse`'s target in `[contractId]/_components/delete-contract.tsx`
4. the E2E spec's `waitForURL` / assertions

`grep -rn "contracts/franchise/" apps/web/src apps/web/tests` and confirm you have found every one. Report the grep output.

- [ ] **Step 5: Verify and commit**

`pnpm run init`, `type-check` (2 baseline), `lint` (0 errors), `npx playwright test --list tests/unirefund/contracts`. Confirm `/contracts/franchise/{id}` still reaches the form via the redirect. Commit with an explicit pathspec.

---

### Task 3: The earnings tab

**Files:**
- Create: `contracts/franchise/[contractId]/earnings/page.tsx`
- Create: `contracts/franchise/[contractId]/earnings/loading.tsx`
- Create: `contracts/franchise/[contractId]/earnings/_components/table.tsx`
- Modify: `contracts/franchise/[contractId]/layout.tsx` (add the `earnings` tab)

**Interfaces:**
- Consumes: `getFranchiseEarningsApi(data, session?)` — **GET, throws**. Filters: `franchiseContractId`, `franchiseTenantId`, `periodStartFrom`, `periodStartTo`, `maxResultCount`, `skipCount`, `sorting`.
- Consumes: Task 1's `FranchiseEarnings.*` keys.

Read `parties/franchise-hqs/[partyId]/contracts/page.tsx` and its `_components/table.tsx` — the same shape (a filtered list on a tab) and the closest working precedent.

- [ ] **Step 1: Page**

Server page gating on `ContractService.FranchiseEarning.ViewList`, fetching with `franchiseContractId: contractId` plus the search params, via the repo's `getApiRequests` + `structuredError` + `ErrorComponent` idiom. **No host check** — `contracts/layout.tsx` covers the subtree.

- [ ] **Step 2: Table**

`MasterDataGrid` from `$UniRefund_ContractService_Franchises_FranchiseEarnings_FranchiseEarningDto`, columns:

```
periodStart, feeBase, tagCount, salesAmount, grossRefundAmount, earningAmount, calculatedAt
```

Custom renderers:
- `periodStart` → `` `${row.original.periodStart?.slice(0,10)} — ${row.original.periodEnd?.slice(0,10)}` `` — slice the backend's own ISO string, **never** `new Date()`/`toISOString()`, which yields yesterday at UTC+3
- money columns → `` `${value} ${row.original.currency}` ``, matching the sibling franchise grids
- `feeBase` → the enum label; reuse the existing `FranchiseContracts.FeeBase.*` keys rather than adding new ones, the same way Track A's form does with `ui:enumNames`

`FranchiseEarningDto`'s scalars are **required** (unlike the statement DTOs), so no `??` guards are needed on `earningAmount`, `currency`, `tagCount` and friends — but `items` on the paged wrapper is still optional and nullable, so `response.items || []`.

**No `tableActions`** — earnings are produced by a run, never created here.

- [ ] **Step 3: Add the tab, same commit as the route**

Add the `earnings` entry from Task 2 Step 2 to `[contractId]/layout.tsx` now that the route exists.

- [ ] **Step 4: Verify and commit** — gates as above, plus confirm the layout now has exactly two tabs.

---

### Task 4: The earning-runs page

**Files:**
- Create: `finance/franchise-earning-runs/{page,loading}.tsx`
- Create: `finance/franchise-earning-runs/_components/{client,run-form,result}.tsx`
- Modify: `apps/web/src/components/sidebar-layout/data.ts` (nav entry)

**Interfaces:**
- Consumes: `postFranchiseEarningRunsRunApi(data)` — **POST, returns**. `{ requestBody: { periodStart, periodEnd } }` → `FranchiseEarningRunResultDto`.

```ts
FranchiseEarningRunResultDto = {
  periodStart, periodEnd: string;
  tenantsUnderContract, tenantsWithActivity, calculatedCount,
  noContractCount, periodNotAlignedCount, failedCount: number;
  items: Array<FranchiseEarningRunItemDto>;   // required, not nullable
}
FranchiseEarningRunItemDto = {
  franchiseTenantId: string;
  outcome: "Calculated" | "NoContract" | "Failed" | "PeriodNotAligned";
  earningAmount?: number | null;
  currency?: string | null;
  currenciesMeasured: Array<string>;
  skipReason?: string | null;
}
```

- [ ] **Step 1: Page** — thin server shell gating on `FinanceService.FranchiseEarningRuns.Run`, rendering the client. No data fetch: a run result is not persisted, so there is nothing to load.

- [ ] **Step 2: `run-form.tsx`** — a `SchemaForm` over `$UniRefund_FinanceService_FranchiseEarningRuns_RunFranchiseEarningsInput` with `name: "Finance.FranchiseEarningRuns"`, `"ui:widget": "date"` on **both** `periodStart` and `periodEnd`, and `submitText` = the `run` key.

  **`ui:widget: "date"` is not optional.** Both fields are `format: "date-time"`, and RJSF would otherwise pick `DateTimeWidget`, which puts a time picker on a date field and breaks hydration — its react-aria segments format literals through `Intl`, which resolves differently in Node and the browser. That defect shipped on the contract forms and was fixed on 2026-09-03.

  On submit, `startTransition`, POST, and on `res.type === "success"` hand the result up; otherwise `toast.error(res.message || languageData.error)`.

- [ ] **Step 3: `result.tsx`** — the breakdown. Six counts as labelled cards, then the per-tenant grid.

  **The three diagnostic counts each carry a distinct meaning and must be explained, not just numbered** — this is the page's whole point:
  - `noContractCount` → a setup gap: activity with no covering contract. Fixable, then re-run.
  - `periodNotAlignedCount` → the contract bills on a different cycle. **Re-running the same window will not change it**, so do not invite a retry.
  - `failedCount` → something went wrong; safe to run again.

  Render each hint next to its count, and only when the count is above zero. Grid columns: tenant, outcome (a `Badge`), earning + currency, currencies measured, skip reason. `earningAmount`/`currency`/`skipReason` are nullable — guard them; `currenciesMeasured` and `items` are required arrays.

  There is no tenant-name map on this screen, so show the raw `franchiseTenantId`. Say so in a comment; adding a lookup is a follow-up, not this task.

- [ ] **Step 4: `client.tsx`** — holds `result` state and `isPending`, renders the form then either the empty hint or `result.tsx`.

- [ ] **Step 5: Nav entry, same commit**

In `data.ts`, inside the `finance` group after `finance/franchise-hq-statements`:

```ts
{
  key: "finance/franchise-earning-runs",
  displayName: "FranchiseEarningRuns",
  href: "finance/franchise-earning-runs",
  icon: "TrendingUp",
  hostOnly: true,
  policies: ["FinanceService.FranchiseEarningRuns.Run"],
},
```

`TrendingUp` is already used by `finance/marketing-incentive`. Report the `hostOnly: true` count before and after as a measurement, not against an expected number.

- [ ] **Step 6: Verify and commit** — gates as above.

---

### Task 5: E2E spec and acceptance

**Files:**
- Create: `apps/web/tests/unirefund/finance/franchise-earning-runs.spec.ts`

- [ ] **Step 1: Spec** — mirror `tests/unirefund/finance/franchise-hq-statements.spec.ts`. One scenario: open the runs page, set a period, run, and assert the breakdown appears. Comment the data dependency at the top: the outcome depends entirely on seeded contracts and activity, so a zero-everything result is valid and must not fail the test.

  Selectors: `#root_periodStart`, `#root_periodEnd`, `#<formId> button[type="submit"]`, and the `data-testid`s Task 4 renders.

- [ ] **Step 2: Confirm it lists** — `npx playwright test --list tests/unirefund/finance`. **Do not claim it passed**; the suite cannot run here.

- [ ] **Step 3: Full acceptance** — `pnpm run init && npm run type-check` (2 baseline), `npm run lint` (0 errors), `npm run test:unit` (report as measured), and from the **repo root** `pnpm -w run i18n:missing` (expect 0) and `pnpm run grid:keys`.

- [ ] **Step 4: Route and endpoint check**

```bash
find "src/app/[lang]/(main)/(unirefund)/contracts/franchise" "src/app/[lang]/(main)/(unirefund)/finance/franchise-earning-runs" -name page.tsx | sort
grep -rn "toISOString" "src/app/[lang]/(main)/(unirefund)/finance/franchise-earning-runs" || echo clean
```

Confirm `/contracts/franchise/{id}` redirects to `/details`, the layout has two tabs, and no page beneath `contracts/layout.tsx` adds a host check. Then re-run the unused-wrapper audit and confirm only `getFranchiseEarningByIdApi` and `postFranchiseEarningCalculateApi` remain — both deliberate, per Global Constraints.

- [ ] **Step 5: Commit**

---

## Plan Self-Review

**Spec coverage.** Sub-project 5 asks for `contracts/franchise/[contractId]/earnings` (Tasks 2–3) and `finance/franchise-earning-runs/` (Task 4), with the run page rendering the outcome breakdown including `noContractCount`, `periodNotAlignedCount` and `failedCount` and what each means (Task 4 Step 3). The spec's "Deferred" note — no standalone global earnings list — is honoured: the only earnings list is filtered by `franchiseContractId`.

**Two deliberate departures, both stated above:** `postFranchiseEarningCalculateApi` and `getFranchiseEarningByIdApi` stay unused, because the first needs an `activityByCurrency` payload a back-office user cannot source and the second would duplicate the grid.

**The restructure is the risk.** Task 2 moves a shipped, reviewed route and four referrers. It is isolated into its own task so a reviewer can reject it independently, and Step 4 requires a repo-wide grep rather than trusting the list of four.

**Type consistency.** `FranchiseEarningDto` scalars are required and its paged `items` is nullable; `FranchiseEarningRunResultDto.items` and `FranchiseEarningRunItemDto.currenciesMeasured` are required while `earningAmount`, `currency` and `skipReason` are nullable. Each is stated at the point of use.

**i18n.** Every key in Task 1 has a named consumer in Tasks 2–4; the `feeBase` enum labels reuse the existing `FranchiseContracts.FeeBase.*` keys rather than duplicating them.

# Franchise HQ Statements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the host-only franchise HQ commission-statement screens — a list with a per-currency totals strip, a detail page with the per-store drill-down and a status action, and a draft-preview-then-create flow — under `finance/franchise-hq-statements/`.

**Architecture:** Three route groups under one `layout.tsx` that host-gates the whole subtree. The list is a server page composing `MasterDataGrid` plus a separately-fetched totals strip. The detail page renders the statement header, a shared store-detail grid, and a status-change dialog. The draft flow is a client-state screen: pick HQ + year + month, POST `form-draft` for a preview, then a single POST to create the whole month.

**Tech Stack:** Next.js 15 App Router (server components, `_`-prefixed private folders), generated FinanceService SDK types, `MasterDataGrid`, `Combobox`, `ConfirmDialog`, `react-hook-form` is **not** needed here (no validated entity form), i18n via `apps/web/src/language-data/**`.

**Spec:** `C:\unirefund\docs\superpowers\specs\2026-08-27-web-franchise-screens-design.md` — sub-project 3, plus "Placement" and "Forms".

---

## Global Constraints

- **Host-only.** `finance/franchise-hq-statements/layout.tsx` calls `requireHost(lang)`, gating the entire subtree. **No page beneath it adds its own host check.**
- **Never test for host with `!tenantId`.** A host session's `tenantId` is `Guid.Empty` (`"00000000-0000-0000-0000-000000000000"`), which is **truthy**. That bug shipped on this branch and was fixed. Use `isHostTenant()` / `requireHost(lang)`.
- **Server-action conventions.** GET actions take `(data, session?)` and **throw** `structuredError`; POST/PUT actions take `(data)` and **return** a structured response. There is no DELETE action here.
- **Type-check baseline is exactly 2 errors**, both `TS2307` for `@ayasofyazilim-clomerce/capture-core/detectors/mrz`. `tsc` exits non-zero because of them; that is the expected green state. A third error is a regression.
- Run `pnpm run init` before `type-check` — it regenerates the i18n resource types.
- **Unit-test totals are a reading, not a constant.** The suite contains an untracked file belonging to another session. Report what you see; never do arithmetic on totals.
- Lint: ~465 pre-existing repo-wide warnings, 0 errors. Only errors, and warnings in files you touch, count. **`react-require-testid/testid-missing` is severity `error`** — every interactive element needs a `data-testid`.
- **A `Combobox`'s `data-testid` is derived from its `id`.** A `data-testid` without an `id` never reaches the DOM. Set `id`, not `data-testid`, on a Combobox.
- **Never build a date string with `toISOString()`.** `setHours(0,0,0,0)` + `.toISOString().slice(0,10)` yields **yesterday** at UTC+3, the primary market. Use `toDateInputValue` from `apps/web/src/utils/date-input-value.ts`, or local getters (`new Date().getFullYear()` is fine).
- **All navigation targets are absolute** — `/${lang}/…`. A relative `"../"` lands one level short and 404s behind a success toast.
- **Every array field on every FinanceService franchise DTO is optional and nullable.** `items || []`, `storeDetails || []`. Unguarded mapping is a server-render crash.
- **Every scalar field on `FranchiseHqStatementDto` is optional** (`?:`) — unlike rebate's list DTO. Do not assume `id`, `status` or `currency` is present.
- Prettier is not a gate; the husky pre-commit hook may reformat staged files.
- Branch is `franchise-contract-update`. Do not branch, push, rebase or reset.
- **This checkout is shared with another agent session.** `git add` only your exact paths, then verify `git diff --cached --name-only` lists only your files, or commit with an explicit pathspec (`git commit -- <paths>`). Never `git add -A`, `git add .`, `git restore`, `git reset` or `git checkout` anything you did not create.

### Policy strings — the real ones

`packages/utils/policies/policies.json` is ground truth. The nine that exist:

```
FinanceService.FranchiseHqStatements
FinanceService.FranchiseHqStatements.ViewList
FinanceService.FranchiseHqStatements.ViewOwnList
FinanceService.FranchiseHqStatements.View
FinanceService.FranchiseHqStatements.ViewOwn
FinanceService.FranchiseHqStatements.FormDraft
FinanceService.FranchiseHqStatements.FormOwnDraft
FinanceService.FranchiseHqStatements.Create
FinanceService.FranchiseHqStatements.SetStatus
```

**There is no `.ViewDetail`, no `.Edit` and no `.Delete`.** The spec's implied verb list was wrong. Consequences, which are deliberate scope and not omissions:

- The detail page gates on `.View`, **not** `.ViewDetail`.
- **There is no edit screen and no delete dialog in this sub-project.** A statement is a financial record; the only mutation the backend exposes is `SetStatus`.

### Status enum

`FranchiseHqStatementDto.status` is `UniRefund_FinanceService_Enums_RebateStatementStatus` — literally the enum rebate statements use. 12 **string** literals:

```
Unfinished | Approved | Processing | Error | Sent | PaymentReminder1
PaymentReminder2 | PaymentReminder3 | DebtCollection | Cancelled | CreditNote | Paid
```

`getVariantByStatementStatus` in `apps/web/src/utils/badge-variants.ts` already accepts this type. **Do not add a franchise-specific status-badge helper.** All 12 `Finance.status.<Member>` i18n keys already exist in both locales — **do not re-add them.**

### Two pieces of the precedent that must NOT be copied

The spec says the draft flow "mirrors `finance/rebate-statements/bulk`". Mirror its *shape*, not these two details:

1. **The precedent's row selection is dead code.** `bulk/_components/client.tsx` declares `selectedRows` and never calls `setSelectedRows`, and its `MasterDataGrid` is passed no `selection` config — so its "Create Statements" trigger is `disabled` permanently. **This plan needs no row selection at all**: `CreateFranchiseHqStatementsInput` is `{ franchiseHqId, year, month }`, so one POST mints every linked country's statement for the month. There is nothing to select. Do not add selection state.
2. **The precedent fires one POST per row in parallel inside a `useEffect`.** Franchise create is a single request. Fire it once, from an `onConfirm`.

---

## File Structure

```
apps/web/src/app/[lang]/(main)/(unirefund)/finance/franchise-hq-statements/
├── layout.tsx                          # requireHost(lang) for the whole subtree
├── page.tsx                            # list (server): statements + currency totals
├── loading.tsx
├── _components/
│   ├── table.tsx                       # list MasterDataGrid (client)
│   ├── currency-totals.tsx             # per-currency totals strip (server-rendered, new pattern)
│   └── store-details.tsx               # shared per-store drill-down grid (client)
├── [id]/
│   ├── page.tsx                        # detail (server)
│   ├── loading.tsx
│   └── _components/
│       ├── header.tsx                  # statement header fields + status badge (client)
│       └── status-dialog.tsx           # SetStatus action (client, new pattern)
└── draft/
    ├── page.tsx                        # thin server shell: policy gate + HQ list fetch
    ├── loading.tsx
    └── _components/
        ├── client.tsx                  # state holder
        ├── preview-form.tsx            # HQ Combobox + year/month inputs + Preview button
        ├── drafts-table.tsx            # draft rows, expandable into store details
        └── create-dialog.tsx           # single-POST create, ConfirmDialog
```

`store-details.tsx` is shared by the detail page and the draft table. It lives in the **top-level** `_components/` because two sibling route folders consume it; a `_`-prefixed folder is private to its route but still importable by descendants, which is exactly this shape.

**Nav entry** ships in Task 2, the same commit as the route it points at. That rule is not cosmetic: sub-project 1 shipped a tab before its route and produced a 404 in the menu.

---

### Task 1: i18n keys

**Files:**
- Modify: `apps/web/src/language-data/unirefund/FinanceService/resources/en.json`
- Modify: `apps/web/src/language-data/unirefund/FinanceService/resources/tr.json`
- Modify: `apps/web/src/language-data/core/AbpUiNavigation/resources/en.json`
- Modify: `apps/web/src/language-data/core/AbpUiNavigation/resources/tr.json`

**Interfaces:**
- Produces: 31 `Finance.FranchiseHqStatements.*` keys read by Tasks 2–4, and 2 navigation keys: `FranchiseHqStatements` is read by Task 2's nav entry, `FranchiseHqStatements.Draft` by the nav action Task 4 adds.
- Consumes: nothing.

**Naming.** FinanceService resource files use **flat top-level keys** under a `Finance.` prefix. The franchise keys are namespaced `Finance.FranchiseHqStatements.<field-or-verb>`, matching both that flat style and the `FranchiseHqContracts.*` / `FranchiseHqs.*` convention already established on this branch in ContractService and CRMService. Both files currently hold **101** keys and contain zero `franchise` matches.

**Do not add** `Finance.status.*` (all 12 members already exist), `Finance.Form.year`, `Finance.Form.month`, or `Finance.Preview` — all four are reused as-is.

**Every key below has a named consumer.** A key with no reader is dead weight; the previous sub-project shipped one and it had to be removed in a follow-up commit.

- [ ] **Step 1: Add the FinanceService keys to `en.json`**

Insert these as top-level keys, keeping the file's existing ordering style (append them together as one block):

```json
  "Finance.FranchiseHqStatements.number": "Statement no",
  "Finance.FranchiseHqStatements.countryTenantId": "Country",
  "Finance.FranchiseHqStatements.period": "Period",
  "Finance.FranchiseHqStatements.tagCount": "Tags",
  "Finance.FranchiseHqStatements.salesAmount": "Sales",
  "Finance.FranchiseHqStatements.vatAmount": "VAT",
  "Finance.FranchiseHqStatements.commissionAmount": "Commission",
  "Finance.FranchiseHqStatements.rawCommissionAmount": "Commission before minimum",
  "Finance.FranchiseHqStatements.minimumMonthlyCommission": "Monthly minimum",
  "Finance.FranchiseHqStatements.minimumApplied": "Minimum applied",
  "Finance.FranchiseHqStatements.calculatedAt": "Calculated at",
  "Finance.FranchiseHqStatements.draft": "Preview a month",
  "Finance.FranchiseHqStatements.totals.title": "Commission by currency",
  "Finance.FranchiseHqStatements.totals.statementCount": "{0} statements",
  "Finance.FranchiseHqStatements.totals.empty": "No statements in this period.",
  "Finance.FranchiseHqStatements.totals.unfiltered": "Totals cover the whole period, ignoring the country and status filters.",
  "Finance.FranchiseHqStatements.storeDetails": "Stores",
  "Finance.FranchiseHqStatements.storeDetails.empty": "This statement has no store rows.",
  "Finance.FranchiseHqStatements.merchantName": "Store",
  "Finance.FranchiseHqStatements.bracketMinAmount": "Bracket from",
  "Finance.FranchiseHqStatements.appliedFixedFeeValue": "Fixed fee",
  "Finance.FranchiseHqStatements.appliedPercentFeeValue": "Percent fee",
  "Finance.FranchiseHqStatements.setStatus": "Change status",
  "Finance.FranchiseHqStatements.setStatus.description": "The new status is applied immediately. Whether a transition is allowed is decided by the backend.",
  "Finance.FranchiseHqStatements.draft.franchiseHqId": "Franchise HQ",
  "Finance.FranchiseHqStatements.draft.empty": "Pick an HQ and a month, then choose Preview.",
  "Finance.FranchiseHqStatements.draft.noContract": "No contract",
  "Finance.FranchiseHqStatements.draft.alreadyExists": "Already created",
  "Finance.FranchiseHqStatements.draft.create": "Create statements",
  "Finance.FranchiseHqStatements.draft.create.description": "One statement is created for every country with a covering contract and no existing statement for this month.",
  "Finance.FranchiseHqStatements.draft.create.nothingToCreate": "Nothing to create for this month."
```

- [ ] **Step 2: Add the same keys to `tr.json`**

```json
  "Finance.FranchiseHqStatements.number": "Ekstre no",
  "Finance.FranchiseHqStatements.countryTenantId": "Ülke",
  "Finance.FranchiseHqStatements.period": "Dönem",
  "Finance.FranchiseHqStatements.tagCount": "Etiket",
  "Finance.FranchiseHqStatements.salesAmount": "Satış",
  "Finance.FranchiseHqStatements.vatAmount": "KDV",
  "Finance.FranchiseHqStatements.commissionAmount": "Komisyon",
  "Finance.FranchiseHqStatements.rawCommissionAmount": "Minimum öncesi komisyon",
  "Finance.FranchiseHqStatements.minimumMonthlyCommission": "Aylık minimum",
  "Finance.FranchiseHqStatements.minimumApplied": "Minimum uygulandı",
  "Finance.FranchiseHqStatements.calculatedAt": "Hesaplanma zamanı",
  "Finance.FranchiseHqStatements.draft": "Ay önizle",
  "Finance.FranchiseHqStatements.totals.title": "Para birimine göre komisyon",
  "Finance.FranchiseHqStatements.totals.statementCount": "{0} ekstre",
  "Finance.FranchiseHqStatements.totals.empty": "Bu dönemde ekstre yok.",
  "Finance.FranchiseHqStatements.totals.unfiltered": "Toplamlar ülke ve durum filtrelerini yok sayarak tüm dönemi kapsar.",
  "Finance.FranchiseHqStatements.storeDetails": "Mağazalar",
  "Finance.FranchiseHqStatements.storeDetails.empty": "Bu ekstrenin mağaza satırı yok.",
  "Finance.FranchiseHqStatements.merchantName": "Mağaza",
  "Finance.FranchiseHqStatements.bracketMinAmount": "Dilim başlangıcı",
  "Finance.FranchiseHqStatements.appliedFixedFeeValue": "Sabit ücret",
  "Finance.FranchiseHqStatements.appliedPercentFeeValue": "Yüzde ücret",
  "Finance.FranchiseHqStatements.setStatus": "Durumu değiştir",
  "Finance.FranchiseHqStatements.setStatus.description": "Yeni durum hemen uygulanır. Bir geçişin izinli olup olmadığına arka uç karar verir.",
  "Finance.FranchiseHqStatements.draft.franchiseHqId": "Franchise merkezi",
  "Finance.FranchiseHqStatements.draft.empty": "Bir merkez ve ay seçip Önizle'ye basın.",
  "Finance.FranchiseHqStatements.draft.noContract": "Sözleşme yok",
  "Finance.FranchiseHqStatements.draft.alreadyExists": "Zaten oluşturuldu",
  "Finance.FranchiseHqStatements.draft.create": "Ekstreleri oluştur",
  "Finance.FranchiseHqStatements.draft.create.description": "Bu ay için kapsayan sözleşmesi olan ve henüz ekstresi bulunmayan her ülke için bir ekstre oluşturulur.",
  "Finance.FranchiseHqStatements.draft.create.nothingToCreate": "Bu ay için oluşturulacak bir şey yok."
```

- [ ] **Step 3: Add the two navigation keys**

Nav `displayName` and `description` are typed `keyof AbpUiNavigationResource`, so they live in the navigation resource, **not** in FinanceService. Add to `apps/web/src/language-data/core/AbpUiNavigation/resources/en.json`, beside the existing `"RebateStatements"` / `"RebateStatements.New"` pair:

```json
  "FranchiseHqStatements": "Franchise HQ Statements",
  "FranchiseHqStatements.Draft": "Preview a franchise month",
```

and to `tr.json`:

```json
  "FranchiseHqStatements": "Franchise Merkez Ekstreleri",
  "FranchiseHqStatements.Draft": "Franchise ayı önizle",
```

- [ ] **Step 4: Verify parity and regenerate**

```bash
cd apps/web && pnpm run init && npm run type-check 2>&1 | grep -c "error TS"
```

Expected: `2` — the baseline. Then verify parity in all four files:

```bash
node -e "
for (const p of [
  'apps/web/src/language-data/unirefund/FinanceService/resources',
  'apps/web/src/language-data/core/AbpUiNavigation/resources',
]) {
  const en = Object.keys(require('./' + p + '/en.json'));
  const tr = Object.keys(require('./' + p + '/tr.json'));
  console.log(p, en.length, tr.length, 'en-only:', en.filter(x => !tr.includes(x)), 'tr-only:', tr.filter(x => !en.includes(x)));
}"
```

Expected: FinanceService `132 132` with no one-sided keys; AbpUiNavigation equal counts with no one-sided keys. Report the actual numbers — the counts are readings, and if FinanceService is not 132/132 say so rather than adjusting a key to hit the number.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/language-data/unirefund/FinanceService/resources/en.json apps/web/src/language-data/unirefund/FinanceService/resources/tr.json apps/web/src/language-data/core/AbpUiNavigation/resources/en.json apps/web/src/language-data/core/AbpUiNavigation/resources/tr.json
git diff --cached --name-only   # must list only those four files
git commit -m "feat(franchise): add i18n keys for HQ commission statements"
```

---

### Task 2: Host-gated layout, list page, totals strip and nav entry

**Files:**
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/finance/franchise-hq-statements/layout.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/finance/franchise-hq-statements/page.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/finance/franchise-hq-statements/loading.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/finance/franchise-hq-statements/_components/table.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/finance/franchise-hq-statements/_components/currency-totals.tsx`
- Modify: `apps/web/src/components/sidebar-layout/data.ts`

**Interfaces:**
- Consumes: Task 1's keys; `getFranchiseHqStatementsApi(data, session?)` (throws), `getFranchiseHqStatementCurrencyTotalsApi(data, session?)` (throws), `resolveTenantNames()` (returns an empty `Map` on failure, never throws), `getVariantByStatementStatus`.
- Produces: the route the nav entry points at, and the row link target `/${lang}/finance/franchise-hq-statements/{id}` that Task 3 implements. Task 4 later modifies both `_components/table.tsx` and `data.ts` to add the draft action.

**The totals strip covers fewer filters than the list, on purpose.** `GetApiFinanceServiceFranchiseHqStatementsCurrencyTotalsData` accepts only `franchiseHqId`, `periodStartFrom` and `periodStartTo` — **not** `countryTenantId` and **not** `status`. So when either of those two filters is active, the totals do not describe the visible rows. Pass only the three supported filters, and render the `totals.unfiltered` note when `countryTenantId` or `status` is set. Silently showing totals that disagree with the grid would be a lying UI.

**A `Map` cannot cross the server→client boundary** as a serialised prop. Convert with `Object.fromEntries` in the page; the table's prop is `Record<string, string>`.

- [ ] **Step 1: Create the host gate**

`layout.tsx` — identical in shape to `contracts/layout.tsx`:

```tsx
import { requireHost } from "@/utils/require-host";

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  await requireHost(lang);
  return children;
}
```

- [ ] **Step 2: Create the loading skeleton**

Mirror `finance/rebate-statements/loading.tsx`. Read that file and copy its shape exactly rather than inventing one.

- [ ] **Step 3: Create the totals strip**

`_components/currency-totals.tsx` — a server component, no `"use client"`:

```tsx
import type { UniRefund_FinanceService_FranchiseHqStatements_FranchiseHqStatementCurrencyTotalDto as CurrencyTotalDto } from "@repo/saas/FinanceService";
import type { FinanceServiceResource } from "@/language-data/unirefund/FinanceService";

export default function CurrencyTotals({
  languageData,
  showUnfilteredNote,
  totals,
}: {
  languageData: FinanceServiceResource;
  showUnfilteredNote: boolean;
  totals: CurrencyTotalDto[];
}) {
  return (
    <div className="mb-4" data-testid="franchise-hq-statement-totals">
      <h2 className="mb-2 text-sm font-medium text-muted-foreground">
        {languageData["Finance.FranchiseHqStatements.totals.title"]}
      </h2>
      {totals.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {languageData["Finance.FranchiseHqStatements.totals.empty"]}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {totals.map((total) => (
            <div
              className="rounded-md border px-3 py-2"
              data-testid={`franchise-hq-statement-total-${total.currency ?? "unknown"}`}
              key={total.currency ?? "unknown"}
            >
              <div className="text-base font-semibold">
                {total.commissionAmount ?? 0} {total.currency}
              </div>
              <div className="text-xs text-muted-foreground">
                {languageData[
                  "Finance.FranchiseHqStatements.totals.statementCount"
                ].replace("{0}", String(total.statementCount ?? 0))}
              </div>
            </div>
          ))}
        </div>
      )}
      {showUnfilteredNote ? (
        <p
          className="mt-2 text-xs text-muted-foreground"
          data-testid="franchise-hq-statement-totals-note"
        >
          {languageData["Finance.FranchiseHqStatements.totals.unfiltered"]}
        </p>
      ) : null}
    </div>
  );
}
```

Amount formatting is `${amount} ${currency}`, matching the rebate list's `totalAmount` renderer. Do not introduce a new money-formatting dependency; `localizeCurrency` in `utils-number.ts` exists but is barely used and brings a locale argument this component does not have.

- [ ] **Step 4: Create the list page**

`page.tsx`:

```tsx
"use server";

import {
  getFranchiseHqStatementCurrencyTotalsApi,
  getFranchiseHqStatementsApi,
} from "@repo/actions/unirefund/FinanceService/actions";
import type { GetApiFinanceServiceFranchiseHqStatementsData } from "@repo/saas/FinanceService";
import ErrorComponent from "@repo/ui/components/error-component";
import { structuredError } from "@repo/utils/api";
import { auth } from "@repo/utils/auth/next-auth";
import { isUnauthorized } from "@repo/utils/policies";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { getResourceData } from "@/language-data/unirefund/FinanceService";
import { resolveTenantNames } from "@/utils/resolve-tenant-names";
import CurrencyTotals from "./_components/currency-totals";
import FranchiseHqStatementsTable from "./_components/table";

async function getApiRequests(
  searchParams: GetApiFinanceServiceFranchiseHqStatementsData
) {
  try {
    const session = await auth();
    const requiredRequests = await Promise.all([
      getFranchiseHqStatementsApi(searchParams, session),
    ]);
    // The totals endpoint accepts only these three filters, and a totals
    // failure must not take the list down.
    const optionalRequests = await Promise.allSettled([
      getFranchiseHqStatementCurrencyTotalsApi(
        {
          franchiseHqId: searchParams.franchiseHqId,
          periodStartFrom: searchParams.periodStartFrom,
          periodStartTo: searchParams.periodStartTo,
        },
        session
      ),
      resolveTenantNames(),
    ]);
    return { requiredRequests, optionalRequests };
  } catch (error) {
    if (!isRedirectError(error)) {
      return structuredError(error);
    }
    throw error;
  }
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<GetApiFinanceServiceFranchiseHqStatementsData>;
}) {
  const { lang } = await params;
  const resolvedSearchParams = await searchParams;
  const { languageData } = await getResourceData(lang);
  await isUnauthorized({
    requiredPolicies: ["FinanceService.FranchiseHqStatements.ViewList"],
    lang,
  });

  const apiRequests = await getApiRequests(resolvedSearchParams);
  if ("message" in apiRequests) {
    return (
      <ErrorComponent
        languageData={languageData}
        message={apiRequests.message}
      />
    );
  }

  const [statementsResponse] = apiRequests.requiredRequests;
  const [totalsResult, tenantNamesResult] = apiRequests.optionalRequests;
  const totals =
    totalsResult.status === "fulfilled" ? totalsResult.value.data : [];
  const tenantNames =
    tenantNamesResult.status === "fulfilled"
      ? Object.fromEntries(tenantNamesResult.value)
      : {};

  return (
    <>
      <CurrencyTotals
        languageData={languageData}
        showUnfilteredNote={Boolean(
          resolvedSearchParams.countryTenantId || resolvedSearchParams.status
        )}
        totals={totals}
      />
      <FranchiseHqStatementsTable
        languageData={languageData}
        response={statementsResponse.data}
        tenantNames={tenantNames}
      />
    </>
  );
}
```

- [ ] **Step 5: Create the list table**

`_components/table.tsx`:

```tsx
"use client";

import {
  MasterDataGrid,
  RowLink,
} from "@repo/ayasofyazilim-ui/custom/master-data-grid";
import { Badge } from "@repo/ayasofyazilim-ui/components/badge";
import {
  $UniRefund_FinanceService_FranchiseHqStatements_FranchiseHqStatementDto,
  type PagedResultDto_FranchiseHqStatementDto,
} from "@repo/saas/FinanceService";
import { useParams } from "next/navigation";
import { useTenant } from "@/providers/tenant";
import { getVariantByStatementStatus } from "@/utils/badge-variants";
import type { FinanceServiceResource } from "@/language-data/unirefund/FinanceService";

export default function FranchiseHqStatementsTable({
  languageData,
  response,
  tenantNames,
}: {
  languageData: FinanceServiceResource;
  response: PagedResultDto_FranchiseHqStatementDto;
  tenantNames: Record<string, string>;
}) {
  const { localization } = useTenant();
  const { lang } = useParams<{ lang: string }>();
  const base = `/${lang}/finance/franchise-hq-statements`;

  return (
    <MasterDataGrid
      data={response.items || []}
      config={{
        schema:
          $UniRefund_FinanceService_FranchiseHqStatements_FranchiseHqStatementDto,
        localization,
        rowCount: response.totalCount,
        schemaColumns: {
          mode: "include",
          sort: true,
          columns: [
            "number",
            "countryTenantId",
            "periodStart",
            "status",
            "commissionAmount",
          ],
        },
        t: {
          ...languageData,
          "column.number":
            languageData["Finance.FranchiseHqStatements.number"],
          "column.countryTenantId":
            languageData["Finance.FranchiseHqStatements.countryTenantId"],
          "column.periodStart":
            languageData["Finance.FranchiseHqStatements.period"],
          "column.status": languageData["Finance.status"],
          "column.commissionAmount":
            languageData["Finance.FranchiseHqStatements.commissionAmount"],
        },
        customRenderers: {
          number: ({ row }) => (
            <RowLink
              href={`${base}/${row.original.id}`}
              label={row.original.number || row.original.id}
            />
          ),
          countryTenantId: ({ row }) =>
            tenantNames[row.original.countryTenantId ?? ""] ??
            row.original.countryTenantId,
          status: ({ row }) =>
            row.original.status ? (
              <Badge variant={getVariantByStatementStatus(row.original.status)}>
                {languageData[`Finance.status.${row.original.status}`]}
              </Badge>
            ) : null,
          commissionAmount: ({ row }) =>
            `${row.original.commissionAmount ?? 0} ${row.original.currency ?? ""}`,
        },
      }}
    />
  );
}
```

The table carries **no `tableActions` yet** — its only action would point at the draft route, which does not exist until Task 4, which adds the action in the same commit as the route. Note the row link is on `number`, not a name column, and falls back to `id` because `number` is nullable. If `MasterDataGrid`'s `customRenderers` rejects the `({ row })` signature for these column ids, read `finance/rebate-statements/_components/table.tsx` and match its exact shape — do not cast to `any`.

- [ ] **Step 6: Add the nav entry**

In `apps/web/src/components/sidebar-layout/data.ts`, inside the `finance` group's `items` array, after the `finance/rebate-statements` entry:

```ts
    {
      key: "finance/franchise-hq-statements",
      displayName: "FranchiseHqStatements",
      href: "finance/franchise-hq-statements",
      icon: "ScrollText",
      hostOnly: true,
      policies: ["FinanceService.FranchiseHqStatements"],
    },
```

The entry ships with **no `actions` array**: its only action would point at the draft route, which Task 4 creates. Adding it here would put a 404 in the menu — exactly the mistake sub-project 1 made by shipping a tab before its route existed.

`ScrollText` is already in use in this file (vat-statements and rebate-statements both use it). **Do not invent an icon name** — an unknown name renders nothing. This is the first `hostOnly` leaf in the `finance` group; the group container itself stays visible to tenants, which is intended.

- [ ] **Step 7: Verify**

```bash
cd apps/web && pnpm run init && npm run type-check 2>&1 | grep "error TS"
```
Expected: exactly the 2 baseline `TS2307` mrz errors.

```bash
npm run lint 2>&1 | tail -5
```
Expected: 0 errors. Then confirm no warning names a file you created.

Count the `hostOnly` entries before and after your change and report both numbers — do not assert a fixed total, it is a reading:
```bash
grep -c "hostOnly: true" src/components/sidebar-layout/data.ts
```

- [ ] **Step 8: Commit**

```bash
git add "src/app/[lang]/(main)/(unirefund)/finance/franchise-hq-statements" src/components/sidebar-layout/data.ts
git diff --cached --name-only   # must list only your 5 new files + data.ts
git commit -m "feat(franchise): add HQ statement list, totals strip and nav entry"
```

---

### Task 3: Detail page, store drill-down and status action

**Files:**
- Create: `…/finance/franchise-hq-statements/[id]/page.tsx`
- Create: `…/finance/franchise-hq-statements/[id]/loading.tsx`
- Create: `…/finance/franchise-hq-statements/[id]/_components/header.tsx`
- Create: `…/finance/franchise-hq-statements/[id]/_components/status-dialog.tsx`
- Create: `…/finance/franchise-hq-statements/_components/store-details.tsx`

**Interfaces:**
- Consumes: Task 1's keys; `getFranchiseHqStatementByIdApi({ id }, session)` — **takes an object, not a bare id**, and throws on failure; `putFranchiseHqStatementStatusApi({ id, requestBody: { status } })` — returns; `resolveTenantNames()`.
- Produces: `StoreDetailsGrid`, consumed by Task 4's draft table.

**`storeDetails` is optional and nullable** — `statement.storeDetails || []`. Unguarded mapping is a server-render crash on a statement with no store rows.

**The status action has no precedent in this codebase.** Nothing in finance changes a statement's status today, and `putFranchiseHqStatementStatusApi` is the only PUT action in the whole FinanceService action package. It is therefore designed here, following the `ConfirmDialog` shape the franchise delete dialogs use: pick a status, confirm, fire, surface whatever comes back. **All 12 statuses are offered and no client-side transition rule is enforced** — which transitions are legal is the backend's decision, the same ruling already applied to franchise HQ delete in sub-project 1.

- [ ] **Step 1: Create the loading skeleton**

Mirror `finance/rebate-statements/[rebateStatementId]/loading.tsx`.

- [ ] **Step 2: Create the shared store-details grid**

`_components/store-details.tsx` — note this goes in the **top-level** `_components/`, not `[id]/_components/`, because Task 4 also consumes it:

```tsx
"use client";

import { MasterDataGrid } from "@repo/ayasofyazilim-ui/custom/master-data-grid";
import { $UniRefund_FinanceService_FranchiseHqStatements_FranchiseHqStatementStoreDetailDto } from "@repo/saas/FinanceService";
import { useTenant } from "@/providers/tenant";
import type { FinanceServiceResource } from "@/language-data/unirefund/FinanceService";

export interface StoreDetailRow {
  merchantId?: string;
  merchantName?: string | null;
  bracketMinAmount?: number;
  appliedFixedFeeValue?: number;
  appliedPercentFeeValue?: number;
  tagCount?: number;
  salesAmount?: number;
  vatAmount?: number;
  commissionAmount?: number;
}

export default function StoreDetailsGrid({
  currency,
  languageData,
  rows,
}: {
  currency?: string | null;
  languageData: FinanceServiceResource;
  rows: StoreDetailRow[];
}) {
  const { localization } = useTenant();

  if (rows.length === 0) {
    return (
      <p
        className="text-sm text-muted-foreground"
        data-testid="franchise-hq-statement-stores-empty"
      >
        {languageData["Finance.FranchiseHqStatements.storeDetails.empty"]}
      </p>
    );
  }

  return (
    <MasterDataGrid
      data={rows}
      config={{
        schema:
          $UniRefund_FinanceService_FranchiseHqStatements_FranchiseHqStatementStoreDetailDto,
        localization,
        rowCount: rows.length,
        schemaColumns: {
          mode: "include",
          columns: [
            "merchantName",
            "bracketMinAmount",
            "appliedFixedFeeValue",
            "appliedPercentFeeValue",
            "tagCount",
            "salesAmount",
            "vatAmount",
            "commissionAmount",
          ],
        },
        t: {
          ...languageData,
          "column.merchantName":
            languageData["Finance.FranchiseHqStatements.merchantName"],
          "column.bracketMinAmount":
            languageData["Finance.FranchiseHqStatements.bracketMinAmount"],
          "column.appliedFixedFeeValue":
            languageData["Finance.FranchiseHqStatements.appliedFixedFeeValue"],
          "column.appliedPercentFeeValue":
            languageData[
              "Finance.FranchiseHqStatements.appliedPercentFeeValue"
            ],
          "column.tagCount":
            languageData["Finance.FranchiseHqStatements.tagCount"],
          "column.salesAmount":
            languageData["Finance.FranchiseHqStatements.salesAmount"],
          "column.vatAmount":
            languageData["Finance.FranchiseHqStatements.vatAmount"],
          "column.commissionAmount":
            languageData["Finance.FranchiseHqStatements.commissionAmount"],
        },
        customRenderers: {
          salesAmount: ({ row }) =>
            `${row.original.salesAmount ?? 0} ${currency ?? ""}`,
          vatAmount: ({ row }) =>
            `${row.original.vatAmount ?? 0} ${currency ?? ""}`,
          commissionAmount: ({ row }) =>
            `${row.original.commissionAmount ?? 0} ${currency ?? ""}`,
        },
      }}
    />
  );
}
```

`StoreDetailRow` is declared locally rather than imported because there are **two** generated store-detail DTOs — the persisted one has an `id`, the draft one does not — and both must feed this grid. The local interface is the structural intersection. The grid's `schema` uses the persisted DTO's generated JSON schema; the extra `id` property it describes is not in `columns`, so it renders nothing.

- [ ] **Step 3: Create the status dialog**

`[id]/_components/status-dialog.tsx`:

```tsx
"use client";

import { putFranchiseHqStatementStatusApi } from "@repo/actions/unirefund/FinanceService/put-actions";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import ConfirmDialog from "@repo/ayasofyazilim-ui/custom/confirm-dialog";
import { Combobox } from "@repo/ayasofyazilim-ui/custom/combobox";
import type { UniRefund_FinanceService_Enums_RebateStatementStatus as StatementStatus } from "@repo/saas/FinanceService";
import { handlePutResponse } from "@repo/utils/api";
import { isActionGranted, useGrantedPolicies } from "@repo/utils/policies";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { FinanceServiceResource } from "@/language-data/unirefund/FinanceService";

const STATUSES: StatementStatus[] = [
  "Unfinished",
  "Approved",
  "Processing",
  "Error",
  "Sent",
  "PaymentReminder1",
  "PaymentReminder2",
  "PaymentReminder3",
  "DebtCollection",
  "Cancelled",
  "CreditNote",
  "Paid",
];

interface StatusOption {
  id: StatementStatus;
  name: string;
}

export default function StatusDialog({
  currentStatus,
  languageData,
  statementId,
}: {
  currentStatus?: StatementStatus;
  languageData: FinanceServiceResource;
  statementId: string;
}) {
  const router = useRouter();
  const { grantedPolicies } = useGrantedPolicies();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<StatementStatus | undefined>(
    currentStatus
  );

  if (
    !isActionGranted(
      ["FinanceService.FranchiseHqStatements.SetStatus"],
      grantedPolicies
    )
  ) {
    return null;
  }

  const options: StatusOption[] = STATUSES.map((status) => ({
    id: status,
    name: languageData[`Finance.status.${status}`],
  }));

  return (
    <div className="flex items-end gap-2">
      <Combobox<StatusOption>
        disabled={isPending}
        emptyValue={languageData["Select.EmptyValue"]}
        id="franchise-hq-statement-status"
        list={options}
        onValueChange={(value) => {
          setSelected(value?.id);
        }}
        searchPlaceholder={languageData["Select.Placeholder"]}
        searchResultLabel={languageData["Select.ResultLabel"]}
        selectIdentifier="id"
        selectLabel="name"
        value={options.find((option) => option.id === selected)}
      />
      <ConfirmDialog
        confirmProps={{
          children: languageData["Finance.FranchiseHqStatements.setStatus"],
          closeAfterConfirm: true,
          onConfirm: () => {
            if (!selected) return;
            startTransition(() => {
              // Which transitions are legal is the backend's decision; this
              // surfaces whatever it returns rather than guessing a rule.
              void putFranchiseHqStatementStatusApi({
                id: statementId,
                requestBody: { status: selected },
              }).then((response) => {
                handlePutResponse(response, router);
              });
            });
          },
        }}
        description={
          languageData["Finance.FranchiseHqStatements.setStatus.description"]
        }
        title={languageData["Finance.FranchiseHqStatements.setStatus"]}
        type="without-trigger"
      >
        <Button
          data-testid="franchise-hq-statement-status-submit"
          disabled={isPending || !selected || selected === currentStatus}
          type="button"
          variant="outline"
        >
          <RefreshCw className="size-4" />
          {languageData["Finance.FranchiseHqStatements.setStatus"]}
        </Button>
      </ConfirmDialog>
    </div>
  );
}
```

The submit button is disabled while the selection equals the current status, so the dialog cannot fire a no-op PUT. Verify `RefreshCw` is already imported somewhere in `apps/web/src` before using it; if it is not, use an icon that is.

- [ ] **Step 4: Create the header component**

`[id]/_components/header.tsx` — a client component so it can host the status dialog:

```tsx
"use client";

import { Badge } from "@repo/ayasofyazilim-ui/components/badge";
import type { UniRefund_FinanceService_FranchiseHqStatements_FranchiseHqStatementDetailDto as StatementDetailDto } from "@repo/saas/FinanceService";
import { getVariantByStatementStatus } from "@/utils/badge-variants";
import type { FinanceServiceResource } from "@/language-data/unirefund/FinanceService";
import StatusDialog from "./status-dialog";

export default function StatementHeader({
  countryName,
  languageData,
  statement,
}: {
  countryName: string;
  languageData: FinanceServiceResource;
  statement: StatementDetailDto;
}) {
  const fields: { label: string; value: React.ReactNode }[] = [
    {
      label: languageData["Finance.FranchiseHqStatements.number"],
      value: statement.number || statement.id,
    },
    {
      label: languageData["Finance.FranchiseHqStatements.countryTenantId"],
      value: countryName,
    },
    {
      label: languageData["Finance.FranchiseHqStatements.period"],
      value: `${statement.periodStart?.slice(0, 10) ?? ""} — ${statement.periodEnd?.slice(0, 10) ?? ""}`,
    },
    {
      label: languageData["Finance.FranchiseHqStatements.tagCount"],
      value: statement.tagCount ?? 0,
    },
    {
      label: languageData["Finance.FranchiseHqStatements.salesAmount"],
      value: `${statement.salesAmount ?? 0} ${statement.currency ?? ""}`,
    },
    {
      label: languageData["Finance.FranchiseHqStatements.vatAmount"],
      value: `${statement.vatAmount ?? 0} ${statement.currency ?? ""}`,
    },
    {
      label: languageData["Finance.FranchiseHqStatements.rawCommissionAmount"],
      value: `${statement.rawCommissionAmount ?? 0} ${statement.currency ?? ""}`,
    },
    {
      label:
        languageData["Finance.FranchiseHqStatements.minimumMonthlyCommission"],
      value: `${statement.minimumMonthlyCommission ?? 0} ${statement.currency ?? ""}`,
    },
    {
      label: languageData["Finance.FranchiseHqStatements.commissionAmount"],
      value: `${statement.commissionAmount ?? 0} ${statement.currency ?? ""}`,
    },
    {
      label: languageData["Finance.FranchiseHqStatements.calculatedAt"],
      value: statement.calculatedAt?.slice(0, 10) ?? "",
    },
  ];

  return (
    <div className="mb-6" data-testid="franchise-hq-statement-header">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-2">
          {statement.status ? (
            <Badge variant={getVariantByStatementStatus(statement.status)}>
              {languageData[`Finance.status.${statement.status}`]}
            </Badge>
          ) : null}
          {statement.minimumApplied ? (
            <Badge variant="outline">
              {languageData["Finance.FranchiseHqStatements.minimumApplied"]}
            </Badge>
          ) : null}
        </div>
        {statement.id ? (
          <StatusDialog
            currentStatus={statement.status}
            languageData={languageData}
            statementId={statement.id}
          />
        ) : null}
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-3">
        {fields.map((field) => (
          <div key={field.label}>
            <dt className="text-xs text-muted-foreground">{field.label}</dt>
            <dd className="text-sm font-medium">{field.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
```

`periodStart?.slice(0, 10)` takes the date part of the backend's ISO string as-is. It does **not** construct a date — no `new Date()`, no `toISOString()` — so there is no timezone shift to get wrong.

- [ ] **Step 5: Create the detail page**

`[id]/page.tsx`:

```tsx
"use server";

import { getFranchiseHqStatementByIdApi } from "@repo/actions/unirefund/FinanceService/actions";
import ErrorComponent from "@repo/ui/components/error-component";
import { structuredError } from "@repo/utils/api";
import { auth } from "@repo/utils/auth/next-auth";
import { isUnauthorized } from "@repo/utils/policies";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { getResourceData } from "@/language-data/unirefund/FinanceService";
import { resolveTenantNames } from "@/utils/resolve-tenant-names";
import StoreDetailsGrid from "../_components/store-details";
import StatementHeader from "./_components/header";

async function getApiRequests(id: string) {
  try {
    const session = await auth();
    const requiredRequests = await Promise.all([
      getFranchiseHqStatementByIdApi({ id }, session),
    ]);
    const optionalRequests = await Promise.allSettled([resolveTenantNames()]);
    return { requiredRequests, optionalRequests };
  } catch (error) {
    if (!isRedirectError(error)) {
      return structuredError(error);
    }
    throw error;
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; lang: string }>;
}) {
  const { id, lang } = await params;
  const { languageData } = await getResourceData(lang);
  await isUnauthorized({
    requiredPolicies: ["FinanceService.FranchiseHqStatements.View"],
    lang,
  });

  const apiRequests = await getApiRequests(id);
  if ("message" in apiRequests) {
    return (
      <ErrorComponent
        languageData={languageData}
        message={apiRequests.message}
      />
    );
  }

  const [statementResponse] = apiRequests.requiredRequests;
  const [tenantNamesResult] = apiRequests.optionalRequests;
  const statement = statementResponse.data;
  const tenantNames =
    tenantNamesResult.status === "fulfilled"
      ? tenantNamesResult.value
      : new Map<string, string>();
  const countryName =
    tenantNames.get(statement.countryTenantId ?? "") ??
    statement.countryTenantId ??
    "";

  return (
    <div className="p-4">
      <StatementHeader
        countryName={countryName}
        languageData={languageData}
        statement={statement}
      />
      <h2 className="mb-2 text-sm font-medium text-muted-foreground">
        {languageData["Finance.FranchiseHqStatements.storeDetails"]}
      </h2>
      <StoreDetailsGrid
        currency={statement.currency}
        languageData={languageData}
        rows={statement.storeDetails || []}
      />
    </div>
  );
}
```

The `Map` is used server-side only here — a single lookup for one country name — so nothing crosses the boundary and no `Object.fromEntries` is needed. Contrast Task 2, where the whole map is a client prop and must be converted.

- [ ] **Step 6: Verify**

```bash
cd apps/web && pnpm run init && npm run type-check 2>&1 | grep "error TS"
npm run lint 2>&1 | tail -5
```
Expected: exactly the 2 baseline `TS2307` errors; 0 lint errors and no warning in a file you created.

- [ ] **Step 7: Commit**

```bash
git add "src/app/[lang]/(main)/(unirefund)/finance/franchise-hq-statements/[id]" "src/app/[lang]/(main)/(unirefund)/finance/franchise-hq-statements/_components/store-details.tsx"
git diff --cached --name-only   # must list only your 5 new files
git commit -m "feat(franchise): add HQ statement detail, store drill-down and status action"
```

---

### Task 4: Draft preview and create flow

**Files:**
- Create: `…/finance/franchise-hq-statements/draft/page.tsx`
- Create: `…/finance/franchise-hq-statements/draft/loading.tsx`
- Create: `…/finance/franchise-hq-statements/draft/_components/client.tsx`
- Create: `…/finance/franchise-hq-statements/draft/_components/preview-form.tsx`
- Create: `…/finance/franchise-hq-statements/draft/_components/drafts-table.tsx`
- Create: `…/finance/franchise-hq-statements/draft/_components/create-dialog.tsx`
- Modify: `…/finance/franchise-hq-statements/_components/table.tsx` (add the draft table action)
- Modify: `apps/web/src/components/sidebar-layout/data.ts` (add the draft nav action)

**Interfaces:**
- Consumes: Task 1's keys; Task 3's `StoreDetailsGrid` and its exported `StoreDetailRow`; `getFranchiseHqsApi(data, session?)` (throws) for the HQ picker; `postFranchiseHqStatementsFormDraftApi(data)` (returns) for the preview; `postFranchiseHqStatementsApi(data)` (returns) for the create.
- Produces: nothing consumed elsewhere.

**Request shapes, verbatim from the generated types:**

```ts
// preview — franchiseHqId is optional+nullable here (the FormOwnDraft carve-out)
FormFranchiseHqStatementDraftInput = { franchiseHqId?: string | null; year: number; month: number }
// create — all three REQUIRED
CreateFranchiseHqStatementsInput = { franchiseHqId: string; year: number; month: number }
```

Both actions wrap the input in `requestBody`. The preview returns `Array<FranchiseHqStatementDraftDto>`; the create returns `Array<FranchiseHqStatementDto>`.

**There is no row selection in this flow.** One create request covers the whole HQ-month. Do not add selection state — see the Global Constraints note on the precedent's dead selection code.

**`hasContract` and `statementAlreadyExists` are both `?: boolean`** — `undefined` is possible, so compare explicitly rather than relying on truthiness alone. A country with `hasContract === false` is listed **deliberately**, so a missing contract is visible rather than silently absent, and it carries no figures and cannot be created. A country with `statementAlreadyExists === true` is likewise shown but not creatable. Both states must be visible in the table.

- [ ] **Step 1: Create the loading skeleton**

Mirror `finance/rebate-statements/bulk/loading.tsx`.

- [ ] **Step 2: Create the server shell**

`draft/page.tsx` — gates the policy and fetches the HQ list for the picker, nothing else:

```tsx
"use server";

import { getFranchiseHqsApi } from "@repo/actions/unirefund/CRMService/actions";
import ErrorComponent from "@repo/ui/components/error-component";
import { structuredError } from "@repo/utils/api";
import { auth } from "@repo/utils/auth/next-auth";
import { isUnauthorized } from "@repo/utils/policies";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { getResourceData } from "@/language-data/unirefund/FinanceService";
import DraftClient from "./_components/client";

async function getApiRequests() {
  try {
    const session = await auth();
    const requiredRequests = await Promise.all([
      getFranchiseHqsApi({ maxResultCount: 1000 }, session),
    ]);
    const optionalRequests = await Promise.allSettled([]);
    return { requiredRequests, optionalRequests };
  } catch (error) {
    if (!isRedirectError(error)) {
      return structuredError(error);
    }
    throw error;
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const { languageData } = await getResourceData(lang);
  await isUnauthorized({
    requiredPolicies: ["FinanceService.FranchiseHqStatements.FormDraft"],
    lang,
  });

  const apiRequests = await getApiRequests();
  if ("message" in apiRequests) {
    return (
      <ErrorComponent
        languageData={languageData}
        message={apiRequests.message}
      />
    );
  }
  const [hqsResponse] = apiRequests.requiredRequests;

  return (
    <DraftClient
      hqs={(hqsResponse.data.items || []).map((hq) => ({
        id: hq.id ?? "",
        name: hq.name ?? hq.id ?? "",
      }))}
      languageData={languageData}
    />
  );
}
```

`getFranchiseHqsApi(data, session?)` and its list row's `id?: string` / `name?: string | null` fields are both verified against `packages/actions/unirefund/CRMService/actions.ts:952` and `UniRefund_CRMService_FranchiseHqs_FranchiseHqDto`, so the mapping above is correct as written.

- [ ] **Step 3: Create the state holder**

`draft/_components/client.tsx`:

```tsx
"use client";

import type { UniRefund_FinanceService_FranchiseHqStatements_FranchiseHqStatementDraftDto as DraftDto } from "@repo/saas/FinanceService";
import { useState, useTransition } from "react";
import type { FinanceServiceResource } from "@/language-data/unirefund/FinanceService";
import CreateDialog from "./create-dialog";
import DraftsTable from "./drafts-table";
import PreviewForm from "./preview-form";

export interface HqOption {
  id: string;
  name: string;
}

export interface DraftPeriod {
  year: number;
  month: number;
}

export default function DraftClient({
  hqs,
  languageData,
}: {
  hqs: HqOption[];
  languageData: FinanceServiceResource;
}) {
  const now = new Date();
  const [isPending, startTransition] = useTransition();
  const [hqId, setHqId] = useState<string>("");
  const [period, setPeriod] = useState<DraftPeriod>({
    // Local getters. Never derive a date part from toISOString() — at UTC+3
    // that lands on the previous day.
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });
  const [drafts, setDrafts] = useState<DraftDto[]>([]);

  const creatable = drafts.filter(
    (draft) =>
      draft.hasContract === true && draft.statementAlreadyExists !== true
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <PreviewForm
        hqId={hqId}
        hqs={hqs}
        isPending={isPending}
        languageData={languageData}
        period={period}
        setDrafts={setDrafts}
        setHqId={setHqId}
        setPeriod={setPeriod}
        startTransition={startTransition}
      />
      {drafts.length === 0 ? (
        <p
          className="text-sm text-muted-foreground"
          data-testid="franchise-hq-statement-draft-empty"
        >
          {languageData["Finance.FranchiseHqStatements.draft.empty"]}
        </p>
      ) : (
        <>
          <DraftsTable
            drafts={drafts}
            languageData={languageData}
          />
          <CreateDialog
            creatableCount={creatable.length}
            hqId={hqId}
            isPending={isPending}
            languageData={languageData}
            period={period}
            setDrafts={setDrafts}
            startTransition={startTransition}
          />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create the preview form**

`draft/_components/preview-form.tsx` — mirrors `rebate-statements/bulk/_components/preview-form.tsx`, with a Combobox added for the HQ:

```tsx
"use client";

import { postFranchiseHqStatementsFormDraftApi } from "@repo/actions/unirefund/FinanceService/post-actions";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import { Input } from "@repo/ayasofyazilim-ui/components/input";
import { toast } from "@repo/ayasofyazilim-ui/components/sonner";
import { Combobox } from "@repo/ayasofyazilim-ui/custom/combobox";
import type { UniRefund_FinanceService_FranchiseHqStatements_FranchiseHqStatementDraftDto as DraftDto } from "@repo/saas/FinanceService";
import type { Dispatch, SetStateAction, TransitionStartFunction } from "react";
import type { FinanceServiceResource } from "@/language-data/unirefund/FinanceService";
import type { DraftPeriod, HqOption } from "./client";

export default function PreviewForm({
  hqId,
  hqs,
  isPending,
  languageData,
  period,
  setDrafts,
  setHqId,
  setPeriod,
  startTransition,
}: {
  hqId: string;
  hqs: HqOption[];
  isPending: boolean;
  languageData: FinanceServiceResource;
  period: DraftPeriod;
  setDrafts: Dispatch<SetStateAction<DraftDto[]>>;
  setHqId: Dispatch<SetStateAction<string>>;
  setPeriod: Dispatch<SetStateAction<DraftPeriod>>;
  startTransition: TransitionStartFunction;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-64">
        <span className="mb-1 block text-xs text-muted-foreground">
          {languageData["Finance.FranchiseHqStatements.draft.franchiseHqId"]}
        </span>
        <Combobox<HqOption>
          disabled={isPending}
          emptyValue={languageData["Select.EmptyValue"]}
          id="franchise-hq-statement-draft-hq"
          list={hqs}
          onValueChange={(value) => {
            setHqId(value?.id || "");
          }}
          searchPlaceholder={languageData["Select.Placeholder"]}
          searchResultLabel={languageData["Select.ResultLabel"]}
          selectIdentifier="id"
          selectLabel="name"
          value={hqs.find((hq) => hq.id === hqId)}
        />
      </div>
      <div>
        <span className="mb-1 block text-xs text-muted-foreground">
          {languageData["Finance.Form.year"]}
        </span>
        <Input
          data-testid="franchise-hq-statement-draft-year"
          disabled={isPending}
          max={new Date().getFullYear() + 1}
          min={2020}
          onChange={(e) => {
            setPeriod((prev) => ({ ...prev, year: e.target.valueAsNumber }));
          }}
          step="1"
          type="number"
          value={period.year}
        />
      </div>
      <div>
        <span className="mb-1 block text-xs text-muted-foreground">
          {languageData["Finance.Form.month"]}
        </span>
        <Input
          data-testid="franchise-hq-statement-draft-month"
          disabled={isPending}
          max={12}
          min={1}
          onChange={(e) => {
            setPeriod((prev) => ({ ...prev, month: e.target.valueAsNumber }));
          }}
          step="1"
          type="number"
          value={period.month}
        />
      </div>
      <Button
        data-testid="franchise-hq-statement-draft-preview"
        disabled={isPending || !hqId}
        onClick={() => {
          startTransition(() => {
            setDrafts([]);
            void postFranchiseHqStatementsFormDraftApi({
              requestBody: {
                franchiseHqId: hqId,
                year: period.year,
                month: period.month,
              },
            }).then((res) => {
              if (res.type === "success") {
                setDrafts(res.data);
              } else {
                toast.error(res.message || languageData.error);
              }
            });
          });
        }}
      >
        {languageData["Finance.Preview"]}
      </Button>
    </div>
  );
}
```

The Preview button is disabled until an HQ is picked: `franchiseHqId` is optional in the draft input only because of the `FormOwnDraft` claim-scoped carve-out, and this is the back-office screen where it must be supplied.

- [ ] **Step 5: Create the drafts table**

`draft/_components/drafts-table.tsx` — one row per country, expandable into the store rows:

```tsx
"use client";

import { Badge } from "@repo/ayasofyazilim-ui/components/badge";
import { MasterDataGrid } from "@repo/ayasofyazilim-ui/custom/master-data-grid";
import {
  $UniRefund_FinanceService_FranchiseHqStatements_FranchiseHqStatementDraftDto,
  type UniRefund_FinanceService_FranchiseHqStatements_FranchiseHqStatementDraftDto as DraftDto,
} from "@repo/saas/FinanceService";
import { useTenant } from "@/providers/tenant";
import type { FinanceServiceResource } from "@/language-data/unirefund/FinanceService";
import StoreDetailsGrid from "../../_components/store-details";

export default function DraftsTable({
  drafts,
  languageData,
}: {
  drafts: DraftDto[];
  languageData: FinanceServiceResource;
}) {
  const { localization } = useTenant();

  return (
    <MasterDataGrid
      data={drafts}
      config={{
        schema:
          $UniRefund_FinanceService_FranchiseHqStatements_FranchiseHqStatementDraftDto,
        localization,
        rowCount: drafts.length,
        schemaColumns: {
          mode: "include",
          columns: [
            "countryTenantId",
            "tagCount",
            "salesAmount",
            "commissionAmount",
          ],
        },
        t: {
          ...languageData,
          "column.countryTenantId":
            languageData["Finance.FranchiseHqStatements.countryTenantId"],
          "column.tagCount":
            languageData["Finance.FranchiseHqStatements.tagCount"],
          "column.salesAmount":
            languageData["Finance.FranchiseHqStatements.salesAmount"],
          "column.commissionAmount":
            languageData["Finance.FranchiseHqStatements.commissionAmount"],
        },
        customRenderers: {
          countryTenantId: ({ row }) => (
            <div className="flex items-center gap-2">
              <span>{row.original.countryTenantId}</span>
              {row.original.hasContract === false ? (
                <Badge variant="destructive">
                  {
                    languageData[
                      "Finance.FranchiseHqStatements.draft.noContract"
                    ]
                  }
                </Badge>
              ) : null}
              {row.original.statementAlreadyExists === true ? (
                <Badge variant="outline">
                  {
                    languageData[
                      "Finance.FranchiseHqStatements.draft.alreadyExists"
                    ]
                  }
                </Badge>
              ) : null}
            </div>
          ),
          salesAmount: ({ row }) =>
            `${row.original.salesAmount ?? 0} ${row.original.currency ?? ""}`,
          commissionAmount: ({ row }) =>
            `${row.original.commissionAmount ?? 0} ${row.original.currency ?? ""}`,
        },
        expansion: {
          enabled: true,
          expanderColumns: ["countryTenantId"],
          renderContent: (row: DraftDto) => (
            <StoreDetailsGrid
              currency={row.currency}
              languageData={languageData}
              rows={row.storeDetails || []}
            />
          ),
        },
      }}
    />
  );
}
```

The expansion config above is the real `RowExpansionConfig` shape, verified against `packages/ayasofyazilim-ui/src/custom/master-data-grid/types.ts:177` and the working call site at `finance/rebate-statements/bulk/_components/client.tsx:104`. Three things matter and are easy to get wrong: the callback is named **`renderContent`**, not `expandedContent`; `enabled: true` is required or nothing expands; and `expanderColumns` names the column whose cell carries the expander control. Use it as written — do not cast to `any`, and do not leave a non-functional expander.

The country column shows the raw `countryTenantId`: the draft response carries no tenant name, and this screen has no tenant-name map. That is a deliberate, reported limitation, not an oversight — if it needs names, the page must fetch and pass them, which is out of this task's scope.

- [ ] **Step 6: Create the create dialog**

`draft/_components/create-dialog.tsx`:

```tsx
"use client";

import { postFranchiseHqStatementsApi } from "@repo/actions/unirefund/FinanceService/post-actions";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import ConfirmDialog from "@repo/ayasofyazilim-ui/custom/confirm-dialog";
import { handlePostResponse } from "@repo/utils/api";
import { isActionGranted, useGrantedPolicies } from "@repo/utils/policies";
import type { UniRefund_FinanceService_FranchiseHqStatements_FranchiseHqStatementDraftDto as DraftDto } from "@repo/saas/FinanceService";
import { PlusCircle } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import type { Dispatch, SetStateAction, TransitionStartFunction } from "react";
import type { FinanceServiceResource } from "@/language-data/unirefund/FinanceService";
import type { DraftPeriod } from "./client";

export default function CreateDialog({
  creatableCount,
  hqId,
  isPending,
  languageData,
  period,
  setDrafts,
  startTransition,
}: {
  creatableCount: number;
  hqId: string;
  isPending: boolean;
  languageData: FinanceServiceResource;
  period: DraftPeriod;
  setDrafts: Dispatch<SetStateAction<DraftDto[]>>;
  startTransition: TransitionStartFunction;
}) {
  const router = useRouter();
  const { lang } = useParams<{ lang: string }>();
  const { grantedPolicies } = useGrantedPolicies();

  if (
    !isActionGranted(
      ["FinanceService.FranchiseHqStatements.Create"],
      grantedPolicies
    )
  ) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <ConfirmDialog
        confirmProps={{
          children: languageData["Finance.FranchiseHqStatements.draft.create"],
          closeAfterConfirm: true,
          onConfirm: () => {
            startTransition(() => {
              // One request mints every eligible country's statement for the
              // month; the endpoint decides which countries qualify.
              void postFranchiseHqStatementsApi({
                requestBody: {
                  franchiseHqId: hqId,
                  year: period.year,
                  month: period.month,
                },
              }).then((response) => {
                setDrafts([]);
                handlePostResponse(
                  response,
                  router,
                  `/${lang}/finance/franchise-hq-statements`
                );
              });
            });
          },
        }}
        description={
          languageData[
            "Finance.FranchiseHqStatements.draft.create.description"
          ]
        }
        title={languageData["Finance.FranchiseHqStatements.draft.create"]}
        type="without-trigger"
      >
        <Button
          data-testid="franchise-hq-statement-draft-create"
          disabled={isPending || creatableCount === 0 || !hqId}
          type="button"
        >
          <PlusCircle className="size-4" />
          {languageData["Finance.FranchiseHqStatements.draft.create"]}
        </Button>
      </ConfirmDialog>
      {creatableCount === 0 ? (
        <span
          className="text-xs text-muted-foreground"
          data-testid="franchise-hq-statement-draft-nothing"
        >
          {
            languageData[
              "Finance.FranchiseHqStatements.draft.create.nothingToCreate"
            ]
          }
        </span>
      ) : null}
    </div>
  );
}
```

`handlePostResponse`'s third argument is an **absolute** prefix. The create returns an array rather than a single entity, so it redirects to the list, not to one statement.

- [ ] **Step 7: Wire the two entry points — same commit as the route**

Now that `draft/page.tsx` exists, add the ways in. Both were deliberately withheld from Task 2 so that no link ever pointed at a missing route.

In `_components/table.tsx`, restore the two imports:

```tsx
import { isActionGranted, useGrantedPolicies } from "@repo/utils/policies";
import { PackagePlus } from "lucide-react";
```

re-add the hook:

```tsx
  const { grantedPolicies } = useGrantedPolicies();
```

and add the action to the grid config, after `customRenderers`:

```tsx
        tableActions: [
          {
            id: "franchise-hq-statement-draft",
            type: "link",
            icon: PackagePlus,
            label: languageData["Finance.FranchiseHqStatements.draft"],
            href: `${base}/draft`,
            hidden: () =>
              !isActionGranted(
                ["FinanceService.FranchiseHqStatements.FormDraft"],
                grantedPolicies
              ),
          },
        ],
```

`PackagePlus` is already used by rebate-statements' bulk action, so it is a verified name.

In `apps/web/src/components/sidebar-layout/data.ts`, add the `actions` array to the `finance/franchise-hq-statements` entry:

```ts
      actions: [
        {
          key: "finance/franchise-hq-statements/draft",
          displayName: "FranchiseHqStatements.Draft",
          description: "FranchiseHqStatements.Draft",
          href: "finance/franchise-hq-statements/draft",
          icon: "DiamondPlus",
          hostOnly: true,
          policies: ["FinanceService.FranchiseHqStatements.FormDraft"],
        },
      ],
```

`DiamondPlus` is the icon vat-statements and rebate-statements use for their own `.New` actions.

- [ ] **Step 8: Verify**

```bash
cd apps/web && pnpm run init && npm run type-check 2>&1 | grep "error TS"
npm run lint 2>&1 | tail -5
```
Expected: exactly the 2 baseline `TS2307` errors; 0 lint errors and no warning in a file you created or modified. Then confirm the action's `href` names a route that now exists:

```bash
ls "src/app/[lang]/(main)/(unirefund)/finance/franchise-hq-statements/draft/page.tsx"
```

- [ ] **Step 9: Commit**

```bash
git add "src/app/[lang]/(main)/(unirefund)/finance/franchise-hq-statements/draft" "src/app/[lang]/(main)/(unirefund)/finance/franchise-hq-statements/_components/table.tsx" src/components/sidebar-layout/data.ts
git diff --cached --name-only   # must list only your 6 new files plus those 2 modified ones
git commit -m "feat(franchise): add HQ statement draft preview and create flow"
```

---

### Task 5: E2E spec and acceptance

**Files:**
- Create: `apps/web/tests/unirefund/finance/franchise-hq-statements.spec.ts`

**Interfaces:**
- Consumes: the test ids Tasks 2–4 render.
- Produces: nothing.

- [ ] **Step 1: Write the E2E spec**

Read `apps/web/tests/unirefund/parties/franchise-hqs/create.franchise.hq.contract.spec.ts` (the sibling from the previous sub-project) and the `_support/` helpers first, then mirror that structure, login handling and naming.

Test ids available, all defined in Tasks 2–4:

| id | where |
|---|---|
| `franchise-hq-statement-totals` | totals strip container |
| `franchise-hq-statement-total-<CURRENCY>` | one per currency card |
| `franchise-hq-statement-totals-note` | the unfiltered-totals note |
| `franchise-hq-statement-header` | detail header |
| `franchise-hq-statement-status` | status Combobox (from its `id`; items are `franchise-hq-statement-status_0`, `_1`, …) |
| `franchise-hq-statement-status-submit` | status confirm trigger |
| `franchise-hq-statement-stores-empty` | store grid empty state |
| `franchise-hq-statement-draft-hq` | HQ Combobox (items `…_0`) |
| `franchise-hq-statement-draft-year` / `-month` | period inputs |
| `franchise-hq-statement-draft-preview` | Preview button |
| `franchise-hq-statement-draft-empty` | before any preview |
| `franchise-hq-statement-draft-create` | create trigger |
| `franchise-hq-statement-draft-nothing` | nothing-to-create note |

Two scenarios:

1. **Preview a month, then create.** Navigate to `/{lang}/finance/franchise-hq-statements/draft`, pick the first HQ, set year and month, choose Preview, assert draft rows appear and `franchise-hq-statement-draft-empty` is gone, then create and assert the URL moves to the list.
2. **A month with nothing to create keeps the create button disabled.** After a preview whose rows are all `No contract` or `Already created`, assert `franchise-hq-statement-draft-create` is disabled and `franchise-hq-statement-draft-nothing` is visible. This is the scenario that proves the `hasContract` / `statementAlreadyExists` gate actually reaches the DOM — the whole reason the spec insists both flags be surfaced.

**Data dependency:** scenario 1 needs an HQ with at least one country link **and** a commission contract covering the chosen month, or every draft row comes back `hasContract: false` and the create button stays disabled. Scenario 2 needs the opposite. Note both dependencies in a comment at the top of the spec so a failure there reads as data setup rather than a code defect.

If a date value is needed, use local getters or `toDateInputValue` — never `setHours` + `toISOString`, which yields yesterday at UTC+3.

- [ ] **Step 2: Confirm the spec compiles and is discovered**

The suite cannot run here: `playwright.config.ts` takes `baseURL` from `TEST_LOCAL_URL`/`TEST_DEV_URL`, both unset, and the flow needs an authenticated session.

Run: `npx playwright test --list tests/unirefund/finance 2>&1 | tail -20`
Expected: your two new titles listed.

**Do not claim the E2E test passed.** Record in your report that it was authored and listed but never executed.

- [ ] **Step 3: Full acceptance**

Run each and record the **actual** output:

```bash
cd apps/web && pnpm run init && npm run type-check 2>&1 | grep "error TS"     # expect exactly the 2 baseline TS2307
npm run lint 2>&1 | tail -5                                                   # expect 0 errors
npm run test:unit 2>&1 | tail -15                                             # report as-is; totals are a reading
```

From the **repo root**, not `apps/web`:
```bash
pnpm -w run i18n:missing        # expect NEEDS_KEY 0
pnpm run check-grid-keys        # expect all pass
```

- [ ] **Step 4: Verify the route surface and the nav entry**

```bash
cd apps/web
# every route file that exists under the feature
find "src/app/[lang]/(main)/(unirefund)/finance/franchise-hq-statements" -type f | sort
# the nav entry and its hostOnly flags
grep -n -A18 'key: "finance/franchise-hq-statements"' src/components/sidebar-layout/data.ts
grep -c "hostOnly: true" src/components/sidebar-layout/data.ts
```

Confirm: `layout.tsx` exists and calls `requireHost`; **no page beneath it calls `requireHost` or tests `!tenantId`**; the nav entry's `href` matches a route that exists and its action's `href` matches the draft route. Report the `hostOnly` count as a measurement, not against an expected constant.

Also confirm no `toISOString` appears in any file this sub-project created:
```bash
grep -rn "toISOString" "src/app/[lang]/(main)/(unirefund)/finance/franchise-hq-statements" || echo "clean"
```

- [ ] **Step 5: Commit**

```bash
git add tests/unirefund/finance/franchise-hq-statements.spec.ts
git diff --cached --name-only   # must list only that file
git commit -m "feat(franchise): add HQ statement E2E spec"
```

---

## Plan Self-Review

**Spec coverage.** Sub-project 3 asks for: routes `finance/franchise-hq-statements/`, `[id]/`, `draft/` (Tasks 2, 3, 4); a currency-totals row (Task 2, as a strip — the grid's `footer` callback is unreachable in the `schemaColumns` mode every finance page uses, and has zero call sites in the repo); the per-store drill-down (Task 3, shared component); the `form-draft`-to-create flow mirroring rebate's bulk (Task 4, mirroring its shape but not its dead selection code); status transitions via `PUT {id}/status` (Task 3); reuse of `getVariantByStatementStatus` with no franchise-specific helper (Tasks 2 and 3); and both `hasContract` and `statementAlreadyExists` surfaced (Task 4, with a dedicated E2E scenario in Task 5). Placement — statements under `finance/`, host-only — is Task 2's layout and nav entry.

**Three deliberate departures from the spec's letter, each with its reason:**

1. **No edit screen and no delete dialog.** The spec's implied verb list included `Edit` and `Delete`; `policies.json` has neither for this entity, and the SDK exposes no such endpoint. The only mutation is `SetStatus`.
2. **The detail page gates on `.View`, not `.ViewDetail`.** No `.ViewDetail` policy exists.
3. **The draft's year/month picker uses plain inputs, not `SchemaForm`.** The spec's "Pattern A" list assigned `SchemaForm` to this picker, but sub-project 1 already built the HQ forms with `react-hook-form` instead, and the closest real precedent for this exact screen (`rebate-statements/bulk/preview-form.tsx`) uses plain `Input`s beside a picker. Matching the working precedent beats matching a pattern label.

**Placeholder scan.** No step says "add validation" or "handle errors" without showing how. Two steps deliberately send the implementer to read a real file rather than quoting code: the two `loading.tsx` skeletons, whose shape is whatever the sibling route already uses. Everything else is quoted from verified ground truth, including `MasterDataGrid`'s `RowExpansionConfig` (checked against its type definition and a working call site) and `getFranchiseHqsApi`'s signature and list-DTO fields (`id?`, `name?: string | null`), both resolved before Task 4 was dispatched.

**Type consistency.** `StoreDetailRow` (Task 3) is the structural intersection of the two generated store-detail DTOs and is consumed by Task 4 through `StoreDetailsGrid`'s `rows` prop. `HqOption` and `DraftPeriod` are declared in Task 4's `client.tsx` and imported by its two siblings. `StatementStatus` is the generated rebate enum in both Task 3's dialog and its header. Every i18n key read in Tasks 2–4 is written in Task 1, and every key written in Task 1 is read in Tasks 2–4 — checked in both directions, which is the check that missed an orphan key in the previous sub-project.

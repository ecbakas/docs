# Franchise Tenant Contracts (Sub-project 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first *visible* franchise screens — a host-only list, create and edit for Track A franchise contracts (the fee UniRefund charges a franchise tenant) — plus the sidebar entry that makes franchise appear in the nav for the first time.

**Architecture:** Three server-component pages under a new top-level `contracts/` route group, guarded by one `requireHost()` layout. Each page fetches through the franchise server actions built in sub-project 0 and hands data to a client component. Create and edit are separate forms (matching the merchant-contract and rebate-table precedents), both driven by the Zod factories already sitting in this route's own `_components/` folder, and both rendering the existing `FeeBracketsTable`. The tenant column is joined client-side from the SaaS tenant list, because ContractService deliberately does not resolve tenant names.

**Tech Stack:** Next.js 15 App Router (server components), TypeScript, `react-hook-form` + Zod (`@repo/ayasofyazilim-ui/lib/zod`), `MasterDataGrid` and `Combobox` from `@repo/ayasofyazilim-ui`, Playwright for E2E.

**Spec:** `docs/superpowers/specs/2026-08-27-web-franchise-screens-design.md` — see "Placement", "Host-only gating", "Forms", "Data flow", and sub-project 4.

## Global Constraints

- Working directory for every command is `C:\unirefund\web-app\apps\web` unless a step says otherwise. Repo root is `C:\unirefund\web-app`.
- Branch is `franchise-contract-update`. Commit to it directly. Do **not** create a branch, and do **not** push — note that other actors have pushed to this branch during previous runs, so never claim work is unpushed without re-checking `git reflog show origin/franchise-contract-update | head`.
- **Type-check baseline is exactly 2 errors**, both `TS2307` for `@ayasofyazilim-clomerce/capture-core/detectors/mrz` (a private dependency absent locally). `tsc` exits non-zero because of them. Treat 2 as green; a third is a regression you introduced.
- **Unit-test baseline is 62 tests / 12 suites, all passing.** This sub-project adds **no unit tests** — see "On testing" below. The count must still read 62 / 12 at the end.
- Run `pnpm run init` before `type-check` in any task that adds an i18n key, or tsc will not see the key.
- Prettier is not a gate; `format:check` fails repo-wide on line endings. The repo's husky `pre-commit` hook may reformat staged files, which is expected.
- Lint has ~465 pre-existing repo-wide warnings and **0 errors**. Only errors, and only warnings in files you touched, are yours.
- **Stage explicit paths.** Do not run `git add -A` or `git add <directory>` — this checkout is shared and a foreign file can be swept into your commit. Use `git add <path> <path>`.
- **The `_components/` folder already exists and is not yours to change.** `contracts/franchise/_components/` contains `fee-brackets.ts`, `schemas.ts`, `fee-brackets-table.tsx` and their tests, all reviewed and green. Add new files beside them; do not edit those five.
- Backend invariant, quoted from the generated types: *"The tenant's display name is not resolved here — ContractService has no SaaS integration, and the caller already knows the tenant list."* Every screen showing a tenant must join the name itself.
- Backend invariant: `FranchiseContractUpdateDto` has no `franchiseTenantId`. A contract's tenant is immutable after creation, so the edit form must not offer it. `updateFormSchema` already omits it — do not add it back.
- An **empty tier set is legal** for Track A and means the contract bills at its flat `fixedFeeValue` / `percentFeeValue`. The UI must present that as a deliberate state, not an unfinished one. `FeeBracketsTable` handles this via `allowEmpty`.

### On testing

`apps/web` has no component-test infrastructure — no jsdom, no React Testing Library. The only unit runner is `node --test` over `src/**/*.test.ts`, which cannot render a component. The genuinely unit-testable logic in this feature (bracket contiguity, the Zod schemas, the tenant-name map) was already built and tested in sub-project 0, at 62 tests.

So the gates for this sub-project are **`type-check` and `lint`**, plus a Playwright spec authored in Task 5. Do not invent unit tests that only assert a mock, and do not add a test runner — that is a separate decision, not this plan's to make.

**The Playwright spec cannot be run in this environment.** `playwright.config.ts` reads `baseURL` from `TEST_LOCAL_URL` / `TEST_DEV_URL`, which are unset, and the suite needs an authenticated session. Task 5 authors the spec as a deliverable for the human to run; it does not claim to have run it. Say so plainly in that task's report.

## Existing interfaces this plan consumes

All of these were built and reviewed in sub-project 0. Signatures are exact — do not re-derive them.

**Server actions** (`@repo/actions/unirefund/ContractService/...`):
```ts
// action.ts — GET: takes a session, THROWS structuredError on failure
getFranchiseContractsApi(data: GetApiContractServiceFranchiseContractsData, session?: Session | null)
getFranchiseContractByIdApi(data: GetApiContractServiceFranchiseContractsByIdData, session?: Session | null)
// post-actions.ts / put-actions.ts / delete-actions.ts — RETURN structuredError on failure, no session
postFranchiseContractApi(data: PostApiContractServiceFranchiseContractsData)
putFranchiseContractByIdApi(data: PutApiContractServiceFranchiseContractsByIdData)
deleteFranchiseContractByIdApi(id: string)
```

**Query parameters** on `GetApiContractServiceFranchiseContractsData`: `franchiseTenantId?`, `maxResultCount?`, `skipCount?`, `sorting?`, `validOn?`.

**Foundation helpers:**
```ts
// apps/web/src/utils/require-host.ts
requireHost(lang: string): Promise<void>          // redirects to /{lang}/unauthorized when a tenant is selected
// apps/web/src/utils/resolve-tenant-names.ts
resolveTenantNames(): Promise<Map<string, string>>  // id -> display name; empty map on failure, never throws
```

**Form schemas** (`./_components/schemas`):
```ts
createFranchiseContractFormSchemas({ languageData }): { createFormSchema, updateFormSchema }
```
- `createFormSchema` fields: `franchiseTenantId` (guid), `name`, `validFrom`, `validTo`, `currency` (3 chars), `calculationPeriod` (`"Monthly" | "Quarterly" | "Yearly"`), `feeBase` (`"VatAmount" | "SalesAmount" | "GrossRefundAmount"`), `fixedFeeValue`, `percentFeeValue`, `tiers`
- `updateFormSchema`: the same **minus `franchiseTenantId`**, and its `tiers` rows carry an optional `id`

**Bracket editor** (`./_components/fee-brackets-table`):
```ts
FeeBracketsTable({ name, languageData, isPending, allowEmpty }: {
  name: "tiers" | "brackets";
  languageData: ContractServiceResource;
  isPending: boolean;
  allowEmpty: boolean;   // REQUIRED — pass true for Track A
})
```

**Policies** (all exist in `packages/utils/policies/policies.json`): `ContractService.FranchiseContract`, `.ViewList`, `.ViewDetail`, `.Create`, `.Edit`, `.Delete`.

## File structure

```
apps/web/src/app/[lang]/(main)/(unirefund)/contracts/
  layout.tsx                                  NEW  requireHost guard for the whole group
  franchise/
    _components/                              EXISTS — do not edit
      fee-brackets.ts  schemas.ts  fee-brackets-table.tsx  (+ tests)
      table.tsx                               NEW  list grid (client)
    page.tsx                                  NEW  list (server)
    loading.tsx                               NEW
    new/
      page.tsx                                NEW  create (server)
      loading.tsx                             NEW
      _components/form.tsx                    NEW  create form (client)
    [contractId]/
      page.tsx                                NEW  edit (server)
      loading.tsx                             NEW
      _components/form.tsx                    NEW  edit form (client)
      _components/delete-contract.tsx         NEW  delete dialog (client)
```

Modified: `components/sidebar-layout/data.ts`, `language-data/core/AbpUiNavigation/resources/{en,tr}.json`, `language-data/unirefund/ContractService/resources/{en,tr}.json`.
New test: `apps/web/tests/unirefund/contracts/franchise/create.franchise.contract.spec.ts`.

**Task order deliberately puts the nav entry last (Task 5).** A nav entry pointing at a route that does not exist yet is a 404 in the sidebar, so it lands only once the pages behind it work.

---

### Task 1: i18n keys

No user-visible change. Every later task reads these keys, and tsc cannot see a key until `pnpm run init` runs.

**Files:**
- Modify: `apps/web/src/language-data/unirefund/ContractService/resources/en.json`
- Modify: `apps/web/src/language-data/unirefund/ContractService/resources/tr.json`
- Modify: `apps/web/src/language-data/core/AbpUiNavigation/resources/en.json`
- Modify: `apps/web/src/language-data/core/AbpUiNavigation/resources/tr.json`

**Interfaces:**
- Consumes: nothing.
- Produces: the key strings every later task reads via `languageData["..."]`.

The resource type is `typeof en`, so a key must exist in `en.json` to be typed at all, and a key only in `tr.json` is invisible to TypeScript. Keep both key sets identical.

- [ ] **Step 1: Add the ContractService English keys**

Append to `apps/web/src/language-data/unirefund/ContractService/resources/en.json`, matching the existing flat dotted style:

```json
{
  "FranchiseContracts.New": "New franchise contract",
  "FranchiseContracts.Form.franchiseTenantId": "Franchise tenant",
  "FranchiseContracts.Form.name": "Contract name",
  "FranchiseContracts.Form.validFrom": "Valid from",
  "FranchiseContracts.Form.validTo": "Valid to",
  "FranchiseContracts.Form.currency": "Currency",
  "FranchiseContracts.Form.calculationPeriod": "Calculation period",
  "FranchiseContracts.Form.feeBase": "Fee base",
  "FranchiseContracts.Form.fixedFeeValue": "Fallback fixed fee",
  "FranchiseContracts.Form.percentFeeValue": "Fallback percent fee (%)",
  "FranchiseContracts.Form.fallbackHint": "Applied when no bracket matches.",
  "FranchiseContracts.Form.tenantLocked": "The franchise tenant cannot be changed after the contract is created.",
  "FranchiseContracts.column.tierCount": "Brackets",
  "FranchiseContracts.CalculationPeriod.Monthly": "Monthly",
  "FranchiseContracts.CalculationPeriod.Quarterly": "Quarterly",
  "FranchiseContracts.CalculationPeriod.Yearly": "Yearly",
  "FranchiseContracts.FeeBase.VatAmount": "VAT amount",
  "FranchiseContracts.FeeBase.SalesAmount": "Sales amount",
  "FranchiseContracts.FeeBase.GrossRefundAmount": "Gross refund amount",
  "FranchiseContracts.Delete.Title": "Delete this franchise contract?",
  "FranchiseContracts.Delete.Description": "This removes the contract and its brackets. Earnings already calculated from it are not affected."
}
```

- [ ] **Step 2: Add the matching Turkish keys**

Append the same key set to `apps/web/src/language-data/unirefund/ContractService/resources/tr.json`:

```json
{
  "FranchiseContracts.New": "Yeni franchise sözleşmesi",
  "FranchiseContracts.Form.franchiseTenantId": "Franchise kiracısı",
  "FranchiseContracts.Form.name": "Sözleşme adı",
  "FranchiseContracts.Form.validFrom": "Başlangıç tarihi",
  "FranchiseContracts.Form.validTo": "Bitiş tarihi",
  "FranchiseContracts.Form.currency": "Para birimi",
  "FranchiseContracts.Form.calculationPeriod": "Hesaplama dönemi",
  "FranchiseContracts.Form.feeBase": "Ücret matrahı",
  "FranchiseContracts.Form.fixedFeeValue": "Varsayılan sabit ücret",
  "FranchiseContracts.Form.percentFeeValue": "Varsayılan yüzde ücret (%)",
  "FranchiseContracts.Form.fallbackHint": "Hiçbir dilim eşleşmediğinde uygulanır.",
  "FranchiseContracts.Form.tenantLocked": "Sözleşme oluşturulduktan sonra franchise kiracısı değiştirilemez.",
  "FranchiseContracts.column.tierCount": "Dilimler",
  "FranchiseContracts.CalculationPeriod.Monthly": "Aylık",
  "FranchiseContracts.CalculationPeriod.Quarterly": "Üç aylık",
  "FranchiseContracts.CalculationPeriod.Yearly": "Yıllık",
  "FranchiseContracts.FeeBase.VatAmount": "KDV tutarı",
  "FranchiseContracts.FeeBase.SalesAmount": "Satış tutarı",
  "FranchiseContracts.FeeBase.GrossRefundAmount": "Brüt iade tutarı",
  "FranchiseContracts.Delete.Title": "Bu franchise sözleşmesi silinsin mi?",
  "FranchiseContracts.Delete.Description": "Sözleşme ve dilimleri kaldırılır. Daha önce hesaplanmış kazançlar etkilenmez."
}
```

- [ ] **Step 3: Add the navigation keys**

`Contracts` already exists in the AbpUiNavigation resource — do not re-add it. Add only the leaf entry.

To `apps/web/src/language-data/core/AbpUiNavigation/resources/en.json`:

```json
{
  "FranchiseContracts": "Franchise contracts",
  "FranchiseContracts.New": "New franchise contract"
}
```

To `apps/web/src/language-data/core/AbpUiNavigation/resources/tr.json`:

```json
{
  "FranchiseContracts": "Franchise sözleşmeleri",
  "FranchiseContracts.New": "Yeni franchise sözleşmesi"
}
```

- [ ] **Step 4: Regenerate and verify tsc sees the keys**

Run: `pnpm run init`
Then: `npm run type-check`
Expected: exactly 2 baseline errors.

- [ ] **Step 5: Verify en/tr key parity**

Run from `apps/web`:

```bash
node -e "const a=require('./src/language-data/unirefund/ContractService/resources/en.json'),b=require('./src/language-data/unirefund/ContractService/resources/tr.json');const ka=Object.keys(a),kb=Object.keys(b);console.log('en',ka.length,'tr',kb.length);console.log('only en:',ka.filter(k=>!kb.includes(k)));console.log('only tr:',kb.filter(k=>!ka.includes(k)))"
```

Expected: equal counts, and both "only" lists empty. Repeat the same check for the two AbpUiNavigation files. Put both outputs in your report.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/language-data/unirefund/ContractService/resources/en.json apps/web/src/language-data/unirefund/ContractService/resources/tr.json apps/web/src/language-data/core/AbpUiNavigation/resources/en.json apps/web/src/language-data/core/AbpUiNavigation/resources/tr.json
git commit -m "feat(franchise): add i18n keys for tenant contract screens"
```

---

### Task 2: Host-only layout and the contract list

The first working route. After this task, `/en/contracts/franchise` renders for a host session and redirects a tenant session — but nothing links to it yet.

**Files:**
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/contracts/layout.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/contracts/franchise/page.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/contracts/franchise/loading.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/contracts/franchise/_components/table.tsx`

**Interfaces:**
- Consumes: `requireHost` from `@/utils/require-host`; `resolveTenantNames` from `@/utils/resolve-tenant-names`; `getFranchiseContractsApi`.
- Produces: `FranchiseContractsTable({ contractsData, tenantNames, languageData })` — consumed by nothing else, but its `tenantNames` prop shape (`Record<string, string>`) is what Task 3 and 4 pages do **not** need, so do not generalise it.

Note the prop is a plain `Record<string, string>`, not a `Map`. A `Map` cannot cross the server/client boundary as a serialised prop — convert with `Object.fromEntries` in the page.

- [ ] **Step 1: Create the host-only layout**

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

This guards every route under `contracts/`, which is the whole point of the group. Sub-project 5's earnings tab inherits it for free.

- [ ] **Step 2: Create the loading skeleton**

Match the sibling convention — read `apps/web/src/app/[lang]/(main)/(unirefund)/finance/rebate-statements/loading.tsx` first and mirror it. If it exports a shared skeleton component, use the same one rather than inventing markup.

- [ ] **Step 3: Create the list page**

Follow `parties/merchants/page.tsx`, which is the canonical paged-list server page in this repo.

```tsx
"use server";

import { getFranchiseContractsApi } from "@repo/actions/unirefund/ContractService/action";
import type { GetApiContractServiceFranchiseContractsData } from "@repo/saas/ContractService";
import ErrorComponent from "@repo/ui/components/error-component";
import { structuredError } from "@repo/utils/api";
import type { Session } from "@repo/utils/auth";
import { auth } from "@repo/utils/auth/next-auth";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { getResourceData } from "@/language-data/unirefund/ContractService";
import { resolveTenantNames } from "@/utils/resolve-tenant-names";
import { FranchiseContractsTable } from "./_components/table";

interface SearchParamType {
  maxResultCount?: number;
  skipCount?: number;
  sorting?: string;
}

async function getApiRequests(
  filters: GetApiContractServiceFranchiseContractsData,
  session: Session | null
) {
  try {
    const requiredRequests = await Promise.all([
      getFranchiseContractsApi(filters, session),
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
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams?: Promise<SearchParamType>;
}) {
  const { lang } = await params;
  const searchs = await searchParams;
  const { languageData } = await getResourceData(lang);
  const session = await auth();

  const apiRequests = await getApiRequests(
    {
      maxResultCount: searchs?.maxResultCount || 10,
      skipCount: searchs?.skipCount || 0,
      sorting: searchs?.sorting,
    },
    session
  );

  if ("message" in apiRequests) {
    return (
      <ErrorComponent
        languageData={languageData}
        message={apiRequests.message}
      />
    );
  }

  const [contractsResponse] = apiRequests.requiredRequests;
  // ContractService does not resolve tenant display names, so join them here.
  const tenantNames = await resolveTenantNames();

  return (
    <FranchiseContractsTable
      contractsData={contractsResponse.data}
      languageData={languageData}
      tenantNames={Object.fromEntries(tenantNames)}
    />
  );
}
```

- [ ] **Step 4: Create the list table**

Follow `parties/merchants/[partyId]/contracts/_components/table.tsx` for the `MasterDataGrid` shape.

```tsx
"use client";

import { useTenant } from "@/providers/tenant";
import { getBaseLink } from "@/utils";
import {
  MasterDataGrid,
  RowLink,
} from "@repo/ayasofyazilim-ui/custom/master-data-grid";
import {
  $UniRefund_ContractService_Franchises_FranchiseContracts_FranchiseContractListDto as $FranchiseContractListDto,
  type PagedResultDto_FranchiseContractListDto,
} from "@repo/saas/ContractService";
import { isActionGranted, useGrantedPolicies } from "@repo/utils/policies";
import { PlusCircle } from "lucide-react";
import { useParams } from "next/navigation";
import type { ContractServiceResource } from "@/language-data/unirefund/ContractService";

export function FranchiseContractsTable({
  contractsData,
  languageData,
  tenantNames,
}: {
  contractsData: PagedResultDto_FranchiseContractListDto;
  languageData: ContractServiceResource;
  tenantNames: Record<string, string>;
}) {
  const { lang } = useParams<{ lang: string }>();
  const { localization } = useTenant();
  const { grantedPolicies } = useGrantedPolicies();

  return (
    <MasterDataGrid
      data={contractsData.items || []}
      config={{
        localization,
        schema: $FranchiseContractListDto,
        schemaColumns: {
          mode: "include",
          columns: [
            "name",
            "franchiseTenantId",
            "validFrom",
            "validTo",
            "currency",
            "calculationPeriod",
            "feeBase",
            "tierCount",
          ],
        },
        t: {
          ...languageData,
          "column.franchiseTenantId":
            languageData["FranchiseContracts.Form.franchiseTenantId"],
          "column.name": languageData["FranchiseContracts.Form.name"],
          "column.validFrom": languageData["FranchiseContracts.Form.validFrom"],
          "column.validTo": languageData["FranchiseContracts.Form.validTo"],
          "column.currency": languageData["FranchiseContracts.Form.currency"],
          "column.calculationPeriod":
            languageData["FranchiseContracts.Form.calculationPeriod"],
          "column.feeBase": languageData["FranchiseContracts.Form.feeBase"],
          "column.tierCount":
            languageData["FranchiseContracts.column.tierCount"],
        },
        rowCount: contractsData.totalCount,
        customRenderers: {
          name: ({ row }) => (
            <RowLink
              href={`/${lang}/contracts/franchise/${row.original.id}`}
              label={row.original.name}
            />
          ),
          // The id is all ContractService returns; the name comes from SaaS.
          franchiseTenantId: ({ row }) =>
            tenantNames[row.original.franchiseTenantId] ??
            row.original.franchiseTenantId,
        },
        tableActions: [
          {
            id: "create",
            type: "link",
            icon: PlusCircle,
            label: languageData["FranchiseContracts.New"],
            href: getBaseLink("/contracts/franchise/new"),
            hidden: () =>
              !isActionGranted(
                ["ContractService.FranchiseContract.Create"],
                grantedPolicies
              ),
          },
        ],
      }}
    />
  );
}
```

- [ ] **Step 5: Verify types and lint**

Run: `npm run type-check`
Expected: exactly 2 baseline errors.

Run: `npm run lint`
Expected: 0 errors, no new warnings in your files.

If `MasterDataGrid`'s `customRenderers` signature does not accept `({ row })` for these column ids, read the existing `parties/merchants/[partyId]/contracts/_components/table.tsx` and match its exact shape rather than guessing.

- [ ] **Step 6: Confirm the unit suite is untouched**

Run: `npm run test:unit`
Expected: 62 tests / 12 suites / 0 fail.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/src/app/[lang]/(main)/(unirefund)/contracts/layout.tsx" "apps/web/src/app/[lang]/(main)/(unirefund)/contracts/franchise/page.tsx" "apps/web/src/app/[lang]/(main)/(unirefund)/contracts/franchise/loading.tsx" "apps/web/src/app/[lang]/(main)/(unirefund)/contracts/franchise/_components/table.tsx"
git commit -m "feat(franchise): add host-only contracts layout and tenant contract list"
```

---

### Task 3: Create form

**Files:**
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/contracts/franchise/new/page.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/contracts/franchise/new/loading.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/contracts/franchise/new/_components/form.tsx`

**Interfaces:**
- Consumes: `createFranchiseContractFormSchemas` and `FeeBracketsTable` from `../../_components/`; `postFranchiseContractApi`; `getPublicTenantsApi` from `@repo/actions/core/SaasService/actions`.
- Produces: nothing consumed elsewhere.

The tenant picker needs the full `{id, name}` list, not the name map — the map exists for rendering, the list for selecting. Fetch it in the page with `getPublicTenantsApi()` and pass `data.items ?? []` down.

- [ ] **Step 1: Create the page**

```tsx
"use server";

import { getPublicTenantsApi } from "@repo/actions/core/SaasService/actions";
import ErrorComponent from "@repo/ui/components/error-component";
import { structuredError } from "@repo/utils/api";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { getResourceData } from "@/language-data/unirefund/ContractService";
import FranchiseContractCreateForm from "./_components/form";

async function getApiRequests() {
  try {
    const requiredRequests = await Promise.all([getPublicTenantsApi()]);
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
  const apiRequests = await getApiRequests();

  if ("message" in apiRequests) {
    return (
      <ErrorComponent
        languageData={languageData}
        message={apiRequests.message}
      />
    );
  }

  const [tenantsResponse] = apiRequests.requiredRequests;
  const tenants =
    tenantsResponse.type === "success"
      ? tenantsResponse.data.items ?? []
      : [];

  return (
    <FranchiseContractCreateForm languageData={languageData} tenants={tenants} />
  );
}
```

Note `getPublicTenantsApi` *returns* its error rather than throwing (it uses `structuredResponse`), which is why the `type === "success"` check is here and not only in the catch. The same idiom appears at `apps/web/src/app/[lang]/(auth)/login/page.tsx:17`.

- [ ] **Step 2: Create the loading skeleton**

Mirror `apps/web/src/app/[lang]/(main)/(unirefund)/parties/merchants/[partyId]/contracts/new/loading.tsx`.

- [ ] **Step 3: Create the form**

Pattern B — `react-hook-form` + the existing Zod factory + `FeeBracketsTable`. Follow `settings/templates/rebate-tables/new/_components/form.tsx` for the `Form`/`FormField`/`Combobox` idiom and `handlePostResponse` usage.

```tsx
"use client";
"use no memo";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useForm,
} from "@repo/ayasofyazilim-ui/components/form";
import { Input } from "@repo/ayasofyazilim-ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ayasofyazilim-ui/components/select";
import { Combobox } from "@repo/ayasofyazilim-ui/custom/combobox";
import { z, zodResolver } from "@repo/ayasofyazilim-ui/lib/zod";
import { postFranchiseContractApi } from "@repo/actions/unirefund/ContractService/post-actions";
import type { UniRefund_SaasService_Tenants_TenantPublicDto as TenantPublicDto } from "@repo/core-saas/SaasService";
import { handlePostResponse } from "@repo/utils/api";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { getBaseLink } from "@/utils";
import type { ContractServiceResource } from "@/language-data/unirefund/ContractService";
import { FeeBracketsTable } from "../../_components/fee-brackets-table";
import { createFranchiseContractFormSchemas } from "../../_components/schemas";

const CALCULATION_PERIODS = ["Monthly", "Quarterly", "Yearly"] as const;
const FEE_BASES = ["VatAmount", "SalesAmount", "GrossRefundAmount"] as const;

export default function FranchiseContractCreateForm({
  languageData,
  tenants,
}: {
  languageData: ContractServiceResource;
  tenants: TenantPublicDto[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { createFormSchema } = createFranchiseContractFormSchemas({
    languageData,
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const form = useForm({
    resolver: zodResolver(createFormSchema),
    defaultValues: {
      franchiseTenantId: "",
      name: "",
      validFrom: today.toISOString().slice(0, 10),
      validTo: today.toISOString().slice(0, 10),
      currency: "TRY",
      calculationPeriod: "Monthly",
      feeBase: "VatAmount",
      fixedFeeValue: 0,
      percentFeeValue: 0,
      // Empty is legal for Track A and means flat-rate billing.
      tiers: [],
    },
  });

  function onSubmit(values: z.infer<typeof createFormSchema>) {
    startTransition(() => {
      void postFranchiseContractApi({ requestBody: values }).then((response) => {
        handlePostResponse(response, router, {
          prefix: getBaseLink("/contracts/franchise"),
          identifier: "id",
        });
      });
    });
  }

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4 overflow-auto p-px"
        data-testid="franchise-contract-create-form"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <FormField
            control={form.control}
            name="franchiseTenantId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {languageData["FranchiseContracts.Form.franchiseTenantId"]}
                </FormLabel>
                <FormControl>
                  <Combobox<TenantPublicDto>
                    data-testid="franchise-tenant-combobox"
                    id="franchise-tenant-combobox"
                    disabled={isPending}
                    emptyValue={languageData["Select.EmptyValue"]}
                    list={tenants}
                    onValueChange={(value) => {
                      field.onChange(value?.id || "");
                    }}
                    searchPlaceholder={languageData["Select.Placeholder"]}
                    searchResultLabel={languageData["Select.ResultLabel"]}
                    selectIdentifier="id"
                    selectLabel="name"
                    value={tenants.find((t) => t.id === field.value)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {languageData["FranchiseContracts.Form.name"]}
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    data-testid="franchise-contract-name"
                    disabled={isPending}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="calculationPeriod"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {languageData["FranchiseContracts.Form.calculationPeriod"]}
                </FormLabel>
                <Select
                  disabled={isPending}
                  onValueChange={field.onChange}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger data-testid="franchise-calculation-period">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {CALCULATION_PERIODS.map((period) => (
                      <SelectItem key={period} value={period}>
                        {
                          languageData[
                            `FranchiseContracts.CalculationPeriod.${period}`
                          ]
                        }
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="feeBase"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {languageData["FranchiseContracts.Form.feeBase"]}
                </FormLabel>
                <Select
                  disabled={isPending}
                  onValueChange={field.onChange}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger data-testid="franchise-fee-base">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {FEE_BASES.map((base) => (
                      <SelectItem key={base} value={base}>
                        {languageData[`FranchiseContracts.FeeBase.${base}`]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {languageData["FranchiseContracts.Form.currency"]}
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    data-testid="franchise-contract-currency"
                    disabled={isPending}
                    maxLength={3}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="fixedFeeValue"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {languageData["FranchiseContracts.Form.fixedFeeValue"]}
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    data-testid="franchise-fixed-fee"
                    disabled={isPending}
                    type="number"
                  />
                </FormControl>
                <FormDescription>
                  {languageData["FranchiseContracts.Form.fallbackHint"]}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="percentFeeValue"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {languageData["FranchiseContracts.Form.percentFeeValue"]}
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    data-testid="franchise-percent-fee"
                    disabled={isPending}
                    type="number"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FeeBracketsTable
          allowEmpty
          isPending={isPending}
          languageData={languageData}
          name="tiers"
        />

        <Button
          className="max-w-xl"
          data-testid="franchise-contract-submit"
          disabled={isPending}
          type="submit"
        >
          {languageData.Save}
        </Button>
      </form>
    </Form>
  );
}
```

Two details to check while writing this, and report what you found:
- `validFrom` / `validTo` are plain `z.string()` in the schema. If the repo has a date-picker widget used by comparable Pattern B forms, use it; otherwise `<Input type="date">` with an ISO round-trip is acceptable. Do **not** change the schema to accommodate a widget.
- Confirm `languageData["Select.EmptyValue"]`, `["Select.Placeholder"]` and `["Select.ResultLabel"]` exist in the merged resource (they are used by `rebate-tables/new/_components/form.tsx`, so they should). If any is missing, use the key that file actually uses.

- [ ] **Step 4: Verify types and lint**

Run: `npm run type-check`
Expected: exactly 2 baseline errors.

Run: `npm run lint`
Expected: 0 errors, no new warnings in your files.

The template-literal key lookups (`` languageData[`FranchiseContracts.FeeBase.${base}`] ``) must type-check against the resource type. If they do not, replace them with an explicit `Record` map from enum value to the literal key string — do not cast to `any`.

- [ ] **Step 5: Confirm the unit suite is untouched**

Run: `npm run test:unit`
Expected: 62 / 12 / 0 fail.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/[lang]/(main)/(unirefund)/contracts/franchise/new"
git commit -m "feat(franchise): add tenant contract create form"
```

---

### Task 4: Edit form and delete

**Files:**
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/contracts/franchise/[contractId]/page.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/contracts/franchise/[contractId]/loading.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/contracts/franchise/[contractId]/_components/form.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/contracts/franchise/[contractId]/_components/delete-contract.tsx`

**Interfaces:**
- Consumes: `getFranchiseContractByIdApi`, `putFranchiseContractByIdApi`, `deleteFranchiseContractByIdApi`; `createFranchiseContractFormSchemas().updateFormSchema`; `FeeBracketsTable`.
- Produces: nothing consumed elsewhere.

**The tenant is immutable.** `updateFormSchema` has no `franchiseTenantId`, matching `FranchiseContractUpdateDto`. Show the tenant as read-only text with the `FranchiseContracts.Form.tenantLocked` hint — do not render a picker, and do not add the field to the schema.

- [ ] **Step 1: Create the page**

```tsx
"use server";

import { getFranchiseContractByIdApi } from "@repo/actions/unirefund/ContractService/action";
import ErrorComponent from "@repo/ui/components/error-component";
import { structuredError } from "@repo/utils/api";
import { auth } from "@repo/utils/auth/next-auth";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { getResourceData } from "@/language-data/unirefund/ContractService";
import { resolveTenantNames } from "@/utils/resolve-tenant-names";
import FranchiseContractUpdateForm from "./_components/form";

async function getApiRequests(contractId: string) {
  try {
    const session = await auth();
    const requiredRequests = await Promise.all([
      getFranchiseContractByIdApi({ id: contractId }, session),
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
  params: Promise<{ lang: string; contractId: string }>;
}) {
  const { lang, contractId } = await params;
  const { languageData } = await getResourceData(lang);
  const apiRequests = await getApiRequests(contractId);

  if ("message" in apiRequests) {
    return (
      <ErrorComponent
        languageData={languageData}
        message={apiRequests.message}
      />
    );
  }

  const [contractResponse] = apiRequests.requiredRequests;
  const contract = contractResponse.data;
  const tenantNames = await resolveTenantNames();

  return (
    <FranchiseContractUpdateForm
      contract={contract}
      languageData={languageData}
      tenantName={
        tenantNames.get(contract.franchiseTenantId) ??
        contract.franchiseTenantId
      }
    />
  );
}
```

- [ ] **Step 2: Create the loading skeleton**

Mirror the sibling `new/loading.tsx` you created in Task 3.

- [ ] **Step 3: Create the edit form**

Same shape as Task 3's create form, with four differences: it uses `updateFormSchema`; it has no tenant `Combobox`; it seeds `defaultValues` from the fetched contract including its existing `tiers` (which carry `id`); and it calls `putFranchiseContractByIdApi`. Include the delete dialog in its footer.

```tsx
"use client";
"use no memo";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useForm,
} from "@repo/ayasofyazilim-ui/components/form";
import { Input } from "@repo/ayasofyazilim-ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ayasofyazilim-ui/components/select";
import { z, zodResolver } from "@repo/ayasofyazilim-ui/lib/zod";
import { putFranchiseContractByIdApi } from "@repo/actions/unirefund/ContractService/put-actions";
import type { UniRefund_ContractService_Franchises_FranchiseContracts_FranchiseContractDto as FranchiseContractDto } from "@repo/saas/ContractService";
import { handlePutResponse } from "@repo/utils/api";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { getBaseLink } from "@/utils";
import type { ContractServiceResource } from "@/language-data/unirefund/ContractService";
import { FeeBracketsTable } from "../../_components/fee-brackets-table";
import { createFranchiseContractFormSchemas } from "../../_components/schemas";
import DeleteFranchiseContractDialog from "./delete-contract";

const CALCULATION_PERIODS = ["Monthly", "Quarterly", "Yearly"] as const;
const FEE_BASES = ["VatAmount", "SalesAmount", "GrossRefundAmount"] as const;

export default function FranchiseContractUpdateForm({
  contract,
  languageData,
  tenantName,
}: {
  contract: FranchiseContractDto;
  languageData: ContractServiceResource;
  tenantName: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { updateFormSchema } = createFranchiseContractFormSchemas({
    languageData,
  });

  const form = useForm({
    resolver: zodResolver(updateFormSchema),
    defaultValues: {
      name: contract.name,
      validFrom: contract.validFrom.slice(0, 10),
      validTo: contract.validTo.slice(0, 10),
      currency: contract.currency,
      calculationPeriod: contract.calculationPeriod,
      feeBase: contract.feeBase,
      fixedFeeValue: contract.fixedFeeValue,
      percentFeeValue: contract.percentFeeValue,
      tiers: contract.tiers.map((tier) => ({
        id: tier.id,
        minAmount: tier.minAmount,
        maxAmount: tier.maxAmount,
        fixedFeeValue: tier.fixedFeeValue,
        percentFeeValue: tier.percentFeeValue,
      })),
    },
  });

  function onSubmit(values: z.infer<typeof updateFormSchema>) {
    startTransition(() => {
      void putFranchiseContractByIdApi({
        id: contract.id ?? "",
        requestBody: values,
      }).then((response) => {
        handlePutResponse(response, router);
      });
    });
  }

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4 overflow-auto p-px"
        data-testid="franchise-contract-update-form"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <FormItem>
            <FormLabel>
              {languageData["FranchiseContracts.Form.franchiseTenantId"]}
            </FormLabel>
            {/* Immutable: a different tenant is a different contract. */}
            <Input
              data-testid="franchise-tenant-readonly"
              disabled
              readOnly
              value={tenantName}
            />
            <FormDescription>
              {languageData["FranchiseContracts.Form.tenantLocked"]}
            </FormDescription>
          </FormItem>

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {languageData["FranchiseContracts.Form.name"]}
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    data-testid="franchise-contract-name"
                    disabled={isPending}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="calculationPeriod"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {languageData["FranchiseContracts.Form.calculationPeriod"]}
                </FormLabel>
                <Select
                  disabled={isPending}
                  onValueChange={field.onChange}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger data-testid="franchise-calculation-period">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {CALCULATION_PERIODS.map((period) => (
                      <SelectItem key={period} value={period}>
                        {
                          languageData[
                            `FranchiseContracts.CalculationPeriod.${period}`
                          ]
                        }
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="feeBase"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {languageData["FranchiseContracts.Form.feeBase"]}
                </FormLabel>
                <Select
                  disabled={isPending}
                  onValueChange={field.onChange}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger data-testid="franchise-fee-base">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {FEE_BASES.map((base) => (
                      <SelectItem key={base} value={base}>
                        {languageData[`FranchiseContracts.FeeBase.${base}`]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {languageData["FranchiseContracts.Form.currency"]}
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    data-testid="franchise-contract-currency"
                    disabled={isPending}
                    maxLength={3}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="fixedFeeValue"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {languageData["FranchiseContracts.Form.fixedFeeValue"]}
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    data-testid="franchise-fixed-fee"
                    disabled={isPending}
                    type="number"
                  />
                </FormControl>
                <FormDescription>
                  {languageData["FranchiseContracts.Form.fallbackHint"]}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="percentFeeValue"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {languageData["FranchiseContracts.Form.percentFeeValue"]}
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    data-testid="franchise-percent-fee"
                    disabled={isPending}
                    type="number"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FeeBracketsTable
          allowEmpty
          isPending={isPending}
          languageData={languageData}
          name="tiers"
        />

        <div className="flex items-center gap-2">
          <Button
            data-testid="franchise-contract-submit"
            disabled={isPending}
            type="submit"
          >
            {languageData.Save}
          </Button>
          <DeleteFranchiseContractDialog
            contractId={contract.id ?? ""}
            isPending={isPending}
            languageData={languageData}
            startTransition={startTransition}
          />
        </div>
      </form>
    </Form>
  );
}
```

**`validFrom`/`validTo` must match Task 3 exactly**, which settled the treatment during execution: a rendered `<Input type="date">` per field (test ids `franchise-valid-from` / `franchise-valid-to`), `value={field.value.slice(0, 10)}` because the native input wants `YYYY-MM-DD`, and `onChange` writing back `event.target.value` unchanged. That is why the `defaultValues` above slice `contract.validFrom` / `contract.validTo` — the backend returns a full ISO datetime, and seeding it unsliced would make the POSTed shape depend on whether the user touched the field.

No repo date-picker is wired to a react-hook-form form (every existing `DatePicker` takes an `(date: Date) => void` callback rather than a `FormField` render prop), so do not reach for one.

Do **not** add a `.datetime()` or `.date()` refinement to the schema — it is committed and shared with the create form.

- [ ] **Step 4: Create the delete dialog**

Follow `parties/merchants/[partyId]/contracts/[contractId]/_components/delete-contract.tsx`.

```tsx
"use client";
import { deleteFranchiseContractByIdApi } from "@repo/actions/unirefund/ContractService/delete-actions";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import ConfirmDialog from "@repo/ayasofyazilim-ui/custom/confirm-dialog";
import { handleDeleteResponse } from "@repo/utils/api";
import { isActionGranted, useGrantedPolicies } from "@repo/utils/policies";
import { Trash } from "lucide-react";
import { useRouter } from "next/navigation";
import type { TransitionStartFunction } from "react";
import type { ContractServiceResource } from "@/language-data/unirefund/ContractService";

export default function DeleteFranchiseContractDialog({
  contractId,
  isPending,
  languageData,
  startTransition,
}: {
  contractId: string;
  isPending: boolean;
  languageData: ContractServiceResource;
  startTransition: TransitionStartFunction;
}) {
  const router = useRouter();
  const { grantedPolicies } = useGrantedPolicies();

  if (
    !isActionGranted(
      ["ContractService.FranchiseContract.Delete"],
      grantedPolicies
    )
  ) {
    return null;
  }

  return (
    <ConfirmDialog
      confirmProps={{
        variant: "destructive",
        children: languageData.Delete,
        closeAfterConfirm: true,
        onConfirm: () => {
          startTransition(() => {
            // Whether a contract with calculated earnings may be deleted is the
            // backend's call; surface whatever it returns rather than guessing.
            void deleteFranchiseContractByIdApi(contractId).then((response) => {
              handleDeleteResponse(response, router, "../");
            });
          });
        },
      }}
      description={languageData["FranchiseContracts.Delete.Description"]}
      title={languageData["FranchiseContracts.Delete.Title"]}
      type="without-trigger"
    >
      <Button
        data-testid="franchise-contract-delete"
        disabled={isPending}
        type="button"
        variant="outline"
      >
        <Trash className="size-4" />
        {languageData.Delete}
      </Button>
    </ConfirmDialog>
  );
}
```

- [ ] **Step 5: Verify types and lint**

Run: `npm run type-check`
Expected: exactly 2 baseline errors.

Run: `npm run lint`
Expected: 0 errors, no new warnings in your files.

`FranchiseContractDto.tiers` is a required array (not optional), and `id` on it is optional — the `defaultValues` mapping above relies on both. If tsc disagrees, read the DTO in `packages/saas/ContractService/types.gen.ts` and match reality; do not cast.

- [ ] **Step 6: Confirm the unit suite is untouched**

Run: `npm run test:unit`
Expected: 62 / 12 / 0 fail.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/src/app/[lang]/(main)/(unirefund)/contracts/franchise/[contractId]"
git commit -m "feat(franchise): add tenant contract edit form and delete"
```

---

### Task 5: Nav entry, E2E spec, acceptance

The task that makes franchise visible. Everything behind the link now works.

**Files:**
- Modify: `apps/web/src/components/sidebar-layout/data.ts`
- Create: `apps/web/tests/unirefund/contracts/franchise/create.franchise.contract.spec.ts`

**Interfaces:**
- Consumes: the `hostOnly` field on `NavItem` / `NavItemAction` and the `isHost` filter in `mapNavItem`, both built in sub-project 0.
- Produces: nothing.

- [ ] **Step 1: Add the nav group**

Insert a new top-level group into the `NavItems` array in `data.ts`. Place it immediately **before** the `finance` group (key `"finance"`), so contracts reads before money in the sidebar.

```ts
{
  key: "contracts",
  displayName: "Contracts",
  icon: "Handshake",
  hostOnly: true,
  items: [
    {
      key: "contracts/franchise",
      displayName: "FranchiseContracts",
      href: "contracts/franchise",
      icon: "DiamondPercent",
      hostOnly: true,
      policies: [
        "ContractService.FranchiseContract",
        "ContractService.FranchiseContract.ViewList",
      ],
      actions: [
        {
          key: "contracts/franchise/new",
          displayName: "FranchiseContracts.New",
          description: "FranchiseContracts.New",
          href: "contracts/franchise/new",
          icon: "DiamondPlus",
          hostOnly: true,
          policies: ["ContractService.FranchiseContract.Create"],
        },
      ],
    },
  ],
},
```

`hostOnly` is set on the group, the leaf and the action. The group flag is strictly redundant — `mapNavItem` already drops a group whose every child was filtered out — but it states the intent locally and costs nothing.

`"Handshake"`, `"DiamondPercent"` and `"DiamondPlus"` are all already used elsewhere in this same `data.ts`, so they are known-valid `lucide-react` exports under the pinned version — no icon verification needed. (`icon` is typed `keyof typeof LucideIcons`, so tsc would reject a wrong name anyway.)

- [ ] **Step 2: Verify types and lint**

Run: `pnpm run init` then `npm run type-check`
Expected: exactly 2 baseline errors.

Run: `npm run lint`
Expected: 0 errors.

- [ ] **Step 3: Write the E2E spec**

Read `apps/web/tests/unirefund/parties/merchants/new/create.merchant.spec.ts` and the `_support/` helpers (`app-ready`, `expect-toast`, `retry-utils`) first, then write a spec that mirrors its structure: navigate to `/contracts/franchise/new`, fill the form via the `data-testid` hooks added in Task 3, submit, and assert the success toast and the redirect to the list.

Use the exact test ids from Task 3: `franchise-tenant-combobox`, `franchise-contract-name`, `franchise-valid-from`, `franchise-valid-to`, `franchise-calculation-period`, `franchise-fee-base`, `franchise-contract-currency`, `franchise-fixed-fee`, `franchise-percent-fee`, `fee-bracket-add`, `franchise-contract-submit`.

Cover one bracket case as well as the flat-rate case, because the flat-rate path (submitting with zero brackets) is the one a reader is most likely to assume is broken.

- [ ] **Step 4: Confirm the E2E spec at least parses**

The suite cannot run here — `playwright.config.ts` takes `baseURL` from `TEST_LOCAL_URL` / `TEST_DEV_URL`, which are unset, and the flow needs an authenticated session.

Run: `npx playwright test --list tests/unirefund/contracts 2>&1 | tail -20`

Expected: your test titles are listed, proving the file compiles and is discovered. If listing fails for a reason other than a missing base URL, fix it.

**Do not claim the E2E test passed.** Record in your report that it was authored and listed but not executed, and that running it needs `TEST_LOCAL_URL` plus credentials.

- [ ] **Step 5: Full acceptance**

Run each and put the actual output in your report:

```bash
pnpm run init
npm run type-check                 # exactly 2 baseline errors
npm run test:unit                  # 62 tests / 12 suites / 0 fail
npm run lint                       # 0 errors
```

From the repo root `C:\unirefund\web-app`:

```bash
pnpm run i18n:missing              # no FranchiseContracts.* keys reported
node scripts/check-grid-keys.mjs   # unchanged from baseline
```

- [ ] **Step 6: Verify the nav entry is host-gated**

```bash
grep -n "hostOnly" apps/web/src/components/sidebar-layout/data.ts
```

Expected: the two type-definition lines (45, 62) **plus** the three you added. Five total. If a franchise nav entry lacks `hostOnly`, it will show for tenant sessions — that is a defect, not a nit.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/sidebar-layout/data.ts "apps/web/tests/unirefund/contracts"
git commit -m "feat(franchise): add host-only contracts nav entry and create E2E spec"
```

---

## Self-Review

**1. Spec coverage.** Sub-project 4's spec text is: *"Routes: `contracts/franchise/`, `new/`, `[contractId]/`. Tenant picker sourced from the SaaS tenant list. Pattern B with `FeeBracketsTable`. Tiers may be empty, which means flat-rate — the form must make that legible rather than looking unfinished."*

| Spec requirement | Task |
|---|---|
| `contracts/franchise/` list route | 2 |
| `new/` route | 3 |
| `[contractId]/` route | 4 |
| Tenant picker from the SaaS tenant list | 3 (`Combobox` over `getPublicTenantsApi`) |
| Pattern B with `FeeBracketsTable` | 3, 4 |
| Empty tiers legible as flat-rate | 3, 4 (`allowEmpty`, `fallbackHint` copy) plus the E2E flat-rate case in 5 |
| New top-level `contracts` nav group, host-only (Placement + gating sections) | 5 |
| `requireHost()` at `contracts/layout.tsx` (gating section names this exact path) | 2 |
| Tenant names joined client-side (Data flow section) | 2, 4 |
| Track A tenant immutable on edit | 4 |

Two spec-level items are deliberately **not** here, both belonging to sub-project 5: the earnings tab at `contracts/franchise/[contractId]/earnings`, and `finance/franchise-earning-runs`. The `contracts/layout.tsx` guard built in Task 2 already covers the former when it arrives.

**2. Placeholder scan.** No `TBD`, no "add error handling", no "similar to Task N" — Task 4's form repeats its code in full rather than referring back to Task 3. Four steps ask the implementer to *verify* something against the codebase (loading-skeleton convention, date-input treatment, `Select.*` key names, lucide icon names) and say what they found; those are checks with a named fallback, not placeholders.

**3. Type consistency.**
- `FranchiseContractsTable({ contractsData, languageData, tenantNames })` is defined once, in Task 2, and consumed only by Task 2's page. `tenantNames` is `Record<string, string>` in both, with `Object.fromEntries` at the boundary — a `Map` cannot serialise across it.
- `FeeBracketsTable` is called in Tasks 3 and 4 with exactly its real signature: `name="tiers"`, `allowEmpty`, `isPending`, `languageData`. Verified against the committed component.
- `createFranchiseContractFormSchemas({ languageData })` destructured identically in both forms; Task 3 takes `createFormSchema`, Task 4 takes `updateFormSchema`.
- Action call shapes match the committed wrappers: `postFranchiseContractApi({ requestBody })`, `putFranchiseContractByIdApi({ id, requestBody })`, `deleteFranchiseContractByIdApi(id)` (bare string), `getFranchiseContractByIdApi({ id }, session)`.
- `DeleteFranchiseContractDialog` props in Task 4's form match its definition in the same task.
- Every `languageData[...]` key read in Tasks 2-4 is written in Task 1. The two nav `displayName` keys read in Task 5 are written in Task 1's Step 3.

**4. Testing honesty.** This plan adds no unit tests and says why in "On testing" rather than manufacturing assertions against mocks. The one runtime behaviour that genuinely needs a human — `requireHost` redirecting a real tenant session — is still open from sub-project 0 and Task 2 does not pretend to close it; the E2E spec in Task 5 is authored but explicitly not run.

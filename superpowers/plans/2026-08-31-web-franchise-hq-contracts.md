# Franchise HQ Contracts (Sub-project 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each franchise HQ its per-country commission contracts — list, create, edit and delete — reachable as a third tab on the HQ, so sub-project 3 has contracts to generate statements from.

**Architecture:** A `contracts/` route family nested under the existing `parties/franchise-hqs/[partyId]/` shell, so the HQ's own layout supplies the host check, the `View` policy and the tab chrome. The list filters by `franchiseHqId`; the create form's country picker is constrained to the countries that HQ actually links, rather than every tenant. Both forms reuse the shared bracket editor and Zod factories that already serve the tenant-contract screens.

**Tech Stack:** Next.js 15 App Router (server components), TypeScript, `react-hook-form` + Zod (`@repo/ayasofyazilim-ui/lib/zod`), `MasterDataGrid`, `Combobox`, `SidebarTemplate`, Playwright for E2E.

**Spec:** `docs/superpowers/specs/2026-08-27-web-franchise-screens-design.md` — see "Domain model" (Track B), "Placement", "Forms", and sub-project 2.

## Global Constraints

- Working directory for every command is `C:\unirefund\web-app\apps\web` unless a step says otherwise. Repo root is `C:\unirefund\web-app`.
- Branch is `franchise-contract-update`. Commit to it directly. Do **not** create a branch, and do **not** push. Other actors have pushed to this branch before, so never claim work is unpushed without re-checking `git reflog show origin/franchise-contract-update | head`.
- **Type-check baseline is exactly 2 errors**, both `TS2307` for `@ayasofyazilim-clomerce/capture-core/detectors/mrz` (a private dependency absent locally). `tsc` exits non-zero because of them. Treat 2 as green; a third is a regression you introduced.
- **Unit tests: report actuals, do not chase the total.** `npm run test:unit` currently reports 80 tests / 15 suites, but exactly one suite ("affiliation switch session claims", 5 tests) comes from an **untracked file belonging to another session** that is being edited as we work. This plan adds no unit tests, so nothing here should change the count — if the number moves, list the suite names rather than doing arithmetic on totals.
- Run `pnpm run init` before `type-check` in any task that adds an i18n key.
- Prettier is not a gate. The husky `pre-commit` hook may reformat staged files, which is expected.
- Lint has ~465 pre-existing repo-wide warnings and **0 errors**. Only errors, and only warnings in files you touched, are yours. Note `react-require-testid/testid-missing` is at severity **error** — every interactive element you add needs a `data-testid`.
- **Stage explicit paths.** Never `git add -A` or `git add <directory>`. This checkout is shared and currently holds modified and untracked files that are **not yours**: `apps/ssr/src/utils/types.d.ts`, `apps/web/src/utils/types.d.ts`, `apps/web/playwright-report/index.html`, the `packages/utils` submodule, `apps/web/test-results/`, `apps/web/test_output.txt`, and `apps/web/src/components/sidebar-layout/nav/affiliation-claims.test.ts`. Do not stage, revert or clean any of them.
- **Never write `!tenantId` to test for host.** A host session reports `tenantId` as `Guid.Empty` (`"00000000-0000-0000-0000-000000000000"`), which is truthy. That bug shipped on this branch and was fixed; `requireHost`/`isHostTenant` are the only correct check and are already wired.
- **Delete redirects must be absolute.** A relative `"../"` resolves against the current URL and lands one level short from a nested route — that bug also shipped here and was fixed.
- **A `Combobox` needs a matching `id` prop**, not just a `data-testid`; it derives its testid from `id` and ignores a bare `data-testid`. Also shipped as a bug here once.
- **`handlePutResponse` for PUTs, `handlePostResponse` for POSTs, `handleDeleteResponse` for DELETEs.** Using the POST handler on a PUT produces a "Created successfully" toast on every edit — shipped here once too.
- Backend invariant, quoted from the generated type: an HQ contract's **HQ, country and currency are create-only** — *"a statement stores amounts in the contract's currency, so changing any of the three would retell what existing statements meant. A different country or currency is a different contract."* `updateFormSchema` already omits all three; do not add them back, and render them read-only on the edit form.
- Backend invariant, quoted: **"At least one bracket; a flat deal is a single bracket from 0 with no ceiling."** So Track B passes `allowEmpty={false}` to `FeeBracketsTable` — the opposite of the tenant-contract forms.

### On testing

`apps/web` has no jsdom and no React Testing Library, so a component cannot be rendered in a unit test. Every piece of pure logic this feature needs — bracket contiguity, both Zod factories, the local-date formatter — was already built and tested in earlier sub-projects. **This plan therefore adds no unit tests**, and that is not an oversight: gates are `type-check` and `lint`, plus the Playwright spec in Task 5.

**The Playwright spec cannot be run here.** `playwright.config.ts` reads `baseURL` from `TEST_LOCAL_URL` / `TEST_DEV_URL`, which are unset, and the flow needs an authenticated session. Task 5 authors it and proves it compiles via `--list`; it must not claim the test passed.

## Existing interfaces this plan consumes

All already built and reviewed. Signatures are exact — do not re-derive them.

**Server actions** (`@repo/actions/unirefund/ContractService/...`):
```ts
// action.ts — GET: takes a session, THROWS structuredError on failure
getFranchiseHqContractsApi(data: GetApiContractServiceFranchiseHqContractsData, session?: Session | null)
getFranchiseHqContractByIdApi(data: GetApiContractServiceFranchiseHqContractsByIdData, session?: Session | null)  // data is { id }
// post/put/delete-actions.ts — RETURN structuredError, no session param
postFranchiseHqContractApi(data)                 // { requestBody?: FranchiseHqContractCreateDto }
putFranchiseHqContractByIdApi(data)              // { id: string; requestBody?: FranchiseHqContractUpdateDto }
deleteFranchiseHqContractByIdApi(id: string)     // BARE STRING, not a data object
```

`GetApiContractServiceFranchiseHqContractsData` accepts `franchiseHqId?`, `countryTenantId?`, `maxResultCount?`, `skipCount?`, `sorting?`, `validOn?`.

**From CRMService** (`@repo/actions/unirefund/CRMService/actions`):
```ts
getFranchiseHqByIdApi({ id }, session)   // GET, throws. Returns FranchiseHqDto including its country links.
```

**DTO shapes** — note the asymmetry between write and read:
```ts
FranchiseHqContractCreateDto = {
  franchiseHqId: string; countryTenantId: string; name: string;
  validFrom: string; validTo: string; currency: string;
  minimumMonthlyCommission?: number;
  brackets: FranchiseHqContractBracketUpsertDto[];        // required, at least one
}
FranchiseHqContractUpdateDto = {
  name: string; validFrom: string; validTo: string;
  minimumMonthlyCommission?: number;
  brackets: FranchiseHqContractBracketUpsertDto[];        // required
}                                                         // no HQ, country or currency
FranchiseHqContractBracketUpsertDto = { minAmount?: number; maxAmount?: number | null; fixedFeeValue?: number; percentFeeValue?: number }
FranchiseHqContractDto = {
  id?; franchiseHqId?; countryTenantId?; name?; validFrom?; validTo?; currency?;
  minimumMonthlyCommission?;
  brackets?: FranchiseHqContractBracketDto[] | null;      // OPTIONAL AND NULLABLE
  ...audit
}
FranchiseHqContractBracketDto = { id?; minAmount?; maxAmount?; fixedFeeValue?; percentFeeValue? }
```

**`brackets` on the read DTO is optional and nullable**, unlike the tenant contract's `tiers`, which is required. The edit form's `defaultValues` must therefore use `(contract.brackets ?? []).map(...)` and default each numeric field — mapping it unguarded is a server-render crash.

**Shared form pieces** — these moved to the repo's cross-family homes in commit `bde76570c`, because two route families now use them:
```ts
import { createFranchiseHqContractFormSchemas } from "@/components/franchise/schemas";
import { FeeBracketsTable } from "@/components/franchise/fee-brackets-table";
import { toDateInputValue } from "@/utils/date-input-value";
```
- `createFranchiseHqContractFormSchemas({ languageData })` returns `{ createFormSchema, updateFormSchema }`.
  - `createFormSchema`: `franchiseHqId` (guid), `countryTenantId` (guid), `currency` (exactly 3 chars), `name`, `validFrom`, `validTo`, `minimumMonthlyCommission?`, `brackets`
  - `updateFormSchema`: the same **minus `franchiseHqId`, `countryTenantId` and `currency`**
- `FeeBracketsTable({ name, languageData, isPending, allowEmpty })` — `name` is `"tiers" | "brackets"`; pass **`"brackets"`** and **`allowEmpty={false}`**.
- `toDateInputValue(date: Date): string` returns `YYYY-MM-DD` from **local** getters. Use it for any date default; never `toISOString().slice(0,10)`, which yields yesterday east of UTC.

**Policies** (all present in `packages/utils/policies/policies.json`): `ContractService.FranchiseHqContract`, `.ViewList`, `.ViewDetail`, `.Create`, `.Edit`, `.Delete`.

**Grid schema:** `$UniRefund_ContractService_Franchises_FranchiseHqContracts_FranchiseHqContractDto` is exported from `@repo/saas/ContractService`.

## The design decision that makes this sub-project different

**The country picker is constrained to the HQ's own links.** A franchise HQ contract is *per country*, and an HQ only operates in the countries its `countries` array lists — each pairing a `countryTenantId` with that country's headquarter merchant. Offering every SaaS tenant would let a user create a contract for a country the HQ has no presence in, which the statement run could never use.

So the create page fetches the HQ via `getFranchiseHqByIdApi` and builds its picker from `hq.countries`, joining display names through `resolveTenantNames()`. If the HQ has no country links yet, the form says so and does not offer an empty picker — the user must add links on the Countries tab first.

## File structure

```
apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/[partyId]/
  layout.tsx                                  MODIFY  add the third tab (Task 2)
  contracts/
    page.tsx                                  NEW  list for this HQ (server)
    loading.tsx                               NEW
    _components/table.tsx                     NEW  list grid (client)
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

Modified: `language-data/unirefund/ContractService/resources/{en,tr}.json`.
New test: `apps/web/tests/unirefund/parties/franchise-hqs/create.franchise.hq.contract.spec.ts`.

**No sidebar nav entry is needed** — these screens are reached as a tab on the HQ, and the HQ's own entry is already in the nav. That also means the "nav lands last" rule does not apply here; instead the **tab** lands with its route, in Task 2.

**No `requireHost` or `View` policy call in any of these pages.** `[partyId]/layout.tsx` already runs both for its whole subtree. Deeper pages add only their own contract-specific policy check, matching `merchants/[partyId]/contracts/[contractId]/documents/page.tsx`.

---

### Task 1: i18n keys

No user-visible change. Every later task reads these, and tsc cannot see a key until `pnpm run init` runs.

**Files:**
- Modify: `apps/web/src/language-data/unirefund/ContractService/resources/en.json`
- Modify: `apps/web/src/language-data/unirefund/ContractService/resources/tr.json`
- Modify: `apps/web/src/language-data/unirefund/CRMService/resources/en.json`
- Modify: `apps/web/src/language-data/unirefund/CRMService/resources/tr.json`

**Interfaces:**
- Consumes: nothing.
- Produces: the key strings every later task reads via `languageData["..."]`.

The resource type is `typeof en`, so a key must exist in `en.json` to be typed, and a key only in `tr.json` is invisible to TypeScript. Keep both sets identical. These go in **ContractService**, not CRMService — the contract is a ContractService entity, and both forms already load ContractService resources for the bracket editor's own keys.

- [ ] **Step 1: Add the English keys**

Append to `apps/web/src/language-data/unirefund/ContractService/resources/en.json`:

```json
{
  "FranchiseHqContracts": "Commission contracts",
  "FranchiseHqContracts.New": "New commission contract",
  "FranchiseHqContracts.Form.countryTenantId": "Country",
  "FranchiseHqContracts.Form.name": "Contract name",
  "FranchiseHqContracts.Form.validFrom": "Valid from",
  "FranchiseHqContracts.Form.validTo": "Valid to",
  "FranchiseHqContracts.Form.currency": "Currency",
  "FranchiseHqContracts.Form.minimumMonthlyCommission": "Minimum monthly commission",
  "FranchiseHqContracts.Form.minimumHint": "Charged when the calculated commission falls below it.",
  "FranchiseHqContracts.Form.identityLocked": "Country and currency cannot be changed after the contract is created. A different country or currency is a different contract.",
  "FranchiseHqContracts.NoCountries": "This HQ has no country links yet. Add one on the Countries tab before creating a contract.",
  "FranchiseHqContracts.Delete.Title": "Delete this commission contract?",
  "FranchiseHqContracts.Delete.Description": "This removes the contract and its brackets. Statements already generated from it are not affected."
}
```

- [ ] **Step 2: Add the matching Turkish keys**

Append the same key set to `apps/web/src/language-data/unirefund/ContractService/resources/tr.json`:

```json
{
  "FranchiseHqContracts": "Komisyon sözleşmeleri",
  "FranchiseHqContracts.New": "Yeni komisyon sözleşmesi",
  "FranchiseHqContracts.Form.countryTenantId": "Ülke",
  "FranchiseHqContracts.Form.name": "Sözleşme adı",
  "FranchiseHqContracts.Form.validFrom": "Başlangıç tarihi",
  "FranchiseHqContracts.Form.validTo": "Bitiş tarihi",
  "FranchiseHqContracts.Form.currency": "Para birimi",
  "FranchiseHqContracts.Form.minimumMonthlyCommission": "Asgari aylık komisyon",
  "FranchiseHqContracts.Form.minimumHint": "Hesaplanan komisyon bu tutarın altında kalırsa uygulanır.",
  "FranchiseHqContracts.Form.identityLocked": "Sözleşme oluşturulduktan sonra ülke ve para birimi değiştirilemez. Farklı bir ülke veya para birimi farklı bir sözleşmedir.",
  "FranchiseHqContracts.NoCountries": "Bu merkezin henüz ülke bağlantısı yok. Sözleşme oluşturmadan önce Ülkeler sekmesinden bir bağlantı ekleyin.",
  "FranchiseHqContracts.Delete.Title": "Bu komisyon sözleşmesi silinsin mi?",
  "FranchiseHqContracts.Delete.Description": "Sözleşme ve dilimleri kaldırılır. Daha önce oluşturulmuş hesap özetleri etkilenmez."
}
```

- [ ] **Step 3: Add the tab label to the CRMService resources**

The tab label belongs in **CRMService**, not ContractService: the HQ layout that renders the tab loads `@/src/language-data/unirefund/CRMService`, so a ContractService key would not type-check there. It also joins two sibling keys that already exist — `FranchiseHqs.Tab.Details` and `FranchiseHqs.Tab.Countries`.

To `apps/web/src/language-data/unirefund/CRMService/resources/en.json`:

```json
{
  "FranchiseHqs.Tab.Contracts": "Contracts"
}
```

To `apps/web/src/language-data/unirefund/CRMService/resources/tr.json`:

```json
{
  "FranchiseHqs.Tab.Contracts": "Sözleşmeler"
}
```

- [ ] **Step 4: Regenerate and type-check**

Run: `pnpm run init`
Then: `npm run type-check`
Expected: exactly 2 baseline errors.

- [ ] **Step 5: Verify en/tr parity**

Run from `apps/web`:

```bash
node -e "for (const p of ['ContractService','CRMService']) { const a=require('./src/language-data/unirefund/'+p+'/resources/en.json'),b=require('./src/language-data/unirefund/'+p+'/resources/tr.json'); const ka=Object.keys(a),kb=Object.keys(b); console.log(p,'en',ka.length,'tr',kb.length,'onlyEn',ka.filter(k=>!kb.includes(k)),'onlyTr',kb.filter(k=>!ka.includes(k))); }"
```

Expected: equal counts and both "only" lists empty, for **both** pairs. Also confirm no key appears twice — compare `Object.keys().length` against the count of `"Franchise` lines in each file. Put the output in your report.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/language-data/unirefund/ContractService/resources/en.json apps/web/src/language-data/unirefund/ContractService/resources/tr.json apps/web/src/language-data/unirefund/CRMService/resources/en.json apps/web/src/language-data/unirefund/CRMService/resources/tr.json
git commit -m "feat(franchise): add i18n keys for HQ commission contracts"
```

---

### Task 2: Contract list and the third tab

The first working route, and the one that makes it reachable. The tab lands in the same commit as its route.

**Files:**
- Create: `…/[partyId]/contracts/page.tsx`
- Create: `…/[partyId]/contracts/loading.tsx`
- Create: `…/[partyId]/contracts/_components/table.tsx`
- Modify: `…/[partyId]/layout.tsx` — add the third tab

**Interfaces:**
- Consumes: `getFranchiseHqContractsApi`, `resolveTenantNames`, `isUnauthorized`.
- Produces: `FranchiseHqContractsTable({ contractsData, languageData, tenantNames, partyId })` — `tenantNames` is a plain `Record<string, string>`.

`resolveTenantNames()` returns a `Map`, which cannot cross the server→client boundary as a prop. Convert with `Object.fromEntries` in the page, exactly as the sibling franchise pages do.

- [ ] **Step 1: Create the loading skeleton**

Mirror `…/[partyId]/details/loading.tsx` — it re-exports the shared spinner.

- [ ] **Step 2: Create the list page**

```tsx
"use server";

import { getFranchiseHqContractsApi } from "@repo/actions/unirefund/ContractService/action";
import type { GetApiContractServiceFranchiseHqContractsData } from "@repo/saas/ContractService";
import ErrorComponent from "@repo/ui/components/error-component";
import { structuredError } from "@repo/utils/api";
import type { Session } from "@repo/utils/auth";
import { auth } from "@repo/utils/auth/next-auth";
import { isUnauthorized } from "@repo/utils/policies";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { getResourceData } from "@/src/language-data/unirefund/ContractService";
import { resolveTenantNames } from "@/utils/resolve-tenant-names";
import { FranchiseHqContractsTable } from "./_components/table";

interface SearchParamType {
  maxResultCount?: number;
  skipCount?: number;
}

async function getApiRequests(
  filters: GetApiContractServiceFranchiseHqContractsData,
  session: Session | null
) {
  try {
    const requiredRequests = await Promise.all([
      getFranchiseHqContractsApi(filters, session),
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
  params: Promise<{ lang: string; partyId: string }>;
  searchParams?: Promise<SearchParamType>;
}) {
  const { lang, partyId } = await params;
  // The HQ layout already ran requireHost and the FranchiseHqs.View check for
  // this subtree; only the contract-specific policy is added here.
  await isUnauthorized({
    requiredPolicies: ["ContractService.FranchiseHqContract.ViewList"],
    lang,
  });

  const searchs = await searchParams;
  const { languageData } = await getResourceData(lang);
  const session = await auth();

  const apiRequests = await getApiRequests(
    {
      franchiseHqId: partyId,
      maxResultCount: searchs?.maxResultCount || 10,
      skipCount: searchs?.skipCount || 0,
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
  // ContractService returns bare tenant ids; names come from SaaS.
  const tenantNames = await resolveTenantNames();

  return (
    <FranchiseHqContractsTable
      contractsData={contractsResponse.data}
      languageData={languageData}
      partyId={partyId}
      tenantNames={Object.fromEntries(tenantNames)}
    />
  );
}
```

- [ ] **Step 3: Create the list table**

Follow `contracts/franchise/_components/table.tsx` for the `MasterDataGrid` shape.

```tsx
"use client";

import {
  MasterDataGrid,
  RowLink,
} from "@repo/ayasofyazilim-ui/custom/master-data-grid";
import {
  $UniRefund_ContractService_Franchises_FranchiseHqContracts_FranchiseHqContractDto as $FranchiseHqContractDto,
  type PagedResultDto_FranchiseHqContractDto,
} from "@repo/saas/ContractService";
import { isActionGranted, useGrantedPolicies } from "@repo/utils/policies";
import { PlusCircle } from "lucide-react";
import { useParams } from "next/navigation";
import { useTenant } from "@/providers/tenant";
import type { ContractServiceResource } from "@/language-data/unirefund/ContractService";

export function FranchiseHqContractsTable({
  contractsData,
  languageData,
  partyId,
  tenantNames,
}: {
  contractsData: PagedResultDto_FranchiseHqContractDto;
  languageData: ContractServiceResource;
  partyId: string;
  tenantNames: Record<string, string>;
}) {
  const { lang } = useParams<{ lang: string }>();
  const { localization } = useTenant();
  const { grantedPolicies } = useGrantedPolicies();
  const base = `/${lang}/parties/franchise-hqs/${partyId}/contracts`;

  return (
    <MasterDataGrid
      data={contractsData.items || []}
      config={{
        localization,
        schema: $FranchiseHqContractDto,
        schemaColumns: {
          mode: "include",
          columns: [
            "name",
            "countryTenantId",
            "validFrom",
            "validTo",
            "currency",
            "minimumMonthlyCommission",
          ],
        },
        t: {
          ...languageData,
          "column.name": languageData["FranchiseHqContracts.Form.name"],
          "column.countryTenantId":
            languageData["FranchiseHqContracts.Form.countryTenantId"],
          "column.validFrom":
            languageData["FranchiseHqContracts.Form.validFrom"],
          "column.validTo": languageData["FranchiseHqContracts.Form.validTo"],
          "column.currency": languageData["FranchiseHqContracts.Form.currency"],
          "column.minimumMonthlyCommission":
            languageData["FranchiseHqContracts.Form.minimumMonthlyCommission"],
        },
        rowCount: contractsData.totalCount,
        customRenderers: {
          name: ({ row }) => (
            <RowLink href={`${base}/${row.original.id}`} label={row.original.name} />
          ),
          countryTenantId: ({ row }) =>
            tenantNames[row.original.countryTenantId ?? ""] ??
            row.original.countryTenantId,
        },
        tableActions: [
          {
            id: "create",
            type: "link",
            icon: PlusCircle,
            label: languageData["FranchiseHqContracts.New"],
            href: `${base}/new`,
            hidden: () =>
              !isActionGranted(
                ["ContractService.FranchiseHqContract.Create"],
                grantedPolicies
              ),
          },
        ],
      }}
    />
  );
}
```

- [ ] **Step 4: Add the third tab to the HQ layout**

In `…/[partyId]/layout.tsx`, add a third entry to the `items` array, after `countries`:

```ts
          {
            id: "contracts",
            name: languageData["FranchiseHqs.Tab.Contracts"],
            icon: "Handshake",
            action: `${baseLink}contracts`,
            permissions: ["ContractService.FranchiseHqContract.ViewList"],
          },
```

`"Handshake"` is already used in `data.ts`, so it is a valid `keyof typeof LucideIcons`.

The label key is `FranchiseHqs.Tab.Contracts`, added to **CRMService** in Task 1 — that layout loads CRMService resources, so a ContractService key would not type-check there, and this key sits beside the `FranchiseHqs.Tab.Details` and `FranchiseHqs.Tab.Countries` it joins. Verified before writing this plan; no check needed.

- [ ] **Step 5: Verify types and lint**

Run: `pnpm run init` then `npm run type-check`
Expected: exactly 2 baseline errors.

Run: `npm run lint`
Expected: 0 errors, no new warnings in your files.

- [ ] **Step 6: Confirm the unit suite is unchanged**

Run: `npm run test:unit`
Expected: unchanged from what you saw at task start. This task adds no tests.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/[partyId]/contracts/page.tsx" "apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/[partyId]/contracts/loading.tsx" "apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/[partyId]/contracts/_components/table.tsx" "apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/[partyId]/layout.tsx"
git commit -m "feat(franchise): add HQ commission contract list and tab"
```

---

### Task 3: Create form

**Files:**
- Create: `…/[partyId]/contracts/new/page.tsx`
- Create: `…/[partyId]/contracts/new/loading.tsx`
- Create: `…/[partyId]/contracts/new/_components/form.tsx`

**Interfaces:**
- Consumes: `getFranchiseHqByIdApi`, `resolveTenantNames`, `postFranchiseHqContractApi`, `createFranchiseHqContractFormSchemas`, `FeeBracketsTable`, `toDateInputValue`.
- Produces: nothing consumed elsewhere.

**The country picker is constrained to this HQ's links.** Fetch the HQ, and build the picker from `hq.countries` joined against `resolveTenantNames()`. Do not offer every tenant.

- [ ] **Step 1: Create the loading skeleton**

Mirror `…/[partyId]/details/loading.tsx`.

- [ ] **Step 2: Create the page**

```tsx
"use server";

import { getFranchiseHqByIdApi } from "@repo/actions/unirefund/CRMService/actions";
import ErrorComponent from "@repo/ui/components/error-component";
import { structuredError } from "@repo/utils/api";
import { auth } from "@repo/utils/auth/next-auth";
import { isUnauthorized } from "@repo/utils/policies";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { getResourceData } from "@/src/language-data/unirefund/ContractService";
import { resolveTenantNames } from "@/utils/resolve-tenant-names";
import FranchiseHqContractCreateForm from "./_components/form";

async function getApiRequests(partyId: string) {
  try {
    const session = await auth();
    const requiredRequests = await Promise.all([
      getFranchiseHqByIdApi({ id: partyId }, session),
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
  params: Promise<{ lang: string; partyId: string }>;
}) {
  const { lang, partyId } = await params;
  await isUnauthorized({
    requiredPolicies: ["ContractService.FranchiseHqContract.Create"],
    lang,
  });

  const { languageData } = await getResourceData(lang);
  const apiRequests = await getApiRequests(partyId);

  if ("message" in apiRequests) {
    return (
      <ErrorComponent
        languageData={languageData}
        message={apiRequests.message}
      />
    );
  }

  const [hqResponse] = apiRequests.requiredRequests;
  const tenantNames = await resolveTenantNames();

  // A contract is per country, and an HQ only operates where it has a link.
  const countries = (hqResponse.data.countries ?? [])
    .map((link) => link.countryTenantId)
    .filter((id): id is string => Boolean(id))
    .map((id) => ({ id, name: tenantNames.get(id) ?? id }));

  return (
    <FranchiseHqContractCreateForm
      countries={countries}
      hqId={partyId}
      languageData={languageData}
    />
  );
}
```

- [ ] **Step 3: Create the form**

Pattern B — `react-hook-form` + the shared Zod factory + `FeeBracketsTable`. Follow `contracts/franchise/new/_components/form.tsx` for the idiom; the differences are the constrained country picker, `allowEmpty={false}`, and the `minimumMonthlyCommission` field.

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
import { Combobox } from "@repo/ayasofyazilim-ui/custom/combobox";
import { z, zodResolver } from "@repo/ayasofyazilim-ui/lib/zod";
import { postFranchiseHqContractApi } from "@repo/actions/unirefund/ContractService/post-actions";
import { handlePostResponse } from "@repo/utils/api";
import { useParams, useRouter } from "next/navigation";
import { useTransition } from "react";
import { FeeBracketsTable } from "@/components/franchise/fee-brackets-table";
import { createFranchiseHqContractFormSchemas } from "@/components/franchise/schemas";
import { toDateInputValue } from "@/utils/date-input-value";
import type { ContractServiceResource } from "@/language-data/unirefund/ContractService";

interface CountryOption {
  id: string;
  name: string;
}

export default function FranchiseHqContractCreateForm({
  countries,
  hqId,
  languageData,
}: {
  countries: CountryOption[];
  hqId: string;
  languageData: ContractServiceResource;
}) {
  const router = useRouter();
  const { lang } = useParams<{ lang: string }>();
  const [isPending, startTransition] = useTransition();
  const { createFormSchema } = createFranchiseHqContractFormSchemas({
    languageData,
  });

  const today = new Date();
  const oneYearOn = new Date(today);
  oneYearOn.setFullYear(today.getFullYear() + 1);

  const form = useForm({
    resolver: zodResolver(createFormSchema),
    defaultValues: {
      franchiseHqId: hqId,
      countryTenantId: "",
      currency: "TRY",
      name: "",
      validFrom: toDateInputValue(today),
      validTo: toDateInputValue(oneYearOn),
      minimumMonthlyCommission: 0,
      // Track B requires at least one bracket; seed the flat deal.
      brackets: [
        { minAmount: 0, maxAmount: null, fixedFeeValue: 0, percentFeeValue: 0 },
      ],
    },
  });

  function onSubmit(values: z.infer<typeof createFormSchema>) {
    startTransition(() => {
      void postFranchiseHqContractApi({ requestBody: values }).then(
        (response) => {
          handlePostResponse(response, router, {
            prefix: `/${lang}/parties/franchise-hqs/${hqId}/contracts`,
            identifier: "id",
          });
        }
      );
    });
  }

  if (countries.length === 0) {
    return (
      <p className="text-muted-foreground text-sm" data-testid="franchise-hq-contract-no-countries">
        {languageData["FranchiseHqContracts.NoCountries"]}
      </p>
    );
  }

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4 overflow-auto p-px"
        data-testid="franchise-hq-contract-create-form"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <FormField
            control={form.control}
            name="countryTenantId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {languageData["FranchiseHqContracts.Form.countryTenantId"]}
                </FormLabel>
                <FormControl>
                  <Combobox<CountryOption>
                    disabled={isPending}
                    emptyValue={languageData["Select.EmptyValue"]}
                    id="franchise-hq-contract-country"
                    list={countries}
                    onValueChange={(value) => {
                      field.onChange(value?.id || "");
                    }}
                    searchPlaceholder={languageData["Select.Placeholder"]}
                    searchResultLabel={languageData["Select.ResultLabel"]}
                    selectIdentifier="id"
                    selectLabel="name"
                    value={countries.find((c) => c.id === field.value)}
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
                  {languageData["FranchiseHqContracts.Form.name"]}
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    data-testid="franchise-hq-contract-name"
                    disabled={isPending}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="validFrom"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {languageData["FranchiseHqContracts.Form.validFrom"]}
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    data-testid="franchise-hq-contract-valid-from"
                    disabled={isPending}
                    onChange={(event) => {
                      field.onChange(event.target.value);
                    }}
                    type="date"
                    value={field.value.slice(0, 10)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="validTo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {languageData["FranchiseHqContracts.Form.validTo"]}
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    data-testid="franchise-hq-contract-valid-to"
                    disabled={isPending}
                    onChange={(event) => {
                      field.onChange(event.target.value);
                    }}
                    type="date"
                    value={field.value.slice(0, 10)}
                  />
                </FormControl>
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
                  {languageData["FranchiseHqContracts.Form.currency"]}
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    data-testid="franchise-hq-contract-currency"
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
            name="minimumMonthlyCommission"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {
                    languageData[
                      "FranchiseHqContracts.Form.minimumMonthlyCommission"
                    ]
                  }
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    data-testid="franchise-hq-contract-minimum"
                    disabled={isPending}
                    type="number"
                    value={field.value as number}
                  />
                </FormControl>
                <FormDescription>
                  {languageData["FranchiseHqContracts.Form.minimumHint"]}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FeeBracketsTable
          allowEmpty={false}
          isPending={isPending}
          languageData={languageData}
          name="brackets"
        />

        <Button
          className="max-w-xs"
          data-testid="franchise-hq-contract-submit"
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

Note `value={field.value as number}` on the numeric input: `z.coerce.number()` makes the resolver's input type `unknown`, so a bare `{...field}` spread fails `tsc`. This is the same narrowing cast the tenant-contract forms use. Do not use `any`, and do not change the shared schema.

- [ ] **Step 4: Verify types and lint**

Run: `npm run type-check` — expected: exactly 2 baseline errors.
Run: `npm run lint` — expected: 0 errors, no new warnings in your files.

- [ ] **Step 5: Confirm the unit suite is unchanged**

Run: `npm run test:unit` — expected: unchanged from task start.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/[partyId]/contracts/new"
git commit -m "feat(franchise): add HQ commission contract create form"
```

---

### Task 4: Edit form and delete

**Files:**
- Create: `…/[partyId]/contracts/[contractId]/page.tsx`
- Create: `…/[partyId]/contracts/[contractId]/loading.tsx`
- Create: `…/[partyId]/contracts/[contractId]/_components/form.tsx`
- Create: `…/[partyId]/contracts/[contractId]/_components/delete-contract.tsx`

**Interfaces:**
- Consumes: `getFranchiseHqContractByIdApi`, `putFranchiseHqContractByIdApi`, `deleteFranchiseHqContractByIdApi`, `resolveTenantNames`, `createFranchiseHqContractFormSchemas().updateFormSchema`, `FeeBracketsTable`.
- Produces: nothing consumed elsewhere.

**Country and currency are immutable.** `updateFormSchema` omits `franchiseHqId`, `countryTenantId` and `currency`. Render country and currency as read-only text with the `FranchiseHqContracts.Form.identityLocked` hint. Do not add them to the schema or the request body.

**`brackets` on the read DTO is optional and nullable.** Use `(contract.brackets ?? []).map(...)` and default each numeric field — mapping it unguarded is a server-render crash.

- [ ] **Step 1: Create the loading skeleton**

Mirror `…/[partyId]/details/loading.tsx`.

- [ ] **Step 2: Create the page**

```tsx
"use server";

import { getFranchiseHqContractByIdApi } from "@repo/actions/unirefund/ContractService/action";
import ErrorComponent from "@repo/ui/components/error-component";
import { structuredError } from "@repo/utils/api";
import { auth } from "@repo/utils/auth/next-auth";
import { isUnauthorized } from "@repo/utils/policies";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { getResourceData } from "@/src/language-data/unirefund/ContractService";
import { resolveTenantNames } from "@/utils/resolve-tenant-names";
import FranchiseHqContractUpdateForm from "./_components/form";

async function getApiRequests(contractId: string) {
  try {
    const session = await auth();
    const requiredRequests = await Promise.all([
      getFranchiseHqContractByIdApi({ id: contractId }, session),
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
  params: Promise<{ lang: string; partyId: string; contractId: string }>;
}) {
  const { lang, partyId, contractId } = await params;
  await isUnauthorized({
    requiredPolicies: ["ContractService.FranchiseHqContract.ViewDetail"],
    lang,
  });

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
    <FranchiseHqContractUpdateForm
      contract={contract}
      contractId={contractId}
      countryName={
        tenantNames.get(contract.countryTenantId ?? "") ??
        contract.countryTenantId ??
        ""
      }
      hqId={partyId}
      languageData={languageData}
    />
  );
}
```

- [ ] **Step 3: Create the edit form**

Same shape as the create form, with four differences: `updateFormSchema`; no country picker or currency input (both read-only); `defaultValues` seeded from the contract with `?? []` on brackets; and `putFranchiseHqContractByIdApi` with `handlePutResponse`.

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
import { z, zodResolver } from "@repo/ayasofyazilim-ui/lib/zod";
import { putFranchiseHqContractByIdApi } from "@repo/actions/unirefund/ContractService/put-actions";
import type { UniRefund_ContractService_Franchises_FranchiseHqContracts_FranchiseHqContractDto as FranchiseHqContractDto } from "@repo/saas/ContractService";
import { handlePutResponse } from "@repo/utils/api";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { FeeBracketsTable } from "@/components/franchise/fee-brackets-table";
import { createFranchiseHqContractFormSchemas } from "@/components/franchise/schemas";
import type { ContractServiceResource } from "@/language-data/unirefund/ContractService";
import DeleteFranchiseHqContractDialog from "./delete-contract";

export default function FranchiseHqContractUpdateForm({
  contract,
  contractId,
  countryName,
  hqId,
  languageData,
}: {
  contract: FranchiseHqContractDto;
  contractId: string;
  countryName: string;
  hqId: string;
  languageData: ContractServiceResource;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { updateFormSchema } = createFranchiseHqContractFormSchemas({
    languageData,
  });

  const form = useForm({
    resolver: zodResolver(updateFormSchema),
    defaultValues: {
      name: contract.name ?? "",
      validFrom: (contract.validFrom ?? "").slice(0, 10),
      validTo: (contract.validTo ?? "").slice(0, 10),
      minimumMonthlyCommission: contract.minimumMonthlyCommission ?? 0,
      // brackets is optional AND nullable on the read DTO, unlike the tenant
      // contract's tiers — mapping it unguarded would crash the render.
      brackets: (contract.brackets ?? []).map((bracket) => ({
        id: bracket.id,
        minAmount: bracket.minAmount ?? 0,
        maxAmount: bracket.maxAmount ?? null,
        fixedFeeValue: bracket.fixedFeeValue ?? 0,
        percentFeeValue: bracket.percentFeeValue ?? 0,
      })),
    },
  });

  function onSubmit(values: z.infer<typeof updateFormSchema>) {
    startTransition(() => {
      void putFranchiseHqContractByIdApi({
        id: contractId,
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
        data-testid="franchise-hq-contract-update-form"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <FormItem>
            <FormLabel>
              {languageData["FranchiseHqContracts.Form.countryTenantId"]}
            </FormLabel>
            {/* Immutable: a different country is a different contract. */}
            <Input
              data-testid="franchise-hq-contract-country-readonly"
              disabled
              readOnly
              value={countryName}
            />
          </FormItem>

          <FormItem>
            <FormLabel>
              {languageData["FranchiseHqContracts.Form.currency"]}
            </FormLabel>
            <Input
              data-testid="franchise-hq-contract-currency-readonly"
              disabled
              readOnly
              value={contract.currency ?? ""}
            />
            <FormDescription>
              {languageData["FranchiseHqContracts.Form.identityLocked"]}
            </FormDescription>
          </FormItem>

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {languageData["FranchiseHqContracts.Form.name"]}
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    data-testid="franchise-hq-contract-name"
                    disabled={isPending}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="minimumMonthlyCommission"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {
                    languageData[
                      "FranchiseHqContracts.Form.minimumMonthlyCommission"
                    ]
                  }
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    data-testid="franchise-hq-contract-minimum"
                    disabled={isPending}
                    type="number"
                    value={field.value as number}
                  />
                </FormControl>
                <FormDescription>
                  {languageData["FranchiseHqContracts.Form.minimumHint"]}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="validFrom"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {languageData["FranchiseHqContracts.Form.validFrom"]}
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    data-testid="franchise-hq-contract-valid-from"
                    disabled={isPending}
                    onChange={(event) => {
                      field.onChange(event.target.value);
                    }}
                    type="date"
                    value={field.value.slice(0, 10)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="validTo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {languageData["FranchiseHqContracts.Form.validTo"]}
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    data-testid="franchise-hq-contract-valid-to"
                    disabled={isPending}
                    onChange={(event) => {
                      field.onChange(event.target.value);
                    }}
                    type="date"
                    value={field.value.slice(0, 10)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FeeBracketsTable
          allowEmpty={false}
          isPending={isPending}
          languageData={languageData}
          name="brackets"
        />

        <div className="flex items-center gap-2">
          <Button
            className="max-w-xs"
            data-testid="franchise-hq-contract-submit"
            disabled={isPending}
            type="submit"
          >
            {languageData.Save}
          </Button>
          <DeleteFranchiseHqContractDialog
            contractId={contractId}
            hqId={hqId}
            isPending={isPending}
            languageData={languageData}
          />
        </div>
      </form>
    </Form>
  );
}
```

- [ ] **Step 4: Create the delete dialog**

Absolute redirect target, back to this HQ's contract list.

```tsx
"use client";
import { deleteFranchiseHqContractByIdApi } from "@repo/actions/unirefund/ContractService/delete-actions";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import ConfirmDialog from "@repo/ayasofyazilim-ui/custom/confirm-dialog";
import { handleDeleteResponse } from "@repo/utils/api";
import { isActionGranted, useGrantedPolicies } from "@repo/utils/policies";
import { Trash } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useTransition } from "react";
import type { ContractServiceResource } from "@/language-data/unirefund/ContractService";

export default function DeleteFranchiseHqContractDialog({
  contractId,
  hqId,
  isPending,
  languageData,
}: {
  contractId: string;
  hqId: string;
  isPending: boolean;
  languageData: ContractServiceResource;
}) {
  const router = useRouter();
  const { lang } = useParams<{ lang: string }>();
  const { grantedPolicies } = useGrantedPolicies();
  const [isDeleting, startTransition] = useTransition();

  if (
    !isActionGranted(
      ["ContractService.FranchiseHqContract.Delete"],
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
            // Whether a contract with generated statements may be deleted is
            // the backend's call; surface whatever it returns.
            void deleteFranchiseHqContractByIdApi(contractId).then(
              (response) => {
                handleDeleteResponse(
                  response,
                  router,
                  `/${lang}/parties/franchise-hqs/${hqId}/contracts`
                );
              }
            );
          });
        },
      }}
      description={languageData["FranchiseHqContracts.Delete.Description"]}
      title={languageData["FranchiseHqContracts.Delete.Title"]}
      type="without-trigger"
    >
      <Button
        data-testid="franchise-hq-contract-delete"
        disabled={isPending || isDeleting}
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

Run: `npm run type-check` — expected: exactly 2 baseline errors.
Run: `npm run lint` — expected: 0 errors, no new warnings in your files.

- [ ] **Step 6: Confirm the unit suite is unchanged**

Run: `npm run test:unit` — expected: unchanged from task start.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/[partyId]/contracts/[contractId]"
git commit -m "feat(franchise): add HQ commission contract edit form and delete"
```

---

### Task 5: E2E spec and acceptance

**Files:**
- Create: `apps/web/tests/unirefund/parties/franchise-hqs/create.franchise.hq.contract.spec.ts`

**Interfaces:**
- Consumes: the test ids the two forms render.
- Produces: nothing.

- [ ] **Step 1: Write the E2E spec**

Read `apps/web/tests/unirefund/parties/franchise-hqs/create.franchise.hq.spec.ts` (the sibling from the previous sub-project) and the `_support/` helpers first, then mirror that structure.

Use the test ids the forms actually render: `franchise-hq-contract-create-form`, `franchise-hq-contract-country` (a `Combobox`, so its items are `franchise-hq-contract-country_0`), `franchise-hq-contract-name`, `franchise-hq-contract-valid-from`, `franchise-hq-contract-valid-to`, `franchise-hq-contract-currency`, `franchise-hq-contract-minimum`, `franchise-hq-contract-submit`, and from the shared bracket editor `fee-bracket-add` plus `fee-bracket-0-min` / `fee-bracket-0-max` / `fee-bracket-0-fixed` / `fee-bracket-0-percent`.

Two scenarios:
1. **Create a contract with the seeded single open bracket** — the flat deal. Pick a country, name it, submit, assert the success toast and that the URL moves to the new contract.
2. **Reject an invalid bracket set** — set the sole bracket's upper bound to a value, so the highest bracket has a ceiling, and assert the form does not submit and shows an error. This is the one scenario that exercises Track B's `allowEmpty={false}` contract and the contiguity rule end to end in a browser; the pure rule is unit-tested but has never been seen rendering.

**The spec depends on data existing:** the target HQ must have at least one country link, or the create form shows the "no country links yet" message instead of the form. Note that dependency in a comment at the top of the spec so a failure there reads as data setup, not a code defect.

- [ ] **Step 2: Confirm the spec compiles and is discovered**

The suite cannot run here — `playwright.config.ts` takes `baseURL` from `TEST_LOCAL_URL`/`TEST_DEV_URL`, which are unset, and the flow needs an authenticated session.

Run: `npx playwright test --list tests/unirefund/parties/franchise-hqs 2>&1 | tail -20`
Expected: your two new titles listed alongside the sibling spec's.

**Do not claim the E2E test passed.** Record in your report that it was authored and listed but never executed.

- [ ] **Step 3: Full acceptance**

Run each and put the actual output in your report:

```bash
pnpm run init
npm run type-check                 # exactly 2 baseline errors
npm run test:unit                  # report actuals; this sub-project adds no tests
npm run lint                       # 0 errors
```

From the repo root `C:\unirefund\web-app`:

```bash
pnpm run i18n:missing              # no FranchiseHqContracts.* keys reported
node scripts/check-grid-keys.mjs   # unchanged from baseline
```

- [ ] **Step 4: Verify the tab set and that no nav entry was added**

```bash
grep -n 'id: "' "apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/[partyId]/layout.tsx"
grep -c "hostOnly" apps/web/src/components/sidebar-layout/data.ts
```

Expected: three tab ids (`details`, `countries`, `contracts`), and the `hostOnly` count **unchanged at 7** — this sub-project adds no sidebar entry, because its screens are reached as a tab on the HQ.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/tests/unirefund/parties/franchise-hqs/create.franchise.hq.contract.spec.ts"
git commit -m "feat(franchise): add HQ commission contract E2E spec"
```

---

## Self-Review

**1. Spec coverage.** Sub-project 2's spec text: *"Routes: `parties/franchise-hqs/[partyId]/contracts/`, `new/`, `[contractId]/`. List is filtered by `franchiseHqId`. Create and edit use Pattern B with `FeeBracketsTable`. Edit locks HQ, country and currency structurally."*

| Spec requirement | Task |
|---|---|
| `…/[partyId]/contracts/` list, filtered by `franchiseHqId` | 2 |
| `new/` | 3 |
| `[contractId]/` | 4 |
| Pattern B + `FeeBracketsTable` on both forms | 3, 4 |
| Edit locks HQ, country and currency structurally | 4 (schema omits them; country and currency render read-only) |
| Third tab under `[partyId]` | 2 |
| Tenant names joined client-side | 2, 3, 4 |
| `allowEmpty={false}` for Track B | 3, 4 |
| Delete, with consequences left to the backend | 4 |

Beyond the spec, and deliberate: the country picker is constrained to the HQ's own links rather than all tenants, with an explicit empty state. The spec says only "per country"; offering countries the HQ has no presence in would create contracts the statement run can never use.

**2. Placeholder scan.** No `TBD`, no "add error handling", no "similar to Task N" — Task 4's form repeats its code in full. No step defers a decision to the implementer. One originally did — whether the HQ layout's `languageData` could resolve a ContractService key for the tab label — and self-review settled it instead: the layout loads CRMService, so the key is `FranchiseHqs.Tab.Contracts` in CRMService, beside the two sibling tab keys that already exist.

**3. Type consistency.**
- `FranchiseHqContractsTable({ contractsData, languageData, partyId, tenantNames })` defined and consumed in Task 2; `tenantNames` is `Record<string, string>` on both sides with `Object.fromEntries` at the boundary.
- `CountryOption` is `{ id: string; name: string }`, built in Task 3's page and consumed by its form's `Combobox` with `selectIdentifier="id"` / `selectLabel="name"`.
- `FranchiseHqContractUpdateForm({ contract, contractId, countryName, hqId, languageData })` and `DeleteFranchiseHqContractDialog({ contractId, hqId, isPending, languageData })` are defined and consumed within Task 4.
- Action call shapes match the committed wrappers: `postFranchiseHqContractApi({ requestBody })`, `putFranchiseHqContractByIdApi({ id, requestBody })`, `deleteFranchiseHqContractByIdApi(id)` bare string, `getFranchiseHqContractByIdApi({ id }, session)`.
- Response handlers match the verb: `handlePostResponse` on create, `handlePutResponse` on edit, `handleDeleteResponse` on delete.
- Every `languageData[...]` key read in Tasks 2-4 is written in Task 1, except `Save`, `Delete`, `Select.EmptyValue`, `Select.Placeholder` and `Select.ResultLabel`, which come from the merged `core/Default` resource and are verified present.
- `FeeBracketsTable` is called with `name="brackets"` and `allowEmpty={false}` in both forms — the Track B contract, opposite to the tenant forms' `name="tiers"` / `allowEmpty`.

**4. Every defect class this branch has already shipped is pre-empted in the Global Constraints**, with the correct form stated rather than left to be rediscovered: no `!tenantId`, absolute delete redirects, `Combobox` needs a matching `id`, `handlePutResponse` on PUTs, `toDateInputValue` rather than `toISOString().slice(0,10)`, and the `?? []` guard on the nullable `brackets`.

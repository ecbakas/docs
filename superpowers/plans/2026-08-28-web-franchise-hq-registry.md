# Franchise HQ Registry (Sub-project 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the franchise HQ registry — list, create, edit and delete a franchise HQ, and manage its country links — so that sub-project 2 (HQ contracts) and sub-project 3 (HQ statements) have an HQ to point at.

**Architecture:** A new host-only party type under `parties/franchise-hqs/`, following the shape every other party in this app uses: a paged list page, a create page, and a `[partyId]` shell whose `SidebarTemplate` renders permission-gated tabs. Two tabs ship here — `details` (name and external identifier) and `countries` (the HQ's country→headquarter-merchant links). Sub-project 2 adds a third. The country links are edited as a whole set and submitted through one idempotent full-replace call.

**Tech Stack:** Next.js 15 App Router (server components), TypeScript, `react-hook-form` + Zod (`@repo/ayasofyazilim-ui/lib/zod`), `MasterDataGrid`, `Combobox` and `SidebarTemplate` from the shared UI package, Playwright for E2E.

**Spec:** `docs/superpowers/specs/2026-08-27-web-franchise-screens-design.md` — see "Placement", "Host-only gating", "Data flow", and sub-project 1.

## Global Constraints

- Working directory for every command is `C:\unirefund\web-app\apps\web` unless a step says otherwise. Repo root is `C:\unirefund\web-app`.
- Branch is `franchise-contract-update`. Commit to it directly. Do **not** create a branch, and do **not** push. Other actors have pushed to this branch during previous runs, so never claim work is unpushed without re-checking `git reflog show origin/franchise-contract-update | head`.
- **Type-check baseline is exactly 2 errors**, both `TS2307` for `@ayasofyazilim-clomerce/capture-core/detectors/mrz` (a private dependency absent locally). `tsc` exits non-zero because of them. Treat 2 as green; a third is a regression you introduced.
- **Unit-test baseline is 68 tests / 13 suites, all passing (one is an intentional skip).** Task 5 adds tests; every other task adds none. Report actual counts.
- Run `pnpm run init` before `type-check` in any task that adds an i18n key, or tsc will not see the key.
- Prettier is not a gate; `format:check` fails repo-wide on line endings. The husky `pre-commit` hook may reformat staged files, which is expected.
- Lint has ~465 pre-existing repo-wide warnings and **0 errors**. Only errors, and only warnings in files you touched, are yours.
- **Stage explicit paths.** Never `git add -A` or `git add <directory>` — this checkout is shared with another session and a foreign file can be swept into your commit. Paths contain `[lang]`, `(main)` and `[partyId]`; quote them.
- **Host gating is already built and working.** `requireHost(lang)` and `isHostTenant` live in `apps/web/src/utils/`; the nav honours `hostOnly`. Do not reimplement either. In particular **do not write `!tenantId`** anywhere — a host session reports `tenantId` as `Guid.Empty` (`"00000000-0000-0000-0000-000000000000"`), which is truthy; `isHostTenant` is the only correct check and it is already wired into both the nav and the guard.
- **Policy guard per page**, matching the precedent in `settings/templates/rebate-tables/page.tsx`: `await isUnauthorized({ requiredPolicies, lang })` from `@repo/utils/policies`, placed immediately after `params` are destructured and before any data fetch.
- Backend invariant, quoted from the generated type: `set-countries` is a **full replace** — *"links absent from the list are removed, new ones added. Idempotent by design — repeating the call converges on the same state."* The countries page therefore edits the entire set and submits it entire; it must not try to add or remove one link at a time.
- The `headquarterMerchantId` on a country link is a **HEADQUARTER-type merchant**. Filter the picker with `typeCodes: ["HEADQUARTER"]`, exactly as `finance/rebate-statements/new/page.tsx:17` already does.
- **There is no store-tree endpoint.** `FranchiseHqStoreDto` is a generated type nothing returns, and `CRMService.FranchiseHqs.ViewStoreTreeFromIntegration` is a permission with nothing to call. Only six franchise-HQ endpoints exist. Do not attempt a store-tree view.

### On testing

`apps/web` has no jsdom and no React Testing Library, so a component cannot be rendered in a unit test. The only runner is `node --test` over `src/**/*.test.ts`.

That means pages and forms are gated by **`type-check` and `lint`**, plus the Playwright spec in Task 6. Do not invent tests that only assert a mock, and do not add a test runner.

**Task 5 is the exception and does get real unit tests**, because the country-links editor has a genuine cross-row rule — the same country must not be linked twice — which is a pure function over an array.

**The Playwright spec cannot be run in this environment.** `playwright.config.ts` reads `baseURL` from `TEST_LOCAL_URL` / `TEST_DEV_URL`, which are unset, and the flow needs an authenticated session. Task 6 authors the spec and proves it compiles via `--list`; it must not claim the test passed.

## Existing interfaces this plan consumes

All already built and reviewed. Signatures are exact — do not re-derive them.

**Server actions** (`@repo/actions/unirefund/CRMService/...`):
```ts
// actions.ts — GET: takes a session, THROWS structuredError on failure
getFranchiseHqsApi(data: GetApiCrmServiceFranchiseHqsData, session?: Session | null)
getFranchiseHqByIdApi(data: GetApiCrmServiceFranchiseHqsByIdData, session?: Session | null)
getMerchantsApi(data: GetApiCrmServiceMerchantsData = {}, session?: Session | null)
// post-actions.ts / put-actions.ts / delete-actions.ts — RETURN structuredError, no session
postFranchiseHqApi(data: PostApiCrmServiceFranchiseHqsData)
putFranchiseHqByIdApi(data: PutApiCrmServiceFranchiseHqsByIdData)
putFranchiseHqCountriesByIdApi(data: PutApiCrmServiceFranchiseHqsByIdCountriesData)
deleteFranchiseHqByIdApi(id: string)          // bare string, not a data object
```

**Query and body shapes:**
```ts
GetApiCrmServiceFranchiseHqsData = { maxResultCount?, name?, skipCount?, sorting? }  // name is a contains-match
PostApiCrmServiceFranchiseHqsData = { requestBody?: FranchiseHqCreateDto }
PutApiCrmServiceFranchiseHqsByIdData = { id: string; requestBody?: FranchiseHqUpdateDto }
PutApiCrmServiceFranchiseHqsByIdCountriesData = { id: string; requestBody?: SetFranchiseHqCountriesInput }

FranchiseHqCreateDto = { name: string; externalIdentifier?: string | null; countries?: FranchiseHqCountryUpsertDto[] | null }
FranchiseHqUpdateDto = { name: string; externalIdentifier?: string | null }     // countries are NOT here
SetFranchiseHqCountriesInput = { countries: FranchiseHqCountryUpsertDto[] }
FranchiseHqCountryUpsertDto = { countryTenantId: string; headquarterMerchantId: string }

FranchiseHqDto = { id?, name?, externalIdentifier?, countries?: FranchiseHqCountryDto[] | null, ...audit }
FranchiseHqCountryDto = { id?, countryTenantId?, headquarterMerchantId? }
```

Note the list endpoint returns the full `FranchiseHqDto` including `countries`, so a country-count column needs no extra fetch.

**Foundation helpers:**
```ts
// apps/web/src/utils/require-host.ts
requireHost(lang: string): Promise<void>
// apps/web/src/utils/resolve-tenant-names.ts
resolveTenantNames(): Promise<Map<string, string>>   // id -> name; empty map on failure, never throws
// @repo/actions/core/SaasService/actions
getPublicTenantsApi()   // RETURNS its error rather than throwing; payload is data.items
```

**Grid schema:** `$UniRefund_CRMService_FranchiseHqs_FranchiseHqDto` is exported from `@repo/saas/CRMService`.

**`SidebarTemplate`** (`@/src/components/sidebar-template`) takes `{ items, header, footer, name, children }`, where each item is:
```ts
{ id: string; name: string; icon?: IconName; action: string | (() => Promise<void>); permissions?: Policy[]; condition?: boolean }
```

**Policies** (all present in `packages/utils/policies/policies.json`): `CRMService.FranchiseHqs`, `.ViewList`, `.View`, `.Create`, `.Edit`, `.Delete`, `.SetCountries`.

## File structure

```
apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/
  page.tsx                                    NEW  list (server)
  loading.tsx                                 NEW
  _components/table.tsx                       NEW  list grid (client)
  _components/country-links.ts                NEW  pure duplicate-detection (Task 5)
  _components/country-links.test.ts           NEW  its unit tests (Task 5)
  new/
    page.tsx                                  NEW  create (server)
    loading.tsx                               NEW
    _components/form.tsx                      NEW  create form (client)
  [partyId]/
    layout.tsx                                NEW  SidebarTemplate tabs + back + delete footer
    loading.tsx                               NEW
    _components/delete-hq.tsx                 NEW  delete dialog (client)
    details/
      page.tsx                                NEW  edit name/externalIdentifier (server)
      loading.tsx                             NEW
      _components/form.tsx                    NEW  (client)
    countries/
      page.tsx                                NEW  country links (server)
      loading.tsx                             NEW
      _components/form.tsx                    NEW  full-replace editor (client)
```

Modified: `components/sidebar-layout/data.ts`, `language-data/unirefund/CRMService/resources/{en,tr}.json`, `language-data/core/AbpUiNavigation/resources/{en,tr}.json`.
New test: `apps/web/tests/unirefund/parties/franchise-hqs/create.franchise.hq.spec.ts`.

**The nav entry lands last (Task 6)**, so the sidebar never points at a route that does not exist yet.

---

### Task 1: i18n keys

No user-visible change. Every later task reads these, and tsc cannot see a key until `pnpm run init` runs.

**Files:**
- Modify: `apps/web/src/language-data/unirefund/CRMService/resources/en.json`
- Modify: `apps/web/src/language-data/unirefund/CRMService/resources/tr.json`
- Modify: `apps/web/src/language-data/core/AbpUiNavigation/resources/en.json`
- Modify: `apps/web/src/language-data/core/AbpUiNavigation/resources/tr.json`

**Interfaces:**
- Consumes: nothing.
- Produces: the key strings every later task reads via `languageData["..."]`.

The resource type is `typeof en`, so a key must exist in `en.json` to be typed, and a key only in `tr.json` is invisible to TypeScript. Keep both sets identical.

- [ ] **Step 1: Add the CRMService English keys**

Append to `apps/web/src/language-data/unirefund/CRMService/resources/en.json`:

```json
{
  "FranchiseHqs.New": "New franchise HQ",
  "FranchiseHqs.Form.name": "HQ name",
  "FranchiseHqs.Form.externalIdentifier": "External identifier",
  "FranchiseHqs.column.countryCount": "Countries",
  "FranchiseHqs.Tab.Details": "Details",
  "FranchiseHqs.Tab.Countries": "Countries",
  "FranchiseHqs.BackToList": "Back to franchise HQs",
  "FranchiseHqs.Countries.title": "Country links",
  "FranchiseHqs.Countries.description": "Each country this HQ operates in, paired with its headquarter merchant. Saving replaces the whole set.",
  "FranchiseHqs.Countries.countryTenantId": "Country",
  "FranchiseHqs.Countries.headquarterMerchantId": "Headquarter merchant",
  "FranchiseHqs.Countries.add": "Add country",
  "FranchiseHqs.Countries.remove": "Remove country",
  "FranchiseHqs.Countries.empty": "No countries linked yet.",
  "FranchiseHqs.Countries.Error.duplicateCountry": "This country is already linked. Each country may appear once.",
  "FranchiseHqs.Delete.Title": "Delete this franchise HQ?",
  "FranchiseHqs.Delete.Description": "This removes the HQ and its country links."
}
```

- [ ] **Step 2: Add the matching Turkish keys**

Append the same key set to `apps/web/src/language-data/unirefund/CRMService/resources/tr.json`:

```json
{
  "FranchiseHqs.New": "Yeni franchise merkezi",
  "FranchiseHqs.Form.name": "Merkez adı",
  "FranchiseHqs.Form.externalIdentifier": "Dış tanımlayıcı",
  "FranchiseHqs.column.countryCount": "Ülkeler",
  "FranchiseHqs.Tab.Details": "Detaylar",
  "FranchiseHqs.Tab.Countries": "Ülkeler",
  "FranchiseHqs.BackToList": "Franchise merkezlerine dön",
  "FranchiseHqs.Countries.title": "Ülke bağlantıları",
  "FranchiseHqs.Countries.description": "Bu merkezin faaliyet gösterdiği her ülke ve ilgili merkez işletmesi. Kaydetmek tüm listeyi değiştirir.",
  "FranchiseHqs.Countries.countryTenantId": "Ülke",
  "FranchiseHqs.Countries.headquarterMerchantId": "Merkez işletme",
  "FranchiseHqs.Countries.add": "Ülke ekle",
  "FranchiseHqs.Countries.remove": "Ülkeyi kaldır",
  "FranchiseHqs.Countries.empty": "Henüz ülke bağlantısı yok.",
  "FranchiseHqs.Countries.Error.duplicateCountry": "Bu ülke zaten bağlı. Her ülke yalnızca bir kez eklenebilir.",
  "FranchiseHqs.Delete.Title": "Bu franchise merkezi silinsin mi?",
  "FranchiseHqs.Delete.Description": "Merkez ve ülke bağlantıları kaldırılır."
}
```

- [ ] **Step 3: Add the navigation keys**

To `apps/web/src/language-data/core/AbpUiNavigation/resources/en.json`:

```json
{
  "FranchiseHqs": "Franchise HQs",
  "FranchiseHqs.New": "New franchise HQ"
}
```

To `apps/web/src/language-data/core/AbpUiNavigation/resources/tr.json`:

```json
{
  "FranchiseHqs": "Franchise merkezleri",
  "FranchiseHqs.New": "Yeni franchise merkezi"
}
```

- [ ] **Step 4: Regenerate and type-check**

Run: `pnpm run init`
Then: `npm run type-check`
Expected: exactly 2 baseline errors.

- [ ] **Step 5: Verify en/tr parity for both pairs**

Run from `apps/web`:

```bash
node -e "for (const p of ['unirefund/CRMService','core/AbpUiNavigation']) { const a=require('./src/language-data/'+p+'/resources/en.json'),b=require('./src/language-data/'+p+'/resources/tr.json'); const ka=Object.keys(a),kb=Object.keys(b); console.log(p,'en',ka.length,'tr',kb.length,'onlyEn',ka.filter(k=>!kb.includes(k)),'onlyTr',kb.filter(k=>!ka.includes(k))); }"
```

Expected: equal counts and both "only" lists empty, for both pairs. Put the actual output in your report.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/language-data/unirefund/CRMService/resources/en.json apps/web/src/language-data/unirefund/CRMService/resources/tr.json apps/web/src/language-data/core/AbpUiNavigation/resources/en.json apps/web/src/language-data/core/AbpUiNavigation/resources/tr.json
git commit -m "feat(franchise): add i18n keys for the HQ registry"
```

---

### Task 2: HQ list

First working route. After this, `/en/parties/franchise-hqs` renders for a host session; nothing links to it yet.

**Files:**
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/page.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/loading.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/_components/table.tsx`

**Interfaces:**
- Consumes: `requireHost`, `isUnauthorized`, `getFranchiseHqsApi`, `resolveTenantNames`.
- Produces: `FranchiseHqsTable({ hqData, languageData, tenantNames })` — `tenantNames` is `Record<string, string>`.

`resolveTenantNames()` returns a `Map`, which cannot cross the server→client boundary as a prop. Convert with `Object.fromEntries` in the page, exactly as `contracts/franchise/page.tsx` already does.

Unlike `contracts/`, `parties/` has **no group-level `requireHost` layout** — the parties group is not host-only as a whole. So this page calls `requireHost(lang)` itself, and so does every other page in this sub-project.

- [ ] **Step 1: Create the loading skeleton**

Read `apps/web/src/app/[lang]/(main)/(unirefund)/contracts/franchise/loading.tsx` and mirror it exactly — it re-exports the shared spinner.

- [ ] **Step 2: Create the list page**

```tsx
"use server";

import { getFranchiseHqsApi } from "@repo/actions/unirefund/CRMService/actions";
import type { GetApiCrmServiceFranchiseHqsData } from "@repo/saas/CRMService";
import ErrorComponent from "@repo/ui/components/error-component";
import { structuredError } from "@repo/utils/api";
import type { Session } from "@repo/utils/auth";
import { auth } from "@repo/utils/auth/next-auth";
import { isUnauthorized } from "@repo/utils/policies";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { getResourceData } from "@/src/language-data/unirefund/CRMService";
import { requireHost } from "@/utils/require-host";
import { resolveTenantNames } from "@/utils/resolve-tenant-names";
import { FranchiseHqsTable } from "./_components/table";

interface SearchParamType {
  maxResultCount?: number;
  skipCount?: number;
  name?: string;
}

async function getApiRequests(
  filters: GetApiCrmServiceFranchiseHqsData,
  session: Session | null
) {
  try {
    const requiredRequests = await Promise.all([
      getFranchiseHqsApi(filters, session),
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
  await requireHost(lang);
  await isUnauthorized({
    requiredPolicies: ["CRMService.FranchiseHqs.ViewList"],
    lang,
  });

  const searchs = await searchParams;
  const { languageData } = await getResourceData(lang);
  const session = await auth();

  const apiRequests = await getApiRequests(
    {
      maxResultCount: searchs?.maxResultCount || 10,
      skipCount: searchs?.skipCount || 0,
      name: searchs?.name,
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

  const [hqResponse] = apiRequests.requiredRequests;
  // CRMService returns bare tenant ids on country links; names come from SaaS.
  const tenantNames = await resolveTenantNames();

  return (
    <FranchiseHqsTable
      hqData={hqResponse.data}
      languageData={languageData}
      tenantNames={Object.fromEntries(tenantNames)}
    />
  );
}
```

- [ ] **Step 3: Create the list table**

Follow `apps/web/src/app/[lang]/(main)/(unirefund)/contracts/franchise/_components/table.tsx` for the `MasterDataGrid` shape.

```tsx
"use client";

import {
  MasterDataGrid,
  RowLink,
} from "@repo/ayasofyazilim-ui/custom/master-data-grid";
import {
  $UniRefund_CRMService_FranchiseHqs_FranchiseHqDto as $FranchiseHqDto,
  type PagedResultDto_FranchiseHqDto,
} from "@repo/saas/CRMService";
import { isActionGranted, useGrantedPolicies } from "@repo/utils/policies";
import { PlusCircle } from "lucide-react";
import { useParams } from "next/navigation";
import { useTenant } from "@/providers/tenant";
import type { CRMServiceResource } from "@/language-data/unirefund/CRMService";

export function FranchiseHqsTable({
  hqData,
  languageData,
  tenantNames,
}: {
  hqData: PagedResultDto_FranchiseHqDto;
  languageData: CRMServiceResource;
  tenantNames: Record<string, string>;
}) {
  const { lang } = useParams<{ lang: string }>();
  const { localization } = useTenant();
  const { grantedPolicies } = useGrantedPolicies();

  return (
    <MasterDataGrid
      data={hqData.items || []}
      config={{
        localization,
        schema: $FranchiseHqDto,
        schemaColumns: {
          mode: "include",
          columns: ["name", "externalIdentifier", "countries"],
        },
        t: {
          ...languageData,
          "column.name": languageData["FranchiseHqs.Form.name"],
          "column.externalIdentifier":
            languageData["FranchiseHqs.Form.externalIdentifier"],
          "column.countries": languageData["FranchiseHqs.column.countryCount"],
        },
        rowCount: hqData.totalCount,
        customRenderers: {
          name: ({ row }) => (
            <RowLink
              href={`/${lang}/parties/franchise-hqs/${row.original.id}/details`}
              label={row.original.name}
            />
          ),
          // The list already carries the links, so the summary needs no extra fetch.
          countries: ({ row }) => {
            const links = row.original.countries ?? [];
            if (links.length === 0) {
              return languageData["FranchiseHqs.Countries.empty"];
            }
            return links
              .map(
                (link) =>
                  tenantNames[link.countryTenantId ?? ""] ??
                  link.countryTenantId ??
                  ""
              )
              .join(", ");
          },
        },
        tableActions: [
          {
            id: "create",
            type: "link",
            icon: PlusCircle,
            label: languageData["FranchiseHqs.New"],
            href: `/${lang}/parties/franchise-hqs/new`,
            hidden: () =>
              !isActionGranted(["CRMService.FranchiseHqs.Create"], grantedPolicies),
          },
        ],
      }}
    />
  );
}
```

If `customRenderers` does not accept the `({ row })` shape for these ids, read `contracts/franchise/_components/table.tsx` and match it exactly rather than guessing. Do not cast to `any`.

- [ ] **Step 4: Verify types and lint**

Run: `npm run type-check` — expected: exactly 2 baseline errors.
Run: `npm run lint` — expected: 0 errors, no new warnings in your files.

- [ ] **Step 5: Confirm the unit suite is untouched**

Run: `npm run test:unit` — expected: 68 tests / 13 suites, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/page.tsx" "apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/loading.tsx" "apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/_components/table.tsx"
git commit -m "feat(franchise): add franchise HQ list"
```

---

### Task 3: Create page

**Files:**
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/new/page.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/new/loading.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/new/_components/form.tsx`

**Interfaces:**
- Consumes: `requireHost`, `isUnauthorized`, `postFranchiseHqApi`.
- Produces: nothing consumed elsewhere.

`FranchiseHqCreateDto` accepts an optional `countries` array, but this form deliberately does **not** offer it: country links need a tenant picker and a merchant picker per row, which is the whole of Task 5. Create the HQ first, then link countries on its own tab. Keep the create form to `name` and `externalIdentifier`.

- [ ] **Step 1: Create the loading skeleton**

Mirror `apps/web/src/app/[lang]/(main)/(unirefund)/contracts/franchise/new/loading.tsx`.

- [ ] **Step 2: Create the page**

```tsx
"use server";

import { isUnauthorized } from "@repo/utils/policies";
import { getResourceData } from "@/src/language-data/unirefund/CRMService";
import { requireHost } from "@/utils/require-host";
import FranchiseHqCreateForm from "./_components/form";

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  await requireHost(lang);
  await isUnauthorized({
    requiredPolicies: ["CRMService.FranchiseHqs.Create"],
    lang,
  });

  const { languageData } = await getResourceData(lang);

  return <FranchiseHqCreateForm languageData={languageData} />;
}
```

This page fetches nothing, so it needs no `getApiRequests` block or `ErrorComponent`.

- [ ] **Step 3: Create the form**

```tsx
"use client";
"use no memo";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useForm,
} from "@repo/ayasofyazilim-ui/components/form";
import { Input } from "@repo/ayasofyazilim-ui/components/input";
import { z, zodResolver } from "@repo/ayasofyazilim-ui/lib/zod";
import { postFranchiseHqApi } from "@repo/actions/unirefund/CRMService/post-actions";
import { handlePostResponse } from "@repo/utils/api";
import { useParams, useRouter } from "next/navigation";
import { useTransition } from "react";
import type { CRMServiceResource } from "@/language-data/unirefund/CRMService";

const createFormSchema = z.object({
  name: z.string().min(2).max(256),
  externalIdentifier: z.string().max(128).optional(),
});

export default function FranchiseHqCreateForm({
  languageData,
}: {
  languageData: CRMServiceResource;
}) {
  const router = useRouter();
  const { lang } = useParams<{ lang: string }>();
  const [isPending, startTransition] = useTransition();

  const form = useForm({
    resolver: zodResolver(createFormSchema),
    defaultValues: { name: "", externalIdentifier: "" },
  });

  function onSubmit(values: z.infer<typeof createFormSchema>) {
    startTransition(() => {
      void postFranchiseHqApi({ requestBody: values }).then((response) => {
        handlePostResponse(response, router, {
          prefix: `/${lang}/parties/franchise-hqs`,
          identifier: "id",
        });
      });
    });
  }

  return (
    <Form {...form}>
      <form
        className="flex max-w-xl flex-col gap-4 p-px"
        data-testid="franchise-hq-create-form"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{languageData["FranchiseHqs.Form.name"]}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  data-testid="franchise-hq-name"
                  disabled={isPending}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="externalIdentifier"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {languageData["FranchiseHqs.Form.externalIdentifier"]}
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  data-testid="franchise-hq-external-identifier"
                  disabled={isPending}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          data-testid="franchise-hq-submit"
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

`handlePostResponse` pushes to `${prefix}/${id}`, landing on `/parties/franchise-hqs/{id}` — the `[partyId]` route Task 4 creates. Task 4's layout redirects that bare id to the `details` tab.

- [ ] **Step 4: Verify types and lint**

Run: `npm run type-check` — expected: exactly 2 baseline errors.
Run: `npm run lint` — expected: 0 errors, no new warnings in your files.

- [ ] **Step 5: Confirm the unit suite is untouched**

Run: `npm run test:unit` — expected: 68 / 13 / 0 fail.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/new"
git commit -m "feat(franchise): add franchise HQ create form"
```

---

### Task 4: `[partyId]` shell, details tab, and delete

**Files:**
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/[partyId]/layout.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/[partyId]/loading.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/[partyId]/page.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/[partyId]/_components/delete-hq.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/[partyId]/details/page.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/[partyId]/details/loading.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/[partyId]/details/_components/form.tsx`

**Interfaces:**
- Consumes: `requireHost`, `isUnauthorized`, `getFranchiseHqByIdApi`, `putFranchiseHqByIdApi`, `deleteFranchiseHqByIdApi`.
- Produces: the tab shell every later tab renders inside. Task 5 adds a `countries` tab entry to the same `items` array; sub-project 2 adds a `contracts` entry.

**Ship exactly ONE tab here — `details`.** Task 5 adds the `countries` tab entry in the same commit that creates the `countries` route, so no commit in this history ever ships a tab pointing at a route that does not exist. This mirrors the rule already used for the sidebar in this area: the link lands with its target, never before it. Do **not** list a `countries` tab, and do **not** list a `contracts` tab — that one waits for sub-project 2.

- [ ] **Step 1: Create the bare `[partyId]/page.tsx` that redirects to the details tab**

`handlePostResponse` lands on `/parties/franchise-hqs/{id}` after create, and the row link could too. Give that path a home rather than a 404:

```tsx
import { redirect } from "next/navigation";

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string; partyId: string }>;
}) {
  const { lang, partyId } = await params;
  redirect(`/${lang}/parties/franchise-hqs/${partyId}/details`);
}
```

- [ ] **Step 2: Create the loading skeleton**

Mirror `contracts/franchise/loading.tsx`.

- [ ] **Step 3: Create the layout**

Follow `parties/merchants/[partyId]/contracts/[contractId]/layout.tsx` for the `SidebarTemplate` shape.

```tsx
"use server";
import { getFranchiseHqByIdApi } from "@repo/actions/unirefund/CRMService/actions";
import {
  SidebarMenuButton,
  SidebarTrigger,
} from "@repo/ayasofyazilim-ui/components/sidebar";
import ErrorComponent from "@repo/ui/components/error-component";
import { structuredError } from "@repo/utils/api";
import { auth } from "@repo/utils/auth/next-auth";
import { isUnauthorized } from "@repo/utils/policies";
import { ArrowLeft, Landmark } from "lucide-react";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import Link from "next/link";
import { BreadcrumbTitle } from "@/src/components/sidebar-layout/breadcrumb/title";
import { SidebarTemplate } from "@/src/components/sidebar-template";
import { getResourceData } from "@/src/language-data/unirefund/CRMService";
import { requireHost } from "@/utils/require-host";
import DeleteFranchiseHqDialog from "./_components/delete-hq";

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

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string; partyId: string }>;
}) {
  const { lang, partyId } = await params;
  await requireHost(lang);
  await isUnauthorized({
    requiredPolicies: ["CRMService.FranchiseHqs.View"],
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
  const hq = hqResponse.data;
  const baseLink = `/${lang}/parties/franchise-hqs/${partyId}/`;

  return (
    <div className="stp-0 flex-1 relative">
      <BreadcrumbTitle
        replacements={{
          find: partyId,
          title: hq.name ?? partyId,
          href: `${baseLink}details`,
        }}
      />
      <SidebarTemplate
        header={
          <>
            <SidebarMenuButton
              asChild
              name="franchise-hq-details"
              tooltip={languageData["FranchiseHqs.BackToList"]}
            >
              <Link
                className="flex rounded-md"
                data-testid="back-to-list"
                href={`/${lang}/parties/franchise-hqs`}
              >
                <ArrowLeft className="size-4" />
                <span className="w-full truncate">
                  {languageData["FranchiseHqs.BackToList"]}
                </span>
              </Link>
            </SidebarMenuButton>
            <SidebarMenuButton
              className="bg-transparent!"
              name="franchise-hq-details"
              tooltip={hq.name ?? ""}
            >
              <Landmark className="size-4" />
              <span className="w-full truncate font-bold capitalize">
                {hq.name}
              </span>
            </SidebarMenuButton>
          </>
        }
        items={[
          {
            id: "details",
            name: languageData["FranchiseHqs.Tab.Details"],
            icon: "FileText",
            action: `${baseLink}details`,
            permissions: ["CRMService.FranchiseHqs.View"],
          },
        ]}
        footer={
          <DeleteFranchiseHqDialog
            hqId={partyId}
            languageData={languageData}
          />
        }
        name="franchise-hq-details"
      >
        <SidebarTrigger
          className="fixed bg-background md:hidden shadow-xs border z-50 right-2"
          name="franchise-hq-details"
        />
        {children}
      </SidebarTemplate>
    </div>
  );
}
```

`"FileText"` and `"Globe"` are both already used as icon names elsewhere in this app, so they are valid `keyof typeof LucideIcons`.

- [ ] **Step 4: Create the delete dialog**

Follow `contracts/franchise/[contractId]/_components/delete-contract.tsx`. Note the **absolute** redirect target — a relative `"../"` from a tab route lands on the wrong depth.

```tsx
"use client";
import { deleteFranchiseHqByIdApi } from "@repo/actions/unirefund/CRMService/delete-actions";
import { SidebarMenuButton } from "@repo/ayasofyazilim-ui/components/sidebar";
import ConfirmDialog from "@repo/ayasofyazilim-ui/custom/confirm-dialog";
import { handleDeleteResponse } from "@repo/utils/api";
import { isActionGranted, useGrantedPolicies } from "@repo/utils/policies";
import { Trash } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useTransition } from "react";
import type { CRMServiceResource } from "@/language-data/unirefund/CRMService";

export default function DeleteFranchiseHqDialog({
  hqId,
  languageData,
}: {
  hqId: string;
  languageData: CRMServiceResource;
}) {
  const router = useRouter();
  const { lang } = useParams<{ lang: string }>();
  const { grantedPolicies } = useGrantedPolicies();
  const [isPending, startTransition] = useTransition();

  if (!isActionGranted(["CRMService.FranchiseHqs.Delete"], grantedPolicies)) {
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
            // Whether an HQ with contracts or statements may be deleted is the
            // backend's call; surface whatever it returns rather than guessing.
            void deleteFranchiseHqByIdApi(hqId).then((response) => {
              handleDeleteResponse(
                response,
                router,
                `/${lang}/parties/franchise-hqs`
              );
            });
          });
        },
      }}
      description={languageData["FranchiseHqs.Delete.Description"]}
      title={languageData["FranchiseHqs.Delete.Title"]}
      type="without-trigger"
    >
      <SidebarMenuButton
        className="text-destructive hover:text-destructive focus-visible:text-destructive"
        data-testid="franchise-hq-delete"
        disabled={isPending}
        name="franchise-hq-details"
        tooltip={languageData.Delete}
      >
        <Trash className="w-4" />
        <span>{languageData.Delete}</span>
      </SidebarMenuButton>
    </ConfirmDialog>
  );
}
```

- [ ] **Step 5: Create the details page and its loading skeleton**

`details/loading.tsx` mirrors the others. `details/page.tsx`:

```tsx
"use server";

import { getFranchiseHqByIdApi } from "@repo/actions/unirefund/CRMService/actions";
import ErrorComponent from "@repo/ui/components/error-component";
import { structuredError } from "@repo/utils/api";
import { auth } from "@repo/utils/auth/next-auth";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { getResourceData } from "@/src/language-data/unirefund/CRMService";
import FranchiseHqDetailsForm from "./_components/form";

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

  return (
    <FranchiseHqDetailsForm
      hq={hqResponse.data}
      hqId={partyId}
      languageData={languageData}
    />
  );
}
```

The layout already ran `requireHost` and the `View` policy check for this whole subtree, so the tab pages do not repeat them.

- [ ] **Step 6: Create the details form**

```tsx
"use client";
"use no memo";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useForm,
} from "@repo/ayasofyazilim-ui/components/form";
import { Input } from "@repo/ayasofyazilim-ui/components/input";
import { z, zodResolver } from "@repo/ayasofyazilim-ui/lib/zod";
import { putFranchiseHqByIdApi } from "@repo/actions/unirefund/CRMService/put-actions";
import type { UniRefund_CRMService_FranchiseHqs_FranchiseHqDto as FranchiseHqDto } from "@repo/saas/CRMService";
import { handlePutResponse } from "@repo/utils/api";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { CRMServiceResource } from "@/language-data/unirefund/CRMService";

const updateFormSchema = z.object({
  name: z.string().min(2).max(256),
  externalIdentifier: z.string().max(128).optional(),
});

export default function FranchiseHqDetailsForm({
  hq,
  hqId,
  languageData,
}: {
  hq: FranchiseHqDto;
  hqId: string;
  languageData: CRMServiceResource;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm({
    resolver: zodResolver(updateFormSchema),
    defaultValues: {
      name: hq.name ?? "",
      externalIdentifier: hq.externalIdentifier ?? "",
    },
  });

  function onSubmit(values: z.infer<typeof updateFormSchema>) {
    startTransition(() => {
      void putFranchiseHqByIdApi({ id: hqId, requestBody: values }).then(
        (response) => {
          handlePutResponse(response, router);
        }
      );
    });
  }

  return (
    <Form {...form}>
      <form
        className="flex max-w-xl flex-col gap-4 p-px"
        data-testid="franchise-hq-details-form"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{languageData["FranchiseHqs.Form.name"]}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  data-testid="franchise-hq-name"
                  disabled={isPending}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="externalIdentifier"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {languageData["FranchiseHqs.Form.externalIdentifier"]}
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  data-testid="franchise-hq-external-identifier"
                  disabled={isPending}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          className="max-w-xs"
          data-testid="franchise-hq-submit"
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

Note `putFranchiseHqByIdApi` takes `{ id, requestBody }`, and `FranchiseHqUpdateDto` has **no** `countries` field — country links are set only through the separate endpoint in Task 5. Do not try to send them here.

- [ ] **Step 7: Verify types and lint**

Run: `npm run type-check` — expected: exactly 2 baseline errors.
Run: `npm run lint` — expected: 0 errors, no new warnings in your files.

- [ ] **Step 8: Confirm the unit suite is untouched**

Run: `npm run test:unit` — expected: 68 / 13 / 0 fail.

- [ ] **Step 9: Commit**

```bash
git add "apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/[partyId]"
git commit -m "feat(franchise): add franchise HQ shell, details tab and delete"
```

---

### Task 5: Country links tab

The only task with real logic, and the only one with unit tests. Each link pairs a country (a SaaS tenant) with that country's HEADQUARTER merchant, and the whole set is submitted as one idempotent replace.

**Files:**
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/_components/country-links.ts`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/_components/country-links.test.ts`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/[partyId]/countries/page.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/[partyId]/countries/loading.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/[partyId]/countries/_components/form.tsx`

**Interfaces:**
- Consumes: `getFranchiseHqByIdApi`, `getPublicTenantsApi`, `getMerchantsApi`, `putFranchiseHqCountriesByIdApi`.
- Produces:
  - `interface CountryLinkRow { countryTenantId: string; headquarterMerchantId: string }`
  - `function findDuplicateCountryIndexes(rows: readonly CountryLinkRow[]): number[]` — indexes of every row whose `countryTenantId` appeared earlier in the array. Empty when there are no duplicates.

A country may be linked only once per HQ. That is a cross-row rule over an array — a pure function, testable by `node --test` with no DOM.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/_components/country-links.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findDuplicateCountryIndexes } from "./country-links";

const row = (countryTenantId: string, headquarterMerchantId = "m1") => ({
  countryTenantId,
  headquarterMerchantId,
});

describe("findDuplicateCountryIndexes", () => {
  it("returns nothing for an empty set", () => {
    assert.deepEqual(findDuplicateCountryIndexes([]), []);
  });

  it("returns nothing when every country is distinct", () => {
    assert.deepEqual(
      findDuplicateCountryIndexes([row("tr"), row("es"), row("no")]),
      []
    );
  });

  it("flags the second occurrence, not the first", () => {
    assert.deepEqual(findDuplicateCountryIndexes([row("tr"), row("tr")]), [1]);
  });

  it("flags every repeat beyond the first", () => {
    assert.deepEqual(
      findDuplicateCountryIndexes([row("tr"), row("tr"), row("tr")]),
      [1, 2]
    );
  });

  it("flags duplicates that are not adjacent", () => {
    assert.deepEqual(
      findDuplicateCountryIndexes([row("tr"), row("es"), row("tr")]),
      [2]
    );
  });

  it("ignores the merchant when deciding what is a duplicate", () => {
    // The same country twice is invalid even with different merchants.
    assert.deepEqual(
      findDuplicateCountryIndexes([row("tr", "m1"), row("tr", "m2")]),
      [1]
    );
  });

  it("does not treat blank rows as duplicates of each other", () => {
    // A freshly added row has no country picked yet; two of them must not
    // light up as a conflict before the user has chosen anything.
    assert.deepEqual(findDuplicateCountryIndexes([row(""), row("")]), []);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --import tsx --test "src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/_components/country-links.test.ts"`

Expected: FAIL — cannot find module `./country-links`.

Note the path contains `[lang]` and `(main)`. Quote it. A run reporting `# tests 0` means the file was not found, which is a failure to invoke, not a pass.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/_components/country-links.ts`:

```ts
export interface CountryLinkRow {
  countryTenantId: string;
  headquarterMerchantId: string;
}

/**
 * Indexes of rows whose country was already used by an earlier row.
 *
 * The first occurrence is never flagged — the duplicate is the later one, so
 * that is where the error belongs. Rows with no country chosen yet are
 * skipped: a form starts a new row blank, and two blank rows are not a
 * conflict the user can act on.
 */
export function findDuplicateCountryIndexes(
  rows: readonly CountryLinkRow[]
): number[] {
  const seen = new Set<string>();
  const duplicates: number[] = [];

  rows.forEach((row, index) => {
    if (!row.countryTenantId) return;
    if (seen.has(row.countryTenantId)) {
      duplicates.push(index);
      return;
    }
    seen.add(row.countryTenantId);
  });

  return duplicates;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `node --import tsx --test "src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/_components/country-links.test.ts"`
Expected: PASS, 7 tests.

- [ ] **Step 5: Create the loading skeleton and the page**

`countries/loading.tsx` mirrors the others. `countries/page.tsx`:

```tsx
"use server";

import {
  getFranchiseHqByIdApi,
  getMerchantsApi,
} from "@repo/actions/unirefund/CRMService/actions";
import { getPublicTenantsApi } from "@repo/actions/core/SaasService/actions";
import ErrorComponent from "@repo/ui/components/error-component";
import { structuredError } from "@repo/utils/api";
import { auth } from "@repo/utils/auth/next-auth";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { getResourceData } from "@/src/language-data/unirefund/CRMService";
import FranchiseHqCountriesForm from "./_components/form";

async function getApiRequests(partyId: string) {
  try {
    const session = await auth();
    const requiredRequests = await Promise.all([
      getFranchiseHqByIdApi({ id: partyId }, session),
      // The link's merchant is that country's HEADQUARTER, matching how
      // finance/rebate-statements/new/page.tsx fetches its merchant list.
      getMerchantsApi(
        { typeCodes: ["HEADQUARTER"], maxResultCount: 999 },
        session
      ),
      getPublicTenantsApi(),
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

  const [hqResponse, merchantsResponse, tenantsResponse] =
    apiRequests.requiredRequests;

  // getPublicTenantsApi RETURNS its error rather than throwing, so the catch
  // above does not cover it; the same idiom is at (auth)/login/page.tsx:17.
  const tenants =
    tenantsResponse.type === "success" ? tenantsResponse.data.items ?? [] : [];

  return (
    <FranchiseHqCountriesForm
      hq={hqResponse.data}
      hqId={partyId}
      languageData={languageData}
      merchants={merchantsResponse.data.items ?? []}
      tenants={tenants}
    />
  );
}
```

- [ ] **Step 6: Create the country-links form**

`useFieldArray` over the rows, a `Combobox` per cell, and the duplicate rule surfaced per row. Follow `contracts/franchise/_components/fee-brackets-table.tsx` for the row-table idiom and `contracts/franchise/new/_components/form.tsx` for the `Combobox` wiring — note that a `Combobox` needs a matching **`id`** to get a usable `data-testid`.

```tsx
"use client";
"use no memo";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
  useFieldArray,
  useForm,
} from "@repo/ayasofyazilim-ui/components/form";
import { Label } from "@repo/ayasofyazilim-ui/components/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ayasofyazilim-ui/components/table";
import { Combobox } from "@repo/ayasofyazilim-ui/custom/combobox";
import { z, zodResolver } from "@repo/ayasofyazilim-ui/lib/zod";
import { putFranchiseHqCountriesByIdApi } from "@repo/actions/unirefund/CRMService/put-actions";
import type {
  UniRefund_CRMService_FranchiseHqs_FranchiseHqDto as FranchiseHqDto,
  UniRefund_CRMService_Merchants_MerchantListResponseDto as MerchantDto,
} from "@repo/saas/CRMService";
import type { UniRefund_SaasService_Tenants_TenantPublicDto as TenantPublicDto } from "@repo/core-saas/SaasService";
import { handlePutResponse } from "@repo/utils/api";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { CRMServiceResource } from "@/language-data/unirefund/CRMService";
import { findDuplicateCountryIndexes } from "../../../_components/country-links";

export default function FranchiseHqCountriesForm({
  hq,
  hqId,
  languageData,
  merchants,
  tenants,
}: {
  hq: FranchiseHqDto;
  hqId: string;
  languageData: CRMServiceResource;
  merchants: MerchantDto[];
  tenants: TenantPublicDto[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const formSchema = z.object({
    countries: z
      .array(
        z.object({
          countryTenantId: z.guid(),
          headquarterMerchantId: z.guid(),
        })
      )
      .superRefine((rows, ctx) => {
        for (const index of findDuplicateCountryIndexes(rows)) {
          ctx.addIssue({
            code: "custom",
            message:
              languageData["FranchiseHqs.Countries.Error.duplicateCountry"],
            path: [index, "countryTenantId"],
          });
        }
      }),
  });

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      countries: (hq.countries ?? []).map((link) => ({
        countryTenantId: link.countryTenantId ?? "",
        headquarterMerchantId: link.headquarterMerchantId ?? "",
      })),
    },
  });

  const { control } = form;
  const { fields, append, remove } = useFieldArray({
    control,
    name: "countries",
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    startTransition(() => {
      // Full replace: links absent from this list are removed by the backend.
      void putFranchiseHqCountriesByIdApi({
        id: hqId,
        requestBody: { countries: values.countries },
      }).then((response) => {
        handlePutResponse(response, router);
      });
    });
  }

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4 p-px"
        data-testid="franchise-hq-countries-form"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <div className="space-y-1">
          <Label>{languageData["FranchiseHqs.Countries.title"]}</Label>
          <p className="text-muted-foreground text-sm">
            {languageData["FranchiseHqs.Countries.description"]}
          </p>
        </div>

        <div className="flex justify-end">
          <Button
            data-testid="franchise-hq-country-add"
            disabled={isPending}
            onClick={() => {
              append({ countryTenantId: "", headquarterMerchantId: "" });
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            <Plus className="size-4" />
            {languageData["FranchiseHqs.Countries.add"]}
          </Button>
        </div>

        {fields.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {languageData["FranchiseHqs.Countries.empty"]}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  {languageData["FranchiseHqs.Countries.countryTenantId"]}
                </TableHead>
                <TableHead>
                  {
                    languageData[
                      "FranchiseHqs.Countries.headquarterMerchantId"
                    ]
                  }
                </TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((field, index) => (
                <TableRow key={field.id}>
                  <TableCell>
                    <FormField
                      control={control}
                      name={`countries.${index}.countryTenantId`}
                      render={({ field: input }) => (
                        <FormItem>
                          <FormControl>
                            <Combobox<TenantPublicDto>
                              disabled={isPending}
                              emptyValue={languageData["Select.EmptyValue"]}
                              id={`franchise-hq-country-${index}`}
                              list={tenants}
                              onValueChange={(value) => {
                                input.onChange(value?.id || "");
                              }}
                              searchPlaceholder={
                                languageData["Select.Placeholder"]
                              }
                              searchResultLabel={
                                languageData["Select.ResultLabel"]
                              }
                              selectIdentifier="id"
                              selectLabel="name"
                              value={tenants.find((t) => t.id === input.value)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </TableCell>
                  <TableCell>
                    <FormField
                      control={control}
                      name={`countries.${index}.headquarterMerchantId`}
                      render={({ field: input }) => (
                        <FormItem>
                          <FormControl>
                            <Combobox<MerchantDto>
                              disabled={isPending}
                              emptyValue={languageData["Select.EmptyValue"]}
                              id={`franchise-hq-merchant-${index}`}
                              list={merchants}
                              onValueChange={(value) => {
                                input.onChange(value?.id || "");
                              }}
                              searchPlaceholder={
                                languageData["Select.Placeholder"]
                              }
                              searchResultLabel={
                                languageData["Select.ResultLabel"]
                              }
                              selectIdentifier="id"
                              selectLabel="name"
                              value={merchants.find(
                                (m) => m.id === input.value
                              )}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      data-testid={`franchise-hq-country-${index}-remove`}
                      disabled={isPending}
                      onClick={() => {
                        remove(index);
                      }}
                      size="icon"
                      title={languageData["FranchiseHqs.Countries.remove"]}
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Button
          className="max-w-xs"
          data-testid="franchise-hq-countries-submit"
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

Two facts already verified for you — do not re-derive them: `MerchantListResponseDto` exposes `id?: string` and `name: string`, so `selectIdentifier="id"` / `selectLabel="name"` is correct as written; and `z.guid()` is the right call for this codebase (zod 4.1.13, already used in `settings/templates/*/schema.ts`) — do not switch to `z.string().uuid()`.

- [ ] **Step 7: Add the `countries` tab to the HQ layout**

The layout created earlier ships only a `details` tab, deliberately — a tab lands with its route, never before it. Now that the route exists, add the second entry to the `items` array in
`apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/[partyId]/layout.tsx`, immediately after the `details` entry:

```ts
          {
            id: "countries",
            name: languageData["FranchiseHqs.Tab.Countries"],
            icon: "Globe",
            action: `${baseLink}countries`,
            permissions: ["CRMService.FranchiseHqs.SetCountries"],
          },
```

This is the only edit this task makes to a file another task created. Change nothing else in that layout.

- [ ] **Step 8: Verify types, lint and the full suite**

Run: `npm run type-check` — expected: exactly 2 baseline errors.
Run: `npm run lint` — expected: 0 errors, no new warnings in your files.
Run: `npm run test:unit` — expected: **75 tests / 14 suites** (68 + 7 new), 0 fail.

- [ ] **Step 9: Commit**

```bash
git add "apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/_components/country-links.ts" "apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/_components/country-links.test.ts" "apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/[partyId]/countries" "apps/web/src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/[partyId]/layout.tsx"
git commit -m "feat(franchise): add franchise HQ country links tab"
```

---

### Task 6: Nav entry, E2E spec, acceptance

Makes the HQ registry reachable. Everything behind the link now works.

**Files:**
- Modify: `apps/web/src/components/sidebar-layout/data.ts`
- Create: `apps/web/tests/unirefund/parties/franchise-hqs/create.franchise.hq.spec.ts`

**Interfaces:**
- Consumes: the `hostOnly` field and the `isHost` filter, both already built.
- Produces: nothing.

- [ ] **Step 1: Add the nav entry**

Insert into the **existing** `parties` group's `items` array in `data.ts` — do not create a new top-level group. Place it after the last existing entry in that group.

```ts
{
  key: "parties/franchise-hqs",
  displayName: "FranchiseHqs",
  href: "parties/franchise-hqs",
  icon: "Landmark",
  hostOnly: true,
  policies: ["CRMService.FranchiseHqs", "CRMService.FranchiseHqs.ViewList"],
  actions: [
    {
      key: "parties/franchise-hqs/new",
      displayName: "FranchiseHqs.New",
      description: "FranchiseHqs.New",
      href: "parties/franchise-hqs/new",
      icon: "DiamondPlus",
      hostOnly: true,
      policies: ["CRMService.FranchiseHqs.Create"],
    },
  ],
},
```

`hostOnly: true` on both the leaf and its action. The `parties` group itself must **not** gain `hostOnly` — the rest of the group is visible to tenant sessions, and flagging the group would hide all of it.

`"Landmark"`, `"DiamondPlus"`, `"FileText"` and `"Globe"` are all already used elsewhere in this same `data.ts`, so they are known-valid `lucide-react` exports under the pinned version — no icon verification needed.

- [ ] **Step 2: Verify types and lint**

Run: `pnpm run init` then `npm run type-check` — expected: exactly 2 baseline errors.
Run: `npm run lint` — expected: 0 errors.

- [ ] **Step 3: Write the E2E spec**

Read `apps/web/tests/unirefund/parties/merchants/new/create.merchant.spec.ts` and the `_support/` helpers (`app-ready`, `expect-toast`, `retry-utils`) first, then mirror that structure.

Use the test ids the forms actually render: `franchise-hq-create-form`, `franchise-hq-name`, `franchise-hq-external-identifier`, `franchise-hq-submit`, and for the countries tab `franchise-hq-country-add`, `franchise-hq-country-0`, `franchise-hq-merchant-0`, `franchise-hq-countries-submit`.

Two scenarios:
1. Create an HQ with a name and external identifier, assert the success toast and that the URL moves to the HQ's own page.
2. On that HQ's countries tab, add one link, pick a country and a merchant, save, and assert the success toast.

The country and merchant fields are `Combobox` widgets, not `<select>` — drive them the way the merchant spec drives comparable widgets.

- [ ] **Step 4: Confirm the spec compiles and is discovered**

The suite cannot run here — `playwright.config.ts` takes `baseURL` from `TEST_LOCAL_URL` / `TEST_DEV_URL`, which are unset, and the flow needs an authenticated session.

Run: `npx playwright test --list tests/unirefund/parties/franchise-hqs 2>&1 | tail -20`
Expected: both test titles listed.

**Do not claim the E2E test passed.** Record in your report that it was authored and listed but never executed.

- [ ] **Step 5: Full acceptance**

Run each and put the actual output in your report:

```bash
pnpm run init
npm run type-check                 # exactly 2 baseline errors
npm run test:unit                  # 75 tests / 14 suites / 0 fail
npm run lint                       # 0 errors
```

From the repo root `C:\unirefund\web-app`:

```bash
pnpm run i18n:missing              # no FranchiseHqs.* keys reported
node scripts/check-grid-keys.mjs   # unchanged from baseline
```

- [ ] **Step 6: Verify the new entry is host-gated and the group is not**

```bash
grep -n "hostOnly" apps/web/src/components/sidebar-layout/data.ts
```

Expected: the 2 type-definition lines, the 3 from the `contracts` group added previously, plus the 2 you added — 7 total. Confirm neither of your 2 sits on the `parties` group object itself.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/sidebar-layout/data.ts "apps/web/tests/unirefund/parties/franchise-hqs"
git commit -m "feat(franchise): add host-only HQ registry nav entry and create E2E spec"
```

---

## Self-Review

**1. Spec coverage.** Sub-project 1's spec text: *"Routes: `parties/franchise-hqs/`, `new/`, `[partyId]/{details,countries}`. `[partyId]/layout.tsx` uses `SidebarTemplate` with permission-gated tabs... This sub-project ships two tabs, `details` and `countries`; sub-project 2 adds the third, `contracts`... The countries page pairs a tenant picker with a merchant picker per row and submits `set-countries`... Delete is included, following the existing contract-delete precedent."*

| Spec requirement | Task |
|---|---|
| `parties/franchise-hqs/` list | 2 |
| `new/` | 3 |
| `[partyId]/details` | 4 |
| `[partyId]/countries` | 5 |
| `SidebarTemplate` with permission-gated tabs, two of them | 4 |
| Tab list must not carry `contracts` yet | 4 (stated explicitly) |
| Tenant picker + merchant picker per row, `set-countries` | 5 |
| Merchant picker filtered to HEADQUARTER | 5 |
| Full-replace semantics respected | 5 (whole set submitted; comment states why) |
| Delete included, backend owns the consequences | 4 |
| Host-only | 2, 3, 4 (`requireHost` per page/layout) and 6 (`hostOnly` nav) |
| Tenant names joined client-side | 2 |

Not here, by design: the store tree (no endpoint exists — the spec now records this), and the `contracts` tab (sub-project 2).

**2. Placeholder scan.** No `TBD`, no "add error handling", no "similar to Task N" — Task 4's details form repeats its code in full rather than referring back to Task 3. Two steps ask the implementer to verify something against the codebase (the `customRenderers` signature and `z.guid()`) and report what they found; those are checks with a named fallback, not placeholders. Two other facts the plan originally asked them to check were resolved during self-review instead: `MerchantListResponseDto` genuinely exposes `id` and a required `name`, and `Building2` was replaced with `Landmark` because only the latter is already proven valid in `data.ts`.

**3. Type consistency.**
- `findDuplicateCountryIndexes(rows: readonly CountryLinkRow[]): number[]` is defined in Task 5 and consumed in the same task's `superRefine`.
- `FranchiseHqsTable({ hqData, languageData, tenantNames })` is defined and consumed only in Task 2; `tenantNames` is `Record<string, string>` on both sides, with `Object.fromEntries` at the boundary — a `Map` cannot serialise across it.
- Action call shapes match the committed wrappers exactly: `postFranchiseHqApi({ requestBody })`, `putFranchiseHqByIdApi({ id, requestBody })`, `putFranchiseHqCountriesByIdApi({ id, requestBody })`, `deleteFranchiseHqByIdApi(id)` (bare string), `getFranchiseHqByIdApi({ id }, session)`.
- `DeleteFranchiseHqDialog({ hqId, languageData })` is defined and consumed in Task 4.
- `FranchiseHqCountriesForm({ hq, hqId, languageData, merchants, tenants })` is defined and consumed in Task 5.
- Every `languageData[...]` key read in Tasks 2-5 is written in Task 1; the two nav `displayName` keys read in Task 6 are written in Task 1 Step 3.
- Response handlers match the verb: `handlePostResponse` for the create, `handlePutResponse` for both updates, `handleDeleteResponse` for the delete.

**4. Test-count arithmetic.** 68 → 68 (Tasks 1-4 add none) → 75 (Task 5, +7). Task 6 expects 75 / 14 suites.

**5. Lessons carried forward from the previous sub-project**, each now baked into the plan rather than left to be rediscovered: `Combobox` needs a matching `id` for its testid; `handlePutResponse` is the PUT handler; delete redirects use an absolute path; date and enum values need explicit treatment; and no code anywhere may use `!tenantId` for a host check.

# ApplicationConfiguration in ayasofyazilim-core-project — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the web template off `useTenant` and `useGrantedPolicies` onto the shared `ApplicationConfigurationProvider`, keeping its hardcoded placeholder data intact, so it survives the `web-utils` submodule bump that deletes those hooks.

**Architecture:** Mount `ApplicationConfigurationProvider` with a configuration object that takes `policies`, `user`, `settings` and `features` from `getApplicationConfiguration()` — which fails closed to empty with no backend, exactly as today — and *overrides* `tenant`, `country` and `timeZone` with the placeholder constants this repo already ships. The override is three lines with a comment naming what to delete once a gateway exists, which is the useful seam for a template.

**Tech Stack:** Next.js App Router, React 19, `@repo/utils` (git submodule `web-utils`), `@repo/core-saas` generated SDK.

**Spec:** `docs/superpowers/specs/2026-09-04-application-configuration-provider-design.md`

**Repo findings:** `docs/superpowers/specs/2026-09-07-app-config-template-repo-findings.md`

## Why this plan is not optional

This repo's 18 `useGrantedPolicies` consumers import from `@repo/utils/policies` — the **shared** `web-utils` submodule. Plan 5 deletes that hook there. This repo is not broken today only because it pins `web-utils` at `b8828ad`; the break is armed by any future pointer bump.

## Global Constraints

- **The hardcoded placeholder data stays.** This repo has no backend (confirmed by the user 2026-09-07). Do NOT introduce a live tenant or country fetch, and do NOT let the app fall back to `USD` / `UTC` / null country fields.
- **Policies stay fail-closed.** With no gateway, `getApplicationConfiguration()` resolves to `EMPTY_APPLICATION_CONFIGURATION` (`policies: {}`), so every `isActionGranted` returns false — the same behaviour as today's failing `getGrantedPoliciesApi()`. Never invent grants.
- **Call-site style:** flat accessor hooks. `const { tenantName } = useTenantInfo()`, never `useApplicationConfiguration().tenant.name`.
- **No `as` casts at call sites.** The shared contract now types `policies` as `Policies`; if a call site seems to need a cast, the contract is wrong, not the call site.
- **`MasterDataGridResourcesProvider` does not appear in this repo at all (0 usages).** There is nothing to unmount. Do not add it.
- Every task must end with `apps/web` type-checking cleanly. No task may leave the repo non-compiling.
- **There is no app-level unit gate in this repo** — root `unit-test` runs only the `ayasofyazilim-ui` submodule's jest. A production build is the only thing that can catch an RSC boundary or provider-tree mistake, so Task 4 gates on it.

## Measured baselines (do not quote without re-measuring)

| Gate | Command | Baseline |
| --- | --- | --- |
| Type-check | `cd apps/web && pnpm run type-check` | exit 0, 0 errors |
| Lint | `pnpm run lint` (root) | exit 0, 0 errors, 37 warnings |
| Build | `pnpm run build` | must pass; run the `init` script first |

Setup notes: submodules must be initialised before `pnpm install`; `.env` is gitignored and must be copied from `web-app`; the `apps/web` `init` script must run before type-check.

## Dependency

Task 1's submodule bump requires the app-config layer **and** the hook deletion on `web-utils` `main`. Both ship in PR ayasofyazilim-clomerce/web-utils#48. **Task 1 blocks on #48 being merged.** Tasks 2-4 follow from Task 1.

## File Structure

| File | Responsibility |
| --- | --- |
| `packages/utils` (submodule pointer) | Bumped from `b8828ad` to `web-utils` `main` |
| `apps/web/src/providers/placeholder-configuration.ts` | **Create.** The placeholder tenant, country and timeZone constants, in one named place |
| `apps/web/src/providers/providers.tsx` | Modify. Mounts `ApplicationConfigurationProvider`; drops the `as Record<Policy, boolean>` cast |
| 18 `useGrantedPolicies` consumers | Modify. Rename-on-destructure onto `useApplicationConfiguration` |
| 17 `useTenant` consumers (18 call sites) | Modify. Onto `useLocalization` / `useTenantInfo` |
| `apps/web/src/app/[lang]/(main)/(core)/account/sessions/sessions-table-data.tsx` | Modify. Repoint the `Localization` **type-only** import |
| `apps/web/src/providers/tenant.tsx` | **Delete** (Task 3) |
| `apps/web/src/providers/configuration.tsx` | **Delete** (Task 3) — dead `ConfigProvider` / `useConfig` stub, 0 consumers |

---

### Task 1: Bump the submodule, mount the provider, migrate the policy consumers

These three must land together. The bump deletes `useGrantedPolicies` from the submodule, so the 18 consumers stop compiling the moment the pointer moves — splitting them would guarantee a non-compiling intermediate. The local `TenantProvider` is untouched by the bump, so `useTenant` keeps working until Task 3.

**Files:**
- Modify: `packages/utils` (submodule pointer)
- Create: `apps/web/src/providers/placeholder-configuration.ts`
- Modify: `apps/web/src/providers/providers.tsx`
- Modify: the 18 files listed under **Step 4** below

**Interfaces:**
- Consumes: `ApplicationConfigurationProvider`, `useApplicationConfiguration`, `ApplicationConfiguration`, `ApplicationConfigurationTenant`, `ApplicationConfigurationCountry` from `@repo/utils/app-config`; `getApplicationConfiguration` from `@repo/utils/app-config/fetch`
- Produces: `PLACEHOLDER_TENANT`, `PLACEHOLDER_COUNTRY`, `PLACEHOLDER_TIME_ZONE` from `@/providers/placeholder-configuration`

- [ ] **Step 1: Bump the submodule pointer**

```bash
cd packages/utils
git fetch origin
git checkout origin/main
cd ../..
git add packages/utils
```

Confirm the app-config layer and the deletion are both present before continuing:

```bash
test -f packages/utils/app-config/provider.tsx && echo "app-config: OK"
test ! -f packages/utils/policies/granted-policies.tsx && echo "deletion: OK"
```

Both must print. If `granted-policies.tsx` still exists, PR #48 has not merged — **stop and report BLOCKED.**

- [ ] **Step 2: Create the placeholder constants**

These values are lifted verbatim from the `defaultTenantData` literal in the current `apps/web/src/providers/tenant.tsx`. They are deliberate placeholders, not a fallback.

Create `apps/web/src/providers/placeholder-configuration.ts`:

```ts
import type {
  ApplicationConfigurationCountry,
  ApplicationConfigurationTenant,
} from "@repo/utils/app-config";

/**
 * This template ships without a backend, so tenant, country and timing are
 * hardcoded rather than fetched. They are placeholders by design: they keep
 * the UI coherent (dates, currency and locale all resolve) where a live fetch
 * would yield nulls, USD and UTC.
 *
 * A deployment that has a gateway deletes the override in providers.tsx and
 * gets these three from getApplicationConfiguration() instead.
 */
export const PLACEHOLDER_TENANT: ApplicationConfigurationTenant = {
  id: "df64152b-9f76-e06b-d43f-3a1bd9644ea9",
  name: "Türkiye",
  isAvailable: true,
  isHost: false,
};

export const PLACEHOLDER_COUNTRY: ApplicationConfigurationCountry = {
  currency: "TRY",
  countryCode2: "TR",
  countryCode3: "TUR",
  countryName: "Türkiye",
};

export const PLACEHOLDER_TIME_ZONE = "Europe/Istanbul";
```

- [ ] **Step 3: Rewrite the provider tree**

Replace the whole body of `apps/web/src/providers/providers.tsx` with:

```tsx
"use server";

import { ApplicationConfigurationProvider } from "@repo/utils/app-config";
import type { ApplicationConfiguration } from "@repo/utils/app-config";
import { getApplicationConfiguration } from "@repo/utils/app-config/fetch";
import { SessionProvider } from "@repo/utils/auth";
import { auth } from "@repo/utils/auth/next-auth";
import {
  PLACEHOLDER_COUNTRY,
  PLACEHOLDER_TENANT,
  PLACEHOLDER_TIME_ZONE,
} from "./placeholder-configuration";
import { TenantProvider } from "./tenant";

interface ProvidersProps {
  children: React.ReactNode;
  lang: string;
}

export default async function Providers({ children, lang }: ProvidersProps) {
  const [session, fetched] = await Promise.all([
    auth(),
    getApplicationConfiguration(),
  ]);

  const configuration: ApplicationConfiguration = {
    ...fetched,
    // No backend in this template: these three are placeholders. Delete this
    // override once a gateway is configured and they arrive from `fetched`.
    tenant: PLACEHOLDER_TENANT,
    country: PLACEHOLDER_COUNTRY,
    timeZone: PLACEHOLDER_TIME_ZONE,
  };

  return (
    <TenantProvider lang={lang}>
      <SessionProvider session={session}>
        <ApplicationConfigurationProvider
          configuration={configuration}
          lang={lang}
        >
          {children}
        </ApplicationConfigurationProvider>
      </SessionProvider>
    </TenantProvider>
  );
}
```

Three things to note:

- `getGrantedPoliciesApi()` and its `as Record<Policy, boolean>` cast are gone. `policies` now comes from `fetched`, already typed `Policies`.
- `TenantProvider` is still mounted. It is removed in Task 3, once nothing reads `useTenant`. Until then both providers write `countryCode2` and `tenantTimeZone` to `localStorage` with identical values — a harmless duplicate write that Task 3 resolves.
- `lang` is passed to both providers on purpose; `TenantProvider` still needs it this task.

- [ ] **Step 4: Migrate the 18 policy consumers**

In each file below, apply exactly two edits.

Replace the import line:

```tsx
import { isActionGranted, useGrantedPolicies } from "@repo/utils/policies";
```

with:

```tsx
import { useApplicationConfiguration } from "@repo/utils/app-config";
import { isActionGranted } from "@repo/utils/policies";
```

Replace the hook call:

```tsx
const { grantedPolicies } = useGrantedPolicies();
```

with:

```tsx
const { policies: grantedPolicies } = useApplicationConfiguration();
```

Renaming on destructure keeps the local name `grantedPolicies`, so **no `isActionGranted(...)` call needs editing.** Do not touch them.

All 18 files are uniform — one `useGrantedPolicies()` call each, all importing `isActionGranted` alongside it:

```
apps/web/src/app/[lang]/(main)/(core)/management/identity/claim-types/[claimTypeId]/_components/form.tsx
apps/web/src/app/[lang]/(main)/(core)/management/identity/claim-types/_components/table.tsx
apps/web/src/app/[lang]/(main)/(core)/management/identity/roles/[roleId]/_components/delete-role.tsx
apps/web/src/app/[lang]/(main)/(core)/management/identity/roles/_components/table.tsx
apps/web/src/app/[lang]/(main)/(core)/management/identity/users/[userId]/_components/delete-user.tsx
apps/web/src/app/[lang]/(main)/(core)/management/identity/users/_components/table.tsx
apps/web/src/app/[lang]/(main)/(core)/management/language-management/language-texts/_components/language-text-edit.tsx
apps/web/src/app/[lang]/(main)/(core)/management/language-management/languages/_components/table.tsx
apps/web/src/app/[lang]/(main)/(core)/management/logs/entity-changes/_components/table.tsx
apps/web/src/app/[lang]/(main)/(core)/management/openiddict/applications/[applicationId]/_components/form.tsx
apps/web/src/app/[lang]/(main)/(core)/management/openiddict/applications/_components/table.tsx
apps/web/src/app/[lang]/(main)/(core)/management/openiddict/scopes/[scopeId]/_components/form.tsx
apps/web/src/app/[lang]/(main)/(core)/management/openiddict/scopes/_components/table.tsx
apps/web/src/app/[lang]/(main)/(core)/management/saas/editions/[editionId]/_components/delete-edition.tsx
apps/web/src/app/[lang]/(main)/(core)/management/saas/tenants/[tenantId]/_components/delete-tenant.tsx
apps/web/src/app/[lang]/(main)/(core)/management/saas/tenants/_components/table.tsx
apps/web/src/components/sidebar-layout/sidebar-layout.tsx
apps/web/src/components/sidebar-template/index.tsx
```

- [ ] **Step 5: Prove the deprecated hook is gone and the app compiles**

```bash
grep -rn "useGrantedPolicies\|GrantedPoliciesProvider\|getGrantedPoliciesApi" apps/web/src
```

Expected: no matches.

```bash
cd apps/web && pnpm run init && pnpm run type-check
```

Expected: exit 0, 0 errors.

- [ ] **Step 6: Commit**

```bash
git add packages/utils apps/web/src
git commit -m "refactor(app-config): adopt ApplicationConfigurationProvider and drop useGrantedPolicies"
```

---

### Task 2: Migrate the `useTenant` consumers

**Files:**
- Modify: the 17 files under **Step 1**, plus `sessions-table-data.tsx` under **Step 2**

**Interfaces:**
- Consumes: `useLocalization`, `useTenantInfo`, and the `Localization` type, all from `@repo/utils/app-config`

- [ ] **Step 1: Migrate the 17 hook consumers**

**16 files read only `localization`.** In each, replace the import:

```tsx
import { useTenant } from "@/providers/tenant";
```

with:

```tsx
import { useLocalization } from "@repo/utils/app-config";
```

and the call:

```tsx
const { localization } = useTenant();
```

with:

```tsx
const localization = useLocalization();
```

Files:

```
apps/web/src/app/[lang]/(main)/(core)/account/security-logs/table.tsx
apps/web/src/app/[lang]/(main)/(core)/account/sessions/table.tsx
apps/web/src/app/[lang]/(main)/(core)/management/identity/claim-types/_components/table.tsx
apps/web/src/app/[lang]/(main)/(core)/management/identity/roles/_components/table.tsx
apps/web/src/app/[lang]/(main)/(core)/management/identity/security-logs/_components/table.tsx
apps/web/src/app/[lang]/(main)/(core)/management/identity/users/[userId]/sessions/_components/table.tsx
apps/web/src/app/[lang]/(main)/(core)/management/identity/users/_components/table.tsx
apps/web/src/app/[lang]/(main)/(core)/management/language-management/language-texts/_components/table.tsx
apps/web/src/app/[lang]/(main)/(core)/management/language-management/languages/_components/table.tsx
apps/web/src/app/[lang]/(main)/(core)/management/logs/audit/_components/table.tsx
apps/web/src/app/[lang]/(main)/(core)/management/logs/entity-changes/_components/table.tsx
apps/web/src/app/[lang]/(main)/(core)/management/openiddict/applications/_components/table.tsx
apps/web/src/app/[lang]/(main)/(core)/management/openiddict/scopes/_components/table.tsx
apps/web/src/app/[lang]/(main)/(core)/management/saas/editions/_components/table.tsx
apps/web/src/app/[lang]/(main)/(core)/management/saas/tenants/_components/table.tsx
apps/web/src/app/[lang]/(main)/(core)/management/text-templates/_components/table.tsx
```

**`management/logs/entity-changes/_components/table.tsx` has TWO `useTenant()` calls** — at roughly lines 23 and 100. Migrate both. It is also one of the Task 1 files, so it will already import from `@repo/utils/app-config`; merge `useLocalization` into that existing import statement rather than adding a duplicate one.

**1 file reads `tenantName`** — `apps/web/src/components/sidebar-layout/nav/main.tsx`, around line 98. Replace the import with:

```tsx
import { useTenantInfo } from "@repo/utils/app-config";
```

and the call:

```tsx
const { tenantName } = useTenant();
```

with:

```tsx
const { tenantName } = useTenantInfo();
```

`useTenantInfo` already normalizes `null` to `""`, so nothing downstream changes.

- [ ] **Step 2: Repoint the type-only import**

`apps/web/src/app/[lang]/(main)/(core)/account/sessions/sessions-table-data.tsx` line 13 imports the **type** and never calls the hook:

```tsx
import type { Localization } from "@/providers/tenant";
```

becomes:

```tsx
import type { Localization } from "@repo/utils/app-config";
```

Both declare `{ locale: string; timeZone: string; lang: string }`, so this is a repoint, not a shape change.

This file is invisible to a `useTenant`-symbol grep. **Grep the import path, not the exported symbol** — that is how it was nearly missed:

```bash
grep -rn "@/providers/tenant" apps/web/src
```

- [ ] **Step 3: Verify only the provider mount still references the old path**

```bash
grep -rn "@/providers/tenant\|useTenant" apps/web/src | grep -v "src/providers/tenant.tsx"
```

Expected: only `apps/web/src/providers/providers.tsx` — its `TenantProvider` mount, removed in Task 3.

Note that `components/auth/login-form.tsx`, `register-form.tsx` and `reset-password-form.tsx` import `TenantSelection` from `./tenant`, which is a **different file** (`components/auth/tenant.tsx`). Leave those alone.

```bash
cd apps/web && pnpm run type-check
```

Expected: exit 0, 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src
git commit -m "refactor(app-config): migrate useTenant consumers to useLocalization and useTenantInfo"
```

---

### Task 3: Delete the superseded providers

**Files:**
- Modify: `apps/web/src/providers/providers.tsx`
- Delete: `apps/web/src/providers/tenant.tsx`
- Delete: `apps/web/src/providers/configuration.tsx`

- [ ] **Step 1: Confirm both are unreferenced**

```bash
grep -rn "@/providers/tenant" apps/web/src | grep -v "src/providers/tenant.tsx"
grep -rn "ConfigProvider\|useConfig" apps/web/src | grep -v "src/providers/configuration.tsx"
```

The first must show only the `TenantProvider` import in `providers.tsx`. The second must show nothing — `ConfigProvider` is a dead stub with no consumers and is never mounted.

- [ ] **Step 2: Unmount `TenantProvider`**

In `apps/web/src/providers/providers.tsx`, delete the `import { TenantProvider } from "./tenant";` line and unwrap the element, leaving:

```tsx
  return (
    <SessionProvider session={session}>
      <ApplicationConfigurationProvider
        configuration={configuration}
        lang={lang}
      >
        {children}
      </ApplicationConfigurationProvider>
    </SessionProvider>
  );
```

`lang` is still used — `ApplicationConfigurationProvider` takes it. Do not remove it from `ProvidersProps`.

- [ ] **Step 3: Delete both files**

```bash
git rm apps/web/src/providers/tenant.tsx apps/web/src/providers/configuration.tsx
```

The `localStorage` writes for `countryCode2` and `tenantTimeZone` are not lost — `ApplicationConfigurationProvider` performs both, now sourced from `PLACEHOLDER_COUNTRY` and `PLACEHOLDER_TIME_ZONE`.

- [ ] **Step 4: Verify**

```bash
grep -rn "useTenant\|TenantProvider\|useGrantedPolicies\|GrantedPoliciesProvider" apps/web/src | grep -v "TenantSelection"
```

Expected: no matches.

```bash
cd apps/web && pnpm run type-check
```

Expected: exit 0, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "refactor(app-config): delete the superseded tenant and configuration providers"
```

---

### Task 4: Verify the whole change

No files change in this task. If a gate fails, report it rather than fixing it here.

- [ ] **Step 1: Type-check**

```bash
cd apps/web && pnpm run type-check
```

Expected: exit 0, 0 errors (baseline: 0).

- [ ] **Step 2: Lint**

```bash
pnpm run lint
```

Expected: exit 0, 0 errors. Baseline is 37 warnings; report the actual count, and treat a rise as a finding.

- [ ] **Step 3: Production build — the only gate that exercises the provider tree**

```bash
pnpm run build
```

Expected: success. This repo has **no app-level unit test gate**, so this build is the only check that catches an RSC boundary error — for example a `"use server"` module exporting a non-async value, or a client hook imported into a server component.

- [ ] **Step 4: Confirm the placeholder data still reaches the UI**

The point of the placeholders is that the UI stays coherent with no backend. Verify statically that they are wired, since there is no runtime gate:

```bash
grep -rn "PLACEHOLDER_TENANT\|PLACEHOLDER_COUNTRY\|PLACEHOLDER_TIME_ZONE" apps/web/src
```

Expected: the three definitions in `placeholder-configuration.ts` and exactly one use of each in `providers.tsx`.

- [ ] **Step 5: Confirm the provider is mounted once, with both props**

```bash
grep -rn "ApplicationConfigurationProvider" apps/web/src
```

Expected: the import and a single mount carrying `configuration` and `lang`.

- [ ] **Step 6: Report**

Report each gate's actual result, the submodule pointer before and after, and the final `git diff --stat` against the branch point. Do not quote this plan's baselines as if they were fresh measurements.

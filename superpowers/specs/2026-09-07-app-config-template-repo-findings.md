# ayasofyazilim-core-project — findings before plan 6

Measured 2026-09-07 on a fresh clone at `C:/unirefund/ayasofyazilim-core-project`,
branch `feat/app-config-provider`.

## What this repo is

The **web template** `unirefund-web` derives from — the web analogue of
`core-mobile`. Same root commit (`cd360a44`), same structure, and the **same two
submodules**: `packages/ayasofyazilim-ui` and `packages/utils` (`web-utils`).

It is **4,189 commits behind** `unirefund-web` and last saw activity
2026-07-29. It has 2 commits `unirefund-web` does not.

## Why touching it is not optional

Its 18 `useGrantedPolicies` consumers import from **`@repo/utils/policies`** —
the shared `web-utils` submodule. Plan 5 deletes that hook from `web-utils`.
So the next time this repo bumps its submodule pointer past that change, those
18 files stop compiling.

Not broken today: it pins `web-utils` at `b8828adc` while web-app pins
`1f2dce8`. It is a latent break, armed by any future bump.

## Consumer inventory

| Surface | Count | Imported from |
| --- | --- | --- |
| `useTenant` | 18 (16 `localization`-only, 1 `tenantName`, 1 non-destructured) | `@/providers/tenant` (local) |
| `useGrantedPolicies` | 18 | `@repo/utils/policies` (**shared submodule**) |
| `getGrantedPoliciesApi` | 2 (`providers.tsx`, one page) | `@repo/utils/api` |
| `MasterDataGridResourcesProvider` | **0 — not used at all** | — |
| `getInfoForCurrentTenantApi` | **0 — absent** | — |
| `ConfigProvider` / `useConfig` | 1 (dead stub) | local |

One app only: `apps/web`. No `apps/ssr`.

## The finding that changes the work

**`TenantProvider` here serves hardcoded tenant data, and that is deliberate.**
`apps/web/src/providers/tenant.tsx` defines a `defaultTenantData` literal —
tenant GUID `df64152b-9f76-e06b-d43f-3a1bd9644ea9`, `tenantName: "Türkiye"`,
`timeZone: "Europe/Istanbul"`, `currency: "TRY"`, `countryCode2: "TR"` — and
never fetches anything. All 18 consumers read that constant, and the two
`localStorage` writes persist the hardcoded values.

**Confirmed by the user 2026-09-07: this repo has no real backend, which is why
the data is hardcoded.** An earlier revision of this document called the change
"replacing a placeholder with real data" — that was wrong and would have made
the template worse. With no gateway, `getApplicationConfiguration()` resolves
to `EMPTY_APPLICATION_CONFIGURATION`, so the app would render `USD` / `UTC` /
null country fields and an empty policy map where it currently renders coherent
placeholders.

### What that means for plan 6

The **required** part is the compatibility migration, not the data source. Plan
5 deletes `useGrantedPolicies` and `GrantedPoliciesProvider` from the shared
`web-utils` submodule, so this repo's 18 consumers must move off them or they
break at the next pointer bump.

The **placeholder data stays.** Express it as an `ApplicationConfiguration`
constant handed to `ApplicationConfigurationProvider`, so the template adopts
the target architecture and keeps working with no backend. Document the
`await getApplicationConfiguration()` call as the one-line swap-in for a repo
that does have a gateway — that seam is the useful thing for a template to
show, and it keeps this repo honest about not having one.

Do NOT introduce a live configuration fetch here. Note that
`providers.tsx:16`'s existing `getGrantedPoliciesApi()` call already fails
against no backend and falls back to `policies.json` (all `false`); the
placeholder configuration should keep policies fail-closed the same way rather
than inventing grants.

## Divergence needing a decision

The template's `getLocaleFromCountryCode` falls back to **`en-GB`**; the shared
submodule's version (carried over from `unirefund-web`) falls back to
**`en-UK`**, which is not a valid region subtag. Adopting the submodule's
function changes this repo's fallback.

Provisional ruling: keep `en-UK` in the submodule, because 122 `unirefund-web`
consumers have been reading it and changing it is a two-repo behaviour change
that does not belong inside a refactor. Raise the invalid-tag fix as its own
follow-up.

## Gates (measured, not quoted)

| Gate | Command | Baseline |
| --- | --- | --- |
| Type-check | `cd apps/web && pnpm run type-check` | **exit 0, 0 errors** |
| Lint | `pnpm run lint` (root) | **exit 0, 0 errors**, 37 warnings (ui 20, ayasofyazilim-ui 14, web 3) |
| Unit tests | root `unit-test` | **runs only the `ayasofyazilim-ui` submodule's jest — there is NO app-level unit gate here** |

Consequence: with no app unit gate, a production build is the only thing that
can catch an RSC boundary or provider-tree mistake. Gate on it deliberately.

Setup notes: submodules must be initialised before `pnpm install`; `.env` is
gitignored and was copied from `web-app`; `apps/web`'s `init` must run before
type-check. `pnpm install` warned it ignored build scripts for `sharp`,
`@swc/core`, `esbuild`, `unrs-resolver` and others — the same class of ignored
script that left a corrupt `@tailwindcss/oxide` entry in the web-app worktree
and failed a build there with a misleading `next/font` error.

## Dependency

Plan 6's submodule pointer bump needs the app-config layer on `web-utils`
`main`, so that part **blocks on PR ayasofyazilim-clomerce/web-utils#48**. The
consumer migration can proceed before it.

## Feasibility of adopting the shared layer (verified 2026-09-07)

The shared `app-config` layer type-checks against this repo. Every external
symbol it needs is present in this repo own generated SDK:

| Needed by | Symbol | In `ayasofyazilim-core-project` |
| --- | --- | --- |
| `types.ts` | `Volo_..._ApplicationConfigurationDto` | present, `AccountService/types.gen.ts:300` |
| `types.ts` | `UniRefund_..._CountrySettingInfoDto` | present, `AdministrationService/types.gen.ts:112` |
| `fetch.ts` | `client.abpApplicationConfiguration` | present, `AccountServiceClient.ts:23` |
| `fetch.ts` | `getApiAbpApplicationConfiguration` + `includeLocalizationResources` | present, `AccountService/sdk.gen.ts:157` |
| `fetch.ts` | `client.countrySetting` | present, `AdministrationServiceClient.ts:33` |
| `fetch.ts` | `getApiAdministrationServiceCountrySettingsInfo` | present, `AdministrationService/sdk.gen.ts:530` |

The `ApplicationConfigurationDto` here carries every field the normalizer
reads (`auth`, `setting`, `currentUser`, `features`, `currentTenant`,
`timing`), and `CountrySettingInfoDto` carries all seven of its fields. The
package is `packages/core-saas` with `exports: { "./*": "./*/index.ts" }`, so
`@repo/core-saas/AccountService` resolves the same way it does in web-app.

### The submodule bump is small

An earlier note that this repo is 4,189 commits behind applies to the
**superproject only**. The `packages/utils` submodule pointer is just **10
commits** behind `web-utils` main: 8 files, +88/-174, touching only `auth/`,
`tag/`, `api/` and `package.json`. It does not touch `policies/`, which is
why the hooks still exist at the pinned commit and the break is latent rather
than active.

### What this repo does NOT need

No `SETTING_KEYS` or `FEATURE_KEYS` consumer exists here: there is no
early-refund surface and no two-factor gate reading configuration. The
placeholder configuration therefore needs no `settings` or `features` entries
of its own; taking them from the (empty) fetch result is correct.

# ApplicationConfiguration provider — design

Date: 2026-09-04
Scope: web-app, super-app, pos-app, core

## Problem

Tenant data, permissions and tenant-wide settings are read three different ways
in three repos, and the endpoint that already carries all three is fetched
repeatedly with most of its payload discarded.

- **web-app** — `TenantProvider` wraps `getInfoForCurrentTenantApi`
  (`CountrySettingInfoDto`). `GrantedPoliciesProvider` is fed by
  `getGrantedPoliciesApi`, which already calls
  `/api/abp/application-configuration` and keeps only `auth.grantedPolicies`.
- **super-app** — no providers for this. `SessionProvider.getUserData`
  populates zustand stores from four calls: `getGrantedPoliciesApi`,
  `getCurrentUserIdApi`, `getCountrySettingsInfo`, `getCountrySettingsValues`.
  The first two are each a full application-configuration round-trip spent on
  one field.
- **pos-app** — the same shape as super-app, minus `getCountrySettingsValues`.

Two consequences:

1. **web-app repeats the same application-configuration call within a single
   render.** `getGrantedPoliciesApi` is not wrapped in React `cache()`. Of 135
   `isUnauthorized(...)` call sites, 8 pass `grantedPolicies`; the other 127
   fall through to `initalGrantedPolicies || (await getGrantedPoliciesApi())`.
   Each is ~19 KB / ~225 ms, on top of the `(main)` layout's own call.

   **The per-render request count is unmeasured. Do not quote one.** Two
   successive estimates in earlier revisions of this spec were both wrong:
   first ~128, which simply counted repository-wide call sites; then a
   per-route figure of 2 typical / 11 worst, which still assumed each call
   site triggers a fetch. It does not — `isUnauthorized` short-circuits on
   `initalGrantedPolicies ?? (await …)`, and pages such as
   `operations/tax-free-tags/[tagId]/page.tsx` resolve `grantedPolicies` once
   and hand the same value to eight further call sites. Counting call sites
   cannot predict request counts when call sites pass resolved values to each
   other.

   What is certain, and sufficient to justify the change: the pre-existing
   `getGrantedPoliciesApi` was uncached, so every fall-through issued its own
   ~19 KB / ~225 ms round-trip, and `cache()` collapses all of them within a
   render to one by construction. Anyone wanting the magnitude must observe it
   in a browser — see plan 1, Task 6, Step 4, the only step that does.
2. **super-app and pos-app each spend two round-trips on two fields** of one
   response, then fetch country settings separately.

The existing docblock on `getCountrySettingsValues` already anticipates this
migration.

## What the endpoint actually returns

Verified against a live authenticated staff session (tenant "Faroe Islands"),
`includeLocalizationResources=false`.

Present and usable:

| Need | Path |
| --- | --- |
| granted policies | `auth.grantedPolicies` |
| user id, userName, name, surName, email, emailVerified, phoneNumber, roles, sessionId | `currentUser` |
| tenant id, name, isAvailable | `currentTenant` |
| time zone as IANA | `timing.timeZone.iana.timeZoneName` (`"Europe/London"`) |
| early refund availability | `setting.values["CountryManagement.EarlyRefund.EarlyRefundAvailable"]` |

Absent, despite being consumed today:

`currency`, `countryCode2`, `countryCode3`, `countryName`,
`earlyRefundExpireDays`, and the other 15 `CountrySettingsValues` groups.

`setting.values` carries exactly one `CountryManagement.*` key. This is not a
permissions problem — the probed session holds
`UniRefund.Settings.GetValues: true`. It is ABP's `IsVisibleToClients` filter:
the backend has exposed one setting so far.

### Three traps the payload establishes

1. **`setting.values["Abp.Timing.TimeZone"]` is `"GMT Standard Time"`** — a
   Windows zone id, which `Intl.DateTimeFormat` rejects. The IANA value under
   `timing.timeZone.iana` is the only usable one, and web-app's
   `formatToTenantDate` feeds it directly into `Intl`. The wrong key is the
   more obvious-looking choice, so the keys module must say so.
2. **Boolean strings are inconsistently cased** — `"True"` for
   `Abp.Identity.User.IsUserNameUpdateEnabled`, `"false"` for
   `CountryManagement.EarlyRefund.EarlyRefundAvailable`. A `value === "true"`
   comparison reads roughly half the settings as false.
3. **`currentUser.roles` is `["admin"]`** — an ABP identity role, not a party
   type. It cannot express merchant / refundPoint / customs, so super-app's
   affiliation-derived role does not move here.

`objectExtensions` is the largest block in the response and nothing consumes
it.

## Decisions

1. **One consumption surface, two sources internally.** The provider is fed by
   application-configuration (primary) plus one retained
   `country-settings/info` call for the four country and currency fields. When
   the backend exposes those as settings, the second call is deleted inside one
   function and no consumer changes.
2. **Per-app implementation against one spec, plus core.** Four repos, no new
   shared package. Adding a setting key stays a per-repo edit rather than a
   package release plus dependency bumps, which matters because the backend
   will keep flipping settings visible-to-clients. Drift on key strings is
   guarded by a test in each repo.
3. **Facade migration, zero call-site churn.** The new provider becomes the
   only thing that fetches; existing hooks become adapters over it with
   unchanged signatures. Duplicate calls die immediately; the ~400 consumers
   migrate opportunistically later.

## The normalized contract

Identical in all four repos.

```ts
interface ApplicationConfiguration {
  user: {
    isAuthenticated: boolean;
    id: string | null;
    userName: string | null;
    name: string | null;
    surName: string | null;
    email: string | null;
    emailVerified: boolean;
    phoneNumber: string | null;
    roles: string[];
    sessionId: string | null;
  };
  tenant: {
    id: string | null;
    name: string | null;
    isAvailable: boolean;
    isHost: boolean;
  };
  country: {
    currency: string;
    countryCode2: string | null;
    countryCode3: string | null;
    countryName: string | null;
  };
  timeZone: string;
  policies: Record<string, boolean>;
  settings: Record<string, string | null>;
  features: Record<string, string | null>;
}
```

- `tenant.isHost` is computed, not fetched. `CountrySettingInfoDto.tenantId`
  reports the host as `Guid.Empty` while ABP's `currentTenant.id` is `null`;
  the existing `isHostTenant` predicate already treats both as host, so the
  switch of source is behaviour-preserving.
- `timeZone` falls back to `"UTC"`.
- `country` is the gap-filled block, sourced from `country-settings/info`.

### Accessors

```ts
getSetting(key: string): string | null
getBooleanSetting(key: string, fallback?: boolean): boolean   // case-insensitive
getNumberSetting(key: string, fallback?: number): number
getFeature(key: string): string | null
getBooleanFeature(key: string, fallback?: boolean): boolean
```

`getBooleanSetting` lowercases before comparing, and returns `fallback` for
`null`, `undefined` and any unparseable value.

`getNumberSetting` trims first and returns `fallback` for `null`, `undefined`,
the empty string and any whitespace-only value, then for `NaN`. Trimming and
the empty check are load-bearing rather than tidiness: `Number("") === 0` and
`Number("   ") === 0`, so a `NaN`-only guard silently yields `0`. With the
numeric password-policy keys below as the intended consumers, that would turn
a missing setting into `RequiredLength: 0`.

### Normalizer

`normalizeApplicationConfiguration(dto, countryInfo)` projects the raw DTO to
the contract above and **drops** `objectExtensions`, `localization.resources`,
`localization.values`, `globalFeatures`, `clock` and `multiTenancy`. Nothing
consumes them, and the projection is what keeps the persisted RN payload small.

### Keys module

Named constants, so a typo fails a test rather than resolving to `undefined`
and reading as `false`.

Consumed by this change:

```ts
export const SETTING_KEYS = {
  earlyRefundAvailable: "CountryManagement.EarlyRefund.EarlyRefundAvailable",
} as const;
```

That is the only one with a consumer today — it is what lets super-app drop
`getCountrySettingsValues`. The keys below are confirmed present in the payload
and are what the provider newly makes available; each is added when a consumer
is actually built, not speculatively:

| Key | Type | Candidate use |
| --- | --- | --- |
| `TagService.Outcome.ReferenceRequired` | boolean | tag outcome form validation |
| `TagService.Outcome.ResponseCodeRequired` | boolean | tag outcome form validation |
| `Abp.Localization.DefaultLanguage` | string | locale fallback, replacing hardcoded `"en"` |
| `Abp.Identity.Password.RequiredLength` | number | client-side password rules on RN login and change-password, currently unenforced until the server rejects |
| `Abp.Identity.Password.RequireDigit` | boolean | as above |
| `Abp.Identity.Password.RequireUppercase` | boolean | as above |
| `Abp.Identity.Password.RequireLowercase` | boolean | as above |
| `Abp.Identity.Password.RequireNonAlphanumeric` | boolean | as above |
| `Abp.Identity.Password.RequiredUniqueChars` | number | as above |
| `Abp.Account.IsSelfRegistrationEnabled` | boolean | login screen affordances |
| `Abp.Account.EnableLocalLogin` | boolean | login screen affordances |
| `features.values["Identity.TwoFactor"]` | string enum | 2FA affordance gating |

`Identity.TwoFactor` is `"Optional"` in the probed payload — a string enum, not
a boolean, so it is read with `getFeature` and compared, never with
`getBooleanFeature`.

`Abp.Timing.TimeZone` is deliberately absent — see trap 1. The module carries
that as a comment.

## Per-app wiring

### web-app

New `packages/utils/app-config/`:

- `keys.ts`, `parse.ts`, `normalize.ts`, `types.ts` — pure, free of server
  imports, following the precedent set by `is-host-tenant.ts` so client and
  server can share them.
- `fetch.ts` — `getApplicationConfiguration()`: both requests via
  `Promise.allSettled`, wrapped in React `cache()`, and wrapped in an outer
  try/catch so it resolves to the empty configuration rather than rejecting.
  Named `fetch.ts` and NOT `action.ts` deliberately: an `action.ts` in this
  package carries `"use server"`, which would publish the whole configuration
  — including `currentUser`'s email and session id — as a client-callable RPC
  endpoint. The RN implementations keep the `…Api()` name since they have no
  such boundary.
- `provider.tsx` — `ApplicationConfigurationProvider` and
  `useApplicationConfiguration()`.

Rewiring:

- `apps/web/src/providers/providers.tsx` and
  `apps/ssr/src/providers/providers.tsx` mount the new provider. `apps/ssr`
  gains tenant and user data it currently has no access to.
- `TenantProvider` / `useTenant` become adapters reading the new context,
  keeping `localization`, `currency`, `countryCode2`, `formatToTenantDate` and
  `formatToTimezoneDate` intact. The `localStorage` writes for `countryCode2`
  and `tenantTimeZone` stay.
- `GrantedPoliciesProvider` / `useGrantedPolicies` become adapters; signature
  unchanged.
- `getGrantedPoliciesApi` becomes a thin reader over the cached fetch, and
  `isUnauthorized` reads the cached config. This is what collapses the 127
  fall-through sites without editing any of them.

### super-app, pos-app, core

- `src/config/appConfigKeys.ts`, plus pure parse and normalize modules.
- One `getApplicationConfigurationApi()` in
  `src/actions/AccountService/actions.ts`, replacing `getGrantedPoliciesApi`
  and `getCurrentUserIdApi`.
- `src/store/application-configuration.ts` — zustand, partially persisted.
- `ApplicationConfigurationProvider` owns the fetch lifecycle: session adopt,
  token refresh, affiliation switch, tenant switch, and clear on sign-out
  (extending `clearSessionScopedStores`).
- `useCountrySettingsStore` remains as a selector-facade, so the two
  `countryCode2` tag screens, the pos-app print template's `countryName`, and
  `getCurrencySymbol` consumers do not move.
- `useEarlyRefundAvailable()` repoints to
  `getBooleanSetting(SETTING_KEYS.earlyRefundAvailable)`.
- super-app drops `getCountrySettingsValues` entirely. `useEarlyRefundAvailable`
  is its only consumer and `earlyRefundExpireDays` is consumed nowhere, so the
  call and its `UniRefund.Settings.GetValues` grant dependency both go.

**Persistence boundary:** only `country` and `settings` are persisted.
`policies` and `user` stay in memory. `useUserStore` is not persisted today,
and persisting grants would let a cold start paint a permission-bearing UI from
a dead session's data.

**Error contract differs by repo.** super-app's `fetchRequest` throws;
pos-app's returns `ApiResult<T>` and never throws. Each repo's action adapts
its own.

### Expected effect

| | Before | After |
| --- | --- | --- |
| web-app application-configuration calls per render | unmeasured; every uncached fall-through issued its own | 1, cached (plus 1 country-settings) |
| super-app calls per auth path | 4 | 2 |
| pos-app calls per auth path | 3 | 2 |
| super-app grant dependencies | requires `UniRefund.Settings.GetValues` | dropped |

## Failure behaviour

The two requests fail independently.

- application-configuration fails: `policies` is empty, so `isActionGranted`
  returns false. Fail-closed, and identical to today's `catch → return
  undefined`.
- country-settings fails: `country` falls back to per-app defaults — web-app
  `USD` and `en-UK`, RN apps `TRY` — non-blocking, matching super-app's current
  catch-and-log.
- On RN, the persisted `country` and `settings` mean a cold start has the last
  session's values before the fetch lands, preserving current behaviour.

## Testing

- **Key assertion test in every repo** — asserts the literal key strings, so a
  typo in one repo fails there rather than silently resolving to `undefined`
  and reading as `false`.
- **`parse` tests** — `"True"`, `"true"`, `"FALSE"`, `"false"`, `null`,
  `undefined`, unparseable, and `NaN` for the numeric accessor.
- **`normalize` tests** against the captured payload as a redacted fixture:
  IANA time zone extracted rather than the Windows id, `objectExtensions`
  dropped, `isHost` computed for both `null` and `Guid.Empty`.
- web-app's only unit gate is `apps/web` `test:unit`, which is `.ts`-only with
  no JSX. Pure logic therefore lives in `.ts` files and is covered there; the
  provider and adapter React code lives in `.tsx` and is not covered by that
  gate.
- super-app render tests must be named `*.router.test.*`.
- Each repo's gate baseline is re-measured at implementation time rather than
  assumed.

## Out of scope

- **super-app's affiliation-derived role.** `currentUser.roles` is an ABP
  identity role, not a party type.
- **web-app's `settings/tenant` editor.** It is the write surface for these
  settings and keeps the CountrySettings endpoints.
- **The other 15 `CountrySettingsValues` groups.** Only `earlyRefundAvailable`
  has a client-visible setting today.
- **Localization resources.** `includeLocalizationResources: false` stays; it
  is the difference between 19 KB / ~225 ms and 397 KB / ~900 ms.
- **Migrating the ~400 existing consumers.** They keep working through
  adapters.

## Parallel backend ask

Mark visible-to-clients: `CountryManagement.MainSettings.Currency`,
`.CountryCode3`, `.IANATimezone`, and add `countryCode2` and `countryName`
equivalents. When those land, the `country-settings/info` call is deleted
inside `getApplicationConfigurationApi` and no consumer changes.

## Subtasks

1. Spec and shared contract (this document).
2. web-app: pure layer, cached action, provider, adapters.
3. super-app: keys, store, provider, action consolidation, drop
   `getCountrySettingsValues`.
4. pos-app: same, adapted to its `ApiResult` error contract.
5. core: same layout, so derived apps inherit it.
6. Per-repo verification against freshly measured baselines.

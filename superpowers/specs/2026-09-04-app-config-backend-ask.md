# Backend ask — expose the country settings to clients

Status: **NOT FILED.** Ready to paste into Jira. Filing it is a human action;
no ticket was created by the implementation work.

Companion to `2026-09-04-application-configuration-provider-design.md`. Landing
this ask is what lets the frontend delete its second request.

---

**Title:** Mark `CountryManagement.MainSettings.*` settings as visible to
clients (lets the frontend drop a second per-render request)

**Description**

The frontend's `ApplicationConfiguration` provider makes a single
request-cached call to `/api/abp/application-configuration` the source of
granted permissions, current user, current tenant and tenant settings. Before
it, `getGrantedPoliciesApi` was uncached, so every permission check that did
not receive an already-resolved policy map issued its own ~19 KB / ~225 ms
round-trip within the same render.

One piece of data still needs a second request. Country info — currency,
country codes, IANA time zone, country name — is not exposed through
`application-configuration`'s `setting.values`, so the provider also calls
`administration-service/country-settings/info` and merges the two behind one
interface.

**Ask:** set `IsVisibleToClients = true` (or the ABP equivalent) for:

- `CountryManagement.MainSettings.Currency`
- `CountryManagement.MainSettings.CountryCode3`
- `CountryManagement.MainSettings.IANATimezone`
- new equivalents for `countryCode2` and `countryName` — neither has a
  `MainSettings` field today, so these need adding on the backend and marking
  visible

**Evidence**

In a live authenticated session that holds `UniRefund.Settings.GetValues:
true`, `setting.values` returns exactly one `CountryManagement.*` key:
`CountryManagement.EarlyRefund.EarlyRefundAvailable`. None of the
`MainSettings.*` country fields appear. Since the caller already has the
permission, this is an `IsVisibleToClients` configuration question rather than
a permissions one.

**Frontend follow-up once it lands**

Confined to `getCountryInfo` in `packages/utils/app-config/fetch.ts` and its
two React Native equivalents: read the values from `settings` and stop calling
`country-settings/info`. No consumer changes — it is internal to the provider.

---

## Note on quantifying the benefit

Do not attach a per-render request count to this ticket. Two static estimates
were produced during implementation and both were wrong — first ~128, which
counted repository-wide call sites rather than executions, then a per-route
figure of 2 typical / 11 worst, which still assumed every call site triggers a
fetch. It does not: `isUnauthorized` short-circuits when a caller passes an
already-resolved `grantedPolicies`, and several pages resolve it once and hand
the same value to many further call sites.

What is certain is that the old path was uncached and the new one is cached
per request, so duplicates within a render collapse to one by construction.
Anyone who needs the magnitude should observe it in a browser first.

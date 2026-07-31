# QR handling — permissions by role

This file answers which permissions each role's QR actions require.

_Verified against: 2026-07-31 · super-app `24221f7` · web-app `0cf122af0`._

This file re-groups [`actions-and-routes.md`](actions-and-routes.md) by role instead
of by app or route. It is **derived from the registry**, not gathered separately, so
the two cannot disagree — if they ever do, the registry wins. `Permission` and
`Endpoint` cells are copied verbatim from the registry's `Permission` and `Endpoint`
columns. For what an endpoint is *for*, who else may call it, and what the wrong
caller should call instead, see [`endpoints.md`](endpoints.md); this file does not
restate that.

**The four markers, carried faithfully.** The registry's `Permission` column holds
one of four things, and they are not interchangeable:

- a real permission string, e.g. `TagService.Tags, TagService.Tags.Create`;
- `— anonymous` — callable with **no token at all**;
- `— authenticated, no grant` — a bearer token is required, but there is no
  permission gate;
- `—` — not applicable, used only by `— client only` actions, which call no
  endpoint at all and so have nothing to be anonymous or gated about.

A missing SDK annotation means no *permission* is required — it does **not** mean no
*token* is required. That distinction is why the second and third markers both
exist and are kept apart below, rather than collapsed into one "no permission" row.

**On `Actor: Anyone` and `Actor: Admin`.** The four sections below are Traveller,
Merchant, Refund Point and Customs, plus a fifth for Admin — a real actor in the
registry with no perspective chapter of its own elsewhere in this guide, given a
section here so its actions are not orphaned. Five `super-app` rows carry
`Actor: Anyone` or `Actor: Anyone, ...` rather than one named role: A01, A06, A34,
A35, A36 and A37. `super-app` has no Customs or Admin screens anywhere in the
registry, so on those five rows "every party" cashes out to the three roles that
can actually reach a `super-app` route — Traveller, Merchant and Refund Point — and
that is where each of the five is filed below, once per role. This is not an
editorial merge; it is what `Actor: Anyone` denotes once restricted to the parties
capable of reaching the route at all.

## Traveller

| Permission | Actions | Endpoints |
| --- | --- | --- |
| TagService.Tags, TagService.Tags.TravellerSelfAssign | A09, A25, A38, A82, A94, A95 | POST /api/tag-service/tag/traveller-self-assign |
| TagService.Tags, TagService.Tags.GetTagsByTravellerId | A28, A91, A97 | GET /api/tag-service/tag/cross-tenants/by-traveller-id-claim |
| TagService.Tags, TagService.Tags.GetTagByTagNumberCrossTenants | A30, A99 | GET /api/tag-service/tag/cross-tenants/by-traveller-id-claim/{tagNumber} |
| TravellerService.Travellers, TravellerService.Travellers.GetMyDocumentAffiliations | A85 | GET /api/traveller-service/travellers/my-document-affiliations |
| — anonymous | A06, A80, A93 | GET /api/tag-service/public/tag/by-tag-id/{id} |
| — anonymous | A07, A79 | GET /api/tag-service/public/tag |
| — anonymous | A08, A78 | GET /api/tag-service/public/tag/by-sticker-line-number |
| — anonymous | A87 | GET /api/traveller-service/ssr-public-actions/get-email |
| — anonymous | A88 | POST /api/traveller-service/ssr-public-actions/get-access-token |
| — authenticated, no grant | A22, A24, A90, A92, A96 | POST /api/export-validation-service/qr-evidence/{qrValue}/scan |
| — | A01, A02, A03, A04, A23, A33, A34, A35, A36, A37, A77, A81, A83, A84, A86, A89, A98, A100, A101, A102 | — client only; no endpoint |

46 action ids filed here (20 from `super-app`, 26 from `apps/ssr`). A04 and A33 are
also filed under Merchant and Refund Point, and A06, A34, A35, A36 and A37 under
those same two, because their `Actor` names those roles too — see the note above
the tables.

## Merchant

| Permission | Actions | Endpoints |
| --- | --- | --- |
| TagService.Tags, TagService.Tags.DetailByTagNumber | A05, A45 | GET /api/tag-service/tag/{tagNumber}/detail-by-tag-number |
| TagService.Tags, TagService.Tags.AssignTraveller | A10, A32, A59 | POST /api/tag-service/tag/{id}/assign-traveller |
| TravellerService.Travellers, TravellerService.Travellers.SearchByTravellerDocumentNumber | A11, A53 | GET /api/traveller-service/travellers/search/by-document-number |
| TagService.StickerHeaders, TagService.StickerHeaders.GetByLineNumber | A12, A43 | GET /api/tag-service/sticker-header/sticker-line/{stickerLineNumber} |
| CRMService.Merchants, CRMService.Merchants.ViewProductGroupList | A16, A49 | GET /api/crm-service/merchants/{id}/product-group |
| CRMService.Merchants, CRMService.Merchants.View | A17, A50 | GET /api/crm-service/merchants/{id} |
| TagService.Tags, TagService.Tags.Create | A19, A27, A55, A62 | POST /api/tag-service/tag |
| TagService.Tags, TagService.Tags.ViewList | A29, A57 | GET /api/tag-service/tag |
| TagService.Tags, TagService.Tags.Detail | A31, A58 | GET /api/tag-service/tag/{id}/detail |
| ReportService.Reports, ReportService.Reports.CreateSynchronously | A61 | GET /api/report-service/reports/synchronously/by-entity |
| — anonymous | A06 | GET /api/tag-service/public/tag/by-tag-id/{id} |
| — | A01, A04, A13, A18, A21, A26, A33, A34, A35, A36, A37, A39, A40, A41, A42, A44, A46, A47, A54, A60 | — client only; no endpoint |

43 action ids filed here (23 from `super-app`, 20 from `web-app/apps/web`). See
[`operations/tax-free-tags`'s page-level permission](#a-note-on-operationstax-free-tags-page-access)
below the role tables — it is a permission this list does not otherwise mention.

## Refund Point

| Permission | Actions | Endpoints |
| --- | --- | --- |
| TagService.Tags, TagService.Tags.DetailByTagNumber | A05, A45 | GET /api/tag-service/tag/{tagNumber}/detail-by-tag-number |
| TagService.StickerHeaders, TagService.StickerHeaders.GetByLineNumber | A12, A43 | GET /api/tag-service/sticker-header/sticker-line/{stickerLineNumber} |
| TagService.StickerHeaders, TagService.StickerHeaders.ViewMerchantInfo | A14, A48, A52 | GET /api/tag-service/sticker-header/sticker-line/{stickerLineNumber}/merchant-info |
| TagService.Tags, TagService.Tags.ViewMerchantsForCreation | A15, A51 | GET /api/tag-service/tag/merchants-for-creation |
| TagService.Tags, TagService.Tags.CreateByStickerLine | A20, A56 | POST /api/tag-service/tag/by-sticker-line |
| TravellerService.Travellers, TravellerService.Travellers.SearchByTravellerDocumentNumber | A11, A53 | GET /api/traveller-service/travellers/search/by-document-number |
| TagService.Tags, TagService.Tags.AssignTraveller | A10, A32, A59 | POST /api/tag-service/tag/{id}/assign-traveller |
| TagService.Tags, TagService.Tags.ViewList | A29, A57 | GET /api/tag-service/tag |
| TagService.Tags, TagService.Tags.Detail | A31, A58 | GET /api/tag-service/tag/{id}/detail |
| ReportService.Reports, ReportService.Reports.CreateSynchronously | A61 | GET /api/report-service/reports/synchronously/by-entity |
| — anonymous | A06 | GET /api/tag-service/public/tag/by-tag-id/{id} |
| — | A01, A04, A13, A21, A26, A33, A34, A35, A36, A37, A39, A40, A41, A42, A44, A46, A54, A60, A76 | — client only; no endpoint |

41 action ids filed here (21 from `super-app`, 20 from `web-app/apps/web`).
`TagService.StickerHeaders.ViewMerchantInfo` is the permission behind the
**observed** merchant-staff 403 (`#15`) — see
["What this file does not know"](#what-this-file-does-not-know) — it is required
only by Refund Point's own actions here, not a shared staff requirement, even
though the endpoint answers a question ("whose store is this book?") both roles
ask.

## Customs

| Permission | Actions | Endpoints |
| --- | --- | --- |
| TagService.Tags, TagService.Tags.ViewList | A57, A72 | GET /api/tag-service/tag |
| TagService.Tags, TagService.Tags.Detail | A58 | GET /api/tag-service/tag/{id}/detail |
| TagService.Tags, TagService.Tags.AssignTraveller | A59, A70 | POST /api/tag-service/tag/{id}/assign-traveller |
| ReportService.Reports, ReportService.Reports.CreateSynchronously | A61 | GET /api/report-service/reports/synchronously/by-entity |
| TagService.Tags, TagService.Tags.DetailByTagNumber | A67 | GET /api/tag-service/tag/{tagNumber}/detail-by-tag-number |
| TravellerService.Travellers, TravellerService.Travellers.SearchByTravellerDocumentNumber | A69, A71 | GET /api/traveller-service/travellers/search/by-document-number |
| DeviceService.Devices, DeviceService.Devices.ViewList | A73 | GET /api/device-service/devices |
| ExportValidationService.CustomsValidationQrs, ExportValidationService.CustomsValidationQrs.Generate | A74, A75 | POST /api/export-validation-service/customs-validation-qr/generate |
| — | A60, A63, A64, A65, A66, A68 | — client only; no endpoint |

18 action ids filed here, all from `web-app/apps/web`. Customs has no `super-app`
or `apps/ssr` presence anywhere in the registry.

## Admin

Admin has no perspective chapter of its own in this guide, but the registry names
it as a real actor on five rows, all reached through
`web-app/apps/web`'s tax-free-tags pages alongside Merchant, Refund Point and (on
four of the five) Customs. Filed here so its actions are not orphaned by the
four-role structure.

| Permission | Actions | Endpoints |
| --- | --- | --- |
| TagService.Tags, TagService.Tags.ViewList | A57 | GET /api/tag-service/tag |
| TagService.Tags, TagService.Tags.Detail | A58 | GET /api/tag-service/tag/{id}/detail |
| ReportService.Reports, ReportService.Reports.CreateSynchronously | A61 | GET /api/report-service/reports/synchronously/by-entity |
| TagService.Tags, TagService.Tags.Create | A62 | POST /api/tag-service/tag |
| — | A60 | — client only; no endpoint |

5 action ids filed here: A57, A58, A60, A61, A62. Every one of them is also filed
under Merchant and/or Refund Point (and, for four of the five, Customs) above —
interesting, not a mistake: it is the same tenant-scoped page and the same tenant
detail read, open to every staff role that has a reason to look at a tag.

### A note on `/operations/tax-free-tags` page access

The action reaching this page, A57, requires `TagService.Tags, TagService.Tags.ViewList`
at the API layer — the row above in each of Merchant's, Refund Point's, Customs's
and Admin's tables. The **page itself** carries an additional, separate gate:
`TagService.Tags.View`, an identifier that appears in **none** of the registry's 52
`TagService` annotations. It is a real permission check (on the page route, not on
any endpoint this guide's registry reaches), and it is already routed as a Finding
to Task 13; it is recorded here, where a reader looking at Merchant, Refund Point,
Customs and Admin page access would otherwise expect to find it, so as not to
contradict that Finding by omission.

## Anonymous — no permission, and sometimes no token at all

This is a required section, not a footnote: the traveller's entire
scan-before-login path — read a tag's public detail from a QR, read what a
sticker line carries, decide whether a claim can be offered — depends on the fact
that these calls need **no token at all**. If any of them required
authentication, there would be no way to show a traveller who has not yet
installed an account anything about the tag they just scanned, and the
scan-then-claim flow that every app implements would not exist.

`TagPublicService` — the SDK client behind `getApiTagServicePublicTag`,
`getApiTagServicePublicTagByStickerLineNumber` and
`getApiTagServicePublicTagByTagIdById` — carries **no `Requires permissions`
annotation on any of its three methods.** That absence is deliberate, not an
oversight: a missing annotation is how this SDK spells "no permission gate", and
for these three methods it is paired with the further fact that the call sites
never attach a bearer token (`fetchRequest` is not on their path), which is what
licenses the `— anonymous` marker in the registry rather than
`— authenticated, no grant`.

**Not all of the anonymous endpoints attest their own anonymity equally.** Only
one does, in its own words. The method behind A06, A80 and A93 —
`getApiTagServicePublicTagByTagIdById` — states in its own doc comment:

> Anonymous — the unguessable Guid id is the credential

Its anonymity is **self-declared**: the SDK says so, and the reason it gives (the
Guid itself is the credential, so nothing else is needed) is why no second factor
is demanded of a traveller who has never logged in.

The other four anonymous endpoints carry **no such statement** — no annotation and
no prose of their own:

- `GET /api/tag-service/public/tag` (A07, A79),
- `GET /api/tag-service/public/tag/by-sticker-line-number` (A08, A78),
- `GET /api/traveller-service/ssr-public-actions/get-email` (A87),
- `POST /api/traveller-service/ssr-public-actions/get-access-token` (A88).

Their `— anonymous` marker rests on **call-site context only**: the absence of a
`Requires permissions` line, the absence of a bearer token on the wrapper's call
(no `fetchRequest`), and the registry's own `Actor` cells, which show them being
called from routes reachable while logged out (`Traveller, including logged out`
for the first two; `Traveller, logged out` for the KYC pair). That is real
evidence — it is how every anonymous/authenticated split in this guide was
established, per `actions-and-routes.md`'s own conventions note — but it is a
different *kind* of evidence from a method stating its own anonymity, and a
reader should not treat the four as equally self-attested. Only the by-tag-id read
says so about itself.

## Session claims — resolved before any permission is consulted

Session claims decide **which branch runs** before any permission check happens
at all, which is why they are documented apart from the permission tables above
rather than folded into them. All three apps:

**`super-app`.** `super-app/src/utils/rolePreference.ts` stores a device-level UX
preference — which role the app should open to next time — and it is **not**
authoritative for anything a permission or an endpoint call depends on. The real
role is resolved after login in `super-app/src/providers/SessionProvider.tsx`,
from the user's CRM affiliations, via `resolveRoleFromAffiliations()`
(`SessionProvider.tsx:99`, called from the login path at `SessionProvider.tsx:184`);
travellers are fast-pathed directly from the sign-in route rather than going
through affiliation resolution. Once resolved, `grantedPolicies` arrives on the
session as `Record<Policies, boolean>`
(`super-app/src/actions/AccountService/types.ts:3`, `type Policies = keyof typeof
policies`), where `policies` is generated from
`super-app/src/data/policies/policies.gen.json`. A reader who needs to know what a
given `super-app` session actually holds reads `grantedPolicies` off that session
object, populated in `SessionProvider.tsx` — not `rolePreference.ts`, and not this
file.

**`web-app/apps/web`.** The operative claims are `session.user.MerchantId`,
`session.user.RefundPointId` and `session.user.CustomsId`, each typed
`string | string[]`. **The Refund Point claim wins whenever both it and
`MerchantId` are present on the same session** — the concrete branch is
`isMerchantUser = Boolean(sessionMerchantId) && !sessionRefundPointId` at
`web-app/apps/web/src/app/[lang]/(main)/(unirefund)/operations/scan-sticker/client.tsx:367`.
The consequence of getting this backwards is concrete, not cosmetic: treating a
stray `MerchantId` as authoritative on a session that also carries a Refund Point
claim would resolve, display and post the operator's **own** store instead of the
merchant the sticker book is actually being booked for on `A55`/`A56`'s create
call — silently mis-attributing, or (per the unresolved contradiction in
`endpoints.md`) permanently mis-allocating, a book nobody at that counter chose.
`grantedPolicies` for `apps/web` is populated at boot through
`GrantedPoliciesProvider` (`web-app/packages/utils/policies/granted-policies.tsx`),
fed from `getGrantedPoliciesApi()` in
`web-app/apps/web/src/providers/providers.tsx:29,65,83` and read via
`useGrantedPolicies()` / `isActionGranted()`
(`web-app/packages/utils/policies/action-policy.tsx`) — that is where a reader
finds what a given `apps/web` session actually holds.

**`web-app/apps/ssr`.** Session management is NextAuth
(`web-app/packages/utils/auth/auth.ts`, JWT strategy). Public routes need no
session at all: routing middleware
(`web-app/packages/utils/auth/middleware.ts`) exempts `tag` and `validate` (among
others) from its authentication redirect via `PUBLIC_ROUTES` in
`apps/ssr/.env`, which is why A77–A81 and A84–A86 all work logged out. The claim
path — KYC — additionally requires a **completed KYC session** before any token
is issued: `login/kyc/didit.tsx` only calls `getApiTravellerServiceSsrPublicActionsGetEmailApi`
(A87) once Didit reports a finished verification, and only then, if an account
already exists, calls through to `getApiTravellerServiceSsrPublicActionsGetAccessTokenApi`
(A88), whose result feeds `signIn("ssr-token", ...)` against the `ssr-token`
Credentials provider in `auth.ts`. That is the route for a traveller who does not
have an account yet; it is **not** the only route to a session. `/login` also
renders a live username-and-password form, whose submit
(`web-app/apps/ssr/src/components/auth/login-form.tsx:147`) calls
`signInServerApi` (`:60`) with the username (`:107`) and password (`:135`) it
collected, and signing in with KYC is an *alternative* link beside it (`:157`) — so
a traveller who already has a password reaches a session with neither A87 nor A88
running at all. `apps/ssr` shares the same `GrantedPoliciesProvider` package as
`apps/web`, populated in `web-app/apps/ssr/src/providers/providers.tsx:50-55` —
the same `useGrantedPolicies()` / `isActionGranted()` pair reads it, and it is
what gates the single ungrantable UI check in this app, the claim button in
`apps/ssr/src/app/[lang]/(main)/tags/_components/tag-claim.tsx:14`.

## What this file does not know

**Which permissions an ABP role actually holds is backend configuration, and it is
not in this repository.** Everything above is one of two different kinds of
claim, and they must not be read as the same kind:

- **Code-derived** — a route, a client wrapper, an SDK method, and the
  permission its own doc comment states it requires. Every cell in every table
  above is this kind: cited, and re-verified independently twice with zero
  mismatches found. This tells you what an action **requires**. It does not tell
  you who **has** it.
- **Observed** — a claim that a specific role does or does not hold a specific
  grant, evidenced by an actual 403 seen in the field rather than read off a doc
  comment. **Exactly two are on record, and no more:**
  - merchants do **not** hold `TagService.Tags.CreateByStickerLine` (`#29`);
  - merchant staff do **not** hold `TagService.StickerHeaders.ViewMerchantInfo`
    (`#15`).

**Infer nothing beyond those two.** In particular, this file does not know, and
does not claim to know, whether a Refund Point holds `TagService.Tags.Create`,
whether Customs holds `TagService.Tags.AssignTraveller`, or any other pairing not
in the two bullets above — the fact that an action is filed under a role's table
means that role's own actions require that permission, never that the role has
been confirmed to hold it. **The single worst outcome this file could produce is
a table that reads as "role X holds permissions A, B, C" when nothing here
establishes that** — this file documents what each role's actions require, which
is a different and knowable thing, not what a role has been granted.

A reader who needs the true matrix — what a given user's token actually carries —
reads it from the session's own `grantedPolicies`, not from this file:

- `super-app` — the session object populated in
  `super-app/src/providers/SessionProvider.tsx`, typed
  `Record<Policies, boolean>` per `super-app/src/actions/AccountService/types.ts`.
- `web-app/apps/web` and `web-app/apps/ssr` — `useGrantedPolicies()` /
  `isActionGranted()` from `web-app/packages/utils/policies/`, fed by
  `getGrantedPoliciesApi()` at boot in each app's `providers.tsx`.

One further absence, for completeness: `policies.json` also lists
`TagService.Tags.DetailByEncryptedTagNumber`, but no SDK method implements it in
any of the three generated clients, so it reaches no endpoint, requires no action
in any table above, and is not a gap in this file's coverage — see
`actions-and-routes.md`'s notes and `endpoints.md`'s cross-tenant lookup row for
the fuller story. It is already routed as a Finding to Task 13.

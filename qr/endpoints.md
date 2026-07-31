# QR handling — endpoints

This file answers, for every endpoint QR actions reach, who may call it and which actions cover it.

_Verified against: 2026-07-31 · super-app `24221f7` · web-app `0cf122af0`._

This file inverts [`actions-and-routes.md`](actions-and-routes.md). The registry
answers *"what does this action call?"*; this file answers *"who is allowed to call
this, and what should everyone else call instead?"*

It is **derived from the registry**, not gathered separately, so the two cannot
disagree. If they ever do, the registry wins. `Endpoint` and `Permission` are plain
text — no backticks — because they are joined against the registry by exact string.

## How to read this file

**Scope.** Every endpoint a QR flow reaches gets a full row: that is the registry's
`Endpoint` column, deduplicated — 25 endpoints. A handful of endpoints no QR flow
calls, but that someone reaches for instead, get a **contrast row**: `— contrast` in
`Actions`, the real permission, and one line on **why it is not the call to make
here**. That line is not always "it is wrong": a contrast row may say the endpoint is
*unreached* (defined, never invoked, so choosing it means writing the first call site)
or that it is the administrative counterpart to something a QR flow does as a side
effect — see [Sticker allocation: permanent on first
use](#sticker-allocation-permanent-on-first-use). Nothing
else is in. This is a QR guide, not an API reference; `TagService` alone has 55-plus
methods, and risk configuration, refund operations and reporting get no rows at all.

**`Permission`** is copied from the SDK's `**Requires permissions:**` annotation. Two
markers replace it, and they are not interchangeable:

- `— anonymous` — callable with **no token at all**.
- `— authenticated, no grant` — a bearer token is required, but there is no
  permission gate.

A missing annotation means no *permission* is required; it does not mean no *token*
is required. The distinction is load-bearing for the traveller who scans before
logging in.

**`Intended caller`** is the party the endpoint exists for. Where the cell carries a
**quoted phrase**, that phrase is quoted verbatim from the SDK and is the basis for the
claim — but read the quote, because the three ways it can support the claim are not
equally direct: most name the party outright ("Intended for a Refund Point issuing a
tag at its own counter"); two are quoted from the **request type's** doc rather than
the method's; and one names a *step* rather than a party ("The lookup step before
CreateByStickerLineAsync"), leaving the party a short inference from it. Where the cell
carries an unquoted list of parties, that list is the union of the registry's `Actor`
values for the actions reaching the endpoint, and nothing more is claimed than that. `Also called by` is for a party that legitimately calls it
too; it is `—` unless the registry actually shows a second party in a different role.

**`Must not call`** is the field that earns this file, and it always carries a
**reason**, of one of three kinds:

- *no grant* — verifiable from the annotation. The only kind a 403 reveals.
- *wrong DTO* — the request or response type has no field for something the caller
  holds or needs. No error is returned.
- *side effect* — a consequence the caller must not cause. No error is returned. The
  clean example is `merchantId` on the by-sticker-line create: it is **ignored once
  the sticker line is allocated**, so a field that looks accepted did nothing at all —
  and on an **unallocated** line the same field **permanently allocates the whole
  sticker book** to the merchant it names. Same field, same call, one case inert and
  one irreversible: see [Sticker allocation: permanent on first
  use](#sticker-allocation-permanent-on-first-use).

The last two are the traps. Two `no grant` claims are **observed** from real 403s and
say so in the cell: merchant staff on the sticker-line merchant-info lookup (`#15`,
alias `#26`) and merchants on the by-sticker-line create (`#29`). Every other `no
grant` cell is derived from the SDK annotation plus the registry's `Actor` split, not
from an observed refusal — which ABP roles actually hold which grants is backend
configuration and is not in this repository. See
[`permissions-by-role.md`](permissions-by-role.md).

**`Actions`** lists the registry ids that reach the endpoint. An action that calls no
endpoint is absent from this file by rule; the registry marks it `— client only` so
the absence is checkable.

### If you are editing this file, read this first

`docs/qr/_verify/check.mjs` merges **every** table whose first header cell is
`Endpoint` into one logical table and joins it against the registry in both
directions. That has two consequences an editor has to know:

1. The endpoint tables below are split per service **only** for readability. They are
   one table as far as the checker is concerned, which is why all ten carry a
   byte-identical header. Changing one header breaks the join silently.
2. **No other table in this file may lead with `Endpoint`.** A decision table or an
   anti-pattern table that does gets its rows absorbed into the endpoint join, where
   they are read as endpoints that no registry action reaches. Lead those with the
   caller's need, the symptom, or anything else — see the existing ones for the
   pattern.
3. `Permission` is **not** editable here. `check.mjs`'s `endpointPerms` compares
   every row's `Permission` cell against the registry cell of every action the row
   lists, character for character, and compares the row's endpoint against those
   actions' `Endpoint` cells too. Change a permission in the registry and this file
   fails until it is copied across; change it here alone and it fails immediately.
   That is the join this file's opening claim — "the two cannot disagree" — rests
   on, and until 2026-08-01 nothing enforced it.

These are the most brittle invariants in the file, so they are written down here
rather than left to the checker to discover.

## Endpoints

The endpoint tables, in order: [sticker lines](#tagservice--sticker-lines) ·
[creating a tag](#tagservice--creating-a-tag) ·
[reading a tag as staff](#tagservice--reading-a-tag-as-staff) ·
[reading a tag as a traveller](#tagservice--reading-a-tag-as-a-traveller) ·
[putting a traveller on a tag](#tagservice--putting-a-traveller-on-a-tag) ·
[CRMService](#crmservice) · [TravellerService](#travellerservice) ·
[ExportValidationService](#exportvalidationservice) ·
[DeviceService and ReportService](#deviceservice-and-reportservice) ·
[contrast rows](#contrast-rows)

### TagService — sticker lines

| Endpoint | Permission | Intended caller | Also called by | Must not call | Instead use | Actions | Body contract |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET /api/tag-service/sticker-header/sticker-line/{stickerLineNumber} | TagService.StickerHeaders, TagService.StickerHeaders.GetByLineNumber | Merchant, Refund Point | — | Traveller — *no grant*. Allocation and merchant identity are staff data. | `GET /api/tag-service/public/tag/by-sticker-line-number`, which returns the public projection of whatever tag the line already carries | A12, A43 | `stickerLineNumber` in the path, no body. Returns `StickerLineInfoDto`: `merchantId`, `merchantName`, `vatNumber`, `externalIdentifier`, `tagId`, `tagNumber`, `isUsed` — enough to answer both "is this sticker used" and "whose book is it" without a second call. |
| GET /api/tag-service/sticker-header/sticker-line/{stickerLineNumber}/merchant-info | TagService.StickerHeaders, TagService.StickerHeaders.ViewMerchantInfo | Refund Point — "The lookup step before CreateByStickerLineAsync" | — | Merchant staff — *no grant*, **observed**: this is the 403 behind `#15` (alias `#26`). | The sticker line's own `merchantId` / `merchantName` / `vatNumber` from `GET /api/tag-service/sticker-header/sticker-line/{stickerLineNumber}`, then `GET /api/crm-service/merchants/{id}` and `GET /api/crm-service/merchants/{id}/product-group` for the rest | A14, A48, A52 | `stickerLineNumber` in the path, optional `merchantId` in the query. Returns `isMerchantAllocated` plus a deliberately minimal merchant projection — business name, VAT number, a composed address, and the active product groups with one `isDefault` per VAT rate. `merchantId` is a **preview only** and is ignored once the line is allocated, because that allocation cannot be changed. On an **unallocated** line the preview is free but the *create* that follows is not: it allocates the whole book permanently. Read `isMerchantAllocated` from this call to tell the two cases apart before creating — see [Sticker allocation: permanent on first use](#sticker-allocation-permanent-on-first-use). |

### TagService — creating a tag

| Endpoint | Permission | Intended caller | Also called by | Must not call | Instead use | Actions | Body contract |
| --- | --- | --- | --- | --- | --- | --- | --- |
| POST /api/tag-service/tag | TagService.Tags, TagService.Tags.Create | Merchant — "the merchant creating the tag identifies itself in the request" | Admin — the new-tag form, with no sticker scanned | Refund Point issuing for a merchant it does not own — *wrong DTO*. `CreateTagRequestDto` takes the merchant identity **from the request**, so the caller asserts a merchant identity it must not assert. The SDK states only that the *other* path records `CreatedByRefundPointId` from the caller's affiliation claim, and that the field is null when the merchant created the tag itself; what a Refund Point on this path produces is **not documented either way**, so do not assume the attribution survives. | `POST /api/tag-service/tag/by-sticker-line`, which resolves the merchant server-side from the sticker line and is the path the SDK documents as recording the creating Refund Point | A19, A27, A55, A62 | `CreateTagRequestDto`. Required: `merchant` (VAT number, optionally narrowed by external identifier) and `invoices`. **`status`** is `Draft` or `Issued` and is the caller's choice — see the coupling note below the tables. Optional: `traveller` (a full `TravellerRequestDto`), `stickerLineNumber` — so a scanned sticker still binds in this one call — plus `travellerSignatureBase64`, `merchantIndividualSignatureBase64`, `salesPersonIndividualId`, `payoutTokenId` and `payoutToken`. |
| POST /api/tag-service/tag/by-sticker-line | TagService.Tags, TagService.Tags.CreateByStickerLine | Refund Point — "Intended for a Refund Point issuing a tag at its own counter" | — | Merchant — *no grant*, **observed** (`#29`); and *wrong DTO*: `CreateTagByStickerLineRequestDto` has no `merchantIndividualSignatureBase64` and no `salesPersonIndividualId`, so a captured merchant signature and the frontline-incentive attribution are dropped with no error at all. Any caller sending `merchantId` on a line that is not allocated yet, unless allocating that whole book to that merchant is the intent — *side effect*, and an **irreversible** one: the create allocates the entire sticker header to that merchant permanently, and no call in this guide re-points it. Silent, and it tests clean against allocated stock because the same field is ignored there — see [Sticker allocation: permanent on first use](#sticker-allocation-permanent-on-first-use). | Merchants post `POST /api/tag-service/tag` with `stickerLineNumber` set. For `merchantId`: read `isMerchantAllocated` from `GET /api/tag-service/sticker-header/sticker-line/{stickerLineNumber}/merchant-info` first. On an **allocated** line send nothing — the field is ignored, and a *different* merchant is rejected. On an **unallocated** line the field is required, so there is no way to create without allocating: confirm the merchant is the one the book should belong to forever, and do not create against a book anyone still needs unallocated | A20, A56 | `CreateTagByStickerLineRequestDto`. Required: `stickerLineNumber` and `invoices`. **`status`** is `Draft` or `Issued` and is the caller's choice — see the coupling note below the tables. Optional: `traveller` (a full `TravellerRequestDto`), `merchantId`, `travellerSignatureBase64`, `payoutTokenId` and `payoutToken`. **No** `merchant`, **no** `merchantIndividualSignatureBase64`, **no** `salesPersonIndividualId` — the three fields the standard create has and this one does not. |
| GET /api/tag-service/tag/merchants-for-creation | TagService.Tags, TagService.Tags.ViewMerchantsForCreation | Refund Point — "the merchants a tag may be created on behalf of" | — | Merchant — *no grant*: the registry has only a Refund Point reaching this endpoint (A15, A51). The read itself changes nothing, but it exists so that "the operator must choose which merchant to allocate it to", and a merchant must never make that choice for a book; its own merchant id comes from its own affiliation claim, not from a picker. The pick matters because on an unallocated book the create [allocates that whole book to it permanently](#sticker-allocation-permanent-on-first-use). | `GET /api/crm-service/merchants/{id}` with the merchant id taken from the operator's own affiliation claim | A15, A51 | Optional partial `name` and `vatNumber`, paged. Returns id, name and VAT number only, and only ACTIVE merchants — deliberately not the back-office merchant list. |

### TagService — reading a tag as staff

| Endpoint | Permission | Intended caller | Also called by | Must not call | Instead use | Actions | Body contract |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET /api/tag-service/tag | TagService.Tags, TagService.Tags.ViewList | Merchant, Refund Point, Customs, Admin | — | Traveller — *no grant*, and the list is tenant-scoped, so it could not answer "my tags" even if the grant were held. | `GET /api/tag-service/tag/cross-tenants/by-traveller-id-claim` | A29, A57, A72 | The tenant filter set, paged. `riskLevels` and a risk sort are **silently dropped** without `TagService.TagRisks.FilterByRisk` — by design, returning 200, so a missing grant looks exactly like an empty filter. |
| GET /api/tag-service/tag/{id}/detail | TagService.Tags, TagService.Tags.Detail | Merchant, Refund Point, Customs, Admin | — | Traveller — *no grant*. This is the tenant projection of the tag, not the traveller-facing one. | `GET /api/tag-service/public/tag/by-tag-id/{id}` while the tag id is in hand, or `GET /api/tag-service/tag/cross-tenants/by-traveller-id-claim/{tagNumber}` once the tag is theirs | A31, A58 | `id` in the path, no body. The full tenant detail, including `publicLink` — the `/tag/{slug}` URL the printed QR encodes. |
| GET /api/tag-service/tag/{tagNumber}/detail-by-tag-number | TagService.Tags, TagService.Tags.DetailByTagNumber | Merchant, Refund Point, Customs | — | Traveller — *no grant*. A bare tag number is guessable and this read applies no ownership test, which is why it is a staff-only grant. | `GET /api/tag-service/public/tag`, which pairs the tag number with the traveller's own document number, or `GET /api/tag-service/tag/cross-tenants/by-traveller-id-claim/{tagNumber}` once authenticated | A05, A45, A67 | `tagNumber` in the path, no body. This is what turns a Code128 tag-number barcode, or a typed number, into a tag id. |

### TagService — reading a tag as a traveller

| Endpoint | Permission | Intended caller | Also called by | Must not call | Instead use | Actions | Body contract |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET /api/tag-service/tag/cross-tenants/by-traveller-id-claim | TagService.Tags, TagService.Tags.GetTagsByTravellerId | Traveller, authenticated — "filtered by the TravellerId from user's claims, across all tenants" | — | Merchant, Refund Point, Customs — *wrong DTO*. There is no traveller parameter: the filter is the caller's **own** TravellerId claim, so a staff call returns the staff member's tags rather than the tenant's, and reports no error doing it. | `GET /api/tag-service/tag` | A28, A91, A97 | Status, date, merchant and paging filters. No traveller field of any kind, in either direction. |
| GET /api/tag-service/tag/cross-tenants/by-traveller-id-claim/{tagNumber} | TagService.Tags, TagService.Tags.GetTagByTagNumberCrossTenants | Traveller, authenticated — "SSR Validate / traveller-portal flow" | — | Merchant, Refund Point, Customs — *wrong DTO*. It returns a tag **only** when the caller's TravellerId claim equals the tag's, so it can never serve a staff lookup. | `GET /api/tag-service/tag/{tagNumber}/detail-by-tag-number` | A30, A99 | `tagNumber` in the path. A missing tag, an unassigned Draft and another traveller's tag are all reported as the same generic not-found, so the endpoint cannot be used as an oracle for tag numbers. A not-yet-claimed Draft is therefore unreadable here — `GET /api/tag-service/public/tag/by-tag-id/{id}` is its read. |
| GET /api/tag-service/public/tag | — anonymous | Traveller, including logged out | — | Merchant, Refund Point, Customs looking up a tenant tag — *wrong DTO*. The credential is the traveller's own document number, and the response is the public projection rather than the tenant detail. | `GET /api/tag-service/tag/{tagNumber}/detail-by-tag-number` | A07, A79 | `tagNumber` and `travellerDocumentNumber` in the query, needed together — the pair is the credential. No token. |
| GET /api/tag-service/public/tag/by-tag-id/{id} | — anonymous | Anyone holding the tag id — "Anonymous — the unguessable Guid id is the credential" | Traveller, authenticated — the same read backs the claim modal's scan tab, where a session already exists | — | — | A06, A80, A93 | `id` in the path — a Guid, and the **only** credential, so it must not be logged or placed anywhere a URL leaks. A Draft tag comes back with a null Traveller block, which is what lets the claim be offered; a non-existent id is a plain not-found. |
| GET /api/tag-service/public/tag/by-sticker-line-number | — anonymous | Traveller, including logged out | — | Merchant, Refund Point resolving a scanned sticker — *wrong DTO*. It answers "which tag was issued on this line" and says nothing about whether the book is allocated or to whom, which is the first thing a create flow needs. | `GET /api/tag-service/sticker-header/sticker-line/{stickerLineNumber}` | A08, A78 | `stickerLineNumber` in the query. No token. Returns nothing useful for a line no tag has been issued against. |

### TagService — putting a traveller on a tag

| Endpoint | Permission | Intended caller | Also called by | Must not call | Instead use | Actions | Body contract |
| --- | --- | --- | --- | --- | --- | --- | --- |
| POST /api/tag-service/tag/{id}/assign-traveller | TagService.Tags, TagService.Tags.AssignTraveller | Merchant, Refund Point, Customs | — | Traveller claiming their own tag — *no grant*, and *wrong DTO*: the body carries a whole traveller identity, so a traveller calling it would be writing an arbitrary identity onto a tag rather than proving their own. | `POST /api/tag-service/tag/traveller-self-assign` | A10, A32, A59, A70 | `AssignTravellerToTagRequestDto` — a full `TravellerRequestDto`: document number, nationality, first and last name, residence, optional expiry and birth date. No sales-amount proof: the authorised staff caller **is** the proof. Needs the tag's Guid, so a tag-number-only QR cannot assign. |
| POST /api/tag-service/tag/traveller-self-assign | TagService.Tags, TagService.Tags.TravellerSelfAssign | Traveller, authenticated — "Allows an authenticated traveller to self-assign themselves to a Draft tag"; "Host use only ... Do not call from Tenant context" | — | Merchant, Refund Point, Customs — *side effect*. The traveller is derived from the **caller's** claims, so a staff call assigns the staff member to the tag; and the doc comment forbids a Tenant context outright. | `POST /api/tag-service/tag/{id}/assign-traveller` | A09, A25, A38, A82, A94, A95 | `{ tagNumber, salesAmount }`, and nothing else. The traveller is never in the body. `salesAmount` is the proof and is verified against the tag server-side, which is why a scan that yields only a tag id must first read the tag to learn the amount. |

### CRMService

| Endpoint | Permission | Intended caller | Also called by | Must not call | Instead use | Actions | Body contract |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET /api/crm-service/merchants/{id} | CRMService.Merchants, CRMService.Merchants.View | Merchant | — | Refund Point resolving a merchant it does not own — *no grant*: `CRMService.Merchants.View` is a merchant-side grant, and the registry has only a merchant reaching it (A17, A50). The annotation is a role permission, not a per-record rule, so this says nothing about *which* merchant records it covers — what it says is that the Refund Point path is not built on it, and the `TagService` projection exists to serve that path instead. | `GET /api/tag-service/sticker-header/sticker-line/{stickerLineNumber}/merchant-info` when the book is allocated; `GET /api/tag-service/tag/merchants-for-creation` when it is not | A17, A50 | `id` in the path. The **full** merchant record — external identifier, tax office, chain code, parent and HQ identity, lifecycle state, e-mail and telephone — all of which the `TagService` projection deliberately withholds. |
| GET /api/crm-service/merchants/{id}/product-group | CRMService.Merchants, CRMService.Merchants.ViewProductGroupList | Merchant | — | Refund Point pricing a merchant it does not own — *no grant*: as with the merchant detail above, `CRMService.Merchants.ViewProductGroupList` is a merchant-side grant that the registry never shows a Refund Point holding (A16, A49), not a per-record scope rule. | `GET /api/tag-service/sticker-header/sticker-line/{stickerLineNumber}/merchant-info`, whose projection carries the same product groups with `isDefault` and `vatRate` | A16, A49 | `id` in the path. This is the **per-merchant relation**, which is where `isDefault` and `vatRate` live. `productGroupId` is the id of the global catalogue entry, which carries neither. |

### TravellerService

| Endpoint | Permission | Intended caller | Also called by | Must not call | Instead use | Actions | Body contract |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET /api/traveller-service/travellers/search/by-document-number | TravellerService.Travellers, TravellerService.Travellers.SearchByTravellerDocumentNumber | Merchant, Refund Point, Customs | — | Traveller — *no grant*. A traveller never resolves another traveller. | There is no traveller equivalent and none is needed: a traveller's own tags come from `GET /api/tag-service/tag/cross-tenants/by-traveller-id-claim`, which takes no document number | A11, A53, A69, A71 | `travellerDocumentNumber` in the query. May return **more than one** traveller — the column is not unique at the database level — so the caller must disambiguate rather than take the first result. |
| GET /api/traveller-service/travellers/my-document-affiliations | TravellerService.Travellers, TravellerService.Travellers.GetMyDocumentAffiliations | Traveller | — | — | — | A85 | No parameters. It answers only about the caller's own documents, which is what makes it usable as a liveness probe for a session before a scan is trusted to it. |
| GET /api/traveller-service/ssr-public-actions/get-email | — anonymous | Traveller, logged out | — | — | — | A87 | `sessionId` and `kycSessionProvider` in the query. The KYC session id is the **only** credential and the response discloses an account e-mail address, so that id must be handled as a secret. |
| POST /api/traveller-service/ssr-public-actions/get-access-token | — anonymous | Traveller, logged out then authenticated | — | — | — | A88 | `{ sessionId, kycSessionProvider, scope }`, returning an access token and its lifetime. Anonymous, so again the KYC session id is the only credential. `scope` is caller-supplied; the SSR caller fills it from the OIDC discovery document rather than requesting a narrower set. |

### ExportValidationService

| Endpoint | Permission | Intended caller | Also called by | Must not call | Instead use | Actions | Body contract |
| --- | --- | --- | --- | --- | --- | --- | --- |
| POST /api/export-validation-service/qr-evidence/{qrValue}/scan | — authenticated, no grant | Traveller, authenticated — "the traveller scans the kiosk's QR with their own authenticated device" | — | Merchant, Refund Point, Customs — *side effect*, and the worst one in this file: the tags cleared are those of the **caller's own** `TravellerDocumentId` claim, there is **no permission gate** to refuse a staff call, so a staff token succeeds and clears the staff member's own tags. Nothing but the client stops it, and both staff apps refuse a validate QR before any call is made. | `POST /api/export-validation-service/qr-evidence/{qrValue}/scan-with-traveller-info` — the **gated** agent-assisted path, for an operator scanning the kiosk QR on a traveller's behalf; or `POST /api/export-validation-service/self-check-evidence/kiosk-verify` when the traveller has no phone and no QR at all. Both are [contrast rows](#contrast-rows) below | A22, A24, A90, A92, A96 | `qrValue` in the path; body `{ latitude, longitude, flightTicket }`. The traveller is never in the body — the `TravellerDocumentId` claim decides whose tags are cleared. |
| POST /api/export-validation-service/customs-validation-qr/generate | ExportValidationService.CustomsValidationQrs, ExportValidationService.CustomsValidationQrs.Generate | Customs — "CustomsId is resolved from the caller's ... claim (never accepted as input)" | — | Traveller, Merchant, Refund Point — *no grant*, and there would be nothing to pass: the customs office is the caller's claim, so no other party can generate a QR on its behalf. | There is no alternative: only a customs kiosk generates a validate QR, and every other party reads one rather than asking for one | A74, A75 | **No parameters at all.** CustomsId and UserId both come from claims. Fails unless the caller owns **exactly one** Kiosk device — zero or several is treated as an operational failure and logged critical. |

**Two staff-side validation paths exist and no QR flow in this guide reaches
either**, so both take [contrast rows](#contrast-rows) rather than full ones — but
they are the answer to "how does a *staff member* export-validate?", and the
traveller `scan` above is not. They are the **next two functions** in the same
wrapper file as the traveller call:
`web-app/packages/actions/unirefund/ExportValidationService/post-actions.ts` has
`postQrEvidenceScanApi` at `:29` — the wrapper the registry cites for
`A22`/`A24`/`A90`/`A92`/`A96` — then `postQrEvidenceScanWithTravellerInfoApi` at
`:50` and `postSelfCheckEvidenceKioskVerifyApi` at `:73`. The first is also in the
same generated SDK class as the traveller call, one method below it
(`packages/saas/ExportValidationService/sdk.gen.ts:290` and `:321`); the second is
in `SelfCheckEvidenceService`, the class after it. Both are permission-gated where
the traveller call is not, which is the whole reason a staff caller must be sent to
them: the traveller `scan` **will** succeed from a staff token.

### DeviceService and ReportService

| Endpoint | Permission | Intended caller | Also called by | Must not call | Instead use | Actions | Body contract |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET /api/device-service/devices | DeviceService.Devices, DeviceService.Devices.ViewList | Customs | — | — | — | A73 | Device-type, identity and paging filters. The QR flow reads it for exactly one fact — that the customs office owns a Kiosk device — because the generate call above requires precisely one. |
| GET /api/report-service/reports/synchronously/by-entity | ReportService.Reports, ReportService.Reports.CreateSynchronously | Merchant, Refund Point, Customs, Admin | — | Traveller — *no grant*. | There is no traveller equivalent: the traveller-facing artefact is the tag's own `publicLink` QR, rendered client-side onto the printable form, not a service report | A61 | `entityType` and `entityId` in the query. Returns the rendered document synchronously, which is why it is a `GET` that creates something. |

### Contrast rows

Endpoints **no QR flow calls**, listed because they are what someone reaches for
instead. `— contrast` in `Actions` is what says so.

| Endpoint | Permission | Intended caller | Also called by | Must not call | Instead use | Actions | Body contract |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET /api/setting-service/product-group | SettingService.ProductGroups, SettingService.ProductGroups.ViewList | Admin maintaining the global catalogue | — | Merchant or Refund Point pricing a tag — *wrong DTO*. The catalogue carries `productGroupId` but neither `isDefault` nor `vatRate`, both of which live on the per-merchant relation, so it holds **no rate to price an amount against**. | `GET /api/crm-service/merchants/{id}/product-group` for a merchant's own store; `GET /api/tag-service/sticker-header/sticker-line/{stickerLineNumber}/merchant-info` for a Refund Point pricing a merchant it does not own | — contrast | Paging and sorting only. |
| POST /api/tag-service/tag/traveller-self-assign/by-tag-id | TagService.Tags, TagService.Tags.TravellerSelfAssignByTagId | Traveller, authenticated — "Host use only", and "No sales-amount proof is required because the Guid id is itself unguessable" | — | — | — | — contrast | `{ tagId }`, and nothing else. **No app calls it.** Both repositories define a wrapper — `web-app/packages/actions/unirefund/TagService/post-actions.ts:70` and `super-app/src/actions/TagService/actions.ts:92` — and neither is ever invoked, so choosing this endpoint means writing its first call site. It is not the wrong answer in principle; it is simply unreached, and a traveller who scanned a tag QR still claims through the by-number path with an amount taken from the public read. |
| GET /api/crm-service/merchants | CRMService.Merchants, CRMService.Merchants.ViewList | Admin, back-office merchant management | — | Refund Point choosing a merchant for an unallocated sticker book — *no grant* expected on the back-office list, which also exposes external identifier, chain code, parent and HQ identity and lifecycle status. | `GET /api/tag-service/tag/merchants-for-creation`, which exists precisely so the counter picker does not read the back-office list | — contrast | The full back-office filter set, paged. |
| PUT /api/tag-service/sticker-header/assign-merchant/{stickerLineNumber} | TagService.StickerHeaders, TagService.StickerHeaders.AssignMerchant | Sticker-stock administration | — | — | — | — contrast | `stickerLineNumber` in the path, `merchantId` in the query. No QR flow calls it, and none needs to: allocation happens on the first create against the book, [permanently](#sticker-allocation-permanent-on-first-use), so both scan flows send `merchantId` on the create instead. This endpoint, `PUT .../assign-merchant-from-claim/{stickerLineNumber}` and `PUT .../{stickerHeaderId}/assign-merchant/{merchantId}` are the **administrative** path for stock first-use-wins cannot reach — which is what "an allocation cannot be re-pointed" implies must exist somewhere. That they exist was once read here as evidence a create cannot allocate; that reading is **withdrawn**. All three carry no descriptive doc text, so none of them can be argued from prose either way. |
| POST /api/tag-service/tag/{id}/merchant-individual-signature | TagService.Tags, TagService.Tags.AddMerchantIndividualSignature | Merchant attaching a signature to a tag that has none | — | — | — | — contrast | `id` in the path, the base64 image in the body; fails if the tag already has a merchant signature. It is the only way to attach one after creation — so the field missing from `CreateTagByStickerLineRequestDto` is repairable in principle. No QR flow calls it, so in practice nothing repairs it. |
| POST /api/export-validation-service/qr-evidence/{qrValue}/scan-with-traveller-info | ExportValidationService.QrEvidence.ScanWithTravellerInfo | Customs or tax-free agent — "a customs / tax-free agent scans the kiosk QR on a non-tech traveller's behalf and enters the traveller's identifying info" | — | A traveller clearing their **own** tags — *wrong DTO*, and *no grant*. The body names whose tags to clear, so a traveller calling it would be asserting an identity rather than proving one; their own `TravellerDocumentId` claim already does that on the ungated path. | `POST /api/export-validation-service/qr-evidence/{qrValue}/scan` | — contrast | `qrValue` in the path. Body is `ScanWithTravellerInfoInput`: **required** `latitude`, `longitude` and `flightTicket`, plus the traveller — "either an existing `TravellerDocumentId` is supplied directly, or the document is upserted by document-number + nationality + name" (`travellerDocumentNumber`, `nationalityCountryCode3`, `firstName`, `lastName`, optional `expirationDate`, `birthDate`, `gender`). This is the row the traveller `scan` sends a staff caller to. **No QR flow reaches it**, so choosing it means writing its first call site — the wrapper exists (`web-app/packages/actions/unirefund/ExportValidationService/post-actions.ts:50`) and nothing invokes it. |
| POST /api/export-validation-service/self-check-evidence/kiosk-verify | ExportValidationService.SelfCheckEvidence, ExportValidationService.SelfCheckEvidence.KioskVerify | Customs kiosk device — "the kiosk device (its own authenticated account, CustomsId from claims, exactly one DeviceType.Kiosk device) verifies a traveller with no phone/QR" | — | Any caller expecting export validation to have happened — *side effect*, in the direction of doing **less** than the name suggests: "self-check never creates ExportValidation rows; customs export-validates the greens at end of day through the normal export-validation path." A caller that treats a 200 here as a cleared tag is wrong. | `POST /api/export-validation-service/qr-evidence/{qrValue}/scan` for a traveller with a phone, or `.../scan-with-traveller-info` for an agent acting on their behalf — both create the evidence a validation reads | — contrast | No `qrValue` and **no geolocation** — "the kiosk device / CustomsId identifies the exit point". `flightTicket` is **mandatory**. The traveller is resolved from **exactly one** of `tagId` ("Tag id from a scanned tag/receipt QR; resolved to the owning traveller"), an existing `travellerDocumentId`, or travel-document fields that upsert the document — so this is a **second QR-driven staff path**, keyed on a tag QR rather than a validate QR. Requires the caller own exactly one `DeviceType.Kiosk` device. **No QR flow reaches it**; the wrapper is `postSelfCheckEvidenceKioskVerifyApi` (`post-actions.ts:73`), never invoked. |

### Draft or Issued: `status` and `traveller` are coupled

Both create endpoints take a **`status`** of `Draft` or `Issued`
(`UniRefund_TagService_Tags_TagCreationStatus`), and both take an optional
**`traveller`**. They are not independent, and the choice is the **caller's** — not a
server default a caller can leave alone:

> `status: "Issued"` requires a traveller on the request; without one the backend
> expects `"Draft"`, which the traveller can later claim by scanning the tag QR.
> — `super-app/src/actions/TagService/post.ts:9-11`

So there are two ways to put a traveller on a tag, and the first is easy to miss
because it is not an endpoint of its own:

- **At creation** — send `traveller` and `status: "Issued"` in the create call. One
  round trip, no assign call. This is what both apps do whenever a traveller was
  captured before the create: `status: args.traveller ? "Issued" : "Draft"` at
  `super-app/src/screens/staff/StickerTag/stickerTag.logic.ts:146` and `:214`, and the
  same conditional at
  `web-app/apps/web/src/app/[lang]/(main)/(unirefund)/operations/scan-sticker/client.tsx:671`
  and `:694`. Both apps send it on **both** create paths.
- **After creation** — send `status: "Draft"`, omit `traveller`, and let someone attach
  one later. See [I need to put a traveller on a
  tag](#i-need-to-put-a-traveller-on-a-tag).

`Draft` is therefore not a fallback: **it is what makes a tag claimable at all.** Every
"the tag has no traveller yet, so the claim is offered" statement elsewhere in this
file is downstream of a create call that chose `Draft`. A caller who omits `status`
takes whatever the server decides and should not assume the claim path applies to the
resulting tag.

## Sticker allocation: permanent on first use

**Creating a tag against a sticker line whose book is not allocated yet allocates the
whole sticker header to the merchant you sent, permanently, and it cannot be
re-pointed.** That is the behaviour to design and test against. It is stated by the
current generation of the endpoint's own doc comment, and it has two cases the caller
must tell apart before calling.

### The two cases, from the create's own comment

Quoted from the current generation, `super-app/src/saas/TagService/sdk.gen.ts:414`:

> Merchant identity comes from the sticker line's allocation, which is
> **first-use-wins at sticker-header (book) level** — a sticker header carries no
> merchant until the first tag is created against one of its lines. There are
> therefore two cases: **Already allocated** — the allocated merchant is used and may
> be omitted. Supplying a different merchant is rejected; an allocation cannot be
> re-pointed. **Not allocated yet** — [the merchant id] is required (omitting it is
> rejected), and **creating the tag allocates the whole sticker header to that merchant
> permanently**.

| Case | What to send as `merchantId` | What the create does |
| --- | --- | --- |
| **Already allocated** — `isMerchantAllocated` is true | Nothing. Send it and it is **ignored**; send a *different* merchant and the request is **rejected** | Books the tag against the merchant the header already carries. The allocation cannot be re-pointed by any create |
| **Not allocated yet** — `isMerchantAllocated` is false | **Required.** Omitting it is rejected | Creates the tag **and allocates the entire sticker header** — every line in the book — to that merchant, permanently, with no call in this guide that undoes it |

Read `isMerchantAllocated` from
`GET /api/tag-service/sticker-header/sticker-line/{stickerLineNumber}/merchant-info`
first, every time. It exists to tell the two cases apart, and its own comment says so:
it *"drives the two-case UI"*, and its `merchantId` parameter is *"Optional. When the
sticker line is not allocated yet, pass the merchant the operator picked to preview its
details and product groups"* — a preview, not a commitment. The commitment is the
create.

**The hazard, stated plainly rather than hedged.** A wrong pick on an unallocated book
— an operator's mistake, a stale claim, a test run against stock someone still needed
— books a whole sticker header to a merchant nobody chose deliberately, and nothing in
this guide reverses it. It is silent: no error, and the same field is *ignored* on
allocated stock, so the code path tests clean against an allocated book and only bites
on a fresh one. Do not run a create against a sticker book anyone still needs
unallocated.

### The defect: `web-app`'s generated client is stale on this method

The reason this section reads as an adjudication is that one copy of the SDK still
disagrees, and it is the copy `apps/web` and `apps/ssr` developers read.
`web-app/packages/saas/TagService/sdk.gen.ts:547` says of the same endpoint:

> the sticker header **must already be assigned to a merchant, otherwise the request is
> rejected**

That is the older generation, and taken at face value it says the not-allocated case
does not exist. Worse, it contradicts `:266` in the **same file** — `merchant-info`,
which describes the operator picking a merchant on an unallocated line and the create
allocating it permanently. So `web-app`'s client contradicts itself, and `super-app`'s
does not.

### Why the newer reading is the accurate one

Four independent sources say allocation happens on the create. One known-stale copy
says otherwise. That is not a live dispute, and each of the four is checkable:

1. **The current generation of the create's own comment** —
   `super-app/src/saas/TagService/sdk.gen.ts:414`, quoted in full above. It is the only
   source in either tree that spells the two cases out, which is what a later, fuller
   generation looks like.
2. **`merchant-info` agrees, word for word, in both trees.** The prose is
   character-identical at `web-app/packages/saas/TagService/sdk.gen.ts:266` and
   `super-app/src/saas/TagService/sdk.gen.ts:147` — only the comment block's
   indentation differs, which is why this says *word* for word rather than byte
   for byte. Its `merchantId` parameter is
   documented — in *both* — for the unallocated case. A parameter documented for a case
   is not compatible with that case being rejected outright.
3. **`web-app`'s own client contradicts itself and `super-app`'s does not.** When one
   of two copies is internally inconsistent, that copy is the one to distrust.
4. **Both apps' call-site comments assert that the create allocates**, and both send
   `merchantId` *only* on an unallocated line — the shape the newer comment requires.
   `CreateTagByStickerLineRequestDto.merchantId` is itself documented as *"The merchant
   this tag belongs to, chosen by the operator from the merchant picker"*, a field with
   no purpose if an unallocated line were always rejected.

What is left of `web-app`'s sentence is a **narrower rule mis-stated**: what is
rejected is *omitting* the merchant id on an unallocated line, not the unallocated line
itself.

**The earlier reading of the `AssignMerchant` endpoints was backwards, and is
withdrawn.** `TagService.StickerHeaders.AssignMerchant`, `.AssignMerchantFromClaim` and
a third, `.AssignMerchantByHeaderId`, are not evidence that a create cannot allocate:
they are the administrative path for stock that first-use-wins cannot reach, which is
exactly what *"an allocation cannot be re-pointed"* implies must exist somewhere. All
three carry **no descriptive doc text at all** — their comment blocks open directly on
the `**Requires permissions:**` line — so no reading of them can be argued from prose
either way.

**So the apps are correct and the client is wrong.** `apps/web`'s scan-sticker
unallocated-book flow and `super-app`'s sticker-tag screen both do the right thing. The
defect is the stale copy, and it is worse than a cosmetic one: it is the client
`apps/web`'s and `apps/ssr`'s own developers read, it tells them a flow their app ships
is unsupported — inviting someone to "fix" working code — nothing detects the drift
between the two vendored trees, and it misled this guide's own survey until the two
copies were read side by side. It is capability `#34` in
[`../QR.md`](../QR.md#e-from-the-qr-handling-guide--2026-07-31): regenerate
`web-app/packages/saas/TagService`.

No doc comment is the implementation, so a caller writing genuinely new behaviour
against an unallocated line should still confirm with the service. That is ordinary
diligence, not an open question: for reading the guide, testing the apps, or writing a
caller that does what the apps already do, treat first-use-wins permanent allocation as
the established behaviour.

## Overlapping endpoints

One subsection per question that more than one endpoint answers. Read them as *"I
need X, as party P → call this."*

### I need a merchant's product groups

| Caller and need | Correct endpoint | Permission |
| --- | --- | --- |
| Merchant staff pricing a tag for their own store | `GET /api/crm-service/merchants/{id}/product-group` | `CRMService.Merchants, CRMService.Merchants.ViewProductGroupList` |
| Refund Point pricing for a merchant it does not own | `GET /api/tag-service/sticker-header/sticker-line/{stickerLineNumber}/merchant-info` | `TagService.StickerHeaders, TagService.StickerHeaders.ViewMerchantInfo` |
| Admin maintaining the global catalogue | `SettingService` ProductGroups CRUD | `SettingService.ProductGroups.*` |

`productGroupId` is the global id; `isDefault` and `vatRate` come from the
per-merchant relation. So the catalogue has no rate to price an amount against, and
the `TagService` projection is the only way a Refund Point gets a foreign merchant's
rates at all.

### I need to resolve a merchant's identity

| Caller and need | Correct endpoint | Permission |
| --- | --- | --- |
| Any staff operator, name and VAT number only, from a line already resolved | The `merchantId` / `merchantName` / `vatNumber` fields already on `GET /api/tag-service/sticker-header/sticker-line/{stickerLineNumber}` | `TagService.StickerHeaders, TagService.StickerHeaders.GetByLineNumber` |
| Merchant staff needing more than that — address, contacts, product groups | `GET /api/crm-service/merchants/{id}`, with the id from the sticker line or the operator's own claim | `CRMService.Merchants, CRMService.Merchants.View` |
| Refund Point, book already allocated | `GET /api/tag-service/sticker-header/sticker-line/{stickerLineNumber}/merchant-info` | `TagService.StickerHeaders, TagService.StickerHeaders.ViewMerchantInfo` |
| Refund Point, book not allocated yet, choosing which merchant | `GET /api/tag-service/tag/merchants-for-creation`, then the same merchant-info call with `merchantId` to preview the choice | `TagService.Tags, TagService.Tags.ViewMerchantsForCreation` |

Four sources, and two axes decide between them: **does the caller own the merchant**,
and **is the sticker book allocated**. The first row is the one most often missed —
the sticker-line read already carries the merchant's name and VAT number, so a
merchant needs no merchant-scoped lookup at all to display who the tag is for. That
is the whole of `#15`: the merchant path derives allocation from `stickerLine.merchantId`
and identity from the line itself, and reaches CRM only for what the line does not
carry.

The fourth row is the one with teeth. Previewing with `merchantId` is free —
merchant-info ignores it on an allocated line and otherwise only previews. Sending that
same `merchantId` to the **create** call is not free: on an unallocated book it
allocates the whole sticker header to that merchant permanently, and nothing in this
guide re-points it. Read [Sticker allocation: permanent on first
use](#sticker-allocation-permanent-on-first-use) before calling it on a book you did
not intend to commit.

### I need to look up a tag

| Caller, credential and need | Correct endpoint | Permission |
| --- | --- | --- |
| Anyone holding the tag's Guid id, logged in or not | `GET /api/tag-service/public/tag/by-tag-id/{id}` | `— anonymous` |
| A traveller holding a tag number **and** their own document number, logged in or not | `GET /api/tag-service/public/tag` | `— anonymous` |
| Anyone holding only a sticker line number, wanting the tag issued on it | `GET /api/tag-service/public/tag/by-sticker-line-number` | `— anonymous` |
| An authenticated traveller reading a tag **already assigned to them**, by number | `GET /api/tag-service/tag/cross-tenants/by-traveller-id-claim/{tagNumber}` | `TagService.Tags, TagService.Tags.GetTagByTagNumberCrossTenants` |
| Tenant staff holding a tag number | `GET /api/tag-service/tag/{tagNumber}/detail-by-tag-number` | `TagService.Tags, TagService.Tags.DetailByTagNumber` |
| Tenant staff holding a tag id | `GET /api/tag-service/tag/{id}/detail` | `TagService.Tags, TagService.Tags.Detail` |

Two questions split these six: **is the caller authenticated**, and **is the
identifier itself the credential**.

A tag's Guid id *is* a credential — "the unguessable Guid id is the credential" — so
the by-tag-id read needs no token and no second factor. A raw tag number is **not**:
it is guessable. That is why the anonymous by-number read demands the traveller's own
document number alongside it, and why the authenticated by-number read returns a tag
only when it is already assigned to the caller, reporting missing, Draft and
belonging-to-someone-else identically so it cannot be used as an oracle.

The consequence a reader will hit: an authenticated traveller **cannot** read a
not-yet-claimed Draft tag by its number. The right answer is the first row — read the
Draft by its Guid with the anonymous by-tag-id endpoint, which is what all three apps
do before a claim.

**There is deliberately no encrypted-tag-number row above, and a reader should not go
looking for one.** The cross-tenant lookup's own doc comment sends you there — *"To
read a not-yet-claimed Draft tag, use the by-encrypted variant, whose unpredictable
token is the credential"* — and the permission
`TagService.Tags.DetailByEncryptedTagNumber` is present in
`web-app/packages/utils/policies/policies.json:688`. But **no such method exists in
any generated SDK**: `TagPublicService` has exactly the three reads listed above, and
nothing in `web-app/packages/saas`, `super-app/src/saas` or `pos-app/src/saas` matches
it. Documented, permissioned, and ungenerated — so it is not a branch of this table,
and the anonymous by-tag-id read is the realised form of the same idea, its
unpredictable token being the tag's Guid.

### I need to create a tag against a sticker line

| Caller and need | Correct endpoint | Permission |
| --- | --- | --- |
| Merchant staff issuing for their own store, sticker scanned | `POST /api/tag-service/tag`, with `stickerLineNumber` set | `TagService.Tags, TagService.Tags.Create` |
| Merchant staff issuing with no sticker scanned | `POST /api/tag-service/tag`, `stickerLineNumber` omitted | `TagService.Tags, TagService.Tags.Create` |
| Refund Point issuing on behalf of a merchant it does not own | `POST /api/tag-service/tag/by-sticker-line` | `TagService.Tags, TagService.Tags.CreateByStickerLine` |

This is `#29`, and it is a permission boundary rather than a preference: merchants
hold `Tags.Create`, not `Tags.CreateByStickerLine`. Both apps once used the Refund
Point endpoint for every role.

The boundary is easy to miss because both endpoints accept a sticker line number, so
either *looks* like it would work. What separates them is where the merchant comes
from. `CreateTagRequestDto` takes the merchant **from the request**, which is correct
only for a merchant identifying itself; `CreateTagByStickerLineRequestDto` resolves
it **from the sticker line**, so the caller cannot influence it, and records the
creating Refund Point from its own affiliation claim. Every downstream rule is
otherwise identical — suspended-merchant gate, contract check, product-group and VAT
validation, refund-table calculation, sticker binding and risk evaluation.

Two consequences no 403 reports. The by-sticker-line DTO has **no merchant-signature
field and no sales-person field**, so a merchant on that path loses both silently;
both apps therefore render the merchant signature pad only for a merchant, with a
comment at each call site saying why. And `merchantId` on that DTO is **ignored once
the line is allocated** — accepted, and doing nothing. On an **unallocated** line the
same field is required and **permanently allocates the whole sticker book**: see
[Sticker allocation: permanent on first
use](#sticker-allocation-permanent-on-first-use).

Whichever create you are entitled to, **`status` and `traveller` are yours to set**, and
setting them is how a tag comes out either claimable or already assigned. That is a
separate decision from which endpoint creates the tag, and it is the one this table
does not answer — see [Draft or Issued: `status` and `traveller` are
coupled](#draft-or-issued-status-and-traveller-are-coupled).

### I need to put a traveller on a tag

| Caller and need | Correct endpoint | Permission |
| --- | --- | --- |
| Staff who **already have** the traveller when the tag is created — no assign call at all | The create itself: `traveller` plus `status: "Issued"` on `POST /api/tag-service/tag` or `POST /api/tag-service/tag/by-sticker-line` | `TagService.Tags.Create` or `TagService.Tags.CreateByStickerLine` — whichever create the caller is entitled to |
| Merchant, Refund Point or Customs staff assigning a traveller to a tag already created as a Draft | `POST /api/tag-service/tag/{id}/assign-traveller` | `TagService.Tags, TagService.Tags.AssignTraveller` |
| A traveller claiming a tag, holding its number and sales amount | `POST /api/tag-service/tag/traveller-self-assign` | `TagService.Tags, TagService.Tags.TravellerSelfAssign` |
| A traveller claiming a tag, holding only its Guid id | `POST /api/tag-service/tag/traveller-self-assign/by-tag-id` — **defined but called by no app** | `TagService.Tags, TagService.Tags.TravellerSelfAssignByTagId` |

**The first row is the one a reader misses**, because it is not an endpoint of its own
and so does not appear in the endpoint tables as an answer to this question. Both apps
take it whenever a traveller was captured before the create — one round trip, no
assign call — and fall back to `Draft` only when there is nobody to attach. It needs no
extra grant beyond the create the caller was already making. See [Draft or Issued:
`status` and `traveller` are coupled](#draft-or-issued-status-and-traveller-are-coupled).
The three rows below it are the post-create paths, and they exist because a tag issued
as a Draft has to be claimable later.

Among those three, staff-assigns-a-traveller and traveller-claims-their-own-tag are
**different operations**, and the names do not make that obvious. The bodies do: staff
send an entire traveller identity and no proof, because being authorised staff *is* the
proof; a traveller sends no identity at all — it comes from their claims — and a
sales amount as proof instead.

Getting this backwards fails in the worse direction. A staff console calling
`traveller-self-assign` would assign **the staff member** to the tag, because the
traveller is derived from the caller. The doc comment forbids a Tenant context
outright for exactly that reason.

The last row is a genuine gap rather than a choice. A traveller who scanned a tag QR
holds the Guid and nothing else, which is precisely the case the by-tag-id endpoint
was written for. No app calls it, so both apps read the tag publicly first and take
the sales amount out of that response to feed the by-number claim.

## Anti-patterns

Each entry leads with the **symptom**, because a reader about to repeat the mistake
recognises what goes wrong before they recognise the rule.

| Symptom | Why it happens | The correct call |
| --- | --- | --- |
| 403 for merchant staff on a lookup that works fine for a Refund Point | The caller is on `GET /api/tag-service/sticker-header/sticker-line/{stickerLineNumber}/merchant-info`, which is gated behind `TagService.StickerHeaders.ViewMerchantInfo` — required only by Refund Point's own actions. Web called it for **every** role. | Merchant staff read `merchantId`, `merchantName` and `vatNumber` off `GET /api/tag-service/sticker-header/sticker-line/{stickerLineNumber}`, then go to `GET /api/crm-service/merchants/{id}` and `GET /api/crm-service/merchants/{id}/product-group` for the rest. |
| A tag is created, and the merchant signature is nowhere on it — with no error | The caller is on `POST /api/tag-service/tag/by-sticker-line`, whose `CreateTagByStickerLineRequestDto` has no `merchantIndividualSignatureBase64`. The field is not rejected; it does not exist, so a captured image is dropped in silence. | Merchant staff post `POST /api/tag-service/tag`, which carries both signature fields and `stickerLineNumber`, so the sticker still binds in one call. |
| An unallocated sticker book ends up booked to the wrong store and cannot be changed back | `merchantId` was sent to `POST /api/tag-service/tag/by-sticker-line` on a line that was not allocated yet, and the create [allocated the whole header to it permanently](#sticker-allocation-permanent-on-first-use). No error, and the same field is silently *ignored* on an allocated line, so the path tests clean against allocated stock and only bites on a fresh book. | Read `isMerchantAllocated` from the merchant-info call first. Send nothing on an allocated line. On an unallocated line the field is required, so treat the create as the commitment it is: confirm the merchant owns that book before calling, and never run it against stock anyone still needs unallocated. Note that on web the Refund Point claim wins when a user holds both it and `MerchantId`, so an operator reaches this path without intending to. |
| A tag's frontline incentive is attributed to nobody | `CreateTagByStickerLineRequestDto` has no `salesPersonIndividualId`, and it is the standard create — not this one — that binds the creating user's own IndividualId when the field is omitted. | Correct for a Refund Point, whose counter is not the store's sales floor. A **merchant** seeing it is on the wrong endpoint: `POST /api/tag-service/tag` is theirs. |
| A traveller's claim assigns the wrong person, or a staff console silently claims a tag for the operator | `POST /api/tag-service/tag/traveller-self-assign` derives the traveller from the **caller's** claims, so a staff call names the staff member. Nothing in the request could have said otherwise. | Staff call `POST /api/tag-service/tag/{id}/assign-traveller` with the traveller in the body. The self-assign endpoints are for a traveller acting on their own tag, in a host context. |
| A traveller's tag lookup returns not-found for a tag that plainly exists | `GET /api/tag-service/tag/cross-tenants/by-traveller-id-claim/{tagNumber}` hides an unassigned Draft, and reports it identically to a missing tag so it cannot be used as an oracle. Before a claim, every tag is a Draft. | Read the Draft by its Guid with `GET /api/tag-service/public/tag/by-tag-id/{id}`, claim it, and only then read it by number. |

The **wrong endpoint** behind the first three is on record in
[`../QR.md`](../QR.md): the merchant-info symptom is capability `#15` (alias `#26`),
and both create symptoms are `#29` — every role posting to `by-sticker-line`. Both
were fixed together on 2026-07-30, because fixing which endpoint creates a tag does
not help a merchant who cannot get past the lookup. The third entry's *outcome* is a
separate matter that `#29` did not settle: it is the permanent allocation described
above, and the stale client that obscured it is capability `#34`.

The last three are traps this contract predicts rather than incidents already
recorded. They are here because none of them produces an error: each returns 200 and
does the wrong thing.

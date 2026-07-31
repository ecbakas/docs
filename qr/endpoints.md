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
`Actions`, the real permission, and one line on why it is the wrong answer here.
Nothing else is in. This is a QR guide, not an API reference; `TagService` alone has
55-plus methods, and risk configuration, refund operations and reporting get no rows
at all.

**`Permission`** is copied from the SDK's `**Requires permissions:**` annotation. Two
markers replace it, and they are not interchangeable:

- `— anonymous` — callable with **no token at all**.
- `— authenticated, no grant` — a bearer token is required, but there is no
  permission gate.

A missing annotation means no *permission* is required; it does not mean no *token*
is required. The distinction is load-bearing for the traveller who scans before
logging in.

**`Intended caller`** is the party the endpoint exists for. Where the cell carries a
**quoted phrase**, that phrase is the SDK doc comment naming the party, and the claim
is prose-backed. Where it carries an unquoted list of parties, that list is the union
of the registry's `Actor` values for the actions reaching the endpoint, and nothing
more is claimed than that. `Also called by` is for a party that legitimately calls it
too; it is `—` unless the registry actually shows a second party in a different role.

**`Must not call`** is the field that earns this file, and it always carries a
**reason**, of one of three kinds:

- *no grant* — verifiable from the annotation. The only kind a 403 reveals.
- *wrong DTO* — the request or response type has no field for something the caller
  holds or needs. No error is returned.
- *side effect* — a consequence the caller must not cause. No error is returned. The
  clean example is `merchantId` on the by-sticker-line create: it is **ignored once
  the sticker line is allocated**, so a field that looks accepted did nothing at all.
  What that same field does on an *unallocated* line is contradicted by the SDK
  itself, and this file records the disagreement rather than asserting either
  outcome — see [Sticker allocation: an unresolved contradiction](#sticker-allocation-an-unresolved-contradiction).

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

## Endpoints

### TagService — sticker lines

| Endpoint | Permission | Intended caller | Also called by | Must not call | Instead use | Actions | Body contract |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET /api/tag-service/sticker-header/sticker-line/{stickerLineNumber} | TagService.StickerHeaders, TagService.StickerHeaders.GetByLineNumber | Merchant, Refund Point | — | Traveller — *no grant*. Allocation and merchant identity are staff data. | `GET /api/tag-service/public/tag/by-sticker-line-number`, which returns the public projection of whatever tag the line already carries | A12, A43 | `stickerLineNumber` in the path, no body. Returns `StickerLineInfoDto`: `merchantId`, `merchantName`, `vatNumber`, `externalIdentifier`, `tagId`, `tagNumber`, `isUsed` — enough to answer both "is this sticker used" and "whose book is it" without a second call. |
| GET /api/tag-service/sticker-header/sticker-line/{stickerLineNumber}/merchant-info | TagService.StickerHeaders, TagService.StickerHeaders.ViewMerchantInfo | Refund Point — "The lookup step before CreateByStickerLineAsync" | — | Merchant staff — *no grant*, **observed**: this is the 403 behind `#15` (alias `#26`). | The sticker line's own `merchantId` / `merchantName` / `vatNumber` from `GET /api/tag-service/sticker-header/sticker-line/{stickerLineNumber}`, then `GET /api/crm-service/merchants/{id}` and `GET /api/crm-service/merchants/{id}/product-group` for the rest | A14, A48, A52 | `stickerLineNumber` in the path, optional `merchantId` in the query. Returns `isMerchantAllocated` plus a deliberately minimal merchant projection — business name, VAT number, a composed address, and the active product groups with one `isDefault` per VAT rate. `merchantId` is a **preview only** and is ignored once the line is allocated, because that allocation cannot be changed. This doc comment is also one of the two sources in [Sticker allocation: an unresolved contradiction](#sticker-allocation-an-unresolved-contradiction), so treat what it says about *unallocated* lines as disputed. |

### TagService — creating a tag

| Endpoint | Permission | Intended caller | Also called by | Must not call | Instead use | Actions | Body contract |
| --- | --- | --- | --- | --- | --- | --- | --- |
| POST /api/tag-service/tag | TagService.Tags, TagService.Tags.Create | Merchant — "the merchant creating the tag identifies itself in the request" | Admin — the new-tag form, with no sticker scanned | Refund Point issuing for a merchant it does not own — *wrong DTO*. `CreateTagRequestDto` takes the merchant identity **from the request**, so the caller asserts a merchant identity it must not assert, and `CreatedByRefundPointId` is never recorded against the tag. | `POST /api/tag-service/tag/by-sticker-line`, which resolves the merchant server-side from the sticker line and records the creating Refund Point from its own affiliation claim | A19, A27, A55, A62 | `CreateTagRequestDto`. Required: `merchant` (VAT number, optionally narrowed by external identifier) and `invoices`. Optional: `stickerLineNumber` — so a scanned sticker still binds in this one call — plus `travellerSignatureBase64`, `merchantIndividualSignatureBase64`, `salesPersonIndividualId`, `payoutTokenId`. |
| POST /api/tag-service/tag/by-sticker-line | TagService.Tags, TagService.Tags.CreateByStickerLine | Refund Point — "Intended for a Refund Point issuing a tag at its own counter" | — | Merchant — *no grant*, **observed** (`#29`); and *wrong DTO*: `CreateTagByStickerLineRequestDto` has no `merchantIndividualSignatureBase64` and no `salesPersonIndividualId`, so a captured merchant signature and the frontline-incentive attribution are dropped with no error at all. Any caller sending `merchantId` on a line that is not allocated yet — *side effect*, **but which one is disputed**: this endpoint's own doc comment says such a line is rejected outright, while the merchant-info comment says the create allocates the whole sticker header permanently. Both cannot be true, and this file does not pick between them — see [Sticker allocation: an unresolved contradiction](#sticker-allocation-an-unresolved-contradiction). | Merchants post `POST /api/tag-service/tag` with `stickerLineNumber` set. For `merchantId`: read `isMerchantAllocated` from `GET /api/tag-service/sticker-header/sticker-line/{stickerLineNumber}/merchant-info` first, and send nothing on an allocated line, where the field is ignored anyway. On an **unallocated** line there is no safe instruction to give until the contradiction is settled by the backend, because the two readings differ on whether the call fails or succeeds irreversibly | A20, A56 | `CreateTagByStickerLineRequestDto`. Required: `stickerLineNumber` and `invoices`. Optional: `merchantId`, `travellerSignatureBase64`, `payoutTokenId`. **No** `merchant`, **no** `merchantIndividualSignatureBase64`, **no** `salesPersonIndividualId` — the three fields the standard create has and this one does not. |
| GET /api/tag-service/tag/merchants-for-creation | TagService.Tags, TagService.Tags.ViewMerchantsForCreation | Refund Point — "the merchants a tag may be created on behalf of" | — | Merchant — *side effect*. The pick decides which merchant a sticker book gets booked to, and a merchant must never make that choice for a book; its own merchant id comes from its own affiliation claim, not from a picker. | `GET /api/crm-service/merchants/{id}` with the merchant id taken from the operator's own affiliation claim | A15, A51 | Optional partial `name` and `vatNumber`, paged. Returns id, name and VAT number only, and only ACTIVE merchants — deliberately not the back-office merchant list. |

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
| GET /api/crm-service/merchants/{id} | CRMService.Merchants, CRMService.Merchants.View | Merchant | — | Refund Point resolving a merchant it does not own — *no grant* on another merchant's CRM record. The `TagService` projection exists because the Refund Point has none. | `GET /api/tag-service/sticker-header/sticker-line/{stickerLineNumber}/merchant-info` when the book is allocated; `GET /api/tag-service/tag/merchants-for-creation` when it is not | A17, A50 | `id` in the path. The **full** merchant record — external identifier, tax office, chain code, parent and HQ identity, lifecycle state, e-mail and telephone — all of which the `TagService` projection deliberately withholds. |
| GET /api/crm-service/merchants/{id}/product-group | CRMService.Merchants, CRMService.Merchants.ViewProductGroupList | Merchant | — | Refund Point pricing a merchant it does not own — *no grant* on another merchant's CRM record. | `GET /api/tag-service/sticker-header/sticker-line/{stickerLineNumber}/merchant-info`, whose projection carries the same product groups with `isDefault` and `vatRate` | A16, A49 | `id` in the path. This is the **per-merchant relation**, which is where `isDefault` and `vatRate` live. `productGroupId` is the id of the global catalogue entry, which carries neither. |

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
| POST /api/export-validation-service/qr-evidence/{qrValue}/scan | — authenticated, no grant | Traveller, authenticated — "the traveller scans the kiosk's QR with their own authenticated device" | — | Merchant, Refund Point, Customs — *side effect*. The tags cleared are those of the **caller's own** `TravellerDocumentId` claim, and there is no permission gate to refuse a staff call, so nothing but the client stops one. Both staff apps refuse a validate QR before any call is made. | There is no staff equivalent: a validate QR is the traveller's own credential, and export validation from the staff side is not a QR-triggered action | A22, A24, A90, A92, A96 | `qrValue` in the path; body `{ latitude, longitude, flightTicket }`. The traveller is never in the body — the `TravellerDocumentId` claim decides whose tags are cleared. |
| POST /api/export-validation-service/customs-validation-qr/generate | ExportValidationService.CustomsValidationQrs, ExportValidationService.CustomsValidationQrs.Generate | Customs — "CustomsId is resolved from the caller's ... claim (never accepted as input)" | — | Traveller, Merchant, Refund Point — *no grant*, and there would be nothing to pass: the customs office is the caller's claim, so no other party can generate a QR on its behalf. | There is no alternative: only a customs kiosk generates a validate QR, and every other party reads one rather than asking for one | A74, A75 | **No parameters at all.** CustomsId and UserId both come from claims. Fails unless the caller owns **exactly one** Kiosk device — zero or several is treated as an operational failure and logged critical. |

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
| PUT /api/tag-service/sticker-header/assign-merchant/{stickerLineNumber} | TagService.StickerHeaders, TagService.StickerHeaders.AssignMerchant | Sticker-stock administration | — | — | — | — contrast | `stickerLineNumber` in the path, `merchantId` in the query. No QR flow calls it: both scan flows send `merchantId` on the create instead. Whether that is right, or whether this explicit call is the **required** first step for an unallocated line, is exactly what [Sticker allocation: an unresolved contradiction](#sticker-allocation-an-unresolved-contradiction) turns on — and that this endpoint and `PUT .../assign-merchant-from-claim/{stickerLineNumber}` exist at all, with their own permissions, is the strongest evidence that allocation is meant to be its own act. |
| POST /api/tag-service/tag/{id}/merchant-individual-signature | TagService.Tags, TagService.Tags.AddMerchantIndividualSignature | Merchant attaching a signature to a tag that has none | — | — | — | — contrast | `id` in the path, the base64 image in the body; fails if the tag already has a merchant signature. It is the only way to attach one after creation — so the field missing from `CreateTagByStickerLineRequestDto` is repairable in principle. No QR flow calls it, so in practice nothing repairs it. |

## Sticker allocation: an unresolved contradiction

**What happens when a tag is created against a sticker line that is not allocated to a
merchant yet is contradicted by the SDK's own two doc comments.** As of the stamp at
the top of this file, both of these ship in the same generated client:

- `POST /api/tag-service/tag/by-sticker-line` — *"the sticker header **must already be
  assigned to a merchant, otherwise the request is rejected**."*
- `GET /api/tag-service/sticker-header/sticker-line/{stickerLineNumber}/merchant-info`
  — *"If it is not, the operator must choose a merchant — and **creating the tag
  allocates the whole sticker header to that choice, permanently**."*

Both cannot be true. Either the create rejects an unallocated line, or it allocates
one irreversibly. This file does not pick a side, because the readings have opposite
consequences and each is serious in its own direction:

| If the accurate comment is | Then | And the consequence today is |
| --- | --- | --- |
| `by-sticker-line` — an unallocated line is rejected | Allocation has to be its own explicit call, before any create | The unallocated-book flow on `apps/web`'s scan-sticker page is **broken**, not merely dangerous: it sends `merchantId` on the create and expects the allocation to follow. Same for `super-app`'s sticker-tag screen. |
| `merchant-info` — the create allocates | `merchantId` for the wrong merchant permanently books someone else's stock | A wrong pick, or a stale claim, mis-allocates a whole sticker header with **no way back** — and it is silent, because the same field is ignored on allocated stock, so it tests clean. |

The evidence does not point evenly. `TagService.StickerHeaders.AssignMerchant` and
`TagService.StickerHeaders.AssignMerchantFromClaim` exist as **separate endpoints with
their own permissions** — which is what you would build if allocation were meant to be
an explicit act, and which would be largely redundant if the create already did it.
That tilts towards the rejection being current, and so towards the two apps' flows
being broken rather than hazardous.

Pointing the other way: `CreateTagByStickerLineRequestDto.merchantId` is documented as
*"The merchant this tag belongs to, chosen by the operator from the merchant picker"*,
a field with no purpose if an unallocated line is always rejected; and both apps send
it **only** when the line is unallocated, each with a call-site comment asserting that
the call then allocates.

**This is a backend question and needs a backend answer.** Until it has one, treat an
unallocated sticker line as *unresolved* rather than as either safe or lethal, and do
not write new callers against either reading. The one part not in dispute:
`merchantId` is **ignored** once the line is allocated, so on allocated stock the field
is accepted and does nothing.

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

The fourth row is the one with teeth, and it is also the one the SDK does not
currently answer. Previewing with `merchantId` is free — merchant-info ignores it on
an allocated line and otherwise only previews. Sending that same `merchantId` to the
**create** call is not free, but *what* it costs is contradicted by the SDK's own two
doc comments. Read [Sticker allocation: an unresolved
contradiction](#sticker-allocation-an-unresolved-contradiction) before relying on
either outcome.

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
the line is allocated** — accepted, and doing nothing. What it does on an unallocated
line is the one thing in this table the SDK does not settle: see [Sticker allocation:
an unresolved contradiction](#sticker-allocation-an-unresolved-contradiction).

### I need to put a traveller on a tag

| Caller and need | Correct endpoint | Permission |
| --- | --- | --- |
| Merchant, Refund Point or Customs staff assigning a traveller to a Draft tag | `POST /api/tag-service/tag/{id}/assign-traveller` | `TagService.Tags, TagService.Tags.AssignTraveller` |
| A traveller claiming a tag, holding its number and sales amount | `POST /api/tag-service/tag/traveller-self-assign` | `TagService.Tags, TagService.Tags.TravellerSelfAssign` |
| A traveller claiming a tag, holding only its Guid id | `POST /api/tag-service/tag/traveller-self-assign/by-tag-id` — **defined but called by no app** | `TagService.Tags, TagService.Tags.TravellerSelfAssignByTagId` |

Staff-assigns-a-traveller and traveller-claims-their-own-tag are **different
operations**, and the names do not make that obvious. The bodies do: staff send an
entire traveller identity and no proof, because being authorised staff *is* the
proof; a traveller sends no identity at all — it comes from their claims — and a
sales amount as proof instead.

Getting this backwards fails in the worse direction. A staff console calling
`traveller-self-assign` would assign **the staff member** to the tag, because the
traveller is derived from the caller. The doc comment forbids a Tenant context
outright for exactly that reason.

The third row is a genuine gap rather than a choice. A traveller who scanned a tag QR
holds the Guid and nothing else, which is precisely the case the by-tag-id endpoint
was written for. No app calls it, so both apps read the tag publicly first and take
the sales amount out of that response to feed the by-number claim.

## Anti-patterns

Each entry leads with the **symptom**, because a reader about to repeat the mistake
recognises what goes wrong before they recognise the rule.

| Symptom | Why it happens | The correct call |
| --- | --- | --- |
| 403 for merchant staff on a lookup that works fine for a Refund Point | The caller is on `GET /api/tag-service/sticker-header/sticker-line/{stickerLineNumber}/merchant-info`, which is gated behind `TagService.StickerHeaders.ViewMerchantInfo` — a Refund Point grant. Web called it for **every** role. | Merchant staff read `merchantId`, `merchantName` and `vatNumber` off `GET /api/tag-service/sticker-header/sticker-line/{stickerLineNumber}`, then go to `GET /api/crm-service/merchants/{id}` and `GET /api/crm-service/merchants/{id}/product-group` for the rest. |
| A tag is created, and the merchant signature is nowhere on it — with no error | The caller is on `POST /api/tag-service/tag/by-sticker-line`, whose `CreateTagByStickerLineRequestDto` has no `merchantIndividualSignatureBase64`. The field is not rejected; it does not exist, so a captured image is dropped in silence. | Merchant staff post `POST /api/tag-service/tag`, which carries both signature fields and `stickerLineNumber`, so the sticker still binds in one call. |
| Either an unallocated sticker book ends up booked to the wrong store and cannot be changed back, **or** issuing against a fresh book fails outright | `merchantId` was sent to `POST /api/tag-service/tag/by-sticker-line` on a line that was not allocated yet. Which of those two things happens is [the unresolved contradiction](#sticker-allocation-an-unresolved-contradiction): the create's own comment says the line is rejected, merchant-info's says the book is allocated permanently. Either way the field is silently ignored on an *allocated* line, so it tests clean against allocated stock. | Read `isMerchantAllocated` from the merchant-info call first, and send nothing on an allocated line. On an unallocated line there is no correct call to name until the backend settles which comment is accurate. Note that on web the Refund Point claim wins when a user holds both it and `MerchantId`, so an operator reaches this path without intending to. |
| A tag's frontline incentive is attributed to nobody | `CreateTagByStickerLineRequestDto` has no `salesPersonIndividualId`, and it is the standard create — not this one — that binds the creating user's own IndividualId when the field is omitted. | Correct for a Refund Point, whose counter is not the store's sales floor. A **merchant** seeing it is on the wrong endpoint: `POST /api/tag-service/tag` is theirs. |
| A traveller's claim assigns the wrong person, or a staff console silently claims a tag for the operator | `POST /api/tag-service/tag/traveller-self-assign` derives the traveller from the **caller's** claims, so a staff call names the staff member. Nothing in the request could have said otherwise. | Staff call `POST /api/tag-service/tag/{id}/assign-traveller` with the traveller in the body. The self-assign endpoints are for a traveller acting on their own tag, in a host context. |
| A traveller's tag lookup returns not-found for a tag that plainly exists | `GET /api/tag-service/tag/cross-tenants/by-traveller-id-claim/{tagNumber}` hides an unassigned Draft, and reports it identically to a missing tag so it cannot be used as an oracle. Before a claim, every tag is a Draft. | Read the Draft by its Guid with `GET /api/tag-service/public/tag/by-tag-id/{id}`, claim it, and only then read it by number. |

The **wrong endpoint** behind the first three is on record in
[`../QR.md`](../QR.md): the merchant-info symptom is capability `#15` (alias `#26`),
and both create symptoms are `#29` — every role posting to `by-sticker-line`. Both
were fixed together on 2026-07-30, because fixing which endpoint creates a tag does
not help a merchant who cannot get past the lookup. What the third entry's *outcome*
is remains open, and that is the contradiction above, not something `#29` settled.

The last three are traps this contract predicts rather than incidents already
recorded. They are here because none of them produces an error: each returns 200 and
does the wrong thing.

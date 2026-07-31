# QR handling — merchant

This file answers what a merchant's staff can do by scanning or presenting a QR
code.

_Verified against: 2026-07-31 · super-app `24221f7` · web-app `0cf122af0`._

## Which ids this chapter narrates

43 action ids: every registry row whose `Actor` names Merchant, plus the rows
whose `Actor` begins `Anyone` (`super-app`'s shared scan plumbing, reachable
before any role is chosen). 23 come from `super-app`, 20 from
`web-app/apps/web`. [`permissions-by-role.md` §
Merchant](permissions-by-role.md#merchant) files the identical 43 ids — checked
id-for-id against this chapter's list by hand rather than assumed, and the two
agree exactly: A01, A04, A05, A06, A10, A11, A12, A13, A16, A17, A18, A19, A21,
A26, A27, A29, A31, A32, A33, A34, A35, A36, A37, A39, A40, A41, A42, A43, A44,
A45, A46, A47, A49, A50, A53, A54, A55, A57, A58, A59, A60, A61, A62. No
disagreement to report between the registry and `permissions-by-role.md` on
this id set.

A04 and A33 are also narrated in [`traveller.md`](traveller.md) — their
`Actor` cells name three parties (`Traveller, Merchant, Refund Point`), so the
registry's cap allows up to three chapters, and this chapter's narration
describes a different branch of the same code than `traveller.md` does. This
chapter narrates what a merchant's staff experience and cites the id and the
`file:line` behind it. It does not restate what is already established
elsewhere: permission strings live in
[`permissions-by-role.md`](permissions-by-role.md), endpoint ownership and
body contracts in [`endpoints.md`](endpoints.md), and the wire format and
login/session mechanics in [`README.md`](README.md).

## Getting to a QR flow, as staff

On `super-app`, a merchant reaches the scanner from the same entry points a
traveller does — the role-select seam (`A01`,
`super-app/src/screens/shared/_components/SeamScanPill.tsx:69`, reachable
before any role, hence pre-login) and the centre tab once authenticated
(`A33`, `super-app/src/app/(auth)/_layout.tsx:128`) — and every read funnels
through the same shared pipeline (`A34`–`A37`), whose mechanics are described
once in [`traveller.md` § Getting to a QR
flow](traveller.md#getting-to-a-qr-flow) rather than twice here. What differs
for a merchant is which branch of that shared code actually runs, because
`scanDestination` takes the caller's role as a second argument
(`super-app/src/utils/qr/scanDestination.ts:26`–`29`) and a staff role changes
three of its four branches: a **sticker** scan routes to the staff create
screen rather than the read-only preview (`scanDestination.ts:51`–`59`, "Staff
issue a tag against the sticker; everyone else … reads the tag already issued
on it"); a **validate** scan is refused outright rather than opened
(`scanDestination.ts:61`–`64`, `kind: "blocked"`, performed by `A26`); and a
bare tag number a staff caller holds (a scanned Code128, or manual entry) is
resolved to its id server-side rather than sent through the anonymous public
read a traveller's bare number would need
(`scanDestination.ts:39`–`43`, `kind: "resolve-tag-number"` for `isStaff`,
performed by `A05` at `super-app/src/hooks/useScanRouting.ts:41`). A full tag
QR (carrying a tag id) is the one case that does **not** branch on role: every
caller, staff included, is routed to `/tag-preview` the same way
(`scanDestination.ts:44`–`48`) — see M3 below for what that means in practice.

`web-app/apps/web` has no equivalent shared launcher: `/operations/scan-sticker`
is a single staff-only page, and its own classification function (`A41`,
`operations/scan-sticker/client.tsx:161`) is a separate implementation from
`super-app`'s — see [README § `classifyScan` is not
shared](README.md#qr-types-and-the-wire-format) — reached by opening the
camera (`A39`, `client.tsx:826`) or by a wedge/keyboard scan while the page is
idle (`A40`, `client.tsx:556`). There is no manual-entry route on this side;
`A40`'s wedge path is the closest equivalent to `super-app`'s typed sticker
fallback described next.

**Manual sticker entry (`A04`).** `super-app`'s `/manual-entry` sticker mode
(`super-app/src/screens/shared/ManualEntryScreen.tsx:122`–`139`) asks only for
the sticker number — no passport field, since that field is hidden for staff
in tag mode too (`{!isStaff && (...)}`, `ManualEntryScreen.tsx:157`) and
sticker mode never shows it regardless of role. Submitting builds the
identical `sticker` classification a camera read would
(`buildManualEntryClassification`, cited in `actions-and-routes.md`'s notes)
and hands it to the same `routeScan`, so a merchant who types a sticker number
lands on `/sticker-tag` exactly as if they had scanned it — manual entry is
the same path entered further along, not a second lookup path. `traveller.md`
covers this same id from the traveller's side of the mode switch; there is
nothing sticker-specific left to add here beyond the routing destination,
which M2 below picks up.

## M1 — Validate QR

Nothing to do with it. A merchant scanning the traveller's airport validate QR
is refused with a message that names the problem, rather than a lookup
failure — `#22`. On `super-app`, `useScanRouting`'s `blocked` case fires a
toast and returns without calling anything (`A26`,
`super-app/src/hooks/useScanRouting.ts:80`–`85`). On `web-app/apps/web`,
`handleScan` checks for a validate classification before even attempting a
sticker lookup and toasts `AssignSticker.ValidateQrNotUsable` (`A42`,
`operations/scan-sticker/client.tsx:442`–`445`).

**Both apps check validate first, before any tag or sticker decode is even
attempted** — confirmed independently on each side: `super-app`'s
`classifyScan.ts:47` and `web-app`'s `client.tsx:164`. Checked later, an
undecoded validate URL would fall through to the wedge path on `web-app` and
be looked up as a sticker line number, surfacing as "sticker not found" rather
than "wrong QR"; see [README § Which QR each party may not
use](README.md#which-qr-each-party-may-not-use) for the fuller mechanics,
which this chapter does not repeat. Neither refusal is backed by a
permission gate: the endpoint behind a validate scan is
`— authenticated, no grant`, so `A26` and `A42` are client-side checks doing
the whole job — see [`endpoints.md`](endpoints.md)'s `ExportValidationService`
row.

## M2 — Sticker QR

A merchant scanning their own store's sticker sees whatever tag is already
linked to it and can assign a traveller there; an unlinked sticker instead
opens a create form, priced against that merchant's own product groups.

**Resolving the scanned line (`A12`/`A43`).** Both apps call the identical
endpoint, `GET /api/tag-service/sticker-header/sticker-line/{stickerLineNumber}`
— `super-app/src/screens/staff/StickerTag/useStickerLine.ts:106` and
`web-app/apps/web/.../scan-sticker/client.tsx:454`. Its response already
carries `merchantId`, `merchantName`, `vatNumber` and `tagId`/`isUsed`, which is
what lets both apps decide allocation and used-ness from this one call rather
than a second round trip — see [`endpoints.md`](endpoints.md)'s sticker-lines
table.

**A used sticker opens its tag instead of a create form (`#14`).** Confirmed
independently on both sides: `super-app`'s effect watches
`line.status.kind === "has-tag"` and replaces the route with `/tag-preview`
(`A13`, `super-app/src/screens/staff/StickerTag/StickerTagScreen.tsx:128`–`135`);
`web-app`'s `handleScan` checks `stickerLine.tagId || stickerLine.tagNumber`
and calls `openTag` (`A44`, `client.tsx:465`–`471`). `super-app` additionally
distinguishes a line that reports used but names **no** tag id at all — an
`already-used` terminal state with no navigation target
(`stickerTag.logic.ts:98`–`99`, `StickerTagScreen.tsx:291`–`305`) — a case the
registry gives no id of its own because it falls out of the same `A13` plan
rather than being a separately triggered action.

### Resolving the merchant without `ViewMerchantInfo` (`#15`)

Merchant staff do **not** hold `TagService.StickerHeaders.ViewMerchantInfo` —
one of only two grant facts this guide has actually observed rather than
merely derived (see [`permissions-by-role.md` § What this file does not
know](permissions-by-role.md#what-this-file-does-not-know)) — so the merchant
path is built to never call it at all, on either app, confirmed independently
on each side:

- **Allocation** comes from `stickerLine.merchantId` on the line read above,
  not a second call: `Boolean(line.merchantId)` at
  `super-app/src/screens/staff/StickerTag/stickerTag.logic.ts:101`, and
  `Boolean(stickerLine.merchantId)` at `client.tsx:475`.
- **Identity and product groups** come from CRM directly.
  `super-app`'s `own-merchant` branch calls `getProductGroupByIdApi` and
  `getMerchantsByIdApi` (`A16`, `A17`,
  `super-app/src/screens/staff/StickerTag/useStickerLine.ts:212`–`214`), with
  the comment there stating plainly: "A merchant holds no `ViewMerchantInfo`
  and needs none of it: the sticker line already names the allocated
  merchant" (`useStickerLine.ts:207`–`210`). `web-app`'s `lookupOwnMerchant`
  does the same two CRM calls (`A49`, `A50`, `client.tsx:236`–`239`), under a
  doc comment with the identical claim, by name: "Resolves the merchant's own
  details without `TagService.StickerHeaders.ViewMerchantInfo`"
  (`client.tsx:220`–`226`). Both apps fall back to the sticker line's own
  `vatNumber`/`merchantName` when the CRM detail call itself fails
  (`useStickerLine.ts:258`–`279`; `client.tsx:274`–`298`), so a degraded CRM
  read still leaves enough identity to price and create against, as long as
  the line is allocated.

Only a Refund Point calls the merchant-info endpoint — see
[`permissions-by-role.md` § Refund Point](permissions-by-role.md#refund-point)
and [`endpoints.md`](endpoints.md)'s anti-patterns table, which records this
exact 403 as its first entry.

### A sticker allocated to a different store (`#25`)

A merchant scanning a book already booked to someone else is refused, not
shown a create form that would only fail at submit. Both apps compute the
comparison **case-insensitively**, confirmed independently on each side,
because the two ids being compared arrive from different systems — the
sticker line (TagService) and the session's own merchant claim (the JWT) —
and neither is trusted to share casing:

- `super-app`: `sameMerchant(a, b)` trims and lower-cases both sides before
  comparing (`stickerTag.logic.ts:72`–`74`), used by `resolveMerchantPlan` to
  produce the `foreign-merchant` outcome (`A18`, `stickerTag.logic.ts:111`–`113`),
  which `StickerTagScreen` renders as a terminal message with no way forward
  (`StickerTagScreen.tsx:311`–`325`).
- `web-app`: the same comparison is inline —
  `stickerLine.merchantId?.trim().toLowerCase() !== ownMerchantId.trim().toLowerCase()`
  (`A47`, `client.tsx:483`–`486`) — and produces a terminal, read-only card
  with an error-toned notice (`buildMerchantProps`, `client.tsx:744`–`754`).

### An unallocated book: an unresolved contradiction

What happens when a tag is created against a sticker line **nobody has
allocated yet** is not something this guide asserts, because the SDK's own two
doc comments disagree about it — see [`endpoints.md` § Sticker allocation: an
unresolved contradiction](endpoints.md#sticker-allocation-an-unresolved-contradiction).
This chapter does not pick a side. What it can report, independently
confirmed on both apps, is what the **UI itself** tells the merchant on this
path — one specific reading of that contradiction, stated as fact in the
app's own comments, not something either app has verified against a real
allocation outcome:

- `super-app`'s `MerchantBlock` carries the comment "The allocation warning
  shows on both unallocated branches: it is equally true when the merchant is
  themselves"
  (`super-app/src/screens/staff/StickerTag/_components/MerchantBlock.tsx:12`–`13`),
  and renders `MobileApp.Qr.StickerTag.AllocationWarning` whenever the branch
  is not `"allocated"` (`MerchantBlock.tsx:57`–`70`) — including the `"self"`
  branch, a merchant booking against their own unallocated line
  (`stickerTag.logic.ts:16`–`18`: "creating this tag allocates it to them
  permanently — the warning stays").
- `web-app`'s `buildMerchantProps` shows the identical warning for
  `isMerchantUser` on an unallocated line, under the comment "issuing this tag
  allocates it to them permanently, so the warning stays"
  (`client.tsx:767`–`780`).

So a merchant booking a fresh, unallocated sticker book against their own
store sees a warning that reads as though it applies to someone else's
mistake — both apps' own source comments say why (they assume the create
allocates the book), and `endpoints.md` is where that assumption's accuracy is
tracked as unresolved rather than settled here.

### Creating a tag against the sticker (`A19`/`A55`)

A merchant creates through `POST /api/tag-service/tag`, covered by their
`TagService.Tags.Create` grant. Merchants do **not** hold
`TagService.Tags.CreateByStickerLine` — the second of the two grant facts this
guide has actually observed (`#29`) — so both apps gate the create call on
role rather than trying one endpoint and falling back:
`super-app/src/screens/staff/StickerTag/StickerTagScreen.tsx:82`–`86` and
`web-app/apps/web/.../client.tsx:385`–`390` both branch
`isMerchant ? "TagService.Tags.Create" : "TagService.Tags.CreateByStickerLine"`.
See [`endpoints.md` § I need to create a tag against a sticker
line](endpoints.md#i-need-to-create-a-tag-against-a-sticker-line) for the
permission boundary and what a merchant loses silently on the wrong endpoint
(no merchant signature field, no sales-person attribution) — not repeated
here.

The sticker **binds in the same call**: `CreateTagRequestDto.stickerLineNumber`
carries the scanned line, so no separate assign is needed —
`super-app/src/screens/staff/StickerTag/stickerTag.logic.ts:216` (`buildMerchantTagRequest`)
and `web-app/apps/web/.../client.tsx:682` (`stickerLineNumber:
stickerLine.stickerLineNumber`). The body carries
`merchant: { vatNumber, countryCode, externalIdentifier? }` and **no**
`merchantId` field anywhere in it — confirmed by reading the actual request
object built on both sides (`stickerTag.logic.ts:203`–`209`;
`client.tsx:672`–`681`): the merchant identifies itself by VAT number and
country, never by id.

`status` and `traveller` are the caller's choice, not a server default: with a
traveller attached the tag goes out `Issued`; without one, `Draft`, for the
traveller to claim later by scanning the same sticker — see
[`endpoints.md` § Draft or Issued](endpoints.md#draft-or-issued-status-and-traveller-are-coupled)
for the coupling rule, cited there against these same two call sites
(`stickerTag.logic.ts:146`; `client.tsx:671`). This chapter adds only that both
apps compute the same conditional independently: `args.traveller ? "Issued" :
"Draft"` and `hasTraveller ? "Issued" : "Draft"`.

**Merchants capture both signatures.** The merchant pad renders whenever the
operator is a merchant, regardless of whether a traveller is attached; the
traveller pad renders only once a traveller is:
`SignaturePads`'s `targets={isMerchant ? ["merchant", "traveller"] :
["traveller"]}` (`super-app/src/screens/staff/StickerTag/StickerTagScreen.tsx:490`–`499`)
and `web-app`'s merchant pad gated on `isMerchantUser` alone
(`client.tsx:911`–`918`, with the traveller signature captured separately
inside the traveller-attach dialog). `A21` and `A54` are these two capture
actions, one per app.

**Attaching a traveller before create (`A11`/`A53`).** A merchant can search
for a traveller by document number and attach them to the in-progress sale
before creating — `super-app/src/screens/shared/_components/SearchTraveller/SearchTraveller.tsx:74`
and, on `web-app`, `AddTravellerDialog`
(`web-app/apps/web/src/components/add-traveller-dialog.tsx`), which holds the
traveller purely as local component state (`setTraveller`) fed into the create
call above — it does not itself call the assign-traveller endpoint. That
endpoint, and how it differs, is covered next.

## M3 — Tag QR

A merchant scanning (or resolving) a printed tag QR sees the tag's own detail
and, if it is an unassigned Draft, can assign a traveller to it.

**Resolving a bare tag number (`A05`).** A Code128 barcode or a typed number
carries no id, so staff resolve it first through
`GET /api/tag-service/tag/{tagNumber}/detail-by-tag-number`
(`TagService.Tags.DetailByTagNumber`) —
`super-app/src/hooks/useScanRouting.ts:41` and, on `web-app`,
`openTag`'s fallback when a tag QR or wedge read carries only a number
(`A45`, `client.tsx:413`–`428`).

**What happens next diverges between the two apps, and this is worth stating
explicitly because it is easy to assume the same thing happens twice.**

- On **`super-app`**, every full tag QR — staff included — is routed to
  `/tag-preview` without a role check
  (`super-app/src/utils/qr/scanDestination.ts:44`–`48`), and that screen reads
  the tag through the **anonymous** `GET
  /api/tag-service/public/tag/by-tag-id/{id}` (`A06`,
  `super-app/src/screens/shared/TagPreviewScreen.tsx:70`–`71`) regardless of
  whether the caller is staff — the same call a logged-out traveller would
  make, gated on nothing but holding the id. Only once the merchant proceeds —
  either by assigning a traveller to a Draft (below) or by opening an already
  Issued tag's "View details" (`TagPreviewScreen.tsx:191`–`208`) — does the
  flow reach the tenant-scoped detail (`A31`,
  `super-app/src/screens/shared/Tags/TagDetail/useTagDetail.tsx:31`,
  `TagService.Tags.Detail`), at `/(auth)/tags/[tagId]`.
- On **`web-app/apps/web`**, there is no preview step: `openTag` navigates
  straight to the tenant-scoped detail page,
  `operations/tax-free-tags/{id}` (`A58`,
  `client.tsx:406`–`432`, `GET /api/tag-service/tag/{id}/detail`,
  `TagService.Tags.Detail`), gated client-side on holding
  `TagService.Tags.ViewSummary` — if that check fails, the scan is refused
  outright with `AssignSticker.TagViewNotGranted` and no navigation happens at
  all (`A46`, `client.tsx:393`–`396`, `408`–`411`).

So a merchant's first read of a scanned tag is anonymous on `super-app` and
tenant-scoped-and-permission-gated on `web-app` — the same registry id (`A06`)
serves both a logged-out traveller and `super-app`'s own staff, while
`web-app` never takes that anonymous path for staff at all. `A46`'s gate has
no `super-app` counterpart: nothing in `TagPreviewScreen` refuses to open a
tag on a missing grant client-side.

**`A46`'s own gate is worth a closer look, because the permission it checks
does not obviously match the endpoint it protects.** `canViewTag` in
`web-app/apps/web/.../scan-sticker/client.tsx:393`–`396` requires
`TagService.Tags.ViewSummary` before allowing navigation to the tag detail
page — but that page's own read (`A58`) requires `TagService.Tags.Detail`
(confirmed above), and `TagService.Tags.ViewSummary` is, per its own SDK doc
comment, the permission for a **different**, unrelated aggregate-report
endpoint: "Returns an aggregate summary … Financial … Risk …" over financial
totals and per-risk-level counts (`web-app/packages/saas/TagService/sdk.gen.ts:791`–`793`).
No registry row reaches that summary endpoint at all — this QR flow has
nothing to do with it. An operator holding `Detail` but not `ViewSummary`
would be refused a tag they are otherwise entitled to open; the reverse holder
would pass this client gate and then meet the server's own `Detail` check.
This is a new Finding, routed to Task 13 below — it is not something this
chapter resolves.

### Assigning a traveller (`A10`/`A32`/`A59`)

`POST /api/tag-service/tag/{id}/assign-traveller`,
`TagService.Tags.AssignTraveller`. A merchant reaches it two ways on
`super-app` — the Assign button on a scanned Draft's preview (`A10`,
`super-app/src/screens/shared/TagPreviewScreen.tsx:177`, confirmed at the call
site `postApiTagServiceTagByIdAssignTraveller({ id: tagId, requestBody: {
traveller } })`, `TagPreviewScreen.tsx:134`–`137`) and the identical action
from the tag-detail screen once a tag is reached some other way (`A32`,
`super-app/src/screens/shared/Tags/TagDetail/TagDetailScreen.tsx:209`, gated
on `isStaff && isDraft`, `TagDetailScreen.tsx:206`–`214`). `web-app` has only
the tag-detail route, since it never shows a preview step: the assign
popover on the detail page (`A59`,
`web-app/apps/web/.../tax-free-tags/[tagId]/_components/assign-traveller.tsx:209`,
confirmed at the call site `postTagByIdAssignTravellerApi({ id: tagId,
requestBody: { traveller: newFormData } })`, `assign-traveller.tsx:179`–`184`).

**Distinguish this from the traveller's own self-assign endpoints — different
operations, different permissions, and the names hide it.** Both call sites
above post only `{ traveller }`, never a sales amount: the authorised staff
caller *is* the proof. The traveller-facing endpoints (`POST
/api/tag-service/tag/traveller-self-assign` and its never-called by-tag-id
sibling) instead derive the traveller from the **caller's own** claims and
demand a sales amount as proof — narrated from the traveller's side in
[`traveller.md`](traveller.md), never from this one, since no Merchant- or
`Anyone`-actor id names them. See [`endpoints.md` § I need to put a traveller
on a tag](endpoints.md#i-need-to-put-a-traveller-on-a-tag) for the full
decision table and the concrete failure mode of getting this backwards (a
staff console calling the traveller endpoint assigns *the staff member*) —
not repeated here.

## Creating a tag with no sticker at all (`A27`/`A62`)

Outside the two sticker-triggered flows above, a merchant can also create a
tag from a dedicated screen that never involved a scan: `super-app`'s Create
Tag tab (`A27`, `super-app/src/screens/merchant/CreateTag/CreateTagScreen.tsx:257`)
and `web-app`'s new-tag page (`A62`,
`web-app/apps/web/.../operations/tax-free-tags/new/client.tsx:176`, also
reachable by Admin — see [`permissions-by-role.md` §
Admin](permissions-by-role.md#admin)). Both post the identical
`CreateTagRequestDto` shape as the sticker path — the same
`merchant: { vatNumber, countryCode, externalIdentifier? }` identity, the same
`status: traveller ? "Issued" : "Draft"` coupling
(`super-app/src/screens/merchant/CreateTag/useCreateTag.ts:103`–`128`;
`web-app/apps/web/.../new/client.tsx:152`–`176`) — with `stickerLineNumber`
simply absent, since there is no sticker to bind. `web-app`'s version adds a
sales-person and payout-token selector this chapter does not detail further;
neither is unique to a QR-triggered action, so [`endpoints.md`](endpoints.md)'s
body-contract cells are the reference for both, not this paragraph.

## After creating or assigning: the tenant's tag list

Every create or assign above refreshes the same list a merchant can open
directly: the Tags tab on `super-app` (`A29`,
`super-app/src/hooks/useLoadTags.tsx:93`, `getTenantTags`, scoped to
`"Staff"` via `tagScopeForRole`, `useLoadTags.tsx:88`–`94`) and
`/operations/tax-free-tags` on `web-app` (`A57`,
`web-app/apps/web/.../tax-free-tags/page.tsx:40`). Opening a row reaches the
same tenant detail already covered under M3 (`A31`/`A58`), from which a
merchant can render the tag's own QR onto the printable form (`A60`,
`web-app/apps/web/.../[tagId]/_components/print-tag.tsx:286`, encoding
`tagDetails.publicLink` — see [README § Where the codes come
from](README.md#where-the-codes-come-from) for who authors that value) or
print it through the report service (`A61`,
`web-app/apps/web/.../[tagId]/_components/tag-actions.tsx:115`). Body
contracts and permissions for all of these are
[`endpoints.md`](endpoints.md)'s and
[`permissions-by-role.md`](permissions-by-role.md)'s to state, not this
chapter's to repeat.

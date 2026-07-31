# QR handling — refund point

This file answers what a Refund Point operator can do by scanning or
presenting a QR code at the counter — the party that issues tags on behalf of
a merchant it does not own.

_Verified against: 2026-07-31 · super-app `24221f7` · web-app `0cf122af0`._

## Which ids this chapter narrates

41 action ids: every registry row whose `Actor` names Refund Point, plus the
rows whose `Actor` begins `Anyone`. 21 come from `super-app`, 20 from
`web-app/apps/web`: A01, A04, A05, A06, A10, A11, A12, A13, A14, A15, A20, A21,
A26, A29, A31, A32, A33, A34, A35, A36, A37, A39, A40, A41, A42, A43, A44, A45,
A46, A48, A51, A52, A53, A54, A56, A57, A58, A59, A60, A61, A76.
[`permissions-by-role.md` § Refund
Point](permissions-by-role.md#refund-point) files the identical 41 ids —
checked id-for-id against this chapter's list by hand rather than assumed,
and the two agree exactly. No disagreement to report between the registry and
`permissions-by-role.md` on this id set.

Most of these ids are shared code, and the 41 split three ways exactly:

- **25** carry Merchant in their `Actor` cell and are already narrated in
  [`merchant.md`](merchant.md): A05, A10, A11, A12, A13, A21, A26, A29, A31,
  A32, A39, A40, A41, A42, A43, A44, A45, A46, A53, A54, A57, A58, A59, A60,
  A61.
- **8** also carry Traveller or `Anyone` and are narrated in
  [`traveller.md`](traveller.md) too: A01, A04, A06, A33, A34, A35, A36, A37.
  (A04 and A33 name all three parties; the other six are `Anyone`.)
- **8** are Refund-Point-only: A14, A15, A20, A48, A51, A52, A56 and A76. The
  last of those is the disabled scan-into-a-refund row, `— client only`, and is
  covered by cross-link below rather than narrated at length.

The registry's cap allows a row to appear once per party its `Actor` names, so a
shared id narrated here is a **second or third** telling of the same code, from
the Refund Point's own side of it — what a Refund Point operator specifically
experiences, cited by `file:line` — not a restatement of `merchant.md`'s or
`traveller.md`'s prose. Permission strings live in
[`permissions-by-role.md`](permissions-by-role.md), endpoint ownership and
body contracts in [`endpoints.md`](endpoints.md), and the wire format and
login/session mechanics in [`README.md`](README.md) — none of that is
repeated here.

## Getting to a QR flow, as a Refund Point operator

The entry points and the shared scan pipeline are identical to a merchant's:
`super-app`'s role-select seam (`A01`), centre tab (`A33`) and the four-stage
pipeline (`A34`–`A37`) are described once in [`merchant.md` § Getting to a QR
flow, as staff](merchant.md#getting-to-a-qr-flow-as-staff), and
`web-app/apps/web`'s camera (`A39`), wedge scan (`A40`) and `classifyScan`
(`A41`) the same. Confirmed directly rather than assumed: `scanDestination`
takes only a single boolean, `isStaff`
(`super-app/src/utils/qr/scanDestination.ts:26`–`29`), and every branch that
changes for staff — sticker routes to the create screen, validate is blocked,
a bare tag number resolves server-side — keys on that one flag, with no
second parameter and no case anywhere in the function that reads `isMerchant`
or `isRefundPoint` separately. So a Refund Point and a merchant's staff are
routed identically at this layer; the two roles first diverge **inside**
`/sticker-tag` and `/operations/scan-sticker`, not before them. On
`web-app/apps/web`, `classifyScan` (`client.tsx:161`) takes no role argument
at all — confirmed by reading the function signature — so the same holds
there by construction, not by observation.

**Manual sticker entry (`A04`)** is the same typed fallback described in
`merchant.md` — `super-app/src/screens/shared/ManualEntryScreen.tsx:122`–`139`
asks only for the sticker number, staff and traveller alike, and hands the
same `sticker` classification to the same `routeScan` a camera read would.
There is nothing Refund-Point-specific to add to that routing description; R2
below picks up from the destination it reaches.

## R1 — Validate QR

Nothing to do with it. A Refund Point scanning the traveller's airport
validate QR is refused with a message that names the problem, exactly as a
merchant is — the same code, not a parallel implementation:
[`merchant.md` § M1](merchant.md#m1--validate-qr) narrates `A26`
(`super-app/src/hooks/useScanRouting.ts:80`–`85`, the `blocked` case) and `A42`
(`web-app/apps/web/.../scan-sticker/client.tsx:442`–`445`,
`AssignSticker.ValidateQrNotUsable`) in full. Both refusals fire on `isStaff`
or on a classification check with no role branch at all — confirmed above —
so there is no Refund-Point-specific behaviour here to narrate separately.
Neither refusal is backed by a permission gate: the endpoint behind a
validate scan is `— authenticated, no grant`, so the client-side check is the
whole defence — see [README § Which QR each party may not
use](README.md#which-qr-each-party-may-not-use).

## R2 — Sticker QR

A Refund Point scanning a store's sticker sees whatever tag is already linked
to it and can assign a traveller there; an unlinked sticker opens a create
form priced against whichever merchant the book is allocated to, or against a
merchant the operator picks.

**Resolving the scanned line (`A12`/`A43`) and a used sticker (`A13`/`A44`).**
Identical to the merchant path — same endpoint, same response shape, same
`has-tag`/`already-used` precedence, checked in `resolveMerchantPlan` before
any role branch runs at all
(`super-app/src/screens/staff/StickerTag/stickerTag.logic.ts:96`–`99`). See
[`merchant.md` § M2](merchant.md#m2--sticker-qr) for the call sites and the
`endpoints.md` sticker-lines row; not repeated here.

**A Refund Point never hits the "someone else's store" refusal a merchant
does (`#25`).** Confirmed independently on both apps that this is structural,
not merely untested: on `super-app`, `resolveMerchantPlan`'s `foreign-merchant`
and `broken-session` outcomes are produced only inside the `isMerchant`
branch — the `if (!isMerchant)` branch above them returns
`refund-point-allocated` or `refund-point-unallocated` and never reaches that
code at all (`stickerTag.logic.ts:103`–`113`). On `web-app`, `isForeignAllocation`
is computed only inside the `if (ownMerchantId)` block; the Refund Point
branch below it (`client.tsx:523`–`547`) always sets
`isForeignAllocation: false` (`:541`). A Refund Point isn't excluded from any
merchant's book — issuing on a merchant's behalf is the whole point of this
role — so an allocated line is always previewable, never a terminal refusal,
regardless of which merchant it belongs to.

### Resolving the merchant: allocated preview or unallocated pick (`A14`/`A48`, `#15`)

**An allocated book is never told who its merchant is a second time**: the
sticker line already names it (`stickerLine.merchantId`), and the backend
documents the `merchantId` query parameter on the merchant-info call as
ignored once allocated — see [`endpoints.md` § I need to resolve a merchant's
identity](endpoints.md#i-need-to-resolve-a-merchants-identity). Both apps
derive `isAllocated`/`isMerchantAllocated` from `Boolean(line.merchantId)`
read off the sticker-line response itself, confirmed independently on each
side: `stickerTag.logic.ts:101` and `client.tsx:475`. On an allocated line, a
Refund Point's next call is `GET .../merchant-info` with **no** `merchantId`
query parameter — `useStickerLine.ts:181`–`182` (`refund-point-allocated`
branch, `A14`) and `client.tsx:523`–`528` (`lookupMerchantInfo(stickerLine
.stickerLineNumber, undefined)`, `A48`) — which is what previews the fixed
merchant's name, VAT number and active product groups without a second,
merchant-owning call.

**Refund Points do call `GET .../merchant-info`
(`TagService.StickerHeaders.ViewMerchantInfo`); merchants never do.** This
grant is one of the two facts this guide has actually observed rather than
derived (`#15`) — see [`permissions-by-role.md` § What this file does not
know](permissions-by-role.md#what-this-file-does-not-know). Verified on both
sides that the merchant path is built to never reach this endpoint at all:
`super-app`'s `own-merchant` branch calls CRM directly
(`getProductGroupByIdApi`/`getMerchantsByIdApi`, `useStickerLine.ts:212`–`214`),
and `web-app`'s `lookupOwnMerchant` does the same two CRM calls
(`client.tsx:236`–`239`) under a doc comment stating the same thing by name
(`client.tsx:220`–`226`). See [`endpoints.md`](endpoints.md)'s anti-patterns
table, whose first entry is exactly this 403, and
[`merchant.md` § Resolving the merchant without
`ViewMerchantInfo`](merchant.md#resolving-the-merchant-without-viewmerchantinfo-15)
for the merchant side of the same boundary — not repeated here. One timing
difference between the two apps, worth stating precisely rather than
rounding to "both call it the same way": on `super-app`, an **unallocated**
line makes no merchant-info call at all until the operator actually picks a
store (`useStickerLine.ts:167`–`175`, `refund-point-unallocated` sets `ready`
with no I/O); on `web-app`, the initial `handleScan` for a Refund Point calls
`lookupMerchantInfo` once immediately, with `merchantId` left `undefined`,
whether the line is allocated or not (`client.tsx:525`–`528`) — the query
parameter is what's withheld until a pick, not the call itself.

### Picking a merchant on an unallocated line (`A15`/`A51`/`A52`, `#11`)

`GET /api/tag-service/tag/merchants-for-creation`
(`TagService.Tags.ViewMerchantsForCreation`) is what the picker searches:
`super-app`'s `SearchMerchant`
(`super-app/src/screens/staff/StickerTag/_components/SearchMerchant.tsx:46`,
`A15`) and `web-app`'s inline `AsyncSelectBase` fed by
`searchMerchantsForTagCreation` (`client.tsx:785`, `A51`). Choosing a result
re-previews it against the same merchant-info call, this time **with** the
picked id, on both apps: `useStickerLine.selectMerchant`
(`useStickerLine.ts:300`–`324`) and `handleMerchantSelect` (`client.tsx:575`
–`600`, `A52`) — neither allocates anything yet; the comment on both sides
says so explicitly ("the line stays unallocated — nothing is allocated until
the tag is created", `useStickerLine.ts:297`–`298`; `client.tsx:577`–`578`).
A Refund Point lacking `ViewMerchantsForCreation` gets a terminal `blocked`
state instead of a dead picker: `MerchantBlock`'s `NoPickPermission` text
(`MerchantBlock.tsx:32`–`35`) on `super-app`, and `buildMerchantProps`'s
`hint` mode (`client.tsx:794`–`798`, `AssignSticker.SelectMerchant`) on
`web-app`.

**Changing an already-made pick discards the invoice lines, and the two apps
discard different amounts of state doing it.** Product-group VAT rates
belong to the merchant, so a line priced against the previous pick cannot
survive a second one — posting it would bill one store's amounts against
another's VAT rates. On `super-app`, `SearchMerchant`'s `onSelect` calls
`sale.resetCart()` (which only empties `items`, via `setItems([])`,
`useStickerTag.ts:106`) and clears the picked product-group chip
(`StickerTagScreen.tsx:507`–`518`); the invoice number the operator already
typed (`sale.invoiceNumber`) is untouched, since `resetCart` never touches
it. On `web-app`, `handleMerchantSelect` instead replaces the **whole**
invoice with `buildInitialInvoice()` (`client.tsx:599`,
`invoice.ts:48`–`57`) — a fresh `uuid`, an empty `invoiceLines: []`, **and** a
blanked `invoiceNumber` and reset `issueDate`. So on `web-app`, re-picking a
merchant also clears whatever invoice number was already typed; on
`super-app`, it doesn't. This is a genuine cross-app difference, not the same
behaviour described twice.

**One rendering difference worth noting, since it is not about data sent,
only about what the operator sees.** The allocation warning (the one that
reads "creating this allocates the book permanently") shows on
`super-app`'s picker branch **only once a merchant has actually been chosen**
— `MerchantBlock` withholds it while `merchant` is still null, with the
comment "warning about 'this store' before there is one reads as a
contradiction" (`MerchantBlock.tsx:61`–`70`). `web-app`'s equivalent
(`canPickMerchant` branch, `client.tsx:781`–`793`) sets the same notice
unconditionally, and `MerchantSelector` renders whatever `notice` it is given
with no check on the picked value (`merchant-selector.tsx:169`–`173`) — so a
Refund Point on `web-app` sees the warning the instant an unallocated line
resolves, before picking anyone. See [`merchant.md` § An unallocated book: the
create allocates it,
permanently](merchant.md#an-unallocated-book-the-create-allocates-it-permanently)
for what the warning asserts and the evidence that it is right — not repeated
here; this paragraph is only about *when* it appears.

### Creating the tag (`A20`/`A56`, `#10`, `#29`)

A Refund Point creates through `POST /api/tag-service/tag/by-sticker-line`,
gated on `TagService.Tags.CreateByStickerLine` — the grant that exists for
issuing on behalf of a merchant the operator does not own, and the one a
merchant lacks. `super-app`'s `useStickerTag.submit()` branches to
`postTagByStickerLine` when `!isMerchant`
(`useStickerTag.ts:163`–`176`, `A20`), and `web-app`'s `handleIssueTag`
branches the same way on `!isMerchantUser`
(`client.tsx:691`–`706`, `A56`). See [`endpoints.md` § I need to create a tag
against a sticker line](endpoints.md#i-need-to-create-a-tag-against-a-sticker-line)
for the permission boundary and the two silent losses (no merchant signature,
no sales-person attribution) a caller on the wrong endpoint would hit — not
repeated here.

**The body carries `stickerLineNumber`, `merchantId` only when the line is
not yet allocated, and `travellerSignatureBase64` when a traveller is
attached — and `CreateTagByStickerLineRequestDto` has no merchant-signature
field at all.** Verified directly against the generated type, not against
`endpoints.md`'s own description of it:
`web-app/packages/saas/TagService/types.gen.ts:766`–`794` declares `status`,
`traveller`, `invoices`, `payoutTokenId`, `payoutToken`,
`travellerSignatureBase64`, `stickerLineNumber` and `merchantId` — no
`merchantIndividualSignatureBase64` and no `salesPersonIndividualId` anywhere
on the type. Both apps build the body to match: `super-app`'s
`buildStickerTagRequest` spreads `merchantId` only
`...(args.isMerchantAllocated ? {} : { merchantId: args.merchantId })`
(`stickerTag.logic.ts:148`), and `web-app`'s inline body does the same,
`...(isMerchantAllocated ? {} : { merchantId })` (`client.tsx:699`). Neither
app's Refund Point path renders a merchant-signature control at all — the
comment at `client.tsx:905`–`909` states why by name ("A Refund Point's
`CreateTagByStickerLineRequestDto` has no merchant-signature field, so
nothing renders for that role"), and `super-app`'s `SignaturePads` is only
ever given `["traveller"]` as its `targets` for a non-merchant caller
(`StickerTagScreen.tsx:496`–`499`).

**An allocated book is derived, not asked about again, and an unallocated
one is an unresolved question this chapter does not settle.** The create
call's own `merchantId` parameter is documented as ignored once the line is
allocated, so both apps omit it entirely on that branch — the "allocated"
half of the sentence above is settled. So is the other half: creating against
an **unallocated** line allocates the whole sticker book to the merchant sent,
permanently, and nothing in this guide re-points it — see [`endpoints.md`
§ Sticker allocation: permanent on first
use](endpoints.md#sticker-allocation-permanent-on-first-use) for the two cases
and the evidence. Both apps' own source comments say exactly this
(`stickerTag.logic.ts:16`–`18`; `client.tsx:697`–`698`), which is why the UI
described above behaves as if picking is a one-way door. It is one. For a
Refund Point that is the sharpest edge on this page: the merchant is picked
from a search box, and the pick is the commitment.

**Status and traveller are the operator's choice, coupled the same way as
the merchant path**: `args.traveller ? "Issued" : "Draft"`
(`stickerTag.logic.ts:146`) and `hasTraveller ? "Issued" : "Draft"`
(`client.tsx:694`). See [`endpoints.md` § Draft or
Issued](endpoints.md#draft-or-issued-status-and-traveller-are-coupled) for
the coupling rule; not repeated here.

**The stale-signature exposure `merchant.md` reports for the merchant path
also applies to the Refund Point path on `super-app` — same hook, same
gating, checked directly rather than assumed to carry over.** `useStickerTag`
is the **one** hook both roles share; it converts whatever is in
`signatures.traveller` to base64 unconditionally
(`useStickerTag.ts:130`–`134`), and `buildStickerTagRequest` — the Refund
Point's own request builder, not the merchant's —
includes `travellerSignatureBase64` whenever that value is merely
**non-empty**, with no check on `args.traveller` anywhere in the function
(`stickerTag.logic.ts:160`–`162`). Nothing in `StickerTagScreen` resets
`signatures.traveller` when `sale.setTraveller(null)` is called (confirmed by
reading the whole screen: the traveller-removal button at
`StickerTagScreen.tsx:389`–`399` calls only `sale.setTraveller(null)`, no
signature reset). So on `super-app`, a Refund Point who signs the traveller
pad and then removes the traveller (or never attaches one) still sends that
signature on a `Draft` tag with no traveller on it — the same combination
`merchant.md` describes for the merchant path, produced by the identical
code, not a separate bug.

**`web-app`'s Refund Point create call withholds the signature explicitly,
the same way the merchant call does — verified at the Refund Point's own
call site, not inferred from the merchant one.**
`travellerSignatureBase64: hasTraveller ? travellerSignature?.split(",")[1] :
undefined` appears at **both** create call sites, the merchant one
(`client.tsx:686`–`688`) and the Refund Point one
(`client.tsx:701`–`703`) — so `web-app` does not carry this exposure on
either role. And the guard against a **stale** signature surviving a
traveller change is shared code, not merchant-specific: `TravellerForm`
clears its own saved signature the instant the attached traveller changes or
is cleared (`traveller-form.tsx:63`–`82`), and it is rendered unconditionally
by `AddTravellerDialog`, which `TagForm` mounts regardless of role
(`tag-form.tsx:160`–`167`) — the same component tree serves the Refund
Point's create screen and the merchant's. So the answer for `web-app` is: no
exposure, on either role, by the same evidence in both directions.

**Attaching a traveller before create (`A11`/`A53`).** Identical component,
identical call, on both apps: `super-app`'s `SearchTraveller`
(`super-app/src/screens/shared/_components/SearchTraveller/SearchTraveller.tsx:74`)
and `web-app`'s `AddTravellerDialog`
(`web-app/apps/web/src/components/add-traveller-dialog.tsx:109`) hold the
traveller as local state fed into the create call — see the "Attaching a
traveller before create" paragraph inside [`merchant.md` § Creating a tag
against the
sticker](merchant.md#creating-a-tag-against-the-sticker-a19a55) for the
fuller description; nothing about it differs for a Refund Point.

## R3 — Tag QR

A Refund Point scanning (or resolving) a printed tag QR sees the tag's own
detail and, if it is an unassigned Draft, can assign a traveller — the same
code path a merchant's staff take, confirmed independently on both apps.

**Resolving a bare tag number (`A05`/`A45`) and the anonymous-preview /
tenant-scoped-detail split** are exactly what
[`merchant.md` § M3](merchant.md#m3--tag-qr) describes, with no Refund-Point
branch anywhere in the code that produces it: `super-app`'s
`scanDestination` routes every full tag QR to `/tag-preview` on `isStaff`
alone (confirmed above, `scanDestination.ts:44`–`48`), and
`web-app`'s `openTag`/`canViewTag` gate on the `TagService.Tags.ViewSummary`
permission with no role check in the function at all
(`client.tsx:393`–`396`, `406`–`432`) — a Refund Point holding the grant
reaches the tenant detail exactly as a merchant would, and one lacking it is
refused exactly the same way. The mismatch between `canViewTag`'s
`ViewSummary` check and the detail page's own `TagService.Tags.Detail`
requirement is [`F9`](README.md#findings), which
[`merchant.md` § M3](merchant.md#m3--tag-qr) sets out in full — it applies
here unchanged, not repeated.

### Assigning a traveller (`A10`/`A32`/`A59`)

Same endpoint and permission as the merchant path —
`POST /api/tag-service/tag/{id}/assign-traveller`,
`TagService.Tags.AssignTraveller` — described in full in
[`merchant.md` § Assigning a
traveller](merchant.md#assigning-a-traveller-a10a32a59), including the
distinction from the traveller's own self-assign endpoints. Confirmed
independently that the assign gate itself does not distinguish the two
staff roles on either app: `super-app`'s `TagPreviewScreen.buildAction()`
(`A10`) and `TagDetailScreen`'s assign action (`A32`) both key on `isStaff`,
not `isMerchant` specifically (`TagPreviewScreen.tsx:173`–`181`,
`TagDetailScreen.tsx:206`–`214`); `web-app`'s assign popover (`A59`,
`assign-traveller.tsx:209`) carries no role check at all — the page that
renders it gates purely on the `TagService.Tags.AssignTraveller` grant
(`tax-free-tags/[tagId]/page.tsx:34`–`35`, `137`–`138`;
`traveller-card.tsx:41`,`45`).

**One place the two roles genuinely diverge on the same screen, though not in
the assign action itself.** On `super-app`'s tag-detail screen, the print FAB
that sits beside the assign button — `MerchantAction`, which sends a
`PrintTag` SignalR command to a connected printer — is rendered only for
`isMerchant`, not `isStaff`
(`TagDetailScreen.tsx:268`–`273`), while the `SearchTraveller` picker behind
the assign button is rendered for `isStaff`, both roles alike
(`:274`–`281`). So a Refund Point who has just assigned a traveller to a
Draft they created on someone else's behalf has no print action on this
particular screen; nothing in the registry gives this print button its own
id (it is not QR-triggered), so it is reported here as context rather than
as a claim about a numbered action.

## Both claims present: the Refund Point claim wins

A Refund Point operator can also carry a store affiliation — the two are not
mutually exclusive on the account — and both apps resolve this the same way,
verified independently on each side rather than assumed to agree because the
outcome is described identically.

**`super-app`.** The operative signal is `role`, a single field resolved
after login from the account's CRM affiliations
(`super-app/src/store/user.ts:46`–`52`: `isMerchant: role === "merchant"`,
`isRefundPoint: role === "refundPoint"`) — deliberately kept apart from the
raw JWT `MerchantId` claim, which `useMerchantId()` reads directly off the
token regardless of role (`super-app/src/hooks/useMerchantId.ts:16`–`18`).
`resolveMerchantPlan`'s own doc comment states the risk by name: "A Refund
Point that also holds a merchant affiliation has `isMerchant === false` and
a populated `MerchantId` claim; treating that claim as a merchant choice
would send it to the create call and permanently allocate the sticker book
to a merchant the operator never picked" (`stickerTag.logic.ts:79`–`85`).
Mechanically: the function's `if (!isMerchant)` branch returns
`refund-point-allocated`/`refund-point-unallocated` **without ever reading
`sessionMerchantId`** (`stickerTag.logic.ts:103`–`107`) — the stray claim is
not merely overridden, it is never consulted on this branch at all. The
resolved `role` is a single value per session (`"merchant"` xor
`"refundPoint"`, never both), so the ambiguity here is specifically between
the **resolved role** and a **stray JWT claim** from an account with more
than one affiliation — not between two simultaneous roles.

**`web-app`.** There is no separately resolved "role" field the way
`super-app` has one; `isMerchantUser` **is** the role determination, computed
directly from the two session claims with Refund Point given precedence:
`isMerchantUser = Boolean(sessionMerchantId) && !sessionRefundPointId`
(`client.tsx:367`) — true only when a `MerchantId` claim is present **and**
no `RefundPointId` claim is. `ownMerchantId`, "the only merchant id the
merchant-only lookup and create path may use," is then gated on that
signal rather than read unconditionally off the session:
`ownMerchantId = isMerchantUser ? sessionMerchantId : undefined`
(`client.tsx:371`) — so a session carrying both claims yields `ownMerchantId
=== undefined`, and the Refund Point branch runs. The comment on this block
states the same consequence `super-app`'s does: "treating that claim as
authoritative would silently resolve, display and post *their* store instead
of the one the operator is booking for" (`client.tsx:345`–`352`). This
mechanic is also documented in [`permissions-by-role.md` § Session
claims](permissions-by-role.md#session-claims--resolved-before-any-permission-is-consulted),
which this section cross-links to rather than re-deriving in full — the
citations above are this chapter's own, read directly rather than taken on
that file's word.

**The consequence, stated once for both apps.** Without this precedence, an
operator who is both a Refund Point and a merchant's staff would have their
own store's identity silently substituted for the merchant actually being
booked for — resolving, displaying and posting the wrong merchant's product
groups, VAT rates and (on an unallocated book) permanently allocating the
sticker header to the operator's own store rather than the one at the
counter. Neither app lets that happen: the Refund Point claim wins on both.

## After creating or assigning: the tenant's tag list

Every create or assign above refreshes the same list a Refund Point can open
directly, and every step of it is shared code with no Refund-Point-specific
branch, confirmed rather than assumed: the Tags tab on `super-app` (`A29`,
`super-app/src/hooks/useLoadTags.tsx:93`) is scoped by `tagScopeForRole`,
which maps `isMerchant` **and** `isRefundPoint` to the identical `"Staff"`
scope (`super-app/src/utils/tag.ts:49`–`54`) — there is no separate Refund
Point scope to diverge from. `/operations/tax-free-tags` on `web-app` (`A57`)
is the same. Opening a row reaches the same tenant detail covered under R3
(`A31`/`A58`), from which a Refund Point can render the tag's own QR onto the
printable form (`A60`,
`.../[tagId]/_components/print-tag.tsx:286`) or print it through the report
service (`A61`, `.../[tagId]/_components/tag-actions.tsx:115`) — neither
component contains a role check of any kind (confirmed by reading both
files), so nothing here differs from a merchant's experience of the same
screen beyond the print-FAB gap already noted under R3's assign section.
Body contracts and permissions are
[`endpoints.md`](endpoints.md)'s and
[`permissions-by-role.md`](permissions-by-role.md)'s to state, not this
chapter's to repeat.

## A disabled feature: scanning tags into a refund (`A76`)

`web-app/apps/web`'s refund-filters panel has a scan-a-tag-into-the-selection
field, and it is entirely commented out — the handler, the input, and its
match-and-toast logic all sit inside a block comment
(`web-app/apps/web/src/app/[lang]/(main)/(unirefund)/operations/refund/_components/refund-filters/tags-panel.tsx:41`
–`75`), leaving only the manual select-all/select-row controls
(`:77`–`116`) live. The registry's own note on this row states that this is
a deliberate decision to leave the feature disabled rather than an
in-progress cut; there is no endpoint call to describe, since nothing here
runs.

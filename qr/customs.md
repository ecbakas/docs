# QR handling — customs

This file answers what a customs officer can do at the tag-review desk and at
the airport kiosk — the party that reviews issued tags in bulk, resolves a
traveller's whole tag history at once, and is the sole **producer** of the
validate QR every traveller scans.

_Verified against: 2026-07-31 · super-app `24221f7` · web-app `0cf122af0`._

Customs is the party the original `docs/QR.md` commission did not name. It was
added to this guide because it is the only party that does **bulk**
scan-and-assign (`#17`) and the only party that **generates** a QR another
party consumes (`#20`) — the two largest web-only capabilities would otherwise
have had no chapter to own them.

## Which ids this chapter narrates

18 action ids, all from `web-app/apps/web`, none from `super-app` or
`web-app/apps/ssr`: A57, A58, A59, A60, A61, A63, A64, A65, A66, A67, A68, A69,
A70, A71, A72, A73, A74, A75.
[`permissions-by-role.md` § Customs](permissions-by-role.md#customs) files the
identical 18 ids — checked id-for-id against this chapter's list by hand
rather than assumed, and the two agree exactly. No disagreement to report
between the registry and `permissions-by-role.md` on this id set.

**"No `super-app` or `apps/ssr` presence" is checked here, not just quoted from
`permissions-by-role.md`.** Two independent pieces of evidence, not one: every
registry row naming Customs sits in the `web-app/apps/web` actions table, none
in the `super-app` or `apps/ssr` tables (confirmed by reading all three tables
in `actions-and-routes.md`); and `super-app/src/store/user.ts:14`–`52` defines
exactly two role flags, `isMerchant` and `isRefundPoint`, each `role ===
"merchant"` / `role === "refundPoint"` — there is no `isCustoms` field and no
`"customs"` value the resolved `role` can ever take. A grep of `super-app/src`
and `pos-app/src` for `bulk`, `AssignDraft`, `kiosk` and `rolling` turns up
nothing but generated SDK types, localization strings, and a `Kiosk`
`DeviceType` enum member — no screen, no role branch, no feature. `#17`'s
recorded decision ("stays web-only") and `#20`'s ("stays a web kiosk") both
check out against the source, not only against `docs/QR.md`'s own say-so.

Five of the 18 (A57, A58, A59, A60, A61) are shared tenant-tag-detail code
also narrated in [`merchant.md`](merchant.md) and
[`refund-point.md`](refund-point.md) — each of those five carries `Actor:
Merchant, Refund Point, Customs[, Admin]`, so the registry's cap allows three
chapters per row and this is the third telling, from Customs's own side of the
same code, cited by `file:line` below rather than restated. The other 13
(`A63`–`A75`, with two rows in that numeric span excluded — see below) are
Customs-only: the bulk scan-and-assign sheet and the kiosk. Permission strings
live in [`permissions-by-role.md`](permissions-by-role.md), endpoint ownership
and body contracts in [`endpoints.md`](endpoints.md), and the wire format and
producer table in [`README.md`](README.md) — none of that is repeated here.

**Two ids that sit inside or beside that numeric span are not Customs's, and
are not narrated in this chapter.** The new-tag-form create action (the row
immediately before this chapter's own run of ids) carries `Actor: Merchant,
Admin` — no Customs — so it belongs to [`merchant.md`](merchant.md) alone;
Customs has no tag-creation action anywhere in the registry. The disabled
scan-tags-into-a-refund action (the row immediately after this chapter's own
run) carries `Actor: Refund Point` alone and belongs to
[`refund-point.md`](refund-point.md). Neither is adopted here merely because
it sits next to Customs's own rows in the registry table — each already has
exactly the one chapter its `Actor` cell allows, and citing either id's own
token here would push it over that cap.

## The three cells this chapter would fill

`docs/QR.md`'s behaviour grid has three rows (Validate QR, Sticker QR, Tag QR)
and three columns (Traveller, Merchant, Refund Point) today — **no Customs
column exists yet**; that is Task 13's addition. What follows describes what a
fourth column would say, on the same three axes the other three columns use.
None of `C1`, `C2` or `C3` is cited as if it already exists in that grid.

**`C1` — Validate QR.** Meaningful, but inverted in kind from `T1`/`M1`/`R1`.
Those three describe what happens when the named party *scans* a validate QR
— a traveller runs the self-validation flow (`T1`), staff are refused with a
named-problem message (`M1`/`R1`). Customs never scans a validate QR at all:
no registry row has Customs reading one. Customs's relationship to it is
upstream — it is the party that *manufactures* the QR every other party either
scans or is refused for scanning, at the kiosk described under `#20` below.

**`C2` — Sticker QR.** Genuinely meaningless, the same way the brief's own
example puts it. Checked directly rather than assumed: no registry row names
Customs as the actor for any sticker-line resolution, sticker-tag creation, or
merchant-picker action — every such row on `super-app`'s `/sticker-tag` and
`web-app/apps/web`'s `/operations/scan-sticker` carries only Merchant and/or
Refund Point as `Actor`. Customs has no route that reads a sticker QR, prints
one, or creates against one. There is no cell to fill.

**`C3` — Tag QR.** Meaningful, and split across two genuinely different
shapes of interaction, not one. The bulk scan-and-assign sheet (`A63`–`A70`,
below) *is* a tag-QR flow — a customs officer scans a printed tag QR (or types
its number) with their own camera, same as a merchant or refund point scanning
one tag — except the destination is a running list rather than a single tag's
detail, restricted to unassigned Draft tags, and resolved to one traveller in
one batched action rather than one tag at a time. Separately, Customs also
reaches a single tag's tenant detail (`A58`), can assign a traveller there
(`A59`), and can render or print the tag's own QR (`A60`/`A61`) — but reaches
that screen by clicking a row in a list (`RowLink`, see below), not by
scanning; `/operations/scan-sticker`, the camera Merchant and Refund Point
scan a tag QR with, carries no Customs actor anywhere in the registry, so
Customs has no camera-driven route to a *single* tag's detail the way M3/R3
do.

## Getting to a QR flow, as Customs

Customs has no counterpart to `super-app`'s shared four-stage scan pipeline —
there is nothing to funnel into, because Customs has no `super-app` route at
all (confirmed above). On `web-app/apps/web`, Customs also does not share
`/operations/scan-sticker` with Merchant and Refund Point: that page's own
classifier and every action reachable from it carry only `Merchant, Refund
Point` as `Actor`, with no Customs row among them. Customs instead has two
separate, purpose-built surfaces of its own, neither derived from the other: the bulk
scan-and-assign sheet, mounted from two different pages, and the customs-desk
traveller search bar on `/operations/tags`. Both are described in full below.

## Bulk scan-and-assign (`A63`–`A70`, `#17`)

`web-app/apps/web/src/app/[lang]/(main)/(unirefund)/operations/tax-free-tags/_components/customs/assign-draft-content.tsx`
and its wrapper,
`.../operations/tax-free-tags/_components/customs/assign-draft-sheet.tsx`,
are the whole of this feature. It is reachable from two toolbar entry points
on two different pages, both opening the identical sheet: the "Assign draft
tags" table action on `/operations/tax-free-tags`
(`A63`, `.../tax-free-tags/_components/customs/customs-tags-config.tsx:291`,
`setAssignDraftOpen(true)`) and the "Assign draft" button on a traveller's
profile card on `/operations/tags`
(`A63`, `.../operations/tags/_components/customs-tags-workspace.tsx:176`,
same call). `#17` in `docs/QR.md` names exactly this capability, and its
recorded decision is "stays web-only" — verified above by grep and by
`super-app`'s own role model, not merely repeated from the catalogue.

**The sheet has two tabs, and they are not camera-versus-keyboard.** They are
"Scan" and "Traveller"
(`assign-draft-content.tsx:290`–`310`, `TabsTrigger value="scan"` and
`value="traveller"`). All three ways of adding a tag — camera, wedge keyboard,
and typed manual entry — live together inside the single "Scan" tab; the
second tab is where the assignee is chosen, not a second input method for the
first. A reader who expects a camera tab and a keyboard tab, matching the
sheet's own two visible triggers, will not find one.

**Adding a tag (`A64`/`A65`/`A66`), looking it up (`A67`), and rejecting a bad
one (`A68`) all fall through one function**, `addTagByNumber`
(`assign-draft-content.tsx:80`–`165`), keyed on a plain tag number regardless
of how it arrived. The camera (`A64`,
`BarcodeCameraScanner` at `:366`, `formats={["qr_code"]}`) and the keyboard
wedge listener (`A65`, the `keydown` handler starting at `:192`, a 50 ms burst
gap and a 3-character minimum before a bare `Enter` commits) both decode a
scanned slug through `decodeTagScan` first (`handleScan`, `:170`–`176`) before
handing the plain tag number to `addTagByNumber`; the manual field (`A66`,
the `InputGroupButton` at `:349`, `onClick={handleManualAdd}`) has no slug to
decode and passes its typed value straight through. `addTagByNumber` itself
does the lookup (`A67`, `getTagByTagNumberApi`, `:121`) and then the
three-way rejection: not `status === "Draft"` (`:124`–`134`), already carrying
a `traveller` (`:136`–`144`), or the lookup throwing at all, which is read as
not-found (`:150`–`158`) — all three are `A68`. A **lookup cache**
(`lookupCacheRef`, `:71`–`76`) replays the same outcome for a tag number seen
twice in one session without a second backend call, including for a tag
already added — a convenience the registry gives no id of its own, since it
changes nothing about which tag ends up in the list.

**The camera is opened on demand, and the code says exactly why.** `cameraOpen`
starts `false`; the scanner component only mounts, and its video stream only
runs, while `cameraOpen` is `true`
(`assign-draft-content.tsx:364`–`395`). The comment at `:57`–`58` states the
reason directly: "the stream starts when the scanner mounts and stops when it
unmounts, so it isn't running while the agent reviews tags." A successful add
closes the camera again (`onScan` callback, `:367`–`371`, `setCameraOpen(false)`
only when `handleScan` resolves `true`); a rejected scan — duplicate, wrong
status, already assigned, not found — leaves the camera open so the officer
can immediately retry without a second tap on "Scan another" (`:405`–`408`
switches that button's own label once at least one tag has been added, but
does not touch `cameraOpen`).

**Resolving the traveller (`A69`) is the shared `SearchTraveller` component**
(`@/components/search-traveller`, mounted at `assign-draft-content.tsx:547`
–`553`) — the same component `merchant.md` and `refund-point.md` describe for
their own create and assign flows, not a customs-specific reimplementation.
Its `initialValue` is fed from `initialDocumentNumber`, which auto-runs the
search once on mount (`SearchTraveller`'s own `useEffect`, confirmed in
`search-traveller.tsx:141`–`147`) — that prop arrives already resolved: from
the `travellerDocumentNumber` query parameter when the sheet is opened from
`/operations/tax-free-tags` (`customs-tags-config.tsx:387`–`389`), or from the
traveller already selected at the customs desk when opened from
`/operations/tags` (`customs-tags-workspace.tsx:219`,
`traveller.documentNumber`). A `useInitialDocument` flag
(`assign-draft-content.tsx:64`, set `false` by the "Change" button at `:538`)
stops re-feeding that initial value once the officer asks for a different
traveller — without it, `SearchTraveller` would remount, re-run its
auto-search, and re-select the same traveller, leaving the field stuck.

**Assigning (`A70`) is one call per tag, sequential, not batched into one
request.** `handleAssign` (`:229`–`268`) loops the scanned list with a plain
`for…of` and `await`s `postTagByIdAssignTravellerApi` inside the loop
(`:233`–`238`) rather than firing them concurrently — a failure on one tag
reports its own toast (`:241`–`247`) and the loop continues to the next; a
success count drives the summary toast (`:250`–`256`) and, when the sheet was
opened without its own `onSuccess` handler, the post-assign navigation: to the
one tag's own detail page when exactly one succeeded, otherwise to the
tax-free-tags list (`:257`–`265`). Opened from `/operations/tags`, the sheet's
`onSuccess`/`onClose` instead just closes it and reloads the selected
traveller's tags (`customs-tags-workspace.tsx:128`–`131`).

## The rolling validate-QR kiosk (`A73`–`A75`, `#20`)

`web-app/apps/web/src/app/[lang]/(external)/qr` is a customs-only page that
**produces** the validate QR a traveller scans to start airport
self-validation — it does not consume one. This is the producer half of the
row [`README.md`'s producer table](README.md#where-the-codes-come-from)
already names ("Validate QR | `apps/web` ·
`[lang]/(external)/qr/_components/rolling-qr-card.tsx:199`, the airport
kiosk"); the traveller-side scan of the same code is narrated in
`traveller.md`'s T1 section, which this chapter does not repeat or cite by id
— the airport flow is split across two chapters whose id sets cannot overlap
(the traveller-side ids there carry `Actor: Traveller` alone, with no headroom
for a second chapter), so the cross-reference here is prose only.

**Being inside an `(external)` route group does not mean unauthenticated —
checked against the actual routing config, not assumed from the folder
name.** `web-app/apps/web/.env` sets `PUBLIC_ROUTES=` (empty) and
`PROTECT_ALL_ROUTES=true`, and `UNAUTHORIZED_ROUTES=login,register,reset-password`
— `qr` is in neither list. `middleware.ts` classifies a route by the URL
segment after `[lang]` (`:89`, `pathParts[1]`), which is `"qr"` regardless of
which parenthesized folder contains the page — Next.js route groups are not
part of the URL — so an unauthenticated request to `/qr` hits the
`protectAllRoutes && !isPublicRoute && !isAuthRoute` branch (`:126`) and is
redirected to `/login`, exactly like every other page in this app.

**The actual gate the code carries is `A73`, a registered Kiosk device — not
a `CustomsId` check anywhere in the client.** `page.tsx:16`–`27` requests
`getDevicesApi({ deviceType: "Kiosk", maxResultCount: 1 })` and branches on
`(kioskResult.data.totalCount ?? 0) > 0` (`:48`–`52`): zero renders
`NoKioskView`, the registration form (`_components/no-kiosk-view.tsx`,
`SchemaForm` over `CreateDeviceDto`, posting `deviceType: "Kiosk"` at `:82`
–`98`); one or more proceeds to `generateRollingQrAction` (`:55`) and, on
success, `RollingQrCard`. `CustomsId` itself is never read, branched on, or
compared anywhere in `rolling-qr-card.tsx` or `page.tsx` — it appears exactly
once in `rolling-qr-card.tsx`, at `:282`, as a plain display value
(`data.customsId`) inside the developer-info dialog, sourced from the
generate call's own response. The customs office's identity is resolved
**server-side**, from the caller's own claim — `endpoints.md`'s own quote of
the SDK doc comment says so directly: "CustomsId is resolved from the
caller's … claim (never accepted as input)." So the client neither reads nor
gates on it; `A73`'s device check is the only precondition the frontend
itself enforces.

**Generating the QR (`A74`) and rolling it (`A75`) are the same call, made
from two different moments.** Both go through `generateRollingQrAction`
(`_components/utils.ts:16`–`40`), which calls
`postCustomsValidationQrGenerateApi` and assembles `validateUrl` by string
interpolation rather than through `@unirefund/qr`'s own `buildValidateUrl` —
already the subject of README's "the kiosk duplicates a shape the library
owns" paragraph, not repeated here. `A74` is the page's own initial call
(`page.tsx:55`); `A75` is the same action fired from inside `RollingQrCard`'s
refresh cycle (`rolling-qr-card.tsx:104`–`122`, `refreshIfExpired`). The
refresh is **not** a flat 30-second timer: a `setInterval` ticks every second
and only calls `generateRollingQrAction` once fewer than 1.1 seconds remain in
the current 30-second window (`msLeft > 1100` returns early, `:108`–`109`); a
`visibilitychange` listener calls the same check on returning to a visible
tab (`:130`–`136`), which is what refreshes an already-expired QR the instant
a backgrounded kiosk tab is looked at again, matching the registry's own
trigger text for `A75` ("Kiosk countdown expiry, and every return to a
visible tab").

**One thing the fallback URL construction states precisely, since "hardcoded"
alone would overclaim.** `_components/utils.ts:37` reads:

```
validateUrl: `${qr.validateBaseUrl ? qr.validateBaseUrl : "https://ssr-dev.unirefund.com"}/${lang}/validate?qrValue=${encodeURIComponent(qr.qrValue)}`,
```

`https://ssr-dev.unirefund.com` is a **fallback**, used only when the
backend's own response carries no `validateBaseUrl` — the backend-supplied
value is preferred whenever present, and the literal is reached only on its
absence. It is still a real production hazard were the backend ever to omit
that field in a live environment (a kiosk would then encode a dev host into a
QR handed to a paying traveller), but it is not the sole determinant of the
URL the way "hardcoded fallback host" alone could be read to mean.

## The customs tag list, and the customs workspace (`A57`–`A61`, `A71`, `A72`)

Two different pages carry Customs's non-bulk tag review, and they are not the
same surface wearing two names.

**`/operations/tax-free-tags` is the tenant tag list every tag-viewing party
shares, with a customs-specific fork.**
`web-app/apps/web/src/app/[lang]/(main)/(unirefund)/operations/tax-free-tags/page.tsx:61`
computes `isCustoms = !!session?.user?.CustomsId` and branches the entire
page body on it (`:147`–`183` vs `:185`–`223`): a customs session renders
`CustomsTagsConfig` instead of `MerchantTagsConfig`, and the query built for
`getTagsApi` is adjusted three ways, all customs-only:

- **The status filter widens.** A non-customs session takes whatever
  `statuses` filter the URL carries; `isCustoms` overrides it to eight
  lifecycle states — `Issued, ExportValidated, Declined, Correction,
  EarlyPaid, PreIssued, WaitingStampValidation, WaitingGoodsValidation`
  (`:66`–`80`) — the states relevant to a border review rather than every tag
  state a tenant might have.
- **Today is the default issue-date window**, but only conditionally.
  `USE_TODAY_AS_PREFILTER && isCustoms &&` three further conditions
  (`:85`–`99`, `hasTravellerSearch`/`utils.ts:20`–`32`) — no traveller lookup
  in progress, no explicit `issuedStartDate`/`issuedEndDate` already chosen,
  and `issuedAll` not set to `"1"` — together mean a bare visit to the page
  defaults to today's issued tags; picking a date range, or appending
  `?issuedAll=1` to clear the filter, or searching for a traveller, all
  suppress the default.
- **A traveller lookup widens the page size and re-applies the wider status
  set**, redundantly with the branch above but reached independently
  whenever `tagData.travellerDocumentNumber` is present (`:101`–`117`,
  `maxResultCount: 999`) — a customs officer looking up one traveller's whole
  history is not paginated the way a browsing list is.

**`/operations/tags` (`A71`/`A72`) is a second, purpose-built page — "the
customs workspace" — not a view of the same list.**
`CustomsTagsWorkspace` (`.../operations/tags/_components/customs-tags-workspace.tsx`)
starts with a traveller search bar and shows nothing until a traveller is
picked. Resolving that traveller (`A71`) is
`TravellerSearchBar` (`.../operations/tags/_components/traveller-search-bar.tsx`),
a component distinct from the bulk sheet's `SearchTraveller` — four modes on
one toggle group (`:41`–`54`): a document-photo camera scan
(`ScanTravellerCamera`, `handleScanned` at `:150`–`165`, feeding a document
number back into the same document search), plus typed document number,
email and phone search, each calling its own
`getTravellersBy*Api` (`:105`–`118`). Selecting a traveller (or a unique
auto-selected hit) loads their tags (`A72`, `loadTags`,
`:81`–`104`, `getTagsApi` filtered to `CUSTOMS_TAG_STATUSES` — the same eight
lifecycle states named above, defined once in `.../operations/tags/_components/utils.ts:46`
–`55` — and to that traveller's own document number) and re-runs on every
successful bulk assign (`handleAssignDraftClose`, `:128`–`131`) so a
just-assigned tag appears without a manual refresh.

Opening a single tag's tenant detail from either page — `A58` (detail),
`A59` (assign), `A60` (render the tag's own QR onto the printable form) and
`A61` (print through the report service) — is the same shared screen and
component tree `merchant.md` § M3 and `refund-point.md` § R3 already describe
in full for their own roles; nothing in `print-tag.tsx` or `tag-actions.tsx`
branches on a Customs-specific case, confirmed by reading both files, so
Customs's experience of them is identical and is not re-described here. The
one thing worth stating from Customs's own side: **Customs reaches this
detail screen by clicking a row — `RowLink` in `customs-tags-config.tsx:224`
–`229`, or `onExamine` opening a read-only modal in
`customs-tags-workspace.tsx:133`–`159` — not by scanning a tag QR with a
customs-held camera**, because `/operations/scan-sticker`, the only in-app
tag-QR camera on this side of the guide, carries no Customs actor anywhere in
the registry (confirmed above). `A72`'s own `getTagsApi` reuses the tenant
list read; `A58`'s detail read is `getTagByIdApi`
(`customs-tags-workspace.tsx:143`) in the workspace's own "examine" modal, a
second, lighter-weight route to the same detail data that does not navigate
away from the traveller's tag list the way the tax-free-tags row link does.

## Findings

**The bulk-assign gate checks `TagService` permissions only and never checks
the traveller-search grant `A69` cannot finish without.** Both entry points
gate the whole sheet on an identical policy array —
`["TagService.Tags", "TagService.Tags.AssignTraveller",
"TagService.Tags.DetailByTagNumber"]` — read directly at
`customs-tags-config.tsx:62`–`69` (`hasAssignDraft`) and
`customs-tags-workspace.tsx:46`–`53` (`canAssignDraft`, whose own comment
calls it "the same policy set the older customs grid gated this action on").
Neither array names any `TravellerService` permission, yet `A69`'s own
`SearchTraveller` call — the only way to pick who the bulk basket gets
assigned to — reaches `getApiTravellerServiceTravellersSearchByDocumentNumber`,
whose SDK doc comment (`web-app/packages/saas/TravellerService/sdk.gen.ts:813`)
states it "**Requires permissions:** TravellerService.Travellers,
TravellerService.Travellers.SearchByTravellerDocumentNumber" — the same
permission the registry's own `A69` row cites. A session holding the three
`TagService` grants but not this one would open the sheet, scan tags into it
successfully, and then find the Traveller tab's search silently failing
(or, per the next finding, simply reach a component that never checked in the
first place).

**"Permission-gated inside an `isCustoms`-only render" is true on one of the
two entry points and not the other — checked on both sides rather than
assumed to carry over.** On `/operations/tax-free-tags`, the bulk-assign
button and sheet live inside `CustomsTagsConfig`, which the page renders only
when `isCustoms` is true (`tax-free-tags/page.tsx:147`–`183`) — so on that
surface, the session-claim check and the `TagService` permission check are
both present, nested. On `/operations/tags`, there is **no such claim check
at any level**: `operations/tags/page.tsx` renders `CustomsTagsWorkspace`
unconditionally, with no `auth()` call, no `CustomsId` read, and no redirect
of any kind (confirmed by reading the whole page file, nine lines end to
end) — the only
gate on that surface is `canAssignDraft`'s `TagService` policy check, and
`TravellerSearchBar` beneath it (next finding) has none at all. A menu-level
policy does exist for the nav link — `sidebar-layout/data.ts:675`–`680` gates
the "CustomsTags" entry on `TagService.Tags, TagService.Tags.View` — but that
is menu visibility, not a route guard; nothing stops a direct visit. Two
different gating stories on two entry points to the identical sheet, not one
story told twice.

**The traveller search at the customs desk (`A71`) carries no permission
check of any kind — confirmed by reading the whole component, not inferred
from the sheet's own gating.** `traveller-search-bar.tsx` imports no
`isActionGranted` and no `useGrantedPolicies` at all; its four search modes
call `getTravellersByDocumentNumberApi`, `getTravellersByEmailApi` and
`getTravellersByPhoneNumberApi` directly (`:105`–`118`) with nothing gating
whether the button renders or the call fires. The shared `SearchTraveller`
component the bulk sheet uses (`assign-draft-content.tsx`) is built the same
way — no `isActionGranted` anywhere in `search-traveller.tsx` either. Whether
either call actually succeeds is therefore entirely a backend-side grant
question this guide cannot answer (see
[`permissions-by-role.md` § What this file does not
know](permissions-by-role.md#what-this-file-does-not-know)); what is
confirmed here is that the **frontend** does not pre-check before offering
the control or firing the request, on either component.

**A third, separate traveller-search control — `A59`'s own popover — gates on
the wrong permission, verified against the SDK's own doc comment rather than
assumed from its name.** `assign-traveller.tsx:51`–`54` computes
`hasTravellerSearchGrant` from `isActionGranted(["TravellerService.Travellers.ViewList"],
…)` and uses it to decide whether the embedded `SearchTraveller` renders at
all (`:154`–`170`) — but the search it gates calls the same
`getApiTravellerServiceTravellersSearchByDocumentNumber` named above, which
requires `TravellerService.Travellers.SearchByTravellerDocumentNumber`, not
`.ViewList`. This is shared code across Merchant, Refund Point and Customs —
`assign-traveller.tsx` carries no role branch and `A59`'s own `Actor` cell
names all three — so a Customs session holding
`SearchByTravellerDocumentNumber` but not `ViewList` would see the search UI
withheld from this one popover (falling back to the plain typed form below
it) even though the actual search call it would have made was one the
session was entitled to make; and the reverse mismatch is equally possible.
This is a distinct component from the bulk sheet's ungated `SearchTraveller`
and from the customs desk's ungated `TravellerSearchBar` above — three
different traveller-search entry points on three different permission
postures, not one bug appearing three times.

**`A73`'s own precondition is looser than what `A74`/`A75`'s call actually
requires — found independently while reading the kiosk page, not carried
over from the brief.** `page.tsx:48` treats the office as kiosk-ready once
`totalCount > 0` — one *or more* Kiosk devices. But the generate endpoint's
own doc comment (`ExportValidationService/sdk.gen.ts:33`) states "the caller
must own **exactly one** `DeviceType.Kiosk` device — 0 or more raises a
critical log + failure." A customs office with two or more registered kiosks
would pass `page.tsx`'s own check, skip `NoKioskView`, and only then hit a
generic `ErrorComponent` failure from the generate call itself
(`page.tsx:56`–`63`) — the friendlier, specific registration prompt is shown
only for the zero case, not for the over-one case the backend equally
rejects.

## Every claim above, checked

Every `file:line` citation in this chapter was read directly rather than
transcribed from the registry, `permissions-by-role.md`, or `docs/QR.md`; the
one exception is the `Verified against` stamp itself, which is the guide-wide
convention already fixed by the first three chapters and not independently
re-derived here.

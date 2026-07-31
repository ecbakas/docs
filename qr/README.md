# QR handling — README

This file answers what the guide covers and how its nine files fit together.

_Verified against: 2026-07-31 · super-app `24221f7` · web-app `0cf122af0`._

`pos-app` is cited in one section of this file and nowhere else in the guide; the
revision read was `13f1d1f`. It is named apart from the stamp above because the
stamp pins the two repositories every other file in the guide is derived from.

## The nine files

| File | Answers |
| --- | --- |
| `README.md` — this file | What a Unirefund QR *is*, who produces each one, how each app resolves it, and where every action id lives |
| [`actions-and-routes.md`](actions-and-routes.md) | The registry: for each of 102 QR-triggered actions, its actor, route, UI entry, client wrapper, SDK method, endpoint and permission |
| [`endpoints.md`](endpoints.md) | Per endpoint: what it is for, who may call it, who must not, and what the wrong caller should call instead |
| [`permissions-by-role.md`](permissions-by-role.md) | The registry re-grouped by role, plus session claims and the limits of what this repository can establish about grants |
| [`traveller.md`](traveller.md) | The traveller's chapter |
| [`merchant.md`](merchant.md) | The merchant's chapter |
| [`refund-point.md`](refund-point.md) | The refund point's chapter |
| [`customs.md`](customs.md) | The customs chapter |
| [`test-flows.md`](test-flows.md) | One test flow per registry action, `TF-A##` |

`_verify/check.mjs` checks the promises this guide makes about itself: every
action id joined across the files, every endpoint reachable, no permission cell
blank. Run it from the workspace root:

```bash
node docs/qr/_verify/check.mjs
```

The registry is the single origin for every action id, actor, endpoint and
permission in the guide. Where any other file appears to disagree with it, the
registry wins and the other file is wrong.

## QR types and the wire format

Three QR codes exist in the Unirefund world — sticker, tag and validate — and one
library reads all three (a fourth printed code, a 1D Code128 barcode, is the
subject of the next section).
[`@unirefund/qr`](https://github.com/ayasofyazilim-clomerce/unirefund-qr)
(`github:ayasofyazilim-clomerce/unirefund-qr`, version `0.1.0`), a dependency of
`super-app`, `pos-app`, `apps/web` and `apps/ssr` alike. Its exports, read from
`dist/types/index.d.ts`:

| Module | Exports |
| --- | --- |
| `codec` | `base64UrlEncode`, `base64UrlDecode` |
| `slug` | `encodeTagSlug`, `decodeTagSlug`, `decodeTagScan`, `slugFromScan`, `UnencodableTagFieldError`, `TagSlugData`, `TagSlugInput` |
| `link` | `buildTagUrl`, `resolveTagLink`, `ResolveTagLinkArgs`, `ResolveTagLinkResult` |
| `validate` | `buildValidateUrl`, `extractValidateQrValue`, `isValidateScan` |

**The scope of that claim matters, so it is stated narrowly.** The library is the
single source of truth for **decoding** — every scanner in every app reaches a
Unirefund code through `decodeTagScan` or `extractValidateQrValue`, and nothing
parses a slug by hand. For **encoding** it is the source for some producers and
not others: the sticker QR and the POS receipt QR go through it, the printed tag
QR on `apps/web` and the kiosk validate URL do not. One library does **not**
decide the format of every code printed, and the next section says which producer
authors which. `link.d.ts` is explicit about where authority actually sits:

> The backend is the authority on this format: it publishes `publicLink` on
> `TagDetailDto` (and on `StickerLineReportDto`). Web renders that value and
> builds nothing, which is correct.

### The tag slug

A tag QR carries the public tag URL, `{ssrBaseUrl}/tag/{slug}`, where `slug` is
the base64url encoding — reversible, **not** a hash — of:

```
{n:<tagNumber>,i:<tagId>,t:<travellerDocumentNumber>[,s:<stickerLineNumber>]}
```

| Key | Field |
| --- | --- |
| `n` | tag number |
| `i` | tag id |
| `t` | traveller document number |
| `s` | sticker line number |

A key is written only when it has a value, so `{n:TR123}` is as valid as the full
four-key form; key order is fixed `n`, `i`, `t`, `s`; and a decoder defaults any
key it does not find to `""`. The validate QR is a different shape entirely —
`{baseUrl}/{lang}/validate?qrValue={guid}` — and a value counts as a validate
scan only when it has **both** `/validate` in its path and a non-empty `qrValue`.

### Precedence: what a decoded slug is taken to be

Decoding is shared; deciding what a decoded slug *means* is not. The two staff
scanners do not agree, and the difference is on one row:

| A scanned value that… | `apps/web` scan-sticker reads it as | `super-app` reads it as |
| --- | --- | --- |
| is a validate URL | `validate` | `validate` |
| carries `s` only | `sticker` | `sticker` |
| carries `n` and/or `i`, no `s` | `tag` | `tag` |
| **carries `s` *and* `n`/`i`** | **`sticker`** | **`tag`** |
| carries `t` only | `empty` — nothing to open | `unknown` |
| decodes to nothing | `sticker`, taking the raw value as a line number (the wedge path) | `unknown` from a 2D read; `tag`, taking the raw value as a tag number, from a Code128 read |

Both implementations justify their ordering with the same phrase. `apps/web`
(`operations/scan-sticker/client.tsx:175`–`176`) says a sticker line "is the more
specific answer: a slug carrying both `s` and a tag identity came from a sticker,
and the sticker flow resolves the tag from it." `super-app`
(`src/utils/qr/classifyScan.ts:54`–`56`) says the sticker branch is "checked
*after* the tag branch so a code that identifies a tag stays on the tag path —
the sticker is only how that tag was printed, and the tag is the more specific
answer." Whether any producer actually emits a slug carrying both keys is not
answerable from this repository, because the backend authors `publicLink`. It is
a Findings row, not a resolved question.

A slug carrying only `t` identifies nothing openable, which is why both apps
give up on it rather than guess a lookup.

### The fixtures

`@unirefund/qr/vectors.json` pins the exact bytes: 8 golden slug vectors under a
`slugs` key, generated against Node's `Buffer` as an independent oracle, covering
ASCII, Turkish multi-byte and astral-plane input. Any change to the slug or codec
must still satisfy them. Two things are worth knowing about their reach:

- The fixtures pin the **slug and codec** only. The validate-URL shape is covered
  by inline assertions inside the package's own conformance suite, not by any
  fixture a consuming app runs.
- `super-app` and `pos-app` each run the fixtures in their own suites
  (`super-app/src/utils/qr/__tests__/classifyScan.test.ts:8`,
  `pos-app/src/utils/__tests__/tagQr.test.ts:2`). **No `web-app` test imports the
  package at all** — so the two apps that print the sticker QR and the tag QR are
  the two that do not run the shared conformance fixtures.

## Where the codes come from

| Code | Produced by | Content authored by |
| --- | --- | --- |
| Sticker QR | `apps/web` · `operations/stickers/[stickerId]/_components/print-sticker-lines-action.ts:77` | client — `buildTagUrl` from `@unirefund/qr`, encoding only the `s` key |
| Tag QR, printable tax-free form | `apps/web` · `operations/tax-free-tags/[tagId]/_components/print-tag.tsx:286`, via `react-qr-code` | **the backend** — the value is `TagDetailDto.publicLink`, not built locally |
| Tag QR, POS receipt | `pos-app` · `src/utils/tagQr.ts:23`, called from `src/screens/(auth)/Tags/TagDetail/_components/tagPrintTemplate.ts:88`, `:175`, `:319` | **the backend, preferred** — `resolveTagLink` takes `TagDetailDto.publicLink` when present and encodes locally only when it is absent |
| Code128 tag-number barcode | `pos-app` · `src/screens/(auth)/Tags/TagDetail/_components/tagPrintTemplate.ts:90`, `:185` — `printBarcode(tag.tagDetail.tagNumber, "code128")` | nobody — a bare tag number, which is exactly why `#28` existed |
| Validate QR | `apps/web` · `[lang]/(external)/qr/_components/rolling-qr-card.tsx:199`, the airport kiosk | server-issued `qrValue`, but the **URL around it is assembled locally** by string interpolation in `_components/utils.ts`, not by `buildValidateUrl`; rolling, so it expires mid-flow by design (`#7`) |

Then the consequences.

**The tag QR has two possible authors.** `print-tag.tsx` imports `react-qr-code`
and encodes `tagDetails.publicLink`; it never calls `buildTagUrl`. The sticker
print path is the mirror image: it encodes locally with `buildTagUrl` and never
reads the `publicLink` the backend publishes on `StickerLineReportDto`. Whether
`publicLink` and `buildTagUrl` agree is not answerable from this repository, so
it is a Findings row, not a paragraph. If they ever diverge, a printed tag QR and
a printed sticker QR resolve differently and nothing on `apps/web` catches it —
the library ships the detector for exactly this, `resolveTagLink`'s `onDrift`
callback, and only `pos-app` wires it up (`src/utils/tagQr.ts:35`, behind
`__DEV__`). Neither web print path is in a position to use it: one never encodes
locally, the other never reads the backend link.

**`pos-app` prints a bare identifier beside a code every app can resolve.** The
Code128 barcode is a bare tag number, and a bare tag number is not a slug; the
mobile scanner's default symbologies include `code-128`, so the barcode *is* read
and then decoded to nothing. That was the whole of `#28`. It is fixed now, and
the fix is worth naming because it is where the wire format and product policy
meet: `super-app/src/utils/qr/scanSource.ts:28` trusts a bare value from
`code-128` **and only** `code-128` as a tag number, on the stated grounds that it
is the one 1D symbology Unirefund prints, and `classifyScan` then routes it to
`A05`'s lookup by tag number. A producer sharing no code with its consumers is
how that gap opened in the first place; the QR printed next to the barcode on the
same receipt was never the problem.

**The kiosk duplicates a shape the library owns.** `buildValidateUrl` exists and
produces `{base}/{lang}/validate?qrValue={guid}`; the kiosk's server action
builds the same string by hand. The two agree today on everything that matters to
`isValidateScan`, but they are two implementations of one format, and only one of
them is the one `vectors.json` and the conformance suite are aimed at.

Two further encode sites, neither of which prints a code for a stranger to scan:
`apps/ssr` builds a slug with `encodeTagSlug` in
`[lang]/(public)/tag/_components/tag-search-form.tsx:52` to turn a typed lookup
into a `/tag/[slug]` navigation (`A77`); and `pos-app` ships
`src/screens/(auth)/DeviceSettings/BarcodeTestScreen.tsx:42`, which wraps
`base64UrlEncode` to print arbitrary test codes — as a QR and in any of nine
selectable symbologies — on a real device. [`test-flows.md`](test-flows.md) names
that screen in its test-data preamble.

`pos-app` gets **no** action or endpoint rows anywhere in this guide. It appears
in this section and nowhere else.

## How each app resolves a QR

- **`apps/ssr` barely scans.** A tag QR encodes `{ssrBaseUrl}/tag/{slug}`, so the
  traveller's own camera app opens the browser and `/tag/[slug]` decodes the slug
  server-side. Resolution is routing. Its only in-app cameras are the
  boarding-pass scanner (`A89`), the expired-QR rescan modal (`A92`) and the
  claim-tag modal's scan tab (`A93`).
- **`super-app` scans in-app.** `src/utils/qr/classifyScan.ts` turns a raw string
  into a navigation decision client-side. This is why mobile needed an explicit
  `sticker` kind that SSR never did — a URL routes itself.
- **`apps/web` additionally supports a wedge / keyboard barcode scanner.** A
  keydown buffer in a ref, reset when the gap between keystrokes exceeds 500 ms,
  committed on `Enter`, and listening only while the page is idle and the camera
  is closed (`operations/scan-sticker/client.tsx:552`–`572`). Mobile deliberately
  has none — no wedge exists on a phone — which is why a bare undecodable string
  is read as a sticker line number on web and stays `unknown` on mobile.

**`classifyScan` is not shared, and that is a decision on the record rather than
an oversight.** `apps/web` defines its own at
`operations/scan-sticker/client.tsx:161`; `super-app` has one at
`src/utils/qr/classifyScan.ts:38`. Decoding is shared through `@unirefund/qr`;
classification is per-app product policy, and `super-app`'s own file comment
argues that this is correct:

> This is the only QR logic that stays in the app: it maps a scan to a
> *navigation decision*, which is product policy per app rather than a wire
> format.

The wedge is the concrete reason the two cannot be one function: web must treat
an undecodable string as a line number and mobile must not. What the split also
buys is the precedence disagreement above, which is not policy anybody chose.

## Which QR each party may not use

A merchant or refund point scanning a **validate** QR is refused with a message
that names the problem, not a generic failure (`#22`) — `A26` on `super-app`,
`A42` on `apps/web`. The ordering that makes that possible is worth stating once,
here, because it looks arbitrary until you see why.

Validate is checked **first**, before any tag decode
(`operations/scan-sticker/client.tsx:164`, `classifyScan.ts:47`). It is the one
code that does not decode: it is a plain URL, so `decodeTagScan` yields empty
fields for it. Checked later, it would fall through to the wedge path on
`apps/web` and be sent to the API as a sticker line number — surfacing to the
operator as "sticker not found" rather than "wrong QR". The refusal message is
not an extra feature bolted on; it is what checking in this order makes possible.

Note what the refusal is and is not. The endpoint behind a validate scan,
`POST /api/export-validation-service/qr-evidence/{qrValue}/scan`, is
`— authenticated, no grant`: it requires a bearer token but has **no permission
gate**, so it does not distinguish a staff token from a traveller's. `A26` and
`A42` are therefore the only thing that stops a staff session from posting a
validate scan, and they are client-side. That is a client-side refusal doing the
whole job, not a client-side message in front of a server-side rule. See
[`endpoints.md`](endpoints.md) for who may call what, and what the wrong caller
should call instead.

## Login and session resolution

The claim detail — which claims exist, what each is typed as, which one wins, and
what this repository can and cannot establish about grants — lives in
[`permissions-by-role.md` § Session claims](permissions-by-role.md#session-claims--resolved-before-any-permission-is-consulted).
This section carries the **flow** only: role gate, login route, role resolution,
tenant or affiliation selection, and how a scan taken before login survives it.

**`super-app`** — role gate, then a login route per role, then resolution from the
backend.

1. `/` cold-launches to `src/app/(public)/index.tsx`, which reads the persisted
   role preference (`src/utils/rolePreference.ts`) and steers: unset to the role
   gate `/role-select`, `traveller` to onboarding and then traveller login,
   `staff` straight to `/staff-login`.
2. `/staff-login` requires a **tenant** before it will submit —
   `src/screens/shared/StaffLoginScreen.tsx:36` disables the button without one,
   on the stated grounds that staff accounts are provisioned per tenant, so a
   tenant-less staff login can only fail. Traveller login is the tenant-less path.
3. The **authoritative** role is resolved after login, not from that preference:
   `resolveRoleFromAffiliations()`
   (`src/providers/SessionProvider.tsx:99`, called at `:184`) reads the user's CRM
   affiliations and maps the primary affiliation's `partyType` — `MERCHANT` to
   merchant, `REFUNDPOINT` to refund point, anything else to traveller. It never
   throws; on failure it falls back to traveller so a transient error cannot trap
   a user behind a staff-only UI. Travellers are fast-pathed from the sign-in
   route and skip affiliation resolution.
4. `src/app/(auth)/_layout.tsx:39` holds the app on a skeleton until the role
   arrives, so no authenticated screen renders against an unresolved role.

**The deferred-scan resume** is what lets a scan taken before login survive the
`(public)` to `(auth)` route-group swap. A logged-out traveller who scans
something that needs authentication has the intent stashed in a module-level
zustand store (`src/store/pendingScan.ts`) — either a `claim` carrying tag number
and sales amount, or a `validate` carrying a `qrValue`. `useResumePendingScan()`
runs once when the authenticated app mounts, called from
`src/app/(auth)/_layout.tsx:22`: it reads the intent imperatively, clears it
immediately, then either replaces the route with `/validate` or posts the
self-assign and navigates to the claimed tag (`src/hooks/useResumePendingScan.tsx`).
That is `A38`, and it takes no second button press.

**`web-app/apps/web`** — no role gate, and no public route at all. `PUBLIC_ROUTES`
is empty and `PROTECT_ALL_ROUTES=true` in `apps/web/.env`; the only routes
reachable unauthenticated are the three login-flow ones named in
`UNAUTHORIZED_ROUTES` (`login`, `register`, `reset-password`). Routing middleware
sends every other unauthenticated request to `/login` with the original path kept
as `?redirectTo=` (`packages/utils/auth/middleware.ts:126`–`142`). The airport
kiosk at `/qr` is inside an `(external)` route group but is **not** exempt: it is
an authenticated customs page, which is why `A73` can require
`DeviceService.Devices.ViewList` before any QR is generated. Role is not chosen
here at all — it is read off session claims, and the branch that decides whether
an operator counts as a merchant is
`isMerchantUser = Boolean(sessionMerchantId) && !sessionRefundPointId` at
`apps/web/src/app/[lang]/(main)/(unirefund)/operations/scan-sticker/client.tsx:367`.

**`web-app/apps/ssr`** — public by exception, and one route to a session.
`PUBLIC_ROUTES=/,explore,tag,validate,barcode-scanner-demo,card-demo` in
`apps/ssr/.env` exempts `tag` and `validate` from the authentication redirect,
matched on the first path segment after `[lang]`
(`packages/utils/auth/middleware.ts:89`), which is why `A77`–`A81` and
`A84`–`A86` all work logged out. The deferred claim is the same `redirectTo`
mechanism the middleware uses, built explicitly:
`/{lang}/login?redirectTo={/{lang}/tag/{slug}}` at
`apps/ssr/src/app/[lang]/(public)/tag/[slug]/page.tsx:147`, so the button hands
`/login` a pointer back at the very slug the traveller was reading (`A83`). The
claim path additionally requires a **completed KYC session** before any token is
issued — `A87` then `A88` — and there is no route to a session in this app that
skips it.

## Indexes

### Action-id index

Every id in the registry, with the chapter that owns its narration. Chapters are
[traveller](traveller.md), [merchant](merchant.md),
[refund-point](refund-point.md) and [customs](customs.md). This table was
generated from the registry's `ID`, `Action` and `Actor` columns rather than
transcribed, so it cannot drift from them by hand.

| ID | Action | Owning chapter |
| --- | --- | --- |
| A01 | Scan a QR before choosing a role | traveller, merchant, refund-point † |
| A02 | Scan a QR from the traveller login screen | traveller |
| A03 | Look up a tag by typed tag number and passport number | traveller |
| A04 | Look up the tag issued on a typed sticker line number | traveller, merchant, refund-point |
| A05 | Resolve a bare tag number to its tag id | merchant, refund-point |
| A06 | Read a scanned tag's public detail by tag id | traveller, merchant, refund-point † |
| A07 | Read a tag's public detail by tag number and traveller document | traveller |
| A08 | Read the tag issued on a scanned sticker line | traveller |
| A09 | Claim an unclaimed draft tag | traveller |
| A10 | Assign a traveller to a scanned draft tag | merchant, refund-point |
| A11 | Resolve a traveller by document number to attach or assign | merchant, refund-point |
| A12 | Resolve a scanned sticker line | merchant, refund-point |
| A13 | A used sticker opens its tag instead of a create form | merchant, refund-point |
| A14 | Resolve the merchant an allocated sticker book is booked to | refund-point |
| A15 | Pick a merchant for an unallocated sticker book | refund-point |
| A16 | Load own product groups to price a sticker tag | merchant |
| A17 | Load own VAT identity for the sticker create call | merchant |
| A18 | Refuse a sticker book allocated to another merchant | merchant |
| A19 | Create a tag against a scanned sticker as the merchant | merchant |
| A20 | Create a tag against a scanned sticker on a merchant's behalf | refund-point |
| A21 | Capture the merchant and traveller signatures on a sticker tag | merchant, refund-point |
| A22 | Run the airport self-validation scan | traveller |
| A23 | Scan the boarding pass for the flight ticket | traveller |
| A24 | Rescan an expired validate QR mid-flow | traveller |
| A25 | Claim a further tag from the validation results | traveller |
| A26 | Refuse a validate QR scanned by staff | merchant, refund-point |
| A27 | Create a tag from the merchant Create Tag screen | merchant |
| A28 | List own tags across tenants | traveller |
| A29 | List the tenant's tags | merchant, refund-point |
| A30 | Open the detail of a tag the caller owns | traveller |
| A31 | Open the tenant detail of a tag by id | merchant, refund-point |
| A32 | Assign a traveller to a draft tag from the tag detail | merchant, refund-point |
| A33 | Scan a QR from the authenticated app | traveller, merchant, refund-point |
| A34 | Classify a raw scan as tag, sticker, validate or unknown | traveller, merchant, refund-point † |
| A35 | Turn a classification plus the active role into a destination | traveller, merchant, refund-point † |
| A36 | Own the scanner's visibility and hand a read to the routing | traveller, merchant, refund-point † |
| A37 | Perform a scan destination: navigate, refuse, or resolve first | traveller, merchant, refund-point † |
| A38 | Complete a claim deferred through login, once authenticated | traveller |
| A39 | Open the camera and scan a code on the sticker page | merchant, refund-point |
| A40 | Read a sticker line number or tag code from a wedge scanner | merchant, refund-point |
| A41 | Classify a scan as sticker, tag, validate or nothing | merchant, refund-point |
| A42 | Refuse a traveller validate QR scanned by staff | merchant, refund-point |
| A43 | Resolve a scanned sticker line | merchant, refund-point |
| A44 | A used sticker opens its tag instead of the create form | merchant, refund-point |
| A45 | Resolve a tag id from a scanned tag number | merchant, refund-point |
| A46 | Refuse to open a scanned tag without the tag-view grant | merchant, refund-point |
| A47 | Refuse a sticker book allocated to another merchant | merchant |
| A48 | Resolve the merchant a scanned sticker book is booked to | refund-point |
| A49 | Load own product groups to price a scanned sticker tag | merchant |
| A50 | Load own merchant identity for the sticker create call | merchant |
| A51 | Pick a merchant for an unallocated sticker book | refund-point |
| A52 | Preview the picked merchant on the unallocated sticker line | refund-point |
| A53 | Attach a traveller to a scanned sticker tag by document search | merchant, refund-point |
| A54 | Capture the merchant and traveller signatures on a scanned sticker tag | merchant, refund-point |
| A55 | Create a tag against a scanned sticker as the merchant | merchant |
| A56 | Create a tag against a scanned sticker on a merchant's behalf | refund-point |
| A57 | List the tenant's tags a scan-created tag lands in | merchant, refund-point, customs ‡ |
| A58 | Open the tag a scanned QR resolved to | merchant, refund-point, customs ‡ |
| A59 | Assign a traveller to a draft tag from the tag detail | merchant, refund-point, customs |
| A60 | Render the tag's own QR onto the printable tax-free form | merchant, refund-point, customs ‡ |
| A61 | Print the tag through the report service | merchant, refund-point, customs ‡ |
| A62 | Create a tag from the new-tag form, with no sticker scanned | merchant ‡ |
| A63 | Open the bulk scan-and-assign sheet | customs |
| A64 | Scan draft tag QRs into the bulk basket with the camera | customs |
| A65 | Read a draft tag code into the bulk basket from a wedge scanner | customs |
| A66 | Type a tag number into the bulk basket | customs |
| A67 | Look up each scanned tag before it enters the bulk basket | customs |
| A68 | Refuse a scanned tag that is not an unassigned draft | customs |
| A69 | Resolve the traveller the bulk basket will be assigned to | customs |
| A70 | Assign every tag in the bulk basket to that traveller | customs |
| A71 | Resolve a traveller from a scanned passport at the customs desk | customs |
| A72 | Load the tags of the traveller under customs review | customs |
| A73 | Require a registered kiosk device before a validate QR is shown | customs |
| A74 | Generate the rolling customs validate QR | customs |
| A75 | Roll the displayed validate QR every thirty seconds | customs |
| A76 | Scan tags into a refund — disabled, the code is present but commented out | refund-point |
| A77 | Look up a tag by typed tag number and passport number | traveller |
| A78 | Read the tag issued on a scanned sticker line | traveller |
| A79 | Read a tag's public detail by tag number and traveller document | traveller |
| A80 | Read an unclaimed draft tag's public detail by tag id | traveller |
| A81 | Offer the claim only while the tag has no traveller | traveller |
| A82 | Claim an unclaimed draft tag from the scanned tag page | traveller |
| A83 | Defer the claim through login and resume on the same tag | traveller |
| A84 | Refuse a validate page opened without a scanned QR value | traveller |
| A85 | Probe whether the session can still scan before trusting it | traveller |
| A86 | Grant the device location for the validation scan | traveller |
| A87 | Resolve whether the KYC-verified traveller already has an account | traveller |
| A88 | Exchange the KYC session for an access token and sign in | traveller |
| A89 | Scan the boarding pass for the flight ticket | traveller |
| A90 | Run the airport self-validation scan | traveller |
| A91 | Enrich the scan result with each returned tag's detail | traveller |
| A92 | Rescan a validate QR that expired mid-flow | traveller |
| A93 | Scan a further tag's QR in the claim modal and read it by id | traveller |
| A94 | Claim a further tag from the claim modal | traveller |
| A95 | Type a tag number and sales amount to claim without scanning | traveller |
| A96 | Re-run the validation scan after a claim so the new tag appears | traveller |
| A97 | List own tags across tenants | traveller |
| A98 | Open the claim modal from the tags page, behind the self-assign grant | traveller |
| A99 | Open one of the traveller's own tags by tag number | traveller |
| A100 | Type the flight ticket when there is no readable boarding pass | traveller |
| A101 | Carry the pre-KYC location across the login so the scan step does not re-prompt | traveller |
| A102 | Open the claim modal from the validation results | traveller |

102 ids, `A01` through `A102`, contiguous and each listed once.

**†** — six `super-app` rows carry `Actor: Anyone` or `Anyone, …` rather than a
named role: `A01`, `A06`, `A34`, `A35`, `A36`, `A37`. `super-app` has no Customs
or Admin route anywhere in the registry, so "every party" there cashes out to the
three roles that can reach a `super-app` route at all. That is the same reading
[`permissions-by-role.md`](permissions-by-role.md) applies, and it files each of
the six under Traveller, Merchant and Refund Point.

**‡** — the row's `Actor` also names **Admin**, which has no perspective chapter
in this guide. Admin's actions are not orphaned: they are filed in
[`permissions-by-role.md` § Admin](permissions-by-role.md#admin). `A62`'s actor
is `Merchant, Admin`, so merchant is its only chapter.

An id's owning chapter is where its narration belongs, not a claim about which
chapters currently mention it. Where the two disagree, `_verify/check.mjs`'s
`perspectives` check is the arbiter: it requires every id to be narrated in at
least one chapter, and in no more chapters than its `Actor` cell names.

**Two rows in this table are ahead of what that check will currently allow, and
saying so is better than a pointer that fails.** `check.mjs`'s `ACTOR_COUNT`
recognises the exact cell `Anyone` (scoring it all four chapters) and otherwise
counts only the party names it finds. `A01`'s cell is `Anyone, pre-login` and
`A06`'s is `Anyone, including logged out`, so neither the literal match nor the
name scan finds anything, and both fall to the function's floor of **one**
chapter. `A34`–`A37` carry the bare cell and are unaffected. So the three
chapters this table names for `A01` and `A06` — the same three
[`permissions-by-role.md`](permissions-by-role.md) files them under — cannot all
narrate them without the `perspectives` check failing. Which way that is settled,
the narration or the `Actor` cell, is not this file's call; it is a Findings row.

### Route → action

Do not look for that index here. It lives at the top of the registry —
[`actions-and-routes.md` § Route → action](actions-and-routes.md#route--action) —
together with the three placements that are not read off an action's own `Route`
cell and are recorded there for that reason. Copying it would give the guide two
route indexes that could disagree.

### How to read the permission column

Every `Permission` cell in the registry was arrived at by the same four steps,
and a reader can re-run them on any row:

1. **Find the client wrapper** named in the row — the app-local function that
   makes the call.
2. **Find the SDK method** it calls, also named in the row.
3. **Read that method's doc comment** in the generated SDK and take its
   `**Requires permissions:**` line verbatim. That line, and nothing else, is
   what the cell holds.
4. **When there is no such line, check the call site** — specifically whether the
   wrapper goes through `fetchRequest`, which is what attaches the bearer token.
   That is what separates `— anonymous` from `— authenticated, no grant`.

Declared status codes are **not** evidence at any step and must not be used:
every method in these SDKs lists 401 and 403 identically, including the genuinely
anonymous ones.

**A missing annotation means no permission — it does not mean no token.** That is
why the two no-permission cases are marked apart rather than collapsed:

| Cell | Means |
| --- | --- |
| a permission string | the SDK method states it requires exactly this |
| `— anonymous` | callable with **no token at all** |
| `— authenticated, no grant` | a bearer token is required; there is no permission gate |
| `—` | not applicable — used only by `— client only` rows, which call no endpoint and so have nothing to be anonymous or gated about |

A `— client only` action calls no service endpoint. It does not follow that it
runs in the browser: a server action that only reads or writes a cookie takes the
same marker (`A101`). Where such a row is reachable only inside an authenticated
session, that requirement lives in its `Actor` cell, which is where a row states
who may perform it.

What none of this establishes is which permissions a role actually **holds** —
that is backend configuration and is not in this repository. See
[`permissions-by-role.md` § What this file does not know](permissions-by-role.md#what-this-file-does-not-know),
which records the only two grant facts on the record and why nothing may be
inferred beyond them.

## Division of labour with `docs/QR.md`

[`../QR.md`](../QR.md) and this guide answer different questions and neither
repeats the other.

| `docs/QR.md` owns | This guide owns |
| --- | --- |
| Capability numbers up to `#29` — permanent, never renumbered, with `#26` and `#27` retired as aliases | Action ids (`A01`–`A102`), likewise permanent |
| Per-app support: which app has a capability and which does not | Routes, actions, and the UI entry and call chain behind each |
| Decisions — what will be built, what is declined, and what is delivered | Endpoint ownership, permissions, and one test flow per action |
| The behaviour matrix `T1`–`T3`, `M1`–`M3`, `R1`–`R3` | Which party performs which action, and which chapter narrates it |

The ✅/❌/⚠️ support marks are `docs/QR.md`'s and are **never** duplicated here:
they are a snapshot that will drift, whereas the numbers will not. Registry rows
cite a capability number in their `Cap #` column and a behaviour cell in `Cell`,
which is the join between the two documents — read in that direction, from an
action to the capability it serves, never by copying a mark across.

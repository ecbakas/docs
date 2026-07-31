# QR handling — README

This file answers what the guide covers and how its nine files fit together.

_Verified against: 2026-07-31 · super-app `24221f7` · web-app `0cf122af0`._

`pos-app` is cited in one section of this file, once in passing in
[`endpoints.md`](endpoints.md) and in [`customs.md`](customs.md), and as a source
of printable test codes in [`test-flows.md`](test-flows.md); the revision read was
`13f1d1f`. No file gives it a row — see the end of § Where the codes come from. It
is named apart from the stamp above because the stamp pins the two repositories
every other file in the guide is derived from.

## The six flows this guide was asked about

The guide was commissioned around six numbered flows. All six are answered, but
nothing in the guide is organised *by* them — it is organised by party, by
endpoint and by role. This table is the map back, so the person who asked can go
straight to the answer.

| The flow | Registry ids | The endpoint contract | Narrated in |
| --- | --- | --- | --- |
| 1. **A merchant creates a tag** — with or without a traveller attached, with or without a `stickerLineNumber` | `A19`, `A55` (sticker scanned); `A27`, `A62` (no sticker) | `POST /api/tag-service/tag` — [creating a tag](endpoints.md#tagservice--creating-a-tag). Whether a traveller comes with it is the `status`/`traveller` coupling: [Draft or Issued](endpoints.md#draft-or-issued-status-and-traveller-are-coupled). `stickerLineNumber` is optional on this DTO, which is how one call both creates and binds | [`merchant.md` § Creating a tag against the sticker](merchant.md#creating-a-tag-against-the-sticker-a19a55) and [§ Creating a tag with no sticker at all](merchant.md#creating-a-tag-with-no-sticker-at-all-a27a62) |
| 2. **A refund point creates a tag from a `stickerLineNumber`** — with or without a traveller | `A20`, `A56`; the merchant it books against comes from `A14`/`A48` (allocated) or `A15`/`A51`/`A52` (not) | `POST /api/tag-service/tag/by-sticker-line` — a **different grant** (`CreateByStickerLine`) and a **narrower DTO** than flow 1: no merchant signature, no sales-person id. Read [Sticker allocation: permanent on first use](endpoints.md#sticker-allocation-permanent-on-first-use) before running it against an unallocated book | [`refund-point.md` § Creating the tag](refund-point.md#creating-the-tag-a20a56-10-29) |
| 3. **A traveller claims a tag** — reached by sticker QR or by tag QR | Sticker: `A08`, `A78`. Tag: `A06`, `A07`, `A79`, `A80`. Claim: `A09`, `A38`, `A82`, `A83`, `A94`, `A95` | The read is anonymous; the claim is `POST /api/tag-service/tag/traveller-self-assign`, which takes `{ tagNumber, salesAmount }` and **no identity** — see [I need to put a traveller on a tag](endpoints.md#i-need-to-put-a-traveller-on-a-tag). Only a `Draft` tag is claimable at all | [`traveller.md` § T2](traveller.md#t2--sticker-qr), [§ T3](traveller.md#t3--tag-qr), [§ only a Draft tag is claimable](traveller.md#cross-cutting-only-a-draft-tag-is-claimable-and-the-client-checks-for-it-differently-across-surfaces) and [§ deferred claim intent](traveller.md#cross-cutting-deferred-claim-intent) |
| 4. **A merchant assigns a traveller** to a tag already created | `A10`, `A32`, `A59`; `A53` resolves who | `POST /api/tag-service/tag/{id}/assign-traveller` — the **staff** operation, and not the same as flow 3's self-assign: the body carries a whole traveller identity and no proof. Needs the tag's Guid, so a number-only QR cannot assign | [`merchant.md` § Assigning a traveller](merchant.md#assigning-a-traveller-a10a32a59) |
| 5. **A refund point assigns a traveller** to a tag already created | `A10`, `A32`, `A59`; `A53` resolves who | Same endpoint, same grant, and **no role branch anywhere in the code that serves it** — the assign gate does not distinguish the two staff roles on either app, which is what the section opposite confirms rather than assumes | [`refund-point.md` § Assigning a traveller](refund-point.md#assigning-a-traveller-a10a32a59) |
| 6. **Any party scans a code and sees the details** | Pipeline: `A33`–`A37`, `A39`–`A41`. Resolution: `A05`, `A12`, `A43`, `A45`, `A06`, `A31`, `A58`. Refusals: `A26`, `A42`, `A46` | Which read a scan is entitled to is the whole of [I need to look up a tag](endpoints.md#i-need-to-look-up-a-tag) — six endpoints split by whether the caller is authenticated and whether the identifier is itself the credential | § [How each app resolves a QR](#how-each-app-resolves-a-qr) and § [Which QR each party may not use](#which-qr-each-party-may-not-use) in this file; then the party's own chapter |

Customs is not one of the six, and has a chapter anyway
([`customs.md`](customs.md)): it produces the validate QR the traveller scans
(`A73`–`A75`) and scans printed tag QRs in bulk (`A63`–`A70`).

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

`_verify/check.mjs` checks the promises this guide makes about itself. Run it from
the workspace root:

```bash
node docs/qr/_verify/check.mjs            # every check
node docs/qr/_verify/check.mjs rolePerms  # one or more named checks
```

Eleven checks, and what each is for:

| Check | What it will not let past |
| --- | --- |
| `files`, `stamps` | A missing file; a missing `Verified against:` line; **one file stamped against a different revision from the other eight** |
| `placeholders` | Eight banned strings — the usual not-done-yet markers plus the two angle-bracket tokens this guide's own templates used, i.e. a scaffolded stub nobody filled in. The list lives in the check, the only place it can be written down without tripping over itself |
| `registry` | A malformed or duplicate action id; an empty `Endpoint` or `Permission` cell; a marker used where it asserts something false (`— anonymous` on a row that calls no endpoint) |
| `perspectives` | An action narrated in no chapter, or in a chapter **its `Actor` does not name** |
| `endpoints`, `endpointPerms` | A registry endpoint with no row; a row claiming actions the registry does not give it; an action listed under an endpoint it does not call; and an `endpoints.md` `Permission` cell that **differs from the registry's** |
| `permissions`, `rolePerms` | An action missing from `permissions-by-role.md`; and a `Permission` or `Endpoint` cell there that **differs from the registry's** |
| `testflows`, `flowRigour` | An action with no `TF-` flow; and a flow with **no `EXPECT`** or **no negative cases** |

`endpointPerms`, `rolePerms`, `flowRigour` and `perspectives`'s membership rule
were added on 2026-08-01, because the joins before them proved only that the right
*ids* appeared in the right *files* — and the guide's central claim is stronger
than that. The registry is the **single origin** for every action id, actor,
endpoint and permission, and the derived files **copy** its cells rather than
restating them. Where any other file appears to disagree with the registry, the
registry wins and the other file is wrong — and the checker now says so, instead
of the reader having to notice.

## QR types and the wire format

Three QR codes exist in the Unirefund world — sticker, tag and validate — and one
library reads all three:
[`@unirefund/qr`](https://github.com/ayasofyazilim-clomerce/unirefund-qr)
(`github:ayasofyazilim-clomerce/unirefund-qr`, version `0.1.0`), a dependency of
`super-app`, `pos-app`, `apps/web` and `apps/ssr` alike. A fourth printed code, a
1D Code128 barcode, is the subject of the next section; the library does not read
it. The package's exports, read from `dist/types/index.d.ts`:

| Module | Exports |
| --- | --- |
| `codec` | `base64UrlEncode`, `base64UrlDecode` |
| `slug` | `encodeTagSlug`, `decodeTagSlug`, `decodeTagScan`, `slugFromScan`, `UnencodableTagFieldError`, `TagSlugData`, `TagSlugInput` |
| `link` | `buildTagUrl`, `resolveTagLink`, `ResolveTagLinkArgs`, `ResolveTagLinkResult` |
| `validate` | `buildValidateUrl`, `extractValidateQrValue`, `isValidateScan` |

**The scope of that claim matters, so it is stated narrowly.** The library is the
single source of truth for **decoding**: every app reaches a Unirefund code
through one of three entry points — `decodeTagScan` for a camera or wedge read,
`decodeTagSlug` for a slug already in hand, and `extractValidateQrValue` for a
validate URL. `decodeTagSlug` is the one that matters most on `apps/ssr`, because
it is what the primary traveller route uses: `/tag/[slug]` hands it the route
parameter directly (`(public)/tag/[slug]/page.tsx:140`).

One app-local exception exists, and it is worth naming rather than rounding off.
`apps/ssr`'s claim-tag modal defines a **private** `slugFromScan` at
`(public)/validate/_components/claim-tag-modal.tsx:53` — a line-for-line duplicate
of the package's exported function of the same name (`src/slug.ts:164`–`168`),
differing only in that the package guards a null input — and feeds its result to
the package's `decodeTagSlug` at `:119`. So the decode itself is shared even there;
it is the URL-to-slug step in that one file that is a copy. It agrees with the
package today, which makes it a latent duplicate rather than a live defect, and
exactly the kind of copy that drifts once the exported one changes.

For **encoding** the library is the source for some producers and
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

`pos-app` gets **no** action rows and **no** endpoint rows anywhere in this guide.
It is named where it produces or reads a code, as above, and once in passing in
[`endpoints.md`](endpoints.md) — as one of the three `saas` trees searched for a
permissioned but ungenerated SDK method — but no row in the registry, in
`endpoints.md`, in [`permissions-by-role.md`](permissions-by-role.md), in the
perspective chapters or in [`test-flows.md`](test-flows.md) is about it.

## How each app resolves a QR

- **`apps/ssr` barely scans.** A tag QR encodes `{ssrBaseUrl}/tag/{slug}`, so the
  traveller's own camera app opens the browser and `/tag/[slug]` decodes the slug
  server-side. Resolution is routing. Its only in-app **barcode** cameras are the
  boarding-pass scanner (`A89`), the expired-QR rescan modal (`A92`) and the
  claim-tag modal's scan tab (`A93`) — the three `BarcodeCameraScanner` mounts in
  `apps/ssr/src`, enumerated rather than assumed. Two further cameras read no code
  this guide is about: a `CreditCardScanner` in the add-card dialog and one in the
  card-scanner demo, cited in
  [`actions-and-routes.md`](actions-and-routes.md#actions--web-appappsssr). "Only"
  is therefore a claim about barcode readers, not about camera use.
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
   `src/screens/shared/StaffLoginScreen.tsx:35`–`36` disables the button without
   one, on the stated grounds — its own comment, `:33`–`34` — that staff accounts
   are provisioned per tenant, so a tenant-less staff login can only fail.
   Traveller login is the tenant-less path.
3. The **authoritative** role is resolved after login, not from that preference:
   `resolveRoleFromAffiliations()`
   (`src/providers/SessionProvider.tsx:99`, called at `:184`) reads the user's CRM
   affiliations and maps the primary affiliation's `partyType` — `MERCHANT` to
   merchant, `REFUNDPOINT` to refund point, anything else to traveller. It never
   throws; on failure it falls back to traveller so a transient error cannot trap
   a user behind a staff-only UI. **Only the Didit/KYC sign-in skips it.**
   `getUserData` resolves the role as `opts?.role ?? (await
   resolveRoleFromAffiliations())` (`SessionProvider.tsx:184`), and
   `signInWithDidit` is the one caller that passes `{ role: "traveller" }`
   (`:258`). The e-mail/password path — `signIn` at `:245`, which is what
   `TravellerLoginScreen.tsx:49` calls — passes no `opts`, so a traveller
   signing in with a password **does** run `resolveRoleFromAffiliations()`. The
   consequence is worth stating: the two sign-in routes resolve role differently
   for the same account. The code comment at `:180` ("Travellers are known from
   the sign-in path") is true of the KYC path only.
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

**`web-app/apps/ssr`** — public by exception, and **two** routes to a session.
`PUBLIC_ROUTES=/,explore,tag,validate,barcode-scanner-demo,card-demo` in
`apps/ssr/.env` exempts `tag` and `validate` from the authentication redirect,
matched on the first path segment after `[lang]` — the segment is derived at
`packages/utils/auth/middleware.ts:89` and matched against `PUBLIC_ROUTES` at
`:102` — which is why `A77`–`A81`, `A84` and
`A86` work logged out.

**`A85` does not, and the difference is the point of the row.** It is the probe
that asks whether a session can still scan before the flow trusts it, so it
requires both a token and a grant —
`TravellerService.Travellers, TravellerService.Travellers.GetMyDocumentAffiliations`,
triggered on a validate page load that already carries a session cookie. Its
neighbours `A84` and `A86` are `— client only` and do work logged out. See the
registry row for `A85` in [`actions-and-routes.md`](actions-and-routes.md).

The deferred claim is the same `redirectTo` mechanism the middleware uses, built
explicitly: `/{lang}/login?redirectTo={/{lang}/tag/{slug}}` at
`apps/ssr/src/app/[lang]/(public)/tag/[slug]/page.tsx:147`, so the button hands
`/login` a pointer back at the very slug the traveller was reading (`A83`).

**What `/login` then offers is two paths, not one, and which one the traveller
takes decides whether `A87` and `A88` run at all.**
`apps/ssr/src/components/auth/login-form.tsx` renders a username-or-email field
(`:107`) and a password field (`:135`) whose submit (`:147`) calls
`signInServerApi` with the `redirectTo` it read off the query string (`:60`).
Signing in with KYC is an **alternative** button beside it, a link to
`/login/kyc` (`:157`). So a traveller who already has a password completes the
deferred claim through the password form and never touches `A87` or `A88`. The
KYC route is the one that requires a **completed KYC session** before any token is
issued — `A87` then `A88` — and it is how a traveller with no account yet gets
one; it is not the only way into a session in this app. Neither path takes a row of
its own in the registry, because signing in is not QR-triggered: the QR-triggered
half of the round trip is `A83`, which is why `/login` is listed under `A83`
rather than under a login action.

## Findings

Everything the survey turned up that is a **disagreement rather than a
description**: two sources that cannot both be right, a gate that does not match
what it guards, a control that exists and is never reached. They are recorded here
and **not fixed** — this is a documentation pass, and a defect written down is
cheaper to triage than a defect repaired by someone who found it at the wrong
moment.

Ordered by consequence, worst first. A defect that loses a traveller's signature
outranks a stale comment. Every row names the file, what disagrees with what, and
the action ids affected; where a row says a behaviour differs between apps, both
sides were read, because agreement between two derived documents is not evidence
and neither is one side of a comparison.

| # | Finding | What disagrees with what | Actions |
| --- | --- | --- | --- |
| F1 | **`super-app` can send one traveller's signature under another's details, on an irreversible create** | `apps/web` defends against this and `super-app` does not. `components/traveller-form.tsx:63`–`82` is a `useEffect` that clears the saved signature and fires `onSignatureChange(undefined)` on *any* external change of the `traveller` prop, with the comment *"A signature belongs to the traveller who gave it"* and *"The create is irreversible, so this is cleared here rather than at each caller."* `super-app` has no equivalent: of the four `useEffect`s in `screens/staff/StickerTag/`, three are routing and toasts (`StickerTagScreen.tsx:128`, `:146`, `:155`) and the fourth is a network fetch keyed on the scanned value (`useStickerLine.ts:292`, `void resolve();`) — **none of the four clears a signature**, which is the half that matters here. Both traveller call sites are bare state setters (`StickerTagScreen.tsx:524`–`526` select, `:390` remove). The payload diverges the same way: `apps/web` gates `travellerSignatureBase64` on `hasTraveller` (`scan-sticker/client.tsx:322`, `:686`–`688`, `:701`–`703`), `super-app` gates it only on the string being non-empty (`stickerTag.logic.ts:160`–`162`, `:234`–`236`; `useStickerTag.ts:130`–`134` converts unconditionally). So on `super-app` a stale signature both survives the swap **and** reaches the request body | `A19`, `A20`, `A21` — and `A27`, whose `useCreateTag.ts:127` sends the field with no traveller gate at all. `A54`, `A55`, `A56` are the defended `apps/web` counterparts |
| F2 | **Three traveller-search entry points, three permission postures** | The UI gate and the endpoint disagree, and two of three surfaces have no gate. `tax-free-tags/[tagId]/_components/assign-traveller.tsx:50`–`54` gates on `TravellerService.Travellers.ViewList`; the search it gates reaches `getApiTravellerServiceTravellersSearchByDocumentNumber`, whose annotation (`packages/saas/TravellerService/sdk.gen.ts:813`) requires `TravellerService.Travellers.SearchByTravellerDocumentNumber`. `components/search-traveller.tsx` (604 lines) and `operations/tags/_components/traveller-search-bar.tsx` (398 lines) contain no permission check of any kind — whole-file greps for `isActionGranted` / `polic` return nothing. `isActionGranted` requires **all** listed policies (`packages/utils/policies/action-policy.tsx:8`–`13`), so a holder of one grant and not the other is wrong in both directions | `A53`, `A59`, `A69`, `A71`; `A11` is `super-app`'s counterpart |
| F3 | **Two anonymous endpoints keyed on a KYC session id, one disclosing an e-mail and one minting a token** | Neither `GET /api/traveller-service/ssr-public-actions/get-email` nor `POST /api/traveller-service/ssr-public-actions/get-access-token` carries a `**Requires permissions:**` line (`packages/saas/TravellerService/sdk.gen.ts:216`–`228`, `:243`–`255`); the only inputs are `sessionId` plus a `kycSessionProvider` discriminator, both typed optional. The first returns `email` **and** an `isExistingAccount` oracle; the second returns `accessToken`, `idToken` and `refreshToken`. `scope` on the second is **caller-supplied and the only required field** (`types.gen.ts:137`), and the SSR caller fills it with the union of everything the OIDC server advertises — `login-via-ssr-action.ts:16`–`26` passes `await fetchScopes()`, which is `scopes_supported.join(" ")` (`packages/utils/auth/auth-actions.ts:44`–`52`). A caller asking for the maximal grant disagrees with a token endpoint that constrains nothing | `A87`, `A88` |
| F4 | **`apps/ssr` loses the post-claim rescan on a dropped response, and its claim modal can be dismissed mid-claim** | `super-app` guards both and `apps/ssr` guards neither. `super-app`'s `ClaimTagModal.tsx:107`–`115` fires `onClaimAttempted()` **before** the await, on the stated grounds that *"a commit that lands on the server but whose response we never see must still trigger the parent's re-scan"*, and `:69`–`75` returns early `if (isClaiming) return;` with the X disabled at `:148`. On `apps/ssr`, `use-validate-flow.ts:314`–`321` sets `claimedSinceOpenRef` only from `onTagClaimed`, which `claim-tag-modal.tsx` invokes only inside `res.type === "success"` (`:151`, `:192`) — there is no attempt-tracking prop on `ClaimTagModalProps` at all (`:35`–`39`) — and `handleClose` (`:208`–`218`) checks no in-flight flag while the dialog defaults to a rendered close button (`packages/ayasofyazilim-ui/src/components/dialog.tsx:53`) with Escape and overlay click unguarded | `A93`, `A94`, `A95`, `A96`, `A102`; `A25` is the guarded `super-app` side |
| F5 | **`web-app`'s generated SDK is stale on the sticker-line create, and the drift is undetected** | The behaviour is settled: creating against an unallocated sticker line **permanently allocates the whole sticker book** to the merchant sent, first-use-wins, and it cannot be re-pointed. `super-app/src/saas/TagService/sdk.gen.ts:414` states it with both cases spelled out; `merchant-info` agrees byte for byte in both trees and documents its `merchantId` parameter for the unallocated case; both apps' call-site comments say the same. **`web-app/packages/saas/TagService/sdk.gen.ts:547` is an older generation of that one comment** and still says the header *"must already be assigned to a merchant, otherwise the request is rejected"* — which also contradicts `:266` in its own file, so that client is internally inconsistent and `super-app`'s is not. This is the copy `apps/web` and `apps/ssr` developers read: it tells them a flow their own app ships is unsupported, inviting a "fix" to working code, and **nothing compares the two vendored trees**, so the drift is silent. It misled this guide's own survey until the two copies were read side by side. Regenerate `web-app/packages/saas/TagService`. Two cases and full sourcing in [`endpoints.md`](endpoints.md#sticker-allocation-permanent-on-first-use) | `A15`, `A20`, `A48`, `A51`, `A52`, `A56` |
| F6 | **A captured merchant signature is dropped with no error** | `CreateTagByStickerLineRequestDto` has no `merchantIndividualSignatureBase64` and no `salesPersonIndividualId` (`packages/saas/TagService/types.gen.ts:766`–`794`), while the standard create has both. Nothing rejects a caller that captured one; the field simply does not exist to send. Both apps avoid it only by gating the merchant pad in the UI — a client-side convention in front of a silent server-side data loss, not a rule | `A20`, `A54`, `A56`; `A21` on `super-app` |
| F7 | **A page is gated on a permission no endpoint requires** | `components/sidebar-layout/data.ts:664`–`673` gates the tax-free-tags nav on `TagService.Tags.View`, and `:679` gates CustomsTags the same way. That nav entry is the **only** gate: `tax-free-tags/page.tsx` carries no permission check of its own, and its `:124` `missingPolicies` prop names the same string as an after-the-fact hint on a failed request, not as a second gate. `TagService.Tags.View` is a real permission (`packages/utils/policies/policies.json:669`) but appears in **none** of the 52 `**Requires permissions:**` annotations in `TagService`, in any of the three vendored SDK trees. Granting it opens a menu entry and authorises no read; the page's actual calls need `.ViewList` and `.ViewSummary` | `A57`, `A63`, `A72` |
| F8 | **The scan-sticker page is gated on the merchant create grant the Refund Point path was redesigned not to need** | `components/sidebar-layout/data.ts:722`–`734` lists seven policies, among them `TagService.Tags.Create`, `CRMService.Merchants.View` and `.ViewProductGroupList`. `isActionGranted` requires all of them (`action-policy.tsx:8`–`13`). A Refund Point issues through `TagService.Tags.CreateByStickerLine` and resolves the merchant through `StickerHeaders.ViewMerchantInfo` — precisely the split `#29` and `#15` introduced — so the nav gate can hide the page from the role the page exists to serve | `A39`–`A56` |
| F9 | **A client-side gate names one grant and the page it navigates to needs another** | `scan-sticker/client.tsx:393`–`396` computes `canViewTag = isActionGranted(["TagService.Tags.ViewSummary"], …)`, and `:409` uses it to refuse `openTag` — navigation to `/operations/tax-free-tags/{tagId}`, whose own read (`A58`) requires `TagService.Tags.Detail`. `ViewSummary` is, per its own SDK comment, the grant for a **different** endpoint — an aggregate financial / risk report (`packages/saas/TagService/sdk.gen.ts:791`–`793`) — which no registry row reaches. An operator holding `Detail` and not `ViewSummary` is refused a tag they are entitled to open; the reverse holder passes this gate and then meets the server's own `Detail` check. **Two things an earlier draft of this row cited are not evidence.** The nav gate is *justified*: `data.ts:671` requires `ViewSummary` for the tax-free-tags entry, and the page calls `getTagSummaryApi` → `GET /api/tag-service/tag/summary` at `tax-free-tags/page.tsx:133`. And `page.tsx:124` / `:139` are `missingPolicies` props on an `<ErrorComponent>` rendered only **after** a request has already failed (`:120`, `:134`), which `packages/ui/src/components/error-component.tsx:105`–`112` draws as destructive badges — a diagnostic hint for the operator, not a gate. `merchant.md` § M3 and `refund-point.md` § R3 cite the client-side gate correctly | `A46`, `A58` |
| F10 | **One endpoint, three openers, one gate** | `apps/ssr` has exactly one `isActionGranted` call in the whole app — `tags/_components/tag-claim.tsx:14`, which hides `A98`'s claim button behind the self-assign grant. `A102` opens the same modal against the same endpoint from the validation results with no check (`validate-client.tsx:202`, `:207`), and `A82` posts to it directly from the public tag page with no check (`claim-tag-button.tsx:50`). The grant check exists in one of three places that reach `POST /api/tag-service/tag/traveller-self-assign` | `A82`, `A98`, `A102`; `A94`, `A95` are the modal interior |
| F11 | **The print control on a page four roles reach has no gate, and the grant it would have used is computed and thrown away** | In `tax-free-tags/[tagId]/_components/tag-actions.tsx` the Refund button is conditional on `status === "ExportValidated" && hasGrant.Refund` (`:90`), and the Print button beneath it (`:107`–`129`) carries no `hasGrant` condition at all. **What makes this look like a regression rather than a decision:** the same `hasGrant` object computes `Print: isActionGranted(["ReportService.Reports", "ReportService.Reports.CreateSynchronously"], …)` at `:50`–`53` — the exact grant `A61`'s call requires — and **nothing ever reads it.** The only `hasGrant` references in the file are `.ExportValidation` (`:58`, itself inside a commented-out block), `.EarlyRefund` (`:73`) and `.Refund` (`:90`). So the ungated Print button sits directly beside a dead grant check for the grant it needs. Printing renders the tag's own QR (`print-tag.tsx:286`) and calls the report service. `A60`/`A61` carry `Actor: Merchant, Refund Point, Customs, Admin` | `A60`, `A61` |
| F12 | **The bulk-assign gate omits the grant the flow cannot finish without** | The assign-draft sheet is opened behind a `TagService` policy check, but completing it requires resolving a traveller by document number — `TravellerService.Travellers.SearchByTravellerDocumentNumber` — which the gate does not name, and which the sheet's own search component does not check either (see F2). Two entry points to the identical sheet gate it differently: `customs-tags-config.tsx:291` and `customs-tags-workspace.tsx:176` | `A63`, `A69`, `A70` |
| F13 | **A documented, permissioned way to read a Draft tag has no client at all** | `TagService.Tags.DetailByEncryptedTagNumber` is present in every `policies.json` (`packages/utils/policies/policies.json:688` and its three siblings) and has a localised label, yet the string appears in **zero** generated SDK methods across `web-app/packages/saas`, `super-app/src/saas` and `pos-app/src/saas`. It is not orphaned prose either: `sdk.gen.ts:1049` instructs callers *"(To read a not-yet-claimed Draft tag, use the by-encrypted variant, whose unpredictable token is the credential.)"* — an instruction that cannot be followed | none — a `— contrast` row in [`endpoints.md`](endpoints.md) |
| F14 | **One printed code routes to different destinations depending on which app scans it** | A slug carrying **both** a sticker line number and a tag identity is a `sticker` on `apps/web` (`scan-sticker/client.tsx:175`–`176`) and a `tag` on `super-app` (`classifyScan.ts:54`–`56`), and each app's own comment calls its choice *"the more specific answer"*. Decoding is shared through `@unirefund/qr`; precedence is not. Whether any producer emits such a slug is not answerable here, because the backend authors `publicLink` | `A34`, `A41` |
| F15 | **The two BCBP boarding-pass parsers have drifted** | `super-app/src/utils/qr/bcbp.ts` tolerates a leading symbology prefix and whitespace (`:18`–`21`, matching `/M[1-9]/` anywhere and slicing from it, with the comment that *"the original rigid `charAt(0) === "M"` check silently dropped those"*), accepts passes from 44 characters (`:23`), validates both airport codes against `/^[A-Z]{3}$/` (`:38`–`41`) and reads with bounds checks (`:26`–`27`). `apps/ssr` runs the older strict version inline — `flight-info-step.tsx:29` rejects anything not starting with `M` or shorter than 58 characters, and `:42`–`46` accepts any three characters as an airport code. The same boarding pass can scan on mobile and fail on web, or parse to different values | `A23`, `A89` |
| F16 | **The tag QR has two possible authors** | `print-tag.tsx:286` encodes `TagDetailDto.publicLink` and never calls `buildTagUrl`; the sticker print path is the mirror image, encoding locally with `buildTagUrl` and never reading the `publicLink` the backend publishes on `StickerLineReportDto`. Whether the two agree is not answerable from this repository. The library ships the detector for exactly this — `resolveTagLink`'s `onDrift` — and only `pos-app` wires it up (`src/utils/tagQr.ts:35`, behind `__DEV__`); neither `apps/web` print path is in a position to use it | `A60`; the sticker print path takes no row |
| F17 | **The "already validated" result bucket is computed, fetched and never rendered, on both apps** | `super-app`'s section spec for it is commented out (`ScanResultView.tsx:57`–`68`) while `alreadyClearedTagIds` survives in the key union at `:17`. `apps/ssr` types and fills `alreadyCleared` (`scan-result-view.tsx:40`, `:56`) and no renderer ever reads it. Both apps carry live translation strings for a bucket that cannot appear: `MobileApp.Qr.Validate.AlreadyCleared` (`super-app/src/localization/resources/en-US.json:84`, and `tr-TR`) referenced only from the commented line, and `Validate.ScanResult.AlreadyClearedTags` (`apps/ssr/src/language-data/unirefund/SSRService/resources/en.json:314`, and `tr`) referenced nowhere in any `.ts`/`.tsx` | `A22`, `A90`, `A91` |
| F18 | **The kiosk precondition and the generate endpoint disagree on how many kiosks is right** | `(external)/qr/page.tsx:47`–`52` derives `hasKiosk` from `totalCount > 0` and otherwise renders the registration form. The endpoint states the opposite rule: *"the caller must own exactly one DeviceType.Kiosk device — 0 or more raises a critical log + failure"* (`packages/saas/ExportValidationService/sdk.gen.ts:33`). With two or more registered kiosks the precondition passes, the registration prompt is skipped, and the generate fails into a generic `ErrorComponent` — the one screen that cannot tell the operator what to do | `A73`, `A74` |
| F19 | **A dev host is the kiosk's fallback validate host** | `(external)/qr/_components/utils.ts:37` interpolates `https://ssr-dev.unirefund.com` whenever the backend's response carries no `validateBaseUrl`. The backend value is preferred whenever present, so this is a fallback and not a hardcoded host — but the field is documented as `null` *"when the tenant has not configured one"* (`ExportValidationService/schemas.gen.ts:220`–`228`), so a tenant missing one country setting silently encodes a dev domain into a QR handed to a paying traveller. Its stated purpose is to let *"the frontend stop hardcoding the SSR domain"* | `A74`, `A75` |
| F20 | **`classifyScan` is duplicated, not shared** | `apps/web` defines its own at `scan-sticker/client.tsx:161`; `super-app` has one at `src/utils/qr/classifyScan.ts:38`. This is a decision, not an oversight — `super-app`'s file comment argues classification is *"product policy per app rather than a wire format"*, and the wedge is the concrete reason the two cannot be one function. Recorded because F14 is what the split costs, and nobody chose that | `A34`, `A41` |
| F21 | **Two apps print Unirefund codes and neither runs the shared conformance fixtures** | `@unirefund/qr/vectors.json` pins 8 golden slug vectors, and `super-app` and `pos-app` each run them (`classifyScan.test.ts:8`, `tagQr.test.ts:2`). **No `web-app` test imports the package at all** — so `apps/web`, which prints the sticker QR and the printable tag QR, is not covered by the fixtures that define the format it prints | `A60`; the sticker print path takes no row |
| F22 | **`#28`'s traveller half is credited to no action** | The staff path is complete and cited: `A05` and `A34` carry `Cap #` 28. The traveller path for the same printed Code128 is `A34` → `A37`'s `need-traveller-document` branch (`useScanRouting.ts:71`–`78`, which routes to `/manual-entry` with the tag number prefilled) → `A03`, and neither `A37` nor `A03` cites 28. Verified end to end this pass; left uncredited rather than corrected, because whether the catalogue means `#28` to cover a two-step traveller resolution is `docs/QR.md`'s question and not the registry's | `A03`, `A34`, `A05`, `A37` |
| F23 | **Three endpoints return "product groups" and only two carry a `vatRate`** | Not a defect — the trap behind `#15`, and the reason a caller that picks the wrong one prices a tag with no VAT rate to apply. Resolved by the decision table in [`endpoints.md`](endpoints.md); recorded so the resolution is not mistaken for an absence of a problem | `A15`, `A16`, `A49`, `A51` |
| F24 | **A self-assign variant is defined twice and called never** | `POST /api/tag-service/tag/traveller-self-assign/by-tag-id` is generated in the SDK and reached by no registry row, while its wrapper comment names the exact case both apps then solve with an extra round trip — reading the tag by id to recover its tag number before claiming by number | none — a `— contrast` row in [`endpoints.md`](endpoints.md) |
| F25 | **`GET /tag` accepts risk filters and silently drops them from a caller without the risk grant** | The drop is **conditional and deliberate**, and the row says so because the unqualified version overstates it. `packages/saas/TagService/sdk.gen.ts:454`: `riskLevels`, the two risk-evaluation dates and a risk sort are *"silently ignored when the caller lacks the permission to filter/sort by risk (`TagService.TagRisks.FilterByRisk`, see UNI-1227/UNI-1343)"*, and the comment calls it intentional — the API returns 200 rather than an authorization error so client integrations stay error-free across deployments, on the assumption the frontend hides the controls. What survives as the Finding is the failure mode that assumption leaves: a caller that *does* send the filters without the grant gets an unfiltered page that is indistinguishable from a filtered one. `endpoints.md`'s `GET /api/tag-service/tag` row carries both qualifiers | `A29`, `A57`, `A72` |
| F26 | **Four `— anonymous` cells rest on call-site evidence, not on an SDK statement** | `GET /public/tag`, `GET /public/tag/by-sticker-line-number` and the two `ssr-public-actions` methods have neither a `**Requires permissions:**` line nor prose about tokens. Their `— anonymous` marking is derived from the call site — the `TagPublicService` wrappers bypass `fetchRequest`, which is what attaches the bearer token. That is the guide's own documented test (§ How to read the permission column) and it is the mandated one, but the anonymous / authenticated distinction is load-bearing enough that the weakest four should say so, and [`endpoints.md`](endpoints.md) does | `A07`, `A08`, `A78`, `A79`, `A87`, `A88` |
| F27 | **`apps/ssr`'s claim modal offers to claim any tag, whatever its status** | The rule is uniform server-side — only an unowned Draft is claimable — and every other surface checks for it client-side first. `super-app`'s validate-results modal runs `deriveTagKind` and shows dedicated "already issued" / "divergent" copy instead of a button (`ClaimTagModal.tsx:137`, `:192`–`208`); `apps/ssr`'s own `/tag/[slug]` page at least tests for an absent traveller (`tag/[slug]/page.tsx:122`–`131`). **`apps/ssr`'s claim modal tests nothing**: the strings `status`, `traveller` and `Draft` do not occur anywhere in `validate/_components/claim-tag-modal.tsx`. A scanned tag goes from `lookupTag` straight to the confirm step with a Claim button (`:87`–`110`); a typed tag number is posted with no lookup at all (`handleManualClaim`, `:128`–`157`). Both rely entirely on the self-assign endpoint's own rejection, surfaced as a generic toast (`:153`, `:194`), so the traveller is offered an action on a tag that cannot take it and told only that something went wrong | `A93`, `A94`, `A95`; `A98` and `A102` are its two openers |
| F28 | **Only one app names the "no tag on this sticker yet" case** | The same scan of the same sticker gets a dedicated answer on one app and a generic failure on the other. `super-app` renders `MobileApp.Qr.TagPreview.NoTagOnSticker` — *"No tax-free tag has been issued on this sticker yet. Ask the store to complete your purchase."* — for exactly this case, branching on `stickerLineNumber` (`TagPreviewScreen.tsx:239`; string at `super-app/src/localization/resources/en-US.json:41`). `apps/ssr` has no equivalent copy: a sticker-line lookup that resolves to nothing falls through to the same `LookupFailed` component every other lookup failure uses (`tag/[slug]/page.tsx:166`–`167`, component at `:73`–`98`), which shows `Error.SomethingWentWrong` over the server's own message. The traveller's next step — ask the store — is the one thing the generic path does not say | `A08`, `A78` |

**Nothing in this table was added by inference from another guide file.** Every row
was re-derived from application or SDK source during the final verification pass;
where the pass changed a Finding rather than confirming it, the change is in the row.
Two rows — `F5` and `F22` — were new to that pass and in no running note before it
(`F27` and `F28` are newer still; see below). `F5` is the larger: the
survey had carried this as *"the SDK contradicts itself, so the unallocated-book flow
may be broken"* for most of its length, and **that framing was wrong in both halves.**
Reading `super-app`'s copy of the same doc comment beside `web-app`'s showed the
disagreement to be between two **generations** of one comment rather than between two
endpoints, which settles the behaviour — permanent first-use-wins allocation — and
makes the apps correct rather than broken. The defect that survives is the stale copy
and the fact that nothing detects it. Everywhere the guide previously hedged this
outcome now states it, because a hedge invites a tester to find out and a warning stops
them. `F22` is the other, closed as a causal chain and left open as a catalogue
question.

`F7`, `F19` and `F25` are narrower than first recorded: `TagService.Tags.View` is a
real permission rather than an invented identifier, the `ssr-dev` host is a fallback
rather than a hardcoded one, and the risk-filter drop is conditional on the caller
lacking `TagService.TagRisks.FilterByRisk` and is documented as intentional. `F9`
changed more than that — its first two citations turned out not to be evidence, and
the row now points at the client-side gate that is (see the row).

**`F27` and `F28` were added by the final whole-branch review**, which found two
chapter-level *"routed as a Finding"* promises in
[`traveller.md`](traveller.md) that resolved to no Finding at all — the claim modal
with no draft check, and the missing no-tag-on-sticker copy. Both are here now, and
both are cross-linked from the passages that raised them. They are appended rather
than slotted into the consequence order above, because an `F`-number is cited from
four other files and must not move: `F27` would otherwise sit beside `F4` and `F10`,
and `F28` near the bottom. No Finding on the running list was dropped as unfounded,
and with these two, none was raised in a chapter and then left unrecorded either.

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

**See also [`qr/README.md`](qr/README.md), the QR handling guide.** The two
documents answer different questions and neither repeats the other: this catalogue
answers **what exists** — which capability each app has, what it is numbered, and
what was decided about it — and the guide answers **how it works and how to test
it**, action by action, with the route, the UI entry, the call chain, the endpoint,
the permission and a test flow for each. Its `Cap #` column is the join back to the
numbers here.

|             | Traveller | Merchant | Refund Point | Customs |
| ----------- | --------- | -------- | ------------ | ------- |
| Validate QR | T1        | M1       | R1           | C1      |
| Sticker QR  | T2        | M2       | R2           | C2      |
| Tag QR      | T3        | M3       | R3           | C3      |

| Code | Actor        | QR          | Behaviour                                                                                                                                                                                                               |
| ---- | ------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1   | Traveller    | Validate QR | The traveller verifies their identity and views the tags assigned to them; when manual verification is required, they go to customs.                                                                                    |
| T2   | Traveller    | Sticker QR  | When the traveller scans their sticker QR, they see the details of the linked tag if one exists, and can claim the tag if no assignment was made at the store.                                                          |
| T3   | Traveller    | Tag QR      | When the traveller scans their tag QR, they see the tag's details, and can claim the tag if no assignment was made at the store.                                                                                        |
| M1   | Merchant     | Validate QR | The merchant cannot do anything with the validate QR; scanning it may only raise an invalid QR warning.                                                                                                                 |
| M2   | Merchant     | Sticker QR  | When the merchant scans the sticker QR, they see the details of the linked tag if one exists and can assign a traveller on this screen. If it is not linked to a tag, a tag is created and the link is established.     |
| M3   | Merchant     | Tag QR      | When the merchant scans the tag QR, they see the details of the relevant tag and can assign a traveller.                                                                                                                |
| R1   | Refund Point | Validate QR | The refund point cannot do anything with the validate QR; scanning it may only raise an invalid QR warning.                                                                                                             |
| R2   | Refund Point | Sticker QR  | When the refund point scans the sticker QR, they see the details of the linked tag if one exists and can assign a traveller on this screen. If it is not linked to a tag, a tag is created and the link is established. |
| R3   | Refund Point | Tag QR      | When the refund point scans the tag QR, they see the details of the relevant tag and can assign a traveller.                                                                                                            |
| C1   | Customs      | Validate QR | Customs is the **producer**, not a scanner — the inversion is the point of the cell. `T1`/`M1`/`R1` all describe what happens when the named party *scans* a validate QR; customs never scans one, and no action in the guide has customs reading one. Customs *manufactures* the QR the traveller scans and staff are refused for scanning, at the airport kiosk (`#20`). |
| C2   | Customs      | Sticker QR  | **Meaningless, and said so rather than left blank.** No action in the guide gives customs a sticker actor: every sticker-line resolution, sticker-tag create and merchant-picker action carries only Merchant and/or Refund Point. Customs has no route that reads a sticker QR, prints one, or creates against one. There is no cell to fill. |
| C3   | Customs      | Tag QR      | Meaningful, and two different shapes of interaction rather than one. Customs scans printed tag QRs **in bulk** into a running basket, restricted to unassigned Draft tags and resolved to one traveller in one batched action (`#17`). Separately customs reaches a single tag's detail, assigns a traveller there, and prints it — but by clicking a row in a list, not by scanning: it has no camera-driven route to a *single* tag's detail the way `M3`/`R3` do. |

Apps and their purposes
Mobile/Core = Its works like template other apps created from this repository there are no role guard etc..
Mobile/App = Its for mobile phones and tablets and can be used by travelers, refund points and merchants.
Mobile/Pos = Its for pos devices and only used by merchants
Unirefund Web/SSR = Its web application and can be used by travelers
Unirefund Web/Web = Its web application and can be used by admins, refund points, merchants and any other party type except travelers.

---

# QR capability catalogue

Stable reference numbers for every QR-related capability across the apps, so one can be named by `#` in conversation and in tickets.

**Numbers are permanent.** Never renumber. A dropped capability keeps its number and is struck through; a new one takes the next free number.

Surveyed **2026-07-29** against `mobile/app` @ `role/staff` and `unirefund-web` @ `catch-backend`. The ✅/❌ marks are a snapshot and will drift — the numbers will not.

## How each app resolves a QR

The three apps do not resolve a QR the same way, which is why some capabilities exist in one and are meaningless in another.

- **unirefund-web/apps/ssr** barely scans at all. A tag QR encodes `{ssrBaseUrl}/tag/{slug}`, so the traveller's phone _camera app_ opens the browser and `/tag/[slug]` decodes the slug server-side. Resolution is routing. Its only in-app **barcode** cameras are three, enumerated at source on 2026-07-31: the boarding-pass scanner, the expired-QR rescan modal and the claim-tag modal's scan tab — the three `BarcodeCameraScanner` mounts in `apps/ssr/src`. (This row previously said two and said "cameras" rather than "barcode cameras"; the app also has two `CreditCardScanner` cameras, in the add-card dialog and the card-scanner demo, which read no code this catalogue is about.)
- **mobile/app** scans in-app: `classifyScan` turns a raw string into a navigation decision client-side. This is why mobile needed an explicit `sticker` kind, which SSR never did — a URL routes itself.
- **unirefund-web/apps/web** additionally supports a **wedge / keyboard barcode scanner** (a keydown buffer with a burst timeout). Mobile deliberately does not: no wedge exists on a phone, which is why an undecodable string stays `unknown` on mobile but is read as a sticker line number on web.

## A. Traveller — `mobile/app` vs `unirefund-web/apps/ssr`

| #   | Capability                                                   | mobile/app | apps/ssr |
| --- | ------------------------------------------------------------ | ---------- | -------- |
| 1   | Tag QR → view the tag                                        | ✅         | ✅       |
| 2   | Sticker QR → view the tag issued on it                       | ✅         | ✅       |
| 3   | Claim an unclaimed draft tag                                 | ✅         | ✅       |
| 4   | Claim deferred through login, resumed afterwards             | ✅         | ✅       |
| 5   | Airport self-validation (location → flight → scan → results) | ✅         | ✅       |
| 6   | Boarding-pass BCBP barcode scan                              | ✅         | ✅       |
| 7   | Rescan when the validate QR expires mid-flow                 | ✅         | ✅       |
| 8   | Claim further tags from the validation results view          | ✅         | ✅       |
| 9   | Manual tag lookup when the QR will not scan                  | ✅         | ✅       |

## B. Staff — `mobile/app` vs `unirefund-web/apps/web`

| #   | Capability                                                     | mobile/app | apps/web                       |
| --- | -------------------------------------------------------------- | ---------- | ------------------------------ |
| 10  | Sticker → create a tag                                         | ✅         | ✅                             |
| 11  | Refund-point merchant picker, with the allocation warning      | ✅         | ✅                             |
| 12  | Attach a traveller at creation (status `Issued`)               | ✅         | ✅                             |
| 13  | Capture the traveller's signature                              | ✅         | ✅                             |
| 14  | A used sticker opens its tag instead of a create form          | ✅         | ✅                             |
| 15  | Merchant staff resolve the merchant without `ViewMerchantInfo` | ✅         | ✅                             |
| 16  | Tag QR → assign a traveller (one tag)                          | ✅         | ✅                             |
| 17  | Bulk: scan N tags, assign them all to one traveller            | ❌         | ✅                             |
| 18  | Manual tag-number entry                                        | ✅         | ✅                             |
| 19  | Wedge / keyboard barcode scanner                               | n/a        | ✅                             |
| 20  | Generate the rolling validate QR (airport kiosk)               | ❌         | ✅                             |
| 21  | Scan tags into a refund                                        | ❌         | ⚠️ code present, commented out |
| 22  | Scanning a validate QR is refused with a clear message         | ✅         | ✅                             |

## C. Plumbing

| #   | Capability                                                     | mobile/app | unirefund-web                         |
| --- | -------------------------------------------------------------- | ---------- | ------------------------------------- |
| 23  | In-app camera scanning                                         | ✅         | partial — SSR resolves by URL instead |
| 24  | Scan before logging in / before choosing a role                | ✅         | ✅                                    |
| 25  | A sticker allocated to another merchant is refused client-side | ✅         | ✅                                    |
| 28  | A printed Code128 tag-number barcode resolves when scanned     | ✅         | n/a — no camera on the staff console  |
| 29  | Sticker tag creation uses the role-correct create endpoint     | ✅         | ✅                                    |

**#28** is a gap the app creates for itself: POS receipts print `printBarcode(tagNumber, "code128")`, the mobile scanner's default symbologies include `code-128`, so the barcode is read — and then rejected as "Unrecognized code", because a bare tag number decodes to nothing. Discovered 2026-07-29 while auditing the QR contract.

**#29** is a permission boundary, not a preference. `POST /tag/by-sticker-line` is gated behind `TagService.Tags.CreateByStickerLine` and exists for a Refund Point issuing on behalf of a merchant it does not own; merchants hold `TagService.Tags.Create` and send `CreateTagRequestDto`, which carries `stickerLineNumber` so the sticker still binds in one call. Both apps previously used the Refund Point endpoint for every role.

## D. Same defect, two numbers

| Pair              | Why                                                                                                                                                                                                                                                                                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~**#14 ≡ #27**~~ | **Withdrawn 2026-07-30.** The claim was that `apps/web/scan-sticker` never checks `isUsed` / `tagId`. It does, and always did — `handleScan` has carried an `openTag` helper and a used-sticker branch throughout. The original entry came from a read of the page taken before the branch moved and never re-checked. Both #14 and its alias #27 are ✅. |
| **#15 ≡ #26**     | `apps/web/scan-sticker` calls `getStickerLineMerchantInfo` for every role — the same call that returned 403 for merchant staff on mobile.                                                                                                                                                                                                                 |

Track each pair under the **lower** number. #26 and #27 are retired as aliases.

## Decisions — 2026-07-29

### Do

Every catalogued gap is either delivered or explicitly declined.

**Delivered 2026-07-30:** #8 — a traveller can claim a further tag from the validation results without losing them. Scan-only, because `/manual-entry` already covers typed entry. Design: `docs/superpowers/specs/2026-07-30-claim-from-validation-results-design.md`.

**Delivered 2026-07-30:** #12 and #13 on web — a sticker tag can be issued straight to a traveller, and merchant and traveller signatures are captured. Design: `docs/superpowers/specs/2026-07-30-web-scan-sticker-parity-design.md` in `mobile/app`.

**Delivered 2026-07-30:** #29 in both apps, and #15 (alias #26) on web — the merchant-info fix shipped with the endpoint split, since fixing which endpoint creates a tag does not help a merchant who cannot get past the lookup. Design: `docs/superpowers/specs/2026-07-30-role-correct-tag-creation-design.md` in `mobile/app`.

**Delivered 2026-07-29:** #9, #18 and #28 — one change, since all three are the same shortfall. Design and plan: `docs/superpowers/specs/2026-07-29-manual-code-entry-design.md` and `docs/superpowers/plans/2026-07-29-manual-code-entry.md` in `mobile/app`.

**#8** is already recorded as the Phase 3 follow-up in `mobile/app/QR_FEATURE_CHECKLIST.md`.

The reference implementation for **#14** and **#15** already exists at `mobile/app/src/screens/staff/StickerTag/useStickerLine.ts`: the merchant path derives allocation from `stickerLine.merchantId`, identity from the sticker line or CRM, and product groups from `getProductGroupByIdApi`, so `getStickerLineMerchantInfo` is called only for a Refund Point.

### Don't

| #   | What                                       | Note              |
| --- | ------------------------------------------ | ----------------- |
| 17  | Bulk scan-and-assign on mobile             | Stays web-only    |
| 20  | Generate the rolling validate QR on mobile | Stays a web kiosk |
| 21  | Scan tags into a refund                    | Leave disabled    |

Every capability in the catalogue now carries a decision — there is nothing undecided.

## Verification still outstanding

On-device camera scanning of a real printed sticker has not been done: as a merchant, as a refund point (both an allocated and an unallocated sticker book), and as a traveller.

---

# E. From the QR handling guide — 2026-07-31

Numbers `#30`–`#51`, taken by the defects the survey behind [`qr/README.md`](qr/README.md) turned up. Each is a **new** capability taking the next free number, per the rule at the top of this catalogue; nothing above is renumbered and no decision above is changed.

Two corrections to the marks above were made at the same time, both from source, and both **under-credited `apps/web`** — a mark is a snapshot, so correcting one is not renumbering:

- **`#22`** was `n/a` for `apps/web` and is now ✅. `scan-sticker/client.tsx:442`–`445` checks `scan.kind === "validate"` before any tag decode and raises `AssignSticker.ValidateQrNotUsable` — *"This is a traveller's validation QR code. Scan a sticker or a tag QR code instead."* — present in both `en` and `tr`. That is the named-problem refusal this row describes, not a generic failure.
- **`#25`** was ❌ for `unirefund-web` and is now ✅. `scan-sticker/client.tsx:483`–`500` compares the sticker line's `merchantId` against the operator's own case-insensitively, raises `AssignSticker.MerchantAllocated`, and sets `isForeignAllocation: true`. The refusal is client-side and shipped.

These 22 arrive **undecided**. The closing line of the 2026-07-29 decisions — that nothing in the catalogue is undecided — was true of the catalogue as it stood that day and is left as written; it does not extend to this section.

| #   | Capability                                                                      | Where                     | Note |
| --- | ------------------------------------------------------------------------------- | ------------------------- | ---- |
| 30  | A signature is invalidated when the traveller it belongs to changes              | mobile/app                | The worst of the set. `apps/web` clears it and mobile does not, and mobile's request builders gate the field on the signature being non-empty rather than on a traveller being attached — so a stale signature both survives a traveller swap and reaches an irreversible create. Also `CreateTag`, which has no gate at all. Guide `F1` |
| 31  | Traveller search is gated on the permission its endpoint actually requires       | unirefund-web/apps/web    | One surface checks `Travellers.ViewList` where the call needs `.SearchByTravellerDocumentNumber`; two more have no check at all. Wrong in both directions, because grants are checked as ALL. Guide `F2` |
| 32  | The anonymous KYC-session endpoints do not over-disclose or over-scope           | backend + apps/ssr        | One returns an e-mail plus an account-existence oracle; one mints an access and refresh token with a caller-supplied `scope`, which the SSR caller fills from the whole OIDC `scopes_supported` union. Neither is permission-gated. Guide `F3` |
| 33  | A claim survives a dropped response, and cannot be dismissed mid-flight          | unirefund-web/apps/ssr    | mobile fires its re-scan trigger before the await and blocks dismissal while claiming; web does neither, so a claim that commits server-side without a visible response is silently lost. Guide `F4` |
| 34  | `web-app`'s generated SDK is regenerated, and tree-to-tree drift is detected     | unirefund-web             | Sticker allocation is settled: the create allocates the whole book permanently, first-use-wins. `web-app`'s `by-sticker-line` comment is an **older generation** still saying an unallocated header is rejected — contradicting `merchant-info` in its own file, while `super-app`'s copy is consistent. It is the client web developers read, it says a flow their app ships is unsupported, and nothing compares the two vendored trees, so the drift is silent. It misled this documentation effort for most of its length. Regenerate, and consider a check that diffs the trees. Guide `F5` |
| 35  | A captured merchant signature reaches the server or is refused                   | backend + both apps       | `CreateTagByStickerLineRequestDto` has no merchant-signature field, so a captured signature is dropped with no error. Prevented today only by UI gating. Guide `F6` |
| 36  | Page gates name permissions some endpoint requires                               | unirefund-web/apps/web    | The tax-free-tags and CustomsTags entries require `TagService.Tags.View`, a real permission that no SDK method requires anywhere. Granting it opens a menu and authorises no read. Guide `F7` |
| 37  | A Refund Point can reach the scan-sticker page                                   | unirefund-web/apps/web    | Its nav gate requires all seven of its policies, including `Tags.Create` and both CRM merchant grants — the grants `#29` and `#15` exist to avoid needing. Guide `F8` |
| 38  | A gate checks the grant its destination uses                                     | unirefund-web/apps/web    | Gated on `Tags.ViewSummary`; opening a tag needs `Tags.Detail`, and no flow in the guide reaches the summary endpoint at all. Guide `F9` |
| 39  | The self-assign grant is checked wherever the claim is offered                   | unirefund-web/apps/ssr    | Three controls reach `POST /tag/traveller-self-assign`; exactly one checks the grant, and it is the app's only client-side grant check. Guide `F10` |
| 40  | The tag print control is gated like its siblings                                 | unirefund-web/apps/web    | The Refund button beside it is grant-gated; Print is not, on a page four actors reach, and it renders the tag's QR. Guide `F11` |
| 41  | The bulk-assign gate names the traveller-search grant it needs                   | unirefund-web/apps/web    | The sheet cannot be completed without a traveller search whose grant the gate does not mention, and whose own component checks nothing. Its two entry points gate differently. Guide `F12` |
| 42  | A not-yet-claimed Draft tag can be read the documented way                       | backend                   | `Tags.DetailByEncryptedTagNumber` is permissioned in every `policies.json` and generated in no SDK, while another method's comment tells callers to use exactly that variant. Guide `F13` |
| 43  | One printed code resolves to one destination in every app                        | both scanners             | A slug carrying both a sticker line and a tag identity is a sticker on web and a tag on mobile, each app's comment calling its own choice the more specific answer. Guide `F14` |
| 44  | The two boarding-pass parsers agree                                              | mobile/app + apps/ssr     | mobile tolerates symbology prefixes and whitespace, accepts shorter passes and validates airport codes; web runs the older strict version inline. The same pass can scan on one and fail on the other. Guide `F15` |
| 45  | A printed tag QR and a printed sticker QR are built from one source              | unirefund-web/apps/web    | One path renders the backend's `publicLink`, the other encodes locally with `buildTagUrl`. The library ships `resolveTagLink`'s `onDrift` for exactly this and only `pos-app` wires it. Guide `F16` |
| 46  | The "already validated" result bucket is rendered, or removed                     | both apps                 | Computed and fetched on both, rendered on neither, with live translation strings in both that nothing can display. Guide `F17` |
| 47  | The kiosk precondition matches the generate endpoint's rule                      | unirefund-web/apps/web    | The page accepts `totalCount > 0`; the endpoint requires exactly one Kiosk device. Two or more skips the registration prompt and fails into a generic error. Guide `F18` |
| 48  | A kiosk QR never encodes a dev host                                              | unirefund-web/apps/web    | `https://ssr-dev.unirefund.com` is the fallback when the tenant has not configured the validate base URL — a country setting away from printing a dev domain for a paying traveller. Guide `F19` |
| 49  | The apps that print Unirefund codes run the shared conformance fixtures          | unirefund-web             | `super-app` and `pos-app` run `vectors.json`; no `web-app` test imports the package, and `apps/web` prints both the sticker QR and the printable tag QR. Guide `F21` |
| 50  | `GET /tag` honours its risk filters or rejects them                              | backend                   | Accepted and silently dropped at 200, so an unfiltered page looks like a filtered one. Guide `F25` |
| 51  | The unused self-assign-by-tag-id variant is adopted or dropped                   | backend + both apps       | Generated, called by nothing, and its own comment names the case both apps solve with an extra round trip. Guide `F24` |

Not given numbers, and why: the split `classifyScan` is a decision already on the record rather than a defect (guide `F20`); the three product-group endpoints are a trap the guide resolves, not a fault (`F23`); `#28`'s uncredited traveller half is a question about this catalogue's scope rather than a code defect (`F22`); and the four `— anonymous` cells resting on call-site evidence are a statement about the guide's own sourcing (`F26`).

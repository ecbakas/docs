|             | Traveller | Merchant | Refund Point |
| ----------- | --------- | -------- | ------------ |
| Validate QR | T1        | M1       | R1           |
| Sticker QR  | T2        | M2       | R2           |
| Tag QR      | T3        | M3       | R3           |

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

---

# QR capability catalogue

Stable reference numbers for every QR-related capability across the apps, so one can be named by `#` in conversation and in tickets.

**Numbers are permanent.** Never renumber. A dropped capability keeps its number and is struck through; a new one takes the next free number.

Surveyed **2026-07-29** against `mobile/app` @ `role/staff` and `unirefund-web` @ `catch-backend`. The ✅/❌ marks are a snapshot and will drift — the numbers will not.

## How each app resolves a QR

The three apps do not resolve a QR the same way, which is why some capabilities exist in one and are meaningless in another.

- **unirefund-web/apps/ssr** barely scans at all. A tag QR encodes `{ssrBaseUrl}/tag/{slug}`, so the traveller's phone _camera app_ opens the browser and `/tag/[slug]` decodes the slug server-side. Resolution is routing. Its only in-app cameras are the boarding-pass scanner and the expired-QR rescan modal.
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
| 8   | Claim further tags from the validation results view          | ❌         | ✅       |
| 9   | Manual tag lookup when the QR will not scan                  | ✅         | ✅       |

## B. Staff — `mobile/app` vs `unirefund-web/apps/web`

| #   | Capability                                                     | mobile/app | apps/web                       |
| --- | -------------------------------------------------------------- | ---------- | ------------------------------ |
| 10  | Sticker → create a tag                                         | ✅         | ✅                             |
| 11  | Refund-point merchant picker, with the allocation warning      | ✅         | ✅                             |
| 12  | Attach a traveller at creation (status `Issued`)               | ✅         | ❌                             |
| 13  | Capture the traveller's signature                              | ✅         | ❌                             |
| 14  | A used sticker opens its tag instead of a create form          | ✅         | ✅                             |
| 15  | Merchant staff resolve the merchant without `ViewMerchantInfo` | ✅         | ✅                             |
| 16  | Tag QR → assign a traveller (one tag)                          | ✅         | ✅                             |
| 17  | Bulk: scan N tags, assign them all to one traveller            | ❌         | ✅                             |
| 18  | Manual tag-number entry                                        | ✅         | ✅                             |
| 19  | Wedge / keyboard barcode scanner                               | n/a        | ✅                             |
| 20  | Generate the rolling validate QR (airport kiosk)               | ❌         | ✅                             |
| 21  | Scan tags into a refund                                        | ❌         | ⚠️ code present, commented out |
| 22  | Scanning a validate QR is refused with a clear message         | ✅         | n/a                            |

## C. Plumbing

| #   | Capability                                                     | mobile/app | unirefund-web                         |
| --- | -------------------------------------------------------------- | ---------- | ------------------------------------- |
| 23  | In-app camera scanning                                         | ✅         | partial — SSR resolves by URL instead |
| 24  | Scan before logging in / before choosing a role                | ✅         | ✅                                    |
| 25  | A sticker allocated to another merchant is refused client-side | ✅         | ❌                                    |
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

| #   | What                                                | Where                    |
| --- | --------------------------------------------------- | ------------------------ |
| 8   | Claim further tags from the validation results view | `mobile/app`             |
| 12  | Attach a traveller at creation                      | `unirefund-web/apps/web` |
| 13  | Capture the traveller's signature                   | `unirefund-web/apps/web` |

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

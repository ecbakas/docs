# Design: Creating a sticker tag through the endpoint the caller's role can actually use

**Date:** 2026-07-30
**Repos:** `mobile/app` (branch `role/staff`) and `unirefund-web` (branch `catch-backend`)
**Catalogue:** new #29, and #15/#26 for the web half

**Cross-repo.** This spec lives in `mobile/app` because that is where the workspace's `docs/superpowers/specs` directory is, following the precedent of `2026-07-28-shared-qr-library-design.md`, but it governs both repos. The two halves ship as separate commits on separate branches; neither depends on the other landing first.

## Goal

A merchant issuing a tax-free tag against a store sticker must create it through `POST /tag`, not `POST /tag/by-sticker-line`. Both apps currently use `by-sticker-line` for every role.

## Why it is wrong today

The two endpoints are not interchangeable, and the split is a permission boundary rather than a preference:

| Endpoint | Permission | Who it is for |
| --- | --- | --- |
| `POST /tag/by-sticker-line` | `TagService.Tags.CreateByStickerLine` | its own summary says "for a **Refund Point** issuing a tag at its own counter" — the merchant is resolved server-side from the sticker line's allocation |
| `POST /tag` | `TagService.Tags.Create` | the standard flow, where the merchant identifies **itself** in the request |

Merchants hold `Tags.Create` — the existing merchant create-tag screen uses it and works in production. They are not expected to hold `Tags.CreateByStickerLine`, which exists so a Refund Point can act *on behalf of* a merchant it does not own.

This is the same shape as the `ViewMerchantInfo` 403 already fixed on mobile: an endpoint written for the Refund Point case was being used for both roles, and only the Refund Point's permission set was ever exercised.

## The sticker still binds in one call

`UniRefund_TagService_Tags_CreateTagRequestDto` already carries:

```
/** Optional sticker line number to associate with the tag upon creation. */
stickerLineNumber?: (string) | null;
```

So the merchant path is a **single request**, not create-then-assign. The `POST /tag/{id}/assign-sticker-line…` endpoints exist for attaching a sticker to a tag that already exists, which is a different operation and out of scope here.

**Allocation is confirmed.** The human partner verified that `POST /tag` carrying a `stickerLineNumber` allocates a not-yet-allocated sticker book to that merchant, exactly as `by-sticker-line` does. That was the one behaviour this design could not establish from the code, and it is settled.

## Decisions (agreed with user)

1. **Merchant → `POST /tag`; Refund Point → `POST /tag/by-sticker-line`.**
2. **On mobile, merchants capture both signatures.** `CreateTagRequestDto` has `merchantIndividualSignatureBase64`, which `CreateTagByStickerLineRequestDto` does not. The sticker screen shows only the traveller pad today purely because of that missing field — so the same merchant capturing the same sale gets fewer signatures for having scanned a sticker. Refund Points keep the traveller pad only, since their DTO still has nowhere to put a merchant signature.
3. **The web merchant-info fix (#15/#26) rides along**, because it touches the same file and the same role branch, and because fixing which endpoint *creates* the tag does not help a merchant who cannot get past the *lookup*.

## What each role sends

### Merchant — `CreateTagRequestDto`

```ts
{
  status: traveller ? "Issued" : "Draft",
  merchant: { vatNumber, countryCode, externalIdentifier },
  stickerLineNumber,
  ...(traveller ? { traveller } : {}),
  invoices: [ { uuid, invoiceNumber, issueDate, totalAmount, vatAmount, invoiceLines } ],
  merchantIndividualSignatureBase64,   // mobile only; web has no pads
  travellerSignatureBase64,
}
```

`MerchantRequestDto` is `{ vatNumber: string; countryCode: string; externalIdentifier?: string | null }`. No `merchantId` — the merchant is identified by VAT number, which is what "the merchant identifies itself" means.

### Refund Point — `CreateTagByStickerLineRequestDto`

Unchanged in both apps, including the rule that `merchantId` is sent only for a line that is not yet allocated.

## Mobile

### A second pure builder

`src/screens/staff/StickerTag/stickerTag.logic.ts` gains `buildMerchantTagRequest`, beside the existing and already-tested `buildStickerTagRequest`. Same input shape plus the merchant identity and the merchant signature; returns `CreateTagRequestDto`.

Two builders rather than one branching builder: the two DTOs differ in which fields exist at all, not merely in values, and a single function returning a union would push the discrimination onto every caller. Both are pure, so both are tested the same way — which is what matters here, because the repo's `@testing-library/react-native` cannot load and the hooks are therefore untestable.

### The dropped field

`useStickerLine` maps the merchant's CRM detail into a `MerchantInfoForTagCreationDto`-shaped object so both roles can render through one `MerchantBlock`. That DTO has **no `externalIdentifier`**, so the value is currently fetched from CRM and silently discarded.

The hook will return it separately:

```ts
merchantIdentity: { vatNumber: string; externalIdentifier?: string } | null
```

Separate rather than widening the generated DTO's shape: that type is generated from the backend contract and inventing a field on it locally would misrepresent what the endpoint returns. `merchantIdentity` is `null` on the Refund Point path, which is correct — the Refund Point never identifies a merchant by VAT number.

For an **allocated** line the identity is available without CRM at all: `StickerLineInfoDto` carries `vatNumber` and `externalIdentifier` directly. CRM is the fallback for an unallocated line, where the sticker names no merchant yet.

### Wiring

`useStickerTag` takes `isMerchant`, `merchantIdentity` and the tenant `countryCode` (from `useCountrySettingsStore`, as the existing merchant create-tag screen does), and `submit()` picks builder and action by role. Cart, invoice number, traveller and totals are shared — only the final request differs.

`StickerTagScreen` renders `SignaturePads targets={isMerchant ? ["merchant", "traveller"] : ["traveller"]}`.

### Create is unavailable when the merchant path cannot be built

A merchant with no resolvable `vatNumber` cannot produce a valid request. That is already nearly impossible — the CRM detail failure path degrades to the sticker line's `vatNumber`, and product groups gate the cart — but the guard is explicit rather than relying on that chain.

Concretely on mobile: the existing `hasMerchantToBookAgainst` condition that gates the Create action gains "on the merchant path, a VAT number is resolved", and the existing `Qr.StickerTag.CreateBlocked` copy covers it. No new i18n key.

## Web — `apps/web/.../operations/scan-sticker/page.tsx`

Two changes in one pass.

### 1. The create split

`isMerchantUser` is already computed in that file. `handleIssueTag` branches on it: merchants call `postTagApi` with the body above; Refund Points call `postTagByStickerLineApi` exactly as now.

`countryCode` comes from `useTenant().countryCode2`, which the tags screens already use.

### 2. Merchants stop calling merchant-info (#15/#26)

`getStickerLineMerchantInfoApi` is gated behind `TagService.StickerHeaders.ViewMerchantInfo`. On mobile the merchant role does not hold it, and the call 403s; the web page makes the same call for every role. Whether web merchants hold it is unconfirmed, but the page should not depend on a permission written for the other role.

Merchants resolve without it, mirroring mobile:

| Need | Allocated line | Unallocated line |
| --- | --- | --- |
| Is it allocated? | `Boolean(stickerLine.merchantId)` | same |
| Name, VAT, external id | straight off `StickerLineInfoDto` | `getMerchantsByIdApi(sessionMerchantId)` |
| Product groups | `getMerchantProductGroupByIdApi(sessionMerchantId)` | same |

Both CRM actions already exist in `packages/actions/unirefund/CRMService/actions.ts`, and are the same pair mobile uses.

Refund Points keep `getStickerLineMerchantInfoApi` and the merchant picker unchanged — that endpoint is theirs, and previewing a merchant they do not own is exactly what it is for.

A merchant scanning a book allocated to a **different** merchant is refused client-side, as mobile does, rather than being allowed to submit something the backend will reject.

### Not in scope for web

Signature pads. That page captures none for either role, so decision 2 applies to mobile only, and catalogue #13 stays open.

## Errors

| Case | Behaviour |
| --- | --- |
| Merchant's CRM detail fails, line allocated | fall back to the sticker line's `vatNumber` / `externalIdentifier`; log |
| Merchant's CRM detail fails, line unallocated | no VAT number, so no valid request — Create unavailable with an explanation |
| Merchant's product groups fail | error state with Retry; the cart cannot price a line without a VAT rate |
| Create rejected | surface the server message; do not invent a client-side reason |

## Testing

Mobile, in the pure module that can hold tests:

- `buildMerchantTagRequest`: `stickerLineNumber` present; `merchant` carries VAT, country and external id; `externalIdentifier` omitted when absent; `Draft` without a traveller and `Issued` with one; totals derived from lines; both signature keys omitted when nothing was captured
- `buildStickerTagRequest`: unchanged, and its existing tests must stay green — the Refund Point path is not being altered
- A test asserting the merchant body carries **no** `merchantId`, and the Refund Point body carries **no** `merchant` — the two DTOs must not bleed into each other

Web has no test infrastructure in play here; `tsc` and lint are the verification, as with the rest of that app.

## Risks

| Risk | Mitigation |
| --- | --- |
| The two DTOs are similar enough to confuse | separate builders, and a test asserting each body lacks the other's discriminating field |
| Web merchants turn out to hold `ViewMerchantInfo` after all | the CRM path still works and needs no permission they lack; the change is not a regression either way |
| A merchant's CRM record has no VAT number | Create is unavailable with an explanation rather than posting an invalid request |

## Not verifiable here

Real merchant and Refund Point logins against a live tenant — specifically that a merchant's `Tags.Create` grant covers a create carrying a `stickerLineNumber`, and whether web merchants hold `ViewMerchantInfo`. Camera behaviour, as ever, needs a device.

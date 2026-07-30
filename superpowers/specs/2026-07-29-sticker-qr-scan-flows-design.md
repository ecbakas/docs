# Design: Sticker QR scan flows — staff create a tag, travellers see theirs

**Date:** 2026-07-29
**Repo:** `mobile/app`
**Branch at time of writing:** `role/staff`

## Goal

A scanned sticker QR currently does nothing. Make it resolve:

- **Logged-in staff** (merchant or refund point) → create a tax-free tag against that sticker line.
- **Everyone else** (travellers, and anyone scanning before login) → show the public tag issued on that sticker, if one exists.

## The gap

[`classifyScan.ts`](../../../src/utils/qr/classifyScan.ts) recognises a scan as a tag only when the decoded slug carries `tagId` or `tagNumber`:

```ts
const data = decodeTagScan(trimmed);
if (data.tagId || data.tagNumber) return { kind: "tag", data };
return { kind: "unknown", raw };
```

`@unirefund/qr` already decodes the slug's `s` key into `stickerLineNumber` — the shared-QR work deliberately shipped *sticker readiness, not sticker flows* (see [2026-07-28-shared-qr-library-design.md](./2026-07-28-shared-qr-library-design.md), "Out of scope"). So a sticker-only slug decodes correctly, fails the guard, and falls through to a `MobileApp.Qr.Unrecognized` toast.

This spec is the flow half that was deferred.

## What already exists

Nothing needs generating. Every endpoint is in the mobile `TagService` SDK today.

| Purpose | Client call | Permission |
| --- | --- | --- |
| Public tag from a sticker | `client.tagPublic.getApiTagServicePublicTagByStickerLineNumber` | none (anonymous) |
| Sticker line info | `client.stickerHeader.getApiTagServiceStickerHeaderStickerLineByStickerLineNumber` | `TagService.StickerHeaders.GetByLineNumber` |
| Merchant + product groups | `client.stickerHeader.getApiTagServiceStickerHeaderStickerLineByStickerLineNumberMerchantInfo` | `TagService.StickerHeaders.ViewMerchantInfo` |
| Merchant picker | `client.tag.getApiTagServiceTagMerchantsForCreation` | `TagService.Tags.ViewMerchantsForCreation` |
| Create the tag | `client.tag.postApiTagServiceTagByStickerLine` | `TagService.Tags.CreateByStickerLine` |

All four permission keys are present in `src/data/policies/policies.gen.json`, and `user.grantedPolicies` is already populated by `SessionProvider`, so gating works the same way the web does.

The reference implementation is the web page at
`unirefund-web/apps/web/src/app/[lang]/(main)/(unirefund)/operations/scan-sticker/`, whose README documents the merchant-allocation rules this spec mirrors.

## Decisions (agreed with user)

1. **Logged-in staff only.** No scan entry is added to `StaffLoginScreen`, and no sticker intent is deferred through login.
2. **A dedicated staff screen built from the existing calculator UX**, not a port of the web's compact form and not an overload of the existing create-tag tab.
3. **Full refund-point parity** — build the merchant picker, including the permanent-allocation warning.
4. **Required typed invoice number**, matching the web rather than the app's auto-generated `INV-<timestamp>`.
5. **Optional traveller picker + traveller signature pad.** A traveller makes the tag `Issued`; without one it is a `Draft` the traveller claims later by scanning the same sticker.
6. **An already-used sticker opens its existing tag** instead of offering a create form the backend would reject.
7. **The calculator components move to a shared location**, since refund-point staff now use them too.

## Routing

### `classifyScan` gains a fourth kind

```ts
export type ScanClassification =
  | { kind: "tag"; data: TagSlugData }
  | { kind: "sticker"; stickerLineNumber: string }
  | { kind: "validate"; qrValue: string }
  | { kind: "unknown"; raw: string };
```

Resolution order: `validate` → `tag` → `sticker` → `unknown`.

Two rules worth stating, because both are deliberate narrowings:

- **A slug carrying tag fields *and* `s` stays `kind: "tag"`.** The tag is the more specific answer; the sticker is only how it was printed. `sticker` is reached exactly when `stickerLineNumber` is the *only* populated field.
- **An undecodable string stays `unknown`.** The web page treats one as a bare sticker line number, because a wedge scanner reports the digits printed beside the QR. Mobile has no wedge — the camera reads the QR itself — so accepting arbitrary text as a line number would only turn typos into confusing 404s.

### One branch in `useQrScanLauncher`

```
kind === "sticker":
  isStaff → router.push("/sticker-tag",  { stickerLineNumber })
  else    → router.push("/tag-preview",  { stickerLineNumber })
```

`isStaff` is `isMerchant || isRefundPoint` from `useUserStore`, which is how the hook already splits the `validate` branch. A logged-out scan (RoleGate seam pill, `TravellerLoginScreen`) has no role and therefore takes the traveller path — correct, because the public endpoint needs no token.

## Traveller path — extend `TagPreviewScreen`

`TagPreviewScreen` already resolves a public tag by `tagId`, or by `tagNumber + travellerDocumentNumber`, and then branches draft→claim / issued→view / staff→assign. It gains a **third resolution source** and everything downstream is unchanged.

**New action** in `src/actions/TagService/actions.ts`, following the shape of its two siblings exactly — anonymous, direct client (no `fetchRequest`, because pre-login there is no token), `null` on failure:

```ts
export async function getPublicTagByStickerLineNumber(stickerLineNumber: string) {
  try {
    const client = await getTagServiceClient();
    return await client.tagPublic.getApiTagServicePublicTagByStickerLineNumber({
      stickerLineNumber,
    });
  } catch (error) {
    logger.error("getPublicTagByStickerLineNumber error:", error);
    return null;
  }
}
```

**Screen change:** `params.stickerLineNumber` joins the lookup effect as a third branch.

### Why the missing `id` does not matter here

`TagPublicDetailDto` carries `tagNumber` but **no `id`**. That is survivable on the traveller path because both traveller actions key on the tag number:

- Claim → `postTagTravellerSelfAssign({ tagNumber, salesAmount })`, whose `TagDto` response *does* carry `id` for the post-claim redirect.
- View → `/(auth)/tags/[tagId]` with `tagId: ""`, which `useTagDetail` tolerates: for `scope: "Traveller"` `getFullTagDetail` reads cross-tenant by `tagNumber`. The screen already passes `tagId ?? ""` for the same reason on the legacy tagNumber-only QR path.

It **would** matter for staff, whose assign and detail paths both need the GUID — which is why staff never reach this screen from a bare sticker scan. They arrive only via §"An already-used sticker" below, which supplies a real `tagId`.

### New empty state

A valid sticker with no tag yet currently renders "Tag not found. Please try scanning again." — wrong, since the sticker scanned fine and there is nothing to retry. It gets its own copy under a new key (see Localization).

## Staff path — `StickerTagScreen`

Registered as a **root** route `src/app/sticker-tag.tsx`, matching how `/tag-preview` and `/validate` are declared in `src/app/_layout.tsx`, so every scan surface can reach it without route-group juggling. The screen guards its own role: a non-staff user who somehow lands there is replaced to `/tag-preview` with the same parameter.

### State machine

```
                 line + merchant resolved          Create
    resolving ─────────────────────────────► ready ──────► submitting ──► redirect to the tag
        │                                      ▲                │
        │                                      └────────────────┘
        │                                       failure → toast
        │
        ├─ line carries a tag → replace to /tag-preview { tagId }
        ├─ line not found     → toast, router.back()
        └─ merchant-info failed ─────────────► error ──[Retry]──► resolving
```

A merchant pick from the picker re-enters `resolving` for the merchant-info re-read, then returns to `ready` with the new product groups and an emptied cart.

### Resolving the merchant

Mirrors the web's rules, plus one branch the web does not have.

1. `getStickerLineByNumber(n)` → `StickerLineInfoDto`.
2. **If `tagId` is set (or `isUsed`) → the sticker already carries a tag.** `router.replace("/tag-preview", { tagId })`. This is decision 6, and it is also what supplies staff with the GUID the public DTO lacks.
3. `isAllocated = Boolean(stickerLine.merchantId)` — derived from step 1, no extra round trip, exactly as the web does it.
4. `getStickerLineMerchantInfo({ stickerLineNumber, merchantId })` where `merchantId` is `isAllocated ? undefined : sessionMerchantId`.
   The parameter is omitted on an allocated line because the allocation cannot be changed and the backend documents the parameter as ignored there; sending it would only assert something we have already been told.

`sessionMerchantId` comes from `useMerchantId()`, which reads the `MerchantId` JWT claim (a string, or an array when the account is affiliated with several stores — first entry wins). It is `null` for a refund point, and that absence is the whole test, as on the web.

| Condition | UI | `merchantId` sent on create |
| --- | --- | --- |
| `isMerchantAllocated` | merchant name read-only + "already allocated" | **omitted** |
| merchant user, unallocated | own name read-only + allocation warning | session merchant id |
| refund point, unallocated | merchant search + allocation warning | the operator's pick |
| merchant-info returned nothing | error state + Retry; no create path | — |

Picking a merchant re-reads merchant-info with that id to preview its details and product groups, and **rebuilds the cart from scratch** — product groups belong to the merchant, so lines priced against the previous one are not transferable. The line stays unallocated until the tag is actually created.

A merchant who scans a sticker allocated to a *different* merchant sees that other merchant read-only and the create call is rejected server-side. No client-side check duplicates that, matching the web.

### The merchant picker

New `SearchMerchant` modal, built as a sibling of the existing [`SearchTraveller`](../../../src/screens/shared/_components/SearchTraveller/SearchTraveller.tsx) and following its props (`visible` / `onClose` / `onSelect` / `disabled`). Backed by `getMerchantsForTagCreation`, which sends the typed term as **both** `name` and `vatNumber` (the server unions them), with `sorting: "name"` and `maxResultCount: 20` — the same parameters the web's `searchMerchantsForTagCreation` uses. Results are `MerchantForTagCreationDto` (`id`, `name`, `vatNumber`), so the row shows the business name with the VAT number beneath to disambiguate similarly named merchants.

Shown only when the operator is a refund point on an unallocated line **and** holds `TagService.Tags.ViewMerchantsForCreation`. A merchant user is never offered it even when they hold the permission, because the answer is already known.

### The form

| Field | Behaviour |
| --- | --- |
| Merchant | read-only or picker, per the table above |
| Invoice number | **required** text input; Create disabled until non-empty |
| Traveller | optional, via the existing `SearchTraveller` modal |
| Product groups + amounts | product-group pills → calculator → cart, reusing the existing components |
| Traveller signature | optional, via the existing `SignatureSheet` |

There is **no merchant signature pad**: `CreateTagByStickerLineRequestDto` has `travellerSignatureBase64` but no merchant-signature field.

Amounts stay VAT-inclusive and are split by the existing `lineFromAmount`, which already implements `taxBase = amount / (1 + vatRate/100)`.

### Submitting

```ts
postTagByStickerLine({
  status: traveller ? "Issued" : "Draft",
  stickerLineNumber,
  ...(isMerchantAllocated ? {} : { merchantId }),
  ...(traveller ? { traveller } : {}),
  invoices: [{
    uuid,                       // generateUUID(), as in useCreateTag
    invoiceNumber,              // typed by the operator
    issueDate: new Date().toISOString(),
    totalAmount: totals.grandTotal,
    vatAmount:   totals.taxAmount,
    invoiceLines: items,
  }],
  travellerSignatureBase64,
});
```

`merchantId` is spread in only for an unallocated line — creating the tag is what allocates the whole sticker book to that merchant, permanently. That is why the allocation warning appears in both the picker branch and the merchant-user branch: it is equally true when the merchant is themselves.

On success: toast, `loadTags(true)` to keep Home's "latest tag" and the Tags tab in step, then `router.replace("/(auth)/tags/[tagId]")` with the created tag's id.

**Create is disabled until** not already submitting · `TagService.Tags.CreateByStickerLine` granted · a merchant is resolved · at least one cart line · an invoice number entered. The same five conditions the web enforces.

## Shared calculator move

The calculator pieces live under `src/screens/merchant/CreateTag/`. Refund-point staff now use them, so `screens/staff/…` importing from `screens/merchant/…` would misdescribe ownership. Pure move plus import rewrite, no behaviour change:

| From | To |
| --- | --- |
| `merchant/CreateTag/_components/{ProductGroupPills,AmountDisplay,Numpad,CartReviewSheet,CartSummaryBar,SignatureSheet,SignaturePads}.tsx` | `shared/_components/tag-calculator/` |
| `merchant/CreateTag/calculator/` (+ its tests) | `shared/_components/tag-calculator/calculator/` |
| `lineFromAmount`, `generateUUID` (from `useCreateTag.ts`) | `shared/_components/tag-calculator/line.ts` |
| `useMerchantId` (from `useMerchantContext.ts`) | `src/hooks/useMerchantId.ts` |

`generateUUID` is module-private in `useCreateTag.ts` today and becomes an export of `line.ts`, which `useCreateTag` then imports.

`SignaturePads` renders both the merchant and traveller pads. Rather than move it and add a "hide the merchant pad" flag for one caller, it gains a `targets: SignatureTarget[]` prop defaulting to both — `CreateTagScreen` keeps today's behaviour without changing its call, and the sticker screen passes `["traveller"]`. `SignatureSheet` itself is already per-target and needs no change.

`useMerchantId` is currently exported but consumed only inside its own file, so moving it touches one import. `CreateTagScreen` keeps `useMerchantContext`, `useCreateTag` and its own submit path unchanged — the sticker flow does **not** reuse `useCreateTag`, because it posts a different DTO and sources its merchant from the sticker line rather than CRM.

`SignaturePads` moves with the set but the sticker screen renders only the traveller pad.

## New files

```
src/app/sticker-tag.tsx                                     root route
src/screens/staff/StickerTag/
  StickerTagScreen.tsx                                      state machine + layout
  useStickerLine.ts                                         resolve line + merchant info + re-read on pick
  useStickerTag.ts                                          cart + submit
  _components/MerchantBlock.tsx                             the three merchant branches
  _components/SearchMerchant.tsx                            refund-point picker
src/screens/shared/_components/tag-calculator/              (moved, see above)
src/hooks/useMerchantId.ts                                  (moved)
```

## New actions

`src/actions/TagService/actions.ts` — all through `fetchRequest`, matching the existing convention, except the public read:

- `getStickerLineByNumber(stickerLineNumber)`
- `getStickerLineMerchantInfo({ stickerLineNumber, merchantId? })`
- `getMerchantsForTagCreation({ term })`
- `getPublicTagByStickerLineNumber(stickerLineNumber)` — **anonymous**, direct client, `null` on failure

`src/actions/TagService/post.ts`:

- `postTagByStickerLine(requestBody)`

## Errors and edge cases

| Case | Behaviour |
| --- | --- |
| Sticker line not found (404) | toast, `router.back()` |
| Sticker already carries a tag | replace to `/tag-preview` with its `tagId` |
| `merchant-info` fails or is forbidden | error state + Retry — never a card with no merchant, no product groups and no explanation |
| Merchant resolved but has no product groups | dedicated message + Retry; the calculator cannot price a line without a VAT rate |
| `CreateByStickerLine` not granted | Create disabled with an explanatory line |
| Create rejected (e.g. merchant mismatch on an allocated book) | surface the server message in a toast, stay on the form |
| Traveller scans a sticker with no tag yet | dedicated empty state, not "Tag not found" |
| Traveller scans an unknown sticker | the same empty state — the public endpoint cannot distinguish "no such sticker" from "no tag yet", and the traveller-facing answer is identical either way |

## Localization

New keys in the **source** `src/localization/resources/{en-US,tr-TR}.json` — not the generated `*.gen.json`, which `npm run init` rebuilds by merging server localization with these.

- `MobileApp.Qr.TagPreview.NoTagOnSticker`
- `MobileApp.Qr.StickerTag.*` — `Title`, `Merchant`, `MerchantAllocated`, `AllocationWarning`, `SelectMerchant`, `MerchantInfoUnavailable`, `MerchantVatNumber`, `MerchantAddress`, `InvoiceNumber`, `InvoiceNumberPlaceholder`, `NoProductGroups`, `Create`, `CreateDraft`, `Creating`, `CreateSuccess`, `CreateError`, `NoPermission`, `LineNotFound`, `Retry`

`MobileApp.Qr.ScanTagSubtitleStaff` already reads "…tax-free tag or sticker QR code", which becomes accurate rather than aspirational. The traveller subtitle (`ScanTagSubtitle`) says "tax-free tag or airport QR code" and widens to mention stickers.

## Testing

**`src/utils/qr/__tests__/classifyScan.test.ts`** — extend:

- sticker-only slug (`{s:…}`) → `{ kind: "sticker" }`
- slug with tag fields **and** `s` → `{ kind: "tag" }` (the narrowing that keeps tag QRs on the tag path)
- bare numeric string → `unknown` (pins the deliberate divergence from the web's wedge behaviour)

**New `useStickerTag` unit tests** for the create-body builder:

- allocated line → no `merchantId` in the body
- unallocated line → `merchantId` present
- traveller present → `status: "Issued"`; absent → `"Draft"`
- totals derived from lines match `grandTotal` / `taxAmount`

The calculator reducer keeps its existing tests, which the move must leave green.

**Verification:** `npx tsc --noEmit`, `npm run lint` on changed files, `npm test`. Note the four pre-existing `@testing-library/react-native` resolution failures in `src/components/__tests__/` recorded in the shared-QR spec — unrelated, and not to be counted as regressions.

Camera scanning of a real printed sticker cannot be verified here and must be checked on device.

## Out of scope

- Any change to `StaffLoginScreen` or to pre-login sticker intent (decision 1).
- `mobile/pos` — it prints stickers but has no scan-to-create flow.
- `unirefund-web` — its scan-sticker page already implements the staff half and is the reference, not a target.
- Assigning a sticker line to an *existing* tag (`POST /tag/{id}/assign-sticker-line/{n}`), which is a different operation from creating one.
- Re-pointing an allocation. It is first-use-wins at sticker-header level and irreversible by design.

## Risks

| Risk | Mitigation |
| --- | --- |
| A refund point permanently allocates a sticker book to the wrong merchant | Allocation warning on both unallocated branches, merchant name + VAT shown before Create, and Create is an explicit second action after picking |
| Staff land on `/tag-preview` without a `tagId` and get no action | Staff reach it only via the already-used branch, which passes the `tagId` from `StickerLineInfoDto` |
| The calculator move breaks the existing create-tag screen | Pure move + import rewrite; the existing calculator tests must stay green, and `tsc --noEmit` catches the rest |
| Roles lack the sticker permissions in a given tenant | Every call is permission-gated client-side and the UI degrades to an explained disabled state rather than a silent 403 |

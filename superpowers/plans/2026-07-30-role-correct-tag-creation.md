# Role-Correct Tag Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A merchant issuing a tag against a store sticker creates it through `POST /tag`, which their role can actually call; a Refund Point keeps `POST /tag/by-sticker-line`.

**Architecture:** Both apps currently use `by-sticker-line` for every role, but that endpoint is gated behind `TagService.Tags.CreateByStickerLine` and exists for a Refund Point issuing *on behalf of* a merchant it does not own. Merchants hold `Tags.Create`, and `CreateTagRequestDto` already carries `stickerLineNumber`, so their path is a single call. On mobile the split lands in a second pure builder beside the tested one; on web it lands in the existing role branch, alongside the merchant-info fix that has to accompany it.

**Tech Stack:** React Native + Expo (expo-router), Next.js (App Router), TypeScript, Jest, generated `TagService` / `CRMService` SDKs.

**Spec:** [2026-07-30-role-correct-tag-creation-design.md](../specs/2026-07-30-role-correct-tag-creation-design.md)
**Catalogue:** new #29; #15/#26 for the web half

## Global Constraints

- **Two repos.** Tasks 1–3 are in `C:\mobile\app` on branch `role/staff`. Tasks 4–5 are in `C:\Users\ertugrul.bakas.AYASOFYAZILIM\Repositories\unirefund-web` on branch `catch-backend`. Task 6 touches both. **Each task states its repo; never commit one repo's work from the other.**
- **Never regenerate an SDK.** No `npm run gen` (mobile), no codegen in web. Every endpoint already exists.
- **Merchant → `POST /tag`. Refund Point → `POST /tag/by-sticker-line`.** This is a permission boundary, not a preference.
- **`MerchantRequestDto` is `{ vatNumber: string; countryCode: string; externalIdentifier?: string | null }`.** There is no `merchantId` on it — the merchant identifies itself by VAT number.
- **The Refund Point path must not change behaviour** in either app, including the rule that `merchantId` is sent only for a not-yet-allocated line.
- **Mobile i18n**, if touched, goes only in `src/localization/resources/{en-US,tr-TR}.json`, never a `*.gen.json`, and needs `npm run init` before `tsc`. This plan adds no new keys.
- **Mobile verification:** `npx tsc --noEmit`, `npx eslint <paths>`, `npm test`. Four suites in `src/components/__tests__/` already fail to load on a pre-existing `@testing-library/react-native` resolution error — NOT a regression, never fix, never count. Baseline is **210 passing**.
- **Web verification:** `npx tsc --noEmit` and `npx eslint <changed files>` from the repo root. Do not attempt a full Next build.
- **Commit after every task**, using the message in that task's final step.

---

### Task 1: A second pure builder for the merchant path

**Repo:** `C:\mobile\app`

**Files:**
- Modify: `src/screens/staff/StickerTag/stickerTag.logic.ts`
- Test: `src/screens/staff/StickerTag/__tests__/stickerTag.logic.test.ts`

**Interfaces:**
- Consumes: `generateUUID` from `@/screens/shared/_components/tag-calculator/line` (already imported in this file); generated DTOs from `@/saas/TagService`.
- Produces, consumed by Task 3:
  - `interface BuildMerchantTagRequestArgs`
  - `buildMerchantTagRequest(args: BuildMerchantTagRequestArgs): UniRefund_TagService_Tags_CreateTagRequestDto`

Two builders rather than one branching builder: the two DTOs differ in which fields *exist*, not merely in values, and a single function returning a union would push the discrimination onto every caller. `buildStickerTagRequest` is untouched — the Refund Point path is not changing.

- [ ] **Step 1: Write the failing tests**

Append to `src/screens/staff/StickerTag/__tests__/stickerTag.logic.test.ts`. The file already imports from `../stickerTag.logic` and defines `PG` and a `line(amount, taxRate)` helper — extend the existing import rather than adding a second one, and reuse `line`.

```ts
describe("buildMerchantTagRequest", () => {
  const base = {
    stickerLineNumber: "SL-0007",
    invoiceNumber: "INV-2026-1183",
    issueDate: "2026-07-30T09:00:00.000Z",
    items: [line(120, 20)],
    merchant: {
      vatNumber: "1234567890",
      countryCode: "TR",
      externalIdentifier: "EXT-1",
    },
    traveller: undefined,
    merchantIndividualSignatureBase64: undefined,
    travellerSignatureBase64: undefined,
  };

  it("binds the sticker line on the create call", () => {
    expect(buildMerchantTagRequest(base).stickerLineNumber).toBe("SL-0007");
  });

  // The merchant identifies itself by VAT number here. Sending a merchant id
  // would be the other endpoint's shape, and the two must not bleed together.
  it("identifies the merchant by VAT number and carries no merchant id", () => {
    const body = buildMerchantTagRequest(base);
    expect(body.merchant).toEqual({
      vatNumber: "1234567890",
      countryCode: "TR",
      externalIdentifier: "EXT-1",
    });
    expect("merchantId" in body).toBe(false);
  });

  it("omits externalIdentifier when the merchant has none", () => {
    const body = buildMerchantTagRequest({
      ...base,
      merchant: { vatNumber: "1234567890", countryCode: "TR" },
    });
    expect("externalIdentifier" in body.merchant).toBe(false);
  });

  it("creates a Draft without a traveller and Issued with one", () => {
    expect(buildMerchantTagRequest(base).status).toBe("Draft");
    expect(
      buildMerchantTagRequest({
        ...base,
        traveller: {
          firstName: "Ada",
          lastName: "Lovelace",
          travellerDocumentNumber: "U12345678",
          nationalityCountryCode3: "TUR",
          residenceCountryCode3: "TUR",
        },
      }).status,
    ).toBe("Issued");
  });

  it("derives invoice totals from the lines", () => {
    const body = buildMerchantTagRequest({
      ...base,
      items: [line(120, 20), line(108, 8)],
    });
    const invoice = body.invoices[0];
    expect(invoice.totalAmount).toBeCloseTo(228, 6);
    expect(invoice.vatAmount).toBeCloseTo(28, 6);
    expect(invoice.invoiceNumber).toBe("INV-2026-1183");
    expect(invoice.invoiceLines).toHaveLength(2);
  });

  it("omits both signature keys when nothing was captured", () => {
    const body = buildMerchantTagRequest(base);
    expect("merchantIndividualSignatureBase64" in body).toBe(false);
    expect("travellerSignatureBase64" in body).toBe(false);
  });

  it("carries each signature independently when captured", () => {
    const body = buildMerchantTagRequest({
      ...base,
      merchantIndividualSignatureBase64: "m64",
    });
    expect(body.merchantIndividualSignatureBase64).toBe("m64");
    expect("travellerSignatureBase64" in body).toBe(false);
  });
});

// The two request shapes must stay distinct: each body carries the field that
// identifies its endpoint and not the other's.
describe("the two builders do not bleed into each other", () => {
  it("keeps merchant identity out of the by-sticker-line body", () => {
    const body = buildStickerTagRequest({
      stickerLineNumber: "SL-0007",
      invoiceNumber: "INV-1",
      issueDate: "2026-07-30T09:00:00.000Z",
      items: [line(120, 20)],
      isMerchantAllocated: false,
      merchantId: "m-1",
    });
    expect("merchant" in body).toBe(false);
    expect(body.merchantId).toBe("m-1");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest src/screens/staff/StickerTag
```

Expected: FAIL — `buildMerchantTagRequest is not a function` (or a TS/import error naming it). The final `buildStickerTagRequest` case should already pass.

- [ ] **Step 3: Implement the builder**

Add to `src/screens/staff/StickerTag/stickerTag.logic.ts`, below `buildStickerTagRequest`. Extend the existing `@/saas/TagService` type import with `UniRefund_TagService_Tags_CreateTagRequestDto` and `UniRefund_TagService_Merchants_MerchantRequestDto`.

```ts
export interface BuildMerchantTagRequestArgs {
  stickerLineNumber: string;
  invoiceNumber: string;
  /** ISO 8601. Passed in rather than read from the clock so this stays pure. */
  issueDate: string;
  items: UniRefund_TagService_Tags_InvoiceLineRequestDto[];
  /** Who the merchant says it is. No id — this endpoint keys on VAT number. */
  merchant: {
    vatNumber: string;
    countryCode: string;
    externalIdentifier?: string;
  };
  traveller?: UniRefund_TagService_Travellers_TravellerRequestDto;
  merchantIndividualSignatureBase64?: string;
  travellerSignatureBase64?: string;
}

/**
 * Builds the standard create-tag body for a **merchant** issuing against a
 * sticker.
 *
 * A merchant cannot use `by-sticker-line`: that endpoint is gated behind
 * `TagService.Tags.CreateByStickerLine` and exists for a Refund Point issuing on
 * behalf of a merchant it does not own. Merchants hold `Tags.Create` instead,
 * and `CreateTagRequestDto` carries `stickerLineNumber`, so the sticker still
 * binds in this one call rather than needing a separate assign.
 *
 * The merchant identifies *itself* here by VAT number — there is no merchant id
 * on this request. That is the whole difference between the two endpoints, so
 * the two bodies must never be built by the same code path.
 */
export function buildMerchantTagRequest(
  args: BuildMerchantTagRequestArgs,
): UniRefund_TagService_Tags_CreateTagRequestDto {
  const totalAmount = args.items.reduce((sum, l) => sum + (l.amount ?? 0), 0);
  const vatAmount = args.items.reduce((sum, l) => sum + (l.taxAmount ?? 0), 0);

  const merchant: UniRefund_TagService_Merchants_MerchantRequestDto = {
    vatNumber: args.merchant.vatNumber,
    countryCode: args.merchant.countryCode,
    ...(args.merchant.externalIdentifier
      ? { externalIdentifier: args.merchant.externalIdentifier }
      : {}),
  };

  return {
    // No traveller means nobody owns this tag yet — it goes out as a Draft for
    // the traveller to claim by scanning the same sticker.
    status: args.traveller ? "Issued" : "Draft",
    merchant,
    stickerLineNumber: args.stickerLineNumber,
    ...(args.traveller ? { traveller: args.traveller } : {}),
    invoices: [
      {
        uuid: generateUUID(),
        invoiceNumber: args.invoiceNumber,
        issueDate: args.issueDate,
        totalAmount,
        vatAmount,
        invoiceLines: args.items,
      },
    ],
    ...(args.merchantIndividualSignatureBase64
      ? {
          merchantIndividualSignatureBase64:
            args.merchantIndividualSignatureBase64,
        }
      : {}),
    ...(args.travellerSignatureBase64
      ? { travellerSignatureBase64: args.travellerSignatureBase64 }
      : {}),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest src/screens/staff/StickerTag
```

Expected: PASS, all cases.

- [ ] **Step 5: Typecheck, lint and commit**

```bash
npx tsc --noEmit
npx eslint src/screens/staff/StickerTag
git add src/screens/staff/StickerTag
git commit -m "feat(sticker): add the merchant create-tag request builder"
```

---

### Task 2: Surface the merchant's VAT identity from the resolver

**Repo:** `C:\mobile\app`

**Files:**
- Modify: `src/screens/staff/StickerTag/useStickerLine.ts`

**Interfaces:**
- Produces, consumed by Task 3: `useStickerLine(...)` gains a returned field
  ```ts
  merchantIdentity: { vatNumber: string; externalIdentifier?: string } | null
  ```
  It is non-null only on the merchant path (`own-merchant`), and `null` for every Refund Point outcome — a Refund Point never identifies a merchant by VAT number.

**Why this is needed.** The hook maps the merchant's CRM detail into a `MerchantInfoForTagCreationDto`-shaped object so both roles render through one `MerchantBlock`. That generated type has **no `externalIdentifier`**, so the value is fetched from CRM today and silently discarded. Returning it separately keeps the generated type honest about what the endpoint actually returns.

- [ ] **Step 1: Add the state**

In `src/screens/staff/StickerTag/useStickerLine.ts`, beside the existing `merchantId` state, add:

```ts
  // The merchant's own VAT identity, for the merchant create path only. Kept
  // apart from `merchant` because that value is shaped as the generated
  // `MerchantInfoForTagCreationDto`, which carries no `externalIdentifier` —
  // inventing a field on a generated type would misstate the contract.
  const [merchantIdentity, setMerchantIdentity] = useState<{
    vatNumber: string;
    externalIdentifier?: string;
  } | null>(null);
```

- [ ] **Step 2: Clear it on every non-merchant path**

Set `setMerchantIdentity(null)` alongside the existing `setMerchantId(null)` in **both** Refund Point branches — the `refund-point-unallocated` branch and the `refund-point-allocated` branch — and in `selectMerchant`, which is Refund-Point-only.

- [ ] **Step 3: Populate it on the merchant path**

In the `own-merchant` branch, the CRM detail is the better source and the sticker line is the fallback. Both `MerchantDto` and `StickerLineInfoDto` carry `vatNumber` and `externalIdentifier`.

In the `detailResult.status === "fulfilled"` arm, after `resolvedMerchant` is built:

```ts
      setMerchantIdentity({
        vatNumber: detail.vatNumber,
        ...(detail.externalIdentifier
          ? { externalIdentifier: detail.externalIdentifier }
          : {}),
      });
```

In the `else` arm — CRM detail failed — fall back to the sticker line, which names the merchant only when the book is already allocated:

```ts
      // The sticker line names its merchant only once the book is allocated, so
      // an unallocated line leaves no identity here at all. The screen turns
      // that into an unavailable Create rather than posting a merchant-less
      // request.
      setMerchantIdentity(
        isAllocated && line.vatNumber
          ? {
              vatNumber: line.vatNumber,
              ...(line.externalIdentifier
                ? { externalIdentifier: line.externalIdentifier }
                : {}),
            }
          : null,
      );
```

- [ ] **Step 4: Return it**

Add to the hook's returned object, beside `merchantId`:

```ts
    /**
     * The merchant's own VAT identity, for the merchant create path. `null` for
     * a Refund Point, who books against a merchant rather than being one.
     */
    merchantIdentity,
```

- [ ] **Step 5: Verify and commit**

```bash
npx tsc --noEmit
npx eslint src/screens/staff/StickerTag
npm test
```

Expected: `tsc` exit 0; no lint errors; 210 passing plus the four known load failures. No test changes — this task adds no logic, only carries a value that was being dropped.

```bash
git add src/screens/staff/StickerTag/useStickerLine.ts
git commit -m "feat(sticker): keep the merchant's VAT identity from the resolver"
```

---

### Task 3: Route the create call by role, and give merchants both signature pads

Ships the mobile half.

**Repo:** `C:\mobile\app`

**Files:**
- Modify: `src/screens/staff/StickerTag/useStickerTag.ts`
- Modify: `src/screens/staff/StickerTag/StickerTagScreen.tsx`

**Interfaces:**
- Consumes: `buildMerchantTagRequest` (Task 1); `merchantIdentity` (Task 2); `postTagServiceTagApi` from `@/actions/TagService/post`; `useCountrySettingsStore` from `@/store/country-settings`.
- Produces: `useStickerTag` takes two new args — `isMerchant: boolean` and `merchantIdentity: { vatNumber: string; externalIdentifier?: string } | null` — and its `canSubmit` additionally requires a resolvable merchant identity on the merchant path.

- [ ] **Step 1: Widen the hook's inputs and imports**

In `src/screens/staff/StickerTag/useStickerTag.ts`, extend the imports:

```ts
import {
  postTagByStickerLine,
  postTagServiceTagApi,
} from "@/actions/TagService/post";
import useCountrySettingsStore from "@/store/country-settings";
import {
  buildMerchantTagRequest,
  buildStickerTagRequest,
} from "./stickerTag.logic";
```

Widen the argument object and read the tenant country:

```ts
export function useStickerTag(args: {
  stickerLineNumber: string;
  isMerchantAllocated: boolean;
  merchantId?: string;
  /** A merchant books against itself and uses the standard create endpoint. */
  isMerchant: boolean;
  /** Present only on the merchant path; `null` for a Refund Point. */
  merchantIdentity: { vatNumber: string; externalIdentifier?: string } | null;
}) {
  const {
    stickerLineNumber,
    isMerchantAllocated,
    merchantId,
    isMerchant,
    merchantIdentity,
  } = args;
  const countryCode = useCountrySettingsStore(
    (state) => state.countrySettings?.countryCode2,
  );
```

Update the hook's doc comment: it currently says this hook posts `CreateTagByStickerLineRequestDto`. It now posts whichever of the two the caller's role can use, and that is the point of the hook rather than an incidental detail.

- [ ] **Step 2: Capture the merchant signature too**

Replace the `signatures` state comment — both pads are now reachable on the merchant path — and add the merchant signature to the base64 conversion inside `submit`:

```ts
      const [merchantSignatureBase64, travellerSignatureBase64] =
        await Promise.all([
          toBase64(signatures.merchant),
          toBase64(signatures.traveller),
        ]);
```

- [ ] **Step 3: Branch the submit**

Replace the single `postTagByStickerLine(buildStickerTagRequest({...}))` call with the role split:

```ts
      const tag = isMerchant
        ? await postTagServiceTagApi(
            buildMerchantTagRequest({
              stickerLineNumber,
              invoiceNumber: invoiceNumber.trim(),
              issueDate: new Date().toISOString(),
              items,
              // Guarded by `canSubmit`, which requires an identity on this path.
              merchant: {
                vatNumber: merchantIdentity?.vatNumber ?? "",
                // POS hardcodes "TR"; take the tenant's country instead, as the
                // merchant's own CreateTag screen does.
                countryCode: countryCode ?? "TR",
                ...(merchantIdentity?.externalIdentifier
                  ? { externalIdentifier: merchantIdentity.externalIdentifier }
                  : {}),
              },
              traveller: traveller ?? undefined,
              merchantIndividualSignatureBase64: merchantSignatureBase64,
              travellerSignatureBase64,
            }),
          )
        : await postTagByStickerLine(
            buildStickerTagRequest({
              stickerLineNumber,
              invoiceNumber: invoiceNumber.trim(),
              issueDate: new Date().toISOString(),
              items,
              isMerchantAllocated,
              merchantId,
              traveller: traveller ?? undefined,
              travellerSignatureBase64,
            }),
          );
```

Note the Refund Point body does **not** get the merchant signature: `CreateTagByStickerLineRequestDto` has no such field.

Add `isMerchant`, `merchantIdentity` and `countryCode` to `submit`'s dependency array.

- [ ] **Step 4: Gate Create on a resolvable identity**

A merchant with no VAT number cannot produce a valid request. Replace `canSubmit`:

```ts
    canSubmit:
      items.length > 0 &&
      invoiceNumber.trim().length > 0 &&
      !isSubmitting &&
      // A merchant identifies itself by VAT number; without one there is no
      // valid request to post, so Create stays unavailable rather than failing
      // at the server.
      (!isMerchant || Boolean(merchantIdentity?.vatNumber)),
```

- [ ] **Step 5: Wire the screen**

In `src/screens/staff/StickerTag/StickerTagScreen.tsx`, pass the two new arguments where `useStickerTag` is called — `isMerchant` is already in scope from `useUserStore`, and `merchantIdentity` now comes off `line`:

```tsx
  const sale = useStickerTag({
    stickerLineNumber,
    isMerchantAllocated: line.isMerchantAllocated,
    merchantId: line.merchantId ?? undefined,
    isMerchant,
    merchantIdentity: line.merchantIdentity,
  });
```

(Keep whatever the existing call already passes for the first three; only add the last two.)

Then give merchants both pads — find the `<SignaturePads …>` element and replace its `targets` prop:

```tsx
              {/*
                A merchant posts `CreateTagRequestDto`, which carries a merchant
                signature field; a Refund Point's DTO does not, so capturing one
                there would produce something unsendable.
              */}
              <SignaturePads
                signatures={sale.signatures}
                onSign={(target) => {
                  setSignatureTarget(target);
                  signatureSheetRef.current?.present();
                }}
                targets={isMerchant ? ["merchant", "traveller"] : ["traveller"]}
              />
```

- [ ] **Step 6: Verify**

```bash
npx tsc --noEmit
npx eslint src/screens/staff/StickerTag
npm test
```

Expected: `tsc` exit 0; no lint errors; 210 passing plus the four known load failures.

- [ ] **Step 7: Commit**

```bash
git add src/screens/staff/StickerTag
git commit -m "feat(sticker): create through the endpoint the caller's role can use"
```

---

### Task 4: Web — merchants resolve without `ViewMerchantInfo`

**Repo:** `C:\Users\ertugrul.bakas.AYASOFYAZILIM\Repositories\unirefund-web`, branch `catch-backend`

**Files:**
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/scan-sticker/page.tsx`

**Interfaces:**
- Consumes: `getMerchantByIdApi` and `getMerchantProductGroupByIdApi` from `@repo/actions/unirefund/CRMService/actions`; the existing `getStickerLineByNumberApi` and `getStickerLineMerchantInfoApi`.
- Produces, consumed by Task 5: `ScannedData` gains `merchantIdentity: { vatNumber: string; externalIdentifier?: string } | null`.

**Why.** `getStickerLineMerchantInfoApi` is gated behind `TagService.StickerHeaders.ViewMerchantInfo`. On mobile the merchant role does not hold it and the call returns 403; this page makes the same call for every role. Whether web merchants hold it is unconfirmed, but the page should not depend on a permission written for the other role — and if they do not, the merchant path is broken *before* it reaches the create call Task 5 fixes.

- [ ] **Step 1: Add the CRM imports and widen the scan state**

At the top of the file, add:

```tsx
import {
  getMerchantByIdApi,
  getMerchantProductGroupByIdApi,
} from "@repo/actions/unirefund/CRMService/actions";
```

Extend the `ScannedData` type with the field Task 5 needs:

```tsx
  /**
   * The merchant's own VAT identity, for the merchant create path. `null` for a
   * Refund Point, who books against a merchant rather than being one.
   */
  merchantIdentity: { vatNumber: string; externalIdentifier?: string } | null;
```

- [ ] **Step 2: Add a merchant-side resolver**

Beside the existing `lookupMerchantInfo`, add:

```tsx
/**
 * Resolves the merchant's own details without `TagService.StickerHeaders.ViewMerchantInfo`.
 *
 * That permission belongs to a Refund Point previewing a merchant it does not
 * own. A merchant holds neither it nor any need for it: the sticker line already
 * names the merchant once the book is allocated, and everything else comes from
 * the same CRM endpoints the rest of the merchant's own screens already call.
 *
 * `Promise.allSettled` because the two failures are not equal — product groups
 * carry the VAT rate every amount is priced against, so losing them is fatal,
 * while losing the detail costs only display fields the sticker line can supply.
 */
async function lookupOwnMerchant(
  merchantId: string,
  stickerLine: UniRefund_TagService_Stickers_StickerLineInfoDto
) {
  const [groups, detail] = await Promise.allSettled([
    getMerchantProductGroupByIdApi(merchantId),
    getMerchantByIdApi(merchantId),
  ]);

  if (groups.status === "rejected") return null;
  const productGroups = groups.value.data ?? [];
  const isAllocated = Boolean(stickerLine.merchantId);

  if (detail.status === "fulfilled") {
    const merchant = detail.value.data;
    return {
      merchant: {
        id: merchant.id ?? merchantId,
        name: merchant.name,
        vatNumber: merchant.vatNumber,
        address: null,
        productGroups,
      },
      merchantIdentity: {
        vatNumber: merchant.vatNumber,
        ...(merchant.externalIdentifier
          ? { externalIdentifier: merchant.externalIdentifier }
          : {}),
      },
      productGroups,
    };
  }

  // Detail failed. An allocated line still names its merchant; an unallocated
  // one does not, which leaves no VAT number and therefore no valid create.
  return {
    merchant: {
      id: merchantId,
      name: (isAllocated ? stickerLine.merchantName : undefined) ?? "",
      vatNumber: (isAllocated ? stickerLine.vatNumber : undefined) ?? "",
      address: null,
      productGroups,
    },
    merchantIdentity:
      isAllocated && stickerLine.vatNumber
        ? {
            vatNumber: stickerLine.vatNumber,
            ...(stickerLine.externalIdentifier
              ? { externalIdentifier: stickerLine.externalIdentifier }
              : {}),
          }
        : null,
    productGroups,
  };
}
```

- [ ] **Step 3: Branch the scan by role**

In `handleScan`, replace the single `lookupMerchantInfo` call and the `setScannedData` that follows it with a role split. A merchant is identified by holding a session merchant id — `isMerchantUser` is already computed in this component.

```tsx
      if (isMerchantUser && sessionMerchantId) {
        const own = await lookupOwnMerchant(sessionMerchantId, stickerLine);
        if (!own) {
          toast.error(t.TagService["AssignSticker.MerchantInfoUnavailable"]);
        }
        setScannedData({
          stickerLine,
          isMerchantAllocated: isAllocated,
          merchant: own?.merchant ?? null,
          merchantIdentity: own?.merchantIdentity ?? null,
          productGroups: own?.productGroups ?? [],
        });
        setInvoice(buildInitialInvoice(own?.productGroups ?? []));
        setPageStatus("scanned");
        return;
      }

      // Refund Point: the merchant-info endpoint is theirs, and previewing a
      // merchant they do not own is exactly what it is for.
      const info = await lookupMerchantInfo(
        stickerLine.stickerLineNumber,
        undefined
      );
      if (!info) {
        toast.error(t.TagService["AssignSticker.MerchantInfoUnavailable"]);
      }
      const productGroups = info?.merchant?.productGroups ?? [];
      setScannedData({
        stickerLine,
        isMerchantAllocated: info?.isMerchantAllocated ?? false,
        merchant: info?.merchant ?? null,
        merchantIdentity: null,
        productGroups,
      });
      setInvoice(buildInitialInvoice(productGroups));
      setPageStatus("scanned");
```

Note the Refund Point call now passes `undefined` for the merchant id rather than the session's. A Refund Point has no merchant of its own, so the old `isAllocated ? undefined : sessionMerchantId` argument could only ever have sent a stray claim — the same defect already fixed on mobile.

- [ ] **Step 4: Carry the new field through the merchant picker**

`handleMerchantSelect` is Refund-Point-only. Add `merchantIdentity: null` to the object it passes to `setScannedData`, so the field is never stale from a previous scan.

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit
npx eslint "apps/web/src/app/[lang]/(main)/(unirefund)/operations/scan-sticker/page.tsx"
```

Expected: exit 0, no errors. If `UniRefund_TagService_Stickers_StickerLineInfoDto` is not already imported in this file, add it to the existing `@repo/saas/TagService` type import.

**Verify the response shape rather than assuming it.** The two CRM actions wrap their result in `structuredSuccessResponse(...)`, and this plan reads `groups.value.data` / `detail.value.data` on the strength of the sibling `getStickerLineMerchantInfoApi` call in this same file already doing `response.data`. If `tsc` says otherwise, follow the type — do not cast to make the written code compile. Report what the actual shape was.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/[lang]/(main)/(unirefund)/operations/scan-sticker/page.tsx"
git commit -m "fix(scan-sticker): resolve a merchant's own details without ViewMerchantInfo"
```

---

### Task 5: Web — create through the role-correct endpoint

Ships the web half.

**Repo:** `C:\Users\ertugrul.bakas.AYASOFYAZILIM\Repositories\unirefund-web`, branch `catch-backend`

**Files:**
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/scan-sticker/page.tsx`

**Interfaces:**
- Consumes: `merchantIdentity` on `ScannedData` (Task 4); `postTagApi` from `@repo/actions/unirefund/TagService/post-actions`; `useTenant` from `@/src/providers/tenant`.

- [ ] **Step 1: Add the imports**

```tsx
import {
  postTagApi,
  postTagByStickerLineApi,
} from "@repo/actions/unirefund/TagService/post-actions";
import { useTenant } from "@/src/providers/tenant";
```

Read the tenant country inside the component, beside the existing hooks:

```tsx
  const { countryCode2 } = useTenant();
```

- [ ] **Step 2: Branch the create call**

In `handleIssueTag`, replace the body of the `startTransition` callback:

```tsx
    startTransition(async () => {
      // A merchant cannot call `by-sticker-line`: it is gated behind
      // `TagService.Tags.CreateByStickerLine` and exists for a Refund Point
      // issuing on behalf of a merchant it does not own. Merchants hold
      // `Tags.Create`, and `CreateTagRequestDto` carries `stickerLineNumber`, so
      // the sticker still binds in this one call.
      const response = isMerchantUser
        ? await postTagApi({
            requestBody: {
              status: "Draft",
              merchant: {
                vatNumber: scannedData.merchantIdentity?.vatNumber ?? "",
                countryCode: countryCode2 || "TR",
                ...(scannedData.merchantIdentity?.externalIdentifier
                  ? {
                      externalIdentifier:
                        scannedData.merchantIdentity.externalIdentifier,
                    }
                  : {}),
              },
              stickerLineNumber: stickerLine.stickerLineNumber,
              invoices: [invoice],
            },
          })
        : await postTagByStickerLineApi({
            requestBody: {
              status: "Draft",
              stickerLineNumber: stickerLine.stickerLineNumber,
              // The merchant comes from the sticker line. It is only sent for a
              // line that is not allocated yet, which this call then allocates.
              ...(isMerchantAllocated ? {} : { merchantId }),
              invoices: [invoice],
            },
          });

      handlePostResponse(response, router, {
        prefix: getBaseLink("operations/tax-free-tags"),
        identifier: "id",
      });
    });
```

- [ ] **Step 3: Gate the button on a resolvable identity**

A merchant with no VAT number cannot produce a valid request. In the `disabled` expression on the issue-tag button, add one more condition alongside the existing ones:

```tsx
                  (isMerchantUser && !scannedData.merchantIdentity?.vatNumber)
```

so the button stays disabled rather than posting a merchant-less body.

Also update the early guard at the top of `handleIssueTag`: it currently returns when `!isMerchantAllocated && !merchantId`. That check is for the Refund Point path only, so scope it:

```tsx
    if (!isMerchantUser && !isMerchantAllocated && !merchantId) {
      toast.error(t.TagService["AssignSticker.MerchantRequired"]);
      return;
    }
```

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
npx eslint "apps/web/src/app/[lang]/(main)/(unirefund)/operations/scan-sticker/page.tsx"
```

Expected: exit 0, no errors.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/[lang]/(main)/(unirefund)/operations/scan-sticker/page.tsx"
git commit -m "fix(scan-sticker): create through the endpoint the caller's role can use"
```

---

### Task 6: Record the delivered state

**Repos:** both. `QR.md` exists at the root of each and its catalogue section is kept **byte-identical** across the two.

**Files:**
- Modify: `C:\mobile\app\QR.md`
- Modify: `C:\Users\ertugrul.bakas.AYASOFYAZILIM\Repositories\unirefund-web\QR.md`
- Modify: `C:\mobile\app\QR_FEATURE_CHECKLIST.md`

- [ ] **Step 1: Add #29 and flip #15**

In `C:\mobile\app\QR.md`, in section B change row 15's `apps/web` column from `❌` to `✅`. Then add a new row at the end of section C:

```markdown
| 29  | Sticker tag creation uses the role-correct create endpoint     | ✅         | ✅                                     |
```

followed by:

```markdown
**#29** is a permission boundary, not a preference. `POST /tag/by-sticker-line` is gated behind `TagService.Tags.CreateByStickerLine` and exists for a Refund Point issuing on behalf of a merchant it does not own; merchants hold `TagService.Tags.Create` and send `CreateTagRequestDto`, which carries `stickerLineNumber` so the sticker still binds in one call. Both apps previously used the Refund Point endpoint for every role.
```

In the **Do** table, remove the `15` row (it is now delivered) and add a line beneath the table:

```markdown
**Delivered 2026-07-30:** #29 in both apps, and #15 (alias #26) on web — the merchant-info fix shipped with the endpoint split, since fixing which endpoint creates a tag does not help a merchant who cannot get past the lookup. Design: `docs/superpowers/specs/2026-07-30-role-correct-tag-creation-design.md` in `mobile/app`.
```

- [ ] **Step 2: Mirror the catalogue**

Run from `C:\mobile\app`:

```bash
python - <<'PY'
import io
src = io.open('QR.md', encoding='utf-8').read()
marker = "\n---\n\n# QR capability catalogue"
appendix = src[src.index(marker):]
dst_path = r'C:\Users\ertugrul.bakas.AYASOFYAZILIM\Repositories\unirefund-web\QR.md'
dst = io.open(dst_path, encoding='utf-8').read()
io.open(dst_path, 'w', encoding='utf-8', newline='').write(dst[:dst.index(marker)] + appendix)
print("mirrored")
PY
```

Confirm they match:

```bash
diff <(sed -n '/^---$/,$p' QR.md) <(sed -n '/^---$/,$p' /c/Users/ertugrul.bakas.AYASOFYAZILIM/Repositories/unirefund-web/QR.md) && echo IDENTICAL
```

**Both `QR.md` files are untracked in their repos. Do not `git add` either one.**

- [ ] **Step 3: Append to the mobile checklist**

Append to `C:\mobile\app\QR_FEATURE_CHECKLIST.md`:

```markdown
## Phase 7 — Role-correct tag creation (2026-07-30)
Design: `docs/superpowers/specs/2026-07-30-role-correct-tag-creation-design.md`
Plan: `docs/superpowers/plans/2026-07-30-role-correct-tag-creation.md`
Catalogue: #29, and #15 on web

- [x] Merchants create through `POST /tag` (`postTagServiceTagApi`), which their `Tags.Create` grant covers; Refund Points keep `POST /tag/by-sticker-line`, which needs `Tags.CreateByStickerLine`.
- [x] The sticker still binds in one call — `CreateTagRequestDto.stickerLineNumber` — rather than needing a separate assign.
- [x] `buildMerchantTagRequest` added beside `buildStickerTagRequest`, both pure and tested, with a test asserting neither body carries the other's discriminating field.
- [x] `useStickerLine` returns `merchantIdentity`; `externalIdentifier` was previously fetched from CRM and silently dropped, because the generated DTO it mapped into has no such field.
- [x] Merchants capture both signatures on mobile; Refund Points keep the traveller pad only, their DTO having nowhere to put a merchant signature.
- [x] Web merchants no longer call `getStickerLineMerchantInfoApi` (#15/#26) — identity from the sticker line or CRM, product groups from CRM. Refund Points keep it.
- [ ] Native and browser verification: create a tag from a sticker as a merchant and as a refund point, on an allocated and an unallocated book, in both apps.
```

- [ ] **Step 4: Final verification, mobile**

From `C:\mobile\app`:

```bash
npx tsc --noEmit
npm run lint
npm test
```

Expected: `tsc` exit 0; lint clean or only pre-existing warnings in untouched files; 210 passing plus the four known load failures.

- [ ] **Step 5: Commit the checklist**

From `C:\mobile\app`:

```bash
git add QR_FEATURE_CHECKLIST.md
git commit -m "docs(qr): record role-correct tag creation"
```

Nothing to commit in `unirefund-web` for this task — its only change is the untracked `QR.md`.

---

## Not verifiable in this environment

- **That a merchant's `Tags.Create` grant covers a create carrying a `stickerLineNumber`.** The human partner has confirmed such a call allocates an unallocated book, which is the behaviour this plan depends on; the permission itself still needs a real merchant login.
- **Whether web merchants hold `ViewMerchantInfo`.** Task 4 removes the dependency either way, so the answer changes nothing about the code — but it decides whether that page was broken before today.
- **Browser and device behaviour** generally: the web page has no test suite in play, and the mobile screen cannot be rendered in tests.

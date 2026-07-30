# Sticker QR Scan Flows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a scanned sticker QR resolve — logged-in staff create a tax-free tag against the sticker line, everyone else sees the public tag issued on it.

**Architecture:** `classifyScan` gains a fourth kind (`sticker`), and `useQrScanLauncher` routes it by role. Travellers reuse the existing `TagPreviewScreen` with a third resolution source (an anonymous public read by sticker line number). Staff get a new root-route `StickerTagScreen` that resolves the merchant from the sticker line, then prices the tag with the existing calculator components — which move to a shared location because refund-point staff now use them too. All decision logic lives in pure functions so it can be unit-tested without `@testing-library/react-native`.

**Tech Stack:** React Native + Expo (expo-router), TypeScript, zustand, NativeWind, Jest, `@unirefund/qr`, generated `TagService` SDK.

**Spec:** [2026-07-29-sticker-qr-scan-flows-design.md](../specs/2026-07-29-sticker-qr-scan-flows-design.md)

## Global Constraints

- **Working directory is `C:\mobile\app`.** Every path below is relative to it. Current branch: `role/staff`.
- **No SDK regeneration.** Every endpoint already exists in `src/saas/TagService`. Never run `npm run gen`.
- **i18n edits go in the source files** `src/localization/resources/en-US.json` and `src/localization/resources/tr-TR.json` — never the generated `*.gen.json`, which `npm run init` rebuilds by merging server localization with these. Both languages must be updated in the same commit.
- **Resource files are rooted without the `MobileApp.` prefix.** `t("MobileApp.Qr.ScanButton")` reads `Qr.ScanButton` from the JSON.
- **Component tests are off-limits.** Four suites in `src/components/__tests__/` already fail to load on a pre-existing `@testing-library/react-native` resolution error. Do not add tests that import it, and do not count those four failures as regressions.
- **Verification commands:** `npx tsc --noEmit`, `npm run lint`, `npm test`.
- **Never send `merchantId` for an allocated sticker line.** The allocation cannot be changed and the backend documents the parameter as ignored there.
- **`status` is `"Draft"` without a traveller and `"Issued"` with one.** The type is `UniRefund_TagService_Tags_TagCreationStatus = 'Draft' | 'Issued'`.
- **Commit after every task**, using the message given in that task's final step.

---

### Task 1: `classifyScan` recognises a sticker-only QR

**Files:**
- Modify: `src/utils/qr/classifyScan.ts`
- Test: `src/utils/qr/__tests__/classifyScan.test.ts`

**Interfaces:**
- Consumes: `decodeTagScan`, `extractValidateQrValue`, `TagSlugData` from `@unirefund/qr` (already imported).
- Produces: `ScanClassification` gains the member `{ kind: "sticker"; stickerLineNumber: string }`. Task 3 and Task 8 branch on it.

Note the existing test at line 57 (`carries the sticker line number through when present`) already asserts that a QR with **both** a tag number and `s` classifies as `tag`. That test must keep passing — it is the guard rail for the narrowing added here.

- [ ] **Step 1: Write the failing tests**

Add these three cases inside the existing `describe("classifyScan", ...)` block in `src/utils/qr/__tests__/classifyScan.test.ts`, immediately after the `carries the sticker line number through when present` test:

```ts
  it("recognises a sticker-only QR", () => {
    const result = classifyScan(
      buildTagUrl(SSR, { tagNumber: "", stickerLineNumber: "SL-0007" }),
    );
    expect(result.kind).toBe("sticker");
    if (result.kind !== "sticker") return;
    expect(result.stickerLineNumber).toBe("SL-0007");
  });

  it("recognises a bare sticker-only slug with no URL around it", () => {
    const result = classifyScan(
      encodeTagSlug({ tagNumber: "", stickerLineNumber: "SL-0007" }),
    );
    expect(result.kind).toBe("sticker");
  });

  // The camera reads the QR itself — there is no wedge scanner reporting the
  // digits printed beside it, so treating arbitrary text as a line number would
  // only turn typos into confusing 404s. The web page does the opposite, on
  // purpose; this pins the divergence.
  it("does not treat a bare number as a sticker line number", () => {
    expect(classifyScan("0000123456").kind).toBe("unknown");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest src/utils/qr/__tests__/classifyScan.test.ts
```

Expected: the two `sticker` tests FAIL with `expect(received).toBe("sticker") // Received: "unknown"`. The bare-number test already passes — that is fine, it is a regression pin.

- [ ] **Step 3: Add the `sticker` member to the union**

In `src/utils/qr/classifyScan.ts`, replace the `ScanClassification` type:

```ts
export type ScanClassification =
  | { kind: "tag"; data: TagSlugData }
  | { kind: "sticker"; stickerLineNumber: string }
  | { kind: "validate"; qrValue: string }
  | { kind: "unknown"; raw: string };
```

- [ ] **Step 4: Add the sticker branch**

In the same file, replace the tag branch and the trailing return with:

```ts
  // Tag QR: a `/tag/<slug>` URL or a bare slug.
  const data = decodeTagScan(trimmed);
  if (data.tagId || data.tagNumber) return { kind: "tag", data };

  // Sticker QR: the same slug carrying only `s`. Checked *after* the tag branch
  // so a code that identifies a tag stays on the tag path — the sticker is only
  // how that tag was printed, and the tag is the more specific answer.
  if (data.stickerLineNumber) {
    return { kind: "sticker", stickerLineNumber: data.stickerLineNumber };
  }

  return { kind: "unknown", raw: trimmed };
```

Also update the file's header comment, adding a line under the existing `- validate` entry:

```
//   - sticker  → a store sticker QR (staff issue a tag against it; travellers
//                see the tag already issued on it, if any)
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx jest src/utils/qr/__tests__/classifyScan.test.ts
```

Expected: PASS, all cases in the file.

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit
```

Expected: exit 0. If `useQrScanLauncher.tsx` errors on a non-exhaustive switch it means someone added exhaustiveness checking — leave the launcher for Task 3 and note it.

- [ ] **Step 7: Commit**

```bash
git add src/utils/qr/classifyScan.ts src/utils/qr/__tests__/classifyScan.test.ts
git commit -m "feat(qr): classify a sticker-only QR as kind sticker"
```

---

### Task 2: TagService actions for the sticker endpoints

**Files:**
- Modify: `src/actions/TagService/actions.ts`
- Modify: `src/actions/TagService/post.ts`

**Interfaces:**
- Consumes: `fetchRequest` from `@/utils/customFetch`, `getTagServiceClient` from `../lib`, `logger` from `@/utils/logger`.
- Produces:
  - `getStickerLineByNumber(stickerLineNumber: string): Promise<UniRefund_TagService_Stickers_StickerLineInfoDto>` — throws on failure
  - `getStickerLineMerchantInfo(args: { stickerLineNumber: string; merchantId?: string }): Promise<UniRefund_TagService_Stickers_StickerLineMerchantInfoDto | null>` — `null` on failure
  - `getMerchantsForTagCreation(term: string): Promise<UniRefund_CRMService_Merchants_MerchantForTagCreationDto[]>`
  - `getPublicTagByStickerLineNumber(stickerLineNumber: string): Promise<UniRefund_TagService_Tags_TagPublicDetailDto | null>`
  - `postTagByStickerLine(requestBody: UniRefund_TagService_Tags_CreateTagByStickerLineRequestDto): Promise<UniRefund_TagService_Tags_TagDto>`

These are thin passthroughs over a strictly typed generated SDK. Their correctness is a **type** question, not a behavioural one, and the codebase has no tests for any of the twelve existing siblings in these files — a jest test here would assert nothing but a mock. `npx tsc --noEmit` is the verification step, and the behaviour they feed is tested through the pure logic in Task 5.

- [ ] **Step 1: Add the four read actions**

Append to `src/actions/TagService/actions.ts`:

```ts
/**
 * Sticker line lookup by the number printed on the physical sticker. Carries
 * `merchantId` (set once the sticker book is allocated) and `tagId`/`isUsed`
 * (set once a tag has been created against this line).
 *
 * Throws on failure, like its `fetchRequest` siblings — the caller distinguishes
 * a 404 ("no such sticker") from a transient failure.
 */
export async function getStickerLineByNumber(stickerLineNumber: string) {
  return await fetchRequest(async (customHeaders) => {
    const client = await getTagServiceClient(customHeaders);
    return await client.stickerHeader.getApiTagServiceStickerHeaderStickerLineByStickerLineNumber(
      { stickerLineNumber },
    );
  }, "getStickerLineByNumber");
}

/**
 * Whether the sticker book is already allocated to a merchant, plus that
 * merchant's display details and active product groups.
 *
 * `merchantId` previews a choice on a still-unallocated line — either the
 * operator's pick or, for a merchant scanning their own sticker, themselves.
 * Callers must omit it for an allocated line: the allocation cannot be changed
 * and the backend ignores the parameter there.
 *
 * Returns `null` rather than throwing, because a missing
 * `TagService.StickerHeaders.ViewMerchantInfo` permission and a transient
 * failure lead to the same UI: an error state with a Retry.
 */
export async function getStickerLineMerchantInfo(args: {
  stickerLineNumber: string;
  merchantId?: string;
}) {
  try {
    return await fetchRequest(async (customHeaders) => {
      const client = await getTagServiceClient(customHeaders);
      return await client.stickerHeader.getApiTagServiceStickerHeaderStickerLineByStickerLineNumberMerchantInfo(
        {
          stickerLineNumber: args.stickerLineNumber,
          ...(args.merchantId ? { merchantId: args.merchantId } : {}),
        },
      );
    }, "getStickerLineMerchantInfo");
  } catch (error) {
    logger.error("getStickerLineMerchantInfo error:", error);
    return null;
  }
}

/**
 * Type-ahead merchant search for a Refund Point issuing a tag on behalf of a
 * merchant. The term is sent as both `name` and `vatNumber` — the server unions
 * them — so one box disambiguates similarly named merchants by VAT number.
 */
export async function getMerchantsForTagCreation(term: string) {
  const response = await fetchRequest(async (customHeaders) => {
    const client = await getTagServiceClient(customHeaders);
    return await client.tag.getApiTagServiceTagMerchantsForCreation({
      name: term,
      vatNumber: term,
      sorting: "name",
      maxResultCount: 20,
    });
  }, "getMerchantsForTagCreation");
  return response.items ?? [];
}

/**
 * Public (anonymous) read of the tag issued on a sticker line. Like its two
 * siblings above it deliberately skips `fetchRequest`: pre-login there is no
 * token and this endpoint needs none, so the client is called directly (its
 * `TOKEN` resolves to `undefined` → no auth header).
 *
 * `null` covers both "no such sticker" and "no tag issued on it yet" — the
 * endpoint does not distinguish them, and neither does the traveller-facing
 * answer.
 */
export async function getPublicTagByStickerLineNumber(
  stickerLineNumber: string,
) {
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

- [ ] **Step 2: Add the create action**

Append to `src/actions/TagService/post.ts`, and add `UniRefund_TagService_Tags_CreateTagByStickerLineRequestDto` to the existing `@/saas/TagService` import at the top of that file:

```ts
/**
 * Creates a tag from a sticker line number. The merchant comes from the sticker
 * line's allocation, so `merchantId` is sent only for a line that is not
 * allocated yet — and creating the tag then allocates the whole sticker book to
 * that merchant, permanently.
 *
 * Throws on failure — `fetchRequest` surfaces `ApiError` rather than wrapping it
 * in a result object, so the caller can read `.status` and the server message.
 */
export async function postTagByStickerLine(
  requestBody: UniRefund_TagService_Tags_CreateTagByStickerLineRequestDto,
) {
  return await fetchRequest(async (customHeaders) => {
    const client = await getTagServiceClient(customHeaders);
    return await client.tag.postApiTagServiceTagByStickerLine({ requestBody });
  }, "postTagByStickerLine");
}
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: exit 0. Any error here means a client group or parameter name was mistyped — the groups are `client.stickerHeader`, `client.tag` and `client.tagPublic`.

- [ ] **Step 4: Lint the changed files**

```bash
npx eslint src/actions/TagService/actions.ts src/actions/TagService/post.ts
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/actions/TagService/actions.ts src/actions/TagService/post.ts
git commit -m "feat(actions): add sticker-line read and create-tag actions"
```

---

### Task 3: Travellers see the tag on a scanned sticker

Ships a complete, usable feature on its own: a traveller (or anyone logged out) scans a sticker and sees, claims, or is told no tag exists yet.

**Files:**
- Modify: `src/hooks/useQrScanLauncher.tsx`
- Modify: `src/screens/shared/TagPreviewScreen.tsx`
- Modify: `src/localization/resources/en-US.json`
- Modify: `src/localization/resources/tr-TR.json`

**Interfaces:**
- Consumes: `ScanClassification` (Task 1), `getPublicTagByStickerLineNumber` (Task 2).
- Produces: the `/tag-preview` route accepts a `stickerLineNumber` param. Task 8 adds the staff half of the same launcher branch.

- [ ] **Step 1: Add the i18n key to both languages**

In `src/localization/resources/en-US.json`, inside `Qr.TagPreview`, after `"NotFound"`:

```json
    "NoTagOnSticker": "No tax-free tag has been issued on this sticker yet. Ask the store to complete your purchase.",
```

In `src/localization/resources/tr-TR.json`, in the same place:

```json
    "NoTagOnSticker": "Bu etikete henüz bir vergi iadesi etiketi tanımlanmamış. Lütfen mağazadan satışı tamamlamasını isteyin.",
```

- [ ] **Step 2: Route a sticker scan for non-staff**

In `src/hooks/useQrScanLauncher.tsx`, insert this branch inside `onScanned`, after the `result.kind === "tag"` block and before the `result.kind === "validate"` block:

```tsx
      if (result.kind === "sticker") {
        // Staff issue a tag against the sticker; everyone else — travellers, and
        // anyone scanning before login, who has no role at all — reads the tag
        // already issued on it. The public read needs no token, so the logged-out
        // case works unchanged.
        router.push({
          pathname: "/tag-preview",
          params: { stickerLineNumber: result.stickerLineNumber },
        });
        return;
      }
```

Task 8 replaces the body of this block with the role split. Leaving the staff case on the traveller path for now is deliberate: a staff member scanning a sticker sees its tag, which is strictly better than today's "unrecognized code" toast, and nothing half-built ships.

- [ ] **Step 3: Resolve the public tag by sticker line number**

In `src/screens/shared/TagPreviewScreen.tsx`:

Add the action to the existing `@/actions/TagService/actions` import:

```tsx
import {
  getPublicTag,
  getPublicTagByStickerLineNumber,
  getPublicTagByTagId,
  postTagTravellerSelfAssign,
} from "@/actions/TagService/actions";
```

Extend the params type and add the derived value (replacing the existing `useLocalSearchParams` block):

```tsx
  const params = useLocalSearchParams<{
    tagId?: string;
    tagNumber?: string;
    travellerDocumentNumber?: string;
    stickerLineNumber?: string;
  }>();
  const tagId = params.tagId?.trim() || undefined;
  const tagNumber = params.tagNumber?.trim() || undefined;
  const travellerDocumentNumber =
    params.travellerDocumentNumber?.trim() || undefined;
  const stickerLineNumber = params.stickerLineNumber?.trim() || undefined;
```

Add the third resolution branch and the new dependency in the lookup effect:

```tsx
  useEffect(() => {
    let active = true;
    (async () => {
      let result: PublicTag | null = null;
      if (tagId) {
        result = (await getPublicTagByTagId(tagId)) ?? null;
      } else if (tagNumber && travellerDocumentNumber) {
        result =
          (await getPublicTag({ tagNumber, travellerDocumentNumber })) ?? null;
      } else if (stickerLineNumber) {
        // Resolved by sticker, so there is no `tagId` in the params and none on
        // `TagPublicDetailDto` either. Both traveller actions key on the tag
        // number, so nothing downstream needs the GUID — see the staff note in
        // `buildAction`.
        result =
          (await getPublicTagByStickerLineNumber(stickerLineNumber)) ?? null;
      }
      if (active) setTag(result);
    })();
    return () => {
      active = false;
    };
  }, [tagId, tagNumber, travellerDocumentNumber, stickerLineNumber]);
```

- [ ] **Step 4: Give a tagless sticker its own empty state**

In the same file, replace the `tag === null` branch of the render:

```tsx
        ) : tag === null ? (
          <View className="flex-1 items-center justify-center gap-3 py-16">
            <Ionicons name="alert-circle-outline" size={48} color="#9CA3AF" />
            <Text className="text-center text-muted">
              {stickerLineNumber
                ? t("MobileApp.Qr.TagPreview.NoTagOnSticker")
                : t("MobileApp.Qr.TagPreview.NotFound")}
            </Text>
          </View>
        ) : (
```

A sticker scanned fine and there is nothing to retry, so "Please try scanning again" would be actively wrong there.

- [ ] **Step 5: Typecheck and lint**

```bash
npx tsc --noEmit
npx eslint src/hooks/useQrScanLauncher.tsx src/screens/shared/TagPreviewScreen.tsx
```

Expected: exit 0, no lint errors.

- [ ] **Step 6: Run the full suite for regressions**

```bash
npm test
```

Expected: the same 74 passes and the same 4 pre-existing `src/components/__tests__/` load failures as before. No new failures.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useQrScanLauncher.tsx src/screens/shared/TagPreviewScreen.tsx src/localization/resources/en-US.json src/localization/resources/tr-TR.json
git commit -m "feat(qr): resolve a scanned sticker to its public tag"
```

---

### Task 4: Move the calculator to a shared location

Pure refactor. No behaviour changes, and the existing calculator tests must stay green — they are the proof.

**Files:**
- Create: `src/hooks/useMerchantId.ts`
- Create: `src/screens/shared/_components/tag-calculator/line.ts`
- Test: `src/screens/shared/_components/tag-calculator/__tests__/line.test.ts`
- Move: `src/screens/merchant/CreateTag/_components/{ProductGroupPills,AmountDisplay,Numpad,CartReviewSheet,CartSummaryBar,SignaturePads,SignatureSheet}.tsx` → `src/screens/shared/_components/tag-calculator/`
- Move: `src/screens/merchant/CreateTag/calculator/` → `src/screens/shared/_components/tag-calculator/calculator/`
- Modify: `src/screens/merchant/CreateTag/CreateTagScreen.tsx`
- Modify: `src/screens/merchant/CreateTag/useCreateTag.ts`
- Modify: `src/screens/merchant/CreateTag/useMerchantContext.ts`

**Interfaces:**
- Produces, all consumed by Tasks 7 and 8:
  - `useMerchantId(): string | null` from `@/hooks/useMerchantId`
  - `lineFromAmount(amount: number, productGroup: ProductGroupDto): UniRefund_TagService_Tags_InvoiceLineRequestDto`, `mergeLine(items: InvoiceLineRequestDto[], item: InvoiceLineRequestDto): InvoiceLineRequestDto[]` and `generateUUID(): string` from `@/screens/shared/_components/tag-calculator/line`
  - `SignatureTarget = "merchant" | "traveller"` from `@/screens/shared/_components/tag-calculator/line`
  - `SignaturePads` gains `targets?: SignatureTarget[]`, defaulting to `["merchant", "traveller"]`
  - `calculatorReducer`, `resolveAmount`, `initialState`, `CalculatorState` from `@/screens/shared/_components/tag-calculator/calculator/…`

`SignatureTarget` moves to `line.ts` because both `SignaturePads` and `SignatureSheet` import it from `../useCreateTag` today, and after the move that would be a shared component reaching back into a merchant-only hook.

- [ ] **Step 1: Move the files with git**

```bash
mkdir -p src/screens/shared/_components/tag-calculator
git mv src/screens/merchant/CreateTag/calculator src/screens/shared/_components/tag-calculator/calculator
for f in ProductGroupPills AmountDisplay Numpad CartReviewSheet CartSummaryBar SignaturePads SignatureSheet; do
  git mv "src/screens/merchant/CreateTag/_components/$f.tsx" "src/screens/shared/_components/tag-calculator/$f.tsx"
done
```

`git mv` keeps the history attached, which matters for files carrying this much ported-from-POS commentary.

- [ ] **Step 2: Create `line.ts` with the shared helpers and the target type**

Create `src/screens/shared/_components/tag-calculator/line.ts`:

```ts
import type { UniRefund_SettingService_ProductGroupMerchants_ProductGroupMerchantRelationDto as ProductGroupDto } from "@/saas/CRMService";
import type { UniRefund_TagService_Tags_InvoiceLineRequestDto } from "@/saas/TagService";

/**
 * Which signature is being captured. Purely local UI state — the DTOs store the
 * finished images in `merchantIndividualSignatureBase64` /
 * `travellerSignatureBase64`, and there is no generated type for "an image URI
 * held before upload".
 *
 * Lives here rather than in `useCreateTag` because the sticker flow uses the
 * same pads without that hook.
 */
export type SignatureTarget = "merchant" | "traveller";

/**
 * Correlation id for the invoice. Ported from POS — v4-shaped but `Math.random`
 * based, which is fine here: it only has to be unique per invoice, and nothing
 * security-sensitive keys off it.
 */
export function generateUUID(): string {
  const S4 = () =>
    Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  return `${S4() + S4()}-${S4()}-4${S4().substring(0, 3)}-${S4()}-${S4()}${S4()}${S4()}`.toLowerCase();
}

/**
 * Splits a gross amount into tax base and tax using the group's VAT rate.
 * Amounts entered on the numpad are always VAT-inclusive.
 */
export function lineFromAmount(
  amount: number,
  productGroup: ProductGroupDto,
): UniRefund_TagService_Tags_InvoiceLineRequestDto {
  const taxBase = amount / (1 + productGroup.vatRate / 100);
  return {
    amount,
    taxBase,
    taxAmount: amount - taxBase,
    taxRate: productGroup.vatRate,
    productGroupId: productGroup.productGroupId,
  };
}

/**
 * Adds a line to a cart, merging into the existing line for the same product
 * group rather than listing it twice. The merged line's tax is recomputed from
 * the combined amount at the existing line's rate — adding the two tax figures
 * would drift by a cent on repeated merges.
 *
 * Pure, and shared by both cart hooks: the merchant flow and the sticker flow
 * price a cart identically even though they post different DTOs.
 */
export function mergeLine(
  items: UniRefund_TagService_Tags_InvoiceLineRequestDto[],
  item: UniRefund_TagService_Tags_InvoiceLineRequestDto,
): UniRefund_TagService_Tags_InvoiceLineRequestDto[] {
  const index = items.findIndex(
    (i) => i.productGroupId === item.productGroupId,
  );
  if (index === -1) return [...items, item];

  const existing = items[index];
  const amount = (existing.amount || 0) + (item.amount || 0);
  const taxBase = amount / (1 + (existing.taxRate || 0) / 100);
  return items.map((line, i) =>
    i === index
      ? { ...existing, amount, taxBase, taxAmount: amount - taxBase }
      : line,
  );
}
```

- [ ] **Step 3: Strip the moved helpers out of `useCreateTag.ts`**

In `src/screens/merchant/CreateTag/useCreateTag.ts`, delete the `SignatureTarget` type, the `generateUUID` function and the `lineFromAmount` function (and the now-unused `ProductGroupMerchantRelationDto` import), then re-export what its consumers still import from it:

```ts
import {
  generateUUID,
  lineFromAmount,
  mergeLine,
  type SignatureTarget,
} from "@/screens/shared/_components/tag-calculator/line";

// `CreateTagScreen` imports both of these from this module today; re-exporting
// keeps that import working and keeps one obvious home for the pair.
export { lineFromAmount, type SignatureTarget };
```

Then replace the body of `addItem` with a call to the shared helper, so the sticker flow's cart cannot drift from this one:

```ts
  /** Adds a line, merging into an existing line for the same product group. */
  const addItem = useCallback(
    (item: UniRefund_TagService_Tags_InvoiceLineRequestDto) => {
      setItems((prev) => mergeLine(prev, item));
    },
    [],
  );
```

This is the same computation the inline version performed, now in one tested place. Leave the rest of the hook — `useCreateTag` itself, its `toBase64`, its state and its `submit` — exactly as it is. It still posts `CreateTagRequestDto` and still sources its merchant from CRM; the sticker flow does not use it.

- [ ] **Step 4: Move `useMerchantId` to a shared hook**

Create `src/hooks/useMerchantId.ts`:

```ts
import useUserStore from "@/store/user";
import { useMemo } from "react";

/**
 * Merchant the signed-in user is currently acting for, or `null` for a user
 * with no merchant affiliation — which is what identifies a Refund Point.
 *
 * Mirrors how `SignalrProvider` derives it — the claim is a string or an array
 * depending on how many merchants the account is affiliated with, and switching
 * affiliation issues a new token, so reading it from the store keeps this in
 * sync without depending on the SignalR context.
 */
export function useMerchantId(): string | null {
  const { user } = useUserStore();
  return useMemo(() => {
    const merchantId = user?.jwtUser?.MerchantId;
    if (!merchantId) return null;
    return Array.isArray(merchantId) ? merchantId[0] || null : merchantId;
  }, [user]);
}
```

In `src/screens/merchant/CreateTag/useMerchantContext.ts`, delete the local `useMerchantId` (and the now-unused `useUserStore` import) and import it instead:

```ts
import { useMerchantId } from "@/hooks/useMerchantId";
```

- [ ] **Step 5: Give `SignaturePads` a `targets` prop**

In `src/screens/shared/_components/tag-calculator/SignaturePads.tsx`, replace the import, the module constant and the component signature:

```tsx
import type { SignatureTarget } from "./line";

const DEFAULT_TARGETS: SignatureTarget[] = ["merchant", "traveller"];

/**
 * Tap targets that open the signature pad and preview what was captured.
 *
 * `targets` defaults to both pads, so the merchant create-tag screen keeps its
 * behaviour without changing its call. The sticker flow passes `["traveller"]`:
 * `CreateTagByStickerLineRequestDto` has `travellerSignatureBase64` but no
 * merchant-signature field, so that pad would capture something unsendable.
 */
export const SignaturePads = React.memo(function SignaturePads({
  signatures,
  onSign,
  targets = DEFAULT_TARGETS,
}: {
  signatures: Partial<Record<SignatureTarget, string>>;
  onSign: (target: SignatureTarget) => void;
  targets?: SignatureTarget[];
}) {
```

Then change the map from `TARGETS.map(` to `targets.map(`.

- [ ] **Step 6: Fix the remaining imports in the moved files**

In `src/screens/shared/_components/tag-calculator/SignatureSheet.tsx`, replace:

```tsx
import type { SignatureTarget } from "../useCreateTag";
```

with:

```tsx
import type { SignatureTarget } from "./line";
```

In `src/screens/shared/_components/tag-calculator/AmountDisplay.tsx`, the relative path to the calculator types is unchanged (`../calculator/calculator.types` → now `./calculator/calculator.types`):

```tsx
import type { CalculatorState } from "./calculator/calculator.types";
```

- [ ] **Step 7: Update `CreateTagScreen` imports**

In `src/screens/merchant/CreateTag/CreateTagScreen.tsx`, replace the block of local imports (the `./calculator/…`, `./_components/…` and `./useCreateTag` lines) with:

```tsx
import {
  calculatorReducer,
  resolveAmount,
} from "@/screens/shared/_components/tag-calculator/calculator/calculator.reducer";
import { initialState } from "@/screens/shared/_components/tag-calculator/calculator/calculator.types";
import {
  AmountDisplay,
  useDecimalSeparator,
} from "@/screens/shared/_components/tag-calculator/AmountDisplay";
import { CartReviewSheet } from "@/screens/shared/_components/tag-calculator/CartReviewSheet";
import { CartSummaryBar } from "@/screens/shared/_components/tag-calculator/CartSummaryBar";
import { Numpad } from "@/screens/shared/_components/tag-calculator/Numpad";
import { ProductGroupPills } from "@/screens/shared/_components/tag-calculator/ProductGroupPills";
import { SignaturePads } from "@/screens/shared/_components/tag-calculator/SignaturePads";
import { SignatureSheet } from "@/screens/shared/_components/tag-calculator/SignatureSheet";
import {
  lineFromAmount,
  useCreateTag,
  type SignatureTarget,
} from "./useCreateTag";
import { useMerchantContext } from "./useMerchantContext";
```

`CreatedTagSummary` stays at `./_components/CreatedTagSummary` — it renders a created-tag receipt, not a calculator part, and only this screen uses it.

- [ ] **Step 8: Test the extracted cart maths**

`mergeLine` is the one piece of genuinely new logic in this otherwise-mechanical task, and it is now shared by two cart hooks — so it gets tests before either of them relies on it.

Create `src/screens/shared/_components/tag-calculator/__tests__/line.test.ts`:

```ts
import { lineFromAmount, mergeLine } from "../line";

const group = (productGroupId: string, vatRate: number) => ({
  productGroupId,
  productGroupName: `PG ${productGroupId}`,
  vatRate,
  isDefault: false,
  isActive: true,
});

describe("lineFromAmount", () => {
  // Numpad amounts are VAT-inclusive: 120 at 20% is 100 base + 20 tax.
  it("splits a VAT-inclusive amount into base and tax", () => {
    const line = lineFromAmount(120, group("a", 20));
    expect(line.amount).toBe(120);
    expect(line.taxBase).toBeCloseTo(100, 9);
    expect(line.taxAmount).toBeCloseTo(20, 9);
    expect(line.taxRate).toBe(20);
    expect(line.productGroupId).toBe("a");
  });

  it("leaves a zero-rated amount untaxed", () => {
    const line = lineFromAmount(50, group("b", 0));
    expect(line.taxBase).toBeCloseTo(50, 9);
    expect(line.taxAmount).toBeCloseTo(0, 9);
  });
});

describe("mergeLine", () => {
  it("appends a line for a product group not in the cart", () => {
    const cart = [lineFromAmount(120, group("a", 20))];
    const merged = mergeLine(cart, lineFromAmount(108, group("b", 8)));
    expect(merged).toHaveLength(2);
  });

  it("merges into the existing line for the same product group", () => {
    const cart = [lineFromAmount(120, group("a", 20))];
    const merged = mergeLine(cart, lineFromAmount(60, group("a", 20)));
    expect(merged).toHaveLength(1);
    expect(merged[0].amount).toBe(180);
    expect(merged[0].taxBase).toBeCloseTo(150, 9);
    expect(merged[0].taxAmount).toBeCloseTo(30, 9);
  });

  // Recomputing from the combined amount — rather than summing the two tax
  // figures — is what keeps repeated merges from drifting.
  it("keeps tax consistent with the combined amount across repeated merges", () => {
    let cart = [lineFromAmount(0.1, group("a", 20))];
    for (let i = 0; i < 10; i++) {
      cart = mergeLine(cart, lineFromAmount(0.1, group("a", 20)));
    }
    const line = cart[0];
    expect(line.amount).toBeCloseTo(1.1, 9);
    expect((line.taxBase ?? 0) + (line.taxAmount ?? 0)).toBeCloseTo(
      line.amount ?? 0,
      9,
    );
  });

  it("does not mutate the cart it was given", () => {
    const cart = [lineFromAmount(120, group("a", 20))];
    const snapshot = JSON.parse(JSON.stringify(cart));
    mergeLine(cart, lineFromAmount(60, group("a", 20)));
    expect(cart).toEqual(snapshot);
  });
});
```

Run it:

```bash
npx jest src/screens/shared/_components/tag-calculator
```

Expected: PASS, 6 tests, alongside the moved calculator reducer suite.

- [ ] **Step 9: Typecheck, lint and test**

```bash
npx tsc --noEmit
npx eslint src/screens src/hooks
npm test
```

Expected: exit 0; no lint errors; the calculator suite (`calculator.test.ts`, now at `src/screens/shared/_components/tag-calculator/calculator/__tests__/`) still passes with the same assertions, and the overall pass count is unchanged at 74.

If jest cannot find the moved calculator test, check `jest.config` / `package.json` for a hardcoded `roots` or `testMatch` that pins the old path.

- [ ] **Step 10: Commit**

```bash
git add -A src/screens src/hooks
git commit -m "refactor: move the tag calculator to a shared location

Refund-point staff use these components in the sticker flow, so leaving them
under screens/merchant would misdescribe ownership. Pure move plus import
rewrite; SignaturePads gains an optional targets prop so the sticker screen can
render only the traveller pad."
```

---

### Task 5: Pure decision logic for the sticker flow

Everything worth testing in the staff flow lives here, as functions with no React and no network — which is what makes them testable given the `@testing-library/react-native` breakage.

**Files:**
- Create: `src/screens/staff/StickerTag/stickerTag.logic.ts`
- Test: `src/screens/staff/StickerTag/__tests__/stickerTag.logic.test.ts`

**Interfaces:**
- Consumes: `generateUUID` from `@/screens/shared/_components/tag-calculator/line` (Task 4); generated DTOs from `@/saas/TagService`.
- Produces, consumed by Tasks 7 and 8:
  - `type MerchantBranch = "allocated" | "self" | "picker" | "blocked"`
  - `merchantBranch(args: { isMerchantAllocated: boolean; isMerchantUser: boolean; canPickMerchant: boolean }): MerchantBranch`
  - `merchantIdForLookup(args: { isAllocated: boolean; sessionMerchantId: string | null }): string | undefined`
  - `buildStickerTagRequest(args: BuildStickerTagRequestArgs): UniRefund_TagService_Tags_CreateTagByStickerLineRequestDto`
  - `type BuildStickerTagRequestArgs`

- [ ] **Step 1: Write the failing tests**

Create `src/screens/staff/StickerTag/__tests__/stickerTag.logic.test.ts`:

```ts
import {
  buildStickerTagRequest,
  merchantBranch,
  merchantIdForLookup,
} from "../stickerTag.logic";

const PG = "9f1c2f6e-0000-4000-8000-000000000001";

const line = (amount: number, taxRate: number) => ({
  amount,
  taxBase: amount / (1 + taxRate / 100),
  taxAmount: amount - amount / (1 + taxRate / 100),
  taxRate,
  productGroupId: PG,
});

describe("merchantIdForLookup", () => {
  // The allocation cannot be changed and the backend documents the parameter as
  // ignored on an allocated line, so sending it would only assert something we
  // have already been told.
  it("omits the merchant on an allocated line even for a merchant user", () => {
    expect(
      merchantIdForLookup({ isAllocated: true, sessionMerchantId: "m-1" }),
    ).toBeUndefined();
  });

  it("sends the session merchant on an unallocated line", () => {
    expect(
      merchantIdForLookup({ isAllocated: false, sessionMerchantId: "m-1" }),
    ).toBe("m-1");
  });

  // A Refund Point carries no merchant claim; it must pick one instead.
  it("sends nothing on an unallocated line for a refund point", () => {
    expect(
      merchantIdForLookup({ isAllocated: false, sessionMerchantId: null }),
    ).toBeUndefined();
  });
});

describe("merchantBranch", () => {
  it("shows an allocated line read-only regardless of role", () => {
    expect(
      merchantBranch({
        isMerchantAllocated: true,
        isMerchantUser: false,
        canPickMerchant: true,
      }),
    ).toBe("allocated");
  });

  // A merchant is never offered a picker even holding the permission, because
  // the answer is already known: the merchant is themselves.
  it("never offers a merchant user the picker", () => {
    expect(
      merchantBranch({
        isMerchantAllocated: false,
        isMerchantUser: true,
        canPickMerchant: true,
      }),
    ).toBe("self");
  });

  it("offers a permitted refund point the picker", () => {
    expect(
      merchantBranch({
        isMerchantAllocated: false,
        isMerchantUser: false,
        canPickMerchant: true,
      }),
    ).toBe("picker");
  });

  it("blocks a refund point without the search permission", () => {
    expect(
      merchantBranch({
        isMerchantAllocated: false,
        isMerchantUser: false,
        canPickMerchant: false,
      }),
    ).toBe("blocked");
  });
});

describe("buildStickerTagRequest", () => {
  const base = {
    stickerLineNumber: "SL-0007",
    invoiceNumber: "INV-2026-1183",
    issueDate: "2026-07-29T09:00:00.000Z",
    items: [line(120, 20)],
    traveller: undefined,
    merchantId: "m-1",
    travellerSignatureBase64: undefined,
  };

  it("omits merchantId on an allocated line", () => {
    const body = buildStickerTagRequest({
      ...base,
      isMerchantAllocated: true,
    });
    expect("merchantId" in body).toBe(false);
  });

  it("sends merchantId on an unallocated line", () => {
    const body = buildStickerTagRequest({
      ...base,
      isMerchantAllocated: false,
    });
    expect(body.merchantId).toBe("m-1");
  });

  it("creates a Draft without a traveller and Issued with one", () => {
    expect(
      buildStickerTagRequest({ ...base, isMerchantAllocated: true }).status,
    ).toBe("Draft");
    expect(
      buildStickerTagRequest({
        ...base,
        isMerchantAllocated: true,
        traveller: {
          firstName: "Ada",
          lastName: "Lovelace",
          travellerDocumentNumber: "U12345678",
        },
      }).status,
    ).toBe("Issued");
  });

  it("derives invoice totals from the lines", () => {
    const body = buildStickerTagRequest({
      ...base,
      isMerchantAllocated: true,
      items: [line(120, 20), line(108, 8)],
    });
    const invoice = body.invoices[0];
    expect(invoice.totalAmount).toBeCloseTo(228, 6);
    expect(invoice.vatAmount).toBeCloseTo(20 + 8, 6);
    expect(invoice.invoiceNumber).toBe("INV-2026-1183");
    expect(invoice.invoiceLines).toHaveLength(2);
  });

  it("omits the signature key when nothing was captured", () => {
    const body = buildStickerTagRequest({
      ...base,
      isMerchantAllocated: true,
    });
    expect("travellerSignatureBase64" in body).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest src/screens/staff/StickerTag
```

Expected: FAIL — `Cannot find module '../stickerTag.logic'`.

- [ ] **Step 3: Implement the logic module**

Create `src/screens/staff/StickerTag/stickerTag.logic.ts`:

```ts
import { generateUUID } from "@/screens/shared/_components/tag-calculator/line";
import type {
  UniRefund_TagService_Tags_CreateTagByStickerLineRequestDto,
  UniRefund_TagService_Tags_InvoiceLineRequestDto,
  UniRefund_TagService_Travellers_TravellerRequestDto,
} from "@/saas/TagService";

/**
 * Which merchant UI the operator gets. The order is load-bearing: allocation
 * wins over role, and role wins over permission.
 *
 *  - allocated → the sticker book is already booked to a merchant. Read-only for
 *                everyone; the allocation cannot be re-pointed.
 *  - self      → the operator *is* the merchant, so there is nothing to choose.
 *                The book is still unallocated, and creating this tag allocates
 *                it to them permanently — the warning stays.
 *  - picker    → a Refund Point must choose, and that choice is permanent.
 *  - blocked   → a Refund Point without `ViewMerchantsForCreation`. There is no
 *                way forward, so the screen says so rather than showing an inert
 *                form.
 */
export type MerchantBranch = "allocated" | "self" | "picker" | "blocked";

export function merchantBranch(args: {
  isMerchantAllocated: boolean;
  isMerchantUser: boolean;
  canPickMerchant: boolean;
}): MerchantBranch {
  if (args.isMerchantAllocated) return "allocated";
  if (args.isMerchantUser) return "self";
  return args.canPickMerchant ? "picker" : "blocked";
}

/**
 * The `merchantId` to send to the merchant-info lookup.
 *
 * An allocated line gets nothing: the sticker line already names the merchant
 * and the backend ignores the parameter there, so sending it would only assert
 * something we have already been told. An unallocated line sends the session
 * merchant when there is one — that is how a merchant previews their own details
 * and product groups, and without it the card would offer no way forward.
 */
export function merchantIdForLookup(args: {
  isAllocated: boolean;
  sessionMerchantId: string | null;
}): string | undefined {
  if (args.isAllocated) return undefined;
  return args.sessionMerchantId ?? undefined;
}

export interface BuildStickerTagRequestArgs {
  stickerLineNumber: string;
  invoiceNumber: string;
  /** ISO 8601. Passed in rather than read from the clock so this stays pure. */
  issueDate: string;
  items: UniRefund_TagService_Tags_InvoiceLineRequestDto[];
  isMerchantAllocated: boolean;
  /** The resolved or picked merchant. Ignored when the line is allocated. */
  merchantId?: string;
  traveller?: UniRefund_TagService_Travellers_TravellerRequestDto;
  travellerSignatureBase64?: string;
}

/**
 * Builds the create-by-sticker-line body.
 *
 * `merchantId` is included only for an unallocated line, which this call then
 * allocates — permanently, to whichever merchant is sent.
 */
export function buildStickerTagRequest(
  args: BuildStickerTagRequestArgs,
): UniRefund_TagService_Tags_CreateTagByStickerLineRequestDto {
  const totalAmount = args.items.reduce((sum, l) => sum + (l.amount ?? 0), 0);
  const vatAmount = args.items.reduce((sum, l) => sum + (l.taxAmount ?? 0), 0);

  return {
    // No traveller means nobody owns this tag yet — it goes out as a Draft for
    // the traveller to claim by scanning the same sticker.
    status: args.traveller ? "Issued" : "Draft",
    stickerLineNumber: args.stickerLineNumber,
    ...(args.isMerchantAllocated ? {} : { merchantId: args.merchantId }),
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

Expected: PASS, 12 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/screens/staff/StickerTag
git commit -m "feat(sticker): add pure merchant-resolution and request-body logic"
```

---

### Task 6: Merchant picker for refund points

**Files:**
- Create: `src/screens/staff/StickerTag/_components/SearchMerchant.tsx`
- Modify: `src/localization/resources/en-US.json`
- Modify: `src/localization/resources/tr-TR.json`

**Interfaces:**
- Consumes: `getMerchantsForTagCreation` (Task 2); `Input`, `Button`, `Ionicons` components.
- Produces: `SearchMerchant`, props `{ visible: boolean; onClose: () => void; onSelect: (merchant: UniRefund_CRMService_Merchants_MerchantForTagCreationDto) => void; disabled?: boolean }` — the same shape as `SearchTraveller`, which Task 8 uses for both pickers.

- [ ] **Step 1: Add the i18n keys to both languages**

In `src/localization/resources/en-US.json`, add a `SearchMerchant` object inside `Qr`, as a sibling of `SearchTraveller`:

```json
    "SearchMerchant": {
      "Title": "Find the store",
      "Field": "Store name or VAT number",
      "Placeholder": "e.g. Ada Kuyumculuk or 1234567890",
      "SearchButton": "Search",
      "ResultsTitle": "Results",
      "NoResults": "No stores matched. Check the name or VAT number and try again."
    },
```

In `src/localization/resources/tr-TR.json`, the same block:

```json
    "SearchMerchant": {
      "Title": "Mağazayı bulun",
      "Field": "Mağaza adı veya VKN",
      "Placeholder": "örn. Ada Kuyumculuk veya 1234567890",
      "SearchButton": "Ara",
      "ResultsTitle": "Sonuçlar",
      "NoResults": "Eşleşen mağaza bulunamadı. Adı veya VKN'yi kontrol edip tekrar deneyin."
    },
```

- [ ] **Step 2: Create the component**

Create `src/screens/staff/StickerTag/_components/SearchMerchant.tsx`:

```tsx
import { getMerchantsForTagCreation } from "@/actions/TagService/actions";
import Button from "@/components/Button";
import { Ionicons } from "@/components/Ionicons";
import Input from "@/components/Input";
import { useLocalization } from "@/providers/LocalizationProvider";
import type { UniRefund_CRMService_Merchants_MerchantForTagCreationDto } from "@/saas/CRMService";
import { useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

type MerchantDto = UniRefund_CRMService_Merchants_MerchantForTagCreationDto;

/**
 * Merchant search for a Refund Point issuing a tag against an unallocated
 * sticker book. Deliberately a sibling of `SearchTraveller` — same props, same
 * full-screen Modal, same result-row shape — so the two pickers on the sticker
 * screen behave identically.
 *
 * One box searches both the business name and the VAT number, because the
 * endpoint unions them: that is what disambiguates similarly named merchants.
 */
export function SearchMerchant({
  visible,
  onClose,
  onSelect,
  disabled,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (merchant: MerchantDto) => void;
  disabled?: boolean;
}) {
  const { t } = useLocalization();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MerchantDto[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async () => {
    const term = query.trim();
    if (!term || searching) return;
    setSearching(true);
    setError(null);
    try {
      const list = await getMerchantsForTagCreation(term);
      if (list.length === 0) {
        setResults(null);
        setError(t("MobileApp.Qr.SearchMerchant.NoResults"));
        return;
      }
      setResults(list);
    } catch {
      setResults(null);
      setError(t("MobileApp.Qr.SearchMerchant.NoResults"));
    } finally {
      setSearching(false);
    }
  }, [query, searching, t]);

  const select = useCallback(
    (merchant: MerchantDto) => {
      onSelect(merchant);
      setResults(null);
      setQuery("");
      setError(null);
    },
    [onSelect],
  );

  if (!visible) return null;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-background p-4 gap-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-lg font-bold text-foreground">
            {t("MobileApp.Qr.SearchMerchant.Title")}
          </Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color="#374151" />
          </Pressable>
        </View>

        <Input
          title={t("MobileApp.Qr.SearchMerchant.Field")}
          iconName="business-outline"
          value={query}
          onChangeText={setQuery}
          placeholder={t("MobileApp.Qr.SearchMerchant.Placeholder")}
          autoCapitalize="none"
          onSubmitEditing={search}
        />
        <Button
          action={{
            onPress: search,
            label: t("MobileApp.Qr.SearchMerchant.SearchButton"),
          }}
          isLoading={searching}
          disabled={disabled || !query.trim()}
        />

        {error && (
          <Text className="text-center text-red-500 text-sm">{error}</Text>
        )}

        {results && (
          <ScrollView className="flex-1">
            <Text className="text-sm text-muted mb-2">
              {t("MobileApp.Qr.SearchMerchant.ResultsTitle")}
            </Text>
            {results.map((merchant) => (
              <Pressable
                key={merchant.id ?? merchant.vatNumber}
                onPress={() => select(merchant)}
                disabled={disabled}
                className={
                  "rounded-xl border border-gray-200 p-3 mb-2 " +
                  (disabled ? "opacity-50" : "")
                }
              >
                <Text className="font-semibold text-foreground">
                  {merchant.name}
                </Text>
                <Text className="text-xs text-muted">{merchant.vatNumber}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}
```

- [ ] **Step 3: Typecheck and lint**

```bash
npx tsc --noEmit
npx eslint src/screens/staff/StickerTag/_components/SearchMerchant.tsx
```

Expected: exit 0, no lint errors.

`iconName` is typed against the `IoniconsTypes` union, so a name the installed icon set does not carry is a compile error, not a runtime blank. If `business-outline` is rejected, use `storefront-outline`.

- [ ] **Step 4: Commit**

```bash
git add src/screens/staff/StickerTag/_components/SearchMerchant.tsx src/localization/resources/en-US.json src/localization/resources/tr-TR.json
git commit -m "feat(sticker): add the refund-point merchant picker"
```

---

### Task 7: Hooks — resolve the sticker line, own the cart

**Files:**
- Create: `src/screens/staff/StickerTag/useStickerLine.ts`
- Create: `src/screens/staff/StickerTag/useStickerTag.ts`

**Interfaces:**
- Consumes: Task 2 actions; Task 4 `useMerchantId`, `lineFromAmount`, `SignatureTarget`; Task 5 `merchantIdForLookup`, `buildStickerTagRequest`.
- Produces, both consumed by Task 8:
  - `useStickerLine(stickerLineNumber: string)` → `{ status: StickerLineStatus, merchant: MerchantInfoForTagCreationDto | null, isMerchantAllocated: boolean, productGroups: ProductGroupDto[], selectMerchant: (merchantId: string) => Promise<void>, retry: () => Promise<void> }`. The tag id of an already-used line rides **inside** `status` as `{ kind: "has-tag"; tagId: string }` — there is no separate `existingTagId` field, so the id and the state it belongs to cannot drift apart.
  - `useStickerTag(args: { stickerLineNumber: string; isMerchantAllocated: boolean; merchantId?: string })` → `{ invoiceNumber, setInvoiceNumber, items, addItem, removeItem, totals: { grandTotal, taxBase, taxAmount }, traveller, setTraveller, signatures, setSignature, resetCart, isSubmitting, submit, canSubmit }`, where `submit(): Promise<{ tag: TagDto | null; message?: string }>` — `message` carries the server's rejection text so the caller's toast can show it.

- [ ] **Step 1: Create `useStickerLine.ts`**

```ts
import {
  getStickerLineByNumber,
  getStickerLineMerchantInfo,
} from "@/actions/TagService/actions";
import { useMerchantId } from "@/hooks/useMerchantId";
import type {
  UniRefund_CRMService_Merchants_MerchantInfoForTagCreationDto,
  UniRefund_SettingService_ProductGroupMerchants_ProductGroupMerchantRelationDto,
} from "@/saas/CRMService";
import { logger } from "@/utils/logger";
import { useCallback, useEffect, useRef, useState } from "react";
import { merchantIdForLookup } from "./stickerTag.logic";

type MerchantInfo = UniRefund_CRMService_Merchants_MerchantInfoForTagCreationDto;
type ProductGroupDto =
  UniRefund_SettingService_ProductGroupMerchants_ProductGroupMerchantRelationDto;

export type StickerLineStatus =
  | { kind: "resolving" }
  /** The line already carries a tag — the screen sends the operator to it. */
  | { kind: "has-tag"; tagId: string }
  | { kind: "not-found" }
  | { kind: "error" }
  | { kind: "ready" };

/**
 * Resolves what a scanned sticker line means before a tag can be priced against
 * it: whether it already carries a tag, whether its book is allocated, and which
 * merchant (with which product groups) the tag would be booked against.
 *
 * Two calls, never three. The sticker line already names its merchant once the
 * book is allocated, so `isAllocated` is derived from the first response rather
 * than asked for separately.
 */
export function useStickerLine(stickerLineNumber: string) {
  const sessionMerchantId = useMerchantId();
  const [status, setStatus] = useState<StickerLineStatus>({
    kind: "resolving",
  });
  const [merchant, setMerchant] = useState<MerchantInfo | null>(null);
  const [isMerchantAllocated, setIsMerchantAllocated] = useState(false);
  const [productGroups, setProductGroups] = useState<ProductGroupDto[]>([]);
  // Guards against a resolve settling after the screen has been popped, and
  // against an older in-flight lookup overwriting a newer merchant pick.
  const requestIdRef = useRef(0);

  const resolve = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setStatus({ kind: "resolving" });

    let line;
    try {
      line = await getStickerLineByNumber(stickerLineNumber);
    } catch (error) {
      logger.warn("[StickerTag] sticker line lookup failed", error);
      if (requestId !== requestIdRef.current) return;
      setStatus({ kind: "not-found" });
      return;
    }
    if (requestId !== requestIdRef.current) return;

    // A used line already has its tag; creating a second one against it would be
    // rejected, so the operator is sent to the tag instead. This is also where
    // staff get the tag GUID — `TagPublicDetailDto` carries no id.
    if (line.tagId) {
      setStatus({ kind: "has-tag", tagId: line.tagId });
      return;
    }

    const isAllocated = Boolean(line.merchantId);
    const info = await getStickerLineMerchantInfo({
      stickerLineNumber,
      merchantId: merchantIdForLookup({ isAllocated, sessionMerchantId }),
    });
    if (requestId !== requestIdRef.current) return;

    // No merchant and no product groups would leave the operator on a form with
    // no way forward and no explanation.
    if (!info) {
      setStatus({ kind: "error" });
      return;
    }

    setIsMerchantAllocated(info.isMerchantAllocated);
    setMerchant(info.merchant ?? null);
    setProductGroups(info.merchant?.productGroups ?? []);
    setStatus({ kind: "ready" });
  }, [stickerLineNumber, sessionMerchantId]);

  // Network fetch keyed on the scanned value — no derived state or user event to
  // hang it off, so an effect is the honest tool here.
  useEffect(() => {
    void resolve();
  }, [resolve]);

  /**
   * Previews a Refund Point's merchant choice. The line stays unallocated —
   * nothing is allocated until the tag is created.
   */
  const selectMerchant = useCallback(
    async (merchantId: string) => {
      const requestId = ++requestIdRef.current;
      setStatus({ kind: "resolving" });
      const info = await getStickerLineMerchantInfo({
        stickerLineNumber,
        merchantId,
      });
      if (requestId !== requestIdRef.current) return;
      if (!info) {
        setStatus({ kind: "error" });
        return;
      }
      setIsMerchantAllocated(info.isMerchantAllocated);
      setMerchant(info.merchant ?? null);
      setProductGroups(info.merchant?.productGroups ?? []);
      setStatus({ kind: "ready" });
    },
    [stickerLineNumber],
  );

  return {
    status,
    merchant,
    isMerchantAllocated,
    productGroups,
    selectMerchant,
    retry: resolve,
  };
}
```

- [ ] **Step 2: Create `useStickerTag.ts`**

```ts
import { postTagByStickerLine } from "@/actions/TagService/post";
import type {
  UniRefund_TagService_Tags_InvoiceLineRequestDto,
  UniRefund_TagService_Tags_TagDto,
  UniRefund_TagService_Travellers_TravellerRequestDto,
} from "@/saas/TagService";
import {
  mergeLine,
  type SignatureTarget,
} from "@/screens/shared/_components/tag-calculator/line";
import { logger } from "@/utils/logger";
import { File } from "expo-file-system";
import { useCallback, useMemo, useState } from "react";
import { buildStickerTagRequest } from "./stickerTag.logic";

async function toBase64(uri?: string): Promise<string | undefined> {
  if (!uri) return undefined;
  return await new File(uri).base64();
}

/**
 * Owns one in-progress sticker tag: the invoice number, the cart, the optional
 * traveller and their signature, and the create call.
 *
 * Deliberately not `useCreateTag`. That hook posts `CreateTagRequestDto` and
 * identifies the merchant by VAT number from CRM; this one posts
 * `CreateTagByStickerLineRequestDto`, where the merchant is resolved server-side
 * from the sticker line. Sharing them would mean a hook with two payload shapes
 * and two merchant sources — the cart maths they have in common already lives in
 * `line.ts`.
 */
export function useStickerTag(args: {
  stickerLineNumber: string;
  isMerchantAllocated: boolean;
  merchantId?: string;
}) {
  const { stickerLineNumber, isMerchantAllocated, merchantId } = args;
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [items, setItems] = useState<
    UniRefund_TagService_Tags_InvoiceLineRequestDto[]
  >([]);
  const [traveller, setTraveller] =
    useState<UniRefund_TagService_Travellers_TravellerRequestDto | null>(null);
  // Only the traveller pad is offered — the sticker DTO has no merchant
  // signature field — but the map keeps `SignaturePads`/`SignatureSheet` usable
  // unchanged.
  const [signatures, setSignatures] = useState<
    Partial<Record<SignatureTarget, string>>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const totals = useMemo(
    () => ({
      grandTotal: items.reduce((sum, item) => sum + (item.amount || 0), 0),
      taxBase: items.reduce((sum, item) => sum + (item.taxBase || 0), 0),
      taxAmount: items.reduce((sum, item) => sum + (item.taxAmount || 0), 0),
    }),
    [items],
  );

  /** Adds a line, merging into an existing line for the same product group. */
  const addItem = useCallback(
    (item: UniRefund_TagService_Tags_InvoiceLineRequestDto) => {
      setItems((prev) => mergeLine(prev, item));
    },
    [],
  );

  const removeItem = useCallback((productGroupId?: string | null) => {
    setItems((prev) =>
      prev.filter((item) => item.productGroupId !== productGroupId),
    );
  }, []);

  const setSignature = useCallback(
    (target: SignatureTarget, uri: string) =>
      setSignatures((prev) => ({ ...prev, [target]: uri })),
    [],
  );

  /**
   * Product groups belong to the merchant, so lines priced against a previous
   * one are not transferable when the Refund Point changes their pick.
   */
  const resetCart = useCallback(() => setItems([]), []);

  /**
   * Resolves to the created tag, or `null` when the call failed — the caller
   * owns the toast, so the server message is logged and surfaced there.
   */
  const submit = useCallback(async (): Promise<{
    tag: UniRefund_TagService_Tags_TagDto | null;
    message?: string;
  }> => {
    if (isSubmitting || items.length === 0 || !invoiceNumber.trim()) {
      return { tag: null };
    }
    setIsSubmitting(true);
    try {
      const travellerSignatureBase64 = await toBase64(signatures.traveller);
      const tag = await postTagByStickerLine(
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
      return { tag };
    } catch (error) {
      logger.warn("[StickerTag] tag creation failed", error);
      const message =
        error instanceof Error && error.message ? error.message : undefined;
      return { tag: null, message };
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isSubmitting,
    items,
    invoiceNumber,
    signatures,
    stickerLineNumber,
    isMerchantAllocated,
    merchantId,
    traveller,
  ]);

  return {
    invoiceNumber,
    setInvoiceNumber,
    items,
    addItem,
    removeItem,
    totals,
    traveller,
    setTraveller,
    signatures,
    setSignature,
    resetCart,
    isSubmitting,
    submit,
    canSubmit:
      items.length > 0 && invoiceNumber.trim().length > 0 && !isSubmitting,
  };
}
```

- [ ] **Step 3: Typecheck and lint**

```bash
npx tsc --noEmit
npx eslint src/screens/staff/StickerTag
```

Expected: exit 0, no lint errors.

- [ ] **Step 4: Commit**

```bash
git add src/screens/staff/StickerTag/useStickerLine.ts src/screens/staff/StickerTag/useStickerTag.ts
git commit -m "feat(sticker): add sticker-line resolution and cart hooks"
```

---

### Task 8: The staff sticker screen

Ships the staff half. After this task the whole feature works.

**Files:**
- Create: `src/screens/staff/StickerTag/_components/MerchantBlock.tsx`
- Create: `src/screens/staff/StickerTag/StickerTagScreen.tsx`
- Create: `src/app/sticker-tag.tsx`
- Modify: `src/app/_layout.tsx`
- Modify: `src/hooks/useQrScanLauncher.tsx`
- Modify: `src/localization/resources/en-US.json`
- Modify: `src/localization/resources/tr-TR.json`

**Interfaces:**
- Consumes: Tasks 4–7 in full, plus `SearchTraveller`, `ModalTemplate`, `useToastRef`, `loadTags`.
- Produces: the `/sticker-tag` route, taking a `stickerLineNumber` param.

- [ ] **Step 1: Add the i18n keys to both languages**

In `src/localization/resources/en-US.json`, add a `StickerTag` object inside `Qr`:

```json
    "StickerTag": {
      "Title": "New tag from sticker",
      "Resolving": "Reading the sticker…",
      "Merchant": "Store",
      "MerchantAllocated": "This sticker book is already assigned to this store.",
      "AllocationWarning": "Creating this tag assigns the whole sticker book to this store permanently.",
      "SelectMerchant": "Select the store",
      "ChangeMerchant": "Change store",
      "MerchantInfoUnavailable": "Couldn't load the store for this sticker.",
      "MerchantVatNumber": "VAT number",
      "MerchantAddress": "Address",
      "NoPickPermission": "You don't have permission to choose a store for an unassigned sticker book.",
      "InvoiceNumber": "Invoice number",
      "InvoiceNumberPlaceholder": "e.g. INV-2026-1183",
      "Traveller": "Traveller (optional)",
      "NoTraveller": "Leave empty to create a draft the traveller can claim",
      "RemoveTraveller": "Remove traveller",
      "NoProductGroups": "This store has no product groups configured, so a tag can't be priced.",
      "LineNotFound": "Sticker not found. Please check the sticker and scan again.",
      "NoPermission": "You don't have permission to create a tag from a sticker.",
      "Create": "Create tag",
      "CreateDraft": "Create draft tag",
      "Creating": "Creating…",
      "CreateSuccess": "Tag created",
      "CreateError": "Could not create the tag. Please try again.",
      "Retry": "Try again"
    },
```

In `src/localization/resources/tr-TR.json`, the same block:

```json
    "StickerTag": {
      "Title": "Etiketten yeni tag",
      "Resolving": "Etiket okunuyor…",
      "Merchant": "Mağaza",
      "MerchantAllocated": "Bu etiket koçanı zaten bu mağazaya tanımlı.",
      "AllocationWarning": "Bu tag'i oluşturmak, etiket koçanının tamamını kalıcı olarak bu mağazaya tanımlar.",
      "SelectMerchant": "Mağaza seçin",
      "ChangeMerchant": "Mağazayı değiştir",
      "MerchantInfoUnavailable": "Bu etikete ait mağaza bilgisi yüklenemedi.",
      "MerchantVatNumber": "VKN",
      "MerchantAddress": "Adres",
      "NoPickPermission": "Tanımsız bir etiket koçanı için mağaza seçme yetkiniz yok.",
      "InvoiceNumber": "Fatura numarası",
      "InvoiceNumberPlaceholder": "örn. INV-2026-1183",
      "Traveller": "Yolcu (isteğe bağlı)",
      "NoTraveller": "Boş bırakırsanız yolcunun sahiplenebileceği bir taslak oluşturulur",
      "RemoveTraveller": "Yolcuyu kaldır",
      "NoProductGroups": "Bu mağaza için ürün grubu tanımlı değil, tag oluşturulamaz.",
      "LineNotFound": "Etiket bulunamadı. Lütfen etiketi kontrol edip tekrar okutun.",
      "NoPermission": "Etiketten tag oluşturma yetkiniz yok.",
      "Create": "Tag oluştur",
      "CreateDraft": "Taslak tag oluştur",
      "Creating": "Oluşturuluyor…",
      "CreateSuccess": "Tag oluşturuldu",
      "CreateError": "Tag oluşturulamadı. Lütfen tekrar deneyin.",
      "Retry": "Tekrar dene"
    },
```

- [ ] **Step 2: Create `MerchantBlock.tsx`**

```tsx
import DebouncedPressable from "@/components/DebouncedPressable";
import { useLocalization } from "@/providers/LocalizationProvider";
import type { UniRefund_CRMService_Merchants_MerchantInfoForTagCreationDto } from "@/saas/CRMService";
import { Text, View } from "react-native";
import type { MerchantBranch } from "../stickerTag.logic";

/**
 * The merchant half of the sticker form. Which of the four branches renders is
 * decided by `merchantBranch` — this component only draws them, so the rules
 * stay in one tested place.
 *
 * The allocation warning shows on both unallocated branches: it is equally true
 * when the merchant is themselves.
 */
export function MerchantBlock({
  branch,
  merchant,
  onPickPress,
}: {
  branch: MerchantBranch;
  merchant: UniRefund_CRMService_Merchants_MerchantInfoForTagCreationDto | null;
  onPickPress: () => void;
}) {
  const { t } = useLocalization();

  return (
    <View className="rounded-2xl border border-gray-200 bg-white p-4 gap-2">
      <Text className="text-sm text-muted">
        {t("MobileApp.Qr.StickerTag.Merchant")}
      </Text>

      {branch === "blocked" ? (
        <Text className="text-sm text-red-500">
          {t("MobileApp.Qr.StickerTag.NoPickPermission")}
        </Text>
      ) : (
        <>
          <Text className="text-base font-semibold text-foreground">
            {merchant?.name ?? t("MobileApp.Qr.StickerTag.SelectMerchant")}
          </Text>

          {merchant && (
            <View className="gap-0.5">
              <Text className="text-xs text-muted">
                {t("MobileApp.Qr.StickerTag.MerchantVatNumber")}:{" "}
                {merchant.vatNumber}
              </Text>
              {merchant.address ? (
                <Text className="text-xs text-muted">
                  {t("MobileApp.Qr.StickerTag.MerchantAddress")}:{" "}
                  {merchant.address}
                </Text>
              ) : null}
            </View>
          )}

          {branch === "allocated" ? (
            <Text className="text-xs text-muted">
              {t("MobileApp.Qr.StickerTag.MerchantAllocated")}
            </Text>
          ) : (
            <Text className="text-xs font-semibold text-orange-500">
              {t("MobileApp.Qr.StickerTag.AllocationWarning")}
            </Text>
          )}

          {branch === "picker" && (
            <DebouncedPressable
              onPress={onPickPress}
              accessibilityRole="button"
              className="mt-1 self-start rounded-xl border border-gray-400 px-4 py-2 active:bg-gray-50"
            >
              <Text className="text-sm font-medium text-foreground">
                {merchant
                  ? t("MobileApp.Qr.StickerTag.ChangeMerchant")
                  : t("MobileApp.Qr.StickerTag.SelectMerchant")}
              </Text>
            </DebouncedPressable>
          )}
        </>
      )}
    </View>
  );
}
```

- [ ] **Step 3: Create `StickerTagScreen.tsx`**

```tsx
import { Ionicons } from "@/components/Ionicons";
import Input from "@/components/Input";
import LoadingIcon from "@/components/LoadingUnirefund";
import DebouncedPressable from "@/components/DebouncedPressable";
import { loadTags } from "@/hooks/useLoadTags";
import { useLocalization } from "@/providers/LocalizationProvider";
import { useToastRef } from "@/providers/ToastProvider";
import { SearchTraveller } from "@/screens/shared/_components/SearchTraveller/SearchTraveller";
import {
  AmountDisplay,
  useDecimalSeparator,
} from "@/screens/shared/_components/tag-calculator/AmountDisplay";
import {
  calculatorReducer,
  resolveAmount,
} from "@/screens/shared/_components/tag-calculator/calculator/calculator.reducer";
import { initialState } from "@/screens/shared/_components/tag-calculator/calculator/calculator.types";
import { CartReviewSheet } from "@/screens/shared/_components/tag-calculator/CartReviewSheet";
import { CartSummaryBar } from "@/screens/shared/_components/tag-calculator/CartSummaryBar";
import { lineFromAmount } from "@/screens/shared/_components/tag-calculator/line";
import { Numpad } from "@/screens/shared/_components/tag-calculator/Numpad";
import { ProductGroupPills } from "@/screens/shared/_components/tag-calculator/ProductGroupPills";
import { SignaturePads } from "@/screens/shared/_components/tag-calculator/SignaturePads";
import { SignatureSheet } from "@/screens/shared/_components/tag-calculator/SignatureSheet";
import type { SignatureTarget } from "@/screens/shared/_components/tag-calculator/line";
import useUserStore from "@/store/user";
import { ModalTemplate } from "@/templates/Modal";
import { cn } from "@/utils/cn";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Text, View } from "react-native";
import { MerchantBlock } from "./_components/MerchantBlock";
import { SearchMerchant } from "./_components/SearchMerchant";
import { merchantBranch } from "./stickerTag.logic";
import { useStickerLine } from "./useStickerLine";
import { useStickerTag } from "./useStickerTag";

/**
 * Staff tag creation from a scanned store sticker — the mobile counterpart of
 * the web's `operations/scan-sticker` page.
 *
 * The merchant is resolved from the sticker line rather than supplied: an
 * allocated sticker book fixes it, a merchant user is themselves, and a Refund
 * Point picks one — which allocates the book permanently.
 */
export function StickerTagScreen() {
  const params = useLocalSearchParams<{ stickerLineNumber?: string }>();
  const stickerLineNumber = params.stickerLineNumber?.trim() || "";

  const { t } = useLocalization();
  const toastRef = useToastRef();
  const decimalSeparator = useDecimalSeparator();
  const { user, isMerchant, isRefundPoint } = useUserStore();
  const isStaff = isMerchant || isRefundPoint;

  const line = useStickerLine(stickerLineNumber);
  const sale = useStickerTag({
    stickerLineNumber,
    isMerchantAllocated: line.isMerchantAllocated,
    merchantId: line.merchant?.id,
  });

  const [calculator, dispatch] = useReducer(calculatorReducer, initialState);
  const [merchantSearchOpen, setMerchantSearchOpen] = useState(false);
  const [travellerSearchOpen, setTravellerSearchOpen] = useState(false);
  const [signatureTarget, setSignatureTarget] =
    useState<SignatureTarget | null>(null);
  const cartSheetRef = useRef<BottomSheetModal>(null);
  const signatureSheetRef = useRef<BottomSheetModal>(null);

  const canCreate = Boolean(
    user?.grantedPolicies?.["TagService.Tags.CreateByStickerLine"],
  );
  const canPickMerchant =
    !isMerchant &&
    Boolean(user?.grantedPolicies?.["TagService.Tags.ViewMerchantsForCreation"]);
  const branch = merchantBranch({
    isMerchantAllocated: line.isMerchantAllocated,
    isMerchantUser: isMerchant,
    canPickMerchant,
  });

  // `undefined` = untouched (fall back to the merchant default, which arrives
  // asynchronously), `null` = deliberately cleared, string = an explicit pick.
  const [pickedGroupId, setPickedGroupId] = useState<string | null | undefined>(
    undefined,
  );
  const defaultProductGroup = useMemo(
    () => line.productGroups.find((pg) => pg.isDefault) ?? line.productGroups[0],
    [line.productGroups],
  );
  const selectedProductGroup = useMemo(() => {
    if (pickedGroupId === null) return undefined;
    if (pickedGroupId !== undefined) {
      return line.productGroups.find(
        (pg) => pg.productGroupId === pickedGroupId,
      );
    }
    return defaultProductGroup;
  }, [pickedGroupId, line.productGroups, defaultProductGroup]);

  // A used sticker already has its tag; show that instead of a create form the
  // backend would reject. `replace` so Back returns to wherever the scan started
  // rather than to this screen.
  useEffect(() => {
    if (line.status.kind === "has-tag") {
      router.replace({
        pathname: "/tag-preview",
        params: { tagId: line.status.tagId },
      });
    }
  }, [line.status]);

  // Only the launcher routes here, and only for staff — but the route is a root
  // route, so a stale deep link could land anyone on it.
  useEffect(() => {
    if (!isStaff) {
      router.replace({
        pathname: "/tag-preview",
        params: { stickerLineNumber },
      });
    }
  }, [isStaff, stickerLineNumber]);

  useEffect(() => {
    if (line.status.kind === "not-found") {
      toastRef.current?.show(
        "error",
        t("MobileApp.Qr.StickerTag.LineNotFound"),
      );
      router.back();
    }
  }, [line.status, t, toastRef]);

  function addToCart() {
    if (!selectedProductGroup) return;
    const amount = resolveAmount(calculator);
    if (amount <= 0) return;
    sale.addItem(lineFromAmount(amount, selectedProductGroup));
    dispatch({ type: "CLEAR" });
  }

  async function handleCreate() {
    const { tag, message } = await sale.submit();
    if (!tag) {
      toastRef.current?.show(
        "error",
        message || t("MobileApp.Qr.StickerTag.CreateError"),
      );
      return;
    }
    toastRef.current?.show("success", t("MobileApp.Qr.StickerTag.CreateSuccess"));
    // Keeps the Tags tab and Home's "latest tag" in step.
    void loadTags(true);
    router.replace({
      pathname: "/(auth)/tags/[tagId]",
      params: { tagId: tag.id ?? "", tagNumber: tag.tagNumber },
    });
  }

  const canAddToCart =
    selectedProductGroup !== undefined &&
    (calculator.totalAmount > 0 || calculator.currentAmount > 0);

  const action =
    canCreate && sale.canSubmit
      ? {
          onPress: handleCreate,
          label: sale.isSubmitting
            ? t("MobileApp.Qr.StickerTag.Creating")
            : sale.traveller
              ? t("MobileApp.Qr.StickerTag.Create")
              : t("MobileApp.Qr.StickerTag.CreateDraft"),
        }
      : undefined;

  if (line.status.kind === "resolving" || line.status.kind === "has-tag") {
    return (
      <ModalTemplate title={t("MobileApp.Qr.StickerTag.Title")} backAction={() => router.back()}>
        <View className="flex-1 items-center justify-center gap-3 py-16">
          <LoadingIcon />
          <Text className="text-muted">
            {t("MobileApp.Qr.StickerTag.Resolving")}
          </Text>
        </View>
      </ModalTemplate>
    );
  }

  if (line.status.kind === "error") {
    return (
      <ModalTemplate
        title={t("MobileApp.Qr.StickerTag.Title")}
        backAction={() => router.back()}
        action={{
          onPress: line.retry,
          label: t("MobileApp.Qr.StickerTag.Retry"),
        }}
      >
        <View className="flex-1 items-center justify-center gap-3 py-16">
          <Ionicons name="alert-circle-outline" size={48} color="#9CA3AF" />
          <Text className="text-center text-muted">
            {t("MobileApp.Qr.StickerTag.MerchantInfoUnavailable")}
          </Text>
        </View>
      </ModalTemplate>
    );
  }

  return (
    <>
      <ModalTemplate
        title={t("MobileApp.Qr.StickerTag.Title")}
        description={stickerLineNumber}
        backAction={() => router.back()}
        keyboardShouldPersistTaps="handled"
        action={action}
      >
        <View className="gap-3 pt-1 pb-4">
          <MerchantBlock
            branch={branch}
            merchant={line.merchant}
            onPickPress={() => setMerchantSearchOpen(true)}
          />

          {!canCreate && (
            <Text className="text-sm text-red-500">
              {t("MobileApp.Qr.StickerTag.NoPermission")}
            </Text>
          )}

          <Input
            title={t("MobileApp.Qr.StickerTag.InvoiceNumber")}
            iconName="receipt-outline"
            value={sale.invoiceNumber}
            onChangeText={sale.setInvoiceNumber}
            placeholder={t("MobileApp.Qr.StickerTag.InvoiceNumberPlaceholder")}
            autoCapitalize="characters"
          />

          <View className="flex-row gap-2">
            <DebouncedPressable
              onPress={() => setTravellerSearchOpen(true)}
              accessibilityRole="button"
              className="flex-1 rounded-2xl border border-gray-200 bg-white p-4"
            >
              <Text className="text-sm text-muted">
                {t("MobileApp.Qr.StickerTag.Traveller")}
              </Text>
              <Text className="text-base font-semibold text-foreground">
                {sale.traveller
                  ? `${sale.traveller.firstName} ${sale.traveller.lastName}`
                  : t("MobileApp.Qr.StickerTag.NoTraveller")}
              </Text>
            </DebouncedPressable>
            {sale.traveller && (
              <DebouncedPressable
                onPress={() => sale.setTraveller(null)}
                accessibilityRole="button"
                accessibilityLabel={t("MobileApp.Qr.StickerTag.RemoveTraveller")}
                className="items-center justify-center rounded-xl border border-gray-400 px-4 active:bg-gray-50"
              >
                <Ionicons name="close-outline" size={18} color="black" />
              </DebouncedPressable>
            )}
          </View>

          {line.productGroups.length === 0 ? (
            /* Without product groups there is no VAT rate to price a line
               against, so the calculator cannot produce a valid invoice line at
               all. Retry rather than a dead end: the merchant resolved, so this
               is usually a configuration gap the operator can have fixed. */
            <View className="gap-2">
              <Text className="text-sm text-muted">
                {t("MobileApp.Qr.StickerTag.NoProductGroups")}
              </Text>
              <DebouncedPressable
                onPress={line.retry}
                accessibilityRole="button"
                className="self-start rounded-xl border border-gray-400 px-4 py-2 active:bg-gray-50"
              >
                <Text className="text-sm font-medium text-foreground">
                  {t("MobileApp.Qr.StickerTag.Retry")}
                </Text>
              </DebouncedPressable>
            </View>
          ) : (
            <>
              <ProductGroupPills
                productGroups={line.productGroups}
                selected={selectedProductGroup}
                onSelect={(pg) =>
                  setPickedGroupId(pg ? pg.productGroupId : null)
                }
              />

              <AmountDisplay
                state={calculator}
                selectedProductGroup={selectedProductGroup}
              />

              <Numpad
                decimalLabel={decimalSeparator}
                disabled={!selectedProductGroup}
                clearLabel={t("MobileApp.CreateTag.Clear")}
                backspaceLabel={t("MobileApp.CreateTag.Backspace")}
                onNumberPress={(digit) =>
                  dispatch({ type: "DIGIT_PRESSED", digit })
                }
                onDecimalPress={() => dispatch({ type: "DECIMAL_PRESSED" })}
                onBackspacePress={(isLongPress) =>
                  dispatch({ type: isLongPress ? "CLEAR" : "BACKSPACE_PRESSED" })
                }
                onOperatorPress={(operator) =>
                  operator === "="
                    ? dispatch({ type: "EQUALS_PRESSED" })
                    : dispatch({ type: "OPERATOR_PRESSED", operator })
                }
              />

              <DebouncedPressable
                onPress={addToCart}
                disabled={!canAddToCart}
                accessibilityRole="button"
                className={cn(
                  "py-3 rounded-xl items-center",
                  canAddToCart ? "bg-[#1F7A5C]" : "bg-gray-300",
                )}
              >
                <Text className="text-white text-base font-semibold">
                  {t("MobileApp.CreateTag.AddToCart")}
                </Text>
              </DebouncedPressable>

              <CartSummaryBar
                itemCount={sale.items.length}
                grandTotal={sale.totals.grandTotal}
                onPress={() => cartSheetRef.current?.present()}
              />

              {/* Only the traveller pad: the sticker DTO has no merchant
                  signature field. */}
              <SignaturePads
                signatures={sale.signatures}
                onSign={(target) => {
                  setSignatureTarget(target);
                  signatureSheetRef.current?.present();
                }}
                targets={["traveller"]}
              />
            </>
          )}
        </View>
      </ModalTemplate>

      <SearchMerchant
        visible={merchantSearchOpen}
        onClose={() => setMerchantSearchOpen(false)}
        onSelect={(merchant) => {
          setMerchantSearchOpen(false);
          if (!merchant.id) return;
          // Product groups belong to the merchant, so lines priced against the
          // previous one are not transferable.
          sale.resetCart();
          setPickedGroupId(undefined);
          void line.selectMerchant(merchant.id);
        }}
      />

      <SearchTraveller
        visible={travellerSearchOpen}
        onClose={() => setTravellerSearchOpen(false)}
        onSelect={(traveller) => {
          sale.setTraveller(traveller);
          setTravellerSearchOpen(false);
        }}
      />

      <CartReviewSheet
        sheetRef={cartSheetRef}
        items={sale.items}
        productGroups={line.productGroups}
        totals={sale.totals}
        onRemove={sale.removeItem}
      />

      <SignatureSheet
        sheetRef={signatureSheetRef}
        target={signatureTarget}
        onSave={sale.setSignature}
      />
    </>
  );
}
```

- [ ] **Step 4: Create the route file**

Create `src/app/sticker-tag.tsx`:

```tsx
import { StickerTagScreen } from "@/screens/staff/StickerTag/StickerTagScreen";

export default StickerTagScreen;
```

- [ ] **Step 5: Register the route**

In `src/app/_layout.tsx`, add below the existing `validate` line inside `RootNavigator`:

```tsx
      <Stack.Screen name="sticker-tag" options={{ animation: "slide_from_bottom" }} />
```

- [ ] **Step 6: Route staff to the new screen**

In `src/hooks/useQrScanLauncher.tsx`, replace the sticker branch added in Task 3 with the role split:

```tsx
      if (result.kind === "sticker") {
        // Staff issue a tag against the sticker. Everyone else — travellers, and
        // anyone scanning before login, who has no role at all — reads the tag
        // already issued on it; that read needs no token.
        router.push({
          pathname: isStaff ? "/sticker-tag" : "/tag-preview",
          params: { stickerLineNumber: result.stickerLineNumber },
        });
        return;
      }
```

`isStaff` is already in the hook's closure and its dependency array, so no other change is needed.

- [ ] **Step 7: Regenerate typed routes, typecheck and lint**

Expo generates the typed-routes declaration on the next dev-server start. If `tsc` rejects `"/sticker-tag"` as an unknown route, start the dev server once to regenerate `.expo/types/router.d.ts`, stop it, then re-run:

```bash
npx tsc --noEmit
npx eslint src/screens/staff src/app/sticker-tag.tsx src/app/_layout.tsx src/hooks/useQrScanLauncher.tsx
```

Expected: exit 0, no lint errors. If `receipt-outline` is rejected by the `IoniconsTypes` union, use `document-text-outline`.

- [ ] **Step 8: Run the full suite**

```bash
npm test
```

Expected: the Task 1 and Task 5 tests pass, the calculator suite still passes, and the only failures are the four pre-existing `src/components/__tests__/` load errors.

- [ ] **Step 9: Commit**

```bash
git add src/screens/staff src/app/sticker-tag.tsx src/app/_layout.tsx src/hooks/useQrScanLauncher.tsx src/localization/resources/en-US.json src/localization/resources/tr-TR.json
git commit -m "feat(sticker): staff create a tag from a scanned sticker"
```

---

### Task 9: Widen the scanner copy and record the state

**Files:**
- Modify: `src/localization/resources/en-US.json`
- Modify: `src/localization/resources/tr-TR.json`
- Modify: `QR_FEATURE_CHECKLIST.md`

- [ ] **Step 1: Widen the traveller scanner subtitle**

`Qr.ScanTagSubtitleStaff` already reads "tax-free tag or sticker QR code" and is now accurate rather than aspirational — leave it. The traveller subtitle no longer covers what a traveller can scan.

In `src/localization/resources/en-US.json`:

```json
    "ScanTagSubtitle": "Point your camera at a tax-free tag, store sticker, or airport QR code",
```

In `src/localization/resources/tr-TR.json`:

```json
    "ScanTagSubtitle": "Kameranızı bir vergi iadesi etiketine, mağaza etiketine veya havalimanı QR koduna doğrultun",
```

- [ ] **Step 2: Record the delivered state**

Append to `QR_FEATURE_CHECKLIST.md`:

```markdown
## Phase 5 — Sticker QR flows (2026-07-29)
Design: `docs/superpowers/specs/2026-07-29-sticker-qr-scan-flows-design.md`
Plan: `docs/superpowers/plans/2026-07-29-sticker-qr-scan-flows.md`

- [x] `classifyScan` returns `kind: "sticker"` for a slug carrying only `s`. A slug with tag fields *and* `s` stays `tag`; a bare number stays `unknown` (mobile has no wedge scanner, unlike the web page).
- [x] Sticker actions in `src/actions/TagService/`: `getStickerLineByNumber`, `getStickerLineMerchantInfo`, `getMerchantsForTagCreation`, `getPublicTagByStickerLineNumber`, `postTagByStickerLine`. No SDK regeneration was needed.
- [x] Traveller / logged-out: sticker → `/tag-preview`, resolved anonymously by sticker line number, with a dedicated "no tag on this sticker yet" state.
- [x] Calculator moved to `src/screens/shared/_components/tag-calculator/`; `SignaturePads` gained `targets`; `useMerchantId` moved to `src/hooks/`.
- [x] Staff: sticker → `/sticker-tag`. Merchant resolved from the sticker line (allocated read-only / merchant-is-self / refund-point picker), required invoice number, optional traveller, traveller signature, `POST /tag/by-sticker-line`.
- [x] A sticker that already carries a tag opens that tag instead of a create form.
- [ ] Native verification on device: scan a printed sticker as a merchant, as a refund point (allocated and unallocated books), and as a traveller.
```

- [ ] **Step 3: Final verification**

```bash
npx tsc --noEmit
npm run lint
npm test
```

Expected: `tsc` exit 0. `npm run lint` clean, or only pre-existing warnings in files this plan never touched. `npm test` shows the Task 1 and Task 5 additions passing and no new failures beyond the four known `src/components/__tests__/` load errors.

- [ ] **Step 4: Commit**

```bash
git add src/localization/resources/en-US.json src/localization/resources/tr-TR.json QR_FEATURE_CHECKLIST.md
git commit -m "docs(qr): widen scanner copy and record the sticker flows"
```

---

## Not verifiable in this environment

State these plainly rather than claiming them:

- **Camera scanning of a real printed sticker.** `expo-camera` is native; a Metro bundle proves it compiles, not that it decodes.
- **The backend's behaviour on an unallocated book.** Whether a Refund Point's pick allocates correctly, and whether a mismatched merchant is rejected, can only be confirmed against a real tenant.
- **Whether the refund-point role actually holds `TagService.Tags.CreateByStickerLine`** in any given tenant. The UI degrades to an explained disabled state if not, which is the designed behaviour, but the grant itself is a backend configuration question.

# Role-aware QR Scan (Three Flows) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the QR scanner handle three flows role-aware — draft tag → claim (traveller) / assign-to-traveller (staff), issued tag → details, airport validation QR → validate (travellers only) — and enforce role-scoped tag endpoints (travellers cross-tenant, staff tenant-scoped).

**Architecture:** Extend the existing scan hub rather than split by role. `classifyScan` is unchanged; `useQrScanLauncher` gains a validate role-gate; `TagPreviewScreen` becomes the role×kind decision hub; a new `SearchTraveller` picker (search + MRZ + KYC camera) feeds the staff assign endpoint. Separately, the authenticated tag list + detail path becomes role-scoped.

**Tech Stack:** Expo Router, React Native 0.81, TypeScript, Zustand, NativeWind, `@gorhom/bottom-sheet`, `expo-camera`, `react-native-vision-camera` (existing `QrScanner`), on-device MRZ (`rn-mlkit-ocr` + `mrz`), generated OpenAPI SDK under `src/saas/**`, jest (babel-jest, node env).

## Global Constraints

- **API boundary:** Never call `src/saas/**` SDK clients from screens/components/hooks. Add/reuse wrappers under `src/actions/**` (`.claude/rules/api-actions.md`). Do not edit `src/saas/**` (generated).
- **i18n:** No hardcoded user-visible text. Add keys to `src/localization/resources/{en-US,tr-TR}.json` and read via `useLocalization().t("MobileApp.<...>")`. After editing resources, run `npm run init`. Never edit `src/data/language-data/*.gen.json`.
- **useEffect:** Avoid by default; prefer derived state / event handlers (`.claude/rules/avoid-use-effect.md`). Data-fetch-on-mount effects with cleanup are acceptable (existing pattern).
- **UI:** Reuse `src/components/**` primitives (`Button`, `Input`, `BottomSheet`, `CountryInput`, `PhoneInput`, `Ionicons`, `Image`) and NativeWind semantic tokens. Use `@gorhom/bottom-sheet` for sheets.
- **Role invariant (hard):** Travellers must NEVER call tenant-scoped tag endpoints; staff (merchant OR refund-point) are ALWAYS tenant-scoped. A tag scanned without auth may use the public read.
- **Draft rule:** A tag is claimable only when `status === "Draft"` AND no traveller is attached. Any mismatch is "divergent" and surfaced as an error.
- **Validation:** Airport validation is travellers-only.
- **Residence:** `residenceCountryCode3` prefills from nationality when not otherwise known (no blocking confirm form).
- **Test run:** `npx jest <path>` (node env; only pure-logic modules are unit-tested — do not import RN/native modules into tested files).
- **Node:** `>=20`.

---

## File Structure

**Create:**
- `src/utils/traveller.ts` — pure mappers producing `TravellerRequestDto` from a search-doc / KYC result / MRZ info.
- `src/utils/__tests__/tag.test.ts` — tests for `deriveTagKind`, `tagScopeForRole`.
- `src/utils/__tests__/traveller.test.ts` — tests for the mappers.
- `src/actions/KYCService/post.ts` — `verifyIdByPhoto` wrapper (file already exists from SDK scaffolding; add the function).
- `src/screens/shared/_components/ScanEntry.tsx` — shared scan CTA + `QrScanner`.
- `src/screens/shared/_components/SearchTraveller/SearchTraveller.tsx` — the staff traveller picker.
- `src/screens/shared/_components/SearchTraveller/KycCameraModal.tsx` — KYC verify-by-photo capture.

**Modify:**
- `src/utils/tag.ts` — add `deriveTagKind`, `tagScopeForRole`.
- `src/actions/lib.ts` — add `getKycServiceClient`.
- `src/actions/TagService/actions.ts` — add `getTenantTags`; refactor `getFullTagDetailById` → `getFullTagDetail`.
- `src/hooks/useLoadTags.tsx` — role-aware fetch.
- `src/store/tag.ts` — widen `TagListItem` type + `setTags` param.
- `src/hooks/useQrScanLauncher.tsx` — validate role-gate.
- `src/screens/shared/TagPreviewScreen.tsx` — role×kind CTA + divergent + staff assign.
- `src/screens/shared/Tags/TagDetail/useTagDetail.tsx` — `{tagId,tagNumber,scope}` signature.
- `src/screens/shared/Tags/TagDetail/TagDetailScreen.tsx` — role scope + tagNumber prop.
- `src/app/(auth)/tags/[tagId].tsx` — read + pass `tagNumber`.
- `src/screens/shared/Tags/Tag/TagScreen.tsx` — pass `tagNumber` on navigate.
- `src/screens/shared/_components/LastestTag.tsx` — pass `tagNumber` on navigate.
- `src/screens/{traveller,merchant,refund-point}/Home/HomeScreen.tsx` — use `ScanEntry`.
- `src/localization/resources/{en-US,tr-TR}.json` — new keys.

---

## Phase 1 — Pure helpers & mappers (TDD)

### Task 1: `deriveTagKind` + `tagScopeForRole`

**Files:**
- Modify: `src/utils/tag.ts`
- Test: `src/utils/__tests__/tag.test.ts`

**Interfaces:**
- Consumes: `UniRefund_TagService_Tags_TagPublicDetailDto` from `@/saas/TagService`.
- Produces:
  - `type TagKind = "draft" | "issued" | "divergent"`
  - `deriveTagKind(tag: UniRefund_TagService_Tags_TagPublicDetailDto): TagKind`
  - `tagScopeForRole(u: { isMerchant?: boolean; isRefundPoint?: boolean }): "Staff" | "Traveller"`

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/tag.test.ts`:

```ts
import { deriveTagKind, tagScopeForRole } from "@/utils/tag";
import type { UniRefund_TagService_Tags_TagPublicDetailDto } from "@/saas/TagService";

function tag(
  status: string,
  travellerDocumentNumber?: string,
): UniRefund_TagService_Tags_TagPublicDetailDto {
  return {
    tagNumber: "T1",
    status: status as UniRefund_TagService_Tags_TagPublicDetailDto["status"],
    traveller: travellerDocumentNumber
      ? ({ travellerDocumentNumber } as UniRefund_TagService_Tags_TagPublicDetailDto["traveller"])
      : undefined,
  } as UniRefund_TagService_Tags_TagPublicDetailDto;
}

describe("deriveTagKind", () => {
  it("draft: status Draft and no traveller", () => {
    expect(deriveTagKind(tag("Draft"))).toBe("draft");
  });
  it("issued: owned and not Draft", () => {
    expect(deriveTagKind(tag("Issued", "P123"))).toBe("issued");
  });
  it("issued: any downstream owned status", () => {
    expect(deriveTagKind(tag("Paid", "P123"))).toBe("issued");
  });
  it("divergent: Draft but owned", () => {
    expect(deriveTagKind(tag("Draft", "P123"))).toBe("divergent");
  });
  it("divergent: unowned but not Draft", () => {
    expect(deriveTagKind(tag("Issued"))).toBe("divergent");
  });
});

describe("tagScopeForRole", () => {
  it("merchant -> Staff", () => {
    expect(tagScopeForRole({ isMerchant: true })).toBe("Staff");
  });
  it("refund-point -> Staff", () => {
    expect(tagScopeForRole({ isRefundPoint: true })).toBe("Staff");
  });
  it("traveller (neither) -> Traveller", () => {
    expect(tagScopeForRole({})).toBe("Traveller");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/utils/__tests__/tag.test.ts`
Expected: FAIL — `deriveTagKind`/`tagScopeForRole` are not exported.

- [ ] **Step 3: Add the implementation to `src/utils/tag.ts`**

Append to `src/utils/tag.ts`:

```ts
import type { UniRefund_TagService_Tags_TagPublicDetailDto } from "@/saas/TagService";

export type TagKind = "draft" | "issued" | "divergent";

/**
 * Canonical tag kind under the "both must agree" rule:
 *  - draft     → status "Draft" AND no traveller attached (claimable)
 *  - issued    → not "Draft" AND a traveller is attached (owned)
 *  - divergent → status/traveller mismatch (Draft-but-owned or unowned-not-Draft)
 */
export function deriveTagKind(
  tag: UniRefund_TagService_Tags_TagPublicDetailDto,
): TagKind {
  const hasTraveller = !!tag.traveller?.travellerDocumentNumber;
  const isDraftStatus = tag.status === "Draft";
  if (isDraftStatus && !hasTraveller) return "draft";
  if (!isDraftStatus && hasTraveller) return "issued";
  return "divergent";
}

/** Staff (merchant or refund-point) → tenant-scoped; everyone else → cross-tenant. */
export function tagScopeForRole(u: {
  isMerchant?: boolean;
  isRefundPoint?: boolean;
}): "Staff" | "Traveller" {
  return u.isMerchant || u.isRefundPoint ? "Staff" : "Traveller";
}
```

Note: if `src/utils/tag.ts` already imports from `@/saas/TagService`, merge the import instead of adding a duplicate line.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/utils/__tests__/tag.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```
git add src/utils/tag.ts src/utils/__tests__/tag.test.ts
git commit -m "feat(tag): add deriveTagKind and tagScopeForRole helpers"
```

---

### Task 2: Traveller mappers → `TravellerRequestDto`

**Files:**
- Create: `src/utils/traveller.ts`
- Test: `src/utils/__tests__/traveller.test.ts`

**Interfaces:**
- Consumes:
  - `UniRefund_TagService_Travellers_TravellerRequestDto` from `@/saas/TagService`
  - `UniRefund_TravellerService_Travellers_TravellerSearchResultDto`, `UniRefund_TravellerService_TravellerDocuments_TravellerDocumentDto` from `@/saas/TravellerService`
  - `UniRefund_KYCService_IdVerifications_IdVerificationByPhotoResultDto` from `@/saas/KYCService`
- Produces:
  - `type MrzInfo = { documentNumber: string; name: string; lastName: string; nationality: string; residenceCountry: string; expirationDate: string; birthDate: string }`
  - `travellerFromSearchDoc(traveller, doc): TravellerRequestDto`
  - `travellerFromKycResult(result): TravellerRequestDto | null`
  - `travellerFromMrzInfo(info): TravellerRequestDto`

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/traveller.test.ts`:

```ts
import {
  travellerFromKycResult,
  travellerFromMrzInfo,
  travellerFromSearchDoc,
} from "@/utils/traveller";

describe("travellerFromSearchDoc", () => {
  it("maps a selected document + residence to a request DTO", () => {
    const result = travellerFromSearchDoc(
      { id: "trv-1", residences: [{ residenceCountryCode3: "DEU" }] } as any,
      {
        travellerDocumentNumber: "P123",
        nationalityCountryCode3: "TUR",
        firstName: "Anna",
        lastName: "Eriksson",
        expirationDate: "2030-01-01",
        birthDate: "1990-01-01",
      } as any,
    );
    expect(result).toEqual({
      id: "trv-1",
      travellerDocumentNumber: "P123",
      nationalityCountryCode3: "TUR",
      firstName: "Anna",
      lastName: "Eriksson",
      residenceCountryCode3: "DEU",
      expirationDate: "2030-01-01",
      birthDate: "1990-01-01",
    });
  });

  it("falls back residence to nationality when no residence row", () => {
    const result = travellerFromSearchDoc(
      { id: "trv-2", residences: [] } as any,
      {
        travellerDocumentNumber: "P9",
        nationalityCountryCode3: "FRA",
        firstName: "Jean",
        lastName: "Dupont",
      } as any,
    );
    expect(result.residenceCountryCode3).toBe("FRA");
  });
});

describe("travellerFromKycResult", () => {
  it("maps KYC fields; residence defaults to nationality", () => {
    const result = travellerFromKycResult({
      firstName: "Anna",
      lastName: "Eriksson",
      nationality: "TUR",
      documentNumber: "P123",
      expirationDate: "2030-01-01",
      dateOfBirth: "1990-01-01",
    } as any);
    expect(result).toEqual({
      travellerDocumentNumber: "P123",
      nationalityCountryCode3: "TUR",
      firstName: "Anna",
      lastName: "Eriksson",
      residenceCountryCode3: "TUR",
      expirationDate: "2030-01-01",
      birthDate: "1990-01-01",
    });
  });

  it("uses mrz fallbacks and returns null without a document number", () => {
    expect(
      travellerFromKycResult({ mrz: { documentNumber: "" } } as any),
    ).toBeNull();
  });
});

describe("travellerFromMrzInfo", () => {
  it("maps on-device MRZ info; residence defaults to nationality", () => {
    const result = travellerFromMrzInfo({
      documentNumber: "P123",
      name: "Anna",
      lastName: "Eriksson",
      nationality: "TUR",
      residenceCountry: "TUR",
      expirationDate: "2030-01-01",
      birthDate: "1990-01-01",
    });
    expect(result).toEqual({
      travellerDocumentNumber: "P123",
      nationalityCountryCode3: "TUR",
      firstName: "Anna",
      lastName: "Eriksson",
      residenceCountryCode3: "TUR",
      expirationDate: "2030-01-01",
      birthDate: "1990-01-01",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/utils/__tests__/traveller.test.ts`
Expected: FAIL — module `@/utils/traveller` not found.

- [ ] **Step 3: Create `src/utils/traveller.ts`**

```ts
import type { UniRefund_TagService_Travellers_TravellerRequestDto } from "@/saas/TagService";
import type {
  UniRefund_TravellerService_TravellerDocuments_TravellerDocumentDto,
  UniRefund_TravellerService_Travellers_TravellerSearchResultDto,
} from "@/saas/TravellerService";
import type { UniRefund_KYCService_IdVerifications_IdVerificationByPhotoResultDto } from "@/saas/KYCService";

type TravellerRequestDto =
  UniRefund_TagService_Travellers_TravellerRequestDto;

/** Shape returned by `getInformationFromMrz` (on-device MRZ read). */
export type MrzInfo = {
  documentNumber: string;
  name: string;
  lastName: string;
  nationality: string;
  residenceCountry: string;
  expirationDate: string;
  birthDate: string;
};

/** Selected search-result document (+ its traveller) → request DTO. */
export function travellerFromSearchDoc(
  traveller: UniRefund_TravellerService_Travellers_TravellerSearchResultDto,
  doc: UniRefund_TravellerService_TravellerDocuments_TravellerDocumentDto,
): TravellerRequestDto {
  const residence = traveller.residences?.[0]?.residenceCountryCode3;
  return {
    id: traveller.id,
    travellerDocumentNumber: doc.travellerDocumentNumber,
    nationalityCountryCode3: doc.nationalityCountryCode3,
    firstName: doc.firstName,
    lastName: doc.lastName,
    residenceCountryCode3: residence || doc.nationalityCountryCode3,
    expirationDate: doc.expirationDate ?? undefined,
    birthDate: doc.birthDate ?? undefined,
  };
}

/** KYC verify-by-photo result → request DTO (null if no document number). */
export function travellerFromKycResult(
  data: UniRefund_KYCService_IdVerifications_IdVerificationByPhotoResultDto,
): TravellerRequestDto | null {
  const documentNumber = data.documentNumber || data.mrz?.documentNumber || "";
  if (!documentNumber.trim()) return null;
  const nationality = (data.nationality || data.mrz?.country || "").toUpperCase();
  return {
    travellerDocumentNumber: documentNumber,
    nationalityCountryCode3: nationality,
    firstName: data.firstName || data.mrz?.name || "",
    lastName: data.lastName || data.mrz?.surname || "",
    residenceCountryCode3: nationality,
    expirationDate: data.expirationDate ?? data.mrz?.expiryDate ?? undefined,
    birthDate: data.dateOfBirth ?? data.mrz?.birthDate ?? undefined,
  };
}

/** On-device MRZ info → request DTO (residence already defaults to nationality). */
export function travellerFromMrzInfo(info: MrzInfo): TravellerRequestDto {
  return {
    travellerDocumentNumber: info.documentNumber,
    nationalityCountryCode3: info.nationality,
    firstName: info.name,
    lastName: info.lastName,
    residenceCountryCode3: info.residenceCountry || info.nationality,
    expirationDate: info.expirationDate || undefined,
    birthDate: info.birthDate || undefined,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/utils/__tests__/traveller.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```
git add src/utils/traveller.ts src/utils/__tests__/traveller.test.ts
git commit -m "feat(traveller): add search/KYC/MRZ -> TravellerRequestDto mappers"
```

---

## Phase 2 — Actions & role-scoped endpoints

### Task 3: KYC client + verify-by-photo action — ALREADY DONE (verify only)

> This task is already implemented in the branch WIP:
> - `src/actions/lib.ts` exports `getKYCServiceClient(customHeaders?)` (uppercase KYC, matching the `getCRMServiceClient` precedent).
> - `src/actions/KYCService/post.ts` exports `postApiKycServiceIdVerificationsVerifyByPhoto(data)` where `data` is the `VerifyIdByPhotoDto` request body (`{ frontImageBase64, backImageBase64? }`), returning `IdVerificationByPhotoResultDto`.
>
> Do NOT re-add or rename these. Downstream tasks consume `postApiKycServiceIdVerificationsVerifyByPhoto` (Task 9). If `npm run typecheck` passes for these files, this task is complete.

**Files:**
- Verify only: `src/actions/lib.ts`, `src/actions/KYCService/post.ts`

**Interfaces:**
- Produces (existing):
  - `getKYCServiceClient(customHeaders?): Promise<KYCServiceClient>` (lib.ts)
  - `postApiKycServiceIdVerificationsVerifyByPhoto(data: { frontImageBase64: string; backImageBase64?: string }): Promise<UniRefund_KYCService_IdVerifications_IdVerificationByPhotoResultDto>`

- [ ] **Step 1: Add `getKycServiceClient` to `src/actions/lib.ts`**

Add the import near the other service-client imports:

```ts
import { KYCServiceClient } from "@/saas/KYCService";
```

Add the factory (mirrors the existing factories) at the end of the file:

```ts
export async function getKycServiceClient(
  customHeaders?: Record<string, string>,
) {
  const accessToken = (await getToken("access")) || undefined;
  const API_URL = await getApiUrl();

  return new KYCServiceClient({
    TOKEN: accessToken,
    BASE: API_URL,
    HEADERS: { ...HEADERS, ...customHeaders },
  });
}
```

- [ ] **Step 2: Add the wrapper to `src/actions/KYCService/post.ts`**

Replace the contents of `src/actions/KYCService/post.ts` with:

```ts
import { UniRefund_KYCService_IdVerifications_IdVerificationByPhotoResultDto } from "@/saas/KYCService";
import { fetchRequest } from "@/utils/customFetch";
import { getKycServiceClient } from "../lib";

/**
 * Verify an identity document from a captured front image (Base64). Returns the
 * parsed/verified document data (name, nationality, document number, MRZ, …).
 */
export async function verifyIdByPhoto(
  frontImageBase64: string,
): Promise<UniRefund_KYCService_IdVerifications_IdVerificationByPhotoResultDto> {
  return await fetchRequest(async (customHeaders) => {
    const client = await getKycServiceClient(customHeaders);
    return await client.idVerification.postApiKycServiceIdVerificationsVerifyByPhoto(
      { requestBody: { frontImageBase64 } },
    );
  }, "verifyIdByPhoto");
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no new errors from these files).

- [ ] **Step 4: Commit**

```
git add src/actions/lib.ts src/actions/KYCService/post.ts
git commit -m "feat(kyc): add KYC service client + verifyIdByPhoto action"
```

---

### Task 4: Tenant-scoped tag list action

**Files:**
- Modify: `src/actions/TagService/actions.ts`

**Interfaces:**
- Produces: `getTenantTags(data?: GetApiTagServiceTagData): Promise<TagListResponseDto_TagListItemDto>`

- [ ] **Step 1: Add `getTenantTags` to `src/actions/TagService/actions.ts`**

Add the import type at the top (merge into the existing `@/saas/TagService` import):

```ts
import { GetApiTagServiceTagData } from "@/saas/TagService";
```

Add the function below `getTags`:

```ts
/**
 * Tenant-scoped tag list for staff (merchant / refund-point). Travellers must
 * use `getTags` (cross-tenant) instead — see the role invariant.
 */
export async function getTenantTags(data?: GetApiTagServiceTagData) {
  return await fetchRequest(async (customHeaders) => {
    const client = await getTagServiceClient(customHeaders);
    return await client.tag.getApiTagServiceTag(data);
  }, "getTenantTags");
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```
git add src/actions/TagService/actions.ts
git commit -m "feat(tag): add tenant-scoped getTenantTags list action"
```

---

### Task 5: Role-scoped tag detail (`getFullTagDetail`)

**Files:**
- Modify: `src/actions/TagService/actions.ts`
- Modify: `src/screens/shared/Tags/TagDetail/useTagDetail.tsx`
- Modify: `src/screens/shared/Tags/TagDetail/TagDetailScreen.tsx`
- Modify: `src/app/(auth)/tags/[tagId].tsx`
- Modify: `src/screens/shared/Tags/Tag/TagScreen.tsx`
- Modify: `src/screens/shared/_components/LastestTag.tsx`

**Interfaces:**
- Consumes: `tagScopeForRole` (Task 1), `getOwnedTagByTagNumber`, `getTagDetailsById` (existing).
- Produces: `getFullTagDetail(args: { tagId?: string; tagNumber?: string; scope: "Traveller" | "Staff" }): Promise<TagDetailData | undefined>`

- [ ] **Step 1: Replace `getFullTagDetailById` in `src/actions/TagService/actions.ts`**

Replace the whole `getFullTagDetailById` function (currently at the end of the file) with:

```ts
/**
 * Role-scoped full tag detail.
 *  - Traveller → authed CROSS-TENANT read by tag number (never tenant-scoped).
 *  - Staff     → TENANT-scoped read by tag id.
 */
export async function getFullTagDetail(args: {
  tagId?: string;
  tagNumber?: string;
  scope: "Traveller" | "Staff";
}): Promise<TagDetailData | undefined> {
  if (args.scope === "Traveller") {
    if (!args.tagNumber) return undefined;
    const tagDetail = await getOwnedTagByTagNumber(args.tagNumber);
    if (!tagDetail) return undefined;
    return { tagDetail };
  }
  if (!args.tagId) return undefined;
  const tagDetail = await getTagDetailsById(args.tagId);
  if (!tagDetail) return undefined;
  return { tagDetail };
}
```

Keep the `TODO(timeline)` comment block by moving it above `getFullTagDetail` (it documents the disabled VAT/refund enrichment for the staff detail — no behavior change).

- [ ] **Step 2: Update `src/screens/shared/Tags/TagDetail/useTagDetail.tsx`**

Replace the file with:

```tsx
"use client";

import { getFullTagDetail } from "@/actions/TagService/actions";
import { TagDetailData } from "@/actions/TagService/types";
import { logger } from "@/utils/logger";
import { useEffect, useState } from "react";

export function useTagDetail(args: {
  tagId: string;
  tagNumber?: string;
  scope: "Traveller" | "Staff";
}) {
  const { tagId, tagNumber, scope } = args;
  const [tagDetail, setTagDetail] = useState<TagDetailData>(undefined);
  useEffect(() => {
    let mounted = true;
    async function fetchTagDetail() {
      if (!tagId && !tagNumber) return;
      const data = await getFullTagDetail({ tagId, tagNumber, scope });
      if (!mounted) return;
      setTagDetail(data ?? undefined);
    }
    fetchTagDetail();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagId, tagNumber, scope]);

  return tagDetail;
}
```

- [ ] **Step 3: Update `src/screens/shared/Tags/TagDetail/TagDetailScreen.tsx`**

Change the component signature and the `useTagDetail` call. Replace:

```tsx
function TagDetailScreen({ tagId }: { tagId: string }) {
  const { t } = useLocalization();
  const { isMerchant } = useUserStore();
  const backAction = useCallback(() => {
    router.replace("/(auth)/tags");
  }, []);
  const tagDetailData = useTagDetail(
    tagId,
    isMerchant ? "Merchant" : "Traveller",
  );
```

with:

```tsx
function TagDetailScreen({
  tagId,
  tagNumber,
}: {
  tagId: string;
  tagNumber?: string;
}) {
  const { t } = useLocalization();
  const { isMerchant, isRefundPoint } = useUserStore();
  const scope = tagScopeForRole({ isMerchant, isRefundPoint });
  const backAction = useCallback(() => {
    router.replace("/(auth)/tags");
  }, []);
  const tagDetailData = useTagDetail({ tagId, tagNumber, scope });
```

Add the import at the top:

```tsx
import { tagScopeForRole } from "@/utils/tag";
```

(The `MerchantAction` print button stays gated on `isMerchant` — unchanged.)

- [ ] **Step 4: Update the route `src/app/(auth)/tags/[tagId].tsx`**

Replace the file with:

```tsx
import TagDetailScreen from "@/screens/shared/Tags/TagDetail/TagDetailScreen";
import { useLocalSearchParams } from "expo-router";

export default function TagDetailPage() {
  const { tagId, tagNumber } = useLocalSearchParams<{
    tagId: string;
    tagNumber?: string;
  }>();
  return <TagDetailScreen tagId={tagId} tagNumber={tagNumber} />;
}
```

- [ ] **Step 5: Pass `tagNumber` when navigating from the list**

In `src/screens/shared/Tags/Tag/TagScreen.tsx`, replace the `onPress` navigation:

```tsx
onPress={() => {
  router.push(`/(auth)/tags/${tag?.id}`);
}}
```

with:

```tsx
onPress={() => {
  router.push({
    pathname: "/(auth)/tags/[tagId]",
    params: { tagId: tag.id, tagNumber: tag.tagNumber },
  });
}}
```

In `src/screens/shared/_components/LastestTag.tsx`, replace:

```tsx
onPress={() => {
  router.push(`/(auth)/tags/${lastTag?.id}`);
}}
```

with:

```tsx
onPress={() => {
  router.push({
    pathname: "/(auth)/tags/[tagId]",
    params: { tagId: lastTag.id, tagNumber: lastTag.tagNumber },
  });
}}
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (If any other caller referenced `getFullTagDetailById`, update it to `getFullTagDetail`; grep first: `npx jest --listTests` is not needed — use editor search for `getFullTagDetailById`.)

- [ ] **Step 7: Commit**

```
git add src/actions/TagService/actions.ts src/screens/shared/Tags/TagDetail/useTagDetail.tsx src/screens/shared/Tags/TagDetail/TagDetailScreen.tsx "src/app/(auth)/tags/[tagId].tsx" src/screens/shared/Tags/Tag/TagScreen.tsx src/screens/shared/_components/LastestTag.tsx
git commit -m "feat(tag): role-scoped tag detail (traveller cross-tenant by number, staff tenant by id)"
```

---

### Task 6: Role-aware tag list load

**Files:**
- Modify: `src/store/tag.ts`
- Modify: `src/hooks/useLoadTags.tsx`

**Interfaces:**
- Consumes: `tagScopeForRole` (Task 1), `getTags` + `getTenantTags` (Task 4), `useUserStore`.
- Produces: `loadTags(silent?: boolean)` unchanged signature; store `tags` widened.

- [ ] **Step 1: Widen the store item type in `src/store/tag.ts`**

Replace the imports + `TagListItem` type:

```ts
import {
  UniRefund_TagService_Tags_TagDetailDto,
  UniRefund_TagService_Tags_TagListItemDto,
  UniRefund_TagService_Tags_TagListItemForTravellerCrossTenantsDto,
} from "@/saas/TagService";
import { create } from "zustand";

type TagListItem =
  | UniRefund_TagService_Tags_TagListItemForTravellerCrossTenantsDto
  | UniRefund_TagService_Tags_TagListItemDto;
```

Replace `setTags`'s signature in the interface:

```ts
  setTags: (
    data:
      | { items?: TagListItem[] | null; totalCount?: number }
      | undefined,
  ) => void;
```

The `setTags` implementation body (`tags: data?.items ?? []`, `tagCount: ...`) is unchanged.

- [ ] **Step 2: Make `loadTags` role-aware in `src/hooks/useLoadTags.tsx`**

Replace the imports and the fetch line:

```tsx
import { getTags, getTenantTags } from "@/actions/TagService/actions";
import useTagStore from "@/store/tag";
import useUserStore from "@/store/user";
import { tagScopeForRole } from "@/utils/tag";
import { logger } from "@/utils/logger";
import { useEffect } from "react";
```

Inside `loadTags`, replace:

```tsx
  inFlight = getTags({ sorting: "issueDate desc", maxResultCount: 100 })
```

with:

```tsx
  const { isMerchant, isRefundPoint } = useUserStore.getState();
  const scope = tagScopeForRole({ isMerchant, isRefundPoint });
  const query = { sorting: "issueDate desc", maxResultCount: 100 } as const;
  const request =
    scope === "Staff" ? getTenantTags(query) : getTags(query);
  inFlight = request
```

(The `.then((res) => { ...setTags(res); })` chain is unchanged — both responses expose `items`/`totalCount`.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Manual verification**

Run the app (`npm run android` or `npm run ios`). Log in as a traveller → Tags tab loads (cross-tenant). Log in as a merchant and as a refund-point → Tags tab loads tenant tags (no cross-tenant call). Confirm via the network log / `logger.debug("[loadTags] loaded …")`.

- [ ] **Step 5: Commit**

```
git add src/store/tag.ts src/hooks/useLoadTags.tsx
git commit -m "feat(tag): role-aware tag list load (traveller cross-tenant, staff tenant-scoped)"
```

---

## Phase 3 — i18n + scan routing & preview

### Task 7: Localization keys

**Files:**
- Modify: `src/localization/resources/en-US.json`
- Modify: `src/localization/resources/tr-TR.json`

- [ ] **Step 1: Add keys to `en-US.json`**

Under `Qr`, add `"ValidateStaffBlocked"` and extend `Qr.TagPreview`, plus new `Qr.SearchTraveller` and `Qr.Kyc` groups:

```json
    "ValidateStaffBlocked": "Airport validation is available to travellers only.",
```

Extend the `Qr.TagPreview` object with:

```json
      "AssignTraveller": "Assign to a traveller",
      "AssignSuccess": "Tag assigned to the traveller.",
      "AssignError": "Could not assign this tag. Please try again.",
      "ViewDetails": "View tag details",
      "DivergentTitle": "This tag can't be used",
      "DivergentInfo": "This tag's status and traveller don't match. Please contact support."
```

Add these groups alongside `Qr.TagPreview` / `Qr.Validate`:

```json
    "SearchTraveller": {
      "Title": "Find traveller",
      "SearchTab": "Search",
      "ScanTab": "Scan",
      "MethodDocument": "Document no.",
      "MethodEmail": "Email",
      "MethodPhone": "Phone",
      "SearchButton": "Search",
      "PlaceholderDocument": "Passport / document number",
      "PlaceholderEmail": "traveller@email.com",
      "PlaceholderPhone": "Phone number",
      "NoResults": "No matching traveller found.",
      "ResultsTitle": "Select a document",
      "ScanPassport": "Scan passport (MRZ)",
      "ScanCamera": "Scan & verify (camera)",
      "MrzError": "Couldn't read the passport. Please try again.",
      "Cancel": "Cancel"
    },
    "Kyc": {
      "Verifying": "Verifying document…",
      "Failed": "Verification failed. Please try again.",
      "NoData": "No document data found. Please retake.",
      "Capture": "Capture",
      "Retake": "Retake",
      "PermissionTitle": "Camera access needed",
      "PermissionDescription": "Allow camera access to scan the document.",
      "PermissionAllow": "Allow camera",
      "Warnings": "Verification raised warnings — review before assigning."
    }
```

- [ ] **Step 2: Add the same keys to `tr-TR.json`**

Mirror the structure with Turkish copy:

```json
    "ValidateStaffBlocked": "Havalimanı doğrulaması yalnızca yolcular içindir.",
```

`Qr.TagPreview` additions:

```json
      "AssignTraveller": "Yolcuya ata",
      "AssignSuccess": "Etiket yolcuya atandı.",
      "AssignError": "Bu etiket atanamadı. Lütfen tekrar deneyin.",
      "ViewDetails": "Etiket detaylarını gör",
      "DivergentTitle": "Bu etiket kullanılamaz",
      "DivergentInfo": "Etiketin durumu ve yolcusu uyuşmuyor. Lütfen destek ile iletişime geçin."
```

New groups:

```json
    "SearchTraveller": {
      "Title": "Yolcu bul",
      "SearchTab": "Ara",
      "ScanTab": "Tara",
      "MethodDocument": "Belge no.",
      "MethodEmail": "E-posta",
      "MethodPhone": "Telefon",
      "SearchButton": "Ara",
      "PlaceholderDocument": "Pasaport / belge numarası",
      "PlaceholderEmail": "yolcu@eposta.com",
      "PlaceholderPhone": "Telefon numarası",
      "NoResults": "Eşleşen yolcu bulunamadı.",
      "ResultsTitle": "Bir belge seçin",
      "ScanPassport": "Pasaport tara (MRZ)",
      "ScanCamera": "Tara ve doğrula (kamera)",
      "MrzError": "Pasaport okunamadı. Lütfen tekrar deneyin.",
      "Cancel": "İptal"
    },
    "Kyc": {
      "Verifying": "Belge doğrulanıyor…",
      "Failed": "Doğrulama başarısız. Lütfen tekrar deneyin.",
      "NoData": "Belge verisi bulunamadı. Lütfen tekrar çekin.",
      "Capture": "Çek",
      "Retake": "Tekrar çek",
      "PermissionTitle": "Kamera erişimi gerekli",
      "PermissionDescription": "Belgeyi taramak için kamera erişimine izin verin.",
      "PermissionAllow": "Kameraya izin ver",
      "Warnings": "Doğrulama uyarılar üretti — atamadan önce inceleyin."
    }
```

- [ ] **Step 3: Regenerate language bundles**

Run: `npm run init`
Expected: `src/data/language-data/{en-US,tr-TR}.gen.json` regenerated with the new keys merged under `MobileApp`.

- [ ] **Step 4: Commit**

```
git add src/localization/resources/en-US.json src/localization/resources/tr-TR.json src/data/language-data/en-US.gen.json src/data/language-data/tr-TR.gen.json
git commit -m "i18n: add QR staff-assign / validation-blocked / picker keys"
```

---

### Task 8: Validate role-gate in `useQrScanLauncher`

**Files:**
- Modify: `src/hooks/useQrScanLauncher.tsx`

**Interfaces:**
- Consumes: `useUserStore`, `classifyScan` (existing).
- Produces: unchanged return `{ visible, open, close, onScanned }`.

- [ ] **Step 1: Add the role-gate**

In `src/hooks/useQrScanLauncher.tsx`, add the store import:

```tsx
import useUserStore from "@/store/user";
```

Read role flags in the hook body (after `toastRef`):

```tsx
  const { isMerchant, isRefundPoint } = useUserStore();
  const isStaff = isMerchant || isRefundPoint;
```

In `onScanned`, replace the `validate` branch:

```tsx
      if (result.kind === "validate") {
        router.push({
          pathname: "/validate",
          params: { qrValue: result.qrValue },
        });
        return;
      }
```

with:

```tsx
      if (result.kind === "validate") {
        if (isStaff) {
          toastRef.current?.show(
            "error",
            t("MobileApp.Qr.ValidateStaffBlocked"),
          );
          return;
        }
        router.push({
          pathname: "/validate",
          params: { qrValue: result.qrValue },
        });
        return;
      }
```

Add `isStaff` to the `useCallback` dependency array for `onScanned` (append it to `[t, toastRef]` → `[t, toastRef, isStaff]`).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Manual verification**

As a merchant/refund-point, scan an airport validate QR → error toast, no navigation. As a traveller, scan the same → `/validate` opens.

- [ ] **Step 4: Commit**

```
git add src/hooks/useQrScanLauncher.tsx
git commit -m "feat(qr): block staff from the traveller-only validation flow"
```

---

### Task 9: KYC camera capture modal

**Files:**
- Create: `src/screens/shared/_components/SearchTraveller/KycCameraModal.tsx`

**Interfaces:**
- Consumes: `postApiKycServiceIdVerificationsVerifyByPhoto` (existing, `@/actions/KYCService/post`), `travellerFromKycResult` (Task 2), `expo-camera`.
- Produces: `KycCameraModal` component:
  - Props: `{ visible: boolean; onClose: () => void; onResolved: (traveller: TravellerRequestDto) => void }`

- [ ] **Step 1: Create the component**

```tsx
import Button from "@/components/Button";
import { Ionicons } from "@/components/Ionicons";
import { useLocalization } from "@/providers/LocalizationProvider";
import { useToastRef } from "@/providers/ToastProvider";
import { postApiKycServiceIdVerificationsVerifyByPhoto } from "@/actions/KYCService/post";
import type { UniRefund_TagService_Travellers_TravellerRequestDto } from "@/saas/TagService";
import { travellerFromKycResult } from "@/utils/traveller";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Modal, Text, View } from "react-native";

type TravellerRequestDto =
  UniRefund_TagService_Travellers_TravellerRequestDto;

export function KycCameraModal({
  visible,
  onClose,
  onResolved,
}: {
  visible: boolean;
  onClose: () => void;
  onResolved: (traveller: TravellerRequestDto) => void;
}) {
  const { t } = useLocalization();
  const toastRef = useToastRef();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);

  const capture = useCallback(async () => {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.5,
      });
      if (!photo?.base64) {
        toastRef.current?.show("error", t("MobileApp.Qr.Kyc.Failed"));
        return;
      }
      const result = await postApiKycServiceIdVerificationsVerifyByPhoto({
        frontImageBase64: photo.base64,
      });
      if (result.warnings && result.warnings.length > 0) {
        toastRef.current?.show("error", t("MobileApp.Qr.Kyc.Warnings"));
      }
      const traveller = travellerFromKycResult(result);
      if (!traveller) {
        toastRef.current?.show("error", t("MobileApp.Qr.Kyc.NoData"));
        return;
      }
      onResolved(traveller);
    } catch {
      toastRef.current?.show("error", t("MobileApp.Qr.Kyc.Failed"));
    } finally {
      setBusy(false);
    }
  }, [busy, onResolved, t, toastRef]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-black">
        {!permission?.granted ? (
          <View className="flex-1 items-center justify-center gap-4 p-8">
            <Ionicons name="camera-outline" size={48} color="#fff" />
            <Text className="text-center text-white text-base">
              {t("MobileApp.Qr.Kyc.PermissionDescription")}
            </Text>
            <Button
              action={{
                onPress: requestPermission,
                label: t("MobileApp.Qr.Kyc.PermissionAllow"),
              }}
              containerClassName="w-full"
            />
            <Button
              action={{
                onPress: onClose,
                label: t("MobileApp.Qr.SearchTraveller.Cancel"),
              }}
              containerClassName="w-full bg-gray-200"
              textClassName="text-gray-800"
            />
          </View>
        ) : (
          <>
            <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
            <View className="absolute bottom-0 left-0 right-0 items-center gap-3 p-6">
              {busy ? (
                <View className="flex-row items-center gap-2">
                  <ActivityIndicator color="#fff" />
                  <Text className="text-white">
                    {t("MobileApp.Qr.Kyc.Verifying")}
                  </Text>
                </View>
              ) : (
                <Button
                  action={{ onPress: capture, label: t("MobileApp.Qr.Kyc.Capture") }}
                  containerClassName="w-48"
                />
              )}
              <Button
                action={{
                  onPress: onClose,
                  label: t("MobileApp.Qr.SearchTraveller.Cancel"),
                }}
                disabled={busy}
                containerClassName="w-48 bg-white/20"
              />
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}
```

Note: `Button` (`src/components/Button.tsx`) takes `action={{ onPress, label }}` (not children) plus optional `containerClassName`/`textClassName`/`isLoading`/`iconName`; there is no `variant` prop, so secondary styling is done via `containerClassName`/`textClassName` as shown. `disabled` passes through to the underlying `TouchableOpacity`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (after aligning `Button` usage with its real props).

- [ ] **Step 3: Commit**

```
git add src/screens/shared/_components/SearchTraveller/KycCameraModal.tsx
git commit -m "feat(kyc): add KYC verify-by-photo camera capture modal"
```

---

### Task 10: `SearchTraveller` picker

**Files:**
- Create: `src/screens/shared/_components/SearchTraveller/SearchTraveller.tsx`

**Interfaces:**
- Consumes: `getTravellerByDocumentNumber`/`getTravellerByEmail`/`getTravellerByPhoneNumber` (existing), `travellerFromSearchDoc`/`travellerFromMrzInfo` (Task 2), `scanDocument`+`getMrzDataFromDocument`+`getInformationFromMrz` (`@/utils/mrz/mrz-utils`), `parse` from `mrz`, `KycCameraModal` (Task 9), `BottomSheet` (`@/components/BottomSheet`).
- Produces: `SearchTraveller` component:
  - Props: `{ visible: boolean; onClose: () => void; onSelect: (traveller: TravellerRequestDto) => void; disabled?: boolean }`

- [ ] **Step 1: Create the component**

```tsx
import Button from "@/components/Button";
import { Ionicons, type IoniconsTypes } from "@/components/Ionicons";
import Input from "@/components/Input";
import {
  getTravellerByDocumentNumber,
  getTravellerByEmail,
  getTravellerByPhoneNumber,
} from "@/actions/TravellerService/actions";
import { useLocalization } from "@/providers/LocalizationProvider";
import { useToastRef } from "@/providers/ToastProvider";
import type { UniRefund_TagService_Travellers_TravellerRequestDto } from "@/saas/TagService";
import type {
  UniRefund_TravellerService_TravellerDocuments_TravellerDocumentDto,
  UniRefund_TravellerService_Travellers_TravellerSearchResultDto,
} from "@/saas/TravellerService";
import {
  getInformationFromMrz,
  getMrzDataFromDocument,
  scanDocument,
} from "@/utils/mrz/mrz-utils";
import { travellerFromMrzInfo, travellerFromSearchDoc } from "@/utils/traveller";
import { parse } from "mrz";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useCallback, useState } from "react";
import { KycCameraModal } from "./KycCameraModal";

type TravellerRequestDto =
  UniRefund_TagService_Travellers_TravellerRequestDto;
type SearchResult =
  UniRefund_TravellerService_Travellers_TravellerSearchResultDto;
type Method = "DocumentNumber" | "Email" | "PhoneNumber";

export function SearchTraveller({
  visible,
  onClose,
  onSelect,
  disabled,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (traveller: TravellerRequestDto) => void;
  disabled?: boolean;
}) {
  const { t } = useLocalization();
  const toastRef = useToastRef();
  const [method, setMethod] = useState<Method>("DocumentNumber");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [kycOpen, setKycOpen] = useState(false);

  const select = useCallback(
    (
      traveller: SearchResult,
      doc: UniRefund_TravellerService_TravellerDocuments_TravellerDocumentDto,
    ) => {
      onSelect(travellerFromSearchDoc(traveller, doc));
      setResults(null);
      setQuery("");
    },
    [onSelect],
  );

  const search = useCallback(async () => {
    if (!query.trim() || searching) return;
    setSearching(true);
    try {
      let list: SearchResult[] = [];
      if (method === "DocumentNumber") {
        list = (await getTravellerByDocumentNumber(query)) ?? [];
      } else if (method === "Email") {
        list = (await getTravellerByEmail(query)) ?? [];
      } else {
        list = (await getTravellerByPhoneNumber(query)) ?? [];
      }
      if (list.length === 0) {
        toastRef.current?.show(
          "error",
          t("MobileApp.Qr.SearchTraveller.NoResults"),
        );
        setResults(null);
        return;
      }
      if (list.length === 1 && list[0].travellerDocuments.length === 1) {
        select(list[0], list[0].travellerDocuments[0]);
        return;
      }
      setResults(list);
    } catch {
      toastRef.current?.show(
        "error",
        t("MobileApp.Qr.SearchTraveller.NoResults"),
      );
    } finally {
      setSearching(false);
    }
  }, [method, query, searching, select, t, toastRef]);

  const scanMrz = useCallback(async () => {
    try {
      const image = await scanDocument();
      if (!image) return;
      const mrzString = await getMrzDataFromDocument(image);
      if (!mrzString) {
        toastRef.current?.show("error", t("MobileApp.Qr.SearchTraveller.MrzError"));
        return;
      }
      const info = getInformationFromMrz(parse(mrzString));
      if (!info) {
        toastRef.current?.show("error", t("MobileApp.Qr.SearchTraveller.MrzError"));
        return;
      }
      onSelect(travellerFromMrzInfo(info));
    } catch {
      toastRef.current?.show("error", t("MobileApp.Qr.SearchTraveller.MrzError"));
    }
  }, [onSelect, t, toastRef]);

  const methods: { value: Method; label: string; icon: IoniconsTypes }[] = [
    { value: "DocumentNumber", label: t("MobileApp.Qr.SearchTraveller.MethodDocument"), icon: "document-text-outline" },
    { value: "Email", label: t("MobileApp.Qr.SearchTraveller.MethodEmail"), icon: "mail-outline" },
    { value: "PhoneNumber", label: t("MobileApp.Qr.SearchTraveller.MethodPhone"), icon: "call-outline" },
  ];
  const activeMethod = methods.find((m) => m.value === method) ?? methods[0];
  const placeholder =
    method === "Email"
      ? t("MobileApp.Qr.SearchTraveller.PlaceholderEmail")
      : method === "PhoneNumber"
        ? t("MobileApp.Qr.SearchTraveller.PlaceholderPhone")
        : t("MobileApp.Qr.SearchTraveller.PlaceholderDocument");

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-background p-4 gap-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-lg font-bold text-foreground">
            {t("MobileApp.Qr.SearchTraveller.Title")}
          </Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color="#374151" />
          </Pressable>
        </View>

        {/* Method segmented control */}
        <View className="flex-row gap-2">
          {methods.map((m) => (
            <Pressable
              key={m.value}
              onPress={() => {
                setMethod(m.value);
                setResults(null);
                setQuery("");
              }}
              className={
                "flex-1 rounded-xl border px-2 py-2 items-center " +
                (method === m.value
                  ? "border-primary bg-primary/10"
                  : "border-gray-300")
              }
            >
              <Text className="text-xs font-medium text-foreground">
                {m.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Query + search */}
        <Input
          title={activeMethod.label}
          iconName={activeMethod.icon}
          value={query}
          onChangeText={setQuery}
          placeholder={placeholder}
          autoCapitalize="none"
          onSubmitEditing={search}
        />
        <Button
          action={{
            onPress: search,
            label: t("MobileApp.Qr.SearchTraveller.SearchButton"),
          }}
          isLoading={searching}
          disabled={disabled || !query.trim()}
        />

        {/* Scan methods */}
        <View className="flex-row gap-2">
          <Button
            action={{
              onPress: scanMrz,
              label: t("MobileApp.Qr.SearchTraveller.ScanPassport"),
            }}
            disabled={disabled}
            containerClassName="flex-1 bg-gray-200"
            textClassName="text-gray-800 text-base"
          />
          <Button
            action={{
              onPress: () => setKycOpen(true),
              label: t("MobileApp.Qr.SearchTraveller.ScanCamera"),
            }}
            disabled={disabled}
            containerClassName="flex-1 bg-gray-200"
            textClassName="text-gray-800 text-base"
          />
        </View>

        {/* Results */}
        {results && (
          <ScrollView className="flex-1">
            <Text className="text-sm text-muted mb-2">
              {t("MobileApp.Qr.SearchTraveller.ResultsTitle")}
            </Text>
            {results.map((traveller) =>
              traveller.travellerDocuments.map((doc) => (
                <Pressable
                  key={`${traveller.id}-${doc.travellerDocumentNumber}`}
                  onPress={() => select(traveller, doc)}
                  className="rounded-xl border border-gray-200 p-3 mb-2"
                >
                  <Text className="font-semibold text-foreground">
                    {doc.firstName} {doc.lastName}
                  </Text>
                  <Text className="text-xs text-muted">
                    {doc.travellerDocumentNumber} · {doc.nationalityCountryCode3}
                  </Text>
                </Pressable>
              )),
            )}
          </ScrollView>
        )}

        <KycCameraModal
          visible={kycOpen}
          onClose={() => setKycOpen(false)}
          onResolved={(traveller) => {
            setKycOpen(false);
            onSelect(traveller);
          }}
        />
      </View>
    </Modal>
  );
}
```

Note: `Input` (`src/components/Input.tsx`) requires `title` and `iconName` and forwards the remaining `TextInput` props (`value`, `onChangeText`, `placeholder`, `autoCapitalize`, `onSubmitEditing`). `Button` uses `action={{ onPress, label }}` with `containerClassName`/`textClassName` for secondary styling (no `variant`).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS after aligning primitive props.

- [ ] **Step 3: Commit**

```
git add src/screens/shared/_components/SearchTraveller/SearchTraveller.tsx
git commit -m "feat(traveller): add SearchTraveller picker (search + MRZ + KYC camera)"
```

---

### Task 11: `TagPreviewScreen` role×kind CTA

**Files:**
- Modify: `src/screens/shared/TagPreviewScreen.tsx`

**Interfaces:**
- Consumes: `deriveTagKind`, `tagScopeForRole` (Task 1), `SearchTraveller` (Task 10), `postApiTagServiceTagByIdAssignTraveller` (existing, `@/actions/TagService/post`), `loadTags` (existing).
- Produces: none (screen).

- [ ] **Step 1: Add imports**

Add to `src/screens/shared/TagPreviewScreen.tsx`:

```tsx
import { postApiTagServiceTagByIdAssignTraveller } from "@/actions/TagService/post";
import { SearchTraveller } from "@/screens/shared/_components/SearchTraveller/SearchTraveller";
import type { UniRefund_TagService_Travellers_TravellerRequestDto } from "@/saas/TagService";
import { deriveTagKind } from "@/utils/tag";
```

(Existing import from `@/utils/tag` — merge `deriveTagKind` into it; keep `isDraftPublicTag`/`salesAmountFromPublicDetail`.)

- [ ] **Step 2: Add role + picker state**

Inside the component, after `const { user } = useUserStore();`:

```tsx
  const { isMerchant, isRefundPoint } = useUserStore();
  const isStaff = isMerchant || isRefundPoint;
  const [pickerVisible, setPickerVisible] = useState(false);
```

(`useUserStore()` is already destructured for `user`; extend that destructure to include `isMerchant, isRefundPoint` rather than calling the hook twice.)

- [ ] **Step 3: Add the staff-assign handler**

Add alongside `claim()`:

```tsx
  async function assignToTraveller(
    traveller: UniRefund_TagService_Travellers_TravellerRequestDto,
  ) {
    if (!tagId) return;
    setPickerVisible(false);
    try {
      await postApiTagServiceTagByIdAssignTraveller({
        id: tagId,
        requestBody: { traveller },
      });
      toastRef.current?.show(
        "success",
        t("MobileApp.Qr.TagPreview.AssignSuccess"),
      );
      void loadTags(true);
      router.replace({
        pathname: "/(auth)/tags/[tagId]",
        params: { tagId, tagNumber: tag?.tagNumber ?? "" },
      });
    } catch {
      toastRef.current?.show("error", t("MobileApp.Qr.TagPreview.AssignError"));
    }
  }
```

- [ ] **Step 4: Replace `buildAction()` with role×kind logic**

Replace the whole `buildAction` function with:

```tsx
  function buildAction() {
    if (!tag) return undefined;
    const kind = deriveTagKind(tag);
    if (kind === "divergent") return undefined;

    if (kind === "draft") {
      if (isStaff) {
        return {
          onPress: () => setPickerVisible(true),
          label: t("MobileApp.Qr.TagPreview.AssignTraveller"),
        };
      }
      return isAuthenticated
        ? { onPress: claim, label: t("MobileApp.Qr.TagPreview.Claim") }
        : {
            onPress: loginToClaim,
            label: t("MobileApp.Qr.TagPreview.LoginToClaim"),
          };
    }

    // issued
    const goToDetail = () =>
      router.replace({
        pathname: "/(auth)/tags/[tagId]",
        params: { tagId: tagId ?? "", tagNumber: tag.tagNumber },
      });
    if (isStaff) {
      return { onPress: goToDetail, label: t("MobileApp.Qr.TagPreview.ViewDetails") };
    }
    return isAuthenticated
      ? { onPress: goToDetail, label: t("MobileApp.Qr.TagPreview.ViewInMyTags") }
      : {
          onPress: () => router.replace("/traveller-login"),
          label: t("MobileApp.Qr.TagPreview.LoginToView"),
        };
  }
```

- [ ] **Step 5: Render divergent info + mount the picker**

In the body block (where `isDraftPublicTag(tag)` currently drives the info card), replace that info card's conditional with kind-based copy, and add a divergent branch. Replace:

```tsx
            <Text className="flex-1 text-sm text-gray-600 leading-5">
              {isDraftPublicTag(tag)
                ? t("MobileApp.Qr.TagPreview.DraftInfo")
                : t("MobileApp.Qr.TagPreview.IssuedInfo")}
            </Text>
```

with:

```tsx
            <Text className="flex-1 text-sm text-gray-600 leading-5">
              {deriveTagKind(tag) === "divergent"
                ? t("MobileApp.Qr.TagPreview.DivergentInfo")
                : deriveTagKind(tag) === "draft"
                  ? t("MobileApp.Qr.TagPreview.DraftInfo")
                  : t("MobileApp.Qr.TagPreview.IssuedInfo")}
            </Text>
```

And update the adjacent `Ionicons name={...}` to use `deriveTagKind(tag) === "draft" ? "pricetag-outline" : deriveTagKind(tag) === "divergent" ? "warning-outline" : "checkmark-circle-outline"`.

At the end of the `ModalTemplate` (after its children, before/around the closing), mount the picker for staff:

```tsx
      {isStaff && (
        <SearchTraveller
          visible={pickerVisible}
          onClose={() => setPickerVisible(false)}
          onSelect={assignToTraveller}
        />
      )}
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Manual verification**

- Traveller, draft tag → "Claim this tag" → claims → lands on detail.
- Traveller, issued tag → "View in my tags" → detail (cross-tenant by number).
- Staff (merchant), draft tag → "Assign to a traveller" → picker → search/MRZ/KYC → assign → detail.
- Staff (refund-point), issued tag → "View tag details" → detail (tenant by id).
- Divergent tag → no action button + warning copy.

- [ ] **Step 8: Commit**

```
git add src/screens/shared/TagPreviewScreen.tsx
git commit -m "feat(qr): role x kind CTA in tag preview (claim / assign / details / divergent)"
```

---

## Phase 4 — Scan entry points

### Task 12: Shared `ScanEntry` on all role Homes

**Files:**
- Create: `src/screens/shared/_components/ScanEntry.tsx`
- Modify: `src/screens/traveller/Home/HomeScreen.tsx`
- Modify: `src/screens/merchant/Home/HomeScreen.tsx`
- Modify: `src/screens/refund-point/Home/HomeScreen.tsx`

**Interfaces:**
- Consumes: `useQrScanLauncher`, `QrScanner`, `useLocalization`.
- Produces: `ScanEntry` component (no props).

- [ ] **Step 1: Create `src/screens/shared/_components/ScanEntry.tsx`**

```tsx
import { Ionicons } from "@/components/Ionicons";
import { QrScanner } from "@/components/QrScanner";
import { useQrScanLauncher } from "@/hooks/useQrScanLauncher";
import { useLocalization } from "@/providers/LocalizationProvider";
import { Pressable, Text, View } from "react-native";

/** Scan CTA + QrScanner, shared by every role's Home. */
export function ScanEntry() {
  const { t } = useLocalization();
  const scan = useQrScanLauncher();
  return (
    <>
      <Pressable
        onPress={scan.open}
        className="mt-4 flex-row items-center gap-3 rounded-2xl bg-primary p-4"
      >
        <View className="w-12 h-12 rounded-full bg-white/20 items-center justify-center">
          <Ionicons name="qr-code-outline" size={26} color="#fff" />
        </View>
        <View className="flex-1">
          <Text className="text-white font-bold text-base">
            {t("MobileApp.Qr.ScanButton")}
          </Text>
          <Text className="text-white/80 text-xs">
            {t("MobileApp.Qr.ScanTagSubtitle")}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color="#ffffffcc" />
      </Pressable>
      <QrScanner
        visible={scan.visible}
        onScanned={scan.onScanned}
        onCancel={scan.close}
        title={t("MobileApp.Qr.ScanTitle")}
        subtitle={t("MobileApp.Qr.ScanTagSubtitle")}
      />
    </>
  );
}
```

- [ ] **Step 2: Use `ScanEntry` in the traveller Home**

In `src/screens/traveller/Home/HomeScreen.tsx`: remove the inline scan `Pressable` (the `{isTraveller && (...)}` block), remove the bottom `<QrScanner .../>`, remove the now-unused `useQrScanLauncher`/`QrScanner`/`Pressable`(if unused)/`scan` and `isTraveller`/role imports as appropriate, and render `<ScanEntry />` where the scan CTA was. Add import:

```tsx
import { ScanEntry } from "@/screens/shared/_components/ScanEntry";
```

Replace the removed block with:

```tsx
        <ScanEntry />
```

- [ ] **Step 3: Add `ScanEntry` to the merchant Home**

In `src/screens/merchant/Home/HomeScreen.tsx`, add the import and render `<ScanEntry />` near the top of the scroll content (above the "Latest tag"/"Create Tag" section):

```tsx
import { ScanEntry } from "@/screens/shared/_components/ScanEntry";
```

```tsx
        <ScanEntry />
```

- [ ] **Step 4: Add `ScanEntry` to the refund-point Home**

In `src/screens/refund-point/Home/HomeScreen.tsx`, same edit: import and render `<ScanEntry />` near the top of the content.

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck` then `npm run lint`
Expected: PASS (remove any now-unused imports flagged by lint).

- [ ] **Step 6: Manual verification**

Home shows the Scan CTA for traveller, merchant, and refund-point. Scanning routes correctly for each role (validate blocked for staff; draft → assign for staff / claim for traveller; issued → details).

- [ ] **Step 7: Commit**

```
git add src/screens/shared/_components/ScanEntry.tsx src/screens/traveller/Home/HomeScreen.tsx src/screens/merchant/Home/HomeScreen.tsx src/screens/refund-point/Home/HomeScreen.tsx
git commit -m "feat(home): shared ScanEntry on all role home screens"
```

---

## Self-Review

**Spec coverage:**
- Draft→claim (traveller): Task 11 (traveller draft branch) + existing `claim()`. ✓
- Draft→assign (staff): Tasks 9, 10, 11. ✓
- Issued→details: Task 11 + Task 5 (role-scoped detail). ✓
- Validation traveller-only: Task 8. ✓
- Both-must-agree + divergent: Task 1 + Task 11. ✓
- Traveller picker (search + MRZ + KYC): Tasks 2, 3, 9, 10. ✓
- Role-scoped endpoints (list + detail), refund-point fix: Tasks 4, 5, 6. ✓
- Staff scan entry: Task 12. ✓
- i18n: Task 7. ✓
- Residence defaults to nationality: Task 2 mappers. ✓
- Post-assign → detail: Task 11. ✓

**Verified against the codebase while writing:**
- `Button` (`action={{onPress,label}}`, `containerClassName`/`textClassName`, no `variant`) and `Input` (`title`+`iconName` required, forwards `TextInput` props) — Tasks 9 & 10 use the real APIs.
- `GetApiTagServiceTagData` has both `sorting?: string` and `maxResultCount?: number` — Task 6's shared query compiles for both list endpoints.

**One implementer check (do during the task):**
- Grep for any remaining `getFullTagDetailById` callers (Task 5) and switch them to `getFullTagDetail`. Only `useTagDetail.tsx` is expected.

**Type consistency:** `TagKind`, `tagScopeForRole` return `"Staff" | "Traveller"`, `getFullTagDetail({tagId,tagNumber,scope})`, `useTagDetail({tagId,tagNumber,scope})`, and the mapper signatures are used consistently across Tasks 1, 2, 5, 6, 11.

# Sticker Manual Verification (super-app) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a traveller photograph a physical sticker and its tax-free form from the mobile app and submit the pair for a refund officer to review, with the sticker line number prefilled from the photograph's QR.

**Architecture:** Two server-action wrappers in super-app's own `fetchRequest` style. A pending-uploads section folded into the existing shared `TagScreen` as its `FlashList` header, gated on both `!isStaff` and the `.ViewMine` grant. An upload `BottomSheet` capturing two photographs via `expo-image-picker`, resized natively by `expo-image-manipulator` and read as base64 by `expo-file-system`. The QR read is one `expo-camera` `scanFromURLAsync` call — none of the web build's decoder work ports.

**Tech Stack:** Expo / React Native, expo-router, Zustand, NativeWind, `@gorhom/bottom-sheet`, `@shopify/flash-list`, Jest, `@unirefund/qr`.

**Spec:** [`docs/superpowers/specs/2026-08-10-superapp-sticker-manual-verification-design.md`](../specs/2026-08-10-superapp-sticker-manual-verification-design.md)

## Global Constraints

- **Repo:** `c:\unirefund\super-app`. **This checkout is sometimes driven by two agent sessions at once.** Before starting, run `git status`, `git rev-parse --abbrev-ref HEAD` and `git reflog --date=iso | head -20`; if you see commits or checkouts you did not make in the last hour, stop and report. **Never** run `git reset --hard`, `git rebase` or `git stash` here — a `reset --hard` has destroyed another session's work in this repo before.
- **Never call generated SDK clients from screens, components or hooks.** Wrap them in `src/actions/**`. See [`.claude/rules/api-actions.md`](../../../super-app/.claude/rules/api-actions.md).
- **Actions wrap `fetchRequest(request, apiName)`** from `src/utils/customFetch.ts`, resolve the client via `getTagServiceClient(customHeaders)` from `src/actions/lib.ts`, and **let errors bubble**. There is no `structuredResponse`/`structuredError`, no `"use server"`, no `auth()` — those are the *web* monorepo's patterns and do not exist here.
- **Never edit `src/saas/**` by hand.** It is generated; regenerate with `npm run gen`.
- **No hardcoded user-visible text.** Keys go in `src/localization/resources/en-US.json` **and** `tr-TR.json`, read via `useLocalization()`'s `t()`. **These files are nested objects, not flat dot-keys** — `t("MobileApp.Verification.Upload")` reads `{ "Verification": { "Upload": … } }`. Never edit `src/data/language-data/*.gen.json`.
- **`npm run init` regenerates the i18n bundle and is a type-check prerequisite** after adding keys.
- **No `useEffect`** for derived state or event responses; see [`.claude/rules/avoid-use-effect.md`](../../../super-app/.claude/rules/avoid-use-effect.md). `useFocusEffect` in `TagScreen` is pre-existing and sanctioned.
- **UI from `src/components/**` first** — `Button`, `Input`, `BottomSheet`, `Image`, `Section`, `SafeAreaView`, `Ionicons` — with NativeWind classes and semantic tokens (`bg-background`, `text-foreground`), not hardcoded colours. See [`.claude/rules/ui-components.md`](../../../super-app/.claude/rules/ui-components.md).
- **No new dependency.** Everything needed is installed: `expo-image-picker` ~17.0.11, `expo-image-manipulator` ~14.0.8, `expo-file-system` ~19.0.23, `expo-camera` ~17.0.10, `@unirefund/qr`, `@gorhom/bottom-sheet`.
- **Comments sparse.** Comment only what the code cannot say — a budget number that looks arbitrary, a rule that would otherwise be silently broken. No docblock restating a function name.
- **Jest facts, established by prior work here:** roughly **7 suites already fail at baseline** — record the exact baseline before changing anything and compare against it, never against green. **`npm test` also collects sibling worktrees' tests**, so scope runs (`npx jest <path>`). **Render tests must be named `*.router.test.*`** or they miss the router mocks; the tests in this plan are pure-logic and use plain `*.test.ts`.
- **`expo start` needs `--offline`** in this environment.
- Size ceiling, verbatim: **~2.5 MB of base64 per photo (~1.9 MB decoded)**, against a backend cap of **5 MB decoded, JPEG or PNG**. There is no Next `bodySizeLimit` here.
- Permission strings, verbatim: `TagService.StickerManualVerifications`, `.Upload`, `.ViewMine`.

**Task order:** 1 → 2 → 3 → 4 → 5 → 6 → 7. Task 2 depends on 1. Task 6 depends on 3. Task 7 depends on 4 and 6.

---

### Task 1: Regenerate the TagService proxy

**Files:**
- Modify (generated): `src/saas/TagService/**`

**Interfaces:**
- Consumes: nothing.
- Produces: `StickerManualVerificationService` on `TagServiceClient`, plus the types `UniRefund_TagService_Stickers_UploadStickerManualVerificationDto`, `UniRefund_TagService_Stickers_MyStickerManualVerificationListDto`, `PagedResultDto_MyStickerManualVerificationListDto`, and the request-data types for the upload and `/my` calls. Task 2 consumes all of these.

**This is a hard prerequisite.** None of the manual-verification endpoints exist in `src/saas` today, and nothing downstream can be written — let alone type-checked — until they do.

- [ ] **Step 1: Record the state you are starting from**

```bash
cd c:/unirefund/super-app
git status --short
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git reflog --date=iso | head -20
```

Expected: a clean tree. If it is dirty, or the reflog shows activity you did not create in the last hour, **stop and report** — another session may be mid-work.

- [ ] **Step 2: Record the Jest baseline before touching anything**

```bash
cd c:/unirefund/super-app
npx jest --silent 2>&1 | tail -15
```

Write the exact suite and test counts into your report. Around 7 suites fail here at baseline. **This number is your comparison point for every later task** — do not expect green, and do not try to fix pre-existing failures.

- [ ] **Step 3: Regenerate**

```bash
cd c:/unirefund/super-app
npm run gen
```

This needs network access to a backend whose TagService carries the new controller. If it cannot reach one, or generates without the new endpoints, **stop and report** — the rest of the plan is blocked and there is no workaround that does not involve hand-editing generated code, which is forbidden.

- [ ] **Step 4: Verify the endpoints actually arrived**

```bash
cd c:/unirefund/super-app
grep -n "stickerManualVerification" src/saas/TagService/TagServiceClient.ts
grep -c "StickerManualVerification" src/saas/TagService/types.gen.ts
grep -n "class StickerManualVerificationService" -A 40 src/saas/TagService/sdk.gen.ts | grep -n "public \|/my"
```

Expected: the client exposes a `stickerManualVerification` property; `types.gen.ts` matches on `StickerManualVerification` several times; and the service class exposes an upload method and a `/my` method.

**Record the exact method names you find in your report.** Task 2 needs them verbatim. In the web monorepo the same generator produced `postApiTagServiceStickerManualVerification` and `getApiTagServiceStickerManualVerificationMy`, so expect that shape — but **use what is actually generated here, not what this plan predicts.**

- [ ] **Step 5: Type-check**

```bash
cd c:/unirefund/super-app
npx tsc --noEmit
```

Expected: no *new* errors versus the baseline. Regeneration can legitimately change unrelated generated types; if it does and something breaks outside `src/saas`, report it rather than fixing it — it is not this feature's business.

- [ ] **Step 6: Commit**

```bash
cd c:/unirefund/super-app
git add src/saas/TagService
git commit -m "chore(saas): regenerate TagService for sticker manual verification"
```

---

### Task 2: Actions layer

**Files:**
- Modify: `src/actions/TagService/post.ts`
- Modify: `src/actions/TagService/actions.ts`

**Interfaces:**
- Consumes: the generated service from Task 1; `fetchRequest` from `@/utils/customFetch`; `getTagServiceClient` from `../lib`.
- Produces:
  - `postStickerManualVerificationApi(body: { stickerLineNumber: string; frontPictureBase64: string; backPictureBase64: string }): Promise<UniRefund_TagService_Stickers_StickerManualVerificationDto>` — **throws** on failure.
  - `getStickerManualVerificationsMyApi(): Promise<UniRefund_TagService_Stickers_MyStickerManualVerificationListDto[]>` — returns `[]` rather than throwing when the caller lacks `.ViewMine`.

  Task 5 consumes the getter; Task 6 consumes the poster.

- [ ] **Step 1: Add the upload action**

Append to `src/actions/TagService/post.ts`. Match the surrounding file's import style and use the **actual** generated method name from Task 1 Step 4:

```ts
export async function postStickerManualVerificationApi(body: {
  stickerLineNumber: string;
  frontPictureBase64: string;
  backPictureBase64: string;
}) {
  return await fetchRequest(async (customHeaders) => {
    const client = await getTagServiceClient(customHeaders);
    return await client.stickerManualVerification.postApiTagServiceStickerManualVerification(
      { requestBody: body },
    );
  }, "postStickerManualVerificationApi");
}
```

- [ ] **Step 2: Add the `/my` action**

Append to `src/actions/TagService/actions.ts`:

```ts
/**
 * The traveller's own uploaded picture pairs. Returns [] rather than throwing
 * when the caller lacks TagService.StickerManualVerifications.ViewMine — that
 * grant is absent on some environments, and the section it feeds must vanish
 * rather than break the tags screen it sits on.
 */
export async function getStickerManualVerificationsMyApi() {
  try {
    return await fetchRequest(async (customHeaders) => {
      const client = await getTagServiceClient(customHeaders);
      const response =
        await client.stickerManualVerification.getApiTagServiceStickerManualVerificationMy(
          { maxResultCount: 20, sorting: "creationTime desc" },
        );
      return response.items ?? [];
    }, "getStickerManualVerificationsMyApi");
  } catch {
    return [];
  }
}
```

Two things to know about that body. The `catch` is deliberate and is the exception to this repo's errors-bubble rule — `getStickerLineMerchantInfo` in the same file already does this, with a docblock explaining why, so follow that precedent. And **`sorting: "creationTime desc"` is unverified**: `StickerManualVerificationRepository` hand-rolls its sort whitelist rather than using the shared helper, so the field may be rejected. Keep it as written and flag it; if a live call 400s, drop the `sorting` property and take the repository's default ordering. Do not guess at another field name.

- [ ] **Step 3: Type-check**

```bash
cd c:/unirefund/super-app
npx tsc --noEmit
```

Expected: no new errors. A missing method name here means Task 1 Step 4 recorded it wrong — read `src/saas/TagService/sdk.gen.ts` and correct it. **Do not cast to `any` or `@ts-expect-error` around it.**

- [ ] **Step 4: Lint**

```bash
cd c:/unirefund/super-app
npx eslint src/actions/TagService
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
cd c:/unirefund/super-app
git add src/actions/TagService/actions.ts src/actions/TagService/post.ts
git commit -m "feat(actions): wrap the traveller sticker manual-verification endpoints"
```

---

### Task 3: Image preparation

**Files:**
- Create: `src/utils/sticker-upload/prepare-picture.ts`
- Create: `src/utils/sticker-upload/__tests__/prepare-picture.test.ts`

**Interfaces:**
- Consumes: `expo-image-manipulator`, `expo-file-system`.
- Produces:
  - `pickResizePlan(width: number, height: number): { width: number } | null` — pure. `null` means no resize needed.
  - `prepareStickerPicture(uri: string): Promise<{ base64: string; uri: string }>` — impure; throws on failure.

  Task 6 consumes `prepareStickerPicture`.

The resize decision is pure and gets real red-green tests. The manipulation and file read are native and cannot run under Jest — do not mock them into a fake test that asserts against mocks.

- [ ] **Step 1: Write the failing test**

Create `src/utils/sticker-upload/__tests__/prepare-picture.test.ts`:

```ts
import { pickResizePlan } from "@/utils/sticker-upload/prepare-picture";

describe("pickResizePlan", () => {
  it("caps a phone-camera photo to the long edge", () => {
    expect(pickResizePlan(4032, 3024)).toEqual({ width: 2000 });
  });

  it("measures the longest edge, so portrait resizes too", () => {
    expect(pickResizePlan(3024, 4032)).toEqual({ width: 1500 });
  });

  it("never upscales an image already under the cap", () => {
    expect(pickResizePlan(1200, 900)).toBeNull();
  });

  it("leaves an image exactly at the cap alone", () => {
    expect(pickResizePlan(2000, 1500)).toBeNull();
  });
});
```

The portrait expectation is the one worth reading twice: capping the *longest* edge at 2000 on a 3024×4032 portrait means the **width** becomes 1500, because `expo-image-manipulator`'s `resize` preserves aspect ratio from whichever dimension you give it.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd c:/unirefund/super-app
npx jest src/utils/sticker-upload
```

Expected: FAIL — `Cannot find module '@/utils/sticker-upload/prepare-picture'`.

- [ ] **Step 3: Write the implementation**

Create `src/utils/sticker-upload/prepare-picture.ts`:

```ts
import * as FileSystem from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";

/**
 * Longest edge and quality for an uploaded picture.
 *
 * Two limits bind: the backend accepts 5 MB decoded per picture, and two base64
 * strings held at once are the real memory cost on a low-end Android. 2000px at
 * q=0.7 clears both in a single pass for every phone camera, which is why there
 * is no re-encode loop here.
 */
const MAX_EDGE = 2000;
const QUALITY = 0.7;

export function pickResizePlan(
  width: number,
  height: number,
): { width: number } | null {
  const longest = Math.max(width, height);
  if (longest <= MAX_EDGE) return null;
  const scale = MAX_EDGE / longest;
  return { width: Math.round(width * scale) };
}

/** Base64 character ceiling per picture: ~2.5 MB, i.e. ~1.9 MB decoded. */
const MAX_BASE64_CHARS = 2_500_000;
/** One retry only, then accept. A loop is what MAX_EDGE exists to avoid. */
const RETRY_QUALITY = 0.5;

async function encode(uri: string, quality: number) {
  const context = ImageManipulator.ImageManipulator.manipulate(uri);
  const rendered = await context.renderAsync();
  const plan = pickResizePlan(rendered.width, rendered.height);
  const saved = await (plan ? context.resize(plan) : context)
    .renderAsync()
    .then((image) =>
      image.saveAsync({
        compress: quality,
        format: ImageManipulator.SaveFormat.JPEG,
      }),
    );
  const base64 = await FileSystem.readAsStringAsync(saved.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return { base64, uri: saved.uri };
}

export async function prepareStickerPicture(uri: string) {
  const first = await encode(uri, QUALITY);
  if (first.base64.length <= MAX_BASE64_CHARS) return first;
  // Overshooting MAX_EDGE at QUALITY should not happen for a phone camera, so
  // this is a backstop, not a ladder: retry once and take what we get.
  return await encode(uri, RETRY_QUALITY);
}
```

`expo-image-manipulator` 14 uses the `manipulate` / `renderAsync` / `saveAsync` context API rather than the older `manipulateAsync`. **Verify the exact shape against `node_modules/expo-image-manipulator/build/` before assuming this compiles** — check `mrz-utils.ts` and `SignatureSheet.tsx`, which already use this package, and match whichever API they use. If they use `manipulateAsync`, use that instead and simplify accordingly.

- [ ] **Step 4: Run the test again**

```bash
cd c:/unirefund/super-app
npx jest src/utils/sticker-upload
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Type-check and lint**

```bash
cd c:/unirefund/super-app
npx tsc --noEmit
npx eslint src/utils/sticker-upload
```

Expected: both clean.

- [ ] **Step 6: Commit**

```bash
cd c:/unirefund/super-app
git add src/utils/sticker-upload
git commit -m "feat(sticker-upload): resize and encode a picture for upload"
```

---

### Task 4: Read the sticker line number out of a photograph

**Files:**
- Create: `src/utils/sticker-upload/read-sticker-qr.ts`
- Create: `src/utils/sticker-upload/__tests__/read-sticker-qr.test.ts`

**Interfaces:**
- Consumes: `scanFromURLAsync` from `expo-camera`; `decodeTagScan` from `@unirefund/qr`.
- Produces:
  - `stickerLineNumberFromScan(raw: string): string | null` — pure.
  - `readStickerLineNumber(uri: string): Promise<string | null>` — impure; never throws.

  Task 7 consumes `readStickerLineNumber`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/sticker-upload/__tests__/read-sticker-qr.test.ts`:

```ts
import { stickerLineNumberFromScan } from "@/utils/sticker-upload/read-sticker-qr";
import { buildTagUrl } from "@unirefund/qr";

const SSR = "https://ssr.unirefund.com";

describe("stickerLineNumberFromScan", () => {
  it("reads the line number out of a sticker QR", () => {
    const url = buildTagUrl(SSR, { tagNumber: "", stickerLineNumber: "SL-4471" });
    expect(stickerLineNumberFromScan(url)).toBe("SL-4471");
  });

  it("yields nothing for a tag QR, which carries no sticker line", () => {
    const url = buildTagUrl(SSR, { tagNumber: "TAG-1029" });
    expect(stickerLineNumberFromScan(url)).toBeNull();
  });

  it("yields nothing for a string that is not a Unirefund code", () => {
    expect(stickerLineNumberFromScan("https://example.com/hello")).toBeNull();
  });

  it("yields nothing for an empty scan", () => {
    expect(stickerLineNumberFromScan("")).toBeNull();
  });
});
```

`buildTagUrl` is the same helper the sticker print flow uses to *write* these codes, so this pins the read against the shared contract rather than against a hand-typed string. `src/utils/qr/__tests__/classifyScan.test.ts` uses it the same way — read that file for the pattern.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd c:/unirefund/super-app
npx jest src/utils/sticker-upload/__tests__/read-sticker-qr.test.ts
```

Expected: FAIL — `Cannot find module '@/utils/sticker-upload/read-sticker-qr'`.

- [ ] **Step 3: Write the implementation**

Create `src/utils/sticker-upload/read-sticker-qr.ts`:

```ts
import { decodeTagScan } from "@unirefund/qr";
import { scanFromURLAsync } from "expo-camera";

export function stickerLineNumberFromScan(raw: string): string | null {
  if (!raw) return null;
  const scanned = decodeTagScan(raw).stickerLineNumber;
  return scanned ? scanned : null;
}

/**
 * A miss is an ordinary outcome: manual entry is the baseline and this is only
 * help, so every failure path resolves to null rather than throwing.
 */
export async function readStickerLineNumber(
  uri: string,
): Promise<string | null> {
  try {
    const results = await scanFromURLAsync(uri, ["qr"]);
    for (const result of results) {
      const lineNumber = stickerLineNumberFromScan(result.data);
      if (lineNumber) return lineNumber;
    }
    return null;
  } catch {
    return null;
  }
}
```

Two things to verify rather than assume: the barcode-type string `expo-camera` expects (`"qr"` vs `"qr_code"` — check `BarcodeType` in `node_modules/expo-camera/build/Camera.types.d.ts`), and the field the result carries (`data` vs `rawValue` — check `BarcodeScanningResult` in the same file). Correct them from the installed types; do not cast.

- [ ] **Step 4: Run the test again**

```bash
cd c:/unirefund/super-app
npx jest src/utils/sticker-upload/__tests__/read-sticker-qr.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Full scoped suite, type-check, lint**

```bash
cd c:/unirefund/super-app
npx jest src/utils
npx tsc --noEmit
npx eslint src/utils/sticker-upload
```

Expected: `src/utils` green, and tsc/eslint clean. Compare against the Task 1 baseline — do not chase pre-existing failures elsewhere.

- [ ] **Step 6: Commit**

```bash
cd c:/unirefund/super-app
git add src/utils/sticker-upload
git commit -m "feat(sticker-upload): read a sticker line number from a photograph"
```

---

### Task 5: The pending-verifications section

**Files:**
- Create: `src/screens/shared/Tags/Tag/_components/PendingVerifications.tsx`
- Create: `src/hooks/usePendingVerifications.ts`
- Modify: `src/screens/shared/Tags/Tag/TagScreen.tsx`
- Modify: `src/localization/resources/en-US.json`, `src/localization/resources/tr-TR.json`

**Interfaces:**
- Consumes: `getStickerManualVerificationsMyApi` (Task 2).
- Produces: `<PendingVerifications />`, rendered as the `FlashList`'s `ListHeaderComponent`; `usePendingVerifications()` returning `{ items, reload }`. Task 6 calls `reload` after a successful upload.

- [ ] **Step 1: Add the i18n keys**

These files are **nested objects**. Add a `Verification` block to `src/localization/resources/en-US.json`:

```json
  "Verification": {
    "SectionTitle": "Pending verifications",
    "StickerLineNumber": "Sticker line number",
    "UploadedAt": "Uploaded",
    "Status.Created": "Under review",
    "Status.Invalid": "Rejected",
    "RejectionReason": "Reason"
  }
```

And to `tr-TR.json`:

```json
  "Verification": {
    "SectionTitle": "Bekleyen doğrulamalar",
    "StickerLineNumber": "Etiket satır numarası",
    "UploadedAt": "Yüklenme",
    "Status.Created": "İnceleniyor",
    "Status.Invalid": "Reddedildi",
    "RejectionReason": "Neden"
  }
```

Read them as `t("MobileApp.Verification.SectionTitle")`. Check how an existing nested block with dotted leaf keys is read elsewhere in the app before committing to the `Status.Created` shape — if dotted leaves are not supported by the `t()` resolver, nest them one level deeper (`"Status": { "Created": … }`) and adjust the reads.

- [ ] **Step 2: Regenerate the bundle**

```bash
cd c:/unirefund/super-app
npm run init
```

Expected: exits 0. `tsc` cannot see a new key until this runs. Never stage `src/data/language-data/*.gen.json`.

- [ ] **Step 3: Write the hook**

Create `src/hooks/usePendingVerifications.ts`:

```ts
import { getStickerManualVerificationsMyApi } from "@/actions/TagService/actions";
import type { UniRefund_TagService_Stickers_MyStickerManualVerificationListDto } from "@/saas/TagService";
import { useCallback, useState } from "react";

type Item = UniRefund_TagService_Stickers_MyStickerManualVerificationListDto;

export function usePendingVerifications(enabled: boolean) {
  const [items, setItems] = useState<Item[]>([]);

  const reload = useCallback(async () => {
    if (!enabled) {
      setItems([]);
      return;
    }
    setItems(await getStickerManualVerificationsMyApi());
  }, [enabled]);

  return { items, reload };
}
```

The action already swallows a missing-grant failure into `[]`, so this hook needs no error state — the section simply does not render.

- [ ] **Step 4: Write the section**

Create `src/screens/shared/Tags/Tag/_components/PendingVerifications.tsx`. Render only `Created` and `Invalid` items; each row carries the line number, a status chip, the upload date, and for `Invalid` the `invalidReason` verbatim. Return `null` when nothing is visible.

```tsx
import { useLocalization } from "@/providers/LocalizationProvider";
import type { UniRefund_TagService_Stickers_MyStickerManualVerificationListDto } from "@/saas/TagService";
import { Text, View } from "react-native";

type Item = UniRefund_TagService_Stickers_MyStickerManualVerificationListDto;

// Keyed by StickerManualVerificationStatus, deliberately not shared with
// TagCard's TagStatusType styles - different enum, different members.
const CHIP: Record<"Created" | "Invalid", string> = {
  Created: "bg-yellow-50 text-yellow-700",
  Invalid: "bg-red-50 text-red-700",
};

export function PendingVerifications({ items }: { items: Item[] }) {
  const { t, activeLocale } = useLocalization();
  // Completed pairs are dropped: the DTO carries no tagId to link to, and the
  // tag they produced is already in the list below.
  const visible = items.filter(
    (item) => item.status === "Created" || item.status === "Invalid",
  );
  if (visible.length === 0) return null;

  return (
    <View className="mb-4 gap-2">
      <Text className="text-foreground font-semibold">
        {t("MobileApp.Verification.SectionTitle")}
      </Text>
      {visible.map((item) => {
        const isInvalid = item.status === "Invalid";
        return (
          <View
            className="border-border gap-1 rounded-xl border p-3"
            key={item.id}
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-foreground font-medium">
                {item.stickerLineNumber}
              </Text>
              <Text
                className={`rounded-md px-2 py-1 text-xs font-medium ${
                  CHIP[isInvalid ? "Invalid" : "Created"]
                }`}
              >
                {t(
                  isInvalid
                    ? "MobileApp.Verification.Status.Invalid"
                    : "MobileApp.Verification.Status.Created",
                )}
              </Text>
            </View>
            <Text className="text-muted-foreground text-xs">
              {t("MobileApp.Verification.UploadedAt")}:{" "}
              {item.creationTime
                ? new Date(item.creationTime).toLocaleDateString(activeLocale)
                : "-"}
            </Text>
            {item.invalidReason ? (
              <Text className="text-muted-foreground text-sm">
                {t("MobileApp.Verification.RejectionReason")}:{" "}
                {item.invalidReason}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
```

Check what `activeLocale` actually is (`useLocalization()` exposes it and `TagScreen` already destructures it) — if it is not a BCP-47 tag that `toLocaleDateString` accepts, map it, or reuse whatever date helper the tag screens already use rather than inventing one.

- [ ] **Step 5: Wire it into `TagScreen`**

In `src/screens/shared/Tags/Tag/TagScreen.tsx`:

- Compute `const canSeePending = !isStaff;` — `isStaff` already exists at line 46. **Both gates matter**: this screen is shared with merchant and refund-point users, and a traveller's pairs must never render for them. The `.ViewMine` grant is the second gate and is already handled inside the action, which returns `[]` without it.
- Call `const { items: pendingVerifications, reload: reloadPending } = usePendingVerifications(canSeePending);`
- Add `void reloadPending();` beside the existing `loadTags(true)` inside the pre-existing `useFocusEffect`, so a pair that became a tag disappears on the next focus. **Do not add a second `useEffect`.**
- Pass `ListHeaderComponent={<PendingVerifications items={pendingVerifications} />}` to the `FlashList`. If the list already has a `ListHeaderComponent`, compose both in a fragment rather than replacing it.

- [ ] **Step 6: Type-check and lint**

```bash
cd c:/unirefund/super-app
npx tsc --noEmit
npx eslint src/screens/shared/Tags src/hooks/usePendingVerifications.ts
```

Expected: both clean.

- [ ] **Step 7: Confirm the suite has not regressed**

```bash
cd c:/unirefund/super-app
npx jest src/screens src/utils
```

Expected: the same failures as the Task 1 baseline, no new ones. `TagScreen` has existing tests — if any now fail, that is a real regression from your wiring, not a baseline failure.

- [ ] **Step 8: Commit**

```bash
cd c:/unirefund/super-app
git add src/screens/shared/Tags src/hooks/usePendingVerifications.ts src/localization/resources
git commit -m "feat(tags): show the traveller's pending sticker verifications"
```

---

### Task 6: The upload sheet

**Files:**
- Create: `src/screens/shared/Tags/Tag/_components/UploadVerificationSheet.tsx`
- Modify: `src/screens/shared/Tags/Tag/_components/TagListHeader.tsx`
- Modify: `src/screens/shared/Tags/Tag/TagScreen.tsx`
- Modify: `src/localization/resources/en-US.json`, `tr-TR.json`

**Interfaces:**
- Consumes: `prepareStickerPicture` (Task 3); `postStickerManualVerificationApi` (Task 2); `reloadPending` (Task 5).
- Produces: `<UploadVerificationSheet ref onUploaded />`, and a `Slot` shape `{ uri: string; base64: string }` that Task 7 extends with QR handling.

- [ ] **Step 1: Add the i18n keys**

Extend the `Verification` block in **both** resource files. English:

```json
    "Upload": "Upload for verification",
    "Upload.Title": "Send your sticker and form",
    "Upload.Description": "Take a photo of the sticker and of the tax-free form it is stuck on. A refund agent will check them and create your tag.",
    "Upload.StickerPhoto": "Sticker photo",
    "Upload.FormPhoto": "Tax-free form photo",
    "Upload.Choose": "Take photo",
    "Upload.Gallery": "Choose from gallery",
    "Upload.Replace": "Replace",
    "Upload.LineNumberLabel": "Sticker line number",
    "Upload.LineNumberPlaceholder": "The number printed on the sticker",
    "Upload.Required": "Required",
    "Upload.Submit": "Send",
    "Upload.Cancel": "Cancel",
    "Upload.PermissionDenied": "We need camera access to photograph your sticker. You can allow it in your device settings.",
    "Upload.Unreadable": "We couldn't read that photo. Please try another.",
    "Upload.Success": "Your photos were sent. We'll let you know once they are checked."
```

Turkish:

```json
    "Upload": "Doğrulama için yükle",
    "Upload.Title": "Etiketinizi ve formunuzu gönderin",
    "Upload.Description": "Etiketin ve etiketin yapıştırıldığı tax-free formun fotoğrafını çekin. Bir iade görevlisi kontrol edip etiketinizi oluşturacak.",
    "Upload.StickerPhoto": "Etiket fotoğrafı",
    "Upload.FormPhoto": "Tax-free form fotoğrafı",
    "Upload.Choose": "Fotoğraf çek",
    "Upload.Gallery": "Galeriden seç",
    "Upload.Replace": "Değiştir",
    "Upload.LineNumberLabel": "Etiket satır numarası",
    "Upload.LineNumberPlaceholder": "Etiketin üzerinde yazan numara",
    "Upload.Required": "Zorunlu",
    "Upload.Submit": "Gönder",
    "Upload.Cancel": "İptal",
    "Upload.PermissionDenied": "Etiketinizi fotoğraflamak için kamera erişimine ihtiyacımız var. Cihaz ayarlarından izin verebilirsiniz.",
    "Upload.Unreadable": "Bu fotoğraf okunamadı. Lütfen başka bir fotoğraf deneyin.",
    "Upload.Success": "Fotoğraflarınız gönderildi. Kontrol edildiğinde size bildireceğiz."
```

Then `npm run init`.

- [ ] **Step 2: Write the sheet**

Create `UploadVerificationSheet.tsx`. Follow [`AvatarModal.tsx`](../../../super-app/src/screens/shared/Profile/_components/AvatarModal.tsx) for the `BottomSheet` + `ImagePicker` shape and `useToastRef()` for messages.

**This step gives requirements rather than code, deliberately.** Every other code
step in this plan carries a verified snippet; this component would need the exact
prop surfaces of `BottomSheet`, `Button` and `Input` in
`src/components/**`, which are not reproduced here. Inventing them would put
unverified code in front of an implementer who would then trust it — worse than
sending them to the precedent. So: **read `AvatarModal.tsx` and the three
components first**, then build to the list below. Each item is something a
reviewer will check for:

- **Three fields, all marked required** using the `Upload.Required` key — two photo slots (sticker first, form second; the DTO fixes the order) and the line number.
- Each slot offers **camera and gallery**: `ImagePicker.launchCameraAsync` and `launchImageLibraryAsync`, both `mediaTypes: ["images"]`, `quality: 1` — quality is handled by Task 3's resize, so do not compress twice.
- **Handle a denied camera permission** with the `Upload.PermissionDenied` toast. `launchCameraAsync` requires `requestCameraPermissionsAsync`; a denial must not fail silently.
- After a pick, run `prepareStickerPicture(asset.uri)` and store `{ uri, base64 }`. On a throw, toast `Upload.Unreadable` and leave the slot empty.
- **Submit disabled** until both slots are filled and the trimmed line number is non-empty; the handler re-checks the same conditions rather than trusting the disabled prop.
- **On a failed submit, keep the sheet open with both photos intact** and toast the error. The likely rejections are an unknown line number or one already bound to a tag — re-shooting two photographs to fix a typo would be gratuitous. Since actions throw here, this is a `try`/`catch`.
- **The sheet must not be dismissable mid-submit.**
- On success: toast `Upload.Success`, call `onUploaded()` (which triggers Task 5's `reloadPending`), reset every field, dismiss.
- Do **not** hold the original picked asset alongside the resized copy — that doubles the heap cost the 2.5 MB ceiling exists to bound.

- [ ] **Step 3: Add the trigger**

Add an upload control to `TagListHeader.tsx` behind a new optional prop (`onUpload?: () => void`), rendered only when supplied, so the staff path is unchanged. In `TagScreen`, pass it only when `canSeePending` and hold the sheet's `BottomSheetModal` ref beside the existing `filterSheetRef`.

- [ ] **Step 4: Type-check and lint**

```bash
cd c:/unirefund/super-app
npx tsc --noEmit
npx eslint src/screens/shared/Tags
```

Expected: both clean.

- [ ] **Step 5: Confirm no regression**

```bash
cd c:/unirefund/super-app
npx jest src/screens src/utils
```

Expected: same as the Task 1 baseline.

- [ ] **Step 6: Commit**

```bash
cd c:/unirefund/super-app
git add src/screens/shared/Tags src/localization/resources
git commit -m "feat(tags): upload a sticker picture pair for manual verification"
```

---

### Task 7: Prefill the line number from the photograph

**Files:**
- Create: `src/utils/sticker-upload/resolve-prefill.ts`
- Create: `src/utils/sticker-upload/__tests__/resolve-prefill.test.ts`
- Modify: `src/screens/shared/Tags/Tag/_components/UploadVerificationSheet.tsx`
- Modify: `src/localization/resources/en-US.json`, `tr-TR.json`

**Interfaces:**
- Consumes: `readStickerLineNumber` (Task 4); the sheet (Task 6).
- Produces: `resolvePrefill(...)`, pure and tested.

The web build needed **two fix rounds** to get this rule right. The rule is pure logic, so here it gets tested instead.

- [ ] **Step 1: Write the failing test**

Create `src/utils/sticker-upload/__tests__/resolve-prefill.test.ts`:

```ts
import { resolvePrefill } from "@/utils/sticker-upload/resolve-prefill";

describe("resolvePrefill", () => {
  it("fills an empty field from the photo", () => {
    expect(resolvePrefill({ current: "", fromPhoto: false, scanned: "SL-1" }))
      .toEqual({ value: "SL-1", fromPhoto: true });
  });

  it("lets a new photo supersede the previous photo's value", () => {
    expect(resolvePrefill({ current: "SL-1", fromPhoto: true, scanned: "SL-2" }))
      .toEqual({ value: "SL-2", fromPhoto: true });
  });

  it("never overwrites a hand-typed value", () => {
    expect(resolvePrefill({ current: "SL-9", fromPhoto: false, scanned: "SL-2" }))
      .toBeNull();
  });

  it("keeps a hand-typed value even when the scan finds nothing", () => {
    expect(resolvePrefill({ current: "SL-9", fromPhoto: false, scanned: null }))
      .toBeNull();
  });

  it("does nothing when the scan finds nothing", () => {
    expect(resolvePrefill({ current: "", fromPhoto: false, scanned: null }))
      .toBeNull();
  });

  it("treats whitespace as untyped, so the photo may fill it", () => {
    expect(resolvePrefill({ current: "   ", fromPhoto: false, scanned: "SL-3" }))
      .toEqual({ value: "SL-3", fromPhoto: true });
  });
});
```

`null` means "change nothing", which keeps the hint honest: the caller only sets `fromPhoto` when it also sets a value.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd c:/unirefund/super-app
npx jest src/utils/sticker-upload/__tests__/resolve-prefill.test.ts
```

Expected: FAIL — `Cannot find module '@/utils/sticker-upload/resolve-prefill'`.

- [ ] **Step 3: Write the implementation**

Create `src/utils/sticker-upload/resolve-prefill.ts`:

```ts
/**
 * A photo-origin value is superseded by a new photo; a hand-typed one is not.
 * Without that distinction, retaking a photo after reading its prefill leaves
 * the discarded photo's number in the field with the hint still vouching for it.
 */
export function resolvePrefill(args: {
  current: string;
  fromPhoto: boolean;
  scanned: string | null;
}): { value: string; fromPhoto: true } | null {
  if (!args.scanned) return null;
  if (args.current.trim() && !args.fromPhoto) return null;
  return { value: args.scanned, fromPhoto: true };
}
```

- [ ] **Step 4: Run the test again**

```bash
cd c:/unirefund/super-app
npx jest src/utils/sticker-upload
```

Expected: PASS, 14 tests across the three files in this directory.

- [ ] **Step 5: Add the hint key**

In both resource files, inside `Verification`:

```json
    "Upload.LineNumberFromPhoto": "Read from your photo - check it matches the sticker."
```

Turkish: `"Fotoğrafınızdan okundu - etiketle eşleştiğini kontrol edin."`

Then `npm run init`.

- [ ] **Step 6: Wire it into the sheet**

In `UploadVerificationSheet.tsx`:

- Track `lineNumberFromPhoto` alongside `lineNumber`.
- After the **front** slot's pick, call `readStickerLineNumber(asset.uri)` on the **original** asset uri — before `prepareStickerPicture` — so it reads full resolution. Then apply `resolvePrefill`; when it returns non-null, set both the value and the flag.
- **Clear the flag whenever the traveller edits the field**, so the hint never claims a typed number came from the photo, and clear it on reset.
- Render the hint only while the flag is set.
- Run the read **off** the preview path — the thumbnail must appear without waiting for it — and never toast on a miss.
- **Guard against a stale read** landing after the front photo has been replaced or the sheet reset. On the web this needed a generation counter because the component survived the dialog closing; **check whether a dismissed `BottomSheetModal` here keeps this component mounted** and add a counter ref if it does. State what you found.

- [ ] **Step 7: Full gate**

```bash
cd c:/unirefund/super-app
npx jest src/screens src/utils
npx tsc --noEmit
npx eslint src/screens/shared/Tags src/utils/sticker-upload
```

Expected: suite matching the Task 1 baseline plus the new passes; tsc and eslint clean.

- [ ] **Step 8: Commit**

```bash
cd c:/unirefund/super-app
git add src/utils/sticker-upload src/screens/shared/Tags src/localization/resources
git commit -m "feat(tags): prefill the sticker line number from the photo's QR"
```

---

## Final verification

```bash
cd c:/unirefund/super-app
npx jest src/utils src/screens
npx tsc --noEmit
npx eslint src
```

Compare the Jest result against the Task 1 baseline — around 7 suites fail there before any of this work, and the only acceptable change is your new suites passing.

Then, on a **real device** (`npx expo start --offline`), because none of the following can be verified any other way:

1. **Camera and gallery on both slots**, and a **denied** camera permission producing the message rather than a silent no-op.
2. **The QR prefill against a real printed sticker.** Photograph a sheet with several stickers adjacent and confirm the number is the one you aimed at. Then retake and confirm the new photo's number replaces the old one, and that a hand-typed number survives a retake.
3. **A full submit**, then confirm the pair appears in the pending section, and that a rejected pair shows the officer's reason verbatim.
4. **Payload size and memory** with two full-resolution 12 MP photos — the reason the 2.5 MB ceiling exists is the JS heap on a low-end Android, so test on the cheapest device available, not a flagship.
5. **`sorting: "creationTime desc"`** on the `/my` call. If it 400s, drop the property (Task 2 Step 2 says why).
6. **A staff account** — merchant or refund point — sees **no** pending section and no upload control on the same screen.

## Deployment notes

- **DbMigrator must have run** and the seven `TagService.StickerManualVerifications.*` permissions must be granted **per environment**. Travellers need `.Upload` and `.ViewMine`; on dev these went only to two Refund Point roles, so a traveller account will show nothing until granted.
- **Users must re-authenticate** — the OAuth scope list changed, and a refresh grant reuses the original scope.
- Task 1's regeneration must be run against a backend that already carries the controller, or the whole plan is blocked.

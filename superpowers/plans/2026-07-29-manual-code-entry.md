# Manual Code Entry and 1D Barcode Resolution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every code that reaches the app a path to a tag — a typed sticker or tag number when the camera fails, and the Code128 tag-number barcode the POS already prints.

**Architecture:** Three layers, the first two pure and therefore testable. `classifyScan(raw, source)` turns a scanned or typed value into a `ScanClassification`, now using the barcode symbology to decide whether a bare value is a tag number. `scanDestination(classification, isStaff)` turns that into a routing decision — extracted from `useQrScanLauncher`, where it was tangled with navigation and untestable. `useScanRouting` performs the decision: navigate, toast, or resolve a tag number to its id. The manual-entry form builds a `ScanClassification` and calls the same `routeScan`, so typed input is not a second lookup path.

**Tech Stack:** React Native + Expo (expo-router), TypeScript, zustand, NativeWind, Jest, `@unirefund/qr`, `react-native-vision-camera`, generated `TagService` SDK.

**Spec:** [2026-07-29-manual-code-entry-design.md](../specs/2026-07-29-manual-code-entry-design.md)
**Catalogue:** #9, #18, #28 in `QR.md`

## Global Constraints

- **Working directory is `C:\mobile\app`.** All paths are relative to it. Branch: `role/staff`.
- **Never run `npm run gen`.** Every endpoint already exists in `src/saas/TagService`.
- **i18n edits go only in `src/localization/resources/en-US.json` and `src/localization/resources/tr-TR.json`** — never a `*.gen.json`, which is gitignored build output. Both languages in the same commit.
- **After editing locale sources run `npm run init` before `tsc`.** `TranslationKey` derives from the generated files; skip it and `tsc` wrongly rejects every new key.
- **Resource JSON is rooted without the `MobileApp.` prefix.** `t("MobileApp.Qr.X")` reads `Qr.X`.
- **Do not modify `src/screens/shared/TagPreviewScreen.tsx`.** Resolving a tag id before routing exists precisely so that screen needs no new branch.
- **Verification:** `npx tsc --noEmit`, `npx eslint <paths>`, `npm test`.
- **Four suites in `src/components/__tests__/` already fail to load** on a pre-existing `@testing-library/react-native` resolution error. Not a regression; never fix, never count. Everything else must pass. Baseline is **179 passing**.
- **Commit after every task** with the message given in that task's final step.

---

### Task 1: `classifyScan` learns the barcode symbology

**Files:**
- Modify: `src/utils/qr/classifyScan.ts`
- Test: `src/utils/qr/__tests__/classifyScan.test.ts`

**Interfaces:**
- Consumes: `decodeTagScan`, `extractValidateQrValue`, `TagSlugData` from `@unirefund/qr` (already imported).
- Produces: `export type ScanSource = "qr" | "linear"` and `classifyScan(raw: string, source?: ScanSource)`. The parameter defaults to `"qr"`, so every existing call site keeps compiling and keeps its current behaviour. Tasks 2–4 consume both.

**Why this exists.** POS receipts print `printBarcode(tagNumber, "code128")` alongside the tag QR, and the scanner's default symbologies include `code-128`, so that barcode is read today and then rejected — a bare tag number decodes to nothing. Task 1 of the sticker work deliberately pinned "a bare value stays `unknown`", because mobile has no wedge scanner and a half-decoded QR must not be looked up as an identifier. That rule was right for QR reads and too broad for 1D. The symbology separates the two cleanly, and `QrScanner` already knows it.

- [ ] **Step 1: Write the failing tests**

Append these inside the existing `describe("classifyScan", ...)` block in `src/utils/qr/__tests__/classifyScan.test.ts`:

```ts
  // A Code128 read cannot carry a URL, so a bare value from one is an
  // identifier rather than a failed decode. POS prints exactly this alongside
  // the tag QR.
  it("reads a bare value from a 1D barcode as a tag number", () => {
    const result = classifyScan("TR2026004182", "linear");
    expect(result.kind).toBe("tag");
    if (result.kind !== "tag") return;
    expect(result.data.tagNumber).toBe("TR2026004182");
    expect(result.data.tagId).toBe("");
    expect(result.data.travellerDocumentNumber).toBe("");
    expect(result.data.stickerLineNumber).toBe("");
  });

  // The narrowing from the sticker work, now scoped to 2D rather than removed:
  // a smudged QR that half-decodes into garbage must still be rejected.
  it("still rejects a bare value from a QR read", () => {
    expect(classifyScan("TR2026004182", "qr").kind).toBe("unknown");
    expect(classifyScan("TR2026004182").kind).toBe("unknown");
  });

  // The linear rule is a last resort, not a first: a 1D code that somehow
  // carries a real tag URL must still decode as one.
  it("decodes a slug even when it arrives from a 1D read", () => {
    const url = buildTagUrl(SSR, {
      tagNumber: "TR1",
      tagId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    });
    const result = classifyScan(url, "linear");
    expect(result.kind).toBe("tag");
    if (result.kind !== "tag") return;
    expect(result.data.tagId).toBe("3fa85f64-5717-4562-b3fc-2c963f66afa6");
  });

  it("reports an empty 1D read as unknown", () => {
    expect(classifyScan("   ", "linear").kind).toBe("unknown");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest src/utils/qr/__tests__/classifyScan.test.ts
```

Expected: the first test FAILS (`Received: "unknown"`). The other three already pass — they are regression pins.

- [ ] **Step 3: Add the `ScanSource` type and the linear branch**

In `src/utils/qr/classifyScan.ts`, add above `ScanClassification`:

```ts
/**
 * How a value reached us, which decides what a bare value means.
 *
 * A 2D code (`qr`) carries a slug, so anything that fails to decode is a bad
 * read. A 1D code (`linear`) cannot carry a URL at all, so a bare value from one
 * is an identifier — the POS prints the tag number as Code128 beside the QR.
 */
export type ScanSource = "qr" | "linear";
```

Change the signature and the tail of the function:

```ts
export function classifyScan(
  raw: string,
  source: ScanSource = "qr",
): ScanClassification {
```

and replace the final `return { kind: "unknown", raw: trimmed };` with:

```ts
  // Last resort, and only for 1D: the value decoded as nothing, but a linear
  // symbology has no other shape it could have been. Deliberately after every
  // decode attempt, so a 1D code carrying a real tag URL still resolves as one.
  if (source === "linear") {
    return {
      kind: "tag",
      data: {
        tagNumber: trimmed,
        tagId: "",
        travellerDocumentNumber: "",
        stickerLineNumber: "",
      },
    };
  }

  return { kind: "unknown", raw: trimmed };
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest src/utils/qr/__tests__/classifyScan.test.ts
```

Expected: PASS, all cases.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/utils/qr/classifyScan.ts src/utils/qr/__tests__/classifyScan.test.ts
git commit -m "feat(qr): read a bare value from a 1D barcode as a tag number"
```

---

### Task 2: `scanDestination`, the shared routing decision

**Files:**
- Create: `src/utils/qr/scanDestination.ts`
- Test: `src/utils/qr/__tests__/scanDestination.test.ts`

**Interfaces:**
- Consumes: `ScanClassification` from `./classifyScan` (Task 1).
- Produces: `ScanDestination` and `scanDestination(result, isStaff)`. Task 3 consumes both.

**This is an extraction, not a redesign.** Every destination it returns is what `useQrScanLauncher.onScanned` produces today, with **one deliberate exception**, called out so a reviewer does not read it as an accident: a tag classification carrying only `tagNumber` currently routes to `/tag-preview`, where no resolution branch matches it, and dead-ends at "Tag not found". It now returns `resolve-tag-number` or `need-traveller-document` instead. That shape is what Task 1's linear branch produces and what manual tag entry produces, so leaving it broken would defeat the feature.

- [ ] **Step 1: Write the failing tests**

Create `src/utils/qr/__tests__/scanDestination.test.ts`:

```ts
import type { ScanClassification } from "@/utils/qr/classifyScan";
import { scanDestination } from "@/utils/qr/scanDestination";

const TAG_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

function tag(over: Partial<ScanClassification & { kind: "tag" }>["data"] = {}) {
  return {
    kind: "tag" as const,
    data: {
      tagNumber: "",
      tagId: "",
      travellerDocumentNumber: "",
      stickerLineNumber: "",
      ...over,
    },
  };
}

describe("scanDestination — tag", () => {
  it("routes a tag carrying an id to the preview, for either role", () => {
    for (const isStaff of [true, false]) {
      const d = scanDestination(tag({ tagId: TAG_ID, tagNumber: "TR1" }), isStaff);
      expect(d).toEqual({
        kind: "route",
        pathname: "/tag-preview",
        params: { tagId: TAG_ID, tagNumber: "TR1", travellerDocumentNumber: "" },
      });
    }
  });

  it("routes a tag number plus document to the preview", () => {
    const d = scanDestination(
      tag({ tagNumber: "TR1", travellerDocumentNumber: "U12345678" }),
      false,
    );
    expect(d).toEqual({
      kind: "route",
      pathname: "/tag-preview",
      params: {
        tagId: "",
        tagNumber: "TR1",
        travellerDocumentNumber: "U12345678",
      },
    });
  });

  // The preview resolves by id, or by number + document. A bare number matches
  // neither, so it needs a step first — which one depends on the role.
  it("asks staff to resolve a bare tag number", () => {
    expect(scanDestination(tag({ tagNumber: "TR1" }), true)).toEqual({
      kind: "resolve-tag-number",
      tagNumber: "TR1",
    });
  });

  it("asks a traveller for their document alongside a bare tag number", () => {
    expect(scanDestination(tag({ tagNumber: "TR1" }), false)).toEqual({
      kind: "need-traveller-document",
      tagNumber: "TR1",
    });
  });
});

describe("scanDestination — sticker", () => {
  const sticker = { kind: "sticker" as const, stickerLineNumber: "SL-0007" };

  it("sends staff to the create screen", () => {
    expect(scanDestination(sticker, true)).toEqual({
      kind: "route",
      pathname: "/sticker-tag",
      params: { stickerLineNumber: "SL-0007" },
    });
  });

  it("sends everyone else to the public preview", () => {
    expect(scanDestination(sticker, false)).toEqual({
      kind: "route",
      pathname: "/tag-preview",
      params: { stickerLineNumber: "SL-0007" },
    });
  });
});

describe("scanDestination — validate", () => {
  const validate = { kind: "validate" as const, qrValue: "abc-123" };

  it("sends a traveller to the validate flow", () => {
    expect(scanDestination(validate, false)).toEqual({
      kind: "route",
      pathname: "/validate",
      params: { qrValue: "abc-123" },
    });
  });

  // Airport validation is the traveller's own act; staff have nothing to do
  // with it, so the code is recognised and refused rather than routed.
  it("blocks staff", () => {
    expect(scanDestination(validate, true)).toEqual({ kind: "blocked" });
  });
});

describe("scanDestination — unknown", () => {
  it("reports an unrecognised scan for either role", () => {
    for (const isStaff of [true, false]) {
      expect(
        scanDestination({ kind: "unknown", raw: "junk" }, isStaff),
      ).toEqual({ kind: "unrecognized" });
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest src/utils/qr/__tests__/scanDestination.test.ts
```

Expected: FAIL — `Cannot find module '@/utils/qr/scanDestination'`.

- [ ] **Step 3: Implement the decision**

Create `src/utils/qr/scanDestination.ts`:

```ts
import type { ScanClassification } from "./classifyScan";

/**
 * What to do about a classified scan. A decision, not an action — the caller
 * navigates, toasts or looks up.
 *
 * Pulled out of `useQrScanLauncher`, where it sat inside `onScanned` interleaved
 * with `router.push` calls, so nothing else could reuse it and nothing could test
 * it. The manual-entry form now routes through exactly this, which is what keeps
 * typed input from becoming a second lookup path that drifts.
 */
export type ScanDestination =
  | {
      kind: "route";
      pathname: "/tag-preview" | "/sticker-tag" | "/validate";
      params: Record<string, string>;
    }
  /** Staff hold a bare tag number: look up its id, then open the tag. */
  | { kind: "resolve-tag-number"; tagNumber: string }
  /** A traveller's bare tag number: the public read also needs their document. */
  | { kind: "need-traveller-document"; tagNumber: string }
  /** A validate QR in staff hands — recognised, but not theirs to act on. */
  | { kind: "blocked" }
  | { kind: "unrecognized" };

export function scanDestination(
  result: ScanClassification,
  isStaff: boolean,
): ScanDestination {
  switch (result.kind) {
    case "tag": {
      const { tagId, tagNumber, travellerDocumentNumber } = result.data;
      // `TagPreviewScreen` resolves by tag id, or by tag number *and* traveller
      // document, or by sticker line. A bare tag number matches none of them, so
      // routing it straight there would dead-end at "not found". Which step is
      // needed depends on the role: staff can read tenant-scoped by number,
      // while a traveller's public read demands the document too.
      if (!tagId && !travellerDocumentNumber) {
        return isStaff
          ? { kind: "resolve-tag-number", tagNumber }
          : { kind: "need-traveller-document", tagNumber };
      }
      return {
        kind: "route",
        pathname: "/tag-preview",
        params: { tagId, tagNumber, travellerDocumentNumber },
      };
    }

    case "sticker":
      // Staff issue a tag against the sticker; everyone else — travellers, and
      // anyone scanning before login, who has no role at all — reads the tag
      // already issued on it. That read needs no token.
      return {
        kind: "route",
        pathname: isStaff ? "/sticker-tag" : "/tag-preview",
        params: { stickerLineNumber: result.stickerLineNumber },
      };

    case "validate":
      return isStaff
        ? { kind: "blocked" }
        : {
            kind: "route",
            pathname: "/validate",
            params: { qrValue: result.qrValue },
          };

    case "unknown":
      return { kind: "unrecognized" };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest src/utils/qr/__tests__/scanDestination.test.ts
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
npx eslint src/utils/qr
git add src/utils/qr/scanDestination.ts src/utils/qr/__tests__/scanDestination.test.ts
git commit -m "feat(qr): extract the scan routing decision as a pure function"
```

---

### Task 3: Manual entry — the action, the routing hook, and the form

Ships a complete feature: `/manual-entry` resolves a typed sticker or tag number for either role. Task 4 puts a link to it on the scanner.

**Files:**
- Modify: `src/actions/TagService/actions.ts`
- Create: `src/hooks/useScanRouting.ts`
- Create: `src/screens/shared/ManualEntryScreen.tsx`
- Create: `src/app/manual-entry.tsx`
- Modify: `src/app/_layout.tsx`
- Modify: `src/localization/resources/en-US.json`
- Modify: `src/localization/resources/tr-TR.json`

**Interfaces:**
- Consumes: `ScanClassification`, `ScanSource` (Task 1); `ScanDestination`, `scanDestination` (Task 2).
- Produces:
  - `getTagDetailByTagNumber(tagNumber: string): Promise<UniRefund_TagService_Tags_TagDetailDto>` — throws on failure
  - `useScanRouting(): { routeScan: (result: ScanClassification) => Promise<void> }`
  - route `/manual-entry`, accepting optional params `mode` (`"sticker" | "tag"`) and `tagNumber`
  Task 4 consumes `useScanRouting`.

The hook and the screen are one task because they are mutually dependent: the screen calls `routeScan`, and `routeScan`'s `need-traveller-document` outcome pushes the screen. Splitting them would leave a broken intermediate state.

- [ ] **Step 1: Add the tag-number lookup action**

Append to `src/actions/TagService/actions.ts`:

```ts
/**
 * Tenant-scoped tag detail by tag number, for staff who hold a number but no id
 * — a typed entry, or the Code128 the POS prints beside the tag QR.
 *
 * Its `id` is what `TagPreviewScreen` needs: that screen resolves by tag id, or
 * by tag number *and* traveller document, and staff have no document to offer.
 * Resolving here means that screen needs no new branch.
 *
 * Throws on failure, like its `fetchRequest` siblings, so the caller can tell a
 * 404 ("no such tag") from a transient failure.
 */
export async function getTagDetailByTagNumber(tagNumber: string) {
  return await fetchRequest(async (customHeaders) => {
    const client = await getTagServiceClient(customHeaders);
    return await client.tag.getApiTagServiceTagByTagNumberDetailByTagNumber({
      tagNumber,
    });
  }, "getTagDetailByTagNumber");
}
```

- [ ] **Step 2: Add the i18n keys to both languages**

In `src/localization/resources/en-US.json`, inside `Qr`, as a sibling of `StickerTag`:

```json
    "ManualEntryLink": "Can't scan? Enter it manually",
    "ManualEntry": {
      "Title": "Enter code manually",
      "ModeSticker": "Sticker",
      "ModeTag": "Tag",
      "StickerNumber": "Sticker number",
      "StickerNumberPlaceholder": "e.g. SL-0007",
      "StickerNumberHint": "The number printed beside the QR on the sticker.",
      "TagNumber": "Tag number",
      "TagNumberPlaceholder": "e.g. TR2026004182",
      "TagNumberHint": "The number printed on the tax-free receipt.",
      "PassportNumber": "Passport number",
      "PassportNumberPlaceholder": "e.g. U12345678",
      "PassportHint": "Needed to look up a tag by its number.",
      "Submit": "Continue",
      "Searching": "Searching…",
      "MissingSticker": "Enter the sticker number.",
      "MissingTagNumber": "Enter the tag number.",
      "MissingPassport": "Enter your passport number as well.",
      "TagNotFound": "No tag found with that number.",
      "LookupFailed": "Couldn't look that up. Please try again."
    },
```

In `src/localization/resources/tr-TR.json`, the same block:

```json
    "ManualEntryLink": "Okutamıyor musunuz? Elle girin",
    "ManualEntry": {
      "Title": "Kodu elle girin",
      "ModeSticker": "Etiket",
      "ModeTag": "Tag",
      "StickerNumber": "Etiket numarası",
      "StickerNumberPlaceholder": "örn. SL-0007",
      "StickerNumberHint": "Etiketin üzerinde QR kodun yanında yazan numara.",
      "TagNumber": "Tag numarası",
      "TagNumberPlaceholder": "örn. TR2026004182",
      "TagNumberHint": "Vergi iadesi fişinin üzerinde yazan numara.",
      "PassportNumber": "Pasaport numarası",
      "PassportNumberPlaceholder": "örn. U12345678",
      "PassportHint": "Tag'i numarasıyla bulmak için gereklidir.",
      "Submit": "Devam et",
      "Searching": "Aranıyor…",
      "MissingSticker": "Etiket numarasını girin.",
      "MissingTagNumber": "Tag numarasını girin.",
      "MissingPassport": "Ayrıca pasaport numaranızı da girin.",
      "TagNotFound": "Bu numaraya ait bir tag bulunamadı.",
      "LookupFailed": "Sorgulama yapılamadı. Lütfen tekrar deneyin."
    },
```

- [ ] **Step 3: Create `useScanRouting`**

Create `src/hooks/useScanRouting.ts`:

```ts
import { getTagDetailByTagNumber } from "@/actions/TagService/actions";
import { ApiError } from "@/saas/AccountService";
import { useLocalization } from "@/providers/LocalizationProvider";
import { useToastRef } from "@/providers/ToastProvider";
import useUserStore from "@/store/user";
import type { ScanClassification } from "@/utils/qr/classifyScan";
import { scanDestination } from "@/utils/qr/scanDestination";
import { logger } from "@/utils/logger";
import { router } from "expo-router";
import { useCallback } from "react";

/**
 * Performs a scan decision: navigate, toast, or resolve a tag number first.
 *
 * The decision itself is `scanDestination`, which is pure and tested; everything
 * impure lives here. Split out from `useQrScanLauncher` because the manual-entry
 * screen needs the routing but not the scanner's visibility state — making it
 * instantiate the whole launcher for one callback would be the wrong seam.
 */
export function useScanRouting() {
  const { t } = useLocalization();
  const toastRef = useToastRef();
  const { isMerchant, isRefundPoint } = useUserStore();
  const isStaff = isMerchant || isRefundPoint;

  const routeScan = useCallback(
    async (result: ScanClassification) => {
      const destination = scanDestination(result, isStaff);

      switch (destination.kind) {
        case "route":
          router.push({
            pathname: destination.pathname,
            params: destination.params,
          });
          return;

        case "resolve-tag-number": {
          // Staff hold a number but no id; the preview screen needs the id.
          try {
            const detail = await getTagDetailByTagNumber(destination.tagNumber);
            if (!detail?.id) {
              toastRef.current?.show(
                "error",
                t("MobileApp.Qr.ManualEntry.TagNotFound"),
              );
              return;
            }
            router.push({
              pathname: "/tag-preview",
              params: { tagId: detail.id, tagNumber: detail.tagNumber },
            });
          } catch (error) {
            logger.warn("[ScanRouting] tag lookup by number failed", error);
            // Only a 404 means no such tag. A timeout or a 5xx says nothing
            // about the number the user gave us, and telling them it is wrong
            // would send them off correcting something that was already right.
            const isNotFound = error instanceof ApiError && error.status === 404;
            toastRef.current?.show(
              "error",
              t(
                isNotFound
                  ? "MobileApp.Qr.ManualEntry.TagNotFound"
                  : "MobileApp.Qr.ManualEntry.LookupFailed",
              ),
            );
          }
          return;
        }

        case "need-traveller-document":
          // A traveller's public read needs the document too, so hand them the
          // form with what we already know filled in rather than a dead end.
          router.push({
            pathname: "/manual-entry",
            params: { mode: "tag", tagNumber: destination.tagNumber },
          });
          return;

        case "blocked":
          toastRef.current?.show(
            "error",
            t("MobileApp.Qr.ValidateStaffBlocked"),
          );
          return;

        case "unrecognized":
          toastRef.current?.show("error", t("MobileApp.Qr.Unrecognized"));
          return;
      }
    },
    [isStaff, t, toastRef],
  );

  return { routeScan };
}
```

If `tsc` rejects `pathname: destination.pathname` because expo-router's typed routes will not accept the union, replace that single `router.push` with three explicit pushes inside `if (destination.pathname === "/sticker-tag") … else if (… === "/validate") … else …`, each with the same `params`. Report which you needed.

- [ ] **Step 4: Create the manual-entry screen**

Create `src/screens/shared/ManualEntryScreen.tsx`:

```tsx
import Button from "@/components/Button";
import { Ionicons } from "@/components/Ionicons";
import Input from "@/components/Input";
import { useScanRouting } from "@/hooks/useScanRouting";
import { useLocalization } from "@/providers/LocalizationProvider";
import useUserStore from "@/store/user";
import { ModalTemplate } from "@/templates/Modal";
import { cn } from "@/utils/cn";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

type Mode = "sticker" | "tag";

/**
 * Typed fallback for a code the camera cannot read.
 *
 * Every mode has the same exit: build a `ScanClassification` and hand it to
 * `routeScan` — the identical call the scanner makes. Manual entry is therefore
 * not a second lookup path that can drift from the scanned one; it is the same
 * path entered further along.
 *
 * Root route, so it works logged out (the role gate and the traveller login
 * screen both offer scanning) as well as logged in.
 */
export function ManualEntryScreen() {
  const params = useLocalSearchParams<{ mode?: string; tagNumber?: string }>();
  const { t } = useLocalization();
  const { isMerchant, isRefundPoint } = useUserStore();
  const isStaff = isMerchant || isRefundPoint;
  const { routeScan } = useScanRouting();

  const [mode, setMode] = useState<Mode>(
    params.mode === "tag" ? "tag" : "sticker",
  );
  const [stickerNumber, setStickerNumber] = useState("");
  const [tagNumber, setTagNumber] = useState(params.tagNumber?.trim() ?? "");
  const [passport, setPassport] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  async function submit() {
    if (isSubmitting) return;
    setError(null);

    if (mode === "sticker") {
      const value = stickerNumber.trim();
      if (!value) {
        setError(t("MobileApp.Qr.ManualEntry.MissingSticker"));
        return;
      }
      setIsSubmitting(true);
      await routeScan({ kind: "sticker", stickerLineNumber: value });
      setIsSubmitting(false);
      return;
    }

    const number = tagNumber.trim();
    if (!number) {
      setError(t("MobileApp.Qr.ManualEntry.MissingTagNumber"));
      return;
    }
    // Staff read tenant-scoped by number alone; a traveller's public read needs
    // the document too, and a slug carrying only the number would resolve to
    // nothing and read as the search having silently done nothing.
    const document = passport.trim();
    if (!isStaff && !document) {
      setError(t("MobileApp.Qr.ManualEntry.MissingPassport"));
      return;
    }

    setIsSubmitting(true);
    await routeScan({
      kind: "tag",
      data: {
        tagNumber: number,
        tagId: "",
        travellerDocumentNumber: isStaff ? "" : document,
        stickerLineNumber: "",
      },
    });
    setIsSubmitting(false);
  }

  const modes: { value: Mode; label: string }[] = [
    { value: "sticker", label: t("MobileApp.Qr.ManualEntry.ModeSticker") },
    { value: "tag", label: t("MobileApp.Qr.ManualEntry.ModeTag") },
  ];

  return (
    <ModalTemplate
      title={t("MobileApp.Qr.ManualEntry.Title")}
      backAction={() => router.back()}
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-4 pt-2">
        <View className="flex-row gap-2">
          {modes.map((m) => (
            <Pressable
              key={m.value}
              onPress={() => switchMode(m.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === m.value }}
              className={cn(
                "flex-1 items-center rounded-xl border px-2 py-2",
                mode === m.value
                  ? "border-primary bg-primary/10"
                  : "border-gray-300",
              )}
            >
              <Text className="text-xs font-medium text-foreground">
                {m.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {mode === "sticker" ? (
          <View>
            <Input
              title={t("MobileApp.Qr.ManualEntry.StickerNumber")}
              iconName="pricetag-outline"
              value={stickerNumber}
              onChangeText={setStickerNumber}
              placeholder={t(
                "MobileApp.Qr.ManualEntry.StickerNumberPlaceholder",
              )}
              autoCapitalize="characters"
              onSubmitEditing={submit}
            />
            <Text className="text-xs text-muted">
              {t("MobileApp.Qr.ManualEntry.StickerNumberHint")}
            </Text>
          </View>
        ) : (
          <>
            <View>
              <Input
                title={t("MobileApp.Qr.ManualEntry.TagNumber")}
                iconName="receipt-outline"
                value={tagNumber}
                onChangeText={setTagNumber}
                placeholder={t("MobileApp.Qr.ManualEntry.TagNumberPlaceholder")}
                autoCapitalize="characters"
                onSubmitEditing={submit}
              />
              <Text className="text-xs text-muted">
                {t("MobileApp.Qr.ManualEntry.TagNumberHint")}
              </Text>
            </View>
            {!isStaff && (
              <View>
                <Input
                  title={t("MobileApp.Qr.ManualEntry.PassportNumber")}
                  iconName="document-text-outline"
                  value={passport}
                  onChangeText={setPassport}
                  placeholder={t(
                    "MobileApp.Qr.ManualEntry.PassportNumberPlaceholder",
                  )}
                  autoCapitalize="characters"
                  onSubmitEditing={submit}
                />
                <Text className="text-xs text-muted">
                  {t("MobileApp.Qr.ManualEntry.PassportHint")}
                </Text>
              </View>
            )}
          </>
        )}

        {error && (
          <View className="flex-row items-start gap-2">
            <Ionicons name="alert-circle-outline" size={18} color="#ef4444" />
            <Text className="flex-1 text-sm text-red-500">{error}</Text>
          </View>
        )}

        <Button
          action={{
            onPress: submit,
            label: isSubmitting
              ? t("MobileApp.Qr.ManualEntry.Searching")
              : t("MobileApp.Qr.ManualEntry.Submit"),
          }}
          isLoading={isSubmitting}
        />
      </View>
    </ModalTemplate>
  );
}
```

If `receipt-outline` or `pricetag-outline` is rejected by the `IoniconsTypes` union, use `document-text-outline` and `pricetags-outline` respectively; report which you used.

**One deliberate divergence from the spec, so a reviewer does not read it as drift.** The spec said a failed staff tag lookup shows an *inline* error on the form. It surfaces as a toast instead, because the lookup lives in `useScanRouting` — shared with the scanner, which has no form to write into. Nothing is lost either way: the lookup failing means no navigation happens, so the screen stays exactly as the user left it with their input intact. Keeping one lookup path was worth more than the inline placement.

- [ ] **Step 5: Add the route and register it**

Create `src/app/manual-entry.tsx`:

```tsx
import { ManualEntryScreen } from "@/screens/shared/ManualEntryScreen";

export default ManualEntryScreen;
```

In `src/app/_layout.tsx`, add below the existing `sticker-tag` line inside `RootNavigator`:

```tsx
      <Stack.Screen name="manual-entry" options={{ animation: "slide_from_bottom" }} />
```

- [ ] **Step 6: Verify**

```bash
npm run init
npx tsc --noEmit
npx eslint src/hooks src/screens/shared/ManualEntryScreen.tsx src/app/manual-entry.tsx src/actions/TagService/actions.ts
npm test
```

Expected: `tsc` exit 0; no lint errors; 183 tests passing (179 plus Task 1's and Task 2's additions), with only the four known `src/components/__tests__/` load failures.

If `tsc` rejects `"/manual-entry"` as an unknown route, start the dev server once (`npx expo start`) to regenerate `.expo/types/router.d.ts`, stop it, and re-run. Report what you needed.

- [ ] **Step 7: Commit**

```bash
git add src/actions/TagService/actions.ts src/hooks/useScanRouting.ts src/screens/shared/ManualEntryScreen.tsx src/app/manual-entry.tsx src/app/_layout.tsx src/localization/resources/en-US.json src/localization/resources/tr-TR.json
git commit -m "feat(qr): add manual sticker and tag number entry"
```

---

### Task 4: Put the fallback on the scanner, and pass the symbology through

Ships the other half: the link is discoverable at the moment the camera fails, and a Code128 read resolves.

**Files:**
- Modify: `src/components/QrScanner.tsx`
- Modify: `src/hooks/useQrScanLauncher.tsx`
- Modify: `src/app/(auth)/_layout.tsx`
- Modify: `src/screens/shared/_components/ScanEntry.tsx`
- Modify: `src/screens/shared/_components/SeamScanPill.tsx`
- Modify: `src/screens/traveller/TravellerLoginScreen.tsx`
- Modify: `src/screens/traveller/Validate/FlightInfoStep.tsx` (only if its `onScanned` signature no longer matches)

**Interfaces:**
- Consumes: `classifyScan`, `ScanSource` (Task 1); `useScanRouting` (Task 3).
- Produces: `useQrScanLauncher` keeps `{ visible, open, close, onScanned, subtitle }` and gains `openManualEntry: () => void`. `QrScanner`'s `onScanned` widens to `(raw: string, source: ScanSource) => void` and it gains `onManualEntry?: () => void`.

- [ ] **Step 1: Teach `QrScanner` the symbology and the link**

In `src/components/QrScanner.tsx`, add the import and the mapping above the component:

```tsx
import type { ScanSource } from "@/utils/qr/classifyScan";
```

```tsx
/**
 * 1D symbologies among the types we scan. A linear code cannot carry a URL, so a
 * bare value read from one is an identifier rather than a failed decode — the
 * POS prints the tag number as Code128 beside the tag QR. Anything not listed
 * here is treated as 2D, which is the strict answer: an unvetted symbology
 * cannot fabricate a tag number.
 */
const LINEAR_TYPES = new Set<CodeType>([
  "code-128",
  "code-39",
  "code-93",
  "codabar",
  "ean-13",
  "ean-8",
  "itf",
  "itf-14",
  "upc-a",
  "upc-e",
]);

function sourceOf(type: CodeType): ScanSource {
  return LINEAR_TYPES.has(type) ? "linear" : "qr";
}
```

Widen the prop and add the new one in `interface Props`:

```tsx
  onScanned: (raw: string, source: ScanSource) => void;
  /** Renders a "can't scan?" link under the guide box when provided. */
  onManualEntry?: () => void;
```

Destructure `onManualEntry` in the component signature, pass the symbology at the call:

```tsx
        lockRef.current = true;
        onScanned(value, sourceOf(code.type));
        return;
```

and render the link inside the existing status block:

```tsx
        {/* Status text */}
        <View style={s.statusBlock}>
          <Text style={s.guideText}>{subtitle}</Text>
          {onManualEntry && (
            <Pressable
              onPress={onManualEntry}
              hitSlop={12}
              accessibilityRole="button"
              style={{ marginTop: 14 }}
            >
              <Text style={s.manualLink}>{manualEntryLabel}</Text>
            </Pressable>
          )}
        </View>
```

Add the label as a prop rather than importing i18n into this presentational component — it already takes `title` and `subtitle` the same way. In `interface Props`:

```tsx
  /** Label for the manual-entry link. Required when `onManualEntry` is given. */
  manualEntryLabel?: string;
```

and destructure it with a default of `"Enter code manually"`. Add the style:

```tsx
  manualLink: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
```

- [ ] **Step 2: Rebuild the launcher on `useScanRouting`**

Replace the body of `src/hooks/useQrScanLauncher.tsx` with:

```tsx
import { useScanRouting } from "@/hooks/useScanRouting";
import { useLocalization } from "@/providers/LocalizationProvider";
import useUserStore from "@/store/user";
import { classifyScan, type ScanSource } from "@/utils/qr/classifyScan";
import { router } from "expo-router";
import { useCallback, useState } from "react";

/**
 * Drives a `QrScanner`: owns its visibility, and hands a decoded value to the
 * shared scan routing — the same routing the manual-entry form uses, so a typed
 * code and a scanned one cannot diverge.
 *
 * Usage:
 *   const scan = useQrScanLauncher();
 *   <Button onPress={scan.open} />
 *   <QrScanner visible={scan.visible} onScanned={scan.onScanned} onCancel={scan.close}
 *              subtitle={scan.subtitle} onManualEntry={scan.openManualEntry}
 *              manualEntryLabel={scan.manualEntryLabel} />
 */
export function useQrScanLauncher() {
  const { t } = useLocalization();
  const { isMerchant, isRefundPoint } = useUserStore();
  const isStaff = isMerchant || isRefundPoint;
  const [visible, setVisible] = useState(false);
  const { routeScan } = useScanRouting();

  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);

  // Staff scan tags and store stickers only — the airport QR is rejected for
  // them, so promising it in the scanner prompt would be a dead end. Role-less
  // callers (role gate, login) get the traveller wording, which is the superset
  // and matches what those screens can actually route to.
  const subtitle = t(
    isStaff
      ? "MobileApp.Qr.ScanTagSubtitleStaff"
      : "MobileApp.Qr.ScanTagSubtitle",
  );
  const manualEntryLabel = t("MobileApp.Qr.ManualEntryLink");

  const onScanned = useCallback(
    (raw: string, source: ScanSource) => {
      setVisible(false);
      void routeScan(classifyScan(raw, source));
    },
    [routeScan],
  );

  /** Closes the camera and hands over to the typed fallback. */
  const openManualEntry = useCallback(() => {
    setVisible(false);
    router.push("/manual-entry");
  }, []);

  return {
    visible,
    open,
    close,
    onScanned,
    subtitle,
    openManualEntry,
    manualEntryLabel,
  };
}
```

- [ ] **Step 3: Wire the four call sites**

In each of `src/app/(auth)/_layout.tsx`, `src/screens/shared/_components/ScanEntry.tsx`, `src/screens/shared/_components/SeamScanPill.tsx` and `src/screens/traveller/TravellerLoginScreen.tsx`, add two props to the `<QrScanner …>` element that is already driven by `useQrScanLauncher`:

```tsx
        onManualEntry={scan.openManualEntry}
        manualEntryLabel={scan.manualEntryLabel}
```

Do **not** add them to the boarding-pass scanner in `src/screens/traveller/Validate/FlightInfoStep.tsx`: it reads an IATA barcode rather than a Unirefund code and already has its own manual tab. If its `onScanned` no longer typechecks against the widened signature, give its handler a second parameter it ignores — do not change its behaviour.

- [ ] **Step 4: Verify**

```bash
npm run init
npx tsc --noEmit
npx eslint src/components/QrScanner.tsx src/hooks src/screens src/app
npm test
```

Expected: `tsc` exit 0; no lint errors; the same 183 tests passing and only the four known load failures.

- [ ] **Step 5: Commit**

```bash
git add src/components/QrScanner.tsx src/hooks/useQrScanLauncher.tsx "src/app/(auth)/_layout.tsx" src/screens/shared/_components/ScanEntry.tsx src/screens/shared/_components/SeamScanPill.tsx src/screens/traveller/TravellerLoginScreen.tsx
git commit -m "feat(qr): offer manual entry from the scanner and resolve 1D reads"
```

---

### Task 5: Record the delivered state

**Files:**
- Modify: `QR.md`
- Modify: `QR_FEATURE_CHECKLIST.md`

- [ ] **Step 1: Flip the catalogue rows**

In `QR.md`, in section A change row 9's mobile column from `❌` to `✅`; in section B change row 18's likewise; in section C change row 28's likewise. Leave every other row alone.

Then in the **Do** table, remove rows 9, 18 and 28, and add a line directly beneath the table:

```markdown
**Delivered 2026-07-29:** #9, #18 and #28 — one change, since all three are the same shortfall. Design and plan: `docs/superpowers/specs/2026-07-29-manual-code-entry-design.md` and `docs/superpowers/plans/2026-07-29-manual-code-entry.md` in `mobile/app`.
```

- [ ] **Step 2: Mirror the catalogue to the other repo**

The catalogue section is kept byte-identical in both copies. Run from `C:\mobile\app`:

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

Then confirm they match:

```bash
diff <(sed -n '/^---$/,$p' QR.md) <(sed -n '/^---$/,$p' /c/Users/ertugrul.bakas.AYASOFYAZILIM/Repositories/unirefund-web/QR.md) && echo IDENTICAL
```

Both `QR.md` files are untracked in their repos; leave them untracked.

- [ ] **Step 3: Append to the feature checklist**

Append to `QR_FEATURE_CHECKLIST.md`:

```markdown
## Phase 6 — Manual entry and 1D barcodes (2026-07-29)
Design: `docs/superpowers/specs/2026-07-29-manual-code-entry-design.md`
Plan: `docs/superpowers/plans/2026-07-29-manual-code-entry.md`
Catalogue: #9, #18, #28

- [x] `classifyScan(raw, source)` takes the barcode symbology. A bare value from a 1D read is a tag number; from a QR read it stays `unknown`, so a half-decoded QR still cannot be looked up as an identifier.
- [x] `scanDestination(classification, isStaff)` extracted from `useQrScanLauncher` — pure, tested, and shared with manual entry. A bare tag number, which previously dead-ended at "not found", now resolves per role.
- [x] `useScanRouting` owns the effects: navigate, toast, or resolve a tag number to its id via `getTagDetailByTagNumber`.
- [x] `/manual-entry` root route with Sticker and Tag modes. Staff see no passport field; a traveller's public read needs one. Every mode exits through the same `routeScan` the scanner uses.
- [x] "Can't scan? Enter it manually" on the scanner overlay, wired at all four call sites. The boarding-pass scanner is deliberately untouched.
- [ ] Native verification on device: scan a POS Code128, type a sticker number as each role, and type a tag number as staff and as a traveller.
```

- [ ] **Step 4: Final verification**

```bash
npx tsc --noEmit
npm run lint
npm test
```

Expected: `tsc` exit 0; lint clean or only pre-existing warnings in untouched files; 183 passing plus the four known load failures.

- [ ] **Step 5: Commit**

```bash
git add QR_FEATURE_CHECKLIST.md
git commit -m "docs(qr): record manual entry and 1D barcode resolution"
```

---

## Not verifiable in this environment

- **A real POS Code128 read.** That the barcode yields exactly the tag number, and that vision-camera reports its type as `code-128`, need a device and a printed receipt.
- **Whether a damaged sticker's printed number is legible enough to type** — the premise of the whole feature, and only a real sticker can settle it.
- **Camera behaviour** generally: permissions, focus, and the link's tap target under the guide box.

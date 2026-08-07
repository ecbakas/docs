# Sticker Manual Verification (web-app) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a traveller submit photos of a physical sticker and tax-free form from `apps/ssr`, and let a refund officer review that pair in `apps/web` and either reject it with a reason or issue a tag from it.

**Architecture:** Six server-action wrappers in `@repo/actions` are the only code the two halves share. `apps/web` gets a worklist → review → create-tag route group under `operations/manual-verifications`, reusing the merchant-resolution and invoice components `scan-sticker` already owns. `apps/ssr` folds a pending-uploads section and an upload dialog into the existing `/tags` page. A still-image barcode decoder added to the `ayasofyazilim-ui` submodule reads the sticker QR out of the uploaded photo to prefill the line number.

**Tech Stack:** Next.js App Router (React 19), TypeScript, `@repo/ayasofyazilim-ui` (shadcn primitives + `MasterDataGrid`), `@repo/actions` server actions, `@zxing/browser` + `@zxing/library`, `@unirefund/qr`, Jest (submodule only).

**Spec:** [`docs/superpowers/specs/2026-08-07-sticker-manual-verification-web-design.md`](../specs/2026-08-07-sticker-manual-verification-web-design.md)

## Global Constraints

- **Repo:** `c:\unirefund\web-app`, branch `feat/manual-verification`. The TagService proxy is already generated (`f147278f0`); do **not** regenerate it.
- **No SDK clients in app code.** Every API call goes through a server action in `@repo/actions`. `actions.ts` = GET, `throw structuredError(error)`. `post-actions.ts` = POST, `return structuredError(error)`. See [`.claude/rules/api-actions.md`](../../../web-app/.claude/rules/api-actions.md).
- **No hardcoded UI strings.** Every visible string is a key in both `en.json` and `tr.json`. Never edit `src/language-data/i18n/**` by hand — it is generated. See [`.claude/rules/i18n.md`](../../../web-app/.claude/rules/i18n.md).
- **`pnpm run init` must run in an app after adding i18n keys**, before `tsc` can see them. A missing `init` surfaces as a type error in the component, not as a missing key.
- **`data-testid` is mandatory** on `Label, Link, Checkbox, Switch, Button, Input, SelectTrigger, PopoverTrigger, DialogTrigger, DrawerTrigger, TabsTrigger, AccordionTrigger, CollapsibleTrigger, AlertDialog` and the other triggers listed in [`.claude/rules/data-testid.md`](../../../web-app/.claude/rules/data-testid.md). Kebab-case, prefixed with the page or feature name. ESLint enforces it.
- **No `useEffect`** for derived state or event responses. Use `useMemo`, event handlers, or the render-time "adjust state when a prop changes" pattern `TagForm` already uses. See [`.claude/rules/avoid-use-effect.md`](../../../web-app/.claude/rules/avoid-use-effect.md).
- **UI only from `@repo/ayasofyazilim-ui/components/*` and `/custom/*`.** Never install or import another component library. See [`.claude/rules/ui-components.md`](../../../web-app/.claude/rules/ui-components.md).
- **`apps/web` and `apps/ssr` have no unit-test runner.** Both have Playwright, but it runs against a live environment with an auth setup step, and this feature responds to nothing until DbMigrator has run and permissions are granted. Do **not** install Jest or Vitest in either app. Their per-task gate is `pnpm type-check` + `pnpm lint` + the stated manual check. The `ayasofyazilim-ui` submodule **does** have Jest, and Tasks 9 and 10 use it for real.
- **`next build` must not run while a dev server is up** — both share `.next`, and the build strips dev HMR chunks, leaving the browser in a `ChunkLoadError` reload loop.
- **`packages/ayasofyazilim-ui` is a git submodule** with its own repository. Tasks 9 and 10 commit there and need a separate PR plus a pointer bump in this repo.
- Permission strings, verbatim: `TagService.StickerManualVerifications`, `.Upload`, `.ViewMine`, `.ViewList`, `.View`, `.MarkInvalid`, `TagService.Tags.CreateByManualVerification`, and the pre-existing `TagService.StickerHeaders.ViewMerchantInfo` and `TagService.Tags.ViewSummary`.
- Status values, verbatim: `"Created"`, `"Invalid"`, `"Completed"`.

**Task order:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11. Task 5 depends on Task 4. Task 8 depends on Task 7. Task 11 depends on Task 10 landing in the submodule and the pointer being bumped.

---

### Task 1: Actions layer

**Files:**
- Modify: `packages/actions/unirefund/TagService/actions.ts`
- Modify: `packages/actions/unirefund/TagService/post-actions.ts`

**Interfaces:**
- Consumes: `getTagServiceClient` from `../lib`; `structuredError`, `structuredResponse`, `structuredSuccessResponse` from `@repo/utils/api`; `Session` from `@repo/utils/auth`. All already imported in both files.
- Produces:
  - `getStickerManualVerificationsApi(data?: GetApiTagServiceStickerManualVerificationData, session?: Session | null)` → `{ data: PagedResultDto_StickerManualVerificationListDto }`
  - `getStickerManualVerificationsMyApi(data?: GetApiTagServiceStickerManualVerificationMyData, session?: Session | null)` → `{ data: PagedResultDto_MyStickerManualVerificationListDto }`
  - `getStickerManualVerificationByIdApi(data: GetApiTagServiceStickerManualVerificationByIdData, session?: Session | null)` → `{ data: UniRefund_TagService_Stickers_StickerManualVerificationDetailDto }`
  - `postStickerManualVerificationApi(data: PostApiTagServiceStickerManualVerificationData)` → `{ type: "success"; data } | { type: "error"; message: string }`
  - `postStickerManualVerificationByIdMarkInvalidApi(data: PostApiTagServiceStickerManualVerificationByIdMarkInvalidData)` → same union
  - `postTagByManualVerificationApi(data: PostApiTagServiceTagByManualVerificationData)` → same union, `data` is `UniRefund_TagService_Tags_TagDto`

- [ ] **Step 1: Add the three GET actions**

Append to `packages/actions/unirefund/TagService/actions.ts`:

```ts
/**
 * The refund officer's manual-verification worklist. `status` takes a single
 * lifecycle value - typically "Created" for the outstanding queue - and is
 * omitted for every status.
 * Requires TagService.StickerManualVerifications.ViewList.
 */
export async function getStickerManualVerificationsApi(
  data: GetApiTagServiceStickerManualVerificationData = {},
  session?: Session | null
) {
  try {
    const client = await getTagServiceClient(session);
    const response =
      await client.stickerManualVerification.getApiTagServiceStickerManualVerification(
        data
      );
    return structuredSuccessResponse(response);
  } catch (error) {
    throw structuredError(error);
  }
}

/**
 * The calling traveller's own uploaded picture pairs.
 * Requires TagService.StickerManualVerifications.ViewMine - a grant travellers
 * do not hold on every environment, so callers must treat a rejection as
 * "no section to show" rather than as a page failure.
 */
export async function getStickerManualVerificationsMyApi(
  data: GetApiTagServiceStickerManualVerificationMyData = {},
  session?: Session | null
) {
  try {
    const client = await getTagServiceClient(session);
    const response =
      await client.stickerManualVerification.getApiTagServiceStickerManualVerificationMy(
        data
      );
    return structuredSuccessResponse(response);
  } catch (error) {
    throw structuredError(error);
  }
}

/**
 * One picture pair in full, with presigned URLs for both images.
 * `frontPictureUrl` / `backPictureUrl` are null when the storage layer could not
 * produce one; that never fails the request, so callers must render each pane's
 * unavailable state independently.
 * Requires TagService.StickerManualVerifications.View.
 */
export async function getStickerManualVerificationByIdApi(
  data: GetApiTagServiceStickerManualVerificationByIdData,
  session?: Session | null
) {
  try {
    const client = await getTagServiceClient(session);
    const response =
      await client.stickerManualVerification.getApiTagServiceStickerManualVerificationById(
        data
      );
    return structuredSuccessResponse(response);
  } catch (error) {
    throw structuredError(error);
  }
}
```

Add to the existing `import type { ... } from "@repo/saas/TagService"` block at the top of the same file:

```ts
  GetApiTagServiceStickerManualVerificationData,
  GetApiTagServiceStickerManualVerificationMyData,
  GetApiTagServiceStickerManualVerificationByIdData,
```

- [ ] **Step 2: Add the three POST actions**

Append to `packages/actions/unirefund/TagService/post-actions.ts`:

```ts
/**
 * A traveller's sticker / tax-free-form picture pair. Both pictures are Base64,
 * JPEG or PNG, up to 5 MB decoded each - callers are responsible for downscaling
 * before this point, because Next's own server-action body limit bites first.
 * Requires TagService.StickerManualVerifications.Upload.
 */
export async function postStickerManualVerificationApi(
  data: PostApiTagServiceStickerManualVerificationData
) {
  try {
    const client = await getTagServiceClient();
    const response =
      await client.stickerManualVerification.postApiTagServiceStickerManualVerification(
        data
      );
    return structuredResponse(response);
  } catch (error) {
    return structuredError(error);
  }
}

/**
 * Rejects a picture pair. `reason` is shown to the traveller verbatim.
 * Requires TagService.StickerManualVerifications.MarkInvalid.
 */
export async function postStickerManualVerificationByIdMarkInvalidApi(
  data: PostApiTagServiceStickerManualVerificationByIdMarkInvalidData
) {
  try {
    const client = await getTagServiceClient();
    const response =
      await client.stickerManualVerification.postApiTagServiceStickerManualVerificationByIdMarkInvalid(
        data
      );
    return structuredResponse(response);
  } catch (error) {
    return structuredError(error);
  }
}

/**
 * Creates an Issued tag from a reviewed picture pair. Carries no traveller data:
 * traveller, sticker line and status are all derived server-side from the pair.
 * Requires TagService.Tags.CreateByManualVerification.
 */
export async function postTagByManualVerificationApi(
  data: PostApiTagServiceTagByManualVerificationData
) {
  try {
    const client = await getTagServiceClient();
    const response =
      await client.tag.postApiTagServiceTagByManualVerification(data);
    return structuredResponse(response);
  } catch (error) {
    return structuredError(error);
  }
}
```

Add to the existing `import type { ... } from "@repo/saas/TagService"` block at the top of the same file:

```ts
  PostApiTagServiceStickerManualVerificationData,
  PostApiTagServiceStickerManualVerificationByIdMarkInvalidData,
  PostApiTagServiceTagByManualVerificationData,
```

- [ ] **Step 3: Verify it type-checks**

Run: `cd c:\unirefund\web-app\packages\actions && pnpm type-check`
Expected: PASS, no output.

If a client method name is not found, read the real name from `packages/saas/TagService/sdk.gen.ts` under `class StickerManualVerificationService` and correct it — do not cast around it.

- [ ] **Step 4: Lint**

Run: `cd c:\unirefund\web-app\packages\actions && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd c:/unirefund/web-app
git add packages/actions/unirefund/TagService/actions.ts packages/actions/unirefund/TagService/post-actions.ts
git commit -m "feat(actions): wrap the sticker manual-verification endpoints"
```

---

### Task 2: Officer worklist

**Files:**
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/manual-verifications/page.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/manual-verifications/loading.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/manual-verifications/_components/table.tsx`
- Modify: `apps/web/src/components/sidebar-layout/data.ts` (insert after the `operations/scan-sticker` entry, which ends at line 737)
- Modify: `apps/web/src/language-data/core/AbpUiNavigation/resources/en.json` and `tr.json`
- Modify: `apps/web/src/language-data/unirefund/TagService/resources/en.json` and `tr.json`

**Interfaces:**
- Consumes: `getStickerManualVerificationsApi` (Task 1).
- Produces: the route `operations/manual-verifications`, and the i18n key prefix `ManualVerification.` in the TagService resource, which Tasks 3 and 5 extend.

- [ ] **Step 1: Add the navigation label keys**

In `apps/web/src/language-data/core/AbpUiNavigation/resources/en.json`, beside the existing `"ScanSticker"` entry (line 74):

```json
  "ManualVerifications": "Manual Verifications",
```

In the matching `tr.json`:

```json
  "ManualVerifications": "Manuel Doğrulamalar",
```

- [ ] **Step 2: Add the worklist i18n keys**

In `apps/web/src/language-data/unirefund/TagService/resources/en.json`:

```json
  "ManualVerification.Title": "Manual Verifications",
  "ManualVerification.StickerLineNumber": "Sticker line number",
  "ManualVerification.Traveller": "Traveller",
  "ManualVerification.DocumentNumber": "Document number",
  "ManualVerification.Status": "Status",
  "ManualVerification.UploadedAt": "Uploaded at",
  "ManualVerification.ReviewedAt": "Reviewed at",
  "ManualVerification.Status.Created": "Awaiting review",
  "ManualVerification.Status.Invalid": "Rejected",
  "ManualVerification.Status.Completed": "Completed",
  "ManualVerification.Filter.StatusPlaceholder": "Any status",
  "ManualVerification.Filter.LineNumberPlaceholder": "Search by sticker line number",
  "ManualVerification.ViewTag": "View tag",
```

In `tr.json`:

```json
  "ManualVerification.Title": "Manuel Doğrulamalar",
  "ManualVerification.StickerLineNumber": "Etiket satır numarası",
  "ManualVerification.Traveller": "Yolcu",
  "ManualVerification.DocumentNumber": "Belge numarası",
  "ManualVerification.Status": "Durum",
  "ManualVerification.UploadedAt": "Yüklenme tarihi",
  "ManualVerification.ReviewedAt": "İnceleme tarihi",
  "ManualVerification.Status.Created": "İnceleme bekliyor",
  "ManualVerification.Status.Invalid": "Reddedildi",
  "ManualVerification.Status.Completed": "Tamamlandı",
  "ManualVerification.Filter.StatusPlaceholder": "Tüm durumlar",
  "ManualVerification.Filter.LineNumberPlaceholder": "Etiket satır numarasına göre ara",
  "ManualVerification.ViewTag": "Etiketi görüntüle",
```

- [ ] **Step 3: Regenerate the i18n bundle**

Run: `cd c:\unirefund\web-app\apps\web && pnpm run init`
Expected: exits 0. Until this runs, `t.TagService["ManualVerification.Title"]` is a type error.

- [ ] **Step 4: Register the sidebar entry**

In `apps/web/src/components/sidebar-layout/data.ts`, insert immediately after the `operations/scan-sticker` object (closing `},` at line 737):

```ts
      {
        key: "operations/manual-verifications",
        displayName: "ManualVerifications",
        // The queue, not the history. `operations/refund?status=export-validated`
        // sets the same precedent: a default filter belongs in the nav href, not
        // in the page, so clearing the filter inside the page can still show
        // every status.
        href: "operations/manual-verifications?status=Created",
        icon: "FileSearch",
        policies: [
          "TagService.StickerManualVerifications",
          "TagService.StickerManualVerifications.ViewList",
        ],
      },
```

- [ ] **Step 5: Write the table component**

Create `apps/web/src/app/[lang]/(main)/(unirefund)/operations/manual-verifications/_components/table.tsx`:

```tsx
"use client";
import { useTenant } from "@/providers/tenant";
import { useTranslations } from "@/src/providers/i18n";
import { Badge, BadgeVariant } from "@repo/ayasofyazilim-ui/components/badge";
import {
  MasterDataGrid,
  RowLink,
} from "@repo/ayasofyazilim-ui/custom/master-data-grid";
import type {
  UniRefund_TagService_Stickers_StickerManualVerificationListDto,
  UniRefund_TagService_Stickers_StickerManualVerificationStatus,
} from "@repo/saas/TagService";
import { $UniRefund_TagService_Stickers_StickerManualVerificationListDto } from "@repo/saas/TagService";
import { isActionGranted, useGrantedPolicies } from "@repo/utils/policies";
import { TagIcon } from "lucide-react";
import { useRouter } from "next/navigation";

type TableType = UniRefund_TagService_Stickers_StickerManualVerificationListDto;

const STATUSES: UniRefund_TagService_Stickers_StickerManualVerificationStatus[] =
  ["Created", "Invalid", "Completed"];

function getBadgeByStatus(
  status?: UniRefund_TagService_Stickers_StickerManualVerificationStatus
): BadgeVariant {
  switch (status) {
    case "Invalid":
      return "destructive";
    case "Completed":
      return "success";
    default:
      return "warning";
  }
}

export function ManualVerificationsTable({
  data,
  rowCount,
}: {
  data: TableType[];
  rowCount?: number;
}) {
  const { localization } = useTenant();
  const { t } = useTranslations();
  const { grantedPolicies } = useGrantedPolicies();
  const router = useRouter();

  const canViewDetail = isActionGranted(
    ["TagService.StickerManualVerifications.View"],
    grantedPolicies
  );
  const canViewTag = isActionGranted(
    ["TagService.Tags.ViewSummary"],
    grantedPolicies
  );

  return (
    <MasterDataGrid
      data={data}
      config={{
        localization,
        rowCount,
        schema: $UniRefund_TagService_Stickers_StickerManualVerificationListDto,
        schemaColumns: {
          mode: "include",
          sort: true,
          columns: [
            "stickerLineNumber",
            "travellerFullName",
            "travellerDocumentNumber",
            "status",
            "creationTime",
            "reviewedAt",
          ],
        },
        /*
         * The grid owns the URL for both filters and paging - it writes these
         * keys plus `skipCount` / `maxResultCount` into the query string itself,
         * which is why the page reads them straight off searchParams and does no
         * page arithmetic of its own.
         */
        serverFilters: [
          {
            key: "status",
            type: "select",
            label: t.TagService["ManualVerification.Status"],
            placeholder:
              t.TagService["ManualVerification.Filter.StatusPlaceholder"],
            options: STATUSES.map((status) => ({
              value: status,
              label: t.TagService[`ManualVerification.Status.${status}`],
            })),
          },
          {
            key: "stickerLineNumber",
            type: "string",
            label: t.TagService["ManualVerification.StickerLineNumber"],
            placeholder:
              t.TagService["ManualVerification.Filter.LineNumberPlaceholder"],
          },
        ],
        t: {
          ...t.Default,
          "column.stickerLineNumber":
            t.TagService["ManualVerification.StickerLineNumber"],
          "column.travellerFullName":
            t.TagService["ManualVerification.Traveller"],
          "column.travellerDocumentNumber":
            t.TagService["ManualVerification.DocumentNumber"],
          "column.status": t.TagService["ManualVerification.Status"],
          "column.creationTime": t.TagService["ManualVerification.UploadedAt"],
          "column.reviewedAt": t.TagService["ManualVerification.ReviewedAt"],
        },
        customRenderers: {
          stickerLineNumber: ({ row }) => {
            const { id, stickerLineNumber } = row.original;
            return (
              <RowLink
                href={`manual-verifications/${id}`}
                label={stickerLineNumber ?? ""}
                linkCondition={canViewDetail}
              />
            );
          },
          status: ({ row }) => {
            const { status } = row.original;
            return (
              <Badge variant={getBadgeByStatus(status)}>
                {status
                  ? t.TagService[`ManualVerification.Status.${status}`]
                  : ""}
              </Badge>
            );
          },
        },
        rowActions: [
          {
            icon: TagIcon,
            label: t.TagService["ManualVerification.ViewTag"],
            id: "view-tag",
            onClick: (row: TableType) => {
              // tagId is non-null exactly when the status is Completed, so the
              // action does nothing on a row that has not produced a tag.
              if (!row.tagId || !canViewTag) return;
              router.push(`../operations/tax-free-tags/${row.tagId}`);
            },
          },
        ],
      }}
    />
  );
}
```

Compare against
[`management/logs/entity-changes/_components/table.tsx`](../../../web-app/apps/web/src/app/[lang]/(main)/(core)/management/logs/entity-changes/_components/table.tsx),
which is the closest existing `serverFilters` example, and match whatever shape
it really uses if the types disagree with the snippet above.

If `RowAction` turns out to expose a predicate field (something like
`condition`), prefer it over the early return inside `onClick`, so a row with no
tag does not offer a dead menu item. Read the `RowAction` type in
`packages/ayasofyazilim-ui/src/custom/master-data-grid/types.ts` to check. Do not
cast either way.

- [ ] **Step 6: Write the page and its loading state**

Create `apps/web/src/app/[lang]/(main)/(unirefund)/operations/manual-verifications/loading.tsx`:

```tsx
import LoadingSpinner from "@/components/loading/loading-spinner";

export default function Loading() {
  return <LoadingSpinner />;
}
```

Create `apps/web/src/app/[lang]/(main)/(unirefund)/operations/manual-verifications/page.tsx`:

```tsx
import { getTranslations } from "@/src/language-data/get-translations";
import { getStickerManualVerificationsApi } from "@repo/actions/unirefund/TagService/actions";
import type {
  GetApiTagServiceStickerManualVerificationData,
  UniRefund_TagService_Stickers_StickerManualVerificationStatus,
} from "@repo/saas/TagService";
import ErrorComponent from "@repo/ui/components/error-component";
import { structuredError } from "@repo/utils/api";
import { auth } from "@repo/utils/auth/next-auth";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { ManualVerificationsTable } from "./_components/table";

async function getApiRequests(
  filters: GetApiTagServiceStickerManualVerificationData
) {
  try {
    const session = await auth();
    const requiredRequests = await Promise.all([
      getStickerManualVerificationsApi(filters, session),
    ]);
    const optionalRequests = await Promise.allSettled([]);
    return { requiredRequests, optionalRequests };
  } catch (error) {
    if (!isRedirectError(error)) {
      return structuredError(error);
    }
    throw error;
  }
}

/**
 * `status` reaches us as a raw query string, so it is narrowed to the union
 * before it is sent. A junk value is dropped rather than forwarded - the
 * endpoint would 400 on it, and an unfiltered list is the more useful answer to
 * a hand-edited URL.
 *
 * There is no default here on purpose. The sidebar link carries
 * `?status=Created`, which is what opens the page on the outstanding queue;
 * defaulting server-side as well would make the filter's "clear" unreachable.
 */
function narrowStatus(
  raw?: string
): UniRefund_TagService_Stickers_StickerManualVerificationStatus | undefined {
  return raw === "Created" || raw === "Invalid" || raw === "Completed"
    ? raw
    : undefined;
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  /**
   * `skipCount`, `maxResultCount`, `sorting`, `status` and `stickerLineNumber`
   * are all written into the URL by MasterDataGrid itself, so they arrive here
   * ready to forward.
   */
  searchParams: Promise<
    Record<keyof GetApiTagServiceStickerManualVerificationData, string>
  >;
}) {
  const { lang } = await params;
  const t = await getTranslations(lang);
  const resolved = await searchParams;

  const status = narrowStatus(resolved.status);
  const apiRequests = await getApiRequests({
    ...(resolved.skipCount ? { skipCount: Number(resolved.skipCount) } : {}),
    ...(resolved.maxResultCount
      ? { maxResultCount: Number(resolved.maxResultCount) }
      : {}),
    ...(resolved.sorting ? { sorting: resolved.sorting } : {}),
    ...(status ? { status } : {}),
    ...(resolved.stickerLineNumber
      ? { stickerLineNumber: resolved.stickerLineNumber }
      : {}),
  });

  if ("message" in apiRequests) {
    return (
      <ErrorComponent languageData={t.Default} message={apiRequests.message} />
    );
  }

  const [response] = apiRequests.requiredRequests;

  return (
    <ManualVerificationsTable
      data={response.data.items ?? []}
      rowCount={response.data.totalCount}
    />
  );
}
```

- [ ] **Step 7: Type-check and lint**

Run: `cd c:\unirefund\web-app\apps\web && pnpm type-check && pnpm lint`
Expected: both PASS.

Common failure: `t.TagService["ManualVerification.Title"]` reported as not
assignable means Step 3 was skipped or run before the JSON edits.

- [ ] **Step 8: Verify in the browser**

Start the dev server (`cd c:\unirefund\web-app\apps\web && pnpm dev`), sign in as
a user holding `TagService.StickerManualVerifications.ViewList`, and confirm:

- "Manual Verifications" appears under Operations in the sidebar, and following
  it lands on `?status=Created` showing only the outstanding queue;
- clearing the status filter shows every status — this is the check that the
  nav-href default did not become an unclearable server-side default;
- typing into the sticker-line-number filter narrows the list;
- paging past page 1 actually fetches page 2. The grid writes `skipCount` and
  `maxResultCount` into the URL; if the rows do not change, the page is not
  forwarding them.
- the sticker line number links to `manual-verifications/{id}` (404 until Task 3).

- [ ] **Step 9: Commit**

```bash
cd c:/unirefund/web-app
git add "apps/web/src/app/[lang]/(main)/(unirefund)/operations/manual-verifications" apps/web/src/components/sidebar-layout/data.ts apps/web/src/language-data
git commit -m "feat(web): sticker manual-verification worklist"
```

---

### Task 3: Officer review screen

**Files:**
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/manual-verifications/[id]/page.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/manual-verifications/[id]/loading.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/manual-verifications/[id]/_components/pictures.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/manual-verifications/[id]/_components/actions.tsx`
- Modify: `apps/web/src/language-data/unirefund/TagService/resources/en.json` and `tr.json`

**Interfaces:**
- Consumes: `getStickerManualVerificationByIdApi`, `postStickerManualVerificationByIdMarkInvalidApi` (Task 1); the `ManualVerification.` key prefix (Task 2).
- Produces: the route `operations/manual-verifications/[id]`, which Task 2's `RowLink` targets and Task 5's create-tag route nests under.

- [ ] **Step 1: Add the review-screen i18n keys**

In `apps/web/src/language-data/unirefund/TagService/resources/en.json`:

```json
  "ManualVerification.Detail.Title": "Picture pair review",
  "ManualVerification.Detail.StickerPicture": "Sticker picture",
  "ManualVerification.Detail.FormPicture": "Tax-free form picture",
  "ManualVerification.Detail.PictureUnavailable": "This picture could not be loaded. It may be a temporary storage problem — try again shortly.",
  "ManualVerification.Detail.OpenFullSize": "Open full size",
  "ManualVerification.Detail.RejectionReason": "Rejection reason",
  "ManualVerification.MarkInvalid": "Mark invalid",
  "ManualVerification.MarkInvalid.Title": "Reject this picture pair",
  "ManualVerification.MarkInvalid.ReasonLabel": "Reason",
  "ManualVerification.MarkInvalid.ReasonHint": "The traveller reads this text exactly as you write it.",
  "ManualVerification.MarkInvalid.ReasonPlaceholder": "For example: the sticker number is not readable in the photo.",
  "ManualVerification.MarkInvalid.Confirm": "Reject",
  "ManualVerification.MarkInvalid.Cancel": "Cancel",
  "ManualVerification.MarkInvalid.Success": "The picture pair was rejected.",
  "ManualVerification.CreateTag": "Create tag",
```

In `tr.json`:

```json
  "ManualVerification.Detail.Title": "Fotoğraf çifti incelemesi",
  "ManualVerification.Detail.StickerPicture": "Etiket fotoğrafı",
  "ManualVerification.Detail.FormPicture": "Tax-free form fotoğrafı",
  "ManualVerification.Detail.PictureUnavailable": "Bu fotoğraf yüklenemedi. Geçici bir depolama sorunu olabilir — kısa süre sonra tekrar deneyin.",
  "ManualVerification.Detail.OpenFullSize": "Tam boyutta aç",
  "ManualVerification.Detail.RejectionReason": "Reddetme nedeni",
  "ManualVerification.MarkInvalid": "Geçersiz olarak işaretle",
  "ManualVerification.MarkInvalid.Title": "Bu fotoğraf çiftini reddet",
  "ManualVerification.MarkInvalid.ReasonLabel": "Neden",
  "ManualVerification.MarkInvalid.ReasonHint": "Yolcu bu metni yazdığınız şekilde okur.",
  "ManualVerification.MarkInvalid.ReasonPlaceholder": "Örnek: fotoğrafta etiket numarası okunmuyor.",
  "ManualVerification.MarkInvalid.Confirm": "Reddet",
  "ManualVerification.MarkInvalid.Cancel": "İptal",
  "ManualVerification.MarkInvalid.Success": "Fotoğraf çifti reddedildi.",
  "ManualVerification.CreateTag": "Etiket oluştur",
```

Run: `cd c:\unirefund\web-app\apps\web && pnpm run init`

- [ ] **Step 2: Write the pictures pane**

Create `.../[id]/_components/pictures.tsx`:

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { buttonVariants } from "@repo/ayasofyazilim-ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ayasofyazilim-ui/components/empty";
import { ImageOff } from "lucide-react";

/**
 * One picture pane. Each is rendered independently because either presigned URL
 * can be null while the rest of the response is fine - a storage failure
 * degrades the field rather than failing the request, so a null URL means "we
 * could not load it", never "the traveller did not send one".
 */
function PicturePane({
  title,
  url,
  testId,
}: {
  title: string;
  url?: string | null;
  testId: string;
}) {
  const { t } = useTranslations();
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-muted-foreground text-xs font-medium">{title}</h2>
      {url ? (
        <div className="flex flex-col gap-2">
          {/* Presigned URLs point at object storage on a host next/image is not
              configured for, so a plain img is deliberate here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={title}
            className="bg-muted max-h-[60vh] w-full rounded-md object-contain"
            src={url}
          />
          <a
            className={buttonVariants({ variant: "outline", size: "sm" })}
            data-testid={`${testId}-open-full-size`}
            href={url}
            rel="noopener noreferrer"
            target="_blank"
          >
            {t.TagService["ManualVerification.Detail.OpenFullSize"]}
          </a>
        </div>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ImageOff />
            </EmptyMedia>
            <EmptyTitle>{title}</EmptyTitle>
            <EmptyDescription>
              {t.TagService["ManualVerification.Detail.PictureUnavailable"]}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}

export function VerificationPictures({
  frontPictureUrl,
  backPictureUrl,
}: {
  frontPictureUrl?: string | null;
  backPictureUrl?: string | null;
}) {
  const { t } = useTranslations();
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <PicturePane
        testId="manual-verification-front"
        title={t.TagService["ManualVerification.Detail.StickerPicture"]}
        url={frontPictureUrl}
      />
      <PicturePane
        testId="manual-verification-back"
        title={t.TagService["ManualVerification.Detail.FormPicture"]}
        url={backPictureUrl}
      />
    </div>
  );
}
```

- [ ] **Step 3: Write the actions header**

Create `.../[id]/_components/actions.tsx`:

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ayasofyazilim-ui/components/dialog";
import { Label } from "@repo/ayasofyazilim-ui/components/label";
import { toast } from "@repo/ayasofyazilim-ui/components/sonner";
import { Textarea } from "@repo/ayasofyazilim-ui/components/textarea";
import { postStickerManualVerificationByIdMarkInvalidApi } from "@repo/actions/unirefund/TagService/post-actions";
import { isActionGranted, useGrantedPolicies } from "@repo/utils/policies";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function VerificationActions({ id }: { id: string }) {
  const { t } = useTranslations();
  const { grantedPolicies } = useGrantedPolicies();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canMarkInvalid = isActionGranted(
    ["TagService.StickerManualVerifications.MarkInvalid"],
    grantedPolicies
  );
  const canCreateTag = isActionGranted(
    ["TagService.Tags.CreateByManualVerification"],
    grantedPolicies
  );

  function handleMarkInvalid() {
    if (!reason.trim() || isSubmitting) return;
    setIsSubmitting(true);
    void postStickerManualVerificationByIdMarkInvalidApi({
      id,
      requestBody: { reason: reason.trim() },
    })
      .then((result) => {
        if (result.type !== "success") {
          toast.error(result.message);
          return;
        }
        toast.success(
          t.TagService["ManualVerification.MarkInvalid.Success"]
        );
        setOpen(false);
        setReason("");
        router.refresh();
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  }

  return (
    <div className="flex items-center gap-2">
      {canMarkInvalid ? (
        <Button
          data-testid="manual-verification-mark-invalid-button"
          onClick={() => {
            setOpen(true);
          }}
          size="sm"
          variant="outline"
        >
          {t.TagService["ManualVerification.MarkInvalid"]}
        </Button>
      ) : null}
      {canCreateTag ? (
        <Button
          data-testid="manual-verification-create-tag-button"
          onClick={() => {
            router.push(`${id}/create-tag`);
          }}
          size="sm"
        >
          {t.TagService["ManualVerification.CreateTag"]}
        </Button>
      ) : null}

      <Dialog
        onOpenChange={(next) => {
          if (isSubmitting) return;
          setOpen(next);
        }}
        open={open}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t.TagService["ManualVerification.MarkInvalid.Title"]}
            </DialogTitle>
            <DialogDescription>
              {t.TagService["ManualVerification.MarkInvalid.ReasonHint"]}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label
              data-testid="manual-verification-reason-label"
              htmlFor="manual-verification-reason"
            >
              {t.TagService["ManualVerification.MarkInvalid.ReasonLabel"]}
            </Label>
            <Textarea
              disabled={isSubmitting}
              id="manual-verification-reason"
              onChange={(event) => {
                setReason(event.target.value);
              }}
              placeholder={
                t.TagService[
                  "ManualVerification.MarkInvalid.ReasonPlaceholder"
                ]
              }
              rows={4}
              value={reason}
            />
          </div>
          <DialogFooter>
            <Button
              data-testid="manual-verification-reason-cancel"
              disabled={isSubmitting}
              onClick={() => {
                setOpen(false);
              }}
              variant="outline"
            >
              {t.TagService["ManualVerification.MarkInvalid.Cancel"]}
            </Button>
            <Button
              data-testid="manual-verification-reason-confirm"
              disabled={isSubmitting || !reason.trim()}
              onClick={handleMarkInvalid}
              variant="destructive"
            >
              {t.TagService["ManualVerification.MarkInvalid.Confirm"]}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 4: Write the page**

Create `.../[id]/loading.tsx` with the same three-line body as Task 2 Step 6.

Create `.../[id]/page.tsx`:

```tsx
import { getTranslations } from "@/src/language-data/get-translations";
import { getStickerManualVerificationByIdApi } from "@repo/actions/unirefund/TagService/actions";
import { Badge } from "@repo/ayasofyazilim-ui/components/badge";
import ErrorComponent from "@repo/ui/components/error-component";
import { structuredError } from "@repo/utils/api";
import { auth } from "@repo/utils/auth/next-auth";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { VerificationActions } from "./_components/actions";
import { VerificationPictures } from "./_components/pictures";

async function getApiRequests(id: string) {
  try {
    const session = await auth();
    const requiredRequests = await Promise.all([
      getStickerManualVerificationByIdApi({ id }, session),
    ]);
    const optionalRequests = await Promise.allSettled([]);
    return { requiredRequests, optionalRequests };
  } catch (error) {
    if (!isRedirectError(error)) {
      return structuredError(error);
    }
    throw error;
  }
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm font-medium">{value || "-"}</span>
    </div>
  );
}

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string; id: string }>;
}) {
  const { lang, id } = await params;
  const t = await getTranslations(lang);
  const apiRequests = await getApiRequests(id);

  if ("message" in apiRequests) {
    return (
      <ErrorComponent languageData={t.Default} message={apiRequests.message} />
    );
  }

  const [response] = apiRequests.requiredRequests;
  const pair = response.data;
  const isPending = pair.status === "Created";

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">
            {pair.stickerLineNumber ||
              t.TagService["ManualVerification.Detail.Title"]}
          </h1>
          {pair.status ? (
            <Badge
              variant={
                pair.status === "Invalid"
                  ? "destructive"
                  : pair.status === "Completed"
                    ? "success"
                    : "warning"
              }
            >
              {t.TagService[`ManualVerification.Status.${pair.status}`]}
            </Badge>
          ) : null}
        </div>
        {/* Both actions are refused server-side once a pair has been reviewed,
            so neither is offered outside the Created state. */}
        {isPending ? <VerificationActions id={id} /> : null}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Field
          label={t.TagService["ManualVerification.Traveller"]}
          value={pair.travellerFullName}
        />
        <Field
          label={t.TagService["ManualVerification.DocumentNumber"]}
          value={pair.travellerDocumentNumber}
        />
        <Field
          label={t.TagService["ManualVerification.StickerLineNumber"]}
          value={pair.stickerLineNumber}
        />
      </div>

      {pair.invalidReason ? (
        <div className="border-destructive/40 bg-destructive/5 flex flex-col gap-0.5 rounded-md border p-3">
          <span className="text-muted-foreground text-xs">
            {t.TagService["ManualVerification.Detail.RejectionReason"]}
          </span>
          <span className="text-sm">{pair.invalidReason}</span>
        </div>
      ) : null}

      <VerificationPictures
        backPictureUrl={pair.backPictureUrl}
        frontPictureUrl={pair.frontPictureUrl}
      />
    </div>
  );
}
```

- [ ] **Step 5: Type-check and lint**

Run: `cd c:\unirefund\web-app\apps\web && pnpm type-check && pnpm lint`
Expected: both PASS.

If `Textarea`, `DialogFooter` or `DialogHeader` is not exported from the paths
above, check `packages/ayasofyazilim-ui/src/components/` for the real export and
correct the import.

- [ ] **Step 6: Verify in the browser**

Open a `Created` row from the worklist. Confirm both pictures render; both header
buttons appear for a user holding the grants and disappear for one who does not;
rejecting with an empty reason is impossible (the confirm button stays disabled);
rejecting with a reason toasts success, and reloading the row shows status
`Rejected` with the reason and no action buttons.

- [ ] **Step 7: Commit**

```bash
cd c:/unirefund/web-app
git add "apps/web/src/app/[lang]/(main)/(unirefund)/operations/manual-verifications" apps/web/src/language-data
git commit -m "feat(web): manual-verification review screen with mark-invalid"
```

---

### Task 4: Make TagForm's traveller header optional

**Files:**
- Modify: `apps/web/src/components/tag-form/tag-form.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `TagForm` accepts `traveller`, `setTraveller` and `countries` as optional, plus a new `headerAction?: ReactNode`. Task 5 relies on all four.

**Why:** the manual-verification create endpoint has no traveller field at all — traveller, sticker line and status are derived server-side. Rendering `AddTravellerDialog` there would invite an officer to fill in something silently dropped. `countries` exists only to feed that dialog, so it becomes optional with it.

- [ ] **Step 1: Widen the prop types**

In `apps/web/src/components/tag-form/tag-form.tsx`, change the destructured
parameter list to add `headerAction`, and change these four entries in the props
type:

```ts
  countries?: UniRefund_CRMService_Countries_CountryDto[];
  traveller?: UniRefund_TagService_Travellers_TravellerRequestDto | null;
  setTraveller?: (
    traveller: UniRefund_TagService_Travellers_TravellerRequestDto | null
  ) => void;
  onTravellerSignatureChange?: (signature: string | undefined) => void;
  /**
   * Rendered in the header in place of `AddTravellerDialog`, for a flow whose
   * traveller is fixed server-side and must not be editable. Ignored when
   * `setTraveller` is supplied.
   */
  headerAction?: ReactNode;
```

- [ ] **Step 2: Branch the header**

Find the header region that renders `<AddTravellerDialog ... />` and wrap it so
the dialog renders only when the traveller pair was supplied:

```tsx
{setTraveller ? (
  <AddTravellerDialog
    countries={countries ?? []}
    onSignatureChange={onTravellerSignatureChange}
    setTraveller={setTraveller}
    traveller={traveller ?? null}
    testId={testId}
  />
) : (
  headerAction
)}
```

Keep every existing prop on `AddTravellerDialog` exactly as it is today — the
snippet above shows only the `?? ` guards that the now-optional props require.
If `AddTravellerDialog` takes a different prop set, preserve the real one and add
only the fallbacks.

- [ ] **Step 3: Type-check and lint**

Run: `cd c:\unirefund\web-app\apps\web && pnpm type-check && pnpm lint`
Expected: both PASS. Neither existing caller changes — `scan-sticker/client.tsx`
and `operations/tax-free-tags/new` both still pass the traveller pair, so both
still get the dialog.

- [ ] **Step 4: Verify no regression in the two existing callers**

In the browser, open `operations/tax-free-tags/new` and `operations/scan-sticker`
(scan or type a sticker line number). Confirm the "Add traveller" control still
appears in the form header on both, and that attaching a traveller still works.

- [ ] **Step 5: Commit**

```bash
cd c:/unirefund/web-app
git add apps/web/src/components/tag-form/tag-form.tsx
git commit -m "refactor(tag-form): make the traveller header optional"
```

---

### Task 5: Officer create-tag screen

**Files:**
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/manual-verifications/[id]/create-tag/page.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/manual-verifications/[id]/create-tag/loading.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/manual-verifications/[id]/create-tag/client.tsx`
- Modify: `apps/web/src/language-data/unirefund/TagService/resources/en.json` and `tr.json`

**Interfaces:**
- Consumes: `getStickerManualVerificationByIdApi`, `postTagByManualVerificationApi` (Task 1); `TagForm` with `headerAction` (Task 4); `getStickerLineMerchantInfoApi` and `searchMerchantsForTagCreation` (existing); `buildInitialInvoice`, `invoiceForSubmit` from `@/components/tag-form/invoice` (existing).
- Produces: the route `operations/manual-verifications/[id]/create-tag`, which Task 3's create-tag button targets.

**Reference:** the merchant-resolution rules are identical to the Refund Point path in [`operations/scan-sticker/README.md`](../../../web-app/apps/web/src/app/[lang]/(main)/(unirefund)/operations/scan-sticker/README.md#resolving-the-merchant). Read that section before writing this task. The differences are: there is no scan (the line number comes from the pair), no traveller (derived server-side), no signature, and the create call is `postTagByManualVerificationApi`.

- [ ] **Step 1: Add the create-tag i18n keys**

In `apps/web/src/language-data/unirefund/TagService/resources/en.json`:

```json
  "ManualVerification.CreateTag.Title": "Create tag from picture pair",
  "ManualVerification.CreateTag.Subtitle": "Enter the invoice exactly as it appears on the tax-free form.",
  "ManualVerification.CreateTag.Submit": "Issue tag",
  "ManualVerification.CreateTag.TravellerFixed": "Traveller is taken from the uploaded pair and cannot be changed here.",
```

In `tr.json`:

```json
  "ManualVerification.CreateTag.Title": "Fotoğraf çiftinden etiket oluştur",
  "ManualVerification.CreateTag.Subtitle": "Faturayı tax-free formda göründüğü şekilde girin.",
  "ManualVerification.CreateTag.Submit": "Etiketi oluştur",
  "ManualVerification.CreateTag.TravellerFixed": "Yolcu bilgisi yüklenen fotoğraf çiftinden alınır ve burada değiştirilemez.",
```

Run: `cd c:\unirefund\web-app\apps\web && pnpm run init`

- [ ] **Step 2: Write the server shell**

Create `.../[id]/create-tag/loading.tsx` with the same three-line body as before.

Create `.../[id]/create-tag/page.tsx`:

```tsx
import { getTranslations } from "@/src/language-data/get-translations";
import { getStickerManualVerificationByIdApi } from "@repo/actions/unirefund/TagService/actions";
import ErrorComponent from "@repo/ui/components/error-component";
import { structuredError } from "@repo/utils/api";
import { auth } from "@repo/utils/auth/next-auth";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { CreateTagFromVerification } from "./client";

async function getApiRequests(id: string) {
  try {
    const session = await auth();
    const requiredRequests = await Promise.all([
      getStickerManualVerificationByIdApi({ id }, session),
    ]);
    const optionalRequests = await Promise.allSettled([]);
    return { requiredRequests, optionalRequests };
  } catch (error) {
    if (!isRedirectError(error)) {
      return structuredError(error);
    }
    throw error;
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string; id: string }>;
}) {
  const { lang, id } = await params;
  const t = await getTranslations(lang);
  const apiRequests = await getApiRequests(id);

  if ("message" in apiRequests) {
    return (
      <ErrorComponent languageData={t.Default} message={apiRequests.message} />
    );
  }

  const pair = apiRequests.requiredRequests[0].data;

  return (
    <CreateTagFromVerification
      manualVerificationId={id}
      stickerLineNumber={pair.stickerLineNumber ?? ""}
      travellerDocumentNumber={pair.travellerDocumentNumber ?? ""}
      travellerFullName={pair.travellerFullName ?? ""}
    />
  );
}
```

- [ ] **Step 3: Write the client**

Create `.../[id]/create-tag/client.tsx`:

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import {
  buildInitialInvoice,
  invoiceForSubmit,
  type InvoiceRequestDto,
  type ProductGroupRelationDto,
} from "@/components/tag-form/invoice";
import type { MerchantSelectorProps } from "@/components/tag-form/merchant-selector";
import { TagForm } from "@/components/tag-form/tag-form";
import { getStickerLineMerchantInfoApi } from "@repo/actions/unirefund/TagService/actions";
import { postTagByManualVerificationApi } from "@repo/actions/unirefund/TagService/post-actions";
import { searchMerchantsForTagCreation } from "@repo/actions/unirefund/TagService/search";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import { Spinner } from "@repo/ayasofyazilim-ui/components/spinner";
import { toast } from "@repo/ayasofyazilim-ui/components/sonner";
import type {
  UniRefund_CRMService_Merchants_MerchantForTagCreationDto,
  UniRefund_CRMService_Merchants_MerchantInfoForTagCreationDto,
} from "@repo/saas/CRMService";
import { isActionGranted, useGrantedPolicies } from "@repo/utils/policies";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type MerchantForTagCreation =
  UniRefund_CRMService_Merchants_MerchantForTagCreationDto;

type Resolved = {
  isMerchantAllocated: boolean;
  merchant: UniRefund_CRMService_Merchants_MerchantInfoForTagCreationDto | null;
  productGroups: ProductGroupRelationDto[];
};

/**
 * Mirrors `lookupMerchantInfo` in operations/scan-sticker/client.tsx: the action
 * throws, and a null result means either the call failed or
 * TagService.StickerHeaders.ViewMerchantInfo is not granted - which is a
 * separate grant from the seven manual-verification ones and easy to miss.
 */
async function lookupMerchantInfo(
  stickerLineNumber: string,
  merchantId?: string
): Promise<Resolved | null> {
  try {
    const response = await getStickerLineMerchantInfoApi({
      stickerLineNumber,
      ...(merchantId ? { merchantId } : {}),
    });
    const data = response.data;
    return {
      isMerchantAllocated: data.isMerchantAllocated,
      merchant: data.merchant ?? null,
      productGroups: data.merchant?.productGroups ?? [],
    };
  } catch {
    return null;
  }
}

export function CreateTagFromVerification({
  manualVerificationId,
  stickerLineNumber,
  travellerFullName,
  travellerDocumentNumber,
}: {
  manualVerificationId: string;
  stickerLineNumber: string;
  travellerFullName: string;
  travellerDocumentNumber: string;
}) {
  const { t } = useTranslations();
  const { lang } = useParams<{ lang: string }>();
  const router = useRouter();
  const { grantedPolicies } = useGrantedPolicies();

  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [invoice, setInvoice] = useState<InvoiceRequestDto>(
    buildInitialInvoice
  );
  const [selectedMerchant, setSelectedMerchant] =
    useState<MerchantForTagCreation | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canCreate = isActionGranted(
    ["TagService.Tags.CreateByManualVerification"],
    grantedPolicies
  );
  const canPickMerchant = isActionGranted(
    ["TagService.Tags.ViewMerchantsForCreation"],
    grantedPolicies
  );

  /*
   * The one legitimate effect on this page: a subscription-shaped external read
   * that must run once on mount, with no user event to hang it off.
   * `.claude/rules/avoid-use-effect.md` rules out effects for derived state and
   * event responses, not for this.
   */
  useEffect(() => {
    let cancelled = false;
    void lookupMerchantInfo(stickerLineNumber).then((result) => {
      if (cancelled) return;
      if (!result) {
        toast.error(t.TagService["AssignSticker.MerchantInfoUnavailable"]);
      }
      setResolved(result);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [stickerLineNumber, t]);

  function handleMerchantSelect(merchant: MerchantForTagCreation | null) {
    setSelectedMerchant(merchant);
    // Lines are priced against the product groups of the merchant resolved when
    // they were added, so a pick replaces the whole invoice rather than keeping
    // them. Same rule as scan-sticker.
    setInvoice(buildInitialInvoice());
    if (!merchant?.id) {
      setResolved((prev) =>
        prev ? { ...prev, merchant: null, productGroups: [] } : prev
      );
      return;
    }
    void lookupMerchantInfo(stickerLineNumber, merchant.id).then((result) => {
      if (!result) {
        toast.error(t.TagService["AssignSticker.MerchantInfoUnavailable"]);
        return;
      }
      setResolved(result);
    });
  }

  function handleSubmit() {
    if (isSubmitting || !canCreate) return;
    if (invoice.invoiceLines.length === 0) return;
    const merchantId = resolved?.isMerchantAllocated
      ? undefined
      : selectedMerchant?.id;
    if (!resolved?.isMerchantAllocated && !merchantId) return;

    setIsSubmitting(true);
    void postTagByManualVerificationApi({
      requestBody: {
        manualVerificationId,
        // Omitted for an allocated line: the allocation cannot change and the
        // backend ignores the parameter there.
        ...(merchantId ? { merchantId } : {}),
        invoices: [invoiceForSubmit(invoice)],
      },
    })
      .then((result) => {
        if (result.type !== "success") {
          toast.error(result.message);
          return;
        }
        router.push(`/${lang}/operations/tax-free-tags/${result.data.id}`);
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const isMerchantAllocated = resolved?.isMerchantAllocated ?? false;
  const merchantProps: MerchantSelectorProps<MerchantForTagCreation> =
    isMerchantAllocated && resolved?.merchant
      ? {
          testId: "manual-verification-create-tag",
          mode: "readonly",
          name: resolved.merchant.name ?? "",
          notice: {
            text: t.TagService["AssignSticker.MerchantAllocated"],
            tone: "muted",
          },
          details: {
            vatNumber: resolved.merchant.vatNumber,
          },
        }
      : canPickMerchant
        ? {
            testId: "manual-verification-create-tag",
            mode: "select",
            fetchAction: searchMerchantsForTagCreation,
            value: selectedMerchant,
            onChange: handleMerchantSelect,
            notice: {
              text: t.TagService["AssignSticker.AllocationWarning"],
              tone: "warning",
            },
            ...(resolved?.merchant
              ? { details: { vatNumber: resolved.merchant.vatNumber } }
              : {}),
          }
        : {
            testId: "manual-verification-create-tag",
            mode: "hint",
            text: t.TagService["AssignSticker.MerchantInfoUnavailable"],
          };

  const canSubmit =
    canCreate &&
    !isSubmitting &&
    invoice.invoiceLines.length > 0 &&
    (isMerchantAllocated || Boolean(selectedMerchant?.id));

  return (
    <div className="flex flex-col gap-4 p-4">
      <TagForm
        headerAction={
          <div className="text-muted-foreground flex flex-col text-right text-xs">
            <span className="text-foreground text-sm font-medium">
              {travellerFullName || "-"}
            </span>
            <span>{travellerDocumentNumber}</span>
            <span>
              {t.TagService["ManualVerification.CreateTag.TravellerFixed"]}
            </span>
          </div>
        }
        invoice={invoice}
        merchant={merchantProps}
        productGroups={resolved?.productGroups ?? []}
        setInvoice={setInvoice}
        subtitle={t.TagService["ManualVerification.CreateTag.Subtitle"]}
        testId="manual-verification-create-tag"
        title={t.TagService["ManualVerification.CreateTag.Title"]}
      >
        <Button
          className="w-full"
          data-testid="manual-verification-create-tag-submit"
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          {t.TagService["ManualVerification.CreateTag.Submit"]}
        </Button>
      </TagForm>
    </div>
  );
}
```

- [ ] **Step 4: Type-check and lint**

Run: `cd c:\unirefund\web-app\apps\web && pnpm type-check && pnpm lint`
Expected: both PASS.

`AssignSticker.MerchantAllocated`, `AssignSticker.AllocationWarning` and
`AssignSticker.MerchantInfoUnavailable` already exist in the TagService resource
— `scan-sticker` uses all three. If any is reported missing, add it rather than
inventing a new key name.

- [ ] **Step 5: Verify in the browser**

From a `Created` pair, press "Create tag". Confirm: an allocated sticker book
shows the merchant read-only with no picker; an unallocated one offers the
picker and the allocation warning; picking a merchant clears any invoice lines
already added; the traveller block in the header is text, with no "Add traveller"
button; issuing redirects to `operations/tax-free-tags/{id}`; and the source pair
now reads `Completed` in the worklist with a working "View tag" row action.

- [ ] **Step 6: Commit**

```bash
cd c:/unirefund/web-app
git add "apps/web/src/app/[lang]/(main)/(unirefund)/operations/manual-verifications" apps/web/src/language-data
git commit -m "feat(web): create a tag from a reviewed picture pair"
```

---

### Task 6: SSR pending-verifications section

**Files:**
- Create: `apps/ssr/src/app/[lang]/(main)/tags/_components/tags-view.tsx`
- Create: `apps/ssr/src/app/[lang]/(main)/tags/_components/pending-verifications.tsx`
- Modify: `apps/ssr/src/app/[lang]/(main)/tags/page.tsx`
- Modify: `apps/ssr/src/app/[lang]/(main)/tags/_components/tag-table-view.tsx`
- Modify: `apps/ssr/src/language-data/unirefund/SSRService/resources/en.json` and `tr.json`

**Interfaces:**
- Consumes: `getStickerManualVerificationsMyApi` (Task 1).
- Produces: `TagsView`, which Task 8 extends with the upload button; the `Verification.` key prefix in the SSRService resource.

- [ ] **Step 1: Add the section i18n keys**

In `apps/ssr/src/language-data/unirefund/SSRService/resources/en.json`:

```json
  "Verification.SectionTitle": "Pending verifications",
  "Verification.StickerLineNumber": "Sticker line number",
  "Verification.UploadedAt": "Uploaded",
  "Verification.Status.Created": "Under review",
  "Verification.Status.Invalid": "Rejected",
  "Verification.RejectionReason": "Reason",
```

In `tr.json`:

```json
  "Verification.SectionTitle": "Bekleyen doğrulamalar",
  "Verification.StickerLineNumber": "Etiket satır numarası",
  "Verification.UploadedAt": "Yüklenme",
  "Verification.Status.Created": "İnceleniyor",
  "Verification.Status.Invalid": "Reddedildi",
  "Verification.RejectionReason": "Neden",
```

Run: `cd c:\unirefund\web-app\apps\ssr && pnpm run init`

- [ ] **Step 2: Write the pending-verifications section**

Create `apps/ssr/src/app/[lang]/(main)/tags/_components/pending-verifications.tsx`:

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import type { UniRefund_TagService_Stickers_MyStickerManualVerificationListDto } from "@repo/saas/TagService";

type Item = UniRefund_TagService_Stickers_MyStickerManualVerificationListDto;

/*
 * Deliberately not the page's own `getStatusColor`: that one is keyed by
 * TagStatusType and this is a different enum with different members. Sharing it
 * would make the two look interchangeable, which they are not.
 */
const STATUS_CLASS: Record<"Created" | "Invalid", string> = {
  Created:
    "text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-950",
  Invalid: "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950",
};

export function PendingVerifications({ items }: { items: Item[] }) {
  const { t } = useTranslations();

  /*
   * Completed pairs are dropped: MyStickerManualVerificationListDto carries no
   * tagId, so a completed row links nowhere, and the tag it produced is already
   * in the table below. A traveller whose twenty most recent pairs are all
   * completed therefore sees no section, which is correct - nothing is
   * outstanding.
   */
  const visible = items.filter(
    (item) => item.status === "Created" || item.status === "Invalid"
  );
  if (visible.length === 0) return null;

  return (
    <div className="mb-6 flex flex-col gap-2">
      <h2 className="text-sm font-semibold">
        {t.SSRService["Verification.SectionTitle"]}
      </h2>
      <ul className="flex flex-col gap-2">
        {visible.map((item) => (
          <li
            className="flex flex-col gap-1 rounded-md border p-3"
            key={item.id}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">
                {item.stickerLineNumber}
              </span>
              <span
                className={cn(
                  "rounded-md px-2 py-1 text-sm font-medium",
                  STATUS_CLASS[item.status === "Invalid" ? "Invalid" : "Created"]
                )}
              >
                {item.status === "Invalid"
                  ? t.SSRService["Verification.Status.Invalid"]
                  : t.SSRService["Verification.Status.Created"]}
              </span>
            </div>
            {item.invalidReason ? (
              <p className="text-muted-foreground text-sm">
                <span className="font-medium">
                  {t.SSRService["Verification.RejectionReason"]}:{" "}
                </span>
                {item.invalidReason}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Extract the page shell**

Create `apps/ssr/src/app/[lang]/(main)/tags/_components/tags-view.tsx`:

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { Separator } from "@repo/ayasofyazilim-ui/components/separator";
import type {
  UniRefund_TagService_Stickers_MyStickerManualVerificationListDto,
  UniRefund_TagService_Tags_TagListItemForTravellerCrossTenantsDto,
} from "@repo/saas/TagService";
import { PendingVerifications } from "./pending-verifications";
import { ClaimTag } from "./tag-claim";
import { TagTableView } from "./tag-table-view";

export function TagsView({
  tags,
  verifications,
  totalCount,
  currentPage,
  pageSize,
}: {
  tags: UniRefund_TagService_Tags_TagListItemForTravellerCrossTenantsDto[];
  verifications: UniRefund_TagService_Stickers_MyStickerManualVerificationListDto[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
}) {
  const { t } = useTranslations();
  return (
    <div className="flex h-full flex-1 px-2">
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col py-16">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold">{t.SSRService["Tags"]}</h1>
          <div className="flex items-center gap-2">
            <ClaimTag />
          </div>
        </div>
        <Separator />
        <div className="mt-4 flex flex-col">
          <PendingVerifications items={verifications} />
          <TagTableView
            currentPage={currentPage}
            pageSize={pageSize}
            tags={tags}
            totalCount={totalCount}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Slim down `tag-table-view.tsx`**

In `apps/ssr/src/app/[lang]/(main)/tags/_components/tag-table-view.tsx`, remove
the outer shell and the header — delete the two wrapper `div`s, the `<h1>`, the
`<ClaimTag />` and the `<Separator />` (lines 121–127 and their closing tags at
260–261), so the component returns the `tags.length === 0 ? <NoTags /> : <>…</>`
expression directly. Delete the now-unused imports: `Separator` and `ClaimTag`.
Keep `useTranslations` — the table headers still use it.

- [ ] **Step 5: Fetch the traveller's own pairs**

In `apps/ssr/src/app/[lang]/(main)/tags/page.tsx`:

Replace the `TagTableView` import with `import { TagsView } from "./_components/tags-view";`
and add `import { getStickerManualVerificationsMyApi } from "@repo/actions/unirefund/TagService/actions";`

Change `getApiRequests` so the new call sits in the optional group:

```ts
async function getApiRequests(
  filters: GetApiTagServiceTagCrossTenantsByTravellerIdClaimData
) {
  try {
    const session = await auth();
    const requiredRequests = await Promise.all([
      getTagsCrossTenantsByTravellerIdClaimApi({ ...filters }, session),
    ]);
    /*
     * Optional, never required. TagService.StickerManualVerifications.ViewMine
     * is not granted to travellers on every environment, and a 403 here must
     * not take the tags list down with it.
     */
    const optionalRequests = await Promise.allSettled([
      getStickerManualVerificationsMyApi(
        { maxResultCount: 20, sorting: "creationTime desc" },
        session
      ),
    ]);
    return { requiredRequests, optionalRequests };
  } catch (error) {
    if (!isRedirectError(error)) {
      return structuredError(error);
    }
    throw error;
  }
}
```

And replace the render:

```tsx
  const [tagsResponse] = apiRequests.requiredRequests;
  const [verificationsResult] = apiRequests.optionalRequests;
  const totalCount = tagsResponse.data.totalCount ?? 0;

  const verifications =
    verificationsResult.status === "fulfilled"
      ? (verificationsResult.value.data.items ?? [])
      : [];

  return (
    <TagsView
      currentPage={currentPage}
      pageSize={PAGE_SIZE}
      tags={tagsResponse.data.items || []}
      totalCount={totalCount}
      verifications={verifications}
    />
  );
```

- [ ] **Step 6: Check the sort field is accepted**

`StickerManualVerificationRepository` hand-rolls its own sort whitelist rather
than using the shared `SafeSort` helper, so `creationTime desc` may be rejected.
With the dev server running and signed in as a traveller who holds `.ViewMine`,
load `/tags` and watch the server console.

Run: `cd c:\unirefund\web-app\apps\ssr && pnpm dev`
Expected: no 400 from the `/my` call. If there is one, delete the `sorting`
property entirely and take the repository's default ordering — do not guess at
another field name.

- [ ] **Step 7: Type-check and lint**

Run: `cd c:\unirefund\web-app\apps\ssr && pnpm type-check && pnpm lint`
Expected: both PASS.

- [ ] **Step 8: Verify in the browser**

Confirm `/tags` renders exactly as before for a traveller with no pairs (header,
separator, table or empty state, pagination), and that a traveller without the
`.ViewMine` grant still sees their tags with no error.

- [ ] **Step 9: Commit**

```bash
cd c:/unirefund/web-app
git add "apps/ssr/src/app/[lang]/(main)/tags" apps/ssr/src/language-data
git commit -m "feat(ssr): show the traveller's pending sticker verifications"
```

---

### Task 7: SSR image pipeline

**Files:**
- Create: `apps/ssr/src/utils/image.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  type PreparedPicture = {
    ok: true; base64: string; previewUrl: string; bitmap: ImageBitmap;
  };
  type PrepareFailure = { ok: false; reason: "unreadable" };
  prepareStickerPicture(file: File): Promise<PreparedPicture | PrepareFailure>
  ```
  Task 8 consumes `base64` and `previewUrl`; Task 11 consumes `bitmap`.

- [ ] **Step 1: Write the module**

Create `apps/ssr/src/utils/image.ts`:

```ts
/**
 * Turns a camera or gallery picture into something the sticker
 * manual-verification endpoint will accept, small enough to survive the trip.
 *
 * Three limits stack up, and only the middle one is obvious:
 *  - the backend accepts JPEG or PNG up to 5 MB *decoded* per picture;
 *  - `apps/ssr` sets `serverActions.bodySizeLimit` to 8mb, and base64 inflates
 *    by 4/3 - two pictures at the backend's own cap would be ~13.4 MB of body
 *    and would be refused by Next before ever reaching the API;
 *  - a modern phone camera produces 12 MP files far above both.
 *
 * So each picture is capped at 2.5 MB of base64 (~1.9 MB decoded), which leaves
 * two of them at ~5 MB of request with headroom.
 */

/** Longest edge, first attempt. */
const MAX_EDGE = 2000;
/** Longest edge, last resort once quality steps have not been enough. */
const FALLBACK_EDGE = 1600;
/** Quality ladder, tried in order. */
const QUALITY_STEPS = [0.85, 0.7, 0.6] as const;
/** Base64 character budget per picture. */
const MAX_BASE64_CHARS = 2_500_000;

export type PreparedPicture = {
  ok: true;
  /** Bare base64 body, no `data:` prefix - the DTO accepts either. */
  base64: string;
  /** Object URL for the thumbnail. The caller must revoke it. */
  previewUrl: string;
  /** Kept so a QR decode can run against it without re-decoding the file. */
  bitmap: ImageBitmap;
};

export type PrepareFailure = { ok: false; reason: "unreadable" };

function drawToCanvas(bitmap: ImageBitmap, maxEdge: number): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob);
    }, "image/jpeg", quality);
  });
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      // FileReader yields `data:image/jpeg;base64,AAAA...`; the API wants only
      // the body, and dropping the prefix also saves it from the budget.
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => {
      reject(new Error("read failed"));
    };
    reader.readAsDataURL(blob);
  });
}

export async function prepareStickerPicture(
  file: File
): Promise<PreparedPicture | PrepareFailure> {
  let bitmap: ImageBitmap;
  try {
    // `from-image` applies the EXIF orientation, so a photo taken in portrait
    // reaches the reviewing officer upright instead of on its side.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return { ok: false, reason: "unreadable" };
  }

  const attempts: { edge: number; quality: number }[] = [
    ...QUALITY_STEPS.map((quality) => ({ edge: MAX_EDGE, quality })),
    { edge: FALLBACK_EDGE, quality: 0.6 },
  ];

  let last: { blob: Blob; base64: string } | null = null;
  for (const attempt of attempts) {
    const canvas = drawToCanvas(bitmap, attempt.edge);
    const blob = await toBlob(canvas, attempt.quality);
    if (!blob) continue;
    const base64 = await toBase64(blob);
    last = { blob, base64 };
    if (base64.length <= MAX_BASE64_CHARS) break;
  }

  if (!last) {
    bitmap.close();
    return { ok: false, reason: "unreadable" };
  }

  return {
    ok: true,
    base64: last.base64,
    previewUrl: URL.createObjectURL(last.blob),
    bitmap,
  };
}
```

- [ ] **Step 2: Type-check and lint**

Run: `cd c:\unirefund\web-app\apps\ssr && pnpm type-check && pnpm lint`
Expected: both PASS.

If lint objects to `await` inside a loop, keep the loop — the attempts are
deliberately sequential, because each one only runs when the previous was too
large. Add the narrowest possible disable comment with that reason.

- [ ] **Step 3: Commit**

```bash
cd c:/unirefund/web-app
git add apps/ssr/src/utils/image.ts
git commit -m "feat(ssr): downscale and encode sticker pictures for upload"
```

---

### Task 8: SSR upload dialog

**Files:**
- Create: `apps/ssr/src/app/[lang]/(main)/tags/_components/upload-verification-dialog.tsx`
- Modify: `apps/ssr/src/app/[lang]/(main)/tags/_components/tags-view.tsx`
- Modify: `apps/ssr/src/language-data/unirefund/SSRService/resources/en.json` and `tr.json`

**Interfaces:**
- Consumes: `prepareStickerPicture` (Task 7); `postStickerManualVerificationApi` (Task 1); `TagsView` (Task 6).
- Produces: a `PictureSlot` shape Task 11 sets `stickerLineNumber` from.

- [ ] **Step 1: Add the dialog i18n keys**

In `apps/ssr/src/language-data/unirefund/SSRService/resources/en.json`:

```json
  "Verification.Upload": "Upload for verification",
  "Verification.Upload.Title": "Send your sticker and form for verification",
  "Verification.Upload.Description": "Take a photo of the sticker and a photo of the tax-free form it is stuck on. A refund agent will check them and create your tag.",
  "Verification.Upload.StickerPhoto": "Sticker photo",
  "Verification.Upload.FormPhoto": "Tax-free form photo",
  "Verification.Upload.Choose": "Take or choose a photo",
  "Verification.Upload.Replace": "Replace",
  "Verification.Upload.LineNumberLabel": "Sticker line number",
  "Verification.Upload.LineNumberPlaceholder": "The number printed on the sticker",
  "Verification.Upload.Submit": "Send",
  "Verification.Upload.Cancel": "Cancel",
  "Verification.Upload.Unreadable": "We couldn't read that image. Please choose another photo.",
  "Verification.Upload.Success": "Your photos were sent. We'll let you know once they are checked.",
```

In `tr.json`:

```json
  "Verification.Upload": "Doğrulama için yükle",
  "Verification.Upload.Title": "Etiketinizi ve formunuzu doğrulamaya gönderin",
  "Verification.Upload.Description": "Etiketin ve etiketin yapıştırıldığı tax-free formun fotoğrafını çekin. Bir iade görevlisi kontrol edip etiketinizi oluşturacak.",
  "Verification.Upload.StickerPhoto": "Etiket fotoğrafı",
  "Verification.Upload.FormPhoto": "Tax-free form fotoğrafı",
  "Verification.Upload.Choose": "Fotoğraf çekin veya seçin",
  "Verification.Upload.Replace": "Değiştir",
  "Verification.Upload.LineNumberLabel": "Etiket satır numarası",
  "Verification.Upload.LineNumberPlaceholder": "Etiketin üzerinde yazan numara",
  "Verification.Upload.Submit": "Gönder",
  "Verification.Upload.Cancel": "İptal",
  "Verification.Upload.Unreadable": "Bu görüntü okunamadı. Lütfen başka bir fotoğraf seçin.",
  "Verification.Upload.Success": "Fotoğraflarınız gönderildi. Kontrol edildiğinde size bildireceğiz.",
```

Run: `cd c:\unirefund\web-app\apps\ssr && pnpm run init`

- [ ] **Step 2: Write the dialog**

Create `apps/ssr/src/app/[lang]/(main)/tags/_components/upload-verification-dialog.tsx`:

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { prepareStickerPicture } from "@/src/utils/image";
import { postStickerManualVerificationApi } from "@repo/actions/unirefund/TagService/post-actions";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ayasofyazilim-ui/components/dialog";
import { Input } from "@repo/ayasofyazilim-ui/components/input";
import { Label } from "@repo/ayasofyazilim-ui/components/label";
import { toast } from "@repo/ayasofyazilim-ui/components/sonner";
import { isActionGranted, useGrantedPolicies } from "@repo/utils/policies";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Slot = { base64: string; previewUrl: string; bitmap: ImageBitmap };

function PictureSlot({
  label,
  slot,
  testId,
  disabled,
  onFile,
}: {
  label: string;
  slot: Slot | null;
  testId: string;
  disabled: boolean;
  onFile: (file: File) => void;
}) {
  const { t } = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-1.5">
      <Label data-testid={`${testId}-label`}>{label}</Label>
      {slot ? (
        // eslint-disable-next-line @next/next/no-img-element -- a blob: object URL, not a remote asset next/image can optimise
        <img
          alt={label}
          className="bg-muted max-h-48 w-full rounded-md object-contain"
          src={slot.previewUrl}
        />
      ) : null}
      <input
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Reset so choosing the same file twice still fires onChange - a
          // traveller who retakes the same shot would otherwise see nothing.
          event.target.value = "";
          if (file) onFile(file);
        }}
        ref={inputRef}
        type="file"
      />
      <Button
        data-testid={testId}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        size="sm"
        type="button"
        variant="outline"
      >
        {slot
          ? t.SSRService["Verification.Upload.Replace"]
          : t.SSRService["Verification.Upload.Choose"]}
      </Button>
    </div>
  );
}

export function UploadVerificationDialog() {
  const { t } = useTranslations();
  const { grantedPolicies } = useGrantedPolicies();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [front, setFront] = useState<Slot | null>(null);
  const [back, setBack] = useState<Slot | null>(null);
  const [lineNumber, setLineNumber] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const hasGrant = isActionGranted(
    ["TagService.StickerManualVerifications.Upload"],
    grantedPolicies
  );
  if (!hasGrant) return null;

  /*
   * Releasing the old slot happens here, in the event handler, and never inside
   * a state updater. React may call an updater more than once - StrictMode does
   * exactly that in development - and `revokeObjectURL` plus `bitmap.close()`
   * are not safe to run twice on the same object.
   */
  function release(slot: Slot | null) {
    if (!slot) return;
    URL.revokeObjectURL(slot.previewUrl);
    slot.bitmap.close();
  }

  function handleFile(which: "front" | "back", file: File) {
    setIsBusy(true);
    void prepareStickerPicture(file)
      .then((result) => {
        if (!result.ok) {
          toast.error(t.SSRService["Verification.Upload.Unreadable"]);
          return;
        }
        const slot: Slot = {
          base64: result.base64,
          previewUrl: result.previewUrl,
          bitmap: result.bitmap,
        };
        if (which === "front") {
          release(front);
          setFront(slot);
        } else {
          release(back);
          setBack(slot);
        }
      })
      .finally(() => {
        setIsBusy(false);
      });
  }

  function reset() {
    release(front);
    release(back);
    setFront(null);
    setBack(null);
    setLineNumber("");
  }

  function handleSubmit() {
    if (!front || !back || !lineNumber.trim() || isBusy) return;
    setIsBusy(true);
    void postStickerManualVerificationApi({
      requestBody: {
        stickerLineNumber: lineNumber.trim(),
        frontPictureBase64: front.base64,
        backPictureBase64: back.base64,
      },
    })
      .then((result) => {
        if (result.type !== "success") {
          // The dialog stays open with both photos intact: the likely rejection
          // is an unknown line number or one that already has a tag, and making
          // the traveller re-shoot two photos to fix a typo would be gratuitous.
          toast.error(result.message);
          return;
        }
        toast.success(t.SSRService["Verification.Upload.Success"]);
        reset();
        setOpen(false);
        router.refresh();
      })
      .finally(() => {
        setIsBusy(false);
      });
  }

  return (
    <>
      <Button
        data-testid="upload-verification-button"
        onClick={() => {
          setOpen(true);
        }}
        size="sm"
        variant="outline"
      >
        {t.SSRService["Verification.Upload"]}
      </Button>
      <Dialog
        onOpenChange={(next) => {
          if (isBusy) return;
          if (!next) reset();
          setOpen(next);
        }}
        open={open}
      >
        <DialogContent className="max-h-[90svh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t.SSRService["Verification.Upload.Title"]}
            </DialogTitle>
            <DialogDescription>
              {t.SSRService["Verification.Upload.Description"]}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <PictureSlot
              disabled={isBusy}
              label={t.SSRService["Verification.Upload.StickerPhoto"]}
              onFile={(file) => {
                handleFile("front", file);
              }}
              slot={front}
              testId="upload-verification-front"
            />
            <PictureSlot
              disabled={isBusy}
              label={t.SSRService["Verification.Upload.FormPhoto"]}
              onFile={(file) => {
                handleFile("back", file);
              }}
              slot={back}
              testId="upload-verification-back"
            />
            <div className="flex flex-col gap-1.5">
              <Label
                data-testid="upload-verification-line-number-label"
                htmlFor="upload-verification-line-number"
              >
                {t.SSRService["Verification.Upload.LineNumberLabel"]}
              </Label>
              <Input
                data-testid="upload-verification-line-number"
                disabled={isBusy}
                id="upload-verification-line-number"
                onChange={(event) => {
                  setLineNumber(event.target.value);
                }}
                placeholder={
                  t.SSRService["Verification.Upload.LineNumberPlaceholder"]
                }
                value={lineNumber}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              data-testid="upload-verification-cancel"
              disabled={isBusy}
              onClick={() => {
                reset();
                setOpen(false);
              }}
              variant="outline"
            >
              {t.SSRService["Verification.Upload.Cancel"]}
            </Button>
            <Button
              data-testid="upload-verification-submit"
              disabled={isBusy || !front || !back || !lineNumber.trim()}
              onClick={handleSubmit}
            >
              {t.SSRService["Verification.Upload.Submit"]}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 3: Place the button**

In `apps/ssr/src/app/[lang]/(main)/tags/_components/tags-view.tsx`, add the
import and put the button beside `ClaimTag`:

```tsx
import { UploadVerificationDialog } from "./upload-verification-dialog";
```

```tsx
          <div className="flex items-center gap-2">
            <UploadVerificationDialog />
            <ClaimTag />
          </div>
```

- [ ] **Step 4: Type-check and lint**

Run: `cd c:\unirefund\web-app\apps\ssr && pnpm type-check && pnpm lint`
Expected: both PASS.

- [ ] **Step 5: Verify on a real phone over HTTPS**

The `capture` attribute and `createImageBitmap` both need a real device to mean
anything. On a phone, signed in as a traveller holding `.Upload`:

- both slots open the camera directly;
- a portrait photo previews upright, not sideways;
- submitting with a real sticker line number succeeds and the pair appears in
  the pending section after the refresh;
- submitting with a nonsense line number shows the server's message and leaves
  both photos in place.

Check the Network tab: the request body should be roughly 5 MB or less. If it is
larger, `MAX_BASE64_CHARS` in Task 7 was not applied.

- [ ] **Step 6: Commit**

```bash
cd c:/unirefund/web-app
git add "apps/ssr/src/app/[lang]/(main)/tags" apps/ssr/src/language-data
git commit -m "feat(ssr): upload a sticker picture pair for manual verification"
```

---

### Task 9: Extract the shared barcode format map (submodule)

**Files:**
- Create: `packages/ayasofyazilim-ui/src/custom/barcode-formats.ts`
- Modify: `packages/ayasofyazilim-ui/src/custom/barcode-camera-scanner/index.tsx`

**Interfaces:**
- Consumes: `@zxing/library`'s `BarcodeFormat`.
- Produces: `BarcodeFormatName`, `FORMAT_TO_ZXING`, `ALL_BARCODE_FORMATS`, `BarcodeDetectorResult`, `BarcodeDetectorCtor`, `getNativeBarcodeDetectorCtor()`. Task 10 consumes all of them.

**This is a pure refactor.** No behaviour changes. The existing Jest suite plus
`type-check` is the gate.

- [ ] **Step 1: Create the shared module**

Create `packages/ayasofyazilim-ui/src/custom/barcode-formats.ts`, moving the
declarations verbatim out of `barcode-camera-scanner/index.tsx` lines 9–21,
27–39, 44–57 and 60, and exporting each:

```ts
import { BarcodeFormat } from "@zxing/library";

// ── W3C Barcode Detection API types (Chrome/Edge/Safari 17+) ─────────────────
export interface BarcodeDetectorResult {
  rawValue: string;
  format: string;
}
export interface BarcodeDetectorCtor {
  new (options?: { formats: string[] }): {
    detect(
      source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap
    ): Promise<BarcodeDetectorResult[]>;
  };
  getSupportedFormats(): Promise<string[]>;
}

/**
 * Barcode formats the scanners can recognise. Names follow the W3C Barcode
 * Detection API; each maps to its ZXing equivalent for the software fallback.
 */
export type BarcodeFormatName =
  | "aztec"
  | "code_128"
  | "code_39"
  | "code_93"
  | "data_matrix"
  | "ean_13"
  | "ean_8"
  | "itf"
  | "pdf417"
  | "qr_code"
  | "upc_a"
  | "upc_e";

// Maps each public format name to its ZXing enum (used by the software
// fallback). The keys double as the native BarcodeDetector format strings, so
// both decode paths stay in sync from a single source of truth.
export const FORMAT_TO_ZXING: Record<BarcodeFormatName, BarcodeFormat> = {
  aztec: BarcodeFormat.AZTEC,
  code_128: BarcodeFormat.CODE_128,
  code_39: BarcodeFormat.CODE_39,
  code_93: BarcodeFormat.CODE_93,
  data_matrix: BarcodeFormat.DATA_MATRIX,
  ean_13: BarcodeFormat.EAN_13,
  ean_8: BarcodeFormat.EAN_8,
  itf: BarcodeFormat.ITF,
  pdf417: BarcodeFormat.PDF_417,
  qr_code: BarcodeFormat.QR_CODE,
  upc_a: BarcodeFormat.UPC_A,
  upc_e: BarcodeFormat.UPC_E,
};

// Every supported format - the default set when the caller doesn't restrict it.
export const ALL_BARCODE_FORMATS = Object.keys(
  FORMAT_TO_ZXING
) as BarcodeFormatName[];

/**
 * The native detector constructor, or null where the API is absent - Firefox
 * entirely, and Safari before it shipped the API. Callers fall back to ZXing.
 */
export function getNativeBarcodeDetectorCtor(): BarcodeDetectorCtor | null {
  return typeof window !== "undefined" && "BarcodeDetector" in window
    ? (window as unknown as { BarcodeDetector: BarcodeDetectorCtor })
        .BarcodeDetector
    : null;
}
```

Note the one widening: `detect` now also accepts `ImageBitmap`, which Task 10
needs and the video path does not use.

- [ ] **Step 2: Point the camera scanner at it**

In `barcode-camera-scanner/index.tsx`, delete those same declarations and import
them instead:

```ts
import {
  ALL_BARCODE_FORMATS,
  FORMAT_TO_ZXING,
  getNativeBarcodeDetectorCtor,
  type BarcodeFormatName,
} from "../barcode-formats";
```

Keep `BarcodeFormatName` exported from the scanner as well — it is part of that
module's public surface today and removing it would break consumers:

```ts
export type { BarcodeFormatName };
```

Replace the inline `BDCtor` expression (around line 410) with:

```ts
    const BDCtor = getNativeBarcodeDetectorCtor();
```

`LINEAR_1D_FORMATS` and `SQUARE_2D_FORMATS` stay in the scanner — they describe
its viewfinder shape and rotation policy, not the format vocabulary.

- [ ] **Step 3: Run the existing suite**

Run: `cd c:\unirefund\web-app\packages\ayasofyazilim-ui && pnpm test`
Expected: PASS, same count as before the change.

- [ ] **Step 4: Type-check and lint**

Run: `cd c:\unirefund\web-app\packages\ayasofyazilim-ui && pnpm type-check && pnpm lint`
Expected: both PASS.

- [ ] **Step 5: Verify the camera scanner still scans**

In `apps/web`, open `operations/scan-sticker`, press the camera button and scan a
QR. It must still resolve — this refactor touches the decode path's format
plumbing.

- [ ] **Step 6: Commit inside the submodule**

```bash
cd c:/unirefund/web-app/packages/ayasofyazilim-ui
git add src/custom/barcode-formats.ts src/custom/barcode-camera-scanner/index.tsx
git commit -m "refactor(barcode): extract the shared format map and native detector shim"
```

---

### Task 10: Still-image barcode decoder (submodule)

**Files:**
- Create: `packages/ayasofyazilim-ui/src/custom/barcode-image-decoder/index.ts`
- Create: `packages/ayasofyazilim-ui/src/custom/barcode-image-decoder/lib.ts`
- Create: `packages/ayasofyazilim-ui/src/custom/barcode-image-decoder/lib.test.ts`

**Interfaces:**
- Consumes: `barcode-formats.ts` (Task 9); `BrowserMultiFormatReader` from `@zxing/browser`; `DecodeHintType` from `@zxing/library`.
- Produces: `decodeBarcodeFromImage(source, options?): Promise<string | null>` and the pure helper `buildDecodeScales(width, height): number[]`. Task 11 consumes the former.

**Precedent:** `src/custom/credit-card-scanner/lib.test.ts` is the pattern for a
pure-helper test beside a scanner. Only the pure helper is unit-tested; the
decode path itself needs a real canvas and is covered by the manual check.

- [ ] **Step 1: Write the failing test**

Create `packages/ayasofyazilim-ui/src/custom/barcode-image-decoder/lib.test.ts`:

```ts
import { buildDecodeScales } from "./lib";

describe("buildDecodeScales", () => {
  it("tries the capped natural size first, then smaller", () => {
    expect(buildDecodeScales(4000, 3000)).toEqual([1600, 1024, 640]);
  });

  it("never upscales an image smaller than the first cap", () => {
    expect(buildDecodeScales(800, 600)).toEqual([800, 640]);
  });

  it("collapses to a single pass for an image below every cap", () => {
    expect(buildDecodeScales(320, 240)).toEqual([320]);
  });

  it("measures the longest edge, not the width", () => {
    expect(buildDecodeScales(600, 2400)).toEqual([1600, 1024, 640]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd c:\unirefund\web-app\packages\ayasofyazilim-ui && pnpm test -- barcode-image-decoder`
Expected: FAIL — `Cannot find module './lib'`.

- [ ] **Step 3: Write the helper**

Create `packages/ayasofyazilim-ui/src/custom/barcode-image-decoder/lib.ts`:

```ts
/**
 * Longest-edge sizes to attempt, largest first.
 *
 * One size is not enough in either direction. A 12 MP photo of a small QR often
 * decodes *better* downscaled - the finder patterns survive while sensor noise
 * does not - but a QR shot from a distance needs the larger pass to keep enough
 * pixels per module. So the decoder sweeps down and stops at the first hit.
 */
const DECODE_EDGES = [1600, 1024, 640];

/**
 * The sizes to try for an image of this size, in order. Never upscales: an
 * image already smaller than a cap is tried at its own size instead, and sizes
 * at or above it are dropped.
 */
export function buildDecodeScales(width: number, height: number): number[] {
  const longest = Math.max(width, height);
  const scales = DECODE_EDGES.filter((edge) => edge < longest);
  return [Math.min(longest, DECODE_EDGES[0]), ...scales];
}
```

- [ ] **Step 4: Run the test again**

Run: `cd c:\unirefund\web-app\packages\ayasofyazilim-ui && pnpm test -- barcode-image-decoder`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the decoder**

Create `packages/ayasofyazilim-ui/src/custom/barcode-image-decoder/index.ts`:

```ts
"use client";

import { BrowserMultiFormatReader } from "@zxing/browser";
import { DecodeHintType } from "@zxing/library";
import {
  ALL_BARCODE_FORMATS,
  FORMAT_TO_ZXING,
  getNativeBarcodeDetectorCtor,
  type BarcodeFormatName,
} from "../barcode-formats";
import { buildDecodeScales } from "./lib";

export { buildDecodeScales };

export interface DecodeBarcodeFromImageOptions {
  /** Restrict the decode. Defaults to every supported format. */
  formats?: BarcodeFormatName[];
}

async function toBitmap(
  source: Blob | ImageBitmap | HTMLCanvasElement
): Promise<ImageBitmap> {
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    return source;
  }
  return createImageBitmap(source as Blob | HTMLCanvasElement);
}

function drawAt(bitmap: ImageBitmap, edge: number): HTMLCanvasElement {
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Reads the first barcode found in a still image, or null if there is none.
 *
 * Mirrors `barcode-camera-scanner`'s two decode paths - native
 * `BarcodeDetector` where the browser has it, ZXing everywhere else - because
 * the fallback is what makes this work at all on Firefox and older Safari.
 *
 * Unlike the video path there are no rotation retries: QR, Data Matrix and
 * Aztec all self-orient, and the 1-D symbologies that do not are not what a
 * still-image caller is looking for. Returns null rather than throwing, so a
 * miss is an ordinary outcome the caller can ignore.
 */
export async function decodeBarcodeFromImage(
  source: Blob | ImageBitmap | HTMLCanvasElement,
  options: DecodeBarcodeFromImageOptions = {}
): Promise<string | null> {
  const formats =
    options.formats && options.formats.length > 0
      ? options.formats
      : ALL_BARCODE_FORMATS;

  let bitmap: ImageBitmap;
  try {
    bitmap = await toBitmap(source);
  } catch {
    return null;
  }

  const scales = buildDecodeScales(bitmap.width, bitmap.height);
  const BDCtor = getNativeBarcodeDetectorCtor();

  try {
    if (BDCtor) {
      let nativeFormats: string[] = formats;
      try {
        const supported = new Set(await BDCtor.getSupportedFormats());
        nativeFormats = formats.filter((f) => supported.has(f));
      } catch {
        nativeFormats = [];
      }
      if (nativeFormats.length > 0) {
        const detector = new BDCtor({ formats: nativeFormats });
        for (const edge of scales) {
          try {
            const results = await detector.detect(drawAt(bitmap, edge));
            const hit = results.find((r) => r.rawValue);
            if (hit) return hit.rawValue;
          } catch {
            // A single scale failing is not fatal - fall through to the next.
          }
        }
        return null;
      }
    }

    const hints = new Map();
    hints.set(
      DecodeHintType.POSSIBLE_FORMATS,
      formats.map((f) => FORMAT_TO_ZXING[f])
    );
    // Exhaustive pattern matching. Affordable here in a way it is not on the
    // video path: this runs a handful of times against one picture, not every
    // frame.
    hints.set(DecodeHintType.TRY_HARDER, true);
    const reader = new BrowserMultiFormatReader(hints);

    for (const edge of scales) {
      try {
        const result = reader.decodeFromCanvas(drawAt(bitmap, edge));
        const text = result.getText();
        if (text) return text;
      } catch {
        // ZXing throws NotFoundException per failed scale. Expected.
      }
    }
    return null;
  } finally {
    // Only close a bitmap we made; the caller still owns one they passed in.
    if (bitmap !== source) bitmap.close();
  }
}
```

- [ ] **Step 6: Full submodule gate**

Run: `cd c:\unirefund\web-app\packages\ayasofyazilim-ui && pnpm test && pnpm type-check && pnpm lint`
Expected: all three PASS.

If `decodeFromCanvas` is not on `BrowserMultiFormatReader` in the installed
`@zxing/browser` version, check the class for the still-image method it does
expose (`decodeFromImageElement` / `decodeFromImageUrl`) and adapt — do not add
a dependency.

- [ ] **Step 7: Commit and open the submodule PR**

```bash
cd c:/unirefund/web-app/packages/ayasofyazilim-ui
git add src/custom/barcode-image-decoder
git commit -m "feat(barcode): decode a barcode from a still image"
```

Push the branch and open a PR against the `ayasofyazilim-ui` repository. Task 11
cannot be verified until it merges and the pointer is bumped.

---

### Task 11: Prefill the sticker line number from the photo

**Files:**
- Modify: `apps/ssr/src/app/[lang]/(main)/tags/_components/upload-verification-dialog.tsx`
- Modify: `apps/ssr/src/language-data/unirefund/SSRService/resources/en.json` and `tr.json`
- Modify: the submodule pointer at `packages/ayasofyazilim-ui`

**Interfaces:**
- Consumes: `decodeBarcodeFromImage` (Task 10); `decodeTagScan` from `@unirefund/qr`; the dialog's `front` slot (Task 8).
- Produces: nothing downstream.

- [ ] **Step 1: Bump the submodule pointer**

```bash
cd c:/unirefund/web-app/packages/ayasofyazilim-ui
git checkout main && git pull
cd c:/unirefund/web-app
git add packages/ayasofyazilim-ui
git commit -m "chore: bump ayasofyazilim-ui for the still-image barcode decoder"
```

- [ ] **Step 2: Add the hint key**

In `apps/ssr/src/language-data/unirefund/SSRService/resources/en.json`:

```json
  "Verification.Upload.LineNumberFromPhoto": "Read from your photo — check it matches the sticker.",
```

In `tr.json`:

```json
  "Verification.Upload.LineNumberFromPhoto": "Fotoğrafınızdan okundu — etiketle eşleştiğini kontrol edin.",
```

Run: `cd c:\unirefund\web-app\apps\ssr && pnpm run init`

- [ ] **Step 3: Decode after the front photo is prepared**

In `upload-verification-dialog.tsx`, add the imports:

```ts
import { decodeBarcodeFromImage } from "@repo/ayasofyazilim-ui/custom/barcode-image-decoder";
import { decodeTagScan } from "@unirefund/qr";
```

Add a state flag beside the others:

```ts
const [lineNumberFromPhoto, setLineNumberFromPhoto] = useState(false);
```

In `handleFile`, after the `setFront(...)` call, add the decode. It runs off the
preview path on purpose — the thumbnail is already on screen by the time this
resolves:

```ts
        if (which === "front") {
          release(front);
          setFront(slot);
          /*
           * Help, not a gate. A sheet holds several stickers and the camera
           * easily catches a neighbour's code, so the field stays editable and
           * a miss is silent - manual entry was always the baseline.
           */
          void decodeBarcodeFromImage(slot.bitmap, { formats: ["qr_code"] })
            .then((raw) => {
              if (!raw) return;
              // A tag QR decodes fine but carries no `s` key, so it yields an
              // empty line number and needs no special case.
              const scanned = decodeTagScan(raw).stickerLineNumber;
              if (!scanned) return;
              setLineNumber(scanned);
              setLineNumberFromPhoto(true);
            })
            .catch(() => {
              // Decoding is best-effort; the field is already usable.
            });
        } else {
```

Clear the flag when the traveller edits the field, and in `reset`:

```ts
                onChange={(event) => {
                  setLineNumber(event.target.value);
                  setLineNumberFromPhoto(false);
                }}
```

```ts
  function reset() {
    release(front);
    release(back);
    setFront(null);
    setBack(null);
    setLineNumber("");
    setLineNumberFromPhoto(false);
  }
```

Render the hint under the input:

```tsx
              {lineNumberFromPhoto ? (
                <p className="text-muted-foreground text-xs">
                  {t.SSRService["Verification.Upload.LineNumberFromPhoto"]}
                </p>
              ) : null}
```

- [ ] **Step 4: Confirm `decodeTagScan`'s field name**

Run: `cd c:\unirefund\web-app && pnpm --filter ssr type-check`
Expected: PASS. If `stickerLineNumber` is not a property of `decodeTagScan`'s
return type, read the real name from
`apps/web/src/app/[lang]/(main)/(unirefund)/operations/scan-sticker/client.tsx`
around its `classifyScan` function, which already destructures it.

- [ ] **Step 5: Lint**

Run: `cd c:\unirefund\web-app\apps\ssr && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Verify against a real printed sticker**

Print a sticker sheet from `operations/stickers/{id}` in `apps/web`, then on a
phone open the upload dialog and photograph one sticker as the front picture.
Confirm the line number fills in on its own, the hint appears, editing the field
clears the hint, and the submitted pair carries the number that was typed or
prefilled. Then photograph something with no QR and confirm the field stays
empty with no error.

- [ ] **Step 7: Commit**

```bash
cd c:/unirefund/web-app
git add "apps/ssr/src/app/[lang]/(main)/tags/_components/upload-verification-dialog.tsx" apps/ssr/src/language-data packages/ayasofyazilim-ui
git commit -m "feat(ssr): prefill the sticker line number from the photo's QR"
```

---

## Final verification

Run the full gate across everything the plan touched:

```bash
cd c:/unirefund/web-app/packages/actions && pnpm type-check && pnpm lint
cd c:/unirefund/web-app/packages/ayasofyazilim-ui && pnpm test && pnpm type-check && pnpm lint
cd c:/unirefund/web-app/apps/web && pnpm run init && pnpm type-check && pnpm lint
cd c:/unirefund/web-app/apps/ssr && pnpm run init && pnpm type-check && pnpm lint
```

Then walk the feature end to end on a dev environment where DbMigrator has run
and the permissions are granted: upload a pair as a traveller from a phone,
review it as an officer, reject one and confirm the traveller reads the reason,
then create a tag from another and confirm it lands on the traveller's tag list.

## Deployment notes for whoever ships this

None of this responds until the backend side is in place, and each of these
fails in a way that looks like a frontend bug:

- **DbMigrator must run** — two new TagService migrations plus two new FileService
  file types.
- **Permissions are per-environment.** Dev granted the seven new ones to
  `Refund Point Admin` and `Refund Point HQ Manager` only. Travellers need
  `.Upload` and `.ViewMine` or all of Tasks 6–11 are invisible by design.
- **`TagService.StickerHeaders.ViewMerchantInfo`** is a pre-existing grant, not one
  of the seven. Without it the create-tag form's merchant block returns 403.
- **Users must re-authenticate.** The OAuth scope list changed and a refresh grant
  reuses the original scope, so existing sessions keep their old audiences until
  browser storage is cleared.

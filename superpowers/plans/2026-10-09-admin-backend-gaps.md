# Admin backend gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give three backend features that already sit unused in web-app's SDK a UI: renaming a table header that is in use, deletion impact and force delete for tour events and VAT rates, and host-only administration of Didit accounts.

**Architecture:**
- The logic worth testing goes into pure `.ts` modules, tested with `pnpm --filter web test:unit` (Node's own runner, which cannot run JSX).
- Components stay thin and call server actions in `@repo/actions`.
- The two deletion flows share one helper module and one view component under `apps/web/src/components/deletion-impact/`.
- The Didit pages copy the VAT CRUD pattern.

**Tech Stack:** Next.js App Router (`apps/web`), React 19, `@repo/ayasofyazilim-ui` (SchemaForm, MasterDataGrid, Dialog), react-hook-form (contract table forms), generated hey-api clients under `@repo/saas`, and `node:test` with tsx.

**Spec:** `C:\unirefund\docs\superpowers\specs\2026-10-09-admin-backend-gaps-design.md`

## Global Constraints

- **Worktree and branch:** work in `C:\unirefund\web-app-wt-sdk`, on branch `feat/admin-backend-gaps` created from `origin/main`. Do not push.
- **Never call SDK clients from app code.** Every call goes through `packages/actions`:
  - `actions.ts` (GET) returns `structuredSuccessResponse` and **throws** `structuredError`.
  - `post-`, `put-` and `delete-actions.ts` return `structuredResponse` and **return** `structuredError`.
- **Gating:** every action button needs its endpoint's group grant **and** leaf grant, checked with `isActionGranted([...], grantedPolicies)` (client) or `guardPage({ requires: [...] })` (page). Render nothing when either grant is missing.
- **Unknown counts:** a negative deletion-impact count means "that service could not be reached". Show it as unknown, never as 0.
- **Didit on dev:** do not create, edit, delete or reinstate a Didit account on dev. Only read paths may be checked by hand there; anything else needs the user's go-ahead first.
- **i18n:** after adding a key to any `resources/{en,tr}.json`, run `pnpm --filter web run init` before `type-check`. It regenerates the gitignored `src/language-data/i18n/*.gen.json`.
  - Never commit those bundles.
  - Never stage `packages/utils` or `packages/ayasofyazilim-ui`. `init` rewrites `packages/utils/policies/policies.json` inside a submodule.
- **Staging:** stage explicit paths only, never `git add -A` and never a directory. The lint-staged pre-commit hook runs prettier itself.
- **Comments:** keep them sparse. Comment only where the reason is not obvious from the code.
- **Copy:** keep these strings verbatim.
  - "Tags already priced keep the old name until they are repriced or corrected."
  - "Unknown (service unreachable)"
- **Running one test file:** `node --test` treats `[` as a glob character, so escape every bracketed route segment as `[[]`. For example:

  ```
  cd apps/web && node --import tsx --test "src/app/[[]lang]/(main)/(unirefund)/settings/templates/_components/name-edit-mode.test.ts"
  ```

## Review Focus

1. **Enter in the Name field in name-only mode.** It submits the react-hook-form form, and a locked form must not send the full `PUT`. `onSubmit` must return early unless the mode is `"full"`. Task 1 Step 7 pins this with a manual check.
2. **The impact fetch fails after a "still referenced" refusal** (service down, or the grant was removed mid-session). The dialog must still show the backend message, say the list could not be loaded, and keep **Delete anyway** for ForceDelete holders. Task 2 pins the state type, and Task 3 Step 6 pins the behaviour with a manual check.
3. **Didit list filters arrive as the strings `"true"`/`"false"` in `searchParams`.** Passing them straight through would send a string where the SDK expects a boolean. Task 5 pins this with `toOptionalBoolean` tests.
4. **Saving a Didit account without touching the key field.** The update must not carry an `apiKey` the user never typed. Task 5 pins this with a `toUpdateForm` test that asserts `apiKey` is absent.
5. **Deleting from the tour-guide copy of an event.** It must return to `/parties/tour-guides/{partyId}/events`, not to `/operations/events`. Task 3 Step 6 pins this with a manual check.

---

### Task 0: Branch

**Files:** none

- [ ] **Step 1: Create the branch in the existing worktree**

```bash
cd /c/unirefund/web-app-wt-sdk
git status --short            # expect clean
git fetch origin
git switch -c feat/admin-backend-gaps origin/main
git submodule update --init
pnpm --filter web run init    # regenerates the gitignored i18n bundle
git status --short            # expect only " m packages/utils" (policies.json) or nothing; leave it
```

---

### Task 1: Rename a table header that is in use

**Files:**
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/settings/templates/_components/name-edit-mode.ts`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/settings/templates/_components/name-edit-mode.test.ts`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/settings/templates/_components/save-table-name.tsx`
- Modify: `packages/actions/unirefund/ContractService/put-actions.ts`
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/settings/templates/refund-tables/[id]/_components/form.tsx`
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/settings/templates/refund-fees/[id]/_components/form.tsx`
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/settings/templates/rebate-tables/[id]/_components/form.tsx`
- Modify: `apps/web/src/language-data/unirefund/ContractService/resources/en.json`, `.../tr.json`

**Interfaces:**
- Produces:
  - `nameEditMode({ hasEditGrant, hasEditNameGrant, isEditable }: { hasEditGrant: boolean; hasEditNameGrant: boolean; isEditable: boolean }): NameEditMode`, where `type NameEditMode = "full" | "name-only" | "locked"`
  - `putRefundTableHeaderNameApi`, `putRefundFeeHeaderNameApi`, `putRebateTableHeaderNameApi`. Each takes the generated `PutApiContractService…HeadersByIdNameData` and returns a `ServerResponse`.
  - `<SaveTableName save label hint />`

- [ ] **Step 1: Write the failing test**

`.../settings/templates/_components/name-edit-mode.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nameEditMode } from "./name-edit-mode";

describe("nameEditMode", () => {
  it("uses the full form when it is editable and the caller may edit it", () => {
    assert.equal(
      nameEditMode({ hasEditGrant: true, hasEditNameGrant: false, isEditable: true }),
      "full"
    );
    assert.equal(
      nameEditMode({ hasEditGrant: true, hasEditNameGrant: true, isEditable: true }),
      "full"
    );
  });

  it("offers a name-only save on a table that is in use", () => {
    assert.equal(
      nameEditMode({ hasEditGrant: true, hasEditNameGrant: true, isEditable: false }),
      "name-only"
    );
  });

  it("offers a name-only save to a caller who may only rename", () => {
    assert.equal(
      nameEditMode({ hasEditGrant: false, hasEditNameGrant: true, isEditable: true }),
      "name-only"
    );
  });

  it("locks the name for a caller who may do neither", () => {
    assert.equal(
      nameEditMode({ hasEditGrant: false, hasEditNameGrant: false, isEditable: true }),
      "locked"
    );
    assert.equal(
      nameEditMode({ hasEditGrant: true, hasEditNameGrant: false, isEditable: false }),
      "locked"
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/web && node --import tsx --test "src/app/[[]lang]/(main)/(unirefund)/settings/templates/_components/name-edit-mode.test.ts"`
Expected: FAIL, because `./name-edit-mode` cannot be resolved.

- [ ] **Step 3: Implement the helper**

`.../settings/templates/_components/name-edit-mode.ts`:

```ts
export type NameEditMode = "full" | "name-only" | "locked";

// The `/name` routes succeed on a table already in use, so EditName can rename
// a table the full form refuses to edit.
export function nameEditMode({
  hasEditGrant,
  hasEditNameGrant,
  isEditable,
}: {
  hasEditGrant: boolean;
  hasEditNameGrant: boolean;
  isEditable: boolean;
}): NameEditMode {
  if (hasEditGrant && isEditable) return "full";
  if (hasEditNameGrant) return "name-only";
  return "locked";
}
```

- [ ] **Step 4: Run it and watch it pass**

Run the Step 2 command again. Expected: `# pass 4`, `# fail 0`.

- [ ] **Step 5: Add the three put-actions**

In `packages/actions/unirefund/ContractService/put-actions.ts`, add these three names to the existing `import type { … } from "@repo/saas/ContractService"` list:

```ts
  PutApiContractServiceRebateTableHeadersByIdNameData,
  PutApiContractServiceRefundFeeHeadersByIdNameData,
  PutApiContractServiceRefundTableHeadersByIdNameData,
```

Then add these functions directly after `putRebateTableHeadersByIdApi`:

```ts
export async function putRefundTableHeaderNameApi(
  data: PutApiContractServiceRefundTableHeadersByIdNameData
) {
  try {
    const client = await getContractServiceClient();
    const response =
      await client.refundTableHeader.putApiContractServiceRefundTableHeadersByIdName(
        data
      );
    return structuredResponse(response);
  } catch (error) {
    return structuredError(error);
  }
}

export async function putRefundFeeHeaderNameApi(
  data: PutApiContractServiceRefundFeeHeadersByIdNameData
) {
  try {
    const client = await getContractServiceClient();
    const response =
      await client.refundFeeHeader.putApiContractServiceRefundFeeHeadersByIdName(
        data
      );
    return structuredResponse(response);
  } catch (error) {
    return structuredError(error);
  }
}

export async function putRebateTableHeaderNameApi(
  data: PutApiContractServiceRebateTableHeadersByIdNameData
) {
  try {
    const client = await getContractServiceClient();
    const response =
      await client.rebateTableHeader.putApiContractServiceRebateTableHeadersByIdName(
        data
      );
    return structuredResponse(response);
  } catch (error) {
    return structuredError(error);
  }
}
```

- [ ] **Step 6: Add the strings and the shared button, then wire the three forms**

**Strings.** In `apps/web/src/language-data/unirefund/ContractService/resources/en.json`, add after `"Templates.name"`:

```json
  "Templates.SaveName": "Save name",
  "Templates.SaveName.hint": "Only the name can be changed here. Tags already priced keep the old name until they are repriced or corrected.",
```

In `tr.json`, at the same spot:

```json
  "Templates.SaveName": "Adı kaydet",
  "Templates.SaveName.hint": "Burada yalnızca ad değiştirilebilir. Fiyatlandırılmış etiketler, yeniden fiyatlandırılana veya düzeltilene kadar eski adı korur.",
```

**Shared button.** Create `.../settings/templates/_components/save-table-name.tsx`:

```tsx
"use client";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import { useFormContext } from "@repo/ayasofyazilim-ui/components/form";
import { handlePutResponse } from "@repo/utils/api";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function SaveTableName({
  save,
  label,
  hint,
}: {
  save: (
    name: string
  ) => Promise<{ type: "success" | "api-error"; message: string }>;
  label: string;
  hint: string;
}) {
  const form = useFormContext<{ name: string }>();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{hint}</p>
      <Button
        data-testid="save-name-button"
        disabled={isPending}
        onClick={() => {
          void form.trigger("name").then((valid) => {
            if (!valid) return;
            startTransition(() => {
              void save(form.getValues("name")).then((response) => {
                handlePutResponse(response, router);
              });
            });
          });
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        {label}
      </Button>
    </div>
  );
}
```

**Refund-tables form.** In `refund-tables/[id]/_components/form.tsx`:

1. Add imports:
   ```ts
   import { putRefundTableHeaderNameApi } from "@repo/actions/unirefund/ContractService/put-actions";
   import { nameEditMode } from "../../../_components/name-edit-mode";
   import { SaveTableName } from "../../../_components/save-table-name";
   ```
   (`putRefundTableHeadersByIdApi` is already imported from the same module, so merge the two into one import.)
2. After `hasEditGrant`, add:
   ```ts
   const hasEditNameGrant = isActionGranted(
     [
       "ContractService.RefundTableHeader",
       "ContractService.RefundTableHeader.EditName",
     ],
     grantedPolicies
   );
   const nameMode = nameEditMode({
     hasEditGrant,
     hasEditNameGrant,
     isEditable: !!formData.isEditable,
   });
   ```
3. Make the first line of `onSubmit`:
   ```ts
   if (nameMode !== "full") return;
   ```
   This replaces `if (!hasEditGrant) return;`, because `"full"` already implies `hasEditGrant`.
4. On the `name` field's `<Input>`, change `disabled={isLocked}` to:
   ```tsx
   disabled={isPending || nameMode === "locked"}
   ```
5. Directly after the `name` `FormField`'s closing `/>`, add:
   ```tsx
   {nameMode === "name-only" ? (
     <SaveTableName
       hint={languageData["Templates.SaveName.hint"]}
       label={languageData["Templates.SaveName"]}
       save={(name) =>
         putRefundTableHeaderNameApi({
           id: formData.id,
           requestBody: { name },
         })
       }
     />
   ) : null}
   ```

**Refund-fees form.** In `refund-fees/[id]/_components/form.tsx`, make the same five edits:
- Use `putRefundFeeHeaderNameApi`.
- Use grant `["ContractService.RefundFeeHeader", "ContractService.RefundFeeHeader.EditName"]`.
- The name `<Input>` is written `{...field} disabled={isLocked}`. Change only its `disabled`.

**Rebate-tables form.** In `rebate-tables/[id]/_components/form.tsx`, make the same five edits:
- Use `putRebateTableHeaderNameApi`.
- Use grant `["ContractService.RebateTableHeader", "ContractService.RebateTableHeader.EditName"]`.
- The name `<Input>` also carries `placeholder`. Leave that as is.

In every form, keep the amber read-only notice and every other field's `disabled={isLocked}` unchanged.

- [ ] **Step 7: Type-check, lint, and check Enter by hand**

```bash
cd /c/unirefund/web-app-wt-sdk
pnpm --filter web type-check          # expect exit 0, no new errors
cd apps/web && npx eslint "src/app/[lang]/(main)/(unirefund)/settings/templates" ../../packages/actions/unirefund/ContractService/put-actions.ts
```

Expected: no errors.

Manual check (Review Focus 1), done in Task 9: on a locked table in name-only mode, type a name and press Enter. The network tab must show **no** `PUT …/refund-table-headers/{id}` (the full route).

- [ ] **Step 8: Commit**

```bash
git add -- "apps/web/src/app/[lang]/(main)/(unirefund)/settings/templates/_components/name-edit-mode.ts" \
  "apps/web/src/app/[lang]/(main)/(unirefund)/settings/templates/_components/name-edit-mode.test.ts" \
  "apps/web/src/app/[lang]/(main)/(unirefund)/settings/templates/_components/save-table-name.tsx" \
  "apps/web/src/app/[lang]/(main)/(unirefund)/settings/templates/refund-tables/[id]/_components/form.tsx" \
  "apps/web/src/app/[lang]/(main)/(unirefund)/settings/templates/refund-fees/[id]/_components/form.tsx" \
  "apps/web/src/app/[lang]/(main)/(unirefund)/settings/templates/rebate-tables/[id]/_components/form.tsx" \
  packages/actions/unirefund/ContractService/put-actions.ts \
  apps/web/src/language-data/unirefund/ContractService/resources/en.json \
  apps/web/src/language-data/unirefund/ContractService/resources/tr.json
git commit -m "feat(contracts): rename a refund, refund fee or rebate table that is in use"
```

---

### Task 2: Shared deletion-impact helper and view

**Files:**
- Create: `apps/web/src/components/deletion-impact/deletion-impact.ts`
- Create: `apps/web/src/components/deletion-impact/deletion-impact.test.ts`
- Create: `apps/web/src/components/deletion-impact/deletion-impact-view.tsx`
- Modify: `apps/web/src/language-data/core/Default/resources/en.json`, `.../tr.json`

**Interfaces:**
- Produces:
  - `type DeleteRefusal = "still-referenced" | "not-deletable"`
  - `deleteRefusal(response: { type: string; code?: string }): DeleteRefusal | null`
  - `type ReferenceCount = { serviceName: string; entityType: string; count: number }`
  - `type ImpactRow = { key: string; serviceName: string; entityType: string; count: number | null }`
  - `normalizeImpact(rows: ReferenceCount[] | null | undefined): ImpactRow[]`
  - `type ImpactState = "hidden" | "loading" | "failed" | ReferenceCount[]`
  - `<DeletionImpactView state={ImpactState} />`

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/deletion-impact/deletion-impact.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deleteRefusal, normalizeImpact } from "./deletion-impact";

describe("deleteRefusal", () => {
  it("recognises a delete refused because other records still reference it", () => {
    assert.equal(
      deleteRefusal({ type: "api-error", code: "UniRefund.Shared:010004" }),
      "still-referenced"
    );
  });

  it("recognises a type that can never be deleted", () => {
    assert.equal(
      deleteRefusal({ type: "api-error", code: "UniRefund.Shared:010003" }),
      "not-deletable"
    );
  });

  it("ignores other errors, errors without a code, and successes", () => {
    assert.equal(
      deleteRefusal({ type: "api-error", code: "UniRefund.Shared:010005" }),
      null
    );
    assert.equal(deleteRefusal({ type: "api-error" }), null);
    assert.equal(deleteRefusal({ type: "success" }), null);
  });
});

describe("normalizeImpact", () => {
  it("shows an unreachable service as unknown, never as zero", () => {
    const [row] = normalizeImpact([
      { serviceName: "FinanceService", entityType: "VATStatementTagDetail", count: -1 },
    ]);
    assert.equal(row?.count, null);
  });

  it("drops entries with no references and sorts by service, then entity", () => {
    const rows = normalizeImpact([
      { serviceName: "TagService", entityType: "Tag", count: 3 },
      { serviceName: "CRMService", entityType: "TourEventTraveller", count: 0 },
      { serviceName: "FinanceService", entityType: "VATStatementTagDetail", count: 12 },
      { serviceName: "FinanceService", entityType: "RebateStatementTagDetail", count: 1 },
    ]);
    assert.deepEqual(
      rows.map((row) => [row.serviceName, row.entityType, row.count]),
      [
        ["FinanceService", "RebateStatementTagDetail", 1],
        ["FinanceService", "VATStatementTagDetail", 12],
        ["TagService", "Tag", 3],
      ]
    );
  });

  it("treats a missing list as no impact", () => {
    assert.deepEqual(normalizeImpact(undefined), []);
    assert.deepEqual(normalizeImpact(null), []);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/web && node --import tsx --test src/components/deletion-impact/deletion-impact.test.ts`
Expected: FAIL, because `./deletion-impact` cannot be resolved.

- [ ] **Step 3: Implement the helper**

`apps/web/src/components/deletion-impact/deletion-impact.ts`:

```ts
export type DeleteRefusal = "still-referenced" | "not-deletable";

const REFUSALS: Record<string, DeleteRefusal> = {
  "UniRefund.Shared:010004": "still-referenced",
  "UniRefund.Shared:010003": "not-deletable",
};

export function deleteRefusal(response: {
  type: string;
  code?: string;
}): DeleteRefusal | null {
  if (response.type !== "api-error" || !response.code) return null;
  return REFUSALS[response.code] ?? null;
}

/** Same shape in every service's `UniRefund_Shared_Contracts_DeleteGuards_ReferenceCountDto`. */
export type ReferenceCount = {
  serviceName: string;
  entityType: string;
  count: number;
};

export type ImpactRow = {
  key: string;
  serviceName: string;
  entityType: string;
  /** `null` when the service could not be reached (a negative count). */
  count: number | null;
};

export type ImpactState = "hidden" | "loading" | "failed" | ReferenceCount[];

export function normalizeImpact(
  rows: ReferenceCount[] | null | undefined
): ImpactRow[] {
  return (rows ?? [])
    .filter((row) => row.count !== 0)
    .map((row) => ({
      key: `${row.serviceName}:${row.entityType}`,
      serviceName: row.serviceName,
      entityType: row.entityType,
      count: row.count < 0 ? null : row.count,
    }))
    .sort(
      (a, b) =>
        a.serviceName.localeCompare(b.serviceName) ||
        a.entityType.localeCompare(b.entityType)
    );
}
```

- [ ] **Step 4: Run it and watch it pass**

Run the Step 2 command again. Expected: `# pass 6`, `# fail 0`.

- [ ] **Step 5: Add the strings and the view**

In `apps/web/src/language-data/core/Default/resources/en.json`, add after `"Delete"`:

```json
  "DeletionImpact.Unknown": "Unknown (service unreachable)",
  "DeletionImpact.Unavailable": "The records that use it could not be listed.",
```

In `tr.json`, at the same spot:

```json
  "DeletionImpact.Unknown": "Bilinmiyor (servise ulaşılamadı)",
  "DeletionImpact.Unavailable": "Bunu kullanan kayıtlar listelenemedi.",
```

Create `apps/web/src/components/deletion-impact/deletion-impact-view.tsx`:

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { Skeleton } from "@repo/ayasofyazilim-ui/components/skeleton";
import { normalizeImpact, type ImpactState } from "./deletion-impact";

export function DeletionImpactView({ state }: { state: ImpactState }) {
  const { t } = useTranslations();
  if (state === "hidden") return null;
  if (state === "loading") return <Skeleton className="h-16 w-full" />;
  if (state === "failed")
    return (
      <p className="text-sm text-muted-foreground">
        {t.Default["DeletionImpact.Unavailable"]}
      </p>
    );
  const rows = normalizeImpact(state);
  if (rows.length === 0) return null;
  return (
    <ul
      className="divide-y rounded-md border text-sm"
      data-testid="deletion-impact-list"
    >
      {rows.map((row) => (
        <li
          className="flex items-center justify-between gap-4 px-3 py-2"
          key={row.key}
        >
          <span>
            <span className="font-medium">{row.entityType}</span>
            <span className="text-muted-foreground"> · {row.serviceName}</span>
          </span>
          {row.count === null ? (
            <span className="text-amber-700 dark:text-amber-300">
              {t.Default["DeletionImpact.Unknown"]}
            </span>
          ) : (
            <span className="font-medium tabular-nums">{row.count}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 6: Run init, type-check and lint**

```bash
cd /c/unirefund/web-app-wt-sdk
pnpm --filter web run init
pnpm --filter web type-check
cd apps/web && npx eslint src/components/deletion-impact
```

Expected: exit 0 for all three.

- [ ] **Step 7: Commit**

```bash
git add -- apps/web/src/components/deletion-impact/deletion-impact.ts \
  apps/web/src/components/deletion-impact/deletion-impact.test.ts \
  apps/web/src/components/deletion-impact/deletion-impact-view.tsx \
  apps/web/src/language-data/core/Default/resources/en.json \
  apps/web/src/language-data/core/Default/resources/tr.json
git commit -m "feat(web): show what a refused delete would break"
```

---

### Task 3: Delete a tour event, with impact and force delete

**Files:**
- Modify: `packages/actions/unirefund/CRMService/actions.ts`
- Modify: `packages/actions/unirefund/CRMService/delete-actions.ts`
- Create: `apps/web/src/components/tour-events/delete-tour-event-dialog.tsx`
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/events/[eventId]/_components/menu.tsx`
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/parties/tour-guides/[partyId]/events/[eventId]/_components/menu.tsx`
- Modify: `apps/web/src/language-data/unirefund/CRMService/resources/en.json`, `.../tr.json`

**Interfaces:**
- Consumes (from Task 2): `deleteRefusal`, `type ImpactState`, `DeletionImpactView`.
- Produces:
  - `getTourEventDeletionImpactApi(id: string, session?: Session | null)` (throws on error)
  - `deleteTourEventForceApi({ tourEventId, cascade, session? })`
  - `<DeleteTourEventDialog eventId returnTo />`

- [ ] **Step 1: Add the two actions**

At the end of `packages/actions/unirefund/CRMService/actions.ts` (`Session` and `getCRMServiceClient` are already imported there):

```ts
export async function getTourEventDeletionImpactApi(
  id: string,
  session?: Session | null
) {
  try {
    const crmClient = await getCRMServiceClient(session);
    const response =
      await crmClient.tourEvent.getApiCrmServiceTourEventsByIdDeletionImpact({
        id,
      });
    return structuredSuccessResponse(response);
  } catch (error) {
    throw structuredError(error);
  }
}
```

Check with `grep -n "structuredSuccessResponse\|structuredError" packages/actions/unirefund/CRMService/actions.ts | head -3` that both helpers are imported. Add whichever is missing to the existing `@repo/utils/api` import.

In `packages/actions/unirefund/CRMService/delete-actions.ts`, directly after `deleteTourEventByTourEventIdApi`:

```ts
export async function deleteTourEventForceApi({
  tourEventId,
  cascade,
  session,
}: {
  tourEventId: string;
  cascade: boolean;
  session?: Session | null;
}) {
  try {
    const crmClient = await getCRMServiceClient(session);
    const response =
      await crmClient.tourEvent.deleteApiCrmServiceTourEventsByIdForce({
        id: tourEventId,
        cascade,
      });
    return structuredResponse(response);
  } catch (error) {
    return structuredError(error);
  }
}
```

- [ ] **Step 2: Add the strings**

In `apps/web/src/language-data/unirefund/CRMService/resources/en.json`, add after `"CRM.TourEvent.remove.traveller.confirm"`:

```json
  "CRM.TourEvent.delete": "Delete event",
  "CRM.TourEvent.delete.confirm": "Delete this event? This cannot be undone.",
  "CRM.TourEvent.delete.referenced": "This event is still in use",
  "CRM.TourEvent.delete.force": "Delete anyway",
  "CRM.TourEvent.delete.cascade": "Also clean up the records that reference it",
  "CRM.TourEvent.delete.cascade.note": "The cleanup finishes in the background.",
```

In `tr.json`, at the same spot:

```json
  "CRM.TourEvent.delete": "Etkinliği sil",
  "CRM.TourEvent.delete.confirm": "Bu etkinlik silinsin mi? Bu işlem geri alınamaz.",
  "CRM.TourEvent.delete.referenced": "Bu etkinlik hâlâ kullanılıyor",
  "CRM.TourEvent.delete.force": "Yine de sil",
  "CRM.TourEvent.delete.cascade": "Ona bağlı kayıtları da temizle",
  "CRM.TourEvent.delete.cascade.note": "Temizlik arka planda tamamlanır.",
```

Then run `pnpm --filter web run init` (run it from the repo root).

- [ ] **Step 3: Write the dialog**

`apps/web/src/components/tour-events/delete-tour-event-dialog.tsx`:

```tsx
"use client";
import { deleteRefusal, type ImpactState } from "@/src/components/deletion-impact/deletion-impact";
import { DeletionImpactView } from "@/src/components/deletion-impact/deletion-impact-view";
import { useTranslations } from "@/src/providers/i18n";
import { getTourEventDeletionImpactApi } from "@repo/actions/unirefund/CRMService/actions";
import {
  deleteTourEventByTourEventIdApi,
  deleteTourEventForceApi,
} from "@repo/actions/unirefund/CRMService/delete-actions";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import { Checkbox } from "@repo/ayasofyazilim-ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ayasofyazilim-ui/components/dialog";
import { Label } from "@repo/ayasofyazilim-ui/components/label";
import { handleDeleteResponse } from "@repo/utils/api";
import { useApplicationConfiguration } from "@repo/utils/app-config";
import { isActionGranted } from "@repo/utils/policies";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Step =
  | { kind: "confirm" }
  | { kind: "referenced"; message: string; impact: ImpactState };

export function DeleteTourEventDialog({
  eventId,
  returnTo,
}: {
  eventId: string;
  returnTo: string;
}) {
  const { t } = useTranslations();
  const router = useRouter();
  const { policies: grantedPolicies } = useApplicationConfiguration();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "confirm" });
  const [cascade, setCascade] = useState(false);
  const [isPending, startTransition] = useTransition();

  const canDelete = isActionGranted(
    ["CRMService.TourEvents", "CRMService.TourEvents.Delete"],
    grantedPolicies
  );
  const canViewImpact = isActionGranted(
    ["CRMService.TourEvents", "CRMService.TourEvents.ViewDeletionImpact"],
    grantedPolicies
  );
  const canForce = isActionGranted(
    ["CRMService.TourEvents", "CRMService.TourEvents.ForceDelete"],
    grantedPolicies
  );
  if (!canDelete) return null;

  function handleOpenChange(next: boolean) {
    if (isPending) return;
    setOpen(next);
    if (!next) {
      setStep({ kind: "confirm" });
      setCascade(false);
    }
  }

  function handleDelete() {
    startTransition(async () => {
      const response = await deleteTourEventByTourEventIdApi({
        tourEventId: eventId,
      });
      if (deleteRefusal(response) !== "still-referenced") {
        if (response.type === "success") setOpen(false);
        handleDeleteResponse(response, router, returnTo);
        return;
      }
      const message = response.message;
      if (!canViewImpact) {
        setStep({ kind: "referenced", message, impact: "hidden" });
        return;
      }
      setStep({ kind: "referenced", message, impact: "loading" });
      try {
        const impact = await getTourEventDeletionImpactApi(eventId);
        setStep({ kind: "referenced", message, impact: impact.data });
      } catch {
        setStep({ kind: "referenced", message, impact: "failed" });
      }
    });
  }

  function handleForce() {
    startTransition(async () => {
      const response = await deleteTourEventForceApi({
        tourEventId: eventId,
        cascade,
      });
      if (response.type === "success") {
        setOpen(false);
        handleDeleteResponse(response, router, returnTo);
        return;
      }
      setStep((current) =>
        current.kind === "referenced"
          ? { ...current, message: response.message }
          : current
      );
    });
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger asChild>
        <Button
          className="ml-auto"
          data-testid="delete-tour-event-button"
          size="sm"
          variant="outline"
        >
          <Trash2 className="mr-2 size-4" />
          {t.CRMService["CRM.TourEvent.delete"]}
        </Button>
      </DialogTrigger>
      <DialogContent>
        {step.kind === "confirm" ? (
          <>
            <DialogHeader>
              <DialogTitle>{t.CRMService["CRM.TourEvent.delete"]}</DialogTitle>
              <DialogDescription>
                {t.CRMService["CRM.TourEvent.delete.confirm"]}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                disabled={isPending}
                onClick={() => handleOpenChange(false)}
                variant="outline"
              >
                {t.Default.Cancel}
              </Button>
              <Button
                data-testid="confirm-delete-tour-event"
                disabled={isPending}
                onClick={handleDelete}
                variant="destructive"
              >
                {t.Default.Delete}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {t.CRMService["CRM.TourEvent.delete.referenced"]}
              </DialogTitle>
              <DialogDescription>{step.message}</DialogDescription>
            </DialogHeader>
            <DeletionImpactView state={step.impact} />
            {canForce ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={cascade}
                    disabled={isPending}
                    id="tour-event-cascade"
                    onCheckedChange={(checked) => setCascade(checked === true)}
                  />
                  <Label htmlFor="tour-event-cascade">
                    {t.CRMService["CRM.TourEvent.delete.cascade"]}
                  </Label>
                </div>
                {cascade ? (
                  <p className="text-xs text-muted-foreground">
                    {t.CRMService["CRM.TourEvent.delete.cascade.note"]}
                  </p>
                ) : null}
              </div>
            ) : null}
            <DialogFooter>
              <Button
                disabled={isPending}
                onClick={() => handleOpenChange(false)}
                variant="outline"
              >
                {t.Default.Cancel}
              </Button>
              {canForce ? (
                <Button
                  data-testid="force-delete-tour-event"
                  disabled={isPending}
                  onClick={handleForce}
                  variant="destructive"
                >
                  {t.CRMService["CRM.TourEvent.delete.force"]}
                </Button>
              ) : null}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

All hooks are called before the `if (!canDelete) return null;` line, so the hook order stays stable.

- [ ] **Step 4: Mount it in both menus**

In `operations/events/[eventId]/_components/menu.tsx`:
1. Add the import:
   ```ts
   import { DeleteTourEventDialog } from "@/src/components/tour-events/delete-tour-event-dialog";
   ```
2. Inside the root `<div className="flex items-center …">`, after `</Tabs>`, add:
   ```tsx
   <DeleteTourEventDialog eventId={eventId} returnTo={eventsPath} />
   ```
3. Change the `<Tabs … className="w-full">` className to `"w-auto"`, so the button can sit at the right through its `ml-auto`.

In `parties/tour-guides/[partyId]/events/[eventId]/_components/menu.tsx`, make the same three edits. There, `eventsPath` is already `/${lang}/parties/tour-guides/${partyId}/events`, which is the return path Review Focus 5 requires.

- [ ] **Step 5: Type-check and lint**

```bash
cd /c/unirefund/web-app-wt-sdk
pnpm --filter web type-check
cd apps/web && npx eslint src/components/tour-events "src/app/[lang]/(main)/(unirefund)/operations/events" "src/app/[lang]/(main)/(unirefund)/parties/tour-guides/[partyId]/events" ../../packages/actions/unirefund/CRMService/actions.ts ../../packages/actions/unirefund/CRMService/delete-actions.ts
```

Expected: exit 0, and no new lint errors.

- [ ] **Step 6: Manual checks, run in Task 9**

1. A plain delete of a throwaway event with no travellers leads to the list.
2. An event with a traveller added produces the "still in use" state with the impact list. **Delete anyway** then removes it.
3. Repeat case 2 from the tour-guide copy. It must return to the tour guide's events list (Review Focus 5).
4. Block `…/deletion-impact` in the browser devtools (Network → block request URL) and repeat case 2. The dialog must show the backend message, the "could not be listed" line and **Delete anyway** (Review Focus 2).

- [ ] **Step 7: Commit**

```bash
git add -- packages/actions/unirefund/CRMService/actions.ts \
  packages/actions/unirefund/CRMService/delete-actions.ts \
  apps/web/src/components/tour-events/delete-tour-event-dialog.tsx \
  "apps/web/src/app/[lang]/(main)/(unirefund)/operations/events/[eventId]/_components/menu.tsx" \
  "apps/web/src/app/[lang]/(main)/(unirefund)/parties/tour-guides/[partyId]/events/[eventId]/_components/menu.tsx" \
  apps/web/src/language-data/unirefund/CRMService/resources/en.json \
  apps/web/src/language-data/unirefund/CRMService/resources/tr.json
git commit -m "feat(events): delete a tour event, showing what still uses it and offering a force delete"
```

---

### Task 4: Explain a refused VAT rate delete

**Files:**
- Modify: `packages/actions/unirefund/SettingService/actions.ts`
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/settings/product/vats/[vatId]/_components/form.tsx`
- Modify: `apps/web/src/language-data/unirefund/SettingService/resources/en.json`, `.../tr.json`

**Interfaces:**
- Consumes (from Task 2): `deleteRefusal`, `type ImpactState`, `DeletionImpactView`.
- Produces: `getVatDeletionImpactApi(id: string, session?: Session | null)` (throws on error).

- [ ] **Step 1: Add the action**

At the end of `packages/actions/unirefund/SettingService/actions.ts`:

```ts
export async function getVatDeletionImpactApi(
  id: string,
  session?: Session | null
) {
  try {
    const client = await getSettingServiceClient(session);
    const dataResponse =
      await client.vat.getApiSettingServiceVatByIdDeletionImpact({ id });
    return structuredSuccessResponse(dataResponse);
  } catch (error) {
    throw structuredError(error);
  }
}
```

- [ ] **Step 2: Add the string**

In `apps/web/src/language-data/unirefund/SettingService/resources/en.json`, add after `"Vat.Delete"`:

```json
  "Vat.Delete.Refused": "Why this VAT rate can't be deleted",
```

In `tr.json`, at the same spot:

```json
  "Vat.Delete.Refused": "Bu KDV oranı neden silinemiyor",
```

- [ ] **Step 3: Open the refusal dialog from the VAT form**

In `settings/product/vats/[vatId]/_components/form.tsx`:

1. Add imports:
   ```ts
   import { deleteRefusal, type ImpactState } from "@/src/components/deletion-impact/deletion-impact";
   import { DeletionImpactView } from "@/src/components/deletion-impact/deletion-impact-view";
   import { getVatDeletionImpactApi } from "@repo/actions/unirefund/SettingService/actions";
   import {
     Dialog,
     DialogContent,
     DialogDescription,
     DialogHeader,
     DialogTitle,
   } from "@repo/ayasofyazilim-ui/components/dialog";
   ```
   Also change the `react` import to `import { useState, useTransition } from "react";`.
2. After `hasEditGrant`, add:
   ```ts
   const canViewImpact = isActionGranted(
     ["SettingService.Vats", "SettingService.Vats.ViewDeletionImpact"],
     grantedPolicies
   );
   const [refusal, setRefusal] = useState<{
     message: string;
     impact: ImpactState;
   } | null>(null);
   ```
3. Replace the `onConfirm` body with:
   ```ts
   onConfirm: () => {
     startTransition(async () => {
       const res = await deleteVatByIdApi(response.id || "");
       if (res.type === "success" || !deleteRefusal(res) || !canViewImpact) {
         handleDeleteResponse(res, router, "../vats");
         return;
       }
       setRefusal({ message: res.message, impact: "loading" });
       try {
         const impact = await getVatDeletionImpactApi(response.id || "");
         setRefusal({ message: res.message, impact: impact.data });
       } catch {
         setRefusal({ message: res.message, impact: "failed" });
       }
     });
   },
   ```
4. Directly before the closing `</SchemaForm>`, after `</ActionList>`, add:
   ```tsx
   <Dialog
     onOpenChange={(next) => {
       if (!next) setRefusal(null);
     }}
     open={refusal !== null}
   >
     <DialogContent>
       <DialogHeader>
         <DialogTitle>{languageData["Vat.Delete.Refused"]}</DialogTitle>
         <DialogDescription>{refusal?.message}</DialogDescription>
       </DialogHeader>
       {refusal ? <DeletionImpactView state={refusal.impact} /> : null}
     </DialogContent>
   </Dialog>
   ```

A caller without `ViewDeletionImpact`, and any other kind of error, still gets today's toast.

- [ ] **Step 4: Type-check and lint**

```bash
cd /c/unirefund/web-app-wt-sdk
pnpm --filter web type-check
cd apps/web && npx eslint "src/app/[lang]/(main)/(unirefund)/settings/product/vats" ../../packages/actions/unirefund/SettingService/actions.ts
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add -- packages/actions/unirefund/SettingService/actions.ts \
  "apps/web/src/app/[lang]/(main)/(unirefund)/settings/product/vats/[vatId]/_components/form.tsx" \
  apps/web/src/language-data/unirefund/SettingService/resources/en.json \
  apps/web/src/language-data/unirefund/SettingService/resources/tr.json
git commit -m "feat(vats): explain why a VAT rate cannot be deleted"
```

---

### Task 5: Didit account actions, helpers and strings

**Files:**
- Modify: `packages/actions/unirefund/KYCService/actions.ts`
- Modify: `packages/actions/unirefund/KYCService/post-actions.ts`
- Create: `packages/actions/unirefund/KYCService/put-actions.ts`
- Create: `packages/actions/unirefund/KYCService/delete-actions.ts`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/settings/didit-accounts/_components/didit-account.ts`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/settings/didit-accounts/_components/didit-account.test.ts`
- Create: `apps/web/src/language-data/unirefund/KYCService/resources/en.json`, `.../tr.json`

**Interfaces:**
- Produces:
  - Actions:
    - `getDiditCredentialsApi(data: GetApiKycServiceDiditCredentialsData, session?)`
    - `getDiditCredentialByIdApi(id: string, session?)`
    - `postDiditCredentialApi(data: PostApiKycServiceDiditCredentialsData)`
    - `postDiditCredentialReinstateApi(id: string)`
    - `putDiditCredentialApi(data: PutApiKycServiceDiditCredentialsByIdData)`
    - `deleteDiditCredentialApi(id: string)`
  - Health:
    - `type DiditHealth = { kind: "ok" } | { kind: "creditExhausted"; at: string | null } | { kind: "credentialRejected"; at: string | null }`
    - `diditHealth(dto): DiditHealth`
  - Form and query helpers:
    - `toUpdateForm(dto: DiditCredentialDto): UpdateDiditCredentialDto`
    - `toOptionalBoolean(value: string | undefined): boolean | undefined`
- The KYC client property is `diditCredential`, as in `KYCServiceClient.ts`.

- [ ] **Step 1: Write the failing test**

`.../settings/didit-accounts/_components/didit-account.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { UniRefund_KYCService_DiditCredentials_DiditCredentialDto } from "@repo/saas/KYCService";
import { diditHealth, toOptionalBoolean, toUpdateForm } from "./didit-account";

describe("diditHealth", () => {
  it("is ok when neither flag is set", () => {
    assert.deepEqual(diditHealth({}), { kind: "ok" });
  });

  it("reports an account out of credit", () => {
    assert.deepEqual(
      diditHealth({ isCreditExhausted: true, creditExhaustedAt: "2026-10-01T08:00:00Z" }),
      { kind: "creditExhausted", at: "2026-10-01T08:00:00Z" }
    );
  });

  it("puts a rejected key ahead of exhausted credit, since a top-up will not fix it", () => {
    assert.deepEqual(
      diditHealth({
        isCreditExhausted: true,
        creditExhaustedAt: "2026-10-01T08:00:00Z",
        isCredentialRejected: true,
        credentialRejectedAt: "2026-10-02T09:00:00Z",
      }),
      { kind: "credentialRejected", at: "2026-10-02T09:00:00Z" }
    );
  });
});

describe("toUpdateForm", () => {
  const dto: UniRefund_KYCService_DiditCredentials_DiditCredentialDto = {
    id: "1",
    name: "Default",
    apiKeyMasked: "****abcd",
    createSessionUrl: "https://a",
    sessionDecisionUrlTemplate: "https://b/{id}",
    idVerificationUrl: "https://c",
    workflowIdLow: null,
    priority: 2,
    isActive: true,
  };

  it("never carries an API key the user did not type", () => {
    assert.equal("apiKey" in toUpdateForm(dto), false);
  });

  it("copies the editable fields and defaults the missing ones", () => {
    assert.deepEqual(toUpdateForm(dto), {
      name: "Default",
      createSessionUrl: "https://a",
      sessionDecisionUrlTemplate: "https://b/{id}",
      idVerificationUrl: "https://c",
      workflowIdLow: null,
      workflowIdMedium: null,
      workflowIdHigh: null,
      priority: 2,
      isActive: true,
    });
  });
});

describe("toOptionalBoolean", () => {
  it("reads the URL's string booleans and ignores anything else", () => {
    assert.equal(toOptionalBoolean("true"), true);
    assert.equal(toOptionalBoolean("false"), false);
    assert.equal(toOptionalBoolean(undefined), undefined);
    assert.equal(toOptionalBoolean(""), undefined);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/web && node --import tsx --test "src/app/[[]lang]/(main)/(unirefund)/settings/didit-accounts/_components/didit-account.test.ts"`
Expected: FAIL, because `./didit-account` cannot be resolved.

- [ ] **Step 3: Implement the helpers**

`.../settings/didit-accounts/_components/didit-account.ts`:

```ts
import type {
  UniRefund_KYCService_DiditCredentials_DiditCredentialDto as DiditCredentialDto,
  UniRefund_KYCService_DiditCredentials_UpdateDiditCredentialDto as UpdateDiditCredentialDto,
} from "@repo/saas/KYCService";

export type DiditHealth =
  | { kind: "ok" }
  | { kind: "creditExhausted"; at: string | null }
  | { kind: "credentialRejected"; at: string | null };

export function diditHealth(dto: {
  isCreditExhausted?: boolean;
  creditExhaustedAt?: string | null;
  isCredentialRejected?: boolean;
  credentialRejectedAt?: string | null;
}): DiditHealth {
  if (dto.isCredentialRejected)
    return { kind: "credentialRejected", at: dto.credentialRejectedAt ?? null };
  if (dto.isCreditExhausted)
    return { kind: "creditExhausted", at: dto.creditExhaustedAt ?? null };
  return { kind: "ok" };
}

// The key is write-only: leaving it out keeps the stored one.
export function toUpdateForm(
  dto: DiditCredentialDto
): UpdateDiditCredentialDto {
  return {
    name: dto.name ?? "",
    createSessionUrl: dto.createSessionUrl ?? "",
    sessionDecisionUrlTemplate: dto.sessionDecisionUrlTemplate ?? "",
    idVerificationUrl: dto.idVerificationUrl ?? "",
    workflowIdLow: dto.workflowIdLow ?? null,
    workflowIdMedium: dto.workflowIdMedium ?? null,
    workflowIdHigh: dto.workflowIdHigh ?? null,
    priority: dto.priority ?? 0,
    isActive: dto.isActive ?? false,
  };
}

export function toOptionalBoolean(
  value: string | undefined
): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run the Step 2 command again. Expected: `# pass 6`, `# fail 0`.

- [ ] **Step 5: Add the actions**

`packages/actions/unirefund/KYCService/actions.ts`:

1. Add this import below the existing ones:
   ```ts
   import type { GetApiKycServiceDiditCredentialsData } from "@repo/saas/KYCService";
   ```
2. Append:

```ts
export async function getDiditCredentialsApi(
  data: GetApiKycServiceDiditCredentialsData,
  session?: Session | null
) {
  try {
    const client = await getKYCServiceClient(session);
    const dataResponse =
      await client.diditCredential.getApiKycServiceDiditCredentials(data);
    return structuredSuccessResponse(dataResponse);
  } catch (error) {
    throw structuredError(error);
  }
}

export async function getDiditCredentialByIdApi(
  id: string,
  session?: Session | null
) {
  try {
    const client = await getKYCServiceClient(session);
    const dataResponse =
      await client.diditCredential.getApiKycServiceDiditCredentialsById({ id });
    return structuredSuccessResponse(dataResponse);
  } catch (error) {
    throw structuredError(error);
  }
}
```

`packages/actions/unirefund/KYCService/post-actions.ts`:

1. Extend the SDK import:
   ```ts
   import {
     PostApiKycServiceDiditCredentialsData,
     PostApiKycServiceIdVerificationsVerifyByPhotoData,
   } from "@repo/saas/KYCService";
   ```
2. Append:

```ts
export async function postDiditCredentialApi(
  data: PostApiKycServiceDiditCredentialsData,
  session?: Session | null
) {
  try {
    const client = await getKYCServiceClient(session);
    const response =
      await client.diditCredential.postApiKycServiceDiditCredentials(data);
    return structuredResponse(response);
  } catch (error) {
    return structuredError(error);
  }
}

export async function postDiditCredentialReinstateApi(
  id: string,
  session?: Session | null
) {
  try {
    const client = await getKYCServiceClient(session);
    const response =
      await client.diditCredential.postApiKycServiceDiditCredentialsByIdReinstate(
        { id }
      );
    return structuredResponse(response);
  } catch (error) {
    return structuredError(error);
  }
}
```

Create `packages/actions/unirefund/KYCService/put-actions.ts`:

```ts
"use server";
import type { PutApiKycServiceDiditCredentialsByIdData } from "@repo/saas/KYCService";
import { structuredError, structuredResponse } from "@repo/utils/api";
import type { Session } from "next-auth";
import { getKYCServiceClient } from "../lib";

export async function putDiditCredentialApi(
  data: PutApiKycServiceDiditCredentialsByIdData,
  session?: Session | null
) {
  try {
    const client = await getKYCServiceClient(session);
    const response =
      await client.diditCredential.putApiKycServiceDiditCredentialsById(data);
    return structuredResponse(response);
  } catch (error) {
    return structuredError(error);
  }
}
```

Create `packages/actions/unirefund/KYCService/delete-actions.ts`:

```ts
"use server";
import { structuredError, structuredResponse } from "@repo/utils/api";
import type { Session } from "next-auth";
import { getKYCServiceClient } from "../lib";

export async function deleteDiditCredentialApi(
  id: string,
  session?: Session | null
) {
  try {
    const client = await getKYCServiceClient(session);
    const response =
      await client.diditCredential.deleteApiKycServiceDiditCredentialsById({
        id,
      });
    return structuredResponse(response);
  } catch (error) {
    return structuredError(error);
  }
}
```

- [ ] **Step 6: Add the KYCService strings**

`init` merges every folder under `src/language-data/unirefund/*/resources/` into `t.<Folder>`, so these two files are all the registration needed.

Create `apps/web/src/language-data/unirefund/KYCService/resources/en.json`:

```json
{
  "DiditAccounts.New": "New Didit account",
  "DiditAccounts.Shared": "Shared",
  "DiditAccounts.Tenant": "Tenant",
  "DiditAccounts.Health": "Health",
  "DiditAccounts.Health.ok": "OK",
  "DiditAccounts.Health.creditExhausted": "Out of credit since {0}",
  "DiditAccounts.Health.credentialRejected": "Key rejected since {0}",
  "DiditAccounts.Filter.isActive": "Active",
  "DiditAccounts.Filter.isShared": "Scope",
  "DiditAccounts.Filter.isShared.true": "Shared only",
  "DiditAccounts.Filter.isShared.false": "Dedicated only",
  "DiditAccounts.ApiKey.Keep": "Leave blank to keep the current key ({0})",
  "DiditAccounts.Reinstate": "Reinstate",
  "DiditAccounts.Reinstate.Description": "Put this account back into selection after it was topped up or its key was fixed.",
  "DiditAccounts.Delete.Title": "Delete this Didit account?",
  "DiditAccounts.Delete.Description": "It leaves the pool. Sessions it already created stay readable.",
  "Form.DiditAccount.tenantId": "Tenant (empty for shared)",
  "Form.DiditAccount.name": "Name",
  "Form.DiditAccount.apiKey": "API key",
  "Form.DiditAccount.createSessionUrl": "Create session URL",
  "Form.DiditAccount.sessionDecisionUrlTemplate": "Session decision URL template",
  "Form.DiditAccount.idVerificationUrl": "ID verification URL",
  "Form.DiditAccount.workflowIdLow": "Workflow ID (low)",
  "Form.DiditAccount.workflowIdMedium": "Workflow ID (medium)",
  "Form.DiditAccount.workflowIdHigh": "Workflow ID (high)",
  "Form.DiditAccount.priority": "Priority (lower is tried first)",
  "Form.DiditAccount.isActive": "Active"
}
```

Create `tr.json`:

```json
{
  "DiditAccounts.New": "Yeni Didit hesabı",
  "DiditAccounts.Shared": "Paylaşılan",
  "DiditAccounts.Tenant": "Kiracı",
  "DiditAccounts.Health": "Durum",
  "DiditAccounts.Health.ok": "Sorunsuz",
  "DiditAccounts.Health.creditExhausted": "{0} tarihinden beri kredisi bitti",
  "DiditAccounts.Health.credentialRejected": "{0} tarihinden beri anahtar reddediliyor",
  "DiditAccounts.Filter.isActive": "Etkin",
  "DiditAccounts.Filter.isShared": "Kapsam",
  "DiditAccounts.Filter.isShared.true": "Yalnızca paylaşılan",
  "DiditAccounts.Filter.isShared.false": "Yalnızca kiracıya özel",
  "DiditAccounts.ApiKey.Keep": "Mevcut anahtarı ({0}) korumak için boş bırakın",
  "DiditAccounts.Reinstate": "Yeniden etkinleştir",
  "DiditAccounts.Reinstate.Description": "Kredisi yüklendikten veya anahtarı düzeltildikten sonra bu hesabı yeniden seçime alın.",
  "DiditAccounts.Delete.Title": "Bu Didit hesabı silinsin mi?",
  "DiditAccounts.Delete.Description": "Hesap havuzdan çıkar. Oluşturduğu oturumlar okunabilir kalır.",
  "Form.DiditAccount.tenantId": "Kiracı (paylaşılan için boş)",
  "Form.DiditAccount.name": "Ad",
  "Form.DiditAccount.apiKey": "API anahtarı",
  "Form.DiditAccount.createSessionUrl": "Oturum oluşturma URL'si",
  "Form.DiditAccount.sessionDecisionUrlTemplate": "Oturum kararı URL şablonu",
  "Form.DiditAccount.idVerificationUrl": "Kimlik doğrulama URL'si",
  "Form.DiditAccount.workflowIdLow": "İş akışı kimliği (düşük)",
  "Form.DiditAccount.workflowIdMedium": "İş akışı kimliği (orta)",
  "Form.DiditAccount.workflowIdHigh": "İş akışı kimliği (yüksek)",
  "Form.DiditAccount.priority": "Öncelik (düşük olan önce denenir)",
  "Form.DiditAccount.isActive": "Etkin"
}
```

Then run `pnpm --filter web run init` and `pnpm --filter web type-check`. Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add -- packages/actions/unirefund/KYCService/actions.ts \
  packages/actions/unirefund/KYCService/post-actions.ts \
  packages/actions/unirefund/KYCService/put-actions.ts \
  packages/actions/unirefund/KYCService/delete-actions.ts \
  "apps/web/src/app/[lang]/(main)/(unirefund)/settings/didit-accounts/_components/didit-account.ts" \
  "apps/web/src/app/[lang]/(main)/(unirefund)/settings/didit-accounts/_components/didit-account.test.ts" \
  apps/web/src/language-data/unirefund/KYCService/resources/en.json \
  apps/web/src/language-data/unirefund/KYCService/resources/tr.json
git commit -m "feat(kyc): actions and helpers for Didit account administration"
```

---

### Task 6: Didit accounts list and menu entry

**Files:**
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/settings/didit-accounts/page.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/settings/didit-accounts/loading.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/settings/didit-accounts/_components/table.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/settings/didit-accounts/_components/health-badge.tsx`
- Modify: `apps/web/src/components/sidebar-layout/data.ts`
- Modify: `apps/web/src/language-data/core/AbpUiNavigation/resources/en.json`, `.../tr.json`

**Interfaces:**
- Consumes (from Task 5): `getDiditCredentialsApi`, `diditHealth`, `toOptionalBoolean`.
- Produces: `<HealthBadge dto lang />`, which Task 8 reuses.

- [ ] **Step 1: Add the menu labels and the menu item**

In `apps/web/src/language-data/core/AbpUiNavigation/resources/en.json`, add after `"Tenant"`:

```json
  "DiditAccounts": "Didit accounts",
  "DiditAccounts.New": "New Didit account",
```

In `tr.json`, at the same spot:

```json
  "DiditAccounts": "Didit hesapları",
  "DiditAccounts.New": "Yeni Didit hesabı",
```

In `apps/web/src/components/sidebar-layout/data.ts`, insert directly after the `key: "settings/tenant"` item's closing `},`:

```ts
      {
        key: "settings/didit-accounts",
        displayName: "DiditAccounts",
        href: "settings/didit-accounts",
        icon: "Fingerprint",
        hostOnly: true,
        policies: [
          "KYCService.DiditCredentials",
          "KYCService.DiditCredentials.ViewList",
        ],
        actions: [
          {
            key: "settings/didit-accounts/new",
            displayName: "DiditAccounts.New",
            description: "DiditAccounts.New",
            href: "settings/didit-accounts/new",
            icon: "DiamondPlus",
            hostOnly: true,
            policies: [
              "KYCService.DiditCredentials",
              "KYCService.DiditCredentials.Create",
            ],
          },
        ],
      },
```

- [ ] **Step 2: Health badge**

`.../settings/didit-accounts/_components/health-badge.tsx`:

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { Badge } from "@repo/ayasofyazilim-ui/components/badge";
import { diditHealth } from "./didit-account";

export function HealthBadge({
  dto,
  lang,
}: {
  dto: Parameters<typeof diditHealth>[0];
  lang: string;
}) {
  const { t } = useTranslations();
  const health = diditHealth(dto);
  if (health.kind === "ok")
    return <Badge variant="success">{t.KYCService["DiditAccounts.Health.ok"]}</Badge>;
  const since = health.at
    ? new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" }).format(new Date(health.at))
    : "";
  const label = t.KYCService[`DiditAccounts.Health.${health.kind}`].replace("{0}", since);
  return (
    <Badge variant={health.kind === "credentialRejected" ? "destructive" : "warning"}>
      {label}
    </Badge>
  );
}
```

- [ ] **Step 3: Table**

`.../settings/didit-accounts/_components/table.tsx`:

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { createServerFilters } from "@/src/utils/server-filters";
import {
  MasterDataGrid,
  RowLink,
} from "@repo/ayasofyazilim-ui/custom/master-data-grid";
import {
  $UniRefund_KYCService_DiditCredentials_DiditCredentialListDto,
  type PagedResultDto_DiditCredentialListDto,
} from "@repo/saas/KYCService";
import {
  useApplicationConfiguration,
  useLocalization,
} from "@repo/utils/app-config";
import { isActionGranted } from "@repo/utils/policies";
import { LucidePlusCircle } from "lucide-react";
import { useParams } from "next/navigation";
import { HealthBadge } from "./health-badge";

export default function DiditAccountsTable({
  response,
  tenants,
}: {
  response: PagedResultDto_DiditCredentialListDto;
  tenants: { id: string; name: string }[];
}) {
  const { t } = useTranslations();
  const { lang } = useParams<{ lang: string }>();
  const localization = useLocalization();
  const { policies: grantedPolicies } = useApplicationConfiguration();
  const canView = isActionGranted(
    ["KYCService.DiditCredentials", "KYCService.DiditCredentials.View"],
    grantedPolicies
  );
  const f = createServerFilters(t.Default);
  return (
    <MasterDataGrid
      data={response.items || []}
      config={{
        localization,
        schema: $UniRefund_KYCService_DiditCredentials_DiditCredentialListDto,
        schemaColumns: {
          mode: "include",
          columns: ["name", "tenantName", "priority", "isActive", "isCreditExhausted"],
        },
        rowCount: response.totalCount,
        t: {
          ...t.Default,
          "column.name": t.KYCService["Form.DiditAccount.name"],
          "column.tenantName": t.KYCService["DiditAccounts.Tenant"],
          "column.priority": t.KYCService["Form.DiditAccount.priority"],
          "column.isActive": t.KYCService["Form.DiditAccount.isActive"],
          "column.isCreditExhausted": t.KYCService["DiditAccounts.Health"],
        },
        customRenderers: {
          name: ({ row }) =>
            canView ? (
              <RowLink href={`didit-accounts/${row.original.id}`} label={row.original.name ?? ""} />
            ) : (
              row.original.name
            ),
          tenantName: ({ row }) =>
            row.original.tenantName ?? t.KYCService["DiditAccounts.Shared"],
          isCreditExhausted: ({ row }) => <HealthBadge dto={row.original} lang={lang} />,
        },
        serverFilters: [
          f.string("filter", t.Default.Search),
          f.boolean("isActive", t.KYCService["DiditAccounts.Filter.isActive"]),
          f.boolean("isShared", t.KYCService["DiditAccounts.Filter.isShared"], {
            options: [
              { label: t.KYCService["DiditAccounts.Filter.isShared.true"], value: true },
              { label: t.KYCService["DiditAccounts.Filter.isShared.false"], value: false },
            ],
          }),
          ...(tenants.length > 0
            ? [
                f.select(
                  "tenantId",
                  t.KYCService["DiditAccounts.Tenant"],
                  tenants.map((tenant) => ({ label: tenant.name, value: tenant.id }))
                ),
              ]
            : []),
        ],
        tableActions: [
          {
            id: "create-new-didit-account",
            label: t.KYCService["DiditAccounts.New"],
            icon: LucidePlusCircle,
            type: "link",
            href: "didit-accounts/new",
            hidden: !isActionGranted(
              ["KYCService.DiditCredentials", "KYCService.DiditCredentials.Create"],
              grantedPolicies
            ),
          },
        ],
      }}
    />
  );
}
```

If `type-check` reports that `f.boolean` has a different `options` shape, read `createServerFilters` in `apps/web/src/utils/server-filters.ts` (the `boolean` member) and match it. Do not cast.

- [ ] **Step 4: Page and loading state**

`.../settings/didit-accounts/page.tsx`:

```tsx
"use server";

import { guardPage } from "@/src/components/permission-guard/guard";
import { getTranslations } from "@/src/language-data/get-translations";
import { getTenantsApi } from "@repo/actions/core/SaasService/actions";
import { getDiditCredentialsApi } from "@repo/actions/unirefund/KYCService/actions";
import type { GetApiKycServiceDiditCredentialsData } from "@repo/saas/KYCService";
import ErrorComponent from "@repo/ui/components/error-component";
import { structuredError } from "@repo/utils/api";
import { auth } from "@repo/utils/auth/next-auth";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { toOptionalBoolean } from "./_components/didit-account";
import DiditAccountsTable from "./_components/table";

type SearchParams = Omit<
  GetApiKycServiceDiditCredentialsData,
  "isActive" | "isShared"
> & { isActive?: string; isShared?: string };

async function getApiRequests(searchParams: SearchParams) {
  try {
    const session = await auth();
    const requiredRequests = await Promise.all([
      getDiditCredentialsApi(
        {
          ...searchParams,
          isActive: toOptionalBoolean(searchParams.isActive),
          isShared: toOptionalBoolean(searchParams.isShared),
        },
        session
      ),
    ]);
    const optionalRequests = await Promise.allSettled([
      getTenantsApi({ maxResultCount: 1000 }),
    ]);
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
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { lang } = await params;
  const denied = await guardPage({
    requires: ["KYCService.DiditCredentials", "KYCService.DiditCredentials.ViewList"],
    lang,
  });
  if (denied) return denied;
  const t = await getTranslations(lang);
  const apiRequests = await getApiRequests(await searchParams);
  if ("message" in apiRequests) {
    return <ErrorComponent languageData={t.Default} message={apiRequests.message} />;
  }
  const [listResponse] = apiRequests.requiredRequests;
  const [tenantsResult] = apiRequests.optionalRequests;
  const tenants =
    tenantsResult.status === "fulfilled" && tenantsResult.value.type === "success"
      ? (tenantsResult.value.data.items ?? []).map((tenant) => ({
          id: tenant.id ?? "",
          name: tenant.name ?? "",
        }))
      : [];
  return <DiditAccountsTable response={listResponse.data} tenants={tenants} />;
}
```

`.../settings/didit-accounts/loading.tsx`: copy `settings/product/vats/loading.tsx` byte for byte.

- [ ] **Step 5: Init, type-check, lint, unit tests**

```bash
cd /c/unirefund/web-app-wt-sdk
pnpm --filter web run init
pnpm --filter web type-check
pnpm --filter web test:unit
cd apps/web && npx eslint "src/app/[lang]/(main)/(unirefund)/settings/didit-accounts" src/components/sidebar-layout/data.ts
```

Expected: `type-check` exits 0, `test:unit` shows 0 fail, and lint reports no errors.

- [ ] **Step 6: Commit**

```bash
git add -- "apps/web/src/app/[lang]/(main)/(unirefund)/settings/didit-accounts/page.tsx" \
  "apps/web/src/app/[lang]/(main)/(unirefund)/settings/didit-accounts/loading.tsx" \
  "apps/web/src/app/[lang]/(main)/(unirefund)/settings/didit-accounts/_components/table.tsx" \
  "apps/web/src/app/[lang]/(main)/(unirefund)/settings/didit-accounts/_components/health-badge.tsx" \
  apps/web/src/components/sidebar-layout/data.ts \
  apps/web/src/language-data/core/AbpUiNavigation/resources/en.json \
  apps/web/src/language-data/core/AbpUiNavigation/resources/tr.json
git commit -m "feat(kyc): list Didit accounts with their health, for host admins"
```

---

### Task 7: Create a Didit account

**Files:**
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/settings/didit-accounts/new/page.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/settings/didit-accounts/new/loading.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/settings/didit-accounts/new/_components/form.tsx`

**Interfaces:**
- Consumes (from Task 5): `postDiditCredentialApi`.

- [ ] **Step 1: Form**

`.../didit-accounts/new/_components/form.tsx`:

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { postDiditCredentialApi } from "@repo/actions/unirefund/KYCService/post-actions";
import {
  CustomComboboxWidget,
  SchemaForm,
} from "@repo/ayasofyazilim-ui/custom/schema-form";
import { createUiSchemaWithResource } from "@repo/ayasofyazilim-ui/custom/schema-form/utils";
import {
  $UniRefund_KYCService_DiditCredentials_CreateDiditCredentialDto,
  type UniRefund_KYCService_DiditCredentials_CreateDiditCredentialDto,
} from "@repo/saas/KYCService";
import { handlePostResponse } from "@repo/utils/api";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

type Tenant = { id: string; name: string };

export default function NewDiditAccountForm({ tenants }: { tenants: Tenant[] }) {
  const { t } = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <SchemaForm<UniRefund_KYCService_DiditCredentials_CreateDiditCredentialDto>
      className="w-full max-w-lg"
      disabled={isPending}
      formData={{ isActive: true, priority: 0 } as UniRefund_KYCService_DiditCredentials_CreateDiditCredentialDto}
      id="new-didit-account-form"
      onSubmit={({ formData }) => {
        if (!formData) return;
        startTransition(() => {
          void postDiditCredentialApi({ requestBody: formData }).then((res) => {
            handlePostResponse(res, router, {
              prefix: "../didit-accounts",
              identifier: "id",
            });
          });
        });
      }}
      schema={$UniRefund_KYCService_DiditCredentials_CreateDiditCredentialDto}
      uiSchema={createUiSchemaWithResource({
        schema: $UniRefund_KYCService_DiditCredentials_CreateDiditCredentialDto,
        resources: t.KYCService,
        name: "Form.DiditAccount",
        extend: {
          tenantId: { "ui:widget": "TenantWidget" },
          apiKey: { "ui:widget": "password" },
          isActive: { "ui:widget": "switch" },
          "ui:submitButtonOptions": { submitText: t.Default.Save },
        },
      })}
      widgets={{
        TenantWidget: CustomComboboxWidget<Tenant>({
          languageData: t.Default,
          list: tenants,
          selectIdentifier: "id",
          selectLabel: "name",
        }),
      }}
    />
  );
}
```

Tenant is optional in the schema. Clicking the selected tenant again clears it (the widget's `allowEmpty` default), which leaves `tenantId` undefined, and undefined means Shared.

- [ ] **Step 2: Page and loading state**

`.../didit-accounts/new/page.tsx`:

```tsx
"use server";

import { guardPage } from "@/src/components/permission-guard/guard";
import { getTenantsApi } from "@repo/actions/core/SaasService/actions";
import NewDiditAccountForm from "./_components/form";

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const denied = await guardPage({
    requires: ["KYCService.DiditCredentials", "KYCService.DiditCredentials.Create"],
    lang,
  });
  if (denied) return denied;
  const tenantsResponse = await getTenantsApi({ maxResultCount: 1000 });
  const tenants =
    tenantsResponse.type === "success"
      ? (tenantsResponse.data.items ?? []).map((tenant) => ({
          id: tenant.id ?? "",
          name: tenant.name ?? "",
        }))
      : [];
  return <NewDiditAccountForm tenants={tenants} />;
}
```

`.../didit-accounts/new/loading.tsx`: copy `settings/product/vats/new/loading.tsx` byte for byte.

- [ ] **Step 3: Type-check and lint**

```bash
cd /c/unirefund/web-app-wt-sdk && pnpm --filter web type-check
cd apps/web && npx eslint "src/app/[lang]/(main)/(unirefund)/settings/didit-accounts/new"
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add -- "apps/web/src/app/[lang]/(main)/(unirefund)/settings/didit-accounts/new/page.tsx" \
  "apps/web/src/app/[lang]/(main)/(unirefund)/settings/didit-accounts/new/loading.tsx" \
  "apps/web/src/app/[lang]/(main)/(unirefund)/settings/didit-accounts/new/_components/form.tsx"
git commit -m "feat(kyc): add a shared or tenant-dedicated Didit account"
```

---

### Task 8: Edit, delete and reinstate a Didit account

**Files:**
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/settings/didit-accounts/[id]/page.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/settings/didit-accounts/[id]/loading.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/settings/didit-accounts/[id]/_components/form.tsx`

**Interfaces:**
- Consumes:
  - From Task 5: `getDiditCredentialByIdApi`, `putDiditCredentialApi`, `deleteDiditCredentialApi`, `postDiditCredentialReinstateApi`, `toUpdateForm`, `diditHealth`.
  - From Task 6: `HealthBadge`.

- [ ] **Step 1: Form**

`.../didit-accounts/[id]/_components/form.tsx`:

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { deleteDiditCredentialApi } from "@repo/actions/unirefund/KYCService/delete-actions";
import { postDiditCredentialReinstateApi } from "@repo/actions/unirefund/KYCService/post-actions";
import { putDiditCredentialApi } from "@repo/actions/unirefund/KYCService/put-actions";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import { ActionList } from "@repo/ayasofyazilim-ui/custom/action-button";
import ConfirmDialog from "@repo/ayasofyazilim-ui/custom/confirm-dialog";
import { SchemaForm } from "@repo/ayasofyazilim-ui/custom/schema-form";
import { createUiSchemaWithResource } from "@repo/ayasofyazilim-ui/custom/schema-form/utils";
import {
  $UniRefund_KYCService_DiditCredentials_UpdateDiditCredentialDto,
  type UniRefund_KYCService_DiditCredentials_DiditCredentialDto,
  type UniRefund_KYCService_DiditCredentials_UpdateDiditCredentialDto,
} from "@repo/saas/KYCService";
import { handleDeleteResponse, handlePutResponse } from "@repo/utils/api";
import { useApplicationConfiguration } from "@repo/utils/app-config";
import { isActionGranted } from "@repo/utils/policies";
import { RotateCcw, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useTransition } from "react";
import { diditHealth, toUpdateForm } from "../../_components/didit-account";
import { HealthBadge } from "../../_components/health-badge";

export default function DiditAccountForm({
  dto,
}: {
  dto: UniRefund_KYCService_DiditCredentials_DiditCredentialDto;
}) {
  const { t } = useTranslations();
  const router = useRouter();
  const { lang } = useParams<{ lang: string }>();
  const [isPending, startTransition] = useTransition();
  const { policies: grantedPolicies } = useApplicationConfiguration();
  const grant = (leaf: string) =>
    isActionGranted(
      ["KYCService.DiditCredentials", `KYCService.DiditCredentials.${leaf}`],
      grantedPolicies
    );
  const canEdit = grant("Edit");
  const canDelete = grant("Delete");
  const canReinstate = grant("Reinstate") && diditHealth(dto).kind !== "ok";
  const id = dto.id ?? "";

  return (
    <div className="w-full max-w-lg space-y-4">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span>
          {t.KYCService["DiditAccounts.Tenant"]}:{" "}
          <span className="font-medium">
            {dto.tenantName ?? t.KYCService["DiditAccounts.Shared"]}
          </span>
        </span>
        <HealthBadge dto={dto} lang={lang} />
      </div>
      <SchemaForm<UniRefund_KYCService_DiditCredentials_UpdateDiditCredentialDto>
        disabled={isPending || !canEdit}
        formData={toUpdateForm(dto)}
        id="edit-didit-account-form"
        onSubmit={({ formData }) => {
          if (!formData || !canEdit) return;
          startTransition(() => {
            void putDiditCredentialApi({ id, requestBody: formData }).then((res) => {
              handlePutResponse(res, router);
            });
          });
        }}
        readonly={!canEdit}
        schema={$UniRefund_KYCService_DiditCredentials_UpdateDiditCredentialDto}
        uiSchema={createUiSchemaWithResource({
          schema: $UniRefund_KYCService_DiditCredentials_UpdateDiditCredentialDto,
          resources: t.KYCService,
          name: "Form.DiditAccount",
          extend: {
            apiKey: {
              "ui:widget": "password",
              "ui:placeholder": t.KYCService["DiditAccounts.ApiKey.Keep"].replace(
                "{0}",
                dto.apiKeyMasked ?? ""
              ),
            },
            isActive: { "ui:widget": "switch" },
          },
        })}
      >
        <ActionList className="self-end border-none p-0 mt-4 gap-2 grid! grid-cols-3">
          {canReinstate ? (
            <ConfirmDialog
              closeProps={{ type: "button", children: t.Default.Cancel }}
              confirmProps={{
                type: "button",
                children: t.KYCService["DiditAccounts.Reinstate"],
                closeAfterConfirm: true,
                onConfirm: () => {
                  startTransition(() => {
                    void postDiditCredentialReinstateApi(id).then((res) => {
                      handlePutResponse(res, router);
                    });
                  });
                },
              }}
              description={t.KYCService["DiditAccounts.Reinstate.Description"]}
              title={t.KYCService["DiditAccounts.Reinstate"]}
              triggerProps={{
                type: "button",
                "data-testid": "reinstate-didit-account",
                children: (
                  <>
                    <RotateCcw className="mr-2 w-4" />
                    {t.KYCService["DiditAccounts.Reinstate"]}
                  </>
                ),
                variant: "outline",
              }}
              type="with-trigger"
            />
          ) : null}
          {canDelete ? (
            <ConfirmDialog
              closeProps={{ type: "button", children: t.Default.Cancel }}
              confirmProps={{
                type: "button",
                variant: "destructive",
                children: t.Default.Delete,
                closeAfterConfirm: true,
                onConfirm: () => {
                  startTransition(() => {
                    void deleteDiditCredentialApi(id).then((res) => {
                      handleDeleteResponse(res, router, "../didit-accounts");
                    });
                  });
                },
              }}
              description={t.KYCService["DiditAccounts.Delete.Description"]}
              title={t.KYCService["DiditAccounts.Delete.Title"]}
              triggerProps={{
                type: "button",
                "data-testid": "delete-didit-account",
                children: (
                  <>
                    <Trash2 className="mr-2 w-4" /> {t.Default.Delete}
                  </>
                ),
                variant: "outline",
              }}
              type="with-trigger"
            />
          ) : null}
          {canEdit ? (
            <Button data-testid="save-didit-account">{t.Default["Edit.Save"]}</Button>
          ) : null}
        </ActionList>
      </SchemaForm>
    </div>
  );
}
```

- [ ] **Step 2: Page and loading state**

`.../didit-accounts/[id]/page.tsx`:

```tsx
"use server";

import { guardPage } from "@/src/components/permission-guard/guard";
import { BreadcrumbTitle } from "@/src/components/sidebar-layout/breadcrumb/title";
import { getTranslations } from "@/src/language-data/get-translations";
import { getDiditCredentialByIdApi } from "@repo/actions/unirefund/KYCService/actions";
import ErrorComponent from "@repo/ui/components/error-component";
import { structuredError } from "@repo/utils/api";
import { auth } from "@repo/utils/auth/next-auth";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import DiditAccountForm from "./_components/form";

async function getApiRequests(id: string) {
  try {
    const session = await auth();
    const requiredRequests = await Promise.all([
      getDiditCredentialByIdApi(id, session),
    ]);
    return { requiredRequests };
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
  const denied = await guardPage({
    requires: ["KYCService.DiditCredentials", "KYCService.DiditCredentials.View"],
    lang,
  });
  if (denied) return denied;
  const t = await getTranslations(lang);
  const apiRequests = await getApiRequests(id);
  if ("message" in apiRequests) {
    return <ErrorComponent languageData={t.Default} message={apiRequests.message} />;
  }
  const [detailResponse] = apiRequests.requiredRequests;
  return (
    <>
      <BreadcrumbTitle
        replacements={{ find: id, title: detailResponse.data.name ?? "" }}
      />
      <DiditAccountForm dto={detailResponse.data} />
    </>
  );
}
```

`.../didit-accounts/[id]/loading.tsx`: copy `settings/product/vats/[vatId]/loading.tsx` byte for byte.

- [ ] **Step 3: Type-check, lint, unit tests**

```bash
cd /c/unirefund/web-app-wt-sdk
pnpm --filter web type-check
pnpm --filter web test:unit
cd apps/web && npx eslint "src/app/[lang]/(main)/(unirefund)/settings/didit-accounts"
```

Expected: `type-check` exits 0, `test:unit` shows 0 fail, and lint reports no errors.

- [ ] **Step 4: Commit**

```bash
git add -- "apps/web/src/app/[lang]/(main)/(unirefund)/settings/didit-accounts/[id]/page.tsx" \
  "apps/web/src/app/[lang]/(main)/(unirefund)/settings/didit-accounts/[id]/loading.tsx" \
  "apps/web/src/app/[lang]/(main)/(unirefund)/settings/didit-accounts/[id]/_components/form.tsx"
git commit -m "feat(kyc): edit, delete and reinstate a Didit account"
```

---

### Task 9: Gates and checks on dev

**Files:** none, unless a check fails.

- [ ] **Step 1: Repo gates**

```bash
cd /c/unirefund/web-app-wt-sdk
pnpm --filter web type-check                  # expect exit 0
pnpm --filter web test:unit                   # expect 0 fail
pnpm --filter web lint 2>&1 | tail -3         # expect 0 errors
pnpm i18n:missing --app=web | grep NEEDS_KEY  # expect NEEDS_KEY 0
pnpm i18n:unused --app=web | tail -12         # expect only the 5 pre-existing keys (Default: Missing.Permission.*; TagService: CreditCard*, ManualVerification.CreateTag.TravellerFixed)
git status --short                            # expect nothing of ours unstaged; leave " m packages/utils"
```

- [ ] **Step 2: Start dev, detached**

Check port 3000 first with `netstat -ano | grep ":3000 "`. If something is listening there, it belongs to someone else: use another port and leave theirs alone. Start dev so that it survives the tool time limit:

```bash
cd /c/unirefund/web-app-wt-sdk/apps/web && (PORT=3100 pnpm dev > /c/Users/ERTUGR~1.AYA/AppData/Local/Temp/web-admin-gaps-dev.log 2>&1 &)
```

- [ ] **Step 3: Check by hand as the Faroe Islands `admin` (password `1q2w3E*`)**

1. **Table rename (Review Focus 1):**
   - Open a refund table that is assigned to a live contract.
   - Check: the amber notice shows, Name is enabled, and **Save name** renames the table.
   - Press Enter in Name. Check: no full `PUT …/refund-table-headers/{id}` appears in Network.
2. **Tour events:** create a throwaway event, then run the four cases in Task 3 Step 6.
3. **VAT:** press Delete on a VAT rate. Check: the "Why this VAT rate can't be deleted" dialog lists the impact.

- [ ] **Step 4: Check by hand as host `admin` (no tenant)**

1. Settings shows **Didit accounts**.
2. The list loads, and filters to Active / Shared only / one tenant (Review Focus 3: the URL carries `isShared=true` and the list is filtered).
3. The detail opens, the key field shows the masked-key placeholder, and the health badge matches the list.
4. **Do not** submit, delete or reinstate. Those are writes against dev's live KYC accounts.

Then sign in as the Faroe Islands admin and open `/settings/didit-accounts` directly. The menu must not show it, and the page must deny access.

- [ ] **Step 5: Stop dev**

Stop the dev server started in Step 2, and only that one: find its PID with `netstat -ano | grep ":3100 "`, then run `taskkill //PID <pid> //T //F`.

- [ ] **Step 6: Report**

Report the gate numbers, every manual check with its result, and the Didit write paths left unverified because they would touch live dev accounts.

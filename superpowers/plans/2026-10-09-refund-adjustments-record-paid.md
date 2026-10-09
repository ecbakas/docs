# Refund adjustments and record-paid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give web-app a UI for refund adjustments (list, open count, acknowledge, settle, detail) and for recording a refund that was paid outside the system. Both are backend features already in the SDK with no screen.

**Architecture:**
- **Adjustments:** a shared component set in `apps/web/src/components/refund-adjustments/` (pure helpers, table, action dialog, detail sheet). It is used by a new `operations/refund-adjustments` page and by a new **Adjustments** tab on the refund detail. The tag detail's corrections card links into the list.
- **Record-paid:** a mode of the existing refund desk (`operations/refund`). Its rules live in pure helpers added to `refund-payload.ts`. Its inputs are a new `record-paid-fields.tsx`, and `payment-rail.tsx` switches between creating a refund and recording a paid one.

**Tech Stack:** Next.js App Router (`apps/web`), React 19, `@repo/ayasofyazilim-ui` (MasterDataGrid, Dialog, Sheet, DatePicker, Switch), generated hey-api clients (`@repo/saas/RefundService`), and `node:test` with tsx.

**Spec:** `C:\unirefund\docs\superpowers\specs\2026-10-09-refund-adjustments-record-paid-design.md`

**Wiki check (UniRefund.wiki, through Daily-Report-2026-10-08):**
- **No later change.** The adjustments contract (09-10, PR #2171) and record-paid (09-18 #2246, 09-25 #2254) have not changed since.
- **Badge suggestion not taken.** The 09-10 report suggested an open-count badge; the user chose a count on the page only.
- **Record-paid is the only way in.** It is the sole route for already-paid refunds, because `CreateRefundDto` no longer accepts those fields (09-25, **BREAKING**).

## Global Constraints

**Worktree and branch:**
- worktree `C:\unirefund\web-app-wt-refund-adjustments`, outside the repository
- branch `feat/refund-adjustments-record-paid`, from `origin/main`
- do not push until Task 8

**Server actions:**
- Never call SDK clients from app code. Every call goes through `packages/actions`.
- GET actions (`actions.ts`): call `isUnauthorized` first, return `structuredSuccessResponse`, and **throw** `structuredError`.
- POST actions (`post-actions.ts`): return `structuredResponse` and **return** `structuredError`.

**Grants:**
- Every action needs its endpoint's group grant and leaf grant (`isActionGranted` / `guardPage` / `isRequirementMet`).
- `pnpm policy:audit` enforces this (R1/R2/R3).
- A grant literal must appear inside a gate call in the file, in every importer, or in an imported `.ts` grant helper.

**Delta:** `deltaRefundAmount` > 0 means the traveller was **underpaid**, < 0 **overpaid**, and 0 neither.

**Statuses:**
- Acknowledge only from `Open`.
- Settle from `Open` or `Acknowledged`, with a required non-blank note.
- The UI hides the actions a status does not allow. It still shows any backend refusal (`007001`, `007002`) as the backend's message.

**Record-paid input rules:**
- **Method:** never `Cash`.
- **Payout reference:** required.
- **Paid date:** not in the future, and not before the newest selected tag's `issueDate` (equal is allowed).
- **Card:** for `CreditCard`, require first 6 and last 4 digits (digits only, exactly 6 and 4), expiry month 1–12 and a 4-digit year. Send `maskedNumber = first6 + "******" + last4`. Holder name is optional.

**Dev writes:** do not create a record-paid refund on dev without the user's go-ahead.

**i18n:**
- After adding keys to any `resources/{en,tr}.json`, run `pnpm --filter web run init` before `type-check`.
- Never commit `*.gen.json`. Never stage `packages/utils` or `packages/ayasofyazilim-ui`.

**Commits and code:**
- Stage explicit paths only; lint-staged runs prettier.
- Every custom component needs a `data-testid`, because the repository's `react-require-testid` lint rule is an error.
- Keep comments sparse.

**Running one test file:** escape route-folder brackets for `node --test` as `[[]`. For example:

```
cd apps/web && node --import tsx --test "src/app/[[]lang]/(main)/(unirefund)/operations/refund/_components/refund-payload.test.ts"
```

**CI gates** (run all before pushing):
- `pnpm --filter web type-check`
- `pnpm --filter ssr type-check`
- `pnpm unit-test`
- `pnpm lint`
- `node --test scripts/lib/policy-audit-core.test.mjs`
- `pnpm policy:audit`

## Review Focus

1. **A status in the URL that isn't Open, Acknowledged, Settled or All** (a typo, an old link) must fall back to `Open`, not be sent to the backend, which would answer 400. Task 1's `toAdjustmentQuery` test pins this.
2. **The `Cash` rule follows the switch, not the URL.** A method left selected as `Cash` in the URL while the record-paid switch is on must not be offered or sent: switching on clears a now-unoffered method, and `buildRecordPaidRefundDto` returns null for Cash. Task 6 (helper) and Task 7 (wiring) pin this.
3. **No full card number can be typed.** Inputs longer than 6 or 4 digits are truncated by `maxLength`, and `maskedCardNumber` rejects anything that isn't exactly 6 and 4 digits. Task 6 pins it.
4. **The refund detail's Adjustments tab** must keep filters scoped to that refund. The tab page always sets `refundId` from the route, never from the URL. Task 5 Step 3 pins this with a manual check.
5. **The confirm button in record mode** must stay disabled while `buildRecordPaidRefundDto` returns null: blank reference, a future date, incomplete card details. The same function both gates the button and builds the payload, so they cannot drift. Task 7 pins this.

---

### Task 0: Worktree

**Files:** none

- [ ] **Step 1: Create and prepare the worktree**

```bash
cd /c/unirefund/web-app && git fetch origin -q
git worktree add /c/unirefund/web-app-wt-refund-adjustments -b feat/refund-adjustments-record-paid origin/main
cd /c/unirefund/web-app-wt-refund-adjustments
git branch --unset-upstream 2>/dev/null; git submodule update --init
cp /c/unirefund/web-app/apps/web/.env apps/web/.env
cp /c/unirefund/web-app/apps/ssr/.env apps/ssr/.env
cp /c/unirefund/web-app/apps/web/next-env.d.ts apps/web/
cp /c/unirefund/web-app/apps/ssr/next-env.d.ts apps/ssr/
pnpm install --frozen-lockfile
pnpm --filter web run init && pnpm --filter ssr run init
pnpm --filter web type-check   # expect exit 0 (baseline)
```

Expected: install succeeds and `type-check` exits 0. If `init` fails with 502, retry; dev-api's Cloudflare front returns 502s that clear on their own.

---

### Task 1: Adjustment helpers

**Files:**
- Create: `apps/web/src/components/refund-adjustments/adjustment.ts`
- Create: `apps/web/src/components/refund-adjustments/adjustment.test.ts`

**Interfaces:**
- Produces:
  - `type DeltaDirection = "underpaid" | "overpaid" | "none"`
  - `deltaDirection(delta: number | null | undefined): DeltaDirection`
  - `allowedActions(status: AdjustmentStatus | null | undefined): { acknowledge: boolean; settle: boolean }`
  - `ADJUSTMENT_STATUSES: AdjustmentStatus[]` (`["Open", "Acknowledged", "Settled"]`)
  - `ALL_STATUSES = "All"`
  - `type AdjustmentSearchParams = Omit<GetApiRefundServiceRefundAdjustmentsData, "status"> & { status?: string }`
  - `toAdjustmentQuery(search: AdjustmentSearchParams): GetApiRefundServiceRefundAdjustmentsData`
  - `isSettleNoteValid(note: string): boolean`

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/refund-adjustments/adjustment.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allowedActions,
  deltaDirection,
  isSettleNoteValid,
  toAdjustmentQuery,
} from "./adjustment";

describe("deltaDirection", () => {
  it("reads a positive delta as an underpaid traveller", () => {
    assert.equal(deltaDirection(12.5), "underpaid");
  });
  it("reads a negative delta as an overpaid traveller", () => {
    assert.equal(deltaDirection(-3), "overpaid");
  });
  it("treats zero and a missing delta as neither", () => {
    assert.equal(deltaDirection(0), "none");
    assert.equal(deltaDirection(null), "none");
  });
});

describe("allowedActions", () => {
  it("lets an open adjustment be acknowledged or settled", () => {
    assert.deepEqual(allowedActions("Open"), { acknowledge: true, settle: true });
  });
  it("lets an acknowledged adjustment only be settled", () => {
    assert.deepEqual(allowedActions("Acknowledged"), {
      acknowledge: false,
      settle: true,
    });
  });
  it("offers nothing on a settled adjustment", () => {
    assert.deepEqual(allowedActions("Settled"), {
      acknowledge: false,
      settle: false,
    });
  });
});

describe("toAdjustmentQuery", () => {
  it("defaults to open adjustments", () => {
    assert.deepEqual(toAdjustmentQuery({}), { status: "Open" });
  });
  it("sends no status for All", () => {
    assert.deepEqual(toAdjustmentQuery({ status: "All", tagId: "t-1" }), {
      tagId: "t-1",
    });
  });
  it("keeps a known status and the other parameters", () => {
    assert.deepEqual(
      toAdjustmentQuery({ status: "Settled", refundId: "r-1", skipCount: 10 }),
      { status: "Settled", refundId: "r-1", skipCount: 10 }
    );
  });
  it("falls back to open on an unknown status instead of sending it", () => {
    assert.deepEqual(toAdjustmentQuery({ status: "Closed" }), {
      status: "Open",
    });
  });
});

describe("isSettleNoteValid", () => {
  it("rejects an empty or blank note", () => {
    assert.equal(isSettleNoteValid(""), false);
    assert.equal(isSettleNoteValid("   \n "), false);
  });
  it("accepts a note with text", () => {
    assert.equal(isSettleNoteValid("Paid the difference by bank transfer"), true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/web && node --import tsx --test src/components/refund-adjustments/adjustment.test.ts`
Expected: FAIL, because `./adjustment` cannot be resolved.

- [ ] **Step 3: Implement**

`apps/web/src/components/refund-adjustments/adjustment.ts`:

```ts
import type {
  GetApiRefundServiceRefundAdjustmentsData,
  UniRefund_RefundService_Enums_RefundAdjustmentStatus as AdjustmentStatus,
} from "@repo/saas/RefundService";

export type DeltaDirection = "underpaid" | "overpaid" | "none";

// The backend defines the delta as After - Before.
export function deltaDirection(
  delta: number | null | undefined
): DeltaDirection {
  if (!delta) return "none";
  return delta > 0 ? "underpaid" : "overpaid";
}

export function allowedActions(
  status: AdjustmentStatus | null | undefined
): { acknowledge: boolean; settle: boolean } {
  return {
    acknowledge: status === "Open",
    settle: status === "Open" || status === "Acknowledged",
  };
}

export const ADJUSTMENT_STATUSES: AdjustmentStatus[] = [
  "Open",
  "Acknowledged",
  "Settled",
];
export const ALL_STATUSES = "All";

export type AdjustmentSearchParams = Omit<
  GetApiRefundServiceRefundAdjustmentsData,
  "status"
> & { status?: string };

export function toAdjustmentQuery(
  search: AdjustmentSearchParams
): GetApiRefundServiceRefundAdjustmentsData {
  const { status, ...rest } = search;
  if (status === ALL_STATUSES) return rest;
  const known = ADJUSTMENT_STATUSES.find((value) => value === status);
  return { ...rest, status: known ?? "Open" };
}

export function isSettleNoteValid(note: string): boolean {
  return note.trim().length > 0;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run the Step 2 command again. Expected: `# pass 12`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add -- apps/web/src/components/refund-adjustments/adjustment.ts apps/web/src/components/refund-adjustments/adjustment.test.ts
git commit -m "feat(refunds): rules for refund adjustment statuses, deltas and queries"
```

---

### Task 2: Adjustment actions and strings

**Files:**
- Modify: `packages/actions/unirefund/RefundService/actions.ts`
- Modify: `packages/actions/unirefund/RefundService/post-actions.ts`
- Modify: `apps/web/src/language-data/unirefund/RefundService/resources/en.json`, `.../tr.json`
- Modify: `apps/web/src/language-data/core/AbpUiNavigation/resources/en.json`, `.../tr.json`

**Interfaces:**
- Produces:
  - `getRefundAdjustmentsApi(data: GetApiRefundServiceRefundAdjustmentsData, session?)` (GET, throws)
  - `getRefundAdjustmentsOpenCountApi(session?)` (GET, throws)
  - `postRefundAdjustmentAcknowledgeApi(id: string)`
  - `postRefundAdjustmentSettleApi(id: string, note: string)`
  - the `Adjustments.*` RefundService keys and the `RefundAdjustments` navigation key

- [ ] **Step 1: Add the actions**

**GET actions.** Add `GetApiRefundServiceRefundAdjustmentsData` to the existing `import type { … } from "@repo/saas/RefundService"` in `actions.ts`, then append:

```ts
export async function getRefundAdjustmentsApi(
  data: GetApiRefundServiceRefundAdjustmentsData,
  session?: Session | null
) {
  await isUnauthorized({
    requiredPolicies: [
      "RefundService.RefundAdjustments",
      "RefundService.RefundAdjustments.ViewList",
    ],
    lang: "en",
  });
  try {
    const client = await getRefundServiceClient(session);
    const response =
      await client.refundAdjustment.getApiRefundServiceRefundAdjustments(data);
    return structuredSuccessResponse(response);
  } catch (error) {
    throw structuredError(error);
  }
}

export async function getRefundAdjustmentsOpenCountApi(
  session?: Session | null
) {
  await isUnauthorized({
    requiredPolicies: [
      "RefundService.RefundAdjustments",
      "RefundService.RefundAdjustments.ViewOpenCount",
    ],
    lang: "en",
  });
  try {
    const client = await getRefundServiceClient(session);
    const response =
      await client.refundAdjustment.getApiRefundServiceRefundAdjustmentsOpenCount();
    return structuredSuccessResponse(response);
  } catch (error) {
    throw structuredError(error);
  }
}
```

**POST actions.** Append to `post-actions.ts`:

```ts
export async function postRefundAdjustmentAcknowledgeApi(id: string) {
  try {
    const client = await getRefundServiceClient();
    const response =
      await client.refundAdjustment.postApiRefundServiceRefundAdjustmentsByIdAcknowledge(
        { id }
      );
    return structuredResponse(response);
  } catch (error) {
    return structuredError(error);
  }
}

export async function postRefundAdjustmentSettleApi(id: string, note: string) {
  try {
    const client = await getRefundServiceClient();
    const response =
      await client.refundAdjustment.postApiRefundServiceRefundAdjustmentsByIdSettle(
        { id, requestBody: { note } }
      );
    return structuredResponse(response);
  } catch (error) {
    return structuredError(error);
  }
}
```

- [ ] **Step 2: Add the strings**

**RefundService resources.** Add these keys to `RefundService/resources/en.json` after `"History"`:

```json
  "Adjustments.Title": "Refund adjustments",
  "Adjustments.Tab": "Adjustments",
  "Adjustments.OpenCount": "{0} open",
  "Adjustments.Status": "Status",
  "Adjustments.Status.All": "All",
  "Adjustments.Status.Open": "Open",
  "Adjustments.Status.Acknowledged": "Acknowledged",
  "Adjustments.Status.Settled": "Settled",
  "Adjustments.ArisenAt": "Arisen",
  "Adjustments.Tag": "Tag",
  "Adjustments.Refund": "Refund",
  "Adjustments.Before": "Refund before",
  "Adjustments.After": "Refund after",
  "Adjustments.Delta": "Difference",
  "Adjustments.Delta.underpaid": "Underpaid",
  "Adjustments.Delta.overpaid": "Overpaid",
  "Adjustments.Details": "Details",
  "Adjustments.Acknowledge": "Acknowledge",
  "Adjustments.Acknowledge.Description": "Mark this adjustment as seen. It stays open until it is settled.",
  "Adjustments.Settle": "Settle",
  "Adjustments.Settle.Description": "Record how the difference was handled outside the system. Nothing is paid or clawed back.",
  "Adjustments.Settle.NoteLabel": "How was the difference handled?",
  "Adjustments.Timeline.Arisen": "Arisen",
  "Adjustments.Timeline.Notified": "Role notified",
  "Adjustments.Timeline.Acknowledged": "Acknowledged",
  "Adjustments.Timeline.Settled": "Settled",
  "Adjustments.Sequence": "Correction #{0}",
  "Adjustments.ForTag": "Refund adjustments for this tag",
  "Adjustments.Done": "Saved",
```

**RefundService tr.json**, at the same place:

```json
  "Adjustments.Title": "İade düzeltmeleri",
  "Adjustments.Tab": "Düzeltmeler",
  "Adjustments.OpenCount": "{0} açık",
  "Adjustments.Status": "Durum",
  "Adjustments.Status.All": "Tümü",
  "Adjustments.Status.Open": "Açık",
  "Adjustments.Status.Acknowledged": "Görüldü",
  "Adjustments.Status.Settled": "Kapatıldı",
  "Adjustments.ArisenAt": "Oluşma",
  "Adjustments.Tag": "Etiket",
  "Adjustments.Refund": "İade",
  "Adjustments.Before": "Önceki iade",
  "Adjustments.After": "Sonraki iade",
  "Adjustments.Delta": "Fark",
  "Adjustments.Delta.underpaid": "Eksik ödendi",
  "Adjustments.Delta.overpaid": "Fazla ödendi",
  "Adjustments.Details": "Ayrıntılar",
  "Adjustments.Acknowledge": "Görüldü olarak işaretle",
  "Adjustments.Acknowledge.Description": "Bu düzeltmeyi görüldü olarak işaretleyin. Kapatılana kadar açık kalır.",
  "Adjustments.Settle": "Kapat",
  "Adjustments.Settle.Description": "Farkın sistem dışında nasıl karşılandığını kaydedin. Hiçbir ödeme veya geri alma yapılmaz.",
  "Adjustments.Settle.NoteLabel": "Fark nasıl karşılandı?",
  "Adjustments.Timeline.Arisen": "Oluştu",
  "Adjustments.Timeline.Notified": "Rol bilgilendirildi",
  "Adjustments.Timeline.Acknowledged": "Görüldü",
  "Adjustments.Timeline.Settled": "Kapatıldı",
  "Adjustments.Sequence": "Düzeltme #{0}",
  "Adjustments.ForTag": "Bu etiketin iade düzeltmeleri",
  "Adjustments.Done": "Kaydedildi",
```

**AbpUiNavigation resources.** Add after `"Refunds"`: `"RefundAdjustments": "Refund adjustments",` in en.json and `"RefundAdjustments": "İade düzeltmeleri",` in tr.json.

Then run `pnpm --filter web run init` and `pnpm --filter web type-check`. Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add -- packages/actions/unirefund/RefundService/actions.ts packages/actions/unirefund/RefundService/post-actions.ts apps/web/src/language-data/unirefund/RefundService/resources/en.json apps/web/src/language-data/unirefund/RefundService/resources/tr.json apps/web/src/language-data/core/AbpUiNavigation/resources/en.json apps/web/src/language-data/core/AbpUiNavigation/resources/tr.json
git commit -m "feat(refunds): actions and strings for refund adjustments"
```

---

### Task 3: Adjustments table, action dialog and detail sheet

**Files:**
- Create: `apps/web/src/components/refund-adjustments/adjustment-action-dialog.tsx`
- Create: `apps/web/src/components/refund-adjustments/adjustment-sheet.tsx`
- Create: `apps/web/src/components/refund-adjustments/adjustments-table.tsx`

**Interfaces:**
- Consumes:
  - From Task 1: `allowedActions`, `deltaDirection`, `isSettleNoteValid`, `ADJUSTMENT_STATUSES`, `ALL_STATUSES`.
  - From Task 2: `postRefundAdjustmentAcknowledgeApi`, `postRefundAdjustmentSettleApi`, the strings.
- Produces:
  - `<AdjustmentsTable response={PagedResultDto_RefundAdjustmentDto} lang={string} />`
  - `formatMoney(amount, currency, lang)`, exported from `adjustment-sheet.tsx`.

**Spec deviation, recorded here:** the list endpoint already returns the full `RefundAdjustmentDto`, so the sheet renders the selected row with no `GET {id}`. It is still gated by `RefundAdjustments.View`.

- [ ] **Step 1: The action dialog (acknowledge or settle)**

`adjustment-action-dialog.tsx`:

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import {
  postRefundAdjustmentAcknowledgeApi,
  postRefundAdjustmentSettleApi,
} from "@repo/actions/unirefund/RefundService/post-actions";
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
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { isSettleNoteValid } from "./adjustment";

export type AdjustmentAction = { kind: "acknowledge" | "settle"; id: string };

export function AdjustmentActionDialog({
  action,
  onClose,
}: {
  action: AdjustmentAction | null;
  onClose: () => void;
}) {
  const { t } = useTranslations();
  const router = useRouter();
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const isSettle = action?.kind === "settle";

  function close() {
    if (isPending) return;
    setNote("");
    onClose();
  }

  function confirm() {
    if (!action) return;
    if (isSettle && !isSettleNoteValid(note)) return;
    startTransition(async () => {
      const response = isSettle
        ? await postRefundAdjustmentSettleApi(action.id, note.trim())
        : await postRefundAdjustmentAcknowledgeApi(action.id);
      // Not handlePostResponse: its toast says "Created", and nothing is created here.
      if (response.type !== "success") {
        toast.error(response.message);
        return;
      }
      toast.success(t.RefundService["Adjustments.Done"]);
      setNote("");
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog
      data-testid="adjustment-action-dialog"
      onOpenChange={(open) => {
        if (!open) close();
      }}
      open={action !== null}
    >
      <DialogContent data-testid="adjustment-action-content">
        <DialogHeader data-testid="adjustment-action-header">
          <DialogTitle data-testid="adjustment-action-title">
            {t.RefundService[isSettle ? "Adjustments.Settle" : "Adjustments.Acknowledge"]}
          </DialogTitle>
          <DialogDescription data-testid="adjustment-action-description">
            {
              t.RefundService[
                isSettle
                  ? "Adjustments.Settle.Description"
                  : "Adjustments.Acknowledge.Description"
              ]
            }
          </DialogDescription>
        </DialogHeader>
        {isSettle ? (
          <div className="flex flex-col gap-1.5">
            <Label data-testid="adjustment-settle-note-label" htmlFor="adjustment-settle-note">
              {t.RefundService["Adjustments.Settle.NoteLabel"]}
            </Label>
            <Textarea
              data-testid="adjustment-settle-note"
              disabled={isPending}
              id="adjustment-settle-note"
              onChange={(event) => setNote(event.target.value)}
              rows={4}
              value={note}
            />
          </div>
        ) : null}
        <DialogFooter data-testid="adjustment-action-footer">
          <Button data-testid="adjustment-action-cancel" disabled={isPending} onClick={close} variant="outline">
            {t.Default.Cancel}
          </Button>
          <Button
            data-testid="adjustment-action-confirm"
            disabled={isPending || (isSettle && !isSettleNoteValid(note))}
            onClick={confirm}
          >
            {t.RefundService[isSettle ? "Adjustments.Settle" : "Adjustments.Acknowledge"]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: The detail sheet**

`adjustment-sheet.tsx`:

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { Badge } from "@repo/ayasofyazilim-ui/components/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/ayasofyazilim-ui/components/sheet";
import type { UniRefund_RefundService_RefundAdjustments_RefundAdjustmentDto as AdjustmentDto } from "@repo/saas/RefundService";
import { deltaDirection } from "./adjustment";

export function formatMoney(amount: number | null | undefined, currency: string | null | undefined, lang: string) {
  if (amount === null || amount === undefined) return "";
  return currency
    ? new Intl.NumberFormat(lang, { style: "currency", currency }).format(amount)
    : new Intl.NumberFormat(lang).format(amount);
}

function when(value: string | null | undefined, lang: string) {
  return value
    ? new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : null;
}

export function AdjustmentSheet({
  adjustment,
  lang,
  onClose,
}: {
  adjustment: AdjustmentDto | null;
  lang: string;
  onClose: () => void;
}) {
  const { t } = useTranslations();
  const direction = deltaDirection(adjustment?.deltaRefundAmount);
  const steps = adjustment
    ? ([
        ["Adjustments.Timeline.Arisen", adjustment.arisenAt],
        ["Adjustments.Timeline.Notified", adjustment.notificationSentAt],
        ["Adjustments.Timeline.Acknowledged", adjustment.acknowledgedAt],
        ["Adjustments.Timeline.Settled", adjustment.settledAt],
      ] as const).filter(([, at]) => !!at)
    : [];
  return (
    <Sheet data-testid="adjustment-sheet" onOpenChange={(open) => { if (!open) onClose(); }} open={adjustment !== null}>
      <SheetContent className="w-full sm:max-w-md" data-testid="adjustment-sheet-content">
        {adjustment ? (
          <>
            <SheetHeader data-testid="adjustment-sheet-header">
              <SheetTitle data-testid="adjustment-sheet-title">
                {adjustment.tagNumber}
              </SheetTitle>
              <SheetDescription data-testid="adjustment-sheet-description">
                {t.RefundService["Adjustments.Sequence"].replace("{0}", String(adjustment.sequenceNo ?? ""))}
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-4 px-4 text-sm">
              <Badge data-testid="adjustment-sheet-status" variant="outline">
                {t.RefundService[`Adjustments.Status.${adjustment.status ?? "Open"}`]}
              </Badge>
              <dl className="grid grid-cols-2 gap-y-2">
                <dt className="text-muted-foreground">{t.RefundService["Adjustments.Before"]}</dt>
                <dd className="text-right tabular-nums">{formatMoney(adjustment.refundAmountBefore, adjustment.currency, lang)}</dd>
                <dt className="text-muted-foreground">{t.RefundService["Adjustments.After"]}</dt>
                <dd className="text-right tabular-nums">{formatMoney(adjustment.refundAmountAfter, adjustment.currency, lang)}</dd>
                <dt className="text-muted-foreground">{t.RefundService["Adjustments.Delta"]}</dt>
                <dd className={direction === "underpaid" ? "text-right font-semibold tabular-nums text-emerald-700" : direction === "overpaid" ? "text-right font-semibold tabular-nums text-destructive" : "text-right tabular-nums"}>
                  {formatMoney(adjustment.deltaRefundAmount, adjustment.currency, lang)}
                  {direction !== "none" ? ` · ${t.RefundService[`Adjustments.Delta.${direction}`]}` : ""}
                </dd>
              </dl>
              <ol className="flex flex-col gap-2 border-l pl-4">
                {steps.map(([key, at]) => (
                  <li key={key}>
                    <span className="font-medium">{t.RefundService[key]}</span>
                    <span className="text-muted-foreground"> · {when(at, lang)}</span>
                  </li>
                ))}
              </ol>
              {adjustment.settledNote ? (
                <p className="rounded-md border p-3 whitespace-pre-wrap">{adjustment.settledNote}</p>
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 3: The table**

`adjustments-table.tsx`:

```tsx
"use client";
import { firstRefundTab } from "@/src/app/[lang]/(main)/(unirefund)/operations/refunds/_components/refund-tabs";
import { useTranslations } from "@/src/providers/i18n";
import { getBaseLink } from "@/src/utils";
import { createServerFilters } from "@/src/utils/server-filters";
import { Badge } from "@repo/ayasofyazilim-ui/components/badge";
import { MasterDataGrid, RowLink } from "@repo/ayasofyazilim-ui/custom/master-data-grid";
import {
  $UniRefund_RefundService_RefundAdjustments_RefundAdjustmentDto,
  type PagedResultDto_RefundAdjustmentDto,
  type UniRefund_RefundService_RefundAdjustments_RefundAdjustmentDto as AdjustmentDto,
} from "@repo/saas/RefundService";
import { useApplicationConfiguration, useLocalization } from "@repo/utils/app-config";
import { isActionGranted } from "@repo/utils/policies";
import { CheckCheck, Eye, HandCoins } from "lucide-react";
import { useState } from "react";
import { ADJUSTMENT_STATUSES, ALL_STATUSES, allowedActions, deltaDirection } from "./adjustment";
import { AdjustmentActionDialog, type AdjustmentAction } from "./adjustment-action-dialog";
import { AdjustmentSheet, formatMoney } from "./adjustment-sheet";

const STATUS_BADGE = { Open: "warning", Acknowledged: "info", Settled: "success" } as const;

export function AdjustmentsTable({
  response,
  lang,
}: {
  response: PagedResultDto_RefundAdjustmentDto;
  lang: string;
}) {
  const { t } = useTranslations();
  const localization = useLocalization();
  const { policies: grantedPolicies } = useApplicationConfiguration();
  const [action, setAction] = useState<AdjustmentAction | null>(null);
  const [open, setOpen] = useState<AdjustmentDto | null>(null);
  const canView = isActionGranted(["RefundService.RefundAdjustments", "RefundService.RefundAdjustments.View"], grantedPolicies);
  const canAcknowledge = isActionGranted(["RefundService.RefundAdjustments", "RefundService.RefundAdjustments.Acknowledge"], grantedPolicies);
  const canSettle = isActionGranted(["RefundService.RefundAdjustments", "RefundService.RefundAdjustments.Settle"], grantedPolicies);
  const refundTab = firstRefundTab(grantedPolicies);
  const f = createServerFilters(t.Default);
  return (
    <>
      <MasterDataGrid
        data={response.items || []}
        config={{
          localization,
          rowCount: response.totalCount,
          schema: $UniRefund_RefundService_RefundAdjustments_RefundAdjustmentDto,
          schemaColumns: {
            mode: "include",
            columns: ["arisenAt", "tagNumber", "refundReferenceNumber", "refundAmountBefore", "refundAmountAfter", "deltaRefundAmount", "status"],
          },
          t: {
            ...t.Default,
            "column.arisenAt": t.RefundService["Adjustments.ArisenAt"],
            "column.tagNumber": t.RefundService["Adjustments.Tag"],
            "column.refundReferenceNumber": t.RefundService["Adjustments.Refund"],
            "column.refundAmountBefore": t.RefundService["Adjustments.Before"],
            "column.refundAmountAfter": t.RefundService["Adjustments.After"],
            "column.deltaRefundAmount": t.RefundService["Adjustments.Delta"],
            "column.status": t.RefundService["Adjustments.Status"],
          },
          customRenderers: {
            tagNumber: ({ row }) =>
              row.original.tagId ? (
                <RowLink href={getBaseLink(`operations/tax-free-tags/${row.original.tagId}`, lang)} label={row.original.tagNumber ?? ""} />
              ) : (row.original.tagNumber ?? ""),
            refundReferenceNumber: ({ row }) =>
              row.original.refundReferenceNumber && refundTab ? (
                <RowLink href={getBaseLink(`operations/refunds/${row.original.refundId}/${refundTab}`, lang)} label={row.original.refundReferenceNumber} />
              ) : (row.original.refundReferenceNumber ?? ""),
            refundAmountBefore: ({ row }) => formatMoney(row.original.refundAmountBefore, row.original.currency, lang),
            refundAmountAfter: ({ row }) => formatMoney(row.original.refundAmountAfter, row.original.currency, lang),
            deltaRefundAmount: ({ row }) => {
              const direction = deltaDirection(row.original.deltaRefundAmount);
              const amount = formatMoney(row.original.deltaRefundAmount, row.original.currency, lang);
              if (direction === "none") return amount;
              return (
                <span className={direction === "underpaid" ? "font-medium text-emerald-700" : "font-medium text-destructive"}>
                  {amount} · {t.RefundService[`Adjustments.Delta.${direction}`]}
                </span>
              );
            },
            status: ({ row }) => {
              const status = row.original.status ?? "Open";
              return (
                <Badge data-testid="adjustment-status" variant={STATUS_BADGE[status]}>
                  {t.RefundService[`Adjustments.Status.${status}`]}
                </Badge>
              );
            },
          },
          serverFilters: [
            f.select(
              "status",
              t.RefundService["Adjustments.Status"],
              [...ADJUSTMENT_STATUSES, ALL_STATUSES].map((status) => ({
                label: t.RefundService[`Adjustments.Status.${status}`],
                value: status,
              }))
            ),
            f.dateRange("arisenAt", "arisenFrom", "arisenTo", t.RefundService["Adjustments.ArisenAt"]),
          ],
          rowActions: [
            { id: "adjustment-details", icon: Eye, label: t.RefundService["Adjustments.Details"], hidden: () => !canView, onClick: (row) => setOpen(row) },
            {
              id: "adjustment-acknowledge",
              icon: CheckCheck,
              label: t.RefundService["Adjustments.Acknowledge"],
              hidden: (row) => !canAcknowledge || !allowedActions(row.status).acknowledge,
              onClick: (row) => row.id && setAction({ kind: "acknowledge", id: row.id }),
            },
            {
              id: "adjustment-settle",
              icon: HandCoins,
              label: t.RefundService["Adjustments.Settle"],
              hidden: (row) => !canSettle || !allowedActions(row.status).settle,
              onClick: (row) => row.id && setAction({ kind: "settle", id: row.id }),
            },
          ],
        }}
      />
      <AdjustmentActionDialog action={action} onClose={() => setAction(null)} />
      <AdjustmentSheet adjustment={open} lang={lang} onClose={() => setOpen(null)} />
    </>
  );
}
```

If `type-check` rejects an option shape:
- `f.dateRange`: read its signature in `apps/web/src/utils/server-filters.ts`.
- `rowActions` callback types: read `StandardRowAction` in `packages/ayasofyazilim-ui/src/custom/master-data-grid/types.ts`.

Match the real shapes, with no casts.

If importing `firstRefundTab` through the `@/src/app/...` route path is rejected (bracketed segments), move `refund-tabs.ts` up to `apps/web/src/utils/refund-tabs.ts`, update its two existing importers, and record a ruling in the ledger.

- [ ] **Step 4: Type-check and lint**

```bash
pnpm --filter web type-check
cd apps/web && npx eslint src/components/refund-adjustments
```

Expected: exit 0, no lint errors.

- [ ] **Step 5: Commit**

```bash
git add -- apps/web/src/components/refund-adjustments/adjustment-action-dialog.tsx apps/web/src/components/refund-adjustments/adjustment-sheet.tsx apps/web/src/components/refund-adjustments/adjustments-table.tsx
git commit -m "feat(refunds): refund adjustments table with acknowledge, settle and a detail sheet"
```

---

### Task 4: The refund adjustments page and nav item

**Files:**
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/refund-adjustments/page.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/refund-adjustments/loading.tsx` (copy `operations/refunds/loading.tsx` if it exists, otherwise `settings/product/vats/loading.tsx`)
- Modify: `apps/web/src/components/sidebar-layout/data.ts`

**Interfaces:**
- Consumes:
  - From Task 1: `toAdjustmentQuery`, `AdjustmentSearchParams`.
  - From Task 2: `getRefundAdjustmentsApi`, `getRefundAdjustmentsOpenCountApi`.
  - From Task 3: `AdjustmentsTable`.

- [ ] **Step 1: The page**

```tsx
"use server";

import { guardPage } from "@/src/components/permission-guard/guard";
import { AdjustmentsTable } from "@/src/components/refund-adjustments/adjustments-table";
import { toAdjustmentQuery, type AdjustmentSearchParams } from "@/src/components/refund-adjustments/adjustment";
import { getTranslations } from "@/src/language-data/get-translations";
import { isRequirementMet } from "@/src/utils/policies";
import { getRefundAdjustmentsApi, getRefundAdjustmentsOpenCountApi } from "@repo/actions/unirefund/RefundService/actions";
import ErrorComponent from "@repo/ui/components/error-component";
import { structuredError } from "@repo/utils/api";
import { getApplicationConfiguration } from "@repo/utils/app-config/fetch";
import { auth } from "@repo/utils/auth/next-auth";
import { isRedirectError } from "next/dist/client/components/redirect-error";

async function getApiRequests(search: AdjustmentSearchParams) {
  try {
    const session = await auth();
    const { policies } = await getApplicationConfiguration();
    const requiredRequests = await Promise.all([getRefundAdjustmentsApi(toAdjustmentQuery(search), session)]);
    const optionalRequests = await Promise.allSettled([
      isRequirementMet(["RefundService.RefundAdjustments", "RefundService.RefundAdjustments.ViewOpenCount"], policies)
        ? getRefundAdjustmentsOpenCountApi(session)
        : Promise.reject(new Error("not granted")),
    ]);
    return { requiredRequests, optionalRequests };
  } catch (error) {
    if (!isRedirectError(error)) return structuredError(error);
    throw error;
  }
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<AdjustmentSearchParams>;
}) {
  const { lang } = await params;
  const denied = await guardPage({
    requires: ["RefundService.RefundAdjustments", "RefundService.RefundAdjustments.ViewList"],
    lang,
  });
  if (denied) return denied;
  const t = await getTranslations(lang);
  const apiRequests = await getApiRequests(await searchParams);
  if ("message" in apiRequests) {
    return <ErrorComponent languageData={t.Default} message={apiRequests.message} />;
  }
  const [listResponse] = apiRequests.requiredRequests;
  const [countResult] = apiRequests.optionalRequests;
  const openCount = countResult.status === "fulfilled" ? countResult.value.data : null;
  return (
    <div className="flex h-full flex-col gap-2">
      {typeof openCount === "number" ? (
        <p className="text-sm text-muted-foreground" data-testid="adjustments-open-count">
          {t.RefundService["Adjustments.OpenCount"].replace("{0}", String(openCount))}
        </p>
      ) : null}
      <AdjustmentsTable lang={lang} response={listResponse.data} />
    </div>
  );
}
```

`apps/web/AGENTS.md` and memory `web-app-page-must-return-single-root` require a single `min-h-0 flex-1` root under `SidebarInset`. If a sibling page uses one, copy its root `className`; otherwise keep the single `<div>` above.

- [ ] **Step 2: The nav item**

In `apps/web/src/components/sidebar-layout/data.ts`, insert directly after the `key: "operations/refunds"` item's closing `},`:

```ts
      {
        key: "operations/refund-adjustments",
        displayName: "RefundAdjustments",
        href: "operations/refund-adjustments",
        icon: "HandCoins",
        policies: [
          "RefundService.RefundAdjustments",
          "RefundService.RefundAdjustments.ViewList",
        ],
      },
```

- [ ] **Step 3: Type-check, lint and audit**

```bash
pnpm --filter web type-check
cd apps/web && npx eslint "src/app/[lang]/(main)/(unirefund)/operations/refund-adjustments" src/components/sidebar-layout/data.ts && cd ../..
pnpm policy:audit
```

Expected: exit 0, and `policy-audit: 0 violation(s)`.

- [ ] **Step 4: Commit**

```bash
git add -- "apps/web/src/app/[lang]/(main)/(unirefund)/operations/refund-adjustments/page.tsx" "apps/web/src/app/[lang]/(main)/(unirefund)/operations/refund-adjustments/loading.tsx" apps/web/src/components/sidebar-layout/data.ts
git commit -m "feat(refunds): a refund adjustments page, defaulting to open ones"
```

---

### Task 5: The Adjustments tab on a refund, and a link from the tag

**Files:**
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/refunds/_components/refund-tabs.ts` (or `apps/web/src/utils/refund-tabs.ts`, if Task 3 moved it)
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/refunds/[refundId]/layout.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/refunds/[refundId]/adjustments/page.tsx`
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/tax-free-tags/[tagId]/_components/corrections-card.tsx`
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/tax-free-tags/[tagId]/_components/tag-details-main.tsx`

- [ ] **Step 1: The tab**

**`refund-tabs.ts`:**
- Change `export type RefundTab = "tags" | "payments";` to `"tags" | "payments" | "adjustments"`.
- At the end of `grantedRefundTabs`, before `return tabs;`, add:

```ts
  if (
    isActionGranted(
      ["RefundService.RefundAdjustments", "RefundService.RefundAdjustments.ViewList"],
      granted
    )
  ) {
    tabs.push("adjustments");
  }
```

**`[refundId]/layout.tsx`:** add `adjustments: t.RefundService["Adjustments.Tab"],` to `tabLabels`.

**`[refundId]/adjustments/page.tsx`** (Review Focus 4: `refundId` always comes from the route):

```tsx
import { guardPage } from "@/src/components/permission-guard/guard";
import { AdjustmentsTable } from "@/src/components/refund-adjustments/adjustments-table";
import { toAdjustmentQuery, type AdjustmentSearchParams } from "@/src/components/refund-adjustments/adjustment";
import { getTranslations } from "@/src/language-data/get-translations";
import { getRefundAdjustmentsApi } from "@repo/actions/unirefund/RefundService/actions";
import ErrorComponent from "@repo/ui/components/error-component";
import { structuredError } from "@repo/utils/api";
import { auth } from "@repo/utils/auth/next-auth";
import { isRedirectError } from "next/dist/client/components/redirect-error";

async function getApiRequests(search: AdjustmentSearchParams) {
  try {
    const session = await auth();
    const requiredRequests = await Promise.all([getRefundAdjustmentsApi(toAdjustmentQuery(search), session)]);
    return { requiredRequests };
  } catch (error) {
    if (!isRedirectError(error)) return structuredError(error);
    throw error;
  }
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ refundId: string; lang: string }>;
  searchParams: Promise<AdjustmentSearchParams>;
}) {
  const { lang, refundId } = await params;
  const denied = await guardPage({
    requires: ["RefundService.RefundAdjustments", "RefundService.RefundAdjustments.ViewList"],
    lang,
  });
  if (denied) return denied;
  const t = await getTranslations(lang);
  const search = await searchParams;
  // A refund's tab shows every status unless one is picked.
  const apiRequests = await getApiRequests({ status: "All", ...search, refundId });
  if ("message" in apiRequests) {
    return <ErrorComponent languageData={t.Default} message={apiRequests.message} />;
  }
  const [listResponse] = apiRequests.requiredRequests;
  return <AdjustmentsTable lang={lang} response={listResponse.data} />;
}
```

- [ ] **Step 2: The link from the tag**

**`corrections-card.tsx`:**
- Add a prop `adjustmentsHref?: string`.
- Directly after the closing `</div>` of the `divide-y` list inside `DetailsCard`, add:

```tsx
      {adjustmentsHref ? (
        <div className="border-t p-3 text-sm">
          <Link className="text-primary underline-offset-4 hover:underline" data-testid="tag-refund-adjustments-link" href={adjustmentsHref}>
            {t.RefundService["Adjustments.ForTag"]}
          </Link>
        </div>
      ) : null}
```

Import `Link` from `next/link` if it isn't already imported.

**`tag-details-main.tsx`:** pass `adjustmentsHref` to `<CorrectionsCard …/>`, computed from what the component already has. It needs `tagDetail.refundId` and the grant:

```ts
const canListAdjustments = isActionGranted(
  ["RefundService.RefundAdjustments", "RefundService.RefundAdjustments.ViewList"],
  grantedPolicies
);
const adjustmentsHref =
  tagDetail.refundId && tagDetail.id && canListAdjustments
    ? getBaseLink(`operations/refund-adjustments?tagId=${tagDetail.id}&status=All`, lang)
    : undefined;
```

`tag-details-main.tsx` may lack `grantedPolicies` or `lang`. If so, take them from `useApplicationConfiguration()` and `useParams<{ lang: string }>()`, which it or its siblings already import.

- [ ] **Step 3: Type-check, lint, audit, unit tests**

```bash
pnpm --filter web type-check
pnpm --filter web test:unit
cd apps/web && npx eslint "src/app/[lang]/(main)/(unirefund)/operations/refunds" "src/app/[lang]/(main)/(unirefund)/operations/tax-free-tags/[tagId]" && cd ../..
pnpm policy:audit
```

Expected: everything exits 0, `test:unit` shows 0 fail, and the audit reports 0 violations.

Manual check, in Task 8 (Review Focus 4): on `/operations/refunds/{id}/adjustments?refundId=<other>`, only that refund's adjustments show.

- [ ] **Step 4: Commit**

```bash
git add -- "apps/web/src/app/[lang]/(main)/(unirefund)/operations/refunds/_components/refund-tabs.ts" "apps/web/src/app/[lang]/(main)/(unirefund)/operations/refunds/[refundId]/layout.tsx" "apps/web/src/app/[lang]/(main)/(unirefund)/operations/refunds/[refundId]/adjustments/page.tsx" "apps/web/src/app/[lang]/(main)/(unirefund)/operations/tax-free-tags/[tagId]/_components/corrections-card.tsx" "apps/web/src/app/[lang]/(main)/(unirefund)/operations/tax-free-tags/[tagId]/_components/tag-details-main.tsx"
git commit -m "feat(refunds): adjustments tab on a refund, and a link from the tag's corrections"
```

---

### Task 6: Record-paid helpers

**Files:**
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/refund/_components/refund-payload.ts`
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/refund/_components/refund-payload.test.ts`

**Interfaces:**
- Produces:
  - `recordPaidMethods(types: readonly RefundMethod[] | undefined): RefundMethod[]`
  - `maskedCardNumber(first6: string, last4: string): string | null`
  - `newestIssueDate(rows: readonly { issueDate?: string | null }[]): Date | null`
  - `type PaidDateProblem = "future" | "beforeIssue"`
  - `paidDateProblem(paidDate: Date, newestIssue: Date | null, now: Date): PaidDateProblem | null`
  - `type RecordPaidInput = { payoutReference: string; cardFirst6: string; cardLast4: string; cardExpiryMonth: string; cardExpiryYear: string; cardHolderName: string }`
  - `EMPTY_RECORD_PAID: RecordPaidInput`
  - `buildRecordPaidRefundDto(args): RecordPaidRefundDto | null`

- [ ] **Step 1: Write the failing tests**

Append to `refund-payload.test.ts` (it uses `test` from `node:test` and `assert` from `node:assert/strict`):

```ts
import {
  EMPTY_RECORD_PAID,
  buildRecordPaidRefundDto,
  maskedCardNumber,
  newestIssueDate,
  paidDateProblem,
  recordPaidMethods,
} from "./refund-payload";

const NOW = new Date("2026-10-09T12:00:00.000Z");
const RECORD_BASE = {
  refundPointId: "rp-1",
  tagIds: ["t-1"],
  paidDate: "2026-10-08T09:00:00.000Z",
  newestIssue: new Date("2026-10-01T00:00:00.000Z"),
  now: NOW,
  signatures: {},
};

test("record-paid never offers cash", () => {
  assert.deepEqual(recordPaidMethods(["Cash", "CreditCard", "BankTransfer"]), ["CreditCard", "BankTransfer"]);
  assert.deepEqual(recordPaidMethods(["Cash"]), []);
  assert.deepEqual(recordPaidMethods(undefined), []);
});

test("a masked card number needs exactly 6 and 4 digits", () => {
  assert.equal(maskedCardNumber("411111", "1111"), "411111******1111");
  assert.equal(maskedCardNumber("41111", "1111"), null);
  assert.equal(maskedCardNumber("4111111", "1111"), null);
  assert.equal(maskedCardNumber("41a111", "1111"), null);
  assert.equal(maskedCardNumber("411111", "111"), null);
});

test("the newest issue date among the selected tags", () => {
  assert.deepEqual(
    newestIssueDate([{ issueDate: "2026-09-01T00:00:00Z" }, { issueDate: "2026-10-01T00:00:00Z" }, { issueDate: null }]),
    new Date("2026-10-01T00:00:00Z")
  );
  assert.equal(newestIssueDate([]), null);
});

test("a paid date may not be in the future or before the newest issue date", () => {
  const issue = new Date("2026-10-01T00:00:00Z");
  assert.equal(paidDateProblem(new Date("2026-10-09T12:01:00Z"), issue, NOW), "future");
  assert.equal(paidDateProblem(new Date("2026-09-30T23:59:00Z"), issue, NOW), "beforeIssue");
  assert.equal(paidDateProblem(issue, issue, NOW), null);
  assert.equal(paidDateProblem(new Date("2026-09-01T00:00:00Z"), null, NOW), null);
});

test("a bank transfer is recorded with its reference and no card", () => {
  assert.deepEqual(
    buildRecordPaidRefundDto({ ...RECORD_BASE, refundTypeEnum: "BankTransfer", input: { ...EMPTY_RECORD_PAID, payoutReference: " TRX-42 " } }),
    { refundPointId: "rp-1", tagIds: ["t-1"], refundTypeEnum: "BankTransfer", paidDate: "2026-10-08T09:00:00.000Z", payoutReference: "TRX-42" }
  );
});

test("record-paid refuses cash, a blank reference and a bad date", () => {
  const input = { ...EMPTY_RECORD_PAID, payoutReference: "TRX-42" };
  assert.equal(buildRecordPaidRefundDto({ ...RECORD_BASE, refundTypeEnum: "Cash", input }), null);
  assert.equal(buildRecordPaidRefundDto({ ...RECORD_BASE, refundTypeEnum: "BankTransfer", input: EMPTY_RECORD_PAID }), null);
  assert.equal(buildRecordPaidRefundDto({ ...RECORD_BASE, paidDate: "2026-10-10T00:00:00.000Z", refundTypeEnum: "BankTransfer", input }), null);
});

test("a card record needs the masked number and a valid expiry", () => {
  const card = { ...EMPTY_RECORD_PAID, payoutReference: "RCPT-7", cardFirst6: "411111", cardLast4: "1111", cardExpiryMonth: "4", cardExpiryYear: "2029", cardHolderName: " " };
  assert.deepEqual(
    buildRecordPaidRefundDto({ ...RECORD_BASE, refundTypeEnum: "CreditCard", input: card })?.paidCardDetail,
    { maskedNumber: "411111******1111", cardExpiryMonth: 4, cardExpiryYear: 2029 }
  );
  assert.equal(buildRecordPaidRefundDto({ ...RECORD_BASE, refundTypeEnum: "CreditCard", input: { ...card, cardExpiryMonth: "13" } }), null);
  assert.equal(buildRecordPaidRefundDto({ ...RECORD_BASE, refundTypeEnum: "CreditCard", input: { ...card, cardExpiryYear: "29" } }), null);
  assert.equal(buildRecordPaidRefundDto({ ...RECORD_BASE, refundTypeEnum: "CreditCard", input: { ...card, cardLast4: "" } }), null);
});
```

If the test file's existing import from `./refund-payload` is a single block, merge the new names into it instead of adding a second import.

- [ ] **Step 2: Run them and watch them fail**

Run: `cd apps/web && node --import tsx --test "src/app/[[]lang]/(main)/(unirefund)/operations/refund/_components/refund-payload.test.ts"`
Expected: FAIL, because the imported names do not exist yet.

- [ ] **Step 3: Implement**

**Imports.** In `refund-payload.ts`, extend the RefundService type import:

```ts
import type {
  UniRefund_RefundService_Refunds_CreateRefundDto as CreateRefundDto,
  UniRefund_RefundService_Refunds_RecordPaidRefundDto as RecordPaidRefundDto,
  UniRefund_RefundService_TravellerCards_CreateTravellerCardDto as CreateTravellerCardDto,
} from "@repo/saas/RefundService";
```

**Helpers.** Append to the file:

```ts
export function recordPaidMethods(
  types: readonly RefundMethod[] | undefined
): RefundMethod[] {
  return (types ?? []).filter((type) => type !== "Cash");
}

export function maskedCardNumber(first6: string, last4: string): string | null {
  return /^\d{6}$/.test(first6) && /^\d{4}$/.test(last4)
    ? `${first6}******${last4}`
    : null;
}

export function newestIssueDate(
  rows: readonly { issueDate?: string | null }[]
): Date | null {
  let newest: Date | null = null;
  for (const row of rows) {
    if (!row.issueDate) continue;
    const date = new Date(row.issueDate);
    if (Number.isNaN(date.getTime())) continue;
    if (!newest || date > newest) newest = date;
  }
  return newest;
}

export type PaidDateProblem = "future" | "beforeIssue";

export function paidDateProblem(
  paidDate: Date,
  newestIssue: Date | null,
  now: Date
): PaidDateProblem | null {
  if (paidDate.getTime() > now.getTime()) return "future";
  if (newestIssue && paidDate.getTime() < newestIssue.getTime()) return "beforeIssue";
  return null;
}

export type RecordPaidInput = {
  payoutReference: string;
  cardFirst6: string;
  cardLast4: string;
  cardExpiryMonth: string;
  cardExpiryYear: string;
  cardHolderName: string;
};

export const EMPTY_RECORD_PAID: RecordPaidInput = {
  payoutReference: "",
  cardFirst6: "",
  cardLast4: "",
  cardExpiryMonth: "",
  cardExpiryYear: "",
  cardHolderName: "",
};

/** The record-paid payload, or null while anything it needs is missing or invalid. */
export function buildRecordPaidRefundDto({
  refundPointId,
  tagIds,
  refundTypeEnum,
  paidDate,
  newestIssue,
  now,
  input,
  signatures,
}: {
  refundPointId: string;
  tagIds: string[];
  refundTypeEnum: RefundMethod;
  paidDate: string;
  newestIssue: Date | null;
  now: Date;
  input: RecordPaidInput;
  signatures: { traveller?: string; refundPoint?: string };
}): RecordPaidRefundDto | null {
  if (refundTypeEnum === "Cash" || tagIds.length === 0) return null;
  const payoutReference = input.payoutReference.trim();
  if (!payoutReference) return null;
  const date = new Date(paidDate);
  if (Number.isNaN(date.getTime()) || paidDateProblem(date, newestIssue, now)) return null;
  const dto: RecordPaidRefundDto = {
    refundPointId,
    tagIds,
    refundTypeEnum,
    paidDate: date.toISOString(),
    payoutReference,
  };
  if (refundTypeEnum === "CreditCard") {
    const maskedNumber = maskedCardNumber(input.cardFirst6, input.cardLast4);
    const month = Number(input.cardExpiryMonth);
    if (!maskedNumber || !Number.isInteger(month) || month < 1 || month > 12) return null;
    if (!/^\d{4}$/.test(input.cardExpiryYear)) return null;
    const holderName = input.cardHolderName.trim();
    dto.paidCardDetail = {
      maskedNumber,
      cardExpiryMonth: month,
      cardExpiryYear: Number(input.cardExpiryYear),
      ...(holderName ? { holderName } : {}),
    };
  }
  if (signatures.traveller) dto.travellerSignatureBase64 = signatures.traveller;
  if (signatures.refundPoint) dto.refundPointSignatureBase64 = signatures.refundPoint;
  return dto;
}
```

- [ ] **Step 4: Run them and watch them pass**

Run the Step 2 command again. Expected: every test passes, the earlier ones included, with `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add -- "apps/web/src/app/[lang]/(main)/(unirefund)/operations/refund/_components/refund-payload.ts" "apps/web/src/app/[lang]/(main)/(unirefund)/operations/refund/_components/refund-payload.test.ts"
git commit -m "feat(refund): rules for recording a refund paid outside the system"
```

---

### Task 7: The paid-outside mode on the refund desk

**Files:**
- Modify: `packages/actions/unirefund/RefundService/post-actions.ts`
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/refund/_components/refund-desk-grants.ts`
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/refund/client-page.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/refund/_components/record-paid-fields.tsx`
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/refund/_components/refund-filters/payment-rail.tsx`
- Modify: `apps/web/src/language-data/unirefund/TagService/resources/en.json`, `.../tr.json`

**Interfaces:**
- Consumes (from Task 6): every record-paid helper.
- Produces:
  - `postRecordPaidRefundApi(data: RecordPaidRefundDto)`
  - `canRecordPaidRefund(granted): boolean`
  - `RefundFormData.recordPaid: boolean` and `RefundFormData.recordPaidInput: RecordPaidInput`
  - `<RecordPaidFields refundMethod problem languageData />`

- [ ] **Step 1: The action, the grant and the strings**

**Action.** In `post-actions.ts`, add `UniRefund_RefundService_Refunds_RecordPaidRefundDto` to the type import and append:

```ts
export async function postRecordPaidRefundApi(
  data: UniRefund_RefundService_Refunds_RecordPaidRefundDto
) {
  try {
    const client = await getRefundServiceClient();
    const response = await client.refund.postApiRefundServiceRefundsRecordPaid({
      requestBody: data,
    });
    return structuredResponse(response);
  } catch (error) {
    return structuredError(error);
  }
}
```

**Grant.** In `refund-desk-grants.ts`, append:

```ts
export function canRecordPaidRefund(granted: GrantedPolicies) {
  return isActionGranted(
    ["RefundService.Refunds", "RefundService.Refunds.RecordPaid"],
    granted
  );
}
```

**Strings.** Add to `TagService/resources/en.json` after `"Refund.ConfirmHint"`:

```json
  "Refund.RecordPaid": "Already paid outside the system",
  "Refund.RecordPaid.CashOnly": "This refund point only offers cash. A cash refund is recorded the normal way.",
  "Refund.RecordPaid.PayoutReference": "Payout reference",
  "Refund.RecordPaid.PayoutReference.Hint": "Transfer reference or terminal receipt number",
  "Refund.RecordPaid.CardFirst6": "First 6 digits",
  "Refund.RecordPaid.CardLast4": "Last 4 digits",
  "Refund.RecordPaid.ExpiryMonth": "Expiry month",
  "Refund.RecordPaid.ExpiryYear": "Expiry year",
  "Refund.RecordPaid.HolderName": "Card holder (optional)",
  "Refund.RecordPaid.DateFuture": "The paid date cannot be in the future.",
  "Refund.RecordPaid.DateBeforeIssue": "The paid date cannot be before the newest tag's issue date.",
  "Refund.RecordPaid.Confirm.Title": "Record a paid refund",
  "Refund.RecordPaid.Confirm.Description": "This records a refund that was already paid outside the system. No money will be moved.",
  "Refund.RecordPaid.Confirm.Record": "Record refund",
```

Add to `tr.json`, at the same place:

```json
  "Refund.RecordPaid": "Sistem dışında zaten ödendi",
  "Refund.RecordPaid.CashOnly": "Bu iade noktası yalnızca nakit sunuyor. Nakit iade normal yolla kaydedilir.",
  "Refund.RecordPaid.PayoutReference": "Ödeme referansı",
  "Refund.RecordPaid.PayoutReference.Hint": "Havale referansı veya terminal fiş numarası",
  "Refund.RecordPaid.CardFirst6": "İlk 6 hane",
  "Refund.RecordPaid.CardLast4": "Son 4 hane",
  "Refund.RecordPaid.ExpiryMonth": "Son kullanma ayı",
  "Refund.RecordPaid.ExpiryYear": "Son kullanma yılı",
  "Refund.RecordPaid.HolderName": "Kart sahibi (isteğe bağlı)",
  "Refund.RecordPaid.DateFuture": "Ödeme tarihi gelecekte olamaz.",
  "Refund.RecordPaid.DateBeforeIssue": "Ödeme tarihi en yeni etiketin düzenlenme tarihinden önce olamaz.",
  "Refund.RecordPaid.Confirm.Title": "Ödenmiş iadeyi kaydet",
  "Refund.RecordPaid.Confirm.Description": "Bu işlem sistem dışında zaten ödenmiş bir iadeyi kaydeder. Hiçbir para hareketi olmaz.",
  "Refund.RecordPaid.Confirm.Record": "İadeyi kaydet",
```

Run `pnpm --filter web run init`.

- [ ] **Step 2: Form state**

In `client-page.tsx`:
- Import `EMPTY_RECORD_PAID` and `type RecordPaidInput` from `./_components/refund-payload`.
- Add `recordPaid: boolean; recordPaidInput: RecordPaidInput;` to `RefundFormData`.
- Change the `useState<RefundFormData>` initial value and the `RefundContext` default `formData` to:

```ts
{
  paidDate: new Date().toISOString(),
  recordPaid: false,
  recordPaidInput: EMPTY_RECORD_PAID,
}
```

- [ ] **Step 3: The fields**

`_components/record-paid-fields.tsx`:

```tsx
"use client";
import type { TagServiceResource } from "@/language-data/unirefund/TagService";
import { Input } from "@repo/ayasofyazilim-ui/components/input";
import { Label } from "@repo/ayasofyazilim-ui/components/label";
import { DatePicker } from "@repo/ayasofyazilim-ui/custom/date-picker";
import type { UniRefund_ContractService_Enums_RefundMethod as RefundMethod } from "@repo/saas/TagService";
import { useRefund } from "../client-page";
import type { PaidDateProblem, RecordPaidInput } from "./refund-payload";

const digits = (value: string, max: number) => value.replace(/\D/g, "").slice(0, max);

export function RecordPaidFields({
  refundMethod,
  problem,
  languageData,
}: {
  refundMethod: RefundMethod;
  problem: PaidDateProblem | null;
  languageData: TagServiceResource;
}) {
  const { formData, setFormData, isPending } = useRefund();
  const input = formData.recordPaidInput;
  const set = (patch: Partial<RecordPaidInput>) =>
    setFormData((prev) => ({ ...prev, recordPaidInput: { ...prev.recordPaidInput, ...patch } }));
  return (
    <div className="flex flex-col gap-3" data-testid="record-paid-fields">
      <div className="[&_span]:text-sm">
        <DatePicker
          classNames={{ dateInput: "w-full" }}
          defaultValue={new Date(formData.paidDate)}
          disabled={isPending}
          id="record-paid-date"
          label={languageData.PaidDate}
          maxDate={new Date()}
          onChange={(date: Date) => setFormData((prev) => ({ ...prev, paidDate: date.toISOString() }))}
          useTime
        />
        {problem ? (
          <p className="mt-1 text-xs text-destructive" data-testid="record-paid-date-problem">
            {languageData[problem === "future" ? "Refund.RecordPaid.DateFuture" : "Refund.RecordPaid.DateBeforeIssue"]}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label data-testid="record-paid-reference-label" htmlFor="record-paid-reference">
          {languageData["Refund.RecordPaid.PayoutReference"]}
        </Label>
        <Input
          data-testid="record-paid-reference"
          disabled={isPending}
          id="record-paid-reference"
          onChange={(event) => set({ payoutReference: event.target.value })}
          placeholder={languageData["Refund.RecordPaid.PayoutReference.Hint"]}
          value={input.payoutReference}
        />
      </div>
      {refundMethod === "CreditCard" ? (
        <div className="grid grid-cols-2 gap-2">
          <Input aria-label={languageData["Refund.RecordPaid.CardFirst6"]} autoComplete="off" data-testid="record-paid-first6" disabled={isPending} inputMode="numeric" maxLength={6} onChange={(e) => set({ cardFirst6: digits(e.target.value, 6) })} placeholder={languageData["Refund.RecordPaid.CardFirst6"]} value={input.cardFirst6} />
          <Input aria-label={languageData["Refund.RecordPaid.CardLast4"]} autoComplete="off" data-testid="record-paid-last4" disabled={isPending} inputMode="numeric" maxLength={4} onChange={(e) => set({ cardLast4: digits(e.target.value, 4) })} placeholder={languageData["Refund.RecordPaid.CardLast4"]} value={input.cardLast4} />
          <Input aria-label={languageData["Refund.RecordPaid.ExpiryMonth"]} autoComplete="off" data-testid="record-paid-expiry-month" disabled={isPending} inputMode="numeric" maxLength={2} onChange={(e) => set({ cardExpiryMonth: digits(e.target.value, 2) })} placeholder={languageData["Refund.RecordPaid.ExpiryMonth"]} value={input.cardExpiryMonth} />
          <Input aria-label={languageData["Refund.RecordPaid.ExpiryYear"]} autoComplete="off" data-testid="record-paid-expiry-year" disabled={isPending} inputMode="numeric" maxLength={4} onChange={(e) => set({ cardExpiryYear: digits(e.target.value, 4) })} placeholder={languageData["Refund.RecordPaid.ExpiryYear"]} value={input.cardExpiryYear} />
          <Input aria-label={languageData["Refund.RecordPaid.HolderName"]} autoComplete="off" className="col-span-2" data-testid="record-paid-holder" disabled={isPending} onChange={(e) => set({ cardHolderName: e.target.value })} placeholder={languageData["Refund.RecordPaid.HolderName"]} value={input.cardHolderName} />
        </div>
      ) : null}
    </div>
  );
}
```

If `DatePicker` does not accept `maxDate` here, drop the prop. `paidDateProblem` already blocks a future date.

- [ ] **Step 4: Wire the rail**

In `payment-rail.tsx`:

1. **Imports:**
   - `Switch` from `@repo/ayasofyazilim-ui/components/switch`
   - `Label` from `@repo/ayasofyazilim-ui/components/label`
   - `postRecordPaidRefundApi`, added to the existing post-actions import
   - `canRecordPaidRefund`, added to the `refund-desk-grants` import
   - `RecordPaidFields` from `../record-paid-fields`
   - `buildRecordPaidRefundDto`, `newestIssueDate`, `paidDateProblem` and `recordPaidMethods` from `../refund-payload`
2. **Record-mode state**, after `refundCardGrants` is read:

```ts
const mayRecordPaid = canRecordPaidRefund(grantedPolicies);
const recordMode = mayRecordPaid && formData.recordPaid;
const recordableMethods = recordPaidMethods(paymentTypesResponse);
const offeredMethods = recordMode ? recordableMethods : paymentTypesResponse;
const now = new Date();
const newestIssue = newestIssueDate(selectedRows);
const dateProblem = recordMode ? paidDateProblem(new Date(formData.paidDate), newestIssue, now) : null;
const recordDto =
  recordMode && refundMethod && refundPointId
    ? buildRecordPaidRefundDto({
        refundPointId,
        tagIds: selectedRows.map((row) => row.id),
        refundTypeEnum: refundMethod,
        paidDate: formData.paidDate,
        newestIssue,
        now,
        input: formData.recordPaidInput,
        signatures: {
          traveller: formData.travellerSignatureBase64 ?? undefined,
          refundPoint: formData.refundPointSignatureBase64 ?? undefined,
        },
      })
    : null;
```

3. **`isSubmitDisabled`:** in record mode it is `selectedRows.length === 0 || isPending || recordDto === null` (Review Focus 5). Outside record mode, keep the existing expression unchanged.
4. **Toggling:** add a `setRecordPaid(next: boolean)` that sets `formData.recordPaid`. When `next` is true and `selectedRefundMethod` is `"Cash"`, also call `setSelectedRefundMethod("")` (Review Focus 2).
5. **Submitting:** add `handleRecordPaid()`, which runs only when `recordDto` is set:

```ts
startTransition(async () => {
  const response = await postRecordPaidRefundApi(recordDto);
  handlePostResponse(
    response,
    router,
    response.type === "success" ? `/operations/refunds/${response.data.id}/tags` : undefined
  );
});
```

6. **The switch,** directly under the `RefundMethod` heading, when `mayRecordPaid`:

```tsx
<div className="flex items-center justify-between gap-2">
  <Label data-testid="record-paid-switch-label" htmlFor="record-paid-switch">
    {languageData["Refund.RecordPaid"]}
  </Label>
  <Switch
    checked={recordMode}
    data-testid="record-paid-switch"
    disabled={isPending || recordableMethods.length === 0}
    id="record-paid-switch"
    onCheckedChange={setRecordPaid}
  />
</div>
{mayRecordPaid && recordableMethods.length === 0 && paymentTypesResponse?.length ? (
  <p className="text-xs text-muted-foreground" data-testid="record-paid-cash-only">
    {languageData["Refund.RecordPaid.CashOnly"]}
  </p>
) : null}
```

7. **Method buttons:** in the method-button `map`, iterate `offeredMethods` instead of `paymentTypesResponse`.
8. **Payment form:** render `recordMode && refundMethod ? <RecordPaidFields languageData={languageData} problem={dateProblem} refundMethod={refundMethod} /> : <PaymentForm …existing props… />`.
9. **`ConfirmDialog`:**
   - In record mode, use `languageData["Refund.RecordPaid.Confirm.Title"]` as the title.
   - Prepend `languageData["Refund.RecordPaid.Confirm.Description"]` to the description, in place of `Refund.Confirm.Description`.
   - Use `languageData["Refund.RecordPaid.Confirm.Record"]` as the confirm label.
   - Use `onConfirm: recordMode ? handleRecordPaid : handlePostRefund`.

**Known limitation (spec deviation):** record mode offers the desk's `paymentTypesResponse`, which already hides `CreditCard` when the user lacks the traveller-card grants (`cardPayoutWithheld`). A card record-paid therefore needs the same card grants as a card payout. Lifting this would mean exposing the unfiltered offered types from `refund-filters/context.tsx`, and the URL method sync there validates against the filtered list. It is out of scope; say so in the PR.

- [ ] **Step 5: Type-check, lint, tests**

```bash
pnpm --filter web type-check
pnpm --filter web test:unit
cd apps/web && npx eslint "src/app/[lang]/(main)/(unirefund)/operations/refund" && cd ../..
pnpm policy:audit
```

Expected: exit 0, 0 test failures, 0 lint errors, and 0 audit violations.

- [ ] **Step 6: Commit**

```bash
git add -- packages/actions/unirefund/RefundService/post-actions.ts "apps/web/src/app/[lang]/(main)/(unirefund)/operations/refund/_components/refund-desk-grants.ts" "apps/web/src/app/[lang]/(main)/(unirefund)/operations/refund/client-page.tsx" "apps/web/src/app/[lang]/(main)/(unirefund)/operations/refund/_components/record-paid-fields.tsx" "apps/web/src/app/[lang]/(main)/(unirefund)/operations/refund/_components/refund-filters/payment-rail.tsx" apps/web/src/language-data/unirefund/TagService/resources/en.json apps/web/src/language-data/unirefund/TagService/resources/tr.json
git commit -m "feat(refund): record a refund that was already paid outside the system"
```

---

### Task 8: Gates, checks on dev, PR

**Files:** none, unless a check fails.

- [ ] **Step 1: The CI gates locally**

Run every Global Constraints CI command, plus:
- `pnpm i18n:missing --app=web`: expect NEEDS_KEY 0.
- `pnpm i18n:unused --app=web`: expect only the 5 keys that were already unreachable.

Expected: every command exits 0.

- [ ] **Step 2: Manual checks on dev**

Do these only if the machine can run a dev server. Use a detached server on a free port. If the LAN auth Redis hangs, add the `AUTH_REDIS_URL=` override from memory `long-running-dev-servers-detached`.

Sign in as the Faroe Islands `admin` (`1q2w3E*`) and check:
1. **Operations → Refund adjustments:**
   - it opens on Open
   - All, Settled and the date range filter
   - the "N open" count
2. **Acknowledge and settle,** only if dev has an Open adjustment:
   - acknowledge it
   - settle it, and check that Confirm stays disabled on a blank note
   - with no Open adjustment on dev, record this as not verified
3. **The refund detail's Adjustments tab** (Review Focus 4).
4. **The tag corrections link** opens the list filtered to that tag.
5. **The refund desk:**
   - the switch hides Cash
   - the bank transfer fields
   - a future paid date shows the error, and Record stays disabled
   - the card fields cannot take more than 6/4 digits
   - stop at the confirm dialog; **do not record** without the user's go-ahead

- [ ] **Step 3: Push and open the PR**

Run `git fetch && git rev-list --left-right --count origin/main...HEAD`. If the branch is behind, rebase onto `origin/main` and re-run Step 1.

Then:
1. `git push -u origin feat/refund-adjustments-record-paid`.
2. Open a PR against `main`. Its test plan lists the gates and every manual check run or not run, plus the card-grant limitation.
3. Wait for both checks ("Lint & Unit Tests", "Build").
4. Merge with `gh pr merge <N> --repo ayasofyazilim-clomerce/unirefund-web --merge --admin`. The user said "merge yourself" for this session's PRs.

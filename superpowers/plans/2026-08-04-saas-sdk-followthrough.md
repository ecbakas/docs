# SaaS SDK Follow-Through Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update `web-app` application code to match the SaaS SDK regenerations in `web-app@cc920baf` and `super-app@d86ed3a4` — fixing the one breaking change and adopting the five new fields/endpoints that have a real consumer.

**Architecture:** Five independent slices, each touching a different feature area. Task 1 fixes the only compile error (batch creation now requires `payoutProviderId`) and adopts the new payout-providers endpoint. Tasks 2, 3 and 5 are single-component field adoptions. Task 4 adds a new report page mirroring the existing `reports/marketing-incentive` pair.

**Tech Stack:** Next.js App Router (server components), TypeScript, `@repo/actions` server actions, `@repo/ayasofyazilim-ui` components, generated `@repo/saas` clients, JSON-file i18n with a generated type bundle.

**Spec:** `docs/superpowers/specs/2026-08-04-saas-sdk-followthrough-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **Repo:** all work is in `c:\unirefund\web-app`. Do not touch `super-app` or `pos-app`.
- **Branch:** the repo is already on `saas-update`. Stay on it.
- **Pre-existing uncommitted changes:** `git status` shows modified `packages/saas/FileService/{schemas,sdk,types}.gen.ts` from unrelated work. **Stage files explicitly by path — never `git add -A` or `git add .`, and never `git reset --hard`.**
- **Never call SDK clients from app code.** Every API call goes through a server action in `packages/actions`.
- **Action patterns:** `actions.ts` (GET) → `structuredSuccessResponse` on success, `throw structuredError(error)` in catch. `post-actions.ts` (POST) → `structuredResponse` on success, `return structuredError(error)` in catch.
- **No hardcoded user-visible strings.** Every new key goes in **both** `resources/en.json` and `resources/tr.json`.
- **i18n regeneration is mandatory and is a type-check prerequisite.** `Translations` is declared as `typeof import("./i18n/en.gen.json")` in `apps/web/src/language-data/i18n-config.ts`. That bundle is generated, so `tsc` cannot see a newly added `t.X["key"]` until you regenerate it:

  ```bash
  cd apps/web && pnpm run init
  ```

  It needs `GATEWAY_URL`, which is already present in `apps/web/.env`. The outputs `apps/web/src/language-data/i18n/{en,tr}.gen.json` are **gitignored — never commit them** (`.gitignore:150`). Note `pnpm run init` also rewrites `packages/utils/policies/policies.json`, which is *not* ignored; leave it unstaged unless a task says otherwise.
- **`data-testid` is lint-enforced** by `react-require-testid/testid-missing` on: `Label`, `Link`, `Checkbox`, `Switch`, `Button`, `Input`, `SelectTrigger`, `PopoverTrigger`, `DialogTrigger`, `DrawerTrigger`, `TabsTrigger`, `AccordionTrigger`, `CollapsibleTrigger`, and the other trigger components. Value is kebab-case, prefixed with the page/feature name. Plain HTML elements are exempt.
- **No `useEffect`** for derived state or event-driven updates. Use `useMemo` / handlers.
- **UI only from** `@repo/ayasofyazilim-ui/components/*` and `@repo/ayasofyazilim-ui/custom/*`.
- **Commit messages** end with:

  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  ```

## Testing Reality — read before starting

**There is no unit-test runner in `apps/web`.** Jest exists only in `packages/ayasofyazilim-ui` (`packages/ayasofyazilim-ui/src/test/*.test.tsx`). `apps/web`'s `pnpm test` is Playwright e2e against a **live deployed environment** with real credentials (`playwright.config.ts` projects `setup-local` / `setup-dev` / `setup-uat`, driven by `TEST_LOCAL_URL` etc.). None of the five slices below can be red-green unit-tested without first introducing a test harness to `apps/web`, which is out of this plan's scope and was not requested.

So each task's gate is the verification this repo actually supports:

```bash
# from the repo root, c:\unirefund\web-app
pnpm --filter web type-check     # tsc --noEmit
pnpm --filter web lint           # eslint, incl. the data-testid rule
```

Plus the **stated manual check** in each task. Do not claim a task complete on type-check alone when the task names a manual check.

**Baseline:** before Task 1, `pnpm --filter web type-check` reports exactly one error:

```
src/app/[lang]/(main)/(unirefund)/finance/payout-batches/_components/create-batch-dialog.tsx(70,25):
error TS2345: Argument of type '{ fileTemplateId: string; refundIds: string[]; } | { payoutProviderId: string; refundIds: string[]; }'
is not assignable to parameter of type 'UniRefund_RefundService_Batches_CreateBatchDto'.
```

Task 1 must clear it. Tasks 2–5 must keep the output empty.

## File Structure

| File | Task | Responsibility |
| --- | --- | --- |
| `packages/actions/unirefund/RefundService/actions.ts` | 1 | Add `getBatchPayoutProvidersApi` |
| `packages/actions/unirefund/RefundService/post-actions.ts` | 1 | Correct the stale `postBatchApi` doc |
| `apps/web/src/app/[lang]/(main)/(unirefund)/finance/payout-batches/page.tsx` | 1 | Fetch providers as an optional request |
| `.../finance/payout-batches/_components/table.tsx` | 1 | Thread `payoutProviders` to the dialog |
| `.../finance/payout-batches/_components/create-batch-dialog.tsx` | 1 | Provider picker replaces source+identifier |
| `apps/web/src/language-data/unirefund/RefundService/resources/{en,tr}.json` | 1 | Drop 5 dead keys, add 2 |
| `.../parties/_components/table.tsx` | 2 | Suspended badge on merchant / refund-point rows |
| `.../contracts/[contractId]/rebate-settings/_components/rebate-settings.tsx` | 3 | Rebate-type badge on saved rows |
| `packages/actions/unirefund/TagService/actions.ts` | 4 | Add `getFrontlineIncentiveReportApi` |
| `.../reports/frontline-incentive/page.tsx` | 4 | **Create** — server page, range + merchant resolution |
| `.../reports/frontline-incentive/_components/report.tsx` | 4 | **Create** — filter bar + grid |
| `apps/web/src/components/sidebar-layout/data.ts` | 4 | Nav entry |
| `apps/web/src/language-data/unirefund/TagService/resources/{en,tr}.json` | 4, 5 | Report copy; pending-card copy |
| `apps/web/src/language-data/core/AbpUiNavigation/resources/{en,tr}.json` | 4 | Nav display name |
| `.../tax-free-tags/[tagId]/_components/tag-summary-card.tsx` | 5 | Pending-payout-card indicator |

---

### Task 1: Batch creation via payout-provider picker

Fixes the only compile error. `CreateBatchDto.fileTemplateId` is gone and `payoutProviderId` is now a required `string`, so the dialog's two-way "source" choice has nothing to choose between. The new `GET /api/refund-service/batches/payout-providers` endpoint is what the file's existing TODO comment was waiting for.

**Files:**
- Modify: `packages/actions/unirefund/RefundService/actions.ts` (append to the `// --- Payout batches` section, after `getBatchableRefundsApi` which ends at line 150)
- Modify: `packages/actions/unirefund/RefundService/post-actions.ts:110-114` (doc comment only)
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/finance/payout-batches/page.tsx`
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/finance/payout-batches/_components/table.tsx`
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/finance/payout-batches/_components/create-batch-dialog.tsx`
- Modify: `apps/web/src/language-data/unirefund/RefundService/resources/en.json`
- Modify: `apps/web/src/language-data/unirefund/RefundService/resources/tr.json`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `getBatchPayoutProvidersApi(session?: Session | null)` — returns `structuredSuccessResponse` wrapping `UniRefund_RefundService_Batches_PayoutProviderListItemDto[]`. No later task depends on it.

- [ ] **Step 1: Confirm the baseline failure**

Run: `pnpm --filter web type-check`

Expected: exactly the one `create-batch-dialog.tsx(70,25)` TS2345 error quoted in "Testing Reality" above. If you see other errors, stop and report — the tree is not in the state this plan assumes.

- [ ] **Step 2: Add the GET action**

In `packages/actions/unirefund/RefundService/actions.ts`, immediately after `getBatchableRefundsApi` (which closes at line 150) and before `getBatchSummaryByIdApi`, insert:

```ts
/**
 * Payout providers selectable for a new batch: the active providers configured
 * for the current tenant, resolved from the payout orchestrator.
 *
 * An empty array is a legitimate result - a tenant that pays nothing by bank
 * file has no providers - and is distinct from a failure, which arrives as
 * UniRefund.RefundService:004012. Bounded lookup, so it is not paged.
 *
 * Requires RefundService.Batches and RefundService.Batches.ViewPayoutProviders.
 */
export async function getBatchPayoutProvidersApi(session?: Session | null) {
  try {
    const client = await getRefundServiceClient(session);
    const response =
      await client.batch.getApiRefundServiceBatchesPayoutProviders();
    return structuredSuccessResponse(response);
  } catch (error) {
    throw structuredError(error);
  }
}
```

No import changes are needed: the SDK method takes no arguments, so no new `...Data` type is referenced.

- [ ] **Step 3: Correct the stale doc on `postBatchApi`**

In `packages/actions/unirefund/RefundService/post-actions.ts`, replace the comment at lines 110-114:

```ts
/**
 * Creates a batch from eligible refunds. `CreateBatchDto` requires exactly one
 * of `fileTemplateId` or `payoutProviderId`; the caller is responsible for
 * sending only one.
 */
```

with:

```ts
/**
 * Creates a batch from eligible refunds. `payoutProviderId` is required and is
 * the only way in - RefundService resolves it to a file template at creation.
 * Enumerate the selectable values with `getBatchPayoutProvidersApi`.
 */
```

- [ ] **Step 4: Fetch the providers in the page**

In `apps/web/src/app/[lang]/(main)/(unirefund)/finance/payout-batches/page.tsx`, extend the import at lines 4-7:

```ts
import {
  getBatchableRefundsApi,
  getBatchesApi,
  getBatchPayoutProvidersApi,
} from "@repo/actions/unirefund/RefundService/actions";
```

Replace the `optionalRequests` block (lines 19-23):

```ts
    // Optional: needs `Batches.ViewEligibleRefunds`, which a read-only role may
    // not have. Without it the create dialog simply isn't offered.
    const optionalRequests = await Promise.allSettled([
      getBatchableRefundsApi({ maxResultCount: 100 }, session),
    ]);
```

with:

```ts
    // Both optional, for the same reason the dialog must degrade rather than the
    // page: `Batches.ViewEligibleRefunds` / `Batches.ViewPayoutProviders` may be
    // missing from a read-only role, and a providers lookup can also fail with
    // UniRefund.RefundService:004012 when the payout orchestrator is unreachable.
    // Neither should blank the batch list.
    const optionalRequests = await Promise.allSettled([
      getBatchableRefundsApi({ maxResultCount: 100 }, session),
      getBatchPayoutProvidersApi(session),
    ]);
```

Then replace lines 52-57:

```ts
  const [batchableResult] = apiRequests.optionalRequests;
  const batchableRefunds =
    batchableResult.status === "fulfilled" &&
    batchableResult.value.type === "success"
      ? batchableResult.value.data.items ?? []
      : [];
```

with:

```ts
  const [batchableResult, payoutProvidersResult] = apiRequests.optionalRequests;
  const batchableRefunds =
    batchableResult.status === "fulfilled" &&
    batchableResult.value.type === "success"
      ? batchableResult.value.data.items ?? []
      : [];
  const payoutProviders =
    payoutProvidersResult.status === "fulfilled" &&
    payoutProvidersResult.value.type === "success"
      ? payoutProvidersResult.value.data
      : [];
```

`Promise.allSettled` over an array literal produces a tuple type, so each destructured element keeps its own precise type — no casts needed.

Finally pass it through (lines 59-64):

```tsx
  return (
    <BatchesTable
      response={batchesResponse.data}
      batchableRefunds={batchableRefunds}
      payoutProviders={payoutProviders}
    />
  );
```

- [ ] **Step 5: Thread the prop through the table**

In `.../payout-batches/_components/table.tsx`, extend the type import at lines 11-15:

```ts
import {
  $UniRefund_RefundService_Batches_BatchDto as $BatchDto,
  type PagedResultDto_BatchDto,
  type UniRefund_RefundService_Batches_BatchRefundListItemDto as BatchRefundListItemDto,
  type UniRefund_RefundService_Batches_PayoutProviderListItemDto as PayoutProviderListItemDto,
} from "@repo/saas/RefundService";
```

Change the signature (lines 20-26):

```tsx
export function BatchesTable({
  response,
  batchableRefunds,
  payoutProviders,
}: {
  response: PagedResultDto_BatchDto;
  batchableRefunds: BatchRefundListItemDto[];
  payoutProviders: PayoutProviderListItemDto[];
}) {
```

And the dialog render (lines 121-126):

```tsx
                children: ({ close }) => (
                  <CreateBatchDialog
                    refunds={batchableRefunds}
                    payoutProviders={payoutProviders}
                    onDone={close}
                  />
                ),
```

- [ ] **Step 6: Replace the dialog's source picker with a provider picker**

Overwrite `.../payout-batches/_components/create-batch-dialog.tsx` entirely:

```tsx
"use client";

import { useTranslations } from "@/src/providers/i18n";
import { postBatchApi } from "@repo/actions/unirefund/RefundService/post-actions";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import { Checkbox } from "@repo/ayasofyazilim-ui/components/checkbox";
import { Label } from "@repo/ayasofyazilim-ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ayasofyazilim-ui/components/select";
import { Separator } from "@repo/ayasofyazilim-ui/components/separator";
import { toast } from "@repo/ayasofyazilim-ui/components/sonner";
import type {
  UniRefund_RefundService_Batches_BatchRefundListItemDto as BatchRefundListItemDto,
  UniRefund_RefundService_Batches_PayoutProviderListItemDto as PayoutProviderListItemDto,
} from "@repo/saas/RefundService";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * `payoutProviderId` is the only way to create a batch - RefundService resolves
 * it to a file template at creation - so the provider list is the whole choice.
 * The free-text identifier this dialog used to carry is gone with
 * `CreateBatchDto.fileTemplateId`.
 *
 * `code` exists to disambiguate two providers that share a display name, so it
 * is appended to the option label rather than dropped.
 */
function providerLabel(provider: PayoutProviderListItemDto) {
  return provider.code ? `${provider.name} (${provider.code})` : provider.name;
}

export function CreateBatchDialog({
  refunds,
  payoutProviders,
  onDone,
}: {
  refunds: BatchRefundListItemDto[];
  payoutProviders: PayoutProviderListItemDto[];
  onDone: () => void;
}) {
  const { t } = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [payoutProviderId, setPayoutProviderId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // An empty provider list is a legitimate result, not an error: a tenant that
  // pays nothing by bank file has no providers. So it disables the create rather
  // than surfacing as a failure.
  const hasProviders = payoutProviders.length > 0;

  function toggle(refundId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(refundId)) {
        next.delete(refundId);
      } else {
        next.add(refundId);
      }
      return next;
    });
  }

  function submit() {
    if (selected.size === 0) {
      toast.error(t.RefundService["Batches.SelectRefunds"]);
      return;
    }
    if (!payoutProviderId) {
      toast.error(t.RefundService["Batches.PayoutProviderRequired"]);
      return;
    }
    startTransition(() => {
      void postBatchApi({
        refundIds: [...selected],
        payoutProviderId,
      }).then((response) => {
        if (response.type !== "success") {
          toast.error(response.message);
          return;
        }
        // Per-item failures come back as result entries rather than an error, so
        // surface them instead of reporting a clean success.
        const failed = (response.data.results ?? []).filter(
          (result) => !result.succeeded
        );
        if (failed.length > 0) {
          toast.warning(
            t.RefundService["Batches.PartialFailures"].replace(
              "{0}",
              String(failed.length)
            )
          );
        } else {
          toast.success(t.RefundService["Batches.Created"]);
        }
        onDone();
        router.refresh();
      });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2">
        <Label
          htmlFor="batch-payout-provider"
          data-testid="batch-payout-provider-label"
        >
          {t.RefundService["Batches.payoutProviderId"]}
        </Label>
        {hasProviders ? (
          <Select value={payoutProviderId} onValueChange={setPayoutProviderId}>
            <SelectTrigger
              id="batch-payout-provider"
              className="w-full"
              disabled={isPending}
              data-testid="batch-payout-provider"
            >
              <SelectValue placeholder={t.Default["Select.Placeholder"]} />
            </SelectTrigger>
            <SelectContent>
              {payoutProviders.map((provider) => (
                <SelectItem key={provider.id} value={provider.id ?? ""}>
                  {providerLabel(provider)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t.RefundService["Batches.NoPayoutProviders"]}
          </p>
        )}
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium">
            {t.RefundService["Batches.EligibleRefunds"]}
          </p>
          <span className="text-muted-foreground text-xs tabular-nums">
            {t.RefundService["Batches.SelectedCount"].replace(
              "{0}",
              String(selected.size)
            )}
          </span>
        </div>
        {refunds.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t.RefundService["Batches.NoEligibleRefunds"]}
          </p>
        ) : (
          <div className="max-h-64 overflow-y-auto rounded-md border">
            {refunds.map((refund) => (
              <Label
                key={refund.refundId}
                htmlFor={`batch-refund-${refund.refundId}`}
                className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0"
                data-testid={`batch-refund-label-${refund.refundId}`}
              >
                <Checkbox
                  id={`batch-refund-${refund.refundId}`}
                  checked={selected.has(refund.refundId ?? "")}
                  onCheckedChange={() => toggle(refund.refundId ?? "")}
                  disabled={isPending}
                  data-testid={`batch-refund-${refund.refundId}`}
                />
                <span className="flex-1 truncate">
                  {refund.referenceNumber}
                </span>
                <span className="font-mono text-xs">
                  {refund.maskedCardNumber}
                </span>
                <span className="tabular-nums">
                  {refund.amount} {refund.currency}
                </span>
              </Label>
            ))}
          </div>
        )}
      </div>

      <Button
        onClick={submit}
        disabled={isPending || refunds.length === 0 || !hasProviders}
        data-testid="batch-create-submit"
      >
        {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
        {t.RefundService["Batches.Create"]}
      </Button>
    </div>
  );
}
```

- [ ] **Step 7: Update the RefundService i18n keys**

In `apps/web/src/language-data/unirefund/RefundService/resources/en.json`, **delete** these five lines (currently 90-94):

```json
  "Batches.Source": "Create from",
  "Batches.Source.FileTemplate": "File template",
  "Batches.Source.PayoutProvider": "Payout provider",
  "Batches.SourceId": "Identifier",
  "Batches.SourceIdRequired": "Enter the identifier for the selected source.",
```

and in their place add:

```json
  "Batches.PayoutProviderRequired": "Select a payout provider.",
  "Batches.NoPayoutProviders": "No payout providers are configured for this tenant.",
```

Do the same in `tr.json` — delete the five matching `Batches.Source*` keys and add:

```json
  "Batches.PayoutProviderRequired": "Bir ödeme sağlayıcısı seçin.",
  "Batches.NoPayoutProviders": "Bu kiracı için tanımlı ödeme sağlayıcısı yok.",
```

Leave `Batches.fileTemplateId` and `Batches.fileTemplateVersion` alone — `BatchDto` still carries those fields; only `CreateBatchDto` lost `fileTemplateId`.

- [ ] **Step 8: Regenerate the i18n bundle**

Run: `cd apps/web && pnpm run init`

Expected: prints `Processing resource: ...` lines and exits 0. This rewrites the gitignored `src/language-data/i18n/{en,tr}.gen.json` so `tsc` can see `Batches.PayoutProviderRequired` and `Batches.NoPayoutProviders`, and can no longer see the deleted `Batches.Source*` keys.

- [ ] **Step 9: Verify type-check and lint are clean**

Run: `pnpm --filter web type-check`
Expected: no output. In particular the baseline `create-batch-dialog.tsx(70,25)` error is gone.

Run: `pnpm --filter web lint`
Expected: no errors. If `react-require-testid/testid-missing` fires, the `SelectTrigger` or a `Label` is missing its `data-testid`.

- [ ] **Step 10: Manual check**

Start the app (`cd apps/web && pnpm dev`) and open `/en/finance/payout-batches`. Confirm:
- The create-batch dialog shows a **provider dropdown**, not a free-text identifier, and no "Create from" selector.
- Options read `Name (CODE)` where a code exists.
- With no provider chosen, clicking create toasts "Select a payout provider."
- The batch list still renders (it must not error) — this is what the `allSettled` change protects.

- [ ] **Step 11: Commit**

```bash
git add packages/actions/unirefund/RefundService/actions.ts \
        packages/actions/unirefund/RefundService/post-actions.ts \
        "apps/web/src/app/[lang]/(main)/(unirefund)/finance/payout-batches/page.tsx" \
        "apps/web/src/app/[lang]/(main)/(unirefund)/finance/payout-batches/_components/table.tsx" \
        "apps/web/src/app/[lang]/(main)/(unirefund)/finance/payout-batches/_components/create-batch-dialog.tsx" \
        apps/web/src/language-data/unirefund/RefundService/resources/en.json \
        apps/web/src/language-data/unirefund/RefundService/resources/tr.json
git commit -m "$(cat <<'EOF'
feat(payout-batches): pick a payout provider instead of typing an id

CreateBatchDto dropped fileTemplateId and made payoutProviderId required, and
the new batches/payout-providers endpoint is what this dialog's TODO waited on.
The providers lookup is an optional request: it is permission-gated and can fail
with 004012 when the orchestrator is unreachable, neither of which should blank
the batch list.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Suspended badge on the party lists

`MerchantListResponseDto` and `RefundPointListResponseDto` gained `isSuspended: boolean`, documented as exposed on the list so a badge can render without a detail call per row. The suspension i18n keys already exist; only the list affordance is missing.

**Files:**
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/parties/_components/table.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the field to the row shape**

In `parties/_components/table.tsx`, extend `PartyListItem` (lines 59-70) by adding a final member:

```ts
interface PartyListItem {
  id?: string;
  name?: string | null;
  typeCode?: string;
  status?: UniRefund_CRMService_Merchants_MerchantStatus;
  parentId?: string | null;
  parentName?: string | null;
  externalIdentifier?: string | null;
  vatNumber?: string | null;
  // Refund points only - see PartyConfig.hasPayoutFacilitator.
  payoutFacilitatorTenantId?: string | null;
  /**
   * Merchants and refund points only. Independent of `status`, so it renders as
   * an additional badge rather than replacing the status one. The other four
   * party DTOs never set it, so no per-type config is needed.
   */
  isSuspended?: boolean;
}
```

- [ ] **Step 2: Import `Badge`**

Add to the imports at the top of the file, after the `Button` import on line 5:

```ts
import { Badge } from "@repo/ayasofyazilim-ui/components/badge";
```

- [ ] **Step 3: Render the badge in the name cell**

Replace the `name` custom renderer (lines 249-263):

```tsx
          name: ({ row }) => {
            const hasGrant = isActionGranted(
              config.viewPolicies,
              grantedPolicies
            );
            return (
              <RowLink
                href={`/${lang}/parties/${config.path}/${row.original.id}/${detailsLink}`}
                label={row.original.name}
                linkCondition={hasGrant}
              >
                <StatusBadge t={t} status={row.original.status!} />
              </RowLink>
            );
          },
```

with:

```tsx
          name: ({ row }) => {
            const hasGrant = isActionGranted(
              config.viewPolicies,
              grantedPolicies
            );
            return (
              <RowLink
                href={`/${lang}/parties/${config.path}/${row.original.id}/${detailsLink}`}
                label={row.original.name}
                linkCondition={hasGrant}
              >
                <StatusBadge t={t} status={row.original.status!} />
                {row.original.isSuspended ? (
                  <Badge variant="destructive">
                    {t.CRMService["CRM.Suspension.Suspended"]}
                  </Badge>
                ) : null}
              </RowLink>
            );
          },
```

- [ ] **Step 4: Verify type-check and lint**

Run: `pnpm --filter web type-check`
Expected: no output.

Run: `pnpm --filter web lint`
Expected: no errors. `Badge` is not on the `data-testid` required list, so none is needed.

No `pnpm run init` is needed for this task — `CRM.Suspension.Suspended` already exists in the bundle.

- [ ] **Step 5: Manual check**

Open `/en/parties/merchants` and `/en/parties/refund-points`. A suspended party shows **both** its status badge and a red "Suspended" badge. Open `/en/parties/tax-offices` and confirm no suspended badge appears anywhere (the field is absent from that DTO).

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/[lang]/(main)/(unirefund)/parties/_components/table.tsx"
git commit -m "$(cat <<'EOF'
feat(parties): badge suspended merchants and refund points in the list

Both list DTOs now carry isSuspended precisely so the badge needs no detail call
per row. It is independent of status, so it renders alongside rather than instead.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Rebate type badge on saved rebate-setting rows

`rebateType` was added **only** to `RebateSettingDto.rebateTableHeaders[]` (the saved assignments). The combobox is fed by the assignables endpoint, whose DTO is `{ id, name, isTemplate }` and has no `rebateType`. So a saved row can show its type and a freshly added row cannot — an accepted asymmetry, recorded in the spec.

`Combobox`'s `badges` prop is typed `Partial<Record<keyof T, ComboboxBadgeOptions<T>>>`, so the badge key must be a key of the widget's item type. That is why the list is mapped to a widened local type rather than keying the badge off an unrelated field.

**Files:**
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/parties/merchants/[partyId]/contracts/[contractId]/rebate-settings/_components/rebate-settings.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Import the rebate-type enum type**

In `rebate-settings.tsx`, extend the `@repo/saas/ContractService` import block (lines 3-8):

```ts
import {
  $UniRefund_ContractService_Rebates_RebateSettings_RebateSettingUpSertDto as $RebateSettingUpSertDto,
  type UniRefund_ContractService_Enums_RebateType as RebateType,
  type UniRefund_ContractService_Rebates_RebateTableHeaders_RebateTableHeaderInformationDto as AssignableRebateTableHeaders,
  type UniRefund_ContractService_Rebates_RebateSettings_RebateSettingDto as RebateSettingDto,
  type UniRefund_ContractService_Rebates_RebateSettings_RebateSettingUpSertDto as RebateSettingUpSertDto,
} from "@repo/saas/ContractService";
```

- [ ] **Step 2: Widen the assignables list with the saved rebate types**

Add this type alias just above the `RebateSettings` component (before line 25, `export function RebateSettings({`):

```ts
/**
 * The assignables endpoint returns `{ id, name, isTemplate }` - no rebate type.
 * The type is only known for tables already saved on this rebate setting, so it
 * is folded in from there and left undefined for the rest. `Combobox`'s `badges`
 * prop is keyed by `keyof T`, which is why the field has to exist on the item
 * type rather than being looked up inside the label callback.
 */
type AssignableWithRebateType = AssignableRebateTableHeaders & {
  rebateType?: RebateType;
};
```

Then inside the component, after the `hasEditPermission` block (currently lines 82-85) and before `isFormReady`, add:

```ts
  const savedRebateTypeById = useMemo(
    () =>
      new Map(
        (rebateSettings?.rebateTableHeaders ?? []).map(
          // `as const` so this infers as a tuple, not `(string | RebateType)[]` -
          // the Map constructor rejects the latter.
          (header) => [header.id, header.rebateType] as const
        )
      ),
    [rebateSettings]
  );

  const rebateTableHeaderOptions = useMemo<AssignableWithRebateType[]>(
    () =>
      rebateTableHeaders.map((header) => ({
        ...header,
        rebateType: savedRebateTypeById.get(header.id),
      })),
    [rebateTableHeaders, savedRebateTypeById]
  );
```

Update the React import on line 20 from:

```ts
import { useTransition } from "react";
```

to:

```ts
import { useMemo, useTransition } from "react";
```

- [ ] **Step 3: Point the widget at the widened list and add the badge**

Replace the `rebateTableHeader` widget (lines 156-174):

```tsx
          rebateTableHeader: CustomComboboxWidget<AssignableRebateTableHeaders>(
            {
              list: rebateTableHeaders,
              languageData,
              selectIdentifier: "id",
              selectLabel: "name",
              link: {
                name: {
                  condition: () =>
                    isActionGranted(
                      ["ContractService.RebateTableHeader.ViewDetail"],
                      grantedPolicies
                    ),
                  linkBuilder: (item) =>
                    `/${lang}/settings/templates/rebate-tables/${item.id}`,
                },
              },
            }
          ),
```

with:

```tsx
          rebateTableHeader: CustomComboboxWidget<AssignableWithRebateType>({
            list: rebateTableHeaderOptions,
            languageData,
            selectIdentifier: "id",
            selectLabel: "name",
            badges: {
              rebateType: {
                label: (item) =>
                  item.rebateType
                    ? languageData[
                        `RebateTable.Form.rebateType.${item.rebateType}`
                      ]
                    : null,
              },
            },
            link: {
              name: {
                condition: () =>
                  isActionGranted(
                    ["ContractService.RebateTableHeader.ViewDetail"],
                    grantedPolicies
                  ),
                linkBuilder: (item) =>
                  `/${lang}/settings/templates/rebate-tables/${item.id}`,
              },
            },
          }),
```

The label keys `RebateTable.Form.rebateType.MerchantRebate`, `.FrontlineIncentive` and `.MarketingIncentive` already exist in the ContractService resources — no new i18n and no `pnpm run init`.

- [ ] **Step 4: Verify type-check and lint**

Run: `pnpm --filter web type-check`
Expected: no output. If the `languageData[...]` index errors, the template-literal key is not resolving against `ContractServiceResource` — confirm all three `RebateTable.Form.rebateType.*` keys are present in `apps/web/src/language-data/unirefund/ContractService/resources/en.json`.

Run: `pnpm --filter web lint`
Expected: no errors.

- [ ] **Step 5: Manual check**

Open a merchant contract's rebate settings at
`/en/parties/merchants/<partyId>/contracts/<contractId>/rebate-settings` for a merchant that already has a saved rebate setting. Each saved rebate-table row's combobox shows a rebate-type badge. Add a new row: it shows no badge until saved.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/[lang]/(main)/(unirefund)/parties/merchants/[partyId]/contracts/[contractId]/rebate-settings/_components/rebate-settings.tsx"
git commit -m "$(cat <<'EOF'
feat(rebate-settings): show the rebate type on saved rebate-table rows

rebateType landed on the saved assignments inside RebateSettingDto, not on the
assignables the picker reads, so the type is folded into the option list from the
saved setting and a not-yet-saved row shows no badge.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Frontline Incentive report page

The report has never had a client. This commit makes it worth building: `salesPersonName` is now resolved from CRM server-side, and `fromDate` / `toDate` / `merchantId` became required — so unlike the marketing report, this page cannot load unfiltered.

**Files:**
- Modify: `packages/actions/unirefund/TagService/actions.ts` (append after `getMarketingIncentiveReportApi`, which closes at line 291)
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/reports/frontline-incentive/page.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/reports/frontline-incentive/_components/report.tsx`
- Modify: `apps/web/src/components/sidebar-layout/data.ts` (after the `reports/marketing-incentive` entry, lines 938-944)
- Modify: `apps/web/src/language-data/unirefund/TagService/resources/{en,tr}.json`
- Modify: `apps/web/src/language-data/core/AbpUiNavigation/resources/{en,tr}.json`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `getFrontlineIncentiveReportApi(data: GetApiTagServiceTagReportsFrontlineIncentiveData, session?: Session | null)` and `FrontlineIncentiveReport({ items, range, merchant })`. Nothing later consumes them.

- [ ] **Step 1: Add the GET action**

In `packages/actions/unirefund/TagService/actions.ts`, add `GetApiTagServiceTagReportsFrontlineIncentiveData` to the type import block (alphabetically before `GetApiTagServiceTagReportsMarketingIncentiveData` on line 11):

```ts
  GetApiTagServiceTagReportsFrontlineIncentiveData,
  GetApiTagServiceTagReportsMarketingIncentiveData,
```

Then append after `getMarketingIncentiveReportApi` (which closes at line 291):

```ts
/**
 * Frontline-incentive report, grouped by sales person and currency, with the
 * sales person's name resolved from CRM.
 *
 * `fromDate`, `toDate` and `merchantId` are all required - there is no
 * unfiltered form of this report. Amounts in different currencies are never
 * summed, so one individual with tags in two currencies gets two rows.
 * Requires TagService.Reports.FrontlineIncentive.
 */
export async function getFrontlineIncentiveReportApi(
  data: GetApiTagServiceTagReportsFrontlineIncentiveData,
  session?: Session | null
) {
  try {
    const client = await getTagServiceClient(session);
    const response =
      await client.tag.getApiTagServiceTagReportsFrontlineIncentive(data);
    return structuredSuccessResponse(response);
  } catch (error) {
    throw structuredError(error);
  }
}
```

- [ ] **Step 2: Add the i18n keys**

In `apps/web/src/language-data/unirefund/TagService/resources/en.json`, add after the `MarketingIncentiveReport.Empty` line (currently 721):

```json
  "FrontlineIncentiveReport": "Frontline incentive report",
  "FrontlineIncentiveReport.Description": "Tag counts and incentive amounts grouped by sales person and currency.",
  "FrontlineIncentiveReport.salesPersonName": "Sales person",
  "FrontlineIncentiveReport.tagCount": "Tags",
  "FrontlineIncentiveReport.proportionalAmount": "Incentive amount",
  "FrontlineIncentiveReport.currency": "Currency",
  "FrontlineIncentiveReport.FromDate": "From",
  "FrontlineIncentiveReport.ToDate": "To",
  "FrontlineIncentiveReport.Empty": "No data for the selected merchant and period.",
  "FrontlineIncentiveReport.SelectMerchant": "Select a merchant to run the report.",
  "FrontlineIncentiveReport.Unattributed": "Unattributed",
```

And the matching block in `tr.json`:

```json
  "FrontlineIncentiveReport": "Satış temsilcisi teşvik raporu",
  "FrontlineIncentiveReport.Description": "Satış temsilcisi ve para birimine göre gruplanmış etiket sayıları ve teşvik tutarları.",
  "FrontlineIncentiveReport.salesPersonName": "Satış temsilcisi",
  "FrontlineIncentiveReport.tagCount": "Etiket",
  "FrontlineIncentiveReport.proportionalAmount": "Teşvik tutarı",
  "FrontlineIncentiveReport.currency": "Para birimi",
  "FrontlineIncentiveReport.FromDate": "Başlangıç",
  "FrontlineIncentiveReport.ToDate": "Bitiş",
  "FrontlineIncentiveReport.Empty": "Seçilen mağaza ve dönem için veri yok.",
  "FrontlineIncentiveReport.SelectMerchant": "Raporu çalıştırmak için bir mağaza seçin.",
  "FrontlineIncentiveReport.Unattributed": "Atanmamış",
```

In `apps/web/src/language-data/core/AbpUiNavigation/resources/en.json`, the last entry is `"MarketingIncentiveReport": "Marketing Incentive"` with no trailing comma. Add a comma to it and append:

```json
  "MarketingIncentiveReport": "Marketing Incentive",
  "FrontlineIncentiveReport": "Frontline Incentive"
```

Same in `tr.json`:

```json
  "MarketingIncentiveReport": "Pazarlama Teşviki",
  "FrontlineIncentiveReport": "Satış Temsilcisi Teşviki"
```

- [ ] **Step 3: Regenerate the i18n bundle**

Run: `cd apps/web && pnpm run init`

Expected: exits 0. Without this, every `t.TagService["FrontlineIncentiveReport..."]` in the next steps is a type error.

- [ ] **Step 4: Create the report component**

Create `apps/web/src/app/[lang]/(main)/(unirefund)/reports/frontline-incentive/_components/report.tsx`:

```tsx
"use client";

import {
  MerchantSelector,
  type SelectableMerchant,
} from "@/components/tag-form/merchant-selector";
import { useTenant } from "@/providers/tenant";
import { useTranslations } from "@/src/providers/i18n";
import { searchMerchants } from "@repo/actions/unirefund/CRMService/search";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import { Input } from "@repo/ayasofyazilim-ui/components/input";
import { Label } from "@repo/ayasofyazilim-ui/components/label";
import { MasterDataGrid } from "@repo/ayasofyazilim-ui/custom/master-data-grid";
import {
  $UniRefund_TagService_Tags_FrontlineIncentiveReportItem as $FrontlineIncentiveReportItem,
  type UniRefund_TagService_Tags_FrontlineIncentiveReportItem as FrontlineIncentiveReportItem,
} from "@repo/saas/TagService";
import { Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Frontline incentive is grouped by sales person *and* currency - amounts in
 * different currencies are never summed - so currency is a column, not a
 * page-level heading.
 *
 * Unlike the marketing report, `merchantId` is required by the API, so there is
 * no unfiltered view: with no merchant picked the page does not query at all.
 */
export function FrontlineIncentiveReport({
  items,
  range,
  merchant: initialMerchant,
}: {
  items: FrontlineIncentiveReportItem[];
  range: { fromDate: string; toDate: string };
  merchant: { id: string; name: string } | null;
}) {
  const { localization } = useTenant();
  const { t } = useTranslations();
  const router = useRouter();
  const pathname = usePathname();

  const [fromDate, setFromDate] = useState(range.fromDate);
  const [toDate, setToDate] = useState(range.toDate);
  const [merchant, setMerchant] = useState<SelectableMerchant | null>(
    initialMerchant
  );

  function applyFilters() {
    const params = new URLSearchParams({ fromDate, toDate });
    if (merchant?.id) {
      params.set("merchantId", merchant.id);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">
          {t.TagService["FrontlineIncentiveReport"]}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t.TagService["FrontlineIncentiveReport.Description"]}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
        <MerchantSelector<SelectableMerchant>
          mode="select"
          testId="frontline-report-merchant"
          fetchAction={searchMerchants}
          value={merchant}
          onChange={setMerchant}
        />
        <div className="grid gap-1">
          <Label
            htmlFor="frontline-report-from-date"
            className="text-xs"
            data-testid="frontline-report-from-date-label"
          >
            {t.TagService["FrontlineIncentiveReport.FromDate"]}
          </Label>
          <Input
            id="frontline-report-from-date"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            data-testid="frontline-report-from-date"
          />
        </div>
        <div className="grid gap-1">
          <Label
            htmlFor="frontline-report-to-date"
            className="text-xs"
            data-testid="frontline-report-to-date-label"
          >
            {t.TagService["FrontlineIncentiveReport.ToDate"]}
          </Label>
          <Input
            id="frontline-report-to-date"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            data-testid="frontline-report-to-date"
          />
        </div>
        <Button
          onClick={applyFilters}
          data-testid="frontline-report-apply"
          size="sm"
        >
          <Search className="size-4" />
          {t.Default.Search}
        </Button>
      </div>

      {!initialMerchant ? (
        <p className="text-muted-foreground text-sm">
          {t.TagService["FrontlineIncentiveReport.SelectMerchant"]}
        </p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t.TagService["FrontlineIncentiveReport.Empty"]}
        </p>
      ) : (
        <MasterDataGrid<FrontlineIncentiveReportItem>
          data={items}
          config={{
            localization,
            rowCount: items.length,
            schema: $FrontlineIncentiveReportItem,
            schemaColumns: {
              mode: "include",
              sort: true,
              columns: [
                "salesPersonName",
                "tagCount",
                "proportionalAmount",
                "currency",
              ],
            },
            t: {
              ...t.Default,
              "column.salesPersonName":
                t.TagService["FrontlineIncentiveReport.salesPersonName"],
              "column.tagCount":
                t.TagService["FrontlineIncentiveReport.tagCount"],
              "column.proportionalAmount":
                t.TagService["FrontlineIncentiveReport.proportionalAmount"],
              "column.currency":
                t.TagService["FrontlineIncentiveReport.currency"],
            },
            customRenderers: {
              // Two different nulls, deliberately rendered differently: a null
              // individualId is the unattributed bucket, while a null name on a
              // real individual means CRM could not resolve them (no longer
              // affiliated, or hidden by RLS). The name is cosmetic - the report
              // never fails over a missing one.
              salesPersonName: ({ row }) => {
                const { individualId, salesPersonName } = row.original;
                if (!individualId) {
                  return (
                    <span className="text-muted-foreground italic">
                      {t.TagService["FrontlineIncentiveReport.Unattributed"]}
                    </span>
                  );
                }
                if (!salesPersonName) {
                  return <span className="text-muted-foreground">—</span>;
                }
                return salesPersonName;
              },
            },
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create the server page**

Create `apps/web/src/app/[lang]/(main)/(unirefund)/reports/frontline-incentive/page.tsx`:

```tsx
"use server";

import { getTranslations } from "@/src/language-data/get-translations";
import { getMerchantByIdApi } from "@repo/actions/unirefund/CRMService/actions";
import { getFrontlineIncentiveReportApi } from "@repo/actions/unirefund/TagService/actions";
import ErrorComponent from "@repo/ui/components/error-component";
import { structuredError } from "@repo/utils/api";
import { auth } from "@repo/utils/auth/next-auth";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { FrontlineIncentiveReport } from "./_components/report";

type SearchParams = {
  fromDate?: string;
  toDate?: string;
  merchantId?: string;
};

/** Defaults to the current month, matching the marketing-incentive report. */
function resolveRange(search: SearchParams) {
  if (search.fromDate && search.toDate) {
    return { fromDate: search.fromDate, toDate: search.toDate };
  }
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    fromDate: search.fromDate ?? first.toISOString().slice(0, 10),
    toDate: search.toDate ?? now.toISOString().slice(0, 10),
  };
}

async function getApiRequests(search: SearchParams) {
  try {
    const session = await auth();
    const range = resolveRange(search);

    // `merchantId` is required by the report, so with none picked there is
    // nothing to ask for. Defaulting to some merchant would present one store's
    // numbers as though they answered the question the operator asked.
    if (!search.merchantId) {
      return { items: [], range, merchant: null };
    }

    const [reportResponse] = await Promise.all([
      getFrontlineIncentiveReportApi(
        { ...range, merchantId: search.merchantId },
        session
      ),
    ]);

    // Only to label the picker on a reloaded URL; a failure here must not cost
    // the operator their report.
    const [merchantResult] = await Promise.allSettled([
      getMerchantByIdApi(search.merchantId, session),
    ]);
    const merchant =
      merchantResult.status === "fulfilled" &&
      merchantResult.value.type === "success"
        ? {
            id: search.merchantId,
            name: merchantResult.value.data.name,
          }
        : { id: search.merchantId, name: search.merchantId };

    return { items: reportResponse.data, range, merchant };
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
  const search = await searchParams;
  const t = await getTranslations(lang);

  const apiRequests = await getApiRequests(search);
  if ("message" in apiRequests) {
    return (
      <ErrorComponent languageData={t.Default} message={apiRequests.message} />
    );
  }

  return (
    <FrontlineIncentiveReport
      items={apiRequests.items}
      range={apiRequests.range}
      merchant={apiRequests.merchant}
    />
  );
}
```

- [ ] **Step 6: Register the nav entry**

In `apps/web/src/components/sidebar-layout/data.ts`, immediately after the `reports/marketing-incentive` entry (which closes at line 944, before the `reports/report-definitions` entry), insert:

```ts
      {
        key: "reports/frontline-incentive",
        displayName: "FrontlineIncentiveReport",
        href: "reports/frontline-incentive",
        icon: "Users",
        policies: ["TagService.Reports.FrontlineIncentive"],
      },
```

- [ ] **Step 7: Verify type-check and lint**

Run: `pnpm --filter web type-check`
Expected: no output.

Two likely failures and their causes:
- `Property 'FrontlineIncentiveReport' does not exist` on `t.TagService` — Step 3 (`pnpm run init`) was skipped or failed.
- A `fetchAction` mismatch on `MerchantSelector` — `searchMerchants` returns a wider merchant type, which is assignable to `SelectableMerchant`; if it complains, confirm `searchMerchants` is imported from `@repo/actions/unirefund/CRMService/search` (a `"use server"` module) and not re-wrapped.

Run: `pnpm --filter web lint`
Expected: no errors.

- [ ] **Step 8: Manual check**

Open `/en/reports/frontline-incentive`:
- With no merchant in the URL, the grid is absent and "Select a merchant to run the report." shows. Confirm via the browser network tab that **no report request was made**.
- Pick a merchant, press Search: the URL gains `merchantId`, and rows appear grouped per person and currency.
- Reload that URL: the merchant picker still shows the merchant's name.
- If the data has one, confirm an unattributed row renders as italic "Unattributed" rather than blank.
- Confirm the sidebar shows the "Frontline Incentive" entry for a user holding `TagService.Reports.FrontlineIncentive`.

- [ ] **Step 9: Commit**

```bash
git add packages/actions/unirefund/TagService/actions.ts \
        "apps/web/src/app/[lang]/(main)/(unirefund)/reports/frontline-incentive" \
        apps/web/src/components/sidebar-layout/data.ts \
        apps/web/src/language-data/unirefund/TagService/resources/en.json \
        apps/web/src/language-data/unirefund/TagService/resources/tr.json \
        apps/web/src/language-data/core/AbpUiNavigation/resources/en.json \
        apps/web/src/language-data/core/AbpUiNavigation/resources/tr.json
git commit -m "$(cat <<'EOF'
feat(reports): add the frontline incentive report

The report now resolves the sales person's name from CRM, which makes it worth a
page. merchantId became required, so with no merchant picked the page renders a
prompt instead of querying - defaulting to some merchant would pass one store's
numbers off as the answer.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Pending payout card indicator on tag detail

`TagDto` / `TagDetailDto` gained `pendingPayoutCardId`: a card saved at the POS while the tag was still a draft, before any traveller was known.

**The obvious placement is wrong.** The existing payout-card row lives in `TravellerDetailsCard`, which returns early — `AssignTraveller` or `null` — when the tag has no traveller (`traveller-card.tsx:38-48`). No-traveller is exactly the state this field describes, so a row added there would never render for the case it exists to cover. It goes on `TagSummaryCard`, which always renders.

The visibility condition uses `!tagDetail.payoutTokenId` rather than the resolved `payoutToken` object: `payoutTokenId` is on the DTO already, so `TagSummaryCard` needs no new prop, and it stays correct even when the traveller-cards lookup that resolves the masked card fails.

There is no client endpoint for `PendingPayoutCards` — the new DTOs are cross-service inputs — so this is a presence indicator only, with no masked number.

**Files:**
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/tax-free-tags/[tagId]/_components/tag-summary-card.tsx`
- Modify: `apps/web/src/language-data/unirefund/TagService/resources/{en,tr}.json`

**Interfaces:**
- Consumes: nothing. (Independent of Task 4 despite both touching the TagService resource files — if both tasks run, re-run `pnpm run init` after the second one.)
- Produces: nothing.

- [ ] **Step 1: Add the i18n keys**

In `apps/web/src/language-data/unirefund/TagService/resources/en.json`, add after the `PayoutToken.RequiresTraveller` line (currently 695):

```json
  "PayoutToken.PendingCard": "Card saved at POS",
  "PayoutToken.PendingCardDescription": "A payout card was saved for this tag before a traveller was known. It is claimed into the traveller's own card once one is assigned.",
```

And in `tr.json`:

```json
  "PayoutToken.PendingCard": "POS'ta kaydedilmiş kart",
  "PayoutToken.PendingCardDescription": "Bu etiket için yolcu bilgisi girilmeden önce bir ödeme kartı kaydedildi. Bir yolcu atandığında kart o yolcunun kartına aktarılır.",
```

- [ ] **Step 2: Regenerate the i18n bundle**

Run: `cd apps/web && pnpm run init`

Expected: exits 0.

Note: `TagSummaryCard` reads copy from its `languageData` prop (typed `TagServiceResource`, which is `typeof en.json`), not from `useTranslations()`. So the JSON edit alone types this task's keys. Run `init` anyway to keep the bundle consistent with the JSON files.

- [ ] **Step 3: Render the indicator**

In `tag-summary-card.tsx`, add the `CreditCard` icon to the lucide import:

```ts
import { CreditCardIcon, QrCodeIcon, TagIcon } from "lucide-react";
```

Then insert this block immediately before the closing `</div>` of the outer wrapper — that is, after the `<div className="flex flex-col text-sm">` block that holds Status and IssueDate closes, and before the final `</div>`:

```tsx
      {/*
        Only meaningful while the tag has no payout token of its own: that is the
        draft-tag state this field exists for. Once a traveller claims the tag
        both ids are set and the traveller card shows the real masked number, so
        the two never appear at once.
      */}
      {tagDetail.pendingPayoutCardId && !tagDetail.payoutTokenId ? (
        <div className="flex items-center gap-2 text-sm">
          <CreditCardIcon className="size-4 text-muted-foreground shrink-0" />
          <div className="flex flex-col">
            <span className="font-semibold">
              {languageData["PayoutToken.PendingCard"]}
            </span>
            <span className="text-muted-foreground text-xs">
              {languageData["PayoutToken.PendingCardDescription"]}
            </span>
          </div>
        </div>
      ) : null}
```

- [ ] **Step 4: Verify type-check and lint**

Run: `pnpm --filter web type-check`
Expected: no output.

Run: `pnpm --filter web lint`
Expected: no errors. Everything added is plain HTML plus a lucide icon, so no `data-testid` is required.

- [ ] **Step 5: Manual check**

Open a tag detail page at `/en/operations/tax-free-tags/<tagId>` for a **draft tag that has a `pendingPayoutCardId` and no traveller**. The summary bar shows "Card saved at POS" with its explanation. Then open a tag that has a traveller and a `payoutTokenId`: the indicator is absent and the traveller card's existing payout-card row shows the masked number instead.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/[lang]/(main)/(unirefund)/operations/tax-free-tags/[tagId]/_components/tag-summary-card.tsx" \
        apps/web/src/language-data/unirefund/TagService/resources/en.json \
        apps/web/src/language-data/unirefund/TagService/resources/tr.json
git commit -m "$(cat <<'EOF'
feat(tag-detail): show when a payout card was saved on a draft tag

pendingPayoutCardId describes the no-traveller state, and TravellerDetailsCard
returns early in exactly that state - so the indicator lives on the summary card,
which always renders. Presence only: PendingPayoutCards has no client endpoint,
so there is no masked number to show.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Final verification

After all five tasks:

- [ ] `pnpm --filter web type-check` — no output.
- [ ] `pnpm --filter web lint` — no errors.
- [ ] `git status` — the only unstaged changes are the pre-existing `packages/saas/FileService/*.gen.ts` and the regenerated `packages/utils/policies/policies.json`. `apps/web/src/language-data/i18n/*.gen.json` must not appear (they are gitignored).
- [ ] `git log --oneline -5` — five commits, one per task.

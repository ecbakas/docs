# Shared Tag Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the duplicated merchant / invoice / product-group UI on `operations/scan-sticker` and `operations/tax-free-tags/new` with one shared `TagForm` component, taking the better implementation of each part.

**Architecture:** Three new files under `apps/web/src/components/tag-form/` — pure invoice arithmetic (`invoice.ts`), a generic merchant selector whose data source is injected (`merchant-selector.tsx`), and the composed `TagForm` (`tag-form.tsx`). Both pages keep every role rule, permission gate and API call they have today; they only stop owning the form. `tax-free-tags/new/_components/invoice-form.tsx` is deleted.

**Tech Stack:** Next.js App Router (client components), TypeScript, Tailwind v4 container queries, `@repo/ayasofyazilim-ui`, generated types from `@repo/saas`, i18n via `useTranslations()`.

**Spec:** [`docs/superpowers/specs/2026-07-30-shared-tag-form-design.md`](../specs/2026-07-30-shared-tag-form-design.md)

## Global Constraints

- **Branch:** work on `dev` (currently `e9b3b9ad3`). Branch off before committing if house rules require it.
- **No new API types.** Every DTO comes from `@repo/saas`. New types are allowed *only* for component props. Do not widen or redeclare a generated DTO.
- **No `useEffect`** for derived state or prop-change resets — see `web-app/.claude/rules/avoid-use-effect.md`. Use `useMemo`, event handlers, or React's render-phase "adjust state when a prop changes" pattern.
- **No third-party UI libraries.** Only `@repo/ayasofyazilim-ui/components/*` and `.../custom/*` — see `web-app/.claude/rules/ui-components.md`.
- **Every `Label`, `Button`, `Input`, `Switch`, `PopoverTrigger`, `DialogTrigger` needs a `data-testid`**, kebab-case, prefixed with the page or feature — see `web-app/.claude/rules/data-testid.md`. Lint enforces this.
- **All user-visible strings** come from `t.TagService[...]` (tag-creation copy) or `t.Default[...]` (generic widget copy). Add keys to **both** `en.json` and `tr.json`, then run `pnpm -C apps/web run init`. **Never edit `apps/web/src/language-data/i18n/`** — it is generated.
- **VAT is inclusive.** For a percentage `taxRate`: `taxAmount = amount * taxRate / (100 + taxRate)`, `taxBase = amount - taxAmount`.
- **A line's amount rounds to the cent before its tax is derived from it:** `Math.round(value * 100) / 100`. This applies **only** at the line level. The derived `totalAmount` / `vatAmount`, and each line's `taxAmount` / `taxBase`, are deliberately left **unrounded** — see the invariant note in Task 2 before changing this.
- **All paths** in this plan are relative to `C:\unirefund\web-app`.

## No unit test runner exists — read this before Task 1

`apps/web` — the app this plan changes — has **no** unit test runner. Its only test tooling is Playwright e2e (`apps/web/playwright.config.ts`, `pnpm -C apps/web test`).

`packages/ayasofyazilim-ui` *does* have Jest + `@testing-library/react` (6 existing tests), but it is a **separate git repository** mounted as a submodule. Putting tests for `apps/web` code there is not possible — different repo, different PR, and the code under test does not live there. Adding Jest to `apps/web` is infrastructure work outside this plan's scope.

On the Playwright suite:

- no spec in `apps/web/tests/` touches either page or any `data-testid` this plan changes;
- `tests/unirefund/parties/tag/new/create.tag.spec.ts` is misleadingly named — it drives `/parties/tax-free/new`, which creates a tax-free **party**, not a tag;
- every Playwright project depends on `tests/core/auth/auth.setup.ts`, which is **not in the tree**, plus a `TEST_*_URL` and a live tenant.

**Do not add a test framework, and do not write a Playwright spec.** The per-task gate is `type-check` + `lint`, and Task 2 additionally runs the invoice arithmetic through a throwaway `tsx` script (deleted before commit — it is a verification step, not a deliverable). Task 8 is the full build plus a manual checklist.

---

### Task 0: Make the workspace buildable

Both git submodules are uninitialized and dependencies are not installed, so `type-check` cannot run yet. Nothing else in this plan works until this task passes.

**Files:**
- Modify: none (environment only)

**Interfaces:**
- Consumes: nothing
- Produces: a working `pnpm -C apps/web run type-check` and `pnpm -C apps/web run lint`

- [ ] **Step 1: Confirm the submodules are the problem**

```bash
git -C . submodule status
```

Expected: both lines start with `-` (uninitialized):
```
-a72775589c6238ead46c72dd7826ad7217fb919f packages/ayasofyazilim-ui
-193f59ab48d9e513f0cf31621b4ffa7922a004ba packages/utils
```

- [ ] **Step 2: Initialize them**

```bash
git submodule update --init --recursive
```

- [ ] **Step 3: Verify both now have contents**

```bash
git submodule status
ls packages/ayasofyazilim-ui/package.json packages/utils/package.json
```

Expected: neither line starts with `-`, and both `package.json` files exist.

- [ ] **Step 4: Install dependencies**

```bash
pnpm install
```

- [ ] **Step 5: Record the baseline**

```bash
pnpm -C apps/web run type-check
pnpm -C apps/web run lint
```

Expected: both succeed. **If either already fails on unmodified code, write the failures down and stop** — you need a clean baseline to attribute later errors to your own changes. Report the pre-existing failures rather than fixing them; they are outside this plan.

- [ ] **Step 6: Confirm `AsyncSelectBase`'s prop name**

```bash
grep -rn "fetchAction" packages/ayasofyazilim-ui/src/custom/async-select/ | head -20
```

Expected: a `fetchAction` prop on the `AsyncSelectBase` props type. Task 3 derives its type from this component with `ComponentProps<typeof AsyncSelectBase<T>>["fetchAction"]`, so it does not matter what the signature *is* — only that the prop is named `fetchAction`. If it is named something else, use the real name in Task 3 and note the change.

- [ ] **Step 7: No commit**

Nothing was modified. Submodule pointers and `node_modules` are not commits. Do not commit in this task.

---

### Task 1: Language keys

Must land before the component tasks: `t.TagService[...]` is typed from the generated i18n files, so referencing a key that does not exist yet is a type error.

**Files:**
- Modify: `apps/web/src/language-data/unirefund/TagService/resources/en.json`
- Modify: `apps/web/src/language-data/unirefund/TagService/resources/tr.json`
- Generated, **gitignored** (`.gitignore:150`), never hand-edited and never committed: `apps/web/src/language-data/i18n/`

Because `i18n/` is gitignored, a correct commit for this task contains **exactly two files**. The generated `en.gen.json` / `tr.gen.json` must still be regenerated locally so `type-check` can see the new keys — they just never appear in `git status`.

**Interfaces:**
- Consumes: nothing
- Produces: `t.TagService["Form.NewTag.AddLine"]`, `["Form.NewTag.RemoveLine"]`, `["Form.NewTag.SelectProductGroup"]`, `["Form.NewTag.LineCount"]`, `["Form.NewTag.LineCountPlural"]`

- [ ] **Step 1: Add the five keys to `en.json`**

Insert next to the other `Form.NewTag.*` keys (around line 366, after `Form.NewTag.EnabledGroupsPlural`):

```json
  "Form.NewTag.AddLine": "Add",
  "Form.NewTag.RemoveLine": "Remove",
  "Form.NewTag.SelectProductGroup": "Select a product group to add an amount",
  "Form.NewTag.LineCount": "line",
  "Form.NewTag.LineCountPlural": "lines",
```

- [ ] **Step 2: Add the same five keys to `tr.json`**

Insert at the matching position (around line 364):

```json
  "Form.NewTag.AddLine": "Ekle",
  "Form.NewTag.RemoveLine": "Kaldır",
  "Form.NewTag.SelectProductGroup": "Tutar eklemek için bir ürün grubu seçin",
  "Form.NewTag.LineCount": "satır",
  "Form.NewTag.LineCountPlural": "satır",
```

- [ ] **Step 3: Do NOT remove the retired keys yet**

`Form.NewTag.EnabledGroups` and `Form.NewTag.EnabledGroupsPlural` are still read by `tax-free-tags/new/_components/invoice-form.tsx`, which Task 5 deletes. Removing them here would make this task's own `type-check` gate fail. **Task 7 deletes them**, after the last reader is gone. Add only, in this task.

Leave `SelectMerchant` and `AssignSticker.SelectMerchant` alone — they are different strings ("Select merchant", a button label; "Choose the merchant this tag belongs to", a hint sentence).

- [ ] **Step 4: Regenerate**

```bash
pnpm -C apps/web run init
```

- [ ] **Step 5: Verify the new keys are generated and the old ones are gone**

```bash
grep -rn "Form.NewTag.AddLine\|Form.NewTag.LineCountPlural" apps/web/src/language-data/i18n/ | head
```

Expected: hits in the generated files for both keys, in the `en` and `tr` maps.

- [ ] **Step 6: Type-check and commit**

```bash
pnpm -C apps/web run type-check
pnpm -C apps/web run lint
git add apps/web/src/language-data
git commit -m "feat(i18n): add tag-form line and amount keys"
```

Expected: both PASS. This task only **adds** keys, so it cannot break an existing reader — if `type-check` fails here, the failure is pre-existing (see Task 0 Step 5) or in the generated output, not in your edit.

---

### Task 2: Pure invoice helpers

**Files:**
- Create: `apps/web/src/components/tag-form/invoice.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `buildInitialInvoice(): InvoiceRequestDto`
  - `withUpdatedTotals(invoice: InvoiceRequestDto): InvoiceRequestDto`
  - `addInvoiceLine(invoice: InvoiceRequestDto, group: ProductGroupRelationDto, amount: number): InvoiceRequestDto`
  - `removeInvoiceLine(invoice: InvoiceRequestDto, productGroupId: string | null | undefined): InvoiceRequestDto`
  - `isAmountValid(raw: string): boolean`
  - re-exported type aliases `InvoiceRequestDto`, `ProductGroupRelationDto`

- [ ] **Step 1: Write the file**

Every import is `import type`, so this module has **zero runtime imports** — that is what lets Step 3 execute it directly with `tsx`.

```ts
import type { UniRefund_SettingService_ProductGroupMerchants_ProductGroupMerchantRelationDto } from "@repo/saas/CRMService";
import type { UniRefund_TagService_Invoices_InvoiceRequestDto } from "@repo/saas/TagService";

export type InvoiceRequestDto = UniRefund_TagService_Invoices_InvoiceRequestDto;
export type ProductGroupRelationDto =
  UniRefund_SettingService_ProductGroupMerchants_ProductGroupMerchantRelationDto;

/**
 * Totals are always derived from the lines, never maintained alongside them, so
 * they cannot drift out of step with a line that was added, merged or removed.
 *
 * **Deliberately not rounded, and this must stay that way.** Rounding the sums
 * is tempting - 10.10 + 20.20 + 30.30 reduces to 60.599999999999994, and the
 * UI's number formatter renders a tidy "60.60" over it. But rounding only the
 * aggregate breaks an invariant the create body carries today: `totalAmount`
 * equals the exact sum of the lines' `amount`, and `vatAmount` the exact sum of
 * their `taxAmount`. Both hold here by construction, so a backend that
 * cross-checks them cannot reject a body this function produced. Rounding the
 * aggregate alone would break both equalities; rounding the per-line `taxAmount`
 * and `taxBase` as well would restore them, but changes values the backend
 * already receives in production. Neither trade was accepted, so the sums stay
 * exact and cosmetic tidiness is left to the formatter at the point of display.
 */
export function withUpdatedTotals(invoice: InvoiceRequestDto): InvoiceRequestDto {
  return {
    ...invoice,
    totalAmount: invoice.invoiceLines.reduce((sum, l) => sum + (l.amount ?? 0), 0),
    vatAmount: invoice.invoiceLines.reduce((sum, l) => sum + (l.taxAmount ?? 0), 0),
  };
}

/**
 * A fresh invoice with no lines - one exists only once the operator adds an
 * amount for a product group.
 *
 * `invoiceNumber` starts empty on purpose. Seeding it with the placeholder text
 * is why an operator who did not clear the field first posted "INV-0011234";
 * the placeholder is the input's `placeholder` prop's job alone.
 */
export function buildInitialInvoice(): InvoiceRequestDto {
  return {
    uuid: crypto.randomUUID(),
    invoiceNumber: "",
    issueDate: new Date().toISOString(),
    totalAmount: 0,
    vatAmount: 0,
    invoiceLines: [],
  };
}

/**
 * Adds `amount` to the line for `group`, merging into an existing line for that
 * group rather than listing it twice.
 *
 * The combined amount is rounded to the cent *before* tax is computed from it.
 * That is not cosmetic: adding 0.1 three times leaves 0.30000000000000004 in
 * binary floating point, and the row would read "0.30" while the create posted
 * the long value as the refund basis. Tax is recomputed from the combined total
 * rather than summed, which would drift by a cent over repeated adds.
 */
export function addInvoiceLine(
  invoice: InvoiceRequestDto,
  group: ProductGroupRelationDto,
  amount: number
): InvoiceRequestDto {
  const existing = invoice.invoiceLines.find(
    (l) => l.productGroupId === group.productGroupId
  );
  const total = Math.round(((existing?.amount ?? 0) + amount) * 100) / 100;
  const taxRate = group.vatRate;
  const taxAmount = (total * taxRate) / (100 + taxRate);
  const line = {
    amount: total,
    taxAmount,
    taxBase: total - taxAmount,
    taxRate,
    productGroupId: group.productGroupId,
  };
  return withUpdatedTotals({
    ...invoice,
    invoiceLines: existing
      ? invoice.invoiceLines.map((l) =>
          l.productGroupId === group.productGroupId ? line : l
        )
      : [...invoice.invoiceLines, line],
  });
}

export function removeInvoiceLine(
  invoice: InvoiceRequestDto,
  productGroupId: string | null | undefined
): InvoiceRequestDto {
  return withUpdatedTotals({
    ...invoice,
    invoiceLines: invoice.invoiceLines.filter(
      (l) => l.productGroupId !== productGroupId
    ),
  });
}

/**
 * The single source of truth for "is the typed amount postable", so the Add
 * button's disabled state and the add handler's own guard cannot disagree.
 * `parseFloat("1e999")` is `Infinity` and `Infinity > 0` is `true`, which is why
 * the finite check is here and not just `> 0`.
 */
export function isAmountValid(raw: string): boolean {
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0;
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm -C apps/web run type-check
```

Expected: PASS. If `vatRate` or `productGroupId` is nullable in the generated DTO, adjust the local arithmetic to cope — **do not** change the generated type.

- [ ] **Step 3: Exercise the arithmetic with a throwaway script**

There is no unit test runner, so verify the properties that actually matter — merge-on-add rounding, and totals derived from lines.

Write the script into this plan's SDD workspace, which is **gitignored**, so it can never be committed but relative paths still resolve. Run everything from the repo root `C:\unirefund\web-app`. Note the **absolute** import path — a script in a temp dir importing `./apps/web/...` would not resolve:

```bash
WS=".superpowers/sdd/2026-07-30-shared-tag-form"
cat > "$WS/check-invoice.ts" <<'EOF'
import assert from "node:assert/strict";
import {
  addInvoiceLine,
  buildInitialInvoice,
  isAmountValid,
  removeInvoiceLine,
} from "/c/unirefund/web-app/apps/web/src/components/tag-form/invoice.ts";

const group = { productGroupId: "pg-1", productGroupName: "Clothing", vatRate: 20, isDefault: true, isActive: true } as never;

// Repeated adds merge into one line and stay rounded to the cent.
let inv = buildInitialInvoice();
assert.equal(inv.invoiceLines.length, 0, "starts with no lines");
assert.equal(inv.invoiceNumber, "", "invoice number starts empty");
inv = addInvoiceLine(inv, group, 0.1);
inv = addInvoiceLine(inv, group, 0.1);
inv = addInvoiceLine(inv, group, 0.1);
assert.equal(inv.invoiceLines.length, 1, "merged into a single line");
assert.equal(inv.invoiceLines[0].amount, 0.3, "0.1 x3 is exactly 0.3, not 0.30000000000000004");

// The invariant the create body relies on: each total is the EXACT sum of its
// lines. Asserted across three groups, because a single line can never expose a
// difference between a rounded and an unrounded aggregate.
const groupB = { productGroupId: "pg-2", productGroupName: "Electronics", vatRate: 10, isDefault: false, isActive: true } as never;
const groupC = { productGroupId: "pg-3", productGroupName: "Food", vatRate: 8, isDefault: false, isActive: true } as never;
let multi = buildInitialInvoice();
multi = addInvoiceLine(multi, group, 10.1);
multi = addInvoiceLine(multi, groupB, 20.2);
multi = addInvoiceLine(multi, groupC, 30.3);
assert.equal(multi.invoiceLines.length, 3, "three distinct groups, three lines");
assert.equal(
  multi.totalAmount,
  multi.invoiceLines.reduce((s, l) => s + (l.amount ?? 0), 0),
  "totalAmount is the exact sum of line amounts"
);
assert.equal(
  multi.vatAmount,
  multi.invoiceLines.reduce((s, l) => s + (l.taxAmount ?? 0), 0),
  "vatAmount is the exact sum of line taxAmounts"
);

// VAT is inclusive, and totals come from the lines.
inv = buildInitialInvoice();
inv = addInvoiceLine(inv, group, 120);
assert.equal(inv.totalAmount, 120, "total derived from lines");
assert.equal(inv.invoiceLines[0].taxAmount, 20, "120 at 20% inclusive is 20 tax");
assert.equal(inv.invoiceLines[0].taxBase, 100, "base is 100");
assert.equal(inv.vatAmount, 20, "vat total derived from lines");

// Removing the line zeroes the derived totals.
inv = removeInvoiceLine(inv, "pg-1");
assert.equal(inv.invoiceLines.length, 0);
assert.equal(inv.totalAmount, 0);
assert.equal(inv.vatAmount, 0);

// Infinity must not read as a valid amount.
assert.equal(isAmountValid("1e999"), false, "Infinity is not postable");
assert.equal(isAmountValid("0"), false);
assert.equal(isAmountValid(""), false);
assert.equal(isAmountValid("12.34"), true);

console.log("invoice.ts OK");
EOF
pnpm exec tsx "$WS/check-invoice.ts"
```

Expected output: `invoice.ts OK`.

If the absolute `/c/...` import form fails under your shell, use a POSIX path relative to the script instead (`../../../apps/web/src/components/tag-form/invoice.ts`) — the module resolves either way; only the spelling changes. **Paste the real output into your report.**

If an assertion fires, fix `invoice.ts` — never weaken the assertion.

- [ ] **Step 4: Delete the script**

```bash
rm "$WS/check-invoice.ts"
```

It was a verification step, not a deliverable. Confirm `git status` shows only `invoice.ts` as new (the workspace is gitignored, so the script never appears there anyway — delete it regardless).

- [ ] **Step 5: Lint and commit**

```bash
pnpm -C apps/web run lint
git add apps/web/src/components/tag-form/invoice.ts
git commit -m "feat(tag-form): add pure invoice helpers"
```

---

### Task 3: `MerchantSelector`

**Files:**
- Create: `apps/web/src/components/tag-form/merchant-selector.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `type SelectableMerchant = SearchItem & { id?: string | null; name?: string | null }`
  - `type MerchantFetchAction<T extends SearchItem> = AsyncSelectType<T>["fetchAction"]`
  - `type MerchantNotice = { text: string; tone: "muted" | "warning" | "error" }`
  - `type MerchantSelectorProps<T extends SelectableMerchant>` — the discriminated union below
  - `MerchantPicker<T>(props)` — the bare popover, for the empty state
  - `MerchantSelector<T>(props)` — label + control + notice + details

**Verified against the real component** (`packages/ayasofyazilim-ui/src/custom/async-select.tsx`, readable now that Task 0 initialized the submodule):

```ts
export type SearchItem = Record<string, unknown>;
export type AsyncSelectType<T extends SearchItem = SearchItem> = {
  value: T[];                                    // required
  onChange: (value: T[]) => void;                // required, an ARRAY
  fetchAction: (search: string) => Promise<T[]>; // required
  id: string;                                    // required
  resultText?: string; searchText?: string; noResultText?: string;
  disabled?: boolean; multiple?: boolean; closeOnSelect?: boolean;
  identifierKey?: keyof T & string;              // defaults to "id"
  labelKey?: keyof T & string;                   // defaults to "name"
  // ...suggestions, data, badges, classNames
};
export function AsyncSelectBase<T extends SearchItem = SearchItem>(
  props: AsyncSelectType<T> & { setIsPopoverOpen: Dispatch<SetStateAction<boolean>> }
): JSX.Element;
```

Three consequences:

1. **`T` must extend `SearchItem` (`Record<string, unknown>`)**, so `SelectableMerchant` intersects it. The generated DTOs are `type` aliases, not `interface`s, so they get implicit index signatures and satisfy the constraint. If a DTO turns out to be an `interface` and fails to assign, widen with `T extends SelectableMerchant & Record<string, unknown>` rather than casting.
2. **`identifierKey` and `labelKey` default to `"id"` and `"name"`** — exactly the fields `SelectableMerchant` declares, so neither needs passing.
3. **`resultText` / `searchText` / `noResultText` default to hardcoded English** (`"Results"`, `"Search"`, `"No result"`). `tax-free-tags/new` never passes them today, so it renders untranslated strings; scan-sticker's `AsyncSelect` does pass them. The shared picker **must** pass all three from `t.Default`, which fixes that i18n gap on `/new` and preserves scan-sticker's behaviour.

- [ ] **Step 1: Write the file**

```tsx
"use client";

import { useTranslations } from "@/src/providers/i18n";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import { Label } from "@repo/ayasofyazilim-ui/components/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/ayasofyazilim-ui/components/popover";
import {
  AsyncSelectBase,
  type AsyncSelectType,
  type SearchItem,
} from "@repo/ayasofyazilim-ui/custom/async-select";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import { ChevronDown, Store } from "lucide-react";
import { useState } from "react";

/**
 * The minimum shape this selector needs. Both generated merchant DTOs satisfy
 * it - `MerchantListResponseDto` (CRMService, used by the new-tag page) and
 * `MerchantForTagCreationDto` (TagService, used by the sticker-scan page) - so
 * neither has to be imported here and neither is favoured.
 *
 * `SearchItem` is `AsyncSelectBase`'s own constraint. `id` and `name` are named
 * explicitly because they are what its `identifierKey` / `labelKey` default to.
 */
export type SelectableMerchant = SearchItem & {
  id?: string | null;
  name?: string | null;
};

/**
 * Taken from `AsyncSelectBase`'s own prop type rather than hand-written, so the
 * two call sites keep their own search actions and their own DTOs without this
 * file knowing anything about either.
 */
export type MerchantFetchAction<T extends SearchItem> =
  AsyncSelectType<T>["fetchAction"];

/**
 * A line under the control. The sticker-scan page uses all three tones: `error`
 * for a book allocated to another store, `muted` for "already allocated", and
 * `warning` for a book this create would allocate permanently.
 */
export type MerchantNotice = {
  text: string;
  tone: "muted" | "warning" | "error";
};

export type MerchantSelectorProps<T extends SelectableMerchant> = {
  testId: string;
  disabled?: boolean;
  notice?: MerchantNotice;
  details?: { vatNumber?: string | null; address?: string | null };
} & (
  | {
      mode: "select";
      fetchAction: MerchantFetchAction<T>;
      value: T | null;
      onChange: (merchant: T | null) => void;
    }
  | { mode: "readonly"; name: string }
  | { mode: "hint"; text: string }
);

const NOTICE_TONE: Record<MerchantNotice["tone"], string> = {
  muted: "text-muted-foreground",
  warning: "font-semibold text-orange-400",
  error: "text-destructive font-semibold",
};

/**
 * The bare picker, with no label or notice around it. Rendered twice: inside
 * `MerchantSelector`'s row, and as the call to action in `TagForm`'s empty state.
 */
export function MerchantPicker<T extends SelectableMerchant>({
  fetchAction,
  value,
  onChange,
  disabled,
  testId,
}: {
  fetchAction: MerchantFetchAction<T>;
  value: T | null;
  onChange: (merchant: T | null) => void;
  disabled?: boolean;
  testId: string;
}) {
  const { t } = useTranslations();
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  return (
    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
      <PopoverTrigger asChild data-testid={`${testId}-popover-trigger`}>
        <Button
          variant="outline"
          data-testid={`${testId}-button`}
          disabled={disabled}
          className="w-full justify-between @sm/tag-form:w-auto @sm/tag-form:min-w-64"
        >
          <span className="flex items-center gap-2 truncate">
            <Store className="size-4 shrink-0" />
            <span className="truncate">
              {value?.name ? value.name : t.TagService.SelectMerchant}
            </span>
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        {/*
          `resultText` / `searchText` / `noResultText` default to hardcoded
          English inside AsyncSelectBase, which is why the new-tag page showed
          untranslated dropdown copy - it passed none of them. Passing all three
          here fixes that page and keeps the sticker-scan page's behaviour.
        */}
        <AsyncSelectBase<T>
          id={`${testId}-search`}
          multiple={false}
          onChange={(selected) => onChange(selected[0] ?? null)}
          value={value ? [value] : []}
          fetchAction={fetchAction}
          disabled={disabled}
          noResultText={t.Default["Select.EmptyValue"]}
          resultText={t.Default["Select.ResultLabel"]}
          searchText={t.Default["Select.Placeholder"]}
          setIsPopoverOpen={setIsPopoverOpen}
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * The labelled merchant row: the control for this page's mode, then the optional
 * allocation notice, then the optional VAT / address lines.
 */
export function MerchantSelector<T extends SelectableMerchant>(
  props: MerchantSelectorProps<T>
) {
  const { t } = useTranslations();
  const { testId, disabled, notice, details } = props;

  return (
    <div className="flex flex-col gap-1.5">
      <Label
        data-testid={`${testId}-label`}
        className="text-muted-foreground text-xs"
      >
        {t.TagService["Form.NewTag.Merchant"]}
      </Label>

      {props.mode === "select" ? (
        <MerchantPicker<T>
          fetchAction={props.fetchAction}
          value={props.value}
          onChange={props.onChange}
          disabled={disabled}
          testId={testId}
        />
      ) : props.mode === "readonly" ? (
        <span className="text-sm font-medium">{props.name || "-"}</span>
      ) : (
        <span className="text-muted-foreground text-sm">{props.text}</span>
      )}

      {notice ? (
        <span className={cn("text-xs", NOTICE_TONE[notice.tone])}>
          {notice.text}
        </span>
      ) : null}

      {details && (details.vatNumber || details.address) ? (
        <div className="text-muted-foreground grid min-w-0 gap-0.5 text-xs wrap-break-word">
          {details.vatNumber ? (
            <span>
              {t.TagService["AssignSticker.MerchantVatNumber"]}:{" "}
              {details.vatNumber}
            </span>
          ) : null}
          {details.address ? (
            <span>
              {t.TagService["AssignSticker.MerchantAddress"]}: {details.address}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm -C apps/web run type-check
```

Expected: PASS. The prop types above were read from the real component, so no guessing is needed. The one thing to watch: if a generated merchant DTO fails to satisfy `SearchItem`, widen the constraint as described above — do **not** cast, and do **not** change the generated type.

- [ ] **Step 3: Lint**

```bash
pnpm -C apps/web run lint
```

Expected: PASS, including the `data-testid` rule on `Label`, `Button` and `PopoverTrigger`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/tag-form/merchant-selector.tsx
git commit -m "feat(tag-form): add generic merchant selector"
```

---

### Task 4: `TagForm`

**Files:**
- Create: `apps/web/src/components/tag-form/tag-form.tsx`

**Interfaces:**
- Consumes: `buildInitialInvoice` is *not* used here (pages own invoice creation); uses `addInvoiceLine`, `removeInvoiceLine`, `isAmountValid`, `InvoiceRequestDto`, `ProductGroupRelationDto` from `./invoice`; `MerchantSelector`, `MerchantSelectorProps`, `SelectableMerchant` from `./merchant-selector`. **`MerchantPicker` is deliberately not used here** — the always-visible merchant row owns the only picker on screen.
- Produces: `TagForm<T extends SelectableMerchant>(props)` with the prop shape below

- [ ] **Step 1: Write the file**

```tsx
"use client";

import { AddTravellerDialog } from "@/components/add-traveller-dialog";
import { useTranslations } from "@/src/providers/i18n";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ayasofyazilim-ui/components/empty";
import { Input } from "@repo/ayasofyazilim-ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@repo/ayasofyazilim-ui/components/input-group";
import { Label } from "@repo/ayasofyazilim-ui/components/label";
import { DatePicker } from "@repo/ayasofyazilim-ui/custom/date-picker";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import type { UniRefund_CRMService_Countries_CountryDto } from "@repo/saas/CRMService";
import type { UniRefund_TagService_Travellers_TravellerRequestDto } from "@repo/saas/TagService";
import { Banknote, Calendar, Hash, Store } from "lucide-react";
import { useParams } from "next/navigation";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import {
  addInvoiceLine,
  isAmountValid,
  removeInvoiceLine,
  type InvoiceRequestDto,
  type ProductGroupRelationDto,
} from "./invoice";
import {
  MerchantPicker,
  MerchantSelector,
  type MerchantSelectorProps,
  type SelectableMerchant,
} from "./merchant-selector";

export function TagForm<TMerchant extends SelectableMerchant>({
  title,
  subtitle,
  merchant,
  invoice,
  setInvoice,
  productGroups,
  countries,
  traveller,
  setTraveller,
  onTravellerSignatureChange,
  disabled,
  testId,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  merchant: MerchantSelectorProps<TMerchant>;
  /**
   * Not nullable: both pages already guard before rendering this form, which
   * keeps every `invoice?.` and `invoice &&` check out of this component.
   */
  invoice: InvoiceRequestDto;
  setInvoice: (invoice: InvoiceRequestDto) => void;
  productGroups: ProductGroupRelationDto[];
  countries: UniRefund_CRMService_Countries_CountryDto[];
  traveller: UniRefund_TagService_Travellers_TravellerRequestDto | null;
  setTraveller: (
    traveller: UniRefund_TagService_Travellers_TravellerRequestDto | null
  ) => void;
  onTravellerSignatureChange?: (signature: string | undefined) => void;
  disabled?: boolean;
  /** Prefix for every `data-testid` below, unique per page. */
  testId: string;
  /** Page-only controls rendered under the card: signatures, buttons, selectors. */
  children?: ReactNode;
}) {
  const { t } = useTranslations();
  const { lang } = useParams<{ lang: string }>();

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(
    () => productGroups.find((pg) => pg.isDefault)?.productGroupId ?? null
  );
  const [amountInput, setAmountInput] = useState("");

  /*
   * Product groups belong to the merchant, so both the chip selection and the
   * typed amount must reset whenever the group set changes - a merchant pick, or
   * a new scan. This is React's "adjust state when a prop changes" pattern
   * (compare against the last value seen, set during render), not an effect:
   * `.claude/rules/avoid-use-effect.md` rules those out for derived state, and an
   * effect would also render one frame with the previous merchant's selection.
   */
  const groupsKey = productGroups.map((pg) => pg.productGroupId).join("|");
  const [lastGroupsKey, setLastGroupsKey] = useState(groupsKey);
  if (groupsKey !== lastGroupsKey) {
    setLastGroupsKey(groupsKey);
    setSelectedGroupId(
      productGroups.find((pg) => pg.isDefault)?.productGroupId ?? null
    );
    setAmountInput("");
  }

  const numberFormatter = useMemo(
    () =>
      new Intl.NumberFormat(lang || "en", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [lang]
  );
  const formatAmount = useCallback(
    (value: number | null | undefined) => numberFormatter.format(value ?? 0),
    [numberFormatter]
  );

  const canAddLine = Boolean(selectedGroupId) && isAmountValid(amountInput);

  const handleAddLine = useCallback(() => {
    if (!selectedGroupId || !isAmountValid(amountInput)) return;
    const group = productGroups.find(
      (pg) => pg.productGroupId === selectedGroupId
    );
    if (!group) return;
    setInvoice(addInvoiceLine(invoice, group, parseFloat(amountInput)));
    setAmountInput("");
  }, [amountInput, invoice, productGroups, selectedGroupId, setInvoice]);

  const hasProductGroups = productGroups.length > 0;
  const lineCount = invoice.invoiceLines.length;

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            {title}
          </h1>
          {subtitle ? (
            <p className="text-muted-foreground truncate text-sm">{subtitle}</p>
          ) : null}
        </div>
        <AddTravellerDialog
          countries={countries}
          traveller={traveller}
          setTraveller={setTraveller}
          onSignatureChange={onTravellerSignatureChange}
          disabled={disabled}
          testId={`${testId}-add-traveller`}
        />
      </div>

      <div className="@container/tag-form flex flex-col rounded-md border">
        {/*
          Always rendered, unlike the old new-tag page which hid it and promoted
          the picker into the empty state. The sticker-scan page's merchant is
          often read-only or a hint with no picker to promote, and hiding the row
          would drop its allocation warning and the store's name with it.
        */}
        <div className="border-b p-4">
          <MerchantSelector<TMerchant> {...merchant} />
        </div>

        {!hasProductGroups ? (
          <Empty className="border-0 py-12">
            <EmptyMedia variant="icon">
              <Store />
            </EmptyMedia>
            <EmptyHeader className="gap-1">
              <EmptyTitle>
                {merchant.mode === "select" && !merchant.value
                  ? t.TagService["Form.NewTag.NoMerchantTitle"]
                  : t.TagService["Form.NewTag.NoProductGroupsTitle"]}
              </EmptyTitle>
              <EmptyDescription>
                {merchant.mode === "select" && !merchant.value
                  ? t.TagService["ProductGroups.SelectMerchant"]
                  : t.TagService["Form.NewTag.NoProductGroupsDescription"]}
              </EmptyDescription>
            </EmptyHeader>
            {/*
              No picker here. The merchant row above is always rendered, so
              promoting a second copy into this empty state would put two
              identical "Select merchant" buttons on screen in exactly the state
              a first-time visitor lands in. The old page could centre its picker
              here only because it hid the row; this one does not.
            */}
          </Empty>
        ) : (
          <div className="flex flex-col gap-4 p-4">
            <div className="grid grid-cols-1 gap-3 @sm/tag-form:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label
                  data-testid={`${testId}-invoice-number-label`}
                  className="gap-0"
                >
                  {t.TagService.InvoiceNumber}
                  <span className="text-destructive">*</span>
                </Label>
                <InputGroup data-disabled={disabled || undefined}>
                  <InputGroupAddon
                    align="inline-start"
                    className="self-stretch border-r pr-3"
                  >
                    <Hash className="size-4" />
                  </InputGroupAddon>
                  {/*
                    The placeholder is the `placeholder` prop's job only. Passing
                    it as the value too rendered "INV-001" as real typed text, so
                    an operator who did not clear the field first posted
                    "INV-0011234" as the invoice number.
                  */}
                  <InputGroupInput
                    data-testid={`${testId}-invoice-number-input`}
                    value={invoice.invoiceNumber ?? ""}
                    disabled={disabled}
                    onChange={(e) =>
                      setInvoice({ ...invoice, invoiceNumber: e.target.value })
                    }
                    placeholder={t.TagService["InvoiceNumber.Placeholder"]}
                  />
                </InputGroup>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label data-testid={`${testId}-issue-date-label`}>
                  {t.TagService.IssueDate}
                </Label>
                <div
                  className={cn(
                    "border-input dark:bg-input/30 flex h-9 w-full items-center overflow-hidden rounded-md border shadow-xs",
                    disabled && "pointer-events-none opacity-50"
                  )}
                >
                  <span className="text-muted-foreground flex h-full items-center border-r px-3">
                    <Calendar className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1 px-2">
                    <DatePicker
                      id={`${testId}-issue-date-picker`}
                      disabled={disabled}
                      showIcon={false}
                      locale={lang}
                      minDate={new Date("2000-01-01")}
                      defaultValue={new Date(invoice.issueDate)}
                      onChange={(date) =>
                        setInvoice({
                          ...invoice,
                          issueDate: date.toISOString(),
                        })
                      }
                      classNames={{
                        dateInput:
                          "h-auto rounded-none border-0 bg-transparent px-0 py-0 shadow-none dark:bg-transparent",
                      }}
                      translations={{
                        "DatePicker.from": t.Default.From,
                        "DatePicker.to": t.Default.To,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label
                  data-testid={`${testId}-product-groups-label`}
                  id={`${testId}-product-groups-heading`}
                  className="text-muted-foreground text-xs"
                >
                  {t.TagService["Form.NewTag.ProductGroups"]}
                </Label>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {lineCount}{" "}
                  {lineCount === 1
                    ? t.TagService["Form.NewTag.LineCount"]
                    : t.TagService["Form.NewTag.LineCountPlural"]}
                </span>
              </div>

              {/*
                Single-select chips plus one amount field, rather than a switch
                and an amount per row: an operator adds the amounts they actually
                rang up, and `addInvoiceLine` merges repeats into one line.
              */}
              <div
                role="group"
                aria-labelledby={`${testId}-product-groups-heading`}
                className="flex flex-wrap gap-1.5"
              >
                {productGroups.map((pg) => {
                  const isSelected = pg.productGroupId === selectedGroupId;
                  return (
                    <button
                      key={pg.productGroupId}
                      type="button"
                      data-testid={`${testId}-product-group-chip-${pg.productGroupId}`}
                      aria-pressed={isSelected}
                      disabled={disabled}
                      onClick={() =>
                        setSelectedGroupId(isSelected ? null : pg.productGroupId)
                      }
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
                        isSelected
                          ? "bg-primary border-primary text-primary-foreground"
                          : "bg-muted border-input text-foreground"
                      )}
                    >
                      {pg.productGroupName} {pg.vatRate}%
                    </button>
                  );
                })}
              </div>

              <div className="flex items-end gap-2">
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label
                    htmlFor={`${testId}-line-amount`}
                    data-testid={`${testId}-line-amount-label`}
                  >
                    {t.TagService.Amount}
                  </Label>
                  <InputGroup
                    data-disabled={disabled || !selectedGroupId || undefined}
                  >
                    <InputGroupAddon
                      align="inline-start"
                      className="self-stretch border-r pr-2.5"
                    >
                      <Banknote className="size-4" />
                    </InputGroupAddon>
                    <InputGroupInput
                      id={`${testId}-line-amount`}
                      data-testid={`${testId}-line-amount-input`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      placeholder="0.00"
                      className="text-right tabular-nums"
                      value={amountInput}
                      disabled={disabled || !selectedGroupId}
                      onChange={(e) => setAmountInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddLine();
                        }
                      }}
                    />
                  </InputGroup>
                </div>
                <Button
                  type="button"
                  data-testid={`${testId}-add-line-button`}
                  variant="secondary"
                  disabled={disabled || !canAddLine}
                  onClick={handleAddLine}
                >
                  {t.TagService["Form.NewTag.AddLine"]}
                </Button>
              </div>

              {!selectedGroupId ? (
                <p className="text-muted-foreground text-xs">
                  {t.TagService["Form.NewTag.SelectProductGroup"]}
                </p>
              ) : null}

              <div className="overflow-hidden rounded-md border">
                {lineCount > 0 ? (
                  <div className="divide-y">
                    {invoice.invoiceLines.map((line) => {
                      const group = productGroups.find(
                        (pg) => pg.productGroupId === line.productGroupId
                      );
                      return (
                        <div
                          key={line.productGroupId}
                          className="flex items-center justify-between gap-2 p-2 text-sm"
                        >
                          <span className="min-w-0 truncate">
                            {group?.productGroupName} {line.taxRate}%
                          </span>
                          <span className="tabular-nums">
                            {formatAmount(line.amount)}
                          </span>
                          <Button
                            type="button"
                            data-testid={`${testId}-remove-line-${line.productGroupId}`}
                            variant="ghost"
                            size="sm"
                            disabled={disabled}
                            onClick={() =>
                              setInvoice(
                                removeInvoiceLine(invoice, line.productGroupId)
                              )
                            }
                          >
                            {t.TagService["Form.NewTag.RemoveLine"]}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                <div className="bg-muted/50 border-t">
                  <div className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-muted-foreground">
                      {t.TagService.VatAmount}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {formatAmount(invoice.vatAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t px-3 py-2">
                    <span className="font-semibold">
                      {t.TagService["Form.NewTag.TotalAmount"]}
                    </span>
                    <span className="text-base font-semibold tabular-nums">
                      {formatAmount(invoice.totalAmount)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {children}
    </>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm -C apps/web run type-check
```

Expected: PASS. Note the unused `Input` import — remove it if lint flags it (the amount field uses `InputGroupInput`).

- [ ] **Step 3: Lint**

```bash
pnpm -C apps/web run lint
```

Expected: PASS. The chips are plain `<button>` elements, which the testid rule exempts, but they carry testids anyway because they are the primary control.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/tag-form/tag-form.tsx
git commit -m "feat(tag-form): add shared tag creation form"
```

---

### Task 5: Wire `tax-free-tags/new`

Do this page before scan-sticker: it is the simpler of the two, so any mistake in `TagForm`'s prop shape surfaces here where there is less to unpick.

**Files:**
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/tax-free-tags/new/client.tsx`
- Delete: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/tax-free-tags/new/_components/invoice-form.tsx`

**Interfaces:**
- Consumes: `TagForm` (Task 4), `buildInitialInvoice` (Task 2)
- Produces: nothing for later tasks

- [ ] **Step 1: Replace the invoice state initialiser**

In `client.tsx`, delete `getInitialInvoiceLines` entirely (lines ~49-71) and swap the `invoices` initialiser to `buildInitialInvoice`. The old initialiser pre-created zero-amount lines for default groups and seeded the invoice number with the placeholder — chips replace the first and Task 2's comment explains the second:

```tsx
import { buildInitialInvoice } from "@/components/tag-form/invoice";
import { TagForm } from "@/components/tag-form/tag-form";

// ...

const [invoice, setInvoice] = useState(buildInitialInvoice);
```

Rename the state from `invoices` to `invoice` throughout this file — it was always a single invoice, and `TagForm`'s prop is `invoice`. The submit body still sends `invoices: [invoice]`.

- [ ] **Step 2: Replace the line rebuilding with a line clear**

`handleProductGroupsChange` existed to recompute `getInitialInvoiceLines`, which is gone. It must **not** become a bare passthrough.

Invoice lines are priced against one merchant's product groups, so they cannot survive a merchant change. `TagForm`'s `groupsKey` block resets only its own `selectedGroupId` and `amountInput` — it cannot clear the invoice, because `setInvoice` is the *page's* setter and calling a parent's setter during render is not legal React. **Clearing lines is the page's job.**

Leaving them behind posts a body whose merchant and lines disagree: pick merchant A, add a 500 line, switch to merchant B, and Create sends B's `vatNumber` alongside A's `productGroupId` — with the row rendering a blank product name because the group lookup misses, and `canSubmit` still true.

Clear the lines and let `withUpdatedTotals` re-derive the totals. The old code replaced `invoiceLines` *without* recomputing them, which is why it posted a stale total against zero-amount lines — do not repeat that:

```tsx
import { buildInitialInvoice, withUpdatedTotals } from "@/components/tag-form/invoice";

// Lines are priced against this merchant's product groups, so they cannot
// outlive a merchant change. The invoice number and issue date describe the
// paper invoice rather than the merchant, so they deliberately survive.
function handleMerchantPick(
  picked: UniRefund_CRMService_Merchants_MerchantListResponseDto | null
) {
  handleMerchantChange(picked);
  setInvoice(withUpdatedTotals({ ...invoice, invoiceLines: [] }));
  if (!picked?.id) {
    setProductGroups(null);
    return;
  }
  void getMerchantProductGroupByIdApi(picked.id)
    .then((res) => setProductGroups(res.data))
    .catch(() => setProductGroups(null));
}
```

Two notes:

- The `.catch` matters. `getMerchantProductGroupByIdApi` **rethrows** on failure, and an `async` handler behind a `void`-returning `onChange` would otherwise produce an unhandled rejection with nothing shown to the operator.
- This deliberately differs from `scan-sticker`, which calls `buildInitialInvoice()` on a merchant pick and so also resets the invoice number. That is right there — a pick follows a fresh scan — and is its existing behaviour. Do not change either page to match the other.

- [ ] **Step 3: Replace the render body**

Replace everything from `<div className="rounded-md border">` (the `InvoiceForm` wrapper) and the header block above it with one `TagForm`. The merchant-selection logic — `isAgent`, the `CRMService.Merchants.ViewList` grant, `searchMerchants` and `getMerchantProductGroupByIdApi` — moves *out* of the deleted `invoice-form.tsx` and into this file, because it is this page's rule:

```tsx
const { session } = useSession();
const { grantedPolicies } = useGrantedPolicies();
const isAgent = session?.user?.MerchantId !== undefined;
const canSelectMerchant =
  !isAgent &&
  isActionGranted(
    ["CRMService.Merchants", "CRMService.Merchants.ViewList"],
    grantedPolicies
  );

async function handleMerchantPick(
  picked: UniRefund_CRMService_Merchants_MerchantListResponseDto | null
) {
  handleMerchantChange(picked);
  if (!picked?.id) {
    setProductGroups(null);
    return;
  }
  const res = await getMerchantProductGroupByIdApi(picked.id);
  setProductGroups(res.data);
}
```

Then:

```tsx
return (
  <div className="flex w-full items-center justify-center">
    <div className="flex w-full max-w-3xl flex-col gap-4 p-2 md:p-4">
      <TagForm<UniRefund_CRMService_Merchants_MerchantListResponseDto>
        testId="new-tag-v2"
        title={t.TagService.CreateTag}
        merchant={
          canSelectMerchant
            ? {
                mode: "select",
                testId: "new-tag-v2-select-merchant",
                disabled: isPending,
                fetchAction: searchMerchants,
                value: merchant,
                onChange: handleMerchantPick,
              }
            : {
                mode: "readonly",
                testId: "new-tag-v2-select-merchant",
                disabled: isPending,
                name: merchant?.name ?? "",
              }
        }
        invoice={invoice}
        setInvoice={setInvoice}
        productGroups={productGroups ?? []}
        countries={countries}
        traveller={activeTraveller}
        setTraveller={setActiveTraveller}
        onTravellerSignatureChange={setTravellerSignature}
        disabled={isPending}
      >
        <div className="flex flex-col gap-2">
          <SalesPersonSelector
            operators={salesOperators}
            value={salesPersonId}
            onChange={setSalesPersonId}
            defaultIndividualId={defaultIndividualId}
            disabled={isPending}
          />
          <PayoutTokenSelector
            traveller={hasTraveller ? activeTraveller : null}
            value={payoutToken}
            onChange={setPayoutToken}
            disabled={isPending}
          />
          <SignaturePad
            label={t.TagService["Form.NewTag.MerchantSignature"]}
            testId="new-tag-v2-merchant-signature"
            onSignatureChange={setMerchantSignature}
            disabled={isPending}
          />
          <Button
            data-testid="new-tag-v2-create-tag-button"
            disabled={!canSubmit || isPending}
            onClick={handleIssueTag}
          >
            {t.TagService.CreateTag}
            {isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ArrowRight className="size-4" />
            )}
          </Button>
        </div>
      </TagForm>
    </div>
  </div>
);
```

The `AddTravellerDialog` block in the old header is gone — `TagForm` renders it, with the same `new-tag-v2-add-traveller` testId prefix.

- [ ] **Step 4: Leave `canSubmit` and `handleIssueTag` alone**

`MIN_TOTAL_AMOUNT`, the `totalAmount > 100` guard, `hasTraveller`, `salesPersonIndividualId`, `payoutTokenFields` and the single `postTagApi` call are all this page's rules and do not change. Only the state name `invoices` → `invoice` needs updating inside them.

- [ ] **Step 5: Delete the old invoice form**

```bash
git rm "apps/web/src/app/[lang]/(main)/(unirefund)/operations/tax-free-tags/new/_components/invoice-form.tsx"
```

- [ ] **Step 6: Verify nothing still imports it**

```bash
grep -rn "new/_components/invoice-form\|from \"./_components/invoice-form\"" apps/web/src/
```

Expected: no hits outside `new-old/`, which has its own copy and is out of scope.

- [ ] **Step 7: Type-check and lint**

```bash
pnpm -C apps/web run type-check
pnpm -C apps/web run lint
```

Expected: both PASS. Remove any imports left unused by the deletion (`Switch`, `Popover*`, `AsyncSelectBase`, `DatePicker`, `Empty*`, `InputGroup*`).

- [ ] **Step 8: Commit**

```bash
git add -A "apps/web/src/app/[lang]/(main)/(unirefund)/operations/tax-free-tags/new"
git commit -m "refactor(new-tag): render the shared tag form"
```

---

### Task 6: Wire `scan-sticker`

**Files:**
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/scan-sticker/client.tsx`
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/scan-sticker/README.md`

**Interfaces:**
- Consumes: `TagForm` (Task 4), `buildInitialInvoice` (Task 2)
- Produces: nothing for later tasks

- [ ] **Step 1: Delete what moved**

Remove from `client.tsx`: the local `withUpdatedTotals`, `buildInitialInvoice`, `handleAddLine`, `handleRemoveLine`, the `selectedGroupId` and `amountInput` state, and the `parsedAmount` / `isAmountValid` pair. Import instead:

```tsx
import { buildInitialInvoice } from "@/components/tag-form/invoice";
import { TagForm } from "@/components/tag-form/tag-form";
```

Every `setSelectedGroupId(...)` and `setAmountInput("")` call in `handleScan`, `handleMerchantSelect` and `handleRescan` also goes — `TagForm` resets both off its `groupsKey`. Keep every other line of `handleRescan` (it still clears `scannedData`, `invoice`, the traveller and both signatures).

- [ ] **Step 2: Keep everything role-related exactly as it is**

Do not touch: `classifyScan`, `openTag`, `lookupMerchantInfo`, `lookupOwnMerchant`, the wedge-scanner `useEffect` (it subscribes to a DOM event, which the no-`useEffect` rule explicitly permits), the camera dialog, `REQUIRED_TRAVELLER_FIELDS`, `isTravellerComplete`, `ownMerchantId`, `canPickMerchant`, `canCreateTag`, `canViewTag`, `handleIssueTag` and its two endpoints, or the `isForeignAllocation` / `isMerchantAllocated` flags.

- [ ] **Step 3: Map the five merchant states onto the selector**

Add this above the return. It replaces the nested ternary in the old JSX one-for-one:

```tsx
type MerchantForTagCreation =
  UniRefund_CRMService_Merchants_MerchantForTagCreationDto;

function buildMerchantProps(
  data: ScannedData
): MerchantSelectorProps<MerchantForTagCreation> {
  const base = {
    testId: "scan-sticker-merchant",
    disabled: isPending,
    details: data.merchant
      ? {
          vatNumber: data.merchant.vatNumber,
          address: data.merchant.address,
        }
      : undefined,
  } as const;

  // Terminal: the book belongs to another store and an allocation cannot be
  // re-pointed. The toast is gone within seconds, so the card keeps saying it,
  // naming the store the sticker line reports.
  if (data.isForeignAllocation) {
    return {
      ...base,
      mode: "readonly",
      name: data.stickerLine.merchantName || "-",
      notice: {
        text: t.TagService["AssignSticker.MerchantAllocated"],
        tone: "error",
      },
    };
  }
  // Allocated book: the merchant is fixed and cannot be changed.
  if (data.isMerchantAllocated) {
    return {
      ...base,
      mode: "readonly",
      name: data.merchant?.name || "-",
      notice: {
        text: t.TagService["AssignSticker.MerchantAllocated"],
        tone: "muted",
      },
    };
  }
  // The operator *is* the merchant, so there is nothing to choose - but the book
  // is still unallocated, and issuing this tag allocates it to them permanently.
  if (isMerchantUser) {
    return {
      ...base,
      mode: "readonly",
      name: data.merchant?.name || "-",
      notice: {
        text: t.TagService["AssignSticker.AllocationWarning"],
        tone: "warning",
      },
    };
  }
  if (canPickMerchant) {
    return {
      ...base,
      mode: "select",
      fetchAction: searchMerchantsForTagCreation,
      value: data.merchant,
      onChange: handleMerchantSelect,
      notice: {
        text: t.TagService["AssignSticker.AllocationWarning"],
        tone: "warning",
      },
    };
  }
  return {
    ...base,
    mode: "hint",
    text: t.TagService["AssignSticker.SelectMerchant"],
  };
}
```

Import `MerchantSelectorProps` as a type from `@/components/tag-form/merchant-selector`.

- [ ] **Step 4: Change `handleMerchantSelect` to take one merchant**

`MerchantPicker` calls `onChange(selected[0] ?? null)`, so the handler no longer receives an array:

```tsx
async function handleMerchantSelect(picked: MerchantForTagCreation | null) {
  if (!picked?.id || !scannedData) return;
  // Re-reads with the pick to preview its details and product groups. The line
  // stays unallocated - nothing is allocated until the tag is created.
  const info = await lookupMerchantInfo(
    scannedData.stickerLine.stickerLineNumber,
    picked.id
  );
  const productGroups = (info?.merchant?.productGroups ?? []).filter(
    (pg) => pg.isActive
  );
  setScannedData({
    ...scannedData,
    isMerchantAllocated: info?.isMerchantAllocated ?? false,
    isForeignAllocation: false,
    merchant: info?.merchant ? { ...info.merchant, productGroups } : null,
    merchantIdentity: null,
    productGroups,
  });
  setInvoice(buildInitialInvoice());
}
```

- [ ] **Step 5: Replace the `scanned` branch**

Keep the outer container and its `pp-0 parent-overflow-hidden` contract with `SidebarLayout` exactly as documented in the README — do not add a height class:

```tsx
{pageStatus === "scanned" && scannedData && invoice && (
  <div className="m-auto flex w-full max-w-3xl flex-col gap-4 p-2 md:p-4">
    <TagForm<MerchantForTagCreation>
      testId="scan-sticker"
      title={
        <>
          <CheckCircle2 className="size-5 text-green-500" />
          {t.TagService["AssignSticker.ScanSuccess"]}
        </>
      }
      subtitle={scannedData.stickerLine.stickerLineNumber}
      merchant={buildMerchantProps(scannedData)}
      invoice={invoice}
      setInvoice={setInvoice}
      productGroups={scannedData.productGroups}
      countries={countries}
      traveller={traveller}
      setTraveller={setTraveller}
      onTravellerSignatureChange={setTravellerSignature}
      disabled={isPending}
    >
      <div className="flex flex-col gap-2">
        {/*
          Merchant pad only: the traveller signature is captured inside
          AddTravellerDialog. A Refund Point's CreateTagByStickerLineRequestDto
          has no merchant-signature field, so nothing renders for that role.
        */}
        {isMerchantUser && (
          <SignaturePad
            label={t.TagService["Form.NewTag.MerchantSignature"]}
            testId="scan-sticker-merchant-signature"
            onSignatureChange={setMerchantSignature}
            disabled={isPending}
          />
        )}
        {/*
          Buttons are `whitespace-nowrap shrink-0`, so side by side their labels
          cannot shrink and a long translation pushes past the card. Stacking
          below `sm` removes that overflow instead of clipping it.
        */}
        <div className="flex flex-col gap-2 pt-2 sm:flex-row">
          <Button
            data-testid="scan-sticker-rescan-button"
            variant="outline"
            onClick={handleRescan}
            disabled={isPending}
            className="flex-1"
          >
            <RotateCcw className="size-4" />
            {t.TagService["AssignSticker.Rescan"]}
          </Button>
          <Button
            data-testid="scan-sticker-issue-tag-button"
            onClick={handleIssueTag}
            disabled={
              isPending ||
              !canCreateTag ||
              !scannedData.merchant ||
              invoice.invoiceLines.length === 0 ||
              !invoice.invoiceNumber ||
              hasIncompleteTraveller ||
              (isMerchantUser &&
                !(scannedData.merchantIdentity?.vatNumber && countryCode2))
            }
            className="flex-1"
          >
            {isPending && <Spinner className="size-4" />}
            {t.TagService["AssignSticker.IssueTag"]}
          </Button>
        </div>
      </div>
    </TagForm>
  </div>
)}
```

The `Issue tag` disabled expression is unchanged apart from the testid prefix — every clause still matters, and `handleIssueTag` re-checks all of them.

- [ ] **Step 6: Update the README**

Two sections describe code that has moved. Rewrite them to point at the shared component rather than deleting them:

- **"Building the invoice"** — keep the chip-and-amount description and the VAT-inclusive formula, but say the control and the arithmetic now live in `src/components/tag-form/` (`tag-form.tsx` and `invoice.ts`), shared with `operations/tax-free-tags/new`. Note that the issue date is now editable, where the page previously always sent "now".
- **"Resolving the merchant"** — keep the three-branch table and every allocation rule; add that the branches are now expressed as `MerchantSelector` modes (`readonly` / `select` / `hint` plus a `notice` tone), and that the picker still calls `searchMerchantsForTagCreation` under `TagService.Tags.ViewMerchantsForCreation`.

Also update the `data-testid` values if the README names any, and note in "Traveller and signatures" that `SignaturePad`'s testId is now `scan-sticker-merchant-signature`.

- [ ] **Step 7: Type-check and lint**

```bash
pnpm -C apps/web run type-check
pnpm -C apps/web run lint
```

Expected: both PASS. Remove imports left unused (`Input`, `Label`, `AsyncSelect`, `cn` if no longer referenced).

- [ ] **Step 8: Commit**

```bash
git add -A "apps/web/src/app/[lang]/(main)/(unirefund)/operations/scan-sticker"
git commit -m "refactor(scan-sticker): render the shared tag form"
```

---

### Task 7: Prune the dead invoice code

**Files:**
- Modify: `apps/web/src/language-data/unirefund/TagService/resources/en.json`
- Modify: `apps/web/src/language-data/unirefund/TagService/resources/tr.json`

**Interfaces:**
- Consumes: Tasks 5 and 6 complete (the last readers of the retired keys are gone)
- Produces: nothing

- [ ] **Step 1: Delete the retired keys, deferred here from Task 1**

Chips have no enabled/disabled state, so the counter became a line count. First confirm who still reads them:

```bash
grep -rn "Form.NewTag.EnabledGroups" apps/web/src/
```

- **Hits only in `apps/web/src/language-data/`** (the resource and generated files): delete `Form.NewTag.EnabledGroups` and `Form.NewTag.EnabledGroupsPlural` from **both** `en.json` and `tr.json`, then run `pnpm -C apps/web run init`.
- **Any hit in `new-old/`**: leave both keys in place. `new-old/` is explicitly out of scope, and removing a key it reads would break its build. Note this in your report and skip to Step 2.
- **Any hit anywhere else**: stop and report — Task 5 or 6 left a reader behind.

- [ ] **Step 2: Check for other orphans**

```bash
grep -rn "getInitialInvoiceLines\|withUpdatedTotals" apps/web/src/
```

Expected: `withUpdatedTotals` only in `components/tag-form/invoice.ts` and `new-old/`; `getInitialInvoiceLines` only in `new-old/`.

- [ ] **Step 3: Retire `MerchantPicker`'s export and fix its stale comment**

Dropping the duplicate picker from `TagForm`'s empty state left two things behind in `apps/web/src/components/tag-form/merchant-selector.tsx`.

First confirm nothing outside that file imports it:

```bash
grep -rn "MerchantPicker" apps/web/src/
```

Expected: hits only inside `merchant-selector.tsx` — its declaration and its one use inside `MerchantSelector`. If any other file imports it, stop and report instead.

Then:

1. **Un-export it.** Change `export function MerchantPicker<T extends SelectableMerchant>(` to `function MerchantPicker<T extends SelectableMerchant>(`. It is used only internally now, and an export with no consumer is speculative API. ESLint's `no-unused-vars` does not flag exported bindings, which is exactly why this needs doing by hand. Leave `MerchantSelector` and every type export alone.
2. **Fix the doc comment above it**, which now describes a render site that no longer exists:

```ts
/**
 * The picker itself, with no label or notice around it. Internal to this module:
 * `MerchantSelector` renders it for `mode: "select"`, and it is the only picker
 * on screen - `TagForm` deliberately does not promote a second copy into its
 * empty state, because the merchant row is always visible.
 */
```

- [ ] **Step 4: Type-check, lint, and commit each change separately**

```bash
pnpm -C apps/web run type-check
pnpm -C apps/web run lint
```

`type-check` is the real gate for Step 1: a key that some file still reads becomes a type error the moment it leaves the generated map. If that happens, restore the keys and report which file still reads them.

Commit the i18n prune and the `MerchantPicker` change **separately** — they are logically independent. Skip a commit for any step that changed nothing.

---

### Task 8: Full verification

**Files:**
- Modify: none, unless a failure needs fixing

**Interfaces:**
- Consumes: all previous tasks
- Produces: a verified branch

- [ ] **Step 1: Format**

```bash
pnpm -C apps/web run format
```

- [ ] **Step 2: Full gate**

```bash
pnpm -C apps/web run type-check
pnpm -C apps/web run lint
pnpm -C apps/web run build
```

All three must pass. `build` runs `init` first, so it also proves the i18n keys generate cleanly.

- [ ] **Step 3: Confirm the e2e suite is unaffected**

```bash
grep -rn "new-tag-v2\|scan-sticker\|add-line\|product-group-chip" apps/web/tests/
```

Expected: no hits. Do **not** run `pnpm test` — every project depends on a missing `tests/core/auth/auth.setup.ts` and a live tenant, so a failure there would say nothing about this change.

- [ ] **Step 4: Manual pass — `tax-free-tags/new`**

```bash
pnpm -C apps/web run dev
```

Then at `/en/operations/tax-free-tags/new`:

- with no merchant chosen: the merchant row shows the picker, and an empty state below explains there are no product groups
- pick a merchant: chips appear, the merchant's default group is pre-selected, invoice number and issue date render
- the invoice number field starts **empty** with `INV-001` as grey placeholder text — this is the bug fix; typing `1234` must yield `1234`, not `INV-0011234`
- type an amount, press Enter: a line is added and the amount field clears
- add to the same chip twice: one line, amounts summed
- add `0.1` three times: the line reads `0.30`
- VAT and total update; total over 100 enables `Create Tag`
- change the merchant: chips, selection and lines all reset
- `Add traveller`, sales person, payout token and merchant signature all still work
- create a tag and confirm the redirect to its detail page

- [ ] **Step 5: Manual pass — `scan-sticker` as a merchant**

At `/en/operations/scan-sticker`, signed in with a `MerchantId` and no `RefundPointId`:

- scan a sticker on an unallocated book: the merchant row is read-only with the orange allocation warning, and VAT + address show beneath
- scan a book allocated to **another** store: the error-toned "already allocated" notice, the other store's name, and `Issue tag` stays disabled
- the issue date is now editable — change it and confirm the created tag carries it
- the merchant signature pad renders; `Rescan` clears the traveller, both signatures, the invoice and the chip selection
- issue a tag and confirm it posts to `POST /tag` (not `by-sticker-line`) with `stickerLineNumber`

- [ ] **Step 6: Manual pass — `scan-sticker` as a Refund Point**

Signed in with a `RefundPointId` (a stray `MerchantId` alongside it must not change anything):

- unallocated book: the merchant **picker** shows with the allocation warning; picking a merchant loads its product groups and resets the chips
- allocated book: read-only name with the muted notice, no picker
- **no** merchant signature pad renders
- issue a tag and confirm it posts to `POST /tag/by-sticker-line`, with `merchantId` present only for an unallocated line

- [ ] **Step 7: Check the tag QR and validate QR paths still work**

Scanning a tag QR must still navigate to that tag's detail page; scanning a traveller validate QR must still refuse with `AssignSticker.ValidateQrNotUsable`. Neither goes through `TagForm`, so a regression here means Task 6 Step 2 was not respected.

- [ ] **Step 8: Final commit**

```bash
git status
git add -A
git commit -m "chore(tag-form): formatting after the shared form migration"
```

Skip if `format` changed nothing.

---

## Self-Review

**Spec coverage**

| Spec section | Task |
| --- | --- |
| `invoice.ts` helpers | 2 |
| `merchant-selector.tsx` | 3 |
| `tag-form.tsx` | 4 |
| Merchant block: share the look, inject the data | 3 (component), 5 + 6 (both call sites) |
| Invoice number + issue date from `new` | 4 |
| Product-group chips from `scan-sticker` | 4 |
| Totals via `Intl.NumberFormat` | 4 |
| Traveller dialog unchanged | 4 (rendered by `TagForm` with a `testId` prefix) |
| `invoice` non-nullable at the boundary | 4 (prop), 5 + 6 (narrowed at both call sites) |
| Amount field uses `new`'s `InputGroup` styling | 4 |
| No-`useEffect` prop-change reset | 4 |
| Language keys → `TagService`, retire enabled-group counters | 1, 7 |
| `Default` keys stay put | 4 (uses `t.Default.From` / `.To` only) |
| Types only from `packages/saas` | 2, 3, 4 |
| scan-sticker keeps role rules and both endpoints | 6 Step 2 |
| `new` keeps sales person, payout token, `MIN_TOTAL_AMOUNT` | 5 Step 4 |
| Merchant row always visible | 4 |
| `data-testid` prefixes | 4, 5, 6 |
| README repointed | 6 Step 6 |
| `new-old/` untouched | 5 Step 6, 7 Steps 1-2 |
| Verification: type-check, lint, build, manual in both roles | 8 |

Gap found and closed: the spec assumed the workspace was buildable. Both submodules are uninitialized and `node_modules` is absent, so **Task 0** was added — nothing else can be verified without it.

**Placeholder scan**

No `TBD`, `TODO`, "handle edge cases", or "similar to Task N". Every code step carries the actual code. The two places that say "adjust if the real signature differs" (Task 3 Step 2, Task 2 Step 2) name the exact fallback to use, because `packages/ayasofyazilim-ui` is an uninitialized submodule and its types cannot be read until Task 0 runs.

**Type consistency**

- `InvoiceRequestDto` / `ProductGroupRelationDto` are defined and exported in Task 2 and imported under those names in Task 4. ✓
- `isAmountValid(raw: string)` takes a string in Task 2 and is called with `amountInput` (a string) in Task 4. ✓
- `addInvoiceLine(invoice, group, amount)` — Task 4 passes `parseFloat(amountInput)`, a number. ✓
- `removeInvoiceLine(invoice, productGroupId)` accepts `string | null | undefined`, matching `line.productGroupId` from the generated DTO. ✓
- `MerchantSelectorProps<T>`, `SelectableMerchant`, `MerchantFetchAction<T>`, `MerchantNotice` are defined in Task 3 and used in Tasks 4, 5, 6 under those names. ✓
- `MerchantPicker`'s `onChange` receives `T | null`; Task 5's `handleMerchantPick` and Task 6's `handleMerchantSelect` both take `T | null`, and Task 6 Step 4 exists specifically to change the old array signature. ✓
- `TagForm`'s prop is `invoice` (singular). Task 5 Step 1 renames `invoices` → `invoice` on that page so the two agree. ✓
- `testId` is a required string on `TagForm`, `MerchantSelector`, `MerchantPicker`, `SignaturePad` and `AddTravellerDialog`; every call site passes one. ✓

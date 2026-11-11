# Detailed Create-Tag Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second, invoice-style create-tag page at
`operations/tax-free-tags/new-detailed`. On it the cashier enters editable
lines (product group, quantity, unit price), and each line is posted as its
own invoice line.

**Architecture:** The server `page.tsx` is a copy of `new/page.tsx`. All line
logic goes in a pure, unit-tested `lines.ts`. A `line-table.tsx` renders the
editable rows. `client.tsx` owns the state and the two-column layout, and
reuses the existing traveller, merchant, sales-person, payout and signature
components. `TagForm` and `invoice.ts` are not modified.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict,
`@repo/ayasofyazilim-ui`, `node --test` via tsx.

**Spec:** `docs/superpowers/specs/2026-11-11-detailed-create-tag-design.md`

## Global Constraints

- **Workspace:** `web-app` is currently checked out on
  `fix/uni-1886-sticker-position-check`, with another session's uncommitted
  changes. Do **not** work there. Create a worktree from `origin/main` on a
  new branch, `feat/detailed-create-tag`, following
  `superpowers:using-git-worktrees`, and give it real `node_modules` (memory:
  a junction breaks things; stagger installs).
- Route root:
  `apps/web/src/app/[lang]/(main)/(unirefund)/operations/tax-free-tags/new-detailed/`
  (shortened below to `new-detailed/`).
- Do not modify `components/tag-form/*`, `operations/tax-free-tags/new/*` or
  `scan-sticker/*`.
- No sidebar item, and no tenant switch.
- No `useEffect`, except the debounced quote timer (an external timer is
  allowed by `avoid-use-effect.md`).
- Every UI string goes in TagService `en.json` + `tr.json`. Turkish is written
  by Claude, reusing existing terms. Run `pnpm run init` after adding keys.
- Every required component has a `data-testid` with the prefix `new-tag-detailed-`.
- Write few comments: only a non-obvious *why*.
- Gates must hold at baseline: `pnpm --filter web type-check` (2 TS2307
  baseline errors), `pnpm --filter web lint` (0 errors), `pnpm --filter web
  test:unit`, `pnpm i18n:missing --app=web`, `pnpm policy:audit`.

## Review Focus

1. **Turkish decimal comma**: a `tr` cashier types `8999,50`. It must be
   accepted as 8999.50, not rejected or read as 899950. Test pinned in Task 1.
2. **Changing the merchant**: the rows must clear, because the old merchant's
   groups and VAT rates must not survive into the new merchant's create. The
   invoice number and date are kept. Checked by hand in Task 3.
3. **A half-typed row**: Issue is disabled and no quote is requested, but the
   totals still show the complete rows. Tests pinned in Task 1.
4. **Float drift**: 3 × 0.10 must post `amount: 0.3`, not
   `0.30000000000000004`. Test pinned in Task 1.
5. **Deleting every row**: there is no crash, the totals go to 0, and the
   minimum-sale warning hides because there are no lines (same as
   `shouldWarnBelowMinimum` with 0 lines). Checked by hand in Task 3.

---

### Task 1: Line model (`lines.ts`)

**Files:**
- Create: `new-detailed/_components/lines.ts`
- Test: `new-detailed/_components/lines.test.ts`

**Interfaces:**
- Consumes: `withUpdatedTotals`, `InvoiceRequestDto` and
  `ProductGroupRelationDto` from `@/components/tag-form/invoice`.
- Produces:
  ```ts
  export type InvoiceLine = InvoiceRequestDto["invoiceLines"][number];
  export type DraftLine = {
    key: string;
    productGroupId: string | null;
    quantity: string;   // raw input
    unitPrice: string;  // raw input
  };
  export function newDraftLine(defaultGroupId: string | null, key?: string): DraftLine; // quantity "1", unitPrice ""
  export function defaultGroupIdOf(groups: ProductGroupRelationDto[]): string | null; // isDefault, else first, else null
  export function parseUnitPrice(raw: string): number | null; // accepts "," as the decimal separator; >0, finite, ≤2 decimals
  export function parseQuantity(raw: string): number | null;  // integer ≥ 1
  export function buildLine(draft: DraftLine, groups: ProductGroupRelationDto[]): InvoiceLine | null;
  export function buildInvoice(
    base: InvoiceRequestDto,
    drafts: DraftLine[],
    groups: ProductGroupRelationDto[]
  ): { invoice: InvoiceRequestDto; invalidKeys: string[] };
  export function quoteKeyOf(invoice: InvoiceRequestDto): string;
  ```

- [ ] **Step 1: Write the failing tests** in `lines.test.ts` (style: `node:assert/strict` + `node:test`, as in `../../_components/correction-filter.test.ts`). The fixture groups are `phone = { productGroupId: "g-phone", vatRate: 25, isDefault: false, ... }` and `acc = { productGroupId: "g-acc", vatRate: 25, isDefault: true, ... }` (cast the partial fixture objects `as ProductGroupRelationDto`).
  - `parseUnitPrice`: `"8999"`→8999, `"8999,50"`→8999.5, `"8999.50"`→8999.5, `"1.005"`→null, `"0"`→null, `"-1"`→null, `"1e999"`→null, `""`→null, `"abc"`→null.
  - `parseQuantity`: `"2"`→2, `"1.5"`→null, `"0"`→null, `""`→null.
  - `defaultGroupIdOf([phone, acc])` → `"g-acc"`; `defaultGroupIdOf([phone])` → `"g-phone"`; `[]` → null.
  - `buildLine({key:"a", productGroupId:"g-phone", quantity:"2", unitPrice:"8999"}, groups)` deep-equals `{ amount: 17998, taxAmount: 3599.6, taxBase: 14398.4, taxRate: 25, productGroupId: "g-phone" }`. Compare with a tolerance of 1e-9 for taxAmount and taxBase.
  - `buildLine` with quantity `"3"` and price `"0.1"` → `amount === 0.3` (strict).
  - `buildLine` with an unknown group id, a null group, or an invalid qty or price → null.
  - `buildInvoice` with two drafts, both `g-phone` (2×8999 and 1×399) → 2 lines, `totalAmount === 18397`, `invalidKeys` `[]`.
  - `buildInvoice` with one valid draft and one draft with price `""` → 1 line, `invalidKeys` `["b"]`, and totals from the valid line only.
  - `quoteKeyOf` is equal for two invoices that differ only in `uuid`, and different when a line amount changes. It must not resolve the invoice number: a blank number gives the same key on two calls made 5 ms apart.

- [ ] **Step 2: Run them and see them fail**
  Run: `pnpm --filter web exec node --import tsx --test "src/app/[[]lang]/**/new-detailed/_components/lines.test.ts"` (or `pnpm --filter web test:unit`)
  Expected: FAIL, module not found.

- [ ] **Step 3: Implement `lines.ts`.** `buildLine` uses the same formula as `addInvoiceLine`: `amount = Math.round(qty * price * 100) / 100`, `taxAmount = amount * rate / (100 + rate)`, `taxBase = amount - taxAmount`. `buildInvoice` returns `withUpdatedTotals({ ...base, invoiceLines })`. `quoteKeyOf` stringifies `{ issueDate, invoiceNumber, invoiceLines }`.

- [ ] **Step 4: Run them and see them pass.** `pnpm --filter web test:unit`. Expected: all suites pass, including the new one.

- [ ] **Step 5: Commit**: `feat(web): line model for the detailed create-tag page`

### Task 2: Editable line table (`line-table.tsx`) + i18n keys

**Files:**
- Create: `new-detailed/_components/line-table.tsx`
- Create: `new-detailed/_components/product-group-cell.tsx`
- Modify: `apps/web/src/language-data/unirefund/TagService/resources/en.json`, `tr.json`

**Interfaces:**
- Consumes: Task 1's `DraftLine`, `buildLine`, `newDraftLine`,
  `parseUnitPrice`, `parseQuantity`.
- Produces:
  ```tsx
  export function LineTable(props: {
    drafts: DraftLine[];
    onChange: (drafts: DraftLine[]) => void;
    groups: ProductGroupRelationDto[];
    defaultGroupId: string | null;
    disabled?: boolean;
  }): JSX.Element;
  export function ProductGroupCell(props: {
    value: string | null;
    groups: ProductGroupRelationDto[];
    onChange: (id: string) => void;
    disabled?: boolean;
    testId: string;
  }): JSX.Element; // the single swap point for the future product search
  ```

- [ ] **Step 1: Add the keys** (EN / TR) under TagService:
  `CreateTagDetailed.Title` "Create tag (detailed)" / "Etiket oluştur (detaylı)";
  `CreateTagDetailed.Column.ProductGroup` "Product group" / "Ürün grubu";
  `CreateTagDetailed.Column.Quantity` "Qty" / "Adet";
  `CreateTagDetailed.Column.UnitPrice` "Unit price" / "Birim fiyat";
  `CreateTagDetailed.Column.Vat` "VAT" / "KDV";
  `CreateTagDetailed.Column.Amount` "Amount" / "Tutar";
  `CreateTagDetailed.InvalidLine` "Complete or remove this line" / "Bu satırı tamamlayın ya da silin";
  `CreateTagDetailed.Net` "Net (excl. VAT)" / "Net (KDV hariç)".
  Reuse the existing `Form.NewTag.AddLine` and `Form.NewTag.RemoveLine`.
  Before adding, check `tr.json` for terms that already exist, and match them.
  Then run `pnpm run init`.

- [ ] **Step 2: Implement `ProductGroupCell`** using `Select` from
  `@repo/ayasofyazilim-ui/components/select`. Each option label is
  `{productGroupName} {vatRate}%`. `SelectTrigger` gets `data-testid={testId}`.

- [ ] **Step 3: Implement `LineTable`** with the `Table` primitives from
  `@repo/ayasofyazilim-ui/components/table` (presentation table, not
  MasterDataGrid).
  - Columns, in order: group, qty, unit price, VAT %, amount, remove.
  - Qty and price are `Input type="text" inputMode="decimal"`, so the
    Turkish comma isn't blocked by `type=number`.
  - VAT % and Amount are read-only, from `buildLine`. A row that `buildLine`
    rejects shows "–" for amount and a red outline on whichever input is
    invalid, with `CreateTagDetailed.InvalidLine` on hover. Leave the outline
    off while qty is "1" and price is "", so a fresh empty row isn't flagged.
  - Below the table is an "Add line" `Button` that appends
    `newDraftLine(defaultGroupId)`.
  - Test ids: `new-tag-detailed-line-{key}-group|qty|price|remove` and
    `new-tag-detailed-add-line`.

- [ ] **Step 4: Verify.** `pnpm --filter web type-check` gives exactly the
  2 baseline errors. `pnpm --filter web lint` gives 0 errors.

- [ ] **Step 5: Commit**: `feat(web): editable invoice line table`

### Task 3: Page + client (two-column layout, submit, quote)

**Files:**
- Create: `new-detailed/page.tsx`
- Create: `new-detailed/client.tsx`

**Interfaces:**
- Consumes: Task 1 (`buildInvoice`, `quoteKeyOf`, `defaultGroupIdOf`,
  `newDraftLine`) and Task 2 (`LineTable`). Also reuses, unchanged:
  `MerchantSelector` (`@/components/tag-form/merchant-selector`),
  `AddTravellerDialog` (`@/components/add-traveller-dialog`),
  `SalesPersonSelector`/`loadSalesOperators`/`NO_SALES_PERSON`
  (`../_components/sales-person-selector`), `PayoutTokenSelector`/
  `payoutTokenFields`, `SignaturePad`, `buildInitialInvoice`,
  `invoiceForSubmit`, and the `tag-minimum` helpers.
- Produces: the route `/{lang}/operations/tax-free-tags/new-detailed`.

- [ ] **Step 1: `page.tsx`.** A copy of `new/page.tsx`, with the same
  `guardPage` set and `getApiRequests`, rendering `./client`'s `Client`.

- [ ] **Step 2: `client.tsx` state and behaviour**, mirroring `new/client.tsx`
  except for these differences:
  - State: `drafts: DraftLine[]`, which starts as
    `[newDraftLine(defaultGroupIdOf(initialProductGroups ?? []))]` when there
    are groups and `[]` otherwise. `invoiceBase` comes from
    `buildInitialInvoice()` and holds only the number and date edits.
  - Derived during render: `const { invoice, invalidKeys } =
    buildInvoice(invoiceBase, drafts, productGroups ?? [])`.
  - `canSubmit = Boolean(merchant) && invoice.invoiceLines.length > 0 &&
    invalidKeys.length === 0 && meetsTagMinimum(invoice.totalAmount, min)`.
  - Merchant pick: as `handleMerchantPick` in the old page, and it also resets
    `drafts` to `[newDraftLine(defaultGroupIdOf(newGroups))]` once the groups
    arrive (and to `[]` while they are loading or null).
  - Quote: `quoteKey = canPreview && canSubmit ? quoteKeyOf(invoice) : ""`,
    with the same 600 ms debounced effect and ref pattern as the old page.
  - Submit: the same body builder as the old page, with
    `invoices: [invoiceForSubmit(invoice)]`, `postTagApi` and
    `handlePostResponse` to `operations/tax-free-tags`.

- [ ] **Step 3: `client.tsx` layout.**
  - Root:
    `<div className="flex w-full justify-center"><div className="grid w-full max-w-6xl gap-4 p-2 md:p-4 lg:grid-cols-3">`.
  - Left (`lg:col-span-2`): a header with the `CreateTagDetailed.Title` h1 and
    `AddTravellerDialog`, the `MerchantSelector` card, and an invoice card with
    the invoice number and date. Copy `TagForm`'s fields, including the
    `DatePicker key={invoice.uuid}` and the always-visible auto-generate hint.
    Then `LineTable`, or `Empty` with the same title/description keys as
    `TagForm` when there are no groups.
  - Right (`lg:sticky lg:top-4 self-start`): sales person, payout, a totals
    block (`CreateTagDetailed.Net` = Σ taxBase, `VatAmount`,
    `Form.NewTag.TotalAmount`), the quote block, the minimum warning,
    `SignaturePad` and the Issue button.
  - Test ids: prefix `new-tag-detailed-`, e.g. `new-tag-detailed-create-tag-button`.

- [ ] **Step 4: Gates.** `pnpm --filter web type-check` (2 baseline errors),
  `pnpm --filter web lint` (0 errors), `pnpm --filter web test:unit`,
  `pnpm i18n:missing --app=web` (NEEDS_KEY 0), `pnpm policy:audit` (exit 0).

- [ ] **Step 5: Manual check on the dev server** (an already-running one,
  or start it detached on a free port; never `next build` beside a running
  dev server).
  - Log in as `siggi.merchant` (Faroe Islands).
  - Open `/en/operations/tax-free-tags/new-detailed`.
  - Run through Review Focus 1, 2 and 5 at desktop and at mobile width.
  - Issue a tag with 2 × Phone lines plus 1 accessory line.
  - Record whether the response or tag detail keeps the two same-group lines
    separate. This goes in the PR, and is not a blocker (spec decision).
  - Confirm `/en/operations/tax-free-tags/new` is unchanged.

- [ ] **Step 6: Commit**: `feat(web): detailed invoice-style create-tag page`

### Task 4: PR

- [ ] Open the PR with the web-app `create-pr` skill, against `main`.
- [ ] The PR body says:
  - the page is reachable by URL only, and tenant routing is decided later;
  - what the same-group check on dev showed;
  - the backend fields still needed (`productId`, `quantity`, `unitPrice`
    on the line, and a product lookup);
  - the suspected re-quote-every-render in the old page's `quoteKey`, which
    is not fixed here.

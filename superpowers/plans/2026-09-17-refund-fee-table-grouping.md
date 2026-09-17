# Refund Fee Table Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the flat refund fee detail table into an accordion of sections keyed on fee type + refund method, refund method, or fee type, each section holding its own table rows and its own visualizer.

**Architecture:** Grouping is a pure view over a flat `react-hook-form` field array. A new `sectionRefundFeeDetails` in the existing `detail-groups.ts` module buckets rows while preserving each row's index in that array; the components render those buckets. No form state, schema, or submitted payload changes.

**Tech Stack:** Next.js App Router, React 19, react-hook-form + `useFieldArray`, zod, Radix-based `@repo/ayasofyazilim-ui` components, `node --import tsx --test` for unit tests.

**Spec:** `docs/superpowers/specs/2026-09-17-refund-fee-table-grouping-design.md`

## Global Constraints

- All paths below are relative to the repo root `C:\unirefund\web-app`. The route directory is `apps/web/src/app/[lang]/(main)/(unirefund)/settings/templates/refund-fees/`, abbreviated **`<ROUTE>`** throughout.
- Run every command from `apps/web`, not the repo root.
- Unit tests: `npm run test:unit` → `node --import tsx --test "src/**/*.test.ts"`. **It only loads `.ts`, never `.tsx`.** All logic that needs a test must live in a `.ts` module.
- Baseline before this plan starts: **217 tests, 216 pass, 0 fail, 1 skipped**. Any other number means something regressed.
- `npx tsc --noEmit` must exit 0. `npx eslint "src/app/[lang]/(main)/(unirefund)/settings/templates/refund-fees/"` must exit 0.
- `eslint-plugin-react-require-testid` is enforced: **every interactive element needs a `data-testid`**, including `AccordionTrigger`, `SelectTrigger` and every `Button`.
- A pre-commit hook runs `prettier --write` on staged files and can re-stage reformatted content. After each commit run `git show --name-only HEAD` and confirm only the intended files are listed — this repo's hook has previously swept an unrelated submodule pointer into a commit.
- Do not sort rows by amount anywhere in the table. Sorting belongs to `groupRefundFeeDetails` (read-only) only.
- Do not coerce amounts in section rows. Coercion belongs to `groupRefundFeeDetails` only.
- Commit messages end with the line `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

---

## File Structure

| File | Responsibility |
|---|---|
| `<ROUTE>_components/detail-groups.ts` | **Modify.** Pure grouping/validation. Gains `GroupingMode`, `RefundFeeSection`, `sectionRefundFeeDetails`. Already holds `groupRefundFeeDetails`, `availableTargetMethods`, `duplicateGroupRows`. |
| `<ROUTE>_components/detail-groups.test.ts` | **Modify.** Unit tests for the above. |
| `<ROUTE>_components/form-values.ts` | **Create.** Shared `schemas`, `RefundFeeDetailsFormValues`, `feeTypes`, `refundMethods`. Exists to break the import cycle between the table and the extracted row. |
| `<ROUTE>_components/detail-row.tsx` | **Create.** One `<TableRow>` of eight cells, addressed by field-array index. |
| `<ROUTE>_components/refund-fee-details.tsx` | **Modify.** Toolbar + accordion shell. |
| `apps/web/src/language-data/unirefund/ContractService/resources/en.json` | **Modify.** Five new keys. |
| `apps/web/src/language-data/unirefund/ContractService/resources/tr.json` | **Modify.** Same five keys. |

---

## Task 1: `sectionRefundFeeDetails`

**Files:**
- Modify: `<ROUTE>_components/detail-groups.ts` (append at end of file)
- Test: `<ROUTE>_components/detail-groups.test.ts` (append at end of file)

**Interfaces:**
- Consumes: `RefundFeeDetail` from `./schema`; `RefundFeeIssue` and `groupRefundFeeDetails` already exported from `detail-groups.ts`.
- Produces: `GroupingMode`, `RefundFeeSection`, `sectionRefundFeeDetails` — Tasks 3 and 4 depend on these exact names and shapes.

The test file already defines a `row()` helper at its top with this signature — reuse it, do not redefine:

```ts
const row = (
  amountFrom: number | string,
  amountTo: number | string,
  feeType = "TouristFee",
  refundMethod = "Cash"
): RefundFeeDetail => ({ /* ...fee fields default to 0, originalIndex: 0 */ });
```

- [ ] **Step 1: Write the failing tests**

Append to `<ROUTE>_components/detail-groups.test.ts`:

```ts
describe("sectionRefundFeeDetails", () => {
  it("makes one section per fee type and refund method in combined mode", () => {
    const details = [
      row("0", "100", "TouristFee", "Cash"),
      row("0", "250", "AgentFee", "Cash"),
      row("0", "100", "TouristFee", "CreditCard"),
    ];

    assert.deepEqual(
      sectionRefundFeeDetails(details, "combined").map((s) => s.key),
      ["TouristFee-Cash", "AgentFee-Cash", "TouristFee-CreditCard"]
    );
  });

  it("merges fee types into one section when grouping by refund method", () => {
    const details = [
      row("0", "100", "TouristFee", "Cash"),
      row("0", "250", "AgentFee", "Cash"),
    ];

    const sections = sectionRefundFeeDetails(details, "refundMethod");

    assert.deepEqual(sections.map((s) => s.key), ["Cash"]);
    assert.equal(sections[0]!.rows.length, 2);
    assert.equal(sections[0]!.refundMethod, "Cash");
    assert.equal(sections[0]!.feeType, undefined);
  });

  it("merges refund methods into one section when grouping by fee type", () => {
    const details = [
      row("0", "100", "TouristFee", "Cash"),
      row("0", "100", "TouristFee", "CreditCard"),
    ];

    const sections = sectionRefundFeeDetails(details, "feeType");

    assert.deepEqual(sections.map((s) => s.key), ["TouristFee"]);
    assert.equal(sections[0]!.feeType, "TouristFee");
    assert.equal(sections[0]!.refundMethod, undefined);
  });

  it("keeps every row addressable by its field-array index in every mode", () => {
    const details = [
      row("0", "100", "TouristFee", "Cash"),
      row("0", "250", "AgentFee", "CreditCard"),
      row("100", "500", "TouristFee", "Cash"),
    ];

    for (const mode of ["combined", "refundMethod", "feeType"] as const) {
      const sections = sectionRefundFeeDetails(details, mode);
      const seen: number[] = [];

      for (const section of sections) {
        for (const sectionRow of section.rows) {
          const source = details[sectionRow.originalIndex]!;
          assert.equal(sectionRow.amountFrom, source.amountFrom, mode);
          assert.equal(sectionRow.feeType, source.feeType, mode);
          assert.equal(sectionRow.refundMethod, source.refundMethod, mode);
          seen.push(sectionRow.originalIndex);
        }
      }

      assert.deepEqual(seen.sort((a, b) => a - b), [0, 1, 2], mode);
    }
  });

  it("keeps rows in field-array order and uncoerced", () => {
    const details = [
      row("100", "5000", "TouristFee", "Cash"),
      row("0", "100", "TouristFee", "Cash"),
    ];

    const [section] = sectionRefundFeeDetails(details, "combined");

    assert.deepEqual(
      section!.rows.map((r) => r.amountFrom),
      ["100", "0"]
    );
  });

  it("reports a section as broken when any ladder inside it is broken", () => {
    const details = [
      row("0", "100", "TouristFee", "Cash"),
      row("0", "100", "AgentFee", "Cash"),
      row("100", "50", "AgentFee", "Cash"),
    ];

    const [section] = sectionRefundFeeDetails(details, "refundMethod");

    assert.equal(section!.key, "Cash");
    assert.ok(
      section!.issues.some((issue) => issue.code === "invalid_range"),
      "the AgentFee ladder is inverted"
    );
  });

  it("returns no sections for an empty list", () => {
    assert.deepEqual(sectionRefundFeeDetails([], "combined"), []);
  });
});
```

Then extend the import at the top of the same file to:

```ts
import {
  availableTargetMethods,
  duplicateGroupRows,
  groupRefundFeeDetails,
  sectionRefundFeeDetails,
} from "./detail-groups";
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit`
Expected: `# fail 7`, each erroring with `sectionRefundFeeDetails is not a function`. If you see a different error, fix the test before implementing.

- [ ] **Step 3: Write the implementation**

Append to `<ROUTE>_components/detail-groups.ts`:

```ts
export type GroupingMode = "combined" | "refundMethod" | "feeType";

export interface RefundFeeSection {
  key: string;
  /** Set only when the mode holds it constant across the section. */
  feeType?: string;
  refundMethod?: string;
  /** Raw rows, in field-array order, each carrying its originalIndex. */
  rows: RefundFeeDetail[];
  /** Every issue of every ladder in this section. */
  issues: RefundFeeIssue[];
}

function sectionKeyOf(detail: RefundFeeDetail, mode: GroupingMode): string {
  if (mode === "refundMethod") return detail.refundMethod;
  if (mode === "feeType") return detail.feeType;
  return `${detail.feeType}-${detail.refundMethod}`;
}

/**
 * Buckets rows for display. The form state stays one flat array - every input
 * is registered at `refundFeeDetails.${originalIndex}` and useFieldArray's
 * remove() addresses the same positions - so each row carries the index it came
 * from. Rows are neither sorted nor coerced here: this feeds an editing
 * surface, and reordering or rewriting a cell mid-keystroke would fight the
 * user. `groupRefundFeeDetails` does both, which is why issues are computed
 * through it rather than inline.
 */
export function sectionRefundFeeDetails(
  details: RefundFeeDetail[],
  mode: GroupingMode
): RefundFeeSection[] {
  const sections = new Map<string, RefundFeeDetail[]>();

  details.forEach((detail, originalIndex) => {
    const key = sectionKeyOf(detail, mode);
    const rows = sections.get(key) ?? [];
    rows.push({ ...detail, originalIndex });
    sections.set(key, rows);
  });

  // Map iteration order is insertion order, so sections follow first
  // appearance in the field array and do not reshuffle as rows are edited.
  return Array.from(sections.entries()).map(([key, rows]) => ({
    key,
    feeType: mode === "refundMethod" ? undefined : rows[0]!.feeType,
    refundMethod: mode === "feeType" ? undefined : rows[0]!.refundMethod,
    rows,
    issues: groupRefundFeeDetails(rows).flatMap((group) => group.issues),
  }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit`
Expected: `# tests 224`, `# pass 223`, `# fail 0`, `# skipped 1`.

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit` → exit 0
Run: `npx eslint "src/app/[lang]/(main)/(unirefund)/settings/templates/refund-fees/"` → exit 0

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/[lang]/(main)/(unirefund)/settings/templates/refund-fees/_components/detail-groups.ts" "apps/web/src/app/[lang]/(main)/(unirefund)/settings/templates/refund-fees/_components/detail-groups.test.ts"
git commit -m "$(cat <<'EOF'
feat(refund-fees): bucket detail rows into display sections

sectionRefundFeeDetails groups rows by fee type + refund method, refund
method, or fee type, keeping each row's index in the flat field array so
the inputs and useFieldArray.remove() still address the right position.

Rows are neither sorted nor coerced: unlike the visualizer this feeds an
editing surface, where reordering or rewriting a cell mid-keystroke would
move the input out from under the caret.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
git show --name-only HEAD
```

Expected: exactly the two files above.

---

## Task 2: Extract the row into its own component

A pure refactor — no behaviour change, no new tests. It exists because `refund-fee-details.tsx` is 641 lines and Task 3 wraps an accordion around it.

**Files:**
- Create: `<ROUTE>_components/form-values.ts`
- Create: `<ROUTE>_components/detail-row.tsx`
- Modify: `<ROUTE>_components/refund-fee-details.tsx`

**Interfaces:**
- Produces: `RefundFeeDetailsFormValues`, `schemas`, `feeTypes`, `refundMethods` from `form-values.ts`; `RefundFeeDetailRow` from `detail-row.tsx`. Tasks 3 and 4 import all of these.

Note: `refund-fee-details.tsx` currently has `export const schemas` at line 69, but **nothing imports it** — moving it breaks no consumer.

- [ ] **Step 1: Create the shared form values module**

Create `<ROUTE>_components/form-values.ts`:

```ts
import type { z } from "@repo/ayasofyazilim-ui/lib/zod";
import type {
  UniRefund_ContractService_Enums_FeeType,
  UniRefund_ContractService_Enums_RefundMethod,
} from "@repo/saas/ContractService";
import { createRefundFeeTableSchemas } from "./schema";

export const feeTypes: UniRefund_ContractService_Enums_FeeType[] = [
  "TouristFee",
  "TouristBonusFee",
  "AgentFee",
  "AirportFee",
  "EarlyRefundFee",
];

export const refundMethods: UniRefund_ContractService_Enums_RefundMethod[] = [
  "Cash",
  "CreditCard",
  "BankTransfer",
  "Wallet",
  "CashViaPartner",
  "IbanTransfer",
];

export const schemas = createRefundFeeTableSchemas({});

export type RefundFeeDetailsFormValues = z.infer<
  typeof schemas.createFormSchema
>;
```

- [ ] **Step 2: Create the row component**

Create `<ROUTE>_components/detail-row.tsx`. The markup to move is **`refund-fee-details.tsx:325-592`** — the `<TableRow>` inside `fields.map`, containing nine `<TableCell>` blocks in this order:

| Lines | Cell |
|---|---|
| 326-352 | `amountFrom` — `Input type="number"`, registers an input ref |
| 353-384 | `amountTo` — same, registers an input ref |
| 385-419 | `feeType` — `Select` over `feeTypes` |
| 420-454 | `refundMethod` — `Select` over `refundMethods` |
| 455-481 | `fixedFeeValue` — `Input`, no ref |
| 482-508 | `percentFeeValue` — `Input`, no ref |
| 509-535 | `minFee` — `Input`, no ref |
| 536-567 | `maxFee` — `Input`, registers an input ref |
| 568-583 | delete `Button` calling `remove(index)` |

Move them **verbatim** — same `data-testid` values, same class names, same `min`/`step`/`type` attributes, same rendered order (it must match the nine `<TableHead>`s at lines 234-321). Also move `FieldError` from lines 630-641 and `getFieldError` from lines 117-138, the latter losing its `index` parameter since the component closes over it.

Only the surrounding plumbing changes. The shape of each numeric cell after the move:

```tsx
"use no memo";
import { Controller, useFormContext } from "@repo/ayasofyazilim-ui/components/form";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import { Input } from "@repo/ayasofyazilim-ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ayasofyazilim-ui/components/select";
import { TableCell, TableRow } from "@repo/ayasofyazilim-ui/components/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/ayasofyazilim-ui/components/tooltip";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import { AlertTriangleIcon, Trash2 } from "lucide-react";
import type { ContractServiceResource } from "@/language-data/unirefund/ContractService";
import {
  feeTypes,
  refundMethods,
  type RefundFeeDetailsFormValues,
} from "./form-values";

export function RefundFeeDetailRow({
  index,
  isPending,
  languageData,
  onRemove,
  registerInputRef,
}: {
  index: number;
  isPending: boolean;
  languageData: ContractServiceResource;
  onRemove: () => void;
  registerInputRef: (key: string, el: HTMLInputElement | null) => void;
}) {
  const { control, formState } = useFormContext<RefundFeeDetailsFormValues>();

  const getFieldError = (fieldName: string) => {
    try {
      const errors = formState.errors;
      if (errors.refundFeeDetails && Array.isArray(errors.refundFeeDetails)) {
        const rowError = errors.refundFeeDetails[index] as
          | Record<string, { message?: string }>
          | undefined;
        if (rowError && typeof rowError === "object") {
          return rowError[fieldName]?.message || null;
        }
      }
      if (errors.refundFeeDetails?.root?.message) {
        return errors.refundFeeDetails.root.message;
      }
      return null;
    } catch {
      return null;
    }
  };

  return (
    <TableRow className={cn("divide-x [&>td]:p-px")}>
      {/* The nine cells from refund-fee-details.tsx:326-583, in that same
          order. Write them out individually - do NOT loop over the numeric
          field names, because the two Select cells sit between amountTo and
          fixedFeeValue and a loop would reorder the columns away from the
          header. amountFrom is shown here as the pattern every numeric cell
          follows; the only differences are the field name and whether the cell
          registers an input ref (amountFrom, amountTo and maxFee do). */}
      <TableCell>
        <Controller
          control={control}
          name={`refundFeeDetails.${index}.amountFrom`}
          render={({ field }) => {
            const error = getFieldError("amountFrom");
            return (
              <div className="relative">
                <Input
                  data-testid={`refundFeeDetails.${index}.amountFrom`}
                  min={0}
                  step="any"
                  type="number"
                  {...field}
                  className={cn(
                    "rounded-none border-none shadow-none",
                    error &&
                      "bg-red-50 font-bold italic text-red-500 dark:bg-red-900 dark:text-red-300"
                  )}
                  disabled={isPending}
                  ref={(el) => {
                    registerInputRef(`refundFeeDetails.${index}.amountFrom`, el);
                  }}
                />
                <FieldError error={error} />
              </div>
            );
          }}
        />
      </TableCell>
      {/* amountTo, feeType Select, refundMethod Select, fixedFeeValue,
          percentFeeValue, minFee, maxFee, delete - all moved verbatim. The
          delete cell's onClick becomes `onRemove()` instead of
          `remove(index)`. */}
    </TableRow>
  );
}

function FieldError({ error }: { error: string | null | undefined }) {
  if (error)
    return (
      <Tooltip>
        <TooltipTrigger className="absolute right-0 top-0">
          <AlertTriangleIcon className="text-destructive size-4" />
        </TooltipTrigger>
        <TooltipContent>{error}</TooltipContent>
      </Tooltip>
    );
  return null;
}
```

The two select cells move across unchanged, with `feeTypes` / `refundMethods` now imported from `./form-values` rather than declared locally.

- [ ] **Step 3: Rewire the table to use the row**

In `refund-fee-details.tsx`: delete the moved markup, the local `feeTypes`/`refundMethods` arrays, the local `schemas`/`RefundFeeDetailsFormValues`, the local `getFieldError`, and the local `FieldError`. Import from `./form-values` and `./detail-row` instead. The body becomes:

```tsx
{fields.map((arrayField, index) => (
  <RefundFeeDetailRow
    index={index}
    isPending={isPending}
    key={arrayField.id}
    languageData={languageData}
    onRemove={() => {
      remove(index);
    }}
    registerInputRef={(key, el) => {
      inputRefs.current[key] = el;
    }}
  />
))}
```

- [ ] **Step 4: Verify nothing changed**

Run: `npm run test:unit` → `# fail 0`, same 224 tests as Task 1
Run: `npx tsc --noEmit` → exit 0
Run: `npx eslint "src/app/[lang]/(main)/(unirefund)/settings/templates/refund-fees/"` → exit 0

This task changes no behaviour, so there is nothing new to assert — the gate is that the three commands stay green and the rendered column order matches the header.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/[lang]/(main)/(unirefund)/settings/templates/refund-fees/_components/"
git commit -m "$(cat <<'EOF'
refactor(refund-fees): extract the detail row and shared form values

refund-fee-details.tsx was 641 lines of eight inline Controller blocks;
wrapping an accordion around that would put it past what can be edited
reliably. The row moves to detail-row.tsx addressed purely by field-array
index, and schemas plus the fee type and refund method lists move to
form-values.ts so the row can import them without a cycle.

No behaviour change.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
git show --name-only HEAD
```

---

## Task 3: Accordion and grouping-mode selector

**Files:**
- Modify: `apps/web/src/language-data/unirefund/ContractService/resources/en.json`
- Modify: `apps/web/src/language-data/unirefund/ContractService/resources/tr.json`
- Modify: `<ROUTE>_components/refund-fee-details.tsx`

**Interfaces:**
- Consumes: `sectionRefundFeeDetails`, `GroupingMode`, `RefundFeeSection` (Task 1); `RefundFeeDetailRow`, `refundMethods`, `RefundFeeDetailsFormValues` (Task 2).
- Produces: nothing later tasks import. Task 4 edits this same file.

- [ ] **Step 1: Add the language keys**

Insert into `en.json` immediately before the `"RefundFeeTable.Form.refundFeeDetails.noRecord"` line:

```json
  "RefundFeeTable.Form.refundFeeDetails.groupBy": "Group by",
  "RefundFeeTable.Form.refundFeeDetails.groupBy.combined": "Fee type + refund method",
  "RefundFeeTable.Form.refundFeeDetails.groupBy.refundMethod": "Refund method",
  "RefundFeeTable.Form.refundFeeDetails.groupBy.feeType": "Fee type",
  "RefundFeeTable.Form.refundFeeDetails.addToGroup": "Add to this group",
```

And into `tr.json` at the same position:

```json
  "RefundFeeTable.Form.refundFeeDetails.groupBy": "Gruplama",
  "RefundFeeTable.Form.refundFeeDetails.groupBy.combined": "Ücret tipi + iade yöntemi",
  "RefundFeeTable.Form.refundFeeDetails.groupBy.refundMethod": "İade yöntemi",
  "RefundFeeTable.Form.refundFeeDetails.groupBy.feeType": "Ücret tipi",
  "RefundFeeTable.Form.refundFeeDetails.addToGroup": "Bu gruba ekle",
```

Verify both parse:

```bash
node -e "JSON.parse(require('fs').readFileSync('src/language-data/unirefund/ContractService/resources/en.json','utf8'));JSON.parse(require('fs').readFileSync('src/language-data/unirefund/ContractService/resources/tr.json','utf8'));console.log('ok')"
```

- [ ] **Step 2: Add the mode state and section labels**

In `refund-fee-details.tsx`, add alongside the existing `showVisualizer` state:

```tsx
const GROUPING_MODES: GroupingMode[] = [
  "combined",
  "refundMethod",
  "feeType",
];

// The section's feeType/refundMethod are plain strings because RefundFeeDetail
// widens both enums; the language resource is keyed on literals, so the lookup
// needs one cast. Values are all strings, so the result is always defined.
function sectionLabel(
  section: RefundFeeSection,
  languageData: ContractServiceResource
): string {
  const parts: string[] = [];
  if (section.feeType) {
    parts.push(
      languageData[
        `RefundFeeTable.Form.refundFeeDetails.feeType.${section.feeType}` as keyof ContractServiceResource
      ]
    );
  }
  if (section.refundMethod) {
    parts.push(
      languageData[
        `Contracts.refundMethod.${section.refundMethod}` as keyof ContractServiceResource
      ]
    );
  }
  return parts.join(" & ");
}
```

Inside the component:

```tsx
const [groupingMode, setGroupingMode] = useState<GroupingMode>("combined");
const [openSections, setOpenSections] = useState<string[]>([]);

const sections = sectionRefundFeeDetails(
  watchedDetails?.map((item, idx) => ({ ...item, originalIndex: idx })) ?? [],
  groupingMode
);
```

- [ ] **Step 3: Keep every section open by default**

Section keys change whenever the mode changes or a new combination appears. Reconcile rather than overwrite, so a section the user collapsed stays collapsed:

```tsx
const sectionKeys = sections.map((section) => section.key);
const knownKeys = useRef<string[]>([]);

useEffect(() => {
  const added = sectionKeys.filter((key) => !knownKeys.current.includes(key));
  knownKeys.current = sectionKeys;
  if (added.length > 0) {
    setOpenSections((open) => [...new Set([...open, ...added])]);
  }
}, [sectionKeys.join("|")]);
```

Import `useEffect` and `useRef` from `react` — `useRef` is already imported.

- [ ] **Step 4: Add the mode selector to the toolbar**

In the existing sticky toolbar `<div className="flex gap-2">`, before the visualizer toggle:

```tsx
<Select
  onValueChange={(value) => {
    setGroupingMode(value as GroupingMode);
  }}
  value={groupingMode}
>
  <SelectTrigger
    className="h-8 w-56"
    data-testid="refundFeeDetails.groupBy"
    disabled={isPending}
  >
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    {GROUPING_MODES.map((mode) => (
      <SelectItem key={mode} value={mode}>
        {languageData[`RefundFeeTable.Form.refundFeeDetails.groupBy.${mode}`]}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

- [ ] **Step 5: Replace the single table with the accordion**

Replace the whole `<div className="mb-4 rounded-md border"><Table>…</Table></div>` block and the trailing standalone visualizer with:

```tsx
{fields.length === 0 ? (
  <div className="text-muted-foreground rounded-md border p-4 text-center">
    {languageData["RefundFeeTable.Form.refundFeeDetails.noRecord"]}
  </div>
) : (
  <Accordion
    className="w-full"
    onValueChange={setOpenSections}
    type="multiple"
    value={openSections}
  >
    {sections.map((section) => (
      <AccordionItem key={section.key} value={section.key}>
        <AccordionTrigger data-testid={`refundFeeDetails.section.${section.key}`}>
          <div className="flex items-center gap-2">
            <span>{sectionLabel(section, languageData)}</span>
            <Badge variant={section.issues.length === 0 ? "outline" : "destructive"}>
              {section.rows.length}
            </Badge>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="mb-2 rounded-md border">
            <Table>
              <DetailTableHeader languageData={languageData} />
              <TableBody>
                {section.rows.map((sectionRow) => (
                  <RefundFeeDetailRow
                    index={sectionRow.originalIndex}
                    isPending={isPending}
                    key={fields[sectionRow.originalIndex]?.id ?? sectionRow.originalIndex}
                    languageData={languageData}
                    onRemove={() => {
                      remove(sectionRow.originalIndex);
                    }}
                    registerInputRef={(inputKey, el) => {
                      inputRefs.current[inputKey] = el;
                    }}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
          {showVisualizer ? (
            <RefundFeeDetailsVisualizer
              details={section.rows}
              isPending={isPending}
              languageData={languageData}
              onCellClick={handleVisualizerCellClick}
              onDuplicateGroup={handleDuplicateGroup}
              refundMethods={refundMethods}
            />
          ) : null}
        </AccordionContent>
      </AccordionItem>
    ))}
  </Accordion>
)}
```

`DetailTableHeader` is a new local component in this same file wrapping the existing `<TableHeader>` block at **`refund-fee-details.tsx:233-322`** verbatim — all nine `<TableHead>`s including the two tooltip badges on Amount from and Amount to. It takes one prop:

```tsx
function DetailTableHeader({
  languageData,
}: {
  languageData: ContractServiceResource;
}) {
  return (
    <TableHeader>
      {/* lines 234-321 verbatim */}
    </TableHeader>
  );
}
```

It is extracted rather than inlined because it now renders once per section instead of once per form.

Delete the old empty-state `<TableRow>` at lines 595-606 — the `fields.length === 0` branch above replaces it.

Add the imports:

```tsx
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@repo/ayasofyazilim-ui/components/accordion";
```

**Do not change `handleDuplicateGroup`.** It already calls `duplicateGroupRows(watchedDetails ?? [], …)` with the full list, and `availableTargetMethods` inside the visualizer is likewise fed the full list it receives — but the visualizer now receives only a *section's* rows, so a method occupied by a row in a different section would wrongly be offered. Pass the full detail list to the visualizer for that purpose in Task 4; for this task, note the limitation and leave it.

- [ ] **Step 6: Verify**

Run: `npm run test:unit` → `# fail 0`
Run: `npx tsc --noEmit` → exit 0
Run: `npx eslint "src/app/[lang]/(main)/(unirefund)/settings/templates/refund-fees/"` → exit 0

- [ ] **Step 7: Commit**

```bash
git add "apps/web/src/app/[lang]/(main)/(unirefund)/settings/templates/refund-fees/_components/" apps/web/src/language-data/unirefund/ContractService/resources/en.json apps/web/src/language-data/unirefund/ContractService/resources/tr.json
git commit -m "$(cat <<'EOF'
feat(refund-fees): group the detail table into an accordion

The table listed every row flat while the visualizer below it grouped the
same rows by fee type and refund method and validated each group
independently, so the two halves of the screen disagreed about the unit of
work. Sections now key on the visualizer's grouping, with a selector for
refund method or fee type instead.

Each section carries its own table and its own visualizer; the visualizer
needed no change, since it already sub-groups whatever rows it is handed.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
git show --name-only HEAD
```

---

## Task 4: Per-section Add, and the occupied-method fix

**Files:**
- Modify: `<ROUTE>_components/refund-fee-details.tsx`
- Modify: `<ROUTE>_components/visualizer.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–3.
- Produces: a new required-in-practice `allDetails` prop on `RefundFeeDetailsVisualizer`.

- [ ] **Step 1: Let the visualizer see every row when deciding targets**

In `visualizer.tsx`, add an optional prop and use it for target availability only:

```tsx
interface RefundFeeDetailsVisualizerProps {
  languageData: ContractServiceResource;
  details: RefundFeeDetail[];
  /** Every row in the form, not just this section's - a method occupied by a
      row in another section must still be excluded as a copy target. Defaults
      to `details` for callers that render the whole set. */
  allDetails?: RefundFeeDetail[];
  isPending?: boolean;
  refundMethods?: readonly UniRefund_ContractService_Enums_RefundMethod[];
  onCellClick?: (groupKey: string, rangeIndex: number) => void;
  onDuplicateGroup?: (
    groupKey: string,
    targetMethod: UniRefund_ContractService_Enums_RefundMethod
  ) => void;
}
```

and change the single call site inside the component from `availableTargetMethods(details, …)` to:

```tsx
targets={availableTargetMethods(allDetails ?? details, group.feeType, refundMethods)}
```

Then pass it from `refund-fee-details.tsx`:

```tsx
allDetails={watchedDetails?.map((item, idx) => ({ ...item, originalIndex: idx })) ?? []}
```

- [ ] **Step 2: Add the per-section Add handler**

In `refund-fee-details.tsx`:

```tsx
const addRowToSection = (section: RefundFeeSection) => {
  const lastRow = section.rows.at(-1);
  if (!lastRow) return;
  const amountFrom = Number(lastRow.amountTo);

  append({
    ...lastRow,
    amountFrom,
    amountTo: amountFrom * 10,
    fixedFeeValue: 0,
    percentFeeValue: 0,
    minFee: 0,
    maxFee: 0,
  });
  setOpenSections((open) =>
    open.includes(section.key) ? open : [...open, section.key]
  );
};
```

Spreading `lastRow` carries its `feeType` and `refundMethod` across, which is what pre-fills the new row into the same section. `Number(lastRow.amountTo)` is needed because an edited cell holds a string — `"5000" * 10` happens to work but `"5000"` as `amountFrom` would not.

`lastRow` also carries `originalIndex`; strip it if `append`'s type rejects it:

```tsx
const { originalIndex, ...rowValues } = lastRow;
```

- [ ] **Step 3: Render the button inside each section**

Immediately after the section's `</Table>`'s wrapping div, before the visualizer:

```tsx
<Button
  className="mb-2"
  data-testid={`refundFeeDetails.addToGroup.${section.key}`}
  disabled={isPending}
  onClick={() => {
    addRowToSection(section);
  }}
  size="sm"
  type="button"
  variant="outline"
>
  <Plus className="mr-1 h-4 w-4" />
  {languageData["RefundFeeTable.Form.refundFeeDetails.addToGroup"]}
</Button>
```

- [ ] **Step 4: Open the section a moved row lands in**

Changing a row's fee type or refund method moves it to a different section. Task 3's reconcile effect only opens sections whose key is *new*; a row moving into an existing section the user had collapsed would appear to vanish. The spec requires the target section to open, so track each row's section and react when it changes:

```tsx
const rowSectionSignature = sections
  .flatMap((section) =>
    section.rows.map((sectionRow) => `${sectionRow.originalIndex}:${section.key}`)
  )
  .join("|");
const rowSectionsRef = useRef(new Map<number, string>());

useEffect(() => {
  const next = new Map<number, string>();
  const moved: string[] = [];

  for (const section of sections) {
    for (const sectionRow of section.rows) {
      next.set(sectionRow.originalIndex, section.key);
      const previous = rowSectionsRef.current.get(sectionRow.originalIndex);
      // undefined means the row is new, not moved - appending must not force
      // a section open that the user deliberately collapsed.
      if (previous !== undefined && previous !== section.key) {
        moved.push(section.key);
      }
    }
  }

  rowSectionsRef.current = next;
  if (moved.length > 0) {
    setOpenSections((open) => [...new Set([...open, ...moved])]);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the signature is the
  // dependency; `sections` is a fresh array on every render.
}, [rowSectionSignature]);
```

Switching the grouping mode changes every row's key at once, so every section opens. That is the same result as the mode-change reconcile and is intentional.

- [ ] **Step 5: Verify**

Run: `npm run test:unit` → `# fail 0`
Run: `npx tsc --noEmit` → exit 0
Run: `npx eslint "src/app/[lang]/(main)/(unirefund)/settings/templates/refund-fees/"` → exit 0

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/[lang]/(main)/(unirefund)/settings/templates/refund-fees/_components/"
git commit -m "$(cat <<'EOF'
feat(refund-fees): add a row straight into a section

Each section gets an Add that continues its own ladder, carrying the fee
type and refund method across and seeding amountFrom from the last row's
amountTo. The toolbar Add stays for starting a combination that has no
section yet.

The visualizer also takes the full detail list for target availability: it
now renders per section, so a method occupied by a row in another section
would otherwise have been offered as a copy target.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
git show --name-only HEAD
```

---

## Manual verification

None of the above proves the UI works — `apps/web` has no JSX-capable unit runner. After Task 4, run the app and check on `/en/settings/templates/refund-fees/new`:

1. Three sections appear for the seeded TouristFee/Cash and AgentFee/Cash rows plus anything added.
2. Switching the mode selector re-buckets without losing edits.
3. Editing an amount does **not** move the row or lose focus.
4. Deleting a row in the second section deletes that row, not another — the index-mapping bug this plan guards against would show up here first.
5. Per-section Add pre-fills the right fee type and method.
6. Copy-to still excludes occupied methods across sections.
7. At ~400px wide the accordion headers and tables remain usable.

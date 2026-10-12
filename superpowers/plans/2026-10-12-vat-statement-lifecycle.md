# VAT Statement Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give web-app UI to the unused FinanceService VAT statement routes:
- status / dunning changes
- the payment ledger and recording a payment
- statement history
- the unbilled-tags overview

**Architecture:**
- **The statement detail page:** a new route layout adds a header strip (status, figures, actions) and route tabs: Statement (today's page), Payments, History.
- **The unbilled overview:** a new Finance page with a sidebar entry.
- **Logic:** pure helpers in `.ts` files carry every rule and are unit-tested. Components only wire them to the SDK actions and the UI kit.

**Tech Stack:**
- Next.js App Router (`apps/web`)
- `@repo/actions` server actions over the generated FinanceService client
- `@repo/ayasofyazilim-ui`: `TabLayout`, `MasterDataGrid`, Dialog, DatePicker
- `node --test` via `pnpm --filter web test:unit`

**Spec:** `C:\unirefund\docs\superpowers\specs\2026-10-12-vat-statement-lifecycle-design.md`

## Global Constraints

- **Workspace:**
  - Worktree: `C:\unirefund\web-app-wt-vat-lifecycle`.
  - Branch: `feat/vat-statement-lifecycle`, from `origin/main`.
  - Never work in `C:\unirefund\web-app`. That shared checkout has someone's SDK regeneration in progress.
- **Staging:** stage explicit paths only. Never stage `packages/utils` or `packages/ayasofyazilim-ui` (submodules). Never `git stash` or `git reset --hard`.
- **Permissions:**
  - Every action call needs both its group and its leaf permission.
  - On a page that is `guardPage({ requires: [...] })`.
  - In a client file that calls an action, it is `isActionGranted([...], grantedPolicies)` written with the literal permission strings, so that `pnpm policy:audit` R1 sees them.
- **Server actions:**
  - FinanceService GET actions return `structuredSuccessResponse` and `throw structuredError`. There is no `isUnauthorized` call; follow `packages/actions/unirefund/FinanceService/actions.ts`.
  - PUT and POST actions return `structuredResponse` or `structuredError`.
- **Tests:** `test:unit` runs `.ts` test files only. Bracketed route folders are escaped as `[[]` in test paths, e.g. `src/app/[[]lang]/...`.
- **Lint:** every custom component (an `@repo/ayasofyazilim-ui` component or one of ours) needs a `data-testid`, because of the `react-require-testid` lint rule.
- **i18n:**
  - Every new label goes into **both** `en.json` and `tr.json` under `apps/web/src/language-data/unirefund/FinanceService/resources/`.
  - Nav labels go under `.../core/AbpUiNavigation/resources/`.
  - Run `pnpm --filter web run init` after adding keys. It needs dev-api up; if it answers 522, wait and retry.
  - Every key you add must be used, or `i18n:unused` grows past its baseline of 5.
- **Dates:** show dates in the tenant's time zone with `formatToLocalizedDate({ localization, date, dateOptions, timeZone: localization.timeZone })`. It comes from `@repo/ayasofyazilim-ui/custom/date-tooltip`, and `localization` from `useLocalization()` in `@repo/utils/app-config`.
- **Labels in client components:** use `useTranslations()` (`@/src/providers/i18n`) and its `t.FinanceService[...]` / `t.Default[...]`. Server pages use `await getTranslations(lang)` (`@/src/language-data/get-translations`).
- **Comments:** keep them sparse, one line where the code is not obvious.
- **Commits:** end every message with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Use `git commit -F -` with a quoted heredoc (`<<'EOF'`).
- **Dev writes:** changing a status or recording a payment on dev needs the user's explicit go-ahead, on a statement they pick.

## Review Focus

1. **A user without `ViewStatusHint`:** the header must fall back to the statement's own figures, show no status buttons, and not crash. Tasks 4 and 5 pin this with a manual check in Task 10.
2. **The payment date's time zone:** the day picked must be the day stored. `paymentDateValue` must not shift the day through UTC conversion. Task 1 pins it with a test; Task 10 checks a recorded entry's date on dev.
3. **An unbilled URL with only a year, or only a month:** this must not reach the backend as a half period, which would give a 400. It must list every month instead. Task 1's `toUnbilledQuery` test pins it.
4. **A correction-only unbilled row** (`tagCount` 0, no `periods`): it must still offer a create link carrying the merchant only, and show the correction's age. Task 1's `newStatementHref(…, null)` and `waitingSince` tests pin it.
5. **A status change refused because someone else moved the statement first** (`01014`): the user sees the backend message, and the buttons re-sync after `router.refresh()`. Task 5's confirm handler always refreshes, and Task 10 checks it manually where feasible.

---

### Task 0: Worktree

**Files:** none (environment only).

- [ ] **Step 1: Create the worktree from origin/main**

```bash
cd /c/unirefund/web-app && git fetch -q origin && git worktree add -b feat/vat-statement-lifecycle /c/unirefund/web-app-wt-vat-lifecycle origin/main
cd /c/unirefund/web-app-wt-vat-lifecycle && git submodule update --init --recursive
```
Expected: the worktree exists on `feat/vat-statement-lifecycle`, with both submodules checked out.

- [ ] **Step 2: Copy the env files and next-env.d.ts, then install**

```bash
cp /c/unirefund/web-app/apps/web/.env /c/unirefund/web-app-wt-vat-lifecycle/apps/web/.env
cp /c/unirefund/web-app/apps/web/next-env.d.ts /c/unirefund/web-app-wt-vat-lifecycle/apps/web/next-env.d.ts
[ -f /c/unirefund/web-app/apps/ssr/.env ] && cp /c/unirefund/web-app/apps/ssr/.env /c/unirefund/web-app-wt-vat-lifecycle/apps/ssr/.env
cd /c/unirefund/web-app-wt-vat-lifecycle && pnpm install --frozen-lockfile
cd apps/web && pnpm run init
```
Expected: the install succeeds, and `init` ends with `Processing resource: WalletService` and exit 0.

- [ ] **Step 3: Baseline**

```bash
cd /c/unirefund/web-app-wt-vat-lifecycle && pnpm --filter web type-check && pnpm --filter web test:unit 2>&1 | grep -E "^# (pass|fail)"
```
Expected: type-check exits 0, and the tests report `# fail 0`.

---

### Task 1: Pure lifecycle helpers

**Files:**
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/finance/vat-statements/_components/lifecycle.ts`
- Test: `apps/web/src/app/[lang]/(main)/(unirefund)/finance/vat-statements/_components/lifecycle.test.ts`

**Interfaces:**
- **Produces:**
  - Status buttons: `statusActions(allowed: VatStatus[] | null | undefined): { primary: VatStatus[]; more: VatStatus[] }`
  - Payment amount:
    - `parseAmount(text: string): number`
    - `paymentProblem(amount: number, figures: PaymentFigures | null): "zero" | "belowZero" | null`
    - `paymentWarning(amount: number, figures: PaymentFigures | null): "overPaid" | null`
    - `type PaymentFigures = { paidAmount: number; unpaidAmount: number }`
  - Payment date:
    - `paymentDateProblem(date: Date, now: Date): "future" | null`
    - `paymentDateValue(date: Date): string`
  - Unbilled page:
    - `parsePeriod(period: string): { year: number; month: number } | null`
    - `newStatementHref(merchantId: string, period: string | null): string` (no language prefix; callers wrap it in `getBaseLink`)
    - `toUnbilledQuery(search: UnbilledSearchParams): GetApiFinanceServiceVatStatementHeadersUnbilledTagsData`
    - `type UnbilledSearchParams = Partial<Record<"year" | "month" | "sorting" | "skipCount" | "maxResultCount", string>>`
    - `waitingSince(row: { oldestExportValidationDate?: string | null; oldestPendingCorrectionDate?: string | null }): string | null`
    - `daysSince(iso: string, now: Date): number`
  - Display: `formatAmount(amount: number, currency: string, locale: string): string`

- [ ] **Step 1: Write the failing tests**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  daysSince,
  formatAmount,
  newStatementHref,
  parseAmount,
  parsePeriod,
  paymentDateProblem,
  paymentDateValue,
  paymentProblem,
  paymentWarning,
  statusActions,
  toUnbilledQuery,
  waitingSince,
} from "./lifecycle";

describe("statusActions", () => {
  it("keeps the backend's order and puts cancel and credit note under More", () => {
    assert.deepEqual(
      statusActions(["PaymentReminder1", "Cancelled", "DebtCollection", "CreditNote"]),
      { primary: ["PaymentReminder1", "DebtCollection"], more: ["Cancelled", "CreditNote"] }
    );
  });
  it("never offers Paid, which only payments reach", () => {
    assert.deepEqual(statusActions(["Paid", "Sent"]), { primary: ["Sent"], more: [] });
  });
  it("offers nothing when no move is allowed", () => {
    assert.deepEqual(statusActions([]), { primary: [], more: [] });
    assert.deepEqual(statusActions(null), { primary: [], more: [] });
  });
});

describe("payment amount", () => {
  const figures = { paidAmount: 100, unpaidAmount: 50 };
  it("parses a comma or a dot as the decimal mark", () => {
    assert.equal(parseAmount("12,5"), 12.5);
    assert.equal(parseAmount(" -100.25 "), -100.25);
    assert.ok(Number.isNaN(parseAmount("")));
  });
  it("refuses zero and anything that is not a number", () => {
    assert.equal(paymentProblem(0, figures), "zero");
    assert.equal(paymentProblem(Number.NaN, figures), "zero");
  });
  it("lets a correction take the paid total exactly to zero, not below", () => {
    assert.equal(paymentProblem(-100, figures), null);
    assert.equal(paymentProblem(-100.01, figures), "belowZero");
  });
  it("warns only above the unpaid balance", () => {
    assert.equal(paymentWarning(50, figures), null);
    assert.equal(paymentWarning(50.01, figures), "overPaid");
    assert.equal(paymentWarning(50.01, null), null);
  });
});

describe("payment date", () => {
  const now = new Date(2026, 9, 12, 15, 30);
  it("allows today and refuses a later day", () => {
    assert.equal(paymentDateProblem(new Date(2026, 9, 12, 0, 0), now), null);
    assert.equal(paymentDateProblem(new Date(2026, 9, 13, 0, 0), now), "future");
  });
  it("sends the picked calendar day without shifting it through UTC", () => {
    assert.equal(paymentDateValue(new Date(2026, 9, 1, 0, 0)), "2026-10-01T00:00:00");
  });
});

describe("unbilled helpers", () => {
  it("parses a year-month period and rejects anything else", () => {
    assert.deepEqual(parsePeriod("2026-09"), { year: 2026, month: 9 });
    assert.deepEqual(parsePeriod("2026-09-01T00:00:00"), { year: 2026, month: 9 });
    assert.equal(parsePeriod("2026-13"), null);
    assert.equal(parsePeriod("Sep 2026"), null);
  });
  it("links to a pre-filled draft, or to the merchant alone", () => {
    assert.equal(
      newStatementHref("m-1", "2026-09"),
      "finance/vat-statements/new?merchantId=m-1&year=2026&month=9"
    );
    assert.equal(newStatementHref("m-1", "Sep 2026"), "finance/vat-statements/new?merchantId=m-1");
    assert.equal(newStatementHref("m-1", null), "finance/vat-statements/new?merchantId=m-1");
  });
  it("sends a period only when both year and month are valid", () => {
    assert.deepEqual(toUnbilledQuery({ year: "2026", month: "9", skipCount: "20" }), {
      year: 2026,
      month: 9,
      skipCount: 20,
    });
    assert.deepEqual(toUnbilledQuery({ year: "2026" }), {});
    assert.deepEqual(toUnbilledQuery({ month: "9" }), {});
    assert.deepEqual(toUnbilledQuery({ year: "2026", month: "13" }), {});
  });
  it("ages a correction-only row by its oldest correction", () => {
    assert.equal(
      waitingSince({ oldestExportValidationDate: "2026-09-01T00:00:00Z" }),
      "2026-09-01T00:00:00Z"
    );
    assert.equal(
      waitingSince({ oldestExportValidationDate: null, oldestPendingCorrectionDate: "2026-08-15T00:00:00Z" }),
      "2026-08-15T00:00:00Z"
    );
    assert.equal(waitingSince({}), null);
  });
  it("counts whole days waited", () => {
    assert.equal(daysSince("2026-09-01T00:00:00Z", new Date("2026-10-01T12:00:00Z")), 30);
  });
});

describe("formatAmount", () => {
  it("formats with the currency", () => {
    assert.match(formatAmount(1200, "DKK", "en"), /1,200\.00/);
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `cd apps/web && node --import tsx --test "src/app/[[]lang]/(main)/(unirefund)/finance/vat-statements/_components/lifecycle.test.ts"`
Expected: FAIL with `Cannot find module './lifecycle'`.

- [ ] **Step 3: Implement**

```ts
import type {
  GetApiFinanceServiceVatStatementHeadersUnbilledTagsData,
  UniRefund_FinanceService_Enums_VATStatementStatus as VatStatus,
} from "@repo/saas/FinanceService";

const MORE_STATUSES: VatStatus[] = ["Cancelled", "CreditNote"];

export function statusActions(allowed: VatStatus[] | null | undefined): {
  primary: VatStatus[];
  more: VatStatus[];
} {
  const offered = (allowed ?? []).filter((status) => status !== "Paid");
  return {
    primary: offered.filter((status) => !MORE_STATUSES.includes(status)),
    more: offered.filter((status) => MORE_STATUSES.includes(status)),
  };
}

export type PaymentFigures = { paidAmount: number; unpaidAmount: number };

export function parseAmount(text: string): number {
  const trimmed = text.trim().replace(",", ".");
  return trimmed ? Number(trimmed) : Number.NaN;
}

export function paymentProblem(
  amount: number,
  figures: PaymentFigures | null
): "zero" | "belowZero" | null {
  if (!Number.isFinite(amount) || amount === 0) return "zero";
  if (figures && amount < 0 && -amount > figures.paidAmount) return "belowZero";
  return null;
}

export function paymentWarning(
  amount: number,
  figures: PaymentFigures | null
): "overPaid" | null {
  return figures && amount > figures.unpaidAmount ? "overPaid" : null;
}

const dayKey = (date: Date) =>
  date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();

export function paymentDateProblem(date: Date, now: Date): "future" | null {
  return dayKey(date) > dayKey(now) ? "future" : null;
}

const pad = (value: number) => String(value).padStart(2, "0");

// The calendar day as picked, with no zone, so UTC conversion cannot move it.
export function paymentDateValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T00:00:00`;
}

export function parsePeriod(period: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{1,2})(?:$|-)/.exec(period);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? { year, month } : null;
}

export function newStatementHref(merchantId: string, period: string | null): string {
  const params = new URLSearchParams({ merchantId });
  const parsed = period ? parsePeriod(period) : null;
  if (parsed) {
    params.set("year", String(parsed.year));
    params.set("month", String(parsed.month));
  }
  return `finance/vat-statements/new?${params.toString()}`;
}

export type UnbilledSearchParams = Partial<
  Record<"year" | "month" | "sorting" | "skipCount" | "maxResultCount", string>
>;

const toInt = (value: string | undefined) => {
  const parsed = Number(value);
  return value && Number.isInteger(parsed) ? parsed : undefined;
};

// The backend takes a period as both year and month or neither.
export function toUnbilledQuery(
  search: UnbilledSearchParams
): GetApiFinanceServiceVatStatementHeadersUnbilledTagsData {
  const query: GetApiFinanceServiceVatStatementHeadersUnbilledTagsData = {};
  const year = toInt(search.year);
  const month = toInt(search.month);
  if (year !== undefined && month !== undefined && month >= 1 && month <= 12) {
    query.year = year;
    query.month = month;
  }
  if (search.sorting) query.sorting = search.sorting;
  const skipCount = toInt(search.skipCount);
  if (skipCount !== undefined) query.skipCount = skipCount;
  const maxResultCount = toInt(search.maxResultCount);
  if (maxResultCount !== undefined) query.maxResultCount = maxResultCount;
  return query;
}

export function waitingSince(row: {
  oldestExportValidationDate?: string | null;
  oldestPendingCorrectionDate?: string | null;
}): string | null {
  return row.oldestExportValidationDate ?? row.oldestPendingCorrectionDate ?? null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysSince(iso: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS);
}

export function formatAmount(amount: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: the same command as in Step 2.
Expected: `# fail 0`, with every `describe` passing.

- [ ] **Step 5: Commit**

```bash
cd /c/unirefund/web-app-wt-vat-lifecycle && npx prettier --write "apps/web/src/app/[lang]/(main)/(unirefund)/finance/vat-statements/_components/lifecycle.ts" "apps/web/src/app/[lang]/(main)/(unirefund)/finance/vat-statements/_components/lifecycle.test.ts" >/dev/null
git add "apps/web/src/app/[lang]/(main)/(unirefund)/finance/vat-statements/_components/lifecycle.ts" "apps/web/src/app/[lang]/(main)/(unirefund)/finance/vat-statements/_components/lifecycle.test.ts"
git commit -q -F - <<'EOF'
feat(vat-statements): pure helpers for status, payments and unbilled tags

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: History value formatting

**Files:**
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/finance/vat-statements/_components/history-format.ts`
- Test: `apps/web/src/app/[lang]/(main)/(unirefund)/finance/vat-statements/_components/history-format.test.ts`

**Interfaces:**
- **Produces:**
  - Formatting:
    - `historyLabel(propertyName: string, labels: Partial<Record<string, string>>): string`
    - `historyValue(propertyName: string, raw: string | null | undefined, ctx: HistoryContext): string | null`
    - `type HistoryContext = { formatDate: (iso: string) => string; enumLabel: (propertyName: string, value: number | string) => string | null }`
  - Enum ordinals, starting empty until Task 10 confirms them on dev:
    - `ENUM_ORDINALS: { Status?: readonly VatStatus[]; PaymentStatus?: readonly PaymentStatus[] }`
    - `enumMember(propertyName: "Status" | "PaymentStatus", value: number | string): string | null`

- [ ] **Step 1: Write the failing tests**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { enumMember, historyLabel, historyValue } from "./history-format";

const ctx = {
  formatDate: (iso: string) => `date(${iso})`,
  enumLabel: (property: string, value: number | string) =>
    property === "Status" && value === "PaymentReminder1" ? "Payment reminder 1" : null,
};

describe("historyLabel", () => {
  it("uses a known label", () => {
    assert.equal(historyLabel("Status", { Status: "Status label" }), "Status label");
  });
  it("splits an unknown property name into words, keeping acronyms", () => {
    assert.equal(historyLabel("DueDate", {}), "Due date");
    assert.equal(historyLabel("VATStatementDate", {}), "VAT statement date");
  });
});

describe("historyValue", () => {
  it("shows nothing for a missing value", () => {
    assert.equal(historyValue("Status", null, ctx), null);
    assert.equal(historyValue("Status", undefined, ctx), null);
  });
  it("unquotes a JSON string", () => {
    assert.equal(historyValue("InvoiceNumber", '"INV-42"', ctx), "INV-42");
  });
  it("formats an ISO date, quoted or bare", () => {
    assert.equal(historyValue("DueDate", '"2026-10-01T00:00:00"', ctx), "date(2026-10-01T00:00:00)");
    assert.equal(historyValue("DueDate", "2026-10-01T00:00:00", ctx), "date(2026-10-01T00:00:00)");
  });
  it("labels an enum name and leaves an unconfirmed ordinal as recorded", () => {
    assert.equal(historyValue("Status", '"PaymentReminder1"', ctx), "Payment reminder 1");
    assert.equal(historyValue("Status", "1", ctx), "1");
  });
  it("leaves an amount as recorded", () => {
    assert.equal(historyValue("PaidAmount", "120.5", ctx), "120.5");
  });
});

describe("enumMember", () => {
  it("maps a member name, and no ordinal until the mapping is confirmed", () => {
    assert.equal(enumMember("Status", "Sent"), "Sent");
    assert.equal(enumMember("Status", "NotAStatus"), null);
    assert.equal(enumMember("Status", 0), null);
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `cd apps/web && node --import tsx --test "src/app/[[]lang]/(main)/(unirefund)/finance/vat-statements/_components/history-format.test.ts"`
Expected: FAIL with `Cannot find module './history-format'`.

- [ ] **Step 3: Implement**

```ts
import type {
  UniRefund_FinanceService_Enums_PaymentStatus as PaymentStatus,
  UniRefund_FinanceService_Enums_VATStatementStatus as VatStatus,
} from "@repo/saas/FinanceService";

export type HistoryContext = {
  formatDate: (iso: string) => string;
  enumLabel: (propertyName: string, value: number | string) => string | null;
};

const VAT_STATUSES: readonly VatStatus[] = [
  "Sent",
  "PaymentReminder1",
  "PaymentReminder2",
  "PaymentReminder3",
  "DebtCollection",
  "Cancelled",
  "CreditNote",
  "Paid",
];
const PAYMENT_STATUSES: readonly PaymentStatus[] = ["NotPaid", "PartlyPaid", "Paid", "OverPaid"];

// Audited enums are ordinals whose numbering the schema does not state; an
// entry here only after a real history record on dev has confirmed it.
export const ENUM_ORDINALS: {
  Status?: readonly VatStatus[];
  PaymentStatus?: readonly PaymentStatus[];
} = {};

export function enumMember(
  propertyName: "Status" | "PaymentStatus",
  value: number | string
): string | null {
  if (typeof value === "number") return ENUM_ORDINALS[propertyName]?.[value] ?? null;
  const members: readonly string[] = propertyName === "Status" ? VAT_STATUSES : PAYMENT_STATUSES;
  return members.includes(value) ? value : null;
}

export function historyLabel(
  propertyName: string,
  labels: Partial<Record<string, string>>
): string {
  const known = labels[propertyName];
  if (known) return known;
  const words = propertyName
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(" ");
  return words
    .map((word, index) =>
      index === 0 || word === word.toUpperCase() ? word : word.toLowerCase()
    )
    .join(" ");
}

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

export function historyValue(
  propertyName: string,
  raw: string | null | undefined,
  ctx: HistoryContext
): string | null {
  if (raw === null || raw === undefined) return null;
  let value = raw;
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    try {
      value = JSON.parse(value) as string;
    } catch {
      return raw;
    }
    const label = ctx.enumLabel(propertyName, value);
    if (label) return label;
  } else if (/^-?\d+$/.test(value)) {
    return ctx.enumLabel(propertyName, Number(value)) ?? value;
  }
  return ISO_DATE_TIME.test(value) ? ctx.formatDate(value) : value;
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: the same command as in Step 2.
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
cd /c/unirefund/web-app-wt-vat-lifecycle && npx prettier --write "apps/web/src/app/[lang]/(main)/(unirefund)/finance/vat-statements/_components/history-format.ts" "apps/web/src/app/[lang]/(main)/(unirefund)/finance/vat-statements/_components/history-format.test.ts" >/dev/null
git add "apps/web/src/app/[lang]/(main)/(unirefund)/finance/vat-statements/_components/history-format.ts" "apps/web/src/app/[lang]/(main)/(unirefund)/finance/vat-statements/_components/history-format.test.ts"
git commit -q -F - <<'EOF'
feat(vat-statements): format audited history values for display

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: Server actions and labels

**Files:**
- Modify: `packages/actions/unirefund/FinanceService/actions.ts` (append 4 functions, extend the type import)
- Modify: `packages/actions/unirefund/FinanceService/put-actions.ts` (append 1)
- Modify: `packages/actions/unirefund/FinanceService/post-actions.ts` (append 1, extend the type import)
- Modify: `apps/web/src/language-data/unirefund/FinanceService/resources/en.json` and `tr.json`
- Modify: `apps/web/src/language-data/core/AbpUiNavigation/resources/en.json` and `tr.json`

**Interfaces:**
- **Produces:**
  - Reads, in `actions.ts`:
    - `getVatStatementStatusHintApi(id: string, session?: Session | null)`, returning `{ data: VATStatementStatusHintDto }`
    - `getVatStatementPaymentsApi(data: GetApiFinanceServiceVatStatementHeadersByIdPaymentsData, session?)`
    - `getVatStatementHistoryApi(data: GetApiFinanceServiceVatStatementHeadersByIdHistoryData, session?)`
    - `getVatStatementUnbilledTagsApi(data: GetApiFinanceServiceVatStatementHeadersUnbilledTagsData, session?)`
  - Writes:
    - `putVatStatementStatusApi(data: PutApiFinanceServiceVatStatementHeadersByIdStatusData)`, in `put-actions.ts`
    - `postVatStatementPaymentApi(data: PostApiFinanceServiceVatStatementHeadersByIdPaymentsData)`, in `post-actions.ts`
  - Label keys: listed in Step 3.

- [ ] **Step 1: Append the GET actions to `actions.ts`**

Add `GetApiFinanceServiceVatStatementHeadersByIdPaymentsData`, `GetApiFinanceServiceVatStatementHeadersByIdHistoryData` and `GetApiFinanceServiceVatStatementHeadersUnbilledTagsData` to the existing `import type { … } from "@repo/saas/FinanceService"`. Then append:

```ts
export async function getVatStatementStatusHintApi(
  id: string,
  session?: Session | null
) {
  try {
    const client = await getFinanceServiceClient(session);
    const dataResponse =
      await client.vatStatementHeader.getApiFinanceServiceVatStatementHeadersByIdStatusHint(
        { id }
      );
    return structuredSuccessResponse(dataResponse);
  } catch (error) {
    throw structuredError(error);
  }
}

export async function getVatStatementPaymentsApi(
  data: GetApiFinanceServiceVatStatementHeadersByIdPaymentsData,
  session?: Session | null
) {
  try {
    const client = await getFinanceServiceClient(session);
    const dataResponse =
      await client.vatStatementHeader.getApiFinanceServiceVatStatementHeadersByIdPayments(
        data
      );
    return structuredSuccessResponse(dataResponse);
  } catch (error) {
    throw structuredError(error);
  }
}

export async function getVatStatementHistoryApi(
  data: GetApiFinanceServiceVatStatementHeadersByIdHistoryData,
  session?: Session | null
) {
  try {
    const client = await getFinanceServiceClient(session);
    const dataResponse =
      await client.vatStatementHeader.getApiFinanceServiceVatStatementHeadersByIdHistory(
        data
      );
    return structuredSuccessResponse(dataResponse);
  } catch (error) {
    throw structuredError(error);
  }
}

export async function getVatStatementUnbilledTagsApi(
  data: GetApiFinanceServiceVatStatementHeadersUnbilledTagsData,
  session?: Session | null
) {
  try {
    const client = await getFinanceServiceClient(session);
    const dataResponse =
      await client.vatStatementHeader.getApiFinanceServiceVatStatementHeadersUnbilledTags(
        data
      );
    return structuredSuccessResponse(dataResponse);
  } catch (error) {
    throw structuredError(error);
  }
}
```

- [ ] **Step 2: Append the write actions**

In `put-actions.ts`, extend the type import with `PutApiFinanceServiceVatStatementHeadersByIdStatusData`, then append:

```ts
export async function putVatStatementStatusApi(
  data: PutApiFinanceServiceVatStatementHeadersByIdStatusData
) {
  try {
    const client = await getFinanceServiceClient();
    const dataResponse =
      await client.vatStatementHeader.putApiFinanceServiceVatStatementHeadersByIdStatus(
        data
      );
    return structuredResponse(dataResponse);
  } catch (error) {
    return structuredError(error);
  }
}
```

In `post-actions.ts`, extend the type import with `PostApiFinanceServiceVatStatementHeadersByIdPaymentsData`, then append:

```ts
export async function postVatStatementPaymentApi(
  data: PostApiFinanceServiceVatStatementHeadersByIdPaymentsData
) {
  try {
    const client = await getFinanceServiceClient();
    const dataResponse =
      await client.vatStatementHeader.postApiFinanceServiceVatStatementHeadersByIdPayments(
        data
      );
    return structuredResponse(dataResponse);
  } catch (error) {
    return structuredError(error);
  }
}
```

- [ ] **Step 3: Add the labels**

In FinanceService `en.json`:
- **Change three values:**
  - `"Finance.status.PaymentReminder1": "Payment reminder 1"`
  - `"Finance.status.PaymentReminder2": "Payment reminder 2"`
  - `"Finance.status.PaymentReminder3": "Payment reminder 3"`

  Today all three read "Payment reminder", which would give three identical buttons.
- **Append these keys:**

```json
  "Finance.tab.statement": "Statement",
  "Finance.tab.payments": "Payments",
  "Finance.tab.history": "History",
  "Finance.paidAmount": "Paid",
  "Finance.statusChange.title": "Change status",
  "Finance.statusChange.more": "More",
  "Finance.statusChange.confirm": "Move {0} from {1} to {2}?",
  "Finance.statusChange.done": "Status changed.",
  "Finance.payments.record": "Record payment",
  "Finance.payments.amount": "Amount",
  "Finance.payments.amount.hint": "Enter a negative amount to correct an earlier entry; entries are never edited.",
  "Finance.payments.paymentDate": "Payment date",
  "Finance.payments.referenceNumber": "Bank reference",
  "Finance.payments.archiveId": "Archive / document no.",
  "Finance.payments.problem.zero": "Enter a non-zero amount.",
  "Finance.payments.problem.belowZero": "This would take the paid total below zero.",
  "Finance.payments.problem.future": "The payment date cannot be in the future.",
  "Finance.payments.warning.overPaid": "The statement will be marked over-paid.",
  "Finance.payments.review": "Review",
  "Finance.payments.review.description": "Payments cannot be edited. Check the details before recording.",
  "Finance.payments.back": "Back",
  "Finance.payments.done": "Payment recorded.",
  "Finance.payments.empty": "No payments recorded yet.",
  "Finance.payments.correction": "Correction",
  "Finance.payments.totalBeforePayment": "Balance before",
  "Finance.payments.creationTime": "Recorded at",
  "Finance.history.empty": "No changes recorded yet.",
  "Finance.history.system": "System",
  "Finance.history.loadMore": "Load more",
  "Finance.history.changeType.Created": "Created",
  "Finance.history.changeType.Updated": "Updated",
  "Finance.history.changeType.Deleted": "Deleted",
  "Finance.unbilled.waitingSince": "Waiting since",
  "Finance.unbilled.days": "{0} days",
  "Finance.unbilled.periods": "Periods",
  "Finance.unbilled.billable": "Billable",
  "Finance.unbilled.billable.yes": "Yes",
  "Finance.unbilled.billable.no": "No",
  "Finance.unbilled.billable.unknown": "Not checked",
  "Finance.unbilled.pendingCorrections": "Pending corrections"
```

In `tr.json`, do the same:
- **Change three values:**
  - `"Finance.status.PaymentReminder1": "Ödeme hatırlatması 1"`
  - `"Finance.status.PaymentReminder2": "Ödeme hatırlatması 2"`
  - `"Finance.status.PaymentReminder3": "Ödeme hatırlatması 3"`
- **Append these keys:**

```json
  "Finance.tab.statement": "Ekstre",
  "Finance.tab.payments": "Ödemeler",
  "Finance.tab.history": "Geçmiş",
  "Finance.paidAmount": "Ödenen",
  "Finance.statusChange.title": "Durumu değiştir",
  "Finance.statusChange.more": "Diğer",
  "Finance.statusChange.confirm": "{0}, {1} durumundan {2} durumuna taşınsın mı?",
  "Finance.statusChange.done": "Durum değiştirildi.",
  "Finance.payments.record": "Ödeme kaydet",
  "Finance.payments.amount": "Tutar",
  "Finance.payments.amount.hint": "Önceki bir kaydı düzeltmek için negatif tutar girin; kayıtlar asla düzenlenmez.",
  "Finance.payments.paymentDate": "Ödeme tarihi",
  "Finance.payments.referenceNumber": "Banka referansı",
  "Finance.payments.archiveId": "Arşiv / belge no.",
  "Finance.payments.problem.zero": "Sıfırdan farklı bir tutar girin.",
  "Finance.payments.problem.belowZero": "Bu, ödenen toplamı sıfırın altına düşürür.",
  "Finance.payments.problem.future": "Ödeme tarihi gelecekte olamaz.",
  "Finance.payments.warning.overPaid": "Ekstre fazla ödenmiş olarak işaretlenecek.",
  "Finance.payments.review": "Gözden geçir",
  "Finance.payments.review.description": "Ödemeler düzenlenemez. Kaydetmeden önce bilgileri kontrol edin.",
  "Finance.payments.back": "Geri",
  "Finance.payments.done": "Ödeme kaydedildi.",
  "Finance.payments.empty": "Henüz ödeme kaydedilmedi.",
  "Finance.payments.correction": "Düzeltme",
  "Finance.payments.totalBeforePayment": "Önceki bakiye",
  "Finance.payments.creationTime": "Kaydedilme",
  "Finance.history.empty": "Henüz değişiklik kaydı yok.",
  "Finance.history.system": "Sistem",
  "Finance.history.loadMore": "Daha fazla yükle",
  "Finance.history.changeType.Created": "Oluşturuldu",
  "Finance.history.changeType.Updated": "Güncellendi",
  "Finance.history.changeType.Deleted": "Silindi",
  "Finance.unbilled.waitingSince": "Bekleme başlangıcı",
  "Finance.unbilled.days": "{0} gün",
  "Finance.unbilled.periods": "Dönemler",
  "Finance.unbilled.billable": "Faturalanabilir",
  "Finance.unbilled.billable.yes": "Evet",
  "Finance.unbilled.billable.no": "Hayır",
  "Finance.unbilled.billable.unknown": "Kontrol edilmedi",
  "Finance.unbilled.pendingCorrections": "Bekleyen düzeltmeler"
```

In AbpUiNavigation, add `"VatStatements.Unbilled"` after the `"VatStatements.New"` line: `"Unbilled tags"` in `en.json`, `"Faturalanmamış etiketler"` in `tr.json`. Edit the JSON with a script that preserves the file's line endings, and parse it afterwards to check it is still valid JSON.

- [ ] **Step 4: Regenerate and type-check**

Run: `cd /c/unirefund/web-app-wt-vat-lifecycle/apps/web && pnpm run init && cd ../.. && pnpm --filter web type-check`
Expected: `init` exits 0, and type-check exits 0.

- [ ] **Step 5: Commit**

```bash
cd /c/unirefund/web-app-wt-vat-lifecycle && npx prettier --write packages/actions/unirefund/FinanceService/actions.ts packages/actions/unirefund/FinanceService/put-actions.ts packages/actions/unirefund/FinanceService/post-actions.ts >/dev/null
git add packages/actions/unirefund/FinanceService/actions.ts packages/actions/unirefund/FinanceService/put-actions.ts packages/actions/unirefund/FinanceService/post-actions.ts apps/web/src/language-data/unirefund/FinanceService/resources/en.json apps/web/src/language-data/unirefund/FinanceService/resources/tr.json apps/web/src/language-data/core/AbpUiNavigation/resources/en.json apps/web/src/language-data/core/AbpUiNavigation/resources/tr.json
git commit -q -F - <<'EOF'
feat(vat-statements): actions and labels for status, payments, history and unbilled tags

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

The new keys are unused until Tasks 4–9 use them. `i18n:unused` is checked in Task 10, not here.

---

### Task 4: Detail layout, header strip and tabs

**Files:**
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/finance/vat-statements/_components/statement-tabs.ts`
- Test: `apps/web/src/app/[lang]/(main)/(unirefund)/finance/vat-statements/_components/statement-tabs.test.ts`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/finance/vat-statements/[vatStatementId]/layout.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/finance/vat-statements/_components/statement-header.tsx`
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/finance/vat-statements/[vatStatementId]/page.tsx`. Remove the `BreadcrumbTitle` (and its import) and the wrapper `div className="pp-0 pl-2"`, so the page returns `<Client …/>` directly.

**Interfaces:**
- **Consumes:** `getVatStatementHeadersByIdApi`, and `getVatStatementStatusHintApi` (Task 3); `formatAmount` (Task 1).
- **Produces:**
  - `grantedStatementTabs(granted: GrantedPolicies): StatementTab[]`
  - `type StatementTab = "payments" | "history"`
  - `StatementHeader({ statement, hint, lang, children })`: Tasks 5 and 7 render their action components as `children`.

- [ ] **Step 1: Write the failing tab test**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { grantedStatementTabs } from "./statement-tabs";

const grant = (...names: string[]) =>
  Object.fromEntries(names.map((name) => [name, true])) as never;

describe("grantedStatementTabs", () => {
  it("lists the tabs whose page guard is met, in order", () => {
    assert.deepEqual(
      grantedStatementTabs(
        grant(
          "FinanceService.VATStatementHeaders",
          "FinanceService.VATStatementHeaders.ViewPayments",
          "FinanceService.VATStatementHeaders.ViewHistory"
        )
      ),
      ["payments", "history"]
    );
  });
  it("needs the group as well as the leaf", () => {
    assert.deepEqual(
      grantedStatementTabs(grant("FinanceService.VATStatementHeaders.ViewHistory")),
      []
    );
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd apps/web && node --import tsx --test "src/app/[[]lang]/(main)/(unirefund)/finance/vat-statements/_components/statement-tabs.test.ts"`
Expected: FAIL with `Cannot find module './statement-tabs'`.

- [ ] **Step 3: Implement `statement-tabs.ts`**

```ts
import { isActionGranted } from "@repo/utils/policies";
import type { GrantedPolicies } from "@/src/utils/policies";

export type StatementTab = "payments" | "history";

/** The statement tabs, after Statement itself, whose page guard this user meets. */
export function grantedStatementTabs(granted: GrantedPolicies): StatementTab[] {
  const tabs: StatementTab[] = [];
  if (
    isActionGranted(
      ["FinanceService.VATStatementHeaders", "FinanceService.VATStatementHeaders.ViewPayments"],
      granted
    )
  ) {
    tabs.push("payments");
  }
  if (
    isActionGranted(
      ["FinanceService.VATStatementHeaders", "FinanceService.VATStatementHeaders.ViewHistory"],
      granted
    )
  ) {
    tabs.push("history");
  }
  return tabs;
}
```

Run the Step 2 command. Expected: `# fail 0`.

- [ ] **Step 4: Write `statement-header.tsx`**

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { Badge } from "@repo/ayasofyazilim-ui/components/badge";
import { formatToLocalizedDate } from "@repo/ayasofyazilim-ui/custom/date-tooltip";
import type {
  UniRefund_FinanceService_Enums_PaymentStatus as PaymentStatus,
  UniRefund_FinanceService_Enums_VATStatementStatus as VatStatus,
  UniRefund_FinanceService_VATStatementHeaders_VATStatementHeaderDetailDto as StatementDto,
  UniRefund_FinanceService_VATStatementHeaders_VATStatementStatusHintDto as StatusHintDto,
} from "@repo/saas/FinanceService";
import { useLocalization } from "@repo/utils/app-config";
import type { ReactNode } from "react";
import { formatAmount } from "./lifecycle";

const STATUS_BADGE: Record<VatStatus, "info" | "warning" | "destructive" | "gray" | "purple" | "success"> = {
  Sent: "info",
  PaymentReminder1: "warning",
  PaymentReminder2: "warning",
  PaymentReminder3: "warning",
  DebtCollection: "destructive",
  Cancelled: "gray",
  CreditNote: "purple",
  Paid: "success",
};

const PAYMENT_BADGE: Record<PaymentStatus, "warning" | "info" | "success" | "purple"> = {
  NotPaid: "warning",
  PartlyPaid: "info",
  Paid: "success",
  OverPaid: "purple",
};

export function StatementHeader({
  statement,
  hint,
  lang,
  children,
}: {
  statement: StatementDto;
  hint: StatusHintDto | null;
  lang: string;
  children?: ReactNode;
}) {
  const { t } = useTranslations();
  const localization = useLocalization();
  // Without the hint permission the strip shows the statement's own figures.
  const status = hint?.status ?? statement.status;
  const paymentStatus = hint?.paymentStatus ?? statement.paymentStatus;
  const total = hint?.totalAmount ?? statement.totalAmount;
  const unpaid = hint?.unpaidAmount ?? statement.unpaidAmount;
  const money = (amount: number) => formatAmount(amount, statement.currency, lang);
  const day = (iso: string) =>
    formatToLocalizedDate({
      localization,
      date: iso,
      dateOptions: { day: "2-digit", month: "short", year: "numeric" },
      timeZone: localization.timeZone,
    });
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-4"
      data-testid="vat-statement-header"
    >
      <div className="flex flex-col gap-1">
        <div className="text-base font-semibold">
          {statement.invoiceNumber} · {statement.merchantName}
        </div>
        <div className="text-sm text-muted-foreground">
          {day(statement.referenceDateBegin)} – {day(statement.referenceDateEnd)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge data-testid="vat-statement-status" variant={STATUS_BADGE[status]}>
            {t.FinanceService[`Finance.status.${status}`]}
          </Badge>
          <Badge data-testid="vat-statement-payment-status" variant={PAYMENT_BADGE[paymentStatus]}>
            {t.FinanceService[`Finance.paymentStatus.${paymentStatus}`]}
          </Badge>
          <span className="text-sm" data-testid="vat-statement-figures">
            {hint ? `${t.FinanceService["Finance.paidAmount"]} ${money(hint.paidAmount)} / ` : ""}
            {t.FinanceService["Finance.totalAmount"]} {money(total)} ·{" "}
            {t.FinanceService["Finance.unpaidAmount"]} {money(unpaid)}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
```

- [ ] **Step 5: Write `[vatStatementId]/layout.tsx`**

```tsx
import { BreadcrumbTitle } from "@/components/sidebar-layout/breadcrumb/title";
import { guardPage } from "@/src/components/permission-guard/guard";
import { getTranslations } from "@/src/language-data/get-translations";
import { getBaseLink } from "@/src/utils";
import { isRequirementMet } from "@/src/utils/policies";
import {
  getVatStatementHeadersByIdApi,
  getVatStatementStatusHintApi,
} from "@repo/actions/unirefund/FinanceService/actions";
import { TabLayout } from "@repo/ayasofyazilim-ui/custom/tab-layout";
import ErrorComponent from "@repo/ui/components/error-component";
import { structuredError } from "@repo/utils/api";
import { getApplicationConfiguration } from "@repo/utils/app-config/fetch";
import { auth } from "@repo/utils/auth/next-auth";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { StatementHeader } from "../_components/statement-header";
import { grantedStatementTabs } from "../_components/statement-tabs";

async function getApiRequests(id: string) {
  try {
    const session = await auth();
    const { policies } = await getApplicationConfiguration();
    const requiredRequests = await Promise.all([
      getVatStatementHeadersByIdApi(id, session),
    ]);
    const optionalRequests = await Promise.allSettled([
      isRequirementMet(
        [
          "FinanceService.VATStatementHeaders",
          "FinanceService.VATStatementHeaders.ViewStatusHint",
        ],
        policies
      )
        ? getVatStatementStatusHintApi(id, session)
        : Promise.reject(new Error("not granted")),
    ]);
    return { requiredRequests, optionalRequests, policies };
  } catch (error) {
    if (!isRedirectError(error)) return structuredError(error);
    throw error;
  }
}

export default async function Layout({
  params,
  children,
}: {
  params: Promise<{ lang: string; vatStatementId: string }>;
  children: React.ReactNode;
}) {
  const { lang, vatStatementId } = await params;
  const denied = await guardPage({
    requires: [
      "FinanceService.VATStatementHeaders",
      "FinanceService.VATStatementHeaders.View",
    ],
    lang,
  });
  if (denied) return denied;
  const t = await getTranslations(lang);
  const apiRequests = await getApiRequests(vatStatementId);
  if ("message" in apiRequests) {
    return <ErrorComponent languageData={t.Default} message={apiRequests.message} />;
  }
  const [statementResponse] = apiRequests.requiredRequests;
  const [hintResult] = apiRequests.optionalRequests;
  const hint = hintResult.status === "fulfilled" ? hintResult.value.data : null;
  const statement = statementResponse.data;
  const baseLink = getBaseLink(`finance/vat-statements/${vatStatementId}`, lang);
  const tabLabels = {
    payments: t.FinanceService["Finance.tab.payments"],
    history: t.FinanceService["Finance.tab.history"],
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
      <BreadcrumbTitle
        replacements={{ find: vatStatementId, title: statement.merchantName }}
      />
      <StatementHeader hint={hint} lang={lang} statement={statement} />
      <TabLayout
        classNames={{ horizontal: { tabList: "w-full sm:w-max justify-start" } }}
        tabList={[
          { href: baseLink, label: t.FinanceService["Finance.tab.statement"] },
          ...grantedStatementTabs(apiRequests.policies).map((tab) => ({
            href: `${baseLink}/${tab}`,
            label: tabLabels[tab],
          })),
        ]}
      >
        {children}
      </TabLayout>
    </div>
  );
}
```

- [ ] **Step 6: Gates and commit**

Run: `cd /c/unirefund/web-app-wt-vat-lifecycle && pnpm --filter web type-check && (cd apps/web && npx eslint "src/app/[lang]/(main)/(unirefund)/finance/vat-statements") && pnpm policy:audit`
Expected:
- type-check exits 0;
- eslint reports 0 errors;
- the audit reports `0 violation(s)`.

If `getApplicationConfiguration().policies` is not assignable to `GrantedPolicies`, look at how the refund layout passes it (it passes the same value). Then cast at the call site the same way, and record a ruling.

```bash
cd /c/unirefund/web-app-wt-vat-lifecycle && D="apps/web/src/app/[lang]/(main)/(unirefund)/finance/vat-statements"
npx prettier --write "$D/_components/statement-tabs.ts" "$D/_components/statement-tabs.test.ts" "$D/_components/statement-header.tsx" "$D/[vatStatementId]/layout.tsx" "$D/[vatStatementId]/page.tsx" >/dev/null
git add "$D/_components/statement-tabs.ts" "$D/_components/statement-tabs.test.ts" "$D/_components/statement-header.tsx" "$D/[vatStatementId]/layout.tsx" "$D/[vatStatementId]/page.tsx"
git commit -q -F - <<'EOF'
feat(vat-statements): statement header strip and Statement/Payments/History tabs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

The Payments and History tab links lead to a 404 until Tasks 6 and 8 add the pages.

---

### Task 5: Status actions

**Files:**
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/finance/vat-statements/_components/status-actions.tsx`
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/finance/vat-statements/[vatStatementId]/layout.tsx`. Render `<StatusActions hint={hint} invoiceNumber={statement.invoiceNumber} statementId={statement.id} />` as a child of `StatementHeader`.

**Interfaces:**
- **Consumes:** `statusActions` (Task 1), `putVatStatementStatusApi` (Task 3), `StatementHeader` children (Task 4).
- **Produces:** `StatusActions({ statementId, invoiceNumber, hint })`.

- [ ] **Step 1: Write `status-actions.tsx`**

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { putVatStatementStatusApi } from "@repo/actions/unirefund/FinanceService/put-actions";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ayasofyazilim-ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ayasofyazilim-ui/components/dropdown-menu";
import { toast } from "@repo/ayasofyazilim-ui/components/sonner";
import type {
  UniRefund_FinanceService_Enums_VATStatementStatus as VatStatus,
  UniRefund_FinanceService_VATStatementHeaders_VATStatementStatusHintDto as StatusHintDto,
} from "@repo/saas/FinanceService";
import { useApplicationConfiguration } from "@repo/utils/app-config";
import { isActionGranted } from "@repo/utils/policies";
import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { statusActions } from "./lifecycle";

export function StatusActions({
  statementId,
  invoiceNumber,
  hint,
}: {
  statementId: string;
  invoiceNumber: string;
  hint: StatusHintDto | null;
}) {
  const { t } = useTranslations();
  const router = useRouter();
  const { policies: grantedPolicies } = useApplicationConfiguration();
  const [target, setTarget] = useState<VatStatus | null>(null);
  const [isPending, startTransition] = useTransition();
  const canChange = isActionGranted(
    ["FinanceService.VATStatementHeaders", "FinanceService.VATStatementHeaders.ChangeStatus"],
    grantedPolicies
  );
  if (!canChange || !hint || hint.isTerminal) return null;
  const { primary, more } = statusActions(hint.allowedNextStatuses);
  if (primary.length === 0 && more.length === 0) return null;
  const label = (status: VatStatus) => t.FinanceService[`Finance.status.${status}`];

  function confirm() {
    if (!target) return;
    startTransition(async () => {
      const response = await putVatStatementStatusApi({
        id: statementId,
        requestBody: { status: target },
      });
      if (response.type === "success") {
        toast.success(t.FinanceService["Finance.statusChange.done"]);
      } else {
        toast.error(response.message);
      }
      setTarget(null);
      // Either way the hint is re-read, so the buttons match the backend again.
      router.refresh();
    });
  }

  return (
    <>
      {primary.map((status) => (
        <Button
          data-testid={`vat-status-${status}`}
          disabled={isPending}
          key={status}
          onClick={() => setTarget(status)}
          variant="outline"
        >
          {label(status)}
        </Button>
      ))}
      {more.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild data-testid="vat-status-more">
            <Button disabled={isPending} variant="outline">
              {t.FinanceService["Finance.statusChange.more"]}
              <ChevronDown className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent data-testid="vat-status-more-content">
            {more.map((status) => (
              <DropdownMenuItem
                className="text-destructive"
                data-testid={`vat-status-${status}`}
                key={status}
                onSelect={() => setTarget(status)}
              >
                {label(status)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <Dialog
        data-testid="vat-status-dialog"
        onOpenChange={(open) => {
          if (!open && !isPending) setTarget(null);
        }}
        open={target !== null}
      >
        <DialogContent data-testid="vat-status-dialog-content">
          <DialogHeader data-testid="vat-status-dialog-header">
            <DialogTitle data-testid="vat-status-dialog-title">
              {t.FinanceService["Finance.statusChange.title"]}
            </DialogTitle>
            <DialogDescription data-testid="vat-status-dialog-description">
              {target
                ? t.FinanceService["Finance.statusChange.confirm"]
                    .replace("{0}", invoiceNumber)
                    .replace("{1}", label(hint.status))
                    .replace("{2}", label(target))
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter data-testid="vat-status-dialog-footer">
            <Button
              data-testid="vat-status-cancel"
              disabled={isPending}
              onClick={() => setTarget(null)}
              variant="outline"
            >
              {t.Default.Cancel}
            </Button>
            <Button
              data-testid="vat-status-confirm"
              disabled={isPending}
              onClick={confirm}
              variant={target && more.includes(target) ? "destructive" : "default"}
            >
              {target ? label(target) : null}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Render it in the layout**

In `layout.tsx`, add `import { StatusActions } from "../_components/status-actions";`. Then replace the header line with:

```tsx
      <StatementHeader hint={hint} lang={lang} statement={statement}>
        <StatusActions
          hint={hint}
          invoiceNumber={statement.invoiceNumber}
          statementId={statement.id}
        />
      </StatementHeader>
```

- [ ] **Step 3: Gates and commit**

Run: `pnpm --filter web type-check && (cd apps/web && npx eslint "src/app/[lang]/(main)/(unirefund)/finance/vat-statements") && pnpm policy:audit`
Expected: exit 0, 0 lint errors, and 0 audit violations.

If `DropdownMenuTrigger` or `DialogTitle` triggers the testid rule on a nested element, put the `data-testid` on the component itself, as above.

```bash
cd /c/unirefund/web-app-wt-vat-lifecycle && D="apps/web/src/app/[lang]/(main)/(unirefund)/finance/vat-statements"
npx prettier --write "$D/_components/status-actions.tsx" "$D/[vatStatementId]/layout.tsx" >/dev/null
git add "$D/_components/status-actions.tsx" "$D/[vatStatementId]/layout.tsx"
git commit -q -F - <<'EOF'
feat(vat-statements): move a statement to the statuses the backend allows

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 6: Payments tab

**Files:**
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/finance/vat-statements/[vatStatementId]/payments/page.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/finance/vat-statements/[vatStatementId]/payments/loading.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/finance/vat-statements/_components/payments-table.tsx`

**Interfaces:**
- **Consumes:** `getVatStatementPaymentsApi` (Task 3), `formatAmount` (Task 1).
- **Produces:** `PaymentsTable({ response, lang })`.

- [ ] **Step 1: Write `payments-table.tsx`**

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { Badge } from "@repo/ayasofyazilim-ui/components/badge";
import { MasterDataGrid } from "@repo/ayasofyazilim-ui/custom/master-data-grid";
import {
  $UniRefund_FinanceService_VATStatementPayments_VATStatementPaymentDto,
  type PagedResultDto_VATStatementPaymentDto,
} from "@repo/saas/FinanceService";
import { useLocalization } from "@repo/utils/app-config";
import { formatAmount } from "./lifecycle";

export function PaymentsTable({
  response,
  lang,
}: {
  response: PagedResultDto_VATStatementPaymentDto;
  lang: string;
}) {
  const { t } = useTranslations();
  const localization = useLocalization();
  if (!response.items?.length) {
    return (
      <p className="p-4 text-sm text-muted-foreground" data-testid="vat-payments-empty">
        {t.FinanceService["Finance.payments.empty"]}
      </p>
    );
  }
  return (
    <MasterDataGrid
      data={response.items}
      config={{
        localization,
        rowCount: response.totalCount,
        schema: $UniRefund_FinanceService_VATStatementPayments_VATStatementPaymentDto,
        schemaColumns: {
          mode: "include",
          columns: [
            "paymentDate",
            "amount",
            "totalBeforePayment",
            "referenceNumber",
            "archiveId",
            "creationTime",
          ],
        },
        t: {
          ...t.Default,
          "column.paymentDate": t.FinanceService["Finance.payments.paymentDate"],
          "column.amount": t.FinanceService["Finance.payments.amount"],
          "column.totalBeforePayment": t.FinanceService["Finance.payments.totalBeforePayment"],
          "column.referenceNumber": t.FinanceService["Finance.payments.referenceNumber"],
          "column.archiveId": t.FinanceService["Finance.payments.archiveId"],
          "column.creationTime": t.FinanceService["Finance.payments.creationTime"],
        },
        customRenderers: {
          amount: ({ row }) =>
            row.original.amount < 0 ? (
              <span className="flex items-center gap-2 font-medium text-destructive">
                {formatAmount(row.original.amount, row.original.currency, lang)}
                <Badge data-testid="vat-payment-correction" variant="destructive">
                  {t.FinanceService["Finance.payments.correction"]}
                </Badge>
              </span>
            ) : (
              formatAmount(row.original.amount, row.original.currency, lang)
            ),
          totalBeforePayment: ({ row }) =>
            formatAmount(row.original.totalBeforePayment, row.original.currency, lang),
        },
      }}
    />
  );
}
```

- [ ] **Step 2: Write `payments/page.tsx` and `loading.tsx`**

```tsx
"use server";
import { guardPage } from "@/src/components/permission-guard/guard";
import { getTranslations } from "@/src/language-data/get-translations";
import { getVatStatementPaymentsApi } from "@repo/actions/unirefund/FinanceService/actions";
import ErrorComponent from "@repo/ui/components/error-component";
import { structuredError } from "@repo/utils/api";
import { auth } from "@repo/utils/auth/next-auth";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { PaymentsTable } from "../../_components/payments-table";

type PaymentSearch = { sorting?: string; skipCount?: string; maxResultCount?: string };

async function getApiRequests(id: string, search: PaymentSearch) {
  try {
    const session = await auth();
    const requiredRequests = await Promise.all([
      getVatStatementPaymentsApi(
        {
          id,
          sorting: search.sorting,
          skipCount: search.skipCount ? Number(search.skipCount) : undefined,
          maxResultCount: search.maxResultCount ? Number(search.maxResultCount) : undefined,
        },
        session
      ),
    ]);
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
  params: Promise<{ lang: string; vatStatementId: string }>;
  searchParams: Promise<PaymentSearch>;
}) {
  const { lang, vatStatementId } = await params;
  const denied = await guardPage({
    requires: [
      "FinanceService.VATStatementHeaders",
      "FinanceService.VATStatementHeaders.ViewPayments",
    ],
    lang,
  });
  if (denied) return denied;
  const t = await getTranslations(lang);
  const apiRequests = await getApiRequests(vatStatementId, await searchParams);
  if ("message" in apiRequests) {
    return <ErrorComponent languageData={t.Default} message={apiRequests.message} />;
  }
  const [paymentsResponse] = apiRequests.requiredRequests;
  return <PaymentsTable lang={lang} response={paymentsResponse.data} />;
}
```

For `loading.tsx`, copy `[vatStatementId]/loading.tsx` unchanged.

- [ ] **Step 3: Gates and commit**

Run: `pnpm --filter web type-check && (cd apps/web && npx eslint "src/app/[lang]/(main)/(unirefund)/finance/vat-statements") && pnpm policy:audit`
Expected: exit 0, 0 lint errors, and 0 audit violations.

```bash
cd /c/unirefund/web-app-wt-vat-lifecycle && D="apps/web/src/app/[lang]/(main)/(unirefund)/finance/vat-statements"
npx prettier --write "$D/_components/payments-table.tsx" "$D/[vatStatementId]/payments/page.tsx" "$D/[vatStatementId]/payments/loading.tsx" >/dev/null
git add "$D/_components/payments-table.tsx" "$D/[vatStatementId]/payments/page.tsx" "$D/[vatStatementId]/payments/loading.tsx"
git commit -q -F - <<'EOF'
feat(vat-statements): payments tab with the statement's payment ledger

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 7: Record payment dialog

**Files:**
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/finance/vat-statements/_components/archive-field.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/finance/vat-statements/_components/record-payment-dialog.tsx`
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/finance/vat-statements/[vatStatementId]/layout.tsx`. Render `<RecordPaymentDialog … />` after `<StatusActions … />`, inside `StatementHeader`.

**Interfaces:**
- **Consumes:**
  - Task 1: `parseAmount`, `paymentProblem`, `paymentWarning`, `paymentDateProblem`, `paymentDateValue`, `formatAmount`
  - Task 3: `postVatStatementPaymentApi`
- **Produces:**
  - `ArchiveField({ value, onChange, disabled })`
  - `RecordPaymentDialog({ statementId, currency, hint, lang })`

- [ ] **Step 1: Write `archive-field.tsx`**

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { Input } from "@repo/ayasofyazilim-ui/components/input";
import { Label } from "@repo/ayasofyazilim-ui/components/label";

// What archiveId holds is an open question with the backend team; only this
// field changes if it turns out to be an uploaded file's id.
export function ArchiveField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const { t } = useTranslations();
  return (
    <div className="flex flex-col gap-1.5">
      <Label data-testid="vat-payment-archive-label" htmlFor="vat-payment-archive">
        {t.FinanceService["Finance.payments.archiveId"]}
      </Label>
      <Input
        data-testid="vat-payment-archive"
        disabled={disabled}
        id="vat-payment-archive"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </div>
  );
}
```

- [ ] **Step 2: Write `record-payment-dialog.tsx`**

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { postVatStatementPaymentApi } from "@repo/actions/unirefund/FinanceService/post-actions";
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
import { DatePicker } from "@repo/ayasofyazilim-ui/custom/date-picker";
import type { UniRefund_FinanceService_VATStatementHeaders_VATStatementStatusHintDto as StatusHintDto } from "@repo/saas/FinanceService";
import { useApplicationConfiguration } from "@repo/utils/app-config";
import { isActionGranted } from "@repo/utils/policies";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArchiveField } from "./archive-field";
import {
  formatAmount,
  parseAmount,
  paymentDateProblem,
  paymentDateValue,
  paymentProblem,
  paymentWarning,
} from "./lifecycle";

export function RecordPaymentDialog({
  statementId,
  currency,
  hint,
  lang,
}: {
  statementId: string;
  currency: string;
  hint: StatusHintDto | null;
  lang: string;
}) {
  const { t } = useTranslations();
  const router = useRouter();
  const { policies: grantedPolicies } = useApplicationConfiguration();
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState(false);
  const [amountText, setAmountText] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date());
  const [reference, setReference] = useState("");
  const [archive, setArchive] = useState("");
  const [isPending, startTransition] = useTransition();
  if (
    !isActionGranted(
      ["FinanceService.VATStatementHeaders", "FinanceService.VATStatementHeaders.RecordPayment"],
      grantedPolicies
    )
  ) {
    return null;
  }
  const figures = hint ? { paidAmount: hint.paidAmount, unpaidAmount: hint.unpaidAmount } : null;
  const amount = parseAmount(amountText);
  const problem = amountText ? paymentProblem(amount, figures) : null;
  const dateProblem = paymentDateProblem(paymentDate, new Date());
  const warning = paymentWarning(amount, figures);
  const canReview =
    amountText !== "" && !paymentProblem(amount, figures) && !dateProblem && reference.trim() !== "" && archive.trim() !== "";

  function reset() {
    setReview(false);
    setAmountText("");
    setPaymentDate(new Date());
    setReference("");
    setArchive("");
  }

  function close() {
    if (isPending) return;
    reset();
    setOpen(false);
  }

  function record() {
    startTransition(async () => {
      const response = await postVatStatementPaymentApi({
        id: statementId,
        requestBody: {
          amount,
          currency,
          referenceNumber: reference.trim(),
          archiveId: archive.trim(),
          paymentDate: paymentDateValue(paymentDate),
        },
      });
      if (response.type !== "success") {
        toast.error(response.message);
        setReview(false);
        return;
      }
      toast.success(t.FinanceService["Finance.payments.done"]);
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button data-testid="vat-payment-open" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        {t.FinanceService["Finance.payments.record"]}
      </Button>
      <Dialog
        data-testid="vat-payment-dialog"
        onOpenChange={(next) => {
          if (!next) close();
        }}
        open={open}
      >
        <DialogContent data-testid="vat-payment-dialog-content">
          <DialogHeader data-testid="vat-payment-dialog-header">
            <DialogTitle data-testid="vat-payment-dialog-title">
              {t.FinanceService["Finance.payments.record"]}
            </DialogTitle>
            <DialogDescription data-testid="vat-payment-dialog-description">
              {review
                ? t.FinanceService["Finance.payments.review.description"]
                : t.FinanceService["Finance.payments.amount.hint"]}
            </DialogDescription>
          </DialogHeader>
          {review ? (
            <dl className="grid grid-cols-2 gap-2 text-sm" data-testid="vat-payment-summary">
              <dt>{t.FinanceService["Finance.payments.amount"]}</dt>
              <dd className="font-medium">{formatAmount(amount, currency, lang)}</dd>
              <dt>{t.FinanceService["Finance.payments.paymentDate"]}</dt>
              <dd>{paymentDateValue(paymentDate).slice(0, 10)}</dd>
              <dt>{t.FinanceService["Finance.payments.referenceNumber"]}</dt>
              <dd>{reference.trim()}</dd>
              <dt>{t.FinanceService["Finance.payments.archiveId"]}</dt>
              <dd>{archive.trim()}</dd>
            </dl>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label data-testid="vat-payment-amount-label" htmlFor="vat-payment-amount">
                  {t.FinanceService["Finance.payments.amount"]} ({currency})
                </Label>
                <Input
                  data-testid="vat-payment-amount"
                  disabled={isPending}
                  id="vat-payment-amount"
                  inputMode="decimal"
                  onChange={(event) => setAmountText(event.target.value)}
                  value={amountText}
                />
                {problem ? (
                  <p className="text-xs text-destructive" data-testid="vat-payment-problem">
                    {t.FinanceService[`Finance.payments.problem.${problem}`]}
                  </p>
                ) : warning ? (
                  <p className="text-xs text-amber-700" data-testid="vat-payment-warning">
                    {t.FinanceService["Finance.payments.warning.overPaid"]}
                  </p>
                ) : null}
              </div>
              <div>
                <DatePicker
                  data-testid="vat-payment-date"
                  defaultValue={paymentDate}
                  disabled={isPending}
                  id="vat-payment-date"
                  label={t.FinanceService["Finance.payments.paymentDate"]}
                  maxDate={new Date()}
                  onChange={(date: Date) => setPaymentDate(date)}
                />
                {dateProblem ? (
                  <p className="mt-1 text-xs text-destructive" data-testid="vat-payment-date-problem">
                    {t.FinanceService["Finance.payments.problem.future"]}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label data-testid="vat-payment-reference-label" htmlFor="vat-payment-reference">
                  {t.FinanceService["Finance.payments.referenceNumber"]}
                </Label>
                <Input
                  data-testid="vat-payment-reference"
                  disabled={isPending}
                  id="vat-payment-reference"
                  onChange={(event) => setReference(event.target.value)}
                  value={reference}
                />
              </div>
              <ArchiveField disabled={isPending} onChange={setArchive} value={archive} />
            </div>
          )}
          <DialogFooter data-testid="vat-payment-dialog-footer">
            {review ? (
              <>
                <Button
                  data-testid="vat-payment-back"
                  disabled={isPending}
                  onClick={() => setReview(false)}
                  variant="outline"
                >
                  {t.FinanceService["Finance.payments.back"]}
                </Button>
                <Button data-testid="vat-payment-record" disabled={isPending} onClick={record}>
                  {t.FinanceService["Finance.payments.record"]}
                </Button>
              </>
            ) : (
              <>
                <Button data-testid="vat-payment-cancel" disabled={isPending} onClick={close} variant="outline">
                  {t.Default.Cancel}
                </Button>
                <Button data-testid="vat-payment-review" disabled={!canReview} onClick={() => setReview(true)}>
                  {t.FinanceService["Finance.payments.review"]}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 3: Render it in the layout**

In `layout.tsx`, add `import { RecordPaymentDialog } from "../_components/record-payment-dialog";`. Then, after `<StatusActions … />`:

```tsx
        <RecordPaymentDialog
          currency={statement.currency}
          hint={hint}
          lang={lang}
          statementId={statement.id}
        />
```

- [ ] **Step 4: Gates and commit**

Run: `pnpm --filter web type-check && (cd apps/web && npx eslint "src/app/[lang]/(main)/(unirefund)/finance/vat-statements") && pnpm policy:audit`
Expected: exit 0, 0 lint errors, and 0 audit violations.

If `DatePicker` has no `data-testid` prop in its type, drop it there and wrap the picker in a `div` carrying the testid.

```bash
cd /c/unirefund/web-app-wt-vat-lifecycle && D="apps/web/src/app/[lang]/(main)/(unirefund)/finance/vat-statements"
npx prettier --write "$D/_components/archive-field.tsx" "$D/_components/record-payment-dialog.tsx" "$D/[vatStatementId]/layout.tsx" >/dev/null
git add "$D/_components/archive-field.tsx" "$D/_components/record-payment-dialog.tsx" "$D/[vatStatementId]/layout.tsx"
git commit -q -F - <<'EOF'
feat(vat-statements): record a payment against a statement

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 8: History tab

**Files:**
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/finance/vat-statements/[vatStatementId]/history/page.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/finance/vat-statements/[vatStatementId]/history/loading.tsx` (a copy of `[vatStatementId]/loading.tsx`)
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/finance/vat-statements/_components/history-timeline.tsx`

**Interfaces:**
- **Consumes:** `getVatStatementHistoryApi` (Task 3); `historyLabel`, `historyValue` and `enumMember` (Task 2).
- **Produces:** `HistoryTimeline({ response, moreHref })`.

- [ ] **Step 1: Write `history-timeline.tsx`**

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import { formatToLocalizedDate } from "@repo/ayasofyazilim-ui/custom/date-tooltip";
import type {
  PagedResultDto_VATStatementHistoryEntryDto,
  UniRefund_FinanceService_Enums_PaymentStatus as PaymentStatus,
  UniRefund_FinanceService_Enums_VATStatementStatus as VatStatus,
} from "@repo/saas/FinanceService";
import { useLocalization } from "@repo/utils/app-config";
import Link from "next/link";
import { enumMember, historyLabel, historyValue } from "./history-format";

export function HistoryTimeline({
  response,
  moreHref,
}: {
  response: PagedResultDto_VATStatementHistoryEntryDto;
  moreHref: string | null;
}) {
  const { t } = useTranslations();
  const localization = useLocalization();
  const items = response.items ?? [];
  if (items.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground" data-testid="vat-history-empty">
        {t.FinanceService["Finance.history.empty"]}
      </p>
    );
  }
  const formatDate = (iso: string) =>
    formatToLocalizedDate({
      localization,
      date: iso,
      dateOptions: { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false },
      timeZone: localization.timeZone,
    });
  const labels: Partial<Record<string, string>> = {
    Status: t.FinanceService["Finance.status"],
    PaymentStatus: t.FinanceService["Finance.paymentStatus"],
    PaidAmount: t.FinanceService["Finance.paidAmount"],
    UnpaidAmount: t.FinanceService["Finance.unpaidAmount"],
    TotalAmount: t.FinanceService["Finance.totalAmount"],
    DueDate: t.FinanceService["Finance.dueDate"],
    InvoiceNumber: t.FinanceService["Finance.invoiceNumber"],
  };
  const enumLabel = (propertyName: string, value: number | string) => {
    if (propertyName === "Status") {
      const member = enumMember("Status", value);
      return member ? t.FinanceService[`Finance.status.${member as VatStatus}`] : null;
    }
    if (propertyName === "PaymentStatus") {
      const member = enumMember("PaymentStatus", value);
      return member ? t.FinanceService[`Finance.paymentStatus.${member as PaymentStatus}`] : null;
    }
    return null;
  };
  const changeType = (type: string) =>
    type === "Created" || type === "Updated" || type === "Deleted"
      ? t.FinanceService[`Finance.history.changeType.${type}`]
      : type;
  return (
    <div className="flex flex-col gap-3 p-2" data-testid="vat-history">
      <ol className="flex flex-col gap-3 border-l pl-4">
        {items.map((entry, index) => (
          <li key={`${entry.changeTime}-${index}`}>
            <div className="text-sm">
              <span className="font-medium">{changeType(entry.changeType)}</span>
              <span className="text-muted-foreground">
                {" "}
                · {formatDate(entry.changeTime)} · {entry.userName ?? t.FinanceService["Finance.history.system"]}
              </span>
            </div>
            <ul className="mt-1 text-sm">
              {entry.changes.map((change) => {
                const before = historyValue(change.propertyName, change.originalValue, { formatDate, enumLabel });
                const after = historyValue(change.propertyName, change.newValue, { formatDate, enumLabel });
                return (
                  <li key={change.propertyName}>
                    {historyLabel(change.propertyName, labels)}:{" "}
                    {before !== null ? `${before} → ` : ""}
                    {after ?? "—"}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
      {moreHref ? (
        <Button asChild data-testid="vat-history-more" variant="outline">
          <Link href={moreHref} scroll={false}>
            {t.FinanceService["Finance.history.loadMore"]}
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Write `history/page.tsx`**

```tsx
"use server";
import { guardPage } from "@/src/components/permission-guard/guard";
import { getTranslations } from "@/src/language-data/get-translations";
import { getVatStatementHistoryApi } from "@repo/actions/unirefund/FinanceService/actions";
import ErrorComponent from "@repo/ui/components/error-component";
import { structuredError } from "@repo/utils/api";
import { auth } from "@repo/utils/auth/next-auth";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { HistoryTimeline } from "../../_components/history-timeline";

const PAGE = 20;
const MAX = 1000;

async function getApiRequests(id: string, maxResultCount: number) {
  try {
    const session = await auth();
    const requiredRequests = await Promise.all([
      getVatStatementHistoryApi({ id, skipCount: 0, maxResultCount }, session),
    ]);
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
  params: Promise<{ lang: string; vatStatementId: string }>;
  searchParams: Promise<{ maxResultCount?: string }>;
}) {
  const { lang, vatStatementId } = await params;
  const denied = await guardPage({
    requires: [
      "FinanceService.VATStatementHeaders",
      "FinanceService.VATStatementHeaders.ViewHistory",
    ],
    lang,
  });
  if (denied) return denied;
  const t = await getTranslations(lang);
  const requested = Number((await searchParams).maxResultCount);
  const maxResultCount = Number.isInteger(requested) && requested > 0 ? Math.min(requested, MAX) : PAGE;
  const apiRequests = await getApiRequests(vatStatementId, maxResultCount);
  if ("message" in apiRequests) {
    return <ErrorComponent languageData={t.Default} message={apiRequests.message} />;
  }
  const [historyResponse] = apiRequests.requiredRequests;
  const shown = historyResponse.data.items?.length ?? 0;
  const moreHref =
    shown < (historyResponse.data.totalCount ?? 0) && maxResultCount < MAX
      ? `?maxResultCount=${maxResultCount + PAGE}`
      : null;
  return <HistoryTimeline moreHref={moreHref} response={historyResponse.data} />;
}
```

- [ ] **Step 3: Gates and commit**

Run: `pnpm --filter web type-check && (cd apps/web && npx eslint "src/app/[lang]/(main)/(unirefund)/finance/vat-statements") && pnpm policy:audit`
Expected: exit 0, 0 lint errors, and 0 audit violations.

```bash
cd /c/unirefund/web-app-wt-vat-lifecycle && D="apps/web/src/app/[lang]/(main)/(unirefund)/finance/vat-statements"
npx prettier --write "$D/_components/history-timeline.tsx" "$D/[vatStatementId]/history/page.tsx" "$D/[vatStatementId]/history/loading.tsx" >/dev/null
git add "$D/_components/history-timeline.tsx" "$D/[vatStatementId]/history/page.tsx" "$D/[vatStatementId]/history/loading.tsx"
git commit -q -F - <<'EOF'
feat(vat-statements): history tab showing who changed what and when

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 9: Unbilled tags page and nav entry

**Files:**
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/finance/vat-statements/unbilled/page.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/finance/vat-statements/unbilled/loading.tsx` (a copy of `vat-statements/loading.tsx`)
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/finance/vat-statements/_components/unbilled-table.tsx`
- Modify: `apps/web/src/components/sidebar-layout/data.ts`. Add the item right after the `finance/vat-statements` item's closing `},`.

**Interfaces:**
- **Consumes:**
  - Task 3: `getVatStatementUnbilledTagsApi`
  - Task 1: `toUnbilledQuery`, `UnbilledSearchParams`, `newStatementHref`, `parsePeriod`, `waitingSince`, `daysSince`, `formatAmount`
- **Produces:** `UnbilledTable({ response, lang })`.

- [ ] **Step 1: Write `unbilled-table.tsx`**

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { getBaseLink } from "@/src/utils";
import { createServerFilters } from "@/src/utils/server-filters";
import { Badge } from "@repo/ayasofyazilim-ui/components/badge";
import { formatToLocalizedDate } from "@repo/ayasofyazilim-ui/custom/date-tooltip";
import { MasterDataGrid } from "@repo/ayasofyazilim-ui/custom/master-data-grid";
import {
  $UniRefund_FinanceService_VATStatementHeaders_UnbilledTagsByMerchantDto,
  type PagedResultDto_UnbilledTagsByMerchantDto,
} from "@repo/saas/FinanceService";
import { useApplicationConfiguration, useLocalization } from "@repo/utils/app-config";
import { isActionGranted } from "@repo/utils/policies";
import Link from "next/link";
import { daysSince, formatAmount, newStatementHref, parsePeriod, waitingSince } from "./lifecycle";

export function UnbilledTable({
  response,
  lang,
}: {
  response: PagedResultDto_UnbilledTagsByMerchantDto;
  lang: string;
}) {
  const { t } = useTranslations();
  const localization = useLocalization();
  const { policies: grantedPolicies } = useApplicationConfiguration();
  // The new-statement page's own guard.
  const canCreate =
    isActionGranted(["FinanceService.VATStatementHeaders", "FinanceService.VATStatementHeaders.Create"], grantedPolicies) &&
    isActionGranted(["CRMService.Merchants", "CRMService.Merchants.ViewList"], grantedPolicies);
  const f = createServerFilters(t.Default);
  const now = new Date();
  const monthName = (month: number) =>
    new Intl.DateTimeFormat(lang, { month: "long" }).format(new Date(2000, month - 1, 1));
  const periodLabel = (period: string) => {
    const parsed = parsePeriod(period);
    return parsed ? `${monthName(parsed.month)} ${parsed.year}` : period;
  };
  return (
    <MasterDataGrid
      data={response.items || []}
      config={{
        localization,
        rowCount: response.totalCount,
        schema: $UniRefund_FinanceService_VATStatementHeaders_UnbilledTagsByMerchantDto,
        schemaColumns: {
          mode: "include",
          columns: [
            "merchantName",
            "tagCount",
            "taxAmount",
            "grandTotal",
            "oldestExportValidationDate",
            "periods",
            "canBeBilled",
            "pendingCorrectionCount",
          ],
        },
        t: {
          ...t.Default,
          "column.merchantName": t.FinanceService["Finance.merchantName"],
          "column.tagCount": t.FinanceService["Finance.tagCount"],
          "column.taxAmount": t.FinanceService["Finance.Tags.taxAmount"],
          "column.grandTotal": t.FinanceService["Finance.grandTotalAmount"],
          "column.oldestExportValidationDate": t.FinanceService["Finance.unbilled.waitingSince"],
          "column.periods": t.FinanceService["Finance.unbilled.periods"],
          "column.canBeBilled": t.FinanceService["Finance.unbilled.billable"],
          "column.pendingCorrectionCount": t.FinanceService["Finance.unbilled.pendingCorrections"],
        },
        customRenderers: {
          taxAmount: ({ row }) => formatAmount(row.original.taxAmount, row.original.currency, lang),
          grandTotal: ({ row }) => formatAmount(row.original.grandTotal, row.original.currency, lang),
          oldestExportValidationDate: ({ row }) => {
            const since = waitingSince(row.original);
            if (!since) return "";
            return `${formatToLocalizedDate({
              localization,
              date: since,
              dateOptions: { day: "2-digit", month: "short", year: "numeric" },
              timeZone: localization.timeZone,
            })} · ${t.FinanceService["Finance.unbilled.days"].replace("{0}", String(daysSince(since, now)))}`;
          },
          periods: ({ row }) => {
            const createAllowed = canCreate && row.original.canBeBilled !== false;
            const periods = row.original.periods.length ? row.original.periods : [null];
            return (
              <div className="flex flex-wrap gap-1">
                {periods.map((period) => {
                  const label = period ? periodLabel(period) : t.FinanceService["Finance.createStatement"];
                  return createAllowed ? (
                    <Link
                      className="rounded-md border px-2 py-0.5 text-xs hover:bg-muted"
                      href={getBaseLink(newStatementHref(row.original.merchantId, period), lang)}
                      key={period ?? "merchant"}
                    >
                      {label}
                    </Link>
                  ) : period ? (
                    <Badge data-testid="vat-unbilled-period" key={period} variant="secondary">
                      {label}
                    </Badge>
                  ) : null;
                })}
              </div>
            );
          },
          canBeBilled: ({ row }) =>
            row.original.canBeBilled === true ? (
              <Badge data-testid="vat-unbilled-billable" variant="success">
                {t.FinanceService["Finance.unbilled.billable.yes"]}
              </Badge>
            ) : row.original.canBeBilled === false ? (
              <span className="flex flex-col gap-0.5">
                <Badge data-testid="vat-unbilled-billable" variant="destructive">
                  {t.FinanceService["Finance.unbilled.billable.no"]}
                </Badge>
                {row.original.blocker ? (
                  <span className="text-xs text-muted-foreground">{row.original.blocker}</span>
                ) : null}
              </span>
            ) : (
              <Badge data-testid="vat-unbilled-billable" variant="gray">
                {t.FinanceService["Finance.unbilled.billable.unknown"]}
              </Badge>
            ),
          pendingCorrectionCount: ({ row }) =>
            row.original.pendingCorrectionCount > 0
              ? `${row.original.pendingCorrectionCount} · ${formatAmount(row.original.pendingCorrectionsAmount, row.original.currency, lang)}`
              : "",
        },
        serverFilters: [
          f.number("year", t.FinanceService["Finance.Form.year"]),
          f.select(
            "month",
            t.FinanceService["Finance.Form.month"],
            Array.from({ length: 12 }, (_, index) => ({
              label: monthName(index + 1),
              value: String(index + 1),
            }))
          ),
        ],
      }}
    />
  );
}
```

- [ ] **Step 2: Write `unbilled/page.tsx`**

```tsx
"use server";
import { guardPage } from "@/src/components/permission-guard/guard";
import { getTranslations } from "@/src/language-data/get-translations";
import { getVatStatementUnbilledTagsApi } from "@repo/actions/unirefund/FinanceService/actions";
import ErrorComponent from "@repo/ui/components/error-component";
import { structuredError } from "@repo/utils/api";
import { auth } from "@repo/utils/auth/next-auth";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { toUnbilledQuery, type UnbilledSearchParams } from "../_components/lifecycle";
import { UnbilledTable } from "../_components/unbilled-table";

async function getApiRequests(search: UnbilledSearchParams) {
  try {
    const session = await auth();
    const requiredRequests = await Promise.all([
      getVatStatementUnbilledTagsApi(toUnbilledQuery(search), session),
    ]);
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
  params: Promise<{ lang: string }>;
  searchParams: Promise<UnbilledSearchParams>;
}) {
  const { lang } = await params;
  const denied = await guardPage({
    requires: [
      "FinanceService.VATStatementHeaders",
      "FinanceService.VATStatementHeaders.ViewUnbilledTags",
    ],
    lang,
  });
  if (denied) return denied;
  const t = await getTranslations(lang);
  const apiRequests = await getApiRequests(await searchParams);
  if ("message" in apiRequests) {
    return <ErrorComponent languageData={t.Default} message={apiRequests.message} />;
  }
  const [unbilledResponse] = apiRequests.requiredRequests;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <UnbilledTable lang={lang} response={unbilledResponse.data} />
    </div>
  );
}
```

- [ ] **Step 3: Add the nav item**

In `data.ts`, after the `finance/vat-statements` item's closing `},`, insert:

```ts
      {
        key: "finance/vat-statements/unbilled",
        displayName: "VatStatements.Unbilled",
        href: "finance/vat-statements/unbilled",
        icon: "FileClock",
        policies: [
          "FinanceService.VATStatementHeaders",
          "FinanceService.VATStatementHeaders.ViewUnbilledTags",
        ],
      },
```

- [ ] **Step 4: Gates and commit**

Run: `pnpm --filter web type-check && (cd apps/web && npx eslint "src/app/[lang]/(main)/(unirefund)/finance/vat-statements" src/components/sidebar-layout) && pnpm --filter web test:unit 2>&1 | grep -E "^# (pass|fail)" && pnpm policy:audit`
Expected:
- exit 0, with 0 lint errors;
- `# fail 0`, so the existing `nav-tree.test.ts` still passes, since it pins only Operations;
- 0 audit violations, with R3 matching the nav policies to the page guard.

```bash
cd /c/unirefund/web-app-wt-vat-lifecycle && D="apps/web/src/app/[lang]/(main)/(unirefund)/finance/vat-statements"
npx prettier --write "$D/_components/unbilled-table.tsx" "$D/unbilled/page.tsx" "$D/unbilled/loading.tsx" apps/web/src/components/sidebar-layout/data.ts >/dev/null
git add "$D/_components/unbilled-table.tsx" "$D/unbilled/page.tsx" "$D/unbilled/loading.tsx" apps/web/src/components/sidebar-layout/data.ts
git commit -q -F - <<'EOF'
feat(vat-statements): unbilled tags overview with create-statement shortcuts

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 10: Gates, checks on dev, ordinal confirmation, PR

**Files:** `history-format.ts` and `history-format.test.ts` change only if Step 3 confirms a mapping.

- [ ] **Step 1: The CI gates, run locally**

Run, from the worktree root:
- `pnpm --filter web type-check`
- `pnpm unit-test`
- `pnpm --filter web test:unit`
- `pnpm lint`
- `node --test scripts/lib/policy-audit-core.test.mjs`
- `pnpm policy:audit`
- `pnpm i18n:missing --app=web`
- `pnpm i18n:unused --app=web`

Expected:
- every command exits 0, except `i18n:unused`, which exits 1 and must list exactly the 5 baseline keys;
- `NEEDS_KEY 0`;
- 0 audit violations.

- [ ] **Step 2: Read-only checks on dev**

Start a detached dev server on a free port, e.g. 3210:
- PowerShell: `Start-Process cmd.exe -ArgumentList '/c npx next dev --turbopack -p 3210 > <scratchpad>\vat3210.log 2>&1' -WorkingDirectory <worktree>\apps\web -WindowStyle Hidden`.
- If the LAN auth Redis hangs, write `AUTH_REDIS_URL=` into `apps/web/.env.development.local` first, and delete that file afterwards.

Sign in as Faroe Islands `admin` / `1q2w3E*`, and press **Skip** on the device prompt. Check:
1. **A statement's detail:**
   - the header shows the invoice, the period, both badges and the paid/total/unpaid figures;
   - the status buttons match `allowedNextStatuses`;
   - the tabs are Statement, Payments and History;
   - Statement shows today's view.
2. **The Payments tab:** the ledger, or the empty state.
3. **The History tab:** the entries; Load more appears only when there is more.
4. **Unbilled tags,** in the sidebar under Finance:
   - rows, the period filter, the Billable column;
   - a period chip opens `new?merchantId=…&year=…&month=…`, and a draft is built;
   - record the real `periods` string format seen in the response.
5. **The dialogs:**
   - open the status confirm dialog, then Cancel;
   - open Record payment and check that 0 shows the problem, a future date shows its problem, and Review stays disabled until the reference and archive are filled;
   - Cancel. **Do not submit without the user's go-ahead.**

- [ ] **Step 3: Writes with the user's go-ahead, and confirming the ordinals**

Ask the user for a statement to use. With their go-ahead:
1. **Move it one status,** e.g. Sent → Payment reminder 1. In History, read the `Status` change's raw old and new values from the page's network response or the server log.
   - If they are member names (quoted strings), no mapping is needed. Record that.
   - If they are integers, compare them with the order in `VAT_STATUSES` in `history-format.ts`:
     - **If the new value is that status's index** (Sent=0, PaymentReminder1=1, …): set `ENUM_ORDINALS.Status = VAT_STATUSES`.
     - **If the values sit 4 higher** (Sent=4, PaymentReminder1=5), the backend shares the rebate numbering. Set `ENUM_ORDINALS.Status` to an array with 4 leading placeholders. Use a sparse literal (`[, , , , ...VAT_STATUSES]` typed as `readonly VatStatus[]`), or change `enumMember` to subtract the offset; record a ruling either way.
2. **Record a small payment, then a correcting negative payment of the same amount,** so the statement ends unchanged. Check the ledger rows, their dates (the picked day, not the day before) and the header figures. Read the `PaymentStatus` change in History and confirm its ordinals the same way against `PAYMENT_STATUSES`.
3. **For each confirmed mapping, test first:**
   - In `history-format.test.ts`, change the `enumMember` test's last assertion to the confirmed value, e.g. `assert.equal(enumMember("Status", 1), "PaymentReminder1")`, and add the equivalent assertion for `PaymentStatus`.
   - Run it and watch it fail.
   - Set `ENUM_ORDINALS`, then run it again and watch it pass.
   - Commit with the message `feat(vat-statements): label audited status ordinals, confirmed on dev`.

If the user declines the writes, leave `ENUM_ORDINALS` empty, so ordinals show as recorded. Record "status/payment writes and ordinal mapping not verified" for the PR.

- [ ] **Step 4: Push and open the PR**

```bash
cd /c/unirefund/web-app-wt-vat-lifecycle && git fetch -q origin && git rev-list --left-right --count origin/main...HEAD
```
If the branch is behind, rebase onto `origin/main` and repeat Step 1.

Then:
1. `git push -u origin feat/vat-statement-lifecycle`.
2. Open the PR against `main` with `gh pr create --repo ayasofyazilim-clomerce/unirefund-web --base main`. Its body:
   - a summary;
   - the gates, and the manual checks run and not run;
   - the archive-field open question;
   - whether the ordinals were confirmed;
   - the `periods` format seen;
   - it ends with the Claude Code line.
3. Wait for "Lint & Unit Tests" and "Build".
   - **If Build fails** on `Failed to fetch policies: 522`, that is a dev outage, not the branch. Re-run with `gh run rerun <id> --failed` once dev answers.
4. **The merge is the user's.** In this session the auto-mode classifier blocks `gh pr merge --admin`. Hand over `gh pr merge <N> --repo ayasofyazilim-clomerce/unirefund-web --merge --admin`.

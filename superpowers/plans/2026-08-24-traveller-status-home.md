# Status-First Traveller Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace traveller Home's flat shortcut list with a status screen that says what the traveller will receive, what is about to expire, and what they must do next.

**Architecture:** All derivation is pure and lives in two testable modules (`src/utils/tagMoney.ts`, `src/screens/traveller/Home/homeStatus.logic.ts`) that take plain data and a `now` timestamp. One hook (`useHomeStatus`) wires them to the tag store plus the two requests Profile already makes. Four presentational components render the result. `HomeScreen` becomes composition only.

**Tech Stack:** React Native 0.81 / Expo ~54, React 19, TypeScript strict, expo-router, NativeWind 4, Zustand, Jest (`jest-expo`, two projects).

**Spec:** [`docs/superpowers/specs/2026-08-24-traveller-status-home-design.md`](../specs/2026-08-24-traveller-status-home-design.md)

## Prerequisite: isolated worktree

**The `super-app` checkout at `C:/unirefund/super-app` is SHARED with another live agent session.** It is currently on `feat/home-upload-for-verification` at `7bfc58c`. Do not branch, check out, stash, or `reset` in that directory.

Create the worktree via the `superpowers:using-git-worktrees` skill before Task 1. Requirements:
- Branch from `7bfc58c` exactly.
- Place it as a **sibling** of `super-app` (e.g. `C:/unirefund/super-app-status-home`), never nested inside it — a repo directory inside another repo becomes a registered worktree and `npm test` in the parent then runs the child's suites.
- The worktree needs its own `node_modules`. Run `npm ci` in it before Task 1.
- Never run `git reset --hard` in `C:/unirefund/super-app`.

## Global Constraints

- **TypeScript strict mode.** No implicit `any`, no unchecked nulls. Every field on the tag DTOs except `id`, `tagNumber`, `issueDate`, `exportValidationExpirationDate`, `travellerDocumentNumber` and `status` is optional or nullable.
- **Path alias:** `@/*` → `./src/*` for all internal imports. External imports grouped before internal.
- **Styling:** NativeWind utility classes only; merge conditionals with `cn()` from `@/utils/cn`. NativeWind resolves class names at build time, so tone→class maps must be **literal strings in a `Record`**, never composed at runtime.
- **Naming:** components `PascalCase`, hooks `useCamelCase`, utils `camelCase`, constants `UPPER_SNAKE_CASE`.
- **Test project routing is by filename.** Anything that renders a component or calls `renderHook` MUST be named `*.router.test.ts(x)` or it lands in the `node` project, reaches nativewind's web JSX runtime, and fails to load. Pure-logic tests are plain `*.test.ts`.
- **Pure-logic modules must stay loadable in the `node` project:** type-only imports from `@/saas/*`, no React, no React Native, and **no `Date.now()`** — `now` is always a parameter.
- **Comment density:** write far fewer comments than the surrounding dense docblocks suggest. Comment the non-obvious *why*, not the *what*.
- **i18n:** every user-visible string goes through `t(key, values?)`. Interpolation is `{name}` placeholders, values are `Record<string, string | number>`. New keys need `npm run init` or `tsc` fails at the call site.
- **Money rule (verbatim from spec):** `refund ?? grossRefund`, **never** `salesAmount`.
- **Test baseline:** `npm test` has **6 pre-existing failing suites**. The gate is that it stays 6.
- **No dark mode.** Removed in `6cb6ae8`. Use semantic tokens (`text-foreground`, `text-muted`, `bg-card`, `border-border`) anyway.

---

### Task 1: Money primitives (`tagMoney.ts`)

**Files:**
- Create: `src/utils/tagMoney.ts`
- Test: `src/utils/__tests__/tagMoney.test.ts`

**Interfaces:**
- Consumes: `UniRefund_TagService_Tags_TagStatusType` (type only) from `@/saas/TagService`; `tagStatusTone` from `@/utils/tagStatus` (test only).
- Produces:
  ```ts
  export type MoneyBucket = "expected" | "received" | "lost" | "inactive";
  export function tagMoneyBucket(status: UniRefund_TagService_Tags_TagStatusType): MoneyBucket;
  export interface MoneyFields { refund?: number | null; grossRefund?: number | null }
  export function tagExpectedAmount(tag: MoneyFields): number | null;
  export function tagExpectedAmountIsEstimate(tag: MoneyFields): boolean;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/tagMoney.test.ts`:

```ts
import type { UniRefund_TagService_Tags_TagStatusType as TagStatus } from "@/saas/TagService";
import { tagStatusTone } from "@/utils/tagStatus";
import {
  tagExpectedAmount,
  tagExpectedAmountIsEstimate,
  tagMoneyBucket,
} from "../tagMoney";

describe("tagMoneyBucket", () => {
  it("counts every live claim as expected, payment trouble included", () => {
    const expected: TagStatus[] = [
      "PreIssued",
      "Issued",
      "WaitingGoodsValidation",
      "WaitingStampValidation",
      "ExportValidated",
      "PaymentInProgress",
      "PaymentProblem",
      "PaymentBlocked",
      "Correction",
    ];
    for (const status of expected) {
      expect(tagMoneyBucket(status)).toBe("expected");
    }
  });

  it("counts only settled payments as received", () => {
    expect(tagMoneyBucket("Paid")).toBe("received");
    expect(tagMoneyBucket("EarlyPaid")).toBe("received");
  });

  it("counts dead claims as lost", () => {
    for (const status of ["Declined", "Cancelled", "Expired", "OptedOut"] as TagStatus[]) {
      expect(tagMoneyBucket(status)).toBe("lost");
    }
  });

  it("counts pre-claim statuses as inactive", () => {
    for (const status of ["None", "Open", "Draft"] as TagStatus[]) {
      expect(tagMoneyBucket(status)).toBe("inactive");
    }
  });

  // The whole reason this table exists rather than reusing tagStatusTone:
  // tone is a display grouping and disagrees with money in both directions.
  it("disagrees with tagStatusTone where money and colour differ", () => {
    // Success-toned but NOT yet paid — reusing tone would count it as received.
    expect(tagStatusTone("ExportValidated")).toBe("success");
    expect(tagMoneyBucket("ExportValidated")).toBe("expected");

    // Warning-toned but still live money — reusing tone would drop it.
    expect(tagStatusTone("Correction")).toBe("warning");
    expect(tagMoneyBucket("Correction")).toBe("expected");

    // Error-toned and genuinely gone.
    expect(tagStatusTone("Expired")).toBe("error");
    expect(tagMoneyBucket("Expired")).toBe("lost");
  });
});

describe("tagExpectedAmount", () => {
  it("prefers the net refund", () => {
    expect(tagExpectedAmount({ refund: 100, grossRefund: 120 })).toBe(100);
  });

  it("falls back to the gross refund", () => {
    expect(tagExpectedAmount({ grossRefund: 120 })).toBe(120);
  });

  // salesAmount is the purchase, roughly five times the refund. Falling back to
  // it under a "you'll receive" caption would promise money that never arrives.
  it("never reaches for a sales amount", () => {
    expect(
      tagExpectedAmount({ salesAmount: 1000 } as unknown as { refund?: number | null }),
    ).toBeNull();
  });

  it("returns null when neither figure is computed yet", () => {
    expect(tagExpectedAmount({})).toBeNull();
    expect(tagExpectedAmount({ refund: null, grossRefund: null })).toBeNull();
  });

  it("treats a genuine zero as a figure, not as missing", () => {
    expect(tagExpectedAmount({ refund: 0 })).toBe(0);
  });
});

describe("tagExpectedAmountIsEstimate", () => {
  it("is an estimate only when the gross refund supplied the number", () => {
    expect(tagExpectedAmountIsEstimate({ refund: 100, grossRefund: 120 })).toBe(false);
    expect(tagExpectedAmountIsEstimate({ grossRefund: 120 })).toBe(true);
  });

  it("is not an estimate when there is no figure at all", () => {
    expect(tagExpectedAmountIsEstimate({})).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/utils/__tests__/tagMoney.test.ts`
Expected: FAIL — `Cannot find module '../tagMoney'`.

- [ ] **Step 3: Write the implementation**

Create `src/utils/tagMoney.ts`:

```ts
import type { UniRefund_TagService_Tags_TagStatusType } from "@/saas/TagService";

/**
 * What a tag's status says about its money, as opposed to what
 * {@link tagStatusTone} says about its colour. The two disagree: an
 * `ExportValidated` tag is success-toned but not yet paid, and a `Correction`
 * one is warning-toned but still owed.
 */
export type MoneyBucket = "expected" | "received" | "lost" | "inactive";

/**
 * `Record` rather than a set of arrays, so `tsc` fails here if the API gains a
 * status instead of letting it default to a bucket nobody chose.
 */
const BUCKET_BY_STATUS: Record<
  UniRefund_TagService_Tags_TagStatusType,
  MoneyBucket
> = {
  PreIssued: "expected",
  Issued: "expected",
  WaitingGoodsValidation: "expected",
  WaitingStampValidation: "expected",
  ExportValidated: "expected",
  PaymentInProgress: "expected",
  // Stuck, not gone — and both raise an action row.
  PaymentProblem: "expected",
  PaymentBlocked: "expected",
  Correction: "expected",

  Paid: "received",
  EarlyPaid: "received",

  Declined: "lost",
  Cancelled: "lost",
  Expired: "lost",
  OptedOut: "lost",

  None: "inactive",
  Open: "inactive",
  Draft: "inactive",
};

export function tagMoneyBucket(
  status: UniRefund_TagService_Tags_TagStatusType,
): MoneyBucket {
  return BUCKET_BY_STATUS[status] ?? "inactive";
}

/** The two monetary fields this module reads. Structural, so both list DTOs fit. */
export interface MoneyFields {
  refund?: number | null;
  grossRefund?: number | null;
}

/**
 * What the traveller can expect to receive.
 *
 * Deliberately NOT `tagHeadlineAmount`, which falls back to `salesAmount`.
 * That is fine as a per-tag placeholder but wrong under a caption promising a
 * payout, since a purchase is roughly five times its refund. A tag with
 * neither figure returns null and is counted as uncalculated rather than
 * guessed at.
 */
export function tagExpectedAmount(tag: MoneyFields): number | null {
  return tag.refund ?? tag.grossRefund ?? null;
}

/** True when {@link tagExpectedAmount} fell back to the pre-fee figure. */
export function tagExpectedAmountIsEstimate(tag: MoneyFields): boolean {
  return tag.refund == null && tag.grossRefund != null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/utils/__tests__/tagMoney.test.ts`
Expected: PASS, 12 tests (5 + 5 + 2 across the three `describe` blocks).

- [ ] **Step 5: Commit**

```bash
git add src/utils/tagMoney.ts src/utils/__tests__/tagMoney.test.ts
git commit -m "feat(home): bucket tag statuses by money rather than by colour"
```

---

### Task 2: The refund summary (`homeStatus.logic.ts`)

**Files:**
- Create: `src/screens/traveller/Home/homeStatus.logic.ts`
- Test: `src/screens/traveller/Home/__tests__/homeStatus.test.ts`

**Interfaces:**
- Consumes: `MoneyBucket`, `tagMoneyBucket`, `tagExpectedAmount`, `tagExpectedAmountIsEstimate` from `@/utils/tagMoney` (Task 1).
- Produces:
  ```ts
  export interface SummaryTag { status: TagStatus; currency?: string | null; refund?: number | null; grossRefund?: number | null }
  export interface CurrencyTotal { currency: string; amount: number; tagCount: number; isEstimate: boolean }
  export interface RefundSummary {
    expected: CurrencyTotal[];
    received: CurrencyTotal[];
    expectedTagCount: number;
    notCalculatedCount: number;
  }
  export function buildRefundSummary(tags: SummaryTag[], fallbackCurrency: string): RefundSummary;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/screens/traveller/Home/__tests__/homeStatus.test.ts`:

```ts
// Imported from the logic module, never the hook: the hook pulls in the React
// Native module graph, which the plain `node` jest project cannot resolve.
import { buildRefundSummary, type SummaryTag } from "../homeStatus.logic";

function tag(overrides: Partial<SummaryTag> = {}): SummaryTag {
  return { status: "Issued", currency: "TRY", refund: 100, ...overrides };
}

describe("buildRefundSummary", () => {
  it("sums expected money per currency and counts its tags", () => {
    const summary = buildRefundSummary(
      [tag({ refund: 100 }), tag({ refund: 48.5 })],
      "TRY",
    );

    expect(summary.expected).toEqual([
      { currency: "TRY", amount: 148.5, tagCount: 2, isEstimate: false },
    ]);
    expect(summary.expectedTagCount).toBe(2);
    expect(summary.notCalculatedCount).toBe(0);
  });

  it("keeps currencies apart and headlines the largest group", () => {
    const summary = buildRefundSummary(
      [
        tag({ currency: "TRY", refund: 100 }),
        tag({ currency: "EUR", refund: 900 }),
        tag({ currency: "TRY", refund: 50 }),
      ],
      "TRY",
    );

    expect(summary.expected.map((group) => group.currency)).toEqual(["EUR", "TRY"]);
    expect(summary.expected[0]).toEqual({
      currency: "EUR",
      amount: 900,
      tagCount: 1,
      isEstimate: false,
    });
  });

  // Deterministic ordering, so the headline does not depend on input order.
  it("breaks equal totals by currency code ascending", () => {
    const summary = buildRefundSummary(
      [tag({ currency: "USD", refund: 100 }), tag({ currency: "EUR", refund: 100 })],
      "TRY",
    );

    expect(summary.expected.map((group) => group.currency)).toEqual(["EUR", "USD"]);
  });

  it("marks a group estimated when any of its tags fell back to gross refund", () => {
    const summary = buildRefundSummary(
      [
        tag({ currency: "TRY", refund: 100 }),
        tag({ currency: "TRY", refund: null, grossRefund: 120 }),
        tag({ currency: "EUR", refund: 50 }),
      ],
      "TRY",
    );

    const groups = Object.fromEntries(
      summary.expected.map((group) => [group.currency, group]),
    );
    expect(groups.TRY.isEstimate).toBe(true);
    expect(groups.TRY.amount).toBe(220);
    // Per group, not global: EUR had no fallback of its own.
    expect(groups.EUR.isEstimate).toBe(false);
  });

  it("counts tags with no figure instead of guessing one", () => {
    const summary = buildRefundSummary(
      [tag({ refund: 100 }), tag({ refund: null, grossRefund: null })],
      "TRY",
    );

    expect(summary.expected[0].amount).toBe(100);
    expect(summary.expected[0].tagCount).toBe(1);
    // Still an expected tag, just not a calculated one.
    expect(summary.expectedTagCount).toBe(2);
    expect(summary.notCalculatedCount).toBe(1);
  });

  it("separates money already received from money still expected", () => {
    const summary = buildRefundSummary(
      [tag({ status: "Issued", refund: 100 }), tag({ status: "Paid", refund: 412 })],
      "TRY",
    );

    expect(summary.expected[0].amount).toBe(100);
    expect(summary.received[0].amount).toBe(412);
    expect(summary.expectedTagCount).toBe(1);
  });

  it("excludes lost and inactive tags from both sides", () => {
    const summary = buildRefundSummary(
      [
        tag({ status: "Expired", refund: 500 }),
        tag({ status: "Cancelled", refund: 500 }),
        tag({ status: "Draft", refund: 500 }),
      ],
      "TRY",
    );

    expect(summary.expected).toEqual([]);
    expect(summary.received).toEqual([]);
    expect(summary.expectedTagCount).toBe(0);
    expect(summary.notCalculatedCount).toBe(0);
  });

  it("falls back to the tenant currency when a tag names none", () => {
    const summary = buildRefundSummary([tag({ currency: null, refund: 100 })], "TRY");

    expect(summary.expected[0].currency).toBe("TRY");
  });

  it("returns empty groups for an empty list", () => {
    const summary = buildRefundSummary([], "TRY");

    expect(summary).toEqual({
      expected: [],
      received: [],
      expectedTagCount: 0,
      notCalculatedCount: 0,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/screens/traveller/Home/__tests__/homeStatus.test.ts`
Expected: FAIL — `Cannot find module '../homeStatus.logic'`.

- [ ] **Step 3: Write the implementation**

Create `src/screens/traveller/Home/homeStatus.logic.ts`:

```ts
import type { UniRefund_TagService_Tags_TagStatusType as TagStatus } from "@/saas/TagService";
import {
  tagExpectedAmount,
  tagExpectedAmountIsEstimate,
  tagMoneyBucket,
  type MoneyBucket,
} from "@/utils/tagMoney";

/** The fields the summary reads. Structural, so both list DTOs satisfy it. */
export interface SummaryTag {
  status: TagStatus;
  currency?: string | null;
  refund?: number | null;
  grossRefund?: number | null;
}

export interface CurrencyTotal {
  currency: string;
  amount: number;
  /** Tags that contributed a figure — not every tag in the bucket. */
  tagCount: number;
  /** Any contributing tag fell back to the pre-fee figure. */
  isEstimate: boolean;
}

export interface RefundSummary {
  /** Largest total first; equal totals by currency code ascending. */
  expected: CurrencyTotal[];
  received: CurrencyTotal[];
  /** Every `expected` tag, including those with no figure yet. */
  expectedTagCount: number;
  notCalculatedCount: number;
}

function toSortedTotals(groups: Map<string, CurrencyTotal>): CurrencyTotal[] {
  return [...groups.values()].sort(
    (a, b) => b.amount - a.amount || a.currency.localeCompare(b.currency),
  );
}

export function buildRefundSummary(
  tags: SummaryTag[],
  fallbackCurrency: string,
): RefundSummary {
  const groups: Record<"expected" | "received", Map<string, CurrencyTotal>> = {
    expected: new Map(),
    received: new Map(),
  };
  let expectedTagCount = 0;
  let notCalculatedCount = 0;

  for (const tag of tags) {
    const bucket: MoneyBucket = tagMoneyBucket(tag.status);
    if (bucket !== "expected" && bucket !== "received") continue;

    if (bucket === "expected") expectedTagCount += 1;

    const amount = tagExpectedAmount(tag);
    if (amount === null) {
      if (bucket === "expected") notCalculatedCount += 1;
      continue;
    }

    const currency = tag.currency ?? fallbackCurrency;
    const group = groups[bucket].get(currency) ?? {
      currency,
      amount: 0,
      tagCount: 0,
      isEstimate: false,
    };
    group.amount += amount;
    group.tagCount += 1;
    group.isEstimate = group.isEstimate || tagExpectedAmountIsEstimate(tag);
    groups[bucket].set(currency, group);
  }

  return {
    expected: toSortedTotals(groups.expected),
    received: toSortedTotals(groups.received),
    expectedTagCount,
    notCalculatedCount,
  };
}
```

Note on float addition: `100 + 48.5` is exact in binary floating point, and the two-decimal `Intl.NumberFormat` used for display rounds away any residue from other combinations. No decimal library is warranted here.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/screens/traveller/Home/__tests__/homeStatus.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/screens/traveller/Home/homeStatus.logic.ts src/screens/traveller/Home/__tests__/homeStatus.test.ts
git commit -m "feat(home): total a traveller's refunds per currency"
```

---

### Task 3: The action list (`homeStatus.logic.ts`)

**Files:**
- Modify: `src/screens/traveller/Home/homeStatus.logic.ts` (append)
- Modify: `src/screens/traveller/Home/__tests__/homeStatus.test.ts` (append)

**Interfaces:**
- Consumes: `tagMoneyBucket` from `@/utils/tagMoney`; `TagStatusTone` (type only) from `@/utils/tagStatus`.
- Produces:
  ```ts
  export type HomeActionKind = "stamp" | "collect" | "correction" | "payment" | "payout" | "identity";
  export interface ActionTag {
    id: string; tagNumber: string; status: TagStatus;
    exportValidationDate?: string | null;
    exportValidationExpirationDate?: string | null;
    refundExpirationDate?: string | null;
  }
  export interface HomeAction {
    kind: HomeActionKind; tagCount: number;
    tagId?: string; tagNumber?: string;
    statuses: TagStatus[];
    deadline?: string; daysLeft?: number;
    tone: TagStatusTone;
  }
  export interface HomeActionContext { payoutMethodCount: number; isVerified: boolean; now: number }
  export function daysUntil(iso: string, now: number): number;
  export function deadlineTone(daysLeft: number | undefined): TagStatusTone;
  export function buildHomeActions(tags: ActionTag[], context: HomeActionContext): HomeAction[];
  ```

- [ ] **Step 1: Write the failing test**

Append to `src/screens/traveller/Home/__tests__/homeStatus.test.ts`. **Merge these names into the file's existing top import** rather than adding a second `import` from the same module — `no-duplicate-imports` flags that — so the one import becomes:

```ts
import {
  buildHomeActions,
  buildRefundSummary,
  daysUntil,
  deadlineTone,
  type ActionTag,
  type HomeActionContext,
  type SummaryTag,
} from "../homeStatus.logic";
```

Then append the suites:

```ts
const NOW = Date.parse("2026-08-24T09:00:00Z");
const DAY = 86_400_000;

function actionTag(overrides: Partial<ActionTag> = {}): ActionTag {
  return {
    id: "tag-1",
    tagNumber: "T-8891",
    status: "Issued",
    exportValidationExpirationDate: new Date(NOW + 4 * DAY).toISOString(),
    ...overrides,
  };
}

const READY: HomeActionContext = {
  payoutMethodCount: 1,
  isVerified: true,
  now: NOW,
};

describe("daysUntil", () => {
  it("counts whole days remaining", () => {
    expect(daysUntil(new Date(NOW + 4 * DAY).toISOString(), NOW)).toBe(4);
  });

  // Under a day left is the last day, not "0 days" and not overdue.
  it("returns zero inside the final day", () => {
    expect(daysUntil(new Date(NOW + 6 * 3_600_000).toISOString(), NOW)).toBe(0);
  });

  it("goes negative once the deadline has passed", () => {
    expect(daysUntil(new Date(NOW - 2 * DAY).toISOString(), NOW)).toBe(-2);
  });
});

describe("deadlineTone", () => {
  it("is error inside three days or overdue", () => {
    expect(deadlineTone(-1)).toBe("error");
    expect(deadlineTone(0)).toBe("error");
    expect(deadlineTone(3)).toBe("error");
  });

  it("is warning inside a week", () => {
    expect(deadlineTone(4)).toBe("warning");
    expect(deadlineTone(7)).toBe("warning");
  });

  it("is info beyond a week or with no deadline at all", () => {
    expect(deadlineTone(8)).toBe("info");
    expect(deadlineTone(undefined)).toBe("info");
  });
});

describe("buildHomeActions", () => {
  it("raises a stamp action for a tag awaiting export validation", () => {
    const actions = buildHomeActions([actionTag()], READY);

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      kind: "stamp",
      tagCount: 1,
      tagId: "tag-1",
      tagNumber: "T-8891",
      daysLeft: 4,
      tone: "warning",
    });
  });

  it("groups same-kind tags into one row carrying the soonest deadline", () => {
    const actions = buildHomeActions(
      [
        actionTag({ id: "a", exportValidationExpirationDate: new Date(NOW + 9 * DAY).toISOString() }),
        actionTag({ id: "b", exportValidationExpirationDate: new Date(NOW + 2 * DAY).toISOString() }),
        actionTag({ id: "c", exportValidationExpirationDate: new Date(NOW + 5 * DAY).toISOString() }),
      ],
      READY,
    );

    expect(actions).toHaveLength(1);
    expect(actions[0].tagCount).toBe(3);
    expect(actions[0].daysLeft).toBe(2);
    expect(actions[0].tone).toBe("error");
    // A group cannot open one tag; the row filters the list instead.
    expect(actions[0].tagId).toBeUndefined();
    expect(actions[0].statuses).toContain("Issued");
  });

  it("does not ask for a stamp a tag already has", () => {
    const actions = buildHomeActions(
      [actionTag({ exportValidationDate: new Date(NOW - DAY).toISOString() })],
      READY,
    );

    expect(actions).toEqual([]);
  });

  it("asks a validated tag to be collected, dated by the refund expiry", () => {
    const actions = buildHomeActions(
      [
        actionTag({
          status: "ExportValidated",
          refundExpirationDate: new Date(NOW + 20 * DAY).toISOString(),
        }),
      ],
      READY,
    );

    expect(actions[0]).toMatchObject({ kind: "collect", daysLeft: 20, tone: "info" });
  });

  it("still raises collect when the tag carries no refund expiry", () => {
    const actions = buildHomeActions(
      [actionTag({ status: "ExportValidated", refundExpirationDate: null })],
      READY,
    );

    expect(actions[0]).toMatchObject({ kind: "collect", tone: "info" });
    expect(actions[0].daysLeft).toBeUndefined();
    expect(actions[0].deadline).toBeUndefined();
  });

  it("raises correction and payment rows without deadlines", () => {
    const actions = buildHomeActions(
      [
        actionTag({ id: "a", status: "Correction" }),
        actionTag({ id: "b", status: "PaymentBlocked" }),
      ],
      READY,
    );

    expect(actions.map((action) => action.kind)).toEqual(["payment", "correction"]);
    expect(actions.every((action) => action.deadline === undefined)).toBe(true);
  });

  // PaymentInProgress is progressing normally; there is nothing to do.
  it("raises nothing for a payment already in progress", () => {
    const actions = buildHomeActions([actionTag({ status: "PaymentInProgress" })], READY);

    expect(actions).toEqual([]);
  });

  it("asks for a payout method once money is expected", () => {
    const actions = buildHomeActions([actionTag()], { ...READY, payoutMethodCount: 0 });

    expect(actions.map((action) => action.kind)).toEqual(["stamp", "payout"]);
  });

  it("asks for identity verification once money is expected", () => {
    const actions = buildHomeActions([actionTag()], { ...READY, isVerified: false });

    expect(actions.map((action) => action.kind)).toEqual(["stamp", "identity"]);
  });

  // Profile's setup strip already owns cold-start setup; nagging an account
  // with nothing at stake would just duplicate it.
  it("does not nag an account with no expected tags", () => {
    const actions = buildHomeActions([], { payoutMethodCount: 0, isVerified: false, now: NOW });

    expect(actions).toEqual([]);
  });

  it("does not count a lost tag as money worth chasing", () => {
    const actions = buildHomeActions([actionTag({ status: "Expired" })], {
      ...READY,
      payoutMethodCount: 0,
    });

    expect(actions).toEqual([]);
  });

  it("sorts dated rows by deadline, then the undated ones in a fixed order", () => {
    const actions = buildHomeActions(
      [
        actionTag({ id: "a", status: "Correction" }),
        actionTag({ id: "b", status: "PaymentProblem" }),
        actionTag({
          id: "c",
          status: "ExportValidated",
          refundExpirationDate: new Date(NOW + 30 * DAY).toISOString(),
        }),
        actionTag({ id: "d", exportValidationExpirationDate: new Date(NOW + 2 * DAY).toISOString() }),
      ],
      { ...READY, payoutMethodCount: 0, isVerified: false },
    );

    expect(actions.map((action) => action.kind)).toEqual([
      "stamp", // 2 days
      "collect", // 30 days
      "payout", // undated, first because it blocks payment outright
      "identity",
      "payment",
      "correction",
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/screens/traveller/Home/__tests__/homeStatus.test.ts`
Expected: FAIL — `buildHomeActions is not a function` (the `buildRefundSummary` suites still pass).

- [ ] **Step 3: Write the implementation**

First add `TagStatusTone` to the **existing import block at the top** of `src/screens/traveller/Home/homeStatus.logic.ts` — an `import` after other statements is hoisted and legal, but `eslint`'s `import/first` flags it:

```ts
import type { TagStatusTone } from "@/utils/tagStatus";
```

Then append the rest to the end of the file:

```ts
export type HomeActionKind =
  | "stamp"
  | "collect"
  | "correction"
  | "payment"
  | "payout"
  | "identity";

/** The fields the action list reads. Structural, so both list DTOs satisfy it. */
export interface ActionTag {
  id: string;
  tagNumber: string;
  status: TagStatus;
  exportValidationDate?: string | null;
  exportValidationExpirationDate?: string | null;
  refundExpirationDate?: string | null;
}

export interface HomeAction {
  kind: HomeActionKind;
  /** Tags behind this row. Zero for the two account-level kinds. */
  tagCount: number;
  /** Set only when exactly one tag is behind the row, so it can be opened. */
  tagId?: string;
  tagNumber?: string;
  /** What to filter the tags list by when the row stands for several tags. */
  statuses: TagStatus[];
  deadline?: string;
  /** Whole days from `now`; negative once overdue. */
  daysLeft?: number;
  tone: TagStatusTone;
}

export interface HomeActionContext {
  payoutMethodCount: number;
  isVerified: boolean;
  now: number;
}

const DAY_MS = 86_400_000;

/**
 * Whole days from `now` to `iso`. Floored, so anything inside the final day
 * reads as 0 ("last day") and only a passed deadline goes negative.
 */
export function daysUntil(iso: string, now: number): number {
  return Math.floor((Date.parse(iso) - now) / DAY_MS);
}

/**
 * Urgency as one of the existing status tones, so the row indexes the same
 * `TAG_STATUS_*` maps the tag cards use rather than introducing a second
 * colour vocabulary.
 */
export function deadlineTone(daysLeft: number | undefined): TagStatusTone {
  if (daysLeft === undefined) return "info";
  if (daysLeft <= 3) return "error";
  if (daysLeft <= 7) return "warning";
  return "info";
}

/** Statuses that mean a tag still needs a customs stamp. */
const AWAITING_STAMP: TagStatus[] = [
  "PreIssued",
  "Issued",
  "WaitingGoodsValidation",
  "WaitingStampValidation",
];

const PAYMENT_TROUBLE: TagStatus[] = ["PaymentProblem", "PaymentBlocked"];

/** Order for rows that carry no deadline. Payout first: it blocks payment outright. */
const UNDATED_ORDER: HomeActionKind[] = [
  "payout",
  "identity",
  "collect",
  "payment",
  "correction",
];

function classify(tag: ActionTag): HomeActionKind | null {
  if (AWAITING_STAMP.includes(tag.status)) {
    return tag.exportValidationDate ? null : "stamp";
  }
  if (tag.status === "ExportValidated") return "collect";
  if (tag.status === "Correction") return "correction";
  if (PAYMENT_TROUBLE.includes(tag.status)) return "payment";
  return null;
}

function deadlineFor(tag: ActionTag, kind: HomeActionKind): string | undefined {
  if (kind === "stamp") return tag.exportValidationExpirationDate ?? undefined;
  if (kind === "collect") return tag.refundExpirationDate ?? undefined;
  return undefined;
}

export function buildHomeActions(
  tags: ActionTag[],
  context: HomeActionContext,
): HomeAction[] {
  const byKind = new Map<HomeActionKind, HomeAction>();
  let hasExpectedMoney = false;

  for (const tag of tags) {
    if (tagMoneyBucket(tag.status) === "expected") hasExpectedMoney = true;

    const kind = classify(tag);
    if (!kind) continue;

    const existing = byKind.get(kind);
    const action: HomeAction =
      existing ??
      ({ kind, tagCount: 0, statuses: [], tone: "info" } satisfies HomeAction);

    action.tagCount += 1;
    if (!action.statuses.includes(tag.status)) action.statuses.push(tag.status);

    // Only a row standing for exactly one tag can open it; the second tag to
    // land in a kind clears what the first put here.
    if (action.tagCount === 1) {
      action.tagId = tag.id;
      action.tagNumber = tag.tagNumber;
    } else {
      action.tagId = undefined;
      action.tagNumber = undefined;
    }

    const deadline = deadlineFor(tag, kind);
    if (deadline && (!action.deadline || Date.parse(deadline) < Date.parse(action.deadline))) {
      action.deadline = deadline;
    }

    byKind.set(kind, action);
  }

  // Account-level rows only matter once there is money to lose. Profile's
  // setup strip already covers an account with nothing at stake.
  if (hasExpectedMoney) {
    if (context.payoutMethodCount === 0) {
      byKind.set("payout", { kind: "payout", tagCount: 0, statuses: [], tone: "info" });
    }
    if (!context.isVerified) {
      byKind.set("identity", { kind: "identity", tagCount: 0, statuses: [], tone: "info" });
    }
  }

  const actions = [...byKind.values()].map((action) => {
    const daysLeft = action.deadline
      ? daysUntil(action.deadline, context.now)
      : undefined;
    return { ...action, daysLeft, tone: deadlineTone(daysLeft) };
  });

  return actions.sort((a, b) => {
    if (a.deadline && b.deadline) {
      return Date.parse(a.deadline) - Date.parse(b.deadline);
    }
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return UNDATED_ORDER.indexOf(a.kind) - UNDATED_ORDER.indexOf(b.kind);
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/screens/traveller/Home/__tests__/homeStatus.test.ts`
Expected: PASS — 27 tests in the file: the 9 summary tests from Task 2, plus 18 added here (3 `daysUntil`, 3 `deadlineTone`, 12 `buildHomeActions`).

- [ ] **Step 5: Commit**

```bash
git add src/screens/traveller/Home/homeStatus.logic.ts src/screens/traveller/Home/__tests__/homeStatus.test.ts
git commit -m "feat(home): group a traveller's outstanding work by what it needs"
```

---

### Task 4: Localization keys

**Files:**
- Modify: `src/localization/resources/en-US.json` (the `Home` object)
- Modify: `src/localization/resources/tr-TR.json` (the `Home` object)

**Interfaces:**
- Produces: the `MobileApp.Home.*` keys every later task calls `t()` with. Nothing consumes Tasks 1-3.

This task exists on its own and comes before any component work because `TranslationKey` is derived from generated bundles: calling `t("MobileApp.Home.Actions.Title")` before the key exists fails `tsc` at the call site rather than rendering a raw string.

- [ ] **Step 1: Add the English keys**

In `src/localization/resources/en-US.json`, replace the existing `"Home"` object (currently `Title`, `Guest`, `CreateTag`, `CreateTagSubtitle`, `CreateTagComingSoon`, `RefundPointPlaceholder`) with the same six keys plus:

```json
    "Greeting": "Hello, {name}",
    "Summary": {
      "Expected": "You'll receive",
      "EstimatedNote": "estimated",
      "TagCount": "{count} tags",
      "OneTagCount": "1 tag",
      "NotCalculated": "{count} not yet calculated",
      "AlreadyPaid": "{amount} {currency} already paid"
    },
    "Actions": {
      "Title": "Needs you",
      "OneTag": "{tagNumber} · by {date}",
      "ManyTags": "{count} tags · soonest {date}",
      "stamp": { "Title": "Get a customs stamp" },
      "collect": { "Title": "Collect your refund" },
      "correction": { "Title": "A tag needs correcting" },
      "payment": { "Title": "Payment problem" },
      "payout": {
        "Title": "Add a payout method",
        "Hint": "We can't pay you without one"
      },
      "identity": {
        "Title": "Verify your identity",
        "Hint": "Needed before a refund can be paid"
      }
    },
    "Deadline": {
      "DaysLeft": "{count} days left",
      "DayLeft": "1 day left",
      "Today": "Last day",
      "Overdue": "Overdue"
    },
    "Start": {
      "Title": "No tags yet",
      "Description": "Shop tax-free, then scan the tag on your receipt to claim it.",
      "Cta": "Scan a tag"
    },
    "Shortcuts": { "Title": "Shortcuts" }
```

`OneTagCount` and `DayLeft` are additions to the spec's key list: `"{count} tags"` and `"{count} days left"` both read wrong at one, and this codebase has no plural-form helper.

`stamp`/`collect`/`payout` and the rest are lowercase because they are `HomeActionKind` values used directly as key suffixes — the `MobileApp.Profile.Setup.${key}.Cta` pattern from `VerificationStrip`, which is what saves a mapping table.

- [ ] **Step 2: Add the Turkish keys**

Same structure in `src/localization/resources/tr-TR.json`:

```json
    "Greeting": "Merhaba, {name}",
    "Summary": {
      "Expected": "Alacağınız tutar",
      "EstimatedNote": "tahmini",
      "TagCount": "{count} etiket",
      "OneTagCount": "1 etiket",
      "NotCalculated": "{count} tanesi henüz hesaplanmadı",
      "AlreadyPaid": "{amount} {currency} ödendi"
    },
    "Actions": {
      "Title": "Sizi bekliyor",
      "OneTag": "{tagNumber} · {date} tarihine kadar",
      "ManyTags": "{count} etiket · en yakını {date}",
      "stamp": { "Title": "Gümrük onayı alın" },
      "collect": { "Title": "İadenizi alın" },
      "correction": { "Title": "Bir etiket düzeltme bekliyor" },
      "payment": { "Title": "Ödeme sorunu" },
      "payout": {
        "Title": "Ödeme yöntemi ekleyin",
        "Hint": "Ödeme yöntemi olmadan iade yapılamaz"
      },
      "identity": {
        "Title": "Kimliğinizi doğrulayın",
        "Hint": "İade ödemesi öncesinde gereklidir"
      }
    },
    "Deadline": {
      "DaysLeft": "{count} gün kaldı",
      "DayLeft": "1 gün kaldı",
      "Today": "Son gün",
      "Overdue": "Süresi geçti"
    },
    "Start": {
      "Title": "Henüz etiket yok",
      "Description": "Vergisiz alışveriş yapın, ardından fişinizdeki etiketi tarayarak talep edin.",
      "Cta": "Etiket tara"
    },
    "Shortcuts": { "Title": "Kısayollar" }
```

- [ ] **Step 3: Regenerate the language bundles**

Run: `npm run init`
Expected: writes `src/data/language-data/*.gen.json`.

**If it fails:** it fetches backend resources, so it needs network and env. Do not proceed to Task 5 with a stale bundle — `tsc` will fail at every new `t()` call and the cause will not be obvious. Report the failure and stop; the remaining tasks are blocked on it, not broken by it.

- [ ] **Step 4: Verify the keys landed in both generated bundles**

Run: `node -e "for (const l of ['en-US','tr-TR']) { const d = require('./src/data/language-data/' + l + '.gen.json'); const home = (d.MobileApp || d).Home; console.log(l, !!home.Actions?.stamp?.Title, !!home.Deadline?.DayLeft, !!home.Summary?.OneTagCount, !!home.Start?.Cta); }"`
Expected: `true true true true` on both lines.

- [ ] **Step 5: Verify typecheck still passes**

Run: `npm run typecheck`
Expected: clean. (No call sites yet; this proves the bundles parse and `TranslationKey` regenerated.)

- [ ] **Step 6: Commit**

```bash
git add src/localization/resources/en-US.json src/localization/resources/tr-TR.json
git commit -m "i18n(home): add the status home's summary, action and deadline copy"
```

---

### Task 5: `useHomeStatus` hook

**Files:**
- Create: `src/screens/traveller/Home/useHomeStatus.ts`
- Test: `src/screens/traveller/Home/__tests__/useHomeStatus.router.test.ts`

**Interfaces:**
- Consumes: `buildRefundSummary`, `buildHomeActions`, `RefundSummary`, `HomeAction` (Tasks 2-3); `useTagStore` from `@/store/tag`; `useCurrencyCode` from `@/store/country-settings`; `useDocumentSwitcher` from `@/screens/traveller/Documents/useDocumentSwitcher`; `getTravellerCardsMine` from `@/actions/RefundService/actions`; `useAsyncFetch` from `@/hooks/useAsyncFetch`; `isVerifiedLevel` from `@/screens/traveller/Profile/profileIdentity.logic`.
- Produces:
  ```ts
  export interface HomeStatus {
    summary: RefundSummary;
    actions: HomeAction[];
    isLoading: boolean;
    error: string | null;
    hasTags: boolean;
  }
  export function useHomeStatus(): HomeStatus;
  ```

Note the `.router.test.ts` suffix: `renderHook` renders, so this suite must be in the `router` project.

- [ ] **Step 1: Write the failing test**

Create `src/screens/traveller/Home/__tests__/useHomeStatus.router.test.ts`:

```ts
import { renderHook } from "@testing-library/react-native";
import useTagStore from "@/store/tag";
import { useHomeStatus } from "../useHomeStatus";

const NOW = Date.parse("2026-08-24T09:00:00Z");
const DAY = 86_400_000;

// Both pull real network machinery; the hook's job is composing them, so they
// are stubbed and varied per test.
const mockSwitcher = { documents: [] as { evidenceLevel?: string }[], activeDocumentId: undefined as string | undefined };
jest.mock("@/screens/traveller/Documents/useDocumentSwitcher", () => ({
  useDocumentSwitcher: () => mockSwitcher,
}));

let mockCards: { items?: { type: string }[] } | undefined;
jest.mock("@/hooks/useAsyncFetch", () => ({
  __esModule: true,
  default: () => ({ data: mockCards, loading: false, error: null }),
}));

jest.mock("@/store/country-settings", () => ({
  useCurrencyCode: () => "TRY",
}));

beforeEach(() => {
  jest.spyOn(Date, "now").mockReturnValue(NOW);
  useTagStore.getState().clearTags();
  mockSwitcher.documents = [];
  mockSwitcher.activeDocumentId = undefined;
  mockCards = { items: [{ type: "Card" }] };
});

afterEach(() => jest.restoreAllMocks());

it("reports loading while the tag store has never resolved", () => {
  const { result } = renderHook(() => useHomeStatus());

  expect(result.current.isLoading).toBe(true);
  expect(result.current.hasTags).toBe(false);
});

it("summarises the tags in the store", () => {
  // A verified active document, so this test isolates the summary and the stamp
  // action it names. Left document-less, the traveller is unverified and an
  // `identity` action joins the list — which is correct behaviour, but not what
  // this test is about.
  mockSwitcher.documents = [
    { travellerDocumentId: "d1", evidenceLevel: "Medium" },
  ] as never;
  mockSwitcher.activeDocumentId = "d1";
  useTagStore.getState().setLoading(false);
  useTagStore.getState().setTags({
    items: [
      {
        id: "a",
        tagNumber: "T-1",
        status: "Issued",
        currency: "TRY",
        refund: 412,
        issueDate: new Date(NOW).toISOString(),
        exportValidationExpirationDate: new Date(NOW + 4 * DAY).toISOString(),
        travellerDocumentNumber: "P1",
      },
    ],
    totalCount: 1,
  });

  const { result } = renderHook(() => useHomeStatus());

  expect(result.current.isLoading).toBe(false);
  expect(result.current.hasTags).toBe(true);
  expect(result.current.summary.expected[0]).toMatchObject({
    currency: "TRY",
    amount: 412,
  });
  expect(result.current.actions.map((a) => a.kind)).toEqual(["stamp"]);
});

// The highest-impact case, and the one an `isVerified` shortcut for
// document-less accounts would silently hide: a first tag is already issued, so
// there is money at stake, and no document exists to verify it against.
it("asks a traveller with no document at all to verify their identity", () => {
  mockSwitcher.documents = [];
  mockSwitcher.activeDocumentId = undefined;
  useTagStore.getState().setLoading(false);
  useTagStore.getState().setTags({
    items: [
      {
        id: "a",
        tagNumber: "T-1",
        status: "Issued",
        currency: "TRY",
        refund: 412,
        issueDate: new Date(NOW).toISOString(),
        exportValidationExpirationDate: new Date(NOW + 4 * DAY).toISOString(),
        travellerDocumentNumber: "P1",
      },
    ],
    totalCount: 1,
  });

  const { result } = renderHook(() => useHomeStatus());

  expect(result.current.actions.map((a) => a.kind)).toEqual([
    "stamp",
    "identity",
  ]);
});

it("raises the payout action when no card or bank token exists", () => {
  mockCards = { items: [{ type: "Wallet" }] };
  useTagStore.getState().setLoading(false);
  useTagStore.getState().setTags({
    items: [
      {
        id: "a",
        tagNumber: "T-1",
        status: "ExportValidated",
        currency: "TRY",
        refund: 412,
        issueDate: new Date(NOW).toISOString(),
        exportValidationExpirationDate: new Date(NOW - DAY).toISOString(),
        travellerDocumentNumber: "P1",
      },
    ],
    totalCount: 1,
  });

  const { result } = renderHook(() => useHomeStatus());

  // Wallet tokens are excluded: there is no add flow for one, so counting it
  // would credit a step the traveller cannot complete.
  expect(result.current.actions.map((a) => a.kind)).toContain("payout");
});

it("treats a Medium-evidence active document as verified", () => {
  mockSwitcher.documents = [
    { travellerDocumentId: "d1", evidenceLevel: "Medium" },
  ] as never;
  mockSwitcher.activeDocumentId = "d1";
  useTagStore.getState().setLoading(false);
  useTagStore.getState().setTags({
    items: [
      {
        id: "a",
        tagNumber: "T-1",
        status: "Issued",
        currency: "TRY",
        refund: 412,
        issueDate: new Date(NOW).toISOString(),
        exportValidationExpirationDate: new Date(NOW + 4 * DAY).toISOString(),
        travellerDocumentNumber: "P1",
      },
    ],
    totalCount: 1,
  });

  const { result } = renderHook(() => useHomeStatus());

  expect(result.current.actions.map((a) => a.kind)).not.toContain("identity");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/screens/traveller/Home/__tests__/useHomeStatus.router.test.ts`
Expected: FAIL — `Cannot find module '../useHomeStatus'`.

- [ ] **Step 3: Write the implementation**

Create `src/screens/traveller/Home/useHomeStatus.ts`:

```ts
import { getTravellerCardsMine } from "@/actions/RefundService/actions";
import useAsyncFetch from "@/hooks/useAsyncFetch";
import { useDocumentSwitcher } from "@/screens/traveller/Documents/useDocumentSwitcher";
import { isVerifiedLevel } from "@/screens/traveller/Profile/profileIdentity.logic";
import { useCurrencyCode } from "@/store/country-settings";
import useTagStore from "@/store/tag";
import { useMemo } from "react";
import {
  buildHomeActions,
  buildRefundSummary,
  type HomeAction,
  type RefundSummary,
} from "./homeStatus.logic";

export interface HomeStatus {
  summary: RefundSummary;
  actions: HomeAction[];
  isLoading: boolean;
  error: string | null;
  hasTags: boolean;
}

/**
 * Everything the status home renders above the latest-tag section.
 *
 * The tags are free — `useLoadTags` in the authenticated layout has already put
 * them in the store. The other two are the same requests `useProfileIdentity`
 * makes, so Home pays two GETs on mount: without them it cannot tell a
 * traveller that nothing can be paid to them.
 *
 * Every derivation is delegated to `homeStatus.logic`, which is pure and takes
 * `now` as an argument. Nothing here is stored.
 */
export function useHomeStatus(): HomeStatus {
  const tags = useTagStore((state) => state.tags);
  const isLoading = useTagStore((state) => state.isLoading);
  const error = useTagStore((state) => state.error);
  const fallbackCurrency = useCurrencyCode();

  const { documents, activeDocumentId } = useDocumentSwitcher();
  const { data: cardData } = useAsyncFetch(getTravellerCardsMine);

  const payoutMethodCount = useMemo(
    () =>
      // Wallet tokens are excluded for the same reason the Cards screen drops
      // them: there is no add flow for one.
      (cardData?.items ?? []).filter(
        (item) => item.type === "Card" || item.type === "Bank",
      ).length,
    [cardData],
  );

  const isVerified = useMemo(() => {
    const active = documents.find(
      (document) => document.travellerDocumentId === activeDocumentId,
    );
    return isVerifiedLevel(active?.evidenceLevel);
  }, [documents, activeDocumentId]);

  const summary = useMemo(
    () => buildRefundSummary(tags ?? [], fallbackCurrency),
    [tags, fallbackCurrency],
  );

  const actions = useMemo(
    () =>
      buildHomeActions(tags ?? [], {
        payoutMethodCount,
        isVerified,
        // Read at render rather than passed in: the logic stays pure and
        // testable, and a day boundary crossing while the screen is mounted
        // is corrected by the next focus refresh.
        now: Date.now(),
      }),
    [tags, payoutMethodCount, isVerified],
  );

  return {
    summary,
    actions,
    isLoading,
    error,
    hasTags: (tags?.length ?? 0) > 0,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/screens/traveller/Home/__tests__/useHomeStatus.router.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean. If `tags` (the `TagListItem` union) is rejected where `SummaryTag[]`/`ActionTag[]` is expected, the structural interfaces in Tasks 2-3 need widening — both list DTOs were verified to carry every field, so a failure here means a field was typed more narrowly than the DTO.

- [ ] **Step 6: Commit**

```bash
git add src/screens/traveller/Home/useHomeStatus.ts src/screens/traveller/Home/__tests__/useHomeStatus.router.test.ts
git commit -m "feat(home): compose the traveller's status from the tag store and their setup"
```

---

### Task 6: `RefundSummary` and `HomeSkeleton`

**Files:**
- Create: `src/screens/traveller/Home/_components/RefundSummary.tsx`
- Create: `src/screens/traveller/Home/_components/HomeSkeleton.tsx`
- Test: `src/screens/traveller/Home/__tests__/RefundSummary.router.test.tsx`

**Interfaces:**
- Consumes: `RefundSummary` type from `./homeStatus.logic` (Task 2); `Skeleton`, `SkeletonRoot` from `@/components/Skeleton`; `useLocalization`.
- Produces:
  ```ts
  export function RefundSummaryCard({ summary }: { summary: RefundSummary }): JSX.Element;
  export function HomeSkeleton(): JSX.Element;
  ```

Named `RefundSummaryCard` so the component does not collide with the `RefundSummary` **type** it takes.

- [ ] **Step 1: Write the failing test**

Create `src/screens/traveller/Home/__tests__/RefundSummary.router.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";
import React from "react";
import type { RefundSummary } from "../homeStatus.logic";
import { RefundSummaryCard } from "../_components/RefundSummary";

jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({
    t: (key: string, values?: Record<string, string | number>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
    activeLocale: "en-US",
  }),
}));

// Mocked for the same reason the other Home suites mock it: the real component
// goes through nativewind's `cssInterop` to map `className` onto `color`.
jest.mock("@/components/Ionicons", () => ({ Ionicons: () => null }));

function summary(overrides: Partial<RefundSummary> = {}): RefundSummary {
  return {
    expected: [{ currency: "TRY", amount: 1248.5, tagCount: 3, isEstimate: false }],
    received: [],
    expectedTagCount: 3,
    notCalculatedCount: 0,
    ...overrides,
  };
}

it("leads with the largest expected total and its currency", () => {
  render(<RefundSummaryCard summary={summary()} />);

  expect(screen.getByText("1,248.50")).toBeTruthy();
  expect(screen.getByText("TRY")).toBeTruthy();
});

it("says the figure is estimated when a group fell back to gross refund", () => {
  render(
    <RefundSummaryCard
      summary={summary({
        expected: [{ currency: "TRY", amount: 1248.5, tagCount: 3, isEstimate: true }],
      })}
    />,
  );

  expect(screen.getByText(/MobileApp\.Home\.Summary\.EstimatedNote/)).toBeTruthy();
});

it("omits the estimated note when every figure is net", () => {
  render(<RefundSummaryCard summary={summary()} />);

  expect(screen.queryByText(/MobileApp\.Home\.Summary\.EstimatedNote/)).toBeNull();
});

it("reports tags whose refund is not computed yet", () => {
  render(<RefundSummaryCard summary={summary({ notCalculatedCount: 2 })} />);

  expect(
    screen.getByText(/MobileApp\.Home\.Summary\.NotCalculated.*"count":2/),
  ).toBeTruthy();
});

it("shows money already received on its own line", () => {
  render(
    <RefundSummaryCard
      summary={summary({
        received: [{ currency: "TRY", amount: 412, tagCount: 1, isEstimate: false }],
      })}
    />,
  );

  expect(
    screen.getByText(/MobileApp\.Home\.Summary\.AlreadyPaid.*412\.00/),
  ).toBeTruthy();
});

it("renders additional currencies beneath the headline", () => {
  render(
    <RefundSummaryCard
      summary={summary({
        expected: [
          { currency: "EUR", amount: 900, tagCount: 1, isEstimate: false },
          { currency: "TRY", amount: 150, tagCount: 2, isEstimate: false },
        ],
        expectedTagCount: 3,
      })}
    />,
  );

  expect(screen.getByText("900.00")).toBeTruthy();
  expect(screen.getByText(/150\.00/)).toBeTruthy();
});

// A traveller whose three fresh tags carry no figure yet must not be shown a
// bare "0.00" as though that were the answer.
it("shows no headline figure when nothing is calculated", () => {
  render(
    <RefundSummaryCard
      summary={summary({ expected: [], expectedTagCount: 3, notCalculatedCount: 3 })}
    />,
  );

  expect(screen.queryByText("0.00")).toBeNull();
  expect(
    screen.getByText(/MobileApp\.Home\.Summary\.NotCalculated.*"count":3/),
  ).toBeTruthy();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/screens/traveller/Home/__tests__/RefundSummary.router.test.tsx`
Expected: FAIL — `Cannot find module '../_components/RefundSummary'`.

- [ ] **Step 3: Write `RefundSummary.tsx`**

```tsx
import { Ionicons } from "@/components/Ionicons";
import { useLocalization } from "@/providers/LocalizationProvider";
import { useMemo } from "react";
import { Text, View } from "react-native";
import type { CurrencyTotal, RefundSummary } from "../homeStatus.logic";

/**
 * What the traveller will receive, and what has already arrived.
 *
 * The headline is the largest currency group rather than a sum across
 * currencies, which would be a meaningless number on a cross-tenant list. A
 * group with no computed figure shows no figure at all — a bare "0.00" would
 * read as the answer rather than as "not yet".
 */
export function RefundSummaryCard({ summary }: { summary: RefundSummary }) {
  const { t, activeLocale } = useLocalization();

  const formatAmount = useMemo(() => {
    const formatter = new Intl.NumberFormat(activeLocale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return (amount: number) => formatter.format(amount);
  }, [activeLocale]);

  const [headline, ...rest] = summary.expected;

  const meta = [
    summary.expectedTagCount > 0 &&
      (summary.expectedTagCount === 1
        ? t("MobileApp.Home.Summary.OneTagCount")
        : t("MobileApp.Home.Summary.TagCount", {
            count: summary.expectedTagCount,
          })),
    summary.notCalculatedCount > 0 &&
      t("MobileApp.Home.Summary.NotCalculated", {
        count: summary.notCalculatedCount,
      }),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View className="gap-3 rounded-2xl border border-border bg-card px-5 py-4">
      <Text className="text-[11px] font-medium uppercase tracking-wide text-muted">
        {t("MobileApp.Home.Summary.Expected")}
        {headline?.isEstimate
          ? ` · ${t("MobileApp.Home.Summary.EstimatedNote")}`
          : ""}
      </Text>

      {headline && (
        <View className="flex-row items-baseline gap-1.5">
          <Text className="text-[32px] font-bold leading-none text-foreground">
            {formatAmount(headline.amount)}
          </Text>
          <Text className="text-base font-semibold text-muted">
            {headline.currency}
          </Text>
        </View>
      )}

      {rest.length > 0 && (
        <View className="gap-1">
          {rest.map((group: CurrencyTotal) => (
            <Text key={group.currency} className="text-sm font-medium text-foreground">
              {formatAmount(group.amount)} {group.currency}
              {group.isEstimate
                ? ` · ${t("MobileApp.Home.Summary.EstimatedNote")}`
                : ""}
            </Text>
          ))}
        </View>
      )}

      {meta.length > 0 && <Text className="text-xs text-muted">{meta}</Text>}

      {summary.received.length > 0 && (
        <>
          <View className="h-px bg-border" />
          {summary.received.map((group) => (
            <View key={group.currency} className="flex-row items-center gap-2">
              <Ionicons name="checkmark-circle" size={16} className="text-success" />
              <Text className="text-sm text-muted">
                {t("MobileApp.Home.Summary.AlreadyPaid", {
                  amount: formatAmount(group.amount),
                  currency: group.currency,
                })}
              </Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}
```

- [ ] **Step 4: Write `HomeSkeleton.tsx`**

```tsx
import { Skeleton, SkeletonRoot } from "@/components/Skeleton";
import { View } from "react-native";

/**
 * Stands in for the summary card and one action row at their final heights, so
 * nothing shifts when the tags land. Mirroring the real metrics is the only
 * reason a skeleton earns its place over a spinner.
 */
export function HomeSkeleton() {
  return (
    // `testID` so the screen's loading state can be asserted positively — a
    // test that only checks the loaded content is absent also passes when the
    // screen renders nothing at all.
    <View testID="home-skeleton" className="gap-4">
      <SkeletonRoot className="gap-3 rounded-2xl border border-border bg-card px-5 py-4">
        <Skeleton className="h-2.5 w-28" />
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-3 w-36" />
      </SkeletonRoot>

      <SkeletonRoot className="flex-row items-stretch overflow-hidden rounded-2xl border border-border bg-card">
        <Skeleton className="w-1.5 rounded-none" />
        <View className="flex-1 gap-2 px-4 py-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-52" />
        </View>
      </SkeletonRoot>
    </View>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest src/screens/traveller/Home/__tests__/RefundSummary.router.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add src/screens/traveller/Home/_components/RefundSummary.tsx src/screens/traveller/Home/_components/HomeSkeleton.tsx src/screens/traveller/Home/__tests__/RefundSummary.router.test.tsx
git commit -m "feat(home): show what a traveller will receive, per currency"
```

---

### Task 7: `ActionList`

**Files:**
- Create: `src/screens/traveller/Home/_components/ActionList.tsx`
- Test: `src/screens/traveller/Home/__tests__/ActionList.router.test.tsx`

**Interfaces:**
- Consumes: `HomeAction`, `HomeActionKind` from `../homeStatus.logic` (Task 3); `TAG_STATUS_RAIL`, `TAG_STATUS_BADGE`, `TAG_STATUS_TEXT` from `@/utils/tagStatus`; `DebouncedPressable`; `Ionicons`; `cn`.
- Produces:
  ```ts
  export function ActionList({ actions, onPressAction }: {
    actions: HomeAction[];
    onPressAction: (action: HomeAction) => void;
  }): JSX.Element | null;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/screens/traveller/Home/__tests__/ActionList.router.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import type { HomeAction } from "../homeStatus.logic";
import { ActionList } from "../_components/ActionList";

jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({
    t: (key: string, values?: Record<string, string | number>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
    activeLocale: "en-US",
  }),
}));

jest.mock("@/components/Ionicons", () => ({ Ionicons: () => null }));

function action(overrides: Partial<HomeAction> = {}): HomeAction {
  return {
    kind: "stamp",
    tagCount: 1,
    tagId: "tag-1",
    tagNumber: "T-8891",
    statuses: ["Issued"],
    deadline: "2026-08-28T00:00:00Z",
    daysLeft: 4,
    tone: "warning",
    ...overrides,
  };
}

// Nothing to do is not an achievement worth a permanent row.
it("renders nothing when there are no actions", () => {
  const { toJSON } = render(<ActionList actions={[]} onPressAction={jest.fn()} />);

  expect(toJSON()).toBeNull();
});

it("titles each row by its kind", () => {
  render(
    <ActionList
      actions={[action(), action({ kind: "payout", tagCount: 0, tagId: undefined, tagNumber: undefined, deadline: undefined, daysLeft: undefined, statuses: [] })]}
      onPressAction={jest.fn()}
    />,
  );

  expect(screen.getByText("MobileApp.Home.Actions.stamp.Title")).toBeTruthy();
  expect(screen.getByText("MobileApp.Home.Actions.payout.Title")).toBeTruthy();
});

it("names the tag when a row stands for exactly one", () => {
  render(<ActionList actions={[action()]} onPressAction={jest.fn()} />);

  expect(screen.getByText(/MobileApp\.Home\.Actions\.OneTag.*T-8891/)).toBeTruthy();
});

it("counts the tags when a row stands for several", () => {
  render(
    <ActionList
      actions={[action({ tagCount: 3, tagId: undefined, tagNumber: undefined })]}
      onPressAction={jest.fn()}
    />,
  );

  expect(screen.getByText(/MobileApp\.Home\.Actions\.ManyTags.*"count":3/)).toBeTruthy();
});

it("hints rather than counting for an account-level row", () => {
  render(
    <ActionList
      actions={[
        action({
          kind: "identity",
          tagCount: 0,
          tagId: undefined,
          tagNumber: undefined,
          statuses: [],
          deadline: undefined,
          daysLeft: undefined,
          tone: "info",
        }),
      ]}
      onPressAction={jest.fn()}
    />,
  );

  expect(screen.getByText("MobileApp.Home.Actions.identity.Hint")).toBeTruthy();
});

it("states the days left, in the singular at one", () => {
  render(<ActionList actions={[action({ daysLeft: 4 })]} onPressAction={jest.fn()} />);
  expect(screen.getByText(/MobileApp\.Home\.Deadline\.DaysLeft.*"count":4/)).toBeTruthy();

  screen.unmount();

  render(<ActionList actions={[action({ daysLeft: 1 })]} onPressAction={jest.fn()} />);
  expect(screen.getByText("MobileApp.Home.Deadline.DayLeft")).toBeTruthy();
});

it("calls the final day the last day and a passed one overdue", () => {
  render(<ActionList actions={[action({ daysLeft: 0 })]} onPressAction={jest.fn()} />);
  expect(screen.getByText("MobileApp.Home.Deadline.Today")).toBeTruthy();

  screen.unmount();

  render(<ActionList actions={[action({ daysLeft: -2 })]} onPressAction={jest.fn()} />);
  expect(screen.getByText("MobileApp.Home.Deadline.Overdue")).toBeTruthy();
});

it("hands the pressed action back to its caller", () => {
  const onPressAction = jest.fn();
  const only = action();

  render(<ActionList actions={[only]} onPressAction={onPressAction} />);
  fireEvent.press(screen.getByText("MobileApp.Home.Actions.stamp.Title"));

  expect(onPressAction).toHaveBeenCalledWith(only);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/screens/traveller/Home/__tests__/ActionList.router.test.tsx`
Expected: FAIL — `Cannot find module '../_components/ActionList'`.

- [ ] **Step 3: Write the implementation**

```tsx
import DebouncedPressable from "@/components/DebouncedPressable";
import { Ionicons, IoniconsTypes } from "@/components/Ionicons";
import { useLocalization } from "@/providers/LocalizationProvider";
import { cn } from "@/utils/cn";
import {
  TAG_STATUS_BADGE,
  TAG_STATUS_RAIL,
  TAG_STATUS_TEXT,
} from "@/utils/tagStatus";
import { useMemo } from "react";
import { Text, View } from "react-native";
import type { HomeAction, HomeActionKind } from "../homeStatus.logic";

const ICON_BY_KIND: Record<HomeActionKind, IoniconsTypes> = {
  stamp: "checkmark-circle-outline",
  collect: "cash-outline",
  correction: "create-outline",
  payment: "alert-circle-outline",
  payout: "card-outline",
  identity: "shield-checkmark-outline",
};

/** The two kinds that stand for the account rather than for any tag. */
const ACCOUNT_KINDS: HomeActionKind[] = ["payout", "identity"];

/**
 * What the traveller has left to do, one row per kind.
 *
 * One row per *kind* rather than per tag: every unvalidated tag needs a stamp,
 * so a per-tag list would be as long as the tag list and the heading would stop
 * meaning anything. An empty list renders nothing at all — a permanent "all
 * clear" row would say nothing on every subsequent visit.
 */
export function ActionList({
  actions,
  onPressAction,
}: {
  actions: HomeAction[];
  onPressAction: (action: HomeAction) => void;
}) {
  const { t, activeLocale } = useLocalization();

  const formatDate = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(activeLocale, {
      day: "2-digit",
      month: "short",
    });
    return (iso?: string) => {
      if (!iso) return "";
      const date = new Date(iso);
      return Number.isNaN(date.getTime()) ? "" : formatter.format(date);
    };
  }, [activeLocale]);

  if (actions.length === 0) return null;

  function deadlineLabel(daysLeft: number | undefined) {
    if (daysLeft === undefined) return null;
    if (daysLeft < 0) return t("MobileApp.Home.Deadline.Overdue");
    if (daysLeft === 0) return t("MobileApp.Home.Deadline.Today");
    if (daysLeft === 1) return t("MobileApp.Home.Deadline.DayLeft");
    return t("MobileApp.Home.Deadline.DaysLeft", { count: daysLeft });
  }

  function subtitle(action: HomeAction) {
    if (ACCOUNT_KINDS.includes(action.kind)) {
      // No `as const` and no mapping table: the template literal resolves to a
      // union of real `TranslationKey`s, which is exactly how
      // `VerificationStrip` reaches `MobileApp.Profile.Setup.${key}.Cta`.
      return t(`MobileApp.Home.Actions.${action.kind}.Hint`);
    }
    if (action.tagCount === 1 && action.tagNumber) {
      return t("MobileApp.Home.Actions.OneTag", {
        tagNumber: action.tagNumber,
        date: formatDate(action.deadline),
      });
    }
    return t("MobileApp.Home.Actions.ManyTags", {
      count: action.tagCount,
      date: formatDate(action.deadline),
    });
  }

  return (
    <View className="gap-3">
      <Text className="text-2xl font-bold text-foreground">
        {t("MobileApp.Home.Actions.Title")}
      </Text>

      <View className="gap-2">
        {actions.map((action) => {
          const label = deadlineLabel(action.daysLeft);
          return (
            <DebouncedPressable
              key={action.kind}
              onPress={() => onPressAction(action)}
              accessibilityRole="button"
              className="flex-row items-stretch overflow-hidden rounded-2xl border border-border bg-card active:opacity-80"
            >
              <View className={cn("w-1.5", TAG_STATUS_RAIL[action.tone])} />

              <View className="flex-1 flex-row items-center gap-3 px-4 py-3">
                <Ionicons
                  name={ICON_BY_KIND[action.kind]}
                  size={22}
                  className={TAG_STATUS_TEXT[action.tone]}
                />

                <View className="flex-1 gap-0.5">
                  <Text className="text-base font-semibold text-foreground">
                    {t(`MobileApp.Home.Actions.${action.kind}.Title`)}
                  </Text>
                  <Text className="text-xs text-muted" numberOfLines={1}>
                    {subtitle(action)}
                  </Text>
                </View>

                {label && (
                  <View
                    className={cn(
                      "rounded-full px-2.5 py-1",
                      TAG_STATUS_BADGE[action.tone],
                    )}
                  >
                    <Text
                      className={cn(
                        "text-[11px] font-semibold",
                        TAG_STATUS_TEXT[action.tone],
                      )}
                    >
                      {label}
                    </Text>
                  </View>
                )}

                <Ionicons name="chevron-forward" size={18} className="text-muted" />
              </View>
            </DebouncedPressable>
          );
        })}
      </View>
    </View>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/screens/traveller/Home/__tests__/ActionList.router.test.tsx`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/screens/traveller/Home/_components/ActionList.tsx src/screens/traveller/Home/__tests__/ActionList.router.test.tsx
git commit -m "feat(home): surface a traveller's outstanding work with its deadline"
```

---

### Task 8: Compose the screen

**Files:**
- Create: `src/screens/traveller/Home/_components/HomeStartCard.tsx`
- Modify: `src/screens/traveller/Home/HomeScreen.tsx` (full rewrite of the render tree)
- Modify: `src/templates/TabPage.tsx:34-40` (header row)
- Modify: `src/screens/traveller/Home/__tests__/HomeUploadEntry.router.test.tsx` (one assertion)
- Test: `src/screens/traveller/Home/__tests__/StatusHome.router.test.tsx`

**Interfaces:**
- Consumes: `useHomeStatus` (Task 5), `RefundSummaryCard` + `HomeSkeleton` (Task 6), `ActionList` (Task 7), `HomeAction` (Task 3); existing `LatestTag`, `Section`, `CardAction`, `ActiveDocumentPill`, `UploadVerificationSheet`, `TagsErrorState`, `openCards`, `useVerifyAccount`, `useCanUploadVerification`, `useQrScanLauncher`.
- Produces: nothing — this is the leaf.

- [ ] **Step 1: Write the failing test**

Create `src/screens/traveller/Home/__tests__/StatusHome.router.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { router } from "expo-router";
import useTagStore from "@/store/tag";
import type { HomeAction } from "../homeStatus.logic";
import TravellerHome from "../HomeScreen";

jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({ t: (key: string) => key, activeLocale: "en-US" }),
}));
jest.mock("@/providers/NotificationsProvider", () => ({
  useNotifications: () => ({ notifications: [] }),
}));
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), navigate: jest.fn() },
}));
jest.mock("@/components/Ionicons", () => ({ Ionicons: () => null }));
jest.mock("../_components/ActiveDocumentPill", () => ({
  ActiveDocumentPill: () => null,
}));
jest.mock("@/screens/shared/_components/LatestTag", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- a hoisted jest factory cannot reach a top-level import.
  const { Text } = require("react-native");
  return { __esModule: true, default: () => <Text>latest-tag</Text> };
});
jest.mock("@/screens/shared/Tags/Tag/_components/UploadVerificationSheet", () => ({
  UploadVerificationSheet: () => null,
}));
jest.mock("@/hooks/useCanUploadVerification", () => ({
  useCanUploadVerification: () => false,
}));
jest.mock("@/screens/traveller/Profile/useVerifyAccount", () => ({
  useVerifyAccount: () => jest.fn(),
}));
// Home mounts its own QrScanner for the start card's CTA, so the mock has to
// supply every field that component is handed — not just `open`.
const mockScanOpen = jest.fn();
jest.mock("@/hooks/useQrScanLauncher", () => ({
  useQrScanLauncher: () => ({
    open: mockScanOpen,
    close: jest.fn(),
    onScanned: jest.fn(),
    openManualEntry: jest.fn(),
    visible: false,
    subtitle: "subtitle",
    manualEntryLabel: "manual",
  }),
}));
jest.mock("@/components/QrScanner", () => ({ QrScanner: () => null }));

let mockStatus: {
  summary: { expected: never[]; received: never[]; expectedTagCount: number; notCalculatedCount: number };
  actions: HomeAction[];
  isLoading: boolean;
  error: string | null;
  hasTags: boolean;
};
jest.mock("../useHomeStatus", () => ({
  useHomeStatus: () => mockStatus,
}));

function renderHome() {
  return render(<TravellerHome />, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 375, height: 812 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useTagStore.getState().clearTags();
  mockStatus = {
    summary: { expected: [], received: [], expectedTagCount: 0, notCalculatedCount: 0 },
    actions: [],
    isLoading: false,
    error: null,
    hasTags: true,
  };
});

it("shows the skeleton while the status is loading", () => {
  mockStatus = { ...mockStatus, isLoading: true, hasTags: false };

  renderHome();

  // Asserted positively: checking only that the start card is absent would
  // also pass if the screen rendered nothing at all.
  expect(screen.getByTestId("home-skeleton")).toBeTruthy();
  expect(screen.queryByText("MobileApp.Home.Start.Title")).toBeNull();
});

// A background refresh can fail while good content is on screen — the focus
// refresh, for one. The content must survive, with a retry offered beside it.
it("keeps the summary on screen when a refresh fails", () => {
  mockStatus = { ...mockStatus, error: "load-failed", hasTags: true };

  renderHome();

  expect(screen.getByText("MobileApp.Tags.LoadFailed")).toBeTruthy();
  expect(screen.getByText("MobileApp.Tags.Retry")).toBeTruthy();
  // The content is still there — this is a banner, not a replacement.
  expect(screen.getByText("latest-tag")).toBeTruthy();
});

// With nothing to preserve, the full-bleed error state is the honest thing.
it("replaces the body with the error state when there is nothing to show", () => {
  mockStatus = { ...mockStatus, error: "load-failed", hasTags: false };

  renderHome();

  expect(screen.queryByText("MobileApp.Home.Start.Title")).toBeNull();
  expect(screen.queryByTestId("home-skeleton")).toBeNull();
});

// The whole screen for a brand-new traveller, so it points at the scanner.
it("offers a starting point when there are no tags", () => {
  mockStatus = { ...mockStatus, hasTags: false };

  renderHome();

  expect(screen.getByText("MobileApp.Home.Start.Title")).toBeTruthy();
  fireEvent.press(screen.getByText("MobileApp.Home.Start.Cta"));
  expect(mockScanOpen).toHaveBeenCalledTimes(1);
});

it("opens the one tag behind a single-tag action", () => {
  mockStatus = {
    ...mockStatus,
    actions: [
      {
        kind: "stamp",
        tagCount: 1,
        tagId: "tag-1",
        tagNumber: "T-8891",
        statuses: ["Issued"],
        deadline: "2026-08-28T00:00:00Z",
        daysLeft: 4,
        tone: "warning",
      },
    ],
  };

  renderHome();
  fireEvent.press(screen.getByText("MobileApp.Home.Actions.stamp.Title"));

  expect(router.push).toHaveBeenCalledWith({
    pathname: "/(auth)/tags/[tagId]",
    params: { tagId: "tag-1", tagNumber: "T-8891" },
  });
});

// Reuses the filter the tags tab already honours rather than a new screen.
it("filters the tags tab for a multi-tag action", () => {
  mockStatus = {
    ...mockStatus,
    actions: [
      {
        kind: "stamp",
        tagCount: 3,
        statuses: ["Issued", "WaitingStampValidation"],
        deadline: "2026-08-28T00:00:00Z",
        daysLeft: 4,
        tone: "warning",
      },
    ],
  };

  renderHome();
  fireEvent.press(screen.getByText("MobileApp.Home.Actions.stamp.Title"));

  expect(useTagStore.getState().query.statuses).toEqual([
    "Issued",
    "WaitingStampValidation",
  ]);
  // `navigate`, not `push`: tags is a sibling tab.
  expect(router.navigate).toHaveBeenCalledWith("/(auth)/tags");
  expect(router.push).not.toHaveBeenCalled();
});

// The FAQ tab renders these same keys; a copy on Home was duplication.
it("no longer duplicates the FAQ tab", () => {
  renderHome();

  expect(screen.queryByText("MobileApp.FAQ.Title")).toBeNull();
  expect(screen.queryByText("MobileApp.FAQ.TaxFree.WhatIsTaxFree.Title")).toBeNull();
});

it("keeps the map reachable, below the traveller's own work", () => {
  renderHome();

  expect(screen.getByText("MobileApp.Explore.TaxFreeLocations")).toBeTruthy();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/screens/traveller/Home/__tests__/StatusHome.router.test.tsx`
Expected: FAIL — `useHomeStatus` is not yet imported by `HomeScreen`, so the start card and action rows never render.

- [ ] **Step 3: Write `HomeStartCard.tsx`**

```tsx
import Button from "@/components/Button";
import { Ionicons } from "@/components/Ionicons";
import { useLocalization } from "@/providers/LocalizationProvider";
import { Text, View } from "react-native";

/**
 * Home for a traveller with no tags. This is the entire screen for them, so it
 * says what to do rather than reporting that there is nothing to report.
 */
export function HomeStartCard({ onScan }: { onScan: () => void }) {
  const { t } = useLocalization();

  return (
    <View className="items-center gap-3 rounded-2xl border border-dashed border-border p-6">
      <Ionicons name="pricetags-outline" size={32} className="text-muted" />
      <Text className="text-base font-semibold text-foreground">
        {t("MobileApp.Home.Start.Title")}
      </Text>
      <Text className="text-center text-sm text-muted">
        {t("MobileApp.Home.Start.Description")}
      </Text>
      <Button
        action={{ onPress: onScan, label: t("MobileApp.Home.Start.Cta") }}
        containerClassName="w-48"
      />
    </View>
  );
}
```

- [ ] **Step 4: Rewrite `HomeScreen.tsx`**

```tsx
import CardAction from "@/components/CardAction";
import { QrScanner } from "@/components/QrScanner";
import { Section } from "@/components/Section";
import { useCanUploadVerification } from "@/hooks/useCanUploadVerification";
import { useQrScanLauncher } from "@/hooks/useQrScanLauncher";
import { useLocalization } from "@/providers/LocalizationProvider";
import LatestTag from "@/screens/shared/_components/LatestTag";
import { TagsErrorState } from "@/screens/shared/_components/TagStates";
import { UploadVerificationSheet } from "@/screens/shared/Tags/Tag/_components/UploadVerificationSheet";
import { openCards } from "@/screens/traveller/Cards/openCards";
import { useVerifyAccount } from "@/screens/traveller/Profile/useVerifyAccount";
import useTagStore from "@/store/tag";
import useUserStore from "@/store/user";
import TabPage from "@/templates/TabPage";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { router } from "expo-router";
import React, { useCallback, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { loadTags } from "@/hooks/useLoadTags";
import { ActionList } from "./_components/ActionList";
import { ActiveDocumentPill } from "./_components/ActiveDocumentPill";
import { HomeSkeleton } from "./_components/HomeSkeleton";
import { HomeStartCard } from "./_components/HomeStartCard";
import { RefundSummaryCard } from "./_components/RefundSummary";
import type { HomeAction } from "./homeStatus.logic";
import { useHomeStatus } from "./useHomeStatus";

export default function Page() {
  const { t } = useLocalization();
  const status = useHomeStatus();
  const canUpload = useCanUploadVerification();
  const setActiveTab = useTagStore((state) => state.setActiveTab);
  const setQuery = useTagStore((state) => state.setQuery);
  const name = useUserStore((state) => state.user?.name);
  const verifyAccount = useVerifyAccount();
  const scan = useQrScanLauncher();
  const uploadSheetRef = useRef<BottomSheetModal>(null);

  const onUploadCommitted = useCallback(() => {
    setActiveTab("verifications");
    router.navigate("/(auth)/tags");
  }, [setActiveTab]);

  /**
   * A row standing for one tag opens it. A row standing for several narrows the
   * tags tab by the statuses behind it — the filter that tab already honours on
   * every load — rather than inventing a second list.
   */
  const onPressAction = useCallback(
    (action: HomeAction) => {
      if (action.kind === "payout") return openCards();
      if (action.kind === "identity") return void verifyAccount();

      if (action.tagCount === 1 && action.tagId) {
        router.push({
          pathname: "/(auth)/tags/[tagId]",
          params: { tagId: action.tagId, tagNumber: action.tagNumber ?? "" },
        });
        return;
      }

      setQuery({ ...useTagStore.getState().query, statuses: action.statuses });
      setActiveTab("tags");
      // `navigate`, not `push`: tags is a sibling tab, so pushing stacks a
      // fresh instance instead of switching to the one that exists.
      router.navigate("/(auth)/tags");
    },
    [setQuery, setActiveTab, verifyAccount],
  );

  const body = () => {
    if (status.isLoading) return <HomeSkeleton />;
    if (status.error && !status.hasTags) {
      return <TagsErrorState onRetry={() => loadTags()} />;
    }
    if (!status.hasTags) return <HomeStartCard onScan={scan.open} />;

    return (
      <View className="gap-4">
        {/* A background refresh can fail while good content is on screen —
            the focus refresh, for one. Keep what the traveller was reading and
            offer a retry rather than replacing it with an error. Same pattern
            as the Cards and Documents screens. */}
        {status.error && (
          <View className="flex-row items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3">
            <Text className="flex-1 text-sm text-amber-900">
              {t("MobileApp.Tags.LoadFailed")}
            </Text>
            <Pressable onPress={() => loadTags()} hitSlop={8}>
              <Text className="text-sm font-semibold text-amber-900">
                {t("MobileApp.Tags.Retry")}
              </Text>
            </Pressable>
          </View>
        )}
        <RefundSummaryCard summary={status.summary} />
        <ActionList actions={status.actions} onPressAction={onPressAction} />
      </View>
    );
  };

  return (
    <TabPage
      title={
        name
          ? t("MobileApp.Home.Greeting", { name })
          : t("MobileApp.Home.Greeting", { name: t("MobileApp.Home.Guest") })
      }
      headerAccessory={<ActiveDocumentPill />}
    >
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerClassName="pb-4"
      >
        {body()}

        {status.hasTags && (
          <Section
            title={t("MobileApp.Tags.LastTag")}
            action={{
              text: t("MobileApp.Tags.ViewAll"),
              onPress: () => router.navigate("/(auth)/tags"),
            }}
          >
            <LatestTag />
          </Section>
        )}

        {/* Shortcuts, deliberately last and deliberately quiet: none of them is
            the traveller's job, and the map used to be the loudest thing here. */}
        {canUpload && (
          <CardAction
            title={t("MobileApp.Verification.Upload.Trigger")}
            description={t("MobileApp.Verification.Upload.ShortcutDescription")}
            icon="camera-outline"
            onPress={() => uploadSheetRef.current?.present()}
          />
        )}
        <CardAction
          title={t("MobileApp.Explore.TaxFreeLocations")}
          description={t("MobileApp.Explore.FindNearbyPlaces")}
          icon="location-outline"
          onPress={() => router.push("/(auth)/explore")}
        />
        <CardAction
          title={t("MobileApp.Cards.Title")}
          description={t("MobileApp.Cards.ShortcutDescription")}
          icon="card-outline"
          onPress={openCards}
        />
      </ScrollView>

      {canUpload && (
        <UploadVerificationSheet
          sheetRef={uploadSheetRef}
          onUploaded={() => undefined}
          onCommitted={onUploadCommitted}
        />
      )}

      {/* The start card's CTA needs a scanner of its own. `useQrScanLauncher`
          holds `visible` in local state, so the instance in `(auth)/_layout.tsx`
          is unreachable from here — calling its `open()` from a second instance
          would flip a flag nothing is watching and the button would do nothing.
          Mounting one here costs nothing while closed: `QrScanner` returns null
          unless `visible`, so no camera exists until it opens. */}
      <QrScanner
        visible={scan.visible}
        onScanned={scan.onScanned}
        onCancel={scan.close}
        title={t("MobileApp.Qr.ScanTitle")}
        subtitle={scan.subtitle}
        onManualEntry={scan.openManualEntry}
        manualEntryLabel={scan.manualEntryLabel}
      />
    </TabPage>
  );
}
```

- [ ] **Step 5: Group the header's title and accessory in `TabPage.tsx`**

Replace the header row (currently three children under `justify-between`, which parks the accessory mid-row):

```tsx
        <View className="flex-row items-start justify-between mb-4">
          {/* Grouped, so the accessory sits under the title instead of floating
              between it and the bell. */}
          <View className="flex-1 gap-1 pr-3">
            <Text className="font-bold text-3xl">{title}</Text>
            {headerAccessory}
          </View>
          <Pressable className="relative pt-1" onPress={openNotifications}>
            <Ionicons name="notifications" size={24} color="#000" />
            {unseenCount > 0 && (
              <View className="absolute -top-1 -right-1 bg-red-500 rounded-full w-5 h-5 items-center justify-center">
                <Text className="text-white text-xs font-bold">
                  {unseenCount}
                </Text>
              </View>
            )}
          </Pressable>
        </View>
```

Also widen `ActiveDocumentPill`'s two containers from `max-w-[45%]` to `self-start` — the pill no longer competes with the title for the same row, and `45%` of the full width was already arbitrary.

- [ ] **Step 6: Re-point the one layout assertion in `HomeUploadEntry.router.test.tsx`**

Three cases stay **exactly** as they are: `omits the upload row from a traveller without the grant`, `opens the upload sheet in place rather than navigating first`, `sends the traveller to the verifications list once the upload commits`.

Replace only the first case. The old body asserted `[TaxFreeLocations, Upload, MyCards]`, an order this redesign changes on purpose; what the commit it came from actually cared about is that the row is on Home and above the other shortcuts.

```tsx
// Home is where a traveller holding a paper receipt starts, so the upload leads
// the shortcut group rather than sitting behind the tags tab's second half.
it("leads the shortcut group with the upload row", () => {
  signInTraveller(true);

  renderHome();

  const order = screen
    .getAllByText(
      new RegExp(
        [
          UPLOAD_TRIGGER.replace(/\./g, "\\."),
          "MobileApp\\.Explore\\.TaxFreeLocations",
          MY_CARDS.replace(/\./g, "\\."),
        ].join("|"),
      ),
    )
    .map((node) => node.props.children);

  expect(order).toEqual([
    UPLOAD_TRIGGER,
    "MobileApp.Explore.TaxFreeLocations",
    MY_CARDS,
  ]);
});
```

Three more edits to the same file, because it was written against the old tree:

1. **Drop** the now-dead `@/screens/shared/_components/Faq` mock — Home no longer imports it.
2. **Add** these mocks, so the suite renders the shortcut group without reaching real network or a real camera:

```tsx
jest.mock("../useHomeStatus", () => ({
  useHomeStatus: () => ({
    summary: { expected: [], received: [], expectedTagCount: 0, notCalculatedCount: 0 },
    actions: [],
    isLoading: false,
    error: null,
    hasTags: true,
  }),
}));
jest.mock("@/screens/traveller/Profile/useVerifyAccount", () => ({
  useVerifyAccount: () => jest.fn(),
}));
jest.mock("@/hooks/useQrScanLauncher", () => ({
  useQrScanLauncher: () => ({
    open: jest.fn(),
    close: jest.fn(),
    onScanned: jest.fn(),
    openManualEntry: jest.fn(),
    visible: false,
    subtitle: "subtitle",
    manualEntryLabel: "manual",
  }),
}));
jest.mock("@/components/QrScanner", () => ({ QrScanner: () => null }));
```

3. Its existing `expo-router` mock provides `push` and `navigate`, and its `beforeEach` already calls `clearTags()` — both stay as they are.

- [ ] **Step 7: Run both Home suites**

Run: `npx jest src/screens/traveller/Home`
Expected: PASS — `StatusHome` (8), `HomeUploadEntry` (4), `ActiveDocumentPill`, `ActionList` (8), `RefundSummary` (7), `useHomeStatus` (4), `homeStatus` (27).

- [ ] **Step 8: Full gate**

```bash
npm run typecheck
npm run lint
npx prettier --write src/screens/traveller/Home src/utils/tagMoney.ts src/utils/__tests__/tagMoney.test.ts src/templates/TabPage.tsx
npm test
```

Expected: typecheck clean; no new lint errors; `npm test` still reports **exactly 6** failing suites, all pre-existing and none under `src/screens/traveller/Home` or `src/utils`.

- [ ] **Step 9: Commit**

```bash
git add src/screens/traveller/Home src/templates/TabPage.tsx
git commit -m "feat(home): rebuild traveller Home around money and deadlines"
```

- [ ] **Step 10: On-device verification**

`super-app` on the SM-A022F is not an expo-dev-client, so the deep link is a no-op — repoint the bundle via the RN Dev Menu's "Change Bundle Location". Never assume the Metro port; several agents' bundlers run at once and `/status` lies. This change is JS-only, so no rebuild is needed.

Check: the no-tags start card; a dated `stamp` row with its tone and day count; tapping a multi-tag row lands on a filtered tags tab; the document pill still opens the switcher from its new position under the greeting; and the upload sheet still opens in place.

---

## Rollback

Every task is its own commit on a branch in a throwaway worktree. To discard the whole thing: `git worktree remove <path>` then `git branch -D <branch>`. Nothing was pushed and the shared `super-app` checkout was never touched.

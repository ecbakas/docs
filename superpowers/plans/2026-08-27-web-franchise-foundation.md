# Franchise Foundation (Sub-project 0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared foundation every franchise screen depends on — host-only nav gating, a server route guard, the fee-bracket editor and its validation, tenant-name resolution, and all 26 franchise server-action wrappers — without adding any franchise route or nav entry.

**Architecture:** Pure logic is extracted into standalone modules under `apps/web/src/utils/` and `apps/web/src/components/` so it can be unit-tested by node's built-in runner with no DOM. `mapNavItem` moves out of the client component into a pure module that takes an injected grant-checker, which is what makes host gating testable. Server-action wrappers are thin, uniform, and follow the repo's existing two conventions exactly: GET actions take `(data, session?)` and *throw* on error; write actions take `(data)` and *return* the error.

**Tech Stack:** Next.js 15 App Router (server components), TypeScript, Zod (`@repo/ayasofyazilim-ui/lib/zod`), react-hook-form, `node:test` + `node:assert/strict`, generated SDK clients from `@repo/saas/*`.

**Spec:** `docs/superpowers/specs/2026-08-27-web-franchise-screens-design.md`

## Global Constraints

- Working directory for every command is `C:\unirefund\web-app\apps\web` unless a step says otherwise. Repo root is `C:\unirefund\web-app`.
- Current branch is `franchise-contract-update`. Commit to it directly; do not create a branch and do not push.
- **Type-check baseline is exactly 2 errors**, both `TS2307` for `@ayasofyazilim-clomerce/capture-core/detectors/mrz` (a private GitHub Packages dependency absent locally). `tsc` exits non-zero because of them. Treat 2 as green; a third error is a regression you introduced.
- **Unit-test baseline is 23 tests / 6 suites, all passing.** Your new tests add to this.
- Run `pnpm run init` before `type-check` in any task that adds an i18n key, or tsc will not see the key.
- Prettier is not a gate. `format:check` fails repo-wide on line endings and cannot distinguish your changes.
- Server-action conventions, copied from existing code — do not deviate:
  - **GET**: signature `(data, session?: Session | null)`, returns `structuredSuccessResponse(...)`, and `throw structuredError(error)` in the catch.
  - **POST / PUT / DELETE**: signature `(data)` with no session, returns `structuredResponse(...)`, and `return structuredError(error)` in the catch.
  - **DELETE** wrappers take a bare `id: string`, not a data object.
- Action file naming differs per service: ContractService uses `action.ts` (**singular**); CRMService and FinanceService use `actions.ts` (plural).
- This sub-project adds **no franchise routes and no nav entries**. It adds the `hostOnly` *mechanism*; each feature sub-project adds its own nav entry with `hostOnly: true` alongside the route that entry points at. Adding entries now would produce 404s.
- Do not enforce a "first bracket must start at zero" rule. The backend does not document one; under-enforcing yields a server-side 400 the user sees, while over-enforcing would block valid input.

---

### Task 1: Fee-bracket contiguity validator

The one piece of genuinely tricky logic in the franchise work. Pure function, no imports, fully testable.

**Files:**
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/contracts/franchise/_components/fee-brackets.ts`
- Test: `apps/web/src/app/[lang]/(main)/(unirefund)/contracts/franchise/_components/fee-brackets.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface FeeBracketRow { minAmount: number; maxAmount?: number | null }`
  - `type FeeBracketIssueCode = "required" | "maxBelowMin" | "notContiguous" | "highestMustBeOpen" | "interiorOpen"`
  - `interface FeeBracketIssue { code: FeeBracketIssueCode; index: number | null }`
  - `function findFeeBracketIssues(rows: readonly FeeBracketRow[], options: { allowEmpty: boolean }): FeeBracketIssue[]`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/app/[lang]/(main)/(unirefund)/contracts/franchise/_components/fee-brackets.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findFeeBracketIssues } from "./fee-brackets";

const row = (minAmount: number, maxAmount?: number | null) => ({
  minAmount,
  maxAmount,
});
const codes = (issues: { code: string }[]) => issues.map((issue) => issue.code);

describe("findFeeBracketIssues", () => {
  it("accepts a single open bracket from zero (the flat deal)", () => {
    assert.deepEqual(
      findFeeBracketIssues([row(0, null)], { allowEmpty: false }),
      []
    );
  });

  it("accepts contiguous brackets with an open highest", () => {
    const rows = [row(0, 100), row(100, 500), row(500, null)];

    assert.deepEqual(findFeeBracketIssues(rows, { allowEmpty: false }), []);
  });

  it("accepts an empty set when the caller allows it", () => {
    assert.deepEqual(findFeeBracketIssues([], { allowEmpty: true }), []);
  });

  it("rejects an empty set when the caller requires a bracket", () => {
    assert.deepEqual(findFeeBracketIssues([], { allowEmpty: false }), [
      { code: "required", index: null },
    ]);
  });

  it("rejects a ceiling that is not above the floor", () => {
    assert.deepEqual(
      findFeeBracketIssues([row(100, 100), row(100, null)], {
        allowEmpty: false,
      }),
      [{ code: "maxBelowMin", index: 0 }]
    );
  });

  it("reports a gap between two brackets against the earlier row", () => {
    const rows = [row(0, 100), row(200, null)];

    assert.deepEqual(findFeeBracketIssues(rows, { allowEmpty: false }), [
      { code: "notContiguous", index: 0 },
    ]);
  });

  it("reports an overlap between two brackets", () => {
    const rows = [row(0, 300), row(200, null)];

    assert.deepEqual(codes(findFeeBracketIssues(rows, { allowEmpty: false })), [
      "notContiguous",
    ]);
  });

  it("rejects a ceiling on the highest bracket", () => {
    const rows = [row(0, 100), row(100, 500)];

    assert.deepEqual(findFeeBracketIssues(rows, { allowEmpty: false }), [
      { code: "highestMustBeOpen", index: 1 },
    ]);
  });

  it("rejects an open bracket that is not the highest", () => {
    const rows = [row(0, null), row(100, null)];

    assert.deepEqual(codes(findFeeBracketIssues(rows, { allowEmpty: false })), [
      "interiorOpen",
    ]);
  });

  it("treats undefined maxAmount the same as null", () => {
    assert.deepEqual(
      findFeeBracketIssues([{ minAmount: 0 }], { allowEmpty: false }),
      []
    );
  });

  it("does not require the first bracket to start at zero", () => {
    assert.deepEqual(
      findFeeBracketIssues([row(50, null)], { allowEmpty: false }),
      []
    );
  });

  it("reports every independent problem in row order", () => {
    // Row 0 ends at 100 but row 1 starts at 200 (gap); row 1's ceiling sits
    // below its floor; row 2 is highest yet carries a ceiling.
    const rows = [row(0, 100), row(200, 150), row(150, 900)];

    assert.deepEqual(codes(findFeeBracketIssues(rows, { allowEmpty: false })), [
      "notContiguous",
      "maxBelowMin",
      "highestMustBeOpen",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/app/[lang]/(main)/(unirefund)/contracts/franchise/_components/fee-brackets.test.ts`
Expected: FAIL — cannot find module `./fee-brackets`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/app/[lang]/(main)/(unirefund)/contracts/franchise/_components/fee-brackets.ts`:

```ts
export interface FeeBracketRow {
  minAmount: number;
  maxAmount?: number | null;
}

export type FeeBracketIssueCode =
  | "required"
  | "maxBelowMin"
  | "notContiguous"
  | "highestMustBeOpen"
  | "interiorOpen";

export interface FeeBracketIssue {
  code: FeeBracketIssueCode;
  /** Row the problem attaches to, or null when it is about the whole set. */
  index: number | null;
}

const hasCeiling = (row: FeeBracketRow) =>
  row.maxAmount !== null && row.maxAmount !== undefined;

/**
 * Rows are validated in the order given; the caller owns ordering. An
 * out-of-order set surfaces as `notContiguous`, which is accurate.
 */
export function findFeeBracketIssues(
  rows: readonly FeeBracketRow[],
  options: { allowEmpty: boolean }
): FeeBracketIssue[] {
  if (rows.length === 0) {
    return options.allowEmpty ? [] : [{ code: "required", index: null }];
  }

  const issues: FeeBracketIssue[] = [];

  rows.forEach((row, index) => {
    const isHighest = index === rows.length - 1;

    if (hasCeiling(row) && row.maxAmount! <= row.minAmount) {
      issues.push({ code: "maxBelowMin", index });
    }

    if (!isHighest) {
      if (!hasCeiling(row)) {
        issues.push({ code: "interiorOpen", index });
      } else if (row.maxAmount !== rows[index + 1]!.minAmount) {
        issues.push({ code: "notContiguous", index });
      }
    } else if (hasCeiling(row)) {
      issues.push({ code: "highestMustBeOpen", index });
    }
  });

  return issues;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/app/[lang]/(main)/(unirefund)/contracts/franchise/_components/fee-brackets.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Confirm the whole unit suite still passes**

Run: `npm run test:unit`
Expected: 35 tests pass (23 baseline + 12 new), 0 fail.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/[lang]/(main)/(unirefund)/contracts/franchise/_components/fee-brackets.ts apps/web/src/app/[lang]/(main)/(unirefund)/contracts/franchise/_components/fee-brackets.test.ts
git commit -m "feat(franchise): add fee-bracket contiguity validator"
```

---

### Task 2: Zod schema factories for both contract families

**Files:**
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/contracts/franchise/_components/schemas.ts`
- Test: `apps/web/src/app/[lang]/(main)/(unirefund)/contracts/franchise/_components/schemas.test.ts`

**Interfaces:**
- Consumes: `findFeeBracketIssues`, `FeeBracketRow`, `FeeBracketIssue` from `./fee-brackets` (Task 1).
- Produces:
  - `function feeBracketMessages(languageData?: Partial<Record<string, string>>): Record<FeeBracketIssueCode, string>`
  - `function refineFeeBrackets(options: { allowEmpty: boolean; languageData?: Partial<Record<string, string>> }): (rows: FeeBracketRow[] | null | undefined, ctx: { addIssue: (issue: { code: "custom"; message: string; path: (string | number)[] }) => void }) => void`
  - `function createFranchiseContractFormSchemas(args: { languageData?: Partial<Record<string, string>> }): { createFormSchema: ZodType; updateFormSchema: ZodType }`
  - `function createFranchiseHqContractFormSchemas(args: { languageData?: Partial<Record<string, string>> }): { createFormSchema: ZodType; updateFormSchema: ZodType }`

Track A (`createFranchiseContractFormSchemas`) allows an empty bracket set; Track B (`createFranchiseHqContractFormSchemas`) requires at least one.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/app/[lang]/(main)/(unirefund)/contracts/franchise/_components/schemas.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createFranchiseContractFormSchemas,
  createFranchiseHqContractFormSchemas,
} from "./schemas";

const bracket = (minAmount: number, maxAmount?: number | null) => ({
  minAmount,
  maxAmount,
  fixedFeeValue: 0,
  percentFeeValue: 1,
});

const trackA = () => createFranchiseContractFormSchemas({}).createFormSchema;
const trackB = () => createFranchiseHqContractFormSchemas({}).createFormSchema;

const validTrackA = {
  franchiseTenantId: "8f1b7d54-0000-4000-8000-000000000001",
  name: "Türkiye franchise fee",
  validFrom: "2026-01-01T00:00:00.000Z",
  validTo: "2026-12-31T00:00:00.000Z",
  currency: "TRY",
  calculationPeriod: "Monthly",
  feeBase: "VatAmount",
  fixedFeeValue: 0,
  percentFeeValue: 2,
  tiers: [],
};

const validTrackB = {
  franchiseHqId: "8f1b7d54-0000-4000-8000-000000000002",
  countryTenantId: "8f1b7d54-0000-4000-8000-000000000003",
  name: "Global brand TR",
  validFrom: "2026-01-01T00:00:00.000Z",
  validTo: "2026-12-31T00:00:00.000Z",
  currency: "TRY",
  minimumMonthlyCommission: 500,
  brackets: [bracket(0, null)],
};

describe("createFranchiseContractFormSchemas", () => {
  it("accepts an empty tier set, which means flat-rate", () => {
    assert.equal(trackA().safeParse(validTrackA).success, true);
  });

  it("accepts contiguous tiers with an open highest", () => {
    const result = trackA().safeParse({
      ...validTrackA,
      tiers: [bracket(0, 1000), bracket(1000, null)],
    });

    assert.equal(result.success, true);
  });

  it("rejects a tier set whose highest bracket has a ceiling", () => {
    const result = trackA().safeParse({
      ...validTrackA,
      tiers: [bracket(0, 1000)],
    });

    assert.equal(result.success, false);
  });

  it("rejects a percent fee above 100", () => {
    const result = trackA().safeParse({
      ...validTrackA,
      percentFeeValue: 101,
    });

    assert.equal(result.success, false);
  });
});

describe("createFranchiseHqContractFormSchemas", () => {
  it("accepts a single open bracket from zero", () => {
    assert.equal(trackB().safeParse(validTrackB).success, true);
  });

  it("rejects an empty bracket set", () => {
    const result = trackB().safeParse({ ...validTrackB, brackets: [] });

    assert.equal(result.success, false);
  });

  it("attaches a gap error to the offending bracket row", () => {
    const result = trackB().safeParse({
      ...validTrackB,
      brackets: [bracket(0, 100), bracket(200, null)],
    });

    assert.equal(result.success, false);
    if (result.success) return;
    const paths = result.error.issues.map((issue) => issue.path.join("."));
    assert.ok(
      paths.some((path) => path === "brackets.0"),
      `expected an issue on brackets.0, got ${JSON.stringify(paths)}`
    );
  });

  it("omits HQ, country and currency from the update schema", () => {
    const { updateFormSchema } = createFranchiseHqContractFormSchemas({});
    const result = updateFormSchema.safeParse({
      name: "Global brand TR",
      validFrom: "2026-01-01T00:00:00.000Z",
      validTo: "2026-12-31T00:00:00.000Z",
      minimumMonthlyCommission: 500,
      brackets: [bracket(0, null)],
    });

    assert.equal(result.success, true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/app/[lang]/(main)/(unirefund)/contracts/franchise/_components/schemas.test.ts`
Expected: FAIL — cannot find module `./schemas`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/app/[lang]/(main)/(unirefund)/contracts/franchise/_components/schemas.ts`:

```ts
import { z } from "@repo/ayasofyazilim-ui/lib/zod";
import {
  findFeeBracketIssues,
  type FeeBracketIssueCode,
  type FeeBracketRow,
} from "./fee-brackets";

type Resources = Partial<Record<string, string>>;

const FALLBACKS: Record<FeeBracketIssueCode, string> = {
  required: "Add at least one bracket.",
  maxBelowMin: "The upper bound must be above the lower bound.",
  notContiguous:
    "Brackets must be contiguous: each one must start where the previous ends.",
  highestMustBeOpen: "The highest bracket must have no upper limit.",
  interiorOpen: "Only the highest bracket may have no upper limit.",
};

const KEYS: Record<FeeBracketIssueCode, string> = {
  required: "Franchise.Brackets.Error.required",
  maxBelowMin: "Franchise.Brackets.Error.maxBelowMin",
  notContiguous: "Franchise.Brackets.Error.notContiguous",
  highestMustBeOpen: "Franchise.Brackets.Error.highestMustBeOpen",
  interiorOpen: "Franchise.Brackets.Error.interiorOpen",
};

export function feeBracketMessages(
  languageData?: Resources
): Record<FeeBracketIssueCode, string> {
  const entries = Object.keys(FALLBACKS) as FeeBracketIssueCode[];
  return entries.reduce(
    (acc, code) => {
      acc[code] = languageData?.[KEYS[code]] ?? FALLBACKS[code];
      return acc;
    },
    {} as Record<FeeBracketIssueCode, string>
  );
}

interface RefineCtx {
  addIssue: (issue: {
    code: "custom";
    message: string;
    path: (string | number)[];
  }) => void;
}

export function refineFeeBrackets(options: {
  allowEmpty: boolean;
  languageData?: Resources;
}) {
  const messages = feeBracketMessages(options.languageData);

  return (rows: FeeBracketRow[] | null | undefined, ctx: RefineCtx) => {
    for (const issue of findFeeBracketIssues(rows ?? [], {
      allowEmpty: options.allowEmpty,
    })) {
      ctx.addIssue({
        code: "custom",
        message: messages[issue.code],
        path: issue.index === null ? [] : [issue.index],
      });
    }
  };
}

const bracketRow = z.object({
  id: z.string().nullable().optional(),
  minAmount: z.coerce.number().min(0),
  maxAmount: z.coerce.number().nullable().optional(),
  fixedFeeValue: z.coerce.number().min(0),
  percentFeeValue: z.coerce.number().min(0).max(100),
});

const validityWindow = {
  name: z.string().min(2).max(128),
  validFrom: z.string(),
  validTo: z.string(),
};

export function createFranchiseContractFormSchemas({
  languageData,
}: {
  languageData?: Resources;
}) {
  const tiers = z
    .array(bracketRow)
    .nullable()
    .optional()
    .superRefine(refineFeeBrackets({ allowEmpty: true, languageData }));

  const terms = {
    ...validityWindow,
    currency: z.string().length(3),
    calculationPeriod: z.enum(["Monthly", "Quarterly", "Yearly"]),
    feeBase: z.enum(["VatAmount", "SalesAmount", "GrossRefundAmount"]),
    fixedFeeValue: z.coerce.number().min(0),
    percentFeeValue: z.coerce.number().min(0).max(100),
    tiers,
  };

  return {
    createFormSchema: z.object({
      franchiseTenantId: z.guid(),
      ...terms,
    }),
    updateFormSchema: z.object(terms),
  };
}

export function createFranchiseHqContractFormSchemas({
  languageData,
}: {
  languageData?: Resources;
}) {
  const brackets = z
    .array(bracketRow)
    .superRefine(refineFeeBrackets({ allowEmpty: false, languageData }));

  const editableTerms = {
    ...validityWindow,
    minimumMonthlyCommission: z.coerce.number().min(0).optional(),
    brackets,
  };

  return {
    // HQ, country and currency are create-only: a statement stores amounts in
    // the contract's currency, so changing any of them would retell what
    // existing statements meant.
    createFormSchema: z.object({
      franchiseHqId: z.guid(),
      countryTenantId: z.guid(),
      currency: z.string().length(3),
      ...editableTerms,
    }),
    updateFormSchema: z.object(editableTerms),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/app/[lang]/(main)/(unirefund)/contracts/franchise/_components/schemas.test.ts`
Expected: PASS, 8 tests.

If `z.guid()` is unavailable in this Zod version, use `z.string().uuid()` and re-run. Confirm which exists with:
`grep -rn "z.guid()\|z.string().uuid()" src | head -5`

- [ ] **Step 5: Run the whole unit suite**

Run: `npm run test:unit`
Expected: 43 tests pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/[lang]/(main)/(unirefund)/contracts/franchise/_components/schemas.ts apps/web/src/app/[lang]/(main)/(unirefund)/contracts/franchise/_components/schemas.test.ts
git commit -m "feat(franchise): add contract form schemas with bracket validation"
```

---

### Task 3: Host-only nav gating

Extracts `mapNavItem` from the client component into a pure module so it can be tested, and adds the `hostOnly` mechanism. No nav entries are added.

**Files:**
- Create: `apps/web/src/components/sidebar-layout/map-nav-item.ts`
- Test: `apps/web/src/components/sidebar-layout/map-nav-item.test.ts`
- Modify: `apps/web/src/components/sidebar-layout/data.ts` (add `hostOnly?` to `NavItem` and `NavItemAction`)
- Modify: `apps/web/src/components/sidebar-layout/sidebar-layout.tsx` (delete the local `mapNavItem`, import the new one, pass `isHost`)

**Interfaces:**
- Consumes: `NavItem`, `NavItemAction` types from `./data`; `AbpUiNavigationResource`.
- Produces: `function mapNavItem(navItem: NavItem, languageData: AbpUiNavigationResource, ctx: { isGranted: (policies: Policy[]) => boolean; isHost: boolean }): NavItem | null`

The injected `isGranted` is what keeps this module free of `@repo/utils/policies` at runtime, so the node test needs no React.

- [ ] **Step 1: Add `hostOnly` to the nav types**

In `apps/web/src/components/sidebar-layout/data.ts`, add the field to both types. `NavItemAction` currently ends with `icon?: IconName;` and `NavItem` with `badge?: NavItemBadge;`:

```ts
export type NavItemAction = {
  key: string;
  displayName: keyof AbpUiNavigationResource;
  description: keyof AbpUiNavigationResource;
  href?: string;
  policies?: Policy[];
  icon?: IconName;
  /** Hidden unless the session is host (no tenant selected). */
  hostOnly?: boolean;
};
```

```ts
export type NavItem = {
  key: string;
  displayName: keyof AbpUiNavigationResource;
  href?: string;
  icon?: IconName;
  items?: NavItem[];
  policies?: Policy[];
  split?: "top" | "bottom";
  actions?: NavItemAction[];
  badge?: NavItemBadge;
  /** Hidden unless the session is host (no tenant selected). */
  hostOnly?: boolean;
};
```

- [ ] **Step 2: Write the failing test**

Create `apps/web/src/components/sidebar-layout/map-nav-item.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NavItem } from "./data";
import { mapNavItem } from "./map-nav-item";

// mapNavItem only ever reads languageData[displayName], so an identity-ish
// stand-in is enough and keeps the test free of the real resource file.
const languageData = new Proxy(
  {},
  { get: (_target, key) => String(key) }
) as never;

const host = { isGranted: () => true, isHost: true };
const tenant = { isGranted: () => true, isHost: false };
const denied = { isGranted: () => false, isHost: true };

const leaf = (over: Partial<NavItem> = {}): NavItem =>
  ({
    key: "finance/thing",
    displayName: "Thing",
    href: "finance/thing",
    ...over,
  }) as NavItem;

describe("mapNavItem", () => {
  it("keeps an ungated item for a tenant session", () => {
    assert.notEqual(mapNavItem(leaf(), languageData, tenant), null);
  });

  it("keeps a hostOnly item for a host session", () => {
    assert.notEqual(
      mapNavItem(leaf({ hostOnly: true }), languageData, host),
      null
    );
  });

  it("hides a hostOnly item from a tenant session", () => {
    assert.equal(
      mapNavItem(leaf({ hostOnly: true }), languageData, tenant),
      null
    );
  });

  it("still hides an item whose policy is not granted", () => {
    assert.equal(
      mapNavItem(leaf({ policies: ["X" as never] }), languageData, denied),
      null
    );
  });

  it("hides a hostOnly group by dropping its only visible child", () => {
    const group: NavItem = {
      key: "contracts",
      displayName: "Contracts",
      items: [leaf({ hostOnly: true })],
    } as NavItem;

    assert.equal(mapNavItem(group, languageData, tenant), null);
  });

  it("keeps a group whose children survive", () => {
    const group: NavItem = {
      key: "contracts",
      displayName: "Contracts",
      items: [leaf({ hostOnly: true })],
    } as NavItem;

    const result = mapNavItem(group, languageData, host);
    assert.equal(result?.items?.length, 1);
  });

  it("filters a hostOnly action out for a tenant session", () => {
    const withAction = leaf({
      actions: [
        {
          key: "finance/thing/new",
          displayName: "Thing.New",
          description: "Thing.New",
          href: "finance/thing/new",
          hostOnly: true,
        } as never,
      ],
    });

    assert.equal(mapNavItem(withAction, languageData, tenant)?.actions?.length, 0);
  });

  it("drops an item that ends up with no href, no actions and no children", () => {
    const group: NavItem = {
      key: "empty",
      displayName: "Empty",
      items: [],
    } as NavItem;

    assert.equal(mapNavItem(group, languageData, host), null);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --import tsx --test src/components/sidebar-layout/map-nav-item.test.ts`
Expected: FAIL — cannot find module `./map-nav-item`.

- [ ] **Step 4: Create the pure module**

Create `apps/web/src/components/sidebar-layout/map-nav-item.ts`. This is the existing logic from `sidebar-layout.tsx` with the grant check injected and two `hostOnly` conditions added:

```ts
import type { AbpUiNavigationResource } from "@/language-data/core/AbpUiNavigation";
import type { Policy } from "@repo/utils/policies";
import type { NavItem } from "./data";

interface NavContext {
  isGranted: (policies: Policy[]) => boolean;
  /** True when no tenant is selected. */
  isHost: boolean;
}

export function mapNavItem(
  navItem: NavItem,
  languageData: AbpUiNavigationResource,
  ctx: NavContext
): NavItem | null {
  if (navItem.hostOnly && !ctx.isHost) {
    return null;
  }

  if (navItem.policies && !ctx.isGranted(navItem.policies)) {
    return null;
  }

  const filteredActions = navItem.actions
    ?.map((action) => ({
      ...action,
      displayName: languageData[
        action.displayName
      ] as keyof AbpUiNavigationResource,
      description: languageData[
        action.description
      ] as keyof AbpUiNavigationResource,
    }))
    .filter(
      (action) =>
        (!action.hostOnly || ctx.isHost) &&
        (!action.policies || ctx.isGranted(action.policies))
    );

  const filteredItems = navItem.items
    ?.map((subItem) => mapNavItem(subItem, languageData, ctx))
    .filter((item): item is NavItem => item !== null);

  const hasHref = !!navItem.href;
  const hasActions = (filteredActions?.length ?? 0) > 0;
  const hasVisibleChildren = (filteredItems?.length ?? 0) > 0;

  if (!hasHref && !hasActions && !hasVisibleChildren) {
    return null;
  }

  return {
    ...navItem,
    displayName: languageData[
      navItem.displayName
    ] as keyof AbpUiNavigationResource,
    items: filteredItems,
    actions: filteredActions,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --import tsx --test src/components/sidebar-layout/map-nav-item.test.ts`
Expected: PASS, 8 tests.

Note the `hides a hostOnly group by dropping its only visible child` case: the group itself has no `hostOnly` flag, so it survives its own check but is then dropped by the structural validation because every child was filtered out. That is the behaviour a feature sub-project relies on when it marks only the leaf entries.

- [ ] **Step 6: Rewire the client component**

In `apps/web/src/components/sidebar-layout/sidebar-layout.tsx`:

1. Delete the whole local `function mapNavItem(...)` block — it spans lines 26-75, opening at `function mapNavItem(` and closing at the `}` on line 75, immediately before the `export default function SidebarLayout` block.
2. Add these imports beside the existing ones:

```ts
import { useTenant } from "@/providers/tenant";
import { mapNavItem } from "./map-nav-item";
```

3. Where `grantedPolicies` is read (around line 87), derive `isHost` and update the call site. The existing call is `mapNavItem(item, languageData, grantedPolicies)`; it becomes:

```ts
const { grantedPolicies } = useGrantedPolicies();
const { tenantId } = useTenant();
const isHost = !tenantId;
```

```ts
mapNavItem(item, languageData, {
  isGranted: (policies) => isActionGranted(policies, grantedPolicies),
  isHost,
});
```

4. Remove the now-unused `Policies` type import if `tsc` reports it as unused.

- [ ] **Step 7: Verify types and lint**

Run: `npm run type-check`
Expected: exactly the 2 baseline `TS2307` mrz errors, nothing else.

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 8: Run the whole unit suite**

Run: `npm run test:unit`
Expected: 51 tests pass, 0 fail.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/components/sidebar-layout/
git commit -m "feat(franchise): add host-only nav gating and extract mapNavItem"
```

---

### Task 4: requireHost() server guard

**Files:**
- Create: `apps/web/src/utils/require-host.ts`
- Test: `apps/web/src/utils/require-host.test.ts`

**Interfaces:**
- Consumes: `getInfoForCurrentTenantApi` from `@repo/actions/unirefund/AdministrationService/actions`; `auth` from `@repo/utils/auth/next-auth`; `redirect` from `next/navigation`.
- Produces:
  - `function isHostTenant(tenantId: string | null | undefined): boolean`
  - `async function requireHost(lang: string): Promise<void>`

Only `isHostTenant` is unit-tested; `requireHost` is a thin async wrapper whose gate is `type-check` plus the manual check in Step 5.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/utils/require-host.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isHostTenant } from "./require-host";

describe("isHostTenant", () => {
  it("treats a null tenantId as host", () => {
    assert.equal(isHostTenant(null), true);
  });

  it("treats an absent tenantId as host", () => {
    assert.equal(isHostTenant(undefined), true);
  });

  it("treats an empty string as host, because the login form sends one", () => {
    assert.equal(isHostTenant(""), true);
  });

  it("treats a real tenant id as not host", () => {
    assert.equal(isHostTenant("8f1b7d54-0000-4000-8000-000000000001"), false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/utils/require-host.test.ts`
Expected: FAIL — cannot find module `./require-host`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/utils/require-host.ts`:

```ts
import { getInfoForCurrentTenantApi } from "@repo/actions/unirefund/AdministrationService/actions";
import { auth } from "@repo/utils/auth/next-auth";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";

/**
 * CountrySettingInfoDto.tenantId is nullable and is null for the host, which is
 * the same signal the sidebar already uses to render "Platform".
 */
export function isHostTenant(tenantId: string | null | undefined): boolean {
  return !tenantId;
}

/**
 * Redirects away from a host-only area when a tenant is selected. Fails closed:
 * if the tenant lookup errors we redirect rather than assume host.
 */
export async function requireHost(lang: string): Promise<void> {
  const session = await auth();

  let tenantId: string | null | undefined;
  try {
    const response = await getInfoForCurrentTenantApi(session);
    tenantId = response.data.tenantId;
  } catch (error) {
    if (isRedirectError(error)) throw error;
    redirect(`/${lang}/unauthorized`);
  }

  if (!isHostTenant(tenantId)) {
    redirect(`/${lang}/unauthorized`);
  }
}
```

- [ ] **Step 4: Run test and type-check**

Run: `node --import tsx --test src/utils/require-host.test.ts`
Expected: PASS, 4 tests.

Run: `npm run type-check`
Expected: exactly the 2 baseline errors.

- [ ] **Step 5: Prove the guard works against a running app**

No franchise route exists yet, so verify against a temporary throwaway route.

1. Create `apps/web/src/app/[lang]/(main)/(unirefund)/host-probe/page.tsx`:

```tsx
import { requireHost } from "@/utils/require-host";

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  await requireHost(lang);
  return <div data-testid="host-probe">host only</div>;
}
```

2. Run `npm run dev` and visit `/en/host-probe` twice: once logged in with **no** tenant selected, once with a tenant selected.
3. Expected: host session renders `host only`; tenant session lands on `/en/unauthorized`.
4. **Delete the probe route** — `rm -r "src/app/[lang]/(main)/(unirefund)/host-probe"` — and confirm it is gone with `git status`.

Record the observed result in the commit message. If the tenant session is *not* redirected, stop and report: the `tenantId` field is not behaving as the schema says, and the spec's gating section needs revisiting.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/utils/require-host.ts apps/web/src/utils/require-host.test.ts
git commit -m "feat(franchise): add requireHost server guard

Verified manually: host session renders, tenant session redirects to
/unauthorized. Probe route removed."
```

---

### Task 5: resolveTenantNames() helper

The backend refuses to resolve tenant display names (`ContractService has no SaaS integration`), so franchise tables join them client-side.

**Files:**
- Create: `apps/web/src/utils/resolve-tenant-names.ts`
- Test: `apps/web/src/utils/resolve-tenant-names.test.ts`

**Interfaces:**
- Consumes: `getPublicTenantsApi` from `@repo/actions/core/SaasService/actions`.
- Produces:
  - `interface TenantNameSource { id?: string | null; name?: string | null }`
  - `function toTenantNameMap(tenants: readonly TenantNameSource[] | null | undefined): Map<string, string>`
  - `async function resolveTenantNames(): Promise<Map<string, string>>`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/utils/resolve-tenant-names.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toTenantNameMap } from "./resolve-tenant-names";

describe("toTenantNameMap", () => {
  it("maps id to name", () => {
    const map = toTenantNameMap([
      { id: "a", name: "Türkiye" },
      { id: "b", name: "Germany" },
    ]);

    assert.equal(map.get("a"), "Türkiye");
    assert.equal(map.get("b"), "Germany");
  });

  it("returns an empty map for nullish input", () => {
    assert.equal(toTenantNameMap(undefined).size, 0);
    assert.equal(toTenantNameMap(null).size, 0);
  });

  it("skips entries with no id", () => {
    const map = toTenantNameMap([{ id: null, name: "Nowhere" }]);

    assert.equal(map.size, 0);
  });

  it("skips entries with no name, so a caller can fall back to the raw id", () => {
    const map = toTenantNameMap([{ id: "a", name: null }]);

    assert.equal(map.has("a"), false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/utils/resolve-tenant-names.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/utils/resolve-tenant-names.ts`:

```ts
import { getPublicTenantsApi } from "@repo/actions/core/SaasService/actions";

export interface TenantNameSource {
  id?: string | null;
  name?: string | null;
}

export function toTenantNameMap(
  tenants: readonly TenantNameSource[] | null | undefined
): Map<string, string> {
  const map = new Map<string, string>();
  for (const tenant of tenants ?? []) {
    if (tenant.id && tenant.name) {
      map.set(tenant.id, tenant.name);
    }
  }
  return map;
}

/**
 * Franchise DTOs carry a bare tenant id the backend will not resolve. Call this
 * inside a page's getApiRequests block and hand the map to the client table.
 * Returns an empty map on failure: a missing display name degrades to showing
 * the raw id, which must not take the page down.
 */
export async function resolveTenantNames(): Promise<Map<string, string>> {
  const response = await getPublicTenantsApi();
  if (response.type !== "success") {
    return new Map();
  }
  return toTenantNameMap(response.data.items);
}
```

Both details above were verified during execution against primary sources, correcting an earlier revision of this plan:

- `getPublicTenantsApi` returns `structuredResponse(...)`, and `structuredResponse` yields `{type:"success", data, message:""}` while `structuredError` yields `{type:"api-error", ...}`. So `response.type !== "success"` is the correct, exhaustive failure check.
- The payload is **wrapped**: `GetApiSaasPublicTenantsResponse = ListResultDto_TenantPublicDto = { items?: Array<TenantPublicDto> | null }`. It is therefore `response.data.items`, not `response.data` — an earlier revision said the latter, which would not have type-checked at all. The same idiom already appears at `apps/web/src/app/[lang]/(auth)/login/page.tsx:17`.

- [ ] **Step 4: Run test and type-check**

Run: `node --import tsx --test src/utils/resolve-tenant-names.test.ts`
Expected: PASS, 4 tests.

Run: `npm run type-check`
Expected: exactly the 2 baseline errors.

- [ ] **Step 5: Run the whole unit suite**

Run: `npm run test:unit`
Expected: 59 tests pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/utils/resolve-tenant-names.ts apps/web/src/utils/resolve-tenant-names.test.ts
git commit -m "feat(franchise): add tenant-name resolution helper"
```

---

### Task 6: i18n keys for the bracket editor

Must land before Task 7, which consumes these keys.

**Files:**
- Modify: `apps/web/src/language-data/unirefund/ContractService/resources/en.json`
- Modify: `apps/web/src/language-data/unirefund/ContractService/resources/tr.json`

The resource type is `typeof en`, so a key must exist in `en.json` to be typed. Add to both files; keep the key sets identical.

- [ ] **Step 1: Add the English keys**

Append to `apps/web/src/language-data/unirefund/ContractService/resources/en.json` (flat dotted keys, matching the existing `Contracts.*` style):

```json
{
  "Franchise.Brackets.title": "Fee brackets",
  "Franchise.Brackets.minAmount": "From",
  "Franchise.Brackets.maxAmount": "To",
  "Franchise.Brackets.fixedFeeValue": "Fixed fee",
  "Franchise.Brackets.percentFeeValue": "Percent fee (%)",
  "Franchise.Brackets.add": "Add bracket",
  "Franchise.Brackets.remove": "Remove bracket",
  "Franchise.Brackets.noCeiling": "No upper limit",
  "Franchise.Brackets.flatRate": "No brackets — this contract bills at its flat rate.",
  "Franchise.Brackets.Error.required": "Add at least one bracket.",
  "Franchise.Brackets.Error.maxBelowMin": "The upper bound must be above the lower bound.",
  "Franchise.Brackets.Error.notContiguous": "Brackets must be contiguous: each one must start where the previous one ends.",
  "Franchise.Brackets.Error.highestMustBeOpen": "The highest bracket must have no upper limit.",
  "Franchise.Brackets.Error.interiorOpen": "Only the highest bracket may have no upper limit."
}
```

- [ ] **Step 2: Add the matching Turkish keys**

Append the same keys to `apps/web/src/language-data/unirefund/ContractService/resources/tr.json`:

```json
{
  "Franchise.Brackets.title": "Ücret dilimleri",
  "Franchise.Brackets.minAmount": "Başlangıç",
  "Franchise.Brackets.maxAmount": "Bitiş",
  "Franchise.Brackets.fixedFeeValue": "Sabit ücret",
  "Franchise.Brackets.percentFeeValue": "Yüzde ücret (%)",
  "Franchise.Brackets.add": "Dilim ekle",
  "Franchise.Brackets.remove": "Dilimi kaldır",
  "Franchise.Brackets.noCeiling": "Üst sınır yok",
  "Franchise.Brackets.flatRate": "Dilim yok — bu sözleşme sabit oranla faturalanır.",
  "Franchise.Brackets.Error.required": "En az bir dilim ekleyin.",
  "Franchise.Brackets.Error.maxBelowMin": "Üst sınır, alt sınırdan büyük olmalıdır.",
  "Franchise.Brackets.Error.notContiguous": "Dilimler kesintisiz olmalıdır: her dilim, öncekinin bittiği yerde başlamalıdır.",
  "Franchise.Brackets.Error.highestMustBeOpen": "En üst dilimin üst sınırı olmamalıdır.",
  "Franchise.Brackets.Error.interiorOpen": "Yalnızca en üst dilimin üst sınırı olmayabilir."
}
```

- [ ] **Step 3: Regenerate and verify the keys are visible to tsc**

Run: `pnpm run init`
Then: `npm run type-check`
Expected: exactly the 2 baseline errors.

- [ ] **Step 4: Check for missing-key drift**

Run (from repo root `C:\unirefund\web-app`): `pnpm run i18n:missing`
Expected: no franchise keys reported missing. Pre-existing findings unrelated to `Franchise.*` are not your regression — note them and move on.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/language-data/unirefund/ContractService/resources/
git commit -m "feat(franchise): add i18n keys for the fee-bracket editor"
```

---

### Task 7: FeeBracketsTable component

**Files:**
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/contracts/franchise/_components/fee-brackets-table.tsx`
- Modify: none

**Interfaces:**
- Consumes: `refineFeeBrackets` / the schema factories from `./schemas` (Task 2) via the parent form; i18n keys from Task 6.
- Produces: `function FeeBracketsTable(props: { name: "tiers" | "brackets"; languageData: ContractServiceResource; isPending: boolean }): JSX.Element`

The component is bound to whichever field array the parent form names, so one component serves Track A `tiers` and Track B `brackets`. Its gate is `type-check` and `lint`; the logic it enforces is already unit-tested in Tasks 1 and 2.

- [ ] **Step 1: Create the component**

Mirror `settings/templates/rebate-tables/_components/rebate-table-details.tsx`. Read that file first for the exact import paths and table markup, then create `apps/web/src/app/[lang]/(main)/(unirefund)/contracts/franchise/_components/fee-brackets-table.tsx`:

```tsx
"use client";
"use no memo";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
  useFieldArray,
  useFormContext,
} from "@repo/ayasofyazilim-ui/components/form";
import { Input } from "@repo/ayasofyazilim-ui/components/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ayasofyazilim-ui/components/table";
import { Plus, Trash2 } from "lucide-react";
import type { ContractServiceResource } from "@/language-data/unirefund/ContractService";

export function FeeBracketsTable({
  name,
  languageData,
  isPending,
}: {
  name: "tiers" | "brackets";
  languageData: ContractServiceResource;
  isPending: boolean;
}) {
  const { control } = useFormContext();
  const { fields, append, remove } = useFieldArray({ control, name });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {languageData["Franchise.Brackets.title"]}
        </span>
        <Button
          data-testid="fee-bracket-add"
          disabled={isPending}
          onClick={() => {
            append({
              minAmount: 0,
              maxAmount: null,
              fixedFeeValue: 0,
              percentFeeValue: 0,
            });
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus className="size-4" />
          {languageData["Franchise.Brackets.add"]}
        </Button>
      </div>

      {fields.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {languageData["Franchise.Brackets.flatRate"]}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                {languageData["Franchise.Brackets.minAmount"]}
              </TableHead>
              <TableHead>
                {languageData["Franchise.Brackets.maxAmount"]}
              </TableHead>
              <TableHead>
                {languageData["Franchise.Brackets.fixedFeeValue"]}
              </TableHead>
              <TableHead>
                {languageData["Franchise.Brackets.percentFeeValue"]}
              </TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((field, index) => (
              <TableRow key={field.id}>
                <TableCell>
                  <FormField
                    control={control}
                    name={`${name}.${index}.minAmount`}
                    render={({ field: input }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            {...input}
                            data-testid={`fee-bracket-${index}-min`}
                            disabled={isPending}
                            type="number"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TableCell>
                <TableCell>
                  <FormField
                    control={control}
                    name={`${name}.${index}.maxAmount`}
                    render={({ field: input }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            {...input}
                            data-testid={`fee-bracket-${index}-max`}
                            disabled={isPending}
                            onChange={(event) => {
                              // An empty ceiling means "no upper limit", which
                              // the backend requires on the highest bracket.
                              input.onChange(
                                event.target.value === ""
                                  ? null
                                  : event.target.value
                              );
                            }}
                            placeholder={
                              languageData["Franchise.Brackets.noCeiling"]
                            }
                            type="number"
                            value={input.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TableCell>
                <TableCell>
                  <FormField
                    control={control}
                    name={`${name}.${index}.fixedFeeValue`}
                    render={({ field: input }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            {...input}
                            data-testid={`fee-bracket-${index}-fixed`}
                            disabled={isPending}
                            type="number"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TableCell>
                <TableCell>
                  <FormField
                    control={control}
                    name={`${name}.${index}.percentFeeValue`}
                    render={({ field: input }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            {...input}
                            data-testid={`fee-bracket-${index}-percent`}
                            disabled={isPending}
                            type="number"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    data-testid={`fee-bracket-${index}-remove`}
                    disabled={isPending}
                    onClick={() => {
                      remove(index);
                    }}
                    size="icon"
                    title={languageData["Franchise.Brackets.remove"]}
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <FormField
        control={control}
        name={name}
        render={() => (
          <FormItem>
            <FormMessage data-testid="fee-bracket-set-error" />
          </FormItem>
        )}
      />
    </div>
  );
}
```

The trailing `FormField` bound to the array itself is what surfaces set-level errors (`required`, and any issue `refineFeeBrackets` reports with an empty path).

- [ ] **Step 2: Verify types and lint**

Run: `npm run type-check`
Expected: exactly the 2 baseline errors.

Run: `npm run lint`
Expected: no new errors. If `useFieldArray` or `useFormContext` is not re-exported from `@repo/ayasofyazilim-ui/components/form`, confirm the real source with:
`grep -n "useFieldArray\|useFormContext" packages/ayasofyazilim-ui/src/components/form/index.ts* 2>/dev/null || grep -rn "useFieldArray" packages/ayasofyazilim-ui/src/components/form | head -3`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/[lang]/(main)/(unirefund)/contracts/franchise/_components/fee-brackets-table.tsx
git commit -m "feat(franchise): add shared fee-brackets table editor"
```

---

### Task 8: CRM franchise HQ server actions (6)

**Files:**
- Modify: `packages/actions/unirefund/CRMService/actions.ts`
- Modify: `packages/actions/unirefund/CRMService/post-actions.ts`
- Modify: `packages/actions/unirefund/CRMService/put-actions.ts`
- Modify: `packages/actions/unirefund/CRMService/delete-actions.ts`

**Interfaces:**
- Consumes: `getCRMServiceClient` from `../lib`; the `client.franchiseHq` namespace.
- Produces:
  - `getFranchiseHqsApi(data, session?)`
  - `getFranchiseHqByIdApi(data, session?)`
  - `postFranchiseHqApi(data)`
  - `putFranchiseHqApi(data)`
  - `putFranchiseHqCountriesApi(data)`
  - `deleteFranchiseHqByIdApi(id)`

- [ ] **Step 1: Add the two GET actions**

Append to `packages/actions/unirefund/CRMService/actions.ts`, and add the two type imports to the existing `import type { ... } from "@repo/saas/CRMService";` block:

```ts
export async function getFranchiseHqsApi(
  data: GetApiCrmServiceFranchiseHqsData,
  session?: Session | null
) {
  try {
    const client = await getCRMServiceClient(session);
    const dataResponse =
      await client.franchiseHq.getApiCrmServiceFranchiseHqs(data);
    return structuredSuccessResponse(dataResponse);
  } catch (error) {
    throw structuredError(error);
  }
}

export async function getFranchiseHqByIdApi(
  data: GetApiCrmServiceFranchiseHqsByIdData,
  session?: Session | null
) {
  try {
    const client = await getCRMServiceClient(session);
    const dataResponse =
      await client.franchiseHq.getApiCrmServiceFranchiseHqsById(data);
    return structuredSuccessResponse(dataResponse);
  } catch (error) {
    throw structuredError(error);
  }
}
```

- [ ] **Step 2: Add the POST action**

Append to `packages/actions/unirefund/CRMService/post-actions.ts`, adding `PostApiCrmServiceFranchiseHqsData` to its type imports:

```ts
export async function postFranchiseHqApi(
  data: PostApiCrmServiceFranchiseHqsData
) {
  try {
    const client = await getCRMServiceClient();
    const response =
      await client.franchiseHq.postApiCrmServiceFranchiseHqs(data);
    return structuredResponse(response);
  } catch (error) {
    return structuredError(error);
  }
}
```

- [ ] **Step 3: Add the two PUT actions**

Append to `packages/actions/unirefund/CRMService/put-actions.ts`, adding both types to its imports:

```ts
export async function putFranchiseHqApi(
  data: PutApiCrmServiceFranchiseHqsByIdData
) {
  try {
    const client = await getCRMServiceClient();
    const response =
      await client.franchiseHq.putApiCrmServiceFranchiseHqsById(data);
    return structuredResponse(response);
  } catch (error) {
    return structuredError(error);
  }
}

export async function putFranchiseHqCountriesApi(
  data: PutApiCrmServiceFranchiseHqsByIdCountriesData
) {
  try {
    const client = await getCRMServiceClient();
    const response =
      await client.franchiseHq.putApiCrmServiceFranchiseHqsByIdCountries(data);
    return structuredResponse(response);
  } catch (error) {
    return structuredError(error);
  }
}
```

- [ ] **Step 4: Add the DELETE action**

Append to `packages/actions/unirefund/CRMService/delete-actions.ts`. Note the bare `id` parameter, matching `deleteMerchantContractHeaderByIdApi`:

```ts
export async function deleteFranchiseHqByIdApi(id: string) {
  try {
    const client = await getCRMServiceClient();
    const response =
      await client.franchiseHq.deleteApiCrmServiceFranchiseHqsById({ id });
    return structuredResponse(response);
  } catch (error) {
    return structuredError(error);
  }
}
```

- [ ] **Step 5: Verify types and lint**

Run: `npm run type-check`
Expected: exactly the 2 baseline errors.

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add packages/actions/unirefund/CRMService/
git commit -m "feat(franchise): add CRM franchise HQ server actions"
```

---

### Task 9: Contract franchise contract and HQ contract server actions (10)

Both families are symmetric; they touch the same four files, so they ship together.

**Files:**
- Modify: `packages/actions/unirefund/ContractService/action.ts` (singular filename)
- Modify: `packages/actions/unirefund/ContractService/post-actions.ts`
- Modify: `packages/actions/unirefund/ContractService/put-actions.ts`
- Modify: `packages/actions/unirefund/ContractService/delete-actions.ts`

**Interfaces:**
- Consumes: `getContractServiceClient` from `../lib`; the `client.franchiseContract` and `client.franchiseHqContract` namespaces.
- Produces:
  - `getFranchiseContractsApi(data, session?)`, `getFranchiseContractByIdApi(data, session?)`
  - `postFranchiseContractApi(data)`, `putFranchiseContractApi(data)`, `deleteFranchiseContractByIdApi(id)`
  - `getFranchiseHqContractsApi(data, session?)`, `getFranchiseHqContractByIdApi(data, session?)`
  - `postFranchiseHqContractApi(data)`, `putFranchiseHqContractApi(data)`, `deleteFranchiseHqContractByIdApi(id)`

- [ ] **Step 1: Add the four GET actions**

Append to `packages/actions/unirefund/ContractService/action.ts`, adding the four `Get...Data` types to its existing type-import block:

```ts
export async function getFranchiseContractsApi(
  data: GetApiContractServiceFranchiseContractsData,
  session?: Session | null
) {
  try {
    const client = await getContractServiceClient(session);
    return structuredSuccessResponse(
      await client.franchiseContract.getApiContractServiceFranchiseContracts(
        data
      )
    );
  } catch (error) {
    throw structuredError(error);
  }
}

export async function getFranchiseContractByIdApi(
  data: GetApiContractServiceFranchiseContractsByIdData,
  session?: Session | null
) {
  try {
    const client = await getContractServiceClient(session);
    return structuredSuccessResponse(
      await client.franchiseContract.getApiContractServiceFranchiseContractsById(
        data
      )
    );
  } catch (error) {
    throw structuredError(error);
  }
}

export async function getFranchiseHqContractsApi(
  data: GetApiContractServiceFranchiseHqContractsData,
  session?: Session | null
) {
  try {
    const client = await getContractServiceClient(session);
    return structuredSuccessResponse(
      await client.franchiseHqContract.getApiContractServiceFranchiseHqContracts(
        data
      )
    );
  } catch (error) {
    throw structuredError(error);
  }
}

export async function getFranchiseHqContractByIdApi(
  data: GetApiContractServiceFranchiseHqContractsByIdData,
  session?: Session | null
) {
  try {
    const client = await getContractServiceClient(session);
    return structuredSuccessResponse(
      await client.franchiseHqContract.getApiContractServiceFranchiseHqContractsById(
        data
      )
    );
  } catch (error) {
    throw structuredError(error);
  }
}
```

- [ ] **Step 2: Add the two POST actions**

Append to `packages/actions/unirefund/ContractService/post-actions.ts`, adding both types to its imports:

```ts
export async function postFranchiseContractApi(
  data: PostApiContractServiceFranchiseContractsData
) {
  try {
    const client = await getContractServiceClient();
    const response =
      await client.franchiseContract.postApiContractServiceFranchiseContracts(
        data
      );
    return structuredResponse(response);
  } catch (error) {
    return structuredError(error);
  }
}

export async function postFranchiseHqContractApi(
  data: PostApiContractServiceFranchiseHqContractsData
) {
  try {
    const client = await getContractServiceClient();
    const response =
      await client.franchiseHqContract.postApiContractServiceFranchiseHqContracts(
        data
      );
    return structuredResponse(response);
  } catch (error) {
    return structuredError(error);
  }
}
```

- [ ] **Step 3: Add the two PUT actions**

Append to `packages/actions/unirefund/ContractService/put-actions.ts`, adding both types to its imports:

```ts
export async function putFranchiseContractApi(
  data: PutApiContractServiceFranchiseContractsByIdData
) {
  try {
    const client = await getContractServiceClient();
    const response =
      await client.franchiseContract.putApiContractServiceFranchiseContractsById(
        data
      );
    return structuredResponse(response);
  } catch (error) {
    return structuredError(error);
  }
}

export async function putFranchiseHqContractApi(
  data: PutApiContractServiceFranchiseHqContractsByIdData
) {
  try {
    const client = await getContractServiceClient();
    const response =
      await client.franchiseHqContract.putApiContractServiceFranchiseHqContractsById(
        data
      );
    return structuredResponse(response);
  } catch (error) {
    return structuredError(error);
  }
}
```

- [ ] **Step 4: Add the two DELETE actions**

Append to `packages/actions/unirefund/ContractService/delete-actions.ts`:

```ts
export async function deleteFranchiseContractByIdApi(id: string) {
  try {
    const client = await getContractServiceClient();
    const response =
      await client.franchiseContract.deleteApiContractServiceFranchiseContractsById(
        { id }
      );
    return structuredResponse(response);
  } catch (error) {
    return structuredError(error);
  }
}

export async function deleteFranchiseHqContractByIdApi(id: string) {
  try {
    const client = await getContractServiceClient();
    const response =
      await client.franchiseHqContract.deleteApiContractServiceFranchiseHqContractsById(
        { id }
      );
    return structuredResponse(response);
  } catch (error) {
    return structuredError(error);
  }
}
```

- [ ] **Step 5: Verify types and lint**

Run: `npm run type-check`
Expected: exactly the 2 baseline errors.

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add packages/actions/unirefund/ContractService/
git commit -m "feat(franchise): add franchise contract and HQ contract server actions"
```

---

### Task 10: Contract franchise earning server actions (3)

**Files:**
- Modify: `packages/actions/unirefund/ContractService/action.ts`
- Modify: `packages/actions/unirefund/ContractService/post-actions.ts`

**Interfaces:**
- Consumes: `getContractServiceClient`; the `client.franchiseEarning` namespace.
- Produces: `getFranchiseEarningsApi(data, session?)`, `getFranchiseEarningByIdApi(data, session?)`, `postFranchiseEarningCalculateApi(data)`

- [ ] **Step 1: Add the two GET actions**

Append to `packages/actions/unirefund/ContractService/action.ts`, adding both types to its imports:

```ts
export async function getFranchiseEarningsApi(
  data: GetApiContractServiceFranchiseEarningsData,
  session?: Session | null
) {
  try {
    const client = await getContractServiceClient(session);
    return structuredSuccessResponse(
      await client.franchiseEarning.getApiContractServiceFranchiseEarnings(data)
    );
  } catch (error) {
    throw structuredError(error);
  }
}

export async function getFranchiseEarningByIdApi(
  data: GetApiContractServiceFranchiseEarningsByIdData,
  session?: Session | null
) {
  try {
    const client = await getContractServiceClient(session);
    return structuredSuccessResponse(
      await client.franchiseEarning.getApiContractServiceFranchiseEarningsById(
        data
      )
    );
  } catch (error) {
    throw structuredError(error);
  }
}
```

- [ ] **Step 2: Add the calculate action**

Append to `packages/actions/unirefund/ContractService/post-actions.ts`:

```ts
export async function postFranchiseEarningCalculateApi(
  data: PostApiContractServiceFranchiseEarningsCalculateData
) {
  try {
    const client = await getContractServiceClient();
    const response =
      await client.franchiseEarning.postApiContractServiceFranchiseEarningsCalculate(
        data
      );
    return structuredResponse(response);
  } catch (error) {
    return structuredError(error);
  }
}
```

- [ ] **Step 3: Verify types and lint**

Run: `npm run type-check`
Expected: exactly the 2 baseline errors.

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add packages/actions/unirefund/ContractService/
git commit -m "feat(franchise): add franchise earning server actions"
```

---

### Task 11: Finance franchise statement and earning-run server actions (7)

FinanceService has no `put-actions.ts`; this task creates it.

**Files:**
- Modify: `packages/actions/unirefund/FinanceService/actions.ts`
- Modify: `packages/actions/unirefund/FinanceService/post-actions.ts`
- Create: `packages/actions/unirefund/FinanceService/put-actions.ts`

**Interfaces:**
- Consumes: `getFinanceServiceClient` from `../lib`; the `client.franchiseHqStatement` and `client.franchiseEarningRun` namespaces.
- Produces:
  - `getFranchiseHqStatementsApi(data, session?)`
  - `getFranchiseHqStatementByIdApi(data, session?)`
  - `getFranchiseHqStatementCurrencyTotalsApi(data, session?)`
  - `postFranchiseHqStatementsApi(data)`
  - `postFranchiseHqStatementsFormDraftApi(data)`
  - `postFranchiseEarningRunsRunApi(data)`
  - `putFranchiseHqStatementStatusApi(data)`

- [ ] **Step 1: Add the three GET actions**

Append to `packages/actions/unirefund/FinanceService/actions.ts`, adding the three types to its import block:

```ts
export async function getFranchiseHqStatementsApi(
  data: GetApiFinanceServiceFranchiseHqStatementsData,
  session?: Session | null
) {
  try {
    const client = await getFinanceServiceClient(session);
    const dataResponse =
      await client.franchiseHqStatement.getApiFinanceServiceFranchiseHqStatements(
        data
      );
    return structuredSuccessResponse(dataResponse);
  } catch (error) {
    throw structuredError(error);
  }
}

export async function getFranchiseHqStatementByIdApi(
  data: GetApiFinanceServiceFranchiseHqStatementsByIdData,
  session?: Session | null
) {
  try {
    const client = await getFinanceServiceClient(session);
    const dataResponse =
      await client.franchiseHqStatement.getApiFinanceServiceFranchiseHqStatementsById(
        data
      );
    return structuredSuccessResponse(dataResponse);
  } catch (error) {
    throw structuredError(error);
  }
}

export async function getFranchiseHqStatementCurrencyTotalsApi(
  data: GetApiFinanceServiceFranchiseHqStatementsCurrencyTotalsData,
  session?: Session | null
) {
  try {
    const client = await getFinanceServiceClient(session);
    const dataResponse =
      await client.franchiseHqStatement.getApiFinanceServiceFranchiseHqStatementsCurrencyTotals(
        data
      );
    return structuredSuccessResponse(dataResponse);
  } catch (error) {
    throw structuredError(error);
  }
}
```

- [ ] **Step 2: Add the three POST actions**

Append to `packages/actions/unirefund/FinanceService/post-actions.ts`, adding the three types to its imports:

```ts
export async function postFranchiseHqStatementsApi(
  data: PostApiFinanceServiceFranchiseHqStatementsData
) {
  try {
    const client = await getFinanceServiceClient();
    const dataResponse =
      await client.franchiseHqStatement.postApiFinanceServiceFranchiseHqStatements(
        data
      );
    return structuredResponse(dataResponse);
  } catch (error) {
    return structuredError(error);
  }
}

export async function postFranchiseHqStatementsFormDraftApi(
  data: PostApiFinanceServiceFranchiseHqStatementsFormDraftData
) {
  try {
    const client = await getFinanceServiceClient();
    const dataResponse =
      await client.franchiseHqStatement.postApiFinanceServiceFranchiseHqStatementsFormDraft(
        data
      );
    return structuredResponse(dataResponse);
  } catch (error) {
    return structuredError(error);
  }
}

export async function postFranchiseEarningRunsRunApi(
  data: PostApiFinanceServiceFranchiseEarningRunsRunData
) {
  try {
    const client = await getFinanceServiceClient();
    const dataResponse =
      await client.franchiseEarningRun.postApiFinanceServiceFranchiseEarningRunsRun(
        data
      );
    return structuredResponse(dataResponse);
  } catch (error) {
    return structuredError(error);
  }
}
```

- [ ] **Step 3: Create the PUT actions file**

Create `packages/actions/unirefund/FinanceService/put-actions.ts`:

```ts
"use server";
import type { PutApiFinanceServiceFranchiseHqStatementsByIdStatusData } from "@repo/saas/FinanceService";
import { structuredError, structuredResponse } from "@repo/utils/api";
import { getFinanceServiceClient } from "../lib";

export async function putFranchiseHqStatementStatusApi(
  data: PutApiFinanceServiceFranchiseHqStatementsByIdStatusData
) {
  try {
    const client = await getFinanceServiceClient();
    const dataResponse =
      await client.franchiseHqStatement.putApiFinanceServiceFranchiseHqStatementsByIdStatus(
        data
      );
    return structuredResponse(dataResponse);
  } catch (error) {
    return structuredError(error);
  }
}
```

- [ ] **Step 4: Verify types and lint**

Run: `npm run type-check`
Expected: exactly the 2 baseline errors.

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 5: Confirm all 26 wrappers exist**

Run from repo root `C:\unirefund\web-app`:

```bash
grep -rho "export async function [a-zA-Z]*Franchise[a-zA-Z]*Api" packages/actions | sort -u | wc -l
```

Expected: `26`. If the count is lower, list them with the same grep minus `| wc -l` and find the gap against the Interfaces blocks in Tasks 8-11.

- [ ] **Step 6: Commit**

```bash
git add packages/actions/unirefund/FinanceService/
git commit -m "feat(franchise): add franchise statement and earning-run server actions"
```

---

### Task 12: Foundation acceptance

No new code. Confirms the whole sub-project is green together and records the state the feature sub-projects build on.

- [ ] **Step 1: Regenerate i18n and type-check**

Run: `pnpm run init`
Then: `npm run type-check`
Expected: exactly the 2 baseline `TS2307` mrz errors.

- [ ] **Step 2: Run the full unit suite**

Run: `npm run test:unit`
Expected: 59 tests pass / 13 suites, 0 fail (23 baseline + 12 Task 1 + 8 Task 2 + 8 Task 3 + 4 Task 4 + 4 Task 5).

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 4: Confirm no franchise route or nav entry was added**

```bash
git diff --stat 27010b8 -- "apps/web/src/app"
grep -n "hostOnly" apps/web/src/components/sidebar-layout/data.ts
```

`27010b8` is the commit this sub-project started from. Do not use `HEAD~12` — tasks produce a varying number of commits once fix rounds are counted.

Expected: no new files under `apps/web/src/app`, and `hostOnly` appearing only in the two type definitions — not on any nav entry. Feature sub-projects add entries alongside their routes.

- [ ] **Step 5: Confirm the E2E suite is unaffected**

Run: `npm run test` (Playwright)
Expected: same result as before this sub-project. Nothing here touches an existing route, so any failure is pre-existing — record which tests failed rather than fixing them here.

- [ ] **Step 6: Commit if anything changed**

If Steps 1-5 produced no file changes, skip. Otherwise:

```bash
git add -A
git commit -m "chore(franchise): foundation acceptance"
```

---

## Self-Review

**1. Spec coverage.** Every sub-project 0 bullet in the spec maps to a task:

| Spec bullet | Task |
|---|---|
| `hostOnly` on `NavItem` / `NavItemAction`; `isHost` in `mapNavItem` | 3 |
| `requireHost()` server helper on `getInfoForCurrentTenantApi` | 4 |
| `FeeBracketsTable` and shared contiguity `superRefine` | 1, 2, 7 |
| `resolveTenantNames()` helper | 5 |
| 26 server-action wrappers (6 CRM / 5 + 5 + 3 Contract / 6 + 1 Finance) | 8, 9, 10, 11 |
| i18n keys | 6 |

Action counts reconcile: 6 (Task 8) + 10 (Task 9) + 3 (Task 10) + 7 (Task 11) = 26.

**2. Nav entries are deferred, by design.** The four `hostOnly: true` nav entries point at routes that do not exist until sub-projects 1-5, so adding them here would ship 404s in the sidebar. This plan implements the mechanism and proves it by unit test; each feature sub-project adds its own entry alongside its route. Task 12 Step 4 enforces that. The spec's gating section was amended to say the same, so plan and spec now agree.

**3. Placeholder scan.** No `TBD`, no "add error handling", no "similar to Task N". Every code step carries the actual code. Three steps name a fallback verification command instead of assuming an API shape (`z.guid()` in Task 2, `response.type` in Task 5, `useFieldArray`'s export path in Task 7) — those are checks, not placeholders.

**4. Type consistency.** `findFeeBracketIssues(rows, { allowEmpty })` returning `FeeBracketIssue[]` is defined in Task 1 and consumed with that exact signature in Task 2. `refineFeeBrackets({ allowEmpty, languageData })` is defined in Task 2 and used by both schema factories in the same task. `mapNavItem(navItem, languageData, ctx)` is defined in Task 3 and its call site updated in the same task. `isHostTenant` / `requireHost` (Task 4) and `toTenantNameMap` / `resolveTenantNames` (Task 5) are each defined and tested in one task. The i18n keys written in Task 6 match the `KEYS` map in Task 2 and the reads in Task 7 exactly: `Franchise.Brackets.*`.

**5. Test-count arithmetic.** 23 → 35 (Task 1, +12) → 43 (Task 2, +8) → 51 (Task 3, +8) → 55 (Task 4, +4) → 59 (Task 5, +4). Task 12 Step 2 expects 59.

Corrected during execution: an earlier revision of this plan claimed Task 2 added 9 tests and reached 44. Task 2's test file as written contains 8 `it` blocks, so the true chain ends at 59. The counts above are measured, not derived.

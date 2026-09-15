# Staff Analytics Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the merchant, refund-point and customs Home screens with the mobile counterpart of web's `home/analytics` dashboard, keeping each current screen verbatim as `HomeScreen.classic.tsx`.

**Architecture:** A generated `AnalyticService` SDK feeds one shared `useAnalyticsDashboard()` hook, which lists the tenant's analytics data sources, executes the 15 known ones in parallel, and hands pure reshaping functions the raw ClickHouse rows. The result is a flat `AnalyticsCard[]` rendered by four thin victory-native wrappers inside a common `ChartCard` chrome. No role branching anywhere — the backend scopes the source list by the caller's affiliation.

**Tech Stack:** Expo 54.0.36, React Native 0.81.5, React 19.1.0 (new architecture), TypeScript, NativeWind, zustand, jest (`jest-expo`), `victory-native@41.26.0`, `@shopify/react-native-skia` 2.2.12.

**Spec:** `docs/superpowers/specs/2026-09-15-superapp-staff-analytics-home-design.md`

## Global Constraints

- **Working directory is `C:\unirefund\super-app-safe`.** Never `C:\unirefund\super-app` — that is a different checkout shared with other agent sessions.
- **`victory-native` must be pinned to exactly `41.26.0`.** Version 42.x requires `@shopify/react-native-skia >=2.6.0`; Expo 54 pins Skia to `2.2.12` (`node_modules/expo/bundledNativeModules.json`). Do not upgrade Skia.
- **No new `t()` translation keys.** `TranslationKey` derives from the backend-fetched `src/data/language-data/en-US.gen.json`, and `src/localization/config.ts` asserts every key in `src/localization/resources/en-US.json` exists in that bundle. A new `MobileApp.Analytics.*` key fails `tsc`. All analytics copy comes from `src/utils/analytics/labels.ts` instead.
- **Any test that renders a component must be named `*.router.test.tsx`**, and a `renderHook` suite `*.router.test.ts`. Plain `*.test.ts` runs under the `jest-expo/node` project, which cannot load `@testing-library/react-native`.
- **`isActionGranted(granted, required)`** takes granted policies first — the opposite order from web's helper.
- **Both halves of an ABP permission pair are required:** `AnalyticService.AnalyticsDataSources` *and* `AnalyticService.AnalyticsDataSources.ViewList`.
- **Never read layout width from module scope.** Use `onLayout` or `useSafeAreaFrame()`; an import-time `Dimensions.get("window")` goes stale after rotation or a foreign Activity.
- **Every chart and table card gets an explicit pixel height**, never `flex: 1`. A wide table in a horizontal `ScrollView` renders its header over an empty body without one, and only fails after a re-render.
- **Colors come from `@/utils/theme`** (`colors.primary`, `colors.success`, `colors.error`, `colors.warning`, `colors.muted`, `colors.border`, `colors.foreground`, `colors.card`). Green/red/amber are reserved for outcome states only.
- **Gates:** `npm run typecheck` and `npm test`. There is no CI. `npm run init` must have been run with `SUPPORTED_LOCALES` set, or `tsc` reports phantom TS2307s.
- **Baseline — neither gate is clean at `main`; both mean "no NEW failures".** Measured on `1270feb5`:
  - `npm test`: 1 suite / 3 tests fail, in `src/components/ui/__tests__/tokens.test.ts`. Totals: 194 of 195 suites pass, 1864 of 1868 tests pass (1 skipped).
  - `npm run typecheck`: one pre-existing `TS2345` in `src/app/(auth)/__tests__/tabBackNavigation.router.test.tsx`. Its message embeds a route-union size that shifts whenever a new file changes `.expo/types/router.d.ts` — a cosmetic difference, not a regression.
  - Where a task below says "typecheck clean" or "tests pass", read it as "no failure beyond this baseline".
- **Any variable a `jest.mock` factory references must be named `mock*`.** `babel-plugin-jest-hoist` hoists the factory above the file's consts and rejects every other out-of-scope reference at transform time — the suite fails to compile, with an error that has nothing to do with the code under test. Task 2 hit this; the test code below is already `mock`-prefixed.
- **Comment density:** write far fewer comments than the surrounding dense docblocks suggest. Comment the non-obvious *why*, never the *what*.

---

### Task 1: Preserve the three Home screens as safe copies

Nothing new is built here. This task exists first so the screens are already
preserved and still under test before anything replaces them.

**Files:**
- Create: `src/screens/merchant/Home/HomeScreen.classic.tsx`
- Create: `src/screens/refund-point/Home/HomeScreen.classic.tsx`
- Create: `src/screens/customs/Home/HomeScreen.classic.tsx`
- Modify: `src/screens/customs/Home/__tests__/CustomsHomeScreen.router.test.tsx`
- Modify: `src/screens/customs/Home/__tests__/useCustomsHomeFlow.router.test.ts`
- Modify: `src/screens/customs/Home/__tests__/CustomsTagList.router.test.tsx`
- Modify: `src/screens/customs/Home/__tests__/CustomsTagRisk.router.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `HomeScreen.classic.tsx` in all three role directories, each a
  verbatim default-export copy of the screen at `HEAD`. Task 12 replaces the
  original `HomeScreen.tsx` files; these copies are what it must not disturb.

- [ ] **Step 1: Record the baseline so later failures are attributable**

```bash
cd /c/unirefund/super-app-safe
npm test 2>&1 | tail -30
```

Expected: only `src/utils/__tests__/tokens.test.ts` fails. Write the pass/fail
counts down — every later task compares against them.

- [ ] **Step 2: Copy each screen verbatim**

```bash
cd /c/unirefund/super-app-safe
cp src/screens/merchant/Home/HomeScreen.tsx      src/screens/merchant/Home/HomeScreen.classic.tsx
cp src/screens/refund-point/Home/HomeScreen.tsx  src/screens/refund-point/Home/HomeScreen.classic.tsx
cp src/screens/customs/Home/HomeScreen.tsx       src/screens/customs/Home/HomeScreen.classic.tsx
```

Do not edit the copies. Their relative imports (`./_components/...`,
`./useCustomsHomeFlow`) still resolve — the copies sit in the same directory.

- [ ] **Step 3: Add a one-line header to each copy explaining what it is**

At the very top of each of the three new files, above the existing imports:

```tsx
// The Home screen as it stood before Home became the analytics dashboard.
// Kept compiling and tested so the flows it owns can be re-homed deliberately
// rather than recovered from git. Not referenced by any route.
```

- [ ] **Step 4: Repoint the customs tests at the copy**

In `CustomsHomeScreen.router.test.tsx`, change the screen import:

```tsx
import CustomsHomeScreen from "../HomeScreen.classic";
```

The other three suites import from `../_components/...` and
`../useCustomsHomeFlow`, which do not move — check each one and change only the
imports that resolve to `../HomeScreen`:

```bash
cd /c/unirefund/super-app-safe
grep -rn 'from "\.\./HomeScreen"' src/screens/customs/Home/__tests__/
```

Every hit becomes `from "../HomeScreen.classic"`.

- [ ] **Step 5: Verify the copies compile and the suites still pass**

```bash
cd /c/unirefund/super-app-safe
npm run typecheck
npm test -- src/screens/customs
```

Expected: typecheck clean; all four customs suites pass exactly as in Step 1.

- [ ] **Step 6: Commit**

```bash
cd /c/unirefund/super-app-safe
git add src/screens/merchant/Home/HomeScreen.classic.tsx \
        src/screens/refund-point/Home/HomeScreen.classic.tsx \
        src/screens/customs/Home/HomeScreen.classic.tsx \
        src/screens/customs/Home/__tests__/
git commit -m "chore(home): keep each staff Home as HomeScreen.classic.tsx

Preserved verbatim before Home becomes the analytics dashboard, with the
customs suites repointed at the copy so it stays verified rather than
becoming untested dead code."
```

---

### Task 2: Generate the AnalyticService SDK and expose two actions

**Files:**
- Modify: `src/saas/API_LIST.json`
- Create (generated): `src/saas/AnalyticService/`
- Modify: `src/actions/lib.ts`
- Create: `src/actions/AnalyticService/actions.ts`
- Test: `src/actions/AnalyticService/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: `fetchRequest` from `@/utils/customFetch`, `createServiceClient` via
  `src/actions/lib.ts`.
- Produces:
  - `getAnalyticServiceClient(customHeaders?: Record<string, string>): Promise<AnalyticServiceClient>`
  - `getAnalyticsDataSourcesApi(): Promise<{ items?: { id: string; name: string }[] | null }>`
  - `postAnalyticsDataSourceExecuteApi(id: string, parameters: Record<string, unknown>): Promise<{ data?: Record<string, unknown>[] | null }>`

- [ ] **Step 1: Add the service to the generator's list**

In `src/saas/API_LIST.json`, add as the **last** array entry (the file is an
array of `{input, output, dereference}` objects):

```json
  {
    "input": "swagger-json/Analytic",
    "output": "Analytic",
    "dereference": true
  }
```

- [ ] **Step 2: Generate only that service**

```bash
cd /c/unirefund/super-app-safe/src/saas
node index.mjs -u "https://dev-api.unirefund.com" -f Analytic
```

Expected: `src/saas/AnalyticService/` appears with `AnalyticServiceClient.ts`,
`sdk.gen.ts`, `types.gen.ts`, `schemas.gen.ts`, `index.ts`.

- [ ] **Step 3: Confirm the generated names before writing code against them**

```bash
cd /c/unirefund/super-app-safe
grep -n "public readonly" src/saas/AnalyticService/AnalyticServiceClient.ts
grep -n "getApiAnalyticServiceAnalyticsDataSources\|ByIdExecute" src/saas/AnalyticService/sdk.gen.ts
```

Expected (matching web's generated client): a `analyticsDataSource` property,
and the methods `getApiAnalyticServiceAnalyticsDataSources(data)` and
`postApiAnalyticServiceAnalyticsDataSourcesByIdExecute(data)`. **If the names
differ, use what was generated** and adjust Steps 5 and 6 accordingly.

- [ ] **Step 4: Register the client factory**

In `src/actions/lib.ts`, add the import beside the other thirteen (alphabetical,
so directly after the `AdministrationServiceClient` import):

```ts
import { AnalyticServiceClient } from "@/saas/AnalyticService";
```

and the factory beside the others at the bottom of the file:

```ts
export const getAnalyticServiceClient = (
  customHeaders?: Record<string, string>,
) => createServiceClient(AnalyticServiceClient, customHeaders);
```

- [ ] **Step 5: Write the failing test**

Create `src/actions/AnalyticService/__tests__/actions.test.ts`:

```ts
import {
  getAnalyticsDataSourcesApi,
  postAnalyticsDataSourceExecuteApi,
} from "../actions";

const getSources = jest.fn();
const execute = jest.fn();

jest.mock("@/actions/lib", () => ({
  getAnalyticServiceClient: jest.fn(async () => ({
    analyticsDataSource: {
      // Deref'd lazily: a jest factory hoists above the consts above, so
      // naming them directly here would capture `undefined`.
      getApiAnalyticServiceAnalyticsDataSources: (...args: unknown[]) =>
        getSources(...args),
      postApiAnalyticServiceAnalyticsDataSourcesByIdExecute: (
        ...args: unknown[]
      ) => execute(...args),
    },
  })),
}));

jest.mock("@/utils/customFetch", () => ({
  fetchRequest: (request: (h: Record<string, string>) => unknown) =>
    request({ Authorization: "Bearer test" }),
}));

beforeEach(() => {
  getSources.mockReset();
  execute.mockReset();
});

it("lists the tenant's data sources", async () => {
  getSources.mockResolvedValue({ items: [{ id: "a", name: "MatchRate" }] });

  await expect(getAnalyticsDataSourcesApi()).resolves.toEqual({
    items: [{ id: "a", name: "MatchRate" }],
  });
});

it("executes a source with the parameters it was handed", async () => {
  execute.mockResolvedValue({ data: [{ tags: 3 }] });

  const result = await postAnalyticsDataSourceExecuteApi("src-1", {
    Timezone: "Europe/Istanbul",
  });

  expect(execute).toHaveBeenCalledWith({
    id: "src-1",
    requestBody: { parameters: { Timezone: "Europe/Istanbul" } },
  });
  expect(result).toEqual({ data: [{ tags: 3 }] });
});
```

- [ ] **Step 6: Run the test to verify it fails**

```bash
cd /c/unirefund/super-app-safe
npx jest src/actions/AnalyticService --selectProjects node
```

Expected: FAIL — `Cannot find module '../actions'`.

- [ ] **Step 7: Write the actions**

Create `src/actions/AnalyticService/actions.ts`:

```ts
import { fetchRequest } from "@/utils/customFetch";
import { getAnalyticServiceClient } from "../lib";

export async function getAnalyticsDataSourcesApi() {
  return await fetchRequest(async (customHeaders) => {
    const client = await getAnalyticServiceClient(customHeaders);
    return await client.analyticsDataSource.getApiAnalyticServiceAnalyticsDataSources(
      { maxResultCount: 100 },
    );
  }, "getAnalyticsDataSources");
}

export async function postAnalyticsDataSourceExecuteApi(
  id: string,
  parameters: Record<string, unknown>,
) {
  return await fetchRequest(async (customHeaders) => {
    const client = await getAnalyticServiceClient(customHeaders);
    return await client.analyticsDataSource.postApiAnalyticServiceAnalyticsDataSourcesByIdExecute(
      { id, requestBody: { parameters } },
    );
  }, "postAnalyticsDataSourceExecute");
}
```

- [ ] **Step 8: Run the test to verify it passes**

```bash
cd /c/unirefund/super-app-safe
npx jest src/actions/AnalyticService --selectProjects node
npm run typecheck
```

Expected: 2 passing, typecheck clean.

- [ ] **Step 9: Commit**

```bash
cd /c/unirefund/super-app-safe
git add src/saas/API_LIST.json src/saas/AnalyticService src/actions/lib.ts src/actions/AnalyticService
git commit -m "feat(analytics): generate the AnalyticService SDK and its two actions

Lists analytics data sources and executes one by id, the pair web's
home/analytics route uses. Generated from swagger-json/Analytic like every
other service rather than hand-written."
```

---

### Task 3: Analytics types, source names and pure reshapers

**Files:**
- Create: `src/utils/analytics/types.ts`
- Create: `src/utils/analytics/sources.ts`
- Create: `src/utils/analytics/reshape.ts`
- Test: `src/utils/analytics/__tests__/reshape.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `types.ts`: `AnalyticsRow`, `AnalyticsDataset`, `DonutSlice`, `BarSeries`, `BarDatum`, `AreaPoint`, `TableColumn`, `AnalyticsCard`
  - `sources.ts`: `SOURCE` (const object), `KNOWN_ANALYTICS_SOURCES: string[]`
  - `reshape.ts`: `toNumber`, `orderedPeriods`, `pivotByPeriod`, `buildMatchRate`, `buildLastIssued`

- [ ] **Step 1: Write the types**

Create `src/utils/analytics/types.ts`:

```ts
/** One row of a ClickHouse result set. Keys and value types vary by source. */
export type AnalyticsRow = Record<string, unknown>;

export interface AnalyticsDataset {
  name: string;
  rows: AnalyticsRow[];
}

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

export interface BarSeries {
  key: string;
  label: string;
  color: string;
}

/** A category plus one numeric value per series key. */
export type BarDatum = { label: string } & Record<string, string | number>;

export interface AreaPoint {
  label: string;
  value: number;
}

export interface TableColumn {
  key: string;
  label: string;
  align?: "left" | "right";
  format?: (value: unknown) => string;
}

export type AnalyticsCard =
  | {
      id: string;
      kind: "donut";
      title: string;
      totalLabel: string;
      slices: DonutSlice[];
    }
  | {
      id: string;
      kind: "bar";
      title: string;
      orientation: "horizontal" | "vertical";
      data: BarDatum[];
      series: BarSeries[];
    }
  | {
      id: string;
      kind: "area";
      title: string;
      seriesLabel: string;
      points: AreaPoint[];
    }
  | {
      id: string;
      kind: "table";
      title: string;
      caption?: string;
      columns: TableColumn[];
      rows: AnalyticsRow[];
    };
```

- [ ] **Step 2: Write the source names**

Create `src/utils/analytics/sources.ts`:

```ts
/**
 * Backend `AnalyticsDataSources.name` values this dashboard knows how to
 * render. The DTO carries no chart-type metadata, so name -> visualization is
 * decided here and in `registry.ts`. Mirrors web's `home/analytics/sources.ts`.
 */
export const SOURCE = {
  nationalities: "TopNationalitiesByTagsAndAmount",
  timeOfDay: "TagsByTimeOfDay",
  weekday: "TagsByTimeOfWeekday",
  nationalityPeriod: "TagsByNationalityPeriodComparison",
  hourPeriod: "TagsByHourPeriodComparison",
  weekdayPeriod: "TagsByWeekdayPeriodComparison",
  salesVat: "SalesVatTotalsByPeriod",
  top10Stores: "Top10Stores",
  top10Chains: "Top10Chains",
  issuedByResidence: "IssuedByResidence",
  matchRate: "MatchRate",
  lastIssuedTag: "LastIssuedTag",
  initialValidation: "InitialValidationResult",
  finalValidation: "FinalValidationResult",
  splitByRefundMethod: "SplitByRefundMethod",
} as const;

export const KNOWN_ANALYTICS_SOURCES: string[] = Object.values(SOURCE);
```

- [ ] **Step 3: Write the failing reshaper tests**

Create `src/utils/analytics/__tests__/reshape.test.ts`:

```ts
import {
  buildLastIssued,
  buildMatchRate,
  orderedPeriods,
  pivotByPeriod,
  toNumber,
} from "../reshape";

describe("toNumber", () => {
  it("parses numeric strings the backend sends as text", () => {
    expect(toNumber("42")).toBe(42);
  });

  // Every downstream sum would become NaN and poison a whole chart.
  it("yields 0 for anything unparseable", () => {
    expect(toNumber(null)).toBe(0);
    expect(toNumber(undefined)).toBe(0);
    expect(toNumber("abc")).toBe(0);
    expect(toNumber(Infinity)).toBe(0);
  });
});

describe("orderedPeriods", () => {
  it("returns distinct periods sorted by PeriodOrder, not by appearance", () => {
    const rows = [
      { Period: "This Year", PeriodOrder: 3 },
      { Period: "This Week", PeriodOrder: 1 },
      { Period: "This Month", PeriodOrder: 2 },
      { Period: "This Week", PeriodOrder: 1 },
    ];

    expect(orderedPeriods(rows)).toEqual([
      "This Week",
      "This Month",
      "This Year",
    ]);
  });

  it("ignores rows with no period", () => {
    expect(orderedPeriods([{ PeriodOrder: 1 }])).toEqual([]);
  });
});

describe("pivotByPeriod", () => {
  const rows = [
    { Period: "This Week", PeriodOrder: 1, Nationality: "TR", TagCount: 5 },
    { Period: "This Month", PeriodOrder: 2, Nationality: "TR", TagCount: 9 },
    { Period: "This Week", PeriodOrder: 1, Nationality: "DE", TagCount: 7 },
    { Period: "This Month", PeriodOrder: 2, Nationality: "DE", TagCount: 20 },
  ];

  it("turns long rows into one wide row per dimension value", () => {
    const { rows: pivoted, periods } = pivotByPeriod(rows, "Nationality");

    expect(periods).toEqual(["This Week", "This Month"]);
    expect(pivoted).toEqual([
      { Nationality: "DE", "This Week": 7, "This Month": 20 },
      { Nationality: "TR", "This Week": 5, "This Month": 9 },
    ]);
  });

  // Without an explicit order field the widest period ranks the rows, so the
  // biggest contributor is first rather than whichever arrived first.
  it("ranks by the widest period when no order field is given", () => {
    const { rows: pivoted } = pivotByPeriod(rows, "Nationality");

    expect(pivoted[0].Nationality).toBe("DE");
  });

  it("sorts by the order field when one is given", () => {
    const hours = [
      { Period: "This Week", PeriodOrder: 1, Hour: 9, TagCount: 1 },
      { Period: "This Week", PeriodOrder: 1, Hour: 2, TagCount: 4 },
    ];

    const { rows: pivoted } = pivotByPeriod(hours, "Hour", {
      orderField: "Hour",
    });

    expect(pivoted.map((row) => row.Hour)).toEqual(["2", "9"]);
  });
});

describe("buildMatchRate", () => {
  it("splits each month into refunded and outstanding", () => {
    const result = buildMatchRate([
      { Month: "February", MonthIndex: 2, MatchStatus: "Refunded", TagCount: 4 },
      { Month: "January", MonthIndex: 1, MatchStatus: "Refunded", TagCount: 3 },
      { Month: "January", MonthIndex: 1, MatchStatus: "Pending", TagCount: 2 },
    ]);

    expect(result).toEqual([
      { label: "January", MonthIndex: 1, Refunded: 3, Outstanding: 2 },
      { label: "February", MonthIndex: 2, Refunded: 4, Outstanding: 0 },
    ]);
  });

  // Anything that is not the literal "Refunded" is outstanding — the backend
  // emits several non-refunded statuses and they all mean the same thing here.
  it("treats every non-Refunded status as outstanding", () => {
    const [month] = buildMatchRate([
      { Month: "March", MonthIndex: 3, MatchStatus: "Cancelled", TagCount: 6 },
    ]);

    expect(month.Outstanding).toBe(6);
    expect(month.Refunded).toBe(0);
  });
});

describe("buildLastIssued", () => {
  it("counts stores per day-range bucket, ordered by the range index", () => {
    const result = buildLastIssued([
      { DayRange: "6 - 15 days ago", DayRangeIndex: 2, StoreId: "s1" },
      { DayRange: "0 - 5 days ago", DayRangeIndex: 1, StoreId: "s2" },
      { DayRange: "0 - 5 days ago", DayRangeIndex: 1, StoreId: "s3" },
    ]);

    expect(result).toEqual([
      { label: "0 - 5 days ago", stores: 2, order: 1 },
      { label: "6 - 15 days ago", stores: 1, order: 2 },
    ]);
  });

  it("ignores rows carrying no range", () => {
    expect(buildLastIssued([{ DayRangeIndex: 1 }])).toEqual([]);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

```bash
cd /c/unirefund/super-app-safe
npx jest src/utils/analytics --selectProjects node
```

Expected: FAIL — `Cannot find module '../reshape'`.

- [ ] **Step 5: Write the reshapers**

Create `src/utils/analytics/reshape.ts`:

```ts
import type { AnalyticsRow } from "./types";

export function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Distinct `Period` values in a period-comparison source, by `PeriodOrder`. */
export function orderedPeriods(rows: AnalyticsRow[]): string[] {
  const order = new Map<string, number>();
  rows.forEach((row) => {
    const period = String(row.Period ?? "");
    if (period && !order.has(period)) {
      order.set(period, toNumber(row.PeriodOrder));
    }
  });
  return [...order.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([period]) => period);
}

/**
 * Pivots long rows (`{ Period, <dimKey>, TagCount }`) into wide ones keyed by
 * period. Without `orderField` the widest period ranks the result, so the
 * biggest contributor leads.
 */
export function pivotByPeriod(
  rows: AnalyticsRow[],
  dimKey: string,
  options?: { orderField?: string },
): { rows: AnalyticsRow[]; periods: string[] } {
  const periods = orderedPeriods(rows);
  const byDim = new Map<string, Record<string, number | string>>();
  const orderByDim = new Map<string, number>();

  rows.forEach((row) => {
    const dim = String(row[dimKey] ?? "");
    if (!dim) return;
    const entry = byDim.get(dim) ?? { [dimKey]: dim };
    entry[String(row.Period ?? "")] = toNumber(row.TagCount);
    byDim.set(dim, entry);
    if (options?.orderField) {
      orderByDim.set(dim, toNumber(row[options.orderField]));
    }
  });

  const widest = periods[periods.length - 1] ?? "";
  const pivoted = [...byDim.entries()]
    .sort(([dimA, rowA], [dimB, rowB]) =>
      options?.orderField
        ? (orderByDim.get(dimA) ?? 0) - (orderByDim.get(dimB) ?? 0)
        : toNumber(rowB[widest]) - toNumber(rowA[widest]),
    )
    .map(([, entry]) => entry);

  return { rows: pivoted, periods };
}

export interface MatchRateMonth {
  label: string;
  MonthIndex: number;
  Refunded: number;
  Outstanding: number;
}

export function buildMatchRate(rows: AnalyticsRow[]): MatchRateMonth[] {
  const byMonth = new Map<number, MatchRateMonth>();
  rows.forEach((row) => {
    const monthIndex = toNumber(row.MonthIndex);
    const entry = byMonth.get(monthIndex) ?? {
      label: String(row.Month ?? monthIndex),
      MonthIndex: monthIndex,
      Refunded: 0,
      Outstanding: 0,
    };
    const count = toNumber(row.TagCount);
    if (String(row.MatchStatus ?? "") === "Refunded") {
      entry.Refunded += count;
    } else {
      entry.Outstanding += count;
    }
    byMonth.set(monthIndex, entry);
  });
  return [...byMonth.values()].sort((a, b) => a.MonthIndex - b.MonthIndex);
}

export interface LastIssuedBucket {
  label: string;
  stores: number;
  order: number;
}

export function buildLastIssued(rows: AnalyticsRow[]): LastIssuedBucket[] {
  const byRange = new Map<string, LastIssuedBucket>();
  rows.forEach((row) => {
    const range = String(row.DayRange ?? "");
    if (!range) return;
    const entry = byRange.get(range) ?? {
      label: range,
      stores: 0,
      order: toNumber(row.DayRangeIndex),
    };
    entry.stores += 1;
    byRange.set(range, entry);
  });
  return [...byRange.values()].sort((a, b) => a.order - b.order);
}
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd /c/unirefund/super-app-safe
npx jest src/utils/analytics --selectProjects node
npm run typecheck
```

Expected: all reshaper tests pass; typecheck clean.

Note: `pivotByPeriod` writes the dimension value back as a **string** (it is the
Map key). The `Hour` test above asserts `["2", "9"]` for that reason — the
formatter in Task 5's registry pads it for display.

- [ ] **Step 7: Commit**

```bash
cd /c/unirefund/super-app-safe
git add src/utils/analytics
git commit -m "feat(analytics): add the source names and the pure row reshapers

Ports pivotByPeriod, buildMatchRate and buildLastIssued from web's
client.live.tsx. Pure functions, so they carry their own unit tests rather
than being reached only through a rendered screen."
```

---

### Task 4: Localized labels, palette and risk colors

**Files:**
- Create: `src/utils/analytics/labels.ts`
- Test: `src/utils/analytics/__tests__/labels.test.ts`

**Interfaces:**
- Consumes: `colors` from `@/utils/theme`.
- Produces:
  - `analyticsLocale(activeLocale: string): "en" | "tr"`
  - `chartTitle(id: string, locale: string): string`
  - `uiLabel(key: UiLabelKey, locale: string): string` where `UiLabelKey` is
    `"tags" | "stores" | "sales" | "vat" | "period" | "nationality" | "hour" | "weekday" | "refunded" | "outstanding" | "noData" | "noDataDescription" | "forbidden" | "error" | "retry" | "periodHint"`
  - `localizeEnum(kind: "refundMethod" | "riskLevel" | "dayRange" | "period", raw: unknown, locale: string): string`
  - `localizeWeekday(raw: unknown, locale: string): string`
  - `localizeMonth(raw: unknown, locale: string): string`
  - `riskLevelColor(raw: string): string | undefined`
  - `paletteColor(index: number): string`
  - `STATUS_COLORS: { good: string; bad: string; pending: string }`

- [ ] **Step 1: Write the failing test**

Create `src/utils/analytics/__tests__/labels.test.ts`:

```ts
import {
  analyticsLocale,
  chartTitle,
  localizeEnum,
  localizeMonth,
  localizeWeekday,
  paletteColor,
  riskLevelColor,
  STATUS_COLORS,
  uiLabel,
} from "../labels";

describe("analyticsLocale", () => {
  it("maps any Turkish tag to tr", () => {
    expect(analyticsLocale("tr-TR")).toBe("tr");
    expect(analyticsLocale("tr")).toBe("tr");
  });

  it("falls back to en for everything else", () => {
    expect(analyticsLocale("en-US")).toBe("en");
    expect(analyticsLocale("de-DE")).toBe("en");
    expect(analyticsLocale("")).toBe("en");
  });
});

describe("chartTitle", () => {
  it("returns the locale's title", () => {
    expect(chartTitle("match-rate", "en-US")).toBe("Match rate");
    expect(chartTitle("match-rate", "tr-TR")).toBe("Eşleşme oranı");
  });

  // A card id with no entry must still render a card, not crash the dashboard.
  it("falls back to the id for an unknown card", () => {
    expect(chartTitle("not-a-card", "en-US")).toBe("not-a-card");
  });
});

describe("uiLabel", () => {
  it("returns the locale's string", () => {
    expect(uiLabel("tags", "en-US")).toBe("Tags");
    expect(uiLabel("tags", "tr-TR")).toBe("Etiketler");
  });
});

describe("localizeEnum", () => {
  it("translates the domain enums the backend emits", () => {
    expect(localizeEnum("refundMethod", "CreditCard", "en-US")).toBe(
      "Credit card",
    );
    expect(localizeEnum("riskLevel", "Green", "tr-TR")).toBe("Yeşil");
    expect(localizeEnum("dayRange", "Never", "en-US")).toBe("Never");
    expect(localizeEnum("period", "This Week", "tr-TR")).toBe("Bu hafta");
  });

  // An unmapped value shows through unchanged rather than rendering blank.
  it("passes an unmapped value through untouched", () => {
    expect(localizeEnum("refundMethod", "Crypto", "en-US")).toBe("Crypto");
    expect(localizeEnum("riskLevel", null, "en-US")).toBe("");
  });
});

describe("Intl-backed labels", () => {
  it("localizes the English weekday and month names ClickHouse emits", () => {
    expect(localizeWeekday("Monday", "tr-TR")).toBe("Pazartesi");
    expect(localizeMonth("January", "tr-TR")).toBe("Ocak");
  });

  it("leaves anything it does not recognize alone", () => {
    expect(localizeWeekday("Caturday", "en-US")).toBe("Caturday");
  });
});

describe("riskLevelColor", () => {
  // Matched on the raw SQL value, case-insensitively, so translation and the
  // backend's spacing variants cannot break the match.
  it("matches the raw value however it is cased or spaced", () => {
    expect(riskLevelColor("Red")).toBe(STATUS_COLORS.bad);
    expect(riskLevelColor("GREEN")).toBe(STATUS_COLORS.good);
    expect(riskLevelColor("Pending (Not Reviewed)")).toBe(
      STATUS_COLORS.pending,
    );
    expect(riskLevelColor("Pending(Not Reviewed)")).toBe(STATUS_COLORS.pending);
  });

  it("returns undefined for a value that states no outcome", () => {
    expect(riskLevelColor("Unknown")).toBeUndefined();
  });
});

describe("paletteColor", () => {
  it("is stable for an index and wraps rather than running out", () => {
    expect(paletteColor(0)).toBe(paletteColor(0));
    expect(paletteColor(100)).toBeTruthy();
  });

  // Green, red and amber mean an outcome. A palette slot must never claim one.
  it("never hands out a status color", () => {
    const statuses: string[] = Object.values(STATUS_COLORS);
    for (let index = 0; index < 40; index += 1) {
      expect(statuses).not.toContain(paletteColor(index));
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /c/unirefund/super-app-safe
npx jest src/utils/analytics/__tests__/labels.test.ts --selectProjects node
```

Expected: FAIL — `Cannot find module '../labels'`.

- [ ] **Step 3: Write the labels module**

Create `src/utils/analytics/labels.ts`:

```ts
import { colors } from "@/utils/theme";

export type AnalyticsLocale = "en" | "tr";

type Dictionary = Record<string, { en: string; tr: string }>;

/**
 * Analytics copy lives here rather than in `t()`. `TranslationKey` derives from
 * the backend-fetched language bundle, so a locally-added key fails `tsc` until
 * the backend carries it. When it does, this module collapses into `t()` calls.
 */
export function analyticsLocale(activeLocale: string): AnalyticsLocale {
  return activeLocale.toLowerCase().startsWith("tr") ? "tr" : "en";
}

const CHART_TITLES: Dictionary = {
  nationalities: { en: "Tags by nationality", tr: "Uyruğa göre etiketler" },
  residence: { en: "Issued by residence", tr: "İkamete göre düzenlenen" },
  "top-stores": { en: "Top 10 stores", tr: "En iyi 10 mağaza" },
  "top-chains": { en: "Top 10 chains", tr: "En iyi 10 zincir" },
  "initial-validation": {
    en: "Initial validation result",
    tr: "İlk doğrulama sonucu",
  },
  "final-validation": {
    en: "Final validation result",
    tr: "Nihai doğrulama sonucu",
  },
  "time-of-day": { en: "Tags by time of day", tr: "Saate göre etiketler" },
  weekday: { en: "Tags by weekday", tr: "Haftanın gününe göre etiketler" },
  "match-rate": { en: "Match rate", tr: "Eşleşme oranı" },
  "last-issued": { en: "Last issued tag", tr: "Son düzenlenen etiket" },
  "split-by-method": {
    en: "Split by refund method",
    tr: "İade yöntemine göre dağılım",
  },
  "sales-vat": { en: "Sales and VAT totals", tr: "Satış ve KDV toplamları" },
  "nationality-period": {
    en: "Tags by nationality and period",
    tr: "Uyruk ve döneme göre etiketler",
  },
  "hour-period": {
    en: "Tags by hour and period",
    tr: "Saat ve döneme göre etiketler",
  },
  "weekday-period": {
    en: "Tags by weekday and period",
    tr: "Gün ve döneme göre etiketler",
  },
};

const UI_LABELS = {
  tags: { en: "Tags", tr: "Etiketler" },
  stores: { en: "Stores", tr: "Mağazalar" },
  sales: { en: "Sales", tr: "Satışlar" },
  vat: { en: "VAT", tr: "KDV" },
  period: { en: "Period", tr: "Dönem" },
  nationality: { en: "Nationality", tr: "Uyruk" },
  hour: { en: "Hour", tr: "Saat" },
  weekday: { en: "Weekday", tr: "Gün" },
  refunded: { en: "Refunded", tr: "İade edildi" },
  outstanding: { en: "Outstanding", tr: "Bekliyor" },
  noData: { en: "No data yet", tr: "Henüz veri yok" },
  noDataDescription: {
    en: "There is nothing to show for this period.",
    tr: "Bu dönem için gösterilecek bir şey yok.",
  },
  forbidden: {
    en: "Analytics are not available for this account.",
    tr: "Bu hesap için analiz mevcut değil.",
  },
  error: { en: "Analytics could not be loaded.", tr: "Analiz yüklenemedi." },
  retry: { en: "Try again", tr: "Tekrar dene" },
  periodHint: {
    en: "Each period is counted from its own start.",
    tr: "Her dönem kendi başlangıcından itibaren sayılır.",
  },
} satisfies Dictionary;

export type UiLabelKey = keyof typeof UI_LABELS;

const ENUMS: Record<string, Dictionary> = {
  refundMethod: {
    Cash: { en: "Cash", tr: "Nakit" },
    CreditCard: { en: "Credit card", tr: "Kredi kartı" },
    BankTransfer: { en: "Bank transfer", tr: "Banka havalesi" },
    Wallet: { en: "Wallet", tr: "Cüzdan" },
    CashViaPartner: { en: "Cash via partner", tr: "Partner üzerinden nakit" },
    IbanTransfer: { en: "IBAN transfer", tr: "IBAN havalesi" },
    Unknown: { en: "Unknown", tr: "Bilinmiyor" },
  },
  riskLevel: {
    Unknown: { en: "Unknown", tr: "Bilinmiyor" },
    Green: { en: "Green", tr: "Yeşil" },
    Red: { en: "Red", tr: "Kırmızı" },
    "Evaluation Failed": {
      en: "Evaluation failed",
      tr: "Değerlendirme başarısız",
    },
    "Pending (Not Reviewed)": {
      en: "Pending (not reviewed)",
      tr: "Bekliyor (incelenmedi)",
    },
  },
  dayRange: {
    Never: { en: "Never", tr: "Hiç" },
    "0 - 5 days ago": { en: "0 - 5 days ago", tr: "0 - 5 gün önce" },
    "6 - 15 days ago": { en: "6 - 15 days ago", tr: "6 - 15 gün önce" },
    "16 - 30 days ago": { en: "16 - 30 days ago", tr: "16 - 30 gün önce" },
    "31 - 60 days ago": { en: "31 - 60 days ago", tr: "31 - 60 gün önce" },
    "61 - 90 days ago": { en: "61 - 90 days ago", tr: "61 - 90 gün önce" },
    "91 - 180 days ago": { en: "91 - 180 days ago", tr: "91 - 180 gün önce" },
    "180 + days ago": { en: "180 + days ago", tr: "180 + gün önce" },
  },
  period: {
    "This Week": { en: "This week", tr: "Bu hafta" },
    "This Month": { en: "This month", tr: "Bu ay" },
    "This Year": { en: "This year", tr: "Bu yıl" },
    "All Time": { en: "All time", tr: "Tüm zamanlar" },
  },
};

export function chartTitle(id: string, locale: string): string {
  return CHART_TITLES[id]?.[analyticsLocale(locale)] ?? id;
}

export function uiLabel(key: UiLabelKey, locale: string): string {
  return UI_LABELS[key][analyticsLocale(locale)];
}

export function localizeEnum(
  kind: keyof typeof ENUMS | string,
  raw: unknown,
  locale: string,
): string {
  const value = String(raw ?? "");
  return ENUMS[kind]?.[value]?.[analyticsLocale(locale)] ?? value;
}

/** English weekday/month names as ClickHouse emits them -> the active locale. */
function intlMap(locale: string, part: "weekday" | "month") {
  const options: Intl.DateTimeFormatOptions =
    part === "weekday"
      ? { weekday: "long", timeZone: "UTC" }
      : { month: "long", timeZone: "UTC" };
  const english = new Intl.DateTimeFormat("en-US", options);
  const localized = new Intl.DateTimeFormat(locale, options);
  const map: Record<string, string> = {};
  const count = part === "weekday" ? 7 : 12;
  for (let index = 0; index < count; index += 1) {
    // 2024-01-01 is a Monday.
    const date =
      part === "weekday"
        ? new Date(Date.UTC(2024, 0, 1 + index))
        : new Date(Date.UTC(2024, index, 15));
    map[english.format(date)] = localized.format(date);
  }
  return map;
}

export function localizeWeekday(raw: unknown, locale: string): string {
  const value = String(raw ?? "");
  return intlMap(locale, "weekday")[value] ?? value;
}

export function localizeMonth(raw: unknown, locale: string): string {
  const value = String(raw ?? "");
  return intlMap(locale, "month")[value] ?? value;
}

export const STATUS_COLORS = {
  good: colors.success,
  bad: colors.error,
  pending: colors.warning,
} as const;

const RISK_MATCHES: { match: string; color: string }[] = [
  { match: "red", color: STATUS_COLORS.bad },
  { match: "green", color: STATUS_COLORS.good },
  { match: "pending", color: STATUS_COLORS.pending },
];

export function riskLevelColor(raw: string): string | undefined {
  const value = raw.toLowerCase();
  return RISK_MATCHES.find(({ match }) => value.includes(match))?.color;
}

/**
 * Categorical slots only. Green, red and amber are reserved for outcome states
 * (`STATUS_COLORS`) and are deliberately absent, so a palette slot can never be
 * misread as a verdict.
 */
const PALETTE = [
  "#2563eb",
  "#7c3aed",
  "#0891b2",
  "#c026d3",
  "#4f46e5",
  "#0d9488",
  "#9333ea",
  "#0284c7",
  "#db2777",
  "#475569",
  "#1d4ed8",
  "#6d28d9",
] as const;

export function paletteColor(index: number): string {
  return PALETTE[index % PALETTE.length];
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /c/unirefund/super-app-safe
npx jest src/utils/analytics --selectProjects node
npm run typecheck
```

Expected: all label tests pass; typecheck clean. If a Turkish `Intl` assertion
fails, the node build lacks full ICU — report it rather than weakening the test;
`jest-expo` normally ships full ICU.

- [ ] **Step 5: Commit**

```bash
cd /c/unirefund/super-app-safe
git add src/utils/analytics
git commit -m "feat(analytics): add the en/tr label map, palette and risk colors

Copy lives in a local map rather than t(): TranslationKey derives from the
backend-fetched bundle, so a new MobileApp.Analytics.* key fails tsc until
the backend carries it. Risk colors match the raw SQL value so translation
cannot break them."
```

---

### Task 5: The card registry

**Files:**
- Create: `src/utils/analytics/registry.ts`
- Test: `src/utils/analytics/__tests__/registry.test.ts`

**Interfaces:**
- Consumes: `SOURCE` (Task 3), the reshapers (Task 3), the labels (Task 4),
  the types (Task 3).
- Produces: `buildCards(datasets: AnalyticsDataset[], locale: string): AnalyticsCard[]`

- [ ] **Step 1: Write the failing test**

Create `src/utils/analytics/__tests__/registry.test.ts`:

```ts
import { buildCards } from "../registry";
import { SOURCE } from "../sources";
import { STATUS_COLORS } from "../labels";
import type { AnalyticsDataset } from "../types";

const dataset = (name: string, rows: Record<string, unknown>[]) =>
  ({ name, rows }) as AnalyticsDataset;

it("renders nothing for a source that came back empty", () => {
  expect(buildCards([dataset(SOURCE.nationalities, [])], "en-US")).toEqual([]);
});

it("drops a source it does not know how to draw", () => {
  expect(buildCards([dataset("SomethingElse", [{ a: 1 }])], "en-US")).toEqual(
    [],
  );
});

// The backend prefixes and suffixes source names, so an exact match alone
// would silently render an empty dashboard against a renamed backend.
it("matches a source name that carries a prefix", () => {
  const cards = buildCards(
    [dataset(`UniRefund.${SOURCE.nationalities}`, [{ label: "TR", tags: 4 }])],
    "en-US",
  );

  expect(cards).toHaveLength(1);
  expect(cards[0].id).toBe("nationalities");
});

it("builds a donut with one slice per row", () => {
  const [card] = buildCards(
    [
      dataset(SOURCE.nationalities, [
        { label: "TR", tags: 4 },
        { label: "DE", tags: 6 },
      ]),
    ],
    "en-US",
  );

  expect(card).toMatchObject({ id: "nationalities", kind: "donut" });
  if (card.kind !== "donut") throw new Error("expected a donut");
  expect(card.slices.map((slice) => slice.label)).toEqual(["TR", "DE"]);
  expect(card.slices.map((slice) => slice.value)).toEqual([4, 6]);
  expect(new Set(card.slices.map((slice) => slice.color)).size).toBe(2);
});

it("colors validation slices by their raw risk level", () => {
  const [card] = buildCards(
    [
      dataset(SOURCE.initialValidation, [
        { label: "Red", tags: 2 },
        { label: "Green", tags: 8 },
      ]),
    ],
    "en-US",
  );

  if (card.kind !== "donut") throw new Error("expected a donut");
  expect(card.slices[0]).toMatchObject({
    label: "Red",
    color: STATUS_COLORS.bad,
  });
  expect(card.slices[1]).toMatchObject({
    label: "Green",
    color: STATUS_COLORS.good,
  });
});

it("localizes weekday categories and keeps the bar horizontal", () => {
  const [card] = buildCards(
    [dataset(SOURCE.weekday, [{ label: "Monday", tags: 3 }])],
    "tr-TR",
  );

  expect(card).toMatchObject({ id: "weekday", kind: "bar" });
  if (card.kind !== "bar") throw new Error("expected a bar");
  expect(card.orientation).toBe("horizontal");
  expect(card.data[0].label).toBe("Pazartesi");
  expect(card.data[0].tags).toBe(3);
});

it("gives match rate two series and vertical columns", () => {
  const [card] = buildCards(
    [
      dataset(SOURCE.matchRate, [
        { Month: "January", MonthIndex: 1, MatchStatus: "Refunded", TagCount: 3 },
        { Month: "January", MonthIndex: 1, MatchStatus: "Pending", TagCount: 1 },
      ]),
    ],
    "en-US",
  );

  if (card.kind !== "bar") throw new Error("expected a bar");
  expect(card.orientation).toBe("vertical");
  expect(card.series.map((s) => s.key)).toEqual(["Refunded", "Outstanding"]);
  expect(card.series[0].color).toBe(STATUS_COLORS.good);
  expect(card.series[1].color).toBe(STATUS_COLORS.pending);
  expect(card.data[0]).toMatchObject({ label: "January", Refunded: 3, Outstanding: 1 });
});

it("builds the time-of-day area from the tags column", () => {
  const [card] = buildCards(
    [dataset(SOURCE.timeOfDay, [{ label: "09", tags: 7 }])],
    "en-US",
  );

  expect(card).toMatchObject({ id: "time-of-day", kind: "area" });
  if (card.kind !== "area") throw new Error("expected an area");
  expect(card.points).toEqual([{ label: "09", value: 7 }]);
});

it("builds the sales/VAT table with its four columns", () => {
  const [card] = buildCards(
    [
      dataset(SOURCE.salesVat, [
        { Period: "This Week", PeriodOrder: 1, TagCount: 2, Sales: 10, VAT: 1 },
      ]),
    ],
    "en-US",
  );

  if (card.kind !== "table") throw new Error("expected a table");
  expect(card.columns.map((column) => column.key)).toEqual([
    "Period",
    "TagCount",
    "Sales",
    "VAT",
  ]);
  expect(card.columns[0].format?.("This Week")).toBe("This week");
});

it("pads the hour column of the hour-period table", () => {
  const [card] = buildCards(
    [
      dataset(SOURCE.hourPeriod, [
        { Period: "This Week", PeriodOrder: 1, Hour: 9, TagCount: 2 },
      ]),
    ],
    "en-US",
  );

  if (card.kind !== "table") throw new Error("expected a table");
  expect(card.columns[0].format?.("9")).toBe("09:00");
});

// The order is the dashboard's reading order, so it is asserted, not incidental.
it("returns the cards in the fixed dashboard order", () => {
  const cards = buildCards(
    [
      dataset(SOURCE.salesVat, [
        { Period: "This Week", PeriodOrder: 1, TagCount: 1, Sales: 1, VAT: 1 },
      ]),
      dataset(SOURCE.timeOfDay, [{ label: "09", tags: 1 }]),
      dataset(SOURCE.nationalities, [{ label: "TR", tags: 1 }]),
    ],
    "en-US",
  );

  expect(cards.map((card) => card.id)).toEqual([
    "nationalities",
    "time-of-day",
    "sales-vat",
  ]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /c/unirefund/super-app-safe
npx jest src/utils/analytics/__tests__/registry.test.ts --selectProjects node
```

Expected: FAIL — `Cannot find module '../registry'`.

- [ ] **Step 3: Write the registry**

Create `src/utils/analytics/registry.ts`:

```ts
import {
  chartTitle,
  localizeEnum,
  localizeMonth,
  localizeWeekday,
  paletteColor,
  riskLevelColor,
  STATUS_COLORS,
  uiLabel,
} from "./labels";
import {
  buildLastIssued,
  buildMatchRate,
  pivotByPeriod,
  toNumber,
} from "./reshape";
import { SOURCE } from "./sources";
import type {
  AnalyticsCard,
  AnalyticsDataset,
  AnalyticsRow,
  BarDatum,
  DonutSlice,
  TableColumn,
} from "./types";

/** Dashboard reading order: donuts, then trends, then the wide tables. */
const ORDER = [
  "nationalities",
  "residence",
  "top-stores",
  "top-chains",
  "initial-validation",
  "final-validation",
  "time-of-day",
  "weekday",
  "match-rate",
  "last-issued",
  "split-by-method",
  "sales-vat",
  "nationality-period",
  "hour-period",
  "weekday-period",
] as const;

function donut(
  id: string,
  rows: AnalyticsRow[],
  locale: string,
  colorFor?: (raw: string) => string | undefined,
): AnalyticsCard {
  const slices: DonutSlice[] = rows.map((row, index) => {
    const raw = String(row.label ?? "");
    return {
      label: raw,
      value: toNumber(row.tags),
      color: colorFor?.(raw) ?? paletteColor(index),
    };
  });
  return {
    id,
    kind: "donut",
    title: chartTitle(id, locale),
    totalLabel: uiLabel("tags", locale),
    slices,
  };
}

function periodColumns(
  first: TableColumn,
  periods: string[],
  locale: string,
): TableColumn[] {
  return [
    first,
    ...periods.map<TableColumn>((period) => ({
      key: period,
      label: localizeEnum("period", period, locale),
      align: "right",
    })),
  ];
}

type Builder = (rows: AnalyticsRow[], locale: string) => AnalyticsCard;

const BUILDERS: Record<string, { source: string; build: Builder }> = {
  nationalities: {
    source: SOURCE.nationalities,
    build: (rows, locale) => donut("nationalities", rows, locale),
  },
  residence: {
    source: SOURCE.issuedByResidence,
    build: (rows, locale) => donut("residence", rows, locale),
  },
  "top-stores": {
    source: SOURCE.top10Stores,
    build: (rows, locale) => donut("top-stores", rows, locale),
  },
  "top-chains": {
    source: SOURCE.top10Chains,
    build: (rows, locale) => donut("top-chains", rows, locale),
  },
  "initial-validation": {
    source: SOURCE.initialValidation,
    build: (rows, locale) =>
      donut("initial-validation", rows, locale, riskLevelColor),
  },
  "final-validation": {
    source: SOURCE.finalValidation,
    build: (rows, locale) =>
      donut("final-validation", rows, locale, riskLevelColor),
  },
  "time-of-day": {
    source: SOURCE.timeOfDay,
    build: (rows, locale) => ({
      id: "time-of-day",
      kind: "area",
      title: chartTitle("time-of-day", locale),
      seriesLabel: uiLabel("tags", locale),
      points: rows.map((row) => ({
        label: String(row.label ?? ""),
        value: toNumber(row.tags),
      })),
    }),
  },
  weekday: {
    source: SOURCE.weekday,
    build: (rows, locale) => ({
      id: "weekday",
      kind: "bar",
      title: chartTitle("weekday", locale),
      orientation: "horizontal",
      series: [
        { key: "tags", label: uiLabel("tags", locale), color: paletteColor(0) },
      ],
      data: rows.map<BarDatum>((row) => ({
        label: localizeWeekday(row.label, locale),
        tags: toNumber(row.tags),
      })),
    }),
  },
  "match-rate": {
    source: SOURCE.matchRate,
    build: (rows, locale) => ({
      id: "match-rate",
      kind: "bar",
      title: chartTitle("match-rate", locale),
      orientation: "vertical",
      series: [
        {
          key: "Refunded",
          label: uiLabel("refunded", locale),
          color: STATUS_COLORS.good,
        },
        {
          key: "Outstanding",
          label: uiLabel("outstanding", locale),
          color: STATUS_COLORS.pending,
        },
      ],
      data: buildMatchRate(rows).map<BarDatum>((month) => ({
        label: localizeMonth(month.label, locale),
        Refunded: month.Refunded,
        Outstanding: month.Outstanding,
      })),
    }),
  },
  "last-issued": {
    source: SOURCE.lastIssuedTag,
    build: (rows, locale) => ({
      id: "last-issued",
      kind: "bar",
      title: chartTitle("last-issued", locale),
      orientation: "horizontal",
      series: [
        {
          key: "stores",
          label: uiLabel("stores", locale),
          color: paletteColor(2),
        },
      ],
      data: buildLastIssued(rows).map<BarDatum>((bucket) => ({
        label: localizeEnum("dayRange", bucket.label, locale),
        stores: bucket.stores,
      })),
    }),
  },
  "split-by-method": {
    source: SOURCE.splitByRefundMethod,
    build: (rows, locale) => ({
      id: "split-by-method",
      kind: "bar",
      title: chartTitle("split-by-method", locale),
      orientation: "horizontal",
      series: [
        { key: "tags", label: uiLabel("tags", locale), color: paletteColor(4) },
      ],
      data: rows.map<BarDatum>((row) => ({
        label: localizeEnum("refundMethod", row.RefundMethod, locale),
        tags: toNumber(row.Tags ?? row.tags),
      })),
    }),
  },
  "sales-vat": {
    source: SOURCE.salesVat,
    build: (rows, locale) => ({
      id: "sales-vat",
      kind: "table",
      title: chartTitle("sales-vat", locale),
      columns: [
        {
          key: "Period",
          label: uiLabel("period", locale),
          format: (value) => localizeEnum("period", value, locale),
        },
        { key: "TagCount", label: uiLabel("tags", locale), align: "right" },
        { key: "Sales", label: uiLabel("sales", locale), align: "right" },
        { key: "VAT", label: uiLabel("vat", locale), align: "right" },
      ],
      rows: [...rows].sort(
        (a, b) => toNumber(a.PeriodOrder) - toNumber(b.PeriodOrder),
      ),
    }),
  },
  "nationality-period": {
    source: SOURCE.nationalityPeriod,
    build: (rows, locale) => {
      const pivot = pivotByPeriod(rows, "Nationality");
      return {
        id: "nationality-period",
        kind: "table",
        title: chartTitle("nationality-period", locale),
        caption: uiLabel("periodHint", locale),
        columns: periodColumns(
          { key: "Nationality", label: uiLabel("nationality", locale) },
          pivot.periods,
          locale,
        ),
        rows: pivot.rows.slice(0, 10),
      };
    },
  },
  "hour-period": {
    source: SOURCE.hourPeriod,
    build: (rows, locale) => {
      const pivot = pivotByPeriod(rows, "Hour", { orderField: "Hour" });
      return {
        id: "hour-period",
        kind: "table",
        title: chartTitle("hour-period", locale),
        caption: uiLabel("periodHint", locale),
        columns: periodColumns(
          {
            key: "Hour",
            label: uiLabel("hour", locale),
            format: (value) => `${String(value).padStart(2, "0")}:00`,
          },
          pivot.periods,
          locale,
        ),
        rows: pivot.rows,
      };
    },
  },
  "weekday-period": {
    source: SOURCE.weekdayPeriod,
    build: (rows, locale) => {
      const pivot = pivotByPeriod(rows, "Weekday", {
        orderField: "WeekdayIndex",
      });
      return {
        id: "weekday-period",
        kind: "table",
        title: chartTitle("weekday-period", locale),
        caption: uiLabel("periodHint", locale),
        columns: periodColumns(
          {
            key: "Weekday",
            label: uiLabel("weekday", locale),
            format: (value) => localizeWeekday(value, locale),
          },
          pivot.periods,
          locale,
        ),
        rows: pivot.rows,
      };
    },
  },
};

/**
 * Exact match first, then substring: the backend may carry a prefix or suffix
 * on a source name, and an exact-only match would render an empty dashboard
 * against a renamed backend rather than saying so.
 */
function rowsFor(datasets: AnalyticsDataset[], source: string): AnalyticsRow[] {
  const exact = datasets.find((dataset) => dataset.name === source);
  if (exact) return exact.rows;
  return datasets.find((dataset) => dataset.name.includes(source))?.rows ?? [];
}

export function buildCards(
  datasets: AnalyticsDataset[],
  locale: string,
): AnalyticsCard[] {
  return ORDER.flatMap((id) => {
    const entry = BUILDERS[id];
    const rows = rowsFor(datasets, entry.source);
    return rows.length > 0 ? [entry.build(rows, locale)] : [];
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /c/unirefund/super-app-safe
npx jest src/utils/analytics --selectProjects node
npm run typecheck
```

Expected: all registry tests pass; typecheck clean.

- [ ] **Step 5: Commit**

```bash
cd /c/unirefund/super-app-safe
git add src/utils/analytics
git commit -m "feat(analytics): map data sources to cards in a fixed order

One registry turns raw source rows into the 15 cards, dropping any source
that returned nothing. Per-role differences fall out of which sources the
backend returns, so no role branching is needed."
```

---

### Task 6: The `useAnalyticsDashboard` hook

**Files:**
- Create: `src/hooks/useAnalyticsDashboard.ts`
- Test: `src/hooks/__tests__/useAnalyticsDashboard.router.test.ts`

**Interfaces:**
- Consumes: `getAnalyticsDataSourcesApi`, `postAnalyticsDataSourceExecuteApi`
  (Task 2); `KNOWN_ANALYTICS_SOURCES` (Task 3); `buildCards` (Task 5);
  `useTenantTimeZone` from `@/store/application-configuration`; `useUserStore`;
  `isActionGranted` from `@/utils/policies`; `useLocalization`.
- Produces:
  ```ts
  export interface AnalyticsDashboardState {
    cards: AnalyticsCard[];
    isLoading: boolean;
    isForbidden: boolean;
    error: string | null;
    refresh: () => void;
  }
  export function useAnalyticsDashboard(): AnalyticsDashboardState;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/hooks/__tests__/useAnalyticsDashboard.router.test.ts`:

```ts
import { renderHook, waitFor } from "@testing-library/react-native";
import { useAnalyticsDashboard } from "../useAnalyticsDashboard";

// Names captured by a jest.mock factory MUST start with `mock` —
// babel-plugin-jest-hoist rejects any other out-of-scope reference at
// transform time, before the module under test is even resolved.
const mockListSources = jest.fn();
const mockExecuteSource = jest.fn();
let mockGrantedPolicies: Record<string, boolean> = {
  "AnalyticService.AnalyticsDataSources": true,
  "AnalyticService.AnalyticsDataSources.ViewList": true,
};

jest.mock("@/actions/AnalyticService/actions", () => ({
  getAnalyticsDataSourcesApi: (...args: unknown[]) => mockListSources(...args),
  postAnalyticsDataSourceExecuteApi: (...args: unknown[]) =>
    mockExecuteSource(...args),
}));

jest.mock("@/store/application-configuration", () => ({
  useTenantTimeZone: () => "Europe/Istanbul",
}));

jest.mock("@/store/user", () => ({
  __esModule: true,
  default: () => ({ user: { grantedPolicies: mockGrantedPolicies } }),
}));

jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({ activeLocale: "en-US" }),
}));

beforeEach(() => {
  mockListSources.mockReset();
  mockExecuteSource.mockReset();
  mockGrantedPolicies = {
    "AnalyticService.AnalyticsDataSources": true,
    "AnalyticService.AnalyticsDataSources.ViewList": true,
  };
});

it("executes only the sources the dashboard knows how to draw", async () => {
  mockListSources.mockResolvedValue({
    items: [
      { id: "1", name: "TopNationalitiesByTagsAndAmount" },
      { id: "2", name: "SomethingTheAppDoesNotRender" },
    ],
  });
  mockExecuteSource.mockResolvedValue({ data: [{ label: "TR", tags: 4 }] });

  const { result } = renderHook(() => useAnalyticsDashboard());

  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(mockExecuteSource).toHaveBeenCalledTimes(1);
  expect(mockExecuteSource).toHaveBeenCalledWith("1", {
    Timezone: "Europe/Istanbul",
  });
  expect(result.current.cards).toHaveLength(1);
});

// One bad source must cost one card, never the dashboard.
it("keeps the cards whose sources succeeded when one execute fails", async () => {
  mockListSources.mockResolvedValue({
    items: [
      { id: "1", name: "TopNationalitiesByTagsAndAmount" },
      { id: "2", name: "IssuedByResidence" },
    ],
  });
  mockExecuteSource.mockImplementation(async (id: string) => {
    if (id === "2") throw new Error("clickhouse timeout");
    return { data: [{ label: "TR", tags: 4 }] };
  });

  const { result } = renderHook(() => useAnalyticsDashboard());

  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.error).toBeNull();
  expect(result.current.cards.map((card) => card.id)).toEqual([
    "nationalities",
  ]);
});

it("reports an error when the source list itself fails", async () => {
  mockListSources.mockRejectedValue(new Error("gateway down"));

  const { result } = renderHook(() => useAnalyticsDashboard());

  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.error).toBe("gateway down");
  expect(result.current.cards).toEqual([]);
});

// Both halves of the ABP pair are enforced, so holding one is not access.
it("is forbidden without the full permission pair, and calls nothing", async () => {
  mockGrantedPolicies = { "AnalyticService.AnalyticsDataSources": true };

  const { result } = renderHook(() => useAnalyticsDashboard());

  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.isForbidden).toBe(true);
  expect(mockListSources).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /c/unirefund/super-app-safe
npx jest src/hooks/__tests__/useAnalyticsDashboard.router.test.ts --selectProjects router
```

Expected: FAIL — `Cannot find module '../useAnalyticsDashboard'`.

- [ ] **Step 3: Write the hook**

Create `src/hooks/useAnalyticsDashboard.ts`:

```ts
import {
  getAnalyticsDataSourcesApi,
  postAnalyticsDataSourceExecuteApi,
} from "@/actions/AnalyticService/actions";
import { useLocalization } from "@/providers/LocalizationProvider";
import { useTenantTimeZone } from "@/store/application-configuration";
import useUserStore from "@/store/user";
import { isActionGranted } from "@/utils/policies";
import { buildCards } from "@/utils/analytics/registry";
import { KNOWN_ANALYTICS_SOURCES } from "@/utils/analytics/sources";
import type { AnalyticsCard, AnalyticsDataset } from "@/utils/analytics/types";
import { useCallback, useEffect, useMemo, useState } from "react";

const REQUIRED = [
  "AnalyticService.AnalyticsDataSources",
  "AnalyticService.AnalyticsDataSources.ViewList",
] as const;

export interface AnalyticsDashboardState {
  cards: AnalyticsCard[];
  isLoading: boolean;
  isForbidden: boolean;
  error: string | null;
  refresh: () => void;
}

export function useAnalyticsDashboard(): AnalyticsDashboardState {
  const { activeLocale } = useLocalization();
  const timeZone = useTenantTimeZone();
  const { user } = useUserStore();
  const isForbidden = !isActionGranted(user?.grantedPolicies, REQUIRED);

  const [datasets, setDatasets] = useState<AnalyticsDataset[]>([]);
  const [isLoading, setIsLoading] = useState(!isForbidden);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (isForbidden) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    void (async () => {
      try {
        const response = await getAnalyticsDataSourcesApi();
        const items = (response?.items ?? []).filter((item) =>
          KNOWN_ANALYTICS_SOURCES.some((source) =>
            (item.name ?? "").includes(source),
          ),
        );

        // A source that fails costs its own card, not the dashboard.
        const results = await Promise.all(
          items.map(async (item) => {
            try {
              const executed = await postAnalyticsDataSourceExecuteApi(
                item.id,
                { Timezone: timeZone },
              );
              return { name: item.name ?? "", rows: executed?.data ?? [] };
            } catch {
              return { name: item.name ?? "", rows: [] };
            }
          }),
        );

        if (!cancelled) setDatasets(results);
      } catch (caught) {
        if (!cancelled) {
          setDatasets([]);
          setError(
            caught instanceof Error ? caught.message : "Unknown error",
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isForbidden, timeZone, attempt]);

  const cards = useMemo(
    () => buildCards(datasets, activeLocale),
    [datasets, activeLocale],
  );

  const refresh = useCallback(() => setAttempt((value) => value + 1), []);

  return { cards, isLoading, isForbidden, error, refresh };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /c/unirefund/super-app-safe
npx jest src/hooks/__tests__/useAnalyticsDashboard.router.test.ts --selectProjects router
npm run typecheck
```

Expected: 4 passing, typecheck clean.

Note: `timeZone` is a dependency, so changing tenant refetches. Home is a
retained tab — the effect must **not** depend on focus, or re-entering Home
refires 15 ClickHouse queries.

- [ ] **Step 5: Commit**

```bash
cd /c/unirefund/super-app-safe
git add src/hooks/useAnalyticsDashboard.ts src/hooks/__tests__/useAnalyticsDashboard.router.test.ts
git commit -m "feat(analytics): add the shared dashboard hook

Gates on both halves of the ABP permission pair, executes only the known
sources in parallel, and treats a failed source as one missing card rather
than a failed dashboard."
```

---

### Task 7: Install victory-native and build the card chrome

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `src/components/charts/ChartCard.tsx`
- Test: `src/components/charts/__tests__/ChartCard.router.test.tsx`

**Interfaces:**
- Consumes: `Text` from `@/components/ui`, `Skeleton` from `@/components/Skeleton`.
- Produces:
  ```tsx
  export const CHART_HEIGHT = 240;
  export function ChartCard(props: {
    title: string;
    caption?: string;
    height?: number;
    children: React.ReactNode;
  }): React.ReactElement;
  ```

- [ ] **Step 1: Install the pinned version**

```bash
cd /c/unirefund/super-app-safe
npm install victory-native@41.26.0 --save-exact
```

Expected: installs without a peer error. Confirm nothing else moved:

```bash
node -p "require('./node_modules/@shopify/react-native-skia/package.json').version"
```

Expected: `2.2.12`. **If Skia changed, revert the install and stop** — see
Global Constraints.

- [ ] **Step 2: Read the installed API before writing against it**

```bash
cd /c/unirefund/super-app-safe
ls node_modules/victory-native/lib/typescript/lib/
grep -rn "export" node_modules/victory-native/lib/typescript/lib/index.d.ts | head -40
```

Record the exact exported names for the cartesian chart, `Bar`, `Area`, and the
`Pie` namespace. Tasks 8-10 write against what is actually exported; if a name
in those tasks differs from the installed package, the installed package wins.

- [ ] **Step 3: Write the failing test**

Create `src/components/charts/__tests__/ChartCard.router.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";
import { ChartCard } from "../ChartCard";

it("shows the title and the chart it wraps", () => {
  render(
    <ChartCard title="Match rate">
      <Text>chart</Text>
    </ChartCard>,
  );

  expect(screen.getByText("Match rate")).toBeTruthy();
  expect(screen.getByText("chart")).toBeTruthy();
});

it("shows a caption only when it is given one", () => {
  const { rerender } = render(
    <ChartCard title="Hours">
      <Text>chart</Text>
    </ChartCard>,
  );
  expect(screen.queryByTestId("chart-card-caption")).toBeNull();

  rerender(
    <ChartCard title="Hours" caption="Counted per period">
      <Text>chart</Text>
    </ChartCard>,
  );
  expect(screen.getByTestId("chart-card-caption")).toBeTruthy();
});

// A chart with no height renders its axes over an empty body, and only after
// a re-render — so the height is asserted rather than left to a style.
it("gives the plot a fixed pixel height", () => {
  render(
    <ChartCard title="Hours" height={300}>
      <Text>chart</Text>
    </ChartCard>,
  );

  expect(screen.getByTestId("chart-card-plot")).toHaveStyle({ height: 300 });
});
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
cd /c/unirefund/super-app-safe
npx jest src/components/charts --selectProjects router
```

Expected: FAIL — `Cannot find module '../ChartCard'`.

- [ ] **Step 5: Write the chrome**

Create `src/components/charts/ChartCard.tsx`:

```tsx
import { Text } from "@/components/ui";
import React from "react";
import { View } from "react-native";

/** Every plot is sized in pixels; `flex: 1` leaves a chart measuring nothing. */
export const CHART_HEIGHT = 240;

export function ChartCard({
  title,
  caption,
  height = CHART_HEIGHT,
  children,
}: {
  title: string;
  caption?: string;
  height?: number;
  children: React.ReactNode;
}) {
  return (
    <View className="mb-3 rounded-2xl border border-border bg-card p-4">
      <Text className="text-base font-bold text-foreground">{title}</Text>
      {!!caption && (
        <Text testID="chart-card-caption" className="mt-0.5 text-xs text-muted">
          {caption}
        </Text>
      )}
      <View testID="chart-card-plot" style={{ height }} className="mt-3">
        {children}
      </View>
    </View>
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
cd /c/unirefund/super-app-safe
npx jest src/components/charts --selectProjects router
npm run typecheck
```

Expected: 3 passing, typecheck clean.

- [ ] **Step 7: Commit**

```bash
cd /c/unirefund/super-app-safe
git add package.json package-lock.json src/components/charts
git commit -m "feat(charts): pin victory-native 41.26.0 and add the card chrome

41.26 is the newest release whose Skia peer accepts the 2.2.12 Expo 54
pins; 42.x demands >=2.6.0. The plot is sized in pixels because a chart
given flex:1 measures nothing until a re-render."
```

---

### Task 8: The donut chart

**Files:**
- Create: `src/components/charts/AnalyticsDonut.tsx`
- Test: `src/components/charts/__tests__/AnalyticsDonut.router.test.tsx`

**Interfaces:**
- Consumes: `ChartCard`, `CHART_HEIGHT` (Task 7); `AnalyticsCard` (Task 3);
  `uiLabel` (Task 4).
- Produces: `export function AnalyticsDonut({ card }: { card: Extract<AnalyticsCard, { kind: "donut" }> }): React.ReactElement`

- [ ] **Step 1: Write the failing test**

Create `src/components/charts/__tests__/AnalyticsDonut.router.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";
import React from "react";
import { AnalyticsDonut } from "../AnalyticsDonut";
import type { AnalyticsCard } from "@/utils/analytics/types";

// The library draws on a Skia canvas, which renders nothing assertable under
// jest. What is ours — and what these tests are for — is the data handed down
// and the legend beside it.
const mockPolarProps = jest.fn();
jest.mock("victory-native", () => ({
  PolarChart: (props: Record<string, unknown>) => {
    mockPolarProps(props);
    return null;
  },
  Pie: { Chart: () => null, Slice: () => null },
}));

const card: Extract<AnalyticsCard, { kind: "donut" }> = {
  id: "nationalities",
  kind: "donut",
  title: "Tags by nationality",
  totalLabel: "Tags",
  slices: [
    { label: "TR", value: 4, color: "#2563eb" },
    { label: "DE", value: 6, color: "#7c3aed" },
  ],
};

beforeEach(() => mockPolarProps.mockReset());

it("renders the card title", () => {
  render(<AnalyticsDonut card={card} />);
  expect(screen.getByText("Tags by nationality")).toBeTruthy();
});

it("hands the chart every slice with its colour", () => {
  render(<AnalyticsDonut card={card} />);

  expect(mockPolarProps).toHaveBeenCalledWith(
    expect.objectContaining({
      data: [
        { label: "TR", value: 4, color: "#2563eb" },
        { label: "DE", value: 6, color: "#7c3aed" },
      ],
      labelKey: "label",
      valueKey: "value",
      colorKey: "color",
    }),
  );
});

// The donut's hole is what buys back the labels a pie cannot fit on a phone.
it("shows the total and its label in the centre", () => {
  render(<AnalyticsDonut card={card} />);

  expect(screen.getByText("10")).toBeTruthy();
  expect(screen.getByText("Tags")).toBeTruthy();
});

it("lists each slice in the legend", () => {
  render(<AnalyticsDonut card={card} />);

  expect(screen.getByText("TR")).toBeTruthy();
  expect(screen.getByText("DE")).toBeTruthy();
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /c/unirefund/super-app-safe
npx jest src/components/charts/__tests__/AnalyticsDonut.router.test.tsx --selectProjects router
```

Expected: FAIL — `Cannot find module '../AnalyticsDonut'`.

- [ ] **Step 3: Write the donut**

Create `src/components/charts/AnalyticsDonut.tsx`. Check the exact `Pie`
namespace shape recorded in Task 7 Step 2 before writing; the props below match
victory-native 41.x's documented polar API.

```tsx
import { Text } from "@/components/ui";
import type { AnalyticsCard } from "@/utils/analytics/types";
import React from "react";
import { View } from "react-native";
import { Pie, PolarChart } from "victory-native";
import { ChartCard } from "./ChartCard";

type DonutCard = Extract<AnalyticsCard, { kind: "donut" }>;

export function AnalyticsDonut({ card }: { card: DonutCard }) {
  const total = card.slices.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <ChartCard title={card.title}>
      <View className="flex-1 flex-row items-center">
        <View className="h-full flex-1">
          <PolarChart
            data={card.slices}
            labelKey="label"
            valueKey="value"
            colorKey="color"
          >
            <Pie.Chart innerRadius="60%" />
          </PolarChart>
          <View className="absolute inset-0 items-center justify-center">
            <Text className="text-xl font-bold text-foreground">
              {total.toLocaleString()}
            </Text>
            <Text className="text-xs text-muted">{card.totalLabel}</Text>
          </View>
        </View>

        <View className="w-32 pl-2">
          {card.slices.slice(0, 6).map((slice) => (
            <View key={slice.label} className="flex-row items-center gap-2 py-1">
              <View
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: slice.color }}
              />
              <Text className="flex-1 text-xs text-foreground" numberOfLines={1}>
                {slice.label}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </ChartCard>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /c/unirefund/super-app-safe
npx jest src/components/charts --selectProjects router
npm run typecheck
```

Expected: all donut and ChartCard tests pass; typecheck clean.

- [ ] **Step 5: Commit**

```bash
cd /c/unirefund/super-app-safe
git add src/components/charts
git commit -m "feat(charts): add the donut card

Web's pies become donuts on mobile: the hole carries the total, which buys
back the labels a phone cannot fit around a pie. The legend is capped at
six entries so a top-10 source cannot push the plot off the card."
```

---

### Task 9: The bar and area charts

**Files:**
- Create: `src/components/charts/AnalyticsBar.tsx`
- Create: `src/components/charts/AnalyticsArea.tsx`
- Create: `src/components/charts/chartFont.ts`
- Test: `src/components/charts/__tests__/AnalyticsBar.router.test.tsx`
- Test: `src/components/charts/__tests__/AnalyticsArea.router.test.tsx`

**Interfaces:**
- Consumes: `ChartCard` (Task 7); `AnalyticsCard` (Task 3).
- Produces:
  - `chartFont.ts`: `export function useChartFont(): SkFont`
  - `export function AnalyticsBar({ card }: { card: Extract<AnalyticsCard, { kind: "bar" }> }): React.ReactElement`
  - `export function AnalyticsArea({ card }: { card: Extract<AnalyticsCard, { kind: "area" }> }): React.ReactElement`

- [ ] **Step 1: Write the axis font helper**

Victory's cartesian axes need a Skia font. The repo bundles no `.ttf` and does
not depend on `expo-font`, so the font comes from the system font manager —
`matchFont` is exported by the installed Skia 2.2.12.

Create `src/components/charts/chartFont.ts`:

```ts
import { matchFont } from "@shopify/react-native-skia";
import { Platform } from "react-native";

/**
 * Axis labels need an `SkFont`. The repo bundles no font file, so this pulls
 * one from the system font manager rather than adding an asset and
 * `expo-font` for tick labels.
 */
export function useChartFont() {
  return matchFont({
    fontFamily: Platform.select({ ios: "Helvetica", default: "sans-serif" }),
    fontSize: 11,
  });
}
```

- [ ] **Step 2: Write the failing bar test**

Create `src/components/charts/__tests__/AnalyticsBar.router.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";
import React from "react";
import { AnalyticsBar } from "../AnalyticsBar";
import type { AnalyticsCard } from "@/utils/analytics/types";

const mockCartesianProps = jest.fn();
jest.mock("victory-native", () => ({
  CartesianChart: (props: Record<string, unknown>) => {
    mockCartesianProps(props);
    return null;
  },
  Bar: () => null,
  // Step 5b picks this for a horizontal card. It must exist in the mock even
  // though CartesianChart never invokes the render-prop children here.
  HorizontalBar: () => null,
}));

jest.mock("../chartFont", () => ({ useChartFont: () => null }));

const single: Extract<AnalyticsCard, { kind: "bar" }> = {
  id: "weekday",
  kind: "bar",
  title: "Tags by weekday",
  orientation: "horizontal",
  series: [{ key: "tags", label: "Tags", color: "#2563eb" }],
  data: [
    { label: "Monday", tags: 3 },
    { label: "Tuesday", tags: 5 },
  ],
};

const grouped: Extract<AnalyticsCard, { kind: "bar" }> = {
  id: "match-rate",
  kind: "bar",
  title: "Match rate",
  orientation: "vertical",
  series: [
    { key: "Refunded", label: "Refunded", color: "#16a34a" },
    { key: "Outstanding", label: "Outstanding", color: "#d97706" },
  ],
  data: [{ label: "January", Refunded: 3, Outstanding: 1 }],
};

beforeEach(() => mockCartesianProps.mockReset());

it("renders the card title", () => {
  render(<AnalyticsBar card={single} />);
  expect(screen.getByText("Tags by weekday")).toBeTruthy();
});

it("hands the chart the data keyed by label, with one yKey per series", () => {
  render(<AnalyticsBar card={single} />);

  expect(mockCartesianProps).toHaveBeenCalledWith(
    expect.objectContaining({
      data: single.data,
      xKey: "label",
      yKeys: ["tags"],
    }),
  );
});

it("passes every series key when the card is grouped", () => {
  render(<AnalyticsBar card={grouped} />);

  expect(mockCartesianProps).toHaveBeenCalledWith(
    expect.objectContaining({ yKeys: ["Refunded", "Outstanding"] }),
  );
});

// A single-series card names itself in the title; two or more need a legend.
it("shows a legend only for a multi-series card", () => {
  const { rerender } = render(<AnalyticsBar card={single} />);
  expect(screen.queryByTestId("chart-legend")).toBeNull();

  rerender(<AnalyticsBar card={grouped} />);
  expect(screen.getByTestId("chart-legend")).toBeTruthy();
  expect(screen.getByText("Refunded")).toBeTruthy();
  expect(screen.getByText("Outstanding")).toBeTruthy();
});
```

- [ ] **Step 3: Write the failing area test**

Create `src/components/charts/__tests__/AnalyticsArea.router.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";
import React from "react";
import { AnalyticsArea } from "../AnalyticsArea";
import type { AnalyticsCard } from "@/utils/analytics/types";

const mockCartesianProps = jest.fn();
jest.mock("victory-native", () => ({
  CartesianChart: (props: Record<string, unknown>) => {
    mockCartesianProps(props);
    return null;
  },
  Area: () => null,
  Line: () => null,
}));

jest.mock("../chartFont", () => ({ useChartFont: () => null }));

const card: Extract<AnalyticsCard, { kind: "area" }> = {
  id: "time-of-day",
  kind: "area",
  title: "Tags by time of day",
  seriesLabel: "Tags",
  points: [
    { label: "09", value: 7 },
    { label: "10", value: 12 },
  ],
};

beforeEach(() => mockCartesianProps.mockReset());

it("renders the card title", () => {
  render(<AnalyticsArea card={card} />);
  expect(screen.getByText("Tags by time of day")).toBeTruthy();
});

it("hands the chart the points keyed by label", () => {
  render(<AnalyticsArea card={card} />);

  expect(mockCartesianProps).toHaveBeenCalledWith(
    expect.objectContaining({
      data: card.points,
      xKey: "label",
      yKeys: ["value"],
    }),
  );
});
```

- [ ] **Step 4: Run both tests to verify they fail**

```bash
cd /c/unirefund/super-app-safe
npx jest src/components/charts --selectProjects router
```

Expected: FAIL — `Cannot find module '../AnalyticsBar'` and `'../AnalyticsArea'`.

- [ ] **Step 5: Write the bar chart**

Create `src/components/charts/AnalyticsBar.tsx`:

```tsx
import { Text } from "@/components/ui";
import type { AnalyticsCard } from "@/utils/analytics/types";
import { colors } from "@/utils/theme";
import React from "react";
import { View } from "react-native";
import { Bar, CartesianChart } from "victory-native";
import { ChartCard } from "./ChartCard";
import { useChartFont } from "./chartFont";

type BarCard = Extract<AnalyticsCard, { kind: "bar" }>;

export function AnalyticsBar({ card }: { card: BarCard }) {
  const font = useChartFont();
  const yKeys = card.series.map((series) => series.key);

  return (
    <ChartCard title={card.title}>
      {card.series.length > 1 && (
        <View testID="chart-legend" className="mb-2 flex-row flex-wrap gap-3">
          {card.series.map((series) => (
            <View key={series.key} className="flex-row items-center gap-1.5">
              <View
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: series.color }}
              />
              <Text className="text-xs text-foreground">{series.label}</Text>
            </View>
          ))}
        </View>
      )}
      <View className="flex-1">
        <CartesianChart
          data={card.data}
          xKey="label"
          yKeys={yKeys}
          domainPadding={{ left: 24, right: 24, top: 12 }}
          axisOptions={{
            font,
            labelColor: colors.muted,
            lineColor: colors.border,
          }}
        >
          {({ points, chartBounds }) =>
            card.series.map((series) => (
              <Bar
                key={series.key}
                points={points[series.key]}
                chartBounds={chartBounds}
                color={series.color}
                barCount={card.data.length}
                roundedCorners={{ topLeft: 4, topRight: 4 }}
              />
            ))
          }
        </CartesianChart>
      </View>
    </ChartCard>
  );
}
```

- [ ] **Step 5b: Honour `card.orientation`**

victory-native 41.26 ships `HorizontalBar` alongside `Bar` (both are present in
the published package). Confirm the export name against the installed types:

```bash
cd /c/unirefund/super-app-safe
grep -rn "HorizontalBar" node_modules/victory-native/lib/typescript/lib/index.d.ts
```

If it is exported, import it and pick the mark by orientation — three of the
four bar cards are horizontal because their category labels are too long to
read as columns at phone width:

```tsx
import { Bar, CartesianChart, HorizontalBar } from "victory-native";
// ...
const Mark = card.orientation === "horizontal" ? HorizontalBar : Bar;
```

then render `<Mark key={series.key} ... />` in place of `<Bar ... />`.

If the grep finds nothing, leave every card on `Bar`, say so in the commit
message, and open a follow-up — do not invent an API.

- [ ] **Step 6: Write the area chart**

Create `src/components/charts/AnalyticsArea.tsx`:

```tsx
import type { AnalyticsCard } from "@/utils/analytics/types";
import { colors } from "@/utils/theme";
import React from "react";
import { View } from "react-native";
import { Area, CartesianChart, Line } from "victory-native";
import { ChartCard } from "./ChartCard";
import { useChartFont } from "./chartFont";

type AreaCard = Extract<AnalyticsCard, { kind: "area" }>;

export function AnalyticsArea({ card }: { card: AreaCard }) {
  const font = useChartFont();

  return (
    <ChartCard title={card.title}>
      <View className="flex-1">
        <CartesianChart
          data={card.points}
          xKey="label"
          yKeys={["value"]}
          domainPadding={{ top: 12 }}
          axisOptions={{
            font,
            labelColor: colors.muted,
            lineColor: colors.border,
          }}
        >
          {({ points, chartBounds }) => (
            <>
              <Area
                points={points.value}
                y0={chartBounds.bottom}
                color={colors.primary}
                opacity={0.18}
                curveType="natural"
              />
              <Line
                points={points.value}
                color={colors.primary}
                strokeWidth={2}
                curveType="natural"
              />
            </>
          )}
        </CartesianChart>
      </View>
    </ChartCard>
  );
}
```

- [ ] **Step 7: Run both tests to verify they pass**

```bash
cd /c/unirefund/super-app-safe
npx jest src/components/charts --selectProjects router
npm run typecheck
```

Expected: all chart tests pass; typecheck clean. If `tsc` rejects a prop, fix it
against the installed `.d.ts` — the installed package is authoritative over the
code above.

- [ ] **Step 8: Commit**

```bash
cd /c/unirefund/super-app-safe
git add src/components/charts
git commit -m "feat(charts): add the bar and area cards

Axis labels take a system font through Skia's matchFont rather than adding
a bundled .ttf and expo-font for tick labels. A legend appears only where
there is more than one series to tell apart."
```

---

### Task 10: The table card

**Files:**
- Create: `src/components/charts/AnalyticsTable.tsx`
- Test: `src/components/charts/__tests__/AnalyticsTable.router.test.tsx`

**Interfaces:**
- Consumes: `ChartCard` (Task 7); `AnalyticsCard`, `TableColumn` (Task 3).
- Produces: `export function AnalyticsTable({ card }: { card: Extract<AnalyticsCard, { kind: "table" }> }): React.ReactElement`

- [ ] **Step 1: Write the failing test**

Create `src/components/charts/__tests__/AnalyticsTable.router.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";
import React from "react";
import { AnalyticsTable } from "../AnalyticsTable";
import type { AnalyticsCard } from "@/utils/analytics/types";

const card: Extract<AnalyticsCard, { kind: "table" }> = {
  id: "sales-vat",
  kind: "table",
  title: "Sales and VAT totals",
  caption: "Counted per period",
  columns: [
    {
      key: "Period",
      label: "Period",
      format: (value) => `<${String(value)}>`,
    },
    { key: "TagCount", label: "Tags", align: "right" },
  ],
  rows: [
    { Period: "This Week", TagCount: 2 },
    { Period: "This Month", TagCount: 9 },
  ],
};

it("renders the title, caption and every column header", () => {
  render(<AnalyticsTable card={card} />);

  expect(screen.getByText("Sales and VAT totals")).toBeTruthy();
  expect(screen.getByText("Counted per period")).toBeTruthy();
  expect(screen.getByText("Period")).toBeTruthy();
  expect(screen.getByText("Tags")).toBeTruthy();
});

it("applies a column's formatter to its cells", () => {
  render(<AnalyticsTable card={card} />);

  expect(screen.getByText("<This Week>")).toBeTruthy();
  expect(screen.getByText("<This Month>")).toBeTruthy();
});

it("renders an unformatted cell as its plain value", () => {
  render(<AnalyticsTable card={card} />);

  expect(screen.getByText("2")).toBeTruthy();
  expect(screen.getByText("9")).toBeTruthy();
});

// A missing key must render an empty cell, never the string "undefined".
it("renders a missing value as an empty cell", () => {
  render(
    <AnalyticsTable
      card={{ ...card, rows: [{ Period: "This Week" }] }}
    />,
  );

  expect(screen.queryByText("undefined")).toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /c/unirefund/super-app-safe
npx jest src/components/charts/__tests__/AnalyticsTable.router.test.tsx --selectProjects router
```

Expected: FAIL — `Cannot find module '../AnalyticsTable'`.

- [ ] **Step 3: Write the table**

Create `src/components/charts/AnalyticsTable.tsx`:

```tsx
import { Text } from "@/components/ui";
import type { AnalyticsCard, TableColumn } from "@/utils/analytics/types";
import React from "react";
import { View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { ChartCard } from "./ChartCard";

type TableCard = Extract<AnalyticsCard, { kind: "table" }>;

const COLUMN_WIDTH = 104;
const ROW_HEIGHT = 34;

function cellText(column: TableColumn, value: unknown): string {
  if (column.format) return column.format(value);
  return value === undefined || value === null ? "" : String(value);
}

export function AnalyticsTable({ card }: { card: TableCard }) {
  // Header row plus every data row, so the body has a real height inside the
  // horizontal scroller rather than collapsing behind the header.
  const height = ROW_HEIGHT * (card.rows.length + 1);

  return (
    <ChartCard title={card.title} caption={card.caption} height={height}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View className="flex-row border-b border-border">
            {card.columns.map((column) => (
              <Text
                key={column.key}
                style={{ width: COLUMN_WIDTH, height: ROW_HEIGHT }}
                className={`text-xs font-semibold text-muted ${
                  column.align === "right" ? "text-right" : "text-left"
                }`}
                numberOfLines={1}
              >
                {column.label}
              </Text>
            ))}
          </View>

          {card.rows.map((row, index) => (
            <View
              key={index}
              className="flex-row"
              style={{ height: ROW_HEIGHT }}
            >
              {card.columns.map((column) => (
                <Text
                  key={column.key}
                  style={{ width: COLUMN_WIDTH }}
                  className={`text-sm text-foreground ${
                    column.align === "right" ? "text-right" : "text-left"
                  }`}
                  numberOfLines={1}
                >
                  {cellText(column, row[column.key])}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </ChartCard>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /c/unirefund/super-app-safe
npx jest src/components/charts --selectProjects router
npm run typecheck
```

Expected: every chart suite passes; typecheck clean.

- [ ] **Step 5: Commit**

```bash
cd /c/unirefund/super-app-safe
git add src/components/charts
git commit -m "feat(charts): add the table card

Height is computed from the row count rather than flexed: a wide table in a
horizontal scroller renders its header over an empty body without a real
pixel height, and only after a re-render."
```

---

### Task 11: The dashboard

**Files:**
- Create: `src/screens/shared/_components/AnalyticsDashboard.tsx`
- Test: `src/screens/shared/__tests__/AnalyticsDashboard.router.test.tsx`

**Interfaces:**
- Consumes: `useAnalyticsDashboard` (Task 6); the four chart components
  (Tasks 8-10); `uiLabel` (Task 4); `useTabBarInset` from `@/hooks/useTabBarInset`;
  `Skeleton` from `@/components/Skeleton`; `Button` from `@/components/ui`.
- Produces: `export function AnalyticsDashboard(): React.ReactElement`

- [ ] **Step 1: Write the failing test**

Create `src/screens/shared/__tests__/AnalyticsDashboard.router.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";
import { AnalyticsDashboard } from "../_components/AnalyticsDashboard";
import type { AnalyticsCard } from "@/utils/analytics/types";

// Captured by a jest.mock factory, so the name must start with `mock` —
// babel-plugin-jest-hoist rejects any other out-of-scope reference.
const mockState = {
  cards: [] as AnalyticsCard[],
  isLoading: false,
  isForbidden: false,
  error: null as string | null,
  refresh: jest.fn(),
};

jest.mock("@/hooks/useAnalyticsDashboard", () => ({
  useAnalyticsDashboard: () => mockState,
}));

jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({ activeLocale: "en-US", t: (key: string) => key }),
}));

jest.mock("@/hooks/useTabBarInset", () => ({ useTabBarInset: () => 0 }));

// Each chart has its own suite; here the subject is which one each card picks.
jest.mock("@/components/charts/AnalyticsDonut", () => ({
  AnalyticsDonut: ({ card }: { card: { id: string } }) => (
    <Text>{`donut:${card.id}`}</Text>
  ),
}));
jest.mock("@/components/charts/AnalyticsBar", () => ({
  AnalyticsBar: ({ card }: { card: { id: string } }) => (
    <Text>{`bar:${card.id}`}</Text>
  ),
}));
jest.mock("@/components/charts/AnalyticsArea", () => ({
  AnalyticsArea: ({ card }: { card: { id: string } }) => (
    <Text>{`area:${card.id}`}</Text>
  ),
}));
jest.mock("@/components/charts/AnalyticsTable", () => ({
  AnalyticsTable: ({ card }: { card: { id: string } }) => (
    <Text>{`table:${card.id}`}</Text>
  ),
}));

beforeEach(() => {
  mockState.cards = [];
  mockState.isLoading = false;
  mockState.isForbidden = false;
  mockState.error = null;
});

it("shows skeletons while loading", () => {
  mockState.isLoading = true;

  render(<AnalyticsDashboard />);

  expect(screen.getAllByTestId("analytics-skeleton").length).toBeGreaterThan(0);
});

it("routes each card to the component for its kind", () => {
  mockState.cards = [
    {
      id: "nationalities",
      kind: "donut",
      title: "n",
      totalLabel: "Tags",
      slices: [],
    },
    {
      id: "weekday",
      kind: "bar",
      title: "w",
      orientation: "horizontal",
      series: [],
      data: [],
    },
    { id: "time-of-day", kind: "area", title: "t", seriesLabel: "Tags", points: [] },
    { id: "sales-vat", kind: "table", title: "s", columns: [], rows: [] },
  ];

  render(<AnalyticsDashboard />);

  expect(screen.getByText("donut:nationalities")).toBeTruthy();
  expect(screen.getByText("bar:weekday")).toBeTruthy();
  expect(screen.getByText("area:time-of-day")).toBeTruthy();
  expect(screen.getByText("table:sales-vat")).toBeTruthy();
});

// The three non-content states are distinct: a user who may not see analytics
// is told something different from one whose request failed.
it("explains a forbidden dashboard without offering a retry", () => {
  mockState.isForbidden = true;

  render(<AnalyticsDashboard />);

  expect(
    screen.getByText("Analytics are not available for this account."),
  ).toBeTruthy();
  expect(screen.queryByText("Try again")).toBeNull();
});

it("offers a retry when the request failed", () => {
  mockState.error = "gateway down";

  render(<AnalyticsDashboard />);

  expect(screen.getByText("Analytics could not be loaded.")).toBeTruthy();
  expect(screen.getByText("Try again")).toBeTruthy();
});

it("says so when there is simply nothing to show", () => {
  render(<AnalyticsDashboard />);

  expect(screen.getByText("No data yet")).toBeTruthy();
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /c/unirefund/super-app-safe
npx jest src/screens/shared/__tests__/AnalyticsDashboard.router.test.tsx --selectProjects router
```

Expected: FAIL — `Cannot find module '../_components/AnalyticsDashboard'`.

- [ ] **Step 3: Write the dashboard**

Create `src/screens/shared/_components/AnalyticsDashboard.tsx`:

```tsx
import { AnalyticsArea } from "@/components/charts/AnalyticsArea";
import { AnalyticsBar } from "@/components/charts/AnalyticsBar";
import { AnalyticsDonut } from "@/components/charts/AnalyticsDonut";
import { AnalyticsTable } from "@/components/charts/AnalyticsTable";
import { Skeleton } from "@/components/Skeleton";
import { Button, Text } from "@/components/ui";
import { useAnalyticsDashboard } from "@/hooks/useAnalyticsDashboard";
import { useTabBarInset } from "@/hooks/useTabBarInset";
import { useLocalization } from "@/providers/LocalizationProvider";
import { uiLabel } from "@/utils/analytics/labels";
import type { AnalyticsCard } from "@/utils/analytics/types";
import React from "react";
import { View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";

function renderCard(card: AnalyticsCard) {
  switch (card.kind) {
    case "donut":
      return <AnalyticsDonut key={card.id} card={card} />;
    case "bar":
      return <AnalyticsBar key={card.id} card={card} />;
    case "area":
      return <AnalyticsArea key={card.id} card={card} />;
    case "table":
      return <AnalyticsTable key={card.id} card={card} />;
  }
}

function Message({
  text,
  onRetry,
  retryLabel,
}: {
  text: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <Text className="text-center text-base text-muted">{text}</Text>
      {!!onRetry && (
        <View className="mt-4">
          <Button action={{ label: retryLabel ?? "", onPress: onRetry }} />
        </View>
      )}
    </View>
  );
}

export function AnalyticsDashboard() {
  const { activeLocale } = useLocalization();
  const tabInset = useTabBarInset();
  const { cards, isLoading, isForbidden, error, refresh } =
    useAnalyticsDashboard();

  if (isForbidden) {
    return <Message text={uiLabel("forbidden", activeLocale)} />;
  }

  if (isLoading) {
    return (
      <View>
        {[0, 1, 2].map((index) => (
          <Skeleton
            key={index}
            testID="analytics-skeleton"
            className="mb-3 h-60 w-full rounded-2xl"
          />
        ))}
      </View>
    );
  }

  if (error) {
    return (
      <Message
        text={uiLabel("error", activeLocale)}
        onRetry={refresh}
        retryLabel={uiLabel("retry", activeLocale)}
      />
    );
  }

  if (cards.length === 0) {
    return <Message text={uiLabel("noData", activeLocale)} />;
  }

  return (
    <ScrollView
      className="flex-1"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: tabInset }}
    >
      {cards.map(renderCard)}
    </ScrollView>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /c/unirefund/super-app-safe
npx jest src/screens/shared/__tests__/AnalyticsDashboard.router.test.tsx --selectProjects router
npm run typecheck
```

Expected: 5 passing, typecheck clean. `Button`'s prop shape is confirmed:
`action: { onPress: () => void | Promise<void>; label: string }`
(`src/components/ui/Button.tsx:145`), re-exported from `@/components/ui`.

- [ ] **Step 5: Commit**

```bash
cd /c/unirefund/super-app-safe
git add src/screens/shared/_components/AnalyticsDashboard.tsx src/screens/shared/__tests__/AnalyticsDashboard.router.test.tsx
git commit -m "feat(analytics): compose the dashboard from the card list

Four non-content states kept distinct: a user who may not see analytics is
told something different from one whose request failed, and only the second
is offered a retry."
```

---

### Task 12: Replace the three Home screens

**Files:**
- Modify: `src/screens/merchant/Home/HomeScreen.tsx`
- Modify: `src/screens/refund-point/Home/HomeScreen.tsx`
- Modify: `src/screens/customs/Home/HomeScreen.tsx`
- Test: `src/screens/merchant/Home/__tests__/MerchantHomeScreen.router.test.tsx`
- Test: `src/screens/refund-point/Home/__tests__/RefundPointHomeScreen.router.test.tsx`
- Test: `src/screens/customs/Home/__tests__/CustomsAnalyticsHome.router.test.tsx`

**Interfaces:**
- Consumes: `AnalyticsDashboard` (Task 11), `TabPage` from `@/templates/TabPage`,
  `useLocalization`.
- Produces: three default-exported screens. `src/app/(auth)/index.tsx` is
  **not** modified — its import paths already resolve to these files.

- [ ] **Step 1: Write the failing test for merchant**

Create `src/screens/merchant/Home/__tests__/MerchantHomeScreen.router.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import MerchantHomeScreen from "../HomeScreen";

jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({ t: (key: string) => key, activeLocale: "en-US" }),
}));

// Reached through TabPage, which owns the header and its notification bell.
jest.mock("@/providers/NotificationsProvider", () => ({
  useNotifications: () => ({ notifications: [] }),
}));
jest.mock("@/providers/NotificationsSheetProvider", () => ({
  useNotificationsSheet: () => ({ open: jest.fn() }),
}));
jest.mock("@/providers/StoreSwitcherSheetProvider", () => ({
  useStoreSwitcher: () => ({ canSwitch: false, open: jest.fn() }),
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), navigate: jest.fn() },
  useSegments: () => ["(auth)", "index"],
  useFocusEffect: jest.fn(),
}));

jest.mock("@/components/Ionicons", () => ({ Ionicons: () => null }));

jest.mock("@/screens/shared/_components/AnalyticsDashboard", () => ({
  AnalyticsDashboard: () => <Text>analytics-dashboard</Text>,
}));

// TabPage renders SafeAreaView, whose useSafeAreaInsets throws outside a
// provider — jest-setup.ts does not mock react-native-safe-area-context.
const renderHome = () =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <MerchantHomeScreen />
    </SafeAreaProvider>,
  );

it("renders the analytics dashboard under the Home title", () => {
  renderHome();

  expect(screen.getByText("MobileApp.Home.Title")).toBeTruthy();
  expect(screen.getByText("analytics-dashboard")).toBeTruthy();
});

// The safe copy owns these; Home must not still be offering them.
it("no longer offers the create-tag or connected-devices actions", () => {
  renderHome();

  expect(screen.queryByText("MobileApp.CreateTag.Title")).toBeNull();
  expect(screen.queryByText("MobileApp.ConnectedDevices.Title")).toBeNull();
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /c/unirefund/super-app-safe
npx jest src/screens/merchant --selectProjects router
```

Expected: FAIL — the old screen still renders the two action cards.

- [ ] **Step 3: Replace the merchant screen**

Overwrite `src/screens/merchant/Home/HomeScreen.tsx` entirely:

```tsx
import { useLocalization } from "@/providers/LocalizationProvider";
import { AnalyticsDashboard } from "@/screens/shared/_components/AnalyticsDashboard";
import TabPage from "@/templates/TabPage";
import React from "react";

export default function Page() {
  const { t } = useLocalization();

  return (
    <TabPage title={t("MobileApp.Home.Title")}>
      <AnalyticsDashboard />
    </TabPage>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
cd /c/unirefund/super-app-safe
npx jest src/screens/merchant --selectProjects router
```

Expected: 2 passing.

- [ ] **Step 5: Do the same for refund-point**

Create `src/screens/refund-point/Home/__tests__/RefundPointHomeScreen.router.test.tsx`
as an exact copy of the merchant suite, with these three changes:
the import becomes `import RefundPointHomeScreen from "../HomeScreen";`,
`renderHome` renders `<RefundPointHomeScreen />` inside the same
`SafeAreaProvider`, and the second test's assertions become:

```tsx
  expect(screen.queryByText("MobileApp.Refund.Title")).toBeNull();
  expect(screen.queryByText("MobileApp.Home.RefundPointPlaceholder")).toBeNull();
```

Then overwrite `src/screens/refund-point/Home/HomeScreen.tsx` with the same
five-line screen as Step 3 (identical content — the file is kept separate so a
role can diverge later without unpicking a shared one).

- [ ] **Step 6: Do the same for customs**

Create `src/screens/customs/Home/__tests__/CustomsAnalyticsHome.router.test.tsx`
as an exact copy of the merchant suite, with the import becoming
`import CustomsHomeScreen from "../HomeScreen";`, `renderHome` rendering
`<CustomsHomeScreen />` inside the same `SafeAreaProvider`, and the second
test's assertions becoming:

```tsx
  expect(screen.queryByText("MobileApp.Customs.Home.DateToday")).toBeNull();
```

Then overwrite `src/screens/customs/Home/HomeScreen.tsx` with the same five-line
screen.

The new file name avoids colliding with `CustomsHomeScreen.router.test.tsx`,
which Task 1 repointed at the classic copy and which must keep passing.

- [ ] **Step 7: Run the full gate**

```bash
cd /c/unirefund/super-app-safe
npm run typecheck
npm test 2>&1 | tail -40
```

Expected: typecheck clean. Every suite passes except the pre-existing
`tokens.test.ts` failure recorded in Task 1 Step 1. The four customs suites from
Task 1 must still pass against `HomeScreen.classic.tsx`.

- [ ] **Step 8: Confirm the router still resolves all four roles**

```bash
cd /c/unirefund/super-app-safe
cat "src/app/(auth)/index.tsx"
```

Expected: unchanged, still importing `@/screens/*/Home/HomeScreen` for merchant,
refund-point and customs, and the traveller screen untouched.

- [ ] **Step 9: Commit**

```bash
cd /c/unirefund/super-app-safe
git add src/screens/merchant/Home src/screens/refund-point/Home src/screens/customs/Home
git commit -m "feat(home): make analytics the Home screen for all three staff roles

Each Home is now TabPage + AnalyticsDashboard; the screen it replaced lives
beside it as HomeScreen.classic.tsx, still tested. The flows those screens
owned (create-tag, connected-devices, refund, the customs worklist) have no
entry point until they are re-homed."
```

---

## Verification

After Task 12, before reporting the work complete:

- [ ] `npm run typecheck` — clean.
- [ ] `npm test` — only `tokens.test.ts` fails, matching the Task 1 baseline.
- [ ] `npx expo start` and open each role on the debuggable device. The charts
      are Skia-rendered, so no test proves they draw — a screenshot per role is
      the only evidence. Capture one for merchant, refund-point and customs.
- [ ] Confirm `git status` is clean and no file under `C:\unirefund\super-app`
      was touched.

## Follow-up work, deliberately not in this plan

- Re-homing create-tag, connected-devices, refund and the customs worklist.
- Adding `MobileApp.Analytics.*` to the backend localization resource and
  collapsing `labels.ts` into `t()`.
- Any layout customization.
- Deleting the `.classic.tsx` copies.

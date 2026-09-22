# Switchable Tag-Row Designs (V1/V2/V3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an install choose between three portrait tag-row designs — today's card, a flat ledger row with a 6px edge bar, and the same row washed at 10% — from a picker in Profile.

**Architecture:** A persisted zustand store holds the choice. One new presentational row component (`TagRow`) renders both new designs, differing only by a `tint` prop. The two list surfaces branch on the stored value; `TagCard` and `CustomsTagRow` are never modified, so V1 cannot regress.

**Tech Stack:** React Native (Expo), zustand + `persist` + AsyncStorage, NativeWind, jest with two projects (`node` and `router`).

**Spec:** `docs/superpowers/specs/2026-09-22-superapp-tag-row-versions-design.md`

## Global Constraints

- Render tests MUST be named `*.router.test.tsx` — the repo's jest `router` project only picks those up. Non-render tests are `*.test.ts`.
- Adding a localization key makes `tsc` fail at `src/localization/config.ts` with a "language-data bundle is stale" error. That is the guard working: run `npm run init` (reads `SUPPORTED_LOCALES` from `.env`, already set). It regenerates a gitignored bundle and adds nothing to `git status`.
- **This checkout is shared with other agent sessions.** Stage explicit file paths only — never `git add -A` or `git add <directory>`. If a file you must edit also contains someone else's uncommitted change (the localization JSONs are the usual case), stage only your hunk (see Task 6).
- Baseline gates, for comparison: `npx tsc --noEmit` reports exactly one pre-existing error, in `src/app/__tests__/tabBackNavigation.router.test.tsx`. `npx jest` is fully green. `npx eslint src/screens/shared/Tags/Tag/landscape/_components/cells.tsx` has two pre-existing duplicate-import warnings.
- Stored design values are `"classic" | "pill" | "tinted"` — V1, V2, V3 respectively. Use these strings exactly; they are persisted.
- Exact visual values, copied from the spec: bar `width: 6px`, no left margin, 12px vertical inset, `border-radius: 0 999px 999px 0`. Wash `#RRGGBB1A` (10% alpha) flat over white. Dividers `#D1D5DB`, stepping to `#9CA3AF` on any boundary touching a selected row.
- Status-word colours in the new row MUST be `#15803D` (success) and `#B45309` (warning), not the `success`/`warning` tokens — those are ~3.1:1 on white and fail AA for text this size. Info `#1D4ED8`, error `#DC2626`, neutral `#6B7280`.

---

### Task 1: The persisted design store

**Files:**
- Create: `src/store/tagRowDesign.ts`
- Test: `src/store/__tests__/tagRowDesign.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export type TagRowDesign = "classic" | "pill" | "tinted"`
  - `export const DEFAULT_TAG_ROW_DESIGN: TagRowDesign` (value `"classic"`)
  - `export function useTagRowDesign(): TagRowDesign`
  - default export `useTagRowDesignStore`, a zustand store with `{ design: TagRowDesign; setDesign: (d: TagRowDesign) => void }`

- [ ] **Step 1: Write the failing test**

Create `src/store/__tests__/tagRowDesign.test.ts`:

```ts
import useTagRowDesignStore, {
  DEFAULT_TAG_ROW_DESIGN,
  type TagRowDesign,
} from "@/store/tagRowDesign";

/**
 * The stored value is typed `TagRowDesign` at every read site, so a value left
 * behind by a renamed or removed variant must never be cast through — it would
 * reach a row that has no branch for it.
 */

const initial = useTagRowDesignStore.getState();

beforeEach(() => {
  useTagRowDesignStore.setState(initial, true);
});

it("opens on the current design, so nothing changes until someone opts in", () => {
  expect(DEFAULT_TAG_ROW_DESIGN).toBe("classic");
  expect(useTagRowDesignStore.getState().design).toBe("classic");
});

it("stores a chosen design", () => {
  useTagRowDesignStore.getState().setDesign("tinted");
  expect(useTagRowDesignStore.getState().design).toBe("tinted");
});

it("keeps every variant the rows can actually render", () => {
  for (const design of ["classic", "pill", "tinted"] as TagRowDesign[]) {
    useTagRowDesignStore.getState().setDesign(design);
    expect(useTagRowDesignStore.getState().design).toBe(design);
  }
});

// The merge guard: persisted junk falls back rather than reaching a row.
it("falls back to the default when the stored value is not a design", () => {
  const { merge } = useTagRowDesignStore.persist.getOptions();
  const current = { ...initial, design: "classic" as TagRowDesign };

  expect(merge!({ design: "neon" }, current).design).toBe("classic");
  expect(merge!({ design: 7 }, current).design).toBe("classic");
  expect(merge!(undefined, current).design).toBe("classic");
  expect(merge!({ design: "tinted" }, current).design).toBe("tinted");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/store/__tests__/tagRowDesign.test.ts`
Expected: FAIL — `Cannot find module '@/store/tagRowDesign'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/store/tagRowDesign.ts`:

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Which portrait tag-row design to render.
 *
 * - `classic` — the card that ships today.
 * - `pill` — the flat ledger row, colour carried by a bar at the leading edge.
 * - `tinted` — the same row, colour carried by a 10% wash across all of it.
 *
 * `pill` and `tinted` differ in one thing that matters: `pill` leaves the row
 * background free, so selection can use it; `tinted` spends it on status, so a
 * selected row is marked by its tick and by heavier rules instead. Both cannot
 * have it, which is the comparison this switch exists to settle.
 */
export type TagRowDesign = "classic" | "pill" | "tinted";

/**
 * What an install with no stored choice gets, and the whole ship/unship switch:
 * leave it `"classic"` and the new rows are reachable only by opting in.
 */
export const DEFAULT_TAG_ROW_DESIGN: TagRowDesign = "classic";

interface TagRowDesignStore {
  design: TagRowDesign;
  setDesign: (design: TagRowDesign) => void;
}

const DESIGNS: TagRowDesign[] = ["classic", "pill", "tinted"];

function isDesign(value: unknown): value is TagRowDesign {
  return DESIGNS.includes(value as TagRowDesign);
}

/**
 * Persisted per install rather than per account, like `deviceSettings`: a
 * shared shop tablet keeps the choice when staff sign in and out.
 */
const useTagRowDesignStore = create<TagRowDesignStore>()(
  persist(
    (set) => ({
      design: DEFAULT_TAG_ROW_DESIGN,
      setDesign: (design: TagRowDesign) => set({ design }),
    }),
    {
      name: "tag-row-design-storage",
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      merge: (persisted, current) => {
        const stored = (persisted as Partial<TagRowDesignStore> | undefined)
          ?.design;
        return { ...current, design: isDesign(stored) ? stored : current.design };
      },
    },
  ),
);

/** The active tag-row design. */
export function useTagRowDesign(): TagRowDesign {
  return useTagRowDesignStore((state) => state.design);
}

export default useTagRowDesignStore;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/store/__tests__/tagRowDesign.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/store/tagRowDesign.ts src/store/__tests__/tagRowDesign.test.ts
git commit -F - <<'MSG'
feat(tags): add the persisted tag-row design choice

Three row designs the install picks between. Defaults to `classic`, so
nothing changes for anyone until they opt in — flipping that constant is
the whole ship/unship lever.

Mirrors `profileDesign`, including the merge guard: a value left by a
renamed variant must not be cast through, because `design` is typed at
every read site and would reach a row with no branch for it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 2: The status/risk colour map for the new row

**Files:**
- Create: `src/utils/tagRowTone.ts`
- Test: `src/utils/__tests__/tagRowTone.test.ts`

**Interfaces:**
- Consumes: `tagStatusTone` from `@/utils/tagStatus`, `effectiveRiskLevel` from `@/utils/customsTags`.
- Produces:
  - `export type TagRowToneSource = "risk" | "status"`
  - `export interface TagRowTone { fill: string; text: string }`
  - `export function tagRowTone(tag: TagListItem, source: TagRowToneSource): TagRowTone`

`fill` is the saturated token for the bar and the wash. `text` is the AA-safe variant for the status word. Splitting them is the point of this module: a fill is a shape and may use the raw token, but the same colour on 11px text fails AA.

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/tagRowTone.test.ts`:

```ts
import { tagRowTone } from "@/utils/tagRowTone";
import type { TagListItem } from "@/store/tag";

/**
 * A fill and a text colour are not the same value. `success` (#16A34A) and
 * `warning` (#D97706) are ~3.1:1 on white — fine behind a 6px bar, below AA for
 * the 11px status word. So every tone carries both.
 */

const tag = (over: Partial<TagListItem>) => ({ id: "t", ...over }) as TagListItem;

it("states a status with the saturated fill and the AA-safe text", () => {
  expect(tagRowTone(tag({ status: "Issued" }), "status")).toEqual({
    fill: "#2563EB",
    text: "#1D4ED8",
  });
});

it("darkens success and warning for text, and leaves the fill saturated", () => {
  expect(tagRowTone(tag({ status: "Refunded" }), "status")).toEqual({
    fill: "#16A34A",
    text: "#15803D",
  });
  expect(tagRowTone(tag({ status: "WaitingStampValidation" }), "status")).toEqual(
    { fill: "#D97706", text: "#B45309" },
  );
});

// Customs triages by risk, and the summary tiles above the list filter on it,
// so the row's colour has to be the same field those tiles count.
it("states risk rather than status when customs is reading", () => {
  const red = tag({ status: "Issued", risk: { riskLevel: "Red" } } as never);
  expect(tagRowTone(red, "risk").fill).toBe("#DC2626");
  expect(tagRowTone(red, "status").fill).toBe("#2563EB");
});

it("prefers the final risk level over the first one", () => {
  const settled = tag({
    risk: { riskLevel: "Red", finalRiskLevel: "Green" },
  } as never);
  expect(tagRowTone(settled, "risk").fill).toBe("#16A34A");
});

// `customsRiskEdge` returns "" here and the row falls back to the border token,
// which is now fainter than the divider beside it. A neutral that holds the
// same weight is the point.
it("gives a tag with no verdict a neutral that is not invisible", () => {
  expect(tagRowTone(tag({}), "risk")).toEqual({
    fill: "#D1D5DB",
    text: "#6B7280",
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/utils/__tests__/tagRowTone.test.ts`
Expected: FAIL — `Cannot find module '@/utils/tagRowTone'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/tagRowTone.ts`:

```ts
import type { TagListItem } from "@/store/tag";
import { effectiveRiskLevel } from "@/utils/customsTags";
import { tagStatusTone } from "@/utils/tagStatus";

/** Which field the row's colour states. */
export type TagRowToneSource = "risk" | "status";

export interface TagRowTone {
  /** The bar and the wash. A shape, so it may use the saturated token. */
  fill: string;
  /** The status word. 11px text, so success and warning drop a step for AA. */
  text: string;
}

const NEUTRAL: TagRowTone = { fill: "#D1D5DB", text: "#6B7280" };

const BY_STATUS_TONE: Record<string, TagRowTone> = {
  success: { fill: "#16A34A", text: "#15803D" },
  info: { fill: "#2563EB", text: "#1D4ED8" },
  warning: { fill: "#D97706", text: "#B45309" },
  error: { fill: "#DC2626", text: "#DC2626" },
  neutral: NEUTRAL,
};

const BY_RISK: Record<string, TagRowTone> = {
  Green: { fill: "#16A34A", text: "#15803D" },
  Red: { fill: "#DC2626", text: "#DC2626" },
  EvaluationFailed: { fill: "#D97706", text: "#B45309" },
  Unknown: NEUTRAL,
};

/**
 * The row's colour, as a fill and a text pair.
 *
 * `source` is passed in rather than derived from the role, so the row stays
 * presentational and the decision sits with the list, which already knows who
 * is reading.
 */
export function tagRowTone(
  tag: TagListItem,
  source: TagRowToneSource,
): TagRowTone {
  if (source === "risk") {
    const level = effectiveRiskLevel(tag);
    return (level && BY_RISK[level]) ?? NEUTRAL;
  }
  return BY_STATUS_TONE[tagStatusTone(tag.status)] ?? NEUTRAL;
}
```

If `effectiveRiskLevel` is not exported from `@/utils/customsTags`, export it — it already exists there as a module-local helper used by `customsRiskEdge` and `customsRiskSurface`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/utils/__tests__/tagRowTone.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/tagRowTone.ts src/utils/__tests__/tagRowTone.test.ts
git commit -F - <<'MSG'
feat(tags): split the row's colour into a fill and a text tone

A fill is a shape and may use the saturated token; the same colour on the
11px status word is not. `success` (#16A34A) and `warning` (#D97706) are
~3.1:1 on white, so the text pair drops them to #15803D and #B45309.

`source` is a parameter rather than something derived from the role: the
list knows who is reading, and the row stays presentational. Customs
states risk because that is what it triages by and what the summary tiles
above the list filter on.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 3: The `TagRow` component

**Files:**
- Create: `src/screens/shared/_components/TagRow.tsx`
- Test: `src/screens/shared/_components/__tests__/TagRow.router.test.tsx`

**Interfaces:**
- Consumes: `tagRowTone`, `TagRowToneSource` (Task 2); `tagHeadlineAmount`, `tagHeadlineAmountKind`, `tagStatusLabelKey` from `@/utils/tagStatus`.
- Produces: `export const TagRow` with props:

```ts
{
  tag: TagListItem;
  tint: "pill" | "wash";
  tone: TagRowToneSource;
  secondary?: string | null;
  currencyCode: string;
  formatDate: (isoDate?: string | null) => string;
  formatAmount: (amount: number | null) => string;
  onSelect: (tag: TagListItem) => void;
  leading?: React.ReactNode;
  selected?: boolean;
  testID?: string;
}
```

- [ ] **Step 1: Write the failing test**

Create `src/screens/shared/_components/__tests__/TagRow.router.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";
import { TagRow } from "../TagRow";
import type { TagListItem } from "@/store/tag";

jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({
    t: (key: string) => key.split(".").pop() ?? key,
    activeLocale: "en-US",
  }),
}));
jest.mock("@/components/Ionicons", () => ({ Ionicons: () => null }));

const TAG = {
  id: "tag-1",
  tagNumber: "FRO2026091200412",
  status: "Issued",
  salesAmount: 12480,
  currency: "TRY",
  issueDate: "2026-09-12T00:00:00Z",
} as unknown as TagListItem;

const props = {
  tag: TAG,
  tone: "status" as const,
  secondary: "Anna Kowalska",
  currencyCode: "TRY",
  formatDate: () => "12 Sep 2026",
  formatAmount: (n: number | null) => String(n ?? 0),
  onSelect: jest.fn(),
};

it("names the tag, who it belongs to, and the full date", () => {
  render(<TagRow {...props} tint="pill" />);

  expect(screen.getByText("FRO2026091200412")).toBeTruthy();
  expect(screen.getByText("Anna Kowalska")).toBeTruthy();
  expect(screen.getByText(/12 Sep 2026/)).toBeTruthy();
});

// The app already computes which figure this is and only the Home hero prints
// it, so a list row shows a bold number that could be either.
it("captions the money so a refund cannot read as a purchase", () => {
  render(<TagRow {...props} tint="pill" />);
  expect(screen.getByText("PurchaseAmount")).toBeTruthy();
});

it("carries the colour in a bar when the design is the pill", () => {
  render(<TagRow {...props} tint="pill" testID="row" />);

  expect(screen.getByTestId("tag-row-bar")).toBeTruthy();
  expect(screen.queryByTestId("tag-row-wash")).toBeNull();
});

it("carries the colour in the row itself when the design is tinted", () => {
  render(<TagRow {...props} tint="wash" testID="row" />);

  expect(screen.getByTestId("tag-row-wash")).toBeTruthy();
  expect(screen.queryByTestId("tag-row-bar")).toBeNull();
});

// Selection needs the row background, and `wash` has spent it. The list marks
// a tinted selection with its tick and heavier rules instead.
it("fills a selected row only when the tint has left the background free", () => {
  const { rerender } = render(<TagRow {...props} tint="pill" selected />);
  expect(screen.getByTestId("tag-row-selected")).toBeTruthy();

  rerender(<TagRow {...props} tint="wash" selected />);
  expect(screen.queryByTestId("tag-row-selected")).toBeNull();
});

it("renders a leading control only when the list gives it one", () => {
  const { rerender } = render(<TagRow {...props} tint="pill" />);
  expect(screen.queryByText("tick")).toBeNull();

  rerender(<TagRow {...props} tint="pill" leading={<Text>tick</Text>} />);
  expect(screen.getByText("tick")).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/screens/shared/_components/__tests__/TagRow.router.test.tsx`
Expected: FAIL — `Cannot find module '../TagRow'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/screens/shared/_components/TagRow.tsx`:

```tsx
import { Text } from "@/components/ui";
import { useLocalization } from "@/providers/LocalizationProvider";
import type { TagListItem } from "@/store/tag";
import { tagRowTone, type TagRowToneSource } from "@/utils/tagRowTone";
import {
  tagHeadlineAmount,
  tagHeadlineAmountKind,
  tagStatusLabelKey,
} from "@/utils/tagStatus";
import React from "react";
import { Pressable, View } from "react-native";

/** The selected row's fill. Only `pill` can afford it — see `tint`. */
const SELECTED_FILL = "#FFF5F5";

/**
 * One tag, as a flat ledger row: identity on the left, money on the right, on a
 * surface the list rules rather than a card of its own.
 *
 * `tint` is the whole difference between the two new designs, and it decides
 * more than a colour. `pill` puts the colour in a bar at the leading edge and
 * leaves the row's background free, so a selected row can fill. `wash` spends
 * the background on status, so `selected` is ignored here and the list marks a
 * selection with its tick and heavier rules instead. Both cannot have it.
 *
 * Presentational: `tone` says which field the colour states, because the list
 * knows the role and this does not.
 */
export const TagRow = React.memo(function TagRow({
  tag,
  tint,
  tone: toneSource,
  secondary,
  currencyCode,
  formatDate,
  formatAmount,
  onSelect,
  leading,
  selected,
  testID,
}: {
  tag: TagListItem;
  tint: "pill" | "wash";
  tone: TagRowToneSource;
  secondary?: string | null;
  currencyCode: string;
  formatDate: (isoDate?: string | null) => string;
  formatAmount: (amount: number | null) => string;
  onSelect: (tag: TagListItem) => void;
  /** The customs checkbox. A slot, so the row never grows one of its own. */
  leading?: React.ReactNode;
  selected?: boolean;
  testID?: string;
}) {
  const { t } = useLocalization();
  const tone = tagRowTone(tag, toneSource);
  const kind = tagHeadlineAmountKind(tag);
  const washed = tint === "wash";
  const fills = !washed && selected;

  return (
    <Pressable
      testID={testID}
      onPress={() => onSelect(tag)}
      accessibilityRole="button"
      accessibilityState={selected === undefined ? undefined : { selected }}
      className="flex-row items-stretch"
      style={{
        backgroundColor: washed
          ? `${tone.fill}1A`
          : fills
            ? SELECTED_FILL
            : undefined,
      }}
    >
      {/* Two testIDs rather than one: a suite has to be able to say which
          treatment rendered, and they are mutually exclusive by construction. */}
      {washed ? (
        <View testID="tag-row-wash" />
      ) : (
        <View
          testID="tag-row-bar"
          style={{
            width: 6,
            marginVertical: 12,
            borderTopRightRadius: 999,
            borderBottomRightRadius: 999,
            backgroundColor: tone.fill,
          }}
        />
      )}
      {fills ? <View testID="tag-row-selected" /> : null}

      {leading ? (
        <View className="justify-center pl-3">{leading}</View>
      ) : null}

      <View className="flex-1 flex-row items-stretch gap-3 px-4 py-3">
        <View className="min-w-0 flex-1 gap-1">
          <Text
            className="font-serial text-[13px] font-semibold tracking-wide text-foreground"
            numberOfLines={1}
          >
            {tag.tagNumber}
          </Text>
          <Text
            className="text-[15px] font-semibold text-foreground"
            numberOfLines={1}
          >
            {secondary}
          </Text>
          <View className="min-w-0 flex-row items-center gap-1.5">
            <Text
              className="text-[11px] font-semibold"
              style={{ color: tone.text }}
              numberOfLines={1}
            >
              {t(tagStatusLabelKey(tag.status))}
            </Text>
            <Text className="text-[11px] text-muted" numberOfLines={1}>
              {`· ${formatDate(tag.issueDate)}`}
            </Text>
          </View>
        </View>

        <View className="w-28 shrink-0 items-end gap-1">
          {/* The app already knew which figure this is; only the Home hero
              printed it, so a list row showed a number that could be either. */}
          <Text className="text-[9px] font-bold uppercase tracking-widest text-placeholder">
            {t(
              kind === "refund"
                ? "MobileApp.Tags.RefundAmount"
                : "MobileApp.Tags.PurchaseAmount",
            )}
          </Text>
          <Text
            className="font-serial text-[17px] font-bold leading-tight text-foreground"
            numberOfLines={1}
          >
            {formatAmount(tagHeadlineAmount(tag))}
          </Text>
          <Text className="text-[10px] font-semibold text-muted">
            {tag.currency ?? currencyCode}
          </Text>
        </View>
      </View>
    </Pressable>
  );
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/screens/shared/_components/__tests__/TagRow.router.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/screens/shared/_components/TagRow.tsx src/screens/shared/_components/__tests__/TagRow.router.test.tsx
git commit -F - <<'MSG'
feat(tags): add the flat ledger row behind both new designs

One component for V2 and V3: they differ only in where the colour goes,
so `tint` picks a 6px bar at the leading edge or a 10% wash across the
row, and nothing else changes.

That difference decides what selection can use. `pill` leaves the row
background free, so a selected row fills; `wash` has spent it on status,
so the row ignores `selected` and the list marks it another way.

Identity left, money right, and the money finally says whether it is a
purchase or a refund — `tagHeadlineAmountKind` already knew and only the
Home hero printed it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 4: The tags list renders the chosen design

**Files:**
- Modify: `src/screens/shared/Tags/Tag/TagScreen.tsx` (the `renderItem` callback, ~line 690)
- Test: `src/screens/shared/Tags/Tag/__tests__/TagScreenRowDesign.router.test.tsx`

**Interfaces:**
- Consumes: `useTagRowDesign` (Task 1), `TagRow` (Task 3).
- Produces: nothing new. `renderItem` returns `TagCard` for `classic`, `TagRow` for the other two.

- [ ] **Step 1: Write the failing test**

Create `src/screens/shared/Tags/Tag/__tests__/TagScreenRowDesign.router.test.tsx`. Copy the mock block verbatim from `TagScreenTravellerFilter.router.test.tsx` (LocalizationProvider, NotificationsProvider, expo-router, useLoadTags, useVerifications, Ionicons, SearchTraveller, ToastProvider, TravellerService, TagFilterSheet, UploadVerificationSheet, useLandscape → false), then add:

```tsx
import useTagRowDesignStore from "@/store/tagRowDesign";

jest.mock("@/actions/TagService/actions", () => ({
  getTagSummaryApi: jest.fn().mockResolvedValue(null),
}));

// Probes rather than the real rows: what is under test is which component the
// list picks, and each row has its own suite.
jest.mock("@/screens/shared/_components/TagCard", () => {
  const { Text } = jest.requireActual<typeof import("react-native")>("react-native");
  const React = jest.requireActual<typeof import("react")>("react");
  return { TagCard: () => React.createElement(Text, null, "classic-row") };
});
jest.mock("@/screens/shared/_components/TagRow", () => {
  const { Text } = jest.requireActual<typeof import("react-native")>("react-native");
  const React = jest.requireActual<typeof import("react")>("react");
  return {
    TagRow: ({ tint, tone }: { tint: string; tone: string }) =>
      React.createElement(Text, null, `ledger-row:${tint}:${tone}`),
  };
});
```

Seed one tag into `useTagStore` in `beforeEach` (`setTags({ items: [{ id: "t1", tagNumber: "FRO1", status: "Issued" }], totalCount: 1 })`), sign in as `merchant`, and reset `useTagRowDesignStore` to `classic`. Then:

```tsx
it("renders today's card while the choice is the current design", async () => {
  useTagRowDesignStore.getState().setDesign("classic");
  signIn("merchant");
  renderScreen();

  expect(await screen.findByText("classic-row")).toBeTruthy();
  expect(screen.queryByText(/ledger-row/)).toBeNull();
});

it("renders the ledger row with a bar when the choice is the pill", async () => {
  useTagRowDesignStore.getState().setDesign("pill");
  signIn("merchant");
  renderScreen();

  expect(await screen.findByText("ledger-row:pill:status")).toBeTruthy();
});

it("renders the ledger row washed when the choice is tinted", async () => {
  useTagRowDesignStore.getState().setDesign("tinted");
  signIn("merchant");
  renderScreen();

  expect(await screen.findByText("ledger-row:wash:status")).toBeTruthy();
});

// Customs triages by risk; every other role reads status. Same row, same tint,
// different field — so this is the list's call, not the row's.
it("tells the row to state risk for customs and status for everyone else", async () => {
  useTagRowDesignStore.getState().setDesign("pill");
  signIn("customs");
  renderScreen();

  expect(await screen.findByText("ledger-row:pill:risk")).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/screens/shared/Tags/Tag/__tests__/TagScreenRowDesign.router.test.tsx`
Expected: FAIL — the ledger tests find `classic-row`, because the branch does not exist.

- [ ] **Step 3: Write minimal implementation**

In `TagScreen.tsx`, add `const rowDesign = useTagRowDesign();` beside the other store reads, then branch inside `renderItem`:

```tsx
const renderItem = useCallback(
  ({ item }: { item: TagListItem }) => {
    if (rowDesign !== "classic") {
      return (
        <TagRow
          tag={item}
          tint={rowDesign === "pill" ? "pill" : "wash"}
          // Customs triages by risk, and the tiles above this list filter on
          // it, so pressing High leaves exactly the red rows on screen.
          tone={role === "customs" ? "risk" : "status"}
          secondary={isStaff ? item.travellerFullName : item.merchantTitle}
          currencyCode={tenantCurrency}
          formatDate={formatDate}
          formatAmount={formatAmount}
          onSelect={onSelect}
        />
      );
    }
    return (/* the existing TagCard call, unchanged */);
  },
  [rowDesign, role, isStaff, canViewRisk, tintByRisk, tenantCurrency, formatDate, formatAmount, onSelect],
);
```

Add `rowDesign` and `role` to the dependency array. Leave the `TagCard` branch byte-identical.

The flat row has no card and no gap, so the list has to rule between rows itself. The `FlashList` that renders these currently spaces rows with a 12px gap; for a non-`classic` design drop that and give it a separator instead:

```tsx
// V1 rows are cards with their own border and a gap; the flat rows are not,
// so the list draws the line between them. No selection on this surface, so
// every rule is the base weight — the customs worklist is where that changes.
ItemSeparatorComponent={
  rowDesign === "classic"
    ? undefined
    : () => <View className="h-px bg-[#D1D5DB] ml-4" />
}
```

and make the existing gap conditional on `rowDesign === "classic"` so the flat rows sit flush against their separators.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/screens/shared/Tags/Tag/__tests__/TagScreenRowDesign.router.test.tsx`
Expected: PASS, 4 tests.

Then run the whole Tags suite to prove V1 is untouched:
Run: `npx jest src/screens/shared/Tags`
Expected: PASS, every existing test included. If an existing test needs editing, the branch is wrong — fix the branch, not the test.

- [ ] **Step 5: Commit**

```bash
git add src/screens/shared/Tags/Tag/TagScreen.tsx src/screens/shared/Tags/Tag/__tests__/TagScreenRowDesign.router.test.tsx
git commit -F - <<'MSG'
feat(tags): render the chosen row design in the portrait list

The branch sits in `renderItem` and the `TagCard` arm is byte-identical,
so the choice cannot regress what ships today.

Which field the colour states is decided here rather than in the row:
the list knows the role, and customs is the one that triages by risk.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 5: The customs worklist renders the chosen design

**Files:**
- Modify: `src/screens/customs/Home/_components/CustomsTagList.tsx`
- Test: `src/screens/customs/Home/__tests__/CustomsTagListRowDesign.router.test.tsx`

**Interfaces:**
- Consumes: `useTagRowDesign` (Task 1), `TagRow` (Task 3), `isTagSelectable` from `@/utils/tagActions`.
- Produces: nothing new.

The customs list owns two things the row cannot: the checkbox it passes as `leading`, and the divider weight — **only the list knows both neighbours of a boundary**, so a row cannot decide whether its own rule should be heavy.

- [ ] **Step 1: Write the failing test**

Create `src/screens/customs/Home/__tests__/CustomsTagListRowDesign.router.test.tsx`, mocking `TagRow` and `CustomsTagRow` as probes exactly as Task 4 mocks its two rows (the `TagRow` probe should also render `leading`, so the checkbox can be asserted). Render `CustomsTagList` with two tags, `selectedIds={["t1"]}`, and assert:

```tsx
it("renders the customs row while the choice is the current design", () => {
  useTagRowDesignStore.getState().setDesign("classic");
  renderList();

  expect(screen.getAllByText("customs-row")).toHaveLength(2);
  expect(screen.queryByText(/ledger-row/)).toBeNull();
});

it("renders the ledger row stating risk when a new design is chosen", () => {
  useTagRowDesignStore.getState().setDesign("pill");
  renderList();

  expect(screen.getAllByText(/ledger-row:pill:risk/)).toHaveLength(2);
});

// A worklist is worked by ticking rows, so the checkbox has to survive the
// swap — the row takes it as a slot rather than growing one of its own.
it("keeps the checkbox on a selectable row", () => {
  useTagRowDesignStore.getState().setDesign("pill");
  renderList();

  expect(screen.getAllByRole("checkbox")).toHaveLength(2);
});

// `isTagSelectable` already decides this; a decided tag keeps its row and
// loses its tick rather than vanishing from the list.
it("gives a tag that cannot be acted on no checkbox", () => {
  useTagRowDesignStore.getState().setDesign("pill");
  renderList({ tags: [SELECTABLE, ALREADY_VALIDATED] });

  expect(screen.getAllByRole("checkbox")).toHaveLength(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/screens/customs/Home/__tests__/CustomsTagListRowDesign.router.test.tsx`
Expected: FAIL — the ledger tests find `customs-row`.

- [ ] **Step 3: Write minimal implementation**

Read the design with `useTagRowDesign()` and branch where `CustomsTagRow` is rendered (~line 146):

```tsx
const rowDesign = useTagRowDesign();
const picked = (tag: TagRow) => selectedIds.includes(tag.id!);

/**
 * The rule between two rows.
 *
 * Heavier when it TOUCHES a selection, not merely when it follows one: that is
 * what frames a selected block instead of underlining single rows, and it is
 * why this lives in the list. A row sees only itself; only the list sees both
 * neighbours of a boundary.
 */
const separatorFor = (above?: TagRow, below?: TagRow) =>
  (above && picked(above)) || (below && picked(below))
    ? "#9CA3AF"
    : "#D1D5DB";

function renderLedgerRow(tag: TagRow, index: number) {
  const selectable = isTagSelectable(tag);
  const checked = picked(tag);
  return (
    <React.Fragment key={tag.id}>
      {index > 0 ? (
        <View
          className="h-px"
          style={{
            marginLeft: 54,
            backgroundColor: separatorFor(tags[index - 1], tag),
          }}
        />
      ) : null}
      <TagRow
        tag={tag as TagListItem}
        tint={rowDesign === "pill" ? "pill" : "wash"}
        tone="risk"
        secondary={tag.travellerFullName}
        selected={checked}
        currencyCode={tenantCurrency}
        formatDate={formatDate}
        formatAmount={formatAmount}
        onSelect={(t) => onOpenTag?.(t)}
        leading={
          // Omitted, never disabled: a disabled Pressable does not consume the
          // touch, so tapping a greyed box fell through and opened the tag.
          selectable && !disabled ? (
            <Pressable
              onPress={() => onToggle(tag)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              hitSlop={8}
            >
              <Ionicons
                name={checked ? "checkbox" : "square-outline"}
                size={22}
                color={checked ? colors.primary : colors.placeholder}
              />
            </Pressable>
          ) : undefined
        }
      />
    </React.Fragment>
  );
}
```

Then in the list body, use `rowDesign === "classic" ? tags.map(renderCustomsRow) : tags.map(renderLedgerRow)`, leaving the existing `CustomsTagRow` path untouched.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/screens/customs/Home/__tests__/CustomsTagListRowDesign.router.test.tsx`
Expected: PASS, 4 tests.

Run: `npx jest src/screens/customs`
Expected: PASS, existing customs tests included.

- [ ] **Step 5: Commit**

```bash
git add src/screens/customs/Home/_components/CustomsTagList.tsx src/screens/customs/Home/__tests__/CustomsTagListRowDesign.router.test.tsx
git commit -F - <<'MSG'
feat(customs): render the chosen row design in the worklist

The list keeps the two things a row cannot decide alone: the checkbox it
passes down as a slot, and the divider weight — only the list sees both
neighbours of a boundary, so only it can know a rule frames a selection.

A tag `isTagSelectable` rejects keeps its row and loses its tick. The tick
is omitted rather than disabled: a disabled Pressable does not consume the
touch, so tapping a greyed box opened the tag instead.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 6: The picker screen and its copy

**Files:**
- Create: `src/screens/shared/Settings/TagRowDesignScreen.tsx`
- Create: `src/app/(auth)/(modals)/tag-row-design.tsx`
- Modify: `src/localization/resources/en-US.json`, `src/localization/resources/tr-TR.json`
- Test: `src/screens/shared/Settings/__tests__/TagRowDesignScreen.router.test.tsx`

**Interfaces:**
- Consumes: `useTagRowDesignStore` (Task 1), `ModalTemplate` from `@/templates/Modal`.
- Produces: default export `TagRowDesignScreen`; the route `/(auth)/(modals)/tag-row-design`.

- [ ] **Step 1: Add the copy**

In `en-US.json`, inside the existing `MobileApp.Profile` object add `"TagRowDesign": "Tag list style"`, and add a new sibling block:

```json
"TagRowDesign": {
  "Title": "Tag list style",
  "Description": "Changes how each tag is drawn in your Tags list.",
  "Classic": "Current",
  "ClassicHint": "The card you have now.",
  "Pill": "Compact",
  "PillHint": "Shorter rows with a colour bar down the edge.",
  "Tinted": "Tinted",
  "TintedHint": "Shorter rows, each tinted by its status."
}
```

Turkish in `tr-TR.json`: `"Etiket listesi görünümü"`, `"Etiket listenizde her etiketin nasıl çizileceğini değiştirir."`, `"Mevcut"` / `"Şu anki kart."`, `"Sade"` / `"Kenarında renk şeridi olan kısa satırlar."`, `"Renkli"` / `"Durumuna göre renklendirilmiş kısa satırlar."`

Copy names what changes, not "V2" — travellers see this screen.

Run `npm run init` afterwards, or `tsc` fails at `src/localization/config.ts`.

- [ ] **Step 2: Write the failing test**

Create `src/screens/shared/Settings/__tests__/TagRowDesignScreen.router.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import TagRowDesignScreen from "../TagRowDesignScreen";
import useTagRowDesignStore from "@/store/tagRowDesign";

jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({
    t: (key: string) => key.split(".").pop() ?? key,
    activeLocale: "en-US",
  }),
}));
jest.mock("@/components/Ionicons", () => ({ Ionicons: () => null }));
jest.mock("@/templates/Modal", () => {
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  const React = jest.requireActual<typeof import("react")>("react");
  return {
    ModalTemplate: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, null, children),
  };
});

const initial = useTagRowDesignStore.getState();
beforeEach(() => useTagRowDesignStore.setState(initial, true));

it("offers every design the rows can render", () => {
  render(<TagRowDesignScreen />);

  expect(screen.getByText("Classic")).toBeTruthy();
  expect(screen.getByText("Pill")).toBeTruthy();
  expect(screen.getByText("Tinted")).toBeTruthy();
});

it("marks the stored choice as selected", () => {
  useTagRowDesignStore.getState().setDesign("tinted");
  render(<TagRowDesignScreen />);

  expect(screen.getByRole("radio", { name: "Tinted" }).props.accessibilityState)
    .toMatchObject({ selected: true });
});

// The pick IS the commit — there is no Save, like the device-settings switch.
it("stores the design as soon as one is picked", () => {
  render(<TagRowDesignScreen />);

  fireEvent.press(screen.getByRole("radio", { name: "Pill" }));

  expect(useTagRowDesignStore.getState().design).toBe("pill");
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest src/screens/shared/Settings/__tests__/TagRowDesignScreen.router.test.tsx`
Expected: FAIL — `Cannot find module '../TagRowDesignScreen'`.

- [ ] **Step 4: Write minimal implementation**

Create `src/screens/shared/Settings/TagRowDesignScreen.tsx`:

```tsx
import { Text } from "@/components/ui";
import { useLocalization } from "@/providers/LocalizationProvider";
import useTagRowDesignStore, { type TagRowDesign } from "@/store/tagRowDesign";
import { ModalTemplate } from "@/templates/Modal";
import { cn } from "@/utils/cn";
import React from "react";
import { Pressable, View } from "react-native";

const OPTIONS: { value: TagRowDesign; key: string }[] = [
  { value: "classic", key: "Classic" },
  { value: "pill", key: "Pill" },
  { value: "tinted", key: "Tinted" },
];

/**
 * Picks how each tag is drawn in the Tags list.
 *
 * No Save button: one choice does not need a commit step, so the pick IS the
 * commit — the same call `DeviceSettingsScreen` makes for its one switch.
 */
export default function TagRowDesignScreen() {
  const { t } = useLocalization();
  const design = useTagRowDesignStore((state) => state.design);
  const setDesign = useTagRowDesignStore((state) => state.setDesign);

  return (
    <ModalTemplate title={t("MobileApp.TagRowDesign.Title")}>
      <Text className="mb-4 mt-1 text-sm text-muted">
        {t("MobileApp.TagRowDesign.Description")}
      </Text>

      <View className="gap-2">
        {OPTIONS.map((option) => {
          const active = design === option.value;
          const label = t(`MobileApp.TagRowDesign.${option.key}` as never);
          return (
            <Pressable
              key={option.value}
              onPress={() => setDesign(option.value)}
              accessibilityRole="radio"
              accessibilityLabel={label}
              accessibilityState={{ selected: active }}
              className={cn(
                "flex-row items-center gap-3 rounded-2xl border p-4",
                active ? "border-info bg-info-surface" : "border-border",
              )}
            >
              <View
                className={cn(
                  "size-5 items-center justify-center rounded-full border-2",
                  active ? "border-info" : "border-border",
                )}
              >
                {active ? <View className="size-2.5 rounded-full bg-info" /> : null}
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-foreground">
                  {label}
                </Text>
                <Text className="text-xs text-muted">
                  {t(`MobileApp.TagRowDesign.${option.key}Hint` as never)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </ModalTemplate>
  );
}
```

`src/app/(auth)/(modals)/tag-row-design.tsx`:

```tsx
import TagRowDesignScreen from "@/screens/shared/Settings/TagRowDesignScreen";

export default function Page() {
  return <TagRowDesignScreen />;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest src/screens/shared/Settings/__tests__/TagRowDesignScreen.router.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

Stage the two locale files **by hunk** if they carry another session's uncommitted keys:

```bash
git diff src/localization/resources/en-US.json | awk '/^@@/{n++} n<2{print}' > /tmp/en.patch
git apply --cached /tmp/en.patch
git diff --cached src/localization/resources/en-US.json   # only your keys
git diff src/localization/resources/en-US.json            # theirs, still unstaged
```

Otherwise stage them directly, then:

```bash
git add src/screens/shared/Settings/TagRowDesignScreen.tsx \
        src/screens/shared/Settings/__tests__/TagRowDesignScreen.router.test.tsx \
        "src/app/(auth)/(modals)/tag-row-design.tsx"
git commit -F - <<'MSG'
feat(profile): add the tag list style picker

Three options, and the pick is the commit — one choice does not need a
Save step, the way the device-settings switch does not.

The copy names what changes rather than the version number: travellers
reach this screen too, and "V2" means nothing to a shopper.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 7: The Profile row that opens the picker

**Files:**
- Modify: `src/screens/shared/Profile/StaffProfileScreen.tsx` (the `appRows` array, ~line 93)
- Modify: `src/screens/traveller/Profile/IdentityProfileScreen.tsx` (its `appRows`, ~line 105)
- Test: `src/screens/shared/Profile/__tests__/TagRowDesignRow.router.test.tsx`

**Interfaces:**
- Consumes: `useTagRowDesign` (Task 1), the `/(auth)/(modals)/tag-row-design` route (Task 6), `SettingsRowProps`.
- Produces: nothing new.

These two screens cover all four roles under `DEFAULT_PROFILE_DESIGN = "identity"`. The three classic screens are reachable only from the debug menu and are deliberately left out.

- [ ] **Step 1: Write the failing test**

Create `src/screens/shared/Profile/__tests__/TagRowDesignRow.router.test.tsx`. Mock the providers as `StaffProfileScreen`'s existing suite does, mock `expo-router`'s `router.push`, and assert:

```tsx
it("offers the tag list style from the app settings group", () => {
  render(<StaffProfileScreen role="merchant" />);
  expect(screen.getByText("TagRowDesign")).toBeTruthy();
});

// The row states the current choice, so the setting can be read without
// opening it — the language row already works this way.
it("states which style is active", () => {
  useTagRowDesignStore.getState().setDesign("tinted");
  render(<StaffProfileScreen role="merchant" />);

  expect(screen.getByText("Tinted")).toBeTruthy();
});

it("opens the picker", () => {
  render(<StaffProfileScreen role="merchant" />);
  fireEvent.press(screen.getByText("TagRowDesign"));

  expect(router.push).toHaveBeenCalledWith("/(auth)/(modals)/tag-row-design");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/screens/shared/Profile/__tests__/TagRowDesignRow.router.test.tsx`
Expected: FAIL — no element with text `TagRowDesign`.

- [ ] **Step 3: Write minimal implementation**

In both screens add to `appRows`, after the App Language row:

```tsx
{
  title: t("MobileApp.Profile.TagRowDesign"),
  icon: "list-outline",
  // Stated on the row, like the language: the setting can then be read
  // without opening it.
  value: t(`MobileApp.TagRowDesign.${TAG_ROW_DESIGN_LABEL[rowDesign]}`),
  onPress: () =>
    guardNav(() => router.push("/(auth)/(modals)/tag-row-design")),
},
```

with `const rowDesign = useTagRowDesign();` beside the other hooks, and a module-level `const TAG_ROW_DESIGN_LABEL: Record<TagRowDesign, string> = { classic: "Classic", pill: "Pill", tinted: "Tinted" };`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/screens/shared/Profile src/screens/traveller/Profile`
Expected: PASS, existing profile tests included.

- [ ] **Step 5: Commit**

```bash
git add src/screens/shared/Profile/StaffProfileScreen.tsx \
        src/screens/traveller/Profile/IdentityProfileScreen.tsx \
        src/screens/shared/Profile/__tests__/TagRowDesignRow.router.test.tsx
git commit -F - <<'MSG'
feat(profile): offer the tag list style in the app settings group

Added to the two identity screens only: between them they serve all four
roles under the default profile design, and the three classic screens are
reachable only from the debug menu.

The row states the active style, like the language row, so the setting
reads without being opened.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 8: Full verification

**Files:** none changed unless a gate fails.

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: exactly one error, the pre-existing `tabBackNavigation.router.test.tsx` TS2345. Anything else is yours. If it is the localization staleness error, run `npm run init`.

- [ ] **Step 2: Full suite**

Run: `npx jest`
Expected: every suite green. Existing suites must be untouched — if one needed editing, a branch is wrong.

- [ ] **Step 3: Lint the files you touched**

Run: `npx eslint <each file created or modified>`
Expected: no errors. `cells.tsx` is not in this change; its two warnings are pre-existing and unrelated.

- [ ] **Step 4: Confirm the default still ships nothing**

Run: `npx jest src/store/__tests__/tagRowDesign.test.ts`
Expected: PASS — `DEFAULT_TAG_ROW_DESIGN` is `"classic"`, so a fresh install sees exactly today's list.

- [ ] **Step 5: Report**

State which gates ran and their output. Do not claim the designs look right on device — nothing here renders them on hardware, and the canvas is the only visual reference.

# Refund-Agent Customs Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the refund-agent's Home into a refund-point-wide worklist built from the same components customs uses, and retire the separate `/refund` route.

**Architecture:** Three near-duplicate components are promoted into `screens/shared/_components/` so customs and refund render the same code rather than two copies that drift. `screens/refund-point/Home/` is then rebuilt to mirror `screens/customs/Home/` slot for slot, with a new `useRefundHomeFlow` hook that merges the old `useRefundFlow` with paging and filters. Submit-time details (totals, card fields, signatures) move into a bottom sheet, matching `ExportValidateSheet`.

**Tech Stack:** React Native + Expo Router, NativeWind, `@gorhom/bottom-sheet`, Jest + `@testing-library/react-native`, generated `@/saas/TagService` types.

**Spec:** `docs/superpowers/specs/2026-09-14-refund-agent-customs-parity-design.md`

## Global Constraints

- **Repo:** all code changes are in `C:\unirefund\super-app`. The spec and this plan live in the separate `C:\unirefund\docs` git repo — never commit plan/spec edits into `super-app`.
- **Render tests must be named `*.router.test.*`** or the native Jest project will not pick them up.
- **Run `npm run init` after adding any i18n key**, before `npm run typecheck`. Without it `tsc` fails with TS2307 on the import or TS2345 at the `t("…")` call site instead of naming the missing codegen.
- **Re-measure the gate baseline before Task 1 and compare against your own number, not this document.** `AGENTS.md` records, as re-measured 2026-09-10: `npm run typecheck` clean; `npm test` 195 suites / 1 fail, 1850 tests / 1846 pass / 3 fail / 1 skipped; `npm run lint` 0 errors / 89 warnings. AGENTS.md explicitly says to re-measure rather than quote, because `main` grows.
- **The one deterministically failing suite is `src/components/ui/__tests__/tokens.test.ts`** (3 of 4 assertions), a pre-existing colour-token violation list. Do not add to it — new code uses semantic tokens only, never Tailwind default palette (`bg-gray-200`) or raw hex.
- **`src/screens/traveller/Cards/__tests__/CardScannerModal.router.test.tsx` is a load-dependent flake.** If a full run shows 2 failing suites instead of 1, re-run it in isolation (`npx jest CardScannerModal.router.test.tsx`) before calling it a regression.
- **`prettier --check` is not a gate here.** Format only files you touch.
- **`npm test` can pick up sibling checkouts.** If suite counts look wildly wrong, check for a stray repo in the root.
- **The endpoint's entire filter set** is `isExportValidated`, `refundPointId`, `refundType`, `tagIds`, `travellerDocumentNumber`, `skipCount`, `maxResultCount`, `sorting`. There are no date parameters — do not attempt to port customs' date chips.
- **i18n interpolation uses single braces:** `"{count} selected"`, `"Refund {amount}"`.
- **The shared-component promotion must be a pure refactor on the customs side.** Customs' four router tests in `src/screens/customs/Home/__tests__/` are the guard and must stay green throughout.

---

### Task 1: i18n keys for the worklist

**Files:**
- Modify: `src/localization/resources/en-US.json` (the `Refund` object)
- Modify: `src/localization/resources/tr-TR.json` (the `Refund` object)

**Interfaces:**
- Consumes: nothing.
- Produces: the `TranslationKey` union members `MobileApp.Refund.FilterByTraveller`, `MobileApp.Refund.ClearTraveller`, `MobileApp.Refund.SelectAll`, `MobileApp.Refund.SelectedCount`, `MobileApp.Refund.ClearSelection`, `MobileApp.Refund.LoadMore`, `MobileApp.Refund.Loading`, `MobileApp.Refund.NoTagsInWindow`. Every later task calls `t()` with these.

- [ ] **Step 1: Record your own baseline before touching anything**

```bash
cd /c/unirefund/super-app
npm run init
npm run typecheck
npm test 2>&1 | tail -20
npm run lint 2>&1 | tail -5
```

Write the four numbers down. Every later "gate is green" claim in this plan means *matches this number*, not *zero failures*.

- [ ] **Step 2: Add the eight English keys**

In `src/localization/resources/en-US.json`, inside the existing `"Refund"` object, add:

```json
"FilterByTraveller": "Filter by traveller",
"ClearTraveller": "Clear traveller filter",
"SelectAll": "Select all",
"SelectedCount": "{count} selected",
"ClearSelection": "Clear",
"LoadMore": "Load more",
"Loading": "Loading tags…",
"NoTagsInWindow": "No refundable tags at this refund point."
```

- [ ] **Step 3: Add the eight Turkish keys**

In `src/localization/resources/tr-TR.json`, inside the existing `"Refund"` object, add:

```json
"FilterByTraveller": "Yolcuya göre filtrele",
"ClearTraveller": "Yolcu filtresini temizle",
"SelectAll": "Tümünü seç",
"SelectedCount": "{count} seçildi",
"ClearSelection": "Temizle",
"LoadMore": "Daha fazla yükle",
"Loading": "Etiketler yükleniyor…",
"NoTagsInWindow": "Bu iade noktasında iade edilebilir etiket yok."
```

Both files are UTF-8. Verify the Turkish diacritics survived your editor — `ü`, `ö`, `ç`, `ş`, `ğ`, `ı`, `İ` — a mangled character here ships to users.

- [ ] **Step 4: Regenerate the language bundles and typecheck**

```bash
npm run init
npm run typecheck
```

Expected: `init` rewrites `src/data/language-data/*.gen.json`; typecheck matches your Step 1 baseline (clean).

- [ ] **Step 5: Commit**

```bash
git add src/localization/resources/en-US.json src/localization/resources/tr-TR.json
git commit -m "i18n(refund): add worklist keys for the customs-parity Home"
```

---

### Task 2: Promote `BatchListControls`

Select-all / count / clear, shared by both worklists. Refund hides Select all until the list is narrowed to one traveller, because on the wide list it would tick tags belonging to different people and build a refund nobody can submit.

**Files:**
- Create: `src/screens/shared/_components/BatchListControls.tsx`
- Create: `src/screens/shared/_components/__tests__/BatchListControls.router.test.tsx`
- Modify: `src/screens/customs/Home/HomeScreen.tsx` (the `CustomsListControls` usage)
- Delete: `src/screens/customs/Home/_components/CustomsListControls.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces:

```ts
export function BatchListControls(props: {
  selectedCount: number;
  onSelectAll: () => void;
  onClear: () => void;
  disabled?: boolean;
  /** Already interpolated by the caller — this component never calls `t`. */
  selectAllLabel: string;
  selectedCountLabel: string;
  clearLabel: string;
  /** Refund's wide worklist passes false; customs never does. */
  showSelectAll?: boolean;
}): React.JSX.Element;
```

- [ ] **Step 1: Write the failing test**

Create `src/screens/shared/_components/__tests__/BatchListControls.router.test.tsx`:

```tsx
import { fireEvent, render } from "@testing-library/react-native";
import { BatchListControls } from "../BatchListControls";

const labels = {
  selectAllLabel: "Select all",
  selectedCountLabel: "2 selected",
  clearLabel: "Clear",
};

describe("BatchListControls", () => {
  it("hides Select all when showSelectAll is false", () => {
    const { queryByText } = render(
      <BatchListControls
        selectedCount={0}
        onSelectAll={jest.fn()}
        onClear={jest.fn()}
        showSelectAll={false}
        {...labels}
      />,
    );
    expect(queryByText("Select all")).toBeNull();
  });

  it("shows Select all by default and fires it", () => {
    const onSelectAll = jest.fn();
    const { getByText } = render(
      <BatchListControls
        selectedCount={0}
        onSelectAll={onSelectAll}
        onClear={jest.fn()}
        {...labels}
      />,
    );
    fireEvent.press(getByText("Select all"));
    expect(onSelectAll).toHaveBeenCalled();
  });

  it("hides the count at zero and shows it above zero", () => {
    const { queryByText, rerender } = render(
      <BatchListControls
        selectedCount={0}
        onSelectAll={jest.fn()}
        onClear={jest.fn()}
        {...labels}
      />,
    );
    expect(queryByText("2 selected")).toBeNull();
    rerender(
      <BatchListControls
        selectedCount={2}
        onSelectAll={jest.fn()}
        onClear={jest.fn()}
        {...labels}
      />,
    );
    expect(queryByText("2 selected")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest BatchListControls.router.test.tsx
```

Expected: FAIL — cannot resolve `../BatchListControls`.

- [ ] **Step 3: Write the component**

Create `src/screens/shared/_components/BatchListControls.tsx`. This is `CustomsListControls` with the three `t()` calls lifted to props and a spacer that preserves the `justify-between` layout when Select all is hidden:

```tsx
import { Text } from "@/components/ui";
import { Pressable, View } from "react-native";

/**
 * Select-all, clear, and the running count.
 *
 * Pinned by the screen rather than carried at the top of the list: these
 * control the whole selection, and scrolling them away mid-batch was the
 * problem that pinning the action footer solved for the decisions themselves.
 *
 * Labels arrive already localized. The two worklists that use this sit in
 * different i18n namespaces, and a component that picked one would force the
 * other to borrow its neighbour's strings.
 */
export function BatchListControls({
  selectedCount,
  onSelectAll,
  onClear,
  disabled,
  selectAllLabel,
  selectedCountLabel,
  clearLabel,
  showSelectAll = true,
}: {
  selectedCount: number;
  onSelectAll: () => void;
  onClear: () => void;
  disabled?: boolean;
  selectAllLabel: string;
  selectedCountLabel: string;
  clearLabel: string;
  showSelectAll?: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between">
      {/* An empty view rather than a conditional child: without it the count
          and Clear jump to the left edge when Select all is hidden, and the
          row stops lining up with the customs worklist's. */}
      {showSelectAll ? (
        <Pressable
          onPress={onSelectAll}
          disabled={disabled}
          accessibilityRole="button"
        >
          <Text variant="caption" className="font-medium text-primary">
            {selectAllLabel}
          </Text>
        </Pressable>
      ) : (
        <View />
      )}

      <View className="flex-row items-center gap-3">
        {selectedCount > 0 ? (
          <Text variant="caption" tone="muted" className="font-medium">
            {selectedCountLabel}
          </Text>
        ) : null}
        <Pressable
          onPress={onClear}
          disabled={disabled || selectedCount === 0}
          accessibilityRole="button"
        >
          <Text
            variant="caption"
            tone={selectedCount === 0 ? "muted" : "default"}
            className="font-medium"
          >
            {clearLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
npx jest BatchListControls.router.test.tsx
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Migrate customs and delete the old component**

In `src/screens/customs/Home/HomeScreen.tsx`, replace the import and the usage:

```tsx
import { BatchListControls } from "@/screens/shared/_components/BatchListControls";
```

```tsx
<BatchListControls
  selectedCount={flow.selectedIds.length}
  onSelectAll={flow.selectAll}
  onClear={flow.clearSelection}
  disabled={isSubmitting}
  selectAllLabel={t("MobileApp.Customs.Validate.SelectAll")}
  selectedCountLabel={t("MobileApp.Customs.Validate.SelectedCount", {
    count: flow.selectedIds.length,
  })}
  clearLabel={t("MobileApp.Customs.Validate.ClearSelection")}
/>
```

Then `rm src/screens/customs/Home/_components/CustomsListControls.tsx`.

- [ ] **Step 6: Prove customs did not regress**

```bash
npx jest src/screens/customs
npm run typecheck
```

Expected: customs suites all pass; typecheck matches baseline.

- [ ] **Step 7: Commit**

```bash
git add src/screens/shared/_components/BatchListControls.tsx \
        src/screens/shared/_components/__tests__/BatchListControls.router.test.tsx \
        src/screens/customs/Home/HomeScreen.tsx
git add -u src/screens/customs/Home/_components/
git commit -m "refactor(shared): promote CustomsListControls to BatchListControls"
```

---

### Task 3: Promote `BatchTagRow`

**Files:**
- Create: `src/screens/shared/_components/BatchTagRow.tsx`
- Create: `src/screens/shared/_components/__tests__/BatchTagRow.router.test.tsx`
- Modify: `src/screens/customs/Home/_components/CustomsTagList.tsx` (renders the row)
- Delete: `src/screens/customs/Home/_components/CustomsTagRow.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces:

```ts
export const BatchTagRow: React.MemoExoticComponent<(props: {
  tag: UniRefund_TagService_Tags_TagListItemDto;
  selected: boolean;
  /** Caller's rule. Customs passes isTagSelectable(tag); refund passes its currency rule. */
  selectable: boolean;
  disabled?: boolean;
  secondary?: string | null;
  currencyCode: string;
  formatDate: (isoDate?: string | null) => string;
  formatAmount: (amount: number | null) => string;
  footer?: React.ReactNode;
  onToggle: (tag: UniRefund_TagService_Tags_TagListItemDto) => void;
  onOpen?: (tag: UniRefund_TagService_Tags_TagListItemDto) => void;
}) => React.JSX.Element>;
```

The only change from `CustomsTagRow` is that `selectable` becomes a prop instead of an internal `isTagSelectable(tag)` call, and `footer` is passed in rather than computed from `canViewRisk`.

- [ ] **Step 1: Write the failing test**

Create `src/screens/shared/_components/__tests__/BatchTagRow.router.test.tsx`:

```tsx
import type { UniRefund_TagService_Tags_TagListItemDto } from "@/saas/TagService";
import { fireEvent, render } from "@testing-library/react-native";
import { BatchTagRow } from "../BatchTagRow";

const tag = {
  id: "t1",
  tagNumber: "TAG-1",
  currency: "EUR",
  refund: 40,
} as UniRefund_TagService_Tags_TagListItemDto;

const base = {
  tag,
  selected: false,
  currencyCode: "EUR",
  formatDate: () => "",
  formatAmount: (n: number | null) => String(n ?? ""),
  onToggle: jest.fn(),
};

describe("BatchTagRow", () => {
  it("omits the checkbox when not selectable", () => {
    const { queryByRole } = render(
      <BatchTagRow {...base} selectable={false} />,
    );
    expect(queryByRole("checkbox")).toBeNull();
  });

  it("toggles through the checkbox when selectable", () => {
    const onToggle = jest.fn();
    const { getByRole } = render(
      <BatchTagRow {...base} selectable onToggle={onToggle} />,
    );
    fireEvent.press(getByRole("checkbox"));
    expect(onToggle).toHaveBeenCalledWith(tag);
  });

  it("opens the tag when the card body is pressed", () => {
    const onOpen = jest.fn();
    const { getByText } = render(
      <BatchTagRow {...base} selectable onOpen={onOpen} />,
    );
    fireEvent.press(getByText("TAG-1"));
    expect(onOpen).toHaveBeenCalledWith(tag);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest BatchTagRow.router.test.tsx
```

Expected: FAIL — cannot resolve `../BatchTagRow`.

- [ ] **Step 3: Write the component**

Create `src/screens/shared/_components/BatchTagRow.tsx`:

```tsx
import { colors } from "@/utils/theme";
import { Ionicons } from "@/components/Ionicons";
import type { UniRefund_TagService_Tags_TagListItemDto } from "@/saas/TagService";
import { TagCard } from "@/screens/shared/_components/TagCard";
import type { TagListItem } from "@/store/tag";
import React from "react";
import { Pressable } from "react-native";

type TagRow = UniRefund_TagService_Tags_TagListItemDto;

/**
 * One batchable tag, drawn by the same `TagCard` the Tags tab uses so every
 * list in the app reads identically — status rail, serial, headline amount,
 * who and when. A batch screen adds only a checkbox and, optionally, a footer.
 *
 * Two press targets, because the row answers two questions. The checkbox
 * builds the batch; the card opens the tag, where the per-tag actions live.
 *
 * `selectable` is the caller's rule, not this component's: customs disqualifies
 * a tag on its decision state, the refund desk on its currency. Both express
 * the result the same way.
 */
export const BatchTagRow = React.memo(function BatchTagRow({
  tag,
  selected,
  selectable,
  disabled,
  secondary,
  currencyCode,
  formatDate,
  formatAmount,
  footer,
  onToggle,
  onOpen,
}: {
  tag: TagRow;
  selected: boolean;
  selectable: boolean;
  disabled?: boolean;
  secondary?: string | null;
  currencyCode: string;
  formatDate: (isoDate?: string | null) => string;
  formatAmount: (amount: number | null) => string;
  footer?: React.ReactNode;
  onToggle: (tag: TagRow) => void;
  onOpen?: (tag: TagRow) => void;
}) {
  const isDisabled = disabled || !selectable;

  return (
    <TagCard
      tag={tag as TagListItem}
      variant="row"
      secondary={secondary}
      currencyCode={currencyCode}
      formatDate={formatDate}
      formatAmount={formatAmount}
      selected={selected}
      // Omitted rather than disabled. A disabled `Pressable` does not consume
      // the touch, so tapping a greyed checkbox fell through to the card and
      // opened the tag — a control that appeared to do something unrelated to
      // what it depicts.
      leading={
        isDisabled ? undefined : (
          <Pressable
            onPress={() => onToggle(tag)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            hitSlop={8}
            className="py-2"
          >
            <Ionicons
              name={selected ? "checkbox" : "square-outline"}
              size={22}
              color={selected ? colors.primary : colors.placeholder}
            />
          </Pressable>
        )
      }
      footer={footer}
      onSelect={() => onOpen?.(tag)}
    />
  );
});
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
npx jest BatchTagRow.router.test.tsx
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Migrate customs and delete the old row**

In `src/screens/customs/Home/_components/CustomsTagList.tsx`, swap the import and change `renderRow` to supply what the row no longer computes:

```tsx
import { BatchTagRow } from "@/screens/shared/_components/BatchTagRow";
import { isTagSelectable } from "@/utils/customsTags";
import { CustomsTagRisk } from "./CustomsTagRisk";
```

```tsx
const renderRow = (tag: TagRow) => (
  <BatchTagRow
    key={tag.id}
    tag={tag}
    selected={selectedIds.includes(tag.id)}
    selectable={isTagSelectable(tag)}
    disabled={disabled}
    // Whoever identifies the tag to the reader. On the unfiltered worklist
    // that is the traveller; the merchant stands in when a tag has none.
    secondary={tag.travellerFullName ?? tag.merchantTitle}
    currencyCode={tenantCurrency}
    formatDate={formatRowDate}
    formatAmount={formatAmount}
    footer={canViewRisk ? <CustomsTagRisk risk={tag.risk} /> : undefined}
    onToggle={onToggle}
    onOpen={onOpenTag}
  />
);
```

Then `rm src/screens/customs/Home/_components/CustomsTagRow.tsx`.

- [ ] **Step 6: Prove customs did not regress**

```bash
npx jest src/screens/customs
npm run typecheck
```

Expected: customs suites pass (including `CustomsTagList.router.test.tsx`); typecheck matches baseline. If a customs test imported `CustomsTagRow` directly, repoint it at `BatchTagRow` — that is a permitted test edit, changing behaviour is not.

- [ ] **Step 7: Commit**

```bash
git add src/screens/shared/_components/BatchTagRow.tsx \
        src/screens/shared/_components/__tests__/BatchTagRow.router.test.tsx \
        src/screens/customs/Home/_components/CustomsTagList.tsx
git add -u src/screens/customs/Home/_components/
git commit -m "refactor(shared): promote CustomsTagRow to BatchTagRow"
```

---

### Task 4: Promote `TravellerFilterCard`

**Files:**
- Create: `src/screens/shared/_components/TravellerFilterCard.tsx`
- Create: `src/screens/shared/_components/__tests__/TravellerFilterCard.router.test.tsx`
- Modify: `src/screens/customs/Home/HomeScreen.tsx`
- Modify: `src/screens/refund-point/Refund/RefundScreen.tsx` (interim — this file is deleted in Task 9, but migrating now keeps the tree free of a third copy)
- Delete: `src/screens/customs/Home/_components/CustomsTravellerCard.tsx`
- Delete: `src/screens/refund-point/Refund/_components/TravellerSearchCard.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces:

```ts
export function TravellerFilterCard(props: {
  traveller: UniRefund_TagService_Travellers_TravellerRequestDto | null;
  onSelect: (t: UniRefund_TagService_Travellers_TravellerRequestDto) => void;
  onClear?: () => void;
  disabled?: boolean;
  /** Optional header above the body; the refund desk shows one, customs does not. */
  title?: string;
  emptyLabel: string;
  changeLabel: string;
  clearLabel?: string;
}): React.JSX.Element;
```

- [ ] **Step 1: Write the failing test**

Create `src/screens/shared/_components/__tests__/TravellerFilterCard.router.test.tsx`:

```tsx
import type { UniRefund_TagService_Travellers_TravellerRequestDto } from "@/saas/TagService";
import { fireEvent, render } from "@testing-library/react-native";
import { TravellerFilterCard } from "../TravellerFilterCard";

jest.mock("@/screens/shared/_components/SearchTraveller/SearchTraveller", () => ({
  SearchTraveller: () => null,
}));

const traveller = {
  firstName: "Ada",
  lastName: "Lovelace",
  travellerDocumentNumber: "U1234567",
  nationalityCountryCode3: "GBR",
} as UniRefund_TagService_Travellers_TravellerRequestDto;

const labels = { emptyLabel: "Filter by traveller", changeLabel: "Change" };

describe("TravellerFilterCard", () => {
  it("shows the empty prompt with no traveller", () => {
    const { getByText } = render(
      <TravellerFilterCard traveller={null} onSelect={jest.fn()} {...labels} />,
    );
    expect(getByText("Filter by traveller")).toBeTruthy();
  });

  it("shows the traveller's name and document once picked", () => {
    const { getByText } = render(
      <TravellerFilterCard
        traveller={traveller}
        onSelect={jest.fn()}
        {...labels}
      />,
    );
    expect(getByText("Ada Lovelace")).toBeTruthy();
    expect(getByText("U1234567 · GBR")).toBeTruthy();
  });

  it("offers Clear only when onClear is supplied", () => {
    const onClear = jest.fn();
    const { getByLabelText } = render(
      <TravellerFilterCard
        traveller={traveller}
        onSelect={jest.fn()}
        onClear={onClear}
        clearLabel="Clear traveller filter"
        {...labels}
      />,
    );
    fireEvent.press(getByLabelText("Clear traveller filter"));
    expect(onClear).toHaveBeenCalled();
  });

  it("renders an optional title", () => {
    const { getByText } = render(
      <TravellerFilterCard
        traveller={null}
        onSelect={jest.fn()}
        title="Traveller"
        {...labels}
      />,
    );
    expect(getByText("Traveller")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest TravellerFilterCard.router.test.tsx
```

Expected: FAIL — cannot resolve `../TravellerFilterCard`.

- [ ] **Step 3: Write the component**

Create `src/screens/shared/_components/TravellerFilterCard.tsx`. It is `CustomsTravellerCard` with the labels lifted to props and `TravellerSearchCard`'s optional header added:

```tsx
import { Text } from "@/components/ui";
import { colors } from "@/utils/theme";
import DebouncedPressable from "@/components/DebouncedPressable";
import { Ionicons } from "@/components/Ionicons";
import type { UniRefund_TagService_Travellers_TravellerRequestDto } from "@/saas/TagService";
import { SearchTraveller } from "@/screens/shared/_components/SearchTraveller/SearchTraveller";
import { useState } from "react";
import { View } from "react-native";

type Traveller = UniRefund_TagService_Travellers_TravellerRequestDto;

/**
 * Whose tags these are. Wraps the shared picker, so every desk gets document /
 * email / phone search and passport MRZ scanning for free.
 *
 * Labels are props: the two desks describe the same control differently — one
 * filters a worklist, one identifies the person at the counter.
 */
export function TravellerFilterCard({
  traveller,
  onSelect,
  onClear,
  disabled,
  title,
  emptyLabel,
  changeLabel,
  clearLabel,
}: {
  traveller: Traveller | null;
  onSelect: (traveller: Traveller) => void;
  /** Drops back to the unfiltered worklist. */
  onClear?: () => void;
  disabled?: boolean;
  title?: string;
  emptyLabel: string;
  changeLabel: string;
  clearLabel?: string;
}) {
  const [pickerVisible, setPickerVisible] = useState(false);

  return (
    <View className="rounded-2xl border border-border bg-card p-4">
      {title ? (
        <Text className="text-xs font-medium text-muted mb-2">{title}</Text>
      ) : null}

      {traveller ? (
        <View className="flex-row items-center gap-3">
          <View className="w-10 h-10 rounded-full bg-foreground/5 items-center justify-center">
            <Ionicons name="person" size={20} color={colors.muted} />
          </View>
          <View className="flex-1">
            <Text className="text-base font-semibold text-foreground">
              {`${traveller.firstName} ${traveller.lastName}`.trim()}
            </Text>
            <Text className="text-xs text-muted">
              {`${traveller.travellerDocumentNumber} · ${traveller.nationalityCountryCode3}`}
            </Text>
          </View>
          <DebouncedPressable
            onPress={() => setPickerVisible(true)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={changeLabel}
            className="px-3 py-2 rounded-full bg-foreground/5"
          >
            <Text className="text-xs font-medium text-foreground">
              {changeLabel}
            </Text>
          </DebouncedPressable>
          {/* The way back to the whole worklist. Without it, picking a
              traveller is a one-way door. */}
          {onClear && clearLabel ? (
            <DebouncedPressable
              onPress={onClear}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={clearLabel}
              className="w-8 h-8 rounded-full bg-foreground/5 items-center justify-center"
            >
              <Ionicons name="close" size={16} color={colors.muted} />
            </DebouncedPressable>
          ) : null}
        </View>
      ) : (
        <DebouncedPressable
          onPress={() => setPickerVisible(true)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={emptyLabel}
          className="flex-row items-center gap-3 rounded-xl border border-dashed border-border p-3"
        >
          <Ionicons name="search" size={20} color={colors.muted} />
          <Text className="text-sm text-muted">{emptyLabel}</Text>
        </DebouncedPressable>
      )}

      <SearchTraveller
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={(selected) => {
          onSelect(selected);
          setPickerVisible(false);
        }}
        disabled={disabled}
      />
    </View>
  );
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
npx jest TravellerFilterCard.router.test.tsx
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Migrate both call sites, delete both old files**

In `src/screens/customs/Home/HomeScreen.tsx`:

```tsx
<TravellerFilterCard
  traveller={flow.traveller}
  onSelect={flow.setTraveller}
  onClear={() => flow.setTraveller(null)}
  disabled={isSubmitting}
  emptyLabel={t("MobileApp.Customs.Home.FilterByTraveller")}
  changeLabel={t("MobileApp.Customs.Validate.ChangeTraveller")}
  clearLabel={t("MobileApp.Customs.Home.ClearTraveller")}
/>
```

In `src/screens/refund-point/Refund/RefundScreen.tsx`:

```tsx
<TravellerFilterCard
  traveller={flow.traveller}
  onSelect={flow.setTraveller}
  disabled={flow.isSubmitting}
  title={t("MobileApp.Refund.Traveller")}
  emptyLabel={t("MobileApp.Refund.FindTraveller")}
  changeLabel={t("MobileApp.Refund.ChangeTraveller")}
/>
```

Then delete `CustomsTravellerCard.tsx` and `TravellerSearchCard.tsx`.

- [ ] **Step 6: Prove nothing regressed**

```bash
npx jest src/screens/customs src/screens/refund-point
npm run typecheck
```

Expected: all pass; typecheck matches baseline.

- [ ] **Step 7: Commit**

```bash
git add src/screens/shared/_components/TravellerFilterCard.tsx \
        src/screens/shared/_components/__tests__/TravellerFilterCard.router.test.tsx \
        src/screens/customs/Home/HomeScreen.tsx \
        src/screens/refund-point/Refund/RefundScreen.tsx
git add -u src/screens/customs/Home/_components/ src/screens/refund-point/Refund/_components/
git commit -m "refactor(shared): unify the two traveller cards into TravellerFilterCard"
```

---

### Task 5: `useRefundHomeFlow` — query, paging and filters

The hook is built in two tasks. This one covers loading the worklist and the two filters; Task 6 adds selection, narrowing and submit.

**Files:**
- Create: `src/screens/refund-point/Home/useRefundHomeFlow.ts`
- Create: `src/screens/refund-point/Home/__tests__/useRefundHomeFlow.router.test.ts`

**Interfaces:**
- Consumes: `getRefundableTagsApi(data: GetApiTagServiceTagTagsRefundData)` from `@/actions/TagService/actions`; `getPaymentTypesByRefundPointIdApi(id: string)` from `@/actions/ContractService/actions`; `useRefundPointId(): string | null`; `type RefundMethod` from `../Refund/refund.logic`.
- Produces, this task's slice of the return value:

```ts
{
  refundPointId: string | null;
  method: RefundMethod | null;
  setMethod: (m: RefundMethod) => void;
  methods: RefundMethod[] | null;
  methodsError: boolean;
  methodsErrorMessage?: string;
  reloadMethods: () => void;
  isExportValidated: boolean;
  setIsExportValidated: (v: boolean) => void;
  tags: UniRefund_TagService_Tags_TagListItemDto[];
  totalCount: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  canLoadMore: boolean;
  loadMore: () => Promise<void>;
  hasError: boolean;
  errorMessage?: string;
}
```

**Constant:** `export const REFUND_PAGE_SIZE = 20;` — matches `CUSTOMS_PAGE_SIZE`.

- [ ] **Step 1: Write the failing test**

Create `src/screens/refund-point/Home/__tests__/useRefundHomeFlow.router.test.ts`:

```ts
import { getRefundableTagsApi } from "@/actions/TagService/actions";
import type { UniRefund_TagService_Tags_TagListItemDto } from "@/saas/TagService";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useRefundHomeFlow } from "../useRefundHomeFlow";

/**
 * The refund desk's worklist. A traveller is a *filter*, not a precondition:
 * the agent opens onto the refund point's whole refundable set and narrows.
 *
 * Named `.router.test.ts` so it runs under the native Jest project.
 */

jest.mock("@/actions/TagService/actions", () => ({
  getRefundableTagsApi: jest.fn(),
}));

jest.mock("@/actions/ContractService/actions", () => ({
  getPaymentTypesByRefundPointIdApi: jest.fn(() => Promise.resolve(["Cash"])),
}));

jest.mock("@/hooks/useRefundPointId", () => ({
  useRefundPointId: () => "rp-1",
}));

jest.mock("@/utils/logger", () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockGetTags = getRefundableTagsApi as jest.MockedFunction<
  typeof getRefundableTagsApi
>;

function tag(id: string, over: Partial<UniRefund_TagService_Tags_TagListItemDto> = {}) {
  return {
    id,
    tagNumber: `TAG-${id}`,
    currency: "EUR",
    refund: 10,
    travellerDocumentNumber: "U1",
    travellerFullName: "Ada Lovelace",
    ...over,
  } as UniRefund_TagService_Tags_TagListItemDto;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetTags.mockResolvedValue({ items: [tag("1")], totalCount: 1 });
});

describe("useRefundHomeFlow", () => {
  it("opens on the refund-point-wide list with no traveller filter", async () => {
    const { result } = renderHook(() => useRefundHomeFlow());
    await waitFor(() => expect(result.current.tags).toHaveLength(1));

    const query = mockGetTags.mock.calls[0][0];
    expect(query.refundPointId).toBe("rp-1");
    expect(query.travellerDocumentNumber).toBeUndefined();
    expect(query.maxResultCount).toBe(20);
    expect(query.skipCount).toBe(0);
  });

  it("sends refundType only once a method is chosen", async () => {
    const { result } = renderHook(() => useRefundHomeFlow());
    await waitFor(() => expect(mockGetTags).toHaveBeenCalled());
    expect(mockGetTags.mock.calls[0][0].refundType).toBeUndefined();

    act(() => result.current.setMethod("Cash"));
    await waitFor(() =>
      expect(
        mockGetTags.mock.calls[mockGetTags.mock.calls.length - 1][0].refundType,
      ).toBe("Cash"),
    );
  });

  it("refetches when the export-validated toggle flips", async () => {
    const { result } = renderHook(() => useRefundHomeFlow());
    await waitFor(() => expect(mockGetTags).toHaveBeenCalled());
    expect(mockGetTags.mock.calls[0][0].isExportValidated).toBe(true);

    act(() => result.current.setIsExportValidated(false));
    await waitFor(() =>
      expect(
        mockGetTags.mock.calls[mockGetTags.mock.calls.length - 1][0]
          .isExportValidated,
      ).toBe(false),
    );
  });

  it("appends the next page and stops when the total is reached", async () => {
    mockGetTags.mockResolvedValueOnce({ items: [tag("1")], totalCount: 2 });
    const { result } = renderHook(() => useRefundHomeFlow());
    await waitFor(() => expect(result.current.canLoadMore).toBe(true));

    mockGetTags.mockResolvedValueOnce({ items: [tag("2")], totalCount: 2 });
    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.tags.map((t) => t.id)).toEqual(["1", "2"]);
    expect(result.current.canLoadMore).toBe(false);
  });

  it("surfaces the server's message when the list call fails", async () => {
    mockGetTags.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useRefundHomeFlow());
    await waitFor(() => expect(result.current.hasError).toBe(true));
    expect(result.current.tags).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest useRefundHomeFlow.router.test.ts
```

Expected: FAIL — cannot resolve `../useRefundHomeFlow`.

- [ ] **Step 3: Write the hook's loading half**

Create `src/screens/refund-point/Home/useRefundHomeFlow.ts`. Port the request-id guard pattern from `useCustomsHomeFlow` verbatim — a superseded request must never land after a fresher one.

```ts
import { getPaymentTypesByRefundPointIdApi } from "@/actions/ContractService/actions";
import { getRefundableTagsApi } from "@/actions/TagService/actions";
import { useRefundPointId } from "@/hooks/useRefundPointId";
import type {
  GetApiTagServiceTagTagsRefundData,
  UniRefund_TagService_Tags_TagListItemDto,
} from "@/saas/TagService";
import { getApiErrorMessage } from "@/utils/apiError";
import { logger } from "@/utils/logger";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefundMethod } from "../Refund/refund.logic";

type TagRow = UniRefund_TagService_Tags_TagListItemDto;

/** Matches `CUSTOMS_PAGE_SIZE`, so both worklists page identically. */
export const REFUND_PAGE_SIZE = 20;

export function useRefundHomeFlow() {
  const refundPointId = useRefundPointId();

  const [methods, setMethods] = useState<RefundMethod[] | null>(null);
  const [methodsError, setMethodsError] = useState(false);
  const [methodsErrorMessage, setMethodsErrorMessage] = useState<
    string | undefined
  >(undefined);
  const [method, setMethodState] = useState<RefundMethod | null>(null);
  const [isExportValidated, setIsExportValidatedState] = useState(true);

  // The narrowing key, held separately from the traveller *record* below. A
  // failed lookup must still narrow the list — see Task 6.
  const [documentNumber, setDocumentNumber] = useState<string | undefined>(
    undefined,
  );

  const [tags, setTags] = useState<TagRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(
    undefined,
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const methodsRequestRef = useRef(0);
  const tagsRequestRef = useRef(0);

  const loadMethods = useCallback(async () => {
    const requestId = ++methodsRequestRef.current;
    if (!refundPointId) return;
    setMethodsError(false);
    setMethodsErrorMessage(undefined);
    try {
      const result = await getPaymentTypesByRefundPointIdApi(refundPointId);
      if (requestId !== methodsRequestRef.current) return;
      const list = result ?? [];
      setMethods(list);
      // A single contracted method is not a choice — preselect it, as web does.
      if (list.length === 1) setMethodState(list[0] ?? null);
    } catch (error) {
      if (requestId !== methodsRequestRef.current) return;
      logger.warn("[Refund] failed to load payment types", error);
      setMethodsError(true);
      setMethodsErrorMessage(getApiErrorMessage(error));
    }
  }, [refundPointId]);

  useEffect(() => {
    void loadMethods();
  }, [loadMethods]);

  const queryFor = useCallback(
    (skipCount: number): GetApiTagServiceTagTagsRefundData => ({
      refundPointId: refundPointId ?? undefined,
      isExportValidated,
      // Omitted until chosen: no method means "show everything this refund
      // point could pay", which is what an agent opening the app expects.
      refundType: method ?? undefined,
      travellerDocumentNumber: documentNumber,
      skipCount,
      maxResultCount: REFUND_PAGE_SIZE,
    }),
    [refundPointId, isExportValidated, method, documentNumber],
  );

  const loadTags = useCallback(async () => {
    if (!refundPointId) return;
    const requestId = ++tagsRequestRef.current;
    setIsLoading(true);
    setHasError(false);
    setErrorMessage(undefined);
    try {
      const result = await getRefundableTagsApi(queryFor(0));
      if (requestId !== tagsRequestRef.current) return;
      const items = result?.items ?? [];
      setTags(items);
      setTotalCount(result?.totalCount ?? 0);
      // One rule for every refetch: the selection keeps only what is still on
      // screen. A method change drops tags that method cannot pay; narrowing
      // to a traveller keeps the anchor tick, which is in the new list by
      // construction.
      setSelectedIds((prev) =>
        prev.filter((id) => items.some((row) => row.id === id)),
      );
    } catch (error) {
      if (requestId !== tagsRequestRef.current) return;
      logger.warn("[Refund] failed to load refundable tags", error);
      setTags([]);
      setTotalCount(0);
      setSelectedIds([]);
      setHasError(true);
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      if (requestId === tagsRequestRef.current) setIsLoading(false);
    }
  }, [refundPointId, queryFor]);

  useEffect(() => {
    void loadTags();
  }, [loadTags]);

  const canLoadMore = tags.length < totalCount;

  const loadMore = useCallback(async () => {
    if (isLoadingMore || tags.length >= totalCount) return;
    const requestId = tagsRequestRef.current;
    setIsLoadingMore(true);
    try {
      const result = await getRefundableTagsApi(queryFor(tags.length));
      // A filter changed mid-flight has already replaced this list; appending
      // that page to this one would mix two queries' results.
      if (requestId !== tagsRequestRef.current) return;
      setTags((prev) => [...prev, ...(result?.items ?? [])]);
      setTotalCount(result?.totalCount ?? 0);
    } catch (error) {
      logger.warn("[Refund] failed to load more refundable tags", error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, tags.length, totalCount, queryFor]);

  const setMethod = useCallback((next: RefundMethod) => {
    setMethodState(next);
  }, []);

  const setIsExportValidated = useCallback((next: boolean) => {
    setIsExportValidatedState(next);
  }, []);

  return {
    refundPointId,
    methods,
    methodsError,
    methodsErrorMessage,
    reloadMethods: loadMethods,
    method,
    setMethod,
    isExportValidated,
    setIsExportValidated,
    tags,
    totalCount,
    isLoading,
    isLoadingMore,
    canLoadMore,
    loadMore,
    hasError,
    errorMessage,
    reloadTags: loadTags,
    // Task 6 extends this object; `selectedIds` is declared here because
    // `loadTags` prunes it.
    selectedIds,
    setSelectedIds,
    documentNumber,
    setDocumentNumber,
  };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
npx jest useRefundHomeFlow.router.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/screens/refund-point/Home/useRefundHomeFlow.ts \
        src/screens/refund-point/Home/__tests__/useRefundHomeFlow.router.test.ts
git commit -m "feat(refund): add the worklist query, filters and paging"
```

---

### Task 6: `useRefundHomeFlow` — selection, first-tick narrowing and submit

**Files:**
- Modify: `src/screens/refund-point/Home/useRefundHomeFlow.ts`
- Modify: `src/screens/refund-point/Home/__tests__/useRefundHomeFlow.router.test.ts`

**Interfaces:**
- Consumes: everything Task 5 produced, plus `getTravellerByDocumentNumber(n: string)` from `@/actions/TravellerService/actions`, `postRefundApi` from `@/actions/RefundService/post`, and from `../Refund/refund.logic`: `sumTagTotals`, `isCurrencyCompatible`, `canSubmit as canSubmitState`, `buildCreateRefundDto`, `normalizeCardExpiry`, `type CardEntry`, `type RefundTotals`.
- Produces, added to the return value:

```ts
{
  traveller: UniRefund_TagService_Travellers_TravellerRequestDto | null;
  setTraveller: (t: UniRefund_TagService_Travellers_TravellerRequestDto | null) => void;
  /** Row identity for the card when the lookup failed: name only, no nationality. */
  travellerName: string | null;
  selectedIds: string[];
  selectedTags: UniRefund_TagService_Tags_TagListItemDto[];
  toggleTag: (row: UniRefund_TagService_Tags_TagListItemDto) => void;
  isTagSelectable: (row: UniRefund_TagService_Tags_TagListItemDto) => boolean;
  selectAll: () => void;
  clearSelection: () => void;
  card: CardEntry;
  setCardNumber: (v: string) => void;
  setCardExpiry: (v: string) => void;
  signatures: Partial<Record<SignatureTarget, string>>;
  setSignature: (target: SignatureTarget, uri: string) => void;
  totals: RefundTotals;
  canSubmit: boolean;
  isSubmitting: boolean;
  submit: () => Promise<{ ok: boolean; message?: string }>;
  createdRefund: { tagCount: number; method: RefundMethod; amount: number; currency: string } | null;
  reset: () => void;
}
```

- [ ] **Step 1: Write the failing tests**

Append to `src/screens/refund-point/Home/__tests__/useRefundHomeFlow.router.test.ts`. Add these mocks to the existing block at the top of the file:

```ts
jest.mock("@/actions/TravellerService/actions", () => ({
  getTravellerByDocumentNumber: jest.fn(),
}));
jest.mock("@/actions/RefundService/post", () => ({
  postRefundApi: jest.fn(() => Promise.resolve({})),
}));
```

and these alongside the other `mockGetTags` declaration:

```ts
import { getPaymentTypesByRefundPointIdApi } from "@/actions/ContractService/actions";
import { getTravellerByDocumentNumber } from "@/actions/TravellerService/actions";

const mockLookup = getTravellerByDocumentNumber as jest.MockedFunction<
  typeof getTravellerByDocumentNumber
>;
```

The `ContractService` import is needed by the last test below, which overrides
the method list for one render. Note that `jest.clearAllMocks()` in the existing
`beforeEach` wipes the module-factory default for
`getPaymentTypesByRefundPointIdApi` too — re-establish it there:

```ts
(
  getPaymentTypesByRefundPointIdApi as jest.MockedFunction<
    typeof getPaymentTypesByRefundPointIdApi
  >
).mockResolvedValue(["Cash"] as never);
```

Then add the describe block:

```ts
describe("useRefundHomeFlow first-tick narrowing", () => {
  beforeEach(() => {
    mockLookup.mockResolvedValue({
      firstName: "Ada",
      lastName: "Lovelace",
      travellerDocumentNumber: "U1",
      nationalityCountryCode3: "GBR",
    } as never);
  });

  it("narrows the query to the ticked row's traveller and keeps the tick", async () => {
    mockGetTags.mockResolvedValue({
      items: [tag("1"), tag("2", { travellerDocumentNumber: "U2" })],
      totalCount: 2,
    });
    const { result } = renderHook(() => useRefundHomeFlow());
    await waitFor(() => expect(result.current.tags).toHaveLength(2));

    mockGetTags.mockResolvedValue({ items: [tag("1")], totalCount: 1 });
    act(() => result.current.toggleTag(tag("1")));

    await waitFor(() =>
      expect(
        mockGetTags.mock.calls[mockGetTags.mock.calls.length - 1][0]
          .travellerDocumentNumber,
      ).toBe("U1"),
    );
    await waitFor(() => expect(result.current.selectedIds).toEqual(["1"]));
    await waitFor(() =>
      expect(result.current.traveller?.firstName).toBe("Ada"),
    );
  });

  it("still narrows when the traveller lookup fails, falling back to the row name", async () => {
    mockLookup.mockRejectedValue(new Error("no such traveller"));
    mockGetTags.mockResolvedValue({ items: [tag("1")], totalCount: 1 });

    const { result } = renderHook(() => useRefundHomeFlow());
    await waitFor(() => expect(result.current.tags).toHaveLength(1));

    act(() => result.current.toggleTag(tag("1")));

    await waitFor(() =>
      expect(
        mockGetTags.mock.calls[mockGetTags.mock.calls.length - 1][0]
          .travellerDocumentNumber,
      ).toBe("U1"),
    );
    expect(result.current.selectedIds).toEqual(["1"]);
    await waitFor(() =>
      expect(result.current.travellerName).toBe("Ada Lovelace"),
    );
    expect(result.current.traveller).toBeNull();
  });

  it("clearing the traveller widens the list and drops the selection", async () => {
    mockGetTags.mockResolvedValue({ items: [tag("1")], totalCount: 1 });
    const { result } = renderHook(() => useRefundHomeFlow());
    await waitFor(() => expect(result.current.tags).toHaveLength(1));
    act(() => result.current.toggleTag(tag("1")));
    await waitFor(() => expect(result.current.selectedIds).toEqual(["1"]));

    act(() => result.current.setTraveller(null));

    await waitFor(() =>
      expect(
        mockGetTags.mock.calls[mockGetTags.mock.calls.length - 1][0]
          .travellerDocumentNumber,
      ).toBeUndefined(),
    );
    expect(result.current.selectedIds).toEqual([]);
  });

  it("refuses a tag in a different currency once one is selected", async () => {
    mockGetTags.mockResolvedValue({
      items: [tag("1"), tag("2", { currency: "USD" })],
      totalCount: 2,
    });
    const { result } = renderHook(() => useRefundHomeFlow());
    await waitFor(() => expect(result.current.tags).toHaveLength(2));

    act(() => result.current.toggleTag(tag("1")));
    await waitFor(() => expect(result.current.selectedIds).toEqual(["1"]));

    expect(
      result.current.isTagSelectable(tag("2", { currency: "USD" })),
    ).toBe(false);
  });

  it("cannot submit until a method is chosen", async () => {
    // Two contracted methods, so the hook's single-method preselect does NOT
    // fire and `method` genuinely starts null. With the default one-method
    // mock this test would pass for the wrong reason.
    (
      getPaymentTypesByRefundPointIdApi as jest.MockedFunction<
        typeof getPaymentTypesByRefundPointIdApi
      >
    ).mockResolvedValueOnce(["Cash", "CreditCard"] as never);
    mockGetTags.mockResolvedValue({ items: [tag("1")], totalCount: 1 });

    const { result } = renderHook(() => useRefundHomeFlow());
    await waitFor(() => expect(result.current.tags).toHaveLength(1));
    act(() => result.current.toggleTag(tag("1")));
    await waitFor(() => expect(result.current.selectedIds).toEqual(["1"]));

    expect(result.current.method).toBeNull();
    expect(result.current.canSubmit).toBe(false);

    act(() => result.current.setMethod("Cash"));
    await waitFor(() => expect(result.current.canSubmit).toBe(true));
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest useRefundHomeFlow.router.test.ts
```

Expected: FAIL — `result.current.toggleTag is not a function`.

- [ ] **Step 3: Add selection, narrowing and submit to the hook**

Add to `src/screens/refund-point/Home/useRefundHomeFlow.ts`:

```ts
const [traveller, setTravellerState] = useState<Traveller | null>(null);
const [travellerName, setTravellerName] = useState<string | null>(null);
const [card, setCard] = useState<CardEntry>({ number: "", expiry: "" });
const [signatures, setSignatures] = useState<
  Partial<Record<SignatureTarget, string>>
>({});
const [isSubmitting, setIsSubmitting] = useState(false);
const [createdRefund, setCreatedRefund] = useState<{
  tagCount: number;
  method: RefundMethod;
  amount: number;
  currency: string;
} | null>(null);

const selectedTags = useMemo(
  () => tags.filter((row) => selectedIds.includes(row.id)),
  [tags, selectedIds],
);

const totals = useMemo(() => sumTagTotals(selectedTags), [selectedTags]);

/**
 * Once something is selected, only tags in the same currency may join it.
 * Summing across currencies produces a total that means nothing at the desk.
 *
 * There is deliberately no traveller check here: the first tick narrows the
 * list to one traveller, so by the time a second tick happens every visible
 * row already belongs to the same person.
 */
const isTagSelectable = useCallback(
  (row: TagRow) =>
    selectedIds.includes(row.id) || isCurrencyCompatible(row, selectedTags),
  [selectedIds, selectedTags],
);

/** A new traveller invalidates the previous traveller's selection. */
const setTraveller = useCallback((next: Traveller | null) => {
  setTravellerState(next);
  setTravellerName(
    next ? `${next.firstName} ${next.lastName}`.trim() : null,
  );
  setDocumentNumber(next?.travellerDocumentNumber);
  setSelectedIds([]);
  setSignatures({});
}, []);

const toggleTag = useCallback(
  (row: TagRow) => {
    // The first tick on the wide list is also a choice of traveller: it sets
    // the narrowing key straight from the row, so the list refilters even if
    // the record lookup below never resolves.
    if (!documentNumber) {
      setDocumentNumber(row.travellerDocumentNumber);
      setTravellerName(row.travellerFullName ?? null);
      setSelectedIds([row.id]);
      void getTravellerByDocumentNumber(row.travellerDocumentNumber)
        .then((found) => {
          if (found) setTravellerState(found as Traveller);
        })
        .catch((error) => {
          // Cosmetic only: the card falls back to the row's name and the
          // refund proceeds. A failed lookup must never block a payout.
          logger.warn("[Refund] traveller lookup failed", error);
        });
      return;
    }
    if (!isTagSelectable(row)) return;
    setSelectedIds((prev) => toggleSelection(prev, row.id));
  },
  [documentNumber, isTagSelectable],
);

const selectAll = useCallback(() => {
  setSelectedIds(tags.filter(isTagSelectable).map((row) => row.id));
}, [tags, isTagSelectable]);

const clearSelection = useCallback(() => setSelectedIds([]), []);

const setCardNumber = useCallback(
  (value: string) => setCard((prev) => ({ ...prev, number: value })),
  [],
);
const setCardExpiry = useCallback(
  (value: string) =>
    setCard((prev) => ({ ...prev, expiry: normalizeCardExpiry(value) })),
  [],
);
const setSignature = useCallback(
  (target: SignatureTarget, uri: string) =>
    setSignatures((prev) => ({ ...prev, [target]: uri })),
  [],
);

const flowState = useMemo(
  () => ({ refundPointId, selectedTags, method, card, isSubmitting }),
  [refundPointId, selectedTags, method, card, isSubmitting],
);

const canSubmit = useMemo(() => canSubmitState(flowState), [flowState]);

// A synchronous in-flight latch. `isSubmitting` state cannot do this job: two
// rapid invocations both read the pre-commit `false` and both pass the guard.
const isSubmittingRef = useRef(false);

const submit = useCallback(async (): Promise<{
  ok: boolean;
  message?: string;
}> => {
  if (isSubmittingRef.current) return { ok: false };
  if (!canSubmitState(flowState) || !method) return { ok: false };
  isSubmittingRef.current = true;
  setIsSubmitting(true);
  try {
    const [travellerSignature, refundPointSignature] = await Promise.all([
      toBase64(signatures.traveller),
      toBase64(signatures.refundPoint),
    ]);
    const dto = buildCreateRefundDto(
      flowState,
      { traveller: travellerSignature, refundPoint: refundPointSignature },
      new Date().toISOString(),
    );
    if (!dto) return { ok: false };

    await postRefundApi(dto);
    setCreatedRefund({
      tagCount: selectedTags.length,
      method,
      amount: totals.refund,
      currency: totals.currency,
    });
    return { ok: true };
  } catch (error) {
    logger.warn("[Refund] refund creation failed", error);
    return { ok: false, message: getApiErrorMessage(error) };
  } finally {
    isSubmittingRef.current = false;
    setIsSubmitting(false);
  }
}, [flowState, method, signatures, selectedTags.length, totals]);

/**
 * Back to a fresh desk. Deliberately NOT wired to `useFocusEffect`: Home is
 * the landing tab, and a focus-driven reset would wipe a half-built refund
 * every time the agent glanced at another tab. The old `/refund` route needed
 * one because it was a retained `href: null` tab; this screen is not.
 */
const reset = useCallback(() => {
  setTravellerState(null);
  setTravellerName(null);
  setDocumentNumber(undefined);
  setSelectedIds([]);
  setSignatures({});
  setCard({ number: "", expiry: "" });
  setCreatedRefund(null);
  void loadTags();
}, [loadTags]);
```

Carry `toBase64` across from the deleted `useRefundFlow`:

```ts
async function toBase64(uri?: string): Promise<string | undefined> {
  if (!uri) return undefined;
  return await new File(uri).base64();
}
```

Add the new members to the returned object and drop the temporary `setSelectedIds` / `setDocumentNumber` exports from Task 5 — they were only there to let Task 5's `loadTags` prune.

- [ ] **Step 4: Run the tests and watch them pass**

```bash
npx jest useRefundHomeFlow.router.test.ts
npm run typecheck
```

Expected: PASS, 10 tests total; typecheck matches baseline.

- [ ] **Step 5: Commit**

```bash
git add src/screens/refund-point/Home/useRefundHomeFlow.ts \
        src/screens/refund-point/Home/__tests__/useRefundHomeFlow.router.test.ts
git commit -m "feat(refund): add selection, first-tick narrowing and submit to the worklist flow"
```

---

### Task 7: `MethodTiles` and `RefundTagList`

**Files:**
- Create: `src/screens/refund-point/Home/_components/MethodTiles.tsx`
- Create: `src/screens/refund-point/Home/_components/RefundTagList.tsx`
- Create: `src/screens/refund-point/Home/_components/__tests__/RefundTagList.router.test.tsx`
- Move: `src/screens/refund-point/Refund/_components/MethodPickerSkeleton.tsx` → `src/screens/refund-point/Home/_components/MethodPickerSkeleton.tsx`

**Interfaces:**
- Consumes: `BatchTagRow` (Task 3); `METHOD_LABELS` from `../../Refund/method-labels`; `RefundMethod` from `../../Refund/refund.logic`.
- Produces:

```ts
export function MethodTiles(props: {
  methods: RefundMethod[] | null;
  methodsError: boolean;
  methodsErrorMessage?: string;
  onRetry: () => void;
  method: RefundMethod | null;
  onSelect: (m: RefundMethod) => void;
  disabled?: boolean;
}): React.JSX.Element;

export function RefundTagList(props: {
  tags: UniRefund_TagService_Tags_TagListItemDto[];
  isLoading: boolean;
  isLoadingMore?: boolean;
  canLoadMore?: boolean;
  onLoadMore?: () => void;
  hasError: boolean;
  errorMessage?: string;
  selectedIds: string[];
  isTagSelectable: (row: UniRefund_TagService_Tags_TagListItemDto) => boolean;
  onToggle: (row: UniRefund_TagService_Tags_TagListItemDto) => void;
  onOpenTag?: (row: UniRefund_TagService_Tags_TagListItemDto) => void;
  emptyMessage?: string;
  disabled?: boolean;
}): React.JSX.Element;
```

- [ ] **Step 1: Write the failing test for the list**

Create `src/screens/refund-point/Home/_components/__tests__/RefundTagList.router.test.tsx`:

```tsx
import type { UniRefund_TagService_Tags_TagListItemDto } from "@/saas/TagService";
import { render } from "@testing-library/react-native";
import { RefundTagList } from "../RefundTagList";

jest.mock("@/store/application-configuration", () => ({
  useAppCurrency: () => "EUR",
}));

function tag(id: string) {
  return {
    id,
    tagNumber: `TAG-${id}`,
    currency: "EUR",
    refund: 10,
    travellerFullName: "Ada Lovelace",
  } as UniRefund_TagService_Tags_TagListItemDto;
}

const base = {
  isLoading: false,
  hasError: false,
  selectedIds: [] as string[],
  isTagSelectable: () => true,
  onToggle: jest.fn(),
};

describe("RefundTagList", () => {
  it("renders one row per tag", () => {
    const { getByText } = render(
      <RefundTagList {...base} tags={[tag("1"), tag("2")]} />,
    );
    expect(getByText("TAG-1")).toBeTruthy();
    expect(getByText("TAG-2")).toBeTruthy();
  });

  it("shows the empty message instead of rows", () => {
    const { getByText, queryByText } = render(
      <RefundTagList {...base} tags={[]} emptyMessage="Nothing here" />,
    );
    expect(getByText("Nothing here")).toBeTruthy();
    expect(queryByText("TAG-1")).toBeNull();
  });

  it("shows the server message on error", () => {
    const { getByText } = render(
      <RefundTagList {...base} tags={[]} hasError errorMessage="Server said no" />,
    );
    expect(getByText("Server said no")).toBeTruthy();
  });

  it("offers Load more only when there is another page", () => {
    const { queryByText, rerender } = render(
      <RefundTagList {...base} tags={[tag("1")]} />,
    );
    expect(queryByText("Load more")).toBeNull();
    rerender(
      <RefundTagList {...base} tags={[tag("1")]} canLoadMore onLoadMore={jest.fn()} />,
    );
    expect(queryByText("Load more")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest RefundTagList.router.test.tsx
```

Expected: FAIL — cannot resolve `../RefundTagList`.

- [ ] **Step 3: Write `RefundTagList`**

Create `src/screens/refund-point/Home/_components/RefundTagList.tsx`. This mirrors `CustomsTagList` **without** the actionable/blocked split — `splitByActionable` is a customs concept, and refund's non-selectable rows are decided by currency and expressed by omitting the checkbox:

```tsx
import { Text } from "@/components/ui";
import { colors } from "@/utils/theme";
import { useLocalization } from "@/providers/LocalizationProvider";
import { useAppCurrency } from "@/store/application-configuration";
import type { UniRefund_TagService_Tags_TagListItemDto } from "@/saas/TagService";
import { BatchTagRow } from "@/screens/shared/_components/BatchTagRow";
import { useCallback, useMemo } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

type TagRow = UniRefund_TagService_Tags_TagListItemDto;

/**
 * The refundable worklist's rows — plain, card-less, and scrolled by the page
 * around them, the way the customs worklist's are.
 *
 * Deliberately not virtualised: the page owns a single `ScrollView`, and a
 * `FlashList` inside it would be a virtualised list nested in a scroller on the
 * same axis. Safe because the query is paged.
 */
export function RefundTagList({
  tags,
  isLoading,
  isLoadingMore,
  canLoadMore,
  onLoadMore,
  hasError,
  errorMessage,
  selectedIds,
  isTagSelectable,
  onToggle,
  onOpenTag,
  emptyMessage,
  disabled,
}: {
  tags: TagRow[];
  isLoading: boolean;
  isLoadingMore?: boolean;
  canLoadMore?: boolean;
  onLoadMore?: () => void;
  hasError: boolean;
  errorMessage?: string;
  selectedIds: string[];
  isTagSelectable: (row: TagRow) => boolean;
  onToggle: (row: TagRow) => void;
  onOpenTag?: (row: TagRow) => void;
  emptyMessage?: string;
  disabled?: boolean;
}) {
  const { t, activeLocale, formatDate } = useLocalization();
  const tenantCurrency = useAppCurrency();

  // A bare number, not `formatCurrency`: the card already prints the currency
  // code beside the value, so a formatter that includes one renders
  // "EUR 40.00 EUR".
  const formatAmount = useMemo(() => {
    const formatter = new Intl.NumberFormat(activeLocale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return (amount: number | null) =>
      amount === null ? "—" : formatter.format(amount);
  }, [activeLocale]);

  const formatRowDate = useCallback(
    (isoDate?: string | null) => (isoDate ? formatDate(isoDate) : ""),
    [formatDate],
  );

  if (isLoading) {
    return (
      <View className="flex-row items-center gap-2 py-4">
        <ActivityIndicator color={colors.primary} />
        <Text variant="body" tone="muted">
          {t("MobileApp.Refund.Loading")}
        </Text>
      </View>
    );
  }

  if (hasError) {
    return (
      <Text variant="body" tone="error" className="py-2">
        {errorMessage ?? t("MobileApp.Refund.TagsError")}
      </Text>
    );
  }

  if (tags.length === 0) {
    return (
      <Text variant="body" tone="muted" className="py-2">
        {emptyMessage ?? t("MobileApp.Refund.TagsEmpty")}
      </Text>
    );
  }

  return (
    <View className="gap-2">
      {tags.map((row) => (
        <BatchTagRow
          key={row.id}
          tag={row}
          selected={selectedIds.includes(row.id)}
          selectable={isTagSelectable(row)}
          disabled={disabled}
          secondary={row.travellerFullName ?? row.merchantTitle}
          currencyCode={tenantCurrency}
          formatDate={formatRowDate}
          formatAmount={formatAmount}
          onToggle={onToggle}
          onOpen={onOpenTag}
        />
      ))}

      {/* An explicit control rather than an infinite scroll: the agent is
          working a finite counter queue and needs to know when they have
          reached the end of it. */}
      {canLoadMore ? (
        <Pressable
          onPress={onLoadMore}
          disabled={disabled || isLoadingMore}
          accessibilityRole="button"
          className="py-3 items-center"
        >
          {isLoadingMore ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text variant="caption" className="font-medium text-primary">
              {t("MobileApp.Refund.LoadMore")}
            </Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 4: Run the list test and watch it pass**

```bash
npx jest RefundTagList.router.test.tsx
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Write `MethodTiles`**

Move `MethodPickerSkeleton.tsx` into `Home/_components/`, then create `Home/_components/MethodTiles.tsx`. It is the tile row lifted out of `MethodPicker`, keeping its error, loading and empty branches — **without** the `Cash` paid-date line and the `CreditCard` fields, which move to the sheet in Task 8:

```tsx
import { colors } from "@/utils/theme";
import { Text } from "@/components/ui";
import { Ionicons, type IoniconsTypes } from "@/components/Ionicons";
import { useLocalization } from "@/providers/LocalizationProvider";
import { cn } from "@/utils/cn";
import { Pressable, View } from "react-native";
import { METHOD_LABELS } from "../../Refund/method-labels";
import type { RefundMethod } from "../../Refund/refund.logic";
import { MethodPickerSkeleton } from "./MethodPickerSkeleton";

const METHOD_ICONS: Record<RefundMethod, IoniconsTypes> = {
  Cash: "cash-outline",
  CreditCard: "card-outline",
  BankTransfer: "business-outline",
  Wallet: "wallet-outline",
  CashViaPartner: "people-outline",
  IbanTransfer: "swap-horizontal-outline",
};

/**
 * The contracted payout methods, as the worklist's second filter row —
 * `refundType` narrows the query, so the method chosen decides which tags are
 * even offered. Occupies the slot the customs worklist gives its risk tiles.
 *
 * Card details are NOT here: they are a submit-time secret, collected in the
 * confirm sheet beside the signatures, not left on screen at the counter.
 */
export function MethodTiles({
  methods,
  methodsError,
  methodsErrorMessage,
  onRetry,
  method,
  onSelect,
  disabled,
}: {
  methods: RefundMethod[] | null;
  methodsError: boolean;
  methodsErrorMessage?: string;
  onRetry: () => void;
  method: RefundMethod | null;
  onSelect: (method: RefundMethod) => void;
  disabled?: boolean;
}) {
  const { t } = useLocalization();

  if (methodsError) {
    return (
      <View>
        <Text className="text-sm text-muted mb-3">
          {methodsErrorMessage ?? t("MobileApp.Refund.MethodsError")}
        </Text>
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          className="self-start px-4 py-2 rounded-full bg-foreground/5"
        >
          <Text className="text-sm font-medium text-foreground">
            {t("MobileApp.Refund.Retry")}
          </Text>
        </Pressable>
      </View>
    );
  }

  // `methods` is null in exactly two situations, both "a request is in
  // flight": first load, and a retry. The error case above has already
  // returned, so null here can only mean loading.
  if (methods === null) return <MethodPickerSkeleton />;

  if (methods.length === 0) {
    return (
      <Text className="text-sm text-muted">
        {t("MobileApp.Refund.MethodsEmpty")}
      </Text>
    );
  }

  return (
    <View className="flex-row flex-wrap gap-2">
      {methods.map((option) => {
        const active = method === option;
        return (
          <Pressable
            key={option}
            onPress={() => onSelect(option)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className={cn(
              "flex-1 basis-24 items-center gap-1.5 rounded-xl border p-3",
              active ? "border-primary bg-primary/5" : "border-border",
              disabled && "opacity-50",
            )}
          >
            <Ionicons
              name={METHOD_ICONS[option]}
              size={20}
              color={active ? colors.primary : colors.muted}
            />
            <Text
              className={cn(
                "text-xs font-medium text-center",
                active ? "text-primary" : "text-muted",
              )}
            >
              {t(METHOD_LABELS[option])}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
```

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck
npx jest RefundTagList.router.test.tsx
git add src/screens/refund-point/Home/_components/
git add -u src/screens/refund-point/Refund/_components/
git commit -m "feat(refund): add MethodTiles and RefundTagList for the worklist"
```

---

### Task 8: The confirm sheet takes totals, card fields and signatures

**Files:**
- Create: `src/screens/refund-point/Home/_components/RefundConfirmSheet.tsx`
- Create: `src/screens/refund-point/Home/_components/__tests__/RefundConfirmSheet.router.test.tsx`
- Delete: `src/screens/refund-point/Refund/_components/RefundConfirmSheet.tsx`

**Interfaces:**
- Consumes: `SignaturePads`, `SignatureSheet`, `type SignatureTarget` from `@/screens/shared/_components/tag-calculator/*`; `formatCardNumber`, `isExpiredCard`, `luhnValid`, `parseExpiry` from `@/utils/card/card`; `METHOD_LABELS`; `type RefundTotals`, `type RefundMethod`, `type CardEntry`.
- Produces:

```ts
export function RefundConfirmSheet(props: {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  selectedCount: number;
  method: RefundMethod | null;
  totals: RefundTotals;
  card: CardEntry;
  onCardNumberChange: (v: string) => void;
  onCardExpiryChange: (v: string) => void;
  signatures: Partial<Record<SignatureTarget, string>>;
  onSign: (target: SignatureTarget, uri: string) => void;
  isSubmitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}): React.JSX.Element;
```

**The hazard this task must get right:** `SignatureSheet` is itself a `BottomSheetModal`. Presenting it over the confirm sheet **requires `stackBehavior="push"`** on the signature sheet, or the confirm sheet minimizes and its dismissal restore-crashes with "index out of snap points range". This repo has already hit that failure with Toast. It reproduces **only on device** — the test below asserts the prop is set, which is the most a unit test can do.

- [ ] **Step 1: Write the failing test**

Create `src/screens/refund-point/Home/_components/__tests__/RefundConfirmSheet.router.test.tsx`:

```tsx
import { render } from "@testing-library/react-native";
import { createRef } from "react";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { RefundConfirmSheet } from "../RefundConfirmSheet";

const stackBehaviours: (string | undefined)[] = [];

jest.mock("@/screens/shared/_components/tag-calculator/SignatureSheet", () => ({
  SignatureSheet: (props: { stackBehavior?: string }) => {
    stackBehaviours.push(props.stackBehavior);
    return null;
  },
}));

const totals = {
  refund: 55,
  salesAmount: 100,
  vatAmount: 20,
  refundFee: 5,
  currency: "EUR",
};

function renderSheet(over: Record<string, unknown> = {}) {
  return render(
    <RefundConfirmSheet
      sheetRef={createRef<BottomSheetModal>()}
      selectedCount={2}
      method="Cash"
      totals={totals}
      card={{ number: "", expiry: "" }}
      onCardNumberChange={jest.fn()}
      onCardExpiryChange={jest.fn()}
      signatures={{}}
      onSign={jest.fn()}
      isSubmitting={false}
      onConfirm={jest.fn()}
      onCancel={jest.fn()}
      {...over}
    />,
  );
}

beforeEach(() => {
  stackBehaviours.length = 0;
});

describe("RefundConfirmSheet", () => {
  it('pushes the signature sheet rather than replacing the confirm sheet', () => {
    renderSheet();
    expect(stackBehaviours).toContain("push");
  });

  it("shows card fields only for CreditCard", () => {
    const { queryByText, rerender } = renderSheet();
    expect(queryByText("Card number")).toBeNull();
    rerender(
      <RefundConfirmSheet
        sheetRef={createRef<BottomSheetModal>()}
        selectedCount={2}
        method="CreditCard"
        totals={totals}
        card={{ number: "", expiry: "" }}
        onCardNumberChange={jest.fn()}
        onCardExpiryChange={jest.fn()}
        signatures={{}}
        onSign={jest.fn()}
        isSubmitting={false}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    expect(queryByText("Card number")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest RefundConfirmSheet.router.test.tsx
```

Expected: FAIL — cannot resolve `../RefundConfirmSheet`.

- [ ] **Step 3: Write the sheet**

Start from the existing `Refund/_components/RefundConfirmSheet.tsx` — keep its backdrop handling, its in-flight lockdown (`enableContentPanningGesture={!isSubmitting}`, `enablePanDownToClose={!isSubmitting}`, `pressBehavior={isSubmitting ? "none" : "close"}`), and its totals rows verbatim. Add, between the totals block and the Confirm button:

```tsx
{method === "CreditCard" && (
  <View>
    <Input
      label={t("MobileApp.Refund.CardNumber")}
      iconName="card-outline"
      value={card.number}
      onChangeText={(value) => onCardNumberChange(formatCardNumber(value))}
      onBlur={() => setNumberTouched(true)}
      keyboardType="number-pad"
      editable={!isSubmitting}
      placeholder={t("MobileApp.Cards.CardNumberPlaceholder")}
    />
    <Input
      label={t("MobileApp.Refund.CardExpiry")}
      iconName="calendar-outline"
      value={card.expiry}
      onChangeText={onCardExpiryChange}
      onBlur={() => setExpiryTouched(true)}
      keyboardType="number-pad"
      editable={!isSubmitting}
      placeholder={t("MobileApp.Cards.ExpiryPlaceholder")}
      maxLength={5}
    />
    {showCardError && (
      <Text className="text-xs text-primary">
        {t("MobileApp.Refund.CardInvalid")}
      </Text>
    )}
  </View>
)}

<SignaturePads
  signatures={signatures}
  onSign={openSignature}
  targets={SIGNATURE_TARGETS}
/>
```

with the blur-gated validation carried over from `MethodPicker`:

```tsx
const [numberTouched, setNumberTouched] = useState(false);
const [expiryTouched, setExpiryTouched] = useState(false);
const numberValid = luhnValid(card.number);
const expiryParsed = parseExpiry(card.expiry);
const expiryValid =
  expiryParsed !== null &&
  !isExpiredCard(expiryParsed.month, expiryParsed.year);
const showCardError =
  method === "CreditCard" &&
  ((numberTouched && card.number.length > 0 && !numberValid) ||
    (expiryTouched && card.expiry.length > 0 && !expiryValid));

/** Only these two pads: `CreateRefundDto` has no merchant signature field. */
const SIGNATURE_TARGETS: SignatureTarget[] = ["traveller", "refundPoint"];
```

and the nested signature sheet **rendered as a sibling of the confirm sheet, not inside its `BottomSheetView`** — hooks called inside a `BottomSheet` child lose context, and `useLocalization()` there silently renders raw i18n keys:

```tsx
<SignatureSheet
  sheetRef={signatureSheetRef}
  target={signatureTarget}
  onSave={onSign}
  // Without this the confirm sheet minimizes when the pad opens, and
  // dismissing the pad restore-crashes with "index out of snap points
  // range". Device-only failure; the test asserts the prop, not the crash.
  stackBehavior="push"
/>
```

If `SignatureSheet` does not currently accept `stackBehavior`, add it as an optional prop that it forwards to its `BottomSheet`, defaulting to today's behaviour so no existing caller changes.

- [ ] **Step 4: Run the test and watch it pass**

```bash
npx jest RefundConfirmSheet.router.test.tsx
npm run typecheck
```

Expected: PASS, 2 tests; typecheck matches baseline.

- [ ] **Step 5: Commit**

```bash
git add src/screens/refund-point/Home/_components/RefundConfirmSheet.tsx \
        src/screens/refund-point/Home/_components/__tests__/RefundConfirmSheet.router.test.tsx \
        src/screens/shared/_components/tag-calculator/SignatureSheet.tsx
git commit -m "feat(refund): move totals, card entry and signatures into the confirm sheet"
```

---

### Task 9: The worklist screen, and retiring `/refund`

**Files:**
- Rewrite: `src/screens/refund-point/Home/HomeScreen.tsx`
- Create: `src/screens/refund-point/Home/__tests__/RefundPointHomeScreen.router.test.tsx`
- Move: `Refund/_components/RefundSuccess.tsx` → `Home/_components/RefundSuccess.tsx`
- Move: `Refund/refund.logic.ts`, `Refund/method-labels.ts` → `Home/`
- Move: `Refund/__tests__/refund.logic.test.ts` → `Home/__tests__/`
- Delete: `src/app/(auth)/refund.tsx`
- Modify: `src/app/(auth)/_layout.tsx` (remove the `Tabs.Screen name="refund"` block near line 204 and its comment)
- Modify: `src/app/__tests__/tabBackNavigation.router.test.tsx` (remove the `"(auth)/refund": stub("Refund")` entry at line 154)
- Delete: `Refund/RefundScreen.tsx`, `Refund/useRefundFlow.ts`, `Refund/_components/RefundSummaryBar.tsx`, `Refund/_components/RefundableTagList.tsx`, `Refund/_components/RefundableTagListSkeleton.tsx`, `Refund/_components/MethodPicker.tsx`, `Refund/__tests__/refundReentry.router.test.tsx`, `Refund/__tests__/useRefundFlow.router.test.ts`

After this task `src/screens/refund-point/Refund/` no longer exists. Update every import of the moved modules (`refund.logic`, `method-labels`) — Task 5–8 files reference them as `../Refund/...`; they become `../` or `./`.

**Interfaces:**
- Consumes: everything from Tasks 2–8.
- Produces: `export default function RefundPointHomeScreen(): React.JSX.Element`, rendered by `src/app/(auth)/index.tsx` for `role === "refundPoint"` (that file needs no change — it already imports from this path).

- [ ] **Step 1: Write the failing screen test**

Create `src/screens/refund-point/Home/__tests__/RefundPointHomeScreen.router.test.tsx`. Mirror the mock set in `src/screens/customs/Home/__tests__/CustomsHomeScreen.router.test.tsx` — read that file first and copy its provider and navigation mocks rather than inventing new ones.

```tsx
import { render, waitFor } from "@testing-library/react-native";
import RefundPointHomeScreen from "../HomeScreen";

jest.mock("../useRefundHomeFlow", () => ({
  useRefundHomeFlow: () => mockFlow,
}));

let mockFlow: Record<string, unknown>;

const baseFlow = {
  refundPointId: "rp-1",
  methods: ["Cash"],
  methodsError: false,
  reloadMethods: jest.fn(),
  method: "Cash",
  setMethod: jest.fn(),
  isExportValidated: true,
  setIsExportValidated: jest.fn(),
  traveller: null,
  travellerName: null,
  setTraveller: jest.fn(),
  tags: [],
  totalCount: 0,
  isLoading: false,
  isLoadingMore: false,
  canLoadMore: false,
  loadMore: jest.fn(),
  hasError: false,
  selectedIds: [] as string[],
  selectedTags: [],
  toggleTag: jest.fn(),
  isTagSelectable: () => true,
  selectAll: jest.fn(),
  clearSelection: jest.fn(),
  card: { number: "", expiry: "" },
  setCardNumber: jest.fn(),
  setCardExpiry: jest.fn(),
  signatures: {},
  setSignature: jest.fn(),
  totals: { refund: 0, salesAmount: 0, vatAmount: 0, refundFee: 0, currency: "EUR" },
  canSubmit: false,
  isSubmitting: false,
  submit: jest.fn(),
  createdRefund: null,
  reset: jest.fn(),
};

beforeEach(() => {
  mockFlow = { ...baseFlow };
});

describe("RefundPointHomeScreen", () => {
  it("renders the worklist with the traveller filter prompt", async () => {
    const { getByText } = render(<RefundPointHomeScreen />);
    await waitFor(() => expect(getByText("Filter by traveller")).toBeTruthy());
  });

  it("hides Select all until the list is narrowed to a traveller", () => {
    mockFlow = { ...baseFlow, tags: [{ id: "1", tagNumber: "TAG-1" }] };
    const { queryByText } = render(<RefundPointHomeScreen />);
    expect(queryByText("Select all")).toBeNull();
  });

  it("shows the success takeover instead of the worklist after a refund", () => {
    mockFlow = {
      ...baseFlow,
      createdRefund: { tagCount: 2, method: "Cash", amount: 55, currency: "EUR" },
    };
    const { queryByText } = render(<RefundPointHomeScreen />);
    expect(queryByText("Filter by traveller")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest RefundPointHomeScreen.router.test.tsx
```

Expected: FAIL — the current `HomeScreen.tsx` is the launcher and renders none of this.

- [ ] **Step 3: Rewrite `HomeScreen.tsx`**

Structure it exactly as `src/screens/customs/Home/HomeScreen.tsx` does — read that file and mirror it. The load-bearing details to copy verbatim:

- `<TabPage title={t("MobileApp.Refund.Title")}>` wrapping a `<View className="flex-1">` with **no** `paddingBottom` (an absolutely positioned child's `bottom: 0` resolves against the view's bottom edge, not its padding box).
- The pinned block (`<View className="mb-3">`) holding `TravellerFilterCard`, above the scroller.
- `ScrollView` from `react-native-gesture-handler` (not `react-native`), with `contentContainerStyle={{ flexGrow: 1, paddingBottom: footerHeight }}`, `showsVerticalScrollIndicator={false}`, `keyboardShouldPersistTaps="handled"`.
- `const [footerHeight, setFooterHeight] = useState(0)` fed by the footer's `onLayout` — measured, not guessed, because the row's height moves with the font scale.
- `ActionFooterRow` with `containerStyle={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingBottom: Math.max(insets.bottom, tabInset) + FOOTER_GAP }}` and **no** `px-4` (TabPage already pads its children).

The refund-specific body, in order inside the scroller: the export-validated toggle (two chips, styled exactly like customs' date presets — `rounded-full px-3 py-1.5`, `bg-primary` when active), `MethodTiles`, `BatchListControls` (only when `tags.length > 0`, with `showSelectAll={!!flow.traveller || !!flow.travellerName}`), then `RefundTagList`.

The footer action:

```tsx
<ActionFooterRow
  onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
  containerStyle={{ /* as above */ }}
  disabled={!flow.canSubmit}
  action={{
    label: t("MobileApp.Refund.Submit", {
      amount: formatCurrency(flow.totals.refund, flow.totals.currency),
    }),
    onPress: () => confirmSheetRef.current?.present(),
    iconName: "cash-outline",
  }}
/>
```

Early return for the success takeover, before the worklist:

```tsx
if (flow.createdRefund) {
  return (
    <TabPage title={t("MobileApp.Refund.Title")}>
      <RefundSuccess
        tagCount={flow.createdRefund.tagCount}
        amount={flow.createdRefund.amount}
        currency={flow.createdRefund.currency}
        method={flow.createdRefund.method}
        onReset={flow.reset}
      />
    </TabPage>
  );
}
```

Keep the `!flow.refundPointId` guard from `RefundScreen` (the `MobileApp.Refund.NoRefundPoint` message), and the submit handler that prefers the server's message:

```tsx
const handleConfirm = useCallback(async () => {
  const result = await flow.submit();
  confirmSheetRef.current?.dismiss();
  if (!result.ok) {
    toastRef.current?.show(
      "error",
      result.message ?? t("MobileApp.Refund.SubmitError"),
    );
  }
}, [flow, t, toastRef]);
```

- [ ] **Step 4: Run the screen test and watch it pass**

```bash
npx jest RefundPointHomeScreen.router.test.tsx
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Retire the route**

Delete `src/app/(auth)/refund.tsx`. In `src/app/(auth)/_layout.tsx`, delete the `<Tabs.Screen name="refund" … />` block near line 204 together with the comment above it that explains it. In `src/app/__tests__/tabBackNavigation.router.test.tsx`, remove the `"(auth)/refund": stub("Refund"),` entry at line 154.

- [ ] **Step 6: Delete the dead module and fix imports**

```bash
git rm -r src/screens/refund-point/Refund
```

after moving `refund.logic.ts`, `method-labels.ts`, `RefundSuccess.tsx` and `refund.logic.test.ts` to their new homes. Then fix every `../Refund/...` import introduced in Tasks 5–8.

```bash
grep -rn "refund-point/Refund\|\.\./Refund/" src/ | grep -v node_modules
```

Expected: no hits.

- [ ] **Step 7: Full gate**

```bash
npm run init
npm run typecheck
npm test 2>&1 | tail -20
npm run lint 2>&1 | tail -5
```

Expected: every number matches the Step 1 baseline you recorded in Task 1. If `npm test` reports 2 failing suites, re-run `npx jest CardScannerModal.router.test.tsx` in isolation before treating it as a regression.

- [ ] **Step 8: Commit**

```bash
git add -A src/screens/refund-point src/app
git commit -m "feat(refund): Home becomes the refund worklist and /refund is retired"
```

---

### Task 10: On-device verification

The unit suite cannot prove three of this feature's riskiest behaviours: the nested signature sheet, the floating footer's clearance over the tab island, and whether a traveller-less worklist returns a usable set against a real tenant.

**Files:** none — this task produces a verification report, not code.

- [ ] **Step 1: Confirm a debuggable build and a refund-point login**

JS-only QA over Metro works only on a **debuggable** build. Check `flags=` before assuming:

```bash
adb devices -l
adb shell dumpsys package com.unirefund.superapp | grep -i "flags="
```

The account matters as much as the build: this screen needs a session whose active affiliation resolves a **refund point** (`useRefundPointId()` non-null), or every run shows the `NoRefundPoint` guard. If the debuggable device has no refund-point account available, stop and report that — do not substitute another role and call it verified.

- [ ] **Step 2: Start Metro and attach**

```bash
npx expo start --offline
```

Note the port Metro actually advertises — never assume it. Then map it identically and enter through the dev-client deep link:

```bash
adb reverse tcp:<PORT> tcp:<PORT>
adb shell am start -a android.intent.action.VIEW \
  -d "unirefundsuperapp://expo-development-client/?url=http%3A%2F%2Flocalhost%3A<PORT>"
```

- [ ] **Step 3: Verify the four things tests cannot**

1. **Nested sheet.** Tick a tag, press the Refund pill, then tap a signature pad. The confirm sheet must stay put behind the pad. Save the signature, dismiss the pad — the confirm sheet must return to full height, not crash with "index out of snap points range".
2. **Footer clearance.** Scroll to the last row. The Refund pill must float clear of the tab island, and the last tag must be reachable and tappable.
3. **Wide worklist size.** Note how many tags the traveller-less list reports (`totalCount`). Record the number — this is the spec's one unverified risk.
4. **First-tick narrowing.** Tick a row on the wide list. The list must refilter to that traveller, the card must fill in with their name, and the tick must survive.

- [ ] **Step 4: Report**

Report each of the four with what you actually observed. If the traveller lookup was slow enough to show the fallback name first, say so — that is the degrade path working, not a bug.

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: navigation and file changes → Tasks 9; shared components → Tasks 2–4; data flow including narrowing, pruning and the removed focus reset → Tasks 5–6; layout mapping → Tasks 7 and 9; the sheet including the `stackBehavior` hazard → Task 8; error handling → distributed across Tasks 5 (list, methods), 6 (lookup, submit) and 9 (toast); testing → each task's own steps plus Task 9 Step 7; the two carried risks → Task 10.

**Type consistency.** `isTagSelectable` is a hook-returned function in Tasks 6, 7 and 9 and a `selectable: boolean` prop on `BatchTagRow` in Task 3 — deliberately different names for different things. `documentNumber` (narrowing key) and `traveller` (display record) stay distinct throughout, which is what makes the lookup-failure path work. `REFUND_PAGE_SIZE` is defined once in Task 5 and asserted as `20` in its test.

**Known rough edge.** Task 5 temporarily exports `setSelectedIds` and `setDocumentNumber` so its own `loadTags` can prune; Task 6 removes them from the returned object. An executor stopping between the two tasks leaves a slightly leaky hook surface — intentional, and called out in Task 6 Step 3.

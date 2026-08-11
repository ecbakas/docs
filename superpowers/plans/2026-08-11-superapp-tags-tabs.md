# Tabs on the Traveller Tags Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the traveller tags screen into two tabs — **Tags** (left, default) and **Verifications** (right) — and show all three verification statuses on the second tab.

**Architecture:** `TagScreen` gains one piece of state, `activeTab`, and switches its body on it. A small two-segment control lives beside the screen it serves. The existing verifications block stops being the list's header and becomes the second tab's body, which is what forces it to show `Completed` and to grow an empty state.

**Tech Stack:** Expo / React Native, expo-router, NativeWind, `@shopify/flash-list`, Zustand, Jest.

**Spec:** [`docs/superpowers/specs/2026-08-11-superapp-tags-tabs-design.md`](../specs/2026-08-11-superapp-tags-tabs-design.md)

## Global Constraints

- **Repo:** `c:\unirefund\super-app`, branch `feat/superapp-manual-verification` (already checked out — never switch or create branches).
- **The working tree is shared.** Another session has uncommitted work here: a session-expiry feature touching `src/providers/SessionProvider.tsx`, `src/utils/auth/**`, `src/utils/customFetch.ts`, `src/app/_layout.tsx`, `src/features/SessionExpiryNotice.tsx` and several new test files, plus an **additive** edit to both i18n resource files. **Stage only your own files by explicit path — never `git add -A`**, and never stage anything under those paths or `src/data/**`. When you edit the i18n resources, their uncommitted `SessionExpired` key is in the same file: do not stage it.
- **Never** run `git reset --hard`, `git rebase`, `git stash`, or `git checkout <branch>`. A `reset --hard` in this repo has destroyed another session's work before. Do not run `npm run gen`, `npm install`, or `expo start`.
- **An `mv` on this shell has silently lost a file before.** Prefer Write over shell moves, and re-read anything you move.
- **No hardcoded user-visible text.** Keys go in `src/localization/resources/en-US.json` **and** `tr-TR.json`, read via `useLocalization()`'s `t()`.
- **The i18n trap, hit four times in this project:** `getNestedValue` (`src/utils/localization.ts:3-10`) does `path.split(".").reduce(...)`, so a literal key containing a dot is invisible and `t()` renders the key string on screen. **Nest every key properly.** After adding keys run `npm run init`; `tsc` cannot see a new key until it regenerates `src/data/language-data/*.gen.json`. **Never edit or stage those `.gen.json` files.**
- **No `useEffect`** for derived state or event responses (`.claude/rules/avoid-use-effect.md`). `TagScreen`'s existing `useFocusEffect` is the sanctioned lifecycle hook; do not add another.
- **UI from `src/components/**` first**, NativeWind classes with semantic tokens (`bg-card`, `text-foreground`, `text-muted`, `border-border`, `text-primary`), not hardcoded colours. See `.claude/rules/ui-components.md`.
- **No new dependency.**
- **Comments sparse.** The author has explicitly asked for far fewer comments than this repo shows. Comment only what the code cannot say — the superseded-adjacency rule earns one line. No docblock restating a component name.
- **Staff must see nothing new.** `TagScreen` is shared with merchant and refund-point users, who have no verifications. `isStaff = isMerchant || isRefundPoint` already exists at `TagScreen.tsx:49`.
- **There is almost no pure logic in this feature.** The tab is a two-value state and the status chip is a lookup. **Do not write unit tests that assert against a `useState`, and do not mock React Native components to manufacture coverage** — that is worse than no test. The gate is `tsc` + `eslint` + the existing suite staying green.
- **Jest baseline drifts** because the other session's in-progress tests live in the same tree (446 → 462 → 467 → 472 over recent runs). Seven suites fail at collection for pre-existing reasons and are **not** your business. The rule is: **no new failures, and the test count must not drop.** Record what you see before you start.

**Task order:** 1 → 2 → 3. Task 3 depends on both.

---

### Task 1: The tab bar

**Files:**
- Create: `src/screens/shared/Tags/Tag/_components/TagsTabBar.tsx`
- Modify: `src/localization/resources/en-US.json`, `src/localization/resources/tr-TR.json`

**Interfaces:**
- Consumes: `useLocalization` from `@/providers/LocalizationProvider`; `cn` from `@/utils/cn`.
- Produces: `type TagsTab = "tags" | "verifications"` and `<TagsTabBar active onChange />`. Task 3 consumes both.

This component renders nowhere yet — that is expected and correct.

- [ ] **Step 1: Record the Jest baseline**

```bash
cd c:/unirefund/super-app
npx jest --silent 2>&1 | tail -6
git status --short
```

Write both into your report. The `git status` matters: everything it lists that is not yours belongs to the other session and must stay unstaged.

- [ ] **Step 2: Add the two tab labels**

The `Tags` block already exists in both resource files (it holds `Title`, `SortNewest`, `Filters`, `SearchPlaceholder`, `NoTags` and others). Add a nested `Tabs` object inside it.

`en-US.json`:

```json
    "Tabs": {
      "Tags": "Tags",
      "Verifications": "Verifications"
    }
```

`tr-TR.json`:

```json
    "Tabs": {
      "Tags": "Etiketler",
      "Verifications": "Doğrulamalar"
    }
```

Read as `t("MobileApp.Tags.Tabs.Tags")`. **Nested, not `"Tabs.Tags"` as a flat key** — see the Global Constraints.

- [ ] **Step 3: Regenerate the bundle**

```bash
cd c:/unirefund/super-app
npm run init
```

Expected: exits 0. Until this runs, `tsc` rejects the new keys.

- [ ] **Step 4: Write the component**

Create `src/screens/shared/Tags/Tag/_components/TagsTabBar.tsx`:

```tsx
import { useLocalization } from "@/providers/LocalizationProvider";
import { cn } from "@/utils/cn";
import { Pressable, Text, View } from "react-native";

export type TagsTab = "tags" | "verifications";

export function TagsTabBar({
  active,
  onChange,
}: {
  active: TagsTab;
  onChange: (tab: TagsTab) => void;
}) {
  const { t } = useLocalization();
  const tabs: { key: TagsTab; label: string }[] = [
    { key: "tags", label: t("MobileApp.Tags.Tabs.Tags") },
    { key: "verifications", label: t("MobileApp.Tags.Tabs.Verifications") },
  ];

  return (
    <View className="flex-row rounded-xl bg-card p-1">
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            className={cn(
              "flex-1 items-center rounded-lg py-2",
              isActive && "bg-primary/10",
            )}
            key={tab.key}
            onPress={() => onChange(tab.key)}
          >
            <Text
              className={cn(
                "text-sm font-semibold",
                isActive ? "text-primary" : "text-muted",
              )}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
```

`accessibilityRole="tab"` with `accessibilityState.selected` is what makes a screen reader announce this as tabs rather than two buttons — the spec calls that out as something to check on a device.

- [ ] **Step 5: Verify**

```bash
cd c:/unirefund/super-app
npx tsc --noEmit
npx eslint src/screens/shared/Tags
```

Expected: both clean. A missing-key type error means Step 3 was skipped.

- [ ] **Step 6: Commit**

```bash
cd c:/unirefund/super-app
git add src/screens/shared/Tags/Tag/_components/TagsTabBar.tsx src/localization/resources/en-US.json src/localization/resources/tr-TR.json
git commit -m "feat(tags): add the tags/verifications tab bar"
```

Before committing, run `git diff --cached --name-only` and confirm it lists exactly those three files. The i18n files carry the other session's uncommitted `SessionExpired` key — if it appears in `git diff --cached`, stop and report rather than committing it.

---

### Task 2: Show every verification status

**Files:**
- Create: `src/screens/shared/Tags/Tag/_components/VerificationList.tsx`
- Delete: `src/screens/shared/Tags/Tag/_components/PendingVerifications.tsx`
- Modify: `src/screens/shared/Tags/Tag/TagScreen.tsx` (the import and the one usage)
- Modify: `src/localization/resources/en-US.json`, `src/localization/resources/tr-TR.json`

**Interfaces:**
- Consumes: `UniRefund_TagService_Stickers_MyStickerManualVerificationListDto` from `@/saas/TagService`.
- Produces: `<VerificationList items />`. Task 3 renders it as a tab body.

**Why the rename:** "Pending" stops being true the moment `Completed` rows appear. The empty state comes in Task 3, where it belongs — as a section this component may legitimately render nothing, and an empty state inside a `ListHeaderComponent` would announce "no verifications" above a list of tags.

- [ ] **Step 1: Add the two new keys**

Inside the existing `Verification` block in both files. `en-US.json` — add `Completed` to the existing nested `Status` object, and `TagCreated` alongside `SectionTitle`:

```json
      "Completed": "Approved"
```

```json
    "TagCreated": "A tag was created from this pair.",
```

`tr-TR.json`:

```json
      "Completed": "Onaylandı"
```

```json
    "TagCreated": "Bu fotoğraf çiftinden bir etiket oluşturuldu.",
```

Two keys, not one: the chip says what happened to the **verification**, and the line says that something now **exists** because of it.

Then:

```bash
cd c:/unirefund/super-app
npm run init
```

- [ ] **Step 2: Write the renamed component**

Create `src/screens/shared/Tags/Tag/_components/VerificationList.tsx`. This is the current `PendingVerifications.tsx` with three changes: the name, a third status, and the filter removed.

```tsx
import { useLocalization } from "@/providers/LocalizationProvider";
import type { UniRefund_TagService_Stickers_MyStickerManualVerificationListDto } from "@/saas/TagService";
import { cn } from "@/utils/cn";
import { Text, View } from "react-native";

type Item = UniRefund_TagService_Stickers_MyStickerManualVerificationListDto;
type VerificationStatus = "Created" | "Invalid" | "Completed";

// Keyed by StickerManualVerificationStatus, not shared with TagCard's
// TagStatusType styles — a different enum with different members.
const STATUS_CHIP: Record<VerificationStatus, string> = {
  Created: "bg-warning-surface text-warning",
  Invalid: "bg-error-surface text-error",
  Completed: "bg-success-surface text-success",
};

const STATUS_KEY: Record<VerificationStatus, string> = {
  Created: "MobileApp.Verification.Status.Created",
  Invalid: "MobileApp.Verification.Status.Invalid",
  Completed: "MobileApp.Verification.Status.Completed",
};

export function VerificationList({ items }: { items: Item[] }) {
  const { t, formatDate } = useLocalization();

  if (items.length === 0) return null;

  return (
    <View className="gap-2">
      {items.map((item) => {
        const status = (item.status ?? "Created") as VerificationStatus;
        return (
          <View
            className="gap-1 rounded-2xl border border-border bg-card p-3"
            key={item.id}
          >
            <View className="flex-row items-center justify-between gap-3">
              <Text
                className="flex-1 font-medium text-foreground"
                numberOfLines={1}
              >
                {t("MobileApp.Verification.StickerLineNumber")}:{" "}
                {item.stickerLineNumber}
              </Text>
              <Text
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                  STATUS_CHIP[status],
                )}
              >
                {t(STATUS_KEY[status])}
              </Text>
            </View>
            <Text className="text-xs text-muted">
              {t("MobileApp.Verification.UploadedAt")}:{" "}
              {formatDate(item.creationTime ?? "")}
            </Text>
            {status === "Invalid" && item.invalidReason ? (
              <Text className="text-sm text-muted">
                {t("MobileApp.Verification.RejectionReason")}:{" "}
                {item.invalidReason}
              </Text>
            ) : null}
            {status === "Completed" ? (
              <Text className="text-sm text-muted">
                {t("MobileApp.Verification.TagCreated")}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
```

Two things to verify rather than assume:

- **`t`'s parameter is typed `TranslationKey`, not `string`.** The `STATUS_KEY` record above may therefore not type-check as written. If `tsc` rejects it, type the record's value as that same key type (import it if it is exported) or inline a ternary on `status` instead of the lookup. **Do not cast to `any` and do not widen `t`'s signature.**
- **`bg-success-surface` / `text-success`** — confirm both exist in `tailwind.config.js`. The other two chips use `warning-surface`/`warning` and `error-surface`/`error`, so the pair almost certainly exists, but check. If there is no success token, use the nearest existing semantic pair and say which; do not hardcode a hex.

Note the section title moved out: the tab label now names the content, so a heading saying "Pending verifications" above it would be redundant. `Verification.SectionTitle` becomes unused — **leave the key in place**, Task 3 does not need it and pruning it is out of scope.

- [ ] **Step 3: Delete the old file and update the one usage**

Delete `src/screens/shared/Tags/Tag/_components/PendingVerifications.tsx` with the Write/delete tooling, not a shell `mv`.

In `TagScreen.tsx`, change the import to `VerificationList` and the single usage inside `ListHeaderComponent` (around `:229`) from `<PendingVerifications items={pendingVerifications} />` to `<VerificationList items={pendingVerifications} />`.

This leaves the screen in a deliberate intermediate state: the block above the tag list now also shows `Completed` rows. That is transient and correct — Task 3 moves it to its own tab.

- [ ] **Step 4: Verify**

```bash
cd c:/unirefund/super-app
npx tsc --noEmit
npx eslint src/screens/shared/Tags
grep -rn "PendingVerifications" src/ || echo "no stale references"
npx jest --silent 2>&1 | tail -6
```

Expected: tsc and eslint clean, no stale references, and the suite with no new failures and no drop in test count versus your Task 1 baseline.

- [ ] **Step 5: Commit**

```bash
cd c:/unirefund/super-app
git add src/screens/shared/Tags/Tag/_components/VerificationList.tsx src/screens/shared/Tags/Tag/_components/PendingVerifications.tsx src/screens/shared/Tags/Tag/TagScreen.tsx src/localization/resources/en-US.json src/localization/resources/tr-TR.json
git commit -m "feat(tags): show completed verifications alongside pending ones"
```

Confirm with `git diff --cached --name-only` that the deletion is staged and that nothing of the other session's is.

---

### Task 3: Wire the tabs into the screen

**Files:**
- Modify: `src/screens/shared/Tags/Tag/TagScreen.tsx`
- Modify: `src/screens/shared/Tags/Tag/_components/TagListHeader.tsx`
- Modify: `src/screens/shared/Tags/Tag/_components/VerificationList.tsx` (empty state)
- Modify: `src/localization/resources/en-US.json`, `src/localization/resources/tr-TR.json`

**Interfaces:**
- Consumes: `TagsTabBar` and `TagsTab` (Task 1); `VerificationList` (Task 2); the existing `usePendingVerifications` hook's `{ items, reload }`.
- Produces: nothing downstream.

- [ ] **Step 1: Add the empty-state keys**

Inside the existing `Verification` block in both files:

```json
    "Empty": {
      "Title": "No verifications yet",
      "Description": "If a shop gave you a paper tax-free form, photograph it here and we'll create your tag."
    },
```

Turkish:

```json
    "Empty": {
      "Title": "Henüz doğrulama yok",
      "Description": "Bir mağaza size kağıt tax-free form verdiyse, buradan fotoğrafını çekin, etiketinizi biz oluşturalım."
    },
```

Then `npm run init`.

- [ ] **Step 2: Give `VerificationList` its empty state**

Replace `if (items.length === 0) return null;` in `VerificationList.tsx` with an empty state, following the shape of `TagsEmptyState` in `src/screens/shared/_components/TagStates.tsx:80-99` — read that first and match it, including its dashed-border card treatment:

```tsx
  if (items.length === 0) {
    return (
      <View className="w-full flex-1 min-h-52 items-center justify-center rounded-3xl border-2 border-dashed border-gray-300 bg-gray-50 px-6">
        <View className="items-center gap-3">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-gray-200">
            <Ionicons name="camera-outline" size={32} color="#9ca3af" />
          </View>
          <View className="items-center gap-1">
            <Text className="text-lg font-semibold text-gray-700">
              {t("MobileApp.Verification.Empty.Title")}
            </Text>
            <Text className="text-center text-sm text-gray-500">
              {t("MobileApp.Verification.Empty.Description")}
            </Text>
          </View>
        </View>
      </View>
    );
  }
```

Add `import { Ionicons } from "@/components/Ionicons";`. The greys and the `#9ca3af` are copied deliberately from `TagsEmptyState` so the two empty states match; that file predates the semantic tokens and consistency between the two beats purity here. Say so in your report rather than silently diverging.

- [ ] **Step 3: Let `TagListHeader` hide its tag-specific controls**

Add one optional prop, defaulting to showing everything so no other caller changes:

```tsx
  /** Hidden on the Verifications tab: they search, sort and filter tags. */
  showTagControls?: boolean;
```

Default it in the destructure (`showTagControls = true`) and wrap two regions in it: the sort/filter row, and the search box. **Leave the Upload button outside the condition** — it belongs to both tabs.

The existing `searchEnabled` prop stays as it is; the search box renders when `showTagControls && searchEnabled`.

- [ ] **Step 4: Wire the screen**

In `TagScreen.tsx`:

Add the state beside the existing `useState` calls (~`:60`):

```tsx
  const [activeTab, setActiveTab] = useState<TagsTab>("tags");
```

Pass the new prop to the header and render the tab bar under it. Replace the `header` block (~`:200-212`) so it becomes:

```tsx
  const header = (
    <View className="gap-3 pb-3">
      <TagListHeader
        search={searchInput}
        onSearchChange={setSearchInput}
        sort={query.sort}
        onToggleSort={toggleSort}
        activeFilterCount={activeFilterCount}
        onOpenFilters={() => filterSheetRef.current?.present()}
        isFetching={isFetching && !refreshing}
        searchEnabled
        showTagControls={activeTab === "tags"}
        onUpload={canUpload ? () => uploadSheetRef.current?.present() : undefined}
      />
      {!isStaff && <TagsTabBar active={activeTab} onChange={setActiveTab} />}
    </View>
  );
```

`!isStaff` is the whole tab feature's gate — staff get no tab bar and therefore never leave the tags list.

Then make the body switch. Remove `ListHeaderComponent` from the `FlashList` entirely (the verifications no longer live there) and add the verifications branch at the top of `body()`:

```tsx
  const body = () => {
    if (!isStaff && activeTab === "verifications") {
      return (
        <ScrollView
          contentContainerClassName="pb-4"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefreshVerifications}
              tintColor="#db0000"
              colors={["#db0000"]}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <VerificationList items={pendingVerifications} />
        </ScrollView>
      );
    }
    if (isLoading) return <TagListSkeleton />;
    // ... the rest unchanged
```

Add `ScrollView` to the `react-native` import.

`contentContainerClassName` is a NativeWind convenience for `contentContainerStyle`. **Confirm this version supports it** — grep the repo for an existing use (`grep -rn "contentContainerClassName" src/`). If nothing uses it, fall back to `contentContainerStyle={{ paddingBottom: 16 }}` rather than introducing an untested prop, and say which you used.

Add the verifications refresh handler beside the existing `onRefresh`:

```tsx
  const onRefreshVerifications = useCallback(async () => {
    setRefreshing(true);
    await reloadPending();
    setRefreshing(false);
  }, [reloadPending]);
```

Match the existing `onRefresh`'s shape — read it first; if it is not a `useCallback`, mirror whatever it is rather than introducing a second idiom.

**Do not touch the `useFocusEffect`.** It already reloads both datasets on focus, so switching tabs needs no refetch and no second effect.

- [ ] **Step 5: Verify**

```bash
cd c:/unirefund/super-app
npx tsc --noEmit
npx eslint src/screens/shared/Tags
npx jest --silent 2>&1 | tail -6
```

Expected: tsc and eslint clean; no new test failures and no drop in count versus your Task 1 baseline.

Then read `TagScreen.tsx` end to end and confirm by eye:
- a staff user reaches no tab bar and no verifications branch;
- the `FlashList` no longer has a `ListHeaderComponent`;
- `Upload` renders on both tabs, search/sort/filter only on Tags.

- [ ] **Step 6: Commit**

```bash
cd c:/unirefund/super-app
git add src/screens/shared/Tags/Tag/TagScreen.tsx src/screens/shared/Tags/Tag/_components/TagListHeader.tsx src/screens/shared/Tags/Tag/_components/VerificationList.tsx src/localization/resources/en-US.json src/localization/resources/tr-TR.json
git commit -m "feat(tags): split the screen into tags and verifications tabs"
```

Confirm with `git diff --cached --name-only` that nothing of the other session's is staged.

---

## Final verification

```bash
cd c:/unirefund/super-app
npx tsc --noEmit
npx eslint src
npx jest --silent 2>&1 | tail -6
node -e "const o=require('./src/localization/resources/en-US.json'); const t=require('./src/localization/resources/tr-TR.json'); const walk=(x,p='')=>Object.entries(x).flatMap(([k,v])=>k.includes('.')?[p+k]:typeof v==='object'?walk(v,p+k+'.'):[]); console.log('dotted keys en:', walk(o)); console.log('dotted keys tr:', walk(t));"
```

That last command is the guard against this project's most repeated mistake: it prints any key containing a dot, which `getNestedValue` can never resolve. **Both lists must be empty.**

## What needs a device

Nothing here can be seen without a phone, and the device is what caught the last UI defect three rounds of review had waved through.

1. **The tab bar reads as tabs**, not as two buttons — and switching does not flash or re-mount the list.
2. **The Verifications tab's empty state** appears for a traveller with no uploads, and matches the Tags tab's empty state in weight.
3. **A `Completed` row** shows the approved chip and the "a tag was created" line, and the same tag appears on the Tags tab.
4. **Pull-to-refresh on the Verifications tab** actually refetches.
5. **A staff account** (merchant or refund point) sees no tab bar at all and the tags list exactly as before.
6. Search, sort and filter are absent on Verifications; **Upload is present on both**.

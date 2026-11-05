# Tag screens: country filter, keyboard dismissal, Show on map — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A traveller can narrow their tag list by issuing country, and sees that country on every row, in super-app and ssr. The tags tab's keyboard dismisses the way people expect it to. Tag detail's Store section opens the store in the platform maps app.

**Architecture:**
- **Filtering** is server-side through `TenantIds`. Both apps also drop rows whose `tenantId` was not picked, so a backend without UNI-1866 cannot show a wrong-country tag.
- **The country options** come from one unpaged fetch of the traveller's own tags. The list never waits for that fetch.
- **The maps link** is built by a pure helper from staff coordinates, or from the traveller's address string.

**Tech Stack:** Expo 54 / RN 0.81 / zustand / jest (super-app); Next 16 / React 19 / Node test runner (ssr).

**Spec:** `docs/superpowers/specs/2026-11-05-traveller-tag-country-filter-design.md`

## Global Constraints

- **Worktrees only.** Use `C:\unirefund\super-app-wt-tags` and `C:\unirefund\web-app-wt-tags`, on branch `feat/traveller-tag-country-filter` in each. Never touch `C:\unirefund\super-app` or `C:\unirefund\web-app`. Never stash, reset or switch branches there.
- **Leave Home alone.** Do not edit `super-app/src/screens/traveller/Home/**`; another session is changing it.
- **Request parameter:** `tenantIds: string[]`, sent only when non-empty, only on the traveller cross-tenant list.
- **URL parameter (ssr):** repeated `country=<guid>`.
- **i18n (super-app),** `src/localization/resources/{en-US,tr-TR}.json`:
  - `Tags.Country` = "Country" / "Ülke"
  - `TagDetail.ShowOnMap` = "Show on map" / "Haritada göster"
- **i18n (ssr),** `apps/ssr/src/language-data/unirefund/SSRService/resources/{en,tr}.json`:
  - `Tags.CountryFilter` = "Country" / "Ülke"
  - `TagDetail.ShowOnMap` = "Show on map" / "Haritada göster"
- **Row label:** `merchant · country`. Omit the country when `tenantName` is blank, and omit the merchant when it is blank.
- **Map search text:** the address only, never the store name. "Apple HQ" would pull the search toward Cupertino.
- **super-app jest:** new render tests are named `*.router.test.tsx`. A new test file imports files that only this branch has through relative paths, never `@/` (memory `super-app-verification-constraints`).
- **ssr lint:** no `setState` in an effect, and a `data-testid` on every required component (`.claude/rules/data-testid.md`).
- **Commits** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.

## Review Focus

1. **Stale `country` URL param on ssr** (a GUID the traveller has no tags in). The filter still applies and the list shows the no-match state. Clear all returns the full list. → Task 7 test `parse keeps a well-formed unknown GUID`, plus the Task 8 walkthrough.
2. **A malformed `country` value** (`country=abc`, `country=`). It is dropped before the request; it must never reach the API, which answers 400. → Task 7 tests.
3. **Old backend ignores `TenantIds`.** Rows of other countries never show. → `keepSelectedTenants` tests (Tasks 1 and 7) and its use in the list (Tasks 2 and 8).
4. **Traveller DTO with a blank or whitespace-only address, or staff without coordinates.** No button is drawn. → Task 4 tests.
5. **Tapping a row while the keyboard is up.** The first tap opens the tag, and the keyboard is gone on the detail. → Task 3 test, plus device QA in Task 5.

---

## super-app

### Task 1: SDK regen, `tenantIds` in the query, the guard and the country list helper

**Files:**
- Regenerate: `src/saas/TagService/**` (generated)
- Create: `src/utils/travellerCountries.ts`, `src/utils/__tests__/travellerCountries.test.ts`
- Modify: `src/store/tag.ts` (`TagQuery`, `EMPTY_TAG_QUERY`, `TAG_QUERY_LIST_FIELDS`)
- Modify: `src/hooks/useLoadTags.tsx` (export `queryToParams`; traveller branch sends `tenantIds`)
- Create: `src/hooks/__tests__/queryToParams.test.ts`
- Modify: `src/screens/shared/Tags/Tag/_components/travellerFilters.ts` and its `__tests__/travellerFilters.test.ts`

**Interfaces:**
- Produces (all of the helpers below live in `src/utils/travellerCountries.ts`):
  - `type TravellerCountry = { id: string; name: string }`
  - `travellerCountries(tags: ReadonlyArray<{ tenantId?: string | null; tenantName?: string | null }>): TravellerCountry[]`, deduplicated by id, blank names dropped, sorted with `localeCompare`.
  - `keepSelectedTenants<T extends { tenantId?: string | null }>(tags: T[], tenantIds: readonly string[]): T[]`, which returns `tags` unchanged when `tenantIds` is empty and compares ids case-insensitively.
  - `tenantNameOf(tag: TagListItem): string | null`, which reads `tenantName` only off the traveller DTO.
  - `TagQuery.tenantIds: string[]`.
  - The exported `queryToParams(query, scope, skipCount?, isCustoms?)`.

- [ ] **Step 1: Set up and take the baseline.** In the worktree, run `npm run init`, then confirm `ls src/data/language-data/` lists `en-US.gen.json` and `tr-TR.gen.json`. Run `npm run typecheck`: expect only `tabBackNavigation.router.test.tsx:119`. Run `npx jest --listTests | head -3`: expect paths. Run `npm test`: record the suite and test totals, 0 failures expected.
- [ ] **Step 2: Regenerate.** Run `npm run gen -f TagService`, then `git diff --stat src/saas`. Confirm `GetApiTagServiceTagCrossTenantsByTravellerIdClaimData` has `tenantIds?: Array<(string)>` and `sdk.gen.ts` maps it to `TenantIds`. Run `npm run typecheck`: still only the baseline error. Note any other contract changes for the PR body.
- [ ] **Step 3: Write the failing tests.**
  - `travellerCountries.test.ts`:
    - three rows over two tenants, one name blank → `[{id:"b",name:"Faroe Islands"},{id:"a",name:"Türkiye"}]`;
    - an empty input → `[]`;
    - `keepSelectedTenants(rows, [])` returns the same array;
    - `keepSelectedTenants(rows, ["A"])` keeps a row with `tenantId: "a"` and drops `"b"` and `null`.
  - `queryToParams.test.ts`:
    - traveller scope with `tenantIds: ["x"]` → `params.tenantIds` equals `["x"]`;
    - traveller with `[]` → no `tenantIds` key;
    - staff with `["x"]` → no `tenantIds` key.
  - `travellerFilters.test.ts`: `tenantIds: ["x"]` counts 1, and adds 1 on top of a date range.
- [ ] **Step 4: Run them.** `npx jest travellerCountries queryToParams travellerFilters`. Expect FAIL: the module is missing, `queryToParams` is not exported, and the count is 0.
- [ ] **Step 5: Implement.** Add `tenantIds: []` to `EMPTY_TAG_QUERY` and `"tenantIds"` to `TAG_QUERY_LIST_FIELDS`. In the traveller branch, add `...list("tenantIds", query.tenantIds)`. Write the helpers. `countTravellerFilters` adds `query.tenantIds.length > 0 ? 1 : 0`.
- [ ] **Step 6: Run again.** Run the same jest command; expect PASS. Run `npm run typecheck`: expect the baseline only. Any fixture building a full `TagQuery` literal now needs `tenantIds`, and tsc will name it.
- [ ] **Step 7: Commit.** `feat(tags): send the traveller's country filter as TenantIds`. Stage the regen in the same commit.

### Task 2: Country chips in the traveller filter sheet, the guard on the list, the country on rows

**Files:**
- Create: `src/screens/shared/Tags/Tag/_components/useTravellerCountries.ts`
- Modify: `src/screens/shared/Tags/Tag/_components/TagFilterSheet.tsx`
- Modify: `src/screens/shared/Tags/Tag/TagScreen.tsx`
- Modify: `src/localization/resources/en-US.json`, `tr-TR.json` (`Tags.Country`)
- Create: `src/screens/shared/Tags/Tag/_components/__tests__/TagFilterSheetCountry.router.test.tsx`
- Create: `src/screens/shared/Tags/Tag/__tests__/TagScreenCountry.router.test.tsx`

**Interfaces:**
- Consumes (Task 1): `travellerCountries`, `keepSelectedTenants`, `tenantNameOf`, `TagQuery.tenantIds`.
- Produces:
  - `useTravellerCountries(enabled: boolean): TravellerCountry[]`, which returns `[]` while loading, on error, or when disabled, and refetches on screen focus.
  - A new `TagFilterSheet` prop, `countries?: TravellerCountry[]`.

- [ ] **Step 1: Write the failing sheet test** (copy the provider/mocks recipe from an existing `TagScreen*.router.test.tsx`).
  - With `travellerScope` and 2 countries, `MobileApp.Tags.Country` renders.
  - Pressing the `Faroe Islands` chip, then `MobileApp.Tags.ApplyFilters`, calls `onApply` with `tenantIds: ["fo"]`.
  - With 1 country, `MobileApp.Tags.Country` is absent.
  - Without `travellerScope`, it is absent too.
  - `MobileApp.Tags.ClearFilters`, then Apply, sends `tenantIds: []`.
- [ ] **Step 2: Write the failing screen test.** Use the traveller role with two loaded tags, `{merchantTitle:"Apple HQ", tenantName:"Faroe Islands", tenantId:"fo"}` and `{merchantTitle:"Shop", tenantName:"Türkiye", tenantId:"tr"}`, and mock `getTags`.
  - The text `Apple HQ · Faroe Islands` renders.
  - With `query.tenantIds = ["fo"]` in the store, `Shop · Türkiye` does NOT render (the guard).
- [ ] **Step 3: Run them.** `npx jest TagFilterSheetCountry TagScreenCountry`. Expect FAIL.
- [ ] **Step 4: Implement.**
  - The sheet adds a `RailSection` titled `t("MobileApp.Tags.Country")` holding a `RailChips` over `countries` when `travellerScope && countries.length >= 2`. `clear` resets `tenantIds`.
  - `TagScreen`:
    - calls `useTravellerCountries(!isStaff)` and passes `countries`;
    - `visibleTags` runs `keepSelectedTenants(…, query.tenantIds)` for travellers before the search;
    - the traveller `secondary` is `[item.merchantTitle, tenantNameOf(item)].filter(Boolean).join(" · ")`, for both `TagRow` and `TagCard`.
  - The hook uses `getTags({ maxResultCount: TAG_UNPAGED_MAX, sorting: "issueDate desc" })` with `useFocusEffect`. No `useEffect` plus `setState` derivation (`.claude/rules/avoid-use-effect.md`); `useAsyncFetch` is fine.
  - Add the i18n keys, then run `npm run init`.
- [ ] **Step 5: Run again.** The same jest command, plus `npx jest src/screens/shared/Tags`; expect PASS. Run `npm run typecheck`: baseline only.
- [ ] **Step 6: Commit.** `feat(tags): filter a traveller's tags by country and show it on each row`.

### Task 3: Keyboard dismissal on the tags tab

**Files:**
- Modify: `src/screens/shared/Tags/Tag/TagScreen.tsx`. The header gets a dismiss target. `keyboardDismissMode="on-drag"` goes on the FlashList, the customs `ScrollView` and the verifications `ScrollView`. `onSelect` calls `Keyboard.dismiss()` before navigating.
- Modify: `src/screens/shared/Tags/Tag/landscape/_components/TagFilterRail.tsx` (`ScrollView`) and `TagTable.tsx` (the vertical `FlashList`): add `keyboardDismissMode="on-drag"` and `keyboardShouldPersistTaps="handled"`.
- Create: `src/screens/shared/Tags/Tag/__tests__/TagScreenKeyboard.router.test.tsx`

**Interfaces:** none new.

- [ ] **Step 1: Write the failing test** (traveller role, two tags).
  - The FlashList (find it by `UNSAFE_getByType(FlashList)`, or assert over `toJSON()` by prop) has `keyboardDismissMode === "on-drag"` and `keyboardShouldPersistTaps === "handled"`.
  - Pressing a row calls `Keyboard.dismiss` (spy with `jest.spyOn(Keyboard, "dismiss")`) and `router.push` once each.
  - Pressing the element with testID `tags-header-dismiss` calls `Keyboard.dismiss`.
- [ ] **Step 2: Run it.** `npx jest TagScreenKeyboard`. Expect FAIL.
- [ ] **Step 3: Implement.** Wrap the header `View` in `Pressable` with `testID="tags-header-dismiss"`, `onPress={Keyboard.dismiss}`, `accessible={false}`. Its children's own presses still win. Add the props listed under Files.
- [ ] **Step 4: Run again.** `npx jest TagScreenKeyboard` plus `npx jest src/screens/shared/Tags`; expect PASS.
- [ ] **Step 5: Commit.** `fix(tags): let the tags tab's keyboard close on tap-out, scroll and row tap`.

Android back is verified on the device in Task 5, not here: the jest `BackHandler` mock is unfaithful.

### Task 4: Show on map in the Store block

**Files:**
- Create: `src/utils/storeMap.ts`, `src/utils/__tests__/storeMap.test.ts`
- Modify: `src/screens/shared/Tags/TagDetail/_components/TagDetailBlocks.tsx` (`StoreBlock`)
- Modify: `src/localization/resources/en-US.json`, `tr-TR.json` (`TagDetail.ShowOnMap`)
- Create: `src/screens/shared/Tags/TagDetail/__tests__/StoreBlockMap.router.test.tsx`

**Interfaces:**
- Produces:
  - `type StoreLocation = { kind: "coords"; latitude: number; longitude: number; placeId?: string | null } | { kind: "address"; query: string }`
  - `storeLocationOf(data: TagDetailData): StoreLocation | null`. Staff (via `staffTagOf`): coords when both are finite numbers, else `null`. Traveller: the trimmed `merchant.address`, or `null` when blank.
  - `storeMapUrl(location: StoreLocation, os: string): string`:

| `os` | coords | address |
| --- | --- | --- |
| `"ios"` | `https://maps.apple.com/?ll={lat},{lng}&q={lat},{lng}` | `https://maps.apple.com/?q={enc(query)}` |
| anything else | `https://www.google.com/maps/search/?api=1&query={lat},{lng}`, plus `&query_place_id={enc(placeId)}` when a place id is present | `https://www.google.com/maps/search/?api=1&query={enc(query)}` |

- [ ] **Step 1: Write the failing tests.**
  - `storeMap.test.ts`:
    - each of the 4 URL cases, using the Faroe sample: 62.070793, -7.326684, `ChIJF1DaLQCbvkgR7zQET3BbDDo`, and the address "3 í Bygdini, Sørvágur 380, Sørvágur, Vága sýsla, Faroe Islands" (assert it is `encodeURIComponent`-encoded);
    - `storeLocationOf` → `null` for staff with `latitude: null`;
    - `null` for a traveller address `"  "`;
    - coords for staff even when `addressLine` is set.
  - `StoreBlockMap.router.test.tsx`:
    - staff with coords → testID `tag-store-show-on-map` is present, and a press calls `Linking.openURL` with the Google URL (`Platform.OS` is `android` under jest-expo/android);
    - staff without coords → absent;
    - traveller with an address → present;
    - when `openURL` rejects, nothing throws.
- [ ] **Step 2: Run them.** `npx jest storeMap StoreBlockMap`. Expect FAIL.
- [ ] **Step 3: Implement.** Inside the `CollapsibleBlock`, after the Address field, add a `Button` with `variant="outline"`, `size="sm"`, `iconName="map-outline"`, `testID="tag-store-show-on-map"`, and the label `t("MobileApp.TagDetail.ShowOnMap")`. Its press runs `Linking.openURL(storeMapUrl(loc, Platform.OS)).catch(logger…)`. Render the button only when `storeLocationOf` is non-null. Add the keys, then run `npm run init`.
- [ ] **Step 4: Run again.** The same jest command, plus `npx jest src/screens/shared/Tags/TagDetail src/screens/shared/__tests__`; expect PASS. `TagPreviewScreen` shares `StoreBlock`, so its suites must stay green.
- [ ] **Step 5: Commit.** `feat(tag-detail): open the store in the maps app`.

### Task 5: super-app gates and device QA

- [ ] **Step 1: Run the gates.** `npm run typecheck` → only the baseline error. `npm test` → 0 failures, with more suites and tests than the Task 1 baseline. `npx eslint src` → 0 errors.
- [ ] **Step 2: Check the device before touching it.** `adb devices -l`, `adb -s LD38266200649 reverse --list`, the foreground activity, and `flags=[` (DEBUGGABLE was seen 2026-11-05). If another session is driving it, stop and report.
- [ ] **Step 3: Serve this worktree.** Copy `dev-superapp-devices.ps1` to the scratchpad, repoint `$AppDir` at `C:\unirefund\super-app-wt-tags`, and run it with `-Serial LD38266200649 -Port 8123` (memory `expo-worktree-needs-real-node-modules`).
- [ ] **Step 4: Test as traveller `tur-a25y29041`.** Tags tab:
  - focus the search, then tap the header blank area → the keyboard closes;
  - focus, then drag the list → it closes;
  - focus, then `adb -s LD38266200649 shell input keyevent KEYCODE_BACK` → it closes and the screen stays;
  - focus, then tap a row → the detail opens on the first tap, with no keyboard;
  - every row reads `Apple HQ · Faroe Islands`;
  - the Filters sheet has no Country section (one country).

  Then open a tag → Store → Show on map → the Google Maps app or browser opens at Sørvágur. Take each screenshot ≥2 s after the tap, and a second shot before reporting any style issue.
- [ ] **Step 5: Test as staff (`siggi.customs`, Faroe Islands), if time and the device allow.** Store → Show on map → the exact pin. Open the filter drawer, focus a rail input, then back → only the keyboard closes. If the drawer closes instead, change `TagFilterDrawer`'s handler to `if (Keyboard.isVisible()) { Keyboard.dismiss(); return true; }` before `onClose()`, and re-test.
- [ ] **Step 6: Commit** any device-driven fix. Afterwards, restore the device: drop only the `8123` reverse map you added.

## ssr (`C:\unirefund\web-app-wt-tags`)

### Task 6: Setup, baseline, TagService regen

- [ ] **Step 1: Confirm the setup.** `pnpm install` has finished. `apps/ssr/.env` and `packages/utils/policies/policies.json` were copied. `git status --short` is clean (submodules included).
- [ ] **Step 2: Initialise and take the baseline.** Run `pnpm --filter ssr run init` and confirm `apps/ssr/src/language-data/i18n/*.gen.json` exist. Start `pnpm --filter ssr dev` once until it prints Ready, then stop it; that creates `next-env.d.ts`. Then take the baseline:
  - `pnpm --filter ssr type-check` → clean;
  - `pnpm --filter ssr lint` → 0 errors;
  - `pnpm --filter ssr test:unit` → record the total, 0 failures.
- [ ] **Step 3: Regenerate.** `cd packages/saas && node index.mjs -u "https://dev-api.unirefund.com" -f TagService && npx prettier --write "TagService/**/*.ts" "core/*.ts" --trailing-comma es5`. Check `git diff --stat packages/saas`: only `TagService/{sdk,types,schemas}.gen.ts` should move, and `GetApiTagServiceTagCrossTenantsByTravellerIdClaimData` has `tenantIds`. Then run `pnpm --filter web type-check` (expect the 2 baseline TS2307 errors) and `pnpm --filter ssr type-check` (clean).
- [ ] **Step 4: Commit.** `chore(saas): regenerate TagService (TenantIds on the traveller tag list)`.

### Task 7: URL parameter, request, filter count, country helpers

**Files:**
- Modify: `apps/ssr/src/app/[lang]/(main)/tags/tag-list-params.ts` and `tag-list-params.test.ts`
- Modify: `apps/ssr/src/utils/tag/traveller-filters.ts` (and its test, if one exists; else create `traveller-filters.test.ts`)
- Create: `apps/ssr/src/utils/tag/traveller-countries.ts` and `traveller-countries.test.ts`
- Modify: `apps/ssr/src/app/[lang]/(main)/tags/_components/tag-list-nav.ts`

**Interfaces:**
- Produces:
  - `TagListParams.countries: string[]`, always present, possibly empty.
  - `tagListApiQuery` adds `tenantIds` when it is non-empty.
  - `countTravellerFilters(p: { issuedStartDate?; issuedEndDate?; countries?: string[] })`.
  - `travellerCountries(tags)` and `keepSelectedTenants(tags, ids)` with the same contract as super-app Task 1, plus `type TravellerCountry = { id: string; name: string }`.
  - `useTagListPush` now accepts `Record<string, string | string[] | undefined>`. An array deletes the key, then appends each value; an empty array just deletes it.

- [ ] **Step 1: Write the failing tests.**
  - Parse:
    - `country` given as a string → `["<guid>"]`;
    - given as two GUIDs → both, in order, deduplicated;
    - `abc` and `""` dropped;
    - a well-formed unknown GUID is kept;
    - no param → `[]`.
  - `tagListApiQuery`: `countries: [g]` → `tenantIds: [g]`; `[]` → no key.
  - `countTravellerFilters({countries:[g]})` → 1, and 2 together with a date range.
  - `traveller-countries`: the same cases as super-app Task 1.
- [ ] **Step 2: Run them.** `pnpm --filter ssr test:unit`. Expect FAIL.
- [ ] **Step 3: Implement.** The GUID check is `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`.
- [ ] **Step 4: Run again.** `pnpm --filter ssr test:unit` and `pnpm --filter ssr type-check`; expect PASS and clean.
- [ ] **Step 5: Commit.** `feat(ssr/tags): carry a country filter in the URL and send it as TenantIds`.

### Task 8: Country chips, the guard on the list, the country on rows

**Files:**
- Create: `apps/ssr/src/app/[lang]/(main)/tags/_components/traveller-countries-data.ts` (`"use server"` is not needed; it is a server-only module). It exports `getTravellerCountries(): Promise<TravellerCountry[]>`, which never rejects and returns `[]` on any error.
- Modify: `page.tsx` (start the promise without awaiting; add `params.countries.join(",")` to `listKey`; pass `countries` to `TagsView`), `tags-view.tsx`, `tag-list-toolbar.tsx`, `tag-filter-sheet.tsx`, `tag-list-body.tsx` (guard through `keepSelectedTenants` reading `country` from `useSearchParams().getAll("country")`; Clear also pushes `country: undefined`), `tag-list-data.tsx` (pass `countries` to `filterCount`).
- Modify: `apps/ssr/src/components/tags/tag-card.tsx` (`meta` gets `tag.tenantName` after `merchantTitle`) and `tag-row.tsx` (the merchant line reads `merchant · country`).
- Modify: SSRService `en.json`/`tr.json` (`Tags.CountryFilter`).

**Interfaces:**
- Consumes (Task 7): everything it produces.
- Produces: a `TagFilterSheet` taking new props `countries: Promise<TravellerCountry[]>`, `stagedCountries: string[]` and `onToggleCountry(id: string)`.

- [ ] **Step 1: Implement the sheet.** Inside it, a `<Suspense fallback={null}>` wraps a `CountryChips` component that calls `use(countries)`. It renders nothing below 2 countries; otherwise it renders `aria-pressed` chip buttons with `data-testid={\`tag-filter-country-${id}\`}` under the heading `t.SSRService["Tags.CountryFilter"]`, styled like the date chips.
- [ ] **Step 2: Implement the toolbar.** It keeps `stagedCountries` state, seeded from `useSearchParams().getAll("country")` when the sheet opens (in the open handler, not in an effect). `apply` pushes `{ country: stagedCountries, issuedStartDate…, issuedEndDate… }`. `clear` empties `stagedCountries` too.
- [ ] **Step 3: Add the i18n keys.** Run `pnpm --filter ssr run init` and `node scripts/find-missing-i18n.mjs --app=ssr` → clean.
- [ ] **Step 4: Run the gates.** `pnpm --filter ssr type-check` → clean. `pnpm --filter ssr lint` → 0 errors (fix any testid or compiler error rather than suppress it). `pnpm --filter ssr test:unit` → 0 failures.
- [ ] **Step 5: Walk it through.** Run local `pnpm --filter ssr dev` on a free port, signed in as `tur-a25y29041`:
  - `/en/tags` rows read `Apple HQ · Faroe Islands`;
  - the Filters sheet shows no Country group;
  - `/en/tags?country=172f8e7a-16e8-8a7e-36ac-3a1f82881a9b` shows the same 77 tags and a filter badge of 1;
  - `?country=00000000-0000-0000-0000-000000000001` shows the no-match state, and Clear all returns the full list;
  - `?country=abc` shows the full list and no badge;
  - the sheet is no wider than `max-w-3xl` at 1280 px.

  Stop the dev server afterwards.
- [ ] **Step 6: Commit.** `feat(ssr/tags): filter by country and show it on each tag row`.

### Task 9: Show on map on ssr's Store card

**Files:**
- Create: `apps/ssr/src/utils/tag/store-map.ts` (`storeMapHref(address?: string | null): string | null`, which returns the Google search URL from super-app Task 4 for a non-blank address, else `null`) and `store-map.test.ts`.
- Modify: `apps/ssr/src/components/tag-detail/tag-store-card.tsx`. Add an `<a href target="_blank" rel="noopener noreferrer" data-testid="tag-store-show-on-map">` styled as a small outline pill with an Ionicons map icon, labelled `t.SSRService["TagDetail.ShowOnMap"]`. It renders only when the href is non-null.
- Modify: SSRService `en.json`/`tr.json` (`TagDetail.ShowOnMap`).

- [ ] **Step 1: Write the failing test.** The Faroe address → the exact encoded URL. `"  "` → `null`. `undefined` → `null`.
- [ ] **Step 2: Run it.** `pnpm --filter ssr test:unit`. Expect FAIL.
- [ ] **Step 3: Implement.** Write the helper and the link, add the keys, then run `pnpm --filter ssr run init`.
- [ ] **Step 4: Run the gates.** `test:unit`, `type-check`, `lint` and `find-missing-i18n --app=ssr` must all match their baselines. Then walk through `/en/tags/FRO2026052200001` → Store → the link opens Google Maps at Sørvágur in a new tab, and the public `/en/tag/<slug>` shows the same link.
- [ ] **Step 5: Commit.** `feat(ssr/tag-detail): link the store to Google Maps`.

### Task 10: Report

- [ ] Write a report per repo: what changed, each gate with its numbers, and what is not verified. Not verified, at least: iOS; multi-country data; uat, which lacks UNI-1866, so only the guard applies there. Name the Jira key UNI-1871. Leave a short note in the shared notes folder. Ask the user before pushing or opening PRs.

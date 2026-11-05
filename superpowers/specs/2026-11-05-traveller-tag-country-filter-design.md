# Tag screens: country filter, keyboard dismissal, Show on map

Date: 2026-11-05. Backlog items #2, #5 and #10 of the super-app list.

| Repo | Worktree | Branch |
| --- | --- | --- |
| super-app | `C:\unirefund\super-app-wt-tags` | `feat/traveller-tag-country-filter` (from `origin/main` fe5d65a) |
| web-app (`apps/ssr`) | `C:\unirefund\web-app-wt-tags` | `feat/traveller-tag-country-filter` (from `origin/main` ee5c8c0a2) |

Other sessions are working in parallel on Home/payout cards/Wallet, the toast,
the traveller login and Novu. This work changes neither Home nor the toast.

## 1. Country filter (#2): super-app and ssr

**Why.** A traveller who shopped in several countries gets one list mixing all
of them. They should be able to narrow it to the countries they care about, and
see on each row which country issued the tag.

### Facts (probed on dev 2026-11-05 as `tur-a25y29041`)

- `GET /api/tag-service/tag/cross-tenants/by-traveller-id-claim` accepts
  **`TenantIds`** (`array<uuid>`). Dev's live swagger documents it as "Restricts
  the list to tags issued in these tenants (countries). When omitted or empty,
  tags from every tenant are returned." Probed:
  - the real Faroe id → 77 rows;
  - an unknown id → 0 rows;
  - the real id plus an unknown one → 77 rows (the ids are ORed);
  - `TenantIds=` or a non-GUID → 400 validation error.
- Neither app's generated SDK has the parameter yet. **Both need a TagService
  regen.** super-app: `npm run gen -f TagService`. web-app: `packages/saas`,
  `node index.mjs -u https://dev-api.unirefund.com -f TagService`, then the
  package's prettier pass (memory `web-app-sdk-codegen`). A regen can carry
  other contract changes the backend has made since the last one. Review the
  diff, and keep only the generated `TagService` files.
- The backend ticket was UNI-1866 (Done).
- **Only dev has it.** On 2026-11-05 uat's swagger listed the old parameters
  without `TenantIds`, and prod's swagger answered 503. ABP drops an unknown
  query parameter, so a backend without UNI-1866 would return every tag.
- Every row carries `tenantId` and `tenantName` (`"Faroe Islands"`).
- The test traveller has 77 tags, **all from the Faroe Islands**. No test
  account has tags from more than one country.

### Decided by the user

- Filtering is **server-side** through `TenantIds`. The countries are
  **multi-select chips** in the existing Filters sheet. Paging and issue-date
  order stay as they are.
- **Each row shows its country name.**
- **The country filter is hidden** when the traveller's tags all come from one
  country, or when they have no tags.
- Not chosen: section headers per country, and an unpaged list.
- **The client guards against an old backend; there is no merge hold**
  (user, 2026-11-05). A backend without UNI-1866 ignores `TenantIds`. So
  while a country filter is active, both apps also drop any row whose
  `tenantId` is not selected, and a wrong-country tag never appears. Until
  uat catches up, a page can hold fewer than 20 rows and the total counts
  every country. That is accepted; no extra UI explains it. Same approach as
  the recent-tags group's client re-check (UNI-1760).

### My calls (check these)

- **Where the options come from:** the traveller's own tags. Take the distinct
  `(tenantId, tenantName)` pairs from one unpaged fetch (`maxResultCount` 999,
  the same request super-app's Home already makes) and sort them by name with
  `localeCompare`. UNI-1866, the backend ticket that added `TenantIds`,
  suggests the anonymous `GET /api/saas/public-tenants` instead. On dev that
  list includes test tenants (`e2e-chain-crm-03-…`, `manual-customs-…`), and it
  would offer countries the traveller has no tags in. The hide rule needs the
  traveller's own countries anyway.
- **Every row shows its country, always**, as `merchant · country`. This is
  the user's choice taken literally. An earlier draft hid the label on
  one-country accounts, but the rows would then have to wait for the
  unpaged options fetch, and on ssr every page turn would cost that latency.
  So rows depend only on their own data. A row with no `tenantName` shows
  only the merchant.
- Chip text is `tenantName` as the backend sends it; tenant names are not
  translated anywhere. A pair with no `tenantName` is not offered as a chip.
- Empty selection means every country. The selection lights the filter badge,
  and every Clear path resets it: the sheet's Clear, the no-match state's
  Clear all, and super-app's `resetQuery`.
- If the options fetch fails, the country filter stays hidden. The list and
  its row labels are unaffected.

### super-app

- `TagQuery` gains `tenantIds: string[]`, listed in `TAG_QUERY_LIST_FIELDS`.
  That keeps `isTagQueryActive`, the badge and Clear consistent. The traveller
  branch of `queryToParams` sends `tenantIds` when it is non-empty. The staff
  branch never sends it.
- `countTravellerFilters` counts it.
- `TagFilterSheet` with `travellerScope`: add a "Country" `RailSection` with
  `RailChips`, fed by an `options` prop. It is not drawn below 2 options.
- The options come from a small hook under the Tags screen, built on
  `getTags` plus a pure `travellerCountries(tags)` helper. It refreshes on the
  same focus as the list, so a tag claimed from a new country shows up. Do
  **not** reuse or edit `screens/traveller/Home/useAllTravellerTags`: another
  session is changing Home.

### ssr (`apps/ssr`)

- `tag-list-params.ts`: the URL carries the selection as repeated `country=<guid>`
  params. `parseTagListParams` keeps only well-formed GUIDs, because the
  backend 400s on anything else. `tagListApiQuery` forwards them as
  `tenantIds`. They are part of the Suspense `listKey`, and
  `countTravellerFilters` counts them. Extend `tag-list-params.test.ts`.
- **The options fetch must not delay first paint** (memory
  `web-app-server-render-waterfall`). The toolbar renders outside the list's
  Suspense. For example, start the promise in `page.tsx` without awaiting it,
  hand it to the client toolbar, and resolve it inside the sheet. The list
  never waits for it. The exact mechanism is up to the builder.
- Filter sheet: add a country chip group, multi-select, staged and committed
  on Apply like the date presets. `DrawerContent` keeps
  `mx-auto w-full max-w-3xl md:border-x` (memory `ssr-sheets-match-page-width`).
- Rows: both `tag-card` and `tag-row` show the country as in super-app.
- `TagListBody`'s Clear also drops `country`.
- **SDK regen.** Regenerate TagService whole, in both repos. If it brings
  other contract changes, keep them only when type-check stays at baseline,
  and list them in the PR body. Do not hand-trim generated files.
- ssr's React Compiler lint rules apply: no `setState` in an effect, and
  `data-testid` on every required component.

## 2. Keyboard dismissal (#5): super-app only

**Why.** On the tags tab, once the "Search tags" input is focused, the
keyboard can only be closed with the keyboard's own search key.

### Required behaviour

1. **A tap outside the input dismisses the keyboard.** That covers the header
   area, empty list space, and the space under a short list.
2. **Scrolling or dragging the list dismisses it** (`keyboardDismissMode="on-drag"`).
   This applies to every scroller the tab can show: the FlashList, the
   customs worklist `ScrollView`, and the Verifications `ScrollView`.
3. **Android back dismisses it** and does not navigate. The first back press
   closes the keyboard; the next one behaves as before.
4. **The first tap on a row opens the row.** That tap must not be spent on
   dismissing. Keep `keyboardShouldPersistTaps="handled"` (memory
   `rn-modal-inherits-scrollview-tap-policy`). The keyboard must also be gone
   when the detail opens.
5. **Staff lists too.** In portrait, staff get the traveller picker (a dialog)
   in place of the search box. The filter rail has text inputs, both in
   landscape and inside the portrait `TagFilterDrawer`. My call is that rules
   1, 2 and 4 cover:
   - the rail's own `ScrollView`;
   - the landscape `TagTable` FlashList;
   - the scrollers in rule 2.

   Rule 3 inside the drawer: with the keyboard up, the first back must close
   only the keyboard, not the drawer. On Android the IME normally consumes
   that back before the app sees it. So change the drawer's `BackHandler`
   only if the device shows the drawer closing.

How this is done is up to the builder. The keyboard library is
`react-native-keyboard-controller` 1.18.5; read its typings in
`node_modules`, not its website. A green jest run does not prove `BackHandler`
behaviour, so rule 3 is accepted only on a device (a CPad by serial).

## 3. Show on map (#10): super-app and ssr

**Why.** A traveller looking at a tag wants to find the store again, and staff
want to see where the tag was issued.

### Facts (dev, 2026-11-05)

- **Staff** detail (`TagDetailDto.merchant.address`, an `AddressDto`) carries
  `latitude`, `longitude` and the Google `placeId`. Sample: 62.070793,
  -7.326684, `ChIJF1DaLQCbvkgR7zQET3BbDDo`. Its `addressLine` is street only;
  city and country appear as ids.
- **Traveller** detail (`TagPublicDetailDto.merchant`, `MerchantPublicDto`)
  has `id`, `name` and `address`. `address` is a full string: "3 í Bygdini,
  Sørvágur 380, Sørvágur, Vága sýsla, Faroe Islands". It has no coordinates.
- The public map card (`public/map/places/merchant/{id}`) 404s (`029003`) for
  that merchant. It is a headquarter, and the map hides those. So the card
  cannot supply coordinates in general.

### Decided by the user

- Staff tags open the **exact pin** (coordinates, plus place id when present).
- Traveller tags open the maps app **searching the full address**.
- Jira ticket for **Adnan Fahed**: **UNI-1871**, filed 2026-11-05. It asks
  for `latitude`, `longitude` and `placeId` on `MerchantPublicDto` in the
  cross-tenant tag detail, so traveller pins become exact. Once those fields
  arrive, the apps should prefer them and keep the address search as the
  fallback. That change is out of scope here; nothing in this work waits on it.
- ssr's traveller tag detail gets the same link on its Store card.

### Behaviour

- **super-app** `StoreBlock`: a "Show on map" control inside the Store block.
  iOS opens Apple Maps and Android opens Google Maps, via `Linking.openURL`
  with an https URL, so it falls back to the browser when the app is missing.
  If the URL fails to open, log it; the screen must not crash.
- **Shown only when it can work.** Staff with coordinates, or travellers with
  a non-blank address. A staff address without coordinates gets **no** button:
  its street-only line is not a reliable search.
- This is "show the place", not "get directions". Explore's `directionsUrls`
  builds directions URLs, so add a sibling helper for place/search URLs rather
  than reusing it. The search URL may include the store name if the result
  improves; the builder decides. The check that counts: the Faroe sample lands
  on Sørvágur in Google Maps.
- **Everywhere the Store block appears** (my call). That includes super-app's
  scan preview (`TagPreviewScreen` shares `StoreBlock`) and ssr's public
  `/tag/[slug]` page (it shares `TagStoreCard`). Those pages already show the
  same address in full, so the link exposes nothing new. It goes in the
  shared component, with no prop to switch it off.
- **ssr** `TagStoreCard`: a link that opens Google Maps by address in a new
  tab (`target="_blank" rel="noopener noreferrer"`). It is shown only for a
  non-blank address and carries a `data-testid`.

## i18n

New keys go into every locale: super-app `en-US` and `tr-TR`, ssr `en` and
`tr` under SSRService. Reuse terms that already exist. Proposed:

| Key | English | Turkish |
| --- | --- | --- |
| Country | "Country" | "Ülke" |
| Show on map | "Show on map" | "Haritada göster" |

## Gates

- **super-app.** `npm run typecheck` holds its baseline: one standing error at
  `tabBackNavigation.router.test.tsx:119`. `npm test` has 0 failures.
  `npx eslint src` has 0 errors. New tests:
  - `queryToParams` sends `tenantIds` for travellers only;
  - `travellerCountries`;
  - the sheet's country section and its 2-option threshold;
  - the StoreBlock button's three cases;
  - the dismiss props on each scroller.
- **web-app.** `pnpm --filter ssr type-check` is clean. `pnpm --filter ssr lint`
  has 0 errors. `pnpm --filter ssr test:unit` has 0 failures. `node
  scripts/find-missing-i18n.mjs --app=ssr` is clean. Plus a signed-in local
  walkthrough as `tur-a25y29041`.
- **Device.** A CPad by serial. Before using it, check `adb devices -l`,
  `adb reverse --list`, the foreground app and `flags=`.

## Known limits

- **No account can show the country filter visibly.** The only traveller has
  one country, so on screen we can see only the hidden state. The request is
  verified by unit tests and by the live `TenantIds` probe above.
- **iOS is not testable here**, so the Apple Maps path is checked only by
  unit test.

## Non-goals

- A country filter on staff lists. Those lists are tenant-scoped already.
- Sections per country, or an unpaged traveller list.
- Translating tenant names.
- Directions or route planning.

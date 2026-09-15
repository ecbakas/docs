# Staff Home becomes the analytics dashboard

**Date:** 2026-09-15
**Repo:** `super-app-safe` (standalone clone of `unirefund-mobile`, branch `main` @ `1270feb5`)
**Status:** approved design, ready for planning

## Goal

The three staff Home screens — merchant, refund-point, customs — become the
mobile counterpart of web's `home/analytics` dashboard: the chart set web
renders, drawn natively, scoped by the caller's own affiliation.

Each Home screen as it stands today is kept verbatim in-tree as
`HomeScreen.classic.tsx`, so no flow is lost while it waits to be re-homed.

## Starting point

Web's dashboard lives in five files under
`apps/web/src/app/[lang]/(main)/(unirefund)/home/analytics/` (~1,400 LOC):

| File | Role |
|---|---|
| `page.tsx` | server: tenant timezone → list `AnalyticsDataSources` → filter to known names → `POST {id}/execute` in parallel |
| `sources.ts` | the 15 backend data-source names this dashboard knows |
| `client.live.tsx` | 15 cards plus the reshaping and localization that produce them |
| `dashboard-grid.tsx` | react-grid-layout drag/resize/hide, persisted per user+party |
| `loading.tsx` | skeleton |

The mobile app has none of the pieces:

| Need | `super-app-safe` today |
|---|---|
| `AnalyticService` SDK | absent from `src/saas/` and `src/saas/API_LIST.json` |
| Analytics permissions | **present** in `src/data/policies/policies.gen.json` |
| Tenant timezone | **present** — `useTenantTimeZone()` in `src/store/application-configuration.ts` |
| Chart library | none; `react-native-svg` 15.12.1 and Skia 2.2.12 are installed |
| `Analytics.*` strings | none |
| Home screens | merchant 101 LOC, refund-point 55 LOC, customs 393 LOC (a full worklist plus 4 test files, ~970 LOC) |

Environment: Expo 54.0.36, RN 0.81.5, React 19.1.0, new architecture enabled.

## Decisions

Each was settled during brainstorming; recorded here as decisions, not options.

1. **Analytics replaces Home outright.** Not appended, not a strip with a
   drill-in. The existing content moves out of Home entirely.
2. **The old screens survive as `HomeScreen.classic.tsx`** beside the new ones —
   unreferenced, compiling, and still covered by tests. Reverting a role is a
   one-line import change in `src/app/(auth)/index.tsx`.
3. **Charts come from a library, not hand-rolled.** `victory-native@41.26.0`.
4. **No customization.** One curated vertical order, identical for every user.
   Nothing persisted.
5. **No hardcoded role-to-chart map.** One code path serves all three roles; the
   backend decides what each sees.

## Architecture

### Data path

1. `src/saas/API_LIST.json` gains
   `{ "input": "swagger-json/Analytic", "output": "Analytic", "dereference": true }`.
2. `node src/saas/index.mjs -u https://dev-api.unirefund.com -f Analytic`
   generates `src/saas/AnalyticService/` in the same shape as every other
   service (`AnalyticServiceClient.ts`, `sdk.gen.ts`, `types.gen.ts`,
   `schemas.gen.ts`).
3. `src/actions/lib.ts` gains `getAnalyticServiceClient`, alongside the other
   thirteen. Its `CREDENTIALS: "omit"` contract applies unchanged.
4. `src/actions/AnalyticService/actions.ts` exposes exactly two calls, each
   wrapped in `fetchRequest` for the 401-refresh, following
   `src/actions/TagService/actions.ts`:
   - `getAnalyticsDataSourcesApi()` — `GET /api/analytic-service/analytics-data-sources`
   - `postAnalyticsDataSourceExecuteApi(id, parameters)` — `POST /api/analytic-service/analytics-data-sources/{id}/execute`

Verified before writing this spec:
`https://dev-api.unirefund.com/swagger-json/Analytic/swagger/v1/swagger.json`
returns 200 (136,948 bytes), and `@ayasofyazilim-clomerce/sdk-generator` is
installed in this checkout. The generator composes
`${base_url}/${input}/swagger/v1/swagger.json`, which is why the bare
`swagger-json/Analytic` path 404s.

### Fetch and shape

`src/hooks/useAnalyticsDashboard.ts` — one hook, shared by all three screens:

- gates on `AnalyticService.AnalyticsDataSources` **and**
  `AnalyticService.AnalyticsDataSources.ViewList` read from
  `user.grantedPolicies`, the same way customs Home gates risk on
  `TagService.TagRisks.ViewRiskLevel`. Both halves of the pair are required —
  ABP enforces group plus leaf.
- lists the sources, filters to the known names, executes the survivors in
  parallel with `{ Timezone: useTenantTimeZone() }`.
- returns `{ cards, isLoading, error, refresh }`.

Failure is per-source, not per-dashboard. A single `execute` that errors or
returns no rows drops that one card, as web drops it; the rest still render.
Only a failure of the *list* call — or a missing permission — is a
whole-dashboard state, and each has its own message: an error state with a
retry, and an explanatory empty state respectively.

Fetching happens on mount and on pull-to-refresh, plus once when the active
affiliation changes (read from the affiliation list's `isPrimary`, not the JWT
claim, which lags one issuance behind a switch). Home is a retained tab, so
re-focusing it must **not** refire 15 ClickHouse queries.

`src/utils/analytics/` holds the pure reshaping ported from `client.live.tsx`:
`toNumber`, `orderedPeriods`, `pivotByPeriod`, `buildMatchRate`,
`buildLastIssued`, and the source-to-card registry. Pure functions, unit-tested.

**Per-role differentiation is the backend's job.** The list endpoint returns
only the sources the caller is affiliated with, and empty results are dropped.
A merchant, a refund agent and a customs officer therefore see different
dashboards from identical code. No role branching anywhere in this feature.

### The 15 cards

Order is fixed and curated for a phone: single-value donuts first, then trends,
then the wide tables.

| # | Source | Mobile form |
|---|---|---|
| 1 | `TopNationalitiesByTagsAndAmount` | donut |
| 2 | `IssuedByResidence` | donut |
| 3 | `Top10Stores` | donut |
| 4 | `Top10Chains` | donut |
| 5 | `InitialValidationResult` | donut, risk colors |
| 6 | `FinalValidationResult` | donut, risk colors |
| 7 | `TagsByTimeOfDay` | area |
| 8 | `TagsByTimeOfWeekday` | horizontal bar |
| 9 | `MatchRate` | grouped columns (Refunded / Outstanding), horizontally scrollable |
| 10 | `LastIssuedTag` | horizontal bar |
| 11 | `SplitByRefundMethod` | horizontal bar |
| 12 | `SalesVatTotalsByPeriod` | table |
| 13 | `TagsByNationalityPeriodComparison` | table, 10 rows |
| 14 | `TagsByHourPeriodComparison` | table |
| 15 | `TagsByWeekdayPeriodComparison` | table |

Web's pie cards become donuts on mobile: a donut's centre carries the total,
which buys back the labels a phone cannot fit around a pie.

Orientation departs from web deliberately. Category-heavy sets with long labels
— weekday (7), day range (8, e.g. "16 - 30 days ago"), refund method — are
unreadable as columns at phone width, so they run horizontal. Match rate keeps
grouped columns because 12 months read as a time series, and scrolls sideways.

### Chart library

`victory-native@41.26.0`, chosen over the current 42.0.1 on one fact: Expo SDK
54 pins `@shopify/react-native-skia` to **2.2.12**
(`node_modules/expo/bundledNativeModules.json`).

| | victory-native 41.26.0 | victory-native 42.0.1 | react-native-gifted-charts 1.4.78 |
|---|---|---|---|
| Skia peer | `>=1.2.3 <3.0.0` — satisfied | `>=2.6.0 <3.0.0` — **needs an off-SDK bump** | n/a |
| Renderer | Skia | Skia | react-native-svg |
| Pie / donut | `PieChart`, `PieSlice`, `PieSliceAngularInset` | yes | yes |
| Bar | `Bar`, `BarGroup`, `HorizontalBar`, `HorizontalBarGroup`, `StackedBar` | yes | yes |
| Area / line | `Area`, `StackedArea`, `Line` | yes | yes |
| Native change | none | Skia 2.2.12 to 2.6+, prebuild, device re-test | none |

41.26's other peers are met: reanimated 4.1.0 satisfies `>=3.0.0`, and
gesture-handler 2.28 satisfies `>=2.0.0`. Skia is already a dependency of the
app — only `src/screens/shared/_components/tag-calculator/SignatureSheet.tsx`
uses it — so the library adds no native module and needs no prebuild.

Gifted-charts was the runner-up (pure JS over the installed react-native-svg,
gradient peers both optional) but renders through SVG rather than Skia, and the
brief was the best visuals available.

### Components

`src/components/charts/`:

- `ChartCard.tsx` — title, optional caption, legend, loading skeleton and empty
  state, in the app's existing card language (`bg-card`, `border-border`).
- `AnalyticsDonut.tsx`, `AnalyticsBar.tsx`, `AnalyticsArea.tsx` — thin wrappers
  mapping a card config onto victory-native and applying the theme palette.
- `AnalyticsTable.tsx` — plain RN views inside a horizontal `ScrollView`. No
  library involved; the four table cards are rows and columns.

`src/screens/shared/_components/AnalyticsDashboard.tsx` composes the hook with
the registry and renders the cards in order.

### Screens

For each of `merchant`, `refund-point`, `customs`:

1. `HomeScreen.tsx` is copied verbatim to `HomeScreen.classic.tsx`.
2. The customs copy keeps using its existing `_components/` and
   `useCustomsHomeFlow.ts`, which do not move.
3. The four customs test files under `src/screens/customs/Home/__tests__/` are
   repointed at `HomeScreen.classic.tsx`, so the safe copy stays verified
   rather than becoming untested dead code.
4. A new `HomeScreen.tsx` renders `TabPage` plus `<AnalyticsDashboard />`. The
   three are near-identical thin shells, kept separate so a role can diverge
   later without unpicking a shared file.

`src/app/(auth)/index.tsx` is unchanged — the import paths it uses still
resolve to the new screens.

### Colors and localization

Traffic-light semantics carry over from web: green, red and amber are reserved
for outcome states and matched on the **raw** SQL value (substring,
case-insensitive), so translation and the backend's spacing variants
(`Pending (Not Reviewed)`) cannot break the match. Everything else takes a
palette slot from `@/utils/theme`.

Weekday and month labels localize through `Intl` off `activeLocale`, exactly as
web does — no keys needed.

Chart titles and domain enum labels (refund method, risk level, day range) come
from a local `en`/`tr` constant map in `src/utils/analytics/labels.ts`, read off
`activeLocale` — **not** through `t()`. See Constraints for why, and for the
one-commit path back to `t()`.

## Constraints

**New `t()` keys are blocked on the backend.** `TranslationKey` is derived from
`src/data/language-data/en-US.gen.json`, a gitignored artifact `npm run init`
fetches from the backend, and `src/localization/config.ts` asserts every key in
the tracked `resources/en-US.json` exists in that bundle. A locally-added
`MobileApp.Analytics.*` key therefore fails `tsc` until the backend's
localization resource carries it. The local label map sidesteps this and keeps
both languages; when the backend has the keys, swapping the map for `t()` is
one commit touching one file.

**Charts need a measured height.** A wide table inside a horizontal
`ScrollView` renders its header over an empty body unless the wrapper carries a
real pixel height, and it only fails after a re-render. Every chart and table
card gets an explicit height rather than `flex: 1`.

**Never read width from module scope.** Rotation is unlocked on tablets and a
fixed-orientation third-party Activity leaves `useWindowDimensions()` stale, so
chart sizing uses `onLayout` or `useSafeAreaFrame()`, never an import-time
`Dimensions.get("window")`.

**Render tests must be named `*.router.test.*`** to be picked up.

## Risks

**A staff user without the analytics permission gets an empty Home.** Web
redirects such a user to `realtime` or `dashboard`; mobile has neither route,
and Home no longer carries the create-tag, connected-devices, refund or customs
worklist entry points. Those users see an explanatory empty state and have
nothing to do from Home until the displaced flows are re-homed. Accepted
knowingly — re-homing is follow-up work.

**15 ClickHouse queries fire on Home.** Web pays this on a desktop route; mobile
pays it on the app's landing tab, on mobile data. Mitigated by the fetch policy
above — parallel execution, per-card rendering as each source lands, and no
refetch on tab re-focus — but it is a real cost and worth measuring on a device.

## Testing

- **Unit** (`jest`, pure): `pivotByPeriod`, `buildMatchRate`, `buildLastIssued`,
  `orderedPeriods`, risk-color matching, the source-to-card registry, and the
  label map's fallback to the raw value.
- **Router** (`*.router.test.tsx`): one per role, rendering the new Home with
  `useAnalyticsDashboard` mocked — loading, populated, empty and
  permission-denied. Plus the four repointed customs tests, which must still
  pass unchanged against `HomeScreen.classic.tsx`.
- **Gates:** `npm run typecheck` and `npm test`. There is no CI on this repo, so
  these two are the only gates; `npm run init` must have been run (with
  `SUPPORTED_LOCALES` set) or `tsc` reports phantom TS2307s.
- **Device:** the charts are Skia-rendered, so a screenshot per role is the only
  real check that they draw. Only one workspace device is debuggable.

## Out of scope

- Re-homing create-tag, connected-devices, refund and the customs worklist.
- Layout customization of any kind.
- `EmbeddedDashboards` and the Superset `realtime` route.
- Deleting the `.classic.tsx` copies.

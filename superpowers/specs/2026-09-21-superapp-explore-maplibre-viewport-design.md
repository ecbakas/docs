# super-app Explore: MapLibre + live viewport endpoints

Date: 2026-09-21
Repo: `super-app`
Status: design, awaiting review

## Goal

Bring the web `apps/ssr` explore map's behaviour into super-app's traveller
scope: three live place layers (merchants, customs, refund points), the sector
filter, and per-place directions. The web page is **copied, not moved** — it
stays in `apps/ssr` unchanged.

## Decisions already taken

- **Map library: `@maplibre/maplibre-react-native`**, replacing
  `react-native-leaflet-map`. Chosen for its cost posture: no Google Maps API
  key to provision, rotate or bill, which keeps today's free-tile arrangement.
- **The screen matches the web page.** The map, layer toggles, sector control
  and directions are the surface. The existing list view and search-by-name are
  dropped.

## Why the library has to change

The web page's architecture is *fetch whatever is inside the visible window on
every `moveend`*. `react-native-leaflet-map` cannot support that. Its entire
event vocabulary is `onMapClicked`, `onMapMarkerClicked`, `onResize`, `onZoom`,
`onZoomLevelsChange` and `drag`, and — decisively — **`onZoom` and `drag` carry
no payload at all**: no bounds, no post-pan centre, not even a zoom level. The
component also exposes no webview ref and no `injectedJavaScript` passthrough,
so there is nothing to hook without patching the package.

MapLibre's region-change event reports the visible bounds directly, which is the
one capability the whole feature rests on.

## What already exists

- `src/screens/shared/Explore/` — `ExploreScreen.tsx` plus `MapView`,
  `FilterSheet`, `ListView`, `LocationDetailSheet` and `mock-data.ts`. Routed
  from `src/app/(auth)/explore.tsx`.
- **It is entirely mock-driven.** `mockLocations` supplies every pin; no part of
  this screen talks to the backend today.
- `src/saas/CRMService` already contains all three viewport operations
  (`GetApiCrmServicePublicMerchantsViewportData`, `…PublicCustomsViewport…`,
  `…PublicRefundPointsViewport…`). **No SDK regeneration is needed.**
- `expo-location` is installed and `src/utils/location.ts` already wraps
  permission + position with a tagged failure result.

## Constraints from this repo

- `.claude/rules/api-actions.md` — screens never call generated clients. Every
  call goes through a wrapper in `src/actions/**`, wrapped in `fetchRequest`
  from `src/utils/customFetch.ts`, with a stable `apiName`, and `customHeaders`
  threaded into the client.
- `.claude/rules/avoid-use-effect.md` — derived state uses `useMemo`, updates
  are event-driven. Subscribing to a native/external source is explicitly one of
  the permitted effect uses, which is what the map region subscription is.
- `.claude/rules/i18n.md` — keys are authored in
  `src/localization/resources/{en-US,tr-TR}.json` and the bundle is regenerated
  with `npm run init`. `TranslationKey` derives from the **generated** bundle, so
  a forgotten regeneration surfaces as TS2345 at the `t("…")` call site rather
  than as a missing key.
- `.claude/rules/ui-components.md` — reach for `src/components/ui` primitives
  before writing styling.
- `app.config.js` carries a curated `blockedPermissions` list and custom config
  plugins whose mods run last-to-first. A new native dependency must be checked
  against both.

## Architecture

```
src/actions/CRMService/actions.ts
  getPublicMerchantsViewportApi / getPublicCustomsViewportApi /
  getPublicRefundPointsViewportApi     -> fetchRequest + token-less client

src/screens/shared/Explore/
  ExploreScreen.tsx                    -> composes map + controls
  _components/
    MapView.tsx                        -> MapLibre, emits ViewportBounds
    useViewportLayer.ts                -> one layer's fetch + race guard
    PlaceMarkers.tsx                   -> pins and cluster bubbles
    LayerToggles.tsx                   -> merchants / customs / refund points
    SectorControl.tsx                  -> sector filter (merchants only)
    PlaceDetailSheet.tsx               -> name, address, sector badges, directions
    directions.ts                      -> Google / Apple deep links
```

Data flow: MapLibre reports visible bounds on region-change-complete → debounced
(350 ms, as on web) → each *enabled* layer fetches its own endpoint → results
normalise to one `ViewportPlace` shape → markers render; tapping one opens the
detail sheet.

The three responses differ only in their entity array key (`merchants`,
`customs`, `refundPoints`) and only merchants carry `sectors`. Every field on
every viewport DTO is optional, so a single intersection type covers all three,
exactly as on web.

### Layer gating

On web, an unchecked layer costs nothing because `MapLayerGroup` renders `null`
and its child never mounts. There is no equivalent here, so gating is explicit:
`useViewportLayer` takes an `enabled` flag and performs no request when false.
Merchants is the only layer on by default, matching web.

### Tenant and auth — the risk to settle first

All three endpoints are tenant-scoped and reject a call without `__tenant`
(`UniRefund.CRMService:029001`). super-app's `createServiceClient` **always**
attaches the traveller's access token. A user claim outranks the `__tenant`
header in ABP's tenant resolution, so an authenticated call may resolve to the
traveller's own tenant rather than the country tenant being browsed.

These three calls therefore use a **token-less** client variant carrying only
`__tenant`. `src/actions/lib.ts` already documents why the tenant must come from
that header and nowhere else (`CREDENTIALS: "omit"` guards the same class of
bug via the cookie resolver), so this extends an established position rather
than inventing one.

UNI-1659's centroid-derived tenant is documented in the swagger but is **not
reachable on any deployed build** — dev and uat both still answer 029001 with no
header — so the country tenant stays an explicit value, as in `apps/ssr`.

### Fields the API cannot back

The current `TaxFreeLocation` carries `rating`, `operatingHours`, `description`
and `images`. **No viewport endpoint provides any of them**; they exist only in
`mock-data.ts`. The detail sheet will therefore show name, address and sectors
only. Restoring the others needs either a per-place detail endpoint or a product
decision to drop them. Flagged rather than silently designed around.

### Sector filter

Same constraint as web: there is no anonymous source for a sector list
(`/api/setting-service/product-group` is 401, CRM publishes no sector route), so
options are derived from the `sectors[]` already carried on merchant pins. A
clustered answer carries no pins, so an empty derivation means "unknown", not
"none" — the last known set is retained. The selected sector is kept as an
object and always included in the option list, so the filter stays truthful and
clearable after a pan drops it out of view. `Sector` applies to merchants only.

### Directions

`Linking.openURL` with the same two destination-only deep links used on web:
`https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>` and
`https://maps.apple.com/?daddr=<lat>,<lng>`. Destination-only means the maps app
supplies "from here" and this app needs no location permission for the feature.
Both buttons show on both platforms, matching the web decision.

## Risks

1. ~~New Architecture compatibility~~ — **verified compatible, 2026-09-21.**
   `@maplibre/maplibre-react-native@11.4.0` (published 2026-09-19) declares
   peers `expo: ">=54.0.0"`, `react-native: ">=0.80.0"`, `react: ">=19.1.0"` —
   all satisfied here — and ships a `codegenConfig` with `type: "all"` and
   Fabric `componentProvider` entries, which is the New Architecture marker.
   The explicit Expo peer also means the library is Expo-aware rather than
   bare-RN-only. Pin 11.4.0.
2. **Region-event payload shape** (`visibleBounds` ordering and nesting) must be
   confirmed against 11.4.0 rather than assumed. This is now the first task in
   the plan: everything downstream consumes those bounds.
3. **Config plugin ordering.** Plugin mods run last-to-first in this repo and
   several plugins write the same keys; a MapLibre plugin entry must be placed
   and verified against that, not appended blindly.
4. **New permissions.** Any permission the library's manifest declares must be
   reconciled with the curated `blockedPermissions` list.
5. **A native dependency means a new dev-client build.** JS-only reload over
   Metro will not pick this up.

## Testing

- `npm run typecheck` and `npm test` (both run `check:language-data` first, so
  `npm run init` must follow any resource change).
- Render test named `*.router.test.*` per repo convention.
- Pure units — bounds→request mapping, the response normaliser, sector
  derivation and retention, and the two deep-link builders — are tested directly;
  they carry the logic worth protecting and need no native map.
- On-device check on the debuggable device, which is the only way to confirm the
  region event, the tile style and the deep links actually behave.

## Out of scope

- Any change to `apps/ssr`. The web page is copied from, not modified.
- Restoring `rating` / `operatingHours` / `description` / `images`.
- The list view and search-by-name, which this design removes.

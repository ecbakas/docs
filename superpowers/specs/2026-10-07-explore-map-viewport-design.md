# Explore map v2: one map endpoint, cross-layer clusters, merchant detail

**Goal.** ssr's `/explore` (and later super-app's Explore) moves to the CRM's new map API:
- one request answers every layer;
- a crowded window comes back as one cross-layer cluster set;
- a tapped merchant loads its full card from a per-merchant endpoint.

**Order:**
1. **web-app (`apps/ssr`) first.**
2. **super-app** follows the same design once the user approves the web result, under a plan of its own.

## Decisions (user, 2026-10-07)

1. **New contract.** Move to `GET /api/crm-service/public/map/viewport` and `GET /api/crm-service/public/merchants/{id}`.
2. **No tenant.** The client sends no country tenant; the backend resolves the country from the window's centre. ssr's hard-coded `EXPLORE_COUNTRY_TENANT` goes.
3. **Sector filter.**
   - Ask the backend for a **public sector-list endpoint**. Pins no longer carry sectors and no public list exists, so there is nothing to build options from.
   - Until that endpoint ships, the sector button is hidden.
   - The server-side `sector` parameter stays wired in the query builder for that follow-up.
4. **Exit points replace customs** as a layer.
5. **Web first, then super-app,** both on branch `feat/map-improvement`. The branch exists locally in both repos, at their `main`, carrying the user's regenerated SDK.

## The backend contract

These facts come from the regenerated `CRMService` SDK docblocks, verified against `dev-api.unirefund.com` on 2026-10-07.

### `GET public/map/viewport`

**Query.**
- `South`, `North`, `West`, `East`: required, in decimal degrees.
- `Layers[]`: any of `Merchant`, `RefundPoint`, `ExitPoint`. Omitted or empty means **every** layer.
- `Sector`: a product-group article code, for example `SHOES`. It filters the merchant layer only.

**Response: `MapViewportDto { clustered, pins, clusters, totalCount }`.**
- Up to the pin threshold, the response carries individual `pins`.
- Past the threshold it carries **one** cluster set spanning every requested layer. Each `MapClusterDto` is `{ count, latitude, longitude }`, with no layer and no identity.
- A `MapPinDto` is `{ layer, id, name, latitude, longitude, addressId, addressLine, headquarterName }`. `headquarterName` is set on merchant pins only. Names can carry stray whitespace: dev returns `" İstanbul MarmaraPark"`.

**Tenant.** It is optional. Without one, the server derives the country from the window's centroid: the served country containing it, or the nearest within a few kilometres.
- It refuses with **400 `UniRefund.CRMService:029001`** ("The country for this map area could not be determined") when no country qualifies, or when two are comparably close.
- On dev, a window over Istanbul answers 7 merchant pins and all of Turkey answers 52, so both stay below the threshold.

**Span.** The window may not exceed 180° on either axis (`029002`), as before.

### `GET public/merchants/{id}`

**Response: `MerchantPublicDetailDto`.**

| Field | Contents |
| --- | --- |
| `name` | |
| `headquarterName` | null when there is no headquarter |
| `sectors[]` | `{ articleCode, name }`, ordered by VAT rate and then name |
| `addresses[]` | `{ addressId, addressLine, postalCode, countryName, cityName, districtName, neighborhoodName, latitude, longitude, placeId }`. Never empty; these are the same addresses the map pins. |
| `primaryPhone` | digits, with a leading `+` only when it was entered with one; or null |
| `primaryEmail` | or null |

- It is answered **only** for a merchant the map would show. Any other id answers **404 `UniRefund.CRMService:029003`**.
- No tenant is needed.
- The docblock gives the directions link: `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}&destination_place_id={placeId}`.

### Removed

- `public/merchants/viewport` and `public/customs/viewport`, with their DTOs.
- The `Customs` value of `MapLayer`.

`public/refund-points/viewport` and `public/exit-points/viewport` still exist, but ssr no longer uses them: the map endpoint covers both.

## Section 1: data

**`packages/actions/unirefund/CRMService/actions.ts`**
- **Removed:**
  - `getPublicMerchantsViewportApi`, `getPublicCustomsViewportApi` and `getPublicRefundPointsViewportApi`. The first two already fail type-check against the regenerated SDK, and only `/explore` calls them.
  - The `EXPLORE_COUNTRY_TENANT` constant, and the tenant-pinned client it builds.
- **Added:**
  - `getPublicMapViewportApi(data: GetApiCrmServicePublicMapViewportData)`;
  - `getPublicMerchantDetailApi(id: string)`.
- **How both work:**
  - Both use the public CRM client **without** a `__tenant`.
  - Both **return** `structuredResponse` / `structuredError` instead of throwing. This deviates from the repo's GET pattern on purpose. These actions are called from client components, and a server action's thrown error reaches the browser without its code in production. The UI must tell `029001` and `029003` apart from a plain failure.

**`apps/ssr/src/utils/explore/viewport.ts`** is rewritten as pure modules with `node:test` tests.
- **Layer keys.** `MapLayerKey = "merchants" | "refundPoints" | "exitPoints"` maps to and from the API's `Merchant | RefundPoint | ExitPoint`. Unknown API layers are dropped.
- **`toMapViewportQuery(bounds, active, sector?)`** returns the request, or **`null` when no layer is active**: the server reads an empty list as "every layer", so the client must not send one. `isViewportSpanValid` (≤ 180°) is kept.
- **`normalizeMapViewport(dto)`** returns `{ clustered, pins, clusters, totalCount }`, where:
  - pins carry a `MapLayerKey`;
  - names and address lines are trimmed;
  - pins or clusters without coordinates are dropped;
  - a clustered response has no pins, and an unclustered one has no clusters.
- **`mapErrorKind(code)`** returns `"unserved"` for `029001`, `"span"` for `029002`, and `"failed"` otherwise.
- **`merchantErrorKind(code)`** returns `"notFound"` for `029003` and `"failed"` otherwise.

**`apps/ssr/src/utils/explore/merchant.ts`** (pure, tested):
- **`pickAddress(detail, addressId)`** returns the tapped address, or the first one.
- **`addressLines(address)`** returns `[addressLine, "neighbourhood, district, city"]`, with empty parts dropped.
- **`directionsUrls(address)`** returns Google Maps with `destination_place_id` when there is a `placeId`, and the coordinates alone otherwise, plus Apple Maps.
- **`telHref(phone)`** strips everything but digits and a leading `+`.

**Hooks**, following the existing "derive status during render" pattern (no setState in effects):
- **`use-map-viewport.ts`** replaces `use-viewport-layer.ts`.
  - One request per settled map move, debounced as today.
  - Status: `loading | ready | error | unserved`.
  - On failure it keeps the last drawn pins and clusters, so a failed pan doesn't blank the map.
  - With no active layer it returns an empty `ready` state and makes no request.
- **`use-merchant-detail.ts`** loads a tapped merchant's detail.
  - Status: `loading | ready | notFound | error`, plus `retry()`.
  - It answers per id, so a stale answer never lands on a different merchant.

**Sector.**
- `deriveSectorOptions`, `retainSectorOptions` and `mergeSelectedSector` are removed, along with their tests and the page's sector state. They build options from pin sectors, which no longer exist.
- `sector-sheet.tsx` stays in the codebase for the follow-up. The sector button is not rendered.

## Section 2: the map and its sheets

**Layers sheet.**
- Rows: **Merchants** (on by default), **Refund points** and **Exit points**.
- Exit points take the old customs look: an amber `bg-warning` pin with the building icon.
- `LAYER_ORDER`, `DEFAULT_LAYERS`, `toggleLayer` and `LAYER_PINS` move to the new keys. `toggleLayer` no longer clears a sector.

**Pins.**
- Per layer, as today.
- Each merchant pin's accessible name includes its headquarter name when it has one: "{name}, {headquarter}".

**Clusters.**
- One count bubble per cluster across all layers: the app's red count bubble, with the label "{0} places".
- Tapping a bubble zooms in by 3 around it, as today.
- `LayeredCluster` and the per-layer cluster test ids go. The single test id is `explore-cluster`.

**Banners.**
- **failed:** today's amber "Places could not be loaded for this area."
- **unserved:** a new amber banner, "No Unirefund places in this area. Move the map to a country we serve."
- **No banner** while loading, or when nothing matches.

**Merchant sheet.** This is the page-width `Drawer` that today's `place-sheet.tsx` grows into.
- **Immediately on tap,** it shows the pin's own data: name, headquarter, address line.
- **Loading:** a skeleton beneath that, while the detail loads.
- **Ready:**
  - "Part of {0}" when there is a headquarter;
  - sector badges;
  - the tapped address, through `pickAddress` and `addressLines`;
  - Google Maps and Apple Maps directions buttons;
  - a phone row (`tel:` link) and an e-mail row (`mailto:` link), each only when present.
- **notFound:** "This place is no longer on the map."
- **error:** "We couldn't load this place's details." and a **Try again** button. The pin's data stays.

**Refund point and exit point sheets.** These layers have no detail endpoint, so the sheet shows the name, the address line and the two directions links from the pin's coordinates, as today.

**Unchanged:**
- MapLibre and the OpenFreeMap Liberty style;
- the search bar (Photon);
- the control chain, minus the sector button;
- locate and zoom;
- the island and the attribution placement;
- `/explore` staying public.

## Strings

New `SSRService` keys, in en and tr:

| Key | en | tr |
| --- | --- | --- |
| `Explore.Layer.ExitPoints` | Exit points | Çıkış noktaları |
| `Explore.Cluster.Places` | {0} places | {0} yer |
| `Explore.Unserved` | No Unirefund places in this area. Move the map to a country we serve. | Bu bölgede Unirefund noktası yok. Haritayı hizmet verdiğimiz bir ülkeye taşıyın. |
| `Explore.Place.PartOf` | Part of {0} | {0} bünyesinde |
| `Explore.Place.NotFound` | This place is no longer on the map. | Bu yer artık haritada değil. |
| `Explore.Place.LoadFailed` | We couldn't load this place's details. | Bu yerin ayrıntıları yüklenemedi. |
| `Explore.Place.Phone` | Phone | Telefon |
| `Explore.Place.Email` | E-mail | E-posta |

"Try again" reuses an existing key. The customs layer keys and any other keys this leaves unread are listed in the PR, not removed.

## Grants

Both endpoints are anonymous and `/explore` stays public, so nothing new is gated.

## Testing

**Gates.** Re-measure each baseline first.
- `pnpm --filter ssr test:unit`, plus the new suites.
- `pnpm --filter ssr type-check`: 0.
- `pnpm --filter ssr lint`: 0 errors.
- `pnpm --filter web type-check`: hold its baseline.
- `pnpm --filter ssr build`, with no dev server running on the checkout.

**Manual pass** on dev, at 375 px and 1280 px:
- **Istanbul:** merchant pins render; the layer toggles work; refund-point and exit-point pins appear where dev has them.
- **A zoomed-out window** that crosses the pin threshold shows clusters. If dev data never exceeds it, record that as not verified.
- **Tapping a merchant** loads the detail: headquarter, sectors, address, directions, phone and e-mail.
- **A window centred on open sea** or an unserved country shows the "unserved" banner.
- **Turning every layer off** sends no request and leaves no pins.
- **The detail sheet's 404 path** is covered by unit tests, because a live merchant can't be made ineligible. It is recorded as not verified in the browser.

## Delivery

**Branch** `feat/map-improvement` in `C:\unirefund\web-app`.
- **First commit:** the user's regenerated SDK, as it stands.
- **Then the build,** subagent-driven, with a final review.
- **One PR into `main`.**

**Risk.** The SDK regeneration also changed `ContractService` and `DeviceService`. If that breaks `apps/web` or `apps/ssr` type-check outside the map, the plan's first task reports it before any map work starts. That breakage is not silently fixed here.

**super-app.** After the user approves the web result:
- the same design, on its own `feat/map-improvement`, which already holds the regenerated SDK;
- its own plan;
- `src/screens/shared/Explore/` (`_lib/viewportRequest`, `normalizeViewport`, `useViewportLayer`, the sheets).

**Backend ask** (in the PR): a public sector-list endpoint, so the sector filter can return.

## Out of scope

- A sector list built from merchant details.
- Using `public/refund-points/viewport` and `public/exit-points/viewport`.
- Listing a merchant's other addresses in its sheet.
- Any change to the map style, search or controls.
- Deleting the now-unused `sector-sheet.tsx` and the customs strings.

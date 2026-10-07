# Explore v2: a store locator on the CRM's new map API

**Goal.** ssr's `/explore` becomes a proper store locator, taking the best parts of [Global Blue's stores map](https://www.globalblue.com/en/stores-map) (the base) and [Mavi's store finder](https://www.mavi.com/magazalar). It sits on the CRM's new endpoints:
- one map request answers every layer;
- a crowded window comes back as cross-layer clusters;
- a tapped merchant loads its full card.

**Order:** web-app (`apps/ssr`) first. super-app follows the same design (minus the wide-screen layout) once the user approves the web result, under a plan of its own.

## Decisions (user, 2026-10-07)

1. **New contract.** Use `GET /api/crm-service/public/map/viewport` and `GET /api/crm-service/public/merchants/{id}`.
2. **No tenant.** The client sends no country tenant; the backend resolves the country from the window's centre. ssr's hard-coded `EXPLORE_COUNTRY_TENANT` goes.
3. **Sector filter waits on the backend.** The backend is asked for a **public sector-list endpoint**. Until it ships, the sector button is hidden. The server-side `sector` parameter stays wired in the query builder.
4. **Exit points replace customs** as a layer.
5. **Store-locator layout:**
   - **Wide screens (≥ 1024 px):** Global Blue's split layout, with a results panel on the left and the map filling the rest.
   - **Phones and tablets:** the app's full-screen map. A **List** button opens the results as a sheet.
6. **Ship with the API's current limits** and ask the backend for:
   - a public sector list;
   - a public merchant-name search;
   - a paged list for a clustered window.
7. **Branch:** web first, then super-app, both on `feat/map-improvement`. It exists locally in both repos at their `main`, carrying the user's regenerated SDK.

## What we take from each reference

| From | Feature | In ours |
| --- | --- | --- |
| Global Blue | Results list for the map window, updating as the map moves | Left panel on wide screens; List sheet on phones |
| Global Blue | List ↔ map sync: a row flies the map to the store, highlights its pin and opens the detail | Both directions: a pin tap selects its row too |
| Global Blue | Detail panel with address and phone links and a primary "Get directions" | Built from `MerchantPublicDetailDto`, with phone, e-mail and sectors |
| Global Blue | Store-name search with suggestions | A "Stores" group matching the loaded places, beside today's "Places" (Photon) group |
| Global Blue | Clusters scaled by count | Four size steps with compact labels (1.2k), sized to overlap less than theirs on phones |
| Mavi | "Find the nearest": the list sorted by distance, with a km label per row | Once Locate has a position, rows sort nearest-first and show "850 m" or "2.1 km" |
| Mavi | Compact rows | Name, headquarter, address, distance |
| Ours | Layers, place search, Locate, the app's pins and sheets, the island | Kept |

**Left out** because the DTOs don't carry it: website, opening hours, photos, promotion badges and the km/mi switch.

## The backend contract

Taken from the regenerated `CRMService` SDK docblocks and verified on `dev-api.unirefund.com` on 2026-10-07.

### `GET public/map/viewport`

**Query.**
- `South`, `North`, `West` and `East` are required.
- `Layers[]` takes any of `Merchant`, `RefundPoint` and `ExitPoint`. Omitted or empty means **every** layer.
- `Sector` takes an article code and filters the merchant layer only.

**Response.** `MapViewportDto { clustered, pins, clusters, totalCount }`.
- Up to the pin threshold, it returns `pins`.
- Past the threshold, it returns **one** cluster set spanning the requested layers. Each `MapClusterDto` is `{ count, latitude, longitude }`, with no layer and no identity.
- `MapPinDto` is `{ layer, id, name, latitude, longitude, addressId, addressLine, headquarterName }`. `headquarterName` is present on merchant pins only.
- Names can carry stray whitespace.

**Tenant.** It is optional, and is derived from the window's centroid.
- The endpoint refuses with **400 `UniRefund.CRMService:029001`** when no served country contains the centroid, or none is close enough to it.
- On dev, a window over Istanbul answers 7 merchant pins with no tenant, and one over all of Turkey answers 52.

**Span.** A window may not exceed 180° on either axis (`029002`).

### `GET public/merchants/{id}`

**Response.** `MerchantPublicDetailDto { name, headquarterName, sectors[{articleCode,name}], addresses[{addressId, addressLine, postalCode, countryName, cityName, districtName, neighborhoodName, latitude, longitude, placeId}], primaryPhone, primaryEmail }`.
- `addresses` is never empty.
- `primaryPhone` and `primaryEmail` are nullable.

**Errors.** A merchant the map would not show answers **404 `UniRefund.CRMService:029003`**.

**Directions.** The docblock gives the directions link: `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}&destination_place_id={placeId}`.

### Removed

- `public/merchants/viewport` and `public/customs/viewport`, with their DTOs.
- The `Customs` value of `MapLayer`.

The surviving `public/refund-points/viewport` and `public/exit-points/viewport` are not used.

## Section 1: data

**`packages/actions/unirefund/CRMService/actions.ts`**
- **Removed:**
  - `getPublicMerchantsViewportApi`, `getPublicCustomsViewportApi` and `getPublicRefundPointsViewportApi`. The first two already fail type-check, and only `/explore` uses them.
  - `EXPLORE_COUNTRY_TENANT` and its pinned client.
- **Added:** `getPublicMapViewportApi(data)` and `getPublicMerchantDetailApi(id)`.
  - Both use the public client **without** `__tenant`.
  - Both **return** `structuredResponse` or `structuredError` rather than throwing. This deviates from the repo's GET pattern on purpose. They are called from client components, where a thrown server-action error loses its code in production, and the UI must tell `029001` and `029003` apart.

**Pure modules with `node:test` tests**, under `apps/ssr/src/utils/explore/`:

`viewport.ts` (rewritten)
- **Layer keys.** `MapLayerKey = "merchants" | "refundPoints" | "exitPoints"`, mapped to and from the API's `Merchant | RefundPoint | ExitPoint`. Unknown layers are dropped.
- **`toMapViewportQuery(bounds, active, sector?)`.** Returns `null` when no layer is active, since an empty list means every layer to the server. `isViewportSpanValid` (≤ 180°) is kept.
- **`normalizeMapViewport(dto)`.** Returns `{ clustered, pins, clusters, totalCount }`:
  - names and address lines are trimmed;
  - entries without coordinates are dropped;
  - a clustered answer carries no pins, and an unclustered one carries no clusters.
- **Error kinds.** `mapErrorKind(code)` returns `unserved` for 029001, `span` for 029002, and `failed` otherwise. `merchantErrorKind(code)` returns `notFound` for 029003 and `failed` otherwise.

`places.ts` (new)
- **`distanceMeters(a, b)`.** Haversine distance.
- **`formatDistance(meters, lang)`.**
  - Under 1 km, `Intl` rounds to 10 m and uses the meter unit.
  - From 1 km, it uses one decimal and the kilometer unit.
- **`sortPlaces(pins, origin, lang)`.** Nearest first when there is an origin, otherwise by name using `localeCompare(lang)`. Ties break by id.
- **`matchStores(pins, query, lang, limit = 5)`.**
  - Matching is case- and diacritic-insensitive, using `toLocaleLowerCase(lang)` and NFD with the combining marks stripped.
  - It checks the pin name and the headquarter name.
  - Prefix matches come before infix matches.
- **`clusterSize(count)`.** `<10` → 36 px, `<100` → 44 px, `<1000` → 52 px, otherwise 60 px.
- **`compactCount(count, lang)`.** `Intl` compact notation: 1.2k, 1,2 B.

`merchant.ts` (new)
- **`pickAddress(detail, addressId)`.** The tapped address, or the first.
- **`addressLines(address)`.** `[addressLine, "neighbourhood, district, city"]`, with empty parts dropped.
- **`directionsUrls(address)`.**
  - Google Maps uses `destination_place_id` when there is a place id, and the coordinates alone otherwise.
  - Apple Maps is also returned.
- **`telHref(phone)`.** Keeps the digits and a leading `+`.

**Hooks.** These follow the existing "derive status during render" pattern, with no setState in effects.
- **`use-map-viewport.ts`** replaces `use-viewport-layer.ts`.
  - It makes one request per settled map move, with today's debounce.
  - Status is `loading | ready | error | unserved`.
  - The last drawn result is kept on failure.
  - With no active layer it is an empty `ready` and sends no request.
- **`use-merchant-detail.ts`.**
  - Status is `loading | ready | notFound | error`, plus `retry()`.
  - It answers per id, so a stale answer never lands on another merchant.

**Sector.**
- `deriveSectorOptions`, `retainSectorOptions` and `mergeSelectedSector`, their tests, and the page's sector state are removed. Pins no longer carry sectors.
- `sector-sheet.tsx` stays for the follow-up. The button is not rendered.

## Section 2: layout, list and selection

**Selection state on the page.**
- It holds `selected: { id, layer, addressId } | null` and `userLocation`.
- **Selecting from the list or a store suggestion** sets `selected`, flies the map to the pin and opens the detail.
- **Tapping a pin** sets `selected` and opens the detail, without re-flying.
- **Closing or going back** clears it.
- **If a later viewport answer no longer contains the selected pin,** the detail stays open (it holds the pin's data) and the highlight simply disappears.

**Wide screens (`lg`, ≥ 1024 px).** `/explore` splits in two.
- **Left panel:** a `w-[380px]` full-height panel (`bg-card`, `border-r`).
  - **Results view** shows a header and the list.
    - **Header title:** "Places in this area".
    - **Status line under the title,** by state:

      | State | Status line |
      | --- | --- |
      | Pins | "{0} places" |
      | Clustered | "{0} places here. Zoom in to see them." |
      | Empty | "No places in this area" |
      | Unserved | the unserved message |

    - **"Nearest first"** is added to the status line when there is a location.
  - **Detail view** replaces the results view, with a back button to the list.
- **Map:** it fills the rest of the screen. The search bar, the control chain and the island stay over it.

**Phones and tablets (< 1024 px).**
- The full-screen map stays as today.
- The control chain gains a **List** button (`list-outline`, labelled "List"). It opens a page-width `Drawer` titled "Places in this area", holding the same list, status line and states.
- **Tapping a row** closes the list sheet, flies the map to the pin and opens the detail sheet.
- **Tapping a pin** opens the detail sheet directly.

**The list (`places-list.tsx`)** is shared by the panel and the sheet. Each row shows:
- the layer's pin tile, with the same icon and colour as the map;
- the name;
- the headquarter (merchants only), in muted text;
- the address line;
- the distance on the right, once there is a location.

Rows are sorted with `sortPlaces`. The selected row is highlighted. Rows are buttons with the test id `explore-place-row-{id}`.

**Locate (Mavi's "find the nearest").**
- On success, today's Locate button stores `userLocation` and flies the map there.
- The list then sorts nearest-first and shows distances.
- On failure, behaviour is unchanged: the localized toast.

## Section 3: the map, search and detail

**Layers sheet.**
- Rows: **Merchants** (on by default), **Refund points** and **Exit points**.
- Exit points take the old customs look: an amber `bg-warning` pin with the building icon.
- `LAYER_ORDER`, `DEFAULT_LAYERS`, `toggleLayer` and `LAYER_PINS` move to the new keys. `toggleLayer` no longer touches a sector.

**Pins.**
- Per layer, as today.
- The **selected** pin renders larger, with a white ring, above the others.
- A merchant pin's accessible name includes its headquarter.

**Clusters.**
- One cross-layer bubble per cluster: the app's red bubble with a white border.
- Its size comes from `clusterSize`, and its label from `compactCount`.
- Its accessible name is "{0} places".
- Tapping it zooms in by 3 around it, as today.
- The per-layer cluster type and test ids go. The single test id is `explore-cluster`.

**Banners over the map.**
- Failed: today's amber "Places could not be loaded for this area."
- Unserved: a new amber banner, "No Unirefund places in this area. Move the map to a country we serve."

**Search (Global Blue's suggestions).** The dropdown shows two groups:
- **Stores:** up to 5 `matchStores` hits from the currently loaded pins, each with its layer tile, name and address. Picking one selects it.
- **Places:** Photon results, as today. Picking one flies the map there.

A query with neither shows today's "no results".

**Detail (`place-detail.tsx`).** It is shared by the wide-screen panel and the phone sheet (`place-sheet.tsx` becomes its `Drawer` wrapper). It shows:
- **Immediately,** from the pin: the layer tile, the name, "Part of {0}" when there is a headquarter, and the address line.
- **For merchants, once the detail loads:**
  - sector badges;
  - the tapped address through `pickAddress` and `addressLines`, linked to Google Maps;
  - a phone row (a `tel:` link) and an e-mail row (a `mailto:` link), each only when present;
  - the distance when there is a location.
- **Actions:** a full-width primary **Get directions** button (Google Maps, using the place id when known), plus a secondary Apple Maps link.
- **Merchant states:**
  - **loading:** a skeleton below the pin data;
  - **notFound:** "This place is no longer on the map.";
  - **error:** "We couldn't load this place's details." plus **Try again**. The pin data stays.
- **Refund points and exit points** have no detail endpoint. They show the pin data, the distance and the two directions actions.

**Unchanged:**
- MapLibre and the OpenFreeMap style;
- the Photon place search;
- Locate and zoom;
- the island;
- the attribution placement;
- `/explore` staying public.

## Strings

These are new `SSRService` keys, in en and tr. Today's keys are reused where they fit, such as "Try again" and the existing directions label.

| Key | en | tr |
| --- | --- | --- |
| `Explore.Layer.ExitPoints` | Exit points | Çıkış noktaları |
| `Explore.Cluster.Places` | {0} places | {0} yer |
| `Explore.Unserved` | No Unirefund places in this area. Move the map to a country we serve. | Bu bölgede Unirefund noktası yok. Haritayı hizmet verdiğimiz bir ülkeye taşıyın. |
| `Explore.Results.Title` | Places in this area | Bu bölgedeki yerler |
| `Explore.Results.Clustered` | {0} places here. Zoom in to see them. | Burada {0} yer var. Görmek için yakınlaştırın. |
| `Explore.Results.Empty` | No places in this area | Bu bölgede yer yok |
| `Explore.Results.Nearest` | Nearest first | En yakın önce |
| `Explore.List` | List | Liste |
| `Explore.Search.Stores` | Stores | Mağazalar |
| `Explore.Search.Places` | Places | Yerler |
| `Explore.Place.PartOf` | Part of {0} | {0} bünyesinde |
| `Explore.Place.NotFound` | This place is no longer on the map. | Bu yer artık haritada değil. |
| `Explore.Place.LoadFailed` | We couldn't load this place's details. | Bu yerin ayrıntıları yüklenemedi. |
| `Explore.Place.Phone` | Phone | Telefon |
| `Explore.Place.Email` | E-mail | E-posta |
| `Explore.Place.GetDirections` | Get directions | Yol tarifi al |

Keys left unread, such as the customs layer, are listed in the PR and not removed.

## Grants

Both endpoints are anonymous, and `/explore` stays public.

## Testing

**Gates.** Re-measure each baseline first.
- `pnpm --filter ssr test:unit`, plus the new suites.
- `pnpm --filter ssr type-check` must report 0.
- `pnpm --filter ssr lint` must report 0 errors.
- `pnpm --filter web type-check` must hold its baseline.
- `pnpm --filter ssr build`, with no dev server running on the checkout.

**Manual pass** on dev at 375 px and 1280 px, over Istanbul (dev has merchant pins there):
- **List:**
  - the list matches the pins;
  - a row selects its pin and opens the detail;
  - a pin selects its row;
  - back returns to the list.
- **Search:** a store suggestion selects the store, and a place suggestion flies the map.
- **Locate:** it sorts the list and shows distances. Use a mocked position in Chromium.
- **Merchant detail:** it shows the headquarter, sectors, address, phone and e-mail, and Get directions opens Google Maps.
- **Clusters:** a zoomed-out window crossing the threshold shows sized bubbles and the clustered status line. If dev data never crosses the threshold, this is recorded as not verified.
- **Unserved:** open sea shows the unserved banner and status.
- **No layers:** turning every layer off sends no request.

The detail's 404 path is covered by unit tests only; it is noted as not verified in the browser.

## Delivery

- **Branch** `feat/map-improvement` in `C:\unirefund\web-app`.
- **First commit:** the user's regenerated SDK, as it stands.
- **Then** a subagent-driven build with a final review, and **one PR into `main`**.

**Risk.** The SDK regeneration also changed `ContractService` and `DeviceService`. If that breaks `apps/web` or `apps/ssr` type-check outside the map, the plan's first task reports it before any map work starts. It is not fixed silently.

**super-app** comes after the user approves the web result:
- the same design without the wide-screen panel, so the List button and sheet plus the detail sheet;
- on its own `feat/map-improvement`, which already holds the regenerated SDK;
- with its own plan.

**Backend asks** (listed in the PR):
1. A public sector-list endpoint, to bring back the sector filter.
2. A public merchant-name search, so search reaches beyond the loaded window.
3. A paged list for a clustered window, so the list works when zoomed out.

## Out of scope

- Website, opening hours, photos, promotion badges and a km/mi switch, which the DTOs don't carry.
- A merchant's other addresses in its detail.
- City or district dropdowns (Mavi's browse). Search and Locate cover that.
- The surviving per-layer viewport endpoints.
- Deleting the unused `sector-sheet.tsx` or customs strings.
- Any change to the map style.

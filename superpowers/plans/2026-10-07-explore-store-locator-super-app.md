# Explore v2 in super-app: Store Locator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give super-app's Explore tab the store locator that shipped on the web (unirefund-web #321): the CRM's single map viewport, Exit points, sized clusters, a List sheet, a merchant detail sheet, store search and locate-on-open. There is no wide-screen panel.

**Architecture:** The pure rules live in `src/screens/shared/Explore/_lib/{map,places,merchant}.ts`, tested in jest's `node` project.
- **Data:** two hooks, `useMapViewport` and `useMerchantDetail`, call two new actions. The actions throw the SDK's `ApiError`, as every super-app action does. The hooks read the backend code from `error.body.error.code`.
- **Screen:** `ExploreScreen` owns all state and every hook that needs context. It passes plain labels and data into the gorhom sheets, because a hook inside a `<BottomSheet>` child loses its context.

**Tech Stack:**
- Expo 54, React Native 0.81, React 19, Expo Router, NativeWind 4;
- `@maplibre/maplibre-react-native` 11.4, `@gorhom/bottom-sheet` 5, `expo-location`;
- jest with the `node` and `router` projects.

**Spec:** `C:\unirefund\docs\superpowers\specs\2026-10-07-explore-map-viewport-design.md` (docs `c3a4649`). Its Delivery section sets the scope: "the same design without the wide-screen panel, so the List button and sheet plus the detail sheet; on its own `feat/map-improvement`, which already holds the regenerated SDK; with its own plan."

**Web reference:** unirefund-web `feat/map-improvement` (PR #321), files `apps/ssr/src/utils/explore/{map,places,merchant}.ts` and `apps/ssr/src/app/[lang]/(public)/explore/**`. This plan ports their behaviour, including every fix from the web reviews.

## Global Constraints

**Backend contract**
- **Endpoints:** `GET /api/crm-service/public/map/viewport` and `GET /api/crm-service/public/merchants/{id}`.
- **No country tenant and no bearer token** on either call. The backend resolves the country from the window's centre.
- **Map query:** `south`, `north`, `west`, `east`, `layers[]` (from `Merchant`, `RefundPoint`, `ExitPoint`) and an optional `sector`. An omitted or empty `layers` means **every** layer, so turning every layer off must send no request.
- **Map response:** `{ clustered, pins, clusters, totalCount }`. Clusters span every layer and carry no identity.
- **Error codes:**
  - `UniRefund.CRMService:029001`: area not served;
  - `029002`: window spans more than 180°;
  - `029003` (or a 404): merchant not shown.

**Map**
- **Layers:** Merchants (on by default), Refund points and Exit points. Exit points use `bg-warning` with `business-outline`, the old customs look.
- **Control chain:** `BlobRow` `[2, 1, 2]`: [Layers, List] · [Locate] · [Zoom out, Zoom in]. List takes the sector button's slot. The sector sheet and `mergeSelectedSector` stay; the button is not rendered.
- **Pins:**
  - Tapping a pin selects it and opens the detail sheet, without moving the camera.
  - The selected pin is drawn larger, with a white ring, on top of the others.
  - A merchant pin's accessible name includes its headquarter.
- **Clusters:**
  - One cross-layer bubble per cluster, sized 36/44/52/60 by count.
  - Tapping it zooms in by 3 around it.
  - Its accessible name is "{count} places" ("1 place" for one).
- **Banners over the map:**
  - failed: `MobileApp.Explore.Error`;
  - unserved: the new `MobileApp.Explore.Unserved`.
  - Each keeps showing while the next request is in flight.

**List and detail**
- **List sheet:** title "Places in this area", a status line, and the rows (layer tile, name, headquarter, address, and the distance once the location is known). Rows are sorted nearest first with a location, otherwise by name.
- **Status line:**

  | State | Text |
  | --- | --- |
  | Loading (also before the first window) | "Loading places…" |
  | Unserved | the unserved message |
  | Failed with no pins | `Explore.Error` |
  | Clustered | "{count} places here. Zoom in to see them." |
  | Empty | "No places in this area." |
  | Pins | "{count} places", or "1 place" |

  Pins plus a known location adds " · Nearest first".
- **Picking a row or a store suggestion:**
  - it closes the list sheet and opens the detail sheet;
  - the camera flies to the pin with bottom padding of half the screen, so the pin lands above the sheet.
- **Detail sheet:**
  - **Immediately, from the pin:** the layer tile, name, "Part of {name}" when there is a headquarter, the address line, and the distance.
  - **For merchants, once the detail loads:** sector badges, the tapped address (`pickAddress`/`addressLines`, opening Google Maps), and a phone row and an e-mail row when present.
  - **Merchant states:** loading (spinner), not found, and failed with Try again.
  - **Actions:** a primary Get directions (Google Maps, using the place id when known) and an Apple Maps link.
  - **Closing:** the selection and highlight clear when the sheet finishes closing (`onDismiss`).

**Search**
- Two groups: Stores (up to 5 `matchStores` hits among the loaded pins; picking one selects it) and Places (Photon, as before; picking one flies there).
- A query with neither shows the existing empty row.

**Location**
- **Locate on open:** once per mount, when MapLibre reports the map loaded (`onDidFinishLoadingMap`), call `getCurrentLocation()` raced against a 10 s timeout.
  - **Granted:** store the position and jump to it at city zoom (`max(current, 12)`), unless the traveller has already moved the map.
  - **Any failure:** nothing visible.
- **What counts as moving the map:** a gesture (`onRegionWillChange` with `userInteraction`), the zoom buttons, a cluster tap, any pin, row or store selection, a Photon pick, or Locate.
- **Locate button:** as today, plus it stores the position, and it flies at zoom 15.

**Unchanged:** MapLibre with the OpenFreeMap Liberty style, Photon place search, the tab island, the hand-drawn attribution, and the Explore route.

**Repo rules** (`super-app/AGENTS.md`, `.claude/rules/*`)
- **Components:** use `@/components/rnr` (`Text` variants and tones, `Button` with `action`, `Badge`) and `@/components/Ionicons`.
- **Colours:** semantic tokens only. `src/components/rnr/__tests__/tokens.test.ts` rejects default-palette classes and hex, and it reads tracked files only, so `git add` new files before trusting it.
- **No style features after first render:** a `className` that varies after mount may only swap a colour token, never add or remove a style feature (shadow, animation, transition, pseudo-class, CSS variable). Breaking this triggers the NativeWind cssInterop crash.
- **Sizes that change at runtime go through `style`.** Do not use `Skeleton` (it uses `animate-pulse`); loading uses `ActivityIndicator`.
- **No context hooks inside `<BottomSheet>` children.** The sheet host passes labels and values down.
- **Tests:** anything that renders, including a `renderHook` suite, is named `*.router.test.tsx`/`.ts`. Pure tests are `*.test.ts` in the `node` project and must not import `react-native`.
- **`Intl` on Hermes:** use only plain `Intl.NumberFormat` (with or without fraction digits), which the app already uses on device. **Do not** use `style: "unit"` or `notation: "compact"`, and do not use `String.prototype.normalize`.
- **Comments are rare.** Keep the few in this plan's code and add none.

**Shared checkout:** `C:\unirefund\super-app` may host other agent sessions.
- Never run `git reset --hard`, `git stash`, `git checkout --`, `git add -A` or `git add .`. Stage by path.
- Never push.
- Do not start Metro or run a native build. The user runs builds.

**Commits:** use a quoted heredoc (`git commit -F - <<'EOF'`). The trailer is exactly `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

**Gates, every task**, run from `C:\unirefund\super-app`:
- `npm run typecheck`
- `npm test`
- `npm run lint`

Task 0 records the baselines; no task may add an error, failure or lint error. Run `npm run init` first whenever a task changes `src/localization/resources/*.json`.

## Plan decisions

1. **Errors come from the thrown `ApiError`.** super-app actions throw and have no `structuredError`. `apiErrorInfo(error)` in `map.ts` reads `{ code, status }` from `ApiError.body.error.code` and `ApiError.status`. The web-utils change is not needed here.
2. **Formatting is Hermes-safe.**
   - `formatDistance` builds "850 m" or "2.1 km" from a plain `Intl.NumberFormat` plus the unit.
   - A cluster bubble shows the full localized count below 10 000. From 10 000 it shows thousands through the new key `Explore.Cluster.Thousands` ("{count}K" / "{count}B").
   - `matchStores` folds with `toLocaleLowerCase` plus a fixed diacritic table, not `normalize`.
3. **The selected pin is a separate `ViewAnnotation`, rendered last with its own key.** Android draws an annotation's children into a bitmap, so a changed child may not repaint; a new key forces a fresh annotation. Its size and ring come from `style`.
4. **Raising a picked pin above the sheet** uses the camera's `padding.bottom` (half the frame height from `useSafeAreaFrame`), not an offset.
5. **The list sheet** follows `NotificationsSheet`: `snapPoints={["70%"]}` and `BottomSheetScrollView`. The detail sheet keeps dynamic sizing with `BottomSheetView`.
6. **No wide-screen panel and no list-row highlight.** On a phone, picking a row closes the list.
7. **Strings** go into `src/localization/resources/{en-US,tr-TR}.json` under `Explore`; `npm run init` merges them under `MobileApp`. The spec's `Results.Empty` reuses `Explore.Empty`. Back is not needed: the sheet closes by gesture and backdrop. Try again gets its own `Explore.TryAgain`, because `Common` has none.
8. **`sectors.ts` keeps only `SectorOption` and `mergeSelectedSector`** (used by the kept `SectorSheet`). `layers.ts`, `normalizeViewport.ts`, `viewportRequest.ts`, `directions.ts` and `useViewportLayer.ts` go, with their tests.

## Review Focus

1. **A merchant with several addresses:** keys, the selected pin and the detail address follow the **tapped** address. *Pinned in Task 1* (pin keys per address, `pickAddress` by `addressId`).
2. **Every layer off** sends no request and draws nothing. *Pinned in Task 1* (`toMapViewportQuery` returns `null`) and *Task 3* (the hook returns the empty viewport for `null`).
3. **Unserved clears; failed keeps.**
   - An unserved answer clears the pins.
   - A failed answer keeps the last ones, and a just-disabled layer's pins disappear even then.
   - *Pinned in Task 3* (the hook) and *Task 4* (the screen filters pins by active layer).
4. **Locate-on-open after the traveller moved** must not move the camera. *Pinned in Task 1* (`autoLocateCenter`) and *Task 5* (the `userMovedRef` wiring, tested with a mocked camera).
5. **Turkish search:** "istanbul" finds "İstanbul", "arti" finds "Artı", "cicek" finds "Çiçek", with no `normalize`. *Pinned in Task 1.*

---

### Task 0 (controller): commit the SDK and measure baselines

- [ ] **Commit the regenerated SDK** in `C:\unirefund\super-app` on `feat/map-improvement`. Check `git status` first: only `src/saas/**` may be staged.

  ```bash
  git add src/saas
  git commit -F - <<'EOF'
  chore(saas): regenerate the service clients

  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  EOF
  ```

- [ ] **Regenerate the language bundles** with `npm run init`. It fetches dev's resources, and the local bundle predates #68's keys.

- [ ] **Measure `npm run typecheck`, `npm test` and `npm run lint`** and record exact counts and errors in the ledger.
  - The removed viewport types should fail `tsc` in `src/actions/CRMService/actions.ts`, `useViewportLayer.ts` and `__tests__/viewport.test.ts`.
  - **Report any other new error to the user before Task 1.**

---

### Task 1: The store-locator rules (pure, tested)

**Files:**
- Create in `src/screens/shared/Explore/_lib/`: `map.ts`, `places.ts`, `merchant.ts`.
- Create in `src/screens/shared/Explore/_lib/__tests__/`: `map.test.ts`, `places.test.ts`, `merchant.test.ts`.

**Interfaces (produces):**

From `map.ts`:
- **Layers:**
  - `type MapLayerKey = "merchants" | "refundPoints" | "exitPoints"`;
  - `LAYER_ORDER`;
  - `DEFAULT_LAYERS`;
  - `toggleLayer(active, layer)`.
- **The window and query:**
  - `type Bounds`;
  - `toBounds(bounds: LngLatBounds)`;
  - `isSpanValid(bounds)`;
  - `type MapViewportQuery`;
  - `toMapViewportQuery(bounds | null, active, sector?)`.
- **The response:**
  - `type MapPin`;
  - `type MapCluster`;
  - `type MapViewport`;
  - `EMPTY_VIEWPORT`;
  - `normalizeMapViewport(dto)`.
- **Errors:**
  - `apiErrorInfo(error): { code: string | null; status: number | null }`;
  - `mapErrorKind(code)`;
  - `merchantErrorKind(code, status)`.
- **Status and locate:**
  - `type ResultsStatus` (`loading | unserved | error | clustered | empty | count`);
  - `resultsStatus({ status, viewport, anyLayer })`;
  - `autoLocateCenter(position, userMoved)`.

From `places.ts`:
- `type LatLng`;
- `distanceMeters`;
- `formatDistance(meters, locale)`;
- `sortPlaces(pins, origin, locale)`;
- `matchStores(pins, query, locale, limit = 5)`;
- `clusterSize(count)`;
- `formatClusterCount(count, locale, thousandsTemplate)`.

From `merchant.ts`:
- `pickAddress`;
- `addressLines`;
- `directionsUrls({ latitude, longitude, placeId? })`;
- `telHref`.

- [ ] **Step 1: Write the failing tests.**

`_lib/__tests__/map.test.ts`:

```ts
import {
  apiErrorInfo,
  autoLocateCenter,
  DEFAULT_LAYERS,
  EMPTY_VIEWPORT,
  isSpanValid,
  mapErrorKind,
  merchantErrorKind,
  normalizeMapViewport,
  resultsStatus,
  toBounds,
  toggleLayer,
  toMapViewportQuery,
} from "../map";

const BOUNDS = { south: 40.8, north: 41.3, west: 28.5, east: 29.4 };
const ALL = { merchants: true, refundPoints: true, exitPoints: true };
const NONE = { merchants: false, refundPoints: false, exitPoints: false };
const PIN = {
  layer: "Merchant" as const,
  id: "m1",
  name: "  İstanbul MarmaraPark ",
  latitude: 41.0,
  longitude: 28.6,
  addressId: "a1",
  addressLine: " Güzelyurt Mah. ",
  headquarterName: " Artı Bilgisayar ",
};

describe("layers", () => {
  it("starts with only merchants on", () => {
    expect(DEFAULT_LAYERS).toEqual({ merchants: true, refundPoints: false, exitPoints: false });
  });

  it("toggles one layer and leaves the others", () => {
    expect(toggleLayer(DEFAULT_LAYERS, "exitPoints")).toEqual({
      merchants: true,
      refundPoints: false,
      exitPoints: true,
    });
  });
});

describe("toBounds and isSpanValid", () => {
  it("names the edges of MapLibre's west-south-east-north bounds", () => {
    expect(toBounds([28.5, 40.8, 29.4, 41.3])).toEqual(BOUNDS);
  });

  it("accepts exactly 180 degrees and rejects more", () => {
    expect(isSpanValid({ south: -90, north: 90, west: 0, east: 180 })).toBe(true);
    expect(isSpanValid({ south: 0, north: 10, west: -180, east: 180 })).toBe(false);
  });
});

describe("toMapViewportQuery", () => {
  it("sends the active layers by their API names in a stable order", () => {
    expect(toMapViewportQuery(BOUNDS, ALL)).toEqual({
      ...BOUNDS,
      layers: ["Merchant", "RefundPoint", "ExitPoint"],
    });
  });

  it("is null when no layer is active, because an empty list means every layer", () => {
    expect(toMapViewportQuery(BOUNDS, NONE)).toBeNull();
  });

  it("is null without a window", () => {
    expect(toMapViewportQuery(null, ALL)).toBeNull();
  });

  it("adds the sector only when one is given", () => {
    expect(toMapViewportQuery(BOUNDS, DEFAULT_LAYERS, "SHOES")).toEqual({
      ...BOUNDS,
      layers: ["Merchant"],
      sector: "SHOES",
    });
  });
});

describe("normalizeMapViewport", () => {
  it("maps pins to layer keys, trims text and keys each address separately", () => {
    const result = normalizeMapViewport({
      clustered: false,
      pins: [PIN, { ...PIN, addressId: "a2", latitude: 41.1 }],
      totalCount: 2,
    });
    expect(result.pins.map((pin) => pin.key)).toEqual(["merchants:m1:a1", "merchants:m1:a2"]);
    expect(result.pins[0]).toMatchObject({
      name: "İstanbul MarmaraPark",
      addressLine: "Güzelyurt Mah.",
      headquarterName: "Artı Bilgisayar",
    });
    expect(result.totalCount).toBe(2);
  });

  it("maps a blank headquarter and a missing address id to null", () => {
    const result = normalizeMapViewport({ pins: [{ ...PIN, addressId: null, headquarterName: "  " }] });
    expect(result.pins[0]).toMatchObject({ addressId: null, headquarterName: null, key: "merchants:m1:" });
  });

  it("drops pins without coordinates, an id or a known layer", () => {
    const result = normalizeMapViewport({
      clustered: false,
      pins: [PIN, { ...PIN, latitude: undefined }, { ...PIN, id: undefined }, { ...PIN, layer: "Customs" as never }],
    });
    expect(result.pins).toHaveLength(1);
  });

  it("keeps only clusters when the answer is clustered", () => {
    const result = normalizeMapViewport({
      clustered: true,
      pins: [PIN],
      clusters: [
        { count: 12, latitude: 41, longitude: 29 },
        { count: 0, latitude: 40, longitude: 28 },
        { count: 3 },
      ],
      totalCount: 15,
    });
    expect(result.pins).toEqual([]);
    expect(result.clusters.map((cluster) => cluster.count)).toEqual([12]);
    expect(result.totalCount).toBe(15);
  });

  it("treats a missing answer as empty", () => {
    expect(normalizeMapViewport(undefined)).toEqual(EMPTY_VIEWPORT);
  });
});

describe("error kinds", () => {
  it("reads the code and status from a thrown ApiError", () => {
    const error = Object.assign(new Error("Bad Request"), {
      status: 400,
      body: { error: { code: "UniRefund.CRMService:029001" } },
    });
    expect(apiErrorInfo(error)).toEqual({ code: "UniRefund.CRMService:029001", status: 400 });
  });

  it("reads nothing from a plain error or a non-object", () => {
    expect(apiErrorInfo(new TypeError("Network request failed"))).toEqual({ code: null, status: null });
    expect(apiErrorInfo("boom")).toEqual({ code: null, status: null });
  });

  it("reads 029001 as unserved and 029002 as a too-wide window", () => {
    expect(mapErrorKind("UniRefund.CRMService:029001")).toBe("unserved");
    expect(mapErrorKind("UniRefund.CRMService:029002")).toBe("span");
    expect(mapErrorKind(null)).toBe("failed");
  });

  it("reads 029003 or a 404 as a merchant that is no longer on the map", () => {
    expect(merchantErrorKind("UniRefund.CRMService:029003", 404)).toBe("notFound");
    expect(merchantErrorKind(null, 404)).toBe("notFound");
    expect(merchantErrorKind(null, 500)).toBe("failed");
  });
});

describe("resultsStatus", () => {
  const pins = normalizeMapViewport({ pins: [PIN] });

  it("is empty when no layer is active", () => {
    expect(resultsStatus({ status: "ready", viewport: pins, anyLayer: false })).toEqual({ kind: "empty" });
  });

  it("reports an unserved area", () => {
    expect(resultsStatus({ status: "unserved", viewport: EMPTY_VIEWPORT, anyLayer: true })).toEqual({
      kind: "unserved",
    });
  });

  it("reports a clustered window with its total", () => {
    const clustered = normalizeMapViewport({
      clustered: true,
      clusters: [{ count: 40, latitude: 41, longitude: 29 }],
      totalCount: 40,
    });
    expect(resultsStatus({ status: "ready", viewport: clustered, anyLayer: true })).toEqual({
      kind: "clustered",
      count: 40,
    });
  });

  it("counts kept pins after a failed pan, and reports a failure with none", () => {
    expect(resultsStatus({ status: "error", viewport: pins, anyLayer: true })).toEqual({ kind: "count", count: 1 });
    expect(resultsStatus({ status: "error", viewport: EMPTY_VIEWPORT, anyLayer: true })).toEqual({ kind: "error" });
  });

  it("is loading before the first pins arrive, then empty", () => {
    expect(resultsStatus({ status: "loading", viewport: EMPTY_VIEWPORT, anyLayer: true })).toEqual({ kind: "loading" });
    expect(resultsStatus({ status: "ready", viewport: EMPTY_VIEWPORT, anyLayer: true })).toEqual({ kind: "empty" });
  });
});

describe("autoLocateCenter", () => {
  it("returns the position as a map centre when the traveller has not moved the map", () => {
    expect(autoLocateCenter({ latitude: 41, longitude: 29 }, false)).toEqual([29, 41]);
  });

  it("leaves a map the traveller already moved, and does nothing without a position", () => {
    expect(autoLocateCenter({ latitude: 41, longitude: 29 }, true)).toBeNull();
    expect(autoLocateCenter(null, false)).toBeNull();
  });
});
```

`_lib/__tests__/places.test.ts`:

```ts
import type { MapPin } from "../map";
import {
  clusterSize,
  distanceMeters,
  formatClusterCount,
  formatDistance,
  matchStores,
  sortPlaces,
} from "../places";

function pin(key: string, name: string, latitude = 41, longitude = 29, headquarterName: string | null = null): MapPin {
  return { key, layer: "merchants", id: key, addressId: null, name, addressLine: "", headquarterName, latitude, longitude };
}

describe("distanceMeters", () => {
  it("is zero for the same point", () => {
    expect(distanceMeters({ latitude: 41, longitude: 29 }, { latitude: 41, longitude: 29 })).toBe(0);
  });

  it("measures Istanbul to Ankara at about 350 km", () => {
    const distance = distanceMeters({ latitude: 41.0082, longitude: 28.9784 }, { latitude: 39.9334, longitude: 32.8597 });
    expect(distance).toBeGreaterThan(345_000);
    expect(distance).toBeLessThan(355_000);
  });
});

describe("formatDistance", () => {
  it("rounds short distances to 10 m, never below 10 m", () => {
    expect(formatDistance(847, "en-US")).toBe("850 m");
    expect(formatDistance(3, "en-US")).toBe("10 m");
  });

  it("switches to kilometres with one decimal from 1 km", () => {
    expect(formatDistance(2140, "en-US")).toBe("2.1 km");
    expect(formatDistance(996, "en-US")).toBe("1.0 km");
    expect(formatDistance(12_345, "en-US")).toBe("12.3 km");
  });

  it("uses the locale's decimal separator", () => {
    expect(formatDistance(2140, "tr-TR")).toBe("2,1 km");
  });
});

describe("sortPlaces", () => {
  const near = pin("near", "Zeta", 41.01, 29.0);
  const far = pin("far", "Alfa", 41.5, 29.5);

  it("puts the nearest first when there is an origin", () => {
    expect(sortPlaces([far, near], { latitude: 41, longitude: 29 }, "en-US").map((p) => p.key)).toEqual(["near", "far"]);
  });

  it("sorts by name in the locale without an origin", () => {
    const list = [pin("d", "Deniz"), pin("cc", "Çiçek"), pin("c", "Cadde")];
    expect(sortPlaces(list, null, "tr-TR").map((p) => p.key)).toEqual(["c", "cc", "d"]);
  });

  it("does not reorder its input", () => {
    const input = [far, near];
    sortPlaces(input, { latitude: 41, longitude: 29 }, "en-US");
    expect(input.map((p) => p.key)).toEqual(["far", "near"]);
  });
});

describe("matchStores", () => {
  const stores = [
    pin("1", "İstanbul MarmaraPark", 41, 29, "Artı Bilgisayar"),
    pin("2", "Çiçek Pasajı"),
    pin("3", "Kumar Store"),
    pin("4", "Mavi Jeans"),
  ];

  it("matches regardless of case and Turkish letters", () => {
    expect(matchStores(stores, "istanbul", "tr-TR").map((p) => p.key)).toEqual(["1"]);
    expect(matchStores(stores, "ISTANBUL", "en-US").map((p) => p.key)).toEqual(["1"]);
    expect(matchStores(stores, "cicek", "en-US").map((p) => p.key)).toEqual(["2"]);
  });

  it("matches the headquarter name, folding the dotless i", () => {
    expect(matchStores(stores, "arti", "tr-TR").map((p) => p.key)).toEqual(["1"]);
  });

  it("puts word-prefix matches before matches inside a word", () => {
    expect(matchStores(stores, "ma", "en-US").map((p) => p.key)).toEqual(["1", "4", "3"]);
  });

  it("limits the results and ignores a blank query", () => {
    const many = Array.from({ length: 7 }, (_, i) => pin(String(i), `Shop ${i}`));
    expect(matchStores(many, "shop", "en-US")).toHaveLength(5);
    expect(matchStores(many, "shop", "en-US", 2)).toHaveLength(2);
    expect(matchStores(stores, "   ", "en-US")).toEqual([]);
  });
});

describe("clusterSize", () => {
  it("grows in four steps", () => {
    expect([1, 9, 10, 99, 100, 999, 1000, 50_000].map(clusterSize)).toEqual([36, 36, 44, 44, 52, 52, 60, 60]);
  });
});

describe("formatClusterCount", () => {
  it("shows the localized count below ten thousand", () => {
    expect(formatClusterCount(950, "en-US", "{count}K")).toBe("950");
    expect(formatClusterCount(1234, "en-US", "{count}K")).toBe("1,234");
    expect(formatClusterCount(1234, "tr-TR", "{count}B")).toBe("1.234");
  });

  it("shows whole thousands through the template from ten thousand", () => {
    expect(formatClusterCount(12_345, "en-US", "{count}K")).toBe("12K");
    expect(formatClusterCount(12_345, "tr-TR", "{count}B")).toBe("12B");
  });
});
```

`_lib/__tests__/merchant.test.ts`:

```ts
import { addressLines, directionsUrls, pickAddress, telHref } from "../merchant";

const A1 = {
  addressId: "a1",
  addressLine: "Bağdat Cd. No:5",
  neighborhoodName: "Caddebostan",
  districtName: "Kadıköy",
  cityName: "İstanbul",
  latitude: 40.96,
  longitude: 29.06,
  placeId: "ChIJ x",
};
const A2 = { ...A1, addressId: "a2", addressLine: "Moda Cd. 1" };

describe("pickAddress", () => {
  it("picks the tapped address, else the first, else null", () => {
    expect(pickAddress({ addresses: [A1, A2] }, "a2")?.addressId).toBe("a2");
    expect(pickAddress({ addresses: [A1, A2] }, "missing")?.addressId).toBe("a1");
    expect(pickAddress({ addresses: [A1, A2] }, null)?.addressId).toBe("a1");
    expect(pickAddress({ addresses: [] }, "a1")).toBeNull();
    expect(pickAddress({}, "a1")).toBeNull();
  });
});

describe("addressLines", () => {
  it("gives the street line, then neighbourhood, district and city", () => {
    expect(addressLines(A1)).toEqual(["Bağdat Cd. No:5", "Caddebostan, Kadıköy, İstanbul"]);
  });

  it("drops empty parts", () => {
    expect(
      addressLines({ addressLine: "  ", neighborhoodName: null, districtName: "Kadıköy", cityName: "İstanbul" }),
    ).toEqual(["Kadıköy, İstanbul"]);
    expect(addressLines({})).toEqual([]);
  });
});

describe("directionsUrls", () => {
  it("adds the place id to Google Maps when there is one", () => {
    const urls = directionsUrls({ latitude: 40.96, longitude: 29.06, placeId: "ChIJ x" });
    expect(urls.google).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=40.96,29.06&destination_place_id=ChIJ%20x",
    );
    expect(urls.apple).toBe("https://maps.apple.com/?daddr=40.96,29.06");
  });

  it("uses the coordinates alone without a place id", () => {
    expect(directionsUrls({ latitude: 1, longitude: 2 }).google).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=1,2",
    );
  });
});

describe("telHref", () => {
  it("keeps the digits and a leading plus", () => {
    expect(telHref("902121234567")).toBe("tel:902121234567");
    expect(telHref("+90 (212) 123 45 67")).toBe("tel:+902121234567");
  });

  it("is null without digits", () => {
    expect(telHref("")).toBeNull();
    expect(telHref("ext")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail.** Run `npx jest src/screens/shared/Explore/_lib`. Expected: the three new suites fail with "Cannot find module".

- [ ] **Step 3: Implement the three modules.**

`_lib/map.ts`:

```ts
import type { LngLatBounds } from "@maplibre/maplibre-react-native";
import type {
  UniRefund_CRMService_Map_MapLayer as ApiLayer,
  UniRefund_CRMService_Map_MapViewportDto as MapViewportDto,
} from "@/saas/CRMService";

export type MapLayerKey = "merchants" | "refundPoints" | "exitPoints";

export const LAYER_ORDER: MapLayerKey[] = ["merchants", "refundPoints", "exitPoints"];

export const DEFAULT_LAYERS: Record<MapLayerKey, boolean> = {
  merchants: true,
  refundPoints: false,
  exitPoints: false,
};

const API_LAYER: Record<MapLayerKey, ApiLayer> = {
  merchants: "Merchant",
  refundPoints: "RefundPoint",
  exitPoints: "ExitPoint",
};

const LAYER_KEY: Partial<Record<string, MapLayerKey>> = {
  Merchant: "merchants",
  RefundPoint: "refundPoints",
  ExitPoint: "exitPoints",
};

export function toggleLayer(
  active: Record<MapLayerKey, boolean>,
  layer: MapLayerKey,
): Record<MapLayerKey, boolean> {
  return { ...active, [layer]: !active[layer] };
}

export type Bounds = { south: number; north: number; west: number; east: number };

export function toBounds(bounds: LngLatBounds): Bounds {
  const [west, south, east, north] = bounds;
  return { south, north, west, east };
}

const MAX_SPAN_DEGREES = 180;

export function isSpanValid(bounds: Bounds): boolean {
  return bounds.north - bounds.south <= MAX_SPAN_DEGREES && bounds.east - bounds.west <= MAX_SPAN_DEGREES;
}

export type MapViewportQuery = Bounds & { layers: ApiLayer[]; sector?: string };

export function toMapViewportQuery(
  bounds: Bounds | null,
  active: Record<MapLayerKey, boolean>,
  sector?: string,
): MapViewportQuery | null {
  if (!bounds) return null;
  const layers = LAYER_ORDER.filter((layer) => active[layer]).map((layer) => API_LAYER[layer]);
  if (layers.length === 0) return null;
  return sector ? { ...bounds, layers, sector } : { ...bounds, layers };
}

export type MapPin = {
  key: string;
  layer: MapLayerKey;
  id: string;
  addressId: string | null;
  name: string;
  addressLine: string;
  headquarterName: string | null;
  latitude: number;
  longitude: number;
};

export type MapCluster = { key: string; count: number; latitude: number; longitude: number };

export type MapViewport = { clustered: boolean; pins: MapPin[]; clusters: MapCluster[]; totalCount: number };

export const EMPTY_VIEWPORT: MapViewport = { clustered: false, pins: [], clusters: [], totalCount: 0 };

export function normalizeMapViewport(dto: MapViewportDto | null | undefined): MapViewport {
  if (!dto) return EMPTY_VIEWPORT;
  const clustered = dto.clustered === true;
  const pins: MapPin[] = clustered
    ? []
    : (dto.pins ?? []).flatMap((pin) => {
        const layer = pin.layer ? LAYER_KEY[pin.layer] : undefined;
        if (!layer || !pin.id || pin.latitude === undefined || pin.longitude === undefined) return [];
        const addressId = pin.addressId ?? null;
        return [
          {
            key: `${layer}:${pin.id}:${addressId ?? ""}`,
            layer,
            id: pin.id,
            addressId,
            name: pin.name?.trim() ?? "",
            addressLine: pin.addressLine?.trim() ?? "",
            headquarterName: pin.headquarterName?.trim() || null,
            latitude: pin.latitude,
            longitude: pin.longitude,
          },
        ];
      });
  const clusters: MapCluster[] = clustered
    ? (dto.clusters ?? []).flatMap((cluster) =>
        !cluster.count || cluster.latitude === undefined || cluster.longitude === undefined
          ? []
          : [
              {
                key: `${cluster.latitude},${cluster.longitude}`,
                count: cluster.count,
                latitude: cluster.latitude,
                longitude: cluster.longitude,
              },
            ],
      )
    : [];
  return { clustered, pins, clusters, totalCount: dto.totalCount ?? pins.length };
}

export function apiErrorInfo(error: unknown): { code: string | null; status: number | null } {
  if (!error || typeof error !== "object") return { code: null, status: null };
  const { body, status } = error as { body?: unknown; status?: unknown };
  const code =
    body && typeof body === "object" ? (body as { error?: { code?: unknown } }).error?.code : undefined;
  return {
    code: typeof code === "string" && code ? code : null,
    status: typeof status === "number" ? status : null,
  };
}

const UNSERVED = "UniRefund.CRMService:029001";
const SPAN = "UniRefund.CRMService:029002";
const MERCHANT_NOT_SHOWN = "UniRefund.CRMService:029003";

export function mapErrorKind(code: string | null): "unserved" | "span" | "failed" {
  if (code === UNSERVED) return "unserved";
  if (code === SPAN) return "span";
  return "failed";
}

export function merchantErrorKind(code: string | null, status: number | null): "notFound" | "failed" {
  return code === MERCHANT_NOT_SHOWN || status === 404 ? "notFound" : "failed";
}

export type ResultsStatus =
  | { kind: "loading" }
  | { kind: "unserved" }
  | { kind: "error" }
  | { kind: "clustered"; count: number }
  | { kind: "empty" }
  | { kind: "count"; count: number };

export function resultsStatus({
  status,
  viewport,
  anyLayer,
}: {
  status: "loading" | "ready" | "error" | "unserved";
  viewport: MapViewport;
  anyLayer: boolean;
}): ResultsStatus {
  if (!anyLayer) return { kind: "empty" };
  if (status === "unserved") return { kind: "unserved" };
  if (viewport.clustered) return { kind: "clustered", count: viewport.totalCount };
  if (viewport.pins.length > 0) return { kind: "count", count: viewport.pins.length };
  if (status === "loading") return { kind: "loading" };
  if (status === "error") return { kind: "error" };
  return { kind: "empty" };
}

export function autoLocateCenter(
  position: { latitude: number; longitude: number } | null,
  userMoved: boolean,
): [number, number] | null {
  if (!position || userMoved) return null;
  return [position.longitude, position.latitude];
}
```

`_lib/places.ts`:

```ts
import type { MapPin } from "./map";

export type LatLng = { latitude: number; longitude: number };

const EARTH_RADIUS_METERS = 6_371_008.8;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(meters: number, locale: string): string {
  const rounded = Math.max(10, Math.round(meters / 10) * 10);
  if (rounded < 1000) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(rounded)} m`;
  }
  const kilometres = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(meters / 1000);
  return `${kilometres} km`;
}

export function sortPlaces(pins: MapPin[], origin: LatLng | null, locale: string): MapPin[] {
  const sorted = [...pins];
  if (origin) {
    sorted.sort(
      (a, b) => distanceMeters(origin, a) - distanceMeters(origin, b) || a.key.localeCompare(b.key),
    );
  } else {
    sorted.sort((a, b) => a.name.localeCompare(b.name, locale) || a.key.localeCompare(b.key));
  }
  return sorted;
}

const FOLD: Record<string, string> = {
  ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u",
  â: "a", á: "a", à: "a", ä: "a", ê: "e", é: "e", è: "e", ë: "e",
  î: "i", í: "i", ì: "i", ï: "i", ô: "o", ó: "o", ò: "o", û: "u", ú: "u", ù: "u", ñ: "n",
};

function fold(text: string, locale: string): string {
  return text
    .toLocaleLowerCase(locale)
    .replace(/\u0307/g, "")
    .replace(/[çğıöşüâáàäêéèëîíìïôóòûúùñ]/g, (letter) => FOLD[letter] ?? letter);
}

export function matchStores(pins: MapPin[], query: string, locale: string, limit = 5): MapPin[] {
  const needle = fold(query.trim(), locale);
  if (!needle) return [];
  const prefix: MapPin[] = [];
  const infix: MapPin[] = [];
  for (const pin of pins) {
    const fields = [pin.name, pin.headquarterName ?? ""].map((field) => fold(field, locale));
    if (fields.some((field) => field.split(/\s+/).some((word) => word.startsWith(needle)))) {
      prefix.push(pin);
    } else if (fields.some((field) => field.includes(needle))) {
      infix.push(pin);
    }
  }
  return [...prefix, ...infix].slice(0, limit);
}

export function clusterSize(count: number): number {
  if (count < 10) return 36;
  if (count < 100) return 44;
  if (count < 1000) return 52;
  return 60;
}

export function formatClusterCount(count: number, locale: string, thousandsTemplate: string): string {
  if (count < 10_000) return new Intl.NumberFormat(locale).format(count);
  const thousands = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
    Math.floor(count / 1000),
  );
  return thousandsTemplate.replace("{count}", thousands);
}
```

`_lib/merchant.ts`:

```ts
import type {
  UniRefund_CRMService_Merchants_MerchantPublicDetailDto as MerchantDetail,
  UniRefund_CRMService_Merchants_PublicMerchantAddressDto as MerchantAddress,
} from "@/saas/CRMService";

export function pickAddress(
  detail: Pick<MerchantDetail, "addresses">,
  addressId: string | null,
): MerchantAddress | null {
  const addresses = detail.addresses ?? [];
  return addresses.find((address) => addressId && address.addressId === addressId) ?? addresses[0] ?? null;
}

export function addressLines(
  address: Pick<MerchantAddress, "addressLine" | "neighborhoodName" | "districtName" | "cityName">,
): string[] {
  const street = address.addressLine?.trim();
  const area = [address.neighborhoodName, address.districtName, address.cityName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
  return [street, area].filter((line): line is string => Boolean(line));
}

export function directionsUrls({
  latitude,
  longitude,
  placeId,
}: {
  latitude: number;
  longitude: number;
  placeId?: string | null;
}): { google: string; apple: string } {
  const destination = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
  return {
    google: placeId ? `${destination}&destination_place_id=${encodeURIComponent(placeId)}` : destination,
    apple: `https://maps.apple.com/?daddr=${latitude},${longitude}`,
  };
}

export function telHref(phone: string): string | null {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  return `tel:${trimmed.startsWith("+") ? "+" : ""}${digits}`;
}
```

- [ ] **Step 4: Watch them pass.**
  1. Run `npx jest src/screens/shared/Explore/_lib`: all new tests pass.
  2. Run the three gates. `tsc` may show only the Task 0 baseline errors.
  3. Run `npm run format -- <the six files>`, or `npx prettier --write` on them, so they match `.prettierrc`.

- [ ] **Step 5: Commit.**

  ```bash
  git add src/screens/shared/Explore/_lib/map.ts src/screens/shared/Explore/_lib/places.ts src/screens/shared/Explore/_lib/merchant.ts src/screens/shared/Explore/_lib/__tests__/map.test.ts src/screens/shared/Explore/_lib/__tests__/places.test.ts src/screens/shared/Explore/_lib/__tests__/merchant.test.ts
  git commit -F - <<'EOF'
  feat(explore): add the store locator's map, place and merchant rules

  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  EOF
  ```

---

### Task 2: Strings

**Files:** modify `src/localization/resources/en-US.json` and `tr-TR.json`.

**Interfaces (produces):** these `t()` keys, all under `MobileApp.Explore.`:
- `Layer.ExitPoints`
- `Cluster.Places`, `Cluster.Place`, `Cluster.Thousands`
- `Unserved`
- `Results.Title`, `Results.Clustered`, `Results.Nearest`
- `List`
- `Search.Stores`, `Search.Places`
- `Place.PartOf`, `Place.NotFound`, `Place.LoadFailed`, `Place.Phone`, `Place.Email`, `Place.GetDirections`
- `TryAgain`

Placeholders are `{count}` and `{name}`, which `t(key, values)` interpolates.

- [ ] **Step 1: Edit both files with the Edit tool.** Never re-serialise them. Inside the `"Explore"` object:
  1. Add `"ExitPoints"` to `"Layer"`.
  2. Add `"Stores"` and `"Places"` to `"Search"`.
  3. Add the new objects and keys after `"Location": { … }`, keeping valid commas.

en-US:

```json
"Layer": { "Merchants": "Merchants", "Customs": "Customs", "RefundPoints": "Refund points", "ExitPoints": "Exit points" },
"Search": { "Placeholder": "Search for a place...", "Clear": "Clear search", "Stores": "Stores", "Places": "Places" },
"Cluster": { "Places": "{count} places", "Place": "1 place", "Thousands": "{count}K" },
"Unserved": "No Unirefund places in this area. Move the map to a country we serve.",
"Results": { "Title": "Places in this area", "Clustered": "{count} places here. Zoom in to see them.", "Nearest": "Nearest first" },
"List": "List",
"Place": {
  "PartOf": "Part of {name}",
  "NotFound": "This place is no longer on the map.",
  "LoadFailed": "We couldn't load this place's details.",
  "Phone": "Phone",
  "Email": "E-mail",
  "GetDirections": "Get directions"
},
"TryAgain": "Try again"
```

tr-TR:

```json
"Layer": { "Merchants": "…unchanged…", "Customs": "…unchanged…", "RefundPoints": "…unchanged…", "ExitPoints": "Çıkış noktaları" },
"Search": { "Placeholder": "…unchanged…", "Clear": "…unchanged…", "Stores": "Mağazalar", "Places": "Yerler" },
"Cluster": { "Places": "{count} yer", "Place": "1 yer", "Thousands": "{count}B" },
"Unserved": "Bu bölgede Unirefund noktası yok. Haritayı hizmet verdiğimiz bir ülkeye taşıyın.",
"Results": { "Title": "Bu bölgedeki yerler", "Clustered": "Burada {count} yer var. Görmek için yakınlaştırın.", "Nearest": "En yakın önce" },
"List": "Liste",
"Place": {
  "PartOf": "{name} bünyesinde",
  "NotFound": "Bu yer artık haritada değil.",
  "LoadFailed": "Bu yerin ayrıntıları yüklenemedi.",
  "Phone": "Telefon",
  "Email": "E-posta",
  "GetDirections": "Yol tarifi al"
},
"TryAgain": "Tekrar dene"
```

In tr-TR, keep each existing value marked `…unchanged…` exactly as it is in the file; only add the new keys.

- [ ] **Step 2: Regenerate the bundles and verify.**
  1. Run `npm run init`.
  2. Run `node -e` to confirm that both resource files parse, and that `Explore` has the same nested key set in en-US and tr-TR. Report the output.
  3. Run the gates.

- [ ] **Step 3: Commit.**

  ```bash
  git add src/localization/resources/en-US.json src/localization/resources/tr-TR.json
  git commit -F - <<'EOF'
  feat(explore): add the store locator's strings

  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  EOF
  ```

---

### Task 3: One map request and the merchant detail (actions and hooks)

**Files:**
- **Modify:** `src/actions/CRMService/actions.ts`. The three viewport actions, `EXPLORE_COUNTRY_TENANT`, `viewportClient` and their doc comments go; two actions are added.
- **Rewrite:** `src/actions/CRMService/__tests__/viewport.test.ts`.
- **Create:** `src/screens/shared/Explore/_components/useMapViewport.ts`, `useMerchantDetail.ts`, and `__tests__/useMapViewport.router.test.ts`, `__tests__/useMerchantDetail.router.test.ts`.
- **Delete:** `_components/useViewportLayer.ts` and `_components/__tests__/useViewportLayer.router.test.ts`.

**Interfaces:**
- **Produces:**
  - `getPublicMapViewportApi(data)` and `getPublicMerchantDetailApi(id)`, which throw `ApiError` like the rest of the file.
  - `useMapViewport(query)` returns `{ status, settled, viewport }`.
  - `useMerchantDetail(id)` returns `MerchantDetailState & { retry }`.
- **Consumes:** Task 1's `map.ts`.

- [ ] **Step 1: The actions.**
  - In the `@/saas/CRMService` import, replace the three `GetApiCrmServicePublic…ViewportData` names with `GetApiCrmServicePublicMapViewportData`.
  - Replace everything from the `/** The public viewport endpoints refuse…` comment to the end of `getPublicRefundPointsViewportApi` with:

```ts
/**
 * Deliberately not wrapped in `fetchRequest`: it always attaches `Authorization`, and on these
 * anonymous routes a user claim would outrank the backend's country resolution.
 */
export async function getPublicMapViewportApi(data: GetApiCrmServicePublicMapViewportData) {
  const client = await getPublicCRMServiceClient();
  return await client.mapPublic.getApiCrmServicePublicMapViewport(data);
}

export async function getPublicMerchantDetailApi(id: string) {
  const client = await getPublicCRMServiceClient();
  return await client.merchantPublic.getApiCrmServicePublicMerchantsById({ id });
}
```

`src/actions/CRMService/__tests__/viewport.test.ts`, rewritten:

```ts
import { getPublicMapViewportApi, getPublicMerchantDetailApi } from "../actions";

const viewport = jest.fn();
const merchantById = jest.fn();

jest.mock("@/actions/lib", () => ({
  getPublicCRMServiceClient: jest.fn(),
}));

const { getPublicCRMServiceClient } = jest.requireMock("@/actions/lib");

beforeEach(() => {
  jest.clearAllMocks();
  (getPublicCRMServiceClient as jest.Mock).mockResolvedValue({
    mapPublic: { getApiCrmServicePublicMapViewport: viewport },
    merchantPublic: { getApiCrmServicePublicMerchantsById: merchantById },
  });
});

const query = { south: 40.8, north: 41.2, west: 28.7, east: 29.3, layers: ["Merchant" as const] };

it("passes the window and layers straight through to the map endpoint", async () => {
  viewport.mockResolvedValue({ clustered: false, pins: [], totalCount: 0 });

  await expect(getPublicMapViewportApi(query)).resolves.toEqual({ clustered: false, pins: [], totalCount: 0 });
  expect(viewport).toHaveBeenCalledWith(query);
});

it("builds the client without a token and without a tenant", async () => {
  viewport.mockResolvedValue({});

  await getPublicMapViewportApi(query);

  expect(getPublicCRMServiceClient).toHaveBeenCalledWith();
});

it("asks for one merchant by id", async () => {
  merchantById.mockResolvedValue({ id: "m1", name: "GalataPort" });

  await expect(getPublicMerchantDetailApi("m1")).resolves.toEqual({ id: "m1", name: "GalataPort" });
  expect(merchantById).toHaveBeenCalledWith({ id: "m1" });
});

it("lets the SDK's error reach the caller", async () => {
  const error = Object.assign(new Error("Not Found"), { status: 404 });
  merchantById.mockRejectedValue(error);

  await expect(getPublicMerchantDetailApi("m1")).rejects.toBe(error);
});
```

- [ ] **Step 2: The hooks.**

`_components/useMapViewport.ts`:

```ts
import { getPublicMapViewportApi } from "@/actions/CRMService/actions";
import { logger } from "@/utils/logger";
import { useEffect, useState } from "react";
import {
  apiErrorInfo,
  EMPTY_VIEWPORT,
  mapErrorKind,
  normalizeMapViewport,
  type MapViewport,
  type MapViewportQuery,
} from "../_lib/map";

export type MapViewportStatus = "loading" | "ready" | "error" | "unserved";
type SettledStatus = Exclude<MapViewportStatus, "loading">;

type Answer = { query: MapViewportQuery; status: SettledStatus; viewport: MapViewport };

export function useMapViewport(query: MapViewportQuery | null): {
  status: MapViewportStatus;
  settled: SettledStatus | null;
  viewport: MapViewport;
} {
  const [answer, setAnswer] = useState<Answer | null>(null);

  useEffect(() => {
    if (!query) return;
    let disposed = false;
    getPublicMapViewportApi(query)
      .then((dto) => {
        if (!disposed) setAnswer({ query, status: "ready", viewport: normalizeMapViewport(dto) });
      })
      .catch((error: unknown) => {
        if (disposed) return;
        if (mapErrorKind(apiErrorInfo(error).code) === "unserved") {
          setAnswer({ query, status: "unserved", viewport: EMPTY_VIEWPORT });
          return;
        }
        logger.error("[Explore] map viewport fetch failed:", error);
        // Keep what is drawn: one failed pan should not blank the map.
        setAnswer((previous) => ({ query, status: "error", viewport: previous?.viewport ?? EMPTY_VIEWPORT }));
      });
    return () => {
      disposed = true;
    };
  }, [query]);

  if (!query) return { status: "ready", settled: null, viewport: EMPTY_VIEWPORT };
  if (!answer) return { status: "loading", settled: null, viewport: EMPTY_VIEWPORT };
  if (answer.query !== query) return { status: "loading", settled: answer.status, viewport: answer.viewport };
  return { status: answer.status, settled: answer.status, viewport: answer.viewport };
}
```

`_components/useMerchantDetail.ts`:

```ts
import { getPublicMerchantDetailApi } from "@/actions/CRMService/actions";
import type { UniRefund_CRMService_Merchants_MerchantPublicDetailDto as MerchantDetail } from "@/saas/CRMService";
import { useCallback, useEffect, useState } from "react";
import { apiErrorInfo, merchantErrorKind } from "../_lib/map";

type Settled = { status: "ready"; detail: MerchantDetail } | { status: "notFound" } | { status: "error" };

export type MerchantDetailState = { status: "idle" } | { status: "loading" } | Settled;

export function useMerchantDetail(id: string | null): MerchantDetailState & { retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<{ key: string; state: Settled } | null>(null);
  const key = id ? `${id}|${attempt}` : null;

  useEffect(() => {
    if (!id || !key) return;
    let disposed = false;
    getPublicMerchantDetailApi(id)
      .then((detail) => {
        if (!disposed) setAnswer({ key, state: { status: "ready", detail } });
      })
      .catch((error: unknown) => {
        if (disposed) return;
        const { code, status } = apiErrorInfo(error);
        setAnswer({
          key,
          state: merchantErrorKind(code, status) === "notFound" ? { status: "notFound" } : { status: "error" },
        });
      });
    return () => {
      disposed = true;
    };
  }, [id, key]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  if (!key) return { status: "idle", retry };
  if (answer?.key !== key) return { status: "loading", retry };
  return { ...answer.state, retry };
}
```

- [ ] **Step 3: Hook tests.**

`_components/__tests__/useMapViewport.router.test.ts`:

```ts
import { renderHook, waitFor } from "@testing-library/react-native";
import { useMapViewport } from "../useMapViewport";

jest.mock("@/actions/CRMService/actions", () => ({ getPublicMapViewportApi: jest.fn() }));
jest.mock("@/utils/logger", () => ({ logger: { error: jest.fn(), warn: jest.fn() } }));

const { getPublicMapViewportApi } = jest.requireMock("@/actions/CRMService/actions");

const PIN = { layer: "Merchant", id: "m1", name: "GalataPort", latitude: 41.02, longitude: 28.98, addressId: "a1" };
const Q1 = { south: 40.8, north: 41.2, west: 28.7, east: 29.3, layers: ["Merchant" as const] };
const Q2 = { ...Q1, east: 29.4 };

beforeEach(() => jest.clearAllMocks());

it("sends nothing and reads as an empty ready window without a query", () => {
  const { result } = renderHook(() => useMapViewport(null));
  expect(result.current).toEqual({
    status: "ready",
    settled: null,
    viewport: { clustered: false, pins: [], clusters: [], totalCount: 0 },
  });
  expect(getPublicMapViewportApi).not.toHaveBeenCalled();
});

it("draws the pins of a successful answer", async () => {
  getPublicMapViewportApi.mockResolvedValue({ clustered: false, pins: [PIN], totalCount: 1 });
  const { result } = renderHook(() => useMapViewport(Q1));
  expect(result.current.status).toBe("loading");
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current.viewport.pins.map((pin) => pin.key)).toEqual(["merchants:m1:a1"]);
});

it("clears the pins when the area is not served", async () => {
  getPublicMapViewportApi.mockResolvedValueOnce({ clustered: false, pins: [PIN], totalCount: 1 });
  const { result, rerender } = renderHook(({ query }) => useMapViewport(query), { initialProps: { query: Q1 } });
  await waitFor(() => expect(result.current.status).toBe("ready"));

  getPublicMapViewportApi.mockRejectedValueOnce(
    Object.assign(new Error("Bad Request"), { status: 400, body: { error: { code: "UniRefund.CRMService:029001" } } }),
  );
  rerender({ query: Q2 });
  expect(result.current).toMatchObject({ status: "loading", settled: "ready" });
  await waitFor(() => expect(result.current.status).toBe("unserved"));
  expect(result.current.viewport.pins).toEqual([]);
});

it("keeps the last pins when a later request fails", async () => {
  getPublicMapViewportApi.mockResolvedValueOnce({ clustered: false, pins: [PIN], totalCount: 1 });
  const { result, rerender } = renderHook(({ query }) => useMapViewport(query), { initialProps: { query: Q1 } });
  await waitFor(() => expect(result.current.status).toBe("ready"));

  getPublicMapViewportApi.mockRejectedValueOnce(new TypeError("Network request failed"));
  rerender({ query: Q2 });
  await waitFor(() => expect(result.current.status).toBe("error"));
  expect(result.current.viewport.pins).toHaveLength(1);
});
```

`_components/__tests__/useMerchantDetail.router.test.ts`:

```ts
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useMerchantDetail } from "../useMerchantDetail";

jest.mock("@/actions/CRMService/actions", () => ({ getPublicMerchantDetailApi: jest.fn() }));

const { getPublicMerchantDetailApi } = jest.requireMock("@/actions/CRMService/actions");

beforeEach(() => jest.clearAllMocks());

it("is idle without an id", () => {
  const { result } = renderHook(() => useMerchantDetail(null));
  expect(result.current.status).toBe("idle");
  expect(getPublicMerchantDetailApi).not.toHaveBeenCalled();
});

it("loads the merchant", async () => {
  getPublicMerchantDetailApi.mockResolvedValue({ id: "m1", name: "GalataPort" });
  const { result } = renderHook(() => useMerchantDetail("m1"));
  expect(result.current.status).toBe("loading");
  await waitFor(() => expect(result.current).toMatchObject({ status: "ready", detail: { name: "GalataPort" } }));
});

it("reads a 404 as a merchant that is no longer on the map", async () => {
  getPublicMerchantDetailApi.mockRejectedValue(
    Object.assign(new Error("Not Found"), { status: 404, body: { error: { code: "UniRefund.CRMService:029003" } } }),
  );
  const { result } = renderHook(() => useMerchantDetail("m1"));
  await waitFor(() => expect(result.current.status).toBe("notFound"));
});

it("retries after a failure", async () => {
  getPublicMerchantDetailApi.mockRejectedValueOnce(Object.assign(new Error("Server"), { status: 500 }));
  const { result } = renderHook(() => useMerchantDetail("m1"));
  await waitFor(() => expect(result.current.status).toBe("error"));

  getPublicMerchantDetailApi.mockResolvedValueOnce({ id: "m1", name: "GalataPort" });
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(getPublicMerchantDetailApi).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 4: Delete and check.**
  1. `git rm` `useViewportLayer.ts` and its test.
  2. Run the gates.
  3. `tsc` will still fail in `ExploreScreen.tsx` (old imports), and the old Explore screen test fails until Task 4. Record exactly which errors and tests are failing, and confirm nothing else changed.

- [ ] **Step 5: Commit.** Stage every changed, created and deleted path by name.

  ```bash
  git commit -F - <<'EOF'
  feat(explore): load one map viewport and a merchant's detail from the CRM

  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  EOF
  ```

---

### Task 4: The map, the controls, the layers and the list sheet

**Files** (all under `src/screens/shared/Explore/`):
- **Create:**
  - `_components/layerPins.ts`
  - `_components/PlaceTile.tsx`
  - `_components/PlacesList.tsx`
  - `_components/ListSheet.tsx`
  - `_components/__tests__/ListSheet.router.test.tsx`
- **Rewrite:**
  - `_components/ExploreMap.tsx`
  - `_components/MapControls.tsx`
  - `_components/LayersSheet.tsx`
  - `ExploreScreen.tsx` (list-capable; Task 5 adds the detail, search and locate)
  - `__tests__/explore.router.test.tsx`
- **Edit:** `_components/__tests__/MapControls.router.test.tsx` and `_components/__tests__/LayersSheet.router.test.tsx`.
- **Delete:** `_lib/layers.ts`, `_lib/normalizeViewport.ts`, `_lib/viewportRequest.ts` and `_lib/directions.ts`, with their `__tests__`.
- **Trim:** `_lib/sectors.ts` to `SectorOption` and `mergeSelectedSector`, and `_lib/__tests__/sectors.test.ts` to that function's tests.

**Interfaces:**
- **Produces:**
  - `ExploreMapRef`: `{ zoomIn; zoomOut; flyTo(center, options?: { raised?: boolean }); jumpTo(center) }`.
  - `ExploreMap` props: `pins`, `clusters`, `selectedKey`, `pinLabel`, `clusterLabel`, `clusterText`, `onBoundsChange(bounds)`, `onSelectPin(pin)`, `onLoaded()`, `onUserMove()`, `ref`.
  - `MapControls` props: `labels: { layers; list; zoomIn; zoomOut; locate }`, `isLocating`, `onOpenLayers`, `onOpenList`, `onLocate`, `onZoomIn`, `onZoomOut`.
  - Components: `PlaceTile({ layer, size })`, `PlacesList({ pins, origin, locale, onSelect })`, `ListSheet({ sheetRef, title, statusText, pins, origin, locale, onSelect })`.
- **Consumes:** Tasks 1–3.

- [ ] **Step 1: `_components/layerPins.ts` and `_components/PlaceTile.tsx`.**

```ts
import type { IoniconsTypes } from "@/components/Ionicons";
import type { MapLayerKey } from "../_lib/map";

export const LAYER_PINS: Record<MapLayerKey, { icon: IoniconsTypes; className: string }> = {
  merchants: { icon: "storefront-outline", className: "bg-primary" },
  refundPoints: { icon: "wallet-outline", className: "bg-success" },
  exitPoints: { icon: "business-outline", className: "bg-warning" },
};
```

```tsx
import { Ionicons } from "@/components/Ionicons";
import { cn } from "@/utils/cn";
import { colors } from "@/utils/theme";
import React from "react";
import { View } from "react-native";
import type { MapLayerKey } from "../_lib/map";
import { LAYER_PINS } from "./layerPins";

export function PlaceTile({ layer, size = "md" }: { layer: MapLayerKey; size?: "sm" | "md" }) {
  const pin = LAYER_PINS[layer];
  return (
    <View
      className={cn("items-center justify-center rounded-md", pin.className, size === "sm" ? "size-8" : "size-10")}
    >
      <Ionicons color={colors.primaryForeground} name={pin.icon} size={size === "sm" ? 16 : 20} />
    </View>
  );
}
```

- [ ] **Step 2: `_components/ExploreMap.tsx`, rewritten.**

```tsx
import { Ionicons } from "@/components/Ionicons";
import { Text } from "@/components/rnr";
import { useTabBarInset } from "@/hooks/useTabBarInset";
import { cn } from "@/utils/cn";
import { colors } from "@/utils/theme";
import {
  Camera,
  Map,
  type CameraRef,
  type ViewStateChangeEvent,
  ViewAnnotation,
} from "@maplibre/maplibre-react-native";
import React, { useCallback, useImperativeHandle, useRef } from "react";
import { View } from "react-native";
import { useSafeAreaFrame } from "react-native-safe-area-context";
import { toBounds, type Bounds, type MapCluster, type MapPin } from "../_lib/map";
import { clusterSize } from "../_lib/places";
import { LAYER_PINS } from "./layerPins";

const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const INITIAL_CENTER: [number, number] = [28.9966448299549, 41.011903723721645];
const INITIAL_ZOOM = 9;
const ZOOM_STEP = 1;
const FLY_TO_ZOOM = 15;
const LOCATE_ON_OPEN_ZOOM = 12;
const CLUSTER_ZOOM_STEP = 3;

// Rotations go through `style`: RN has no child combinator to cancel the pin's rotation on its icon.
const PIN_BASE_CLASSNAME = "items-center justify-center rounded-full rounded-bl-none shadow-lg";
const PIN_STYLE = { width: 32, height: 32, transform: [{ rotate: "-45deg" as const }] };
const SELECTED_PIN_STYLE = {
  width: 44,
  height: 44,
  borderWidth: 3,
  borderColor: colors.primaryForeground,
  transform: [{ rotate: "-45deg" as const }],
};
const ICON_COUNTER_ROTATION = { transform: [{ rotate: "45deg" as const }] };

export type ExploreMapRef = {
  zoomIn: () => void;
  zoomOut: () => void;
  flyTo: (center: [number, number], options?: { raised?: boolean }) => void;
  jumpTo: (center: [number, number]) => void;
};

export function ExploreMap({
  pins,
  clusters,
  selectedKey,
  pinLabel,
  clusterLabel,
  clusterText,
  onBoundsChange,
  onSelectPin,
  onLoaded,
  onUserMove,
  ref,
}: {
  pins: MapPin[];
  clusters: MapCluster[];
  selectedKey: string | null;
  pinLabel: (pin: MapPin) => string;
  clusterLabel: (count: number) => string;
  clusterText: (count: number) => string;
  onBoundsChange: (bounds: Bounds) => void;
  onSelectPin: (pin: MapPin) => void;
  onLoaded: () => void;
  onUserMove: () => void;
  ref?: React.Ref<ExploreMapRef>;
}) {
  const tabInset = useTabBarInset();
  const { height: frameHeight } = useSafeAreaFrame();
  const cameraRef = useRef<CameraRef>(null);
  const zoomRef = useRef(INITIAL_ZOOM);

  const handleRegionDidChange = useCallback(
    (event: { nativeEvent: ViewStateChangeEvent }) => {
      zoomRef.current = event.nativeEvent.zoom;
      onBoundsChange(toBounds(event.nativeEvent.bounds));
    },
    [onBoundsChange],
  );

  const handleRegionWillChange = useCallback(
    (event: { nativeEvent: ViewStateChangeEvent }) => {
      if (event.nativeEvent.userInteraction) onUserMove();
    },
    [onUserMove],
  );

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => {
        cameraRef.current?.zoomTo(Math.max(0, zoomRef.current + ZOOM_STEP));
      },
      zoomOut: () => {
        cameraRef.current?.zoomTo(Math.max(0, zoomRef.current - ZOOM_STEP));
      },
      flyTo: (center, options) => {
        cameraRef.current?.flyTo({
          center,
          zoom: Math.max(zoomRef.current, FLY_TO_ZOOM),
          ...(options?.raised
            ? { padding: { top: 0, right: 0, bottom: Math.round(frameHeight / 2), left: 0 } }
            : {}),
        });
      },
      jumpTo: (center) => {
        cameraRef.current?.jumpTo({ center, zoom: Math.max(zoomRef.current, LOCATE_ON_OPEN_ZOOM) });
      },
    }),
    [frameHeight],
  );

  const selected = pins.find((pin) => pin.key === selectedKey) ?? null;
  const others = selected ? pins.filter((pin) => pin.key !== selectedKey) : pins;

  function renderPin(pin: MapPin, isSelected: boolean) {
    const config = LAYER_PINS[pin.layer];
    return (
      <ViewAnnotation
        id={isSelected ? `${pin.key}#selected` : pin.key}
        key={isSelected ? `${pin.key}#selected` : pin.key}
        lngLat={[pin.longitude, pin.latitude]}
        onPress={() => onSelectPin(pin)}
        title={pinLabel(pin)}
      >
        <View
          className={cn(PIN_BASE_CLASSNAME, config.className)}
          style={isSelected ? SELECTED_PIN_STYLE : PIN_STYLE}
        >
          <Ionicons
            color={colors.primaryForeground}
            name={config.icon}
            size={isSelected ? 22 : 16}
            style={ICON_COUNTER_ROTATION}
          />
        </View>
      </ViewAnnotation>
    );
  }

  return (
    <>
      <Map
        mapStyle={MAP_STYLE_URL}
        onDidFinishLoadingMap={onLoaded}
        onRegionDidChange={handleRegionDidChange}
        onRegionWillChange={handleRegionWillChange}
        style={{ flex: 1 }}
      >
        <Camera initialViewState={{ center: INITIAL_CENTER, zoom: INITIAL_ZOOM }} ref={cameraRef} />

        {others.map((pin) => renderPin(pin, false))}

        {clusters.map((cluster) => {
          const size = clusterSize(cluster.count);
          return (
            <ViewAnnotation
              id={`cluster:${cluster.key}`}
              key={`cluster:${cluster.key}`}
              lngLat={[cluster.longitude, cluster.latitude]}
              onPress={() => {
                onUserMove();
                cameraRef.current?.easeTo({
                  center: [cluster.longitude, cluster.latitude],
                  zoom: zoomRef.current + CLUSTER_ZOOM_STEP,
                });
              }}
              title={clusterLabel(cluster.count)}
            >
              <View
                className="items-center justify-center rounded-full border-2 border-primary-foreground bg-primary shadow-lg"
                style={{ width: size, height: size }}
              >
                <Text tone="onPrimary" variant="labelStrong">
                  {clusterText(cluster.count)}
                </Text>
              </View>
            </ViewAnnotation>
          );
        })}

        {selected ? renderPin(selected, true) : null}
      </Map>

      <View className="absolute right-3" pointerEvents="none" style={{ bottom: tabInset + 8 }}>
        <Text tone="muted" variant="caption">
          © OpenFreeMap © OpenMapTiles Data from OpenStreetMap
        </Text>
      </View>
    </>
  );
}
```

`onDidFinishLoadingMap` passes a native event that `onLoaded` ignores. If `tsc` rejects passing `onLoaded` directly, wrap it as `() => onLoaded()`.

- [ ] **Step 3: `_components/MapControls.tsx`.**

Keep the file, with these changes:

- **`Control`:** remove the `tinted` prop and its use. The icon className becomes the fixed `"text-foreground"`.
- **`MapControlLabels`** becomes `{ layers: string; list: string; zoomIn: string; zoomOut: string; locate: string }`.
- **Props:** `sectorActive` and `onOpenSector` are replaced by `onOpenList: () => void`.
- **Doc comment:** update the one above `MapControls` to say the first pill holds Layers and List.
- **First group:** its second control becomes:

  ```tsx
  <Control iconName="list-outline" label={labels.list} onPress={onOpenList} />
  ```

In `_components/__tests__/MapControls.router.test.tsx`, make exactly these replacements:
- **Labels and callbacks:**
  - `sector: "Sector"` becomes `list: "List"`;
  - the callbacks key `onOpenSector` becomes `onOpenList`;
  - remove `sectorActive={false}` and `sectorActive` from every render.
- **Expected order:** `["Layers", "List", "My location", "Zoom out", "Zoom in"]`.
- **The sheet test:** rename it `"opens the list sheet on press"`. It presses `"List"` and expects `onOpenList`.
- **The style-feature test:**
  - title it `"never gains or loses a style feature class across the locate spinner"`;
  - its label list uses `"List"` in place of `"Sector"`;
  - its two renders pass `onOpenList={jest.fn()}`;
  - the second render keeps `isLocating`.
- **Unchanged:** the `360dp fit` block.

- [ ] **Step 4: `_components/LayersSheet.tsx`.**
  - Replace `LAYER_ORDER`/`LAYER_ICONS` with imports of `LAYER_ORDER` and `type MapLayerKey` from `"../_lib/map"`, and `LAYER_PINS` from `"./layerPins"`.
  - Type `active` as `Record<MapLayerKey, boolean>`, `labels` as `Record<MapLayerKey, string>` and `onToggle` as `(layer: MapLayerKey) => void`.
  - Render each row's icon with `name={LAYER_PINS[layer].icon}`.
  - Everything else stays.

In `_components/__tests__/LayersSheet.router.test.tsx`:
- `labels` becomes `{ merchants: "Merchants", refundPoints: "Refund points", exitPoints: "Exit points" }`.
- The `renderSheet` parameter type becomes `Record<"merchants" | "refundPoints" | "exitPoints", boolean>`.
- Every `customs` key becomes `exitPoints`.
- Every `"Customs"` text or label becomes `"Exit points"`.
- `labels.customs` becomes `labels.exitPoints`.

- [ ] **Step 5: `_components/PlacesList.tsx` and `_components/ListSheet.tsx`.**

```tsx
import DebouncedPressable from "@/components/DebouncedPressable";
import { Text } from "@/components/rnr";
import React from "react";
import { View } from "react-native";
import type { MapPin } from "../_lib/map";
import { distanceMeters, formatDistance, type LatLng } from "../_lib/places";
import { PlaceTile } from "./PlaceTile";

export function PlacesList({
  pins,
  origin,
  locale,
  onSelect,
}: {
  pins: MapPin[];
  origin: LatLng | null;
  locale: string;
  onSelect: (pin: MapPin) => void;
}) {
  return (
    <View testID="explore-places-list">
      {pins.map((pin) => (
        <DebouncedPressable
          accessibilityLabel={pin.name}
          accessibilityRole="button"
          className="flex-row items-start gap-3 border-b border-border px-4 py-3"
          key={pin.key}
          onPress={() => onSelect(pin)}
          testID={`explore-place-row-${pin.key}`}
        >
          <PlaceTile layer={pin.layer} size="sm" />
          <View className="flex-1">
            <Text numberOfLines={1} variant="bodyStrong">
              {pin.name}
            </Text>
            {pin.headquarterName ? (
              <Text numberOfLines={1} tone="muted" variant="label">
                {pin.headquarterName}
              </Text>
            ) : null}
            {pin.addressLine ? (
              <Text numberOfLines={2} tone="muted" variant="label">
                {pin.addressLine}
              </Text>
            ) : null}
          </View>
          {origin ? <Text variant="labelStrong">{formatDistance(distanceMeters(origin, pin), locale)}</Text> : null}
        </DebouncedPressable>
      ))}
    </View>
  );
}
```

```tsx
import { BottomSheet } from "@/components/BottomSheet";
import { Text } from "@/components/rnr";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import React from "react";
import { View } from "react-native";
import type { MapPin } from "../_lib/map";
import type { LatLng } from "../_lib/places";
import { PlacesList } from "./PlacesList";

const LIST_BOTTOM_PADDING = { paddingBottom: 32 };

export function ListSheet({
  sheetRef,
  title,
  statusText,
  pins,
  origin,
  locale,
  onSelect,
}: {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  title: string;
  statusText: string;
  pins: MapPin[];
  origin: LatLng | null;
  locale: string;
  onSelect: (pin: MapPin) => void;
}) {
  return (
    <BottomSheet ref={sheetRef} snapPoints={["70%"]}>
      <View className="gap-1 px-4 pb-3 pt-1">
        <Text variant="subheading">{title}</Text>
        <Text testID="explore-results-status" tone="muted" variant="label">
          {statusText}
        </Text>
      </View>
      <BottomSheetScrollView contentContainerStyle={LIST_BOTTOM_PADDING}>
        <PlacesList locale={locale} onSelect={onSelect} origin={origin} pins={pins} />
      </BottomSheetScrollView>
    </BottomSheet>
  );
}
```

`_components/__tests__/ListSheet.router.test.tsx`:

```tsx
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { fireEvent, render, screen } from "@testing-library/react-native";
import React, { createRef } from "react";
import type { MapPin } from "../../_lib/map";
import { ListSheet } from "../ListSheet";

jest.mock("@/components/BottomSheet", () => {
  const ReactLib = require("react");
  const { View } = require("react-native");
  return {
    BottomSheet: ReactLib.forwardRef(function Mock(props: { children?: React.ReactNode }, _ref: unknown) {
      return ReactLib.createElement(View, null, props.children);
    }),
  };
});

jest.mock("@gorhom/bottom-sheet", () => {
  const { ScrollView, View } = require("react-native");
  return { __esModule: true, BottomSheetModal: () => null, BottomSheetView: View, BottomSheetScrollView: ScrollView };
});

const near: MapPin = {
  key: "merchants:m1:a1",
  layer: "merchants",
  id: "m1",
  addressId: "a1",
  name: "GalataPort",
  addressLine: "Meclisi Mebusan Cad. 12F",
  headquarterName: "Artı Bilgisayar",
  latitude: 41.0284,
  longitude: 28.9862,
};

function renderSheet(origin: { latitude: number; longitude: number } | null) {
  const onSelect = jest.fn();
  render(
    <ListSheet
      locale="en-US"
      onSelect={onSelect}
      origin={origin}
      pins={[near]}
      sheetRef={createRef<BottomSheetModal>()}
      statusText="1 place · Nearest first"
      title="Places in this area"
    />,
  );
  return { onSelect };
}

it("shows the title, the status line and a row per place", () => {
  renderSheet(null);
  expect(screen.getByText("Places in this area")).toBeTruthy();
  expect(screen.getByTestId("explore-results-status").props.children).toBe("1 place · Nearest first");
  expect(screen.getByText("GalataPort")).toBeTruthy();
  expect(screen.getByText("Artı Bilgisayar")).toBeTruthy();
  expect(screen.queryByText(/ m$| km$/)).toBeNull();
});

it("shows the distance once the location is known", () => {
  renderSheet({ latitude: 41.0369, longitude: 28.985 });
  expect(screen.getByText("950 m")).toBeTruthy();
});

it("hands the tapped place back", () => {
  const { onSelect } = renderSheet(null);
  fireEvent.press(screen.getByTestId("explore-place-row-merchants:m1:a1"));
  expect(onSelect).toHaveBeenCalledWith(near);
});
```

- [ ] **Step 6: `ExploreScreen.tsx`, rewritten for this task.**

```tsx
import { getCurrentLocation } from "@/utils/location";
import { SafeAreaView } from "@/components/SafeAreaView";
import { Text } from "@/components/rnr";
import { useDebounce } from "@/hooks/useDebounce";
import { useLocalization } from "@/providers/LocalizationProvider";
import { useToast } from "@/providers/ToastProvider";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { ExploreMap, type ExploreMapRef } from "./_components/ExploreMap";
import { LayersSheet } from "./_components/LayersSheet";
import { ListSheet } from "./_components/ListSheet";
import { MapControls } from "./_components/MapControls";
import { PlaceDetailSheet } from "./_components/PlaceDetailSheet";
import { PlaceSearch } from "./_components/PlaceSearch";
import { useMapViewport } from "./_components/useMapViewport";
import {
  DEFAULT_LAYERS,
  isSpanValid,
  resultsStatus,
  toggleLayer,
  toMapViewportQuery,
  type Bounds,
  type MapLayerKey,
  type MapPin,
} from "./_lib/map";
import { formatClusterCount, sortPlaces, type LatLng } from "./_lib/places";

const VIEWPORT_DEBOUNCE_MS = 350;

const LAYER_LABEL_KEYS = {
  merchants: "MobileApp.Explore.Layer.Merchants",
  refundPoints: "MobileApp.Explore.Layer.RefundPoints",
  exitPoints: "MobileApp.Explore.Layer.ExitPoints",
} as const;

function ExploreScreen() {
  const { t, activeLocale } = useLocalization();
  const toast = useToast();
  const [rawBounds, setRawBounds] = useState<Bounds | null>(null);
  const bounds = useDebounce(rawBounds, VIEWPORT_DEBOUNCE_MS);
  const [active, setActive] = useState(DEFAULT_LAYERS);
  const query = useMemo(() => toMapViewportQuery(bounds, active), [bounds, active]);
  const { status, settled, viewport } = useMapViewport(query);
  const anyLayer = Object.values(active).some(Boolean);
  const visiblePins = useMemo(
    () => viewport.pins.filter((pin) => active[pin.layer]),
    [viewport.pins, active],
  );
  const visibleViewport = useMemo(() => ({ ...viewport, pins: visiblePins }), [viewport, visiblePins]);
  const results = resultsStatus({ status: bounds ? status : "loading", viewport: visibleViewport, anyLayer });
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const pins = useMemo(
    () => sortPlaces(visiblePins, userLocation, activeLocale),
    [visiblePins, userLocation, activeLocale],
  );
  const [selectedPin, setSelectedPin] = useState<MapPin | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const detailSheetRef = useRef<BottomSheetModal>(null);
  const layersSheetRef = useRef<BottomSheetModal>(null);
  const listSheetRef = useRef<BottomSheetModal>(null);
  const exploreMapRef = useRef<ExploreMapRef>(null);
  const userMovedRef = useRef(false);

  const formatCount = useCallback(
    (count: number) => new Intl.NumberFormat(activeLocale).format(count),
    [activeLocale],
  );

  const handleBoundsChange = useCallback((next: Bounds) => {
    if (isSpanValid(next)) setRawBounds(next);
  }, []);
  const handleUserMove = useCallback(() => {
    userMovedRef.current = true;
  }, []);
  const handleLoaded = useCallback(() => undefined, []);

  const pinLabel = useCallback(
    (pin: MapPin) => {
      const name = pin.name || t(LAYER_LABEL_KEYS[pin.layer]);
      return pin.headquarterName ? `${name}, ${pin.headquarterName}` : name;
    },
    [t],
  );
  const placesLabel = useCallback(
    (count: number) =>
      count === 1
        ? t("MobileApp.Explore.Cluster.Place")
        : t("MobileApp.Explore.Cluster.Places", { count: formatCount(count) }),
    [t, formatCount],
  );
  const clusterText = useCallback(
    (count: number) => formatClusterCount(count, activeLocale, t("MobileApp.Explore.Cluster.Thousands")),
    [activeLocale, t],
  );

  function selectPin(pin: MapPin, fly: boolean) {
    userMovedRef.current = true;
    setSelectedPin(pin);
    detailSheetRef.current?.present();
    if (fly) exploreMapRef.current?.flyTo([pin.longitude, pin.latitude], { raised: true });
  }

  function handleListSelect(pin: MapPin) {
    listSheetRef.current?.dismiss();
    selectPin(pin, true);
  }

  function handleSearchPlace(center: [number, number]) {
    userMovedRef.current = true;
    exploreMapRef.current?.flyTo(center);
  }

  function handleZoomIn() {
    userMovedRef.current = true;
    exploreMapRef.current?.zoomIn();
  }

  function handleZoomOut() {
    userMovedRef.current = true;
    exploreMapRef.current?.zoomOut();
  }

  async function handleLocate() {
    setIsLocating(true);
    const result = await getCurrentLocation();
    setIsLocating(false);
    if (result.ok) {
      setUserLocation(result.location);
      userMovedRef.current = true;
      exploreMapRef.current?.flyTo([result.location.longitude, result.location.latitude]);
      return;
    }
    toast.error(
      result.reason === "denied"
        ? t("MobileApp.Explore.Location.Denied")
        : result.reason === "unsupported"
          ? t("MobileApp.Explore.Location.Unsupported")
          : t("MobileApp.Explore.Location.Unavailable"),
    );
  }

  const statusText = (() => {
    switch (results.kind) {
      case "loading":
        return t("MobileApp.Explore.Loading");
      case "unserved":
        return t("MobileApp.Explore.Unserved");
      case "error":
        return t("MobileApp.Explore.Error");
      case "clustered":
        return t("MobileApp.Explore.Results.Clustered", { count: formatCount(results.count) });
      case "empty":
        return t("MobileApp.Explore.Empty");
      case "count":
        return userLocation
          ? `${placesLabel(results.count)} · ${t("MobileApp.Explore.Results.Nearest")}`
          : placesLabel(results.count);
    }
  })();

  const bannerStatus = status === "loading" ? settled : status;
  const banner =
    bannerStatus === "unserved"
      ? t("MobileApp.Explore.Unserved")
      : bannerStatus === "error"
        ? t("MobileApp.Explore.Error")
        : null;

  return (
    <SafeAreaView className="flex-1">
      <View className="flex-1">
        <ExploreMap
          clusterLabel={placesLabel}
          clusterText={clusterText}
          clusters={viewport.clusters}
          onBoundsChange={handleBoundsChange}
          onLoaded={handleLoaded}
          onSelectPin={(pin) => selectPin(pin, false)}
          onUserMove={handleUserMove}
          pinLabel={pinLabel}
          pins={visiblePins}
          ref={exploreMapRef}
          selectedKey={selectedPin?.key ?? null}
        />

        <PlaceSearch onSelectResult={handleSearchPlace} />

        {banner ? (
          <View className="absolute inset-x-0 top-20 px-4" pointerEvents="none" testID="explore-banner">
            <View className="rounded-md border border-warning/40 bg-warning-surface px-4 py-3">
              <Text className="text-sm text-warning">{banner}</Text>
            </View>
          </View>
        ) : null}

        <MapControls
          isLocating={isLocating}
          labels={{
            layers: t("MobileApp.Explore.Layers"),
            list: t("MobileApp.Explore.List"),
            zoomIn: t("MobileApp.Explore.Controls.ZoomIn"),
            zoomOut: t("MobileApp.Explore.Controls.ZoomOut"),
            locate: t("MobileApp.Explore.Controls.Locate"),
          }}
          onLocate={handleLocate}
          onOpenLayers={() => layersSheetRef.current?.present()}
          onOpenList={() => listSheetRef.current?.present()}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
        />

        <LayersSheet
          active={active}
          labels={{
            merchants: t(LAYER_LABEL_KEYS.merchants),
            refundPoints: t(LAYER_LABEL_KEYS.refundPoints),
            exitPoints: t(LAYER_LABEL_KEYS.exitPoints),
          }}
          onToggle={(layer: MapLayerKey) => setActive((previous) => toggleLayer(previous, layer))}
          sheetRef={layersSheetRef}
          title={t("MobileApp.Explore.Layers")}
        />

        <ListSheet
          locale={activeLocale}
          onSelect={handleListSelect}
          origin={userLocation}
          pins={pins}
          sheetRef={listSheetRef}
          statusText={statusText}
          title={t("MobileApp.Explore.Results.Title")}
        />

        <PlaceDetailSheet
          noAddressLabel={t("MobileApp.Explore.NoAddress")}
          place={selectedPin}
          sheetRef={detailSheetRef}
        />
      </View>
    </SafeAreaView>
  );
}

export default ExploreScreen;
```

This task keeps today's `PlaceSearch` and `PlaceDetailSheet`, which Task 5 replaces. The existing `PlaceDetailSheet` takes `place: ViewportPlace | null` from the deleted `normalizeViewport.ts`. So in this task, also change its `place` prop type to `MapPin | null` (import from `"../_lib/map"`), and replace its `../_lib/directions` import:
- **Import:** `import { directionsUrls } from "../_lib/merchant";`
- **Destination:** `const urls = place ? directionsUrls({ latitude: place.latitude, longitude: place.longitude }) : null;`
- **Buttons:** open `urls.google` and `urls.apple`, and render only when `urls` is set.
- **Removed:** the sector badges, because pins carry no sectors.

- [ ] **Step 7: `__tests__/explore.router.test.tsx`, rewritten.**

```tsx
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";

const mockCamera = { flyTo: jest.fn(), jumpTo: jest.fn(), easeTo: jest.fn(), zoomTo: jest.fn() };
let mockMapProps: Record<string, any> = {};

jest.mock("@maplibre/maplibre-react-native", () => {
  const ReactActual = require("react");
  const { Pressable, View } = require("react-native");
  return {
    Map: (props: Record<string, any>) => {
      mockMapProps = props;
      ReactActual.useEffect(() => {
        props.onRegionDidChange?.({ nativeEvent: { bounds: [28.7, 40.8, 29.3, 41.2], zoom: 9 } });
        props.onDidFinishLoadingMap?.({ nativeEvent: null });
      }, []);
      return <View>{props.children}</View>;
    },
    Camera: ReactActual.forwardRef(function MockCamera(_props: unknown, ref: unknown) {
      ReactActual.useImperativeHandle(ref, () => mockCamera);
      return null;
    }),
    ViewAnnotation: ({ id, onPress, title, children }: { id: string; onPress?: () => void; title?: string; children?: React.ReactNode }) => (
      <Pressable accessibilityLabel={title} onPress={onPress} testID={`annotation-${id}`}>
        {children}
      </Pressable>
    ),
  };
});

jest.mock("@/actions/CRMService/actions", () => ({
  getPublicMapViewportApi: jest.fn(),
  getPublicMerchantDetailApi: jest.fn(),
}));

jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values ? `${key}(${Object.values(values).join(",")})` : key,
    activeLocale: "en-US",
    languageCode: "en",
  }),
}));

jest.mock("@/components/BottomSheet", () => {
  const ReactLib = require("react");
  const { View } = require("react-native");
  return {
    BottomSheet: ReactLib.forwardRef(function Mock(props: { children?: React.ReactNode }, ref: unknown) {
      ReactLib.useImperativeHandle(ref, () => ({ present: jest.fn(), dismiss: jest.fn() }));
      return ReactLib.createElement(View, null, props.children);
    }),
  };
});

jest.mock("@gorhom/bottom-sheet", () => {
  const { ScrollView, View } = require("react-native");
  return { __esModule: true, BottomSheetModal: () => null, BottomSheetView: View, BottomSheetScrollView: ScrollView };
});

const mockToastError = jest.fn();
jest.mock("@/providers/ToastProvider", () => ({
  useToast: () => ({ error: mockToastError, success: jest.fn() }),
}));

jest.mock("@/utils/location", () => ({ getCurrentLocation: jest.fn() }));

import { getPublicMapViewportApi } from "@/actions/CRMService/actions";
import { getCurrentLocation } from "@/utils/location";
import ExploreScreen from "../ExploreScreen";

const GALATA = {
  layer: "Merchant",
  id: "m1",
  name: " GalataPort",
  latitude: 41.028404,
  longitude: 28.986236,
  addressId: "a1",
  addressLine: "Meclisi Mebusan Cad. 12F",
  headquarterName: "Artı Bilgisayar",
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  (getPublicMapViewportApi as jest.Mock).mockResolvedValue({ clustered: false, pins: [GALATA], totalCount: 1 });
  (getCurrentLocation as jest.Mock).mockResolvedValue({ ok: false, reason: "denied" });
});

afterEach(() => {
  jest.useRealTimers();
});

async function renderSettled() {
  render(<ExploreScreen />);
  await act(async () => {
    jest.advanceTimersByTime(400);
  });
  await waitFor(() => expect(screen.getByTestId("annotation-merchants:m1:a1")).toBeTruthy());
}

it("asks for the merchants layer of the settled window, without a tenant", async () => {
  await renderSettled();
  expect(getPublicMapViewportApi).toHaveBeenCalledWith({
    south: 40.8,
    north: 41.2,
    west: 28.7,
    east: 29.3,
    layers: ["Merchant"],
  });
});

it("names the pin after the place and its headquarter", async () => {
  await renderSettled();
  expect(screen.getByLabelText("GalataPort, Artı Bilgisayar")).toBeTruthy();
});

it("lists the places with a status line", async () => {
  await renderSettled();
  expect(screen.getByTestId("explore-results-status").props.children).toBe("MobileApp.Explore.Cluster.Place");
  expect(screen.getByTestId("explore-place-row-merchants:m1:a1")).toBeTruthy();
});

it("sends nothing and draws nothing once every layer is off", async () => {
  await renderSettled();
  (getPublicMapViewportApi as jest.Mock).mockClear();
  fireEvent.press(screen.getByLabelText("MobileApp.Explore.Layer.Merchants"));
  await act(async () => {
    jest.advanceTimersByTime(400);
  });
  expect(getPublicMapViewportApi).not.toHaveBeenCalled();
  expect(screen.queryByTestId("annotation-merchants:m1:a1")).toBeNull();
});

it("shows the unserved banner and status when the area is not served", async () => {
  (getPublicMapViewportApi as jest.Mock).mockRejectedValue(
    Object.assign(new Error("Bad Request"), { status: 400, body: { error: { code: "UniRefund.CRMService:029001" } } }),
  );
  render(<ExploreScreen />);
  await act(async () => {
    jest.advanceTimersByTime(400);
  });
  await waitFor(() => expect(screen.getByTestId("explore-banner")).toBeTruthy());
  expect(screen.getByTestId("explore-results-status").props.children).toBe("MobileApp.Explore.Unserved");
});

it("draws a cluster bubble that zooms in when tapped", async () => {
  (getPublicMapViewportApi as jest.Mock).mockResolvedValue({
    clustered: true,
    clusters: [{ count: 1234, latitude: 41, longitude: 29 }],
    totalCount: 1234,
  });
  render(<ExploreScreen />);
  await act(async () => {
    jest.advanceTimersByTime(400);
  });
  await waitFor(() => expect(screen.getByText("1,234")).toBeTruthy());
  fireEvent.press(screen.getByLabelText("MobileApp.Explore.Cluster.Places(1,234)"));
  expect(mockCamera.easeTo).toHaveBeenCalledWith({ center: [29, 41], zoom: 12 });
  expect(screen.getByTestId("explore-results-status").props.children).toBe(
    "MobileApp.Explore.Results.Clustered(1,234)",
  );
});

it("never asks for a window wider than 180 degrees", async () => {
  await renderSettled();
  (getPublicMapViewportApi as jest.Mock).mockClear();
  act(() => {
    mockMapProps.onRegionDidChange({ nativeEvent: { bounds: [-180, -85, 180, 85], zoom: 0 } });
  });
  await act(async () => {
    jest.advanceTimersByTime(400);
  });
  expect(getPublicMapViewportApi).not.toHaveBeenCalled();
});

describe("locate button failures", () => {
  it.each([
    ["denied", "MobileApp.Explore.Location.Denied"],
    ["unavailable", "MobileApp.Explore.Location.Unavailable"],
    ["unsupported", "MobileApp.Explore.Location.Unsupported"],
  ])("toasts when location is %s", async (reason, key) => {
    await renderSettled();
    (getCurrentLocation as jest.Mock).mockResolvedValue({ ok: false, reason });
    await act(async () => {
      fireEvent.press(screen.getByLabelText("MobileApp.Explore.Controls.Locate"));
    });
    expect(mockToastError).toHaveBeenCalledWith(key);
  });
});
```

The cluster test expects `zoom: 12` because the mocked map reports zoom 9 and the step is 3. Task 5 extends this file; the mock shape above is final.

`ExploreMap` now calls `useSafeAreaFrame()`, and `jest-setup.ts` does not mock `react-native-safe-area-context`. If the render throws for want of a provider, wrap every `render(<ExploreScreen />)` in this file in `<SafeAreaProvider initialMetrics={…}>`, exactly as `src/components/CountryPicker/__tests__/CountryPickerModal.router.test.tsx` does with its `metrics` constant. Do not mock the library away.

- [ ] **Step 8: Delete, trim and check.**
  - **Delete with `git rm`:**
    - `_lib/layers.ts`;
    - `_lib/normalizeViewport.ts` and `_lib/__tests__/normalizeViewport.test.ts`;
    - `_lib/viewportRequest.ts` and `_lib/__tests__/viewportRequest.test.ts`;
    - `_lib/directions.ts` and `_lib/__tests__/directions.test.ts`.
  - **Trim:**
    - `_lib/sectors.ts` keeps `SectorOption` and `mergeSelectedSector` (with its doc comment), and drops the `ViewportPlace` import;
    - `_lib/__tests__/sectors.test.ts` keeps only its `mergeSelectedSector` describe/its.
  - **Check:** `grep -rn "normalizeViewport\|viewportRequest\|_lib/layers\|_lib/directions\|useViewportLayer\|LayerKey\b\|getPublic.*ViewportApi\|EXPLORE_COUNTRY_TENANT" src` prints nothing. `MapLayerKey` matches are fine.
  - **Gates:**
    - `tsc` must be back at the Task 0 baseline minus the viewport errors (only the standing `tabBackNavigation` one, if it is still there);
    - `npm test` all pass except the baseline;
    - `npm run lint` 0 errors.
  - **Stage new files** before trusting `tokens.test.ts`.

- [ ] **Step 9: Commit.** Stage every path by name.

  ```bash
  git commit -F - <<'EOF'
  feat(explore): draw the new layers and clusters and add the List sheet

  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  EOF
  ```

---

### Task 5: Detail sheet, store search, selection and locate-on-open

**Files:**
- **Rewrite:**
  - `_components/PlaceDetailSheet.tsx`
  - `_components/PlaceSearch.tsx`
- **Edit:**
  - `ExploreScreen.tsx`
  - `__tests__/explore.router.test.tsx` (add cases)
  - `_components/__tests__/PlaceSearch.router.test.tsx`
- **Create:** `_components/__tests__/PlaceDetailSheet.router.test.tsx`.

**Interfaces:**
- **Consumes:** Tasks 1–4.
- **Produces:**
  - `PlaceDetailSheet({ sheetRef, pin, origin, locale, merchant, labels, onDismiss })`.
  - `PlaceSearch({ pins, onSelectPlace, onSelectStore })`.

- [ ] **Step 1: `_components/PlaceDetailSheet.tsx`, rewritten.**

```tsx
import { BottomSheet } from "@/components/BottomSheet";
import DebouncedPressable from "@/components/DebouncedPressable";
import { Ionicons } from "@/components/Ionicons";
import { Badge, Button, Text } from "@/components/rnr";
import { logger } from "@/utils/logger";
import { colors } from "@/utils/theme";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { BottomSheetView } from "@gorhom/bottom-sheet";
import React from "react";
import { ActivityIndicator, Linking, View } from "react-native";
import type { MapPin } from "../_lib/map";
import { addressLines, directionsUrls, pickAddress, telHref } from "../_lib/merchant";
import { distanceMeters, formatDistance, type LatLng } from "../_lib/places";
import { PlaceTile } from "./PlaceTile";
import type { MerchantDetailState } from "./useMerchantDetail";

export type PlaceDetailLabels = {
  noAddress: string;
  partOf: string;
  notFound: string;
  loadFailed: string;
  tryAgain: string;
  phone: string;
  email: string;
  getDirections: string;
};

function openUrl(url: string) {
  Linking.openURL(url).catch((error: unknown) => {
    logger.warn("[Explore] could not open a link", error);
  });
}

export function PlaceDetailSheet({
  sheetRef,
  pin,
  origin,
  locale,
  merchant,
  labels,
  onDismiss,
}: {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  pin: MapPin | null;
  origin: LatLng | null;
  locale: string;
  merchant: MerchantDetailState & { retry: () => void };
  labels: PlaceDetailLabels;
  onDismiss: () => void;
}) {
  const detail = merchant.status === "ready" ? merchant.detail : null;
  const address = detail && pin ? pickAddress(detail, pin.addressId) : null;
  const lines = address ? addressLines(address) : pin?.addressLine ? [pin.addressLine] : [];
  const urls = pin
    ? directionsUrls({
        latitude: address?.latitude ?? pin.latitude,
        longitude: address?.longitude ?? pin.longitude,
        placeId: address?.placeId ?? null,
      })
    : null;
  const headquarter = detail?.headquarterName?.trim() || pin?.headquarterName;
  const sectors = (detail?.sectors ?? [])
    .map((sector) => sector.name?.trim())
    .filter((name): name is string => Boolean(name));
  const phone = detail?.primaryPhone?.trim() || null;
  const phoneHref = phone ? telHref(phone) : null;
  const email = detail?.primaryEmail?.trim() || null;

  return (
    <BottomSheet onDismiss={onDismiss} ref={sheetRef}>
      <BottomSheetView className="gap-4 p-4 pb-8">
        {pin && urls ? (
          <>
            <View className="flex-row items-start gap-3">
              <PlaceTile layer={pin.layer} />
              <View className="flex-1">
                <Text variant="subheading">{detail?.name?.trim() || pin.name}</Text>
                {headquarter ? (
                  <Text tone="muted" variant="label">
                    {labels.partOf.replace("{name}", headquarter)}
                  </Text>
                ) : null}
              </View>
              {origin ? (
                <Text variant="labelStrong">{formatDistance(distanceMeters(origin, pin), locale)}</Text>
              ) : null}
            </View>

            {sectors.length > 0 ? (
              <View className="flex-row flex-wrap gap-1">
                {sectors.map((name, index) => (
                  <Badge key={`${index}:${name}`} label={name} variant="outline" />
                ))}
              </View>
            ) : null}

            {lines.length > 0 ? (
              <DebouncedPressable
                accessibilityLabel={lines.join(", ")}
                accessibilityRole="link"
                className="flex-row items-start gap-3"
                onPress={() => openUrl(urls.google)}
                testID="explore-place-address"
              >
                <Ionicons className="text-muted" name="location-outline" size={20} />
                <View className="flex-1">
                  {lines.map((line, index) => (
                    <Text key={`${index}:${line}`} variant="body">
                      {line}
                    </Text>
                  ))}
                </View>
              </DebouncedPressable>
            ) : (
              <Text tone="muted" variant="body">
                {labels.noAddress}
              </Text>
            )}

            {phone && phoneHref ? (
              <DebouncedPressable
                accessibilityLabel={`${labels.phone}: ${phone}`}
                accessibilityRole="link"
                className="flex-row items-center gap-3"
                onPress={() => openUrl(phoneHref)}
                testID="explore-place-phone"
              >
                <Ionicons className="text-muted" name="call-outline" size={20} />
                <Text variant="body">{phone}</Text>
              </DebouncedPressable>
            ) : null}

            {email ? (
              <DebouncedPressable
                accessibilityLabel={`${labels.email}: ${email}`}
                accessibilityRole="link"
                className="flex-row items-center gap-3"
                onPress={() => openUrl(`mailto:${encodeURI(email)}`)}
                testID="explore-place-email"
              >
                <Ionicons className="text-muted" name="mail-outline" size={20} />
                <Text variant="body">{email}</Text>
              </DebouncedPressable>
            ) : null}

            {merchant.status === "loading" ? (
              <View className="items-start" testID="explore-place-loading">
                <ActivityIndicator color={colors.foreground} size="small" />
              </View>
            ) : null}
            {merchant.status === "notFound" ? (
              <Text testID="explore-place-not-found" tone="muted" variant="label">
                {labels.notFound}
              </Text>
            ) : null}
            {merchant.status === "error" ? (
              <View className="items-start gap-2" testID="explore-place-error">
                <Text tone="muted" variant="label">
                  {labels.loadFailed}
                </Text>
                <Button action={{ label: labels.tryAgain, onPress: merchant.retry }} size="sm" variant="outline" />
              </View>
            ) : null}

            <Button
              action={{ label: labels.getDirections, onPress: () => openUrl(urls.google) }}
              iconName="navigate-outline"
              testID="explore-directions-google"
            />
            <Button
              action={{ label: "Apple Maps", onPress: () => openUrl(urls.apple) }}
              size="sm"
              testID="explore-directions-apple"
              variant="ghost"
            />
          </>
        ) : null}
      </BottomSheetView>
    </BottomSheet>
  );
}
```

`_components/__tests__/PlaceDetailSheet.router.test.tsx`:

```tsx
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { fireEvent, render, screen } from "@testing-library/react-native";
import React, { createRef } from "react";
import { Linking } from "react-native";
import type { MapPin } from "../../_lib/map";
import { PlaceDetailSheet } from "../PlaceDetailSheet";

jest.mock("@/components/BottomSheet", () => {
  const ReactLib = require("react");
  const { View } = require("react-native");
  return {
    BottomSheet: ReactLib.forwardRef(function Mock(props: { children?: React.ReactNode }, _ref: unknown) {
      return ReactLib.createElement(View, null, props.children);
    }),
  };
});

jest.mock("@gorhom/bottom-sheet", () => {
  const { View } = require("react-native");
  return { __esModule: true, BottomSheetModal: () => null, BottomSheetView: View };
});

const labels = {
  noAddress: "No address",
  partOf: "Part of {name}",
  notFound: "Not on the map",
  loadFailed: "Load failed",
  tryAgain: "Try again",
  phone: "Phone",
  email: "E-mail",
  getDirections: "Get directions",
};

const pin: MapPin = {
  key: "merchants:m1:a2",
  layer: "merchants",
  id: "m1",
  addressId: "a2",
  name: "GalataPort",
  addressLine: "Pin address",
  headquarterName: "Artı Bilgisayar",
  latitude: 41.02,
  longitude: 28.98,
};

const detail = {
  id: "m1",
  name: "GalataPort",
  headquarterName: "Artı Bilgisayar",
  sectors: [{ articleCode: "121", name: "Electronics" }],
  addresses: [
    { addressId: "a1", addressLine: "First", cityName: "İstanbul", latitude: 1, longitude: 2, placeId: null },
    { addressId: "a2", addressLine: "Tapped", districtName: "Beyoğlu", cityName: "İstanbul", latitude: 41.02, longitude: 28.98, placeId: "ChIJ1" },
  ],
  primaryPhone: "+902121234567",
  primaryEmail: "info@example.com",
};

function renderSheet(merchant: React.ComponentProps<typeof PlaceDetailSheet>["merchant"]) {
  render(
    <PlaceDetailSheet
      labels={labels}
      locale="en-US"
      merchant={merchant}
      onDismiss={jest.fn()}
      origin={null}
      pin={pin}
      sheetRef={createRef<BottomSheetModal>()}
    />,
  );
}

beforeEach(() => {
  jest.spyOn(Linking, "openURL").mockResolvedValue(true);
});

it("shows the pin's own data while the merchant loads", () => {
  renderSheet({ status: "loading", retry: jest.fn() });
  expect(screen.getByText("GalataPort")).toBeTruthy();
  expect(screen.getByText("Part of Artı Bilgisayar")).toBeTruthy();
  expect(screen.getByText("Pin address")).toBeTruthy();
  expect(screen.getByTestId("explore-place-loading")).toBeTruthy();
});

it("shows the tapped address, sectors and contacts once loaded, with directions by place id", () => {
  renderSheet({ status: "ready", detail, retry: jest.fn() });
  expect(screen.getByText("Tapped")).toBeTruthy();
  expect(screen.getByText("Beyoğlu, İstanbul")).toBeTruthy();
  expect(screen.getByText("Electronics")).toBeTruthy();
  fireEvent.press(screen.getByTestId("explore-place-phone"));
  expect(Linking.openURL).toHaveBeenCalledWith("tel:+902121234567");
  fireEvent.press(screen.getByTestId("explore-directions-google"));
  expect(Linking.openURL).toHaveBeenCalledWith(
    "https://www.google.com/maps/dir/?api=1&destination=41.02,28.98&destination_place_id=ChIJ1",
  );
});

it("says when the merchant is no longer on the map", () => {
  renderSheet({ status: "notFound", retry: jest.fn() });
  expect(screen.getByText("Not on the map")).toBeTruthy();
});

it("offers a retry when loading failed", () => {
  const retry = jest.fn();
  renderSheet({ status: "error", retry });
  fireEvent.press(screen.getByText("Try again"));
  expect(retry).toHaveBeenCalledTimes(1);
});
```

`DebouncedPressable` may delay or debounce presses. If `fireEvent.press` on the phone row needs it, add `jest.useFakeTimers()` with an advance, matching how other suites test `DebouncedPressable`.

- [ ] **Step 2: `_components/PlaceSearch.tsx`, rewritten.**

```tsx
import DebouncedPressable from "@/components/DebouncedPressable";
import { Ionicons } from "@/components/Ionicons";
import { Input, Text } from "@/components/rnr";
import { useDebounce } from "@/hooks/useDebounce";
import { useLocalization } from "@/providers/LocalizationProvider";
import React, { useMemo, useState } from "react";
import { Keyboard, ScrollView, View } from "react-native";
import type { MapPin } from "../_lib/map";
import { matchStores } from "../_lib/places";
import { PlaceTile } from "./PlaceTile";
import { usePlaceSearch, type PlaceSearchResult } from "./usePlaceSearch";

const SEARCH_DEBOUNCE_MS = 350;

function StatusRow({ label, tone }: { label: string; tone?: "error" }) {
  return (
    <View className="px-3 py-3">
      <Text tone={tone ?? "muted"} variant="body">
        {label}
      </Text>
    </View>
  );
}

function GroupLabel({ label }: { label: string }) {
  return (
    <View className="px-3 pb-1 pt-2">
      <Text className="uppercase" tone="muted" variant="captionStrong">
        {label}
      </Text>
    </View>
  );
}

export function PlaceSearch({
  pins,
  onSelectPlace,
  onSelectStore,
}: {
  pins: MapPin[];
  onSelectPlace: (center: [number, number]) => void;
  onSelectStore: (pin: MapPin) => void;
}) {
  const { t, activeLocale, languageCode } = useLocalization();
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE_MS);
  const state = usePlaceSearch(debouncedQuery, languageCode);
  const stores = useMemo(() => matchStores(pins, query, activeLocale), [pins, query, activeLocale]);
  const hasStores = stores.length > 0;
  const showList = !collapsed && (hasStores || state.status !== "idle");

  function handleChangeText(text: string) {
    setQuery(text);
    setCollapsed(false);
  }

  function close() {
    setQuery("");
    setCollapsed(true);
    Keyboard.dismiss();
  }

  function handleSelectPlace(result: PlaceSearchResult) {
    onSelectPlace(result.center);
    close();
  }

  function handleSelectStore(pin: MapPin) {
    onSelectStore(pin);
    close();
  }

  const placeRows =
    state.status === "loading" ? (
      <StatusRow label={t("MobileApp.Explore.Loading")} />
    ) : state.status === "error" ? (
      <StatusRow label={t("MobileApp.Explore.Error")} tone="error" />
    ) : state.status === "ready" && state.results.length === 0 ? (
      hasStores ? null : (
        <StatusRow label={t("MobileApp.Explore.Empty")} />
      )
    ) : state.status === "ready" ? (
      state.results.map((result) => (
        <DebouncedPressable
          accessibilityLabel={result.label}
          accessibilityRole="button"
          className="border-b border-border px-3 py-2.5"
          key={result.id}
          onPress={() => handleSelectPlace(result)}
        >
          <Text numberOfLines={2} variant="body">
            {result.label}
          </Text>
        </DebouncedPressable>
      ))
    ) : null;

  return (
    <View className="absolute inset-x-0 top-4 px-4">
      <Input
        containerClassName="mb-0"
        iconName="search-outline"
        onChangeText={handleChangeText}
        placeholder={t("MobileApp.Explore.Search.Placeholder")}
        returnKeyType="search"
        rightContent={
          query.length > 0 ? (
            <DebouncedPressable
              accessibilityLabel={t("MobileApp.Explore.Search.Clear")}
              accessibilityRole="button"
              className="pr-3"
              hitSlop={8}
              onPress={close}
            >
              <Ionicons className="text-muted" name="close-circle" size={18} />
            </DebouncedPressable>
          ) : undefined
        }
        size="sm"
        value={query}
      />

      {showList ? (
        <View className="mt-2 max-h-80 overflow-hidden rounded-md border border-border bg-card shadow-lg">
          <ScrollView keyboardShouldPersistTaps="handled">
            {hasStores ? (
              <>
                <GroupLabel label={t("MobileApp.Explore.Search.Stores")} />
                {stores.map((pin) => (
                  <DebouncedPressable
                    accessibilityLabel={pin.name}
                    accessibilityRole="button"
                    className="flex-row items-center gap-3 border-b border-border px-3 py-2.5"
                    key={pin.key}
                    onPress={() => handleSelectStore(pin)}
                    testID={`explore-search-store-${pin.key}`}
                  >
                    <PlaceTile layer={pin.layer} size="sm" />
                    <View className="flex-1">
                      <Text numberOfLines={1} variant="body">
                        {pin.name}
                      </Text>
                      {pin.addressLine ? (
                        <Text numberOfLines={1} tone="muted" variant="label">
                          {pin.addressLine}
                        </Text>
                      ) : null}
                    </View>
                  </DebouncedPressable>
                ))}
              </>
            ) : null}
            {hasStores && placeRows ? <GroupLabel label={t("MobileApp.Explore.Search.Places")} /> : null}
            {placeRows}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
```

In `_components/__tests__/PlaceSearch.router.test.tsx`:
1. Its `useLocalization` mock must return `activeLocale: "en-US"` beside `languageCode`; add the key if missing.
2. Replace every `onSelectResult` with `onSelectPlace`.
3. Pass `pins={[]}` and `onSelectStore={jest.fn()}` to every `<PlaceSearch …>`.
4. Add:

```tsx
it("offers matching stores among the loaded pins, above the places", async () => {
  const onSelectStore = jest.fn();
  const store = {
    key: "merchants:m1:a1",
    layer: "merchants" as const,
    id: "m1",
    addressId: "a1",
    name: "Çiçek Pasajı",
    addressLine: "Beyoğlu",
    headquarterName: null,
    latitude: 41,
    longitude: 29,
  };
  render(<PlaceSearch onSelectPlace={jest.fn()} onSelectStore={onSelectStore} pins={[store]} />);
  fireEvent.changeText(screen.getByPlaceholderText("MobileApp.Explore.Search.Placeholder"), "cicek");
  expect(screen.getByText("MobileApp.Explore.Search.Stores")).toBeTruthy();
  fireEvent.press(screen.getByTestId("explore-search-store-merchants:m1:a1"));
  expect(onSelectStore).toHaveBeenCalledWith(store);
});
```

Adapt the query, mock and timer helpers to whatever the file already uses for typing. The assertions stay as written.

- [ ] **Step 3: `ExploreScreen.tsx`, final.** Starting from the Task 4 version:
  - **Imports:**
    - add `useMerchantDetail` from `"./_components/useMerchantDetail"`;
    - add `autoLocateCenter` to the `./_lib/map` import;
    - add `type LocationResult` from `"@/utils/location"`.
  - **Module constants and helper:**

```tsx
const LOCATE_ON_OPEN_TIMEOUT_MS = 10_000;

function locateWithin(ms: number): Promise<LocationResult | null> {
  return Promise.race([
    getCurrentLocation(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}
```

  - **State, after `selectedPin`:**

```tsx
const merchant = useMerchantDetail(selectedPin?.layer === "merchants" ? selectedPin.id : null);
const locateOnOpenRef = useRef(false);
```

  - **`handleLoaded` becomes:**

```tsx
const handleLoaded = useCallback(() => {
  if (locateOnOpenRef.current) return;
  locateOnOpenRef.current = true;
  void locateWithin(LOCATE_ON_OPEN_TIMEOUT_MS).then((result) => {
    if (!result?.ok) return;
    setUserLocation(result.location);
    const center = autoLocateCenter(result.location, userMovedRef.current);
    if (center) exploreMapRef.current?.jumpTo(center);
  });
}, []);
```

  - **`PlaceSearch`:** `<PlaceSearch onSelectPlace={handleSearchPlace} onSelectStore={(pin) => selectPin(pin, true)} pins={visiblePins} />`.
  - **`PlaceDetailSheet`:**

```tsx
<PlaceDetailSheet
  labels={{
    noAddress: t("MobileApp.Explore.NoAddress"),
    partOf: t("MobileApp.Explore.Place.PartOf"),
    notFound: t("MobileApp.Explore.Place.NotFound"),
    loadFailed: t("MobileApp.Explore.Place.LoadFailed"),
    tryAgain: t("MobileApp.Explore.TryAgain"),
    phone: t("MobileApp.Explore.Place.Phone"),
    email: t("MobileApp.Explore.Place.Email"),
    getDirections: t("MobileApp.Explore.Place.GetDirections"),
  }}
  locale={activeLocale}
  merchant={merchant}
  onDismiss={() => setSelectedPin(null)}
  origin={userLocation}
  pin={selectedPin}
  sheetRef={detailSheetRef}
/>
```

`t("MobileApp.Explore.Place.PartOf")` without values returns the template with `{name}` intact, and the sheet fills it in.

- [ ] **Step 4: Add cases to `__tests__/explore.router.test.tsx`.** Add `getPublicMerchantDetailApi` to the top-level import from `@/actions/CRMService/actions`.

```tsx
it("opens the detail with the merchant's card when a pin is tapped, without moving the camera", async () => {
  const { getPublicMerchantDetailApi } = jest.requireMock("@/actions/CRMService/actions");
  getPublicMerchantDetailApi.mockResolvedValue({ id: "m1", name: "GalataPort", addresses: [] });
  await renderSettled();
  mockCamera.flyTo.mockClear();
  fireEvent.press(screen.getByTestId("annotation-merchants:m1:a1"));
  await waitFor(() => expect(getPublicMerchantDetailApi).toHaveBeenCalledWith("m1"));
  expect(screen.getByTestId("annotation-merchants:m1:a1#selected")).toBeTruthy();
  expect(mockCamera.flyTo).not.toHaveBeenCalled();
});

it("flies a picked row above the sheet", async () => {
  await renderSettled();
  fireEvent.press(screen.getByTestId("explore-place-row-merchants:m1:a1"));
  expect(mockCamera.flyTo).toHaveBeenCalledWith(
    expect.objectContaining({ center: [28.986236, 41.028404], padding: expect.objectContaining({ bottom: expect.any(Number) }) }),
  );
});

describe("locate on open", () => {
  it("jumps to the traveller's position at city zoom when it arrives", async () => {
    (getCurrentLocation as jest.Mock).mockResolvedValue({ ok: true, location: { latitude: 41.0369, longitude: 28.985 } });
    await renderSettled();
    await waitFor(() => expect(mockCamera.jumpTo).toHaveBeenCalledWith({ center: [28.985, 41.0369], zoom: 12 }));
    expect(screen.getByTestId("explore-results-status").props.children).toBe(
      "MobileApp.Explore.Cluster.Place · MobileApp.Explore.Results.Nearest",
    );
  });

  it("stays put when the traveller moved the map first", async () => {
    let resolveLocation: (value: unknown) => void = () => undefined;
    (getCurrentLocation as jest.Mock).mockReturnValue(new Promise((resolve) => (resolveLocation = resolve)));
    await renderSettled();
    act(() => {
      mockMapProps.onRegionWillChange({ nativeEvent: { userInteraction: true } });
    });
    await act(async () => {
      resolveLocation({ ok: true, location: { latitude: 41.0369, longitude: 28.985 } });
    });
    expect(mockCamera.jumpTo).not.toHaveBeenCalled();
  });

  it("says nothing when location is refused", async () => {
    await renderSettled();
    expect(mockToastError).not.toHaveBeenCalled();
    expect(mockCamera.jumpTo).not.toHaveBeenCalled();
  });

  it("counts the zoom buttons as moving the map", async () => {
    let resolveLocation: (value: unknown) => void = () => undefined;
    (getCurrentLocation as jest.Mock).mockReturnValue(new Promise((resolve) => (resolveLocation = resolve)));
    await renderSettled();
    fireEvent.press(screen.getByLabelText("MobileApp.Explore.Controls.ZoomIn"));
    await act(async () => {
      resolveLocation({ ok: true, location: { latitude: 41.0369, longitude: 28.985 } });
    });
    expect(mockCamera.jumpTo).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Run the gates.**
  - `npm run typecheck`;
  - `npm test` (all pass; report counts);
  - `npm run lint` (0 errors; report warnings in the touched files).

- [ ] **Step 6: Commit.** Stage by path.

  ```bash
  git commit -F - <<'EOF'
  feat(explore): show merchant details, suggest stores, and start from the traveller's location

  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  EOF
  ```

---

### Task 6 (controller): gates, review, device check, PR

- [ ] **Run the gates and the final whole-branch review,** then do one fix wave.
- [ ] **Device check, read-only on dev data.**
  1. Pick the attached CPad from `adb devices -l`; CPadNFC is most likely.
  2. Confirm its `super-app` build is `DEBUGGABLE` (match `flags=[`).
  3. Serve the JS with `.\dev-superapp-devices.ps1 -Serial <serial>`, one Metro, never a second instance.
  4. Check:
     - pins and clusters over Istanbul;
     - a cluster tap zooms in;
     - List opens the sheet, and a row picks the place, closes the list, opens the detail and lifts the pin above it;
     - a pin tap opens the detail without moving the camera;
     - the merchant card loads;
     - Get directions opens Maps;
     - store and place search;
     - Layers (Exit points; all off draws nothing);
     - locate-on-open, granted and denied, with no toast when denied;
     - the Locate button, then distances and nearest first.
  5. Take screenshots with `exec-out`, after a settle.
  6. If no debuggable build is attached, record it and hand the user the build command; do not build.
- [ ] **Push `feat/map-improvement` and open the PR** into unirefund-mobile `main`. The body covers:
  - what changed;
  - the Hermes-safe formatting decision;
  - the backend asks (sector list, merchant-name search, paged clustered list);
  - the uat status (endpoints missing there at the time of writing);
  - what was and was not checked on a device.

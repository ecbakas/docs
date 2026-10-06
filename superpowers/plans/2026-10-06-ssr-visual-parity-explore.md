# ssr visual parity, sub-project 4a (Explore): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ssr's `/explore` becomes the app's Explore screen:
- the MapLibre vector map with the OpenFreeMap "Liberty" style;
- the app's pins and clusters;
- a Photon search bar;
- the blob control chain (layers · sector │ locate │ zoom − · zoom +) above the island;
- page-width Layers, Sector and Place sheets.

**Architecture:**
- The app's pure Explore logic is ported into `apps/ssr/src/utils/explore/` as node-tested `.ts` modules: viewport, sectors, layers, Photon, directions and location.
- Standalone components are built first: the control chain on a new shared `BlobRow`, the three sheets, and the search bar.
- Then a client-only `ExploreMap` on `maplibre-gl` and a request-driven `useViewportLayer` replace the Leaflet page in one task.

**Tech stack:** Next.js 16 (App Router), Tailwind v4, `maplibre-gl` 6, `node:test` via `tsx`, `@repo/ayasofyazilim-ui` (Drawer, Button, Badge, Input, sonner).

**Spec:** `C:\unirefund\docs\superpowers\specs\2026-10-06-ssr-visual-parity-explore-notifications-sign-in-design.md`, Section 1. Sections 2 and 3 get their own plans (4b, 4c).

**Where the work happens:**
- **Worktree:** `C:\unirefund\web-app-wt-visual-parity-profile`.
- **Branch:** `feat/ssr-visual-parity-explore`, cut from `feat/ssr-visual-parity-profile-cards` at `998762732` (the head of #315).
- **PR:** targets `feat/ssr-visual-parity-profile-cards`.

`S/` means `apps/ssr/src/`, and `explore/` means `S/app/[lang]/(public)/explore`.

**Plan decisions.** These argue from the spec, and the executor treats each as a ruling.

1. **Photon gets a supported language.** Photon answers `400` for any `lang` outside `default`, `de`, `en` and `fr`, which was checked on 2026-10-06. ssr sends `en`, `de` or `fr` when the UI language matches one of them, and `default` otherwise. The app sends `tr` as it is, so its search fails in Turkish; that is reported to the user, not fixed here.
2. **One shared `BlobRow`.** The tag pager (sub-project 2) already draws the exact 2‑1‑2 chain the app's map controls use: radius 20, pitch 44, gap 39, fillet 7. Its renderer moves to `S/components/shell/blob-row.tsx`, and both the pager and the map controls use it. The pager's markup and test ids do not change.
3. **The map is client-only.** `maplibre-gl` needs `window`, so the page loads `ExploreMap` through `next/dynamic` with `ssr: false`. The map reports its viewport and hands the page a small `ExploreMapHandle` through an `onReady` callback, since a ref does not pass through `next/dynamic` reliably.
4. **Markers are React content in MapLibre markers.** Each pin and cluster is a `maplibre-gl` `Marker` whose element is rendered into with `createPortal`. That keeps Tailwind classes and React handlers on pins without a GL symbol layer.
5. **The attribution line sits below the island**, at the bottom right. The app puts it just above its tab bar, but on the web that spot overlaps the control chain on a 375 px phone. The line is not localized, as in the app.
6. **The page fills the viewport with `h-svh`.** The `(public)` layout has no navbar any more, so the old offset-measuring `use-viewport-fill.ts` goes.

## Global Constraints

- **QR contract.** `/tag/<slug>` and `/{lang}/validate?qrValue=…` are untouched.
- **Explore stays public** (spec decision 3). It calls only the three anonymous CRM viewport actions, unchanged, with the existing `EXPLORE_COUNTRY_TENANT`. No grant gates anything on this page.
- **Map style and start:** `https://tiles.openfreemap.org/styles/liberty`, centre `[28.9966448299549, 41.011903723721645]` (lng/lat), zoom 9. A flight goes to zoom `max(current, 15)`. A cluster tap zooms in by 3, capped at the map's maximum.
- **Fetching:** one request per enabled layer from the map's bounds after it moves, debounced 350 ms. Spans wider than 180° on either axis are skipped. A clustered answer gives only clusters. A failed fetch keeps the previous pins. Out-of-order answers are discarded.
- **Layers default:** merchants on, customs off, refund points off. Turning merchants off clears the chosen sector.
- **Pins:** `w-8 aspect-square rounded-full rounded-bl-none shadow-lg`, rotated −45° with the icon counter-rotated.

  | Layer | Icon | Fill |
  | --- | --- | --- |
  | merchants | `storefront-outline` | `bg-primary` |
  | customs | `business-outline` | `bg-warning` |
  | refund points | `wallet-outline` | `bg-success` |

  The icon is `text-primary-foreground`. Clusters are `size-12 rounded-full border-2 border-primary-foreground bg-primary shadow-lg` for every layer.
- **Sheets are no wider than the page column.** Every `DrawerContent` gets `className="mx-auto w-full max-w-3xl md:border-x"` (user rule, 2026-10-02).
- **Class translation from NativeWind.**
  - `text-muted` and `text-placeholder` become `text-muted-foreground`.
  - A neutral fill `bg-muted` becomes `bg-muted-foreground`.
  - Everything else copies verbatim: `bg-card`, `border-border`, `border-input`, `bg-primary`, `text-primary`, `text-primary-foreground`, `bg-warning`, `bg-success`, `border-warning/40`, `bg-warning-surface`, `text-warning`.
- **Icons** are the shell's generated Ionicons (`S/components/shell/ionicons.tsx`); lucide icons leave this page. The one exception is the locate spinner, which is lucide's `LoaderCircle`, as elsewhere in ssr.
- **ssr strings.**
  - New `SSRService` strings go in both `S/language-data/unirefund/SSRService/resources/en.json` and `tr.json`. Keys are flat, and placeholders are `{0}`.
  - There must be no duplicate keys.
  - Run `pnpm --filter ssr run init` afterwards. Never commit `*.gen.json`.
- **ssr test ids.** Every `Link`, `Button`, `Input`, `Label`, `*Trigger`, `DrawerClose`, `<form>`, `<input>`, `<a>` and native `<button>` carries a `data-testid`. The lint rule `react-require-testid/testid-missing` is an error.
- **ssr tests.** `test:unit` runs `node --import tsx --test "src/**/*.test.ts"`: Node's runner, `.ts` only, no JSX. Test files import their module with a **relative** path, and pure modules import each other relatively.
- **Shared checkouts and processes.**
  - Never run `git reset --hard`, `git stash`, `git checkout --`, `git add -A` or `git add .`. Stage files by name (a task's own directory by path is fine).
  - Implementers never push. Never commit `.env` or submodule pointers. Do not change `packages/utils` (a submodule) or the UI kit's `map` component.
  - **The user's dev server runs on :3001 from `C:\unirefund\web-app-wt-visual-parity`. Never touch it.** Only stop `node.exe` processes whose command line contains `web-app-wt-visual-parity-profile`.
  - Never `next build` while a dev server runs on this checkout.
- **Comments** are rare and short: one line, only where the reason is not obvious.

## Review Focus

1. **The UI in Turkish.** The place search must still return results. Photon rejects `lang=tr` with a 400. Pinned by: Task 1's `photonLang` cases.
2. **The map's first, world-wide viewport, or a view zoomed out past 180°.** No request goes out, so no 400 error banner. Pinned by: Task 1's `isViewportSpanValid` cases.
3. **A chosen sector that is no longer in view.** It stays in the sheet, still selected, and zooming out into clusters keeps the last options rather than emptying the sheet. Pinned by: Task 1's `mergeSelectedSector` and `retainSectorOptions` cases.
4. **Merchants switched off while a sector is chosen.** The sector clears, so switching merchants back on does not silently filter by a sector the traveller can no longer see. Pinned by: Task 1's `toggleLayer` cases.
5. **Location denied, unsupported, or failing.** Each gets its own message instead of a silent no-op. Pinned by: Task 1's `locationFailure` cases.

---

## File structure

| Path | Change |
| --- | --- |
| `S/utils/explore/viewport.ts` + `.test.ts` | new: `LayerKey`, viewport types, `toViewportRequest`, `isViewportSpanValid`, `normalizeViewport` |
| `S/utils/explore/sectors.ts` + `.test.ts` | new: `deriveSectorOptions`, `sameSectorOptions` (moved), `mergeSelectedSector`, `retainSectorOptions` |
| `S/utils/explore/layers.ts` + `.test.ts` | new: `LAYER_ORDER`, `DEFAULT_LAYERS`, `toggleLayer` |
| `S/utils/explore/photon.ts` + `.test.ts` | new: `photonLang`, `photonSearchUrl`, `photonResultLabel`, `toPlaceResult` |
| `S/utils/explore/directions.ts` + `.test.ts` | moved from `explore/_components/directions.ts`, with tests |
| `S/utils/explore/location.ts` + `.test.ts` | new: `locationFailure` |
| `apps/ssr/package.json`, `pnpm-lock.yaml` | `maplibre-gl` |
| `apps/ssr/scripts/gen-ionicons.mjs`, `S/components/shell/ionicons.tsx` | 6 more icons |
| en/tr | the **Strings** tables |
| `S/components/shell/blob-row.tsx` | new: the shared 2‑1‑2 row |
| `S/components/tags/blob-pager.tsx` | renders through `BlobRow` |
| `explore/_components/layer-pins.ts`, `map-controls.tsx`, `layers-sheet.tsx`, `sector-sheet.tsx`, `place-sheet.tsx` | new |
| `explore/_components/use-debounced-value.ts`, `use-place-search.ts`, `place-search.tsx` | new |
| `explore/_components/explore-map.tsx` | new: MapLibre, markers, attribution |
| `explore/_components/use-viewport-layer.ts` | rewritten: request-driven |
| `explore/page.tsx` | rewritten |
| `explore/_components/viewport-layer.tsx`, `place-markers.tsx`, `sector-control.tsx`, `use-viewport-fill.ts`, `directions.ts` | deleted |

## Strings

**New `SSRService` keys**, all added in Task 2. Values come from super-app's `en-US.json` / `tr-TR.json`. Keys marked *web* have no app counterpart.

| Key | en | tr |
| --- | --- | --- |
| `Explore.Controls.Label` (*web*) | Map controls | Harita kontrolleri |
| `Explore.Controls.ZoomIn` | Zoom in | Yakınlaştır |
| `Explore.Controls.ZoomOut` | Zoom out | Uzaklaştır |
| `Explore.Controls.Locate` | My location | Konumum |
| `Explore.Search.Placeholder` | Search for a place... | Bir yer arayın... |
| `Explore.Search.Clear` | Clear search | Aramayı temizle |
| `Explore.Location.Denied` | Location permission is required to find your position on the map. | Haritada konumunuzu bulmak için konum izni gereklidir. |
| `Explore.Location.Unavailable` | Couldn't get your location. Please try again. | Konumunuz alınamadı. Lütfen tekrar deneyin. |
| `Explore.Location.Unsupported` | Location services are turned off on this device. | Bu cihazda konum servisleri kapalı. |

**Changed value:** `Explore.Place.NoAddress`: tr becomes "Adres mevcut değil". en is unchanged.

**Reused unchanged:**
- `Explore.Layers`, `Explore.Layer.*`, `Explore.Sector`, `Explore.Sector.All`;
- `Explore.Loading`, `Explore.Empty`, `Explore.Error`;
- `Explore.Cluster.{Merchants,Customs,RefundPoints}`, used as cluster labels.

**Left orphaned** (named in the PR, not removed):
- `Explore.MapType`, `Explore.MapType.{Default,Street,Satellite}`;
- `Explore.Cluster.ZoomIn`, `Explore.Directions`;
- `PlaceAutocomplete.*`.

---

### Task 0: Setup (controller)

- [ ] **Step 1: Check the worktree.**
  - In `C:\unirefund\web-app-wt-visual-parity-profile`, `git status --short` must be clean, apart from untracked `.env` and `*.gen.json`.
  - The branch is `feat/ssr-visual-parity-profile-cards` at `998762732`.
  - No `node.exe` may have `web-app-wt-visual-parity-profile` in its command line.
- [ ] **Step 2: Branch.** Run `git switch -c feat/ssr-visual-parity-explore`.
- [ ] **Step 3: Measure the baselines and ledger them.**
  - `test:unit`: expect 332 pass.
  - ssr `type-check`: expect 0.
  - ssr `lint`: expect 0 errors and 459 warnings.
  - web `type-check`: expect 0.

---

### Task 1: Pure Explore logic (web-app)

**Files:**
- Create in `S/utils/explore/`:
  - `viewport.ts`, `viewport.test.ts`
  - `sectors.ts`, `sectors.test.ts`
  - `layers.ts`, `layers.test.ts`
  - `photon.ts`, `photon.test.ts`
  - `directions.ts`, `directions.test.ts`
  - `location.ts`, `location.test.ts`
- Modify: `explore/_components/sector-control.tsx` and `explore/_components/place-markers.tsx`, so they import the moved functions.
- Delete: `explore/_components/directions.ts`.

**Interfaces:**
- Consumes: nothing.
- Produces:
  - **`viewport.ts`:**
    - types: `type LayerKey = "merchants" | "customs" | "refundPoints"`, `ViewportRequest`, `ViewportSector`, `ViewportPlace`, `ViewportCluster`, `ViewportLayerState`, `ViewportEnvelope`;
    - `toViewportRequest(bounds: [west, south, east, north]): ViewportRequest`;
    - `isViewportSpanValid(request): boolean`;
    - `normalizeViewport(envelope, key): Omit<ViewportLayerState, "status">`.
  - **`sectors.ts`:**
    - `type SectorOption = { articleCode: string; name: string }`;
    - `deriveSectorOptions(places)`, `sameSectorOptions(a, b)`, `mergeSelectedSector(options, selected)`, `retainSectorOptions(retained, fresh)`.
  - **`layers.ts`:** `LAYER_ORDER`, `DEFAULT_LAYERS`, and `toggleLayer(active, layer): { active; clearSector: boolean }`.
  - **`photon.ts`:**
    - `photonLang(lang)`, `photonSearchUrl(params)`, `photonResultLabel(properties)`, `toPlaceResult(feature, index): PlaceResult | null`;
    - types `PhotonFeature`, `PhotonFeatureCollection`, `PlaceResult = { id: string; label: string; center: [number, number] }`.
  - **`directions.ts`:** `googleMapsUrl(latitude, longitude)` and `appleMapsUrl(latitude, longitude)`.
  - **`location.ts`:** `type LocationFailure = "denied" | "unsupported" | "unavailable"` and `locationFailure(code: number | null)`.

- [ ] **Step 1: Write the failing tests.**

`S/utils/explore/viewport.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isViewportSpanValid,
  normalizeViewport,
  toViewportRequest,
} from "./viewport";

describe("toViewportRequest", () => {
  it("names the four edges of a west-south-east-north box", () => {
    assert.deepEqual(toViewportRequest([28, 40, 30, 42]), {
      south: 40,
      north: 42,
      west: 28,
      east: 30,
    });
  });
});

describe("isViewportSpanValid", () => {
  it("accepts a city-sized window", () => {
    assert.equal(isViewportSpanValid({ south: 40, north: 42, west: 28, east: 30 }), true);
  });
  it("accepts exactly 180 degrees", () => {
    assert.equal(isViewportSpanValid({ south: -90, north: 90, west: 0, east: 180 }), true);
  });
  it("rejects the map's first, world-wide window", () => {
    assert.equal(
      isViewportSpanValid({ south: -85.05, north: 85.05, west: -200, east: 200 }),
      false
    );
  });
  it("rejects a window taller than 180 degrees", () => {
    assert.equal(isViewportSpanValid({ south: -91, north: 90, west: 0, east: 10 }), false);
  });
});

describe("normalizeViewport", () => {
  const place = { id: "m1", name: "Shop", latitude: 41, longitude: 29 };
  const cluster = { count: 12, latitude: 41, longitude: 29 };
  it("keeps only places when the answer is not clustered", () => {
    assert.deepEqual(
      normalizeViewport({ clustered: false, merchants: [place], clusters: [cluster], totalCount: 1 }, "merchants"),
      { places: [place], clusters: [], totalCount: 1 }
    );
  });
  it("keeps only clusters when the answer is clustered", () => {
    assert.deepEqual(
      normalizeViewport({ clustered: true, merchants: [place], clusters: [cluster], totalCount: 12 }, "merchants"),
      { places: [], clusters: [cluster], totalCount: 12 }
    );
  });
  it("reads the array named after its own layer", () => {
    assert.deepEqual(normalizeViewport({ customs: [place] }, "customs").places, [place]);
    assert.deepEqual(normalizeViewport({ customs: [place] }, "refundPoints").places, []);
  });
  it("treats missing fields as empty", () => {
    assert.deepEqual(normalizeViewport({}, "merchants"), { places: [], clusters: [], totalCount: 0 });
  });
});
```

`S/utils/explore/sectors.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveSectorOptions,
  mergeSelectedSector,
  retainSectorOptions,
  sameSectorOptions,
} from "./sectors";

const food = { articleCode: "F", name: "Food" };
const apparel = { articleCode: "A", name: "Apparel" };

describe("deriveSectorOptions", () => {
  it("collects each sector once, sorted by name", () => {
    assert.deepEqual(
      deriveSectorOptions([
        { sectors: [food, apparel] },
        { sectors: [food] },
        { sectors: [{ articleCode: "X", name: null }] },
        {},
      ]),
      [apparel, food]
    );
  });
});

describe("sameSectorOptions", () => {
  it("compares codes in order", () => {
    assert.equal(sameSectorOptions([apparel, food], [apparel, food]), true);
    assert.equal(sameSectorOptions([food, apparel], [apparel, food]), false);
    assert.equal(sameSectorOptions([food], [food, apparel]), false);
  });
});

describe("mergeSelectedSector", () => {
  it("keeps a chosen sector that is no longer in view, first", () => {
    assert.deepEqual(mergeSelectedSector([apparel], food), [food, apparel]);
  });
  it("does not repeat a chosen sector that is in view", () => {
    assert.deepEqual(mergeSelectedSector([apparel, food], food), [apparel, food]);
  });
  it("returns the options unchanged with nothing chosen", () => {
    assert.deepEqual(mergeSelectedSector([apparel], undefined), [apparel]);
  });
});

describe("retainSectorOptions", () => {
  it("keeps the last options while the map shows only clusters", () => {
    const retained = [apparel, food];
    assert.equal(retainSectorOptions(retained, []), retained);
  });
  it("returns the same array when nothing changed", () => {
    const retained = [apparel, food];
    assert.equal(retainSectorOptions(retained, [apparel, food]), retained);
  });
  it("takes new options when they differ", () => {
    assert.deepEqual(retainSectorOptions([apparel], [food]), [food]);
  });
});
```

`S/utils/explore/layers.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_LAYERS, LAYER_ORDER, toggleLayer } from "./layers";

describe("layers", () => {
  it("starts with only merchants on", () => {
    assert.deepEqual(DEFAULT_LAYERS, { merchants: true, customs: false, refundPoints: false });
    assert.deepEqual(LAYER_ORDER, ["merchants", "customs", "refundPoints"]);
  });
  it("clears the sector when merchants are switched off", () => {
    assert.deepEqual(toggleLayer(DEFAULT_LAYERS, "merchants"), {
      active: { merchants: false, customs: false, refundPoints: false },
      clearSector: true,
    });
  });
  it("keeps the sector when merchants are switched on or another layer changes", () => {
    const off = { merchants: false, customs: false, refundPoints: false };
    assert.equal(toggleLayer(off, "merchants").clearSector, false);
    assert.deepEqual(toggleLayer(DEFAULT_LAYERS, "customs"), {
      active: { merchants: true, customs: true, refundPoints: false },
      clearSector: false,
    });
  });
});
```

`S/utils/explore/photon.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  photonLang,
  photonResultLabel,
  photonSearchUrl,
  toPlaceResult,
} from "./photon";

describe("photonLang", () => {
  it("passes the languages Photon supports", () => {
    assert.equal(photonLang("en"), "en");
    assert.equal(photonLang("de"), "de");
    assert.equal(photonLang("fr"), "fr");
  });
  it("uses the base of a regional code", () => {
    assert.equal(photonLang("en-GB"), "en");
  });
  it("falls back to default for Turkish and anything else", () => {
    assert.equal(photonLang("tr"), "default");
    assert.equal(photonLang(""), "default");
  });
});

describe("photonSearchUrl", () => {
  it("encodes the query, language and limit", () => {
    assert.equal(
      photonSearchUrl({ query: "Kadıköy iskele", lang: "default", limit: 6 }),
      "https://photon.komoot.io/api?q=Kad%C4%B1k%C3%B6y+iskele&lang=default&limit=6"
    );
  });
});

describe("photonResultLabel", () => {
  it("joins name, street with number, city, state and country", () => {
    assert.equal(
      photonResultLabel({ name: "Galata Tower", housenumber: "8", street: "Bereketzade", city: "Istanbul", state: "Marmara", country: "Türkiye" }),
      "Galata Tower, 8 Bereketzade, Istanbul, Marmara, Türkiye"
    );
  });
  it("falls back to locality and drops repeats", () => {
    assert.equal(
      photonResultLabel({ name: "Istanbul", locality: "Istanbul", state: "Istanbul", country: "Türkiye" }),
      "Istanbul, Türkiye"
    );
  });
});

describe("toPlaceResult", () => {
  it("reads lon/lat and builds an id from the OSM ids", () => {
    assert.deepEqual(
      toPlaceResult({ geometry: { coordinates: [28.97, 41.02] }, properties: { name: "Eminönü", osm_type: "N", osm_id: 42 } }, 0),
      { id: "N-42", label: "Eminönü", center: [28.97, 41.02] }
    );
  });
  it("falls back to the index for the id", () => {
    assert.equal(toPlaceResult({ geometry: { coordinates: [1, 2] }, properties: {} }, 3)?.id, "result-3");
  });
  it("drops a feature without coordinates", () => {
    assert.equal(toPlaceResult({ properties: { name: "Nowhere" } }, 0), null);
  });
});
```

`S/utils/explore/directions.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { appleMapsUrl, googleMapsUrl } from "./directions";

describe("directions", () => {
  it("builds Google's cross-platform directions link", () => {
    assert.equal(googleMapsUrl(41.0, 28.9), "https://www.google.com/maps/dir/?api=1&destination=41,28.9");
  });
  it("builds Apple's directions link", () => {
    assert.equal(appleMapsUrl(41.0, 28.9), "https://maps.apple.com/?daddr=41,28.9");
  });
});
```

`S/utils/explore/location.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { locationFailure } from "./location";

describe("locationFailure", () => {
  it("names a browser without geolocation unsupported", () => {
    assert.equal(locationFailure(null), "unsupported");
  });
  it("names PERMISSION_DENIED denied", () => {
    assert.equal(locationFailure(1), "denied");
  });
  it("names POSITION_UNAVAILABLE and TIMEOUT unavailable", () => {
    assert.equal(locationFailure(2), "unavailable");
    assert.equal(locationFailure(3), "unavailable");
  });
});
```

- [ ] **Step 2: Run the tests and see them fail.**

Run: `pnpm --filter ssr test:unit`
Expected: FAIL, because the six modules cannot be resolved.

- [ ] **Step 3: Write the modules.**

`S/utils/explore/viewport.ts`:

```ts
export type LayerKey = "merchants" | "customs" | "refundPoints";

export type ViewportRequest = {
  south: number;
  north: number;
  west: number;
  east: number;
};

export type ViewportSector = { articleCode?: string | null; name?: string | null };

export type ViewportPlace = {
  id?: string;
  name?: string | null;
  addressLine?: string | null;
  latitude?: number;
  longitude?: number;
  sectors?: ViewportSector[] | null;
};

export type ViewportCluster = { count?: number; latitude?: number; longitude?: number };

export type ViewportLayerState = {
  status: "loading" | "ready" | "error";
  places: ViewportPlace[];
  clusters: ViewportCluster[];
  totalCount: number;
};

export type ViewportEnvelope = {
  clustered?: boolean;
  clusters?: ViewportCluster[] | null;
  totalCount?: number;
} & Partial<Record<LayerKey, ViewportPlace[] | null>>;

export function toViewportRequest([west, south, east, north]: [
  number,
  number,
  number,
  number,
]): ViewportRequest {
  return { south, north, west, east };
}

// The endpoints reject a window wider than this on either axis (CRM 029002).
const MAX_SPAN_DEGREES = 180;

export function isViewportSpanValid(request: ViewportRequest): boolean {
  return (
    request.north - request.south <= MAX_SPAN_DEGREES &&
    request.east - request.west <= MAX_SPAN_DEGREES
  );
}

export function normalizeViewport(
  envelope: ViewportEnvelope,
  key: LayerKey
): Omit<ViewportLayerState, "status"> {
  return {
    places: envelope.clustered ? [] : (envelope[key] ?? []),
    clusters: envelope.clustered ? (envelope.clusters ?? []) : [],
    totalCount: envelope.totalCount ?? 0,
  };
}
```

`S/utils/explore/sectors.ts`:

```ts
import type { ViewportPlace } from "./viewport";

export type SectorOption = { articleCode: string; name: string };

// There is no anonymous sector list, so the options come from the pins in view.
export function deriveSectorOptions(places: ViewportPlace[]): SectorOption[] {
  const byCode = new Map<string, string>();
  for (const place of places) {
    for (const sector of place.sectors ?? []) {
      if (sector.articleCode && sector.name) {
        byCode.set(sector.articleCode, sector.name);
      }
    }
  }
  return [...byCode.entries()]
    .map(([articleCode, name]) => ({ articleCode, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function sameSectorOptions(a: SectorOption[], b: SectorOption[]): boolean {
  return (
    a.length === b.length &&
    a.every((option, index) => option.articleCode === b[index]?.articleCode)
  );
}

export function mergeSelectedSector(
  options: SectorOption[],
  selected: SectorOption | undefined
): SectorOption[] {
  if (!selected) return options;
  if (options.some((option) => option.articleCode === selected.articleCode)) {
    return options;
  }
  return [selected, ...options];
}

export function retainSectorOptions(
  retained: SectorOption[],
  fresh: SectorOption[]
): SectorOption[] {
  if (fresh.length === 0 || sameSectorOptions(fresh, retained)) return retained;
  return fresh;
}
```

`S/utils/explore/layers.ts`:

```ts
import type { LayerKey } from "./viewport";

export const LAYER_ORDER: LayerKey[] = ["merchants", "customs", "refundPoints"];

export const DEFAULT_LAYERS: Record<LayerKey, boolean> = {
  merchants: true,
  customs: false,
  refundPoints: false,
};

export function toggleLayer(
  active: Record<LayerKey, boolean>,
  layer: LayerKey
): { active: Record<LayerKey, boolean>; clearSector: boolean } {
  return {
    active: { ...active, [layer]: !active[layer] },
    clearSector: layer === "merchants" && active.merchants,
  };
}
```

`S/utils/explore/photon.ts`:

```ts
const PHOTON_API_URL = "https://photon.komoot.io/api";
const PHOTON_LANGS = ["en", "de", "fr"];

export type PhotonResultProperties = {
  name?: string;
  housenumber?: string;
  street?: string;
  city?: string;
  locality?: string;
  state?: string;
  country?: string;
  osm_id?: number;
  osm_type?: string;
};

export type PhotonFeature = {
  geometry?: { coordinates?: number[] };
  properties?: PhotonResultProperties;
};

export type PhotonFeatureCollection = { features?: PhotonFeature[] };

export type PlaceResult = { id: string; label: string; center: [number, number] };

// Photon answers 400 for any language outside default/de/en/fr.
export function photonLang(lang: string): string {
  const base = lang.toLowerCase().split("-")[0] ?? "";
  return PHOTON_LANGS.includes(base) ? base : "default";
}

export function photonSearchUrl({
  query,
  lang,
  limit,
}: {
  query: string;
  lang: string;
  limit: number;
}): string {
  const search = new URLSearchParams();
  search.set("q", query);
  search.set("lang", lang);
  search.set("limit", String(limit));
  return `${PHOTON_API_URL}?${search.toString()}`;
}

export function photonResultLabel(properties: PhotonResultProperties): string {
  const { name, housenumber, street, city, locality, state, country } = properties;
  const streetPart = street ? (housenumber ? `${housenumber} ${street}` : street) : undefined;
  const parts = [name, streetPart, city ?? locality, state, country].filter(
    (part): part is string => Boolean(part)
  );
  return [...new Set(parts)].join(", ");
}

export function toPlaceResult(feature: PhotonFeature, index: number): PlaceResult | null {
  const [lon, lat] = feature.geometry?.coordinates ?? [];
  if (typeof lon !== "number" || typeof lat !== "number") return null;
  const properties = feature.properties ?? {};
  return {
    id:
      properties.osm_type && properties.osm_id !== undefined
        ? `${properties.osm_type}-${properties.osm_id}`
        : `result-${index}`,
    label: photonResultLabel(properties),
    center: [lon, lat],
  };
}
```

`S/utils/explore/directions.ts`: this is today's `explore/_components/directions.ts`, moved:

```ts
export function googleMapsUrl(latitude: number, longitude: number) {
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
}

export function appleMapsUrl(latitude: number, longitude: number) {
  return `https://maps.apple.com/?daddr=${latitude},${longitude}`;
}
```

`S/utils/explore/location.ts`:

```ts
export type LocationFailure = "denied" | "unsupported" | "unavailable";

// `code` is a GeolocationPositionError code, or null when the browser has no geolocation.
export function locationFailure(code: number | null): LocationFailure {
  if (code === null) return "unsupported";
  return code === 1 ? "denied" : "unavailable";
}
```

- [ ] **Step 4: Point today's components at the moved code.**
  - In `explore/_components/sector-control.tsx`: delete its local `SectorOption`, `deriveSectorOptions` and `sameSectorOptions`. Import `SectorOption`, `deriveSectorOptions` and `sameSectorOptions` from `@/src/utils/explore/sectors` and re-export them (`export { deriveSectorOptions, sameSectorOptions, type SectorOption }`) so `page.tsx` keeps compiling until Task 5 rewrites it.
  - In `explore/_components/place-markers.tsx`: import `googleMapsUrl` and `appleMapsUrl` from `@/src/utils/explore/directions`.
  - Delete `explore/_components/directions.ts`.
- [ ] **Step 5: Run the tests and see them pass.**

Run: `pnpm --filter ssr test:unit`
Expected: PASS, 332 plus the new cases (about 30), with no failures.

Also run `pnpm --filter ssr type-check` (0) and `pnpm --filter ssr lint` (0 errors).

- [ ] **Step 6: Commit.**

```bash
git add apps/ssr/src/utils/explore/ "apps/ssr/src/app/[lang]/(public)/explore/_components/sector-control.tsx" "apps/ssr/src/app/[lang]/(public)/explore/_components/place-markers.tsx" "apps/ssr/src/app/[lang]/(public)/explore/_components/directions.ts"
git commit -m "feat(ssr): port the app's Explore rules into tested modules"
```

---

### Task 2: The map dependency, icons and strings (web-app)

**Files:**
- Modify: `apps/ssr/package.json`, `pnpm-lock.yaml`, `apps/ssr/scripts/gen-ionicons.mjs`.
- Regenerate: `S/components/shell/ionicons.tsx`.
- Modify: en/tr.

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `maplibre-gl` importable from `apps/ssr`.
  - Icons `IoWalletOutline`, `IoLayersOutline`, `IoFunnelOutline`, `IoLocate`, `IoAdd`, `IoRemove`.
  - Every key in the plan's **Strings** tables.

- [ ] **Step 1: The dependency.**
  - Run `pnpm --filter ssr add maplibre-gl@^6.12.0`.
  - Confirm the stylesheet path the package exports. `ls node_modules/maplibre-gl/dist/maplibre-gl.css` from `apps/ssr` must list the file; if the path differs, record the real one in the report for Task 5.
- [ ] **Step 2: Icons.**
  - Append these to `NAMES` in `apps/ssr/scripts/gen-ionicons.mjs`: `"wallet-outline"`, `"layers-outline"`, `"funnel-outline"`, `"locate"`, `"add"`, `"remove"`.
  - Run `node apps/ssr/scripts/gen-ionicons.mjs`.
  - `grep -c "^export function Io" apps/ssr/src/components/shell/ionicons.tsx` must print `64`.
- [ ] **Step 3: Strings.**
  - Add every key in the **New** table to en and tr, after the last existing `Explore.*` key, with the values exactly as written.
  - Change tr `Explore.Place.NoAddress` to `Adres mevcut değil`.
  - Run `pnpm --filter ssr run init`.
  - The key-parity check must print `ok`:

```bash
node -e "const r='./apps/ssr/src/language-data/unirefund/SSRService/resources/';const en=require(r+'en.json'),tr=require(r+'tr.json');const a=Object.keys(en);console.log(a.length===Object.keys(tr).length&&a.every(k=>k in tr)?'ok':'mismatch')"
```

  - The duplicate check must print nothing:

```bash
for f in en tr; do grep -o '^  "[^"]*":' apps/ssr/src/language-data/unirefund/SSRService/resources/$f.json | sort | uniq -d; done
```

- [ ] **Step 4: Gates.** `pnpm --filter ssr type-check` gives 0, and `pnpm --filter ssr lint` gives 0 errors.
- [ ] **Step 5: Commit.**

```bash
git add apps/ssr/package.json pnpm-lock.yaml apps/ssr/scripts/gen-ionicons.mjs apps/ssr/src/components/shell/ionicons.tsx apps/ssr/src/language-data/unirefund/SSRService/resources/en.json apps/ssr/src/language-data/unirefund/SSRService/resources/tr.json
git commit -m "feat(ssr): add maplibre-gl, the map control icons and the Explore strings"
```

---

### Task 3: The control chain and the three sheets (web-app)

These components are standalone. Task 5 wires them into the page.

**Files:**
- Create:
  - `S/components/shell/blob-row.tsx`
  - in `explore/_components/`: `layer-pins.ts`, `map-controls.tsx`, `layers-sheet.tsx`, `sector-sheet.tsx`, `place-sheet.tsx`
- Modify: `S/components/tags/blob-pager.tsx`.

**Interfaces:**
- Consumes:
  - Task 1: `LayerKey`, `ViewportPlace`, `SectorOption`, `mergeSelectedSector`, `LAYER_ORDER`, `googleMapsUrl`, `appleMapsUrl`.
  - Task 2: the icons and strings.
- Produces:
  - `BlobRow({ label, testId, groups })`.
  - `LAYER_PINS: Record<LayerKey, { Icon: IconComponent; fill: string }>`.
  - `MapControls({ locating, sectorActive, onOpenLayers, onOpenSector, onLocate, onZoomIn, onZoomOut })`.
  - `LayersSheet({ open, onOpenChange, active, onToggle })`.
  - `SectorSheet({ open, onOpenChange, options, selected, onSelect })`.
  - `PlaceSheet({ place, open, onOpenChange })`.

- [ ] **Step 1: The shared row.** Create `S/components/shell/blob-row.tsx`. It is today's pager markup, made reusable:

```tsx
import type { ReactNode } from "react";
import { blobChain } from "./blob-chain";

const ROW_CHAIN = blobChain({
  groups: [2, 1, 2],
  radius: 20,
  slotPitch: 44,
  gap: 39,
  fillet: 7,
});

export function BlobRow({
  label,
  testId,
  groups,
}: {
  label: string;
  testId: string;
  groups: [ReactNode, ReactNode, ReactNode];
}) {
  return (
    <nav
      aria-label={label}
      className="relative"
      data-testid={testId}
      style={{ width: ROW_CHAIN.width, height: ROW_CHAIN.height }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 backdrop-blur-md"
        style={{ clipPath: `path("${ROW_CHAIN.path}")` }}
      />
      <svg
        aria-hidden="true"
        className="absolute inset-0 overflow-visible"
        height={ROW_CHAIN.height}
        viewBox={`0 0 ${ROW_CHAIN.width} ${ROW_CHAIN.height}`}
        width={ROW_CHAIN.width}
      >
        <path className="fill-card/92 stroke-border" d={ROW_CHAIN.path} strokeWidth={1} />
      </svg>
      {ROW_CHAIN.segments.map((segment, index) => (
        <div
          className="absolute inset-y-0 flex items-center justify-center"
          key={segment.x}
          style={{ left: segment.x, width: segment.width }}
        >
          {groups[index]}
        </div>
      ))}
    </nav>
  );
}
```

- [ ] **Step 2: The pager uses it.** In `S/components/tags/blob-pager.tsx`:
  - delete the `CHAIN` constant and the `blobChain` import;
  - type `groups` as `[ReactNode, ReactNode, ReactNode]` (import `ReactNode` from `react`);
  - replace the returned `<nav>…</nav>` with:

```tsx
return (
  <BlobRow
    groups={groups}
    label={t.SSRService["Tags.Pager.Label"]}
    testId="tag-pager"
  />
);
```

  Import `BlobRow` from `@/src/components/shell/blob-row`. The step links, the counter and their test ids stay as they are.

- [ ] **Step 3: The pin config.** Create `explore/_components/layer-pins.ts`:

```ts
import {
  IoBusinessOutline,
  IoStorefrontOutline,
  IoWalletOutline,
} from "@/src/components/shell/ionicons";
import type { LayerKey } from "@/src/utils/explore/viewport";

export const LAYER_PINS: Record<
  LayerKey,
  { Icon: typeof IoStorefrontOutline; fill: string }
> = {
  merchants: { Icon: IoStorefrontOutline, fill: "bg-primary" },
  customs: { Icon: IoBusinessOutline, fill: "bg-warning" },
  refundPoints: { Icon: IoWalletOutline, fill: "bg-success" },
};
```

- [ ] **Step 4: The control chain.** Create `explore/_components/map-controls.tsx`. It floats where the tag pager does, in `PinnedBar`, 10 px above the island:

```tsx
"use client";
import { BlobRow } from "@/src/components/shell/blob-row";
import {
  IoAdd,
  IoFunnelOutline,
  IoLayersOutline,
  IoLocate,
  IoRemove,
} from "@/src/components/shell/ionicons";
import { PinnedBar } from "@/src/components/shell/pinned-bar";
import { useTranslations } from "@/src/providers/i18n";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import { LoaderCircle } from "lucide-react";

function Control({
  id,
  label,
  Icon,
  onClick,
  loading = false,
  tinted = false,
}: {
  id: string;
  label: string;
  Icon: typeof IoAdd;
  onClick: () => void;
  loading?: boolean;
  tinted?: boolean;
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        "flex size-10 items-center justify-center",
        tinted ? "text-primary" : "text-foreground"
      )}
      data-testid={`explore-control-${id}`}
      disabled={loading}
      onClick={onClick}
      title={label}
      type="button"
    >
      {loading ? <LoaderCircle className="size-5 animate-spin" /> : <Icon size={20} />}
    </button>
  );
}

export function MapControls({
  locating,
  sectorActive,
  onOpenLayers,
  onOpenSector,
  onLocate,
  onZoomIn,
  onZoomOut,
}: {
  locating: boolean;
  sectorActive: boolean;
  onOpenLayers: () => void;
  onOpenSector: () => void;
  onLocate: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  const { t } = useTranslations();
  const copy = t.SSRService;
  return (
    <PinnedBar testId="explore-controls">
      <BlobRow
        groups={[
          [
            <Control Icon={IoLayersOutline} id="layers" key="layers" label={copy["Explore.Layers"]} onClick={onOpenLayers} />,
            <Control Icon={IoFunnelOutline} id="sector" key="sector" label={copy["Explore.Sector"]} onClick={onOpenSector} tinted={sectorActive} />,
          ],
          [
            <Control Icon={IoLocate} id="locate" key="locate" label={copy["Explore.Controls.Locate"]} loading={locating} onClick={onLocate} />,
          ],
          [
            <Control Icon={IoRemove} id="zoom-out" key="zoom-out" label={copy["Explore.Controls.ZoomOut"]} onClick={onZoomOut} />,
            <Control Icon={IoAdd} id="zoom-in" key="zoom-in" label={copy["Explore.Controls.ZoomIn"]} onClick={onZoomIn} />,
          ],
        ]}
        label={copy["Explore.Controls.Label"]}
        testId="explore-controls-chain"
      />
    </PinnedBar>
  );
}
```

- [ ] **Step 5: The Layers sheet.** Create `explore/_components/layers-sheet.tsx`. Like the app's sheets it has a title and no close button; swiping down, the overlay and Escape close it.

```tsx
"use client";
import { IoCheckmarkCircle, IoEllipseOutline } from "@/src/components/shell/ionicons";
import { useTranslations } from "@/src/providers/i18n";
import { LAYER_ORDER } from "@/src/utils/explore/layers";
import type { LayerKey } from "@/src/utils/explore/viewport";
import { Drawer, DrawerContent, DrawerTitle } from "@repo/ayasofyazilim-ui/components/drawer";
import { LAYER_PINS } from "./layer-pins";

const LABEL_KEYS = {
  merchants: "Explore.Layer.Merchants",
  customs: "Explore.Layer.Customs",
  refundPoints: "Explore.Layer.RefundPoints",
} as const;

export function LayersSheet({
  open,
  onOpenChange,
  active,
  onToggle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  active: Record<LayerKey, boolean>;
  onToggle: (layer: LayerKey) => void;
}) {
  const { t } = useTranslations();
  const copy = t.SSRService;
  return (
    <Drawer onOpenChange={onOpenChange} open={open}>
      <DrawerContent
        aria-describedby={undefined}
        className="mx-auto w-full max-w-3xl md:border-x"
        data-testid="explore-layers-sheet"
      >
        <div className="flex flex-col gap-1 p-4 pb-8">
          <DrawerTitle className="mb-1 text-lg font-semibold text-foreground">
            {copy["Explore.Layers"]}
          </DrawerTitle>
          {LAYER_ORDER.map((layer) => {
            const { Icon } = LAYER_PINS[layer];
            const on = active[layer];
            return (
              <button
                aria-checked={on}
                className="flex items-center justify-between rounded-md px-2 py-3 text-left"
                data-testid={`explore-layer-${layer}`}
                key={layer}
                onClick={() => onToggle(layer)}
                role="checkbox"
                type="button"
              >
                <span className="flex items-center gap-3 text-base text-foreground">
                  <Icon size={20} />
                  {copy[LABEL_KEYS[layer]]}
                </span>
                {on ? (
                  <IoCheckmarkCircle className="text-primary" size={22} />
                ) : (
                  <IoEllipseOutline className="text-muted-foreground" size={22} />
                )}
              </button>
            );
          })}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 6: The Sector sheet.** Create `explore/_components/sector-sheet.tsx`:

```tsx
"use client";
import { IoCheckmark } from "@/src/components/shell/ionicons";
import { useTranslations } from "@/src/providers/i18n";
import { mergeSelectedSector, type SectorOption } from "@/src/utils/explore/sectors";
import { Drawer, DrawerContent, DrawerTitle } from "@repo/ayasofyazilim-ui/components/drawer";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";

function SectorRow({
  id,
  label,
  selected,
  onClick,
}: {
  id: string;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-checked={selected}
      className="flex items-center justify-between rounded-md px-2 py-3 text-left"
      data-testid={`explore-sector-${id}`}
      onClick={onClick}
      role="radio"
      type="button"
    >
      <span className={cn("text-base", selected ? "text-primary" : "text-foreground")}>
        {label}
      </span>
      {selected ? <IoCheckmark className="text-primary" size={20} /> : null}
    </button>
  );
}

export function SectorSheet({
  open,
  onOpenChange,
  options,
  selected,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: SectorOption[];
  selected: SectorOption | undefined;
  onSelect: (sector: SectorOption | undefined) => void;
}) {
  const { t } = useTranslations();
  const copy = t.SSRService;
  const choices = mergeSelectedSector(options, selected);

  function choose(option: SectorOption | undefined) {
    onSelect(option);
    onOpenChange(false);
  }

  return (
    <Drawer onOpenChange={onOpenChange} open={open}>
      <DrawerContent
        aria-describedby={undefined}
        className="mx-auto w-full max-w-3xl md:border-x"
        data-testid="explore-sector-sheet"
      >
        <div className="flex min-h-0 flex-col gap-1 overflow-y-auto p-4 pb-8" role="radiogroup">
          <DrawerTitle className="mb-1 text-lg font-semibold text-foreground">
            {copy["Explore.Sector"]}
          </DrawerTitle>
          <SectorRow
            id="all"
            label={copy["Explore.Sector.All"]}
            onClick={() => choose(undefined)}
            selected={selected === undefined}
          />
          {choices.map((option) => (
            <SectorRow
              id={option.articleCode}
              key={option.articleCode}
              label={option.name}
              onClick={() => choose(option)}
              selected={selected?.articleCode === option.articleCode}
            />
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 7: The Place sheet.** Create `explore/_components/place-sheet.tsx`. The page keeps the last place while the sheet animates out, so `place` and `open` are separate props.

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { appleMapsUrl, googleMapsUrl } from "@/src/utils/explore/directions";
import type { ViewportPlace } from "@/src/utils/explore/viewport";
import { Badge } from "@repo/ayasofyazilim-ui/components/badge";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import { Drawer, DrawerContent, DrawerTitle } from "@repo/ayasofyazilim-ui/components/drawer";

export function PlaceSheet({
  place,
  open,
  onOpenChange,
}: {
  place: ViewportPlace | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslations();
  const copy = t.SSRService;
  const latitude = place?.latitude;
  const longitude = place?.longitude;
  const sectors = (place?.sectors ?? [])
    .map((sector) => sector.name)
    .filter((name): name is string => Boolean(name));

  return (
    <Drawer onOpenChange={onOpenChange} open={open}>
      <DrawerContent
        aria-describedby={undefined}
        className="mx-auto w-full max-w-3xl md:border-x"
        data-testid="explore-place-sheet"
      >
        <div className="flex flex-col gap-2 p-4 pb-8">
          <DrawerTitle className="text-lg font-semibold text-foreground">
            {place?.name?.trim()}
          </DrawerTitle>
          <p className="text-base text-muted-foreground">
            {place?.addressLine || copy["Explore.Place.NoAddress"]}
          </p>
          {sectors.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {sectors.map((name) => (
                <Badge key={name} variant="outline">
                  {name}
                </Badge>
              ))}
            </div>
          ) : null}
          {latitude !== undefined && longitude !== undefined ? (
            <div className="flex gap-2 pt-2">
              <Button asChild data-testid="explore-directions-google" size="sm" variant="secondary">
                <a data-testid="explore-directions-google" href={googleMapsUrl(latitude, longitude)} rel="noopener noreferrer" target="_blank">
                  Google Maps
                </a>
              </Button>
              <Button asChild data-testid="explore-directions-apple" size="sm" variant="secondary">
                <a data-testid="explore-directions-apple" href={appleMapsUrl(latitude, longitude)} rel="noopener noreferrer" target="_blank">
                  Apple Maps
                </a>
              </Button>
            </div>
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

"Google Maps" and "Apple Maps" are brand names and stay unlocalized, as in the app.

- [ ] **Step 8: Gates.**
  - `pnpm --filter ssr test:unit` passes (no new suites; the pure rules were tested in Task 1).
  - `pnpm --filter ssr type-check` gives 0, and `pnpm --filter ssr lint` gives 0 errors.
  - The tag pager's markup must be unchanged. `git diff` of `blob-pager.tsx` shows only the `CHAIN` removal, the `groups` type and the `BlobRow` call.
- [ ] **Step 9: Commit.**

```bash
git add apps/ssr/src/components/shell/blob-row.tsx apps/ssr/src/components/tags/blob-pager.tsx "apps/ssr/src/app/[lang]/(public)/explore/_components/layer-pins.ts" "apps/ssr/src/app/[lang]/(public)/explore/_components/map-controls.tsx" "apps/ssr/src/app/[lang]/(public)/explore/_components/layers-sheet.tsx" "apps/ssr/src/app/[lang]/(public)/explore/_components/sector-sheet.tsx" "apps/ssr/src/app/[lang]/(public)/explore/_components/place-sheet.tsx"
git commit -m "feat(ssr): add the app's map control chain and Explore sheets"
```

---

### Task 4: The place search bar (web-app)

Standalone; Task 5 wires it into the page.

**Files:**
- Create in `explore/_components/`: `use-debounced-value.ts`, `use-place-search.ts`, `place-search.tsx`.

**Interfaces:**
- Consumes: Task 1's `photonLang`, `photonSearchUrl`, `toPlaceResult`, `PhotonFeatureCollection` and `PlaceResult`; Task 2's `IoSearchOutline` and `IoCloseCircle` (existing) and strings.
- Produces:
  - `useDebouncedValue<T>(value: T, delay: number): T`.
  - `usePlaceSearch(query: string, lang: string): PlaceSearchState`.
  - `PlaceSearch({ onSelect: (center: [number, number]) => void })`.

- [ ] **Step 1: The debounce hook.** Create `explore/_components/use-debounced-value.ts`:

```ts
"use client";
import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
```

- [ ] **Step 2: The search hook.** Create `explore/_components/use-place-search.ts`:

```ts
"use client";
import {
  photonLang,
  photonSearchUrl,
  toPlaceResult,
  type PhotonFeatureCollection,
  type PlaceResult,
} from "@/src/utils/explore/photon";
import { useEffect, useState } from "react";

export type PlaceSearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; results: PlaceResult[] }
  | { status: "error" };

const RESULT_LIMIT = 6;

export function usePlaceSearch(query: string, lang: string): PlaceSearchState {
  const [state, setState] = useState<PlaceSearchState>({ status: "idle" });
  const trimmed = query.trim();

  useEffect(() => {
    if (!trimmed) {
      setState({ status: "idle" });
      return;
    }
    const controller = new AbortController();
    setState({ status: "loading" });
    fetch(photonSearchUrl({ query: trimmed, lang: photonLang(lang), limit: RESULT_LIMIT }), {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Photon responded ${response.status}`);
        return response.json() as Promise<PhotonFeatureCollection>;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setState({
          status: "ready",
          results: (data.features ?? [])
            .map(toPlaceResult)
            .filter((result): result is PlaceResult => result !== null),
        });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setState({ status: "error" });
      });
    return () => controller.abort();
  }, [trimmed, lang]);

  return state;
}
```

- [ ] **Step 3: The search bar.** Create `explore/_components/place-search.tsx`:

```tsx
"use client";
import { IoCloseCircle, IoSearchOutline } from "@/src/components/shell/ionicons";
import { useTranslations } from "@/src/providers/i18n";
import { Input } from "@repo/ayasofyazilim-ui/components/input";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useDebouncedValue } from "./use-debounced-value";
import { usePlaceSearch } from "./use-place-search";

const SEARCH_DEBOUNCE_MS = 350;

function StatusRow({ label, error = false }: { label: string; error?: boolean }) {
  return (
    <p className={cn("px-3 py-3 text-base", error ? "text-error" : "text-muted-foreground")}>
      {label}
    </p>
  );
}

export function PlaceSearch({ onSelect }: { onSelect: (center: [number, number]) => void }) {
  const { t } = useTranslations();
  const copy = t.SSRService;
  const { lang } = useParams<{ lang: string }>();
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const state = usePlaceSearch(useDebouncedValue(query, SEARCH_DEBOUNCE_MS), lang);
  const showList = !collapsed && state.status !== "idle";

  function clear() {
    setQuery("");
    setCollapsed(true);
  }

  return (
    <div className="absolute inset-x-0 top-4 z-10 mx-auto w-full max-w-3xl px-4" data-testid="explore-search">
      <div className="relative">
        <IoSearchOutline
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
          size={18}
        />
        <Input
          aria-label={copy["Explore.Search.Placeholder"]}
          className="h-10 bg-card pr-10 pl-10 shadow-md"
          data-testid="explore-search-input"
          enterKeyHint="search"
          onChange={(e) => {
            setQuery(e.target.value);
            setCollapsed(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setCollapsed(true);
          }}
          placeholder={copy["Explore.Search.Placeholder"]}
          value={query}
        />
        {query ? (
          <button
            aria-label={copy["Explore.Search.Clear"]}
            className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground"
            data-testid="explore-search-clear"
            onClick={clear}
            type="button"
          >
            <IoCloseCircle size={18} />
          </button>
        ) : null}
      </div>
      {showList ? (
        <div
          className="mt-2 max-h-64 overflow-y-auto rounded-md border border-border bg-card shadow-lg"
          data-testid="explore-search-results"
        >
          {state.status === "loading" ? (
            <StatusRow label={copy["Explore.Loading"]} />
          ) : state.status === "error" ? (
            <StatusRow error label={copy["Explore.Error"]} />
          ) : state.status === "ready" && state.results.length === 0 ? (
            <StatusRow label={copy["Explore.Empty"]} />
          ) : state.status === "ready" ? (
            state.results.map((result) => (
              <button
                className="block w-full border-b border-border px-3 py-2.5 text-left text-base text-foreground last:border-b-0"
                data-testid={`explore-search-result-${result.id}`}
                key={result.id}
                onClick={() => {
                  onSelect(result.center);
                  clear();
                }}
                type="button"
              >
                <span className="line-clamp-2">{result.label}</span>
              </button>
            ))
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Gates.** `pnpm --filter ssr test:unit` passes, `pnpm --filter ssr type-check` gives 0, and `pnpm --filter ssr lint` gives 0 errors.
- [ ] **Step 5: Commit.**

```bash
git add "apps/ssr/src/app/[lang]/(public)/explore/_components/use-debounced-value.ts" "apps/ssr/src/app/[lang]/(public)/explore/_components/use-place-search.ts" "apps/ssr/src/app/[lang]/(public)/explore/_components/place-search.tsx"
git commit -m "feat(ssr): add the app's place search bar for Explore"
```

---

### Task 5: The MapLibre map and the new page (web-app)

**Files:**
- Create: `explore/_components/explore-map.tsx`.
- Rewrite: `explore/_components/use-viewport-layer.ts`, `explore/page.tsx`.
- Delete in `explore/_components/`: `viewport-layer.tsx`, `place-markers.tsx`, `sector-control.tsx`, `use-viewport-fill.ts`.

**Interfaces:**
- Consumes:
  - Task 1: all of `viewport.ts`, `sectors.ts`, `layers.ts` and `location.ts`.
  - Task 2: `maplibre-gl` (stylesheet path as recorded), and the strings.
  - Task 3: `LAYER_PINS`, `MapControls`, `LayersSheet`, `SectorSheet`, `PlaceSheet`.
  - Task 4: `useDebouncedValue`, `PlaceSearch`.
- Produces:
  - `ExploreMap({ places, clusters, clusterLabel, onViewportChange, onSelectPlace, onReady })`.
  - `ExploreMapHandle = { zoomIn; zoomOut; flyTo(center) }`.
  - `useViewportLayer({ request, enabled, envelopeKey, fetcher })`.
  - The route `/{lang}/explore`, rebuilt.

- [ ] **Step 1: The layer hook.** Replace `explore/_components/use-viewport-layer.ts` with:

```ts
"use client";
import {
  normalizeViewport,
  type LayerKey,
  type ViewportEnvelope,
  type ViewportLayerState,
  type ViewportRequest,
} from "@/src/utils/explore/viewport";
import { useEffect, useState } from "react";

const INITIAL: ViewportLayerState = {
  status: "loading",
  places: [],
  clusters: [],
  totalCount: 0,
};

export function useViewportLayer({
  request,
  enabled,
  envelopeKey,
  fetcher,
}: {
  request: ViewportRequest | null;
  enabled: boolean;
  envelopeKey: LayerKey;
  fetcher: (request: ViewportRequest) => Promise<ViewportEnvelope>;
}): ViewportLayerState {
  const [state, setState] = useState<ViewportLayerState>(INITIAL);

  useEffect(() => {
    if (!enabled || !request) return;
    let disposed = false;
    setState((previous) => ({ ...previous, status: "loading" }));
    fetcher(request)
      .then((envelope) => {
        if (disposed) return;
        setState({ status: "ready", ...normalizeViewport(envelope, envelopeKey) });
      })
      .catch(() => {
        if (disposed) return;
        // Keep what is drawn: one failed pan should not blank the map.
        setState((previous) => ({ ...previous, status: "error" }));
      });
    return () => {
      disposed = true;
    };
  }, [request, enabled, envelopeKey, fetcher]);

  return state;
}
```

- [ ] **Step 2: The map.** Create `explore/_components/explore-map.tsx`. Use the stylesheet path Task 2 recorded, if it differs from `maplibre-gl/dist/maplibre-gl.css`. If `maplibre-gl` 6 exports `Map`/`Marker` only on its default export, use `import maplibregl from "maplibre-gl"` with `maplibregl.Map` / `maplibregl.Marker` instead.

```tsx
"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  toViewportRequest,
  type LayerKey,
  type ViewportCluster,
  type ViewportPlace,
  type ViewportRequest,
} from "@/src/utils/explore/viewport";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import { Map as MapLibreMap, Marker } from "maplibre-gl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { LAYER_PINS } from "./layer-pins";

const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const INITIAL_CENTER: [number, number] = [28.9966448299549, 41.011903723721645];
const INITIAL_ZOOM = 9;
const FLY_TO_ZOOM = 15;
const CLUSTER_ZOOM_STEP = 3;

export type ExploreMapHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  flyTo: (center: [number, number]) => void;
};
export type LayeredPlace = ViewportPlace & { layer: LayerKey };
export type LayeredCluster = ViewportCluster & { layer: LayerKey };

function MapMarker({
  map,
  longitude,
  latitude,
  anchor,
  children,
}: {
  map: MapLibreMap;
  longitude: number;
  latitude: number;
  anchor: "bottom" | "center";
  children: ReactNode;
}) {
  const [element] = useState(() => document.createElement("div"));
  useEffect(() => {
    const marker = new Marker({ element, anchor })
      .setLngLat([longitude, latitude])
      .addTo(map);
    return () => {
      marker.remove();
    };
  }, [map, element, anchor, longitude, latitude]);
  return createPortal(children, element);
}

export function ExploreMap({
  places,
  clusters,
  clusterLabel,
  onViewportChange,
  onSelectPlace,
  onReady,
}: {
  places: LayeredPlace[];
  clusters: LayeredCluster[];
  clusterLabel: (layer: LayerKey, count: number) => string;
  onViewportChange: (request: ViewportRequest) => void;
  onSelectPlace: (place: ViewportPlace) => void;
  onReady: (handle: ExploreMapHandle) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const viewportChangeRef = useRef(onViewportChange);
  const readyRef = useRef(onReady);
  useEffect(() => {
    viewportChangeRef.current = onViewportChange;
    readyRef.current = onReady;
  }, [onViewportChange, onReady]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const instance = new MapLibreMap({
      container,
      style: MAP_STYLE_URL,
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      attributionControl: false,
    });
    const report = () => {
      const bounds = instance.getBounds();
      viewportChangeRef.current(
        toViewportRequest([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()])
      );
    };
    instance.on("load", report);
    instance.on("moveend", report);
    setMap(instance);
    readyRef.current({
      zoomIn: () => instance.zoomIn(),
      zoomOut: () => instance.zoomOut(),
      flyTo: (center) =>
        instance.flyTo({ center, zoom: Math.max(instance.getZoom(), FLY_TO_ZOOM) }),
    });
    return () => {
      instance.remove();
      setMap(null);
    };
  }, []);

  return (
    <div className="absolute inset-0" data-testid="explore-map">
      <div className="size-full" ref={containerRef} />
      {map
        ? places.map((place) => {
            if (place.latitude === undefined || place.longitude === undefined) return null;
            const { Icon, fill } = LAYER_PINS[place.layer];
            return (
              <MapMarker
                anchor="bottom"
                key={`${place.layer}-${place.id ?? `${place.latitude}-${place.longitude}`}`}
                latitude={place.latitude}
                longitude={place.longitude}
                map={map}
              >
                <button
                  aria-label={place.name?.trim() ?? ""}
                  className={cn(
                    "flex aspect-square w-8 -rotate-45 items-center justify-center rounded-full rounded-bl-none text-primary-foreground shadow-lg",
                    fill
                  )}
                  data-testid={`explore-pin-${place.layer}-${place.id ?? "unknown"}`}
                  onClick={() => onSelectPlace(place)}
                  type="button"
                >
                  <Icon className="rotate-45" size={16} />
                </button>
              </MapMarker>
            );
          })
        : null}
      {map
        ? clusters.map((cluster) => {
            if (cluster.latitude === undefined || cluster.longitude === undefined) return null;
            const center: [number, number] = [cluster.longitude, cluster.latitude];
            return (
              <MapMarker
                anchor="center"
                key={`${cluster.layer}-${cluster.latitude}-${cluster.longitude}`}
                latitude={cluster.latitude}
                longitude={cluster.longitude}
                map={map}
              >
                <button
                  aria-label={clusterLabel(cluster.layer, cluster.count ?? 0)}
                  className="flex size-12 items-center justify-center rounded-full border-2 border-primary-foreground bg-primary text-sm font-semibold text-primary-foreground shadow-lg"
                  data-testid={`explore-cluster-${cluster.layer}`}
                  onClick={() =>
                    map.easeTo({
                      center,
                      zoom: Math.min(map.getZoom() + CLUSTER_ZOOM_STEP, map.getMaxZoom()),
                    })
                  }
                  type="button"
                >
                  {cluster.count ?? 0}
                </button>
              </MapMarker>
            );
          })
        : null}
      <p
        className="pointer-events-none absolute right-3 text-[10px] text-muted-foreground"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 4px)" }}
      >
        © OpenFreeMap © OpenMapTiles Data from OpenStreetMap
      </p>
    </div>
  );
}
```

- [ ] **Step 3: The page.** Replace `explore/page.tsx` with:

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { DEFAULT_LAYERS, LAYER_ORDER, toggleLayer } from "@/src/utils/explore/layers";
import { locationFailure, type LocationFailure } from "@/src/utils/explore/location";
import {
  deriveSectorOptions,
  mergeSelectedSector,
  retainSectorOptions,
  type SectorOption,
} from "@/src/utils/explore/sectors";
import {
  isViewportSpanValid,
  type LayerKey,
  type ViewportPlace,
  type ViewportRequest,
} from "@/src/utils/explore/viewport";
import {
  getPublicCustomsViewportApi,
  getPublicMerchantsViewportApi,
  getPublicRefundPointsViewportApi,
} from "@repo/actions/unirefund/CRMService/actions";
import { toast } from "@repo/ayasofyazilim-ui/components/sonner";
import dynamic from "next/dynamic";
import { useCallback, useMemo, useRef, useState } from "react";
import type { ExploreMapHandle } from "./_components/explore-map";
import { LayersSheet } from "./_components/layers-sheet";
import { MapControls } from "./_components/map-controls";
import { PlaceSearch } from "./_components/place-search";
import { PlaceSheet } from "./_components/place-sheet";
import { SectorSheet } from "./_components/sector-sheet";
import { useDebouncedValue } from "./_components/use-debounced-value";
import { useViewportLayer } from "./_components/use-viewport-layer";

const ExploreMap = dynamic(
  () => import("./_components/explore-map").then((mod) => mod.ExploreMap),
  { ssr: false }
);

const VIEWPORT_DEBOUNCE_MS = 350;

const LOCATION_KEYS: Record<LocationFailure, "Explore.Location.Denied" | "Explore.Location.Unsupported" | "Explore.Location.Unavailable"> = {
  denied: "Explore.Location.Denied",
  unsupported: "Explore.Location.Unsupported",
  unavailable: "Explore.Location.Unavailable",
};

const CLUSTER_KEYS: Record<LayerKey, "Explore.Cluster.Merchants" | "Explore.Cluster.Customs" | "Explore.Cluster.RefundPoints"> = {
  merchants: "Explore.Cluster.Merchants",
  customs: "Explore.Cluster.Customs",
  refundPoints: "Explore.Cluster.RefundPoints",
};

export default function Page() {
  const { t } = useTranslations();
  const copy = t.SSRService;
  const [rawRequest, setRawRequest] = useState<ViewportRequest | null>(null);
  const request = useDebouncedValue(rawRequest, VIEWPORT_DEBOUNCE_MS);
  const [active, setActive] = useState(DEFAULT_LAYERS);
  const [sector, setSector] = useState<SectorOption | undefined>(undefined);
  const [selectedPlace, setSelectedPlace] = useState<ViewportPlace | null>(null);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [sectorOpen, setSectorOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const mapHandle = useRef<ExploreMapHandle | null>(null);

  const sectorCode = sector?.articleCode;
  const fetchMerchants = useCallback(
    (window: ViewportRequest) =>
      getPublicMerchantsViewportApi({ ...window, sector: sectorCode }).then((res) => res.data),
    [sectorCode]
  );
  const fetchCustoms = useCallback(
    (window: ViewportRequest) => getPublicCustomsViewportApi(window).then((res) => res.data),
    []
  );
  const fetchRefundPoints = useCallback(
    (window: ViewportRequest) => getPublicRefundPointsViewportApi(window).then((res) => res.data),
    []
  );

  const states = {
    merchants: useViewportLayer({ request, enabled: active.merchants, envelopeKey: "merchants", fetcher: fetchMerchants }),
    customs: useViewportLayer({ request, enabled: active.customs, envelopeKey: "customs", fetcher: fetchCustoms }),
    refundPoints: useViewportLayer({ request, enabled: active.refundPoints, envelopeKey: "refundPoints", fetcher: fetchRefundPoints }),
  };
  const layerFailed = LAYER_ORDER.some(
    (layer) => active[layer] && states[layer].status === "error"
  );

  const merchantPlaces = states.merchants.places;
  const customsPlaces = states.customs.places;
  const refundPlaces = states.refundPoints.places;
  const places = useMemo(
    () => [
      ...(active.merchants ? merchantPlaces.map((place) => ({ ...place, layer: "merchants" as const })) : []),
      ...(active.customs ? customsPlaces.map((place) => ({ ...place, layer: "customs" as const })) : []),
      ...(active.refundPoints ? refundPlaces.map((place) => ({ ...place, layer: "refundPoints" as const })) : []),
    ],
    [active, merchantPlaces, customsPlaces, refundPlaces]
  );
  const merchantClusters = states.merchants.clusters;
  const customsClusters = states.customs.clusters;
  const refundClusters = states.refundPoints.clusters;
  const clusters = useMemo(
    () => [
      ...(active.merchants ? merchantClusters.map((cluster) => ({ ...cluster, layer: "merchants" as const })) : []),
      ...(active.customs ? customsClusters.map((cluster) => ({ ...cluster, layer: "customs" as const })) : []),
      ...(active.refundPoints ? refundClusters.map((cluster) => ({ ...cluster, layer: "refundPoints" as const })) : []),
    ],
    [active, merchantClusters, customsClusters, refundClusters]
  );

  const freshSectorOptions = useMemo(
    () => (active.merchants ? deriveSectorOptions(merchantPlaces) : []),
    [active.merchants, merchantPlaces]
  );
  const [retainedSectorOptions, setRetainedSectorOptions] = useState<SectorOption[]>([]);
  const nextRetained = retainSectorOptions(retainedSectorOptions, freshSectorOptions);
  if (nextRetained !== retainedSectorOptions) setRetainedSectorOptions(nextRetained);
  const sectorOptions = active.merchants ? retainedSectorOptions : [];

  const handleViewportChange = useCallback((next: ViewportRequest) => {
    if (isViewportSpanValid(next)) setRawRequest(next);
  }, []);

  const handleSelectPlace = useCallback((place: ViewportPlace) => {
    setSelectedPlace(place);
    setPlaceOpen(true);
  }, []);

  const handleReady = useCallback((handle: ExploreMapHandle) => {
    mapHandle.current = handle;
  }, []);

  const clusterLabel = useCallback(
    (layer: LayerKey, count: number) => copy[CLUSTER_KEYS[layer]].replace("{0}", String(count)),
    [copy]
  );

  function handleToggleLayer(layer: LayerKey) {
    const next = toggleLayer(active, layer);
    setActive(next.active);
    if (next.clearSector) setSector(undefined);
  }

  function handleOpenSector() {
    if (mergeSelectedSector(sectorOptions, sector).length > 0) setSectorOpen(true);
  }

  function handleLocate() {
    if (!("geolocation" in navigator)) {
      toast.error(copy[LOCATION_KEYS[locationFailure(null)]]);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        mapHandle.current?.flyTo([position.coords.longitude, position.coords.latitude]);
      },
      (error) => {
        setLocating(false);
        toast.error(copy[LOCATION_KEYS[locationFailure(error.code)]]);
      },
      { maximumAge: 60_000, timeout: 10_000 }
    );
  }

  return (
    <div className="relative isolate h-svh w-full overflow-hidden" data-testid="explore-page">
      <ExploreMap
        clusterLabel={clusterLabel}
        clusters={clusters}
        onReady={handleReady}
        onSelectPlace={handleSelectPlace}
        onViewportChange={handleViewportChange}
        places={places}
      />
      <PlaceSearch onSelect={(center) => mapHandle.current?.flyTo(center)} />
      {layerFailed ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-20 z-10 mx-auto w-full max-w-3xl px-4"
          data-testid="explore-error"
        >
          <p className="rounded-md border border-warning/40 bg-warning-surface px-4 py-3 text-sm text-warning">
            {copy["Explore.Error"]}
          </p>
        </div>
      ) : null}
      <MapControls
        locating={locating}
        onLocate={handleLocate}
        onOpenLayers={() => setLayersOpen(true)}
        onOpenSector={handleOpenSector}
        onZoomIn={() => mapHandle.current?.zoomIn()}
        onZoomOut={() => mapHandle.current?.zoomOut()}
        sectorActive={sector !== undefined}
      />
      <LayersSheet active={active} onOpenChange={setLayersOpen} onToggle={handleToggleLayer} open={layersOpen} />
      <SectorSheet onOpenChange={setSectorOpen} onSelect={setSector} open={sectorOpen} options={sectorOptions} selected={sector} />
      <PlaceSheet onOpenChange={setPlaceOpen} open={placeOpen} place={selectedPlace} />
    </div>
  );
}
```

If the actions' `res.data` types are not assignable to `ViewportEnvelope`, because the DTOs are narrower or wider than the structural types, cast at the fetcher: `.then((res) => res.data as ViewportEnvelope)`, importing `ViewportEnvelope` from `viewport.ts`. Say so in the report.

- [ ] **Step 4: Delete the Leaflet pieces.**
  - Delete `viewport-layer.tsx`, `place-markers.tsx`, `sector-control.tsx` and `use-viewport-fill.ts` from `explore/_components/`.
  - `grep -rn "components/map\"" apps/ssr/src` prints nothing.
  - `grep -rn "lucide-react" "apps/ssr/src/app/[lang]/(public)/explore"` shows only `map-controls.tsx`'s `LoaderCircle`.
- [ ] **Step 5: Gates.** `pnpm --filter ssr test:unit` passes, `pnpm --filter ssr type-check` gives 0, and `pnpm --filter ssr lint` gives 0 errors.
- [ ] **Step 6: Smoke check.**
  - Start this worktree's ssr dev server detached on a free port, not :3001. Run `set PORT=3005&& pnpm run dev` from `apps/ssr` through `Start-Process cmd.exe … -WindowStyle Hidden`, logging to a file.
  - Open `/en/explore` in a browser and confirm:
    - the Liberty map renders over Istanbul;
    - merchant pins or clusters appear within a few seconds;
    - the control chain sits above the island.
  - Record what you saw.
  - Stop only that dev server.
- [ ] **Step 7: Commit.**

```bash
git add "apps/ssr/src/app/[lang]/(public)/explore/"
git commit -m "feat(ssr): rebuild Explore on MapLibre with the app's controls and sheets"
```

---

### Task 6: Gates, manual pass, push and PR (controller)

- [ ] **Step 1: Gates on the branch head.**
  - Run `test:unit`, ssr `type-check`, ssr `lint` and `pnpm --filter web type-check`.
  - With no dev server up on this checkout, run `pnpm --filter ssr build` and `pnpm --filter web build`.
- [ ] **Step 2: Manual pass** on this worktree's own dev server (`PORT=3005`, detached), at 375 px and 1280 px. Explore is public, so check it signed out and signed in. Cover:
  - **Map and pins:**
    - the map, pins and clusters, a cluster tap, and pan or zoom fetching again;
    - the attribution under the island.
  - **Sheets:**
    - Layers: toggle customs and refund points on and off;
    - Sector: pick one, see the funnel turn red, then switch merchants off and confirm the sector clears;
    - Place: name, address, sectors, and both directions links.
  - **Search:** in `en` and in `tr`. Turkish must return results.
  - **Controls:** locate (denied in the headless browser gives the "permission" toast), and zoom − / +.
  - **Console:** no errors after a reload taken without a screenshot (memory `playwright-screenshot-hydration-false-positive`).

  Record anything unverified.
- [ ] **Step 3: Stop this worktree's dev server.** Stop only the `node.exe` whose command line contains `web-app-wt-visual-parity-profile`.
- [ ] **Step 4: Push and open the PR.**
  - Run `git push -u origin feat/ssr-visual-parity-explore`.
  - Open a PR into `feat/ssr-visual-parity-profile-cards` with the repo template, and say it is stacked on #315.
  - In the PR body:
    - list the orphaned keys;
    - note the app's Photon `lang=tr` bug for the super-app owners;
    - list the unverified items.
  - End the body with the attribution line.

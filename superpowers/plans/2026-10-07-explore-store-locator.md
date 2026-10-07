# Explore v2: Store Locator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn ssr's `/explore` into a store locator on the CRM's new `public/map/viewport` and `public/merchants/{id}` endpoints. It combines Global Blue's results list and detail with Mavi's nearest-first sorting.

**Architecture:**
- **Pure rules** live in `apps/ssr/src/utils/explore/{map,places,merchant}.ts`, tested with `node:test`:
  - the query, normalisation and error kinds;
  - distance, sorting, store matching and cluster sizing;
  - the merchant address and directions.
- **Two client hooks**, `use-map-viewport` and `use-merchant-detail`, call two new server actions that return errors instead of throwing.
- **Error codes:** `structuredError` in the `packages/utils` submodule gains the backend error `code`, so the UI can tell `029001` and `029003` apart.
- **Layout by width:**
  - **Wide screens:** a left results panel that switches between the list and the detail.
  - **Phones:** a List sheet and a detail sheet over the full-screen map.

**Tech Stack:** Next.js 16 App Router (webpack), React 19 with the React Compiler lint rules, Tailwind v4, MapLibre 6, the UI kit (`@repo/ayasofyazilim-ui`), `node:test` via `tsx`.

**Spec:** `C:\unirefund\docs\superpowers\specs\2026-10-07-explore-map-viewport-design.md` (commit 1df6a94).

## Global Constraints

**Backend contract**
- **Endpoints:** `GET /api/crm-service/public/map/viewport` and `GET /api/crm-service/public/merchants/{id}`.
- **No country tenant on either call:** the backend resolves the country from the window's centre.
- **Map query:** `south`, `north`, `west`, `east`, `layers[]` (from `Merchant`, `RefundPoint`, `ExitPoint`) and an optional `sector` (an article code). An omitted or empty `layers` means **every** layer.
- **Map response:** `{ clustered, pins, clusters, totalCount }`.
  - Clusters span every layer and carry no identity.
  - Merchant pins carry `headquarterName`.
- **Error codes:**
  - `UniRefund.CRMService:029001`: the area is not served (400).
  - `029002`: the window spans more than 180°.
  - `029003`: the merchant is not shown (404).

**Layout and behaviour**
- **Layers:** Merchants (on by default), Refund points and Exit points. Exit points use `bg-warning` with the building icon.
- **Wide screens (≥ 1024 px):**
  - a `w-[380px]` left panel with the list, or the detail plus a back button;
  - the map fills the rest.
- **Narrow screens (< 1024 px):** the full-screen map, a **List** button that opens a page-width sheet, and a detail sheet.
- **Sheets** are page width: `className="mx-auto w-full max-w-3xl md:border-x"`. Without a description, add `aria-describedby={undefined}`.
- **Locate on open:**
  - ask once, when the map has loaded;
  - if granted, store the location and jump to it, unless the traveller has already moved the map;
  - if not granted, change nothing and show no toast.
- **The Locate button:** on success it stores the location and flies to it; on failure it shows today's toast.
- **The sector button is not rendered.** `sector-sheet.tsx` stays.
- **Unchanged:** MapLibre with the OpenFreeMap Liberty style, Photon place search, the island, the attribution, and `/explore` staying public.

**Strings**
- Flat `SSRService` keys in `apps/ssr/src/language-data/unirefund/SSRService/resources/{en,tr}.json`, edited with the Edit tool and never re-serialised.
- Run `pnpm --filter ssr run init` afterwards.

**Lint and code style**
- apps/ssr's ESLint treats these as **errors**:
  - the React Compiler rules: `react-hooks/set-state-in-effect`, and purity (no `Date.now()` during render);
  - `react-require-testid/testid-missing`, which covers `Label`, `Link`, `Button`, `Input`, the `*Trigger` components and `AlertDialog`.
- Never add an eslint-disable. Call setState only in handlers and callbacks, including MapLibre's and geolocation's.
- Comments are rare.

**Shared checkout:** `C:\unirefund\web-app` also runs the user's dev server.
- Never run `git reset --hard`, `git stash`, `git checkout --`, `git add -A` or `git add .`. Stage files by path.
- Never push.
- Never commit `.env` or `*.gen.json`.
- **Do not start a dev server or run `next build` in a task.** Next refuses a second dev server on a checkout, and a build during the user's dev session is forbidden.

**Commits:** end with exactly `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Use a quoted heredoc: `git commit -F - <<'EOF'`.

**Gates, every task**, run from `C:\unirefund\web-app`:
- `pnpm --filter ssr test:unit`
- `pnpm --filter ssr type-check`
- `pnpm --filter ssr lint` (0 errors; the baseline is 459 warnings)
- `pnpm --filter web type-check`

Until Task 4 removes the old viewport actions, both type-checks may show **only** the Task 0 baseline errors in `packages/actions/unirefund/CRMService/actions.ts`.

## Plan decisions

These are rulings on points the spec leaves open, or where its wording conflicts with the code.

1. **`structuredError` gains `code`** (user, 2026-10-07).
   - The change lands in the `web-utils` submodule on a branch `feat/structured-error-code`.
   - web-app commits the bumped `packages/utils` pointer. This is intended, and is an exception to the usual "never commit submodule pointers" rule.
   - The `web-utils` PR merges before the web-app PR.
2. **List takes the sector button's slot.** The control chain's `BlobRow` geometry is fixed at 2·1·2. On wide screens, List shows and hides the results panel.
3. **Locate-on-open jumps (no animation) at Locate's zoom,** as the spec says: `max(current, 15)`. `ExploreMapHandle.jumpTo(center)` mirrors `flyTo(center)`.
4. **The spec's `Explore.Results.Empty` is not added.** The empty state reuses `Explore.Empty` ("No places in this area."), and "Try again" reuses `TryAgain`. That leaves 15 new keys rather than 16.
5. **Pin and row test ids use the pin key** (`layer:id:addressId`), because one merchant can have several pins.
6. **`sectors.ts` keeps `SectorOption` and `mergeSelectedSector`,** which the kept `sector-sheet.tsx` imports. The spec lists `mergeSelectedSector` for removal, but it also keeps the sheet, so the sheet wins. Only the pin-derived option helpers go.
7. **`directions.ts` is replaced** by `directionsUrls` in `merchant.ts`.
8. **The spec's "`viewport.ts` (rewritten)" becomes a new `map.ts`.** `viewport.ts` and `layers.ts` are deleted, so no old export survives under a familiar name.
   - `isViewportSpanValid` becomes `isSpanValid`.
   - `merchantErrorKind` also takes the HTTP status, so a 404 without the code still reads as "not found".
9. **The control chain stays viewport-centred** (`PinnedBar` is `fixed`, like the island). On wide screens, the panel's scroll areas take `PINNED_BAR_CLEARANCE_CLASS`, so their last row and the Get directions button clear the chain and the island.

## Review Focus

1. **A merchant with several addresses** has several pins with the same `id`. Keys, rows, the highlight and the detail address must follow the **tapped** address, not the first. *Pinned in Task 2:* `normalizeMapViewport` keys pins per address, and `pickAddress` picks by `addressId`.
2. **Turning every layer off** must send no request and clear the pins. The server reads an empty list as "every layer". *Pinned in Task 2* (`toMapViewportQuery` returns `null`) and *Task 4* (the hook returns the empty viewport for a `null` query).
3. **An "unserved" answer clears the pins, but a failed answer keeps the last ones.** One failed pan must not blank the map, and moving into an unserved country must not leave the previous country's pins showing. *Pinned in Task 2* (`mapErrorKind`) and *Task 4* (the hook).
4. **Locate-on-open arriving after the traveller has panned** must not yank the map back. *Pinned in Task 2* (`autoLocateCenter`) and *Task 5* (the wiring through `userMovedRef`).
5. **Turkish search**:
   - "istanbul" finds "İstanbul…";
   - "arti" finds "Artı…";
   - "cicek" finds "Çiçek…".

   *Pinned in Task 2* (`matchStores`).

---

### Task 0 (controller): commit the SDK and measure baselines

- [ ] **Commit the user's regenerated SDK.** In `C:\unirefund\web-app` on `feat/map-improvement`, commit it as it stands:

  ```bash
  git add packages/saas
  git commit -F - <<'EOF'
  chore(saas): regenerate the service clients

  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  EOF
  ```

  Check `git status` first. Only `packages/saas/**` may be staged.

- [ ] **Measure the four gates and record the exact error list in the ledger.**
  - Both type-checks are expected to fail in `packages/actions/unirefund/CRMService/actions.ts`, on the removed `…MerchantsViewport…` and `…CustomsViewport…` types and methods.
  - **Report any other type errors to the user before Task 1**, for example from the ContractService or DeviceService regeneration.

---

### Task 1: `structuredError` carries the backend error code (web-utils submodule)

**Files:**
- Modify: `packages/utils/api/types.ts`, the `ApiErrorServerResponse` interface.
- Modify: `packages/utils/api/utils.ts`, the `structuredError` function.
- Modify: the `packages/utils` pointer in web-app.

**Interfaces:**
- Produces: `ApiErrorServerResponse.code?: string`, the backend's `error.code`, for example `UniRefund.CRMService:029001`.

- [ ] **Step 1: Branch the submodule.**

  ```bash
  cd /c/unirefund/web-app/packages/utils
  git status --short        # must be empty
  git switch -c feat/structured-error-code
  ```

- [ ] **Step 2: Add `code` to the response type.** In `packages/utils/api/types.ts`, inside `interface ApiErrorServerResponse`, add this after `status?: number;`:

  ```ts
    // The backend's error code (for example `UniRefund.CRMService:029001`), when
    // the response carried one. Lets callers branch on a specific failure without
    // matching a localized message.
    code?: string;
  ```

- [ ] **Step 3: Fill `code` in `structuredError`.** In `packages/utils/api/utils.ts`, change the `isApiError` branch to:

  ```ts
    if (isApiError(error)) {
      const body = error.body as
        | { error: { message?: string; details?: string; code?: string | null } }
        | undefined;
      const errorDetails = body?.error || {};
      return {
        type: "api-error",
        data: errorDetails.message || error.statusText || "Something went wrong",
        message:
          errorDetails.details ||
          errorDetails.message ||
          error.statusText ||
          "Something went wrong",
        status: error.status,
        ...(errorDetails.code ? { code: errorDetails.code } : {}),
      };
    }
  ```

- [ ] **Step 4: Run the gates** from `C:\unirefund\web-app`. Both type-checks must show only the Task 0 baseline errors.

- [ ] **Step 5: Commit in the submodule, then commit the bumped pointer in web-app.**

  ```bash
  cd /c/unirefund/web-app/packages/utils
  git add api/types.ts api/utils.ts
  git commit -F - <<'EOF'
  feat(api): keep the backend error code in structuredError

  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  EOF
  cd /c/unirefund/web-app
  git add packages/utils
  git commit -F - <<'EOF'
  chore: bump packages/utils for the API error code

  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  EOF
  ```

---

### Task 2: The store-locator rules (pure, tested)

**Files:**
- Create: `apps/ssr/src/utils/explore/map.ts` and `map.test.ts`.
- Create: `apps/ssr/src/utils/explore/places.ts` and `places.test.ts`.
- Create: `apps/ssr/src/utils/explore/merchant.ts` and `merchant.test.ts`.

**Interfaces (produces):**

From `map.ts`:
- **Layers:**
  - `type MapLayerKey = "merchants" | "refundPoints" | "exitPoints"`;
  - `LAYER_ORDER: MapLayerKey[]`;
  - `DEFAULT_LAYERS: Record<MapLayerKey, boolean>`;
  - `toggleLayer(active, layer): Record<MapLayerKey, boolean>`.
- **The window and query:**
  - `type Bounds = { south; north; west; east }`;
  - `toBounds([west, south, east, north]): Bounds`;
  - `isSpanValid(bounds): boolean`;
  - `type MapViewportQuery`;
  - `toMapViewportQuery(bounds | null, active, sector?): MapViewportQuery | null`.
- **The response:**
  - `type MapPin = { key; layer; id; addressId: string | null; name; addressLine; headquarterName: string | null; latitude; longitude }`;
  - `type MapCluster = { key; count; latitude; longitude }`;
  - `type MapViewport = { clustered; pins; clusters; totalCount }`;
  - `EMPTY_VIEWPORT`;
  - `normalizeMapViewport(dto | null | undefined): MapViewport`.
- **Error kinds:**
  - `mapErrorKind(code): "unserved" | "span" | "failed"`;
  - `merchantErrorKind(code, status): "notFound" | "failed"`.
- **Status and locate:**
  - `type ResultsStatus`;
  - `resultsStatus({ status, viewport, anyLayer }): ResultsStatus`;
  - `autoLocateCenter(position | null, userMoved): [number, number] | null`.

From `places.ts`:
- `type LatLng = { latitude; longitude }`;
- `distanceMeters(a, b)`;
- `formatDistance(meters, lang)`;
- `sortPlaces(pins, origin | null, lang)`;
- `matchStores(pins, query, lang, limit = 5)`;
- `clusterSize(count)`;
- `compactCount(count, lang)`.

From `merchant.ts`:
- `pickAddress(detail, addressId)`;
- `addressLines(address): string[]`;
- `directionsUrls({ latitude, longitude, placeId? }): { google; apple }`;
- `telHref(phone): string | null`.

- [ ] **Step 1: Write the failing tests.**

`apps/ssr/src/utils/explore/map.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
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
} from "./map";

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
    assert.deepEqual(DEFAULT_LAYERS, {
      merchants: true,
      refundPoints: false,
      exitPoints: false,
    });
  });

  it("toggles one layer and leaves the others", () => {
    assert.deepEqual(toggleLayer(DEFAULT_LAYERS, "exitPoints"), {
      merchants: true,
      refundPoints: false,
      exitPoints: true,
    });
  });
});

describe("toBounds and isSpanValid", () => {
  it("names the edges of a west-south-east-north box", () => {
    assert.deepEqual(toBounds([28.5, 40.8, 29.4, 41.3]), BOUNDS);
  });

  it("accepts exactly 180 degrees", () => {
    assert.equal(isSpanValid({ south: -90, north: 90, west: 0, east: 180 }), true);
  });

  it("rejects a window wider than 180 degrees", () => {
    assert.equal(isSpanValid({ south: 0, north: 10, west: -180, east: 180 }), false);
  });
});

describe("toMapViewportQuery", () => {
  it("sends the active layers by their API names in a stable order", () => {
    assert.deepEqual(toMapViewportQuery(BOUNDS, ALL), {
      ...BOUNDS,
      layers: ["Merchant", "RefundPoint", "ExitPoint"],
    });
  });

  it("is null when no layer is active, because an empty list means every layer", () => {
    assert.equal(toMapViewportQuery(BOUNDS, NONE), null);
  });

  it("is null without a window", () => {
    assert.equal(toMapViewportQuery(null, ALL), null);
  });

  it("adds the sector only when one is given", () => {
    assert.deepEqual(toMapViewportQuery(BOUNDS, DEFAULT_LAYERS, "SHOES"), {
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
    assert.equal(result.clustered, false);
    assert.deepEqual(
      result.pins.map((pin) => pin.key),
      ["merchants:m1:a1", "merchants:m1:a2"]
    );
    assert.equal(result.pins[0]?.name, "İstanbul MarmaraPark");
    assert.equal(result.pins[0]?.addressLine, "Güzelyurt Mah.");
    assert.equal(result.pins[0]?.headquarterName, "Artı Bilgisayar");
    assert.equal(result.totalCount, 2);
  });

  it("maps a blank headquarter and a missing address id to null", () => {
    const result = normalizeMapViewport({
      pins: [{ ...PIN, addressId: null, headquarterName: "  " }],
    });
    assert.equal(result.pins[0]?.addressId, null);
    assert.equal(result.pins[0]?.headquarterName, null);
    assert.equal(result.pins[0]?.key, "merchants:m1:");
  });

  it("drops pins without coordinates, an id or a known layer", () => {
    const result = normalizeMapViewport({
      clustered: false,
      pins: [
        PIN,
        { ...PIN, latitude: undefined },
        { ...PIN, id: undefined },
        { ...PIN, layer: "Customs" as never },
      ],
    });
    assert.equal(result.pins.length, 1);
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
    assert.deepEqual(result.pins, []);
    assert.deepEqual(
      result.clusters.map((cluster) => cluster.count),
      [12]
    );
    assert.equal(result.totalCount, 15);
  });

  it("treats a missing answer as empty", () => {
    assert.deepEqual(normalizeMapViewport(undefined), EMPTY_VIEWPORT);
  });
});

describe("error kinds", () => {
  it("reads 029001 as an unserved area and 029002 as a too-wide window", () => {
    assert.equal(mapErrorKind("UniRefund.CRMService:029001"), "unserved");
    assert.equal(mapErrorKind("UniRefund.CRMService:029002"), "span");
  });

  it("reads any other or missing map code as a failure", () => {
    assert.equal(mapErrorKind("UniRefund.CRMService:000000"), "failed");
    assert.equal(mapErrorKind(undefined), "failed");
  });

  it("reads 029003 or a 404 as a merchant that is no longer on the map", () => {
    assert.equal(merchantErrorKind("UniRefund.CRMService:029003", 404), "notFound");
    assert.equal(merchantErrorKind(undefined, 404), "notFound");
    assert.equal(merchantErrorKind(undefined, 500), "failed");
  });
});

describe("resultsStatus", () => {
  const pins = normalizeMapViewport({ pins: [PIN] });

  it("is empty when no layer is active", () => {
    assert.deepEqual(
      resultsStatus({ status: "ready", viewport: pins, anyLayer: false }),
      { kind: "empty" }
    );
  });

  it("reports an unserved area", () => {
    assert.deepEqual(
      resultsStatus({ status: "unserved", viewport: EMPTY_VIEWPORT, anyLayer: true }),
      { kind: "unserved" }
    );
  });

  it("reports a clustered window with its total", () => {
    const clustered = normalizeMapViewport({
      clustered: true,
      clusters: [{ count: 40, latitude: 41, longitude: 29 }],
      totalCount: 40,
    });
    assert.deepEqual(
      resultsStatus({ status: "ready", viewport: clustered, anyLayer: true }),
      { kind: "clustered", count: 40 }
    );
  });

  it("counts the pins, also when a later pan failed and kept them", () => {
    assert.deepEqual(
      resultsStatus({ status: "error", viewport: pins, anyLayer: true }),
      { kind: "count", count: 1 }
    );
  });

  it("is loading before the first pins arrive, then empty", () => {
    assert.deepEqual(
      resultsStatus({ status: "loading", viewport: EMPTY_VIEWPORT, anyLayer: true }),
      { kind: "loading" }
    );
    assert.deepEqual(
      resultsStatus({ status: "ready", viewport: EMPTY_VIEWPORT, anyLayer: true }),
      { kind: "empty" }
    );
  });
});

describe("autoLocateCenter", () => {
  it("returns the position as a map centre when the traveller has not moved the map", () => {
    assert.deepEqual(autoLocateCenter({ latitude: 41, longitude: 29 }, false), [29, 41]);
  });

  it("leaves a map the traveller already moved", () => {
    assert.equal(autoLocateCenter({ latitude: 41, longitude: 29 }, true), null);
  });

  it("does nothing without a position", () => {
    assert.equal(autoLocateCenter(null, false), null);
  });
});
```

`apps/ssr/src/utils/explore/places.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MapPin } from "./map";
import {
  clusterSize,
  compactCount,
  distanceMeters,
  formatDistance,
  matchStores,
  sortPlaces,
} from "./places";

function pin(
  key: string,
  name: string,
  latitude = 41,
  longitude = 29,
  headquarterName: string | null = null
): MapPin {
  return {
    key,
    layer: "merchants",
    id: key,
    addressId: null,
    name,
    addressLine: "",
    headquarterName,
    latitude,
    longitude,
  };
}

const meters = (lang: string, value: number) =>
  new Intl.NumberFormat(lang, {
    style: "unit",
    unit: "meter",
    unitDisplay: "short",
    maximumFractionDigits: 0,
  }).format(value);

const kilometers = (lang: string, value: number) =>
  new Intl.NumberFormat(lang, {
    style: "unit",
    unit: "kilometer",
    unitDisplay: "short",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);

describe("distanceMeters", () => {
  it("is zero for the same point", () => {
    assert.equal(distanceMeters({ latitude: 41, longitude: 29 }, { latitude: 41, longitude: 29 }), 0);
  });

  it("measures Istanbul to Ankara at about 350 km", () => {
    const distance = distanceMeters(
      { latitude: 41.0082, longitude: 28.9784 },
      { latitude: 39.9334, longitude: 32.8597 }
    );
    assert.ok(distance > 345_000 && distance < 355_000, String(distance));
  });
});

describe("formatDistance", () => {
  it("rounds short distances to 10 m", () => {
    assert.equal(formatDistance(847, "en"), meters("en", 850));
  });

  it("never shows less than 10 m", () => {
    assert.equal(formatDistance(3, "en"), meters("en", 10));
  });

  it("switches to kilometres with one decimal from 1 km", () => {
    assert.equal(formatDistance(2140, "en"), kilometers("en", 2.1));
    assert.equal(formatDistance(996, "en"), kilometers("en", 1));
  });

  it("uses the language's decimal separator", () => {
    assert.match(formatDistance(2140, "tr"), /2,1/);
  });
});

describe("sortPlaces", () => {
  const near = pin("near", "Zeta", 41.01, 29.0);
  const far = pin("far", "Alfa", 41.5, 29.5);

  it("puts the nearest first when there is an origin", () => {
    assert.deepEqual(
      sortPlaces([far, near], { latitude: 41, longitude: 29 }, "en").map((p) => p.key),
      ["near", "far"]
    );
  });

  it("sorts by name in the page language without an origin", () => {
    const list = [pin("d", "Deniz"), pin("cc", "Çiçek"), pin("c", "Cadde")];
    assert.deepEqual(
      sortPlaces(list, null, "tr").map((p) => p.key),
      ["c", "cc", "d"]
    );
  });

  it("does not reorder its input", () => {
    const input = [far, near];
    sortPlaces(input, { latitude: 41, longitude: 29 }, "en");
    assert.deepEqual(input.map((p) => p.key), ["far", "near"]);
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
    assert.deepEqual(matchStores(stores, "istanbul", "tr").map((p) => p.key), ["1"]);
    assert.deepEqual(matchStores(stores, "cicek", "en").map((p) => p.key), ["2"]);
  });

  it("matches the headquarter name, folding the dotless i", () => {
    assert.deepEqual(matchStores(stores, "arti", "tr").map((p) => p.key), ["1"]);
  });

  it("puts word-prefix matches before matches inside a word", () => {
    assert.deepEqual(matchStores(stores, "ma", "en").map((p) => p.key), ["1", "4", "3"]);
  });

  it("limits the number of results", () => {
    const many = Array.from({ length: 7 }, (_, i) => pin(String(i), `Shop ${i}`));
    assert.equal(matchStores(many, "shop", "en").length, 5);
    assert.equal(matchStores(many, "shop", "en", 2).length, 2);
  });

  it("returns nothing for a blank query", () => {
    assert.deepEqual(matchStores(stores, "   ", "en"), []);
  });
});

describe("clusterSize", () => {
  it("grows in four steps", () => {
    assert.deepEqual(
      [1, 9, 10, 99, 100, 999, 1000, 50000].map(clusterSize),
      [36, 36, 44, 44, 52, 52, 60, 60]
    );
  });
});

describe("compactCount", () => {
  it("shortens large counts in the page language", () => {
    assert.equal(
      compactCount(1234, "en"),
      new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(1234)
    );
    assert.equal(compactCount(7, "en"), "7");
  });
});
```

`apps/ssr/src/utils/explore/merchant.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addressLines, directionsUrls, pickAddress, telHref } from "./merchant";

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
  it("picks the address that was tapped", () => {
    assert.equal(pickAddress({ addresses: [A1, A2] }, "a2")?.addressId, "a2");
  });

  it("falls back to the first address", () => {
    assert.equal(pickAddress({ addresses: [A1, A2] }, "missing")?.addressId, "a1");
    assert.equal(pickAddress({ addresses: [A1, A2] }, null)?.addressId, "a1");
  });

  it("is null without addresses", () => {
    assert.equal(pickAddress({ addresses: [] }, "a1"), null);
    assert.equal(pickAddress({}, "a1"), null);
  });
});

describe("addressLines", () => {
  it("gives the street line, then neighbourhood, district and city", () => {
    assert.deepEqual(addressLines(A1), [
      "Bağdat Cd. No:5",
      "Caddebostan, Kadıköy, İstanbul",
    ]);
  });

  it("drops empty parts", () => {
    assert.deepEqual(
      addressLines({ addressLine: "  ", neighborhoodName: null, districtName: "Kadıköy", cityName: "İstanbul" }),
      ["Kadıköy, İstanbul"]
    );
    assert.deepEqual(addressLines({}), []);
  });
});

describe("directionsUrls", () => {
  it("adds the place id to Google Maps when there is one", () => {
    const urls = directionsUrls({ latitude: 40.96, longitude: 29.06, placeId: "ChIJ x" });
    assert.equal(
      urls.google,
      "https://www.google.com/maps/dir/?api=1&destination=40.96,29.06&destination_place_id=ChIJ%20x"
    );
    assert.equal(urls.apple, "https://maps.apple.com/?daddr=40.96,29.06");
  });

  it("uses the coordinates alone without a place id", () => {
    assert.equal(
      directionsUrls({ latitude: 1, longitude: 2 }).google,
      "https://www.google.com/maps/dir/?api=1&destination=1,2"
    );
  });
});

describe("telHref", () => {
  it("keeps the digits", () => {
    assert.equal(telHref("902121234567"), "tel:902121234567");
  });

  it("keeps a leading plus and drops formatting", () => {
    assert.equal(telHref("+90 (212) 123 45 67"), "tel:+902121234567");
  });

  it("is null without digits", () => {
    assert.equal(telHref(""), null);
    assert.equal(telHref("ext"), null);
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail.**
  - Run: `pnpm --filter ssr test:unit`
  - Expected: FAIL. The three new test files report `Cannot find module` for `./map`, `./places` and `./merchant`.

- [ ] **Step 3: Implement the three modules.**

`apps/ssr/src/utils/explore/map.ts`:

```ts
import type {
  UniRefund_CRMService_Map_MapLayer as ApiLayer,
  UniRefund_CRMService_Map_MapViewportDto as MapViewportDto,
} from "@repo/saas/CRMService";

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
  layer: MapLayerKey
): Record<MapLayerKey, boolean> {
  return { ...active, [layer]: !active[layer] };
}

export type Bounds = { south: number; north: number; west: number; east: number };

export function toBounds([west, south, east, north]: [number, number, number, number]): Bounds {
  return { south, north, west, east };
}

const MAX_SPAN_DEGREES = 180;

export function isSpanValid(bounds: Bounds): boolean {
  return (
    bounds.north - bounds.south <= MAX_SPAN_DEGREES &&
    bounds.east - bounds.west <= MAX_SPAN_DEGREES
  );
}

export type MapViewportQuery = Bounds & { layers: ApiLayer[]; sector?: string };

export function toMapViewportQuery(
  bounds: Bounds | null,
  active: Record<MapLayerKey, boolean>,
  sector?: string
): MapViewportQuery | null {
  if (!bounds) return null;
  const layers = LAYER_ORDER.filter((layer) => active[layer]).map(
    (layer) => API_LAYER[layer]
  );
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

export type MapCluster = {
  key: string;
  count: number;
  latitude: number;
  longitude: number;
};

export type MapViewport = {
  clustered: boolean;
  pins: MapPin[];
  clusters: MapCluster[];
  totalCount: number;
};

export const EMPTY_VIEWPORT: MapViewport = {
  clustered: false,
  pins: [],
  clusters: [],
  totalCount: 0,
};

export function normalizeMapViewport(
  dto: MapViewportDto | null | undefined
): MapViewport {
  if (!dto) return EMPTY_VIEWPORT;
  const clustered = dto.clustered === true;
  const pins: MapPin[] = clustered
    ? []
    : (dto.pins ?? []).flatMap((pin) => {
        const layer = pin.layer ? LAYER_KEY[pin.layer] : undefined;
        if (
          !layer ||
          !pin.id ||
          pin.latitude === undefined ||
          pin.longitude === undefined
        )
          return [];
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
        !cluster.count ||
        cluster.latitude === undefined ||
        cluster.longitude === undefined
          ? []
          : [
              {
                key: `${cluster.latitude},${cluster.longitude}`,
                count: cluster.count,
                latitude: cluster.latitude,
                longitude: cluster.longitude,
              },
            ]
      )
    : [];
  return {
    clustered,
    pins,
    clusters,
    totalCount: dto.totalCount ?? pins.length,
  };
}

const UNSERVED = "UniRefund.CRMService:029001";
const SPAN = "UniRefund.CRMService:029002";
const MERCHANT_NOT_SHOWN = "UniRefund.CRMService:029003";

export function mapErrorKind(
  code: string | null | undefined
): "unserved" | "span" | "failed" {
  if (code === UNSERVED) return "unserved";
  if (code === SPAN) return "span";
  return "failed";
}

export function merchantErrorKind(
  code: string | null | undefined,
  status: number | null | undefined
): "notFound" | "failed" {
  return code === MERCHANT_NOT_SHOWN || status === 404 ? "notFound" : "failed";
}

export type ResultsStatus =
  | { kind: "loading" }
  | { kind: "unserved" }
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
  return { kind: "empty" };
}

export function autoLocateCenter(
  position: { latitude: number; longitude: number } | null,
  userMoved: boolean
): [number, number] | null {
  if (!position || userMoved) return null;
  return [position.longitude, position.latitude];
}
```

`apps/ssr/src/utils/explore/places.ts`:

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
    Math.cos(toRadians(a.latitude)) *
      Math.cos(toRadians(b.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(meters: number, lang: string): string {
  const rounded = Math.max(10, Math.round(meters / 10) * 10);
  if (rounded < 1000) {
    return new Intl.NumberFormat(lang, {
      style: "unit",
      unit: "meter",
      unitDisplay: "short",
      maximumFractionDigits: 0,
    }).format(rounded);
  }
  return new Intl.NumberFormat(lang, {
    style: "unit",
    unit: "kilometer",
    unitDisplay: "short",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(meters / 1000);
}

export function sortPlaces(
  pins: MapPin[],
  origin: LatLng | null,
  lang: string
): MapPin[] {
  const sorted = [...pins];
  if (origin) {
    sorted.sort(
      (a, b) =>
        distanceMeters(origin, a) - distanceMeters(origin, b) ||
        a.key.localeCompare(b.key)
    );
  } else {
    sorted.sort(
      (a, b) => a.name.localeCompare(b.name, lang) || a.key.localeCompare(b.key)
    );
  }
  return sorted;
}

function fold(text: string, lang: string): string {
  return text
    .toLocaleLowerCase(lang)
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function matchStores(
  pins: MapPin[],
  query: string,
  lang: string,
  limit = 5
): MapPin[] {
  const needle = fold(query.trim(), lang);
  if (!needle) return [];
  const prefix: MapPin[] = [];
  const infix: MapPin[] = [];
  for (const pin of pins) {
    const fields = [pin.name, pin.headquarterName ?? ""].map((field) =>
      fold(field, lang)
    );
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

export function compactCount(count: number, lang: string): string {
  return new Intl.NumberFormat(lang, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(count);
}
```

`apps/ssr/src/utils/explore/merchant.ts`:

```ts
import type {
  UniRefund_CRMService_Merchants_MerchantPublicDetailDto as MerchantDetail,
  UniRefund_CRMService_Merchants_PublicMerchantAddressDto as MerchantAddress,
} from "@repo/saas/CRMService";

export function pickAddress(
  detail: Pick<MerchantDetail, "addresses">,
  addressId: string | null
): MerchantAddress | null {
  const addresses = detail.addresses ?? [];
  return (
    addresses.find((address) => addressId && address.addressId === addressId) ??
    addresses[0] ??
    null
  );
}

export function addressLines(
  address: Pick<
    MerchantAddress,
    "addressLine" | "neighborhoodName" | "districtName" | "cityName"
  >
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
    google: placeId
      ? `${destination}&destination_place_id=${encodeURIComponent(placeId)}`
      : destination,
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

- [ ] **Step 4: Run the tests and watch them pass.**
  - Run: `pnpm --filter ssr test:unit`
  - Expected: all suites PASS. Report the exact count.
  - Then run the other gates. The type-checks may show only the Task 0 baseline errors.

- [ ] **Step 5: Commit.**

```bash
git add apps/ssr/src/utils/explore/map.ts apps/ssr/src/utils/explore/map.test.ts apps/ssr/src/utils/explore/places.ts apps/ssr/src/utils/explore/places.test.ts apps/ssr/src/utils/explore/merchant.ts apps/ssr/src/utils/explore/merchant.test.ts
git commit -F - <<'EOF'
feat(ssr): add the store locator's map, place and merchant rules

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: Strings and icons

**Files:**
- Modify: `apps/ssr/src/language-data/unirefund/SSRService/resources/en.json` and `tr.json`.
- Modify: `apps/ssr/scripts/gen-ionicons.mjs`, then regenerate `apps/ssr/src/components/shell/ionicons.tsx`.

**Interfaces:**
- Produces:
  - the 15 keys below;
  - the icons `IoCallOutline` and `IoNavigateOutline`, which join the existing `IoListOutline`, `IoMailOutline`, `IoLocationOutline` and `IoChevronBack`.

- [ ] **Step 1: Strings.** With the Edit tool, insert these lines directly after the `"Explore.Location.Unsupported"` line in each file.

`en.json`:

```json
  "Explore.Layer.ExitPoints": "Exit points",
  "Explore.Cluster.Places": "{0} places",
  "Explore.Unserved": "No Unirefund places in this area. Move the map to a country we serve.",
  "Explore.Results.Title": "Places in this area",
  "Explore.Results.Clustered": "{0} places here. Zoom in to see them.",
  "Explore.Results.Nearest": "Nearest first",
  "Explore.List": "List",
  "Explore.Search.Stores": "Stores",
  "Explore.Search.Places": "Places",
  "Explore.Place.PartOf": "Part of {0}",
  "Explore.Place.NotFound": "This place is no longer on the map.",
  "Explore.Place.LoadFailed": "We couldn't load this place's details.",
  "Explore.Place.Phone": "Phone",
  "Explore.Place.Email": "E-mail",
  "Explore.Place.GetDirections": "Get directions",
```

`tr.json`:

```json
  "Explore.Layer.ExitPoints": "Çıkış noktaları",
  "Explore.Cluster.Places": "{0} yer",
  "Explore.Unserved": "Bu bölgede Unirefund noktası yok. Haritayı hizmet verdiğimiz bir ülkeye taşıyın.",
  "Explore.Results.Title": "Bu bölgedeki yerler",
  "Explore.Results.Clustered": "Burada {0} yer var. Görmek için yakınlaştırın.",
  "Explore.Results.Nearest": "En yakın önce",
  "Explore.List": "Liste",
  "Explore.Search.Stores": "Mağazalar",
  "Explore.Search.Places": "Yerler",
  "Explore.Place.PartOf": "{0} bünyesinde",
  "Explore.Place.NotFound": "Bu yer artık haritada değil.",
  "Explore.Place.LoadFailed": "Bu yerin ayrıntıları yüklenemedi.",
  "Explore.Place.Phone": "Telefon",
  "Explore.Place.Email": "E-posta",
  "Explore.Place.GetDirections": "Yol tarifi al",
```

Run `pnpm --filter ssr run init`. Then check:
- `grep -c '^  "'` on each file gives **919**, up from 904;
- the en and tr key sets are equal;
- there are no duplicate keys.

- [ ] **Step 2: Icons.**
  1. In `apps/ssr/scripts/gen-ionicons.mjs`, append `"call-outline", "navigate-outline",` at the end of `NAMES`.
  2. Run `node apps/ssr/scripts/gen-ionicons.mjs`. It fetches from unpkg, so it needs network.
  3. Check:
     - `grep -c "^export function Io" apps/ssr/src/components/shell/ionicons.tsx` gives **73**;
     - the diff only adds the two functions.

- [ ] **Step 3: Run the gates.**

- [ ] **Step 4: Commit.**

```bash
git add apps/ssr/src/language-data/unirefund/SSRService/resources/en.json apps/ssr/src/language-data/unirefund/SSRService/resources/tr.json apps/ssr/scripts/gen-ionicons.mjs apps/ssr/src/components/shell/ionicons.tsx
git commit -F - <<'EOF'
feat(ssr): add the store locator's strings and icons

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: One map request, the new layers, clusters and the results list

**Files:**
- **Modify:**
  - `packages/actions/unirefund/CRMService/actions.ts`: the three viewport actions and `EXPLORE_COUNTRY_TENANT` go, and two actions are added.
- **Create**, in `apps/ssr/src/app/[lang]/(public)/explore/_components/`:
  - `use-map-viewport.ts`
  - `use-is-wide.ts`
  - `place-tile.tsx`
  - `places-list.tsx`
  - `results-status.tsx`
  - `results-panel.tsx`
  - `list-sheet.tsx`
- **Rewrite:**
  - `explore-map.tsx`
  - `layer-pins.ts`
  - `layers-sheet.tsx`
  - `map-controls.tsx`
  - `place-sheet.tsx` (interim, pin data only)
  - `page.tsx`
- **Delete:**
  - `_components/use-viewport-layer.ts`
  - `apps/ssr/src/utils/explore/viewport.ts` and `viewport.test.ts`
  - `layers.ts` and `layers.test.ts`
  - `directions.ts` and `directions.test.ts`
- **Trim:** `apps/ssr/src/utils/explore/sectors.ts` and `sectors.test.ts` keep only `SectorOption`, `mergeSelectedSector` and its tests. `sector-sheet.tsx` still imports them. Delete `deriveSectorOptions`, `retainSectorOptions`, `sameSectorOptions` and their tests, plus the `ViewportPlace` import.

**Interfaces:**
- **Consumes:**
  - Task 1: `ApiErrorServerResponse.code`.
  - Task 2: `map.ts`, `places.ts`, `merchant.ts` (`directionsUrls`).
  - Task 3: the keys and icons.
- **Produces:**
  - Actions: `getPublicMapViewportApi(data)` and `getPublicMerchantDetailApi(id)`, each returning `structuredResponse(data)` or `structuredError(error)`.
  - Hooks:
    - `useMapViewport(query: MapViewportQuery | null): { status: "loading" | "ready" | "error" | "unserved"; viewport: MapViewport }`
    - `useIsWide(): boolean`, true at 1024 px and wider.
  - `ExploreMapHandle`: `{ zoomIn; zoomOut; flyTo(center); jumpTo(center) }`. Both move to `max(current zoom, 15)`; `jumpTo` does it without animation.
  - `ExploreMap` props: `pins`, `clusters`, `selectedKey`, `pinLabel`, `clusterLabel`, `onViewportChange(bounds)`, `onSelectPin(pin)`, `onReady`, `onLoaded`, `onUserMove` and `onMapError`.
  - Components: `PlaceTile({ layer, size })`, `PlacesList({ pins, origin, selectedKey, onSelect })`, `ResultsStatusLine({ status, nearest })`, `ResultsPanel` and `ListSheet`.

- [ ] **Step 1: The actions.** In `packages/actions/unirefund/CRMService/actions.ts`:
  - Remove the comment block, `EXPLORE_COUNTRY_TENANT`, `viewportClient`, and the three functions `getPublicMerchantsViewportApi`, `getPublicCustomsViewportApi` and `getPublicRefundPointsViewportApi`.
  - Remove their three `GetApiCrmServicePublic…ViewportData` type imports.
  - Add `GetApiCrmServicePublicMapViewportData` to the `@repo/saas/CRMService` import.
  - Add, in place of the removed code:

```ts
// Called from client components: they return the error, with its backend code,
// because a server action's thrown error reaches the browser without it.
export async function getPublicMapViewportApi(
  data: GetApiCrmServicePublicMapViewportData
) {
  try {
    const client = await getPublicCRMServiceClient();
    const dataResponse =
      await client.mapPublic.getApiCrmServicePublicMapViewport(data);
    return structuredResponse(dataResponse);
  } catch (error) {
    return structuredError(error);
  }
}

export async function getPublicMerchantDetailApi(id: string) {
  try {
    const client = await getPublicCRMServiceClient();
    const dataResponse =
      await client.merchantPublic.getApiCrmServicePublicMerchantsById({ id });
    return structuredResponse(dataResponse);
  } catch (error) {
    return structuredError(error);
  }
}
```

  Then check that `grep -rn "getPublic.*ViewportApi\|EXPLORE_COUNTRY_TENANT" apps packages --include=*.ts --include=*.tsx` lists only `page.tsx`, which Step 9 rewrites.

- [ ] **Step 2: `_components/use-map-viewport.ts`.**

```ts
"use client";
import {
  EMPTY_VIEWPORT,
  mapErrorKind,
  normalizeMapViewport,
  type MapViewport,
  type MapViewportQuery,
} from "@/src/utils/explore/map";
import { getPublicMapViewportApi } from "@repo/actions/unirefund/CRMService/actions";
import { useEffect, useState } from "react";

export type MapViewportStatus = "loading" | "ready" | "error" | "unserved";

type Answer = {
  query: MapViewportQuery;
  status: Exclude<MapViewportStatus, "loading">;
  viewport: MapViewport;
};

export function useMapViewport(query: MapViewportQuery | null): {
  status: MapViewportStatus;
  viewport: MapViewport;
} {
  const [answer, setAnswer] = useState<Answer | null>(null);

  useEffect(() => {
    if (!query) return;
    let disposed = false;
    getPublicMapViewportApi(query)
      .then((result) => {
        if (disposed) return;
        if (result.type === "success") {
          setAnswer({ query, status: "ready", viewport: normalizeMapViewport(result.data) });
          return;
        }
        if (mapErrorKind(result.code) === "unserved") {
          setAnswer({ query, status: "unserved", viewport: EMPTY_VIEWPORT });
          return;
        }
        // Keep what is drawn: one failed pan should not blank the map.
        setAnswer((previous) => ({
          query,
          status: "error",
          viewport: previous?.viewport ?? EMPTY_VIEWPORT,
        }));
      })
      .catch(() => {
        if (disposed) return;
        setAnswer((previous) => ({
          query,
          status: "error",
          viewport: previous?.viewport ?? EMPTY_VIEWPORT,
        }));
      });
    return () => {
      disposed = true;
    };
  }, [query]);

  if (!query) return { status: "ready", viewport: EMPTY_VIEWPORT };
  if (!answer) return { status: "loading", viewport: EMPTY_VIEWPORT };
  if (answer.query !== query) return { status: "loading", viewport: answer.viewport };
  return { status: answer.status, viewport: answer.viewport };
}
```

- [ ] **Step 3: `_components/use-is-wide.ts`.**

```ts
"use client";
import { useSyncExternalStore } from "react";

const WIDE_QUERY = "(min-width: 1024px)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function useIsWide(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false
  );
}
```

- [ ] **Step 4: `_components/layer-pins.ts`, rewritten, and `_components/place-tile.tsx`.**

```ts
import {
  IoBusinessOutline,
  IoStorefrontOutline,
  IoWalletOutline,
} from "@/src/components/shell/ionicons";
import type { MapLayerKey } from "@/src/utils/explore/map";

export const LAYER_PINS: Record<
  MapLayerKey,
  { Icon: typeof IoStorefrontOutline; fill: string }
> = {
  merchants: { Icon: IoStorefrontOutline, fill: "bg-primary" },
  refundPoints: { Icon: IoWalletOutline, fill: "bg-success" },
  exitPoints: { Icon: IoBusinessOutline, fill: "bg-warning" },
};

export const LAYER_LABEL_KEYS = {
  merchants: "Explore.Layer.Merchants",
  refundPoints: "Explore.Layer.RefundPoints",
  exitPoints: "Explore.Layer.ExitPoints",
} as const;
```

```tsx
import type { MapLayerKey } from "@/src/utils/explore/map";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import { LAYER_PINS } from "./layer-pins";

export function PlaceTile({
  layer,
  size = "md",
}: {
  layer: MapLayerKey;
  size?: "sm" | "md";
}) {
  const { Icon, fill } = LAYER_PINS[layer];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md text-primary-foreground",
        fill,
        size === "sm" ? "size-8" : "size-10"
      )}
    >
      <Icon size={size === "sm" ? 16 : 20} />
    </span>
  );
}
```

- [ ] **Step 5: `_components/layers-sheet.tsx`.** Only the imports, the label table and the prop types change. Replace everything above `export function LayersSheet` with:

```tsx
"use client";
import {
  IoCheckmarkCircle,
  IoEllipseOutline,
} from "@/src/components/shell/ionicons";
import { useTranslations } from "@/src/providers/i18n";
import { LAYER_ORDER, type MapLayerKey } from "@/src/utils/explore/map";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@repo/ayasofyazilim-ui/components/drawer";
import { LAYER_LABEL_KEYS, LAYER_PINS } from "./layer-pins";
```

In the props type, change these two lines:

```tsx
  active: Record<MapLayerKey, boolean>;
  onToggle: (layer: MapLayerKey) => void;
```

In the row, change `{copy[LABEL_KEYS[layer]]}` to `{copy[LAYER_LABEL_KEYS[layer]]}`. The rest of the file stays as it is.

- [ ] **Step 6: `_components/explore-map.tsx`, rewritten.**

```tsx
"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  toBounds,
  type Bounds,
  type MapCluster,
  type MapPin,
} from "@/src/utils/explore/map";
import { clusterSize, compactCount } from "@/src/utils/explore/places";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import { Map as MapLibreMap, Marker, setWorkerUrl } from "maplibre-gl";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { LAYER_PINS } from "./layer-pins";

// Webpack leaves import.meta.url as file://, so MapLibre cannot derive its worker URL.
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const INITIAL_CENTER: [number, number] = [28.9966448299549, 41.011903723721645];
const INITIAL_ZOOM = 9;
const FLY_TO_ZOOM = 15;
const CLUSTER_ZOOM_STEP = 3;
const PIN_OFFSET: [number, number] = [0, -7];

export type ExploreMapHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  flyTo: (center: [number, number]) => void;
  jumpTo: (center: [number, number]) => void;
};

function MapMarker({
  map,
  longitude,
  latitude,
  anchor,
  offset,
  className,
  children,
}: {
  map: MapLibreMap;
  longitude: number;
  latitude: number;
  anchor: "bottom" | "center";
  offset?: [number, number];
  className?: string;
  children: ReactNode;
}) {
  const [element] = useState(() => document.createElement("div"));
  useEffect(() => {
    const marker = new Marker({ element, anchor, offset, className })
      .setLngLat([longitude, latitude])
      .addTo(map);
    return () => {
      marker.remove();
    };
  }, [map, element, anchor, offset, className, longitude, latitude]);
  return createPortal(children, element);
}

export function ExploreMap({
  pins,
  clusters,
  selectedKey,
  pinLabel,
  clusterLabel,
  onViewportChange,
  onSelectPin,
  onReady,
  onLoaded,
  onUserMove,
  onMapError,
}: {
  pins: MapPin[];
  clusters: MapCluster[];
  selectedKey: string | null;
  pinLabel: (pin: MapPin) => string;
  clusterLabel: (count: number) => string;
  onViewportChange: (bounds: Bounds) => void;
  onSelectPin: (pin: MapPin) => void;
  onReady: (handle: ExploreMapHandle) => void;
  onLoaded: () => void;
  onUserMove: () => void;
  onMapError: () => void;
}) {
  const { lang } = useParams<{ lang: string }>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const viewportChangeRef = useRef(onViewportChange);
  const readyRef = useRef(onReady);
  const loadedRef = useRef(onLoaded);
  const userMoveRef = useRef(onUserMove);
  const mapErrorRef = useRef(onMapError);
  useEffect(() => {
    viewportChangeRef.current = onViewportChange;
    readyRef.current = onReady;
    loadedRef.current = onLoaded;
    userMoveRef.current = onUserMove;
    mapErrorRef.current = onMapError;
  }, [onViewportChange, onReady, onLoaded, onUserMove, onMapError]);

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
    let loadedOnce = false;
    const report = () => {
      const bounds = instance.getBounds();
      viewportChangeRef.current(
        toBounds([
          bounds.getWest(),
          bounds.getSouth(),
          bounds.getEast(),
          bounds.getNorth(),
        ])
      );
    };
    instance.on("load", () => {
      loadedOnce = true;
      setMap(instance);
      report();
      loadedRef.current();
    });
    instance.on("moveend", report);
    instance.on("movestart", (event) => {
      if ("originalEvent" in event && event.originalEvent) userMoveRef.current();
    });
    instance.on("error", () => {
      if (!loadedOnce) mapErrorRef.current();
    });
    readyRef.current({
      zoomIn: () => instance.zoomIn(),
      zoomOut: () => instance.zoomOut(),
      flyTo: (center) =>
        instance.flyTo({
          center,
          zoom: Math.max(instance.getZoom(), FLY_TO_ZOOM),
        }),
      jumpTo: (center) =>
        instance.jumpTo({
          center,
          zoom: Math.max(instance.getZoom(), FLY_TO_ZOOM),
        }),
    });
    return () => {
      instance.remove();
    };
  }, []);

  return (
    <div className="absolute inset-0" data-testid="explore-map">
      <div className="size-full" ref={containerRef} />
      {map
        ? pins.map((pin) => {
            const { Icon, fill } = LAYER_PINS[pin.layer];
            const selected = pin.key === selectedKey;
            return (
              <MapMarker
                anchor="bottom"
                className={selected ? "z-10" : undefined}
                key={pin.key}
                latitude={pin.latitude}
                longitude={pin.longitude}
                map={map}
                offset={PIN_OFFSET}
              >
                <button
                  aria-label={pinLabel(pin)}
                  aria-pressed={selected}
                  className={cn(
                    "flex aspect-square -rotate-45 items-center justify-center rounded-full rounded-bl-none text-primary-foreground shadow-lg",
                    fill,
                    selected ? "w-11 ring-4 ring-primary-foreground" : "w-8"
                  )}
                  data-testid={`explore-pin-${pin.key}`}
                  onClick={() => onSelectPin(pin)}
                  type="button"
                >
                  <Icon className="rotate-45" size={selected ? 22 : 16} />
                </button>
              </MapMarker>
            );
          })
        : null}
      {map
        ? clusters.map((cluster) => {
            const size = clusterSize(cluster.count);
            return (
              <MapMarker
                anchor="center"
                key={cluster.key}
                latitude={cluster.latitude}
                longitude={cluster.longitude}
                map={map}
              >
                <button
                  aria-label={clusterLabel(cluster.count)}
                  className="flex items-center justify-center rounded-full border-2 border-primary-foreground bg-primary font-sans text-sm font-semibold text-primary-foreground shadow-lg"
                  data-testid="explore-cluster"
                  onClick={() =>
                    map.easeTo({
                      center: [cluster.longitude, cluster.latitude],
                      zoom: Math.min(
                        map.getZoom() + CLUSTER_ZOOM_STEP,
                        map.getMaxZoom()
                      ),
                    })
                  }
                  style={{ width: size, height: size }}
                  type="button"
                >
                  {compactCount(cluster.count, lang)}
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

- [ ] **Step 7: The list components.**

`_components/results-status.tsx`:

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import type { ResultsStatus } from "@/src/utils/explore/map";
import { useParams } from "next/navigation";

export function ResultsStatusLine({
  status,
  nearest,
}: {
  status: ResultsStatus;
  nearest: boolean;
}) {
  const { t } = useTranslations();
  const copy = t.SSRService;
  const { lang } = useParams<{ lang: string }>();
  const count = (value: number) => new Intl.NumberFormat(lang).format(value);
  const text =
    status.kind === "loading"
      ? copy["Explore.Loading"]
      : status.kind === "unserved"
        ? copy["Explore.Unserved"]
        : status.kind === "clustered"
          ? copy["Explore.Results.Clustered"].replace("{0}", count(status.count))
          : status.kind === "empty"
            ? copy["Explore.Empty"]
            : copy["Explore.Cluster.Places"].replace("{0}", count(status.count));
  return (
    <p
      className="px-4 pb-3 text-sm text-muted-foreground"
      data-testid="explore-results-status"
      role="status"
    >
      {text}
      {nearest && status.kind === "count"
        ? ` · ${copy["Explore.Results.Nearest"]}`
        : null}
    </p>
  );
}
```

`_components/places-list.tsx`:

```tsx
"use client";
import type { MapPin } from "@/src/utils/explore/map";
import {
  distanceMeters,
  formatDistance,
  type LatLng,
} from "@/src/utils/explore/places";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import { useParams } from "next/navigation";
import { PlaceTile } from "./place-tile";

export function PlacesList({
  pins,
  origin,
  selectedKey,
  onSelect,
}: {
  pins: MapPin[];
  origin: LatLng | null;
  selectedKey: string | null;
  onSelect: (pin: MapPin) => void;
}) {
  const { lang } = useParams<{ lang: string }>();
  if (pins.length === 0) return null;
  return (
    <ul className="flex flex-col" data-testid="explore-places-list">
      {pins.map((pin) => (
        <li key={pin.key}>
          <button
            aria-current={pin.key === selectedKey ? "true" : undefined}
            className={cn(
              "flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left hover:bg-foreground/5",
              pin.key === selectedKey && "bg-primary/5"
            )}
            data-testid={`explore-place-row-${pin.key}`}
            onClick={() => onSelect(pin)}
            type="button"
          >
            <PlaceTile layer={pin.layer} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-semibold text-foreground">
                {pin.name}
              </span>
              {pin.headquarterName ? (
                <span className="block truncate text-sm text-muted-foreground">
                  {pin.headquarterName}
                </span>
              ) : null}
              {pin.addressLine ? (
                <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">
                  {pin.addressLine}
                </span>
              ) : null}
            </span>
            {origin ? (
              <span className="shrink-0 text-sm font-medium text-foreground">
                {formatDistance(distanceMeters(origin, pin), lang)}
              </span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
```

`_components/results-panel.tsx` (the list only; Task 5 adds the detail):

```tsx
"use client";
import { PINNED_BAR_CLEARANCE_CLASS } from "@/src/components/shell/tab-page";
import { useTranslations } from "@/src/providers/i18n";
import type { MapPin, ResultsStatus } from "@/src/utils/explore/map";
import type { LatLng } from "@/src/utils/explore/places";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import { PlacesList } from "./places-list";
import { ResultsStatusLine } from "./results-status";

export function ResultsPanel({
  status,
  pins,
  origin,
  selectedKey,
  onSelect,
}: {
  status: ResultsStatus;
  pins: MapPin[];
  origin: LatLng | null;
  selectedKey: string | null;
  onSelect: (pin: MapPin) => void;
}) {
  const { t } = useTranslations();
  return (
    <aside
      className="flex h-full w-[380px] shrink-0 flex-col border-r border-border bg-card"
      data-testid="explore-results-panel"
    >
      <h1 className="px-4 pt-5 pb-2 text-2xl font-bold text-foreground">
        {t.SSRService["Explore.Results.Title"]}
      </h1>
      <ResultsStatusLine nearest={origin !== null} status={status} />
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto border-t border-border",
          PINNED_BAR_CLEARANCE_CLASS
        )}
      >
        <PlacesList
          onSelect={onSelect}
          origin={origin}
          pins={pins}
          selectedKey={selectedKey}
        />
      </div>
    </aside>
  );
}
```

`_components/list-sheet.tsx`:

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import type { MapPin, ResultsStatus } from "@/src/utils/explore/map";
import type { LatLng } from "@/src/utils/explore/places";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@repo/ayasofyazilim-ui/components/drawer";
import { PlacesList } from "./places-list";
import { ResultsStatusLine } from "./results-status";

export function ListSheet({
  open,
  onOpenChange,
  status,
  pins,
  origin,
  selectedKey,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: ResultsStatus;
  pins: MapPin[];
  origin: LatLng | null;
  selectedKey: string | null;
  onSelect: (pin: MapPin) => void;
}) {
  const { t } = useTranslations();
  return (
    <Drawer onOpenChange={onOpenChange} open={open}>
      <DrawerContent
        aria-describedby={undefined}
        className="mx-auto max-h-[80vh] w-full max-w-3xl md:border-x"
        data-testid="explore-list-sheet"
      >
        <DrawerTitle className="px-4 pt-4 pb-1 text-lg font-semibold text-foreground">
          {t.SSRService["Explore.Results.Title"]}
        </DrawerTitle>
        <ResultsStatusLine nearest={origin !== null} status={status} />
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-border pb-6">
          <PlacesList
            onSelect={onSelect}
            origin={origin}
            pins={pins}
            selectedKey={selectedKey}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 8: Controls and the interim place sheet.**

**`map-controls.tsx`.** Only the List control replaces the sector control; `Control` and the 2·1·2 groups stay.

In the icon import, `IoFunnelOutline` becomes `IoListOutline`:

```tsx
import {
  IoAdd,
  IoLayersOutline,
  IoListOutline,
  IoLocate,
  IoRemove,
} from "@/src/components/shell/ionicons";
```

The `MapControls` props become:

```tsx
export function MapControls({
  locating,
  listActive,
  onOpenLayers,
  onOpenList,
  onLocate,
  onZoomIn,
  onZoomOut,
}: {
  locating: boolean;
  listActive: boolean;
  onOpenLayers: () => void;
  onOpenList: () => void;
  onLocate: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
```

The second control of the first group becomes:

```tsx
            <Control
              Icon={IoListOutline}
              id="list"
              key="list"
              label={copy["Explore.List"]}
              onClick={onOpenList}
              tinted={listActive}
            />,
```

**`place-sheet.tsx` (interim; Task 5 replaces it).**

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import type { MapPin } from "@/src/utils/explore/map";
import { directionsUrls } from "@/src/utils/explore/merchant";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@repo/ayasofyazilim-ui/components/drawer";

export function PlaceSheet({
  pin,
  open,
  onOpenChange,
}: {
  pin: MapPin | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslations();
  const copy = t.SSRService;
  const urls = pin
    ? directionsUrls({ latitude: pin.latitude, longitude: pin.longitude })
    : null;

  return (
    <Drawer onOpenChange={onOpenChange} open={open}>
      <DrawerContent
        aria-describedby={undefined}
        className="mx-auto w-full max-w-3xl md:border-x"
        data-testid="explore-place-sheet"
      >
        <div className="flex flex-col gap-2 p-4 pb-8">
          <DrawerTitle className="text-lg font-semibold text-foreground">
            {pin?.name}
          </DrawerTitle>
          <p className="text-base text-muted-foreground">
            {pin?.addressLine || copy["Explore.Place.NoAddress"]}
          </p>
          {urls ? (
            <div className="flex gap-2 pt-2">
              <Button
                asChild
                data-testid="explore-directions-google"
                size="sm"
                variant="secondary"
              >
                <a
                  data-testid="explore-directions-google"
                  href={urls.google}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Google Maps
                </a>
              </Button>
              <Button
                asChild
                data-testid="explore-directions-apple"
                size="sm"
                variant="secondary"
              >
                <a
                  data-testid="explore-directions-apple"
                  href={urls.apple}
                  rel="noopener noreferrer"
                  target="_blank"
                >
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

- [ ] **Step 9: `page.tsx`, rewritten.**

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import {
  locationFailure,
  type LocationFailure,
} from "@/src/utils/explore/location";
import {
  DEFAULT_LAYERS,
  isSpanValid,
  resultsStatus,
  toggleLayer,
  toMapViewportQuery,
  type Bounds,
  type MapLayerKey,
  type MapPin,
} from "@/src/utils/explore/map";
import { sortPlaces } from "@/src/utils/explore/places";
import { toast } from "@repo/ayasofyazilim-ui/components/sonner";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import type { ExploreMapHandle } from "./_components/explore-map";
import { LAYER_LABEL_KEYS } from "./_components/layer-pins";
import { LayersSheet } from "./_components/layers-sheet";
import { ListSheet } from "./_components/list-sheet";
import { MapControls } from "./_components/map-controls";
import { PlaceSearch } from "./_components/place-search";
import { PlaceSheet } from "./_components/place-sheet";
import { ResultsPanel } from "./_components/results-panel";
import { useDebouncedValue } from "./_components/use-debounced-value";
import { useIsWide } from "./_components/use-is-wide";
import { useMapViewport } from "./_components/use-map-viewport";

const ExploreMap = dynamic(
  () => import("./_components/explore-map").then((mod) => mod.ExploreMap),
  { ssr: false }
);

const VIEWPORT_DEBOUNCE_MS = 350;

const LOCATION_KEYS: Record<
  LocationFailure,
  | "Explore.Location.Denied"
  | "Explore.Location.Unsupported"
  | "Explore.Location.Unavailable"
> = {
  denied: "Explore.Location.Denied",
  unsupported: "Explore.Location.Unsupported",
  unavailable: "Explore.Location.Unavailable",
};

export default function Page() {
  const { t } = useTranslations();
  const copy = t.SSRService;
  const { lang } = useParams<{ lang: string }>();
  const wide = useIsWide();
  const [rawBounds, setRawBounds] = useState<Bounds | null>(null);
  const bounds = useDebouncedValue(rawBounds, VIEWPORT_DEBOUNCE_MS);
  const [active, setActive] = useState(DEFAULT_LAYERS);
  const query = useMemo(
    () => toMapViewportQuery(bounds, active),
    [bounds, active]
  );
  const { status, viewport } = useMapViewport(query);
  const anyLayer = Object.values(active).some(Boolean);
  const results = resultsStatus({ status, viewport, anyLayer });
  const pins = useMemo(
    () => sortPlaces(viewport.pins, null, lang),
    [viewport.pins, lang]
  );
  const [selectedPin, setSelectedPin] = useState<MapPin | null>(null);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [layersOpen, setLayersOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const mapHandle = useRef<ExploreMapHandle | null>(null);

  const handleViewportChange = useCallback((next: Bounds) => {
    if (isSpanValid(next)) setRawBounds(next);
  }, []);
  const handleReady = useCallback((handle: ExploreMapHandle) => {
    mapHandle.current = handle;
  }, []);
  const handleMapError = useCallback(() => setMapFailed(true), []);
  const handleLoaded = useCallback(() => undefined, []);
  const handleUserMove = useCallback(() => undefined, []);
  const pinLabel = useCallback(
    (pin: MapPin) => {
      const name = pin.name || copy[LAYER_LABEL_KEYS[pin.layer]];
      return pin.headquarterName ? `${name}, ${pin.headquarterName}` : name;
    },
    [copy]
  );
  const clusterLabel = useCallback(
    (count: number) =>
      copy["Explore.Cluster.Places"].replace("{0}", String(count)),
    [copy]
  );

  function handleSelectPin(pin: MapPin) {
    setSelectedPin(pin);
    setPlaceOpen(true);
  }

  function handleListSelect(pin: MapPin) {
    setListOpen(false);
    handleSelectPin(pin);
  }

  function handleToggleLayer(layer: MapLayerKey) {
    setActive(toggleLayer(active, layer));
  }

  function handleOpenList() {
    if (wide) setPanelOpen((open) => !open);
    else setListOpen(true);
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
        mapHandle.current?.flyTo([
          position.coords.longitude,
          position.coords.latitude,
        ]);
      },
      (error) => {
        setLocating(false);
        toast.error(copy[LOCATION_KEYS[locationFailure(error.code)]]);
      },
      { maximumAge: 60_000, timeout: 10_000 }
    );
  }

  const banner = mapFailed
    ? copy["Explore.MapError"]
    : status === "unserved"
      ? copy["Explore.Unserved"]
      : status === "error"
        ? copy["Explore.Error"]
        : null;

  return (
    <div className="flex h-svh w-full overflow-hidden" data-testid="explore-page">
      {wide && panelOpen ? (
        <ResultsPanel
          onSelect={handleSelectPin}
          origin={null}
          pins={pins}
          selectedKey={selectedPin?.key ?? null}
          status={results}
        />
      ) : null}
      <div className="relative isolate h-full min-w-0 flex-1">
        {banner ? (
          <div
            className="pointer-events-none absolute inset-x-0 top-20 z-10 mx-auto w-full max-w-3xl px-4"
            data-testid="explore-error"
          >
            <p className="rounded-md border border-warning/40 bg-warning-surface px-4 py-3 text-sm text-warning">
              {banner}
            </p>
          </div>
        ) : null}
        <PlaceSearch onSelect={(center) => mapHandle.current?.flyTo(center)} />
        <MapControls
          listActive={wide && panelOpen}
          locating={locating}
          onLocate={handleLocate}
          onOpenLayers={() => setLayersOpen(true)}
          onOpenList={handleOpenList}
          onZoomIn={() => mapHandle.current?.zoomIn()}
          onZoomOut={() => mapHandle.current?.zoomOut()}
        />
        <LayersSheet
          active={active}
          onOpenChange={setLayersOpen}
          onToggle={handleToggleLayer}
          open={layersOpen}
        />
        {!wide ? (
          <ListSheet
            onOpenChange={setListOpen}
            onSelect={handleListSelect}
            open={listOpen}
            origin={null}
            pins={pins}
            selectedKey={selectedPin?.key ?? null}
            status={results}
          />
        ) : null}
        <PlaceSheet
          onOpenChange={setPlaceOpen}
          open={placeOpen}
          pin={selectedPin}
        />
        <ExploreMap
          clusterLabel={clusterLabel}
          clusters={viewport.clusters}
          onLoaded={handleLoaded}
          onMapError={handleMapError}
          onReady={handleReady}
          onSelectPin={handleSelectPin}
          onUserMove={handleUserMove}
          onViewportChange={handleViewportChange}
          pinLabel={pinLabel}
          pins={viewport.pins}
          selectedKey={selectedPin?.key ?? null}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Delete and trim** the files listed under Files.
  - `git rm` each deleted file.
  - `grep -rn "utils/explore/viewport\|utils/explore/layers\|utils/explore/directions\|use-viewport-layer" apps/ssr/src` must print nothing.

- [ ] **Step 11: Run the gates.** Every gate must be green now, with **no** baseline type errors left. Report the `test:unit` count: the Task 2 total, minus the deleted suites' tests.

- [ ] **Step 12: Commit.** Stage every changed, created and deleted path by name.

```bash
git commit -F - <<'EOF'
feat(ssr): load Explore from the CRM's map viewport and add the results list

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: Selection, detail, store search and locate-on-open

**Files:**
- **Create**, in `_components/`:
  - `use-merchant-detail.ts`
  - `place-detail.tsx`
- **Rewrite:**
  - `_components/place-sheet.tsx` (final)
  - `_components/results-panel.tsx` (adds the detail)
  - `_components/place-search.tsx` (adds the Stores group)
  - `page.tsx` (final)

**Interfaces:**
- **Consumes:**
  - Task 4: `getPublicMerchantDetailApi`, `ExploreMapHandle.jumpTo`, the `ExploreMap` props `onLoaded` and `onUserMove`, `PlaceTile`, `PlacesList`, `ResultsStatusLine` and `useIsWide`.
  - Task 2: `pickAddress`, `addressLines`, `directionsUrls`, `telHref`, `merchantErrorKind`, `matchStores`, `sortPlaces`, `autoLocateCenter`, `distanceMeters` and `formatDistance`.
- **Produces:**
  - `useMerchantDetail(id: string | null)` returns `{ status: "idle" | "loading" | "notFound" | "error" } | { status: "ready"; detail }`, plus `retry()`.
  - `PlaceDetail({ pin, origin, onBack? })`.

- [ ] **Step 1: `_components/use-merchant-detail.ts`.**

```ts
"use client";
import { merchantErrorKind } from "@/src/utils/explore/map";
import { getPublicMerchantDetailApi } from "@repo/actions/unirefund/CRMService/actions";
import type { UniRefund_CRMService_Merchants_MerchantPublicDetailDto as MerchantDetail } from "@repo/saas/CRMService";
import { useCallback, useEffect, useState } from "react";

type Settled =
  | { status: "ready"; detail: MerchantDetail }
  | { status: "notFound" }
  | { status: "error" };

export type MerchantDetailState =
  | { status: "idle" }
  | { status: "loading" }
  | Settled;

export function useMerchantDetail(
  id: string | null
): MerchantDetailState & { retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<{ key: string; state: Settled } | null>(null);
  const key = id ? `${id}|${attempt}` : null;

  useEffect(() => {
    if (!id || !key) return;
    let disposed = false;
    getPublicMerchantDetailApi(id)
      .then((result) => {
        if (disposed) return;
        if (result.type === "success") {
          setAnswer({ key, state: { status: "ready", detail: result.data } });
          return;
        }
        setAnswer({
          key,
          state:
            merchantErrorKind(result.code, result.status) === "notFound"
              ? { status: "notFound" }
              : { status: "error" },
        });
      })
      .catch(() => {
        if (!disposed) setAnswer({ key, state: { status: "error" } });
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

- [ ] **Step 2: `_components/place-detail.tsx`.**

```tsx
"use client";
import {
  IoCallOutline,
  IoChevronBack,
  IoLocationOutline,
  IoMailOutline,
  IoNavigateOutline,
} from "@/src/components/shell/ionicons";
import { useTranslations } from "@/src/providers/i18n";
import type { MapPin } from "@/src/utils/explore/map";
import {
  addressLines,
  directionsUrls,
  pickAddress,
  telHref,
} from "@/src/utils/explore/merchant";
import {
  distanceMeters,
  formatDistance,
  type LatLng,
} from "@/src/utils/explore/places";
import { Badge } from "@repo/ayasofyazilim-ui/components/badge";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import { Skeleton } from "@repo/ayasofyazilim-ui/components/skeleton";
import { useParams } from "next/navigation";
import { PlaceTile } from "./place-tile";
import { useMerchantDetail } from "./use-merchant-detail";

export function PlaceDetail({
  pin,
  origin,
  onBack,
}: {
  pin: MapPin;
  origin: LatLng | null;
  onBack?: () => void;
}) {
  const { t } = useTranslations();
  const copy = t.SSRService;
  const { lang } = useParams<{ lang: string }>();
  const merchant = useMerchantDetail(pin.layer === "merchants" ? pin.id : null);
  const detail = merchant.status === "ready" ? merchant.detail : null;
  const address = detail ? pickAddress(detail, pin.addressId) : null;
  const lines = address
    ? addressLines(address)
    : pin.addressLine
      ? [pin.addressLine]
      : [];
  const urls = directionsUrls({
    latitude: address?.latitude ?? pin.latitude,
    longitude: address?.longitude ?? pin.longitude,
    placeId: address?.placeId ?? null,
  });
  const headquarter = detail?.headquarterName?.trim() || pin.headquarterName;
  const sectors = (detail?.sectors ?? [])
    .map((sector) => sector.name?.trim())
    .filter((name): name is string => Boolean(name));
  const phone = detail?.primaryPhone?.trim() || null;
  const phoneHref = phone ? telHref(phone) : null;
  const email = detail?.primaryEmail?.trim() || null;

  return (
    <div className="flex flex-col gap-4 p-4 pb-8" data-testid="explore-place-detail">
      {onBack ? (
        <button
          aria-label={copy["Header.Back"]}
          className="flex size-10 items-center justify-center rounded-full border border-border text-foreground"
          data-testid="explore-place-back"
          onClick={onBack}
          type="button"
        >
          <IoChevronBack size={22} />
        </button>
      ) : null}
      <div className="flex items-start gap-3">
        <PlaceTile layer={pin.layer} />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-foreground">
            {detail?.name?.trim() || pin.name}
          </h2>
          {headquarter ? (
            <p className="text-sm text-muted-foreground">
              {copy["Explore.Place.PartOf"].replace("{0}", headquarter)}
            </p>
          ) : null}
        </div>
        {origin ? (
          <span className="shrink-0 text-sm font-medium text-foreground">
            {formatDistance(distanceMeters(origin, pin), lang)}
          </span>
        ) : null}
      </div>
      {sectors.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {sectors.map((name) => (
            <Badge className="max-w-full" key={name} title={name} variant="outline">
              <span className="min-w-0 truncate">{name}</span>
            </Badge>
          ))}
        </div>
      ) : null}
      {lines.length > 0 ? (
        <a
          className="flex items-start gap-3 text-base text-foreground"
          data-testid="explore-place-address"
          href={urls.google}
          rel="noopener noreferrer"
          target="_blank"
        >
          <IoLocationOutline className="mt-0.5 shrink-0 text-muted-foreground" size={20} />
          <span>
            {lines.map((line) => (
              <span className="block" key={line}>
                {line}
              </span>
            ))}
          </span>
        </a>
      ) : (
        <p className="text-base text-muted-foreground">
          {copy["Explore.Place.NoAddress"]}
        </p>
      )}
      {phone && phoneHref ? (
        <a
          aria-label={`${copy["Explore.Place.Phone"]}: ${phone}`}
          className="flex items-center gap-3 text-base text-foreground"
          data-testid="explore-place-phone"
          href={phoneHref}
        >
          <IoCallOutline className="shrink-0 text-muted-foreground" size={20} />
          {phone}
        </a>
      ) : null}
      {email ? (
        <a
          aria-label={`${copy["Explore.Place.Email"]}: ${email}`}
          className="flex items-center gap-3 break-all text-base text-foreground"
          data-testid="explore-place-email"
          href={`mailto:${email}`}
        >
          <IoMailOutline className="shrink-0 text-muted-foreground" size={20} />
          {email}
        </a>
      ) : null}
      {merchant.status === "loading" ? (
        <div className="flex flex-col gap-2" data-testid="explore-place-loading">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
        </div>
      ) : null}
      {merchant.status === "notFound" ? (
        <p className="text-sm text-muted-foreground" data-testid="explore-place-not-found" role="status">
          {copy["Explore.Place.NotFound"]}
        </p>
      ) : null}
      {merchant.status === "error" ? (
        <div className="flex flex-col items-start gap-2" data-testid="explore-place-error">
          <p className="text-sm text-muted-foreground" role="status">
            {copy["Explore.Place.LoadFailed"]}
          </p>
          <Button data-testid="explore-place-retry" onClick={merchant.retry} size="sm" variant="outline">
            {copy.TryAgain}
          </Button>
        </div>
      ) : null}
      <Button
        asChild
        className="h-12 w-full gap-2 rounded-md text-base font-bold shadow-lg"
        data-testid="explore-directions-google"
      >
        <a
          data-testid="explore-directions-google"
          href={urls.google}
          rel="noopener noreferrer"
          target="_blank"
        >
          <IoNavigateOutline size={20} />
          {copy["Explore.Place.GetDirections"]}
        </a>
      </Button>
      <a
        className="text-center text-sm font-semibold text-primary"
        data-testid="explore-directions-apple"
        href={urls.apple}
        rel="noopener noreferrer"
        target="_blank"
      >
        Apple Maps
      </a>
    </div>
  );
}
```

- [ ] **Step 3: `_components/place-sheet.tsx` (final) and `_components/results-panel.tsx` (with the detail).**

```tsx
"use client";
import type { MapPin } from "@/src/utils/explore/map";
import type { LatLng } from "@/src/utils/explore/places";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@repo/ayasofyazilim-ui/components/drawer";
import { PlaceDetail } from "./place-detail";

export function PlaceSheet({
  pin,
  origin,
  open,
  onOpenChange,
}: {
  pin: MapPin | null;
  origin: LatLng | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Drawer onOpenChange={onOpenChange} open={open}>
      <DrawerContent
        aria-describedby={undefined}
        className="mx-auto max-h-[85vh] w-full max-w-3xl md:border-x"
        data-testid="explore-place-sheet"
      >
        <DrawerTitle className="sr-only">{pin?.name}</DrawerTitle>
        <div className="min-h-0 overflow-y-auto">
          {pin ? <PlaceDetail key={pin.key} origin={origin} pin={pin} /> : null}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

`_components/results-panel.tsx` (final). The detail replaces the heading, status line and list while a place is selected:

```tsx
"use client";
import { PINNED_BAR_CLEARANCE_CLASS } from "@/src/components/shell/tab-page";
import { useTranslations } from "@/src/providers/i18n";
import type { MapPin, ResultsStatus } from "@/src/utils/explore/map";
import type { LatLng } from "@/src/utils/explore/places";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import { PlaceDetail } from "./place-detail";
import { PlacesList } from "./places-list";
import { ResultsStatusLine } from "./results-status";

export function ResultsPanel({
  status,
  pins,
  origin,
  selectedPin,
  onSelect,
  onBack,
}: {
  status: ResultsStatus;
  pins: MapPin[];
  origin: LatLng | null;
  selectedPin: MapPin | null;
  onSelect: (pin: MapPin) => void;
  onBack: () => void;
}) {
  const { t } = useTranslations();
  return (
    <aside
      className="flex h-full w-[380px] shrink-0 flex-col border-r border-border bg-card"
      data-testid="explore-results-panel"
    >
      {selectedPin ? (
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto",
            PINNED_BAR_CLEARANCE_CLASS
          )}
        >
          <PlaceDetail
            key={selectedPin.key}
            onBack={onBack}
            origin={origin}
            pin={selectedPin}
          />
        </div>
      ) : (
        <>
          <h1 className="px-4 pt-5 pb-2 text-2xl font-bold text-foreground">
            {t.SSRService["Explore.Results.Title"]}
          </h1>
          <ResultsStatusLine nearest={origin !== null} status={status} />
          <div
            className={cn(
              "min-h-0 flex-1 overflow-y-auto border-t border-border",
              PINNED_BAR_CLEARANCE_CLASS
            )}
          >
            <PlacesList
              onSelect={onSelect}
              origin={origin}
              pins={pins}
              selectedKey={null}
            />
          </div>
        </>
      )}
    </aside>
  );
}
```

- [ ] **Step 4: `_components/place-search.tsx`, with the Stores group.**
  - **Store matches** use the **raw** query, because they are local and instant. Photon keeps its debounce.
  - **The dropdown opens** once either group has something to show.
  - **When there are stores but no places,** no "no results" row is shown. When neither has results, today's "no results" row shows.

```tsx
"use client";
import {
  IoCloseCircle,
  IoSearchOutline,
} from "@/src/components/shell/ionicons";
import { useTranslations } from "@/src/providers/i18n";
import type { MapPin } from "@/src/utils/explore/map";
import { matchStores } from "@/src/utils/explore/places";
import { Input } from "@repo/ayasofyazilim-ui/components/input";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { PlaceTile } from "./place-tile";
import { useDebouncedValue } from "./use-debounced-value";
import { usePlaceSearch } from "./use-place-search";

const SEARCH_DEBOUNCE_MS = 350;

function StatusRow({
  label,
  error = false,
}: {
  label: string;
  error?: boolean;
}) {
  return (
    <p
      className={cn(
        "px-3 py-3 text-base",
        error ? "text-error" : "text-muted-foreground"
      )}
    >
      {label}
    </p>
  );
}

function GroupLabel({ label }: { label: string }) {
  return (
    <p className="px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {label}
    </p>
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
  const { t } = useTranslations();
  const copy = t.SSRService;
  const { lang } = useParams<{ lang: string }>();
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const state = usePlaceSearch(
    useDebouncedValue(query, SEARCH_DEBOUNCE_MS),
    lang
  );
  const stores = useMemo(
    () => matchStores(pins, query, lang),
    [pins, query, lang]
  );
  const hasStores = stores.length > 0;
  const showList = !collapsed && (hasStores || state.status !== "idle");

  function clear() {
    setQuery("");
    setCollapsed(true);
  }

  const placeRows =
    state.status === "loading" ? (
      <StatusRow label={copy["Explore.Search.Loading"]} />
    ) : state.status === "error" ? (
      <StatusRow error label={copy["Explore.Error"]} />
    ) : state.status === "ready" && state.results.length === 0 ? (
      hasStores ? null : (
        <StatusRow label={copy["Explore.Search.Empty"]} />
      )
    ) : state.status === "ready" ? (
      state.results.map((result) => (
        <button
          className="block w-full border-b border-border px-3 py-2.5 text-left text-base text-foreground last:border-b-0"
          data-testid={`explore-search-result-${result.id}`}
          key={result.id}
          onClick={() => {
            onSelectPlace(result.center);
            clear();
          }}
          type="button"
        >
          <span className="line-clamp-2">{result.label}</span>
        </button>
      ))
    ) : null;

  return (
    <div
      className="absolute inset-x-0 top-4 z-10 mx-auto w-full max-w-3xl px-4"
      data-testid="explore-search"
    >
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
          className="mt-2 max-h-80 overflow-y-auto rounded-md border border-border bg-card shadow-lg"
          data-testid="explore-search-results"
        >
          {hasStores ? (
            <>
              <GroupLabel label={copy["Explore.Search.Stores"]} />
              {stores.map((pin) => (
                <button
                  className="flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left last:border-b-0"
                  data-testid={`explore-search-store-${pin.key}`}
                  key={pin.key}
                  onClick={() => {
                    onSelectStore(pin);
                    clear();
                  }}
                  type="button"
                >
                  <PlaceTile layer={pin.layer} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-base text-foreground">
                      {pin.name}
                    </span>
                    {pin.addressLine ? (
                      <span className="block truncate text-sm text-muted-foreground">
                        {pin.addressLine}
                      </span>
                    ) : null}
                  </span>
                </button>
              ))}
            </>
          ) : null}
          {hasStores && placeRows ? (
            <GroupLabel label={copy["Explore.Search.Places"]} />
          ) : null}
          {placeRows}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: `page.tsx` (final).**

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import {
  locationFailure,
  type LocationFailure,
} from "@/src/utils/explore/location";
import {
  autoLocateCenter,
  DEFAULT_LAYERS,
  isSpanValid,
  resultsStatus,
  toggleLayer,
  toMapViewportQuery,
  type Bounds,
  type MapLayerKey,
  type MapPin,
} from "@/src/utils/explore/map";
import { sortPlaces, type LatLng } from "@/src/utils/explore/places";
import { toast } from "@repo/ayasofyazilim-ui/components/sonner";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import type { ExploreMapHandle } from "./_components/explore-map";
import { LAYER_LABEL_KEYS } from "./_components/layer-pins";
import { LayersSheet } from "./_components/layers-sheet";
import { ListSheet } from "./_components/list-sheet";
import { MapControls } from "./_components/map-controls";
import { PlaceSearch } from "./_components/place-search";
import { PlaceSheet } from "./_components/place-sheet";
import { ResultsPanel } from "./_components/results-panel";
import { useDebouncedValue } from "./_components/use-debounced-value";
import { useIsWide } from "./_components/use-is-wide";
import { useMapViewport } from "./_components/use-map-viewport";

const ExploreMap = dynamic(
  () => import("./_components/explore-map").then((mod) => mod.ExploreMap),
  { ssr: false }
);

const VIEWPORT_DEBOUNCE_MS = 350;
const GEOLOCATION_OPTIONS: PositionOptions = {
  maximumAge: 60_000,
  timeout: 10_000,
};

const LOCATION_KEYS: Record<
  LocationFailure,
  | "Explore.Location.Denied"
  | "Explore.Location.Unsupported"
  | "Explore.Location.Unavailable"
> = {
  denied: "Explore.Location.Denied",
  unsupported: "Explore.Location.Unsupported",
  unavailable: "Explore.Location.Unavailable",
};

function toLatLng(position: GeolocationPosition): LatLng {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}

export default function Page() {
  const { t } = useTranslations();
  const copy = t.SSRService;
  const { lang } = useParams<{ lang: string }>();
  const wide = useIsWide();
  const [rawBounds, setRawBounds] = useState<Bounds | null>(null);
  const bounds = useDebouncedValue(rawBounds, VIEWPORT_DEBOUNCE_MS);
  const [active, setActive] = useState(DEFAULT_LAYERS);
  const query = useMemo(
    () => toMapViewportQuery(bounds, active),
    [bounds, active]
  );
  const { status, viewport } = useMapViewport(query);
  const anyLayer = Object.values(active).some(Boolean);
  const results = resultsStatus({ status, viewport, anyLayer });
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const pins = useMemo(
    () => sortPlaces(viewport.pins, userLocation, lang),
    [viewport.pins, userLocation, lang]
  );
  const [selectedPin, setSelectedPin] = useState<MapPin | null>(null);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [layersOpen, setLayersOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const mapHandle = useRef<ExploreMapHandle | null>(null);
  const userMovedRef = useRef(false);
  const selectedKey = selectedPin?.key ?? null;

  const handleViewportChange = useCallback((next: Bounds) => {
    if (isSpanValid(next)) setRawBounds(next);
  }, []);
  const handleReady = useCallback((handle: ExploreMapHandle) => {
    mapHandle.current = handle;
  }, []);
  const handleMapError = useCallback(() => setMapFailed(true), []);
  const handleUserMove = useCallback(() => {
    userMovedRef.current = true;
  }, []);
  const handleLoaded = useCallback(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = toLatLng(position);
        setUserLocation(location);
        const center = autoLocateCenter(location, userMovedRef.current);
        if (center) mapHandle.current?.jumpTo(center);
      },
      () => undefined,
      GEOLOCATION_OPTIONS
    );
  }, []);
  const pinLabel = useCallback(
    (pin: MapPin) => {
      const name = pin.name || copy[LAYER_LABEL_KEYS[pin.layer]];
      return pin.headquarterName ? `${name}, ${pin.headquarterName}` : name;
    },
    [copy]
  );
  const clusterLabel = useCallback(
    (count: number) =>
      copy["Explore.Cluster.Places"].replace("{0}", String(count)),
    [copy]
  );

  function selectPin(pin: MapPin, fly: boolean) {
    setSelectedPin(pin);
    if (wide) setPanelOpen(true);
    else setPlaceOpen(true);
    if (fly) {
      userMovedRef.current = true;
      mapHandle.current?.flyTo([pin.longitude, pin.latitude]);
    }
  }

  function clearSelection() {
    setSelectedPin(null);
    setPlaceOpen(false);
  }

  function handlePlaceOpenChange(open: boolean) {
    if (open) setPlaceOpen(true);
    else clearSelection();
  }

  function handleListSelect(pin: MapPin) {
    setListOpen(false);
    selectPin(pin, true);
  }

  function handleSearchPlace(center: [number, number]) {
    userMovedRef.current = true;
    mapHandle.current?.flyTo(center);
  }

  function handleToggleLayer(layer: MapLayerKey) {
    setActive(toggleLayer(active, layer));
  }

  function handleOpenList() {
    if (wide) setPanelOpen((open) => !open);
    else setListOpen(true);
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
        const location = toLatLng(position);
        setUserLocation(location);
        userMovedRef.current = true;
        mapHandle.current?.flyTo([location.longitude, location.latitude]);
      },
      (error) => {
        setLocating(false);
        toast.error(copy[LOCATION_KEYS[locationFailure(error.code)]]);
      },
      GEOLOCATION_OPTIONS
    );
  }

  const banner = mapFailed
    ? copy["Explore.MapError"]
    : status === "unserved"
      ? copy["Explore.Unserved"]
      : status === "error"
        ? copy["Explore.Error"]
        : null;

  return (
    <div className="flex h-svh w-full overflow-hidden" data-testid="explore-page">
      {wide && panelOpen ? (
        <ResultsPanel
          onBack={clearSelection}
          onSelect={(pin) => selectPin(pin, true)}
          origin={userLocation}
          pins={pins}
          selectedPin={selectedPin}
          status={results}
        />
      ) : null}
      <div className="relative isolate h-full min-w-0 flex-1">
        {banner ? (
          <div
            className="pointer-events-none absolute inset-x-0 top-20 z-10 mx-auto w-full max-w-3xl px-4"
            data-testid="explore-error"
          >
            <p className="rounded-md border border-warning/40 bg-warning-surface px-4 py-3 text-sm text-warning">
              {banner}
            </p>
          </div>
        ) : null}
        <PlaceSearch
          onSelectPlace={handleSearchPlace}
          onSelectStore={(pin) => selectPin(pin, true)}
          pins={viewport.pins}
        />
        <MapControls
          listActive={wide && panelOpen}
          locating={locating}
          onLocate={handleLocate}
          onOpenLayers={() => setLayersOpen(true)}
          onOpenList={handleOpenList}
          onZoomIn={() => mapHandle.current?.zoomIn()}
          onZoomOut={() => mapHandle.current?.zoomOut()}
        />
        <LayersSheet
          active={active}
          onOpenChange={setLayersOpen}
          onToggle={handleToggleLayer}
          open={layersOpen}
        />
        {!wide ? (
          <>
            <ListSheet
              onOpenChange={setListOpen}
              onSelect={handleListSelect}
              open={listOpen}
              origin={userLocation}
              pins={pins}
              selectedKey={selectedKey}
              status={results}
            />
            <PlaceSheet
              onOpenChange={handlePlaceOpenChange}
              open={placeOpen}
              origin={userLocation}
              pin={selectedPin}
            />
          </>
        ) : null}
        <ExploreMap
          clusterLabel={clusterLabel}
          clusters={viewport.clusters}
          onLoaded={handleLoaded}
          onMapError={handleMapError}
          onReady={handleReady}
          onSelectPin={(pin) => selectPin(pin, false)}
          onUserMove={handleUserMove}
          onViewportChange={handleViewportChange}
          pinLabel={pinLabel}
          pins={viewport.pins}
          selectedKey={selectedKey}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run the gates.**

- [ ] **Step 7: Commit.**

```bash
git add "apps/ssr/src/app/[lang]/(public)/explore/_components/use-merchant-detail.ts" "apps/ssr/src/app/[lang]/(public)/explore/_components/place-detail.tsx" "apps/ssr/src/app/[lang]/(public)/explore/_components/place-sheet.tsx" "apps/ssr/src/app/[lang]/(public)/explore/_components/results-panel.tsx" "apps/ssr/src/app/[lang]/(public)/explore/_components/place-search.tsx" "apps/ssr/src/app/[lang]/(public)/explore/page.tsx"
git commit -F - <<'EOF'
feat(ssr): select places from the list, map and search, load merchant details, and start from the traveller's location

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 6 (controller): gates, build, manual pass, PRs

- [ ] **Run the four gates.** Run `pnpm --filter ssr build` only when no dev server is running on `C:\unirefund\web-app`; otherwise ask the user to stop theirs first, or record that the build was not run.

- [ ] **Do the manual pass at 375 px and 1280 px,** over Istanbul on dev. Use the user's dev server if it is up; otherwise use one started detached on 3005.
  - **List and selection:**
    - the list matches the pins;
    - a row flies the map to the pin, highlights it and opens the detail;
    - a pin tap selects the place (on wide screens, the panel switches to its detail);
    - back returns to the list;
    - at 1024 px, the last row and Get directions clear the control chain and the island.
  - **Merchant detail:** headquarter, sectors, address, phone and e-mail, and Get directions opens Google Maps.
  - **Search:** a store suggestion selects the store, and a place suggestion flies the map.
  - **Locate on open** (mock the Chromium geolocation):
    - with permission granted, the map starts at the mocked position;
    - with it denied, the map starts over Istanbul with no toast;
    - panning before the position arrives keeps the map where it was panned.
  - **Locate button:** it sorts the list nearest-first, with distances.
  - **Layers:** with every layer off, no request is sent.
  - **Unserved:** the open sea shows the "not served" banner and status line.
  - **Clusters:** record whether a zoomed-out window shows clusters on dev.

- [ ] **Open the PRs.**
  1. Push `packages/utils` branch `feat/structured-error-code` and open its PR in `ayasofyazilim-clomerce/web-utils`.
  2. Push `feat/map-improvement` and open the web-app PR into `main`. Its body covers:
     - the merge order (web-utils first);
     - the three backend asks;
     - the keys left unused (`Explore.Layer.Customs`, `Explore.Cluster.Merchants`, `Explore.Cluster.Customs`, `Explore.Cluster.RefundPoints`, `Explore.Sector*` and the older orphans);
     - what was not verified.

# super-app Explore on MapLibre — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace super-app's mock-driven Explore screen with the live CRM viewport endpoints on a MapLibre map, matching the `apps/ssr` explore page: three place layers, a sector filter, and per-place directions.

**Architecture:** MapLibre's `onRegionDidChange` reports `bounds` as `[west, south, east, north]` — exactly the four query parameters the viewport endpoints take — so the web page's "fetch what is in the window" model ports directly once the map library can report a window at all. Each layer owns its own debounced fetch with a race guard and an `enabled` gate; the three responses normalise to one place shape. Pure logic (bounds mapping, response normalising, sector derivation, deep links) lives in plain modules with direct unit tests; the map itself is verified on device.

**Tech Stack:** Expo SDK 54, React Native 0.81.5, New Architecture enabled, `@maplibre/maplibre-react-native@11.4.0`, TypeScript, Jest.

**Spec:** `docs/superpowers/specs/2026-09-21-superapp-explore-maplibre-viewport-design.md`

## Global Constraints

- Pin `@maplibre/maplibre-react-native@11.4.0` exactly. Verified peers: `expo >=54.0.0`, `react-native >=0.80.0`, `react >=19.1.0`; ships `codegenConfig` (New Architecture) and `app.plugin.js` (Expo config plugin).
- **Never call generated SDK clients from screens/components/hooks** (`.claude/rules/api-actions.md`). Wrappers live in `src/actions/**`.
- **Avoid `useEffect`** (`.claude/rules/avoid-use-effect.md`). Derived state uses `useMemo`; updates are event-driven. Subscribing to an external source is the one permitted use — that is what the map region subscription is.
- **i18n** (`.claude/rules/i18n.md`): author keys in `src/localization/resources/{en-US,tr-TR}.json`, then run `npm run init`. Call them as `t("MobileApp.<Key.Path>")`. `TranslationKey` derives from the generated bundle, so a missed regeneration surfaces as TS2345 at the `t("…")` call site.
- **UI** (`.claude/rules/ui-components.md`): use `src/components/ui` (`Text`, `Button`, `Badge`, `Card`, `Input`, `Label`, `SelectField`) before writing styling.
- Tests live at `src/<area>/__tests__/<name>.test.ts`. Render tests must be named `*.router.test.*`.
- The country tenant is `df64152b-9f76-e06b-d43f-3a1bd9644ea9` (same placeholder `apps/ssr` uses). UNI-1659's centroid fallback is documented but not reachable on any deployed build.
- Verification gates: `npm run typecheck`, `npm test`, `npm run lint`. Both test and typecheck run `check:language-data` first.

## File Structure

| File | Responsibility |
|---|---|
| `src/actions/lib.ts` | *(modify)* add `getPublicCRMServiceClient` — a token-less client |
| `src/actions/CRMService/actions.ts` | *(modify)* three viewport wrappers |
| `src/actions/CRMService/__tests__/viewport.test.ts` | *(create)* action tests |
| `src/screens/shared/Explore/_lib/viewportRequest.ts` | *(create)* MapLibre bounds → request params |
| `src/screens/shared/Explore/_lib/normalizeViewport.ts` | *(create)* three envelopes → one place shape |
| `src/screens/shared/Explore/_lib/sectors.ts` | *(create)* sector derivation + retention |
| `src/screens/shared/Explore/_lib/directions.ts` | *(create)* Google/Apple deep links |
| `src/screens/shared/Explore/_lib/__tests__/*.test.ts` | *(create)* unit tests for the four pure modules |
| `src/screens/shared/Explore/_components/useViewportLayer.ts` | *(create)* one layer's fetch, debounce, race guard, gate |
| `src/screens/shared/Explore/_components/ExploreMap.tsx` | *(create)* MapLibre map + pins |
| `src/screens/shared/Explore/_components/LayerToggles.tsx` | *(create)* three layer switches |
| `src/screens/shared/Explore/_components/SectorControl.tsx` | *(create)* sector filter |
| `src/screens/shared/Explore/_components/PlaceDetailSheet.tsx` | *(create)* name, address, sector badges, directions |
| `src/screens/shared/Explore/ExploreScreen.tsx` | *(rewrite)* composition |
| `src/screens/shared/Explore/_components/{MapView,FilterSheet,ListView,LocationDetailSheet}.tsx`, `mock-data.ts` | *(delete)* |
| `src/localization/resources/{en-US,tr-TR}.json` | *(modify)* Explore keys |

---

### Task 1: Swap the map library

**Files:**
- Modify: `package.json`
- Modify: `app.config.js`
- Delete: nothing yet (the old screen still imports `react-native-leaflet-map` until Task 9; leave it installed until then)

**Interfaces:**
- Consumes: nothing
- Produces: `@maplibre/maplibre-react-native@11.4.0` installed and buildable; `Map`, `Camera`, `ViewAnnotation`, `ViewState`, `ViewStateChangeEvent`, `LngLatBounds` importable from it.

- [ ] **Step 1: Install the library, pinned**

```bash
cd /c/unirefund/super-app
npm install --save-exact @maplibre/maplibre-react-native@11.4.0
```

- [ ] **Step 2: Add the config plugin**

In `app.config.js`, add `"@maplibre/maplibre-react-native"` to the `plugins` array. **Append it to the end of the array.** Plugin mods in this repo run last-to-first, and the existing entries deliberately reorder Android permissions; putting MapLibre last means it runs first and cannot undo them.

- [ ] **Step 3: Check what permissions the library declares**

```bash
cd /c/unirefund/super-app
npx expo prebuild --platform android --no-install --clean
grep -n "uses-permission" android/app/src/main/AndroidManifest.xml
```

Expected: the merged manifest lists the app's existing permissions. If MapLibre has added any permission not backed by a shipped feature, add it to the `blockedPermissions` array in `app.config.js` with a one-line comment saying why, matching the style of the existing entries.

- [ ] **Step 4: Build a dev client and confirm the app still starts**

```bash
cd /c/unirefund/super-app
npx expo run:android
```

Expected: app builds and launches. A native dependency was added, so a Metro reload is not sufficient.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json app.config.js
git commit -m "build(explore): add maplibre-react-native for the viewport map"
```

---

### Task 2: Bounds → request parameters

**Files:**
- Create: `src/screens/shared/Explore/_lib/viewportRequest.ts`
- Test: `src/screens/shared/Explore/_lib/__tests__/viewportRequest.test.ts`

**Interfaces:**
- Consumes: `LngLatBounds` from `@maplibre/maplibre-react-native` (`[west, south, east, north]`)
- Produces: `type ViewportRequest = { south: number; north: number; west: number; east: number }` and `toViewportRequest(bounds: LngLatBounds): ViewportRequest`

- [ ] **Step 1: Write the failing test**

```ts
// src/screens/shared/Explore/_lib/__tests__/viewportRequest.test.ts
import { toViewportRequest } from "../viewportRequest";

it("maps MapLibre's [west, south, east, north] onto the endpoint's parameters", () => {
  expect(toViewportRequest([28.7, 40.8, 29.3, 41.2])).toEqual({
    west: 28.7,
    south: 40.8,
    east: 29.3,
    north: 41.2,
  });
});

it("does not reorder a southern-hemisphere window", () => {
  expect(toViewportRequest([-70.7, -33.5, -70.5, -33.3])).toEqual({
    west: -70.7,
    south: -33.5,
    east: -70.5,
    north: -33.3,
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/screens/shared/Explore/_lib/__tests__/viewportRequest.test.ts`
Expected: FAIL — cannot find module `../viewportRequest`.

- [ ] **Step 3: Implement**

```ts
// src/screens/shared/Explore/_lib/viewportRequest.ts
import type { LngLatBounds } from "@maplibre/maplibre-react-native";

export type ViewportRequest = {
  south: number;
  north: number;
  west: number;
  east: number;
};

/**
 * MapLibre reports bounds flat and GeoJSON-ordered — [west, south, east,
 * north] — and the viewport endpoints take the same four edges by name.
 */
export function toViewportRequest(bounds: LngLatBounds): ViewportRequest {
  const [west, south, east, north] = bounds;
  return { south, north, west, east };
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx jest src/screens/shared/Explore/_lib/__tests__/viewportRequest.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/screens/shared/Explore/_lib/viewportRequest.ts src/screens/shared/Explore/_lib/__tests__/viewportRequest.test.ts
git commit -m "feat(explore): map maplibre bounds onto viewport request params"
```

---

### Task 3: Token-less client and the three viewport actions

**Files:**
- Modify: `src/actions/lib.ts`
- Modify: `src/actions/CRMService/actions.ts`
- Test: `src/actions/CRMService/__tests__/viewport.test.ts`

**Interfaces:**
- Consumes: `ViewportRequest` from Task 2
- Produces: `getPublicMerchantsViewportApi(data)`, `getPublicCustomsViewportApi(data)`, `getPublicRefundPointsViewportApi(data)`, each returning the raw DTO. Merchants additionally accepts `sector?: string`.

**Why this deviates from `.claude/rules/api-actions.md`:** that rule says wrap calls in `fetchRequest`. `fetchRequest` always injects `Authorization: Bearer <token>` and exists to retry on 401. These are anonymous `/public/` routes, and a user claim outranks the `__tenant` header in ABP's tenant resolution — so sending the traveller's token risks resolving to their tenant instead of the country being browsed. These three calls therefore use a token-less client and no `fetchRequest`. Record that reason in a comment at the call site.

- [ ] **Step 1: Write the failing test**

```ts
// src/actions/CRMService/__tests__/viewport.test.ts
import {
  getPublicCustomsViewportApi,
  getPublicMerchantsViewportApi,
  getPublicRefundPointsViewportApi,
} from "../actions";

const merchants = jest.fn();
const customs = jest.fn();
const refundPoints = jest.fn();

jest.mock("@/actions/lib", () => ({
  getPublicCRMServiceClient: jest.fn(),
}));

const { getPublicCRMServiceClient } = jest.requireMock("@/actions/lib");

beforeEach(() => {
  jest.clearAllMocks();
  (getPublicCRMServiceClient as jest.Mock).mockResolvedValue({
    merchantPublic: { getApiCrmServicePublicMerchantsViewport: merchants },
    customPublic: { getApiCrmServicePublicCustomsViewport: customs },
    refundPointPublic: {
      getApiCrmServicePublicRefundPointsViewport: refundPoints,
    },
  });
});

const window = { south: 40.8, north: 41.2, west: 28.7, east: 29.3 };

it("passes the window straight through to the merchants endpoint", async () => {
  merchants.mockResolvedValue({ clustered: false, merchants: [], totalCount: 0 });

  await expect(getPublicMerchantsViewportApi(window)).resolves.toEqual({
    clustered: false,
    merchants: [],
    totalCount: 0,
  });
  expect(merchants).toHaveBeenCalledWith(window);
});

it("forwards a sector filter on merchants only", async () => {
  merchants.mockResolvedValue({ clustered: false, merchants: [], totalCount: 0 });

  await getPublicMerchantsViewportApi({ ...window, sector: "121" });

  expect(merchants).toHaveBeenCalledWith({ ...window, sector: "121" });
});

it("builds the client without a token, carrying only the country tenant", async () => {
  merchants.mockResolvedValue({ clustered: false, merchants: [], totalCount: 0 });

  await getPublicMerchantsViewportApi(window);

  expect(getPublicCRMServiceClient).toHaveBeenCalledWith({
    __tenant: "df64152b-9f76-e06b-d43f-3a1bd9644ea9",
  });
});

it("reads customs out of its own envelope key", async () => {
  customs.mockResolvedValue({ clustered: false, customs: [{ id: "c1" }], totalCount: 1 });

  await expect(getPublicCustomsViewportApi(window)).resolves.toEqual({
    clustered: false,
    customs: [{ id: "c1" }],
    totalCount: 1,
  });
});

it("reads refund points out of its own envelope key", async () => {
  refundPoints.mockResolvedValue({
    clustered: false,
    refundPoints: [{ id: "r1" }],
    totalCount: 1,
  });

  await expect(getPublicRefundPointsViewportApi(window)).resolves.toEqual({
    clustered: false,
    refundPoints: [{ id: "r1" }],
    totalCount: 1,
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/actions/CRMService/__tests__/viewport.test.ts`
Expected: FAIL — `getPublicMerchantsViewportApi` is not exported.

- [ ] **Step 3: Add the token-less client to `src/actions/lib.ts`**

Add below `createServiceClient`:

```ts
/**
 * A client with no bearer token, for the anonymous `/public/` routes.
 *
 * These endpoints are tenant-scoped and a user claim outranks the `__tenant`
 * header in ABP's tenant resolution, so sending the traveller's token would
 * resolve the call to their tenant rather than the country being browsed.
 * `CREDENTIALS: "omit"` matters here for the same reason it does above: the
 * tenant must come from the header we set and from nowhere else.
 */
async function createPublicServiceClient<T>(
  Client: ServiceClientConstructor<T>,
  customHeaders?: Record<string, string>,
): Promise<T> {
  const BASE = await getApiUrl();

  return new Client({
    BASE,
    HEADERS: { ...HEADERS, ...customHeaders },
    WITH_CREDENTIALS: true,
    CREDENTIALS: "omit",
  });
}

export const getPublicCRMServiceClient = (
  customHeaders?: Record<string, string>,
) => createPublicServiceClient(CRMServiceClient, customHeaders);
```

- [ ] **Step 4: Add the three actions to `src/actions/CRMService/actions.ts`**

Add the import at the top of the file, alongside the existing `GetApiCrmServiceMerchantsData` import:

```ts
import {
  GetApiCrmServiceMerchantsData,
  GetApiCrmServicePublicCustomsViewportData,
  GetApiCrmServicePublicMerchantsViewportData,
  GetApiCrmServicePublicRefundPointsViewportData,
} from "@/saas/CRMService";
import { getCRMServiceClient, getPublicCRMServiceClient } from "../lib";
```

Then append:

```ts
/**
 * The public viewport endpoints refuse any call without a country tenant
 * (UniRefund.CRMService:029001). UNI-1659 documents a centroid-derived
 * fallback, but it is not reachable on any deployed build — dev and uat both
 * still answer 029001 with no header — so the tenant stays explicit.
 */
const EXPLORE_COUNTRY_TENANT = "df64152b-9f76-e06b-d43f-3a1bd9644ea9";

/**
 * Deliberately not wrapped in `fetchRequest`: it always attaches
 * `Authorization`, and these are anonymous routes where a user claim would
 * outrank the `__tenant` header.
 */
const viewportClient = () =>
  getPublicCRMServiceClient({ __tenant: EXPLORE_COUNTRY_TENANT });

export async function getPublicMerchantsViewportApi(
  data: GetApiCrmServicePublicMerchantsViewportData,
) {
  const client = await viewportClient();
  return await client.merchantPublic.getApiCrmServicePublicMerchantsViewport(
    data,
  );
}

export async function getPublicCustomsViewportApi(
  data: GetApiCrmServicePublicCustomsViewportData,
) {
  const client = await viewportClient();
  return await client.customPublic.getApiCrmServicePublicCustomsViewport(data);
}

export async function getPublicRefundPointsViewportApi(
  data: GetApiCrmServicePublicRefundPointsViewportData,
) {
  const client = await viewportClient();
  return await client.refundPointPublic.getApiCrmServicePublicRefundPointsViewport(
    data,
  );
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx jest src/actions/CRMService/__tests__/viewport.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src/actions/lib.ts src/actions/CRMService/actions.ts src/actions/CRMService/__tests__/viewport.test.ts
git commit -m "feat(explore): add token-less viewport actions for the three public layers"
```

---

### Task 4: Normalise the three envelopes

**Files:**
- Create: `src/screens/shared/Explore/_lib/normalizeViewport.ts`
- Test: `src/screens/shared/Explore/_lib/__tests__/normalizeViewport.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type ViewportPlace = { id?: string; name?: string | null; addressLine?: string | null; latitude?: number; longitude?: number; sectors?: Array<{ articleCode?: string | null; name?: string | null }> | null }`
  - `type ViewportCluster = { count?: number; latitude?: number; longitude?: number }`
  - `type ViewportLayerState = { status: "loading" | "ready" | "error"; places: ViewportPlace[]; clusters: ViewportCluster[]; totalCount: number }`
  - `normalizeViewport(envelope, key): Omit<ViewportLayerState, "status">`

- [ ] **Step 1: Write the failing test**

```ts
// src/screens/shared/Explore/_lib/__tests__/normalizeViewport.test.ts
import { normalizeViewport } from "../normalizeViewport";

it("reads merchants out of the merchants key", () => {
  expect(
    normalizeViewport(
      { clustered: false, merchants: [{ id: "m1" }], clusters: [], totalCount: 1 },
      "merchants",
    ),
  ).toEqual({ places: [{ id: "m1" }], clusters: [], totalCount: 1 });
});

it("reads refund points out of their own key", () => {
  expect(
    normalizeViewport(
      { clustered: false, refundPoints: [{ id: "r1" }], totalCount: 1 },
      "refundPoints",
    ),
  ).toEqual({ places: [{ id: "r1" }], clusters: [], totalCount: 1 });
});

it("drops pins when the answer is clustered", () => {
  expect(
    normalizeViewport(
      {
        clustered: true,
        merchants: [{ id: "ignored" }],
        clusters: [{ count: 9, latitude: 41, longitude: 29 }],
        totalCount: 9,
      },
      "merchants",
    ),
  ).toEqual({
    places: [],
    clusters: [{ count: 9, latitude: 41, longitude: 29 }],
    totalCount: 9,
  });
});

it("drops clusters when the answer is pins", () => {
  expect(
    normalizeViewport(
      { clustered: false, customs: [{ id: "c1" }], clusters: [{ count: 4 }], totalCount: 1 },
      "customs",
    ),
  ).toEqual({ places: [{ id: "c1" }], clusters: [], totalCount: 1 });
});

it("treats every absent field as empty", () => {
  expect(normalizeViewport({}, "merchants")).toEqual({
    places: [],
    clusters: [],
    totalCount: 0,
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/screens/shared/Explore/_lib/__tests__/normalizeViewport.test.ts`
Expected: FAIL — cannot find module `../normalizeViewport`.

- [ ] **Step 3: Implement**

```ts
// src/screens/shared/Explore/_lib/normalizeViewport.ts

/** One retail sector of a merchant pin. Only merchants carry these. */
export type ViewportSector = {
  articleCode?: string | null;
  name?: string | null;
};

/**
 * One pin. The three endpoints return structurally identical rows under three
 * different keys, and every field on every viewport DTO is optional, so one
 * shape covers all of them.
 */
export type ViewportPlace = {
  id?: string;
  name?: string | null;
  addressLine?: string | null;
  latitude?: number;
  longitude?: number;
  sectors?: ViewportSector[] | null;
};

export type ViewportCluster = {
  count?: number;
  latitude?: number;
  longitude?: number;
};

export type ViewportLayerState = {
  status: "loading" | "ready" | "error";
  places: ViewportPlace[];
  clusters: ViewportCluster[];
  totalCount: number;
};

export type ViewportEnvelopeKey = "merchants" | "customs" | "refundPoints";

type ViewportEnvelope = {
  clustered?: boolean;
  clusters?: ViewportCluster[] | null;
  totalCount?: number;
} & Partial<Record<ViewportEnvelopeKey, ViewportPlace[] | null>>;

/**
 * `clustered` says which shape came back: individual places up to the pin
 * threshold, counts per grid cell past it. Keeping both arrays would let a
 * stale one draw over the other.
 */
export function normalizeViewport(
  envelope: ViewportEnvelope,
  key: ViewportEnvelopeKey,
): Omit<ViewportLayerState, "status"> {
  return {
    places: envelope.clustered ? [] : (envelope[key] ?? []),
    clusters: envelope.clustered ? (envelope.clusters ?? []) : [],
    totalCount: envelope.totalCount ?? 0,
  };
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx jest src/screens/shared/Explore/_lib/__tests__/normalizeViewport.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/screens/shared/Explore/_lib/normalizeViewport.ts src/screens/shared/Explore/_lib/__tests__/normalizeViewport.test.ts
git commit -m "feat(explore): normalise the three viewport envelopes onto one shape"
```

---

### Task 5: Sector derivation and retention

**Files:**
- Create: `src/screens/shared/Explore/_lib/sectors.ts`
- Test: `src/screens/shared/Explore/_lib/__tests__/sectors.test.ts`

**Interfaces:**
- Consumes: `ViewportPlace` from Task 4
- Produces: `type SectorOption = { articleCode: string; name: string }`, `deriveSectorOptions(places: ViewportPlace[]): SectorOption[]`, `mergeSelectedSector(options: SectorOption[], selected: SectorOption | undefined): SectorOption[]`

- [ ] **Step 1: Write the failing test**

```ts
// src/screens/shared/Explore/_lib/__tests__/sectors.test.ts
import { deriveSectorOptions, mergeSelectedSector } from "../sectors";

it("collects each distinct sector from the pins in view, by name", () => {
  expect(
    deriveSectorOptions([
      { sectors: [{ articleCode: "121", name: "Electronics" }] },
      { sectors: [{ articleCode: "004", name: "Clothes" }] },
      { sectors: [{ articleCode: "121", name: "Electronics" }] },
    ]),
  ).toEqual([
    { articleCode: "004", name: "Clothes" },
    { articleCode: "121", name: "Electronics" },
  ]);
});

it("ignores pins with no sectors and sectors missing a code or a name", () => {
  expect(
    deriveSectorOptions([
      {},
      { sectors: null },
      { sectors: [{ articleCode: "121", name: null }] },
      { sectors: [{ articleCode: null, name: "Nameless" }] },
    ]),
  ).toEqual([]);
});

it("keeps a selected sector that is no longer in view, at the front", () => {
  const selected = { articleCode: "121", name: "Electronics" };

  expect(mergeSelectedSector([{ articleCode: "004", name: "Clothes" }], selected)).toEqual([
    { articleCode: "121", name: "Electronics" },
    { articleCode: "004", name: "Clothes" },
  ]);
});

it("does not duplicate a selected sector that is still in view", () => {
  const selected = { articleCode: "121", name: "Electronics" };

  expect(mergeSelectedSector([selected], selected)).toEqual([selected]);
});

it("returns the options untouched when nothing is selected", () => {
  const options = [{ articleCode: "004", name: "Clothes" }];

  expect(mergeSelectedSector(options, undefined)).toEqual(options);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/screens/shared/Explore/_lib/__tests__/sectors.test.ts`
Expected: FAIL — cannot find module `../sectors`.

- [ ] **Step 3: Implement**

```ts
// src/screens/shared/Explore/_lib/sectors.ts
import type { ViewportPlace } from "./normalizeViewport";

export type SectorOption = { articleCode: string; name: string };

/**
 * There is no anonymous source for a sector list — the product-group endpoint
 * is 401 and CRM publishes only the viewport routes — so the options are read
 * off the pins already in view, where the backend has resolved and localized
 * them.
 */
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

/**
 * The options are only ever the sectors in view, so a pan can drop the selected
 * one while the filter is still being applied. Keeping it in the list is what
 * stops the control from reading as "no filter" over a filtered map, and leaves
 * it clearable.
 */
export function mergeSelectedSector(
  options: SectorOption[],
  selected: SectorOption | undefined,
): SectorOption[] {
  if (!selected) return options;
  if (options.some((option) => option.articleCode === selected.articleCode)) {
    return options;
  }
  return [selected, ...options];
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx jest src/screens/shared/Explore/_lib/__tests__/sectors.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/screens/shared/Explore/_lib/sectors.ts src/screens/shared/Explore/_lib/__tests__/sectors.test.ts
git commit -m "feat(explore): derive sector options from the pins in view"
```

---

### Task 6: Directions deep links

**Files:**
- Create: `src/screens/shared/Explore/_lib/directions.ts`
- Test: `src/screens/shared/Explore/_lib/__tests__/directions.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `googleMapsUrl(latitude: number, longitude: number): string`, `appleMapsUrl(latitude: number, longitude: number): string`

- [ ] **Step 1: Write the failing test**

```ts
// src/screens/shared/Explore/_lib/__tests__/directions.test.ts
import { appleMapsUrl, googleMapsUrl } from "../directions";

it("builds a destination-only Google Maps link", () => {
  expect(googleMapsUrl(41.028404, 28.986236)).toBe(
    "https://www.google.com/maps/dir/?api=1&destination=41.028404,28.986236",
  );
});

it("builds a destination-only Apple Maps link", () => {
  expect(appleMapsUrl(41.028404, 28.986236)).toBe(
    "https://maps.apple.com/?daddr=41.028404,28.986236",
  );
});

it("keeps negative coordinates intact", () => {
  expect(googleMapsUrl(-33.45, -70.66)).toBe(
    "https://www.google.com/maps/dir/?api=1&destination=-33.45,-70.66",
  );
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/screens/shared/Explore/_lib/__tests__/directions.test.ts`
Expected: FAIL — cannot find module `../directions`.

- [ ] **Step 3: Implement**

```ts
// src/screens/shared/Explore/_lib/directions.ts

/**
 * Both links carry only a destination, so the maps app supplies "from here"
 * itself and this screen never has to ask for the location permission.
 */

/** Google's documented cross-platform URL; opens the native app when installed. */
export function googleMapsUrl(latitude: number, longitude: number) {
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
}

/** Opens Maps on Apple platforms; elsewhere it reaches Apple's web Maps. */
export function appleMapsUrl(latitude: number, longitude: number) {
  return `https://maps.apple.com/?daddr=${latitude},${longitude}`;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx jest src/screens/shared/Explore/_lib/__tests__/directions.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/screens/shared/Explore/_lib/directions.ts src/screens/shared/Explore/_lib/__tests__/directions.test.ts
git commit -m "feat(explore): build google and apple maps direction links"
```

---

### Task 7: The layer hook

**Files:**
- Create: `src/screens/shared/Explore/_components/useViewportLayer.ts`
- Test: `src/screens/shared/Explore/_components/__tests__/useViewportLayer.test.ts`

**Interfaces:**
- Consumes: `ViewportRequest` (Task 2), `ViewportLayerState` / `normalizeViewport` / `ViewportEnvelopeKey` (Task 4)
- Produces: `useViewportLayer({ request, enabled, envelopeKey, fetcher }): ViewportLayerState`

The debounce lives in the screen (one timer for all layers, since one gesture moves them all), so this hook reacts to a settled `request` object. It is the one place an effect is correct: it synchronises with an external source whose answers arrive out of order.

- [ ] **Step 1: Write the failing test**

```ts
// src/screens/shared/Explore/_components/__tests__/useViewportLayer.test.ts
import { renderHook, waitFor } from "@testing-library/react-native";
import { useViewportLayer } from "../useViewportLayer";

const window = { south: 40.8, north: 41.2, west: 28.7, east: 29.3 };

it("does not fetch while the layer is switched off", async () => {
  const fetcher = jest.fn();

  const { result } = renderHook(() =>
    useViewportLayer({
      request: window,
      enabled: false,
      envelopeKey: "merchants",
      fetcher,
    }),
  );

  expect(fetcher).not.toHaveBeenCalled();
  expect(result.current.places).toEqual([]);
});

it("reports the places once the fetch settles", async () => {
  const fetcher = jest.fn().mockResolvedValue({
    clustered: false,
    merchants: [{ id: "m1" }],
    totalCount: 1,
  });

  const { result } = renderHook(() =>
    useViewportLayer({
      request: window,
      enabled: true,
      envelopeKey: "merchants",
      fetcher,
    }),
  );

  await waitFor(() => {
    expect(result.current.status).toBe("ready");
  });
  expect(result.current.places).toEqual([{ id: "m1" }]);
  expect(fetcher).toHaveBeenCalledWith(window);
});

it("keeps what is drawn when a fetch fails", async () => {
  const fetcher = jest.fn().mockRejectedValue(new Error("boom"));

  const { result } = renderHook(() =>
    useViewportLayer({
      request: window,
      enabled: true,
      envelopeKey: "merchants",
      fetcher,
    }),
  );

  await waitFor(() => {
    expect(result.current.status).toBe("error");
  });
  expect(result.current.places).toEqual([]);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/screens/shared/Explore/_components/__tests__/useViewportLayer.test.ts`
Expected: FAIL — cannot find module `../useViewportLayer`.

- [ ] **Step 3: Implement**

```ts
// src/screens/shared/Explore/_components/useViewportLayer.ts
import { useEffect, useState } from "react";
import {
  normalizeViewport,
  type ViewportEnvelopeKey,
  type ViewportLayerState,
} from "../_lib/normalizeViewport";
import type { ViewportRequest } from "../_lib/viewportRequest";

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
  envelopeKey: ViewportEnvelopeKey;
  fetcher: (request: ViewportRequest) => Promise<unknown>;
}): ViewportLayerState {
  const [state, setState] = useState<ViewportLayerState>(INITIAL);

  // Synchronising with an external source whose answers can arrive out of
  // order, which is the case `avoid-use-effect` names as legitimate.
  useEffect(() => {
    if (!enabled || !request) return;

    let disposed = false;
    setState((previous) => ({ ...previous, status: "loading" }));

    fetcher(request)
      .then((envelope) => {
        if (disposed) return;
        setState({
          status: "ready",
          ...normalizeViewport(
            envelope as Parameters<typeof normalizeViewport>[0],
            envelopeKey,
          ),
        });
      })
      .catch(() => {
        if (disposed) return;
        // Keep what is already drawn: one failed pan should not blank the map.
        setState((previous) => ({ ...previous, status: "error" }));
      });

    return () => {
      disposed = true;
    };
  }, [request, enabled, envelopeKey, fetcher]);

  return state;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx jest src/screens/shared/Explore/_components/__tests__/useViewportLayer.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/screens/shared/Explore/_components/useViewportLayer.ts src/screens/shared/Explore/_components/__tests__/useViewportLayer.test.ts
git commit -m "feat(explore): fetch one layer per settled viewport, gated by its switch"
```

---

### Task 8: i18n keys

**Files:**
- Modify: `src/localization/resources/en-US.json`
- Modify: `src/localization/resources/tr-TR.json`

**Interfaces:**
- Consumes: nothing
- Produces: the `Explore` keys the remaining tasks call as `t("MobileApp.Explore.<Key>")`

- [ ] **Step 1: Add the keys**

In `src/localization/resources/en-US.json`, inside the existing top-level `"Explore"` object, add:

```json
"Layers": "Layers",
"Layer": { "Merchants": "Merchants", "Customs": "Customs", "RefundPoints": "Refund points" },
"Sector": "Sector",
"SectorAll": "All sectors",
"Directions": "Directions",
"NoAddress": "Address not available",
"Loading": "Loading places…",
"Empty": "No places in this area.",
"Error": "Places could not be loaded for this area.",
"ZoomIn": "Zoom in to see them individually"
```

In `src/localization/resources/tr-TR.json`, inside its `"Explore"` object, add the same keys with:

```json
"Layers": "Katmanlar",
"Layer": { "Merchants": "Mağazalar", "Customs": "Gümrükler", "RefundPoints": "İade noktaları" },
"Sector": "Sektör",
"SectorAll": "Tüm sektörler",
"Directions": "Yol tarifi",
"NoAddress": "Adres mevcut değil",
"Loading": "Yerler yükleniyor…",
"Empty": "Bu alanda yer yok.",
"Error": "Bu alan için yerler yüklenemedi.",
"ZoomIn": "Tek tek görmek için yakınlaştırın"
```

- [ ] **Step 2: Regenerate the bundle**

```bash
cd /c/unirefund/super-app
npm run init
```

This is not optional. `TranslationKey` derives from the generated bundle, so skipping it makes every new `t("…")` call fail typecheck as though the key were never added.

- [ ] **Step 3: Confirm the bundle and the resources agree**

Run: `npm run check:language-data`
Expected: passes with no stale-bundle message.

- [ ] **Step 4: Commit**

```bash
git add src/localization/resources/en-US.json src/localization/resources/tr-TR.json
git commit -m "i18n(explore): add layer, sector and directions strings"
```

---

### Task 9: The map, the controls, and the screen

**Files:**
- Create: `src/screens/shared/Explore/_components/ExploreMap.tsx`
- Create: `src/screens/shared/Explore/_components/LayerToggles.tsx`
- Create: `src/screens/shared/Explore/_components/SectorControl.tsx`
- Create: `src/screens/shared/Explore/_components/PlaceDetailSheet.tsx`
- Rewrite: `src/screens/shared/Explore/ExploreScreen.tsx`
- Delete: `src/screens/shared/Explore/_components/MapView.tsx`, `FilterSheet.tsx`, `ListView.tsx`, `LocationDetailSheet.tsx`, `mock-data.ts`
- Test: `src/screens/shared/Explore/__tests__/explore.router.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 2–8.
- Produces: the finished screen.

This is one task because the pieces are not independently shippable — deleting the mock data breaks the screen until the new composition replaces it, so a reviewer cannot accept one half.

- [ ] **Step 1: Write the failing render test**

```tsx
// src/screens/shared/Explore/__tests__/explore.router.test.tsx
import { render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import ExploreScreen from "../ExploreScreen";

jest.mock("@maplibre/maplibre-react-native", () => {
  const { View } = require("react-native");
  return {
    Map: ({ children }: { children?: React.ReactNode }) => <View>{children}</View>,
    Camera: () => null,
    ViewAnnotation: ({ children }: { children?: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock("@/actions/CRMService/actions", () => ({
  getPublicMerchantsViewportApi: jest.fn().mockResolvedValue({
    clustered: false,
    merchants: [
      {
        id: "m1",
        name: " GalataPort",
        addressLine: "Meclisi Mebusan Cad. 12F",
        latitude: 41.028404,
        longitude: 28.986236,
        sectors: [{ articleCode: "121", name: "Electronics" }],
      },
    ],
    totalCount: 1,
  }),
  getPublicCustomsViewportApi: jest.fn().mockResolvedValue({}),
  getPublicRefundPointsViewportApi: jest.fn().mockResolvedValue({}),
}));

it("renders the three layer switches", async () => {
  render(<ExploreScreen />);

  await waitFor(() => {
    expect(screen.getByText("Merchants")).toBeTruthy();
  });
  expect(screen.getByText("Customs")).toBeTruthy();
  expect(screen.getByText("Refund points")).toBeTruthy();
});

it("offers the sectors of the pins that came back", async () => {
  render(<ExploreScreen />);

  await waitFor(() => {
    expect(screen.getByText("Electronics")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/screens/shared/Explore/__tests__/explore.router.test.tsx`
Expected: FAIL — the screen still renders the mock-driven UI and none of these strings appear.

- [ ] **Step 3: Write `ExploreMap.tsx`**

```tsx
// src/screens/shared/Explore/_components/ExploreMap.tsx
import { Text } from "@/components/ui";
import {
  Camera,
  Map,
  ViewAnnotation,
  type ViewStateChangeEvent,
} from "@maplibre/maplibre-react-native";
import React from "react";
import { Pressable, View } from "react-native";
import type { ViewportCluster, ViewportPlace } from "../_lib/normalizeViewport";

/**
 * A raster style built from OpenStreetMap's own tiles. MapLibre needs a style
 * and this keeps the app's existing no-API-key posture; ODbL requires the
 * attribution to be rendered rather than suppressed.
 */
const OSM_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster" as const, source: "osm" }],
};

const INITIAL_CENTER: [number, number] = [28.9966448299549, 41.011903723721645];
const INITIAL_ZOOM = 9;

export function ExploreMap({
  places,
  clusters,
  onRegionDidChange,
  onSelectPlace,
  onSelectCluster,
}: {
  places: ViewportPlace[];
  clusters: ViewportCluster[];
  onRegionDidChange: (event: { nativeEvent: ViewStateChangeEvent }) => void;
  onSelectPlace: (place: ViewportPlace) => void;
  onSelectCluster: (longitude: number, latitude: number) => void;
}) {
  return (
    <Map
      mapStyle={OSM_STYLE}
      onRegionDidChange={onRegionDidChange}
      style={{ flex: 1 }}
    >
      <Camera
        defaultSettings={{ centerCoordinate: INITIAL_CENTER, zoomLevel: INITIAL_ZOOM }}
      />

      {places.map((place) =>
        place.latitude === undefined || place.longitude === undefined ? null : (
          <ViewAnnotation
            coordinate={[place.longitude, place.latitude]}
            key={place.id ?? `${place.latitude}-${place.longitude}`}
          >
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onSelectPlace(place);
              }}
            >
              <View className="size-8 items-center justify-center rounded-full bg-primary shadow-lg" />
            </Pressable>
          </ViewAnnotation>
        ),
      )}

      {clusters.map((cluster) =>
        cluster.latitude === undefined || cluster.longitude === undefined ? null : (
          <ViewAnnotation
            coordinate={[cluster.longitude, cluster.latitude]}
            key={`${cluster.latitude}-${cluster.longitude}`}
          >
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onSelectCluster(cluster.longitude!, cluster.latitude!);
              }}
            >
              <View className="size-12 items-center justify-center rounded-full border-2 border-white bg-primary shadow-lg">
                <Text tone="onPrimary" variant="labelStrong">
                  {String(cluster.count ?? 0)}
                </Text>
              </View>
            </Pressable>
          </ViewAnnotation>
        ),
      )}
    </Map>
  );
}
```

- [ ] **Step 4: Write `LayerToggles.tsx`**

```tsx
// src/screens/shared/Explore/_components/LayerToggles.tsx
import { Button } from "@/components/ui";
import React from "react";
import { View } from "react-native";

export type LayerKey = "merchants" | "customs" | "refundPoints";

export function LayerToggles({
  labels,
  active,
  onToggle,
}: {
  labels: Record<LayerKey, string>;
  active: Record<LayerKey, boolean>;
  onToggle: (layer: LayerKey) => void;
}) {
  const layers: LayerKey[] = ["merchants", "customs", "refundPoints"];

  return (
    <View className="absolute left-4 right-4 top-4 flex-row gap-2">
      {layers.map((layer) => (
        <Button
          action={{
            label: labels[layer],
            onPress: () => {
              onToggle(layer);
            },
          }}
          key={layer}
          size="sm"
          variant={active[layer] ? "default" : "outline"}
        />
      ))}
    </View>
  );
}
```

- [ ] **Step 5: Write `SectorControl.tsx`**

```tsx
// src/screens/shared/Explore/_components/SectorControl.tsx
import { Button } from "@/components/ui";
import React from "react";
import { ScrollView } from "react-native";
import { mergeSelectedSector, type SectorOption } from "../_lib/sectors";

export function SectorControl({
  options,
  selected,
  allLabel,
  onSelect,
}: {
  options: SectorOption[];
  selected: SectorOption | undefined;
  allLabel: string;
  onSelect: (sector: SectorOption | undefined) => void;
}) {
  const choices = mergeSelectedSector(options, selected);
  if (choices.length === 0) return null;

  return (
    <ScrollView
      className="absolute left-0 right-0 top-16 max-h-12"
      contentContainerClassName="gap-2 px-4"
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      <Button
        action={{
          label: allLabel,
          onPress: () => {
            onSelect(undefined);
          },
        }}
        size="sm"
        variant={selected ? "outline" : "default"}
      />
      {choices.map((option) => (
        <Button
          action={{
            label: option.name,
            onPress: () => {
              onSelect(option);
            },
          }}
          key={option.articleCode}
          size="sm"
          variant={selected?.articleCode === option.articleCode ? "default" : "outline"}
        />
      ))}
    </ScrollView>
  );
}
```

- [ ] **Step 6: Write `PlaceDetailSheet.tsx`**

```tsx
// src/screens/shared/Explore/_components/PlaceDetailSheet.tsx
import { Badge, Button, Text } from "@/components/ui";
import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import React from "react";
import { Linking, View } from "react-native";
import { appleMapsUrl, googleMapsUrl } from "../_lib/directions";
import type { ViewportPlace } from "../_lib/normalizeViewport";

export function PlaceDetailSheet({
  sheetRef,
  place,
  noAddressLabel,
}: {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  place: ViewportPlace | null;
  noAddressLabel: string;
}) {
  const latitude = place?.latitude;
  const longitude = place?.longitude;

  // Only merchant pins carry sectors; the other two layers leave it undefined.
  const sectors = (place?.sectors ?? [])
    .map((sector) => sector.name)
    .filter((name): name is string => Boolean(name));

  return (
    <BottomSheetModal enableDynamicSizing ref={sheetRef}>
      <BottomSheetView className="gap-2 p-4 pb-8">
        {/* Names come back from the API with stray leading whitespace. */}
        <Text variant="subheading">{place?.name?.trim()}</Text>
        <Text tone="muted" variant="body">
          {place?.addressLine || noAddressLabel}
        </Text>

        {sectors.length > 0 ? (
          <View className="flex-row flex-wrap gap-1">
            {sectors.map((name) => (
              <Badge key={name} variant="outline">
                {name}
              </Badge>
            ))}
          </View>
        ) : null}

        {latitude !== undefined && longitude !== undefined ? (
          <View className="flex-row gap-2 pt-2">
            <Button
              action={{
                label: "Google Maps",
                onPress: () => {
                  void Linking.openURL(googleMapsUrl(latitude, longitude));
                },
              }}
              size="sm"
              variant="secondary"
            />
            <Button
              action={{
                label: "Apple Maps",
                onPress: () => {
                  void Linking.openURL(appleMapsUrl(latitude, longitude));
                },
              }}
              size="sm"
              variant="secondary"
            />
          </View>
        ) : null}
      </BottomSheetView>
    </BottomSheetModal>
  );
}
```

- [ ] **Step 7: Rewrite `ExploreScreen.tsx`**

```tsx
// src/screens/shared/Explore/ExploreScreen.tsx
import {
  getPublicCustomsViewportApi,
  getPublicMerchantsViewportApi,
  getPublicRefundPointsViewportApi,
} from "@/actions/CRMService/actions";
import { SafeAreaView } from "@/components/SafeAreaView";
import { useDebounce } from "@/hooks/useDebounce";
import { useLocalization } from "@/providers/LocalizationProvider";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { ViewStateChangeEvent } from "@maplibre/maplibre-react-native";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { deriveSectorOptions, type SectorOption } from "./_lib/sectors";
import type { ViewportPlace } from "./_lib/normalizeViewport";
import { toViewportRequest, type ViewportRequest } from "./_lib/viewportRequest";
import { ExploreMap } from "./_components/ExploreMap";
import { LayerToggles, type LayerKey } from "./_components/LayerToggles";
import { PlaceDetailSheet } from "./_components/PlaceDetailSheet";
import { SectorControl } from "./_components/SectorControl";
import { useViewportLayer } from "./_components/useViewportLayer";

const INITIAL_REQUEST: ViewportRequest = {
  south: 40.8,
  north: 41.2,
  west: 28.7,
  east: 29.3,
};

function ExploreScreen() {
  const { t } = useLocalization();
  const [rawRequest, setRawRequest] = useState<ViewportRequest>(INITIAL_REQUEST);
  // One timer for every layer: a single gesture moves all of them.
  const request = useDebounce(rawRequest, 350);

  const [active, setActive] = useState<Record<LayerKey, boolean>>({
    merchants: true,
    customs: false,
    refundPoints: false,
  });
  const [sector, setSector] = useState<SectorOption | undefined>(undefined);
  const [selectedPlace, setSelectedPlace] = useState<ViewportPlace | null>(null);
  const detailSheetRef = useRef<BottomSheetModal>(null);

  const sectorCode = sector?.articleCode;

  const fetchMerchants = useCallback(
    (window: ViewportRequest) =>
      getPublicMerchantsViewportApi({ ...window, sector: sectorCode }),
    [sectorCode],
  );
  const fetchCustoms = useCallback(
    (window: ViewportRequest) => getPublicCustomsViewportApi(window),
    [],
  );
  const fetchRefundPoints = useCallback(
    (window: ViewportRequest) => getPublicRefundPointsViewportApi(window),
    [],
  );

  const merchants = useViewportLayer({
    request,
    enabled: active.merchants,
    envelopeKey: "merchants",
    fetcher: fetchMerchants,
  });
  const customs = useViewportLayer({
    request,
    enabled: active.customs,
    envelopeKey: "customs",
    fetcher: fetchCustoms,
  });
  const refundPoints = useViewportLayer({
    request,
    enabled: active.refundPoints,
    envelopeKey: "refundPoints",
    fetcher: fetchRefundPoints,
  });

  const places = useMemo(
    () => [...merchants.places, ...customs.places, ...refundPoints.places],
    [merchants.places, customs.places, refundPoints.places],
  );
  const clusters = useMemo(
    () => [...merchants.clusters, ...customs.clusters, ...refundPoints.clusters],
    [merchants.clusters, customs.clusters, refundPoints.clusters],
  );
  const sectorOptions = useMemo(
    () => deriveSectorOptions(merchants.places),
    [merchants.places],
  );

  const handleRegionDidChange = useCallback(
    (event: { nativeEvent: ViewStateChangeEvent }) => {
      setRawRequest(toViewportRequest(event.nativeEvent.bounds));
    },
    [],
  );

  const handleSelectPlace = useCallback((place: ViewportPlace) => {
    setSelectedPlace(place);
    detailSheetRef.current?.present();
  }, []);

  const handleSelectCluster = useCallback(() => {
    // Clusters carry no identity, so the only thing a bubble can offer is a
    // way to zoom in far enough that the answer comes back as pins. The map
    // handles the zoom itself on a double tap; nothing to do here yet.
  }, []);

  const toggleLayer = useCallback((layer: LayerKey) => {
    setActive((previous) => ({ ...previous, [layer]: !previous[layer] }));
  }, []);

  return (
    <SafeAreaView className="flex-1">
      <View className="flex-1">
        <ExploreMap
          clusters={clusters}
          onRegionDidChange={handleRegionDidChange}
          onSelectCluster={handleSelectCluster}
          onSelectPlace={handleSelectPlace}
          places={places}
        />

        <LayerToggles
          active={active}
          labels={{
            merchants: t("MobileApp.Explore.Layer.Merchants"),
            customs: t("MobileApp.Explore.Layer.Customs"),
            refundPoints: t("MobileApp.Explore.Layer.RefundPoints"),
          }}
          onToggle={toggleLayer}
        />

        <SectorControl
          allLabel={t("MobileApp.Explore.SectorAll")}
          onSelect={setSector}
          options={sectorOptions}
          selected={sector}
        />

        <PlaceDetailSheet
          noAddressLabel={t("MobileApp.Explore.NoAddress")}
          place={selectedPlace}
          sheetRef={detailSheetRef}
        />
      </View>
    </SafeAreaView>
  );
}

export default ExploreScreen;
```

- [ ] **Step 8: Delete the mock-driven components**

```bash
cd /c/unirefund/super-app
git rm src/screens/shared/Explore/_components/MapView.tsx \
       src/screens/shared/Explore/_components/FilterSheet.tsx \
       src/screens/shared/Explore/_components/ListView.tsx \
       src/screens/shared/Explore/_components/LocationDetailSheet.tsx \
       src/screens/shared/Explore/_components/mock-data.ts
```

- [ ] **Step 9: Remove the old map library**

```bash
cd /c/unirefund/super-app
grep -rn "react-native-leaflet-map" src/
```

Expected: no matches. Then:

```bash
npm uninstall react-native-leaflet-map
```

- [ ] **Step 10: Run the render test and watch it pass**

Run: `npx jest src/screens/shared/Explore/__tests__/explore.router.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 11: Run the full gates**

```bash
cd /c/unirefund/super-app
npm run typecheck && npm test && npm run lint
```

Expected: all pass. `tokens.test.ts` is the only known baseline failure in this repo — if anything else fails, it is a regression from this work.

- [ ] **Step 12: Commit**

```bash
git add -A src/screens/shared/Explore package.json package-lock.json
git commit -m "feat(explore): drive the traveller map from the live viewport endpoints"
```

---

### Task 10: On-device verification

**Files:** none

Only a device can confirm the region event fires with real bounds, the tiles render, and the deep links hand off. There is no automated substitute.

- [ ] **Step 1: Build and install the dev client**

```bash
cd /c/unirefund/super-app
npx expo run:android
```

- [ ] **Step 2: Confirm the region event drives the fetch**

Open Explore. Pan the map. Expected: after roughly a third of a second, pins change. Watch the Metro log for one request per enabled layer per settled gesture — not one per frame. If requests fire continuously, the debounce is not being applied to `rawRequest`.

- [ ] **Step 3: Confirm the tenant is resolving**

Expected: merchant pins appear around Istanbul. A `400` carrying `UniRefund.CRMService:029001` means the `__tenant` header is not reaching the endpoint. A `200` with `totalCount: 0` everywhere means the tenant resolved to the wrong one — check that `getPublicCRMServiceClient` is sending no `Authorization` header.

- [ ] **Step 4: Confirm the layers gate their own traffic**

Switch Customs on. Expected: one additional request per gesture. Switch it off. Expected: it stops requesting entirely.

- [ ] **Step 5: Confirm the sector filter**

Tap a sector. Expected: pins reduce, and the chip stays selected after panning away from the area that offered it.

- [ ] **Step 6: Confirm the directions hand off**

Tap a pin, then each button. Expected: Google Maps and Apple Maps open at the pin's coordinates with the route ready to start from the current location, and neither asks this app for the location permission.

- [ ] **Step 7: Record the result**

Note what was checked, on which device, in the PR description.

---

## Self-Review

**Spec coverage.** Library swap → Task 1. Bounds → Task 2. Token-less client and the three endpoints → Task 3. Normalising the three envelopes → Task 4. Sector derivation and retention → Task 5. Directions → Task 6. Layer gating and the race guard → Task 7. i18n → Task 8. Layer toggles, sector control, detail sheet, screen, deletion of the list view and search → Task 9. Device verification of the region event, tiles and deep links → Task 10.

**Two spec items are deliberately not implemented, and both are recorded rather than silently dropped:** `rating` / `operatingHours` / `description` / `images` have no endpoint behind them, so `PlaceDetailSheet` shows name, address and sectors only; and the "zoom into a cluster" behaviour is a no-op handler, because MapLibre's `Camera` zoom-to-cluster needs a `CameraRef` that Task 9 does not wire. **If cluster zoom is wanted, it needs its own task.**

**Type consistency.** `ViewportRequest` (Task 2) is the parameter of every fetcher and of `useViewportLayer` (Task 7). `ViewportPlace` / `ViewportCluster` / `ViewportLayerState` / `ViewportEnvelopeKey` (Task 4) are used unchanged in Tasks 5, 7 and 9. `SectorOption` (Task 5) is the type of `sector` state and of `SectorControl`'s props. `LayerKey` is declared once in `LayerToggles.tsx` and imported by the screen.

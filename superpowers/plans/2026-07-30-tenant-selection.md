# Tenant Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the tenant the staff login screen shows always be the tenant the login request sends, and clear the tenant on logout.

**Architecture:** Environment and tenant selection move out of `SessionProvider` into a dedicated Zustand store that owns state, persistence, hydration and reset, and that also exports the async read API the actions layer already calls. The native `Picker` is replaced by a field showing the resolved tenant name plus a searchable full-screen modal. A tenant becomes required for staff login, and logout clears the tenant explicitly instead of wiping all of AsyncStorage.

**Tech Stack:** React Native 0.81 / Expo 54, React 19, TypeScript strict, Zustand 5, NativeWind 4, `@shopify/flash-list` 2, `@react-native-async-storage/async-storage`, Jest + `jest-expo/node` + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-07-30-tenant-selection-design.md`

## Global Constraints

- Working directory for all commands and paths: `c:\unirefund\super-app`.
- TypeScript strict mode. No implicit `any`, no unchecked nulls.
- Path alias `@/*` → `./src/*` for every internal import. External imports grouped before internal ones.
- No hardcoded user-visible text. Add keys to `src/localization/resources/{en-US,tr-TR}.json` and read them via `useLocalization()`. Never edit `src/data/language-data/*.gen.json`.
- Never call generated SDK clients (`src/saas/**`) from screens, components, hooks or stores. Go through `src/actions/**`.
- Avoid `useEffect`. It is acceptable only for one-time post-mount setup and external subscriptions. Derived values use `useMemo` or are computed on `set`; responses to user actions go in handlers.
- Prefer existing components (`Button`, `Input`, `Ionicons`, `SafeAreaView`) and `cn()` for class merging.
- Storage keys stay exactly `debug_environment` and `debug_tenantId` so existing installs keep their environment.
- Every task ends with `npx tsc --noEmit` clean and `npx jest` green before the commit.
- Commit messages: conventional prefixes (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`), no `Co-Authored-By` trailer unless the executing agent's own instructions require one.

## Deviations From The Spec

Three refinements found while writing this plan. They serve the spec's intent; do not "correct" them back.

1. **`loadTenants` is its own module**, not a store action. The store must not import `src/actions/**`, because the actions layer imports the store for the tenant header — and `src/actions/auth/actions.ts:8` evaluates `export const getApiUrl = getGatewayUrl` at module level, which a cycle would leave `undefined` at startup.
2. **The store reports `errorCode`, not a message.** A store cannot call `useLocalization()`, and hardcoded UI text violates the i18n rule. The component maps the code to a key.
3. **Cache, types and selector helpers are separate small modules** (`tenantCache.ts`, `tenant.types.ts`, `tenantList.ts`) rather than living inside the store and the components. The helpers are pure, so they are unit-testable without provider mocking.

## Line Numbers

Every line number in a task refers to the file **as it stands before that task's edits**. Steps within a task shift them, so locate edits by the quoted content, not by re-counting.

## Task Order Note

Tasks are ordered so **every commit typechecks**. The consumers are migrated before `SessionProvider` gives up its copy of the state, which means that between Task 5 and Task 7 the app briefly has two writers for `debug_tenantId`: the new store and the provider's old environment-change effect. Manual behaviour is therefore inconsistent at those two commits — switching environments on the login screen may still drop the tenant. This is expected; it resolves in Task 7. Do not stop and debug it there.

## File Structure

**New**

| File | Responsibility |
|---|---|
| `src/store/tenant.types.ts` | `TenantOption`, `TenantCacheEntry`. Types only. |
| `src/store/tenantCache.ts` | Per-environment cached tenant list: read, write, freshness. Owns the cache key and TTL. |
| `src/store/tenant.ts` | The store: environment, selection, list state, persistence, memoised hydration, and the async read API (`getStoredEnvironment`, `getStoredTenantId`, `getGatewayUrl`). |
| `src/store/loadTenants.ts` | Fetch orchestration: cache-first, force refresh, stale-environment discard. The only module that imports both the store and the actions layer. |
| `src/store/__tests__/tenantCache.test.ts` | Cache round-trip, per-environment isolation, corrupt JSON, TTL. |
| `src/store/__tests__/tenant.test.ts` | Hydration, persistence, validation, reset. One test per root cause. |
| `src/store/__tests__/loadTenants.test.ts` | Cache-first, force, stale-environment discard, failure leaves selection alone. |
| `src/components/TenantInput/tenantList.ts` | Pure selector helpers: internal-name test, name resolution, query + internal filtering, error-code → i18n key map. |
| `src/components/TenantInput/__tests__/tenantList.test.ts` | Tests for the above. |
| `src/components/TenantInput/TenantInput.tsx` | The field: resolved tenant name, opens the modal, triggers the one-time load, shows the error. |
| `src/components/TenantInput/TenantSelectionModal.tsx` | Full-screen slide-up modal: search, refresh, `FlashList`, loading / error / empty states. |
| `src/components/EnvironmentChips.tsx` | The three environment chips, shared by the login screen and the debug menu. Owns "switch environment, then reload the list". |

**Modified**

| File | Change |
|---|---|
| `src/utils/environment.ts` | Reduced to pure config; `isAppEnvironment` exported; all state and AsyncStorage removed. |
| `src/providers/SessionProvider.tsx` | Tenant/environment state and both effects removed; hydration awaited in bootstrap; explicit logout resets; `setAccessToken(null)`. |
| `src/screens/shared/StaffLoginScreen.tsx` | `EnvironmentChips` + `TenantInput`; tenant required; i18n. |
| `src/screens/traveller/TravellerLoginScreen.tsx` | Clear the tenant through the store. |
| `src/app/(modals)/debug-menu.tsx` | Shared chips, `TenantInput includeInternal`, by-name lookup feeds `addManualTenant`, stale note removed. |
| `src/actions/auth/actions.ts`, `src/actions/AccountService/post.ts` | Import the read API from the store. |
| `src/screens/shared/Profile/_components/DeleteAccountModal.tsx` | `await signOut()`. |
| `src/localization/resources/{en-US,tr-TR}.json` | New keys. |
| `.claude/rules/api-actions.md` | New import path for the read API. |
| `AGENTS.md` | Correct the "no automated test suite" claim. |

## Out of Scope

- Removing the now-unused `@react-native-picker/picker` dependency. It is a native module, so removing it forces a prebuild; do it in a separate PR.
- Changing which tenants the backend exposes as public.
- Mobile host/admin login. Staff login requires a tenant; hosts use the portal.

---

### Task 1: Per-environment tenant cache

The cache key is not environment-scoped today (`public_tenants_cache_v1`), so a cold start can show another environment's tenants. This task adds the types and a per-environment cache with a `manual` slot for tenants resolved by name in the debug menu.

**Files:**
- Create: `src/store/tenant.types.ts`
- Create: `src/store/tenantCache.ts`
- Test: `src/store/__tests__/tenantCache.test.ts`

**Interfaces:**
- Consumes: `AppEnvironment` from `@/utils/environment`, `logger` from `@/utils/logger`.
- Produces:
  - `type TenantOption = { id: string; name: string }`
  - `type TenantCacheEntry = { timestamp: number; items: TenantOption[]; manual: TenantOption[] }`
  - `TENANTS_CACHE_TTL_MS: number`
  - `readTenantCache(environment: AppEnvironment): Promise<TenantCacheEntry | null>`
  - `writeTenantCache(environment: AppEnvironment, entry: TenantCacheEntry): Promise<void>`
  - `isCacheFresh(entry: TenantCacheEntry, now: number): boolean`

- [ ] **Step 1: Write the types**

Create `src/store/tenant.types.ts`:

```ts
/** A tenant the user can select, always carrying the name we display for it. */
export type TenantOption = { id: string; name: string };

/**
 * One environment's cached tenant list. `items` comes from the public tenants
 * endpoint; `manual` holds tenants resolved by name in the debug menu, which are
 * absent from the public list and must survive a forced refresh.
 */
export type TenantCacheEntry = {
  timestamp: number;
  items: TenantOption[];
  manual: TenantOption[];
};
```

- [ ] **Step 2: Write the failing test**

Create `src/store/__tests__/tenantCache.test.ts`:

```ts
import {
  isCacheFresh,
  readTenantCache,
  TENANTS_CACHE_TTL_MS,
  writeTenantCache,
} from "@/store/tenantCache";
import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

const ACME = { id: "acme-id", name: "Acme Duty Free" };
const MANUAL = { id: "e2e-id", name: "e2e-tenant" };

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("tenantCache", () => {
  it("round-trips an entry", async () => {
    await writeTenantCache("dev", {
      timestamp: 1000,
      items: [ACME],
      manual: [MANUAL],
    });

    expect(await readTenantCache("dev")).toEqual({
      timestamp: 1000,
      items: [ACME],
      manual: [MANUAL],
    });
  });

  // The whole point of the v2 key: a `dev` list must never surface for `live`.
  it("keeps environments isolated", async () => {
    await writeTenantCache("dev", { timestamp: 1000, items: [ACME], manual: [] });

    expect(await readTenantCache("live")).toBeNull();
  });

  it("returns null for corrupt JSON instead of throwing", async () => {
    await AsyncStorage.setItem("public_tenants_cache_v2:dev", "{not json");

    expect(await readTenantCache("dev")).toBeNull();
  });

  it("returns null when the entry shape is wrong", async () => {
    await AsyncStorage.setItem(
      "public_tenants_cache_v2:dev",
      JSON.stringify({ timestamp: 1000, items: [{ id: 1 }] }),
    );

    expect(await readTenantCache("dev")).toBeNull();
  });

  // Older entries wrote no `manual` array; they must still load.
  it("defaults a missing manual array to empty", async () => {
    await AsyncStorage.setItem(
      "public_tenants_cache_v2:dev",
      JSON.stringify({ timestamp: 1000, items: [ACME] }),
    );

    expect(await readTenantCache("dev")).toEqual({
      timestamp: 1000,
      items: [ACME],
      manual: [],
    });
  });

  it("treats an entry older than the TTL as stale", () => {
    const entry = { timestamp: 0, items: [ACME], manual: [] };

    expect(isCacheFresh(entry, TENANTS_CACHE_TTL_MS)).toBe(true);
    expect(isCacheFresh(entry, TENANTS_CACHE_TTL_MS + 1)).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx jest src/store/__tests__/tenantCache.test.ts`
Expected: FAIL — `Cannot find module '@/store/tenantCache'`.

- [ ] **Step 4: Write the implementation**

Create `src/store/tenantCache.ts`:

```ts
import type { AppEnvironment } from "@/utils/environment";
import { logger } from "@/utils/logger";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TenantCacheEntry, TenantOption } from "./tenant.types";

/**
 * Keyed per environment. The v1 key was shared across environments, so a cold
 * start could render `dev` tenants while the app was pointed at `live`.
 */
const CACHE_KEY_PREFIX = "public_tenants_cache_v2:";

export const TENANTS_CACHE_TTL_MS = 1000 * 60 * 30;

function cacheKey(environment: AppEnvironment): string {
  return `${CACHE_KEY_PREFIX}${environment}`;
}

function isTenantList(value: unknown): value is TenantOption[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as TenantOption).id === "string" &&
        typeof (item as TenantOption).name === "string",
    )
  );
}

export async function readTenantCache(
  environment: AppEnvironment,
): Promise<TenantCacheEntry | null> {
  const raw = await AsyncStorage.getItem(cacheKey(environment));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<TenantCacheEntry>;
    if (typeof parsed.timestamp !== "number" || !isTenantList(parsed.items)) {
      return null;
    }
    return {
      timestamp: parsed.timestamp,
      items: parsed.items,
      manual: isTenantList(parsed.manual) ? parsed.manual : [],
    };
  } catch (error) {
    logger.error("Invalid tenants cache JSON:", error);
    return null;
  }
}

export async function writeTenantCache(
  environment: AppEnvironment,
  entry: TenantCacheEntry,
): Promise<void> {
  await AsyncStorage.setItem(cacheKey(environment), JSON.stringify(entry));
}

export function isCacheFresh(entry: TenantCacheEntry, now: number): boolean {
  return now - entry.timestamp <= TENANTS_CACHE_TTL_MS;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest src/store/__tests__/tenantCache.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/store/tenant.types.ts src/store/tenantCache.ts src/store/__tests__/tenantCache.test.ts
git commit -m "feat(tenant): add a per-environment tenant list cache"
```

---

### Task 2: The tenant store

Owns environment, selection, list state, persistence, memoised hydration, and the async read API. Four of the plan's regression tests live here.

Note the two structural fixes: hydration **never** clears the tenant (the old cold-start wipe came from an effect reacting to the environment being restored), and `setEnvironment` clears it **in the handler**, not in an effect.

**Files:**
- Create: `src/store/tenant.ts`
- Modify: `src/utils/environment.ts` — export `isAppEnvironment` (currently module-private)
- Modify: `AGENTS.md:29-36` — correct the "no automated test suite" claim
- Test: `src/store/__tests__/tenant.test.ts`

**Interfaces:**
- Consumes: `TenantOption` from `./tenant.types`; `readTenantCache`, `writeTenantCache` from `./tenantCache`; `AppEnvironment`, `APP_ENVIRONMENTS`, `DEFAULT_ENVIRONMENT`, `ENVIRONMENT_URLS`, `isAppEnvironment` from `@/utils/environment`.
- Produces:
  - `default useTenantStore` with state `{ environment, tenantId, publicTenants, manualTenants, tenants, status, errorCode, isHydrated }` and actions `{ setEnvironment, setTenantId, setTenants, addManualTenant, setStatus, reset }`
  - `type TenantListStatus = "idle" | "loading" | "ready" | "error"`
  - `type TenantErrorCode = "loadFailed" | "selectionUnavailable"`
  - `hydrateTenantStore(): Promise<void>` — memoised
  - `getStoredEnvironment(): Promise<AppEnvironment>`
  - `getStoredTenantId(): Promise<string | null>`
  - `getGatewayUrl(): Promise<string>`

Why `errorCode` and not a message: the store cannot call `useLocalization()`, and the i18n rule forbids hardcoded UI text. The component maps the code to a key.

- [ ] **Step 1: Export `isAppEnvironment`**

In `src/utils/environment.ts:69`, change:

```ts
function isAppEnvironment(value: unknown): value is AppEnvironment {
```

to:

```ts
export function isAppEnvironment(value: unknown): value is AppEnvironment {
```

- [ ] **Step 2: Write the failing test**

Create `src/store/__tests__/tenant.test.ts`. Every test re-imports the module under `jest.resetModules()` because hydration is memoised in module scope:

```ts
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

type TenantModule = typeof import("@/store/tenant");

/**
 * Hydration is memoised per module instance, so each test needs a fresh module
 * registry — otherwise the first test's hydration result leaks into the rest.
 * Storage is seeded before the import so hydration observes it.
 */
async function loadStore(seed: Record<string, string> = {}) {
  jest.resetModules();
  const AsyncStorage = (
    await import("@react-native-async-storage/async-storage")
  ).default;
  await AsyncStorage.clear();
  for (const [key, value] of Object.entries(seed)) {
    await AsyncStorage.setItem(key, value);
  }
  const store: TenantModule = await import("@/store/tenant");
  return { store, AsyncStorage };
}

const ACME = { id: "acme-id", name: "Acme Duty Free" };
const OTHER = { id: "other-id", name: "Other Retail" };

describe("tenant store hydration", () => {
  it("restores the persisted environment and tenant", async () => {
    const { store } = await loadStore({
      debug_environment: "live",
      debug_tenantId: ACME.id,
    });

    await store.hydrateTenantStore();

    expect(store.default.getState().environment).toBe("live");
    expect(store.default.getState().tenantId).toBe(ACME.id);
  });

  // Root cause 2: the old environment-change effect fired when the async
  // bootstrap applied a stored non-`dev` environment, wiping the tenant it had
  // just restored from state *and* storage.
  it("keeps the stored tenant when the stored environment is not the default", async () => {
    const { store, AsyncStorage } = await loadStore({
      debug_environment: "uat",
      debug_tenantId: ACME.id,
    });

    await store.hydrateTenantStore();

    expect(store.default.getState().tenantId).toBe(ACME.id);
    expect(await AsyncStorage.getItem("debug_tenantId")).toBe(ACME.id);
  });

  it("falls back to the default environment and no tenant on a fresh install", async () => {
    const { store } = await loadStore();

    await store.hydrateTenantStore();

    expect(store.default.getState().environment).toBe("dev");
    expect(store.default.getState().tenantId).toBeNull();
  });

  it("ignores a garbage stored environment", async () => {
    const { store } = await loadStore({ debug_environment: "banana" });

    await store.hydrateTenantStore();

    expect(store.default.getState().environment).toBe("dev");
  });

  it("restores the cached list for the hydrated environment", async () => {
    const { store } = await loadStore({
      debug_environment: "live",
      "public_tenants_cache_v2:live": JSON.stringify({
        timestamp: 1000,
        items: [ACME],
        manual: [OTHER],
      }),
    });

    await store.hydrateTenantStore();

    expect(store.default.getState().tenants).toEqual([ACME, OTHER]);
  });

  it("hydrates once even when called concurrently", async () => {
    const { store } = await loadStore({ debug_environment: "uat" });

    await Promise.all([
      store.hydrateTenantStore(),
      store.hydrateTenantStore(),
      store.hydrateTenantStore(),
    ]);

    expect(store.default.getState().isHydrated).toBe(true);
    expect(store.default.getState().environment).toBe("uat");
  });
});

describe("tenant store selection", () => {
  it("persists a selected tenant", async () => {
    const { store, AsyncStorage } = await loadStore();

    await store.default.getState().setTenantId(ACME.id);

    expect(await AsyncStorage.getItem("debug_tenantId")).toBe(ACME.id);
  });

  // An empty string is neither absent nor usable: ABP treats a blank
  // `__tenant` header as unresolved, so the key must be removed instead.
  it("removes the key rather than storing an empty string", async () => {
    const { store, AsyncStorage } = await loadStore({ debug_tenantId: ACME.id });

    await store.default.getState().setTenantId(null);

    expect(await AsyncStorage.getItem("debug_tenantId")).toBeNull();
  });

  it("clears the tenant and the list when the environment changes", async () => {
    const { store, AsyncStorage } = await loadStore();
    await store.default.getState().setTenantId(ACME.id);
    store.default.getState().setTenants([ACME]);

    await store.default.getState().setEnvironment("live");

    expect(store.default.getState().environment).toBe("live");
    expect(store.default.getState().tenantId).toBeNull();
    expect(store.default.getState().tenants).toEqual([]);
    expect(await AsyncStorage.getItem("debug_environment")).toBe("live");
    expect(await AsyncStorage.getItem("debug_tenantId")).toBeNull();
  });
});

describe("tenant store list validation", () => {
  // Root cause 3, at the data level: an id with no matching item made the
  // native Picker render "Without Tenant" while state still held the id.
  it("drops a selection missing from a loaded list", async () => {
    const { store, AsyncStorage } = await loadStore();
    await store.default.getState().setTenantId("stale-id");

    store.default.getState().setTenants([ACME, OTHER]);

    expect(store.default.getState().tenantId).toBeNull();
    expect(store.default.getState().errorCode).toBe("selectionUnavailable");
    expect(await AsyncStorage.getItem("debug_tenantId")).toBeNull();
  });

  it("keeps a selection present in a loaded list", async () => {
    const { store } = await loadStore();
    await store.default.getState().setTenantId(ACME.id);

    store.default.getState().setTenants([ACME, OTHER]);

    expect(store.default.getState().tenantId).toBe(ACME.id);
    expect(store.default.getState().errorCode).toBeNull();
    expect(store.default.getState().status).toBe("ready");
  });

  it("merges manual tenants into the list and selects them", async () => {
    const { store } = await loadStore();
    store.default.getState().setTenants([ACME]);

    await store.default.getState().addManualTenant(OTHER);

    expect(store.default.getState().tenants).toEqual([ACME, OTHER]);
    expect(store.default.getState().tenantId).toBe(OTHER.id);
  });

  it("keeps a manual tenant across a public-list refresh", async () => {
    const { store } = await loadStore();
    await store.default.getState().addManualTenant(OTHER);

    store.default.getState().setTenants([ACME]);

    expect(store.default.getState().tenants).toEqual([ACME, OTHER]);
    expect(store.default.getState().tenantId).toBe(OTHER.id);
    expect(store.default.getState().errorCode).toBeNull();
  });
});

describe("tenant store reset", () => {
  // Root cause 1: logout wiped storage but not state, so the screen showed a
  // tenant the request no longer sent.
  it("clears the tenant in state and storage", async () => {
    const { store, AsyncStorage } = await loadStore();
    await store.default.getState().setTenantId(ACME.id);

    await store.default.getState().reset();

    expect(store.default.getState().tenantId).toBeNull();
    expect(await AsyncStorage.getItem("debug_tenantId")).toBeNull();
  });

  it("keeps the environment", async () => {
    const { store, AsyncStorage } = await loadStore();
    await store.default.getState().setEnvironment("live");

    await store.default.getState().reset();

    expect(store.default.getState().environment).toBe("live");
    expect(await AsyncStorage.getItem("debug_environment")).toBe("live");
  });

  // `AsyncStorage.clear()` on logout also wiped these two, silently resetting
  // the user's language and theme.
  it("leaves unrelated app storage alone", async () => {
    const { store, AsyncStorage } = await loadStore({
      theme_preference: "dark",
      locale: "tr-TR",
    });
    await store.default.getState().setTenantId(ACME.id);

    await store.default.getState().reset();

    expect(await AsyncStorage.getItem("theme_preference")).toBe("dark");
    expect(await AsyncStorage.getItem("locale")).toBe("tr-TR");
  });
});

describe("tenant store read API", () => {
  // The actions layer reads through these. Before hydration they must block,
  // not silently answer with the `dev` default.
  it("awaits hydration instead of returning the default", async () => {
    const { store } = await loadStore({
      debug_environment: "live",
      debug_tenantId: ACME.id,
    });
    // Compared against the config module's own table rather than a literal
    // URL: Jest does not necessarily load `.env`, and `@/config/env` falls back
    // to `example.com` when `EXPO_PUBLIC_GATEWAY_URL` is unset.
    const { ENVIRONMENT_URLS } = await import("@/utils/environment");

    expect(await store.getStoredTenantId()).toBe(ACME.id);
    expect(await store.getStoredEnvironment()).toBe("live");
    expect(await store.getGatewayUrl()).toBe(ENVIRONMENT_URLS.live);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx jest src/store/__tests__/tenant.test.ts`
Expected: FAIL — `Cannot find module '@/store/tenant'`.

- [ ] **Step 4: Write the implementation**

Create `src/store/tenant.ts`:

```ts
import {
  DEFAULT_ENVIRONMENT,
  ENVIRONMENT_URLS,
  isAppEnvironment,
  type AppEnvironment,
} from "@/utils/environment";
import { logger } from "@/utils/logger";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import type { TenantOption } from "./tenant.types";
import { readTenantCache, writeTenantCache } from "./tenantCache";

// Kept as-is so existing installs keep the environment they were left on.
const ENVIRONMENT_STORAGE_KEY = "debug_environment";
const TENANT_STORAGE_KEY = "debug_tenantId";

export type TenantListStatus = "idle" | "loading" | "ready" | "error";

/**
 * Codes rather than messages: the store cannot reach `useLocalization()`, and
 * the consumer maps these to translation keys.
 */
export type TenantErrorCode = "loadFailed" | "selectionUnavailable";

interface TenantStore {
  environment: AppEnvironment;
  /** `null` means no tenant — never an empty string. */
  tenantId: string | null;
  publicTenants: TenantOption[];
  manualTenants: TenantOption[];
  /** Derived on every set, so it cannot drift from its two inputs. */
  tenants: TenantOption[];
  status: TenantListStatus;
  errorCode: TenantErrorCode | null;
  isHydrated: boolean;

  setEnvironment: (environment: AppEnvironment) => Promise<void>;
  setTenantId: (tenantId: string | null) => Promise<void>;
  setTenants: (items: TenantOption[]) => void;
  addManualTenant: (tenant: TenantOption) => Promise<void>;
  setStatus: (
    status: TenantListStatus,
    errorCode?: TenantErrorCode | null,
  ) => void;
  reset: () => Promise<void>;
}

/** Manual entries win on id: they carry the name the debug lookup resolved. */
function mergeTenants(
  publicTenants: TenantOption[],
  manualTenants: TenantOption[],
): TenantOption[] {
  const byId = new Map(publicTenants.map((tenant) => [tenant.id, tenant]));
  for (const tenant of manualTenants) {
    byId.set(tenant.id, tenant);
  }
  return [...byId.values()];
}

const useTenantStore = create<TenantStore>((set, get) => ({
  environment: DEFAULT_ENVIRONMENT,
  tenantId: null,
  publicTenants: [],
  manualTenants: [],
  tenants: [],
  status: "idle",
  errorCode: null,
  isHydrated: false,

  // Tenants are environment-specific, so a selection cannot survive the switch.
  // Clearing here — in the handler — rather than in an effect on `environment`
  // is what stops a cold start from deleting the restored selection.
  setEnvironment: async (environment) => {
    set({
      environment,
      tenantId: null,
      publicTenants: [],
      manualTenants: [],
      tenants: [],
      status: "idle",
      errorCode: null,
    });
    await Promise.all([
      AsyncStorage.setItem(ENVIRONMENT_STORAGE_KEY, environment),
      AsyncStorage.removeItem(TENANT_STORAGE_KEY),
    ]);
  },

  setTenantId: async (tenantId) => {
    set({ tenantId, errorCode: null });
    if (tenantId) {
      await AsyncStorage.setItem(TENANT_STORAGE_KEY, tenantId);
      return;
    }
    // Remove rather than store "": ABP treats a blank `__tenant` header as
    // unresolved, so an empty string is neither absent nor usable.
    await AsyncStorage.removeItem(TENANT_STORAGE_KEY);
  },

  setTenants: (items) => {
    const { manualTenants, tenantId } = get();
    const tenants = mergeTenants(items, manualTenants);
    // Only a *successful* load reaches here, so an id absent from the list is
    // genuinely gone and must not stay selected — the field would have no name
    // to render for it. A failed fetch never calls this.
    const selectionMissing =
      tenantId !== null && !tenants.some((tenant) => tenant.id === tenantId);

    set({
      publicTenants: items,
      tenants,
      status: "ready",
      errorCode: selectionMissing ? "selectionUnavailable" : null,
      tenantId: selectionMissing ? null : tenantId,
    });

    if (selectionMissing) {
      AsyncStorage.removeItem(TENANT_STORAGE_KEY).catch((error) =>
        logger.error("Failed to clear an unavailable tenant:", error),
      );
    }
  },

  addManualTenant: async (tenant) => {
    const { publicTenants, manualTenants, environment } = get();
    const manual = [
      ...manualTenants.filter((existing) => existing.id !== tenant.id),
      tenant,
    ];
    set({
      manualTenants: manual,
      tenants: mergeTenants(publicTenants, manual),
    });
    await get().setTenantId(tenant.id);

    // Persist alongside the cached public list so a by-name tenant survives a
    // restart and a forced refresh.
    const existing = await readTenantCache(environment);
    await writeTenantCache(environment, {
      timestamp: existing?.timestamp ?? 0,
      items: existing?.items ?? publicTenants,
      manual,
    });
  },

  setStatus: (status, errorCode = null) => set({ status, errorCode }),

  // Logout clears the tenant only. The environment is a tester's target
  // gateway, not user data — resetting it silently sent the next login to
  // `dev` while the UI still showed `live`. The cached list is harmless and
  // saves a fetch on the next login.
  reset: async () => {
    set({ tenantId: null, errorCode: null });
    await AsyncStorage.removeItem(TENANT_STORAGE_KEY);
  },
}));

let hydration: Promise<void> | null = null;

async function doHydrate(): Promise<void> {
  try {
    const [storedEnvironment, storedTenantId] = await Promise.all([
      AsyncStorage.getItem(ENVIRONMENT_STORAGE_KEY),
      AsyncStorage.getItem(TENANT_STORAGE_KEY),
    ]);
    const environment = isAppEnvironment(storedEnvironment)
      ? storedEnvironment
      : DEFAULT_ENVIRONMENT;

    const cached = await readTenantCache(environment);
    const publicTenants = cached?.items ?? [];
    const manualTenants = cached?.manual ?? [];

    // Note what this does *not* do: it never clears the tenant. The list is
    // only validated against a freshly loaded list, never against a cache.
    useTenantStore.setState({
      environment,
      tenantId: storedTenantId || null,
      publicTenants,
      manualTenants,
      tenants: mergeTenants(publicTenants, manualTenants),
      isHydrated: true,
    });
  } catch (error) {
    logger.error("Tenant store hydration failed:", error);
    useTenantStore.setState({ isHydrated: true });
  }
}

/**
 * Memoised: the first caller does the work and every later caller awaits the
 * same promise. The readers below call it themselves, so an action firing
 * before the provider's bootstrap blocks on hydration instead of silently
 * resolving to the `dev` default.
 */
export function hydrateTenantStore(): Promise<void> {
  hydration ??= doHydrate();
  return hydration;
}

export async function getStoredEnvironment(): Promise<AppEnvironment> {
  await hydrateTenantStore();
  return useTenantStore.getState().environment;
}

export async function getStoredTenantId(): Promise<string | null> {
  await hydrateTenantStore();
  return useTenantStore.getState().tenantId;
}

/** Active gateway base URL. The actions layer resolves every request through this. */
export async function getGatewayUrl(): Promise<string> {
  return ENVIRONMENT_URLS[await getStoredEnvironment()];
}

export default useTenantStore;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest src/store/__tests__/tenant.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 6: Correct the stale testing claim in AGENTS.md**

Replace the first two bullets of the `## Testing` section (`AGENTS.md:31-32`):

```markdown
- This project does not currently have an automated test suite.
- Before every PR, manually verify that the app builds and runs correctly on both Android and iOS:
```

with:

```markdown
- Run the automated suite with `npm test` (Jest + `jest-expo`). Zero failing tests before a PR.
- Also manually verify that the app builds and runs correctly on both Android and iOS:
```

And delete the now-contradictory last bullet of that section:

```markdown
- When an automated test suite is added, run it in full before every PR with zero failing tests allowed.
```

- [ ] **Step 7: Typecheck and run the whole suite**

Run: `npx tsc --noEmit && npx jest`
Expected: no typecheck output; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/store/tenant.ts src/store/__tests__/tenant.test.ts src/utils/environment.ts AGENTS.md
git commit -m "feat(tenant): add a store owning environment and tenant selection"
```

---

### Task 3: Tenant list loading

The only module importing both the store and the actions layer, which keeps the store free of any dependency on `src/actions/**` and the dependency graph acyclic.

**Files:**
- Create: `src/store/loadTenants.ts`
- Test: `src/store/__tests__/loadTenants.test.ts`

**Interfaces:**
- Consumes: `getPublicTenants()` from `@/actions/SaasService/actions`; `useTenantStore` (default) from `./tenant`; `isCacheFresh`, `readTenantCache`, `writeTenantCache` from `./tenantCache`.
- Produces: `loadTenants(opts?: { force?: boolean }): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `src/store/__tests__/loadTenants.test.ts`:

```ts
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

const getPublicTenants = jest.fn();
jest.mock("@/actions/SaasService/actions", () => ({
  getPublicTenants: () => getPublicTenants(),
}));

const ACME = { id: "acme-id", name: "Acme Duty Free" };
const OTHER = { id: "other-id", name: "Other Retail" };

async function loadModules(seed: Record<string, string> = {}) {
  jest.resetModules();
  getPublicTenants.mockReset();
  const AsyncStorage = (
    await import("@react-native-async-storage/async-storage")
  ).default;
  await AsyncStorage.clear();
  for (const [key, value] of Object.entries(seed)) {
    await AsyncStorage.setItem(key, value);
  }
  const store = await import("@/store/tenant");
  const { loadTenants } = await import("@/store/loadTenants");
  await store.hydrateTenantStore();
  return { store, loadTenants, AsyncStorage };
}

describe("loadTenants", () => {
  it("fetches, maps and caches the list", async () => {
    const { store, loadTenants, AsyncStorage } = await loadModules();
    getPublicTenants.mockResolvedValue({ items: [ACME, OTHER] });

    await loadTenants();

    expect(store.default.getState().tenants).toEqual([ACME, OTHER]);
    expect(store.default.getState().status).toBe("ready");
    expect(await AsyncStorage.getItem("public_tenants_cache_v2:dev")).toContain(
      ACME.id,
    );
  });

  it("drops items with a missing id or name", async () => {
    const { store, loadTenants } = await loadModules();
    getPublicTenants.mockResolvedValue({
      items: [ACME, { id: null, name: "Broken" }, { id: "x" }],
    });

    await loadTenants();

    expect(store.default.getState().tenants).toEqual([ACME]);
  });

  it("serves a fresh cache without hitting the network", async () => {
    const { store, loadTenants } = await loadModules({
      "public_tenants_cache_v2:dev": JSON.stringify({
        timestamp: Date.now(),
        items: [ACME],
        manual: [],
      }),
    });

    await loadTenants();

    expect(getPublicTenants).not.toHaveBeenCalled();
    expect(store.default.getState().tenants).toEqual([ACME]);
  });

  it("refetches when the cache is stale", async () => {
    const { loadTenants } = await loadModules({
      "public_tenants_cache_v2:dev": JSON.stringify({
        timestamp: 0,
        items: [ACME],
        manual: [],
      }),
    });
    getPublicTenants.mockResolvedValue({ items: [OTHER] });

    await loadTenants();

    expect(getPublicTenants).toHaveBeenCalledTimes(1);
  });

  it("refetches on force even with a fresh cache", async () => {
    const { loadTenants } = await loadModules({
      "public_tenants_cache_v2:dev": JSON.stringify({
        timestamp: Date.now(),
        items: [ACME],
        manual: [],
      }),
    });
    getPublicTenants.mockResolvedValue({ items: [OTHER] });

    await loadTenants({ force: true });

    expect(getPublicTenants).toHaveBeenCalledTimes(1);
  });

  // An offline login with a valid persisted tenant has to keep working.
  it("reports the failure without clearing the selection", async () => {
    const { store, loadTenants, AsyncStorage } = await loadModules();
    await store.default.getState().setTenantId(ACME.id);
    getPublicTenants.mockRejectedValue(new Error("offline"));

    await loadTenants();

    expect(store.default.getState().status).toBe("error");
    expect(store.default.getState().errorCode).toBe("loadFailed");
    expect(store.default.getState().tenantId).toBe(ACME.id);
    expect(await AsyncStorage.getItem("debug_tenantId")).toBe(ACME.id);
  });

  it("treats a null response as a failure", async () => {
    const { store, loadTenants } = await loadModules();
    getPublicTenants.mockResolvedValue(null);

    await loadTenants();

    expect(store.default.getState().status).toBe("error");
    expect(store.default.getState().tenants).toEqual([]);
  });

  // A list fetched against the previous gateway must never land on the new one.
  it("discards a result whose environment is no longer active", async () => {
    const { store, loadTenants } = await loadModules();
    let release: (value: { items: { id: string; name: string }[] }) => void =
      () => {};
    getPublicTenants.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    const inFlight = loadTenants({ force: true });
    await store.default.getState().setEnvironment("live");
    release({ items: [ACME] });
    await inFlight;

    expect(store.default.getState().tenants).toEqual([]);
    expect(store.default.getState().environment).toBe("live");
  });

  it("keeps a manual tenant in the cache it writes", async () => {
    const { loadTenants, AsyncStorage, store } = await loadModules();
    await store.default.getState().addManualTenant(OTHER);
    getPublicTenants.mockResolvedValue({ items: [ACME] });

    await loadTenants({ force: true });

    const cached = await AsyncStorage.getItem("public_tenants_cache_v2:dev");
    expect(cached).toContain(OTHER.id);
    expect(store.default.getState().tenants).toEqual([ACME, OTHER]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/store/__tests__/loadTenants.test.ts`
Expected: FAIL — `Cannot find module '@/store/loadTenants'`.

- [ ] **Step 3: Write the implementation**

Create `src/store/loadTenants.ts`:

```ts
import { getPublicTenants } from "@/actions/SaasService/actions";
import { logger } from "@/utils/logger";
import useTenantStore from "./tenant";
import type { TenantOption } from "./tenant.types";
import { isCacheFresh, readTenantCache, writeTenantCache } from "./tenantCache";

/**
 * Loads the tenant list for the active environment.
 *
 * Lives outside the store so the store never imports `src/actions/**` — the
 * actions layer reads the store for the tenant header, and a cycle there would
 * leave module-level bindings undefined at startup.
 *
 * Cache-first by default; `force` always refetches (the refresh button, and
 * every environment switch).
 */
export async function loadTenants(opts?: { force?: boolean }): Promise<void> {
  const environment = useTenantStore.getState().environment;

  if (!opts?.force) {
    const cached = await readTenantCache(environment);
    if (cached && isCacheFresh(cached, Date.now())) {
      useTenantStore.getState().setTenants(cached.items);
      return;
    }
  }

  useTenantStore.getState().setStatus("loading");

  try {
    const result = await getPublicTenants();
    // The environment can change while this is in flight.
    if (useTenantStore.getState().environment !== environment) {
      return;
    }
    if (!result) {
      throw new Error("Empty tenants response");
    }

    const items: TenantOption[] = (result.items ?? [])
      .filter(
        (item): item is { id: string; name: string } =>
          typeof item?.id === "string" && typeof item?.name === "string",
      )
      .map((item) => ({ id: item.id, name: item.name }));

    useTenantStore.getState().setTenants(items);

    const existing = await readTenantCache(environment);
    await writeTenantCache(environment, {
      timestamp: Date.now(),
      items,
      manual: existing?.manual ?? useTenantStore.getState().manualTenants,
    });
  } catch (error) {
    logger.error("Failed to load tenants:", error);
    if (useTenantStore.getState().environment !== environment) {
      return;
    }
    // Deliberately does not touch the selection: a persisted tenant has to keep
    // working when the list cannot be fetched.
    useTenantStore.getState().setStatus("error", "loadFailed");
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/store/__tests__/loadTenants.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Typecheck and run the whole suite**

Run: `npx tsc --noEmit && npx jest`
Expected: no typecheck output; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/store/loadTenants.ts src/store/__tests__/loadTenants.test.ts
git commit -m "feat(tenant): load the tenant list cache-first per environment"
```

---

### Task 4: Selector helpers and components

Pure helpers first (testable without providers), then the field, the modal and the shared environment chips.

**Files:**
- Create: `src/components/TenantInput/tenantList.ts`
- Create: `src/components/TenantInput/TenantInput.tsx`
- Create: `src/components/TenantInput/TenantSelectionModal.tsx`
- Create: `src/components/EnvironmentChips.tsx`
- Test: `src/components/TenantInput/__tests__/tenantList.test.ts`

**Interfaces:**
- Consumes: `useTenantStore` (default), `type TenantErrorCode` from `@/store/tenant`; `loadTenants` from `@/store/loadTenants`; `TenantOption` from `@/store/tenant.types`; `Input`, `Ionicons`, `Button`, `cn`, `useLocalization`; `APP_ENVIRONMENTS` from `@/utils/environment`; `FlashList` from `@shopify/flash-list`.
- Produces:
  - `isInternalTenant(name: string): boolean`
  - `resolveTenantName(tenants: TenantOption[], tenantId: string | null): string | null`
  - `filterTenants(tenants, opts: { query: string; includeInternal: boolean; selectedId?: string | null }): TenantOption[]`
  - `TENANT_ERROR_KEYS: Record<TenantErrorCode, string>`
  - `<TenantInput includeInternal?: boolean />`
  - `<TenantSelectionModal visible onClose includeInternal />`
  - `<EnvironmentChips />`

- [ ] **Step 1: Write the failing test for the helpers**

Create `src/components/TenantInput/__tests__/tenantList.test.ts`:

```ts
import {
  filterTenants,
  isInternalTenant,
  resolveTenantName,
} from "@/components/TenantInput/tenantList";

const ACME = { id: "acme-id", name: "Acme Duty Free" };
const RETAIL = { id: "retail-id", name: "Acme Travel Retail" };
const E2E = { id: "e2e-id", name: "e2e-fixture" };
const MANUAL = { id: "manual-id", name: "manual-smoke" };

describe("isInternalTenant", () => {
  it("flags the test-run tenants", () => {
    expect(isInternalTenant("e2e-fixture")).toBe(true);
    expect(isInternalTenant("manual-smoke")).toBe(true);
    expect(isInternalTenant("manuals")).toBe(true);
    expect(isInternalTenant("E2E-Uppercase")).toBe(true);
  });

  it("leaves real tenants alone", () => {
    expect(isInternalTenant("Acme Duty Free")).toBe(false);
  });
});

describe("resolveTenantName", () => {
  it("resolves a selected id to its name", () => {
    expect(resolveTenantName([ACME, RETAIL], ACME.id)).toBe(ACME.name);
  });

  it("returns null for no selection or an unknown id", () => {
    expect(resolveTenantName([ACME], null)).toBeNull();
    expect(resolveTenantName([ACME], "ghost-id")).toBeNull();
  });
});

describe("filterTenants", () => {
  const all = [ACME, RETAIL, E2E, MANUAL];

  it("hides internal tenants by default", () => {
    expect(
      filterTenants(all, { query: "", includeInternal: false }),
    ).toEqual([ACME, RETAIL]);
  });

  it("includes them when asked", () => {
    expect(filterTenants(all, { query: "", includeInternal: true })).toEqual(
      all,
    );
  });

  // `includes`, not `startsWith`: the country modal's prefix match would miss
  // this, and tenant names are long.
  it("matches anywhere in the name, case-insensitively", () => {
    expect(
      filterTenants(all, { query: "retail", includeInternal: false }),
    ).toEqual([RETAIL]);
    expect(
      filterTenants(all, { query: "ACME", includeInternal: false }),
    ).toEqual([ACME, RETAIL]);
  });

  it("ignores surrounding whitespace in the query", () => {
    expect(
      filterTenants(all, { query: "  retail  ", includeInternal: false }),
    ).toEqual([RETAIL]);
  });

  // Otherwise a tenant chosen in the debug menu would be selected yet absent
  // from the login list — the UI contradicting the state again.
  it("keeps a selected internal tenant visible", () => {
    expect(
      filterTenants(all, {
        query: "",
        includeInternal: false,
        selectedId: E2E.id,
      }),
    ).toEqual([ACME, RETAIL, E2E]);
  });

  it("still applies the query to a selected tenant", () => {
    expect(
      filterTenants(all, {
        query: "retail",
        includeInternal: false,
        selectedId: E2E.id,
      }),
    ).toEqual([RETAIL]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/components/TenantInput/__tests__/tenantList.test.ts`
Expected: FAIL — `Cannot find module '@/components/TenantInput/tenantList'`.

- [ ] **Step 3: Write the helpers**

Create `src/components/TenantInput/tenantList.ts`:

```ts
import type { TenantErrorCode } from "@/store/tenant";
import type { TenantOption } from "@/store/tenant.types";

/**
 * Tenants that exist only for automated and manual test runs. They are hidden
 * from the login screen's list but never removed from the store, so a tenant
 * deliberately chosen in the debug menu still resolves to its name.
 */
const INTERNAL_NAME_PATTERNS = ["e2e", "manual-", "manuals"];

export function isInternalTenant(name: string): boolean {
  const lower = name.toLowerCase();
  return INTERNAL_NAME_PATTERNS.some((pattern) => lower.includes(pattern));
}

/** The name for a selection, or `null` when there is nothing to display. */
export function resolveTenantName(
  tenants: TenantOption[],
  tenantId: string | null,
): string | null {
  if (!tenantId) {
    return null;
  }
  return tenants.find((tenant) => tenant.id === tenantId)?.name ?? null;
}

export function filterTenants(
  tenants: TenantOption[],
  opts: {
    query: string;
    includeInternal: boolean;
    selectedId?: string | null;
  },
): TenantOption[] {
  const query = opts.query.trim().toLowerCase();

  return tenants.filter((tenant) => {
    const hiddenAsInternal =
      !opts.includeInternal &&
      isInternalTenant(tenant.name) &&
      tenant.id !== opts.selectedId;
    if (hiddenAsInternal) {
      return false;
    }
    // `includes`, not `startsWith`: "retail" must match "Acme Travel Retail".
    return query.length === 0 || tenant.name.toLowerCase().includes(query);
  });
}

/** The store reports codes; the UI owns the wording. */
export const TENANT_ERROR_KEYS: Record<TenantErrorCode, string> = {
  loadFailed: "MobileApp.TenantSelection.LoadFailed",
  selectionUnavailable: "MobileApp.TenantSelection.SelectionUnavailable",
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/components/TenantInput/__tests__/tenantList.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Write the selection modal**

Create `src/components/TenantInput/TenantSelectionModal.tsx`. It follows `SearchMerchant.tsx` (full-screen slide-up `Modal`, semantic theme tokens) with client-side filtering over the store's list:

```tsx
import Button from "@/components/Button";
import Input from "@/components/Input";
import { Ionicons } from "@/components/Ionicons";
import { useLocalization } from "@/providers/LocalizationProvider";
import { loadTenants } from "@/store/loadTenants";
import useTenantStore from "@/store/tenant";
import type { TenantOption } from "@/store/tenant.types";
import { FlashList } from "@shopify/flash-list";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";
import { filterTenants, TENANT_ERROR_KEYS } from "./tenantList";

/**
 * Searchable tenant list. A full-screen slide-up `Modal` rather than a
 * `@gorhom/bottom-sheet`: every sheet in this app holds short static content,
 * and a `FlashList` plus keyboard inside a detached sheet fights the sheet
 * height. Sibling of `SearchMerchant` / `CountrySelectionModal`.
 */
export function TenantSelectionModal({
  visible,
  onClose,
  includeInternal,
}: {
  visible: boolean;
  onClose: () => void;
  includeInternal: boolean;
}) {
  const { t } = useLocalization();
  const [query, setQuery] = useState("");
  const tenants = useTenantStore((state) => state.tenants);
  const tenantId = useTenantStore((state) => state.tenantId);
  const status = useTenantStore((state) => state.status);
  const errorCode = useTenantStore((state) => state.errorCode);
  const setTenantId = useTenantStore((state) => state.setTenantId);
  const environment = useTenantStore((state) => state.environment);

  // The list belongs to one environment. If that changes underneath, this view
  // is stale, so close instead of showing another gateway's tenants. The ref
  // holds the mount value so this cannot fire on mount — the bug this whole
  // change is fixing.
  const mountedEnvironment = useRef(environment);
  useEffect(() => {
    if (mountedEnvironment.current !== environment) {
      onClose();
    }
  }, [environment, onClose]);

  const rows = useMemo(
    () => filterTenants(tenants, { query, includeInternal, selectedId: tenantId }),
    [tenants, query, includeInternal, tenantId],
  );

  const isLoading = status === "loading";

  async function select(tenant: TenantOption) {
    await setTenantId(tenant.id);
    setQuery("");
    onClose();
  }

  if (!visible) {
    return null;
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-background p-4 gap-3">
        <View className="flex-row items-center justify-between">
          <Text className="text-lg font-bold text-foreground">
            {t("MobileApp.TenantSelection.Title")}
          </Text>
          <View className="flex-row items-center gap-4">
            <Pressable
              onPress={() => loadTenants({ force: true })}
              disabled={isLoading}
              hitSlop={12}
              accessibilityLabel={t("MobileApp.TenantSelection.Refresh")}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#2563EB" />
              ) : (
                <Ionicons name="refresh" size={22} color="#2563EB" />
              )}
            </Pressable>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color="#374151" />
            </Pressable>
          </View>
        </View>

        <Input
          title={t("MobileApp.TenantSelection.Search")}
          iconName="search-outline"
          value={query}
          onChangeText={setQuery}
          placeholder={t("MobileApp.TenantSelection.Search")}
          autoCapitalize="none"
        />

        {errorCode === "loadFailed" && (
          <View className="gap-2">
            <Text className="text-center text-red-500 text-sm">
              {t(TENANT_ERROR_KEYS.loadFailed)}
            </Text>
            <Button
              action={{
                onPress: () => loadTenants({ force: true }),
                label: t("MobileApp.TenantSelection.Retry"),
              }}
              isLoading={isLoading}
            />
          </View>
        )}

        {isLoading && tenants.length === 0 && (
          <ActivityIndicator className="mt-6" size="large" color="#2563EB" />
        )}

        {!isLoading && rows.length === 0 && (
          <Text className="mt-6 text-center text-sm text-muted">
            {query.trim().length > 0
              ? t("MobileApp.TenantSelection.NoMatch", { query: query.trim() })
              : t("MobileApp.TenantSelection.Empty")}
          </Text>
        )}

        {rows.length > 0 && (
          <FlashList
            data={rows}
            keyExtractor={(item: TenantOption) => item.id}
            renderItem={({ item }: { item: TenantOption }) => (
              <Pressable
                onPress={() => select(item)}
                className="flex-row items-center justify-between border-b border-gray-200 py-3"
              >
                <Text className="flex-1 text-base text-foreground">
                  {item.name}
                </Text>
                {item.id === tenantId && (
                  <Ionicons name="checkmark" size={20} color="#16A34A" />
                )}
              </Pressable>
            )}
          />
        )}
      </View>
    </Modal>
  );
}
```

- [ ] **Step 6: Write the field**

Create `src/components/TenantInput/TenantInput.tsx`:

```tsx
import { Ionicons } from "@/components/Ionicons";
import { useLocalization } from "@/providers/LocalizationProvider";
import { loadTenants } from "@/store/loadTenants";
import useTenantStore from "@/store/tenant";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { resolveTenantName, TENANT_ERROR_KEYS } from "./tenantList";
import { TenantSelectionModal } from "./TenantSelectionModal";

/**
 * Tenant selector. Renders the selected tenant's *name*, resolved from the
 * store's list — never an id — so it cannot display one tenant while the
 * request sends another. Pass `includeInternal` in the debug menu to list the
 * `e2e` / `manual-` tenants too.
 */
export function TenantInput({
  includeInternal = false,
}: {
  includeInternal?: boolean;
}) {
  const { t } = useLocalization();
  const [modalVisible, setModalVisible] = useState(false);
  const tenants = useTenantStore((state) => state.tenants);
  const tenantId = useTenantStore((state) => state.tenantId);
  const errorCode = useTenantStore((state) => state.errorCode);

  // One-time load once a selector is actually on screen. `SessionProvider` used
  // to fetch this on every launch, including for signed-in users who never see
  // a selector.
  useEffect(() => {
    loadTenants();
  }, []);

  const selectedName = resolveTenantName(tenants, tenantId);

  return (
    <View className="mb-3">
      <Text className="text-lg font-bold text-gray-900 mb-2">
        {t("MobileApp.Auth.Staff.Tenant")}
      </Text>
      <Pressable
        onPress={() => setModalVisible(true)}
        className="bg-white border-gray-400 rounded-2xl border flex-row items-center px-3"
      >
        <Ionicons name="business-outline" size={24} color="#9CA3AF" />
        <Text className="flex-1 text-gray-900 py-4 pl-4">
          {selectedName ?? t("MobileApp.TenantSelection.Placeholder")}
        </Text>
        <Ionicons name="chevron-down-outline" size={16} color="#9CA3AF" />
      </Pressable>

      {errorCode && (
        <Text className="text-sm text-red-600 mt-2">
          {t(TENANT_ERROR_KEYS[errorCode])}
        </Text>
      )}

      <TenantSelectionModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        includeInternal={includeInternal}
      />
    </View>
  );
}
```

- [ ] **Step 7: Write the environment chips**

Create `src/components/EnvironmentChips.tsx`:

```tsx
import { useLocalization } from "@/providers/LocalizationProvider";
import { loadTenants } from "@/store/loadTenants";
import useTenantStore from "@/store/tenant";
import { cn } from "@/utils/cn";
import { APP_ENVIRONMENTS } from "@/utils/environment";
import { Pressable, Text, View } from "react-native";

/**
 * Environment switch shared by the staff login screen and the debug menu, which
 * kept two divergent copies — the debug menu never offered `uat`, so a tester
 * on `uat` saw nothing selected there.
 *
 * Switching clears the tenant (in the store) and reloads the list here, at the
 * event. The previous effect-on-`environment` version also ran on cold start,
 * which is what deleted the restored selection.
 */
export function EnvironmentChips() {
  const { t } = useLocalization();
  const environment = useTenantStore((state) => state.environment);
  const setEnvironment = useTenantStore((state) => state.setEnvironment);

  return (
    <View className="mb-3">
      <Text className="text-lg font-bold text-gray-900 mb-2">
        {t("MobileApp.Auth.Staff.Environment")}
      </Text>
      <View className="flex-row gap-2">
        {APP_ENVIRONMENTS.map((env) => {
          const active = environment === env;
          return (
            <Pressable
              key={env}
              onPress={async () => {
                if (active) {
                  return;
                }
                await setEnvironment(env);
                await loadTenants({ force: true });
              }}
              className={cn(
                "px-2 py-1 rounded-md border items-center",
                active
                  ? "bg-green-50 border-green-500"
                  : "bg-white border-gray-400",
              )}
            >
              <Text
                className={cn(
                  "font-semibold uppercase",
                  active ? "text-green-600" : "text-gray-700",
                )}
              >
                {env}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
```

- [ ] **Step 8: Typecheck and run the whole suite**

Run: `npx tsc --noEmit && npx jest`
Expected: no typecheck output; all tests pass. The new components are not yet rendered anywhere, so nothing else changes.

- [ ] **Step 9: Commit**

```bash
git add src/components/TenantInput src/components/EnvironmentChips.tsx
git commit -m "feat(tenant): add a searchable tenant selector and shared environment chips"
```

---

### Task 5: Staff login screen

Replaces the `Picker` block, requires a tenant, and adds the i18n keys the new components read.

**Files:**
- Modify: `src/screens/shared/StaffLoginScreen.tsx`
- Modify: `src/localization/resources/en-US.json`
- Modify: `src/localization/resources/tr-TR.json`

**Interfaces:**
- Consumes: `<EnvironmentChips />`, `<TenantInput />`, `useTenantStore` from `@/store/tenant`.
- Produces: nothing new. `useSession()` is now used only for `signIn`.

- [ ] **Step 1: Add the English keys**

In `src/localization/resources/en-US.json`, extend `Auth.Staff` (which currently holds only `Title` and `Description`):

```json
    "Staff": {
      "Title": "Staff Login",
      "Description": "Sign in with your organization credentials.",
      "Environment": "Environment",
      "Tenant": "Tenant"
    },
```

and add a new top-level `TenantSelection` block next to `CountrySelection`:

```json
  "TenantSelection": {
    "Title": "Select tenant",
    "Placeholder": "Select a tenant",
    "Search": "Search tenants",
    "Empty": "No tenants available for this environment.",
    "NoMatch": "No tenant matches \"{query}\".",
    "LoadFailed": "Couldn't load tenants. Check your connection and try again.",
    "SelectionUnavailable": "Your saved tenant isn't available in this environment. Pick another one.",
    "Retry": "Try again",
    "Refresh": "Refresh"
  },
```

- [ ] **Step 2: Add the Turkish keys**

In `src/localization/resources/tr-TR.json`, extend `Auth.Staff`:

```json
    "Staff": {
      "Title": "Personel Girişi",
      "Description": "Kurumsal kimlik bilgilerinizle giriş yapın.",
      "Environment": "Ortam",
      "Tenant": "Kiracı"
    },
```

and add:

```json
  "TenantSelection": {
    "Title": "Kiracı seçin",
    "Placeholder": "Bir kiracı seçin",
    "Search": "Kiracı ara",
    "Empty": "Bu ortam için kiracı bulunamadı.",
    "NoMatch": "\"{query}\" ile eşleşen kiracı yok.",
    "LoadFailed": "Kiracılar yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.",
    "SelectionUnavailable": "Kayıtlı kiracınız bu ortamda kullanılamıyor. Başka bir kiracı seçin.",
    "Retry": "Tekrar dene",
    "Refresh": "Yenile"
  },
```

- [ ] **Step 3: Regenerate the language bundles**

Run: `npm run init`
Expected: `src/data/language-data/en-US.gen.json` and `tr-TR.gen.json` updated, with the new keys present under `MobileApp`.

This step fetches backend resources, so it needs network access. If it fails, stop and report — do not hand-edit the `.gen.json` files.

Verify: `grep -c "Select tenant" src/data/language-data/en-US.gen.json` → at least 1.

- [ ] **Step 4: Replace the imports and the session hook usage**

In `src/screens/shared/StaffLoginScreen.tsx`, replace lines 1-13:

```tsx
import AppVersion from "@/components/AppVersion";
import Button from "@/components/Button";
import Input from "@/components/Input";
import { Ionicons } from "@/components/Ionicons";
import { useLocalization } from "@/providers/LocalizationProvider";
import { useSession } from "@/providers/SessionProvider";
import { ModalTemplate } from "@/templates/Modal";
import { cn } from "@/utils/cn";
import { APP_ENVIRONMENTS } from "@/utils/environment";
import { Picker } from "@react-native-picker/picker";
import { Link, router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
```

with:

```tsx
import AppVersion from "@/components/AppVersion";
import Button from "@/components/Button";
import { EnvironmentChips } from "@/components/EnvironmentChips";
import Input from "@/components/Input";
import { Ionicons } from "@/components/Ionicons";
import { TenantInput } from "@/components/TenantInput/TenantInput";
import { useLocalization } from "@/providers/LocalizationProvider";
import { useSession } from "@/providers/SessionProvider";
import useTenantStore from "@/store/tenant";
import { ModalTemplate } from "@/templates/Modal";
import { cn } from "@/utils/cn";
import { Link, router } from "expo-router";
import { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
```

- [ ] **Step 5: Require a tenant**

Replace lines 22-42 (the `useSession()` destructure through `isSubmitDisabled`):

```tsx
  const {
    signIn,
    environment,
    setEnvironment,
    tenantId,
    setTenantId,
    tenants,
    isLoadingTenants,
    tenantError,
    refreshTenants,
  } = useSession();
  const { t } = useLocalization();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [clickCount, setClickCount] = useState(0);

  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const isSubmitDisabled =
    emailInput.length === 0 || passwordInput.length === 0;
```

with:

```tsx
  const { signIn } = useSession();
  const { t } = useLocalization();
  const tenantId = useTenantStore((state) => state.tenantId);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [clickCount, setClickCount] = useState(0);

  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  // Staff accounts are provisioned per tenant, so a tenant-less staff login
  // can only fail — the traveller screen is the tenant-less path.
  const isSubmitDisabled =
    !tenantId || emailInput.length === 0 || passwordInput.length === 0;
```

- [ ] **Step 6: Replace the environment and tenant blocks**

Delete one contiguous run of JSX: it starts at the `<View className="mb-3">` whose first child is `<Text ...>Environment</Text>`, and ends at the `</View>` that closes the block containing `{tenantError && (`. In the original file that is lines 85-167 — everything between the logo `</Pressable>` and the first `<Input placeholder={t("MobileApp.Auth.Login.Email")}`.

Put in its place:

```tsx
      <EnvironmentChips />
      <TenantInput />
```

Verify afterwards that `Picker`, `APP_ENVIRONMENTS`, `ActivityIndicator`, `tenants`, `isLoadingTenants`, `tenantError` and `refreshTenants` no longer appear anywhere in the file:

```bash
grep -nE "Picker|APP_ENVIRONMENTS|ActivityIndicator|isLoadingTenants|tenantError|refreshTenants" src/screens/shared/StaffLoginScreen.tsx || echo "clean"
```

- [ ] **Step 7: Typecheck, lint and run the suite**

Run: `npx tsc --noEmit && npx eslint src/screens/shared/StaffLoginScreen.tsx && npx jest`
Expected: no output from the first two; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/screens/shared/StaffLoginScreen.tsx src/localization src/data/language-data
git commit -m "feat(auth): require a tenant and select it by name on staff login"
```

---

### Task 6: Debug menu and traveller login

The last two consumers of the old context fields.

**Files:**
- Modify: `src/app/(modals)/debug-menu.tsx`
- Modify: `src/screens/traveller/TravellerLoginScreen.tsx`

**Interfaces:**
- Consumes: `<EnvironmentChips />`, `<TenantInput includeInternal />`, `useTenantStore`, `getTenantByNameApi`.
- Produces: nothing new.

- [ ] **Step 1: Rewrite the debug menu**

Replace the entire contents of `src/app/(modals)/debug-menu.tsx` with:

```tsx
import { getTenantByNameApi } from "@/actions/auth/actions";
import { EnvironmentChips } from "@/components/EnvironmentChips";
import Input from "@/components/Input";
import { TenantInput } from "@/components/TenantInput/TenantInput";
import useTenantStore from "@/store/tenant";
import { ModalTemplate } from "@/templates/Modal";
import { logger } from "@/utils/logger";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

/**
 * Developer settings. Both controls are the same shared components the staff
 * login screen uses, reading the same store — this screen used to keep its own
 * copy of the environment and tenant state, offered only `live` and `dev`, and
 * claimed the selections reset on restart (they persist).
 *
 * The by-name lookup stays: it is the only way to reach a tenant the public
 * tenants endpoint does not return, including the `e2e` / `manual-` ones.
 */
export default function DebugMenu() {
  const addManualTenant = useTenantStore((state) => state.addManualTenant);
  const [tenantName, setTenantName] = useState("");
  const [isLoadingTenant, setIsLoadingTenant] = useState(false);
  const [tenantError, setTenantError] = useState("");

  async function handleFetchTenant() {
    const name = tenantName.trim();
    if (!name) {
      setTenantError("Please enter a tenant name");
      return;
    }

    setIsLoadingTenant(true);
    setTenantError("");
    try {
      const response = await getTenantByNameApi(name);
      if (response?.success && response.tenantId) {
        // Merged into the store's list, so it displays by name, survives a
        // forced refresh, and is not dropped by list validation.
        await addManualTenant({
          id: response.tenantId,
          name: response.name || name,
        });
        setTenantName("");
        return;
      }
      setTenantError("Tenant not found");
    } catch (error) {
      logger.error("Failed to fetch tenant", error);
      setTenantError("Failed to fetch tenant");
    } finally {
      setIsLoadingTenant(false);
    }
  }

  return (
    <ModalTemplate title="Debug Menu">
      <View className="mt-4">
        <EnvironmentChips />
        <TenantInput includeInternal />

        <View className="mt-4 p-4 bg-white rounded-lg border-2 border-blue-200">
          <Text className="text-base font-semibold mb-3">
            Resolve a tenant by name
          </Text>
          <Text className="text-sm text-gray-600 mb-3">
            For tenants the public list does not return.
          </Text>

          <Input
            value={tenantName}
            onChangeText={(text) => {
              setTenantName(text);
              setTenantError("");
            }}
            iconName="globe-outline"
            title="Tenant name"
            autoCapitalize="none"
            className="mb-3"
          />

          {tenantError !== "" && (
            <Text className="text-sm text-red-600 mb-3">{tenantError}</Text>
          )}

          <Pressable
            onPress={handleFetchTenant}
            disabled={isLoadingTenant}
            className="bg-blue-500 p-2"
          >
            {isLoadingTenant ? (
              <View className="flex-row items-center justify-center">
                <ActivityIndicator color="white" size="small" />
                <Text className="text-white ml-2">Loading...</Text>
              </View>
            ) : (
              <Text className="text-white text-center">Fetch Tenant</Text>
            )}
          </Pressable>
        </View>

        <View className="mt-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
          <Text className="text-sm text-yellow-800">
            ℹ️ The environment persists across restarts. The tenant is cleared on
            logout.
          </Text>
        </View>
      </View>
    </ModalTemplate>
  );
}
```

This screen is developer-only and its strings were never translated; leaving them in English is deliberate and consistent with the existing file.

- [ ] **Step 2: Clear the tenant through the store on traveller login**

In `src/screens/traveller/TravellerLoginScreen.tsx`, replace line 12:

```tsx
import { setStoredTenantId } from "@/utils/environment";
```

with:

```tsx
import useTenantStore from "@/store/tenant";
```

and replace lines 44-46:

```tsx
      // Travellers sign in without a tenant — clear any tenant a previous staff
      // session may have persisted so it doesn't leak into the token request.
      await setStoredTenantId("");
```

with:

```tsx
      // Travellers sign in without a tenant — clear any tenant a previous staff
      // session persisted so it cannot leak into the token request. Going
      // through the store clears the UI state too, so a staff tenant can't
      // linger on screen afterwards.
      await useTenantStore.getState().setTenantId(null);
```

- [ ] **Step 3: Typecheck, lint and run the suite**

Run: `npx tsc --noEmit && npx eslint "src/app/(modals)/debug-menu.tsx" src/screens/traveller/TravellerLoginScreen.tsx && npx jest`
Expected: no output from the first two; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(modals)/debug-menu.tsx" src/screens/traveller/TravellerLoginScreen.tsx
git commit -m "refactor(tenant): point the debug menu and traveller login at the store"
```

---

### Task 7: SessionProvider

The reported bug's fix. Removes the duplicated state, awaits hydration before any API call, and replaces `AsyncStorage.clear()` with explicit resets.

**Files:**
- Modify: `src/providers/SessionProvider.tsx`
- Modify: `src/screens/shared/Profile/_components/DeleteAccountModal.tsx:25`

**Interfaces:**
- Consumes: `hydrateTenantStore`, `useTenantStore` from `@/store/tenant`.
- Produces: `useSession()` context narrowed to `{ signIn, signInWithDidit, signOut, session, isLoading, fetchNewAccessToken }`, with `signOut: () => Promise<void>`.

- [ ] **Step 1: Narrow the context type and default value**

In `src/providers/SessionProvider.tsx`, replace the `AuthContext` declaration (lines 51-81) with:

```tsx
const AuthContext = createContext<{
  signIn: (email: string, password: string) => Promise<string | undefined>;
  signInWithDidit: (sessionId: string) => Promise<void>;
  signOut: () => Promise<void>;
  session?: string | null;
  isLoading: boolean;
  fetchNewAccessToken: () => Promise<boolean | null>;
}>({
  signIn: () => new Promise(() => ""),
  signInWithDidit: () => new Promise(() => {}),
  signOut: async () => undefined,
  session: null,
  isLoading: false,
  fetchNewAccessToken: async () => null,
});
```

Also delete the now-unused `TenantOption` type and the two cache constants (lines 43-49), and the `type Environment = AppEnvironment;` alias (line 41).

- [ ] **Step 2: Replace the imports**

Replace lines 9 and 22-28:

```tsx
import { getPublicTenants } from "@/actions/SaasService/actions";
```

```tsx
import {
  DEFAULT_ENVIRONMENT,
  getStoredEnvironment,
  setStoredEnvironment,
  type AppEnvironment,
} from "@/utils/environment";
import AsyncStorage from "@react-native-async-storage/async-storage";
```

with (dropping the `getPublicTenants`, environment and AsyncStorage imports entirely):

```tsx
import useTenantStore, { hydrateTenantStore } from "@/store/tenant";
```

Keep `import { clearRolePreference } from "@/utils/rolePreference";`. Add `import { logger } from "@/utils/logger";` if it is not already imported.

- [ ] **Step 3: Delete the selection state and its two effects**

Remove these, all inside `SessionProvider`:
- the `environment`, `tenantId`, `tenants`, `isLoadingTenants`, `tenantError` `useState` declarations (lines 96-101)
- `setEnvironment` (lines 138-141), `setTenantId` (lines 143-146), `refreshTenants` (lines 148-174)
- the tenants-cache effect (lines 176-205)
- the `didInitEnvRef` effect (lines 207-218) — this is root cause 2
- the `useRef` import if nothing else uses it

- [ ] **Step 4: Gate the bootstrap on hydration**

Replace the bootstrap effect (lines 107-136) with:

```tsx
  // Hydration first, and awaited: `getGatewayUrl()` and `getStoredTenantId()`
  // now read the tenant store, so any API call made before it settles would
  // silently target the default `dev` gateway with no tenant.
  useEffect(() => {
    hydrateTenantStore()
      .then(async () => {
        const accessToken = await getToken("access");
        setAccessToken(accessToken ?? null);
        if (!accessToken) {
          return;
        }
        const timeout = new Promise<void>((resolve) =>
          setTimeout(resolve, 8000),
        );
        await Promise.race([getUserData(accessToken), timeout]);
      })
      .catch((error) => {
        logger.error("Session bootstrap failed:", error);
      })
      .finally(() => {
        setIsAccessTokenLoading(false);
      });
  }, []);
```

- [ ] **Step 5: Replace the logout**

Replace `signOut` (lines 335-344) with:

```tsx
  const signOut = useCallback(async () => {
    // State first: `session` fed the stale token to consumers after logout,
    // and `clearUser` is what flips the route guards.
    setAccessToken(null);
    clearUser();
    clearCountrySettings();

    // Only what logout owns, and awaited. `AsyncStorage.clear()` also wiped the
    // environment — which silently sent the next login to `dev` while the UI
    // still showed `live` — plus the tenants cache and the user's
    // `theme_preference` and `locale`. It left the in-memory tenant untouched,
    // which is what made the login screen show a tenant the request no longer
    // sent.
    await Promise.all([
      clearTokens(),
      clearRolePreference(),
      useTenantStore.getState().reset(),
    ]);
  }, [clearUser, clearCountrySettings]);
```

- [ ] **Step 6: Trim the context value**

Replace the `useMemo` (lines 369-401) with:

```tsx
  const contextValue = useMemo(
    () => ({
      session: accessToken,
      signIn,
      signInWithDidit,
      signOut,
      isLoading: isAccessTokenLoading,
      fetchNewAccessToken,
    }),
    [
      accessToken,
      signIn,
      signInWithDidit,
      signOut,
      isAccessTokenLoading,
      fetchNewAccessToken,
    ],
  );
```

- [ ] **Step 7: Await the logout in the delete-account flow**

In `src/screens/shared/Profile/_components/DeleteAccountModal.tsx:25`, change:

```tsx
      signOut();
```

to:

```tsx
      await signOut();
```

- [ ] **Step 8: Typecheck, lint and run the suite**

Run: `npx tsc --noEmit && npx eslint src/providers/SessionProvider.tsx && npx jest`
Expected: no output from the first two; all tests pass. A typecheck error naming `tenantId`, `environment`, `refreshTenants` or `tenants` on the session context means a consumer was missed in Tasks 5-6 — fix it there rather than restoring the field.

- [ ] **Step 9: Commit**

```bash
git add src/providers/SessionProvider.tsx src/screens/shared/Profile/_components/DeleteAccountModal.tsx
git commit -m "fix(auth): clear the tenant on logout instead of wiping AsyncStorage"
```

---

### Task 8: Reduce environment.ts to pure config

With no consumer left, the duplicated persistence comes out. This is what makes the single-owner invariant structural rather than a convention.

**Files:**
- Modify: `src/utils/environment.ts`
- Modify: `src/actions/auth/actions.ts:3`
- Modify: `src/actions/AccountService/post.ts:3`
- Modify: `.claude/rules/api-actions.md`

**Interfaces:**
- Consumes: the read API from `@/store/tenant`.
- Produces: `src/utils/environment.ts` exporting only `AppEnvironment`, `APP_ENVIRONMENTS`, `isAppEnvironment`, `DEFAULT_ENVIRONMENT`, `buildGatewayUrl`, `ENVIRONMENT_URLS`.

- [ ] **Step 1: Point the actions layer at the store**

In `src/actions/auth/actions.ts:3` and `src/actions/AccountService/post.ts:3`, change:

```ts
import { getGatewayUrl, getStoredTenantId } from "@/utils/environment";
```

to:

```ts
import { getGatewayUrl, getStoredTenantId } from "@/store/tenant";
```

`getApiUrl` in `src/actions/auth/actions.ts:8` stays `export const getApiUrl = getGatewayUrl;`. The graph is acyclic — `actions → store/tenant → utils/environment`, with `store/loadTenants` the only module bridging back to `actions` — so this module-level alias is safe.

- [ ] **Step 2: Strip the state out of environment.ts**

Delete from `src/utils/environment.ts`:
- `import AsyncStorage from "@react-native-async-storage/async-storage";` (line 1)
- `ENVIRONMENT_STORAGE_KEY` and `TENANT_STORAGE_KEY` (lines 28-29)
- `getStoredEnvironment`, `setStoredEnvironment`, `getGatewayUrl`, `getStoredTenantId`, `setStoredTenantId` (lines 76-103)

- [ ] **Step 3: Correct the module doc comment**

The header comment claims this module is the source of truth for the persisted selection, which is now false. Replace lines 4-22 with:

```ts
/**
 * Runtime API environment — pure configuration.
 *
 * `.env` configures only the shared apex domain via `EXPO_PUBLIC_GATEWAY_URL`
 * (e.g. `example.com`); the per-environment API host is built by prepending
 * that environment's subdomain prefix:
 *
 *   live → https://api.<domain>
 *   uat  → https://uat-api.<domain>
 *   dev  → https://dev-api.<domain>
 *
 * The active environment can be switched at runtime from the staff login screen
 * and the debug menu. A fresh install (no stored selection yet) defaults to
 * `dev`.
 *
 * This module holds no state. The selected environment and tenant live in
 * `src/store/tenant.ts`, which owns their persistence and exports the
 * `getStoredEnvironment` / `getStoredTenantId` / `getGatewayUrl` readers the
 * actions layer uses.
 */
```

- [ ] **Step 4: Update the api-actions rule**

In `.claude/rules/api-actions.md`, in the "Non-SDK endpoints" section, change:

```markdown
- Build base URL with `getGatewayUrl()` / `getApiUrl()` helpers
- Include tenant header when needed (`getStoredTenantId()`)
```

to:

```markdown
- Build base URL with `getGatewayUrl()` / `getApiUrl()` helpers (from `@/store/tenant`)
- Include tenant header when needed (`getStoredTenantId()` from `@/store/tenant`; it resolves `null` when no tenant is selected, and awaits store hydration so it can never answer with the default before launch settles)
```

- [ ] **Step 5: Verify nothing still imports the removed helpers**

Run: `grep -rn "setStoredTenantId\|setStoredEnvironment\|getStoredEnvironment" src/ || true`

Expected: matches only inside `src/store/tenant.ts` and `src/store/__tests__/tenant.test.ts`. Any other hit is a missed consumer.

- [ ] **Step 6: Typecheck, lint and run the suite**

Run: `npx tsc --noEmit && npx eslint . && npx jest`
Expected: no output from the first two; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/utils/environment.ts src/actions/auth/actions.ts src/actions/AccountService/post.ts .claude/rules/api-actions.md
git commit -m "refactor(tenant): reduce environment.ts to pure configuration"
```

---

### Task 9: Verification

The store tests cover the four defects in isolation; this task proves the app behaves on device, which is the only place the Picker desync and the gateway switch were ever visible.

**Files:** none.

- [ ] **Step 1: Full static and unit verification**

Run: `npx tsc --noEmit && npx eslint . && npx jest && npx prettier --check .`
Expected: clean typecheck, no lint errors, all tests pass. If `prettier --check` flags files this change touched, run `npx prettier --write` on those files and amend.

- [ ] **Step 2: Build and run on Android**

Run: `npm run android`
Expected: build succeeds with zero errors, app launches.

- [ ] **Step 3: Walk the reported bug**

1. Staff login screen → pick environment `dev` → pick a tenant → sign in successfully.
2. Profile → Logout.
3. Back on the staff login screen, confirm: the tenant field shows the placeholder, **not** the previous tenant, and the environment chip is still `dev`.
4. Pick the same tenant and sign in again. It must succeed **without** having to change the tenant and set it back.

- [ ] **Step 4: Walk the cold-start case**

1. Sign in on `live` (or `uat`) with a tenant, then kill the app from the OS task switcher.
2. Relaunch. The environment chip must still be `live` and the tenant field must still show that tenant's name.
3. Sign in. It must work on the first attempt.

- [ ] **Step 5: Walk the remaining cases**

- **Environment switch:** on the login screen, switch `dev` → `live`. The tenant field must clear, the list must reload, and the new list must be `live`'s.
- **Required tenant:** with no tenant selected, fill email and password. The Login button must stay disabled.
- **Search:** open the selector, type a substring from the middle of a tenant's name. It must match.
- **Offline:** turn on airplane mode with a tenant already selected, relaunch, open the selector. It must show the load error with Retry, and the selected tenant must still be selected and still shown in the field.
- **Theme and locale survive logout:** switch the app to Turkish, log in, log out. The app must still be in Turkish.
- **Traveller after staff:** sign in as staff with a tenant, log out, sign in on the traveller screen. It must succeed, and returning to the staff screen must show no tenant.
- **Debug menu:** open it (five taps on the logo). All three environment chips must appear with the active one selected. Resolve a tenant by name and confirm it becomes selected and displays by name.

- [ ] **Step 6: Build and run on iOS**

Run: `npm run ios`
Expected: build succeeds with zero errors. Repeat Steps 3 and 4 on the simulator.

- [ ] **Step 7: Report**

Report the outcome of every check above, naming any that failed with their actual output. Do not describe the work as complete while any check is failing or unrun.

---

## Notes for the executing agent

- The store tests re-import modules under `jest.resetModules()` because hydration is memoised in module scope. Copy that helper as written; a plain top-level import will leak the first test's hydration into every later test.
- `logger` is `src/utils/logger.ts`. Prefer it over `console.*` in anything you touch.
- If `npm run init` cannot reach the backend, stop at Task 5 Step 3 and report. Hand-editing `src/data/language-data/*.gen.json` is never correct.

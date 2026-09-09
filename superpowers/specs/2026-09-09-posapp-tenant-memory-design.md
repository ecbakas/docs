# SP3: tenant memory on the login screen — pos-app

**Date:** 2026-09-09
**Repo:** `pos-app` (`unirefund-pos`)
**Branch point:** `feat/active-affiliation` (SP2), which sits on SP1 — **not `main`**
**Program:** [2026-09-09-posapp-parity-program-design.md](2026-09-09-posapp-parity-program-design.md) — sub-project 3 of 7
**Covers:** T6 (default the login screen to the last selected tenant)

## Goal

The login screen opens on the tenant the terminal was last used with, and only
forgets it when that tenant is genuinely gone.

## Why

pos-app already writes and reads `debug_tenantId`, so T6 looks done. It is not:
**three separate defects each throw the selection away.**

**A cold start deletes it whenever the environment is not the default.** The
bootstrap restores the stored environment and the stored tenant in the same
tick, and `environment` starts at `DEFAULT_ENVIRONMENT`:

```ts
const didInitEnvRef = useRef(true);
useEffect(() => {
  if (didInitEnvRef.current) {
    didInitEnvRef.current = false;
    return;
  }
  setTenantIdState("");
  AsyncStorage.removeItem("debug_tenantId");
  ...
}, [environment, refreshTenants]);
```

The ref consumes the *mount* run, not the run caused by the restore. So on a
terminal left on uat or prod, `setEnvironmentState(storedEnvironment)` fires
this effect and it removes the tenant the bootstrap has just restored — every
launch. This is the bug SP1 pinned as an `it.failing`; this sub-project flips it
to a passing `it`.

super-app hit the identical failure and its fix is a comment in two places:
clear the tenant **in the handler**, not in an effect on `environment`, because
"the previous effect-on-`environment` version also ran on cold start, which is
what deleted the restored selection."

**Sign-out used to delete it too.** Fixed in SP1 — this sub-project is only
possible because `AsyncStorage.clear()` is gone.

**And nothing validates the restored id.** A tenant that has been removed
server-side stays selected and keeps going out as `__tenant` on every login
attempt, with the picker showing a blank selection because no name resolves.

Two smaller faults in the same area:

- `setTenantId("")` **stores an empty string** rather than removing the key. ABP
  treats a blank `__tenant` as unresolved, so `""` is neither absent nor usable;
  the request builder happens to guard with `tenantId ? ... : {}`, so the
  behaviour is right today by luck rather than by design.
- The tenant cache key `public_tenants_cache_v1` **is not scoped by
  environment**, so a cold start can render `dev` tenants while the app points
  at `prod`. super-app bumped to `public_tenants_cache_v2:<env>` for exactly
  this.

## Decisions

1. **Fix the behaviour, do not port the structure.** super-app keeps this in a
   dedicated `store/tenant.ts` with a memoised `hydrateTenantStore()` that
   `SessionProvider` awaits before anything else. That machinery exists to solve
   a problem pos-app does not have: super-app's `getStoredTenantId()` and
   `getGatewayUrl()` read the *store*, so a request firing before hydration
   would target the wrong gateway. pos-app's equivalents read AsyncStorage
   directly, which is already the authoritative value and needs no gate.
   Importing the store would also create a cycle — `tenant.ts` needs
   `ENVIRONMENT_URLS` and `isAppEnvironment` from `utils/environment.ts`, which
   would need the store back. So tenant state stays in `SessionProvider` and
   only the cache is extracted.
2. **Clearing moves into `setEnvironment`.** The effect keyed on `environment`
   keeps only the part that is safe to run on a cold start: read that
   environment's cache, then refresh the list.
3. **Only a successful load may invalidate a selection.** A failed fetch leaves
   it alone — a persisted tenant has to keep working when the list cannot be
   reached, which is the common case on a POS behind a flaky shop network.
4. **`public_tenants_cache_v1` is retired, not migrated.** It is a 30-minute
   cache; there is nothing worth carrying across. It joins
   `clearRetiredStorage`'s list so old installs stop carrying a dead key.
5. **The internal-tenant filter becomes case-insensitive and testable.** Today
   the login screen inlines `!t.name.includes("e2e")`, so a tenant named `E2E`
   or `Manual-QA` shows up in a production picker. super-app lower-cases. This
   is one line of the same block being edited and it is a real leak.

## Design

### 1. `src/utils/tenantCache.ts` — new

Owns the cache key shape, the TTL and the JSON handling that is currently
inlined in a `SessionProvider` effect.

```ts
export type TenantOption = { id: string; name: string };
export const TENANTS_CACHE_TTL_MS = 1000 * 60 * 30;

export async function readTenantCache(
  environment: AppEnvironment,
): Promise<TenantOption[] | null>;

export async function writeTenantCache(
  environment: AppEnvironment,
  items: TenantOption[],
): Promise<void>;
```

Key: `` `public_tenants_cache_v2:${environment}` ``. `readTenantCache` returns
`null` for a miss, malformed JSON, a missing timestamp, or an expired entry —
the caller never sees a half-valid cache. Both swallow storage errors through
`logger.error`; a cache is never worth failing a login screen over.

`TenantOption` moves here from `SessionProvider`, which currently declares it
locally, so the cache and the provider cannot disagree about the shape.

### 2. `src/utils/tenants.ts` — new

```ts
export function isInternalTenant(name: string): boolean;
```

Lower-cases, then matches `e2e`, `manual-`, `manuals`. Pure, so the filter is
testable without rendering the login screen.

### 3. `src/providers/SessionProvider.tsx`

**`setTenantId`** removes the key for an empty selection:

```ts
const setTenantId = useCallback((id: string) => {
  setTenantIdState(id);
  if (id) {
    void AsyncStorage.setItem("debug_tenantId", id);
    return;
  }
  void AsyncStorage.removeItem("debug_tenantId");
}, []);
```

**`setEnvironment`** takes over the clearing the effect used to do:

```ts
const setEnvironment = useCallback((env: Environment) => {
  setEnvironmentState(env);
  void setStoredEnvironment(env);
  // In the handler, not an effect on `environment`: the effect version also
  // ran on cold start, which deleted the selection the bootstrap had just
  // restored.
  setTenantIdState("");
  void AsyncStorage.removeItem("debug_tenantId");
  useApplicationConfigurationStore.getState().clearConfiguration();
}, []);
```

**The `didInitEnvRef` effect is deleted.** The cache-read effect is re-keyed on
`environment` and absorbs its remaining job:

```ts
useEffect(() => {
  let cancelled = false;
  readTenantCache(environment)
    .then((items) => {
      if (!cancelled && items) setTenants(items);
    })
    .finally(() => {
      if (!cancelled) void refreshTenants();
    });
  return () => {
    cancelled = true;
  };
}, [environment, refreshTenants]);
```

Re-running on `environment` is what makes an environment switch load the right
list, and running on mount is what warms the picker from cache. Neither touches
the selection.

**`refreshTenants`** validates on success only:

```ts
setTenants(tenantItems);
await writeTenantCache(environment, tenantItems);

// Only a *successful* load reaches here, so an id absent from the list is
// genuinely gone and must not stay selected — it would keep going out as
// `__tenant` with no name to render for it. A failed fetch returns above.
setTenantIdState((current) => {
  if (!current || tenantItems.some((tenant) => tenant.id === current)) {
    return current;
  }
  void AsyncStorage.removeItem("debug_tenantId");
  setTenantError(t("MobileApp.TenantSelection.SelectionUnavailable"));
  return "";
});
```

`refreshTenants` gains `environment` as a dependency, which is correct: it
writes to that environment's cache.

### 4. `src/screens/(public)/LoginScreen.tsx`

- The inline filter becomes `!isInternalTenant(t.name)`.
- The two hardcoded English strings in the block being edited — `"Tenant
  Selection"` and `"Without Tenant"` — become `t(...)` calls. They are the only
  un-localized strings on the screen and they sit in the lines already changing.

### 5. i18n

Three keys in both `en-US.json` and `tr-TR.json`:

| Key | en-US | tr-TR |
| --- | --- | --- |
| `MobileApp.TenantSelection.Title` | Tenant Selection | Kiracı Seçimi |
| `MobileApp.TenantSelection.WithoutTenant` | Without Tenant | Kiracı Olmadan |
| `MobileApp.TenantSelection.SelectionUnavailable` | The saved tenant is no longer available. Please choose another. | Kayıtlı kiracı artık kullanılamıyor. Lütfen başka bir tane seçin. |

`npm run init` must run before `tsc` sees them.

### 6. `src/utils/retiredStorage.ts`

Add `public_tenants_cache_v1` with a one-line note that it was replaced by the
environment-scoped `v2` key.

## Testing

New — `src/utils/__tests__/tenantCache.test.ts`:

- round-trips items for an environment
- keys separately per environment: a `dev` write is not readable as `prod`
- returns `null` for a miss, for malformed JSON, for a missing timestamp, and
  for an entry past the TTL
- returns items for an entry inside the TTL
- resolves rather than throwing when storage fails

New — `src/utils/__tests__/tenants.test.ts`:

- flags `e2e`, `manual-` and `manuals` names
- flags them **case-insensitively** — `E2E`, `Manual-QA` (the current leak)
- passes an ordinary tenant name

Extended — `src/providers/__tests__/SessionProvider.test.tsx`:

- **the pinned `it.failing` becomes a passing `it`**: a cold start in a
  non-default environment keeps the stored tenant
- switching environment clears the tenant and the configuration
- a successful load that no longer contains the selection clears it and reports
  `SelectionUnavailable`
- a **failed** load keeps the selection
- a successful load containing the selection keeps it
- selecting the empty option removes the key rather than storing `""`
- the cache is read for the restored environment, not the default

Also updated: SP1's "keeps the public tenant cache across sign-out" test now
names the `v2:<env>` key, since `v1` is retired.

## Risks

**`refreshTenants` gaining `environment` as a dependency** makes the cache-read
effect re-run when the environment changes — which is the intent, but it means
the identity of `refreshTenants` changes there too. The effect is idempotent
(read cache, then fetch) and guarded by a `cancelled` flag, so an overlapping
run cannot write a stale list.

**Clearing inside `setEnvironment` runs on the user's tap only.** If any code
path ever sets `environment` without going through the handler, the tenant will
not be cleared. `setEnvironmentState` is private to the provider and the only
other writer is the bootstrap restore — which must *not* clear. That is the
whole point, so the asymmetry is deliberate rather than an oversight.

## Out of scope

Replacing the raw `Picker` with super-app's `TenantInput` + `TenantSelectionModal`
needs `Badge`, `SelectField`, `SelectionModal` and `Skeleton`, none of which
pos-app has until SP4. T6 asks for the remembered-default *behaviour*, which
this delivers against the existing picker.

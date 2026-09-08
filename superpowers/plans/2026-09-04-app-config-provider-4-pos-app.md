# ApplicationConfiguration Provider — pos-app (Plan 4 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the ApplicationConfiguration layer to pos-app, cutting its three session-bootstrap calls to two, adapted to this repo's `ApiResult` error contract.

**Architecture:** Implemented directly rather than merged from core, using **exactly core's file layout and symbol names** so a future `git merge core/main` resolves cleanly. The action layer differs because `fetchRequest` here returns `ApiResult<T>` and never throws.

**Tech Stack:** Expo, React Native, TypeScript, zustand + `persist`, AsyncStorage, jest with `jest-expo`.

**Spec:** `docs/superpowers/specs/2026-09-04-application-configuration-provider-design.md`

**Reference implementation:** Plan 2 (`core`). Read core's `src/config/*` and `src/store/application-configuration.ts` and mirror them; only the action layer and consumer migration differ.

## Why not merge core

pos-app has `core` as a remote and shares its root commit, but sits **27 commits behind `core/main`**. Merging would drag 27 unrelated commits into this feature branch, which is a review problem rather than a technical one. On top of that, `fetchRequest` here returns `ApiResult<T>` while core's throws, so core's action would not compile unchanged anyway.

Keeping the file paths and symbol names byte-identical to core is what preserves the merge path: whoever next syncs pos-app with core gets a clean, mechanical resolution rather than a rename-detection failure.

## AMENDMENT (2026-09-08): mirror post-port core — its source outranks this plan's code blocks

This plan was written before `core` was fixed. **`core/main` is now `4608792`** (core-mobile#23), which closed two fail-open bugs in exactly the files this plan mirrors. Every code block below was transcribed from core's *pre-fix* state and is therefore stale in places.

**Rule for this plan: where a code block here disagrees with core's actual current source, core wins.** Read the real file and mirror it. That is not a licence to improvise — it is the plan's own architecture, which is to keep pos-app's layout and symbol names identical to core's so a future `git merge core/main` resolves mechanically. A faithful copy of a stale transcription defeats the entire point.

What the port added, all of which pos-app must inherit:

1. **`NormalizedApplicationConfiguration`** in `appConfigTypes.ts` — `country` is `null` when the country lookup did not land. The normalizer returns this type, not `ApplicationConfiguration`.
2. **`setConfiguration` resolves `configuration.country ?? state.configuration.country`** — a failed country lookup must not overwrite the last known-good country. A defaulted block is byte-identical to a real answer from a sparse TRY tenant, which is why the distinction lives in the type rather than in a store guard.
3. **`clearGrants()`** on the configuration store — clears `settings`, `features` and that store's `policies`, **keeps `country`**.
4. **`clearGrantedPolicies()`** on the user store — clears `user.grantedPolicies`, the map policy gates actually read.
5. **`revokeSessionAuthority()`** in `SessionProvider`, calling both clears, wired into **both** paths that end without a usable session: the `catch` and the validation early-return (this plan's `if (!userData || !userId || !jwtUser || …) return;`). Neither caller acts on the result, so without this a tenant switch keeps serving the previous tenant's `EarlyRefundAvailable` — fail-open on a flag whose contract is fail-closed.
6. **`UserProfile.grantedPolicies` is `Partial<Record<Policies, boolean>>`**, not `Record<Policies, boolean>`. The total type was never satisfiable — the payload carries only granted keys — and `Partial` keeps literal-key typo detection that `Record<string, boolean>` would lose.

**Expect item 6 to surface new strict-null errors** on `user.grantedPolicies[key]` in pos-app. That is the type telling the truth, not a regression. Fix them at the type level; do not add casts.

Note this plan's line ~324 (`const grantedPolicies = configuration?.policies ?? null;`) and the guard that follows it are precisely where item 5 belongs.

## Global Constraints

- Gate baselines from `AGENTS.md`, measured 2026-08-27: `npm run typecheck` clean, `npm test` 30 suites / 361 tests all passing, `npm run lint` 0 errors / 35 warnings. **Re-measure before starting.**
- `npm run init` MUST run before `tsc` sees a new i18n key. `init.ts` needs `EXPO_PUBLIC_GATEWAY_URL`, `SUPPORTED_LOCALES` and `EXPO_PUBLIC_GLITCHTIP_DSN` in `.env`.
- `prettier --check` is NOT a gate — 228 files fail repo-wide at baseline. Files here are LF, so `--write` on your own files will not churn line endings.
- `rn-mlkit-ocr` needs the global jest mock in `jest-setup.ts`. It ships untranspiled ESM and registers a TurboModule at import, so any suite transitively reaching it fails to **parse**. If a new test file pulls it in, that is why.
- `fetchRequest` returns `ApiResult<T>` = `{ success: true, data, status } | { success: false, data: null, message, status }` and **never throws**. Do not write `try/catch` around it expecting rejections.
- Time zone MUST come from `timing.timeZone.iana.timeZoneName`, never `setting.values["Abp.Timing.TimeZone"]` (a Windows zone id).
- Boolean setting parsing MUST be case-insensitive — payloads carry both `"True"` and `"false"`.
- `policies` and `user` MUST NOT be persisted — only `country` and `settings`.
- `UserProfile.grantedPolicies` MUST keep being populated.
- pos-app ships GlitchTip. Do not log configuration payloads to it — `currentUser` carries an email and a session id.

---

### Task 1: Pure layer, mirrored from core

**Files:**
- Create: `pos-app/src/config/appConfigTypes.ts`
- Create: `pos-app/src/config/appConfigKeys.ts`
- Create: `pos-app/src/config/appConfigParse.ts`
- Create: `pos-app/src/config/isHostTenant.ts`
- Create: `pos-app/src/config/normalizeApplicationConfiguration.ts`
- Test: `pos-app/src/config/__tests__/appConfigParse.test.ts`
- Test: `pos-app/src/config/__tests__/appConfigKeys.test.ts`
- Test: `pos-app/src/config/__tests__/normalizeApplicationConfiguration.test.ts`
- Test fixture: `pos-app/src/config/__fixtures__/applicationConfiguration.fixture.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: identical to Plan 2 Tasks 1–2 — `ApplicationConfiguration`, `RawApplicationConfiguration`, `CountryInfo`, `SETTING_KEYS`, `FEATURE_KEYS`, `getSetting`, `getBooleanSetting`, `getNumberSetting`, `getFeature`, `getBooleanFeature`, `isHostTenant`, `normalizeApplicationConfiguration`, `EMPTY_APPLICATION_CONFIGURATION`.

- [ ] **Step 1: Record the gate baseline**

```bash
cd pos-app
git status --short
npm run init
npm run typecheck
npm test
npm run lint
```

Record actual numbers. If they differ from `AGENTS.md`, use yours and say so.

- [ ] **Step 2: Copy the eight files from core verbatim**

These are pure modules with no repo-specific dependencies beyond the generated SDK types, which both repos have. Copy them byte-for-byte from Plan 2 so the merge path stays clean:

```bash
cd /c/unirefund
cp core/src/config/appConfigTypes.ts pos-app/src/config/
cp core/src/config/appConfigKeys.ts pos-app/src/config/
cp core/src/config/appConfigParse.ts pos-app/src/config/
cp core/src/config/isHostTenant.ts pos-app/src/config/
cp core/src/config/normalizeApplicationConfiguration.ts pos-app/src/config/
mkdir -p pos-app/src/config/__tests__
cp core/src/config/__tests__/*.ts pos-app/src/config/__tests__/
mkdir -p pos-app/src/config/__fixtures__
cp core/src/config/__fixtures__/*.ts pos-app/src/config/__fixtures__/
```

If `core` is not checked out alongside, reproduce them from Plan 2 Tasks 1 and 2 rather than writing variants — the key-string test in each repo exists precisely to catch divergence.

- [ ] **Step 3: Verify the SDK type paths resolve**

pos-app imports clients from concrete files, not service barrels, to keep ~1.8 MB of schema literals out of the bundle. Confirm the two type imports in `appConfigTypes.ts` resolve here:

```bash
grep -n "ApplicationConfigurationDto" pos-app/src/saas/AccountService/types.gen.ts | head -2
grep -n "CountrySettingInfoDto" pos-app/src/saas/AdministrationService/types.gen.ts | head -2
```

If `@/saas/AccountService` resolves through a barrel that pulls schemas, change the import to the concrete `types.gen` path — type-only imports are erased at build time, but keep the convention consistent with the rest of the repo.

- [ ] **Step 4: Run the tests**

Run: `cd pos-app && npm test -- appConfig normalizeApplicationConfiguration`
Expected: PASS. If a suite fails to *parse*, check whether it transitively reaches `rn-mlkit-ocr` — that needs the global mock in `jest-setup.ts`.

- [ ] **Step 5: Commit**

```bash
cd pos-app
git add src/config
git commit -m "feat(app-config): add pure config layer, mirrored from core"
```

---

### Task 2: Store

**Files:**
- Create: `pos-app/src/store/application-configuration.ts`
- Test: `pos-app/src/store/__tests__/application-configuration.test.ts`

**Interfaces:**
- Consumes: Task 1's types and parsers.
- Produces: default export `useApplicationConfigurationStore` with `{ configuration, isLoaded, setConfiguration, clearConfiguration }`; named exports `useIsHost()`, `useTenantTimeZone()`, `useAppCurrency()`, `useSettingFlag(key, fallback?)`, `useEarlyRefundAvailable()`, `useCountryCode2()`, `useCountryName()`, `getCurrencySymbol(code)`, `DEFAULT_CURRENCY_CODE`.

- [ ] **Step 1: Copy the store and its test from core**

```bash
cd /c/unirefund
cp core/src/store/application-configuration.ts pos-app/src/store/
mkdir -p pos-app/src/store/__tests__
cp core/src/store/__tests__/application-configuration.test.ts pos-app/src/store/__tests__/
```

- [ ] **Step 2: Add the two selectors pos-app needs**

pos-app's print template reads `countryName`, which core has no consumer for. Append:

```ts
export const useCountryCode2 = () =>
  useApplicationConfigurationStore(
    (state) => state.configuration.country.countryCode2,
  );

export const useCountryName = () =>
  useApplicationConfigurationStore(
    (state) => state.configuration.country.countryName,
  );
```

Then port `getCurrencySymbol` and `DEFAULT_CURRENCY_CODE` across from `src/store/country-settings.ts` verbatim, if that file defines them here as it does in super-app:

```bash
grep -n "getCurrencySymbol\|DEFAULT_CURRENCY_CODE" pos-app/src/store/country-settings.ts
```

Move whatever it reports into `application-configuration.ts` unchanged.

- [ ] **Step 3: Run the store test**

Run: `cd pos-app && npm test -- application-configuration`
Expected: PASS, including the assertion that only `country` and `settings` are persisted.

- [ ] **Step 4: Commit**

```bash
cd pos-app
git add src/store/application-configuration.ts src/store/__tests__
git commit -m "feat(app-config): add the partially-persisted configuration store"
```

---

### Task 3: Action, adapted to `ApiResult`

**Files:**
- Modify: `pos-app/src/actions/AccountService/actions.ts`

**Interfaces:**
- Consumes: `normalizeApplicationConfiguration`, `CountryInfo` (Task 1); existing `getCountrySettingsInfo`.
- Produces: `getApplicationConfigurationApi(): Promise<ApiResult<ApplicationConfiguration>>`. `getGrantedPoliciesApi` and `getCurrentUserIdApi` are deleted.

This is the one file that genuinely differs from core.

- [ ] **Step 1: Write the action**

Because `fetchRequest` never throws, `Promise.all` is already independent — no `allSettled` needed, and no `try/catch`.

```ts
export async function getApplicationConfigurationApi(): Promise<
  ApiResult<ApplicationConfiguration>
> {
  const [configResult, countryResult] = await Promise.all([
    fetchRequest(async (customHeaders) => {
      const client = await getAccountServiceClient(customHeaders);
      // `includeLocalizationResources: false` is what keeps this at ~19 KB /
      // ~225 ms instead of ~397 KB / ~900 ms.
      return await client.abpApplicationConfiguration.getApiAbpApplicationConfiguration(
        { includeLocalizationResources: false },
      );
    }, "getApplicationConfigurationApi"),
    getCountrySettingsInfo(),
  ]);

  if (!configResult.success) {
    return {
      success: false,
      data: null,
      message: configResult.message,
      status: configResult.status,
    };
  }

  // The country lookup is independent: losing it costs the currency and
  // country name, not the session's permissions.
  return {
    success: true,
    data: normalizeApplicationConfiguration(
      configResult.data,
      countryResult.success
        ? (countryResult.data as CountryInfo)
        : undefined,
    ),
    status: configResult.status,
  };
}
```

Add the imports:

```ts
import { getCountrySettingsInfo } from "../AdministrationService/actions";
import { normalizeApplicationConfiguration } from "@/config/normalizeApplicationConfiguration";
import type { ApplicationConfiguration, CountryInfo } from "@/config/appConfigTypes";
```

Confirm the `ApiResult` type's exact shape and import path before writing — the failure branch must match it field for field:

```bash
grep -n "ApiResult" pos-app/src/utils/customFetch.ts | head -5
```

- [ ] **Step 2: Delete the two redundant actions**

Remove `getGrantedPoliciesApi` and `getCurrentUserIdApi`. They fetched the same response twice to read one field each.

- [ ] **Step 3: Type-check**

Run: `cd pos-app && npm run typecheck`
Expected: errors only in `src/providers/SessionProvider.tsx`, fixed in Task 4. Confirm:

```bash
grep -rn "getGrantedPoliciesApi\|getCurrentUserIdApi" pos-app/src --include="*.ts" --include="*.tsx"
```

- [ ] **Step 4: Commit**

```bash
cd pos-app
git add src/actions/AccountService/actions.ts
git commit -m "perf(app-config): fetch application configuration once, not twice"
```

---

### Task 4: Provider, session wiring, and consumer migration

**Files:**
- Create: `pos-app/src/providers/ApplicationConfigurationProvider.tsx`
- Modify: `pos-app/src/providers/SessionProvider.tsx`
- Modify: `pos-app/src/screens/(auth)/Tags/TagDetail/_components/tagPrintTemplate.ts`
- Modify: the provider composition site (confirm below)
- Delete: `pos-app/src/store/country-settings.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: `ApplicationConfigurationProvider`, `useApplicationConfiguration()`, `useApplicationConfigurationRefresh()`.

- [ ] **Step 1: Copy the provider from core and adapt the result handling**

```bash
cp /c/unirefund/core/src/providers/ApplicationConfigurationProvider.tsx \
   /c/unirefund/pos-app/src/providers/
```

Then change `refresh` to read the `ApiResult` rather than catch a throw:

```tsx
  /**
   * Never throws. A failed load leaves whatever the store holds — on a cold
   * start that is the fail-closed empty configuration with an empty policy
   * map, so permission-gated UI stays hidden.
   */
  const refresh = useCallback(async () => {
    const result = await getApplicationConfigurationApi();
    if (result.success && result.data) {
      setConfiguration(result.data);
      return;
    }
    console.error("Failed to load application configuration:", result.message);
  }, [setConfiguration]);
```

If pos-app has no `@/utils/logger`, use `console.error` as above — do not route this through GlitchTip, since the payload carries an email and a session id.

- [ ] **Step 2: Rewire `getUserData` in `SessionProvider.tsx`**

Delete the fire-and-forget `getCountrySettingsInfo().then(...)` block at the top of `getUserData` — the configuration action fetches country info itself now.

Replace the three-call `Promise.all` with two:

```ts
    let userResult;
    let configResult;

    try {
      [userResult, configResult] = await Promise.all([
        getUserProfileApi(),
        getApplicationConfigurationApi(),
      ]);
    } catch (error) {
      console.error("Failed to fetch user data:", error);
      return;
    }

    const userData = userResult.success ? userResult.data : null;
    const configuration = configResult.success ? configResult.data : null;
    const userId = configuration?.user.id ?? null;
    const grantedPolicies = configuration?.policies ?? null;

    if (configuration) {
      useApplicationConfigurationStore.getState().setConfiguration(configuration);
    }
```

The `try/catch` is retained only because `getUserProfileApi` shares the batch; `fetchRequest` itself never rejects.

Keep the profile-picture block, the `decodeJWT` call, the `if (!userData || !userId || !jwtUser || !grantedPolicies) return;` guard and `setUser({...})` exactly as they are.

Update imports: drop `getGrantedPoliciesApi`, `getCurrentUserIdApi`, `getCountrySettingsInfo` and `useCountrySettingsStore`; add `getApplicationConfigurationApi` and `useApplicationConfigurationStore`.

- [ ] **Step 3: Clear the store on sign-out**

In `signOut`, wherever `clearCountrySettings()` / `clearUser()` are called, add:

```ts
    useApplicationConfigurationStore.getState().clearConfiguration();
```

and remove the `clearCountrySettings()` call.

- [ ] **Step 4: Migrate the print template**

`tagPrintTemplate.ts` reads the store imperatively:

```ts
    useCountrySettingsStore.getState().countrySettings?.countryName ?? "";
```

Replace with:

```ts
    useApplicationConfigurationStore.getState().configuration.country
      .countryName ?? "";
```

and swap the import to `@/store/application-configuration`. This is a module-scope read outside React, which is why it uses `getState()` — keep it that way.

- [ ] **Step 5: Delete the country-settings store**

```bash
cd pos-app
git rm src/store/country-settings.ts
grep -rn "store/country-settings" src --include="*.ts" --include="*.tsx"
```

Expected: no hits. Any hit is a consumer this plan missed — report it.

- [ ] **Step 6: Mount the provider**

`SessionProvider` is mounted at `pos-app/src/app/_layout.tsx:65` and closes at line 74. Read that range first:

```bash
sed -n '55,80p' pos-app/src/app/_layout.tsx
```

Mount `ApplicationConfigurationProvider` inside `SessionProvider` and above anything reading configuration.

- [ ] **Step 7: Type-check and test**

Run: `cd pos-app && npm run typecheck`
Expected: clean, matching the Task 1 Step 1 baseline.

Run: `cd pos-app && npm test`
Expected: the Task 1 Step 1 counts plus the new suites, all passing.

- [ ] **Step 8: Commit**

```bash
cd pos-app
git add -A src
git commit -m "feat(app-config): mount the provider and retire the country-settings store"
```

---

### Task 5: Verification

**Files:** none modified.

- [ ] **Step 1: Prove the call count dropped**

```bash
grep -rn "getApiAbpApplicationConfiguration" pos-app/src --include="*.ts" | grep -v "src/saas/"
```

Expected: exactly one hit, inside `getApplicationConfigurationApi`. Three session-bootstrap calls are now two.

- [ ] **Step 2: Confirm pos-app and core have not diverged**

The key-string tests exist to catch drift, but so should a direct comparison:

```bash
cd /c/unirefund
for f in appConfigTypes.ts appConfigKeys.ts appConfigParse.ts isHostTenant.ts \
         normalizeApplicationConfiguration.ts; do
  diff -q core/src/config/$f pos-app/src/config/$f || echo "DIVERGED: $f"
done
```

Expected: no output. Any divergence must be either justified in a comment in the pos-app file or removed — silent drift is what breaks the future core merge.

Note `normalizeApplicationConfiguration.ts` will legitimately match core, including the `TRY` currency default.

- [ ] **Step 3: Full gate run**

```bash
cd pos-app
npm run init
npm run typecheck
npm test
npm run lint
```

Compare against the Task 1 Step 1 baseline.

- [ ] **Step 4: On-device check**

The debuggable POS build lives on the V3, which is **shared with super-app sessions** — check nothing else is mid-review on it before starting, and do not revoke permissions on it: `pm revoke` kills and logs out the pos-app, and its login form is not pre-filled, so recovery needs typed credentials.

Verify: sign in, print a tag, and confirm the country name still renders on the template. That is the one consumer whose data source moved.

- [ ] **Step 5: Format only what you touched**

```bash
cd pos-app
npx prettier --write src/config src/store/application-configuration.ts \
  src/providers/ApplicationConfigurationProvider.tsx \
  src/providers/SessionProvider.tsx src/actions/AccountService/actions.ts \
  "src/screens/(auth)/Tags/TagDetail/_components/tagPrintTemplate.ts"
```

- [ ] **Step 6: Update `AGENTS.md`**

Record the re-measured baseline, and note that `src/config/*` is mirrored from core and must stay byte-identical so a future `git merge core/main` resolves cleanly.

- [ ] **Step 7: Commit**

```bash
cd pos-app
git add AGENTS.md src
git commit -m "docs: re-measure gates after app-config provider"
```

# ApplicationConfiguration Provider — super-app (Plan 3 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inherit the ApplicationConfiguration layer from core via a real git merge, then retire super-app's four session-bootstrap calls down to two and drop the `UniRefund.Settings.GetValues` grant dependency.

**Architecture:** `git merge core/main` brings the pure layer, store, action and provider. super-app then removes its own `getCountrySettingsInfo` / `getCountrySettingsValues` calls (the configuration action fetches country info itself), migrates the three country-settings consumers, and deletes `src/store/country-settings.ts`.

**Tech Stack:** Expo, React Native, TypeScript, zustand + `persist`, AsyncStorage, jest with `jest-expo`.

**Spec:** `docs/superpowers/specs/2026-09-04-application-configuration-provider-design.md`

**Depends on:** Plan 2 (core) merged to `core/main` first. This plan cannot start until then.

## Global Constraints

- **This checkout is shared.** Another agent session may be working in `super-app` at the same time, and sibling worktrees may be nested inside it. NEVER run `git reset --hard`, `git stash`, or `git clean` here. If `git status` shows unrelated files, stop and report.
- `npm test` in this repo also picks up sibling worktrees' tests. A repo-wide total is not a meaningful baseline — compare *named suites*, not counts.
- At last measurement only `tokens.test.ts` failed at baseline. **Re-measure before starting**; do not quote this figure as fact.
- Render tests MUST be named `*.router.test.*` or they will not run.
- `npm run init` MUST run before `tsc` will see a new i18n key.
- `prettier --check` is not a gate; CRLF makes it fail repo-wide. Format only files you touch.
- `expo start` needs `--offline` in this environment.
- `policies` and `user` MUST NOT be persisted — only `country` and `settings`.
- The traveller sign-in path (`signInWithDidit`) and the affiliation-derived role (`resolveRoleFromAffiliations`) MUST NOT change. `currentUser.roles` is an ABP identity role and cannot express merchant / refundPoint / customs.
- `UserProfile.grantedPolicies` MUST keep being populated — `useCanUploadVerification` and `isActionGranted` call sites read it.

---

### Task 1: Merge core

**Files:** whatever the merge brings — `src/config/*`, `src/store/application-configuration.ts`, `src/providers/ApplicationConfigurationProvider.tsx`, `src/actions/AccountService/actions.ts`, `src/providers/SessionProvider.tsx`.

**Interfaces:**
- Consumes: everything Plan 2 produced.
- Produces: the same symbols, now present in super-app.

- [ ] **Step 1: Confirm a clean, safe starting state**

```bash
cd super-app
git status --short
git rev-parse --abbrev-ref HEAD
```

If anything unrelated to this plan is modified, **stop and report** — do not clean it up. Another session may own it.

- [ ] **Step 2: Record the gate baseline**

```bash
cd super-app
npm run init
npm run typecheck
npm test 2>&1 | tail -30
npm run lint
```

Write down the **named** failing suites, not just totals. `npm test` also runs sibling worktrees' tests, so the total is not stable across sessions.

- [ ] **Step 3: Create the feature branch and merge core**

super-app was 0 commits behind `core/main` when this plan was written, so the merge should bring only Plan 2's work. Verify that before merging:

```bash
cd super-app
git fetch core
git rev-list --count HEAD..core/main
```

If that number is larger than the commit count of Plan 2, unrelated core work has landed since. Report the extra commits before continuing — bundling them into this feature branch is a review problem, not a blocker to solve silently.

```bash
git checkout -b feat/app-config-provider
git merge core/main
```

- [ ] **Step 4: Resolve conflicts**

Expect conflicts only in `src/actions/AccountService/actions.ts` and `src/providers/SessionProvider.tsx`, because super-app has diverged in both. Resolution rules:

- `actions.ts`: take core's `getApplicationConfigurationApi` wholesale. Keep super-app's extra actions. Delete super-app's `getGrantedPoliciesApi` and `getCurrentUserIdApi`.
- `SessionProvider.tsx`: keep **super-app's** version of everything core does not have — `signInWithDidit`, `expiredSessions`, `onSessionExpired`, the AppState foreground refresh, `resumeStoredSession`, `resolveRoleFromAffiliations`, `clearSessionScopedStores`, `hydrateTenantStore`. Take from core only the `getUserData` change that swaps the three-call `Promise.all` for the two-call one. Task 2 finishes this file.

- [ ] **Step 5: Type-check to see the true damage**

Run: `cd super-app && npm run typecheck`
Expected: errors confined to `SessionProvider.tsx` and the country-settings consumers. Task 2 clears them. Record the list.

- [ ] **Step 6: Commit the merge**

```bash
cd super-app
git add -A src
git commit -m "merge: inherit ApplicationConfiguration layer from core"
```

---

### Task 2: Retire the country-settings store

**Files:**
- Modify: `super-app/src/providers/SessionProvider.tsx`
- Modify: `super-app/src/screens/merchant/CreateTag/useCreateTag.ts`
- Modify: `super-app/src/screens/staff/StickerTag/useStickerTag.ts`
- Modify: `super-app/src/screens/shared/Tags/TagDetail/TagDetailScreen.tsx`
- Modify: `super-app/src/store/application-configuration.ts`
- Modify: `super-app/src/actions/AdministrationService/actions.ts`
- Delete: `super-app/src/store/country-settings.ts`

**Interfaces:**
- Consumes: `useApplicationConfigurationStore`, `useEarlyRefundAvailable`, `useAppCurrency` from Task 1.
- Produces: `getCurrencySymbol(code)`, `DEFAULT_CURRENCY_CODE`, `useCountryCode2()` from `@/store/application-configuration`.

The store has only three consumers outside `SessionProvider`, so migrating them beats maintaining a facade.

- [ ] **Step 1: Move the currency helpers onto the new store**

`getCurrencySymbol` and `DEFAULT_CURRENCY_CODE` live in `country-settings.ts` and have live consumers. Append them to `src/store/application-configuration.ts` verbatim, along with a `countryCode2` selector:

```ts
// The API returns `currency` as an ISO 4217 code (e.g. "TRY").
export const DEFAULT_CURRENCY_CODE = "TRY";

const CURRENCY_SYMBOLS: Record<string, string> = {
  TRY: "₺",
  USD: "$",
  EUR: "€",
  GBP: "£",
};

/**
 * Maps an ISO 4217 currency code to its display symbol. Unknown codes fall
 * back to the code itself so the value is still readable.
 */
export function getCurrencySymbol(currencyCode?: string | null): string {
  if (!currencyCode) return CURRENCY_SYMBOLS[DEFAULT_CURRENCY_CODE];
  return CURRENCY_SYMBOLS[currencyCode.toUpperCase()] ?? currencyCode;
}

export const useCountryCode2 = () =>
  useApplicationConfigurationStore(
    (state) => state.configuration.country.countryCode2,
  );
```

- [ ] **Step 2: Migrate the two tag screens**

In `src/screens/merchant/CreateTag/useCreateTag.ts` and `src/screens/staff/StickerTag/useStickerTag.ts`, replace:

```ts
  const countryCode = useCountrySettingsStore(
    (state) => state.countrySettings?.countryCode2,
  );
```

with:

```ts
  const countryCode = useCountryCode2();
```

and swap the import from `@/store/country-settings` to `@/store/application-configuration`.

- [ ] **Step 3: Repoint `useEarlyRefundAvailable`**

`TagDetailScreen.tsx` imports it from `@/store/country-settings`. Change the import to `@/store/application-configuration`, where Task 1 brought the version backed by `SETTING_KEYS.earlyRefundAvailable`.

The fail-closed contract is preserved and its reasoning still holds: only an explicit `true` opens the door, because a tenant with the feature off, a session that could not read settings, and a read that has not landed are indistinguishable from the call site — and the refund endpoint refuses all three alike (`ContractService:01062`).

Carry that docblock across to the new definition in `application-configuration.ts` so the reasoning does not get lost:

```ts
/**
 * Whether this tenant has early refund switched on.
 *
 * Fail-closed: only an explicit `true` opens the door. A tenant that has the
 * feature off and a read that has not landed yet are indistinguishable from
 * here — and the refund endpoint refuses both alike
 * (`ContractService:01062`), so offering the button would only route the agent
 * into a failure.
 *
 * Source moved from `country-settings/values` (behind
 * `UniRefund.Settings.GetValues`) to application-configuration's
 * `setting.values`, which needs no extra grant.
 */
export const useEarlyRefundAvailable = () =>
  useSettingFlag(SETTING_KEYS.earlyRefundAvailable);
```

- [ ] **Step 4: Delete `getCountrySettingsValues`**

Remove it from `src/actions/AdministrationService/actions.ts`, docblock included — the migration it predicted has now happened. Keep `getCountrySettingsInfo`: `getApplicationConfigurationApi` calls it.

Confirm nothing else used it:

```bash
grep -rn "getCountrySettingsValues\|countrySettingsValues\|earlyRefundExpireDays" super-app/src --include="*.ts" --include="*.tsx" | grep -v "src/saas/"
```

Expected: no hits. Any hit means a consumer exists that this plan did not account for — report it rather than deleting the call.

- [ ] **Step 5: Strip the country-settings calls from `getUserData`**

In `SessionProvider.tsx`, delete both fire-and-forget blocks — the `getCountrySettingsInfo().then(...)` and `getCountrySettingsValues().then(...)` calls at the top of `getUserData`. `getApplicationConfigurationApi` now fetches country info as part of its own `Promise.allSettled`, so these are duplicate work.

Remove `setCountrySettings` / `setCountrySettingsValues` / `clearCountrySettings` from the `useCountrySettingsStore()` destructure and drop the import.

- [ ] **Step 6: Update `clearSessionScopedStores`**

**Task 1 already added `clearConfiguration()` here.** Do not add it a second time. The only edit is to **remove** the now-dead `clearCountrySettings()` call, leaving:

```ts
  const clearSessionScopedStores = useCallback(() => {
    clearUser();
    useApplicationConfigurationStore.getState().clearConfiguration();
    useTagStore.getState().clearTags();
    usePendingScanStore.getState().clearPending();
  }, [clearUser]);
```

- [ ] **Step 6a: Clear the configuration on an environment switch too**

`src/store/tenant.ts`'s `setEnvironment` clears `tenantId` and `publicTenants` under the comment "Tenants are environment-specific, so a selection cannot survive the switch." `country` and `settings` are **equally environment-specific and equally persisted**, and nothing clears them. Add the configuration clear beside the tenant one:

```ts
    useApplicationConfigurationStore.getState().clearConfiguration();
```

Import it the same way the file imports its other cross-store dependencies; if that creates a cycle, call it through `require` at the call site the way the codebase already does elsewhere, and say so in your report.

Why this is not optional: today the switch is signed-out-only (`EnvironmentChips` renders on `StaffLoginScreen` and `debug-menu`, both pre-auth) and the stale window closes on the next `getUserData`. **This task is what makes it matter** — after it, `useAppCurrency`, `useCountryCode2` and `useEarlyRefundAvailable` all read that persisted data live.

- [ ] **Step 6b: Cover the sign-out and expiry wiring with a test**

`clearConfiguration()` is tested at the store level, but its wiring into `clearSessionScopedStores` is not — which is precisely how Step 6 could silently drop it. `src/providers/__tests__/sessionLifecycle.router.test.tsx` already contains the template: a "clears the tag list on sign-out" case and a "clears the tag list when the session expires" case, each asserting on store state after the path runs.

Add a sibling assertion to **both** paths, following whatever those cases already do rather than inventing a new shape:

```ts
expect(useApplicationConfigurationStore.getState().isLoaded).toBe(false);
```

Run the suite and confirm the new assertions actually execute (a router test that silently no-ops is worse than none).

- [ ] **Step 7: Delete the store**

```bash
cd super-app && git rm src/store/country-settings.ts
```

Then confirm nothing imports it:

```bash
grep -rn "store/country-settings" super-app/src --include="*.ts" --include="*.tsx"
```

Expected: no hits.

- [ ] **Step 7a: Fix the typing that is currently hidden behind an implicit `any`**

`src/providers/SessionProvider.tsx:315` declares `let configResult;` with no annotation, so it is `any`. **That is the only reason type-check currently passes**, and it also means `configResult.user.isAuthenticated` is unchecked at compile time.

The real mismatch: `UserProfile.grantedPolicies` is `Record<Policies, boolean>` where `Policies = keyof typeof policies.gen.json` — a mapped type over a literal union of **1,094 required keys** under `strict`. The configuration's `policies` is `Record<string, boolean>`, which is not assignable to it. The type claims totality the payload never has; the granted map only ever holds the granted subset.

Fix both halves together, or the annotation alone will produce a real error:

1. Annotate the variable: `let configResult: ApplicationConfiguration | undefined;`
2. Widen `UserProfile.grantedPolicies` to `Record<string, boolean>` — which is already exactly what `isActionGranted(granted: Record<string, boolean> | undefined, …)` accepts, so no call site changes.

Do **not** silence this with a cast. If widening surfaces further errors, report them rather than casting.

- [ ] **Step 8: Type-check and test**

Run: `cd super-app && npm run typecheck`
Expected: clean, matching the Task 1 Step 2 baseline — but now genuinely clean rather than clean because a variable was `any`.

Run: `cd super-app && npm test 2>&1 | tail -30`
Expected: the same **named** failing suites as the baseline — no new ones. If a country-settings test existed, delete it along with the store; if a test now covers the new store, it should pass.

- [ ] **Step 9: Commit**

```bash
cd super-app
git add -A src
git commit -m "refactor(app-config): retire the country-settings store and its values grant"
```

---

### Task 3: Mount the provider

**Files:**
- Modify: `super-app/src/app/_layout.tsx`

**Interfaces:**
- Consumes: `ApplicationConfigurationProvider` from Task 1.
- Produces: nothing downstream.

- [ ] **Step 1: Read the composition site**

`SessionProvider` is mounted at `super-app/src/app/_layout.tsx:89`. Read the whole provider stack before inserting — there is a load-bearing comment at line ~102 about what must sit under `SessionProvider`:

```bash
sed -n '80,120p' super-app/src/app/_layout.tsx
```

- [ ] **Step 2: Mount it**

`ApplicationConfigurationProvider` goes **inside** `SessionProvider` (it needs a token) and **above** anything reading configuration.

Two ordering hazards already burned this app and both still apply:

- `BottomSheetModalProvider` must sit above `ToastProvider`, because `ToastHost` renders a `BottomSheetModal`. Do not disturb that ordering while inserting.
- Hooks called inside a `<BottomSheet>` child lose context. If a sheet needs configuration, call the hook in the sheet **host** and pass values down as props.

- [ ] **Step 3: Type-check**

Run: `cd super-app && npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd super-app
git add src/app
git commit -m "feat(app-config): mount ApplicationConfigurationProvider"
```

---

### Task 4: Verification

**Files:** none modified.

- [ ] **Step 1: Prove the call count dropped**

```bash
grep -rn "getApiAbpApplicationConfiguration" super-app/src --include="*.ts" | grep -v "src/saas/"
grep -rn "CountrySettingsInfo\|CountrySettingsValues" super-app/src --include="*.ts" | grep -v "src/saas/"
```

Expected: one application-configuration hit (inside `getApplicationConfigurationApi`) and one `CountrySettingsInfo` hit (inside `getCountrySettingsInfo`). No `CountrySettingsValues` hits at all.

That is 4 session-bootstrap calls down to 2, and one fewer grant dependency.

- [ ] **Step 2: Full gate run**

```bash
cd super-app
npm run init
npm run typecheck
npm test 2>&1 | tail -30
npm run lint
```

Compare **named** suites against the Task 1 Step 2 baseline. `npm test` also runs sibling worktrees' tests, so totals will not match across sessions and are not evidence of anything.

- [ ] **Step 3: On-device check of the early refund gate**

A green jest suite does not prove this path: the store is persisted, the provider's lifecycle runs only on a device, and the jest `BackHandler` mock is unfaithful, so provider-lifecycle code must actually be loaded onto hardware.

Requirements: a **debuggable** build. Check `flags=` before assuming — at last check only the V3 build was debuggable, and it is shared with pos-app sessions.

```bash
cd super-app
npx expo start --offline
```

Enter the dev client via the deep link, with identical local and device ports (Metro advertises its own port; never assume it):

```bash
adb reverse tcp:<metroPort> tcp:<metroPort>
adb shell am start -a android.intent.action.VIEW \
  -d "unirefundsuperapp://expo-development-client/?url=http://localhost:<metroPort>"
```

Verify: sign in, open a tag detail, and confirm the early refund affordance matches the tenant's
`CountryManagement.EarlyRefund.EarlyRefundAvailable` value. The probed tenant has it `"false"`, so the expected result is **hidden**. Then sign out and confirm a cold start does not show permission-gated UI before the fetch lands.

- [ ] **Step 4: Format only what you touched**

```bash
cd super-app
npx prettier --write src/store/application-configuration.ts \
  src/providers/SessionProvider.tsx src/actions/AdministrationService/actions.ts \
  src/screens/merchant/CreateTag/useCreateTag.ts \
  src/screens/staff/StickerTag/useStickerTag.ts
```

- [ ] **Step 5: Update `AGENTS.md`**

Record the re-measured baseline and note that `country-settings/values` and the `UniRefund.Settings.GetValues` dependency are gone, so a future session does not go looking for them.

- [ ] **Step 6: Commit**

```bash
cd super-app
git add AGENTS.md src
git commit -m "docs: re-measure gates after app-config provider"
```

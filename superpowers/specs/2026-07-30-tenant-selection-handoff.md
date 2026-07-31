# Tenant selection — handoff

Companion to `2026-07-30-tenant-selection-design.md` and
`../plans/2026-07-30-tenant-selection.md`.

**Branch:** `feat/quick-access-scan-all-roles` in `super-app`
**Range:** `b7033f5..93fab69` — 12 commits are this work; `b7033f5`
("feat(tabs): scan from the center slot for every role") is pre-existing and
unrelated.

## What was verified, and how

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx jest` | 262 pass (218 at `main` + 44 new) |
| `npx eslint .` | 0 errors, 30 warnings (19 pre-existing + 11 `no-require-imports` in the new store tests) |
| Android build + boot | `BUILD SUCCESSFUL` on device `R68RC05TWLA`, boots clean, no red-box, no crash |
| Import-cycle hazard | disproved at runtime — switching to `live` issued a real request to `https://api.unirefund.com/api/saas/public-tenants`, so the module-level `getApiUrl = getGatewayUrl` binding resolves correctly |
| Selector UI (no login needed) | 3 environment chips with one selected; placeholder shown, not "Without Tenant" and not a raw id; modal opens and loads the live list; Login disabled without a tenant; middle-substring search works; selection displays by name; environment switch clears and reloads; load-error, Retry and empty states render; debug menu 5-tap works with all three chips and a successful resolve-by-name |

Two review findings were caught only because the tests are real: a mutation run
confirmed that deleting `loadTenants`' staleness guard fails exactly the
stale-environment test, and removing `await hydrateTenantStore()` fails exactly
the hydration test.

## Still to verify — needs credentials or a Mac

Everything below requires signing in, which needs real staff credentials, or
requires iOS, which cannot be built on Windows. None of it was attempted.

**The reported bug (the important one):**

1. Staff login on `dev` → pick a tenant → sign in successfully.
2. Profile → Logout.
3. On the login screen, confirm the tenant field shows the placeholder, **not**
   the previous tenant, and the environment chip is still `dev`.
4. Pick the same tenant and sign in again. It must succeed **without** changing
   the tenant and setting it back.

**Cold start:**

1. Sign in on `live` (or `uat`) with a tenant, then kill the app from the task
   switcher.
2. Relaunch. The environment chip must still be `live` and the tenant field must
   still show that tenant's name.
3. Sign in — first attempt must work.

**The rest:**

- **Theme and locale survive logout:** switch to Turkish, log in, log out — the
  app must still be in Turkish. (`AsyncStorage.clear()` used to wipe both.)
- **Traveller after staff:** sign in as staff with a tenant, log out, sign in on
  the traveller screen. Returning to the staff screen must show no tenant.
- **Offline with a selection:** airplane mode with a tenant already selected,
  relaunch, open the selector. It must show the load error with Retry, and the
  selected tenant must remain selected and still named in the field.
- **Profile picture upload after a logout→login cycle** — this exercises the
  `session` regression fixed in `a8e04d2`.
- **iOS:** `npm run ios`, then repeat the reported-bug and cold-start walks.

## Known issues left open, deliberately

Each was reviewed and judged not to block merge.

1. **`setTenants` and `reset()` write to storage fire-and-forget.** State is
   authoritative for the outgoing request, so a lost write only re-hydrates a
   tenant that the next successful load clears again. Both log on failure. No
   test covers the failing-write branch.
2. **`loadTenants` re-reads the cache after its staleness guard**, so a second
   environment switch inside that window could write a cache entry for the
   now-inactive environment. In-memory state stays correct.
3. **`setEnvironment` clears `manualTenants` in state** while the target
   environment's cache keeps its own `manual` array, so a debug-resolved tenant
   for that environment stays invisible until a cold start.
4. **The orphaned `public_tenants_cache_v1` key is never removed** on upgrade.
   Harmless, but it lingers in storage forever.
5. **`loadTenants` has no in-flight dedup**, so the debug menu pushed over the
   login screen mounts a second `TenantInput` and fires a second load.
6. **The modal mixes semantic tokens with hardcoded colours** (`#374151`,
   `#2563EB`, `border-gray-200`), so the close icon is near-invisible in dark
   mode. `.claude/rules/ui-components.md` prefers tokens.
7. **A narrow hydration race:** switching environment while hydration is still
   pending could let `doHydrate` overwrite the just-set value. Pre-dates this
   work and is narrowed by it; unreachable in practice, because the splash gates
   interaction on `isAccessTokenLoading`, which awaits hydration.
8. **No component-layer coverage** — see below.

## Two pre-existing bugs found along the way

Both are outside this work's scope and neither was touched.

**The component test suites are dead.** `jest.config.js` uses
`preset: "jest-expo/node"`, which maps `react-native` → `react-native-web`, but
`react-native-web` is not installed. So all four of
`src/components/__tests__/{BottomSheet,Button,DebouncedPressable,Toast}.test.tsx`
fail to load, and have presumably done so since they were written — `Button`,
`Toast`, `BottomSheet` and `DebouncedPressable` currently have no working
coverage at all. This is also why the new work tests pure helpers and the store
rather than rendered components, and why the Critical finding in the final
review (a modal that could not be reopened after an environment switch) could
only be caught by reading the code. Fixing the preset would make the new
components testable.

**`await clearTokens()` does not guarantee the tokens are gone.**
`src/utils/auth/token.ts:62-65` fires `SecureStore.deleteItemAsync` without
awaiting it, so `clearOldTokens` returns before the deletes land. Since `signOut`
is now `Promise.allSettled`, a failed token clear is only logged. Logout
therefore offers no guarantee the refresh token was removed.

## Repo-hygiene notes

- `npx prettier --check .` fails on **197 files at `main`**. Formatting gates
  here were scoped to touched files; a repo-wide `prettier --write` is worth
  doing as its own commit.
- The working tree carries CRLF line endings (`core.autocrlf=true`, no
  `.gitattributes`) while `.editorconfig` asks for LF, so `prettier --check`
  reports failures that are line-endings-only. A `.gitattributes` would settle it.
- `AGENTS.md` had two stale claims, both corrected here: that the project has no
  automated test suite, and that it has no ESLint or Prettier configuration.

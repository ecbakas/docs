# Onboarding Shown Once Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Once a user has successfully signed in on this device, the traveller onboarding slides never render again.

**Architecture:** A device-level `onboarding_seen` flag in AsyncStorage, written from the one funnel every real session passes through (`SessionProvider.adoptSession`), and read by a single routing-policy module (`landingRoute`) that every signed-out redirect site delegates to. Splitting storage from policy keeps the skip rule in one place instead of duplicated at each redirect.

**Tech Stack:** React Native / Expo (expo-router with `typedRoutes: true`), TypeScript, `@react-native-async-storage/async-storage`, Jest (two projects — see constraints), `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-08-11-super-app-onboarding-shown-once-design.md`

## Global Constraints

- **Work happens in the worktree** `C:\unirefund\super-app\.claude\worktrees\onboarding-shown-once`, on branch `worktree-onboarding-shown-once`, cut from `main` at `fec2a9f`. Dependencies, `.env`, and `npm run init` output are already in place — do not re-run install or init. **Never touch `c:/unirefund/super-app` itself**: that checkout is shared with another active agent session. The plan and spec live in the separate `c:/unirefund/docs` repo — do not commit source changes there.
- **Test project split:** anything that *renders* (router or component) must be named `*.router.test.tsx` or it lands in the node project and fails to load. Plain logic tests are `*.test.ts`. See the comment block at the top of `jest.config.js`.
- **Baseline is not green, and it is recorded.** Before any of this work: **7 suites fail to load** (`src/components/__tests__/{BottomSheet,Button,DebouncedPressable,SafeAreaView,Toast}.test.tsx`, `src/templates/__tests__/{Modal,TabPage}.test.tsx` — the documented `react-native-web` resolution problem), and **475 tests pass with 0 failing**. A suite-load failure among those 7 is expected; any *test* failure is a regression.
- **Prefer scoping Jest to a file path** while iterating. A full `npx jest` run is correct for the final sweep and takes ~80s.
- **No new user-visible strings** in this work, so no localization keys and no `npm run init`.
- **Storage access only through helper modules.** Never call `AsyncStorage` for these keys from a screen, hook, or provider — go through `onboardingSeen` / `rolePreference`.
- **Comment sparingly.** Existing modules in this repo carry dense docblocks; do not match that density. Comment the non-obvious decision, not the mechanism.
- **Do not edit `src/saas/**`** (generated).
- **Typecheck command:** `npm run typecheck` (`tsc --noEmit`). **Lint:** `npm run lint`.

---

### Task 1: The `onboardingSeen` storage primitive

**Files:**
- Create: `src/utils/onboardingSeen.ts`
- Test: `src/utils/__tests__/onboardingSeen.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `hasSeenOnboarding(): Promise<boolean>`
  - `markOnboardingSeen(): Promise<void>`
  - Storage key `"onboarding_seen"`, value `"true"`.
  - There is deliberately **no** clear/reset function.

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/onboardingSeen.test.ts`:

```ts
import {
  hasSeenOnboarding,
  markOnboardingSeen,
} from "@/utils/onboardingSeen";
import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("onboardingSeen", () => {
  it("reports not seen on a fresh install", async () => {
    expect(await hasSeenOnboarding()).toBe(false);
  });

  it("reports seen after it is marked", async () => {
    await markOnboardingSeen();

    expect(await hasSeenOnboarding()).toBe(true);
  });

  it("stays idempotent across repeat marks", async () => {
    await markOnboardingSeen();
    await markOnboardingSeen();

    expect(await hasSeenOnboarding()).toBe(true);
  });

  // Only the exact marker counts, so a stray value under the key cannot
  // silently retire the slides.
  it("treats an unrecognised stored value as not seen", async () => {
    await AsyncStorage.setItem("onboarding_seen", "yes");

    expect(await hasSeenOnboarding()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/utils/__tests__/onboardingSeen.test.ts`
Expected: FAIL — `Cannot find module '@/utils/onboardingSeen'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/onboardingSeen.ts`:

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Whether this device has ever completed a sign-in — the gate on the traveller
 * onboarding slides.
 *
 * Deliberately survives logout and account deletion, unlike `rolePreference`:
 * only a reinstall brings the slides back, which is why there is no clear
 * function here to reach for by mistake. Routing decisions belong in
 * `landingRoute`, not here.
 */
const ONBOARDING_SEEN_STORAGE_KEY = "onboarding_seen";

export async function hasSeenOnboarding(): Promise<boolean> {
  return (await AsyncStorage.getItem(ONBOARDING_SEEN_STORAGE_KEY)) === "true";
}

export async function markOnboardingSeen(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_SEEN_STORAGE_KEY, "true");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/utils/__tests__/onboardingSeen.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/onboardingSeen.ts src/utils/__tests__/onboardingSeen.test.ts
git commit -m "feat(onboarding): record whether this device has signed in"
```

---

### Task 2: The `landingRoute` policy

**Files:**
- Create: `src/utils/landingRoute.ts`
- Test: `src/utils/__tests__/landingRoute.test.ts`
- Read for context: `src/utils/rolePreference.ts`

**Interfaces:**
- Consumes: `hasSeenOnboarding()` from Task 1; existing `getRolePreference(): Promise<RolePreference | null>` and `type RolePreference = "traveller" | "staff"` from `@/utils/rolePreference`.
- Produces:
  - `type LandingRoute = "/role-select" | "/onboarding" | "/traveller-login" | "/staff-login"`
  - `resolveRouteForRole(role: RolePreference): Promise<LandingRoute>`
  - `resolveLandingRoute(): Promise<LandingRoute>`
  - Both functions are **total** — they never reject.

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/landingRoute.test.ts`:

```ts
import {
  resolveLandingRoute,
  resolveRouteForRole,
} from "@/utils/landingRoute";
import { hasSeenOnboarding } from "@/utils/onboardingSeen";
import { getRolePreference } from "@/utils/rolePreference";

jest.mock("@/utils/onboardingSeen", () => ({
  hasSeenOnboarding: jest.fn(),
}));

jest.mock("@/utils/rolePreference", () => ({
  getRolePreference: jest.fn(),
}));

const mockHasSeenOnboarding = hasSeenOnboarding as jest.MockedFunction<
  typeof hasSeenOnboarding
>;
const mockGetRolePreference = getRolePreference as jest.MockedFunction<
  typeof getRolePreference
>;

beforeEach(() => {
  jest.clearAllMocks();
  mockHasSeenOnboarding.mockResolvedValue(false);
  mockGetRolePreference.mockResolvedValue(null);
});

describe("resolveLandingRoute", () => {
  it("shows the gate when it has never been answered", async () => {
    expect(await resolveLandingRoute()).toBe("/role-select");
  });

  it("sends a traveller who has not signed in here to the slides", async () => {
    mockGetRolePreference.mockResolvedValue("traveller");

    expect(await resolveLandingRoute()).toBe("/onboarding");
  });

  it("sends a traveller who has signed in here straight to login", async () => {
    mockGetRolePreference.mockResolvedValue("traveller");
    mockHasSeenOnboarding.mockResolvedValue(true);

    expect(await resolveLandingRoute()).toBe("/traveller-login");
  });

  it("sends staff to the staff login", async () => {
    mockGetRolePreference.mockResolvedValue("staff");

    expect(await resolveLandingRoute()).toBe("/staff-login");
  });

  // Not redundant with the row above: pins that the traveller-only flag cannot
  // leak into the staff path.
  it("sends staff to the staff login even once the flag is set", async () => {
    mockGetRolePreference.mockResolvedValue("staff");
    mockHasSeenOnboarding.mockResolvedValue(true);

    expect(await resolveLandingRoute()).toBe("/staff-login");
    expect(mockHasSeenOnboarding).not.toHaveBeenCalled();
  });

  // The screen calling this has no catch; a rejection would leave it rendering
  // nothing, forever, with no route out.
  it("falls back to the gate when the preference cannot be read", async () => {
    mockGetRolePreference.mockRejectedValue(new Error("storage unavailable"));

    expect(await resolveLandingRoute()).toBe("/role-select");
  });
});

describe("resolveRouteForRole", () => {
  it("resolves a traveller by the seen flag", async () => {
    expect(await resolveRouteForRole("traveller")).toBe("/onboarding");

    mockHasSeenOnboarding.mockResolvedValue(true);
    expect(await resolveRouteForRole("traveller")).toBe("/traveller-login");
  });

  // Showing the slides twice is an annoyance; skipping them for a real
  // first-timer loses the intro for good, because nothing resets the flag.
  it("shows the slides when the flag cannot be read", async () => {
    mockHasSeenOnboarding.mockRejectedValue(new Error("storage unavailable"));

    expect(await resolveRouteForRole("traveller")).toBe("/onboarding");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/utils/__tests__/landingRoute.test.ts`
Expected: FAIL — `Cannot find module '@/utils/landingRoute'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/landingRoute.ts`:

```ts
import { hasSeenOnboarding } from "@/utils/onboardingSeen";
import { getRolePreference, type RolePreference } from "@/utils/rolePreference";

/**
 * Where a signed-out user belongs.
 *
 * The onboarding-seen flag is consulted here and nowhere else, so the redirect
 * sites that steer a logged-out user cannot drift apart. Both functions are
 * total: a storage failure resolves to a route, never to a rejection.
 */
export type LandingRoute =
  | "/role-select"
  | "/onboarding"
  | "/traveller-login"
  | "/staff-login";

/** Where `role` leads once chosen — shared by the gate and the landing redirect. */
export async function resolveRouteForRole(
  role: RolePreference,
): Promise<LandingRoute> {
  if (role === "staff") return "/staff-login";

  // Failing to "not seen" is the safe direction: a redundant viewing costs a
  // swipe, while wrongly skipping costs a first-timer the intro permanently,
  // since nothing ever resets the flag.
  const seen = await hasSeenOnboarding().catch(() => false);
  return seen ? "/traveller-login" : "/onboarding";
}

export async function resolveLandingRoute(): Promise<LandingRoute> {
  const role = await getRolePreference().catch(() => null);
  if (!role) return "/role-select";

  return resolveRouteForRole(role);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/utils/__tests__/landingRoute.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/landingRoute.ts src/utils/__tests__/landingRoute.test.ts
git commit -m "feat(onboarding): resolve the signed-out landing route in one place"
```

---

### Task 3: Mark the flag when a session is adopted

**Files:**
- Modify: `src/providers/SessionProvider.tsx` (imports; `adoptSession`, around lines 112-119 on this branch)
- Create: `src/providers/__tests__/onboardingAdoption.router.test.tsx`

**Interfaces:**
- Consumes: `markOnboardingSeen()` from Task 1.
- Produces: no new exports. Behavioural contract for reviewers — `markOnboardingSeen` is called exactly when `adoptSession`'s profile load succeeds, and is not awaited.

**Why here:** `adoptSession` is the single funnel for every real session — credentials `signIn`, Didit `signInWithDidit`, and the cold-launch token bootstrap. Gating on `loaded` reuses the provider's own definition of a usable session: a token that cannot produce a profile is released rather than adopted, and must not burn the onboarding.

**Note on the test file:** this branch is cut from `main`, which has no SessionProvider test suite, so this task builds its own. The mock block is large because mounting `SessionProvider` means standing up its whole bootstrap path; that is the cost of covering the one rule this feature turns on. Mock only what the provider reaches — do not add mocks speculatively.

- [ ] **Step 1: Write the failing test**

Create `src/providers/__tests__/onboardingAdoption.router.test.tsx`:

```tsx
import { getUserProfileApi } from "@/actions/AccountService/actions";
import { RootNavigator } from "@/features/RootNavigator";
import { SessionProvider } from "@/providers/SessionProvider";
import useUserStore from "@/store/user";
import { markOnboardingSeen } from "@/utils/onboardingSeen";
import { Slot } from "expo-router";
import { renderRouter, screen } from "expo-router/testing-library";
import React from "react";
import { Text } from "react-native";

/**
 * When a session retires the onboarding slides.
 *
 * The rule: a token only spends the user's one first run if it actually
 * produces a profile. `SessionProvider` is the real module — the flag write is
 * the subject, so only the network and storage under it are faked.
 */

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("expo-keep-awake", () => ({ useKeepAwake: () => undefined }));

jest.mock("@/utils/auth/token", () => ({
  getToken: jest.fn(async () => "stored-access-token"),
  saveToken: jest.fn(async () => undefined),
  clearToken: jest.fn(async () => undefined),
  clearTokens: jest.fn(async () => undefined),
}));

jest.mock("@/utils/auth/decodeJWT", () => ({
  decodeJWT: () => ({ sub: "u1" }),
}));

jest.mock("@/actions/AccountService/actions", () => ({
  getUserProfileApi: jest.fn(async () => ({ userName: "traveller" })),
  getGrantedPoliciesApi: jest.fn(async () => ({})),
  getCurrentUserIdApi: jest.fn(async () => "u1"),
  getProfilePictureByIdApi: jest.fn(async () => null),
}));

jest.mock("@/actions/AdministrationService/actions", () => ({
  getCountrySettingsInfo: jest.fn(async () => null),
}));

jest.mock("@/actions/CRMService/actions", () => ({
  getUserAffiliationsApi: jest.fn(async () => []),
}));

jest.mock("@/actions/TravellerService/actions", () => ({
  getTravellerAccessToken: jest.fn(),
}));

jest.mock("@/actions/auth/actions", () => ({
  getApiUrl: jest.fn(async () => "https://gateway.test"),
  getSupportedScopes: jest.fn(async () => "openid offline_access"),
  loginWithCredentials: jest.fn(),
}));

jest.mock("@/utils/rolePreference", () => ({
  clearRolePreference: jest.fn(async () => undefined),
  getRolePreference: jest.fn(async () => null),
}));

jest.mock("@/utils/onboardingSeen", () => ({
  markOnboardingSeen: jest.fn(async () => undefined),
}));

const mockMarkOnboardingSeen = markOnboardingSeen as jest.MockedFunction<
  typeof markOnboardingSeen
>;
const mockGetUserProfileApi = getUserProfileApi as jest.MockedFunction<
  typeof getUserProfileApi
>;

const routes = {
  _layout: () => (
    <SessionProvider>
      <RootNavigator />
    </SessionProvider>
  ),
  "(auth)/_layout": () => <Slot />,
  "(auth)/index": () => <Text>Home</Text>,
  "(public)/_layout": () => <Slot />,
  // Which login flow a logged-out user gets is not this suite's business.
  "(public)/index": () => <Text>Landing</Text>,
  loading: () => <Text>Loading</Text>,
  "tag-preview": () => <Text>Tag preview</Text>,
  validate: () => <Text>Validate</Text>,
  "sticker-tag": () => <Text>Sticker tag</Text>,
  "manual-entry": () => <Text>Manual entry</Text>,
  "(modals)/language-selector": () => <Text>Language selector</Text>,
};

beforeEach(() => {
  jest.clearAllMocks();
  useUserStore.setState({ user: null, role: null });
});

describe("the onboarding slides after a session is adopted", () => {
  it("retires them once a stored token produces a profile", async () => {
    renderRouter(routes, { initialUrl: "/" });
    expect(await screen.findByText("Home")).toBeTruthy();

    expect(mockMarkOnboardingSeen).toHaveBeenCalled();
  });

  // A token that cannot produce a profile is not a session — the provider
  // releases it — so it must not spend the user's one first run.
  it("leaves them in place when the token cannot produce a profile", async () => {
    mockGetUserProfileApi.mockRejectedValueOnce(new Error("profile down"));

    renderRouter(routes, { initialUrl: "/" });
    expect(await screen.findByText("Landing")).toBeTruthy();

    expect(mockMarkOnboardingSeen).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/providers/__tests__/onboardingAdoption.router.test.tsx`
Expected: "retires them once a stored token produces a profile" FAILS with `expect(jest.fn()).toHaveBeenCalled()` / "Number of calls: 0". "leaves them in place" passes trivially.

If instead the suite fails to *load* or both tests error, the mock set is wrong for this branch — fix the fixture before touching `SessionProvider.tsx`, and report which mock was missing.

- [ ] **Step 3: Write minimal implementation**

In `src/providers/SessionProvider.tsx`, add the import next to the existing `clearRolePreference` import:

```ts
import { markOnboardingSeen } from "@/utils/onboardingSeen";
```

Replace the body of `adoptSession`:

```ts
  async function adoptSession(token: string, opts?: { role?: UserRole }) {
    publishAccessToken(token);
    const loaded = await getUserData(token, opts);
    if (!loaded) {
      publishAccessToken(null);
      return loaded;
    }

    // The first real session on this device retires the onboarding slides for
    // good. Not awaited: this function's resolution gates the UI and already
    // races an 8s bootstrap timeout, and a failed write only costs one extra
    // viewing.
    markOnboardingSeen().catch((error) =>
      logger.error("Failed to record onboarding as seen:", error),
    );
    return loaded;
  }
```

Leave the existing docblock above `adoptSession` in place; append this sentence to it:

```
   * A session that loads is also what retires the onboarding slides — see
   * `onboardingSeen`.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/providers/__tests__/onboardingAdoption.router.test.tsx`
Expected: PASS — 2 tests.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/providers/SessionProvider.tsx src/providers/__tests__/onboardingAdoption.router.test.tsx
git commit -m "feat(onboarding): retire the slides once a session loads"
```

---

### Task 4: Route the signed-out landing through the policy

**Files:**
- Modify: `src/app/(public)/index.tsx` (whole file — it is 50 lines)
- Test: `src/app/__tests__/rootGuard.router.test.tsx`

**Interfaces:**
- Consumes: `resolveLandingRoute()` and `type LandingRoute` from Task 2.
- Produces: no new exports. The local `type Target` union is deleted in favour of the imported `LandingRoute`.

- [ ] **Step 1: Write the failing test**

In `src/app/__tests__/rootGuard.router.test.tsx`:

Add this mock immediately after the existing `jest.mock("@/utils/rolePreference", ...)` block (around line 38). The real `landingRoute` module is deliberately **not** mocked — the test should exercise the app's actual steering, not a stub of it:

```ts
// Whether this device has ever signed in. Storage isn't the subject here, so
// drive the flag directly and let the real policy module resolve the route.
let mockHasSeenOnboarding = false;
jest.mock("@/utils/onboardingSeen", () => ({
  hasSeenOnboarding: () => Promise.resolve(mockHasSeenOnboarding),
}));
```

Add a route stub to the `routes` object, next to `"(public)/onboarding"`:

```ts
  "(public)/traveller-login": () => <Text>Traveller login</Text>,
```

Add the reset to the existing `beforeEach`, after `mockRolePreference = null;`:

```ts
  mockHasSeenOnboarding = false;
```

Rename the existing test at line 96 and add its sibling — replace:

```ts
  it("sends a returning traveller to onboarding", async () => {
    mockRolePreference = "traveller";

    renderRouter(routes, { initialUrl: "/" });

    expect(await screen.findByText("Onboarding")).toBeTruthy();
  });
```

with:

```ts
  it("sends a traveller who has never signed in here to onboarding", async () => {
    mockRolePreference = "traveller";

    renderRouter(routes, { initialUrl: "/" });

    expect(await screen.findByText("Onboarding")).toBeTruthy();
  });

  // The slides are a first-run introduction. Once this device has completed a
  // sign-in they are spent, and logging out does not hand them back.
  it("sends a traveller who has signed in here straight to login", async () => {
    mockRolePreference = "traveller";
    mockHasSeenOnboarding = true;

    renderRouter(routes, { initialUrl: "/" });

    expect(await screen.findByText("Traveller login")).toBeTruthy();
    expect(screen.queryByText("Onboarding")).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/app/__tests__/rootGuard.router.test.tsx`
Expected: "sends a traveller who has signed in here straight to login" FAILS — `Onboarding` renders because `index.tsx` still branches on the role preference alone. All other tests in the file pass.

- [ ] **Step 3: Write minimal implementation**

Replace `src/app/(public)/index.tsx` in full:

```tsx
import { useSession } from "@/providers/SessionProvider";
import { resolveLandingRoute, type LandingRoute } from "@/utils/landingRoute";
import { Redirect } from "expo-router";
import { useEffect, useState } from "react";

/**
 * Logged-out landing for `/`.
 *
 * `/` is the URL the app cold-launches to. The authed home `(auth)/index` also
 * lives at `/`, but the `Stack.Protected` guard in the root layout removes it
 * when there's no session, leaving this public screen to decide where to go.
 *
 * Where that is belongs to `landingRoute`, which weighs the persisted role
 * preference against whether this device has ever completed a sign-in. This
 * screen only owns the timing.
 *
 * None of that applies to a user who still holds a token — they belong on Home.
 * The root guard hands `/` to `(auth)` as soon as the stored token surfaces, so
 * this screen stands down until the session has settled rather than racing it
 * with a redirect into the login flow.
 */
export default function PublicIndex() {
  const { session, isLoading: isSessionLoading } = useSession();
  const [target, setTarget] = useState<LandingRoute | null>(null);

  useEffect(() => {
    resolveLandingRoute().then(setTarget);
  }, []);

  // Wait for the target to resolve before redirecting so we don't flash the
  // gate for a returning user who already chose.
  if (!target) return null;

  // Bootstrap still running, or a token already in hand: `(auth)` owns `/`.
  if (isSessionLoading || session) return null;

  return <Redirect href={target} />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/app/__tests__/rootGuard.router.test.tsx`
Expected: PASS — 8 tests (the 7 that were there, plus the new one).

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(public)/index.tsx" src/app/__tests__/rootGuard.router.test.tsx
git commit -m "feat(onboarding): skip the slides on a device that has signed in"
```

---

### Task 5: Route the role gate through the policy

**Files:**
- Modify: `src/screens/shared/RoleGateScreen.tsx` (imports; `navigate` and `choose`, around lines 66-93)

**Interfaces:**
- Consumes: `resolveRouteForRole()` and `type LandingRoute` from Task 2.
- Produces: no new exports. `navigate` changes signature from `(role: RolePreference)` to `(target: LandingRoute)`.

**No new test, deliberately.** The change is an added `await` inside an existing async handler feeding an existing reanimated completion callback. The behaviour that matters — which target a role maps to — is `resolveRouteForRole`, covered directly by Task 2. A render test here would have to drive reanimated timing callbacks to assert a routing rule it does not own.

- [ ] **Step 1: Add the import**

In `src/screens/shared/RoleGateScreen.tsx`, add next to the existing `rolePreference` import:

```ts
import { resolveRouteForRole, type LandingRoute } from "@/utils/landingRoute";
```

- [ ] **Step 2: Replace `navigate` and `choose`**

Replace lines 66-93 with:

```tsx
  // Takes a resolved target rather than a role: this runs through `runOnJS`
  // from a reanimated callback, so it has to stay synchronous.
  function navigate(target: LandingRoute) {
    router.replace(target);
  }

  async function choose(role: RolePreference) {
    if (busy) return;
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await setRolePreference(role);
    const target = await resolveRouteForRole(role);

    if (role === "traveller") {
      // Red grows downward to fill; dark collapses.
      travellerFlex.value = withTiming(1, { duration: REVEAL_MS });
      staffFlex.value = withTiming(0, { duration: REVEAL_MS }, (finished) => {
        if (finished) runOnJS(navigate)(target);
      });
    } else {
      // Dark grows upward to fill; red collapses.
      staffFlex.value = withTiming(1, { duration: REVEAL_MS });
      travellerFlex.value = withTiming(
        0,
        { duration: REVEAL_MS },
        (finished) => {
          if (finished) runOnJS(navigate)(target);
        },
      );
    }
  }
```

Resolving before the reveal starts means the 300ms animation covers the storage read, so the extra `await` costs no perceptible delay.

- [ ] **Step 3: Update the screen docblock**

The docblock above `RoleGateScreen` (around line 28) ends with "then forwards to the matching login flow." Replace that closing clause with:

```
 * then forwards to the matching login flow — which skips the onboarding slides
 * for a traveller on a device that has already completed a sign-in.
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck`
Expected: no errors. In particular `runOnJS(navigate)(target)` must typecheck — `navigate` now takes `LandingRoute`.

Run: `npm run lint`
Expected: no new errors for this file.

Run: `npx jest src/app/__tests__/rootGuard.router.test.tsx`
Expected: still PASS — this file imports nothing from `RoleGateScreen`, so it is a regression check only.

- [ ] **Step 5: Commit**

```bash
git add src/screens/shared/RoleGateScreen.tsx
git commit -m "feat(onboarding): let the role gate skip spent slides"
```

---

### Task 6: Send a deleted account to the gate, not to onboarding

**Files:**
- Modify: `src/screens/shared/Profile/_components/DeleteAccountModal.tsx:27`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing.

**Why:** the flag now survives account deletion (a deliberate spec decision), so hard-routing a just-deleted account into `/onboarding` contradicts the rule the rest of this work establishes — and would be the one remaining way to see the slides after signing in. `signOut` has already cleared the role preference by that point, so the gate is where that user genuinely belongs, and it is what `resolveLandingRoute` would return.

- [ ] **Step 1: Change the redirect**

In `handleDelete`, replace:

```tsx
      router.replace("/onboarding");
```

with:

```tsx
      // `signOut` just cleared the role preference, so the gate is the honest
      // landing. Not `/onboarding` — deletion does not reset the seen flag.
      router.replace("/role-select");
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: no errors.

No test run here: this file has no suite of its own, and a `src/screens` sweep would only surface the baseline component-suite failures documented in `jest.config.js`.

- [ ] **Step 3: Confirm no route to `/onboarding` remains outside the policy**

Run: `rg -n "/onboarding" src` (or `grep -rn "/onboarding" src --include=*.ts --include=*.tsx`).
Expected: exactly three kinds of hit, and nothing else —
  1. `src/utils/landingRoute.ts` — the policy returning it.
  2. `src/app/(public)/_layout.tsx` — the route registration.
  3. `src/app/__tests__/rootGuard.router.test.tsx` — the route stub and assertions.

If any screen still navigates to `/onboarding` directly, it is a missed read site: route it through `resolveRouteForRole` before finishing this task.

- [ ] **Step 4: Commit**

```bash
git add src/screens/shared/Profile/_components/DeleteAccountModal.tsx
git commit -m "fix(profile): land a deleted account on the role gate"
```

---

### Task 7: Full verification sweep

**Files:** none — verification only.

- [ ] **Step 1: Typecheck and lint the whole app**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run lint`
Expected: no new errors versus the pre-work baseline.

- [ ] **Step 2: Run every suite this work touches**

```bash
npx jest src/utils/__tests__/onboardingSeen.test.ts src/utils/__tests__/landingRoute.test.ts src/app/__tests__/rootGuard.router.test.tsx src/providers/__tests__/onboardingAdoption.router.test.tsx
```

Expected: all PASS.

Then confirm nothing else regressed with a full run — `npx jest` — and compare against the recorded baseline: **7 suites failing to load, 475 tests passing, 0 tests failing.** After this work the expected shape is the same 7 suites failing to load, with the passing count risen by the tests these tasks added. Any *test* failure (as opposed to a suite-load failure) is a regression, whatever the totals say.

- [ ] **Step 3: Walk the behaviour on a device**

Start with `npx expo start --offline` (the `--offline` flag is required in this environment) and confirm, in order:

1. Fresh install → role gate → tap Traveller → **slides appear** → last slide → traveller login.
2. Kill the app before logging in, relaunch → **slides appear again** (a viewer who never signed in has not spent them).
3. Log in → Home.
4. Kill and relaunch → Home, no slides.
5. Log out → role gate → tap Traveller → **traveller login directly, no slides**.
6. Kill and relaunch → role gate → Traveller → traveller login, still no slides.

Step 5 is the fix. Step 2 is the boundary that proves "seen" means a completed sign-in and not merely a viewing.

- [ ] **Step 4: Report**

Summarise: which suites ran and their result, the typecheck/lint result, and which of the six manual steps were confirmed. Name anything not verified rather than implying full coverage.

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
| --- | --- |
| `onboardingSeen` storage primitive, own key, no clear function | 1 |
| `landingRoute` policy, both functions total | 2 |
| Write site in `adoptSession`, gated on `loaded`, fire-and-forget | 3 |
| `(public)/index.tsx` delegates to the policy | 4 |
| `RoleGateScreen` resolves before the animation, `navigate` stays sync | 5 |
| `DeleteAccountModal` redirect `/onboarding` → `/role-select` | 6 |
| Error handling: seen-read fails → `/onboarding` | 2 (test + impl) |
| Error handling: role-read fails → `/role-select` | 2 (test + impl) |
| Policy matrix incl. staff-with-flag | 2 |
| `rootGuard.router.test.tsx` extended with the onboarded-traveller case | 4 |
| Nothing in-app resets the flag | 1 (no clear fn) + 6 (Step 3 sweep) |

**Type consistency:** `LandingRoute` is defined once in Task 2 and imported by Tasks 4 and 5. `hasSeenOnboarding` / `markOnboardingSeen` are named identically in Tasks 1, 2 and 3. `resolveRouteForRole` takes `RolePreference` (Tasks 2, 5); `resolveLandingRoute` takes nothing (Tasks 2, 4).

**Deviation from the spec, noted:** the spec said the write site would get no dedicated test. Task 3 adds two, in a suite it builds itself. The write site is the rule this whole feature turns on ("once user logs in"), and shipping it with only a typecheck behind it was the weakest point in the plan. The cost is a ~70-line mock block to mount `SessionProvider`; the return is the `loaded` gate pinned in both directions, including the case where a token that cannot produce a profile must not spend the user's one first run.

**Branch context:** this work is cut from `main`, which has no SessionProvider test suite. An unrelated in-flight branch elsewhere adds `sessionLifecycle.router.test.tsx`, which mounts the same provider for session-expiry behaviour. If both land, the two suites are worth a look for a shared fixture — but they test different rules and neither blocks the other.

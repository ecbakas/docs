# Onboarding shown once: a seen-flag that outlives logout

**Date:** 2026-08-11
**Repos:** `super-app`

## Problem

The traveller onboarding slides are meant to be a first-run introduction. They
are not: a traveller can be shown them any number of times, on two separate
paths.

`(public)/index.tsx` is the logged-out landing. It steers off the persisted
`role_preference` — unset → `/role-select`, `traveller` → `/onboarding`, `staff`
→ `/staff-login`. `RoleGateScreen.navigate` sends a traveller to `/onboarding`
too. Onboarding's last slide pushes `/traveller-login`.

Nothing in that chain records that the slides were ever shown. So:

1. **Cold launch while logged out with `role_preference === "traveller"`** —
   straight back to the slides, every launch.
2. **After logout** — `signOut` calls `clearRolePreference()`, so the role gate
   reappears; picking traveller replays the slides.

A user who signs in, uses the app for a month, and logs out is handed the
same three "welcome, here's what this app is" screens as someone who installed
it a minute ago.

## Goal

Once a user has successfully signed in on this device, the onboarding slides
never render again.

## Decisions established up front

- **"Seen" means a completed sign-in**, not swiping to the last slide and not
  merely opening the screen. A user who views the slides and abandons before
  authenticating sees them again next launch — they never finished the thing
  onboarding exists to lead into.
- **Nothing in-app ever resets the flag.** Logout keeps it. Account deletion
  keeps it. The slides return only when device storage goes away (uninstall, or
  clear-data). No "view intro again" affordance.
- **Any successful session sets it, regardless of role.** One device-level flag,
  one write site. A staff user who later answers the gate with "traveller" skips
  the slides; that is accepted. The alternative costs a role-dependent write
  ordered after affiliation resolution, to change behaviour in a case that
  barely occurs.
- **The role gate is out of scope.** `signOut` keeps clearing
  `role_preference`, so a returning traveller still answers the gate after every
  logout — they just land on `/traveller-login` instead of the slides.
- **Device-level, not account-level.** Onboarding is decided *before*
  authentication, so there is no user identity to key on and no way to consult a
  backend setting at the moment the decision is made. A returning user on a new
  device sees the slides once. This is inherent to a pre-login screen, not a
  compromise in the storage choice.

## Approach

Two new modules: a persistence primitive, and the routing policy that reads it.

Splitting them is the whole point. The rule "a traveller who has signed in goes
to login, not onboarding" is needed at two redirect sites that are structurally
unlike each other — one resolves from persisted state during a redirect render,
the other from a role the user just tapped, mid-animation. Inlining the rule at
both duplicates it and invites drift. One resolver means one place to change.

### Rejected alternatives

**Self-guarding onboarding screen** — `/onboarding` reads the flag on mount and
replaces itself with `/traveller-login`. One read site, impossible to miss. But
it mounts the screen and then leaves, producing a flash of slide 1 or a blank
hold, plus a junk history entry. It enforces "never show" only after the screen
is already on stage, which is the exact defect being fixed.

**Fold the flag into `role_preference`** — one key, one read. Rejected because
the two values have opposite lifetimes: `role_preference` is deliberately
cleared on logout, and this flag must survive it. A single key with two clearing
rules is how the bug comes back. `rolePreference.ts` also declares itself the
single source of truth for the gate answer; widening it dilutes that.

## Scope

| Surface | What changes |
| --- | --- |
| `utils/onboardingSeen.ts` | **New.** Storage primitive over an `onboarding_seen` key |
| `utils/landingRoute.ts` | **New.** The signed-out routing policy |
| `providers/SessionProvider.tsx` | `adoptSession` marks the flag on a loaded session |
| `app/(public)/index.tsx` | Delegates its target to `resolveLandingRoute` |
| `screens/shared/RoleGateScreen.tsx` | Resolves the target before the reveal animation |
| `screens/shared/Profile/_components/DeleteAccountModal.tsx` | Post-delete redirect `/onboarding` → `/role-select` |
| `utils/__tests__/landingRoute.test.ts` | **New.** Policy matrix |
| `app/__tests__/rootGuard.router.test.tsx` | Extend the traveller-landing cases |

### The storage primitive

`src/utils/onboardingSeen.ts`, a direct mirror of `rolePreference.ts` — same
AsyncStorage-module shape, same "read and write through these helpers rather
than touching the key directly" contract, its own key.

```ts
hasSeenOnboarding(): Promise<boolean>
markOnboardingSeen(): Promise<void>
```

No clear function. Nothing in the app is permitted to reset this, and not
offering the affordance is how that stays true.

### The policy

`src/utils/landingRoute.ts` owns where a signed-out user belongs.

```ts
export type LandingRoute =
  | "/role-select" | "/onboarding" | "/traveller-login" | "/staff-login";

/** Where `role` leads once chosen. The seen-flag is consulted only here. */
export async function resolveRouteForRole(
  role: RolePreference,
): Promise<LandingRoute>;

/** Where a signed-out user belongs, resolved from persisted device state. */
export async function resolveLandingRoute(): Promise<LandingRoute>;
```

`resolveLandingRoute` reads the role preference, returns `/role-select` when
unset, and otherwise defers to `resolveRouteForRole`. `resolveRouteForRole`
returns `/staff-login` for staff, and for traveller consults
`hasSeenOnboarding()` — `/traveller-login` when seen, `/onboarding` when not.

Both are total: they never reject. See *Error handling*.

### The write site

`SessionProvider.adoptSession` calls `markOnboardingSeen()` when `loaded` is
true.

`adoptSession` is the funnel every real session passes through — credentials
`signIn`, Didit `signInWithDidit`, and the cold-launch token bootstrap — which
is what makes one write site sufficient. Gating on `loaded` reuses the
provider's own definition of a usable session: a token that cannot produce a
profile is released rather than adopted, and must not burn the onboarding.

Fire-and-forget with a logged `.catch`, not awaited. `adoptSession`'s resolution
gates the UI and is already racing an 8s timeout during bootstrap; a storage
write has no business inside that. The write repeats on every launch with a
stored token — a one-byte idempotent `setItem` is cheaper than the read that
would avoid it.

### The read sites

**`(public)/index.tsx`** — its `useEffect` calls `resolveLandingRoute()` instead
of `getRolePreference()`, and the local `Target` union is replaced by the
exported `LandingRoute`. The screen keeps its existing shape: hold on `null`
until the target resolves, and stand down while `isSessionLoading || session`.

**`RoleGateScreen`** — `choose(role)` is already `async` and already awaits
`setRolePreference`, so it awaits `resolveRouteForRole(role)` there and passes
the resolved target into the animation completion callback. `navigate` must stay
synchronous because it is invoked through `runOnJS` from a reanimated callback;
it therefore takes the target as an argument rather than computing one. Doing
the await before the reveal starts also means the 300ms animation covers the
storage read entirely.

**`DeleteAccountModal`** — `router.replace("/onboarding")` becomes
`/role-select`. With the flag surviving deletion, routing a just-deleted account
into onboarding contradicts the rule this spec establishes. `signOut` has
already cleared the role preference at that point, so the gate is where that
user genuinely belongs, and it is what `resolveLandingRoute` would return.

## Error handling

`resolveLandingRoute` and `resolveRouteForRole` catch storage failures and never
reject.

A failed read of the seen-flag falls back to **not seen**, so the slides show.
The asymmetry is deliberate: showing onboarding to a returning user is a mild
annoyance, while skipping it for a genuine first-timer loses the introduction
permanently, since nothing will ever reset the flag to give them another chance.

A failed read of the *role preference* is a different failure and resolves
separately: with no answer to the gate question there is no role to route on, so
`resolveLandingRoute` returns `/role-select` and lets the user answer it again.

This also closes an existing hole. `(public)/index.tsx` currently calls
`getRolePreference().then(...)` with no `.catch`; a throwing read produces an
unhandled rejection and leaves `target` at `null`, so the screen renders `null`
forever with no route out. Making the resolver total fixes that as a side
effect.

A failed *write* is logged and otherwise ignored. The user sees onboarding one
more time; the next successful sign-in writes the flag again.

## Testing

**`utils/__tests__/landingRoute.test.ts`** (node project — plain logic, no
renderer). Mocks the two storage modules and covers the policy matrix:

| Role preference | Seen flag | Expected |
| --- | --- | --- |
| unset | not read | `/role-select` |
| `traveller` | false | `/onboarding` |
| `traveller` | true | `/traveller-login` |
| `staff` | false | `/staff-login` |
| `staff` | true | `/staff-login` |
| `traveller` | read throws | `/onboarding` |
| read throws | — | `/role-select` |

The staff-with-flag row is not redundant: it pins that the flag cannot leak into
the staff path. The two throw rows cover different failures — the seen-flag read
failing, and the role-preference read failing — and resolve independently.

**`app/__tests__/rootGuard.router.test.tsx`.** Its existing
`@/utils/rolePreference` mock no longer drives the outcome on its own, since the
screen now calls `resolveLandingRoute`. Mock `@/utils/onboardingSeen` alongside
it and let the real policy module run, so the test still exercises the app's
actual steering rather than a stub of it. The case at line 96, "sends a
returning traveller to onboarding", keeps its meaning with the flag false, and
gains a sibling asserting that a returning *onboarded* traveller reaches
`/traveller-login` and never renders `Onboarding`.

`RoleGateScreen` is not covered by a new render test. Its change is an added
await inside an existing async handler feeding an existing reanimated
completion callback; the behaviour that matters — which target a role maps to —
is the resolver, and that is unit-tested directly.

## Verification

- `npx jest src/utils/__tests__/landingRoute.test.ts`
- `npx jest src/app/__tests__/rootGuard.router.test.tsx`
- `npx tsc --noEmit`

Seven suites in this repo fail at baseline for reasons documented in
`jest.config.js` (component suites sitting in the wrong project). Compare
against that baseline rather than expecting a clean full run, and scope test
commands to specific files — a bare `npm test` also picks up sibling worktrees.

No new user-visible strings, so no `npm run init` and no localization keys.

## Known and accepted

Because the onboarding screen does not guard itself — a deliberate choice, see
*Rejected alternatives* — the route stays reachable by deep link. On a
signed-out device that has already completed a sign-in,
`unirefundsuperapp://onboarding` renders the slides.

Accepted rather than closed. No in-app path reaches it, it requires an
externally supplied URL, and `Stack.Protected` removes the whole `(public)`
group while signed in, so it cannot fire for a signed-in user. Closing it would
mean reintroducing the screen-level self-guard this spec rejected, to defend
against a case no user reaches by using the app.

## Out of scope

- Changing whether `signOut` clears `role_preference`. The role gate continues
  to appear after every logout.
- Any backend or per-account persistence of onboarding state.
- A manual "view the intro again" entry point.
- The content, copy, or visual design of the onboarding slides.

# super-app — traveller login environment prefix

Branch `feat/traveller-env-prefix` (unirefund-mobile), worktree
`C:/unirefund/super-app-wt-env-login`. Decided with the user 2026-11-05.

## Why

Testers need traveller accounts on dev and uat (and live once it ships). The
traveller login screen shows no environment UI, so in practice it always used
the device's stored environment, which defaults to `dev`.

## What already existed

The staff environment chips write one persisted setting:
`useTenantStore.environment`, AsyncStorage key `debug_environment`. Every request
reads it through `getGatewayUrl()`: the password and refresh grants, every
generated service client, Novu (`buildNovuUrls`) and the legal links. Traveller
login, Didit sign-in, registration and forgot-password never hard-coded dev.
They read the same setting.

## Decisions (user's picks)

| Question | Decision |
|---|---|
| Prefix | `dev:` / `uat:` / `live:` (alias `prod:`), case-insensitive, spaces trimmed. `dev-` was rejected because the field also takes emails (`dev-ali@gmail.com`). A colon is not a valid ABP username or unquoted email character. |
| No prefix | The build default, `DEFAULT_ENVIRONMENT` (dev today). Flipping that one constant at prod launch makes a plain username mean live. Live answered 503 on 2026-11-05, and App Store reviewers sign in on dev. |
| Release builds | Honoured in every build. It picks among servers the staff screen already shows openly in release. |
| Didit sign-in / Create account / Forgot password | Follow the prefix in the username box. An empty box means the build default. |

My own calls: a warning badge (`UAT`) above the version line while the box
names a non-default environment. The environment then stays switched after
logout, as with staff. The next traveller action re-derives it from the box.

## How

- `src/utils/travellerLogin.ts` holds the pure `parseTravellerLogin(input)`,
  which returns `{ environment, username }`. Input without a prefix is passed
  through untouched.
- `src/store/tenant.ts` gains `ensureEnvironment(env)`, which calls
  `setEnvironment` only when the environment differs. It hydrates first, so a
  late hydration cannot restore the old value.
- `TravellerLoginScreen` calls `ensureEnvironment` before the password grant
  and before each Didit flow, then signs in with the stripped username. Submit
  stays disabled for a bare prefix.

`src/utils/environment.ts` is core-owned and is not touched.

## Account availability (probed 2026-11-05)

`tur-a25y29041` signs in on dev. Uat answers "Invalid username or password". Live
discovery returns 503.

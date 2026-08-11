# Auth.js Cookie Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `apps/ssr` and `apps/web` distinct Auth.js cookie names so a login on one
localhost port no longer signs the user in to the other.

**Architecture:** Both apps import one shared `NextAuth({...})` instance from
`packages/utils/auth/auth.ts` that currently passes no `cookies` option, so both fall back
to identical Auth.js defaults on a shared `localhost` host. The fix derives an app name
from `basename(process.cwd())` — which Next.js guarantees is the app's own directory,
since that is how it locates each app's `next.config.js` and `.env` — and uses it to
prefix three cookie names. One file changes.

**Tech Stack:** Next.js 16.2, `next-auth@5.0.0-beta.25`, `@auth/core@0.30.0`, pnpm
workspaces, Turborepo, TypeScript 6.0.2.

**Spec:** `docs/superpowers/specs/2026-08-11-authjs-cookie-isolation-design.md`

## Global Constraints

- Only `packages/utils/auth/auth.ts` may change. No `.env`, no `turbo.json`, no
  `next.config.js`, no app code, no new dependency, no new env var.
- The cookie override applies in **every** environment. Do not gate it on `NODE_ENV`,
  and do not gate it on anything else. A local `next start` must isolate exactly as
  `next dev` does — that is the requirement this plan exists to satisfy.
- Supply **only** the `name` field for each cookie. Never restate `httpOnly`, `sameSite`,
  `path`, or `secure`. `@auth/core@0.30.0` `lib/init.js:73` deep-merges the override over
  `defaultCookies(...)`, so those attributes keep coming from Auth.js per request.
  Restating them creates a second source of truth that can drift from the framework's.
- Do **not** add `__Secure-` or `__Host-` prefixes to the names, and do **not** set
  `useSecureCookies`. The spec rules both out: they would break login over
  `http://localhost` under a local production build.
- Do **not** convert the config to the request-aware function form
  `NextAuth((req) => ...)`. `next-auth/index.js:101-125` passes the request only to
  `handlers` and `auth`; `signIn`, `signOut`, and `unstable_update` receive
  `config(undefined)`. All are used in this codebase, so a request-derived name would
  differ between the write path and the read path.
- Override exactly three cookies: `sessionToken`, `callbackUrl`, `csrfToken`. Leave
  `pkceCodeVerifier`, `state`, `nonce`, and `webauthnChallenge` alone — they are OAuth-only
  and both providers here are `Credentials`.
- Comment sparingly. One short comment explaining why `process.cwd()` is trustworthy is
  warranted because that is non-obvious; nothing else needs narrating.

## File Structure

| File | Change | Responsibility |
| --- | --- | --- |
| `packages/utils/auth/auth.ts` | Modify | Add the `node:path` import, the `APP_COOKIE_PREFIX` constant, and the `cookies` key on the existing `NextAuth({...})` call. |

No files are created. No files are deleted.

## Testing Note

`packages/utils` has no test runner — its `package.json` declares
`"test": "echo \"Error: no test specified\" && exit 1"`, and the monorepo's only Jest
setup lives in `packages/ayasofyazilim-ui`. Adding a runner for a six-line change is not
justified, so this plan does not fabricate one.

The red/green cycle instead uses a real HTTP assertion against `GET /api/auth/csrf`. That
endpoint issues the csrf cookie, requires no credentials, and is reachable because both
apps' proxy matchers exclude `api`. It observes the actual `Set-Cookie` name the running
server produces, which is precisely the behaviour under change.

---

### Task 1: Derive the app name and override the cookie names

**Files:**
- Modify: `packages/utils/auth/auth.ts` (imports at lines 1-18; `NextAuth({...})` call opening at line 115; `session: { strategy: "jwt" },` at line 209)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: cookie names `<app>.authjs.session-token`, `<app>.authjs.callback-url`, and
  `<app>.authjs.csrf-token`, where `<app>` is `ssr` or `web`. Task 2 asserts these exact
  strings. The module's exports (`handlers`, `auth`, `signIn`, `signOut`,
  `tokenStoreStatus`) are unchanged in name and type.

- [ ] **Step 1: Capture the failing baseline**

Start the web app on a pinned port. Pinning the port on the command line keeps this
reproducible without editing committed config — neither app pins one today, so start
order otherwise decides who gets 3000.

```powershell
cd c:\unirefund\web-app\apps\web
pnpm run init
pnpm exec next dev --turbopack -p 3000
```

In a second terminal, ask for the csrf cookie:

```powershell
curl.exe -i http://localhost:3000/api/auth/csrf
```

Expected — the bug, visible in the response header:

```
set-cookie: authjs.csrf-token=...; Path=/; HttpOnly; SameSite=Lax
```

Record that the name is `authjs.csrf-token` with no app prefix. This is the failing state.
Leave the server running.

- [ ] **Step 2: Add the import**

In `packages/utils/auth/auth.ts`, add to the existing import block at the top of the file:

```ts
import { basename } from "node:path";
```

- [ ] **Step 3: Add the app-name constant**

Add immediately above the `const result = NextAuth({` line (currently line 115):

```ts
// Next runs each app from its own directory, so this is "ssr" or "web". Both apps
// share this config and the same localhost host in dev, and cookies ignore ports -
// without distinct names a login in one shows up as a login in the other.
const APP_COOKIE_PREFIX = basename(process.cwd());
```

- [ ] **Step 4: Add the cookies override**

Inside the `NextAuth({...})` call, insert directly above `session: { strategy: "jwt" },`
(currently line 209):

```ts
  cookies: {
    sessionToken: { name: `${APP_COOKIE_PREFIX}.authjs.session-token` },
    callbackUrl: { name: `${APP_COOKIE_PREFIX}.authjs.callback-url` },
    csrfToken: { name: `${APP_COOKIE_PREFIX}.authjs.csrf-token` },
  },
```

Only `name` is set on each. Do not add an `options` object.

- [ ] **Step 5: Type-check**

```powershell
cd c:\unirefund\web-app
pnpm --filter @repo/utils type-check
```

Expected: exits 0 with no output. `@auth/core/index.d.ts:456` types the field as
`cookies?: Partial<CookiesOptions>` and each member as `Partial<CookieOption>`, so
supplying `name` alone is valid.

- [ ] **Step 6: Lint the changed package**

```powershell
pnpm --filter @repo/utils lint
```

Expected: no errors. If `@repo/utils` has no `lint` script, run `pnpm lint` from the repo
root and confirm no new errors appear for `packages/utils/auth/auth.ts`.

- [ ] **Step 7: Re-run the HTTP assertion — green**

The dev server from Step 1 picks the change up on its own; if it does not, restart it.

```powershell
curl.exe -i http://localhost:3000/api/auth/csrf
```

Expected — the name now carries the app prefix:

```
set-cookie: web.authjs.csrf-token=...; Path=/; HttpOnly; SameSite=Lax
```

Confirm two things in that header: the name is `web.authjs.csrf-token`, and `Path=/`,
`HttpOnly`, and `SameSite=Lax` are all still present. Their presence is the evidence that
the deep merge preserved the framework's `options` rather than the override replacing them.

- [ ] **Step 8: Confirm the ssr app derives a different name**

Stop the web server. Start ssr on its own port:

```powershell
cd c:\unirefund\web-app\apps\ssr
pnpm run init
pnpm exec next dev --webpack -p 3001
```

```powershell
curl.exe -i http://localhost:3001/api/auth/csrf
```

Expected:

```
set-cookie: ssr.authjs.csrf-token=...; Path=/; HttpOnly; SameSite=Lax
```

This proves `basename(process.cwd())` actually resolves per app on Windows, rather than
returning a shared parent directory name.

- [ ] **Step 9: Format**

```powershell
cd c:\unirefund\web-app
pnpm exec prettier --write packages/utils/auth/auth.ts
```

- [ ] **Step 10: Commit**

PowerShell here-string. The closing `'@` must sit at column 0 with no leading whitespace,
or it is a parse error. Do not use a bash heredoc here.

```powershell
cd c:\unirefund\web-app
git add packages/utils/auth/auth.ts
git commit -m @'
fix(auth): give ssr and web distinct authjs cookie names

Both apps import one shared NextAuth() instance that passed no cookies
option, so both used the Auth.js defaults. Cookies are scoped by host and
ignore ports, so localhost:3000 and localhost:3001 overwrote each other's
session and a login in one appeared in the other.

Derive the app name from basename(process.cwd()) -- Next runs each app from
its own directory -- and prefix the session, callback-url and csrf cookie
names with it. Only `name` is set; httpOnly, sameSite, path and secure stay
inherited from Auth.js per request via its deep merge.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
'@
```

If running from the Bash tool instead, use `git commit -F -` with a `<<'EOF'` heredoc and
the same message body. Do not collapse it to a single `-m` line.

Note: `web-app` is its own git repository, currently on branch
`feat/document-capture-demo`. Commit there, not in the `docs` repository.

---

### Task 2: Verify isolation in dev and under production builds

This task writes no code. It is a reviewer gate: it proves the requirement holds in the
case a `NODE_ENV` rule would have missed. If any step fails, Task 1 is not done.

**Files:**
- None. Verification only.

**Interfaces:**
- Consumes: the three cookie names produced by Task 1.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Clear existing cookies**

In the browser, delete all cookies for `localhost`. Stale `authjs.session-token` values
from before the change would otherwise muddy the reading. Expect to be signed out of both
apps — that is the documented one-time effect of the rename, not a fault.

- [ ] **Step 2: Run both apps in dev on pinned ports**

Terminal 1:

```powershell
cd c:\unirefund\web-app\apps\web
pnpm run init
pnpm exec next dev --turbopack -p 3000
```

Terminal 2:

```powershell
cd c:\unirefund\web-app\apps\ssr
pnpm run init
pnpm exec next dev --webpack -p 3001
```

- [ ] **Step 3: Sign in to web only**

Sign in at `http://localhost:3000`. Then open DevTools → Application → Cookies.

Expected under `http://localhost:3000`: a `web.authjs.session-token` cookie is present, and
no `ssr.authjs.session-token` and no bare `authjs.session-token`.

- [ ] **Step 4: Confirm ssr is still signed out**

Load `http://localhost:3001` in the same browser and reload once.

Expected: ssr redirects to its login page. This is the original bug; it must no longer
reproduce.

- [ ] **Step 5: Sign in to ssr and confirm both sessions coexist**

Sign in at `http://localhost:3001`. In DevTools → Application → Cookies, with `localhost`
selected, expect both `web.authjs.session-token` and `ssr.authjs.session-token` present
side by side, each holding a different value.

- [ ] **Step 6: Confirm sign-out clears the right cookie**

Sign out of `http://localhost:3001`.

Expected: `ssr.authjs.session-token` is gone and `web.authjs.session-token` is untouched.
Reload `http://localhost:3000` and confirm it is still signed in.

This step matters specifically because `signOut` resolves its cookie name through
`config(undefined)` with no request. If sign-out left the cookie behind, or cleared the
other app's, the static-name requirement was violated somewhere.

- [ ] **Step 7: Repeat under production builds**

Stop both dev servers. Build and start each app in production mode:

Terminal 1:

```powershell
cd c:\unirefund\web-app\apps\web
pnpm run build
pnpm exec next start -p 3000
```

Terminal 2:

```powershell
cd c:\unirefund\web-app\apps\ssr
pnpm run build
pnpm exec next start -p 3001
```

Clear `localhost` cookies again, then repeat Steps 3 through 6 against these servers.

Expected: identical results. `NODE_ENV` is `production` here, so this is the case the
rejected `NODE_ENV` gate would have left broken. Also confirm via
`curl.exe -i http://localhost:3000/api/auth/csrf` that the name is still
`web.authjs.csrf-token` with no `__Secure-` or `__Host-` prefix — over plain http those
prefixes would cause the browser to reject the cookie outright.

- [ ] **Step 8: Report**

State plainly which steps passed and paste the two `set-cookie` header lines from Step 7 as
evidence. If anything failed, report the actual observed header rather than describing it.

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
| --- | --- |
| `basename(process.cwd())` as the discriminator | Task 1, Step 3 |
| Three cookie names prefixed | Task 1, Step 4 |
| Applies in every environment, no `NODE_ENV` gate | Global Constraints; Task 2, Step 7 |
| Only `name` supplied, options inherited | Global Constraints; Task 1, Steps 4 and 7 |
| No `__Secure-` / `__Host-`, no `useSecureCookies` | Global Constraints; Task 2, Step 7 |
| Request-aware config form rejected | Global Constraints; Task 2, Step 6 |
| OAuth-only cookies untouched | Global Constraints |
| One-time forced sign-out | Task 2, Step 1 |
| Single-file scope | Global Constraints; File Structure |

**Placeholder scan:** No TBD, TODO, "similar to Task N", or bare "add error handling". Every
code step carries the literal code to write; every command step carries the literal command
and its expected output.

**Type consistency:** `APP_COOKIE_PREFIX` is the only introduced identifier and is used
under that exact name in Task 1 Steps 3 and 4. Cookie name strings in Task 1 Step 4 match
those asserted in Task 1 Steps 7-8 and Task 2 Steps 3-7. Module exports are unchanged, so
no consumer signature shifts.

**Deviation from the skill's default TDD shape, and why:** `packages/utils` has no test
runner, and standing one up for a six-line change is unjustified scope. The red/green cycle
is preserved through a real HTTP assertion (Task 1, Steps 1 and 7) that observes the actual
`Set-Cookie` name a running server emits — the behaviour under change — rather than through
a unit test asserting `path.basename`, which would be tautological.

## Out of Scope

- Separate `AUTH_SECRET` per app. Defense in depth; not required, since distinct names
  alone end the bleed.
- Pinning dev ports in committed config. This plan pins ports on the command line for
  reproducible verification only.
- `apps/ssr/playwright.config.ts` reuses `apps/web/tests/core/auth.json` for
  `storageState`. Inert today — `apps/ssr` has no `tests/` directory — but it becomes a
  live failure once ssr gains an authenticated test, because the saved cookie will carry
  the `web.` name.

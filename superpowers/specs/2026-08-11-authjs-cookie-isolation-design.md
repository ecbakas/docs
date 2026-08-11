# Auth.js cookie isolation between the `ssr` and `web` apps

**Date:** 2026-08-11
**Scope:** web-app
**Status:** Approved, ready for planning

## Problem

`apps/ssr` and `apps/web` run side by side in development on `localhost:3000` and
`localhost:3001`. Signing in to one signs the user in to the other.

The cause is a shared cookie name, not a shared secret. Both apps import the same
`NextAuth({...})` instance from `packages/utils/auth/auth.ts`, and that call passes no
`cookies` option — so both fall back to the Auth.js defaults from
`@auth/core/lib/utils/cookie.js`: `authjs.session-token`, `authjs.callback-url`,
`authjs.csrf-token`. Cookies are scoped by host, and ports are not part of the host, so
both origins read and overwrite the same three cookies.

The two apps also share one `AUTH_SECRET`, which is why the copied cookie decodes
successfully rather than being rejected. Distinct names alone fix the bleed; the secret is
out of scope.

## Goal

Each app issues and reads its own session cookies, so a login on one origin has no effect
on the other. No change to auth behaviour beyond the cookie names.

The isolation must hold identically in every environment — `next dev`, a local
`next build && next start`, and deployed. Behaviour that varies by environment is
explicitly not wanted, because a local production build is the case most likely to be
tested and least likely to be covered by a `NODE_ENV`-based rule.

## Design

One file changes: `packages/utils/auth/auth.ts`. No `.env`, `turbo.json`, app code, or
import changes.

### Identifying the app

```ts
import { basename } from "node:path";

// Next runs each app with cwd set to its own folder (that's how it finds the
// app's next.config.js and .env), so this is "ssr" or "web".
const APP_COOKIE_PREFIX = basename(process.cwd());
```

`process.cwd()` is the app directory under both `next dev` and `next start`, and under
`turbo dev`, which runs each package's script from that package's directory. The existing
per-app `.env` loading already depends on this, so the assumption is not a new one.

`APPLICATION_NAME` was considered and rejected: it is `UNIREFUND` in both `.env` files and
does not discriminate.

### Cookie override

```ts
NextAuth({
  cookies: {
    sessionToken: { name: `${APP_COOKIE_PREFIX}.authjs.session-token` },
    callbackUrl: { name: `${APP_COOKIE_PREFIX}.authjs.callback-url` },
    csrfToken: { name: `${APP_COOKIE_PREFIX}.authjs.csrf-token` },
  },
  providers: [/* unchanged */],
  pages: {/* unchanged */},
  session: {/* unchanged */},
  callbacks: {/* unchanged */},
});
```

Cookie names become, in every environment:

| Cookie | apps/ssr | apps/web |
| --- | --- | --- |
| session | `ssr.authjs.session-token` | `web.authjs.session-token` |
| callback url | `ssr.authjs.callback-url` | `web.authjs.callback-url` |
| csrf | `ssr.authjs.csrf-token` | `web.authjs.csrf-token` |

### Why only `name` is supplied

`@auth/core@0.30.0` `lib/init.js:73` reads:

```js
cookies: merge(cookie.defaultCookies(authOptions.useSecureCookies ?? url.protocol === "https:"), authOptions.cookies)
```

`merge` is a deep merge, so supplying only `name` leaves `httpOnly`, `sameSite`, `path`,
and `secure` coming from the per-request defaults. Restating them would add a second
source of truth that could drift from the framework's; omitting them cannot.

### Why the names are static, and why `__Secure-` / `__Host-` are dropped

The override applies in every environment, so that isolation holds under `next dev` and
under a local `next start` alike. The cost is that the names lose the `__Secure-` and
`__Host-` prefixes Auth.js would otherwise apply to https requests. Two alternatives were
examined and both are unsafe here.

**Gating on `NODE_ENV`** cannot work. A local `next start` sets `NODE_ENV=production`, so
that gate would give local runs `__Secure-` names plus `secure: true` over
`http://localhost` — which browsers reject outright, breaking local login. `NODE_ENV`
cannot tell a local production build apart from a deployed one, which is exactly the
distinction the requirement needs.

**A request-aware config function** — `NextAuth((req) => config)`, supported in
`next-auth@5.0.0-beta.25` — cannot work either. In `next-auth/index.js:101-125`, only
`handlers` and `auth` receive the request; `signIn`, `signOut`, and `unstable_update` all
call `config(undefined)`. This codebase calls all of them (`signInServerApi` in
`packages/actions/core/AccountService/actions.ts`, `signOutServer` in `auth-actions.ts`,
and the affiliation-switch refresh). A name derived from the request would therefore differ
between the sign-in path and the read path: login would write a cookie that `auth()` never
reads, and logout would clear the wrong name. Static names are what keep all four entry
points in agreement.

What is retained: `secure`, `httpOnly`, `sameSite: "lax"`, and `path: "/"` are untouched
and still come from Auth.js per request, so production cookies are still `Secure` over
https. What is lost is the browser-enforced guarantee behind the name prefixes —
`__Secure-` (set only over https) and `__Host-` (host-locked, no `Domain`). That is a
defense-in-depth reduction against an attacker who already controls a sibling
`*.unirefund.com` origin, not an open hole. Accepted as the price of uniform behaviour.

If that hardening is wanted back in real deployments later, the smallest reversible change
is an env var set only there, selecting prefixed names — deliberately not built now.

### Cookies deliberately not overridden

`pkceCodeVerifier`, `state`, `nonce`, and `webauthnChallenge` are OAuth-flow cookies. Both
providers in this config are `Credentials` (`credentials` and `ssr-token`), so these are
never issued.

## Consequences

- Every signed-in user is signed out once, in every environment, because the old
  `authjs.session-token` is no longer read. Stale cookies remain in the browser until
  they expire and are inert. In production this is a one-time forced re-login at deploy.
- Production cookie names change too. Nothing in the codebase reads them by name — the
  only hardcoded matches anywhere are unrelated error-message parsing in
  `apps/*/src/utils.ts` — so there are no call sites to update.
- The server-side token store is unaffected. Tokens never live in the cookie
  (`jwt` callback strips them), and store keys are namespaced separately via
  `AUTH_REDIS_PREFIX`.

## Verification

1. Type-check both apps.
2. Run ssr and web together with `next dev`.
3. In DevTools → Application → Cookies, confirm `localhost:3000` and `localhost:3001` each
   hold their own `*.authjs.session-token` under the app-specific name.
4. Sign in to one app, reload the other, and confirm it is still signed out.
5. Sign out of one app and confirm the other's session is untouched.
6. Repeat steps 2–5 with `next build && next start` for both apps. This is the case the
   `NODE_ENV` gate would have missed, so it is the one that proves the requirement.
7. Confirm sign-out actually clears the cookie, not just the session. This exercises the
   `signOut` path, which resolves the cookie name independently of any request.

## Out of scope

- Giving the apps separate `AUTH_SECRET` values. Defense in depth, not required for this
  fix.
- Pinning explicit dev ports for the two apps. Neither app configures one today, so which
  gets 3000 and which gets 3001 depends on start order. Unrelated to cookie isolation.
- `apps/ssr/playwright.config.ts` points `storageState` at `apps/web/tests/core/auth.json`,
  reusing the web app's saved login. `apps/ssr` has no `tests/` directory, so this is inert
  today, but it would need its own storage state once ssr grows authenticated tests.

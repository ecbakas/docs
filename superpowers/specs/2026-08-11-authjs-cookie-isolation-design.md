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

## Design

One file changes: `packages/utils/auth/auth.ts`. No `.env`, `turbo.json`, app code, or
import changes.

### Identifying the app

```ts
import { basename } from "node:path";

// Next runs each app with cwd set to its own folder (that's how it finds the
// app's next.config.js and .env), so this is "ssr" or "web".
const APP = basename(process.cwd());
```

`process.cwd()` is the app directory under both `next dev` and `next start`, and under
`turbo dev`, which runs each package's script from that package's directory. The existing
per-app `.env` loading already depends on this, so the assumption is not a new one.

`APPLICATION_NAME` was considered and rejected: it is `UNIREFUND` in both `.env` files and
does not discriminate.

### Cookie override

```ts
const isDev = process.env.NODE_ENV !== "production";

NextAuth({
  ...(isDev && {
    cookies: {
      sessionToken: { name: `${APP}.authjs.session-token` },
      callbackUrl: { name: `${APP}.authjs.callback-url` },
      csrfToken: { name: `${APP}.authjs.csrf-token` },
    },
  }),
  providers: [/* unchanged */],
  pages: {/* unchanged */},
  session: {/* unchanged */},
  callbacks: {/* unchanged */},
});
```

Development cookie names become:

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

### Why the override is development-only

`useSecureCookies` defaults to `url.protocol === "https:"` and is evaluated per request.
The `cookies` object is static, built once at module load, so it cannot reproduce the
`__Secure-` and `__Host-` name prefixes that Auth.js applies to https requests. Rather than
pin those statically — which would hard-assume every production deployment is https, and
break login where that is false — the override is skipped in production entirely. In
production the spread contributes nothing and Auth.js defaults apply untouched, keeping
`__Secure-authjs.session-token` and `__Host-authjs.csrf-token`.

This is safe because ssr and web are served from different hosts in production, so no
collision exists there to fix.

### Cookies deliberately not overridden

`pkceCodeVerifier`, `state`, `nonce`, and `webauthnChallenge` are OAuth-flow cookies. Both
providers in this config are `Credentials` (`credentials` and `ssr-token`), so these are
never issued.

## Consequences

- Everyone currently signed in locally is signed out once, because the old
  `authjs.session-token` is no longer read. Stale cookies remain in the browser until
  they expire and are inert.
- Running `next start` for both apps locally puts `NODE_ENV=production` in both, so the
  override is skipped and the collision returns. Accepted: production uses different
  hosts, and `next dev` is how both apps are run side by side.
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

## Out of scope

- Giving the apps separate `AUTH_SECRET` values. Defense in depth, not required for this
  fix.
- Pinning explicit dev ports for the two apps. Neither app configures one today, so which
  gets 3000 and which gets 3001 depends on start order. Unrelated to cookie isolation.
- `apps/ssr/playwright.config.ts` points `storageState` at `apps/web/tests/core/auth.json`,
  reusing the web app's saved login. `apps/ssr` has no `tests/` directory, so this is inert
  today, but it would need its own storage state once ssr grows authenticated tests.

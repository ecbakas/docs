# Tag links open super-app (universal links / App Links)

Follows [Opening super-app when it is installed](2026-11-05-phone-to-phone-tap-research.md#opening-super-app-when-it-is-installed).
The tag link `https://<ssr host>/tag/<slug>` (the backend's `publicLink`, on a tag
QR or an emulated NFC tag) opens super-app when it is installed, and ssr in the
browser when it is not.

| Repo | Branch | PR |
| --- | --- | --- |
| unirefund-web (`apps/ssr`) | `feat/universal-links` | [unirefund-web#374](https://github.com/ayasofyazilim-clomerce/unirefund-web/pull/374) |
| unirefund-mobile (super-app) | `feat/universal-links` | [unirefund-mobile#77](https://github.com/ayasofyazilim-clomerce/unirefund-mobile/pull/77) |

Worktrees: `C:\unirefund\web-app-wt-links`, `C:\unirefund\super-app-wt-links`.

## What each side does

**ssr** serves the two association files and keeps the locale proxy off them:

- `/.well-known/apple-app-site-association` (and the legacy `/apple-app-site-association`):
  `SMN73535BW.com.clomerce.unirefundsuperapp`, components `/tag/?*` and `/*/tag/?*`.
- `/.well-known/assetlinks.json`: package `com.clomerce.unirefundsuperapp`. It has **no
  Play certificate yet** (the app is not on Play). Extra certificates come from the
  runtime variable `SUPER_APP_EXTRA_CERT_SHA256`, which should be set on **dev and uat only**
  to the pads' debug keystore
  `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C`.
  It must never be set on live, because that is the public React Native template key.
- The data lives in `apps/ssr/src/utils/app-links.ts`. Add the Play app-signing SHA-256
  there once the app is in Play Console.

**super-app** claims `ssr-dev.`, `ssr-uat.` and `ssr.` (live, per the user's decision) on the
configured apex domain:

- iOS `associatedDomains` (`applinks:` per host). The App ID needs the **Associated
  Domains** capability and a regenerated profile (`docs/testflight.md`).
- Android `intentFilters`, `autoVerify`, paths `/tag/..*` and `/.*/tag/..*` only.
- `src/app/+native-intent.tsx` rewrites the link through `tagLinkTarget`
  (`src/utils/qr/deepLink.ts`), which uses the same `classifyScan` → `scanDestination`
  decision as the camera scanner. A link with a tag id opens `/tag-preview`. A sticker link
  opens `/tag-preview`, or `/sticker-tag` for an issuer whose role has already loaded.
  A bare tag number or an unreadable slug opens `/manual-entry`, pre-filled.
- `PageHeader`'s default Back now replaces to `/` when nothing is underneath. A screen opened
  cold from a link is alone in the stack, so Back (arrow and hardware key) used to do nothing.

## Decisions and traps

- **On iOS the AASA file decides the paths, for every installed build at once.** So `/s/*`
  (handoff sessions) is not claimed yet. Add it to `app-links.ts` only after a super-app
  release that handles `/s/<token>`. Otherwise those links dead-end in older apps.
- **Android 11 and older verify all-or-nothing** across every claimed host. Because live
  `ssr.` is claimed but serves a catch-all page today, nothing verifies on those versions
  until live ssr is deployed with these files. Android 12 and newer verify each host on its
  own.
- The airport validate QR (`/<lang>/validate?qrValue=`) is not claimed. Claiming it would be
  a one-line change on each side.

## Steps outside the code

1. **Apple:** enable **Associated Domains** on the `com.clomerce.unirefundsuperapp` App ID.
   Then regenerate the App Store profile and update `IOS_PROVISIONING_PROFILE_BASE64`.
   **The next TestFlight archive fails until this is done.**
2. **Coolify:** set `SUPER_APP_EXTRA_CERT_SHA256` (value above) on the ssr dev and uat
   resources.
3. **Play:** once the app is in Play Console, add the App signing SHA-256 to
   `PLAY_SIGNING_CERT_SHA256` in `apps/ssr/src/utils/app-links.ts`.

## Verification status (2026-11-05)

Verified locally:

- **ssr dev server** in the worktree: all three paths answer `200 application/json` with no
  redirect. The env var adds the certificate: lowercase input is normalised and junk is
  dropped. `/tag/abc` still 307s to `/tr/tag/abc`, and `/en/account` still 307s to login.
- **ssr gates:** type-check is clean. `test:unit` is 478/478. `eslint` on the changed files is
  clean. `next build --webpack` passes.
- **super-app gates:** `npm test` passes 341 suites (3484 tests passed, 1 skipped).
  `npm run typecheck` exits 0. `eslint` on the touched files is clean.
- **super-app config:** `expo config --type introspect` resolves the `associated-domains`
  entitlement and the Android filter for all three hosts.

Not verified yet:

- the files on deployed `ssr-dev` (dev deploys on merge to main);
- Apple's CDN copy (`https://app-site-association.cdn-apple.com/a/v1/ssr-dev.unirefund.com`);
- any native build;
- `adb -s <serial> shell pm get-app-links com.clomerce.unirefundsuperapp` on a CPad;
- a real tap, or iOS handing a universal link to the router.

# Pre-deployment checklist — 2026-11-05 batch

This checklist covers the eight PRs merged on 2026-11-05 between 13:07 and 13:12 UTC: super-app
(`unirefund-mobile`) #77–#82 and ssr (`unirefund-web`) #374 and #375.

Work through it top to bottom:

- **§1–§3 block a release.**
- **§4–§5 block switching features on.**
- **§6–§10** are QA, the launch switch and housekeeping.

## What was merged

| PR | What it does | Native change | Needs before release |
|---|---|---|---|
| [mobile #77](https://github.com/ayasofyazilim-clomerce/unirefund-mobile/pull/77) | Tag links (`https://ssr*.unirefund.com/tag/…`) open the app | **Yes**: Associated Domains, Android app-link filter | §1 Apple profile, §3 ssr files live |
| [mobile #78](https://github.com/ayasofyazilim-clomerce/unirefund-mobile/pull/78) | Home document card, card-holder pre-fill, Apple Wallet loading state | No | §6 QA |
| [mobile #79](https://github.com/ayasofyazilim-clomerce/unirefund-mobile/pull/79) | Hidden `dev:` / `uat:` / `live:` prefix on traveller login | No | §5 uat account, §7 launch default |
| [mobile #80](https://github.com/ayasofyazilim-clomerce/unirefund-mobile/pull/80) | Push notifications, **off** behind `EXPO_PUBLIC_PUSH_NOTIFICATIONS` | **Yes**: expo-notifications, expo-application, expo-crypto | §1, §2; §4 to switch on |
| [mobile #81](https://github.com/ayasofyazilim-clomerce/unirefund-mobile/pull/81) | Toasts redesigned: always above sheets, Modals and the keyboard | No | §6 QA (iOS) |
| [mobile #82](https://github.com/ayasofyazilim-clomerce/unirefund-mobile/pull/82) | Traveller tag country filter, tags-tab keyboard dismissal, Show on map | No | §5 UNI-1866 on uat/prod |
| [web #374](https://github.com/ayasofyazilim-clomerce/unirefund-web/pull/374) | ssr serves the app-link association files | — | §3 Coolify variable + deploy |
| [web #375](https://github.com/ayasofyazilim-clomerce/unirefund-web/pull/375) | ssr traveller tag country filter, Show on map | — | §3 deploy, §5 UNI-1866 |

## 0. Merged main health

The PRs were each tested on their own branch. These gates were re-run on the **combined** super-app
`origin/main` at `d96a780`, after all six merges:

| Gate | Result |
|---|---|
| `npm run init` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | 364/364 suites; 3716 tests passed, 1 skipped |

The repo has no CI, so this local run is the only gate. For ssr, `main`'s **Deploy** workflow runs
on every push. At the time of writing, the runs for #374 and #375 were still in progress.

---

## 1. Apple Developer — blocks the next TestFlight run

Since #77, every iOS archive fails on the missing `com.apple.developer.associated-domains`
entitlement until the profile is regenerated.

- [ ] Go to developer.apple.com → Identifiers → `com.clomerce.unirefundsuperapp` (team `SMN73535BW`).
      Enable **Associated Domains** and **Push Notifications** together, so you regenerate the profile only once.
- [ ] Regenerate the **App Store provisioning profile**.
- [ ] Update the `testflight` environment secret `IOS_PROVISIONING_PROFILE_BASE64`. If the profile
      name changed, also update `IOS_PROVISIONING_PROFILE_NAME`.
- [ ] Create an **APNs auth key** (`.p8`) and note its Key ID. It goes into Novu (§4). Never commit it.
- [ ] If `1.0.2` is already in review or released, bump `version` in `app.config.js` before uploading.
      The build number comes from the workflow run number.
- [ ] Run Actions → **TestFlight** → Run workflow **with `dry_run` ticked** first. It validates the IPA
      without uploading. Then do a real run.

Notes:

- Apple may email an **ITMS-90078 "Missing Push Notification Entitlement"** warning while push is off.
  It is a warning, not a rejection.
- App Store reviewers sign in on **dev** with plain usernames. Keep `DEFAULT_ENVIRONMENT` on dev
  while that is true (§7).

## 2. Rebuild every super-app build — blocks device QA

- **Why:** #80 links three native modules that load at startup. A dev client built before #80
  crashes on today's JS, even with push off.
- **Also:** #77 adds the app-link config, which needs a native build too.
- **Already-installed builds:** the app has no `expo-updates` (no OTA), so builds already out there
  keep working until they are replaced. Every new build must come from current `main`.

- [ ] Update the local checkout, at a moment when no Metro is serving from it. It was 44 commits
      behind `origin/main`.

  ```bash
  git -C C:/unirefund/super-app pull --ff-only
  ```

- [ ] In `C:\unirefund\super-app`, prebuild:

  ```bash
  npx expo prebuild --clean
  ```

- [ ] Install the build on the pad:

  ```bash
  npx expo run:android --device OrderPAD_3 --no-bundler
  ```

  `--device` matches the **model name**, not the serial. Both OrderPADs are `OrderPAD_3`, so attach
  one at a time or pick from the prompt.

- [ ] Wire the pad to Metro:

  ```powershell
  .\dev-superapp-devices.ps1 -Serial LD38266200649
  ```

- [ ] Repeat for CPad (`LD2625CS00090`) if you test on it too.

## 3. ssr: Coolify variable, rollout, promotion

- [ ] **Coolify:** set this variable on the ssr **dev** and **uat** resources:

  ```
  SUPER_APP_EXTRA_CERT_SHA256=FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C
  ```

  **Never set it on prod.** It is the public React Native template key, so anyone can sign an app
  with it. It is documented in `web-app/docs/deployment.md`.

- [ ] **Dev rollout.** The Deploy workflow runs on every push to `main`. When this was written:
  - the runs for #374 and #375 were still going;
  - `ssr-dev` still answered **307** for both association files, so the new image was not live yet;
  - if Coolify doesn't roll out by itself, deploy the pushed image from the Coolify UI.

- [ ] **Verify dev.** Each URL should answer `200 application/json` with no redirect:

  ```bash
  curl -sI https://ssr-dev.unirefund.com/.well-known/apple-app-site-association
  ```

  ```bash
  curl -sI https://ssr-dev.unirefund.com/.well-known/assetlinks.json
  ```

  Apple's CDN copy, `https://app-site-association.cdn-apple.com/a/v1/ssr-dev.unirefund.com`, can lag
  by hours.

- [ ] **uat, then prod.** Actions → **Deploy** → Run workflow, with environment `uat` (later `prod`)
      and app `ssr` or `both`. Roll out in Coolify if no deploy webhook is set. Then repeat the two
      `curl` checks on `ssr-uat.unirefund.com` and `ssr.unirefund.com`.

Notes:

- Android 11 and older verify all hosts or none. Until **live** ssr serves these files, tag links
  will not open the app on those versions at all.
- Once the app is on Play, add the Play app-signing SHA-256 to `PLAY_SIGNING_CERT_SHA256` in
  `apps/ssr/src/utils/app-links.ts`.

## 4. Push notifications — ships off; to switch it on

The full asks are in `docs/superpowers/specs/2026-11-05-superapp-push-prerequisites.md`. Share it with
each owner, and do the steps in this order.

1. [ ] **Apple:** the capability, profile and `.p8` key from §1.
2. [ ] **Firebase:**
   - a project with the Android app `com.clomerce.unirefundsuperapp`, with Analytics off;
   - `google-services.json` for whoever builds. It stays out of git; the build reads it from
     `GOOGLE_SERVICES_FILE`, default `./google-services.json`;
   - a service-account key with the FCM API (V1) role, for Novu.
3. [ ] **Novu** (dev first, then uat and prod):
   - three integrations: `fcm`, `apns-production` and `apns-sandbox` (team `SMN73535BW`, bundle id
     above);
   - a Push step beside the In-App step in each workflow, with the `data.url` from the spec's table;
   - a fix for the junk redirect in `sticker-verification-rejected`.
4. [ ] **Backend** (Notification service):
   - `PUT` and `DELETE /api/notification-service/push-devices/{installationId}`. This route does not
     exist yet;
   - `DELETE` must work **without a bearer token**;
   - every role (Traveller, Merchant, RefundPoint, Customs) needs the permission;
   - answers to the spec's Q1 (which subscriber id pushes go to), Q2 (payload field names) and Q3
     (do staff get push?).
5. [ ] **Build with the flag on.**
   - Set `EXPO_PUBLIC_PUSH_NOTIFICATIONS=true` and point `GOOGLE_SERVICES_FILE` at the Firebase file.
   - The TestFlight workflow (`main` at `d96a780`) writes only its listed `EXPO_PUBLIC_*` secrets into
     `.env`, and the push flag is not among them. A flag-on TestFlight build needs the workflow to
     pass it.
6. [ ] **Store privacy, once the flag is on:** Play Data safety ("Device or other IDs") and App Store
   App Privacy ("Device ID").

Note: since #80 merged, the Android build carries `firebase-messaging` and declares
`POST_NOTIFICATIONS`, even with the flag off. Firebase is never initialised without
`google-services.json`, but the data-collection audit's "no Firebase" line is no longer literally
true.

## 5. Backend and test-data dependencies

- [ ] **UNI-1866** (`TenantIds` on the traveller tag list) deployed to **uat** and **prod**.
  - Without it, a wrong-country tag still never shows, because both apps filter on the client too.
  - A filtered page can then hold fewer than 20 rows.
- [ ] **UNI-1871** (Adnan Fahed): `latitude`, `longitude` and `placeId` on `MerchantPublicDto`.
  - Until then, traveller "Show on map" searches the store address.
  - When the fields land, it is a small follow-up in both apps to use the exact pin.
- [ ] A traveller test account on **uat**. A `uat:` login was seen to reach uat, but no full uat
      session (refresh, API calls, Novu, logout) has run.
- [ ] A traveller with tags from **two or more countries**. Nobody has seen the country chips on screen.
- Live API (`api.unirefund.com`) answered 503 on 2026-11-05.

## 6. Manual QA still to do

**Android** (on a CPad, after §2):

- [ ] **Home:** the document card sits above Estimated Refunds, and a tap opens the switch flow.
      With one document, the card shows but can't be tapped.
- [ ] **Add card:** the holder name is pre-filled from the active document, stays editable, and is
      never overwritten after you type.
- [ ] **Push UI**, with Metro serving JS with the flag on:
  - the consent sheet appears about 1.5 s after sign-in;
  - the Android 13 permission dialog appears;
  - the Profile switch works;
  - the dev "Send a test notification" row's notification opens the tag list.
- [ ] **Tag links**, after §3:
  - this command shows `verified` for `ssr-dev` and `ssr-uat`:

    ```bash
    adb -s LD38266200649 shell pm get-app-links com.clomerce.unirefundsuperapp
    ```

  - tapping a tag link opens the tag preview;
  - Back from a link that cold-started the app goes Home.
- [ ] **Staff Show on map** opens the exact pin. So far the URL was checked in a browser only.
- [ ] **Keyboard dismissal** on the landscape tag grid and its filter rail. So far: render tests only.
- [ ] **Toasts**: already checked on CPadNFC over a sheet, inside a Modal, with the keyboard up, and
      for swipe, close and hold. What TalkBack reads out has not been checked.

**iPhone** — nothing in this batch has run on iOS:

- [ ] Add to Apple Wallet: the spinner shows while the pass loads, and a double tap issues one pass.
- [ ] Toasts show over sheets, Modals and the keyboard, and VoiceOver still reaches the app while a
      toast is up.
- [ ] Show on map opens Apple Maps.
- [ ] The `dev:` and `uat:` login prefixes.
- [ ] A tag link opens the app (after §1 and §3).
- [ ] Push (after §4).

**ssr**, on dev after the rollout:

- [ ] The country filter and Show on map on the traveller tag pages.

## 7. At prod launch

- [ ] `DEFAULT_ENVIRONMENT` in `src/utils/environment.ts` is `"dev"`, so a plain traveller username
      goes to dev.
  - At launch, flip it to live.
  - The file is owned by `core`: change it there, then `git merge core/main` into super-app.
  - Don't flip it while App Store reviewers still sign in on dev.

## 8. Device warning: CPadNFC's NFC chip is faulty

- **What happens:** since 09:01 on 2026-11-05, CPadNFC's NFC controller has been crashing by itself
  (firmware assert, reset code `A0`).
- **A reboot doesn't fix it.** CPadNFC was rebooted at 15:57 and the crashes continued.
- **Treat NFC on that pad as faulty until Sunmi has looked at it.** Card or passport NFC failures
  there are not app bugs.
- **After any reboot,** a PIN-locked OrderPAD has no NFC until its first unlock.
- **Don't register the standard NDEF tag ID** on OrderPADs without Sunmi's OK.
- Details, plus a summary ready to send to Sunmi: `docs/superpowers/specs/2026-11-05-phone-to-phone-tap-research.md`.

## 9. Known minor issues — candidate tickets

Push (#80):

- A session that ends while the consent sheet is open records that account as having declined.
- The push queue has no per-step timeout, so a hung token read or request stalls it.
- The Profile switch's turn-on and turn-off can reject unhandled.
- An affiliation-switch resync can be skipped as "unchanged".
- A turn-off that runs after the tokens are cleared sends a `Bearer null` header.
- Missing tests: queue ordering, the affiliation resync, and the flag-off placeholder row.

Toasts (#81):

- A toast raised during boot draws over the splash screen.
- When a toast moves between outlets, the outlet losing it plays its exit fade.
- Reduce Motion turns the animation off entirely instead of keeping a fade.
- A hold can stay stuck if the card unmounts mid-press.
- Dedupe keeps the first toast's action handler.
- The guard test doesn't catch renamed (aliased) Modal imports.
- Nested Modals that mount in the same commit register in the wrong order.

Tags (#82, #375):

- A stale country selection can only be removed with Clear.
- ssr starts the countries read on every navigation, even when the Filters sheet stays closed.

## 10. Housekeeping

- [ ] Push the docs repo (`ecbakas/docs`). It is 26+ commits ahead of its remote.
- [ ] Remove the merged worktrees: `super-app-wt-push`, `-tags`, `-env-login`, `-home`, `-toast`,
      `-store`, and `web-app-wt-tags`. Web-app worktrees have submodules and need the forced-removal
      recipe, so ask Claude to do it.

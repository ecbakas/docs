# super-app push notifications — design

Date: 2026-11-05 · Repo: `super-app` (unirefund-mobile) · Branch: `feat/push-notifications`
Companion: [backend and Novu prerequisites](2026-11-05-superapp-push-prerequisites.md)

## Why

super-app only has the Novu in-app inbox (`NotificationsProvider` → bell sheet). A
user hears about a tag issued, a refund created or a payout only if they open the
app and look. Notifications should also arrive as OS push on Android and iOS
when the app is in the background or closed. Tapping one should open the screen
it is about.

## What exists today (measured 2026-11-05)

- **No device-token route on the backend.** Checked on dev-api: Notification,
  Device, Identity, Traveller, CRM and Administration. Novu accepts device
  tokens only through its secret-key API (`PUT /v1/subscribers/{id}/credentials`),
  so the app cannot register a token itself. A backend endpoint is required.
- **No push on dev Novu.** As subscriber, `GET /v1/inbox/preferences` lists 15
  workflows, and none has a push step. Channels are email, in-app and SMS only.
- **Notifications carry no target.** The test traveller's six items have no
  `data`. The only `redirect` is a placeholder (`/m=/sdfsdf&amp;b=/asdasda`).
  Tapping an inbox item in the app expands it and goes nowhere.
- **Inbox subscriber = the user id** (`jwtUser.sub`), in both super-app and
  web. The Notification API's attempt DTO says a recipient may also be a
  `traveller-…` or `party-…` id. See the prerequisites note, question Q1.
- **No native setup.** No `expo-notifications`, no Firebase project or
  `google-services.json`, and no EAS project. The TestFlight job signs with a named
  App Store profile, which has no Push capability.

## Decisions (made by the user, 2026-11-05)

1. **Direct FCM + APNs.** The app sends Novu the native token: the FCM
   registration token on Android, the raw APNs token on iOS
   (`getDevicePushTokenAsync`). This needs no EAS project, and no third party
   relays the messages.
2. **Permission prompt: a sheet after sign-in, plus a Profile switch.** The
   first time a signed-in user reaches the authed shell, a short sheet explains
   push and offers "Turn on" or "Not now". A switch in Profile turns it on
   later, or opens OS settings if the OS has already said no. The app never asks
   at cold start.
3. **Build the full app side now, behind a flag that stays off.** Registration
   targets the endpoint contract in the prerequisites note. Everything stays
   switched off until the backend and Novu are ready.
4. **The tap target is an app path in `data.url`.** The Novu push step sets
   `data.url` to a path such as `/tags/{{payload.tagId}}`. The app opens it only
   if it matches the app's own allowlist. Otherwise it opens the inbox sheet.
5. **`expo-notifications` is linked into every build.** The flag only switches
   behaviour. With the flag off, the Android build still carries
   `firebase-messaging`, dormant because there is no `google-services.json`,
   and declares the notification permission. In return, the permission sheet
   and the Android 13 dialog can be tested via Metro against a build that has
   the module.
6. **Consent belongs to each account.** Every signed-in account sees the
   explainer once, and must choose "Turn on" before its token is registered.
   This applies on every platform, including Android 8–12, where the OS
   permission is granted without asking. "Not now" and the switch are
   remembered per account.
7. **Firebase and Apple push credentials do not exist yet** (as of 2026-11-05).
   Getting a real token on a device is unverified until they do.

Calls made by the designer, which the user can override:

- **Unregistering without a session.** `DELETE push-devices/{installationId}`
  is accepted without sign-in; the random install id is the proof. The app
  calls it the moment a session expires, so a shared pad stops showing the
  old account's pushes without waiting for the next sign-in. The worst a leaked
  install id allows is switching that device's pushes off.
- **On sign-out and on expiry,** the app also clears presented notifications
  from the tray and drops any tap target waiting for sign-in.
- **Affiliation switches re-register,** in case the backend keys tokens to the
  active party (prerequisites Q1).
- **The inbox stays subscribed by user id** on this branch. If the backend
  answers Q1 with `traveller-…` or `party-…` subscribers, changing the inbox
  is a separate task.

## Goals

- OS push arrives on Android 8+ and iOS 15.5+ in the background and when the app
  is closed. In the foreground it shows as a banner.
- One device always delivers to the account currently signed in, and to no
  other account. The same pad is used by different accounts and roles
  (AGENTS.md cross-talk note).
- A tap opens the right screen, whether the app was closed, backgrounded or
  open. If nobody is signed in, the target waits until sign-in.
- With the flag off, users see no change: no prompt, no switch, no network
  call, and no data collected. The iOS build keeps signing with today's
  profile. The binary does change: decision 5 links the module.

## Non-goals

- Silent or background-data pushes, notification actions (buttons), images and
  rich media.
- Push for pos-app or the web apps.
- Per-workflow notification preferences in the app. Novu's own preferences
  stay as they are.
- Marking a Novu inbox item read when its push is tapped. This could come later,
  if the push payload carries the Novu message id.
- HMAC subscriber auth for the inbox. It was declined on 2026-08-13 and is not
  re-raised here.

## Anti-goals (a failure even if pushes arrive)

- Account A's push showing on a device B is now signed into.
- An OS permission dialog with no context, or one at cold start.
- A tap navigating to an arbitrary or attacker-chosen path or URL scheme.
- Shipping the flag-on build before the App Store profile has Push. That breaks
  the TestFlight job.

## Design

### Feature flag

`EXPO_PUBLIC_PUSH_NOTIFICATIONS=true` turns the feature on. The flag is unset by
default. The `expo-notifications` module itself is always linked (decision 5).
The flag is read in two places:

- **`app.config.js` at prebuild,** only for the two settings that would break a
  build without credentials: the plugin's `enableRemoteNotifications` (the iOS
  `aps-environment` entitlement, which today's App Store profile cannot sign)
  and `android.googleServicesFile`. Every other plugin option, such as the icon,
  colour and default channel, is always set.
- **JS at runtime,** through one helper `isPushEnabled()`. It gates the sheet,
  the Profile switch, registration and tap routing. Because the module is
  linked regardless, a build made with the flag off can run flag-on JS from
  Metro. The sheet, the OS dialog and local-notification taps then work.
  Getting a token fails, because there is no Firebase config and no
  entitlement, and the app logs that and carries on.

`google-services.json` stays gitignored. Its path comes from
`GOOGLE_SERVICES_FILE`, defaulting to `./google-services.json`. If the flag is on
and the file is missing, prebuild fails with a message naming the variable. It
does not fail silently.

### Device identity

`installationId` is a random UUID created on first use and kept in SecureStore.
It never leaves this install and is not derived from hardware. It is the key
the backend uses to own a registration (one owner at a time). That is what stops
cross-talk when a device changes hands without a clean sign-out.

### Registration lifecycle

Each registration is a `PUT /api/notification-service/push-devices/{installationId}`
with `{ token, provider, platform, apnsEnvironment, locale, appVersion }`. The
contract is in the prerequisites note.

The app registers when **all** of these hold: the flag is on, a user is signed
in, **that account has chosen "Turn on"**, OS permission is granted, and a token
was obtained. It registers again when:

- the app starts with a session (once per launch),
- the user id changes (sign-in, or a different account),
- the active affiliation changes (`AffiliationProvider.changeAffiliation`),
- the token changes (`addPushTokenListener`),
- the app language changes, because Novu picks the workflow language from the
  subscriber locale,
- the user turns the switch on, or grants permission from the sheet.

Registration is best effort. A failure is logged and retried on the next
trigger, never shown to the user. A 404 or 501 means the backend has no endpoint
yet. In that case the app stops trying until the next launch.

**Sign-out** calls `DELETE …/push-devices/{installationId}` *before*
`SessionProvider.signOut` clears the token, capped at 3 s so a slow network
cannot hold up sign-out.

**Session expiry** also calls `DELETE`, unauthenticated, as soon as the
`onSessionExpired` broadcast fires. The backend accepts it because the install
id is the proof. The backend also hands the registration to the next account
that signs in on this install under the same `installationId`, and drops a
registration not refreshed for 30 days. That covers a failed `DELETE`.

On both sign-out and expiry, the app also clears the tray
(`dismissAllNotificationsAsync`) and drops any held tap target.

**Turning the switch off** calls `DELETE` and records "declined" for this
account. The OS permission stays as it is, since the app cannot revoke it.

### Consent (per account)

Consent is stored locally per install, keyed by user id: `granted`,
`declined` or unset. It is separate from the OS permission, which covers the
whole install. Registration needs consent `granted` **and** OS permission
granted. Account B never inherits account A's choice. On Android 8–12, where
the OS grants permission without asking, the sheet is still what asks.

### Permission prompt

- **When it shows:** the authed shell mounts with a resolved role, the flag is
  on, and this account's consent is unset. It shows once per account per
  install, whatever the OS status. "Not now" records `declined`, and the
  Profile switch is the way back.
- **"Turn on":** record `granted`. Then:
  - OS status `undetermined`, or denied but askable: request it.
  - Denied and not askable: open OS settings.
  - Granted: register.
- **Order on Android:** create the `default` notification channel before
  requesting permission. Android 13+ shows no OS dialog until a channel exists.
- **What it says:** a title, one sentence on what the user will get (refund and
  tag updates), "Turn on" and "Not now". The copy goes in `MobileApp.Push.*`
  for en-US and tr-TR.
- **Where it renders:** in the authed shell, beside the other sheet providers.
  It does not render over a running scan, and it waits until no other sheet or
  dialog is open.

### Profile switch

Both profiles already have a disabled "Notification Preferences" row in their
App group. With the flag on, that row becomes "Push notifications" with a
switch. With the flag off, it stays exactly as it is. The switch shows **on**
only when this account's consent is `granted` and the OS permission is
granted. Toggling it on records `granted` and runs the same OS steps as the
sheet's "Turn on". Toggling it off records `declined` and calls `DELETE`. The
row re-reads permission when the app returns to the foreground, so a change
made in OS settings shows up.

### Foreground presentation

`setNotificationHandler` shows a banner and lists it, with no sound and no
badge. The in-app inbox already updates over the Novu socket, so the app does
nothing extra.

### Tap routing

- **Source:** `data.url` in the notification response. It is read from
  `getLastNotificationResponse()` at launch, and from
  `addNotificationResponseReceivedListener` while the app is running.
  `clearLastNotificationResponse()` runs after handling, so the same tap does
  not route twice.
- **Allowlist:** a pure function `resolvePushTarget(url)` returns either an
  app route or "open the inbox sheet". It accepts only these:

  | `data.url`           | Opens                         |
  | -------------------- | ----------------------------- |
  | `/`                  | Home                          |
  | `/tags`              | Tags list                     |
  | `/tags/<tagId>`      | Tag detail                    |
  | `/profile`           | Profile                       |
  | `/profile/cards`     | Payout cards                  |
  | `/profile/documents` | Documents                     |
  | `/notifications`     | The inbox sheet               |
  | anything else        | The inbox sheet (and a log)   |

  A scheme, a host, `..`, a query or a fragment is rejected. `<tagId>` must be
  `[A-Za-z0-9-]+`.
- **Signed out:** the target is held in memory. After sign-in it is applied the
  same way `useResumePendingScan` resumes a deferred scan. It is dropped on
  sign-out, on session expiry and on app restart.
- **Role mismatch** (for example, a traveller-only screen for a staff account)
  is not checked here. The screen's own guards handle it, as they already do for
  a typed link.

### Native config

- `expo-notifications` (SDK 54 line). Plugin options: `icon` (a 96×96 white
  mark made from `android-icon-monochrome.png`), `color: "#DB0000"`,
  `defaultChannel: "default"`, `enableRemoteNotifications` set to the flag,
  `enableBackgroundRemoteNotifications: false`.
- `expo-application`, for `getIosPushNotificationServiceEnvironmentAsync()`. A
  development-signed build gets sandbox APNs tokens, and a TestFlight or App
  Store build gets production ones. Each needs the matching gateway, so the app
  reports which one it has.
- **Both need a native rebuild.** The user runs builds. The exact commands go in
  the report.

## Builder's discretion

File layout under `src/features/push/` or `src/providers/`, hook and component
names, the sheet's visual layout within the rnr kit, and test structure.
Following repo rules: `src/actions/NotificationService/` holds the hand-written
fetch (the SDK has no such route yet), `fetchRequest` handles auth, and every
string goes through i18n.

## Verification

- Unit tests: `resolvePushTarget` (allowlist and rejection), the registration
  trigger logic, the sign-out unregister ordering and its timeout, the flag-off
  path (no calls, no UI), and the switch state matrix.
- Gates: `npm run typecheck` and `npm test` against the AGENTS.md baselines.
- On a CPad, after the user has built with the module linked: the permission
  sheet, the Android 13 dialog, the switch, and tap routing, driven by a
  dev-only local notification that carries `data.url`.
- **Unverified until credentials exist:** getting a real token (needs Firebase
  and an Apple profile with Push), registration against the endpoint, and
  delivery from Novu. The report says so.

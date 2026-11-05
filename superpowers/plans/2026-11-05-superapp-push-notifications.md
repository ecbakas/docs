# super-app push notifications — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver OS push to super-app, gated by an off-by-default flag, with per-account consent and allowlisted tap routing.

**Architecture:** A `src/features/push/` module. Pure pieces: flag, target resolver, consent store and the registration orchestrator. A thin device layer wraps `expo-notifications`. Hand-written NotificationService actions call the backend contract from the prerequisites note. A root hook captures taps, a `PushShell` in the authed layout owns registration, the consent sheet and applying targets, and `SessionProvider` ends the push session on sign-out and expiry.

**Tech Stack:** Expo SDK 54, `expo-notifications`, `expo-application`, `expo-crypto`, zustand persist (AsyncStorage), expo-secure-store, jest (node and router projects).

**Spec:** `docs/superpowers/specs/2026-11-05-superapp-push-notifications-design.md` (and `…-push-prerequisites.md` for the HTTP contract)

## Global Constraints

- Worktree `C:/unirefund/super-app-wt-push`, branch `feat/push-notifications`. Never touch `C:/unirefund/super-app`.
- Flag: `EXPO_PUBLIC_PUSH_NOTIFICATIONS === "true"` is on; anything else is off. When off, there is no UI change, no network call and no permission request.
- Endpoints: `PUT|DELETE {gateway}/api/notification-service/push-devices/{installationId}`. The PUT body is `{ token, provider: "fcm"|"apns", platform: "android"|"ios", apnsEnvironment: "sandbox"|"production"|null, locale, appVersion }`. DELETE may be sent with no `Authorization`.
- A `404` or `501` from either route means the endpoint is not deployed. Stop calling until the next launch.
- The sign-out unregister is capped at **3000 ms** and never throws.
- Consent is keyed by **user id** (`jwtUser.sub`): `"granted" | "declined" | undefined`.
- Allowlist: `/`, `/tags`, `/tags/<id>` (`[A-Za-z0-9-]+`), `/profile`, `/profile/cards`, `/profile/documents`, `/notifications`. Anything else opens the inbox sheet.
- Android channel id is `"default"`. Its name is `t("MobileApp.Notifications.Title")`.
- Every string goes through i18n (`MobileApp.Push.*`), in en-US **and** tr-TR. Run `npm run init` after adding keys.
- Repo rules: `.claude/rules/*.md` (api-actions, i18n, ui-components, avoid-use-effect). Render tests are named `*.router.test.tsx`. No new colours outside tokens.
- No native builds by the agent. The user runs them.

## Review Focus

1. **Second account on the same pad:** A has consent `granted`, then B signs in. B must see the sheet and must not be registered until B says "Turn on". Covered by `registration.test.ts › "skips an account with no consent even when the OS granted"`.
2. **Tap while signed out:** a cold start from a tap lands on login. After sign-in the target opens once; it is dropped if the user signs out first. Covered by `pendingTarget` cases in `PushShell.router.test.tsx` and `session.test.ts`.
3. **Hostile or malformed `data.url`:** a number, `https://evil`, `//evil`, `/tags/../x`, `/tags/a?x=1` or `unirefundsuperapp://tags/1` must open the inbox and never route. Covered by `target.test.ts`.
4. **Backend not deployed:** a 404 on PUT must not retry on every re-render, toast or block sign-out. Covered by `registration.test.ts › "stops after 404 until reset"` and the sign-out timeout test.
5. **Token fetch fails** (no Firebase config, no entitlement): this must log and return `"failed"` without throwing into the UI. Covered by `registration.test.ts › "token failure is quiet"`.

---

### Task 1: Dependencies, native config and test mocks

**Files:**
- Modify: `package.json`, `package-lock.json` (via `npx expo install expo-notifications expo-application expo-crypto`)
- Modify: `app.config.js` (plugin entry and `android.googleServicesFile`)
- Modify: `.env.example` (document `EXPO_PUBLIC_PUSH_NOTIFICATIONS`, `GOOGLE_SERVICES_FILE`)
- Create: `assets/images/notification-icon.png` (96×96 white mark on transparent, cropped from `android-icon-monochrome.png`)
- Modify: `jest-setup.ts` (global mocks for `expo-notifications`, `expo-application`, `expo-crypto`)
- Test: `__tests__/app-config.test.ts`

**Interfaces:**
- Produces: the `expo-notifications` plugin options `{ icon: "./assets/images/notification-icon.png", color: "#DB0000", defaultChannel: "default", enableRemoteNotifications: <flag>, enableBackgroundRemoteNotifications: false }`. Flag on: `android.googleServicesFile = process.env.GOOGLE_SERVICES_FILE?.trim() || "./google-services.json"`, and a throw naming `GOOGLE_SERVICES_FILE` if that file does not exist. Flag off: no `googleServicesFile` key.
- Produces (jest): `expo-notifications` mocked with jest.fn defaults. `getPermissionsAsync` returns `{status:"undetermined",canAskAgain:true}`, `getDevicePushTokenAsync` returns `{type:"android",data:"tok"}`, `getLastNotificationResponse` returns `null`; `setNotificationHandler`, `setNotificationChannelAsync`, `addPushTokenListener`, `addNotificationResponseReceivedListener` (both return `{remove}`), `clearLastNotificationResponse`, `dismissAllNotificationsAsync` and `scheduleNotificationAsync` are also mocked, with `AndroidImportance.DEFAULT`. `expo-application` mocked as `nativeApplicationVersion:"1.0.2"`, `getIosPushNotificationServiceEnvironmentAsync → "development"`. `expo-crypto` mocked as `randomUUID → "00000000-0000-4000-8000-000000000001"`.

- [ ] **Step 1:** Add tests to `app-config.test.ts`:
  - `"registers expo-notifications with the entitlement off by default"`: the plugin tuple is found, `enableRemoteNotifications === false`, and `android.googleServicesFile` is undefined.
  - `"turns the entitlement on and reads google-services with the flag"`: with `EXPO_PUBLIC_PUSH_NOTIFICATIONS=true` and `GOOGLE_SERVICES_FILE` pointing at a temp file, the result is `true` plus that path.
  - `"fails loudly when the flag is on and the file is missing"`: `toThrow(/GOOGLE_SERVICES_FILE/)`.
  Generalise `loadConfig` to take an env map.
- [ ] **Step 2:** Run `npx jest __tests__/app-config.test.ts`. Expect FAIL (no plugin).
- [ ] **Step 3:** Run `npx expo install expo-notifications expo-application expo-crypto`. Add the plugin, the flag-gated `googleServicesFile` and the `.env.example` docs. Generate the icon with `@expo/image-utils` or jimp from the monochrome mark (crop to the mark's bounding box, pad about 10 %, 96×96).
- [ ] **Step 4:** Add the three global mocks to `jest-setup.ts`.
- [ ] **Step 5:** Run `npx jest __tests__/app-config.test.ts`. Expect PASS. Also run `npx expo config --type prebuild > /dev/null`, which must exit 0 with the flag off.
- [ ] **Step 6:** Commit: `feat(push): link expo-notifications behind a build flag`.

### Task 2: Flag and tap-target resolver

**Files:**
- Create: `src/features/push/config.ts`, `src/features/push/target.ts`
- Test: `src/features/push/__tests__/target.test.ts`

**Interfaces:**
- Produces: `isPushEnabled(): boolean`.
- Produces: `type PushTarget = { kind: "route"; href: Href } | { kind: "inbox" }`, and `resolvePushTarget(url: unknown): PushTarget`. For `/tags/<id>` the href is `{ pathname: "/tags/[tagId]", params: { tagId } }`. The other routes are their path strings, and `/notifications` resolves to `{ kind: "inbox" }`.

- [ ] **Step 1:** Write `target.test.ts`:
  - `it.each` of the seven allowed paths and their expected targets.
  - `it.each` of rejects, each resolving to `{kind:"inbox"}`: `undefined`, `42`, `""`, `"tags"`, `"/tags/"`, `"/tags/a/b"`, `"/tags/../profile"`, `"/tags/a?x=1"`, `"/tags/a#b"`, `"//evil.com"`, `"https://evil.com/tags/1"`, `"unirefundsuperapp://tags/1"`, `"/tags/a%2Fb"`, `"/TAGS"`.
  - A trailing slash on an allowed static path (`"/profile/"`) resolves the same as without it.
- [ ] **Step 2:** Run `npx jest src/features/push/__tests__/target.test.ts`. Expect FAIL.
- [ ] **Step 3:** Implement with exact string and regex matching on the raw string (no URL parsing).
- [ ] **Step 4:** Run it again. Expect PASS.
- [ ] **Step 5:** Commit: `feat(push): allowlisted tap targets`.

### Task 3: Installation id and per-account consent

**Files:**
- Create: `src/features/push/installation.ts`, `src/features/push/consent.ts`
- Test: `src/features/push/__tests__/installation.test.ts`, `src/features/push/__tests__/consent.test.ts`

**Interfaces:**
- Produces: `getInstallationId(): Promise<string>`. SecureStore key `push_installation_id`, created once with `Crypto.randomUUID()`, and memoised in module scope.
- Produces: `getRegisteredUserId(): Promise<string | null>` and `setRegisteredUserId(id: string | null): Promise<void>`, under AsyncStorage key `push_registered_user`. This records whether this install currently has a registration on the backend.
- Produces: `type PushConsent = "granted" | "declined"`, the store `usePushConsentStore` (persist name `push-consent-storage`, state `{ byUser: Record<string, PushConsent>; setConsent(userId: string, value: PushConsent): void }`), and the selector `usePushConsent(userId: string | null): PushConsent | undefined`. Non-string or unknown persisted values are dropped in `merge`.

- [ ] **Step 1:** Tests:
  - `"creates one id and reuses it"`: two calls give one `setItemAsync` and the same value.
  - `"reads an existing id"`.
  - `"keeps consent per user"`: A granted and B unset.
  - `"drops junk on rehydrate"`: `{byUser:{a:"yes",b:"granted"}}` keeps only b.
- [ ] **Step 2:** Run `npx jest src/features/push/__tests__/installation.test.ts src/features/push/__tests__/consent.test.ts`. Expect FAIL.
- [ ] **Step 3:** Implement, modelled on `src/store/deviceSettings.ts` for the persisted store.
- [ ] **Step 4:** Run them again. Expect PASS.
- [ ] **Step 5:** Commit: `feat(push): installation id and per-account consent`.

### Task 4: NotificationService push-device actions

**Files:**
- Create: `src/actions/NotificationService/put.ts`, `src/actions/NotificationService/delete.ts`
- Test: `src/actions/NotificationService/__tests__/pushDevices.test.ts`

**Interfaces:**
- Produces: `type PushDeviceRegistration = { token: string; provider: "fcm" | "apns"; platform: "android" | "ios"; apnsEnvironment: "sandbox" | "production" | null; locale: string; appVersion: string | null }`.
- Produces: `putPushDeviceApi(installationId: string, body: PushDeviceRegistration): Promise<void>`. It goes through `fetchRequest`, with tenant header from `getStoredTenantId()` and base from `getGatewayUrl()`.
- Produces: `deletePushDeviceApi(installationId: string, opts: { anonymous: boolean }): Promise<void>`. Anonymous sends no `Authorization` and does not use `fetchRequest`. Authenticated uses `fetchRequest(…, "deletePushDeviceApi", false)`, so a 401 never triggers a refresh during sign-out.
- Both throw `ApiError` (from `@/saas/core/ApiError`) with the real status on non-2xx. The id is `encodeURIComponent`-ed.

- [ ] **Step 1:** Tests with `global.fetch` mocked:
  - The PUT URL is `https://dev-api.unirefund.com/api/notification-service/push-devices/<id>`, with a JSON body, a `Content-Type` header, `Authorization: Bearer <stored>` and `__tenant` when a tenant is set.
  - A 401 on PUT refreshes once and retries (mock `refreshSession`).
  - An anonymous DELETE has no `Authorization` header.
  - A 404 rejects with an `ApiError` whose `status === 404`.
- [ ] **Step 2:** Run `npx jest src/actions/NotificationService`. Expect FAIL.
- [ ] **Step 3:** Implement following `src/actions/AccountService/post.ts`.
- [ ] **Step 4:** Run it again. Expect PASS.
- [ ] **Step 5:** Commit: `feat(push): push-device actions against the proposed contract`.

### Task 5: Device layer and registration orchestrator

**Files:**
- Create: `src/features/push/device.ts`, `src/features/push/registration.ts`
- Test: `src/features/push/__tests__/registration.test.ts`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces (`device.ts`):
  - `type PushPermission = { status: "granted" | "denied" | "undetermined"; canAskAgain: boolean }`
  - `ensureNotificationChannel(name: string): Promise<void>` (Android only; id `"default"`, `AndroidImportance.DEFAULT`)
  - `readPushPermission(): Promise<PushPermission>`
  - `requestPushPermission(): Promise<PushPermission>`
  - `readDevicePushToken(): Promise<Pick<PushDeviceRegistration, "token" | "provider" | "platform" | "apnsEnvironment"> | null>`. Returns null, after a log, on any throw. iOS `apnsEnvironment` maps `development` to `sandbox` and `production` to `production`, otherwise null.
  - `clearPresentedNotifications(): Promise<void>`
- Produces (`registration.ts`):
  - `type PushSyncInput = { userId: string | null; consent: PushConsent | undefined; locale: string }`
  - `syncPushRegistration(input: PushSyncInput): Promise<"registered" | "unchanged" | "skipped" | "unavailable" | "failed">`. It skips unless the flag is on, the user id is set, consent is `"granted"` and permission is `granted`. The fingerprint `userId|token|locale|gatewayUrl` is memoised, so a repeat is `"unchanged"`. On success it calls `setRegisteredUserId(userId)`. A 404/501 sets module `endpointMissing`, and later calls return `"unavailable"`.
  - `unregisterPushDevice(opts: { anonymous: boolean; timeoutMs?: number }): Promise<void>`. It never throws. It is a no-op when `getRegisteredUserId()` is null or the endpoint is missing. On 2xx, or a 404 that means not registered, it clears the registered user. It races `timeoutMs`, default 3000.
  - `resetPushRegistrationMemo(): void`, and `__resetPushModuleForTests(): void`.

- [ ] **Step 1:** `registration.test.ts` cases:
  - `"does nothing with the flag off"`
  - `"skips an account with no consent even when the OS granted"`
  - `"skips when declined"`
  - `"skips when the OS denied"`
  - `"registers with the full body"`: asserts the `putPushDeviceApi` args, including `locale: "tr"` and `appVersion: "1.0.2"`
  - `"second identical sync is unchanged"`
  - `"re-registers after resetPushRegistrationMemo"`
  - `"re-registers when the user changes"`
  - `"stops after 404 until reset"`
  - `"token failure is quiet"`: `getDevicePushTokenAsync` rejects, giving `"failed"` with no throw
  - `"unregister is a no-op when nothing is registered"`
  - `"unregister sends DELETE and forgets the user"`
  - `"unregister gives up after timeoutMs"`: fake timers, the DELETE never settles, and it resolves at 3000 ms
  - `"anonymous unregister passes anonymous:true"`
- [ ] **Step 2:** Run `npx jest src/features/push/__tests__/registration.test.ts`. Expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it again. Expect PASS.
- [ ] **Step 5:** Commit: `feat(push): registration orchestrator`.

### Task 6: Session integration (sign-out, expiry, affiliation switch)

**Files:**
- Create: `src/features/push/pendingTarget.ts`, `src/features/push/session.ts`
- Modify: `src/providers/SessionProvider.tsx` (`signOut`, the `onSessionExpired` subscriber), `src/providers/AffiliationProvider.tsx` (`changeAffiliation` success path)
- Test: `src/features/push/__tests__/session.test.ts`, `src/providers/__tests__/sessionLifecycle.router.test.tsx` (add cases)

**Interfaces:**
- Produces: `usePendingPushTargetStore` (zustand, not persisted): `{ target: PushTarget | null; setTarget(t: PushTarget): void; clear(): void }`.
- Produces: `endPushSession(opts: { anonymous: boolean }): Promise<void>`. When the flag is off it is a no-op. Otherwise it runs `unregisterPushDevice(opts)`, then `clearPresentedNotifications()`, the pending-target `clear()` and `resetPushRegistrationMemo()`. It never throws.
- Produces: `resyncPushRegistration(): void`. This calls `resetPushRegistrationMemo()` and bumps `usePushSyncTick` (a tiny zustand counter in `session.ts`), which `PushShell` (Task 7) depends on.
- `signOut` awaits `endPushSession({ anonymous: false })` **before** `publishAccessToken(null)`. The expiry handler fires `endPushSession({ anonymous: true })` without awaiting, inside the `hadSession` branch. `changeAffiliation` calls `resyncPushRegistration()` after a successful `fetchNewAccessToken()`.

- [ ] **Step 1:** Tests:
  - `session.test.ts`: `"clears tray, target and memo"`, and `"no-op with flag off"`.
  - `sessionLifecycle`: `"ends the push session before the token is cleared on sign-out"`. Mock `@/features/push/session` and assert the call order with the `clearTokens` mock via `mock.invocationCallOrder`.
  - `sessionLifecycle`: `"ends the push session anonymously once on expiry"`. Broadcast twice; it is called once with `{anonymous:true}`.
- [ ] **Step 2:** Run `npx jest src/features/push/__tests__/session.test.ts` and `npx jest src/providers/__tests__/sessionLifecycle.router.test.tsx`. Expect FAIL.
- [ ] **Step 3:** Implement and wire.
- [ ] **Step 4:** Run both again. Expect PASS, and the existing lifecycle cases stay green.
- [ ] **Step 5:** Commit: `feat(push): unregister on sign-out and expiry, resync on affiliation switch`.

### Task 7: Root tap capture and the authed `PushShell`

**Files:**
- Create: `src/features/push/usePushRoot.ts`, `src/features/push/PushShell.tsx`
- Modify: `src/app/_layout.tsx` (call `usePushRoot()`), `src/app/(auth)/_layout.tsx` (wrap `TabRoutes` in `<PushShell>`, inside `NotificationsSheetProvider`)
- Test: `src/features/push/__tests__/PushShell.router.test.tsx`

**Interfaces:**
- Produces: `usePushRoot(): void`. When the flag is on, at module init it calls `setNotificationHandler` with `{shouldShowBanner:true, shouldShowList:true, shouldPlaySound:false, shouldSetBadge:false}`. On mount it reads `getLastNotificationResponse()`, then `clearLastNotificationResponse()`. While mounted it uses `addNotificationResponseReceivedListener`. Each response goes through `resolvePushTarget(response.notification.request.content.data?.url)` into `setTarget`.
- Produces: `<PushShell>{children}</PushShell>`, and `usePushControls(): { permission: PushPermission | null; refreshPermission(): Promise<void>; turnOn(): Promise<"registered" | "settings" | "denied">; turnOff(): Promise<void> }`. The default context, with the flag off or outside the shell, has `permission:null` and no-op functions.
- `PushShell`, when the flag is on, does four things:
  - **Sync:** it calls `ensureNotificationChannel(t("MobileApp.Notifications.Title"))` and syncs on mount, when `userId`, consent or `languageCode` change, on `usePushSyncTick`, on `addPushTokenListener` (after a memo reset) and on AppState `active` (re-reads permission, then syncs).
  - **Targets:** it applies the pending target once the shell is mounted. A route uses `router.push(href)`, and the inbox uses `useNotificationsSheet().open()`. Then it calls `clear()`.
  - **Consent sheet:** it renders the sheet when consent for `userId` is undefined, 1500 ms after mount, and not if a pending scan or a target was applied on this mount.
  - **turnOn:** it does `setConsent(userId,"granted")`, then asks for permission if needed, or opens `Linking.openSettings()` when it is denied and `canAskAgain` is false, then re-reads and syncs. **turnOff** does `setConsent(userId,"declined")` then `unregisterPushDevice({anonymous:false})`.

- [ ] **Step 1:** `PushShell.router.test.tsx` (mock `expo-router`'s `router`, the sheet provider hook and registration):
  - `"applies a route target once and clears it"`
  - `"opens the inbox for an inbox target"`
  - `"renders nothing extra with the flag off"`
  - `"shows the consent sheet for an account with no answer"`
  - `"does not show it for an account that answered"`
  - `"Not now records declined for that user only"`
  - `"Turn on asks the OS and syncs"`
  - `"Turn on with a permanent denial opens settings"`

  Use `jest.useFakeTimers()` for the 1500 ms delay.
- [ ] **Step 2:** Run `npx jest src/features/push/__tests__/PushShell.router.test.tsx`. Expect FAIL.
- [ ] **Step 3:** Implement. The sheet uses the app's `BottomSheet` component. Its strings are passed from the host as props, because sheet children lose context (AGENTS.md). Its buttons are `Button` from rnr: default "Turn on", ghost "Not now".
- [ ] **Step 4:** Run it again. Expect PASS.
- [ ] **Step 5:** Commit: `feat(push): tap routing and the consent sheet`.

### Task 8: Profile switch, i18n and the dev test row

**Files:**
- Modify: `src/screens/shared/Profile/_components/SettingsGroup.tsx` (an optional `toggle?: { value: boolean; onValueChange: (next: boolean) => void; disabled?: boolean }` that renders rnr `Switch` in place of the chevron; tapping the row toggles it)
- Create: `src/features/push/usePushSettingsRow.ts`. It returns `SettingsRowProps[]`: with the flag off, that is `[]`; with it on, the push switch row, plus a `__DEV__`-only "Send a test notification" row that schedules a local notification in 5 s with `data.url = "/tags"`.
- Modify: `src/screens/traveller/Profile/IdentityProfileScreen.tsx`, `src/screens/shared/Profile/StaffProfileScreen.tsx`. With the flag on, the push rows replace the disabled "Notification Preferences" row. With it off, nothing changes.
- Modify: `src/localization/resources/en-US.json`, `tr-TR.json` (the `Push` block)
- Test: `src/screens/shared/Profile/_components/__tests__/SettingsGroup.router.test.tsx` (toggle), `src/features/push/__tests__/usePushSettingsRow.router.test.ts`

**Interfaces:**
- Consumes: `usePushControls()`, `usePushConsent(userId)`.
- Switch value: `consent === "granted" && permission?.status === "granted"`. Turning it on calls `turnOn()`, and turning it off calls `turnOff()`.
- i18n keys `MobileApp.Push.*`:

  | Key | en-US | tr-TR |
  | --- | ----- | ----- |
  | `SheetTitle` | Get updates as notifications | Güncellemeleri bildirim olarak alın |
  | `SheetBody` | We'll tell you when something changes on your tax-free forms, refunds or reports — even when the app is closed. | Vergiden muaf formlarınızda, iadelerinizde veya raporlarınızda bir değişiklik olduğunda, uygulama kapalıyken bile size haber verelim. |
  | `TurnOn` | Turn on | Aç |
  | `NotNow` | Not now | Şimdi değil |
  | `SwitchTitle` | Push notifications | Anlık bildirimler |
  | `TestNotification` | Send a test notification | Test bildirimi gönder |

  Reuse the existing Turkish terms where `tr-TR.json` already has them (grep for "bildirim", "vergiden muaf").

- [ ] **Step 1:** Tests:
  - `"renders a switch for a toggle row and calls onValueChange"`
  - `"flag off returns no rows"`
  - `"switch is on only with consent and OS grant"`
  - `"toggling on calls turnOn"` and `"toggling off calls turnOff"`
- [ ] **Step 2:** Run `npx jest SettingsGroup.router usePushSettingsRow`. Expect FAIL.
- [ ] **Step 3:** Implement. Add the keys and run `npm run init`.
- [ ] **Step 4:** Run the same tests again. Expect PASS.
- [ ] **Step 5:** Commit: `feat(push): profile switch and copy`.

### Task 9: Gates and hand-over

- [ ] **Step 1:** Run `npm run typecheck`. Expect only the baseline error (`tabBackNavigation.router.test.tsx:119`).
- [ ] **Step 2:** Run `npm test`. Expect 0 failing suites. Record the counts against the AGENTS.md baseline.
- [ ] **Step 3:** Run `npm run lint`. Expect 0 errors.
- [ ] **Step 4:** Add a short "Push notifications" section to `super-app/AGENTS.md` covering: the flag, the fact that the module is always linked, the backend contract pointer, and the fact that tokens are unverified until Firebase and Apple credentials exist. Commit it.
- [ ] **Step 5:** Hand the user the rebuild commands: `npx expo prebuild --clean` with the flag off, then `npx expo run:android --device <CPad serial>`. Then on-device QA by serial on a CPad: run Metro with `EXPO_PUBLIC_PUSH_NOTIFICATIONS=true`, check the sheet, the Android 13 dialog, the switch, and the dev test row tap routing to `/tags`.

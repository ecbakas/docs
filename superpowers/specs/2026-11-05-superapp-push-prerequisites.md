# super-app push notifications — backend, Novu, Firebase and Apple prerequisites

Date: 2026-11-05 · For: whoever owns the Notification service, the Novu
environments, the Firebase project and the Apple Developer team.
Design: [super-app push notifications](2026-11-05-superapp-push-notifications-design.md)

The app side is built on branch `feat/push-notifications` (unirefund-mobile),
behind `EXPO_PUBLIC_PUSH_NOTIFICATIONS`, which stays off. **Nothing below has been
changed by the app work.** Each section is a request. Do them in this order:
D and C (credentials) → B (Novu) → A (endpoint) → turn on the flag.

---

## A. Backend: device registration endpoint (Notification service)

Novu stores device tokens only through its secret-key API
(`PUT /v1/subscribers/{subscriberId}/credentials`), so the app has to go
through the backend. There is no such route today. Checked on dev-api on
2026-11-05: Notification, Device, Identity, Traveller, CRM and Administration.

### Contract the app is built against

```
PUT    /api/notification-service/push-devices/{installationId}
DELETE /api/notification-service/push-devices/{installationId}
```

`installationId` is a client-generated UUID, stable for one app install and
random. The caller is any authenticated user: Traveller, Merchant, RefundPoint
or Customs, on host or on a tenant. If the route needs an ABP permission, every
one of those roles must hold it. Otherwise the app gets a 403 and quietly never
registers.

PUT body:

```jsonc
{
  "token": "string",               // FCM registration token, or APNs device token (hex)
  "provider": "fcm" | "apns",
  "platform": "android" | "ios",
  "apnsEnvironment": "sandbox" | "production" | null,  // iOS only
  "locale": "en" | "tr",           // app language; set it as the Novu subscriber locale
  "appVersion": "1.0.2"
}
```

Response: `204`. DELETE returns `204` too, including for an unknown id. The
app treats `404`/`501` as "endpoint not deployed" and stops trying until the
next launch.

**DELETE must also work without a bearer token** (`[AllowAnonymous]`). The app
sends it the moment a session expires, when it no longer holds a token, so a
shared pad stops showing the previous account's pushes right away. The
`installationId` is a random UUID that never leaves the install, and it is the
proof of ownership. This is the same pattern as the anonymous
`public/tag/by-tag-id/{id}`. The worst a leaked id allows is switching that one
device's pushes off. Rate-limit the route. With a bearer token, the same route
behaves the same way.

### Semantics the app relies on

1. **One owner per installation.** A PUT from user B for an `installationId`
   that user A owns moves it to B. Remove A's token from A's subscriber
   credentials, then set it on B's. Do the same if the same `token` appears
   under another `installationId`. This is what stops a shared pad delivering
   account A's notifications to whoever signs in next.
2. **Subscriber = the same id the inbox uses.** That is the user id (the
   access token's `sub`) unless Q1 below says otherwise.
3. **Credentials.** Call `PUT/PATCH /v1/subscribers/{id}/credentials` with
   `providerId` `fcm` or `apns`, and `integrationIdentifier` chosen by
   `provider` and `apnsEnvironment`: see section B for the identifiers. Without
   an `integrationIdentifier`, Novu attaches the token to the most recently
   created integration of that provider.
4. **Locale.** Set the Novu subscriber `locale` from the body, so workflows
   render in the app's language.
5. **Expiry.** The app re-PUTs on every launch with a session. Drop a
   registration not refreshed for 30 days. This is the backstop for an
   anonymous DELETE that never arrived, for example because the device was
   offline when the session expired.
6. **Dead tokens.** When Novu or the provider reports a token as unregistered
   or invalid, remove it.

### Questions for the backend (answers change what gets built)

- **Q1: subscriber ids.** The `NotificationAttemptDto.subscriberId` doc says a
  recipient can be "a user id, or a `traveller-…` or `party-…` id". The
  super-app and web inboxes subscribe as the **user id** only. When does a rule
  send to `traveller-<id>` or `party-<id>`? If a signed-in traveller's tag and
  refund events go to `traveller-<TravellerId>`, they never reach the app's
  inbox today, and a token stored on the user-id subscriber would get no push
  either. Which subscriber should the registration attach to: one, or several
  (user + traveller + each active party)?
- **Q2: payload field names.** Section B's `data.url` templates assume
  `payload.tagId`. Please confirm the real field names per workflow.
- **Q3: staff roles.** Should Merchant, RefundPoint and Customs users get push
  for their workflows (report generated, affiliation created), or only
  travellers? The app registers every role either way. This decides which push
  steps exist.

---

## B. Novu (dev first, then uat and live)

On 2026-11-05, dev Novu (`dev-novu-api.unirefund.com`, application
`mkLEnSh7ClRq`) had 15 workflows and no push step in any of them. Channels:
email, in-app and SMS.

1. **Integrations.** Add three push integrations, with these identifiers (the
   backend passes them as `integrationIdentifier`):
   - `fcm`: Firebase Cloud Messaging, using the service-account JSON from C.
   - `apns-production`: APNs, production, using the `.p8` key from D. Team
     `SMN73535BW`, bundle id `com.clomerce.unirefundsuperapp`.
   - `apns-sandbox`: APNs, sandbox, same key. It serves development-signed
     builds from Xcode. TestFlight and App Store builds use production. One
     binary can point at dev, uat or live, so every environment needs both.
2. **Push steps.** Add a Push step beside the existing In-App step in each
   workflow that should push. Use the in-app subject as the title and the body
   as the body. Set the provider overrides:
   - FCM: `data.url` (below) and `android.notification.channel_id = "default"`.
   - APNs: a top-level `url` key, which expo-notifications exposes as
     `data.url`.

   | Workflow                          | `data.url` (proposed)                |
   | --------------------------------- | ------------------------------------ |
   | `tag-issued`                      | `/tags/{{payload.tagId}}`            |
   | `tag-assigned`                    | `/tags/{{payload.tagId}}`            |
   | `export-validation-completed`     | `/tags/{{payload.tagId}}`            |
   | `sticker-verification-completed`  | `/tags/{{payload.tagId}}`            |
   | `sticker-verification-rejected`   | `/tags/{{payload.tagId}}`            |
   | `refund-created`                  | `/tags/{{payload.tagId}}`, else `/tags` |
   | `payout-created`                  | `/tags`                              |
   | `card-captured`                   | `/profile/cards`                     |
   | `traveller-card-created`          | `/profile/cards`                     |
   | `traveller-account-created`       | `/`                                  |
   | `welcome`                         | `/`                                  |
   | `report-generated-successfully`   | `/notifications` (staff; Q3)         |
   | `party-affiliation-created`       | `/notifications` (staff; Q3)         |
   | `custom-message`                  | `/notifications`                     |
   | `unirefund-sms-workflow`          | no push                              |

   The app accepts only `/`, `/tags`, `/tags/<id>`, `/profile`,
   `/profile/cards`, `/profile/documents` and `/notifications`. Anything else
   opens the inbox. New targets need an app change.
3. **Fix the placeholder redirect** on `sticker-verification-rejected`
   (`/m=/sdfsdf&amp;b=/asdasda`). It is in every rejected item in the test
   traveller's inbox.

---

## C. Firebase (Android)

1. A Firebase project, a new one or the organisation's existing one. Register
   the Android app `com.clomerce.unirefundsuperapp`. No Analytics is needed;
   leave Google Analytics off for the project.
2. Download `google-services.json` and give it to whoever builds. It stays out
   of git; the build reads it from `GOOGLE_SERVICES_FILE`, default
   `./google-services.json` in the repo root.
3. Create a service-account key with the Firebase Cloud Messaging API (V1)
   role. It goes into Novu's `fcm` integration (B.1), not into the app.

## D. Apple (iOS)

1. Enable **Push Notifications** on App ID `com.clomerce.unirefundsuperapp`
   (team `SMN73535BW`).
2. Create an **APNs auth key** (`.p8`) and note its Key ID. It goes into Novu
   (B.1). Never commit it; `*.p8` is already gitignored.
3. **Regenerate the App Store provisioning profile** so it carries
   `aps-environment`. Then update the TestFlight secrets
   `IOS_PROVISIONING_PROFILE_BASE64`, and `IOS_PROVISIONING_PROFILE_NAME` if the
   name changes. Do this **before** a TestFlight run with the flag on, or the
   archive fails on the missing entitlement. The app side needs nothing more:
   with the flag on, prebuild writes `aps-environment` as `production` when CI
   signs (`EXPO_IOS_PROVISIONING_PROFILE` set) and `development` for a local
   device build; with it off, `withPushEntitlementGate.js` removes the key.
4. **Expect, but do not act on, an App Store Connect warning** while the flag
   is off. The binary links expo-notifications, so Apple may email
   ITMS-90078 ("Missing Push Notification Entitlement") for a build without
   `aps-environment`. It is a warning, not a rejection, and it stops once
   step 3 is done and a flag-on build ships. *(Expected from how Apple's check
   works; not yet observed on a real upload.)*

## E. Store privacy declarations

**When this branch merges:** `expo-notifications` is linked into every build,
so the Android build carries `firebase-messaging` and declares
`POST_NOTIFICATIONS`. While the flag is off, Firebase is never initialised (no
`google-services.json`) and nothing is collected. The "no Firebase" line in
the data-collection audit stops being literally true. iOS uploads may also draw
Apple's "Missing Push Notification Entitlement" warning email until the flag
goes on. It is a warning, not a rejection.

**When the flag goes on:** the app sends a push token and a random
installation id to the backend, linked to the account, for app functionality.
Update the Play Data safety form ("Device or other IDs") and App Store App
Privacy ("Device ID").

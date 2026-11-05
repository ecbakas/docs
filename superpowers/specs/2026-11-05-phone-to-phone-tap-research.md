# Phone-to-phone tap between staff and traveller — feasibility

Date: 2026-11-05 · Status: research, no app code written · Apps: super-app, pos-app, ssr

## The question

Could a NameDrop-style gesture — two devices held together — let staff

- **(A) pull** the traveller's identity from the traveller's phone before creating a tag, or
- **(B) push** a freshly created tag to the traveller's phone and assign it to them?

## Short answer

Not with NameDrop or AirDrop: neither has a third-party API. A tap gesture is still possible over
NFC, but **only when one of the two devices is an Android running our app**. iPhones can *read* NFC
with no special entitlement but cannot *emit* without an Apple entitlement we would not get. So
the Android side emulates an NFC tag carrying a short-lived URL, and the other side reads it. That
Android side is the staff tablet/POS, or the traveller's Android phone.

Staff may use **their own iPhone**, not only our CPads and V3. That leaves pairs with **no tap at all**:
**staff iPhone ↔ traveller iPhone**, and **staff iPhone ↔ traveller on the web**. Those pairs get a QR
code instead.

**Both sides give and get data.** The tap (or QR) only has to carry one link, one way: a link that
joins a short-lived **handoff session** on our backend. Once both devices are in the session, the
traveller can share their details and receive the tag, and staff can receive the details and give
the tag. All of it goes through the session, never back over the radio. So the design is one
backend primitive with two ways to join it:
- **QR**, which works for every pair;
- **NFC tap**, which speeds things up wherever an Android app is present.

The link stays an ordinary `https://` address. Once super-app claims that domain (universal links /
App Links), the phone opens super-app when it is installed and ssr in the browser when it is not.

**Recommendation: build the handoff session and its QR join first, because that is the only thing
every pair can use; add the NFC tap second; and do not build an iPhone↔iPhone gesture.** Details in
[Recommendation](#recommendation).

## How it works today

Read from `unirefund-mobile` `origin/main` (`fe5d65a`), `unirefund-qr`, and `web-app` ssr.

| Step | Today |
| --- | --- |
| Staff picks a traveller | `SearchTraveller` dialog: search by document number, e-mail or phone; MRZ scan of the passport; or KYC photo-ID camera. An MRZ that matches nobody becomes a new traveller (`travellerFromMrzInfo`). |
| Tag created with traveller | `postTagServiceTagApi` with `status: "Issued"` and a `traveller` on the request. |
| Tag created without traveller | `status: "Draft"`. Staff can assign later (`postApiTagServiceTagByIdAssignTraveller`, from TagPreview / TagDetail, traveller picked with `SearchTraveller`). |
| Traveller claims a draft | Scans the tag QR — on the receipt, or on staff TagDetail (`TagDocuments` renders `publicLink`) — then `self-assign-by-tag-id` (the GUID is the proof) or `self-assign` (tag number + sales amount). ssr has the same flow on `/[lang]/tag/[slug]`. |
| Traveller "identity QR" | **Placeholder.** `Profile/_components/QrCodeModal.tsx` renders the constant `"UNIREFUND"`. Nothing scans it. |
| `feat/assisted-qr-scan` | Already merged into main. It is **customs** assisted validation for a traveller without a phone (UNI-1817), not traveller identification at the shop. |

Facts that shape the design:

- **The tag QR is a bearer link that can carry PII.** `publicLink` is `{ssrBaseUrl}/tag/{slug}` and
  the slug is reversible base64 of `{n:tagNumber,i:tagId,t:travellerDocumentNumber[,s:sticker]}`
  (`@unirefund/qr` `slug.ts`). Whoever holds it can read the document number and claim a draft. Fine
  on paper handed to the traveller; not something to broadcast over a radio.
- **No universal links / App Links.** `app.config.js` declares no `associatedDomains` and no
  verified Android intent filters, so a URL read from outside the app opens the browser (ssr), not
  super-app.
- **NFC in super-app is reader-only.** `react-native-nfc-manager` 3.17 (no card emulation), iOS
  entitlement formats `["TAG"]` only (no `NDEF`), Android reader flags NFC-A/B + skip-NDEF for EMV
  cards. pos-app has its own `NfcTransport.kt` reader. **No HCE service exists in either app.**
- **Devices.** CPadNFC and V3 report `android.hardware.nfc.hce` (AGENTS.md, 2026-09-24); CPadNFC
  re-checked today: `nfc`, `nfc.hce`, `nfc.hcef`, `bluetooth_le`; **no UWB, no Wi-Fi Aware**.
  Only CPadNFC answered `adb` today. No iPhone is attached to this Windows host; iOS builds go
  through the TestFlight workflow.
- **Staff devices are not only ours.** Staff may run super-app on their own iPhone (or Android
  phone), so every staff-side capability has to be judged for an iPhone too.

## What the platforms allow (checked 2026-11-05; iOS 27 is current)

"verified" = re-read on the primary page for this doc; the rest comes from one research pass over
the cited pages.

| Capability | Verdict for us | Gate / limit | Source |
| --- | --- | --- | --- |
| **NameDrop** | ✗ No third-party API; the card lands in Contacts | Apple devices only, iOS 17.1+ | support.apple.com/guide/personal-safety/ips97e16d3b1 |
| **AirDrop** of a file/URL | ✗ for us. Share sheet only; the "hold phones together" start works for app content only between known contacts; strangers need "Everyone for 10 Minutes" + an AirDrop code (iOS 26.2) | Apple↔Apple; Quick Share↔AirDrop interop only on flagship Androids (Pixel 8a+, Galaxy S26…), no API | support.apple.com/en-us/119857 · developer.apple.com/forums/thread/738469 · blog.google (2025-11-20, 2026-05-12) |
| **Core NFC read** (in-app) | ✓ NDEF on tag types 1–5; raw ISO 7816 etc. Foreground with the system sheet | Entitlement formats `NDEF`/`TAG`; we only declare `TAG` | developer.apple.com/documentation/corenfc |
| **Background tag reading** (no app open) | ✓ iPhone XS+. First URI record; https → notification → app via universal link, else the **default browser** (Apple says Safari; Chrome seen on device when it is the default) | **No custom URL schemes**. Off while camera, Wallet, a Core NFC session or airplane mode is active, or if never unlocked | …/corenfc/adding-support-for-background-tag-reading (verified) |
| **iPhone as a tag — EEA HCE (`CardSession`)** | ✗ for us. Has a "Device-to-Device transactions" use case, free of charge, but: developer must be **established in the EEA**, users must be **based in the EEA** (`CardSession.isEligible`) | A traveller never qualifies (non-EU resident by definition). A **staff** iPhone in an EEA shop could, if the Apple developer organisation is EEA-established and Apple approves the device-to-device use case. Turkey and the Faroe Islands are outside the EEA, so not for current markets | developer.apple.com/support/hce-transactions-in-apps (verified) |
| **iPhone as a tag — NFC & SE Platform** | ✗ 49 territories (not Turkey, not EU); no device-to-device or "other" use case; commercial terms, fees, Apple approval, lab review | — | developer.apple.com/support/nfc-se-platform |
| **Apple Wallet NFC pass (VAS)** | ✗ Needs an Apple-issued NFC pass entitlement + certificate, and a VAS-certified reader; protocol not public. Google Smart Tap likewise | Our traveller pass would need that entitlement first | developer.apple.com/documentation/walletpasses/pass/nfc-data.dictionary |
| **Apple "Tap to Share"** (iOS 27, `CustomerEngagementSession`) | ✗ Closest thing to the asked-for gesture, but: merchant must be an **iPhone in an active Tap to Pay session**, collects contact fields not passport data, and is "not currently available in the European Economic Area"; Tap to Pay is not offered in Turkey | iOS 27, iPhone 12+ | developer.apple.com/tap-to-pay/tap-to-share (verified) |
| **ID Verifier / Wallet Digital ID** | ✗ Reader must be in US / PR / Japan; Digital ID is US passports only | Entitlement with legal basis | developer.apple.com/wallet/id-verifier |
| **NearbyInteraction / UWB** | ✗ iPhone↔iPhone/Watch, or accessories via Apple's protocol; OrderPAD has no UWB | — | developer.apple.com/documentation/nearbyinteraction |
| **Multipeer Connectivity** | ✗ Apple-only (TN3111) | — | developer.apple.com/documentation/technotes/tn3111 |
| **BLE** | ~ Works in the foreground on both; a backgrounded iOS app's service UUIDs move to an overflow area Android cannot see; RSSI cannot prove "touching", only "nearby candidate" | Bluetooth permission prompts on both sides | CBPeripheralManager `startAdvertising` docs |
| **Wi-Fi Aware** (iOS 26+) | ✗ Mandatory PIN pairing via DeviceDiscoveryUI; iPhone↔Android interop unproven in forum reports | Entitlement; approval process unclear | developer.apple.com/documentation/wifiaware · forums/thread/790195 |
| **App Clips** | ~ Invocable from an NFC URL, but needs background reading + an App Clip experience; adds nothing over a universal link for an app most travellers would need anyway | iPhone XS+ | developer.apple.com/documentation/appclip |
| **Android HCE** (`HostApduService`) | ✓ Any app, no approval; custom or NDEF AID in `CATEGORY_OTHER`, `setPreferredService` while in the foreground | Screen on (per service); one NFC role at a time | developer.android.com/develop/connectivity/nfc/hce |
| **Android reader mode** | ✓ Already used by both apps for EMV | — | `NfcAdapter.enableReaderMode` |
| **Android Beam** | ✗ Removed | — | NfcAdapter reference |
| **Web NFC** (Chrome Android) | ~ ssr could read an NDEF tag while the page is visible; no HCE; no iOS | Chrome 89+ | developer.chrome.com/docs/capabilities/nfc |

The asymmetry that decides everything: **iPhones read NFC freely but cannot emit; Android devices
can do both.** So in each pair the Android app emits and the other device reads. When neither
device is an Android app, there is no tap.

## Options matrix

### Which pairs can tap at all

| Staff ↓ · Traveller → | iPhone, super-app | Android, super-app | Web only (ssr) |
| --- | --- | --- | --- |
| **Android** — CPad, V3, or their own | ✓ staff emits | ✓ staff emits | ✓ staff emits (opens the browser) |
| **iPhone** — their own | **✗ no tap → QR** | ✓ traveller's phone emits, staff iPhone reads in-app | **✗ no tap → QR** |

Staff on an iPhone can still *push* a tag in effect. They identify the traveller (by tap or QR) and
then assign the tag with the existing `assign-traveller` call. So for staff iPhones, direction (B)
reduces to direction (A).

Staff: **SA** = Android (tablet, POS or own phone), **SI** = own iPhone.
Traveller: **iP** = iPhone app, **AP** = Android app, **W** = ssr in a mobile browser.

### (A) Staff ← traveller: pull the traveller's identity

| Option | SA←iP | SA←AP | SA←W | SI←iP | SI←AP | SI←W |
| --- | --- | --- | --- | --- | --- | --- |
| A1 NameDrop / AirDrop contact | ✗ | ✗ | ✗ | ✗ no API | ✗ | ✗ |
| A2 **Staff emits handoff URL, traveller taps and confirms** | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| A3 **Traveller emits identity URL, staff reads** | ✗ | ✓ | ✗ | ✗ | ✓ | ✗ |
| A4 **Traveller shows identity QR, staff scans** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| A5 BLE exchange | ~ | ~ | ✗ | ~ | ~ | ✗ |
| A6 Apple Wallet NFC pass (VAS) | ✗ | — | — | ✗ entitlement | — | — |
| A7 Apple Tap to Share (iOS 27) | ✗ | ✗ | ✗ | ~ gated¹ | ✗ | ✗ |
| A8 UWB + Multipeer "bring together" | ✗ | ✗ | ✗ | ~ both apps open² | ✗ | ✗ |

### (B) Staff → traveller: send the created tag and assign it

| Option | SA→iP | SA→AP | SA→W | SI→iP | SI→AP | SI→W |
| --- | --- | --- | --- | --- | --- | --- |
| B1 AirDrop the claim link | ✗ | ✗ | ✗ | ~ share sheet³ | ✗ | ✗ |
| B2 **Staff emits claim URL, traveller taps and claims** | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| B3 **Claim QR on staff screen** (today, with `publicLink`) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| B4 Identify (any A option), then assign (today's call) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

✓ works · ~ works with caveats · ✗ not possible

1. Only inside a PSP's Tap to Pay session on the staff iPhone. Not available in the EEA, and Tap to
   Pay is not offered in Turkey. It shares contact fields and Wallet passes, not passport data.
2. NearbyInteraction can measure a few centimetres between two iPhones (11 or later). The two
   phones first exchange discovery tokens over Multipeer. Both apps must be open on that screen, and
   first use shows two permission prompts (Local Network, Nearby Interaction). It is no faster than a
   QR when both apps are already open anyway.
3. Strangers need "Everyone for 10 Minutes" plus an AirDrop code (iOS 26.2), and the received link
   opens wherever iOS sends it. It is a share, not a gesture.

A2, A3 and B2 are the same mechanism, and A4/B3 are the same link drawn as a QR. The next section
merges them into one session in which both sides give and get.

## Two-way: both sides give and get

The tap or QR moves **one link, one way**: the join link of a handoff session. Everything else
moves **both ways through the session**, so the radio never has to carry data back:

| Staff · Traveller | How the session is joined | Tested on device? |
| --- | --- | --- |
| Android · iPhone | staff device emits, the iPhone reads | **Yes** (background read, 2026-11-05) |
| Android · Android | staff device emits, the phone reads | **Yes** (V3 reading CPadNFC, 2026-11-05) |
| Android · web | staff device emits, the phone opens ssr | iPhone half yes (it opened the browser) |
| iPhone · Android | traveller's phone emits, staff iPhone reads in-app | No (in-app read untested) |
| iPhone · iPhone, iPhone · web | QR, either side shows it | — (camera scan, no NFC) |

In every row, once joined:
- the traveller **gives** their details and **gets** the tag;
- staff **get** the details and **give** the tag.

The session part needs the backend and is not built, so it is untested in every row.

A direct two-way NFC exchange is not proposed. It would mean each side sending its own data in APDUs
during one tap, which only works when both ends are our apps in the foreground (Android↔Android, or
a staff iPhone app talking to a traveller's Android app). It adds nothing the session does not
already give, and it cannot reach a traveller in a browser or with no app open.

### The session

1. **Create.** The device that will emit (or show the QR) creates it and gets
   `{ id, joinUrl, expiresAt }`. Staff need the tag-create and traveller-search grants; a traveller
   only needs to be signed in.
2. **Join.** The other device reads `joinUrl` and joins with its own sign-in. The server accepts
   exactly one staff member and one traveller, once, within the TTL (2–5 minutes). The emitter stops
   emitting.
3. **See who is there.** The traveller's screen names the merchant and the staff member; the staff
   screen says "Traveller connected".
4. **Give and get, in either order:**
   - traveller → staff: **share details.** A consent screen lists the fields (name, nationality,
     document type and number, date of birth) and the document (active by default); the server
     records the consent. The staff screen fills in the traveller exactly as a search hit would
     (`TravellerSearchResultDto` → `onSelect`).
   - staff → traveller: **give the tag.** A tag created for that traveller appears on their screen
     at once. Or staff offer an existing draft, the traveller taps **Accept** (self-assign), and
     staff see "Accepted by ⟨name⟩".
5. **Follow.** Both screens poll the session every 1–2 s while it is open; a push channel can come
   later.
6. **Close.** The session closes when the tag is delivered, either side cancels, or it expires.

One tap therefore covers both (A) and (B) from the original question. Staff get the traveller's
details before creating the tag, and the traveller gets the tag afterwards. The traveller decides
everything on their own phone.

## Opening super-app when it is installed

The goal: if the traveller has super-app, the tap opens it; if not, it opens ssr in the browser.

**Do not put an app-scheme link (`unirefundsuperapp://…`) on the tag.**
- iPhone background tag reading ignores custom URL schemes (Apple: "doesn't support custom URL
  schemes. Use universal links instead."). An iPhone with no app open would show nothing.
- On Android, a custom scheme with the app missing also shows nothing.

**Keep the `https://` link and make super-app claim it**:

| | iPhone | Android |
| --- | --- | --- |
| App setting | `ios.associatedDomains: ["applinks:<ssr host>"]` | `android.intentFilters` for `https://<ssr host>/s/*` with `autoVerify: true` |
| File ssr must serve | `/.well-known/apple-app-site-association` naming the Team ID + `com.clomerce.unirefundsuperapp` and the paths (`/s/*`, later `/tag/*`) | `/.well-known/assetlinks.json` with the package name and the signing certificate SHA-256 |
| App installed | opens super-app, link delivered to the router | opens super-app |
| App missing | opens the link in the default browser (ssr) | opens the browser (ssr) |

**Blockers found 2026-11-05:**
- **ssr redirects these files.** On `ssr-dev`, `/.well-known/apple-app-site-association`,
  `/apple-app-site-association` and `/.well-known/assetlinks.json` all answer `307` to a
  `/tr/…` path, from the locale middleware. Apple requires the file served directly, with no
  redirect, and Android verification fails on one too. The middleware must exempt `/.well-known/`.
- **super-app declares neither setting** today, so this needs a new App Store / Play release.
  Travellers on older versions just get the browser, which is the fallback anyway.
- **One host per environment.** dev, uat and live ssr hosts each need the files, and each app build
  must list the hosts it should open. The live ssr host is not settled (`ssr.unirefund.com` is a
  catch-all today).

Android also has an "Android Application Record" (`android.com:pkg`) that forces the app open. It
is not wanted here: with the app missing it opens the **Play Store** instead of ssr.

## UX flows

### Tap to connect (an Android device in the pair)

1. Staff tap **Connect traveller**, either in `SearchTraveller` (before creating a tag) or on a
   tag's result screen (after). If staff are on an iPhone and the traveller is on Android, the
   traveller taps **Connect to shop** instead, and their phone emits.
2. The emitting device shows "Hold the phones together", the same link as a QR, and where its NFC
   antenna is.
3. The other phone touches it:
   - **iPhone, no app open:** a banner opens super-app if installed, else ssr in the default browser.
   - **Android phone, NFC on and unlocked:** the OS opens super-app if installed, else the browser.
   - **Already in super-app:** a **Tap phone** button runs an in-app NDEF read, with no banner.
4. Both screens move into the session (above): consent to share, then the tag arrives.

### QR join (every pair, including iPhone ↔ iPhone)

The same session, with `joinUrl` drawn as a QR by whichever side would have emitted. The other side
scans it with super-app's `QrScanner` or the phone camera.
- On the traveller side this replaces the `"UNIREFUND"` placeholder QR (**Connect to shop**).
- On staff screens it replaces showing `publicLink` as the hand-over QR. The printed receipt can keep
  `publicLink`.

### Staff iPhone ↔ traveller iPhone (or web)

There is no **NFC** tap here; one side shows the QR. An NFC tap needs one device to act as the tag,
and iOS lets third-party apps act as a tag only through Apple's card-emulation programmes:
- the **EEA programme** needs an EEA-established developer and an EEA-based user;
- the **NFC & SE Platform** has no device-to-device use case and excludes Turkey.

NameDrop and AirDrop do this between iPhones, but they are system features with no app API.

**Narrow exception, not for current markets:** a *staff* iPhone in an EEA shop could emit through
the EEA programme. That needs:
- the Apple developer organisation to be EEA-established (the marketing site names
  "Unirefund Ireland"; who holds the Apple account is unverified);
- Apple to approve the device-to-device use case.

The traveller's iPhone would only read, which needs no programme. Turkey and the Faroe Islands
are outside the EEA, so this does not apply today.

An iPhone-only proximity gesture (A8, UWB + Multipeer) is buildable without NFC. But it needs both
apps open on the same screen plus two permission prompts on first use. At a counter that is no
quicker than a QR scan, and it costs a native Swift module on each side.

## Security and privacy

**What moves over the air**: only an opaque URL with a random token. No name, no document number.
Today's `publicLink` must **not** be emitted as-is: its slug decodes to the document number and its
GUID is a permanent claim capability.

**What moves server-side**: after joining, the traveller's details go from the traveller's
authenticated session to the staff member's. That happens only after the traveller confirms on their
own screen, and only to a staff user who already holds the search grant (the same data a
document-number search returns today). The tag goes the other way, as an assignment the traveller's
own session accepts.

**Why a server token beats sending raw PII** (e.g. a vCard over NFC from the traveller's phone):
- The data comes from the traveller's verified profile, not from whatever the sender types.
- It goes through the same grants and tenant rules as a search, and the consent is logged
  (KVKK/GDPR: purpose, timestamp, merchant, staff user).
- It can expire, be revoked, and be single-use; raw PII cannot be recalled once beamed.
- It works identically when the reader is a browser that cannot do anything with raw bytes.

**Replay**: a join link works once and expires in minutes. The emitter stops emulating once the
session is joined or the screen closes, and a replayed link is rejected.

**Relay** (NFC relay extends 4 cm to anywhere), or a photographed QR, lets someone else join first.
Both screens then show the wrong counterparty:
- staff see a stranger's name with the real traveller in front of them, and cancel;
- a traveller sees a merchant they are not standing at, and declines.

Nothing is shared or assigned until the person on each phone has seen who joined. This also fixes the
weakness of the earlier traveller-emits design (A3): consent now always comes *after* the traveller
sees the counterparty. NFC's few-centimetre range already makes casual capture harder than a QR on a
counter.

**Consent copy** must say who receives the data and what fields; decline must be as prominent as
accept.

## Effort, backend and what can be prototyped

| Piece | Where | Size | Native rebuild |
| --- | --- | --- | --- |
| **Connect** screens on both roles: emit/show QR, join, consent, accept, follow the session | super-app, pos-app (staff only) | medium | no |
| HCE NDEF Type 4 tag emulator (`HostApduService`, AID `D2760000850101`, CC + NDEF files), one module for staff and traveller | new Expo module in super-app; same Kotlin in pos-app's `modules/` | ~250 lines Kotlin + config plugin (`apduservice.xml`, service in manifest); the spike's `Type4Tag.java` is the starting point | yes |
| In-app NDEF read (**Tap phone**, both roles) | super-app (`react-native-nfc-manager` NDEF; add `"NDEF"` to `readersession.formats`) | small | yes (iOS entitlement) |
| Universal links / App Links so the link opens super-app when installed | `associatedDomains` + Android `autoVerify` intent filters in super-app; AASA + `assetlinks.json` served by ssr, **with the `/.well-known/` redirect removed** (see [Opening super-app](#opening-super-app-when-it-is-installed)) | small–medium | yes |
| ssr session pages `/s/<joinToken>`: join, consent, accept | web-app ssr | small–medium | — |
| **Backend: handoff session**: create, join, share details (with a consent record), give or offer a tag, accept, poll | TravellerService + TagService | medium–large | — |

Rough app-side size, excluding backend: Connect screens and the QR join about a week; NFC tap
(emitter module, Tap phone, universal links) another one to two weeks. The backend endpoints are the long pole and are not sized here. A8 (iPhone↔iPhone UWB)
would add a native Swift module and is not recommended.

**Prototype on the attached devices, in this order:**

1. **Spike (1–2 days), no backend**: HCE emulator on CPadNFC emitting a fixed `https://` URL (the ssr
   home page, *not* a real `publicLink`). Check it three ways:
   - an unmodified iPhone with no app open (background reading; no build needed);
   - any Android phone;
   - an iPhone running an in-app NDEF read. This needs a TestFlight build with `"NDEF"` added, and it
     is what staff iPhone ↔ traveller Android (A3) depends on.

   This retires the main unknown — see [Unknowns](#unknowns) — and finds where the OrderPAD
   antenna is. V3 is the second staff device whenever it is attached.
2. **Session + QR join** as soon as the backend session exists. It needs no NFC at all.
3. **NFC tap** as a second way to join the same session.

Not testable here: anything iPhone-side beyond background reading needs the TestFlight workflow and
the user's iPhone.

## Spike status (2026-11-05)

**Closed.** The spike app was uninstalled from CPadNFC after the last round (Android ↔ Android,
09:36), and `dumpsys nfc` no longer routes `D2760000850101`; NFC itself stays on. The source stays in
`C:\unirefund\spikes\nfc-hce-ndef\` for the real emitter module. The in-app read is deferred to the
first step of building A3.

**Main question answered: yes.** An iPhone with no app open reads CPadNFC posing as an NFC tag,
and offers to open the URL. Android ↔ Android works too (third round). Still open: the iPhone in-app read (what staff iPhone ↔
traveller Android needs). The controller crash **did** come back once, so the OrderPAD's PN7220 is a
reliability risk.

- **Code:** `C:\unirefund\spikes\nfc-hce-ndef\`, a throwaway app `com.clomerce.nfcspike` outside every
  repo. It is built with the plain SDK tools; see its README.
  - `Type4Tag.java` is the read-only NFC Forum Type 4 tag: NDEF app AID `D2760000850101`, CC file
    `E103`, NDEF file `E104`, and one URI record.
  - `NdefHceService` hosts it as a `HostApduService` with `category="other"`.
- **Verified:**
  - A JVM test replays the reader's procedure (select app, select and read CC, select NDEF, read
    NLEN, read the message in chunks of 246, 59, 16 and 1 bytes) and decodes the URL back (17 checks
    pass).
  - On CPadNFC, `dumpsys nfc` lists the service as the **default** handler for `D2760000850101`,
    routed to host, with "Requires Device ScreenOn: true" and "Requires Device Unlock: false".
  - The screen launches without a crash.
- **Verified over the air afterwards:** the iPhone background read (see the rounds below). Never
  verified: the iPhone in-app read, and an Android phone tapping the CPad.
- **While installed it emitted** `https://ssr-dev.unirefund.com/?src=nfc-spike` whenever CPadNFC's screen was on. Each
  tap leaves a summary line on the spike's screen ("URL SERVED" or "not served", with the APDU
  count), and the raw APDUs go to `logcat -s NfcSpike`.
- **Side finding:** `dumpsys nfc` on the OrderPAD hangs (dump timeout) while the device dozes, and
  answers normally once the screen is on.

### First round of taps (09:01, from `logcat -s NfcSpike` on CPadNFC)

| Time | What the reader did | Result |
| --- | --- | --- |
| 09:01:30, :31, :33 | SELECT app **without Le** (`00A4040007D2760000850101`) → select CC → read CC → link lost | not served (×3) |
| 09:01:39, :40 | SELECT app **with Le** → CC → select NDEF `E104` → read NLEN twice → read 41 bytes | **URL served** (×2) |

- **Confirmed on the iPhone (user, 2026-11-05): background tag reading works against an Android
  HCE tag.** With no app open, the iPhone read the full NDEF file from CPadNFC and showed an
  "NFC tag" prompt that opens the URL. So the served pattern above is the iPhone's.
- **The prompt opened Chrome, not Safari.** With no app claiming the link, iOS uses the user's
  **default browser**, so the ssr landing page must work in Chrome on iOS too.
- The three early drops happened after the capability container, each ending in link loss (the
  field went away). That fits the phone being moved while the user looked for the antenna, not a
  rejected tag: the same CC was accepted seconds later. Which phone made them is not confirmed.
- **NFC controller crash on CPadNFC at 09:01:21**, 12 s after the CPad was unlocked and before the
  first logged exchange. The PN7220 sent `CORE_RESET_NTF` (`60 00 02 A0 00`); the NXP HAL ran
  `phNxpNciHal_emergency_recovery` and `abort()`ed (tombstone). `com.android.nfc` then restarted,
  and NFC was back within a second with the spike still the default for the AID. The HAL had been
  up 32 days, so the first tap probably triggered it, but it did not recur on the next five
  exchanges. Watch for it: a controller reset also kills any card read in progress in super-app.

### Second round (09:08–09:09): more background reads

- CPadNFC served the **full NDEF file twice** (09:08:59, 09:09:01), with the same APDU sequence as
  round one.
- **These were background reads too.** No NFC app was installed on the iPhone (user, 2026-11-05).
  An earlier note here guessed they were in-app reads; that was wrong. So the **in-app read is
  still untested**. Testing it needs some app on the iPhone that opens a Core NFC session: a
  third-party NFC reader, or a super-app build with an NFC read screen.
- **The risk looks low.** The background reads already exercised the same radio link and the same
  Type 4 NDEF read procedure, and an in-app NDEF read is the most standard Core NFC use there is.
  It is reasonable to verify it as the first step of building A3 rather than block on it now.
- **No further controller resets**: 5 full reads since the one at 09:01:21 (09:01:39, :40 and :51
  in round one, two here), all on the same HAL and NFC processes.

### Third round (09:36): Android ↔ Android

- The spike app was reinstalled on CPadNFC. **The V3**, a stand-in for a traveller's Android phone
  with NFC on and nothing installed, was tapped against it.
- CPadNFC served the **full NDEF file twice** (09:36:06, 09:36:07). **The V3 opened the URL in
  Chrome** (user, 2026-11-05).
- Android's read is one APDU shorter than the iPhone's: it reads NLEN once, where iOS reads it twice.
- The HCE service answered even though the spike's screen had not been opened since the reinstall.
  So an installed app's tag emulation does not need its UI running.
- The spike app was uninstalled again afterwards, and the AID routing is gone.

### Second controller reset (09:10:45)

The device's crash log shows a **second PN7220 reset**, with the same
`phNxpNciHal_emergency_recovery` → `abort()` path. It happened about 1¾ minutes after the last
round-two read, with the spike still installed. The main and system logs had already rolled past it,
so its trigger is unknown.

The HAL had run 32 days without one before the spike, and then crashed twice in about ten minutes of
tapping. That makes HCE on the OrderPAD's PN7220 a real **reliability risk** until it is understood.
Before building on OrderPADs:
- reproduce with a longer tap session;
- collect the tombstones;
- raise it with Sunmi.

The V3 (a different board) has not been tried as the emitter.

### Tap protocol

1. Wake CPadNFC. It can stay locked; the spike screen shows the tap log.
2. **iPhone, no app (background read):** unlock the iPhone and stay on the Home screen (not the
   camera, Wallet or Control Center). Hold the top of the iPhone's back against the CPad's back and
   move it slowly until something happens. Expected: an "NFC Tag" banner offering the default browser for
   `ssr-dev.unirefund.com`.
3. **iPhone, in-app read:** any Core NFC reader app (for example NFC Tools) → Read → hold to the
   CPad. Expected: one URI record with the same URL. This stands in for super-app's own
   `NFCNDEFReaderSession`, so no TestFlight build is needed for the spike.
4. **Android phone (if available):** NFC on, unlocked, tap. Expected: the browser opens the URL.
5. Check the spike screen after each tap. "URL SERVED" with no banner means iOS read the tag and
   chose not to surface it; "not served" or no line at all means the exchange never completed.

## Unknowns

- ~~Does an iPhone's background tag reading pick up an Android HCE-emulated NDEF Type 4 tag?~~
  **Yes, confirmed on device 2026-11-05** (see Spike status).
- **Why does the OrderPAD's PN7220 reset?** It reset twice (09:01:21, 09:10:45) while the spike
  was installed, after 32 days without one. Until that is understood, OrderPADs are unreliable
  emitters. Next steps: reproduce, collect the tombstones, ask Sunmi, and try the V3 as the emitter.
- **Where the OrderPAD and V3 antennas are**, and whether a phone held to a tablet's back is
  comfortable at a counter. V3 is a POS with a marked contactless area; the OrderPAD is unknown.
- **Android phones with NFC off.** Many users never turn it on; QR stays the fallback.
- **Emulation and reading are exclusive.** While the tablet emulates a tag it is not reading cards;
  fine as long as the two live on different screens.
- **Does an iPhone's in-app `NFCNDEFReaderSession` read the same Android HCE tag reliably?**
  It is better attested than background reading, but still needs the spike. Staff iPhone ↔
  traveller Android rests on it.
- **The device mix.** If most staff bring their own iPhones and most travellers carry iPhones, then
  most counters fall into the no-tap pair, and the tap is a nicety on top of QR. Knowing the split
  decides how much NFC work is worth doing.
- **Backend appetite** for the handoff session and a consent record (TravellerService, TagService).
  Nothing here exists today.
- ~~Android ↔ Android tap~~ **works** (V3 read CPadNFC and opened Chrome, 2026-11-05).

## Recommendation

1. **A NameDrop-like tap cannot cover every counter.** With staff on their own iPhones, staff
   iPhone ↔ traveller iPhone (and ↔ web) has no NFC path open to us. NameDrop, AirDrop, iOS card
   emulation, Wi-Fi Aware and Wallet NFC are closed, region-gated or entitlement-gated. Apple's iOS 27
   Tap to Share is the nearest thing, but it needs Tap to Pay and excludes the EEA and Turkey.
2. **Build the handoff session and its QR join first.** One session in which the traveller shares
   their details and receives the tag, and staff receive the details and give the tag, with consent
   recorded. It works for every pair, replaces the placeholder profile QR, and stops `publicLink`
   (document number + permanent claim key) being the hand-over QR on staff screens.
3. **Add the NFC tap second, as another way to join the same session**, wherever an Android app is
   in the pair:
   - staff Android emits, which covers every traveller, even with no app installed;
   - a traveller on Android emits for staff on iPhones.

   One Kotlin emitter module and in-app NDEF reads on iOS cover all of it. Ship it with universal
   links / App Links, so the tap opens super-app when it is installed and ssr when it is not.
4. **Do not build an iPhone↔iPhone gesture** (UWB + Multipeer). Both apps would have to be open
   anyway, which is when a QR scan is just as quick. Revisit if Apple's Tap to Share reaches our
   regions without needing Tap to Pay.
5. **Never emit today's `publicLink` over NFC.**
6. **Spike gate, part one passed:** the iPhone background read works, so the staff-Android flows
   (B2, A2) can reach a traveller with no app open. Part two is still to run: the iPhone in-app
   read, which A3 (staff iPhone ↔ traveller Android) depends on. If it fails, A3 falls back to QR.
   The backend work is the same either way.

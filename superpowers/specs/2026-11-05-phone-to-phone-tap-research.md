# Phone-to-phone tap between staff and traveller — feasibility

Date: 2026-11-05 · Status: research, no app code written · Apps: super-app, pos-app, ssr

## The question

Could a NameDrop-style gesture — two devices held together — let staff

- **(A) pull** the traveller's identity from the traveller's phone before creating a tag, or
- **(B) push** a freshly created tag to the traveller's phone and assign it to them?

## Answer in one paragraph

Not with NameDrop or AirDrop: neither has a third-party API. A tap gesture is still possible over
NFC, but **only when one of the two devices is an Android running our app**. iPhones can *read* NFC
with no special entitlement but cannot *emit* without an Apple entitlement we would not get. So
the Android side emulates an NFC tag carrying a short-lived URL, and the other side reads it. That
Android side is the staff tablet/POS, or the traveller's Android phone.

Staff may use **their own iPhone**, not only our CPads and V3. That leaves pairs with **no tap at all**:
**staff iPhone ↔ traveller iPhone**, and **staff iPhone ↔ traveller on the web**. Those pairs get a QR
code instead.

So the design is one backend primitive — a short-lived, single-use handoff token — with two
transports:
- **QR**, which works for every pair;
- **NFC tap**, which speeds things up wherever an Android app is present.

**Recommendation: build the token service and its QR flows first, because that is the only thing every
pair can use; add the NFC tap second; and do not build an iPhone↔iPhone gesture.** Details in
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
| **iPhone as a tag — EEA HCE (`CardSession`)** | ✗ for us. Has a "Device-to-Device transactions" use case, free of charge, but: developer must be **established in the EEA**, users must be **based in the EEA** (`CardSession.isEligible`) | Turkey and the Faroe Islands are outside the EEA; tax-free travellers are non-EU residents by definition | developer.apple.com/support/hce-transactions-in-apps (verified) |
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

A2, A3 and B2 are the same mechanism with a different token behind the URL, and A4/B3 are the same
URL drawn as a QR. That is the whole design: **one token service, two transports (QR everywhere, NFC
tap where an Android app is present)**.

## UX flows

### A4 / B3 — QR, every pair (do this first)

- **A4 (identity):** the traveller opens "Show my code" (Home or Profile; this replaces the
  `"UNIREFUND"` placeholder). super-app or ssr shows a QR of `https://<ssr>/i/<identityToken>`
  (60–120 s, refreshed while the screen is open). Staff scan it from `SearchTraveller` with the
  existing `QrScanner`. The app redeems the token and gets the same `TravellerSearchResultDto` a
  search returns, then the tag flow continues unchanged.
- **B3 (claim):** the existing tag QR, but encoding `https://<ssr>/t/<claimToken>` instead of the
  `publicLink` whenever it is shown on a staff screen. The printed receipt can keep `publicLink`.

### B2 — tap to hand over a tag (staff on Android)

1. Staff creates the tag as Draft (no traveller picked) → result screen shows
   the QR as today **and** "Hold the traveller's phone to the back of the tablet" with an NFC mark
   where the antenna is.
2. The tablet starts emulating an NDEF tag whose single record is
   `https://<ssr>/t/<claimToken>` (token: random, ≥128 bits, 2–5 min TTL, single use).
3. Traveller's phone touches the tablet:
   - **iPhone, any app or lock screen unlocked**: background tag reading shows a banner for the URL →
     tap → super-app (once universal links exist) or ssr in the default browser.
   - **Android phone, NFC on, unlocked**: the OS dispatches the URL to super-app (verified App Link)
     or the browser.
   - **Traveller already in super-app** ("Receive a tag" button): an in-app NDEF read session, no banner.
4. Landing page = today's TagPreview / ssr public tag page, with **Claim**. Not logged in → sign in,
   then back to the claim (as today's "Log in to claim").
5. Backend redeems the token → `self-assign` → the tablet's result screen flips to
   "Claimed by A. Traveller" (poll or the existing notification channel). The staff member sees the
   right person got it before the traveller walks away.

### A2 — tap to share my details (staff on Android)

1. Staff opens `SearchTraveller` → new chip **"Tap phone"**. The tablet asks the backend for a
   handoff session (staff must hold the traveller-search grant) and starts emulating
   `https://<ssr>/h/<sessionToken>`. The dialog shows "Waiting for the traveller…".
2. Traveller taps the tablet → banner / dispatch as in B2 → super-app or ssr opens
   **"Share your details with ⟨Merchant name⟩?"** listing exactly what will be shared (name,
   nationality, document type + number, date of birth), and which document if they have several
   (active document by default).
3. Traveller confirms (already signed in, or signs in first). Their phone calls
   `attach-identity(sessionToken, documentId)`; the backend records consent.
4. The tablet, polling the session (or notified), receives the same `TravellerSearchResultDto` a
   search returns and calls `onSelect` — the rest of tag creation is unchanged.
5. Decline / timeout → the dialog says so; staff falls back to search or MRZ scan.

### A3 — staff on their own iPhone, traveller on Android

1. The traveller opens "Share my details" on their Android phone and confirms. The phone then emits
   `https://<ssr>/i/<identityToken>` (the same token as the A4 QR) for as long as that screen is open.
   The screen shows the QR as well.
2. Staff tap **"Tap phone"** in `SearchTraveller`. iOS shows its NFC sheet ("Hold near the other
   phone"), and an in-app `NFCNDEFReaderSession` reads the URL.
3. The staff app redeems the token (staff grant required), and the traveller is selected. To
   hand over a tag, staff then assign it with today's `assign-traveller` call (B4).
4. The traveller's screen flips to "Shared with ⟨Merchant⟩" once the token is redeemed.

### Staff iPhone ↔ traveller iPhone (or web)

There is no tap here. The traveller shows the A4 QR, or staff show the B3 QR. An iPhone-only
proximity gesture (A8, UWB + Multipeer) is buildable, but it needs both apps open on the same screen
plus two permission prompts on first use. At a counter that is no quicker than a QR scan, and it costs
a native Swift module on each side.

## Security and privacy

**What moves over the air**: only an opaque URL with a random token. No name, no document number.
Today's `publicLink` must **not** be emitted as-is: its slug decodes to the document number and its
GUID is a permanent claim capability.

**What moves server-side**: in A2, the traveller's identity goes from the traveller's authenticated
session to the staff member's authenticated session, after an explicit confirmation on the
traveller's own screen, and only to a staff user who already holds the search grant (the same data a
document-number search returns today). In B2, nothing personal moves: the traveller's own session
claims a tag.

**Why a server token beats sending raw PII** (e.g. a vCard over NFC from the traveller's phone):
- The data comes from the traveller's verified profile, not from whatever the sender types.
- It goes through the same grants and tenant rules as a search, and the consent is logged
  (KVKK/GDPR: purpose, timestamp, merchant, staff user).
- It can expire, be revoked, and be single-use; raw PII cannot be recalled once beamed.
- It works identically when the reader is a browser that cannot do anything with raw bytes.

**Replay**: tokens are single-use and expire in minutes; the emitter rotates the token per session
and stops emulating once it is redeemed or the screen closes. A replayed token is rejected.

**Relay** (NFC relay extends 4 cm to anywhere): a relayed A2 URL only shows a remote victim a
"Share your details with ⟨Merchant⟩?" prompt — the same phishing surface as a photographed QR, and
the prompt names the merchant. A relayed or photographed B2 URL lets someone else claim the tag first;
the staff screen showing "Claimed by ⟨name⟩" exposes that at the counter while the traveller is
still there (whether staff can re-assign a claimed tag is a backend question). Binding the claim token to the tablet's session and a 2–5 minute TTL keeps the
window short. NFC's few-centimetre range already makes casual capture harder than a QR on a counter.

**Traveller-emits (A3, and the A4 QR) has weaker consent than A2.** The traveller agrees *before*
knowing who will read the code, and any staff user with the search grant who reads or relays it
can redeem it. Mitigations:
- emit and show the code only while the "Share my details" screen is in the foreground;
- keep the token single-use and short-lived;
- refuse redemption without the staff grant, and keep the landing page empty for anyone else;
- tell the traveller afterwards who received the data ("Shared with ⟨Merchant⟩").

This is the same exposure as showing a passport at the counter, and it is still better than raw PII
on the air.

**Consent copy** must say who receives the data and what fields; decline must be as prominent as
accept.

## Effort, backend and what can be prototyped

| Piece | Where | Size | Native rebuild |
| --- | --- | --- | --- |
| "Show my code" (A4) and token-based claim QR (B3) | super-app, ssr | small | no |
| HCE NDEF Type 4 tag emulator (`HostApduService`, AID `D2760000850101`, CC + NDEF files) — one module serves staff (B2/A2) and traveller (A3) | new Expo module in super-app; same Kotlin in pos-app's `modules/` | ~250 lines Kotlin + config plugin (`apduservice.xml`, service in manifest) | yes |
| "Tap phone" UI on tag result and in `SearchTraveller` | super-app, pos-app | small | no |
| In-app NDEF read (traveller for B2/A2; **staff iPhone** for A3) | super-app (`react-native-nfc-manager` NDEF; add `"NDEF"` to `readersession.formats`) | small | yes (iOS entitlement) |
| Universal links / App Links so the tap opens super-app, not the browser | `associatedDomains` + Android `autoVerify` intent filters; AASA + `assetlinks.json` served by ssr. **ssr middleware currently 307s `/.well-known/apple-app-site-association` to `/tr/…`** (ssr-dev/ssr-uat). Apple requires it served without a redirect, so the middleware must exempt `/.well-known/` | small–medium | yes |
| ssr landing routes `/t/<token>`, `/h/<token>` | web-app ssr | small–medium | — |
| **Backend: claim token** (mint for a tag — staff; redeem → self-assign — traveller) | TagService | medium | — |
| **Backend: identity token** (mint — traveller; redeem — staff + search grant; consent/audit record) | TravellerService | medium | — |
| **Backend: handoff session** for A2 only (create — staff; attach identity — traveller; poll/notify — staff) | TravellerService | medium | — |

Rough app-side size, excluding backend: QR flows (A4/B3) a few days; spike 1–2 days; NFC tap
(emitter module, "Tap phone" UI, in-app reads, universal links) one to two weeks across both
directions. The backend endpoints are the long pole and are not sized here. A8 (iPhone↔iPhone UWB)
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
2. **QR flows (A4, B3)** as soon as the backend tokens exist. They need no NFC at all.
3. **NFC tap**: B2, then A2 and A3, all reusing the same tokens.

Not testable here: anything iPhone-side beyond background reading needs the TestFlight workflow and
the user's iPhone.

## Spike status (2026-11-05)

**Main question answered: yes.** An iPhone with no app open reads CPadNFC posing as an NFC tag,
and offers to open the URL. Still open: the iPhone in-app read (what staff iPhone ↔ traveller
Android needs), an Android phone tapping the CPad, and whether the controller crash below comes back.

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
- **Not verified, because it needs a second NFC device in hand:**
  - any over-the-air exchange;
  - the iPhone background read;
  - the iPhone in-app read;
  - an Android phone's NDEF dispatch.
- **It emits** `https://ssr-dev.unirefund.com/?src=nfc-spike` whenever CPadNFC's screen is on. Each
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

### Second round (09:08–09:09, iPhone with an NFC reader app open)

- CPadNFC served the **full NDEF file twice** (09:08:59, 09:09:01). The APDU sequence was identical
  to the background reads: SELECT with Le, CC, select `E104`, NLEN twice, 41-byte message.
- iOS turns background reading off while a Core NFC session is open (Apple's doc), so with the app's
  scan sheet up these must be in-app reads. Whether the reader app showed the URL is the user's
  side of the check and is not yet recorded here.
- **No further controller resets**: 5 full reads since the one at 09:01:21 (09:01:39, :40 and :51
  in round one, two here), all on the same HAL and NFC processes.

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
- **Does the PN7220 controller crash recur?** It reset once, on what was probably the first tap
  after the spike was installed. If it recurs, OrderPADs are unreliable emitters until Sunmi/NXP
  firmware is checked.
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
- **Backend appetite** for the token endpoints and a consent record (TagService, TravellerService).
  Nothing here exists today.

## Recommendation

1. **A NameDrop-like tap cannot cover every counter.** With staff on their own iPhones, staff
   iPhone ↔ traveller iPhone (and ↔ web) has no NFC path open to us. NameDrop, AirDrop, iOS card
   emulation, Wi-Fi Aware and Wallet NFC are closed, region-gated or entitlement-gated. Apple's iOS 27
   Tap to Share is the nearest thing, but it needs Tap to Pay and excludes the EEA and Turkey.
2. **Build the token service and its QR flows first** (A4 "Show my code", B3 claim QR). Ask the
   backend for single-use, short-TTL claim and identity tokens with consent logging. This works for
   every pair, replaces the placeholder profile QR, and stops `publicLink` (document number + permanent
   claim key) being the thing shown on staff screens.
3. **Add the NFC tap second, on the same tokens**, wherever an Android app is in the pair:
   - staff Android emits (B2, A2), which covers every traveller, even with no app installed;
   - a traveller on Android emits (A3) for staff on iPhones.

   One Kotlin emitter module and in-app NDEF reads on iOS cover all three.
4. **Do not build an iPhone↔iPhone gesture** (UWB + Multipeer). Both apps would have to be open
   anyway, which is when a QR scan is just as quick. Revisit if Apple's Tap to Share reaches our
   regions without needing Tap to Pay.
5. **Never emit today's `publicLink` over NFC.**
6. **Spike gate, part one passed:** the iPhone background read works, so the staff-Android flows
   (B2, A2) can reach a traveller with no app open. Part two is still to run: the iPhone in-app
   read, which A3 (staff iPhone ↔ traveller Android) depends on. If it fails, A3 falls back to QR.
   The backend work is the same either way.

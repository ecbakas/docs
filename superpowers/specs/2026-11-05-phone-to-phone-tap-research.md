# Phone-to-phone tap between staff and traveller — feasibility

Date: 2026-11-05 · Status: research, no app code written · Apps: super-app, pos-app, ssr

## The question

Could a NameDrop-style gesture — two devices held together — let staff

- **(A) pull** the traveller's identity from the traveller's phone before creating a tag, or
- **(B) push** a freshly created tag to the traveller's phone and assign it to them?

## Answer in one paragraph

Not with NameDrop or AirDrop: neither has a third-party API, and the staff side is Android anyway.
The gesture is still achievable with **NFC, run the other way round from NameDrop**: the
**staff device (Android tablet or POS) emulates an NFC tag** that carries a short-lived URL, and the
**traveller's phone reads it** — an iPhone or Android, in super-app, in the browser, or with no app
open at all. iPhones can *read* NFC with no special entitlement but cannot *emit* without an
entitlement we would not get, so the staff device must be the one that emits. One backend primitive —
a short-lived, single-use handoff token — serves both directions, and a QR code of the same URL is the
fallback for phones without NFC.

**Recommendation: build (B) first, then (A), both on that primitive. Start with a two-day spike.**
Details in [Recommendation](#recommendation).

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

## What the platforms allow (checked 2026-11-05; iOS 27 is current)

"verified" = re-read on the primary page for this doc; the rest comes from one research pass over
the cited pages.

| Capability | Verdict for us | Gate / limit | Source |
| --- | --- | --- | --- |
| **NameDrop** | ✗ No third-party API; the card lands in Contacts | Apple devices only, iOS 17.1+ | support.apple.com/guide/personal-safety/ips97e16d3b1 |
| **AirDrop** of a file/URL | ✗ for us. Share sheet only; the "hold phones together" start works for app content only between known contacts; strangers need "Everyone for 10 Minutes" + an AirDrop code (iOS 26.2) | Apple↔Apple; Quick Share↔AirDrop interop only on flagship Androids (Pixel 8a+, Galaxy S26…), no API | support.apple.com/en-us/119857 · developer.apple.com/forums/thread/738469 · blog.google (2025-11-20, 2026-05-12) |
| **Core NFC read** (in-app) | ✓ NDEF on tag types 1–5; raw ISO 7816 etc. Foreground with the system sheet | Entitlement formats `NDEF`/`TAG`; we only declare `TAG` | developer.apple.com/documentation/corenfc |
| **Background tag reading** (no app open) | ✓ iPhone XS+. First URI record; https → notification → app via universal link, else **Safari** | **No custom URL schemes**. Off while camera, Wallet, a Core NFC session or airplane mode is active, or if never unlocked | …/corenfc/adding-support-for-background-tag-reading (verified) |
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
can do both.** Our staff devices are Android, so the staff device emits and the traveller's phone,
whatever it is, reads.

## Options matrix

Staff devices: **AT** = Android tablet (super-app), **POS** = V3 (pos-app), **iS** = staff iPhone (rare).
Traveller: **iP** = iPhone, **AP** = Android phone, **Web** = ssr in a mobile browser.

### (A) Staff ← traveller: pull the traveller's identity

| Option | AT/POS ← iP | AT/POS ← AP | AT/POS ← Web | iS ← any |
| --- | --- | --- | --- | --- |
| A1 NameDrop / AirDrop contact | ✗ no API | ✗ | ✗ | ✗ no API |
| A2 **Staff emits handoff URL (HCE NDEF), traveller taps and confirms** | ✓ app, browser or no app open | ✓ | ✓ | ✗ iPhone cannot emit |
| A3 Traveller emits token (HCE on traveller phone), staff reads | ✗ iPhone cannot emit (EEA / NFC & SE gates) | ✓ Android only | ✗ | ✗ |
| A4 Traveller shows identity QR, staff scans with camera | ✓ | ✓ | ✓ | ✓ |
| A5 BLE pairing-less exchange | ~ app foreground, permissions, RSSI ≠ "touching" | ~ | ✗ | ~ |
| A6 Apple Wallet NFC pass (VAS) | ✗ needs Apple NFC certificate + licensed reader | — | — | — |
| A7 Apple Tap to Share (iOS 27) | ✗ staff must be an iPhone | ✗ | ✗ | ~ only inside a Tap to Pay session; not in the EEA or Turkey; contact fields, not passport data |

### (B) Staff → traveller: send the created tag and assign it

| Option | AT/POS → iP | AT/POS → AP | AT/POS → Web | iS → iP |
| --- | --- | --- | --- | --- |
| B1 AirDrop the tag link | ✗ staff is Android | ✗ | ✗ | ~ share sheet + accept, iPhone↔iPhone only |
| B2 **Staff emits claim URL (HCE NDEF), traveller taps and claims** | ✓ | ✓ | ✓ | ✗ iPhone cannot emit |
| B3 Tag QR on staff screen (today) | ✓ | ✓ | ✓ | ✓ |
| B4 Staff assigns by search / MRZ (today); tag shows in the traveller's list | ✓ | ✓ | ✓ | ✓ |

✓ works · ~ works with caveats · ✗ not possible

A2 and B2 are the same mechanism with a different token behind the URL, and A4/B3 are the same URL
drawn as a QR. That is the whole design: **one token service, two transports (NFC tap, QR)**.

## UX flows

### B2 — tap to hand over a tag (do this first)

1. Staff creates the tag as Draft (no traveller picked) → result screen shows
   the QR as today **and** "Hold the traveller's phone to the back of the tablet" with an NFC mark
   where the antenna is.
2. The tablet starts emulating an NDEF tag whose single record is
   `https://<ssr>/t/<claimToken>` (token: random, ≥128 bits, 2–5 min TTL, single use).
3. Traveller's phone touches the tablet:
   - **iPhone, any app or lock screen unlocked**: background tag reading shows a banner for the URL →
     tap → super-app (once universal links exist) or ssr in Safari.
   - **Android phone, NFC on, unlocked**: the OS dispatches the URL to super-app (verified App Link)
     or the browser.
   - **Traveller already in super-app** ("Receive a tag" button): an in-app NDEF read session, no banner.
4. Landing page = today's TagPreview / ssr public tag page, with **Claim**. Not logged in → sign in,
   then back to the claim (as today's "Log in to claim").
5. Backend redeems the token → `self-assign` → the tablet's result screen flips to
   "Claimed by A. Traveller" (poll or the existing notification channel). The staff member sees the
   right person got it before the traveller walks away.

### A2 — tap to share my details (second)

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

A4 (traveller shows a QR of a short-lived identity token, staff scans it with the existing
`QrScanner`) uses the same backend minus the realtime leg and replaces the `"UNIREFUND"` placeholder.
It is the right fallback, and a reasonable first slice if NFC slips.

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

**Traveller-emits (A3) is the weaker design**: an HCE service on the traveller's phone answers any
reader that selects its AID while the screen is on. If ever built, emit only while a "Share" screen
is in the foreground, and only a token.

**Consent copy** must say who receives the data and what fields; decline must be as prominent as
accept.

## Effort, backend and what can be prototyped

| Piece | Where | Size | Native rebuild |
| --- | --- | --- | --- |
| HCE NDEF Type 4 tag emulator (`HostApduService`, AID `D2760000850101`, CC + NDEF files) | new Expo module in super-app; same Kotlin in pos-app's `modules/` | ~250 lines Kotlin + config plugin (`apduservice.xml`, service in manifest) | yes |
| "Tap phone" UI on tag result and in `SearchTraveller` | super-app, pos-app | small | no |
| In-app NDEF read for travellers | super-app (`react-native-nfc-manager` NDEF; add `"NDEF"` to `readersession.formats`) | small | yes (iOS entitlement) |
| Universal links / App Links so the tap opens super-app, not Safari | `associatedDomains` + Android `autoVerify` intent filters; AASA + `assetlinks.json` served by ssr | small–medium | yes |
| ssr landing routes `/t/<token>`, `/h/<token>` | web-app ssr | small–medium | — |
| **Backend: claim token** (mint for a tag — staff; redeem → self-assign — traveller) | TagService | medium | — |
| **Backend: handoff session** (create — staff + search grant; attach identity — traveller + consent record; poll/notify — staff) | TravellerService | medium–large | — |

Rough app-side size, excluding backend: spike 1–2 days; B2 about a week (emitter module in both
apps, result-screen UI, universal links); A2 about another week on top. The backend endpoints are the
long pole and are not sized here.

**Prototype on the attached devices, in this order:**

1. **Spike (1–2 days), no backend**: HCE emulator on CPadNFC emitting a fixed `https://` URL (the ssr
   home page, *not* a real `publicLink`). Tap it with an unmodified iPhone (no app build needed for
   background reading) and with any Android phone. This retires the one real unknown — see
   [Unknowns](#unknowns) — and finds where the OrderPAD antenna is. V3 is the second staff device
   whenever it is attached.
2. **B2 end to end** with a real draft tag, still using the existing claim endpoint behind a
   prototype URL, then swap in the backend claim token.
3. **A4** (identity QR) once the backend handoff token exists, then **A2** on top of it.

Not testable here: anything iPhone-side beyond background reading needs the TestFlight workflow and
the user's iPhone.

## Unknowns

- **Does an iPhone's background tag reading pick up an Android HCE-emulated NDEF Type 4 tag?**
  Technically it should (HCE speaks ISO-DEP over NFC-A, which is what a Type 4 tag is), and Apple's
  own Tap to Share puts a phone-presented tag in front of other phones. But no Apple or Google page
  confirms it, and developer reports are mixed. **This is what the spike must answer.** The in-app
  read (`NFCNDEFReaderSession`) is the fallback and is better attested.
- **Where the OrderPAD and V3 antennas are**, and whether a phone held to a tablet's back is
  comfortable at a counter. V3 is a POS with a marked contactless area; the OrderPAD is unknown.
- **Android phones with NFC off.** Many users never turn it on; QR stays the fallback.
- **Emulation and reading are exclusive.** While the tablet emulates a tag it is not reading cards;
  fine as long as the two live on different screens.
- **Backend appetite** for two token endpoints and a consent record (TagService, TravellerService).
  Nothing here exists today.

## Recommendation

1. **Do not chase NameDrop, AirDrop, UWB, Multipeer, Wi-Fi Aware or iOS card emulation** for this.
   Each is either closed to third parties, iPhone-only while our staff devices are Android, or
   gated by an Apple entitlement/region we would not qualify for (details above).
2. **Build "tap to hand over a tag" (B2) first.** Staff tablet/POS emits a short-lived claim URL over
   HCE; the traveller's phone reads it with no app, in super-app or in ssr. It needs the least
   backend, has no PII on the air, and the same URL as a QR covers phones without NFC.
3. **Then "tap to share my details" (A2), preceded by its QR form (A4).** Same token service with a
   consent step on the traveller's phone and a realtime leg to the tablet. A4 also replaces the
   placeholder profile QR.
4. **Never emit today's `publicLink` over NFC**; ask the backend for single-use, short-TTL tokens for
   both directions, with consent logging for A.
5. **Gate it on the spike**: if iPhone background reading of Android HCE turns out unreliable, ship
   B2/A2 as in-app taps ("Receive a tag" / "Share my details" buttons on the traveller side) plus the
   QR fallback — the backend work is unchanged.

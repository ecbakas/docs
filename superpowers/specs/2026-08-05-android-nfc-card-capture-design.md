# Android NFC as a second card-capture transport

**Date:** 2026-08-05
**Scope:** `pos-app`
**Status:** Approved for planning
**Builds on:** [2026-08-04-card-capture-device-capabilities-design.md](./2026-08-04-card-capture-device-capabilities-design.md)

## Problem

Refund-card capture works on a Sunmi P2 and fails on a Sunmi V3. The
capability work of 2026-08-04 made that failure diagnosable; a field report from
a V3 has now settled it.

```
readerAvailable: unknown
buildModel: V3          payDeviceModel: V3
payLibVersion: 2.0.42   matchedServiceVersion: v3.3.355
cardHw: (empty)         nfcConfig: (empty)
msrVersion: (empty)     msr2FwVersion: (empty)

read failures:
  probeInconclusive: {"magnetic":{"supported":false,"code":-20003,"message":"Param error"},
                      "nfc":{"supported":false,"code":-20003,"message":"Param error"},
                      "ic":{"supported":false,"code":-20003,"message":"Param error"}}

methods:
  nfc: unknown   magnetic: unknown   ic: unknown
```

The PaySDK service binds — it answers `getSysParam` for the device model and
reports both SDK versions — but **every card-hardware system parameter is
empty** and every `cardType` is rejected with `-20003`. This confirms hypothesis
H2 of the prior spec: a device whose pay service is present but exposes no card
reader. Removing `initEmvProcess()` was correct but was never the cause.

The device does have NFC. Testers confirm it has no swipe and no chip slot, and
Sunmi documents the V3 family as SoftPOS-capable — EMVCo PCD L1, Android 13 —
which describes an NFC controller driven by software, not a PCI payment module
behind PaySDK.

**The radio is there. We are asking the wrong subsystem for it.**

The report also demonstrates the prior spec's Decision 5 working in the field:
all three modes returned `-20003`, the probe declined to demote them, and all
three remain `unknown`. Without that rule this V3 would already have a
permanently inert refund-card button.

## Decisions

1. **Android NFC is a transport, not a new capture method.** `CardMode` stays
   `nfc | magnetic | ic`. A cashier taps a card; they do not choose an SDK.
2. **Scope is any device with an `NfcAdapter`,** not a V3 patch and not a model
   allowlist. The same code serves the V3, other non-payment Sunmi models, and
   ordinary Android hardware.
3. **PaySDK wins where it works.** The Android transport serves `nfc` only where
   PaySDK cannot. The P2 keeps the exact path running in production today, so
   this change carries no regression risk for the existing fleet.
4. **NFC switched off is not "unsupported".** An adapter that exists but is
   disabled gets a prompt to enable it. Demoting it would disable a working
   reader — the failure mode the prior spec's Decision 5 exists to prevent.
5. **The Android transport is vendor-neutral code.** It lives in the module's
   always-compiled `src/main`, not in the Sunmi-specific `src/sdk`, so a stub
   build on non-Sunmi hardware still gets NFC.

## Why this is cheap

`src/utils/emv.ts` was written transport-agnostic from the start. Its header
states the flow "does NOT run a payment transaction (no crypto, no PIN, no
online auth), so it needs no Sunmi Pay authorization; **any Android NFC
`IsoDep` transport works**", and `readEmvCard` takes an injected `Transceiver`.

Nothing above the transport changes: the capability store, `useCardCapabilities`,
the scan sheet's chooser, the demotion rules and the diagnostics screen all work
in terms of `nfc` as a *method*.

## Architecture

```
JS  startScan(["nfc"])
      │
      ▼
  SunmiCardReaderBackend (src/sdk)
      │
      ├─► ReadCardOptV2.checkCard(NFC)         (P2 path, unchanged)
      │        │
      │        └── returns -20000/-20003? ──► this reader cannot do NFC
      │                                            │
      └────────────────────────────────────────────▼
                                        NfcTransport  (src/main, vendor-neutral)
                                             │ NfcAdapter.enableReaderMode
                                             ▼
                                        IsoDep.transceive ──► same readEmvCard APDU flow
```

Both transports emit the existing `onCardRead` / `onError` events, so
`useCardReader` and everything above it is untouched.

### How the transport is chosen

**Attempt, then fall back — decided natively, per scan, with no stored state.**

A single-mode `nfc` scan starts on PaySDK as it does today. If `checkCard`
answers `-20000` or `-20003`, that is the reader stating it cannot do NFC at all,
so the backend swallows that error, releases the `Scan` token, acquires
`NfcScan`, and arms reader mode instead. If the Android transport is unavailable
too, the original PaySDK error is emitted unchanged.

The alternatives were both worse:

- *Caching the probe verdict natively* breaks across app restarts. The store
  persists `probed: true`, so `ensureProbed` no-ops on the next launch and the
  native cache is never repopulated — the device would silently fall back to
  PaySDK and fail.
- *Threading a transport through JS* would mean persisting a transport per mode
  and widening `useCardReader.startScan`, spreading an implementation detail
  across four layers to decide something the native side already knows.

Attempt-then-fall-back needs no new persisted state, survives restarts, and
self-corrects if a device's behaviour ever changes. Its cost is one immediate
error round-trip per tap on Android-NFC devices, which is not user-perceptible.

The trigger is the error **code**, not timing, so there is no heuristic to tune:
`-20000`/`-20003` mean "this reader cannot", while a timeout (`-30005`) means the
reader works and nobody tapped — that must **not** fall back.

This applies only to a scan whose modes are exactly `["nfc"]`. The scan sheet
always arms exactly one method, so that is the only shape reached in practice;
any other combination keeps today's behaviour.

The probe (below) exists to tell the *UI* which methods to offer. It and this
fallback are independent and agree, but neither depends on the other.

### `NfcTransport` (new, `src/main`)

A vendor-neutral class with no Sunmi imports:

| Method | Responsibility |
| --- | --- |
| `isPresent()` | `NfcAdapter.getDefaultAdapter(context) != null` |
| `isEnabled()` | adapter present **and** `isEnabled` |
| `startScan(timeoutSec)` | `enableReaderMode` with `FLAG_READER_NFC_A \| FLAG_READER_NFC_B \| FLAG_READER_SKIP_NDEF_CHECK`; arm a timeout |
| `transmitApdu(apduHex, promise)` | `IsoDep.transceive` on the connected tag |
| `cancelScan()` | `disableReaderMode`, close the tag, cancel the timeout |

`enableReaderMode` requires an **Activity**, not a Context. The backend factory
gains an activity provider:

```kotlin
fun createCardReaderBackend(
  context: Context,
  activityProvider: () -> Activity?,
  emit: EventEmitter,
): CardReaderBackend
```

`SunmiCardReaderModule` supplies `{ appContext.currentActivity }`. When the
provider returns null the transport reports unavailable rather than throwing.

**On tag discovery:**

- `IsoDep.get(tag) != null` — connect, set a 5 s timeout, emit
  `onCardRead { mode: "nfc", uuid: <tag.id as hex>, cardType: 4 }`. JS then runs
  `readEmvCard` through `transmitApdu` exactly as it does on the P2.
- `IsoDep.get(tag) == null` — a Mifare, transit or NDEF-only tag. Emit
  `onCardRead { mode: "nfc", uuid: <tag.id as hex> }` with **no** `cardType`, so
  `useCardReader` settles without an EMV read and the existing "card number could
  not be read" state handles it unchanged.

`cardType: 4` is the Sunmi NFC constant, carried purely so the JS layer has an
opaque handle to pass back into `transmitApdu`. The native side ignores its value
when the Android transport owns the reader; it dispatches on the owner token.

**Timeout** reuses `-30005` (`READ_CARD_TIMEOUT`). It is deliberately not in
`UNSUPPORTED_ERROR_CODES`, so a timeout can never demote a method.

### Ownership

The `AtomicReference<ReaderOwner?>` added in the prior work already serialises
reader access across `startScan`, `probeModes` and `cancelScan`. The Android
transport becomes a third variant rather than a second mechanism:

```kotlin
private sealed class ReaderOwner {
  class Scan : ReaderOwner()      // PaySDK checkCard session
  class NfcScan : ReaderOwner()   // Android reader-mode session
  class Probe : ReaderOwner()
}
```

- `transmitApdu` dispatches on the current owner: `NfcScan` → `IsoDep`,
  `Scan` → `ReadCardOptV2`.
- `cancelScan` clears a `NfcScan` owner and disables reader mode, alongside its
  existing `Scan` handling. It must continue to leave a `Probe` token alone.
- The release-and-check discipline (`releaseIfCurrent`) extends to the Android
  transport's callbacks, so a superseded reader-mode callback drops its event
  instead of emitting it.

### Probe

`probeModes` gains a fallback for `nfc` only. When PaySDK's `nfc` probe returns
`-20000`/`-20003`:

| `NfcAdapter` state | Reported |
| --- | --- |
| present (enabled or disabled) | `nfc: { supported: true }` — the Android transport can serve it |
| absent | `nfc: { supported: false, code: <PaySDK code> }` — two independent negatives |

A disabled adapter still reports supported: the method exists, it just needs
turning on, and the arming state prompts for that (Decision 4).

On the reported V3 this yields `magnetic` and `ic` unsupported, `nfc` supported.
That is a mixed result, so the prior spec's all-unsupported inconclusive rule
correctly does **not** trip, and the two absent readers are demoted properly for
the first time.

### Diagnostics

`ReaderDiagnostics` gains two fields, rendered as rows like the rest:

- `androidNfcPresent: boolean`
- `androidNfcEnabled: boolean`

These make the next V3 report conclusive whichever way it goes: if the tap still
fails with both true, the problem is the card or the APDU flow, not the radio.

### UI

One new state in `RefundCardScanModal`: **NFC is switched off.** Shown when the
armed method is `nfc`, the Android transport owns it, and the adapter is disabled.
It reuses the existing keys — present and translated in both locales —
`MobileApp.CustomerScreen.NFC.ActivateNfcTitle` and `ActivateNfcDescription`
("Please enable NFC in your device settings to continue"), with an action opening
`android.settings.NFC_SETTINGS`.

No other UI changes. The chooser, the single-method auto-arm, the
capture-unavailable state and the demotion banner all behave as they already do.

### Manifest

Added to the module's own `src/main/AndroidManifest.xml`, which Expo merges into
the app manifest:

```xml
<uses-permission android:name="android.permission.NFC" />
<uses-feature android:name="android.hardware.nfc" android:required="false" />
```

`required="false"` is essential — `true` would restrict Play Store distribution
to NFC devices.

## Testing

**JS, testable:**

- `probeModes` results with `nfc` supported and `magnetic`/`ic` unsupported
  resolve to a single-method device: chooser skipped, `nfc` auto-armed, and
  `captureUnavailable` false.
- The all-unsupported inconclusive rule does not trip on that mixed result.
- Diagnostics rows render `androidNfcPresent` / `androidNfcEnabled`, including
  when false.
- The NFC-disabled state renders its prompt and does not demote `nfc`.

**Kotlin: no JVM harness exists** under `modules/sunmi-card-reader/android`.
`NfcTransport` and the ownership changes are verified by compilation and code
tracing only, exactly as the prior work's native changes were. This is a real
limitation and the plan must not claim otherwise.

**Device verification, in order:**

1. **P2 regression** — tap, swipe and insert must all still capture. Decision 3
   means the P2 should never reach the Android transport; this confirms it.
   This also discharges the still-outstanding `initEmvProcess()` gate from the
   prior spec.
2. **V3 diagnostics** — `androidNfcPresent` and `androidNfcEnabled` both true,
   and `methods:` showing `nfc: supported` with `magnetic`/`ic` unsupported.
3. **V3 capture** — tap a contactless bank card; expect PAN and expiry.

## Risks

- **Some contactless cards suppress the PAN** in `READ RECORD`, returning only a
  token. This is the identical APDU conversation already running on the P2, so it
  is not a new risk — but if the V3 reads a tag and yields no number, this is the
  first thing to check, not the transport.
- **Reader mode is tied to activity foreground.** Android disables it on pause
  and does not restore it on resume. The sheet's existing cancel-on-unmount and
  re-arm-on-ready covers the normal path; a backgrounded-then-foregrounded sheet
  may need a re-arm.
- **The module name becomes a slight misnomer.** `sunmi-card-reader` will contain
  vendor-neutral NFC code. Renaming is churn for no functional gain; the internal
  boundary (`src/main` vendor-neutral, `src/sdk` Sunmi) carries the honesty
  instead.

## Out of scope

- Renaming the module.
- Host Card Emulation, NDEF, or any non-payment tag handling beyond reporting a
  UID for a non-`IsoDep` tag.
- Reading via `NfcAdapter` on iOS.
- Changing how a captured card becomes a payout token.
- The deferred items from the prior work, tracked in
  [2026-08-04-card-capture-handoff.md](./2026-08-04-card-capture-handoff.md).

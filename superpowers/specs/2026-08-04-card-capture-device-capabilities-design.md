# Card capture: cross-device Sunmi compatibility and capability-driven methods

**Date:** 2026-08-04
**Scope:** `pos-app`
**Status:** Approved for planning

## Problem

Refund-card capture works on the Sunmi P2 but fails on the Sunmi V3. Testers
report a "params error" for **both** the tap and the swipe path, while the reader
itself initializes successfully.

Two separate defects hide behind that one report:

1. **A compatibility defect.** Something in the shared start-scan path is rejected
   by the V3's pay service. The app cannot say what, because the error reporting
   discards the code.
2. **A product gap.** The scan sheet always offers exactly tap and swipe. Devices
   vary — some have no magnetic-stripe reader, some no contactless, some neither.
   The UI should offer only what the hardware actually has, skip the chooser when
   there is only one method, and say so plainly when there are none.

## What the SDK actually says

These facts come from decompiling `com.sunmi:PayLib-release:2.0.42` (the version
`modules/sunmi-card-reader/android/build.gradle` pins) out of the local Gradle
cache. Public Sunmi documentation does not cover any of it.

| Constant | Value | Localized message |
| --- | --- | --- |
| `AidlErrorCode.INVOKING_NOT_SUPPORT` | `-20000` | "Function not supported" |
| `AidlErrorCode.INVOKING_ERROR_PARAMS` | `-20003` | "Param error" |
| `AidlErrorCode.READ_CARD_FAIL` | `-30001` | — |
| `AidlErrorCode.READ_CARD_UNKNOWN_TYPE` | `-30002` | — |
| `AidlErrorCode.READ_CARD_TIMEOUT` | `-30005` | — |
| `AidlErrorCode.READ_CARD_TRACK*` | `-30006`…`-30012` | per-track parity/LRC failures |
| `AidlErrorCode.READ_CARD_FALLBACK` | `-30013` | — |

`AidlConstants.CardType` values are `MAGNETIC=1`, `IC=2`, `NFC=4`, `MIFARE=8`,
`PSAM0=16`, `FELICA=32`. The bitmask built in `SunmiCardReaderBackend.startScan`
is therefore **correct** — the wrong-constant theory is ruled out.

Three capability surfaces exist that the app does not use:

- `BasicOptV2.getSysParam(key)` with `AidlConstants.SysParam` keys `CARD_HW`,
  `NFC`, `MSR_VERSION`, `MSR2_FW_VER`, `DEVICE_MODEL`.
- `SunmiPayKernel.getPayLibVersion()` and `getMatchedPaySDKVersion()`.
- `ReadCardOptV2.getCardExistStatus(int)`, `checkCardEx(...)`, `setNfcParam(Bundle)`.

**2.0.42 is the newest PayLib release** (Maven Central metadata, last updated
2026-06-12). Bumping the SDK is not available as a fix.

## Decisions

Settled during brainstorming; not open questions.

1. **Capture methods are peers.** Tap (NFC), swipe (magnetic) and insert (IC) are
   three equal ways to obtain the same thing — PAN and expiry. IC is promoted from
   "supported by the hook, never offered" to a first-class method.
2. **Capability is learned, not assumed.** Runtime results are the authority. A
   `-20003`/`-20000` permanently demotes a method for that device; a successful
   read promotes it.
3. **`CARD_HW` is collected, not parsed.** Its format is undocumented. Guessing at
   it risks hiding working readers on the existing P2 fleet. v1 reports it; a
   later revision may seed from it once a real V3 report shows its contents.
4. **The probe runs once per device**, on first open of the scan sheet, so the
   first user gets a correct method list rather than a failed attempt. This is
   reversible: deleting the probe call falls back to purely learned detection.
5. **Unknown means available.** Any signal we cannot read leaves the method
   offered. A detection bug must never be able to disable a working reader.

## Root-cause hypotheses

Ranked, with how each is falsified.

### H1 — Unused EMV kernel initialization (leading)

`startScan` calls `abortTransactProcess()` then `initEmvProcess()` before every
`checkCard`, including for a plain magnetic swipe, and swallows both return codes.

The app never runs an SDK EMV transaction. `src/utils/emv.ts` drives the chip
itself over `transmitApdu` — its header notes the flow "does NOT run a payment
transaction (no crypto, no PIN, no online auth), so it needs no Sunmi Pay
authorization". `initEmvProcess()` therefore resets nothing; it *starts* kernel
state that is never used and for which terminal parameters are never set.

This fits a failure that hits tap and swipe identically. **Falsified by** removing
the call and confirming the P2 still reads cards on all methods.

### H2 — The V3 unit has no card-reader hardware

If the pay service binds but exposes no reader, every `cardType` bit is rejected
and both methods fail with `-20003`. **Falsified by** the diagnostics report:
`CARD_HW`/`MSR_VERSION`/`NFC` sysparams plus per-method probe verdicts.

This hypothesis conflicts with the tester's later recollection that "V3 only has
NFC" — under which tap would succeed and only swipe would fail. The two reports
cannot both be literally true. The diagnostics build resolves it; the design is
correct under either outcome.

### H3 — Firmware delivers error bundles in an unrecognised shape

`onErrorEx` reads `info.getInt("code", -1)`. A firmware using any other key
silently reports `-1`. This does not by itself break capture, but it makes every
V3 report untrustworthy and must be fixed before the others can be tested.

## Architecture

```
RefundCardButton ──reads──► useCardCapabilities ──reads──► cardCapabilities store
   (both screens)                                            (zustand + AsyncStorage)
        │                                                          ▲
        │ tap (only when a method is available)                    │ demote / promote
        ▼                                                          │
RefundCardScanModal ──first open on unknown device──► probeModes ──┘
        │
        └──startScan([mode])──► useCardReader ──► sunmi-card-reader ──► PaySDK
```

The store is the single source of truth for "what can this device do". It is
readable without binding the reader, which is what lets the always-mounted button
consume it while preserving today's property that **nothing touches the hardware
until the user asks for a scan**.

## Native module

### `SunmiCardReaderBackend.kt` (src/sdk) — fixes

**Remove `initEmvProcess()`.** Keep `abortTransactProcess()` as a defensive reset.
Log both return codes rather than discarding them.

**Report errors truthfully.** `onErrorEx` tries `code`, then `errorCode`, then
`error_code`, and always attaches a `raw` string enumerating every key/value in
the bundle. `findRFCardEx`, `findICCardEx` and `findMagCard` gain the same
multi-key lookup and raw dump, so an unfamiliar firmware shape becomes visible
rather than being silently dropped.

`CardReadEvent` and `CardErrorEvent` in `modules/sunmi-card-reader/index.ts` gain
an optional `raw?: string`.

### `SunmiCardReaderBackend.kt` — new functions

```ts
export type ReaderDiagnostics = {
  buildModel?: string;          // android.os.Build.MODEL
  payDeviceModel?: string;      // SysParam DEVICE_MODEL
  cardHw?: string;              // SysParam CARD_HW
  nfcConfig?: string;           // SysParam NFC
  msrVersion?: string;          // SysParam MSR_VERSION
  msr2FwVersion?: string;       // SysParam MSR2_FW_VER
  payLibVersion?: string;       // SunmiPayKernel.getPayLibVersion()
  matchedServiceVersion?: string; // getMatchedPaySDKVersion()
  /** Read failures keyed by param name, so a blank field is distinguishable
      from a field that threw. */
  errors?: Record<string, string>;
};

export type ProbeResult = {
  supported: boolean;
  code?: number;
  message?: string;
};

getDiagnostics(): Promise<ReaderDiagnostics>;
probeModes(modes: CardMode[]): Promise<Record<CardMode, ProbeResult>>;
```

`probeModes` runs natively because `checkCard` is exclusive and the modes must be
tried in sequence. Per mode: call `checkCard(bit, cb, 1)` and wait up to 1500 ms.

| Outcome | Verdict |
| --- | --- |
| `onError(-20000)` or `onError(-20003)` | unsupported |
| `onError(-30005)` (timeout) | supported |
| any `find*` callback | supported |
| nothing within the window | supported |

`cancelCheckCard()` runs after every mode regardless of outcome. A throw from
`checkCard` yields `supported: true` with the message attached — an unreadable
signal must not disable a method.

### `SunmiCardReaderBackend.kt` (src/stub)

Both new functions get stub implementations: `getDiagnostics()` resolves an empty
object, `probeModes()` resolves every requested mode as unsupported. The stub
build already reports the reader as unavailable, so this keeps the two backends
behaviourally consistent.

## Capability store

`src/store/cardCapabilities.ts` — zustand with
`persist(createJSONStorage(() => AsyncStorage))`, following the pattern already
established in `src/store/merchant.ts`.

```ts
export type ModeSupport = "unknown" | "supported" | "unsupported";

type LastError = { code: number; message?: string } | null;

interface CardCapabilityStore {
  /** Device fingerprint from expo-device; mismatch resets learned state. */
  deviceKey: string | null;
  /** True once the one-time probe has completed for this device. */
  probed: boolean;
  /** False when the reader could not be bound at all (non-Sunmi, stub build). */
  readerAvailable: boolean | null;
  modes: Record<CardMode, ModeSupport>;
  lastError: Record<CardMode, LastError>;
  diagnostics: ReaderDiagnostics | null;

  markSupported: (mode: CardMode) => void;
  markUnsupported: (mode: CardMode, code: number, message?: string) => void;
  applyProbe: (results: Record<CardMode, ProbeResult>) => void;
  setDiagnostics: (d: ReaderDiagnostics) => void;
  setReaderAvailable: (available: boolean) => void;
  /** Clears learned verdicts and the probed flag; used by the diagnostics screen. */
  resetLearned: () => void;
}
```

Initial state is `"unknown"` for all three modes.

**Device-key guard.** On rehydration, if the persisted `deviceKey` differs from
the current fingerprint, learned state resets. This prevents a restored backup
from teaching one model's limitations to another.

**Persisted:** `deviceKey`, `probed`, `readerAvailable`, `modes`, `lastError`,
`diagnostics`. All of it is device facts, none of it is cardholder data.

## Capability resolution

`src/hooks/useCardCapabilities.ts` performs no native calls — it reads the store
and derives:

```ts
{
  /** Modes not known to be unsupported, in display order: nfc, magnetic, ic. */
  availableModes: CardMode[];
  /** True when the reader is known-unavailable, or every mode is unsupported. */
  captureUnavailable: boolean;
  /** True while the one-time probe is running. */
  probing: boolean;
  /** Runs the probe once per device; a no-op when already probed. */
  ensureProbed: () => Promise<void>;
}
```

`availableModes` includes `"unknown"` modes — decision 5. `captureUnavailable` is
true only on positive evidence: the reader failed to bind, or all three modes were
explicitly demoted.

`probing` is hook-local `useState`, not persisted — it describes an in-flight call,
not a device fact.

`ensureProbed` is called by the scan sheet after `useCardReader` reports `ready`.
It calls `getDiagnostics()` and `probeModes()` for modes still `"unknown"`, writes
results through `applyProbe`, and sets `probed`. It is a no-op when `probed` is
already true, so the cost is one ~3 s check per device lifetime.

**Who records `readerAvailable`.** The scan sheet already observes
`useCardReader().status`; it calls `setReaderAvailable(status !== "unsupported")`
once the status leaves `"initializing"`. This is the only path that binds the
reader, so it is the only place that can know. Until it runs, `readerAvailable`
stays `null` and the button remains enabled — a device that has never opened the
sheet is not yet known to lack a reader.

Consequently, on a stub build or a non-Sunmi device the first sheet open records
`readerAvailable: false`, and every subsequent launch renders the button disabled
without touching native code.

## UI behaviour

### RefundCardButton

Consumes `useCardCapabilities()` directly, so neither `SaleScreenV2` nor
`CustomerScreen` needs to thread new props. When `captureUnavailable`, it renders
disabled and non-pressable — greyed border, muted text, `card-outline` icon in
grey — with the label `MobileApp.CardReader.CaptureUnavailable`. The clear button
is suppressed in that state.

Everything else about the component is unchanged, including the `toPayoutToken`
guard that decides whether a card counts as captured.

### RefundCardScanModal

The chooser is built from `availableModes` rather than a hardcoded pair.

| Available | Behaviour |
| --- | --- |
| 0 | Renders the "capture unavailable" state; the sheet should not normally be reachable, because the button is disabled |
| 1 | No chooser — auto-arms that method on `ready`, and hides "choose another method" |
| 2+ | Chooser listing exactly the available methods |

During a scan, an error whose code is `-20000` or `-20003` calls
`markUnsupported(mode, code, message)` and re-resolves rather than showing the
generic error state:

- other methods remain, and exactly one is left → auto-arm it, with a one-line
  note that the previous method is unavailable on this device
- other methods remain, more than one → return to the chooser with the same note
- none remain → the "capture unavailable" state

Other error codes keep today's behaviour: the error panel with "try again".

While `probing` is true the sheet shows a spinner and
`MobileApp.CardReader.CheckingReader`.

### CardReaderScreen (diagnostics)

Three additions above the existing manual-scan UI:

1. **Device & reader** — every `ReaderDiagnostics` field, each row rendered even
   when empty so a missing value is itself information.
2. **Capture methods** — one row per mode: verdict, and the last error code and
   message when present.
3. **Actions** — "Re-test methods" calls `resetLearned()` then re-runs the probe;
   a report block renders the whole thing as `<Text selectable>` (the pattern the
   screen already uses) alongside a `Share.share()` button, since the project has
   no clipboard dependency.

This screen is what testers install and report back from.

## Localization

New keys under `MobileApp.CardReader` in `src/localization/resources/en-US.json`
and `tr-TR.json`:

| Key | en-US |
| --- | --- |
| `Insert` | Insert Card |
| `CaptureUnavailable` | Card capture unavailable |
| `CaptureUnavailableDesc` | This device has no card reader the app can use. |
| `CheckingReader` | Checking card reader… |
| `MethodUnsupported` | That method is not available on this device. |
| `Diagnostics` | Diagnostics |
| `DeviceAndReader` | Device & reader |
| `CaptureMethods` | Capture methods |
| `Retest` | Re-test methods |
| `ShareReport` | Share report |
| `SupportSupported` | Available |
| `SupportUnsupported` | Not available |
| `SupportUnknown` | Not tested |

`npm run init` regenerates the bundles. The `*.gen.json` files are never edited
directly.

**`t()` takes no interpolation parameters.** Its real signature in
`src/providers/LocalizationProvider.tsx` is `(key: TranslationKey) => string`,
despite the example in `.claude/rules/i18n.md`. Every key above is therefore a
complete sentence; none may rely on runtime substitution.

## Testing

Unit tests, following the existing Jest setup:

- **`cardCapabilities` store** — demote and promote transitions; `applyProbe`
  mapping; device-key mismatch clearing learned state; persistence round-trip.
- **`useCardCapabilities`** — `availableModes` for 0/1/2/3 supported methods;
  `"unknown"` counting as available; `captureUnavailable` requiring positive
  evidence; `ensureProbed` running at most once.
- **`RefundCardButton`** — disabled rendering when `captureUnavailable`; clear
  button suppressed; the existing suite in
  `src/screens/(auth)/Sale/_components/__tests__/RefundCardButton.test.tsx` must
  stay green unchanged.
- **`RefundCardScanModal`** — chooser filtered to available methods; single method
  auto-arms without a chooser; a `-20003` mid-scan demotes and re-resolves; all
  methods demoted reaches the unavailable state.
- **`emv.ts`** — untouched; its existing tests guard the APDU path that the EMV
  kernel removal must not disturb.

Device verification, in order:

1. **P2 regression** — all three methods still capture after `initEmvProcess()` is
   removed. This is the gate for H1; if the P2 regresses, the call was load-bearing
   and the change reverts.
2. **V3 diagnostics** — install, open the diagnostics screen, share the report.
   That report decides between H1 and H2 and tells us whether `CARD_HW` is worth
   parsing in a follow-up.

## Out of scope

- Parsing `CARD_HW` into a capability set (decision 3).
- `checkCardEx`, `checkCardEnc` and `setNfcParam` — no evidence yet that the V3
  needs a different call shape, and adopting one blind would be untestable.
- Any change to how a captured card becomes a payout token, or to the create-tag
  payload.
- Non-Sunmi card readers.

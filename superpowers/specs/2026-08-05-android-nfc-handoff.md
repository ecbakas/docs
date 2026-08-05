# Android NFC card capture — handoff

**Date:** 2026-08-05
**Scope:** `pos-app`, branch `feat/android-nfc-card-capture` (9 commits, `431f7bf..34062e2`)
**Spec:** [2026-08-05-android-nfc-card-capture-design.md](./2026-08-05-android-nfc-card-capture-design.md)
**Plan:** [../plans/2026-08-05-android-nfc-card-capture.md](../plans/2026-08-05-android-nfc-card-capture.md)
**Predecessor handoff:** [2026-08-04-card-capture-handoff.md](./2026-08-04-card-capture-handoff.md)
**Status:** Implemented, reviewed, merged. **Device verification still outstanding.**

Tests went 237 → 245 across 22 suites. Typecheck clean. Lint held at its
pre-existing 35 warnings / 0 errors throughout. Both Gradle variants build.

## What the V3 report told us

A field diagnostic from a real Sunmi V3 settled the open question from the
previous round. The PaySDK service binds and answers `payDeviceModel: V3`,
`matchedServiceVersion: v3.3.355` — but every card-hardware system parameter is
empty and every card type is rejected with `-20003`:

```
cardHw: (empty)   nfcConfig: (empty)   msrVersion: (empty)   msr2FwVersion: (empty)
probeInconclusive: {"magnetic":{-20003},"nfc":{-20003},"ic":{-20003}}
methods: nfc: unknown   magnetic: unknown   ic: unknown
```

That is hypothesis **H2** confirmed: a pay service present with no card reader
behind it. Removing `initEmvProcess()` in the previous round was correct but was
never the cause.

It also showed the previous round's critical fix working in the field: all three
modes returned `-20003`, the probe declined to demote them, and all three stayed
`unknown`. Without that fix this V3 would already have had a permanently inert
refund-card button.

## What this branch adds

Android's own NFC radio as a second transport. `NfcTransport` (`NfcAdapter`
reader mode + `IsoDep`) lives in the module's always-compiled `src/main` with no
Sunmi imports, and emits the same events as the PaySDK path — so `readEmvCard`,
the capability store, the chooser and the diagnostics screen are all unchanged.

A single-mode NFC scan tries PaySDK first and hands off only when `checkCard`
answers `-20000`/`-20003`. **A healthy P2 therefore never diverts.**

## Device verification — still outstanding

No device was reachable during implementation. Kotlin is verified by compilation
and code tracing only; 245 JS tests exercise none of the radio.

1. **P2 regression.** Capture by tap, swipe and insert. All three must work, and
   logcat must show **no** `falling back to Android NFC` line. This also finally
   discharges the `initEmvProcess()` gate carried from the previous round.
   While you are there, note the P2's `androidNfcPresent` value — if true, a
   transient PaySDK `-20003` on a P2 would now divert to Android NFC rather than
   demoting. That is an improvement either way, but it should be a known fact.
2. **V3 diagnostics.** Card Reader → Re-test methods → Share report. Expect
   `androidNfcPresent: true`, `androidNfcEnabled: true`, and `methods:` showing
   `nfc: supported` with `magnetic`/`ic` **unsupported** — a mixed result, which
   is what finally lets the two genuinely-absent readers be demoted.
3. **V3 capture.** Open a sale, tap the refund-card button. Expect no chooser
   (one method), the reader arms, and a contactless card yields PAN and expiry.
4. **V3 with NFC switched off.** Expect the "Activate NFC" panel with an **Open
   NFC Settings** button — and, after enabling NFC and returning to the app, an
   automatic retry rather than a stuck panel.

## Known issue: the stub variant has a dead end

The stub backend's `startScan` lacks the supersede guard the sdk backend got, so
after a successful NFC read that yields no PAN, every retry returns `-3 "Reader
busy"` until the sheet is closed.

**This does not affect any shipped build.** The stub is produced only by hand-
passing `-PsunmiCardReaderStub=true`; no CI, EAS or build config references it.

One-line fix when someone next touches that file — in
`modules/sunmi-card-reader/android/src/stub/.../SunmiCardReaderBackend.kt`,
call `nfc.cancelScan()` immediately before `nfc.startScan(timeoutSec)`.

## Follow-ups worth filing

**A. Give `NfcTransport` a session id.** Three lifecycle races share one root
cause: the transport has no way to tell "the session I was told to arm" from
"one that was cancelled while I was arming it". A monotonic id captured at
`startScan`, checked by `onTag` and `stopSession`, with the `Activity` used for
`enableReaderMode` held in the session object, closes all three plus the stub
dead end above.

**B. Make demotion revisable — highest leverage of the three.** Four bugs across
two branches had the identical shape: a *transient* condition leaking into a
*permanent, persisted* demotion. Each was only severe because
`modes[mode] = "unsupported"` lasts for the device's lifetime and is recoverable
only through a diagnostics screen most users never open. Persist a timestamp
with each verdict and expire it — 7 days, or on app-version change. That turns
every future instance of this shape from a field failure requiring support into
something that self-heals within a week.

**C. Funnel error emission through one helper.** Route every
`emit("onError", …)` in both Kotlin backends through a function taking an
explicit `provenAbsent` flag, which degrades a demoting code to a transient one
when the claim is not backed by hardware evidence. About eight call sites. Note
this is a complement to B, not a substitute: the obvious guard — validating codes
at `markUnsupported` — would have caught only the first of the four bugs, because
the other three emitted codes that are legitimately on the allowlist. The code
was never the defect; the *claim behind it* was.

## Residual risks

- **`disableReaderMode` then `enableReaderMode` within milliseconds.** Main-handler
  FIFO guarantees the ordering, but whether the radio's own state machine re-arms
  cleanly is a hardware fact. Watch for it in check 1 above.
- **Whether `getDefaultAdapter()` ever actually throws** on target firmware — the
  whole `Unreadable` tri-state may be defensive-only code.
- **PAN-suppressing contactless cards** return no number over `READ RECORD`. Same
  APDU conversation the P2 already runs, so not a new risk — but if the V3 reads
  a tag and yields nothing, check the card before suspecting the transport.

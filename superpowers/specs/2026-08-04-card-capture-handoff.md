# Card capture device capabilities — handoff

**Date:** 2026-08-04
**Scope:** `pos-app`, branch `feat/card-capture-capabilities` (15 commits, `5fa235a..a326d79`)
**Spec:** [2026-08-04-card-capture-device-capabilities-design.md](./2026-08-04-card-capture-device-capabilities-design.md)
**Plan:** [../plans/2026-08-04-card-capture-device-capabilities.md](../plans/2026-08-04-card-capture-device-capabilities.md)
**Status:** Implemented and reviewed clean. **Merge is gated on physical-device verification that was not possible during implementation.**

Tests went from 89 to 237 across 21 suites. Typecheck clean. Lint held at its
pre-existing 35 warnings / 0 errors throughout.

## What must happen before merge

The Sunmi P2 dropped off USB partway through the work and never reconnected, so
**nothing in this branch has been exercised against real Sunmi hardware.** Kotlin
compiles against the real PayLib AAR and 237 JS tests pass; neither of those
touches a card reader.

### 1. P2 regression — the gate for removing `initEmvProcess()`

Capture a card by **tap** and by **swipe** on a Sunmi P2. Both must still return a
card number.

This is the falsification test for the spec's hypothesis H1. `initEmvProcess()`
was removed because the app never runs an SDK EMV transaction — `src/utils/emv.ts`
drives the chip itself over `transmitApdu` and states it "needs no Sunmi Pay
authorization". If the P2 regresses, that call was load-bearing: restore it
(keeping the logging and the `raw` bundle dumps) and H1 dies. Everything else in
the branch stands regardless.

### 2. V3 diagnostics — the reason the branch exists

Install, open **Home → Card Reader**, press **Re-test methods**, then **Share
report**. That report decides between the spec's H1 and H2 and is the first real
data anyone will have about the V3.

When reading it, watch for:

- `probeInconclusive` under "read failures:" — means the probe found every method
  unsupported and deliberately declined to demote them (see below).
- `cardHw`, `nfcConfig`, `msrVersion`, `msr2FwVersion` — these are collected but
  deliberately **never parsed**. What they contain determines whether a future
  revision can seed capability from them instead of probing.
- `payLibVersion` vs `matchedServiceVersion` — a mismatch would suggest the V3's
  on-device pay service disagrees with the bundled SDK.
- In logcat: `scan callback fired for a superseded session; dropping`, and whether
  any mode's `raw` dump is missing relative to a pre-fix build.

### 3. V3 capture behaviour

Open a sale and tap the refund-card button. Expect: only the probed methods
offered; with exactly one, the sheet arms it with no chooser; with none, the
button is inert and reads "Card capture unavailable".

## The most important thing to understand about this branch

The final review caught a defect that would have made this work **actively harmful
on the V3**, and the fix changes how you should read a V3 report.

`probeOne` classifies any `-20003` as proof a reader is absent. If the V3's param
error has any systematic cause other than missing hardware — the `timeout=1`
argument, call ordering, callback shape, an authorization state — the one-time
probe would have reproduced it for all three modes in a single ~4.5s sweep,
persisted three `"unsupported"` verdicts, and rendered the refund-card button
permanently inert on both sale screens, surviving restarts.

That traced to an unreconciled conflict inside the spec: Decision 2 says `-20003`
permanently demotes; Decision 5 says a detection bug must never disable a working
reader. Decision 2 applied to a probe that can demote *everything* defeats
Decision 5.

**The rule now:** an all-modes-unsupported *probe* result is treated as
inconclusive — the raw results are kept in `diagnostics` for the report, and the
modes stay `"unknown"` (offered). Three real user-initiated scan failures can still
demote all three and legitimately reach "capture unavailable". The silent automatic
probe alone cannot.

**Amend the spec** to state this explicitly, so a future revision does not
reintroduce it.

## Known residual risks

- **The three Kotlin-only fixes have compile-only verification.** There is no
  JVM/Robolectric harness under `modules/sunmi-card-reader/android`, so nothing
  would catch an accidental revert of the seven `if (!releaseIfCurrent()) return`
  guards in the callback overrides — identical one-liners, exactly the shape a
  careless refactor collapses.
- **Callback dedup narrows the diagnostic surface.** Exactly one emit per session
  now wins. On firmware that delivers a plain callback and then its richer `*Ex`
  variant, the `*Ex` payload and its `raw` dump are dropped where both previously
  reached JS. Correct trade — emitting both is what enabled a wrongful demotion —
  but unobservable without hardware.
- **`cancelScan()` still fires `cancelCheckCard()` while a probe holds the token.**
  If that disruption surfaces as `-20003` on one mode of a sweep whose other modes
  succeeded, the inconclusive guard does not trip and a false `"unsupported"` is
  recorded. Pre-existing, and the one remaining route to a probe-driven false
  demotion. Exercised whenever a user closes the sheet during the ~4.5s probe.

## Deferred items, triaged as ship-but-worth-doing

- `src/store/cardCapabilities.ts:88` tests `?.supported === false` while the
  demotion at `:134` uses truthiness. A result missing `supported` would skip the
  inconclusive guard yet still demote. Unreachable through the current native
  contract; one-word hardening is `!== true`.
- No test covers `markSupported`-on-success — the promotion half of Decision 2 has
  zero coverage at any layer.
- No custom `merge` on the persisted store. Both failure shapes fail open today;
  revisit before a fourth `CardMode` lands.
- `CardReaderScreen.tsx` is 463 lines; the diagnostics panel is a clean extraction
  candidate.
- `useCardReader`'s `addErrorListener` still has no `scanGen` check, unlike its read
  listener. The native CAS gate now blocks the dangerous path, but the JS-side gap
  remains.
- The lint baseline is no longer a complete count of `no-require-imports`: one
  production file now suppresses it by comment while five others leave it bare.
  Worth a policy decision.

## Release note

`src/data/*/*.gen.json` is gitignored and only regenerated by `npm run init`, which
the `android:dev` / `android:prod` / `android:pc` scripts skip. This branch adds 50
translation keys. A build from a stale bundle renders
`error: MobileApp.CardReader.CaptureUnavailable` in the new UI. Pre-existing
workflow, newly consequential.

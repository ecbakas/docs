# Card Capture Device Capabilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make refund-card capture work across Sunmi models by reporting reader errors truthfully, detecting which capture methods each device actually has, and offering only those methods in the UI.

**Architecture:** A persisted zustand store holds a per-device verdict for each capture method (`nfc` / `magnetic` / `ic`). It is seeded by a one-time native probe on first use and corrected permanently by runtime results. The always-mounted `RefundCardButton` reads that store without binding the reader; the scan sheet resolves the chooser from it. Native fixes make the Sunmi error codes visible so demotion can trigger at all.

**Tech Stack:** Expo 54 / React Native, TypeScript, zustand + `persist` over AsyncStorage, NativeWind, Kotlin Expo module wrapping `com.sunmi:PayLib-release:2.0.42`, Jest (`jest-expo`) + `@testing-library/react-native`.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-04-card-capture-device-capabilities-design.md`. Read it before starting.
- **Working directory:** all paths are relative to `c:\unirefund\pos-app`, which is its own git repo.
- **`t()` takes no interpolation parameters.** Its real signature is `(key: TranslationKey) => string` (`src/providers/LocalizationProvider.tsx:74-82`), despite the example in `.claude/rules/i18n.md`. Every string must be a complete sentence.
- **Never edit `src/data/language-data/*.gen.json` by hand.** Edit `src/localization/resources/{en-US,tr-TR}.json`, then run `npm run init` (requires network access to `dev-api.unirefund.com`).
- **No hardcoded user-visible text.** Always `useLocalization()`.
- **Avoid `useEffect`** unless synchronising with an external system (native events, subscriptions). Prefer derived values via `useMemo`.
- **Reuse existing UI primitives** from `src/components/**` (`DebouncedPressable`, `Ionicons`, `Button`). Do not add UI libraries.
- **Unknown means available.** Any capability signal that cannot be read leaves the method offered. A detection bug must never disable a working reader.
- **Do not parse `CARD_HW`.** Collect and display it only.
- **Sunmi error codes** (from decompiled PayLib 2.0.42): `-20000` = not supported, `-20003` = param error, `-30005` = read timeout. Only `-20000` and `-20003` demote a method.
- **Card modes and display order:** `nfc`, `magnetic`, `ic`.
- Run `npm test`, `npm run typecheck` and `npm run lint` before each commit.

---

### Task 1: Localization keys

`CardReaderScreen` references 26 `MobileApp.CardReader.*` keys that exist in neither locale, so it currently renders `"error: MobileApp.CardReader.Title"` and similar. It is the screen testers will use for the V3 report, so it must be legible. This task adds the missing keys plus every key later tasks need, and adds a guard test so the gap cannot silently reopen.

**Files:**
- Modify: `src/localization/resources/en-US.json`
- Modify: `src/localization/resources/tr-TR.json`
- Create: `src/localization/__tests__/cardReaderKeys.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the `MobileApp.CardReader.*` key set every later task reads through `t()`.

- [ ] **Step 1: Write the failing test**

Create `src/localization/__tests__/cardReaderKeys.test.ts`:

```ts
import en from "../resources/en-US.json";
import tr from "../resources/tr-TR.json";

// Every MobileApp.CardReader.* key the app reads. CardReaderScreen builds some
// of these dynamically (`cr(m.labelKey)`), so TypeScript cannot catch a missing
// one — t() just returns "error: <key>" at runtime. This list is the guard.
const REQUIRED_KEYS = [
  // Pre-existing
  "NotSupported", "NotSupportedDesc", "Nfc", "Swipe", "Initializing",
  "Scanning", "ScanPromptNfc", "ReadingCard", "ErrorTitle", "ErrorGeneric",
  "ScanAgain",
  // Referenced by CardReaderScreen but never defined
  "Title", "Description", "ModesTitle", "Insert", "SelectModeWarning",
  "SaveDone", "Cancel", "ScanCard", "ReadyPrompt", "ScanPrompt", "Success",
  "Mode", "CardNumber", "Hide", "Reveal", "Expiry", "Cardholder",
  "ServiceCode", "NfcNameNote", "RawData", "Uuid", "Atr", "Track1", "Track2",
  "PciNote", "Save",
  // New for capability-driven capture
  "ScanPromptIc", "CaptureUnavailable", "CaptureUnavailableDesc",
  "CheckingReader", "MethodUnsupported", "Diagnostics", "DeviceAndReader",
  "CaptureMethods", "Retest", "ShareReport", "SupportSupported",
  "SupportUnsupported", "SupportUnknown",
] as const;

describe.each([
  ["en-US", en],
  ["tr-TR", tr],
])("%s CardReader resources", (_locale, bundle) => {
  const section = (bundle as Record<string, Record<string, string>>).CardReader;

  it("defines the section", () => {
    expect(section).toBeDefined();
  });

  it.each(REQUIRED_KEYS)("defines %s as a non-empty string", (key) => {
    expect(typeof section[key]).toBe("string");
    expect(section[key].trim()).not.toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/localization/__tests__/cardReaderKeys.test.ts`
Expected: FAIL — many `expect(typeof section[key]).toBe("string")` assertions receive `"undefined"`.

- [ ] **Step 3: Add the keys**

Replace the whole `"CardReader"` block in `src/localization/resources/en-US.json` (currently lines 177-189) with:

```json
  "CardReader": {
    "Title": "Card Reader",
    "Description": "Read a card to check what this device supports.",
    "ModesTitle": "Methods to try",
    "NotSupported": "Card Reader Not Available",
    "NotSupportedDesc": "This device does not have a supported card reader.",
    "Nfc": "Tap Card",
    "Swipe": "Swipe Card",
    "Insert": "Insert Card",
    "Initializing": "Preparing card reader…",
    "Scanning": "Waiting for card",
    "ScanPrompt": "Present the card using one of the selected methods.",
    "ScanPromptNfc": "Hold the card against the back of the device.",
    "ScanPromptIc": "Insert the card into the chip slot and leave it in place.",
    "ReadingCard": "Reading card…",
    "ReadyPrompt": "Ready when you are.",
    "Success": "Card Read",
    "ErrorTitle": "Card Could Not Be Read",
    "ErrorGeneric": "An error occurred while reading the card. Please try again.",
    "ScanAgain": "Try Again",
    "ScanCard": "Read Card",
    "Cancel": "Cancel",
    "SelectModeWarning": "Select at least one method first.",
    "Save": "Save",
    "SaveDone": "Saved.",
    "Mode": "Method",
    "CardNumber": "Card Number",
    "Hide": "Hide",
    "Reveal": "Reveal",
    "Expiry": "Expiry",
    "Cardholder": "Cardholder",
    "ServiceCode": "Service Code",
    "NfcNameNote": "Contactless and chip reads often omit the cardholder name.",
    "RawData": "Raw Data",
    "Uuid": "UUID",
    "Atr": "ATR",
    "Track1": "Track 1",
    "Track2": "Track 2",
    "PciNote": "Card data stays on this device. Never share a full card number.",
    "CaptureUnavailable": "Card capture unavailable",
    "CaptureUnavailableDesc": "This device has no card reader the app can use.",
    "CheckingReader": "Checking card reader…",
    "MethodUnsupported": "That method is not available on this device.",
    "Diagnostics": "Diagnostics",
    "DeviceAndReader": "Device & reader",
    "CaptureMethods": "Capture methods",
    "Retest": "Re-test methods",
    "ShareReport": "Share report",
    "SupportSupported": "Available",
    "SupportUnsupported": "Not available",
    "SupportUnknown": "Not tested"
  },
```

Replace the `"CardReader"` block in `src/localization/resources/tr-TR.json` (currently lines 177-189) with:

```json
  "CardReader": {
    "Title": "Kart Okuyucu",
    "Description": "Bu cihazın neyi desteklediğini görmek için bir kart okutun.",
    "ModesTitle": "Denenecek yöntemler",
    "NotSupported": "Kart Okuyucu Kullanılamıyor",
    "NotSupportedDesc": "Bu cihazda desteklenen bir kart okuyucu bulunmuyor.",
    "Nfc": "Kartı Okut",
    "Swipe": "Kartı Geçir",
    "Insert": "Kartı Tak",
    "Initializing": "Kart okuyucu hazırlanıyor…",
    "Scanning": "Kart bekleniyor",
    "ScanPrompt": "Kartı seçili yöntemlerden biriyle okutun.",
    "ScanPromptNfc": "Kartı cihazın arkasına yaklaştırın.",
    "ScanPromptIc": "Kartı çip yuvasına takın ve çıkarmayın.",
    "ReadingCard": "Kart okunuyor…",
    "ReadyPrompt": "Hazır olduğunuzda başlayın.",
    "Success": "Kart Okundu",
    "ErrorTitle": "Kart Okunamadı",
    "ErrorGeneric": "Kart okunurken bir hata oluştu. Lütfen tekrar deneyin.",
    "ScanAgain": "Tekrar Dene",
    "ScanCard": "Kartı Oku",
    "Cancel": "İptal",
    "SelectModeWarning": "Önce en az bir yöntem seçin.",
    "Save": "Kaydet",
    "SaveDone": "Kaydedildi.",
    "Mode": "Yöntem",
    "CardNumber": "Kart Numarası",
    "Hide": "Gizle",
    "Reveal": "Göster",
    "Expiry": "Son Kullanma",
    "Cardholder": "Kart Sahibi",
    "ServiceCode": "Servis Kodu",
    "NfcNameNote": "Temassız ve çipli okumalarda kart sahibi adı çoğu zaman gelmez.",
    "RawData": "Ham Veri",
    "Uuid": "UUID",
    "Atr": "ATR",
    "Track1": "İz 1",
    "Track2": "İz 2",
    "PciNote": "Kart verisi cihazda kalır. Tam kart numarasını asla paylaşmayın.",
    "CaptureUnavailable": "Kart okuma kullanılamıyor",
    "CaptureUnavailableDesc": "Bu cihazda uygulamanın kullanabileceği bir kart okuyucu yok.",
    "CheckingReader": "Kart okuyucu kontrol ediliyor…",
    "MethodUnsupported": "Bu yöntem bu cihazda kullanılamıyor.",
    "Diagnostics": "Tanılama",
    "DeviceAndReader": "Cihaz ve okuyucu",
    "CaptureMethods": "Okuma yöntemleri",
    "Retest": "Yöntemleri yeniden test et",
    "ShareReport": "Raporu paylaş",
    "SupportSupported": "Kullanılabilir",
    "SupportUnsupported": "Kullanılamıyor",
    "SupportUnknown": "Test edilmedi"
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/localization/__tests__/cardReaderKeys.test.ts`
Expected: PASS

- [ ] **Step 5: Regenerate the language bundles**

Run: `npm run init`

This fetches backend resources and merges the local overrides into `src/data/language-data/*.gen.json`. It needs network access to `dev-api.unirefund.com`. Confirm the new keys landed:

Run: `node -e "const c=require('./src/data/language-data/en-US.gen.json').MobileApp.CardReader; console.log(Object.keys(c).length, c.CaptureUnavailable, '|', c.Insert)"`
Expected: a count of at least `50`, then `Card capture unavailable | Insert Card`. The backend bundle may contribute extra keys, so check the two values rather than an exact count.

- [ ] **Step 6: Commit**

```bash
git add src/localization/resources src/localization/__tests__ src/data/language-data
git commit -m "fix(i18n): add missing CardReader keys and capability strings"
```

---

### Task 2: Truthful native error reporting

`onErrorEx` collapses any unrecognised bundle to `-1`, so a V3 report of "params error" can surface in the app as `Error -1`. Nothing downstream can be trusted until this is fixed. This task also removes the unused EMV kernel initialization (hypothesis H1 in the spec).

**Files:**
- Modify: `modules/sunmi-card-reader/android/src/sdk/java/expo/modules/sunmicardreader/SunmiCardReaderBackend.kt`
- Modify: `modules/sunmi-card-reader/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `CardReadEvent.raw?: string` and `CardErrorEvent.raw?: string` — a flattened dump of every key in the firmware's callback bundle.

- [ ] **Step 1: Add `raw` to the TypeScript event types**

In `modules/sunmi-card-reader/index.ts`, extend the two event types:

```ts
export type CardReadEvent = {
  mode: CardMode;
  uuid?: string;
  atr?: string;
  track1?: string;
  track2?: string;
  track3?: string;
  /** Sunmi numeric card type, needed to address the card in transmitApdu. */
  cardType?: number;
  /**
   * Every key/value the firmware put in the callback bundle, flattened. Only
   * populated by the *Ex callbacks. Diagnostics only — never parsed.
   */
  raw?: string;
};

export type CardErrorEvent = {
  /** Sunmi SDK error code (e.g. timeout). Negative codes are JS-side failures. */
  code: number;
  message?: string;
  /** Flattened error bundle, so an unrecognised firmware shape stays visible. */
  raw?: string;
};
```

- [ ] **Step 2: Add a bundle-dumping helper to the real backend**

In `SunmiCardReaderBackend.kt` (src/sdk), add these private helpers to the class, just above the `checkCardCallback` property:

```kotlin
/** Flatten every key in a callback Bundle so unfamiliar firmware shapes stay
 *  visible in diagnostics instead of being silently dropped. */
private fun dumpBundle(info: Bundle?): String? {
  if (info == null) return null
  return try {
    info.keySet().joinToString(", ") { key ->
      @Suppress("DEPRECATION")
      "$key=${info.get(key)}"
    }
  } catch (e: Throwable) {
    "dump failed: ${e.message}"
  }
}

/** First non-null String across several candidate keys — firmware revisions
 *  disagree on casing and naming. */
private fun firstString(info: Bundle?, vararg keys: String): String? {
  if (info == null) return null
  for (key in keys) {
    val value = try { info.getString(key) } catch (_: Throwable) { null }
    if (value != null) return value
  }
  return null
}

/** First present Int across several candidate keys; null when none exist. */
private fun firstInt(info: Bundle?, vararg keys: String): Int? {
  if (info == null) return null
  for (key in keys) {
    if (info.containsKey(key)) {
      val value = try { info.getInt(key) } catch (_: Throwable) { null }
      if (value != null) return value
    }
  }
  return null
}
```

- [ ] **Step 3: Rewrite the callback to use them**

Replace the whole `checkCardCallback` property with:

```kotlin
// CheckCardCallbackV2 (verified against PayLib-release 2.0.42) declares SEVEN
// abstract methods; the AIDL Stub leaves all of them abstract, so every one
// must be implemented. The plain methods are the common path; the *Ex Bundle
// variants are delivered instead on some firmware, so we route them too. Only
// one variant fires per detected card, so there is no double-emit.
//
// Every *Ex variant carries a flattened `raw` dump: firmware revisions disagree
// about bundle keys, and a wrong guess must degrade to "visible but unparsed"
// rather than to a fabricated value.
private val checkCardCallback = object : CheckCardCallbackV2.Stub() {
  override fun findMagCard(info: Bundle?) {
    emit(
      "onCardRead",
      mapOf(
        "mode" to "magnetic",
        "track1" to firstString(info, "TRACK1", "track1"),
        "track2" to firstString(info, "TRACK2", "track2"),
        "track3" to firstString(info, "TRACK3", "track3"),
        "raw" to dumpBundle(info),
      ),
    )
  }

  override fun findICCard(atr: String?) {
    emit(
      "onCardRead",
      mapOf("mode" to "ic", "atr" to atr, "cardType" to AidlConstants.CardType.IC.value),
    )
  }

  override fun findRFCard(uuid: String?) {
    emit(
      "onCardRead",
      mapOf("mode" to "nfc", "uuid" to uuid, "cardType" to AidlConstants.CardType.NFC.value),
    )
  }

  override fun onError(code: Int, message: String?) {
    emit("onError", mapOf("code" to code, "message" to message))
  }

  override fun findICCardEx(info: Bundle?) {
    emit(
      "onCardRead",
      mapOf(
        "mode" to "ic",
        "atr" to firstString(info, "atr", "ATR"),
        "cardType" to AidlConstants.CardType.IC.value,
        "raw" to dumpBundle(info),
      ),
    )
  }

  override fun findRFCardEx(info: Bundle?) {
    emit(
      "onCardRead",
      mapOf(
        "mode" to "nfc",
        "uuid" to firstString(info, "uuid", "UUID", "cardNo", "uid"),
        "cardType" to AidlConstants.CardType.NFC.value,
        "raw" to dumpBundle(info),
      ),
    )
  }

  override fun onErrorEx(info: Bundle?) {
    val code = firstInt(info, "code", "errorCode", "error_code")
    emit(
      "onError",
      mapOf(
        "code" to (code ?: -1),
        "message" to firstString(info, "message", "msg", "errorMsg"),
        "raw" to dumpBundle(info),
      ),
    )
  }
}
```

- [ ] **Step 4: Remove the unused EMV kernel initialization**

The app never runs an SDK EMV transaction — `src/utils/emv.ts` drives the chip itself over `transmitApdu` and states it "needs no Sunmi Pay authorization". `initEmvProcess()` therefore resets nothing; it *starts* kernel state that is never used and whose terminal parameters are never set. This is the leading hypothesis for a failure that hits tap and swipe identically.

In `startScan`, replace:

```kotlin
    try {
      // Reset any half-finished EMV transaction before starting a fresh read.
      try { emv?.abortTransactProcess() } catch (_: Throwable) {}
      try { emv?.initEmvProcess() } catch (_: Throwable) {}
      rc.checkCard(cardType, checkCardCallback, timeoutSec)
```

with:

```kotlin
    try {
      // Defensively clear any transaction the EMV kernel may still be holding.
      // We deliberately do NOT call initEmvProcess(): this module never runs an
      // SDK EMV transaction (src/utils/emv.ts drives the chip over transmitApdu
      // itself), so initialising the kernel only creates unused state whose
      // terminal parameters are never configured. Return codes are logged
      // rather than swallowed so device differences are visible.
      try {
        val aborted = emv?.abortTransactProcess()
        if (aborted != null && aborted != 0) Log.i(TAG, "abortTransactProcess -> $aborted")
      } catch (e: Throwable) {
        Log.w(TAG, "abortTransactProcess threw", e)
      }
      Log.i(TAG, "checkCard(cardType=$cardType, timeout=$timeoutSec)")
      rc.checkCard(cardType, checkCardCallback, timeoutSec)
```

- [ ] **Step 5: Verify it compiles**

Run: `npx expo run:android --no-bundler`
Expected: BUILD SUCCESSFUL. Confirm the gradle log line `✅ [sunmi-card-reader] REAL backend` appears.

- [ ] **Step 6: Regression-test on the Sunmi P2**

This is the gate for removing `initEmvProcess()`. On a P2, open the refund-card sheet and capture a card by **tap** and by **swipe**. Both must still return a card number.

If either regresses, the call was load-bearing: restore `initEmvProcess()` (keeping the logging and the `raw` dumps), note it in the plan, and continue with the remaining tasks.

- [ ] **Step 7: Commit**

```bash
git add modules/sunmi-card-reader
git commit -m "fix(card-reader): report real error codes and stop initialising the unused EMV kernel"
```

---

### Task 3: Native diagnostics and capability probe

**Files:**
- Modify: `modules/sunmi-card-reader/android/src/sdk/java/expo/modules/sunmicardreader/CardReaderBackend.kt`
- Modify: `modules/sunmi-card-reader/android/src/main/java/expo/modules/sunmicardreader/CardReaderBackend.kt`
- Modify: `modules/sunmi-card-reader/android/src/main/java/expo/modules/sunmicardreader/SunmiCardReaderModule.kt`
- Modify: `modules/sunmi-card-reader/android/src/sdk/java/expo/modules/sunmicardreader/SunmiCardReaderBackend.kt`
- Modify: `modules/sunmi-card-reader/android/src/stub/java/expo/modules/sunmicardreader/SunmiCardReaderBackend.kt`
- Modify: `modules/sunmi-card-reader/index.ts`

**Interfaces:**
- Consumes: `CardMode` from Task 2's module surface.
- Produces:
  - `getDiagnostics(): Promise<ReaderDiagnostics>`
  - `probeModes(modes: CardMode[]): Promise<Partial<Record<CardMode, ProbeResult>>>`
  - `type ReaderDiagnostics = { buildModel?, payDeviceModel?, cardHw?, nfcConfig?, msrVersion?, msr2FwVersion?, payLibVersion?, matchedServiceVersion?: string; errors?: Record<string, string> }`
  - `type ProbeResult = { supported: boolean; code?: number; message?: string }`

- [ ] **Step 1: Extend the backend interface**

In `modules/sunmi-card-reader/android/src/main/java/expo/modules/sunmicardreader/CardReaderBackend.kt`, add two methods to the `CardReaderBackend` interface (after `cancelScan`):

```kotlin
  /**
   * Device and reader identity: model, card-hardware system params, and SDK
   * versions. Resolves a Map suitable for direct serialization to JS. Never
   * rejects — unreadable fields are reported under an "errors" sub-map.
   */
  fun getDiagnostics(promise: Promise)

  /**
   * Try each requested mode with a short checkCard and classify the outcome.
   * Resolves a Map of mode -> { supported: Boolean, code: Int?, message: String? }.
   * Must run the modes sequentially: checkCard is exclusive.
   */
  fun probeModes(modes: List<String>, promise: Promise)
```

- [ ] **Step 2: Wire them through the module**

In `SunmiCardReaderModule.kt`, add after the `cancelScan` definition:

```kotlin
    AsyncFunction("getDiagnostics") { promise: Promise ->
      val b = backend
      if (b == null) promise.resolve(emptyMap<String, Any?>()) else b.getDiagnostics(promise)
    }

    AsyncFunction("probeModes") { modes: List<String>, promise: Promise ->
      val b = backend
      if (b == null) promise.resolve(emptyMap<String, Any?>()) else b.probeModes(modes, promise)
    }
```

- [ ] **Step 3: Implement them in the stub backend**

In `modules/sunmi-card-reader/android/src/stub/.../SunmiCardReaderBackend.kt`, add:

```kotlin
  override fun getDiagnostics(promise: Promise) {
    promise.resolve(mapOf("errors" to mapOf("backend" to "stub build: Sunmi Pay SDK not bundled")))
  }

  override fun probeModes(modes: List<String>, promise: Promise) {
    // No reader exists in a stub build, so every mode is genuinely unavailable.
    promise.resolve(
      modes.associateWith { mapOf("supported" to false, "message" to "stub build") },
    )
  }
```

- [ ] **Step 4: Implement diagnostics in the real backend**

In `modules/sunmi-card-reader/android/src/sdk/.../SunmiCardReaderBackend.kt`, first add the import next to the existing `aidlv2` imports:

```kotlin
import com.sunmi.pay.hardware.aidlv2.system.BasicOptV2
```

Add the field next to `readCard` / `emv`:

```kotlin
  private var basic: BasicOptV2? = null
```

Assign it in `onConnectPaySDK`, next to `readCard = k.mReadCardOptV2`:

```kotlin
              basic = k.mBasicOptV2
```

Null it in `onDisconnectPaySDK`, next to `readCard = null`:

```kotlin
            basic = null
```

Null it in `destroy()`, next to `readCard = null`:

```kotlin
    basic = null
```

Then add the method:

```kotlin
  override fun getDiagnostics(promise: Promise) {
    val out = HashMap<String, Any?>()
    val errors = HashMap<String, String>()

    out["buildModel"] = android.os.Build.MODEL

    val b = basic
    // SysParam keys verified against PayLib-release 2.0.42's AidlConstants.SysParam.
    // CARD_HW is collected but deliberately NOT parsed: its format is
    // undocumented, and guessing could hide a working reader.
    val params = listOf(
      "payDeviceModel" to AidlConstants.SysParam.DEVICE_MODEL,
      "cardHw" to AidlConstants.SysParam.CARD_HW,
      "nfcConfig" to AidlConstants.SysParam.NFC_CONFIG,
      "msrVersion" to AidlConstants.SysParam.MSR_VERSION,
      "msr2FwVersion" to AidlConstants.SysParam.MSR2_FW_VER,
    )
    if (b == null) {
      errors["sysParam"] = "Pay service not connected"
    } else {
      for ((field, key) in params) {
        try {
          out[field] = b.getSysParam(key)
        } catch (e: Throwable) {
          errors[field] = e.message ?: e.javaClass.simpleName
        }
      }
    }

    try {
      out["payLibVersion"] = kernel?.payLibVersion
    } catch (e: Throwable) {
      errors["payLibVersion"] = e.message ?: e.javaClass.simpleName
    }
    try {
      out["matchedServiceVersion"] = kernel?.matchedPaySDKVersion
    } catch (e: Throwable) {
      errors["matchedServiceVersion"] = e.message ?: e.javaClass.simpleName
    }

    if (errors.isNotEmpty()) out["errors"] = errors
    Log.i(TAG, "diagnostics: $out")
    promise.resolve(out)
  }
```

- [ ] **Step 5: Implement the probe in the real backend**

Add to the same class:

```kotlin
  override fun probeModes(modes: List<String>, promise: Promise) {
    val rc = readCard
    if (rc == null) {
      // Cannot determine anything; report every mode as available so a missing
      // signal never disables a working reader.
      promise.resolve(modes.associateWith { mapOf("supported" to true, "message" to "reader not connected") })
      return
    }
    // checkCard is exclusive, so the modes must be tried one at a time. Done on
    // a worker thread: each mode blocks for up to PROBE_WINDOW_MS.
    Thread {
      val results = HashMap<String, Any?>()
      for (mode in modes) {
        results[mode] = probeOne(rc, mode)
      }
      Log.i(TAG, "probeModes -> $results")
      promise.resolve(results)
    }.start()
  }

  private fun probeOne(rc: ReadCardOptV2, mode: String): Map<String, Any?> {
    val bit = cardTypeFor(mode) ?: return mapOf("supported" to false, "message" to "unknown mode")
    val latch = java.util.concurrent.CountDownLatch(1)
    val code = java.util.concurrent.atomic.AtomicInteger(PROBE_NO_RESULT)
    val message = java.util.concurrent.atomic.AtomicReference<String?>(null)

    val cb = object : CheckCardCallbackV2.Stub() {
      private fun found() { code.set(0); latch.countDown() }
      override fun findMagCard(info: Bundle?) = found()
      override fun findICCard(atr: String?) = found()
      override fun findRFCard(uuid: String?) = found()
      override fun findICCardEx(info: Bundle?) = found()
      override fun findRFCardEx(info: Bundle?) = found()
      override fun onError(c: Int, m: String?) {
        code.set(c); message.set(m); latch.countDown()
      }
      override fun onErrorEx(info: Bundle?) {
        code.set(firstInt(info, "code", "errorCode", "error_code") ?: -1)
        message.set(firstString(info, "message", "msg", "errorMsg"))
        latch.countDown()
      }
    }

    return try {
      rc.checkCard(bit, cb, 1)
      latch.await(PROBE_WINDOW_MS, java.util.concurrent.TimeUnit.MILLISECONDS)
      try { rc.cancelCheckCard() } catch (_: Throwable) {}
      val c = code.get()
      // Only an explicit "not supported" / "param error" proves absence. A
      // timeout, a real card, or no callback at all all mean the reader armed.
      val supported = c != ERR_NOT_SUPPORTED && c != ERR_PARAMS
      mapOf("supported" to supported, "code" to c, "message" to message.get())
    } catch (e: Throwable) {
      try { rc.cancelCheckCard() } catch (_: Throwable) {}
      Log.w(TAG, "probe $mode threw", e)
      mapOf("supported" to true, "message" to (e.message ?: "probe threw"))
    }
  }

  private fun cardTypeFor(mode: String): Int? = when (mode) {
    "nfc" -> AidlConstants.CardType.NFC.value
    "magnetic" -> AidlConstants.CardType.MAGNETIC.value
    "ic" -> AidlConstants.CardType.IC.value
    else -> null
  }
```

Extend the companion object:

```kotlin
  companion object {
    private const val TAG = "SunmiCardReader"
    private const val CONNECT_TIMEOUT_MS = 8_000L
    /** How long a single probe waits for the service to answer. */
    private const val PROBE_WINDOW_MS = 1_500L
    /** Sentinel meaning "no callback fired" — treated as supported. */
    private const val PROBE_NO_RESULT = Int.MIN_VALUE
    /** AidlErrorCode.INVOKING_NOT_SUPPORT */
    private const val ERR_NOT_SUPPORTED = -20000
    /** AidlErrorCode.INVOKING_ERROR_PARAMS */
    private const val ERR_PARAMS = -20003
  }
```

Also refactor `startScan` to use `cardTypeFor` instead of its inline `if` chain, so the two paths cannot drift:

```kotlin
    var cardType = 0
    for (mode in modes) cardTypeFor(mode)?.let { cardType = cardType or it }
    if (cardType == 0) return
```

- [ ] **Step 6: Declare the new functions in TypeScript**

In `modules/sunmi-card-reader/index.ts`, add the types and declarations:

```ts
/** Device and reader identity, for the diagnostics screen. Every field is
 *  optional: a device that cannot answer must still produce a usable report. */
export type ReaderDiagnostics = {
  /** android.os.Build.MODEL */
  buildModel?: string;
  /** SysParam DEVICE_MODEL, as the pay service reports it. */
  payDeviceModel?: string;
  /** SysParam CARD_HW. Collected only — the format is undocumented. */
  cardHw?: string;
  /** SysParam NFC */
  nfcConfig?: string;
  /** SysParam MSR_VERSION */
  msrVersion?: string;
  /** SysParam MSR2_FW_VER */
  msr2FwVersion?: string;
  payLibVersion?: string;
  matchedServiceVersion?: string;
  /** Read failures keyed by field, so blank is distinguishable from failed. */
  errors?: Record<string, string>;
};

export type ProbeResult = {
  supported: boolean;
  /** Sunmi error code that decided the verdict, when one was returned. */
  code?: number;
  message?: string;
};
```

Add to the `declare class` body:

```ts
  /** Device/reader identity for diagnostics. Never rejects. */
  getDiagnostics(): Promise<ReaderDiagnostics>;
  /** Classify each mode as supported or not by briefly arming the reader. */
  probeModes(modes: CardMode[]): Promise<Partial<Record<CardMode, ProbeResult>>>;
```

And the exported wrappers:

```ts
export function getDiagnostics(): Promise<ReaderDiagnostics> {
  return native.getDiagnostics();
}

export function probeModes(
  modes: CardMode[],
): Promise<Partial<Record<CardMode, ProbeResult>>> {
  return native.probeModes(modes);
}
```

- [ ] **Step 7: Verify it compiles and typechecks**

Run: `npm run typecheck`
Expected: no errors.

Run: `npx expo run:android --no-bundler`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 8: Commit**

```bash
git add modules/sunmi-card-reader
git commit -m "feat(card-reader): add getDiagnostics and probeModes to the native module"
```

---

### Task 4: Capability store

**Files:**
- Create: `src/utils/deviceKey.ts`
- Create: `src/store/cardCapabilities.ts`
- Create: `src/store/__tests__/cardCapabilities.test.ts`
- Modify: `jest-setup.ts`

**Interfaces:**
- Consumes: `CardMode`, `ProbeResult`, `ReaderDiagnostics` from Task 3.
- Produces:
  - `DEVICE_KEY: string` from `@/utils/deviceKey`
  - `CARD_MODES: readonly CardMode[]` = `["nfc", "magnetic", "ic"]`
  - `UNSUPPORTED_ERROR_CODES: readonly number[]` = `[-20000, -20003]`
  - `type ModeSupport = "unknown" | "supported" | "unsupported"`
  - `useCardCapabilityStore` with state `{ deviceKey, probed, readerAvailable, modes, lastError, diagnostics }` and actions `markSupported`, `markUnsupported`, `applyProbe`, `setProbed`, `setDiagnostics`, `setReaderAvailable`, `resetLearned`

- [ ] **Step 1: Register the AsyncStorage mock**

Persisted zustand stores need AsyncStorage in tests. Replace `jest-setup.ts` with:

```ts
// Global test setup. `@testing-library/react-native` (v12.4+) ships its own
// Jest matchers, so nothing extra is required there — this file is the single
// place to register mocks as the test suite grows.

// Persisted zustand stores (merchant, country-settings, card-capabilities) read
// AsyncStorage at import time; the official mock keeps that in-memory.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

export {};
```

- [ ] **Step 2: Write the failing test**

Create `src/store/__tests__/cardCapabilities.test.ts`:

```ts
import {
  CARD_MODES,
  UNSUPPORTED_ERROR_CODES,
  useCardCapabilityStore,
} from "../cardCapabilities";

// The store imports DEVICE_KEY from a tiny module so tests can pin it without
// dragging expo-device into the test environment.
jest.mock("@/utils/deviceKey", () => ({ DEVICE_KEY: "test/device" }));

const reset = () =>
  useCardCapabilityStore.setState({
    deviceKey: "test/device",
    probed: false,
    readerAvailable: null,
    modes: { nfc: "unknown", magnetic: "unknown", ic: "unknown" },
    lastError: { nfc: null, magnetic: null, ic: null },
    diagnostics: null,
  });

describe("cardCapabilities store", () => {
  beforeEach(reset);

  it("lists the three modes in display order", () => {
    expect(CARD_MODES).toEqual(["nfc", "magnetic", "ic"]);
  });

  it("treats only -20000 and -20003 as proof of absence", () => {
    expect(UNSUPPORTED_ERROR_CODES).toEqual([-20000, -20003]);
  });

  it("starts every mode unknown", () => {
    const { modes } = useCardCapabilityStore.getState();
    expect(modes).toEqual({ nfc: "unknown", magnetic: "unknown", ic: "unknown" });
  });

  it("demotes a mode and records the error", () => {
    useCardCapabilityStore.getState().markUnsupported("magnetic", -20003, "Param error");
    const s = useCardCapabilityStore.getState();
    expect(s.modes.magnetic).toBe("unsupported");
    expect(s.lastError.magnetic).toEqual({ code: -20003, message: "Param error" });
    expect(s.modes.nfc).toBe("unknown");
  });

  it("promotes a mode and clears its error", () => {
    useCardCapabilityStore.getState().markUnsupported("nfc", -20003, "Param error");
    useCardCapabilityStore.getState().markSupported("nfc");
    const s = useCardCapabilityStore.getState();
    expect(s.modes.nfc).toBe("supported");
    expect(s.lastError.nfc).toBeNull();
  });

  it("applies probe results across modes", () => {
    useCardCapabilityStore.getState().applyProbe({
      nfc: { supported: true },
      magnetic: { supported: false, code: -20003, message: "Param error" },
    });
    const s = useCardCapabilityStore.getState();
    expect(s.modes.nfc).toBe("supported");
    expect(s.modes.magnetic).toBe("unsupported");
    expect(s.lastError.magnetic).toEqual({ code: -20003, message: "Param error" });
    // Modes absent from the probe are left alone.
    expect(s.modes.ic).toBe("unknown");
  });

  it("records a probe result with no code as an error-free verdict", () => {
    useCardCapabilityStore.getState().applyProbe({ ic: { supported: false } });
    expect(useCardCapabilityStore.getState().lastError.ic).toBeNull();
  });

  it("resetLearned clears verdicts, errors, the probed flag and reader availability", () => {
    const s = useCardCapabilityStore.getState();
    s.markUnsupported("magnetic", -20003);
    s.setProbed(true);
    s.setReaderAvailable(false);

    useCardCapabilityStore.getState().resetLearned();

    const after = useCardCapabilityStore.getState();
    expect(after.modes).toEqual({ nfc: "unknown", magnetic: "unknown", ic: "unknown" });
    expect(after.lastError).toEqual({ nfc: null, magnetic: null, ic: null });
    expect(after.probed).toBe(false);
    expect(after.readerAvailable).toBeNull();
  });

  it("keeps the device key when resetting learned state", () => {
    useCardCapabilityStore.getState().resetLearned();
    expect(useCardCapabilityStore.getState().deviceKey).toBe("test/device");
  });

  it("stores diagnostics verbatim", () => {
    useCardCapabilityStore.getState().setDiagnostics({ buildModel: "V3-MIX", cardHw: "0x05" });
    expect(useCardCapabilityStore.getState().diagnostics).toEqual({
      buildModel: "V3-MIX",
      cardHw: "0x05",
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest src/store/__tests__/cardCapabilities.test.ts`
Expected: FAIL — `Cannot find module '../cardCapabilities'`.

- [ ] **Step 4: Create the device key module**

Create `src/utils/deviceKey.ts`:

```ts
import * as Device from "expo-device";

/**
 * Coarse hardware identity. Learned card-reader verdicts are only valid for the
 * hardware that produced them, so a persisted store restored onto a different
 * model must discard them rather than teach one device another's limitations.
 *
 * Deliberately not a unique device id: two identical P2s share capabilities, and
 * we want a replacement unit to inherit a known-good verdict.
 */
export const DEVICE_KEY = `${Device.manufacturer ?? "?"}/${Device.modelName ?? "?"}`;
```

- [ ] **Step 5: Create the store**

Create `src/store/cardCapabilities.ts`:

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { DEVICE_KEY } from "@/utils/deviceKey";
import type {
  CardMode,
  ProbeResult,
  ReaderDiagnostics,
} from "../../modules/sunmi-card-reader";

/** Capture methods in the order they are offered to the user. */
export const CARD_MODES: readonly CardMode[] = ["nfc", "magnetic", "ic"];

/**
 * The only Sunmi error codes that prove a reader is absent, from
 * AidlErrorCode in PayLib 2.0.42: INVOKING_NOT_SUPPORT and
 * INVOKING_ERROR_PARAMS. Every other failure (timeouts, track parity, fallback)
 * describes a bad read, not missing hardware, and must never demote a method.
 */
export const UNSUPPORTED_ERROR_CODES: readonly number[] = [-20000, -20003];

export type ModeSupport = "unknown" | "supported" | "unsupported";
export type LastError = { code: number; message?: string } | null;

type ModeMap<T> = Record<CardMode, T>;

export interface CardCapabilityStore {
  /** Hardware this state was learned on; a mismatch discards it. */
  deviceKey: string | null;
  /** True once the one-time probe has completed on this device. */
  probed: boolean;
  /** False when the reader could not be bound at all. Null until known. */
  readerAvailable: boolean | null;
  modes: ModeMap<ModeSupport>;
  lastError: ModeMap<LastError>;
  diagnostics: ReaderDiagnostics | null;

  markSupported: (mode: CardMode) => void;
  markUnsupported: (mode: CardMode, code: number, message?: string) => void;
  applyProbe: (results: Partial<Record<CardMode, ProbeResult>>) => void;
  setProbed: (probed: boolean) => void;
  setDiagnostics: (diagnostics: ReaderDiagnostics) => void;
  setReaderAvailable: (available: boolean) => void;
  /** Forget everything learned so the next open re-probes from scratch. */
  resetLearned: () => void;
}

const freshModes = (): ModeMap<ModeSupport> => ({
  nfc: "unknown",
  magnetic: "unknown",
  ic: "unknown",
});

const freshErrors = (): ModeMap<LastError> => ({
  nfc: null,
  magnetic: null,
  ic: null,
});

const useCardCapabilityStore = create<CardCapabilityStore>()(
  persist(
    (set) => ({
      deviceKey: DEVICE_KEY,
      probed: false,
      readerAvailable: null,
      modes: freshModes(),
      lastError: freshErrors(),
      diagnostics: null,

      markSupported: (mode) =>
        set((state) => ({
          modes: { ...state.modes, [mode]: "supported" },
          lastError: { ...state.lastError, [mode]: null },
        })),

      markUnsupported: (mode, code, message) =>
        set((state) => ({
          modes: { ...state.modes, [mode]: "unsupported" },
          lastError: { ...state.lastError, [mode]: { code, message } },
        })),

      applyProbe: (results) =>
        set((state) => {
          const modes = { ...state.modes };
          const lastError = { ...state.lastError };
          for (const mode of CARD_MODES) {
            const result = results[mode];
            if (!result) continue;
            modes[mode] = result.supported ? "supported" : "unsupported";
            lastError[mode] =
              !result.supported && result.code != null
                ? { code: result.code, message: result.message }
                : null;
          }
          return { modes, lastError };
        }),

      setProbed: (probed) => set({ probed }),
      setDiagnostics: (diagnostics) => set({ diagnostics }),
      setReaderAvailable: (readerAvailable) => set({ readerAvailable }),

      resetLearned: () =>
        set({
          probed: false,
          readerAvailable: null,
          modes: freshModes(),
          lastError: freshErrors(),
        }),
    }),
    {
      name: "card-capabilities",
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      partialize: (state) => ({
        deviceKey: state.deviceKey,
        probed: state.probed,
        readerAvailable: state.readerAvailable,
        modes: state.modes,
        lastError: state.lastError,
        diagnostics: state.diagnostics,
      }),
      // Verdicts learned on other hardware are worse than no verdicts: a stale
      // "unsupported" would disable the button, and a disabled button can never
      // reach the sheet that would re-probe it. Discard on any key mismatch.
      onRehydrateStorage: () => (state) => {
        if (!state || state.deviceKey === DEVICE_KEY) return;
        useCardCapabilityStore.setState({
          deviceKey: DEVICE_KEY,
          probed: false,
          readerAvailable: null,
          modes: freshModes(),
          lastError: freshErrors(),
          diagnostics: null,
        });
      },
    },
  ),
);

export { useCardCapabilityStore };
export default useCardCapabilityStore;
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest src/store/__tests__/cardCapabilities.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 7: Verify nothing else broke**

Run: `npm test`
Expected: all suites pass — the new AsyncStorage mock must not disturb existing tests.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/store/cardCapabilities.ts src/store/__tests__ src/utils/deviceKey.ts jest-setup.ts
git commit -m "feat(card-reader): add persisted per-device capability store"
```

---

### Task 5: Capability resolution hook

**Files:**
- Create: `src/hooks/useCardCapabilities.tsx`
- Create: `src/hooks/__tests__/useCardCapabilities.test.tsx`

**Interfaces:**
- Consumes: `useCardCapabilityStore`, `CARD_MODES` (Task 4); `getDiagnostics`, `probeModes` (Task 3).
- Produces: `useCardCapabilities(): { availableModes: CardMode[]; captureUnavailable: boolean; probing: boolean; ensureProbed: () => Promise<void> }`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/__tests__/useCardCapabilities.test.tsx`:

```tsx
import { act, renderHook, waitFor } from "@testing-library/react-native";

import useCardCapabilityStore from "@/store/cardCapabilities";
import useCardCapabilities from "../useCardCapabilities";

jest.mock("@/utils/deviceKey", () => ({ DEVICE_KEY: "test/device" }));

const getDiagnostics = jest.fn();
const probeModes = jest.fn();

// The hook require()s the native module in a try/catch, exactly like
// useCardReader, so it degrades where the module is not linked.
jest.mock(
  "../../../modules/sunmi-card-reader",
  () => ({
    getDiagnostics: (...a: unknown[]) => getDiagnostics(...a),
    probeModes: (...a: unknown[]) => probeModes(...a),
  }),
  { virtual: true },
);

const reset = () =>
  useCardCapabilityStore.setState({
    deviceKey: "test/device",
    probed: false,
    readerAvailable: null,
    modes: { nfc: "unknown", magnetic: "unknown", ic: "unknown" },
    lastError: { nfc: null, magnetic: null, ic: null },
    diagnostics: null,
  });

describe("useCardCapabilities", () => {
  beforeEach(() => {
    reset();
    getDiagnostics.mockReset().mockResolvedValue({ buildModel: "P2" });
    probeModes.mockReset().mockResolvedValue({});
  });

  it("offers every mode while nothing is known", () => {
    const { result } = renderHook(() => useCardCapabilities());
    expect(result.current.availableModes).toEqual(["nfc", "magnetic", "ic"]);
    expect(result.current.captureUnavailable).toBe(false);
  });

  it("hides only the modes proven unsupported", () => {
    act(() => {
      useCardCapabilityStore.getState().markUnsupported("magnetic", -20003);
      useCardCapabilityStore.getState().markUnsupported("ic", -20003);
    });
    const { result } = renderHook(() => useCardCapabilities());
    expect(result.current.availableModes).toEqual(["nfc"]);
    expect(result.current.captureUnavailable).toBe(false);
  });

  it("reports capture unavailable once every mode is unsupported", () => {
    act(() => {
      const s = useCardCapabilityStore.getState();
      s.markUnsupported("nfc", -20003);
      s.markUnsupported("magnetic", -20003);
      s.markUnsupported("ic", -20003);
    });
    const { result } = renderHook(() => useCardCapabilities());
    expect(result.current.availableModes).toEqual([]);
    expect(result.current.captureUnavailable).toBe(true);
  });

  it("reports capture unavailable when the reader could not be bound", () => {
    act(() => useCardCapabilityStore.getState().setReaderAvailable(false));
    const { result } = renderHook(() => useCardCapabilities());
    expect(result.current.captureUnavailable).toBe(true);
  });

  it("probes only the unknown modes and stores the results", async () => {
    act(() => useCardCapabilityStore.getState().markSupported("nfc"));
    probeModes.mockResolvedValue({
      magnetic: { supported: false, code: -20003, message: "Param error" },
      ic: { supported: true },
    });

    const { result } = renderHook(() => useCardCapabilities());
    await act(async () => {
      await result.current.ensureProbed();
    });

    expect(probeModes).toHaveBeenCalledWith(["magnetic", "ic"]);
    const s = useCardCapabilityStore.getState();
    expect(s.modes).toEqual({ nfc: "supported", magnetic: "unsupported", ic: "supported" });
    expect(s.probed).toBe(true);
    expect(s.diagnostics).toEqual({ buildModel: "P2" });
  });

  it("does not probe twice", async () => {
    const { result } = renderHook(() => useCardCapabilities());
    await act(async () => {
      await result.current.ensureProbed();
    });
    await act(async () => {
      await result.current.ensureProbed();
    });
    expect(probeModes).toHaveBeenCalledTimes(1);
  });

  it("leaves modes probeable when the probe throws", async () => {
    probeModes.mockRejectedValue(new Error("binder died"));
    const { result } = renderHook(() => useCardCapabilities());
    await act(async () => {
      await result.current.ensureProbed();
    });

    const s = useCardCapabilityStore.getState();
    expect(s.probed).toBe(false);
    expect(s.modes.magnetic).toBe("unknown");
    await waitFor(() => expect(result.current.probing).toBe(false));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/hooks/__tests__/useCardCapabilities.test.tsx`
Expected: FAIL — `Cannot find module '../useCardCapabilities'`.

- [ ] **Step 3: Create the hook**

Create `src/hooks/useCardCapabilities.tsx`:

```tsx
import React from "react";

import useCardCapabilityStore, { CARD_MODES } from "@/store/cardCapabilities";
import type { CardMode } from "../../modules/sunmi-card-reader";

// Lazy-load the native module so the app doesn't crash where it's unavailable
// (Expo Go, or a build without the module). Mirrors useCardReader's approach.
let CardReader: typeof import("../../modules/sunmi-card-reader") | null = null;
try {
  CardReader = require("../../modules/sunmi-card-reader");
} catch {
  // Native module not present — probing is skipped and every mode stays offered.
}

export type UseCardCapabilities = {
  /** Modes not proven unsupported, in display order. */
  availableModes: CardMode[];
  /** True only on positive evidence: no reader, or every mode demoted. */
  captureUnavailable: boolean;
  /** True while the one-time probe is in flight. */
  probing: boolean;
  /** Probe the still-unknown modes once per device. No-op afterwards. */
  ensureProbed: () => Promise<void>;
};

/**
 * Reads the persisted capability verdicts. Performs **no** native calls on
 * render, so an always-mounted consumer (RefundCardButton) can ask "can this
 * device capture at all?" without binding the reader.
 */
function useCardCapabilities(): UseCardCapabilities {
  const modes = useCardCapabilityStore((s) => s.modes);
  const readerAvailable = useCardCapabilityStore((s) => s.readerAvailable);
  const [probing, setProbing] = React.useState(false);
  // Guards against two sheets racing into the probe before `probed` is written.
  const inFlight = React.useRef(false);

  const availableModes = React.useMemo(
    () => CARD_MODES.filter((mode) => modes[mode] !== "unsupported"),
    [modes],
  );

  const captureUnavailable = readerAvailable === false || availableModes.length === 0;

  const ensureProbed = React.useCallback(async () => {
    if (!CardReader || inFlight.current) return;
    const store = useCardCapabilityStore.getState();
    if (store.probed) return;

    const unknown = CARD_MODES.filter((mode) => store.modes[mode] === "unknown");
    inFlight.current = true;
    setProbing(true);
    try {
      // Sequential, not concurrent: both calls cross the same binder, and
      // checkCard is exclusive.
      const diagnostics = await CardReader.getDiagnostics();
      store.setDiagnostics(diagnostics);
      if (unknown.length > 0) {
        const results = await CardReader.probeModes([...unknown]);
        useCardCapabilityStore.getState().applyProbe(results);
      }
      useCardCapabilityStore.getState().setProbed(true);
    } catch (e) {
      // Leave `probed` false so a later open retries. An unreadable signal must
      // never narrow the offered methods.
      console.log("[useCardCapabilities] probe failed:", e);
    } finally {
      inFlight.current = false;
      setProbing(false);
    }
  }, []);

  return { availableModes, captureUnavailable, probing, ensureProbed };
}

export default useCardCapabilities;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/hooks/__tests__/useCardCapabilities.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCardCapabilities.tsx src/hooks/__tests__/useCardCapabilities.test.tsx
git commit -m "feat(card-reader): resolve available capture methods from the capability store"
```

---

### Task 6: Expose the error code from useCardReader

Demotion needs the numeric Sunmi code, but the hook currently folds it into a display string (`setError(event.message || \`Error ${event.code}\`)`), losing it.

**Files:**
- Modify: `src/hooks/useCardReader.tsx`
- Create: `src/hooks/__tests__/useCardReader.test.tsx`

**Interfaces:**
- Consumes: `CardErrorEvent.raw` (Task 2).
- Produces: `UseCardReader` gains `errorCode: number | null`.

- [ ] **Step 1: Write the failing test**

Create `src/hooks/__tests__/useCardReader.test.tsx`:

```tsx
import { act, renderHook, waitFor } from "@testing-library/react-native";

import useCardReader from "../useCardReader";

type ErrorListener = (e: { code: number; message?: string }) => void;

let errorListener: ErrorListener | null = null;

const initialize = jest.fn();
const startScan = jest.fn();
const cancelScan = jest.fn();

jest.mock(
  "../../../modules/sunmi-card-reader",
  () => ({
    initialize: () => initialize(),
    startScan: (...a: unknown[]) => startScan(...a),
    cancelScan: () => cancelScan(),
    transmitApdu: jest.fn(),
    addCardReadListener: () => ({ remove: jest.fn() }),
    addErrorListener: (fn: ErrorListener) => {
      errorListener = fn;
      return { remove: jest.fn() };
    },
  }),
  { virtual: true },
);

describe("useCardReader", () => {
  beforeEach(() => {
    errorListener = null;
    initialize.mockReset().mockResolvedValue(true);
    startScan.mockReset().mockResolvedValue(undefined);
    cancelScan.mockReset().mockResolvedValue(undefined);
  });

  it("exposes the numeric error code alongside the message", async () => {
    const { result } = renderHook(() => useCardReader());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => result.current.startScan(["magnetic"]));
    act(() => errorListener?.({ code: -20003, message: "Param error" }));

    expect(result.current.errorCode).toBe(-20003);
    expect(result.current.error).toBe("Param error");
  });

  it("clears the error code when a new scan is armed", async () => {
    const { result } = renderHook(() => useCardReader());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => result.current.startScan(["magnetic"]));
    act(() => errorListener?.({ code: -20003, message: "Param error" }));
    expect(result.current.errorCode).toBe(-20003);

    act(() => result.current.startScan(["nfc"]));
    expect(result.current.errorCode).toBeNull();
  });

  it("clears the error code on reset", async () => {
    const { result } = renderHook(() => useCardReader());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => result.current.startScan(["magnetic"]));
    act(() => errorListener?.({ code: -30005, message: "Timeout" }));
    act(() => result.current.reset());

    expect(result.current.errorCode).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/hooks/__tests__/useCardReader.test.tsx`
Expected: FAIL — `result.current.errorCode` is `undefined`, expected `-20003`.

- [ ] **Step 3: Add the field**

In `src/hooks/useCardReader.tsx`:

Add to the `UseCardReader` type, directly under `error`:

```ts
  /**
   * Raw Sunmi error code for the current error, or null. Callers need this to
   * distinguish "this device has no such reader" (-20000 / -20003) from an
   * ordinary bad read; the `error` string alone cannot carry that.
   */
  errorCode: number | null;
```

Add the state next to `error`:

```ts
  const [errorCode, setErrorCode] = React.useState<number | null>(null);
```

In `arm()`, alongside `setError(null)`, add `setErrorCode(null);`.

In the card-read listener, alongside `setError(null)`, add `setErrorCode(null);`.

In the error listener, replace the body with:

```ts
    const errorSub = mod.addErrorListener((event: CardErrorEvent) => {
      if (!mounted) return;
      setError(event.message || `Error ${event.code}`);
      setErrorCode(event.code);
      if (event.raw) console.log("[useCardReader] error bundle:", event.raw);
      setStatus((prev) => (prev === "scanning" ? "error" : prev));
    });
```

In `cancel()` and `reset()`, add `setErrorCode(null);` next to the existing resets (`cancel` currently does not clear `error`; add `setError(null)` there too so the two agree).

Add `errorCode` to the returned object.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/hooks/__tests__/useCardReader.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCardReader.tsx src/hooks/__tests__/useCardReader.test.tsx
git commit -m "feat(card-reader): expose the numeric Sunmi error code from useCardReader"
```

---

### Task 7: Disabled RefundCardButton

**Files:**
- Modify: `src/screens/(auth)/Sale/_components/RefundCardButton.tsx`
- Modify: `src/screens/(auth)/Sale/_components/__tests__/RefundCardButton.test.tsx`

**Interfaces:**
- Consumes: `useCardCapabilities` (Task 5); `MobileApp.CardReader.CaptureUnavailable` (Task 1).
- Produces: no new exports. The component self-disables, so neither sale screen changes.

- [ ] **Step 1: Write the failing test**

Add to `src/screens/(auth)/Sale/_components/__tests__/RefundCardButton.test.tsx`, after the existing `jest.mock` for the localization provider:

```tsx
// Capability lookup is a pure store read in production; pin it per test.
const captureUnavailable = { value: false };
jest.mock("@/hooks/useCardCapabilities", () => ({
  __esModule: true,
  default: () => ({
    availableModes: captureUnavailable.value ? [] : ["nfc", "magnetic", "ic"],
    captureUnavailable: captureUnavailable.value,
    probing: false,
    ensureProbed: jest.fn(),
  }),
}));
```

Set the default in the existing `beforeEach`:

```tsx
  beforeEach(() => {
    captureUnavailable.value = false;
    jest.useFakeTimers();
  });
```

Then add these cases inside the `describe("RefundCardButton")` block:

```tsx
  it("renders an unavailable label when the device cannot capture", () => {
    captureUnavailable.value = true;
    const { getByText, queryByTestId } = render(
      <View>
        <RefundCardButton payoutCard={null} onPress={jest.fn()} />
      </View>,
    );

    expect(getByText("MobileApp.CardReader.CaptureUnavailable")).toBeTruthy();
    expect(queryByTestId("refund-card-button")).toBeNull();
    expect(queryByTestId("refund-card-unavailable")).toBeTruthy();
  });

  it("cannot be pressed when the device cannot capture", () => {
    captureUnavailable.value = true;
    const onPress = jest.fn();
    const { queryByTestId } = render(
      <View>
        <RefundCardButton payoutCard={null} onPress={onPress} />
      </View>,
    );

    expect(queryByTestId("refund-card-button")).toBeNull();
    expect(onPress).not.toHaveBeenCalled();
  });

  it("hides the clear button when the device cannot capture", () => {
    captureUnavailable.value = true;
    const { queryByTestId } = render(
      <View>
        <RefundCardButton payoutCard={card} onPress={jest.fn()} onClear={jest.fn()} />
      </View>,
    );

    expect(queryByTestId("refund-card-clear")).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/screens/'(auth)'/Sale/_components/__tests__/RefundCardButton.test.tsx`
Expected: FAIL — `MobileApp.CardReader.CaptureUnavailable` is not rendered.

- [ ] **Step 3: Implement the disabled state**

In `RefundCardButton.tsx`, add the import:

```tsx
import useCardCapabilities from "@/hooks/useCardCapabilities";
import { View } from "react-native";
```

(extend the existing `react-native` import to include `View`).

Inside the component, immediately after `const { t } = useLocalization();`:

```tsx
  const { captureUnavailable } = useCardCapabilities();
```

Then, before the existing `capturedCard` computation, add the early return:

```tsx
  // A device with no usable reader gets an inert affordance rather than a
  // button that opens a sheet with nothing in it. Rendered as a plain View so
  // there is no pressable to disable — and therefore no way to mis-fire.
  if (captureUnavailable) {
    return (
      <View
        testID="refund-card-unavailable"
        className={cn(
          "flex-row items-center justify-center gap-2 px-4 py-4 rounded-xl border border-gray-300 bg-gray-100",
          className,
        )}
      >
        <Ionicons name="card-outline" size={20} color="#9ca3af" />
        <Text numberOfLines={1} className="text-sm font-semibold text-gray-400">
          {t("MobileApp.CardReader.CaptureUnavailable")}
        </Text>
      </View>
    );
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/screens/'(auth)'/Sale/_components/__tests__/RefundCardButton.test.tsx`
Expected: PASS — the three new tests plus all seven pre-existing ones.

- [ ] **Step 5: Commit**

```bash
git add "src/screens/(auth)/Sale/_components/RefundCardButton.tsx" "src/screens/(auth)/Sale/_components/__tests__/RefundCardButton.test.tsx"
git commit -m "feat(sale): disable the refund card button when the device has no reader"
```

---

### Task 8: Capability-driven scan sheet

**Files:**
- Modify: `src/screens/(auth)/Sale/_components/CardWaitAnimation.tsx`
- Modify: `src/screens/(auth)/Sale/_components/RefundCardScanModal.tsx`
- Create: `src/screens/(auth)/Sale/_components/__tests__/RefundCardScanModal.test.tsx`

**Interfaces:**
- Consumes: `useCardCapabilities` (Task 5), `useCardReader().errorCode` (Task 6), `useCardCapabilityStore` + `UNSUPPORTED_ERROR_CODES` (Task 4), the `CardReader.*` keys (Task 1).
- Produces: no new exports.

- [ ] **Step 1: Add an insert animation**

`CardWaitAnimation` currently falls through to the swipe animation for anything that is not `nfc`, so `ic` would show a card sliding sideways. In `CardWaitAnimation.tsx`, replace the exported component:

```tsx
/**
 * "Waiting for card" animation, tailored to the armed method:
 *  - nfc      → concentric ripples pulsing out of a card core (tap-to-read).
 *  - magnetic → a card sliding through a reader slot (swipe direction).
 *  - ic       → a card easing down into a slot and holding (insert-and-leave).
 * Pure reanimated (UI thread); no external assets.
 */
export function CardWaitAnimation({ mode }: { mode: CardMode }) {
  if (mode === "nfc") return <NfcWaiting />;
  if (mode === "ic") return <InsertWaiting />;
  return <SwipeWaiting />;
}
```

Add the component next to `SwipeWaiting`:

```tsx
function InsertWaiting() {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
    return () => cancelAnimation(progress);
  }, [progress]);

  // Card descends into the slot, then holds there — insert-and-leave, unlike
  // the swipe pass-through.
  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(progress.value, [0, 0.55, 1], [-40, 6, 6]) },
    ],
    opacity: interpolate(progress.value, [0, 0.15, 0.9, 1], [0, 1, 1, 0]),
  }));

  return (
    <View style={styles.box}>
      <View style={styles.slot} />
      <Animated.View style={[styles.swipeCard, cardStyle]}>
        <View style={styles.chip} />
      </Animated.View>
    </View>
  );
}
```

Add to the `StyleSheet.create` block:

```tsx
  chip: {
    width: 14,
    height: 11,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.9)",
  },
```

- [ ] **Step 2: Write the failing test**

Create `src/screens/(auth)/Sale/_components/__tests__/RefundCardScanModal.test.tsx`:

```tsx
import { act, render, waitFor } from "@testing-library/react-native";
import React from "react";

import useCardCapabilityStore from "@/store/cardCapabilities";
import { RefundCardScanModal } from "../RefundCardScanModal";

jest.mock("@/utils/deviceKey", () => ({ DEVICE_KEY: "test/device" }));

jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({ t: (key: string) => key }),
}));

// Reanimated is not worth exercising here; the animation is decorative.
jest.mock("../CardWaitAnimation", () => ({
  CardWaitAnimation: () => null,
  default: () => null,
}));

const ensureProbed = jest.fn().mockResolvedValue(undefined);
let available: string[] = ["nfc", "magnetic", "ic"];
let unavailable = false;

jest.mock("@/hooks/useCardCapabilities", () => ({
  __esModule: true,
  default: () => ({
    availableModes: available,
    captureUnavailable: unavailable,
    probing: false,
    ensureProbed,
  }),
}));

const reader = {
  status: "ready" as string,
  card: null as unknown,
  error: null as string | null,
  errorCode: null as number | null,
  emptyReads: 0,
  isSupported: true,
  startScan: jest.fn(),
  cancel: jest.fn(),
  reset: jest.fn(),
};

jest.mock("@/hooks/useCardReader", () => ({
  __esModule: true,
  default: () => reader,
}));

const resetStore = () =>
  useCardCapabilityStore.setState({
    deviceKey: "test/device",
    probed: false,
    readerAvailable: null,
    modes: { nfc: "unknown", magnetic: "unknown", ic: "unknown" },
    lastError: { nfc: null, magnetic: null, ic: null },
    diagnostics: null,
  });

describe("RefundCardScanModal", () => {
  beforeEach(() => {
    resetStore();
    available = ["nfc", "magnetic", "ic"];
    unavailable = false;
    reader.status = "ready";
    reader.card = null;
    reader.error = null;
    reader.errorCode = null;
    reader.startScan.mockReset();
    reader.cancel.mockReset();
    ensureProbed.mockClear();
  });

  const open = () =>
    render(
      <RefundCardScanModal visible onClose={jest.fn()} onCaptured={jest.fn()} />,
    );

  it("lists only the available methods", () => {
    available = ["nfc", "ic"];
    const { getByText, queryByText } = open();

    expect(getByText("MobileApp.CardReader.Nfc")).toBeTruthy();
    expect(getByText("MobileApp.CardReader.Insert")).toBeTruthy();
    expect(queryByText("MobileApp.CardReader.Swipe")).toBeNull();
  });

  it("skips the chooser and arms the only available method", async () => {
    available = ["nfc"];
    const { queryByText } = open();

    await waitFor(() => expect(reader.startScan).toHaveBeenCalledWith(["nfc"]));
    expect(queryByText("MobileApp.CustomerScreen.ChooseMethod")).toBeNull();
    expect(queryByText("MobileApp.CustomerScreen.ChooseAnotherMethod")).toBeNull();
  });

  it("shows the unavailable state when no method is left", () => {
    available = [];
    unavailable = true;
    const { getByText } = open();

    expect(getByText("MobileApp.CardReader.CaptureUnavailable")).toBeTruthy();
  });

  it("runs the one-time probe on open", async () => {
    open();
    await waitFor(() => expect(ensureProbed).toHaveBeenCalled());
  });

  it("demotes a method that reports a param error", async () => {
    available = ["nfc"];
    const view = open();
    await waitFor(() => expect(reader.startScan).toHaveBeenCalledWith(["nfc"]));

    // The mocked hook returns a stable object, so mutating it does not by
    // itself schedule a render — drive one explicitly.
    reader.status = "error";
    reader.errorCode = -20003;
    reader.error = "Param error";
    await act(async () => {
      view.rerender(
        <RefundCardScanModal visible onClose={jest.fn()} onCaptured={jest.fn()} />,
      );
    });

    await waitFor(() =>
      expect(useCardCapabilityStore.getState().modes.nfc).toBe("unsupported"),
    );
  });

  it("does not demote on an ordinary read failure", async () => {
    available = ["nfc"];
    const view = open();
    await waitFor(() => expect(reader.startScan).toHaveBeenCalledWith(["nfc"]));

    reader.status = "error";
    reader.errorCode = -30005;
    reader.error = "Timeout";
    await act(async () => {
      view.rerender(
        <RefundCardScanModal visible onClose={jest.fn()} onCaptured={jest.fn()} />,
      );
    });

    expect(useCardCapabilityStore.getState().modes.nfc).toBe("unknown");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest src/screens/'(auth)'/Sale/_components/__tests__/RefundCardScanModal.test.tsx`
Expected: FAIL — the swipe method is still rendered, and no probe runs.

- [ ] **Step 4: Rewrite the sheet**

Replace the body of `RefundCardScanSheet` in `RefundCardScanModal.tsx` with the following, and update the imports at the top of the file to add:

```tsx
import useCardCapabilities from "@/hooks/useCardCapabilities";
import useCardCapabilityStore, {
  UNSUPPORTED_ERROR_CODES,
} from "@/store/cardCapabilities";
import { IoniconsTypes } from "@/components/Ionicons";
```

The sheet:

```tsx
/** The union `t()` accepts. Derived rather than cast away, so a typo in a key
 *  below is a compile error instead of a runtime "error: <key>" string. */
type TKey = Parameters<ReturnType<typeof useLocalization>["t"]>[0];

/** Icon and label for each capture method, in display order. */
const METHOD_META: Record<CardMode, { icon: IoniconsTypes; labelKey: TKey }> = {
  nfc: { icon: "wifi", labelKey: "MobileApp.CardReader.Nfc" },
  magnetic: { icon: "card", labelKey: "MobileApp.CardReader.Swipe" },
  ic: { icon: "hardware-chip", labelKey: "MobileApp.CardReader.Insert" },
};

const PROMPT_KEY: Record<CardMode, TKey> = {
  nfc: "MobileApp.CardReader.ScanPromptNfc",
  magnetic: "MobileApp.CustomerScreen.SwipePrompt",
  ic: "MobileApp.CardReader.ScanPromptIc",
};

function RefundCardScanSheet({
  onClose,
  onCaptured,
}: Omit<RefundCardScanModalProps, "visible">) {
  const { t } = useLocalization();
  const insets = useSafeAreaInsets();
  const { status, card, error, errorCode, startScan, cancel } = useCardReader();
  const { availableModes, captureUnavailable, probing, ensureProbed } =
    useCardCapabilities();
  const markSupported = useCardCapabilityStore((s) => s.markSupported);
  const markUnsupported = useCardCapabilityStore((s) => s.markUnsupported);
  const setReaderAvailable = useCardCapabilityStore((s) => s.setReaderAvailable);

  // null → showing the method chooser; otherwise the user's explicit choice.
  const [mode, setMode] = useState<CardMode | null>(null);
  // Set when a read completed but carried no usable card number.
  const [noNumber, setNoNumber] = useState(false);
  // Set when a method was just demoted, so the user learns why it vanished.
  const [demoted, setDemoted] = useState(false);

  // With exactly one method there is nothing to choose, so arm it directly.
  // Derived rather than stored: the available set can shrink mid-session when a
  // method is demoted, and this must follow it without a sync effect.
  const effectiveMode: CardMode | null =
    mode ?? (availableModes.length === 1 ? availableModes[0] : null);

  // This sheet is the only code path that binds the reader, so it is the only
  // place that can record whether one exists.
  useEffect(() => {
    if (status === "initializing") return;
    setReaderAvailable(status !== "unsupported");
  }, [status, setReaderAvailable]);

  // One-time capability probe for this device.
  useEffect(() => {
    if (status === "ready") void ensureProbed();
  }, [status, ensureProbed]);

  // Auto-start the chosen method once the reader is ready.
  useEffect(() => {
    if (effectiveMode && status === "ready" && !probing) startScan([effectiveMode]);
  }, [effectiveMode, status, probing, startScan]);

  // A "not supported" / "param error" is a statement about the hardware, not
  // about this read: demote the method permanently and re-resolve.
  useEffect(() => {
    if (status !== "error" || errorCode == null || !effectiveMode) return;
    if (!UNSUPPORTED_ERROR_CODES.includes(errorCode)) return;
    markUnsupported(effectiveMode, errorCode, error ?? undefined);
    setMode(null);
    setDemoted(true);
  }, [status, errorCode, effectiveMode, error, markUnsupported]);

  // Resolve each read: capture when it has a number, otherwise stop and offer
  // to retry or switch method — no silent looping on the same unreadable card.
  useEffect(() => {
    if (status !== "success" || !card) return;
    markSupported(card.mode);
    if (maskedCardNumber(card)) onCaptured(card);
    else setNoNumber(true);
  }, [status, card, onCaptured, markSupported]);

  const chooseMethod = (m: CardMode) => {
    setNoNumber(false);
    setDemoted(false);
    setMode(m);
  };

  const tryAgain = () => {
    setNoNumber(false);
    if (effectiveMode) startScan([effectiveMode]);
  };

  const backToChooser = () => {
    cancel();
    setNoNumber(false);
    setDemoted(false);
    setMode(null);
  };

  const close = () => {
    cancel();
    onClose();
  };

  const unavailable = captureUnavailable || status === "unsupported";

  return (
    <View className="flex-1 justify-end bg-black/40">
      <View
        className="bg-white rounded-t-3xl px-6 pt-5"
        style={{ paddingBottom: Math.max(insets.bottom, 24) }}
      >
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-xl font-bold text-gray-900">
            {t("MobileApp.CustomerScreen.ScanRefundCard")}
          </Text>
          <DebouncedPressable
            onPress={close}
            className="size-9 items-center justify-center rounded-full border border-gray-300"
          >
            <Ionicons name="close" size={18} color="#374151" />
          </DebouncedPressable>
        </View>

        <View className="py-4 min-h-[190px] justify-center">
          {unavailable && (
            <View className="items-center">
              <Ionicons name="warning-outline" size={48} color="#92400e" />
              <Text className="mt-3 text-base font-semibold text-yellow-800 text-center">
                {t("MobileApp.CardReader.CaptureUnavailable")}
              </Text>
              <Text className="mt-1 text-sm text-gray-500 text-center">
                {t("MobileApp.CardReader.CaptureUnavailableDesc")}
              </Text>
            </View>
          )}

          {!unavailable && probing && (
            <View className="items-center">
              <ActivityIndicator size="large" color="#6b7280" />
              <Text className="mt-3 text-base text-gray-500 text-center">
                {t("MobileApp.CardReader.CheckingReader")}
              </Text>
            </View>
          )}

          {/* Method chooser — only the methods this device actually has. */}
          {!unavailable && !probing && effectiveMode === null && (
            <View className="gap-2">
              {demoted && (
                <Text className="text-sm text-yellow-800 text-center mb-2">
                  {t("MobileApp.CardReader.MethodUnsupported")}
                </Text>
              )}
              <Text className="text-sm text-gray-500 text-center mb-4">
                {t("MobileApp.CustomerScreen.ChooseMethod")}
              </Text>
              {availableModes.map((m, index) => (
                <React.Fragment key={m}>
                  {index > 0 && <View className="h-3" />}
                  <MethodButton
                    icon={METHOD_META[m].icon}
                    label={t(METHOD_META[m].labelKey)}
                    onPress={() => chooseMethod(m)}
                  />
                </React.Fragment>
              ))}
            </View>
          )}

          {/* A method is active. "Choose another method" is only meaningful
              when there is in fact another method. */}
          {!unavailable && !probing && effectiveMode !== null && (
            <View className="items-center">
              {demoted && (
                <Text className="text-sm text-yellow-800 text-center mb-2">
                  {t("MobileApp.CardReader.MethodUnsupported")}
                </Text>
              )}
              {noNumber ? (
                <>
                  <Ionicons name="warning-outline" size={48} color="#d97706" />
                  <Text className="mt-3 text-base font-semibold text-gray-900 text-center">
                    {t("MobileApp.CustomerScreen.CardNumberNotRead")}
                  </Text>
                  <ScanAgainButton
                    label={t("MobileApp.CardReader.ScanAgain")}
                    onPress={tryAgain}
                  />
                </>
              ) : status === "initializing" ? (
                <>
                  <ActivityIndicator size="large" color="#6b7280" />
                  <Text className="mt-3 text-base text-gray-500 text-center">
                    {t("MobileApp.CardReader.Initializing")}
                  </Text>
                </>
              ) : status === "reading" ? (
                <>
                  <ActivityIndicator size="large" color="#2563eb" />
                  <Text className="mt-3 text-base font-medium text-gray-900 text-center">
                    {t("MobileApp.CardReader.ReadingCard")}
                  </Text>
                </>
              ) : status === "error" ? (
                <>
                  <Ionicons name="alert-circle" size={48} color="#dc2626" />
                  <Text className="mt-3 text-base font-semibold text-red-700 text-center">
                    {t("MobileApp.CardReader.ErrorTitle")}
                  </Text>
                  <Text className="mt-1 text-sm text-gray-500 text-center">
                    {error || t("MobileApp.CardReader.ErrorGeneric")}
                  </Text>
                  <ScanAgainButton
                    label={t("MobileApp.CardReader.ScanAgain")}
                    onPress={tryAgain}
                  />
                </>
              ) : (
                <>
                  <CardWaitAnimation mode={effectiveMode} />
                  <Text className="mt-3 text-base font-medium text-gray-900 text-center">
                    {t("MobileApp.CardReader.Scanning")}
                  </Text>
                  <Text className="mt-1 text-sm text-gray-500 text-center">
                    {t(PROMPT_KEY[effectiveMode])}
                  </Text>
                </>
              )}

              {availableModes.length > 1 && (
                <DebouncedPressable onPress={backToChooser} className="mt-6">
                  <Text className="text-sm font-semibold text-primary">
                    {t("MobileApp.CustomerScreen.ChooseAnotherMethod")}
                  </Text>
                </DebouncedPressable>
              )}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
```

Also widen `MethodButton`'s `icon` prop from `"wifi" | "card"` to `IoniconsTypes`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest src/screens/'(auth)'/Sale/_components/__tests__/RefundCardScanModal.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 6: Verify the whole suite and types**

Run: `npm test`
Expected: all suites pass.

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add "src/screens/(auth)/Sale/_components"
git commit -m "feat(sale): offer only the capture methods the device supports"
```

---

### Task 9: Diagnostics panel

This is the deliverable testers install to produce the V3 report.

**Files:**
- Modify: `src/screens/(auth)/CardReader/CardReaderScreen.tsx`

**Interfaces:**
- Consumes: `useCardCapabilityStore` (Task 4), `useCardCapabilities` (Task 5), `getDiagnostics`/`probeModes` (Task 3), the `CardReader.*` keys (Task 1).
- Produces: no new exports.

- [ ] **Step 1: Add the diagnostics imports and state**

At the top of `CardReaderScreen.tsx`, add:

```tsx
import useCardCapabilities from "@/hooks/useCardCapabilities";
import useCardCapabilityStore, { CARD_MODES } from "@/store/cardCapabilities";
import { Share } from "react-native";
```

(extend the existing `react-native` import rather than duplicating it).

Inside `CardReaderScreen`, after the existing `useCardReader()` call:

```tsx
  const { probing, ensureProbed } = useCardCapabilities();
  const capabilityModes = useCardCapabilityStore((s) => s.modes);
  const lastError = useCardCapabilityStore((s) => s.lastError);
  const diagnostics = useCardCapabilityStore((s) => s.diagnostics);
  const readerAvailable = useCardCapabilityStore((s) => s.readerAvailable);
  const resetLearned = useCardCapabilityStore((s) => s.resetLearned);

  const retest = async () => {
    resetLearned();
    await ensureProbed();
  };
```

- [ ] **Step 2: Add the report builder**

Add this module-level helper below `modeLabelKey`:

```tsx
/**
 * Plain-text device report. Contains only hardware identity and reader
 * verdicts — never card data — so it is safe to share into a chat.
 */
function buildReport(
  diagnostics: ReturnType<typeof useCardCapabilityStore.getState>["diagnostics"],
  modes: ReturnType<typeof useCardCapabilityStore.getState>["modes"],
  lastError: ReturnType<typeof useCardCapabilityStore.getState>["lastError"],
  readerAvailable: boolean | null,
): string {
  const lines: string[] = ["SUNMI CARD READER REPORT", ""];
  lines.push(`readerAvailable: ${readerAvailable ?? "unknown"}`);
  const d = diagnostics ?? {};
  for (const [key, value] of Object.entries(d)) {
    if (key === "errors") continue;
    lines.push(`${key}: ${value ?? "(empty)"}`);
  }
  if (d.errors) {
    lines.push("", "read failures:");
    for (const [key, value] of Object.entries(d.errors)) {
      lines.push(`  ${key}: ${value}`);
    }
  }
  lines.push("", "methods:");
  for (const mode of CARD_MODES) {
    const err = lastError[mode];
    lines.push(
      `  ${mode}: ${modes[mode]}${err ? ` (code ${err.code}${err.message ? ` — ${err.message}` : ""})` : ""}`,
    );
  }
  return lines.join("\n");
}
```

- [ ] **Step 3: Render the panel**

Insert this JSX inside `ModalTemplate`, directly above the existing mode-selection `View`:

```tsx
      {/* Diagnostics — this is what testers send back from an unknown device. */}
      <View className="mt-4 p-4 border border-gray-200 rounded-xl bg-white">
        <Text className="text-base font-semibold text-gray-900 mb-2">
          {cr("DeviceAndReader")}
        </Text>
        <ResultRow
          label="readerAvailable"
          value={String(readerAvailable ?? "unknown")}
        />
        {(
          [
            "buildModel",
            "payDeviceModel",
            "cardHw",
            "nfcConfig",
            "msrVersion",
            "msr2FwVersion",
            "payLibVersion",
            "matchedServiceVersion",
          ] as const
        ).map((key) => (
          // Every row renders even when empty: a blank field is itself a signal.
          <ResultRow key={key} label={key} value={diagnostics?.[key] ?? "—"} />
        ))}

        <Text className="mt-4 mb-1 text-base font-semibold text-gray-900">
          {cr("CaptureMethods")}
        </Text>
        {CARD_MODES.map((mode) => {
          const support = capabilityModes[mode];
          const err = lastError[mode];
          const supportLabel =
            support === "supported"
              ? cr("SupportSupported")
              : support === "unsupported"
                ? cr("SupportUnsupported")
                : cr("SupportUnknown");
          return (
            <ResultRow
              key={mode}
              label={cr(modeLabelKey(mode))}
              value={
                err
                  ? `${supportLabel} — ${err.code}${err.message ? ` ${err.message}` : ""}`
                  : supportLabel
              }
            />
          );
        })}

        <View className="flex-row gap-2 mt-4">
          <DebouncedPressable
            onPress={retest}
            disabled={probing}
            className={`flex-1 flex-row items-center justify-center py-3 rounded-full border border-primary ${
              probing ? "opacity-50" : "active:bg-primary/10"
            }`}
          >
            {probing ? (
              <ActivityIndicator size="small" color="#111827" />
            ) : (
              <Text className="text-base font-medium text-gray-900">
                {cr("Retest")}
              </Text>
            )}
          </DebouncedPressable>
          <DebouncedPressable
            onPress={() =>
              Share.share({
                message: buildReport(
                  diagnostics,
                  capabilityModes,
                  lastError,
                  readerAvailable,
                ),
              })
            }
            className="flex-1 flex-row items-center justify-center py-3 rounded-full border border-gray-400 active:bg-gray-50"
          >
            <Text className="text-base font-medium text-gray-900">
              {cr("ShareReport")}
            </Text>
          </DebouncedPressable>
        </View>

        <Text className="mt-4 mb-1 text-xs font-semibold uppercase text-gray-400">
          {cr("Diagnostics")}
        </Text>
        <Text
          selectable
          className="text-xs text-gray-700 font-mono"
        >
          {buildReport(diagnostics, capabilityModes, lastError, readerAvailable)}
        </Text>
      </View>
```

- [ ] **Step 4: Verify**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass.

Run: `npx expo run:android`
Expected: the app builds. Open the Card Reader screen — every label must render real text, not `error: MobileApp.CardReader.*`.

- [ ] **Step 5: Commit**

```bash
git add "src/screens/(auth)/CardReader/CardReaderScreen.tsx"
git commit -m "feat(card-reader): add a device capability diagnostics panel"
```

---

## Device verification

Run in this order once all tasks are committed.

- [ ] **Sunmi P2 regression.** Capture a refund card by tap and by swipe. Both must return a card number. This is the gate for Task 2's removal of `initEmvProcess()` — if either fails, restore that call and re-test.
- [ ] **Sunmi P2 diagnostics.** Open the Card Reader screen and confirm all three methods read `Available` after a re-test, and that `cardHw` / `msrVersion` / `nfcConfig` show real values. Record what `cardHw` contains — that is what a future revision would parse.
- [ ] **Sunmi V3.** Install, open the Card Reader screen, tap **Re-test methods**, then **Share report** and send it back. The report decides between spec hypotheses H1 and H2.
- [ ] **Sunmi V3 capture.** Open a sale and tap the refund-card button. Expected: only the methods the probe found are offered; with exactly one, the sheet arms it with no chooser; with none, the button is disabled and reads "Card capture unavailable".

## Notes for the implementer

- **The V3 report is self-contradictory.** Testers reported both "tap and swipe both fail" and "the V3 only has NFC" — under the latter, tap would work. Do not design around either claim; the probe and the report resolve it.
- **`initEmvProcess()` removal is a hypothesis, not a known fix.** It is well-founded (`src/utils/emv.ts` drives the chip itself and needs no Sunmi Pay authorization), but the P2 works *with* the call today. The P2 regression test is the gate.
- **Never widen `UNSUPPORTED_ERROR_CODES`.** Timeouts (`-30005`), track parity failures (`-30006`…`-30012`) and fallback (`-30013`) describe bad reads. Demoting on those would disable working readers after one awkward swipe.

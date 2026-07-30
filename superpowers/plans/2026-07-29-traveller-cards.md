# Traveller Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a traveller manage the cards and bank accounts their refunds pay out to, from inside the mobile app.

**Architecture:** A single screen at `/(auth)/profile/cards` reached from two entry points, backed by one `useCards` hook that owns all server state. Pure formatting/validation/OCR logic lives in `src/utils/card/` and is unit-tested; presentational components take data and render it, composing actions through a `children` slot. All six endpoints already exist in the generated `TravellerCardService` — only the actions wrapper is new.

**Tech Stack:** React Native 0.81 + Expo 54, NativeWind, `@gorhom/bottom-sheet`, `react-native-svg`, `expo-camera`, `rn-mlkit-ocr`, generated `@/saas/RefundService` client, Jest (`jest-expo/node`).

**Spec:** `docs/superpowers/specs/2026-07-28-traveller-cards-design.md`

## Global Constraints

- Path alias `@/*` → `./src/*`. Use it for every internal import.
- TypeScript strict mode. No implicit `any`, no unchecked nulls.
- Styling via NativeWind utility classes; merge conditionals with `cn()` from `@/utils/cn`.
- Translations are read as `t("MobileApp.Cards.…")` and authored in `src/localization/resources/{en-US,tr-TR}.json`. `src/data/language-data/*.gen.json` is generated and gitignored — **new keys do not typecheck until `npm run init` regenerates it.**
- List request is always `{ includeExpired: true, maxResultCount: 100 }`. No pagination.
- Filter the list to `type === "Card"` and `type === "Bank"`. **`Wallet` tokens are dropped** — no add flow and no distinct display exists for them.
- Field limits, copied from the DTOs: `nickname` ≤ 64, `holderName` ≤ 256, `bankName` ≤ 256, IBAN 15–50, BIC 8–11 when supplied, `bankCountryCode` is ISO-3166 alpha-2, `cardExpiryMonth` 1–12.
- **Do not add `expo-linear-gradient`.** The card face uses `bg-primary` plus an absolutely-positioned white highlight overlay.
- **Do not send card images to any third-party service.** OCR is on-device only.
- Holder name is typed, never scanned.
- **Component tests cannot run in this repo.** `@testing-library/react-native` maps `react-native` → `react-native-web` under the `jest-expo/node` preset and fails to resolve; 3–4 suites in `src/components/__tests__/` already fail to load for this reason. Every test in this plan is therefore a **pure-logic** test with no React imports. UI tasks verify with `npm run typecheck` + `npm run lint` + a manual device check. Do not attempt to fix the preset as part of this work.
- Baseline before starting: `npm run typecheck` clean, `npm test` = 74 passing with 4 suites failing to load. Any *new* failure is yours.

---

### Task 1: Card formatting and validation utilities

**Files:**
- Create: `src/utils/card/card.ts`
- Test: `src/utils/card/__tests__/card.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type CardBrand = "visa" | "mastercard" | "amex" | "discover" | "diners" | "jcb" | "unknown"`; `onlyDigits(value: string): string`; `getCardBrand(cardNumber: string): CardBrand`; `formatCardNumber(raw: string): string`; `normalizeExpiry(raw: string): string`; `parseExpiry(expiry: string): { month: number; year: number } | null`; `luhnValid(cardNumber: string): boolean`; `groupMaskedNumber(masked: string): string`; `formatExpiryFromParts(month: number, year: number): string`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/card/__tests__/card.test.ts`:

```ts
import {
  formatCardNumber,
  formatExpiryFromParts,
  getCardBrand,
  groupMaskedNumber,
  luhnValid,
  normalizeExpiry,
  onlyDigits,
  parseExpiry,
} from "@/utils/card/card";

describe("onlyDigits", () => {
  it("strips everything that is not a digit", () => {
    expect(onlyDigits("4111 1111-1111_1111a")).toBe("4111111111111111");
  });
});

describe("getCardBrand", () => {
  it.each([
    ["4111111111111111", "visa"],
    ["378282246310005", "amex"],
    ["371449635398431", "amex"],
    ["6011111111111117", "discover"],
    ["3530111333300000", "jcb"],
    ["30569309025904", "diners"],
    ["5555555555554444", "mastercard"],
    ["2221000000000009", "mastercard"],
    ["9999999999999999", "unknown"],
    ["", "unknown"],
  ])("detects %s as %s", (number, brand) => {
    expect(getCardBrand(number)).toBe(brand);
  });

  // 2221-2720 is Mastercard; 2220 and 2721 are not. Boundaries matter because
  // the ranges are tested in order and a broader pattern could swallow them.
  it("respects the mastercard 2-series boundaries", () => {
    expect(getCardBrand("2220000000000000")).toBe("unknown");
    expect(getCardBrand("2720999999999999")).toBe("mastercard");
    expect(getCardBrand("2721000000000000")).toBe("unknown");
  });
});

describe("formatCardNumber", () => {
  it("groups a 16-digit card in fours", () => {
    expect(formatCardNumber("4111111111111111")).toBe("4111 1111 1111 1111");
  });

  it("groups amex as 4-6-5", () => {
    expect(formatCardNumber("378282246310005")).toBe("3782 822463 10005");
  });

  it("truncates past the brand's maximum length", () => {
    expect(formatCardNumber("37828224631000512345")).toBe("3782 822463 10005");
  });

  it("reformats already-formatted input idempotently", () => {
    expect(formatCardNumber("4111 1111 1111 1111")).toBe("4111 1111 1111 1111");
  });

  it("returns an empty string for empty input", () => {
    expect(formatCardNumber("")).toBe("");
  });
});

describe("normalizeExpiry", () => {
  it.each([
    ["1228", "12/28"],
    ["12/28", "12/28"],
    ["12/2028", "12/28"],
    ["2028-12", "12/28"],
    ["12-28", "12/28"],
    ["1", "1"],
    ["", ""],
  ])("normalises %s to %s", (raw, expected) => {
    expect(normalizeExpiry(raw)).toBe(expected);
  });
});

describe("parseExpiry", () => {
  it("parses MM/YY into a month and a four-digit year", () => {
    expect(parseExpiry("09/28")).toEqual({ month: 9, year: 2028 });
  });

  it.each(["13/28", "00/28", "9/2028", "", "abc"])(
    "rejects %s",
    (input) => {
      expect(parseExpiry(input)).toBeNull();
    },
  );
});

describe("luhnValid", () => {
  it.each(["4111111111111111", "378282246310005", "5555555555554444"])(
    "accepts %s",
    (number) => {
      expect(luhnValid(number)).toBe(true);
    },
  );

  it("rejects a number that fails the checksum", () => {
    expect(luhnValid("4111111111111112")).toBe(false);
  });

  it("rejects anything shorter than 12 digits even if the checksum passes", () => {
    expect(luhnValid("18")).toBe(false);
  });

  it("ignores separators", () => {
    expect(luhnValid("4111 1111 1111 1111")).toBe(true);
  });
});

describe("groupMaskedNumber", () => {
  it("groups the API's masked PAN in fours", () => {
    expect(groupMaskedNumber("411111******1111")).toBe("4111 11** **** 1111");
  });

  it("leaves a trailing partial group intact", () => {
    expect(groupMaskedNumber("41111")).toBe("4111 1");
  });

  it("returns an empty string for empty input", () => {
    expect(groupMaskedNumber("")).toBe("");
  });
});

describe("formatExpiryFromParts", () => {
  it("pads the month and shortens the year", () => {
    expect(formatExpiryFromParts(9, 2028)).toBe("09/28");
  });

  it("leaves a two-digit month alone", () => {
    expect(formatExpiryFromParts(12, 2031)).toBe("12/31");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/utils/card --silent`
Expected: FAIL — `Cannot find module '@/utils/card/card'`.

- [ ] **Step 3: Write the implementation**

Create `src/utils/card/card.ts`:

```ts
/**
 * Card number/expiry formatting, brand detection and Luhn validation.
 *
 * Ported from the web `credit-card-input` / `card-brand-icon` components so
 * the two clients agree on what a valid card looks like. Kept free of React
 * so it can be unit-tested — component tests cannot run in this repo.
 */

export type CardBrand =
  | "visa"
  | "mastercard"
  | "amex"
  | "discover"
  | "diners"
  | "jcb"
  | "unknown";

/** Per-brand digit grouping and maximum PAN length. */
const BRAND_FORMAT: Record<CardBrand, { gaps: number[]; maxDigits: number }> = {
  visa: { gaps: [4, 8, 12], maxDigits: 16 },
  mastercard: { gaps: [4, 8, 12], maxDigits: 16 },
  amex: { gaps: [4, 10], maxDigits: 15 },
  discover: { gaps: [4, 8, 12], maxDigits: 16 },
  diners: { gaps: [4, 10], maxDigits: 14 },
  jcb: { gaps: [4, 8, 12], maxDigits: 16 },
  unknown: { gaps: [4, 8, 12], maxDigits: 19 },
};

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Detect the brand from IIN/BIN prefix ranges. Order matters — more specific
 * prefixes are tested before broader ones.
 */
export function getCardBrand(cardNumber: string): CardBrand {
  const digits = onlyDigits(cardNumber);
  if (!digits) return "unknown";
  if (/^4/.test(digits)) return "visa";
  if (/^3[47]/.test(digits)) return "amex";
  if (/^(6011|64[4-9]|65|622)/.test(digits)) return "discover";
  if (/^35(2[89]|[3-8]\d)/.test(digits)) return "jcb";
  if (/^3(0[0-5]|[689])/.test(digits)) return "diners";
  if (/^(5[1-5]|2(22[1-9]|2[3-9]|[3-6]\d|7[01]|720))/.test(digits))
    return "mastercard";
  return "unknown";
}

function formatWithGaps(digits: string, gaps: number[]): string {
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i !== 0 && gaps.includes(i)) out += " ";
    out += digits[i] ?? "";
  }
  return out;
}

/** Group a raw or already-formatted card number per the detected brand. */
export function formatCardNumber(raw: string): string {
  const digits = onlyDigits(raw);
  const { gaps, maxDigits } = BRAND_FORMAT[getCardBrand(digits)];
  return formatWithGaps(digits.slice(0, maxDigits), gaps);
}

/** Normalise MMYY, MM/YY, MM/YYYY, YYYY-MM or MM-YY to "MM/YY". */
export function normalizeExpiry(raw: string): string {
  const trimmed = raw.trim();
  const isoMatch = /^(\d{4})[-/](\d{1,2})$/.exec(trimmed);
  if (isoMatch) {
    const isoYear = isoMatch[1] ?? "";
    const isoMonth = isoMatch[2] ?? "";
    return `${isoMonth.padStart(2, "0")}/${isoYear.slice(2)}`;
  }
  const digits = onlyDigits(trimmed);
  if (digits.length === 0) return "";
  const month = digits.slice(0, 2);
  const year = digits.slice(2, 6);
  const shortYear = year.length === 4 ? year.slice(2) : year;
  return shortYear ? `${month}/${shortYear}` : month;
}

/** Parse a normalised "MM/YY" into the parts the create-card DTO wants. */
export function parseExpiry(
  expiry: string,
): { month: number; year: number } | null {
  const match = /^(\d{2})\/(\d{2})$/.exec(expiry);
  if (!match) return null;
  const month = Number(match[1]);
  const shortYear = match[2];
  if (month < 1 || month > 12 || !shortYear) return null;
  return { month, year: 2000 + Number(shortYear) };
}

/** Luhn checksum. False for anything shorter than 12 digits. */
export function luhnValid(cardNumber: string): boolean {
  const digits = onlyDigits(cardNumber);
  if (digits.length < 12) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Group the API's masked PAN (`411111******1111`) in fours for display.
 * Distinct from `formatCardNumber` because the mask contains `*`, which
 * `onlyDigits` would strip.
 */
export function groupMaskedNumber(masked: string): string {
  if (!masked) return "";
  return masked.match(/.{1,4}/g)?.join(" ") ?? masked;
}

/** Build the "MM/YY" display string from the DTO's numeric expiry parts. */
export function formatExpiryFromParts(month: number, year: number): string {
  return `${String(month).padStart(2, "0")}/${String(year).slice(-2)}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/utils/card --silent`
Expected: PASS, all cases green.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/utils/card/card.ts src/utils/card/__tests__/card.test.ts
git commit -m "feat(cards): add card formatting, brand detection and Luhn validation"
```

---

### Task 2: IBAN utilities

**Files:**
- Create: `src/utils/card/iban.ts`
- Test: `src/utils/card/__tests__/iban.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `normalizeIban(raw: string): string`; `ibanValid(raw: string): boolean`; `formatIban(raw: string): string`; `maskIban(raw: string): string`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/card/__tests__/iban.test.ts`:

```ts
import { formatIban, ibanValid, maskIban, normalizeIban } from "@/utils/card/iban";

describe("normalizeIban", () => {
  it("uppercases and strips whitespace", () => {
    expect(normalizeIban(" de89 3704 0044 0532 0130 00 ")).toBe(
      "DE89370400440532013000",
    );
  });
});

describe("ibanValid", () => {
  it.each([
    "DE89370400440532013000",
    "GB82WEST12345698765432",
    "TR330006100519786457841326",
    "de89 3704 0044 0532 0130 00",
  ])("accepts %s", (iban) => {
    expect(ibanValid(iban)).toBe(true);
  });

  it("rejects a wrong check digit", () => {
    expect(ibanValid("DE88370400440532013000")).toBe(false);
  });

  it("rejects anything shorter than 15 or longer than 34 characters", () => {
    expect(ibanValid("DE8937040044")).toBe(false);
    expect(ibanValid(`DE89${"3".repeat(31)}`)).toBe(false);
  });

  it("rejects a malformed prefix", () => {
    expect(ibanValid("1289370400440532013000")).toBe(false);
    expect(ibanValid("DEXX370400440532013000")).toBe(false);
  });

  it("rejects non-alphanumeric content", () => {
    expect(ibanValid("DE89-3704-0044-0532-0130-00!")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(ibanValid("")).toBe(false);
  });
});

describe("formatIban", () => {
  it("groups in fours", () => {
    expect(formatIban("DE89370400440532013000")).toBe(
      "DE89 3704 0044 0532 0130 00",
    );
  });
});

describe("maskIban", () => {
  it("keeps the country prefix and the last four, masking the middle", () => {
    expect(maskIban("DE89370400440532013000")).toBe("DE89 •••• 3000");
  });

  it("returns a short value unchanged rather than mangling it", () => {
    expect(maskIban("DE89")).toBe("DE89");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/utils/card/__tests__/iban.test.ts --silent`
Expected: FAIL — `Cannot find module '@/utils/card/iban'`.

- [ ] **Step 3: Write the implementation**

Create `src/utils/card/iban.ts`:

```ts
/**
 * IBAN normalisation, formatting and ISO 13616 mod-97 validation.
 *
 * Validated client-side so the bank-token form rejects what the server would
 * reject, rather than round-tripping to find out.
 */

const IBAN_PATTERN = /^[A-Z]{2}\d{2}[A-Z0-9]+$/;
const MIN_LENGTH = 15;
const MAX_LENGTH = 34;

export function normalizeIban(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/**
 * Mod-97 check per ISO 13616: move the first four characters to the end, map
 * letters to numbers (A=10 … Z=35), and require the result mod 97 to equal 1.
 * Computed in chunks because the expanded value overflows Number.
 */
export function ibanValid(raw: string): boolean {
  const iban = normalizeIban(raw);
  if (iban.length < MIN_LENGTH || iban.length > MAX_LENGTH) return false;
  if (!IBAN_PATTERN.test(iban)) return false;

  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const expanded = rearranged.replace(/[A-Z]/g, (char) =>
    String(char.charCodeAt(0) - 55),
  );

  let remainder = 0;
  for (const digit of expanded) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

/** Group in fours for display, the conventional IBAN presentation. */
export function formatIban(raw: string): string {
  const iban = normalizeIban(raw);
  return iban.match(/.{1,4}/g)?.join(" ") ?? iban;
}

/** Country prefix + last four, middle masked. For list rows. */
export function maskIban(raw: string): string {
  const iban = normalizeIban(raw);
  if (iban.length <= 8) return iban;
  return `${iban.slice(0, 4)} •••• ${iban.slice(-4)}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/utils/card/__tests__/iban.test.ts --silent`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/utils/card/iban.ts src/utils/card/__tests__/iban.test.ts
git commit -m "feat(cards): add IBAN normalisation, formatting and mod-97 validation"
```

---

### Task 3: On-device OCR card parser

**Files:**
- Create: `src/utils/card/parse-card-ocr.ts`
- Test: `src/utils/card/__tests__/parse-card-ocr.test.ts`

**Interfaces:**
- Consumes: `luhnValid`, `onlyDigits`, `normalizeExpiry` from `@/utils/card/card`; the `OcrBlock` type from `rn-mlkit-ocr`.
- Produces: `type ScannedCard = { number?: string; expiry?: string }`; `parseCardFromOcr(blocks: OcrBlock[]): ScannedCard`.

**Why holder name is absent:** embossed names read unreliably, and a wrong name reaching the vault as `name_on_card` is worse than typing it. Do not add name extraction.

- [ ] **Step 1: Write the failing test**

Create `src/utils/card/__tests__/parse-card-ocr.test.ts`:

```ts
import type { OcrBlock } from "rn-mlkit-ocr";
import { parseCardFromOcr } from "@/utils/card/parse-card-ocr";

/** Minimal OcrBlock fixture — only `text` matters to the parser. */
function block(...lines: string[]): OcrBlock {
  const frame = { x: 0, y: 0, width: 0, height: 0 };
  return {
    text: lines.join("\n"),
    frame,
    lines: lines.map((text) => ({ text, frame, elements: [] })),
  };
}

describe("parseCardFromOcr", () => {
  it("reads a spaced card number and an expiry", () => {
    const result = parseCardFromOcr([
      block("4111 1111 1111 1111"),
      block("VALID THRU", "12/28"),
      block("ADA LOVELACE"),
    ]);
    expect(result.number).toBe("4111111111111111");
    expect(result.expiry).toBe("12/28");
  });

  it("reads a number split across separate blocks on one visual line", () => {
    const result = parseCardFromOcr([
      block("5555", "5555", "5555", "4444"),
    ]);
    expect(result.number).toBe("5555555555554444");
  });

  it("discards a number that fails the Luhn check rather than prefilling it", () => {
    const result = parseCardFromOcr([block("4111 1111 1111 1112")]);
    expect(result.number).toBeUndefined();
  });

  it("prefers the expiry next to a VALID THRU label over an earlier date", () => {
    const result = parseCardFromOcr([
      block("01/20"),
      block("VALID THRU 09/30"),
      block("4111 1111 1111 1111"),
    ]);
    expect(result.expiry).toBe("09/30");
  });

  it("accepts a four-digit expiry year and shortens it", () => {
    const result = parseCardFromOcr([block("GOOD THRU 07/2029")]);
    expect(result.expiry).toBe("07/29");
  });

  it("ignores a month outside 1-12", () => {
    const result = parseCardFromOcr([block("VALID THRU 19/28")]);
    expect(result.expiry).toBeUndefined();
  });

  it("returns an empty result for blocks with nothing card-like", () => {
    expect(parseCardFromOcr([block("HELLO"), block("WORLD")])).toEqual({});
  });

  it("returns an empty result for no blocks", () => {
    expect(parseCardFromOcr([])).toEqual({});
  });

  it("picks the longest valid candidate when several numbers appear", () => {
    const result = parseCardFromOcr([
      block("1234 5678"),
      block("3782 822463 10005"),
    ]);
    expect(result.number).toBe("378282246310005");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/utils/card/__tests__/parse-card-ocr.test.ts --silent`
Expected: FAIL — `Cannot find module '@/utils/card/parse-card-ocr'`.

- [ ] **Step 3: Write the implementation**

Create `src/utils/card/parse-card-ocr.ts`:

```ts
import type { OcrBlock } from "rn-mlkit-ocr";
import { luhnValid, normalizeExpiry, onlyDigits } from "./card";

export type ScannedCard = {
  number?: string;
  expiry?: string;
};

/** Cards often print an issue date too; the expiry sits next to one of these. */
const EXPIRY_LABEL = /(VALID\s*THRU|GOOD\s*THRU|EXPIRES?|VALID)/i;
const EXPIRY_PATTERN = /\b(\d{2})\s*\/\s*(\d{2}|\d{4})\b/;

/** A PAN is 13-19 digits; shorter runs are dates, CVCs or noise. */
const PAN_PATTERN = /\b(?:\d[ -]?){13,19}\b/g;

function flattenLines(blocks: OcrBlock[]): string[] {
  const lines: string[] = [];
  for (const b of blocks) {
    for (const line of b.text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) lines.push(trimmed);
    }
  }
  return lines;
}

/**
 * Pull a card number and expiry out of ML Kit's OCR output.
 *
 * Deliberately conservative: a number is only returned when it passes Luhn, so
 * a misread digit yields nothing rather than a plausible-but-wrong prefill the
 * user might not check. Returns partial results — a number with no expiry is
 * still useful, since the form lets the user finish by hand.
 */
export function parseCardFromOcr(blocks: OcrBlock[]): ScannedCard {
  const lines = flattenLines(blocks);
  if (lines.length === 0) return {};

  return {
    number: findCardNumber(lines),
    expiry: findExpiry(lines),
  };
}

function findCardNumber(lines: string[]): string | undefined {
  // Try each line on its own, then the whole block joined — a PAN is often
  // split into four separate OCR fragments that only read as one number once
  // the separators are gone.
  const candidates = [...lines, lines.join(" ")];
  let best: string | undefined;

  for (const candidate of candidates) {
    const matches = candidate.match(PAN_PATTERN) ?? [];
    for (const match of matches) {
      const digits = onlyDigits(match);
      if (digits.length < 13 || digits.length > 19) continue;
      if (!luhnValid(digits)) continue;
      if (!best || digits.length > best.length) best = digits;
    }
  }

  if (best) return best;

  // Fall back to the digits of the whole capture concatenated, which catches
  // a PAN broken across lines rather than spaces.
  const joined = onlyDigits(lines.join(""));
  for (let length = 19; length >= 13; length--) {
    for (let start = 0; start + length <= joined.length; start++) {
      const slice = joined.slice(start, start + length);
      if (luhnValid(slice)) return slice;
    }
  }
  return undefined;
}

function toExpiry(match: RegExpMatchArray): string | undefined {
  const month = Number(match[1]);
  if (month < 1 || month > 12) return undefined;
  return normalizeExpiry(`${match[1]}/${match[2]}`);
}

function findExpiry(lines: string[]): string | undefined {
  // A labelled date wins: the label distinguishes the expiry from the issue
  // date some cards also print.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!EXPIRY_LABEL.test(line)) continue;
    const sameLine = line.match(EXPIRY_PATTERN);
    if (sameLine) {
      const parsed = toExpiry(sameLine);
      if (parsed) return parsed;
    }
    const nextLine = (lines[i + 1] ?? "").match(EXPIRY_PATTERN);
    if (nextLine) {
      const parsed = toExpiry(nextLine);
      if (parsed) return parsed;
    }
  }

  for (const line of lines) {
    const match = line.match(EXPIRY_PATTERN);
    if (match) {
      const parsed = toExpiry(match);
      if (parsed) return parsed;
    }
  }
  return undefined;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/utils/card/__tests__/parse-card-ocr.test.ts --silent`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/utils/card/parse-card-ocr.ts src/utils/card/__tests__/parse-card-ocr.test.ts
git commit -m "feat(cards): parse card number and expiry from on-device OCR blocks"
```

---

### Task 4: Traveller-ID resolution

Both create DTOs require a `travellerId` and nothing in the app reads one today. The access token carries a `TravellerId` claim — confirmed against the live dev gateway, and the web reads the same claim in `packages/utils/auth/auth-actions.ts#getUserData`.

**Files:**
- Modify: `src/store/user.types.ts` (add the claim to `JwtUser`)
- Modify: `src/utils/traveller.ts` (add the pure resolver)
- Modify: `src/actions/TravellerService/actions.ts` (add the fallback lookup)
- Create: `src/utils/card/traveller-id.ts` (the combined async resolver)
- Test: `src/utils/__tests__/traveller.test.ts` (append; the file already exists)

**Interfaces:**
- Consumes: `JwtUser` from `@/store/user.types`.
- Produces: `getTravellerIdFromClaims(jwtUser?: JwtUser | null): string`; `getMyTravellerId(): Promise<string>`.

- [ ] **Step 1: Write the failing test**

Append to `src/utils/__tests__/traveller.test.ts`:

```ts
import { getTravellerIdFromClaims } from "@/utils/traveller";
import type { JwtUser } from "@/store/user.types";

function jwt(travellerId?: string | string[]): JwtUser {
  return { TravellerId: travellerId } as unknown as JwtUser;
}

describe("getTravellerIdFromClaims", () => {
  it("reads a string claim", () => {
    expect(getTravellerIdFromClaims(jwt("abc-123"))).toBe("abc-123");
  });

  // ABP emits a repeated claim as an array when the user has more than one.
  it("takes the first entry of an array claim", () => {
    expect(getTravellerIdFromClaims(jwt(["first", "second"]))).toBe("first");
  });

  it("returns an empty string for an empty array", () => {
    expect(getTravellerIdFromClaims(jwt([]))).toBe("");
  });

  it.each([undefined, null])("returns an empty string for %s", (value) => {
    expect(getTravellerIdFromClaims(value)).toBe("");
  });

  it("returns an empty string when the claim is absent", () => {
    expect(getTravellerIdFromClaims(jwt())).toBe("");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/utils/__tests__/traveller.test.ts --silent`
Expected: FAIL — `getTravellerIdFromClaims is not a function`.

- [ ] **Step 3: Add the claim to `JwtUser`**

In `src/store/user.types.ts`, inside the `JwtUser` interface, directly below the existing `MerchantId` line:

```ts
  MerchantId?: string[] | string;
  /**
   * Present for traveller accounts. ABP emits a repeated claim as an array,
   * so both shapes must be handled — see `getTravellerIdFromClaims`.
   */
  TravellerId?: string[] | string;
```

- [ ] **Step 4: Add the pure resolver**

Append to `src/utils/traveller.ts`:

```ts
import type { JwtUser } from "@/store/user.types";

/**
 * Traveller id from the access-token claims, tolerating the array form ABP
 * emits for a repeated claim. Returns "" when there is no claim — callers
 * must treat that as "unknown" and fall back, not as a valid id.
 */
export function getTravellerIdFromClaims(jwtUser?: JwtUser | null): string {
  const claim = jwtUser?.TravellerId;
  if (Array.isArray(claim)) return claim[0] ?? "";
  return claim ?? "";
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest src/utils/__tests__/traveller.test.ts --silent`
Expected: PASS.

- [ ] **Step 6: Add the async fallback**

Append to `src/actions/TravellerService/actions.ts`:

```ts
/**
 * The caller's own traveller-document affiliations. Used only to recover the
 * traveller id when the access token carries no `TravellerId` claim.
 */
export async function getMyDocumentAffiliations() {
  return await fetchRequest(async (customHeaders) => {
    const client = await getTravellerServiceClient(customHeaders);
    return await client.traveller.getApiTravellerServiceTravellersMyDocumentAffiliations();
  }, "getMyDocumentAffiliations");
}
```

`client.traveller` is the correct property — verified against
`src/saas/TravellerService/TravellerServiceClient.ts:17`. If
`getTravellerServiceClient` is not already imported from `../lib` at the top
of the file, add it to that existing import.

- [ ] **Step 7: Add the combined resolver**

Create `src/utils/card/traveller-id.ts`:

```ts
import { getMyDocumentAffiliations } from "@/actions/TravellerService/actions";
import useUserStore from "@/store/user";
import { logger } from "@/utils/logger";
import { getTravellerIdFromClaims } from "@/utils/traveller";

/**
 * The traveller id the create-card and create-bank DTOs require.
 *
 * Prefers the token claim, which needs no request. Falls back to the
 * my-document-affiliations endpoint for accounts whose token lacks it.
 * Returns "" when neither resolves — callers must disable adding rather than
 * send a request that is guaranteed to 400.
 */
export async function getMyTravellerId(): Promise<string> {
  const fromClaims = getTravellerIdFromClaims(
    useUserStore.getState().user?.jwtUser,
  );
  if (fromClaims) return fromClaims;

  try {
    const affiliations = await getMyDocumentAffiliations();
    return affiliations?.[0]?.travellerId ?? "";
  } catch (error) {
    logger.warn("Could not resolve traveller id from affiliations", error);
    return "";
  }
}
```

- [ ] **Step 8: Typecheck, lint and commit**

```bash
npm run typecheck
npx eslint src/utils/traveller.ts src/utils/card/traveller-id.ts src/store/user.types.ts src/actions/TravellerService/actions.ts
git add src/store/user.types.ts src/utils/traveller.ts src/utils/card/traveller-id.ts src/actions/TravellerService/actions.ts src/utils/__tests__/traveller.test.ts
git commit -m "feat(cards): resolve the traveller id from token claims with an affiliations fallback"
```

---

### Task 5: Actions layer for traveller cards

Every endpoint already exists on the generated `TravellerCardService`, exposed as `client.travellerCard`. Reads go in `actions.ts`, writes in a new `post.ts`, matching the existing verb split; the delete sits with the reads exactly as `IdentityService.deleteGdpr` does.

**Files:**
- Modify: `src/actions/RefundService/actions.ts`
- Create: `src/actions/RefundService/post.ts`

**Interfaces:**
- Consumes: `getRefundServiceClient` from `@/actions/lib`; `fetchRequest` from `@/utils/customFetch`.
- Produces:
  - `getTravellerCardsMine(): Promise<PagedResultDto_TravellerCardDto>`
  - `deleteTravellerCard(id: string): Promise<unknown>`
  - `postTravellerCard(requestBody: UniRefund_RefundService_TravellerCards_CreateTravellerCardDto)`
  - `postTravellerBankToken(requestBody: UniRefund_RefundService_TravellerCards_CreateBankTokenDto)`
  - `postTravellerCardSetDefault(id: string)`
  - `putTravellerCardNickname(id: string, nickname: string | null)`

- [ ] **Step 1: Add the reads**

Append to `src/actions/RefundService/actions.ts`:

```ts
/**
 * The caller's own saved payout tokens. Uses the claim-sourced `/mine`
 * endpoint rather than `by-traveller/{id}`, so listing needs no traveller id.
 * Expired cards are included and flagged so the UI can grey them out.
 */
export async function getTravellerCardsMine() {
  return await fetchRequest(async (customHeaders) => {
    const client = await getRefundServiceClient(customHeaders);
    return await client.travellerCard.getApiRefundServiceTravellerCardsMine({
      includeExpired: true,
      maxResultCount: 100,
    });
  }, "getTravellerCardsMine");
}

/** Soft-deletes a saved payout token; it disappears from the list. */
export async function deleteTravellerCard(id: string) {
  return await fetchRequest(async (customHeaders) => {
    const client = await getRefundServiceClient(customHeaders);
    return await client.travellerCard.deleteApiRefundServiceTravellerCardsById({
      id,
    });
  }, "deleteTravellerCard");
}
```

- [ ] **Step 2: Add the writes**

Create `src/actions/RefundService/post.ts`:

```ts
import type {
  UniRefund_RefundService_TravellerCards_CreateBankTokenDto,
  UniRefund_RefundService_TravellerCards_CreateTravellerCardDto,
} from "@/saas/RefundService";
import { fetchRequest } from "@/utils/customFetch";
import { getRefundServiceClient } from "../lib";

/**
 * Saves a payout card. The raw PAN crosses this boundary only to be vaulted
 * in the CDE — the service keeps the masked number, expiry and an opaque
 * token, never the PAN.
 *
 * Adding the same physical card twice is not an error: the backend returns
 * the existing token instead of creating a duplicate, so callers should treat
 * a repeat add as success and simply refresh.
 */
export async function postTravellerCard(
  requestBody: UniRefund_RefundService_TravellerCards_CreateTravellerCardDto,
) {
  return await fetchRequest(async (customHeaders) => {
    const client = await getRefundServiceClient(customHeaders);
    return await client.travellerCard.postApiRefundServiceTravellerCards({
      requestBody,
    });
  }, "postTravellerCard");
}

/**
 * Saves a bank account as a payout token. Bank details are not PCI, so the
 * IBAN/BIC/name/country are stored directly with no vaulting. Re-saving the
 * same IBAN returns the existing token.
 */
export async function postTravellerBankToken(
  requestBody: UniRefund_RefundService_TravellerCards_CreateBankTokenDto,
) {
  return await fetchRequest(async (customHeaders) => {
    const client = await getRefundServiceClient(customHeaders);
    return await client.travellerCard.postApiRefundServiceTravellerCardsBank({
      requestBody,
    });
  }, "postTravellerBankToken");
}

/**
 * Makes a token the default for its type, clearing the previous default of
 * that type. Card, bank and wallet each have their own default.
 */
export async function postTravellerCardSetDefault(id: string) {
  return await fetchRequest(async (customHeaders) => {
    const client = await getRefundServiceClient(customHeaders);
    return await client.travellerCard.postApiRefundServiceTravellerCardsByIdSetDefault(
      { id },
    );
  }, "postTravellerCardSetDefault");
}

/** Renames a saved token. Null or blank clears the nickname. */
export async function putTravellerCardNickname(
  id: string,
  nickname: string | null,
) {
  return await fetchRequest(async (customHeaders) => {
    const client = await getRefundServiceClient(customHeaders);
    return await client.travellerCard.putApiRefundServiceTravellerCardsByIdNickname(
      { id, requestBody: { nickname } },
    );
  }, "putTravellerCardNickname");
}
```

- [ ] **Step 3: Typecheck, lint and commit**

```bash
npm run typecheck
npx eslint src/actions/RefundService/actions.ts src/actions/RefundService/post.ts
git add src/actions/RefundService/actions.ts src/actions/RefundService/post.ts
git commit -m "feat(cards): add traveller-card read and write actions"
```

---

### Task 6: Localization keys

**Files:**
- Modify: `src/localization/resources/en-US.json`
- Modify: `src/localization/resources/tr-TR.json`

Add a top-level `"Cards"` object to **both** files, alongside the existing `Profile`, `Tags`, etc.

- [ ] **Step 1: Add the English copy**

Insert into `src/localization/resources/en-US.json` at the top level:

```json
"Cards": {
  "Title": "My Cards",
  "Description": "Cards and bank accounts your refunds are paid to",
  "ShortcutDescription": "Manage your payout methods",
  "CardsSection": "Cards",
  "BanksSection": "Bank accounts",
  "NoCards": "No saved cards",
  "NoCardsDescription": "Add a card to get your refunds paid out faster.",
  "NoBanks": "No saved bank accounts",
  "NoBanksDescription": "Add a bank account to receive refunds by transfer.",
  "AddCard": "Add card",
  "AddBank": "Add bank account",
  "ScanCard": "Scan card",
  "EnterManually": "Enter manually",
  "CardNumberLabel": "Card number",
  "CardNumberPlaceholder": "1234 5678 9012 3456",
  "ExpiryLabel": "Expiry",
  "ExpiryPlaceholder": "MM/YY",
  "HolderNameLabel": "Card holder",
  "HolderNamePlaceholder": "Name on card",
  "NicknameLabel": "Nickname",
  "NicknamePlaceholder": "Work Visa",
  "IbanLabel": "IBAN",
  "IbanPlaceholder": "DE89 3704 0044 0532 0130 00",
  "BicLabel": "BIC / SWIFT",
  "BicPlaceholder": "Optional",
  "BankNameLabel": "Bank name",
  "BankNamePlaceholder": "Optional",
  "BankCountryLabel": "Bank country",
  "AccountHolderLabel": "Account holder",
  "Expired": "Expired",
  "Default": "Default",
  "SetDefault": "Set as default",
  "Save": "Save",
  "Saving": "Saving…",
  "Adding": "Adding…",
  "Cancel": "Cancel",
  "Delete": "Delete",
  "EditNicknameTitle": "Rename",
  "EditNicknameDescription": "Give this payout method a name you'll recognise.",
  "DeleteTitle": "Remove this payout method?",
  "DeleteDescription": "It will no longer be available for refunds. You can add it again later.",
  "AddSuccess": "Card added",
  "AddBankSuccess": "Bank account added",
  "SetDefaultSuccess": "Default updated",
  "DeleteSuccess": "Removed",
  "RenameSuccess": "Name updated",
  "InvalidCardNumber": "That card number doesn't look right.",
  "InvalidExpiry": "Enter the expiry as MM/YY.",
  "InvalidIban": "That IBAN doesn't look right.",
  "LoadFailed": "Couldn't load your payout methods.",
  "Retry": "Try again",
  "NoTravellerId": "We couldn't identify your traveller profile, so cards can't be added right now.",
  "Scanner": {
    "Title": "Scan your card",
    "Hint": "Hold your card inside the frame",
    "PermissionDescription": "Camera access is needed to scan your card. Nothing leaves your device — the card is read on the phone.",
    "PermissionAllow": "Allow camera",
    "Scanning": "Reading…",
    "NotFound": "Couldn't read the card. Try again in better light, or enter it manually.",
    "Capture": "Scan"
  }
}
```

- [ ] **Step 2: Add the Turkish copy**

Insert the same structure into `src/localization/resources/tr-TR.json`:

```json
"Cards": {
  "Title": "Kartlarım",
  "Description": "İadelerinizin yatırılacağı kartlar ve banka hesapları",
  "ShortcutDescription": "Ödeme yöntemlerinizi yönetin",
  "CardsSection": "Kartlar",
  "BanksSection": "Banka hesapları",
  "NoCards": "Kayıtlı kart yok",
  "NoCardsDescription": "İadelerinizi daha hızlı almak için bir kart ekleyin.",
  "NoBanks": "Kayıtlı banka hesabı yok",
  "NoBanksDescription": "Havale ile iade almak için bir banka hesabı ekleyin.",
  "AddCard": "Kart ekle",
  "AddBank": "Banka hesabı ekle",
  "ScanCard": "Kartı tara",
  "EnterManually": "Elle gir",
  "CardNumberLabel": "Kart numarası",
  "CardNumberPlaceholder": "1234 5678 9012 3456",
  "ExpiryLabel": "Son kullanma",
  "ExpiryPlaceholder": "AA/YY",
  "HolderNameLabel": "Kart sahibi",
  "HolderNamePlaceholder": "Kart üzerindeki isim",
  "NicknameLabel": "Takma ad",
  "NicknamePlaceholder": "İş kartı",
  "IbanLabel": "IBAN",
  "IbanPlaceholder": "TR33 0006 1005 1978 6457 8413 26",
  "BicLabel": "BIC / SWIFT",
  "BicPlaceholder": "İsteğe bağlı",
  "BankNameLabel": "Banka adı",
  "BankNamePlaceholder": "İsteğe bağlı",
  "BankCountryLabel": "Banka ülkesi",
  "AccountHolderLabel": "Hesap sahibi",
  "Expired": "Süresi doldu",
  "Default": "Varsayılan",
  "SetDefault": "Varsayılan yap",
  "Save": "Kaydet",
  "Saving": "Kaydediliyor…",
  "Adding": "Ekleniyor…",
  "Cancel": "Vazgeç",
  "Delete": "Sil",
  "EditNicknameTitle": "Yeniden adlandır",
  "EditNicknameDescription": "Bu ödeme yöntemine tanıyacağınız bir ad verin.",
  "DeleteTitle": "Bu ödeme yöntemi kaldırılsın mı?",
  "DeleteDescription": "İadeler için artık kullanılamayacak. Daha sonra tekrar ekleyebilirsiniz.",
  "AddSuccess": "Kart eklendi",
  "AddBankSuccess": "Banka hesabı eklendi",
  "SetDefaultSuccess": "Varsayılan güncellendi",
  "DeleteSuccess": "Kaldırıldı",
  "RenameSuccess": "Ad güncellendi",
  "InvalidCardNumber": "Bu kart numarası geçerli görünmüyor.",
  "InvalidExpiry": "Son kullanma tarihini AA/YY olarak girin.",
  "InvalidIban": "Bu IBAN geçerli görünmüyor.",
  "LoadFailed": "Ödeme yöntemleriniz yüklenemedi.",
  "Retry": "Tekrar dene",
  "NoTravellerId": "Yolcu profiliniz belirlenemediği için şu anda kart eklenemiyor.",
  "Scanner": {
    "Title": "Kartınızı tarayın",
    "Hint": "Kartı çerçevenin içinde tutun",
    "PermissionDescription": "Kartınızı taramak için kamera izni gerekiyor. Hiçbir veri cihazınızdan çıkmaz — kart telefonda okunur.",
    "PermissionAllow": "Kameraya izin ver",
    "Scanning": "Okunuyor…",
    "NotFound": "Kart okunamadı. Daha iyi ışıkta tekrar deneyin veya elle girin.",
    "Capture": "Tara"
  }
}
```

- [ ] **Step 3: Regenerate the typed translations**

Run: `npm run init`
Expected: rewrites `src/data/language-data/en-US.gen.json` and `tr-TR.gen.json`. This requires network access to the dev gateway. Without it, `t("MobileApp.Cards.…")` will not typecheck.

- [ ] **Step 4: Verify a key resolves**

Run:
```bash
node -e "const d=require('./src/data/language-data/en-US.gen.json');console.log(d.MobileApp.Cards.Title)"
```
Expected: `My Cards`

- [ ] **Step 5: Commit**

```bash
git add src/localization/resources/en-US.json src/localization/resources/tr-TR.json
git commit -m "feat(cards): add English and Turkish copy for the cards section"
```

---

### Task 7: Card brand logo and card face

**Files:**
- Create: `src/screens/traveller/Cards/_components/CardBrandLogo.tsx`
- Create: `src/screens/traveller/Cards/_components/CardPreview.tsx`

**Interfaces:**
- Consumes: `CardBrand`, `getCardBrand`, `groupMaskedNumber` from `@/utils/card/card`; `cn` from `@/utils/cn`.
- Produces:
  - `CardBrandLogo({ brand, size }: { brand: CardBrand; size?: number })`
  - `CardPreview({ number, holderName, expiry, isExpired, labels, children, className })` where `labels` is `{ holderNameLabel: string; expiryLabel: string }` and `children` renders into the top-right action cluster.

- [ ] **Step 1: Write the brand logo**

Create `src/screens/traveller/Cards/_components/CardBrandLogo.tsx`:

```tsx
import type { CardBrand } from "@/utils/card/card";
import { Circle, G, Path, Rect, Svg, Text as SvgText } from "react-native-svg";

/**
 * Payment-network marks, ported from the web `card-brand-icon` SVGs. Unknown
 * brands render nothing rather than a placeholder glyph — the card face
 * already reads as a card without one.
 */
export function CardBrandLogo({
  brand,
  size = 28,
}: {
  brand: CardBrand;
  size?: number;
}) {
  if (brand === "unknown") return null;

  return (
    <Svg width={size} height={size * (16 / 24)} viewBox="0 0 24 16">
      {renderBrand(brand)}
    </Svg>
  );
}

function renderBrand(brand: Exclude<CardBrand, "unknown">) {
  switch (brand) {
    case "visa":
      return (
        <G>
          <Rect x="0" y="0" width="24" height="16" rx="2.5" fill="#1434CB" />
          <SvgText
            x="12"
            y="11.4"
            textAnchor="middle"
            fontSize="7"
            fontWeight="700"
            fontStyle="italic"
            fill="#fff"
          >
            VISA
          </SvgText>
        </G>
      );
    case "mastercard":
      return (
        <G>
          <Rect x="0" y="0" width="24" height="16" rx="2.5" fill="#fff" />
          <Circle cx="10" cy="8" r="4.4" fill="#EB001B" />
          <Circle cx="14" cy="8" r="4.4" fill="#F79E1B" />
          <Path
            d="M12 4.4a4.4 4.4 0 0 1 0 7.2 4.4 4.4 0 0 1 0-7.2Z"
            fill="#FF5F00"
          />
        </G>
      );
    case "amex":
      return (
        <G>
          <Rect x="0" y="0" width="24" height="16" rx="2.5" fill="#2E77BC" />
          <SvgText
            x="12"
            y="10.7"
            textAnchor="middle"
            fontSize="5.2"
            fontWeight="700"
            fill="#fff"
          >
            AMEX
          </SvgText>
        </G>
      );
    case "discover":
      return (
        <G>
          <Rect x="0" y="0" width="24" height="16" rx="2.5" fill="#fff" />
          <SvgText x="2.4" y="10.4" fontSize="4.1" fontWeight="700" fill="#1A1A1A">
            DISC
          </SvgText>
          <Circle cx="18.2" cy="10.6" r="3" fill="#FF6000" />
        </G>
      );
    case "diners":
      return (
        <G>
          <Rect x="0" y="0" width="24" height="16" rx="2.5" fill="#0079BE" />
          <Circle cx="12" cy="8" r="4.6" fill="#fff" />
          <Rect x="11.35" y="3.4" width="1.3" height="9.2" fill="#0079BE" />
        </G>
      );
    case "jcb":
      return (
        <G>
          <Rect x="0" y="0" width="24" height="16" rx="2.5" fill="#fff" />
          <Rect x="4.8" y="2.8" width="4.2" height="10.4" rx="1" fill="#0B4EA2" />
          <Rect x="9.9" y="2.8" width="4.2" height="10.4" rx="1" fill="#B3122B" />
          <Rect x="15" y="2.8" width="4.2" height="10.4" rx="1" fill="#1C8B3B" />
        </G>
      );
  }
}
```

- [ ] **Step 2: Write the card face**

Create `src/screens/traveller/Cards/_components/CardPreview.tsx`:

```tsx
import { getCardBrand, groupMaskedNumber } from "@/utils/card/card";
import { SERIAL_FONT } from "@/utils/serialFont";
import { cn } from "@/utils/cn";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { CardBrandLogo } from "./CardBrandLogo";

const PLACEHOLDER_NUMBER = "•••• •••• •••• ••••";

/** The gold contact plate. Purely decorative. */
function CardChip() {
  return (
    <View className="h-6 w-9 rounded-sm bg-amber-400 justify-center px-1.5 gap-[3px]">
      <View className="h-px w-full bg-amber-900/40" />
      <View className="h-px w-full bg-amber-900/40" />
      <View className="h-px w-full bg-amber-900/40" />
    </View>
  );
}

/**
 * A physical-card-like face: chip, grouped number, holder name, expiry and
 * brand mark.
 *
 * Purely presentational — it has no notion of nicknames, defaults or
 * deletion. Callers compose the top-right action cluster through `children`,
 * which is what lets the same component serve both the saved-card list and
 * the add-card form preview.
 *
 * The web version uses a CSS gradient; here it is a flat `bg-primary` plus a
 * soft highlight, deliberately avoiding an `expo-linear-gradient` dependency
 * for one surface.
 */
export function CardPreview({
  number,
  holderName,
  expiry,
  isExpired,
  labels,
  children,
  className,
}: {
  number?: string;
  holderName?: string;
  expiry?: string;
  isExpired?: boolean;
  labels: { holderNameLabel: string; expiryLabel: string };
  children?: ReactNode;
  className?: string;
}) {
  const brand = getCardBrand(number ?? "");
  const displayNumber = number ? groupMaskedNumber(number) : PLACEHOLDER_NUMBER;

  return (
    <View
      className={cn(
        "w-full aspect-[1.586] overflow-hidden rounded-2xl bg-primary p-4 justify-between",
        isExpired && "opacity-60",
        className,
      )}
    >
      {/* Soft highlight standing in for the web's gradient. */}
      <View className="absolute -top-16 -right-10 h-48 w-48 rounded-full bg-white/10" />

      <View className="flex-row items-start justify-between gap-2">
        <CardChip />
        <View className="flex-row flex-wrap items-center justify-end gap-1">
          {children}
        </View>
      </View>

      <Text
        className="text-base tracking-widest text-white/90"
        style={{ fontFamily: SERIAL_FONT }}
        numberOfLines={1}
      >
        {displayNumber}
      </Text>

      <View className="flex-row items-end justify-between gap-2">
        <View className="flex-1 min-w-0">
          <Text className="text-[8px] uppercase tracking-wide text-white/50">
            {labels.holderNameLabel}
          </Text>
          <Text className="text-xs font-medium uppercase text-white" numberOfLines={1}>
            {holderName || "-"}
          </Text>
        </View>
        <View className="shrink-0 items-end">
          <Text className="text-[8px] uppercase tracking-wide text-white/50">
            {labels.expiryLabel}
          </Text>
          <Text className="text-xs text-white" style={{ fontFamily: SERIAL_FONT }}>
            {expiry || "MM/YY"}
          </Text>
        </View>
        <CardBrandLogo brand={brand} />
      </View>
    </View>
  );
}
```

- [ ] **Step 3: Typecheck, lint and commit**

There is no test step: component tests cannot run in this repo (see Global Constraints).

```bash
npm run typecheck
npx eslint src/screens/traveller/Cards/_components/CardBrandLogo.tsx src/screens/traveller/Cards/_components/CardPreview.tsx
git add src/screens/traveller/Cards/_components/
git commit -m "feat(cards): add the card face and payment-network marks"
```

---

### Task 8: The `useCards` hook

**Files:**
- Create: `src/screens/traveller/Cards/useCards.ts`

**Interfaces:**
- Consumes: `getTravellerCardsMine`, `deleteTravellerCard` from `@/actions/RefundService/actions`; `postTravellerCardSetDefault`, `putTravellerCardNickname` from `@/actions/RefundService/post`; `useToast` from `@/providers/ToastProvider`; `useLocalization`; `useAsyncFetch` (default export) from `@/hooks/useAsyncFetch`.
- Produces: `type PayoutToken = UniRefund_RefundService_TravellerCards_TravellerCardDto`; `useCards(): { cards: PayoutToken[]; banks: PayoutToken[]; loading: boolean; error: string | null; pendingId: string | null; refresh: () => Promise<unknown>; setDefault: (id: string) => Promise<void>; remove: (id: string) => Promise<void>; rename: (id: string, nickname: string) => Promise<boolean> }`.

- [ ] **Step 1: Write the hook**

Create `src/screens/traveller/Cards/useCards.ts`:

```ts
import {
  deleteTravellerCard,
  getTravellerCardsMine,
} from "@/actions/RefundService/actions";
import {
  postTravellerCardSetDefault,
  putTravellerCardNickname,
} from "@/actions/RefundService/post";
import useAsyncFetch from "@/hooks/useAsyncFetch";
import { useLocalization } from "@/providers/LocalizationProvider";
import { useToast } from "@/providers/ToastProvider";
import type { UniRefund_RefundService_TravellerCards_TravellerCardDto } from "@/saas/RefundService";
import { logger } from "@/utils/logger";
import { useCallback, useMemo, useState } from "react";

export type PayoutToken =
  UniRefund_RefundService_TravellerCards_TravellerCardDto;

/**
 * Owns the cards screen's server state: the list, the three mutations that
 * act on an existing token (set-default, delete, rename), their toasts, and
 * which row is mid-flight. Adding a card or bank account is not here — the
 * add-sheets own their own form state and call the post actions directly.
 *
 * Mutations refetch rather than patching local state — the same choice the
 * SSR page makes with `router.refresh()`. Set-default in particular has a
 * side effect on a *different* row (it clears the previous default of that
 * type), so a local patch would drift.
 */
export function useCards() {
  const { t } = useLocalization();
  const toast = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const { data, loading, error, execute } = useAsyncFetch(
    getTravellerCardsMine,
  );

  const items = useMemo<PayoutToken[]>(() => data?.items ?? [], [data]);

  // Wallet tokens are dropped: there is no add flow and no distinct display
  // for them, so listing one would offer management we cannot deliver.
  const cards = useMemo(() => items.filter((i) => i.type === "Card"), [items]);
  const banks = useMemo(() => items.filter((i) => i.type === "Bank"), [items]);

  const refresh = useCallback(() => execute(), [execute]);

  const runMutation = useCallback(
    async (id: string, action: () => Promise<unknown>, successKey: string) => {
      if (pendingId) return false;
      setPendingId(id);
      try {
        await action();
        await execute();
        toast.success(successKey);
        return true;
      } catch (err) {
        logger.error("Card mutation failed", err);
        toast.error(
          err instanceof Error ? err.message : t("MobileApp.Cards.LoadFailed"),
        );
        return false;
      } finally {
        setPendingId(null);
      }
    },
    [execute, pendingId, t, toast],
  );

  const setDefault = useCallback(
    async (id: string) => {
      await runMutation(
        id,
        () => postTravellerCardSetDefault(id),
        t("MobileApp.Cards.SetDefaultSuccess"),
      );
    },
    [runMutation, t],
  );

  const remove = useCallback(
    async (id: string) => {
      await runMutation(
        id,
        () => deleteTravellerCard(id),
        t("MobileApp.Cards.DeleteSuccess"),
      );
    },
    [runMutation, t],
  );

  const rename = useCallback(
    (id: string, nickname: string) =>
      runMutation(
        id,
        () => putTravellerCardNickname(id, nickname.trim() || null),
        t("MobileApp.Cards.RenameSuccess"),
      ),
    [runMutation, t],
  );

  return {
    cards,
    banks,
    loading,
    error,
    pendingId,
    refresh,
    setDefault,
    remove,
    rename,
  };
}
```

- [ ] **Step 2: Typecheck, lint and commit**

```bash
npm run typecheck
npx eslint src/screens/traveller/Cards/useCards.ts
git add src/screens/traveller/Cards/useCards.ts
git commit -m "feat(cards): add the useCards hook owning list and mutations"
```

---

### Task 9: Rename and delete sheets

Both are shared by cards and bank accounts — a payout token is a payout token for these two operations.

**Files:**
- Create: `src/screens/traveller/Cards/_components/EditNicknameSheet.tsx`
- Create: `src/screens/traveller/Cards/_components/DeleteTokenSheet.tsx`

**Interfaces:**
- Consumes: `BottomSheet` from `@/components/BottomSheet`; `BottomSheetModal`, `BottomSheetView`, `BottomSheetTextInput` from `@gorhom/bottom-sheet`; `PayoutToken` from `../useCards`.
- Produces:
  - `EditNicknameSheet({ sheetRef, token, onSubmit })` where `onSubmit: (id: string, nickname: string) => Promise<boolean>`
  - `DeleteTokenSheet({ sheetRef, token, onConfirm })` where `onConfirm: (id: string) => Promise<void>`

- [ ] **Step 1: Write the rename sheet**

Create `src/screens/traveller/Cards/_components/EditNicknameSheet.tsx`:

```tsx
import Button from "@/components/Button";
import { useLocalization } from "@/providers/LocalizationProvider";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { BottomSheetTextInput, BottomSheetView } from "@gorhom/bottom-sheet";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { BottomSheet } from "@/components/BottomSheet";
import type { PayoutToken } from "../useCards";

/** Renames a saved payout token. `nickname` is capped at 64 by the DTO. */
export function EditNicknameSheet({
  sheetRef,
  token,
  onSubmit,
}: {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  token: PayoutToken | null;
  onSubmit: (id: string, nickname: string) => Promise<boolean>;
}) {
  const { t } = useLocalization();
  const [nickname, setNickname] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Reseed whenever a different token is opened, so the field never shows the
  // previously edited token's name. This alone is not enough — see the
  // `onChange` reset below, which handles reopening the *same* token.
  useEffect(() => {
    setNickname(token?.nickname ?? "");
  }, [token]);

  async function handleSave() {
    if (!token) return;
    setIsSaving(true);
    try {
      const ok = await onSubmit(token.id, nickname);
      if (ok) sheetRef.current?.dismiss();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <BottomSheet
      ref={sheetRef}
      onChange={(index) => {
        // The sheet stays mounted across dismiss, so a draft the traveller
        // abandoned by tapping the backdrop would still be in the field when
        // they reopen the same card — and Save would commit it over the real
        // nickname. Drop the draft on close instead. The effect above still
        // handles switching to a *different* token.
        if (index === -1) setNickname(token?.nickname ?? "");
      }}
    >
      <BottomSheetView className="p-4 gap-3">
        <Text className="text-xl font-bold">
          {t("MobileApp.Cards.EditNicknameTitle")}
        </Text>
        <Text className="text-gray-600">
          {t("MobileApp.Cards.EditNicknameDescription")}
        </Text>
        <View className="bg-white border border-gray-400 rounded-2xl px-3">
          <BottomSheetTextInput
            value={nickname}
            onChangeText={setNickname}
            placeholder={t("MobileApp.Cards.NicknamePlaceholder")}
            placeholderTextColor="#9ca3af"
            maxLength={64}
            editable={!isSaving}
            className="py-4 text-gray-900"
          />
        </View>
        <Button
          action={{
            onPress: handleSave,
            label: isSaving
              ? t("MobileApp.Cards.Saving")
              : t("MobileApp.Cards.Save"),
          }}
          isLoading={isSaving}
        />
      </BottomSheetView>
    </BottomSheet>
  );
}
```

- [ ] **Step 2: Write the delete sheet**

Create `src/screens/traveller/Cards/_components/DeleteTokenSheet.tsx`:

```tsx
import Button from "@/components/Button";
import { useLocalization } from "@/providers/LocalizationProvider";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { BottomSheetView } from "@gorhom/bottom-sheet";
import { useState } from "react";
import { Text } from "react-native";
import { BottomSheet } from "@/components/BottomSheet";
import type { PayoutToken } from "../useCards";

/** Confirms removal of a saved payout token. The delete is a soft delete. */
export function DeleteTokenSheet({
  sheetRef,
  token,
  onConfirm,
}: {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  token: PayoutToken | null;
  onConfirm: (id: string) => Promise<void>;
}) {
  const { t } = useLocalization();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleConfirm() {
    if (!token) return;
    setIsDeleting(true);
    try {
      await onConfirm(token.id);
      sheetRef.current?.dismiss();
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <BottomSheet ref={sheetRef}>
      <BottomSheetView className="p-4 gap-3">
        <Text className="text-xl font-bold">
          {t("MobileApp.Cards.DeleteTitle")}
        </Text>
        <Text className="text-gray-600">
          {t("MobileApp.Cards.DeleteDescription")}
        </Text>
        <Button
          action={{ onPress: handleConfirm, label: t("MobileApp.Cards.Delete") }}
          isLoading={isDeleting}
        />
        <Button
          action={{
            onPress: () => sheetRef.current?.dismiss(),
            label: t("MobileApp.Cards.Cancel"),
          }}
          disabled={isDeleting}
          containerClassName="bg-gray-200"
          textClassName="text-gray-800"
        />
      </BottomSheetView>
    </BottomSheet>
  );
}
```

- [ ] **Step 3: Typecheck, lint and commit**

```bash
npm run typecheck
npx eslint src/screens/traveller/Cards/_components/EditNicknameSheet.tsx src/screens/traveller/Cards/_components/DeleteTokenSheet.tsx
git add src/screens/traveller/Cards/_components/EditNicknameSheet.tsx src/screens/traveller/Cards/_components/DeleteTokenSheet.tsx
git commit -m "feat(cards): add rename and delete confirmation sheets"
```

---

### Task 10: Card scanner modal

**Files:**
- Create: `src/screens/traveller/Cards/_components/CardScannerModal.tsx`

**Interfaces:**
- Consumes: `CameraView`, `useCameraPermissions` from `expo-camera`; `recognizeText` from `rn-mlkit-ocr`; `parseCardFromOcr` from `@/utils/card/parse-card-ocr`.
- Produces: `CardScannerModal({ visible, onClose, onScanned })` where `onScanned: (scanned: { number?: string; expiry?: string }) => void`.

**Constraint:** the captured image must never leave the device. Do not add any upload, and do not call the web app's extraction API — its key only exists server-side.

- [ ] **Step 1: Write the scanner**

Create `src/screens/traveller/Cards/_components/CardScannerModal.tsx`:

```tsx
import Button from "@/components/Button";
import { Ionicons } from "@/components/Ionicons";
import { useLocalization } from "@/providers/LocalizationProvider";
import { parseCardFromOcr, type ScannedCard } from "@/utils/card/parse-card-ocr";
import { logger } from "@/utils/logger";
import { CameraView, useCameraPermissions } from "expo-camera";
import { File } from "expo-file-system";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Modal, Text, View } from "react-native";
import { recognizeText } from "rn-mlkit-ocr";

/**
 * Reads a card number and expiry from the camera, entirely on-device.
 *
 * The web version posts card images to a third-party extraction API behind a
 * server action that hides the API key. A mobile app has no server to hide a
 * key behind, so this uses ML Kit locally instead — the PAN never leaves the
 * phone, which is better handling for this data, not merely a substitute.
 */
export function CardScannerModal({
  visible,
  onClose,
  onScanned,
}: {
  visible: boolean;
  onClose: () => void;
  onScanned: (scanned: ScannedCard) => void;
}) {
  const { t } = useLocalization();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closedRef = useRef(false);

  const handleClose = useCallback(() => {
    closedRef.current = true;
    setError(null);
    onClose();
  }, [onClose]);

  const capture = useCallback(async () => {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    setError(null);
    closedRef.current = false;
    let capturedUri: string | undefined;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      // Recorded before any early return, so every exit path can delete it.
      capturedUri = photo?.uri;
      if (closedRef.current) return;
      if (!photo?.uri) {
        // A capture with no file is not the same as the user walking away:
        // say something, or the spinner just stops and nothing happens.
        setError(t("MobileApp.Cards.Scanner.NotFound"));
        return;
      }

      const { blocks } = await recognizeText(photo.uri);
      if (closedRef.current) return;

      const scanned = parseCardFromOcr(blocks);
      // A number that failed Luhn is discarded by the parser, so an empty
      // result means "read it again", not "prefill something approximate".
      if (!scanned.number) {
        setError(t("MobileApp.Cards.Scanner.NotFound"));
        return;
      }
      onScanned(scanned);
    } catch (err) {
      logger.error("Card scan failed", err);
      if (!closedRef.current) setError(t("MobileApp.Cards.Scanner.NotFound"));
    } finally {
      // The capture is a photograph of a payment card — full PAN, expiry, often
      // the holder's name. It has done its whole job once OCR has read it, so it
      // must not sit in the cache directory waiting for the OS to reclaim space.
      // Deleting here covers every exit path: success, an unreadable card, and
      // the user closing mid-scan.
      if (capturedUri) {
        try {
          new File(capturedUri).delete();
        } catch (err) {
          // A leftover temp file is not worth failing the scan over, but it
          // should be visible in logs.
          logger.warn("Could not delete the scanned card image", err);
        }
      }
      setBusy(false);
    }
  }, [busy, onScanned, t]);

  if (!visible) return null;

  return (
    <Modal visible animationType="slide" onRequestClose={handleClose}>
      <View className="flex-1 bg-black">
        {!permission?.granted ? (
          <View className="flex-1 items-center justify-center gap-4 p-8">
            <Ionicons name="camera-outline" size={48} color="#fff" />
            <Text className="text-center text-white text-base">
              {t("MobileApp.Cards.Scanner.PermissionDescription")}
            </Text>
            <Button
              action={{
                onPress: () => void requestPermission(),
                label: t("MobileApp.Cards.Scanner.PermissionAllow"),
              }}
              containerClassName="w-full"
            />
            <Button
              action={{
                onPress: handleClose,
                label: t("MobileApp.Cards.EnterManually"),
              }}
              containerClassName="w-full bg-white/20"
            />
          </View>
        ) : (
          <>
            <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
            {/* Framing guide sized to a real card's 85.60x53.98mm ratio. */}
            <View className="absolute inset-0 items-center justify-center">
              <View className="w-[86%] aspect-[1.586] rounded-2xl border-2 border-white/80" />
              <Text className="mt-4 text-white/80 text-sm">
                {t("MobileApp.Cards.Scanner.Hint")}
              </Text>
            </View>
            <View className="absolute bottom-0 left-0 right-0 items-center gap-3 p-6">
              {error && (
                <Text className="text-center text-red-300 text-sm px-4">
                  {error}
                </Text>
              )}
              {busy ? (
                <View className="flex-row items-center gap-2">
                  <ActivityIndicator color="#fff" />
                  <Text className="text-white">
                    {t("MobileApp.Cards.Scanner.Scanning")}
                  </Text>
                </View>
              ) : (
                <Button
                  action={{
                    onPress: capture,
                    label: t("MobileApp.Cards.Scanner.Capture"),
                  }}
                  containerClassName="w-48"
                />
              )}
              <Button
                action={{
                  onPress: handleClose,
                  label: t("MobileApp.Cards.EnterManually"),
                }}
                disabled={busy}
                containerClassName="w-48 bg-white/20"
              />
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}
```

- [ ] **Step 2: Typecheck, lint and commit**

```bash
npm run typecheck
npx eslint src/screens/traveller/Cards/_components/CardScannerModal.tsx
git add src/screens/traveller/Cards/_components/CardScannerModal.tsx
git commit -m "feat(cards): scan a card with on-device OCR, no image leaves the phone"
```

---

### Task 11: Add-card sheet

> **The code below is superseded in three ways — read
> `src/screens/traveller/Cards/_components/AddCardSheet.tsx` as committed, not
> this block.** It logged the raw card number on any failed submit, left the
> sheet's inputs locked if it was dismissed mid-submit, and accepted an
> already-expired card. The fixes are described under "Amendments during
> execution"; only the logging line is corrected inline here, because that is the
> one it would be actively harmful to copy.

**Files:**
- Create: `src/screens/traveller/Cards/_components/SheetField.tsx`
- Create: `src/screens/traveller/Cards/_components/AddCardSheet.tsx`

**Interfaces:**
- Consumes: `formatCardNumber`, `normalizeExpiry`, `parseExpiry`, `onlyDigits`, `luhnValid` from `@/utils/card/card`; `postTravellerCard` from `@/actions/RefundService/post`; `CardPreview`; `CardScannerModal`; `getMyTravellerId` from `@/utils/card/traveller-id`.
- Produces: `AddCardSheet({ sheetRef, onAdded })` where `onAdded: () => void`.

- [ ] **Step 1: Write the shared labelled field**

Both add-sheets stack the same labelled, bordered input, so it lives in one
file rather than being written twice.

Create `src/screens/traveller/Cards/_components/SheetField.tsx`:

```tsx
import type { ReactNode } from "react";
import { Text, View } from "react-native";

/** A labelled, bordered input row, matching the look of `@/components/Input`. */
export function SheetField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <View className="gap-1">
      <Text className="text-base font-semibold text-gray-900">{label}</Text>
      <View className="bg-white border border-gray-400 rounded-2xl px-3">
        {children}
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Write the sheet**

Create `src/screens/traveller/Cards/_components/AddCardSheet.tsx`:

```tsx
import { postTravellerCard } from "@/actions/RefundService/post";
import Button from "@/components/Button";
import { BottomSheet } from "@/components/BottomSheet";
import { useLocalization } from "@/providers/LocalizationProvider";
import { useToast } from "@/providers/ToastProvider";
import {
  formatCardNumber,
  luhnValid,
  normalizeExpiry,
  onlyDigits,
  parseExpiry,
} from "@/utils/card/card";
import { getMyTravellerId } from "@/utils/card/traveller-id";
import type { ScannedCard } from "@/utils/card/parse-card-ocr";
import { SERIAL_FONT } from "@/utils/serialFont";
import { logger } from "@/utils/logger";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { BottomSheetScrollView, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { useCallback, useState } from "react";
import { Text } from "react-native";
import { CardPreview } from "./CardPreview";
import { CardScannerModal } from "./CardScannerModal";
import { SheetField } from "./SheetField";

/** Adds a payout card, by typing or by scanning. Holder name is always typed. */
export function AddCardSheet({
  sheetRef,
  onAdded,
}: {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  onAdded: () => void;
}) {
  const { t } = useLocalization();
  const toast = useToast();
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [holderName, setHolderName] = useState("");
  const [nickname, setNickname] = useState("");
  const [scanning, setScanning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  function reset() {
    setNumber("");
    setExpiry("");
    setHolderName("");
    setNickname("");
    setScanning(false);
  }

  // A scan fills only what OCR could prove; the user reviews and completes the
  // rest before submitting.
  const handleScanned = useCallback((scanned: ScannedCard) => {
    if (scanned.number) setNumber(formatCardNumber(scanned.number));
    if (scanned.expiry) setExpiry(scanned.expiry);
    setScanning(false);
  }, []);

  async function handleSubmit() {
    const digits = onlyDigits(number);
    if (!luhnValid(digits)) {
      toast.error(t("MobileApp.Cards.InvalidCardNumber"));
      return;
    }
    const parsed = parseExpiry(expiry);
    if (!parsed) {
      toast.error(t("MobileApp.Cards.InvalidExpiry"));
      return;
    }

    setIsSaving(true);
    try {
      const travellerId = await getMyTravellerId();
      if (!travellerId) {
        toast.error(t("MobileApp.Cards.NoTravellerId"));
        return;
      }
      await postTravellerCard({
        travellerId,
        cardNumber: digits,
        cardExpiryMonth: parsed.month,
        cardExpiryYear: parsed.year,
        holderName: holderName.trim() || undefined,
        nickname: nickname.trim() || undefined,
      });
      toast.success(t("MobileApp.Cards.AddSuccess"));
      reset();
      sheetRef.current?.dismiss();
      onAdded();
    } catch (err) {
      // Never log the error object: the generated client's ApiError carries
      // `request.body`, which here is the raw card number and holder name, and
      // logger.error is enabled in production.
      logger.error("Add card failed", describeRequestFailure(err));
      toast.error(
        err instanceof Error ? err.message : t("MobileApp.Cards.LoadFailed"),
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <BottomSheet
        ref={sheetRef}
        snapPoints={["85%"]}
        onChange={(index) => {
          if (index === -1) reset();
        }}
      >
        <BottomSheetScrollView
          contentContainerStyle={{ padding: 16, gap: 12 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text className="text-xl font-bold">{t("MobileApp.Cards.AddCard")}</Text>

          <CardPreview
            number={onlyDigits(number)}
            holderName={holderName}
            expiry={expiry}
            labels={{
              holderNameLabel: t("MobileApp.Cards.HolderNameLabel"),
              expiryLabel: t("MobileApp.Cards.ExpiryLabel"),
            }}
          />

          <Button
            action={{
              onPress: () => setScanning(true),
              label: t("MobileApp.Cards.ScanCard"),
            }}
            iconName="camera-outline"
            iconColor="#111827"
            disabled={isSaving}
            containerClassName="bg-white border border-gray-400"
            textClassName="text-gray-900"
          />

          <SheetField label={t("MobileApp.Cards.CardNumberLabel")}>
            <BottomSheetTextInput
              value={number}
              onChangeText={(v) => setNumber(formatCardNumber(v))}
              placeholder={t("MobileApp.Cards.CardNumberPlaceholder")}
              placeholderTextColor="#9ca3af"
              keyboardType="number-pad"
              editable={!isSaving}
              className="py-4 text-gray-900"
              style={{ fontFamily: SERIAL_FONT }}
            />
          </SheetField>

          <SheetField label={t("MobileApp.Cards.ExpiryLabel")}>
            <BottomSheetTextInput
              value={expiry}
              onChangeText={(v) => setExpiry(normalizeExpiry(v))}
              placeholder={t("MobileApp.Cards.ExpiryPlaceholder")}
              placeholderTextColor="#9ca3af"
              keyboardType="number-pad"
              editable={!isSaving}
              className="py-4 text-gray-900"
              style={{ fontFamily: SERIAL_FONT }}
            />
          </SheetField>

          <SheetField label={t("MobileApp.Cards.HolderNameLabel")}>
            <BottomSheetTextInput
              value={holderName}
              onChangeText={setHolderName}
              placeholder={t("MobileApp.Cards.HolderNamePlaceholder")}
              placeholderTextColor="#9ca3af"
              autoCapitalize="characters"
              maxLength={256}
              editable={!isSaving}
              className="py-4 text-gray-900"
            />
          </SheetField>

          <SheetField label={t("MobileApp.Cards.NicknameLabel")}>
            <BottomSheetTextInput
              value={nickname}
              onChangeText={setNickname}
              placeholder={t("MobileApp.Cards.NicknamePlaceholder")}
              placeholderTextColor="#9ca3af"
              maxLength={64}
              editable={!isSaving}
              className="py-4 text-gray-900"
            />
          </SheetField>

          <Button
            action={{
              onPress: handleSubmit,
              label: isSaving
                ? t("MobileApp.Cards.Adding")
                : t("MobileApp.Cards.AddCard"),
            }}
            isLoading={isSaving}
            containerClassName="mt-2"
          />
        </BottomSheetScrollView>
      </BottomSheet>

      <CardScannerModal
        visible={scanning}
        onClose={() => setScanning(false)}
        onScanned={handleScanned}
      />
    </>
  );
}
```

- [ ] **Step 3: Typecheck, lint and commit**

```bash
npm run typecheck
# Both files, not just the sheet — Task 12 imports SheetField, so leaving it
# untracked breaks the branch while typechecking clean locally.
npx eslint src/screens/traveller/Cards/_components/SheetField.tsx src/screens/traveller/Cards/_components/AddCardSheet.tsx
git commit -m "feat(cards): add the add-card sheet with typed and scanned entry" -- src/screens/traveller/Cards/_components/SheetField.tsx src/screens/traveller/Cards/_components/AddCardSheet.tsx
```

---

### Task 12: Bank row and add-bank sheet

**Files:**
- Create: `src/screens/traveller/Cards/_components/BankRow.tsx`
- Create: `src/screens/traveller/Cards/_components/AddBankSheet.tsx`

**Interfaces:**
- Consumes: `maskIban`, `ibanValid`, `normalizeIban` from `@/utils/card/iban`; `postTravellerBankToken` from `@/actions/RefundService/post`; `CountryInput` (default export) from `@/components/CountryInput/CountryInput`; `describeRequestFailure` from `@/utils/errors`; `SheetField`; `getMyTravellerId`.
- Produces: `BankRow({ token, isPending, disabled, onRename, onSetDefault, onDelete })`; `AddBankSheet({ sheetRef, onAdded })`.

`isPending` and `disabled` are deliberately two props, not one. `isPending` means *this* row is the one mid-flight, and only dims it, so the traveller can see which account is being changed. `disabled` means *some* mutation is in flight and no row may start another — `useCards` refuses a second concurrent mutation, so a row that stayed tappable would let a confirmed delete silently do nothing.

A bank account is not a credit card and must not be drawn as one — hence a row rather than `CardPreview`.

- [ ] **Step 1: Write the bank row**

Create `src/screens/traveller/Cards/_components/BankRow.tsx`:

```tsx
import { Ionicons } from "@/components/Ionicons";
import { useLocalization } from "@/providers/LocalizationProvider";
import { maskIban } from "@/utils/card/iban";
import { SERIAL_FONT } from "@/utils/serialFont";
import { cn } from "@/utils/cn";
import { Pressable, Text, View } from "react-native";
import type { PayoutToken } from "../useCards";

/** One saved bank account, with rename / set-default / delete affordances. */
export function BankRow({
  token,
  isPending,
  disabled,
  onRename,
  onSetDefault,
  onDelete,
}: {
  token: PayoutToken;
  /** This row is the one being changed — dims it so the traveller can tell. */
  isPending: boolean;
  /** Some mutation is in flight; no row may start another. See below. */
  disabled: boolean;
  onRename: () => void;
  onSetDefault: () => void;
  onDelete: () => void;
}) {
  const { t } = useLocalization();

  return (
    <View
      className={cn(
        "flex-row items-center gap-3 rounded-2xl border border-gray-300 bg-white p-4",
        isPending && "opacity-50",
      )}
    >
      <View className="h-11 w-11 items-center justify-center rounded-full bg-gray-100">
        <Ionicons name="business-outline" size={22} color="#111827" />
      </View>

      <View className="flex-1 min-w-0">
        <Pressable onPress={onRename} disabled={disabled}>
          <Text className="text-base font-semibold text-gray-900" numberOfLines={1}>
            {token.nickname ||
              token.bankName ||
              t("MobileApp.Cards.BanksSection")}
          </Text>
        </Pressable>
        <Text className="text-xs text-gray-600" style={{ fontFamily: SERIAL_FONT }}>
          {maskIban(token.maskedNumber)}
        </Text>
      </View>

      {token.isDefault ? (
        <View className="rounded-full bg-amber-100 px-2 py-1">
          <Text className="text-[10px] font-semibold uppercase text-amber-700">
            {t("MobileApp.Cards.Default")}
          </Text>
        </View>
      ) : (
        <Pressable
          onPress={onSetDefault}
          disabled={disabled}
          hitSlop={8}
          accessibilityLabel={t("MobileApp.Cards.SetDefault")}
        >
          <Ionicons name="star-outline" size={20} color="#6B7280" />
        </Pressable>
      )}

      <Pressable
        onPress={onDelete}
        disabled={disabled}
        hitSlop={8}
        accessibilityLabel={t("MobileApp.Cards.Delete")}
      >
        <Ionicons name="trash-outline" size={20} color="#db0000" />
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 2: Write the add-bank sheet**

Create `src/screens/traveller/Cards/_components/AddBankSheet.tsx`:

```tsx
import { postTravellerBankToken } from "@/actions/RefundService/post";
import { BottomSheet } from "@/components/BottomSheet";
import Button from "@/components/Button";
import CountryInput from "@/components/CountryInput/CountryInput";
import { useLocalization } from "@/providers/LocalizationProvider";
import { useToast } from "@/providers/ToastProvider";
import { ibanValid, normalizeIban } from "@/utils/card/iban";
import { SERIAL_FONT } from "@/utils/serialFont";
import { SheetField } from "./SheetField";
import { getMyTravellerId } from "@/utils/card/traveller-id";
import { describeRequestFailure } from "@/utils/errors";
import { logger } from "@/utils/logger";
import type { UniRefund_RefundService_TravellerCards_CreateBankTokenDto } from "@/saas/RefundService";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { BottomSheetScrollView, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { useRef, useState } from "react";
import { Text } from "react-native";

type BankCountryCode =
  UniRefund_RefundService_TravellerCards_CreateBankTokenDto["bankCountryCode"];

/**
 * Adds a bank account as a payout token. Constraints mirror
 * `CreateBankTokenDto` so the client rejects what the server would reject.
 */
export function AddBankSheet({
  sheetRef,
  onAdded,
}: {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  onAdded: () => void;
}) {
  const { t } = useLocalization();
  const toast = useToast();
  const [iban, setIban] = useState("");
  const [bic, setBic] = useState("");
  const [bankName, setBankName] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [holderName, setHolderName] = useState("");
  const [nickname, setNickname] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  // Each submit takes a ticket; dismissing the sheet or starting another submit
  // supersedes it. A boolean cannot express this — a second submit would clear
  // the very flag a slow first submit is still watching, and the first one's late
  // success would then reset and dismiss the sheet the second one is using.
  const attemptRef = useRef(0);

  function reset() {
    setIban("");
    setBic("");
    setBankName("");
    setCountryCode("");
    setHolderName("");
    setNickname("");
    // Cleared here too: dismissing mid-submit would otherwise leave every input
    // locked via `editable={!isSaving}` when the sheet is reopened.
    setIsSaving(false);
  }

  async function handleSubmit() {
    const normalized = normalizeIban(iban);
    if (!ibanValid(normalized)) {
      toast.error(t("MobileApp.Cards.InvalidIban"));
      return;
    }

    const attempt = ++attemptRef.current;
    setIsSaving(true);
    try {
      const travellerId = await getMyTravellerId();
      if (!travellerId) {
        toast.error(t("MobileApp.Cards.NoTravellerId"));
        return;
      }
      await postTravellerBankToken({
        travellerId,
        iban: normalized,
        bic: bic.trim() || undefined,
        bankName: bankName.trim() || undefined,
        // Cast is safe: CountryInput yields ISO-3166 alpha-2, which is exactly
        // the DTO's enum domain, but TypeScript cannot narrow a string to it.
        bankCountryCode: (countryCode || undefined) as BankCountryCode,
        holderName: holderName.trim() || undefined,
        nickname: nickname.trim() || undefined,
      });
      toast.success(t("MobileApp.Cards.AddBankSuccess"));
      onAdded();
      // The account was added and the list needs refreshing either way, but only
      // touch the sheet if this is still the attempt it belongs to.
      if (attemptRef.current === attempt) {
        reset();
        sheetRef.current?.dismiss();
      }
    } catch (err) {
      // Never log the error object: the generated client's ApiError carries
      // `request.body`, which here is the raw IBAN, and logger.error is enabled
      // in production.
      logger.error("Add bank token failed", describeRequestFailure(err));
      toast.error(
        err instanceof Error ? err.message : t("MobileApp.Cards.LoadFailed"),
      );
    } finally {
      // A superseded attempt must not clear the saving state a newer one owns.
      if (attemptRef.current === attempt) setIsSaving(false);
    }
  }

  return (
    <BottomSheet
      ref={sheetRef}
      snapPoints={["85%"]}
      onChange={(index) => {
        if (index === -1) {
          attemptRef.current += 1;
          reset();
        }
      }}
    >
      <BottomSheetScrollView
        contentContainerStyle={{ padding: 16, gap: 12 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-xl font-bold">{t("MobileApp.Cards.AddBank")}</Text>

        <SheetField label={t("MobileApp.Cards.IbanLabel")}>
          <BottomSheetTextInput
            value={iban}
            onChangeText={setIban}
            placeholder={t("MobileApp.Cards.IbanPlaceholder")}
            placeholderTextColor="#9ca3af"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={50}
            editable={!isSaving}
            className="py-4 text-gray-900"
            style={{ fontFamily: SERIAL_FONT }}
          />
        </SheetField>

        <SheetField label={t("MobileApp.Cards.BicLabel")}>
          <BottomSheetTextInput
            value={bic}
            onChangeText={setBic}
            placeholder={t("MobileApp.Cards.BicPlaceholder")}
            placeholderTextColor="#9ca3af"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={11}
            editable={!isSaving}
            className="py-4 text-gray-900"
            style={{ fontFamily: SERIAL_FONT }}
          />
        </SheetField>

        <SheetField label={t("MobileApp.Cards.BankNameLabel")}>
          <BottomSheetTextInput
            value={bankName}
            onChangeText={setBankName}
            placeholder={t("MobileApp.Cards.BankNamePlaceholder")}
            placeholderTextColor="#9ca3af"
            maxLength={256}
            editable={!isSaving}
            className="py-4 text-gray-900"
          />
        </SheetField>

        <CountryInput
          title={t("MobileApp.Cards.BankCountryLabel")}
          value={countryCode}
          onCountryChange={(country) => setCountryCode(country.countryCode2)}
        />

        <SheetField label={t("MobileApp.Cards.AccountHolderLabel")}>
          <BottomSheetTextInput
            value={holderName}
            onChangeText={setHolderName}
            placeholder={t("MobileApp.Cards.HolderNamePlaceholder")}
            placeholderTextColor="#9ca3af"
            maxLength={256}
            editable={!isSaving}
            className="py-4 text-gray-900"
          />
        </SheetField>

        <SheetField label={t("MobileApp.Cards.NicknameLabel")}>
          <BottomSheetTextInput
            value={nickname}
            onChangeText={setNickname}
            placeholder={t("MobileApp.Cards.NicknamePlaceholder")}
            placeholderTextColor="#9ca3af"
            maxLength={64}
            editable={!isSaving}
            className="py-4 text-gray-900"
          />
        </SheetField>

        <Button
          action={{
            onPress: handleSubmit,
            label: isSaving
              ? t("MobileApp.Cards.Adding")
              : t("MobileApp.Cards.AddBank"),
          }}
          isLoading={isSaving}
          containerClassName="mt-2"
        />
      </BottomSheetScrollView>
    </BottomSheet>
  );
}
```

- [ ] **Step 3: Typecheck, lint and commit**

```bash
npm run typecheck
npx eslint src/screens/traveller/Cards/_components/BankRow.tsx src/screens/traveller/Cards/_components/AddBankSheet.tsx
git add src/screens/traveller/Cards/_components/BankRow.tsx src/screens/traveller/Cards/_components/AddBankSheet.tsx
git commit -m "feat(cards): add bank account row and add-bank sheet"
```

---

### Task 13: The cards screen and its route

**Files:**
- Create: `src/screens/traveller/Cards/CardsScreen.tsx`
- Create: `src/app/(auth)/profile/cards.tsx`
- Modify: `src/app/(auth)/profile/_layout.tsx`

**Interfaces:**
- Consumes: everything from Tasks 7–12.
- Produces: default export `CardsScreen`.

Two sections, not one merged list: set-default is **per type**, so a traveller has one default card *and* one default bank at the same time. A single list would show two stars and read as a bug.

- [ ] **Step 1: Write the screen**

Create `src/screens/traveller/Cards/CardsScreen.tsx`:

```tsx
import Button from "@/components/Button";
import { Ionicons } from "@/components/Ionicons";
import { useLocalization } from "@/providers/LocalizationProvider";
import { ModalTemplate } from "@/templates/Modal";
import { formatExpiryFromParts } from "@/utils/card/card";
import { cn } from "@/utils/cn";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { AddBankSheet } from "./_components/AddBankSheet";
import { AddCardSheet } from "./_components/AddCardSheet";
import { BankRow } from "./_components/BankRow";
import { CardPreview } from "./_components/CardPreview";
import { DeleteTokenSheet } from "./_components/DeleteTokenSheet";
import { EditNicknameSheet } from "./_components/EditNicknameSheet";
import { useCards, type PayoutToken } from "./useCards";

function EmptyState({ icon, title, description }: {
  icon: "card-outline" | "business-outline";
  title: string;
  description: string;
}) {
  return (
    <View className="items-center gap-2 rounded-2xl border border-dashed border-gray-300 p-6">
      <Ionicons name={icon} size={32} color="#9CA3AF" />
      <Text className="text-base font-semibold text-gray-900">{title}</Text>
      <Text className="text-center text-sm text-gray-600">{description}</Text>
    </View>
  );
}

/** Small pill rendered into CardPreview's action cluster. */
function CardPill({
  label,
  onPress,
  disabled,
  className,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      hitSlop={6}
      className={cn("rounded-full bg-white/20 px-2 py-1", className)}
    >
      <Text className="text-[10px] font-semibold text-white">{label}</Text>
    </Pressable>
  );
}

export default function CardsScreen() {
  const { t } = useLocalization();
  const { cards, banks, loading, error, pendingId, refresh, setDefault, remove, rename } =
    useCards();

  const addCardRef = useRef<BottomSheetModal>(null);
  const addBankRef = useRef<BottomSheetModal>(null);
  const renameRef = useRef<BottomSheetModal>(null);
  const deleteRef = useRef<BottomSheetModal>(null);
  const [activeToken, setActiveToken] = useState<PayoutToken | null>(null);

  function openRename(token: PayoutToken) {
    setActiveToken(token);
    renameRef.current?.present();
  }

  function openDelete(token: PayoutToken) {
    setActiveToken(token);
    deleteRef.current?.present();
  }

  return (
    <ModalTemplate
      title={t("MobileApp.Cards.Title")}
      description={t("MobileApp.Cards.Description")}
      // ModalTemplate renders its back arrow only when `backAction` is
      // provided, so this must be a real handler, not a no-op.
      backAction={() => router.back()}
    >
      {loading && cards.length === 0 && banks.length === 0 ? (
        <View className="items-center py-10">
          <ActivityIndicator />
        </View>
      ) : error && cards.length === 0 && banks.length === 0 ? (
        <View className="items-center gap-3 py-10">
          <Text className="text-center text-gray-600">
            {t("MobileApp.Cards.LoadFailed")}
          </Text>
          <Button
            // `void refresh()`, not `refresh`: Button's onPress is
            // `() => void | Promise<void>`, and TS only relaxes a mismatched
            // return type when the target is exactly `void`, not a union
            // containing it. `refresh` resolves to the paged DTO.
            action={{
              onPress: () => void refresh(),
              label: t("MobileApp.Cards.Retry"),
            }}
            containerClassName="w-40"
          />
        </View>
      ) : (
        <View className="gap-6 pb-8">
          {/* A refetch can fail while a good list is still on screen — a
              mutation's trailing refresh, for instance, since useAsyncFetch
              swallows its own errors rather than rethrowing. Keep the rows and
              offer a retry instead of replacing everything the traveller was
              reading. */}
          {error && (
            <View className="flex-row items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3">
              <Text className="flex-1 text-sm text-amber-900">
                {t("MobileApp.Cards.LoadFailed")}
              </Text>
              <Pressable onPress={() => void refresh()} hitSlop={8}>
                <Text className="text-sm font-semibold text-amber-900">
                  {t("MobileApp.Cards.Retry")}
                </Text>
              </Pressable>
            </View>
          )}

          {/* Cards */}
          <View className="gap-3">
            <Text className="text-2xl font-bold text-gray-800">
              {t("MobileApp.Cards.CardsSection")}
            </Text>

            {cards.length === 0 ? (
              <EmptyState
                icon="card-outline"
                title={t("MobileApp.Cards.NoCards")}
                description={t("MobileApp.Cards.NoCardsDescription")}
              />
            ) : (
              cards.map((card) => (
                <CardPreview
                  key={card.id}
                  number={card.maskedNumber}
                  holderName={card.holderName ?? undefined}
                  expiry={formatExpiryFromParts(card.expiryMonth, card.expiryYear)}
                  isExpired={card.isExpired}
                  labels={{
                    holderNameLabel: t("MobileApp.Cards.HolderNameLabel"),
                    expiryLabel: t("MobileApp.Cards.ExpiryLabel"),
                  }}
                >
                  <CardPill
                    label={card.nickname || t("MobileApp.Cards.NicknameLabel")}
                    onPress={() => openRename(card)}
                    disabled={pendingId !== null}
                  />

                  {card.isDefault ? (
                    <CardPill
                      label={t("MobileApp.Cards.Default")}
                      className="bg-amber-400/90"
                    />
                  ) : !card.isExpired ? (
                    <CardPill
                      label={t("MobileApp.Cards.SetDefault")}
                      onPress={() => setDefault(card.id)}
                      disabled={pendingId !== null}
                    />
                  ) : null}

                  {card.isExpired && (
                    <CardPill
                      label={t("MobileApp.Cards.Expired")}
                      className="bg-red-500"
                    />
                  )}

                  <CardPill
                    label={t("MobileApp.Cards.Delete")}
                    onPress={() => openDelete(card)}
                    disabled={pendingId !== null}
                  />
                </CardPreview>
              ))
            )}

            <Button
              action={{
                onPress: () => addCardRef.current?.present(),
                label: t("MobileApp.Cards.AddCard"),
              }}
              iconName="add-outline"
            />
          </View>

          {/* Bank accounts */}
          <View className="gap-3">
            <Text className="text-2xl font-bold text-gray-800">
              {t("MobileApp.Cards.BanksSection")}
            </Text>

            {banks.length === 0 ? (
              <EmptyState
                icon="business-outline"
                title={t("MobileApp.Cards.NoBanks")}
                description={t("MobileApp.Cards.NoBanksDescription")}
              />
            ) : (
              banks.map((bank) => (
                <BankRow
                  key={bank.id}
                  token={bank}
                  isPending={pendingId === bank.id}
                  disabled={pendingId !== null}
                  onRename={() => openRename(bank)}
                  onSetDefault={() => setDefault(bank.id)}
                  onDelete={() => openDelete(bank)}
                />
              ))
            )}

            <Button
              action={{
                onPress: () => addBankRef.current?.present(),
                label: t("MobileApp.Cards.AddBank"),
              }}
              iconName="add-outline"
              containerClassName="bg-white border border-primary"
              textClassName="text-primary"
              iconColor="#db0000"
            />
          </View>
        </View>
      )}

      <AddCardSheet sheetRef={addCardRef} onAdded={refresh} />
      <AddBankSheet sheetRef={addBankRef} onAdded={refresh} />
      <EditNicknameSheet
        sheetRef={renameRef}
        token={activeToken}
        onSubmit={rename}
      />
      <DeleteTokenSheet
        sheetRef={deleteRef}
        token={activeToken}
        onConfirm={remove}
      />
    </ModalTemplate>
  );
}
```

- [ ] **Step 2: Add the route**

Create `src/app/(auth)/profile/cards.tsx`:

```tsx
import CardsScreen from "@/screens/traveller/Cards/CardsScreen";

export default function Page() {
  return <CardsScreen />;
}
```

- [ ] **Step 3: Register the screen in the profile stack**

In `src/app/(auth)/profile/_layout.tsx`, add below the existing `edit-profile` entry:

```tsx
      <Stack.Screen name="edit-profile" options={{}} />
      <Stack.Screen name="cards" options={{}} />
```

The tab bar hides itself on this route with no extra work — `(auth)/_layout.tsx` keys `tabBarStyle.display` off `segment?.[2]`, and `/(auth)/profile/cards` puts `"cards"` there, exactly as `edit-profile` relies on.

- [ ] **Step 4: Typecheck, lint and commit**

```bash
npm run typecheck
npx eslint src/screens/traveller/Cards/CardsScreen.tsx "src/app/(auth)/profile/cards.tsx" "src/app/(auth)/profile/_layout.tsx"
git add src/screens/traveller/Cards/CardsScreen.tsx "src/app/(auth)/profile/cards.tsx" "src/app/(auth)/profile/_layout.tsx"
git commit -m "feat(cards): add the cards screen and its route"
```

---

### Task 14: Entry points

**Files:**
- Modify: `src/screens/traveller/Profile/ProfileScreen.tsx`
- Modify: `src/screens/traveller/Home/HomeScreen.tsx`

- [ ] **Step 1: Add the profile menu item**

In `src/screens/traveller/Profile/ProfileScreen.tsx`, insert into `menuItems` immediately after the `Personal Info` entry:

```tsx
    {
      title: t("MobileApp.Cards.Title"),
      icon: "card-outline",
      onPress: () => {
        router.push("/(auth)/profile/cards");
      },
    },
```

- [ ] **Step 2: Add the home shortcut**

In `src/screens/traveller/Home/HomeScreen.tsx`, add the import:

```tsx
import CardAction from "@/components/CardAction";
```

and insert directly below the closing `</Pressable>` of the tax-free-map tile, before the `<Section>`:

```tsx
        <CardAction
          title={t("MobileApp.Cards.Title")}
          description={t("MobileApp.Cards.ShortcutDescription")}
          icon="card-outline"
          onPress={() => router.push("/(auth)/profile/cards")}
        />
```

`CardAction` already renders an icon, title, description and chevron, so the shortcut introduces no new UI vocabulary.

- [ ] **Step 3: Typecheck, lint and commit**

```bash
npm run typecheck
npx eslint src/screens/traveller/Profile/ProfileScreen.tsx src/screens/traveller/Home/HomeScreen.tsx
git add src/screens/traveller/Profile/ProfileScreen.tsx src/screens/traveller/Home/HomeScreen.tsx
git commit -m "feat(cards): reach the cards screen from profile and home"
```

---

### Task 15: Full verification

- [ ] **Step 1: Run the whole suite**

```bash
npm run typecheck
npm run lint
npm test
```

Expected: typecheck clean; lint clean; tests **74 + the new pure-logic tests** passing, with **exactly 4 suites failing to load** — the pre-existing `src/components/__tests__/` resolution failures. Any other failure is a regression from this work.

- [ ] **Step 2: Manual device check**

`npm run android` (and `npm run ios` if available). AGENTS.md requires both to build cleanly before a PR. Walk:

1. Profile → My Cards, and Home → My Cards. Both land on the same screen; the tab bar hides.
2. Empty state renders for both sections on a traveller with no saved tokens.
3. Add a card by typing. It appears in the list with the masked number grouped in fours and the expiry as MM/YY.
4. Add the *same* card again — it must succeed and not duplicate. The backend dedupes and returns the existing token.
5. Scan a card. Confirm the number and expiry prefill, and that a bad read shows the retry message rather than a wrong number.
6. Rename, set-default, delete — each refreshes the list; only the touched row greys out while in flight.
7. Add a bank account with a real IBAN; try an invalid one and confirm it is rejected before any request.
8. With a card and a bank both saved, set each as default and confirm **both** show as default simultaneously — defaults are per type.

- [ ] **Step 3: Report honestly**

State plainly which of the above were exercised on a device and which were not. Camera OCR accuracy against physical cards and all server round-trips can only be confirmed on hardware against the dev backend — do not report them as verified from a typecheck.

---

## Amendments during execution

Recorded as the plan was executed, so the document does not keep teaching a
defect it shipped with.

**Task 3's reference code was wrong twice, in the same function, both times by
violating this plan's own conservative-by-design constraint.** The code in
Task 3 Step 3 above is superseded by `src/utils/card/parse-card-ocr.ts` as
committed; read the file, not the plan, for that function.

1. **The fallback digit-scanning loop was removed.** It brute-forced every
   13–19 digit substring of the concatenated OCR text and returned the first
   Luhn-valid one. That is unsound: a Luhn-valid substring routinely hides
   inside an invalid number. `"1111111111112"` (offset 3, length 13) is
   Luhn-valid inside `"4111111111111112"`, so the loop made this plan's own
   test 3 — "discards a number that fails the Luhn check rather than
   prefilling it" — fail. The narrow case it was meant to recover, a PAN split
   with no separator at all, is already covered for realistic inputs by the
   joined-lines candidate.

2. **The joined-lines candidate no longer competes on length.** It was one
   candidate among the per-line ones with the longest Luhn-valid match
   winning, so a bare-digit line adjacent to the PAN line fused into a longer
   fabricated number that then won: `["4111 1111 1111 1111", "3"]` yielded
   `"41111111111111113"`. No misread is needed — two individually correct OCR
   reads get welded into an invented PAN, and it is structural rather than a
   fluke, since Luhn's rightmost digit is never doubled and appending a digit
   produces a valid checksum for exactly one value in ten. The join is now
   consulted **only when no individual line produced a match**, which keeps
   test 2 (PAN split across four blocks) and test 9 (longest valid wins)
   working while removing the fusion path. A regression test for the fused
   input was added.

Both were caught by the task loop rather than by me: the implementer found
the first empirically and the reviewer found the second, with a concrete
repro. Neither was escalated as a plan contradiction, because this plan's
Global Constraints already state the conservative property as non-tunable and
so answer which side governs.

**`font-mono` was replaced by `SERIAL_FONT` everywhere (7 occurrences, across
Tasks 7, 11 and 12).** This plan originally styled the card number, the
expiry, the masked IBAN and the card/IBAN/BIC inputs with NativeWind's
`font-mono`. That utility does not resolve to a real face on iOS, and this
repo already knew: `src/utils/serialFont.ts` says so in a comment and exports
`SERIAL_FONT = Platform.select({ ios: "Menlo", android: "monospace" })` for
exactly this reason, with `src/screens/shared/_components/TagCard.tsx:106` as
the existing consumer. `font-mono` appeared nowhere else in `src/`. The defect
was silent in the worst way — it typechecks, and it renders correctly on
Android, so only an iOS build would have shown the digit-column alignment
quietly gone from the very numbers that are grouped in fours to make them
scannable. Every affected element now pairs its `className` with
`style={{ fontFamily: SERIAL_FONT }}`, following the TagCard pattern.

**Task 8's doc comment miscounted the hook's own surface.** The comment in
Task 8 Step 3 said the hook owns "the five mutations" while the interface block
directly above it — and every line of the code below it — defined three
(`setDefault`, `remove`, `rename`) plus `refresh`. The two add mutations belong
to the add-sheets in Tasks 11 and 12, which own their own form state. The
implementer followed the interface block over the prose, which is the right
precedence, and flagged the contradiction rather than silently picking a side.
The comment above now matches the shipped file.

**A confirmed delete could silently do nothing (Tasks 8, 12 and 13).**
`useCards`'s `runMutation` refuses a second concurrent mutation by returning
`false`, and originally said nothing when it did. The screen disabled only the
row whose own mutation was in flight (`disabled={pendingId === card.id}`), and
the delete sheet takes `onConfirm: (id) => Promise<void>` so it dismisses
whether or not the delete happened. Tap "Set default" on card A, then — during
the POST and its refetch, a window of seconds — confirm Delete on card B: the
guard trips, the sheet closes, no toast appears, and card B is still there. The
traveller believes they deleted it.

The task reviewer graded the guard Minor precisely because it could not see the
call site: the screen was a later task. That is the cross-task class of finding
the controller has to resolve, and it did not stay Minor once the planned screen
was accounted for. Fixed at the source and made unreachable in the UI:

- `runMutation` now surfaces `MobileApp.Cards.Busy` when the guard trips, so no
  caller can turn a refused mutation into a silent no-op.
- Every card pill uses `disabled={pendingId !== null}`, not `=== card.id`.
- `BankRow` takes `isPending` and `disabled` as separate props. `isPending`
  dims only the row actually being changed, preserving which-row feedback;
  `disabled` blocks all three actions on every row while any mutation is in
  flight. Collapsing them into one prop would have forced a choice between
  correct behaviour and legible feedback.

**An abandoned rename draft could be saved over the real nickname (Task 9).**
`EditNicknameSheet` reseeded its field from a `useEffect` keyed on `token`
identity. The screen renders the sheet unconditionally, so it stays mounted
across dismiss and its state persists, and `useCards` only produces a new
`token` object after a refetch. Reopening the same card without an intervening
mutation therefore showed whatever the traveller last typed and abandoned:
type "Holdiay", dismiss via the backdrop — the deliberate way out, since there
is no Cancel button — reopen, and the field reads "Holdiay" rather than "Work
Visa". Tapping Save then commits the discarded typo. A wrong-data write driven
by input the user believed they had thrown away.

Fixed by also resetting on close through `BottomSheet`'s `onChange`, which is
the pattern this repo already used in
`src/screens/shared/Profile/_components/DeleteAccountModal.tsx:44-53`. The
effect is kept: the two compose, the effect covering a switch to a *different*
token and the reset covering a reopen of the *same* one. Resetting on close
rather than on open also sidesteps a callback-ordering question, since on close
the current token is by definition the one a reopen would show.

Worth noting where this defect was *not*: `AddCardSheet` and `AddBankSheet` both
already reset on close, so an abandoned PAN or IBAN never lingered. The bug
appeared only in the one sheet that seeds from an existing value, where seeding
called for an effect and the reset was forgotten alongside it.

**Scanned card photographs accumulated in the cache directory (Task 10).**
`takePictureAsync` writes a JPEG to the app cache and returns its URI, and
nothing deleted it. Each file is a photograph of a payment card — full PAN,
expiry, usually the holder's name — and the cache is only reclaimed when the OS
decides storage is low, so scanning five cards left five card images on disk
indefinitely.

This one is worth dwelling on, because the task reviewer graded it Minor and was
not being careless: the image never leaves the device, so the constraint as
literally written held. But the constraint exists because card images need
careful handling, which is the whole reason this feature does OCR on-device
instead of posting to the extraction API the web version uses. Keeping images off
third-party servers while leaving them in local storage undercuts the same goal,
and device backups and rooted devices are ordinary threat-model entries for a
payments app. A reviewer's severity grade is evidence, not a verdict.

Fixed by hoisting the URI above the `try` and deleting the file in the existing
`finally`, which covers success, an unreadable card, and the user closing
mid-scan alike. `File.delete()` is synchronous and throws when the file is
already gone, so it gets its own try/catch and can never break the scan. This is
safe in `finally` because `onScanned` receives only the parsed number and expiry
— no caller ever needs the file afterwards.

Also folded in here: the brief's `if (closedRef.current || !photo?.uri) return;`
conflated two cases. A user who walked away should get silence; a capture that
produced no file must say so, or the spinner simply stops and nothing happens.
`KycCameraModal.tsx:45-49` already split them correctly.

**Task 11's commit step would have left a file untracked.** Step 1 creates
`SheetField.tsx` and Step 3 staged only `AddCardSheet.tsx`. That combination
fails in the worst available way: typecheck and lint pass because the file is on
disk, the commit looks clean, Task 12 imports `SheetField` from it, and the
branch is broken for anyone who clones it. Worse for this process specifically,
a file that never enters git is absent from `git diff`, so the per-task review
package and the final whole-branch review would both have been blind to it. The
review loop catches bad code; it structurally cannot catch absent code, which is
why the commit step is worth reading as carefully as the code. Both files are now
staged, via an explicit pathspec.

Task 11 also imported `View` from `react-native` without ever using it, and
numbered two consecutive steps "Step 2". Both corrected above.

**Task 12 carried the identical dead `View` import**, because both add-sheets were
written from the same template — copy a block and you copy its dead code too.
`BankRow` in the same task uses `View` four times, so the import was correct
there; only the sheet's was dead. Both are fixed.

Both instances slipped past two of the three gates, which is worth knowing about
this repo's setup: `tsc` does not treat unused imports as errors, and **eslint is
configured so unused variables are warnings, so it prints the complaint and still
exits 0**. Nothing fails. "typecheck clean, lint clean" is therefore a weaker
signal than it reads as, and a report saying so can coexist with lint output
nobody read. The second instance was caught only because the dispatch told the
implementer to read eslint's output rather than trust its exit code.

**The raw card number was logged in production (Task 11 — Critical).** The worst
defect in this plan, and the one that looked most like careful code:
`logger.error("Add card failed", err)`.

The chain, every link verified: a non-2xx response makes the generated client
throw `ApiError` (`src/saas/core/ApiError.ts:4-20`), which assigns
`this.request = request` as a public own enumerable property; `ApiRequestOptions.body`
is the payload just sent, here `{ travellerId, cardNumber, cardExpiryMonth,
cardExpiryYear, holderName, nickname }` with the **raw PAN**; `logger.error` is
enabled unconditionally in production (`src/utils/logger.ts:18-21`) and forwards
to `console.error`, which prints an Error's own enumerable properties. So every
rejected submission — a duplicate card, a business-rule failure, an expired card
— wrote the full card number and holder name into the device's native log, where
a crash reporter or log aggregator collects it. That is precisely the card-data
retention this feature exists to avoid, arriving through the error path instead
of the success path.

Fixed with `describeRequestFailure` in `src/utils/errors.ts`, which reduces an
unknown error to status, statusText, method and URL. The response body is
excluded as well, since a validation error can echo back what was sent. The
user-facing `toast.error(err.message)` was checked and kept: `ApiError`'s message
is only a generic status string like "Bad Request"
(`src/saas/core/request.ts:237-259`), never a body.

Two things hid it. It typechecks and lints perfectly, and it reads like the
conscientious thing to write — the PAN sits three property accesses deep inside
an object nobody passes deliberately. Finding it meant reading the generated
client's error class, which no diff shows you. `fetchRequest` was checked too and
does not log error objects, so the leak was per-call-site rather than systemic.

**Task 12 had the identical line with an IBAN** and has been amended above, along
with the same dismissed-mid-submit guard and `isSaving` reset. Both add-sheets now
import `describeRequestFailure`.

**Two more Task 11 defects, both real:**

- `reset()` never cleared `isSaving`. Dismissing mid-submit — swipe, backdrop, or
  Android back, none of which are blocked — then reopening left every input
  locked behind `editable={!isSaving}` until the abandoned request resolved, and
  if it then succeeded its continuation dismissed the sheet the traveller had
  reopened and was typing in. `reset()` now clears it, and each submit takes a
  ticket from an `attemptRef` counter that guards the success continuation:
  `onAdded()` still fires unconditionally because the card really was created and
  the list must refresh, but the sheet's own state and visibility are left alone
  once its attempt has been superseded.

  The first fix used a shared boolean, and the re-review was right to keep
  pulling on it. Clearing `isSaving` on dismiss — necessary, to unlock the
  reopened sheet — also makes a second concurrent submit possible, and at that
  point a boolean cannot say *which* submit it refers to: the second submit
  clears the very flag the first is still watching, so the first one's late
  success resets and dismisses the sheet the second is using. Both cards are
  still added, so nothing is lost, but the sheet closes under the traveller
  mid-submit. A monotonic ticket answers the question the boolean could not —
  "is this still the attempt the sheet belongs to?" — and the same guard keeps a
  superseded attempt from clearing an `isSaving` a live one owns. Worth recording
  because the race was introduced *by* the previous fix: closing the obvious bug
  opened a subtler one, and only tracing the sequence again caught it.
- `parseExpiry` validates shape and month range, never recency, so a Luhn-valid
  card expiring `01/20` was submitted and rejected server-side. This also fed the
  Critical above: an expired card is a reliable way to trigger the rejection that
  logged the PAN — two findings sharing one path. Added `isExpiredCard(month,
  year, now = new Date())` to `src/utils/card/card.ts` with an injectable clock
  and five tests, the load-bearing one asserting the *current* month is still
  valid, since a card is good through the end of its expiry month and that
  off-by-one is the classic bug here.

**A failed refetch wiped a perfectly good list (Task 13).** The `error` branch
replaced the whole card and bank list whenever `error` was truthy, drawing no
distinction between "never loaded" and "we have good data and a background
refresh hiccuped". Those need different treatment, and the second case is
reachable through the feature's own happy path:

`useAsyncFetch`'s `execute` catches its own errors, calls `setError`, and returns
`undefined` without rethrowing (`src/hooks/useAsyncFetch.tsx:65-71`). `useCards`'s
`runMutation` awaits `execute()` after a successful mutation, so from its point of
view that await succeeded and it goes on to fire `toast.success`. Tap "Set
default", let the POST succeed and its trailing refetch fail, and the traveller
gets a "Default updated" toast sitting on top of a full-screen "Couldn't load your
payout methods", with every row they were reading gone. Both statements are true
and they contradict each other.

Recoverable — `execute` calls `setError(null)` on entry, so Retry works — but the
traveller has no way to know that, and losing the list is the part that reads as
broken. The full-screen failure view is now gated on there being nothing else to
show; when data is already on screen the rows stay and the failure appears as a
compact banner with its own retry. Both strings were already in the locale files.

**Task 13's Retry button did not typecheck.** `action={{ onPress: refresh }}` fails
because `Button`'s `onPress` is `() => void | Promise<void>` and `refresh`
resolves to the paged DTO. TypeScript relaxes a mismatched return type only when
the target is *exactly* `void`; against a union containing `void`, the source's
`Promise<PagedResultDto>` must be assignable to `Promise<void>`, and it is not.
That is also why `onAdded={refresh}` — target `() => void` — was fine in the same
file while this was not. Fixed with `() => void refresh()`, which the repo already
uses in four places including this feature's own
`CardScannerModal.tsx:102`.

Worth noting how it was caught: this one the compiler *did* find, which is why it
is the least interesting defect in this list. Every other entry above typechecked
cleanly.

The general lesson, since it cost three fix rounds across two tasks and one
pre-review correction: the code blocks in this plan were written without
cross-checking them against the conventions already established in `src/`, and
in one place without cross-checking a comment against the interface beside it.
Transcribing them faithfully is the right behaviour for an implementer, so a
plan that contradicts the codebase — or itself — gets built wrong by a
correctly-behaving worker. Reviewers with access to the surrounding code, and
implementers willing to flag a contradiction instead of resolving it silently,
are what caught all four.

## Notes for the implementer

- **The tenant cookie fix landed on `main` on 2026-07-29** (`82823e1`). If API calls behave oddly on an old build, a stale `__tenant` cookie is the likely cause; a reinstall clears it.
- **`getMyTravellerId()` returning `""` is a real state**, not a bug to code around. Show `MobileApp.Cards.NoTravellerId` rather than sending a request that will 400.
- **Do not "fix" the component test preset.** It is a known, pre-existing failure and out of scope; bundling it in would make this work hard to review.
- **If a task's code does not compile against the generated client**, check the actual method name with
  `grep -n "public " src/saas/RefundService/sdk.gen.ts` rather than guessing — the generator's naming is mechanical but long.
- **`contentContainerStyle` rather than a className on the bottom-sheet scroll views** is deliberate. NativeWind's `contentContainerClassName` support on third-party scrollables is not something this codebase already relies on anywhere, so the sheets use a plain style object for padding and gap. Everything inside them is still styled with classes.

# Refund Payout Destinations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the refund confirm sheet's two-mode selector with one question — where does this refund land? — answered by four destinations, each writing exactly one `CreateRefundDto` field.

**Architecture:** `RefundPayoutStep` (replacing `RefundCardStep`) renders one radio group over four rows: a saved card, a saved bank token, a card captured at the desk, or a typed IBAN. It hands the sheet a single `RefundPayout` value; `buildCreateRefundDto` branches on it to write `travellerCardId`, `travellerBankTokenId`, `paidCardDetail` or `ibanInfo` — never two.

**Tech Stack:** React Native (Expo), TypeScript, Jest (`jest-expo`), NativeWind.

**Spec:** `docs/superpowers/specs/2026-09-17-refund-card-selection-design.md` (revised 2026-09-17)
**Design:** https://claude.ai/artifact/D4VMpikXkAGHaSm1xL14V7

## Global Constraints

- **Repo:** `c:\unirefund\super-app`. All paths relative to it.
- **Render tests MUST be `*.router.test.tsx`** — anything calling `render` or `renderHook`. Pure-function tests use plain `*.test.ts`.
- **New i18n keys need `npm run init`** before `tsc` passes. Author in `src/localization/resources/{en-US,tr-TR}.json` WITHOUT the `MobileApp.` prefix, then `npm run init`, then `npm run check:language-data`. Needs network; report BLOCKED if it fails rather than working around it.
- **Never log an error object on a card path.** `ApiError` carries `request.body` — the raw PAN — and `logger.error` runs in production. Use `describeRequestFailure` from `@/utils/errors`.
- **Never send a full PAN in `paidCardDetail`.** Always `maskCardNumber(...)`.
- **Exactly one destination field per refund.** Never two, never none for a CreditCard refund.
- **Baseline:** `npx jest` → 234 suites pass. `npx tsc --noEmit` → exactly ONE pre-existing error in `src/app/__tests__/tabBackNavigation.router.test.tsx`. `npx eslint src` → 0 errors.
- **Shared checkout.** Another agent session works here with uncommitted files. Never `git reset --hard`, `git stash` or `git clean`. Stage only by explicit path; never `git add -A`.

### A warning about this plan's sample code

The previous plan for this feature shipped sample code that had never been
executed, and **six defects in it surfaced during implementation** — a test that
could never pass, a wrong expiry expectation, jest mocks keyed on the wrong
specifier, a conditional that hid the wrong control. Every one cost a round trip.

**What was verified for this plan, against the real files:**

- `parseExpiry("12/34")` returns `{ month: 12, year: 2034 }` — the expiry
  expectation below is the four-digit year, which is what broke last time.
- `maskCardNumber("4111 1111 1111 1111")` returns `411111******1111`.
- `TravellerCardDto` really carries `isDefault`, `isExpired`, `expiryMonth`,
  `expiryYear`, `maskedNumber`, `bankName` and `type` — the names the sort
  and its tests use. `bankName` is documented as null for card tokens.
- `PayoutTokenType` is exactly `'Card' | 'Bank' | 'Wallet'`.
- `buildCreateRefundDto(state, signaturesBase64, paidDate)` and
  `canSubmit(state, now?)` have the signatures the tests below call.
- `renderFlow()` exists in the hook's suite and defaults `travellerId` to
  `"trv-1"`; `mockGetCards` is the mock handle for the cards API.
- `RefundCardStep`'s prop shape is the one `RefundPayoutStep` inherits.

So: code blocks below are **a starting point, not a specification**. Where a
block disagrees with the real code, the real code wins — say so in your report
and implement what actually works. Type signatures, DTO field names and the
project constraints above ARE binding.

---

### Task 1: The payout type, the DTO branch, and the ordering rules

**Files:**
- Modify: `src/screens/shared/Tags/Tag/_components/refund/refund.logic.ts`
- Test: `src/screens/shared/Tags/Tag/_components/refund/__tests__/refund.logic.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `RefundPayout` (replacing `RefundCardChoice`), `RefundFlowState.payout` (replacing `.cardChoice`), `IbanEntry`, `isIbanEntryValid`, and `sortPayoutTokens`.

- [ ] **Step 1: Write the failing tests**

Append to `refund.logic.test.ts`. It already imports `buildCreateRefundDto`
and `canSubmit` — add only `sortPayoutTokens` to that import.

```ts
/**
 * Four destinations, four DTO fields, and never two at once. The DTO holds all
 * four; sending two would be asking for one refund twice.
 */
describe("the payout destination picks the DTO field", () => {
  const tag = (id: string) => ({ id, currency: "DKK", refund: 10 }) as never;
  const state = (payout: unknown) =>
    ({
      refundPointId: "rp-1",
      selectedTags: [tag("1")],
      method: "CreditCard",
      payout,
      signatures: {},
      isSubmitting: false,
    }) as never;
  const at = "2026-09-17T00:00:00.000Z";
  const only = (dto: Record<string, unknown> | null) =>
    ["travellerCardId", "travellerBankTokenId", "paidCardDetail", "ibanInfo"]
      .filter((k) => dto?.[k] !== undefined);

  it("writes travellerCardId for a saved card", () => {
    const dto = buildCreateRefundDto(
      state({ kind: "savedCard", travellerCardId: "c1" }), {}, at);
    expect(dto?.travellerCardId).toBe("c1");
    expect(only(dto)).toEqual(["travellerCardId"]);
  });

  it("writes travellerBankTokenId for a saved bank token", () => {
    const dto = buildCreateRefundDto(
      state({ kind: "savedBank", travellerBankTokenId: "b1" }), {}, at);
    expect(dto?.travellerBankTokenId).toBe("b1");
    expect(only(dto)).toEqual(["travellerBankTokenId"]);
  });

  it("writes a MASKED paidCardDetail for a card captured at the desk", () => {
    const dto = buildCreateRefundDto(
      state({
        kind: "newCard",
        card: { number: "4111 1111 1111 1111", expiry: "12/34" },
      }), {}, at);
    expect(dto?.paidCardDetail?.maskedNumber).toBe("411111******1111");
    expect(dto?.paidCardDetail?.cardExpiryYear).toBe(2034);
    expect(only(dto)).toEqual(["paidCardDetail"]);
  });

  it("writes ibanInfo for a typed bank account", () => {
    const dto = buildCreateRefundDto(
      state({
        kind: "newBank",
        iban: { iban: "DK5000400440116243", bic: "DABADKKK", bankName: "Danske Bank" },
      }), {}, at);
    expect(dto?.ibanInfo?.iban).toBe("DK5000400440116243");
    expect(only(dto)).toEqual(["ibanInfo"]);
  });

  it("refuses a CreditCard refund with nothing chosen", () => {
    expect(canSubmit(state(null))).toBe(false);
  });

  // A saved token is already vaulted — there are no digits to Luhn-check.
  it("does not Luhn-check a saved token", () => {
    expect(canSubmit(state({ kind: "savedCard", travellerCardId: "c1" }))).toBe(true);
  });

  it("still Luhn-checks a card captured at the desk", () => {
    expect(canSubmit(state({
      kind: "newCard",
      card: { number: "4111 1111 1111 1112", expiry: "12/34" },
    }))).toBe(false);
  });

  it("requires iban, bic and bank name for a typed account", () => {
    expect(canSubmit(state({
      kind: "newBank", iban: { iban: "DK5000400440116243", bic: "", bankName: "X" },
    }))).toBe(false);
  });
});

/**
 * The order the picker shows tokens in, and the reason the three-row cap is
 * safe: without this, three expired cards fill the visible list and hide every
 * usable one behind a tap.
 */
describe("sortPayoutTokens", () => {
  // NOT `as never` like the helpers above: sortPayoutTokens is generic, so a
  // `never` element infers T = never, the result is never[], and every
  // `out[0].id` below fails to typecheck while jest still passes.
  type Token = {
    id: string;
    isDefault: boolean;
    isExpired: boolean;
    expiryYear: number;
    expiryMonth: number;
  };
  const t = (id: string, over: Partial<Token> = {}): Token => ({
    id,
    isDefault: false,
    isExpired: false,
    expiryYear: 2030,
    expiryMonth: 1,
    ...over,
  });

  it("puts the default first", () => {
    const out = sortPayoutTokens([t("a"), t("b", { isDefault: true }), t("c")]);
    expect(out[0].id).toBe("b");
  });

  it("orders payable tokens by expiry, furthest out first", () => {
    const out = sortPayoutTokens([
      t("soon", { expiryYear: 2027 }),
      t("later", { expiryYear: 2031 }),
    ]);
    expect(out.map((x) => x.id)).toEqual(["later", "soon"]);
  });

  it("sinks every expired token below every payable one", () => {
    const out = sortPayoutTokens([
      t("dead1", { isExpired: true, expiryYear: 2099 }),
      t("live", { expiryYear: 2027 }),
      t("dead2", { isExpired: true }),
    ]);
    expect(out[0].id).toBe("live");
    expect(out.slice(1).every((x) => x.isExpired)).toBe(true);
  });

  // An expired default must not claim the first slot it can no longer use.
  it("does not let an expired default outrank a payable token", () => {
    const out = sortPayoutTokens([
      t("deadDefault", { isDefault: true, isExpired: true }),
      t("live"),
    ]);
    expect(out[0].id).toBe("live");
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest src/screens/shared/Tags/Tag/_components/refund/__tests__/refund.logic.test.ts`
Expected: FAIL — `payout` is not on `RefundFlowState` and `sortPayoutTokens` does not exist.

- [ ] **Step 3: Replace `RefundCardChoice` with `RefundPayout`**

Delete `RefundCardChoice` and add:

```ts
/** A bank account typed at the desk. */
export type IbanEntry = { iban: string; bic: string; bankName: string };

/**
 * Where a refund's money goes — one of four, never two.
 *
 * `CreateRefundDto` carries a field for each, and sending two would be asking
 * for one refund twice. A union makes that non-representable rather than a rule
 * someone has to remember.
 */
export type RefundPayout =
  | { kind: "savedCard"; travellerCardId: string }
  | { kind: "savedBank"; travellerBankTokenId: string }
  | { kind: "newCard"; card: CardEntry }
  | { kind: "newBank"; iban: IbanEntry };
```

Rename `RefundFlowState.cardChoice` to `payout: RefundPayout | null`.

```ts
/** All three parts are required by the DTO; whitespace is not an answer. */
export function isIbanEntryValid(entry: IbanEntry): boolean {
  return (
    entry.iban.trim().length > 0 &&
    entry.bic.trim().length > 0 &&
    entry.bankName.trim().length > 0
  );
}
```

- [ ] **Step 4: Gate `canSubmit` per destination**

```ts
  if (methodNeedsCard(state.method)) {
    const payout = state.payout;
    if (!payout) return false;
    // A saved token is already vaulted — no digits to check. Only what was
    // entered at the desk gets validated here.
    if (payout.kind === "newCard" && !isCardEntryValid(payout.card, now))
      return false;
    if (payout.kind === "newBank" && !isIbanEntryValid(payout.iban))
      return false;
  }
```

- [ ] **Step 5: Branch the DTO four ways**

```ts
  if (state.method === "CreditCard" && state.payout) {
    const payout = state.payout;
    if (payout.kind === "savedCard") {
      dto.travellerCardId = payout.travellerCardId;
    } else if (payout.kind === "savedBank") {
      dto.travellerBankTokenId = payout.travellerBankTokenId;
    } else if (payout.kind === "newCard") {
      const parsed = parseExpiry(payout.card.expiry);
      if (!parsed) return null;
      dto.paidCardDetail = {
        // The API contract forbids a full PAN here — always mask.
        maskedNumber: maskCardNumber(payout.card.number),
        cardExpiryMonth: parsed.month,
        cardExpiryYear: parsed.year,
      };
    } else {
      dto.ibanInfo = {
        iban: payout.iban.iban.trim(),
        bic: payout.iban.bic.trim(),
        bankName: payout.iban.bankName.trim(),
      };
    }
  }
```

- [ ] **Step 6: Add the sort**

```ts
/**
 * The order saved tokens are offered in.
 *
 * Payable before expired, always — the picker shows only the first few, and an
 * expired token that claims a visible slot hides a usable one behind a tap.
 * Within the payable ones the default leads, then the furthest from expiring,
 * which is the card most likely still in the traveller's wallet.
 */
export function sortPayoutTokens<
  T extends {
    isDefault?: boolean;
    isExpired?: boolean;
    expiryYear?: number;
    expiryMonth?: number;
  },
>(tokens: readonly T[]): T[] {
  const rank = (t: T) => (t.expiryYear ?? 0) * 12 + (t.expiryMonth ?? 0);
  return [...tokens].sort((a, b) => {
    if (!!a.isExpired !== !!b.isExpired) return a.isExpired ? 1 : -1;
    if (!!a.isDefault !== !!b.isDefault) return a.isDefault ? -1 : 1;
    return rank(b) - rank(a);
  });
}
```

- [ ] **Step 7: Run the tests**

Run: `npx jest src/screens/shared/Tags/Tag/_components/refund/__tests__/refund.logic.test.ts`
Expected: PASS. `tsc` will now error in `useRefundHomeFlow.ts`, `RefundCardStep.tsx` and `RefundConfirmSheet.tsx` — expected, cleared by Tasks 2-4.

- [ ] **Step 8: Commit**

```bash
git add src/screens/shared/Tags/Tag/_components/refund/refund.logic.ts src/screens/shared/Tags/Tag/_components/refund/__tests__/refund.logic.test.ts
git commit -m "feat(refund): four payout destinations, one DTO field each

A union over saved card, saved bank token, a card captured at the desk and a
typed IBAN makes it impossible to send two destination fields for one refund.
Adds the token sort that keeps expired tokens out of the picker's visible rows."
```

---

### Task 2: Load bank tokens beside the cards

**Files:**
- Modify: `src/screens/shared/Tags/Tag/_components/refund/useRefundHomeFlow.ts`
- Test: `src/screens/shared/Tags/Tag/_components/refund/__tests__/useRefundHomeFlow.router.test.ts`

**Interfaces:**
- Consumes: `RefundPayout`, `sortPayoutTokens` (Task 1).
- Produces: `savedCards` and `savedBanks` (both sorted), `isLoadingTokens` (renamed from `isLoadingCards`), and `submit(payout: RefundPayout | null)`.

The hook already loads the traveller's tokens and throws away everything that
is not `type === "Card"`. The same response carries the bank tokens.

- [ ] **Step 1: Write the failing tests**

The suite already mocks `getTravellerCardsByTravellerIdApi`. Add:

```ts
describe("useRefundHomeFlow saved tokens", () => {
  const token = (id: string, type: string, over: Record<string, unknown> = {}) =>
    ({
      id, travellerId: "trv-1", type, isDefault: false, isExpired: false,
      maskedNumber: `···· ${id}`, expiryMonth: 12, expiryYear: 2030, ...over,
    }) as never;

  it("splits the response into cards and bank tokens", async () => {
    mockGetCards.mockResolvedValue([
      token("1", "Card"), token("2", "Bank"), token("3", "Wallet"),
    ]);
    const { result } = renderFlow();

    await waitFor(() => expect(result.current.savedCards).toHaveLength(1));
    expect(result.current.savedCards[0].id).toBe("1");
    expect(result.current.savedBanks.map((b) => b.id)).toEqual(["2"]);
  });

  // A Wallet token settles neither a card nor a bank refund.
  it("drops wallet tokens from both lists", async () => {
    mockGetCards.mockResolvedValue([token("3", "Wallet")]);
    const { result } = renderFlow();

    await waitFor(() => expect(mockGetCards).toHaveBeenCalled());
    expect(result.current.savedCards).toEqual([]);
    expect(result.current.savedBanks).toEqual([]);
  });

  it("returns each list already sorted, expired last", async () => {
    mockGetCards.mockResolvedValue([
      token("dead", "Card", { isExpired: true }),
      token("live", "Card"),
    ]);
    const { result } = renderFlow();

    await waitFor(() => expect(result.current.savedCards).toHaveLength(2));
    expect(result.current.savedCards[0].id).toBe("live");
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest src/screens/shared/Tags/Tag/_components/refund/__tests__/useRefundHomeFlow.router.test.ts`
Expected: FAIL — `savedBanks` does not exist.

- [ ] **Step 3: Split the loaded tokens**

In the cards effect, replace the single filter with a split, sorting each list
through `sortPayoutTokens`. Keep the existing request-id guard exactly as it is —
it is what stops a slow earlier response overwriting a newer one — and keep the
`setIsLoading…(false)` on the `!travellerId` early return that a review added.

Rename `isLoadingCards` to `isLoadingTokens` **only inside this file and its
own test**. The name also appears in `RefundCardStep.tsx`,
`RefundConfirmSheet.tsx`, `RefundSurface.tsx` and three render tests — leave
every one of them alone. Task 3 rewrites the first, Task 4 deletes it and
updates the rest, so renaming them here is work that gets thrown away and an
edit collision besides. `RefundSurface.tsx:367` will not compile until Task 4;
that is expected, exactly as Task 1's downstream errors were.

- [ ] **Step 4: Retype `submit`**

`submit(payout: RefundPayout | null)`, building `RefundFlowState.payout` from it.

- [ ] **Step 5: Run the tests**

Run: `npx jest src/screens/shared/Tags/Tag/_components/refund/__tests__/useRefundHomeFlow.router.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/screens/shared/Tags/Tag/_components/refund/useRefundHomeFlow.ts src/screens/shared/Tags/Tag/_components/refund/__tests__/useRefundHomeFlow.router.test.ts
git commit -m "feat(refund): keep the traveller's bank tokens too

The same response always carried them; the hook filtered them out. Both lists
come back sorted, so the picker's visible rows are never spent on an expired
token."
```

---

### Task 3: The payout step

**Files:**
- Create: `src/screens/shared/Tags/Tag/_components/refund/RefundPayoutStep.tsx`
- Create: `src/screens/shared/Tags/Tag/_components/refund/__tests__/RefundPayoutStep.router.test.tsx`
- Modify: `src/localization/resources/{en-US,tr-TR}.json`

**Interfaces:**
- Consumes: `RefundPayout`, `IbanEntry` (Task 1); `savedCards`, `savedBanks`, `isLoadingTokens` (Task 2).
- Produces:

```ts
export type RefundPayoutStepValue = {
  payout: RefundPayout | null;
  /** A card captured here, pending the vault at confirm. */
  pendingCard: CardEntry | null;
};

RefundPayoutStep({
  savedCards: TravellerCard[];
  savedBanks: TravellerCard[];
  isLoadingTokens?: boolean;
  canPayLive: boolean;
  value: RefundPayoutStepValue;
  onChange: (value: RefundPayoutStepValue) => void;
  disabled?: boolean;
  t: ReturnType<typeof useLocalization>["t"];
})
```

**`t` is a prop, never a hook.** This renders inside a `<BottomSheet>`, where a
context hook resolves at the `@gorhom/portal` host and renders raw i18n keys.

**Model the row and capture markup on the existing `RefundCardStep.tsx`** — it
already solves the capture modals, the `BottomSheetTextInput` wiring, the
expired-token treatment and the mode-switch clearing. This task rearranges those
parts into four rows; it does not reinvent them.

**Requirements, in priority order:**

1. **One radio group, four row kinds.** Selecting any row clears every other row's entered value — the `clearTypedCard` helper that exists today is the pattern.
2. **Only the selected "different …" row expands.** A saved-token row never expands.
3. **Cap the saved-card rows at three.** Above that, render a "Show N more cards" row that expands the list in place. The lists arrive sorted (Task 2), so take the first three. Bank tokens are usually few — cap them the same way for consistency.
4. **Expired tokens render greyed and non-pressable**, badged with the existing `MobileApp.Cards.Expired` key. They sort last already, so they should not appear in the visible three unless everything is expired.
5. **While `isLoadingTokens`, show a skeleton, not "none".** An agent who reads "no saved cards" starts capturing a card the traveller already has.
6. **Tap is gated on `useNfcSupported()`** — iOS never reports a payment card to a reader session.
7. **`MobileApp.Refund.CardInvalid` is shown** when a captured card fails validation, as it is today.
8. **The IBAN row's three fields** (IBAN, BIC, bank name) are all required; show the invalid message until all three are filled.

**Reuse these existing keys — do NOT add new ones for them.** My Cards already
labels exactly these fields, and the refund flow is borrowing its capture set
anyway, so the wording should match what the same agent sees there:

| Need | Existing key |
|---|---|
| IBAN field label / placeholder | `Cards.IbanLabel` / `Cards.IbanPlaceholder` |
| BIC field label / placeholder | `Cards.BicLabel` / `Cards.BicPlaceholder` |
| Bank name label / placeholder | `Cards.BankNameLabel` / `Cards.BankNamePlaceholder` |
| Invalid bank details | `Cards.InvalidIban` |
| Expired token badge | `Cards.Expired` |
| Default token badge | `Cards.Default` |
| Invalid captured card | `Refund.CardInvalid` |

**Genuinely new keys** (author in both locales WITHOUT the `MobileApp.` prefix,
then `npm run init`):

| Key | en-US | tr-TR |
|---|---|---|
| `Refund.PayoutTo` | Pay this refund to | Bu iadeyi şuraya öde |
| `Refund.SavedBank` | Saved bank account | Kayıtlı banka hesabı |
| `Refund.DifferentCard` | A different card | Başka bir kart |
| `Refund.DifferentBank` | A different bank account | Başka bir banka hesabı |
| `Refund.ShowMoreCards` | Show {count} more | {count} tane daha göster |

**Dead once the mode selector goes** — remove in this task: `Refund.CardModeLive`,
`Refund.CardModeRecord`, `Refund.CardUseAnother`, `Refund.CardNoneSaved`,
`Refund.CardSaved`, `Refund.ConfirmPay`. Check each with a grep before deleting;
`Refund.CardNumber` and `Refund.CardExpiry` stay (the capture rows still use them).

- [ ] **Step 1: Add the i18n keys, regenerate, verify**

Author both locales, run `npm run init`, then `npm run check:language-data` — it must print "Generated data is up to date".

- [ ] **Step 2: Write the failing tests**

Cover, at minimum: all four row kinds render; picking a saved card reports `{ kind: "savedCard", travellerCardId }`; picking a saved bank reports `{ kind: "savedBank", travellerBankTokenId }`; typing a card reports a `pendingCard` and NOT a payout; filling all three IBAN fields reports `{ kind: "newBank" }`; selecting a saved card after typing clears the typed digits; an expired token is not pressable; four cards render three rows plus a "Show 1 more"; `isLoadingTokens` suppresses the empty-state copy.

Mock the capture modals with the **`@/screens/traveller/...` alias form** and mock `@gorhom/bottom-sheet`'s `BottomSheetTextInput` — copy both from `RefundCardStep.router.test.tsx`, which already does this correctly.

- [ ] **Step 3: Run them and watch them fail**

- [ ] **Step 4: Build the component**

Leave `RefundCardStep.tsx` in place — Task 4 deletes it in the same commit
that removes its last import, so no commit leaves an unresolvable module.

Keep it under ~350 lines; if it runs longer, the row renderer wants extracting into a sibling file.

- [ ] **Step 5: Run the tests, then the folder**

Run: `npx jest src/screens/shared/Tags/Tag/_components/refund`

- [ ] **Step 6: Commit**

```bash
git add src/screens/shared/Tags/Tag/_components/refund/ src/localization/resources/
git commit -m "feat(refund): one payout picker over four destinations

Replaces the mode selector, which asked an API question an agent has never
heard. Saved tokens cap at three visible rows so the signatures and the pay
button stay in reach."
```

---

### Task 4: Wire the sheet

**Files:**
- Modify: `RefundConfirmSheet.tsx`, `RefundSurface.tsx`
- Delete: `RefundCardStep.tsx` and `__tests__/RefundCardStep.router.test.tsx`
- Test: `__tests__/RefundConfirmSheet.router.test.tsx`, `__tests__/RefundSurface.router.test.tsx`

**Interfaces:** consumes everything above. `onConfirm` becomes `(payout: RefundPayout | null) => void`.

**A captured card is NOT vaulted. Corrected 2026-09-17.**

This task originally said a captured card is vaulted at confirm and sent as
`travellerCardId`. That contradicted both the spec's own table ("A different
card → `paidCardDetail`") and the explicit four-option list this work was
commissioned from, where option 3 is `cardDetail`. The spec wins. A card
captured at the desk travels as `paidCardDetail`, masked, and nothing is
written to the traveller's account.

This also retires the plan's largest open risk: nobody ever verified that
`postTravellerCard` accepts a staff token against another traveller's id, and
two of the four destinations depended on it. They no longer do.

- [ ] **Step 1: Put mod-97 behind the typed IBAN**

In `refund.logic.ts`, `isIbanEntryValid` currently only checks all three fields
are non-empty, so a mistyped IBAN passes the sheet and posts. `ibanValid` in
`src/utils/card/iban.ts:21` already does ISO 13616 mod-97 and is what the bank
form uses. Use it:

```ts
export function isIbanEntryValid(entry: IbanEntry): boolean {
  return (
    ibanValid(entry.iban) &&
    entry.bic.trim().length > 0 &&
    entry.bankName.trim().length > 0
  );
}
```

Verified: `ibanValid("DK5000400440116243")` is `true` (the IBAN already in
Task 1's committed tests, so they keep passing) and a single-digit typo of it is
`false`. Add a test for the typo case.

The picker reads the same helper, so the row and `canSubmit` cannot disagree
about whether an IBAN is acceptable — that agreement is why the validation goes
here and not in the component.

- [ ] **Step 2: Write the failing tests**

- a captured card confirms as `{ kind: "newCard", card }` — **no vault call**
- picking a saved card confirms `{ kind: "savedCard", travellerCardId }`
- picking a saved bank confirms `{ kind: "savedBank", travellerBankTokenId }`
- a typed IBAN confirms `{ kind: "newBank", iban }`
- a mistyped IBAN does not enable Confirm

**Widen `renderSheet`'s defaults** with `savedBanks: []` and
`isLoadingTokens: false`, or every existing test in the file stops compiling.
Drop the `vaultCard` default and any test asserting vault behaviour.

- [ ] **Step 3: Run them and watch them fail**

- [ ] **Step 4: Swap the step, retype the handler, delete what dies**

`RefundPayoutStep` replaces `RefundCardStep`. At confirm, map the step's value to
a payout: `value.payout` when set, otherwise `value.pendingCard` becomes
`{ kind: "newCard", card: value.pendingCard }`. No vault, no async, no failure
path — the confirm handler stays synchronous.

Delete in this same commit, once nothing imports them:
- `RefundCardStep.tsx` and `__tests__/RefundCardStep.router.test.tsx`
- `vaultCard` from `useRefundHomeFlow.ts`, its `postTravellerCard` import, and
  its tests in `__tests__/useRefundHomeFlow.router.test.ts`. It is now dead, it
  handles raw PANs, and it depends on that unverified permission — leaving it in
  the tree invites someone to wire it back up.
- The five i18n keys Task 3 could not remove while `RefundCardStep` still read
  them: `Refund.CardModeLive`, `Refund.CardModeRecord`, `Refund.CardUseAnother`,
  `Refund.CardNoneSaved`, `Refund.CardSaved`. Also check `Refund.CardNumber` and
  `Refund.CardExpiry` — Task 3 reports nothing but a test's fake translation map
  references them; grep before deciding. Removing keys needs `npm run init` then
  `npm run check:language-data`.

- [ ] **Step 5: Pass the new props from `RefundSurface`**

`savedBanks={flow.savedBanks}`, `isLoadingTokens={flow.isLoadingTokens}`, and
`handleConfirm` retyped to `RefundPayout | null`.

- [ ] **Step 6: Give the sheet a computed height, one detent**

**This is a known project trap, not a precaution.** The sheet now has text
fields (card number, expiry, and three IBAN fields) AND a list that grows when
"Show N more" is tapped. `@gorhom/bottom-sheet` sizes a sheet from its measured
content and then clips the content to that height, so a list that grows after
first layout can never report a bigger one: the expanded rows are cut off and
the stale detent misplaces the sheet. The shared `BottomSheet` also hardcodes
`detached={true}`, and a detached sheet does not move on a window resize, so
gorhom hand-lifts it over the keyboard badly.

The known-good shape, hard-won on `SearchTraveller` — read
`src/screens/shared/_components/SearchTraveller/SearchTraveller.tsx` and copy it:

- Compute the height (`baseHeight + visibleRowCount * ROW_HEIGHT`, capped at
  ~0.62 of the window) and pass it as an explicit **one-entry** `snapPoints`
  with `enableDynamicSizing={false}`. A computed height changes in the same
  render as the rows, so it cannot lag.
- Exactly ONE detent. `keyboardBehavior` defaults to `interactive`, which
  anchors to the highest detent — a second, taller snap point makes focusing a
  field jump the sheet.
- `keyboardBlurBehavior="restore"`, or the sheet stays parked a keyboard's
  height too tall after the keyboard hides. Do NOT also call
  `Keyboard.dismiss()` on content change — one thing moves at a time.
- `detached={false}` + `bottomInset={0}`; put safe-area clearance in the content
  padding instead.

Measuring the non-growing part via `onLayout` is fine. `BottomSheetView`
reports height via `onLayout`; `BottomSheetScrollView` reports via
`onContentSizeChange`, which has **not** fired on a cold present — so do not
switch the content to a scroll view to dodge this.

Jest cannot catch any of this. Note in your report that it needs device QA, and
that the QA must include **closing and reopening** the sheet, because a stale
measurement survives a fast refresh and only shows up on a cold open.

- [ ] **Step 7: Full verification**

- `npx jest` — all suites green
- `npx tsc --noEmit` — back to exactly the one pre-existing error
- `npx eslint src` — 0 errors

- [ ] **Step 8: Commit**

```bash
git add src/screens/shared/Tags/Tag/_components/refund/ src/localization/resources/
git commit -m "feat(refund): pay a saved token, a captured card, or a typed IBAN

Each destination writes exactly one CreateRefundDto field. Nothing is written
to the traveller's account: a card captured at the desk travels as a masked
paidCardDetail, as the spec's table always said."
```

---

## Notes for the executor

- **`canPayLive` is still `!!travellerId`** and does not check `RefundService.TravellerCards` + `.Create`. A refused vault degrades safely. Unchanged from the previous round; not this plan's job.
- **Unverified:** nobody has exercised `postTravellerCard` with a staff token against another traveller's id. The rows that capture depend on it. If it turns out self-scoped, stop and raise it.
- **`MobileApp.Refund.ConfirmPay` is unused** and can go with this work.

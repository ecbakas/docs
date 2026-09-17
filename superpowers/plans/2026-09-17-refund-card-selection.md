# Refund Card Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a refund agent pay a CreditCard refund to one of the traveller's saved cards, or to a new card captured at the desk, instead of only recording a payout already taken on a terminal.

**Architecture:** A new `RefundCardStep` component owns the card decision and hands `RefundConfirmSheet` a single `RefundCardChoice` value. `buildCreateRefundDto` branches on that choice to write `travellerCardId` (live — the API moves the money) **or** `paidCardDetail` (record — the terminal already paid), never both. A card captured at the desk is vaulted at confirm time, immediately before the refund call.

**Tech Stack:** React Native (Expo), TypeScript, Zustand, Jest (`jest-expo`), NativeWind.

**Spec:** `docs/superpowers/specs/2026-09-17-refund-card-selection-design.md`

## Global Constraints

- **Repo:** `c:\unirefund\super-app`. All paths below are relative to it.
- **Render tests MUST be named `*.router.test.ts(x)`.** The default `node` jest project cannot resolve `react-native`. Pure-function tests use plain `*.test.ts`. This applies to anything calling `render` **or** `renderHook`.
- **New i18n keys require `npm run init`** before `tsc` passes. `TranslationKey` derives from the generated `src/data/language-data/en-US.gen.json`, not from the authored resources. Keys are authored in `src/localization/resources/{en-US,tr-TR}.json` **without** the `MobileApp.` prefix; `init.ts` merges them under a `MobileApp` resource. `npm run init` needs network access to the backend.
- **Never log a vault error object.** `ApiError` carries `request.body`, which holds the raw PAN, and `logger.error` runs in production. Log `describeRequestFailure(err)` instead — see `src/screens/traveller/Cards/_components/AddCardSheet.tsx`.
- **Never send a full PAN in `paidCardDetail`.** Always `maskCardNumber(...)`. The API contract forbids it.
- **Option 2 (the tag's `payoutTokenId`) is out of scope.** The field is absent from `TagListItemDto`; a backend request is in flight. Build the card picker as a list so option 2 is one more entry later.
- **Baseline before you start:** `npx jest` → 233 suites pass. `npx tsc --noEmit` → exactly one error, in `src/app/__tests__/tabBackNavigation.router.test.tsx`, which is pre-existing. `npx eslint src` → 0 errors. Any second `tsc` error is yours.

---

### Task 1: The card choice, and which DTO field it writes

**Files:**
- Modify: `src/screens/shared/Tags/Tag/_components/refund/refund.logic.ts`
- Test: `src/screens/shared/Tags/Tag/_components/refund/__tests__/refund.logic.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `RefundCardChoice`, and `RefundFlowState.cardChoice` replacing `RefundFlowState.card`. `canSubmit(state, now?)` and `buildCreateRefundDto(state, signaturesBase64, paidDate)` keep their signatures; only the state shape changes.

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/refund.logic.test.ts`. The existing file already imports from `../refund.logic`; add `buildCreateRefundDto` and `canSubmit` to that import if absent.

```ts
/**
 * A CreditCard refund is one of two different acts, and the DTO keeps them
 * apart: `travellerCardId` moves money to a vaulted card, `paidCardDetail`
 * records a payout the terminal already made. Sending both would be asking
 * for the refund twice.
 */
describe("the card choice picks the DTO field", () => {
  const tag = (id: string) =>
    ({ id, currency: "DKK", refund: 10 }) as never;

  const state = (over: Record<string, unknown> = {}) =>
    ({
      refundPointId: "rp-1",
      selectedTags: [tag("1")],
      method: "CreditCard",
      cardChoice: { mode: "live", travellerCardId: "card-1" },
      signatures: {},
      isSubmitting: false,
      ...over,
    }) as never;

  it("sends travellerCardId for a live refund, and no card detail", () => {
    const dto = buildCreateRefundDto(state(), {}, "2026-09-17T00:00:00.000Z");

    expect(dto?.travellerCardId).toBe("card-1");
    expect(dto?.paidCardDetail).toBeUndefined();
  });

  it("sends masked card detail for a recorded payout, and no card id", () => {
    const dto = buildCreateRefundDto(
      state({
        cardChoice: {
          mode: "record",
          card: { number: "4111 1111 1111 1111", expiry: "12/34" },
        },
      }),
      {},
      "2026-09-17T00:00:00.000Z",
    );

    expect(dto?.travellerCardId).toBeUndefined();
    expect(dto?.paidCardDetail?.maskedNumber).toBe("411111******1111");
    expect(dto?.paidCardDetail?.cardExpiryMonth).toBe(12);
  });

  // A live choice carries no PAN, so the Luhn gate cannot apply to it.
  it("submits a live choice without any card number to validate", () => {
    expect(canSubmit(state())).toBe(true);
  });

  it("refuses a record choice whose card fails Luhn", () => {
    expect(
      canSubmit(
        state({
          cardChoice: {
            mode: "record",
            card: { number: "4111 1111 1111 1112", expiry: "12/34" },
          },
        }),
      ),
    ).toBe(false);
  });

  // Nothing chosen is not submittable: the DTO requires one or the other.
  it("refuses a CreditCard refund with no choice made", () => {
    expect(canSubmit(state({ cardChoice: null }))).toBe(false);
  });

  // Every other method ignores the card entirely.
  it("ignores the choice for a method that carries no card", () => {
    expect(canSubmit(state({ method: "Cash", cardChoice: null }))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx jest src/screens/shared/Tags/Tag/_components/refund/__tests__/refund.logic.test.ts`
Expected: FAIL — `cardChoice` is not a property of `RefundFlowState`, and `buildCreateRefundDto` never writes `travellerCardId`.

- [ ] **Step 3: Replace `card` with `cardChoice` on the state**

In `refund.logic.ts`, above `RefundFlowState`:

```ts
/**
 * Where a CreditCard refund's money goes, and therefore which field of
 * `CreateRefundDto` carries it.
 *
 * `live` pays a vaulted card through the API. `record` writes down a payout the
 * terminal already made, masked. The DTO holds both fields, and sending both
 * would be asking for the refund twice — so this type makes them exclusive.
 */
export type RefundCardChoice =
  | { mode: "live"; travellerCardId: string }
  | { mode: "record"; card: CardEntry };
```

Then in `RefundFlowState`, replace `card: CardEntry;` with:

```ts
  /** Null until the agent picks one. Only read for methods that carry a card. */
  cardChoice: RefundCardChoice | null;
```

- [ ] **Step 4: Gate `canSubmit` on the choice**

Replace the card line in `canSubmit`:

```ts
  if (methodNeedsCard(state.method)) {
    const choice = state.cardChoice;
    if (!choice) return false;
    // A live choice carries no PAN — the card is already vaulted, and the id is
    // the whole of what the API needs. Only a recorded payout has digits to check.
    if (choice.mode === "record" && !isCardEntryValid(choice.card, now))
      return false;
  }
```

- [ ] **Step 5: Branch the DTO**

Replace the `if (state.method === "CreditCard") { ... }` block in `buildCreateRefundDto`:

```ts
  if (state.method === "CreditCard" && state.cardChoice) {
    const choice = state.cardChoice;
    if (choice.mode === "live") {
      dto.travellerCardId = choice.travellerCardId;
    } else {
      const parsed = parseExpiry(choice.card.expiry);
      if (!parsed) return null;
      dto.paidCardDetail = {
        // The API contract forbids a full PAN here — always mask it, never
        // "simplify" back to onlyDigits.
        maskedNumber: maskCardNumber(choice.card.number),
        cardExpiryMonth: parsed.month,
        cardExpiryYear: parsed.year,
      };
    }
  }
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `npx jest src/screens/shared/Tags/Tag/_components/refund/__tests__/refund.logic.test.ts`
Expected: PASS. `npx tsc --noEmit` will now report errors in `useRefundHomeFlow.ts` and its tests, which Task 3 fixes — that is expected at this point and not a regression.

- [ ] **Step 7: Commit**

```bash
git add src/screens/shared/Tags/Tag/_components/refund/refund.logic.ts src/screens/shared/Tags/Tag/_components/refund/__tests__/refund.logic.test.ts
git commit -m "feat(refund): make the card choice decide the DTO field

A CreditCard refund either pays a vaulted card (travellerCardId) or records
a payout the terminal already made (paidCardDetail). RefundCardChoice makes
those exclusive, and canSubmit stops applying a Luhn gate to a live choice
that has no PAN to check."
```

---

### Task 2: Carry the traveller's id to the refund surface

**Files:**
- Modify: `src/screens/shared/Tags/Tag/TagScreen.tsx` (the `<RefundSurface .../>` render)
- Modify: `src/screens/shared/Tags/Tag/_components/refund/RefundSurface.tsx`
- Test: `src/screens/shared/Tags/Tag/__tests__/TagScreenRefundMode.router.test.tsx`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `RefundSurface({ documentNumber, travellerId, bottomInset })`. `travellerId: string | undefined`.

**Why:** vaulting needs the traveller's id. `AddCardSheet` gets one from `getMyTravellerId()`, which is the *signed-in* traveller — an agent is not the traveller, so that is unusable here. The tags screen already resolves a `TravellerRequestDto`, whose `id` is what we need.

- [ ] **Step 1: Write the failing test**

Append to `TagScreenRefundMode.router.test.tsx`. Its existing mock of `RefundSurface` renders `refund-surface:${documentNumber}`; widen it first so the test can read the id:

```ts
// in the existing jest.mock for ../_components/refund/RefundSurface
    default: ({
      documentNumber,
      travellerId,
    }: {
      documentNumber?: string;
      travellerId?: string;
    }) =>
      react.createElement(
        Text,
        null,
        `refund-surface:${documentNumber || "none"}:${travellerId || "no-id"}`,
      ),
```

Then the test:

```ts
/**
 * Vaulting a card needs the traveller's id, and the screen is the only thing
 * that has it — `getMyTravellerId` is the signed-in traveller, which an agent
 * is not.
 */
it("hands the surface the resolved traveller's id", () => {
  signIn("refundPoint");
  narrowTo(DOC);
  useTagStore.getState().setQuery({
    ...useTagStore.getState().query,
    travellerDocumentNumber: DOC,
  });

  renderScreen();

  expect(screen.getByText(`refund-surface:${DOC}:no-id`)).toBeTruthy();
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/screens/shared/Tags/Tag/__tests__/TagScreenRefundMode.router.test.tsx`
Expected: FAIL — the mock prints two segments, the test expects three.

- [ ] **Step 3: Add the prop to `RefundSurface`**

In `RefundSurface.tsx`, extend the props:

```ts
export default function RefundSurface({
  documentNumber,
  travellerId,
  bottomInset,
}: {
  /** Whose refundable tags these are — the tags screen's own filter. */
  documentNumber: string | undefined;
  /**
   * The traveller's id, once the screen's lookup has resolved one.
   *
   * `undefined` until then: the list queries by document number and appears
   * immediately, while the record behind it arrives a round trip later. Live
   * refunds need this and so are unavailable for that moment; recording a
   * terminal payout is not.
   */
  travellerId: string | undefined;
  bottomInset: number;
}) {
```

- [ ] **Step 4: Pass it from `TagScreen`**

In `TagScreen.tsx`, the refund branch becomes:

```tsx
      return (
        <RefundSurface
          documentNumber={query.travellerDocumentNumber}
          travellerId={traveller?.id ?? undefined}
          bottomInset={bottomChrome}
        />
      );
```

- [ ] **Step 5: Fix the surface's own suite**

`__tests__/RefundSurface.router.test.tsx` renders `<RefundSurface documentNumber={...} bottomInset={0} />`. Add `travellerId={undefined}` to that call so `tsc` passes.

- [ ] **Step 6: Run the tests**

Run: `npx jest src/screens/shared/Tags`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/screens/shared/Tags/Tag/TagScreen.tsx src/screens/shared/Tags/Tag/_components/refund/RefundSurface.tsx src/screens/shared/Tags/Tag/__tests__/TagScreenRefundMode.router.test.tsx src/screens/shared/Tags/Tag/_components/refund/__tests__/RefundSurface.router.test.tsx
git commit -m "feat(refund): carry the traveller's id to the refund surface

Vaulting a card needs it, and getMyTravellerId is the signed-in traveller —
which an agent is not."
```

---

### Task 3: Load the traveller's saved cards, and vault a new one

**Files:**
- Modify: `src/screens/shared/Tags/Tag/_components/refund/useRefundHomeFlow.ts`
- Test: `src/screens/shared/Tags/Tag/_components/refund/__tests__/useRefundHomeFlow.router.test.ts`

**Interfaces:**
- Consumes: `RefundCardChoice` from Task 1; `travellerId` from Task 2.
- Produces, added to the hook's return: `savedCards: TravellerCard[]`, `isLoadingCards: boolean`, `vaultCard(card: CardEntry): Promise<string | null>` (returns the new `travellerCardId`, or `null` on failure), and `submit(choice: RefundCardChoice)` replacing `submit(card: CardEntry)`.

Where `TravellerCard` is `UniRefund_RefundService_TravellerCards_TravellerCardDto` — `{ id, travellerId, type: 'Card'|'Bank'|'Wallet', isDefault, maskedNumber, expiryMonth, expiryYear, holderName?, bankName? }`.

- [ ] **Step 1: Write the failing tests**

Add to the suite's mocks:

```ts
jest.mock("@/actions/RefundService/actions", () => ({
  getTravellerCardsByTravellerIdApi: jest.fn(() => Promise.resolve([])),
}));
jest.mock("@/actions/RefundService/post", () => ({
  postTravellerCard: jest.fn(),
}));
```

The suite's `renderFlow` currently passes `{ documentNumber }`. Widen it to pass `{ documentNumber, travellerId }`, defaulting `travellerId` to `"trv-1"`.

```ts
/**
 * The traveller's saved cards, and registering a new one.
 *
 * A live refund pays a vaulted card — the raw PAN is never sent — so the desk
 * either picks a card the traveller already has or registers the one in their
 * hand.
 */
describe("useRefundHomeFlow cards", () => {
  const card = {
    id: "card-1",
    travellerId: "trv-1",
    type: "Card",
    isDefault: true,
    maskedNumber: "411111******1111",
    expiryMonth: 12,
    expiryYear: 34,
  } as never;

  it("loads the traveller's cards once an id is known", async () => {
    mockGetCards.mockResolvedValue([card]);
    const { result } = renderFlow();

    await waitFor(() => expect(result.current.savedCards).toHaveLength(1));
    expect(mockGetCards).toHaveBeenCalledWith("trv-1");
  });

  // The list queries by document number and appears first; the record follows.
  it("asks for nothing while the traveller id is still unknown", async () => {
    renderFlow(null, undefined);

    await waitFor(() => expect(mockGetTags).toHaveBeenCalled());
    expect(mockGetCards).not.toHaveBeenCalled();
  });

  // Reading cards needs RefundService.TravellerCards.ViewList; the wrapper
  // returns [] rather than throwing, so the desk sees no saved cards and can
  // still register one.
  it("treats an unreadable card list as none", async () => {
    mockGetCards.mockResolvedValue([]);
    const { result } = renderFlow();

    await waitFor(() => expect(mockGetCards).toHaveBeenCalled());
    expect(result.current.savedCards).toEqual([]);
  });

  it("vaults a captured card and returns its id", async () => {
    mockPostCard.mockResolvedValue({ id: "card-9" });
    const { result } = renderFlow();

    let id: string | null = null;
    await act(async () => {
      id = await result.current.vaultCard({
        number: "4111 1111 1111 1111",
        expiry: "12/34",
      });
    });

    expect(id).toBe("card-9");
    expect(mockPostCard).toHaveBeenCalledWith({
      travellerId: "trv-1",
      cardNumber: "4111111111111111",
      cardExpiryMonth: 12,
      cardExpiryYear: 34,
    });
  });

  it("returns null when the vault refuses, rather than throwing", async () => {
    mockPostCard.mockRejectedValue(new Error("403"));
    const { result } = renderFlow();

    let id: string | null = "unset";
    await act(async () => {
      id = await result.current.vaultCard({
        number: "4111 1111 1111 1111",
        expiry: "12/34",
      });
    });

    expect(id).toBeNull();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest src/screens/shared/Tags/Tag/_components/refund/__tests__/useRefundHomeFlow.router.test.ts`
Expected: FAIL — `savedCards` and `vaultCard` do not exist.

- [ ] **Step 3: Take `travellerId` and load the cards**

In `useRefundHomeFlow.ts`, extend the parameter object:

```ts
export function useRefundHomeFlow({
  documentNumber,
  travellerId,
}: {
  documentNumber: string | undefined;
  /** Needed to read saved cards and to vault a new one. */
  travellerId: string | undefined;
}) {
```

Add the state and the load, beside the existing fee pricing:

```ts
  const [savedCards, setSavedCards] = useState<TravellerCard[]>([]);
  const [isLoadingCards, setIsLoadingCards] = useState(false);
  const cardsRequestRef = useRef(0);

  useEffect(() => {
    const requestId = ++cardsRequestRef.current;
    if (!travellerId) {
      setSavedCards([]);
      return;
    }
    setIsLoadingCards(true);
    void getTravellerCardsByTravellerIdApi(travellerId)
      .then((cards) => {
        if (requestId !== cardsRequestRef.current) return;
        // Card tokens only: a Bank or Wallet token cannot settle a CreditCard
        // refund, and offering one would stage a call the server refuses.
        setSavedCards((cards ?? []).filter((c) => c.type === "Card"));
      })
      .finally(() => {
        if (requestId === cardsRequestRef.current) setIsLoadingCards(false);
      });
  }, [travellerId]);
```

Import at the top:

```ts
import { getTravellerCardsByTravellerIdApi } from "@/actions/RefundService/actions";
import { postTravellerCard } from "@/actions/RefundService/post";
import type { UniRefund_RefundService_TravellerCards_TravellerCardDto as TravellerCard } from "@/saas/RefundService";
import { describeRequestFailure } from "@/utils/apiError";
```

If `describeRequestFailure` is not exported from `@/utils/apiError`, import it from wherever `AddCardSheet.tsx` imports it — copy that import line verbatim.

- [ ] **Step 4: Add `vaultCard`**

```ts
  /**
   * Registers a captured card against the traveller and returns its token id.
   *
   * The raw PAN is never sent to the refund endpoint — it is vaulted here and
   * only the id travels. Adding the same physical card twice is not an error:
   * the backend returns the existing token, so a retry cannot leave a duplicate
   * on the traveller's account.
   *
   * Returns `null` on refusal rather than throwing, so the sheet can stay open
   * with the captured card intact and offer to record the payout instead.
   */
  const vaultCard = useCallback(
    async (card: CardEntry): Promise<string | null> => {
      if (!travellerId) return null;
      const parsed = parseExpiry(card.expiry);
      if (!parsed) return null;
      try {
        const saved = await postTravellerCard({
          travellerId,
          cardNumber: onlyDigits(card.number),
          cardExpiryMonth: parsed.month,
          cardExpiryYear: parsed.year,
        });
        return saved?.id ?? null;
      } catch (error) {
        // NEVER log the error object: ApiError carries request.body, which is
        // the raw PAN, and logger.error runs in production.
        logger.error("[Refund] vault card failed", describeRequestFailure(error));
        return null;
      }
    },
    [travellerId],
  );
```

`parseExpiry` and `onlyDigits` come from `@/utils/card/card` — check how `refund.logic.ts` imports them and copy that line.

- [ ] **Step 5: Change `submit` to take the choice**

Change the signature and the state it builds:

```ts
  const submit = useCallback(
    async (
      cardChoice: RefundCardChoice | null,
    ): Promise<{ ok: boolean; message?: string }> => {
```

and inside, replace `card,` with `cardChoice,` in the `RefundFlowState` literal. Add `cardChoice` to the `useCallback` dependency list only if it closes over it — it is a parameter, so it does not.

Return the new values from the hook:

```ts
    savedCards,
    isLoadingCards,
    vaultCard,
```

- [ ] **Step 6: Run the tests**

Run: `npx jest src/screens/shared/Tags/Tag/_components/refund/__tests__/useRefundHomeFlow.router.test.ts`
Expected: PASS. Other suites still fail to compile — Task 4 fixes the sheet.

- [ ] **Step 7: Commit**

```bash
git add src/screens/shared/Tags/Tag/_components/refund/useRefundHomeFlow.ts src/screens/shared/Tags/Tag/_components/refund/__tests__/useRefundHomeFlow.router.test.ts
git commit -m "feat(refund): load the traveller's cards and vault a new one

Card tokens only — a Bank or Wallet token cannot settle a CreditCard refund.
vaultCard returns null on refusal so the sheet can stay open with the
captured card and offer to record the payout instead."
```

---

### Task 4: The card step

**Files:**
- Create: `src/screens/shared/Tags/Tag/_components/refund/RefundCardStep.tsx`
- Create: `src/screens/shared/Tags/Tag/_components/refund/__tests__/RefundCardStep.router.test.tsx`
- Modify: `src/localization/resources/en-US.json`, `src/localization/resources/tr-TR.json`

**Interfaces:**
- Consumes: `RefundCardChoice` (Task 1), `TravellerCard` and `isLoadingCards` (Task 3).
- Produces:

```ts
/**
 * What the step reports upward.
 *
 * `choice` is a decision that can be submitted as-is — a saved card, or a
 * recorded payout. `pendingLiveCard` is a card captured for a LIVE refund that
 * has not been vaulted yet: it cannot become a `choice` until it has an id, and
 * vaulting happens at confirm. Exactly one of the two is ever non-null.
 */
export type RefundCardStepValue = {
  choice: RefundCardChoice | null;
  pendingLiveCard: CardEntry | null;
};

RefundCardStep({
  savedCards: TravellerCard[];
  canPayLive: boolean;
  value: RefundCardStepValue;
  onChange: (value: RefundCardStepValue) => void;
  disabled?: boolean;
  t: ReturnType<typeof useLocalization>["t"];
})
```

**`t` is passed from the host, not read via a hook.** This renders inside a `<BottomSheet>`, where a context hook resolves at the `@gorhom/portal` host and renders raw i18n keys. `NfcCardModal`, `CardScannerModal` and the sheet's own signature labels all take `t` for this reason.

- [ ] **Step 1: Add the i18n keys**

In `src/localization/resources/en-US.json`, inside the existing `"Refund": {` block:

```json
    "CardModeLive": "Refund to a card",
    "CardModeRecord": "Record a payout already made",
    "CardSaved": "Traveller's cards",
    "CardUseAnother": "Use another card",
    "CardNoneSaved": "No saved cards for this traveller.",
```

And the same keys in `src/localization/resources/tr-TR.json`:

```json
    "CardModeLive": "Karta iade et",
    "CardModeRecord": "Yapılmış ödemeyi kaydet",
    "CardSaved": "Yolcunun kartları",
    "CardUseAnother": "Başka bir kart kullan",
    "CardNoneSaved": "Bu yolcu için kayıtlı kart yok.",
```

Then run `npm run init` and confirm `npm run check:language-data` prints "Generated data is up to date".

- [ ] **Step 2: Write the failing tests**

Create `__tests__/RefundCardStep.router.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { RefundCardStep } from "../RefundCardStep";
import type { RefundCardStepValue } from "../RefundCardStep";

jest.mock("@/components/Ionicons", () => ({ Ionicons: () => null }));
jest.mock("../../../../../traveller/Cards/_components/NfcCardModal", () => ({
  NfcCardModal: () => null,
}));
jest.mock("../../../../../traveller/Cards/_components/CardScannerModal", () => ({
  CardScannerModal: () => null,
}));

const t = ((key: string) => key) as never;

const card = (id: string, maskedNumber: string) =>
  ({
    id,
    travellerId: "trv-1",
    type: "Card",
    isDefault: false,
    maskedNumber,
    expiryMonth: 12,
    expiryYear: 34,
  }) as never;

function renderStep(over: Record<string, unknown> = {}) {
  const onChange = jest.fn();
  render(
    <RefundCardStep
      savedCards={[]}
      canPayLive
      value={{ choice: null, pendingLiveCard: null }}
      onChange={onChange}
      t={t}
      {...over}
    />,
  );
  return { onChange };
}

/**
 * The two modes are different acts — one moves money, one writes down that a
 * terminal already did — so the agent chooses explicitly rather than having it
 * inferred from which control they touched.
 */
describe("the mode choice", () => {
  it("offers both modes when the account can pay live", () => {
    renderStep();

    expect(screen.getByText("MobileApp.Refund.CardModeLive")).toBeTruthy();
    expect(screen.getByText("MobileApp.Refund.CardModeRecord")).toBeTruthy();
  });

  // Reading and vaulting cards are permissions. Without them live is not a
  // disabled option, it is not an option — the same rule the customs verdicts
  // follow.
  it("hides live entirely when the account cannot pay one", () => {
    renderStep({ canPayLive: false });

    expect(screen.queryByText("MobileApp.Refund.CardModeLive")).toBeNull();
    expect(screen.getByText("MobileApp.Refund.CardModeRecord")).toBeTruthy();
  });
});

describe("the traveller's saved cards", () => {
  it("lists them, masked", () => {
    renderStep({ savedCards: [card("c1", "411111******1111")] });

    expect(screen.getByText("411111******1111")).toBeTruthy();
  });

  it("reports a live choice when one is picked", () => {
    const { onChange } = renderStep({
      savedCards: [card("c1", "411111******1111")],
    });

    fireEvent.press(screen.getByText("411111******1111"));

    expect(onChange).toHaveBeenCalledWith({
      choice: { mode: "live", travellerCardId: "c1" },
      pendingLiveCard: null,
    } satisfies RefundCardStepValue);
  });

  it("says so when the traveller has none", () => {
    renderStep({ savedCards: [] });

    expect(screen.getByText("MobileApp.Refund.CardNoneSaved")).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run them and watch them fail**

Run: `npx jest src/screens/shared/Tags/Tag/_components/refund/__tests__/RefundCardStep.router.test.tsx`
Expected: FAIL — the module does not exist.

- [ ] **Step 4: Build the component**

Create `RefundCardStep.tsx`:

```tsx
import { Button, Input, Text } from "@/components/ui";
import { useNfcSupported } from "@/hooks/useNfcSupported";
import type { useLocalization } from "@/providers/LocalizationProvider";
import type { UniRefund_RefundService_TravellerCards_TravellerCardDto as TravellerCard } from "@/saas/RefundService";
import { CardScannerModal } from "@/screens/traveller/Cards/_components/CardScannerModal";
import { NfcCardModal } from "@/screens/traveller/Cards/_components/NfcCardModal";
import { formatCardNumber } from "@/utils/card/card";
import { cn } from "@/utils/cn";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { useState } from "react";
import { Pressable, View } from "react-native";
import {
  normalizeCardExpiry,
  type CardEntry,
  type RefundCardChoice,
} from "./refund.logic";

export type RefundCardStepValue = {
  choice: RefundCardChoice | null;
  /** Captured for a LIVE refund, not vaulted yet — see the sheet's confirm. */
  pendingLiveCard: CardEntry | null;
};

type Mode = "live" | "record";

/**
 * Where a CreditCard refund's money goes.
 *
 * `t` comes from the host rather than a hook: this renders inside a
 * `<BottomSheet>`, where a context hook resolves at the @gorhom/portal host and
 * renders raw i18n keys. `NfcCardModal` and `CardScannerModal` take it for the
 * same reason, and the sheet already does this for its signature pad labels.
 */
export function RefundCardStep({
  savedCards,
  canPayLive,
  value,
  onChange,
  disabled,
  t,
}: {
  savedCards: TravellerCard[];
  canPayLive: boolean;
  value: RefundCardStepValue;
  onChange: (value: RefundCardStepValue) => void;
  disabled?: boolean;
  t: ReturnType<typeof useLocalization>["t"];
}) {
  const [mode, setMode] = useState<Mode>(canPayLive ? "live" : "record");
  const [capture, setCapture] = useState<"none" | "nfc" | "camera">("none");
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const nfcSupported = useNfcSupported();

  const selectedId =
    value.choice?.mode === "live" ? value.choice.travellerCardId : null;

  /**
   * A captured or typed card goes to a different place depending on the mode:
   * a live one waits to be vaulted at confirm, a recorded one is already the
   * choice. Either way the digits land in the fields first, so an OCR misread
   * is visible and correctable before anything is submitted.
   */
  function reportCard(nextNumber: string, nextExpiry: string) {
    const card: CardEntry = { number: nextNumber, expiry: nextExpiry };
    onChange(
      mode === "live"
        ? { choice: null, pendingLiveCard: card }
        : { choice: { mode: "record", card }, pendingLiveCard: null },
    );
  }

  function switchMode(next: Mode) {
    setMode(next);
    // The previous mode's answer cannot carry across: they are different acts,
    // and a half-migrated one would submit the wrong DTO field.
    onChange({ choice: null, pendingLiveCard: null });
  }

  function applyScan(scanned: { number?: string; expiry?: string }) {
    const nextNumber = scanned.number
      ? formatCardNumber(scanned.number)
      : number;
    const nextExpiry = scanned.expiry
      ? normalizeCardExpiry(scanned.expiry)
      : expiry;
    setNumber(nextNumber);
    setExpiry(nextExpiry);
    reportCard(nextNumber, nextExpiry);
    setCapture("none");
  }

  return (
    <View className="gap-3">
      {canPayLive && (
        <View className="flex-row gap-2">
          {(["live", "record"] as const).map((option) => (
            <Pressable
              key={option}
              onPress={() => switchMode(option)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === option }}
              className={cn(
                "flex-1 rounded-xl border p-3",
                mode === option
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card",
              )}
            >
              <Text variant="caption" className="text-center font-medium">
                {t(
                  option === "live"
                    ? "MobileApp.Refund.CardModeLive"
                    : "MobileApp.Refund.CardModeRecord",
                )}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {mode === "live" && (
        <View className="gap-2">
          <Text
            variant="caption"
            tone="muted"
            className="uppercase tracking-widest"
          >
            {t("MobileApp.Refund.CardSaved")}
          </Text>
          {savedCards.length === 0 ? (
            <Text variant="caption" tone="muted">
              {t("MobileApp.Refund.CardNoneSaved")}
            </Text>
          ) : (
            savedCards.map((card) => (
              <Pressable
                key={card.id}
                onPress={() =>
                  onChange({
                    choice: { mode: "live", travellerCardId: card.id },
                    pendingLiveCard: null,
                  })
                }
                disabled={disabled}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedId === card.id }}
                className={cn(
                  "rounded-xl border p-3",
                  selectedId === card.id
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card",
                )}
              >
                <Text variant="body">{card.maskedNumber}</Text>
              </Pressable>
            ))
          )}
          <Text
            variant="caption"
            tone="muted"
            className="uppercase tracking-widest"
          >
            {t("MobileApp.Refund.CardUseAnother")}
          </Text>
        </View>
      )}

      {/* Tap first, camera second: a chip read is exact where OCR is a best
          guess. Absent hardware simply drops the tap — iOS never reports a
          payment card to a reader session, so it is camera and manual there. */}
      {nfcSupported && (
        <Button
          variant="outline"
          action={{
            onPress: () => setCapture("nfc"),
            label: t("MobileApp.Cards.TapCard"),
          }}
          iconName="wifi-outline"
          disabled={disabled}
        />
      )}
      <Button
        variant="outline"
        action={{
          onPress: () => setCapture("camera"),
          label: t("MobileApp.Cards.ScanCard"),
        }}
        iconName="camera-outline"
        disabled={disabled}
      />

      <Input
        label={t("MobileApp.Cards.CardNumberLabel")}
        inputComponent={BottomSheetTextInput}
        containerClassName="mb-0"
        value={number}
        onChangeText={(v) => {
          const next = formatCardNumber(v);
          setNumber(next);
          reportCard(next, expiry);
        }}
        placeholder={t("MobileApp.Cards.CardNumberPlaceholder")}
        keyboardType="number-pad"
        editable={!disabled}
      />
      <Input
        label={t("MobileApp.Cards.ExpiryLabel")}
        inputComponent={BottomSheetTextInput}
        containerClassName="mb-0"
        value={expiry}
        onChangeText={(v) => {
          const next = normalizeCardExpiry(v);
          setExpiry(next);
          reportCard(number, next);
        }}
        placeholder={t("MobileApp.Cards.ExpiryPlaceholder")}
        keyboardType="number-pad"
        editable={!disabled}
      />

      <NfcCardModal
        visible={capture === "nfc"}
        onClose={() => setCapture("none")}
        onScanned={applyScan}
        t={t}
      />
      <CardScannerModal
        visible={capture === "camera"}
        onClose={() => setCapture("none")}
        onScanned={applyScan}
        t={t}
      />
    </View>
  );
}
```

Check the exact import paths for `formatCardNumber`, `Input` and `useNfcSupported` against `src/screens/traveller/Cards/_components/AddCardSheet.tsx` and copy them verbatim — that file uses all three.

- [ ] **Step 5: Run the tests**

Run: `npx jest src/screens/shared/Tags/Tag/_components/refund/__tests__/RefundCardStep.router.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/screens/shared/Tags/Tag/_components/refund/RefundCardStep.tsx src/screens/shared/Tags/Tag/_components/refund/__tests__/RefundCardStep.router.test.tsx src/localization/resources/en-US.json src/localization/resources/tr-TR.json
git commit -m "feat(refund): card step with mode, saved cards and capture

t is passed from the host: this renders inside a BottomSheet, where a context
hook resolves at the portal host and renders raw i18n keys."
```

---

### Task 5: Wire it into the sheet, and vault at confirm

**Files:**
- Modify: `src/screens/shared/Tags/Tag/_components/refund/RefundConfirmSheet.tsx`
- Modify: `src/screens/shared/Tags/Tag/_components/refund/RefundSurface.tsx`
- Test: `src/screens/shared/Tags/Tag/_components/refund/__tests__/RefundConfirmSheet.router.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces: `RefundConfirmSheet`'s `onConfirm` changes from `(card: CardEntry) => void` to `(choice: RefundCardChoice | null) => void`.

- [ ] **Step 1: Write the failing tests**

Append to `RefundConfirmSheet.router.test.tsx`:

```tsx
/**
 * Vaulting happens at confirm, not at capture, so an abandoned sheet stores
 * nothing on the traveller's account.
 */
it("vaults a captured card before refunding, and pays the id it gets back", async () => {
  const vaultCard = jest.fn().mockResolvedValue("card-9");
  const onConfirm = jest.fn();
  renderSheet({ method: "CreditCard", vaultCard, onConfirm });

  // capture a card, then confirm — see the suite's card-entry helpers
  fireEvent.press(confirmButton());

  await waitFor(() => expect(vaultCard).toHaveBeenCalled());
  expect(onConfirm).toHaveBeenCalledWith({
    mode: "live",
    travellerCardId: "card-9",
  });
});

// A refused vault must not silently become a refund to nothing.
it("does not refund when the vault is refused", async () => {
  const vaultCard = jest.fn().mockResolvedValue(null);
  const onConfirm = jest.fn();
  renderSheet({ method: "CreditCard", vaultCard, onConfirm });

  fireEvent.press(confirmButton());

  await waitFor(() => expect(vaultCard).toHaveBeenCalled());
  expect(onConfirm).not.toHaveBeenCalled();
});
```

Both tests need a card in the fields before Confirm. The suite already has
`numberPlaceholder` and `expiryPlaceholder`; type into them first:

```tsx
  fireEvent.changeText(
    screen.getByPlaceholderText(numberPlaceholder),
    "4111 1111 1111 1111",
  );
  fireEvent.changeText(screen.getByPlaceholderText(expiryPlaceholder), "12/34");
```

`renderSheet` must also be given the new props — add
`savedCards: []`, `canPayLive: true` and `vaultCard: jest.fn()` to its
defaults so every existing test in the file keeps compiling.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest src/screens/shared/Tags/Tag/_components/refund/__tests__/RefundConfirmSheet.router.test.tsx`
Expected: FAIL — the sheet has no `vaultCard` prop.

- [ ] **Step 3: Replace the card fields with the step**

In `RefundConfirmSheet.tsx`, `ConfirmSection` currently owns `number`/`expiry`
state and renders two `Input`s for `CreditCard`. Delete both, and the
`isCardEntryValid` call that gated Confirm on them. In their place:

```tsx
  const [cardValue, setCardValue] = useState<RefundCardStepValue>({
    choice: null,
    pendingLiveCard: null,
  });

  // ...inside the CreditCard branch of the render:
  {method === "CreditCard" && (
    <RefundCardStep
      savedCards={savedCards}
      canPayLive={canPayLive}
      value={cardValue}
      onChange={setCardValue}
      disabled={isSubmitting}
      t={t}
    />
  )}
```

Add the three new props to both `RefundConfirmSheet` and `ConfirmSection`:

```ts
  savedCards: TravellerCard[];
  canPayLive: boolean;
  /** Registers a captured card and resolves its token id, or null if refused. */
  vaultCard: (card: CardEntry) => Promise<string | null>;
```

and change `onConfirm`:

```ts
  onConfirm: (choice: RefundCardChoice | null) => void;
```

Replace the confirm handler:

```tsx
  const [isVaulting, setIsVaulting] = useState(false);

  /**
   * Vault last, and only for a card captured here.
   *
   * At confirm rather than at capture, so a sheet the agent abandons stores
   * nothing on the traveller's account. A refusal returns without confirming:
   * the sheet stays open with the captured card intact, and the agent can
   * switch to recording a terminal payout instead.
   */
  async function handleConfirmPress() {
    if (cardValue.pendingLiveCard) {
      setIsVaulting(true);
      try {
        const travellerCardId = await vaultCard(cardValue.pendingLiveCard);
        if (!travellerCardId) return;
        onConfirm({ mode: "live", travellerCardId });
      } finally {
        setIsVaulting(false);
      }
      return;
    }
    onConfirm(cardValue.choice);
  }
```

and point the Confirm button at it:

```tsx
      <Button
        action={{
          label: t("MobileApp.Refund.Submit", { amount }),
          onPress: () => {
            void handleConfirmPress();
          },
        }}
        variant="constructive"
        isLoading={isSubmitting || isVaulting}
        disabled={!canConfirm}
        containerClassName="mt-2"
      />
```

- [ ] **Step 4: Update `canConfirm`**

`canConfirm` currently requires `isCardEntryValid` over the local card state.
Replace that clause with:

```ts
  // A chosen saved card needs nothing more. A card captured here still has to
  // pass Luhn and the expiry check before it is worth vaulting — the vault is a
  // write against the traveller's account, so it should not be attempted with
  // digits we already know are wrong.
  const cardReady =
    method !== "CreditCard" ||
    cardValue.choice !== null ||
    (cardValue.pendingLiveCard !== null &&
      isCardEntryValid(cardValue.pendingLiveCard));
```

and `&& cardReady` into the existing `canConfirm` expression.

- [ ] **Step 5: Pass the new props from `RefundSurface`**

```tsx
      <RefundConfirmSheet
        ...
        savedCards={flow.savedCards}
        canPayLive={!!travellerId}
        vaultCard={flow.vaultCard}
        onConfirm={(choice) => {
          void handleConfirm(choice);
        }}
      />
```

and change `RefundSurface`'s `handleConfirm` to take `RefundCardChoice | null` and hand it to `flow.submit`.

- [ ] **Step 6: Run the full suite**

Run: `npx jest`
Expected: 234+ suites pass, 0 failures.

Run: `npx tsc --noEmit`
Expected: exactly the one pre-existing `tabBackNavigation` error.

Run: `npx eslint src`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/screens/shared/Tags/Tag/_components/refund/
git commit -m "feat(refund): pay a saved or newly captured card

The card step replaces the sheet's two inputs. A captured card is vaulted at
confirm — not at capture — so an abandoned sheet stores nothing, and a refused
vault leaves the sheet open with the card intact rather than refunding to
nothing."
```

---

## Notes for the executor

- **`canPayLive` is `!!travellerId` in Task 5 as a first cut.** The spec also gates it on `RefundService.TravellerCards` + `.Create`. If you want that now, read the grants the way `TagScreen` does (`user?.grantedPolicies`) and `&&` it in. It is a narrowing, so shipping without it offers live to an account that would 403 on the vault — which `vaultCard` already handles by returning `null`.
- **Unverified:** nobody has exercised `postTravellerCard` with a staff token against another traveller's id. The permission is a plain ABP pair and the DTO takes `travellerId` explicitly, so it should work. If it turns out to be self-scoped, Task 3's `vaultCard` and Task 4's capture-for-live branch are dead and only saved-card live refunds survive — stop and raise it rather than working around it.
- **`MobileApp.Refund.ConfirmPay` is unused** since the confirm button reused `Submit`. Remove it with this work if you like.

# SaleScreenV2 Refund Card Capture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a cashier scan a traveller's refund card directly from SaleScreenV2, above the Create Tag button, without losing the existing CustomerScreen entry point.

**Architecture:** The scan modal (`RefundCardScanModal`) and the card store (`usePayoutStore`) are already global and screen-agnostic. The button markup that exists inline in CustomerScreen is extracted into a shared `RefundCardButton` and used by both screens. Separately, the create-tag payload stops confining `payoutToken` to `Issued` tags so a card scanned without a traveller survives onto a Draft.

**Tech Stack:** React Native 0.81 / Expo SDK 54, TypeScript, zustand, NativeWind (Tailwind classes), Jest + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-08-03-salescreenv2-refund-card-design.md`

## Global Constraints

- Work only inside `c:\unirefund\pos-app`. Do not modify `core`, `super-app`, or `web-app`.
- No new localization keys. Use the existing `MobileApp.CustomerScreen.ScanRefundCard` and `MobileApp.CustomerScreen.RefundCardCaptured`, which already exist in `src/localization/resources/en-US.json` and `tr-TR.json`.
- Do not modify `RefundCardScanModal.tsx`, `useCardReader.tsx`, or `modules/sunmi-card-reader/`.
- Do not change CustomerScreen's behaviour. Its button keeps its `isTravellerFilled` visibility gate and gets **no** clear button.
- The new SaleScreenV2 button is **always rendered and always enabled**, whether or not a traveller is selected.
- `SaleScreen.tsx` (V1) gets the payload change **only** — no scan button.
- Import `ScannedCard` as a **type-only** import (`import type`). A value import of `@/hooks/useCardReader` pulls in the native card-reader module.
- Run commands from `c:\unirefund\pos-app`.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/screens/(auth)/Sale/_components/RefundCardButton.tsx` | **Create.** Presentational button: label/icon/colour by card state, optional clear action. |
| `src/screens/(auth)/Sale/_components/__tests__/RefundCardButton.test.tsx` | **Create.** Unit tests for the above. |
| `src/screens/(auth)/Sale/CustomerScreen.tsx` | **Modify.** Swap inline footer button for the shared component. No behaviour change. |
| `src/screens/(auth)/Sale/SaleScreenV2.tsx` | **Modify.** Add button + scan modal + state; payload change. |
| `src/screens/(auth)/Sale/SaleScreen.tsx` | **Modify.** Payload change only. |

Tests are co-located in a `__tests__/` directory beside the component, matching `src/components/__tests__/` and `src/utils/__tests__/`.

---

### Task 1: RefundCardButton component

**Files:**
- Create: `src/screens/(auth)/Sale/_components/RefundCardButton.tsx`
- Test: `src/screens/(auth)/Sale/_components/__tests__/RefundCardButton.test.tsx`

**Interfaces:**
- Consumes: `maskedCardNumber` from `@/utils/cardData`; `ScannedCard` type from `@/hooks/useCardReader`; `DebouncedPressable`, `Ionicons`, `cn`, `useLocalization`.
- Produces: `RefundCardButton` (named **and** default export) with props
  `{ payoutCard: ScannedCard | null; onPress: () => void; onClear?: () => void; className?: string }`.
  Renders a React fragment — the **caller** owns the surrounding flex row. Test IDs: `refund-card-button`, `refund-card-clear`.

- [ ] **Step 1: Write the failing test**

Create `src/screens/(auth)/Sale/_components/__tests__/RefundCardButton.test.tsx`:

```tsx
import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { View } from "react-native";
import type { ScannedCard } from "@/hooks/useCardReader";
import RefundCardButton from "../RefundCardButton";

// The real provider returns "" for every key when no <LocalizationProvider> is
// mounted, which would make label assertions vacuous. Echo the key instead.
jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({ t: (key: string) => key }),
}));

const card: ScannedCard = {
  mode: "magnetic",
  maskedPan: "453901••••1234",
  expiry: "12/27",
};

describe("RefundCardButton", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("prompts to scan when no card is captured", () => {
    const { getByText } = render(
      <View>
        <RefundCardButton payoutCard={null} onPress={jest.fn()} />
      </View>,
    );

    expect(getByText("MobileApp.CustomerScreen.ScanRefundCard")).toBeTruthy();
  });

  it("shows the masked number and expiry once a card is captured", () => {
    const { getByText } = render(
      <View>
        <RefundCardButton payoutCard={card} onPress={jest.fn()} />
      </View>,
    );

    expect(getByText("453901••••1234  12/27")).toBeTruthy();
  });

  // A contactless read can return only a UID, so maskedCardNumber yields
  // undefined — the button must still confirm that a card was saved.
  it("falls back to the captured label when the card exposes no number", () => {
    const { getByText } = render(
      <View>
        <RefundCardButton payoutCard={{ mode: "nfc" }} onPress={jest.fn()} />
      </View>,
    );

    expect(getByText("MobileApp.CustomerScreen.RefundCardCaptured")).toBeTruthy();
  });

  it("calls onPress when tapped", () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <View>
        <RefundCardButton payoutCard={null} onPress={onPress} />
      </View>,
    );

    fireEvent.press(getByTestId("refund-card-button"));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("renders no clear button when onClear is omitted", () => {
    const { queryByTestId } = render(
      <View>
        <RefundCardButton payoutCard={card} onPress={jest.fn()} />
      </View>,
    );

    expect(queryByTestId("refund-card-clear")).toBeNull();
  });

  it("renders no clear button when a card has not been captured yet", () => {
    const { queryByTestId } = render(
      <View>
        <RefundCardButton
          payoutCard={null}
          onPress={jest.fn()}
          onClear={jest.fn()}
        />
      </View>,
    );

    expect(queryByTestId("refund-card-clear")).toBeNull();
  });

  it("calls onClear when the clear button is pressed", () => {
    const onClear = jest.fn();
    const onPress = jest.fn();
    const { getByTestId } = render(
      <View>
        <RefundCardButton
          payoutCard={card}
          onPress={onPress}
          onClear={onClear}
        />
      </View>,
    );

    fireEvent.press(getByTestId("refund-card-clear"));

    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest src/screens/\(auth\)/Sale/_components/__tests__/RefundCardButton.test.tsx
```

Expected: FAIL — `Cannot find module '../RefundCardButton'`.

- [ ] **Step 3: Write the component**

Create `src/screens/(auth)/Sale/_components/RefundCardButton.tsx`:

```tsx
import DebouncedPressable from "@/components/DebouncedPressable";
import { Ionicons } from "@/components/Ionicons";
import type { ScannedCard } from "@/hooks/useCardReader";
import { useLocalization } from "@/providers/LocalizationProvider";
import { maskedCardNumber } from "@/utils/cardData";
import { cn } from "@/utils/cn";
import React from "react";
import { Text } from "react-native";

interface RefundCardButtonProps {
  /** The captured refund card, or null when nothing has been scanned yet. */
  payoutCard: ScannedCard | null;
  /** Opens the scan modal. Fires on every tap, including a re-scan. */
  onPress: () => void;
  /** When supplied AND a card is captured, a clear button is rendered. */
  onClear?: () => void;
  /** Layout classes for the main button, so each screen owns its own sizing. */
  className?: string;
}

/**
 * Refund-card action shared by CustomerScreen and SaleScreenV2.
 *
 * Renders a fragment rather than its own container: the two screens place it in
 * different flex rows (a footer cell next to Save, and a full-width row above
 * Create), so the caller owns the layout and passes `className`.
 */
export function RefundCardButton({
  payoutCard,
  onPress,
  onClear,
  className,
}: RefundCardButtonProps) {
  const { t } = useLocalization();

  // A contactless read can carry no PAN at all, so fall back to a plain
  // "card saved" confirmation rather than rendering an empty label.
  const masked = payoutCard ? maskedCardNumber(payoutCard) : undefined;
  const label = payoutCard
    ? `${masked ?? t("MobileApp.CustomerScreen.RefundCardCaptured")}${
        payoutCard.expiry ? `  ${payoutCard.expiry}` : ""
      }`
    : t("MobileApp.CustomerScreen.ScanRefundCard");

  return (
    <>
      <DebouncedPressable
        testID="refund-card-button"
        onPress={onPress}
        className={cn(
          "flex-row items-center justify-center gap-2 px-4 py-4 rounded-xl border",
          payoutCard
            ? "border-gray-300 bg-gray-50"
            : "border-primary active:bg-primary/10",
          className,
        )}
      >
        <Ionicons
          name={payoutCard ? "card" : "card-outline"}
          size={20}
          color={payoutCard ? "#16a34a" : "#db0000"}
        />
        <Text
          numberOfLines={1}
          className={
            payoutCard
              ? "text-sm font-semibold text-gray-900"
              : "text-base font-semibold text-primary"
          }
        >
          {label}
        </Text>
      </DebouncedPressable>

      {onClear && payoutCard && (
        <DebouncedPressable
          testID="refund-card-clear"
          onPress={onClear}
          className="flex-row items-center px-4 py-4 border border-gray-400 active:bg-gray-50 rounded-xl"
        >
          <Ionicons name="close-outline" size={18} color="black" />
        </DebouncedPressable>
      )}
    </>
  );
}

export default RefundCardButton;
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx jest src/screens/\(auth\)/Sale/_components/__tests__/RefundCardButton.test.tsx
```

Expected: PASS, 7 tests.

`DebouncedPressable` already declares `testID` and forwards it to the underlying `Pressable` (`src/components/DebouncedPressable.tsx:19,47`), so `getByTestId` resolves without any change to that component.

- [ ] **Step 5: Typecheck and lint**

```bash
npm run typecheck && npm run lint
```

Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add "src/screens/(auth)/Sale/_components/RefundCardButton.tsx" "src/screens/(auth)/Sale/_components/__tests__/RefundCardButton.test.tsx"
git commit -m "Add a shared refund card button"
```

---

### Task 2: Use the shared button in CustomerScreen

Pure refactor — the rendered output must be identical to today.

**Files:**
- Modify: `src/screens/(auth)/Sale/CustomerScreen.tsx:432-476` (the `footer` block)

**Interfaces:**
- Consumes: `RefundCardButton` from Task 1.
- Produces: nothing new.

- [ ] **Step 1: Add the import**

In `CustomerScreen.tsx`, beside the existing `RefundCardScanModal` import (line 36):

```tsx
import { RefundCardScanModal } from "./_components/RefundCardScanModal";
import { RefundCardButton } from "./_components/RefundCardButton";
```

- [ ] **Step 2: Replace the inline button**

Find this block inside `footer` (starts line 435):

```tsx
        {isTravellerFilled && (
          <DebouncedPressable
            onPress={() => setCardScanVisible(true)}
            className={`flex-[2] flex-row items-center justify-center gap-2 px-4 py-4 rounded-xl border ${
              payoutCard
                ? "border-gray-300 bg-gray-50"
                : "border-primary active:bg-primary/10"
            }`}
          >
            <Ionicons
              name={payoutCard ? "card" : "card-outline"}
              size={20}
              color={payoutCard ? "#16a34a" : "#db0000"}
            />
            <Text
              numberOfLines={1}
              className={
                payoutCard
                  ? "text-sm font-semibold text-gray-900"
                  : "text-base font-semibold text-primary"
              }
            >
              {payoutCard
                ? `${maskedCardNumber(payoutCard) ?? t("MobileApp.CustomerScreen.RefundCardCaptured")}${payoutCard.expiry ? `  ${payoutCard.expiry}` : ""}`
                : t("MobileApp.CustomerScreen.ScanRefundCard")}
            </Text>
          </DebouncedPressable>
        )}
```

Replace it with:

```tsx
        {isTravellerFilled && (
          <RefundCardButton
            payoutCard={payoutCard}
            onPress={() => setCardScanVisible(true)}
            className="flex-[2]"
          />
        )}
```

No `onClear` — CustomerScreen keeps its current behaviour, where the card is only dropped by `clearForm`.

- [ ] **Step 3: Remove the now-unused import**

`maskedCardNumber` is no longer referenced in this file. Delete line 38:

```tsx
import { maskedCardNumber } from "@/utils/cardData";
```

Leave the `Ionicons`, `Text` and `DebouncedPressable` imports — the Save button and the header actions still use all three.

- [ ] **Step 4: Verify nothing else broke**

```bash
npm run typecheck && npm run lint && npx jest
```

Expected: typecheck clean, lint clean, all tests pass. A typecheck error naming `maskedCardNumber` or `Ionicons` means you removed an import that is still in use — restore it.

- [ ] **Step 5: Commit**

```bash
git add "src/screens/(auth)/Sale/CustomerScreen.tsx"
git commit -m "Use the shared refund card button in CustomerScreen"
```

---

### Task 3: Add the scan button to SaleScreenV2

**Files:**
- Modify: `src/screens/(auth)/Sale/SaleScreenV2.tsx` — imports, line 405, line ~435, lines 832-837, line ~865

**Interfaces:**
- Consumes: `RefundCardButton` (Task 1); `RefundCardScanModal`; `usePayoutStore`.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Add the imports**

Beside the existing `CartReviewModal` import (line 28):

```tsx
import { CartReviewModal } from "./_components/CartReviewModal";
import { RefundCardScanModal } from "./_components/RefundCardScanModal";
import { RefundCardButton } from "./_components/RefundCardButton";
```

- [ ] **Step 2: Pull `setPayoutCard` out of the store**

Line 405 currently reads:

```tsx
  const { payoutCard, clearPayoutCard } = usePayoutStore();
```

Change it to:

```tsx
  const { payoutCard, setPayoutCard, clearPayoutCard } = usePayoutStore();
```

- [ ] **Step 3: Add the modal-visibility state**

Directly after the `isCreatingSale` state (line 435):

```tsx
  const [isCreatingSale, setIsCreatingSale] = useState(false);
  // Refund card scan sheet. The card itself lives in usePayoutStore so it
  // survives navigation and reaches createSale as the payoutToken.
  const [cardScanVisible, setCardScanVisible] = useState(false);
```

- [ ] **Step 4: Render the button above Create Sale**

Between the signature block (ends line 834) and the `{/* Create Sale */}` comment (line 836), insert:

```tsx
        {/* Refund card — always available, independent of traveller selection.
            A card scanned without a traveller still rides along on the Draft. */}
        <View className="flex-row items-center gap-2 mt-2">
          <RefundCardButton
            payoutCard={payoutCard}
            onPress={() => setCardScanVisible(true)}
            onClear={clearPayoutCard}
            className="flex-1"
          />
        </View>
```

- [ ] **Step 5: Render the scan modal**

Beside the existing modals (line 865):

```tsx
        <CartReviewModal sheetRef={cartReviewSheetRef} />
        <RefundCardScanModal
          visible={cardScanVisible}
          onClose={() => setCardScanVisible(false)}
          onCaptured={(card) => {
            setPayoutCard(card);
            setCardScanVisible(false);
          }}
        />
```

- [ ] **Step 6: Verify**

```bash
npm run typecheck && npm run lint && npx jest
```

Expected: all clean. `closeAndReset` already calls `clearPayoutCard()` (line 584), so no reset change is needed.

- [ ] **Step 7: Commit**

```bash
git add "src/screens/(auth)/Sale/SaleScreenV2.tsx"
git commit -m "Scan a refund card from the sale screen"
```

---

### Task 4: Send payoutToken on Draft tags

Applies the same change to both sale screens so the two layouts cannot disagree about what a Draft carries.

**Files:**
- Modify: `src/screens/(auth)/Sale/SaleScreenV2.tsx:628-641`
- Modify: `src/screens/(auth)/Sale/SaleScreen.tsx:317-331`

**Interfaces:**
- Consumes: `toPayoutToken` from `@/utils/cardData` (already imported in both files).
- Produces: nothing.

- [ ] **Step 1: Update SaleScreenV2**

Replace lines 628-630:

```tsx
    // Registered as the traveller's payout token; only meaningful with a
    // traveller, so it rides along with the Issued-only traveller payload.
    const payoutToken = toPayoutToken(payoutCard);
```

with:

```tsx
    // Sent for Draft tags as well as Issued ones: a card scanned before a
    // traveller is chosen must survive onto the draft so the traveller who
    // later claims it keeps the payout token.
    const payoutToken = toPayoutToken(payoutCard);
```

Then replace lines 640-642:

```tsx
      ...(status === "Issued"
        ? { traveller, ...(payoutToken ? { payoutToken } : {}) }
        : {}),
```

with:

```tsx
      ...(status === "Issued" ? { traveller } : {}),
      ...(payoutToken ? { payoutToken } : {}),
```

- [ ] **Step 2: Update SaleScreen (V1)**

Replace lines 317-319:

```tsx
    // Registered as the traveller's payout token; only meaningful with a
    // traveller, so it rides along with the Issued-only traveller payload.
    const payoutToken = toPayoutToken(payoutCard);
```

with:

```tsx
    // Sent for Draft tags as well as Issued ones, matching SaleScreenV2: a card
    // captured on the customer screen must survive onto the draft.
    const payoutToken = toPayoutToken(payoutCard);
```

Then replace lines 329-331 — note V1 writes `traveller: traveller`, not shorthand:

```tsx
      ...(status === "Issued"
        ? { traveller: traveller, ...(payoutToken ? { payoutToken } : {}) }
        : {}),
```

with:

```tsx
      ...(status === "Issued" ? { traveller: traveller } : {}),
      ...(payoutToken ? { payoutToken } : {}),
```

- [ ] **Step 3: Verify**

```bash
npm run typecheck && npm run lint && npx jest
```

Expected: all clean. `traveller` stays `Issued`-only in both files; only `payoutToken` moved out.

- [ ] **Step 4: Commit**

```bash
git add "src/screens/(auth)/Sale/SaleScreenV2.tsx" "src/screens/(auth)/Sale/SaleScreen.tsx"
git commit -m "Keep the refund card on draft tags"
```

---

### Task 5: Verify Draft + payoutToken against the dev API

This settles the spec's open risk. `CreateTagRequestDto` permits the shape, but TagService documents `payoutToken` as registering the card as *the traveller's* payout token, and the service source is not in this workspace. **Do not skip this task** — it is the only check that the chosen behaviour works end to end.

**Files:** none — this is manual device verification.

- [ ] **Step 1: Build and install on the Sunmi device**

```bash
npm run android:dev
```

The card reader is a native Sunmi module; it reports `unsupported` in Expo Go and on an emulator, so a real device is required.

- [ ] **Step 2: Confirm SaleScreenV2 is the active layout**

In the app: Device Settings → Sale Screen Layout → **Compact (All-in-One)**.

- [ ] **Step 3: Exercise the Draft path**

1. Open the sale screen with **no traveller selected**.
2. Add any product to the cart.
3. Tap **Scan Refund Card**, choose swipe or tap, and present a test card.
4. Confirm the button now shows the masked PAN and expiry, and that an X button appeared next to it.
5. Tap **Create Draft Tag**.

- [ ] **Step 4: Record the outcome**

Watch the request and response:

```bash
npm run log
```

- **HTTP 200 / tag created** — the behaviour works. Note the created tag id and move to Step 5.
- **HTTP 400 or a validation error naming the traveller or payout token** — STOP. Do not merge. Report the exact response body; the fallback recorded in the spec is to restrict `payoutToken` to `Issued` tags again and raise a backend ticket, keeping the button.

- [ ] **Step 5: Exercise the Issued path (regression)**

1. Start a new sale, open the customer screen, and fill in a traveller.
2. Back on the sale screen, scan a card, add a product, tap **Create Tag**.
3. Confirm the tag is created and the printed receipt shows the masked card.

- [ ] **Step 6: Check the clear button and CustomerScreen parity**

1. Scan a card, tap the X — the button returns to "Scan Refund Card".
2. Open the customer screen with a fully-filled traveller and confirm its own refund-card button still renders and scans exactly as before, with **no** X beside it.

- [ ] **Step 7: Record the result in the spec**

Append the confirmed outcome to the "Open risk" section of `docs/superpowers/specs/2026-08-03-salescreenv2-refund-card-design.md`, then commit from the `docs` repo:

```bash
cd /c/unirefund/docs
git add superpowers/specs/2026-08-03-salescreenv2-refund-card-design.md
git commit -m "Record the dev API outcome for draft payout tokens"
```

---

## Self-Review

**Spec coverage**

| Spec item | Task |
| --- | --- |
| Shared `RefundCardButton` with `payoutCard` / `onPress` / `onClear` / `className` | 1 |
| Button always visible and enabled in SaleScreenV2 | 3 (Step 4) |
| Placed above Create Tag / Create Draft Tag | 3 (Step 4) |
| Masked PAN + expiry when captured; tap re-scans | 1 (Step 3), 3 (Step 5) |
| Separate clear button in V2 only | 1 (Step 3), 3 (Step 4) |
| CustomerScreen unchanged in behaviour, no `onClear` | 2 |
| `payoutToken` on Draft **and** Issued, both screens | 4 |
| `traveller` stays Issued-only | 4 |
| No new localization keys | Global Constraints |
| Component unit test, no screen tests | 1 |
| Dev API verification of Draft + payoutToken | 5 |
| V1 gets no scan button | Global Constraints |

No gaps.

**Placeholder scan:** No TBD/TODO. Every code step carries the literal code. Task 5 is manual by design and lists concrete steps and pass/fail criteria rather than "verify it works".

**Type consistency:** `RefundCardButton` props are declared once in Task 1 and used with those exact names in Tasks 2 and 3. `payoutCard` is `ScannedCard | null`, which is exactly the type `usePayoutStore` holds. `clearPayoutCard` is passed as `onClear` — both are `() => void`. `setPayoutCard` accepts `ScannedCard | null`, and `RefundCardScanModal`'s `onCaptured` supplies a `ScannedCard`.

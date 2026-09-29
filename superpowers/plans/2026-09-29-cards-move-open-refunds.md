# My Cards: Move Open Refunds — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On My Cards, in super-app and in ssr, offer to point the traveller's open refunds at the hero card: after set-default, after adding a card, when deleting a card open refunds use, and from a persistent mismatch line.

**Architecture:** Each app gets two pure modules and a thin UI layer:
- `openRefunds`: counts open tags per card and plans a delete.
- `moveRefunds`: runs set-default → pin → delete in order, stopping at the first failure.
- The UI layer: a move prompt, a mismatch line, and a four-case delete confirm.

The pin is `POST tag-service/tag/traveller-payout-token` with only `{ payoutTokenId }`. The two apps are separate repos, so the logic is written once per app.

**Tech Stack:**
- super-app: Expo / React Native, `@gorhom/bottom-sheet` 5, jest (`jest-expo`), `@testing-library/react-native`.
- ssr: Next.js 16, React 19, shadcn `Dialog`, Node's built-in test runner through `tsx`.

**Spec:** `c:\unirefund\docs\superpowers\specs\2026-09-29-cards-move-open-refunds-design.md`

## Global Constraints

- **Worktrees only.** Both shared checkouts are in use by other sessions:
  - super-app was on `fix/tag-filter-badge-count` and web-app on `feat/payout-card-selector-style` when this plan was written.
  - Work in `C:\unirefund\super-app-wt-cards-move-refunds` and `C:\unirefund\web-app-wt-cards-move-refunds`, each on branch `feat/cards-move-open-refunds` off `origin/main`.
  - Never `checkout`, `reset`, `stash` or `rm -rf` inside `C:\unirefund\super-app` or `C:\unirefund\web-app`.
- **Commits.** `git add` explicit paths only, never `-A`. Write the message with a quoted heredoc and `git commit -F -`, with no backticks or backslashes inside it. End every message with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **Status allowlist, verbatim:** `Open`, `PreIssued`, `Issued`, `WaitingGoodsValidation`, `WaitingStampValidation`, `ExportValidated`. Tag list request: `maxResultCount: 999` (1000 is the ceiling; 1001 returns 400).
- **Red filter.** A tag is red when `risk.finalRiskLevel ?? risk.riskLevel` is `"Red"`. Red tags are not open refunds.
- **A tag with `payoutTokenId: null` counts as "not on this card".**
- **Pin target and prompts.**
  - The pin target is always the hero, or a card the traveller explicitly picked in the delete flow.
  - If the target is not `isDefault`, set-default runs first.
  - Never call the pin when the count of open refunds not on the target is 0. Never re-pin on claim.
- **Failed tag lookup.** When the tag lookup fails or is still loading, My Cards behaves exactly as it does today: no prompt, no line, plain delete.
- **Delete order.** Pin before delete. **Never delete a card after a failed pin.**
- **Delete wording.** The copy says the delete moves **all** open refunds, because the endpoint cannot move only one card's tags.
- **Result toasts.** A result toast uses the server's `changedCount`. There is none when it is 0.
- **Bank tokens never prompt.** The pin is card-only.
- **super-app sheets:**
  - Call `useLocalization()` / `useToast()` in the component that renders `<BottomSheet>`, never in a child reachable inside it.
  - **Content must not grow after the sheet opens**: gorhom dynamic sizing measures once and clips later growth. So failures surface as `toast.error` (Toast is `stackBehavior="push"`, safe over an open sheet), and the delete picker shows every choice at once (`expanded`, no "show more").
- **super-app tests.** Render and hook tests are named `*.router.test.tsx`; pure tests are `*.test.ts`.
- **super-app copy keys.** They live nested under `Cards` in `src/localization/resources/{en-US,tr-TR}.json` and are read as `MobileApp.Cards.…`. Run `npm run init` after editing them, or `tsc` rejects the new keys (TS2345). Interpolation is `{name}`, and plurals are paired `…One` / `…Other` keys.
- **ssr copy keys.** They are flat keys in `apps/ssr/src/language-data/unirefund/SSRService/resources/{en,tr}.json`. Run `pnpm --filter ssr run init` after editing them. Interpolation uses the `fill()` helper from Task 9.
- **Comments.** Only the non-obvious. The plan's code already carries the few this feature needs; do not add docblocks that restate names.
- **Builds.** Never run an EAS, Gradle or `next build`. The user runs builds.

## Review Focus

The five failure modes most likely to bite a traveller, each with the test that pins it:

1. **Re-adding a card the traveller already has.** The backend returns the existing token, which may already hold every open refund, so nothing should be asked. Pinned in Task 5 ("asks nothing after re-adding a card that already holds every open refund").
2. **Acting before the tag list has loaded.** Set-default must toast and change the default exactly as today, with no prompt. Pinned in Task 5 ("changes the default as before while the tag list is still loading").
3. **Hero card expired while open refunds sit on other cards.**
   - The line must hide its Move action.
   - Deleting a pinned card must ask for a card rather than move onto the expired hero.
   - Pinned in Task 1 / Task 6 ("asks for a new card instead of moving onto an expired hero") and Task 5 ("hides the line's move while the hero card is expired").
4. **Retrying after "default changed, pin failed".**
   - The retry must not call set-default again, and the copy must keep saying the default changed.
   - Pinned in Task 2 / Task 7 (`nextFailure`), Task 3 ("retries a failed pin without setting the default again"), and Task 10's manual check.
5. **Deleting the only usable card while open refunds use it.** "Delete anyway" must delete without calling the pin. Pinned in Task 4 ("deletes the only card without pinning when the traveller says so") and Task 12's ssr walkthrough.

---

## File map

**super-app** (`C:\unirefund\super-app-wt-cards-move-refunds`):

| File | Responsibility |
| --- | --- |
| `src/screens/traveller/Cards/openRefunds.ts` (new) | Status allowlist, red filter, `openRefunds()`, `notOnCard()`, `deletePlan()` |
| `src/screens/traveller/Cards/moveRefunds.ts` (new) | `moveOpenRefunds()`, `deleteMovingRefunds()`, `defaultAlreadyChanged()`, `nextFailure()` |
| `src/screens/traveller/Cards/useOpenRefunds.ts` (new) | Fetches open tags and exposes `{ refunds, refresh }` |
| `src/screens/traveller/Cards/_components/MoveRefundsSheet.tsx` (new) | The move prompt (three modes) |
| `src/screens/traveller/Cards/_components/OpenRefundsLine.tsx` (new) | The mismatch line under the hero |
| `src/screens/traveller/Cards/_components/DeleteTokenSheet.tsx` (modify) | The four delete cases |
| `src/screens/traveller/Cards/_components/AddCardSheet.tsx` (modify) | New `onClosed` prop |
| `src/screens/traveller/Cards/useCards.ts` (modify) | Quiet set-default, `moveRefundsTo`, `removeMovingRefunds` |
| `src/screens/traveller/Cards/CardsScreen.tsx` (modify) | Wiring |
| `src/utils/card/card.ts` (modify) | `maskedTail()` |
| `src/localization/resources/{en-US,tr-TR}.json` (modify) | `Cards.MoveRefunds.*`, `Cards.DeleteMove.*` |

**ssr** (`C:\unirefund\web-app-wt-cards-move-refunds\apps\ssr`):

| File | Responsibility |
| --- | --- |
| `package.json` (modify) | `test:unit` script |
| `src/components/payout-cards/open-refunds.ts` (new) | Same logic as super-app's `openRefunds.ts` |
| `src/components/payout-cards/move-refunds.ts` (new) | Same orchestration, result-style calls |
| `src/components/payout-cards/fill.ts` (new) | `{name}` interpolation for SSRService copy |
| `src/components/payout-cards/card-option.tsx` (new) | `CardOption` + `maskedTail`, lifted from the validate step |
| `src/app/[lang]/(public)/validate/_components/payout-card-step.tsx` (modify) | Imports the lifted `CardOption` |
| `src/components/payout-cards/add-card-dialog.tsx` (modify) | Optional controlled `open` / `onOpenChange` |
| `src/app/[lang]/(main)/account/cards/_components/move-refunds-dialog.tsx` (new) | The move prompt |
| `src/app/[lang]/(main)/account/cards/_components/open-refunds-line.tsx` (new) | The mismatch line |
| `src/app/[lang]/(main)/account/cards/_components/move-calls.ts` (new) | Server-action adapters for `move-refunds.ts` |
| `src/app/[lang]/(main)/account/cards/_components/delete-card-dialog.tsx` (modify) | The four delete cases |
| `src/app/[lang]/(main)/account/cards/_components/cards-view.tsx` (modify) | Wiring |
| `src/app/[lang]/(main)/account/cards/page.tsx` (modify) | Optional tag fetch |
| `src/language-data/unirefund/SSRService/resources/{en,tr}.json` (modify) | `Account.Cards.MoveRefunds.*`, `Account.Cards.DeleteMove.*` |

---

## Part A — super-app

### Task 1: Worktree and the open-refunds model

**Files:**
- Create: `src/screens/traveller/Cards/openRefunds.ts`
- Test: `src/screens/traveller/Cards/__tests__/openRefunds.test.ts`

**Interfaces:**
- Consumes: `sortPayoutTokens`, `preferredPayoutToken` from `src/screens/shared/Tags/Tag/_components/refund/refund.logic.ts`; the `PayoutToken` type from `./useCards`.
- Produces:
  - `OPEN_REFUND_STATUSES: TagStatus[]`
  - `type OpenRefunds = { count: number; byCard: Record<string, number> }`
  - `NO_OPEN_REFUNDS: OpenRefunds`
  - `openRefunds(tags: readonly TravellerTag[]): OpenRefunds`
  - `notOnCard(refunds: OpenRefunds, cardId: string): number`
  - `type DeletePlan = { kind: "plain" } | { kind: "moveToHero"; count; hero } | { kind: "choose"; count; choices; preselected } | { kind: "noTarget"; count }`
  - `deletePlan(token, cards, hero, refunds): DeletePlan`

(The spec's `offHero` field is the same number as `notOnCard(refunds, hero.id)`. The function form also serves the add and set-default prompts, whose target is not the hero.)

- [ ] **Step 1: Create the worktree**

Run in Git Bash:

```bash
cd /c/unirefund/super-app && git fetch origin
git worktree add /c/unirefund/super-app-wt-cards-move-refunds -b feat/cards-move-open-refunds origin/main
cp /c/unirefund/super-app/.env /c/unirefund/super-app-wt-cards-move-refunds/.env
cd /c/unirefund/super-app-wt-cards-move-refunds && npm ci && npm run init
```

Expected: `npm ci` completes, and `npm run init` writes `src/data/language-data/*.gen.json`. The worktree lives outside the repo on purpose: `jest.config.js` ignores every path under `.claude/`.

- [ ] **Step 2: Record the baseline**

Run: `npx jest src/screens/traveller/Cards src/screens/traveller/Validate`
Expected: every suite passes. Write the pass counts into your task report. If anything fails here, stop and report it — it is not yours.

- [ ] **Step 3: Write the failing test**

Create `src/screens/traveller/Cards/__tests__/openRefunds.test.ts`:

```ts
import type { UniRefund_TagService_Tags_TagListItemForTravellerCrossTenantsDto as TravellerTag } from "@/saas/TagService";
import {
  deletePlan,
  NO_OPEN_REFUNDS,
  notOnCard,
  openRefunds,
} from "../openRefunds";
import type { PayoutToken } from "../useCards";

const tag = (over: Record<string, unknown> = {}) =>
  ({
    id: "tag",
    status: "Issued",
    payoutTokenId: null,
    ...over,
  }) as unknown as TravellerTag;

const card = (id: string, over: Partial<PayoutToken> = {}): PayoutToken => ({
  id,
  travellerId: "tr-1",
  type: "Card",
  isDefault: false,
  isLastUsed: false,
  maskedNumber: `411111000000${id.slice(-4)}`,
  expiryMonth: 9,
  expiryYear: 2030,
  isExpired: false,
  ...over,
});

describe("openRefunds", () => {
  it("counts only tags whose payout card still matters", () => {
    const statuses = [
      "Open",
      "PreIssued",
      "Issued",
      "WaitingGoodsValidation",
      "WaitingStampValidation",
      "ExportValidated",
      "Refunded",
      "Cancelled",
      "Expired",
      "PaymentInProgress",
      "EarlyRefunded",
      "Declined",
      "Draft",
    ];
    expect(openRefunds(statuses.map((status) => tag({ status }))).count).toBe(6);
  });

  it("leaves red tags out, reading the final risk level first", () => {
    const refunds = openRefunds([
      tag({ risk: { finalRiskLevel: "Red" } }),
      tag({ risk: { riskLevel: "Red" } }),
      tag({ risk: { riskLevel: "Red", finalRiskLevel: "Green" } }),
      tag({ risk: { riskLevel: "Unknown" } }),
    ]);
    expect(refunds.count).toBe(2);
  });

  it("groups pins by card and keeps unpinned tags in the total only", () => {
    const refunds = openRefunds([
      tag({ payoutTokenId: "card-1111" }),
      tag({ payoutTokenId: "card-1111" }),
      tag({ payoutTokenId: "card-2222" }),
      tag({ payoutTokenId: null }),
    ]);
    expect(refunds).toEqual({
      count: 4,
      byCard: { "card-1111": 2, "card-2222": 1 },
    });
  });
});

describe("notOnCard", () => {
  it("counts tags on other cards and tags with no card", () => {
    const refunds = { count: 4, byCard: { "card-1111": 2, "card-2222": 1 } };
    expect(notOnCard(refunds, "card-1111")).toBe(2);
    expect(notOnCard(refunds, "card-9999")).toBe(4);
    expect(notOnCard(NO_OPEN_REFUNDS, "card-1111")).toBe(0);
  });
});

describe("deletePlan", () => {
  const hero = card("card-1111", { isDefault: true });
  const other = card("card-2222");
  const refunds = { count: 3, byCard: { "card-1111": 1, "card-2222": 2 } };

  it("is plain when no open refund uses the card", () => {
    expect(deletePlan(other, [hero, other], hero, NO_OPEN_REFUNDS)).toEqual({
      kind: "plain",
    });
  });

  it("moves everything onto the hero when deleting another card", () => {
    expect(deletePlan(other, [hero, other], hero, refunds)).toEqual({
      kind: "moveToHero",
      count: 2,
      hero,
    });
  });

  it("asks for a new card when deleting the hero, preselecting last used", () => {
    const lastUsed = card("card-3333", { isLastUsed: true });
    const plan = deletePlan(hero, [hero, other, lastUsed], hero, refunds);
    expect(plan).toMatchObject({ kind: "choose", count: 1, preselected: lastUsed });
    expect(plan.kind === "choose" && plan.choices.map((c) => c.id)).toEqual([
      "card-3333",
      "card-2222",
    ]);
  });

  it("asks for a new card instead of moving onto an expired hero", () => {
    const expiredHero = card("card-1111", { isDefault: true, isExpired: true });
    const third = card("card-3333");
    const plan = deletePlan(other, [expiredHero, other, third], expiredHero, refunds);
    expect(plan).toMatchObject({ kind: "choose", count: 2, preselected: third });
  });

  it("has no target when every other card is expired", () => {
    const expired = card("card-3333", { isExpired: true });
    expect(deletePlan(hero, [hero, expired], hero, refunds)).toEqual({
      kind: "noTarget",
      count: 1,
    });
  });
});
```

- [ ] **Step 4: Run it and see it fail**

Run: `npx jest src/screens/traveller/Cards/__tests__/openRefunds.test.ts`
Expected: FAIL with `Cannot find module '../openRefunds'`.

- [ ] **Step 5: Implement**

Create `src/screens/traveller/Cards/openRefunds.ts`:

```ts
import type {
  UniRefund_TagService_Tags_TagListItemForTravellerCrossTenantsDto as TravellerTag,
  UniRefund_TagService_Tags_TagStatusType as TagStatus,
} from "@/saas/TagService";
import {
  preferredPayoutToken,
  sortPayoutTokens,
} from "../../shared/Tags/Tag/_components/refund/refund.logic";
import type { PayoutToken } from "./useCards";

// Our reading of the pin endpoint's "a status where the payout target still
// matters". The server's rule decides what moves; this only decides whether to ask.
export const OPEN_REFUND_STATUSES: TagStatus[] = [
  "Open",
  "PreIssued",
  "Issued",
  "WaitingGoodsValidation",
  "WaitingStampValidation",
  "ExportValidated",
];

export type OpenRefunds = {
  count: number;
  byCard: Record<string, number>;
};

export const NO_OPEN_REFUNDS: OpenRefunds = { count: 0, byCard: {} };

function isRed(tag: TravellerTag) {
  return (tag.risk?.finalRiskLevel ?? tag.risk?.riskLevel) === "Red";
}

export function openRefunds(tags: readonly TravellerTag[]): OpenRefunds {
  const open = tags.filter(
    (tag) => OPEN_REFUND_STATUSES.includes(tag.status) && !isRed(tag),
  );
  const byCard: Record<string, number> = {};
  for (const tag of open) {
    if (tag.payoutTokenId) {
      byCard[tag.payoutTokenId] = (byCard[tag.payoutTokenId] ?? 0) + 1;
    }
  }
  return { count: open.length, byCard };
}

// An unpinned tag counts as not on the card: the desk resolves it through
// last-used before default.
export function notOnCard(refunds: OpenRefunds, cardId: string): number {
  return refunds.count - (refunds.byCard[cardId] ?? 0);
}

export type DeletePlan =
  | { kind: "plain" }
  | { kind: "moveToHero"; count: number; hero: PayoutToken }
  | {
      kind: "choose";
      count: number;
      choices: PayoutToken[];
      preselected: PayoutToken;
    }
  | { kind: "noTarget"; count: number };

export function deletePlan(
  token: PayoutToken,
  cards: readonly PayoutToken[],
  hero: PayoutToken | null,
  refunds: OpenRefunds,
): DeletePlan {
  const count = refunds.byCard[token.id] ?? 0;
  if (count === 0) return { kind: "plain" };
  if (hero && hero.id !== token.id && !hero.isExpired) {
    return { kind: "moveToHero", count, hero };
  }
  const choices = sortPayoutTokens(
    cards.filter((card) => card.id !== token.id && !card.isExpired),
  );
  const preselected = preferredPayoutToken(choices) ?? choices[0];
  return preselected
    ? { kind: "choose", count, choices, preselected }
    : { kind: "noTarget", count };
}
```

- [ ] **Step 6: Run it and see it pass**

Run: `npx jest src/screens/traveller/Cards/__tests__/openRefunds.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 7: Commit**

```bash
git add src/screens/traveller/Cards/openRefunds.ts src/screens/traveller/Cards/__tests__/openRefunds.test.ts
git commit -F - <<'EOF'
feat(cards): count open refunds per card and plan a card delete

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: The move and delete sequence

**Files:**
- Create: `src/screens/traveller/Cards/moveRefunds.ts`
- Test: `src/screens/traveller/Cards/__tests__/moveRefunds.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `type MoveOutcome = { status: "moved"; changedCount: number } | { status: "defaultFailed" } | { status: "pinFailed"; defaultChanged: boolean }`
  - `type DeleteOutcome = { status: "deleted"; changedCount: number } | { status: "deleteFailed"; changedCount: number } | MoveFailure`
  - `type MoveFailure = Exclude<MoveOutcome, { status: "moved" }>`
  - `type DeleteFailure = Exclude<DeleteOutcome, { status: "deleted" }>`
  - `type MoveCalls = { setDefault(id): Promise<unknown>; pin(id): Promise<{ changedCount: number }>; remove(id): Promise<unknown>; onFailure?(step, error): void }`. Each call **throws** on failure.
  - `moveOpenRefunds(target: { id: string; isDefault: boolean }, calls): Promise<MoveOutcome>`
  - `deleteMovingRefunds(cardId: string, target, calls): Promise<DeleteOutcome>`
  - `defaultAlreadyChanged(failure: DeleteFailure | null): boolean`
  - `nextFailure<F extends DeleteFailure>(previous: DeleteFailure | null, next: F): F`

- [ ] **Step 1: Write the failing test**

Create `src/screens/traveller/Cards/__tests__/moveRefunds.test.ts`:

```ts
import {
  defaultAlreadyChanged,
  deleteMovingRefunds,
  moveOpenRefunds,
  nextFailure,
  type MoveCalls,
} from "../moveRefunds";

function setup(over: Partial<MoveCalls> = {}) {
  const order: string[] = [];
  const calls: MoveCalls = {
    setDefault: jest.fn(async (id: string) => {
      order.push(`setDefault:${id}`);
    }),
    pin: jest.fn(async (id: string) => {
      order.push(`pin:${id}`);
      return { changedCount: 3 };
    }),
    remove: jest.fn(async (id: string) => {
      order.push(`remove:${id}`);
    }),
    onFailure: jest.fn(),
    ...over,
  };
  return { calls, order };
}

const failing = () =>
  jest.fn(async () => {
    throw new Error("nope");
  });

describe("moveOpenRefunds", () => {
  it("pins a card that is already the default without setting it again", async () => {
    const { calls, order } = setup();
    await expect(
      moveOpenRefunds({ id: "a", isDefault: true }, calls),
    ).resolves.toEqual({ status: "moved", changedCount: 3 });
    expect(order).toEqual(["pin:a"]);
  });

  it("sets the default before pinning", async () => {
    const { calls, order } = setup();
    await moveOpenRefunds({ id: "a", isDefault: false }, calls);
    expect(order).toEqual(["setDefault:a", "pin:a"]);
  });

  it("stops before the pin when set-default fails", async () => {
    const { calls } = setup({ setDefault: failing() });
    await expect(
      moveOpenRefunds({ id: "a", isDefault: false }, calls),
    ).resolves.toEqual({ status: "defaultFailed" });
    expect(calls.pin).not.toHaveBeenCalled();
    expect(calls.onFailure).toHaveBeenCalledWith("setDefault", expect.any(Error));
  });

  it("says whether the default changed when only the pin failed", async () => {
    const { calls } = setup({ pin: failing() });
    await expect(
      moveOpenRefunds({ id: "a", isDefault: false }, calls),
    ).resolves.toEqual({ status: "pinFailed", defaultChanged: true });
    await expect(
      moveOpenRefunds({ id: "a", isDefault: true }, calls),
    ).resolves.toEqual({ status: "pinFailed", defaultChanged: false });
  });
});

describe("deleteMovingRefunds", () => {
  it("moves the refunds before it deletes", async () => {
    const { calls, order } = setup();
    await expect(
      deleteMovingRefunds("a", { id: "b", isDefault: false }, calls),
    ).resolves.toEqual({ status: "deleted", changedCount: 3 });
    expect(order).toEqual(["setDefault:b", "pin:b", "remove:a"]);
  });

  it("never deletes after a failed pin", async () => {
    const { calls } = setup({ pin: failing() });
    await expect(
      deleteMovingRefunds("a", { id: "b", isDefault: true }, calls),
    ).resolves.toEqual({ status: "pinFailed", defaultChanged: false });
    expect(calls.remove).not.toHaveBeenCalled();
  });

  it("reports a failed delete after the refunds moved", async () => {
    const { calls } = setup({ remove: failing() });
    await expect(
      deleteMovingRefunds("a", { id: "b", isDefault: true }, calls),
    ).resolves.toEqual({ status: "deleteFailed", changedCount: 3 });
  });
});

describe("nextFailure", () => {
  it("keeps 'default changed' across a retry that no longer sets it", () => {
    const first = { status: "pinFailed", defaultChanged: true } as const;
    const retry = { status: "pinFailed", defaultChanged: false } as const;
    expect(defaultAlreadyChanged(first)).toBe(true);
    expect(nextFailure(first, retry)).toEqual(first);
    expect(nextFailure(null, retry)).toEqual(retry);
    expect(defaultAlreadyChanged(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx jest src/screens/traveller/Cards/__tests__/moveRefunds.test.ts`
Expected: FAIL with `Cannot find module '../moveRefunds'`.

- [ ] **Step 3: Implement**

Create `src/screens/traveller/Cards/moveRefunds.ts`:

```ts
export type MoveOutcome =
  | { status: "moved"; changedCount: number }
  | { status: "defaultFailed" }
  | { status: "pinFailed"; defaultChanged: boolean };

export type MoveFailure = Exclude<MoveOutcome, { status: "moved" }>;

export type DeleteOutcome =
  | { status: "deleted"; changedCount: number }
  | { status: "deleteFailed"; changedCount: number }
  | MoveFailure;

export type DeleteFailure = Exclude<DeleteOutcome, { status: "deleted" }>;

export type MoveCalls = {
  setDefault: (id: string) => Promise<unknown>;
  pin: (id: string) => Promise<{ changedCount: number }>;
  remove: (id: string) => Promise<unknown>;
  onFailure?: (step: "setDefault" | "pin" | "remove", error: unknown) => void;
};

type Target = { id: string; isDefault: boolean };

export async function moveOpenRefunds(
  target: Target,
  calls: MoveCalls,
): Promise<MoveOutcome> {
  let defaultChanged = false;
  if (!target.isDefault) {
    try {
      await calls.setDefault(target.id);
      defaultChanged = true;
    } catch (error) {
      calls.onFailure?.("setDefault", error);
      return { status: "defaultFailed" };
    }
  }
  try {
    const { changedCount } = await calls.pin(target.id);
    return { status: "moved", changedCount };
  } catch (error) {
    calls.onFailure?.("pin", error);
    return { status: "pinFailed", defaultChanged };
  }
}

export async function deleteMovingRefunds(
  cardId: string,
  target: Target,
  calls: MoveCalls,
): Promise<DeleteOutcome> {
  const moved = await moveOpenRefunds(target, calls);
  if (moved.status !== "moved") return moved;
  try {
    await calls.remove(cardId);
    return { status: "deleted", changedCount: moved.changedCount };
  } catch (error) {
    calls.onFailure?.("remove", error);
    return { status: "deleteFailed", changedCount: moved.changedCount };
  }
}

export function defaultAlreadyChanged(failure: DeleteFailure | null): boolean {
  return failure?.status === "pinFailed" && failure.defaultChanged;
}

// A retry after "default changed, pin failed" skips set-default, so its own
// outcome would forget the default already changed.
export function nextFailure<F extends DeleteFailure>(
  previous: DeleteFailure | null,
  next: F,
): F {
  if (next.status === "pinFailed" && defaultAlreadyChanged(previous)) {
    return { ...next, defaultChanged: true } as F;
  }
  return next;
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx jest src/screens/traveller/Cards/__tests__/moveRefunds.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/screens/traveller/Cards/moveRefunds.ts src/screens/traveller/Cards/__tests__/moveRefunds.test.ts
git commit -F - <<'EOF'
feat(cards): move open refunds before a delete, never after a failed pin

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: The move prompt and the mismatch line

**Files:**
- Modify: `src/utils/card/card.ts` (add `maskedTail` right after `lastFour`, around line 147)
- Modify: `src/localization/resources/en-US.json`, `src/localization/resources/tr-TR.json` (inside `"Cards"`)
- Create: `src/screens/traveller/Cards/_components/MoveRefundsSheet.tsx`
- Create: `src/screens/traveller/Cards/_components/OpenRefundsLine.tsx`
- Test: `src/screens/traveller/Cards/__tests__/MoveRefundsSheet.router.test.tsx`
- Test: `src/screens/traveller/Cards/__tests__/OpenRefundsLine.router.test.tsx`

**Interfaces:**
- Consumes: `MoveOutcome`, `MoveFailure`, `defaultAlreadyChanged`, `nextFailure` (Task 2); `PayoutToken` from `../useCards`.
- Produces:
  - `maskedTail(masked: string): string`, returning `"•••• 4242"`
  - `type MovePrompt = { mode: "afterDefault" | "afterAdd" | "line"; target: PayoutToken; count: number }`
  - `MoveRefundsSheet({ sheetRef, prompt: MovePrompt | null, onConfirm: (target: PayoutToken) => Promise<MoveOutcome> })`
  - `OpenRefundsLine({ count: number; disabled?: boolean; onPress: () => void })`

- [ ] **Step 1: Add the copy**

In `src/localization/resources/en-US.json`, inside the `"Cards"` object, add this entry after `"NoTravellerId"`. Mind the comma on the preceding line.

```json
    "MoveRefunds": {
      "MoveTitle": "Move your open refunds?",
      "UseTitle": "Use {card} for refunds?",
      "AfterDefaultOne": "{card} is now your refund card. 1 open refund isn't set to it yet.",
      "AfterDefaultOther": "{card} is now your refund card. {count} open refunds aren't set to it yet.",
      "AfterAddOne": "It becomes your default, and your open refund moves to it.",
      "AfterAddOther": "It becomes your default, and your {count} open refunds move to it.",
      "LineBodyOne": "1 open refund isn't set to {card} yet.",
      "LineBodyOther": "{count} open refunds aren't set to {card} yet.",
      "Move": "Move to this card",
      "Use": "Use this card",
      "NotNow": "Not now",
      "Close": "Close",
      "DefaultFailed": "Couldn't make this card your default. Nothing changed.",
      "PinFailed": "Couldn't move your open refunds.",
      "PinFailedDefaultChanged": "It's your default now, but your open refunds didn't move.",
      "MovedOne": "1 refund moved to {card}",
      "MovedOther": "{count} refunds moved to {card}",
      "LineOne": "1 open refund isn't set to this card",
      "LineOther": "{count} open refunds aren't set to this card",
      "LineAction": "Move"
    },
```

In `src/localization/resources/tr-TR.json`, add the same keys in the same place inside `"Cards"`:

```json
    "MoveRefunds": {
      "MoveTitle": "Açık iadeleriniz taşınsın mı?",
      "UseTitle": "İadeler için {card} kullanılsın mı?",
      "AfterDefaultOne": "{card} artık iade kartınız. 1 açık iadeniz henüz bu karta ayarlı değil.",
      "AfterDefaultOther": "{card} artık iade kartınız. {count} açık iadeniz henüz bu karta ayarlı değil.",
      "AfterAddOne": "Bu kart varsayılanınız olur ve açık iadeniz bu karta taşınır.",
      "AfterAddOther": "Bu kart varsayılanınız olur ve {count} açık iadeniz bu karta taşınır.",
      "LineBodyOne": "1 açık iadeniz henüz {card} kartına ayarlı değil.",
      "LineBodyOther": "{count} açık iadeniz henüz {card} kartına ayarlı değil.",
      "Move": "Bu karta taşı",
      "Use": "Bu kartı kullan",
      "NotNow": "Şimdi değil",
      "Close": "Kapat",
      "DefaultFailed": "Bu kart varsayılan yapılamadı. Hiçbir şey değişmedi.",
      "PinFailed": "Açık iadeleriniz taşınamadı.",
      "PinFailedDefaultChanged": "Kart artık varsayılanınız, ancak açık iadeleriniz taşınamadı.",
      "MovedOne": "1 iade {card} kartına taşındı",
      "MovedOther": "{count} iade {card} kartına taşındı",
      "LineOne": "1 açık iade bu karta ayarlı değil",
      "LineOther": "{count} açık iade bu karta ayarlı değil",
      "LineAction": "Taşı"
    },
```

Run: `npm run init && npm run check:language-data`
Expected: both exit 0.

- [ ] **Step 2: Add `maskedTail`**

In `src/utils/card/card.ts`, directly after `lastFour`:

```ts
export function maskedTail(masked: string): string {
  return `•••• ${lastFour(masked)}`;
}
```

- [ ] **Step 3: Write the failing tests**

Create `src/screens/traveller/Cards/__tests__/MoveRefundsSheet.router.test.tsx`:

```tsx
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import type { MoveOutcome } from "../moveRefunds";
import type { PayoutToken } from "../useCards";

jest.mock("@/components/Ionicons", () => ({ Ionicons: () => null }));

jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({ t: (key: string) => key }),
}));

const mockToastError = jest.fn();
jest.mock("@/providers/ToastProvider", () => ({
  useToast: () => ({
    success: jest.fn(),
    error: (message: string) => mockToastError(message),
  }),
}));

// The real guard ignores a second press for 500 ms, which a retry test makes.
jest.mock("@/hooks/useDebouncedPress", () => ({
  useDebouncedPress: (onPress: () => void) => onPress,
}));

jest.mock("@/components/BottomSheet", () => {
  const react = require("react");
  return {
    BottomSheet: react.forwardRef(
      (props: { children: React.ReactNode }, _ref: unknown) => props.children,
    ),
  };
});

jest.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetView: require("react-native").View,
}));

import { MoveRefundsSheet, type MovePrompt } from "../_components/MoveRefundsSheet";

const KEY = "MobileApp.Cards.MoveRefunds";

const target: PayoutToken = {
  id: "card-4242",
  travellerId: "tr-1",
  type: "Card",
  isDefault: true,
  isLastUsed: false,
  maskedNumber: "4111110000004242",
  expiryMonth: 9,
  expiryYear: 2030,
  isExpired: false,
};

function renderSheet(
  prompt: MovePrompt,
  onConfirm: (t: PayoutToken) => Promise<MoveOutcome>,
) {
  const dismiss = jest.fn();
  const sheetRef = {
    current: { dismiss, present: jest.fn() },
  } as unknown as React.RefObject<BottomSheetModal>;
  render(
    <MoveRefundsSheet sheetRef={sheetRef} prompt={prompt} onConfirm={onConfirm} />,
  );
  return { dismiss };
}

beforeEach(() => {
  jest.clearAllMocks();
});

it("asks to move the refunds after a default change and closes once they moved", async () => {
  const onConfirm = jest.fn(
    async (_t: PayoutToken): Promise<MoveOutcome> => ({
      status: "moved",
      changedCount: 3,
    }),
  );
  const { dismiss } = renderSheet({ mode: "afterDefault", target, count: 3 }, onConfirm);

  expect(screen.getByText(`${KEY}.MoveTitle`)).toBeTruthy();
  expect(screen.getByText(`${KEY}.AfterDefaultOther`)).toBeTruthy();
  fireEvent.press(screen.getByText(`${KEY}.Move`));

  await waitFor(() => expect(dismiss).toHaveBeenCalled());
  expect(onConfirm).toHaveBeenCalledWith(target);
});

it("uses the singular copy for one refund", () => {
  renderSheet({ mode: "line", target, count: 1 }, jest.fn());
  expect(screen.getByText(`${KEY}.LineBodyOne`)).toBeTruthy();
});

it("offers the new card itself after an add", () => {
  renderSheet(
    { mode: "afterAdd", target: { ...target, isDefault: false }, count: 2 },
    jest.fn(),
  );
  expect(screen.getByText(`${KEY}.UseTitle`)).toBeTruthy();
  expect(screen.getByText(`${KEY}.AfterAddOther`)).toBeTruthy();
  expect(screen.getByText(`${KEY}.Use`)).toBeTruthy();
});

it("stays open when set-default fails and says nothing changed", async () => {
  const onConfirm = jest.fn(
    async (_t: PayoutToken): Promise<MoveOutcome> => ({ status: "defaultFailed" }),
  );
  const { dismiss } = renderSheet(
    { mode: "afterAdd", target: { ...target, isDefault: false }, count: 2 },
    onConfirm,
  );

  fireEvent.press(screen.getByText(`${KEY}.Use`));

  await waitFor(() =>
    expect(mockToastError).toHaveBeenCalledWith(`${KEY}.DefaultFailed`),
  );
  expect(dismiss).not.toHaveBeenCalled();
  expect(screen.getByText("MobileApp.Cards.Retry")).toBeTruthy();
});

it("retries a failed pin without setting the default again", async () => {
  const onConfirm = jest
    .fn(
      async (_t: PayoutToken): Promise<MoveOutcome> => ({
        status: "pinFailed",
        defaultChanged: false,
      }),
    )
    .mockResolvedValueOnce({ status: "pinFailed", defaultChanged: true });
  renderSheet(
    { mode: "afterAdd", target: { ...target, isDefault: false }, count: 2 },
    onConfirm,
  );

  fireEvent.press(screen.getByText(`${KEY}.Use`));
  await waitFor(() =>
    expect(mockToastError).toHaveBeenCalledWith(`${KEY}.PinFailedDefaultChanged`),
  );
  expect(screen.getByText(`${KEY}.Close`)).toBeTruthy();

  fireEvent.press(screen.getByText("MobileApp.Cards.Retry"));
  await waitFor(() => expect(mockToastError).toHaveBeenCalledTimes(2));
  expect(onConfirm.mock.calls[1][0]).toMatchObject({ id: target.id, isDefault: true });
  expect(mockToastError).toHaveBeenLastCalledWith(`${KEY}.PinFailedDefaultChanged`);
});
```

Create `src/screens/traveller/Cards/__tests__/OpenRefundsLine.router.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { OpenRefundsLine } from "../_components/OpenRefundsLine";

jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({ t: (key: string) => key }),
}));

it("says how many open refunds are elsewhere and offers to move them", () => {
  const onPress = jest.fn();
  render(<OpenRefundsLine count={3} onPress={onPress} />);

  expect(screen.getByText("MobileApp.Cards.MoveRefunds.LineOther")).toBeTruthy();
  fireEvent.press(screen.getByText("MobileApp.Cards.MoveRefunds.LineAction"));
  expect(onPress).toHaveBeenCalled();
});

it("uses the singular copy for one", () => {
  render(<OpenRefundsLine count={1} onPress={jest.fn()} />);
  expect(screen.getByText("MobileApp.Cards.MoveRefunds.LineOne")).toBeTruthy();
});
```

- [ ] **Step 4: Run them and see them fail**

Run: `npx jest src/screens/traveller/Cards/__tests__/MoveRefundsSheet.router.test.tsx src/screens/traveller/Cards/__tests__/OpenRefundsLine.router.test.tsx`
Expected: FAIL with `Cannot find module '../_components/MoveRefundsSheet'` (and `OpenRefundsLine`).

- [ ] **Step 5: Implement the sheet**

Create `src/screens/traveller/Cards/_components/MoveRefundsSheet.tsx`:

```tsx
import { BottomSheet } from "@/components/BottomSheet";
import { Button, Text } from "@/components/rnr";
import { useLocalization } from "@/providers/LocalizationProvider";
import { useToast } from "@/providers/ToastProvider";
import { maskedTail } from "@/utils/card/card";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { BottomSheetView } from "@gorhom/bottom-sheet";
import { useState } from "react";
import {
  defaultAlreadyChanged,
  nextFailure,
  type MoveFailure,
  type MoveOutcome,
} from "../moveRefunds";
import type { PayoutToken } from "../useCards";

export type MovePrompt = {
  mode: "afterDefault" | "afterAdd" | "line";
  target: PayoutToken;
  count: number;
};

const BODY = {
  afterDefault: [
    "MobileApp.Cards.MoveRefunds.AfterDefaultOne",
    "MobileApp.Cards.MoveRefunds.AfterDefaultOther",
  ],
  afterAdd: [
    "MobileApp.Cards.MoveRefunds.AfterAddOne",
    "MobileApp.Cards.MoveRefunds.AfterAddOther",
  ],
  line: [
    "MobileApp.Cards.MoveRefunds.LineBodyOne",
    "MobileApp.Cards.MoveRefunds.LineBodyOther",
  ],
} as const;

// Failures are toasts rather than inline text: the sheet sizes itself once from
// its content and would clip anything that appeared later.
export function MoveRefundsSheet({
  sheetRef,
  prompt,
  onConfirm,
}: {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  prompt: MovePrompt | null;
  onConfirm: (target: PayoutToken) => Promise<MoveOutcome>;
}) {
  const { t } = useLocalization();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<MoveFailure | null>(null);

  async function handleConfirm() {
    if (!prompt || busy) return;
    setBusy(true);
    try {
      const target = defaultAlreadyChanged(failure)
        ? { ...prompt.target, isDefault: true }
        : prompt.target;
      const outcome = await onConfirm(target);
      if (outcome.status === "moved") {
        sheetRef.current?.dismiss();
        return;
      }
      const next = nextFailure(failure, outcome);
      setFailure(next);
      toast.error(
        next.status === "defaultFailed"
          ? t("MobileApp.Cards.MoveRefunds.DefaultFailed")
          : next.defaultChanged
            ? t("MobileApp.Cards.MoveRefunds.PinFailedDefaultChanged")
            : t("MobileApp.Cards.MoveRefunds.PinFailed"),
      );
    } finally {
      setBusy(false);
    }
  }

  const mode = prompt?.mode ?? "line";
  const values = {
    count: prompt?.count ?? 0,
    card: prompt ? maskedTail(prompt.target.maskedNumber) : "",
  };
  const [one, other] = BODY[mode];

  return (
    <BottomSheet
      ref={sheetRef}
      busy={busy}
      onChange={(index) => {
        if (index === -1) setFailure(null);
      }}
    >
      <BottomSheetView className="p-4 gap-3">
        <Text className="text-xl font-bold">
          {mode === "afterAdd"
            ? t("MobileApp.Cards.MoveRefunds.UseTitle", values)
            : t("MobileApp.Cards.MoveRefunds.MoveTitle")}
        </Text>
        <Text className="text-muted">
          {t(values.count === 1 ? one : other, values)}
        </Text>
        <Button
          action={{
            onPress: handleConfirm,
            label: failure
              ? t("MobileApp.Cards.Retry")
              : mode === "afterAdd"
                ? t("MobileApp.Cards.MoveRefunds.Use")
                : t("MobileApp.Cards.MoveRefunds.Move"),
          }}
          isLoading={busy}
        />
        <Button
          variant="secondary"
          action={{
            onPress: () => sheetRef.current?.dismiss(),
            label: defaultAlreadyChanged(failure)
              ? t("MobileApp.Cards.MoveRefunds.Close")
              : t("MobileApp.Cards.MoveRefunds.NotNow"),
          }}
          disabled={busy}
        />
      </BottomSheetView>
    </BottomSheet>
  );
}
```

- [ ] **Step 6: Implement the line**

Create `src/screens/traveller/Cards/_components/OpenRefundsLine.tsx`. It mirrors the stale-list warning banner already in `CardsScreen.tsx`:

```tsx
import { Text } from "@/components/rnr";
import { useLocalization } from "@/providers/LocalizationProvider";
import { Pressable, View } from "react-native";

export function OpenRefundsLine({
  count,
  disabled,
  onPress,
}: {
  count: number;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { t } = useLocalization();

  return (
    <View className="flex-row items-center justify-between gap-3 rounded-md border border-warning/40 bg-warning-surface px-4 py-3">
      <Text className="flex-1 text-sm text-warning">
        {t(
          count === 1
            ? "MobileApp.Cards.MoveRefunds.LineOne"
            : "MobileApp.Cards.MoveRefunds.LineOther",
          { count },
        )}
      </Text>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        hitSlop={8}
        accessibilityRole="button"
      >
        <Text className="text-sm font-semibold text-warning">
          {t("MobileApp.Cards.MoveRefunds.LineAction")}
        </Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 7: Run the tests and the type check**

Run: `npx jest src/screens/traveller/Cards/__tests__/MoveRefundsSheet.router.test.tsx src/screens/traveller/Cards/__tests__/OpenRefundsLine.router.test.tsx && npm run typecheck`
Expected: PASS, 7 tests, and `tsc` exits 0. A TS2345 on a `MobileApp.Cards.MoveRefunds.*` key means Step 1's `npm run init` did not run.

- [ ] **Step 8: Commit**

```bash
git add src/utils/card/card.ts src/localization/resources/en-US.json src/localization/resources/tr-TR.json src/screens/traveller/Cards/_components/MoveRefundsSheet.tsx src/screens/traveller/Cards/_components/OpenRefundsLine.tsx src/screens/traveller/Cards/__tests__/MoveRefundsSheet.router.test.tsx src/screens/traveller/Cards/__tests__/OpenRefundsLine.router.test.tsx
git commit -F - <<'EOF'
feat(cards): prompt to move open refunds, and a line when they are elsewhere

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: The four-case delete sheet

**Files:**
- Modify: `src/localization/resources/en-US.json`, `src/localization/resources/tr-TR.json` (inside `"Cards"`)
- Modify (full rewrite): `src/screens/traveller/Cards/_components/DeleteTokenSheet.tsx`
- Test: `src/screens/traveller/Cards/__tests__/DeleteTokenSheet.router.test.tsx`

**Interfaces:**
- Consumes: `DeletePlan` (Task 1); `DeleteOutcome`, `DeleteFailure`, `defaultAlreadyChanged`, `nextFailure` (Task 2); `maskedTail` (Task 3); `TokenList` from `src/screens/shared/Tags/Tag/_components/refund/RefundPayoutRows.tsx`.
- Produces: `DeleteTokenSheet({ sheetRef, token, plan, onConfirm: (id) => Promise<void>, onMoveAndDelete: (id, target) => Promise<DeleteOutcome>, onAddCard: () => void, onClosed?: () => void })`.

- [ ] **Step 1: Add the copy**

`en-US.json`, inside `"Cards"`, after the `"MoveRefunds"` block:

```json
    "DeleteMove": {
      "MoveToHeroOne": "1 open refund is set to this card. Deleting it moves all your open refunds to {card}.",
      "MoveToHeroOther": "{count} open refunds are set to this card. Deleting it moves all your open refunds to {card}.",
      "ChooseOne": "1 open refund is set to this card. Choose where your open refunds go instead.",
      "ChooseOther": "{count} open refunds are set to this card. Choose where your open refunds go instead.",
      "NoTargetOne": "1 open refund is set to this card. It will have no card to pay to until you add one.",
      "NoTargetOther": "{count} open refunds are set to this card. They'll have no card to pay to until you add one.",
      "DeleteAnyway": "Delete anyway",
      "MoveFailed": "Couldn't move your open refunds, so the card wasn't deleted.",
      "MoveFailedDefaultChanged": "Your default changed, but your open refunds didn't move, so the card wasn't deleted.",
      "DeleteFailed": "Your open refunds moved, but the card couldn't be deleted.",
      "MovedAndDeletedOne": "Removed. 1 refund moved to {card}.",
      "MovedAndDeletedOther": "Removed. {count} refunds moved to {card}."
    },
```

`tr-TR.json`, in the same place:

```json
    "DeleteMove": {
      "MoveToHeroOne": "1 açık iadeniz bu karta ayarlı. Kartı silmek tüm açık iadelerinizi {card} kartına taşır.",
      "MoveToHeroOther": "{count} açık iadeniz bu karta ayarlı. Kartı silmek tüm açık iadelerinizi {card} kartına taşır.",
      "ChooseOne": "1 açık iadeniz bu karta ayarlı. Açık iadelerinizin nereye gideceğini seçin.",
      "ChooseOther": "{count} açık iadeniz bu karta ayarlı. Açık iadelerinizin nereye gideceğini seçin.",
      "NoTargetOne": "1 açık iadeniz bu karta ayarlı. Yeni bir kart ekleyene kadar ödenecek bir kartı olmayacak.",
      "NoTargetOther": "{count} açık iadeniz bu karta ayarlı. Yeni bir kart ekleyene kadar ödenecekleri bir kart olmayacak.",
      "DeleteAnyway": "Yine de sil",
      "MoveFailed": "Açık iadeleriniz taşınamadı, bu yüzden kart silinmedi.",
      "MoveFailedDefaultChanged": "Varsayılan kartınız değişti, ancak açık iadeleriniz taşınamadı, bu yüzden kart silinmedi.",
      "DeleteFailed": "Açık iadeleriniz taşındı, ancak kart silinemedi.",
      "MovedAndDeletedOne": "Kaldırıldı. 1 iade {card} kartına taşındı.",
      "MovedAndDeletedOther": "Kaldırıldı. {count} iade {card} kartına taşındı."
    },
```

Run: `npm run init && npm run check:language-data`
Expected: both exit 0.

- [ ] **Step 2: Write the failing test**

Create `src/screens/traveller/Cards/__tests__/DeleteTokenSheet.router.test.tsx`:

```tsx
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import type { DeleteOutcome } from "../moveRefunds";
import type { DeletePlan } from "../openRefunds";
import type { PayoutToken } from "../useCards";

jest.mock("@/components/Ionicons", () => ({ Ionicons: () => null }));

jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({ t: (key: string) => key }),
}));

const mockToastError = jest.fn();
jest.mock("@/providers/ToastProvider", () => ({
  useToast: () => ({
    success: jest.fn(),
    error: (message: string) => mockToastError(message),
  }),
}));

jest.mock("@/hooks/useDebouncedPress", () => ({
  useDebouncedPress: (onPress: () => void) => onPress,
}));

jest.mock("@/components/BottomSheet", () => {
  const react = require("react");
  return {
    BottomSheet: react.forwardRef(
      (props: { children: React.ReactNode }, _ref: unknown) => props.children,
    ),
  };
});

jest.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetView: require("react-native").View,
}));

import { DeleteTokenSheet } from "../_components/DeleteTokenSheet";

const card = (id: string, over: Partial<PayoutToken> = {}): PayoutToken => ({
  id,
  travellerId: "tr-1",
  type: "Card",
  isDefault: false,
  isLastUsed: false,
  maskedNumber: `411111000000${id.slice(-4)}`,
  expiryMonth: 9,
  expiryYear: 2030,
  isExpired: false,
  ...over,
});

const hero = card("card-1111", { isDefault: true });
const doomed = card("card-2222");
const third = card("card-3333");

function renderSheet(
  plan: DeletePlan,
  over: {
    onMoveAndDelete?: (id: string, target: PayoutToken) => Promise<DeleteOutcome>;
  } = {},
) {
  const dismiss = jest.fn();
  const sheetRef = {
    current: { dismiss, present: jest.fn() },
  } as unknown as React.RefObject<BottomSheetModal>;
  const onMoveAndDelete = jest.fn(
    async (_id: string, _target: PayoutToken): Promise<DeleteOutcome> => ({
      status: "deleted",
      changedCount: 2,
    }),
  );
  if (over.onMoveAndDelete) onMoveAndDelete.mockImplementation(over.onMoveAndDelete);
  const props = {
    onConfirm: jest.fn(async (_id: string) => {}),
    onMoveAndDelete,
    onAddCard: jest.fn(),
  };
  render(
    <DeleteTokenSheet sheetRef={sheetRef} token={doomed} plan={plan} {...props} />,
  );
  return { ...props, dismiss };
}

beforeEach(() => {
  jest.clearAllMocks();
});

it("deletes plainly when no open refund uses the card", async () => {
  const { onConfirm, onMoveAndDelete, dismiss } = renderSheet({ kind: "plain" });

  expect(screen.getByText("MobileApp.Cards.DeleteDescription")).toBeTruthy();
  fireEvent.press(screen.getByText("MobileApp.Cards.Delete"));

  await waitFor(() => expect(dismiss).toHaveBeenCalled());
  expect(onConfirm).toHaveBeenCalledWith("card-2222");
  expect(onMoveAndDelete).not.toHaveBeenCalled();
});

it("moves the refunds onto the hero before deleting", async () => {
  const { onConfirm, onMoveAndDelete, dismiss } = renderSheet({
    kind: "moveToHero",
    count: 2,
    hero,
  });

  expect(screen.getByText("MobileApp.Cards.DeleteMove.MoveToHeroOther")).toBeTruthy();
  fireEvent.press(screen.getByText("MobileApp.Cards.Delete"));

  await waitFor(() => expect(dismiss).toHaveBeenCalled());
  expect(onMoveAndDelete).toHaveBeenCalledWith("card-2222", hero);
  expect(onConfirm).not.toHaveBeenCalled();
});

it("moves the refunds to the card the traveller picks", async () => {
  const { onMoveAndDelete } = renderSheet({
    kind: "choose",
    count: 1,
    choices: [hero, third],
    preselected: hero,
  });

  expect(screen.getByText("MobileApp.Cards.DeleteMove.ChooseOne")).toBeTruthy();
  fireEvent.press(screen.getAllByRole("radio")[1]);
  fireEvent.press(screen.getByText("MobileApp.Cards.Delete"));

  await waitFor(() =>
    expect(onMoveAndDelete).toHaveBeenCalledWith("card-2222", third),
  );
});

it("keeps the card when its refunds could not be moved", async () => {
  const { onConfirm, dismiss } = renderSheet(
    { kind: "moveToHero", count: 2, hero },
    {
      onMoveAndDelete: async () => ({ status: "pinFailed", defaultChanged: false }),
    },
  );

  fireEvent.press(screen.getByText("MobileApp.Cards.Delete"));

  await waitFor(() =>
    expect(mockToastError).toHaveBeenCalledWith(
      "MobileApp.Cards.DeleteMove.MoveFailed",
    ),
  );
  expect(dismiss).not.toHaveBeenCalled();
  expect(onConfirm).not.toHaveBeenCalled();
  expect(screen.getByText("MobileApp.Cards.Retry")).toBeTruthy();
});

it("deletes the only card without pinning when the traveller says so", async () => {
  const { onConfirm, onMoveAndDelete, onAddCard } = renderSheet({
    kind: "noTarget",
    count: 1,
  });

  expect(screen.getByText("MobileApp.Cards.DeleteMove.NoTargetOne")).toBeTruthy();
  fireEvent.press(screen.getByText("MobileApp.Cards.AddCard"));
  expect(onAddCard).toHaveBeenCalled();

  fireEvent.press(screen.getByText("MobileApp.Cards.DeleteMove.DeleteAnyway"));
  await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("card-2222"));
  expect(onMoveAndDelete).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run it and see it fail**

Run: `npx jest src/screens/traveller/Cards/__tests__/DeleteTokenSheet.router.test.tsx`
Expected: FAIL. The current sheet ignores `plan`, so `MoveToHeroOther` is not found and `onMoveAndDelete` is never called.

- [ ] **Step 4: Implement**

Replace `src/screens/traveller/Cards/_components/DeleteTokenSheet.tsx` with:

```tsx
import { BottomSheet } from "@/components/BottomSheet";
import { Button, Text } from "@/components/rnr";
import { useLocalization } from "@/providers/LocalizationProvider";
import { useToast } from "@/providers/ToastProvider";
import { maskedTail } from "@/utils/card/card";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { BottomSheetView } from "@gorhom/bottom-sheet";
import { useState } from "react";
import { View } from "react-native";
import { TokenList } from "../../../shared/Tags/Tag/_components/refund/RefundPayoutRows";
import {
  defaultAlreadyChanged,
  nextFailure,
  type DeleteFailure,
  type DeleteOutcome,
} from "../moveRefunds";
import type { DeletePlan } from "../openRefunds";
import type { PayoutToken } from "../useCards";

/** Confirms removal of a saved payout token. The delete is a soft delete. */
export function DeleteTokenSheet({
  sheetRef,
  token,
  plan,
  onConfirm,
  onMoveAndDelete,
  onAddCard,
  onClosed,
}: {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  token: PayoutToken | null;
  plan: DeletePlan;
  onConfirm: (id: string) => Promise<void>;
  onMoveAndDelete: (id: string, target: PayoutToken) => Promise<DeleteOutcome>;
  onAddCard: () => void;
  onClosed?: () => void;
}) {
  const { t } = useLocalization();
  const toast = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [failure, setFailure] = useState<DeleteFailure | null>(null);

  const target =
    plan.kind === "moveToHero"
      ? plan.hero
      : plan.kind === "choose"
        ? (plan.choices.find((card) => card.id === pickedId) ?? plan.preselected)
        : null;

  async function handleDelete() {
    if (!token) return;
    setIsDeleting(true);
    try {
      await onConfirm(token.id);
      sheetRef.current?.dismiss();
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleMoveAndDelete() {
    if (!token || !target) return;
    setIsDeleting(true);
    try {
      const outcome = await onMoveAndDelete(
        token.id,
        defaultAlreadyChanged(failure) ? { ...target, isDefault: true } : target,
      );
      if (outcome.status === "deleted") {
        sheetRef.current?.dismiss();
        return;
      }
      const next = nextFailure(failure, outcome);
      setFailure(next);
      toast.error(
        next.status === "deleteFailed"
          ? t("MobileApp.Cards.DeleteMove.DeleteFailed")
          : defaultAlreadyChanged(next)
            ? t("MobileApp.Cards.DeleteMove.MoveFailedDefaultChanged")
            : t("MobileApp.Cards.DeleteMove.MoveFailed"),
      );
    } finally {
      setIsDeleting(false);
    }
  }

  const count = plan.kind === "plain" ? 0 : plan.count;
  const one = count === 1;
  const description =
    plan.kind === "moveToHero"
      ? t(
          one
            ? "MobileApp.Cards.DeleteMove.MoveToHeroOne"
            : "MobileApp.Cards.DeleteMove.MoveToHeroOther",
          { count, card: maskedTail(plan.hero.maskedNumber) },
        )
      : plan.kind === "choose"
        ? t(
            one
              ? "MobileApp.Cards.DeleteMove.ChooseOne"
              : "MobileApp.Cards.DeleteMove.ChooseOther",
            { count },
          )
        : plan.kind === "noTarget"
          ? t(
              one
                ? "MobileApp.Cards.DeleteMove.NoTargetOne"
                : "MobileApp.Cards.DeleteMove.NoTargetOther",
              { count },
            )
          : t("MobileApp.Cards.DeleteDescription");

  return (
    <BottomSheet
      ref={sheetRef}
      busy={isDeleting}
      onChange={(index) => {
        if (index === -1) {
          setPickedId(null);
          setFailure(null);
          onClosed?.();
        }
      }}
    >
      <BottomSheetView className="p-4 gap-3">
        <Text className="text-xl font-bold">
          {t("MobileApp.Cards.DeleteTitle")}
        </Text>
        <Text className="text-muted">{description}</Text>

        {/* Every choice up front: the sheet cannot grow after it opens. */}
        {plan.kind === "choose" && (
          <View className="-mx-4 border-t border-b border-input">
            <TokenList
              kind="savedCard"
              tokens={plan.choices}
              selectedKey={target ? `savedCard:${target.id}` : null}
              disabled={isDeleting}
              onSelect={(card) => {
                setPickedId(card.id);
                setFailure(null);
              }}
              expanded
              onExpand={() => {}}
              t={t}
            />
          </View>
        )}

        {plan.kind === "noTarget" ? (
          <>
            <Button
              action={{ onPress: onAddCard, label: t("MobileApp.Cards.AddCard") }}
              disabled={isDeleting}
            />
            <Button
              variant="secondary"
              action={{
                onPress: handleDelete,
                label: t("MobileApp.Cards.DeleteMove.DeleteAnyway"),
              }}
              isLoading={isDeleting}
            />
          </>
        ) : (
          <Button
            action={{
              onPress: target ? handleMoveAndDelete : handleDelete,
              label: failure ? t("MobileApp.Cards.Retry") : t("MobileApp.Cards.Delete"),
            }}
            isLoading={isDeleting}
          />
        )}

        <Button
          variant={plan.kind === "noTarget" ? "ghost" : "secondary"}
          action={{
            onPress: () => sheetRef.current?.dismiss(),
            label: t("MobileApp.Cards.Cancel"),
          }}
          disabled={isDeleting}
        />
      </BottomSheetView>
    </BottomSheet>
  );
}
```

- [ ] **Step 5: Run the test and see it pass**

Run: `npx jest src/screens/traveller/Cards/__tests__/DeleteTokenSheet.router.test.tsx`
Expected: PASS, 5 tests.

`npm run typecheck` will now fail in `CardsScreen.tsx` because the new props are missing. That is expected here and is fixed in Task 5. Do not commit until you confirm the only errors are in `CardsScreen.tsx`.

- [ ] **Step 6: Commit**

```bash
git add src/localization/resources/en-US.json src/localization/resources/tr-TR.json src/screens/traveller/Cards/_components/DeleteTokenSheet.tsx src/screens/traveller/Cards/__tests__/DeleteTokenSheet.router.test.tsx
git commit -F - <<'EOF'
feat(cards): delete confirm moves a card's open refunds first

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: Wire My Cards

**Files:**
- Create: `src/screens/traveller/Cards/useOpenRefunds.ts`
- Modify: `src/screens/traveller/Cards/useCards.ts`
- Modify: `src/screens/traveller/Cards/_components/AddCardSheet.tsx:36-72`
- Modify: `src/screens/traveller/Cards/CardsScreen.tsx`
- Test: `src/screens/traveller/Cards/__tests__/CardsScreen.router.test.tsx` (extend)

**Interfaces:**
- Consumes: everything from Tasks 1–4; `getTags` from `@/actions/TagService/actions`; `postTagTravellerPayoutToken` from `@/actions/TagService/post`.
- Produces:
  - `useOpenRefunds(): { refunds: OpenRefunds; refresh: () => Promise<unknown> }`
  - `useCards()` gains `setDefault(id, { quiet? }) => Promise<boolean>`, `moveRefundsTo(target) => Promise<MoveOutcome>` and `removeMovingRefunds(id, target) => Promise<DeleteOutcome>`
  - `AddCardSheet` gains `onClosed?: () => void`

- [ ] **Step 1: Extend the screen test's mocks**

In `src/screens/traveller/Cards/__tests__/CardsScreen.router.test.tsx`:

(a) Change the testing-library import to `import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";`.

(b) Replace the `@/providers/ToastProvider` mock with:

```tsx
const mockToastSuccess = jest.fn();
jest.mock("@/providers/ToastProvider", () => ({
  useToast: () => ({
    success: (message: string) => mockToastSuccess(message),
    error: jest.fn(),
  }),
}));
```

(c) After the `@/actions/RefundService/post` mock, add:

```tsx
const mockGetTags = jest.fn();
const mockPin = jest.fn();
jest.mock("@/actions/TagService/actions", () => ({
  getTags: (params: unknown) => mockGetTags(params),
}));
jest.mock("@/actions/TagService/post", () => ({
  postTagTravellerPayoutToken: (body: unknown) => mockPin(body),
}));
```

(d) Replace the four sheet mocks (`AddCardSheet` … `DeleteTokenSheet`) with prop-capturing ones:

```tsx
type SheetProps = Record<string, any>;
let mockAddSheet: SheetProps = {};
let mockDeleteSheet: SheetProps = {};
let mockMoveSheet: SheetProps = {};
jest.mock("../_components/AddCardSheet", () => ({
  AddCardSheet: (props: SheetProps) => {
    mockAddSheet = props;
    return null;
  },
}));
jest.mock("../_components/AddBankSheet", () => ({ AddBankSheet: () => null }));
jest.mock("../_components/EditNicknameSheet", () => ({
  EditNicknameSheet: () => null,
}));
jest.mock("../_components/DeleteTokenSheet", () => ({
  DeleteTokenSheet: (props: SheetProps) => {
    mockDeleteSheet = props;
    return null;
  },
}));
jest.mock("../_components/MoveRefundsSheet", () => ({
  MoveRefundsSheet: (props: SheetProps) => {
    mockMoveSheet = props;
    return null;
  },
}));
```

(e) Extend `beforeEach`:

```tsx
beforeEach(() => {
  jest.clearAllMocks();
  mockGetTags.mockResolvedValue({ items: [] });
  mockAddSheet = {};
  mockDeleteSheet = {};
  mockMoveSheet = {};
});
```

(f) Add, after `resolveWith`:

```tsx
function tagsOn(...pins: (string | null)[]) {
  mockGetTags.mockResolvedValue({
    items: pins.map((payoutTokenId, i) => ({
      id: `tag-${i}`,
      status: "Issued",
      payoutTokenId,
    })),
  });
}
```

- [ ] **Step 2: Write the failing tests**

Append to the same file:

```tsx
describe("open refunds", () => {
  it("asks to move open refunds after set-default when some are elsewhere", async () => {
    resolveWith([card("1111", { isDefault: true }), card("2222")]);
    tagsOn("card-1111", "card-1111", null);

    renderScreen();

    expect(
      await screen.findByText("MobileApp.Cards.MoveRefunds.LineOne"),
    ).toBeTruthy();
    expect(mockGetTags).toHaveBeenCalledWith({
      status: [
        "Open",
        "PreIssued",
        "Issued",
        "WaitingGoodsValidation",
        "WaitingStampValidation",
        "ExportValidated",
      ],
      maxResultCount: 999,
    });

    fireEvent.press(screen.getByLabelText("MobileApp.Cards.SetDefault"));

    await waitFor(() =>
      expect(mockMoveSheet.prompt).toMatchObject({
        mode: "afterDefault",
        count: 3,
        target: { id: "card-2222", isDefault: true },
      }),
    );
    expect(mockToastSuccess).not.toHaveBeenCalledWith(
      "MobileApp.Cards.SetDefaultSuccess",
    );
  });

  it("changes the default as before when the tag list failed to load", async () => {
    resolveWith([card("1111", { isDefault: true }), card("2222")]);
    mockGetTags.mockRejectedValue(new Error("down"));

    renderScreen();
    await screen.findAllByText("•••• 1111");
    await act(async () => {});

    fireEvent.press(screen.getByLabelText("MobileApp.Cards.SetDefault"));

    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith(
        "MobileApp.Cards.SetDefaultSuccess",
      ),
    );
    expect(mockMoveSheet.prompt).toBeNull();
    expect(screen.queryByText("MobileApp.Cards.MoveRefunds.LineAction")).toBeNull();
  });

  it("changes the default as before while the tag list is still loading", async () => {
    resolveWith([card("1111", { isDefault: true }), card("2222")]);
    mockGetTags.mockReturnValue(new Promise(() => {}));

    renderScreen();
    await screen.findAllByText("•••• 1111");

    fireEvent.press(screen.getByLabelText("MobileApp.Cards.SetDefault"));

    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith(
        "MobileApp.Cards.SetDefaultSuccess",
      ),
    );
    expect(mockMoveSheet.prompt).toBeNull();
  });

  it("offers the line's move onto the hero card", async () => {
    resolveWith([card("1111", { isDefault: true }), card("2222")]);
    tagsOn("card-2222", "card-2222");

    renderScreen();
    fireEvent.press(
      await screen.findByText("MobileApp.Cards.MoveRefunds.LineAction"),
    );

    expect(mockMoveSheet.prompt).toMatchObject({
      mode: "line",
      count: 2,
      target: { id: "card-1111" },
    });
  });

  it("hides the line's move while the hero card is expired", async () => {
    resolveWith([
      card("1111", { isDefault: true, isExpired: true }),
      card("2222"),
    ]);
    tagsOn("card-2222");

    renderScreen();
    await screen.findAllByText("•••• 1111");
    await act(async () => {});

    expect(mockGetTags).toHaveBeenCalled();
    expect(screen.queryByText("MobileApp.Cards.MoveRefunds.LineAction")).toBeNull();
  });

  it("asks once the add sheet has closed, for a card open refunds are not on", async () => {
    resolveWith([card("1111", { isDefault: true })]);
    tagsOn("card-1111", null);

    renderScreen();
    await screen.findByText("MobileApp.Cards.MoveRefunds.LineOne");

    act(() => mockAddSheet.onAdded(card("5555")));
    expect(mockMoveSheet.prompt).toBeNull();

    act(() => mockAddSheet.onClosed());
    expect(mockMoveSheet.prompt).toMatchObject({
      mode: "afterAdd",
      count: 2,
      target: { id: "card-5555" },
    });
  });

  it("asks nothing after re-adding a card that already holds every open refund", async () => {
    resolveWith([card("1111", { isDefault: true }), card("2222")]);
    tagsOn("card-2222", "card-2222");

    renderScreen();
    await screen.findByText("MobileApp.Cards.MoveRefunds.LineOther");

    act(() => mockAddSheet.onAdded(card("2222")));
    act(() => mockAddSheet.onClosed());

    expect(mockMoveSheet.prompt).toBeNull();
  });

  it("plans the delete from the open refunds on that card", async () => {
    resolveWith([card("1111", { isDefault: true }), card("2222")]);
    tagsOn("card-2222", "card-2222");

    renderScreen();
    await screen.findByText("MobileApp.Cards.MoveRefunds.LineOther");
    fireEvent.press(screen.getAllByLabelText("MobileApp.Cards.Delete")[1]);

    expect(mockDeleteSheet.plan).toMatchObject({
      kind: "moveToHero",
      count: 2,
      hero: { id: "card-1111" },
    });
  });

  it("pins through the prompt and reloads the open refunds", async () => {
    resolveWith([card("1111", { isDefault: true }), card("2222")]);
    tagsOn("card-2222");
    mockPin.mockResolvedValue({
      tagIds: ["tag-0"],
      payoutTokenId: "card-1111",
      changedCount: 1,
    });

    renderScreen();
    fireEvent.press(
      await screen.findByText("MobileApp.Cards.MoveRefunds.LineAction"),
    );

    let outcome: unknown;
    await act(async () => {
      outcome = await mockMoveSheet.onConfirm(mockMoveSheet.prompt.target);
    });

    expect(outcome).toEqual({ status: "moved", changedCount: 1 });
    expect(mockPin).toHaveBeenCalledWith({ payoutTokenId: "card-1111" });
    expect(mockToastSuccess).toHaveBeenCalledWith(
      "MobileApp.Cards.MoveRefunds.MovedOne",
    );
    expect(mockGetTags).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 3: Run them and see them fail**

Run: `npx jest src/screens/traveller/Cards/__tests__/CardsScreen.router.test.tsx`
Expected: the new `open refunds` tests FAIL: no line text, `prompt` undefined. The existing tests still pass.

- [ ] **Step 4: Create `useOpenRefunds`**

Create `src/screens/traveller/Cards/useOpenRefunds.ts`:

```ts
import { getTags } from "@/actions/TagService/actions";
import useAsyncFetch from "@/hooks/useAsyncFetch";
import { useCallback, useMemo } from "react";
import {
  NO_OPEN_REFUNDS,
  OPEN_REFUND_STATUSES,
  openRefunds,
  type OpenRefunds,
} from "./openRefunds";

const fetchOpenTags = () =>
  getTags({ status: OPEN_REFUND_STATUSES, maxResultCount: 999 });

// Enrichment only: while the list loads, or when it fails, the screen behaves
// as if there were no open refunds.
export function useOpenRefunds(): {
  refunds: OpenRefunds;
  refresh: () => Promise<unknown>;
} {
  const { data, error, execute } = useAsyncFetch(fetchOpenTags);
  const refunds = useMemo(
    () => (data && !error ? openRefunds(data.items ?? []) : NO_OPEN_REFUNDS),
    [data, error],
  );
  const refresh = useCallback(() => execute(), [execute]);
  return { refunds, refresh };
}
```

- [ ] **Step 5: Extend `useCards`**

In `src/screens/traveller/Cards/useCards.ts`:

(a) Add imports:

```ts
import { postTagTravellerPayoutToken } from "@/actions/TagService/post";
import { maskedTail } from "@/utils/card/card";
import {
  deleteMovingRefunds,
  moveOpenRefunds,
  type DeleteOutcome,
  type MoveCalls,
  type MoveOutcome,
} from "./moveRefunds";
```

(b) Below the `PayoutToken` type export, add:

```ts
const moveCalls: MoveCalls = {
  setDefault: (id) => postTravellerCardSetDefault(id),
  pin: (id) => postTagTravellerPayoutToken({ payoutTokenId: id }),
  remove: (id) => deleteTravellerCard(id),
  onFailure: (step, error) =>
    logger.error(`Moving open refunds failed at ${step}`, error),
};
```

(c) In `runMutation`, rename the third parameter to `successMessage: string | null` and change `toast.success(successKey);` to `if (successMessage) toast.success(successMessage);`.

(d) Replace `setDefault` with:

```ts
  const setDefault = useCallback(
    (id: string, options: { quiet?: boolean } = {}) =>
      runMutation(
        id,
        () => postTravellerCardSetDefault(id),
        options.quiet ? null : t("MobileApp.Cards.SetDefaultSuccess"),
      ),
    [runMutation, t],
  );
```

(e) After `rename`, add:

```ts
  const moveRefundsTo = useCallback(
    async (target: PayoutToken): Promise<MoveOutcome> => {
      setPendingId(target.id);
      try {
        const outcome = await moveOpenRefunds(target, moveCalls);
        if (outcome.status === "moved" && outcome.changedCount > 0) {
          toast.success(
            t(
              outcome.changedCount === 1
                ? "MobileApp.Cards.MoveRefunds.MovedOne"
                : "MobileApp.Cards.MoveRefunds.MovedOther",
              {
                count: outcome.changedCount,
                card: maskedTail(target.maskedNumber),
              },
            ),
          );
        }
        return outcome;
      } finally {
        setPendingId(null);
        void execute();
      }
    },
    [execute, t, toast],
  );

  const removeMovingRefunds = useCallback(
    async (id: string, target: PayoutToken): Promise<DeleteOutcome> => {
      setPendingId(id);
      try {
        const outcome = await deleteMovingRefunds(id, target, moveCalls);
        if (outcome.status === "deleted") {
          const { changedCount } = outcome;
          toast.success(
            changedCount > 0
              ? t(
                  changedCount === 1
                    ? "MobileApp.Cards.DeleteMove.MovedAndDeletedOne"
                    : "MobileApp.Cards.DeleteMove.MovedAndDeletedOther",
                  { count: changedCount, card: maskedTail(target.maskedNumber) },
                )
              : t("MobileApp.Cards.DeleteSuccess"),
          );
        }
        return outcome;
      } finally {
        setPendingId(null);
        void execute();
      }
    },
    [execute, t, toast],
  );
```

(f) Add `moveRefundsTo` and `removeMovingRefunds` to the returned object.

- [ ] **Step 6: Give `AddCardSheet` an `onClosed`**

In `src/screens/traveller/Cards/_components/AddCardSheet.tsx`, add `onClosed` to the props (destructure it, and type it `onClosed?: () => void;`). Then extend the existing `onChange` handler:

```tsx
      onChange={(index) => {
        if (index === -1) {
          attemptRef.current += 1;
          setSessionKey((k) => k + 1);
          onClosed?.();
        }
      }}
```

- [ ] **Step 7: Wire `CardsScreen`**

In `src/screens/traveller/Cards/CardsScreen.tsx`:

(a) Add imports:

```tsx
import { MoveRefundsSheet, type MovePrompt } from "./_components/MoveRefundsSheet";
import { OpenRefundsLine } from "./_components/OpenRefundsLine";
import { deletePlan, notOnCard, type DeletePlan } from "./openRefunds";
import { useOpenRefunds } from "./useOpenRefunds";
```

(b) Add `moveRefundsTo` and `removeMovingRefunds` to the `useCards()` destructuring.

(c) After `const [activeToken, setActiveToken] = useState<PayoutToken | null>(null);`, add:

```tsx
  const { refunds, refresh: refreshRefunds } = useOpenRefunds();
  const moveRef = useRef<BottomSheetModal>(null);
  const [movePrompt, setMovePrompt] = useState<MovePrompt | null>(null);
  const [activePlan, setActivePlan] = useState<DeletePlan>({ kind: "plain" });
  // A follow-up sheet opens from the previous sheet's close: presenting over a
  // sheet that is still dismissing minimizes one of them.
  const nextSheetRef = useRef<(() => void) | null>(null);
```

(d) Replace `openDelete` with:

```tsx
  function openDelete(token: PayoutToken) {
    setActiveToken(token);
    setActivePlan(deletePlan(token, cards, heroCard, refunds));
    deleteRef.current?.present();
  }
```

(e) After `const openAddCard = () => addCardRef.current?.present();`, add:

```tsx
  function presentMove(prompt: MovePrompt) {
    setMovePrompt(prompt);
    moveRef.current?.present();
  }

  function presentNextSheet() {
    const next = nextSheetRef.current;
    nextSheetRef.current = null;
    next?.();
  }

  async function handleSetDefault(card: PayoutToken) {
    const count = notOnCard(refunds, card.id);
    const ok = await setDefault(card.id, { quiet: count > 0 });
    if (ok && count > 0) {
      presentMove({
        mode: "afterDefault",
        target: { ...card, isDefault: true },
        count,
      });
    }
  }

  function handleAdded(card?: PayoutToken) {
    void refresh();
    if (!card?.id) return;
    const count = notOnCard(refunds, card.id);
    if (count > 0) {
      nextSheetRef.current = () =>
        presentMove({ mode: "afterAdd", target: card, count });
    }
  }

  function handleAddFromDelete() {
    nextSheetRef.current = openAddCard;
    deleteRef.current?.dismiss();
  }

  async function handleMove(target: PayoutToken) {
    const outcome = await moveRefundsTo(target);
    if (outcome.status === "moved") void refreshRefunds();
    return outcome;
  }

  async function handleMoveAndDelete(id: string, target: PayoutToken) {
    const outcome = await removeMovingRefunds(id, target);
    if (outcome.status === "deleted" || outcome.status === "deleteFailed") {
      void refreshRefunds();
    }
    return outcome;
  }

  const lineCount =
    heroCard && !heroCard.isExpired ? notOnCard(refunds, heroCard.id) : 0;
```

(f) In the `tiles` map, change `onSelect={() => setDefault(card.id)}` to `onSelect={() => void handleSetDefault(card)}`.

(g) Wrap the hero `PayoutDestination` so the line sits under it. Replace the `heroCard ? ( <PayoutDestination … /> ) : (` branch opening with:

```tsx
          {heroCard ? (
            <View className="gap-3">
              <PayoutDestination
                number={heroCard.maskedNumber}
                holderName={heroCard.holderName ?? undefined}
                expiry={formatExpiryFromParts(
                  heroCard.expiryMonth,
                  heroCard.expiryYear,
                )}
                nickname={heroCard.nickname ?? undefined}
                isExpired={heroCard.isExpired}
                labels={{
                  kicker: t("MobileApp.Cards.RefundsArriveOn"),
                  holderNameLabel: t("MobileApp.Cards.HolderNameLabel"),
                  expiryLabel: t("MobileApp.Cards.ExpiryLabel"),
                }}
              />
              {lineCount > 0 && (
                <OpenRefundsLine
                  count={lineCount}
                  disabled={pendingId !== null}
                  onPress={() =>
                    presentMove({ mode: "line", target: heroCard, count: lineCount })
                  }
                />
              )}
            </View>
          ) : (
```

(h) Replace the three sheet elements at the bottom with:

```tsx
      <AddCardSheet
        sheetRef={addCardRef}
        onAdded={handleAdded}
        onClosed={presentNextSheet}
      />
      <EditNicknameSheet
        sheetRef={renameRef}
        token={activeToken}
        onSubmit={rename}
      />
      <DeleteTokenSheet
        sheetRef={deleteRef}
        token={activeToken}
        plan={activePlan}
        onConfirm={remove}
        onMoveAndDelete={handleMoveAndDelete}
        onAddCard={handleAddFromDelete}
        onClosed={presentNextSheet}
      />
      <MoveRefundsSheet
        sheetRef={moveRef}
        prompt={movePrompt}
        onConfirm={handleMove}
      />
```

- [ ] **Step 8: Run the Cards and Validate suites, the type check and lint**

Run: `npx jest src/screens/traveller/Cards src/screens/traveller/Validate && npm run typecheck && npx eslint src/screens/traveller/Cards src/utils/card/card.ts`
Expected:
- Every suite passes: Task 1's baseline plus the new tests.
- `tsc` exits 0 and eslint reports no errors.
- `PortalHookBoundary.router.test.tsx` still passes. `AddCardSheet`'s form is unchanged; only its host gained a prop.

- [ ] **Step 9: Commit**

```bash
git add src/screens/traveller/Cards/useOpenRefunds.ts src/screens/traveller/Cards/useCards.ts src/screens/traveller/Cards/_components/AddCardSheet.tsx src/screens/traveller/Cards/CardsScreen.tsx src/screens/traveller/Cards/__tests__/CardsScreen.router.test.tsx
git commit -F - <<'EOF'
feat(cards): My Cards offers to move open refunds onto the refund card

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Part B — ssr

All paths below are relative to the worktree root, `C:\unirefund\web-app-wt-cards-move-refunds`. Run every `pnpm --filter ssr` command from there.

### Task 6: Worktree, a unit runner for ssr, and the open-refunds model

**Files:**
- Modify: `apps/ssr/package.json` (scripts)
- Create: `apps/ssr/src/components/payout-cards/open-refunds.ts`
- Test: `apps/ssr/src/components/payout-cards/open-refunds.test.ts`

**Interfaces:**
- Consumes: `preferredPayoutToken` from `apps/ssr/src/components/payout-cards/preferred-token.ts`.
- Produces: `OPEN_REFUND_STATUSES`, `OpenRefunds`, `NO_OPEN_REFUNDS`, `openRefunds(tags)`, `notOnCard(refunds, cardId)`, `DeletePlan`, `deletePlan(token, cards, hero, refunds)`. The signatures match super-app's Task 1, typed on `UniRefund_RefundService_TravellerCards_TravellerCardDto`.

- [ ] **Step 1: Create the worktree**

Run in Git Bash:

```bash
cd /c/unirefund/web-app && git fetch origin
git worktree add /c/unirefund/web-app-wt-cards-move-refunds -b feat/cards-move-open-refunds origin/main
cd /c/unirefund/web-app-wt-cards-move-refunds
for p in packages/ayasofyazilim-ui packages/utils; do
  sha=$(git ls-tree HEAD "$p" | awk '{print $3}')
  rmdir "$p" 2>/dev/null
  git clone --no-hardlinks "/c/unirefund/web-app/$p" "$p"
  git -C "$p" checkout "$sha" || { git -C "$p" fetch origin && git -C "$p" checkout "$sha"; }
done
cp /c/unirefund/web-app/apps/ssr/.env apps/ssr/.env
cp /c/unirefund/web-app/apps/ssr/next-env.d.ts apps/ssr/next-env.d.ts
cp /c/unirefund/web-app/packages/utils/policies/policies.json packages/utils/policies/policies.json
pnpm install
pnpm --filter ssr run init
git status --short
```

Expected:
- `git status --short` prints nothing: the submodule gitlinks match their pins.
- Worktrees do not populate submodules, and `git submodule update` can fail in them, hence the local clones.
- `next-env.d.ts` is copied because without it `tsc` reports a phantom TS2307 on `unirefund.svg`.

- [ ] **Step 2: Record the baseline**

Run: `pnpm --filter ssr type-check`
Expected: exit 0. If not, stop and report the errors — they are not yours.

- [ ] **Step 3: Add the unit runner**

In `apps/ssr/package.json`, add this script after `"test:headed"`, copied from `apps/web`:

```json
    "test:unit": "node --import tsx --test \"src/**/*.test.ts\"",
```

(`tsx` is already a devDependency of ssr.)

- [ ] **Step 4: Write the failing test**

Create `apps/ssr/src/components/payout-cards/open-refunds.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { UniRefund_RefundService_TravellerCards_TravellerCardDto as Token } from "@repo/saas/RefundService";
import type { UniRefund_TagService_Tags_TagListItemForTravellerCrossTenantsDto as TravellerTag } from "@repo/saas/TagService";
import {
  deletePlan,
  NO_OPEN_REFUNDS,
  notOnCard,
  openRefunds,
} from "./open-refunds";

const tag = (over: Record<string, unknown> = {}) =>
  ({
    id: "tag",
    status: "Issued",
    payoutTokenId: null,
    ...over,
  }) as unknown as TravellerTag;

const card = (id: string, over: Partial<Token> = {}): Token => ({
  id,
  travellerId: "tr-1",
  type: "Card",
  isDefault: false,
  isLastUsed: false,
  maskedNumber: `411111000000${id.slice(-4)}`,
  expiryMonth: 9,
  expiryYear: 2030,
  isExpired: false,
  ...over,
});

describe("openRefunds", () => {
  it("counts only tags whose payout card still matters", () => {
    const statuses = [
      "Open",
      "PreIssued",
      "Issued",
      "WaitingGoodsValidation",
      "WaitingStampValidation",
      "ExportValidated",
      "Refunded",
      "Cancelled",
      "Expired",
      "PaymentInProgress",
      "EarlyRefunded",
      "Declined",
      "Draft",
    ];
    assert.equal(openRefunds(statuses.map((status) => tag({ status }))).count, 6);
  });

  it("leaves red tags out, reading the final risk level first", () => {
    const refunds = openRefunds([
      tag({ risk: { finalRiskLevel: "Red" } }),
      tag({ risk: { riskLevel: "Red" } }),
      tag({ risk: { riskLevel: "Red", finalRiskLevel: "Green" } }),
      tag({ risk: { riskLevel: "Unknown" } }),
    ]);
    assert.equal(refunds.count, 2);
  });

  it("groups pins by card and keeps unpinned tags in the total only", () => {
    assert.deepEqual(
      openRefunds([
        tag({ payoutTokenId: "card-1111" }),
        tag({ payoutTokenId: "card-1111" }),
        tag({ payoutTokenId: "card-2222" }),
        tag({ payoutTokenId: null }),
      ]),
      { count: 4, byCard: { "card-1111": 2, "card-2222": 1 } }
    );
  });
});

describe("notOnCard", () => {
  it("counts tags on other cards and tags with no card", () => {
    const refunds = { count: 4, byCard: { "card-1111": 2, "card-2222": 1 } };
    assert.equal(notOnCard(refunds, "card-1111"), 2);
    assert.equal(notOnCard(refunds, "card-9999"), 4);
    assert.equal(notOnCard(NO_OPEN_REFUNDS, "card-1111"), 0);
  });
});

describe("deletePlan", () => {
  const hero = card("card-1111", { isDefault: true });
  const other = card("card-2222");
  const refunds = { count: 3, byCard: { "card-1111": 1, "card-2222": 2 } };

  it("is plain when no open refund uses the card", () => {
    assert.deepEqual(deletePlan(other, [hero, other], hero, NO_OPEN_REFUNDS), {
      kind: "plain",
    });
  });

  it("moves everything onto the hero when deleting another card", () => {
    assert.deepEqual(deletePlan(other, [hero, other], hero, refunds), {
      kind: "moveToHero",
      count: 2,
      hero,
    });
  });

  it("asks for a new card when deleting the hero, preselecting last used", () => {
    const lastUsed = card("card-3333", { isLastUsed: true });
    const plan = deletePlan(hero, [hero, other, lastUsed], hero, refunds);
    assert.equal(plan.kind, "choose");
    assert.equal(plan.kind === "choose" && plan.preselected.id, "card-3333");
  });

  it("asks for a new card instead of moving onto an expired hero", () => {
    const expiredHero = card("card-1111", { isDefault: true, isExpired: true });
    const third = card("card-3333");
    const plan = deletePlan(other, [expiredHero, other, third], expiredHero, refunds);
    assert.equal(plan.kind, "choose");
    assert.equal(plan.kind === "choose" && plan.preselected.id, "card-3333");
  });

  it("never offers a bank token as the new destination", () => {
    const bank = card("bank-4444", { type: "Bank", isDefault: true });
    assert.deepEqual(deletePlan(hero, [hero, bank], hero, refunds), {
      kind: "noTarget",
      count: 1,
    });
  });

  it("has no target when every other card is expired", () => {
    const expired = card("card-3333", { isExpired: true });
    assert.deepEqual(deletePlan(hero, [hero, expired], hero, refunds), {
      kind: "noTarget",
      count: 1,
    });
  });
});
```

- [ ] **Step 5: Run it and see it fail**

Run: `pnpm --filter ssr test:unit`
Expected: FAIL with `Cannot find module …/open-refunds`.

- [ ] **Step 6: Implement**

Create `apps/ssr/src/components/payout-cards/open-refunds.ts`:

```ts
import type { UniRefund_RefundService_TravellerCards_TravellerCardDto as Token } from "@repo/saas/RefundService";
import type {
  UniRefund_TagService_Tags_TagListItemForTravellerCrossTenantsDto as TravellerTag,
  UniRefund_TagService_Tags_TagStatusType as TagStatus,
} from "@repo/saas/TagService";
import { preferredPayoutToken } from "./preferred-token";

// Our reading of the pin endpoint's "a status where the payout target still
// matters". The server's rule decides what moves; this only decides whether to ask.
export const OPEN_REFUND_STATUSES: TagStatus[] = [
  "Open",
  "PreIssued",
  "Issued",
  "WaitingGoodsValidation",
  "WaitingStampValidation",
  "ExportValidated",
];

export type OpenRefunds = {
  count: number;
  byCard: Record<string, number>;
};

export const NO_OPEN_REFUNDS: OpenRefunds = { count: 0, byCard: {} };

function isRed(tag: TravellerTag) {
  return (tag.risk?.finalRiskLevel ?? tag.risk?.riskLevel) === "Red";
}

export function openRefunds(tags: readonly TravellerTag[]): OpenRefunds {
  const open = tags.filter(
    (tag) => OPEN_REFUND_STATUSES.includes(tag.status) && !isRed(tag)
  );
  const byCard: Record<string, number> = {};
  for (const tag of open) {
    if (tag.payoutTokenId) {
      byCard[tag.payoutTokenId] = (byCard[tag.payoutTokenId] ?? 0) + 1;
    }
  }
  return { count: open.length, byCard };
}

// An unpinned tag counts as not on the card: the desk resolves it through
// last-used before default.
export function notOnCard(refunds: OpenRefunds, cardId: string): number {
  return refunds.count - (refunds.byCard[cardId] ?? 0);
}

export type DeletePlan =
  | { kind: "plain" }
  | { kind: "moveToHero"; count: number; hero: Token }
  | { kind: "choose"; count: number; choices: Token[]; preselected: Token }
  | { kind: "noTarget"; count: number };

export function deletePlan(
  token: Token,
  cards: readonly Token[],
  hero: Token | null,
  refunds: OpenRefunds
): DeletePlan {
  const count = refunds.byCard[token.id] ?? 0;
  if (count === 0) return { kind: "plain" };
  if (hero && hero.id !== token.id && !hero.isExpired) {
    return { kind: "moveToHero", count, hero };
  }
  const choices = cards.filter(
    (card) => card.type === "Card" && card.id !== token.id && !card.isExpired
  );
  const preselected = preferredPayoutToken(choices) ?? choices[0];
  return preselected
    ? { kind: "choose", count, choices, preselected }
    : { kind: "noTarget", count };
}
```

- [ ] **Step 7: Run it and see it pass**

Run: `pnpm --filter ssr test:unit && pnpm --filter ssr type-check`
Expected: 10 tests pass; `tsc` exits 0.

- [ ] **Step 8: Commit**

```bash
git status --short
git add apps/ssr/package.json apps/ssr/src/components/payout-cards/open-refunds.ts apps/ssr/src/components/payout-cards/open-refunds.test.ts
git commit -F - <<'EOF'
feat(ssr): count open refunds per card, and a unit runner for ssr

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

`git status --short` before `add` must list only these three files. If `packages/*` appears, do not commit; see the lint-staged submodule-pointer note in memory.

---

### Task 7: The move and delete sequence (ssr)

**Files:**
- Create: `apps/ssr/src/components/payout-cards/move-refunds.ts`
- Test: `apps/ssr/src/components/payout-cards/move-refunds.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `MoveOutcome`, `MoveFailure`, `DeleteOutcome`, `DeleteFailure`, `moveOpenRefunds`, `deleteMovingRefunds`, `defaultAlreadyChanged` and `nextFailure`, with the same shapes as super-app Task 2.
  - **But `MoveCalls` is result-style,** matching ssr's server actions, which return `{ type }` rather than throw: `{ setDefault(id): Promise<boolean>; pin(id): Promise<number | null>; remove(id): Promise<boolean> }`, where `pin` returns `changedCount`, or `null` on failure.

- [ ] **Step 1: Write the failing test**

Create `apps/ssr/src/components/payout-cards/move-refunds.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultAlreadyChanged,
  deleteMovingRefunds,
  moveOpenRefunds,
  nextFailure,
  type MoveCalls,
} from "./move-refunds";

function setup(over: Partial<MoveCalls> = {}) {
  const order: string[] = [];
  const calls: MoveCalls = {
    setDefault: async (id) => {
      order.push(`setDefault:${id}`);
      return true;
    },
    pin: async (id) => {
      order.push(`pin:${id}`);
      return 3;
    },
    remove: async (id) => {
      order.push(`remove:${id}`);
      return true;
    },
    ...over,
  };
  return { calls, order };
}

describe("moveOpenRefunds", () => {
  it("pins a card that is already the default without setting it again", async () => {
    const { calls, order } = setup();
    assert.deepEqual(await moveOpenRefunds({ id: "a", isDefault: true }, calls), {
      status: "moved",
      changedCount: 3,
    });
    assert.deepEqual(order, ["pin:a"]);
  });

  it("sets the default before pinning", async () => {
    const { calls, order } = setup();
    await moveOpenRefunds({ id: "a", isDefault: false }, calls);
    assert.deepEqual(order, ["setDefault:a", "pin:a"]);
  });

  it("stops before the pin when set-default fails", async () => {
    const { calls, order } = setup({ setDefault: async () => false });
    assert.deepEqual(await moveOpenRefunds({ id: "a", isDefault: false }, calls), {
      status: "defaultFailed",
    });
    assert.deepEqual(order, []);
  });

  it("says whether the default changed when only the pin failed", async () => {
    const { calls } = setup({ pin: async () => null });
    assert.deepEqual(await moveOpenRefunds({ id: "a", isDefault: false }, calls), {
      status: "pinFailed",
      defaultChanged: true,
    });
    assert.deepEqual(await moveOpenRefunds({ id: "a", isDefault: true }, calls), {
      status: "pinFailed",
      defaultChanged: false,
    });
  });
});

describe("deleteMovingRefunds", () => {
  it("moves the refunds before it deletes", async () => {
    const { calls, order } = setup();
    assert.deepEqual(
      await deleteMovingRefunds("a", { id: "b", isDefault: false }, calls),
      { status: "deleted", changedCount: 3 }
    );
    assert.deepEqual(order, ["setDefault:b", "pin:b", "remove:a"]);
  });

  it("never deletes after a failed pin", async () => {
    const { calls, order } = setup({ pin: async () => null });
    await deleteMovingRefunds("a", { id: "b", isDefault: true }, calls);
    assert.deepEqual(order, []);
  });

  it("reports a failed delete after the refunds moved", async () => {
    const { calls } = setup({ remove: async () => false });
    assert.deepEqual(
      await deleteMovingRefunds("a", { id: "b", isDefault: true }, calls),
      { status: "deleteFailed", changedCount: 3 }
    );
  });
});

describe("nextFailure", () => {
  it("keeps 'default changed' across a retry that no longer sets it", () => {
    const first = { status: "pinFailed", defaultChanged: true } as const;
    const retry = { status: "pinFailed", defaultChanged: false } as const;
    assert.equal(defaultAlreadyChanged(first), true);
    assert.deepEqual(nextFailure(first, retry), first);
    assert.deepEqual(nextFailure(null, retry), retry);
    assert.equal(defaultAlreadyChanged(null), false);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter ssr test:unit`
Expected: FAIL with `Cannot find module …/move-refunds`.

- [ ] **Step 3: Implement**

Create `apps/ssr/src/components/payout-cards/move-refunds.ts`:

```ts
export type MoveOutcome =
  | { status: "moved"; changedCount: number }
  | { status: "defaultFailed" }
  | { status: "pinFailed"; defaultChanged: boolean };

export type MoveFailure = Exclude<MoveOutcome, { status: "moved" }>;

export type DeleteOutcome =
  | { status: "deleted"; changedCount: number }
  | { status: "deleteFailed"; changedCount: number }
  | MoveFailure;

export type DeleteFailure = Exclude<DeleteOutcome, { status: "deleted" }>;

export type MoveCalls = {
  setDefault: (id: string) => Promise<boolean>;
  pin: (id: string) => Promise<number | null>;
  remove: (id: string) => Promise<boolean>;
};

type Target = { id: string; isDefault: boolean };

export async function moveOpenRefunds(
  target: Target,
  calls: MoveCalls
): Promise<MoveOutcome> {
  let defaultChanged = false;
  if (!target.isDefault) {
    if (!(await calls.setDefault(target.id))) return { status: "defaultFailed" };
    defaultChanged = true;
  }
  const changedCount = await calls.pin(target.id);
  return changedCount === null
    ? { status: "pinFailed", defaultChanged }
    : { status: "moved", changedCount };
}

export async function deleteMovingRefunds(
  cardId: string,
  target: Target,
  calls: MoveCalls
): Promise<DeleteOutcome> {
  const moved = await moveOpenRefunds(target, calls);
  if (moved.status !== "moved") return moved;
  return (await calls.remove(cardId))
    ? { status: "deleted", changedCount: moved.changedCount }
    : { status: "deleteFailed", changedCount: moved.changedCount };
}

export function defaultAlreadyChanged(failure: DeleteFailure | null): boolean {
  return failure?.status === "pinFailed" && failure.defaultChanged;
}

// A retry after "default changed, pin failed" skips set-default, so its own
// outcome would forget the default already changed.
export function nextFailure<F extends DeleteFailure>(
  previous: DeleteFailure | null,
  next: F
): F {
  if (next.status === "pinFailed" && defaultAlreadyChanged(previous)) {
    return { ...next, defaultChanged: true } as F;
  }
  return next;
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter ssr test:unit && pnpm --filter ssr type-check`
Expected: 18 tests pass in total; `tsc` exits 0.

- [ ] **Step 5: Commit**

```bash
git status --short
git add apps/ssr/src/components/payout-cards/move-refunds.ts apps/ssr/src/components/payout-cards/move-refunds.test.ts
git commit -F - <<'EOF'
feat(ssr): move open refunds before a delete, never after a failed pin

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 8: Lift `CardOption` out of the validate step

A pure move: no behaviour changes. The delete dialog (Task 10) reuses the row.

**Files:**
- Create: `apps/ssr/src/components/payout-cards/card-option.tsx`
- Modify: `apps/ssr/src/app/[lang]/(public)/validate/_components/payout-card-step.tsx`

**Interfaces:**
- Produces:
  - `CardOption({ token, selected, onSelect })`, unchanged, keeping `data-testid="payout-card-option-{id}"`.
  - `maskedTail(token: Token): string`, returning `"•••• 4242"`.
  - `expiryLabel(token: Token): string`.

- [ ] **Step 1: Create the shared module**

Create `apps/ssr/src/components/payout-cards/card-option.tsx` by **moving** from `payout-card-step.tsx`, verbatim:
- `maskedTail`
- `expiryLabel`
- `CardOption`, with its docblock

Prefix the three with `export`. Head the file with `"use client";` and exactly the imports those three use:

```tsx
"use client";

import { useTranslations } from "@/src/providers/i18n";
import {
  CardBrandIcon,
  getCardBrand,
} from "@repo/ayasofyazilim-ui/components/card-brand-icon";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import type { UniRefund_RefundService_TravellerCards_TravellerCardDto } from "@repo/saas/RefundService";
import { Check } from "lucide-react";

type Token = UniRefund_RefundService_TravellerCards_TravellerCardDto;
```

- [ ] **Step 2: Point the validate step at it**

In `payout-card-step.tsx`:
- Delete the moved functions.
- Add `import { CardOption } from "@/src/components/payout-cards/card-option";`.
- Remove the imports that are now unused: `CardBrandIcon`, `getCardBrand`, `cn`, and `Check` from the lucide import. Keep `AlertTriangle`, `LoaderCircle`, `Plus`.

- [ ] **Step 3: Verify nothing changed**

Run: `pnpm --filter ssr type-check && pnpm --filter ssr exec eslint src/components/payout-cards "src/app/[lang]/(public)/validate/_components/payout-card-step.tsx"`
Expected: `tsc` exits 0; eslint reports no errors and no unused imports.

- [ ] **Step 4: Commit**

```bash
git status --short
git add apps/ssr/src/components/payout-cards/card-option.tsx "apps/ssr/src/app/[lang]/(public)/validate/_components/payout-card-step.tsx"
git commit -F - <<'EOF'
refactor(ssr): share the payout card row between validate and My Cards

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 9: The move dialog, the mismatch line and their copy (ssr)

**Files:**
- Create: `apps/ssr/src/components/payout-cards/fill.ts`
- Test: `apps/ssr/src/components/payout-cards/fill.test.ts`
- Modify: `apps/ssr/src/language-data/unirefund/SSRService/resources/en.json`, `.../tr.json`
- Create: `apps/ssr/src/app/[lang]/(main)/account/cards/_components/move-refunds-dialog.tsx`
- Create: `apps/ssr/src/app/[lang]/(main)/account/cards/_components/open-refunds-line.tsx`

**Interfaces:**
- Consumes: `MoveOutcome`, `MoveFailure`, `defaultAlreadyChanged`, `nextFailure` (Task 7); `maskedTail` (Task 8).
- Produces:
  - `fill(template: string, values: Record<string, string | number>): string`
  - `type MovePrompt = { mode: "afterDefault" | "afterAdd" | "line"; target: Token; count: number }`
  - `MoveRefundsDialog({ prompt: MovePrompt, onOpenChange, onConfirm: (target) => Promise<MoveOutcome> })`, mounted only while a prompt exists
  - `OpenRefundsLine({ count, disabled, onMove })`

- [ ] **Step 1: Write the failing `fill` test**

Create `apps/ssr/src/components/payout-cards/fill.test.ts`:

```ts
import assert from "node:assert/strict";
import { it } from "node:test";
import { fill } from "./fill";

it("fills every named placeholder and leaves unknown ones alone", () => {
  assert.equal(
    fill("{count} refunds moved to {card} {other}", { count: 3, card: "•••• 4242" }),
    "3 refunds moved to •••• 4242 {other}"
  );
});
```

Run: `pnpm --filter ssr test:unit`
Expected: FAIL with `Cannot find module …/fill`.

- [ ] **Step 2: Implement `fill`**

Create `apps/ssr/src/components/payout-cards/fill.ts`:

```ts
export function fill(
  template: string,
  values: Record<string, string | number>
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match
  );
}
```

Run: `pnpm --filter ssr test:unit`
Expected: PASS, 19 tests.

- [ ] **Step 3: Add the copy**

Add these flat keys to `apps/ssr/src/language-data/unirefund/SSRService/resources/en.json`, right after `"Account.Cards.Title"`. Mind the commas.

```json
  "Account.Cards.MoveRefunds.MoveTitle": "Move your open refunds?",
  "Account.Cards.MoveRefunds.UseTitle": "Use {card} for refunds?",
  "Account.Cards.MoveRefunds.AfterDefaultOne": "{card} is now your refund card. 1 open refund isn't set to it yet.",
  "Account.Cards.MoveRefunds.AfterDefaultOther": "{card} is now your refund card. {count} open refunds aren't set to it yet.",
  "Account.Cards.MoveRefunds.AfterAddOne": "It becomes your default, and your open refund moves to it.",
  "Account.Cards.MoveRefunds.AfterAddOther": "It becomes your default, and your {count} open refunds move to it.",
  "Account.Cards.MoveRefunds.LineBodyOne": "1 open refund isn't set to {card} yet.",
  "Account.Cards.MoveRefunds.LineBodyOther": "{count} open refunds aren't set to {card} yet.",
  "Account.Cards.MoveRefunds.Move": "Move to this card",
  "Account.Cards.MoveRefunds.Use": "Use this card",
  "Account.Cards.MoveRefunds.NotNow": "Not now",
  "Account.Cards.MoveRefunds.Close": "Close",
  "Account.Cards.MoveRefunds.TryAgain": "Try again",
  "Account.Cards.MoveRefunds.DefaultFailed": "Couldn't make this card your default. Nothing changed.",
  "Account.Cards.MoveRefunds.PinFailed": "Couldn't move your open refunds.",
  "Account.Cards.MoveRefunds.PinFailedDefaultChanged": "It's your default now, but your open refunds didn't move.",
  "Account.Cards.MoveRefunds.MovedOne": "1 refund moved to {card}",
  "Account.Cards.MoveRefunds.MovedOther": "{count} refunds moved to {card}",
  "Account.Cards.MoveRefunds.LineOne": "1 open refund isn't set to this card",
  "Account.Cards.MoveRefunds.LineOther": "{count} open refunds aren't set to this card",
  "Account.Cards.MoveRefunds.LineAction": "Move",
  "Account.Cards.DeleteMove.MoveToHeroOne": "1 open refund is set to this card. Deleting it moves all your open refunds to {card}.",
  "Account.Cards.DeleteMove.MoveToHeroOther": "{count} open refunds are set to this card. Deleting it moves all your open refunds to {card}.",
  "Account.Cards.DeleteMove.ChooseOne": "1 open refund is set to this card. Choose where your open refunds go instead.",
  "Account.Cards.DeleteMove.ChooseOther": "{count} open refunds are set to this card. Choose where your open refunds go instead.",
  "Account.Cards.DeleteMove.NoTargetOne": "1 open refund is set to this card. It will have no card to pay to until you add one.",
  "Account.Cards.DeleteMove.NoTargetOther": "{count} open refunds are set to this card. They'll have no card to pay to until you add one.",
  "Account.Cards.DeleteMove.DeleteAnyway": "Delete anyway",
  "Account.Cards.DeleteMove.MoveFailed": "Couldn't move your open refunds, so the card wasn't deleted.",
  "Account.Cards.DeleteMove.MoveFailedDefaultChanged": "Your default changed, but your open refunds didn't move, so the card wasn't deleted.",
  "Account.Cards.DeleteMove.DeleteFailed": "Your open refunds moved, but the card couldn't be deleted.",
  "Account.Cards.DeleteMove.MovedAndDeletedOne": "Deleted. 1 refund moved to {card}.",
  "Account.Cards.DeleteMove.MovedAndDeletedOther": "Deleted. {count} refunds moved to {card}.",
```

Add the same keys, in the same place, to `tr.json`:

```json
  "Account.Cards.MoveRefunds.MoveTitle": "Açık iadeleriniz taşınsın mı?",
  "Account.Cards.MoveRefunds.UseTitle": "İadeler için {card} kullanılsın mı?",
  "Account.Cards.MoveRefunds.AfterDefaultOne": "{card} artık iade kartınız. 1 açık iadeniz henüz bu karta ayarlı değil.",
  "Account.Cards.MoveRefunds.AfterDefaultOther": "{card} artık iade kartınız. {count} açık iadeniz henüz bu karta ayarlı değil.",
  "Account.Cards.MoveRefunds.AfterAddOne": "Bu kart varsayılanınız olur ve açık iadeniz bu karta taşınır.",
  "Account.Cards.MoveRefunds.AfterAddOther": "Bu kart varsayılanınız olur ve {count} açık iadeniz bu karta taşınır.",
  "Account.Cards.MoveRefunds.LineBodyOne": "1 açık iadeniz henüz {card} kartına ayarlı değil.",
  "Account.Cards.MoveRefunds.LineBodyOther": "{count} açık iadeniz henüz {card} kartına ayarlı değil.",
  "Account.Cards.MoveRefunds.Move": "Bu karta taşı",
  "Account.Cards.MoveRefunds.Use": "Bu kartı kullan",
  "Account.Cards.MoveRefunds.NotNow": "Şimdi değil",
  "Account.Cards.MoveRefunds.Close": "Kapat",
  "Account.Cards.MoveRefunds.TryAgain": "Tekrar dene",
  "Account.Cards.MoveRefunds.DefaultFailed": "Bu kart varsayılan yapılamadı. Hiçbir şey değişmedi.",
  "Account.Cards.MoveRefunds.PinFailed": "Açık iadeleriniz taşınamadı.",
  "Account.Cards.MoveRefunds.PinFailedDefaultChanged": "Kart artık varsayılanınız, ancak açık iadeleriniz taşınamadı.",
  "Account.Cards.MoveRefunds.MovedOne": "1 iade {card} kartına taşındı",
  "Account.Cards.MoveRefunds.MovedOther": "{count} iade {card} kartına taşındı",
  "Account.Cards.MoveRefunds.LineOne": "1 açık iade bu karta ayarlı değil",
  "Account.Cards.MoveRefunds.LineOther": "{count} açık iade bu karta ayarlı değil",
  "Account.Cards.MoveRefunds.LineAction": "Taşı",
  "Account.Cards.DeleteMove.MoveToHeroOne": "1 açık iadeniz bu karta ayarlı. Kartı silmek tüm açık iadelerinizi {card} kartına taşır.",
  "Account.Cards.DeleteMove.MoveToHeroOther": "{count} açık iadeniz bu karta ayarlı. Kartı silmek tüm açık iadelerinizi {card} kartına taşır.",
  "Account.Cards.DeleteMove.ChooseOne": "1 açık iadeniz bu karta ayarlı. Açık iadelerinizin nereye gideceğini seçin.",
  "Account.Cards.DeleteMove.ChooseOther": "{count} açık iadeniz bu karta ayarlı. Açık iadelerinizin nereye gideceğini seçin.",
  "Account.Cards.DeleteMove.NoTargetOne": "1 açık iadeniz bu karta ayarlı. Yeni bir kart ekleyene kadar ödenecek bir kartı olmayacak.",
  "Account.Cards.DeleteMove.NoTargetOther": "{count} açık iadeniz bu karta ayarlı. Yeni bir kart ekleyene kadar ödenecekleri bir kart olmayacak.",
  "Account.Cards.DeleteMove.DeleteAnyway": "Yine de sil",
  "Account.Cards.DeleteMove.MoveFailed": "Açık iadeleriniz taşınamadı, bu yüzden kart silinmedi.",
  "Account.Cards.DeleteMove.MoveFailedDefaultChanged": "Varsayılan kartınız değişti, ancak açık iadeleriniz taşınamadı, bu yüzden kart silinmedi.",
  "Account.Cards.DeleteMove.DeleteFailed": "Açık iadeleriniz taşındı, ancak kart silinemedi.",
  "Account.Cards.DeleteMove.MovedAndDeletedOne": "Silindi. 1 iade {card} kartına taşındı.",
  "Account.Cards.DeleteMove.MovedAndDeletedOther": "Silindi. {count} iade {card} kartına taşındı.",
```

Run: `pnpm --filter ssr run init && node scripts/find-missing-i18n.mjs --app=ssr`
Expected: `init` exits 0. The missing-keys report lists none of the new keys.

- [ ] **Step 4: Implement the dialog**

Create `apps/ssr/src/app/[lang]/(main)/account/cards/_components/move-refunds-dialog.tsx`:

```tsx
"use client";
import { maskedTail } from "@/src/components/payout-cards/card-option";
import { fill } from "@/src/components/payout-cards/fill";
import {
  defaultAlreadyChanged,
  nextFailure,
  type MoveFailure,
  type MoveOutcome,
} from "@/src/components/payout-cards/move-refunds";
import { useTranslations } from "@/src/providers/i18n";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ayasofyazilim-ui/components/dialog";
import type { UniRefund_RefundService_TravellerCards_TravellerCardDto } from "@repo/saas/RefundService";
import { AlertTriangle, LoaderCircle } from "lucide-react";
import { useState } from "react";

type Token = UniRefund_RefundService_TravellerCards_TravellerCardDto;

export type MovePrompt = {
  mode: "afterDefault" | "afterAdd" | "line";
  target: Token;
  count: number;
};

const BODY = {
  afterDefault: [
    "Account.Cards.MoveRefunds.AfterDefaultOne",
    "Account.Cards.MoveRefunds.AfterDefaultOther",
  ],
  afterAdd: [
    "Account.Cards.MoveRefunds.AfterAddOne",
    "Account.Cards.MoveRefunds.AfterAddOther",
  ],
  line: [
    "Account.Cards.MoveRefunds.LineBodyOne",
    "Account.Cards.MoveRefunds.LineBodyOther",
  ],
} as const;

export function MoveRefundsDialog({
  prompt,
  onOpenChange,
  onConfirm,
}: {
  prompt: MovePrompt;
  onOpenChange: (open: boolean) => void;
  onConfirm: (target: Token) => Promise<MoveOutcome>;
}) {
  const { t } = useTranslations();
  const copy = t.SSRService;
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<MoveFailure | null>(null);
  const values = { count: prompt.count, card: maskedTail(prompt.target) };
  const [one, other] = BODY[prompt.mode];

  async function handleConfirm() {
    if (busy) return;
    setBusy(true);
    try {
      const target = defaultAlreadyChanged(failure)
        ? { ...prompt.target, isDefault: true }
        : prompt.target;
      const outcome = await onConfirm(target);
      if (outcome.status === "moved") {
        onOpenChange(false);
        return;
      }
      setFailure(nextFailure(failure, outcome));
    } finally {
      setBusy(false);
    }
  }

  const failureText = !failure
    ? null
    : failure.status === "defaultFailed"
      ? copy["Account.Cards.MoveRefunds.DefaultFailed"]
      : failure.defaultChanged
        ? copy["Account.Cards.MoveRefunds.PinFailedDefaultChanged"]
        : copy["Account.Cards.MoveRefunds.PinFailed"];

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!busy) onOpenChange(open);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {prompt.mode === "afterAdd"
              ? fill(copy["Account.Cards.MoveRefunds.UseTitle"], values)
              : copy["Account.Cards.MoveRefunds.MoveTitle"]}
          </DialogTitle>
          <DialogDescription>
            {fill(copy[prompt.count === 1 ? one : other], values)}
          </DialogDescription>
        </DialogHeader>
        {failureText ? (
          <div
            className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800"
            data-testid="move-refunds-failed"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <span>{failureText}</span>
          </div>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            data-testid="move-refunds-dismiss"
            onClick={() => onOpenChange(false)}
          >
            {defaultAlreadyChanged(failure)
              ? copy["Account.Cards.MoveRefunds.Close"]
              : copy["Account.Cards.MoveRefunds.NotNow"]}
          </Button>
          <Button
            type="button"
            disabled={busy}
            data-testid="move-refunds-confirm"
            onClick={() => void handleConfirm()}
          >
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {failure
              ? copy["Account.Cards.MoveRefunds.TryAgain"]
              : prompt.mode === "afterAdd"
                ? copy["Account.Cards.MoveRefunds.Use"]
                : copy["Account.Cards.MoveRefunds.Move"]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Implement the line**

Create `apps/ssr/src/app/[lang]/(main)/account/cards/_components/open-refunds-line.tsx`:

```tsx
"use client";
import { fill } from "@/src/components/payout-cards/fill";
import { useTranslations } from "@/src/providers/i18n";
import { Button } from "@repo/ayasofyazilim-ui/components/button";

export function OpenRefundsLine({
  count,
  disabled,
  onMove,
}: {
  count: number;
  disabled: boolean;
  onMove: () => void;
}) {
  const { t } = useTranslations();
  const copy = t.SSRService;

  return (
    <div
      className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
      data-testid="open-refunds-line"
    >
      <span>
        {fill(
          copy[
            count === 1
              ? "Account.Cards.MoveRefunds.LineOne"
              : "Account.Cards.MoveRefunds.LineOther"
          ],
          { count }
        )}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        data-testid="open-refunds-line-move"
        onClick={onMove}
      >
        {copy["Account.Cards.MoveRefunds.LineAction"]}
      </Button>
    </div>
  );
}
```

- [ ] **Step 6: Verify**

Run: `pnpm --filter ssr test:unit && pnpm --filter ssr type-check && pnpm --filter ssr exec eslint src/components/payout-cards "src/app/[lang]/(main)/account/cards"`
Expected: 19 tests pass, `tsc` exits 0, eslint reports no errors. A TS error on an `Account.Cards.MoveRefunds.*` index means `init` did not regenerate the bundle.

- [ ] **Step 7: Commit**

```bash
git status --short
git add apps/ssr/src/components/payout-cards/fill.ts apps/ssr/src/components/payout-cards/fill.test.ts apps/ssr/src/language-data/unirefund/SSRService/resources/en.json apps/ssr/src/language-data/unirefund/SSRService/resources/tr.json "apps/ssr/src/app/[lang]/(main)/account/cards/_components/move-refunds-dialog.tsx" "apps/ssr/src/app/[lang]/(main)/account/cards/_components/open-refunds-line.tsx"
git commit -F - <<'EOF'
feat(ssr): prompt to move open refunds, and a line when they are elsewhere

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 10: The four-case delete dialog (ssr)

**Files:**
- Modify (full rewrite): `apps/ssr/src/app/[lang]/(main)/account/cards/_components/delete-card-dialog.tsx`

**Interfaces:**
- Consumes: `DeletePlan` (Task 6); `DeleteOutcome`, `DeleteFailure`, `defaultAlreadyChanged`, `nextFailure` (Task 7); `CardOption`, `maskedTail` (Task 8); `fill` and the `DeleteMove` copy (Task 9).
- Produces: `DeleteCardDialog({ open, onOpenChange, onConfirm, title?, description?, plan?, onMoveAndDelete?, onAddCard? })`.
  - With `plan` omitted it behaves exactly as today, which is what the bank section relies on.
  - The one visible change: the Cancel/Delete pair uses a `busy` flag instead of `useTransition`, so the buttons stay disabled for the whole request. The old `startTransition(() => void promise)` released them at once.

- [ ] **Step 1: Rewrite the dialog**

Replace `delete-card-dialog.tsx` with:

```tsx
"use client";
import { CardOption, maskedTail } from "@/src/components/payout-cards/card-option";
import { fill } from "@/src/components/payout-cards/fill";
import {
  defaultAlreadyChanged,
  nextFailure,
  type DeleteFailure,
  type DeleteOutcome,
} from "@/src/components/payout-cards/move-refunds";
import type { DeletePlan } from "@/src/components/payout-cards/open-refunds";
import { useTranslations } from "@/src/providers/i18n";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ayasofyazilim-ui/components/dialog";
import type { UniRefund_RefundService_TravellerCards_TravellerCardDto } from "@repo/saas/RefundService";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";

type Token = UniRefund_RefundService_TravellerCards_TravellerCardDto;

const PLAIN: DeletePlan = { kind: "plain" };

export function DeleteCardDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  plan = PLAIN,
  onMoveAndDelete,
  onAddCard,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  /** Defaults to the card copy; the bank section passes its own. */
  title?: string;
  description?: string;
  plan?: DeletePlan;
  onMoveAndDelete?: (target: Token) => Promise<DeleteOutcome>;
  onAddCard?: () => void;
}) {
  const { t } = useTranslations();
  const copy = t.SSRService;
  const [busy, setBusy] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [failure, setFailure] = useState<DeleteFailure | null>(null);

  const target =
    plan.kind === "moveToHero"
      ? plan.hero
      : plan.kind === "choose"
        ? (plan.choices.find((card) => card.id === pickedId) ?? plan.preselected)
        : null;

  async function handleDelete() {
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleMoveAndDelete() {
    if (!target || !onMoveAndDelete) return;
    setBusy(true);
    try {
      const outcome = await onMoveAndDelete(
        defaultAlreadyChanged(failure) ? { ...target, isDefault: true } : target
      );
      if (outcome.status === "deleted") {
        onOpenChange(false);
        return;
      }
      setFailure(nextFailure(failure, outcome));
    } finally {
      setBusy(false);
    }
  }

  const count = plan.kind === "plain" ? 0 : plan.count;
  const one = count === 1;
  const body =
    plan.kind === "moveToHero"
      ? fill(
          copy[
            one
              ? "Account.Cards.DeleteMove.MoveToHeroOne"
              : "Account.Cards.DeleteMove.MoveToHeroOther"
          ],
          { count, card: maskedTail(plan.hero) }
        )
      : plan.kind === "choose"
        ? fill(
            copy[
              one
                ? "Account.Cards.DeleteMove.ChooseOne"
                : "Account.Cards.DeleteMove.ChooseOther"
            ],
            { count }
          )
        : plan.kind === "noTarget"
          ? fill(
              copy[
                one
                  ? "Account.Cards.DeleteMove.NoTargetOne"
                  : "Account.Cards.DeleteMove.NoTargetOther"
              ],
              { count }
            )
          : (description ?? copy["Account.Cards.DeleteDescription"]);

  const failureText = !failure
    ? null
    : failure.status === "deleteFailed"
      ? copy["Account.Cards.DeleteMove.DeleteFailed"]
      : defaultAlreadyChanged(failure)
        ? copy["Account.Cards.DeleteMove.MoveFailedDefaultChanged"]
        : copy["Account.Cards.DeleteMove.MoveFailed"];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title ?? copy["Account.Cards.DeleteTitle"]}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        {plan.kind === "choose" ? (
          <div
            className="max-h-64 space-y-2 overflow-y-auto"
            data-testid="delete-card-choices"
          >
            {plan.choices.map((card) => (
              <CardOption
                key={card.id}
                token={card}
                selected={card.id === target?.id}
                onSelect={() => {
                  setPickedId(card.id);
                  setFailure(null);
                }}
              />
            ))}
          </div>
        ) : null}
        {failureText ? (
          <div
            className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800"
            data-testid="delete-card-failed"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <span>{failureText}</span>
          </div>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            data-testid="delete-card-cancel"
            onClick={() => onOpenChange(false)}
          >
            {copy["Account.Cards.Cancel"]}
          </Button>
          {plan.kind === "noTarget" ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                data-testid="delete-card-add"
                onClick={onAddCard}
              >
                {copy["Account.Cards.AddCard"]}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                data-testid="delete-card-anyway"
                onClick={() => void handleDelete()}
              >
                {copy["Account.Cards.DeleteMove.DeleteAnyway"]}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              data-testid="delete-card-confirm"
              onClick={() => void (target ? handleMoveAndDelete() : handleDelete())}
            >
              {failure
                ? copy["Account.Cards.MoveRefunds.TryAgain"]
                : copy["Account.Cards.Delete"]}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter ssr type-check && pnpm --filter ssr exec eslint "src/app/[lang]/(main)/account/cards/_components/delete-card-dialog.tsx"`
Expected: `tsc` exits 0. The existing `cards-view.tsx` call sites still compile, because every new prop is optional. eslint reports no errors.

- [ ] **Step 3: Commit**

```bash
git status --short
git add "apps/ssr/src/app/[lang]/(main)/account/cards/_components/delete-card-dialog.tsx"
git commit -F - <<'EOF'
feat(ssr): delete confirm moves a card's open refunds first

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 11: Wire ssr My Cards

**Files:**
- Create: `apps/ssr/src/app/[lang]/(main)/account/cards/_components/move-calls.ts`
- Modify: `apps/ssr/src/components/payout-cards/add-card-dialog.tsx:57-89`
- Modify: `apps/ssr/src/app/[lang]/(main)/account/cards/page.tsx`
- Modify: `apps/ssr/src/app/[lang]/(main)/account/cards/_components/cards-view.tsx`

**Interfaces:**
- Consumes: everything from Tasks 6–10; `getTagsCrossTenantsByTravellerIdClaimApi` (**throws** on failure, so it goes inside `Promise.allSettled`); `postTagTravellerPayoutTokenApi`, `postTravellerCardsByIdSetDefaultApi`, `deleteTravellerCardsByIdApi` (each returns `{ type }`).
- Produces: `CardsView` gains `openTags: TravellerTag[] | null`; `AddCardDialog` gains optional controlled `open` / `onOpenChange`.

- [ ] **Step 1: Server-action adapters**

Create `apps/ssr/src/app/[lang]/(main)/account/cards/_components/move-calls.ts`:

```ts
import type { MoveCalls } from "@/src/components/payout-cards/move-refunds";
import { deleteTravellerCardsByIdApi } from "@repo/actions/unirefund/RefundService/delete-actions";
import { postTravellerCardsByIdSetDefaultApi } from "@repo/actions/unirefund/RefundService/post-actions";
import { postTagTravellerPayoutTokenApi } from "@repo/actions/unirefund/TagService/post-actions";

export const moveCalls: MoveCalls = {
  setDefault: async (id) =>
    (await postTravellerCardsByIdSetDefaultApi(id)).type === "success",
  pin: async (id) => {
    const res = await postTagTravellerPayoutTokenApi({ payoutTokenId: id });
    return res.type === "success" ? res.data.changedCount : null;
  },
  remove: async (id) => (await deleteTravellerCardsByIdApi(id)).type === "success",
};
```

- [ ] **Step 2: Let `AddCardDialog` be opened from elsewhere**

In `apps/ssr/src/components/payout-cards/add-card-dialog.tsx`:

(a) Replace the function signature with:

```ts
export function AddCardDialog({
  travellerId,
  onAdded,
  trigger,
  open: openProp,
  onOpenChange,
}: {
  travellerId: string;
  onAdded?: (
    card: UniRefund_RefundService_TravellerCards_TravellerCardDto
  ) => void;
  trigger?: React.ReactNode;
  /** Controlled mode, for a page that opens the dialog from another control. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
```

(b) Replace `const [open, setOpen] = useState(false);` with:

```ts
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
```

(c) In `handleOpenChange`, replace `setOpen(nextOpen);` with:

```ts
    setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen);
```

The validate step passes neither prop, so it behaves as before.

- [ ] **Step 3: Fetch the open tags on the page**

In `apps/ssr/src/app/[lang]/(main)/account/cards/page.tsx`:

(a) Add imports:

```ts
import { OPEN_REFUND_STATUSES } from "@/src/components/payout-cards/open-refunds";
import { getTagsCrossTenantsByTravellerIdClaimApi } from "@repo/actions/unirefund/TagService/actions";
```

(b) Replace `const optionalRequests = await Promise.allSettled([]);` with:

```ts
    const optionalRequests = await Promise.allSettled([
      getTagsCrossTenantsByTravellerIdClaimApi(
        { status: OPEN_REFUND_STATUSES, maxResultCount: 999 },
        session
      ),
    ]);
```

(c) Replace the tail of `Page` from `const [cardsResponse] = …` with:

```tsx
  const [cardsResponse] = apiRequests.requiredRequests;
  const [tagsResponse] = apiRequests.optionalRequests;

  return (
    <CardsView
      cards={cardsResponse.data.items || []}
      travellerId={travellerId}
      openTags={
        tagsResponse.status === "fulfilled"
          ? (tagsResponse.value.data.items ?? [])
          : null
      }
    />
  );
```

- [ ] **Step 4: Wire `CardsView`**

In `apps/ssr/src/app/[lang]/(main)/account/cards/_components/cards-view.tsx`:

(a) Add imports:

```ts
import { maskedTail } from "@/src/components/payout-cards/card-option";
import { fill } from "@/src/components/payout-cards/fill";
import {
  deleteMovingRefunds,
  moveOpenRefunds,
  type DeleteOutcome,
  type MoveOutcome,
} from "@/src/components/payout-cards/move-refunds";
import {
  deletePlan,
  NO_OPEN_REFUNDS,
  notOnCard,
  openRefunds,
  type DeletePlan,
} from "@/src/components/payout-cards/open-refunds";
import type { UniRefund_TagService_Tags_TagListItemForTravellerCrossTenantsDto as TravellerTag } from "@repo/saas/TagService";
import { moveCalls } from "./move-calls";
import { MoveRefundsDialog, type MovePrompt } from "./move-refunds-dialog";
import { OpenRefundsLine } from "./open-refunds-line";
```

(b) Add `openTags` to the props:

```ts
export function CardsView({
  cards,
  travellerId,
  openTags,
}: {
  cards: Token[];
  travellerId: string;
  openTags: TravellerTag[] | null;
}) {
```

(c) After `const [deletingToken, setDeletingToken] = useState<Token | null>(null);`, add:

```ts
  const [deletingPlan, setDeletingPlan] = useState<DeletePlan>({ kind: "plain" });
  const [movePrompt, setMovePrompt] = useState<MovePrompt | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const copy = t.SSRService;
  const cardTokens = useMemo(() => cards.filter((c) => c.type === "Card"), [cards]);
  const refunds = useMemo(
    () => (openTags ? openRefunds(openTags) : NO_OPEN_REFUNDS),
    [openTags]
  );
```

Change the `cardPartition` memo to use it: `() => partitionTokens(cardTokens), [cardTokens]`.

(d) In `handleSetDefault`, compute `const count = isBank ? 0 : notOnCard(refunds, token.id);` after `isBank`. Then replace the success branch's `toast.success(…)` call with:

```ts
          if (count > 0) {
            setMovePrompt({
              mode: "afterDefault",
              target: { ...token, isDefault: true },
              count,
            });
          } else {
            toast.success(
              isBank
                ? t.SSRService["Account.Banks.SetDefaultSuccess"]
                : t.SSRService["Account.Cards.SetDefaultSuccess"]
            );
          }
```

Leave `router.refresh();` after it.

(e) After `handleDelete`, add:

```ts
  function openDelete(token: Token) {
    setDeletingToken(token);
    setDeletingPlan(
      token.type === "Card"
        ? deletePlan(token, cardTokens, heroCard, refunds)
        : { kind: "plain" }
    );
  }

  function handleAdded(card: Token) {
    router.refresh();
    const count = notOnCard(refunds, card.id);
    if (count > 0) setMovePrompt({ mode: "afterAdd", target: card, count });
  }

  async function handleMove(target: Token): Promise<MoveOutcome> {
    const outcome = await moveOpenRefunds(target, moveCalls);
    if (outcome.status === "moved" && outcome.changedCount > 0) {
      toast.success(
        fill(
          copy[
            outcome.changedCount === 1
              ? "Account.Cards.MoveRefunds.MovedOne"
              : "Account.Cards.MoveRefunds.MovedOther"
          ],
          { count: outcome.changedCount, card: maskedTail(target) }
        )
      );
    }
    router.refresh();
    return outcome;
  }

  async function handleMoveAndDelete(
    id: string,
    target: Token
  ): Promise<DeleteOutcome> {
    const outcome = await deleteMovingRefunds(id, target, moveCalls);
    if (outcome.status === "deleted") {
      const { changedCount } = outcome;
      toast.success(
        changedCount > 0
          ? fill(
              copy[
                changedCount === 1
                  ? "Account.Cards.DeleteMove.MovedAndDeletedOne"
                  : "Account.Cards.DeleteMove.MovedAndDeletedOther"
              ],
              { count: changedCount, card: maskedTail(target) }
            )
          : copy["Account.Cards.DeleteSuccess"]
      );
    }
    router.refresh();
    return outcome;
  }

  const lineCount =
    heroCard && !heroCard.isExpired ? notOnCard(refunds, heroCard.id) : 0;
```

`heroCard` is declared above these functions. If it is not, move the `const heroCard = cardPartition.hero;` line up.

(f) Replace all four `onDelete={() => setDeletingToken(X)}` props (hero card, card rows, hero bank, bank rows) with `onDelete={() => openDelete(X)}`.

(g) Make the header's add dialog controlled and prompt-aware:

```tsx
          <AddCardDialog
            travellerId={travellerId}
            open={addOpen}
            onOpenChange={setAddOpen}
            onAdded={handleAdded}
          />
```

(h) In the Cards section, directly after its `<Separator />`, add:

```tsx
        {heroCard && lineCount > 0 ? (
          <OpenRefundsLine
            count={lineCount}
            disabled={disabled}
            onMove={() =>
              setMovePrompt({ mode: "line", target: heroCard, count: lineCount })
            }
          />
        ) : null}
```

(i) Extend the `DeleteCardDialog` element with:

```tsx
          plan={deletingPlan}
          onMoveAndDelete={(target) =>
            handleMoveAndDelete(deletingToken.id, target)
          }
          onAddCard={() => {
            setDeletingToken(null);
            setAddOpen(true);
          }}
```

(j) Before the closing `</section>`, add:

```tsx
      {movePrompt ? (
        <MoveRefundsDialog
          prompt={movePrompt}
          onOpenChange={(open) => {
            if (!open) setMovePrompt(null);
          }}
          onConfirm={handleMove}
        />
      ) : null}
```

- [ ] **Step 5: Verify**

Run: `pnpm --filter ssr test:unit && pnpm --filter ssr type-check && pnpm --filter ssr exec eslint "src/app/[lang]/(main)/account/cards" src/components/payout-cards`
Expected: 19 tests pass, `tsc` exits 0, eslint reports no errors.

- [ ] **Step 6: Commit**

```bash
git status --short
git add "apps/ssr/src/app/[lang]/(main)/account/cards/_components/move-calls.ts" apps/ssr/src/components/payout-cards/add-card-dialog.tsx "apps/ssr/src/app/[lang]/(main)/account/cards/page.tsx" "apps/ssr/src/app/[lang]/(main)/account/cards/_components/cards-view.tsx"
git commit -F - <<'EOF'
feat(ssr): My Cards offers to move open refunds onto the refund card

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Part C — Verification

### Task 12: Walk both apps as the traveller

Nothing here is committed. Report each check as passed, failed (with a screenshot or output), or **unverified** (and why).

- [ ] **Step 1: Find out whether the test traveller has open refunds**

The walkthrough needs `tur-a25y29041` (password `1q2w3E*`, no tenant) to own at least two open tags. Ideally one of them is pinned to a card that is not their default.

Sign in to ssr (Step 3) and open `/en/tags`, or read the list the Cards page already fetched.
- If they have no open tags, stop and ask the user to issue one to that traveller (a merchant can: `siggi.merchant`). Do not create tags yourself.
- Report the prompt and delete cases as **unverified** until then.

- [ ] **Step 2: super-app on a CPad**

1. Run `adb devices -l`. Pick the attached CPad (`LD38266200649` or `LD2625CS00090`), never the V3.
2. Check `adb -s <serial> shell dumpsys package com.clomerce.unirefundsuperapp | Select-String -SimpleMatch "flags=["`. It must show `DEBUGGABLE`, or Metro cannot serve it: stop and tell the user.
3. Check the foreground activity: `adb -s <serial> shell dumpsys activity activities | Select-String mResumedActivity`. If super-app is in front, another session may be using the device: **ask the user before force-stopping it.**
4. Serve the worktree on its own port. `dev-superapp-devices.ps1` only knows the two main checkouts. From `C:\unirefund\super-app-wt-cards-move-refunds`, run `npx expo start --dev-client --port 8097` in the background, then:
   ```
   adb -s <serial> reverse tcp:8097 tcp:8097
   curl -s -o NUL -w "HTTP %{http_code}\n" --max-time 900 "http://localhost:8097/.expo/.virtual-metro-entry.bundle?platform=android&dev=true&minify=false"
   adb -s <serial> shell am force-stop com.clomerce.unirefundsuperapp
   adb -s <serial> shell am start -a android.intent.action.VIEW -d "unirefundsuperapp://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8097"
   ```
   The `curl` warms the bundle, which must return HTTP 200 before the launch.
5. Sign in as the traveller and open My Cards. With open tags pinned elsewhere, check:
   - **The mismatch line appears under the hero.** Tap **Move**. The sheet opens, then after Move to this card: a "refunds moved" toast, and the line disappears.
   - **Set another card as default.** The move sheet opens, and no "Default updated" toast appears. Tap **Not now**: the line now shows under the new hero.
   - **Add a card.** The Add sheet closes, *then* the "Use •••• XXXX for refunds?" sheet opens. The two sheets never overlap.
   - **Delete a non-hero card that open refunds use.** The sheet names the hero. Confirm: one toast, "Removed. N refunds moved…".
   - **Sheet sizing:** no sheet is clipped at the bottom, and a failure toast over an open sheet does not collapse it.
6. Take two screenshots per state, a second apart: `adb -s <serial> exec-out screencap -p > shot.png`. NativeWind restyles after the first frame.
7. When done, stop the bundler you started and remove only your reverse entry: `adb -s <serial> reverse --remove tcp:8097`.

- [ ] **Step 3: ssr in a browser**

1. Check whether port 3000 is taken (`netstat -ano | findstr :3000`).
   - If it is taken, **ask the user** before starting another dev server. The main checkout's `next dev` may be theirs.
   - Never run `next build`.
2. From the worktree root: `pnpm --filter ssr dev`. It runs `init`, then `next dev`.
3. With the Playwright MCP tools, sign in at `/en/login` as the traveller and open `/en/account/cards`. Walk the same five checks as Step 2. Also check:
   - **Delete the only card that open refunds use.** The dialog offers Add card and Delete anyway.
     - **Add card** closes it and opens the add dialog.
     - **Delete anyway** deletes the card, and the network panel shows no `traveller-payout-token` request. That is Review Focus 5.
   - **Retry.** If a pin failure can be forced (for example with DevTools offline after the dialog opens), Try again must not send a second `set-default`. That is Review Focus 4. Otherwise mark it unverified.
4. Stop the dev server you started.

- [ ] **Step 4: Report**

List each check with its result. Keep **unverified** items separate from passes.

# Traveller cards list: hero + compact rows

**Date:** 2026-08-05
**Repos:** `super-app`

## Problem

`screens/traveller/Cards/CardsScreen.tsx` renders every saved card as a full
`CardPreview` — `aspect-[1.586]`, full width, so roughly 206pt tall on a phone.
Five cards is over 1000pt of vertical scroll before the bank accounts section
begins. The list is technically reachable (`ModalTemplate` wraps its children in a
`ScrollView`) but not usable: the traveller cannot see their payout methods at a
glance, and the one card that actually matters — the default, the token a refund
lands on when a tag does not pin a specific one — is distinguished only by a small
amber pill on an otherwise identical face.

The bank accounts section has the opposite problem. `BankRow` is already compact,
but every account looks alike, so the default bank is equally hard to find.

## Goal

One screen where, in both sections, the default payout method is unmistakable and
every other method stays a scannable row with its full set of actions.

## Constraints established up front

- **The screen serves two jobs equally**: checking or switching the default, and
  full management (rename, set default, delete, add). Neither may be demoted to a
  second step, which is what ruled out a swipe carousel and a tap-to-expand
  wallet stack — both hide management behind a gesture.
- **2–5 methods typically, ~10 worst case.** No virtualization, no search, no
  pagination. This is a visual compaction, not a scalable-list problem.
- **There are two independent defaults, not one.** `postTravellerCardSetDefault`
  clears the previous default *of that type* (see the comment on `useCards`), so
  a single unified "Payout methods" list with one hero would misrepresent the data
  model. The two sections stay.

## Scope

| Surface | What changes |
| --- | --- |
| `screens/traveller/Cards/partitionTokens.ts` | **New.** Pure hero-selection rule, used by both sections |
| `screens/traveller/Cards/useCards.ts` | Adds `heroCard` / `otherCards` / `heroBank` / `otherBanks` as memos |
| `screens/traveller/Cards/CardsScreen.tsx` | Renders hero + rows per section; `CardPill` moves out |
| `screens/traveller/Cards/_components/CardRow.tsx` | **New.** The card twin of `BankRow` |
| `screens/traveller/Cards/_components/BankPanel.tsx` | **New.** Wide-slab hero for the default bank |
| `screens/traveller/Cards/_components/CardPill.tsx` | **New.** `CardPill` extracted from the screen, now shared by two heroes |
| `utils/card/card.ts` | Adds `lastFour(masked)` |

Deliberately out of scope:

- **Sorting beyond the hero split.** Expired cards are not sunk to the bottom;
  recently-used methods are not floated. At ~10 items, invented ordering costs
  more in surprise than it earns in tidiness, and a stable order is what makes the
  list feel like the same list after every refetch.
- **Wallet tokens.** Still filtered out by `useCards`, for the reason already
  documented there: no add flow and no distinct display.
- **`CardPreview` and `BankRow` internals.** `CardPreview` is used unchanged for
  the card hero. `BankRow` is used unchanged for bank rows.
- **Any web-app counterpart.** The SSR cards page is its own project.

## Design

### The hero selection rule

`partitionTokens(tokens) → { hero: PayoutToken | null, others: PayoutToken[] }`,
a pure module beside the existing `openCards.ts`. It picks the hero by first
match:

1. the token with `isDefault` — **even when expired**
2. else the first token with `isExpired === false`
3. else the first token

`others` is the input order minus the hero.

**Invariant: a non-empty input yields exactly one hero.** There is no
"sometimes no hero" case, so the screen's structure never changes shape between
states — only its contents.

Rule 1 deliberately gives the hero slot to an expired default. An expired card is
rejected at refund time, so a traveller whose default has expired needs to see
that at the top of the screen, not two rows down. `CardPreview` already handles
the presentation: `isExpired` dims the face to `opacity-60`, and the `Expired`
badge is already part of the pill cluster.

The same function serves banks with **no `type` branching**. `isExpired` is a card
concept — the DTO documents it as "True when the card has expired" and bank tokens
carry `false` — so for a bank list rule 2 always lands on the first account, and
the rule collapses to "default, else first" on its own.

It lives in its own module rather than inside `useCards` because it is the only
part of this change with real branching, and a pure function is cheap to test
exhaustively without rendering.

### `useCards`

Gains four `useMemo`s over `partitionTokens(cards)` and `partitionTokens(banks)`,
exposing `heroCard`, `otherCards`, `heroBank`, `otherBanks`. Derived state via
`useMemo`, per the repo's avoid-`useEffect` rule.

It keeps returning `cards` and `banks` unchanged, so the loading guard and the two
empty-state checks in `CardsScreen` stay exactly as written. The split belongs
here rather than in the screen because `useCards` already owns the Card/Bank
partition; the screen stays presentational.

Mutations still refetch rather than patching local state, unchanged.

### `CardRow`

The card twin of `BankRow`, with a deliberately identical prop contract:
`{ token, isPending, disabled, onRename, onSetDefault, onDelete }`. Two components
that sit in adjacent sections of one screen should read alike, which is the whole
reason the compact treatment works.

| Slot | Content |
| --- | --- |
| Leading | `CardBrandLogo` at `size={34}`, falling back to a `card-outline` Ionicon — `CardBrandLogo` returns `null` for `unknown` brands, so without the fallback the slot would collapse |
| Title | `nickname`, else `•••• 1234`. Pressable → rename. An `Expired` badge sits inline after it |
| Subtitle | `•••• 1234 · 03/28` in `SERIAL_FONT` when a nickname exists, else just `03/28` — otherwise the last four would appear twice in one row |
| Trailing | A `Default` badge if the token is somehow default (see below), else `star-outline` → set default when not expired, else nothing; then `trash-outline` → delete |

`isPending` dims the row; `disabled` blocks all three actions. Icon-only
pressables carry `accessibilityLabel`s from `t()`, as `BankRow` already does.

Omitting the star on expired cards mirrors the rule the screen already applies to
the `Set as default` pill.

### `BankPanel`

The default bank's hero. `aspect-[2.6]`, `rounded-2xl`, `bg-gray-800` — plainly
not a card, plainly the same family — with the same soft white highlight circle
`CardPreview` uses in place of a gradient. A literal Tailwind gray rather than a
semantic token, consistent with the `border-gray-300` / `text-gray-900` /
`bg-amber-400` this folder already uses.

The aspect ratio is a decision, not a default. Matching the card face's
`aspect-[1.586]` would make the two heroes literally identical in size, but a bank
account's entire content is three short strings, and a credit-card ratio to hold
them reads as empty. On a 375pt-wide phone the `px-6` content column is 327pt, so
the card face is 327 / 1.586 ≈ **206pt** and the slab is 327 / 2.6 ≈ **126pt** —
the slab saves about **80pt**, which is the problem this whole change exists to
fix. Its symmetry comes from shared vocabulary instead: same width, radius, corner
treatment, dark hero fill, and on-panel pill cluster.

| Slot | Content |
| --- | --- |
| Leading | Rounded-square `business-outline` mark |
| Title | `bankName \|\| nickname \|\| t("MobileApp.Cards.BanksSection")` — **bank name first**, unlike `BankRow`, because the hero's pill cluster already shows the nickname; leading with `nickname` would print it twice |
| Body | Masked IBAN through the existing `maskIban`, in `SERIAL_FONT` |
| Footer | Account-holder caption/value pair using `AccountHolderLabel`; bank tokens reuse `holderName` for this, as `AddBankSheet` writes it |
| Top-right | Pill cluster via `children` |

Purely presentational, like `CardPreview` — no notion of defaults or deletion.

### `CardPill`

Moves from a `CardsScreen`-local helper into `_components/CardPill.tsx`. Two
heroes use it now, so it is no longer screen-local.

### Both rows keep a `Default` badge branch

`BankRow` already has one, and it becomes unreachable once the default bank is
always the hero. It stays anyway: five lines that correctly handle a token that
*is* default, which is worth more than a deletion that quietly depends on the hero
invariant holding forever.

**`CardRow` gets the same branch, for the same reason.** `partitionTokens` uses
`find`, which takes the *first* match — so if the API ever returned two `Card`
tokens both flagged `isDefault` (a race between two devices setting a default, or a
backend bug), the second would land in `otherCards` and render as a row. Offering
"set as default" on a token that already holds it would mislead. The two twins must
degrade the same way under the same bad data; a defense in only one of them is
worse than a defense in neither, because it hides the asymmetry.

Precedence in both rows matches `HeroPills`: default wins, then usable, then
nothing.

### Interactions are today's

Nothing about what the actions *do* changes. Heroes keep the on-face pill cluster:
nickname → rename, `Default` badge or `Set as default` pill, `Expired` badge
(cards only), `Delete`. Rows: tap the title → rename, star → set default, trash →
delete.

**Set-default causes a visible re-layout.** The tapped row climbs into the hero
slot and the previous default drops back into the rows at its API position, so two
items move. This is accepted, not overlooked: it is the clearest possible
confirmation that the default changed, and the existing success toast reinforces
it.

### `lastFour(masked)`

New in `utils/card/card.ts`, next to `groupMaskedNumber`. The masked PAN contains
`*`, so `onlyDigits` cannot be reused — the same reason `groupMaskedNumber` exists
separately from `formatCardNumber`. Earns its own tested function rather than an
inline slice in the row.

### Localization

**No new keys.** `Default`, `SetDefault`, `Delete`, `Expired`, `NicknameLabel`,
`ExpiryLabel`, `HolderNameLabel`, `AccountHolderLabel`, `CardsSection` and
`BanksSection` all already exist under `MobileApp.Cards`. The row subtitle's `·`
separator is punctuation, not translatable text.

Consequence: `npm run init` is **not** a gate on this change, which is unusual
enough to state plainly.

## Testing

Unit suites, node project, no rendering — this is where the test weight sits,
because `partitionTokens` holds all the branching:

- `utils/card/__tests__/card.test.ts` — `lastFour` on a full masked PAN, on input
  shorter than four characters, and on an empty string.
- `screens/traveller/Cards/__tests__/partitionTokens.test.ts` — empty list; a
  single token; a default present; **an expired default still winning the hero**;
  no default with an expired token ahead of a valid one (the valid one wins); all
  tokens expired (the first wins); `others` preserving input order minus the hero;
  a bank list where nothing is expired.

Render coverage:

- `screens/traveller/Cards/__tests__/CardsScreen.router.test.tsx` — three cards
  produce one hero face and two rows. The `.router.test.` suffix is mandatory:
  `jest.config.js` explains that anything which renders must land in the
  android-preset project, because under the node preset nativewind's web JSX
  runtime pulls in `react-native-web`, which this app does not depend on. Needs
  the actions module, `LocalizationProvider` and `ToastProvider` mocked, so it is
  the expensive item in this list.

## Verification

- `npm run typecheck`
- `npm run lint`
- `npm test`

**Baseline:** seven suites already fail before this change — the component suites
under `src/components/__tests__` and `src/templates/__tests__`, which `jest.config.js`
documents as sitting in the wrong project rather than being broken tests. Success
is those seven still being exactly seven, not "all green". Capture the failing
count before making any edit.

Measured on `origin/main` (4ee89a1): `7 failed, 26 passed, 33 total` suites and
`346 passed` tests. **Do not measure this on a feature branch** — the concurrent
`feat/traveller-documents` branch carries 7 suites and 45 tests that `main` does
not, and quoting its numbers here caused a false baseline once already.

## Outcome

Implemented on branch `worktree-traveller-cards-hero`, 12 commits, base 4ee89a1.
Final state: `npx tsc --noEmit` exit 0; `npx eslint .` 0 errors (31 pre-existing
warnings); `npm test` `7 failed, 31 passed, 38 total` suites and `375 passed` tests
— **+29 tests, +5 suites** over baseline, with the pre-existing 7 unchanged.

### Known follow-ups, accepted rather than fixed

Each was raised in review, triaged, and deliberately deferred:

- **The on-device walkthrough never happened.** Nothing here has run on a device or
  emulator, so three things are verified by no evidence at all: the `aspect-[2.6]`
  bank slab against the `aspect-[1.586]` card face at real widths, text truncation
  for long bank names and IBANs, and the set-default re-layout in which a promoted
  row climbs into the hero slot. Tests cover structure and logic, never appearance.
  This is the largest outstanding gap.
- **No regression test for the duplicate-id case** in `partitionTokens`. The
  reference-equality comparison is correct by inspection, but nothing pins it.
  Note that duplicate ids would also produce duplicate React keys where
  `CardsScreen` maps `otherCards`.
- **No test exercises `CardRow`'s unknown-brand icon fallback** — every fixture PAN
  begins with `4`, so only the Visa path is covered.
- **`CardRow` reuses `opacity-50` for both `isExpired` and `isPending`**, so
  "expired" and "mutation in flight" look alike without reading the badge text.
- **Neither hero surfaces `isPending`.** Pre-existing — `CardPreview` never did —
  so this branch inherits the asymmetry rather than introducing it.

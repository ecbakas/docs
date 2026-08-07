# SSR payout methods: bank accounts, hero + compact rows

**Date:** 2026-08-07
**Repos:** `web-app` (`apps/ssr`, `packages/ayasofyazilim-ui`, `packages/actions`)

Companion to `2026-08-05-traveller-cards-hero-and-rows-design.md`, which did the
equivalent work in `super-app`. This is the web counterpart that spec deferred as
"its own project".

## Problem

`apps/ssr/src/app/[lang]/(main)/account/cards/` is the traveller's payout-methods
page, and it has two problems.

**Bank accounts cannot be added.** The page's only create flow is
`add-card-dialog.tsx`. The API supports bank tokens — `postApiRefundServiceTravellerCardsBank`
and `CreateBankTokenDto` are both already in `packages/saas/RefundService` — but
nothing in web-app calls them. A traveller who wants refunds paid by transfer has
no way to say so on the web.

**Every token renders as a credit card.** `page.tsx` calls
`getMyTravellerCardsApi({})` with no type filter, so Card, Bank *and* Wallet
tokens come back together, and `cards-view.tsx` maps all of them to
`CreditCardPreview`. A bank account is drawn with a chip, a card brand derived
from its masked IBAN, and an expiry; a wallet token gets the same treatment
despite having neither brand nor expiry. Only a small `Type` badge distinguishes
them.

The default token — the one refunds actually land on — is marked only by a star
icon on an otherwise identical face.

## Goal

One page where each kind of payout method is presented as what it is, bank
accounts can be added, and the default of each kind is unmistakable.

## Constraints established up front

- **This is not a literal port of the mobile layout.** super-app is a phone; this
  page has a ~900px content column and currently tiles cards in a `flex-wrap`
  grid. A credit-card face has a natural width of about 288px, so stacking hero
  over rows the way the app does would leave roughly 600px of dead gutter beside
  both heroes.
- **There are two independent defaults, not one.** Set-default clears the previous
  default *of that type*, so a card default and a bank default coexist. That is
  what makes two sections with two heroes the correct model rather than one hero
  for the page.
- **Nothing in web-app can run unit tests.** `apps/ssr`'s `test` script is
  Playwright. `packages/ui` and `packages/actions` have only lint, format and
  type-check. The one package with Jest — `packages/ayasofyazilim-ui` — is a **git
  submodule pointing at a separate repository**
  (`ayasofyazilim-clomerce/ayasofyazilim-ui`), as is `packages/utils`.

  An earlier draft of this spec put the IBAN helpers, the hero rule and
  `BankAccountPreview` in that package specifically so they could be unit-tested.
  That was wrong on two counts: it would make them commits in another repo,
  needing their own PR plus a submodule-pointer bump here, and `partitionTokens`
  is this page's business logic — putting it in a shared design system consumed by
  other projects is the wrong coupling whatever the testing benefit.

  **Decision: everything lives in `apps/ssr`, and this feature ships with no unit
  tests.** The submodule stays read-only — we import `CreditCardPreview`, `Button`,
  `cn` and the rest from it, and add nothing to it. Verification is typecheck,
  lint, the i18n scripts and a browser walkthrough. That is a real reduction in
  assurance and is recorded as such under "What is not covered".
- **web-app has no IBAN helpers.** No validation, formatting or masking exists
  anywhere in the monorepo. The add-bank flow cannot validate without them.

## Scope

| Surface | What changes |
| --- | --- |
| `apps/ssr/src/utils/utils-iban.ts` | **New.** `normalizeIban`, `ibanValid`, `formatIban`, `maskIban`, `ibanCountryCode`. Follows the folder's `utils-<domain>.ts` convention |
| `apps/ssr/.../account/cards/partition-tokens.ts` | **New.** The hero-selection rule, colocated with its only consumer |
| `apps/ssr/.../account/cards/_components/bank-account-preview.tsx` | **New.** The bank hero, modelled on the submodule's `credit-card-preview.tsx` |
| `packages/actions/unirefund/RefundService/post-actions.ts` | Adds `postTravellerBankTokenApi` |
| `apps/ssr/.../account/cards/_components/cards-view.tsx` | Reworked into two sections, each hero + rows |
| `apps/ssr/.../account/cards/_components/token-hero-actions.tsx` | **New.** The on-face action cluster both heroes carry |
| `apps/ssr/.../account/cards/_components/card-row.tsx` | **New.** Compact card row |
| `apps/ssr/.../account/cards/_components/bank-row.tsx` | **New.** Compact bank row |
| `apps/ssr/.../account/cards/_components/add-bank-dialog.tsx` | **New.** Sibling of `add-card-dialog.tsx` |
| `apps/ssr/src/language-data/unirefund/SSRService/resources/{en,tr}.json` | ~15 new keys; three orphaned ones pruned |

Deliberately out of scope:

- **Wallet tokens.** Filtered out, matching super-app. See "Dropping wallets".
- **`credit-card-preview.tsx`.** Used unchanged as the card hero.
- **`add-card-dialog.tsx`.** Reused unchanged; only a new call site.
- **`edit-nickname-dialog.tsx` and `delete-card-dialog.tsx`** are reused, but each
  gains **optional `title` and `description` props defaulting to today's card
  copy.** Both currently hard-code card wording — the delete dialog says "This card
  will be permanently removed from your account" — which would be wrong on a bank
  account. Passing bank copy from the bank section is a three-line, backward-
  compatible change; leaving it would ship a visible copy bug. Corrected during
  planning, after the original draft said "reused as they are".
- **The `apps/web` admin surfaces.** This is the traveller-facing SSR app only.
- **Playwright coverage of the new page.** See "What is not covered".

## Design

### Layout

Each section renders a header (title, description, Add button), a separator, and
then either the existing `Empty` state or a hero-and-rows pair:

```tsx
<div className="flex flex-col md:flex-row gap-4">
  <hero className="shrink-0 w-full md:w-72" />
  {others.length > 0 && (
    <div className="flex-1 flex flex-col gap-2">{/* rows */}</div>
  )}
</div>
```

That one `flex-col md:flex-row` is the entire responsive story. Above `md` the
hero keeps its natural width and the rows fill the space beside it; below `md`
the columns stack, which lands exactly on the mobile layout, so app/web parity
holds where parity actually matters.

**When a section holds a single method, the row column is not rendered at all**
and the hero keeps its position. The layout never shifts as methods are added or
removed. This falls out of `others.length > 0` with no special case.

### Hero selection

`partitionTokens(tokens) → { hero, others }`, a pure module in the UI package,
picking by first match:

1. the token with `isDefault` — **even if expired**
2. else the first token with `isExpired === false`
3. else the first token

`others` is input order minus the hero. A non-empty list always yields exactly one
hero, so the page never has a state with neither a hero nor an empty state.

Rule 1 deliberately keeps an expired default in the hero slot: an expired card is
rejected at refund time, so a traveller whose default has expired needs to see
that first, not two rows down.

The same function serves both sections with no branching on `type`, because
`isExpired` is a card concept the API leaves false for bank tokens.

It lives in the package rather than beside its consumer for one reason: it is the
only real branching in this feature, and `apps/ssr` cannot test it.

### Components

**`BankAccountPreview`** mirrors `CreditCardPreview`'s contract precisely —
presentational only, no notion of defaults or deletion; takes the raw stored value
and formats it internally (as `CreditCardPreview` formats its own number); receives
display strings through a `labels` prop rather than calling any translation
function; composes its action cluster through `children`.

It uses **`aspect-[2.6]`**, not the card face's `aspect-[1.586]`, matching what
shipped in super-app. At the shared `w-72` (288px) hero width that is ~111px tall
against the card face's ~182px. A bank account's whole content is a name, a masked
IBAN and an account holder; a credit-card ratio to hold three short strings reads
as empty. The symmetry with the card face comes from shared vocabulary — same
width, radius, dark treatment, on-face action cluster — not from identical height.

The value it formats is `maskedNumber`, which for a Bank token carries the masked
IBAN (the DTO documents the bank equivalents as "Masked IBAN (e.g.
`DE89********3000`)"). `BankAccountPreview` runs it through `maskIban` itself,
exactly as `CreditCardPreview` formats its own number rather than making callers
do it.

**`TokenHeroActions`** is the cluster both heroes carry: nickname button, then the
default state (badge if default, set-default control if not default and not
expired, otherwise nothing), an expired badge, and delete. One component, used
twice.

This is app-local rather than package-level because it calls `useTranslations()`.
It exists as a single component on purpose: the super-app branch's final review
caught its two row components having drifted apart, because a defense added to one
was never carried to its twin. One implementation makes that failure impossible.

**`CardRow`** and **`BankRow`** are the compact rows, app-local for the same
`useTranslations()` reason, and deliberately sharing a prop shape so the two
sections read as one page.

`CardRow` shows the brand mark, the nickname or last four, the expiry, a
set-default control and delete. `BankRow` shows a bank glyph, the nickname or bank
name, the masked IBAN, a set-default control and delete.

The set-default control on a row is a star icon button carrying an
`aria-label`/`title` from the existing `Account.Cards.SetDefault` key — the same
affordance the current card face uses, moved to row scale. It is **absent, not
disabled, on an expired card**, because setting an expired card as default cannot
succeed. Delete remains available in every state.

Both rows keep a default-badge branch even though `partitionTokens` should lift any
default into the hero. `partitionTokens` uses `find`, which takes the first match,
so if the API ever returned two tokens of one type both flagged default, the second
would render as a row — and offering "set as default" on a token that already holds
it would mislead. Both twins degrade the same way under the same bad data.

### The type badge is removed

`cards-view.tsx` currently renders `Account.Cards.Type.{type}` on every face. Once
the section header says "Cards" or "Bank accounts", that badge says the same thing
twice. Removing it orphans three i18n keys, which `pnpm i18n:unused --app=ssr`
finds and prunes.

### Dropping wallets

The list is filtered to `Card` and `Bank`. This is a deliberate, and slightly
lossy, decision.

A wallet token carries no wallet-specific data — the bank fields are documented
"Null for card/wallet tokens" and there are no wallet fields at all — and neither
client has an endpoint to create one. The repo never documents what a wallet is;
`PayoutTokenType` is one of the few enums in the generated types with no doc
comment.

Today the page renders such a token as a credit-card face, inventing a chip, a
brand derived from `maskedNumber`, and an expiry from fields that are meaningless
for it. So this removes a display that is already wrong rather than a working one.

**The real cost:** this page is also the only place a traveller could delete a
wallet token, and after this change they cannot. Accepted knowingly. If wallet
tokens turn out to exist in production, the follow-up is a plain "Other payout
methods" row list with a delete action and no invented detail — not a restoration
of the card face.

### Adding a bank account

`postTravellerBankTokenApi(data, session?)` wraps
`postApiRefundServiceTravellerCardsBank`, following the shape the POST file
already uses: `structuredResponse` on success, `return structuredError(error)` in
catch. (Only `actions.ts` throws; POST/PUT/DELETE return.)

`add-bank-dialog.tsx` mirrors `add-card-dialog.tsx`'s skeleton: `Dialog` +
`DialogTrigger`, a form, client-side validation that toasts before hitting the
network, then `startTransition` → post → success toast → close → `router.refresh()`.
No scanner; that is card-specific.

| Field | Required | Notes |
| --- | --- | --- |
| IBAN | yes | Gated on `ibanValid` before submit, as the card dialog gates on `luhnValid` |
| BIC | no | 8–11 chars when supplied; blank treated as omitted, per the DTO |
| Bank name | no | Display only |
| ~~Bank country~~ | — | **Not a field.** Derived from the IBAN — see below |
| Account holder | no | |
| Nickname | no | |

**`bankCountryCode` is derived, not asked for.** An IBAN's first two characters are
its ISO-3166 alpha-2 country code by definition (ISO 13616), so asking the
traveller to re-enter it invites a contradiction between the two fields and buys
nothing. The dialog sends `ibanCountryCode(iban)` — a fifth pure helper alongside
the others in `iban.ts`, unit-tested with them.

This corrects an error in the original draft, which said to use `CountrySelector`
"which already yields ISO-3166 alpha-2 codes". It does not: it is a
language/culture switcher whose items carry `cultureName` and
`twoLetterISOLanguageName`, it is uncontrolled (`defaultValue`, not `value`), and
its `countries` prop defaults to `[]`. All four of its consumers in the monorepo
are locale pickers. It is the wrong component for this field, and no
country-code picker exists.

`travellerId` comes down the path the card dialog already uses — resolved from
session in `page.tsx`, passed through `CardsView`.

Every `Button`, `Input` and `DialogTrigger` carries a `data-testid`; the repo's
`react-require-testid` ESLint rule fails the build otherwise.

### Localization

About fifteen new keys in
`apps/ssr/src/language-data/unirefund/SSRService/resources/{en,tr}.json`: the bank
section title and description, the Add button, dialog title and description, six
field labels with placeholders, `InvalidIban`, `AddBankSuccess`, and
`NoBanks`/`NoBanksDescription`.

`pnpm run init` must run afterwards. This is a hard gate, not a formality — `tsc`
does not see a new key until the generated bundle is rebuilt. Never edit anything
under `language-data/i18n/` by hand.

## Testing

**There are none.** No package in web-app that this feature may write to has a
unit-test runner, and the only one that does is a separate repository we are not
contributing to. This is stated plainly rather than dressed up: the IBAN mod-97
implementation, the hero-selection rule and the bank hero panel all ship
unverified by automated tests.

What that costs concretely: nothing catches a regression in `ibanValid`'s checksum
arithmetic, in the hero rule's precedence (particularly that an expired default
keeps the hero slot), or in `maskIban`'s output — the three places this feature
has real logic. Every one of them was covered by tests in the equivalent super-app
work.

The mitigations available are weak but worth taking:
- `ibanValid` is ported unchanged from super-app's `utils/card/iban.ts`, where it
  **is** unit-tested. Porting rather than rewriting is what keeps it trustworthy.
- The same is true of the hero rule, ported from super-app's `partitionTokens`.
- The browser walkthrough is the only end-to-end check, so it is mandatory here in
  a way it was optional there.

If unit coverage is wanted later, the honest fix is infrastructure: add a test
runner to a web-app-owned package. That is out of scope for this feature.

- **`iban.test.ts`** — mod-97 acceptance and rejection (including a valid IBAN with
  one digit altered), normalisation of spacing and case, length bounds, `maskIban`
  keeping the country prefix and last four, `formatIban` grouping in fours.
- **`partition-tokens.test.ts`** — empty list; a single token; the default winning
  from a non-first position; **an expired default still winning**; the first
  non-expired winning when nothing is default, with more than one non-expired
  candidate so the test actually pins *first*; all-expired falling back to the
  first; `others` preserving input order; a bank list where nothing is expired.
- **`bank-account-preview.test.tsx`** — renders bank name, masked IBAN and account
  holder; falls back for a missing holder; renders a caller-supplied action
  cluster.

## Verification

- `pnpm --filter ssr run init`, then `pnpm --filter ssr type-check` and
  `pnpm --filter ssr lint`
- `pnpm i18n:missing` and `pnpm i18n:unused --app=ssr`
- The browser walkthrough — with no unit tests, this is not optional

**The `init` script lives on `apps/ssr`, not the workspace root**, and it needs a
`.env` supplying `GATEWAY_URL` or it exits 1. Note also that `pnpm init` is a
built-in pnpm command that does something else entirely — always write
`pnpm --filter ssr run init`.

**Baseline, measured on `origin/main` (dfd2ed442) in a fresh worktree:**
`type-check` reports **one** pre-existing error — a missing module declaration for
an SVG import in `src/components/global/logo.tsx` — and `lint` is **clean, exit 0**.
Gate on "no worse than that", not on zero.

**A fresh worktree needs setup git does not do for you.** `packages/ayasofyazilim-ui`
and `packages/utils` are submodules, so `git submodule update --init --recursive`
must run before `pnpm install` can even resolve the workspace — without it the
install fails with `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND`. And `apps/ssr/.env`,
`apps/ssr/src/language-data/i18n/*.gen.json` and
`packages/utils/policies/policies.json` are all gitignored, so they must be copied
from a working checkout; without them `type-check` fails on unresolved imports for
reasons unrelated to any change.

## What is not covered

Stated plainly rather than implied away:

- **The app-layer wiring has no automated coverage.** Two sections, hero-vs-rows,
  the responsive collapse, and the add-bank dialog's submit path all live in
  `apps/ssr`, which has no unit-test runner. Only Playwright can reach them, and
  an e2e test is out of scope for the first pass. Typecheck and lint are the only
  mechanical gates on that layer.
- **Nothing here is verified in a browser** unless someone runs the page. The
  `md` breakpoint behaviour, the single-item collapse and the slab proportion are
  design intent, not tested facts.

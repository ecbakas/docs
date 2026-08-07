# SSR Payout Methods: Bank Accounts + Hero and Rows — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let travellers add bank accounts on the web payout-methods page, and present cards and bank accounts as two sections where each shows a prominent hero for its default plus compact rows for the rest.

**Architecture:** Everything lives in `apps/ssr`. Two pure modules (IBAN helpers, a hero-selection rule), a presentational bank hero panel, one shared on-face action cluster used by both heroes, two row components, a new add-bank dialog, and one new server action wrapping an endpoint the SDK already has.

**Tech Stack:** Next.js App Router (SSR app), React 19, TypeScript, Tailwind v4 with container queries, `@repo/ayasofyazilim-ui` component package (read-only — see below), pnpm workspaces.

**Spec:** `c:/unirefund/docs/superpowers/specs/2026-08-07-ssr-payout-methods-hero-and-rows-design.md`

## Global Constraints

- **`packages/ayasofyazilim-ui` and `packages/utils` are git submodules — separate repositories.** Import from them freely (`Button`, `CreditCardPreview`, `cn`, `CardBrandIcon`); **never add files to them and never commit inside them.** Everything this plan creates goes in `apps/ssr`.
- **This feature ships with no unit tests.** No package in web-app that we may write to has a test runner. Do not add one, and do not write test files — there is nothing to run them. Verification is typecheck, lint, the i18n scripts and a browser walkthrough.
- **Never call SDK clients from app code.** All API calls go through server actions in `@repo/actions`. In `post-actions.ts` the pattern is `structuredResponse` on success and **`return structuredError(error)`** in catch — only `actions.ts` (GET) throws.
- **Never hardcode user-visible strings.** Every string is a key in **both** `en.json` and `tr.json` under `apps/ssr/src/language-data/unirefund/SSRService/resources/`, read via `useTranslations()` in client components. **Never edit anything under `apps/ssr/src/language-data/i18n/`** — it is generated.
- **The i18n generator is `pnpm --filter ssr run init`.** It lives on `apps/ssr`, not the workspace root, and needs a `.env` with `GATEWAY_URL` or it exits 1. Beware: bare `pnpm init` is a built-in pnpm command that does something else entirely. `tsc` does not see a new key until the bundle is regenerated.
- **`data-testid` is mandatory** on `Button`, `Input`, `Label`, `Link`, `Checkbox`, `Switch`, `SelectTrigger`, `PopoverTrigger`, `DialogTrigger`, `TabsTrigger` and the rest listed in `.claude/rules/data-testid.md`; the `react-require-testid` ESLint rule fails the build otherwise. Kebab-case, feature-prefixed (`add-bank-iban-input`); list rows take a unique suffix: `` data-testid={`bank-row-delete-${token.id}`} ``.
- **No new UI dependencies.** Build only from `@repo/ayasofyazilim-ui/components/*` and `@repo/ayasofyazilim-ui/custom/*`.
- **No `useEffect` for derived state.** Use `useMemo`; use event handlers for event-driven updates.
- **Baseline, measured on `origin/main` (dfd2ed442) in a fresh worktree:** `pnpm --filter ssr type-check` reports **exactly one** pre-existing error — `src/components/global/logo.tsx(6,27): error TS2307: Cannot find module '../../../public/unirefund.svg'` — and `pnpm --filter ssr lint` is **clean, exit 0**. Gate on "no worse than that". Never claim "type-check passes" without noting that one.
- **Wallet tokens are filtered out** of the page entirely. Only `type === "Card"` and `type === "Bank"` render.

---

### Task 0: Prepare the workspace

**Files:** none modified.

**Interfaces:**
- Consumes: nothing.
- Produces: a buildable worktree and a confirmed baseline.

A fresh worktree does **not** build without these steps. Git does not populate submodules into worktrees, and several required files are gitignored.

- [ ] **Step 1: Populate the submodules**

```bash
git submodule update --init --recursive
```

Without this, `packages/ayasofyazilim-ui` and `packages/utils` are empty directories and `pnpm install` fails with `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND` for `@repo/ayasofyazilim-ui`.

- [ ] **Step 2: Install**

```bash
pnpm install
```

- [ ] **Step 3: Copy the gitignored artifacts from a working checkout**

`apps/ssr/.env`, the generated i18n bundles and the generated policies file are all gitignored. `pnpm --filter ssr run init` cannot regenerate the bundles without `GATEWAY_URL` from that `.env`, so copy all three from `c:/unirefund/web-app`:

```bash
cp c:/unirefund/web-app/apps/ssr/.env apps/ssr/.env
mkdir -p apps/ssr/src/language-data/i18n
cp c:/unirefund/web-app/apps/ssr/src/language-data/i18n/*.gen.json apps/ssr/src/language-data/i18n/
cp c:/unirefund/web-app/packages/utils/policies/policies.json packages/utils/policies/policies.json
```

Then confirm `git status --short` is empty — all three are ignored and must never reach a commit.

- [ ] **Step 4: Confirm the baseline**

```bash
pnpm --filter ssr type-check 2>&1 | tail -6
pnpm --filter ssr lint > /dev/null 2>&1 && echo "lint clean" || echo "lint has findings"
```

Expected: type-check reports exactly the one `logo.tsx` SVG error; lint prints `lint clean`. **If either differs, stop and report** — the branch point is not what this plan was written against.

---

### Task 1: IBAN helpers

**Files:**
- Create: `apps/ssr/src/utils/utils-iban.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, all exported from `@/utils/utils-iban`:
  - `normalizeIban(raw: string): string`
  - `ibanValid(raw: string): boolean`
  - `formatIban(raw: string): string`
  - `maskIban(raw: string): string`
  - `ibanCountryCode(raw: string): string`

  `maskIban` is used by Tasks 3 and 7; `ibanValid`, `normalizeIban` and `ibanCountryCode` by Task 8.

The filename follows the folder's existing `utils-<domain>.ts` convention (`utils-date.ts`, `utils-number.ts`).

**These are ported verbatim from super-app's `src/utils/card/iban.ts`, where they are unit-tested.** That is deliberate and it is the only thing making them trustworthy here, since this repo cannot run tests. Do not "improve" the implementations — port them.

- [ ] **Step 1: Write the module**

```ts
/**
 * IBAN normalisation, formatting and ISO 13616 mod-97 validation.
 *
 * Ported unchanged from the super-app client, where this module is unit-tested,
 * so both clients agree on what a valid IBAN is. web-app has no test runner, so
 * porting rather than rewriting is what keeps this correct.
 */

const IBAN_PATTERN = /^[A-Z]{2}\d{2}[A-Z0-9]+$/;
const MIN_LENGTH = 15;
const MAX_LENGTH = 34;

export function normalizeIban(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/**
 * Mod-97 per ISO 13616: move the first four characters to the end, map letters
 * to numbers (A=10 … Z=35), and require the result mod 97 to equal 1. Computed
 * in chunks because the expanded value overflows Number.
 */
export function ibanValid(raw: string): boolean {
  const iban = normalizeIban(raw);
  if (iban.length < MIN_LENGTH || iban.length > MAX_LENGTH) return false;
  if (!IBAN_PATTERN.test(iban)) return false;

  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const expanded = rearranged.replace(/[A-Z]/g, (char) =>
    String(char.charCodeAt(0) - 55)
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

/** Country prefix + last four, middle masked. For rows and the hero panel. */
export function maskIban(raw: string): string {
  const iban = normalizeIban(raw);
  if (iban.length <= 8) return iban;
  return `${iban.slice(0, 4)} •••• ${iban.slice(-4)}`;
}

/**
 * The ISO-3166 alpha-2 country code an IBAN carries in its first two characters
 * (ISO 13616). Lets the add-bank dialog derive the country instead of asking for
 * it, which makes a mismatch between the two impossible. Empty when there is
 * nothing to read - callers validate the IBAN first.
 */
export function ibanCountryCode(raw: string): string {
  const iban = normalizeIban(raw);
  return iban.length >= 2 ? iban.slice(0, 2) : "";
}
```

- [ ] **Step 2: Sanity-check the mod-97 implementation by hand**

There is no test runner, so verify it once in a REPL before trusting it:

```bash
cd apps/ssr && npx tsx -e "import {ibanValid,maskIban,ibanCountryCode} from './src/utils/utils-iban.ts'; console.log(ibanValid('DE89370400440532013000'), ibanValid('GB82WEST12345698765432'), ibanValid('TR330006100519786457841326'), ibanValid('DE89370400440532013001'), ibanValid('DE89'), maskIban('TR330006100519786457841326'), ibanCountryCode(' tr33 0006 '));"
```

Expected output exactly: `true true true false false TR33 •••• 1326 TR`

The fourth value is the important one — it is a valid IBAN with one digit changed, and a `return true` stub would pass every other case. **Paste this output verbatim into your report.**

- [ ] **Step 3: Verify**

```bash
pnpm --filter ssr type-check 2>&1 | tail -4
```
Expected: only the known `logo.tsx` error.

- [ ] **Step 4: Commit**

```bash
git add apps/ssr/src/utils/utils-iban.ts
git commit -m "feat(ssr): add IBAN validation, formatting and masking helpers"
```

---

### Task 2: Hero-selection rule

**Files:**
- Create: `apps/ssr/src/app/[lang]/(main)/account/cards/partition-tokens.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, from `./partition-tokens` (relative to the cards folder):
  - `interface PartitionableToken { id: string; isDefault: boolean; isExpired: boolean }`
  - `interface TokenPartition<T> { hero: T | null; others: T[] }`
  - `partitionTokens<T extends PartitionableToken>(tokens: T[]): TokenPartition<T>`

  Used by Task 9. The generic lets the caller pass full SDK DTOs and get them back unchanged.

Colocated with its only consumer rather than in a shared package: this is one page's business logic, not a reusable primitive. A plain `.ts` file in a route folder is fine — Next.js only treats `page`/`layout`/`route` specially.

**Ported from super-app's `partitionTokens`, where it is unit-tested.**

- [ ] **Step 1: Write the module**

```ts
/** The only fields the hero rule reads. Callers may pass richer objects. */
export interface PartitionableToken {
  id: string;
  isDefault: boolean;
  isExpired: boolean;
}

export interface TokenPartition<T> {
  hero: T | null;
  others: T[];
}

/**
 * Split a payout-token list into the one that earns the prominent hero slot and
 * the rest, which render as compact rows.
 *
 * The hero is the default token, else the first usable one, else simply the
 * first - so a non-empty list always yields exactly one hero and a section never
 * has a state with neither a hero nor an empty state.
 *
 * An expired default deliberately keeps the slot: an expired card is rejected at
 * refund time, so a traveller whose default has expired needs to see that at the
 * top rather than buried in the rows.
 *
 * Bank tokens need no special case - the API leaves `isExpired` false for them,
 * so the second rule lands on the first account on its own.
 *
 * Ported from the super-app client, where this rule is unit-tested.
 */
export function partitionTokens<T extends PartitionableToken>(
  tokens: T[]
): TokenPartition<T> {
  const hero =
    tokens.find((t) => t.isDefault) ??
    tokens.find((t) => !t.isExpired) ??
    tokens[0];

  if (!hero) return { hero: null, others: [] };

  // By reference, not by id: two distinct objects sharing an id would otherwise
  // both be dropped, breaking "input minus exactly one hero".
  return { hero, others: tokens.filter((t) => t !== hero) };
}
```

- [ ] **Step 2: Sanity-check the precedence by hand**

```bash
cd apps/ssr && npx tsx -e "import {partitionTokens as p} from './src/app/[lang]/(main)/account/cards/partition-tokens.ts'; const t=(id,o={})=>({id,isDefault:false,isExpired:false,...o}); const expired=t('a',{isExpired:true}), usable=t('b'), also=t('c'); console.log(p([]).hero, p([t('x',{isDefault:true,isExpired:true}),t('y')]).hero.id, p([expired,usable,also]).hero.id, p([expired,usable,also]).others.map(o=>o.id).join(','));"
```

Expected output exactly: `null x b a,c`

Reading those: an empty list has no hero; an **expired default still wins** (`x`); with nothing default the **first usable** wins (`b`, not `c` — this is what a `findLast` regression would get wrong); and `others` keeps input order minus the hero. **Paste this output verbatim into your report.**

- [ ] **Step 3: Verify**

```bash
pnpm --filter ssr type-check 2>&1 | tail -4
```
Expected: only the known `logo.tsx` error.

- [ ] **Step 4: Commit**

```bash
git add "apps/ssr/src/app/[lang]/(main)/account/cards/partition-tokens.ts"
git commit -m "feat(ssr): add partitionTokens hero-selection rule"
```

---

### Task 3: `BankAccountPreview`

**Files:**
- Create: `apps/ssr/src/app/[lang]/(main)/account/cards/_components/bank-account-preview.tsx`

**Interfaces:**
- Consumes: `maskIban` from Task 1.
- Produces, from `./bank-account-preview`:
  - `interface BankAccountPreviewLabels { accountHolderLabel?: string }`
  - `BankAccountPreview({ bankName?, iban?, holderName?, labels?, children?, className? })`

  Used by Task 9.

**Read `packages/ayasofyazilim-ui/src/custom/credit-card-preview.tsx` first.** This mirrors its contract: presentational only, no notion of defaults or deletion; formats its own raw value; takes display strings via `labels`; composes its action cluster through `children`; sizes off its own width with `@container` rather than the viewport.

It lives in the app rather than beside `CreditCardPreview` because that package is a separate repository we are not contributing to.

The deliberate difference is the ratio. The card face uses `aspect-8560/5398` (ISO ID-1, ≈1.586). This uses `aspect-[2.6]` — at the shared `w-72` hero width, ~111px tall against the card's ~182px. A bank account's whole content is three short strings; a credit-card ratio to hold them reads as empty.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import { Landmark } from "lucide-react";
import type { ReactNode } from "react";
import { maskIban } from "@/utils/utils-iban";

export interface BankAccountPreviewLabels {
  accountHolderLabel?: string;
}

export interface BankAccountPreviewProps {
  /** Display name for the account - bank name, or whatever the caller picks. */
  bankName?: string;
  /** The stored IBAN; masked here for display. */
  iban?: string;
  holderName?: string;
  labels?: BankAccountPreviewLabels;
  /** Rendered in the top-right cluster - nickname, default indicator, delete.
   * Fully composed by the caller; this component only lays it out. */
  children?: ReactNode;
  className?: string;
}

/**
 * A saved bank account's hero panel: bank mark and name, masked IBAN, account
 * holder. Purely presentational - it has no notion of defaults or deletion, and
 * callers compose the action cluster through `children`.
 *
 * Built to the same contract as `CreditCardPreview` but at `aspect-[2.6]` rather
 * than the ISO card ratio: a bank account's whole content is three short strings,
 * and a credit-card ratio to hold them reads as empty. The symmetry comes from
 * shared vocabulary - same width, radius, dark face, on-face cluster - not from
 * identical height.
 */
export function BankAccountPreview({
  bankName,
  iban,
  holderName,
  labels,
  children,
  className,
}: BankAccountPreviewProps) {
  return (
    <div className={cn("@container w-full", className)}>
      <div
        className={cn(
          "relative aspect-[2.6] w-full overflow-hidden rounded-xl p-3 text-white shadow-lg @xs:rounded-2xl @xs:p-4",
          "bg-linear-to-br from-slate-800 via-slate-700 to-slate-800"
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-1/2 -right-1/4 size-[140%] rounded-full bg-white/5 blur-2xl"
        />
        <div className="relative flex h-full flex-col justify-between">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden
                className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/15"
              >
                <Landmark className="size-4" />
              </span>
              <p className="truncate text-sm font-semibold @xs:text-base">
                {bankName || "-"}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1">
              {children}
            </div>
          </div>

          <p className="truncate font-mono text-sm tracking-widest text-white/90 @xs:text-base">
            {iban ? maskIban(iban) : ""}
          </p>

          <div className="min-w-0">
            <p className="text-[7px] tracking-wide text-white/50 uppercase @xs:text-[8px]">
              {labels?.accountHolderLabel ?? "Account holder"}
            </p>
            <p className="truncate text-xs font-medium tracking-wide uppercase">
              {holderName || "-"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

```bash
pnpm --filter ssr type-check 2>&1 | tail -4
pnpm --filter ssr lint > /dev/null 2>&1 && echo "lint clean" || pnpm --filter ssr lint 2>&1 | tail -10
```
Expected: only the known `logo.tsx` error; lint clean.

- [ ] **Step 3: Commit**

```bash
git add "apps/ssr/src/app/[lang]/(main)/account/cards/_components/bank-account-preview.tsx"
git commit -m "feat(ssr): add BankAccountPreview hero panel"
```

---

### Task 4: Bank-token server action

**Files:**
- Modify: `packages/actions/unirefund/RefundService/post-actions.ts` (append after `postTravellerCardsApi`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `postTravellerBankTokenApi(data, session?)`. Used by Task 8.

`packages/actions` is a normal web-app package, not a submodule — editing it is fine. **Do not edit `packages/saas/**`; it is generated.** The endpoint and DTO already exist there.

- [ ] **Step 1: Read the neighbouring action**

Open the file and read `postTravellerCardsApi`. Yours mirrors it exactly: resolve the client, call the endpoint with `requestBody`, `structuredResponse` on success, **`return`** `structuredError(error)` in catch.

- [ ] **Step 2: Add the type import**

Add `PostApiRefundServiceTravellerCardsBankData` to the existing type import from `@repo/saas/RefundService`, keeping the file's import style.

- [ ] **Step 3: Write the action**

Append directly below `postTravellerCardsApi`:

```ts
/**
 * Saves a bank account as a payout token. Bank details are not PCI, so the
 * IBAN/BIC/bank name/country are stored on the token directly - no vaulting.
 * Saving the same IBAN twice returns the existing token rather than duplicating.
 */
export async function postTravellerBankTokenApi(
  data: PostApiRefundServiceTravellerCardsBankData["requestBody"],
  session?: Session
) {
  try {
    const client = await getRefundServiceClient(session);
    const response =
      await client.travellerCard.postApiRefundServiceTravellerCardsBank({
        requestBody: data,
      });
    return structuredResponse(response);
  } catch (error) {
    return structuredError(error);
  }
}
```

- [ ] **Step 4: Verify**

```bash
pnpm --filter ssr type-check 2>&1 | tail -4
```
Expected: only the known `logo.tsx` error. (`ssr` compiles the action through its import graph once Task 8 imports it; until then this confirms nothing broke.)

- [ ] **Step 5: Commit**

```bash
git add packages/actions/unirefund/RefundService/post-actions.ts
git commit -m "feat(actions): add postTravellerBankTokenApi"
```

---

### Task 5: Localization keys

**Files:**
- Modify: `apps/ssr/src/language-data/unirefund/SSRService/resources/en.json`
- Modify: `apps/ssr/src/language-data/unirefund/SSRService/resources/tr.json`

**Interfaces:**
- Consumes: nothing.
- Produces: the `Account.Banks.*` keys every later app task reads.

This comes before the UI tasks because `tsc` rejects `t.SSRService["Account.Banks.Title"]` until the generated bundle contains it.

- [ ] **Step 1: Add the English keys**

Add to `en.json`, matching the file's existing formatting:

```json
"Account.Banks.Title": "Bank accounts",
"Account.Banks.Description": "Manage the bank accounts saved to your account",
"Account.Banks.AddBank": "Add bank account",
"Account.Banks.AddBankTitle": "Add a bank account",
"Account.Banks.AddBankDescription": "Save a bank account to receive refunds by transfer.",
"Account.Banks.NoBanks": "No bank accounts saved",
"Account.Banks.NoBanksDescription": "Add a bank account to receive refunds by transfer.",
"Account.Banks.IbanLabel": "IBAN",
"Account.Banks.IbanPlaceholder": "DE89 3704 0044 0532 0130 00",
"Account.Banks.BicLabel": "BIC / SWIFT",
"Account.Banks.BicPlaceholder": "Optional",
"Account.Banks.BankNameLabel": "Bank name",
"Account.Banks.BankNamePlaceholder": "Optional",
"Account.Banks.AccountHolderLabel": "Account holder",
"Account.Banks.AccountHolderPlaceholder": "Name on the account",
"Account.Banks.InvalidIban": "Enter a valid IBAN",
"Account.Banks.AddSuccess": "Bank account added successfully",
"Account.Banks.DeleteTitle": "Delete this bank account?",
"Account.Banks.DeleteDescription": "This bank account will be permanently removed from your account.",
"Account.Banks.EditNicknameTitle": "Edit account nickname",
"Account.Banks.EditNicknameDescription": "Give this bank account a label to recognize it easily.",
```

There is no bank-country key: the dialog derives the country from the IBAN.

- [ ] **Step 2: Add the Turkish keys**

Add the same keys to `tr.json`:

```json
"Account.Banks.Title": "Banka hesapları",
"Account.Banks.Description": "Hesabınıza kayıtlı banka hesaplarını yönetin",
"Account.Banks.AddBank": "Banka hesabı ekle",
"Account.Banks.AddBankTitle": "Yeni banka hesabı ekle",
"Account.Banks.AddBankDescription": "İadelerinizi havale ile almak için bir banka hesabı kaydedin.",
"Account.Banks.NoBanks": "Kayıtlı banka hesabı yok",
"Account.Banks.NoBanksDescription": "İadelerinizi havale ile almak için bir banka hesabı ekleyin.",
"Account.Banks.IbanLabel": "IBAN",
"Account.Banks.IbanPlaceholder": "TR33 0006 1005 1978 6457 8413 26",
"Account.Banks.BicLabel": "BIC / SWIFT",
"Account.Banks.BicPlaceholder": "İsteğe bağlı",
"Account.Banks.BankNameLabel": "Banka adı",
"Account.Banks.BankNamePlaceholder": "İsteğe bağlı",
"Account.Banks.AccountHolderLabel": "Hesap sahibi",
"Account.Banks.AccountHolderPlaceholder": "Hesaptaki ad",
"Account.Banks.InvalidIban": "Geçerli bir IBAN girin",
"Account.Banks.AddSuccess": "Banka hesabı eklendi",
"Account.Banks.DeleteTitle": "Bu banka hesabı silinsin mi?",
"Account.Banks.DeleteDescription": "Bu banka hesabı hesabınızdan kalıcı olarak kaldırılacak.",
"Account.Banks.EditNicknameTitle": "Hesap takma adını düzenle",
"Account.Banks.EditNicknameDescription": "Bu banka hesabına kolayca tanıyacağınız bir ad verin.",
```

- [ ] **Step 3: Regenerate and verify**

```bash
pnpm --filter ssr run init
grep -c "Account.Banks" apps/ssr/src/language-data/i18n/en.gen.json
grep -c "Account.Banks" apps/ssr/src/language-data/i18n/tr.gen.json
pnpm --filter ssr type-check 2>&1 | tail -4
```
Expected: **21** in each bundle; type-check shows only the known `logo.tsx` error.

If `init` fails with `GATEWAY_URL is not defined`, `apps/ssr/.env` is missing — revisit Task 0 Step 3.

`git status` must not show anything under `language-data/i18n/` — it is gitignored.

- [ ] **Step 4: Commit**

```bash
git add apps/ssr/src/language-data/unirefund/SSRService/resources/en.json apps/ssr/src/language-data/unirefund/SSRService/resources/tr.json
git commit -m "feat(i18n): add Account.Banks strings for the SSR payout methods page"
```

---

### Task 6: `TokenHeroActions`

**Files:**
- Create: `apps/ssr/src/app/[lang]/(main)/account/cards/_components/token-hero-actions.tsx`

**Interfaces:**
- Consumes: existing `Account.Cards.*` keys.
- Produces: `TokenHeroActions({ token, disabled, onRename, onSetDefault, onDelete })`. Used by Task 9 for **both** heroes.

This is the on-face cluster lifted out of today's `cards-view.tsx` — nickname, default state, expired badge, delete — so the card hero and the bank hero share one implementation. One component on purpose: in the equivalent mobile work, two twin components drifted apart because a fix applied to one was never carried to the other.

**Read `cards-view.tsx` lines 115-174 first** and carry the class strings across unchanged. This is a move, not a redesign.

- [ ] **Step 1: Write the component**

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import type { UniRefund_RefundService_TravellerCards_TravellerCardDto } from "@repo/saas/RefundService";
import { Star, Trash2 } from "lucide-react";

/**
 * The on-face action cluster both heroes carry: nickname, default state, expiry
 * badge, delete.
 *
 * One component serves the card hero and the bank hero. `isExpired` is a card
 * concept the API leaves false for bank tokens, so the expiry branches are inert
 * there and a bank hero renders nickname / default / delete.
 */
export function TokenHeroActions({
  token,
  disabled,
  onRename,
  onSetDefault,
  onDelete,
}: {
  token: UniRefund_RefundService_TravellerCards_TravellerCardDto;
  /** A mutation is in flight; no control may start another. */
  disabled: boolean;
  onRename: () => void;
  onSetDefault: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslations();

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={onRename}
        disabled={disabled}
        className="h-5 rounded-full bg-white/10 text-xs text-white hover:bg-white/20 hover:text-amber-300"
        data-testid={`token-hero-nickname-${token.id}`}
      >
        {token.nickname || t.SSRService["Account.Cards.NicknameLabel"]}
      </Button>

      {token.isDefault ? (
        <span
          className="inline-flex items-center justify-center rounded-full bg-white/15 p-1 backdrop-blur"
          title={t.SSRService["Account.Cards.Default"]}
        >
          <Star aria-hidden className="size-3 fill-amber-400 text-amber-400" />
        </span>
      ) : !token.isExpired ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onSetDefault}
          disabled={disabled}
          title={t.SSRService["Account.Cards.SetDefault"]}
          className="size-5 rounded-full bg-white/10 text-white hover:bg-white/20 hover:text-amber-300 @xs:size-6"
          data-testid={`token-hero-set-default-${token.id}`}
        >
          <Star className="size-3" />
        </Button>
      ) : null}

      {token.isExpired ? (
        <span className="flex h-5 items-center rounded-full bg-red-500 px-2 text-xs tracking-wide text-red-200 uppercase">
          {t.SSRService["Account.Cards.Expired"]}
        </span>
      ) : null}

      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onDelete}
        disabled={disabled}
        className="size-5 rounded-full bg-white/10 text-white hover:bg-red-500/30 hover:text-white @xs:size-6"
        data-testid={`token-hero-delete-${token.id}`}
      >
        <Trash2 className="size-3" />
      </Button>
    </>
  );
}
```

- [ ] **Step 2: Verify**

```bash
pnpm --filter ssr type-check 2>&1 | tail -4
pnpm --filter ssr lint > /dev/null 2>&1 && echo "lint clean" || pnpm --filter ssr lint 2>&1 | tail -10
```
Expected: only the known `logo.tsx` error; lint clean. The component is not used yet — Task 9 wires it in, as it does for Tasks 3 and 7.

- [ ] **Step 3: Commit**

```bash
git add "apps/ssr/src/app/[lang]/(main)/account/cards/_components/token-hero-actions.tsx"
git commit -m "feat(ssr): add shared TokenHeroActions cluster"
```

---

### Task 7: `CardRow` and `BankRow`

**Files:**
- Create: `apps/ssr/src/app/[lang]/(main)/account/cards/_components/card-row.tsx`
- Create: `apps/ssr/src/app/[lang]/(main)/account/cards/_components/bank-row.tsx`

**Interfaces:**
- Consumes: `maskIban` from Task 1; `CardBrandIcon`/`getCardBrand` from `@repo/ayasofyazilim-ui/components/card-brand-icon`.
- Produces, both with the same prop shape so the two sections read as one page:
  - `CardRow({ token, disabled, onRename, onSetDefault, onDelete })`
  - `BankRow({ token, disabled, onRename, onSetDefault, onDelete })`

Both keep a `Default` badge branch even though `partitionTokens` should lift any default into the hero. It uses `find`, which takes the first match, so if the API ever returned two tokens of one type both flagged default, the second renders here — and offering "set as default" on a token that already holds it would mislead. Both twins degrade the same way.

- [ ] **Step 1: Write `CardRow`**

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import {
  CardBrandIcon,
  getCardBrand,
} from "@repo/ayasofyazilim-ui/components/card-brand-icon";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import type { UniRefund_RefundService_TravellerCards_TravellerCardDto } from "@repo/saas/RefundService";
import { Star, Trash2 } from "lucide-react";

/**
 * One saved card that is not the hero. Twin of `BankRow` - same prop contract,
 * same layout - because the two render in adjacent sections of one page.
 */
export function CardRow({
  token,
  disabled,
  onRename,
  onSetDefault,
  onDelete,
}: {
  token: UniRefund_RefundService_TravellerCards_TravellerCardDto;
  disabled: boolean;
  onRename: () => void;
  onSetDefault: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslations();
  const masked = `•••• ${token.maskedNumber.slice(-4)}`;
  const expiry = `${String(token.expiryMonth).padStart(2, "0")}/${String(
    token.expiryYear
  ).slice(-2)}`;

  return (
    <div
      className={cn(
        "bg-card flex items-center gap-3 rounded-lg border p-3",
        token.isExpired && "opacity-60"
      )}
    >
      <CardBrandIcon
        brand={getCardBrand(token.maskedNumber)}
        className="size-8 shrink-0"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="link"
            onClick={onRename}
            disabled={disabled}
            className="h-auto truncate p-0 text-sm font-medium"
            data-testid={`card-row-nickname-${token.id}`}
          >
            {token.nickname || masked}
          </Button>
          {token.isExpired ? (
            <span className="rounded-full bg-red-100 px-2 text-[10px] font-semibold tracking-wide text-red-700 uppercase">
              {t.SSRService["Account.Cards.Expired"]}
            </span>
          ) : null}
        </div>
        {/* Without a nickname the last four is already the title above, so
            repeating it here would print the same digits twice. */}
        <p className="text-muted-foreground truncate font-mono text-xs">
          {token.nickname ? `${masked} · ${expiry}` : expiry}
        </p>
      </div>

      {token.isDefault ? (
        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold tracking-wide text-amber-700 uppercase">
          {t.SSRService["Account.Cards.Default"]}
        </span>
      ) : !token.isExpired ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onSetDefault}
          disabled={disabled}
          title={t.SSRService["Account.Cards.SetDefault"]}
          data-testid={`card-row-set-default-${token.id}`}
        >
          <Star className="size-4" />
        </Button>
      ) : null}

      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onDelete}
        disabled={disabled}
        title={t.SSRService["Account.Cards.Delete"]}
        data-testid={`card-row-delete-${token.id}`}
      >
        <Trash2 className="text-destructive size-4" />
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Write `BankRow`**

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import type { UniRefund_RefundService_TravellerCards_TravellerCardDto } from "@repo/saas/RefundService";
import { Landmark, Star, Trash2 } from "lucide-react";
import { maskIban } from "@/utils/utils-iban";

/**
 * One saved bank account that is not the hero. Twin of `CardRow`.
 *
 * No expiry branch: `isExpired` is a card concept the API leaves false for bank
 * tokens. The default badge is kept for the same reason `CardRow` keeps it.
 */
export function BankRow({
  token,
  disabled,
  onRename,
  onSetDefault,
  onDelete,
}: {
  token: UniRefund_RefundService_TravellerCards_TravellerCardDto;
  disabled: boolean;
  onRename: () => void;
  onSetDefault: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslations();

  return (
    <div className="bg-card flex items-center gap-3 rounded-lg border p-3">
      <span
        aria-hidden
        className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full"
      >
        <Landmark className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        <Button
          type="button"
          variant="link"
          onClick={onRename}
          disabled={disabled}
          className="h-auto truncate p-0 text-sm font-medium"
          data-testid={`bank-row-nickname-${token.id}`}
        >
          {token.nickname ||
            token.bankName ||
            t.SSRService["Account.Banks.Title"]}
        </Button>
        <p className="text-muted-foreground truncate font-mono text-xs">
          {maskIban(token.maskedNumber)}
        </p>
      </div>

      {token.isDefault ? (
        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold tracking-wide text-amber-700 uppercase">
          {t.SSRService["Account.Cards.Default"]}
        </span>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onSetDefault}
          disabled={disabled}
          title={t.SSRService["Account.Cards.SetDefault"]}
          data-testid={`bank-row-set-default-${token.id}`}
        >
          <Star className="size-4" />
        </Button>
      )}

      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onDelete}
        disabled={disabled}
        title={t.SSRService["Account.Cards.Delete"]}
        data-testid={`bank-row-delete-${token.id}`}
      >
        <Trash2 className="text-destructive size-4" />
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

```bash
pnpm --filter ssr type-check 2>&1 | tail -4
pnpm --filter ssr lint > /dev/null 2>&1 && echo "lint clean" || pnpm --filter ssr lint 2>&1 | tail -10
```
Expected: only the known `logo.tsx` error; lint clean.

- [ ] **Step 4: Commit**

```bash
git add "apps/ssr/src/app/[lang]/(main)/account/cards/_components/card-row.tsx" "apps/ssr/src/app/[lang]/(main)/account/cards/_components/bank-row.tsx"
git commit -m "feat(ssr): add CardRow and BankRow compact rows"
```

---

### Task 8: Add-bank dialog

**Files:**
- Create: `apps/ssr/src/app/[lang]/(main)/account/cards/_components/add-bank-dialog.tsx`

**Interfaces:**
- Consumes: `ibanValid`, `normalizeIban`, `ibanCountryCode` from Task 1; `postTravellerBankTokenApi` from Task 4; `Account.Banks.*` from Task 5.
- Produces: `AddBankDialog({ travellerId })`. Used by Task 9.

**Read `add-card-dialog.tsx` first.** This mirrors its skeleton: `Dialog` + `DialogTrigger`, a form, client-side validation that toasts before hitting the network, then `startTransition` → post → success toast → close → `router.refresh()`. No scanner — that is card-specific.

**There is deliberately no bank-country field.** `bankCountryCode` is derived with `ibanCountryCode(iban)`: an IBAN's first two characters are its ISO-3166 alpha-2 code by definition, so a separate field could only ever contradict it. The monorepo also has no country-code picker — `CountrySelector` looks like one but is a language/culture switcher (items carry `cultureName`/`twoLetterISOLanguageName`, it is uncontrolled, and its `countries` prop defaults to `[]`). Do not use it here.

- [ ] **Step 1: Write the dialog**

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { postTravellerBankTokenApi } from "@repo/actions/unirefund/RefundService/post-actions";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ayasofyazilim-ui/components/dialog";
import { Input } from "@repo/ayasofyazilim-ui/components/input";
import { Label } from "@repo/ayasofyazilim-ui/components/label";
import { toast } from "@repo/ayasofyazilim-ui/components/sonner";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ibanCountryCode, ibanValid, normalizeIban } from "@/utils/utils-iban";

export function AddBankDialog({ travellerId }: { travellerId: string }) {
  const { t } = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [iban, setIban] = useState("");
  const [bic, setBic] = useState("");
  const [bankName, setBankName] = useState("");
  const [holderName, setHolderName] = useState("");
  const [nickname, setNickname] = useState("");

  function reset() {
    setIban("");
    setBic("");
    setBankName("");
    setHolderName("");
    setNickname("");
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Validated before the network call, the same way the card dialog gates on
    // luhnValid - a bad IBAN should not cost a round trip.
    if (!ibanValid(iban)) {
      toast.error(t.SSRService["Account.Banks.InvalidIban"]);
      return;
    }
    startTransition(() => {
      void postTravellerBankTokenApi({
        travellerId,
        iban: normalizeIban(iban),
        bic: bic.trim() || undefined,
        bankName: bankName.trim() || undefined,
        // Derived, never asked for: an IBAN's first two characters ARE its
        // ISO-3166 alpha-2 country code. `ibanValid` has passed, so this is
        // two letters. The cast is only because the DTO types the field as a
        // 250-member string-literal union.
        bankCountryCode: ibanCountryCode(iban) as "TR",
        holderName: holderName.trim() || undefined,
        nickname: nickname.trim() || undefined,
      }).then((res) => {
        if (res.type === "success") {
          toast.success(t.SSRService["Account.Banks.AddSuccess"]);
          handleOpenChange(false);
          router.refresh();
        } else {
          toast.error(res.message);
        }
      });
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild data-testid="add-bank-trigger">
        <Button variant="outline" data-testid="add-bank-button">
          <Plus className="size-4" />
          {t.SSRService["Account.Banks.AddBank"]}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t.SSRService["Account.Banks.AddBankTitle"]}
          </DialogTitle>
          <DialogDescription>
            {t.SSRService["Account.Banks.AddBankDescription"]}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bank-iban" data-testid="add-bank-iban-label">
              {t.SSRService["Account.Banks.IbanLabel"]}
            </Label>
            <Input
              id="bank-iban"
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              placeholder={t.SSRService["Account.Banks.IbanPlaceholder"]}
              autoComplete="off"
              required
              data-testid="add-bank-iban-input"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bank-name" data-testid="add-bank-name-label">
              {t.SSRService["Account.Banks.BankNameLabel"]}
            </Label>
            <Input
              id="bank-name"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder={t.SSRService["Account.Banks.BankNamePlaceholder"]}
              data-testid="add-bank-name-input"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bank-bic" data-testid="add-bank-bic-label">
              {t.SSRService["Account.Banks.BicLabel"]}
            </Label>
            <Input
              id="bank-bic"
              value={bic}
              onChange={(e) => setBic(e.target.value)}
              placeholder={t.SSRService["Account.Banks.BicPlaceholder"]}
              data-testid="add-bank-bic-input"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bank-holder" data-testid="add-bank-holder-label">
              {t.SSRService["Account.Banks.AccountHolderLabel"]}
            </Label>
            <Input
              id="bank-holder"
              value={holderName}
              onChange={(e) => setHolderName(e.target.value)}
              placeholder={
                t.SSRService["Account.Banks.AccountHolderPlaceholder"]
              }
              data-testid="add-bank-holder-input"
            />
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="bank-nickname"
              data-testid="add-bank-nickname-label"
            >
              {t.SSRService["Account.Cards.NicknameLabel"]}
            </Label>
            <Input
              id="bank-nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={t.SSRService["Account.Cards.NicknamePlaceholder"]}
              data-testid="add-bank-nickname-input"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => handleOpenChange(false)}
              data-testid="add-bank-cancel"
            >
              {t.SSRService["Account.Cards.Cancel"]}
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              data-testid="add-bank-submit"
            >
              {isPending
                ? t.SSRService["Account.Cards.Adding"]
                : t.SSRService["Account.Cards.Save"]}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify**

```bash
pnpm --filter ssr type-check 2>&1 | tail -4
pnpm --filter ssr lint > /dev/null 2>&1 && echo "lint clean" || pnpm --filter ssr lint 2>&1 | tail -10
```
Expected: only the known `logo.tsx` error; lint clean. If the `Label` component rejects `data-testid`, remove it from the labels only — per `.claude/rules/data-testid.md`, never cast or suppress the type error — and note it in your report.

- [ ] **Step 3: Commit**

```bash
git add "apps/ssr/src/app/[lang]/(main)/account/cards/_components/add-bank-dialog.tsx"
git commit -m "feat(ssr): add the add-bank-account dialog"
```

---

### Task 9: Rework the page into two sections

**Files:**
- Modify: `apps/ssr/.../account/cards/_components/cards-view.tsx` (full rewrite)
- Modify: `apps/ssr/.../account/cards/_components/delete-card-dialog.tsx` (optional copy props)
- Modify: `apps/ssr/.../account/cards/_components/edit-nickname-dialog.tsx` (optional copy props)

**Interfaces:**
- Consumes: everything from Tasks 1-8.
- Produces: the finished page.

This is the task that changes what a traveller sees.

- [ ] **Step 1: Give the two shared dialogs optional copy**

Both hard-code *card* wording, which reads wrong on a bank account ("This card will be permanently removed"). Add optional props defaulting to today's copy so existing call sites are untouched.

In `delete-card-dialog.tsx`:

```tsx
export function DeleteCardDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  /** Defaults to the card copy; the bank section passes its own. */
  title?: string;
  description?: string;
}) {
```

and in its JSX:

```tsx
<DialogTitle>
  {title ?? t.SSRService["Account.Cards.DeleteTitle"]}
</DialogTitle>
<DialogDescription>
  {description ?? t.SSRService["Account.Cards.DeleteDescription"]}
</DialogDescription>
```

Apply the identical pattern to `edit-nickname-dialog.tsx`, defaulting to `Account.Cards.EditNicknameTitle` and `Account.Cards.EditNicknameDescription`.

- [ ] **Step 2: Rewrite `cards-view.tsx`**

Replace the whole file:

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { deleteTravellerCardsByIdApi } from "@repo/actions/unirefund/RefundService/delete-actions";
import { postTravellerCardsByIdSetDefaultApi } from "@repo/actions/unirefund/RefundService/post-actions";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ayasofyazilim-ui/components/empty";
import { Separator } from "@repo/ayasofyazilim-ui/components/separator";
import { toast } from "@repo/ayasofyazilim-ui/components/sonner";
import { CreditCardPreview } from "@repo/ayasofyazilim-ui/custom/credit-card-preview";
import type { UniRefund_RefundService_TravellerCards_TravellerCardDto } from "@repo/saas/RefundService";
import { CreditCard, Landmark } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { partitionTokens } from "../partition-tokens";
import { AddBankDialog } from "./add-bank-dialog";
import { AddCardDialog } from "./add-card-dialog";
import { BankAccountPreview } from "./bank-account-preview";
import { BankRow } from "./bank-row";
import { CardRow } from "./card-row";
import { DeleteCardDialog } from "./delete-card-dialog";
import { EditNicknameDialog } from "./edit-nickname-dialog";
import { TokenHeroActions } from "./token-hero-actions";

type Token = UniRefund_RefundService_TravellerCards_TravellerCardDto;

export function CardsView({
  cards,
  travellerId,
}: {
  cards: Token[];
  travellerId: string;
}) {
  const { t } = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingToken, setEditingToken] = useState<Token | null>(null);
  const [deletingToken, setDeletingToken] = useState<Token | null>(null);

  // Wallet tokens are dropped: there is no add flow, and no display for them
  // that does not invent a chip, a brand and an expiry they do not have.
  const cardPartition = useMemo(
    () => partitionTokens(cards.filter((c) => c.type === "Card")),
    [cards]
  );
  const bankPartition = useMemo(
    () => partitionTokens(cards.filter((c) => c.type === "Bank")),
    [cards]
  );

  // Pulled into consts so TypeScript narrows them for the whole render below;
  // reading `partition.hero` inside a callback would not narrow.
  const heroCard = cardPartition.hero;
  const heroBank = bankPartition.hero;
  const disabled = isPending;

  function handleSetDefault(id: string) {
    if (isPending) return;
    startTransition(() => {
      void postTravellerCardsByIdSetDefaultApi(id).then((res) => {
        if (res.type === "success") {
          toast.success(t.SSRService["Account.Cards.SetDefaultSuccess"]);
          router.refresh();
        } else {
          toast.error(res.message);
        }
      });
    });
  }

  async function handleDelete(id: string) {
    const res = await deleteTravellerCardsByIdApi(id);
    if (res.type === "success") {
      toast.success(t.SSRService["Account.Cards.DeleteSuccess"]);
      router.refresh();
    } else {
      toast.error(res.message);
    }
  }

  const deletingIsBank = deletingToken?.type === "Bank";
  const editingIsBank = editingToken?.type === "Bank";

  return (
    <section className="w-full space-y-10">
      {/* ---------------- Cards ---------------- */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-2xl font-bold">
              {t.SSRService["Account.Cards.Title"]}
            </h2>
            <p className="text-muted-foreground text-base">
              {t.SSRService["Account.Cards.Description"]}
            </p>
          </div>
          <AddCardDialog travellerId={travellerId} />
        </div>
        <Separator />
        {!heroCard ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CreditCard />
              </EmptyMedia>
              <EmptyTitle>{t.SSRService["Account.Cards.NoCards"]}</EmptyTitle>
              <EmptyDescription>
                {t.SSRService["Account.Cards.NoCardsDescription"]}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-4 md:flex-row">
            <CreditCardPreview
              className="w-full shrink-0 md:w-72"
              number={heroCard.maskedNumber}
              holderName={heroCard.holderName ?? undefined}
              expiry={`${String(heroCard.expiryMonth).padStart(2, "0")}/${String(heroCard.expiryYear).slice(-2)}`}
              isExpired={heroCard.isExpired}
              labels={{
                holderNameLabel: t.SSRService["Account.Cards.HolderNameLabel"],
                expiryLabel: t.SSRService["Account.Cards.Expiry"],
              }}
            >
              <TokenHeroActions
                token={heroCard}
                disabled={disabled}
                onRename={() => setEditingToken(heroCard)}
                onSetDefault={() => handleSetDefault(heroCard.id)}
                onDelete={() => setDeletingToken(heroCard)}
              />
            </CreditCardPreview>

            {cardPartition.others.length > 0 && (
              <div className="flex flex-1 flex-col gap-2">
                {cardPartition.others.map((card) => (
                  <CardRow
                    key={card.id}
                    token={card}
                    disabled={disabled}
                    onRename={() => setEditingToken(card)}
                    onSetDefault={() => handleSetDefault(card.id)}
                    onDelete={() => setDeletingToken(card)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---------------- Bank accounts ---------------- */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-2xl font-bold">
              {t.SSRService["Account.Banks.Title"]}
            </h2>
            <p className="text-muted-foreground text-base">
              {t.SSRService["Account.Banks.Description"]}
            </p>
          </div>
          <AddBankDialog travellerId={travellerId} />
        </div>
        <Separator />
        {!heroBank ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Landmark />
              </EmptyMedia>
              <EmptyTitle>{t.SSRService["Account.Banks.NoBanks"]}</EmptyTitle>
              <EmptyDescription>
                {t.SSRService["Account.Banks.NoBanksDescription"]}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-4 md:flex-row">
            <BankAccountPreview
              className="w-full shrink-0 md:w-72"
              // Bank name first, unlike `BankRow`: the hero's cluster already
              // shows the nickname, so leading with it would print it twice.
              bankName={
                heroBank.bankName ||
                heroBank.nickname ||
                t.SSRService["Account.Banks.Title"]
              }
              iban={heroBank.maskedNumber}
              holderName={heroBank.holderName ?? undefined}
              labels={{
                accountHolderLabel:
                  t.SSRService["Account.Banks.AccountHolderLabel"],
              }}
            >
              <TokenHeroActions
                token={heroBank}
                disabled={disabled}
                onRename={() => setEditingToken(heroBank)}
                onSetDefault={() => handleSetDefault(heroBank.id)}
                onDelete={() => setDeletingToken(heroBank)}
              />
            </BankAccountPreview>

            {bankPartition.others.length > 0 && (
              <div className="flex flex-1 flex-col gap-2">
                {bankPartition.others.map((bank) => (
                  <BankRow
                    key={bank.id}
                    token={bank}
                    disabled={disabled}
                    onRename={() => setEditingToken(bank)}
                    onSetDefault={() => handleSetDefault(bank.id)}
                    onDelete={() => setDeletingToken(bank)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {editingToken && (
        <EditNicknameDialog
          card={editingToken}
          open={Boolean(editingToken)}
          title={
            editingIsBank
              ? t.SSRService["Account.Banks.EditNicknameTitle"]
              : undefined
          }
          description={
            editingIsBank
              ? t.SSRService["Account.Banks.EditNicknameDescription"]
              : undefined
          }
          onOpenChange={(open) => {
            if (!open) setEditingToken(null);
          }}
        />
      )}
      {deletingToken && (
        <DeleteCardDialog
          open={Boolean(deletingToken)}
          title={
            deletingIsBank
              ? t.SSRService["Account.Banks.DeleteTitle"]
              : undefined
          }
          description={
            deletingIsBank
              ? t.SSRService["Account.Banks.DeleteDescription"]
              : undefined
          }
          onOpenChange={(open) => {
            if (!open) setDeletingToken(null);
          }}
          onConfirm={() => handleDelete(deletingToken.id)}
        />
      )}
    </section>
  );
}
```

Two deliberate changes from today's file, so they are not mistaken for slips:

- The empty-state condition moves from `cards.length === 0` to `!heroCard` / `!heroBank`. Equivalent — `partitionTokens` returns a null hero exactly when its input is empty — and it reads off the same value the branch below uses.
- The old `pendingId` state is **removed**. It only ever dimmed one card, and `disabled` (from `isPending`) now blocks every control in both sections while any mutation is in flight, which is what the row and hero components expect. Leaving it would be an unused variable and a lint error.

- [ ] **Step 3: Verify**

```bash
pnpm --filter ssr type-check 2>&1 | tail -6
pnpm --filter ssr lint > /dev/null 2>&1 && echo "lint clean" || pnpm --filter ssr lint 2>&1 | tail -12
```
Expected: only the known `logo.tsx` error; lint clean. Fix anything this task introduced before committing.

- [ ] **Step 4: Commit**

```bash
git add "apps/ssr/src/app/[lang]/(main)/account/cards/_components/cards-view.tsx" "apps/ssr/src/app/[lang]/(main)/account/cards/_components/delete-card-dialog.tsx" "apps/ssr/src/app/[lang]/(main)/account/cards/_components/edit-nickname-dialog.tsx"
git commit -m "feat(ssr): render cards and bank accounts as hero plus compact rows"
```

---

### Task 10: Prune orphaned keys and run the full gate

**Files:**
- Modify: `apps/ssr/src/language-data/unirefund/SSRService/resources/{en,tr}.json`

**Interfaces:**
- Consumes: the finished page.
- Produces: nothing.

Removing the per-card `Type` badge orphaned `Account.Cards.Type.Card`, `.Bank` and `.Wallet`.

- [ ] **Step 1: Find unused keys**

```bash
pnpm i18n:unused --app=ssr
```
Expected: the three `Account.Cards.Type.*` keys. **If any `Account.Banks.*` key is also reported, a key you added is unreachable — investigate rather than pruning it**, since every one should now have a call site.

- [ ] **Step 2: Prune**

Remove the three `Account.Cards.Type.*` keys from both `en.json` and `tr.json` by hand, or run `pnpm i18n:unused --app=ssr --prune` and review the diff before staging.

- [ ] **Step 3: Check for missing keys**

```bash
pnpm i18n:missing
```
Expected: nothing for `Account.Banks.*` — every key must exist in both files.

- [ ] **Step 4: Run the full gate**

```bash
pnpm --filter ssr run init
pnpm --filter ssr type-check 2>&1 | tail -6
pnpm --filter ssr lint > /dev/null 2>&1 && echo "lint clean" || pnpm --filter ssr lint 2>&1 | tail -12
```
Expected: only the known `logo.tsx` error; lint clean.

- [ ] **Step 5: Commit**

```bash
git add apps/ssr/src/language-data/unirefund/SSRService/resources/en.json apps/ssr/src/language-data/unirefund/SSRService/resources/tr.json
git commit -m "chore(i18n): prune the orphaned Account.Cards.Type keys"
```

---

### Task 11: Walk it in a browser

**Files:** none.

**Interfaces:**
- Consumes: the finished feature.
- Produces: the only real verification this feature gets.

**This task is not optional.** There are no unit tests anywhere in this plan — typecheck and lint are the only automated gates, and neither can tell you whether the page works. Every behavioural claim rests on this walkthrough.

- [ ] **Step 1: Run the app**

```bash
pnpm --filter ssr dev
```
Sign in as a traveller and open `/account/cards`.

- [ ] **Step 2: Walk the page and report each check**

- The default card shows the full card face; other cards are one-line rows beside it, to its right on a wide window.
- The bank section renders a wide slab, **not** a credit-card face, and its IBAN reads as `TR33 •••• 1326` rather than being grouped like a card number.
- Adding a bank account works end to end: a malformed IBAN is rejected client-side with a toast and **no network request**; a valid one saves, toasts, closes the dialog and the list refreshes with the new account.
- The saved account's country was stored correctly even though the form never asked for it.
- Deleting a bank account says "bank account", not "card". Renaming one says "account nickname".
- Narrowing the window below `md` stacks each hero above its rows.
- With exactly one card, the row column is absent and the hero stays hard left.
- With no bank accounts, the bank empty state shows.
- Setting a row as default promotes it into the hero after the refresh.
- Wallet tokens, if the account has any, no longer appear anywhere.

- [ ] **Step 3: Report honestly**

State which checks you performed and which you could not — no expired card on the account, no wallet token, and so on. Do not claim a check you did not run. Given there are no unit tests, an unperformed check here means that behaviour is entirely unverified.

---

## Definition of done

- [ ] `pnpm --filter ssr type-check` — only the known `logo.tsx` SVG error
- [ ] `pnpm --filter ssr lint` — clean, exit 0
- [ ] `pnpm i18n:missing` clean for `Account.Banks.*`; `pnpm i18n:unused --app=ssr` reports nothing new
- [ ] Ten commits (Tasks 1-10; Tasks 0 and 11 produce none), each staging only its own explicit paths
- [ ] No file under `packages/ayasofyazilim-ui/` or `packages/utils/` is modified — both are separate repositories
- [ ] Task 11 walked in a browser, with every unperformed check named

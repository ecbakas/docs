# ssr visual parity, sub-project 3b (Edit profile, avatar and Cards): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ssr's Edit profile becomes the app's single form with a pinned Save; the Profile hero's avatar gets a camera chip that opens a real upload sheet; `/profile/cards` becomes the app's hero, tiles and page-width sheets, with banks behind their grant.

**Architecture:**
- Pure logic (card and bank display text, the tile selector rule, the cards view state, the profile form rules, the avatar file rules, initials) goes into `apps/ssr/src/utils/profile/` as node-tested `.ts` modules.
- The add-card form is split into a hook and a fields component, so the Cards page wraps it in a sheet while validate's payout step keeps its dialog unchanged.
- The five card dialogs become page-width `Drawer` sheets with the same logic and test ids. Then the Cards page is rebuilt from a `PayoutHero` and `PayoutTile`s.

**Tech stack:** Next.js 16 (App Router), Tailwind v4, `node:test` via `tsx`, `@repo/ayasofyazilim-ui` (Drawer, Button, Input, Label, sonner, `PhoneInput`, `CardBrandIcon`, `CreditCardInput`), `react-easy-crop`.

**Spec:** `C:\unirefund\docs\superpowers\specs\2026-10-02-ssr-visual-parity-profile-design.md`, Section 3 (and the Grants table). Sections 1 and 2 shipped in 3a (#314).

**Where the work happens:**
- **Worktree:** `C:\unirefund\web-app-wt-visual-parity-profile`.
- **Branch:** `feat/ssr-visual-parity-profile-cards`, cut from `feat/ssr-visual-parity-profile` at `75112770f` (the head of #314).
- **PR:** targets `feat/ssr-visual-parity-profile`.

`S/` means `apps/ssr/src/`, `(main)` means `S/app/[lang]/(main)`, and `cards/` means `(main)/profile/cards`.

**Plan decisions.** These argue from the spec, and the executor treats each as a ruling.

1. **The add-card form is shared as a hook plus fields, not as a `presentation` prop.** `useAddCardForm` owns the state and the submit; `AddCardFields` renders the scan button, the camera, the card input and the nickname. `AddCardDialog` (validate's payout step) and the new `AddCardSheet` (Cards) each own their wrapper, preview and footer. Validate's dialog, its props and its test ids do not change.
2. **Banks are behind `addBank` as a whole section**, as the spec's decision 3 says. A traveller without `CreateBank` who still holds bank tokens does not see them, which is also what the app does. Cost if wrong: one condition in `cards-view.tsx`.
3. **"Error with cards" exists on the web too.** The Cards page passes `cards: null` when its call fails, instead of rendering `ErrorComponent`. `CardsView` keeps the last good list across a failed `router.refresh()` and shows the app's amber banner over it. With nothing loaded yet, it shows "Couldn't load your payout methods." with Try again.
4. **The selector on a non-default tile is the app's empty radio circle**, labelled "Pay refunds here" through `aria-label` and `title`, as in the app's `MethodTile`. The spec's "show 'Pay refunds here'" is read as that label.
5. **The avatar is uploaded as a JPEG of at most 512 × 512 px.** ssr's server actions accept 8 MB bodies (`next.config.js`), and a cropped phone photo encoded as PNG can exceed that.
6. **After a profile save, the session is refreshed best-effort**, with the same `refreshSessionAfterAffiliationSwitch()` + `sessionUpdate` pair that the document switch uses, so the hub shows the new name. If the refresh fails (a KYC login has no refresh token), the save still counts, and the name catches up at the next sign-in.
7. **The hero's camera chip is the only way into the avatar sheet.** Edit profile no longer shows an avatar.
8. **Mutations get explicit pending state.** Today's `startTransition(() => { void promise })` calls never keep `isPending` true, so a second tap can fire a second call. Every mutation touched here uses `useState` pending with `try`/`catch`/`finally`. A thrown action toasts, and never leaves a sheet stuck.

## Global Constraints

- **QR contract.** `/tag/<slug>` and `/{lang}/validate?qrValue=…` are untouched.
- **Grants.** Every control and every optional call is gated on its endpoint's group grant **and** its leaf grant. A control without its grant is not rendered, and its call is not made.

  | Control or call | Helper (from `S/components/payout-cards/card-grants.ts`) |
  | --- | --- |
  | Add card tile, the empty state's Add card button, Replace, the delete sheet's Add card | `cardGrants().add` |
  | The whole BANKS section and its add-bank tile | `cardGrants().addBank` |
  | Tile title tap and the rename icon | `cardGrants().rename` |
  | Tile delete icon | `cardGrants().remove` |
  | "Pay refunds here" selector | `cardGrants().setDefault` |
  | Moving open refunds, and the page's open-refunds call | `cardGrants().moveRefunds` (unchanged) |
  | Avatar upload | none: `POST /api/account/profile-picture` declares no permission |

- **Sheets are no wider than the page column.** Every `DrawerContent` gets `className="mx-auto w-full max-w-3xl md:border-x"` (user rule, 2026-10-02).
- **Single centred column.** `TabPage` without `wide`.
- **Class translation from NativeWind.**
  - `text-muted` and `text-placeholder` become `text-muted-foreground`.
  - A neutral fill `bg-muted` becomes `bg-muted-foreground`.
  - Everything else copies verbatim: `bg-card`, `border-border`, `border-input`, `bg-foreground/5`, `font-serial`, `border-primary`, `bg-primary`, `text-primary-foreground`, `border-warning`, `border-warning/40`, `bg-warning-surface`, `text-warning`, `bg-info-surface`, `text-info-strong`.
- **ssr strings.**
  - New `SSRService` strings go in both `S/language-data/unirefund/SSRService/resources/en.json` and `tr.json`. Keys are flat.
  - The existing `Account.Cards.*` templates use named placeholders (`{card}`) filled by `S/components/payout-cards/fill.ts`. Keep them named.
  - There must be no duplicate keys.
  - Run `pnpm --filter ssr run init` afterwards. Never commit `*.gen.json`.
- **ssr test ids.** Every `Link`, `Button`, `Input`, `Label`, `*Trigger`, `DrawerClose`, `<form>`, `<input>` and native `<button>` carries a `data-testid`. The lint rule `react-require-testid/testid-missing` is an error.
- **ssr tests.** `test:unit` runs `node --import tsx --test "src/**/*.test.ts"`: Node's runner, `.ts` only, no JSX. Test files import their module with a **relative** path, and pure modules import each other relatively.
- **Shared checkouts and processes.**
  - Never run `git reset --hard`, `git stash`, `git checkout --`, `git add -A` or `git add .`. Stage files by name.
  - Implementers never push. Never commit `.env` or submodule pointers. Do not change `packages/utils` (a submodule).
  - **The user's dev server runs on :3001 from `C:\unirefund\web-app-wt-visual-parity`. Never touch it.** Only stop `node.exe` processes whose command line contains `web-app-wt-visual-parity-profile`.
  - Never `next build` while a dev server runs on this checkout.
- **Manual checks are read-only on real data.**
  - Cards: open and close every sheet. No set-default, rename, delete, move or add on real cards.
  - Edit profile: save only with unchanged values.
  - Avatar: open, pick and crop. Upload only a harmless image, and only if the user agrees.
- **Comments** are rare and short: one line, only where the reason is not obvious.

## Review Focus

1. **A stored phone number that is not E.164** (a legacy value like `5551234567`), which the user never touches. Saving the other fields must not be blocked, and the stored value is sent back unchanged. Pinned by: Task 1's `phoneBlocksSave` "untouched" case and its `profileUpdateBody` legacy-phone case.
2. **A large phone photo, a HEIC or a GIF.** A HEIC or GIF is refused with a toast before cropping. A JPEG of 12 MB is accepted and leaves as a JPEG of at most 512 px, far below the 8 MB server-action limit. Pinned by: Task 1's `avatarFileProblem` and `avatarOutputSize` cases.
3. **A refresh fails after a mutation while cards are on screen.** The tiles stay, with the amber banner and Try again. It is not a blank error page. Pinned by: Task 1's `cardsViewState` cases.
4. **An expired default card.** The hero keeps it with `border-warning`. Its tile shows no selector, not even the default check, and offers Replace only with the add grant. Pinned by: Task 1's `tileSelector` cases, and the existing `partitionTokens` rule.
5. **Required fields made of spaces only.** Save stays disabled. Pinned by: Task 1's `canSaveProfile` spaces case.

---

## File structure

| Path | Change |
| --- | --- |
| `S/utils/profile/payout-display.ts` + `.test.ts` | new: tail, expiry, tile title and sub-line, Last used rule, selector rule, cards view state |
| `S/utils/profile/edit-profile.ts` + `.test.ts` | new: the Save rule, the phone rules, the PUT body |
| `S/utils/profile/avatar.ts` + `.test.ts` | new: accepted types, size limit, output size |
| `S/utils/profile/identity.ts` + `.test.ts` | gains `initialsOf` |
| `S/components/payout-cards/card-option.tsx` | `maskedTail` and `expiryLabel` delegate to `payout-display` |
| `apps/ssr/scripts/gen-ionicons.mjs`, `S/components/shell/ionicons.tsx` | 6 more icons |
| en/tr | the **Strings** tables |
| `S/components/payout-cards/add-card-form.tsx` | new: `useAddCardForm`, `AddCardFields` |
| `S/components/payout-cards/add-card-dialog.tsx` | thin wrapper over the form; same props and test ids |
| `cards/_components/payout-hero.tsx`, `sheet-header.tsx` | new |
| `cards/_components/add-card-sheet.tsx`, `add-bank-sheet.tsx`, `edit-nickname-sheet.tsx`, `delete-card-sheet.tsx`, `move-refunds-sheet.tsx` | new; replace the matching `*-dialog.tsx`, which are deleted |
| `cards/_components/payout-tile.tsx`, `add-payout-tile.tsx` | new |
| `cards/_components/cards-view.tsx`, `cards/page.tsx` | the new layout and the load-failed states |
| `cards/_components/card-row.tsx`, `bank-row.tsx`, `token-hero-actions.tsx`, `bank-account-preview.tsx` | deleted |
| `(main)/profile/edit-profile/page.tsx`, `_components/edit-profile-form.tsx` | the single form; `account-form.tsx` is deleted |
| `(main)/profile/_components/avatar-sheet.tsx`, `crop-image.ts` | new; `edit-profile/_components/avatar-uploader.tsx` is deleted |
| `(main)/profile/_components/identity-hero.tsx`, `profile-hub.tsx` | the camera chip and the sheet |

## Strings

**New `SSRService` keys**, all added in Task 2. Values come from super-app's `en-US.json` / `tr-TR.json`. Keys marked *web* have no app counterpart.

| Key | en | tr |
| --- | --- | --- |
| `Profile.Edit.Title` | Edit Profile | Profili Düzenle |
| `Profile.Edit.Name` | Name | Ad |
| `Profile.Edit.Surname` | Surname | Soyad |
| `Profile.Edit.Username` | Username | Kullanıcı Adı |
| `Profile.Edit.Email` | Email | E-posta |
| `Profile.Edit.InvalidPhone` | Invalid phone number | Geçersiz telefon numarası |
| `Profile.Edit.Updated` | Profile information updated | Profil bilgileri güncellendi |
| `Profile.Edit.UpdateFailed` (*web*) | Couldn't update your profile. Please try again. | Profiliniz güncellenemedi. Lütfen tekrar deneyin. |
| `Profile.Avatar.Title` | Profile Picture | Profil Fotoğrafı |
| `Profile.Avatar.Change` (*web*) | Change profile picture | Profil fotoğrafını değiştir |
| `Profile.Avatar.Heading` | Upload an image that represents you. | Sizi temsil eden bir görsel yükleyin. |
| `Profile.Avatar.Hint` | Select a photo from your gallery. | Galerinizden bir fotoğraf seçin. |
| `Profile.Avatar.Continue` | Continue | Devam Et |
| `Profile.Avatar.Updated` | Profile picture updated | Profil fotoğrafı güncellendi |
| `Profile.Avatar.UpdateFailed` | Couldn't update your profile picture. Please try again. | Profil fotoğrafı güncellenemedi. Lütfen tekrar deneyin. |
| `Profile.Avatar.UnsupportedType` (*web*) | Choose a JPG, PNG or WebP image. | JPG, PNG veya WebP biçiminde bir görsel seçin. |
| `Profile.Avatar.TooLarge` (*web*) | Choose an image smaller than 20 MB. | 20 MB'tan küçük bir görsel seçin. |
| `Account.Cards.DefaultCard` | Default card | Varsayılan kart |
| `Account.Cards.CardsSection` | Cards | Kartlar |
| `Account.Cards.ExpiredCannotReceive` | Expired — refunds can't be paid here | Süresi doldu — iadeler buraya yatırılamaz |
| `Account.Cards.Replace` | Replace | Değiştir |
| `Account.Cards.LoadFailed` | Couldn't load your payout methods. | Ödeme yöntemleriniz yüklenemedi. |
| `Account.Cards.Retry` | Try again | Tekrar dene |
| `Account.Cards.RenameSuccess` | Name updated | Ad güncellendi |
| `Account.Cards.ActionFailed` (*web*) | Something went wrong. Please try again. | Bir sorun oluştu. Lütfen tekrar deneyin. |
| `Account.Banks.DefaultBank` (*web*) | Default bank account | Varsayılan banka hesabı |

**Changed values.** The keys keep their names; the app's wording replaces today's. `—` means that side is unchanged.

| Key | en | tr |
| --- | --- | --- |
| `Account.Cards.Title` | My Cards | Kartlarım |
| `Account.Cards.Description` | Where your tax-free refunds are paid | Vergi iadelerinizin yatırıldığı yer |
| `Account.Cards.AddSuccess` | Card added | Kart eklendi |
| `Account.Cards.Adding` | Adding… | Ekleniyor… |
| `Account.Cards.Saving` | Saving… | Kaydediliyor… |
| `Account.Cards.Cancel` | — | Vazgeç |
| `Account.Cards.DeleteTitle` | Remove this payout method? | Bu ödeme yöntemi kaldırılsın mı? |
| `Account.Cards.DeleteDescription` | It will no longer be available for refunds. You can add it again later. | İadeler için artık kullanılamayacak. Daha sonra tekrar ekleyebilirsiniz. |
| `Account.Cards.DeleteSuccess` | Removed | Kaldırıldı |
| `Account.Cards.EditNicknameTitle` | Rename | Yeniden adlandır |
| `Account.Cards.EditNicknameDescription` | Give this payout method a name you'll recognise. | Bu ödeme yöntemine tanıyacağınız bir ad verin. |
| `Account.Cards.Expired` | — | Süresi doldu |
| `Account.Cards.HolderNameLabel` | Card holder | Kart sahibi |
| `Account.Cards.HolderNamePlaceholder` | Name on card | Kart üzerindeki isim |
| `Account.Cards.InvalidCardNumber` | That card number doesn't look right. | Bu kart numarası geçerli görünmüyor. |
| `Account.Cards.InvalidExpiry` | Enter the expiry as MM/YY. | Son kullanma tarihini AA/YY olarak girin. |
| `Account.Cards.NicknamePlaceholder` | Work Visa | İş kartı |
| `Account.Cards.NoCards` | No saved cards | — |
| `Account.Cards.NoCardsDescription` | Add a card so your refunds have somewhere to land. | İadelerinizin yatırılabileceği bir kart ekleyin. |
| `Account.Cards.SetDefault` | Pay refunds here | İadeleri buraya yatır |
| `Account.Cards.SetDefaultSuccess` | Default updated | Varsayılan güncellendi |
| `Account.Cards.DeleteMove.MoveToHero` | Before it's removed, all your open refunds move to {card}. | Kart kaldırılmadan önce tüm açık iadeleriniz {card} kartına taşınır. |
| `Account.Cards.DeleteMove.MovedAndDeleted` | Removed. Your open refunds now go to {card}. | Kaldırıldı. Açık iadeleriniz artık {card} kartına ödenecek. |
| `Account.Banks.AddSuccess` | Bank account added | — |

**Reused unchanged:** `PhoneNumber`, `Save`, `Account.Saving`, `Avatar.Uploading`, `Header.Back`, `Account.Cards.*` and `Account.Banks.*` not listed above, `CardScanner.ExtractionFailed`.

**Left orphaned** (named in the PR, not removed): `Account.YourAvatar`, `Account.AvatarDescription`, `Account.YourName*`, `Account.YourPhone*`, `Account.YourEmail*`, `Account.UsernameDescription`, `Account.ManageAccountAndPersonalInfo`, `Avatar.UploadImage`, `Avatar.Cancel`, `Avatar.Update`.

---

### Task 0: Setup (controller)

- [ ] **Step 1: Check the worktree.**
  - In `C:\unirefund\web-app-wt-visual-parity-profile`, `git status --short` must be clean, apart from untracked `.env` and `*.gen.json`.
  - The branch is `feat/ssr-visual-parity-profile` at `75112770f`.
  - No `node.exe` may have `web-app-wt-visual-parity-profile` in its command line. If one does, it is this worktree's own dev server from 3a's manual pass: stop it.
- [ ] **Step 2: Branch.** Run `git switch -c feat/ssr-visual-parity-profile-cards`.
- [ ] **Step 3: Measure the baselines and ledger them.**
  - `pnpm --filter ssr test:unit`: expect 297 pass.
  - `pnpm --filter ssr type-check`: expect 0 `error TS` outside `.next/`.
  - `pnpm --filter ssr lint`: expect 0 errors (459 warnings at 3a's head).
  - `pnpm --filter web type-check`: expect 0 errors.

---

### Task 1: Pure display, form and avatar logic (web-app)

**Files:**
- Create: `S/utils/profile/payout-display.ts`, `S/utils/profile/payout-display.test.ts`, `S/utils/profile/edit-profile.ts`, `S/utils/profile/edit-profile.test.ts`, `S/utils/profile/avatar.ts`, `S/utils/profile/avatar.test.ts`
- Modify: `S/utils/profile/identity.ts`, `S/utils/profile/identity.test.ts`, `S/components/payout-cards/card-option.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `payout-display.ts`: `PLACEHOLDER_TAIL`; `payoutTail(maskedNumber: string | null | undefined): string`; `payoutExpiry(month, year): string`; `cardTileTitle(token)`, `cardTileSubline(token)`; `bankTileTitle(token, unnamed: string)`; `showLastUsed(token): boolean`; `type TileSelector = "check" | "select" | "none"`; `tileSelector(token: { isExpired: boolean }, isDestination: boolean, canSetDefault: boolean): TileSelector`; `type CardsViewState<T>`; `cardsViewState<T>(fresh: T[] | null, lastGood: T[] | null): CardsViewState<T>`.
  - `edit-profile.ts`: `interface ProfileDraft { name; surname; userName; email; phoneNumber }` (all `string`); `type PhoneState = "untouched" | "valid" | "invalid"`; `canSaveProfile(draft)`, `phoneStateFor(value, isValid)`, `phoneBlocksSave(phoneNumber, state)`, `profileUpdateBody(draft, concurrencyStamp)`.
  - `avatar.ts`: `AVATAR_ACCEPT`, `AVATAR_MAX_INPUT_BYTES`, `AVATAR_MAX_OUTPUT_PX`, `AVATAR_OUTPUT_TYPE`, `type AvatarFileProblem = "type" | "size"`, `avatarFileProblem(file: { type: string; size: number })`, `avatarOutputSize(cropWidth: number)`.
  - `identity.ts`: `initialsOf(name: string): string`.

- [ ] **Step 1: Write the failing tests.**

`S/utils/profile/payout-display.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bankTileTitle,
  cardsViewState,
  cardTileSubline,
  cardTileTitle,
  payoutExpiry,
  payoutTail,
  showLastUsed,
  tileSelector,
} from "./payout-display";

const card = {
  maskedNumber: "526911******6954",
  nickname: null as string | null,
  expiryMonth: 8,
  expiryYear: 2027,
  isDefault: false,
  isLastUsed: false,
  isExpired: false,
};

describe("payoutTail", () => {
  it("keeps the last four digits of a masked number", () => {
    assert.equal(payoutTail("526911******6954"), "•••• 6954");
  });
  it("ignores spaces in the stored number", () => {
    assert.equal(payoutTail("5269 11** **** 6954"), "•••• 6954");
  });
  it("shows the placeholder when there is no number yet", () => {
    assert.equal(payoutTail(""), "•••• ••••");
    assert.equal(payoutTail(null), "•••• ••••");
  });
  it("shows what has been typed so far", () => {
    assert.equal(payoutTail("42"), "•••• 42");
  });
});

describe("payoutExpiry", () => {
  it("pads the month and keeps two year digits", () => {
    assert.equal(payoutExpiry(8, 2027), "08/27");
    assert.equal(payoutExpiry(12, 27), "12/27");
  });
  it("is empty without a month or a year", () => {
    assert.equal(payoutExpiry(null, 2027), "");
    assert.equal(payoutExpiry(8, undefined), "");
  });
});

describe("tile text", () => {
  it("titles a card by its nickname, then its tail", () => {
    assert.equal(cardTileTitle({ ...card, nickname: "Work" }), "Work");
    assert.equal(cardTileTitle(card), "•••• 6954");
  });
  it("repeats the tail under a nickname, and shows only the expiry without one", () => {
    assert.equal(cardTileSubline({ ...card, nickname: "Work" }), "•••• 6954 · 08/27");
    assert.equal(cardTileSubline(card), "08/27");
  });
  it("names a bank by its nickname, then its bank name, then the fallback", () => {
    assert.equal(bankTileTitle({ nickname: "Salary", bankName: "Ziraat" }, "Bank account"), "Salary");
    assert.equal(bankTileTitle({ nickname: null, bankName: "Ziraat" }, "Bank account"), "Ziraat");
    assert.equal(bankTileTitle({ nickname: "", bankName: null }, "Bank account"), "Bank account");
  });
});

describe("showLastUsed", () => {
  it("shows only on a usable card that is not the default", () => {
    assert.equal(showLastUsed({ ...card, isLastUsed: true }), true);
    assert.equal(showLastUsed({ ...card, isLastUsed: true, isDefault: true }), false);
    assert.equal(showLastUsed({ ...card, isLastUsed: true, isExpired: true }), false);
    assert.equal(showLastUsed(card), false);
  });
});

describe("tileSelector", () => {
  it("offers nothing on an expired card, even the destination", () => {
    assert.equal(tileSelector({ isExpired: true }, true, true), "none");
    assert.equal(tileSelector({ isExpired: true }, false, true), "none");
  });
  it("checks the destination", () => {
    assert.equal(tileSelector({ isExpired: false }, true, false), "check");
  });
  it("offers the others only with the set-default grant", () => {
    assert.equal(tileSelector({ isExpired: false }, false, true), "select");
    assert.equal(tileSelector({ isExpired: false }, false, false), "none");
  });
});

describe("cardsViewState", () => {
  it("shows a fresh list", () => {
    const fresh = [1];
    assert.deepEqual(cardsViewState(fresh, null), { kind: "ready", tokens: fresh, stale: false });
  });
  it("shows an empty fresh list as ready, not as an error", () => {
    assert.deepEqual(cardsViewState([], [1]), { kind: "ready", tokens: [], stale: false });
  });
  it("keeps the last good list when a refresh fails", () => {
    assert.deepEqual(cardsViewState(null, [1, 2]), { kind: "ready", tokens: [1, 2], stale: true });
  });
  it("is an error when nothing has loaded", () => {
    assert.deepEqual(cardsViewState(null, null), { kind: "error" });
    assert.deepEqual(cardsViewState(null, []), { kind: "error" });
  });
});
```

`S/utils/profile/edit-profile.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canSaveProfile,
  phoneBlocksSave,
  phoneStateFor,
  profileUpdateBody,
  type ProfileDraft,
} from "./edit-profile";

const draft: ProfileDraft = {
  name: "Siggi",
  surname: "Traveller",
  userName: "siggi",
  email: "siggi@example.com",
  phoneNumber: "",
};

describe("canSaveProfile", () => {
  it("allows saving with every required field", () => {
    assert.equal(canSaveProfile(draft), true);
  });
  it("needs name, surname, username and email", () => {
    for (const field of ["name", "surname", "userName", "email"] as const) {
      assert.equal(canSaveProfile({ ...draft, [field]: "" }), false, field);
    }
  });
  it("treats a field of spaces as empty", () => {
    assert.equal(canSaveProfile({ ...draft, name: "   " }), false);
  });
  it("does not need a phone number", () => {
    assert.equal(canSaveProfile({ ...draft, phoneNumber: "" }), true);
  });
});

describe("phone", () => {
  it("rates a cleared phone as valid", () => {
    assert.equal(phoneStateFor("", false), "valid");
  });
  it("rates a typed number by libphonenumber's verdict", () => {
    assert.equal(phoneStateFor("+905551234567", true), "valid");
    assert.equal(phoneStateFor("+90555", false), "invalid");
  });
  it("blocks saving only for an invalid number the user typed", () => {
    assert.equal(phoneBlocksSave("+90555", "invalid"), true);
    assert.equal(phoneBlocksSave("", "invalid"), false);
    assert.equal(phoneBlocksSave("5551234567", "untouched"), false);
    assert.equal(phoneBlocksSave("+905551234567", "valid"), false);
  });
});

describe("profileUpdateBody", () => {
  it("sends all five fields trimmed, with the stamp", () => {
    assert.deepEqual(
      profileUpdateBody({ ...draft, name: " Siggi ", phoneNumber: "+905551234567" }, "stamp-1"),
      {
        name: "Siggi",
        surname: "Traveller",
        userName: "siggi",
        email: "siggi@example.com",
        phoneNumber: "+905551234567",
        concurrencyStamp: "stamp-1",
      }
    );
  });
  it("sends an untouched legacy phone unchanged", () => {
    assert.equal(profileUpdateBody({ ...draft, phoneNumber: "5551234567" }, null).phoneNumber, "5551234567");
  });
  it("leaves a missing stamp out", () => {
    assert.equal(profileUpdateBody(draft, null).concurrencyStamp, undefined);
  });
});
```

`S/utils/profile/avatar.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { avatarFileProblem, avatarOutputSize } from "./avatar";

const MB = 1024 * 1024;

describe("avatarFileProblem", () => {
  it("accepts JPEG, PNG and WebP", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      assert.equal(avatarFileProblem({ type, size: MB }), null, type);
    }
  });
  it("refuses other types, HEIC and GIF included", () => {
    assert.equal(avatarFileProblem({ type: "image/heic", size: MB }), "type");
    assert.equal(avatarFileProblem({ type: "image/gif", size: MB }), "type");
    assert.equal(avatarFileProblem({ type: "", size: MB }), "type");
  });
  it("refuses a file over 20 MB", () => {
    assert.equal(avatarFileProblem({ type: "image/jpeg", size: 20 * MB }), null);
    assert.equal(avatarFileProblem({ type: "image/jpeg", size: 20 * MB + 1 }), "size");
  });
});

describe("avatarOutputSize", () => {
  it("caps a large crop at 512 px", () => {
    assert.equal(avatarOutputSize(3000), 512);
  });
  it("keeps a small crop at its own size, rounded", () => {
    assert.equal(avatarOutputSize(200.6), 201);
  });
  it("never returns zero", () => {
    assert.equal(avatarOutputSize(0), 1);
  });
});
```

Append to `S/utils/profile/identity.test.ts` (add `initialsOf` to its existing import from `./identity`):

```ts
describe("initialsOf", () => {
  it("takes the first letter of the first two names", () => {
    assert.equal(initialsOf("siggi traveller smith"), "ST");
  });
  it("copes with extra spaces and an empty name", () => {
    assert.equal(initialsOf("  ada  "), "A");
    assert.equal(initialsOf(""), "");
  });
});
```

- [ ] **Step 2: Run the tests and see them fail.**

Run: `pnpm --filter ssr test:unit`
Expected: FAIL. `payout-display`, `edit-profile` and `avatar` cannot be resolved, and `initialsOf` is not exported.

- [ ] **Step 3: Write the modules.**

`S/utils/profile/payout-display.ts`:

```ts
export const PLACEHOLDER_TAIL = "•••• ••••";

export function payoutTail(maskedNumber: string | null | undefined): string {
  const compact = (maskedNumber ?? "").replace(/\s/g, "");
  return compact ? `•••• ${compact.slice(-4)}` : PLACEHOLDER_TAIL;
}

export function payoutExpiry(
  month: number | null | undefined,
  year: number | null | undefined
): string {
  if (!month || !year) return "";
  return `${String(month).padStart(2, "0")}/${String(year).slice(-2)}`;
}

interface CardText {
  maskedNumber: string;
  nickname?: string | null;
  expiryMonth?: number | null;
  expiryYear?: number | null;
}

export function cardTileTitle(token: CardText): string {
  return token.nickname || payoutTail(token.maskedNumber);
}

export function cardTileSubline(token: CardText): string {
  const expiry = payoutExpiry(token.expiryMonth, token.expiryYear);
  if (!token.nickname) return expiry;
  return [payoutTail(token.maskedNumber), expiry].filter(Boolean).join(" · ");
}

export function bankTileTitle(
  token: { nickname?: string | null; bankName?: string | null },
  unnamed: string
): string {
  return token.nickname || token.bankName || unnamed;
}

export function showLastUsed(token: {
  isDefault: boolean;
  isLastUsed: boolean;
  isExpired: boolean;
}): boolean {
  return token.isLastUsed && !token.isDefault && !token.isExpired;
}

export type TileSelector = "check" | "select" | "none";

export function tileSelector(
  token: { isExpired: boolean },
  isDestination: boolean,
  canSetDefault: boolean
): TileSelector {
  if (token.isExpired) return "none";
  if (isDestination) return "check";
  return canSetDefault ? "select" : "none";
}

export type CardsViewState<T> =
  | { kind: "error" }
  | { kind: "ready"; tokens: T[]; stale: boolean };

export function cardsViewState<T>(
  fresh: T[] | null,
  lastGood: T[] | null
): CardsViewState<T> {
  if (fresh) return { kind: "ready", tokens: fresh, stale: false };
  if (lastGood && lastGood.length > 0)
    return { kind: "ready", tokens: lastGood, stale: true };
  return { kind: "error" };
}
```

`S/utils/profile/edit-profile.ts`:

```ts
export interface ProfileDraft {
  name: string;
  surname: string;
  userName: string;
  email: string;
  phoneNumber: string;
}

export type PhoneState = "untouched" | "valid" | "invalid";

export function canSaveProfile(draft: ProfileDraft): boolean {
  return [draft.name, draft.surname, draft.userName, draft.email].every(
    (value) => value.trim().length > 0
  );
}

export function phoneStateFor(value: string, isValid: boolean): PhoneState {
  return value.trim() === "" || isValid ? "valid" : "invalid";
}

export function phoneBlocksSave(phoneNumber: string, state: PhoneState): boolean {
  return state === "invalid" && phoneNumber.trim().length > 0;
}

export function profileUpdateBody(
  draft: ProfileDraft,
  concurrencyStamp: string | null | undefined
) {
  return {
    name: draft.name.trim(),
    surname: draft.surname.trim(),
    userName: draft.userName.trim(),
    email: draft.email.trim(),
    phoneNumber: draft.phoneNumber.trim(),
    concurrencyStamp: concurrencyStamp ?? undefined,
  };
}
```

`S/utils/profile/avatar.ts`:

```ts
export const AVATAR_ACCEPT = ["image/jpeg", "image/png", "image/webp"] as const;
export const AVATAR_MAX_INPUT_BYTES = 20 * 1024 * 1024;
export const AVATAR_MAX_OUTPUT_PX = 512;
export const AVATAR_OUTPUT_TYPE = "image/jpeg";

export type AvatarFileProblem = "type" | "size";

export function avatarFileProblem(file: {
  type: string;
  size: number;
}): AvatarFileProblem | null {
  if (!(AVATAR_ACCEPT as readonly string[]).includes(file.type)) return "type";
  if (file.size > AVATAR_MAX_INPUT_BYTES) return "size";
  return null;
}

export function avatarOutputSize(cropWidth: number): number {
  return Math.max(1, Math.min(AVATAR_MAX_OUTPUT_PX, Math.round(cropWidth)));
}
```

Append to `S/utils/profile/identity.ts`:

```ts
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
```

In `S/components/payout-cards/card-option.tsx`, replace the bodies of the two helpers so they delegate. Validate's step and the delete sheet keep using these names.

```ts
import { payoutExpiry, payoutTail } from "@/src/utils/profile/payout-display";

export function maskedTail(token: Token) {
  return payoutTail(token.maskedNumber);
}

export function expiryLabel(token: Token) {
  return payoutExpiry(token.expiryMonth, token.expiryYear);
}
```

- [ ] **Step 4: Run the tests and see them pass.**

Run: `pnpm --filter ssr test:unit`
Expected: PASS. The count is 297 plus the new cases (about 30), with no failures.

Also run `pnpm --filter ssr type-check` (0 errors) and `pnpm --filter ssr lint` (0 errors).

- [ ] **Step 5: Commit.**

```bash
git add apps/ssr/src/utils/profile/payout-display.ts apps/ssr/src/utils/profile/payout-display.test.ts apps/ssr/src/utils/profile/edit-profile.ts apps/ssr/src/utils/profile/edit-profile.test.ts apps/ssr/src/utils/profile/avatar.ts apps/ssr/src/utils/profile/avatar.test.ts apps/ssr/src/utils/profile/identity.ts apps/ssr/src/utils/profile/identity.test.ts apps/ssr/src/components/payout-cards/card-option.tsx
git commit -m "feat(ssr): add the payout, profile-form and avatar rules for profile 3b"
```

---

### Task 2: Icons and strings (web-app)

**Files:**
- Modify: `apps/ssr/scripts/gen-ionicons.mjs`, then regenerate `S/components/shell/ionicons.tsx`; `S/language-data/unirefund/SSRService/resources/en.json` and `tr.json`.

**Interfaces:**
- Consumes: nothing.
- Produces: `IoAtOutline`, `IoMailOutline`, `IoCreateOutline`, `IoTrashOutline`, `IoCamera`, `IoBusinessOutline`; every key in the plan's **Strings** tables.

- [ ] **Step 1: Icons.**
  - Append these to `NAMES` in `apps/ssr/scripts/gen-ionicons.mjs`: `"at-outline"`, `"mail-outline"`, `"create-outline"`, `"trash-outline"`, `"camera"`, `"business-outline"`.
  - Run `node apps/ssr/scripts/gen-ionicons.mjs`. It fetches from unpkg.
  - `grep -c "^export function Io" apps/ssr/src/components/shell/ionicons.tsx` must print `58`.
- [ ] **Step 2: Strings.**
  - Add every key in the **New** table to en and tr, with the values exactly as written.
  - Apply every row of the **Changed values** table. A `—` cell stays as it is.
  - Run `pnpm --filter ssr run init`.
  - The key-parity check must print `ok`:

```bash
node -e "const r='./apps/ssr/src/language-data/unirefund/SSRService/resources/';const en=require(r+'en.json'),tr=require(r+'tr.json');const a=Object.keys(en);console.log(a.length===Object.keys(tr).length&&a.every(k=>k in tr)?'ok':'mismatch')"
```

  - The duplicate check must print nothing, for both files:

```bash
for f in en tr; do grep -o '^  "[^"]*":' apps/ssr/src/language-data/unirefund/SSRService/resources/$f.json | sort | uniq -d; done
```

- [ ] **Step 3: Gates.** `pnpm --filter ssr type-check` gives 0 errors, and `pnpm --filter ssr lint` gives 0 errors.
- [ ] **Step 4: Commit.**

```bash
git add apps/ssr/scripts/gen-ionicons.mjs apps/ssr/src/components/shell/ionicons.tsx apps/ssr/src/language-data/unirefund/SSRService/resources/en.json apps/ssr/src/language-data/unirefund/SSRService/resources/tr.json
git commit -m "feat(ssr): add the icons and strings for Edit profile, the avatar and Cards"
```

---

### Task 3: Card sheets and the payout hero (web-app)

The five card dialogs become page-width sheets. The add-card form is split so validate keeps its dialog. Today's `CardsView` layout stays for one more task; it only switches to the sheets.

**Files:**
- Create:
  - `S/components/payout-cards/add-card-form.tsx`
  - in `cards/_components/`: `payout-hero.tsx`, `sheet-header.tsx`, `add-card-sheet.tsx`, `add-bank-sheet.tsx`, `edit-nickname-sheet.tsx`, `delete-card-sheet.tsx`, `move-refunds-sheet.tsx`
- Modify: `S/components/payout-cards/add-card-dialog.tsx`, `cards/_components/cards-view.tsx`
- Delete: in `cards/_components/`: `add-bank-dialog.tsx`, `edit-nickname-dialog.tsx`, `delete-card-dialog.tsx`, `move-refunds-dialog.tsx`

**Interfaces:**
- Consumes: Task 1's `payoutTail`; Task 2's strings and `IoClose`, `IoWarningOutline` (existing).
- Produces:
  - `useAddCardForm({ travellerId, onAdded?, onSaved }): AddCardForm` and `AddCardFields({ form })`, from `add-card-form.tsx`.
  - `AddCardDialog`: unchanged props `{ travellerId, onAdded?, trigger?, open?, onOpenChange? }`.
  - `PayoutHero({ kicker, tail, holderName?, meta?, metaSerial?, brand, nickname?, isExpired?, testId? })`.
  - `SheetHeader({ title, description?, closeTestId })`.
  - `AddCardSheet({ travellerId, open, onOpenChange, onAdded })`.
  - `AddBankSheet({ travellerId, open, onOpenChange })`.
  - `EditNicknameSheet({ card, open, onOpenChange, title?, description? })`.
  - `DeleteCardSheet({ open, onOpenChange, onConfirm, title?, description?, plan?, onMoveAndDelete?, onAddCard? })`.
  - `MoveRefundsSheet({ prompt, onOpenChange, onConfirm })` and `type MovePrompt`.

- [ ] **Step 1: The shared add-card form.** Create `S/components/payout-cards/add-card-form.tsx`:

```tsx
"use client";
import {
  extractCaptureViaAction,
  readCardFields,
} from "@/src/components/card-extraction/capture-adapter";
import { buildDocumentCaptureLabels } from "@/src/components/document-capture/labels";
import { useTranslations } from "@/src/providers/i18n";
import type { ExtractionRun } from "@ayasofyazilim-clomerce/capture-platform";
import { postTravellerCardsApi } from "@repo/actions/unirefund/RefundService/post-actions";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import { Input } from "@repo/ayasofyazilim-ui/components/input";
import { Label } from "@repo/ayasofyazilim-ui/components/label";
import { toast } from "@repo/ayasofyazilim-ui/components/sonner";
import {
  CreditCardInput,
  emptyCreditCardValue,
  formatCardNumber,
  luhnValid,
  onlyDigits,
  type CreditCardValue,
} from "@repo/ayasofyazilim-ui/custom/credit-card-input";
import type { UniRefund_RefundService_TravellerCards_TravellerCardDto } from "@repo/saas/RefundService";
import { DocumentCapture } from "@repo/ui/unirefund/document-capture";
import { Camera, Keyboard } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

type Token = UniRefund_RefundService_TravellerCards_TravellerCardDto;

function parseExpiry(expiry: string): { month: number; year: number } | null {
  const match = /^(\d{1,2})\/(\d{2})$/.exec(expiry);
  if (!match) return null;
  const month = Number(match[1]);
  const shortYear = match[2];
  if (month < 1 || month > 12 || !shortYear) return null;
  return { month, year: 2000 + Number(shortYear) };
}

// With `onAdded`, the caller owns the list and the router refresh is skipped.
export function useAddCardForm({
  travellerId,
  onAdded,
  onSaved,
}: {
  travellerId: string;
  onAdded?: (card: Token) => void;
  onSaved: () => void;
}) {
  const { t } = useTranslations();
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [cardValue, setCardValue] =
    useState<CreditCardValue>(emptyCreditCardValue);
  const [nickname, setNickname] = useState("");
  const [scanning, setScanning] = useState(false);

  const reset = useCallback(() => {
    setCardValue(emptyCreditCardValue);
    setNickname("");
    setScanning(false);
  }, []);

  // A scanned number that fails Luhn is still written in: it is usually one digit off, and submit refuses it until fixed.
  const handleExtracted = useCallback(
    (run: ExtractionRun) => {
      const card = readCardFields(run);
      if (!card) {
        toast.error(t.SSRService["CardScanner.ExtractionFailed"]);
        setScanning(false);
        return;
      }
      setCardValue((prev) => ({
        ...prev,
        number: formatCardNumber(card.number),
        expiry: card.expiry ?? prev.expiry,
      }));
      setScanning(false);
      if (!luhnValid(card.number)) {
        toast.warning(t.SSRService["Account.Cards.InvalidCardNumber"]);
      }
    },
    [t]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isPending) return;
    const digitsOnly = onlyDigits(cardValue.number);
    if (digitsOnly.length < 12 || !luhnValid(digitsOnly)) {
      toast.error(t.SSRService["Account.Cards.InvalidCardNumber"]);
      return;
    }
    const expiry = parseExpiry(cardValue.expiry);
    if (!expiry) {
      toast.error(t.SSRService["Account.Cards.InvalidExpiry"]);
      return;
    }
    setIsPending(true);
    try {
      const res = await postTravellerCardsApi({
        travellerId,
        cardNumber: digitsOnly,
        cardExpiryMonth: expiry.month,
        cardExpiryYear: expiry.year,
        holderName: cardValue.name.trim() || undefined,
        nickname: nickname.trim() || undefined,
      });
      if (res.type !== "success") {
        toast.error(res.message);
        return;
      }
      toast.success(t.SSRService["Account.Cards.AddSuccess"]);
      onSaved();
      if (onAdded) onAdded(res.data);
      else router.refresh();
    } catch {
      toast.error(t.SSRService["Account.Cards.ActionFailed"]);
    } finally {
      setIsPending(false);
    }
  }

  return {
    cardValue,
    setCardValue,
    nickname,
    setNickname,
    scanning,
    setScanning,
    isPending,
    reset,
    handleExtracted,
    handleSubmit,
  };
}

export type AddCardForm = ReturnType<typeof useAddCardForm>;

export function AddCardFields({ form }: { form: AddCardForm }) {
  const { t } = useTranslations();
  const copy = t.SSRService;
  const captureLabels = useMemo(() => buildDocumentCaptureLabels(t), [t]);
  return (
    <>
      {form.scanning ? (
        <div className="space-y-3" data-vaul-no-drag="">
          <DocumentCapture
            autoExtract
            detectorTier="ml"
            expectCard
            labels={captureLabels}
            maxAttempts={5}
            maxSeconds={30}
            onExtract={extractCaptureViaAction}
            onExtracted={form.handleExtracted}
            showResult={false}
            testIdPrefix="add-card-capture"
          />
          <Button
            className="w-full"
            data-testid="add-card-enter-manually-button"
            onClick={() => form.setScanning(false)}
            type="button"
            variant="outline"
          >
            <Keyboard className="size-4" />
            {copy["Account.Cards.EnterManually"]}
          </Button>
        </div>
      ) : (
        <Button
          className="w-full"
          data-testid="add-card-scan-button"
          disabled={form.isPending}
          onClick={() => form.setScanning(true)}
          type="button"
          variant="outline"
        >
          <Camera className="size-4" />
          {copy["Account.Cards.ScanCard"]}
        </Button>
      )}
      <CreditCardInput
        disabled={form.isPending}
        fields={{ cvc: false }}
        idPrefix="add-card"
        messages={{
          cardDetailsLabel: copy["Account.Cards.CardDetailsLabel"],
          number: {
            label: copy["Account.Cards.CardNumberLabel"],
            placeholder: copy["Account.Cards.CardNumberPlaceholder"],
          },
          expiry: {
            label: copy["Account.Cards.ExpiryLabel"],
            placeholder: copy["Account.Cards.ExpiryPlaceholder"],
          },
          name: {
            label: copy["Account.Cards.HolderNameLabel"],
            placeholder: copy["Account.Cards.HolderNamePlaceholder"],
          },
          invalidNumber: copy["Account.Cards.InvalidCardNumber"],
        }}
        onValueChange={form.setCardValue}
        value={form.cardValue}
      />
      <div className="space-y-1">
        <Label data-testid="add-card-nickname-label" htmlFor="nickname">
          {copy["Account.Cards.NicknameLabel"]}
        </Label>
        <Input
          data-testid="add-card-nickname-input"
          disabled={form.isPending}
          id="nickname"
          onChange={(e) => form.setNickname(e.target.value)}
          placeholder={copy["Account.Cards.NicknamePlaceholder"]}
          value={form.nickname}
        />
      </div>
    </>
  );
}
```

`data-vaul-no-drag` stops the sheet from being dragged while the camera is in use.

- [ ] **Step 2: Make `AddCardDialog` a thin wrapper.** Replace the body of `S/components/payout-cards/add-card-dialog.tsx` with the following. Its props, its default trigger and every test id stay as they are.

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
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
import { onlyDigits } from "@repo/ayasofyazilim-ui/custom/credit-card-input";
import { CreditCardPreview } from "@repo/ayasofyazilim-ui/custom/credit-card-preview";
import type { UniRefund_RefundService_TravellerCards_TravellerCardDto } from "@repo/saas/RefundService";
import { Plus } from "lucide-react";
import { useState } from "react";
import { AddCardFields, useAddCardForm } from "./add-card-form";

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
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useTranslations();
  const copy = t.SSRService;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const form = useAddCardForm({
    travellerId,
    onAdded,
    onSaved: () => handleOpenChange(false),
  });

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) form.reset();
    setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger asChild data-testid="add-card-trigger">
        {trigger ?? (
          <Button data-testid="add-card-button">
            <Plus className="size-4" />
            {copy["Account.Cards.AddCard"]}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy["Account.Cards.AddCardTitle"]}</DialogTitle>
          <DialogDescription>
            {copy["Account.Cards.AddCardDescription"]}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          data-testid="add-card-form"
          onSubmit={(e) => void form.handleSubmit(e)}
        >
          {!form.scanning && (
            <CreditCardPreview
              className="mb-2"
              expiry={form.cardValue.expiry}
              holderName={form.cardValue.name}
              labels={{
                holderNameLabel: copy["Account.Cards.HolderNameLabel"],
                expiryLabel: copy["Account.Cards.Expiry"],
              }}
              number={onlyDigits(form.cardValue.number)}
            >
              {form.nickname ? <span>{form.nickname}</span> : null}
            </CreditCardPreview>
          )}
          <AddCardFields form={form} />
          <DialogFooter>
            <Button
              data-testid="add-card-submit"
              disabled={form.isPending}
              type="submit"
            >
              {form.isPending
                ? copy["Account.Cards.Adding"]
                : copy["Account.Cards.AddCard"]}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: The payout hero.** Create `cards/_components/payout-hero.tsx`. It copies the app's `PayoutDestination`, and serves the page's hero and the add-card sheet's live preview.

```tsx
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import type { ReactNode } from "react";

export function PayoutHero({
  kicker,
  tail,
  holderName,
  meta,
  metaSerial = true,
  brand,
  nickname,
  isExpired = false,
  testId = "payout-hero",
}: {
  kicker: string;
  tail: string;
  holderName?: string | null;
  meta?: string | null;
  metaSerial?: boolean;
  brand: ReactNode;
  nickname?: string | null;
  isExpired?: boolean;
  testId?: string;
}) {
  return (
    <section
      className={cn(
        "flex min-h-[104px] items-start justify-between gap-3 overflow-hidden rounded-md border border-border bg-card p-4",
        isExpired && "border-warning"
      )}
      data-testid={testId}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {kicker}
        </p>
        <p className="mt-1 truncate font-serial text-3xl font-semibold text-foreground">
          {tail}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4">
          {holderName ? (
            <span className="truncate text-xs uppercase text-muted-foreground">
              {holderName}
            </span>
          ) : null}
          {meta ? (
            <span
              className={cn(
                "text-xs text-muted-foreground",
                metaSerial && "font-serial"
              )}
            >
              {meta}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        {brand}
        {nickname ? (
          <span className="max-w-40 truncate rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-semibold text-foreground">
            {nickname}
          </span>
        ) : null}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: The sheet header.** Create `cards/_components/sheet-header.tsx`. Bottom drawers centre their header, so `text-left!` puts it back on the left, as in the app.

```tsx
"use client";
import { IoClose } from "@/src/components/shell/ionicons";
import { useTranslations } from "@/src/providers/i18n";
import {
  DrawerClose,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@repo/ayasofyazilim-ui/components/drawer";

export function SheetHeader({
  title,
  description,
  closeTestId,
}: {
  title: string;
  description?: string;
  closeTestId: string;
}) {
  const { t } = useTranslations();
  return (
    <DrawerHeader className="gap-1 text-left!">
      <div className="flex items-start justify-between gap-3">
        <DrawerTitle className="text-xl font-bold">{title}</DrawerTitle>
        <DrawerClose
          aria-label={t.SSRService["Header.Back"]}
          className="shrink-0 text-foreground"
          data-testid={closeTestId}
        >
          <IoClose size={22} />
        </DrawerClose>
      </div>
      {description ? (
        <DrawerDescription className="text-left!">{description}</DrawerDescription>
      ) : null}
    </DrawerHeader>
  );
}
```

- [ ] **Step 5: The add-card sheet.** Create `cards/_components/add-card-sheet.tsx`. Like the app, the live preview's kicker is "Card number".

```tsx
"use client";
import {
  AddCardFields,
  useAddCardForm,
} from "@/src/components/payout-cards/add-card-form";
import { useTranslations } from "@/src/providers/i18n";
import { payoutTail } from "@/src/utils/profile/payout-display";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import {
  CardBrandIcon,
  getCardBrand,
} from "@repo/ayasofyazilim-ui/components/card-brand-icon";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
} from "@repo/ayasofyazilim-ui/components/drawer";
import { onlyDigits } from "@repo/ayasofyazilim-ui/custom/credit-card-input";
import type { UniRefund_RefundService_TravellerCards_TravellerCardDto } from "@repo/saas/RefundService";
import { PayoutHero } from "./payout-hero";
import { SheetHeader } from "./sheet-header";

export function AddCardSheet({
  travellerId,
  open,
  onOpenChange,
  onAdded,
}: {
  travellerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (card: UniRefund_RefundService_TravellerCards_TravellerCardDto) => void;
}) {
  const { t } = useTranslations();
  const copy = t.SSRService;
  const form = useAddCardForm({
    travellerId,
    onAdded,
    onSaved: () => handleOpenChange(false),
  });
  const digits = onlyDigits(form.cardValue.number);

  function handleOpenChange(next: boolean) {
    if (!next) form.reset();
    onOpenChange(next);
  }

  return (
    <Drawer
      dismissible={!form.isPending}
      onOpenChange={(next) => {
        if (!form.isPending) handleOpenChange(next);
      }}
      open={open}
    >
      <DrawerContent
        className="mx-auto w-full max-w-3xl md:border-x"
        data-testid="add-card-sheet"
      >
        <SheetHeader
          closeTestId="add-card-close"
          description={copy["Account.Cards.AddCardDescription"]}
          title={copy["Account.Cards.AddCardTitle"]}
        />
        <form
          className="flex min-h-0 flex-1 flex-col"
          data-testid="add-card-form"
          onSubmit={(e) => void form.handleSubmit(e)}
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4">
            {!form.scanning && (
              <PayoutHero
                brand={
                  <CardBrandIcon
                    brand={getCardBrand(digits)}
                    className="size-10"
                  />
                }
                holderName={form.cardValue.name}
                kicker={copy["Account.Cards.CardNumberLabel"]}
                meta={
                  form.cardValue.expiry || copy["Account.Cards.ExpiryPlaceholder"]
                }
                nickname={form.nickname}
                tail={payoutTail(digits)}
                testId="add-card-preview"
              />
            )}
            <AddCardFields form={form} />
          </div>
          <DrawerFooter>
            <Button
              className="h-12 w-full"
              data-testid="add-card-submit"
              disabled={form.isPending}
              type="submit"
            >
              {form.isPending
                ? copy["Account.Cards.Adding"]
                : copy["Account.Cards.AddCard"]}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 6: The add-bank sheet.** Create `cards/_components/add-bank-sheet.tsx`, with the logic of today's `add-bank-dialog.tsx`, now controlled and with explicit pending state. Then delete `add-bank-dialog.tsx`.

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { ibanCountryCode, ibanValid, normalizeIban } from "@/src/utils/utils-iban";
import { postTravellerBankTokenApi } from "@repo/actions/unirefund/RefundService/post-actions";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
} from "@repo/ayasofyazilim-ui/components/drawer";
import { Input } from "@repo/ayasofyazilim-ui/components/input";
import { Label } from "@repo/ayasofyazilim-ui/components/label";
import { toast } from "@repo/ayasofyazilim-ui/components/sonner";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SheetHeader } from "./sheet-header";

const FIELDS = [
  { id: "bank-iban", key: "iban", label: "Account.Banks.IbanLabel", placeholder: "Account.Banks.IbanPlaceholder", testId: "add-bank-iban" },
  { id: "bank-name", key: "bankName", label: "Account.Banks.BankNameLabel", placeholder: "Account.Banks.BankNamePlaceholder", testId: "add-bank-name" },
  { id: "bank-bic", key: "bic", label: "Account.Banks.BicLabel", placeholder: "Account.Banks.BicPlaceholder", testId: "add-bank-bic" },
  { id: "bank-holder", key: "holderName", label: "Account.Banks.AccountHolderLabel", placeholder: "Account.Banks.AccountHolderPlaceholder", testId: "add-bank-holder" },
  { id: "bank-nickname", key: "nickname", label: "Account.Cards.NicknameLabel", placeholder: "Account.Banks.NicknamePlaceholder", testId: "add-bank-nickname" },
] as const;

type BankForm = Record<(typeof FIELDS)[number]["key"], string>;
const EMPTY: BankForm = { iban: "", bankName: "", bic: "", holderName: "", nickname: "" };

export function AddBankSheet({
  travellerId,
  open,
  onOpenChange,
}: {
  travellerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslations();
  const copy = t.SSRService;
  const router = useRouter();
  const [values, setValues] = useState<BankForm>(EMPTY);
  const [pending, setPending] = useState(false);

  function handleOpenChange(next: boolean) {
    if (pending) return;
    if (!next) setValues(EMPTY);
    onOpenChange(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (!ibanValid(values.iban)) {
      toast.error(copy["Account.Banks.InvalidIban"]);
      return;
    }
    setPending(true);
    try {
      const res = await postTravellerBankTokenApi({
        travellerId,
        iban: normalizeIban(values.iban),
        bic: values.bic.trim() || undefined,
        bankName: values.bankName.trim() || undefined,
        // ibanValid has passed, so these are two letters; the DTO types the field as a literal union.
        bankCountryCode: ibanCountryCode(values.iban) as "TR",
        holderName: values.holderName.trim() || undefined,
        nickname: values.nickname.trim() || undefined,
      });
      if (res.type !== "success") {
        toast.error(res.message);
        return;
      }
      toast.success(copy["Account.Banks.AddSuccess"]);
      setValues(EMPTY);
      onOpenChange(false);
      router.refresh();
    } catch {
      toast.error(copy["Account.Cards.ActionFailed"]);
    } finally {
      setPending(false);
    }
  }

  return (
    <Drawer dismissible={!pending} onOpenChange={handleOpenChange} open={open}>
      <DrawerContent
        className="mx-auto w-full max-w-3xl md:border-x"
        data-testid="add-bank-sheet"
      >
        <SheetHeader
          closeTestId="add-bank-close"
          description={copy["Account.Banks.AddBankDescription"]}
          title={copy["Account.Banks.AddBankTitle"]}
        />
        <form
          className="flex min-h-0 flex-1 flex-col"
          data-testid="add-bank-form"
          onSubmit={(e) => void handleSubmit(e)}
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4">
            {FIELDS.map((field) => (
              <div className="space-y-2" key={field.id}>
                <Label data-testid={`${field.testId}-label`} htmlFor={field.id}>
                  {copy[field.label]}
                </Label>
                <Input
                  autoComplete="off"
                  className="h-12"
                  data-testid={`${field.testId}-input`}
                  disabled={pending}
                  id={field.id}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [field.key]: e.target.value }))
                  }
                  placeholder={copy[field.placeholder]}
                  required={field.key === "iban"}
                  value={values[field.key]}
                />
              </div>
            ))}
          </div>
          <DrawerFooter>
            <Button
              className="h-12 w-full"
              data-testid="add-bank-submit"
              disabled={pending}
              type="submit"
            >
              {pending ? copy["Account.Cards.Adding"] : copy["Account.Cards.Save"]}
            </Button>
            <Button
              className="h-12 w-full"
              data-testid="add-bank-cancel"
              disabled={pending}
              onClick={() => handleOpenChange(false)}
              type="button"
              variant="secondary"
            >
              {copy["Account.Cards.Cancel"]}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
```

If `copy[field.label]` fails to type-check, because the `as const` keys are wider than the generated translation type, index with `copy[field.label as keyof typeof copy]`.

- [ ] **Step 7: The rename sheet.** Create `cards/_components/edit-nickname-sheet.tsx`, and delete `edit-nickname-dialog.tsx`. Success now toasts the app's "Name updated".

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { putTravellerCardsByIdNicknameApi } from "@repo/actions/unirefund/RefundService/put-actions";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
} from "@repo/ayasofyazilim-ui/components/drawer";
import { Input } from "@repo/ayasofyazilim-ui/components/input";
import { Label } from "@repo/ayasofyazilim-ui/components/label";
import { toast } from "@repo/ayasofyazilim-ui/components/sonner";
import type { UniRefund_RefundService_TravellerCards_TravellerCardDto } from "@repo/saas/RefundService";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SheetHeader } from "./sheet-header";

export function EditNicknameSheet({
  card,
  open,
  onOpenChange,
  title,
  description,
}: {
  card: UniRefund_RefundService_TravellerCards_TravellerCardDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
}) {
  const { t } = useTranslations();
  const copy = t.SSRService;
  const router = useRouter();
  const [nickname, setNickname] = useState(card.nickname ?? "");
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const res = await putTravellerCardsByIdNicknameApi({ id: card.id, nickname });
      if (res.type !== "success") {
        toast.error(res.message);
        return;
      }
      toast.success(copy["Account.Cards.RenameSuccess"]);
      onOpenChange(false);
      router.refresh();
    } catch {
      toast.error(copy["Account.Cards.ActionFailed"]);
    } finally {
      setPending(false);
    }
  }

  return (
    <Drawer
      dismissible={!pending}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
      open={open}
    >
      <DrawerContent
        className="mx-auto w-full max-w-3xl md:border-x"
        data-testid="edit-nickname-sheet"
      >
        <SheetHeader
          closeTestId="edit-nickname-close"
          description={description ?? copy["Account.Cards.EditNicknameDescription"]}
          title={title ?? copy["Account.Cards.EditNicknameTitle"]}
        />
        <form
          className="flex flex-col"
          data-testid="edit-nickname-form"
          onSubmit={(e) => void handleSubmit(e)}
        >
          <div className="space-y-1.5 px-4">
            <Label data-testid="edit-nickname-label" htmlFor="nickname">
              {copy["Account.Cards.NicknameLabel"]}
            </Label>
            <Input
              autoFocus
              className="h-12"
              data-testid="edit-nickname-input"
              disabled={pending}
              id="nickname"
              maxLength={100}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={copy["Account.Cards.NicknamePlaceholder"]}
              value={nickname}
            />
          </div>
          <DrawerFooter>
            <Button
              className="h-12 w-full"
              data-testid="edit-nickname-submit"
              disabled={pending}
              type="submit"
            >
              {pending ? copy["Account.Cards.Saving"] : copy["Account.Cards.Save"]}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 8: The delete sheet.** Create `cards/_components/delete-card-sheet.tsx`, and delete `delete-card-dialog.tsx`. The state, `target`, `handleDelete`, `handleMoveAndDelete`, `body` and `failureText` are today's, copied verbatim from `delete-card-dialog.tsx` lines 52–113. Only the wrapper, the failure box and the button stack change, to the app's `DeleteTokenSheet` order.

```tsx
"use client";
import {
  CardOption,
  maskedTail,
} from "@/src/components/payout-cards/card-option";
import { fill } from "@/src/components/payout-cards/fill";
import {
  defaultAlreadyChanged,
  nextFailure,
  type DeleteFailure,
  type DeleteOutcome,
} from "@/src/components/payout-cards/move-refunds";
import type { DeletePlan } from "@/src/components/payout-cards/open-refunds";
import { IoWarningOutline } from "@/src/components/shell/ionicons";
import { useTranslations } from "@/src/providers/i18n";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
} from "@repo/ayasofyazilim-ui/components/drawer";
import type { UniRefund_RefundService_TravellerCards_TravellerCardDto } from "@repo/saas/RefundService";
import { useState } from "react";
import { SheetHeader } from "./sheet-header";

type Token = UniRefund_RefundService_TravellerCards_TravellerCardDto;

const PLAIN: DeletePlan = { kind: "plain" };

export function DeleteCardSheet({
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
        ? plan.choices.find((card) => card.id === pickedId) ?? plan.preselected
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

  const body =
    plan.kind === "moveToHero"
      ? fill(copy["Account.Cards.DeleteMove.MoveToHero"], {
          card: maskedTail(plan.hero),
        })
      : plan.kind === "choose"
        ? copy["Account.Cards.DeleteMove.Choose"]
        : plan.kind === "noTarget"
          ? copy["Account.Cards.DeleteMove.NoTarget"]
          : description ?? copy["Account.Cards.DeleteDescription"];

  const failureText = !failure
    ? null
    : failure.status === "deleteFailed"
      ? copy["Account.Cards.DeleteMove.DeleteFailed"]
      : defaultAlreadyChanged(failure)
        ? copy["Account.Cards.DeleteMove.MoveFailedDefaultChanged"]
        : copy["Account.Cards.DeleteMove.MoveFailed"];

  return (
    <Drawer
      dismissible={!busy}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
      open={open}
    >
      <DrawerContent
        className="mx-auto w-full max-w-3xl md:border-x"
        data-testid="delete-card-sheet"
      >
        <SheetHeader
          closeTestId="delete-card-close"
          description={body}
          title={title ?? copy["Account.Cards.DeleteTitle"]}
        />
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4">
          {plan.kind === "choose" ? (
            <div className="flex flex-col gap-2" data-testid="delete-card-choices">
              {plan.choices.map((card) => (
                <CardOption
                  key={card.id}
                  onSelect={() => {
                    setPickedId(card.id);
                    setFailure(null);
                  }}
                  selected={card.id === target?.id}
                  token={card}
                />
              ))}
            </div>
          ) : null}
          {failureText ? (
            <div
              className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-surface p-3 text-sm text-warning"
              data-testid="delete-card-failed"
            >
              <IoWarningOutline className="mt-0.5 shrink-0" size={16} />
              <span>{failureText}</span>
            </div>
          ) : null}
        </div>
        <DrawerFooter>
          {plan.kind === "noTarget" ? (
            <>
              {onAddCard ? (
                <Button
                  className="h-12 w-full"
                  data-testid="delete-card-add"
                  disabled={busy}
                  onClick={onAddCard}
                  type="button"
                >
                  {copy["Account.Cards.AddCard"]}
                </Button>
              ) : null}
              <Button
                className="h-12 w-full"
                data-testid="delete-card-anyway"
                disabled={busy}
                onClick={() => void handleDelete()}
                type="button"
                variant="secondary"
              >
                {copy["Account.Cards.DeleteMove.DeleteAnyway"]}
              </Button>
            </>
          ) : (
            <Button
              className="h-12 w-full"
              data-testid="delete-card-confirm"
              disabled={busy}
              onClick={() =>
                void (target ? handleMoveAndDelete() : handleDelete())
              }
              type="button"
            >
              {failure
                ? copy["Account.Cards.MoveRefunds.TryAgain"]
                : copy["Account.Cards.Delete"]}
            </Button>
          )}
          <Button
            className="h-12 w-full"
            data-testid="delete-card-cancel"
            disabled={busy}
            onClick={() => onOpenChange(false)}
            type="button"
            variant={plan.kind === "noTarget" ? "ghost" : "secondary"}
          >
            {copy["Account.Cards.Cancel"]}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 9: The move sheet.** Create `cards/_components/move-refunds-sheet.tsx`, and delete `move-refunds-dialog.tsx`. `MovePrompt`, `handleConfirm` and `failureText` are today's, verbatim.

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
import { IoWarningOutline } from "@/src/components/shell/ionicons";
import { useTranslations } from "@/src/providers/i18n";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
} from "@repo/ayasofyazilim-ui/components/drawer";
import type { UniRefund_RefundService_TravellerCards_TravellerCardDto } from "@repo/saas/RefundService";
import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { SheetHeader } from "./sheet-header";

type Token = UniRefund_RefundService_TravellerCards_TravellerCardDto;

export type MovePrompt = {
  mode: "afterDefault" | "afterAdd";
  target: Token;
};

export function MoveRefundsSheet({
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
  const values = { card: maskedTail(prompt.target) };

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
    <Drawer
      dismissible={!busy}
      onOpenChange={(open) => {
        if (!busy) onOpenChange(open);
      }}
      open
    >
      <DrawerContent
        className="mx-auto w-full max-w-3xl md:border-x"
        data-testid="move-refunds-sheet"
      >
        <SheetHeader
          closeTestId="move-refunds-close"
          description={
            prompt.mode === "afterAdd"
              ? copy["Account.Cards.MoveRefunds.AfterAdd"]
              : fill(copy["Account.Cards.MoveRefunds.AfterDefault"], values)
          }
          title={
            prompt.mode === "afterAdd"
              ? fill(copy["Account.Cards.MoveRefunds.UseTitle"], values)
              : copy["Account.Cards.MoveRefunds.MoveTitle"]
          }
        />
        {failureText ? (
          <div
            className="mx-4 flex items-start gap-2 rounded-md border border-warning/40 bg-warning-surface p-3 text-sm text-warning"
            data-testid="move-refunds-failed"
          >
            <IoWarningOutline className="mt-0.5 shrink-0" size={16} />
            <span>{failureText}</span>
          </div>
        ) : null}
        <DrawerFooter>
          <Button
            className="h-12 w-full"
            data-testid="move-refunds-confirm"
            disabled={busy}
            onClick={() => void handleConfirm()}
            type="button"
          >
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {failure
              ? copy["Account.Cards.MoveRefunds.TryAgain"]
              : prompt.mode === "afterAdd"
                ? copy["Account.Cards.MoveRefunds.Use"]
                : copy["Account.Cards.MoveRefunds.Move"]}
          </Button>
          <Button
            className="h-12 w-full"
            data-testid="move-refunds-dismiss"
            disabled={busy}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="secondary"
          >
            {defaultAlreadyChanged(failure)
              ? copy["Account.Cards.MoveRefunds.Close"]
              : copy["Account.Cards.MoveRefunds.NotNow"]}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 10: Wire today's `cards-view.tsx` to the sheets.** Task 4 replaces this layout. These edits only keep it working.
  1. Replace the imports of `AddCardDialog`, `AddBankDialog`, `DeleteCardDialog`, `EditNicknameDialog` and `MoveRefundsDialog, type MovePrompt` with:

```tsx
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import { AddBankSheet } from "./add-bank-sheet";
import { AddCardSheet } from "./add-card-sheet";
import { DeleteCardSheet } from "./delete-card-sheet";
import { EditNicknameSheet } from "./edit-nickname-sheet";
import { MoveRefundsSheet, type MovePrompt } from "./move-refunds-sheet";
```

     Add `Plus` to the existing `lucide-react` import (`CreditCard, Landmark, Plus`).
  2. Under `const [addOpen, setAddOpen] = useState(false);` add `const [addBankOpen, setAddBankOpen] = useState(false);`.
  3. Replace the `<AddCardDialog … />` block in the Cards header with:

```tsx
{grants.add ? (
  <Button data-testid="add-card-button" onClick={() => setAddOpen(true)}>
    <Plus className="size-4" />
    {t.SSRService["Account.Cards.AddCard"]}
  </Button>
) : null}
```

  4. Replace `{grants.addBank ? <AddBankDialog travellerId={travellerId} /> : null}` with:

```tsx
{grants.addBank ? (
  <Button data-testid="add-bank-button" onClick={() => setAddBankOpen(true)} variant="outline">
    <Plus className="size-4" />
    {t.SSRService["Account.Banks.AddBank"]}
  </Button>
) : null}
```

  5. Rename the JSX tags `EditNicknameDialog` → `EditNicknameSheet`, `DeleteCardDialog` → `DeleteCardSheet` and `MoveRefundsDialog` → `MoveRefundsSheet`. Their props do not change.
  6. Before the closing `</section>`, add:

```tsx
{grants.add ? (
  <AddCardSheet
    onAdded={handleAdded}
    onOpenChange={setAddOpen}
    open={addOpen}
    travellerId={travellerId}
  />
) : null}
{grants.addBank ? (
  <AddBankSheet
    onOpenChange={setAddBankOpen}
    open={addBankOpen}
    travellerId={travellerId}
  />
) : null}
```

- [ ] **Step 11: Gates.**
  - `grep -rn "add-bank-dialog\|edit-nickname-dialog\|delete-card-dialog\|move-refunds-dialog" apps/ssr/src` prints nothing.
  - `pnpm --filter ssr test:unit` passes, `pnpm --filter ssr type-check` gives 0 errors and `pnpm --filter ssr lint` gives 0 errors.
- [ ] **Step 12: Commit.**

```bash
git add apps/ssr/src/components/payout-cards/add-card-form.tsx apps/ssr/src/components/payout-cards/add-card-dialog.tsx "apps/ssr/src/app/[lang]/(main)/profile/cards/_components/"
git commit -m "feat(ssr): turn the card dialogs into page-width sheets with the app's wording"
```

Staging the `_components/` directory by name picks up the new files and the four deletions. Check with `git status --short` that nothing outside it is staged.

---

### Task 4: The Cards page: hero, tiles and load states (web-app)

**Files:**
- Create: `cards/_components/payout-tile.tsx`, `cards/_components/add-payout-tile.tsx`
- Modify: `cards/_components/cards-view.tsx` (rewritten), `cards/page.tsx`
- Delete: `cards/_components/card-row.tsx`, `bank-row.tsx`, `token-hero-actions.tsx`, `bank-account-preview.tsx`

**Interfaces:**
- Consumes:
  - Task 1: `payoutTail`, `payoutExpiry`, `cardTileTitle`, `cardTileSubline`, `bankTileTitle`, `showLastUsed`, `tileSelector`, `TileSelector`, `cardsViewState`.
  - Task 2: `IoCreateOutline`, `IoTrashOutline`, `IoBusinessOutline`, and the strings.
  - Task 3: `PayoutHero`, `AddCardSheet`, `AddBankSheet`, `EditNicknameSheet`, `DeleteCardSheet`, `MoveRefundsSheet`, `MovePrompt`.
- Produces:
  - `PayoutTile({ id, leading, title, subline, selector, isDestination, isExpired, isPending, disabled, lastUsed, onSelect?, onRename?, onDelete?, onReplace? })`.
  - `AddPayoutTile({ label, onClick, testId })`.
  - `CardsView({ cards: Token[] | null, travellerId, hasOpenRefunds })`.

- [ ] **Step 1: The tile.** Create `cards/_components/payout-tile.tsx`, the app's `MethodTile`:

```tsx
"use client";
import {
  IoCheckmark,
  IoCreateOutline,
  IoTrashOutline,
} from "@/src/components/shell/ionicons";
import { useTranslations } from "@/src/providers/i18n";
import type { TileSelector } from "@/src/utils/profile/payout-display";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import type { ReactNode } from "react";

export function PayoutTile({
  id,
  leading,
  title,
  subline,
  selector,
  isDestination,
  isExpired,
  isPending,
  disabled,
  lastUsed,
  onSelect,
  onRename,
  onDelete,
  onReplace,
}: {
  id: string;
  leading: ReactNode;
  title: string;
  subline: string;
  selector: TileSelector;
  isDestination: boolean;
  isExpired: boolean;
  isPending: boolean;
  disabled: boolean;
  lastUsed: boolean;
  onSelect?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  onReplace?: () => void;
}) {
  const { t } = useTranslations();
  const copy = t.SSRService;
  const titleClass =
    "min-w-0 shrink truncate text-left text-base font-semibold text-foreground";
  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-md border border-border bg-card p-4",
        isDestination && "border-primary",
        isPending && "opacity-50",
        isExpired && "border-l-[3px] border-l-warning"
      )}
      data-testid={`payout-tile-${id}`}
    >
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-foreground/5 text-foreground">
          {leading}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2">
            {onRename ? (
              <button
                className={titleClass}
                data-testid={`payout-tile-title-${id}`}
                disabled={disabled}
                onClick={onRename}
                type="button"
              >
                {title}
              </button>
            ) : (
              <p className={titleClass}>{title}</p>
            )}
            {lastUsed ? (
              <span className="shrink-0 rounded-full bg-info-surface px-2 py-0.5 text-[10px] font-semibold text-info-strong">
                {copy["Account.Cards.LastUsed"]}
              </span>
            ) : null}
          </div>
          {subline ? (
            <p className="truncate font-serial text-xs text-muted-foreground">
              {subline}
            </p>
          ) : null}
        </div>
        {selector === "check" ? (
          <span
            aria-label={copy["Account.Cards.Default"]}
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
            role="img"
          >
            <IoCheckmark size={14} />
          </span>
        ) : selector === "select" && onSelect ? (
          <button
            aria-label={copy["Account.Cards.SetDefault"]}
            className="shrink-0 p-1"
            data-testid={`payout-tile-select-${id}`}
            disabled={disabled}
            onClick={onSelect}
            title={copy["Account.Cards.SetDefault"]}
            type="button"
          >
            <span className="block size-6 rounded-full border-2 border-input" />
          </button>
        ) : null}
        {onRename ? (
          <button
            aria-label={copy["Account.Cards.EditNicknameTitle"]}
            className="shrink-0 p-1 text-muted-foreground"
            data-testid={`payout-tile-rename-${id}`}
            disabled={disabled}
            onClick={onRename}
            title={copy["Account.Cards.EditNicknameTitle"]}
            type="button"
          >
            <IoCreateOutline size={20} />
          </button>
        ) : null}
        {onDelete ? (
          <button
            aria-label={copy["Account.Cards.Delete"]}
            className="shrink-0 p-1 text-primary"
            data-testid={`payout-tile-delete-${id}`}
            disabled={disabled}
            onClick={onDelete}
            title={copy["Account.Cards.Delete"]}
            type="button"
          >
            <IoTrashOutline size={20} />
          </button>
        ) : null}
      </div>
      {isExpired ? (
        <div className="flex items-center justify-between gap-2 rounded-md bg-warning-surface px-3 py-2">
          <p className="flex-1 text-[11px] font-semibold text-warning">
            {copy["Account.Cards.ExpiredCannotReceive"]}
          </p>
          {onReplace ? (
            <button
              className="text-[11px] font-semibold text-warning underline"
              data-testid={`payout-tile-replace-${id}`}
              disabled={disabled}
              onClick={onReplace}
              type="button"
            >
              {copy["Account.Cards.Replace"]}
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
```

- [ ] **Step 2: The add tile.** Create `cards/_components/add-payout-tile.tsx`, the app's dashed `AddMethodTile`:

```tsx
import { IoAddOutline } from "@/src/components/shell/ionicons";

export function AddPayoutTile({
  label,
  onClick,
  testId,
}: {
  label: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      className="flex min-h-16 items-center justify-center gap-2 rounded-md border border-dashed border-input p-4 text-base font-semibold text-primary"
      data-testid={testId}
      onClick={onClick}
      type="button"
    >
      <IoAddOutline size={20} />
      {label}
    </button>
  );
}
```

- [ ] **Step 3: Rewrite `cards/_components/cards-view.tsx`.** Every tile lists every card, as in the app. The hero is `partitionTokens`' choice, and its tile carries `border-primary`. `handleMove`, `handleMoveAndDelete` and `openDelete` keep today's logic.

```tsx
"use client";
import { cardGrants } from "@/src/components/payout-cards/card-grants";
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
  type DeletePlan,
} from "@/src/components/payout-cards/open-refunds";
import {
  IoAddOutline,
  IoBusinessOutline,
  IoCardOutline,
} from "@/src/components/shell/ionicons";
import { useTranslations } from "@/src/providers/i18n";
import {
  bankTileTitle,
  cardsViewState,
  cardTileSubline,
  cardTileTitle,
  payoutExpiry,
  payoutTail,
  showLastUsed,
  tileSelector,
} from "@/src/utils/profile/payout-display";
import { maskIban } from "@/src/utils/utils-iban";
import { deleteTravellerCardsByIdApi } from "@repo/actions/unirefund/RefundService/delete-actions";
import { postTravellerCardsByIdSetDefaultApi } from "@repo/actions/unirefund/RefundService/post-actions";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import {
  CardBrandIcon,
  getCardBrand,
} from "@repo/ayasofyazilim-ui/components/card-brand-icon";
import { toast } from "@repo/ayasofyazilim-ui/components/sonner";
import type { UniRefund_RefundService_TravellerCards_TravellerCardDto } from "@repo/saas/RefundService";
import { useApplicationConfiguration } from "@repo/utils/app-config";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { partitionTokens } from "../partition-tokens";
import { AddBankSheet } from "./add-bank-sheet";
import { AddCardSheet } from "./add-card-sheet";
import { AddPayoutTile } from "./add-payout-tile";
import { DeleteCardSheet } from "./delete-card-sheet";
import { EditNicknameSheet } from "./edit-nickname-sheet";
import { moveCalls } from "./move-calls";
import { MoveRefundsSheet, type MovePrompt } from "./move-refunds-sheet";
import { PayoutHero } from "./payout-hero";
import { PayoutTile } from "./payout-tile";

type Token = UniRefund_RefundService_TravellerCards_TravellerCardDto;

function EmptyState({
  icon,
  title,
  description,
  testId,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  testId: string;
}) {
  return (
    <section
      className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border p-6 text-center"
      data-testid={testId}
    >
      {icon}
      <p className="text-base font-semibold text-foreground">{title}</p>
      <p className="text-sm text-muted-foreground">{description}</p>
    </section>
  );
}

function SectionHeading({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </h2>
      <span className="text-xs text-muted-foreground">{count}</span>
    </div>
  );
}

export function CardsView({
  cards,
  travellerId,
  hasOpenRefunds,
}: {
  cards: Token[] | null;
  travellerId: string;
  hasOpenRefunds: boolean;
}) {
  const { t } = useTranslations();
  const copy = t.SSRService;
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  // A refresh that fails keeps the last good list on screen, under the amber banner.
  const [lastGood, setLastGood] = useState<Token[] | null>(cards);
  if (cards && cards !== lastGood) setLastGood(cards);
  const view = cardsViewState(cards, lastGood);
  const tokens = view.kind === "ready" ? view.tokens : null;

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [editingToken, setEditingToken] = useState<Token | null>(null);
  const [deletingToken, setDeletingToken] = useState<Token | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<DeletePlan>({
    kind: "plain",
  });
  const [movePrompt, setMovePrompt] = useState<MovePrompt | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addBankOpen, setAddBankOpen] = useState(false);
  const { policies } = useApplicationConfiguration();
  const grants = cardGrants(policies);

  // Wallet tokens are dropped: there is no add flow and no honest display for them.
  const cardTokens = useMemo(
    () => (tokens ?? []).filter((c) => c.type === "Card"),
    [tokens]
  );
  const bankTokens = useMemo(
    () => (tokens ?? []).filter((c) => c.type === "Bank"),
    [tokens]
  );
  const heroCard = useMemo(() => partitionTokens(cardTokens).hero, [cardTokens]);
  const heroBank = useMemo(() => partitionTokens(bankTokens).hero, [bankTokens]);
  const busy = pendingId !== null;

  function refresh() {
    startRefresh(() => router.refresh());
  }

  async function handleSetDefault(token: Token) {
    if (busy) return;
    const isBank = token.type === "Bank";
    setPendingId(token.id);
    try {
      const res = await postTravellerCardsByIdSetDefaultApi(token.id);
      if (res.type !== "success") {
        toast.error(res.message);
        return;
      }
      if (!isBank && hasOpenRefunds) {
        setMovePrompt({
          mode: "afterDefault",
          target: { ...token, isDefault: true },
        });
      } else {
        toast.success(
          copy[
            isBank
              ? "Account.Banks.SetDefaultSuccess"
              : "Account.Cards.SetDefaultSuccess"
          ]
        );
      }
      refresh();
    } catch {
      toast.error(copy["Account.Cards.ActionFailed"]);
    } finally {
      setPendingId(null);
    }
  }

  async function handleDelete(token: Token) {
    const isBank = token.type === "Bank";
    try {
      const res = await deleteTravellerCardsByIdApi(token.id);
      if (res.type !== "success") {
        toast.error(res.message);
        return;
      }
      toast.success(
        copy[isBank ? "Account.Banks.DeleteSuccess" : "Account.Cards.DeleteSuccess"]
      );
      refresh();
    } catch {
      toast.error(copy["Account.Cards.ActionFailed"]);
    }
  }

  function openDelete(token: Token) {
    setDeletingToken(token);
    setDeletingPlan(
      token.type === "Card"
        ? deletePlan(token, cardTokens, heroCard, hasOpenRefunds)
        : { kind: "plain" }
    );
  }

  function handleAdded(card: Token) {
    refresh();
    if (!hasOpenRefunds) return;
    // Re-adding a saved card returns the existing token, which may already be the default.
    setMovePrompt({
      mode: card.isDefault ? "afterDefault" : "afterAdd",
      target: card,
    });
  }

  async function handleMove(target: Token): Promise<MoveOutcome> {
    const outcome = await moveOpenRefunds(target, moveCalls);
    if (outcome.status === "moved") {
      toast.success(
        fill(copy["Account.Cards.MoveRefunds.Moved"], { card: maskedTail(target) })
      );
    }
    refresh();
    return outcome;
  }

  async function handleMoveAndDelete(
    id: string,
    target: Token
  ): Promise<DeleteOutcome> {
    const outcome = await deleteMovingRefunds(id, target, moveCalls);
    if (outcome.status === "deleted") {
      toast.success(
        fill(copy["Account.Cards.DeleteMove.MovedAndDeleted"], {
          card: maskedTail(target),
        })
      );
    }
    refresh();
    return outcome;
  }

  if (view.kind === "error") {
    return (
      <section
        className="flex flex-col items-center gap-3 py-10"
        data-testid="cards-load-failed"
      >
        <p className="text-center text-muted-foreground">
          {copy["Account.Cards.LoadFailed"]}
        </p>
        <Button
          className="w-40"
          data-testid="cards-retry"
          disabled={isRefreshing}
          onClick={refresh}
        >
          {copy["Account.Cards.Retry"]}
        </Button>
      </section>
    );
  }

  const tileActions = (token: Token) => ({
    disabled: busy,
    isPending: pendingId === token.id,
    onDelete: grants.remove ? () => openDelete(token) : undefined,
    onRename: grants.rename ? () => setEditingToken(token) : undefined,
    onSelect: () => void handleSetDefault(token),
  });

  const deletingIsBank = deletingToken?.type === "Bank";
  const editingIsBank = editingToken?.type === "Bank";

  return (
    <div className="flex flex-col gap-6 pb-8" data-testid="cards-view">
      {view.stale ? (
        <div
          className="flex items-center justify-between gap-3 rounded-md border border-warning/40 bg-warning-surface px-4 py-3"
          data-testid="cards-stale"
        >
          <p className="flex-1 text-sm text-warning">
            {copy["Account.Cards.LoadFailed"]}
          </p>
          <button
            className="text-sm font-semibold text-warning"
            data-testid="cards-stale-retry"
            disabled={isRefreshing}
            onClick={refresh}
            type="button"
          >
            {copy["Account.Cards.Retry"]}
          </button>
        </div>
      ) : null}

      {heroCard ? (
        <PayoutHero
          brand={
            <CardBrandIcon
              brand={getCardBrand(heroCard.maskedNumber)}
              className="size-10"
            />
          }
          holderName={heroCard.holderName}
          isExpired={heroCard.isExpired}
          kicker={copy["Account.Cards.DefaultCard"]}
          meta={
            payoutExpiry(heroCard.expiryMonth, heroCard.expiryYear) ||
            copy["Account.Cards.ExpiryPlaceholder"]
          }
          nickname={heroCard.nickname}
          tail={payoutTail(heroCard.maskedNumber)}
        />
      ) : (
        <EmptyState
          description={copy["Account.Cards.NoCardsDescription"]}
          icon={<IoCardOutline className="text-muted-foreground" size={32} />}
          testId="cards-empty"
          title={copy["Account.Cards.NoCards"]}
        />
      )}

      {cardTokens.length > 0 ? (
        <section className="flex flex-col gap-3" data-testid="cards-section">
          <SectionHeading
            count={cardTokens.length}
            label={copy["Account.Cards.CardsSection"]}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {cardTokens.map((card) => {
              const isDestination = card.id === heroCard?.id;
              return (
                <PayoutTile
                  {...tileActions(card)}
                  id={card.id}
                  isDestination={isDestination}
                  isExpired={card.isExpired}
                  key={card.id}
                  lastUsed={showLastUsed(card)}
                  leading={
                    <CardBrandIcon
                      brand={getCardBrand(card.maskedNumber)}
                      className="size-7"
                    />
                  }
                  onReplace={grants.add ? () => setAddOpen(true) : undefined}
                  selector={tileSelector(card, isDestination, grants.setDefault)}
                  subline={cardTileSubline(card)}
                  title={cardTileTitle(card)}
                />
              );
            })}
            {grants.add ? (
              <AddPayoutTile
                label={copy["Account.Cards.AddCard"]}
                onClick={() => setAddOpen(true)}
                testId="add-card-tile"
              />
            ) : null}
          </div>
        </section>
      ) : grants.add ? (
        <Button
          className="h-12 w-full"
          data-testid="add-card-button"
          onClick={() => setAddOpen(true)}
        >
          <IoAddOutline size={20} />
          {copy["Account.Cards.AddCard"]}
        </Button>
      ) : null}

      {grants.addBank ? (
        <section className="flex flex-col gap-3" data-testid="banks-section">
          <SectionHeading
            count={bankTokens.length}
            label={copy["Account.Banks.Title"]}
          />
          {heroBank ? (
            <PayoutHero
              brand={<IoBusinessOutline className="text-foreground" size={40} />}
              holderName={heroBank.holderName}
              kicker={copy["Account.Banks.DefaultBank"]}
              meta={heroBank.bankName}
              metaSerial={false}
              nickname={heroBank.nickname}
              tail={maskIban(heroBank.maskedNumber)}
              testId="bank-hero"
            />
          ) : (
            <EmptyState
              description={copy["Account.Banks.NoBanksDescription"]}
              icon={
                <IoBusinessOutline className="text-muted-foreground" size={32} />
              }
              testId="banks-empty"
              title={copy["Account.Banks.NoBanks"]}
            />
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {bankTokens.map((bank) => {
              const isDestination = bank.id === heroBank?.id;
              return (
                <PayoutTile
                  {...tileActions(bank)}
                  id={bank.id}
                  isDestination={isDestination}
                  isExpired={false}
                  key={bank.id}
                  lastUsed={showLastUsed(bank)}
                  leading={<IoBusinessOutline size={18} />}
                  selector={tileSelector(bank, isDestination, grants.setDefault)}
                  subline={maskIban(bank.maskedNumber)}
                  title={bankTileTitle(bank, copy["Account.Banks.Unnamed"])}
                />
              );
            })}
            <AddPayoutTile
              label={copy["Account.Banks.AddBank"]}
              onClick={() => setAddBankOpen(true)}
              testId="add-bank-tile"
            />
          </div>
        </section>
      ) : null}

      {grants.add ? (
        <AddCardSheet
          onAdded={handleAdded}
          onOpenChange={setAddOpen}
          open={addOpen}
          travellerId={travellerId}
        />
      ) : null}
      {grants.addBank ? (
        <AddBankSheet
          onOpenChange={setAddBankOpen}
          open={addBankOpen}
          travellerId={travellerId}
        />
      ) : null}
      {editingToken ? (
        <EditNicknameSheet
          card={editingToken}
          description={
            editingIsBank ? copy["Account.Banks.EditNicknameDescription"] : undefined
          }
          onOpenChange={(open) => {
            if (!open) setEditingToken(null);
          }}
          open
          title={editingIsBank ? copy["Account.Banks.EditNicknameTitle"] : undefined}
        />
      ) : null}
      {deletingToken ? (
        <DeleteCardSheet
          description={
            deletingIsBank ? copy["Account.Banks.DeleteDescription"] : undefined
          }
          onAddCard={
            grants.add
              ? () => {
                  setDeletingToken(null);
                  setAddOpen(true);
                }
              : undefined
          }
          onConfirm={() => handleDelete(deletingToken)}
          onMoveAndDelete={(target) =>
            handleMoveAndDelete(deletingToken.id, target)
          }
          onOpenChange={(open) => {
            if (!open) setDeletingToken(null);
          }}
          open
          plan={deletingPlan}
          title={deletingIsBank ? copy["Account.Banks.DeleteTitle"] : undefined}
        />
      ) : null}
      {movePrompt ? (
        <MoveRefundsSheet
          onConfirm={handleMove}
          onOpenChange={(open) => {
            if (!open) setMovePrompt(null);
          }}
          prompt={movePrompt}
        />
      ) : null}
    </div>
  );
}
```

If `copy[cond ? "A" : "B"]` does not type-check against the generated translation type, write it as `cond ? copy["A"] : copy["B"]`.

- [ ] **Step 4: The page passes `null` on failure.** In `cards/page.tsx`:
  - Remove the `ErrorComponent` import and its early return.
  - Replace everything from `const [cardsResponse] = …` to the end of the function with:

```tsx
  const loaded = "message" in apiRequests ? null : apiRequests;
  const cardsResponse = loaded?.requiredRequests[0];
  const tagsResponse = loaded?.optionalRequests[0];

  return (
    <TabPage>
      <PageHeader
        backHref={`/${lang}/profile`}
        title={t.SSRService["Account.Cards.Title"]}
      />
      <p className="-mt-2 mb-4 text-base text-muted-foreground">
        {t.SSRService["Account.Cards.Description"]}
      </p>
      <CardsView
        cards={cardsResponse ? (cardsResponse.data.items ?? []) : null}
        hasOpenRefunds={
          tagsResponse?.status === "fulfilled" &&
          tagsResponse.value.type === "success" &&
          hasOpenRefunds(tagsResponse.value.data.items ?? [])
        }
        travellerId={travellerId}
      />
    </TabPage>
  );
```

  - Keep `getApiRequests` as it is. It still rethrows redirect errors.

- [ ] **Step 5: Delete the old pieces.**
  - Delete `card-row.tsx`, `bank-row.tsx`, `token-hero-actions.tsx` and `bank-account-preview.tsx` from `cards/_components/`.
  - `grep -rn "card-row\|bank-row\|token-hero-actions\|bank-account-preview" apps/ssr/src` prints nothing.
- [ ] **Step 6: Gates.** `pnpm --filter ssr test:unit` passes, `pnpm --filter ssr type-check` gives 0 errors and `pnpm --filter ssr lint` gives 0 errors.
- [ ] **Step 7: Commit.**

```bash
git add "apps/ssr/src/app/[lang]/(main)/profile/cards/"
git commit -m "feat(ssr): rebuild Cards as the app's hero and tiles, with load-failed states"
```

---

### Task 5: Edit profile as one form (web-app)

**Files:**
- Create: `(main)/profile/edit-profile/_components/edit-profile-form.tsx`
- Modify: `(main)/profile/edit-profile/page.tsx`
- Delete: `(main)/profile/edit-profile/_components/account-form.tsx`

**Interfaces:**
- Consumes:
  - Task 1: `ProfileDraft`, `PhoneState`, `canSaveProfile`, `phoneStateFor`, `phoneBlocksSave`, `profileUpdateBody`.
  - Task 2: `IoAtOutline`, `IoMailOutline`, `IoPersonOutline` (existing), and the `Profile.Edit.*` strings.
  - SP2: `PinnedBar`, `TabPage pinnedBar`.
- Produces: `EditProfileForm({ profile })`.

- [ ] **Step 1: The form.** Create `edit-profile/_components/edit-profile-form.tsx`. Save sits in `PinnedBar`, outside the form, and submits it with `form=`, so the browser still checks `type="email"`. After a successful save `saving` stays true, so a second tap cannot send a second PUT while the page navigates away.

```tsx
"use client";
import {
  IoAtOutline,
  IoMailOutline,
  IoPersonOutline,
} from "@/src/components/shell/ionicons";
import { PinnedBar } from "@/src/components/shell/pinned-bar";
import { useTranslations } from "@/src/providers/i18n";
import {
  canSaveProfile,
  phoneBlocksSave,
  phoneStateFor,
  profileUpdateBody,
  type PhoneState,
  type ProfileDraft,
} from "@/src/utils/profile/edit-profile";
import { putPersonalInfomationApi } from "@repo/actions/core/AccountService/put-actions";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import { Input } from "@repo/ayasofyazilim-ui/components/input";
import { Label } from "@repo/ayasofyazilim-ui/components/label";
import { toast } from "@repo/ayasofyazilim-ui/components/sonner";
import { PhoneInput } from "@repo/ayasofyazilim-ui/custom/phone-input";
import type { Volo_Abp_Account_ProfileDto } from "@repo/core-saas/AccountService";
import {
  refreshSessionAfterAffiliationSwitch,
  useSession,
} from "@repo/utils/auth";
import { useParams, useRouter } from "next/navigation";
import { useState, type ComponentType, type SVGProps } from "react";

const FORM_ID = "edit-profile-form";

type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

function IconField({
  id,
  label,
  icon: FieldIcon,
  value,
  onChange,
  disabled,
  type = "text",
  autoComplete,
}: {
  id: string;
  label: string;
  icon: Icon;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  type?: "text" | "email";
  autoComplete?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label data-testid={`${id}-label`} htmlFor={id}>
        {label}
      </Label>
      <div className="relative">
        <FieldIcon
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
          size={18}
        />
        <Input
          autoComplete={autoComplete}
          className="h-12 bg-card pl-10"
          data-testid={`${id}-input`}
          disabled={disabled}
          id={id}
          onChange={(e) => onChange(e.target.value)}
          placeholder={label}
          required
          type={type}
          value={value}
        />
      </div>
    </div>
  );
}

export function EditProfileForm({
  profile,
}: {
  profile: Volo_Abp_Account_ProfileDto | null;
}) {
  const { t } = useTranslations();
  const copy = t.SSRService;
  const router = useRouter();
  const { lang } = useParams<{ lang: string }>();
  const { sessionUpdate } = useSession();
  const [draft, setDraft] = useState<ProfileDraft>({
    name: profile?.name ?? "",
    surname: profile?.surname ?? "",
    userName: profile?.userName ?? "",
    email: profile?.email ?? "",
    phoneNumber: profile?.phoneNumber ?? "",
  });
  const [phoneState, setPhoneState] = useState<PhoneState>("untouched");
  const [phoneError, setPhoneError] = useState(false);
  const [saving, setSaving] = useState(false);

  const field = (key: keyof ProfileDraft) => (value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving || !canSaveProfile(draft)) return;
    if (phoneBlocksSave(draft.phoneNumber, phoneState)) {
      setPhoneError(true);
      return;
    }
    setSaving(true);
    let saved = false;
    try {
      const res = await putPersonalInfomationApi({
        requestBody: profileUpdateBody(draft, profile?.concurrencyStamp),
      });
      if (res.type === "success") saved = true;
      else toast.error(res.message || copy["Profile.Edit.UpdateFailed"]);
    } catch {
      toast.error(copy["Profile.Edit.UpdateFailed"]);
    }
    if (!saved) {
      setSaving(false);
      return;
    }
    try {
      const userData = await refreshSessionAfterAffiliationSwitch();
      await sessionUpdate({ info: userData as object });
    } catch {
      // The save landed; without a refresh token the session's name catches up at the next sign-in.
    }
    toast.success(copy["Profile.Edit.Updated"]);
    router.push(`/${lang}/profile`);
  }

  return (
    <>
      <form
        className="flex flex-col gap-4"
        data-testid={FORM_ID}
        id={FORM_ID}
        onSubmit={(e) => void save(e)}
      >
        <IconField
          autoComplete="given-name"
          disabled={saving}
          icon={IoPersonOutline}
          id="edit-profile-name"
          label={copy["Profile.Edit.Name"]}
          onChange={field("name")}
          value={draft.name}
        />
        <IconField
          autoComplete="family-name"
          disabled={saving}
          icon={IoPersonOutline}
          id="edit-profile-surname"
          label={copy["Profile.Edit.Surname"]}
          onChange={field("surname")}
          value={draft.surname}
        />
        <div className="flex flex-col gap-1.5">
          <Label data-testid="edit-profile-phone-label" htmlFor="edit-profile-phone">
            {copy["PhoneNumber"]}
          </Label>
          <PhoneInput
            className="[&_button]:h-12! [&_input]:h-12!"
            disabled={saving}
            id="edit-profile-phone"
            onChange={({ value, parsed }) => {
              field("phoneNumber")(value ?? "");
              setPhoneState(phoneStateFor(value ?? "", parsed?.isValid() ?? false));
              setPhoneError(false);
            }}
            value={draft.phoneNumber}
          />
          {phoneError ? (
            <p className="text-sm font-medium text-error">
              {copy["Profile.Edit.InvalidPhone"]}
            </p>
          ) : null}
        </div>
        <IconField
          autoComplete="username"
          disabled={saving}
          icon={IoAtOutline}
          id="edit-profile-username"
          label={copy["Profile.Edit.Username"]}
          onChange={field("userName")}
          value={draft.userName}
        />
        <IconField
          autoComplete="email"
          disabled={saving}
          icon={IoMailOutline}
          id="edit-profile-email"
          label={copy["Profile.Edit.Email"]}
          onChange={field("email")}
          type="email"
          value={draft.email}
        />
      </form>
      <PinnedBar testId="edit-profile-save-bar">
        <Button
          className="h-12 w-full rounded-full"
          data-testid="edit-profile-save"
          disabled={saving || !canSaveProfile(draft)}
          form={FORM_ID}
          type="submit"
        >
          {saving ? copy["Account.Saving"] : copy["Save"]}
        </Button>
      </PinnedBar>
    </>
  );
}
```

If `parsed?.isValid()` does not type-check (the UI kit types `parsed` as `ReturnType<typeof parsePhoneNumber>`), read it as `Boolean(parsed && parsed.isValid())`.

- [ ] **Step 2: The page.** Replace `(main)/profile/edit-profile/page.tsx` with this. It drops the picture request and the `auth()` call, which only fed the old avatar block.

```tsx
import { PageHeader } from "@/src/components/shell/page-header";
import { TabPage } from "@/src/components/shell/tab-page";
import { getTranslations } from "@/src/language-data/get-translations";
import { myProfileApi } from "@repo/actions/core/AccountService/actions";
import ErrorComponent from "@repo/ui/components/error-component";
import { structuredError } from "@repo/utils/api";
import { signOutServer } from "@repo/utils/auth";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { EditProfileForm } from "./_components/edit-profile-form";

async function getApiRequests() {
  try {
    const requiredRequests = await Promise.all([myProfileApi()]);
    return { requiredRequests };
  } catch (error) {
    if (!isRedirectError(error)) {
      return structuredError(error);
    }
    throw error;
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const [t, apiRequests] = await Promise.all([
    getTranslations(lang),
    getApiRequests(),
  ]);
  if ("message" in apiRequests) {
    return (
      <ErrorComponent
        languageData={t.SSRService}
        message={apiRequests.message}
        signOutServer={signOutServer}
      />
    );
  }

  const [profileResponse] = apiRequests.requiredRequests;

  return (
    <TabPage pinnedBar>
      <PageHeader
        backHref={`/${lang}/profile`}
        title={t.SSRService["Profile.Edit.Title"]}
      />
      <EditProfileForm profile={profileResponse.data} />
    </TabPage>
  );
}
```

- [ ] **Step 3: Delete `edit-profile/_components/account-form.tsx`.** `avatar-uploader.tsx` stays until Task 6.
- [ ] **Step 4: Gates.** `pnpm --filter ssr test:unit` passes, `pnpm --filter ssr type-check` gives 0 errors and `pnpm --filter ssr lint` gives 0 errors.
- [ ] **Step 5: Commit.**

```bash
git add "apps/ssr/src/app/[lang]/(main)/profile/edit-profile/page.tsx" "apps/ssr/src/app/[lang]/(main)/profile/edit-profile/_components/edit-profile-form.tsx" "apps/ssr/src/app/[lang]/(main)/profile/edit-profile/_components/account-form.tsx"
git commit -m "feat(ssr): make Edit profile the app's single form with a pinned Save"
```

---

### Task 6: The avatar sheet and the hero's camera chip (web-app)

**Files:**
- Create: `(main)/profile/_components/avatar-sheet.tsx`, `(main)/profile/_components/crop-image.ts`
- Modify: `(main)/profile/_components/identity-hero.tsx`, `(main)/profile/_components/profile-hub.tsx`
- Delete: `(main)/profile/edit-profile/_components/avatar-uploader.tsx`

**Interfaces:**
- Consumes:
  - Task 1: `AVATAR_ACCEPT`, `AVATAR_OUTPUT_TYPE`, `avatarFileProblem`, `avatarOutputSize`, `initialsOf`.
  - Task 2: `IoCamera`, `IoCameraOutline` (existing), `IoClose` (existing), and the `Profile.Avatar.*` strings.
- Produces:
  - `cropToAvatarFile(imageUrl: string, area: Area): Promise<File>`.
  - `AvatarSheet({ open, onOpenChange, pictureUrl, initials })`.
  - `IdentityHero` gains a required `onEditPicture: () => void`.

- [ ] **Step 1: The crop helper.** Create `(main)/profile/_components/crop-image.ts`. This replaces the cropper's `getCroppedImg` and drops rotation, which nothing used.

```ts
import {
  AVATAR_OUTPUT_TYPE,
  avatarOutputSize,
} from "@/src/utils/profile/avatar";
import type { Area } from "react-easy-crop";

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", reject);
    image.src = url;
  });
}

export async function cropToAvatarFile(
  imageUrl: string,
  area: Area
): Promise<File> {
  const image = await loadImage(imageUrl);
  const size = avatarOutputSize(area.width);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  // JPEG has no alpha, so transparent pixels would turn black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, size, size);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, AVATAR_OUTPUT_TYPE, 0.9)
  );
  if (!blob) throw new Error("Could not encode the cropped image");
  return new File([blob], "profile-picture.jpg", { type: AVATAR_OUTPUT_TYPE });
}
```

- [ ] **Step 2: The sheet.** Create `(main)/profile/_components/avatar-sheet.tsx`, the app's `AvatarModal`. `data-vaul-no-drag` stops a pan of the photo from dragging the sheet.

```tsx
"use client";
import { IoCameraOutline, IoClose } from "@/src/components/shell/ionicons";
import { useTranslations } from "@/src/providers/i18n";
import { AVATAR_ACCEPT, avatarFileProblem } from "@/src/utils/profile/avatar";
import { postProfilePictureApi } from "@repo/actions/core/AccountService/post-actions";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@repo/ayasofyazilim-ui/components/drawer";
import { toast } from "@repo/ayasofyazilim-ui/components/sonner";
import type { Volo_Abp_Account_ProfilePictureType } from "@repo/core-saas/AccountService";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";
import { cropToAvatarFile } from "./crop-image";

const UPLOADED_IMAGE: Volo_Abp_Account_ProfilePictureType = 2;

// The parent remounts this (a new key per open), so a picked photo never survives a close.
export function AvatarSheet({
  open,
  onOpenChange,
  pictureUrl,
  initials,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pictureUrl: string | null;
  initials: string;
}) {
  const { t } = useTranslations();
  const copy = t.SSRService;
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(
    () => () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    },
    [photoUrl]
  );

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const problem = avatarFileProblem(file);
    if (problem) {
      toast.error(
        problem === "type"
          ? copy["Profile.Avatar.UnsupportedType"]
          : copy["Profile.Avatar.TooLarge"]
      );
      return;
    }
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setArea(null);
    setPhotoUrl(URL.createObjectURL(file));
  }

  async function save() {
    if (!photoUrl || !area || uploading) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", await cropToAvatarFile(photoUrl, area));
      const res = await postProfilePictureApi(UPLOADED_IMAGE, formData);
      if (res.type !== "success") throw new Error(res.message);
      toast.success(copy["Profile.Avatar.Updated"]);
      onOpenChange(false);
      router.refresh();
    } catch {
      toast.error(copy["Profile.Avatar.UpdateFailed"]);
      setUploading(false);
    }
  }

  return (
    <Drawer
      dismissible={!uploading}
      onOpenChange={(next) => {
        if (!uploading) onOpenChange(next);
      }}
      open={open}
    >
      <DrawerContent
        className="mx-auto w-full max-w-3xl md:border-x"
        data-testid="avatar-sheet"
      >
        <DrawerHeader className="flex-row items-center justify-between">
          <DrawerTitle className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-sm font-semibold text-primary-foreground">
            <IoCameraOutline size={16} />
            {copy["Profile.Avatar.Title"]}
          </DrawerTitle>
          <DrawerClose
            aria-label={copy["Header.Back"]}
            data-testid="avatar-sheet-close"
            disabled={uploading}
          >
            <IoClose size={24} />
          </DrawerClose>
        </DrawerHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-6">
          <div className="mx-4 flex flex-col gap-4">
            {photoUrl ? (
              <div
                className="relative aspect-square w-full max-w-sm overflow-hidden rounded-md bg-foreground/5"
                data-vaul-no-drag=""
              >
                <Cropper
                  aspect={1}
                  crop={crop}
                  image={photoUrl}
                  onCropChange={setCrop}
                  onCropComplete={(_, pixels) => setArea(pixels)}
                  onZoomChange={setZoom}
                  zoom={zoom}
                />
              </div>
            ) : pictureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- a data: URL or a user-supplied host
              <img
                alt=""
                className="size-[100px] rounded-full object-cover"
                src={pictureUrl}
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex size-[100px] items-center justify-center rounded-full bg-foreground/5 text-2xl font-semibold text-muted-foreground"
              >
                {initials}
              </span>
            )}
            <p className="text-2xl font-bold text-foreground">
              {copy["Profile.Avatar.Heading"]}
            </p>
            <DrawerDescription className="text-base">
              {copy["Profile.Avatar.Hint"]}
            </DrawerDescription>
          </div>
          <input
            accept={AVATAR_ACCEPT.join(",")}
            className="sr-only"
            data-testid="avatar-file-input"
            onChange={pick}
            ref={inputRef}
            tabIndex={-1}
            type="file"
          />
          <button
            className="mt-2 w-full rounded-full bg-primary py-4 font-semibold text-primary-foreground disabled:opacity-60"
            data-testid="avatar-sheet-action"
            disabled={uploading || (photoUrl !== null && area === null)}
            onClick={() => (photoUrl ? void save() : inputRef.current?.click())}
            type="button"
          >
            {uploading
              ? copy["Avatar.Uploading"]
              : photoUrl
                ? copy["Save"]
                : copy["Profile.Avatar.Continue"]}
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 3: The camera chip.** In `identity-hero.tsx`:
  - Add `onEditPicture: () => void` to the props and their type.
  - Delete the inline `const initials = …` block, and import `initialsOf` from `@/src/utils/profile/identity` (it already imports from there) and `IoCamera` from the icons.
  - Replace the avatar, which today is the `{pictureUrl ? (<img …/>) : (<span …>{initials}</span>)}` at the start of the first `flex items-center gap-3` row, with:

```tsx
<button
  aria-label={t.SSRService["Profile.Avatar.Change"]}
  className="relative shrink-0 rounded-full"
  data-testid="profile-hero-avatar"
  onClick={onEditPicture}
  type="button"
>
  {pictureUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- a data: URL or a user-supplied host
    <img
      alt=""
      className="size-16 rounded-full object-cover"
      src={pictureUrl}
    />
  ) : (
    <span
      aria-hidden="true"
      className="flex size-16 items-center justify-center rounded-full bg-foreground/5 text-lg font-semibold text-muted-foreground"
    >
      {initialsOf(name)}
    </span>
  )}
  <span className="absolute -right-1 -bottom-1 rounded-full border border-border bg-card p-1 text-foreground">
    <IoCamera size={14} />
  </span>
</button>
```

- [ ] **Step 4: Open the sheet from the hub.** In `profile-hub.tsx`:
  - Import `AvatarSheet` from `./avatar-sheet`, and `initialsOf` from `@/src/utils/profile/identity`. Add it to the existing import from that module.
  - Beside the delete sheet's state, add:

```tsx
const [avatarOpen, setAvatarOpen] = useState(false);
const [avatarKey, setAvatarKey] = useState(0);
```

  - Give `<IdentityHero …>` the prop:

```tsx
onEditPicture={() => {
  setAvatarKey((k) => k + 1);
  setAvatarOpen(true);
}}
```

  - After `<DocumentSwitcherSheet … />`, render:

```tsx
<AvatarSheet
  initials={initialsOf(name)}
  key={avatarKey}
  onOpenChange={setAvatarOpen}
  open={avatarOpen}
  pictureUrl={pictureUrl}
/>
```

- [ ] **Step 5: Delete `edit-profile/_components/avatar-uploader.tsx`.** `grep -rn "avatar-uploader\|AvatarUploader" apps/ssr/src` prints nothing.
- [ ] **Step 6: Gates.** `pnpm --filter ssr test:unit` passes, `pnpm --filter ssr type-check` gives 0 errors and `pnpm --filter ssr lint` gives 0 errors.
- [ ] **Step 7: Commit.**

```bash
git add "apps/ssr/src/app/[lang]/(main)/profile/_components/avatar-sheet.tsx" "apps/ssr/src/app/[lang]/(main)/profile/_components/crop-image.ts" "apps/ssr/src/app/[lang]/(main)/profile/_components/identity-hero.tsx" "apps/ssr/src/app/[lang]/(main)/profile/_components/profile-hub.tsx" "apps/ssr/src/app/[lang]/(main)/profile/edit-profile/_components/avatar-uploader.tsx"
git commit -m "feat(ssr): upload the profile picture from a sheet on the hero's camera chip"
```

---

### Task 7: Gates, manual pass, push and PR (controller)

- [ ] **Step 1: Gates on the branch head.**
  - Run `test:unit`, ssr `type-check`, ssr `lint` and `pnpm --filter web type-check`.
  - With no dev server up on this checkout, run `pnpm --filter ssr build` and `pnpm --filter web build`.
- [ ] **Step 2: Manual pass** on this worktree's own ssr dev server, started detached on a free port (not :3001). Check at 375 px and 1280 px, signed in as `tur-a25y29041`, on a client no other device is signed into as that traveller. Cover:
  - **Edit profile:**
    - each field's label and icon;
    - Save disabled with an emptied name, and with a name of spaces;
    - "Invalid phone number" for a half-typed number;
    - one save with unchanged values: the toast appears, and you land on `/profile`.
  - **Avatar:**
    - the chip opens the sheet;
    - Continue opens the file picker; a GIF is refused;
    - a JPEG shows the cropper, which pans without dragging the sheet;
    - close without saving. Upload only a harmless image, and only if the user agrees.
  - **Cards:**
    - the hero and its kicker;
    - the "CARDS" count and the tiles in one column at 375 px and two at 1280 px;
    - the dashed Add card tile;
    - open and close the add-card sheet (live preview, then scan and back to manual), the rename sheet and the delete sheet. No destructive action.
  - **Validate's payout step:** its Add card dialog still opens as a dialog. Reach it only if a QA tag is at hand; otherwise record it as unverified.

  Record anything unverified. The bank section needs `CreateBank`, which the test traveller does not hold. The empty state, the load-failed states and the move sheet need data or failures that the account does not have.
- [ ] **Step 3: Stop this worktree's dev server.** Stop only the `node.exe` whose command line contains `web-app-wt-visual-parity-profile`.
- [ ] **Step 4: Push and open the PR.**
  - Run `git push -u origin feat/ssr-visual-parity-profile-cards`.
  - Open a PR into `feat/ssr-visual-parity-profile` with the repo template, and say it is stacked on #314.
  - List the orphaned keys from the **Strings** section, and the unverified items.
  - End the body with the attribution line.

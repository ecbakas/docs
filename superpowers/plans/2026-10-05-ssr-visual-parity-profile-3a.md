# ssr visual parity, sub-project 3a (Profile hub and Documents): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ssr's `/profile` becomes the app's traveller Profile: the identity hero, the setup strip, the app's groups, the Tag list style picker and in-app account deletion. A new `/profile/documents` page copies the app's Documents screen.

**Architecture:**
- The app's pure identity logic is ported into `apps/ssr/src/utils/profile/` as node-tested `.ts` modules.
- The document-switch flow moves into one hook, shared by the existing switcher, the hero's new switcher sheet and the Documents page.
- Didit verification runs on a small `/profile/verify` page. Both "Verify Account" and "Add document" link to it.

**Tech stack:** Next.js 16 (App Router), Tailwind v4, `node:test` via `tsx`, `@repo/ayasofyazilim-ui` (Drawer, Button, Skeleton, sonner), `@repo/ui/unirefund/didit-verification`.

**Spec:** `C:\unirefund\docs\superpowers\specs\2026-10-02-ssr-visual-parity-profile-design.md`, Sections 1 and 2. Section 3 is 3b's plan.

**Where the work happens:**
- **Worktree:** `C:\unirefund\web-app-wt-visual-parity`.
- **Branch:** `feat/ssr-visual-parity-profile`, cut from `feat/ssr-visual-parity-home-tags` at `8098340ed` (the head of #313).
- **PR:** targets `feat/ssr-visual-parity-home-tags`.

`S/` means `apps/ssr/src/`, and `(main)` means `S/app/[lang]/(main)`.

**Plan decisions.** These argue from the spec, and the executor treats each as a ruling.

1. **Verification runs on a page, not a dialog.**
   - Didit's web SDK embeds a full-height session, which is how ssr already uses it on login, register and validate.
   - `/profile/verify?intent=verify|add` hosts it. The spec's identity CTA, the Verify Account row and the Add document tile all link there.
   - The page returns to `/profile` or `/profile/documents` afterwards.
2. **The Documents page reads the layout's list.**
   - `(main)/layout.tsx` already requires `getMyDocumentAffiliationsApi`, and shows `ErrorComponent` when it fails. So `/profile/documents` uses `useShell().documentAffiliations`, and has no separate error state.
   - The spec's "Could not load your documents" is the layout's error page.
3. **Switching is gated.**
   - Set-active needs `TravellerService.Travellers` + `.SetActiveDocument`. That gate is applied everywhere switching appears, including the existing Home and navbar switcher.
   - Without the grant, the switcher shows the active document as a plain label.

## Global Constraints

- **QR contract.** `/tag/<slug>` and `/{lang}/validate?qrValue=…` are untouched.
- **Grants.** Every control and every optional call is gated on its endpoint's group grant **and** its leaf grant. A control without its grant is not rendered, and its call is not made. Where the app disables a control instead, ssr hides it.

  | Control or call | Group + leaf | Helper |
  | --- | --- | --- |
  | Verify Account row, the strip's identity step, Add document, the `/profile/verify` page | `TravellerService.SSRActions` + `.ProveDocument` | `profileGrants().verify` |
  | Switching documents (hero sheet, Documents tile, Home/navbar switcher) | `TravellerService.Travellers` + `.SetActiveDocument` | `profileGrants().setActiveDocument` |
  | "Set as primary" | `TravellerService.Travellers` + `.SetPrimaryDocument` | `profileGrants().setPrimaryDocument` |
  | Account Deletion opens the delete sheet (otherwise it links to `/{lang}/account-deletion`) | `IdentityService.Gdprs` + `.DeleteUserData` | `profileGrants().deleteAccount` |
  | My Cards row and count, the strip's payout step, the hub's cards call | `RefundService.TravellerCards` + `.ViewMine` | `cardGrants().view` (exists) |

- **Sheets are no wider than the page column.** Every `DrawerContent` gets `className="mx-auto w-full max-w-3xl md:border-x"` (user rule, 2026-10-02).
- **Single centred column.** `TabPage` without `wide`.
- **Class translation from NativeWind.**
  - `text-muted` and `text-placeholder` become `text-muted-foreground`.
  - A neutral fill `bg-muted` becomes `bg-muted-foreground`.
  - Everything else copies verbatim: `bg-card`, `border-border`, `border-input`, `bg-foreground/5`, `bg-primary/10`, `font-serial`, `bg-success`, `bg-success-surface`, `text-success-strong` (and the same for `info`, `warning` and `error`), and `text-primary-foreground`.
- **ssr strings.**
  - New `SSRService` strings go in both `S/language-data/unirefund/SSRService/resources/en.json` and `tr.json`. Keys are flat, and placeholders are `{0}` and `{1}`.
  - There must be no duplicate keys.
  - Run `pnpm --filter ssr run init` afterwards. Never commit `*.gen.json`.
- **ssr test ids.** Every `Link`, `Button`, `Input`, `*Trigger`, `DrawerClose` and native `<button>` carries a `data-testid`.
- **ssr tests.** `test:unit` runs `node --import tsx --test "src/**/*.test.ts"`: Node's runner, `.ts` only, no JSX. Test files import their module with a **relative** path.
- **Never `next build` while a dev server runs on this checkout.**
  - Implementers never push.
  - Never commit `.env` or submodule pointers.
  - `packages/actions` is not a submodule, but `packages/utils` is. Do not change `packages/utils`.
- **Manual checks are read-only on real data.**
  - Never confirm the account deletion.
  - Never finish a real Didit verification.
  - Do not switch documents or set a primary unless the account has a second document and the user agrees.
- **Comments** are rare and short: one line, only where the reason is not obvious.

## Review Focus

1. **A session whose `TravellerDocumentId` claim is an array**, which happens after a switch on some accounts. The hero, the strip and the Documents page all pick the document that is in the affiliations list. A missing claim gives no active document, no document row and "Not verified" with no detail. Pinned by: Task 1's `activeDocumentId` cases.
2. **The hub's cards call fails.** The payout step disappears rather than showing as not done, which would ask a traveller who has cards to add one. Pinned by: Task 1's `setupSteps` "unknown card count" case.
3. **A traveller without the ProveDocument grant.** The identity step is dropped and the total shrinks. With the other steps done, they see "all done", not a stuck "2 of 3". Pinned by: Task 1's `setupSteps` cases.
4. **Proving a document the account already holds.** It toasts "Document verification updated", not "Document added". Pinned by: Task 1's `proveToastKey` cases.
5. **Didit returns a completed result with no session, a cancel or a failure.** Each maps to its own outcome, and only an Approved session with an id is recorded. Pinned by: Task 1's `verificationOutcome` cases.

---

## File structure

| Path | Change |
| --- | --- |
| `S/utils/profile/identity.ts` + `.test.ts` | new: verified rule, mask, card count, active document, setup steps, Didit outcome, prove toast |
| `S/utils/profile/document-format.ts` + `.test.ts` | new: type-icon key, evidence badge classes |
| `S/utils/profile/tag-row-design-options.ts` + `.test.ts` | new: the three options and the cookie string |
| `S/utils/profile/delete-countdown.ts` + `.test.ts` | new: the countdown rule and label |
| `S/utils/profile/profile-picture.ts` + `.test.ts` | new: moved from `edit-profile/page.tsx` |
| `S/utils/profile/profile-grants.ts` + `.test.ts` | new: verify, set active, set primary, delete account |
| `S/components/shell/profile-rows.ts` + `.test.ts` | new rows: documents, verify, tag-row-design |
| `packages/actions/core/IdentityService/delete-actions.ts` | `deleteGdprApi()` |
| `(main)/profile/edit-profile/page.tsx` | use `profilePictureUrl` |
| `apps/ssr/scripts/gen-ionicons.mjs`, `S/components/shell/ionicons.tsx` | 8 more icons |
| `S/components/documents/use-switch-document.ts` | new: the switch hook |
| `S/components/documents/document-icon.tsx`, `evidence-badge.tsx` | new |
| `S/components/documents/document-switcher-sheet.tsx` | new: the hero's sheet |
| `S/components/global/navbar/traveller-document-switcher.tsx` | uses the hook, gated |
| `(main)/profile/verify/page.tsx`, `_components/verify-view.tsx` | new: Didit ProveDocument |
| `(main)/profile/page.tsx`, `_components/profile-hub.tsx` | the hero, the strip, the rows, and the server data |
| `(main)/profile/_components/identity-hero.tsx`, `setup-strip.tsx`, `delete-account-sheet.tsx` | new |
| `(main)/profile/tag-row-design/page.tsx`, `_components/tag-row-design-picker.tsx` | new |
| `(main)/profile/documents/page.tsx`, `loading.tsx`, `_components/documents-view.tsx`, `document-tile.tsx`, `active-document-panel.tsx` | new |

## Strings

These are new `SSRService` keys, all added in Task 2.

| Key | en | tr |
| --- | --- | --- |
| `Profile.Identity.Verified` | Verified | Doğrulandı |
| `Profile.Identity.Unverified` | Not verified | Doğrulanmadı |
| `Profile.Row.Documents` | My Documents | Belgelerim |
| `Profile.Row.Verify` | Verify Account | Hesabını Doğrula |
| `Profile.Row.TagRowDesign` | Tag list style | Etiket listesi görünümü |
| `Profile.Setup.Progress` | {0} of {1} done | {1} adımdan {0} tamamlandı |
| `Profile.Setup.AllDone` | Your account is ready for tax-free shopping. | Hesabınız vergisiz alışverişe hazır. |
| `Profile.Setup.identity.Label` | Identity verification | Kimlik doğrulama |
| `Profile.Setup.identity.Cta` | Verify your identity | Kimliğinizi doğrulayın |
| `Profile.Setup.identity.Hint` | Required before you can claim a refund — takes about two minutes | İade talebinde bulunabilmeniz için gerekli — yaklaşık iki dakika sürer |
| `Profile.Setup.document.Label` | Travel document | Seyahat belgesi |
| `Profile.Setup.document.Cta` | Add your travel document | Seyahat belgenizi ekleyin |
| `Profile.Setup.document.Hint` | Your passport or ID card is what proves you're eligible for tax-free | Pasaportunuz veya kimlik kartınız vergisiz alışverişe uygunluğunuzu kanıtlar |
| `Profile.Setup.payout.Label` | Payout method | Ödeme yöntemi |
| `Profile.Setup.payout.Cta` | Add a payout method | Ödeme yöntemi ekleyin |
| `Profile.Setup.payout.Hint` | Approved refunds can't be paid out until you add one | Onaylanan iadeler, siz bir yöntem eklemeden ödenemez |
| `Profile.Verification.ApprovedTitle` | Verification complete | Doğrulama tamamlandı |
| `Profile.Verification.ApprovedMessage` | Your identity has been verified. | Kimliğiniz doğrulandı. |
| `Profile.Verification.PendingTitle` | Verification in review | Doğrulama inceleniyor |
| `Profile.Verification.PendingMessage` | We're reviewing your verification. Your profile updates once it's done. | Doğrulamanız inceleniyor. Tamamlandığında profiliniz güncellenecek. |
| `Profile.Verification.DeclinedTitle` | Verification declined | Doğrulama reddedildi |
| `Profile.Verification.DeclinedMessage` | We couldn't verify your identity. Please try again. | Kimliğinizi doğrulayamadık. Lütfen tekrar deneyin. |
| `Profile.Verification.FailedTitle` | Verification failed | Doğrulama başarısız |
| `Profile.Verification.FailedMessage` | Something went wrong during verification. Please try again. | Doğrulama sırasında bir sorun oluştu. Lütfen tekrar deneyin. |
| `Documents.Title` | My Documents | Belgelerim |
| `Documents.Description` | Passports and ID cards linked to your account | Hesabınıza bağlı pasaport ve kimlik kartları |
| `Documents.IssuedTo` | Tags are issued to | Etiketler bu belgeye düzenleniyor |
| `Documents.DocumentsSection` | Documents | Belgeler |
| `Documents.InUse` | In use | Kullanımda |
| `Documents.UseThisDocument` | Issue tags to this document | Etiketleri bu belgeye düzenle |
| `Documents.Primary` | Primary | Birincil |
| `Documents.SetPrimary` | Set as primary | Birincil yap |
| `Documents.SetPrimarySuccess` | Primary document updated | Birincil belge güncellendi |
| `Documents.SetPrimaryFailed` | Could not set the primary document. | Birincil belge ayarlanamadı. |
| `Documents.AddDocument` | Add document | Belge ekle |
| `Documents.Added` | Document added | Belge eklendi |
| `Documents.Updated` | Document verification updated | Belge doğrulaması güncellendi |
| `Documents.AddFailed` | Could not add the document. Please try again. | Belge eklenemedi. Lütfen tekrar deneyin. |
| `Documents.Busy` | Please wait for the current change to finish. | Lütfen mevcut işlemin tamamlanmasını bekleyin. |
| `Documents.Empty` | No documents yet | Henüz belge yok |
| `Documents.EmptyDescription` | Add a passport or ID card so your tax-free tags can be issued in your name. | Vergisiz alışveriş etiketlerinizin adınıza düzenlenebilmesi için bir pasaport veya kimlik kartı ekleyin. |
| `Documents.EvidenceLevel.None` | None | None |
| `Documents.EvidenceLevel.Low` | Low | Low |
| `Documents.EvidenceLevel.Medium` | Medium | Medium |
| `Documents.EvidenceLevel.High` | High | High |
| `Documents.Switch.Title` | Switch document | Belge değiştir |
| `Documents.Switch.SwitchTo` | Switch to {0} | {0} belgesine geç |
| `Documents.Switch.Switching` | Switching… | Değiştiriliyor… |
| `Documents.SwitchSuccess` | Switched to {0} | {0} belgesine geçildi |
| `Documents.SwitchFailed` | Could not switch documents. Please try again. | Belge değiştirilemedi. Lütfen tekrar deneyin. |
| `Documents.SwitchNeedsRelogin` | Document switched, but your session could not be refreshed. Please sign in again. | Belge değiştirildi ancak oturumunuz yenilenemedi. Lütfen tekrar giriş yapın. |
| `TagRowDesign.Title` | Tag list style | Etiket listesi görünümü |
| `TagRowDesign.Description` | Changes how each tag is drawn in your Tags list. | Etiket listenizde her etiketin nasıl çizileceğini değiştirir. |
| `TagRowDesign.Classic` | Current | Mevcut |
| `TagRowDesign.ClassicHint` | The card you have now. | Şu anki kart. |
| `TagRowDesign.Pill` | Compact | Sade |
| `TagRowDesign.PillHint` | Shorter rows with a colour bar down the edge. | Kenarında renk şeridi olan kısa satırlar. |
| `TagRowDesign.Tinted` | Tinted | Renkli |
| `TagRowDesign.TintedHint` | Shorter rows, each tinted by its status. | Durumuna göre renklendirilmiş kısa satırlar. |
| `DeleteAccount.Title` | Delete Account | Hesabını Sil |
| `DeleteAccount.ConfirmTitle` | Are you sure you want to delete your account? | Hesabınızı silmek istediğinizden emin misiniz? |
| `DeleteAccount.ConfirmDescription` | Please think carefully, as this action is irreversible and all your data will be permanently deleted. | Lütfen dikkatlice düşünün, çünkü bu işlem geri alınamaz ve tüm verileriniz kalıcı olarak silinecektir. |
| `DeleteAccount.DeleteButton` | Continue and Delete My Account | Devam Et ve Hesabımı Sil |
| `DeleteAccount.LearnMore` | Learn more | Daha fazla bilgi |
| `DeleteAccount.SuccessMessage` | Your account has been successfully deleted. | Hesabınız başarıyla silindi. |
| `DeleteAccount.ErrorMessage` | An error occurred while deleting your account. | Hesabınız silinirken bir hata oluştu. |

**Reused unchanged:**
- `Profile.Title`, `Profile.Group.*`, `Profile.Row.*`;
- `DocumentType.{Passport,IdCard,DriverLicense,ResidencePermit,HealthInsurance}`;
- `Header.Back`, `Loading`.

---

### Task 0: Setup (controller)

- [ ] **Step 1: Check the worktree.**
  - `git status --short` must be clean, apart from untracked `.env` and `*.gen.json`.
  - The branch is `feat/ssr-visual-parity-home-tags` at `8098340ed`.
  - No `node.exe` may have the worktree path in its command line.
- [ ] **Step 2: Branch.** Run `git switch -c feat/ssr-visual-parity-profile`.
- [ ] **Step 3: Measure the baselines and ledger them.**
  - `test:unit`: expect 259 pass.
  - ssr `type-check`: expect 0 `error TS` outside `.next/`.
  - ssr `lint`: expect 0 errors.
  - web `type-check`: expect 0 errors.

---

### Task 1: Pure profile logic, grants, rows and the GDPR action (web-app)

**Files:**
- Create in `S/utils/profile/`, each with a `.test.ts`: `identity.ts`, `document-format.ts`, `tag-row-design-options.ts`, `delete-countdown.ts`, `profile-picture.ts`, `profile-grants.ts`.
- Modify:
  - `S/components/shell/profile-rows.ts` + `.test.ts`
  - `packages/actions/core/IdentityService/delete-actions.ts`
  - `(main)/profile/edit-profile/page.tsx`

**Interfaces (produced):**
- `type EvidenceLevel = "None" | "Low" | "Medium" | "High"`
- `isVerifiedLevel(level: EvidenceLevel | null | undefined): boolean`
- `maskDocumentNumber(value: string | null | undefined): string`
- `countPayoutMethods(items: { type?: string | null }[] | null | undefined): number`
- `activeDocumentId(claim: string | string[] | null | undefined, affiliations: { travellerDocumentId?: string | null }[]): string | null`
- `type SetupStepKey = "identity" | "document" | "payout"`
- `type SetupProgress = { steps: { key: SetupStepKey; done: boolean }[]; completed: number; total: number; next: SetupStepKey | null }`
- `setupSteps(input: { verified: boolean; documentCount: number; cardCount: number | null | undefined; canVerify: boolean }): SetupProgress`
- `type VerificationOutcome = { kind: "approved"; sessionId: string } | { kind: "pending" | "declined" | "cancelled" | "failed" }`
- `verificationOutcome(result: { type: string; session?: { sessionId: string; status: string } }): VerificationOutcome`
- `proveToastKey(knownIds: (string | null | undefined)[], resultId: string | null | undefined): "Documents.Added" | "Documents.Updated"`
- `type DocumentIconKey = "passport" | "idCard" | "driverLicense" | "residencePermit" | "healthInsurance" | "document"`
- `documentIconKey(type): DocumentIconKey`
- `EVIDENCE_BADGE: Record<EvidenceLevel, string>`
- `TAG_ROW_DESIGN_OPTIONS`: readonly `{ value: TagRowDesign; labelKey; hintKey }[]`
- `tagRowDesignLabelKey(design)`
- `tagRowDesignCookie(value): string`
- `DELETE_COUNTDOWN_SECONDS = 10`
- `isDeleteEnabled(secondsLeft): boolean`
- `deleteButtonLabel(base, secondsLeft): string`
- `profilePictureUrl(dto): string | null`
- `profileGrants(granted)` returns `{ verify, setActiveDocument, setPrimaryDocument, deleteAccount }`
- `ProfileRowId` gains `"documents" | "verify" | "tag-row-design"`
- `deleteGdprApi()` in `@repo/actions/core/IdentityService/delete-actions`

- [ ] **Step 1: Write the failing tests.**

`S/utils/profile/identity.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  activeDocumentId,
  countPayoutMethods,
  isVerifiedLevel,
  maskDocumentNumber,
  proveToastKey,
  setupSteps,
  verificationOutcome,
} from "./identity";

describe("isVerifiedLevel", () => {
  it("treats Medium and High as verified", () => {
    assert.equal(isVerifiedLevel("Medium"), true);
    assert.equal(isVerifiedLevel("High"), true);
  });
  it("does not treat None or Low as verified", () => {
    assert.equal(isVerifiedLevel("None"), false);
    assert.equal(isVerifiedLevel("Low"), false);
  });
  it("is not verified when the level is missing", () => {
    assert.equal(isVerifiedLevel(undefined), false);
    assert.equal(isVerifiedLevel(null), false);
  });
});

describe("maskDocumentNumber", () => {
  it("keeps the last four characters and masks the rest", () => {
    assert.equal(maskDocumentNumber("U12345678"), "•••• 5678");
  });
  it("returns four characters or fewer unmasked", () => {
    assert.equal(maskDocumentNumber("1234"), "1234");
    assert.equal(maskDocumentNumber("99"), "99");
  });
  it("trims surrounding whitespace before measuring", () => {
    assert.equal(maskDocumentNumber("  1234  "), "1234");
  });
  it("answers with an empty string for a missing number", () => {
    assert.equal(maskDocumentNumber(null), "");
    assert.equal(maskDocumentNumber(undefined), "");
  });
});

describe("countPayoutMethods", () => {
  it("counts cards only", () => {
    assert.equal(countPayoutMethods([{ type: "Card" }, { type: "Bank" }, { type: "Wallet" }, { type: "Card" }]), 2);
  });
  it("is zero before the list loads", () => {
    assert.equal(countPayoutMethods(undefined), 0);
  });
});

describe("activeDocumentId", () => {
  const docs = [{ travellerDocumentId: "a" }, { travellerDocumentId: "b" }];
  it("returns a string claim as it is", () => {
    assert.equal(activeDocumentId("b", docs), "b");
  });
  it("picks the claimed document that the account holds from an array claim", () => {
    assert.equal(activeDocumentId(["zzz", "b"], docs), "b");
  });
  it("is null with no claim, an empty claim, or no match", () => {
    assert.equal(activeDocumentId(undefined, docs), null);
    assert.equal(activeDocumentId("", docs), null);
    assert.equal(activeDocumentId([], docs), null);
    assert.equal(activeDocumentId(["zzz"], docs), null);
  });
});

describe("setupSteps", () => {
  it("orders identity, document, payout and points at the first not done", () => {
    const progress = setupSteps({ verified: true, documentCount: 0, cardCount: 0, canVerify: true });
    assert.deepEqual(progress.steps.map((s) => [s.key, s.done]), [
      ["identity", true],
      ["document", false],
      ["payout", false],
    ]);
    assert.equal(progress.completed, 1);
    assert.equal(progress.total, 3);
    assert.equal(progress.next, "document");
  });
  it("drops the identity step without the verify grant and recounts", () => {
    const progress = setupSteps({ verified: false, documentCount: 1, cardCount: 2, canVerify: false });
    assert.deepEqual(progress.steps.map((s) => s.key), ["document", "payout"]);
    assert.equal(progress.next, null);
    assert.equal(progress.completed, 2);
    assert.equal(progress.total, 2);
  });
  it("drops the payout step when the card count is unknown", () => {
    assert.deepEqual(setupSteps({ verified: true, documentCount: 1, cardCount: null, canVerify: true }).steps.map((s) => s.key), ["identity", "document"]);
    assert.deepEqual(setupSteps({ verified: true, documentCount: 1, cardCount: undefined, canVerify: true }).steps.map((s) => s.key), ["identity", "document"]);
  });
});

describe("verificationOutcome", () => {
  it("records only an approved session with its id", () => {
    assert.deepEqual(verificationOutcome({ type: "completed", session: { sessionId: "s1", status: "Approved" } }), { kind: "approved", sessionId: "s1" });
  });
  it("maps pending and declined sessions", () => {
    assert.deepEqual(verificationOutcome({ type: "completed", session: { sessionId: "s1", status: "Pending" } }), { kind: "pending" });
    assert.deepEqual(verificationOutcome({ type: "completed", session: { sessionId: "s1", status: "Declined" } }), { kind: "declined" });
  });
  it("maps a cancel, a failure, and a completion with no session", () => {
    assert.deepEqual(verificationOutcome({ type: "cancelled" }), { kind: "cancelled" });
    assert.deepEqual(verificationOutcome({ type: "failed" }), { kind: "failed" });
    assert.deepEqual(verificationOutcome({ type: "completed" }), { kind: "failed" });
  });
});

describe("proveToastKey", () => {
  it("says updated when the proved document was already on the account", () => {
    assert.equal(proveToastKey(["a", "b"], "b"), "Documents.Updated");
  });
  it("says added for a new or unknown document", () => {
    assert.equal(proveToastKey(["a"], "c"), "Documents.Added");
    assert.equal(proveToastKey(["a"], undefined), "Documents.Added");
    assert.equal(proveToastKey([null], null), "Documents.Added");
  });
});
```

`S/utils/profile/document-format.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { documentIconKey, EVIDENCE_BADGE } from "./document-format";

describe("documentIconKey", () => {
  it("maps each document type", () => {
    assert.equal(documentIconKey("Passport"), "passport");
    assert.equal(documentIconKey("IdCard"), "idCard");
    assert.equal(documentIconKey("DriverLicense"), "driverLicense");
    assert.equal(documentIconKey("ResidencePermit"), "residencePermit");
    assert.equal(documentIconKey("HealthInsurance"), "healthInsurance");
  });
  it("falls back to a plain document", () => {
    assert.equal(documentIconKey(undefined), "document");
    assert.equal(documentIconKey("Other"), "document");
  });
});

describe("EVIDENCE_BADGE", () => {
  it("colours the levels like the app", () => {
    assert.deepEqual(EVIDENCE_BADGE, { None: "bg-error", Low: "bg-warning", Medium: "bg-info", High: "bg-success" });
  });
});
```

`S/utils/profile/tag-row-design-options.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TAG_ROW_DESIGN_OPTIONS, tagRowDesignCookie, tagRowDesignLabelKey } from "./tag-row-design-options";

describe("TAG_ROW_DESIGN_OPTIONS", () => {
  it("lists the app's three designs in order", () => {
    assert.deepEqual(TAG_ROW_DESIGN_OPTIONS.map((o) => o.value), ["classic", "pill", "tinted"]);
    assert.equal(TAG_ROW_DESIGN_OPTIONS[1]?.hintKey, "TagRowDesign.PillHint");
  });
  it("labels a design", () => {
    assert.equal(tagRowDesignLabelKey("tinted"), "TagRowDesign.Tinted");
  });
});

describe("tagRowDesignCookie", () => {
  it("writes the cookie the Tags page reads, for a year, site-wide", () => {
    assert.equal(tagRowDesignCookie("pill"), "tag-row-design=pill; path=/; max-age=31536000; samesite=lax");
  });
});
```

`S/utils/profile/delete-countdown.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DELETE_COUNTDOWN_SECONDS, deleteButtonLabel, isDeleteEnabled } from "./delete-countdown";

describe("delete countdown", () => {
  it("starts at ten seconds, like the app", () => {
    assert.equal(DELETE_COUNTDOWN_SECONDS, 10);
  });
  it("stays disabled until the countdown ends", () => {
    assert.equal(isDeleteEnabled(10), false);
    assert.equal(isDeleteEnabled(1), false);
    assert.equal(isDeleteEnabled(0), true);
  });
  it("shows the seconds left, then the bare label", () => {
    assert.equal(deleteButtonLabel("Delete", 3), "Delete (3)");
    assert.equal(deleteButtonLabel("Delete", 0), "Delete");
  });
});
```

`S/utils/profile/profile-picture.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { profilePictureUrl } from "./profile-picture";

describe("profilePictureUrl", () => {
  it("uses a URL source", () => {
    assert.equal(profilePictureUrl({ type: 1, source: "https://x/y.png" }), "https://x/y.png");
  });
  it("builds a data URL from file content", () => {
    assert.equal(profilePictureUrl({ type: 2, fileContent: "QUJD" }), "data:image/png;base64,QUJD");
  });
  it("is null for no picture", () => {
    assert.equal(profilePictureUrl({ type: 0 }), null);
    assert.equal(profilePictureUrl({ type: 1 }), null);
  });
});
```

`S/utils/profile/profile-grants.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { profileGrants } from "./profile-grants";

const ALL = {
  "TravellerService.SSRActions": true,
  "TravellerService.SSRActions.ProveDocument": true,
  "TravellerService.Travellers": true,
  "TravellerService.Travellers.SetActiveDocument": true,
  "TravellerService.Travellers.SetPrimaryDocument": true,
  "IdentityService.Gdprs": true,
  "IdentityService.Gdprs.DeleteUserData": true,
};

describe("profileGrants", () => {
  it("allows everything with every grant", () => {
    assert.deepEqual(profileGrants(ALL), { verify: true, setActiveDocument: true, setPrimaryDocument: true, deleteAccount: true });
  });
  it("allows nothing without grants", () => {
    assert.deepEqual(profileGrants(undefined), { verify: false, setActiveDocument: false, setPrimaryDocument: false, deleteAccount: false });
  });
  it("needs each group as well as its leaf", () => {
    assert.equal(profileGrants({ ...ALL, "TravellerService.SSRActions": false }).verify, false);
    assert.equal(profileGrants({ ...ALL, "TravellerService.Travellers": false }).setActiveDocument, false);
    assert.equal(profileGrants({ ...ALL, "TravellerService.Travellers": false }).setPrimaryDocument, false);
    assert.equal(profileGrants({ ...ALL, "IdentityService.Gdprs": false }).deleteAccount, false);
  });
  it("needs each leaf as well as its group", () => {
    assert.equal(profileGrants({ ...ALL, "TravellerService.Travellers.SetPrimaryDocument": false }).setPrimaryDocument, false);
    assert.equal(profileGrants({ ...ALL, "IdentityService.Gdprs.DeleteUserData": false }).deleteAccount, false);
  });
});
```

`S/components/shell/profile-rows.test.ts`. Replace the first test, and add a verify case:

```ts
const VERIFY = {
  "TravellerService.SSRActions": true,
  "TravellerService.SSRActions.ProveDocument": true,
};

it("lists the app's groups in order, with Cards and Verify when granted", () => {
  assert.deepEqual(
    profileGroups({ ...PAIR, ...VERIFY }).map((g) => [g.id, g.rows]),
    [
      ["account", ["personal", "documents", "verify"]],
      ["wallet", ["cards"]],
      ["app", ["language", "tag-row-design", "change-password"]],
      ["legal", ["privacy", "account-deletion"]],
      ["session", ["logout"]],
    ]
  );
});
it("drops Verify without the ProveDocument pair", () => {
  assert.deepEqual(profileGroups(PAIR).find((g) => g.id === "account")?.rows, ["personal", "documents"]);
});
```

- [ ] **Step 2: Run the tests to see them fail.** Run `pnpm --filter ssr test:unit`. The new suites fail.

- [ ] **Step 3: Implement.**

`S/utils/profile/identity.ts`:

```ts
export type EvidenceLevel = "None" | "Low" | "Medium" | "High";

const EVIDENCE_ORDER: Record<EvidenceLevel, number> = { None: 0, Low: 1, Medium: 2, High: 3 };
// Low is what a self-declared document reaches before any check has run.
export const VERIFIED_FROM: EvidenceLevel = "Medium";

export function isVerifiedLevel(level: EvidenceLevel | null | undefined): boolean {
  if (!level) return false;
  return (EVIDENCE_ORDER[level] ?? 0) >= EVIDENCE_ORDER[VERIFIED_FROM];
}

export function maskDocumentNumber(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length <= 4) return trimmed;
  return `•••• ${trimmed.slice(-4)}`;
}

export function countPayoutMethods(items: { type?: string | null }[] | null | undefined): number {
  return (items ?? []).filter((item) => item.type === "Card").length;
}

export function activeDocumentId(
  claim: string | string[] | null | undefined,
  affiliations: { travellerDocumentId?: string | null }[]
): string | null {
  if (!claim || claim.length === 0) return null;
  if (typeof claim === "string") return claim;
  return (
    affiliations.find((a) => a.travellerDocumentId && claim.includes(a.travellerDocumentId))
      ?.travellerDocumentId ?? null
  );
}

export type SetupStepKey = "identity" | "document" | "payout";
export type SetupProgress = {
  steps: { key: SetupStepKey; done: boolean }[];
  completed: number;
  total: number;
  next: SetupStepKey | null;
};

export function setupSteps({
  verified,
  documentCount,
  cardCount,
  canVerify,
}: {
  verified: boolean;
  documentCount: number;
  cardCount: number | null | undefined;
  canVerify: boolean;
}): SetupProgress {
  const steps: SetupProgress["steps"] = [];
  if (canVerify) steps.push({ key: "identity", done: verified });
  steps.push({ key: "document", done: documentCount > 0 });
  // undefined: no cards grant; null: the call failed. Either way the step cannot be judged.
  if (typeof cardCount === "number") steps.push({ key: "payout", done: cardCount > 0 });
  return {
    steps,
    completed: steps.filter((s) => s.done).length,
    total: steps.length,
    next: steps.find((s) => !s.done)?.key ?? null,
  };
}

export type VerificationOutcome =
  | { kind: "approved"; sessionId: string }
  | { kind: "pending" | "declined" | "cancelled" | "failed" };

export function verificationOutcome(result: {
  type: string;
  session?: { sessionId: string; status: string };
}): VerificationOutcome {
  if (result.type === "cancelled") return { kind: "cancelled" };
  if (result.type !== "completed" || !result.session) return { kind: "failed" };
  if (result.session.status === "Approved") return { kind: "approved", sessionId: result.session.sessionId };
  return { kind: result.session.status === "Pending" ? "pending" : "declined" };
}

export function proveToastKey(
  knownIds: (string | null | undefined)[],
  resultId: string | null | undefined
): "Documents.Added" | "Documents.Updated" {
  return resultId && knownIds.includes(resultId) ? "Documents.Updated" : "Documents.Added";
}
```

`S/utils/profile/document-format.ts`:

```ts
import type { EvidenceLevel } from "./identity";

export type DocumentIconKey =
  | "passport"
  | "idCard"
  | "driverLicense"
  | "residencePermit"
  | "healthInsurance"
  | "document";

const ICON_BY_TYPE: Record<string, DocumentIconKey> = {
  Passport: "passport",
  IdCard: "idCard",
  DriverLicense: "driverLicense",
  ResidencePermit: "residencePermit",
  HealthInsurance: "healthInsurance",
};

export function documentIconKey(type: string | null | undefined): DocumentIconKey {
  return (type && ICON_BY_TYPE[type]) || "document";
}

export const EVIDENCE_BADGE: Record<EvidenceLevel, string> = {
  None: "bg-error",
  Low: "bg-warning",
  Medium: "bg-info",
  High: "bg-success",
};
```

`S/utils/profile/tag-row-design-options.ts`:

```ts
import { TAG_ROW_DESIGN_COOKIE, type TagRowDesign } from "../tag/tag-row-design";

export const TAG_ROW_DESIGN_OPTIONS = [
  { value: "classic", labelKey: "TagRowDesign.Classic", hintKey: "TagRowDesign.ClassicHint" },
  { value: "pill", labelKey: "TagRowDesign.Pill", hintKey: "TagRowDesign.PillHint" },
  { value: "tinted", labelKey: "TagRowDesign.Tinted", hintKey: "TagRowDesign.TintedHint" },
] as const satisfies readonly { value: TagRowDesign; labelKey: string; hintKey: string }[];

export function tagRowDesignLabelKey(design: TagRowDesign) {
  return TAG_ROW_DESIGN_OPTIONS.find((o) => o.value === design)?.labelKey ?? "TagRowDesign.Classic";
}

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function tagRowDesignCookie(value: TagRowDesign): string {
  return `${TAG_ROW_DESIGN_COOKIE}=${value}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}
```

`S/utils/profile/delete-countdown.ts`:

```ts
export const DELETE_COUNTDOWN_SECONDS = 10;

export function isDeleteEnabled(secondsLeft: number): boolean {
  return secondsLeft <= 0;
}

export function deleteButtonLabel(base: string, secondsLeft: number): string {
  return secondsLeft > 0 ? `${base} (${secondsLeft})` : base;
}
```

`S/utils/profile/profile-picture.ts`:

```ts
export function profilePictureUrl(picture: {
  type?: number | null;
  source?: string | null;
  fileContent?: string | null;
}): string | null {
  if (picture.type === 1 && picture.source) return picture.source;
  if (picture.type === 2 && picture.fileContent) return `data:image/png;base64,${picture.fileContent}`;
  return null;
}
```

  In `(main)/profile/edit-profile/page.tsx`:
  - delete the local `getProfilePictureUrl`;
  - import `profilePictureUrl` from `@/src/utils/profile/profile-picture`;
  - call it in the same place.

`S/utils/profile/profile-grants.ts`:

```ts
type Granted = Record<string, boolean | undefined> | null | undefined;

const has = (granted: Granted, ...required: string[]) => required.every((policy) => granted?.[policy] === true);

export function profileGrants(granted: Granted) {
  return {
    verify: has(granted, "TravellerService.SSRActions", "TravellerService.SSRActions.ProveDocument"),
    setActiveDocument: has(granted, "TravellerService.Travellers", "TravellerService.Travellers.SetActiveDocument"),
    setPrimaryDocument: has(granted, "TravellerService.Travellers", "TravellerService.Travellers.SetPrimaryDocument"),
    deleteAccount: has(granted, "IdentityService.Gdprs", "IdentityService.Gdprs.DeleteUserData"),
  };
}
```

`S/components/shell/profile-rows.ts`:
- Widen `ProfileRowId` with `"documents" | "verify" | "tag-row-design"`.
- Import `profileGrants` from `@/src/utils/profile/profile-grants`. If the alias does not resolve under `node:test`, use the relative `../../utils/profile/profile-grants`.
- The groups become:
  - `account: ["personal", "documents", ...(profileGrants(policies).verify ? ["verify"] : [])]`
  - `app: ["language", "tag-row-design", "change-password"]`
  - wallet, legal and session unchanged.

`packages/actions/core/IdentityService/delete-actions.ts`: append:

```ts
export async function deleteGdprApi() {
  try {
    const client = await getIdentityServiceClient();
    const dataResponse = await client.gdprCustom.deleteApiIdentityGdprs();
    return structuredResponse(dataResponse);
  } catch (error) {
    return structuredError(error);
  }
}
```

- [ ] **Step 4: Run the gates.**
  - `pnpm --filter ssr test:unit` must pass in full.
  - Run ssr `type-check`, ssr `lint` (0 errors) and `pnpm --filter web type-check`. The last confirms the `packages/actions` change.

- [ ] **Step 5: Commit.** Stage every file by name, then commit:

```bash
git commit -q -F - <<'EOF'
feat(ssr): port the app's identity and setup logic for the Profile

Pure modules for the verified rule, the document mask and icons, the
setup strip's steps, the Didit outcome and the add/updated toast, the
Tag list style options and cookie, the delete countdown, and the Profile
grants. The rows gain My Documents, Verify Account and Tag list style.
packages/actions gains deleteGdprApi for in-app account deletion.

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

### Task 2: Icons, strings, the switch hook, the switcher sheet and the verify page (web-app)

**Files:**
- Modify:
  - `apps/ssr/scripts/gen-ionicons.mjs`, then regenerate `ionicons.tsx`
  - en/tr
  - `S/components/global/navbar/traveller-document-switcher.tsx`
- Create:
  - in `S/components/documents/`: `use-switch-document.ts`, `document-icon.tsx`, `evidence-badge.tsx`, `document-switcher-sheet.tsx`
  - `(main)/profile/verify/page.tsx` and `_components/verify-view.tsx`

**Interfaces:**
- Consumes (Task 1): `maskDocumentNumber`, `documentIconKey`, `EVIDENCE_BADGE`, `EvidenceLevel`, `verificationOutcome`, `proveToastKey`, `profileGrants`.
- Produces:
  - `useSwitchDocument()`, which returns `{ switchTo(travellerDocumentId: string): Promise<SwitchOutcome>; switchingId: string | null; isSwitching: boolean }`, where `type SwitchOutcome = "success" | "failed" | "stale-session"`.
  - `DocumentIcon({ type, size?, className? })`.
  - `EvidenceBadge({ level })`.
  - `DocumentSwitcherSheet({ open, onOpenChange, affiliations, activeId })`.
  - The route `/{lang}/profile/verify?intent=verify|add`.

- [ ] **Step 1: Icons.**
  - Append these to `NAMES`: `"airplane-outline"`, `"car-outline"`, `"medkit-outline"`, `"checkmark-done-outline"`, `"list-outline"`, `"ellipse-outline"`, `"add-outline"`, `"repeat-outline"`.
  - Run `node apps/ssr/scripts/gen-ionicons.mjs`.
  - `grep -c "^export function Io" apps/ssr/src/components/shell/ionicons.tsx` must print `52`.

- [ ] **Step 2: Strings.**
  - Add every key in the plan's **Strings** table to en and tr.
  - Run `pnpm --filter ssr run init`.
  - The en/tr key-parity check (the `node -e` one-liner from earlier plans) must print `ok`.

- [ ] **Step 3: The switch hook.** Create `S/components/documents/use-switch-document.ts`:

```ts
"use client";
import { postSetActiveDocumentApi } from "@repo/actions/unirefund/TravellerService/post-actions";
import { refreshSessionAfterAffiliationSwitch, useSession } from "@repo/utils/auth";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

export type SwitchOutcome = "success" | "failed" | "stale-session";

export function useSwitchDocument() {
  const router = useRouter();
  const { sessionUpdate } = useSession();
  const [isPending, startTransition] = useTransition();
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const switchTo = useCallback(
    async (travellerDocumentId: string): Promise<SwitchOutcome> => {
      setSwitchingId(travellerDocumentId);
      try {
        const res = await postSetActiveDocumentApi(travellerDocumentId);
        if (res.type !== "success") return "failed";
        try {
          const userData = await refreshSessionAfterAffiliationSwitch();
          await sessionUpdate({ info: userData as object });
        } catch {
          // The switch landed but the token could not follow (no refresh token, e.g. a KYC login).
          return "stale-session";
        }
        startTransition(() => router.refresh());
        return "success";
      } catch {
        return "failed";
      } finally {
        setSwitchingId(null);
      }
    },
    [router, sessionUpdate]
  );

  return { switchTo, switchingId, isSwitching: isPending || switchingId !== null };
}
```

- [ ] **Step 4: Refactor the existing switcher onto the hook, with the grant.** In `traveller-document-switcher.tsx`:
  - **Use the hook.** Replace the inline `postSetActiveDocumentApi`, `refreshSessionAfterAffiliationSwitch` and `sessionUpdate` block, and its `switchingId`, `useTransition` and `isPending` state, with `const { switchTo, isSwitching } = useSwitchDocument();`.
  - **The confirm item's `onClick`** becomes:

```ts
onClick={(e) => {
  e.preventDefault();
  if (isSwitching || selectedTravellerDocumentId === activeId) return;
  const target = selectedTravellerDocumentId;
  void switchTo(target).then((outcome) => {
    if (outcome === "success") {
      setOpen(false);
      return;
    }
    toast.error(t.SSRService[outcome === "stale-session" ? "Documents.SwitchNeedsRelogin" : "Documents.SwitchFailed"]);
    if (outcome === "failed") setSelectedTravellerDocumentId(activeId);
    else setOpen(false);
  });
}}
```

  - **Active id:** replace the inline `activeId` memo with `activeDocumentId(session?.user?.TravellerDocumentId, affiliations) ?? ""`, importing from `@/src/utils/profile/identity`.
  - **Grant:** add `const { policies } = useApplicationConfiguration();` (from `@repo/utils/app-config`) and `const canSwitch = profileGrants(policies).setActiveDocument;`. The single-affiliation early return becomes `if ((onlyAffiliation && otherAffiliations.length === 0) || !canSwitch)`. It renders the active affiliation, `activeAffiliation ?? onlyAffiliation`, in the same plain label markup.
  - **Unused imports:** remove `postSetActiveDocumentApi`, `refreshSessionAfterAffiliationSwitch`, `useTransition` and the router, if they are no longer used.

- [ ] **Step 5: The icon, the badge and the sheet.**
  - **`document-icon.tsx`:**

```tsx
import {
  IoAirplaneOutline,
  IoCardOutline,
  IoCarOutline,
  IoDocumentTextOutline,
  IoHomeOutline,
  IoMedkitOutline,
} from "@/src/components/shell/ionicons";
import { documentIconKey, type DocumentIconKey } from "@/src/utils/profile/document-format";

const ICONS: Record<DocumentIconKey, typeof IoAirplaneOutline> = {
  passport: IoAirplaneOutline,
  idCard: IoCardOutline,
  driverLicense: IoCarOutline,
  residencePermit: IoHomeOutline,
  healthInsurance: IoMedkitOutline,
  document: IoDocumentTextOutline,
};

export function DocumentIcon({ type, size = 18, className }: { type?: string | null; size?: number; className?: string }) {
  const Icon = ICONS[documentIconKey(type)];
  return <Icon className={className} size={size} />;
}
```

  - **`evidence-badge.tsx`:**

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { EVIDENCE_BADGE } from "@/src/utils/profile/document-format";
import type { EvidenceLevel } from "@/src/utils/profile/identity";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";

export function EvidenceBadge({ level }: { level?: EvidenceLevel | null }) {
  const { t } = useTranslations();
  if (!level) return null;
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold text-primary-foreground", EVIDENCE_BADGE[level])} data-testid="evidence-badge">
      {t.SSRService[`Documents.EvidenceLevel.${level}`]}
    </span>
  );
}
```

  - **`document-switcher-sheet.tsx`** (the app's `DocumentSwitcherSheet`, page width):

```tsx
"use client";
import { IoCheckmark, IoClose, IoRepeatOutline } from "@/src/components/shell/ionicons";
import { useTranslations } from "@/src/providers/i18n";
import { maskDocumentNumber } from "@/src/utils/profile/identity";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@repo/ayasofyazilim-ui/components/drawer";
import { toast } from "@repo/ayasofyazilim-ui/components/sonner";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import type { UniRefund_TravellerService_Travellers_TravellerDocumentAffiliationDto as Affiliation } from "@repo/saas/TravellerService";
import { useState } from "react";
import { DocumentIcon } from "./document-icon";
import { useSwitchDocument } from "./use-switch-document";

export function DocumentSwitcherSheet({
  open,
  onOpenChange,
  affiliations,
  activeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  affiliations: Affiliation[];
  activeId: string | null;
}) {
  const { t } = useTranslations();
  const { switchTo, isSwitching } = useSwitchDocument();
  const [selected, setSelected] = useState<string | null>(activeId);
  const target = affiliations.find((a) => a.travellerDocumentId === selected);

  function confirm() {
    if (!selected || selected === activeId || isSwitching) return;
    void switchTo(selected).then((outcome) => {
      if (outcome === "failed") {
        toast.error(t.SSRService["Documents.SwitchFailed"]);
        return;
      }
      toast[outcome === "success" ? "success" : "error"](
        outcome === "success"
          ? t.SSRService["Documents.SwitchSuccess"].replace("{0}", target?.identificationNumber ?? "")
          : t.SSRService["Documents.SwitchNeedsRelogin"]
      );
      onOpenChange(false);
    });
  }

  return (
    <Drawer onOpenChange={onOpenChange} open={open}>
      <DrawerContent className="mx-auto w-full max-w-3xl md:border-x" data-testid="document-switcher-sheet">
        <DrawerHeader className="flex-row items-center justify-between">
          <DrawerTitle className="text-xl font-bold">{t.SSRService["Documents.Switch.Title"]}</DrawerTitle>
          <DrawerDescription className="sr-only">{t.SSRService["Documents.Description"]}</DrawerDescription>
          <DrawerClose aria-label={t.SSRService["Header.Back"]} data-testid="document-switcher-close">
            <IoClose size={22} />
          </DrawerClose>
        </DrawerHeader>
        <div className="flex flex-col gap-2 px-4">
          {affiliations.map((doc) => {
            const id = doc.travellerDocumentId ?? "";
            const isSelected = id === selected;
            return (
              <button
                aria-pressed={isSelected}
                className={cn("flex items-center gap-3 rounded-md border p-3 text-left", isSelected ? "border-primary bg-foreground/5" : "border-border")}
                data-testid={`document-switcher-option-${id}`}
                key={id}
                onClick={() => setSelected(id)}
                type="button"
              >
                <DocumentIcon className="text-muted-foreground" type={doc.identificationType} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold text-foreground">{doc.travellerDocumentFullName}</span>
                  <span className="truncate text-xs text-muted-foreground">{maskDocumentNumber(doc.identificationNumber)}</span>
                </span>
                {id === activeId ? <IoCheckmark className="text-success" size={18} /> : null}
              </button>
            );
          })}
        </div>
        <div className="p-4">
          <Button
            className="w-full"
            data-testid="document-switcher-confirm"
            disabled={!selected || selected === activeId || isSwitching}
            onClick={confirm}
          >
            <IoRepeatOutline size={18} />
            {isSwitching
              ? t.SSRService["Documents.Switch.Switching"]
              : t.SSRService["Documents.Switch.SwitchTo"].replace("{0}", maskDocumentNumber(target?.identificationNumber))}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 6: The verify page.**
  - **`(main)/profile/verify/page.tsx`** (server):

```tsx
import { profileGrants } from "@/src/utils/profile/profile-grants";
import { getApplicationConfiguration } from "@repo/utils/app-config/fetch";
import { notFound } from "next/navigation";
import { VerifyView } from "./_components/verify-view";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { policies } = await getApplicationConfiguration();
  if (!profileGrants(policies).verify) notFound();
  const intent = (await searchParams).intent === "add" ? "add" : "verify";
  return <VerifyView intent={intent} />;
}
```

  - **`_components/verify-view.tsx`:**

```tsx
"use client";
import { PageHeader } from "@/src/components/shell/page-header";
import { useShell } from "@/src/components/shell/shell-context";
import { TabPage } from "@/src/components/shell/tab-page";
import { useTranslations } from "@/src/providers/i18n";
import { proveToastKey, verificationOutcome } from "@/src/utils/profile/identity";
import { postProveDocumentApi } from "@repo/actions/unirefund/TravellerService/post-actions";
import { toast } from "@repo/ayasofyazilim-ui/components/sonner";
import { DiditVerification, useDiditConfig, type VerificationResult } from "@repo/ui/unirefund/didit-verification";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

const NOT_APPROVED = {
  pending: ["Profile.Verification.PendingTitle", "Profile.Verification.PendingMessage"],
  declined: ["Profile.Verification.DeclinedTitle", "Profile.Verification.DeclinedMessage"],
  failed: ["Profile.Verification.FailedTitle", "Profile.Verification.FailedMessage"],
} as const;

export function VerifyView({ intent }: { intent: "verify" | "add" }) {
  const { t } = useTranslations();
  const { lang } = useParams<{ lang: string }>();
  const router = useRouter();
  const { documentAffiliations } = useShell();
  const { apiKey, getWorkflowForAction } = useDiditConfig();
  const workflowId = getWorkflowForAction("ProveDocument");
  const [recording, setRecording] = useState(false);
  const back = intent === "add" ? `/${lang}/profile/documents` : `/${lang}/profile`;

  async function handleComplete(result: VerificationResult) {
    const outcome = verificationOutcome(result);
    if (outcome.kind === "cancelled") {
      router.push(back);
      return;
    }
    if (outcome.kind !== "approved") {
      const [title, message] = NOT_APPROVED[outcome.kind];
      (outcome.kind === "pending" ? toast.info : toast.error)(t.SSRService[title], { description: t.SSRService[message] });
      router.push(back);
      return;
    }
    setRecording(true);
    const res = await postProveDocumentApi({ sessionId: outcome.sessionId, kycSessionProvider: "Didit" });
    setRecording(false);
    if (res.type !== "success") {
      toast.error(t.SSRService[intent === "add" ? "Documents.AddFailed" : "Profile.Verification.FailedTitle"]);
      return;
    }
    toast.success(
      intent === "add"
        ? t.SSRService[proveToastKey(documentAffiliations.map((d) => d.travellerDocumentId), res.data?.travellerDocumentId)]
        : t.SSRService["Profile.Verification.ApprovedTitle"]
    );
    router.push(back);
    router.refresh();
  }

  return (
    <TabPage>
      <PageHeader backHref={back} title={t.SSRService[intent === "add" ? "Documents.AddDocument" : "Profile.Row.Verify"]} />
      {recording ? (
        <p className="py-16 text-center text-sm text-muted-foreground" data-testid="verify-recording">{t.SSRService["Loading"]}</p>
      ) : workflowId ? (
        <DiditVerification
          apiKey={apiKey}
          declineText={t.SSRService["Header.Back"]}
          loadingText={t.SSRService["Loading"]}
          onComplete={(result) => void handleComplete(result)}
          onError={() => toast.error(t.SSRService["Profile.Verification.FailedTitle"])}
          workflowId={workflowId}
        />
      ) : (
        <p className="py-16 text-center text-sm text-muted-foreground" data-testid="verify-unavailable">
          {t.SSRService["Profile.Verification.FailedMessage"]}
        </p>
      )}
    </TabPage>
  );
}
```

  - If `postProveDocumentApi`'s success type has no `data` field, read the result DTO from wherever `structuredResponse` puts it. Check `packages/utils/api`.
  - If `kycSessionProvider`'s type rejects the string `"Didit"`, use the generated enum's `"Didit"` member, as `didit-for-validate.tsx` does.

- [ ] **Step 7: Run the gates and check by hand.**
  - Run `test:unit`, `type-check` and `lint` (0 errors).
  - Start dev detached on a free port. Signed in as the dev test traveller:
    - the Home header's document pill still renders, as a dropdown if the account has more than one document and the grant;
    - `/en/profile/verify` renders the page header and the Didit loader. **Do not complete a verification.**
  - Stop dev.

- [ ] **Step 8: Commit.** Stage every file by name, then commit:

```bash
git commit -q -F - <<'EOF'
feat(ssr): share the document switch, and add the verify page

One hook now switches the active document, with a three-way outcome
(success, failed, session not refreshed) and the set-active grant; the
navbar/Home switcher uses it. Adds the app's document switcher sheet,
document icons and evidence badges, and /profile/verify, which runs
Didit's ProveDocument and records the result. Adds the icons and every
3a string.

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

### Task 3: The Profile hero and setup strip (web-app)

**Files:**
- Create: `(main)/profile/_components/identity-hero.tsx` and `setup-strip.tsx`.
- Modify: `(main)/profile/page.tsx` and `_components/profile-hub.tsx`.

**Interfaces:**
- Consumes:
  - from Task 1: `isVerifiedLevel`, `maskDocumentNumber`, `activeDocumentId`, `setupSteps`, `countPayoutMethods`, `profilePictureUrl`, `profileGrants`;
  - from Task 2: `DocumentIcon`, `DocumentSwitcherSheet`;
  - existing: `cardGrants().view`, `getMyTravellerCardsApi`, `getProfilePictureApi`, `useShell`, `useSession`.
- Produces: `ProfileHub` gains the props `pictureUrl: string | null`, `cardCount: number | null | undefined` and `tagRowDesign: TagRowDesign`. Task 4 consumes `tagRowDesign`.

- [ ] **Step 1: The server page.** Rewrite `(main)/profile/page.tsx`:

```tsx
import { cardGrants } from "@/src/components/payout-cards/card-grants";
import { getTranslations } from "@/src/language-data/get-translations";
import { parseTagRowDesign, TAG_ROW_DESIGN_COOKIE } from "@/src/utils/tag/tag-row-design";
import { countPayoutMethods } from "@/src/utils/profile/identity";
import { profilePictureUrl } from "@/src/utils/profile/profile-picture";
import { getProfilePictureApi } from "@repo/actions/core/AccountService/actions";
import { getPublicLanguagesApi } from "@repo/actions/core/AdministrationService/actions";
import { getMyTravellerCardsApi } from "@repo/actions/unirefund/RefundService/actions";
import { getApplicationConfiguration } from "@repo/utils/app-config/fetch";
import { signOutServer } from "@repo/utils/auth";
import { auth } from "@repo/utils/auth/next-auth";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { cookies } from "next/headers";
import { ProfileHub } from "./_components/profile-hub";

function rethrowRedirect(error: unknown): null {
  if (isRedirectError(error)) throw error;
  return null;
}

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const [t, session, { policies }, cookieStore] = await Promise.all([
    getTranslations(lang),
    auth(),
    getApplicationConfiguration(),
    cookies(),
  ]);
  const [languages, cardCount, pictureUrl] = await Promise.all([
    getPublicLanguagesApi(session).catch(() => null),
    cardGrants(policies).view
      ? getMyTravellerCardsApi({}, session).then((r) => countPayoutMethods(r.data.items), rethrowRedirect)
      : Promise.resolve(undefined),
    getProfilePictureApi(session?.user?.sub || "").then(
      (r) => (r.type === "success" && r.data ? profilePictureUrl(r.data) : null),
      rethrowRedirect
    ),
  ]);
  return (
    <ProfileHub
      cardCount={cardCount}
      languageData={t}
      languagesList={languages?.data?.items ?? []}
      pictureUrl={pictureUrl}
      signOutServer={signOutServer}
      tagRowDesign={parseTagRowDesign(cookieStore.get(TAG_ROW_DESIGN_COOKIE)?.value)}
    />
  );
}
```

- [ ] **Step 2: `identity-hero.tsx`** (the app's `IdentityHero`):

```tsx
"use client";
import { DocumentIcon } from "@/src/components/documents/document-icon";
import { IoAlertCircleOutline, IoCheckmarkCircle, IoChevronDown } from "@/src/components/shell/ionicons";
import { useTranslations } from "@/src/providers/i18n";
import { isVerifiedLevel, maskDocumentNumber } from "@/src/utils/profile/identity";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import type { UniRefund_TravellerService_Travellers_TravellerDocumentAffiliationDto as Affiliation } from "@repo/saas/TravellerService";
import type { ReactNode } from "react";

export function IdentityHero({
  name,
  pictureUrl,
  activeDocument,
  canSwitch,
  onOpenSwitcher,
  children,
}: {
  name: string;
  pictureUrl: string | null;
  activeDocument: Affiliation | null;
  canSwitch: boolean;
  onOpenSwitcher: () => void;
  children?: ReactNode;
}) {
  const { t } = useTranslations();
  const verified = isVerifiedLevel(activeDocument?.evidenceLevel);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  const documentRow = activeDocument ? (
    <>
      <DocumentIcon className="text-muted-foreground" size={16} type={activeDocument.identificationType} />
      <span className="text-sm text-muted-foreground">
        {t.SSRService[`DocumentType.${activeDocument.identificationType}`] ?? activeDocument.identificationType}
      </span>
      <span className="ml-auto font-serial text-sm font-semibold text-foreground">
        {maskDocumentNumber(activeDocument.identificationNumber)}
      </span>
    </>
  ) : null;

  return (
    <section className="mb-6 flex flex-col gap-4 rounded-md border border-border bg-card p-4" data-testid="profile-hero">
      <div className="flex items-center gap-3">
        {pictureUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a data: URL or a user-supplied host
          <img alt="" className="size-16 shrink-0 rounded-full object-cover" src={pictureUrl} />
        ) : (
          <span aria-hidden="true" className="flex size-16 shrink-0 items-center justify-center rounded-full bg-foreground/5 text-lg font-semibold text-muted-foreground">
            {initials}
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="truncate text-lg font-bold text-foreground" data-testid="profile-hero-name">{name}</p>
          <p className="flex items-center gap-1.5 text-xs" data-testid="profile-hero-badge">
            {verified ? <IoCheckmarkCircle className="text-success" size={14} /> : <IoAlertCircleOutline className="text-warning" size={14} />}
            <span className={cn("font-semibold", verified ? "text-success" : "text-warning")}>
              {t.SSRService[verified ? "Profile.Identity.Verified" : "Profile.Identity.Unverified"]}
            </span>
            {activeDocument?.evidenceLevel ? (
              <span className="text-muted-foreground">· {t.SSRService[`Documents.EvidenceLevel.${activeDocument.evidenceLevel}`]}</span>
            ) : null}
          </p>
        </div>
      </div>
      {documentRow ? (
        canSwitch ? (
          <button
            className="flex items-center gap-2 rounded-md bg-foreground/5 px-3 py-2.5 text-left"
            data-testid="profile-hero-document"
            onClick={onOpenSwitcher}
            type="button"
          >
            {documentRow}
            <IoChevronDown className="text-muted-foreground" size={16} />
          </button>
        ) : (
          <div className="flex items-center gap-2 rounded-md bg-foreground/5 px-3 py-2.5" data-testid="profile-hero-document">
            {documentRow}
          </div>
        )
      ) : null}
      {children ? (
        <>
          <div aria-hidden="true" className="h-px bg-border" />
          {children}
        </>
      ) : null}
    </section>
  );
}
```

  If the eslint config does not know `@next/next/no-img-element`, drop the disable comment and keep the `<img>`. A warning is acceptable.

- [ ] **Step 3: `setup-strip.tsx`** (the app's `VerificationStrip`):

```tsx
"use client";
import { IoCheckmarkCircle, IoChevronForward, IoEllipseOutline, IoShieldCheckmarkOutline } from "@/src/components/shell/ionicons";
import { useTranslations } from "@/src/providers/i18n";
import type { SetupProgress } from "@/src/utils/profile/identity";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import Link from "next/link";
import { useParams } from "next/navigation";

const CTA_HREF = { identity: "/profile/verify", document: "/profile/documents", payout: "/profile/cards" } as const;

export function SetupStrip({ progress }: { progress: SetupProgress }) {
  const { t } = useTranslations();
  const { lang } = useParams<{ lang: string }>();
  if (progress.total === 0) return null;
  if (progress.next === null) {
    return (
      <p className="flex items-center gap-2 text-sm font-medium text-success" data-testid="setup-all-done">
        <IoCheckmarkCircle size={18} />
        {t.SSRService["Profile.Setup.AllDone"]}
      </p>
    );
  }
  const next = progress.next;
  return (
    <div className="flex flex-col gap-3" data-testid="setup-strip">
      <p className="text-xs font-semibold text-muted-foreground">
        {t.SSRService["Profile.Setup.Progress"].replace("{0}", String(progress.completed)).replace("{1}", String(progress.total))}
      </p>
      <ul className="flex flex-col gap-2">
        {progress.steps.map((step) => (
          <li className="flex items-center gap-2" data-testid={`setup-step-${step.key}`} key={step.key}>
            {step.done ? <IoCheckmarkCircle className="text-success" size={16} /> : <IoEllipseOutline className="text-muted-foreground" size={16} />}
            <span className={cn("text-sm", step.done ? "text-muted-foreground" : "text-foreground")}>
              {t.SSRService[`Profile.Setup.${step.key}.Label`]}
            </span>
          </li>
        ))}
      </ul>
      <Link
        className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2.5 transition-colors hover:bg-primary/20"
        data-testid={`setup-cta-${next}`}
        href={`/${lang}${CTA_HREF[next]}`}
      >
        <IoShieldCheckmarkOutline className="shrink-0 text-primary" size={18} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-semibold text-primary">{t.SSRService[`Profile.Setup.${next}.Cta`]}</span>
          <span className="line-clamp-2 text-xs text-muted-foreground">{t.SSRService[`Profile.Setup.${next}.Hint`]}</span>
        </span>
        <IoChevronForward className="shrink-0 text-primary" size={16} />
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: Mount the hero in the hub.** In `profile-hub.tsx`:
  - **Props:** add `pictureUrl`, `cardCount` and `tagRowDesign` (type `TagRowDesign` from `@/src/utils/tag/tag-row-design`) to its props.
  - **Read the shell state:**

```tsx
const { session } = useSession(); // from @repo/utils/auth
const { documentAffiliations } = useShell();
const grants = profileGrants(policies);
const activeId = activeDocumentId(session?.user?.TravellerDocumentId, documentAffiliations);
const activeDocument = documentAffiliations.find((d) => d.travellerDocumentId === activeId) ?? null;
const [switcherOpen, setSwitcherOpen] = useState(false);
const progress = setupSteps({
  verified: isVerifiedLevel(activeDocument?.evidenceLevel),
  documentCount: documentAffiliations.length,
  cardCount,
  canVerify: grants.verify,
});
const name = [session?.user?.name, session?.user?.surname].filter(Boolean).join(" ");
```

  - **Render:** directly after `<PageHeader … />`:

```tsx
<IdentityHero
  activeDocument={activeDocument}
  canSwitch={documentAffiliations.length > 1 && grants.setActiveDocument}
  name={name}
  onOpenSwitcher={() => setSwitcherOpen(true)}
  pictureUrl={pictureUrl}
>
  <SetupStrip progress={progress} />
</IdentityHero>
<DocumentSwitcherSheet
  activeId={activeId}
  affiliations={documentAffiliations}
  key={activeId ?? "none"}
  onOpenChange={setSwitcherOpen}
  open={switcherOpen}
/>
```

  - **The temporary `renderRow` cases.** `tagRowDesign` is unused until Task 4. Add `void tagRowDesign;` only if lint fails on an unused prop; otherwise leave it. To keep the switch exhaustive and type-check passing, add placeholder cases to `renderRow` for the Task 1 row ids:
    - `case "documents":` returns a `Link` to `/${lang}/profile/documents` with `data-testid="profile-row-documents"`, `SettingsRowContent` `Icon={IoDocumentTextOutline}`, `label={t["Profile.Row.Documents"]}`, and the value `documentAffiliations.length ? String(documentAffiliations.length) : undefined`.
    - `case "verify":` returns a `Link` to `/${lang}/profile/verify` with `data-testid="profile-row-verify"`, `IoCheckmarkDoneOutline` and `t["Profile.Row.Verify"]`.
    - `case "tag-row-design":` returns a `Link` to `/${lang}/profile/tag-row-design` with `data-testid="profile-row-tag-row-design"`, `IoListOutline`, `t["Profile.Row.TagRowDesign"]`, and `value={t[tagRowDesignLabelKey(tagRowDesign)]}`.

    These are their final form, so Task 4 does not touch them again.
  - **The cards row:** it gains `value={cardCount ? String(cardCount) : undefined}`.

- [ ] **Step 5: Run the gates and check by hand.**
  - Run `test:unit`, `type-check` and `lint` (0 errors).
  - Start dev detached. Signed in at 375 px, check `/en/profile`:
    - the hero (initials or picture, name and badge);
    - the document row;
    - the setup strip or all-done;
    - My Documents with its count, Verify Account if granted, Tag list style with its value, and My Cards with its count.
  - Open and close the switcher sheet if the account has more than one document. Do not confirm a switch.
  - Stop dev.

- [ ] **Step 6: Commit.** Stage every file by name, then commit:

```bash
git commit -q -F - <<'EOF'
feat(ssr): give the Profile the app's identity hero and setup strip

The hub opens with the app's hero: the avatar or initials, the name, the
verified badge with the evidence level, and the active document, which
opens the switcher sheet when there is more than one. The setup strip
counts identity, travel document and payout method, each behind its
grant, and points at the first one left. The rows gain My Documents,
Verify Account and Tag list style, and My Cards shows its count.

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

### Task 4: Tag list style picker and in-app account deletion (web-app)

**Files:**
- Create:
  - `(main)/profile/tag-row-design/page.tsx` and `_components/tag-row-design-picker.tsx`
  - `(main)/profile/_components/delete-account-sheet.tsx`
- Modify: `(main)/profile/_components/profile-hub.tsx`, the `account-deletion` row.

**Interfaces:**
- Consumes:
  - from Task 1: `TAG_ROW_DESIGN_OPTIONS`, `tagRowDesignCookie`, `DELETE_COUNTDOWN_SECONDS`, `isDeleteEnabled`, `deleteButtonLabel`, `profileGrants().deleteAccount`, `deleteGdprApi`;
  - existing: `parseTagRowDesign`, `TAG_ROW_DESIGN_COOKIE`, `signOutServer` (a hub prop).

- [ ] **Step 1: The picker.**
  - **`(main)/profile/tag-row-design/page.tsx`:**

```tsx
import { parseTagRowDesign, TAG_ROW_DESIGN_COOKIE } from "@/src/utils/tag/tag-row-design";
import { cookies } from "next/headers";
import { TagRowDesignPicker } from "./_components/tag-row-design-picker";

export default async function Page() {
  const cookieStore = await cookies();
  return <TagRowDesignPicker current={parseTagRowDesign(cookieStore.get(TAG_ROW_DESIGN_COOKIE)?.value)} />;
}
```

  - **`_components/tag-row-design-picker.tsx`:**

```tsx
"use client";
import { PageHeader } from "@/src/components/shell/page-header";
import { TabPage } from "@/src/components/shell/tab-page";
import { useTranslations } from "@/src/providers/i18n";
import { TAG_ROW_DESIGN_OPTIONS, tagRowDesignCookie } from "@/src/utils/profile/tag-row-design-options";
import type { TagRowDesign } from "@/src/utils/tag/tag-row-design";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

export function TagRowDesignPicker({ current }: { current: TagRowDesign }) {
  const { t } = useTranslations();
  const { lang } = useParams<{ lang: string }>();
  const router = useRouter();
  const [selected, setSelected] = useState(current);

  function choose(value: TagRowDesign) {
    document.cookie = tagRowDesignCookie(value);
    setSelected(value);
    router.refresh();
  }

  return (
    <TabPage>
      <PageHeader backHref={`/${lang}/profile`} title={t.SSRService["TagRowDesign.Title"]} />
      <p className="mt-1 mb-4 text-sm text-muted-foreground">{t.SSRService["TagRowDesign.Description"]}</p>
      <div aria-label={t.SSRService["TagRowDesign.Title"]} className="flex flex-col gap-2" role="radiogroup">
        {TAG_ROW_DESIGN_OPTIONS.map((option) => {
          const active = option.value === selected;
          return (
            <button
              aria-checked={active}
              className={cn("flex items-center gap-3 rounded-md border p-4 text-left", active ? "border-info bg-info-surface" : "border-border")}
              data-testid={`tag-row-design-${option.value}`}
              key={option.value}
              onClick={() => choose(option.value)}
              role="radio"
              type="button"
            >
              <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border-2", active ? "border-info" : "border-input")}>
                {active ? <span className="size-2.5 rounded-full bg-info" /> : null}
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-semibold text-foreground">{t.SSRService[option.labelKey]}</span>
                <span className="text-xs text-muted-foreground">{t.SSRService[option.hintKey]}</span>
              </span>
            </button>
          );
        })}
      </div>
    </TabPage>
  );
}
```

- [ ] **Step 2: The delete sheet** (the app's `DeleteAccountModal`, page width):

```tsx
"use client";
import { IoAlertCircleOutline, IoClose } from "@/src/components/shell/ionicons";
import { useTranslations } from "@/src/providers/i18n";
import { DELETE_COUNTDOWN_SECONDS, deleteButtonLabel, isDeleteEnabled } from "@/src/utils/profile/delete-countdown";
import { deleteGdprApi } from "@repo/actions/core/IdentityService/delete-actions";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@repo/ayasofyazilim-ui/components/drawer";
import { toast } from "@repo/ayasofyazilim-ui/components/sonner";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// The parent remounts this (a new key per open), so the countdown restarts each time.
export function DeleteAccountSheet({
  open,
  onOpenChange,
  signOutServer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  signOutServer: (options?: { redirectTo?: string }) => Promise<unknown>;
}) {
  const { t } = useTranslations();
  const { lang } = useParams<{ lang: string }>();
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState(DELETE_COUNTDOWN_SECONDS);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => window.clearInterval(id);
  }, [open]);

  async function confirm() {
    if (!isDeleteEnabled(secondsLeft) || deleting) return;
    setDeleting(true);
    const res = await deleteGdprApi();
    if (res.type !== "success") {
      setDeleting(false);
      toast.error(t.SSRService["DeleteAccount.ErrorMessage"]);
      return;
    }
    toast.success(t.SSRService["DeleteAccount.SuccessMessage"]);
    await signOutServer({ redirectTo: "/" });
    router.refresh();
  }

  const enabled = isDeleteEnabled(secondsLeft) && !deleting;
  return (
    <Drawer onOpenChange={onOpenChange} open={open}>
      <DrawerContent className="mx-auto w-full max-w-3xl md:border-x" data-testid="delete-account-sheet">
        <DrawerHeader className="flex-row items-center justify-between">
          <DrawerTitle className="text-base font-semibold">{t.SSRService["DeleteAccount.Title"]}</DrawerTitle>
          <DrawerDescription className="sr-only">{t.SSRService["DeleteAccount.ConfirmDescription"]}</DrawerDescription>
          <DrawerClose aria-label={t.SSRService["Header.Back"]} data-testid="delete-account-close">
            <IoClose size={22} />
          </DrawerClose>
        </DrawerHeader>
        <div className="flex flex-col items-center gap-4 px-4 pb-6 text-center">
          <IoAlertCircleOutline className="text-error" size={72} />
          <p className="text-2xl font-bold text-foreground">{t.SSRService["DeleteAccount.ConfirmTitle"]}</p>
          <p className="text-muted-foreground">{t.SSRService["DeleteAccount.ConfirmDescription"]}</p>
          <Link className="text-sm font-medium text-primary underline underline-offset-4" data-testid="delete-account-learn-more" href={`/${lang}/account-deletion`}>
            {t.SSRService["DeleteAccount.LearnMore"]}
          </Link>
          <button
            className={cn(
              "w-full rounded-full py-4 font-semibold text-primary-foreground",
              enabled ? "bg-primary" : "cursor-not-allowed bg-foreground/20"
            )}
            data-testid="delete-account-confirm"
            disabled={!enabled}
            onClick={() => void confirm()}
            type="button"
          >
            {deleteButtonLabel(t.SSRService["DeleteAccount.DeleteButton"], secondsLeft)}
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

  If `deleteGdprApi`'s `structuredResponse` result reports success differently, match the success check that existing `delete-actions` callers use.

- [ ] **Step 3: Wire the row.** In `profile-hub.tsx`:
  - **Add the state:** `const [deleteOpen, setDeleteOpen] = useState(false); const [deleteKey, setDeleteKey] = useState(0);`.
  - **The `account-deletion` case:** when `grants.deleteAccount` holds, render:

```tsx
<button
  className={cn(SETTINGS_ROW_CLASS, "w-full")}
  data-testid="profile-row-account-deletion"
  onClick={() => {
    setDeleteKey((k) => k + 1);
    setDeleteOpen(true);
  }}
  type="button"
>
  <SettingsRowContent Icon={IoPersonRemoveOutline} label={t["Profile.Row.AccountDeletion"]} />
</button>
```

    Otherwise it keeps today's `Link` to `/${lang}/account-deletion`.
  - **Mount the sheet once:** `{grants.deleteAccount ? <DeleteAccountSheet key={deleteKey} onOpenChange={setDeleteOpen} open={deleteOpen} signOutServer={signOutServer} /> : null}`.

- [ ] **Step 4: Run the gates and check by hand.**
  - Run `test:unit`, `type-check` and `lint` (0 errors).
  - Start dev detached. Signed in:
    - On `/en/profile/tag-row-design`, pick Compact. `document.cookie` holds `tag-row-design=pill`, and `/en/tags` shows the flat rows.
    - Pick Current again.
    - Back on `/en/profile`, the row reads Current.
    - Open Account Deletion if granted. The button counts down from 10 and then enables. **Close the sheet without pressing it.** Re-open it: the countdown restarts.
  - Stop dev.

- [ ] **Step 5: Commit.** Stage every file by name, then commit:

```bash
git commit -q -F - <<'EOF'
feat(ssr): add the Tag list style picker and in-app account deletion

/profile/tag-row-design is the app's three-card picker; a tap writes the
tag-row-design cookie the Tags list reads. Account Deletion opens the
app's sheet when the GDPR grant is held: a ten-second countdown, a link
to the account-deletion page, and a confirm that deletes the account and
signs out. Without the grant the row still links to the information page.

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

### Task 5: Documents page (web-app)

**Files:**
- Create in `(main)/profile/documents/`: `page.tsx`, `loading.tsx`, `_components/documents-view.tsx`, `_components/active-document-panel.tsx` and `_components/document-tile.tsx`.

**Interfaces:**
- Consumes:
  - from Task 1: `activeDocumentId`, `maskDocumentNumber`, `profileGrants`;
  - from Task 2: `useSwitchDocument`, `DocumentIcon`, `EvidenceBadge`;
  - existing: `postSetPrimaryDocumentApi`, `useShell`, `useSession`, `useApplicationConfiguration`.

- [ ] **Step 1: `page.tsx` and `loading.tsx`.**
  - **`page.tsx`:**

```tsx
import { DocumentsView } from "./_components/documents-view";

export default function Page() {
  return <DocumentsView />;
}
```

  - **`loading.tsx`:**

```tsx
import { TabPage } from "@/src/components/shell/tab-page";
import { Skeleton } from "@repo/ayasofyazilim-ui/components/skeleton";

export default function Loading() {
  return (
    <TabPage>
      <div className="mb-4 h-10" />
      <div className="flex flex-col gap-4" data-testid="documents-skeleton">
        <Skeleton className="h-[104px] w-full rounded-md" />
        <Skeleton className="h-3 w-24" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-32 rounded-md" />
          <Skeleton className="h-32 rounded-md" />
        </div>
      </div>
    </TabPage>
  );
}
```

- [ ] **Step 2: `active-document-panel.tsx`** (the app's `ActiveDocumentPanel`):

```tsx
"use client";
import { DocumentIcon } from "@/src/components/documents/document-icon";
import { EvidenceBadge } from "@/src/components/documents/evidence-badge";
import { useTranslations } from "@/src/providers/i18n";
import type { UniRefund_TravellerService_Travellers_TravellerDocumentAffiliationDto as Affiliation } from "@repo/saas/TravellerService";

export function ActiveDocumentPanel({ document }: { document: Affiliation }) {
  const { t } = useTranslations();
  return (
    <section className="flex min-h-[104px] items-start justify-between gap-3 rounded-md border border-border bg-card p-4" data-testid="active-document-panel">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">{t.SSRService["Documents.IssuedTo"]}</p>
        <p className="truncate font-serial text-3xl font-semibold text-foreground">{document.identificationNumber}</p>
        <p className="truncate text-xs text-muted-foreground uppercase">{document.travellerDocumentFullName}</p>
        <p className="text-xs text-muted-foreground">
          {t.SSRService[`DocumentType.${document.identificationType}`] ?? document.identificationType}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <span className="flex size-10 items-center justify-center rounded-full bg-foreground/5 text-foreground">
          <DocumentIcon size={20} type={document.identificationType} />
        </span>
        <EvidenceBadge level={document.evidenceLevel} />
      </div>
    </section>
  );
}
```

- [ ] **Step 3: `document-tile.tsx`** (the app's `DocumentCard`):

```tsx
"use client";
import { DocumentIcon } from "@/src/components/documents/document-icon";
import { EvidenceBadge } from "@/src/components/documents/evidence-badge";
import { IoCheckmark } from "@/src/components/shell/ionicons";
import { useTranslations } from "@/src/providers/i18n";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import type { UniRefund_TravellerService_Travellers_TravellerDocumentAffiliationDto as Affiliation } from "@repo/saas/TravellerService";

export function DocumentTile({
  document,
  inUse,
  pending,
  canSetActive,
  canSetPrimary,
  onSetActive,
  onSetPrimary,
}: {
  document: Affiliation;
  inUse: boolean;
  pending: boolean;
  canSetActive: boolean;
  canSetPrimary: boolean;
  onSetActive: () => void;
  onSetPrimary: () => void;
}) {
  const { t } = useTranslations();
  const id = document.travellerDocumentId ?? "";
  return (
    <article
      className={cn("flex flex-col gap-2 rounded-md border bg-card p-4", inUse ? "border-primary" : "border-border", pending && "opacity-50")}
      data-testid={`document-tile-${id}`}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-foreground/5 text-foreground">
          <DocumentIcon type={document.identificationType} />
        </span>
        <div className="flex min-w-0 flex-col">
          <p className="truncate text-base font-semibold text-foreground">{document.travellerDocumentFullName}</p>
          <p className="truncate text-sm text-muted-foreground">
            {t.SSRService[`DocumentType.${document.identificationType}`] ?? document.identificationType} · {document.identificationNumber}
          </p>
        </div>
      </div>
      {inUse ? (
        <p className="flex items-center gap-2 text-sm font-medium text-foreground" data-testid={`document-in-use-${id}`}>
          <span className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <IoCheckmark size={12} />
          </span>
          {t.SSRService["Documents.InUse"]}
        </p>
      ) : canSetActive ? (
        <button className="flex items-center gap-2 text-left text-sm text-foreground" data-testid={`document-use-${id}`} disabled={pending} onClick={onSetActive} type="button">
          <span className="size-5 rounded-full border-2 border-input" />
          {t.SSRService["Documents.UseThisDocument"]}
        </button>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {document.isPrimary ? (
          <span className="rounded-full bg-warning-surface px-2 py-0.5 text-[10px] font-semibold text-warning-strong" data-testid={`document-primary-${id}`}>
            {t.SSRService["Documents.Primary"]}
          </span>
        ) : null}
        <EvidenceBadge level={document.evidenceLevel} />
        {!document.isPrimary && canSetPrimary ? (
          <button
            className="ml-auto rounded-full border border-primary px-3 py-1 text-xs font-semibold text-primary"
            data-testid={`document-set-primary-${id}`}
            disabled={pending}
            onClick={onSetPrimary}
            type="button"
          >
            {t.SSRService["Documents.SetPrimary"]}
          </button>
        ) : null}
      </div>
    </article>
  );
}
```

- [ ] **Step 4: `documents-view.tsx`:**

```tsx
"use client";
import { useSwitchDocument } from "@/src/components/documents/use-switch-document";
import { IoAddOutline, IoDocumentTextOutline } from "@/src/components/shell/ionicons";
import { PageHeader } from "@/src/components/shell/page-header";
import { useShell } from "@/src/components/shell/shell-context";
import { TabPage } from "@/src/components/shell/tab-page";
import { useTranslations } from "@/src/providers/i18n";
import { activeDocumentId } from "@/src/utils/profile/identity";
import { profileGrants } from "@/src/utils/profile/profile-grants";
import { postSetPrimaryDocumentApi } from "@repo/actions/unirefund/TravellerService/post-actions";
import { buttonVariants } from "@repo/ayasofyazilim-ui/components/button";
import { toast } from "@repo/ayasofyazilim-ui/components/sonner";
import { useApplicationConfiguration } from "@repo/utils/app-config";
import { useSession } from "@repo/utils/auth";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ActiveDocumentPanel } from "./active-document-panel";
import { DocumentTile } from "./document-tile";

export function DocumentsView() {
  const { t } = useTranslations();
  const { lang } = useParams<{ lang: string }>();
  const router = useRouter();
  const { session } = useSession();
  const { documentAffiliations: documents } = useShell();
  const { policies } = useApplicationConfiguration();
  const grants = profileGrants(policies);
  const { switchTo, switchingId } = useSwitchDocument();
  const [primaryPendingId, setPrimaryPendingId] = useState<string | null>(null);
  const activeId = activeDocumentId(session?.user?.TravellerDocumentId, documents);
  const active = documents.find((d) => d.travellerDocumentId === activeId) ?? null;
  const busy = switchingId !== null || primaryPendingId !== null;
  const addHref = `/${lang}/profile/verify?intent=add`;

  function setActive(id: string, number: string) {
    if (busy) {
      toast.info(t.SSRService["Documents.Busy"]);
      return;
    }
    void switchTo(id).then((outcome) => {
      if (outcome === "success") toast.success(t.SSRService["Documents.SwitchSuccess"].replace("{0}", number));
      else toast.error(t.SSRService[outcome === "stale-session" ? "Documents.SwitchNeedsRelogin" : "Documents.SwitchFailed"]);
    });
  }

  function setPrimary(id: string) {
    if (busy) {
      toast.info(t.SSRService["Documents.Busy"]);
      return;
    }
    setPrimaryPendingId(id);
    void postSetPrimaryDocumentApi(id).then((res) => {
      setPrimaryPendingId(null);
      if (res.type !== "success") {
        toast.error(t.SSRService["Documents.SetPrimaryFailed"]);
        return;
      }
      toast.success(t.SSRService["Documents.SetPrimarySuccess"]);
      router.refresh();
    });
  }

  return (
    <TabPage>
      <PageHeader backHref={`/${lang}/profile`} title={t.SSRService["Documents.Title"]} />
      <p className="-mt-2 mb-4 text-base text-muted-foreground">{t.SSRService["Documents.Description"]}</p>
      {documents.length === 0 ? (
        <section className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border p-6 text-center" data-testid="documents-empty">
          <IoDocumentTextOutline className="text-muted-foreground" size={32} />
          <p className="text-base font-semibold text-foreground">{t.SSRService["Documents.Empty"]}</p>
          <p className="text-sm text-muted-foreground">{t.SSRService["Documents.EmptyDescription"]}</p>
          {grants.verify ? (
            <Link className={buttonVariants({ className: "mt-2" })} data-testid="documents-empty-add" href={addHref}>
              {t.SSRService["Documents.AddDocument"]}
            </Link>
          ) : null}
        </section>
      ) : (
        <div className="flex flex-col gap-4">
          {active ? <ActiveDocumentPanel document={active} /> : null}
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase">{t.SSRService["Documents.DocumentsSection"]}</p>
            <span className="text-xs font-semibold text-muted-foreground">{documents.length}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {documents.map((doc) => {
              const id = doc.travellerDocumentId ?? "";
              return (
                <DocumentTile
                  canSetActive={grants.setActiveDocument}
                  canSetPrimary={grants.setPrimaryDocument}
                  document={doc}
                  inUse={id === activeId}
                  key={id}
                  onSetActive={() => setActive(id, doc.identificationNumber ?? "")}
                  onSetPrimary={() => setPrimary(id)}
                  pending={id === switchingId || id === primaryPendingId}
                />
              );
            })}
            {grants.verify ? (
              <Link
                className="flex min-h-16 items-center justify-center gap-2 rounded-md border border-dashed border-input p-4 text-primary"
                data-testid="documents-add"
                href={addHref}
              >
                <IoAddOutline size={20} />
                <span className="text-sm font-semibold">{t.SSRService["Documents.AddDocument"]}</span>
              </Link>
            ) : null}
          </div>
        </div>
      )}
    </TabPage>
  );
}
```

- [ ] **Step 5: Run the gates and check by hand.**
  - Run `test:unit`, `type-check` and `lint` (0 errors).
  - Start dev detached. Signed in at 375 px and 1280 px, check `/en/profile/documents`:
    - the hero panel and the DOCUMENTS heading with its count;
    - the tiles: "In use" on the active one, the Primary badge, the evidence badge, and "Set as primary" on the others when granted;
    - the dashed Add document tile linking to `/en/profile/verify?intent=add`.
  - Do not switch documents or set a primary unless the account has a second document and the user agrees.
  - Stop dev.

- [ ] **Step 6: Commit.** Stage every file by name, then commit:

```bash
git commit -q -F - <<'EOF'
feat(ssr): add the app's Documents page

/profile/documents shows the document tags are issued to, then a tile
per document: in use or "Issue tags to this document", Primary and the
evidence level, and "Set as primary". Add document runs Didit's
ProveDocument through /profile/verify. Every action sits behind its
grant.

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

### Task 6: Gates, manual pass, push and PR (controller)

- [ ] **Step 1: Gates on the branch head.**
  - Run `test:unit`, ssr `type-check`, ssr `lint` and `pnpm --filter web type-check`.
  - With no dev server up, run `pnpm --filter ssr build` and `pnpm --filter web build`.
- [ ] **Step 2: Manual pass** at 375 px and 1280 px, signed in as `tur-a25y29041`. Cover:
  - the hero, the strip and every row;
  - the switcher sheet, opened and closed;
  - the Tag list style picker, with its round trip through `/tags`;
  - the delete sheet's countdown, closed without confirming;
  - the Documents page;
  - `/en/profile/verify`, which loads Didit; leave without completing.

  Record anything unverified.
- [ ] **Step 3: Push and open the PR.**
  - Run `git push -u origin feat/ssr-visual-parity-profile`.
  - Open a PR into `feat/ssr-visual-parity-home-tags` with the repo template, and say it is stacked on #313.
  - End the body with the attribution line.

# ssr visual parity, sub-project 2 (Home, Tags and tag detail): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ssr's traveller Home, Tags list, tag detail and public QR page look and behave like super-app's traveller screens.

**Architecture:**
- The app's pure tag logic is ported into `apps/ssr/src/utils/tag/` as node-tested `.ts` modules.
- The app's tag surfaces become web components in `apps/ssr/src/components/tags/`. They are the classic card, the flat pill/tinted row, the skeletons and the empty states.
- Home, the Tags list, the detail sections and the public preview are rebuilt on top of those surfaces. They use sub-project 1's shell: `TabPage`, `PageHeader`, `Surface`, the island and the shell context.
- Server pages fetch. A list streams behind a skeleton through `Suspense`.

**Tech stack:** Next.js 16 (App Router, webpack dev), Tailwind v4, `node:test` via `tsx`, `@repo/ayasofyazilim-ui` (Button, Input, Drawer, Collapsible, Skeleton).

**Spec:** `C:\unirefund\docs\superpowers\specs\2026-10-02-ssr-visual-parity-home-tags-design.md`

**Where the work happens:**
- **Worktree:** `C:\unirefund\web-app-wt-visual-parity`.
- **Branch:** `feat/ssr-visual-parity-home-tags`, cut from `feat/ssr-visual-parity-shell` at `3098af5a7`.
- **PR target:** `feat/ssr-visual-parity-shell` until #312 merges, then retarget to `feat/ssr-visual-parity`.
- ssr only; no super-app change.

All `apps/ssr/...` paths below are relative to the worktree. `S/` means `apps/ssr/src/`. `(main)` and `(public)` mean `S/app/[lang]/(main)` and `S/app/[lang]/(public)`.

## Global Constraints

- **QR contract.** `/tag/<slug>` (with or without a locale, opened signed out from a phone camera) and `/{lang}/validate?qrValue=…` keep working unchanged. Slugs are decoded only through `@unirefund/qr`.
- **The detail URL stays `/{lang}/tags/{tagNumber}`.**
- **The public page never ships the traveller to the browser.** `publicTagView` stays the only shape passed to its client component. The tag's kind is computed on the server *before* stripping, and only the kind crosses.
- **Grants.** Every control and every optional call is gated on its endpoint's group grant **and** its leaf grant. An ungated control is not rendered, and its call is not made.

  | Control or call | Group + leaf | Helper |
  | --- | --- | --- |
  | Upload for verification | `TagService.StickerManualVerifications` + `.Upload` | `tagGrants().uploadVerification` |
  | Tags \| Verifications switch, and the verifications call | `TagService.StickerManualVerifications` + `.ViewMine` | `tagGrants().viewMyVerifications` |
  | Claim | `TagService.Tags` + `.TravellerSelfAssign` | `tagGrants().claim` |
  | Payout methods tile, and the card-count call | `RefundService.TravellerCards` + `.ViewMine` | `cardGrants().view` |
  | Risk dot | `TagService.TagRisks` + `.ViewRiskLevel` | `tagGrants().viewRisk` |

- **Single centred column.** These pages use `TabPage` without `wide`.
- **Class translation from NativeWind.** ssr's shadcn tokens differ from the app's on four names:

  | App class | ssr class |
  | --- | --- |
  | `text-muted` | `text-muted-foreground` |
  | `text-placeholder` | `text-muted-foreground` |
  | `bg-muted` (the neutral rail) | `bg-muted-foreground` |
  | `text-muted` on a tinted badge | `text-muted-foreground` |

  Every other class copies verbatim: `bg-card`, `border-border`, `border-input`, `bg-foreground/5`, `bg-primary/10`, `font-serial`, `bg-success`, `bg-success-surface`, `text-success-strong` (and the same for `info`, `warning` and `error`), and `text-primary-foreground`.
- **Dates render the same on the server and on the first client paint.** Format in `UTC` until mounted, using `useIsClient()` from `S/hooks/use-is-client` (memory `web-app-ssr-hydration-date-and-select`).
- **ssr strings.**
  - New `SSRService` strings go in both `S/language-data/unirefund/SSRService/resources/en.json` and `tr.json`. Keys are flat and placeholders are `{0}`, `{1}`.
  - There must be no duplicate keys. If a key already exists, keep one entry and give it the value in the table.
  - Run `pnpm --filter ssr run init` afterwards. Never commit `src/language-data/i18n/*.gen.json`.
- **ssr test ids.** Every `Link`, `Button`, `Input`, `Label` and `*Trigger`, and every native `<button>`, carries a `data-testid` (lint rule `react-require-testid/testid-missing`).
- **ssr tests.** `test:unit` runs `node --import tsx --test "src/**/*.test.ts"`: Node's runner, `.ts` only, no JSX.
- **Never `next build` while a dev server runs on this checkout.** Implementers never push. Never commit `*.gen.json`, `.env`, or the submodule pointers.
- **Never press Claim on a real tag** during manual checks.
- **Comments** are rare and short: one line, only where the reason is not obvious.

## Review Focus

1. **A bookmarked or stale page past the end** (`?page=9` on a two-page list). The list shows "No tags match these filters" with Clear all, and the pager. It does not show "No Tags Yet", which would tell a traveller with tags that they have none. Pinned by: Task 1 `tagListState` "page past the end" case.
2. **A search that matches nothing on this page.** The list shows the no-match state, with Clear all clearing the search, and the pager stays because other pages may match. Pinned by: Task 1 `tagListState` "search on this page only" case.
3. **Home's upload while the traveller lacks ViewMine.** The upload sends them to `/tags?view=verifications`, which falls back to the tags view rather than calling a 403 endpoint. Pinned by: Task 1 `resolveTagsView` cases.
4. **A tag stamped 23:00Z** renders the same list date on the server (UTC) as on the first client paint. Pinned by: Task 1 `formatListDate` UTC case.
5. **A tag with no amount or no currency.** The row shows "—" with no PURCHASE caption, and the summary still totals it under the fallback currency. Pinned by: Task 1 `formatPlainAmount` null case, and the ported "falls back to the tenant currency" summary case.

---

## File structure

| Path | Change |
| --- | --- |
| `S/utils/tag/tag-money.ts` + `.test.ts` | new: port of `utils/tagMoney.ts` |
| `S/utils/tag/home-summary.ts` + `.test.ts` | new: port of `buildRefundSummary` |
| `S/utils/tag/tag-row-tone.ts` + `.test.ts` | new: bar, wash and text classes per status |
| `S/utils/tag/tag-row-design.ts` + `.test.ts` | new: the design type and the cookie parser |
| `S/utils/tag/traveller-filters.ts` + `.test.ts` | new: the filter count |
| `S/utils/tag/tag-search.ts` + `.test.ts` | new: the page search and the list state |
| `S/utils/tag/tag-kind.ts` + `.test.ts` | new: kind, preview action, claim amount |
| `(main)/tags/tag-list-params.ts` + `.test.ts` | add `view` and `resolveTagsView` |
| `S/components/tags/tag-grants.ts` + `.test.ts` | add `uploadVerification` and `viewMyVerifications` |
| `S/components/payout-cards/card-grants.ts` + `.test.ts` | add `view` |
| `S/components/tag-detail/format.ts` + `.test.ts` | add `formatListDate` and `formatPlainAmount` |
| `apps/ssr/scripts/gen-ionicons.mjs`, `S/components/shell/ionicons.tsx` | 22 more icons |
| `S/components/tags/status-classes.ts` | new: rail, badge, text and risk classes |
| `S/components/tags/tag-card.tsx` | new: classic card, hero and row |
| `S/components/tags/tag-row.tsx` | new: the pill and wash row |
| `S/components/tags/tag-list-item.tsx` | new: picks the row by design |
| `S/components/tags/tag-skeletons.tsx` | new: card, row and list skeletons (server-safe) |
| `S/components/tags/tag-states.tsx` | new: empty, no-match and error states |
| `S/components/verification/upload-verification-dialog.tsx` | moved from `(main)/tags/_components/`, now controlled |
| `S/components/shell/shell-context.tsx`, `tab-island.tsx` | `openScan()`; the overlay moves into the provider |
| `S/components/shell/pinned-bar.tsx` | new: the bar above the island |
| `S/components/shell/tab-page.tsx` | `pinnedBar` clearance |
| `S/app/[lang]/layout.tsx` | the Toaster offset clears a pinned bar |
| `(public)/page.tsx`, `client.tsx` | the dashboard streams under the header |
| `(public)/_components/home-*.tsx`, `refund-summary-card.tsx` | new: the Home components |
| `(main)/tags/page.tsx` | the cookie, the view, and streaming |
| `(main)/tags/_components/*` | rebuilt: view, toolbar, filter sheet, switch, list, verifications, pager |
| `S/components/tags/blob-pager.tsx` | new: the app's blob pager |
| `S/components/tag-detail/*` | restyled to the app's anatomy, single column |
| `(main)/tags/[tagNumber]/*` | the error state and `loading.tsx` |
| `(public)/tag/[slug]/*` | the scan preview: kind, note, pinned action |

## Strings

These are new `SSRService` keys, worded like the app's `MobileApp.*` keys. They are all added in Task 2.

| Key | en | tr |
| --- | --- | --- |
| `Home.Summary.Expected` | You'll receive | Alacağınız tutar |
| `Home.Summary.EstimatedNote` | estimated | tahmini |
| `Home.Summary.OneTagCount` | 1 tag | 1 etiket |
| `Home.Summary.TagCount` | {0} tags | {0} etiket |
| `Home.Summary.NotCalculated` | {0} not yet calculated | {0} tanesi henüz hesaplanmadı |
| `Home.Summary.AlreadyPaid` | {0} {1} already paid | {0} {1} ödendi |
| `Home.Start.Title` | No tags yet | Henüz etiket yok |
| `Home.Start.Description` | Shop tax-free, then scan the tag on your receipt to claim it. | Vergisiz alışveriş yapın, ardından fişinizdeki etiketi tarayarak talep edin. |
| `Home.Start.Cta` | Scan a tag | Etiket tara |
| `Home.Shortcuts.UploadDescription` | Photograph your sticker and stamped receipt | Etiketinizin ve kaşeli fişinizin fotoğrafını çekin |
| `Home.Shortcuts.Locations` | Tax-Free Locations | Tax-Free Noktalar |
| `Home.Shortcuts.LocationsDescription` | Find nearby places | Yakındaki yerleri bul |
| `Home.Shortcuts.Payout` | Payout methods | Ödeme yöntemleri |
| `Home.Shortcuts.PayoutCount` | {0} saved | {0} kayıtlı |
| `Home.LastTag` | Last Tag | Son Etiket |
| `Home.ViewAll` | View All | Tümünü Gör |
| `Tags.SearchPlaceholder` | Search tags… | Etiketlerde ara… |
| `Tags.ClearSearch` | Clear search | Aramayı temizle |
| `Tags.Filters` | Filters | Filtreler |
| `Tags.CloseFilters` | Close | Kapat |
| `Tags.ClearFilters` | Clear all | Tümünü temizle |
| `Tags.ApplyFilters` | Show results | Sonuçları göster |
| `Tags.Tabs.Label` | Tag views | Etiket görünümleri |
| `Tags.Tabs.Tags` | Tags | Etiketler |
| `Tags.Tabs.Verifications` | Verifications | Doğrulamalar |
| `Tags.ClaimATag` | Claim a tag | Etiket ekle |
| `Tags.NoMatches` | No tags match these filters | Bu filtrelere uyan etiket yok |
| `Tags.NoMatchesDescription` | Try a different search, or clear the filters. | Farklı bir arama deneyin veya filtreleri temizleyin. |
| `Tags.LoadFailed` | Couldn't load your tags | Etiketleriniz yüklenemedi |
| `Tags.LoadFailedDescription` | Check your connection and try again. | Bağlantınızı kontrol edip tekrar deneyin. |
| `Tags.Retry` | Try again | Tekrar dene |
| `Tags.Pager.Label` | Pages | Sayfalar |
| `Tags.Pager.First` | First page | İlk sayfa |
| `Tags.Pager.Previous` | Previous page | Önceki sayfa |
| `Tags.Pager.Next` | Next page | Sonraki sayfa |
| `Tags.Pager.Last` | Last page | Son sayfa |
| `Tags.Caption.Refund` | Refund | İade |
| `Tags.Caption.Purchase` | Purchase | Alışveriş |
| `Verification.Status.Completed` | Approved | Onaylandı |
| `Verification.TagCreated` | A tag was created from this pair. | Bu fotoğraf çiftinden bir etiket oluşturuldu. |
| `Verification.Empty.Title` | No verifications yet | Henüz doğrulama yok |
| `Verification.Empty.Description` | If a shop gave you a paper receipt, photograph it with its customs stamp here and we'll create your tag. | Bir mağaza size kağıt fiş verdiyse, gümrük kaşesiyle birlikte buradan fotoğrafını çekin, etiketinizi biz oluşturalım. |
| `TagDetail.Details` | Details | Detaylar |
| `TagDetail.Purchase` | Purchase | Alışveriş |
| `TagDetail.StoreName` | Store name | Mağaza adı |
| `TagDetail.FullName` | Full Name | Ad Soyad |
| `TagPreview.Title` | Tax-Free Tag | Tax-Free Etiket |
| `TagPreview.DraftInfo` | This tag isn't linked to anyone yet. Claim it to add it to your account. | Bu etiket henüz kimseye bağlı değil. Hesabınıza eklemek için sahiplenin. |
| `TagPreview.IssuedInfo` | This tag is already linked to a traveller. | Bu etiket zaten bir yolcuya bağlı. |
| `TagPreview.DivergentInfo` | This tag's status and traveller don't match. Please contact support. | Etiketin durumu ve yolcusu uyuşmuyor. Lütfen destek ile iletişime geçin. |
| `TagPreview.Claim` | Claim this tag | Bu etiketi sahiplen |
| `TagPreview.LoginToClaim` | Log in to claim | Sahiplenmek için giriş yap |
| `TagPreview.ViewInMyTags` | View in my tags | Etiketlerimde görüntüle |
| `TagPreview.LoginToView` | Log in to see your tags | Etiketlerinizi görmek için giriş yapın |
| `TagPreview.NotFound` | Tag not found. Please try scanning again. | Etiket bulunamadı. Lütfen tekrar taramayı deneyin. |
| `TagPreview.NoTagOnSticker` | No tax-free tag has been issued on this sticker yet. Ask the store to complete your purchase. | Bu etikete henüz bir vergi iadesi etiketi tanımlanmamış. Lütfen mağazadan satışı tamamlamasını isteyin. |
| `TagPreview.ClaimSuccess` | Tag claimed successfully | Etiket başarıyla sahiplenildi |
| `TagPreview.ClaimError` | Could not claim this tag. Please try again. | Bu etiket sahiplenilemedi. Lütfen tekrar deneyin. |

**Existing keys with new values**, in both en and tr:

| Key | en | tr |
| --- | --- | --- |
| `Tags.NoTags` | No Tags Yet | Henüz Etiket Yok |
| `Tags.NoTagsDescription` | Make your first purchase to create a tag | İlk alışverişinizi yapın ve etiket oluşturun |
| `Tags.DetailsTitle` | Tag detail | Etiket detayı |
| `Tags.Status.None` | Unknown | Bilinmiyor |
| `Tags.Status.Draft` | Draft | Taslak |
| `Tags.Status.Open` | Open | Açık |
| `Tags.Status.PreIssued` | Pre-issued | Ön düzenlendi |
| `Tags.Status.Issued` | Issued | Düzenlendi |
| `Tags.Status.WaitingGoodsValidation` | Awaiting goods check | Ürün kontrolü bekleniyor |
| `Tags.Status.WaitingStampValidation` | Awaiting customs stamp | Gümrük onayı bekleniyor |
| `Tags.Status.Declined` | Declined | Reddedildi |
| `Tags.Status.ExportValidated` | Export validated | İhracat onaylandı |
| `Tags.Status.PaymentBlocked` | Payment blocked | Ödeme engellendi |
| `Tags.Status.PaymentInProgress` | Payment in progress | Ödeme sürüyor |
| `Tags.Status.PaymentProblem` | Payment problem | Ödeme sorunu |
| `Tags.Status.Refunded` | Refunded | İade edildi |
| `Tags.Status.Cancelled` | Cancelled | İptal edildi |
| `Tags.Status.Expired` | Expired | Süresi doldu |
| `Tags.Status.OptedOut` | Opted out | Vazgeçildi |
| `Tags.Status.EarlyRefunded` | Refunded early | Erken iade edildi |

**Reused unchanged:**
- `Verification.Upload`: "Upload for verification".
- `Verification.StickerLineNumber`, `Verification.UploadedAt`, `Verification.RejectionReason`, `Verification.Status.Created` and `Verification.Status.Invalid`.
- `Tags.EarlyRefund`, `Tags.Overdue`, `Tags.LastDay` and `Tags.DaysLeft`.
- `Tags.SortNewest`, `Tags.SortOldest` and `Tags.IssueDateFilter`.
- `Tags.Date*`, `Tags`, `Home.Greeting`, `Header.Back`, `TryAgain`, and every existing `TagDetail.*` key.

---

### Task 0: Setup (controller)

- [ ] **Step 1: Check the worktree.**
  - In `C:\unirefund\web-app-wt-visual-parity`, run `git status --short`. It must be clean apart from untracked `.env` and `*.gen.json`.
  - `git log --oneline -1` must show `3098af5a7`.
  - No dev server may be running for this checkout. Check that no `node.exe` has the worktree path in its command line.
- [ ] **Step 2: Branch.** Run `git switch -c feat/ssr-visual-parity-home-tags`.
- [ ] **Step 3: Measure the baselines and write them to the ledger.**
  - `pnpm --filter ssr test:unit 2>&1 | grep -E "^# (tests|pass|fail)"`. The expected result is 202 tests, all passing.
  - `pnpm --filter ssr type-check 2>&1 | grep "error TS" | grep -v "\.next/"`. The expected result is nothing.
  - `pnpm --filter ssr lint 2>&1 | tail -2`. The expected result is 0 errors.
  - `pnpm --filter web type-check`. The expected result is 0 errors.

---

### Task 1: Pure tag logic (web-app)

**Files:**
- Create the following in `S/utils/tag/`, each with a `.test.ts`: `tag-money.ts`, `home-summary.ts`, `tag-row-tone.ts`, `tag-row-design.ts`, `traveller-filters.ts`, `tag-search.ts` and `tag-kind.ts`.
- Modify:
  - `(main)/tags/tag-list-params.ts` + `.test.ts`
  - `S/components/tags/tag-grants.ts` + `.test.ts`
  - `S/components/payout-cards/card-grants.ts` + `.test.ts`
  - `S/components/tag-detail/format.ts` + `format.test.ts`

**Interfaces (produced):**
- `tagMoneyBucket(status): "expected" | "received" | "lost" | "inactive"`
- `tagExpectedAmount(tag: { refund?: number | null; grossRefund?: number | null }): number | null`
- `tagExpectedAmountIsEstimate(tag): boolean`
- `type SummaryTag = { status; currency?; refund?; grossRefund? }`
- `type CurrencyTotal = { currency: string; amount: number; tagCount: number; isEstimate: boolean }`
- `type RefundSummary = { expected: CurrencyTotal[]; received: CurrencyTotal[]; expectedTagCount: number; notCalculatedCount: number }`
- `buildRefundSummary(tags: SummaryTag[], fallbackCurrency: string): RefundSummary`
- `tagRowTone(status): { bar: string; wash: string; text: string }`, where each value is a Tailwind class.
- From `tag-row-design.ts`:
  - `type TagRowDesign = "classic" | "pill" | "tinted"`
  - `TAG_ROW_DESIGN_COOKIE = "tag-row-design"`
  - `DEFAULT_TAG_ROW_DESIGN`
  - `parseTagRowDesign(value: string | null | undefined): TagRowDesign`
- `countTravellerFilters(p: { issuedStartDate?: string; issuedEndDate?: string }): number`
- `filterTagsBySearch<T extends { tagNumber?: string | null; merchantTitle?: string | null }>(tags: T[], text: string): T[]`
- `type TagListState = "list" | "empty" | "noMatch"`
- `tagListState(p: { shownCount: number; totalCount: number; narrowed: boolean }): TagListState`
- `type TagKind = "draft" | "issued" | "divergent"`
- `deriveTagKind(tag): TagKind`
- `type PreviewAction = "claim" | "loginToClaim" | "viewInMyTags" | "loginToView"`
- `previewActionFor(kind, { signedIn, canClaim }): PreviewAction | null`
- `claimSalesAmount(totals): number`
- `type TagsView = "tags" | "verifications"`. `TagListParams` gains `view: TagsView`.
- `resolveTagsView(view: TagsView, canViewVerifications: boolean): TagsView`
- `tagGrants(granted)` returns `{ claim, viewRisk, uploadVerification, viewMyVerifications }`.
- `cardGrants(granted)` gains `view`.
- `formatListDate(iso: string | null | undefined, lang: string, timeZone?: string): string`, which returns `""` for an empty or invalid value.
- `formatPlainAmount(amount: number | null | undefined, lang: string): string`, which returns `"—"` for a missing amount.

- [ ] **Step 1: Write the failing tests.**

`S/utils/tag/tag-money.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { UniRefund_TagService_Tags_TagStatusType as TagStatus } from "@repo/saas/TagService";
import {
  tagExpectedAmount,
  tagExpectedAmountIsEstimate,
  tagMoneyBucket,
} from "./tag-money";
import { tagStatusTone } from "./tag-status";

describe("tagMoneyBucket", () => {
  it("counts every live claim as expected, payment trouble included", () => {
    const expected: TagStatus[] = [
      "PreIssued",
      "Issued",
      "WaitingGoodsValidation",
      "WaitingStampValidation",
      "ExportValidated",
      "PaymentInProgress",
      "PaymentProblem",
      "PaymentBlocked",
    ];
    for (const status of expected) assert.equal(tagMoneyBucket(status), "expected");
  });
  it("counts only settled payments as received", () => {
    assert.equal(tagMoneyBucket("Refunded"), "received");
    assert.equal(tagMoneyBucket("EarlyRefunded"), "received");
  });
  it("counts dead claims as lost", () => {
    for (const status of ["Declined", "Cancelled", "Expired", "OptedOut"] as TagStatus[])
      assert.equal(tagMoneyBucket(status), "lost");
  });
  it("counts pre-claim statuses as inactive", () => {
    for (const status of ["None", "Open", "Draft"] as TagStatus[])
      assert.equal(tagMoneyBucket(status), "inactive");
  });
  it("disagrees with tagStatusTone where money and colour differ", () => {
    assert.equal(tagStatusTone("ExportValidated"), "success");
    assert.equal(tagMoneyBucket("ExportValidated"), "expected");
    assert.equal(tagStatusTone("WaitingStampValidation"), "warning");
    assert.equal(tagMoneyBucket("WaitingStampValidation"), "expected");
    assert.equal(tagMoneyBucket("Expired"), "lost");
  });
});

describe("tagExpectedAmount", () => {
  it("prefers the net refund", () => {
    assert.equal(tagExpectedAmount({ refund: 100, grossRefund: 120 }), 100);
  });
  it("falls back to the gross refund", () => {
    assert.equal(tagExpectedAmount({ grossRefund: 120 }), 120);
  });
  it("never reaches for a sales amount", () => {
    assert.equal(tagExpectedAmount({ salesAmount: 1000 } as { refund?: number | null }), null);
  });
  it("returns null when neither figure is computed yet", () => {
    assert.equal(tagExpectedAmount({}), null);
    assert.equal(tagExpectedAmount({ refund: null, grossRefund: null }), null);
  });
  it("treats a genuine zero as a figure, not as missing", () => {
    assert.equal(tagExpectedAmount({ refund: 0 }), 0);
  });
});

describe("tagExpectedAmountIsEstimate", () => {
  it("is an estimate only when the gross refund supplied the number", () => {
    assert.equal(tagExpectedAmountIsEstimate({ refund: 100, grossRefund: 120 }), false);
    assert.equal(tagExpectedAmountIsEstimate({ grossRefund: 120 }), true);
  });
  it("is not an estimate when there is no figure at all", () => {
    assert.equal(tagExpectedAmountIsEstimate({}), false);
  });
});
```

`S/utils/tag/home-summary.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRefundSummary, type SummaryTag } from "./home-summary";

const tag = (overrides: Partial<SummaryTag> = {}): SummaryTag => ({
  status: "Issued",
  currency: "TRY",
  refund: 100,
  ...overrides,
});

describe("buildRefundSummary", () => {
  it("sums expected money per currency and counts its tags", () => {
    const summary = buildRefundSummary([tag({ refund: 100 }), tag({ refund: 48.5 })], "TRY");
    assert.deepEqual(summary.expected, [
      { currency: "TRY", amount: 148.5, tagCount: 2, isEstimate: false },
    ]);
    assert.equal(summary.expectedTagCount, 2);
    assert.equal(summary.notCalculatedCount, 0);
  });
  it("keeps currencies apart and headlines the largest group", () => {
    const summary = buildRefundSummary(
      [
        tag({ currency: "TRY", refund: 100 }),
        tag({ currency: "EUR", refund: 900 }),
        tag({ currency: "TRY", refund: 50 }),
      ],
      "TRY"
    );
    assert.deepEqual(summary.expected.map((g) => g.currency), ["EUR", "TRY"]);
    assert.deepEqual(summary.expected[0], {
      currency: "EUR",
      amount: 900,
      tagCount: 1,
      isEstimate: false,
    });
  });
  it("breaks equal totals by currency code ascending", () => {
    const summary = buildRefundSummary(
      [tag({ currency: "USD", refund: 100 }), tag({ currency: "EUR", refund: 100 })],
      "TRY"
    );
    assert.deepEqual(summary.expected.map((g) => g.currency), ["EUR", "USD"]);
  });
  it("marks a group estimated when any of its tags fell back to gross refund", () => {
    const summary = buildRefundSummary(
      [
        tag({ currency: "TRY", refund: 100 }),
        tag({ currency: "TRY", refund: null, grossRefund: 120 }),
        tag({ currency: "EUR", refund: 50 }),
      ],
      "TRY"
    );
    const groups = Object.fromEntries(summary.expected.map((g) => [g.currency, g]));
    assert.equal(groups.TRY?.isEstimate, true);
    assert.equal(groups.TRY?.amount, 220);
    assert.equal(groups.EUR?.isEstimate, false);
  });
  it("counts tags with no figure instead of guessing one", () => {
    const summary = buildRefundSummary(
      [tag({ refund: 100 }), tag({ refund: null, grossRefund: null })],
      "TRY"
    );
    assert.equal(summary.expected[0]?.amount, 100);
    assert.equal(summary.expected[0]?.tagCount, 1);
    assert.equal(summary.expectedTagCount, 2);
    assert.equal(summary.notCalculatedCount, 1);
  });
  it("separates money already received from money still expected", () => {
    const summary = buildRefundSummary(
      [tag({ status: "Issued", refund: 100 }), tag({ status: "Refunded", refund: 412 })],
      "TRY"
    );
    assert.equal(summary.expected[0]?.amount, 100);
    assert.equal(summary.received[0]?.amount, 412);
    assert.equal(summary.expectedTagCount, 1);
  });
  it("excludes lost and inactive tags from both sides", () => {
    const summary = buildRefundSummary(
      [
        tag({ status: "Expired", refund: 500 }),
        tag({ status: "Cancelled", refund: 500 }),
        tag({ status: "Draft", refund: 500 }),
      ],
      "TRY"
    );
    assert.deepEqual(summary, {
      expected: [],
      received: [],
      expectedTagCount: 0,
      notCalculatedCount: 0,
    });
  });
  it("falls back to the given currency when a tag names none", () => {
    const summary = buildRefundSummary([tag({ currency: null, refund: 100 })], "TRY");
    assert.equal(summary.expected[0]?.currency, "TRY");
  });
  it("returns empty groups for an empty list", () => {
    assert.deepEqual(buildRefundSummary([], "TRY"), {
      expected: [],
      received: [],
      expectedTagCount: 0,
      notCalculatedCount: 0,
    });
  });
});
```

`S/utils/tag/tag-row-tone.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { UniRefund_TagService_Tags_TagStatusType as TagStatus } from "@repo/saas/TagService";
import { tagRowTone } from "./tag-row-tone";

describe("tagRowTone", () => {
  it("paints success with the saturated bar and the strong text", () => {
    assert.deepEqual(tagRowTone("Refunded"), {
      bar: "bg-success",
      wash: "bg-success/10",
      text: "text-success-strong",
    });
  });
  it("paints warning and info the same way", () => {
    assert.equal(tagRowTone("WaitingStampValidation").text, "text-warning-strong");
    assert.equal(tagRowTone("Issued").bar, "bg-info");
  });
  it("keeps error text at the base token", () => {
    assert.deepEqual(tagRowTone("Declined"), {
      bar: "bg-error",
      wash: "bg-error/10",
      text: "text-error",
    });
  });
  it("draws a neutral status in the muted grey, never invisible", () => {
    assert.deepEqual(tagRowTone("Draft"), {
      bar: "bg-muted-foreground",
      wash: "bg-muted-foreground/10",
      text: "text-muted-foreground",
    });
    assert.equal(tagRowTone("Nope" as TagStatus).bar, "bg-muted-foreground");
  });
});
```

`S/utils/tag/tag-row-design.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_TAG_ROW_DESIGN,
  parseTagRowDesign,
  TAG_ROW_DESIGN_COOKIE,
} from "./tag-row-design";

describe("parseTagRowDesign", () => {
  it("accepts the three designs", () => {
    assert.equal(parseTagRowDesign("classic"), "classic");
    assert.equal(parseTagRowDesign("pill"), "pill");
    assert.equal(parseTagRowDesign("tinted"), "tinted");
  });
  it("falls back to classic for anything else", () => {
    for (const value of [undefined, null, "", "Classic", "pill ", "wash"])
      assert.equal(parseTagRowDesign(value), "classic");
  });
  it("names the cookie and the default", () => {
    assert.equal(TAG_ROW_DESIGN_COOKIE, "tag-row-design");
    assert.equal(DEFAULT_TAG_ROW_DESIGN, "classic");
  });
});
```

`S/utils/tag/traveller-filters.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countTravellerFilters } from "./traveller-filters";

describe("countTravellerFilters", () => {
  it("counts nothing with no range", () => {
    assert.equal(countTravellerFilters({}), 0);
  });
  it("counts the issue-date range once", () => {
    assert.equal(
      countTravellerFilters({ issuedStartDate: "2026-09-01", issuedEndDate: "2026-09-30" }),
      1
    );
  });
  it("ignores half a range, which the endpoint rejects", () => {
    assert.equal(countTravellerFilters({ issuedStartDate: "2026-09-01" }), 0);
  });
});
```

`S/utils/tag/tag-search.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterTagsBySearch, tagListState } from "./tag-search";

const tags = [
  { tagNumber: "TR-1001", merchantTitle: "Apple Store" },
  { tagNumber: "TR-2002", merchantTitle: "Bazaar" },
  { tagNumber: "TR-3003", merchantTitle: null },
];

describe("filterTagsBySearch", () => {
  it("returns the page unchanged for a blank search", () => {
    assert.equal(filterTagsBySearch(tags, "   "), tags);
  });
  it("matches the tag number case-insensitively", () => {
    assert.deepEqual(filterTagsBySearch(tags, "tr-20").map((t) => t.tagNumber), ["TR-2002"]);
  });
  it("matches the store and trims the search", () => {
    assert.deepEqual(filterTagsBySearch(tags, "  apple ").map((t) => t.tagNumber), ["TR-1001"]);
  });
  it("survives a missing store", () => {
    assert.deepEqual(filterTagsBySearch(tags, "3003").map((t) => t.tagNumber), ["TR-3003"]);
  });
});

describe("tagListState", () => {
  it("lists whatever is shown", () => {
    assert.equal(tagListState({ shownCount: 3, totalCount: 40, narrowed: false }), "list");
  });
  it("is empty only when the traveller truly has no tags", () => {
    assert.equal(tagListState({ shownCount: 0, totalCount: 0, narrowed: false }), "empty");
  });
  it("is no-match when a filter finds nothing", () => {
    assert.equal(tagListState({ shownCount: 0, totalCount: 0, narrowed: true }), "noMatch");
  });
  it("is no-match for a search on this page only", () => {
    assert.equal(tagListState({ shownCount: 0, totalCount: 40, narrowed: true }), "noMatch");
  });
  it("is no-match for a page past the end, never empty", () => {
    assert.equal(tagListState({ shownCount: 0, totalCount: 40, narrowed: false }), "noMatch");
  });
});
```

`S/utils/tag/tag-kind.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { claimSalesAmount, deriveTagKind, previewActionFor } from "./tag-kind";

const owned = { travellerDocumentNumber: "P123" };

describe("deriveTagKind", () => {
  it("draft: status Draft and no traveller", () => {
    assert.equal(deriveTagKind({ status: "Draft" }), "draft");
  });
  it("issued: owned and not Draft", () => {
    assert.equal(deriveTagKind({ status: "Issued", traveller: owned }), "issued");
    assert.equal(deriveTagKind({ status: "Refunded", traveller: owned }), "issued");
  });
  it("divergent: Draft but owned, or unowned but not Draft", () => {
    assert.equal(deriveTagKind({ status: "Draft", traveller: owned }), "divergent");
    assert.equal(deriveTagKind({ status: "Issued" }), "divergent");
  });
  it("treats an empty document number as unowned", () => {
    assert.equal(
      deriveTagKind({ status: "Draft", traveller: { travellerDocumentNumber: "" } }),
      "draft"
    );
  });
});

describe("previewActionFor", () => {
  it("offers a draft's claim only with the grant", () => {
    assert.equal(previewActionFor("draft", { signedIn: true, canClaim: true }), "claim");
    assert.equal(previewActionFor("draft", { signedIn: true, canClaim: false }), null);
  });
  it("invites a signed-out visitor to log in to claim", () => {
    assert.equal(previewActionFor("draft", { signedIn: false, canClaim: false }), "loginToClaim");
  });
  it("opens an issued tag in the list, or asks a visitor to log in", () => {
    assert.equal(previewActionFor("issued", { signedIn: true, canClaim: false }), "viewInMyTags");
    assert.equal(previewActionFor("issued", { signedIn: false, canClaim: true }), "loginToView");
  });
  it("offers nothing on a divergent tag", () => {
    assert.equal(previewActionFor("divergent", { signedIn: true, canClaim: true }), null);
    assert.equal(previewActionFor("divergent", { signedIn: false, canClaim: false }), null);
  });
});

describe("claimSalesAmount", () => {
  it("reads the SalesAmount total", () => {
    assert.equal(claimSalesAmount([{ totalType: "VatAmount", amount: 5 }, { totalType: "SalesAmount", amount: 250 }]), 250);
  });
  it("falls back to zero", () => {
    assert.equal(claimSalesAmount(undefined), 0);
    assert.equal(claimSalesAmount([]), 0);
  });
});
```

Add these to `(main)/tags/tag-list-params.test.ts`:

```ts
describe("view", () => {
  it("defaults to tags and accepts verifications", () => {
    assert.equal(parseTagListParams({}).view, "tags");
    assert.equal(parseTagListParams({ view: "verifications" }).view, "verifications");
    assert.equal(parseTagListParams({ view: "VERIFICATIONS" }).view, "tags");
  });
});

describe("resolveTagsView", () => {
  it("keeps verifications only with the grant", () => {
    assert.equal(resolveTagsView("verifications", true), "verifications");
    assert.equal(resolveTagsView("verifications", false), "tags");
    assert.equal(resolveTagsView("tags", true), "tags");
  });
});
```

Import `resolveTagsView` beside `parseTagListParams` at the top. Every existing `deepEqual` on a parsed result gains `view: "tags"`.

Add these to `S/components/tags/tag-grants.test.ts`:
- Extend `ALL` with `"TagService.StickerManualVerifications": true`, `"TagService.StickerManualVerifications.Upload": true` and `"TagService.StickerManualVerifications.ViewMine": true`.
- Update the two `deepEqual`s to the four-key object (`claim`, `viewRisk`, `uploadVerification`, `viewMyVerifications`), all `true` or all `false`.
- Add:

```ts
it("needs the verification group as well as each leaf", () => {
  const noGroup = { ...ALL, "TagService.StickerManualVerifications": false };
  assert.equal(tagGrants(noGroup).uploadVerification, false);
  assert.equal(tagGrants(noGroup).viewMyVerifications, false);
  assert.equal(
    tagGrants({ ...ALL, "TagService.StickerManualVerifications.Upload": false }).uploadVerification,
    false
  );
  assert.equal(
    tagGrants({ ...ALL, "TagService.StickerManualVerifications.ViewMine": false }).viewMyVerifications,
    false
  );
});
```

In `S/components/payout-cards/card-grants.test.ts`:
- Add `"RefundService.TravellerCards.ViewMine": true` to its `ALL`.
- Add `view: true` / `view: false` to the two full-object `deepEqual`s.
- Add:

```ts
it("views the cards only with the group and ViewMine", () => {
  assert.equal(cardGrants({ "RefundService.TravellerCards.ViewMine": true }).view, false);
  assert.equal(
    cardGrants({ "RefundService.TravellerCards": true, "RefundService.TravellerCards.ViewMine": true }).view,
    true
  );
});
```

Add these to `S/components/tag-detail/format.test.ts`, importing `formatListDate` and `formatPlainAmount` alongside the existing import:

```ts
describe("formatListDate", () => {
  it("prints the app's short list date", () => {
    assert.equal(formatListDate("2026-10-02T09:00:00Z", "en", "UTC"), "02 Oct 26");
  });
  it("keeps a 23:00Z stamp on its UTC day before mount", () => {
    assert.equal(formatListDate("2026-10-01T23:00:00Z", "en", "UTC"), "01 Oct 26");
  });
  it("prints nothing for a missing or broken date", () => {
    assert.equal(formatListDate(undefined, "en", "UTC"), "");
    assert.equal(formatListDate("not-a-date", "en", "UTC"), "");
  });
});

describe("formatPlainAmount", () => {
  it("prints two decimals with grouping", () => {
    assert.equal(formatPlainAmount(1234.5, "en"), "1,234.50");
  });
  it("prints an em dash for a missing amount", () => {
    assert.equal(formatPlainAmount(null, "en"), "—");
    assert.equal(formatPlainAmount(undefined, "en"), "—");
  });
});
```

- [ ] **Step 2: Run the tests to see them fail.** Run `pnpm --filter ssr test:unit`. The new suites fail because their modules or exports don't exist yet.

- [ ] **Step 3: Implement.**

`S/utils/tag/tag-money.ts`:

```ts
import type { UniRefund_TagService_Tags_TagStatusType as TagStatus } from "@repo/saas/TagService";

export type MoneyBucket = "expected" | "received" | "lost" | "inactive";

// A Record, so a status the API adds fails type-check instead of defaulting.
const BUCKET_BY_STATUS: Record<TagStatus, MoneyBucket> = {
  PreIssued: "expected",
  Issued: "expected",
  WaitingGoodsValidation: "expected",
  WaitingStampValidation: "expected",
  ExportValidated: "expected",
  PaymentInProgress: "expected",
  PaymentProblem: "expected",
  PaymentBlocked: "expected",
  Refunded: "received",
  EarlyRefunded: "received",
  Declined: "lost",
  Cancelled: "lost",
  Expired: "lost",
  OptedOut: "lost",
  None: "inactive",
  Open: "inactive",
  Draft: "inactive",
};

export function tagMoneyBucket(status: TagStatus): MoneyBucket {
  return BUCKET_BY_STATUS[status] ?? "inactive";
}

export interface MoneyFields {
  refund?: number | null;
  grossRefund?: number | null;
}

// Never the sales amount: a purchase is roughly five times its refund.
export function tagExpectedAmount(tag: MoneyFields): number | null {
  return tag.refund ?? tag.grossRefund ?? null;
}

export function tagExpectedAmountIsEstimate(tag: MoneyFields): boolean {
  return tag.refund == null && tag.grossRefund != null;
}
```

`S/utils/tag/home-summary.ts`:

```ts
import type { UniRefund_TagService_Tags_TagStatusType as TagStatus } from "@repo/saas/TagService";
import {
  tagExpectedAmount,
  tagExpectedAmountIsEstimate,
  tagMoneyBucket,
} from "./tag-money";

export interface SummaryTag {
  status: TagStatus;
  currency?: string | null;
  refund?: number | null;
  grossRefund?: number | null;
}

export interface CurrencyTotal {
  currency: string;
  amount: number;
  tagCount: number;
  isEstimate: boolean;
}

export interface RefundSummary {
  expected: CurrencyTotal[];
  received: CurrencyTotal[];
  expectedTagCount: number;
  notCalculatedCount: number;
}

function toSortedTotals(groups: Map<string, CurrencyTotal>): CurrencyTotal[] {
  return [...groups.values()].sort(
    (a, b) => b.amount - a.amount || a.currency.localeCompare(b.currency)
  );
}

export function buildRefundSummary(
  tags: SummaryTag[],
  fallbackCurrency: string
): RefundSummary {
  const groups = {
    expected: new Map<string, CurrencyTotal>(),
    received: new Map<string, CurrencyTotal>(),
  };
  let expectedTagCount = 0;
  let notCalculatedCount = 0;

  for (const tag of tags) {
    const bucket = tagMoneyBucket(tag.status);
    if (bucket !== "expected" && bucket !== "received") continue;
    if (bucket === "expected") expectedTagCount += 1;

    const amount = tagExpectedAmount(tag);
    if (amount === null) {
      if (bucket === "expected") notCalculatedCount += 1;
      continue;
    }

    const currency = tag.currency ?? fallbackCurrency;
    const group = groups[bucket].get(currency) ?? {
      currency,
      amount: 0,
      tagCount: 0,
      isEstimate: false,
    };
    group.amount += amount;
    group.tagCount += 1;
    group.isEstimate = group.isEstimate || tagExpectedAmountIsEstimate(tag);
    groups[bucket].set(currency, group);
  }

  return {
    expected: toSortedTotals(groups.expected),
    received: toSortedTotals(groups.received),
    expectedTagCount,
    notCalculatedCount,
  };
}
```

`S/utils/tag/tag-row-tone.ts`:

```ts
import type { UniRefund_TagService_Tags_TagStatusType as TagStatus } from "@repo/saas/TagService";
import { tagStatusTone, type TagStatusTone } from "./tag-status";

export interface TagRowTone {
  bar: string;
  wash: string;
  // 11 px text, so success, info and warning drop to their strong step for AA.
  text: string;
}

const BY_TONE: Record<TagStatusTone, TagRowTone> = {
  success: { bar: "bg-success", wash: "bg-success/10", text: "text-success-strong" },
  info: { bar: "bg-info", wash: "bg-info/10", text: "text-info-strong" },
  warning: { bar: "bg-warning", wash: "bg-warning/10", text: "text-warning-strong" },
  error: { bar: "bg-error", wash: "bg-error/10", text: "text-error" },
  neutral: {
    bar: "bg-muted-foreground",
    wash: "bg-muted-foreground/10",
    text: "text-muted-foreground",
  },
};

export function tagRowTone(status: TagStatus): TagRowTone {
  return BY_TONE[tagStatusTone(status)];
}
```

`S/utils/tag/tag-row-design.ts`:

```ts
export type TagRowDesign = "classic" | "pill" | "tinted";

export const TAG_ROW_DESIGNS: readonly TagRowDesign[] = ["classic", "pill", "tinted"];
export const DEFAULT_TAG_ROW_DESIGN: TagRowDesign = "classic";
export const TAG_ROW_DESIGN_COOKIE = "tag-row-design";

export function parseTagRowDesign(value: string | null | undefined): TagRowDesign {
  return TAG_ROW_DESIGNS.includes(value as TagRowDesign)
    ? (value as TagRowDesign)
    : DEFAULT_TAG_ROW_DESIGN;
}
```

`S/utils/tag/traveller-filters.ts`:

```ts
// The traveller endpoint takes only the issue-date range, so only it lights the badge.
export function countTravellerFilters(p: {
  issuedStartDate?: string;
  issuedEndDate?: string;
}): number {
  return p.issuedStartDate && p.issuedEndDate ? 1 : 0;
}
```

`S/utils/tag/tag-search.ts`:

```ts
// The traveller endpoint has no text search, so this narrows the loaded page only.
export function filterTagsBySearch<
  T extends { tagNumber?: string | null; merchantTitle?: string | null },
>(tags: T[], text: string): T[] {
  const term = text.trim().toLocaleLowerCase();
  if (!term) return tags;
  return tags.filter((tag) =>
    [tag.tagNumber, tag.merchantTitle].some((field) =>
      field?.toLocaleLowerCase().includes(term)
    )
  );
}

export type TagListState = "list" | "empty" | "noMatch";

export function tagListState({
  shownCount,
  totalCount,
  narrowed,
}: {
  shownCount: number;
  totalCount: number;
  narrowed: boolean;
}): TagListState {
  if (shownCount > 0) return "list";
  if (totalCount === 0 && !narrowed) return "empty";
  return "noMatch";
}
```

`S/utils/tag/tag-kind.ts`:

```ts
import type { UniRefund_TagService_Tags_TagStatusType as TagStatus } from "@repo/saas/TagService";

export type TagKind = "draft" | "issued" | "divergent";

export function deriveTagKind(tag: {
  status: TagStatus;
  traveller?: { travellerDocumentNumber?: string | null } | null;
}): TagKind {
  const hasTraveller = !!tag.traveller?.travellerDocumentNumber;
  const isDraft = tag.status === "Draft";
  if (isDraft && !hasTraveller) return "draft";
  if (!isDraft && hasTraveller) return "issued";
  return "divergent";
}

export type PreviewAction = "claim" | "loginToClaim" | "viewInMyTags" | "loginToView";

export function previewActionFor(
  kind: TagKind,
  { signedIn, canClaim }: { signedIn: boolean; canClaim: boolean }
): PreviewAction | null {
  if (kind === "divergent") return null;
  if (kind === "draft") {
    if (!signedIn) return "loginToClaim";
    return canClaim ? "claim" : null;
  }
  return signedIn ? "viewInMyTags" : "loginToView";
}

export function claimSalesAmount(
  totals: { totalType?: string | null; amount?: number | null }[] | null | undefined
): number {
  return totals?.find((total) => total.totalType === "SalesAmount")?.amount ?? 0;
}
```

`(main)/tags/tag-list-params.ts`:
- Add `export type TagsView = "tags" | "verifications";`.
- Add `view: TagsView;` to `TagListParams`.
- In `parseTagListParams`, add `view: first(raw.view) === "verifications" ? "verifications" : "tags",` to the `params` literal.
- Append:

```ts
export function resolveTagsView(view: TagsView, canViewVerifications: boolean): TagsView {
  return view === "verifications" && canViewVerifications ? "verifications" : "tags";
}
```

`S/components/tags/tag-grants.ts`: add these to the returned object:

```ts
uploadVerification: has(
  granted,
  "TagService.StickerManualVerifications",
  "TagService.StickerManualVerifications.Upload"
),
viewMyVerifications: has(
  granted,
  "TagService.StickerManualVerifications",
  "TagService.StickerManualVerifications.ViewMine"
),
```

`S/components/payout-cards/card-grants.ts`: add this to the returned object:

```ts
view: has(granted, "RefundService.TravellerCards", "RefundService.TravellerCards.ViewMine"),
```

`S/components/tag-detail/format.ts`: append:

```ts
export function formatListDate(
  iso: string | null | undefined,
  lang: string,
  timeZone?: string
): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(lang, {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

export function formatPlainAmount(
  amount: number | null | undefined,
  lang: string
): string {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat(lang, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
```

- [ ] **Step 4: Run the gates.**
  - `pnpm --filter ssr test:unit`: everything passes.
  - `pnpm --filter ssr type-check`: `tagGrants`'s and `cardGrants`'s callers still compile, since the new keys are additive.
  - `pnpm --filter ssr lint`: 0 errors.

- [ ] **Step 5: Commit.** Stage the 14 new files and the 8 modified ones by name, then commit:

```bash
git commit -q -F - <<'EOF'
feat(ssr): port the app's tag money, summary, row and preview logic

Pure modules for the Home refund summary (expected and received buckets),
the row tones and the row-design cookie, the filter count, the page search
and list state, and the scan preview's kind and action. The tag list gains
a view param, and the grants gain the verification pair and the cards
view.

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

### Task 2: Icons, strings and the tag surfaces (web-app)

**Files:**
- Modify: `apps/ssr/scripts/gen-ionicons.mjs`; regenerate `S/components/shell/ionicons.tsx`; `SSRService` en/tr.
- Create in `S/components/tags/`: `status-classes.ts`, `tag-card.tsx`, `tag-row.tsx`, `tag-list-item.tsx`, `tag-skeletons.tsx` and `tag-states.tsx`.

**Interfaces:**
- Consumes (Task 1):
  - `tagRowTone`, `formatListDate`, `formatPlainAmount`, `TagRowDesign`;
  - the existing `tagStatusTone`, `tagHeadlineAmount`, `tagHeadlineAmountKind`, `HeadlineAmountPreference`, `tagDeadline` and `deadlineCountdown`.
- Produces:
  - `TagCard({ tag, href, variant?: "hero" | "row", amountPrefer?: HeadlineAmountPreference, showRisk?: boolean })`
  - `TagRow({ tag, href, tint: "pill" | "wash" })`
  - `TagListItem({ design: TagRowDesign, tag, href, showRisk })`
  - `TagCardSkeleton({ variant? })`, `TagRowSkeleton({ tint })`, `TagListSkeleton({ design, count? })`, all server-safe.
  - `EmptyState({ icon, title, description?, action?: ReactNode, tone?: "default" | "error", framed?: boolean })`
  - `TagsEmptyState()`, `TagsNoMatchState({ onClear })`, `TagsErrorState()`, which retries with `router.refresh()`.
  - The icons `IoCheckmark`, `IoCheckmarkCircle`, `IoCheckmarkCircleOutline`, `IoCameraOutline`, `IoLocationOutline`, `IoCloudOfflineOutline`, `IoSearch`, `IoSearchOutline`, `IoCloseCircle`, `IoArrowDown`, `IoArrowUp`, `IoOptionsOutline`, `IoAddCircleOutline`, `IoPricetagOutline`, `IoPlaySkipBack`, `IoPlaySkipForward`, `IoChevronBack`, `IoChevronUp`, `IoReceiptOutline`, `IoStorefrontOutline`, `IoAlertCircleOutline` and `IoWarningOutline`.
- `type TagListItemDto = UniRefund_TagService_Tags_TagListItemForTravellerCrossTenantsDto`. It is imported as a type alias in each file.

- [ ] **Step 1: Icons.**
  - Append these names to `NAMES` in `apps/ssr/scripts/gen-ionicons.mjs`: `"checkmark"`, `"checkmark-circle"`, `"checkmark-circle-outline"`, `"camera-outline"`, `"location-outline"`, `"cloud-offline-outline"`, `"search"`, `"search-outline"`, `"close-circle"`, `"arrow-down"`, `"arrow-up"`, `"options-outline"`, `"add-circle-outline"`, `"pricetag-outline"`, `"play-skip-back"`, `"play-skip-forward"`, `"chevron-back"`, `"chevron-up"`, `"receipt-outline"`, `"storefront-outline"`, `"alert-circle-outline"`, `"warning-outline"`.
  - Run `node apps/ssr/scripts/gen-ionicons.mjs`. It fetches from unpkg.
  - Check: `grep -c "^export function Io" apps/ssr/src/components/shell/ionicons.tsx` prints `44`.

- [ ] **Step 2: Strings.**
  - Add every key in the plan's **Strings** table to en.json and tr.json, and apply the new values to the existing keys.
  - Run `pnpm --filter ssr run init`.
  - Check: `node -e "const e=require('./apps/ssr/src/language-data/unirefund/SSRService/resources/en.json'),t=require('./apps/ssr/src/language-data/unirefund/SSRService/resources/tr.json');const m=Object.keys(e).filter(k=>!(k in t));console.log(m.length?m:'ok')"` prints `ok`.

- [ ] **Step 3: `status-classes.ts`:**

```ts
import type { TagStatusTone } from "@/src/utils/tag/tag-status";
import type { UniRefund_TagService_Tags_TagRiskLevel as RiskLevel } from "@repo/saas/TagService";

export const TAG_STATUS_RAIL: Record<TagStatusTone, string> = {
  success: "bg-success",
  info: "bg-info",
  warning: "bg-warning",
  error: "bg-error",
  neutral: "bg-muted-foreground",
};

export const TAG_STATUS_BADGE: Record<TagStatusTone, string> = {
  success: "bg-success/15 text-success",
  info: "bg-info/15 text-info",
  warning: "bg-warning/15 text-warning",
  error: "bg-error/15 text-error",
  neutral: "bg-muted-foreground/15 text-muted-foreground",
};

export const RISK_DOT: Record<RiskLevel, string> = {
  Green: "bg-success",
  Red: "bg-error",
  Unknown: "bg-muted-foreground",
  EvaluationFailed: "bg-warning",
};
```

- [ ] **Step 4: `tag-card.tsx`.** This is the app's `TagCard`: an inset rail, three bands, and a chevron.

```tsx
"use client";
import { IoChevronForward } from "@/src/components/shell/ionicons";
import { formatListDate, formatPlainAmount } from "@/src/components/tag-detail/format";
import { useIsClient } from "@/src/hooks/use-is-client";
import { useTranslations } from "@/src/providers/i18n";
import { deadlineCountdown, tagDeadline } from "@/src/utils/tag/tag-deadline";
import {
  tagHeadlineAmount,
  tagHeadlineAmountKind,
  tagStatusTone,
  type HeadlineAmountPreference,
} from "@/src/utils/tag/tag-status";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import type { UniRefund_TagService_Tags_TagListItemForTravellerCrossTenantsDto as TagListItemDto } from "@repo/saas/TagService";
import Link from "next/link";
import { useParams } from "next/navigation";
import { RISK_DOT, TAG_STATUS_BADGE, TAG_STATUS_RAIL } from "./status-classes";

const VARIANT = {
  hero: { body: "gap-3 px-5 py-4", amount: "text-[30px]", currency: "text-base", chevron: 20 },
  row: { body: "gap-2 px-4 py-3", amount: "text-[22px]", currency: "text-sm", chevron: 18 },
} as const;

export function TagCard({
  tag,
  href,
  variant = "row",
  amountPrefer = "purchase",
  showRisk = false,
}: {
  tag: TagListItemDto;
  href: string;
  variant?: keyof typeof VARIANT;
  amountPrefer?: HeadlineAmountPreference;
  showRisk?: boolean;
}) {
  const { t } = useTranslations();
  const { lang } = useParams<{ lang: string }>();
  const isClient = useIsClient();
  const style = VARIANT[variant];
  const tone = tagStatusTone(tag.status);
  const kind = tagHeadlineAmountKind(tag, amountPrefer);
  const meta = [tag.merchantTitle, formatListDate(tag.issueDate, lang, isClient ? undefined : "UTC")]
    .filter(Boolean)
    .join(" · ");
  const riskLevel = tag.risk?.riskLevel;
  const deadline = tagDeadline({
    status: tag.status,
    exportValidationExpirationDate: tag.exportValidationExpirationDate,
    refundExpirationDate: tag.refundExpirationDate,
    exportValidationDate: tag.exportValidationDate,
  });
  const urgent = deadline && deadline.tone !== "info" ? deadline : null;
  const countdown = urgent ? deadlineCountdown(urgent) : null;

  return (
    <Link
      className="flex items-stretch overflow-hidden rounded-md border border-border bg-card transition-opacity active:opacity-70"
      data-testid={`tag-card-${tag.tagNumber}`}
      href={href}
    >
      <span aria-hidden="true" className={cn("my-2 ml-2 w-2 shrink-0 rounded-full", TAG_STATUS_RAIL[tone])} />
      <span className={cn("flex min-w-0 flex-1 flex-col", style.body)}>
        <span className="flex items-center gap-3">
          <span className="min-w-0 flex-1 truncate font-serial text-[15px] font-semibold tracking-wide text-foreground">
            {tag.tagNumber}
          </span>
          <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", TAG_STATUS_BADGE[tone])}>
            {t.SSRService[`Tags.Status.${tag.status}`] ?? tag.status}
          </span>
          {tag.isEarlyRefunded ? (
            <span className="rounded-full bg-foreground/10 px-2 py-1 text-[11px] font-semibold text-muted-foreground">
              {t.SSRService["Tags.EarlyRefund"]}
            </span>
          ) : null}
        </span>
        <span className="flex flex-col">
          <span className="flex items-baseline gap-1.5">
            <span className={cn("font-bold leading-none text-foreground", style.amount)}>
              {formatPlainAmount(tagHeadlineAmount(tag, amountPrefer), lang)}
            </span>
            <span className={cn("font-semibold text-muted-foreground", style.currency)}>
              {tag.currency}
            </span>
          </span>
          {variant === "hero" && kind ? (
            <span className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t.SSRService[kind === "refund" ? "Tags.Caption.Refund" : "Tags.Caption.Purchase"]}
            </span>
          ) : null}
        </span>
        <span aria-hidden="true" className="h-px bg-border" />
        <span className="flex items-center gap-2">
          {showRisk && riskLevel ? (
            <span className={cn("size-2 shrink-0 rounded-full", RISK_DOT[riskLevel])} data-testid="tag-risk-dot" />
          ) : null}
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{meta}</span>
          {urgent && countdown ? (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                urgent.tone === "error" ? "bg-error/15 text-error" : "bg-warning/15 text-warning"
              )}
              data-testid={`tag-deadline-${tag.tagNumber}`}
            >
              {countdown.kind === "overdue"
                ? t.SSRService["Tags.Overdue"]
                : countdown.kind === "lastDay"
                  ? t.SSRService["Tags.LastDay"]
                  : t.SSRService["Tags.DaysLeft"].replace("{0}", String(countdown.days))}
            </span>
          ) : null}
          <IoChevronForward className="shrink-0 text-muted-foreground" size={style.chevron} />
        </span>
      </span>
    </Link>
  );
}
```

- [ ] **Step 5: `tag-row.tsx`.** This is the app's flat `TagRow`. The pill draws a bar; the wash tints the whole row.

```tsx
"use client";
import { formatListDate, formatPlainAmount } from "@/src/components/tag-detail/format";
import { useIsClient } from "@/src/hooks/use-is-client";
import { useTranslations } from "@/src/providers/i18n";
import { tagRowTone } from "@/src/utils/tag/tag-row-tone";
import { tagHeadlineAmount, tagHeadlineAmountKind } from "@/src/utils/tag/tag-status";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import type { UniRefund_TagService_Tags_TagListItemForTravellerCrossTenantsDto as TagListItemDto } from "@repo/saas/TagService";
import Link from "next/link";
import { useParams } from "next/navigation";

export function TagRow({
  tag,
  href,
  tint,
}: {
  tag: TagListItemDto;
  href: string;
  tint: "pill" | "wash";
}) {
  const { t } = useTranslations();
  const { lang } = useParams<{ lang: string }>();
  const isClient = useIsClient();
  const tone = tagRowTone(tag.status);
  const kind = tagHeadlineAmountKind(tag, "purchase");
  const washed = tint === "wash";
  const date = formatListDate(tag.issueDate, lang, isClient ? undefined : "UTC");

  return (
    <Link
      className={cn("flex items-stretch border-t border-input", washed ? tone.wash : "bg-card")}
      data-testid={`tag-row-${tag.tagNumber}`}
      href={href}
    >
      {washed ? null : (
        <span aria-hidden="true" className={cn("my-3 w-1.5 shrink-0 rounded-r-full", tone.bar)} data-testid="tag-row-bar" />
      )}
      <span className="flex min-w-0 flex-1 items-stretch gap-3 px-4 py-3">
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate font-serial text-[13px] font-semibold tracking-wide text-foreground">
            {tag.tagNumber}
          </span>
          <span className="truncate text-[15px] font-semibold text-foreground">
            {tag.merchantTitle || "—"}
          </span>
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={cn("truncate text-[11px] font-semibold", tone.text)}>
              {t.SSRService[`Tags.Status.${tag.status}`] ?? tag.status}
            </span>
            {date ? <span className="truncate text-[11px] text-muted-foreground">{`· ${date}`}</span> : null}
          </span>
        </span>
        <span className="flex w-36 shrink-0 flex-col items-end gap-1">
          {kind ? (
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
              {t.SSRService[kind === "refund" ? "Tags.Caption.Refund" : "Tags.Caption.Purchase"]}
            </span>
          ) : null}
          <span className="flex w-full items-baseline justify-end gap-1" data-testid="tag-row-amount">
            <span className="min-w-0 shrink truncate font-serial text-[17px] font-bold leading-tight text-foreground">
              {formatPlainAmount(tagHeadlineAmount(tag, "purchase"), lang)}
            </span>
            <span className="shrink-0 text-[10px] font-semibold text-muted-foreground">{tag.currency}</span>
          </span>
        </span>
      </span>
    </Link>
  );
}
```

- [ ] **Step 6: `tag-list-item.tsx`:**

```tsx
"use client";
import type { TagRowDesign } from "@/src/utils/tag/tag-row-design";
import type { UniRefund_TagService_Tags_TagListItemForTravellerCrossTenantsDto as TagListItemDto } from "@repo/saas/TagService";
import { TagCard } from "./tag-card";
import { TagRow } from "./tag-row";

export function TagListItem({
  design,
  tag,
  href,
  showRisk,
}: {
  design: TagRowDesign;
  tag: TagListItemDto;
  href: string;
  showRisk: boolean;
}) {
  if (design === "classic") return <TagCard href={href} showRisk={showRisk} tag={tag} variant="row" />;
  return <TagRow href={href} tag={tag} tint={design === "pill" ? "pill" : "wash"} />;
}
```

- [ ] **Step 7: `tag-skeletons.tsx`.** There is no `"use client"`, so `loading.tsx` and `Suspense` fallbacks can render it.

```tsx
import { Skeleton } from "@repo/ayasofyazilim-ui/components/skeleton";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import type { TagRowDesign } from "@/src/utils/tag/tag-row-design";

export function TagCardSkeleton({ variant = "row" }: { variant?: "hero" | "row" }) {
  const hero = variant === "hero";
  return (
    <div className="flex items-stretch overflow-hidden rounded-md border border-border bg-card" data-testid="tag-card-skeleton">
      <Skeleton className="w-1.5 rounded-none" />
      <div className={cn("flex flex-1 flex-col", hero ? "gap-3 px-5 py-4" : "gap-2 px-4 py-3")}>
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <div>
          <Skeleton className={hero ? "h-8 w-40" : "h-6 w-32"} />
          {hero ? <Skeleton className="mt-1.5 h-2.5 w-16" /> : null}
        </div>
        <Skeleton className="h-px rounded-none" />
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-44" />
          <Skeleton className="size-5 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function TagRowSkeleton({ tint }: { tint: "pill" | "wash" }) {
  return (
    <div className="flex items-stretch border-t border-input bg-card" data-testid="tag-row-skeleton">
      {tint === "pill" ? <Skeleton className="my-3 w-1.5 rounded-l-none" /> : null}
      <div className="flex flex-1 items-stretch gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-2.5 w-36" />
        </div>
        <div className="flex w-28 shrink-0 flex-col items-end gap-1.5">
          <Skeleton className="h-2 w-14" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-2 w-8" />
        </div>
      </div>
    </div>
  );
}

export function TagListSkeleton({ design, count = 5 }: { design: TagRowDesign; count?: number }) {
  const rows = Array.from({ length: count }, (_, i) => i);
  if (design === "classic") {
    return (
      <div className="flex flex-col gap-3" data-testid="tags-skeleton">
        {rows.map((i) => (
          <TagCardSkeleton key={i} />
        ))}
      </div>
    );
  }
  return (
    <div className="-mx-4 border-b border-input" data-testid="tags-skeleton">
      {rows.map((i) => (
        <TagRowSkeleton key={i} tint={design === "pill" ? "pill" : "wash"} />
      ))}
    </div>
  );
}
```

- [ ] **Step 8: `tag-states.tsx`.** These are the app's `EmptyState` and its three tag states.

```tsx
"use client";
import {
  IoCloudOfflineOutline,
  IoPricetagOutline,
  IoSearchOutline,
} from "@/src/components/shell/ionicons";
import { useTranslations } from "@/src/providers/i18n";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

type Icon = (props: { size?: number; className?: string }) => ReactNode;

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = "default",
  framed = true,
  testId,
}: {
  icon: Icon;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: "default" | "error";
  framed?: boolean;
  testId?: string;
}) {
  const error = tone === "error";
  return (
    <div
      className={cn(
        "flex min-h-52 w-full flex-col items-center justify-center px-6",
        framed && !error && "rounded-md border-2 border-dashed border-border bg-foreground/5",
        framed && error && "rounded-md border-2 border-dashed border-error/40 bg-error-surface py-6",
        !framed && "py-6"
      )}
      data-testid={testId}
    >
      <div className="flex flex-col items-center gap-3">
        <span
          className={cn(
            "flex size-16 items-center justify-center rounded-full",
            error ? "bg-error-surface text-error" : framed ? "bg-foreground/10 text-muted-foreground" : "bg-foreground/5 text-muted-foreground"
          )}
        >
          <Icon size={32} />
        </span>
        <div className="flex flex-col items-center gap-1">
          <p className="text-lg font-semibold text-foreground">{title}</p>
          {description ? <p className="text-center text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
    </div>
  );
}

export function TagsEmptyState() {
  const { t } = useTranslations();
  return (
    <EmptyState
      description={t.SSRService["Tags.NoTagsDescription"]}
      icon={IoPricetagOutline}
      testId="tags-empty"
      title={t.SSRService["Tags.NoTags"]}
    />
  );
}

export function TagsNoMatchState({ onClear }: { onClear: () => void }) {
  const { t } = useTranslations();
  return (
    <EmptyState
      action={
        <Button className="mt-1 px-8" data-testid="tags-no-match-clear" onClick={onClear} size="lg">
          {t.SSRService["Tags.ClearFilters"]}
        </Button>
      }
      description={t.SSRService["Tags.NoMatchesDescription"]}
      framed={false}
      icon={IoSearchOutline}
      testId="tags-no-match"
      title={t.SSRService["Tags.NoMatches"]}
    />
  );
}

export function TagsErrorState() {
  const { t } = useTranslations();
  const router = useRouter();
  return (
    <EmptyState
      action={
        <Button className="mt-1 px-8" data-testid="tags-retry" onClick={() => router.refresh()} size="lg">
          {t.SSRService["Tags.Retry"]}
        </Button>
      }
      description={t.SSRService["Tags.LoadFailedDescription"]}
      icon={IoCloudOfflineOutline}
      testId="tags-error"
      title={t.SSRService["Tags.LoadFailed"]}
      tone="error"
    />
  );
}
```

- [ ] **Step 9: Run the gates.** Run `test:unit`, `type-check` and `lint` (0 errors). Nothing renders these surfaces yet; the type-check is the gate.

- [ ] **Step 10: Commit.** Stage the script, `ionicons.tsx`, en/tr and the six new files, then commit:

```bash
git commit -q -F - <<'EOF'
feat(ssr): add the app's tag card, flat rows, skeletons and empty states

The classic card (hero and row), the pill and tinted rows, their
skeletons, and the empty, no-match and error states, built on the shared
tokens. Adds the icons and every string sub-project 2 needs, and moves the
tag status words to the app's wording.

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

### Task 3: Home dashboard (web-app)

**Files:**
- Modify:
  - `S/components/shell/shell-context.tsx` and `tab-island.tsx`
  - `(public)/page.tsx` and `client.tsx`
  - `(main)/tags/_components/tags-view.tsx` (import only)
- Move (`git mv`): `(main)/tags/_components/upload-verification-dialog.tsx` → `S/components/verification/upload-verification-dialog.tsx`
- Create in `(public)/_components/`:
  - `home-dashboard-data.tsx` (server)
  - `home-dashboard.tsx`
  - `refund-summary-card.tsx`
  - `home-shortcut-tiles.tsx`
  - `home-start-card.tsx`
  - `home-skeleton.tsx` (server-safe)

**Interfaces:**
- Consumes:
  - from Task 1: `buildRefundSummary` and `RefundSummary`, `tagGrants().uploadVerification` and `cardGrants().view`;
  - from Task 2: `TagCard`, `TagCardSkeleton`, `TagsErrorState`, and the icons.
- Produces:
  - `useShell()` gains `openScan: () => void`. `ShellProvider`'s `value` prop stays the server-provided `ShellValue`.
  - `UploadVerificationDialog({ open, onOpenChange, onUploaded }: { open: boolean; onOpenChange: (open: boolean) => void; onUploaded?: () => void })`. The caller renders the trigger and checks the grant.

- [ ] **Step 1: The scan overlay moves into the provider.** Rewrite `shell-context.tsx`:

```tsx
"use client";
import type { UniRefund_TravellerService_Travellers_TravellerDocumentAffiliationDto as Affiliation } from "@repo/saas/TravellerService";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { ScanOverlay } from "./scan-overlay";

export type NotificationConfig = {
  appId: string;
  appUrl: string;
  socketUrl: string;
  subscriberId: string;
};
export type ShellValue = {
  signedIn: boolean;
  notification: NotificationConfig | null;
  documentAffiliations: Affiliation[];
};
type Shell = ShellValue & { openScan: () => void };

const ShellContext = createContext<Shell>({
  signedIn: false,
  notification: null,
  documentAffiliations: [],
  openScan: () => undefined,
});

export function ShellProvider({ value, children }: { value: ShellValue; children: React.ReactNode }) {
  const [scanOpen, setScanOpen] = useState(false);
  const openScan = useCallback(() => setScanOpen(true), []);
  const closeScan = useCallback(() => setScanOpen(false), []);
  const shell = useMemo(() => ({ ...value, openScan }), [value, openScan]);
  return (
    <ShellContext.Provider value={shell}>
      {children}
      <ScanOverlay onClose={closeScan} open={scanOpen} />
    </ShellContext.Provider>
  );
}

export const useShell = () => useContext(ShellContext);
```

  In `tab-island.tsx`:
  - Delete the `scanOpen` / `closeScan` state, the `ScanOverlay` import and its `<ScanOverlay … />` element.
  - Delete the fragment wrapper, so the component returns the `<nav>`.
  - Read `const { signedIn, openScan } = useShell();`.
  - Set the scan button's `onClick={openScan}`.
  - Drop `useCallback` and `useState` from the React import if they are unused.

- [ ] **Step 2: Make the upload dialog controlled.** Move it with `git mv` to `S/components/verification/upload-verification-dialog.tsx`. Then change the signature to:

```tsx
export function UploadVerificationDialog({
  open,
  onOpenChange,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded?: () => void;
}) {
```

  - **Delete:** the `useState(false)` for `open`, the `useApplicationConfiguration` / `isActionGranted` grant check with its early `return null`, and the trigger `<Button data-testid="upload-verification-button">`. Drop the imports that become unused.
  - **Close and refresh:** in `handleSubmit`'s success branch, replace `setOpen(false); router.refresh();` with `onOpenChange(false); if (onUploaded) onUploaded(); else router.refresh();`.
  - **Opening and closing:** the `<Dialog>` keeps `open={open}`, and its handler becomes `onOpenChange={(next) => { if (isBusy) return; if (!next) reset(); onOpenChange(next); }}`.
  - **The old `tags-view.tsx`**, which Task 4 replaces, keeps compiling:

```tsx
const { policies } = useApplicationConfiguration();
const [uploadOpen, setUploadOpen] = useState(false);
// …in place of <UploadVerificationDialog />:
{tagGrants(policies).uploadVerification && (
  <>
    <Button data-testid="upload-verification-button" onClick={() => setUploadOpen(true)} size="sm" variant="outline">
      {t.SSRService["Verification.Upload"]}
    </Button>
    <UploadVerificationDialog onOpenChange={setUploadOpen} open={uploadOpen} />
  </>
)}
```

- [ ] **Step 3: `home-skeleton.tsx`** (server-safe, no `"use client"`):

```tsx
import { TagCardSkeleton } from "@/src/components/tags/tag-skeletons";
import { Skeleton } from "@repo/ayasofyazilim-ui/components/skeleton";

export function HomeSkeleton() {
  return (
    <div data-testid="home-skeleton">
      <div className="flex flex-col gap-3 rounded-md border border-border bg-card px-5 py-4">
        <Skeleton className="h-2.5 w-28" />
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-3 w-36" />
      </div>
      <div className="my-4">
        <Skeleton className="mb-4 h-7 w-32" />
        <TagCardSkeleton variant="hero" />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `refund-summary-card.tsx`:**

```tsx
"use client";
import { IoCheckmarkCircle } from "@/src/components/shell/ionicons";
import { formatPlainAmount } from "@/src/components/tag-detail/format";
import { useTranslations } from "@/src/providers/i18n";
import type { RefundSummary } from "@/src/utils/tag/home-summary";
import { useParams } from "next/navigation";

export function RefundSummaryCard({ summary }: { summary: RefundSummary }) {
  const { t } = useTranslations();
  const { lang } = useParams<{ lang: string }>();
  const [headline, ...rest] = summary.expected;
  const hasExpected = summary.expectedTagCount > 0 || summary.expected.length > 0;
  if (!hasExpected && summary.received.length === 0) return null;
  const estimated = ` · ${t.SSRService["Home.Summary.EstimatedNote"]}`;
  const count = summary.expectedTagCount;
  const meta = [
    count === 1
      ? t.SSRService["Home.Summary.OneTagCount"]
      : count > 1
        ? t.SSRService["Home.Summary.TagCount"].replace("{0}", String(count))
        : null,
    summary.notCalculatedCount > 0
      ? t.SSRService["Home.Summary.NotCalculated"].replace("{0}", String(summary.notCalculatedCount))
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="flex flex-col gap-3 rounded-md border border-border bg-card px-5 py-4" data-testid="home-summary">
      {hasExpected ? (
        <>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t.SSRService["Home.Summary.Expected"]}
            {headline?.isEstimate ? estimated : ""}
          </p>
          {headline ? (
            <p className="flex items-baseline gap-1.5">
              <span className="text-[32px] font-bold leading-none text-foreground" data-testid="home-summary-amount">
                {formatPlainAmount(headline.amount, lang)}
              </span>
              <span className="text-base font-semibold text-muted-foreground">{headline.currency}</span>
            </p>
          ) : null}
          {rest.length > 0 ? (
            <div className="flex flex-col gap-1">
              {rest.map((group) => (
                <p className="text-sm font-medium text-foreground" key={group.currency}>
                  {formatPlainAmount(group.amount, lang)} {group.currency}
                  {group.isEstimate ? estimated : ""}
                </p>
              ))}
            </div>
          ) : null}
          {meta ? <p className="text-xs text-muted-foreground">{meta}</p> : null}
        </>
      ) : null}
      {summary.received.length > 0 ? (
        <>
          {hasExpected ? <div className="h-px bg-border" /> : null}
          {summary.received.map((group) => (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" key={group.currency}>
              <IoCheckmarkCircle className="shrink-0 text-success" size={16} />
              {t.SSRService["Home.Summary.AlreadyPaid"]
                .replace("{0}", formatPlainAmount(group.amount, lang))
                .replace("{1}", group.currency)}
            </p>
          ))}
        </>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 5: `home-shortcut-tiles.tsx`.** A tile with a description, or an odd tile left at the end, spans the full width.

```tsx
"use client";
import { IoChevronForward } from "@/src/components/shell/ionicons";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import Link from "next/link";
import type { ReactNode } from "react";

type Tone = "warning" | "info" | "success";
const SURFACE: Record<Tone, string> = { warning: "bg-warning/15", info: "bg-info/15", success: "bg-success/15" };
const DISC: Record<Tone, string> = { warning: "bg-warning", info: "bg-info", success: "bg-success" };

export type ShortcutTile = {
  id: string;
  title: string;
  icon: (props: { size?: number; className?: string }) => ReactNode;
  tone: Tone;
  description?: string;
  value?: string;
  href?: string;
  onClick?: () => void;
};

function TileShell({ tile, className, children }: { tile: ShortcutTile; className: string; children: ReactNode }) {
  const classes = cn("rounded-md transition-opacity active:opacity-80", SURFACE[tile.tone], className);
  if (tile.href) {
    return (
      <Link className={classes} data-testid={`home-tile-${tile.id}`} href={tile.href}>
        {children}
      </Link>
    );
  }
  return (
    <button className={cn(classes, "text-left")} data-testid={`home-tile-${tile.id}`} onClick={tile.onClick} type="button">
      {children}
    </button>
  );
}

export function HomeShortcutTiles({ tiles }: { tiles: ShortcutTile[] }) {
  if (tiles.length === 0) return null;
  const half = tiles.filter((tile) => tile.description === undefined);
  const promoted = half.length % 2 === 1 ? half[half.length - 1] : undefined;
  return (
    <div className="mt-4 overflow-hidden rounded-md border border-border bg-card p-1.5" data-testid="home-shortcuts">
      <div className="flex flex-wrap items-stretch">
        {tiles.map((tile) => {
          const wide = tile.description !== undefined || tile === promoted;
          const Icon = tile.icon;
          const disc = (
            <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-full text-primary-foreground", DISC[tile.tone])}>
              <Icon size={20} />
            </span>
          );
          return (
            <div className={cn("p-1.5", wide ? "w-full" : "w-1/2")} key={tile.id}>
              {wide ? (
                <TileShell className="flex h-full w-full items-center gap-3 px-4 py-3.5" tile={tile}>
                  {disc}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-base font-medium text-foreground">{tile.title}</span>
                    {tile.description !== undefined ? (
                      <span className="line-clamp-2 text-xs text-muted-foreground">{tile.description}</span>
                    ) : tile.value ? (
                      <span className="text-xs text-muted-foreground">{tile.value}</span>
                    ) : null}
                  </span>
                  <IoChevronForward className="shrink-0 text-muted-foreground" size={18} />
                </TileShell>
              ) : (
                <TileShell className="flex h-full w-full flex-col items-center px-3 py-4" tile={tile}>
                  <span className="mb-3">{disc}</span>
                  <span className="line-clamp-2 text-center text-sm font-medium text-foreground">{tile.title}</span>
                  {tile.value ? <span className="mt-0.5 text-xs text-muted-foreground">{tile.value}</span> : null}
                </TileShell>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: `home-start-card.tsx`.** It holds the start card and the app's prominent map action.

```tsx
"use client";
import { IoChevronForward, IoLocationOutline, IoPricetagsOutline } from "@/src/components/shell/ionicons";
import { useTranslations } from "@/src/providers/i18n";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import Link from "next/link";

export function HomeStartCard({ onScan }: { onScan: () => void }) {
  const { t } = useTranslations();
  return (
    <section className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border p-6" data-testid="home-start">
      <IoPricetagsOutline className="text-muted-foreground" size={32} />
      <p className="text-base font-semibold text-foreground">{t.SSRService["Home.Start.Title"]}</p>
      <p className="text-center text-sm text-muted-foreground">{t.SSRService["Home.Start.Description"]}</p>
      <Button className="w-48" data-testid="home-start-scan" onClick={onScan}>
        {t.SSRService["Home.Start.Cta"]}
      </Button>
    </section>
  );
}

export function HomeMapAction({ href }: { href: string }) {
  const { t } = useTranslations();
  return (
    <Link className="mt-2 flex w-full items-center rounded-md bg-primary px-4 py-4" data-testid="home-map-action" href={href}>
      <span className="mr-4 flex size-12 items-center justify-center rounded-full bg-card/20 text-primary-foreground">
        <IoLocationOutline size={24} />
      </span>
      <span className="flex flex-1 flex-col">
        <span className="text-base font-bold text-primary-foreground">{t.SSRService["Home.Shortcuts.Locations"]}</span>
        <span className="text-xs text-primary-foreground/80">{t.SSRService["Home.Shortcuts.LocationsDescription"]}</span>
      </span>
      <IoChevronForward className="text-primary-foreground/80" size={20} />
    </Link>
  );
}
```

- [ ] **Step 7: `home-dashboard.tsx`:**

```tsx
"use client";
import { IoCameraOutline, IoCardOutline, IoLocationOutline } from "@/src/components/shell/ionicons";
import { useShell } from "@/src/components/shell/shell-context";
import { TagCard } from "@/src/components/tags/tag-card";
import { tagGrants } from "@/src/components/tags/tag-grants";
import { TagsErrorState } from "@/src/components/tags/tag-states";
import { UploadVerificationDialog } from "@/src/components/verification/upload-verification-dialog";
import { useTranslations } from "@/src/providers/i18n";
import { buildRefundSummary } from "@/src/utils/tag/home-summary";
import type { UniRefund_TagService_Tags_TagListItemForTravellerCrossTenantsDto as TagListItemDto } from "@repo/saas/TagService";
import { useApplicationConfiguration } from "@repo/utils/app-config";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { HomeShortcutTiles, type ShortcutTile } from "./home-shortcut-tiles";
import { HomeMapAction, HomeStartCard } from "./home-start-card";
import { RefundSummaryCard } from "./refund-summary-card";

export function HomeDashboard({
  tags,
  payoutCount,
}: {
  tags: TagListItemDto[] | null;
  payoutCount?: number | null;
}) {
  const { t } = useTranslations();
  const { lang } = useParams<{ lang: string }>();
  const router = useRouter();
  const { openScan } = useShell();
  const { policies } = useApplicationConfiguration();
  const canUpload = tagGrants(policies).uploadVerification;
  const [uploadOpen, setUploadOpen] = useState(false);

  if (tags === null) return <TagsErrorState />;
  const [latest] = tags;
  const tiles: ShortcutTile[] = [];
  if (canUpload)
    tiles.push({
      id: "upload",
      title: t.SSRService["Verification.Upload"],
      icon: IoCameraOutline,
      tone: "warning",
      description: t.SSRService["Home.Shortcuts.UploadDescription"],
      onClick: () => setUploadOpen(true),
    });
  if (latest)
    tiles.push({
      id: "map",
      title: t.SSRService["Home.Shortcuts.Locations"],
      icon: IoLocationOutline,
      tone: "info",
      href: `/${lang}/explore`,
    });
  // undefined: no cards grant, so no tile. null: granted, but the count failed.
  if (payoutCount !== undefined)
    tiles.push({
      id: "payout",
      title: t.SSRService["Home.Shortcuts.Payout"],
      icon: IoCardOutline,
      tone: "success",
      value: payoutCount === null ? "" : t.SSRService["Home.Shortcuts.PayoutCount"].replace("{0}", String(payoutCount)),
      href: `/${lang}/profile/cards`,
    });

  return (
    <>
      {latest ? (
        <>
          <RefundSummaryCard summary={buildRefundSummary(tags, "")} />
          <section className="my-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-foreground">{t.SSRService["Home.LastTag"]}</h2>
              <Link className="font-semibold text-primary" data-testid="home-view-all" href={`/${lang}/tags`}>
                {t.SSRService["Home.ViewAll"]}
              </Link>
            </div>
            <TagCard
              amountPrefer="refund"
              href={`/${lang}/tags/${encodeURIComponent(latest.tagNumber)}`}
              tag={latest}
              variant="hero"
            />
          </section>
        </>
      ) : (
        <>
          <HomeStartCard onScan={openScan} />
          <HomeMapAction href={`/${lang}/explore`} />
        </>
      )}
      <HomeShortcutTiles tiles={tiles} />
      {canUpload ? (
        <UploadVerificationDialog
          onOpenChange={setUploadOpen}
          onUploaded={() => router.push(`/${lang}/tags?view=verifications`)}
          open={uploadOpen}
        />
      ) : null}
    </>
  );
}
```

- [ ] **Step 8: `home-dashboard-data.tsx`** (server, async):

```tsx
import { cardGrants } from "@/src/components/payout-cards/card-grants";
import { getMyTravellerCardsApi } from "@repo/actions/unirefund/RefundService/actions";
import { getTagsCrossTenantsByTravellerIdClaimApi } from "@repo/actions/unirefund/TagService/actions";
import { getApplicationConfiguration } from "@repo/utils/app-config/fetch";
import type { Session } from "@repo/utils/auth";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { HomeDashboard } from "./home-dashboard";

// Travellers have no totals endpoint, so the summary reads every tag, as the app does.
const HOME_TAG_LIMIT = 999;

function rethrowRedirect(error: unknown): null {
  if (isRedirectError(error)) throw error;
  return null;
}

export async function HomeDashboardData({ session }: { session: Session }) {
  const { policies } = await getApplicationConfiguration();
  const canViewCards = cardGrants(policies).view;
  const [tags, cardCount] = await Promise.all([
    getTagsCrossTenantsByTravellerIdClaimApi(
      { sorting: "issueDate desc", maxResultCount: HOME_TAG_LIMIT },
      session
    ).then((response) => response.data.items ?? [], rethrowRedirect),
    canViewCards
      ? getMyTravellerCardsApi({}, session).then((response) => response.data.items?.length ?? 0, rethrowRedirect)
      : Promise.resolve(undefined),
  ]);
  return <HomeDashboard payoutCount={cardCount} tags={tags} />;
}
```

- [ ] **Step 9: Page and client.**
  - **`(public)/page.tsx`:**

```tsx
import { auth } from "@repo/utils/auth/next-auth";
import { Suspense } from "react";
import { HomeDashboardData } from "./_components/home-dashboard-data";
import { HomeSkeleton } from "./_components/home-skeleton";
import HomeClient from "./client";

export default async function Page() {
  const session = await auth();
  return (
    <HomeClient session={session}>
      {session?.user?.access_token ? (
        <Suspense fallback={<HomeSkeleton />}>
          <HomeDashboardData session={session} />
        </Suspense>
      ) : null}
    </HomeClient>
  );
}
```

  - **`client.tsx`:**
    - `HomeClient` takes `{ session, children }: { session: Session | null; children?: React.ReactNode }`.
    - In the signed-in branch, replace the two link buttons (`explore-merchants-link` and `check-tags-link`) with `{children}`, so it returns `<TabPage><PageHeader … />{children}</TabPage>`.
    - Remove the `StoreIcon` and `TagsIcon` imports.
    - Leave the signed-out hero untouched.

- [ ] **Step 10: Run the gates and check by hand.**
  - Run `test:unit`, `type-check` and `lint` (0 errors).
  - Start dev detached on a free port, for example `Start-Process cmd.exe -ArgumentList '/c pnpm --filter ssr dev --port 3010 > dev.log 2>&1' -WorkingDirectory <worktree> -WindowStyle Hidden`.
  - Signed in as `tur-a25y29041` / `1q2w3E*` at 375 px wide, `/en` shows:
    - the header;
    - "You'll receive" (if the account has expected or paid tags);
    - "Last Tag" with "View All";
    - the tiles.
  - The island's Scan still opens the overlay.
  - Signed out, `/en` shows the hero.
  - Stop dev and its `node.exe` children.

- [ ] **Step 11: Commit.** Stage the move, the new files, `shell-context.tsx`, `tab-island.tsx`, `page.tsx`, `client.tsx` and `tags-view.tsx`, then commit:

```bash
git commit -q -F - <<'EOF'
feat(ssr): give the signed-in Home the app's dashboard

Home shows the app's "You'll receive" summary across every tag, the
newest tag as the hero card, and the shortcut tiles (upload, tax-free
locations, payout methods), each behind its grant. With no tags it shows
the app's start card, whose Scan opens the island's scanner. The scan
overlay moves into the shell provider, and the upload dialog becomes a
controlled shared component.

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

### Task 4: Tags list (web-app)

**Files:**
- Create:
  - `S/components/shell/pinned-bar.tsx`
  - `S/components/tags/blob-pager.tsx`
  - in `(main)/tags/_components/`: `tag-search-context.tsx`, `tag-list-nav.ts`, `tag-list-toolbar.tsx` (rewritten), `tag-filter-sheet.tsx`, `tags-view-switch.tsx`, `tag-action-button.tsx`, `upload-verification-button.tsx`, `tag-list-body.tsx`, `tag-list-data.tsx` (server), `verification-list.tsx`, `verification-list-data.tsx` (server) and `verification-skeleton.tsx`
- Modify:
  - `(main)/tags/page.tsx`
  - `_components/tags-view.tsx` (rewritten)
  - `_components/tag-claim.tsx`
  - `S/components/shell/tab-page.tsx`
  - `S/app/[lang]/layout.tsx` (the Toaster offset)
- Delete: `_components/tag-table-view.tsx` and `_components/pending-verifications.tsx`. The old `tag-list-toolbar.tsx` is replaced in place.

**Interfaces:**
- Consumes:
  - from Task 1: `parseTagListParams`, `resolveTagsView`, `tagListApiQuery`, `TagListParams`, `parseTagRowDesign`, `TAG_ROW_DESIGN_COOKIE`, `countTravellerFilters`, `filterTagsBySearch`, `tagListState`, and `tagGrants().{viewMyVerifications, uploadVerification, claim, viewRisk}`;
  - from Task 2: `TagListItem`, `TagListSkeleton` and the states;
  - from Task 3: `UploadVerificationDialog`;
  - `blobChain` from `S/components/shell/blob-chain`, and the existing `TAG_DATE_PRESETS`, `presetToRange` and `selectedPreset`.
- Produces:
  - `PinnedBar({ children, testId? })`
  - `TabPage({ pinnedBar?: boolean })`
  - `BlobPager({ page, pageCount, hrefFor }: { page: number; pageCount: number; hrefFor: (page: number) => string })`, which is 1-based.

- [ ] **Step 1: The pinned bar, the clearance and the toasts.**
  - **`pinned-bar.tsx`:**

```tsx
import { BAR_BOTTOM_GAP, BAR_RADIUS } from "./blob-chain";

// Sits 10 px above the island, as the app's BottomChrome does.
const PINNED_BAR_BOTTOM = BAR_BOTTOM_GAP + BAR_RADIUS * 2 + 10;

export function PinnedBar({ children, testId = "pinned-bar" }: { children: React.ReactNode; testId?: string }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-30 flex justify-center px-4"
      data-testid={testId}
      style={{ bottom: `calc(env(safe-area-inset-bottom) + ${PINNED_BAR_BOTTOM}px)` }}
    >
      <div className="pointer-events-auto flex w-full max-w-3xl justify-center">{children}</div>
    </div>
  );
}
```

  - **`tab-page.tsx`:**
    - Add `export const PINNED_BAR_CLEARANCE_CLASS = "pb-[calc(env(safe-area-inset-bottom)+176px)]";`, with the comment `/** Island clearance plus a 56 px pinned bar and its 10 px gap. */`.
    - Add the prop `pinnedBar = false`.
    - Use `pinnedBar ? PINNED_BAR_CLEARANCE_CLASS : ISLAND_CLEARANCE_CLASS`.
  - **`S/app/[lang]/layout.tsx`:**
    - Set `const toastOffset = { bottom: "calc(env(safe-area-inset-bottom) + 160px)" };`.
    - Set its comment to `// Above the island and a pinned bar: 20 + 60 + 10 + 56, plus 14 px of air.`

- [ ] **Step 2: `S/components/tags/blob-pager.tsx`.** This is the app's `BlobPagination` geometry: groups `[2, 1, 2]`, radius 20, pitch 44, gap 39 and fillet 7.

```tsx
"use client";
import { blobChain } from "@/src/components/shell/blob-chain";
import {
  IoChevronBack,
  IoChevronForward,
  IoPlaySkipBack,
  IoPlaySkipForward,
} from "@/src/components/shell/ionicons";
import { useTranslations } from "@/src/providers/i18n";
import Link from "next/link";

const CHAIN = blobChain({ groups: [2, 1, 2], radius: 20, slotPitch: 44, gap: 39, fillet: 7 });

export function BlobPager({
  page,
  pageCount,
  hrefFor,
}: {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
}) {
  const { t } = useTranslations();
  if (pageCount <= 1) return null;
  const atStart = page <= 1;
  const atEnd = page >= pageCount;
  const step = (
    id: string,
    Icon: typeof IoChevronBack,
    target: number,
    disabled: boolean,
    labelKey: "Tags.Pager.First" | "Tags.Pager.Previous" | "Tags.Pager.Next" | "Tags.Pager.Last"
  ) =>
    disabled ? (
      <span aria-hidden="true" className="flex size-10 items-center justify-center opacity-30" key={id}>
        <Icon size={20} />
      </span>
    ) : (
      <Link
        aria-label={t.SSRService[labelKey]}
        className="flex size-10 items-center justify-center text-foreground"
        data-testid={`tag-pager-${id}`}
        href={hrefFor(target)}
        key={id}
      >
        <Icon size={20} />
      </Link>
    );
  const groups = [
    [
      step("first", IoPlaySkipBack, 1, atStart, "Tags.Pager.First"),
      step("previous", IoChevronBack, page - 1, atStart, "Tags.Pager.Previous"),
    ],
    [
      <span className="text-xs font-semibold text-foreground" data-testid="tag-pager-counter" key="counter">
        {`${page}/${pageCount}`}
      </span>,
    ],
    [
      step("next", IoChevronForward, page + 1, atEnd, "Tags.Pager.Next"),
      step("last", IoPlaySkipForward, pageCount, atEnd, "Tags.Pager.Last"),
    ],
  ];
  return (
    <nav
      aria-label={t.SSRService["Tags.Pager.Label"]}
      className="relative"
      data-testid="tag-pager"
      style={{ width: CHAIN.width, height: CHAIN.height }}
    >
      <div aria-hidden="true" className="absolute inset-0 backdrop-blur-md" style={{ clipPath: `path("${CHAIN.path}")` }} />
      <svg aria-hidden="true" className="absolute inset-0 overflow-visible" height={CHAIN.height} viewBox={`0 0 ${CHAIN.width} ${CHAIN.height}`} width={CHAIN.width}>
        <path className="fill-card/92 stroke-border" d={CHAIN.path} strokeWidth={1} />
      </svg>
      {CHAIN.segments.map((segment, index) => (
        <div
          className="absolute inset-y-0 flex items-center justify-center"
          key={segment.x}
          style={{ left: segment.x, width: segment.width }}
        >
          {groups[index]}
        </div>
      ))}
    </nav>
  );
}
```

- [ ] **Step 3: Search context and navigation.**
  - **`tag-search-context.tsx`:**

```tsx
"use client";
import { createContext, useContext, useMemo, useState } from "react";

const TagSearchContext = createContext<{ search: string; setSearch: (value: string) => void }>({
  search: "",
  setSearch: () => undefined,
});

export function TagSearchProvider({ children }: { children: React.ReactNode }) {
  const [search, setSearch] = useState("");
  const value = useMemo(() => ({ search, setSearch }), [search]);
  return <TagSearchContext.Provider value={value}>{children}</TagSearchContext.Provider>;
}

export const useTagSearch = () => useContext(TagSearchContext);
```

  - **`tag-list-nav.ts`:**

```ts
"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Every list change starts again from page 1.
export function useTagListPush() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("page");
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined) next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };
}
```

- [ ] **Step 4: The filter sheet and the toolbar.**
  - **`tag-filter-sheet.tsx`:**

```tsx
"use client";
import { IoClose } from "@/src/components/shell/ionicons";
import { useTranslations } from "@/src/providers/i18n";
import { TAG_DATE_PRESETS, type TagDatePreset } from "@/src/utils/tag/tag-date-range";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import { Drawer, DrawerClose, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from "@repo/ayasofyazilim-ui/components/drawer";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";

export function TagFilterSheet({
  open,
  onOpenChange,
  staged,
  onStage,
  onApply,
  onClear,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staged: TagDatePreset | undefined;
  onStage: (preset: TagDatePreset) => void;
  onApply: () => void;
  onClear: () => void;
}) {
  const { t } = useTranslations();
  return (
    <Drawer onOpenChange={onOpenChange} open={open}>
      <DrawerContent data-testid="tag-filter-sheet">
        <DrawerHeader className="flex-row items-center justify-between">
          <DrawerTitle className="text-xl font-bold">{t.SSRService["Tags.Filters"]}</DrawerTitle>
          <DrawerClose aria-label={t.SSRService["Tags.CloseFilters"]} className="text-foreground" data-testid="tag-filter-close">
            <IoClose size={22} />
          </DrawerClose>
        </DrawerHeader>
        <div className="flex flex-col gap-2 px-4 pb-2">
          <p className="px-0.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {t.SSRService["Tags.IssueDateFilter"]}
          </p>
          <div className="flex flex-wrap gap-2">
            {TAG_DATE_PRESETS.map((preset) => (
              <button
                aria-pressed={staged === preset.value}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium",
                  staged === preset.value ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-foreground"
                )}
                data-testid={`tag-filter-preset-${preset.value}`}
                key={preset.value}
                onClick={() => onStage(preset.value)}
                type="button"
              >
                {t.SSRService[preset.labelKey]}
              </button>
            ))}
          </div>
        </div>
        <DrawerFooter className="flex-row gap-2">
          <Button className="flex-1" data-testid="tag-filter-clear" onClick={onClear} variant="outline">
            {t.SSRService["Tags.ClearFilters"]}
          </Button>
          <Button className="flex-1" data-testid="tag-filter-apply" onClick={onApply}>
            {t.SSRService["Tags.ApplyFilters"]}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
```

  - **`tag-list-toolbar.tsx`:**

```tsx
"use client";
import { IoArrowDown, IoArrowUp, IoCloseCircle, IoOptionsOutline, IoSearch } from "@/src/components/shell/ionicons";
import { useIsClient } from "@/src/hooks/use-is-client";
import { useTranslations } from "@/src/providers/i18n";
import { presetToRange, selectedPreset, type TagDatePreset } from "@/src/utils/tag/tag-date-range";
import { Input } from "@repo/ayasofyazilim-ui/components/input";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import { useState } from "react";
import { TagFilterSheet } from "./tag-filter-sheet";
import { useTagListPush } from "./tag-list-nav";
import { useTagSearch } from "./tag-search-context";

export function TagListToolbar({
  sort,
  issuedStartDate,
  issuedEndDate,
  filterCount,
}: {
  sort: "asc" | "desc";
  issuedStartDate?: string;
  issuedEndDate?: string;
  filterCount: number;
}) {
  const { t } = useTranslations();
  const { search, setSearch } = useTagSearch();
  const push = useTagListPush();
  const isClient = useIsClient();
  const [open, setOpen] = useState(false);
  const [staged, setStaged] = useState<TagDatePreset | undefined>(undefined);
  const current = selectedPreset(issuedStartDate, issuedEndDate, isClient ? new Date() : undefined);

  function apply() {
    if (staged) {
      const { start, end } = presetToRange(staged, new Date());
      push({ issuedStartDate: start, issuedEndDate: end });
    }
    setOpen(false);
  }

  function clear() {
    push({ issuedStartDate: undefined, issuedEndDate: undefined });
    setOpen(false);
  }

  return (
    <div className="flex items-stretch gap-2" data-testid="tag-list-toolbar">
      <div className="relative min-w-0 flex-1">
        <Input
          aria-label={t.SSRService["Tags.SearchPlaceholder"]}
          className="h-10 rounded-full pr-10"
          data-testid="tag-search"
          enterKeyHint="search"
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t.SSRService["Tags.SearchPlaceholder"]}
          value={search}
        />
        {search ? (
          <button
            aria-label={t.SSRService["Tags.ClearSearch"]}
            className="absolute inset-y-0 right-0 flex items-center pr-4 text-muted-foreground"
            data-testid="tag-search-clear"
            onClick={() => setSearch("")}
            type="button"
          >
            <IoCloseCircle size={18} />
          </button>
        ) : (
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4 text-muted-foreground">
            <IoSearch size={18} />
          </span>
        )}
      </div>
      <button
        aria-label={t.SSRService[sort === "desc" ? "Tags.SortNewest" : "Tags.SortOldest"]}
        className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-primary"
        data-testid="tag-sort-toggle"
        onClick={() => push({ sort: sort === "desc" ? "asc" : undefined })}
        type="button"
      >
        {sort === "desc" ? <IoArrowDown size={18} /> : <IoArrowUp size={18} />}
      </button>
      <button
        aria-label={t.SSRService["Tags.Filters"]}
        className={cn(
          "relative flex w-16 shrink-0 items-center justify-center rounded-md border text-primary",
          filterCount > 0 ? "border-primary bg-primary/10" : "border-border bg-card"
        )}
        data-testid="tag-filter-button"
        onClick={() => {
          setStaged(current);
          setOpen(true);
        }}
        type="button"
      >
        <IoOptionsOutline size={20} />
        {filterCount > 0 ? (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {filterCount}
          </span>
        ) : null}
      </button>
      <TagFilterSheet onApply={apply} onClear={clear} onOpenChange={setOpen} onStage={setStaged} open={open} staged={staged} />
    </div>
  );
}
```

  If `selectedPreset` or `presetToRange` have different parameter or return types than used here, adapt this call site to the existing signatures in `S/utils/tag/tag-date-range.ts`. Do not change those functions.

- [ ] **Step 5: Action buttons, the claim and the switch.**
  - **`tag-action-button.tsx`:**

```tsx
"use client";
import type { ReactNode } from "react";

export function TagActionButton({ icon, label, onClick, testId }: { icon: ReactNode; label: string; onClick: () => void; testId: string }) {
  return (
    <button
      className="flex w-full items-center justify-center gap-2 rounded-md border border-primary bg-primary/10 py-2.5 text-sm font-semibold text-primary"
      data-testid={testId}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}
```

  - **`tag-claim.tsx`:** keep the grant check and the `ClaimTagModal`. Replace the outline `Button` with:

```tsx
<TagActionButton
  icon={<IoAddCircleOutline size={18} />}
  label={t.SSRService["Tags.ClaimATag"]}
  onClick={() => setOpen(true)}
  testId="claim-tag-button"
/>
```

  - **`upload-verification-button.tsx`:**

```tsx
"use client";
import { IoCameraOutline } from "@/src/components/shell/ionicons";
import { tagGrants } from "@/src/components/tags/tag-grants";
import { UploadVerificationDialog } from "@/src/components/verification/upload-verification-dialog";
import { useTranslations } from "@/src/providers/i18n";
import { useApplicationConfiguration } from "@repo/utils/app-config";
import { useState } from "react";
import { TagActionButton } from "./tag-action-button";

export function UploadVerificationButton() {
  const { t } = useTranslations();
  const { policies } = useApplicationConfiguration();
  const [open, setOpen] = useState(false);
  if (!tagGrants(policies).uploadVerification) return null;
  return (
    <>
      <TagActionButton
        icon={<IoCameraOutline size={18} />}
        label={t.SSRService["Verification.Upload"]}
        onClick={() => setOpen(true)}
        testId="upload-verification-button"
      />
      <UploadVerificationDialog onOpenChange={setOpen} open={open} />
    </>
  );
}
```

  - **`tags-view-switch.tsx`:**

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import type { TagsView } from "@/src/app/[lang]/(main)/tags/tag-list-params";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import Link from "next/link";
import { useParams } from "next/navigation";

export function TagsViewSwitch({ view }: { view: TagsView }) {
  const { t } = useTranslations();
  const { lang } = useParams<{ lang: string }>();
  const items: { id: TagsView; label: string; href: string }[] = [
    { id: "tags", label: t.SSRService["Tags.Tabs.Tags"], href: `/${lang}/tags` },
    { id: "verifications", label: t.SSRService["Tags.Tabs.Verifications"], href: `/${lang}/tags?view=verifications` },
  ];
  return (
    <nav aria-label={t.SSRService["Tags.Tabs.Label"]} className="flex rounded-full bg-foreground/5 p-1" data-testid="tags-view-switch">
      {items.map((item) => (
        <Link
          aria-current={item.id === view ? "page" : undefined}
          className={cn(
            "flex-1 rounded-full py-2 text-center text-sm font-semibold",
            item.id === view ? "bg-card text-primary" : "text-muted-foreground"
          )}
          data-testid={`tags-view-${item.id}`}
          href={item.href}
          key={item.id}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
```

  If the `@/src/app/[lang]/(main)/tags/tag-list-params` import path does not resolve, use a relative `../tag-list-params`.

- [ ] **Step 6: The list.**
  - **`tag-list-body.tsx`:**

```tsx
"use client";
import { PinnedBar } from "@/src/components/shell/pinned-bar";
import { BlobPager } from "@/src/components/tags/blob-pager";
import { tagGrants } from "@/src/components/tags/tag-grants";
import { TagListItem } from "@/src/components/tags/tag-list-item";
import { TagsEmptyState, TagsNoMatchState } from "@/src/components/tags/tag-states";
import type { TagRowDesign } from "@/src/utils/tag/tag-row-design";
import { filterTagsBySearch, tagListState } from "@/src/utils/tag/tag-search";
import type { UniRefund_TagService_Tags_TagListItemForTravellerCrossTenantsDto as TagListItemDto } from "@repo/saas/TagService";
import { useApplicationConfiguration } from "@repo/utils/app-config";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTagSearch } from "./tag-search-context";

export function TagListBody({
  tags,
  totalCount,
  page,
  pageSize,
  design,
  filterCount,
}: {
  tags: TagListItemDto[];
  totalCount: number;
  page: number;
  pageSize: number;
  design: TagRowDesign;
  filterCount: number;
}) {
  const { lang } = useParams<{ lang: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { search, setSearch } = useTagSearch();
  const { policies } = useApplicationConfiguration();
  const showRisk = tagGrants(policies).viewRisk;
  const shown = filterTagsBySearch(tags, search);
  const pageCount = Math.ceil(totalCount / pageSize);
  const state = tagListState({
    shownCount: shown.length,
    totalCount,
    narrowed: search.trim() !== "" || filterCount > 0,
  });
  const hrefFor = (target: number) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("page", String(target));
    return `/${lang}/tags?${next.toString()}`;
  };
  const clear = () => {
    setSearch("");
    router.push(`/${lang}/tags`);
  };
  const href = (tagNumber: string) => `/${lang}/tags/${encodeURIComponent(tagNumber)}`;

  return (
    <>
      {state === "list" ? (
        design === "classic" ? (
          <div className="flex flex-col gap-3" data-testid="tag-list">
            {shown.map((tag) => (
              <TagListItem design={design} href={href(tag.tagNumber)} key={tag.id} showRisk={showRisk} tag={tag} />
            ))}
          </div>
        ) : (
          <div className="-mx-4 border-b border-input" data-testid="tag-list">
            {shown.map((tag) => (
              <TagListItem design={design} href={href(tag.tagNumber)} key={tag.id} showRisk={showRisk} tag={tag} />
            ))}
          </div>
        )
      ) : state === "empty" ? (
        <TagsEmptyState />
      ) : (
        <TagsNoMatchState onClear={clear} />
      )}
      {pageCount > 1 ? (
        <PinnedBar>
          <BlobPager hrefFor={hrefFor} page={page} pageCount={pageCount} />
        </PinnedBar>
      ) : null}
    </>
  );
}
```

  - **`tag-list-data.tsx`** (server):

```tsx
import { TagsErrorState } from "@/src/components/tags/tag-states";
import type { TagRowDesign } from "@/src/utils/tag/tag-row-design";
import { countTravellerFilters } from "@/src/utils/tag/traveller-filters";
import { getTagsCrossTenantsByTravellerIdClaimApi } from "@repo/actions/unirefund/TagService/actions";
import { auth } from "@repo/utils/auth/next-auth";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { tagListApiQuery, type TagListParams } from "../tag-list-params";
import { TagListBody } from "./tag-list-body";

export const TAG_PAGE_SIZE = 20;

export async function TagListData({ params, design }: { params: TagListParams; design: TagRowDesign }) {
  const session = await auth();
  const result = await getTagsCrossTenantsByTravellerIdClaimApi(tagListApiQuery(params, TAG_PAGE_SIZE), session).then(
    (response) => ({ items: response.data.items ?? [], totalCount: response.data.totalCount ?? 0 }),
    (error: unknown) => {
      if (isRedirectError(error)) throw error;
      return null;
    }
  );
  if (!result) return <TagsErrorState />;
  return (
    <TagListBody
      design={design}
      filterCount={countTravellerFilters(params)}
      page={params.page}
      pageSize={TAG_PAGE_SIZE}
      tags={result.items}
      totalCount={result.totalCount}
    />
  );
}
```

- [ ] **Step 7: Verifications.**
  - **`verification-skeleton.tsx`** (server-safe):

```tsx
import { Skeleton } from "@repo/ayasofyazilim-ui/components/skeleton";

export function VerificationListSkeleton() {
  return (
    <div className="flex flex-col gap-3" data-testid="verifications-skeleton">
      {[0, 1, 2].map((row) => (
        <div className="flex flex-col gap-1 rounded-md border border-border bg-card p-3" key={row}>
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <Skeleton className="h-4 w-28" />
        </div>
      ))}
    </div>
  );
}
```

  - **`verification-list.tsx`:**

```tsx
"use client";
import { IoCameraOutline } from "@/src/components/shell/ionicons";
import { formatDay } from "@/src/components/tag-detail/format";
import { EmptyState } from "@/src/components/tags/tag-states";
import { useIsClient } from "@/src/hooks/use-is-client";
import { useTranslations } from "@/src/providers/i18n";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import type {
  UniRefund_TagService_Stickers_MyStickerManualVerificationListDto as Item,
  UniRefund_TagService_Stickers_StickerManualVerificationStatus as Status,
} from "@repo/saas/TagService";
import { useParams } from "next/navigation";

const CHIP: Record<Status, string> = {
  Created: "bg-warning-surface text-warning-strong",
  Invalid: "bg-error-surface text-error",
  Completed: "bg-success-surface text-success-strong",
};

export function VerificationList({ items }: { items: Item[] }) {
  const { t } = useTranslations();
  const { lang } = useParams<{ lang: string }>();
  const isClient = useIsClient();
  if (items.length === 0) {
    return (
      <EmptyState
        description={t.SSRService["Verification.Empty.Description"]}
        icon={IoCameraOutline}
        testId="verifications-empty"
        title={t.SSRService["Verification.Empty.Title"]}
      />
    );
  }
  return (
    <ul className="flex flex-col gap-3" data-testid="verification-list">
      {items.map((item) => {
        const status = item.status ?? "Created";
        return (
          <li className="flex flex-col gap-1 rounded-md border border-border bg-card p-3" key={item.id}>
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 flex-1 truncate font-medium text-foreground">
                {t.SSRService["Verification.StickerLineNumber"]}: {item.stickerLineNumber}
              </p>
              <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", CHIP[status])}>
                {t.SSRService[`Verification.Status.${status}`]}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t.SSRService["Verification.UploadedAt"]}: {formatDay(item.creationTime, lang, isClient ? undefined : "UTC")}
            </p>
            {status === "Invalid" && item.invalidReason ? (
              <p className="text-sm text-muted-foreground">
                {t.SSRService["Verification.RejectionReason"]}: {item.invalidReason}
              </p>
            ) : null}
            {status === "Completed" ? <p className="text-sm text-muted-foreground">{t.SSRService["Verification.TagCreated"]}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}
```

  - **`verification-list-data.tsx`** (server):

```tsx
import { TagsErrorState } from "@/src/components/tags/tag-states";
import { getStickerManualVerificationsMyApi } from "@repo/actions/unirefund/TagService/actions";
import { auth } from "@repo/utils/auth/next-auth";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { VerificationList } from "./verification-list";

export async function VerificationListData() {
  const session = await auth();
  const items = await getStickerManualVerificationsMyApi({ maxResultCount: 20, sorting: "creationTime desc" }, session).then(
    (response) => response.data.items ?? [],
    (error: unknown) => {
      if (isRedirectError(error)) throw error;
      return null;
    }
  );
  if (!items) return <TagsErrorState />;
  return <VerificationList items={items} />;
}
```

- [ ] **Step 8: The view and the page.**
  - **`tags-view.tsx`** (rewrite):

```tsx
"use client";
import { PageHeader } from "@/src/components/shell/page-header";
import { TabPage } from "@/src/components/shell/tab-page";
import { useTranslations } from "@/src/providers/i18n";
import type { TagsView as View } from "../tag-list-params";
import { ClaimTag } from "./tag-claim";
import { TagListToolbar } from "./tag-list-toolbar";
import { TagSearchProvider } from "./tag-search-context";
import { TagsViewSwitch } from "./tags-view-switch";
import { UploadVerificationButton } from "./upload-verification-button";

export function TagsView({
  view,
  canViewVerifications,
  sort,
  issuedStartDate,
  issuedEndDate,
  filterCount,
  children,
}: {
  view: View;
  canViewVerifications: boolean;
  sort: "asc" | "desc";
  issuedStartDate?: string;
  issuedEndDate?: string;
  filterCount: number;
  children: React.ReactNode;
}) {
  const { t } = useTranslations();
  return (
    <TagSearchProvider>
      <TabPage pinnedBar>
        <PageHeader title={t.SSRService["Tags"]} />
        <div className="flex flex-col gap-3">
          {view === "tags" ? (
            <>
              <TagListToolbar filterCount={filterCount} issuedEndDate={issuedEndDate} issuedStartDate={issuedStartDate} sort={sort} />
              <ClaimTag />
            </>
          ) : (
            <UploadVerificationButton />
          )}
          {canViewVerifications ? <TagsViewSwitch view={view} /> : null}
        </div>
        <div className="mt-4">{children}</div>
      </TabPage>
    </TagSearchProvider>
  );
}
```

  - **`(main)/tags/page.tsx`** (rewrite):

```tsx
import { tagGrants } from "@/src/components/tags/tag-grants";
import { TagListSkeleton } from "@/src/components/tags/tag-skeletons";
import { parseTagRowDesign, TAG_ROW_DESIGN_COOKIE } from "@/src/utils/tag/tag-row-design";
import { countTravellerFilters } from "@/src/utils/tag/traveller-filters";
import { getApplicationConfiguration } from "@repo/utils/app-config/fetch";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { TagListData } from "./_components/tag-list-data";
import { TagsView } from "./_components/tags-view";
import { VerificationListData } from "./_components/verification-list-data";
import { VerificationListSkeleton } from "./_components/verification-skeleton";
import { parseTagListParams, resolveTagsView } from "./tag-list-params";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parseTagListParams(await searchParams);
  const [{ policies }, cookieStore] = await Promise.all([getApplicationConfiguration(), cookies()]);
  const grants = tagGrants(policies);
  const view = resolveTagsView(params.view, grants.viewMyVerifications);
  const design = parseTagRowDesign(cookieStore.get(TAG_ROW_DESIGN_COOKIE)?.value);
  const listKey = [view, params.page, params.sort, params.issuedStartDate, params.issuedEndDate].join("|");

  return (
    <TagsView
      canViewVerifications={grants.viewMyVerifications}
      filterCount={countTravellerFilters(params)}
      issuedEndDate={params.issuedEndDate}
      issuedStartDate={params.issuedStartDate}
      sort={params.sort}
      view={view}
    >
      <Suspense
        fallback={view === "tags" ? <TagListSkeleton design={design} /> : <VerificationListSkeleton />}
        key={listKey}
      >
        {view === "tags" ? <TagListData design={design} params={params} /> : <VerificationListData />}
      </Suspense>
    </TagsView>
  );
}
```

  - Delete `tag-table-view.tsx` and `pending-verifications.tsx` with `git rm`.
  - Then run `grep -rn "tag-table-view\|pending-verifications\|Tags.Pagination" apps/ssr/src`. It should print nothing except possibly the en/tr `Tags.Pagination.PageInfo` entries, which stay.

- [ ] **Step 9: Run the gates and check by hand.**
  - Run `test:unit`, `type-check` and `lint` (0 errors).
  - Start dev detached. Signed in at 375 px, check `/en/tags`:
    - the search, the sort and the filter button;
    - the sheet: pick "Last 30 days", then "Show results" turns the button red with a 1;
    - Claim a tag;
    - the switch, if granted;
    - the cards, and the pager when there is more than one page.
  - Check the cookie designs:
    - Run `document.cookie = "tag-row-design=pill; path=/"`, reload, and see the flat rows with a bar.
    - Set `tinted` and see the washed rows.
    - Delete the cookie and see the cards again.
  - Check `/en/tags?view=verifications` and `/en/tags?page=999`. The second shows the no-match state with the pager.
  - Stop dev.

- [ ] **Step 10: Commit.** Stage every created, modified and deleted file by name, then commit:

```bash
git commit -q -F - <<'EOF'
feat(ssr): rebuild the Tags list as the app's card list

The table becomes the app's list in the design the tag-row-design cookie
picks: classic cards, compact pill rows or tinted rows. The toolbar gains
the app's page search, round sort button and filter sheet, and the claim
and upload buttons and the Tags | Verifications switch follow the app.
Each view fetches only its own data, behind a skeleton, and the blob pager
floats above the island.

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

### Task 5: Tag detail restyle (web-app)

**Files:**
- Create in `S/components/tag-detail/`: `detail-block.tsx`, `soft-badge.tsx` and `tag-detail-skeleton.tsx` (server-safe).
- Modify in `S/components/tag-detail/`: `tag-detail-sections.tsx`, `tag-identity-card.tsx`, `tag-deadline-card.tsx`, `tag-journey-card.tsx`, `tag-amounts-card.tsx`, `tag-purchase-card.tsx`, `tag-store-card.tsx` and `tag-traveller-card.tsx`.
- Modify `(main)/tags/[tagNumber]/page.tsx` and `_components/tag-details.tsx`.
- Create `(main)/tags/[tagNumber]/loading.tsx` and `_components/tag-detail-error.tsx`.
- Modify `(public)/tag/[slug]/_components/public-tag-details.tsx`, an interim change that keeps it compiling.

**Interfaces:**
- Produces:
  - `TagDetailSections({ tag, variant }: { tag: TagPublicDetail; variant: "detail" | "preview" })`. It replaces the `showTraveller` and `claim` props.
  - `DetailSection({ title, children })`
  - `CollapsibleBlock({ title, summary?, icon?, testId, children })`
  - `Field({ label, value, mono? })` and `FieldRow({ children })`
  - `SoftBadge({ tone, children, ...span props })`
  - `TagDetailSkeleton()`
- Every existing `data-testid` stays: `tag-number`, `tag-status`, `tag-headline-amount`, `tag-deadline`, `tag-journey`, `tag-purchase`, `tag-amounts`, `tag-amounts-net`, `tag-store` and `tag-traveller`.

- [ ] **Step 1: `soft-badge.tsx` and `detail-block.tsx`.**
  - **`soft-badge.tsx`:**

```tsx
import type { TagStatusTone } from "@/src/utils/tag/tag-status";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";

const TONE: Record<TagStatusTone, string> = {
  success: "border-success bg-success-surface text-success-strong",
  info: "border-info bg-info-surface text-info-strong",
  warning: "border-warning bg-warning-surface text-warning-strong",
  error: "border-error bg-error-surface text-error",
  neutral: "border-border bg-foreground/5 text-muted-foreground",
};

export function SoftBadge({ tone, className, ...props }: React.ComponentProps<"span"> & { tone: TagStatusTone }) {
  return (
    <span
      className={cn("inline-flex shrink-0 items-center self-start rounded-full border px-2.5 py-1 text-xs font-semibold", TONE[tone], className)}
      {...props}
    />
  );
}
```

  - **`detail-block.tsx`:**

```tsx
"use client";
import { IoChevronDown, IoChevronUp } from "@/src/components/shell/ionicons";
import { Surface } from "@/src/components/shell/surface";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@repo/ayasofyazilim-ui/components/collapsible";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import { useState, type ReactNode } from "react";

export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-0.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

export function CollapsibleBlock({
  title,
  summary,
  icon: Icon,
  testId,
  children,
}: {
  title: string;
  summary?: string | null;
  icon?: (props: { size?: number; className?: string }) => ReactNode;
  testId: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Surface className="overflow-hidden" data-testid={testId}>
      <Collapsible onOpenChange={setOpen} open={open}>
        <CollapsibleTrigger className="flex w-full items-center gap-2.5 px-4 py-3.5 text-left" data-testid={`${testId}-trigger`}>
          {Icon ? <Icon className="shrink-0 text-muted-foreground" size={18} /> : null}
          <span className="min-w-0 flex-1 text-base font-semibold text-foreground">{title}</span>
          {summary ? <span className="max-w-[45%] truncate text-right text-sm font-medium text-muted-foreground">{summary}</span> : null}
          {open ? <IoChevronUp className="shrink-0 text-muted-foreground" size={16} /> : <IoChevronDown className="shrink-0 text-muted-foreground" size={16} />}
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-3 border-t border-border px-4 pt-3.5 pb-4">{children}</CollapsibleContent>
      </Collapsible>
    </Surface>
  );
}

export function Field({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className={cn("text-base text-foreground", mono && "font-serial")}>{value}</span>
    </div>
  );
}

export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="flex gap-4 *:flex-1">{children}</div>;
}
```

- [ ] **Step 2: The identity card.**
  - The root becomes `<Surface className="relative overflow-hidden">`.
  - First child: `<span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-1", TAG_STATUS_RAIL[tagStatusTone(tag.status)])} />`, with `TAG_STATUS_RAIL` imported from `@/src/components/tags/status-classes`.
  - The content wrapper is `<div className="flex flex-col gap-3 py-4 pr-4 pl-[18px]">`.
  - **Top row** (`flex items-start justify-between gap-3`):
    - On the left, `<div className="flex min-w-0 flex-1 flex-col gap-0.5">` holding:
      - the caption `<p className="text-xs font-medium text-muted-foreground">` (`TagDetail.TagNumber`);
      - `<p className="truncate font-serial text-base font-semibold" data-testid="tag-number">`.
    - On the right, `<SoftBadge data-testid="tag-status" tone={tagStatusTone(tag.status)}>` with the status label.
  - **Headline:** `<div className="flex flex-col gap-0.5">` with:
    - `<p className="text-3xl font-bold" data-testid="tag-headline-amount">` holding the formatted amount, or `"—"` when it is null;
    - then the caption `<p className="text-xs font-medium text-muted-foreground">` (`tagHeadlineCaption(money)`).
  - Remove the `claim` prop and the `Card` and `Badge` imports.

- [ ] **Step 3: The deadline strip.** Keep its logic. Render:

```tsx
<Surface className={cn("flex items-center justify-between gap-3 p-4", SURFACE[deadline.tone])} data-testid="tag-deadline">
  <div className="flex min-w-0 flex-col gap-0.5">
    <p className="text-sm font-semibold text-foreground">{validateBy}</p>
    <p className={cn("text-xs font-medium", TEXT[deadline.tone])}>{countdownText}</p>
  </div>
  <SoftBadge tone={deadline.tone}>
    {t.SSRService[deadline.isOverdue ? "TagDetail.DeadlineOverdue" : "TagDetail.DeadlineLabel"]}
  </SoftBadge>
</Surface>
```

  - `validateBy` is the existing `TagDetail.DeadlineValidateBy` replace.
  - `SURFACE = { info: "border-info/40 bg-info-surface", warning: "border-warning/40 bg-warning-surface", error: "border-error/40 bg-error-surface" }`.
  - `TEXT = { info: "text-info-strong", warning: "text-warning-strong", error: "text-error" }`.
  - Drop `TONE_CLASS`, `CalendarClock` and `Card`.

- [ ] **Step 4: The journey.** Keep `stepLabelKey`, the steps, the hint logic and the UTC-until-mount formatting.
  - Wrap it: `<DetailSection title={t.SSRService["TagDetail.Progress"]}><Surface className="p-4" data-testid="tag-journey"><ol className="flex flex-col">…</ol></Surface></DetailSection>`. There is no `CardHeader`.
  - Each `<li className="flex gap-3">`:
    - The mark column is `<div className="flex w-[22px] shrink-0 flex-col items-center">`, holding the dot `<span className={cn("mt-1 flex size-[13px] items-center justify-center rounded-full", MARK[step.state])}>`.
      - `done` holds `<IoCheckmark className="text-white" size={9} />`; `failed` holds `<IoClose className="text-white" size={9} />`.
      - Below the dot, unless the step is last, the rail: `<span className={cn("mt-1 w-0.5 flex-1", step.state === "done" ? "bg-success" : "bg-border")} />`.
    - `MARK = { done: "bg-success", failed: "bg-error", current: "border-[2.5px] border-info bg-card", todo: "border-2 border-muted-foreground bg-card" }`.
    - The text column is `<div className={cn("flex-1", !isLast && "pb-4")}>`, holding:
      - the label `<p className={cn("text-base font-semibold", step.state === "todo" && "text-muted-foreground", step.state === "failed" && "text-error")}>`;
      - the date line and the hint, each `text-xs font-medium text-muted-foreground`.
  - Drop `Check`, `X` and the Card imports.

- [ ] **Step 5: The amounts.**
  - Wrap them: `<DetailSection title={t.SSRService["TagDetail.Amounts"]}><Surface className="flex flex-col gap-2.5 p-4" data-testid="tag-amounts">…</Surface></DetailSection>`.
  - A row is `flex items-baseline justify-between gap-3`, with:
    - the label `text-sm font-medium text-muted-foreground`, plus `pl-4` when nested;
    - the value `font-serial text-base text-foreground`, or `text-muted-foreground` for a deduction, keeping the `"− "` prefix.
  - The net row is `mt-1 flex items-baseline justify-between border-t border-foreground/10 pt-2.5 text-lg font-bold`. Its value keeps `data-testid="tag-amounts-net"`, with `font-serial`.
  - The notes stay `text-xs text-muted-foreground`.

- [ ] **Step 6: Purchase.**
  - Wrap it: `<DetailSection title={t.SSRService["TagDetail.Purchase"]}><div className="flex flex-col gap-2" data-testid="tag-purchase">…</div></DetailSection>`.
  - Each invoice is `<CollapsibleBlock icon={IoReceiptOutline} key={invoice.number ?? index} summary={formatMoney(invoice.totalAmount, invoice.currency, lang)} testId={`tag-invoice-${invoice.number ?? index}`} title={…the existing InvoiceNumber / InvoiceUnnumbered text…}>`. It is closed by default, as in the app.
  - Its body holds, in order:
    - `<FieldRow><Field label={t.SSRService["TagDetail.TotalType.VatAmount"]} value={formatMoney(invoice.vatAmount, invoice.currency, lang)} /><Field label={t.SSRService["Tags.IssueDateFilter"]} value={formatDay(invoice.issueDate, lang, isClient ? undefined : "UTC")} /></FieldRow>`;
    - then the lines, or `NoInvoiceLines`.
  - A line is `<li className="flex items-start justify-between gap-3">`:
    - On the left, the description (`text-sm text-foreground`) over "Net {amount}" (`text-xs text-muted-foreground`).
    - On the right, `<SoftBadge tone="neutral">VAT n%</SoftBadge>` and the amount (`font-serial text-sm font-semibold`).
  - Drop `Card` and the old `Collapsible` usage.

- [ ] **Step 7: Store and Traveller become blocks.**
  - **`tag-store-card.tsx`:**

```tsx
<CollapsibleBlock icon={IoStorefrontOutline} summary={merchant.name} testId="tag-store" title={t.SSRService["TagDetail.Store"]}>
  <Field label={t.SSRService["TagDetail.StoreName"]} value={merchant.name} />
  <Field label={t.SSRService["TagDetail.Address"]} value={merchant.address} />
</CollapsibleBlock>
```

  - **`tag-traveller-card.tsx`:**

```tsx
<CollapsibleBlock icon={IoPersonOutline} summary={name || undefined} testId="tag-traveller" title={t.SSRService["TagDetail.Traveller"]}>
  <Field label={t.SSRService["TagDetail.FullName"]} value={name} />
  <Field label={t.SSRService["TagDetail.DocumentNumber"]} mono value={traveller.travellerDocumentNumber} />
  <FieldRow>
    <Field label={t.SSRService["TagDetail.Nationality"]} value={traveller.nationality} />
    <Field label={t.SSRService["TagDetail.Residence"]} value={traveller.residenceCountryName} />
  </FieldRow>
</CollapsibleBlock>
```

- [ ] **Step 8: Sections, the page and its states.**
  - **`tag-detail-sections.tsx`:**

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import type { UniRefund_TagService_Tags_TagPublicDetailDto as TagPublicDetail } from "@repo/saas/TagService";
import { DetailSection } from "./detail-block";
import { TagAmountsCard } from "./tag-amounts-card";
import { TagDeadlineCard } from "./tag-deadline-card";
import { TagIdentityCard } from "./tag-identity-card";
import { TagJourneyCard } from "./tag-journey-card";
import { TagPurchaseCard } from "./tag-purchase-card";
import { TagStoreCard } from "./tag-store-card";
import { TagTravellerCard } from "./tag-traveller-card";

// "preview" is the app's scan preview: no progress, and never the traveller.
export function TagDetailSections({ tag, variant }: { tag: TagPublicDetail; variant: "detail" | "preview" }) {
  const { t } = useTranslations();
  return (
    <div className="flex flex-col gap-4">
      <TagIdentityCard tag={tag} />
      <TagDeadlineCard tag={tag} />
      {variant === "detail" ? <TagJourneyCard tag={tag} /> : null}
      <TagAmountsCard tag={tag} />
      <TagPurchaseCard invoices={tag.invoices} />
      <DetailSection title={t.SSRService["TagDetail.Details"]}>
        <div className="flex flex-col gap-2">
          {variant === "detail" ? <TagTravellerCard traveller={tag.traveller} /> : null}
          <TagStoreCard merchant={tag.merchant} />
        </div>
      </DetailSection>
    </div>
  );
}
```

  - **`_components/tag-details.tsx`:** use `<TabPage>`, without `wide`, and `<TagDetailSections tag={tagsResponse} variant="detail" />`.
  - **`_components/tag-detail-error.tsx`:**

```tsx
"use client";
import { PageHeader } from "@/src/components/shell/page-header";
import { IoAlertCircleOutline } from "@/src/components/shell/ionicons";
import { TabPage } from "@/src/components/shell/tab-page";
import { useTranslations } from "@/src/providers/i18n";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import { useParams, useRouter } from "next/navigation";

export function TagDetailError({ status }: { status?: number }) {
  const { t } = useTranslations();
  const { lang } = useParams<{ lang: string }>();
  const router = useRouter();
  return (
    <TabPage>
      <PageHeader backHref={`/${lang}/tags`} title={t.SSRService["Tags.DetailsTitle"]} />
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center" data-testid="tag-detail-error">
        <IoAlertCircleOutline className="text-muted-foreground" size={48} />
        <p className="text-lg font-semibold text-foreground">{t.SSRService["Tags.LoadFailed"]}</p>
        <p className="text-sm text-muted-foreground">{t.SSRService["Tags.LoadFailedDescription"]}</p>
        {status === 403 ? null : (
          <Button data-testid="tag-detail-retry" onClick={() => router.refresh()}>
            {t.SSRService["Tags.Retry"]}
          </Button>
        )}
      </div>
    </TabPage>
  );
}
```

  - **`[tagNumber]/page.tsx`:** replace the `ErrorComponent` return with `return <TagDetailError status={apiRequests.status} />;`. Remove the `getTranslations` and `ErrorComponent` imports if they become unused.
  - **`tag-detail-skeleton.tsx`** (server-safe):

```tsx
import { Skeleton } from "@repo/ayasofyazilim-ui/components/skeleton";

export function TagDetailSkeleton() {
  return (
    <div className="flex flex-col gap-4" data-testid="tag-detail-skeleton">
      <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-3 w-44" />
      </div>
      {[0, 1, 2].map((block) => (
        <div className="flex flex-col gap-2" key={block}>
          <Skeleton className="h-3 w-20" />
          <div className="flex flex-col gap-2.5 rounded-md border border-border bg-card p-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
```

  - **`[tagNumber]/loading.tsx`:**

```tsx
import { TagDetailSkeleton } from "@/src/components/tag-detail/tag-detail-skeleton";
import { TabPage } from "@/src/components/shell/tab-page";

export default function Loading() {
  return (
    <TabPage>
      <div className="mb-4 h-10" />
      <TagDetailSkeleton />
    </TabPage>
  );
}
```

  - **Interim `public-tag-details.tsx`** (Task 6 rewrites it): pass `variant="preview"` in place of `showTraveller={false}` and `claim={…}`. Render the existing `ClaimTagButton` below the sections when `claimProps` is set: `<div className="mt-4">{claimProps ? <ClaimTagButton … /> : null}</div>`.

- [ ] **Step 9: Run the gates and check by hand.**
  - Run `test:unit`, `type-check` and `lint` (0 errors).
  - Start dev detached. Signed in, open a tag from `/en/tags` at 375 px and at 1280 px. Check:
    - one column;
    - the identity rail;
    - the deadline strip, when it applies;
    - PROGRESS dots;
    - AMOUNTS;
    - PURCHASE blocks opening and closing;
    - DETAILS with Traveller and Store;
    - back to `/en/tags`.
  - `/en/tags/NOPE-0000` shows the error state.
  - Stop dev.

- [ ] **Step 10: Commit.** Stage every file by name, then commit:

```bash
git commit -q -F - <<'EOF'
feat(ssr): restyle tag detail as the app's single column

The identity card gains the status rail and a soft badge, the deadline
strip the app's tinted surface, and progress, amounts, purchase and
details sit under the app's section labels. Invoices, the traveller and
the store become collapsible blocks. A loading skeleton and the app's
error state, without Retry on a 403, replace the generic error page.

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

### Task 6: Public QR page as the scan preview (web-app)

**Files:**
- Modify:
  - `(public)/tag/[slug]/page.tsx`
  - `_components/public-tag-details.tsx` (rewritten)
- Create in `(public)/tag/[slug]/_components/`: `preview-action-button.tsx` and `preview-note.tsx`.
- Delete (`git rm`):
  - `(public)/tag/[slug]/claim-props.ts` and `claim-props.test.ts`, which are replaced by Task 1's `tag-kind.ts`;
  - `_components/claim-tag-button.tsx`.

**Interfaces:**
- Consumes:
  - from Task 1: `deriveTagKind`, `previewActionFor`, `PreviewAction`, `TagKind`, `claimSalesAmount`;
  - from Task 4: `PinnedBar` and `TabPage({ pinnedBar })`;
  - from Task 5: `TagDetailSections({ variant: "preview" })`;
  - the existing `publicTagView`, `decodeTagSlug` and `tagGrants().claim`.

- [ ] **Step 1: `preview-note.tsx`:**

```tsx
"use client";
import { IoCheckmarkCircleOutline, IoPricetagOutline, IoWarningOutline } from "@/src/components/shell/ionicons";
import { useTranslations } from "@/src/providers/i18n";
import type { TagKind } from "@/src/utils/tag/tag-kind";

const NOTE = {
  draft: { icon: IoPricetagOutline, key: "TagPreview.DraftInfo" },
  issued: { icon: IoCheckmarkCircleOutline, key: "TagPreview.IssuedInfo" },
  divergent: { icon: IoWarningOutline, key: "TagPreview.DivergentInfo" },
} as const;

export function PreviewNote({ kind }: { kind: TagKind }) {
  const { t } = useTranslations();
  const { icon: Icon, key } = NOTE[kind];
  return (
    <div className="flex items-start gap-3 rounded-md bg-foreground/5 p-4" data-testid="tag-preview-note">
      <Icon className="shrink-0 text-primary" size={22} />
      <p className="flex-1 text-sm leading-5 text-muted-foreground">{t.SSRService[key]}</p>
    </div>
  );
}
```

- [ ] **Step 2: `preview-action-button.tsx`.** Claiming keeps today's call and refresh, and adds the app's toasts.

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import type { PreviewAction } from "@/src/utils/tag/tag-kind";
import { postTagTravellerSelfAssignApi } from "@repo/actions/unirefund/TagService/post-actions";
import { Button, buttonVariants } from "@repo/ayasofyazilim-ui/components/button";
import { toast } from "@repo/ayasofyazilim-ui/components/sonner";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTransition } from "react";

const BUTTON = "h-12 w-full text-base";

export function PreviewActionButton({
  action,
  tagNumber,
  salesAmount,
  loginToClaimUrl,
  loginToViewUrl,
}: {
  action: PreviewAction;
  tagNumber: string;
  salesAmount: number;
  loginToClaimUrl: string;
  loginToViewUrl: string;
}) {
  const { t } = useTranslations();
  const { lang } = useParams<{ lang: string }>();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (action === "loginToClaim" || action === "loginToView" || action === "viewInMyTags") {
    const link = ({
      loginToClaim: { href: loginToClaimUrl, key: "TagPreview.LoginToClaim", id: "preview-action-login-to-claim" },
      loginToView: { href: loginToViewUrl, key: "TagPreview.LoginToView", id: "preview-action-login-to-view" },
      viewInMyTags: { href: `/${lang}/tags/${encodeURIComponent(tagNumber)}`, key: "TagPreview.ViewInMyTags", id: "preview-action-view" },
    } as const)[action];
    return (
      <Link className={cn(buttonVariants({ size: "lg" }), BUTTON)} data-testid={link.id} href={link.href}>
        {t.SSRService[link.key]}
      </Link>
    );
  }

  return (
    <Button
      className={BUTTON}
      data-testid="preview-action-claim"
      disabled={isPending}
      onClick={() => {
        startTransition(() => {
          void postTagTravellerSelfAssignApi({ requestBody: { tagNumber, salesAmount } }).then((res) => {
            if (res.type === "success") {
              toast.success(t.SSRService["TagPreview.ClaimSuccess"]);
              router.refresh();
            } else {
              toast.error(t.SSRService["TagPreview.ClaimError"]);
            }
          });
        });
      }}
      size="lg"
    >
      {t.SSRService["TagPreview.Claim"]}
    </Button>
  );
}
```

- [ ] **Step 3: `public-tag-details.tsx`** (rewrite):

```tsx
"use client";
import { PageHeader } from "@/src/components/shell/page-header";
import { PinnedBar } from "@/src/components/shell/pinned-bar";
import { TabPage } from "@/src/components/shell/tab-page";
import { TagDetailSections } from "@/src/components/tag-detail/tag-detail-sections";
import { useTranslations } from "@/src/providers/i18n";
import type { PreviewAction, TagKind } from "@/src/utils/tag/tag-kind";
import type { UniRefund_TagService_Tags_TagPublicDetailDto } from "@repo/saas/TagService";
import { useParams } from "next/navigation";
import { PreviewActionButton } from "./preview-action-button";
import { PreviewNote } from "./preview-note";

export default function PublicTagDetails({
  data,
  kind,
  action,
  salesAmount,
  loginToClaimUrl,
  loginToViewUrl,
}: {
  data: UniRefund_TagService_Tags_TagPublicDetailDto;
  kind: TagKind;
  action: PreviewAction | null;
  salesAmount: number;
  loginToClaimUrl: string;
  loginToViewUrl: string;
}) {
  const { lang } = useParams<{ lang: string }>();
  const { t } = useTranslations();
  return (
    <TabPage pinnedBar={action !== null}>
      <PageHeader backHref={`/${lang}`} title={t.SSRService["TagPreview.Title"]} />
      <div className="flex flex-col gap-4">
        <TagDetailSections tag={data} variant="preview" />
        <PreviewNote kind={kind} />
      </div>
      {action ? (
        <PinnedBar testId="tag-preview-action-bar">
          <PreviewActionButton
            action={action}
            loginToClaimUrl={loginToClaimUrl}
            loginToViewUrl={loginToViewUrl}
            salesAmount={salesAmount}
            tagNumber={data.tagNumber}
          />
        </PinnedBar>
      ) : null}
    </TabPage>
  );
}
```

- [ ] **Step 4: The slug page.** In `(public)/tag/[slug]/page.tsx`:
  - **Imports:**
    - Replace `import { claimPropsFor } from "./claim-props";` with `import { claimSalesAmount, deriveTagKind, previewActionFor } from "@/src/utils/tag/tag-kind";`.
    - Add `import { PageHeader } from "@/src/components/shell/page-header";`, `import { TabPage } from "@/src/components/shell/tab-page";` and `import { IoAlertCircleOutline } from "@/src/components/shell/ionicons";`.
    - Drop the `Alert*` and `AlertCircle` imports.
  - **After `canClaim`:**

```tsx
const signedIn = !!session?.user;
const loginToViewUrl = `/${lang}/login?redirectTo=${encodeURIComponent(`/${lang}/tags`)}`;
// The kind is read before publicTagView strips the traveller; only the kind crosses.
const preview = (tag: TagPublicDetail) => {
  const kind = deriveTagKind(tag);
  return (
    <PublicTagDetails
      action={previewActionFor(kind, { signedIn, canClaim })}
      data={publicTagView(tag)}
      kind={kind}
      loginToClaimUrl={loginUrl}
      loginToViewUrl={loginToViewUrl}
      salesAmount={claimSalesAmount(tag.totals)}
    />
  );
};
```

  - **The three branches:** each success return becomes `return preview(result.data);`. That covers the sticker branch, the tag-number-plus-document branch and the tag-id branch.
  - **`LookupFailed`:** replace it with:

```tsx
/** Shown when a slug named a tag that could not be read. */
function LookupFailed({ lang, onSticker, t }: { lang: string; onSticker: boolean; t: Translations }) {
  return (
    <TabPage>
      <PageHeader backHref={`/${lang}`} title={t.SSRService["TagPreview.Title"]} />
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center" data-testid="tag-preview-not-found">
        <IoAlertCircleOutline className="text-muted-foreground" size={48} />
        <p className="text-muted-foreground">
          {t.SSRService[onSticker ? "TagPreview.NoTagOnSticker" : "TagPreview.NotFound"]}
        </p>
        <Link
          className="text-sm font-medium text-primary underline underline-offset-4"
          data-testid="try-again-link"
          href={`/${lang}/tag`}
        >
          {t.SSRService["TryAgain"]}
        </Link>
      </div>
    </TabPage>
  );
}
```

  - **Its call sites:** they become `<LookupFailed lang={lang} onSticker t={t} />` in the sticker branch and `<LookupFailed lang={lang} onSticker={false} t={t} />` in the other two. `readTag`'s `message` is no longer shown, so `readTag` may return `{ ok: false }` without it. Keep its shape if that is simpler.
  - **Clean up:** run `git rm` on `claim-props.ts`, `claim-props.test.ts` and `_components/claim-tag-button.tsx`. Then run `grep -rn "claimPropsFor\|ClaimTagButton\|claim-props" apps/ssr/src`, which should print nothing.

- [ ] **Step 5: Run the gates and check by hand.**
  - Run `test:unit` (the count drops by `claim-props`' 5 cases and gains none), `type-check` and `lint` (0 errors).
  - Start dev detached. Using `curl` with no cookie:
    - `/tag/<slug of a real issued tag>` redirects to `/en/tag/<slug>`;
    - `/en/tag/<slug>` renders "Tax-Free Tag" and the issued note, with `preview-action-login-to-view`;
    - its HTML contains no traveller document number.
  - Check `/en/tag/garbage` shows the not-found or prefilled-form path.
  - Signed in, the same slug shows "View in my tags".
  - **Do not press any Claim button.**
  - Stop dev.

- [ ] **Step 6: Commit.** Stage every file by name, then commit:

```bash
git commit -q -F - <<'EOF'
feat(ssr): turn the public QR page into the app's scan preview

/tag/<slug> keeps its URL and lookups but becomes the app's preview: the
identity, deadline, amounts, purchase and store sections, a note that
says whether the tag is unclaimed, already linked or mismatched, and one
action pinned above the island (claim, log in to claim, view in my
tags, or log in to see your tags). The kind is decided on the server
before the traveller is stripped, so no traveller data reaches the
browser.

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

### Task 7: Gates, manual pass, push and PR (controller)

- [ ] **Step 1: Gates on the branch head.**
  - Run `test:unit`, `type-check`, `lint` and `pnpm --filter web type-check`.
  - With no dev server up, run `pnpm --filter ssr build`.
  - Record the numbers in the ledger.
- [ ] **Step 2: Manual pass.** Start ssr dev detached. Check at 375 px and 1280 px, using a client that is not logged in as the same traveller anywhere else:
  - Home, signed in and signed out;
  - Tags in all three cookie designs, plus search, sort, the filter sheet, the pager and the switch;
  - detail;
  - the public page, signed out and signed in.

  Record anything unverified. Then stop dev and its `node.exe` children.
- [ ] **Step 3: Push and open the PR.**
  - Run `git push -u origin feat/ssr-visual-parity-home-tags`.
  - Open a PR into `feat/ssr-visual-parity-shell` with the repo's PR template, and say it is stacked on #312.
  - Keep vulnerability detail out of the body.
  - End the body with the attribution line.

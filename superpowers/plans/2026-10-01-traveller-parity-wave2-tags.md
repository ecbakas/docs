# Traveller Parity — Wave 2 (Tags) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the traveller tag experience equivalent in web `apps/ssr` and `super-app`:
- ssr catches up to super-app's tag detail, public tag page, list and validate results;
- super-app gains typed claim and a claim grant gate.

**Architecture:**
- super-app's pure tag logic (deadline, journey, amounts, status tone and headline, date presets) is ported into ssr as plain `.ts` modules, with its tests converted to ssr's Node `test:unit`.
- ssr's detail and public pages share one set of section components built on that logic.
- super-app work is confined to its claim paths and a new grant hook.

**Tech Stack:**
- ssr: Next.js 16, React 19, `@repo/ayasofyazilim-ui` (shadcn), `node:test` + tsx.
- super-app: Expo 54 / RN 0.81, NativeWind, zustand, jest (`node` + `router` projects).

**Spec:** `C:\unirefund\docs\superpowers\specs\2026-10-01-traveller-parity-wave2-tags-design.md` (roadmap: `2026-09-30-traveller-parity-roadmap.md`, same folder).

## Global Constraints

**Checkouts**
- **ssr:** worktree `C:\unirefund\web-app-wt-traveller-parity`, new branch `feat/traveller-parity-tags` from `origin/main` (`5deb213e5`). Never touch `C:\unirefund\web-app`.
- **super-app:** `C:\unirefund\super-app`, new branch `feat/traveller-parity-tags` stacked on `feat/traveller-web-parity` (`a612717`, PR #64). This checkout is **shared** with other sessions.

**Git**
- Run `git branch --show-current` before every commit.
- Stage explicit paths only. Never `git add -A`/`.`, `git stash`, `git reset --hard`, or a branch switch.
- Commit with a heredoc (`git commit -q -F - <<'EOF' … EOF`), with no backticks or backslashes inside.
- End each message with a `Co-Authored-By:` trailer naming your model.
- **Implementers never push.** The controller pushes the ssr branch right after Task 1 (spec: push early) and both branches at the end.

**Grants**
- Every action is gated by its endpoint's group + leaf grant. A control without its grant is not rendered.
- Claim is `TagService.Tags` + `TagService.Tags.TravellerSelfAssign`.

**Decisions (user)**
- Rows lead with the **purchase amount**, picked in one helper (`tagHeadlineAmount`, default preference `"purchase"`).
- The anonymous public page **hides the traveller block**.
- Number-plus-passport lookup is **not linked** in either app: super-app's `SHOW_MANUAL_ENTRY_LINK` stays `false`, and ssr's navbar `/tag` link goes.

**Plan ruling (deviation from the spec text, flagged to the user)**
- The tag-list URL carries the issue-date range as `issuedStartDate=YYYY-MM-DD&issuedEndDate=YYYY-MM-DD`, **computed in the browser**, not as a preset name. A preset resolved on the server picks "today" in the server's timezone.
- The selector shows which preset the dates correspond to (`rangeToPreset`).

**ssr**
- Never run `next build`. ssr dev runs on `:3010` from the worktree; leave it running.
- New `SSRService` strings go in both `apps/ssr/src/language-data/unirefund/SSRService/resources/en.json` and `tr.json`, as flat keys with `{0}`-style placeholders. Then run `pnpm --filter ssr run init` (it needs the network) before type-checking.
- Never commit the generated `i18n/*.gen.json`, and leave `packages/utils/policies/policies.json` unstaged.
- Before adding a key, grep both files for it. Never create a duplicate JSON key.

**super-app**
- Never run native builds or touch Metro (8095).
- Render tests are named `*.router.test.ts(x)`.
- After adding an i18n key, run `npm run init`.
- In a `jest.mock` factory, never name a `require("react")` binding `react` if it calls `.createElement`; use `ReactLib`, or NativeWind's babel plugin breaks the load.

**Comments:** rare and short.

**Test account (dev):** `tur-a25y29041` / `1q2w3E*`.

## Review Focus

1. **A traveller in UTC+3 picks "Today" at 00:30 local time.** They must get their local today, not the server's yesterday. Pinned in Task 4: `presetToRange` uses the `now` it is given, and `parseTagListParams` passes valid dates through unchanged.
2. **A tampered or half URL** (`issuedStartDate` with no end, `2026-13-40`, end before start, `sort=evil`, `page=-3`, extra params) falls back to the defaults and never reaches the API. Pinned in Task 4.
3. **An older tag with no `SalesAmount` total** shows the gross refund as its headline, with a caption that says so, instead of a blank or crash. Pinned in Task 1 (`tagHeadlineAmount`, `tagHeadlineCaption`).
4. **A scan where every tag was already validated** shows the "Already validated" group, not "No tags". Pinned in Task 5 (`scanResultCounts`).
5. **A Turkish traveller types `1.234,56`** and it parses as `1234.56`; an English traveller's `1,234.56` gives the same. A negative or empty amount is refused. Pinned in Task 7 (`parseSalesAmount`).

---

## Task 0: Branches and baselines (controller)

**Files:** none.

- [ ] **Step 1: ssr branch and baseline**

```bash
cd /c/unirefund/web-app-wt-traveller-parity
git fetch -q origin && git status --short          # expect empty
git switch -c feat/traveller-parity-tags origin/main
git -C packages/utils rev-parse --short HEAD        # expect 491ff3a
pnpm --filter ssr test:unit 2>&1 | grep -E "^# (tests|pass|fail)"   # expect 41 / 41 / 0
pnpm --filter ssr type-check > /tmp/tc.log 2>&1; echo "exit=$?"     # expect 0
pnpm --filter ssr lint 2>&1 | grep problems                         # expect 0 errors / 459 warnings
```

- [ ] **Step 2: super-app branch and baseline**

```bash
cd /c/unirefund/super-app
git branch --show-current          # expect feat/traveller-web-parity
git status --short | head          # note foreign files; leave them alone
git switch -c feat/traveller-parity-tags
npm run typecheck 2>&1 | grep -c "error TS"   # expect 1 (tabBackNavigation.router.test.tsx:119)
npx jest 2>&1 | grep -E "^(Test Suites|Tests):"   # expect 297 suites; 3080 pass / 1 skipped
```

---

## Task 1: Port super-app's tag logic into ssr

**Files:**
- Create: `apps/ssr/src/utils/tag/tag-status.ts` and `tag-status.test.ts`
- Create: `apps/ssr/src/utils/tag/tag-deadline.ts` and `tag-deadline.test.ts`
- Create: `apps/ssr/src/utils/tag/tag-journey.ts` and `tag-journey.test.ts`
- Create: `apps/ssr/src/utils/tag/tag-amounts.ts` and `tag-amounts.test.ts`
- Create: `apps/ssr/src/utils/tag/tag-date-range.ts` and `tag-date-range.test.ts`

All paths are relative to `C:\unirefund\web-app-wt-traveller-parity`. The sources are in `C:\unirefund\super-app\src\utils\` (read-only for you).

**Interfaces (Produces):**
- **`tag-status.ts`:**
  - `type TagStatusTone = "success" | "info" | "warning" | "error" | "neutral"`
  - `tagStatusTone(status: UniRefund_TagService_Tags_TagStatusType): TagStatusTone`
  - `type HeadlineAmountPreference = "purchase" | "refund"`
  - `interface HeadlineMoney { refundAmount?: number | null; refund?: number | null; grossRefund?: number | null; salesAmount?: number | null }`
  - `tagHeadlineAmount(tag: HeadlineMoney, prefer?: HeadlineAmountPreference): number | null`
  - `tagHeadlineAmountKind(tag: HeadlineMoney, prefer?: HeadlineAmountPreference): "refund" | "purchase" | null`
  - `tagHeadlineCaption(tag: HeadlineMoney, prefer?: HeadlineAmountPreference): "TagDetail.HeadlineRefund" | "TagDetail.HeadlineRefundEstimate" | "TagDetail.HeadlinePurchase" | "TagDetail.HeadlinePurchasePending" | "TagDetail.HeadlineNoAmount"`
- **`tag-deadline.ts`:**
  - `TagDeadlineKind`, `TagDeadlineTone`, `TagDeadline`, `TagDeadlineInput`
  - `tagDeadline(tag: TagDeadlineInput, now?: Date): TagDeadline | null`
  - `deadlineCountdown(d: TagDeadline): { kind: "overdue"; days: number } | { kind: "lastDay" } | { kind: "daysLeft"; days: number }`
- **`tag-journey.ts`:** `TagJourneyStepId`, `TagJourneyState`, `TagJourneyStep`, `TagJourneyInput`, and `tagJourneySteps(tag: TagJourneyInput): TagJourneyStep[]`.
- **`tag-amounts.ts`:**
  - `TagTotalLike`, `TagAmountRow`, `TagAmounts`
  - `interface MoneyFields { refund?: number | null; grossRefund?: number | null }`
  - `tagAmountRows(totals): TagAmounts`
  - `totalsToMoneyFields(totals): Required<MoneyFields> & { salesAmount: number | null }`
  - `totalLabelKey(t: UniRefund_TagService_Tags_TotalType): \`TagDetail.TotalType.${UniRefund_TagService_Tags_TotalType}\``
- **`tag-date-range.ts`:**
  - `type TagDatePreset = "all" | "today" | "week" | "month" | "120days"`
  - `TAG_DATE_PRESETS: readonly { value: TagDatePreset; labelKey: "Tags.DateAll" | "Tags.DateToday" | "Tags.DateWeek" | "Tags.DateMonth" | "Tags.Date120Days" }[]`
  - `presetToRange(preset, now?: Date): { start?: string; end?: string }`
  - `rangeToPreset(start?, end?, now?: Date): TagDatePreset`

**Porting rules (apply to every module):**
1. Copy the source file's code **verbatim**, then make only the listed edits.
2. Replace `from "@/saas/TagService"` with `from "@repo/saas/TagService"` (always `import type`).
3. Drop the long docblocks. Keep at most a one-line comment where the logic is non-obvious.
4. Convert the source's jest test into `node:test`, with **the same cases**, for the functions that were ported:
   - `import { describe, it } from "node:test"; import assert from "node:assert/strict";`
   - `expect(a).toBe(b)` becomes `assert.equal(a, b)`
   - `expect(a).toEqual(b)` becomes `assert.deepEqual(a, b)`
   - `expect(a).toBeNull()` becomes `assert.equal(a, null)`
   - `expect(a).toBeUndefined()` becomes `assert.equal(a, undefined)`
   - `expect(a).toContain(x)` becomes `assert.ok(a.includes(x))`
   - `expect(a).toHaveLength(n)` becomes `assert.equal(a.length, n)`
   - `expect(a).toMatchObject({ k: v, … })` becomes `assert.deepEqual({ k: a?.k, … }, { k: v, … })`, listing exactly the matched keys. For a `Date` field, compare `.getTime()`.
   - Imports of the module under test become relative (`./tag-deadline`).
   - Drop cases for functions that were not ported.

**Per-module edits:**
- **`tag-status.ts`** (from `tagStatus.ts`): port **only** `TagStatusTone`, the `TONE_BY_STATUS` table, `tagStatusTone`, `HeadlineAmountPreference`, the `HeadlineMoney` interface, `refundFigure`, `tagHeadlineAmount` and `tagHeadlineAmountKind`. Drop the class maps, label keys and risk helpers. Then add:

```ts
// Captions say what the figure is. The headline defaults to the purchase, which
// is shown even once the refund is known, so "Purchase" is captioned as such
// rather than as "refund not calculated yet".
export function tagHeadlineCaption(
  tag: HeadlineMoney,
  prefer: HeadlineAmountPreference = "purchase"
) {
  const kind = tagHeadlineAmountKind(tag, prefer);
  if (kind === "refund") {
    return tag.refund != null || tag.refundAmount != null
      ? ("TagDetail.HeadlineRefund" as const)
      : ("TagDetail.HeadlineRefundEstimate" as const);
  }
  if (kind === "purchase") {
    return refundFigure(tag) != null
      ? ("TagDetail.HeadlinePurchase" as const)
      : ("TagDetail.HeadlinePurchasePending" as const);
  }
  return "TagDetail.HeadlineNoAmount" as const;
}
```

  Tests: port the `tagStatusTone`, `tagHeadlineAmount` and `tagHeadlineAmountKind` cases from `__tests__/tagStatus.test.ts`, and add:

```ts
describe("tagHeadlineCaption", () => {
  it("captions a purchase plainly once a refund is known", () => {
    assert.equal(tagHeadlineCaption({ salesAmount: 100, grossRefund: 15 }), "TagDetail.HeadlinePurchase");
  });
  it("says the refund is pending when only the purchase is known", () => {
    assert.equal(tagHeadlineCaption({ salesAmount: 100 }), "TagDetail.HeadlinePurchasePending");
  });
  it("falls back to an estimated refund on a tag with no purchase total", () => {
    assert.equal(tagHeadlineCaption({ grossRefund: 15 }), "TagDetail.HeadlineRefundEstimate");
    assert.equal(tagHeadlineAmount({ grossRefund: 15 }), 15);
  });
  it("captions a priced refund as the refund", () => {
    assert.equal(tagHeadlineCaption({ refund: 12 }), "TagDetail.HeadlineRefund");
  });
  it("says nothing is calculated when there is no figure", () => {
    assert.equal(tagHeadlineCaption({}), "TagDetail.HeadlineNoAmount");
  });
});
```

- **`tag-deadline.ts`** (from `tagDeadline.ts`): verbatim. Then add the countdown rule that super-app's `TagDeadlineCard.tsx` and `TagCard.tsx` both use:

```ts
export function deadlineCountdown(d: TagDeadline) {
  if (d.isOverdue) return { kind: "overdue" as const, days: Math.abs(d.daysLeft) };
  if (d.daysLeft <= 1) return { kind: "lastDay" as const };
  return { kind: "daysLeft" as const, days: d.daysLeft };
}
```

  Tests: all cases from `__tests__/tagDeadline.test.ts`, plus:

```ts
describe("deadlineCountdown", () => {
  const base = { kind: "exportValidation" as const, date: new Date(), tone: "warning" as const };
  it("counts overdue days as a positive number", () => {
    assert.deepEqual(deadlineCountdown({ ...base, daysLeft: -3, isOverdue: true }), { kind: "overdue", days: 3 });
  });
  it("calls one day left the last day", () => {
    assert.deepEqual(deadlineCountdown({ ...base, daysLeft: 1, isOverdue: false }), { kind: "lastDay" });
  });
  it("counts the days left otherwise", () => {
    assert.deepEqual(deadlineCountdown({ ...base, daysLeft: 9, isOverdue: false }), { kind: "daysLeft", days: 9 });
  });
});
```

- **`tag-journey.ts`** (from `tagJourney.ts`): verbatim, with all of its tests.
- **`tag-amounts.ts`** (from `tagAmounts.ts`): port `TagTotalLike`, `TagAmountRow`, `TagAmounts`, `DISPLAY_ORDER`, `DEDUCTIONS`, `NESTED`, `tagAmountRows` and `totalsToMoneyFields`. Make these edits:
  - define `MoneyFields` inline, instead of importing it from `tagMoney`;
  - make `totalLabelKey` return `` `TagDetail.TotalType.${totalType}` `` with that template-literal return type;
  - drop `earningLabelKey`.
  - Tests: port every case except `earningLabelKey` ones, and update `totalLabelKey` expectations to the new prefix.
- **`tag-date-range.ts`** (from `tagDateRange.ts`): `customsTags` is not ported, so inline its three helpers here, verbatim from `customsTags.ts`:
  - `toLocalDateString` (`:459-463`)
  - `customsTodayRange` (`:473-483`)
  - `customsPresetRange` (`:507-519`, with `CUSTOMS_TRAVELLER_DAYS = 120`)

  Then make these edits:
  - define `TagDatePreset` directly as the five-value union;
  - change the label keys to `Tags.DateAll`, `Tags.DateToday`, `Tags.DateWeek`, `Tags.DateMonth`, `Tags.Date120Days`;
  - keep `presetToRange` and `rangeToPreset` verbatim.

  Tests: every case from `__tests__/tagDateRange.test.ts`, plus:

```ts
it("windows 'today' on the caller's local date, not UTC's", () => {
  // 00:30 local on 24 Sep. In any zone east of UTC that instant is still 23 Sep in UTC.
  const justAfterMidnight = new Date(2026, 8, 24, 0, 30);
  assert.deepEqual(presetToRange("today", justAfterMidnight), { start: "2026-09-24", end: "2026-09-25" });
});
```

- [ ] **Step 1: Write all five test files first.** Apply the porting rules, then run them:

```bash
cd /c/unirefund/web-app-wt-traveller-parity
pnpm --filter ssr test:unit 2>&1 | grep -E "^# (tests|pass|fail)|not ok|Cannot find" | head -20
```
Expected: the new suites fail with module-not-found for `./tag-*`, and the 41 existing tests still pass.

  If a single-file run with a bracketed path reports `0 tests`, that's the known Node glob quirk, not a pass; use the `test:unit` glob.

- [ ] **Step 2: Write the five modules per the rules above.**

- [ ] **Step 3: Run the tests**

```bash
pnpm --filter ssr test:unit 2>&1 | grep -E "^# (tests|pass|fail)"
pnpm --filter ssr type-check > /tmp/tc.log 2>&1; echo "exit=$?"; grep "error TS" /tmp/tc.log | head
pnpm --filter ssr lint 2>&1 | grep problems
```
Expected: everything passes with 0 failures, type-check exits 0, and lint shows 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/ssr/src/utils/tag/
git status --short   # only apps/ssr/src/utils/tag/* staged
git branch --show-current   # feat/traveller-parity-tags
git commit -q -F - <<'EOF'
feat(ssr): port super-app's tag deadline, journey, amounts and date logic

Plain modules with their super-app tests converted to node:test, so the
web and the app derive a traveller's deadline, progress, amounts and
issue-date windows the same way. Adds a caption helper that says what
the headline figure is.

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

- [ ] **Step 5 (controller, not the implementer):** `git push -u origin feat/traveller-parity-tags`.

---

## Task 2: ssr tag-detail section components and strings

**Files:**
- Modify: `apps/ssr/src/language-data/unirefund/SSRService/resources/en.json` and `tr.json` (add keys)
- Create, in `apps/ssr/src/components/tag-detail/`:
  - `format.ts`
  - `tag-identity-card.tsx`
  - `tag-deadline-card.tsx`
  - `tag-journey-card.tsx`
  - `tag-amounts-card.tsx`
  - `tag-purchase-card.tsx`
  - `tag-store-card.tsx`
  - `tag-traveller-card.tsx`
  - `tag-detail-sections.tsx`

**Interfaces:**
- Consumes: everything from Task 1.
- Produces:
  - `TagDetailSections({ tag, showTraveller, claim }: { tag: UniRefund_TagService_Tags_TagPublicDetailDto; showTraveller: boolean; claim?: React.ReactNode })`
  - `formatMoney(amount: number | null | undefined, currency: string | null | undefined, lang: string): string`
  - `formatDay(iso: string | null | undefined, lang: string): string`

- [ ] **Step 1: Add the strings.**

  - Grep both files first and skip any key that already exists.
  - Add the same keys to `en.json` and `tr.json`, in this order, near the other `Tags.*` keys:

| Key | en | tr |
| --- | --- | --- |
| `TagDetail.TagNumber` | Tag number | Etiket numarası |
| `TagDetail.HeadlineRefund` | Refund | İade |
| `TagDetail.HeadlineRefundEstimate` | Estimated refund | Tahmini iade |
| `TagDetail.HeadlinePurchase` | Purchase | Alışveriş |
| `TagDetail.HeadlinePurchasePending` | Purchase — refund not calculated yet | Alışveriş — iade henüz hesaplanmadı |
| `TagDetail.HeadlineNoAmount` | No amount calculated yet | Henüz tutar hesaplanmadı |
| `TagDetail.PaidEarly` | Refunded early | Erken iade edildi |
| `TagDetail.DeadlineLabel` | Deadline | Son tarih |
| `TagDetail.DeadlineOverdue` | Overdue | Gecikti |
| `TagDetail.DeadlineValidateBy` | Validate by {0} | Son onay tarihi {0} |
| `TagDetail.DeadlineDaysLeft` | {0} days left | {0} gün kaldı |
| `TagDetail.DeadlineLastDay` | Last day | Son gün |
| `TagDetail.DeadlineOverdueBy` | {0} days overdue | {0} gün gecikti |
| `TagDetail.Progress` | Progress | İlerleme |
| `TagDetail.StepDraft` | Draft | Taslak |
| `TagDetail.StepIssued` | Issued | İşlendi |
| `TagDetail.StepWaitingExportValidation` | Waiting export validation | Gümrük onayı bekliyor |
| `TagDetail.StepExportValidated` | Export validated | Gümrük onayı aldı |
| `TagDetail.ExportValidationRejected` | Rejected by customs | Gümrük tarafından reddedildi |
| `TagDetail.StepRefund` | Refund | İade |
| `TagDetail.StepCancelled` | Cancelled | İptal edildi |
| `TagDetail.NotStarted` | Not started | Başlamadı |
| `TagDetail.Amounts` | Amounts | Tutarlar |
| `TagDetail.TotalType.None` | Other | Diğer |
| `TagDetail.TotalType.SalesAmount` | Purchase | Alışveriş |
| `TagDetail.TotalType.VatAmount` | VAT | KDV |
| `TagDetail.TotalType.GrossRefund` | Gross refund | Brüt iade |
| `TagDetail.TotalType.RefundFee` | Refund fee | İade kesintisi |
| `TagDetail.TotalType.AgentRefundFee` | Agent fee | Acente kesintisi |
| `TagDetail.TotalType.EarlyRefundFee` | Early refund fee | Erken iade kesintisi |
| `TagDetail.TotalType.Refund` | Refund | İade |
| `TagDetail.OfWhichVat` | of which VAT | bunun KDV tutarı |
| `TagDetail.FeesAppliedLater` | Fees are applied when the refund is issued. | Kesintiler iade yapılırken uygulanır. |
| `TagDetail.ExchangeRate` | Converted at {0} | {0} kuru ile çevrildi |
| `TagDetail.Invoices` | Invoices | Faturalar |
| `TagDetail.InvoiceNumber` | Invoice {0} | Fatura {0} |
| `TagDetail.InvoiceUnnumbered` | Invoice | Fatura |
| `TagDetail.NoInvoiceLines` | No line detail on this invoice | Bu faturada satır detayı yok |
| `TagDetail.TaxBase` | Net {0} | Net {0} |
| `TagDetail.VatRate` | VAT {0}% | KDV %{0} |
| `TagDetail.Store` | Store | Mağaza |
| `TagDetail.Address` | Address | Adres |
| `TagDetail.Traveller` | Traveller | Yolcu |
| `TagDetail.DocumentNumber` | Document number | Belge numarası |
| `TagDetail.Nationality` | Nationality | Uyruk |
| `TagDetail.Residence` | Residence | İkamet |
| `Tags.EarlyRefund` | Early | Erken |

  Then:

```bash
cd /c/unirefund/web-app-wt-traveller-parity
node -e 'for (const f of ["en","tr"]) { const p="apps/ssr/src/language-data/unirefund/SSRService/resources/"+f+".json"; const s=require("fs").readFileSync(p,"utf8"); JSON.parse(s); } console.log("json ok")'
pnpm --filter ssr run init 2>&1 | tail -2
git status --short   # only the two resource files; gen bundles and policies.json are ignored/unstaged
```

- [ ] **Step 2: `format.ts`**

```ts
export function formatMoney(
  amount: number | null | undefined,
  currency: string | null | undefined,
  lang: string
): string {
  if (amount === null || amount === undefined) return "-";
  if (!currency) return new Intl.NumberFormat(lang, { maximumFractionDigits: 2 }).format(amount);
  return new Intl.NumberFormat(lang, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

export function formatDay(iso: string | null | undefined, lang: string): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", year: "numeric" }).format(date);
}
```

- [ ] **Step 3: `tag-identity-card.tsx`**

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { Badge, type BadgeVariant } from "@repo/ayasofyazilim-ui/components/badge";
import { Card, CardContent } from "@repo/ayasofyazilim-ui/components/card";
import type { UniRefund_TagService_Tags_TagPublicDetailDto as TagPublicDetail } from "@repo/saas/TagService";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { tagAmountRows, totalsToMoneyFields } from "@/src/utils/tag/tag-amounts";
import { tagHeadlineAmount, tagHeadlineCaption, tagStatusTone, type TagStatusTone } from "@/src/utils/tag/tag-status";
import { formatMoney } from "./format";

const TONE_BADGE: Record<TagStatusTone, BadgeVariant> = {
  success: "success",
  info: "info",
  warning: "warning",
  error: "destructive",
  neutral: "gray",
};

export function TagIdentityCard({ tag, claim }: { tag: TagPublicDetail; claim?: ReactNode }) {
  const { t } = useTranslations();
  const { lang } = useParams<{ lang: string }>();
  const money = totalsToMoneyFields(tag.totals);
  const currency = tagAmountRows(tag.totals).currency;
  const amount = tagHeadlineAmount(money);
  const statusLabel = t.SSRService[`Tags.Status.${tag.status}`] ?? tag.status;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">{t.SSRService["TagDetail.TagNumber"]}</p>
            <p className="font-mono text-lg font-semibold" data-testid="tag-number">{tag.tagNumber}</p>
          </div>
          <Badge variant={TONE_BADGE[tagStatusTone(tag.status)]} data-testid="tag-status">
            {statusLabel}
          </Badge>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t.SSRService[tagHeadlineCaption(money)]}</p>
          <p className="text-2xl font-bold" data-testid="tag-headline-amount">
            {formatMoney(amount, currency, lang)}
          </p>
        </div>
        {claim}
      </CardContent>
    </Card>
  );
}
```

  If `t.SSRService[\`Tags.Status.${tag.status}\`]` does not type-check because one `TagStatusType` value has no `Tags.Status.*` key, add the missing key or keys to both resource files (en and tr), worded like the existing ones, and re-run init. Do not cast.

  `TagPublicDetailDto` carries no `isEarlyRefunded`, so the detail shows no "Early" chip; that chip is list-only (Task 4). Leave `TagDetail.PaidEarly` unused for now.

- [ ] **Step 4: `tag-deadline-card.tsx`**

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { Card, CardContent } from "@repo/ayasofyazilim-ui/components/card";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import type { UniRefund_TagService_Tags_TagPublicDetailDto as TagPublicDetail } from "@repo/saas/TagService";
import { CalendarClock } from "lucide-react";
import { useParams } from "next/navigation";
import { deadlineCountdown, tagDeadline } from "@/src/utils/tag/tag-deadline";
import { tagJourneySteps } from "@/src/utils/tag/tag-journey";
import { formatDay } from "./format";

const TONE_CLASS = {
  info: "border-blue-200 bg-blue-50 text-blue-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  error: "border-destructive/40 bg-destructive/5 text-destructive",
} as const;

export function TagDeadlineCard({ tag }: { tag: TagPublicDetail }) {
  const { t } = useTranslations();
  const { lang } = useParams<{ lang: string }>();
  const isExportValidated = tagJourneySteps({ status: tag.status, issueDate: tag.issueDate }).some(
    (step) => step.id === "exportValidation" && step.state === "done"
  );
  const deadline = tagDeadline({
    status: tag.status,
    exportValidationExpirationDate: tag.exportValidationExpirationDate,
    isExportValidated,
  });
  if (!deadline || deadline.kind !== "exportValidation") return null;

  const countdown = deadlineCountdown(deadline);
  const countdownText =
    countdown.kind === "overdue"
      ? t.SSRService["TagDetail.DeadlineOverdueBy"].replace("{0}", String(countdown.days))
      : countdown.kind === "lastDay"
        ? t.SSRService["TagDetail.DeadlineLastDay"]
        : t.SSRService["TagDetail.DeadlineDaysLeft"].replace("{0}", String(countdown.days));

  return (
    <Card className={cn("border", TONE_CLASS[deadline.tone])} data-testid="tag-deadline">
      <CardContent className="flex items-center gap-3 pt-6">
        <CalendarClock className="size-5 shrink-0" />
        <div className="flex-1">
          <p className="text-xs font-medium uppercase">
            {t.SSRService[deadline.isOverdue ? "TagDetail.DeadlineOverdue" : "TagDetail.DeadlineLabel"]}
          </p>
          <p className="font-semibold">
            {t.SSRService["TagDetail.DeadlineValidateBy"].replace("{0}", formatDay(deadline.date.toISOString(), lang))}
          </p>
        </div>
        <p className="text-sm font-semibold">{countdownText}</p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: `tag-journey-card.tsx`**

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ayasofyazilim-ui/components/card";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import type { UniRefund_TagService_Tags_TagPublicDetailDto as TagPublicDetail } from "@repo/saas/TagService";
import { Check, X } from "lucide-react";
import { useParams } from "next/navigation";
import { tagDeadline } from "@/src/utils/tag/tag-deadline";
import { tagJourneySteps, type TagJourneyState, type TagJourneyStepId } from "@/src/utils/tag/tag-journey";
import { formatDay } from "./format";

function stepLabelKey(id: TagJourneyStepId, state: TagJourneyState) {
  switch (id) {
    case "draft":
      return "TagDetail.StepDraft" as const;
    case "issued":
      return "TagDetail.StepIssued" as const;
    case "exportValidation":
      return state === "done"
        ? ("TagDetail.StepExportValidated" as const)
        : state === "failed"
          ? ("TagDetail.ExportValidationRejected" as const)
          : ("TagDetail.StepWaitingExportValidation" as const);
    case "refund":
      return "TagDetail.StepRefund" as const;
    case "cancelled":
      return "TagDetail.StepCancelled" as const;
    default:
      return "TagDetail.StepRefund" as const;
  }
}

export function TagJourneyCard({ tag }: { tag: TagPublicDetail }) {
  const { t } = useTranslations();
  const { lang } = useParams<{ lang: string }>();
  const steps = tagJourneySteps({ status: tag.status, issueDate: tag.issueDate }).filter(
    (step) => step.id !== "vatStatement"
  );
  const isExportValidated = steps.some((s) => s.id === "exportValidation" && s.state === "done");
  const deadline = tagDeadline({
    status: tag.status,
    exportValidationExpirationDate: tag.exportValidationExpirationDate,
    isExportValidated,
  });

  return (
    <Card data-testid="tag-journey">
      <CardHeader>
        <CardTitle className="text-base">{t.SSRService["TagDetail.Progress"]}</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col">
          {steps.map((step, index) => {
            const isLast = index === steps.length - 1;
            const hint =
              step.id === "exportValidation" && step.state === "current" && deadline?.kind === "exportValidation"
                ? t.SSRService["TagDetail.DeadlineValidateBy"].replace("{0}", formatDay(deadline.date.toISOString(), lang))
                : step.id === "issued" && step.state === "done" && tag.merchant?.name
                  ? tag.merchant.name
                  : undefined;
            return (
              <li key={step.id} className="flex gap-3">
                <div className="flex w-5 flex-col items-center">
                  <span
                    className={cn(
                      "flex size-5 items-center justify-center rounded-full",
                      step.state === "done" && "bg-emerald-500 text-white",
                      step.state === "failed" && "bg-destructive text-white",
                      step.state === "current" && "border-2 border-blue-500 bg-background",
                      step.state === "todo" && "border-2 border-muted-foreground/40 bg-background"
                    )}
                  >
                    {step.state === "done" ? <Check className="size-3" /> : step.state === "failed" ? <X className="size-3" /> : null}
                  </span>
                  {!isLast && <span className={cn("min-h-5 w-0.5 flex-1", step.state === "done" ? "bg-emerald-500" : "bg-border")} />}
                </div>
                <div className={cn("flex-1", !isLast && "pb-4")}>
                  <p className={cn("text-sm font-medium", step.state === "todo" && "text-muted-foreground")}>
                    {t.SSRService[stepLabelKey(step.id, step.state)]}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {step.state === "todo" ? t.SSRService["TagDetail.NotStarted"] : step.date ? formatDay(step.date, lang) : null}
                  </p>
                  {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: `tag-amounts-card.tsx`**

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ayasofyazilim-ui/components/card";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import type { UniRefund_TagService_Tags_TagPublicDetailDto as TagPublicDetail } from "@repo/saas/TagService";
import { useParams } from "next/navigation";
import { tagAmountRows, totalLabelKey } from "@/src/utils/tag/tag-amounts";
import { formatMoney } from "./format";

const PAID = new Set(["Refunded", "EarlyRefunded"]);

export function TagAmountsCard({ tag }: { tag: TagPublicDetail }) {
  const { t } = useTranslations();
  const { lang } = useParams<{ lang: string }>();
  const amounts = tagAmountRows(tag.totals);
  if (amounts.rows.length === 0 && !amounts.net) return null;
  const hasFees = amounts.rows.some((row) => row.isDeduction);

  return (
    <Card data-testid="tag-amounts">
      <CardHeader>
        <CardTitle className="text-base">{t.SSRService["TagDetail.Amounts"]}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {amounts.rows.map((row) => (
          <div key={row.totalType} className={cn("flex justify-between text-sm", row.isNested && "pl-4 text-muted-foreground")}>
            <span>
              {row.isNested && row.totalType === "VatAmount"
                ? t.SSRService["TagDetail.OfWhichVat"]
                : t.SSRService[totalLabelKey(row.totalType)]}
            </span>
            <span>
              {row.isDeduction ? "− " : ""}
              {formatMoney(row.amount, row.currency, lang)}
            </span>
          </div>
        ))}
        {amounts.net && (
          <div className="flex justify-between border-t pt-2 font-semibold">
            <span>{t.SSRService[totalLabelKey(amounts.net.totalType)]}</span>
            <span data-testid="tag-amounts-net">{formatMoney(amounts.net.amount, amounts.net.currency, lang)}</span>
          </div>
        )}
        {!hasFees && !PAID.has(tag.status) && (
          <p className="text-xs text-muted-foreground">{t.SSRService["TagDetail.FeesAppliedLater"]}</p>
        )}
        {amounts.currencyRate !== undefined && amounts.currencyRate !== 1 && (
          <p className="text-xs text-muted-foreground">
            {t.SSRService["TagDetail.ExchangeRate"].replace("{0}", String(amounts.currencyRate))}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 7: `tag-purchase-card.tsx`**

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { Badge } from "@repo/ayasofyazilim-ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ayasofyazilim-ui/components/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@repo/ayasofyazilim-ui/components/collapsible";
import type { UniRefund_TagService_Invoices_InvoicePublicDto as Invoice } from "@repo/saas/TagService";
import { ChevronDown } from "lucide-react";
import { useParams } from "next/navigation";
import { formatDay, formatMoney } from "./format";

export function TagPurchaseCard({ invoices }: { invoices?: Invoice[] | null }) {
  const { t } = useTranslations();
  const { lang } = useParams<{ lang: string }>();
  if (!invoices?.length) return null;

  return (
    <Card data-testid="tag-purchase">
      <CardHeader>
        <CardTitle className="text-base">{t.SSRService["TagDetail.Invoices"]}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {invoices.map((invoice, index) => (
          <Collapsible key={invoice.number ?? index} className="rounded-md border" defaultOpen={invoices.length === 1}>
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 p-3 text-left">
              <div>
                <p className="text-sm font-medium">
                  {invoice.number
                    ? t.SSRService["TagDetail.InvoiceNumber"].replace("{0}", invoice.number)
                    : t.SSRService["TagDetail.InvoiceUnnumbered"]}
                </p>
                <p className="text-xs text-muted-foreground">{formatDay(invoice.issueDate, lang)}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <p className="text-sm font-semibold">{formatMoney(invoice.totalAmount, invoice.currency, lang)}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.SSRService["TagDetail.TotalType.VatAmount"]} {formatMoney(invoice.vatAmount, invoice.currency, lang)}
                  </p>
                </div>
                <ChevronDown className="size-4 shrink-0" />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="border-t px-3 py-2">
              {invoice.invoiceLines.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t.SSRService["TagDetail.NoInvoiceLines"]}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {invoice.invoiceLines.map((line, lineIndex) => (
                    <li key={lineIndex} className="flex items-start justify-between gap-2 text-sm">
                      <div>
                        <p>{line.description ?? "-"}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.SSRService["TagDetail.TaxBase"].replace("{0}", formatMoney(line.taxBase, line.currency ?? invoice.currency, lang))}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="gray" size="sm">
                          {t.SSRService["TagDetail.VatRate"].replace("{0}", String(line.taxRate))}
                        </Badge>
                        <span className="font-medium">{formatMoney(line.amount, line.currency ?? invoice.currency, lang)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CollapsibleContent>
          </Collapsible>
        ))}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 8: `tag-store-card.tsx` and `tag-traveller-card.tsx`**

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ayasofyazilim-ui/components/card";
import type { UniRefund_TagService_Tags_MerchantPublicDto as Merchant } from "@repo/saas/TagService";

export function TagStoreCard({ merchant }: { merchant?: Merchant | null }) {
  const { t } = useTranslations();
  if (!merchant) return null;
  return (
    <Card data-testid="tag-store">
      <CardHeader>
        <CardTitle className="text-base">{t.SSRService["TagDetail.Store"]}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 text-sm">
        <p className="font-medium">{merchant.name}</p>
        {merchant.address && (
          <p className="text-muted-foreground">
            <span className="sr-only">{t.SSRService["TagDetail.Address"]}: </span>
            {merchant.address}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
```

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ayasofyazilim-ui/components/card";
import type { UniRefund_TagService_Travellers_TravellerDetailDto as Traveller } from "@repo/saas/TagService";

export function TagTravellerCard({ traveller }: { traveller?: Traveller | null }) {
  const { t } = useTranslations();
  if (!traveller) return null;
  const name = [traveller.firstname, traveller.lastname].filter(Boolean).join(" ");
  const rows: [string, string | null | undefined][] = [
    [t.SSRService["TagDetail.DocumentNumber"], traveller.travellerDocumentNumber],
    [t.SSRService["TagDetail.Nationality"], traveller.nationality],
    [t.SSRService["TagDetail.Residence"], traveller.residenceCountryName],
  ];
  return (
    <Card data-testid="tag-traveller">
      <CardHeader>
        <CardTitle className="text-base">{t.SSRService["TagDetail.Traveller"]}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {name && <p className="font-medium">{name}</p>}
        {rows
          .filter(([, value]) => !!value)
          .map(([label, value]) => (
            <div key={label} className="flex justify-between gap-2">
              <span className="text-muted-foreground">{label}</span>
              <span>{value}</span>
            </div>
          ))}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 9: `tag-detail-sections.tsx`**

```tsx
"use client";
import type { UniRefund_TagService_Tags_TagPublicDetailDto as TagPublicDetail } from "@repo/saas/TagService";
import type { ReactNode } from "react";
import { TagAmountsCard } from "./tag-amounts-card";
import { TagDeadlineCard } from "./tag-deadline-card";
import { TagIdentityCard } from "./tag-identity-card";
import { TagJourneyCard } from "./tag-journey-card";
import { TagPurchaseCard } from "./tag-purchase-card";
import { TagStoreCard } from "./tag-store-card";
import { TagTravellerCard } from "./tag-traveller-card";

export function TagDetailSections({
  tag,
  showTraveller,
  claim,
}: {
  tag: TagPublicDetail;
  showTraveller: boolean;
  claim?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <TagIdentityCard tag={tag} claim={claim} />
        <TagDeadlineCard tag={tag} />
        <TagJourneyCard tag={tag} />
        <TagPurchaseCard invoices={tag.invoices} />
      </div>
      <aside className="flex flex-col gap-4">
        <TagAmountsCard tag={tag} />
        <TagStoreCard merchant={tag.merchant} />
        {showTraveller && <TagTravellerCard traveller={tag.traveller} />}
      </aside>
    </div>
  );
}
```

- [ ] **Step 10: Gates**

```bash
cd /c/unirefund/web-app-wt-traveller-parity
pnpm --filter ssr type-check > /tmp/tc.log 2>&1; echo "exit=$?"; grep "error TS" /tmp/tc.log | head
pnpm --filter ssr lint 2>&1 | grep problems
pnpm --filter ssr test:unit 2>&1 | grep -E "^# (pass|fail)"
```
Expected: type-check exits 0, lint shows 0 errors, and no unit test fails. The components are not mounted yet, so there is nothing to see in the browser.

- [ ] **Step 11: Commit**

```bash
git add apps/ssr/src/components/tag-detail/ apps/ssr/src/language-data/unirefund/SSRService/resources/en.json apps/ssr/src/language-data/unirefund/SSRService/resources/tr.json
git branch --show-current
git commit -q -F - <<'EOF'
feat(ssr): add the traveller tag detail sections

Identity, deadline, progress, amounts, invoices, store and traveller
cards built on the ported tag logic, with en/tr strings worded like the
app's. Not mounted yet.

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

## Task 3: Mount the sections on both tag pages

**Files:**
- Modify: `apps/ssr/src/app/[lang]/(main)/tags/[tagNumber]/_components/tag-details.tsx` (rewrite)
- Delete: in `apps/ssr/src/app/[lang]/(main)/tags/[tagNumber]/_components/`: `tag-information.tsx`, `invoice-summary.tsx`, `merchant-info.tsx`, `traveller-information.tsx`, `status-badge.tsx`
- Modify: `apps/ssr/src/app/[lang]/(public)/tag/[slug]/_components/public-tag-details.tsx` (rewrite)
- Modify: `apps/ssr/src/language-data/unirefund/SSRService/resources/en.json` and `tr.json` (remove keys left unused)

**Interfaces:** consumes `TagDetailSections` (Task 2); `ClaimTagButton` (`./claim-tag-button`, unchanged; props `isAuthenticated`, `loginUrl`, `salesAmount`).

- [ ] **Step 1: Rewrite `tag-details.tsx`**

```tsx
"use client";
import { TagDetailSections } from "@/src/components/tag-detail/tag-detail-sections";
import { useTranslations } from "@/src/providers/i18n";
import { buttonVariants } from "@repo/ayasofyazilim-ui/components/button";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import type { UniRefund_TagService_Tags_TagPublicDetailDto } from "@repo/saas/TagService";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function TagDetailClient({
  tagsResponse,
}: {
  tagsResponse: UniRefund_TagService_Tags_TagPublicDetailDto;
}) {
  const { lang } = useParams<{ lang: string }>();
  const { t } = useTranslations();
  return (
    <div className="mx-auto max-w-5xl py-6">
      <div className="mb-6 flex gap-4">
        <Link
          data-testid="back-to-tags-link"
          href={`/${lang}/tags`}
          className={cn(buttonVariants({ variant: "outline", size: "icon-lg" }), "mt-1")}
        >
          <ArrowLeft />
        </Link>
        <h1 className="self-center text-xl font-semibold">{t.SSRService["Tags.DetailsTitle"]}</h1>
      </div>
      <TagDetailSections tag={tagsResponse} showTraveller />
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `public-tag-details.tsx`.** Keep its existing default export name, props (`data`, `claimProps`) and the back link (whatever header markup is there today). Replace the body cards with:

```tsx
      <TagDetailSections
        tag={data}
        showTraveller={false}
        claim={
          claimProps ? (
            <ClaimTagButton
              isAuthenticated={claimProps.isAuthenticated}
              loginUrl={claimProps.loginUrl}
              salesAmount={claimProps.salesAmount}
            />
          ) : undefined
        }
      />
```

  Remove the local `formatCurrency` and `getStatusColor` helpers, the per-type `totals?.find(...)` lookups, the traveller card, and the overlay wrapper that positioned `ClaimTagButton` over it. If `ClaimTagButton` needs to be a full-width button inside the identity card instead of an overlay, adjust only its wrapper class.

- [ ] **Step 3: Delete the five old components and their now-unused strings.**

```bash
cd /c/unirefund/web-app-wt-traveller-parity
D="apps/ssr/src/app/[lang]/(main)/tags/[tagNumber]/_components"
git grep -n "tag-information\|invoice-summary\|merchant-info\|traveller-information\|status-badge" -- apps/ssr/src   # expect only tag-details.tsx before the rewrite, nothing after
git rm -q "$D/tag-information.tsx" "$D/invoice-summary.tsx" "$D/merchant-info.tsx" "$D/traveller-information.tsx" "$D/status-badge.tsx"
```

  For every `t.SSRService["…"]` key the deleted files and the removed `public-tag-details.tsx` code referenced, run `git grep -n '"<key>"' -- apps/ssr/src ':!**/*.gen.json'`. Delete each key that has **no** remaining reference, from both `en.json` and `tr.json`. Keep JSON valid. Then run `pnpm --filter ssr run init`.

- [ ] **Step 4: Gates and a browser check.**

```bash
pnpm --filter ssr type-check > /tmp/tc.log 2>&1; echo "exit=$?"; grep "error TS" /tmp/tc.log | head
pnpm --filter ssr lint 2>&1 | grep problems
pnpm --filter ssr test:unit 2>&1 | grep -E "^# (pass|fail)"
```

  If type-check reports TS2307 under `apps/ssr/.next/` for a deleted file, it's the running dev server's stale generated types. Delete only the named generated files and re-run.

  Browser check: Playwright MCP on `http://localhost:3010`. If the browser is locked by another process, use authenticated `curl` and say so.
  1. Sign in at `/en/login` as `tur-a25y29041` / `1q2w3E*`.
  2. Open `/en/tags` and then any tag. Confirm the identity card (localized status, purchase headline), progress, amounts, invoices, store and traveller are visible.
  3. Open that tag's public page: on the detail page, copy any `/en/tag/<slug>` link if one exists; otherwise skip this step and note it. Confirm there is **no** traveller block.

  Take screenshots after a 2-second settle.

- [ ] **Step 5: Commit**

```bash
git add "apps/ssr/src/app/[lang]/(main)/tags/[tagNumber]/_components/tag-details.tsx" "apps/ssr/src/app/[lang]/(public)/tag/[slug]/_components/public-tag-details.tsx" apps/ssr/src/language-data/unirefund/SSRService/resources/en.json apps/ssr/src/language-data/unirefund/SSRService/resources/tr.json
git status --short   # the 5 deletions are already staged by git rm
git branch --show-current
git commit -q -F - <<'EOF'
feat(ssr): show the full traveller tag detail on both tag pages

The signed-in detail and the public tag page now render the shared
sections: localized status, the purchase headline, deadline, progress,
every invoice with its lines, amounts and store. The public page drops
the traveller block, and its claim button moves into the identity card.

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

## Task 4: ssr tag list — sort, issue-date filter, purchase headline, chips

**Files:**
- Create: `apps/ssr/src/app/[lang]/(main)/tags/tag-list-params.ts` and `tag-list-params.test.ts`
- Create: `apps/ssr/src/app/[lang]/(main)/tags/_components/tag-list-toolbar.tsx`
- Modify: `apps/ssr/src/app/[lang]/(main)/tags/page.tsx`
- Modify: `apps/ssr/src/app/[lang]/(main)/tags/_components/tags-view.tsx`
- Modify: `apps/ssr/src/app/[lang]/(main)/tags/_components/tag-table-view.tsx`
- Modify: the SSRService `en.json` and `tr.json` (add keys)

**Interfaces:**
- Produces:
  - `type TagListParams = { page: number; sort: "asc" | "desc"; issuedStartDate?: string; issuedEndDate?: string }`
  - `parseTagListParams(raw: Record<string, string | string[] | undefined>): TagListParams`
  - `tagListApiQuery(p: TagListParams, pageSize: number): { sorting: string; skipCount: number; maxResultCount: number; issuedStartDate?: string; issuedEndDate?: string }`
- Consumes: `TAG_DATE_PRESETS`, `presetToRange`, `rangeToPreset` (Task 1); `tagDeadline`, `deadlineCountdown` (Task 1); `tagHeadlineAmount` (Task 1); `formatMoney` (Task 2).

- [ ] **Step 1: Write the failing params test**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTagListParams, tagListApiQuery } from "./tag-list-params";

describe("parseTagListParams", () => {
  it("defaults to the newest first, page one, no range", () => {
    assert.deepEqual(parseTagListParams({}), { page: 1, sort: "desc" });
  });
  it("keeps a valid sort, page and range unchanged", () => {
    assert.deepEqual(
      parseTagListParams({ page: "3", sort: "asc", issuedStartDate: "2026-09-24", issuedEndDate: "2026-09-25" }),
      { page: 3, sort: "asc", issuedStartDate: "2026-09-24", issuedEndDate: "2026-09-25" }
    );
  });
  it("drops a half range", () => {
    assert.deepEqual(parseTagListParams({ issuedStartDate: "2026-09-24" }), { page: 1, sort: "desc" });
  });
  it("drops impossible or misordered dates", () => {
    assert.deepEqual(parseTagListParams({ issuedStartDate: "2026-13-40", issuedEndDate: "2026-09-25" }), { page: 1, sort: "desc" });
    assert.deepEqual(parseTagListParams({ issuedStartDate: "2026-09-26", issuedEndDate: "2026-09-25" }), { page: 1, sort: "desc" });
  });
  it("ignores a bad sort, a bad page and unknown params", () => {
    assert.deepEqual(parseTagListParams({ sort: "evil", page: "-3", merchantIds: "x", status: "Issued" }), { page: 1, sort: "desc" });
  });
  it("reads the first value of a repeated param", () => {
    assert.deepEqual(parseTagListParams({ sort: ["asc", "desc"] }), { page: 1, sort: "asc" });
  });
});

describe("tagListApiQuery", () => {
  it("maps to the endpoint's query", () => {
    assert.deepEqual(tagListApiQuery({ page: 2, sort: "asc", issuedStartDate: "2026-09-01", issuedEndDate: "2026-09-02" }, 20), {
      sorting: "issueDate asc",
      skipCount: 20,
      maxResultCount: 20,
      issuedStartDate: "2026-09-01",
      issuedEndDate: "2026-09-02",
    });
  });
  it("sends no range keys without a range", () => {
    assert.deepEqual(tagListApiQuery({ page: 1, sort: "desc" }, 20), { sorting: "issueDate desc", skipCount: 0, maxResultCount: 20 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter ssr test:unit 2>&1 | grep -E "^# (pass|fail)|Cannot find" | head
```
Expected: module-not-found for `./tag-list-params`.

- [ ] **Step 3: Implement `tag-list-params.ts`**

```ts
export type TagListParams = {
  page: number;
  sort: "asc" | "desc";
  issuedStartDate?: string;
  issuedEndDate?: string;
};

type Raw = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function isDay(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// Only these reach the API; the browser computes the range in its own
// timezone, so the server never re-derives "today".
export function parseTagListParams(raw: Raw): TagListParams {
  const pageNumber = Number.parseInt(first(raw.page) ?? "", 10);
  const sortValue = first(raw.sort);
  const start = first(raw.issuedStartDate);
  const end = first(raw.issuedEndDate);
  const params: TagListParams = {
    page: Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1,
    sort: sortValue === "asc" ? "asc" : "desc",
  };
  if (isDay(start) && isDay(end) && start <= end) {
    params.issuedStartDate = start;
    params.issuedEndDate = end;
  }
  return params;
}

export function tagListApiQuery(p: TagListParams, pageSize: number) {
  return {
    sorting: `issueDate ${p.sort}`,
    skipCount: (p.page - 1) * pageSize,
    maxResultCount: pageSize,
    ...(p.issuedStartDate && p.issuedEndDate
      ? { issuedStartDate: p.issuedStartDate, issuedEndDate: p.issuedEndDate }
      : {}),
  };
}
```

- [ ] **Step 4: Run it to verify it passes.** The same command as Step 2; expect 0 failures.

- [ ] **Step 5: Add the strings** (grep first; skip any that exist):

| Key | en | tr |
| --- | --- | --- |
| `Tags.SortNewest` | Newest first | İlk önce en yeni |
| `Tags.SortOldest` | Oldest first | İlk önce en eski |
| `Tags.IssueDateFilter` | Issue date | Düzenlenme tarihi |
| `Tags.DateAll` | Any time | Tüm zamanlar |
| `Tags.DateToday` | Today | Bugün |
| `Tags.DateWeek` | Last 7 days | Son 7 gün |
| `Tags.DateMonth` | Last 30 days | Son 30 gün |
| `Tags.Date120Days` | Last 120 days | Son 120 gün |
| `Tags.DaysLeft` | {0} days left | {0} gün kaldı |
| `Tags.LastDay` | Last day | Son gün |
| `Tags.Overdue` | Overdue | Gecikti |
| `Tags.PurchaseAmount` | Purchase | Alışveriş |

  Then run `pnpm --filter ssr run init`.

- [ ] **Step 6: `page.tsx` uses the parser.** Replace the `searchParams` typing and the `{ page: pageParam, ...filters }` block with:

```tsx
  searchParams: Promise<Record<string, string | string[] | undefined>>;
```

```tsx
  const listParams = parseTagListParams(await searchParams);
  const apiRequests = await getApiRequests(tagListApiQuery(listParams, PAGE_SIZE));
```

  Add `import { parseTagListParams, tagListApiQuery } from "./tag-list-params";`. Change the `getApiRequests` parameter type to `ReturnType<typeof tagListApiQuery>`, so the endpoint's other keys can no longer arrive from the URL. Pass `currentPage={listParams.page}` to `TagsView`, plus the new props `sort={listParams.sort}`, `issuedStartDate={listParams.issuedStartDate}` and `issuedEndDate={listParams.issuedEndDate}`.

- [ ] **Step 7: `tag-list-toolbar.tsx`**

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ayasofyazilim-ui/components/select";
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { presetToRange, rangeToPreset, TAG_DATE_PRESETS, type TagDatePreset } from "@/src/utils/tag/tag-date-range";

export function TagListToolbar({
  sort,
  issuedStartDate,
  issuedEndDate,
}: {
  sort: "asc" | "desc";
  issuedStartDate?: string;
  issuedEndDate?: string;
}) {
  const { t } = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const preset = rangeToPreset(issuedStartDate, issuedEndDate);

  function push(changes: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("page");
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined) next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function choosePreset(value: string) {
    const { start, end } = presetToRange(value as TagDatePreset, new Date());
    push({ issuedStartDate: start, issuedEndDate: end });
  }

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="tag-list-toolbar">
      <Select value={preset} onValueChange={choosePreset}>
        <SelectTrigger className="w-44" aria-label={t.SSRService["Tags.IssueDateFilter"]} data-testid="tag-date-filter">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TAG_DATE_PRESETS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {t.SSRService[option.labelKey]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="sm"
        data-testid="tag-sort-toggle"
        onClick={() => push({ sort: sort === "desc" ? "asc" : undefined })}
      >
        {sort === "desc" ? <ArrowDownWideNarrow className="size-4" /> : <ArrowUpNarrowWide className="size-4" />}
        {t.SSRService[sort === "desc" ? "Tags.SortNewest" : "Tags.SortOldest"]}
      </Button>
    </div>
  );
}
```

- [ ] **Step 8: `tags-view.tsx` renders the toolbar.**
  - Add the three props (`sort`, `issuedStartDate?`, `issuedEndDate?`) to its prop type and destructuring.
  - Render `<TagListToolbar sort={sort} issuedStartDate={issuedStartDate} issuedEndDate={issuedEndDate} />` directly above `<PendingVerifications …/>`, inside the `mt-4` column.

- [ ] **Step 9: `tag-table-view.tsx` row changes.**
  - Imports: `tagHeadlineAmount` from `@/src/utils/tag/tag-status`, `tagDeadline` and `deadlineCountdown` from `@/src/utils/tag/tag-deadline`, `formatMoney` from `@/src/components/tag-detail/format`, and `Badge` from `@repo/ayasofyazilim-ui/components/badge`.
  - The amount header becomes `t.SSRService["Tags.PurchaseAmount"]`.
  - In the row, `const displayAmount = item.refund ?? item.grossRefund ?? 0;` becomes `const displayAmount = tagHeadlineAmount(item);`. `useParams` is already imported; read `const { lang } = useParams<{ lang: string }>();` at the top of `TagTableView` if it isn't read already.
  - The amount cell renders `{formatMoney(displayAmount, item.currency, lang)}`.
  - Under the tag-number link, in the same cell, add the chips:

```tsx
                  {(() => {
                    const deadline = tagDeadline({
                      status: item.status,
                      exportValidationExpirationDate: item.exportValidationExpirationDate,
                      refundExpirationDate: item.refundExpirationDate,
                      exportValidationDate: item.exportValidationDate,
                    });
                    const urgent = deadline && deadline.tone !== "info" ? deadline : null;
                    const countdown = urgent ? deadlineCountdown(urgent) : null;
                    return (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {item.isEarlyRefunded && (
                          <Badge variant="info" size="sm">{t.SSRService["Tags.EarlyRefund"]}</Badge>
                        )}
                        {urgent && countdown && (
                          <Badge variant={urgent.tone === "error" ? "destructive" : "warning"} size="sm" data-testid={`tag-deadline-${item.tagNumber}`}>
                            {countdown.kind === "overdue"
                              ? t.SSRService["Tags.Overdue"]
                              : countdown.kind === "lastDay"
                                ? t.SSRService["Tags.LastDay"]
                                : t.SSRService["Tags.DaysLeft"].replace("{0}", String(countdown.days))}
                          </Badge>
                        )}
                      </div>
                    );
                  })()}
```

  - `buildPageHref` already preserves the other query params; leave it.

- [ ] **Step 10: Gates and a browser check**

```bash
pnpm --filter ssr test:unit 2>&1 | grep -E "^# (pass|fail)"
pnpm --filter ssr type-check > /tmp/tc.log 2>&1; echo "exit=$?"; grep "error TS" /tmp/tc.log | head
pnpm --filter ssr lint 2>&1 | grep problems
```

  In the browser, signed in, on `/en/tags`:
  - toggling sort flips the order and the URL gets `sort=asc`;
  - choosing "Last 7 days" adds `issuedStartDate` and `issuedEndDate` (local dates) and resets the page;
  - "Any time" removes both;
  - rows show the purchase amount, formatted;
  - `?issuedStartDate=2026-13-40` shows the unfiltered list (no error).

- [ ] **Step 11: Commit**

```bash
git add "apps/ssr/src/app/[lang]/(main)/tags/tag-list-params.ts" "apps/ssr/src/app/[lang]/(main)/tags/tag-list-params.test.ts" "apps/ssr/src/app/[lang]/(main)/tags/_components/tag-list-toolbar.tsx" "apps/ssr/src/app/[lang]/(main)/tags/page.tsx" "apps/ssr/src/app/[lang]/(main)/tags/_components/tags-view.tsx" "apps/ssr/src/app/[lang]/(main)/tags/_components/tag-table-view.tsx" apps/ssr/src/language-data/unirefund/SSRService/resources/en.json apps/ssr/src/language-data/unirefund/SSRService/resources/tr.json
git branch --show-current
git commit -q -F - <<'EOF'
feat(ssr): sort and date-filter the tag list, lead rows with the purchase

Newest/oldest sort and the app's issue-date presets, with the range
computed in the browser so "today" is the traveller's. The page now
forwards only page, sort and a validated range to the API. Rows lead
with the purchase amount and carry the app's Early and deadline chips.

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

## Task 5: ssr validate "Already validated" group, and drop the `/tag` navbar link

**Files:**
- Create: `apps/ssr/src/app/[lang]/(public)/validate/_components/scan-result-counts.ts` and `scan-result-counts.test.ts`
- Modify: `apps/ssr/src/app/[lang]/(public)/validate/_components/scan-result-view.tsx` (`SECTION_TONE` at `:64-96`, `ScanResultView` at `:294-380`)
- Modify: `apps/ssr/src/app/[lang]/(public)/layout.tsx` (around `:136-140`)
- Modify: the SSRService `en.json` and `tr.json`

**Interfaces:** Produces `scanResultCounts(r: { greenTagIds: string[]; alreadyClearedTagIds: string[]; redTagIds: string[]; customsRejectedTagIds: string[] }): { green: number; alreadyCleared: number; red: number; customsRejected: number; total: number }`.

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scanResultCounts } from "./scan-result-counts";

describe("scanResultCounts", () => {
  it("counts already-validated tags, so a scan of only those is not empty", () => {
    const counts = scanResultCounts({ greenTagIds: [], alreadyClearedTagIds: ["a", "b"], redTagIds: [], customsRejectedTagIds: [] });
    assert.deepEqual(counts, { green: 0, alreadyCleared: 2, red: 0, customsRejected: 0, total: 2 });
  });
  it("totals every bucket", () => {
    const counts = scanResultCounts({ greenTagIds: ["a"], alreadyClearedTagIds: ["b"], redTagIds: ["c"], customsRejectedTagIds: ["d", "e"] });
    assert.equal(counts.total, 5);
  });
});
```

- [ ] **Step 2: Run it to verify it fails** (`pnpm --filter ssr test:unit`). Expected: module-not-found.

- [ ] **Step 3: Implement `scan-result-counts.ts`**

```ts
type ScanIds = {
  greenTagIds: string[];
  alreadyClearedTagIds: string[];
  redTagIds: string[];
  customsRejectedTagIds: string[];
};

export function scanResultCounts(r: ScanIds) {
  const green = r.greenTagIds.length;
  const alreadyCleared = r.alreadyClearedTagIds.length;
  const red = r.redTagIds.length;
  const customsRejected = r.customsRejectedTagIds.length;
  return { green, alreadyCleared, red, customsRejected, total: green + alreadyCleared + red + customsRejected };
}
```

  If the real `ScanResult` type marks any of these arrays optional, add `?? []` reads and an optional field. Make the test cover a missing array too.

- [ ] **Step 4: Run it to verify it passes.**

- [ ] **Step 5: Strings** (grep first):
  - `Validate.ScanResult.AlreadyCleared`: en "Already validated", tr "Zaten doğrulanmış".
  - `Validate.ScanResult.AlreadyClearedNotice`: en "Customs has already validated these. Nothing more to do for them.", tr "Gümrük bu etiketleri zaten doğruladı. Bunlar için yapmanız gereken bir şey yok."
  - Then run `pnpm --filter ssr run init`.

- [ ] **Step 6: Render the group in `scan-result-view.tsx`.**
  - Extend `SectionTone` to `"green" | "blue" | "red" | "rose"`.
  - Add to `SECTION_TONE`: `blue: { container: "border-blue-200 bg-blue-50", heading: "text-blue-700", badge: "blue", Icon: CheckCheck }`, and add `CheckCheck` to the `lucide-react` import.
  - In `ScanResultView`, replace the three `…Count` constants with `const counts = scanResultCounts(scanResult);` (import it), and use `counts.green`, `counts.red`, `counts.customsRejected`. The empty check becomes `if (counts.total === 0)`, and `allValidated` stays `counts.red === 0 && counts.customsRejected === 0`.
  - Right after the green section, add:

```tsx
      {counts.alreadyCleared > 0 && (
        <ResultSection
          tone="blue"
          title={t.SSRService["Validate.ScanResult.AlreadyCleared"]}
          count={counts.alreadyCleared}
          alert={t.SSRService["Validate.ScanResult.AlreadyClearedNotice"]}
          ids={scanResult.alreadyClearedTagIds}
          items={tags?.alreadyCleared ?? null}
          loading={tagsLoading}
          highlightedTagNumbers={highlightedTagNumbers}
        />
      )}
```

  `ResultSection` must accept the new tone. It reads `SECTION_TONE[tone]`, so no further change is expected. If its `alert` styling is tone-specific, check that the blue tone gets a sensible look.

- [ ] **Step 7: Drop the navbar link (decision 3).** In `(public)/layout.tsx`, delete the whole navbar item object `{ text: t.SSRService["Nav.ClaimTag"], url: \`/${lang}/tag\`, hidden: isLoggedIn }`. Then:

```bash
git grep -n '"Nav.ClaimTag"' -- apps/ssr/src ':!**/*.gen.json'   # expect only the two resource files
```
  Delete `Nav.ClaimTag` from `en.json` and `tr.json`, and run `pnpm --filter ssr run init`. `/tag` stays as a route; do not touch `(public)/tag/page.tsx`, the lookup-failed "Try again" link, or the slug page's form fallback.

- [ ] **Step 8: Gates**

```bash
pnpm --filter ssr test:unit 2>&1 | grep -E "^# (pass|fail)"
pnpm --filter ssr type-check > /tmp/tc.log 2>&1; echo "exit=$?"; grep "error TS" /tmp/tc.log | head
pnpm --filter ssr lint 2>&1 | grep problems
curl -s "http://localhost:3010/en" | grep -c '/en/tag"'   # expect 0 (the navbar link is gone)
```

- [ ] **Step 9: Commit**

```bash
git add "apps/ssr/src/app/[lang]/(public)/validate/_components/scan-result-counts.ts" "apps/ssr/src/app/[lang]/(public)/validate/_components/scan-result-counts.test.ts" "apps/ssr/src/app/[lang]/(public)/validate/_components/scan-result-view.tsx" "apps/ssr/src/app/[lang]/(public)/layout.tsx" apps/ssr/src/language-data/unirefund/SSRService/resources/en.json apps/ssr/src/language-data/unirefund/SSRService/resources/tr.json
git branch --show-current
git commit -q -F - <<'EOF'
feat(ssr): show already-validated tags, and stop linking the tag lookup

Validate results gain the app's Already validated group; tags that were
fetched and categorised but never shown, and a scan of only those no
longer reads as "no tags". The navbar's Claim Tag link to the number
plus passport lookup is removed, as in the app; the route stays.

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

## Task 6: super-app claim grant gate

**Files:**
- Create: `super-app/src/hooks/useCanClaimTag.ts` and `src/hooks/__tests__/useCanClaimTag.router.test.ts`
- Modify: `super-app/src/screens/shared/TagPreviewScreen.tsx` (`buildAction`, around `:226-250`)
- Modify: `super-app/src/screens/traveller/ValidateScreen.tsx` (the "Claim another tag" `Button`, around `:344-354`)
- Modify: `super-app/src/hooks/useResumePendingScan.tsx` (the claim branch)
- Modify: `super-app/src/screens/shared/__tests__/TagPreviewActions.router.test.tsx` (`:317-324` and a new case)
- Modify: `super-app/src/screens/traveller/__tests__/ValidateScreen.router.test.tsx` (new cases)

**Interfaces:** Produces `canClaimTag(granted: Record<string, boolean> | undefined): boolean` and `useCanClaimTag(): boolean` (true only for a non-staff role holding `TagService.Tags` + `TagService.Tags.TravellerSelfAssign`).

- [ ] **Step 1: Write the failing hook test**, modelled on `src/hooks/__tests__/useCanUploadVerification.router.test.ts`:

```ts
import { renderHook } from "@testing-library/react-native";
import { canClaimTag, useCanClaimTag } from "@/hooks/useCanClaimTag";
import useUserStore, { type UserRole } from "@/store/user";
import type { UserProfile } from "@/store/user.types";

const PAIR = { "TagService.Tags": true, "TagService.Tags.TravellerSelfAssign": true };

function signIn(role: UserRole, grantedPolicies: Record<string, boolean>) {
  useUserStore.getState().setRole(role);
  useUserStore.getState().setUser({ userId: "u1", grantedPolicies } as unknown as UserProfile);
}

beforeEach(() => useUserStore.getState().clearUser());

it("lets a traveller holding the pair claim", () => {
  signIn("traveller", PAIR);
  expect(renderHook(() => useCanClaimTag()).result.current).toBe(true);
});

it("holds back the leaf alone", () => {
  signIn("traveller", { "TagService.Tags.TravellerSelfAssign": true });
  expect(renderHook(() => useCanClaimTag()).result.current).toBe(false);
});

it("holds back staff even with the pair", () => {
  signIn("customs", PAIR);
  expect(renderHook(() => useCanClaimTag()).result.current).toBe(false);
});

it("holds back a session with no profile yet", () => {
  expect(renderHook(() => useCanClaimTag()).result.current).toBe(false);
});

it("exposes the same rule outside React", () => {
  expect(canClaimTag(PAIR)).toBe(true);
  expect(canClaimTag(undefined)).toBe(false);
});
```

- [ ] **Step 2: Run it to verify it fails** (`npx jest src/hooks/__tests__/useCanClaimTag.router.test.ts`). Expected: module not found.

- [ ] **Step 3: Implement it**

```ts
import useUserStore from "@/store/user";
import { isActionGranted } from "@/utils/policies";
import { isStaffRole } from "@/utils/roles";

export function canClaimTag(granted: Record<string, boolean> | undefined): boolean {
  return isActionGranted(granted, ["TagService.Tags", "TagService.Tags.TravellerSelfAssign"]);
}

export function useCanClaimTag(): boolean {
  const user = useUserStore((state) => state.user);
  const role = useUserStore((state) => state.role);
  return !isStaffRole(role) && canClaimTag(user?.grantedPolicies);
}
```

- [ ] **Step 4: Run it to verify it passes.**

- [ ] **Step 5: Gate the preview.**
  - In `TagPreviewScreen.tsx`, call `const canClaim = useCanClaimTag();` with the other hooks.
  - In `buildAction()`'s draft branch, change the traveller line to `return isAuthenticated ? (canClaim ? { onPress: claim, label: t("MobileApp.Qr.TagPreview.Claim") } : undefined) : { onPress: loginToClaim, label: t("MobileApp.Qr.TagPreview.LoginToClaim") };`. An anonymous visitor still gets "Log in to claim".

  Update `TagPreviewActions.router.test.tsx`:
  - The test "offers a traveller the claim instead" must sign in with the pair: `signIn("traveller", ["TagService.Tags", "TagService.Tags.TravellerSelfAssign"])`.
  - Add, in the same `describe`:

```tsx
  it("does not offer the claim to a traveller without the claim grant", async () => {
    signIn("traveller", []);

    await renderPreview(DRAFT);

    expect(screen.queryByText("MobileApp.Qr.TagPreview.Claim")).toBeNull();
  });
```

- [ ] **Step 6: Gate validate's "Claim another tag".** In `ValidateScreen.tsx`, call `const canClaim = useCanClaimTag();` and wrap that `Button` in `{canClaim && ( … )}`. The Done button stays. In `ValidateScreen.router.test.tsx`:
  - import `useUserStore` and `UserProfile`;
  - in `beforeEach`, add `useUserStore.getState().setRole("traveller"); useUserStore.getState().setUser({ userId: "u1", grantedPolicies: { "TagService.Tags": true, "TagService.Tags.TravellerSelfAssign": true } } as unknown as UserProfile);`;
  - add:

```tsx
it("offers to claim another tag from the results with the claim grant", async () => {
  await toCard();
  fireEvent.press(screen.getByTestId("card-submit"));
  await screen.findByText("MobileApp.Qr.Validate.Done");

  expect(screen.getByText("MobileApp.Qr.ClaimTag.Open")).toBeTruthy();
});

it("does not offer it without the claim grant", async () => {
  useUserStore.getState().setUser({ userId: "u1", grantedPolicies: {} } as unknown as UserProfile);
  await toCard();
  fireEvent.press(screen.getByTestId("card-submit"));
  await screen.findByText("MobileApp.Qr.Validate.Done");

  expect(screen.queryByText("MobileApp.Qr.ClaimTag.Open")).toBeNull();
});
```

- [ ] **Step 7: Gate the resumed claim.** In `useResumePendingScan.tsx`, after the `validate` branch returns, add:

```tsx
    if (!canClaimTag(useUserStore.getState().user?.grantedPolicies)) {
      router.replace(
        pending.tagId
          ? { pathname: "/tag-preview", params: { tagId: pending.tagId } }
          : "/(auth)/tags",
      );
      return;
    }
```
  Import `useUserStore` from `@/store/user` and `canClaimTag` from `@/hooks/useCanClaimTag`.

  Check `src/app/(auth)/_layout.tsx`: it renders `AppShellSkeleton` until `role` resolves (`:48`), and `getUserData` stores grants before the role. Confirm that this hook mounts only under that gate, so grants are loaded by the time it runs. If it mounts earlier, report it rather than guessing.

- [ ] **Step 8: Gates**

```bash
cd /c/unirefund/super-app
npx jest src/hooks src/screens/shared/__tests__/TagPreviewActions.router.test.tsx src/screens/traveller 2>&1 | grep -E "^(Test Suites|Tests):"
npm run typecheck 2>&1 | grep -c "error TS"   # 1 (baseline)
npx eslint src/hooks/useCanClaimTag.ts src/hooks/__tests__/useCanClaimTag.router.test.ts src/screens/shared/TagPreviewScreen.tsx src/screens/traveller/ValidateScreen.tsx src/hooks/useResumePendingScan.tsx src/screens/shared/__tests__/TagPreviewActions.router.test.tsx src/screens/traveller/__tests__/ValidateScreen.router.test.tsx
```

- [ ] **Step 9: Commit** (stage exactly the seven files above; check the branch first)

```bash
git branch --show-current   # feat/traveller-parity-tags
git add src/hooks/useCanClaimTag.ts src/hooks/__tests__/useCanClaimTag.router.test.ts src/screens/shared/TagPreviewScreen.tsx src/screens/traveller/ValidateScreen.tsx src/hooks/useResumePendingScan.tsx src/screens/shared/__tests__/TagPreviewActions.router.test.tsx src/screens/traveller/__tests__/ValidateScreen.router.test.tsx
git commit -q -F - <<'EOF'
fix(tags): offer a claim only with the self-assign grant

No claim path checked TagService.Tags + TravellerSelfAssign. The tag
preview's claim button, validate's Claim another tag and the claim that
resumes after login now need the pair; without it a resumed claim
opens the tag preview instead of posting.

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

## Task 7: super-app manual claim mode

**Files:**
- Create: `super-app/src/screens/traveller/Validate/claimInput.ts` and `src/screens/traveller/Validate/__tests__/claimInput.test.ts`
- Modify: `super-app/src/screens/traveller/Validate/ClaimTagModal.tsx`
- Modify: `super-app/src/localization/resources/en-US.json` and `tr-TR.json` (the `Qr.ClaimTag` object)
- Create: `super-app/src/screens/traveller/Validate/__tests__/ClaimTagModalManual.router.test.tsx`

**Interfaces:**
- Produces:
  - `isValidTagNumber(text: string): boolean`
  - `decimalSeparatorFor(locale: string): "." | ","`
  - `parseSalesAmount(text: string, decimal: "." | ","): number | null`
  - `ClaimTagModal` gains an optional `title?: string` prop (default `t("MobileApp.Qr.ClaimTag.Title")`).
- Consumes: `postTagTravellerSelfAssign({ tagNumber, salesAmount })` (`@/actions/TagService/actions`).

- [ ] **Step 1: Write the failing helper test** (a plain `.test.ts`, run in the `node` project):

```ts
import { decimalSeparatorFor, isValidTagNumber, parseSalesAmount } from "../claimInput";

describe("isValidTagNumber", () => {
  it("accepts letters and digits, ignoring surrounding spaces", () => {
    expect(isValidTagNumber(" TN123abc ")).toBe(true);
  });
  it("refuses empty input and anything else", () => {
    expect(isValidTagNumber("")).toBe(false);
    expect(isValidTagNumber("TN-123")).toBe(false);
    expect(isValidTagNumber("TN 123")).toBe(false);
  });
});

describe("decimalSeparatorFor", () => {
  it("uses a comma for Turkish and a point for English", () => {
    expect(decimalSeparatorFor("tr-TR")).toBe(",");
    expect(decimalSeparatorFor("en-US")).toBe(".");
  });
});

describe("parseSalesAmount", () => {
  it("reads a Turkish grouped amount", () => {
    expect(parseSalesAmount("1.234,56", ",")).toBe(1234.56);
  });
  it("reads an English grouped amount", () => {
    expect(parseSalesAmount("1,234.56", ".")).toBe(1234.56);
  });
  it("reads a plain whole amount", () => {
    expect(parseSalesAmount("250", ".")).toBe(250);
  });
  it("refuses empty input and a lone separator", () => {
    expect(parseSalesAmount("", ".")).toBeNull();
    expect(parseSalesAmount(",", ",")).toBeNull();
  });
  it("drops a typed minus, as web does, so an amount is never negative", () => {
    expect(parseSalesAmount("-5", ".")).toBe(5);
  });
});
```

  The last case pins web's behaviour: `parseAmount` keeps digits and the decimal separator only, so a typed minus is dropped rather than read as negative. Keep it, so the two apps agree.

- [ ] **Step 2: Run it to verify it fails** (`npx jest src/screens/traveller/Validate/__tests__/claimInput.test.ts`).

- [ ] **Step 3: Implement `claimInput.ts`** (a port of web's `amount-input.tsx` `parseAmount` and `getSeparators`):

```ts
export function isValidTagNumber(text: string): boolean {
  return /^[a-zA-Z0-9]+$/.test(text.trim());
}

export function decimalSeparatorFor(locale: string): "." | "," {
  try {
    const part = new Intl.NumberFormat(locale)
      .formatToParts(1.1)
      .find((p) => p.type === "decimal")?.value;
    if (part === "," || part === ".") return part;
  } catch {
    // Hermes without formatToParts: fall through to the locale rule.
  }
  return locale.toLowerCase().startsWith("tr") ? "," : ".";
}

export function parseSalesAmount(text: string, decimal: "." | ","): number | null {
  let normalized = "";
  for (const ch of text) {
    if (ch >= "0" && ch <= "9") normalized += ch;
    else if (ch === decimal) normalized += ".";
  }
  if (normalized === "" || normalized === ".") return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
```

- [ ] **Step 4: Run it to verify it passes.**

- [ ] **Step 5: Strings.** Inside `"Qr": { "ClaimTag": { … } }` in both files, add (en-US | tr-TR):

| Key | en-US | tr-TR |
| --- | --- | --- |
| `EnterManually` | Enter it manually | Elle girin |
| `ScanInstead` | Scan the QR instead | Bunun yerine QR okutun |
| `TagNumberLabel` | Tag number | Etiket numarası |
| `SalesAmountLabel` | Purchase amount | Alışveriş tutarı |
| `InvalidTagNumber` | Use letters and digits only. | Yalnızca harf ve rakam kullanın. |
| `InvalidSalesAmount` | Enter the purchase amount on your receipt. | Fişinizdeki alışveriş tutarını girin. |

  Then run `npm run init`. Check `git diff` on both files first: if another session has uncommitted edits there, stage only your hunk with `git apply --cached`.

- [ ] **Step 6: Write the failing modal test** `ClaimTagModalManual.router.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import { ClaimTagModal } from "../ClaimTagModal";

const mockSelfAssign = jest.fn();
jest.mock("@/actions/TagService/actions", () => ({
  getPublicTagByTagId: jest.fn(),
  postTagTravellerSelfAssign: (...a: unknown[]) => mockSelfAssign(...a),
}));
jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({
    t: (key: string) => key,
    formatCurrency: (n: number) => String(n),
    activeLocale: "tr-TR",
  }),
}));
jest.mock("@/components/QrScanner", () => ({ QrScanner: () => null }));
jest.mock("@/components/Ionicons", () => ({ Ionicons: () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/utils/logger", () => ({ logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

function openManual() {
  render(<ClaimTagModal onClose={jest.fn()} onClaimed={jest.fn()} onClaimAttempted={jest.fn()} />);
  fireEvent.press(screen.getByText("MobileApp.Qr.ClaimTag.EnterManually"));
}

beforeEach(() => jest.clearAllMocks());

it("claims a typed tag number with a Turkish-formatted amount", async () => {
  mockSelfAssign.mockResolvedValue({ id: "t1", tagNumber: "TN123" });
  openManual();

  fireEvent.changeText(screen.getByTestId("claim-manual-tag-number"), "TN123");
  fireEvent.changeText(screen.getByTestId("claim-manual-sales-amount"), "1.234,56");
  fireEvent.press(screen.getByText("MobileApp.Qr.ClaimTag.Claim"));

  await waitFor(() => expect(mockSelfAssign).toHaveBeenCalledWith({ tagNumber: "TN123", salesAmount: 1234.56 }));
  expect(await screen.findByText("MobileApp.Qr.ClaimTag.Claimed")).toBeTruthy();
});

it("refuses a tag number with symbols without calling the server", () => {
  openManual();

  fireEvent.changeText(screen.getByTestId("claim-manual-tag-number"), "TN-1");
  fireEvent.changeText(screen.getByTestId("claim-manual-sales-amount"), "10");
  fireEvent.press(screen.getByText("MobileApp.Qr.ClaimTag.Claim"));

  expect(screen.getByText("MobileApp.Qr.ClaimTag.InvalidTagNumber")).toBeTruthy();
  expect(mockSelfAssign).not.toHaveBeenCalled();
});

it("refuses a missing amount without calling the server", () => {
  openManual();

  fireEvent.changeText(screen.getByTestId("claim-manual-tag-number"), "TN1");
  fireEvent.press(screen.getByText("MobileApp.Qr.ClaimTag.Claim"));

  expect(screen.getByText("MobileApp.Qr.ClaimTag.InvalidSalesAmount")).toBeTruthy();
  expect(mockSelfAssign).not.toHaveBeenCalled();
});
```

  If the modal's `Button` from `@/components/rnr` or the RN `Modal` keeps the test from loading or pressing, mock only the module the error names, then re-run until it fails on its assertions.

- [ ] **Step 7: Run it to verify it fails** (`npx jest src/screens/traveller/Validate/__tests__/ClaimTagModalManual.router.test.tsx`). Expected: `MobileApp.Qr.ClaimTag.EnterManually` is not found.

- [ ] **Step 8: Implement the manual mode in `ClaimTagModal.tsx`.**
  - **Docblock:** rewrite the "Deliberately scan-only…" paragraph to one sentence saying a tag can be claimed by scanning its QR or by typing the tag number and purchase amount, as on web.
  - **Imports:** `Input` (with `Button`, `Text`) from `@/components/rnr`, and `decimalSeparatorFor`, `isValidTagNumber`, `parseSalesAmount` from `./claimInput`. Read `activeLocale` from `useLocalization()` alongside `t` and `formatCurrency`.
  - **Prop:** add `title` (optional string) to the props, and use `title ?? t("MobileApp.Qr.ClaimTag.Title")` for both the card heading and `QrScanner`'s `title`.
  - **State:** `const [manual, setManual] = useState(false); const [manualTagNumber, setManualTagNumber] = useState(""); const [manualAmount, setManualAmount] = useState("");`
  - **`reset`:** also clears `manual`, `manualTagNumber` and `manualAmount`.
  - **New handlers:**

```tsx
  const openManual = useCallback(() => {
    setScannerOpen(false);
    setTag(null);
    setMessage(null);
    setClaimedNumber(null);
    setManual(true);
  }, []);

  const handleManualClaim = useCallback(async () => {
    if (isBusy) return;
    const tagNumber = manualTagNumber.trim();
    if (!isValidTagNumber(tagNumber)) {
      setMessage(t("MobileApp.Qr.ClaimTag.InvalidTagNumber"));
      return;
    }
    const salesAmount = parseSalesAmount(manualAmount, decimalSeparatorFor(activeLocale));
    if (salesAmount === null) {
      setMessage(t("MobileApp.Qr.ClaimTag.InvalidSalesAmount"));
      return;
    }
    setIsBusy(true);
    setIsClaiming(true);
    onClaimAttempted();
    try {
      const claimed = await postTagTravellerSelfAssign({ tagNumber, salesAmount });
      onClaimed(tagNumber, claimed?.id);
      setManual(false);
      setManualTagNumber("");
      setManualAmount("");
      setMessage(null);
      setClaimedNumber(tagNumber);
    } catch (error) {
      logger.warn("[ClaimTag] manual claim failed", error);
      const serverMessage =
        error instanceof ApiError
          ? (error.body as Volo_Abp_Http_RemoteServiceErrorResponse | undefined)?.error?.message
          : undefined;
      setMessage(serverMessage || t("MobileApp.Qr.ClaimTag.ClaimError"));
    } finally {
      setIsBusy(false);
      setIsClaiming(false);
    }
  }, [activeLocale, isBusy, manualAmount, manualTagNumber, onClaimAttempted, onClaimed, t]);
```

  - **Render:** in the body's ternary, before the `isBusy && !tag` skeleton branch, add a branch for `manual`:

```tsx
          {manual ? (
            <View className="gap-3">
              <Input
                testID="claim-manual-tag-number"
                label={t("MobileApp.Qr.ClaimTag.TagNumberLabel")}
                value={manualTagNumber}
                onChangeText={setManualTagNumber}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <Input
                testID="claim-manual-sales-amount"
                label={t("MobileApp.Qr.ClaimTag.SalesAmountLabel")}
                value={manualAmount}
                onChangeText={setManualAmount}
                keyboardType="decimal-pad"
              />
              <Button
                action={{
                  onPress: () => void handleManualClaim(),
                  label: isBusy ? t("MobileApp.Qr.ClaimTag.Claiming") : t("MobileApp.Qr.ClaimTag.Claim"),
                }}
                isLoading={isBusy}
              />
              <Button
                variant="secondary"
                action={{ onPress: reset, label: t("MobileApp.Qr.ClaimTag.ScanInstead") }}
                disabled={isBusy}
                textClassName="text-base"
              />
            </View>
          ) : isBusy && !tag ? (
```

  - **Idle and success branch:** this is the last branch, holding Scan another and Done. Between those two buttons add:

```tsx
              <Button
                variant="secondary"
                action={{ onPress: openManual, label: t("MobileApp.Qr.ClaimTag.EnterManually") }}
                textClassName="text-base"
              />
```

  - The test opens the modal and presses "Enter it manually" straight away. `QrScanner` is mocked, so the idle branch is on screen beneath it. If `scannerOpen` hides the card in the real component, keep the `openManual` entry reachable from the idle card: that is where the device lands after cancelling the scanner.

- [ ] **Step 9: Run the tests**

```bash
npx jest src/screens/traveller 2>&1 | grep -E "^(Test Suites|Tests):"
npm run typecheck 2>&1 | grep -c "error TS"   # 1 (baseline)
npx eslint src/screens/traveller/Validate/claimInput.ts src/screens/traveller/Validate/ClaimTagModal.tsx src/screens/traveller/Validate/__tests__/claimInput.test.ts src/screens/traveller/Validate/__tests__/ClaimTagModalManual.router.test.tsx
```

- [ ] **Step 10: Commit** (stage exactly the six paths; check the branch first)

```bash
git add src/screens/traveller/Validate/claimInput.ts src/screens/traveller/Validate/__tests__/claimInput.test.ts src/screens/traveller/Validate/ClaimTagModal.tsx src/screens/traveller/Validate/__tests__/ClaimTagModalManual.router.test.tsx src/localization/resources/en-US.json src/localization/resources/tr-TR.json
git commit -q -F - <<'EOF'
feat(tags): claim a tag by typing its number and purchase amount

The claim modal could only scan. It now has a manual mode that posts
traveller-self-assign with the typed tag number and a locale-parsed
purchase amount, as web's claim dialog does; the scan path is unchanged.

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

## Task 8: super-app "Claim a tag" on the Tags tab

**Files:**
- Modify: `super-app/src/screens/shared/Tags/Tag/_components/TagListHeader.tsx` (props `:20-56`, and render after the `onUpload` control at `:210-221`)
- Modify: `super-app/src/screens/shared/Tags/Tag/TagScreen.tsx` (around `:880-905`, plus mounting the modal)
- Modify: the `Tags` object in `super-app/src/localization/resources/en-US.json` and `tr-TR.json` (one key)
- Create: `super-app/src/screens/shared/Tags/Tag/__tests__/TagScreenClaimEntry.router.test.tsx`

**Interfaces:**
- Consumes: `useCanClaimTag` (Task 6); `ClaimTagModal` with `title` (Task 7); `loadTags` (`@/hooks/useLoadTags`).
- Produces: a `TagListHeader` prop `onClaim?: () => void`.

- [ ] **Step 1: String.** Add `"ClaimTag": "Claim a tag"` to the `Tags` object in `en-US.json`, and `"ClaimTag": "Etiket ekle"` in `tr-TR.json`. Then run `npm run init`, with the same foreign-hunk check as in Task 7.

- [ ] **Step 2: Write the failing screen test.**
  - Copy the mock block (every `jest.mock(...)` and the `renderScreen`/`signIn` helpers) from `src/screens/shared/Tags/Tag/__tests__/TagScreenUploadEntry.router.test.tsx`. That suite already renders the traveller Tags tab with its header.
  - Change `signIn` so it takes a `grantedPolicies` record.
  - Add `jest.mock("@/screens/traveller/Validate/ClaimTagModal", () => ({ ClaimTagModal: ({ title }: { title?: string }) => { const { Text } = jest.requireActual("react-native"); const ReactLib = jest.requireActual("react"); return ReactLib.createElement(Text, null, "claim-modal:" + title); } }));`
  - Then:

```tsx
const PAIR = { "TagService.Tags": true, "TagService.Tags.TravellerSelfAssign": true };

it("offers a traveller holding the claim grant a Claim a tag entry that opens the modal", () => {
  signIn("traveller", PAIR);
  renderScreen();

  fireEvent.press(screen.getByText("MobileApp.Tags.ClaimTag"));

  expect(screen.getByText("claim-modal:MobileApp.Tags.ClaimTag")).toBeTruthy();
});

it("does not offer it without the grant", () => {
  signIn("traveller", {});
  renderScreen();

  expect(screen.queryByText("MobileApp.Tags.ClaimTag")).toBeNull();
});

it("does not offer it to staff", () => {
  signIn("customs", PAIR);
  renderScreen();

  expect(screen.queryByText("MobileApp.Tags.ClaimTag")).toBeNull();
});
```

  If the copied suite reaches the header differently (for example through the Verifications tab), follow its pattern. The entry belongs on the **Tags** tab (`activeTab === "tags"`).

- [ ] **Step 3: Run it to verify it fails.**

- [ ] **Step 4: Implement it.**
  - **`TagListHeader.tsx`:** add `onClaim?: () => void` to the props, with the doc comment "Traveller only, with the claim grant, on the tags tab". Render it right after the `onUpload` block, using the same markup with `add-circle-outline` and `t("MobileApp.Tags.ClaimTag")`:

```tsx
      {onClaim && (
        <Pressable
          onPress={onClaim}
          accessibilityRole="button"
          className="flex-row items-center justify-center gap-2 rounded-md border border-primary bg-primary/10 py-2.5"
        >
          <Ionicons name="add-circle-outline" size={18} className="text-primary" />
          <Text className="text-sm font-semibold text-primary">{t("MobileApp.Tags.ClaimTag")}</Text>
        </Pressable>
      )}
```

  - **`TagScreen.tsx`:**
    - Add `const canClaim = useCanClaimTag();` and `const [claimOpen, setClaimOpen] = useState(false);`.
    - Pass `onClaim={canClaim && activeTab === "tags" ? () => setClaimOpen(true) : undefined}` to `TagListHeader`.
    - Mount the modal near the other sheets: `{claimOpen && (<ClaimTagModal title={t("MobileApp.Tags.ClaimTag")} onClose={() => setClaimOpen(false)} onClaimed={() => undefined} onClaimAttempted={() => void loadTags(true)} />)}`.
    - Import `ClaimTagModal` from `@/screens/traveller/Validate/ClaimTagModal`. `loadTags` is already imported in this file; check that, and add the import if not.
    - Use the `t` the screen already has.

- [ ] **Step 5: Run the tests**

```bash
npx jest src/screens/shared/Tags/Tag 2>&1 | grep -E "^(Test Suites|Tests):"
npm run typecheck 2>&1 | grep -c "error TS"   # 1
npx eslint src/screens/shared/Tags/Tag/_components/TagListHeader.tsx src/screens/shared/Tags/Tag/TagScreen.tsx src/screens/shared/Tags/Tag/__tests__/TagScreenClaimEntry.router.test.tsx
```
Expected: every `Tags/Tag` suite passes, including the existing `TagScreen*` ones.

- [ ] **Step 6: Commit** (stage exactly the five paths; check the branch first)

```bash
git add src/screens/shared/Tags/Tag/_components/TagListHeader.tsx src/screens/shared/Tags/Tag/TagScreen.tsx src/screens/shared/Tags/Tag/__tests__/TagScreenClaimEntry.router.test.tsx src/localization/resources/en-US.json src/localization/resources/tr-TR.json
git commit -q -F - <<'EOF'
feat(tags): claim a tag from the Tags tab

A traveller holding the claim grant gets a Claim a tag control on the
Tags tab that opens the claim modal with scan and manual entry, as web
offers on its tags page. Manual claim was otherwise reachable only from
validate results.

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

## Task 9: Final gates, manual pass, push, PRs (controller)

- [ ] **Step 1: ssr gates.** Run `test:unit`, `type-check`, `lint` and `git status`; the branch is `feat/traveller-parity-tags`. Compare with Task 0.

- [ ] **Step 2: super-app gates.** Run `npx jest` and `npm run typecheck`; check `git log --oneline feat/traveller-web-parity..HEAD` shows only Tasks 6–8 (3 commits). Compare with Task 0.

- [ ] **Step 3: Manual pass.**
  - **ssr, `:3010`, signed in as the traveller:**
    - the detail sections;
    - the public page has no traveller block;
    - sort and filter work, and the URL carries local dates;
    - rows show the purchase amount and chips;
    - the Already validated group, only if a scan is possible; otherwise mark it unverified;
    - the navbar has no Claim Tag link.
  - **super-app on CPadNFC through Metro:** the Tags tab shows Claim a tag; it opens the modal; "Enter it manually" shows both fields. **Do not press Claim** on a real tag. Settle 2 seconds before each screenshot.
  - Record which checks ran.

- [ ] **Step 4: Push and open the PRs.**
  - ssr: `git push`, then a PR to `main` in `unirefund-web`, using the repo's PR template. Re-check `git rev-list --left-right --count origin/main...HEAD` first.
  - super-app: `git push -u origin feat/traveller-parity-tags`, then a PR in `unirefund-mobile` with **base `feat/traveller-web-parity`**, noting that it's to be retargeted to `main` once #64 merges.
  - Keep vulnerability detail out of PR bodies.

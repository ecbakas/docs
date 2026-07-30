# Web Scan-Sticker Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the web sticker-scan page issue a tag straight to a traveller and capture signatures, as the mobile app already does.

**Architecture:** Nothing is built from scratch. `SearchTraveller` is already a shared component; `MerchantSignature` is already a generic signature pad wearing a specific name, so it is generalised and hoisted; and `tax-free-tags/new` already proves the `hasTraveller ? "Issued" : "Draft"` rule and the data-URL prefix strip. The work is wiring these into one page and respecting one DTO asymmetry: only the merchant's request has a merchant-signature field.

**Tech Stack:** Next.js App Router, TypeScript, React, `@repo/ayasofyazilim-ui`, generated `TagService` SDK.

**Spec:** [2026-07-30-web-scan-sticker-parity-design.md](../specs/2026-07-30-web-scan-sticker-parity-design.md)
**Catalogue:** #12 and #13

## Global Constraints

- **Every code change is in `C:\Users\ertugrul.bakas.AYASOFYAZILIM\Repositories\unirefund-web`, branch `catch-backend`.** The plan and briefs live in `C:\mobile\app`; never commit code there.
- **Never regenerate an SDK.** Every type and endpoint already exists.
- **Verification runs from `apps/web`:** `npx tsc --noEmit` and `npx eslint "<changed file>"`. Both exit 0 before this plan starts, so any error is yours. **Never run a full Next build** — slow, and not the gate.
- This page has no test suite; `tsc` and lint are the verification. Expected, not a gap.
- **`QR.md` at the repo root is intentionally untracked. Never `git add` it.**
- **No new i18n keys.** Everything needed already exists: `Form.NewTag.MerchantSignature`, `Form.NewTag.TravellerSignature`, `Form.NewTag.SignatureDescription`, `Form.NewTag.Signature.EmptyError`, `Form.NewTag.Signature.SavedSuccess`, `Form.NewTag.Traveller`, `Default.Close`, `Default.Save`.
- **The role split must survive.** A merchant posts `CreateTagRequestDto` via `postTagApi`; a Refund Point posts `CreateTagByStickerLineRequestDto` via `postTagByStickerLineApi`. Only the former has `merchantIndividualSignatureBase64`.
- **Commit after every task** with the message in that task's final step.

---

### Task 1: Generalise the signature pad and hoist it

**Repo:** `unirefund-web`

**Files:**
- Create: `apps/web/src/components/signature-pad.tsx`
- Delete: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/tax-free-tags/new/_components/merchant-signature.tsx`
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/tax-free-tags/new/client.tsx`

**Interfaces:**
- Produces, consumed by Task 3:
  ```ts
  export function SignaturePad(props: {
    label: string;
    testId: string;
    onSignatureChange?: (signature: string | undefined) => void;
    disabled?: boolean;
  }): JSX.Element
  ```
  `label` is used for both the trigger button and the dialog title. `testId` prefixes the four `data-testid` attributes.

**Why.** `MerchantSignature`'s only props are `onSignatureChange` and `disabled` — everything inside is a draw pad, a save and a preview. The single merchant-specific thing is the label, used twice. Task 3 needs two pads on one page, and two near-identical components in one app is the alternative. `apps/web/src/components/` already holds the sibling traveller components (`search-traveller.tsx`, `scan-traveller-camera.tsx`), so it is the established home.

- [ ] **Step 1: Create the generalised component**

Create `apps/web/src/components/signature-pad.tsx` with the body of the old `merchant-signature.tsx`, changed in exactly three ways: the two label reads become `{label}`, the four `data-testid` values are built from `testId`, and the comment describes the general component. Everything else — the dialog, the `fromDataURL` restore on reopen, the empty check, the toasts, the green border once saved — is carried over unchanged.

```tsx
"use client";

import { useTranslations } from "@/src/providers/i18n";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@repo/ayasofyazilim-ui/components/dialog";
import { toast } from "@repo/ayasofyazilim-ui/components/sonner";
import { DrawPad, DrawPadHandle } from "@repo/ayasofyazilim-ui/custom/draw-pad";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import { Signature } from "lucide-react";
import { useRef, useState } from "react";

/**
 * A labelled signature pad in a dialog. The trigger is a plain Button so it can
 * live outside a SidebarProvider.
 *
 * Generalised from the merchant-only version in the new-tag flow: the label was
 * the only thing about it that was merchant-specific, and the sticker-scan page
 * needs two of these on one screen.
 *
 * Reports the signature as a `data:` URL. Callers that send it to the API strip
 * the prefix with `.split(",")[1]`.
 */
export function SignaturePad({
  label,
  testId,
  onSignatureChange,
  disabled,
}: {
  label: string;
  /** Prefix for this pad's `data-testid` attributes, unique per pad on a page. */
  testId: string;
  onSignatureChange?: (signature: string | undefined) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslations();
  const padRef = useRef<DrawPadHandle>(null);
  const [showSignature, setShowSignature] = useState(false);
  const [savedSignature, setSavedSignature] = useState<string | undefined>(
    undefined
  );

  return (
    <Dialog
      open={showSignature}
      onOpenChange={(open) => {
        setShowSignature(open);
        if (open && savedSignature) {
          setTimeout(() => padRef.current?.fromDataURL(savedSignature), 0);
        }
      }}
    >
      <DialogTrigger asChild data-testid={`${testId}-trigger`}>
        <Button
          data-testid={`${testId}-button`}
          variant="outline"
          disabled={disabled}
          className={cn(
            "justify-start",
            savedSignature && "border-green-500 text-green-600!"
          )}
        >
          <Signature className="size-4" />
          <span>{label}</span>
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogTitle>{label}</DialogTitle>
        <DialogDescription>
          {t.TagService["Form.NewTag.SignatureDescription"]}
        </DialogDescription>
        <DrawPad
          className="dark:[&>canvas]:invert"
          ref={padRef}
          showClear
          showFullscreen
        />
        <DialogFooter>
          <Button
            data-testid={`${testId}-close`}
            variant="ghost"
            onClick={() => setShowSignature(false)}
          >
            {t.Default.Close}
          </Button>
          <Button
            data-testid={`${testId}-save`}
            onClick={() => {
              if (!padRef.current || padRef.current.isEmpty()) {
                toast.error(t.TagService["Form.NewTag.Signature.EmptyError"]);
                return;
              }
              const dataUrl = padRef.current.toDataURL();
              setSavedSignature(dataUrl);
              onSignatureChange?.(dataUrl);
              toast.success(t.TagService["Form.NewTag.Signature.SavedSuccess"]);
              setShowSignature(false);
            }}
          >
            {t.Default.Save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Repoint the existing caller**

In `apps/web/src/app/[lang]/(main)/(unirefund)/operations/tax-free-tags/new/client.tsx`, replace the `MerchantSignature` import with:

```tsx
import { SignaturePad } from "@/components/signature-pad";
```

and its usage with:

```tsx
          <SignaturePad
            label={t.TagService["Form.NewTag.MerchantSignature"]}
            testId="new-tag-v2-merchant-signature"
            onSignatureChange={setMerchantSignature}
          />
```

Keep any other props the existing call passes (such as `disabled`). The `testId` value reproduces the old `data-testid` strings exactly, so nothing that targeted them changes.

If `t` is not already in scope at that point in the file, it is — `client.tsx` already calls `useTranslations()` for other copy.

- [ ] **Step 3: Delete the old component**

```bash
git rm "apps/web/src/app/[lang]/(main)/(unirefund)/operations/tax-free-tags/new/_components/merchant-signature.tsx"
```

- [ ] **Step 4: Verify**

From `apps/web`:

```bash
npx tsc --noEmit
npx eslint src/components/signature-pad.tsx "src/app/[lang]/(main)/(unirefund)/operations/tax-free-tags/new/client.tsx"
```

Expected: exit 0, no errors. A `tsc` error naming `MerchantSignature` means a second caller exists that this task did not know about — report it rather than working around it.

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/src/components/signature-pad.tsx "apps/web/src/app/[lang]/(main)/(unirefund)/operations/tax-free-tags"
git commit -m "refactor(web): generalise the merchant signature pad into a shared SignaturePad"
```

---

### Task 2: Issue a sticker tag straight to a traveller

**Repo:** `unirefund-web`

**Files:**
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/scan-sticker/page.tsx`

**Interfaces:**
- Consumes: `SearchTraveller` from `@/components/search-traveller`, whose props are `{ setTraveller: (t: UniRefund_TagService_Travellers_TravellerRequestDto) => void; disabled?: boolean; initialValue?: string; className?: string; variant?: "stacked" | "compact" | "tabbed" }`. Note it is `setTraveller`, **not** `onSelect`, and it never reports a clear — clearing is the page's own state change.
- Produces, consumed by Task 3: page state `traveller` and the derived `hasTraveller`.

- [ ] **Step 1: Add the state and the import**

At the top of the file, add to the existing imports:

```tsx
import { SearchTraveller } from "@/components/search-traveller";
```

and add `UniRefund_TagService_Travellers_TravellerRequestDto` to the existing `@repo/saas/TagService` type import.

Inside the component, beside the other `useState` calls:

```tsx
  // A traveller is optional. With one the tag is Issued; without one it goes out
  // as a Draft the traveller claims later by scanning the same sticker.
  const [traveller, setTraveller] =
    useState<UniRefund_TagService_Travellers_TravellerRequestDto | null>(null);
  const hasTraveller = Boolean(traveller?.travellerDocumentNumber);
```

- [ ] **Step 2: Clear the traveller on rescan**

`handleRescan` resets the scan; a traveller picked for the previous sticker must not survive into the next one. Add to it:

```tsx
    setTraveller(null);
```

- [ ] **Step 3: Render the picker in the scanned card**

In the scanned card, directly **below** the merchant block and **above** the invoice-number field, add:

```tsx
            <div className="grid gap-1.5">
              <Label data-testid="traveller-label">
                {t.TagService["Form.NewTag.Traveller"]}
              </Label>
              {traveller ? (
                <div className="flex items-center justify-between gap-2 rounded-md border p-2">
                  <span className="text-sm font-medium">
                    {traveller.firstName} {traveller.lastName}
                    <span className="text-muted-foreground ml-2 text-xs">
                      {traveller.travellerDocumentNumber}
                    </span>
                  </span>
                  <Button
                    data-testid="clear-traveller-button"
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() => setTraveller(null)}
                  >
                    {t.Default.Clear}
                  </Button>
                </div>
              ) : (
                <SearchTraveller
                  setTraveller={setTraveller}
                  disabled={isPending}
                  variant="compact"
                />
              )}
            </div>
```

Both keys used here are confirmed present: `Default.Clear` in the core Default resources, and `Form.NewTag.Traveller` at line 348 of the TagService resources. No new key is needed.

- [ ] **Step 4: Send the traveller and the right status**

In `handleIssueTag`'s `startTransition` callback, both request bodies currently hardcode `status: "Draft"`. Change **both** to:

```tsx
            status: hasTraveller ? "Issued" : "Draft",
```

and add, to **both** bodies, immediately after `stickerLineNumber`:

```tsx
            ...(hasTraveller && traveller ? { traveller } : {}),
```

Both DTOs carry an optional `traveller`, so the role split is unaffected. The `hasTraveller && traveller` pair is what narrows `traveller` from `| null` for TypeScript while keeping the emptiness rule in one place.

- [ ] **Step 5: Verify**

From `apps/web`:

```bash
npx tsc --noEmit
npx eslint "src/app/[lang]/(main)/(unirefund)/operations/scan-sticker/page.tsx"
```

Expected: exit 0, no errors. If `Label` or `Button` is not already imported in this file, add it from `@repo/ayasofyazilim-ui/components/...` alongside the existing component imports.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/[lang]/(main)/(unirefund)/operations/scan-sticker/page.tsx"
git commit -m "feat(scan-sticker): issue a tag straight to a traveller"
```

---

### Task 3: Capture signatures

Ships the feature.

**Repo:** `unirefund-web`

**Files:**
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/scan-sticker/page.tsx`

**Interfaces:**
- Consumes: `SignaturePad` from `@/components/signature-pad` (Task 1), props `{ label, testId, onSignatureChange?, disabled? }`; the `traveller` / `hasTraveller` state (Task 2).

**The asymmetry this task exists around.** `CreateTagRequestDto` — the merchant's — has both `merchantIndividualSignatureBase64` and `travellerSignatureBase64`. `CreateTagByStickerLineRequestDto` — the Refund Point's — has only `travellerSignatureBase64`. So a merchant sees two pads and a Refund Point one, and the merchant signature is never sent on the Refund Point body. The same asymmetry the mobile app has, forced by the DTOs rather than chosen.

- [ ] **Step 1: Add the state and the import**

Add to the imports:

```tsx
import { SignaturePad } from "@/components/signature-pad";
```

and, beside the other `useState` calls:

```tsx
  // Captured as `data:` URLs; the prefix is stripped when the body is built.
  const [merchantSignature, setMerchantSignature] = useState<
    string | undefined
  >(undefined);
  const [travellerSignature, setTravellerSignature] = useState<
    string | undefined
  >(undefined);
```

- [ ] **Step 2: Clear both on rescan**

In `handleRescan`, alongside the traveller reset:

```tsx
    setMerchantSignature(undefined);
    setTravellerSignature(undefined);
```

- [ ] **Step 3: Render the pads**

In the scanned card, directly **above** the Rescan / Issue-tag button row, add:

```tsx
            {/*
              A Refund Point gets the traveller pad only: its
              `CreateTagByStickerLineRequestDto` has no merchant-signature field,
              so a merchant signature captured here would have nowhere to go.
            */}
            <div className="flex flex-col gap-2 sm:flex-row">
              {isMerchantUser && (
                <SignaturePad
                  label={t.TagService["Form.NewTag.MerchantSignature"]}
                  testId="scan-sticker-merchant-signature"
                  onSignatureChange={setMerchantSignature}
                  disabled={isPending}
                />
              )}
              <SignaturePad
                label={t.TagService["Form.NewTag.TravellerSignature"]}
                testId="scan-sticker-traveller-signature"
                onSignatureChange={setTravellerSignature}
                disabled={isPending || !hasTraveller}
              />
            </div>
```

The traveller pad is disabled until a traveller is attached: its signature is only ever sent alongside one, so offering it earlier would invite a capture that is silently discarded.

- [ ] **Step 4: Send them**

In `handleIssueTag`'s `startTransition` callback:

To the **merchant** body (`postTagApi`), after `invoices`:

```tsx
            merchantIndividualSignatureBase64: merchantSignature?.split(",")[1],
            travellerSignatureBase64: hasTraveller
              ? travellerSignature?.split(",")[1]
              : undefined,
```

To the **Refund Point** body (`postTagByStickerLineApi`), after `invoices`:

```tsx
            travellerSignatureBase64: hasTraveller
              ? travellerSignature?.split(",")[1]
              : undefined,
```

Do **not** add `merchantIndividualSignatureBase64` to the Refund Point body — that DTO has no such field and `tsc` will reject it.

The `.split(",")[1]` strips the `data:image/png;base64,` prefix, matching what `tax-free-tags/new/client.tsx` already does.

- [ ] **Step 5: Verify**

From `apps/web`:

```bash
npx tsc --noEmit
npx eslint "src/app/[lang]/(main)/(unirefund)/operations/scan-sticker/page.tsx"
```

Expected: exit 0, no errors.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/[lang]/(main)/(unirefund)/operations/scan-sticker/page.tsx"
git commit -m "feat(scan-sticker): capture merchant and traveller signatures"
```

---

### Task 4: Record the delivered state

**Repos:** both. `QR.md` exists at the root of each and its catalogue section is kept **byte-identical** across the two.

**Files:**
- Modify: `C:\mobile\app\QR.md`
- Modify: `C:\Users\ertugrul.bakas.AYASOFYAZILIM\Repositories\unirefund-web\QR.md`
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/scan-sticker/README.md` (web repo)

- [ ] **Step 1: Flip the catalogue rows**

In `C:\mobile\app\QR.md`, section B, change rows **12** and **13**'s `apps/web` column from `❌` to `✅`. Change nothing else in the tables.

In the **Do** table, remove the rows for 12 and 13, and add a line beneath the table:

```markdown
**Delivered 2026-07-30:** #12 and #13 on web — a sticker tag can be issued straight to a traveller, and merchant and traveller signatures are captured. Design: `docs/superpowers/specs/2026-07-30-web-scan-sticker-parity-design.md` in `mobile/app`.
```

- [ ] **Step 2: Mirror the catalogue**

Run from `C:\mobile\app`:

```bash
python - <<'PY'
import io
src = io.open('QR.md', encoding='utf-8').read()
marker = "\n---\n\n# QR capability catalogue"
appendix = src[src.index(marker):]
dst_path = r'C:\Users\ertugrul.bakas.AYASOFYAZILIM\Repositories\unirefund-web\QR.md'
dst = io.open(dst_path, encoding='utf-8').read()
io.open(dst_path, 'w', encoding='utf-8', newline='').write(dst[:dst.index(marker)] + appendix)
print("mirrored")
PY
```

Confirm:

```bash
diff <(sed -n '/^---$/,$p' QR.md) <(sed -n '/^---$/,$p' /c/Users/ertugrul.bakas.AYASOFYAZILIM/Repositories/unirefund-web/QR.md) && echo IDENTICAL
```

**Both `QR.md` files are untracked. Do not `git add` either one.**

- [ ] **Step 3: Update the page README**

Read `apps/web/src/app/[lang]/(main)/(unirefund)/operations/scan-sticker/README.md` and edit it in place, preserving its structure and heading style. Add that the page now offers an optional traveller — with one the tag is `Issued`, without one `Draft` — and that it captures signatures, with a merchant seeing both pads and a Refund Point only the traveller pad because `CreateTagByStickerLineRequestDto` has no merchant-signature field. Do not rewrite it wholesale.

- [ ] **Step 4: Verify and commit the README**

From `apps/web`:

```bash
npx tsc --noEmit
```

Expected: exit 0 — a docs-only change should not move it.

From the web repo root:

```bash
git add "apps/web/src/app/[lang]/(main)/(unirefund)/operations/scan-sticker/README.md"
git commit -m "docs(scan-sticker): describe the traveller and signature capture"
```

Nothing to commit in the mobile repo for this task — its only change is the untracked `QR.md`.

---

---

### Task 5: Reshape the scanned card to match the new-tag page

**Run this BEFORE Task 4**, so the README that task writes describes the final layout once.

**Repo:** `unirefund-web`, branch `catch-backend`

**Files:**
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/scan-sticker/page.tsx`

**Interfaces:** consumes only what Tasks 1-3 already added. This task changes **layout only** — no state, no handler, no request body, no guard.

**Why.** The page is a `Card` while its sibling `operations/tax-free-tags/new` is a centred column, so the two create-a-tag screens look unrelated. Matching the shell makes them read as one product.

**What is explicitly NOT changing.** `InvoiceForm` from the new-tag page is *not* reused. It owns a free merchant search and fetches its own product groups, which would bypass this page's role split, its permission-gated picker and its foreign-book refusal — on the one page where the merchant choice permanently allocates a sticker book. Merchant resolution stays exactly as it is.

- [ ] **Step 1: Read the two files side by side**

Read the target shell in `operations/tax-free-tags/new/client.tsx` — its `return` is a centred `max-w-3xl` column: a header row with the title and the traveller control, a `rounded-md border` block, then a footer stack ending in the primary button.

Then read the `pageStatus === "scanned"` branch of `scan-sticker/page.tsx`, currently a `<Card>` / `<CardHeader>` / `<CardContent>`.

- [ ] **Step 2: Replace the Card shell**

Inside the `pageStatus === "scanned" && scannedData && invoice && (...)` branch **only**, replace the `<Card className="m-auto w-full max-w-2xl">` wrapper, its `<CardHeader>` and its `<CardContent>` with:

```tsx
        <div className="m-auto flex w-full max-w-3xl flex-col gap-4 p-2 md:p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 text-lg font-semibold">
                <CheckCircle2 className="size-5 text-green-500" />
                {t.TagService["AssignSticker.ScanSuccess"]}
              </h1>
              <p className="text-muted-foreground truncate text-sm">
                {scannedData.stickerLine.stickerLineNumber}
              </p>
            </div>
            {/* Traveller sits in the header, as on the new-tag page. */}
            <div className="shrink-0">{/* traveller control moves here */}</div>
          </div>

          <div className="flex flex-col gap-4 rounded-md border p-4">
            {/* merchant block, invoice number, product groups, totals */}
          </div>

          <div className="flex flex-col gap-2">
            {/* signature pads, then the button row */}
          </div>
        </div>
```

Move the existing children into those three slots **unchanged**: the merchant block, the invoice-number field, the product-group table and the totals row into the bordered block; the signature pads and the Rescan / Issue-tag row into the footer stack; and the traveller control from wherever it currently sits into the header slot.

Keep the `m-auto`. The page's root element keeps its existing `pp-0 parent-overflow-hidden` classes untouched — those are a documented contract with `SidebarLayout`, not styling, and the README explains why.

- [ ] **Step 3: Drop the now-unused imports**

`Card`, `CardContent`, `CardDescription`, `CardHeader` and `CardTitle` are no longer used by this file. Remove them from the `@repo/ayasofyazilim-ui/components/card` import. If the whole import becomes empty, delete the line. `tsc` and lint will confirm.

- [ ] **Step 4: Leave every other state alone**

The `idle` and `loading` branches use `<Empty>` and are untouched. So are `handleScan`, `handleIssueTag`, `handleRescan`, `handleMerchantSelect`, every guard, and both request bodies.

- [ ] **Step 5: Verify**

From `apps/web`:

```bash
npx tsc --noEmit
npx eslint "src/app/[lang]/(main)/(unirefund)/operations/scan-sticker/page.tsx"
```

Expected: exit 0. An unused-import error here is the expected signal from Step 3, not a surprise — fix it by removing the import rather than by re-adding a usage.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/[lang]/(main)/(unirefund)/operations/scan-sticker/page.tsx"
git commit -m "refactor(scan-sticker): match the new-tag page layout"
```

---

### Task 6: Use AddTravellerDialog, as the new-tag page does

**Repo:** `unirefund-web`, branch `catch-backend`

**Files:**
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/scan-sticker/client.tsx`
- Rewrite: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/scan-sticker/page.tsx` (becomes a thin server page)
- Move: `add-traveller-dialog.tsx` to `apps/web/src/components/` — see Step 3

**Why.** `AddTravellerDialog` is a superset of the `SearchTraveller` this page uses today: it wraps that same search (gated on a search grant), adds `TravellerForm` for a traveller not yet on file, and owns the traveller signature. It needs a `countries` prop, which is why the page must gain a server half.

- [ ] **Step 1: Split the page into server and client**

`page.tsx` is currently the whole client component. Move it verbatim to `client.tsx`, renaming the default export to a named `Client` export and keeping `"use client"` at the top. Add a `countries` prop:

```tsx
export function Client({
  countries,
}: {
  countries: UniRefund_CRMService_Countries_CountryDto[];
}) {
```

- [ ] **Step 2: Write the server page**

Model it on `operations/tax-free-tags/new/page.tsx`, which does exactly this — read that file first and follow its shape, including how it unwraps the countries response and how it renders `ErrorComponent` on failure.

**Verify the response shape rather than guessing.** Pass `countries` in exactly the shape `AddTravellerDialog` expects. If `tsc` disagrees, follow the type — never cast. Report what the real shape was.

- [ ] **Step 3: Make the dialog importable**

`AddTravellerDialog` lives in `tax-free-tags/new/_components/`. This codebase hoists to a common ancestor rather than importing sideways from another route's `_components`. Move it to `apps/web/src/components/add-traveller-dialog.tsx`, alongside the `search-traveller.tsx` it already imports, and repoint `new/client.tsx`.

If it imports `./traveller-form` or other siblings, move only the dialog and import those by absolute path back to their existing location — do **not** cascade the move through the component tree. If that would leave `src/components/` reaching into a route's `_components`, stop and report rather than moving more files.

- [ ] **Step 4: Swap the control**

In the header slot of the scanned card, replace `SearchTraveller` with:

```tsx
            <AddTravellerDialog
              countries={countries}
              traveller={traveller}
              setTraveller={setTraveller}
              onSignatureChange={setTravellerSignature}
              disabled={isPending}
            />
```

Remove the now-unused `SearchTraveller` import and the chip-with-clear markup — the dialog owns showing and changing the traveller.

- [ ] **Step 5: Remove the standalone traveller pad**

The dialog now owns the traveller signature via `onSignatureChange`, exactly as on the new-tag page. Delete the traveller `SignaturePad` from the footer stack. **Keep the merchant pad** — `CreateTagRequestDto` has a merchant-signature field and only a merchant sees it.

Keep the `travellerSignature` state and both payload usages unchanged: only where the value comes from moves.

- [ ] **Step 6: Verify**

From `apps/web`:

```bash
npx tsc --noEmit
npx eslint "src/app/[lang]/(main)/(unirefund)/operations/scan-sticker" src/components "src/app/[lang]/(main)/(unirefund)/operations/tax-free-tags/new/client.tsx"
```

Expected: exit 0. Both routes must still typecheck.

- [ ] **Step 7: Commit**

```bash
git add -A apps/web/src
git commit -m "feat(scan-sticker): use the shared traveller dialog"
```

---

### Task 7: Chip-and-amount invoice entry, the mobile model

**Repo:** `unirefund-web`, branch `catch-backend`

**Files:**
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/scan-sticker/client.tsx`

**What changes.** The product-group table — a switch and an amount input per row — becomes mobile's model: single-select chips, one amount field, an **Add** action, and a list of added lines with a remove control. **No numpad.** The web has a keyboard, so the amount is a plain number input; mobile's on-screen calculator is deliberately not ported.

**What does NOT change.** `invoice.invoiceLines` remains the data model, so `withUpdatedTotals`, both request bodies and every guard are untouched. Only how a line gets into that array changes.

- [ ] **Step 1: Stop preselecting a zero line**

In `buildInitialInvoice`, return `invoiceLines: []`. A zero-amount line for the default group made sense when every group had an always-visible row; now a line exists only once the operator adds one. Update the comment to say so, and leave the rest of the function alone.

- [ ] **Step 2: Track the selected chip and the typed amount**

Beside the other state:

```tsx
  // The product group the next added line is priced against. Defaults to the
  // merchant's own default once groups resolve; clicking the selected chip
  // clears it, which disables Add.
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState("");
```

Wherever `setScannedData` runs after a scan, also seed `selectedGroupId` from the resolved groups: `productGroups.find((pg) => pg.isDefault)?.productGroupId ?? null`. Clear both in `handleRescan`.

- [ ] **Step 3: Replace the two line handlers**

Delete `handleSwitchChange` and `handleAmountChange`. Add:

```tsx
  /**
   * Adds the typed amount as a line for the selected product group, merging into
   * an existing line for that group rather than listing it twice.
   *
   * Amounts are VAT-inclusive, so tax is recomputed from the combined amount at
   * the group rate — summing the two tax figures instead would drift by a cent
   * over repeated adds.
   */
  const handleAddLine = useCallback(() => {
    if (!invoice || !selectedGroupId) return;
    const group = scannedData?.productGroups.find(
      (pg) => pg.productGroupId === selectedGroupId
    );
    const amount = parseFloat(amountInput);
    if (!group || !Number.isFinite(amount) || amount <= 0) return;

    const existing = invoice.invoiceLines.find(
      (l) => l.productGroupId === selectedGroupId
    );
    const total = (existing?.amount ?? 0) + amount;
    const taxRate = group.vatRate;
    const taxAmount = (total * taxRate) / (100 + taxRate);
    const line = {
      amount: total,
      taxAmount,
      taxBase: total - taxAmount,
      taxRate,
      productGroupId: selectedGroupId,
    };

    setInvoice(
      withUpdatedTotals({
        ...invoice,
        invoiceLines: existing
          ? invoice.invoiceLines.map((l) =>
              l.productGroupId === selectedGroupId ? line : l
            )
          : [...invoice.invoiceLines, line],
      })
    );
    setAmountInput("");
  }, [invoice, selectedGroupId, amountInput, scannedData]);

  const handleRemoveLine = useCallback(
    (productGroupId?: string | null) => {
      if (!invoice) return;
      setInvoice(
        withUpdatedTotals({
          ...invoice,
          invoiceLines: invoice.invoiceLines.filter(
            (l) => l.productGroupId !== productGroupId
          ),
        })
      );
    },
    [invoice]
  );
```

The tax formula is the one the page already used — do not switch to a different arrangement of the same maths.

- [ ] **Step 4: Replace the table markup**

In the bordered block, replace the product-group `Table` with chips, an amount row and a line list. Use the existing `Button`, `Input` and `Label`; add no new dependency.

```tsx
              <div className="grid gap-2">
                <span className="text-sm font-medium">
                  {t.TagService.ProductGroups}
                </span>
                {scannedData.productGroups.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    {t.TagService["ProductGroups.SelectMerchant"]}
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {scannedData.productGroups.map((pg) => {
                        const isSelected = pg.productGroupId === selectedGroupId;
                        return (
                          <button
                            key={pg.productGroupId}
                            type="button"
                            data-testid={`product-group-chip-${pg.productGroupId}`}
                            aria-pressed={isSelected}
                            disabled={isPending}
                            onClick={() =>
                              setSelectedGroupId(
                                isSelected ? null : pg.productGroupId
                              )
                            }
                            className={cn(
                              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                              isSelected
                                ? "bg-primary border-primary text-primary-foreground"
                                : "bg-muted border-input text-foreground"
                            )}
                          >
                            {pg.productGroupName} {pg.vatRate}%
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-end gap-2">
                      <div className="grid flex-1 gap-1.5">
                        <Label htmlFor="line-amount">
                          {t.TagService.Amount}
                        </Label>
                        <Input
                          id="line-amount"
                          data-testid="line-amount-input"
                          type="number"
                          min={0}
                          value={amountInput}
                          disabled={isPending || !selectedGroupId}
                          onChange={(e) => setAmountInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddLine();
                            }
                          }}
                        />
                      </div>
                      <Button
                        type="button"
                        data-testid="add-line-button"
                        variant="secondary"
                        disabled={
                          isPending ||
                          !selectedGroupId ||
                          !(parseFloat(amountInput) > 0)
                        }
                        onClick={handleAddLine}
                      >
                        {t.Default.Add}
                      </Button>
                    </div>

                    {invoice.invoiceLines.length > 0 && (
                      <div className="divide-y rounded-md border">
                        {invoice.invoiceLines.map((line) => {
                          const group = scannedData.productGroups.find(
                            (pg) => pg.productGroupId === line.productGroupId
                          );
                          return (
                            <div
                              key={line.productGroupId}
                              className="flex items-center justify-between gap-2 p-2 text-sm"
                            >
                              <span className="min-w-0 truncate">
                                {group?.productGroupName} {line.taxRate}%
                              </span>
                              <span className="tabular-nums">
                                {(line.amount ?? 0).toFixed(2)}
                              </span>
                              <Button
                                type="button"
                                data-testid={`remove-line-${line.productGroupId}`}
                                variant="ghost"
                                size="sm"
                                disabled={isPending}
                                onClick={() =>
                                  handleRemoveLine(line.productGroupId)
                                }
                              >
                                {t.Default.Delete}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
```

Keep the existing totals row below this unchanged — it already reads `invoice.totalAmount`.

If `t.Default.Add` or `t.Default.Delete` does not exist, use whichever existing `Default.*` key fits and report which — **never add an i18n key.**

- [ ] **Step 5: Drop what the table used**

Remove the `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow` and `Switch` imports if nothing else on the page uses them. `tsc` and lint will confirm; fix by deleting the import, never by re-adding a usage. Add `cn` from `@repo/ayasofyazilim-ui/lib/utils` if it is not already imported.

- [ ] **Step 6: Verify**

From `apps/web`:

```bash
npx tsc --noEmit
npx eslint "src/app/[lang]/(main)/(unirefund)/operations/scan-sticker"
```

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/src/app/[lang]/(main)/(unirefund)/operations/scan-sticker"
git commit -m "feat(scan-sticker): chip-and-amount invoice entry"
```

## Not verifiable in this environment

- **The signature pad on a touch device.** `DrawPad` is a canvas; that it captures a finger stroke needs real hardware.
- **That a tag issued straight to a traveller from this page renders correctly** in the tag detail it redirects to.
- **Whether `SearchTraveller`'s `compact` variant fits the scanned card's width.** It is used elsewhere in the app, but not in this container.

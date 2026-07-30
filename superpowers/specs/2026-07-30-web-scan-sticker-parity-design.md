# Design: Web scan-sticker parity — traveller and signatures

**Date:** 2026-07-30
**Repo:** `unirefund-web`, branch `catch-backend`
**Catalogue:** #12 and #13

**#14 was dropped from this spec after it was written.** The catalogue recorded it as missing on web; it is not, and never was during this work. `handleScan` has carried an `openTag` helper and an `if (stickerLine.tagId || stickerLine.tagNumber)` branch since before any of it. The catalogue entry came from my reading of the page early in the session, before the branch moved; I did not re-check it against the file as it stands. The row is corrected to ✅ rather than built.

**Cross-repo.** This spec lives in `mobile/app` because that is where the workspace's `docs/superpowers/specs` directory is, following the precedent of the shared-QR and role-correct-create specs. It governs `unirefund-web` alone.

## Goal

Close the two remaining gaps between `apps/web`'s sticker-scan page and the mobile app's, both of which the catalogue in `QR.md` numbers:

| # | Gap |
| --- | --- |
| 12 | A tag can be issued straight to a traveller on mobile, but web hardcodes `status: "Draft"` on both create branches |
| 13 | Mobile captures signatures; web captures none on this page |

Verified against the page as it currently stands: it contains no `SearchTraveller`, no signature capture, and `status: "Draft"` at both create call sites.

## Why these two together

They are one file — `apps/web/src/app/[lang]/(main)/(unirefund)/operations/scan-sticker/page.tsx` — and they are entangled: whether a traveller signature is sent depends on whether a traveller was attached. Shipping them separately would mean touching the same handler twice and leaving a signature with nothing to attach to in between.

## What web already has

Nothing here needs building from scratch.

| Need | Existing |
| --- | --- |
| Find a traveller | `apps/web/src/components/search-traveller.tsx`, already shared, `onSelect(traveller: TravellerRequestDto)` |
| Capture a signature | `MerchantSignature` in `operations/tax-free-tags/new/_components/` — despite the name, its only props are `onSignatureChange` and `disabled` |
| The Draft/Issued rule | `tax-free-tags/new/client.tsx` already does `status: hasTraveller ? "Issued" : "Draft"` |
| Strip the data-URL prefix | the same file already does `signature?.split(",")[1]` |


## Decisions (agreed with user)

1. **Use `SearchTraveller`, not `AddTravellerDialog`.** The latter bundles a traveller signature, which is tempting, but it requires a `countries` prop and scan-sticker has no server page to fetch them — its README records that the page starts empty and every read happens client-side in response to a scan. `SearchTraveller` needs nothing, is already shared, and matches what the mobile sticker screen does: **find** an existing traveller rather than create one.
2. **Generalise `MerchantSignature` into a labelled `SignaturePad` and hoist it** to `apps/web/src/components/`, updating its one existing caller. Two near-identical pads in one app is the alternative, and `apps/web/src/components/` already holds the sibling traveller components.
3. **Hoist rather than import sideways.** The codebase's precedent — `management/identity/**` — is importing from a common *ancestor* `_components`, never from a sibling route's.

## #12 — an optional traveller

`SearchTraveller` behind a button in the scanned card, mirroring how `tax-free-tags/new` and the mobile sticker screen offer it. Selecting one shows the name with a clear-button; clearing returns to Draft.

`status` becomes `hasTraveller ? "Issued" : "Draft"` on **both** request bodies — `CreateTagRequestDto` and `CreateTagByStickerLineRequestDto` each carry an optional `traveller`, so the role split introduced by the role-correct-create work is unaffected.

## #13 — signatures

| Role | Pads | Why |
| --- | --- | --- |
| Merchant | merchant + traveller | `CreateTagRequestDto` has `merchantIndividualSignatureBase64` and `travellerSignatureBase64` |
| Refund Point | traveller only | `CreateTagByStickerLineRequestDto` has only `travellerSignatureBase64` |

The same asymmetry the mobile app has, forced by the same DTO difference rather than chosen.

**The traveller signature is sent only when a traveller is attached**, matching `tax-free-tags/new`. A signature from a traveller who is not on the tag has nothing to attach to.

Signatures arrive as `data:` URLs; the payload strips the prefix with `.split(",")[1]`, as the existing create page does.

## Components

```
apps/web/src/components/signature-pad.tsx        moved + generalised from MerchantSignature
```

`SignaturePad` takes `label: string`, `onSignatureChange?: (signature: string | undefined) => void` and `disabled?: boolean`. The label is the only thing that was merchant-specific; everything else in that component is a draw pad, a save and a preview.

`operations/tax-free-tags/new/_components/merchant-signature.tsx` is deleted and `client.tsx` imports `SignaturePad` with the merchant label it already uses.

## Errors

Nothing here introduces a failure mode of its own. A signature that fails to capture leaves the field undefined and the tag is created without it, as on the existing create page. Traveller search failures are `SearchTraveller`'s own concern and unchanged.

There is no new refusal state: the used-sticker path this spec originally proposed already exists on the page and is untouched.

## Testing

This page has no test suite, and the app has no test infrastructure in play for it, so `tsc` and lint from `apps/web` are the verification — the same bar the role-correct-create work was held to.

Nothing here is pure logic worth extracting: the Draft/Issued rule is a single ternary already proven on mobile, and the rest is wiring existing components. Extracting a function to test one ternary would be ceremony.

## Out of scope

- Payout tokens. `tax-free-tags/new` offers them alongside a traveller; the sticker flow has never had them and mobile does not either.
- Creating a *new* traveller from this page. `SearchTraveller` finds existing ones; that is what mobile does and what the sticker counter case needs.
- Catalogue #17, #20, #21, and mobile's #8.

## Risks

| Risk | Mitigation |
| --- | --- |
| Generalising `MerchantSignature` breaks the existing create page | one caller, and `tsc` catches a missed prop; the component's behaviour is unchanged apart from where its label comes from |
| A traveller signature is captured then the traveller is cleared | the payload guards on `hasTraveller`, so it is simply not sent |

## Not verifiable here

Browser behaviour: the signature pad on a touch device, and that a tag issued straight to a traveller from this page renders correctly. Both need a running app.

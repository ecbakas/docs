# QR handling guide — design

Date: 2026-07-31
Scope: `super-app`, `web-app/apps/ssr`, `web-app/apps/web`

## Problem

QR handling is spread across three apps, four parties and three code types, and
what exists today documents it from two directions that both stop short.

- [`docs/QR.md`](../../QR.md) is a **capability catalogue**: permanent numbers
  `#1`–`#29`, per-app ✅/❌, and a decision for each. It answers "does this app do
  X" and nothing else — no routes, no endpoints, no permissions, no way to test.
- Per-page READMEs such as
  [`operations/scan-sticker/README.md`](../../../web-app/apps/web/src/app/%5Blang%5D/%28main%29/%28unirefund%29/operations/scan-sticker/README.md)
  go extremely deep on **one page in one app**. Nothing joins them, and the
  mobile and SSR equivalents of that page have no README at all.

So there is no document that answers the questions people actually arrive with:
*what can a merchant do with a sticker QR, on which screen, in which app, what
permission does it need, and how do I test it?* Six flows in particular have no
single home — merchant create with/without traveller, refund-point create by
sticker line, traveller claim by sticker or tag QR, merchant assign traveller,
refund-point assign traveller, and any-party scan-to-view.

## Primary purpose

**The guide's first job is to be the API usage contract: which party must call
which endpoint, and which endpoint they must not call.** Everything else — the
perspective chapters, the permission grouping, the test flows — is a view onto
that.

This is the question the codebase keeps getting wrong, and it has the scars to
prove it. Both apps once used the Refund Point's create endpoint for every role
(`#29`); web called the Refund Point's merchant-info lookup for every role, which
403'd for merchant staff (`#15`, alias `#26`). Neither was a coding error. Both
were a *missing contract* — two endpoints answer the same question, and nothing
said which party owns which.

The failure mode is not obscure. Three separate endpoints today return something
called "product groups":

| Caller and need | Correct endpoint | Permission |
| --- | --- | --- |
| Merchant staff pricing a tag for their **own** store | `GET /api/crm-service/merchants/{id}/product-group` | `CRMService.Merchants.ViewProductGroupList` |
| Refund Point pricing for a merchant it does **not** own | `GET /api/tag-service/sticker-header/sticker-line/{n}/merchant-info` | `TagService.StickerHeaders.ViewMerchantInfo` |
| Admin maintaining the **global catalogue** | `SettingService` ProductGroups CRUD | `SettingService.ProductGroups.*` |

The three are not interchangeable. `productGroupId` is the *global* id, while
`isDefault` and `vatRate` come from the per-merchant relation — so the
`SettingService` catalogue has no VAT rate to price an amount against, and the
`TagService` projection is the only way a Refund Point gets a foreign merchant's
rates at all. A reader must be able to look this up rather than infer it, which is
what [`endpoints.md`](#endpoint-ownership) is for.

## Deliverable

A guide in `docs/qr/`, nine files, joined by a permanent **action id**.

The guide is a reference document. It does not change application code. Where
writing it uncovers a code defect, that defect is recorded (see
[Findings](#findings)) rather than fixed in the same work.

### Files

| File | Contract |
| --- | --- |
| `README.md` | Index and foundations. The three QR types and the wire format. [Where codes come from](#where-codes-come-from). How each app resolves a QR. Login and session resolution per app. The action-id index, and a link to the route→action index that lives in `actions-and-routes.md`. How to read the permission column. The [Findings](#findings) section. |
| `traveller.md` | Perspective chapter — `T1`/`T2`/`T3`. |
| `merchant.md` | Perspective chapter — `M1`/`M2`/`M3`. |
| `refund-point.md` | Perspective chapter — `R1`/`R2`/`R3`. |
| `customs.md` | Perspective chapter — the fourth party, web only. |
| `actions-and-routes.md` | **The registry.** One row per action; the single source every other file joins against. |
| `endpoints.md` | **The API usage contract.** Endpoint-first: intended caller, forbidden callers and why, the correct alternative for each, and the body contract per caller. Plus the overlapping-endpoint decision tables and the anti-pattern list. |
| `permissions-by-role.md` | The registry re-grouped by role. |
| `test-flows.md` | One QA-runnable flow per action id, plus a coverage table. |

`docs/QR.md` keeps its catalogue role and changes in exactly two ways: it gains a
link to `docs/qr/README.md`, and its role×QR-type grid gains the Customs column
(see [Registry schema](#registry-schema)). No existing capability number, ✅/❌
mark or decision is edited or renumbered — the only additions to the catalogue are
new numbers at the end, for the defects [Findings](#findings) turns up, which is
what `QR.md`'s own rule already prescribes for a new capability. The catalogue
answers *what exists*; the guide answers
*how it works and how to test it*. Neither absorbs the other.

## The spine: action ids

Every action gets an id — `A01`, `A02`, … — assigned once.

**Ids are permanent and are never renumbered.** This is the rule `QR.md` already
sets for its capability numbers, applied one level down. A withdrawn action keeps
its id and is struck through; a new action takes the next free number.

The id is the join key. An action appears in five places, and a reviewer can prove
coverage by checking that every id appears in all five:

1. one row in `actions-and-routes.md`,
2. narrated in exactly one perspective chapter,
3. in the `Actions` column of its endpoint's row in `endpoints.md`,
4. under its role in `permissions-by-role.md`,
5. as `TF-A##` in `test-flows.md`.

The one exception is an action that calls no endpoint — classification, routing,
the deferred-scan resume. Those are absent from `endpoints.md` **by rule**, and the
registry marks them `Endpoint: — client only` so the absence is checkable rather
than merely tolerated.

Action ids sit **below** the capability numbers: several actions can serve one
capability, and every action row cites the `#` it serves and, where the action is
QR-triggered, its `T#`/`M#`/`R#` cell from the grid at the top of `QR.md`.

### What counts as an action

One row per **distinct thing a party can do that the guide must be able to test
separately**. The test is whether it needs its own preconditions and its own
expected result.

Included:

- Anything triggered by reading a code — QR camera scan, wedge/keyboard scan,
  manual entry of a tag number or sticker line number.
- Any write reached from a QR flow — create a tag, assign a traveller, claim,
  self-validate, capture a signature.
- Any read whose *purpose* is to answer a scan — resolve a sticker line, resolve
  a merchant, look up a tag by number, list merchants for creation.
- The **non-QR prerequisites the QR flows depend on**: login, role resolution,
  tenant/affiliation selection, deferred-scan resume, traveller search. These are
  in scope because "what happens when the user logs in" is part of the question
  the guide answers, and because a scan taken before login is meaningless without
  them.

Excluded:

- Reads that merely render a detail page a route already reached, unless the read
  is separately permissioned and can fail on its own.
- Tag lifecycle work that no QR reaches — risk rule configuration, refund
  operations, reporting, sticker-book creation and allocation from the admin side.
- `pos-app` as a *consumer*. It is out of the stated scope and gets no action rows.
  It appears only in [Where codes come from](#where-codes-come-from), as one of the
  points that **produces** a code the other three apps must read.
- `file/verification/[fileId]/create-tag`. Out of scope — no QR reaches it.
- `tax-free-tags/new-old/`. Superseded by `new/`; named once in the registry as
  dead and not documented further.

### Seed inventory

The final list is produced by walking the routes during implementation. These are
the surfaces known to be in scope, so the work is bounded rather than open-ended:

**super-app** — `(public)/role-select`, `(public)/traveller-login`,
`(public)/staff-login`, `manual-entry`, `tag-preview`, `sticker-tag`, `validate`,
`(auth)/create-tag`, `(auth)/tags/index`, `(auth)/tags/[tagId]`, `(auth)/index`
(Home scan CTA), plus `useQrScanLauncher` / `useScanRouting` / `scanDestination`
and the `pendingScan` store with `useResumePendingScan`.

**web-app/apps/web** — `operations/scan-sticker`,
`operations/tax-free-tags` (+ `[tagId]`, + `new`),
`operations/tax-free-tags/_components/customs/assign-draft-*`,
`operations/tags` (customs workspace), `(external)/qr` (rolling QR kiosk),
`operations/refund/_components/refund-filters/tags-panel.tsx` (capability `#21`,
present but disabled — recorded as such, not documented as available).

**web-app/apps/ssr** — `(public)/tag` and `(public)/tag/[slug]`,
`(public)/validate`, `(main)/tags` and `(main)/tags/[tagNumber]`,
`(auth)/login` and `(auth)/login/kyc`.

Sizing estimate is 40–50 actions. The number is not a target; the inventory rule
above decides it.

## Registry schema

`actions-and-routes.md` holds one row per action with these fields:

| Field | Meaning |
| --- | --- |
| `ID` | `A##`, permanent. |
| `Action` | Imperative, one line. |
| `Actor` | Traveller · Merchant · Refund Point · Customs · Anonymous. |
| `Trigger` | Tag QR · Sticker QR · Validate QR · Boarding pass · Manual entry · Wedge · UI control. |
| `App` | `super-app` · `apps/web` · `apps/ssr`. |
| `Route` | The file-based route. |
| `UI entry` | The component and the control that starts it. |
| `Client wrapper` | The action function, cited as `file:line`. |
| `SDK method` | `Service.method`. |
| `Endpoint` | `METHOD /path`. |
| `Permission` | The permission string, or `— anonymous`. |
| `Cap #` | The `QR.md` capability it serves. |
| `Cell` | `T#`/`M#`/`R#`/`C#`, or `—` for actions that are not QR-triggered. |

The `Cell` column needs a fourth row that `QR.md`'s 3×3 grid does not have.
Customs is a QR-scanning party — it reads tag QRs into the bulk assign sheet — so
the guide adds `C1`/`C2`/`C3` on the same axes (validate QR / sticker QR / tag
QR), and `docs/QR.md`'s grid gains the Customs column in the same change. Cells
that are genuinely meaningless stay empty in the grid and read `—` here, rather
than being silently omitted: "Customs has no sticker flow" is information.

**The route→action index lives at the top of `actions-and-routes.md`**, directly
above the registry table, so the two stay in step; `README.md` links to it rather
than holding a second copy. It exists so the guide can also be entered from a page
the reader is looking at, not only from an action they already know the name of.

## Sourcing rule

Every fact in the `Permission` column is derived by following one fixed chain, and
the chain is stated in `README.md` so a reader can re-run it on any row:

1. The route and the UI control that starts the action.
2. → the client wrapper — `super-app/src/actions/**`,
   `web-app/packages/actions/unirefund/**`.
3. → the SDK method the wrapper calls.
4. → the `**Requires permissions:**` line in that service's `sdk.gen.ts`
   (`web-app/packages/saas/<Service>/sdk.gen.ts`,
   `super-app/src/saas/<Service>/sdk.gen.ts`).

The generated SDK is the authority for what a permission is called and which
endpoint needs it. `TagService` alone carries 52 such annotations.

**Absence of the annotation means no *permission* is required — which is not the same
as anonymous.** The guide never leaves that cell blank, and distinguishes two cases,
because a reader's first question is whether they must be logged in:

- `— anonymous` — no token at all. `TagPublicService` carries no annotations, and
  `getApiTagServicePublicTagByTagIdById` documents why in its own comment:
  *"Anonymous — the unguessable Guid id is the credential."* The traveller's whole
  scan-before-login path rests on this.
- `— authenticated, no grant` — a token is required, no permission gates it.
  `POST /api/export-validation-service/qrEvidence/{qrValue}/scan` is the case:
  unannotated, but *"the traveller scans the kiosk's QR with their own authenticated
  device. The current user's TravellerDocumentId claim identifies whose tags to
  clear"*, and it documents 401/403. Its sibling `.../scanWithTravellerInfo` **is**
  annotated, with `ExportValidationService.QrEvidence.ScanWithTravellerInfo`.

Which case applies is read from the method's own doc comment **and its call site** —
whether the client wrapper sends a bearer token — never assumed from the missing
annotation. The declared status codes are **not** a usable test: they are generator
boilerplate, identical across all 55 `TagService` and 11 `ExportValidationService`
methods, so the genuinely anonymous read declares 401 and 403 just like a gated one.
The reliable tell is that the `TagPublicService` wrappers deliberately bypass the
authenticated fetch path, which would otherwise send `Bearer undefined`.

An action that calls no endpoint takes `—` in its permission cell, not
`— anonymous`: there is no endpoint there to be anonymous about, and several
client-only actions are reachable only inside an authenticated session.

*(Both corrections made 2026-07-31 during Task 2, which found the authenticated-but-
ungranted case, correctly refused to record it as anonymous, and then disproved the
status-code test this spec had briefly relied on.)*

Two consequences the guide must handle rather than hide:

- **A UI permission check is not the same fact as an endpoint requirement.** Where
  a page gates a control on `isActionGranted([...])`, that string is recorded
  alongside the endpoint's requirement, not instead of it. Where they disagree,
  see [Findings](#findings).
- **The two apps carry separate generated SDK copies.** Where the annotation for
  the same endpoint differs between `super-app/src/saas/` and
  `web-app/packages/saas/`, the row records both and flags it. One of the two
  generations is stale, which is a real finding about the codebase.

`policies.gen.json` (mobile) and `policies.json` (web) enumerate all 848 policy
strings. They are used only to confirm that a permission named in an annotation
actually exists — they say nothing about who holds it.

## Where codes come from

A section in `README.md`. Every action in this guide begins with someone reading a
code, so the guide has to say what **produced** it — a reader cannot test a flow
without knowing how to get a valid code in front of a scanner, and cannot debug a
failing scan without knowing who authored the string.

| Code | Produced by | Content authored by |
| --- | --- | --- |
| **Sticker QR** | web · `operations/stickers/[stickerId]/_components/print-sticker-lines-action.ts` | client, `buildTagUrl` from `@unirefund/qr` — encodes only the `s` key |
| **Tag QR** | web · `tax-free-tags/[tagId]/_components/print-tag.tsx`, via `react-qr-code` | **the backend** — the value is `TagDetailDto.publicLink`, not built locally |
| **Code128 tag-number barcode** | `pos-app` · `screens/(auth)/Tags/TagDetail/_components/tagPrintTemplate.ts` — `printBarcode(tagNumber, "code128")` | nobody — it is a bare tag number, which is exactly why capability `#28` existed |
| **Validate QR** | web · `(external)/qr/_components/rolling-qr-card.tsx`, the airport kiosk | server-issued and rolling, so it expires mid-flow by design (`#7`) |

Two things fall out of this table that no perspective chapter would surface, and
both belong in the guide:

**The tag QR has two possible authors.** `@unirefund/qr` is described everywhere as
the single source of truth for the wire format, and for the sticker QR it is. The
printed *tag* QR is not built with it — `print-tag.tsx` encodes the backend's
`publicLink` field verbatim. So the claim "one library decides the format" is true
of stickers and only partly true of tags. Whether the two agree is not verifiable
from this repository, which is what makes it a [Finding](#findings) rather than a
paragraph: if `publicLink` and `buildTagUrl` ever diverge, a printed tag QR and a
printed sticker QR resolve differently, and nothing in either codebase would catch
it.

**`pos-app` produces a code no app could resolve.** A bare tag number is not a
slug, the mobile scanner's default symbologies include `code-128` so the barcode
*is* read, and it then decoded to nothing — the whole of `#28`. It is fixed now, and
the fix is what makes `pos-app` worth naming here: a producer that shares no code
with its consumers is how that gap opened in the first place.

`pos-app` also ships `screens/(auth)/DeviceSettings/BarcodeTestScreen.tsx`, which
uses `base64UrlEncode` from `@unirefund/qr` to print arbitrary test barcodes on a
device. `test-flows.md` names it in the test-data preamble: it is the only way to
produce a scannable code without a real printed sticker book, and several flows are
otherwise blocked on physical stock.

## Endpoint ownership

`endpoints.md` inverts the registry. The registry answers *"what does this action
call?"*; this file answers *"who is allowed to call this, and what should everyone
else call instead?"* — the [primary purpose](#primary-purpose).

It is derived from the registry, not gathered separately, so the two cannot
disagree. One row per endpoint.

**How far it reaches.** This is a QR guide, not a full API reference, so the
endpoint set is bounded by two rules:

1. **Every endpoint a QR flow reaches** gets a full row. That is the registry's
   `Endpoint` column, deduplicated.
2. **Every endpoint that is a plausible *wrong answer* to one of those questions**
   gets named — in a `Must not call` / `Instead use` cell or an overlapping-endpoint
   table — but is **not** documented in full. `SettingService.ProductGroups` is the
   type case: no QR flow calls it, and it is exactly what someone reaches for when
   they need product groups. A contrast entry carries the endpoint, its permission,
   and one line on why it is the wrong answer here. Nothing more.

Everything else is out. `TagService` alone has 55+ methods and the QR flows touch
perhaps half; risk configuration, refund operations and reporting get no rows, not
even contrast entries, because no QR question leads to them.

One row per endpoint:

| Field | Meaning |
| --- | --- |
| `Endpoint` | `METHOD /path`. |
| `Permission` | From the SDK annotation, or `— anonymous`. |
| `Intended caller` | The party the endpoint exists for. |
| `Also called by` | Other parties that legitimately call it, if any. |
| `Must not call` | Parties that must not, **with the reason** — no grant, wrong DTO, or a side effect they must not cause. |
| `Instead use` | The correct endpoint for each forbidden caller. Empty only when there genuinely is no alternative. |
| `Actions` | The action ids that reach it. |
| `Body contract` | What the body must and must not carry, **per caller**, where callers differ. |

`Must not call` is the field that earns the file. A reason of "no grant" is
verifiable from the annotation; "wrong DTO" and "causes a side effect" are not, and
those are where the real traps are:

- `POST /tag/by-sticker-line` takes `CreateTagByStickerLineRequestDto`, which has
  **no merchant-signature field**. A merchant calling it does not get a worse
  result — it silently drops a signature they captured. That is a DTO fact, not a
  permission fact, and no 403 will ever tell you.
- `merchantId` on the Refund Point path is **ignored by the backend once the sticker
  line is allocated**, and sending it on an *unallocated* line allocates the whole
  sticker header to that merchant, permanently. Same field, two completely
  different consequences depending on state.

### Overlapping endpoints

A short set of decision tables, one per question that more than one endpoint
answers, in the form *"I need X as party P → call this"*. The product-groups table
in [Primary purpose](#primary-purpose) is the worked example. The others to write:

- **Resolve a merchant's identity** — the sticker line's own
  `merchantName`/`vatNumber` fields, `TagService` merchant-info, CRM merchant
  detail, and `GET /tag/merchants-for-creation`. Four sources, and which is correct
  depends on whether the caller owns the merchant and whether the book is allocated.
- **Look up a tag** — by id, by tag number, by encrypted tag number, or through
  `public/tag*`. Four routes to one entity, split by whether the caller is
  authenticated and whether the id is being used as a credential.
- **Create a tag** — `POST /tag` versus `POST /tag/by-sticker-line`, which is
  capability `#29` and already decided; recorded here so the decision is findable
  from the endpoint rather than only from the catalogue.
- **Assign a traveller** — `POST /tag/{id}/assign-traveller` versus the two
  `traveller-self-assign` endpoints. Staff-assigns-traveller and
  traveller-claims-own-tag are different operations with different permissions, and
  the names do not make that obvious.

### Anti-patterns

A list of wrong-endpoint usages that have actually happened, each with the symptom,
the reason and the correct call. Seeded from the two the codebase already records —
every role posting to `by-sticker-line` (`#29`), and every role calling
merchant-info (`#15`/`#26`) — and extended with anything
[Findings](#findings) turns up.

This section is deliberately historical. A reader who is about to make the same
choice recognises the symptom faster than they recognise the rule, so the entry
leads with what goes wrong ("403 for merchant staff on a lookup that works for a
Refund Point") rather than with the principle.

## Permissions by role

`permissions-by-role.md` re-groups the registry. Per role: the permissions that
role's actions require, the action ids requiring each, and a separate section for
the actions that need no permission at all.

The guide states plainly what it does **not** know. Which permissions an ABP role
actually holds is backend configuration and is not in this repository. So:

- **Code-derived** — route, UI entry, wrapper, endpoint, required permission. Cited.
- **Observed** — a claim that a role does or does not hold a grant. Made only
  where the codebase already establishes it, and marked as observed. The one
  worked example is that a merchant does **not** hold
  `TagService.Tags.CreateByStickerLine`: that is why capability `#29` exists and
  why merchants post to `POST /tag` instead, and it came from a real 403.
  Similarly, merchant staff do not hold
  `TagService.StickerHeaders.ViewMerchantInfo`, which is why the merchant path
  resolves identity through CRM instead (`#15`).

No grant set is inferred beyond those. A reader who needs the true matrix is
pointed at the session's own `grantedPolicies`, and told where to read it in each
app.

Session claims are documented separately from permissions, because they decide
which *branch* runs before any permission is consulted:

- `super-app` — the role gate persisted by `utils/rolePreference.ts` is a
  device-level UX preference and is **not** authoritative; the real role is
  resolved after login in `SessionProvider`, from CRM affiliations
  (`resolveRoleFromAffiliations`), with travellers fast-pathed from the sign-in
  route. `grantedPolicies` arrives on the profile as `Record<Policies, boolean>`.
- `apps/web` — `session.user.MerchantId` / `RefundPointId` / `CustomsId`, each a
  `string` or `string[]`. **The Refund Point claim wins when both it and
  `MerchantId` are present**, and the guide explains the consequence, because
  getting it backwards permanently allocates a sticker book to the wrong store.
- `apps/ssr` — NextAuth; public routes need no session, and the claim path
  additionally requires KYC.

## Foundations chapter

`README.md` carries the material the four perspective chapters would otherwise
each repeat:

- **The wire format.** `@unirefund/qr`
  (`github:ayasofyazilim-clomerce/unirefund-qr`) is the shared codec — it exports
  `encodeTagSlug` / `decodeTagScan`, `buildTagUrl` / `resolveTagLink`, and
  `buildValidateUrl` / `extractValidateQrValue`, and all four apps depend on it so
  that a code **decodes** identically everywhere. The slug keys are `i` tag id, `n`
  tag number, `t` traveller document number, `s` sticker line number, and the guide
  states the precedence rules that follow — a slug carrying `s` is a sticker even
  when it also carries tag fields; a slug carrying only `t` identifies nothing
  openable. Its `vectors.json` is named as the fixture any parser change must still
  satisfy.

  The chapter is careful about one thing here: the library is the single source of
  truth for **decoding**, and for **encoding** the sticker QR — but not for every
  code that gets printed. The tag QR's value comes from the backend, and
  classification is per-app by design. Both are set out in
  [Where codes come from](#where-codes-come-from) rather than glossed here, because
  "one library decides everything" is the assumption that would let a real
  divergence go unnoticed.

- **Where each code comes from** — the producer table, so a reader can obtain a
  valid code before trying to scan one.
- **How each app resolves a QR**, carried over from `QR.md` and expanded: SSR
  resolves by URL because a tag QR encodes a link the phone's own camera opens;
  `super-app` classifies in-app because it owns the camera; `apps/web` adds a
  wedge/keyboard scanner, which is why a bare undecodable string is a sticker line
  number there and stays `unknown` on mobile.
- **Login and session resolution** per app, as above.
- **Which QR each party may not use**, and what they see instead. A merchant or
  refund point scanning a validate QR is refused with a specific message, not a
  generic failure, and the ordering that makes that possible — validate is checked
  first, precisely because it is the one code that does not decode — is explained
  once here rather than three times.

## Test flows

`test-flows.md` carries one flow per action id, runnable by someone who has not
read the code. Each flow states:

- the action id, the app, and the role;
- the account needed;
- preconditions, in test-data terms — "a printed sticker whose book is not yet
  allocated", "a Draft tag issued by your own store", "a traveller account that
  has not completed KYC";
- numbered steps, each gate carrying an `EXPECT`;
- the negative cases for that action — wrong QR type, a book allocated to another
  merchant, an incomplete traveller, an expired validate QR.

No file paths appear in the steps. A shared **test data you need** preamble
describes the fixtures the flows draw on, so each flow can name one instead of
explaining it. A **coverage table** at the end maps every action id to its flow;
an action with no flow is visible as a hole rather than absent.

Flows are written to be run against a deployed environment. The guide does not
claim any of them has been executed. Where `QR.md` already records that on-device
verification is outstanding, `test-flows.md` links to that rather than restating it.

## Findings

Writing this guide means walking the same four-step chain end to end for every one
of 40–50 actions across three apps, which
will surface discrepancies: a control gated on a permission its endpoint does not
require, an endpoint whose requirement no UI checks, a stale SDK generation, a
route that outlived its capability entry.

These are collected in a **Findings** section in `docs/qr/README.md` — each one
naming the file, what disagrees with what, and which action id it affects — and
the ones that represent real defects are then added to `docs/QR.md` as new
capability numbers so they enter the existing decision process. They are **not**
fixed as part of writing the guide, and the guide's prose does not paper over
them by describing intended behaviour as actual behaviour.

If the pass finds nothing, the section says so explicitly. An empty Findings
section is a result; a missing one is ambiguous.

**Already found, while designing this.** The section does not start empty, which is
itself evidence that the pass is worth making:

| Finding | Detail |
| --- | --- |
| The tag QR has two possible authors | `print-tag.tsx` encodes the backend's `TagDetailDto.publicLink`; the sticker print flow builds its code with `buildTagUrl` from `@unirefund/qr`. If the two formats drift, a printed tag QR and a printed sticker QR resolve differently and nothing catches it. Not verifiable from this repository — needs a backend answer. See [Where codes come from](#where-codes-come-from). |
| Three endpoints return "product groups" | And only two carry a `vatRate`. Not a defect, but an undocumented trap that has already produced one real bug (`#15`). Resolved by the decision table in [Overlapping endpoints](#overlapping-endpoints). |
| `classifyScan` is duplicated, not shared | `apps/web` defines it locally in `operations/scan-sticker/client.tsx`; `super-app` has its own in `src/utils/qr/classifyScan.ts`. The *decoding* is shared via `@unirefund/qr`, deliberately, but the classification each app applies to the result is not, so the two can disagree about what a given code means. `super-app`'s own comment argues this is correct — classification is per-app product policy, and web genuinely needs the wedge branch mobile must not have. Recorded so the divergence is a decision on the record rather than an accident. |

## Verification

The guide's only value is being accurate, so accuracy is verified rather than
assumed:

1. **Every registry row is re-derived.** After the registry is written, each row's
   cited `file:line` is re-read and each `**Requires permissions:**` annotation
   re-checked against the SDK. A row that cannot be re-derived is removed or
   marked, not left standing.
2. **Join integrity.** Every action id appears in the registry, exactly one
   perspective chapter, `endpoints.md`, `permissions-by-role.md`, and
   `test-flows.md`. Any id missing from any of the five is a defect in the guide,
   except a `— client only` action, which is exempt from `endpoints.md` alone.
3. **Endpoint coverage both ways.** Every endpoint named in the registry has a row
   in `endpoints.md`, and every row's `Actions` column is non-empty. An endpoint
   with no action reaching it means either a missed action or a dead endpoint —
   both are [Findings](#findings), not rows to delete.
4. **Every `Must not call` names an `Instead use`,** or states outright that no
   alternative exists. A forbidden caller with no stated alternative is the single
   most useless thing this guide could contain.
5. **No unresolved placeholders.** No `TBD`, no empty `Permission` cell, no
   "verify this later".
6. **Every file carries `Verified against:`** — the date plus the commit surveyed
   for each of the three apps, so a later reader can tell how stale it is.

## Risks

| Risk | Handling |
| --- | --- |
| The guide drifts as code changes, and a stale guide is worse than none. | `Verified against:` lines per file; permanent ids so a later pass can diff rather than rewrite; the registry is the only place a fact lives, so an update has one home. |
| It restates `QR.md` and the two diverge. | Strict division: `QR.md` owns capability numbers, per-app support and decisions; the guide owns routes, actions, endpoint ownership, permissions and tests, and cites capability numbers rather than copying their status. The ✅/❌ marks are never duplicated into the guide. |
| Nine files fragment the reading experience. | `README.md` is a real index — action-id index plus a link to the route→action index — so any entry point is one hop from the answer. |
| `endpoints.md` drifts from the registry and starts contradicting it. | It is **derived** from the registry rather than gathered independently, and verification step 3 checks the correspondence in both directions. If the two ever disagree, the registry wins. |
| The `Instead use` column becomes stale advice that sends readers to a wrong endpoint — worse than no advice. | Every `Instead use` cell names an endpoint that has its own row in the same file, so a removed endpoint cannot be silently pointed at. `Verified against:` bounds how far it can drift unnoticed. |
| Effort is spent documenting dead surfaces. | `new-old/` and the disabled refund tag-panel are named as dead once and not documented; the inventory rule excludes admin-side tag lifecycle work outright. |
| Test flows cannot be run without fixtures nobody has. | Preconditions are stated in test-data terms up front, in a shared preamble, so the missing fixture is visible before someone starts a flow rather than three steps in. |

## Out of scope

- Any change to application code, including the defects the Findings section
  records.
- `pos-app` as a consumer — no action rows, no endpoint rows. It appears **only** in
  [Where codes come from](#where-codes-come-from), as a producer of codes the other
  three apps read, plus its `BarcodeTestScreen` in the test-data preamble.
- `file/verification/[fileId]/create-tag`. No QR reaches it.
- The true role→permission grant matrix, which is backend configuration.
- Whether the backend's `publicLink` agrees with `@unirefund/qr`'s `buildTagUrl`.
  Recorded as a Finding, answered elsewhere.
- Executing the test flows.

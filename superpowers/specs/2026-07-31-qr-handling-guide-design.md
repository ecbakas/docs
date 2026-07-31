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

## Deliverable

A guide in `docs/qr/`, eight files, joined by a permanent **action id**.

The guide is a reference document. It does not change application code. Where
writing it uncovers a code defect, that defect is recorded (see
[Findings](#findings)) rather than fixed in the same work.

### Files

| File | Contract |
| --- | --- |
| `README.md` | Index and foundations. The three QR types and the wire format. How each app resolves a QR. Login and session resolution per app. The action-id index, and a link to the route→action index that lives in `actions-and-routes.md`. How to read the permission column. The [Findings](#findings) section. |
| `traveller.md` | Perspective chapter — `T1`/`T2`/`T3`. |
| `merchant.md` | Perspective chapter — `M1`/`M2`/`M3`. |
| `refund-point.md` | Perspective chapter — `R1`/`R2`/`R3`. |
| `customs.md` | Perspective chapter — the fourth party, web only. |
| `actions-and-routes.md` | **The registry.** One row per action; the single source every other file joins against. |
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

The id is the join key. An action appears in exactly four places, and a reviewer
can prove coverage by checking that every id appears in all four:

1. one row in `actions-and-routes.md`,
2. narrated in exactly one perspective chapter,
3. under its role in `permissions-by-role.md`,
4. as `TF-A##` in `test-flows.md`.

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
- `pos-app`. It is out of the stated scope. It is **referenced** once, in
  `README.md`, because it prints the Code128 tag-number barcode that capability
  `#28` is about, and a reader tracing that barcode needs to know where it comes
  from.
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

**Absence of the annotation means the endpoint is anonymous, and the row says so
explicitly.** This is load-bearing, not an omission: `TagPublicService` carries no
annotations, and `getApiTagServicePublicTagByTagIdById` documents why in its own
comment — *"Anonymous — the unguessable Guid id is the credential."* The
traveller's whole scan-before-login path rests on it, so a reader must be able to
tell "no permission needed" from "permission not yet looked up". The guide never
leaves that cell blank.

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
  (`github:ayasofyazilim-clomerce/unirefund-qr`) is the single source of truth for
  generating and resolving Unirefund codes, shared by all apps so that a code
  produced by one resolves identically in the others. The slug keys are `i` tag
  id, `n` tag number, `t` traveller document number, `s` sticker line number, and
  the guide states the precedence rules that follow from them — a slug carrying
  `s` is a sticker even when it also carries tag fields; a slug carrying only `t`
  identifies nothing openable. Its `vectors.json` is named as the fixture any
  parser change must still satisfy.
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

Writing this guide means reading four chains end to end across three apps, which
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

## Verification

The guide's only value is being accurate, so accuracy is verified rather than
assumed:

1. **Every registry row is re-derived.** After the registry is written, each row's
   cited `file:line` is re-read and each `**Requires permissions:**` annotation
   re-checked against the SDK. A row that cannot be re-derived is removed or
   marked, not left standing.
2. **Join integrity.** Every action id appears in the registry, exactly one
   perspective chapter, `permissions-by-role.md`, and `test-flows.md`. Any id
   missing from any of the four is a defect in the guide.
3. **No unresolved placeholders.** No `TBD`, no empty `Permission` cell, no
   "verify this later".
4. **Every file carries `Verified against:`** — the date plus the commit surveyed
   for each of the three apps, so a later reader can tell how stale it is.

## Risks

| Risk | Handling |
| --- | --- |
| The guide drifts as code changes, and a stale guide is worse than none. | `Verified against:` lines per file; permanent ids so a later pass can diff rather than rewrite; the registry is the only place a fact lives, so an update has one home. |
| It restates `QR.md` and the two diverge. | Strict division: `QR.md` owns capability numbers, per-app support and decisions; the guide owns routes, actions, permissions and tests, and cites capability numbers rather than copying their status. The ✅/❌ marks are never duplicated into the guide. |
| Eight files fragment the reading experience. | `README.md` is a real index — action-id index plus route→action index — so any entry point is one hop from the answer. |
| Effort is spent documenting dead surfaces. | `new-old/` and the disabled refund tag-panel are named as dead once and not documented; the inventory rule excludes admin-side tag lifecycle work outright. |
| Test flows cannot be run without fixtures nobody has. | Preconditions are stated in test-data terms up front, in a shared preamble, so the missing fixture is visible before someone starts a flow rather than three steps in. |

## Out of scope

- Any change to application code, including the defects the Findings section
  records.
- `pos-app`, except the one reference explaining where the Code128 tag-number
  barcode comes from.
- The true role→permission grant matrix, which is backend configuration.
- Executing the test flows.

# Traveller parity — roadmap

**Goal.** `web-app/apps/ssr` and `super-app` serve the same traveller and must offer
the same capabilities. The starting point is the inventory in
[`docs/traveller-parity/2026-09-30-traveller-parity-report.md`](../../traveller-parity/2026-09-30-traveller-parity-report.md).

**Parity means capabilities, not UI.**
- Each app keeps its own design language.
- Device-only features (NFC card tap, native card scan) are exempt on the web.
- Where one side is buggy, fix it towards the correct behaviour instead of copying the bug.

**Done means:** every row of the report's matrix is either "=" or deliberately marked
"keep different".

## Waves (decided 2026-09-30: by domain)

Each wave closes one domain in **both** apps and is verified side by side before the next one starts.
Each wave gets its own spec → plan → build.

| Wave | Contents | Decisions it needs |
| --- | --- | --- |
| **1. Bugs** | The confirmed bugs in both apps. See [wave 1 spec](2026-09-30-traveller-parity-wave1-bugs-design.md). | settled |
| **2. Tags** | ssr: tag detail brought up to super-app's (all invoices + lines, fees + net, deadline, timeline, localized status), list sort + date filter + deadline chips, the "Already validated" bucket. super-app: manual claim by number + sales amount, a reachable manual lookup. | the headline amount on a row; whether the anonymous public tag page shows the traveller's name and document |
| **3. Identity & account** | ssr: documents page (add via Didit `ProveDocument`, set primary, set active), a real avatar upload, in-app account deletion, the verified badge. super-app: change password. | one password rule |
| **4. Payout** | Bank accounts in both apps, and whether banks can be picked during validate. **Blocked on the backend:** the traveller role does not hold `RefundService.TravellerCards.CreateBank`. | whether travellers get bank payout at all |
| **5. Polish** | ssr: home dashboard and FAQ. super-app: map cluster tap, universal-link routes for web QR URLs. Both: sign-out vs Retry when a page load fails. | sign-out behaviour; support chat on mobile |

## Facts the waves rest on (verified 2026-09-30)

**Traveller grants on dev** (`tur-a25y29041`, 51 policies):
- Includes: `TagService.Tags.{TravellerSelfAssign, TravellerSetPayoutToken, GetTagsByTravellerId, GetTagByTagNumberCrossTenants}`, `TagService.TagRisks.ViewRiskLevel`, every `TagService.TagsNameSpace.ViewTotals.*` leaf, `RefundService.TravellerCards.{Create, Delete, SetDefault, UpdateNickname, ViewMine}`, `TagService.StickerManualVerifications.{Upload, ViewMine}`, `TravellerService.SSRActions.ProveDocument`, `TravellerService.Travellers.{GetMyDocumentAffiliations, SetActiveDocument, SetPrimaryDocument, GetDocumentDiditUpgradeOptions}`.
- `IdentityService.Gdprs.DeleteUserData` was added by the user on 2026-09-30.
- **Not held:** `RefundService.TravellerCards.CreateBank`, `TagService.TagRisks.FilterByRisk`.

**Consequences:**
- Risk visibility is not a divergence: both apps may show it, gated on `ViewRiskLevel`.
- Bank payout is a backend decision, not an app gap.

**Standing rules that apply to every wave:**
- Gate every action by its endpoint's group + leaf grant; no control without the grant (memory `gate-every-action-by-grant`).
- The user runs native builds. JS-only changes are verified through Metro on CPadNFC.
- `packages/utils` is a submodule: a change there is a `web-utils` PR first, then a pointer bump.

## Status

- **Wave 1 (bugs): done 2026-10-01.**
  - web-utils #51 is merged (merge commit `fa3b8b6`).
  - unirefund-web: the 6 ssr commits reached `main` at `5deb213e5` via an automated push before a PR could be opened. The user kept them there.
  - unirefund-mobile #64 is open (11 commits).
  - Follow-ups:
    - the userinfo verification fetch has no timeout;
    - a pre-existing jwt `update` callback issue is to be tracked privately;
    - review minors are listed in the wave 1 spec's PRs.
- **Wave 2 (tags):** not started. It needs two decisions first: the row's headline amount, and whether the anonymous public tag page shows traveller data.

# SDD ledger — plan: /c/unirefund/docs/superpowers/plans/2026-09-22-superapp-tag-row-versions.md

Spec: /c/unirefund/docs/superpowers/specs/2026-09-22-superapp-tag-row-versions-design.md (read)
Workspace: /c/unirefund/super-app on branch `feat/tag-row-versions`, base 16c25af
Baseline (measured in an identical checkout at 16c25af): jest 258 suites / 2616 passed, 1 skipped, 0 failed.
tsc baseline: 1 pre-existing error in src/app/__tests__/tabBackNavigation.router.test.tsx.

Setup Ruling: work in the shared /c/unirefund/super-app checkout on a feature branch, at the
user's explicit direction ("Use super-app folder not worktree"). A worktree was built and
torn down first. A branch rather than main, because the SDD skill forbids implementing on
main without consent and the user directed the folder, not the branch. Cost if wrong: this
checkout is shared, so another session arriving mid-plan sees `feat/tag-row-versions`
checked out rather than main; the tree was clean at switch time.

Setup Ruling: did NOT reuse /c/unirefund/super-app-safe (user asked). It is a separate CLONE,
not a linked worktree, so its commits live in a different object store and would need pushing
to reach super-app before a merge. Cost if wrong: none; it is untouched.

## Pre-flight scan

### Cross-task rows (shared file or interface)

| Tasks | Produces -> consumes | Finding |
|---|---|---|
| 1 -> 4,5,6,7 | TagRowDesign, DEFAULT_TAG_ROW_DESIGN, useTagRowDesign(), default store | clean - every consumer uses the exact exported names |
| 2 -> 3 | tagRowTone(tag, source), TagRowToneSource | clean |
| 3 -> 4 | TagRow props | clean - T4 passes a subset, all named correctly |
| 3 -> 5 | TagRow props | DEFECT D3 - T5 passes formatDate={formatDate}; CustomsTagList's formatter is named formatRowDate (line 156). No formatDate in that scope. |
| 6 -> 7 | route /(auth)/(modals)/tag-row-design; keys MobileApp.Profile.TagRowDesign, MobileApp.TagRowDesign.* | clean |
| file overlap | - | none: no two tasks modify the same file |

### Per-task internal consistency

| Task | Finding |
|---|---|
| 1 | clean - test asserts exactly what the code exports |
| 2 | clean - text says "export effectiveRiskLevel if not exported"; verified already exported at customsTags.ts:63, so that step is a no-op and the Files block (create only) is correct |
| 3 | DEFECT D1 - component renders empty <View testID="tag-row-wash"/> and <View testID="tag-row-selected"/> purely so tests can assert. Test-only code in production. |
| 4 | DEFECT D2 - step says "make the existing gap conditional"; the 12px gap is mb-3 in TagCard's own VARIANT.row.container, not on the list. No list-level gap exists. |
| 5 | D3 above. disabled, onOpenTag, selectedIds, tenantCurrency, formatAmount all verified present in that component's scope. |
| 6 | clean |
| 7 | DEFECT D4 - step's code calls guardNav, which exists in StaffProfileScreen but NOT in IdentityProfileScreen; that screen's rows call router.push directly. |
| 8 | clean |

### Rulings (made before dispatch)

Ruling D1: Task 3 drops both empty marker Views. The suite asserts the wash by the root
Pressable's backgroundColor and the absence of tag-row-bar, and selection the same way. The
bar keeps testID="tag-row-bar" because it is a real element. Reason: production code must not
carry elements that exist only for tests. Cost if wrong: row tests couple to a style value
instead of a testID - a cheap edit.

Ruling D2: Task 4 adds ItemSeparatorComponent for non-classic designs only, and TagRow carries
no bottom margin; nothing about the list's spacing is made conditional, because the gap it was
meant to remove lives on TagCard and disappears on its own when TagCard is not rendered. Cost
if wrong: row spacing off by a few px, visible on first render.

Ruling D3: Task 5 passes formatDate={formatRowDate}. Reason: that is the formatter the
component already builds, and its comment says it deliberately omits the time a full
formatDate would carry. Cost if wrong: a compile error, caught immediately.

Ruling D4: Task 7 uses guardNav in StaffProfileScreen and a plain router.push in
IdentityProfileScreen, matching each screen's existing rows rather than importing a hook into
a screen that does not use one. Cost if wrong: a double-tap on the traveller screen could push
twice - the same exposure every other row on that screen already has.

## Progress

Task 1: complete (commits 16c25af..c6a7f18, review clean — spec OK, quality approved)
Task 1: minor (deferred): merge-guard test calls persist.getOptions().merge directly rather than
  seeding AsyncStorage and awaiting rehydrate() as deviceSettings.test.ts does; it exercises the
  real merge (not a mock) and fails on real regressions, but never proves the name/storage/version
  wiring round-trips. Traces to the plan's own test code, not the implementer.
Task 1: minor (deferred): implementer used its own model name in the Co-Authored-By trailer
  rather than the brief's literal line. Correct call per the live attribution instruction.
Task 1: resolved both reviewer ⚠️ items myself — ran `npx tsc --noEmit` (exactly the one
  pre-existing tabBackNavigation error, nothing new) and `npx jest` on the task's test (4/4).

Task 2: complete (commits c6a7f18..a1bdd65, review clean — spec OK, quality approved)
Task 2: minor (deferred): BY_STATUS_TONE / BY_RISK are typed Record<string, TagRowTone> rather
  than Record<TagStatusTone,...> / Record<TagRiskLevel,...>, so widening either union would not
  fail compilation — only the runtime `?? NEUTRAL` fallback catches a gap. Inherited from the
  plan's own code. Reviewer independently confirmed both records currently cover their unions
  exactly (tagStatus.ts:10-11, types.gen.ts:2322).

Task 3: complete (commits a1bdd65..dc9ebe7, review clean — spec OK, quality approved)
Task 3: Ruling D1 applied and verified — both test-only marker Views gone (grep across src/ finds
  neither testID), tag-row-bar kept as a real element, and the three tests now assert the root's
  flattened backgroundColor. Reviewer independently confirmed the wash+selected test really proves
  selection is ignored under wash (asserts the wash literal, not SELECTED_FILL) rather than passing
  by accident — that asymmetry is the whole trade the feature exposes.
Task 3: minor (deferred): the test file keeps an inert jest.mock of @/components/Ionicons (TagRow
  never imports it), and duplicates the hex literals across two tests instead of hoisting them.

Task 4: complete (commits dc9ebe7..45bc3fe, review clean — spec OK, quality approved)
Task 4: Ruling D2 applied — implementer verified before editing that the FlashList had no
  list-level gap at all; only ItemSeparatorComponent was added (undefined for classic). TagCard
  branch confirmed byte-identical by the reviewer, relocated under an if with no prop/JSX change.
Task 4: minor (deferred): new test uses `as never` on a partial TagListItem fixture. Reviewer
  confirmed the precedent is real (TagScreenRiskFilter.router.test.tsx:311,319) for the same
  fixture-narrowing problem — an accepted repo pattern, not a new type hole.
Task 4: resolved reviewer ⚠️ on NativeWind — the separator uses the bracket value bg-[#D1D5DB].
  Recorded project finding: bracket values do NOT silently fail in this app; the silent-failure
  case is an opacity modifier on a token (bg-card/92). No action.

PLAN DEFECT (fixed): an unclosed ```tsx fence in the plan's Task 3 made the brief extractor treat
  every later heading as fenced, so task-3-brief.md swallowed Tasks 3-8 (950 lines) and Task 4
  reported as missing. Fixed in docs repo commit 318c4b3; briefs 4-8 now extract at 156/156/219/90/27
  lines. Tasks 1-3 were unaffected in substance because their dispatches scoped the work, not the brief.

Task 5: review — spec ✅, quality Changes needed. Important: the "either neighbour" separator
  rule (the load-bearing one) has zero test coverage; all 4 tests also pass under a weaker
  "follows a selected row" rule. Fix round 1 dispatched (resumed implementer ad86f35).
Task 5: Ruling — folded the Minor "tinted design never exercised in this file" into the same fix
  round rather than deferring it. Reason: the implementer is already writing tests in that file,
  so it costs one test and does not extend the loop. Cost if wrong: one extra test in a round
  that was happening anyway.
Task 5: minor (deferred): renderLedgerRow builds onSelect and the leading JSX inline, so fresh
  identities every render defeat LedgerRow's React.memo — against this file's own stated
  convention (see its formatAmount/riskFooters comments). Inherited verbatim from the plan's
  Step 3 snippet. Low impact on a paged worklist.
Task 5: fix round 1/5 (2 addressed, 0 open — either-neighbour separator coverage; tinted design
  coverage; commits 816620b..afc9f2e). Implementer mutation-tested its own fix: temporarily
  weakened separatorFor to the "follows" rule, watched the new test fail, reverted. Production
  code provably unchanged (empty git diff --stat).
Task 5: complete (commits 45bc3fe..afc9f2e, review clean after 1 fix round)

Task 6: complete (commits afc9f2e..1efe7bf, review clean — spec OK, quality approved)
Task 6: locale files were clean before the implementer touched them, so no hunk-splitting was
  needed; reviewer independently parsed both JSONs and confirmed en-US/tr-TR key parity, genuine
  Turkish (not leftover English), and unchanged top-level key counts (27/27).
Task 6: minor (deferred): no accessibilityRole="radiogroup" on the option wrapper, so a screen
  reader loses "1 of 3" positioning. Pre-existing repo convention — ProfileDesignPicker in
  debug-menu.tsx has the identical gap. Fixing would mean changing both, not just this screen.

Task 7: complete (commits 1efe7bf..d350dc7, review clean — spec OK, quality approved)
Task 7: Ruling D4 applied and confirmed — guardNav in StaffProfileScreen (its universal
  convention), plain router.push in IdentityProfileScreen (which imports useGuardedNavigation
  nowhere). Differing shapes between the two screens are correct, not an inconsistency.
Task 7: reviewer ruled on both implementer judgment calls: (a) the split-last-segment `t` mock is
  the only one under which the brief's literal assertions pass, and the test sets the store away
  from the default before asserting, so it really proves the value tracks state; (b) the `as never`
  cast on the dynamic translation key matches the accepted repo idiom (TagRowDesignScreen.tsx:35)
  and hides no type error — the map is exhaustive and both locales carry all three keys.
Task 7: minor (deferred, FLAG TO FINAL REVIEW): IdentityProfileScreen's new row has NO test — only
  StaffProfileScreen's is covered. That screen is half the feature's reach (every traveller), so
  this is the most substantive deferred item in the plan. Brief-scoped, not an implementer lapse.
Task 7: minor (deferred): TAG_ROW_DESIGN_LABEL now duplicated verbatim in three files
  (both profile screens + TagRowDesignScreen's OPTIONS). Brief-mandated a per-screen const.

Task 8: GATE FAILURE — full suite red. src/components/ui/__tests__/tokens.test.ts fails 2 tests:
  "uses no arbitrary colour value in a class" (TagScreen.tsx:1058) and "uses no raw hex outside
  the palette module" (CustomsTagList.tsx:185-186, TagRow.tsx:14, tagRowTone.ts:15,18-21,26-28).
  tsc is clean (only the pre-existing tabBackNavigation error). 264/265 suites pass.

Task 8: PLAN DEFECT (mine, load-bearing). The spec and plan mandated raw hex literals throughout
  the new code. This repo enforces a token layer with a mechanical guard, and that guard states
  its own remedy: "the fix is a token from src/global.css (or `colors` from src/utils/theme.ts
  for a prop that takes a value) — not a new entry below [the exception list]". Every per-task
  suite passed because the guard lives in a suite none of them ran.

Task 8: Ruling — satisfy BOTH authorities rather than either alone. The spec's binding content is
  the exact colour VALUES; the repo's is where they live. So: add the three missing tokens to
  global.css + theme.ts + tailwind.config.js (warning-strong #b45309, info-strong #1d4ed8,
  primary-surface #fff5f5 — the first two are the AA-safe text variants the spec already requires,
  the third is the selection fill), then source every colour in the new code from `colors.*` or a
  token class. Every rendered value stays byte-identical, so nothing visual changes and no task's
  approved behaviour is altered. Adding entries to the guard's ALLOWED list was rejected: the
  guard's own docblock forbids it, and an exception would quietly exempt the newest code in the
  app from the discipline the rest follows. Cost if wrong: three new tokens in the palette that
  only these rows use — visible, cheap to remove.
Task 8: fix round 1/5 (2 addressed, 0 open — token-layer routing; commit d350dc7..28354e0).
  Three tokens added across global.css + theme.ts + tailwind.config.js; every colour in the new
  code now comes from `colors.*` or a token class. Three test files changed to assert against
  `colors` rather than restated uppercase hex (tokens are lowercase); NO rendered value changed.
Task 8: complete — gates verified by me, not only reported: tokens.test.ts + theme.test.ts 8/8;
  full suite 265 suites / 2648 passed / 0 failed; tsc exactly 1 line (the pre-existing
  tabBackNavigation error); grep finds no raw hex left in tagRowTone/TagRow/CustomsTagList.

MERGE-BASE for final review: 16c25af

FINAL REVIEW (opus, whole branch 16c25af..28354e0): verdict "fix first".
  CRITICAL: the new rows pick tone from ROLE alone (TagScreen.tsx:702, CustomsTagList.tsx:206),
    while the classic path gates on the ViewRiskLevel grant (tintByRisk, showRisk={canViewRisk}).
    A customs officer without that grant would read Green/Red off the bar/wash — the exact
    readout the badges, dot and footer hide from them. Permission leak. Every per-task review
    missed it because each saw only its own file.
  IMPORTANT: CustomsTagList keeps `gap-2` for both paths, so the flat design renders as spaced
    bands with hairlines floating in white space — and TagScreen's version of the SAME design
    has no gap, so the two lists disagree. Traces to my plan: Task 4 was told to remove a gap
    that did not exist; Task 5, which has one, was never told.
  IMPORTANT: `as never` on the dynamic i18n key at 4 sites disables the only guard on 6 new keys.
  IMPORTANT: picker sets accessibilityLabel, which suppresses the hint — the only text saying
    what each option does is never announced.
  MINOR: tagHeadlineAmountKind returns null for a tag with no figure; the caption then reads
    "Purchase" over an em-dash. Inert Ionicons mock. TabPage's px-4 means the bar's square
    leading edge meets a 16px gutter rather than the screen edge (spec deviation, reported not
    fixed — changing TabPage would affect every screen).
  Triage of the 7 deferred minors: #2 folded into the i18n fix; #1,#3,#4,#5,#6,#7 fine to defer.
    Reviewer noted #1's real exposure was the unchecked label key, which the i18n fix closes.
  Confirmed independently: classic IS untouched (TagCard/CustomsTagRow not in the diff, JSX moved
    byte-identical into an else, separator resolves undefined, token changes additive under a
    parity test).

FINAL FIX WAVE: commit 28354e0..c525236. Scoped re-review: all 6 findings ADDRESSED, no new
  breakage. The one pre-existing test it edited was SPLIT into two (strengthening), not weakened.
FINAL GATES (run by me): full suite 265 suites / 2651 passed / 1 skipped / 0 failed; tsc exactly
  1 line (pre-existing tabBackNavigation error); `git diff 16c25af..HEAD -- TagCard.tsx
  CustomsTagRow.tsx` is EMPTY, so `classic` is provably untouched; 10 commits; clean tree.
BRANCH COMPLETE.

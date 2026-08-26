# Follow-ups: super-app PageHeader branch

**Branch:** `feat/page-header-back-button` (13 commits off `e7baa09`)
**Spec:** [2026-08-26-super-app-page-header-design.md](./2026-08-26-super-app-page-header-design.md)
**Status:** shipped complete; these are the known-open items, in priority order.

## 1. Android back does not dismiss a bottom sheet — it navigates off the screen

**Device-reproduced**, not theorised. On `OrderPAD 3` at branch head: Profile → My Cards → *Add card* (sheet opens) → Android back. The sheet did **not** dismiss; the app navigated off My Cards entirely to Profile.

**Mechanism.** RN dispatches `hardwareBackPress` LIFO — last registered runs first. `BottomSheet.tsx` subscribes once at mount in `useEffect(…, [])`. `PageHeader.tsx` subscribes through `useFocusEffect`, which registers later and re-registers on every refocus, so it is always the fresher listener. Its handler returns `true` unconditionally, so `BottomSheet`'s never runs.

**Scope.** The mechanism predates this branch — `CardsScreen`, `TagDetailScreen` and `StickerTagScreen` already sat under `ModalTemplate`'s identical listener, so this ships in production today. The branch **extends** it to `CreateTagScreen`, `RefundScreen` and `CustomsValidateScreen`, which had no listener at all before.

**Why it matters most on Refund.** [`RefundConfirmSheet.tsx:41-43`](../../../super-app/src/screens/refund-point/Refund/_components/RefundConfirmSheet.tsx#L41-L43) documents that back-dismiss must stay available because `fetchRequest` has no timeout and there must remain one explicit way out if the request hangs. That contract is currently false on that screen.

**An attempted fix was reverted.** Commit `4f844d5` re-registered the subscription imperatively inside the sheet's `onChange`. It passed 995 tests, a full green suite, and an adversarial re-review that traced every lifecycle path and concluded there was no leak. **It crashed the app on device:**

```
Something went wrong
backHandlerSubscription.current?.remove is not a function (it is undefined)
```

It stored `BackHandler.addEventListener(…)`'s return in a ref typed `{ remove: () => void }`. On device that value is truthy but has no `.remove`, so the `?.` guard (which only protects against null) did not help. Reverted in `06e3218`.

**The trap for whoever picks this up:** jest's `BackHandler` mock returns a `{remove}` shape the real API does not. **A green suite cannot validate this change.** Any fix must be loaded onto a device via Metro before it is believed. Note that the `const sub = …; return () => sub.remove()` form inside an effect cleanup *does* work on device — `PageHeader.tsx` uses it and is device-verified; the failure was specific to holding the handle in a ref and removing it imperatively later.

## 2. Ten redundant `backAction={() => router.back()}` call sites

Now byte-identical to `PageHeader`'s default, so they can simply be deleted: `ConnectedDevicesScreen.tsx:57`, `ManualEntryScreen.tsx:99`, `StickerTagScreen.tsx:242,262,278,301,321,338`, `CardsScreen.tsx:77`, `DocumentsScreen.tsx:34`. Deliberately deferred to avoid churn on an already-reviewed branch; the misleading comments that *taught* this workaround were fixed in `1a595d1`.

## 3. `return true` is unconditional in `PageHeader`

`router.back()` queues a `GO_BACK` that React Navigation silently drops on an empty history. On a cold deep-link into e.g. `/reset-password` or `/tag-preview`, both the arrow and the hardware key are inert, and the key cannot exit the app either. Pre-existing for `ModalTemplate`; the spec fixed only `/register`, which had no inbound navigation at all. Practical risk is low (the reset-password mail targets the web portal, not the app). Fix: a `router.canGoBack()` guard — [`TagDetailScreen.tsx:160-166`](../../../super-app/src/screens/shared/Tags/TagDetail/TagDetailScreen.tsx#L160-L166) already models the pattern.

## 4. The `px-4` unify is measured, not aesthetically judged

Commit `29e6f08` is cosmetic and deliberately isolated — `git revert 29e6f08` restores the previous look exactly (verified: it cleanly re-adds `px-6` and both `titleClassName` overrides, with no half-state). `titleClassName` is kept on `PageHeader` as the revert lever even though no caller passes it.

The inset was **confirmed live** at 16dp on both an 800dp tablet and a ~488dp phone (calibrated against the back button's known `size-10`/40dp). It was **not** A/B'd against `px-6`: the other agent sessions' Metro instances serve the same checkout, so a "before" capture was already this branch's code, and producing a real baseline would have meant checking out an older commit in a directory other agents were actively bundling from. Neither available device is narrower than ~488dp, so how `px-4` reads at ~360dp is still unknown.

Also note: the header **row alignment** changed in `b069ae6` (the non-cosmetic commit) and is *not* covered by the revert lever — the arrow is now top-aligned rather than vertically centred, and a long title wraps instead of overflowing.

## 5. Smaller

- No test pins `PageHeader`'s title `className`, so an accidental change to the `titleClassName` default would not be caught. Worth adding once item 4 is settled.
- `DiditScreen.tsx` registers its own unscoped `hardwareBackPress` listener. **Investigated and closed** — the pre-branch `ModalTemplate` listener was equally unconditional, `DiditScreen`'s parent effect still wins LIFO, and the device shows its "Exit Verification?" confirm appearing as before. Not a regression; recorded so it is not re-raised.

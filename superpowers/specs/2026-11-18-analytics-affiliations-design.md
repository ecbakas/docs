# Analytics "Who can see it" — design

**Date:** 2026-11-18 · **Repo:** `web-app` (`apps/web`) · **Size:** modest — one dialog in four grids

## Why

The 2026-11-03 wiki report added `PUT .../tenant-grid/{id}/affiliations` so a tenant can choose
who sees a host-managed dashboard or data source. The 2026-11-18 audit found it unwired, and
found the wider gap behind it: **web-app has no affiliation editor anywhere.** Host catalog
rows have GET/manage actions with no caller, and tenant-local rows have none either. Host
admins have no other place to set default audiences (confirmed 2026-11-18), so today a host
item's default list is empty and only `admin` sees it until something writes one.

## How visibility works (backend, `EmbeddedDashboardRepository.ApplyResolutionFilterAsync`)

- Affiliations are an **allow-list** of role names and user ids.
- A **host row** is visible to a tenant user when the item is not switched off for that tenant
  and the user matches the **effective** list: the tenant's shadow list when
  `isAffiliationsOverridden`, otherwise the host default list (`TenantId == null`).
- `admin` bypasses the **host default** list only. A tenant override has no admin bypass, so
  an **empty override hides the item from everyone, admin included**.
- A **tenant-local row**'s list is its own affiliation rows; `admin` sees every row via RLS.

## Goals

One "Who can see it" dialog, opened as a row action, in all four analytics grids:

| Grid (page)                                   | Rows it acts on          | Reads current list from        | Saves with                                             | Gate (group + leaf)                    |
| --------------------------------------------- | ------------------------ | ------------------------------ | ------------------------------------------------------ | -------------------------------------- |
| `dashboard-availability`, `data-source-availability` (tenant) | host rows → override     | grid row `effectiveAffiliations` | `PUT tenant-grid/{id}/affiliations` (whole list)       | `.SetAffiliations`                     |
| same two grids (tenant)                        | own rows                 | grid row `effectiveAffiliations` | `POST {id}/affiliations` (add/remove diff)             | `.ManageAffiliations`                  |
| `dashboards`, `data-sources` (host)            | host catalog rows        | `GET {id}/affiliations` on open  | `POST {id}/affiliations` (add/remove diff)             | `.ViewAffiliations` + `.ManageAffiliations` |

All gates are `AnalyticService.EmbeddedDashboards.*` / `AnalyticService.AnalyticsDataSources.*`
with their group, per the repo's full-pair rule.

## Non-goals

- A "visible to" column in the grids. The existing Default/Custom badge stays the only signal.
- super-app (its analytics screen reading the plain list instead of `/available` is a
  separate fix).
- Anything in the UNI-1889 worktree.

## Anti-goals

- Saving an override that silently hides an item from everyone.
- Wiping a list the user could not see: a field whose picker list the caller may not load
  must reach the backend unchanged.

## Approaches

- **A. Row-action dialog with a SchemaForm — chosen.** Repo-standard pattern, least new code,
  edits stay one click from the row.
- B. A `[id]/visibility` page per item — easier name resolution and room for a default-vs-custom
  comparison, but four new routes with guards, sidebar/i18n plumbing, and navigation away
  from the grid.
- C. A hand-built side-by-side dialog — clearest comparison, but custom UI where the repo
  standard is SchemaForm.

## Design

**Dialog.** One shared client component under `settings/analytics/_components/`, rendered via
the grid's `type: "dialog"` row action. It is a `SchemaForm` over
`$UniRefund_AnalyticService_AnalyticsCatalog_SetCatalogItemAffiliationsDto` (`roleNames`,
`userIds`), with both fields as multi-selects through `CustomSelectableWidget` (the
new-user form's role picker): roles keyed and labelled by `name`, users keyed by `id` and
labelled by `userName`.

**Picker data.** Each of the four `page.tsx` files fetches the lists as **optional** requests,
skipped without their grant (`isRequirementMet`): `getAllRolesApi` behind `AbpIdentity.Roles`,
and on the two tenant pages `getUsersApi({ maxResultCount: 1000, sorting: "userName" })`
behind `AbpIdentity.Users` (the agent-cash-report pattern).

**Host dialog is roles only.** Host user ids mean nothing inside a tenant. The `userIds` field
is not rendered and existing host user ids are left untouched by the diff.

**A field whose list could not be loaded is not rendered and is sent back unchanged** — the
diff adds/removes nothing for it, and the override PUT resends its current values. The action
is hidden when neither list loaded.

**Saving.**
- Override: `PUT` the full list.
- Own and host rows: compute `{roleNamesToAdd, roleNamesToRemove, userIdsToAdd, userIdsToRemove}`
  against the current list and `POST` it; send nothing when the diff is empty.
- The diff lives in a plain `.ts` module with a `test:unit` suite.
- Results go through `handlePostResponse` / `handlePutResponse`, which refresh the grid.

**Empty lists.**
- Override: **blocked** — "To hide it from everyone, switch it off instead." The Enabled
  toggle is the tool for that.
- Host default and own rows: allowed, with an inline warning — "Only admins will see it."

**Override context.** For a host row in a tenant grid, the dialog shows the host default roles
read-only beneath the form, so the tenant sees what it is replacing. Reset to default already
exists as a row action.

**Actions (`packages/actions/unirefund/AnalyticService`).**
- Add `putEmbeddedDashboardTenantGridAffiliationsApi` and
  `putAnalyticDataSourceTenantGridAffiliationsApi` to `put-actions.ts`.
- Fix `postEmbeddedDashboardAffiliationsByIdApi`: it sends no `requestBody` today, so it
  cannot add or remove anyone. Take the full `PostApi...AffiliationsData`.
- Both existing POST affiliation actions use `structuredSuccessResponse`; switch to
  `structuredResponse` per `api-actions.md`.

**i18n.** New keys in `AnalyticService` `resources/{en,tr}.json` for the action label, dialog
title, field labels, the two empty-list messages and the host-default caption.

## Verification

- `pnpm --filter web test:unit` for the diff module (red-green).
- `pnpm --filter web type-check` (baseline 2 errors), `lint`, `pnpm policy:audit`,
  `pnpm i18n:missing --app=web`, `pnpm form:order`.
- On dev as `admin` (Faroe Islands): override a host dashboard to one role, confirm a user
  outside it loses it from `/available`, then reset. Use a throwaway catalog item for toggles.
- Host pages need a host admin login — ask in-session; otherwise say they are unverified.

## Left to the builder

- Branch/worktree setup (the main checkout is shared).
- Exact i18n wording and the Turkish text (reuse existing analytics terms).
- How an id missing from the user list renders (raw id is acceptable).
- Bump `web-app/docs/wiki-implementation-status.md` to `Daily-Report-2026-11-17` in the same PR,
  recording the 2026-11-18 audit (UNI-1889 open in its worktree; `policies.json` is
  generated, not a gap).

#!/usr/bin/env node
/**
 * Structural verification for docs/qr/.
 *
 * The guide makes mechanical promises about itself — every action id joined
 * across five files, every endpoint reachable, no permission cell blank. Those
 * are checked mechanically rather than by eye.
 *
 * Zero dependencies.
 *   node docs/qr/_verify/check.mjs            # every check
 *   node docs/qr/_verify/check.mjs registry   # named checks only
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const GUIDE = [
  "README.md",
  "traveller.md",
  "merchant.md",
  "refund-point.md",
  "customs.md",
  "actions-and-routes.md",
  "endpoints.md",
  "permissions-by-role.md",
  "test-flows.md",
];
const PERSPECTIVES = ["traveller.md", "merchant.md", "refund-point.md", "customs.md"];

const CLIENT_ONLY = "— client only";
const CONTRAST = "— contrast";
const NA = "—";
const ANON = "— anonymous";
const AUTH_NO_GRANT = "— authenticated, no grant";
/** Every marker a Permission cell may hold. Anything else must be a real permission string. */
const PERM_MARKERS = [NA, ANON, AUTH_NO_GRANT];
/** The parties that have a perspective chapter of their own. Order matches PERSPECTIVES. */
const PARTY_CHAPTER = new Map([
  ["traveller", "traveller.md"],
  ["merchant", "merchant.md"],
  ["refund point", "refund-point.md"],
  ["customs", "customs.md"],
]);

/**
 * How many perspective chapters an Actor cell entitles an action to appear in, so a
 * cross-role action may be narrated by each party that performs it.
 *
 * Only parties that HAVE a chapter count. "Admin" is a real actor with no chapter of
 * its own, so counting it would hand the row a chapter of headroom that does not
 * exist — over-permissive, and silent. "Anyone" is every party, not one; it is what
 * the registry uses for the shared scanner, which all four chapters legitimately
 * describe.
 */
const ACTOR_CHAPTERS = (cell) => {
  // "Anyone" means every party, and it is frequently qualified — the registry
  // carries "Anyone, pre-login" and "Anyone, including logged out". Matching the
  // bare word only was a bug: those two cells fell through to the named-party
  // list, came out empty, and would have made A01 and A06 unnarratable in the
  // three chapters permissions-by-role.md files them under.
  if (/^anyone\b/i.test(cell.trim())) return new Set(PERSPECTIVES);
  return new Set(
    cell
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => PARTY_CHAPTER.has(s))
      .map((s) => PARTY_CHAPTER.get(s))
  );
};
/**
 * Action ids are `A` plus two or three digits — `A01` through `A999`.
 *
 * Two digits were the original rule, and it silently became a design constraint:
 * three row pairs were merged to land inside `A99` rather than exceed it — the
 * tooling deciding the deliverable's granularity. Worse, `A100` would have
 * *partly* matched `\bA\d{2}\b` and gone half-visible to the cross-file joins.
 * Both patterns take 2-3 digits, greedily, so `A100` reads as one id and not as
 * `A10` followed by a stray `0`.
 */
const ID_RE = /^A\d{2,3}$/;
const ID_ANYWHERE = /\bA\d{2,3}\b/g;

const failures = [];
const fail = (msg) => failures.push(msg);
const read = (f) => readFileSync(join(ROOT, f), "utf8");

/**
 * Header and body rows of every markdown table in `md` whose header's first cell
 * is `headFirstCell`. Several such tables merge into one result, so the registry
 * may be split per app and endpoints.md per service.
 */
function table(md, headFirstCell) {
  let head = null;
  const rows = [];
  let inside = false;
  for (const line of md.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      inside = false;
      continue;
    }
    const cells = trimmed.split("|").slice(1, -1).map((c) => c.trim());
    if (!inside) {
      if (cells[0] === headFirstCell) {
        inside = true;
        head = cells;
      }
      continue;
    }
    if (/^:?-{3,}:?$/.test(cells[0])) continue;
    rows.push(cells);
  }
  return { head, rows };
}

const checks = {};

checks.files = () => {
  for (const f of GUIDE) {
    if (!existsSync(join(ROOT, f))) fail(`missing file: ${f}`);
  }
};

/**
 * Every file carries a `Verified against:` stamp, and all nine carry the **same**
 * one. Nine files derived from one pair of revisions cannot honestly be stamped
 * against two: a single file left on an older sha is exactly how a reader ends up
 * trusting a citation that has since moved. Presence alone was checked before
 * this, so one file's sha could drift and the run still printed OK.
 */
checks.stamps = () => {
  const seen = new Map();
  for (const f of GUIDE) {
    const line = read(f)
      .split(/\r?\n/)
      .find((l) => l.includes("Verified against:"));
    if (!line) {
      fail(`${f}: no "Verified against:" line`);
      continue;
    }
    seen.set(f, line.trim());
  }
  const stamps = new Set(seen.values());
  if (stamps.size > 1) {
    const [majority] = [...stamps].sort(
      (a, b) =>
        [...seen.values()].filter((v) => v === b).length -
        [...seen.values()].filter((v) => v === a).length
    );
    for (const [f, line] of seen) {
      if (line !== majority) {
        fail(`${f}: stamp "${line}" disagrees with the other files' "${majority}"`);
      }
    }
  }
};

checks.placeholders = () => {
  // "<sha>" and "<title>" catch a stub whose stamp or heading template was
  // scaffolded and never filled in — the two placeholders this guide's own
  // templates actually used.
  const banned = ["TBD", "TODO", "FIXME", "fill in later", "verify this later", "<sha>", "<title>"];
  for (const f of GUIDE) {
    read(f)
      .split(/\r?\n/)
      .forEach((line, i) => {
        for (const b of banned) {
          if (line.includes(b)) fail(`${f}:${i + 1}: placeholder "${b}"`);
        }
      });
  }
};

let registry = null;

function loadRegistry() {
  if (registry) return registry;
  const ids = new Set();
  const byId = new Map();
  const endpoints = new Set();
  registry = { ids, byId, endpoints };

  const { head, rows } = table(read("actions-and-routes.md"), "ID");
  if (!head) {
    fail("actions-and-routes.md: no table whose first header cell is `ID`");
    return registry;
  }
  for (const c of ["Actor", "Endpoint", "Permission"]) {
    if (!head.includes(c)) fail(`actions-and-routes.md: table has no \`${c}\` column`);
  }
  const iActor = head.indexOf("Actor");
  const iEnd = head.indexOf("Endpoint");
  const iPerm = head.indexOf("Permission");

  for (const cells of rows) {
    const id = cells[0];
    if (!ID_RE.test(id)) {
      fail(`actions-and-routes.md: bad action id "${id}" (want A## or A###)`);
      continue;
    }
    if (ids.has(id)) fail(`actions-and-routes.md: duplicate action id ${id}`);
    ids.add(id);

    const endpoint = iEnd >= 0 ? (cells[iEnd] ?? "") : "";
    const perm = iPerm >= 0 ? (cells[iPerm] ?? "") : "";
    if (!perm) fail(`${id}: empty Permission cell — a permission string or one of ${PERM_MARKERS.join(" / ")}`);
    if (!endpoint) fail(`${id}: empty Endpoint cell — an endpoint or "${CLIENT_ONLY}"`);

    // Marker vocabulary. Non-emptiness alone let a client-only row claim
    // "— anonymous", which asserts a token rule about an endpoint that does
    // not exist. Ruled 2026-07-31; enforced here so prose is not the only guard.
    if (endpoint === CLIENT_ONLY) {
      if (perm !== NA) {
        fail(`${id}: "${CLIENT_ONLY}" must take "${NA}" in Permission, not "${perm}" — there is no endpoint to be anonymous about`);
      }
    } else if (endpoint) {
      if (perm === NA) {
        fail(`${id}: has endpoint "${endpoint}" but Permission is "${NA}" — state the permission, or "${ANON}" / "${AUTH_NO_GRANT}"`);
      } else if (perm.startsWith("—") && !PERM_MARKERS.includes(perm)) {
        fail(`${id}: Permission "${perm}" is not a defined marker — use one of ${PERM_MARKERS.join(" / ")} or a real permission string`);
      }
    }

    byId.set(id, { endpoint, perm, actor: iActor >= 0 ? (cells[iActor] ?? "") : "" });
    if (endpoint && endpoint !== CLIENT_ONLY) endpoints.add(endpoint);
  }
  return registry;
}

checks.registry = () => {
  loadRegistry();
};

checks.perspectives = () => {
  const { ids } = loadRegistry();
  const seen = new Map();
  for (const f of PERSPECTIVES) {
    for (const id of new Set(read(f).match(ID_ANYWHERE) ?? [])) {
      if (!ids.has(id)) {
        fail(`${f}: mentions ${id}, which has no registry row`);
        continue;
      }
      if (!seen.has(id)) seen.set(id, []);
      seen.get(id).push(f);
    }
  }
  const { byId } = loadRegistry();
  for (const id of ids) {
    const where = seen.get(id) ?? [];
    if (where.length === 0) {
      fail(`${id}: narrated in no perspective chapter`);
      continue;
    }
    // A single-actor action has exactly one home chapter. A cross-role action —
    // the shared scanner, manual entry, traveller search — legitimately belongs
    // to each party that performs it.
    //
    // This checks *which* chapters, not how many. Counting was the earlier rule
    // and it was too weak by exactly the interesting amount: a Merchant-only row
    // narrated in traveller.md and nowhere else scored one chapter against a cap
    // of one and passed. PARTY_CHAPTER already holds the map, so naming the
    // chapters costs nothing over counting them.
    const actor = byId.get(id)?.actor ?? "";
    const allowed = ACTOR_CHAPTERS(actor);
    if (allowed.size === 0) {
      // An Actor naming no party that has a chapter of its own — "Admin" alone
      // would be one. There is no chapter it belongs to *by name*, so the only
      // rule left is the one every row has: narrated, and in one place.
      if (where.length > 1) {
        fail(
          `${id}: narrated in ${where.length} chapters (${where.join(", ")}) but its Actor ` +
            `"${actor}" names no party with a chapter — narrate it once`
        );
      }
      continue;
    }
    for (const f of where) {
      if (!allowed.has(f)) {
        fail(
          `${id}: narrated in ${f}, but its Actor "${actor}" names only ` +
            `${[...allowed].join(", ")} — narrate it only where the registry says it applies`
        );
      }
    }
  }
};

checks.endpoints = () => {
  const reg = loadRegistry();
  const { head, rows } = table(read("endpoints.md"), "Endpoint");
  if (!head) {
    fail("endpoints.md: no table whose first header cell is `Endpoint`");
    return;
  }
  for (const c of ["Permission", "Must not call", "Instead use", "Actions"]) {
    if (!head.includes(c)) fail(`endpoints.md: table has no \`${c}\` column`);
  }
  const iPerm = head.indexOf("Permission");
  const iMustNot = head.indexOf("Must not call");
  const iInstead = head.indexOf("Instead use");
  const iActions = head.indexOf("Actions");

  const documented = new Set();
  const covered = new Set();

  for (const cells of rows) {
    const ep = cells[0];
    const actions = iActions >= 0 ? (cells[iActions] ?? "") : "";
    if (iPerm >= 0 && !(cells[iPerm] ?? "")) fail(`endpoints.md: "${ep}" has an empty Permission cell`);
    if (!actions) {
      fail(`endpoints.md: "${ep}" has an empty Actions cell — action ids or "${CONTRAST}"`);
      continue;
    }
    const mustNot = iMustNot >= 0 ? (cells[iMustNot] ?? "") : "";
    const instead = iInstead >= 0 ? (cells[iInstead] ?? "") : "";
    if (mustNot && mustNot !== "—" && !instead) {
      fail(`endpoints.md: "${ep}" forbids a caller but names no "Instead use"`);
    }
    if (actions === CONTRAST) continue;

    documented.add(ep);
    for (const id of actions.match(ID_ANYWHERE) ?? []) {
      if (!reg.ids.has(id)) fail(`endpoints.md: "${ep}" lists ${id}, which has no registry row`);
      covered.add(id);
    }
  }

  for (const ep of reg.endpoints) {
    if (!documented.has(ep)) fail(`endpoints.md: no row for registry endpoint "${ep}"`);
  }
  for (const ep of documented) {
    if (!reg.endpoints.has(ep)) {
      fail(`endpoints.md: "${ep}" claims actions but no registry row reaches it — mark "${CONTRAST}" or add the action`);
    }
  }
  for (const [id, row] of reg.byId) {
    if (row.endpoint === CLIENT_ONLY) {
      if (covered.has(id)) fail(`${id} is "${CLIENT_ONLY}" but appears in endpoints.md`);
    } else if (!covered.has(id)) {
      fail(`${id}: calls "${row.endpoint}" but no endpoints.md row lists it`);
    }
  }
};

/**
 * The central promise the guide makes about itself: endpoints.md's `Endpoint` and
 * `Permission` cells are **copied** from the registry, "so the two cannot
 * disagree" (endpoints.md § intro, README § The nine files). Membership joins do
 * not check that. An action listed under the wrong endpoint row still appears in
 * `covered`, and both endpoints still appear in `documented`, so the swap that
 * matters most in this file — `CreateByStickerLine` for `Create` on the
 * by-sticker-line row — was invisible.
 */
checks.endpointPerms = () => {
  const reg = loadRegistry();
  const { head, rows } = table(read("endpoints.md"), "Endpoint");
  if (!head) return; // checks.endpoints already reports the missing table
  const iPerm = head.indexOf("Permission");
  const iActions = head.indexOf("Actions");
  if (iPerm < 0 || iActions < 0) return;

  for (const cells of rows) {
    const ep = cells[0];
    const actions = cells[iActions] ?? "";
    if (actions === CONTRAST) continue;
    const perm = cells[iPerm] ?? "";
    for (const id of actions.match(ID_ANYWHERE) ?? []) {
      const row = reg.byId.get(id);
      if (!row) continue; // checks.endpoints already reports an unknown id
      if (row.endpoint !== ep) {
        fail(
          `endpoints.md: "${ep}" lists ${id}, whose registry Endpoint is "${row.endpoint}" ` +
            `— an action may only be listed under the endpoint it calls`
        );
      }
      if (row.perm !== perm) {
        fail(
          `endpoints.md: "${ep}" says Permission "${perm}" but ${id}'s registry cell is ` +
            `"${row.perm}" — this column is copied from the registry, not restated`
        );
      }
    }
  }
};

checks.permissions = () => {
  const { ids } = loadRegistry();
  const found = new Set(read("permissions-by-role.md").match(ID_ANYWHERE) ?? []);
  for (const id of ids) if (!found.has(id)) fail(`${id}: missing from permissions-by-role.md`);
  for (const id of found) if (!ids.has(id)) fail(`permissions-by-role.md: mentions ${id}, no registry row`);
};

/**
 * Same promise, other derived file: permissions-by-role.md states that its
 * `Permission` and `Endpoint` cells "are copied verbatim from the registry's
 * `Permission` and `Endpoint` columns". checks.permissions only proved the *ids*
 * were all present, so a wrong permission string beside a right id printed OK.
 *
 * Like endpoints.md, this file must keep every role table leading with
 * `Permission` and must not lead any other table with it, or the rows merge into
 * this join and are read as permission claims.
 */
checks.rolePerms = () => {
  const reg = loadRegistry();
  const { head, rows } = table(read("permissions-by-role.md"), "Permission");
  if (!head) {
    fail("permissions-by-role.md: no table whose first header cell is `Permission`");
    return;
  }
  const iEnd = head.indexOf("Endpoints");
  const iActions = head.indexOf("Actions");
  for (const [name, i] of [["Actions", iActions], ["Endpoints", iEnd]]) {
    if (i < 0) {
      fail(`permissions-by-role.md: table has no \`${name}\` column`);
      return;
    }
  }

  for (const cells of rows) {
    const perm = cells[0] ?? "";
    const endpoints = cells[iEnd] ?? "";
    for (const id of (cells[iActions] ?? "").match(ID_ANYWHERE) ?? []) {
      const row = reg.byId.get(id);
      if (!row) continue; // checks.permissions already reports an unknown id
      if (row.perm !== perm) {
        fail(
          `permissions-by-role.md: ${id} filed under Permission "${perm}" but its registry ` +
            `cell is "${row.perm}" — this column is copied verbatim from the registry`
        );
      }
      // A `— client only` row has no endpoint to name, and this file spells that
      // out in prose rather than with the registry's bare marker.
      if (row.endpoint === CLIENT_ONLY) {
        if (!endpoints.startsWith(CLIENT_ONLY)) {
          fail(
            `permissions-by-role.md: ${id} is "${CLIENT_ONLY}" in the registry but its row's ` +
              `Endpoints cell reads "${endpoints}"`
          );
        }
      } else if (row.endpoint !== endpoints) {
        fail(
          `permissions-by-role.md: ${id} filed under Endpoint "${endpoints}" but its registry ` +
            `cell is "${row.endpoint}"`
        );
      }
    }
  }
};

checks.testflows = () => {
  const { ids } = loadRegistry();
  const md = read("test-flows.md");
  const flows = new Set(
    // Two digits here was a bug, missed when ID_RE and ID_ANYWHERE were widened
    // to A\d{2,3}: `TF-A100` matched neither the heading pattern (\d{2} then \b
    // fails between the two zeros) nor the extraction (which would have yielded
    // "A10"). It surfaced only once flows past A99 existed — A100, A101, A102.
    (md.match(/^#{2,4}\s+TF-A\d{2,3}\b/gm) ?? []).map((h) => h.match(/A\d{2,3}/)[0])
  );
  for (const id of ids) if (!flows.has(id)) fail(`${id}: no "TF-${id}" heading in test-flows.md`);
  for (const id of flows) if (!ids.has(id)) fail(`test-flows.md: TF-${id} has no registry row`);
};

/**
 * A `TF-` heading existing is not a flow. This file's own preamble promises that
 * "every gate a flow depends on carries an `EXPECT` so a tester can tell a pass
 * from a fail without guessing", and every flow as written carries a
 * `**Negative cases**` section. checks.testflows counted headings only, so a flow
 * reduced to a single unverifiable step still printed OK — which is the shape a
 * flow decays into when it is trimmed rather than rewritten.
 */
const NEGATIVE = "**Negative cases**";
checks.flowRigour = () => {
  const lines = read("test-flows.md").split(/\r?\n/);
  let id = null;
  let body = [];
  const finish = () => {
    if (!id) return;
    const text = body.join("\n");
    if (!/\bEXPECT\b/.test(text)) {
      fail(`test-flows.md: TF-${id} has no EXPECT — a step with no observable outcome is not a test`);
    }
    const at = body.findIndex((l) => l.trim().startsWith(NEGATIVE));
    if (at < 0) {
      fail(`test-flows.md: TF-${id} has no "${NEGATIVE}" section`);
    } else if (!body.slice(at + 1).some((l) => /^\s*-\s+\S/.test(l))) {
      fail(`test-flows.md: TF-${id}'s "${NEGATIVE}" section has no cases in it`);
    }
    id = null;
    body = [];
  };
  for (const line of lines) {
    const h = /^#{2,4}\s+TF-(A\d{2,3})\b/.exec(line);
    if (h) {
      finish();
      id = h[1];
      continue;
    }
    if (id && /^#{1,6}\s/.test(line)) finish();
    else if (id) body.push(line);
  }
  finish();
};

function report() {
  if (!failures.length) return;
  console.error(`${failures.length} failure(s):`);
  for (const f of failures) console.error(`  - ${f}`);
}

const requested = process.argv.slice(2);
const names = requested.length ? requested : Object.keys(checks);
for (const n of names) {
  if (!checks[n]) {
    console.error(`unknown check: ${n}`);
    console.error(`known: ${Object.keys(checks).join(", ")}`);
    process.exit(2);
  }
}

checks.files();
if (failures.length) {
  report();
  process.exit(1);
}
for (const n of names) if (n !== "files") checks[n]();
report();
if (!failures.length) console.log(`OK — ${names.join(", ")}`);
process.exit(failures.length ? 1 : 0);

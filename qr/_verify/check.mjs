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
const ACTOR_COUNT = (cell) => {
  if (/^anyone$/i.test(cell.trim())) return PERSPECTIVES.length;
  const named = cell
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => PARTY_CHAPTER.has(s));
  return named.length;
};
const ID_RE = /^A\d{2}$/;
const ID_ANYWHERE = /\bA\d{2}\b/g;

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

checks.stamps = () => {
  for (const f of GUIDE) {
    if (!read(f).includes("Verified against:")) {
      fail(`${f}: no "Verified against:" line`);
    }
  }
};

checks.placeholders = () => {
  // "<sha>" and "<title>" catch a Task 1 stub whose template was never filled in.
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
      fail(`actions-and-routes.md: bad action id "${id}" (want A## )`);
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
    // to each party that performs it, capped at how many the registry names.
    const parties = ACTOR_COUNT(byId.get(id)?.actor ?? "") || 1;
    if (where.length > parties) {
      fail(
        `${id}: narrated in ${where.length} chapters (${where.join(", ")}) but its Actor names ${parties} ` +
          `— narrate it only where the registry says it applies`
      );
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

checks.permissions = () => {
  const { ids } = loadRegistry();
  const found = new Set(read("permissions-by-role.md").match(ID_ANYWHERE) ?? []);
  for (const id of ids) if (!found.has(id)) fail(`${id}: missing from permissions-by-role.md`);
  for (const id of found) if (!ids.has(id)) fail(`permissions-by-role.md: mentions ${id}, no registry row`);
};

checks.testflows = () => {
  const { ids } = loadRegistry();
  const md = read("test-flows.md");
  const flows = new Set(
    (md.match(/^#{2,4}\s+TF-A\d{2}\b/gm) ?? []).map((h) => h.match(/A\d{2}/)[0])
  );
  for (const id of ids) if (!flows.has(id)) fail(`${id}: no "TF-${id}" heading in test-flows.md`);
  for (const id of flows) if (!ids.has(id)) fail(`test-flows.md: TF-${id} has no registry row`);
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

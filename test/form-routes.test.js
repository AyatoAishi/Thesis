// ============================================================================
// test/form-routes.test.js — does every form post to a route that exists?
//
//   node test/form-routes.test.js
//
// The CSRF bug corrupted 27 action attributes and nothing noticed, because
// nothing had ever compared what the pages POST to against what the server
// actually answers. A form aimed at a URL with no handler fails silently: the
// person clicks, gets a 404, and reports it as "the button does nothing".
//
// So this reads every action="..." out of the templates, turns the EJS
// expressions back into route parameters, and checks each one against the
// router table. It is static, so it covers pages a request-based test would
// need fixtures to reach.
// ============================================================================
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
let pass = 0;
const failures = [];
const notes = [];

// ---- what the server answers -----------------------------------------------
const routeFiles = fs.readdirSync(path.join(ROOT, "routes"))
  .filter((f) => f.endsWith(".js"))
  .map((f) => path.join(ROOT, "routes", f));
routeFiles.push(path.join(ROOT, "server.js"));

const postRoutes = [];
for (const file of routeFiles) {
  const src = fs.readFileSync(file, "utf8");
  for (const m of src.matchAll(/router\.(post|all)\(\s*["'`]([^"'`]+)["'`]/g)) postRoutes.push(m[2]);
  for (const m of src.matchAll(/app\.(post|all)\(\s*["'`]([^"'`]+)["'`]/g)) postRoutes.push(m[2]);
}

// ---- what the pages aim at --------------------------------------------------
function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".ejs")) out.push(p);
  }
  return out;
}

// Find the real end of an opening tag, stepping over <% ... %>.
function tagEnd(s, from) {
  let i = from;
  while (i < s.length) {
    if (s.startsWith("<%", i)) {
      const j = s.indexOf("%>", i);
      if (j === -1) return -1;
      i = j + 2; continue;
    }
    if (s[i] === ">") return i;
    i++;
  }
  return -1;
}

// action="/patients/<%= p.patient_id %>/delete"  ->  /patients/:x/delete
function toPattern(action) {
  return action
    .replace(/<%[-=]?[\s\S]*?%>/g, ":x")
    .replace(/\?.*$/, "")
    .replace(/\/+$/, "");
}

// Does a concrete pattern match a declared route?
function matches(pattern, route) {
  const a = pattern.split("/").filter(Boolean);
  const b = route.split("/").filter(Boolean);
  if (a.length !== b.length) return false;
  return a.every((seg, i) => b[i].startsWith(":") || seg === ":x" || seg === b[i]);
}

const VIEWS = path.join(ROOT, "views");
let forms = 0;

for (const file of walk(VIEWS)) {
  const rel = path.relative(VIEWS, file).replace(/\\/g, "/");
  const src = fs.readFileSync(file, "utf8");

  for (const m of src.matchAll(/<form\b/gi)) {
    const end = tagEnd(src, m.index + 5);
    if (end === -1) continue;
    const tag = src.slice(m.index, end + 1);
    if (!/method\s*=\s*["']post["']/i.test(tag)) continue;
    forms++;
    const line = src.slice(0, m.index).split("\n").length;

    const am = /action\s*=\s*"([^"]*)"/.exec(tag);
    if (!am) {
      // No action posts back to the current URL. Legal, but worth naming.
      notes.push(`  ${rel}:${line} — no action (posts to the page's own URL)`);
      pass++;
      continue;
    }

    const raw = am[1];
    // An action built entirely from a variable is decided by the route, not
    // the template, so there is nothing here to check against.
    if (/^<%[-=]?\s*[a-zA-Z_$][\w.$]*\s*%>$/.test(raw.trim())) {
      notes.push(`  ${rel}:${line} — action is a variable (${raw.trim()}), set by the route`);
      pass++;
      continue;
    }

    const pattern = toPattern(raw);
    if (!pattern.startsWith("/")) {
      failures.push(`  ${rel}:${line} — action is not an absolute path: ${raw}`);
      continue;
    }
    if (/[<>]/.test(pattern)) {
      failures.push(`  ${rel}:${line} — action still contains markup: ${raw.slice(0, 70)}`);
      continue;
    }
    if (postRoutes.some((r) => matches(pattern, r))) {
      pass++;
    } else {
      failures.push(`  ${rel}:${line} — posts to ${pattern}, which no route answers`);
    }
  }
}

if (forms < 35) failures.push(`  only found ${forms} POST forms — expected 35+, has the scan broken?`);

console.log(`\n  ${postRoutes.length} POST routes, ${forms} POST forms, ${pass} resolved, ${failures.length} problem(s)\n`);
if (notes.length) {
  console.log("  not checkable from the template alone:");
  console.log(notes.join("\n") + "\n");
}
if (failures.length) {
  console.log(failures.join("\n") + "\n");
  process.exit(1);
}
console.log("  Every form posts somewhere the server actually answers.\n");

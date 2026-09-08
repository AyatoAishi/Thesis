// ============================================================================
// test/ejs-tags.test.js — is any template emitting markup from inside a tag?
//
//   node test/ejs-tags.test.js
//
// The CSRF failure was one instance of a general fault, and this checks for the
// general one. If a template emits markup while the parser is still INSIDE an
// opening tag, the browser ends that tag at the emitted markup's own ">", and
// the rest of the real tag spills onto the page as visible text:
//
//   <form action="/patients/42<input type="hidden" name="_csrf" ...>/delete">
//                             |                                  |
//                             emitted here          browser ends the tag here
//
// It happened because a script looked for the end of each opening tag with a
// regex ending in [^>]*?>. EJS closes its own tags with %>, so the first ">"
// it met was the one inside <%= patient_id %>. The same mistake broke the rail
// markup three days later. Both times the cause was reading an EJS template as
// if the first ">" ends the tag, so this file walks the templates the way a
// browser would and steps over <% ... %> blocks properly.
//
// Checked against the tree as it stood at ba2c91a: 28 findings, every one of
// them a form that had swallowed its token. A crawl of the running app on that
// same tree showed leaked markup on 12 of 40 pages.
//
// WHAT IS ALLOWED. <%= %> escapes its output, so it cannot introduce a tag and
// is always safe inside one. <%- %> does not, and is flagged — except for the
// two entries below, which emit a bare attribute from a fixed string in the
// template itself, never from data.
// ============================================================================
const fs = require("fs");
const path = require("path");

const VIEWS = path.join(__dirname, "..", "views");

// file:line is deliberately NOT used as the key — line numbers move. Each entry
// names what the expression may emit, and the test re-checks that claim.
const ALLOWED = [
  { file: "layout.ejs", expr: "animAttr", emits: [' data-anim="off"', ""] },
  { file: "account.ejs", expr: 'prefs.preset === "custom"', emits: [" hidden", ""] },
];

let pass = 0;
const failures = [];

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".ejs")) out.push(p);
  }
  return out;
}

// Scan a template the way a browser reads it: track whether we are inside a
// tag, and whether we are inside a quoted attribute value.
function findEmissionsInTags(src) {
  const found = [];
  let i = 0, inTag = false, quote = null, tagStart = 0;

  while (i < src.length) {
    if (src.startsWith("<%", i)) {
      const j = src.indexOf("%>", i);
      if (j === -1) {
        found.push({ at: i, kind: "an EJS block that is never closed", tagStart });
        break;
      }
      const block = src.slice(i, j + 2);
      if (inTag) {
        if (block.includes("include(")) {
          found.push({ at: i, kind: "include() inside a tag", tagStart, block });
        } else if (block.startsWith("<%-")) {
          found.push({ at: i, kind: quote ? "raw <%- inside an attribute value" : "raw <%- inside a tag", tagStart, block });
        }
        // <%= %> is escaped and cannot open a tag — safe here.
      }
      i = j + 2;
      continue;
    }

    const c = src[i];
    if (!inTag) {
      if (c === "<" && i + 1 < src.length && (/[a-zA-Z]/.test(src[i + 1]) || src[i + 1] === "/")) {
        if (src.startsWith("<!--", i)) {
          const k = src.indexOf("-->", i);
          i = k === -1 ? src.length : k + 3;
          continue;
        }
        inTag = true; tagStart = i; quote = null;
      }
    } else if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === ">") {
      inTag = false;
    }
    i++;
  }
  return found;
}

let scanned = 0;
for (const file of walk(VIEWS)) {
  const rel = path.relative(VIEWS, file).replace(/\\/g, "/");
  const src = fs.readFileSync(file, "utf8");
  scanned++;

  for (const f of findEmissionsInTags(src)) {
    const line = src.slice(0, f.at).split("\n").length;
    const allow = ALLOWED.find(
      (a) => rel.endsWith(a.file) && f.block && f.block.includes(a.expr)
    );
    if (allow) {
      // The exemption is only good while the thing it emits stays harmless.
      const risky = allow.emits.some((e) => /[<>]/.test(e));
      if (risky) {
        failures.push(`  ${rel}:${line} — allow-listed, but it emits markup: ${JSON.stringify(allow.emits)}`);
      } else {
        pass++;
      }
      continue;
    }
    failures.push(
      `  ${rel}:${line} — ${f.kind}\n      ${src.slice(f.tagStart, f.tagStart + 110).replace(/\s+/g, " ")}`
    );
  }
}

console.log(`\n  ${scanned} templates scanned, ${pass} allow-listed, ${failures.length} problem(s)\n`);
if (failures.length) {
  console.log(failures.join("\n"));
  console.log("\n  A template must not emit markup from inside a tag. Move it after the tag's \">\".\n");
  process.exit(1);
}
console.log("  No template emits markup from inside a tag.\n");

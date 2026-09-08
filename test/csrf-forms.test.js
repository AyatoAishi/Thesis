// ============================================================================
// test/csrf-forms.test.js — is the token actually INSIDE every form?
//
//   node test/csrf-forms.test.js
//
// This exists because of a bug that shipped and sat in production for three
// days. The script that planted the token in all 41 forms found the end of
// each opening tag with a regex ending in [^>]*?> — and EJS closes its own
// tags with %>, so the first ">" it met was usually the one inside
// <%= patient_id %>. The include went in there, inside the action attribute:
//
//   <form action="/patients/42<input type="hidden" name="_csrf" ...>/delete">
//
// The browser ends the form tag at the input's own ">", so the form had no
// token at all and its action was garbage — and "/delete" data-confirm=..."
// rendered as visible text on the page. 27 forms, 14 files. Core writes:
// delete patient, mark an appointment done, record a dose, verify a portal
// account, edit a medicine.
//
// The security tests written at the time all passed, because every one of them
// built its POST by hand and never submitted a rendered form. They proved the
// middleware worked. Nobody proved the pages carried what the middleware
// needed. That is the gap this file closes, and the reason it is static
// analysis rather than a request: it checks every form in the repo, including
// the ones on pages a test would need fixtures to reach.
// ============================================================================
const fs = require("fs");
const path = require("path");

const VIEWS = path.join(__dirname, "..", "views");
let pass = 0;
const failures = [];

// Walk to the ">" that really closes a tag, stepping over <% ... %> blocks.
// This is the whole lesson: an EJS template cannot be scanned as if the first
// ">" ends the tag.
function tagEnd(s, from) {
  let i = from;
  while (i < s.length) {
    if (s.startsWith("<%", i)) {
      const j = s.indexOf("%>", i);
      if (j === -1) return -1;
      i = j + 2;
      continue;
    }
    if (s[i] === ">") return i;
    i++;
  }
  return -1;
}

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".ejs")) out.push(p);
  }
  return out;
}

const files = walk(VIEWS);
let forms = 0;

for (const file of files) {
  const rel = path.relative(VIEWS, file).replace(/\\/g, "/");
  if (rel === "partials/csrf.ejs") continue;
  const s = fs.readFileSync(file, "utf8");

  const re = /<form\b/gi;
  let m;
  while ((m = re.exec(s))) {
    const end = tagEnd(s, m.index + 5);
    if (end === -1) {
      failures.push(`  ${rel}: a <form tag never closes`);
      continue;
    }
    const tag = s.slice(m.index, end + 1);
    const line = s.slice(0, m.index).split("\n").length;

    // Only POSTs need a token; a GET form is a search box.
    if (!/method\s*=\s*["']post["']/i.test(tag)) continue;
    forms++;

    // 1) The include must not be trapped inside the opening tag.
    if (/partials\/csrf/.test(tag)) {
      failures.push(
        `  ${rel}:${line} — the token is INSIDE the <form> tag, so the browser ` +
        `ends the tag at the input's own ">" and the form carries no token\n` +
        `      ${tag.replace(/\s+/g, " ").slice(0, 120)}`
      );
      continue;
    }

    // 2) And it must be somewhere between the tag and its </form>.
    const close = s.toLowerCase().indexOf("</form>", end);
    const body = close === -1 ? s.slice(end) : s.slice(end, close);
    if (!/partials\/csrf/.test(body)) {
      failures.push(`  ${rel}:${line} — POST form with no CSRF token in it`);
      continue;
    }
    pass++;
  }
}

// A sanity floor: if a refactor ever empties this out, the suite should not
// quietly pass with nothing checked.
if (forms < 35) failures.push(`  only found ${forms} POST forms — expected 35+, has the scan broken?`);

console.log(`\n  ${pass}/${forms} POST forms carry the token, ${failures.length} problem(s)\n`);
if (failures.length) {
  console.log(failures.join("\n"));
  process.exit(1);
}
console.log("  Every form that writes carries its token, and none of them swallowed it.\n");

// ============================================================================
// test/i18n.test.js — the translation cannot fail silently.
//
// A missing key does not throw. t("nav.pateints") renders the text
// "nav.pateints" on the screen, in both languages, and nothing anywhere
// complains — the worst kind of bug to find the week of a defense. So:
//
//   1. every t("…") used in any view or route exists in lib/i18n.js
//   2. every entry has BOTH an English and a Tagalog string, neither empty
//   3. both languages carry the same {placeholders} — a Tagalog string that
//      drops {n} would print "appointment ngayon" with no number in it
//   4. t() itself fills placeholders and handles the English plural
//
//   node test/i18n.test.js
// ============================================================================
const fs = require("fs");
const path = require("path");
const i18n = require("../lib/i18n");

const ROOT = path.join(__dirname, "..");
let bad = 0;
const check = (label, ok, extra = "") => {
  if (!ok) bad++;
  if (!ok || process.env.VERBOSE) console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${extra ? "   " + extra : ""}`);
};

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ejs|js)$/.test(f)) out.push(p);
  }
  return out;
}

// ---- 1) every key used exists --------------------------------------------------
const files = [...walk(path.join(ROOT, "views")), ...walk(path.join(ROOT, "routes")), path.join(ROOT, "server.js")];
const used = new Map();
// t("key") or t('key'), not preceded by a letter (so format(…) and alert(…) are not caught)
const re = /(?<![\w.])t\(\s*["']([a-z_]+\.[a-z0-9_]+)["']/g;
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  let m;
  while ((m = re.exec(src))) {
    if (!used.has(m[1])) used.set(m[1], path.relative(ROOT, f));
  }
}
let missing = 0;
for (const [key, where] of used) {
  if (!i18n.D[key]) { missing++; check(`key "${key}" exists`, false, `used in ${where}`); }
}
check(`${used.size} keys used in views and routes all exist`, missing === 0);

// ---- 2) and 3) every entry is complete in both languages -----------------------
const ph = (s) => (s.match(/\{[a-z]+\}/g) || []).filter((p) => p !== "{s}").sort().join(",");
let incomplete = 0;
for (const [key, row] of Object.entries(i18n.D)) {
  if (!Array.isArray(row) || row.length !== 2 || !row[0] || !row[1]) {
    incomplete++; check(`"${key}" has English and Tagalog`, false); continue;
  }
  if (ph(row[0]) !== ph(row[1])) {
    incomplete++; check(`"${key}" has the same placeholders in both`, false, `${ph(row[0])} vs ${ph(row[1])}`);
  }
}
check(`${Object.keys(i18n.D).length} entries complete in both languages`, incomplete === 0);

// ---- 4) t() itself -------------------------------------------------------------
check("English plural, one", i18n.t("en", "top.appts_today", { n: 1 }) === "1 appointment today");
check("English plural, many", i18n.t("en", "top.appts_today", { n: 3 }) === "3 appointments today");
check("Tagalog does not inflect", i18n.t("tl", "top.appts_today", { n: 3 }) === "3 appointment ngayon");
check("a name is filled in", i18n.t("en", "por.hello", { name: "Maria" }).startsWith("Hello, Maria"));
check("typed text is put in exactly as typed", i18n.t("en", "pat.matching", { q: "{s} {n} {q}" }) === "matching “{s} {n} {q}”");
check("several values in one sentence", i18n.t("en", "dash.q1", { a: "X", b: "Y" }) === "X, then Y.");
check("an unknown key falls back to the key, not a crash", i18n.t("en", "no.such_key") === "no.such_key");
check("default for staff is English", i18n.pick({ session: { user: { preferences: {} } } }) === "en");
check("default for a patient is Tagalog", i18n.pick({ session: { patient: { patient_id: 1 } } }) === "tl");
check("a saved choice wins", i18n.pick({ session: { lang: "tl", user: {} } }) === "tl");
check("a rubbish choice is ignored", i18n.pick({ session: { lang: "fr" } }) === "en");

console.log(bad ? `\n  ${bad} check(s) failed.` : `\n  ${used.size} keys in use, ${Object.keys(i18n.D).length} in the dictionary — every one complete in English and Tagalog.`);
process.exit(bad ? 1 : 0);

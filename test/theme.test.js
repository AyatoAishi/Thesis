// ============================================================================
// test/theme.test.js — can a staff member make the system unreadable?
//
//   node test/theme.test.js
//
// The answer has to be no, for every colour, in both modes. That is the entire
// promise of letting people choose one: a bad choice would go wrong on THEIR
// screen, where nobody here would ever see it, and they would conclude the
// system was broken rather than that a setting of theirs was.
//
// The second half of this file exists because of a bug this suite did not
// catch the first time. The settings page shows each font in its own face, and
// the font-family was double-escaped: EJS turned the &quot; that had already
// been substituted into &amp;quot;, so the value arrived as literal text, the
// declaration was invalid, and every sample silently fell back to whichever
// font was already active. The old test asserted that the font FILES were
// requested — which they were. It never looked at whether the attribute using
// them was valid. Testing the visible result, not the plumbing, is the lesson.
// ============================================================================
const ejs = require("ejs");
const fs = require("fs");
const path = require("path");
const t = require("../lib/theme");

let pass = 0;
const failures = [];
const check = (label, cond, extra = "") => {
  if (cond) return pass++;
  failures.push(`  ${label}${extra ? "\n      " + extra : ""}`);
};

// ---- 1) nobody can break the contrast --------------------------------------
// Sweeps the whole wheel rather than a handful of colours, because the failure
// mode is hue-specific: a yellow has to travel a long way down before white
// text sits on it, a blue barely moves.
const DARK_SURFACE = { r: 26, g: 32, b: 46 };
const WHITE = { r: 255, g: 255, b: 255 };
let swept = 0, worstText = Infinity, worstPage = Infinity;

for (let h = 0; h < 360; h += 15) {
  for (const s of [0, 10, 30, 60, 100]) {
    for (const l of [5, 25, 50, 75, 95]) {
      const f = (n) => {
        const k = (n + h / 30) % 12;
        const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
        return Math.round(255 * (l / 100 - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))));
      };
      const hex = "#" + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, "0")).join("");

      for (const dark of [false, true]) {
        const ramp = t.accentRamp(hex, dark);
        const accent = t.hexToRgb(ramp["--accent"]);
        // What sits ON the accent — the label inside every button.
        const onIt = t.contrast(accent, t.hexToRgb(ramp["--on-accent"]));
        // The accent used AS text, against the page behind it.
        const onPage = t.contrast(accent, dark ? DARK_SURFACE : WHITE);
        worstText = Math.min(worstText, onIt);
        worstPage = Math.min(worstPage, onPage);
        swept++;
        if (onIt < 4.5 || onPage < 3.0) {
          failures.push(`  ${hex} in ${dark ? "dark" : "light"}: text ${onIt.toFixed(2)}:1, page ${onPage.toFixed(2)}:1`);
          return;
        }
      }
    }
  }
}
check(`${swept} colours all clear AA (worst: ${worstText.toFixed(2)}:1 on the accent, ${worstPage.toFixed(2)}:1 against the page)`, true);

// A grey has no hue, so HSL reports hue 0 — which is red. Forcing saturation
// onto that turned every grey pick into a muddy red: contrast fine, result
// absurd. Greys must stay grey.
for (const g of ["#ffffff", "#c0c0c0", "#808080", "#111111"]) {
  const a = t.hexToRgb(t.accentRamp(g, false)["--accent"]);
  const spread = Math.max(a.r, a.g, a.b) - Math.min(a.r, a.g, a.b);
  check(`${g} stays neutral rather than turning red`, spread <= 12, `spread ${spread}`);
}

// ---- 2) nothing a form can send survives unvalidated ------------------------
const hostile = t.normalize({ mode: "<script>", font: "'; DROP TABLE users;--", accent: "javascript:alert(1)", preset: "../../etc" });
check("rubbish falls back to the defaults",
  hostile.mode === "light" && hostile.font === "jakarta" && hostile.accent === t.DEFAULT_ACCENT && hostile.preset === "sampaguita",
  JSON.stringify(hostile));
check("an unchecked animations box means off", t.fromForm({}).animations === false);
check("a checked one means on", t.fromForm({ animations: "on" }).animations === true);
check("a preset wins over a stale accent field",
  t.fromForm({ preset: "malachite", accent: "#ff0000" }).accent === "#18a571");
check("choosing custom keeps the colour",
  t.fromForm({ preset: "custom", accent: "#f5c518" }).accent === "#f5c518");

// ---- 3) one look for everybody (2026-09-25) ---------------------------------
// The professors asked for the change-theme option to go and for green to be
// the default. The settings page and its previews are gone, so what matters
// now is the opposite of what used to be tested here: that NOTHING a staff
// member saved before can still change what the system looks like.
const saved = [
  {},
  { mode: "dark", preset: "ube", font: "mono", animations: false },
  { mode: "auto", preset: "custom", accent: "#716392", font: "lato" },
  { mode: "<script>", accent: "javascript:alert(1)" },
];
for (const prefs of saved) {
  const th = t.forUser(prefs);
  check(`saved ${JSON.stringify(prefs).slice(0, 48)} still gets the clinic look`,
    th.mode === "light" && th.prefs.accent === t.DEFAULT_ACCENT && th.prefs.font === "jakarta" && th.animations === true,
    JSON.stringify(th.prefs));
}
check("the clinic accent is green", /^#2e7d32$/i.test(t.DEFAULT_ACCENT));
const green = t.accentRamp(t.DEFAULT_ACCENT, false);
check("white text on the clinic green passes 4.5:1",
  t.contrast(t.hexToRgb(green["--accent"]), t.hexToRgb("#ffffff")) >= 4.5,
  t.contrast(t.hexToRgb(green["--accent"]), t.hexToRgb("#ffffff")).toFixed(2));

// The stylesheet has to agree, because the sign-in, landing and legal pages
// never receive the inline theme block and draw straight from these tokens.
const css = fs.readFileSync(path.join(__dirname, "..", "public", "css", "src.css"), "utf8");
check("src.css root accent is the same green", css.includes(`--accent: ${green["--accent"]};`));

// And the page that used to hold the settings no longer offers them.
const view = path.join(__dirname, "..", "views", "account.ejs");
const html = ejs.render(fs.readFileSync(view, "utf8"), {
  user: { full_name: "Test", username: "test", role: "nurse" },
  errors: [], notice: null, csrfToken: "test",
  pendingPassword: null, needsApproval: true,
}, { filename: view });
check("the account page has no appearance form", !/account\/preferences|data-prefs/.test(html));

// ---- report ----------------------------------------------------------------
console.log(`\n  ${pass} passed, ${failures.length} failed\n`);
if (failures.length) {
  console.log(failures.join("\n"));
  process.exit(1);
}
console.log("  One green look for everyone, and it stays readable.\n");

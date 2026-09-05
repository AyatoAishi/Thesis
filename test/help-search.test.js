// ============================================================================
// test/help-search.test.js — does Ate Sam actually find the right answer?
//
//   node test/help-search.test.js
//
// No database, no server, no network — this is a pure function over a fixed
// list, which is the whole reason we can test it at all. Every phrasing below
// is one somebody would really type: clipped, unpunctuated, half-English, and
// occasionally still mid-word.
//
// The negative cases matter as much as the positive ones. A helper that always
// finds something is not a helper — it is a confident liar, and that is the
// exact failure we chose this design to avoid.
// ============================================================================
const s = require("../lib/help/search");

let pass = 0;
const failures = [];

function hits(query, wantId, role = "admin") {
  const r = s.search(query, role, 3);
  const top = r[0] && r[0].entry.id;
  if (top === wantId) return pass++;
  failures.push(`  "${query}"\n      got ${top || "(nothing)"}, wanted ${wantId}`);
}

function findsNothing(query, role = "admin") {
  const r = s.search(query, role, 3);
  if (!r.length) return pass++;
  failures.push(`  "${query}"\n      answered "${r[0].entry.id}" (${r[0].score.toFixed(2)}) — should have said it doesn't know`);
}

function hidden(query, wantMissingId, role) {
  const r = s.search(query, role, 5);
  if (!r.some((x) => x.entry.id === wantMissingId)) return pass++;
  failures.push(`  "${query}" as ${role}\n      showed ${wantMissingId}, which that role cannot open`);
}

// ---- Tagalog, as actually typed --------------------------------------------
hits("pano mag add ng pasyente", "add-patient");
hits("paano magdagdag ng bagong pasyente", "add-patient");
hits("paano maghanap ng pasyente", "find-patient");
hits("pano mag edit ng pasyente", "edit-patient");
hits("asan yung immunization", "immunization-card");
hits("saan ang immunization card", "immunization-card");
hits("pano mag record ng turok", "record-dose");
hits("naturukan na ba si baby", "record-dose");
hits("pano mag book ng appointment", "book-appointment");
hits("sino darating ngayon", "todays-list");
hits("pano markahan na dumating", "mark-done");
hits("asan ang buntis", "prenatal");
hits("prenatal follow up visit", "prenatal-visit");
hits("saan ang family planning", "family-planning");
hits("pano mag dagdag ng gamot", "add-medicine");
hits("pano mag dispense ng gamot", "dispense");
hits("gamot paubos", "low-stock");
hits("ilan bago mag low stock", "low-stock");
hits("sinong overdue", "overdue-patient");
hits("magkapamilya sila", "household");
hits("anong sakit uso ngayon", "seasonal-trend");
hits("pano mag itala ng konsulta", "consultation");
hits("pano mag print", "export-pdf");
hits("sino gumawa nito", "audit-log");
hits("bagong staff account", "add-staff");
hits("ano ang role ng nurse", "roles");
hits("kailan pinapadala ang paalala", "reminders");
hits("saan ang reports", "reports");
hits("bakit may appointment na hindi ko ginawa", "auto-immunization-appt");
hits("paano gumawa ng account ng pasyente", "portal-account");
hits("hindi tumatanggap ng email ang pasyente", "reminder-channel");

// ---- English ---------------------------------------------------------------
hits("how to add a patient", "add-patient");
hits("where is the immunization card", "immunization-card");
hits("how do i book an appointment", "book-appointment");
hits("dispense medicine to a patient", "dispense");
hits("who is overdue", "overdue-patient");
hits("change my password", "my-password");
hits("seasonal illness trend", "seasonal-trend");

// ---- Whose account is it? --------------------------------------------------
// "ko" and "ng" are grammar and get stripped, so these two arrive at the index
// as the same words. Only the presence of "pasyente" separates them.
hits("nakalimutan ko password ko", "my-password");
hits("nakalimutan ng pasyente ang password", "patient-forgot-password");
hits("hindi ako makapasok", "locked-out");
hits("bakit ako bigla nalabas", "signed-out");

// ---- Still typing ----------------------------------------------------------
// Suggestions have to appear before the word is finished, or nobody waits.
hits("pasy", "add-patient");
hits("immuniz", "immunization-card");
hits("bakun", "immunization-card");

// ---- Things it must NOT answer ---------------------------------------------
// Medical questions especially: this thing knows where the buttons are. It
// knows nothing about medicine, and pretending otherwise could hurt somebody.
findsNothing("anong gamot sa ubo ng bata");
findsNothing("magkano ang bayad sa check up");
findsNothing("kamusta ka");
findsNothing("sino ang presidente ng pilipinas");
findsNothing("ilang beses dapat uminom ng paracetamol");

// ---- Role filtering --------------------------------------------------------
// A facilitator asking about reports must not be told to open a page that will
// refuse them. Being handed steps that end in "Access denied" is worse than
// being told we have nothing.
hidden("saan ang reports", "reports", "facilitator");
hidden("sino gumawa nito", "audit-log", "nurse");
hidden("bagong staff account", "add-staff", "recorder");
hidden("pano mag itala ng konsulta", "consultation", "facilitator");

// ---- The safety net --------------------------------------------------------
// Even with no confident match, we owe them something better than a shrug.
{
  const near = s.nearest("paano ba ito", "admin", 3);
  if (near.length) pass++;
  else failures.push('  nearest("paano ba ito") returned nothing — the no-match screen would be empty');
}

// ---- Report ----------------------------------------------------------------
console.log(`\n  ${pass} passed, ${failures.length} failed\n`);
if (failures.length) {
  console.log(failures.join("\n"));
  process.exit(1);
}
console.log("  Ate Sam answers what she knows and admits what she doesn't.\n");

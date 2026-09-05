// ============================================================================
// lib/help/search.js — matching a typed question to an entry, with no API.
//
// The whole trick is that this is a CLOSED vocabulary. There are ~30 entries
// and we wrote every word in them, so we do not need a language model to guess
// at meaning — we need to survive the ways a real person types. Which are:
//
//   "pano mag add ng pasyente"     no accents, clipped "paano", English verb
//   "asan yung immunization"       "asan" for "saan", "yung" as filler
//   "how to add patient"          straight English
//   "gamot paubos"                 two nouns, no verb, no question word
//   "pasy"                         still typing
//
// So: normalise hard, fold the spelling variants onto one form, then score by
// weighted token overlap with IDF. IDF is what stops "paano" — which appears in
// half the entries and therefore means almost nothing — from outranking
// "pentavalent", which appears in one and means everything.
//
// Deterministic, instant, free, and it cannot invent an answer that is not in
// entries.js. That last property is the entire reason we are not calling an AI.
// ============================================================================

const { ENTRIES } = require("./entries");

// Words that carry no signal in either language. Note that "paano" and "saan"
// are deliberately NOT here: they are weak, not worthless, and IDF already
// prices them correctly. Dropping them outright would make "saan ang gamot"
// and "paano ang gamot" identical questions, which they are not.
const STOP = new Set([
  "ng", "nang", "sa", "ang", "mga", "ako", "ko", "mo", "niya", "namin", "natin",
  "na", "ba", "po", "opo", "yung", "ung", "yun", "iyon", "ito", "ay", "at", "o",
  "si", "ni", "kay", "para", "ako", "ka", "siya", "kami", "tayo", "sila", "may",
  "meron", "mayroon", "pala", "lang", "din", "rin", "naman", "kasi", "eh",
  "the", "a", "an", "is", "are", "do", "does", "did", "i", "my", "me", "of",
  "to", "in", "on", "for", "it", "you", "we", "this", "that", "and", "or",
  "can", "should", "would", "there", "here", "be", "was", "with",
  "up", "out", "get", "got", "need", "want", "please", "pls", "lang",
  // Stranded Filipino affixes. People type "mag add" and "pano mag record"
  // as two words, which left "mag" sitting in the query as a real token —
  // and because it matches nothing, it only ever diluted the score of the
  // words that mattered. It is grammar, not vocabulary.
  "mag", "nag", "pag", "maka", "naka", "magka", "ipa", "pina", "makapag",
]);

// One canonical spelling per idea. The left side is what people type; the
// right side is what the index is built on. Everything here was chosen because
// a person would plausibly type it, not because a dictionary lists it.
const VARIANTS = {
  // Question words, clipped the way they are actually typed — and the English
  // ones folded onto the Tagalog. "who is overdue" and "sino ang overdue" are
  // the same question, so they must become the same token; otherwise "who"
  // stays a rare word, scores like a rare word, and drags the answer toward
  // whichever entry happens to spell out "who" in its English phrasing.
  pano: "paano", panu: "paano", paanu: "paano", pnao: "paano", papaano: "paano",
  how: "paano", howto: "paano",
  asan: "saan", nasan: "saan", nasaan: "saan", san: "saan",
  where: "saan", location: "saan", located: "saan",
  anu: "ano", anong: "ano", what: "ano", which: "ano",
  kelan: "kailan", when: "kailan",
  bkit: "bakit", bakt: "bakit", why: "bakit",
  sino: "sino", sinong: "sino", who: "sino", whose: "sino",

  // verbs — every affixed form folds onto the bare root
  magdagdag: "dagdag", nagdagdag: "dagdag", idagdag: "dagdag", dagdagan: "dagdag",
  magadd: "add", iadd: "add", adding: "add", added: "add",
  maghanap: "hanap", hanapin: "hanap", naghanap: "hanap", hinahanap: "hanap",
  searching: "hanap", search: "hanap", find: "hanap", finding: "hanap",
  maglagay: "lagay", ilagay: "lagay", nilagay: "lagay", inilagay: "lagay",
  magtala: "tala", itala: "tala", tinala: "tala", naitala: "tala",
  recording: "record", records: "record", recorded: "record",
  magbigay: "bigay", ibigay: "bigay", binigay: "bigay", nagbigay: "bigay",
  magbook: "book", ibook: "book", booking: "book", booked: "book",
  magpalit: "palit", palitan: "palit", pinalitan: "palit", papalitan: "palit",
  baguhin: "palit", binago: "palit", change: "palit", changing: "palit",
  magbukas: "buksan", bukas: "buksan", binuksan: "buksan", open: "buksan",
  opening: "buksan", makita: "tignan", tingnan: "tignan", tignan: "tignan",
  makikita: "tignan", tingin: "tignan", view: "tignan", see: "tignan",
  magprint: "print", iprint: "print", printing: "print", printed: "print",
  magexport: "export", iexport: "export",
  magdispense: "dispense", idispense: "dispense", dispensing: "dispense",
  magsignin: "login", signin: "login", sign: "login", pumasok: "login",
  makapasok: "login", pasok: "login", logon: "login",
  magsignout: "logout", signout: "logout", lumabas: "logout", nalabas: "logout",
  gawa: "gumawa", gawin: "gumawa", ginawa: "gumawa", create: "gumawa",
  creating: "gumawa", gagawin: "gumawa", magawa: "gumawa",
  markahan: "mark", markahang: "mark", minarkahan: "mark", marking: "mark",

  // nouns
  pasyenteng: "pasyente", pasyente: "pasyente", patients: "pasyente",
  patient: "pasyente", pashyente: "pasyente", pasiyente: "pasyente",
  gamots: "gamot", gamut: "gamot", medisina: "gamot", medicines: "gamot",
  medicine: "gamot", meds: "gamot", medicin: "gamot",
  bakunang: "bakuna", bakunahan: "bakuna", vaccines: "bakuna",
  vaccine: "bakuna", vaccination: "bakuna", immunisation: "immunization",
  turok: "bakuna", iniksyon: "bakuna", injection: "bakuna",
  naturukan: "bakuna", tinurukan: "bakuna", maturukan: "bakuna",
  naturok: "bakuna", tinurok: "bakuna", turukan: "bakuna",
  appointments: "appointment", apoyntment: "appointment", apointment: "appointment",
  iskedyul: "schedule", eskedyul: "schedule", skedyul: "schedule",
  schedules: "schedule", sched: "schedule",
  reports: "report", ulat: "report", reporting: "report",
  accounts: "account", akawnt: "account", akount: "account",
  passwords: "password", pasword: "password", pass: "password",
  buntis: "prenatal", nagbubuntis: "prenatal", pregnant: "prenatal",
  pagbubuntis: "prenatal", preggy: "prenatal",
  bata: "bata", batang: "bata", child: "bata", children: "bata", kid: "bata",
  baby: "bata", sanggol: "bata", infant: "bata",
  matanda: "senior", matatanda: "senior", elderly: "senior", lolo: "senior",
  lola: "senior", seniors: "senior",
  kawani: "staff", empleyado: "staff", employee: "staff", users: "staff",
  user: "staff", tauhan: "staff",
  sakit: "sakit", sakits: "sakit", karamdaman: "sakit", illness: "sakit",
  sickness: "sakit", disease: "sakit", diagnosis: "sakit",
  lagnat: "lagnat", fever: "lagnat", trangkaso: "flu", influenza: "flu",
  paalala: "reminder", reminders: "reminder", alala: "reminder",
  paalalahanan: "reminder", notification: "reminder", notif: "reminder",
  stocks: "stock", istak: "stock", supply: "stock", supplies: "stock",
  imbentaryo: "inventory", inventaryo: "inventory",
  pamilya: "family", kapamilya: "family", pamilyang: "family",
  bahay: "household", sambahayan: "household",

  // states people describe rather than name
  paubos: "low", naubos: "low", ubos: "low", kaunti: "low", konti: "low",
  kulang: "low", kakaunti: "low",
  nakalimutan: "forgot", nalimutan: "forgot", limot: "forgot",
  nakalimot: "forgot", forget: "forgot", forgotten: "forgot",
  mali: "mali", maling: "mali", nagkamali: "mali", wrong: "mali",
  error: "mali", incorrect: "mali", nagkamly: "mali",
  huli: "overdue", nahuli: "overdue", lampas: "overdue", late: "overdue",
  delayed: "overdue", atrasado: "overdue",
  hindi: "hindi", di: "hindi", wala: "wala", walang: "wala",
  naka_lock: "locked", nakalock: "locked", lock: "locked", locked: "locked",
  sarado: "locked", blocked: "locked",
};

// Strip accents, punctuation, and case. "Pre-natal" and "prenatal" must not be
// two different words, and neither must "Paano" and "paano".
function normalize(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Fold one word onto its canonical form.
function canon(w) {
  if (VARIANTS[w]) return VARIANTS[w];
  // Filipino ligature: "bakunang bata" — the -ng is grammar, not the word.
  if (w.length > 4 && w.endsWith("ng") && VARIANTS[w.slice(0, -2)]) {
    return VARIANTS[w.slice(0, -2)];
  }
  // English plural, only where dropping the s still leaves a real-looking word.
  if (w.length > 4 && w.endsWith("s") && !w.endsWith("ss")) {
    const sing = w.slice(0, -1);
    if (VARIANTS[sing]) return VARIANTS[sing];
    return sing;
  }
  return w;
}

function tokens(s) {
  return normalize(s)
    .split(" ")
    .filter((w) => w && w.length > 1 && !STOP.has(w))
    .map(canon)
    .filter((w) => !STOP.has(w));
}

// ---- Index -----------------------------------------------------------------
// Built once at require time. Every entry becomes a map of token -> weight,
// where the weight says WHERE the word appeared. A word in the question itself
// is a stronger signal than the same word buried in a step.
const FIELD_WEIGHT = { q: 3, qEn: 2.5, tags: 2, keys: 1.5, short: 1, steps: 0.5 };

const INDEX = ENTRIES.map((e) => {
  const weights = new Map();
  const add = (text, w) => {
    for (const t of tokens(text)) {
      weights.set(t, Math.max(weights.get(t) || 0, w));
    }
  };
  add(e.q, FIELD_WEIGHT.q);
  add(e.qEn, FIELD_WEIGHT.qEn);
  add((e.tags || []).join(" "), FIELD_WEIGHT.tags);
  add((e.keys || []).join(" "), FIELD_WEIGHT.keys);
  add(e.short, FIELD_WEIGHT.short);
  add((e.steps || []).join(" ").replace(/<[^>]+>/g, " "), FIELD_WEIGHT.steps);
  return { entry: e, weights };
});

// Inverse document frequency. A token in 1 of 30 entries is worth a lot; a
// token in 20 of 30 is worth almost nothing. This is what makes "pentavalent"
// beat "paano" without either being hand-tuned.
const IDF = new Map();
{
  const n = INDEX.length;
  const df = new Map();
  for (const row of INDEX) {
    for (const t of row.weights.keys()) df.set(t, (df.get(t) || 0) + 1);
  }
  for (const [t, d] of df) IDF.set(t, Math.log((n + 1) / (d + 0.5)));
}
const idf = (t) => (IDF.has(t) ? IDF.get(t) : Math.log(INDEX.length + 1));

// ---- Scoring ---------------------------------------------------------------
// A query token can land three ways, worth progressively less:
//   exact      "gamot" is in the entry                     1.0
//   prefix     "pasy" while still typing, entry has        0.65
//              "pasyente"
//   contained  "immun" inside "immunization"               0.4
// Question words tell you the SHAPE of a question, never its subject. They
// still earn score — "saan ang gamot" and "paano ang gamot" are different
// questions and the entry titles reflect that — but they must not count as
// understanding, because they say nothing about what is being asked about.
//
// This was the last hole. "anong gamot sa ubo ng bata" shares "ano" and "ubo"
// with the seasonal trend report, which was two words out of four, enough
// coverage to pass, and so Ate Sam answered a question about medicine with a
// chart. Counting only "gamot", "ubo" and "bata" makes it one in three, and
// she says she doesn't know — which is the truth.
const QUESTION_WORDS = new Set(["paano", "saan", "ano", "kailan", "bakit", "sino", "ilan"]);

function scoreOne(qTokens, row) {
  let got = 0;
  let possible = 0;
  let matched = 0;
  let subject = 0;

  for (const qt of qTokens) {
    const w = idf(qt);
    possible += w;
    const isSubject = !QUESTION_WORDS.has(qt);
    if (isSubject) subject++;

    const exact = row.weights.get(qt);
    if (exact !== undefined) {
      got += w * exact;
      if (isSubject) matched++;
      continue;
    }
    if (qt.length < 3) continue;

    let best = 0;
    for (const [t, fw] of row.weights) {
      if (t.startsWith(qt)) best = Math.max(best, 0.65 * fw);
      // A fragment buried in the MIDDLE of another word is the weakest signal
      // there is, so it has to be long to count. At three characters it was
      // pure noise: "ano" sits inside "panahon", which is how "anong gamot sa
      // ubo ng bata" came to be answered with the seasonal trend report.
      else if (qt.length >= 5 && t.length > qt.length && t.includes(qt)) {
        best = Math.max(best, 0.4 * fw);
      }
    }
    got += w * best;
    if (best > 0 && isSubject) matched++;
  }

  if (!possible) return { score: 0, coverage: 0 };
  // A question made of nothing but question words ("paano ba ito") told us
  // nothing about its subject, so nothing can confidently match it. It still
  // reaches nearest() and gets suggestions — it just never gets an answer
  // presented as the answer.
  if (!subject) return { score: got / (possible * FIELD_WEIGHT.q), coverage: 0 };
  return {
    // Divided by the best a perfect match could have scored, so the number
    // means "how much of what they asked did this entry cover" rather than
    // "how many words are in this entry". Without it the longest entry wins
    // every query, which is what makes a search feel broken.
    score: got / (possible * FIELD_WEIGHT.q),
    // What fraction of their words landed anywhere at all. This is the part
    // that keeps Ate Sam honest, and it was missing at first: "sino ang
    // presidente ng pilipinas" matched only "sino", but "sino" sits in a
    // question title at full weight, so one word out of three scored 0.25 and
    // she confidently answered with the audit log. Score alone cannot tell
    // "mostly understood" from "recognised one word and guessed".
    coverage: matched / subject,
  };
}

// Two bars, and a candidate has to clear both.
//
// MIN_SCORE says the words that matched carried real weight. MIN_COVERAGE says
// most of the question was understood, not one lucky word out of five. Tuned
// against test/help-search.test.js, which asserts in both directions — the
// medical questions in there ("anong gamot sa ubo ng bata") must keep failing
// to match. This thing knows where the buttons are. It knows nothing about
// medicine, and a confident answer there could actually hurt somebody.
const MIN_SCORE = 0.18;
const MIN_COVERAGE = 0.45;
const THRESHOLD = MIN_SCORE; // kept for callers that report the bar

// `role` filters to what this person can actually do. Telling a facilitator how
// to open a report they will be refused is a wrong answer, and a wrong answer
// from a helper costs more trust than no helper at all.
function visible(role) {
  return INDEX.filter((r) => !r.entry.roles || r.entry.roles.includes(role));
}

// Words that say the question is about somebody other than the person asking.
const ABOUT_OTHERS = new Set(["pasyente", "bata", "senior", "prenatal"]);

// "nakalimutan ko password ko" and "nakalimutan ng pasyente ang password" are
// the same words to the index, because "ko" and "ng" are grammar and get
// stripped — so both tied at a perfect score, and the winner was whichever came
// first in the file. A coin toss decided whose password we explained.
//
// This is a STAFF tool: if the question names nobody, the person holding the
// screen is who it is about. So an entry about somebody else loses a TIE here.
//
// Deliberately a tie-break and not a score penalty. It was a x0.9 multiplier
// first, and it quietly broke "asan yung immunization" — that entry mentions
// "bata" in passing, got docked for it, and lost to a completely different
// entry that happened not to. A rule meant to settle ties should never be able
// to overturn a real result.
function aboutSomeoneElse(entry) {
  return tokens([entry.q, (entry.keys || []).join(" ")].join(" "))
    .some((t) => ABOUT_OTHERS.has(t));
}

function rank(query, role) {
  const qTokens = tokens(query);
  if (!qTokens.length) return [];
  const namesOther = qTokens.some((t) => ABOUT_OTHERS.has(t));

  return visible(role)
    .map((row) => {
      const { score, coverage } = scoreOne(qTokens, row);
      return {
        entry: row.entry,
        score,
        coverage,
        // Lower sorts first. Tie-breaks only — never large enough to overturn
        // a real difference in score.
        //
        // The second term is the STARTERS list used as a priority order, which
        // is what it already is: a hand-ranked list of what people most often
        // come here for. A bare "bakun" matches the immunization card, the
        // overdue list and the dose form equally and honestly — nothing in the
        // query separates them — so the tie fell to whichever sat higher in the
        // file, which is not a reason. Ranking by the order we already declared
        // sends it to the card, which is what someone typing "bakun" wants.
        tie: (namesOther || !aboutSomeoneElse(row.entry) ? 0 : 1)
           + (STARTERS.includes(row.entry.id) ? STARTERS.indexOf(row.entry.id) / 100 : 0.5),
      };
    })
    .sort((a, b) => b.score - a.score || a.tie - b.tie);
}

function search(query, role, limit = 5) {
  return rank(query, role)
    .filter((r) => r.score >= MIN_SCORE && r.coverage >= MIN_COVERAGE)
    .slice(0, limit);
}

// What to show when nothing cleared the bar: the closest few anyway, clearly
// labelled as guesses. A dead end sends the person to the phone, which is the
// one outcome this feature exists to prevent.
function nearest(query, role, limit = 3) {
  return rank(query, role).filter((r) => r.score > 0).slice(0, limit);
}

function all(role) {
  return visible(role).map((r) => r.entry);
}

// The opening screen. Not the first N entries — a hand-picked set that covers
// the things people actually stand there wondering about, because most users
// will never type anything at all and this list is all they will ever see.
const STARTERS = [
  "add-patient", "book-appointment", "immunization-card", "record-dose",
  "dispense", "low-stock", "portal-account", "overdue-patient",
];

function starters(role) {
  const ok = new Set(all(role).map((e) => e.id));
  return STARTERS.filter((id) => ok.has(id))
    .map((id) => ENTRIES.find((e) => e.id === id));
}

module.exports = { search, nearest, all, starters, tokens, normalize, THRESHOLD };

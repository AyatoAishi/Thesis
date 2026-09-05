// ============================================================================
// routes/help.js — the JSON behind Ate Sam.
//
// Three endpoints, no database on the read path. The entries are a module that
// was loaded once at boot, so a search is pure CPU over ~30 objects: no query,
// no network, no API key, and nothing to run out of. That is what lets this
// keep working on a Sunday when nobody from the group is reachable, which was
// the whole argument against doing it with a language model.
// ============================================================================
const express = require("express");
const help = require("../lib/help/search");
const audit = require("../lib/audit");

const router = express.Router();

// Only what the panel needs. `keys` in particular stays on the server — it is
// full of misspellings and synonyms that exist for matching, and showing them
// to anyone would just look like a mistake.
function present(e) {
  return { id: e.id, q: e.q, tags: e.tags || [], short: e.short, steps: e.steps || [], go: e.go || null };
}

const roleOf = (req) => (req.session.user && req.session.user.role) || "";

// ---- GET /help/search?q= ---------------------------------------------------
// Called on every keystroke (debounced client-side), so it must stay cheap and
// must never write anything.
router.get("/help/search", (req, res) => {
  const q = String(req.query.q || "").slice(0, 200);
  const role = roleOf(req);
  const hits = help.search(q, role, 5);

  if (hits.length) {
    return res.json({ answered: true, hits: hits.map((h) => present(h.entry)) });
  }
  // Nothing cleared the bar. Say so plainly — and still hand over the closest
  // few, clearly labelled as guesses. A dead end sends the person to the phone,
  // and preventing exactly that is why this feature exists.
  return res.json({
    answered: false,
    hits: [],
    nearest: help.nearest(q, role, 3).map((h) => present(h.entry)),
  });
});

// ---- GET /help/all ---------------------------------------------------------
// The "see everything" view. Grouped by tag, because a flat list of 30 is a
// wall, and someone who opened this list is browsing rather than searching.
router.get("/help/all", (req, res) => {
  const role = roleOf(req);
  const entries = help.all(role).map(present);
  const groups = [];
  for (const e of entries) {
    const tag = e.tags[0] || "Iba pa";
    let g = groups.find((x) => x.tag === tag);
    if (!g) groups.push((g = { tag, items: [] }));
    g.items.push(e);
  }
  res.json({ groups, total: entries.length });
});

// ---- GET /help/starters ----------------------------------------------------
// What the panel shows before anything is typed. This is the most important
// endpoint of the three: most people will never type a word, and a blank search
// box asks them to already know the vocabulary they came here missing.
router.get("/help/starters", (req, res) => {
  res.json({ items: help.starters(roleOf(req)).map(present) });
});

// ---- POST /help/unanswered -------------------------------------------------
// A question Ate Sam could not answer is the single most useful thing this
// feature produces: it is a list, in the users' own words, of what the system
// failed to explain. It goes in audit_log — which already exists, so there is
// no new table — under its own action, and can be read back with:
//
//   SELECT details, count(*) FROM audit_log
//    WHERE action = 'help_unanswered' GROUP BY 1 ORDER BY 2 DESC;
router.post("/help/unanswered", (req, res) => {
  const q = String(req.body.q || "").trim().slice(0, 200);
  // Two words is somebody mid-thought, not a question. Logging those would
  // bury the real ones.
  if (q.split(/\s+/).length >= 2) {
    const u = req.session.user;
    audit.log(u ? u.user_id : null, "help_unanswered", "help", null, q);
  }
  res.json({ ok: true });
});

module.exports = router;

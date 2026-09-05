// ============================================================================
// public/js/help.js — Ate Sam, the in-app guide.
//
// Everything she knows lives on the server in lib/help/entries.js. This file
// only opens the panel, asks, and draws the answer. There is no model here and
// no key: a search is a GET against our own server that returns in a few
// milliseconds, so it stays fast on the barangay's connection and keeps working
// when nobody from the group is around to top up an account.
// ============================================================================
(function () {
  "use strict";

  var panel = document.querySelector("[data-sam-panel]");
  if (!panel) return; // signed-out pages have no rail, no topbar, and no Sam

  var bubble = document.querySelector("[data-sam-open]");
  var scrim = document.querySelector("[data-sam-scrim]");
  var input = panel.querySelector("[data-sam-input]");
  var body = panel.querySelector("[data-sam-body]");
  var clearBtn = panel.querySelector("[data-sam-clear]");
  var allBtn = panel.querySelector("[data-sam-all]");
  var closeBtn = panel.querySelector("[data-sam-close]");

  var open = false;
  var showingAll = false;
  var lastReturn = null;   // where focus goes back to on close
  var reqSeq = 0;          // guards against a slow reply overwriting a fast one
  var reported = {};       // questions already logged, so we log each once

  // ---- open / close --------------------------------------------------------
  function show() {
    if (open) return;
    open = true;
    lastReturn = document.activeElement;
    scrim.hidden = false;
    panel.hidden = false;
    // Two frames: the element has to be in the layout with its start transform
    // applied before the class that animates it is added, or the browser
    // collapses both into one paint and nothing slides.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        scrim.classList.add("is-open");
        panel.classList.add("is-open");
      });
    });
    document.body.style.overflow = "hidden";
    if (!body.innerHTML) starters();
    // Not focusing the input on a touch screen, on purpose: it would throw up
    // the on-screen keyboard and bury the tappable questions underneath it,
    // which are what most people actually came for.
    if (!window.matchMedia("(pointer: coarse)").matches) {
      setTimeout(function () { input.focus(); }, 260);
    }
  }

  function hide() {
    if (!open) return;
    open = false;
    scrim.classList.remove("is-open");
    panel.classList.remove("is-open");
    document.body.style.overflow = "";
    setTimeout(function () {
      if (open) return;
      panel.hidden = true;
      scrim.hidden = true;
    }, 340);
    if (lastReturn && lastReturn.focus) lastReturn.focus();
  }

  bubble.addEventListener("click", show);
  closeBtn.addEventListener("click", hide);
  scrim.addEventListener("click", hide);

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && open) { e.preventDefault(); hide(); }
  });

  // Focus must not wander out of an open dialog into the page behind it —
  // someone tabbing through would otherwise be typing into a form they cannot
  // see, with the dimmer over it.
  panel.addEventListener("keydown", function (e) {
    if (e.key !== "Tab") return;
    var f = panel.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])');
    var list = Array.prototype.filter.call(f, function (el) { return el.offsetParent !== null; });
    if (!list.length) return;
    var first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // ---- drawing -------------------------------------------------------------
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Entry text is written by us in entries.js and deliberately contains <b>
  // for the button names. It never contains anything a user typed, so the tags
  // are ours to trust — but only these, and only from this one field.
  function steps(html) {
    return esc(html).replace(/&lt;b&gt;/g, "<b>").replace(/&lt;\/b&gt;/g, "</b>");
  }

  function card(e) {
    var h = '<article class="sam-card">';
    h += '<div class="sam-card-head"><div class="sam-card-q">' + esc(e.q) + "</div>";
    if (e.short) h += '<div class="sam-card-short">' + esc(e.short) + "</div>";
    h += "</div><div class=\"sam-card-body\">";
    if (e.steps && e.steps.length) {
      h += '<ol class="sam-steps">';
      for (var i = 0; i < e.steps.length; i++) h += "<li>" + steps(e.steps[i]) + "</li>";
      h += "</ol>";
    }
    if (e.go && e.go.href) {
      h += '<a class="sam-go" href="' + esc(e.go.href) + '">' + esc(e.go.label) +
           ' <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"' +
           ' stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
           '<path d="M5 12h13M13 6l6 6-6 6"/></svg></a>';
    }
    if (e.tags && e.tags.length) {
      h += '<div class="sam-tags">';
      for (var t = 0; t < e.tags.length; t++) h += '<span class="sam-tag">' + esc(e.tags[t]) + "</span>";
      h += "</div>";
    }
    return h + "</div></article>";
  }

  function questionButtons(items) {
    var h = "";
    for (var i = 0; i < items.length; i++) {
      h += '<button type="button" class="sam-q" data-ask="' + esc(items[i].q) + '">' +
           esc(items[i].q) + "</button>";
    }
    return h;
  }

  // A tapped question fills the box and searches, so the person sees the words
  // that produced the answer. Next time they may type them.
  body.addEventListener("click", function (e) {
    var b = e.target.closest("[data-ask]");
    if (!b) return;
    input.value = b.getAttribute("data-ask");
    clearBtn.hidden = false;
    setAll(false);
    ask(input.value);
  });

  // ---- the three views -----------------------------------------------------
  function starters() {
    setAll(false);
    fetch("/help/starters", { headers: { accept: "application/json" } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        body.innerHTML =
          '<div class="sam-label">Madalas itanong</div>' + questionButtons(d.items || []) +
          '<div class="sam-empty" style="padding-top:18px">' +
          "Wala dito ang hinahanap mo? Itanong mo sa taas —<br>Tagalog o English, pareho lang." +
          "</div>";
      })
      .catch(function () { body.innerHTML = '<div class="sam-empty">Hindi ma-load. Subukan ulit.</div>'; });
  }

  function everything() {
    setAll(true);
    input.value = "";
    clearBtn.hidden = true;
    fetch("/help/all", { headers: { accept: "application/json" } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var h = '<div class="sam-label">Lahat ng tanong (' + d.total + ")</div>";
        (d.groups || []).forEach(function (g) {
          h += '<div class="sam-label" style="margin-top:14px">' + esc(g.tag) + "</div>";
          h += questionButtons(g.items);
        });
        body.innerHTML = h;
        body.scrollTop = 0;
      })
      .catch(function () { body.innerHTML = '<div class="sam-empty">Hindi ma-load. Subukan ulit.</div>'; });
  }

  function ask(q) {
    var mine = ++reqSeq;
    fetch("/help/search?q=" + encodeURIComponent(q), { headers: { accept: "application/json" } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        // A reply for a query the person has already typed past is stale. Two
        // keystrokes can be in flight at once and they do not have to come back
        // in order — without this, the answer for "pas" can land after the
        // answer for "pasyente" and replace it.
        if (mine !== reqSeq) return;

        if (d.answered) {
          // Only the best match is opened. Five full answers stacked up was a
          // wall of text to scroll past, and the one they wanted was already
          // at the top — the rest are offered as questions to tap, which is
          // both shorter and clearer about which one Ate Sam actually picked.
          var h = card(d.hits[0]);
          if (d.hits.length > 1) {
            h += '<div class="sam-label" style="margin-top:16px">Baka ito rin ang hanap mo</div>' +
                 questionButtons(d.hits.slice(1));
          }
          body.innerHTML = h;
          body.scrollTop = 0;
          return;
        }

        var n = '<div class="sam-none"><div class="sam-none-t">Pasensya na po, wala po akong alam diyan.</div>' +
                '<div class="sam-none-p">Alam ko lang po kung saan ang mga bagay dito sa sistema. ' +
                "Hindi po ako marunong sa gamot o sa lunas — sa nurse po iyon.</div></div>";
        if (d.nearest && d.nearest.length) {
          n += '<div class="sam-label" style="margin-top:14px">Ito kaya ang ibig niyong sabihin?</div>' +
               questionButtons(d.nearest);
        }
        n += '<div class="sam-empty" style="padding-top:14px">' +
             "Naitala ko po ang tanong niyo para madagdag namin ito." +
             "</div>";
        body.innerHTML = n;
        body.scrollTop = 0;
        report(q);
      })
      .catch(function () { /* offline or a hiccup — leave what is on screen */ });
  }

  // A question Ate Sam could not answer is the most useful thing this produces:
  // a list, in their words, of what the system failed to explain. Logged once
  // each, and only after the typing has stopped.
  function report(q) {
    var key = q.trim().toLowerCase();
    if (!key || reported[key]) return;
    reported[key] = true;
    fetch("/help/unanswered", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": panel.getAttribute("data-csrf") || "",
      },
      body: JSON.stringify({ q: q }),
    }).catch(function () { /* never let a failed log disturb the answer */ });
  }

  function setAll(on) {
    showingAll = on;
    allBtn.classList.toggle("is-on", on);
    allBtn.textContent = on ? "Bumalik" : "Lahat ng tanong";
  }

  allBtn.addEventListener("click", function () {
    if (showingAll) { starters(); } else { everything(); }
  });

  // ---- typing --------------------------------------------------------------
  var timer = null;
  input.addEventListener("input", function () {
    var q = input.value.trim();
    clearBtn.hidden = !q;
    clearTimeout(timer);
    if (!q) { starters(); return; }
    // 180ms: long enough that a normal typist fires one request per word rather
    // than one per letter, short enough that suggestions still feel live.
    timer = setTimeout(function () { ask(q); }, 180);
  });

  input.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    clearTimeout(timer);
    var q = input.value.trim();
    if (q) ask(q);
  });

  clearBtn.addEventListener("click", function () {
    input.value = "";
    clearBtn.hidden = true;
    input.focus();
    starters();
  });
})();

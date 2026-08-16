// Small client-side helpers. Grows in later milestones (search, modals, etc.).
(function () {
  "use strict";
  // Focus the top search box with "/" (like the prototype).
  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && document.activeElement.tagName !== "INPUT") {
      var search = document.querySelector("[data-search]");
      if (search) {
        e.preventDefault();
        search.focus();
      }
    }
  });

  // "Link to family" (views/partials/family-lookup.ejs) — search a relative
  // by name; picking one shows a plain confirmation chip instead of any raw
  // code, and never asks staff to go make a second manual edit elsewhere.
  document.querySelectorAll("[data-family-link]").forEach(function (root) {
    var valueInput = root.querySelector("[data-family-link-value]");
    var chip = root.querySelector("[data-family-link-chip]");
    var chipText = root.querySelector("[data-family-link-chip-text]");
    var clearBtn = root.querySelector("[data-family-link-clear]");
    var searchWrap = root.querySelector("[data-family-link-search-wrap]");
    var search = root.querySelector("[data-family-link-search]");
    var results = root.querySelector("[data-family-link-results]");
    var dataEl = root.querySelector("[data-family-link-data]");
    var people = JSON.parse(dataEl.textContent || "[]");

    function showChip(text) {
      chipText.textContent = text;
      chip.hidden = false;
      searchWrap.hidden = true;
    }

    function showSearch() {
      valueInput.value = "";
      chip.hidden = true;
      searchWrap.hidden = false;
      search.value = "";
      results.hidden = true;
      search.focus();
    }

    if (clearBtn) clearBtn.addEventListener("click", showSearch);

    function choose(p) {
      results.hidden = true;
      showChip("Linking with " + p.name + "…");
      fetch("/patients/" + p.id + "/ensure-family-number", { method: "POST" })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          valueInput.value = data.family_number;
          showChip("Linked with " + p.name);
        })
        .catch(function () {
          showChip("Couldn't link right now — try again.");
        });
    }

    function render(matches) {
      results.innerHTML = "";
      if (!matches.length) {
        var empty = document.createElement("div");
        empty.className = "patient-picker-empty";
        empty.textContent = "No matching patient.";
        results.appendChild(empty);
      } else {
        matches.slice(0, 8).forEach(function (p) {
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "patient-picker-result";
          var nameSpan = document.createElement("span");
          nameSpan.textContent = p.name;
          var numSpan = document.createElement("span");
          numSpan.className = "muted";
          numSpan.textContent = p.num;
          btn.appendChild(nameSpan);
          btn.appendChild(numSpan);
          btn.addEventListener("click", function () { choose(p); });
          results.appendChild(btn);
        });
      }
      results.hidden = false;
    }

    search.addEventListener("input", function () {
      var q = search.value.trim().toLowerCase();
      if (!q) {
        results.hidden = true;
        return;
      }
      render(people.filter(function (p) {
        return p.name.toLowerCase().indexOf(q) !== -1 || p.num.toLowerCase().indexOf(q) !== -1;
      }));
    });

    search.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        var first = results.querySelector(".patient-picker-result");
        if (first) first.click();
      } else if (e.key === "Escape") {
        results.hidden = true;
      }
    });

    document.addEventListener("click", function (e) {
      if (!root.contains(e.target)) results.hidden = true;
    });
  });

  // Searchable picker (views/partials/search-picker.ejs) — filters the list
  // already on the page client-side instead of a long <select>. Used for
  // patients and for medicines on the dispense form; items are
  // { id, label, meta }, so nothing here knows what it's picking.
  document.querySelectorAll("[data-picker]").forEach(function (root) {
    var idInput = root.querySelector("[data-picker-id]");
    var search = root.querySelector("[data-picker-search]");
    var results = root.querySelector("[data-picker-results]");
    var dataEl = root.querySelector("[data-picker-data]");
    var items = JSON.parse(dataEl.textContent || "[]");

    function display(item) {
      return item.meta ? item.label + " — " + item.meta : item.label;
    }

    function render(matches) {
      results.innerHTML = "";
      if (!matches.length) {
        var empty = document.createElement("div");
        empty.className = "patient-picker-empty";
        empty.textContent = "No match.";
        results.appendChild(empty);
      } else {
        matches.slice(0, 8).forEach(function (item) {
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "patient-picker-result";
          var labelSpan = document.createElement("span");
          labelSpan.textContent = item.label;
          btn.appendChild(labelSpan);
          if (item.meta) {
            var metaSpan = document.createElement("span");
            metaSpan.className = "muted";
            metaSpan.textContent = item.meta;
            btn.appendChild(metaSpan);
          }
          btn.addEventListener("click", function () {
            idInput.value = item.id;
            search.value = display(item);
            results.hidden = true;
          });
          results.appendChild(btn);
        });
      }
      results.hidden = false;
    }

    search.addEventListener("input", function () {
      idInput.value = ""; // typing invalidates any prior selection
      var q = search.value.trim().toLowerCase();
      if (!q) {
        results.hidden = true;
        return;
      }
      render(items.filter(function (item) {
        return display(item).toLowerCase().indexOf(q) !== -1;
      }));
    });

    // Clicking an empty box shows the first few options, so it still behaves
    // like a dropdown for anyone who doesn't know what to type.
    search.addEventListener("focus", function () {
      if (!search.value.trim()) render(items);
    });

    search.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        var first = results.querySelector(".patient-picker-result");
        if (first) first.click();
      } else if (e.key === "Escape") {
        results.hidden = true;
      }
    });

    document.addEventListener("click", function (e) {
      if (!root.contains(e.target)) results.hidden = true;
    });
  });
})();

/* ---------------------------------------------------------------------------
 * Confirm dialog for destructive actions.
 *
 * Replaces window.confirm() on forms carrying [data-confirm]. The native one
 * is a single grey line of text with OK/Cancel — it reads as a formality, and
 * "OK" is the easy button. Here the destructive choice is the red one, the
 * safe choice is focused by default, and there's room to spell out exactly
 * what is about to be destroyed.
 *
 *   data-confirm       body text; use " | " to split it into bullet points
 *   data-confirm-title heading (default "Warning")
 *   data-confirm-yes   destructive button label (default "Yes, delete")
 *   data-confirm-no    safe button label (default "No, keep it")
 * ------------------------------------------------------------------------- */
(function () {
  var forms = document.querySelectorAll("form[data-confirm]");
  if (!forms.length) return;

  var dlg = document.createElement("dialog");
  dlg.className = "confirm-dialog";
  dlg.innerHTML =
    '<h2 class="confirm-title"></h2>' +
    '<div class="confirm-body"></div>' +
    '<div class="confirm-actions">' +
      '<button type="button" class="btn confirm-no" data-no></button>' +
      '<button type="button" class="btn confirm-yes" data-yes></button>' +
    "</div>";
  document.body.appendChild(dlg);

  var titleEl = dlg.querySelector(".confirm-title");
  var bodyEl = dlg.querySelector(".confirm-body");
  var yesBtn = dlg.querySelector("[data-yes]");
  var noBtn = dlg.querySelector("[data-no]");
  var pending = null;

  function fill(el, text) {
    // " | " turns the message into a list, so a long "this also deletes…"
    // sentence doesn't arrive as one unreadable paragraph.
    el.textContent = "";
    var parts = text.split(" | ");
    if (parts.length < 2) {
      var p = document.createElement("p");
      p.textContent = text;
      el.appendChild(p);
      return;
    }
    var lead = document.createElement("p");
    lead.textContent = parts[0];
    el.appendChild(lead);
    var ul = document.createElement("ul");
    parts.slice(1).forEach(function (item) {
      var li = document.createElement("li");
      li.textContent = item;
      ul.appendChild(li);
    });
    el.appendChild(ul);
  }

  forms.forEach(function (form) {
    form.addEventListener("submit", function (e) {
      if (form.dataset.confirmed === "1") return; // second pass — let it through
      e.preventDefault();
      pending = form;
      titleEl.textContent = form.dataset.confirmTitle || "Warning";
      fill(bodyEl, form.dataset.confirm || "Are you sure?");
      yesBtn.textContent = form.dataset.confirmYes || "Yes, delete";
      noBtn.textContent = form.dataset.confirmNo || "No, keep it";
      dlg.showModal();
      noBtn.focus(); // the safe choice is the one under the finger
    });
  });

  yesBtn.addEventListener("click", function () {
    if (!pending) return;
    var form = pending;
    pending = null;
    dlg.close();
    form.dataset.confirmed = "1";
    form.submit();
  });

  noBtn.addEventListener("click", function () {
    pending = null;
    dlg.close();
  });

  // Esc closes it (native <dialog> behaviour) — make sure that cancels too.
  dlg.addEventListener("close", function () { pending = null; });
})();

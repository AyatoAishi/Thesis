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

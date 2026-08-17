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

  // "Link to family" (views/partials/family-lookup.ejs) — search relatives by
  // name and queue them; the household number itself is never shown or typed.
  //
  // Picking a name only adds it to a hidden list that the server reads on
  // submit. Nothing is written until then, so cancelling the form leaves the
  // other patient exactly as it found them. The search box stays open after a
  // pick, because a household can be any size.
  document.querySelectorAll("[data-family-link]").forEach(function (root) {
    var valueInput = root.querySelector("[data-family-link-value]");
    var joinInput = root.querySelector("[data-family-join-ids]");
    var membersBox = root.querySelector("[data-family-members]");
    var clearBtn = root.querySelector("[data-family-link-clear]");
    var pending = root.querySelector("[data-family-pending]");
    var search = root.querySelector("[data-family-link-search]");
    var results = root.querySelector("[data-family-link-results]");
    var dataEl = root.querySelector("[data-family-link-data]");
    var people = JSON.parse(dataEl.textContent || "[]");

    // Survives a failed validation round-trip: the ids come back in the hidden
    // field, so the names staff picked are still on screen.
    var picked = (joinInput.value || "")
      .split(",")
      .filter(Boolean)
      .map(function (id) {
        var found = people.filter(function (p) { return String(p.id) === String(id); })[0];
        return found || { id: id, name: "Patient #" + id, num: "" };
      });

    function syncPending() {
      joinInput.value = picked.map(function (p) { return p.id; }).join(",");
      pending.innerHTML = "";
      pending.hidden = picked.length === 0;
      picked.forEach(function (p) {
        var chip = document.createElement("span");
        chip.className = "family-chip-static pending";
        var name = document.createElement("b");
        name.textContent = p.name;
        var drop = document.createElement("button");
        drop.type = "button";
        drop.className = "family-chip-x";
        drop.setAttribute("aria-label", "Remove " + p.name);
        drop.textContent = "×";
        drop.addEventListener("click", function () {
          picked = picked.filter(function (q) { return q.id !== p.id; });
          syncPending();
        });
        chip.appendChild(name);
        chip.appendChild(drop);
        pending.appendChild(chip);
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        valueInput.value = "";        // saved on submit: leaves the household
        picked = [];
        syncPending();
        if (membersBox) membersBox.hidden = true;
        search.focus();
      });
    }

    function choose(p) {
      results.hidden = true;
      search.value = "";
      if (!picked.some(function (q) { return String(q.id) === String(p.id); })) {
        picked.push(p);
        syncPending();
      }
      search.focus();
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
        var alreadyPicked = picked.some(function (x) { return String(x.id) === String(p.id); });
        if (alreadyPicked) return false;
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

    syncPending();
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

/* ---------------------------------------------------------------------------
 * Top search bar — live patient dropdown.
 *
 * The bar used to be a plain form: type, press Enter, land on a filtered list,
 * then click again. For the common case (staff already know who is standing at
 * the desk) that is two steps too many, so matches now appear as you type and
 * go straight to the record.
 *
 * Results come from /patients/search.json rather than being embedded in the
 * page, because this bar renders on every screen and the patient list only
 * grows. Requests are debounced and the previous one is aborted, so a fast
 * typist can't have an old reply overwrite a newer one.
 * ------------------------------------------------------------------------- */
(function () {
  "use strict";
  var wrap = document.querySelector("[data-topsearch]");
  if (!wrap) return;
  var input = wrap.querySelector("[data-search]");
  var box = wrap.querySelector("[data-topsearch-results]");
  var timer = null;
  var controller = null;
  var active = -1;

  function hide() {
    box.hidden = true;
    active = -1;
  }

  function items() {
    return Array.prototype.slice.call(box.querySelectorAll(".topsearch-item"));
  }

  function highlight(i) {
    var list = items();
    if (!list.length) return;
    active = (i + list.length) % list.length;
    list.forEach(function (el, n) { el.classList.toggle("active", n === active); });
    list[active].scrollIntoView({ block: "nearest" });
  }

  function render(rows) {
    box.innerHTML = "";
    if (!rows.length) {
      var none = document.createElement("div");
      none.className = "topsearch-empty";
      none.textContent = "No matching patient.";
      box.appendChild(none);
    } else {
      rows.forEach(function (p) {
        var a = document.createElement("a");
        a.className = "topsearch-item";
        a.href = "/patients/" + p.patient_id;
        var name = document.createElement("span");
        name.textContent = p.full_name;
        if (p.is_minor) {
          var tag = document.createElement("span");
          tag.className = "badge info";
          tag.textContent = "Minor";
          name.appendChild(document.createTextNode(" "));
          name.appendChild(tag);
        }
        var num = document.createElement("span");
        num.className = "muted mono";
        num.textContent = p.patient_number;
        a.appendChild(name);
        a.appendChild(num);
        box.appendChild(a);
      });
    }
    box.hidden = false;
    active = -1;
  }

  input.addEventListener("input", function () {
    var q = input.value.trim();
    clearTimeout(timer);
    if (q.length < 2) return hide();
    timer = setTimeout(function () {
      if (controller) controller.abort();
      controller = new AbortController();
      fetch("/patients/search.json?q=" + encodeURIComponent(q), { signal: controller.signal })
        .then(function (r) { return r.json(); })
        .then(render)
        .catch(function () { /* aborted or offline — the form still works */ });
    }, 150);
  });

  input.addEventListener("keydown", function (e) {
    if (box.hidden) return;
    if (e.key === "ArrowDown") { e.preventDefault(); highlight(active + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); highlight(active - 1); }
    else if (e.key === "Escape") { hide(); }
    else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();               // otherwise the form submits instead
      items()[active].click();
    }
  });

  document.addEventListener("click", function (e) {
    if (!wrap.contains(e.target)) hide();
  });
})();

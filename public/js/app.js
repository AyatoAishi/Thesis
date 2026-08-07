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

  // "Generate new" family number button (views/patients/form.ejs).
  var genFamilyBtn = document.querySelector("[data-gen-family-number]");
  if (genFamilyBtn) {
    genFamilyBtn.addEventListener("click", function () {
      genFamilyBtn.disabled = true;
      fetch("/patients/next-family-number")
        .then(function (r) { return r.json(); })
        .then(function (data) {
          document.getElementById("familyNumber").value = data.family_number;
        })
        .catch(function () {
          alert("Couldn't generate a number right now — check your connection and try again.");
        })
        .finally(function () {
          genFamilyBtn.disabled = false;
        });
    });
  }

  // "Link to existing family member" search (views/partials/family-lookup.ejs).
  document.querySelectorAll("[data-family-lookup]").forEach(function (root) {
    var search = root.querySelector("[data-family-lookup-search]");
    var results = root.querySelector("[data-family-lookup-results]");
    var dataEl = root.querySelector("[data-family-lookup-data]");
    var note = root.querySelector("[data-family-lookup-note]");
    var target = document.getElementById("familyNumber");
    var people = JSON.parse(dataEl.textContent || "[]");

    function setNote(text, link) {
      note.textContent = "";
      if (text) note.appendChild(document.createTextNode(text + " "));
      if (link) {
        var a = document.createElement("a");
        a.href = link.href;
        a.textContent = link.text;
        a.target = "_blank";
        a.className = "back-link";
        note.appendChild(a);
      }
    }

    function choose(p) {
      if (p.fam) {
        target.value = p.fam;
        setNote("Copied " + p.name + "'s family number.");
        results.hidden = true;
        search.value = "";
        return;
      }
      // No family number on that record yet — generate one for this form,
      // and point staff at the other record so they can add it there too.
      setNote("Generating…");
      fetch("/patients/next-family-number")
        .then(function (r) { return r.json(); })
        .then(function (data) {
          target.value = data.family_number;
          setNote(p.name + " doesn't have a family number yet. Generated " + data.family_number + " — also add it to", {
            href: "/patients/" + p.id + "/edit",
            text: p.name + "'s record",
          });
        })
        .catch(function () {
          setNote("Couldn't generate a number right now — try again.");
        });
      results.hidden = true;
      search.value = "";
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
          var metaSpan = document.createElement("span");
          metaSpan.className = "muted";
          metaSpan.textContent = p.num + (p.fam ? " · " + p.fam : " · no family #");
          btn.appendChild(nameSpan);
          btn.appendChild(metaSpan);
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

  // Searchable patient picker (views/partials/patient-picker.ejs) — filters
  // the page's own patient list client-side instead of a plain long <select>.
  document.querySelectorAll("[data-patient-picker]").forEach(function (root) {
    var idInput = root.querySelector("[data-patient-picker-id]");
    var search = root.querySelector("[data-patient-picker-search]");
    var results = root.querySelector("[data-patient-picker-results]");
    var dataEl = root.querySelector("[data-patient-picker-data]");
    var patients = JSON.parse(dataEl.textContent || "[]");

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
          btn.addEventListener("click", function () {
            idInput.value = p.id;
            search.value = p.name + " — " + p.num;
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
      render(patients.filter(function (p) {
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
})();

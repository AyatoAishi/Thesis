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

// ============================================================================
// lib/help/entries.js — everything Ate Sam knows.
//
// This is the whole knowledge base, written by hand, and that is the point.
// The alternative we rejected was a language model over an API: it would have
// cost money per question, it would have stopped working the moment the credits
// ran out (which is exactly when nobody from the group is there to notice), and
// it can produce a confident wrong answer. The people using this are elderly
// barangay staff. A wrong answer does not read to them as the computer being
// wrong — it reads as them being stupid, and they stop trusting the whole
// system and ring us anyway, which is the very thing this is meant to prevent.
//
// So every answer below is a sentence somebody wrote and can be held to.
//
// RULES for adding an entry:
//   1. `steps` must name buttons EXACTLY as they appear on screen. The button
//      really does say "+ Add patient" in English; the instruction around it is
//      Tagalog because that is how you would say it out loud to the person
//      sitting next to you. Do not translate the button.
//   2. `go.href` must be a route that exists. A helper that navigates to a 404
//      is worse than no helper.
//   3. `roles` must match the real gate on that route. Telling a facilitator
//      how to open a report they will be refused is a wrong answer.
//   4. `keys` is where the search actually lives — put the misspellings, the
//      shortcuts, and BOTH languages in. See lib/help/search.js.
// ============================================================================

// Role names used by the gates in routes/. Kept here so a typo is obvious.
const ALL = ["nurse", "facilitator", "recorder", "admin"];
const REPORTS = ["nurse", "recorder", "admin"]; // routes/reports.js REPORT_ROLES
const CLINICAL = ["nurse", "admin"];            // routes/visits.js CLINICAL_ROLES
const ADMIN = ["admin"];

const ENTRIES = [
  // ---- Patients ------------------------------------------------------------
  {
    id: "add-patient",
    q: "Paano magdagdag ng bagong pasyente?",
    qEn: "How do I add a new patient?",
    tags: ["Pasyente"],
    keys: ["patient", "pasyente", "add", "dagdag", "magdagdag", "bago", "new",
           "register", "rehistro", "magrehistro", "enroll", "lagay", "maglagay",
           "encode", "record", "tala", "itala"],
    roles: ALL,
    short: "Nasa Patients page ito, wala sa Forms.",
    steps: [
      "Buksan ang <b>Patients</b> sa kaliwang gilid.",
      "Pindutin ang <b>+ Add patient</b> sa kanang taas.",
      "Punan ang pangalan, kaarawan, kasarian, at address. Ito lang ang kailangan.",
      "Pindutin ang <b>Save</b>.",
    ],
    go: { href: "/patients/new", label: "Buksan ang Add patient" },
  },
  {
    id: "find-patient",
    q: "Paano hanapin ang isang pasyente?",
    qEn: "How do I search for a patient?",
    tags: ["Pasyente"],
    keys: ["hanap", "hanapin", "maghanap", "search", "find", "look", "tingin",
           "tignan", "makita", "saan", "asan", "patient", "pasyente", "pangalan",
           "name", "number", "numero"],
    roles: ALL,
    short: "May search box sa itaas ng Patients page. Pangalan o patient number, pareho gumagana.",
    steps: [
      "Buksan ang <b>Patients</b>.",
      "I-type ang pangalan o ang patient number sa search box sa taas.",
      "Pindutin ang pangalan sa listahan para buksan ang record niya.",
    ],
    go: { href: "/patients", label: "Buksan ang Patients" },
  },
  {
    id: "edit-patient",
    q: "Paano baguhin ang detalye ng pasyente? Mali ang pagkakatype ko.",
    qEn: "How do I edit or correct a patient's details?",
    tags: ["Pasyente"],
    keys: ["edit", "baguhin", "palitan", "ayusin", "iwasto", "correct", "wrong",
           "mali", "maling", "typo", "update", "change", "revise", "pagkakamali"],
    roles: ALL,
    short: "Buksan ang pasyente, tapos Edit. Hindi na kailangang gumawa ng bagong record.",
    steps: [
      "Hanapin at buksan ang pasyente sa <b>Patients</b>.",
      "Pindutin ang <b>Edit</b> sa taas ng record niya.",
      "Ayusin ang mali, tapos <b>Save</b>.",
    ],
    go: { href: "/patients", label: "Buksan ang Patients" },
  },
  {
    id: "overdue-patient",
    q: "Paano ko malalaman kung sino ang overdue sa bakuna?",
    qEn: "How do I see which patients are overdue?",
    tags: ["Pasyente", "Bakuna"],
    keys: ["overdue", "late", "huli", "nahuli", "lampas", "delayed", "hindi",
           "nakaligtaan", "missed", "kulang", "due", "bakuna", "vaccine",
           "immunization", "bata", "child"],
    roles: ALL,
    short: "May pulang badge sa listahan ng Patients, at may bilang sa kampana sa taas.",
    steps: [
      "Tignan ang kampana sa kanang taas — sinasabi niya kung ilang bata ang overdue.",
      "O buksan ang <b>Patients</b>: may pulang badge ang bawat overdue na pasyente sa listahan.",
      "Buksan ang pasyente para makita kung aling dose ang kulang at ilang araw nang lampas.",
    ],
    go: { href: "/patients", label: "Buksan ang Patients" },
  },
  {
    id: "household",
    q: "Magkapamilya sila. Paano ko sila pagsasamahin?",
    qEn: "How do I link patients in the same household or family?",
    tags: ["Pasyente"],
    keys: ["pamilya", "family", "household", "kapamilya", "magkapatid", "anak",
           "magulang", "parent", "guardian", "link", "ugnay", "iugnay", "sama",
           "pagsamahin", "grupo", "group", "bahay"],
    roles: ALL,
    short: "Sa form ng pasyente, may \"Link to family\" — hanapin lang ang kamag-anak sa pangalan.",
    steps: [
      "Buksan ang pasyente, pindutin ang <b>Edit</b>. (O habang nagdadagdag ng bago.)",
      "Hanapin ang <b>Family</b> na bahagi ng form.",
      "I-type ang pangalan ng kamag-anak, tapos pindutin ito sa lalabas na listahan.",
      "Pindutin ang <b>Save</b>. Magkakita-kita na sila sa isa't isa.",
    ],
    go: { href: "/patients", label: "Buksan ang Patients" },
  },

  // ---- Appointments --------------------------------------------------------
  {
    id: "book-appointment",
    q: "Paano mag-book ng appointment?",
    qEn: "How do I book an appointment?",
    tags: ["Appointment"],
    keys: ["appointment", "book", "magbook", "schedule", "iskedyul", "iskedyul",
           "magpaschedule", "set", "reserve", "pasyente", "patient", "petsa",
           "date", "oras", "time", "bagong"],
    roles: ALL,
    short: "Appointments → + Book appointment. Hanapin ang pasyente, piliin ang serbisyo at petsa.",
    steps: [
      "Buksan ang <b>Appointments</b> sa kaliwang gilid.",
      "Pindutin ang <b>+ Book appointment</b>.",
      "Hanapin ang pasyente sa pangalan. Kung wala pa siya, may link doon para idagdag muna siya.",
      "Piliin ang serbisyo, petsa, at oras. Pindutin ang <b>Save</b>.",
    ],
    go: { href: "/appointments/new", label: "Buksan ang Book appointment" },
  },
  {
    id: "todays-list",
    q: "Saan ko makikita ang mga darating ngayong araw?",
    qEn: "Where do I see today's appointments?",
    tags: ["Appointment"],
    keys: ["ngayon", "today", "araw", "daily", "listahan", "list", "darating",
           "dumating", "expected", "schedule", "iskedyul", "appointment", "saan",
           "asan", "makita", "tignan"],
    roles: ALL,
    short: "Ang Appointments page ay nakabukas sa araw na ito bilang default.",
    steps: [
      "Buksan ang <b>Appointments</b> — ang listahan ngayong araw agad ang lalabas.",
      "Para sa ibang petsa, palitan ang petsa sa taas.",
      "Nasa Dashboard din ang bilang ng inaasahan ngayong araw.",
    ],
    go: { href: "/appointments", label: "Buksan ang Appointments" },
  },
  {
    id: "mark-done",
    q: "Dumating na ang pasyente. Paano ko mamarkahan?",
    qEn: "How do I mark a patient as done or missed?",
    tags: ["Appointment"],
    keys: ["done", "tapos", "natapos", "dumating", "arrived", "attend", "pumunta",
           "mark", "markahan", "missed", "hindi", "dumalo", "absent", "no-show",
           "noshow", "wala", "status", "completed"],
    roles: ALL,
    short: "Sa daily list ng Appointments, may markahan sa bawat linya.",
    steps: [
      "Buksan ang <b>Appointments</b> sa tamang petsa.",
      "Hanapin ang pasyente sa listahan.",
      "Pindutin ang <b>Done</b> kung dumating siya, o <b>Missed</b> kung hindi.",
    ],
    go: { href: "/appointments", label: "Buksan ang Appointments" },
  },
  {
    id: "auto-immunization-appt",
    q: "May appointment na hindi ko naman ginawa. Saan galing?",
    qEn: "Where do the automatic immunization appointments come from?",
    tags: ["Appointment", "Bakuna"],
    keys: ["automatic", "auto", "kusa", "sarili", "hindi", "ginawa", "saan",
           "galing", "bakit", "may", "biglang", "lumabas", "immunization",
           "bakuna", "system", "sistema"],
    roles: ALL,
    short: "Ang sistema mismo ang naglagay. Kinuwenta niya sa kaarawan ng bata kung kailan due ang susunod na bakuna.",
    steps: [
      "Araw-araw, tinitignan ng sistema ang kaarawan ng bawat batang wala pang 5 taon.",
      "Kung may dose na due sa loob ng 3 linggo, kusang inilalagay siya sa susunod na Martes.",
      "Isang appointment lang kada bata kada araw, kahit tatlo ang bakuna — para isang punta lang.",
      "Hindi awtomatikong nabu-book ang lampas 90 araw nang overdue. Kailangan ng nurse na magdesisyon doon.",
    ],
    go: { href: "/appointments", label: "Buksan ang Appointments" },
  },

  // ---- Immunization / Forms ------------------------------------------------
  {
    id: "immunization-card",
    // "bakuna" belongs in the title, not just the keywords. Without it, someone
    // typing "bakun" was sent to the overdue list — which does say "bakuna" in
    // its title — while the card itself never surfaced. The word people use for
    // the thing has to be in the name of the thing.
    q: "Saan ang immunization card o record ng bakuna?",
    qEn: "Where is the immunization card?",
    tags: ["Bakuna", "Forms"],
    keys: ["immunization", "bakuna", "turok", "iniksyon", "vaccine", "card",
           "todo", "ligtas", "saan", "asan", "buksan", "open", "bata", "baby",
           "sanggol", "bcg", "hepa", "pentavalent", "mmr", "opv", "pcv"],
    roles: ALL,
    short: "Dalawang daan: sa Forms, o sa loob mismo ng pasyente.",
    steps: [
      "Buksan ang <b>Forms</b> sa kaliwang gilid.",
      "Sa <b>💉 Immunization card</b>, hanapin ang pasyente sa pangalan o numero.",
      "Pindutin ang <b>Open card</b>.",
      "Pwede rin: buksan ang pasyente, tapos <b>Immunization card</b> sa loob.",
    ],
    go: { href: "/forms", label: "Buksan ang Forms" },
  },
  {
    id: "record-dose",
    q: "Paano itala na naturukan na ang bata?",
    qEn: "How do I record a vaccine dose that was given?",
    tags: ["Bakuna"],
    keys: ["itala", "tala", "record", "naturukan", "turok", "nabigay", "bigay",
           "given", "dose", "bakuna", "vaccine", "lagay", "maglagay", "add",
           "dagdag", "nagawa", "done"],
    roles: ALL,
    short: "Sa immunization card ng bata, may butas para sa bawat dose. Pindutin lang ang walang laman.",
    steps: [
      "Buksan ang immunization card ng bata (tignan ang \"Saan ang immunization card?\").",
      "Hanapin ang bakuna at ang dose na binigay.",
      "Pindutin ang walang lamang butas para sa dose na iyon.",
      "Ilagay ang petsa at kung may remarks, tapos <b>Save</b>.",
    ],
    go: { href: "/forms", label: "Buksan ang Forms" },
  },
  {
    id: "prenatal",
    q: "Saan ang prenatal record ng buntis?",
    qEn: "Where is the prenatal record?",
    tags: ["Prenatal", "Forms"],
    keys: ["prenatal", "buntis", "nagbubuntis", "pregnant", "pagbubuntis",
           "record", "lmp", "edd", "panganganak", "tetanus", "checkup",
           "saan", "asan", "form", "ina", "nanay"],
    roles: ALL,
    short: "Nasa Forms din, sa ilalim ng immunization card. Babaeng pasyente lang ang lalabas.",
    steps: [
      "Buksan ang <b>Forms</b>.",
      "Sa <b>🤰 Pre-natal record</b>, hanapin ang pasyente.",
      "Pindutin ang <b>Open record</b>.",
      "Kung wala pa siyang record, may pagpipilian doon na gumawa ng bago.",
    ],
    go: { href: "/forms", label: "Buksan ang Forms" },
  },
  {
    id: "prenatal-visit",
    q: "Paano magdagdag ng follow-up visit sa prenatal?",
    qEn: "How do I add a prenatal follow-up visit?",
    tags: ["Prenatal"],
    keys: ["followup", "follow", "visit", "balik", "bumalik", "checkup",
           "prenatal", "buntis", "dagdag", "add", "bagong", "konsulta"],
    roles: ALL,
    short: "Sa loob ng prenatal record, may listahan ng visits at may pindutan para magdagdag.",
    steps: [
      "Buksan ang prenatal record ng pasyente sa <b>Forms</b>.",
      "Mag-scroll pababa sa bahagi ng mga visit.",
      "Pindutin ang pindutan para magdagdag ng bagong visit.",
      "Ilagay ang petsa, timbang, blood pressure, at anumang napansin. Tapos <b>Save</b>.",
    ],
    go: { href: "/forms", label: "Buksan ang Forms" },
  },
  {
    id: "family-planning",
    q: "Saan ang family planning?",
    qEn: "Where is the family planning record?",
    tags: ["Forms"],
    keys: ["family", "planning", "fp", "pamilya", "pagpaplano", "kontrasepsyon",
           "contraceptive", "pills", "condom", "injectable", "dfa", "acceptor",
           "saan", "asan"],
    roles: ALL,
    short: "Hindi siya per-patient na form. Listahan siya ng lahat ng nabigyan, at galing sa Inventory.",
    steps: [
      "Hindi mo siya pinupunan nang mag-isa — nabubuo siya tuwing may naibigay na family planning na gamit sa <b>Inventory</b>.",
      "Para makita ang listahan, buksan ang <b>Forms</b>, tapos <b>Open the report</b> sa Family planning.",
      "Kaya ang paraan para makadagdag doon ay i-dispense ang commodity sa Inventory.",
    ],
    go: { href: "/forms", label: "Buksan ang Forms" },
  },

  // ---- Consultations -------------------------------------------------------
  {
    id: "consultation",
    q: "Paano itala ang konsulta at sakit ng pasyente?",
    qEn: "How do I record a consultation or diagnosis?",
    tags: ["Konsulta"],
    keys: ["konsulta", "consultation", "visit", "sakit", "sakitan", "diagnosis",
           "reklamo", "complaint", "lagnat", "ubo", "sipon", "trangkaso", "flu",
           "fever", "itala", "record", "tala", "check", "checkup"],
    roles: CLINICAL,
    short: "Sa loob ng pasyente, may Consultations. Dito rin galing ang seasonal trend report.",
    steps: [
      "Buksan ang pasyente sa <b>Patients</b>.",
      "Hanapin ang <b>Consultations</b> na bahagi.",
      "Pindutin ang pindutan para magtala ng bagong konsulta.",
      "Piliin ang uri ng sakit sa listahan — mahalaga ito, dito nakabase ang seasonal trend report.",
      "Pwede ka pa ring magsulat ng sarili mong diagnosis sa tabi nito. Tapos <b>Save</b>.",
    ],
    go: { href: "/patients", label: "Buksan ang Patients" },
  },

  // ---- Inventory -----------------------------------------------------------
  {
    id: "add-medicine",
    q: "Paano magdagdag ng gamot sa stock?",
    qEn: "How do I add a medicine to the inventory?",
    tags: ["Gamot"],
    keys: ["gamot", "medicine", "medisina", "stock", "supply", "dagdag",
           "magdagdag", "add", "bago", "new", "lagay", "maglagay", "pasok",
           "deliver", "dating", "inventory", "imbentaryo"],
    roles: ALL,
    short: "Inventory → + Add medicine.",
    steps: [
      "Buksan ang <b>Inventory</b> sa kaliwang gilid.",
      "Pindutin ang <b>+ Add medicine</b>.",
      "Ilagay ang pangalan, dami, at expiry date.",
      "Ilagay din ang <b>low stock threshold</b> — kapag bumaba sa bilang na ito, sasabihan ka ng kampana. Sampu ang default.",
      "Pindutin ang <b>Save</b>.",
    ],
    go: { href: "/inventory/new", label: "Buksan ang Add medicine" },
  },
  {
    id: "dispense",
    q: "Paano ibigay o i-dispense ang gamot sa pasyente?",
    qEn: "How do I dispense medicine to a patient?",
    tags: ["Gamot"],
    keys: ["dispense", "bigay", "ibigay", "magbigay", "kuha", "labas", "give",
           "gamot", "medicine", "pasyente", "patient", "bawas", "release"],
    roles: ALL,
    short: "Inventory → Dispense. Kusang babawas sa stock, hindi mo na kailangang bawasan mano-mano.",
    steps: [
      "Buksan ang <b>Inventory</b>.",
      "Pindutin ang pindutan para mag-dispense.",
      "Piliin ang gamot at ang pasyente, at ilagay ang dami.",
      "Pindutin ang <b>Save</b>. Awtomatikong bababa ang stock.",
    ],
    go: { href: "/inventory/dispense/new", label: "Buksan ang Dispense" },
  },
  {
    id: "low-stock",
    q: "Kailan lumalabas ang babala na paubos na ang gamot?",
    qEn: "When does the low stock warning appear?",
    tags: ["Gamot"],
    keys: ["low", "stock", "paubos", "kaunti", "konti", "ubos", "kulang",
           "warning", "babala", "alert", "kampana", "bell", "threshold",
           "ilan", "ilang", "kailan", "gamot", "medicine"],
    roles: ALL,
    short: "May sariling threshold ang bawat gamot. Default ay 10, at pwede mong palitan.",
    steps: [
      "Hindi iisang bilang para sa lahat — may sariling <b>low stock threshold</b> ang bawat gamot.",
      "Sampu ang default. Ibig sabihin, kapag bumaba sa 10 ang stock, may babala.",
      "Para palitan: buksan ang gamot sa <b>Inventory</b>, pindutin ang <b>Edit</b>, ayusin ang bilang.",
      "Mas mataas na bilang para sa gamot na mabilis maubos, mas mababa para sa bihirang gamitin.",
    ],
    go: { href: "/inventory", label: "Buksan ang Inventory" },
  },

  // ---- Portal accounts -----------------------------------------------------
  {
    id: "portal-account",
    q: "Paano bigyan ng account ang pasyente para makita niya ang record niya?",
    qEn: "How do I create a patient portal account?",
    tags: ["Portal"],
    keys: ["portal", "account", "akawnt", "gumawa", "gawa", "create", "bigay",
           "pasyente", "patient", "password", "login", "signin", "makita",
           "sarili", "cellphone", "phone", "online"],
    roles: ALL,
    short: "Buksan ang pasyente, tapos Create account. Kailangan ng valid ID — o markahang unverified.",
    steps: [
      "Buksan ang pasyente sa <b>Patients</b>.",
      "Pindutin ang <b>Create account</b>.",
      "Ilagay ang username, at piliin kung anong ID ang ipinakita niya.",
      "Kung walang dalang ID, piliin ang <b>No ID on hand</b> — mabubuo pa rin ang account, unverified lang siya at pwedeng ayusin mamaya.",
      "Ibigay sa pasyente ang username at pansamantalang password.",
    ],
    go: { href: "/portal-accounts", label: "Buksan ang Portal accounts" },
  },
  {
    id: "patient-forgot-password",
    q: "Nakalimutan ng pasyente ang password niya. Ano ang gagawin?",
    qEn: "The patient forgot their portal password. What now?",
    tags: ["Portal"],
    keys: ["nakalimutan", "limot", "forgot", "password", "reset", "palit",
           "bago", "hindi", "makapasok", "login", "pasok", "locked", "pasyente",
           "patient", "email"],
    roles: ALL,
    short: "May \"Forgot password\" sa portal login page — padadalhan siya ng link sa email.",
    steps: [
      "Sabihin sa pasyente na pindutin ang <b>Forgot password</b> sa portal sign-in page.",
      "Ilalagay niya ang email niya, at magpapadala ang sistema ng link.",
      "Kung dalawa ang gumagamit ng isang email, may sariling nakapangalang link ang bawat isa — piliin niya ang sa kanya.",
      "Kung walang email ang pasyente, ikaw ang pwedeng mag-reset ng password niya sa <b>Portal accounts</b>.",
    ],
    go: { href: "/portal-accounts", label: "Buksan ang Portal accounts" },
  },
  {
    id: "reminder-channel",
    q: "Paano ko papiliin kung paano paaalalahanan ang pasyente?",
    qEn: "How do I set how a patient gets reminders?",
    tags: ["Portal", "Paalala"],
    keys: ["paalala", "reminder", "alala", "paalalahanan", "notify", "abiso",
           "email", "sms", "text", "channel", "paano", "piliin", "setting",
           "hindi", "tumatanggap"],
    roles: ALL,
    short: "Nasa form na mismo ng pasyente ang setting na ito — hindi sa emergency contact.",
    steps: [
      "Buksan ang pasyente, pindutin ang <b>Edit</b>.",
      "Hanapin ang <b>How to remind this patient</b>, katabi ng sarili niyang email at numero.",
      "Piliin: email, SMS, pareho, o wala.",
      "Kung <b>wala</b> ang nakapili, walang aabot sa kanya kahit tama ang email niya. Ito ang unang tignan kapag may nagreklamong walang natatanggap.",
    ],
    go: { href: "/patients", label: "Buksan ang Patients" },
  },

  // ---- Reports -------------------------------------------------------------
  {
    id: "reports",
    q: "Saan ang mga report?",
    qEn: "Where are the reports?",
    tags: ["Ulat"],
    keys: ["report", "ulat", "reports", "datos", "data", "bilang", "statistics",
           "estadistika", "saan", "asan", "attendance", "graph", "chart",
           "tsart", "buod", "summary"],
    roles: REPORTS,
    short: "Reports sa kaliwang gilid. Walong report, naka-tab sa taas.",
    steps: [
      "Buksan ang <b>Reports</b> sa kaliwang gilid.",
      "Piliin ang tab: Attendance, No-shows, Seasonal trend, Inventory, Consumption, Senior citizen, Family planning, o Analytics.",
      "Palitan ang panahon sa taas. Dala-dala ang piniling panahon kahit magpalit ka ng tab.",
    ],
    go: { href: "/reports/attendance", label: "Buksan ang Reports" },
  },
  {
    id: "seasonal-trend",
    q: "Saan makikita kung anong sakit ang uso ngayong panahon?",
    qEn: "Where do I see the seasonal illness trend?",
    tags: ["Ulat"],
    keys: ["seasonal", "trend", "panahon", "season", "sakit", "illness", "uso",
           "dami", "lagnat", "trangkaso", "flu", "fever", "ubo", "tag-ulan",
           "tag-lamig", "malamig", "buwan", "month", "chart", "graph"],
    roles: REPORTS,
    short: "Reports → Seasonal trend. Galing siya sa uri ng sakit na tinala sa mga konsulta.",
    steps: [
      "Buksan ang <b>Reports</b>, tapos ang <b>Seasonal trend</b> na tab.",
      "May dalawang bahagi: dami ng dumalaw bawat buwan, at kung anong sakit ang dala nila.",
      "Kung walang laman ang chart ng sakit, ibig sabihin walang natalang konsulta — tignan ang \"Paano itala ang konsulta\".",
    ],
    go: { href: "/reports/trend", label: "Buksan ang Seasonal trend" },
  },
  {
    id: "export-pdf",
    q: "Paano mag-print o mag-PDF ng record?",
    qEn: "How do I print or export a record as PDF?",
    tags: ["Ulat"],
    keys: ["print", "printer", "iprint", "pdf", "export", "papel", "paper",
           "kopya", "copy", "download", "labas", "ilabas", "record", "card"],
    roles: ALL,
    short: "May Export PDF sa loob ng record ng pasyente at sa immunization at prenatal card.",
    steps: [
      "Buksan ang record na gusto mong i-print — ang pasyente, ang immunization card, o ang prenatal record.",
      "Pindutin ang <b>Export PDF</b>.",
      "Mabubuksan ang PDF. Mula doon, pwede mo nang i-print.",
    ],
    go: { href: "/patients", label: "Buksan ang Patients" },
  },

  // ---- Account / staff -----------------------------------------------------
  {
    id: "my-password",
    // The title leads with "nakalimutan" on purpose. Somebody typing
    // "nakalimutan ko password ko" is a staff member talking about their own —
    // but "ko" is a grammar word the search strips, so the query arrived with
    // no ownership signal at all and the patient's version won it. Putting the
    // word in the title where it belongs settles it, and it is the more natural
    // question anyway: nobody opens this to change a password they remember.
    q: "Nakalimutan ko ang password ko. Paano ko papalitan?",
    qEn: "I forgot my own password — how do I change it?",
    tags: ["Account"],
    keys: ["password", "palit", "palitan", "baguhin", "change", "sarili",
           "akin", "sakin", "own", "mine", "account", "profile", "setting",
           "bago", "nakalimutan", "limot", "forgot"],
    roles: ALL,
    short: "Pindutin ang pangalan mo sa kanang taas, tapos Account.",
    steps: [
      "Pindutin ang pangalan mo sa kanang taas ng screen.",
      "Piliin ang <b>Account</b>.",
      "Ilagay ang luma mong password, tapos ang bago, tapos <b>Save</b>.",
      "Masi-sign out ka sa ibang browser kapag napalitan mo ito. Normal lang iyon.",
    ],
    go: { href: "/account", label: "Buksan ang Account" },
  },
  {
    id: "locked-out",
    q: "Hindi ako makapasok. Sabi may masyadong maraming beses akong nagkamali.",
    qEn: "I am locked out of my account after failed sign-ins.",
    tags: ["Account"],
    keys: ["locked", "lock", "hindi", "makapasok", "pasok", "login", "signin",
           "sarado", "naka-lock", "mali", "nagkamali", "failed", "attempt",
           "maghintay", "hintay", "password", "blocked"],
    roles: ALL,
    short: "Limang maling password ang limit. Kusa itong bubukas — hindi mo kailangan ng admin.",
    steps: [
      "Maghintay ng ilang minuto. Kusang mawawala ang lock, walang kailangang tumawag.",
      "Ang username mo lang ang naka-lock, hindi ang buong klinika. Makakapasok pa rin ang iba.",
      "Kapag nakapasok ka na, babalik sa zero ang bilang.",
      "Kung talagang nakalimutan mo na, humingi ng bagong password sa admin.",
    ],
    go: null,
  },
  {
    id: "signed-out",
    q: "Bigla akong na-sign out. Bakit?",
    qEn: "Why was I suddenly signed out?",
    tags: ["Account"],
    keys: ["signout", "sign", "out", "logout", "nalabas", "lumabas", "bigla",
           "biglang", "bakit", "session", "natapos", "expired", "iba",
           "ibang", "gamit"],
    roles: ALL,
    short: "Isang tao lang kada account. Kapag may pumasok sa account mo sa ibang computer, dito ka mapapalabas.",
    steps: [
      "Sinasabi ng sistema kung bakit sa sign-in page — basahin mo ang mensahe doon.",
      "Kadalasan: may ibang pumasok sa parehong account sa ibang computer.",
      "Kung ikaw ang huling gumamit, ibig sabihin may iba pang gumagamit ng account mo. Humingi ng sarili mong account sa admin.",
      "Pwede rin: napalitan ang password mo, o hindi na aktibo ang account mo.",
    ],
    go: null,
  },
  {
    id: "add-staff",
    q: "Paano magdagdag ng bagong staff account?",
    qEn: "How do I add a new staff account?",
    tags: ["Staff"],
    keys: ["staff", "kawani", "user", "account", "dagdag", "magdagdag", "add",
           "bago", "new", "nurse", "admin", "facilitator", "recorder", "role",
           "tungkulin", "empleyado"],
    roles: ADMIN,
    short: "Staff accounts sa ibaba ng kaliwang gilid. Admin lang ang makakagawa nito.",
    steps: [
      "Pindutin ang gear na icon sa ibaba ng kaliwang gilid — <b>Staff accounts</b> iyon.",
      "Pindutin ang <b>+ Add staff</b>.",
      "Ilagay ang buong pangalan, username, at piliin ang role.",
      "Isang tao, isang account. Kapag pinaghatian ng tatlo ang isang account, hindi na masasabi ng talaan kung sino ang gumawa ng ano.",
    ],
    go: { href: "/admin/users/new", label: "Buksan ang Add staff" },
  },
  {
    id: "roles",
    q: "Ano ang pagkakaiba ng mga role?",
    qEn: "What is the difference between the staff roles?",
    tags: ["Staff"],
    keys: ["role", "tungkulin", "pagkakaiba", "iba", "difference", "admin",
           "nurse", "facilitator", "recorder", "doktor", "doctor", "ano",
           "kaya", "pwede", "permission", "access"],
    roles: ADMIN,
    short: "Apat na role. Walang doktor — walang doktor sa klinikang ito.",
    steps: [
      "<b>Admin</b> — lahat, kasama ang staff accounts, reminders, at audit log.",
      "<b>Nurse</b> — pasyente, appointment, forms, gamot, konsulta, at reports.",
      "<b>Recorder</b> — pasyente, appointment, forms, gamot, at reports. Walang konsulta.",
      "<b>Facilitator</b> — pasyente, appointment, forms, at gamot. Walang reports.",
      "Wala nang doktor na role. Tinanggal ito dahil walang doktor sa klinika.",
    ],
    go: { href: "/admin/users", label: "Buksan ang Staff accounts" },
  },
  {
    id: "audit-log",
    q: "Paano ko makikita kung sino ang gumawa ng isang bagay?",
    qEn: "How do I see who did what — the audit log?",
    tags: ["Staff"],
    keys: ["audit", "log", "talaan", "history", "kasaysayan", "sino", "who",
           "gumawa", "ginawa", "nagbago", "binago", "nagpalit", "track",
           "record", "bakas", "trace"],
    roles: ADMIN,
    short: "May audit log na nagtatala ng bawat mahalagang galaw. Admin lang ang makakakita.",
    steps: [
      "Buksan ang <b>Staff accounts</b> (gear icon sa ibaba).",
      "Hanapin ang link papuntang <b>Audit log</b>.",
      "Bawat linya: sino, ano ang ginawa, kanino, at kailan.",
      "Naitatala din dito ang pagpasok sa portal ng pasyente — walang staff na pangalan doon, dahil hindi naman staff ang gumawa.",
    ],
    go: { href: "/admin/audit-log", label: "Buksan ang Audit log" },
  },
  {
    id: "reminders",
    q: "Kailan pinapadala ang mga paalala?",
    qEn: "When are appointment reminders sent?",
    tags: ["Paalala"],
    keys: ["paalala", "reminder", "kailan", "when", "padala", "ipadala", "send",
           "email", "sms", "text", "oras", "time", "araw", "automatic", "cron",
           "bago", "before"],
    roles: ADMIN,
    short: "Alas-9 ng umaga araw-araw, isang araw bago ang appointment.",
    steps: [
      "Tumatakbo ang sistema tuwing alas-9 ng umaga, oras ng Pilipinas.",
      "Pinapadalhan niya ang may appointment <b>bukas</b>.",
      "Email lang ang gumagana ngayon. Wala pa tayong SMS — hinihintay pa ang PhilSMS.",
      "Sa <b>Reminders</b> makikita ang bawat naipadala, at kung may nabigo.",
    ],
    go: { href: "/reminders", label: "Buksan ang Reminders" },
  },
];

module.exports = { ENTRIES, ALL, REPORTS, CLINICAL, ADMIN };

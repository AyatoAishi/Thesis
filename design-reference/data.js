/* ============================================================
   Sample data — Barangay Sampaguita Health Clinic
   Fictional patients & records (Quezon City context)
   ============================================================ */
window.CLINIC = {
  today: { label: "Thursday, June 11, 2026", dayName: "Thursday", service: "Prenatal Check-ups", code: "PRENATAL" },

  schedule: [
    { day: "Mon", svc: "Consultation & Maintenance" },
    { day: "Tue", svc: "Immunization" },
    { day: "Wed", svc: "Consultation & Maintenance" },
    { day: "Thu", svc: "Prenatal Check-ups" },
    { day: "Fri", svc: "Consultation & Maintenance" },
  ],

  staff: { name: "Nrs. Elena Marquez", role: "Head Nurse", initials: "EM", color: "#3b6cf5" },

  notifications: [
    { type: "stock", title: "Low stock: Ferrous Sulfate + Folic Acid", detail: "42 tablets left · below 100 reorder point", time: "20m ago", tone: "bad" },
    { type: "stock", title: "Low stock: Tetanus Toxoid vials", detail: "6 vials left · Immunization Tue", time: "1h ago", tone: "warn" },
    { type: "system", title: "12 patients scheduled today", detail: "Prenatal clinic · Thursday rotation", time: "2h ago", tone: "info" },
    { type: "system", title: "Amoxicillin 500mg expiring soon", detail: "Lot #A-2291 expires Jul 2026", time: "Yesterday", tone: "warn" },
  ],

  // service swatch colors
  svcColor: {
    PRENATAL: { bg: "#f0ecfe", ink: "#6b46e0", dot: "#7b5cf0", label: "Prenatal" },
    IMMUNIZATION: { bg: "#e2f3fa", ink: "#1d6f90", dot: "#2c8fb8", label: "Immunization" },
    CONSULT: { bg: "#e9f0fe", ink: "#2c54d6", dot: "#3b6cf5", label: "Consult" },
  },

  patients: [
    /* ---------------- 1. PRENATAL (hero) ---------------- */
    {
      id: "p1", no: "SHC-2024-0417", name: "Maria Clara Dela Cruz", sex: "Female",
      age: 27, dob: "March 14, 1999", color: "#7b5cf0", initials: "MC",
      svc: "PRENATAL", scheduledToday: true, status: "Scheduled",
      registered: "Aug 2, 2024", tag: "MEMBER",
      demo: {
        civil: "Married", address: "12 Sampaguita St., Brgy. Sampaguita, Quezon City",
        contactName: "Roberto Dela Cruz (Husband)", contactNo: "+63 917 845 2210",
        philhealth: "12-345678901-2", category: "Direct Contributor",
        occupation: "Sari-sari store owner", blood: "O+", religion: "Roman Catholic",
        bMonth: "March", patientNo: "SHC-2024-0417",
      },
      prenatal: {
        lmp: "Sept 28, 2025", edd: "July 5, 2026", aog: "37 weeks 2 days", progress: 93,
        gravida: 2, para: 1, riskFlag: "Low risk", trimester: "3rd Trimester",
        visits: [
          { date: "Jun 4, 2026", aog: "36w", bp: "118/76", weight: "62.4 kg", fundal: "34 cm", fht: "146 bpm", presentation: "Cephalic", findings: "Normal. Mild ankle edema noted.", by: "Nrs. Elena Marquez" },
          { date: "May 7, 2026", aog: "32w", bp: "120/78", weight: "60.1 kg", fundal: "31 cm", fht: "148 bpm", presentation: "Cephalic", findings: "Normal progress. Counseled on iron intake.", by: "Dr. Liza Ang" },
          { date: "Apr 9, 2026", aog: "28w", bp: "116/74", weight: "57.8 kg", fundal: "27 cm", fht: "150 bpm", presentation: "Variable", findings: "Glucose screen normal. TT4 given.", by: "Nrs. Elena Marquez" },
          { date: "Feb 12, 2026", aog: "20w", bp: "114/72", weight: "54.0 kg", fundal: "20 cm", fht: "152 bpm", presentation: "—", findings: "Anomaly scan referred to QC General — normal.", by: "Nrs. Elena Marquez" },
        ],
      },
      vitals: [
        { date: "Jun 4, 2026", bp: "118/76", temp: "36.7", hr: "82", rr: "18", weight: "62.4", spo2: "99", note: "Routine prenatal vitals. Patient stable.", by: "Nrs. Elena Marquez" },
        { date: "May 7, 2026", bp: "120/78", temp: "36.5", hr: "78", rr: "17", weight: "60.1", spo2: "99", note: "No complaints. Fetal heart tones normal.", by: "Dr. Liza Ang" },
        { date: "Apr 9, 2026", bp: "116/74", temp: "36.6", hr: "80", rr: "18", weight: "57.8", spo2: "98", note: "Mild fatigue reported, advised rest & hydration.", by: "Nrs. Elena Marquez" },
      ],
      immunizations: [
        { vaccine: "Tetanus Toxoid (TT1)", date: "Nov 6, 2024", dose: "1st", site: "L deltoid", lot: "TT-2289", status: "Completed", by: "Nrs. Elena Marquez" },
        { vaccine: "Tetanus Toxoid (TT2)", date: "Dec 5, 2024", dose: "2nd", site: "L deltoid", lot: "TT-2289", status: "Completed", by: "Nrs. Elena Marquez" },
        { vaccine: "Tetanus Toxoid (TT3)", date: "Jul 10, 2025", dose: "3rd", site: "L deltoid", lot: "TT-2301", status: "Completed", by: "Nrs. Elena Marquez" },
        { vaccine: "Tetanus Toxoid (TT4)", date: "Apr 9, 2026", dose: "4th", site: "R deltoid", lot: "TT-2356", status: "Completed", by: "Nrs. Elena Marquez" },
        { vaccine: "Tetanus Toxoid (TT5)", date: "Due Jun 2027", dose: "5th", site: "—", lot: "—", status: "Scheduled", by: "—" },
      ],
      medications: [
        { drug: "Ferrous Sulfate + Folic Acid", dose: "60mg / 400mcg", freq: "1 tab once daily", qty: "30 tabs", since: "Aug 2024", status: "Active", refill: "Jun 11, 2026", by: "Dr. Liza Ang" },
        { drug: "Calcium Carbonate", dose: "500 mg", freq: "1 tab twice daily", qty: "60 tabs", since: "Feb 2026", status: "Active", refill: "Jun 11, 2026", by: "Dr. Liza Ang" },
        { drug: "Vitamin B-Complex", dose: "—", freq: "1 tab once daily", qty: "30 tabs", since: "Apr 2026", status: "Active", refill: "Jun 11, 2026", by: "Nrs. Elena Marquez" },
      ],
      visitsHistory: [
        { date: "Jun 11, 2026", svc: "PRENATAL", purpose: "Prenatal check-up (37 wks)", status: "Scheduled", by: "—" },
        { date: "Jun 4, 2026", svc: "PRENATAL", purpose: "Prenatal check-up (36 wks)", status: "Completed", by: "Nrs. Elena Marquez" },
        { date: "May 21, 2026", svc: "PRENATAL", purpose: "Prenatal check-up", status: "No-show", by: "—" },
        { date: "May 7, 2026", svc: "PRENATAL", purpose: "Prenatal check-up + meds refill", status: "Completed", by: "Dr. Liza Ang" },
        { date: "Apr 9, 2026", svc: "PRENATAL", purpose: "Prenatal + TT4 immunization", status: "Completed", by: "Nrs. Elena Marquez" },
        { date: "Mar 18, 2026", svc: "CONSULT", purpose: "General consult — cough", status: "Completed", by: "Dr. Liza Ang" },
      ],
    },

    /* ---------------- 2. MAINTENANCE / ELDER ---------------- */
    {
      id: "p2", no: "SHC-2019-0033", name: "Remedios Bautista", sex: "Female",
      age: 64, dob: "January 9, 1962", color: "#3b6cf5", initials: "RB",
      svc: "CONSULT", scheduledToday: false, status: "Active",
      registered: "Jan 15, 2019", tag: "SENIOR",
      demo: {
        civil: "Widowed", address: "8 Ilang-Ilang St., Brgy. Sampaguita, Quezon City",
        contactName: "Grace Bautista (Daughter)", contactNo: "+63 918 220 7741",
        philhealth: "09-887766554-1", category: "Senior Citizen",
        occupation: "Retired", blood: "A+", religion: "Roman Catholic",
        bMonth: "January", patientNo: "SHC-2019-0033",
      },
      prenatal: null,
      vitals: [
        { date: "Jun 5, 2026", bp: "148/92", temp: "36.6", hr: "76", rr: "18", weight: "68.2", spo2: "97", note: "BP elevated. Counseled on low-salt diet & adherence.", by: "Nrs. Elena Marquez" },
        { date: "May 8, 2026", bp: "152/96", temp: "36.7", hr: "80", rr: "19", weight: "68.9", spo2: "97", note: "Reports occasional missed doses. Amlodipine adjusted.", by: "Dr. Liza Ang" },
        { date: "Apr 10, 2026", bp: "144/88", temp: "36.5", hr: "74", rr: "18", weight: "69.1", spo2: "98", note: "Stable. FBS 132 mg/dL.", by: "Nrs. Elena Marquez" },
      ],
      immunizations: [
        { vaccine: "Influenza (Annual)", date: "Oct 14, 2025", dose: "Annual", site: "L deltoid", lot: "FLU-2510", status: "Completed", by: "Nrs. Elena Marquez" },
        { vaccine: "Pneumococcal (PPSV23)", date: "Feb 3, 2025", dose: "Single", site: "R deltoid", lot: "PNE-1188", status: "Completed", by: "Nrs. Elena Marquez" },
        { vaccine: "COVID-19 Booster", date: "Mar 20, 2025", dose: "Booster", site: "L deltoid", lot: "CV-3390", status: "Completed", by: "Dr. Liza Ang" },
      ],
      medications: [
        { drug: "Amlodipine", dose: "10 mg", freq: "1 tab once daily (AM)", qty: "30 tabs", since: "2019", status: "Active", refill: "Jun 19, 2026", by: "Dr. Liza Ang" },
        { drug: "Losartan", dose: "50 mg", freq: "1 tab once daily (PM)", qty: "30 tabs", since: "2021", status: "Active", refill: "Jun 19, 2026", by: "Dr. Liza Ang" },
        { drug: "Metformin", dose: "500 mg", freq: "1 tab twice daily", qty: "60 tabs", since: "2020", status: "Active", refill: "Jun 19, 2026", by: "Dr. Liza Ang" },
        { drug: "Atorvastatin", dose: "20 mg", freq: "1 tab at bedtime", qty: "30 tabs", since: "2022", status: "Active", refill: "Jun 19, 2026", by: "Dr. Liza Ang" },
      ],
      visitsHistory: [
        { date: "Jun 19, 2026", svc: "CONSULT", purpose: "Maintenance meds refill (HTN/DM)", status: "Scheduled", by: "—" },
        { date: "Jun 5, 2026", svc: "CONSULT", purpose: "BP monitoring + refill", status: "Completed", by: "Nrs. Elena Marquez" },
        { date: "May 22, 2026", svc: "CONSULT", purpose: "Maintenance refill", status: "No-show", by: "—" },
        { date: "May 8, 2026", svc: "CONSULT", purpose: "Consultation — dizziness", status: "Completed", by: "Dr. Liza Ang" },
        { date: "Apr 10, 2026", svc: "CONSULT", purpose: "BP + FBS monitoring", status: "Completed", by: "Nrs. Elena Marquez" },
      ],
    },

    /* ---------------- 3. INFANT / IMMUNIZATION ---------------- */
    {
      id: "p3", no: "SHC-2025-0188", name: "Liam Andres Reyes", sex: "Male",
      age: "11 months", dob: "July 2, 2025", color: "#18a571", initials: "LR",
      svc: "IMMUNIZATION", scheduledToday: false, status: "Active",
      registered: "Jul 5, 2025", tag: "INFANT",
      demo: {
        civil: "—", address: "23 Rosal St., Brgy. Sampaguita, Quezon City",
        contactName: "Andrea Reyes (Mother)", contactNo: "+63 920 553 1180",
        philhealth: "11-223344556-3", category: "Dependent",
        occupation: "—", blood: "B+", religion: "Roman Catholic",
        bMonth: "July", patientNo: "SHC-2025-0188",
      },
      prenatal: null,
      vitals: [
        { date: "Jun 3, 2026", bp: "—", temp: "37.0", hr: "118", rr: "32", weight: "9.1", spo2: "99", note: "Well-baby check. Weight & length on track (P50).", by: "Nrs. Elena Marquez" },
        { date: "May 6, 2026", bp: "—", temp: "36.8", hr: "120", rr: "34", weight: "8.7", spo2: "99", note: "Healthy. Mother counseled on complementary feeding.", by: "Nrs. Elena Marquez" },
      ],
      immunizations: [
        { vaccine: "BCG", date: "Jul 5, 2025", dose: "Birth", site: "R arm", lot: "BCG-771", status: "Completed", by: "Nrs. Elena Marquez" },
        { vaccine: "Hepatitis B", date: "Jul 5, 2025", dose: "Birth", site: "R thigh", lot: "HEP-902", status: "Completed", by: "Nrs. Elena Marquez" },
        { vaccine: "Pentavalent (DPT-HepB-Hib)", date: "Sep 8, 2025", dose: "1st", site: "L thigh", lot: "PEN-330", status: "Completed", by: "Nrs. Elena Marquez" },
        { vaccine: "Pentavalent (DPT-HepB-Hib)", date: "Oct 13, 2025", dose: "2nd", site: "L thigh", lot: "PEN-330", status: "Completed", by: "Nrs. Elena Marquez" },
        { vaccine: "Pentavalent (DPT-HepB-Hib)", date: "Nov 17, 2025", dose: "3rd", site: "L thigh", lot: "PEN-345", status: "Completed", by: "Nrs. Elena Marquez" },
        { vaccine: "Oral Polio (OPV)", date: "Nov 17, 2025", dose: "3rd", site: "Oral", lot: "OPV-118", status: "Completed", by: "Nrs. Elena Marquez" },
        { vaccine: "MMR", date: "Jun 16, 2026", dose: "1st", site: "—", lot: "—", status: "Scheduled", by: "—" },
      ],
      medications: [
        { drug: "Vitamin A", dose: "100,000 IU", freq: "Single dose", qty: "1 cap", since: "Jan 2026", status: "Completed", refill: "—", by: "Nrs. Elena Marquez" },
      ],
      visitsHistory: [
        { date: "Jun 16, 2026", svc: "IMMUNIZATION", purpose: "MMR 1st dose (Tue clinic)", status: "Scheduled", by: "—" },
        { date: "Jun 3, 2026", svc: "CONSULT", purpose: "Well-baby check", status: "Completed", by: "Nrs. Elena Marquez" },
        { date: "Nov 17, 2025", svc: "IMMUNIZATION", purpose: "Penta 3 + OPV 3", status: "Completed", by: "Nrs. Elena Marquez" },
        { date: "Oct 13, 2025", svc: "IMMUNIZATION", purpose: "Penta 2 + OPV 2", status: "Completed", by: "Nrs. Elena Marquez" },
      ],
    },

    /* ---------------- 4. PRENATAL (lighter) ---------------- */
    {
      id: "p4", no: "SHC-2026-0061", name: "Angelica Ramos", sex: "Female",
      age: 22, dob: "May 30, 2004", color: "#9a7df6", initials: "AR",
      svc: "PRENATAL", scheduledToday: true, status: "Scheduled",
      registered: "Feb 19, 2026", tag: "MEMBER",
      demo: {
        civil: "Single", address: "5 Gumamela St., Brgy. Sampaguita, Quezon City",
        contactName: "Teresita Ramos (Mother)", contactNo: "+63 915 778 4420",
        philhealth: "—", category: "Indigent (Sponsored)",
        occupation: "Student", blood: "O−", religion: "Roman Catholic",
        bMonth: "May", patientNo: "SHC-2026-0061",
      },
      prenatal: {
        lmp: "Jan 12, 2026", edd: "Oct 19, 2026", aog: "21 weeks", progress: 52,
        gravida: 1, para: 0, riskFlag: "Monitor — primigravida", trimester: "2nd Trimester",
        visits: [
          { date: "Jun 4, 2026", aog: "20w", bp: "110/70", weight: "53.2 kg", fundal: "20 cm", fht: "150 bpm", presentation: "—", findings: "First fetal movements felt. Normal.", by: "Nrs. Elena Marquez" },
          { date: "May 7, 2026", aog: "16w", bp: "108/68", weight: "51.8 kg", fundal: "16 cm", fht: "152 bpm", presentation: "—", findings: "Booking visit. Labs requested.", by: "Nrs. Elena Marquez" },
        ],
      },
      vitals: [
        { date: "Jun 4, 2026", bp: "110/70", temp: "36.6", hr: "76", rr: "17", weight: "53.2", spo2: "99", note: "Stable. Mild nausea resolving.", by: "Nrs. Elena Marquez" },
      ],
      immunizations: [
        { vaccine: "Tetanus Toxoid (TT1)", date: "May 7, 2026", dose: "1st", site: "L deltoid", lot: "TT-2356", status: "Completed", by: "Nrs. Elena Marquez" },
        { vaccine: "Tetanus Toxoid (TT2)", date: "Jun 11, 2026", dose: "2nd", site: "—", lot: "—", status: "Scheduled", by: "—" },
      ],
      medications: [
        { drug: "Ferrous Sulfate + Folic Acid", dose: "60mg / 400mcg", freq: "1 tab once daily", qty: "30 tabs", since: "May 2026", status: "Active", refill: "Jun 11, 2026", by: "Nrs. Elena Marquez" },
      ],
      visitsHistory: [
        { date: "Jun 11, 2026", svc: "PRENATAL", purpose: "Prenatal check-up (21 wks)", status: "Scheduled", by: "—" },
        { date: "Jun 4, 2026", svc: "PRENATAL", purpose: "Prenatal check-up (20 wks)", status: "Completed", by: "Nrs. Elena Marquez" },
        { date: "May 7, 2026", svc: "PRENATAL", purpose: "Booking visit + TT1", status: "Completed", by: "Nrs. Elena Marquez" },
      ],
    },

    /* ---------------- 5. CONSULT (light) ---------------- */
    {
      id: "p5", no: "SHC-2022-0241", name: "Jose Rizalino Mendoza", sex: "Male",
      age: 45, dob: "December 1, 1980", color: "#2c8fb8", initials: "JM",
      svc: "CONSULT", scheduledToday: false, status: "Active",
      registered: "Jun 3, 2022", tag: "MEMBER",
      demo: {
        civil: "Married", address: "31 Camia St., Brgy. Sampaguita, Quezon City",
        contactName: "Marites Mendoza (Wife)", contactNo: "+63 917 332 9087",
        philhealth: "10-556677889-0", category: "Direct Contributor",
        occupation: "Tricycle driver", blood: "AB+", religion: "Roman Catholic",
        bMonth: "December", patientNo: "SHC-2022-0241",
      },
      prenatal: null,
      vitals: [
        { date: "Jun 6, 2026", bp: "134/86", temp: "37.4", hr: "88", rr: "20", weight: "74.5", spo2: "98", note: "Productive cough x3 days. Started on antibiotics.", by: "Dr. Liza Ang" },
      ],
      immunizations: [
        { vaccine: "Tetanus Toxoid (Booster)", date: "Aug 2, 2024", dose: "Booster", site: "L deltoid", lot: "TT-2210", status: "Completed", by: "Nrs. Elena Marquez" },
      ],
      medications: [
        { drug: "Amoxicillin", dose: "500 mg", freq: "1 cap 3x daily x7 days", qty: "21 caps", since: "Jun 2026", status: "Active", refill: "—", by: "Dr. Liza Ang" },
        { drug: "Paracetamol", dose: "500 mg", freq: "1 tab every 6h PRN fever", qty: "20 tabs", since: "Jun 2026", status: "Active", refill: "—", by: "Dr. Liza Ang" },
      ],
      visitsHistory: [
        { date: "Jun 6, 2026", svc: "CONSULT", purpose: "Consult — cough & fever", status: "Completed", by: "Dr. Liza Ang" },
        { date: "Jan 14, 2026", svc: "CONSULT", purpose: "Annual check-up", status: "Completed", by: "Nrs. Elena Marquez" },
      ],
    },

    /* ---------------- 6-8 queue-only (basic, empty-state demos) ---------------- */
    {
      id: "p6", no: "SHC-2023-0150", name: "Norma Villanueva", sex: "Female",
      age: 58, dob: "September 21, 1967", color: "#e0a21a", initials: "NV",
      svc: "CONSULT", scheduledToday: false, status: "Active", registered: "Apr 11, 2023", tag: "SENIOR",
      demo: { civil: "Married", address: "17 Dahlia St., Brgy. Sampaguita, Quezon City", contactName: "Pedro Villanueva (Husband)", contactNo: "+63 919 442 1100", philhealth: "08-112233445-6", category: "Senior Citizen", occupation: "Vendor", blood: "O+", religion: "Roman Catholic", bMonth: "September", patientNo: "SHC-2023-0150" },
      prenatal: null,
      vitals: [ { date: "Jun 6, 2026", bp: "138/84", temp: "36.5", hr: "78", rr: "18", weight: "63.0", spo2: "98", note: "BP borderline. Lifestyle counseling given.", by: "Nrs. Elena Marquez" } ],
      immunizations: [], medications: [],
      visitsHistory: [ { date: "Jun 6, 2026", svc: "CONSULT", purpose: "BP screening", status: "Completed", by: "Nrs. Elena Marquez" } ],
    },
    {
      id: "p7", no: "SHC-2026-0077", name: "Sofia Castillo", sex: "Female",
      age: 30, dob: "February 8, 1996", color: "#7b5cf0", initials: "SC",
      svc: "PRENATAL", scheduledToday: true, status: "Scheduled", registered: "Mar 2, 2026", tag: "MEMBER",
      demo: { civil: "Married", address: "9 Sampaguita St., Brgy. Sampaguita, Quezon City", contactName: "Mark Castillo (Husband)", contactNo: "+63 916 220 8841", philhealth: "12-998877665-4", category: "Direct Contributor", occupation: "Teacher", blood: "A−", religion: "Roman Catholic", bMonth: "February", patientNo: "SHC-2026-0077" },
      prenatal: { lmp: "Feb 20, 2026", edd: "Nov 27, 2026", aog: "15 weeks", progress: 37, gravida: 3, para: 2, riskFlag: "Low risk", trimester: "2nd Trimester", visits: [ { date: "Jun 4, 2026", aog: "15w", bp: "112/72", weight: "58.0 kg", fundal: "—", fht: "154 bpm", presentation: "—", findings: "Booking visit. Doing well.", by: "Nrs. Elena Marquez" } ] },
      vitals: [ { date: "Jun 4, 2026", bp: "112/72", temp: "36.6", hr: "74", rr: "17", weight: "58.0", spo2: "99", note: "Booking vitals normal.", by: "Nrs. Elena Marquez" } ],
      immunizations: [], medications: [],
      visitsHistory: [ { date: "Jun 11, 2026", svc: "PRENATAL", purpose: "Prenatal check-up", status: "Scheduled", by: "—" }, { date: "Jun 4, 2026", svc: "PRENATAL", purpose: "Booking visit", status: "Completed", by: "Nrs. Elena Marquez" } ],
    },
    {
      id: "p8", no: "SHC-2025-0203", name: "Mateo Cruz", sex: "Male",
      age: "2 years", dob: "April 18, 2024", color: "#18a571", initials: "MC",
      svc: "IMMUNIZATION", scheduledToday: false, status: "Active", registered: "Apr 20, 2024", tag: "CHILD",
      demo: { civil: "—", address: "44 Rosal St., Brgy. Sampaguita, Quezon City", contactName: "Liza Cruz (Mother)", contactNo: "+63 921 776 5520", philhealth: "11-665544332-1", category: "Dependent", occupation: "—", blood: "O+", religion: "Roman Catholic", bMonth: "April", patientNo: "SHC-2025-0203" },
      prenatal: null,
      vitals: [ { date: "May 6, 2026", bp: "—", temp: "36.9", hr: "108", rr: "26", weight: "12.4", spo2: "99", note: "Healthy toddler. Growth on track.", by: "Nrs. Elena Marquez" } ],
      immunizations: [ { vaccine: "Measles, Mumps, Rubella (MMR)", date: "May 6, 2026", dose: "2nd", site: "L arm", lot: "MMR-220", status: "Completed", by: "Nrs. Elena Marquez" } ],
      medications: [],
      visitsHistory: [ { date: "May 6, 2026", svc: "IMMUNIZATION", purpose: "MMR 2nd dose", status: "Completed", by: "Nrs. Elena Marquez" } ],
    },
  ],
};

// ============================================================================
// db/seed-demo.js — realistic demo data for showing off the finished app
// (thesis defense, panel walkthroughs, screenshots). Safe to re-run: each
// section checks for existing rows (by name) before inserting, so running
// this twice does not create duplicates.
//
// Run:  npm run seed:demo
//
// SAFETY NOTE: every seeded email uses @example.com — the domain reserved by
// IANA specifically for documentation/examples, guaranteed to never deliver
// to a real inbox. This matters because SMTP is LIVE in this project (M4.5) —
// a made-up @gmail.com address here could otherwise really receive mail once
// a seeded "scheduled" appointment's date rolls around and the daily reminder
// cron fires. SMS is still in simulation (no SEMAPHORE_API_KEY), so the phone
// numbers below carry no equivalent risk today — but if SMS ever goes live,
// revisit these before then.
// ============================================================================
require("dotenv").config();
const bcrypt = require("bcryptjs");
const db = require("./index");
const F = require("../lib/format");

const DOW = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

function onOrAfter(dateStr, targetDow) {
  let d = dateStr;
  for (let i = 0; i < 14; i++) {
    if (F.weekdayOf(d) === targetDow) return d;
    d = F.addDays(d, 1);
  }
  return dateStr;
}
function weeksAgoOn(dateStr, targetDow, weeks) {
  let d = F.addDays(dateStr, -7 * weeks);
  for (let i = 0; i < 7; i++) {
    if (F.weekdayOf(d) === targetDow) return d;
    d = F.addDays(d, -1);
  }
  return d;
}

async function nextPatientNumber() {
  const year = new Date().getFullYear();
  const prefix = `SAMP-${year}-`;
  const { rows } = await db.query(
    `SELECT patient_number FROM patients WHERE patient_number LIKE $1 ORDER BY patient_number DESC LIMIT 1`,
    [prefix + "%"]
  );
  let n = 1;
  if (rows[0]) {
    const tail = parseInt(rows[0].patient_number.split("-").pop(), 10);
    if (!Number.isNaN(tail)) n = tail + 1;
  }
  return prefix + String(n).padStart(4, "0");
}

async function findOrCreatePatient(p) {
  const existing = await db.query("SELECT patient_id FROM patients WHERE full_name=$1", [p.full_name]);
  if (existing.rows[0]) return { id: existing.rows[0].patient_id, created: false };
  const patient_number = await nextPatientNumber();
  const ins = await db.query(
    `INSERT INTO patients
       (patient_number, full_name, birthdate, sex, address, contact_number, email,
        family_contact_name, family_contact_relation, family_contact_number, family_email,
        is_minor, guardian_name, guardian_consent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING patient_id`,
    [
      patient_number, p.full_name, p.birthdate, p.sex, p.address, p.contact_number || null, p.email || null,
      p.family_contact_name || null, p.family_contact_relation || null, p.family_contact_number || null, p.family_email || null,
      Boolean(p.is_minor), p.guardian_name || null, Boolean(p.guardian_consent),
    ]
  );
  return { id: ins.rows[0].patient_id, created: true };
}

async function findOrCreateMedicine(m) {
  const existing = await db.query("SELECT medicine_id FROM medicines WHERE name=$1", [m.name]);
  if (existing.rows[0]) return { id: existing.rows[0].medicine_id, created: false };
  const ins = await db.query(
    `INSERT INTO medicines (name, description, unit, stock_quantity, low_stock_threshold, source, requires_doctor_approval)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING medicine_id`,
    [m.name, m.description || null, m.unit, m.stock_quantity, m.low_stock_threshold, m.source, Boolean(m.requires_doctor_approval)]
  );
  return { id: ins.rows[0].medicine_id, created: true };
}

(async () => {
  try {
    const today = F.manilaToday();

    // ---- 1) staff, across every role (mirrors the Claude Design prototype's
    // clinic staff characters) ------------------------------------------------
    const hash = await bcrypt.hash("Demo1234!", 10);
    const staff = [
      { full_name: "Elena Marquez", username: "elena.marquez", role: "nurse" },
      { full_name: "Liza Ang", username: "liza.ang", role: "doctor" },
      { full_name: "Carmela Ibarra", username: "carmela.ibarra", role: "recorder" },
      { full_name: "Ramon Suarez", username: "ramon.suarez", role: "facilitator" },
    ];
    for (const s of staff) {
      await db.query(
        `INSERT INTO users (full_name, username, password_hash, role, status)
         VALUES ($1,$2,$3,$4,'active')
         ON CONFLICT (username) DO NOTHING`,
        [s.full_name, s.username, hash, s.role]
      );
    }
    const doctorId = (await db.query("SELECT user_id FROM users WHERE username='liza.ang'")).rows[0].user_id;
    const nurseId = (await db.query("SELECT user_id FROM users WHERE username='elena.marquez'")).rows[0].user_id;
    console.log(`  ✓ Staff ready: ${staff.map((s) => s.username).join(", ")} (password: Demo1234!)`);

    // ---- 2) patients ---------------------------------------------------------
    const patientDefs = [
      { full_name: "Maria Clara Dela Cruz", birthdate: "1999-03-14", sex: "female",
        address: "12 Sampaguita St., Brgy. Sampaguita, Quezon City",
        contact_number: "09178452210", email: "mariaclara.delacruz@example.com",
        family_contact_name: "Roberto Dela Cruz", family_contact_relation: "Husband", family_contact_number: "09178452211" },
      { full_name: "Remedios Bautista", birthdate: "1962-01-09", sex: "female",
        address: "8 Ilang-Ilang St., Brgy. Sampaguita, Quezon City",
        // no phone/email of her own — relies entirely on the family fallback (demonstrates that path)
        family_contact_name: "Grace Bautista", family_contact_relation: "Daughter",
        family_contact_number: "09182207741", family_email: "grace.bautista@example.com" },
      { full_name: "Liam Andres Reyes", birthdate: "2025-07-02", sex: "male",
        address: "23 Rosal St., Brgy. Sampaguita, Quezon City",
        family_contact_name: "Andrea Reyes", family_contact_relation: "Mother",
        family_contact_number: "09205531180", family_email: "andrea.reyes@example.com",
        is_minor: true, guardian_name: "Andrea Reyes", guardian_consent: true },
      { full_name: "Angelica Ramos", birthdate: "2004-05-30", sex: "female",
        address: "5 Gumamela St., Brgy. Sampaguita, Quezon City",
        contact_number: "09157784420", email: "angelicaramos@example.com",
        family_contact_name: "Teresita Ramos", family_contact_relation: "Mother", family_contact_number: "09157784421" },
      { full_name: "Jose Rizalino Mendoza", birthdate: "1980-12-01", sex: "male",
        address: "31 Camia St., Brgy. Sampaguita, Quezon City",
        contact_number: "09173329087",
        family_contact_name: "Marites Mendoza", family_contact_relation: "Wife",
        family_contact_number: "09173329088", family_email: "marites.mendoza@example.com" },
      { full_name: "Norma Villanueva", birthdate: "1967-09-21", sex: "female",
        address: "17 Dahlia St., Brgy. Sampaguita, Quezon City",
        contact_number: "09194421100",
        family_contact_name: "Pedro Villanueva", family_contact_relation: "Husband", family_contact_number: "09194421101" },
      { full_name: "Sofia Castillo", birthdate: "1996-02-08", sex: "female",
        address: "9 Sampaguita St., Brgy. Sampaguita, Quezon City",
        contact_number: "09162208841", email: "sofia.castillo@example.com",
        family_contact_name: "Mark Castillo", family_contact_relation: "Husband", family_contact_number: "09162208842" },
      { full_name: "Mateo Cruz", birthdate: "2024-04-18", sex: "male",
        address: "44 Rosal St., Brgy. Sampaguita, Quezon City",
        family_contact_name: "Liza Cruz", family_contact_relation: "Mother",
        family_contact_number: "09217765520", family_email: "liza.cruz@example.com",
        is_minor: true, guardian_name: "Liza Cruz", guardian_consent: true },
    ];
    const patients = {};
    let createdPatients = 0;
    for (const p of patientDefs) {
      const { id, created } = await findOrCreatePatient(p);
      patients[p.full_name] = id;
      if (created) createdPatients++;
    }
    console.log(`  ✓ Patients ready: ${patientDefs.length} total (${createdPatients} newly created)`);

    // ---- 3) one verified patient-portal demo login ---------------------------
    const mariaId = patients["Maria Clara Dela Cruz"];
    const portalExisting = await db.query("SELECT 1 FROM patient_accounts WHERE patient_id=$1", [mariaId]);
    if (!portalExisting.rowCount) {
      const portalHash = await bcrypt.hash("Demo1234!", 10);
      await db.query(
        `INSERT INTO patient_accounts (patient_id, username, password_hash, valid_id_type, valid_id_number, is_verified)
         VALUES ($1,'maria.delacruz',$2,'PhilHealth','12-345678901-2',true)`,
        [mariaId, portalHash]
      );
      console.log("  ✓ Patient portal demo login ready: maria.delacruz / Demo1234!");
    } else {
      console.log("  · Patient portal demo login already exists — skipped.");
    }

    // ---- 4) appointments: past (completed/missed/cancelled) + upcoming -------
    const svcRows = (await db.query("SELECT service_id, name FROM services")).rows;
    const svc = Object.fromEntries(svcRows.map((r) => [r.name, r.service_id]));

    async function seedAppt(patientName, serviceName, date, status) {
      const patient_id = patients[patientName];
      const exists = await db.query(
        "SELECT 1 FROM appointments WHERE patient_id=$1 AND service_id=$2 AND appointment_date=$3",
        [patient_id, svc[serviceName], date]
      );
      if (exists.rowCount) return;
      await db.query(
        `INSERT INTO appointments (patient_id, service_id, appointment_date, status, created_by)
         VALUES ($1,$2,$3,$4,$5)`,
        [patient_id, svc[serviceName], date, status, nurseId]
      );
    }

    const tue = DOW.tue, thu = DOW.thu, fri = DOW.fri;
    await seedAppt("Liam Andres Reyes", "immunization", weeksAgoOn(today, tue, 3), "completed");
    await seedAppt("Liam Andres Reyes", "immunization", weeksAgoOn(today, tue, 1), "missed");
    await seedAppt("Liam Andres Reyes", "immunization", onOrAfter(F.addDays(today, 1), tue), "scheduled");
    await seedAppt("Mateo Cruz", "immunization", weeksAgoOn(today, tue, 2), "completed");

    await seedAppt("Maria Clara Dela Cruz", "prenatal", weeksAgoOn(today, thu, 4), "completed");
    await seedAppt("Maria Clara Dela Cruz", "prenatal", weeksAgoOn(today, thu, 2), "completed");
    await seedAppt("Maria Clara Dela Cruz", "prenatal", onOrAfter(F.addDays(today, 1), thu), "scheduled");
    await seedAppt("Angelica Ramos", "prenatal", weeksAgoOn(today, thu, 5), "cancelled");
    await seedAppt("Angelica Ramos", "prenatal", weeksAgoOn(today, thu, 3), "completed");
    await seedAppt("Angelica Ramos", "prenatal", onOrAfter(F.addDays(today, 1), thu), "scheduled");
    await seedAppt("Sofia Castillo", "prenatal", weeksAgoOn(today, thu, 2), "completed");
    await seedAppt("Sofia Castillo", "prenatal", onOrAfter(F.addDays(today, 1), thu), "scheduled");

    await seedAppt("Remedios Bautista", "medicine_distribution", weeksAgoOn(today, fri, 3), "completed");
    await seedAppt("Remedios Bautista", "medicine_distribution", weeksAgoOn(today, fri, 1), "missed");
    await seedAppt("Remedios Bautista", "medicine_distribution", onOrAfter(F.addDays(today, 1), fri), "scheduled");
    await seedAppt("Jose Rizalino Mendoza", "medicine_distribution", weeksAgoOn(today, fri, 2), "completed");
    await seedAppt("Norma Villanueva", "medicine_distribution", weeksAgoOn(today, fri, 4), "completed");
    await seedAppt("Norma Villanueva", "medicine_distribution", onOrAfter(F.addDays(today, 1), fri), "scheduled");
    console.log("  ✓ Appointments seeded across all 3 services with a mix of statuses.");

    // ---- 5) medicines — includes 2 intentionally low-stock + 2 requiring
    // doctor approval, so the low-stock flag and approval queue are visible
    // the moment someone opens the app. ----------------------------------------
    const medDefs = [
      { name: "Paracetamol 500mg", unit: "tablet", stock_quantity: 150, low_stock_threshold: 30, source: "DOH supply" },
      { name: "Amoxicillin 500mg", unit: "capsule", stock_quantity: 80, low_stock_threshold: 20, source: "DOH supply", requires_doctor_approval: true },
      { name: "Ferrous Sulfate + Folic Acid", unit: "tablet", stock_quantity: 200, low_stock_threshold: 40, source: "DOH supply" },
      { name: "Amlodipine 10mg", unit: "tablet", stock_quantity: 60, low_stock_threshold: 20, source: "City Health Office" },
      { name: "Losartan 50mg", unit: "tablet", stock_quantity: 45, low_stock_threshold: 20, source: "City Health Office" },
      { name: "Metformin 500mg", unit: "tablet", stock_quantity: 12, low_stock_threshold: 20, source: "City Health Office" }, // low
      { name: "Vitamin B-Complex", unit: "tablet", stock_quantity: 90, low_stock_threshold: 20, source: "DOH supply" },
      { name: "Tramadol 50mg", unit: "tablet", stock_quantity: 15, low_stock_threshold: 10, source: "City Health Office", requires_doctor_approval: true },
      { name: "Tetanus Toxoid vaccine", unit: "vial", stock_quantity: 6, low_stock_threshold: 10, source: "DOH supply" }, // low
    ];
    const medicines = {};
    let createdMeds = 0;
    for (const m of medDefs) {
      const { id, created } = await findOrCreateMedicine(m);
      medicines[m.name] = id;
      if (created) createdMeds++;
    }
    console.log(`  ✓ Medicines ready: ${medDefs.length} total (${createdMeds} newly created) — 2 low stock, 2 require doctor approval.`);

    // ---- 6) dispenses: completed history + one live pending approval + one
    // already-approved, so every dispense-queue tab has something in it. ------
    async function seedDispense(patientName, medName, qty, opts = {}) {
      const patient_id = patients[patientName];
      const medicine_id = medicines[medName];
      const exists = await db.query(
        "SELECT 1 FROM medicine_dispenses WHERE patient_id=$1 AND medicine_id=$2",
        [patient_id, medicine_id]
      );
      if (exists.rowCount) return;
      const cols = ["patient_id", "medicine_id", "quantity", "dispensed_by", "requires_doctor_approval"];
      const vals = [patient_id, medicine_id, qty, nurseId, Boolean(opts.requiresApproval)];
      if (opts.dispensedAt) { cols.push("dispensed_at"); vals.push(opts.dispensedAt); }
      if (opts.approved) { cols.push("approved_by", "approved_at"); vals.push(doctorId, opts.approvedAt || new Date()); }
      const params = vals.map((_, i) => `$${i + 1}`).join(",");
      await db.query(`INSERT INTO medicine_dispenses (${cols.join(",")}) VALUES (${params})`, vals);
    }

    await seedDispense("Maria Clara Dela Cruz", "Ferrous Sulfate + Folic Acid", 30, { dispensedAt: `${F.addDays(today, -14)} 09:00:00+08` });
    await seedDispense("Angelica Ramos", "Ferrous Sulfate + Folic Acid", 30, { dispensedAt: `${F.addDays(today, -21)} 09:30:00+08` });
    await seedDispense("Remedios Bautista", "Amlodipine 10mg", 30, { dispensedAt: `${F.addDays(today, -21)} 10:00:00+08` });
    await seedDispense("Remedios Bautista", "Losartan 50mg", 30, { dispensedAt: `${F.addDays(today, -21)} 10:05:00+08` });
    await seedDispense("Sofia Castillo", "Vitamin B-Complex", 30, { dispensedAt: `${F.addDays(today, -14)} 11:00:00+08` });
    await seedDispense("Liam Andres Reyes", "Paracetamol 500mg", 1, { dispensedAt: `${F.addDays(today, -21)} 14:00:00+08` });
    // already-approved (doctor already signed off) — shows in the "Approved" tab
    await seedDispense("Norma Villanueva", "Tramadol 50mg", 10, {
      requiresApproval: true, dispensedAt: `${F.addDays(today, -7)} 15:00:00+08`,
      approved: true, approvedAt: `${F.addDays(today, -7)} 16:30:00+08`,
    });
    // still pending — this is what makes the doctor's approval queue non-empty on a fresh login
    await seedDispense("Jose Rizalino Mendoza", "Amoxicillin 500mg", 21, { requiresApproval: true });
    console.log("  ✓ Dispenses seeded — including one pending doctor approval (Jose Mendoza / Amoxicillin) and one already approved.");

    console.log("\n  Demo data ready. Log in as any of:");
    staff.forEach((s) => console.log(`    ${s.role.padEnd(11)} ${s.username} / Demo1234!`));
    console.log("    patient portal (/portal/login): maria.delacruz / Demo1234!\n");
    process.exit(0);
  } catch (e) {
    console.error("  ✗ Seed failed:", e.message);
    process.exit(1);
  }
})();

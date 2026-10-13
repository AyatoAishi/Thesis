// ============================================================================
// lib/visitPurpose.js — "what did the patient come to the clinic for?"
//
// Panel review, Oct 2026: the Add patient form should have its basic
// information first, then the reason for the visit ("kung ano ang sadya sa
// clinic"), and that reason should take staff straight to the right next
// screen instead of leaving them on the profile page to find it.
//
// The key travels through the guided chain as ?next=<key>: new patient →
// portal account (skippable) → the step below. "book" is the original chain
// (from Appointments → New patient) and still means "book an appointment".
// Nothing here is stored on the patient; it only decides where to go next.
// ============================================================================

const PURPOSES = {
  immunization: {
    label: "Immunization (vaccine)",
    step: "Book the immunization appointment",
    href: (id) => `/appointments/new?patient_id=${id}&next=immunization&service=immunization`,
  },
  prenatal: {
    label: "Prenatal check-up",
    step: "Start the prenatal record",
    href: (id) => `/patients/${id}/prenatal/new`,
  },
  medicine: {
    label: "Medicine",
    step: "Give the medicine",
    href: (id) => `/inventory/dispense/new?patient_id=${id}`,
  },
  consultation: {
    label: "Consultation (illness, BP check, check-up)",
    step: "Record the consultation",
    href: (id) => `/patients/${id}/visits/new`,
    // Consultations are recorded by the nurse or the admin only (routes/visits.js).
    roles: ["nurse", "admin"],
  },
  book: {
    label: "Book an appointment for another day",
    step: "Book the appointment",
    href: (id) => `/appointments/new?patient_id=${id}&next=book`,
  },
};

const isChain = (key) => Object.prototype.hasOwnProperty.call(PURPOSES, key);

// The purposes this role may pick on the form.
function forRole(role) {
  return Object.entries(PURPOSES)
    .filter(([, p]) => !p.roles || p.roles.includes(role))
    .map(([key, p]) => ({ key, label: p.label }));
}

// Where the chain goes for this patient, or null when it simply ends.
function nextStep(key, patientId) {
  if (!isChain(key)) return null;
  const p = PURPOSES[key];
  return { key, label: p.step, href: p.href(patientId) };
}

module.exports = { PURPOSES, isChain, forRole, nextStep };

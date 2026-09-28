// ============================================================================
// lib/pdf.js — patient-record PDF layout (M7). Pure drawing code, kept out of
// routes/reports.js so the route stays focused on fetching/validating data.
// PDFDocument is created with compress:false — a page or two of plain text
// doesn't benefit meaningfully from Flate compression, and keeping the content
// stream uncompressed means it stays readable (byte-searchable) rather than
// opaque binary, which is also just easier to eyeball if something looks off.
// ============================================================================
const F = require("./format");

function fmtDateTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-PH", {
    timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function sectionTitle(doc, text) {
  doc.moveDown(0.7);
  // From the left margin, always. After a table, doc.x is left wherever the
  // last column started, and a title written there wrapped into that column's
  // width ("Low stock / right now", Sept 29).
  doc.x = doc.page.margins.left;
  doc.font("Helvetica-Bold").fontSize(13).fillColor("#111111").text(text);
  const y = doc.y + 2;
  doc.moveTo(doc.page.margins.left, y)
     .lineTo(doc.page.width - doc.page.margins.right, y)
     .strokeColor("#cccccc").lineWidth(1).stroke();
  doc.moveDown(0.5);
  doc.fillColor("#111111");
}

// One "LABEL   value" line, label bold+grey, value normal+dark.
function kv(doc, label, value) {
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#666666")
     .text(label.toUpperCase() + "   ", { continued: true, width: 480 });
  doc.font("Helvetica").fontSize(10).fillColor("#111111").text(value == null || value === "" ? "—" : String(value));
}

// Minimal hand-rolled table: fixed column widths, re-prints the header row
// after a page break so a long history stays readable across pages.
function simpleTable(doc, { headers, rows, widths }) {
  const startX = doc.page.margins.left;
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colWidths = widths || headers.map(() => usableWidth / headers.length);

  // Every cell starts at the row's top; the row ends below its TALLEST cell.
  // It used to end below the last column's, so a cell that wrapped to two
  // lines in an earlier column was overprinted by the next row (seen Sept 29
  // with "Friday, October 23, / 2026" in the inventory PDF).
  function drawRow(cells, font) {
    const y = doc.y;
    let x = startX, bottom = y;
    cells.forEach((cell, i) => {
      font();
      doc.text(String(cell), x, y, { width: colWidths[i] });
      bottom = Math.max(bottom, doc.y);
      x += colWidths[i];
    });
    doc.x = startX;
    doc.y = bottom;
  }

  function drawHeader() {
    drawRow(headers, () => doc.font("Helvetica-Bold").fontSize(9).fillColor("#444444"));
    doc.moveDown(0.3);
    doc.moveTo(startX, doc.y).lineTo(startX + usableWidth, doc.y).strokeColor("#cccccc").lineWidth(1).stroke();
    doc.moveDown(0.25);
  }

  drawHeader();
  if (!rows.length) {
    doc.font("Helvetica-Oblique").fontSize(9).fillColor("#888888").text("None.", startX);
    doc.moveDown(0.3);
    doc.fillColor("#111111");
    return;
  }
  rows.forEach((cells) => {
    if (doc.y > doc.page.height - doc.page.margins.bottom - 50) {
      doc.addPage();
      drawHeader();
    }
    drawRow(cells, () => doc.font("Helvetica").fontSize(9).fillColor("#111111"));
    doc.moveDown(0.35);
  });
  doc.x = startX;
  doc.fillColor("#111111");
}

function buildPatientRecordPdf(doc, { patient, appointments, dispenses, generatedBy }) {
  const p = patient;

  doc.font("Helvetica-Bold").fontSize(18).fillColor("#111111").text("Barangay Sampaguita Health Clinic");
  doc.font("Helvetica").fontSize(11).fillColor("#555555").text("Patient Record");
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(9).fillColor("#888888")
     .text(`Generated ${fmtDateTime(new Date())}${generatedBy ? " by " + generatedBy : ""}`);
  doc.fillColor("#111111");

  sectionTitle(doc, `${p.full_name}${p.is_minor ? "  (Minor)" : ""}`);
  kv(doc, "Patient number", p.patient_number);
  kv(doc, "Sex", p.sex || "—");
  kv(doc, "Birthdate", p.birthdate ? F.longDate(p.birthdate) : "—");
  kv(doc, "Address", p.address || "—");
  kv(doc, "Contact number", p.contact_number || "—");
  kv(doc, "Email", p.email || "—");

  sectionTitle(doc, "Family contact");
  kv(doc, "Name", p.family_contact_name || "—");
  kv(doc, "Relation", p.family_contact_relation || "—");
  kv(doc, "Contact number", p.family_contact_number || "—");
  kv(doc, "Email", p.family_email || "—");

  if (p.is_minor) {
    sectionTitle(doc, "Guardian");
    kv(doc, "Guardian name", p.guardian_name || "—");
    kv(doc, "Consent recorded", p.guardian_consent ? "Yes" : "No");
  }

  sectionTitle(doc, "Appointments");
  simpleTable(doc, {
    headers: ["Date", "Time", "Service", "Status"],
    rows: appointments.map((a) => [
      F.longDate(a.appointment_date),
      F.shortTime(a.appointment_time) || "—",
      F.prettyService(a.service_name),
      a.status,
    ]),
    widths: [150, 65, 165, 90],
  });

  sectionTitle(doc, "Medicines dispensed");
  simpleTable(doc, {
    headers: ["Date", "Medicine", "Qty", "Notes"],
    rows: dispenses.map((d) => [
      fmtDateTime(d.dispensed_at),
      d.medicine_name,
      `${d.quantity} ${d.unit || ""}`.trim(),
      d.notes || "—",
    ]),
    widths: [150, 195, 60, 65],
  });
}

// Generic report PDF: a title/date-range header followed by one or more
// tables. Used for the Reports section (attendance, no-shows, trend,
// inventory) so each report can be exported the same way a patient record
// can, without each route hand-rolling its own PDF layout.
function buildReportPdf(doc, { title, subtitle, generatedBy, sections }) {
  doc.font("Helvetica-Bold").fontSize(18).fillColor("#111111").text("Barangay Sampaguita Health Clinic");
  doc.font("Helvetica").fontSize(11).fillColor("#555555").text(title);
  if (subtitle) doc.font("Helvetica").fontSize(10).fillColor("#777777").text(subtitle);
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(9).fillColor("#888888")
     .text(`Generated ${fmtDateTime(new Date())}${generatedBy ? " by " + generatedBy : ""}`);
  doc.fillColor("#111111");

  sections.forEach((sec) => {
    sectionTitle(doc, sec.title);
    if (sec.kv) sec.kv.forEach(([label, value]) => kv(doc, label, value));
    if (sec.headers) simpleTable(doc, { headers: sec.headers, rows: sec.rows, widths: sec.widths });
  });
}

module.exports = { buildPatientRecordPdf, buildReportPdf };

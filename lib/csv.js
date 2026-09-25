// ============================================================================
// lib/csv.js — "Printable or exportable copy of inventory", and of the expired
// medicines and the stock ledger, as files that open straight into Excel.
//
// Three things every export here gets right, because each one has bitten a
// real spreadsheet somewhere:
//
//   1. Quoting. A value with a comma, a quote or a line break is wrapped in
//      quotes and its own quotes doubled — otherwise "Ferrous Sulfate, 325mg"
//      splits into two columns and every column after it is wrong.
//
//   2. A UTF-8 byte-order mark at the start. Without it Excel on Windows reads
//      the file as the local codepage and "Dela Cruz, Niño" arrives as
//      "NiÃ±o".
//
//   3. Formula injection. A cell that starts with = + - @ is run as a formula
//      when the file is opened; a patient named "=HYPERLINK(...)" would turn
//      the clinic's own export into a link somebody clicks. Such cells are
//      prefixed with an apostrophe, which Excel shows as plain text. Numbers
//      are left alone — a stock change of -8 must stay a number.
// ============================================================================

function cell(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(headers, rows) {
  const lines = [headers.map(cell).join(",")];
  for (const r of rows) lines.push(r.map(cell).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

function sendCsv(res, filename, headers, rows) {
  const safe = String(filename).replace(/[^A-Za-z0-9._-]/g, "_");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${safe}"`);
  res.send(toCsv(headers, rows));
}

module.exports = { cell, toCsv, sendCsv };

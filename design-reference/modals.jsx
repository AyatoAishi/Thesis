/* Add-record modals — one form per section. onSubmit(record) prepends to the table. */

function Field({ label, req, children }) {
  return (
    <div className="field">
      <label>{label} {req && <span className="req">*</span>}</label>
      {children}
    </div>
  );
}
function Seg({ value, options, onChange }) {
  return (
    <div className="seg">
      {options.map(o => (
        <button key={o} className={value === o ? "on" : ""} type="button" onClick={() => onChange(o)}>{o}</button>
      ))}
    </div>
  );
}

const TODAY = "Jun 11, 2026";

function Modal({ icon, title, sub, children, onClose, onSubmit, submitLabel = "Save record" }) {
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target.classList.contains("overlay")) onClose(); }}>
      <form className="modal" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
        <div className="modal-head">
          <div className="mh-ico"><Icon name={icon} size={22} /></div>
          <div style={{ flex: 1 }}>
            <h3>{title}</h3>
            {sub && <div className="sub" style={{ color: "var(--ink-3)", fontSize: 12.5, marginTop: 3 }}>{sub}</div>}
          </div>
          <button type="button" className="ghost-ico" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary"><Icon name="check" size={18} color="#fff" /> {submitLabel}</button>
        </div>
      </form>
    </div>
  );
}

function VitalsForm({ patient, onClose, onSubmit }) {
  const [f, setF] = React.useState({ date: TODAY, bp: "", temp: "", hr: "", rr: "", weight: "", spo2: "", note: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal icon="pulse" title="Add Vital Signs" sub={`${patient.name} · ${patient.no}`} onClose={onClose}
      onSubmit={() => onSubmit({ ...f, bp: f.bp || "—", temp: f.temp || "—", hr: f.hr || "—", rr: f.rr || "—", weight: f.weight || "—", spo2: f.spo2 || "—", note: f.note || "No additional notes.", by: window.CLINIC.staff.name, _new: true })}>
      <Field label="Date" req><input className="input" value={f.date} onChange={set("date")} /></Field>
      <div className="field-row-3">
        <Field label="Blood pressure (mmHg)"><input className="input" placeholder="118/76" value={f.bp} onChange={set("bp")} /></Field>
        <Field label="Temp (°C)"><input className="input" placeholder="36.7" value={f.temp} onChange={set("temp")} /></Field>
        <Field label="SpO₂ (%)"><input className="input" placeholder="99" value={f.spo2} onChange={set("spo2")} /></Field>
      </div>
      <div className="field-row-3">
        <Field label="Heart rate (bpm)"><input className="input" placeholder="80" value={f.hr} onChange={set("hr")} /></Field>
        <Field label="Resp. rate"><input className="input" placeholder="18" value={f.rr} onChange={set("rr")} /></Field>
        <Field label="Weight (kg)"><input className="input" placeholder="62.4" value={f.weight} onChange={set("weight")} /></Field>
      </div>
      <Field label="Consultation note"><textarea className="textarea" placeholder="Findings, complaints, advice given…" value={f.note} onChange={set("note")} /></Field>
    </Modal>
  );
}

function ImmunizationForm({ patient, onClose, onSubmit }) {
  const [f, setF] = React.useState({ vaccine: "", dose: "1st", date: TODAY, site: "L deltoid", lot: "", status: "Completed" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal icon="syringe" title="Add Vaccine" sub={`${patient.name} · ${patient.no}`} onClose={onClose}
      onSubmit={() => onSubmit({ ...f, vaccine: f.vaccine || "Unnamed vaccine", lot: f.lot || "—", site: f.status === "Scheduled" ? "—" : f.site, by: f.status === "Scheduled" ? "—" : window.CLINIC.staff.name, _new: true })}>
      <Field label="Vaccine" req><input className="input" placeholder="e.g. Tetanus Toxoid (TT5)" value={f.vaccine} onChange={set("vaccine")} /></Field>
      <div className="field-row">
        <Field label="Dose"><input className="input" placeholder="1st / 2nd / Booster" value={f.dose} onChange={set("dose")} /></Field>
        <Field label="Date"><input className="input" value={f.date} onChange={set("date")} /></Field>
      </div>
      <div className="field-row">
        <Field label="Injection site"><input className="input" value={f.site} onChange={set("site")} /></Field>
        <Field label="Lot no."><input className="input" placeholder="TT-2356" value={f.lot} onChange={set("lot")} /></Field>
      </div>
      <Field label="Status"><Seg value={f.status} options={["Completed", "Scheduled"]} onChange={(v) => setF({ ...f, status: v })} /></Field>
    </Modal>
  );
}

function PrenatalForm({ patient, onClose, onSubmit }) {
  const [f, setF] = React.useState({ date: TODAY, aog: "", bp: "", weight: "", fundal: "", fht: "", presentation: "Cephalic", findings: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal icon="baby" title="Add Prenatal Visit" sub={`${patient.name} · ${patient.no}`} onClose={onClose}
      onSubmit={() => onSubmit({ ...f, aog: f.aog || "—", bp: f.bp || "—", weight: f.weight || "—", fundal: f.fundal || "—", fht: f.fht || "—", findings: f.findings || "Normal antenatal visit.", by: window.CLINIC.staff.name, _new: true })}>
      <div className="field-row">
        <Field label="Date" req><input className="input" value={f.date} onChange={set("date")} /></Field>
        <Field label="Age of gestation"><input className="input" placeholder="36w" value={f.aog} onChange={set("aog")} /></Field>
      </div>
      <div className="field-row-3">
        <Field label="BP (mmHg)"><input className="input" placeholder="118/76" value={f.bp} onChange={set("bp")} /></Field>
        <Field label="Weight (kg)"><input className="input" placeholder="62.4 kg" value={f.weight} onChange={set("weight")} /></Field>
        <Field label="Fundal ht."><input className="input" placeholder="34 cm" value={f.fundal} onChange={set("fundal")} /></Field>
      </div>
      <div className="field-row">
        <Field label="Fetal heart tone"><input className="input" placeholder="146 bpm" value={f.fht} onChange={set("fht")} /></Field>
        <Field label="Presentation"><Seg value={f.presentation} options={["Cephalic", "Breech", "—"]} onChange={(v) => setF({ ...f, presentation: v })} /></Field>
      </div>
      <Field label="Findings"><textarea className="textarea" placeholder="Clinical findings & advice…" value={f.findings} onChange={set("findings")} /></Field>
    </Modal>
  );
}

function MedsForm({ patient, onClose, onSubmit }) {
  const [f, setF] = React.useState({ drug: "", dose: "", freq: "", qty: "", refill: TODAY, status: "Active" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal icon="capsule" title="Add Medication" sub={`${patient.name} · ${patient.no}`} onClose={onClose}
      onSubmit={() => onSubmit({ ...f, drug: f.drug || "Unnamed medicine", dose: f.dose || "—", freq: f.freq || "—", qty: f.qty || "—", refill: f.refill || "—", since: "Jun 2026", by: window.CLINIC.staff.name, _new: true })}>
      <Field label="Medicine" req><input className="input" placeholder="e.g. Ferrous Sulfate + Folic Acid" value={f.drug} onChange={set("drug")} /></Field>
      <div className="field-row">
        <Field label="Dose"><input className="input" placeholder="60mg / 400mcg" value={f.dose} onChange={set("dose")} /></Field>
        <Field label="Quantity dispensed"><input className="input" placeholder="30 tabs" value={f.qty} onChange={set("qty")} /></Field>
      </div>
      <Field label="Frequency"><input className="input" placeholder="1 tab once daily" value={f.freq} onChange={set("freq")} /></Field>
      <div className="field-row">
        <Field label="Next refill"><input className="input" value={f.refill} onChange={set("refill")} /></Field>
        <Field label="Status"><Seg value={f.status} options={["Active", "Completed"]} onChange={(v) => setF({ ...f, status: v })} /></Field>
      </div>
    </Modal>
  );
}

function VisitForm({ patient, onClose, onSubmit }) {
  const svcOpts = { PRENATAL: "Prenatal check-up", IMMUNIZATION: "Immunization", CONSULT: "Consultation & maintenance" };
  const [f, setF] = React.useState({ date: TODAY, svc: patient.svc, purpose: "", status: "Scheduled" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal icon="calendar" title="Schedule / Log Visit" sub={`${patient.name} · ${patient.no}`} onClose={onClose}
      onSubmit={() => onSubmit({ ...f, purpose: f.purpose || svcOpts[f.svc], by: f.status === "Completed" ? window.CLINIC.staff.name : "—", _new: true })}>
      <div className="field-row">
        <Field label="Date" req><input className="input" value={f.date} onChange={set("date")} /></Field>
        <Field label="Service">
          <select className="select" value={f.svc} onChange={set("svc")}>
            <option value="PRENATAL">Prenatal (Thu)</option>
            <option value="IMMUNIZATION">Immunization (Tue)</option>
            <option value="CONSULT">Consultation & Maintenance (M/W/F)</option>
          </select>
        </Field>
      </div>
      <Field label="Purpose"><input className="input" placeholder={svcOpts[f.svc]} value={f.purpose} onChange={set("purpose")} /></Field>
      <Field label="Status"><Seg value={f.status} options={["Scheduled", "Completed", "No-show"]} onChange={(v) => setF({ ...f, status: v })} /></Field>
    </Modal>
  );
}

window.AddForms = { vitals: VitalsForm, immunizations: ImmunizationForm, prenatal: PrenatalForm, medications: MedsForm, visits: VisitForm };

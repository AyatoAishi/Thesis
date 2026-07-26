/* Tab panels for the patient record. Each gets {patient, data, onAdd}. */

function PanelHead({ icon, title, sub, count, onAdd, addLabel = "Add New Record" }) {
  return (
    <div className="panel-head">
      <div className="dd-ico" style={{ background: "var(--accent-soft)", color: "var(--accent)", width: 40, height: 40 }}>
        <Icon name={icon} size={20} />
      </div>
      <div>
        <h3>{title}{typeof count === "number" && <span style={{ color: "var(--ink-3)", fontWeight: 700 }}> · {count}</span>}</h3>
        {sub && <div className="sub">{sub}</div>}
      </div>
      <div className="ph-spacer"></div>
      {onAdd && (
        <button className="btn btn-primary" onClick={onAdd}>
          <Icon name="plus" size={18} color="#fff" /> {addLabel}
        </button>
      )}
    </div>
  );
}

function EmptyState({ icon, title, text, onAdd, addLabel }) {
  return (
    <div className="empty">
      <div className="ei"><Icon name={icon} size={28} /></div>
      <h4>{title}</h4>
      <p>{text}</p>
      {onAdd && <button className="btn btn-primary" style={{ margin: "0 auto" }} onClick={onAdd}><Icon name="plus" size={18} color="#fff" /> {addLabel}</button>}
    </div>
  );
}

/* ---------------- Overview / Demographics ---------------- */
function OverviewPanel({ patient }) {
  const d = patient.demo;
  const lastVital = patient.vitals[0];
  const activeMeds = patient.medications.filter(m => m.status === "Active").length;
  const completedShots = patient.immunizations.filter(i => i.status === "Completed").length;
  const rows = [
    { l: "Full name", v: patient.name, icon: "user" },
    { l: "Patient number", v: d.patientNo, icon: "idcard", mono: true },
    { l: "Age / Sex", v: `${patient.age} · ${patient.sex}`, icon: "user" },
    { l: "Date of birth", v: patient.dob, icon: "calendar" },
    { l: "Civil status", v: d.civil, icon: "family" },
    { l: "Blood type", v: d.blood, icon: "drop" },
    { l: "Address", v: d.address, icon: "pin", wide: true },
    { l: "Family contact", v: `${d.contactName} · ${d.contactNo}`, icon: "phone", wide: true },
    { l: "PhilHealth no.", v: d.philhealth, icon: "idcard", mono: true },
    { l: "PhilHealth category", v: d.category, icon: "idcard" },
    { l: "Occupation", v: d.occupation, icon: "users" },
    { l: "Religion", v: d.religion, icon: "leaf" },
  ];
  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
      <div className="panel">
        <PanelHead icon="user" title="Overview & Demographics" sub={`Registered ${patient.registered} · ${patient.tag}`} />
        <div className="panel-body">
          <div className="tiles" style={{ marginBottom: 20 }}>
            <div className="tile">
              <div className="tl">Last BP</div>
              <div className="tv">{lastVital ? lastVital.bp : "—"} <span className="tu">mmHg</span></div>
              <div className="td" style={{ color: "var(--ink-3)" }}>{lastVital ? lastVital.date : "No record"}</div>
            </div>
            <div className="tile">
              <div className="tl">Active meds</div>
              <div className="tv">{activeMeds}</div>
              <div className="td" style={{ color: "var(--ok-ink)" }}>maintenance</div>
            </div>
            <div className="tile">
              <div className="tl">Vaccines given</div>
              <div className="tv">{completedShots}</div>
              <div className="td" style={{ color: "var(--ink-3)" }}>completed doses</div>
            </div>
            <div className="tile">
              <div className="tl">Primary service</div>
              <div className="tv" style={{ fontSize: 16, marginTop: 11 }}><ServiceTag svc={patient.svc} /></div>
            </div>
          </div>
          <div className="section-title">Personal information</div>
          <div className="dgrid">
            {rows.map((r, i) => (
              <div className="dcell" key={i} style={r.wide ? { gridColumn: "1 / -1" } : null}>
                <div className="dl"><Icon name={r.icon} size={15} color="var(--ink-4)" /> {r.l}</div>
                <div className={"dv" + (r.mono ? " mono" : "")}>{r.v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Vital Signs & Consultation Notes ---------------- */
function VitalsPanel({ patient, onAdd }) {
  const rows = patient.vitals;
  return (
    <div className="panel fade-in">
      <PanelHead icon="pulse" title="Vital Signs & Consultation Notes" count={rows.length}
        sub="Blood pressure, temperature & clinical notes per visit" onAdd={onAdd} addLabel="Add Vitals" />
      <div className="panel-body" style={{ padding: rows.length ? "8px 8px 8px" : 20 }}>
        {rows.length === 0 ? (
          <EmptyState icon="pulse" title="No vital signs recorded" text="Record blood pressure, temperature and consultation notes for this patient's visits."
            onAdd={onAdd} addLabel="Add Vitals" />
        ) : (
          <table className="tbl">
            <thead><tr>
              <th>Date</th><th>BP</th><th>Temp</th><th>HR</th><th>RR</th><th>Weight</th><th>SpO₂</th><th style={{ minWidth: 220 }}>Consultation note</th><th>By</th>
            </tr></thead>
            <tbody>
              {rows.map((v, i) => (
                <tr key={i} className={v._new ? "row-new" : ""}>
                  <td style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{v.date}</td>
                  <td className="mono">{v.bp}</td>
                  <td className="mono">{v.temp}°</td>
                  <td className="mono">{v.hr}</td>
                  <td className="mono">{v.rr}</td>
                  <td className="mono">{v.weight}<span style={{ color: "var(--ink-4)" }}>kg</span></td>
                  <td className="mono">{v.spo2}%</td>
                  <td style={{ color: "var(--ink-2)", lineHeight: 1.45 }}>{v.note}</td>
                  <td style={{ color: "var(--ink-3)", whiteSpace: "nowrap", fontSize: 12 }}>{v.by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ---------------- Immunization & Vaccines ---------------- */
function ImmunizationPanel({ patient, onAdd }) {
  const rows = patient.immunizations;
  const done = rows.filter(r => r.status === "Completed").length;
  return (
    <div className="panel fade-in">
      <PanelHead icon="syringe" title="Immunization & Vaccines" count={rows.length}
        sub={`${done} completed · ${rows.length - done} scheduled`} onAdd={onAdd} addLabel="Add Vaccine" />
      <div className="panel-body" style={{ padding: rows.length ? "8px 8px 8px" : 20 }}>
        {rows.length === 0 ? (
          <EmptyState icon="syringe" title="No immunization records" text="Log vaccines given, dose, site, lot number and schedule the next dose."
            onAdd={onAdd} addLabel="Add Vaccine" />
        ) : (
          <table className="tbl">
            <thead><tr><th>Vaccine</th><th>Dose</th><th>Date</th><th>Site</th><th>Lot no.</th><th>Status</th><th>By</th></tr></thead>
            <tbody>
              {rows.map((v, i) => (
                <tr key={i} className={v._new ? "row-new" : ""}>
                  <td style={{ fontWeight: 700 }}>{v.vaccine}</td>
                  <td><span className="badge b-accent" style={{ height: 23, fontSize: 11.5 }}>{v.dose}</span></td>
                  <td style={{ whiteSpace: "nowrap" }}>{v.date}</td>
                  <td style={{ color: "var(--ink-2)" }}>{v.site}</td>
                  <td className="mono" style={{ color: "var(--ink-2)" }}>{v.lot}</td>
                  <td><StatusBadge status={v.status} /></td>
                  <td style={{ color: "var(--ink-3)", fontSize: 12, whiteSpace: "nowrap" }}>{v.by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ---------------- Prenatal Care ---------------- */
function PrenatalPanel({ patient, onAdd }) {
  const pn = patient.prenatal;
  if (!pn) {
    return (
      <div className="panel fade-in">
        <PanelHead icon="baby" title="Prenatal Care" />
        <div className="panel-body">
          <EmptyState icon="baby" title="Not applicable" text={`${patient.name} is not enrolled in the prenatal program. Prenatal care applies to expectant mothers (Thursday clinic).`} />
        </div>
      </div>
    );
  }
  const tiles = [
    { l: "Age of gestation", v: pn.aog, u: pn.trimester },
    { l: "LMP", v: pn.lmp, u: "last menstrual period" },
    { l: "EDD", v: pn.edd, u: "est. delivery date" },
    { l: "Gravida / Para", v: `G${pn.gravida} P${pn.para}`, u: pn.riskFlag },
  ];
  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
      <div className="panel">
        <PanelHead icon="baby" title="Prenatal Care" sub="Pregnancy summary & antenatal visit log" />
        <div className="panel-body">
          <div className="preg-card">
            <div className="ring" style={{ "--p": pn.progress }}>
              <div className="rc"><b>{pn.progress}%</b><span>to term</span></div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span className="badge" style={{ background: "#f0ecfe", color: "#6b46e0", height: 28 }}>
                  <Icon name="baby" size={15} color="#6b46e0" /> {pn.trimester}
                </span>
                <span className="badge b-ok" style={{ height: 28 }}><span className="bdot"></span>{pn.riskFlag}</span>
              </div>
              <div className="tiles" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
                {tiles.map((t, i) => (
                  <div className="tile" key={i} style={{ background: "#fff" }}>
                    <div className="tl">{t.l}</div>
                    <div className="tv" style={{ fontSize: 18 }}>{t.v}</div>
                    <div className="td" style={{ color: "var(--ink-3)" }}>{t.u}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <PanelHead icon="pulse" title="Antenatal Visits" count={pn.visits.length}
          sub="Fundal height, fetal heart tone & findings" onAdd={onAdd} addLabel="Add Prenatal Visit" />
        <div className="panel-body" style={{ padding: "8px 8px 8px" }}>
          <table className="tbl">
            <thead><tr><th>Date</th><th>AOG</th><th>BP</th><th>Weight</th><th>Fundal ht.</th><th>FHT</th><th>Presentation</th><th style={{ minWidth: 180 }}>Findings</th></tr></thead>
            <tbody>
              {pn.visits.map((v, i) => (
                <tr key={i} className={v._new ? "row-new" : ""}>
                  <td style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{v.date}</td>
                  <td><span className="badge b-accent" style={{ height: 23, fontSize: 11.5 }}>{v.aog}</span></td>
                  <td className="mono">{v.bp}</td>
                  <td className="mono">{v.weight}</td>
                  <td className="mono">{v.fundal}</td>
                  <td className="mono">{v.fht}</td>
                  <td style={{ color: "var(--ink-2)" }}>{v.presentation}</td>
                  <td style={{ color: "var(--ink-2)", lineHeight: 1.45 }}>{v.findings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Prescribed Medications & Maintenance ---------------- */
function MedsPanel({ patient, onAdd }) {
  const rows = patient.medications;
  return (
    <div className="panel fade-in">
      <PanelHead icon="capsule" title="Prescribed Medications & Maintenance" count={rows.length}
        sub="Active maintenance meds, dosage & refill schedule" onAdd={onAdd} addLabel="Add Medication" />
      <div className="panel-body" style={{ padding: rows.length ? "8px 8px 8px" : 20 }}>
        {rows.length === 0 ? (
          <EmptyState icon="capsule" title="No medications on file" text="Add prescribed or maintenance medicines with dosage, frequency and refill schedule."
            onAdd={onAdd} addLabel="Add Medication" />
        ) : (
          <table className="tbl">
            <thead><tr><th>Medicine</th><th>Dose</th><th>Frequency</th><th>Dispensed</th><th>Next refill</th><th>Status</th><th>Prescribed by</th></tr></thead>
            <tbody>
              {rows.map((m, i) => (
                <tr key={i} className={m._new ? "row-new" : ""}>
                  <td style={{ fontWeight: 700 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span className="dd-ico" style={{ width: 30, height: 30, background: "var(--accent-soft)", color: "var(--accent)" }}><Icon name="capsule" size={16} /></span>
                      {m.drug}
                    </div>
                  </td>
                  <td className="mono">{m.dose}</td>
                  <td style={{ color: "var(--ink-2)" }}>{m.freq}</td>
                  <td className="mono">{m.qty}</td>
                  <td style={{ whiteSpace: "nowrap", color: m.refill === "—" ? "var(--ink-4)" : "var(--ink)" }}>{m.refill}</td>
                  <td><StatusBadge status={m.status} /></td>
                  <td style={{ color: "var(--ink-3)", fontSize: 12, whiteSpace: "nowrap" }}>{m.by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ---------------- Visit History & Attendance ---------------- */
function VisitHistoryPanel({ patient, onAdd }) {
  const rows = patient.visitsHistory;
  const counts = {
    Completed: rows.filter(r => r.status === "Completed").length,
    Scheduled: rows.filter(r => r.status === "Scheduled").length,
    "No-show": rows.filter(r => r.status === "No-show").length,
  };
  const nodeStyle = {
    Completed: { bg: "var(--ok-bg)", ink: "var(--ok-ink)", icon: "check" },
    Scheduled: { bg: "var(--warn-bg)", ink: "var(--warn-ink)", icon: "clock" },
    "No-show": { bg: "var(--bad-bg)", ink: "var(--bad)", icon: "x" },
  };
  return (
    <div className="panel fade-in">
      <PanelHead icon="history" title="Visit History & Attendance" count={rows.length}
        sub="Scheduled, completed & missed appointments" onAdd={onAdd} addLabel="Schedule Visit" />
      <div className="panel-body">
        <div className="kpi-strip" style={{ marginBottom: 22 }}>
          <div className="tile" style={{ flex: 1, background: "var(--ok-bg)", borderColor: "transparent" }}>
            <div className="tl" style={{ color: "var(--ok-ink)" }}>Completed</div>
            <div className="tv" style={{ color: "var(--ok-ink)" }}>{counts.Completed}</div>
          </div>
          <div className="tile" style={{ flex: 1, background: "var(--warn-bg)", borderColor: "transparent" }}>
            <div className="tl" style={{ color: "var(--warn-ink)" }}>Scheduled</div>
            <div className="tv" style={{ color: "var(--warn-ink)" }}>{counts.Scheduled}</div>
          </div>
          <div className="tile" style={{ flex: 1, background: "var(--bad-bg)", borderColor: "transparent" }}>
            <div className="tl" style={{ color: "var(--bad-ink)" }}>No-show</div>
            <div className="tv" style={{ color: "var(--bad-ink)" }}>{counts["No-show"]}</div>
          </div>
        </div>
        <div className="section-title">Timeline</div>
        <div className="tline">
          {rows.map((v, i) => {
            const ns = nodeStyle[v.status] || nodeStyle.Completed;
            return (
              <div className="tline-item" key={i}>
                <div className="tline-rail">
                  <div className="tline-node" style={{ background: ns.bg, color: ns.ink }}><Icon name={ns.icon} size={17} /></div>
                  <div className="tline-line"></div>
                </div>
                <div className="tline-body">
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 800, fontSize: 14 }}>{v.date}</span>
                    <ServiceTag svc={v.svc} small />
                    <StatusBadge status={v.status} />
                  </div>
                  <div style={{ color: "var(--ink-2)", fontSize: 13, marginTop: 5 }}>{v.purpose}</div>
                  {v.by !== "—" && <div style={{ color: "var(--ink-4)", fontSize: 12, marginTop: 3 }}>Attended by {v.by}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { OverviewPanel, VitalsPanel, ImmunizationPanel, PrenatalPanel, MedsPanel, VisitHistoryPanel, EmptyState, PanelHead });

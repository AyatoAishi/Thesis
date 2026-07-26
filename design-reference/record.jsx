/* Patient record: header card + distinct vertical sub-menu + active panel */

function PatientHeader({ patient }) {
  const actions = ["message", "phone", "video", "edit"];
  return (
    <div className="card phead">
      <Avatar name={patient.name} initials={patient.initials} color={patient.color} size={66} ring />
      <div style={{ minWidth: 0 }}>
        <div className="pname">
          {patient.name}
          <span className="badge b-accent" style={{ height: 22, fontSize: 10.5, letterSpacing: ".03em" }}>{patient.tag}</span>
        </div>
        <div className="pmeta">
          <span className="mono" style={{ color: "var(--accent-strong)", fontWeight: 700 }}>{patient.no}</span>
          <span><b>{patient.age}</b> · {patient.sex}</span>
          <span>Blood <b>{patient.demo.blood}</b></span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="pin" size={14} color="var(--ink-3)" /> Brgy. Sampaguita, QC</span>
          <span>Registered <b>{patient.registered}</b></span>
        </div>
      </div>
      <div className="phead-actions">
        <ServiceTag svc={patient.svc} />
        <div style={{ width: 8 }}></div>
        {actions.map(a => (
          <button key={a} className="ghost-ico" title={a}><Icon name={a} size={18} /></button>
        ))}
      </div>
    </div>
  );
}

const TABS = [
  { key: "overview", label: "Overview / Demographics", icon: "user" },
  { key: "vitals", label: "Vital Signs & Notes", icon: "pulse" },
  { key: "immunizations", label: "Immunization & Vaccines", icon: "syringe" },
  { key: "prenatal", label: "Prenatal Care", icon: "baby" },
  { key: "medications", label: "Medications & Maintenance", icon: "capsule" },
  { key: "visits", label: "Visit History & Attendance", icon: "history" },
];

function countFor(patient, key) {
  if (key === "overview") return null;
  if (key === "prenatal") return patient.prenatal ? patient.prenatal.visits.length : 0;
  const map = { vitals: "vitals", immunizations: "immunizations", medications: "medications", visits: "visitsHistory" };
  return (patient[map[key]] || []).length;
}

function SubMenu({ patient, active, setActive }) {
  return (
    <nav className="submenu">
      <div className="submenu-label">Medical History</div>
      <div className="snav">
        {TABS.map(t => {
          const c = countFor(patient, t.key);
          return (
            <button key={t.key} className={"snav-btn" + (active === t.key ? " active" : "")} onClick={() => setActive(t.key)}>
              <span className="si"><Icon name={t.icon} size={18} /></span>
              <span style={{ minWidth: 0, lineHeight: 1.25 }}>{t.label}</span>
              {typeof c === "number" && <span className="scount">{c}</span>}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function RecordView({ patient, onAddRecord }) {
  const [active, setActive] = React.useState("overview");
  const [modal, setModal] = React.useState(null); // tab key or null

  // reset to overview when switching patient
  React.useEffect(() => { setActive("overview"); setModal(null); }, [patient.id]);

  const openAdd = () => setModal(active);
  const Form = modal ? window.AddForms[modal] : null;

  const panels = {
    overview: <OverviewPanel patient={patient} />,
    vitals: <VitalsPanel patient={patient} onAdd={openAdd} />,
    immunizations: <ImmunizationPanel patient={patient} onAdd={openAdd} />,
    prenatal: <PrenatalPanel patient={patient} onAdd={patient.prenatal ? openAdd : null} />,
    medications: <MedsPanel patient={patient} onAdd={openAdd} />,
    visits: <VisitHistoryPanel patient={patient} onAdd={openAdd} />,
  };

  return (
    <div className="record">
      <PatientHeader patient={patient} />
      <div className="split">
        <SubMenu patient={patient} active={active} setActive={setActive} />
        <div className="main">{panels[active]}</div>
      </div>
      {Form && (
        <Form patient={patient} onClose={() => setModal(null)}
          onSubmit={(rec) => { onAddRecord(patient.id, modal, rec); setModal(null); }} />
      )}
    </div>
  );
}

window.RecordView = RecordView;

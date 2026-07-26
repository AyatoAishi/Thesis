/* App shell: IconRail, TopBar (search + notifications + user), PatientQueue */

function IconRail({ section, setSection }) {
  const items = [
    { id: "dashboard", icon: "grid" },
    { id: "patients", icon: "users" },
    { id: "appointments", icon: "calendar" },
    { id: "inventory", icon: "pill" },
    { id: "reports", icon: "chart" },
  ];
  return (
    <nav className="rail">
      <div className="rail-logo" title="Sampaguita Health Clinic">
        <Icon name="leaf" size={22} color="#fff" strokeWidth={1.9} />
      </div>
      {items.map(it => (
        <button key={it.id} className={"rail-btn" + (section === it.id ? " active" : "")}
          onClick={() => setSection(it.id)} title={it.id[0].toUpperCase() + it.id.slice(1)}>
          <Icon name={it.icon} size={21} />
        </button>
      ))}
      <div className="rail-spacer"></div>
      <div className="rail-sep"></div>
      <button className="rail-btn" title="Settings"><Icon name="settings" size={21} /></button>
    </nav>
  );
}

function TopBar({ patients, current, onPick, onToggleQueue }) {
  const [q, setQ] = React.useState("");
  const [focus, setFocus] = React.useState(false);
  const [openNotif, setOpenNotif] = React.useState(false);
  const [openUser, setOpenUser] = React.useState(false);
  const today = window.CLINIC.today;
  const staff = window.CLINIC.staff;
  const notifs = window.CLINIC.notifications;

  const results = q.trim()
    ? patients.filter(p =>
        p.name.toLowerCase().includes(q.toLowerCase()) ||
        p.no.toLowerCase().includes(q.toLowerCase()))
    : [];

  React.useEffect(() => {
    const close = (e) => {
      if (!e.target.closest(".notif-wrap")) setOpenNotif(false);
      if (!e.target.closest(".user-wrap")) setOpenUser(false);
      if (!e.target.closest(".search")) setFocus(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const toneStyle = {
    bad: { bg: "var(--bad-bg)", ink: "var(--bad)" },
    warn: { bg: "var(--warn-bg)", ink: "var(--warn-ink)" },
    info: { bg: "var(--info-bg)", ink: "var(--info-ink)" },
  };

  return (
    <header className="topbar">
      <button className="icon-btn" onClick={onToggleQueue} title="Toggle patient list" style={{ border: "none", background: "transparent" }}>
        <Icon name="sliders" size={20} />
      </button>
      <div className="brand">
        <div className="rail-logo" style={{ width: 38, height: 38, marginBottom: 0, borderRadius: 11 }}>
          <Icon name="leaf" size={20} color="#fff" strokeWidth={1.9} />
        </div>
        <div>
          <div className="brand-name">Sampaguita Health</div>
          <div className="brand-sub">Barangay Health Clinic · QC</div>
        </div>
      </div>

      <div className="search">
        <span className="s-icon"><Icon name="search" size={18} /></span>
        <input
          value={q}
          placeholder="Search patient by name or number (e.g. SHC-2024-0417)…"
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocus(true)}
        />
        {focus && q.trim() && (
          <div className="search-pop">
            {results.length === 0
              ? <div className="search-empty">No patient matches “{q}”.</div>
              : results.slice(0, 6).map(p => (
                <div key={p.id} className="search-res" onMouseDown={() => { onPick(p.id); setQ(""); setFocus(false); }}>
                  <Avatar name={p.name} initials={p.initials} color={p.color} size={36} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{p.name}</div>
                    <div style={{ fontSize: 11.5, color: "var(--ink-3)", fontFamily: "var(--mono)" }}>{p.no}</div>
                  </div>
                  <div style={{ marginLeft: "auto" }}><ServiceTag svc={p.svc} small /></div>
                </div>
              ))}
          </div>
        )}
      </div>

      <div className="topbar-right">
        <div className="svc-pill">
          <span className="svc-dot"></span>
          <div>
            <div className="lbl">{today.dayName} · today</div>
            <div className="val">{today.service}</div>
          </div>
        </div>

        <div className="notif-wrap" style={{ position: "relative" }}>
          <button className="icon-btn" onClick={() => { setOpenNotif(v => !v); setOpenUser(false); }} title="Notifications">
            <Icon name="bell" size={20} />
            <span className="dot-badge">{notifs.length}</span>
          </button>
          {openNotif && (
            <div className="dropdown">
              <div className="dd-head">
                <div className="t">Notifications</div>
                <span className="badge b-bad" style={{ height: 22, fontSize: 11 }}>{notifs.filter(n => n.tone === "bad").length} urgent</span>
              </div>
              {notifs.map((n, i) => {
                const t = toneStyle[n.tone] || toneStyle.info;
                return (
                  <div key={i} className="dd-item">
                    <div className="dd-ico" style={{ background: t.bg, color: t.ink }}>
                      <Icon name={n.type === "stock" ? "box" : "alert"} size={18} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3 }}>{n.title}</div>
                      <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 3 }}>{n.detail}</div>
                      <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 4, fontWeight: 600 }}>{n.time}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="user-wrap" style={{ position: "relative" }}>
          <button className="user-chip" onClick={() => { setOpenUser(v => !v); setOpenNotif(false); }}>
            <Avatar name={staff.name} initials={staff.initials} color={staff.color} size={36} />
            <div className="user-meta">
              <div className="nm">{staff.name}</div>
              <div className="rl">{staff.role}</div>
            </div>
            <Icon name="chevDown" size={16} color="var(--ink-3)" />
          </button>
          {openUser && (
            <div className="dropdown" style={{ width: 248 }}>
              <div className="dd-head"><div className="t">Signed in</div></div>
              <div style={{ padding: 14, display: "flex", gap: 12, alignItems: "center", borderBottom: "1px solid var(--border)" }}>
                <Avatar name={staff.name} initials={staff.initials} color={staff.color} size={44} ring />
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{staff.name}</div>
                  <div style={{ fontSize: 12, color: "var(--accent)", fontWeight: 700 }}>{staff.role}</div>
                </div>
              </div>
              {["Head Nurse", "Facilitator", "Recorder", "Visiting Doctor"].map((r, i) => (
                <div key={i} className="dd-item" style={{ padding: "11px 16px" }}>
                  <Icon name="user" size={18} color="var(--ink-3)" />
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Switch to {r}</div>
                  {i === 0 && <span style={{ marginLeft: "auto" }}><Icon name="check" size={16} color="var(--accent)" /></span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function PatientQueue({ patients, currentId, onPick }) {
  const [filter, setFilter] = React.useState("today");
  const filters = [
    { id: "today", label: "Today" },
    { id: "all", label: "All" },
    { id: "prenatal", label: "Prenatal" },
  ];
  let list = patients;
  if (filter === "today") list = patients.filter(p => p.scheduledToday);
  else if (filter === "prenatal") list = patients.filter(p => p.svc === "PRENATAL");

  return (
    <aside className="queue">
      <div className="queue-head">
        <div className="queue-title">
          <h2>Patient Queue</h2>
          <span className="queue-count">{list.length}</span>
        </div>
        <div className="qfilter">
          {filters.map(f => (
            <button key={f.id} className={filter === f.id ? "on" : ""} onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
        </div>
      </div>
      <div className="queue-list">
        {list.map(p => (
          <div key={p.id} className={"qcard" + (p.id === currentId ? " sel" : "")} onClick={() => onPick(p.id)}>
            <Avatar name={p.name} initials={p.initials} color={p.color} size={42} ring={p.id === currentId} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="nm">{p.name}</div>
              <div className="meta">{p.no}</div>
            </div>
            <div className="qcard-svc"><ServiceTag svc={p.svc} small /></div>
          </div>
        ))}
        {list.length === 0 && <div className="search-empty" style={{ padding: 30 }}>No patients in this filter.</div>}
      </div>
    </aside>
  );
}

window.IconRail = IconRail;
window.TopBar = TopBar;
window.PatientQueue = PatientQueue;

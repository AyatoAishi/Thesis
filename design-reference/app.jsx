/* Root app — state, accent theming, tweaks, layout */

const ACCENTS = {
  "#3b6cf5": { strong: "#2c54d6", soft: "#e9f0fe", softer: "#f3f7ff" },
  "#7b5cf0": { strong: "#6442d8", soft: "#efebfe", softer: "#f7f4ff" },
  "#18a571": { strong: "#0f8a5d", soft: "#e1f5ed", softer: "#f2fbf7" },
  "#2c8fb8": { strong: "#1f7396", soft: "#e2f3fa", softer: "#f1fafd" },
};

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#3b6cf5",
  "density": "comfortable",
  "showQueue": true,
  "submenuStyle": "filled"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [patients, setPatients] = React.useState(() => JSON.parse(JSON.stringify(window.CLINIC.patients)));
  const [currentId, setCurrentId] = React.useState(patients[0].id);
  const [section, setSection] = React.useState("patients");

  const current = patients.find(p => p.id === currentId) || patients[0];

  // accent theming
  React.useEffect(() => {
    const a = ACCENTS[t.accent] || ACCENTS["#3b6cf5"];
    const r = document.documentElement.style;
    r.setProperty("--accent", t.accent);
    r.setProperty("--accent-strong", a.strong);
    r.setProperty("--accent-soft", a.soft);
    r.setProperty("--accent-softer", a.softer);
  }, [t.accent]);

  const addRecord = (pid, tabKey, rec) => {
    setPatients(prev => prev.map(p => {
      if (p.id !== pid) return p;
      const np = { ...p };
      if (tabKey === "prenatal") {
        np.prenatal = { ...p.prenatal, visits: [rec, ...p.prenatal.visits] };
      } else {
        const map = { vitals: "vitals", immunizations: "immunizations", medications: "medications", visits: "visitsHistory" };
        const key = map[tabKey];
        np[key] = [rec, ...p[key]];
      }
      return np;
    }));
    // clear the _new flag after the flash
    setTimeout(() => setPatients(prev => prev.map(p => {
      const strip = (arr) => arr.map(x => x._new ? (() => { const c = { ...x }; delete c._new; return c; })() : x);
      const np = { ...p };
      ["vitals", "immunizations", "medications", "visitsHistory"].forEach(k => { if (np[k]) np[k] = strip(np[k]); });
      if (np.prenatal) np.prenatal = { ...np.prenatal, visits: strip(np.prenatal.visits) };
      return np;
    })), 1800);
  };

  return (
    <div className={"app" + (t.density === "compact" ? " density-compact" : "") + (t.submenuStyle === "plain" ? " submenu-plain" : "")}>
      <TopBar patients={patients} current={current}
        onPick={setCurrentId}
        onToggleQueue={() => setTweak("showQueue", !t.showQueue)} />
      <div className="body-row">
        <IconRail section={section} setSection={setSection} />
        {t.showQueue && <PatientQueue patients={patients} currentId={currentId} onPick={setCurrentId} />}
        <RecordView patient={current} onAddRecord={addRecord} />
      </div>

      <TweaksPanel>
        <TweakSection label="Theme" />
        <TweakColor label="Accent color" value={t.accent}
          options={["#3b6cf5", "#7b5cf0", "#2c8fb8", "#18a571"]}
          onChange={(v) => setTweak("accent", v)} />
        <TweakSection label="Layout" />
        <TweakRadio label="Density" value={t.density} options={["comfortable", "compact"]}
          onChange={(v) => setTweak("density", v)} />
        <TweakToggle label="Show patient queue" value={t.showQueue}
          onChange={(v) => setTweak("showQueue", v)} />
        <TweakRadio label="Sub-menu active style" value={t.submenuStyle} options={["filled", "plain"]}
          onChange={(v) => setTweak("submenuStyle", v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);

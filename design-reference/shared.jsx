/* Shared atoms: Avatar, Badge, status helpers */
function Avatar({ name, initials, color, size = 40, ring = false }) {
  const fs = Math.round(size * 0.36);
  return (
    <div className={"av" + (ring ? " av-ring" : "")}
      style={{ width: size, height: size, background: color, fontSize: fs }}
      title={name}>
      {initials}
    </div>
  );
}

const STATUS_MAP = {
  "Completed": { cls: "b-ok", label: "Completed" },
  "Scheduled": { cls: "b-warn", label: "Scheduled" },
  "No-show":   { cls: "b-bad", label: "No-show" },
  "Active":    { cls: "b-ok", label: "Active" },
  "Missed":    { cls: "b-bad", label: "Missed" },
};
function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || { cls: "b-neutral", label: status };
  return <span className={"badge " + s.cls}><span className="bdot"></span>{s.label}</span>;
}

function ServiceTag({ svc, small }) {
  const c = window.CLINIC.svcColor[svc];
  if (!c) return null;
  return (
    <span className="badge" style={{ background: c.bg, color: c.ink, height: small ? 22 : 26, fontSize: small ? 11 : 12 }}>
      <span className="bdot" style={{ background: c.dot }}></span>{c.label}
    </span>
  );
}

window.Avatar = Avatar;
window.StatusBadge = StatusBadge;
window.ServiceTag = ServiceTag;

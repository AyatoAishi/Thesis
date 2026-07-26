/* Simple stroke icons. All accept {size, className, color}. */
(function () {
  const I = (paths, vb = 24) => ({ size = 20, color = "currentColor", className = "", strokeWidth = 1.7, fill = false }) => (
    <svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`} fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
      {paths}
    </svg>
  );

  const Icons = {
    grid: I(<><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>),
    users: I(<><path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19"/><circle cx="10" cy="8" r="3.2"/><path d="M20 19v-1.5a3.5 3.5 0 0 0-2.7-3.4M15.5 5.1a3.2 3.2 0 0 1 0 6.1"/></>),
    calendar: I(<><rect x="3.5" y="4.5" width="17" height="16" rx="2.5"/><path d="M3.5 9h17M8 3v3M16 3v3"/></>),
    pill: I(<><rect x="3" y="9" width="18" height="6.5" rx="3.25" transform="rotate(-45 12 12)"/><path d="M9 9l6 6"/></>),
    chart: I(<><path d="M4 20V10M9 20V4M14 20v-7M19 20v-11"/></>),
    settings: I(<><circle cx="12" cy="12" r="3.2"/><path d="M19.4 13.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.1a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H4a2 2 0 0 1 0-4h.1A1.7 1.7 0 0 0 5.3 6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V2a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1H22a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>),
    search: I(<><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></>),
    bell: I(<><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10.5 20a2 2 0 0 0 3 0"/></>),
    message: I(<><path d="M21 11.5a8 8 0 0 1-11.5 7.2L4 20l1.3-5.5A8 8 0 1 1 21 11.5z"/></>),
    phone: I(<><path d="M5 4h3l1.5 5-2 1.5a11 11 0 0 0 5 5l1.5-2 5 1.5v3a2 2 0 0 1-2.2 2A16 16 0 0 1 3 6.2 2 2 0 0 1 5 4z"/></>),
    video: I(<><rect x="3" y="6" width="12" height="12" rx="2.5"/><path d="M15 10l6-3v10l-6-3"/></>),
    edit: I(<><path d="M4 20h4L19 9a2 2 0 0 0-3-3L5 17v3z"/><path d="M14 7l3 3"/></>),
    plus: I(<><path d="M12 5v14M5 12h14"/></>),
    chevDown: I(<><path d="M6 9l6 6 6-6"/></>),
    chevRight: I(<><path d="M9 6l6 6-6 6"/></>),
    user: I(<><circle cx="12" cy="8" r="3.6"/><path d="M5 20a7 7 0 0 1 14 0"/></>),
    pulse: I(<><path d="M3 12h4l2-6 4 12 2-6h6"/></>),
    syringe: I(<><path d="M18 2l4 4M20 4l-9 9M14 7l3 3M9 11l4 4-3.5 3.5a2 2 0 0 1-3 0l-1-1a2 2 0 0 1 0-3L9 11zM7 17l-4 4"/></>),
    heart: I(<><path d="M12 20s-7-4.5-9.5-9A4.8 4.8 0 0 1 12 6a4.8 4.8 0 0 1 9.5 5c-2.5 4.5-9.5 9-9.5 9z"/></>),
    capsule: I(<><rect x="3" y="9" width="18" height="6.5" rx="3.25" transform="rotate(-45 12 12)"/><path d="M9 9l6 6"/></>),
    history: I(<><path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4"/><path d="M12 8v4l3 2"/></>),
    home: I(<><path d="M4 11l8-7 8 7v8a2 2 0 0 1-2 2h-3v-6h-6v6H6a2 2 0 0 1-2-2z"/></>),
    pin: I(<><path d="M12 21s-6.5-5.5-6.5-10a6.5 6.5 0 1 1 13 0c0 4.5-6.5 10-6.5 10z"/><circle cx="12" cy="11" r="2.4"/></>),
    idcard: I(<><rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="8.5" cy="11" r="2.2"/><path d="M5.5 16a3.4 3.4 0 0 1 6 0M14 9.5h4M14 13h4"/></>),
    check: I(<><path d="M4 12l5 5L20 6"/></>),
    x: I(<><path d="M6 6l12 12M18 6L6 18"/></>),
    clock: I(<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>),
    alert: I(<><path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h.01"/></>),
    box: I(<><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7M12 11v10"/></>),
    drop: I(<><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/></>),
    baby: I(<><circle cx="12" cy="8" r="4"/><path d="M9 7.5h.01M15 7.5h.01M10 10a3 3 0 0 0 4 0"/><path d="M5 21a7 7 0 0 1 14 0"/></>),
    weight: I(<><rect x="4" y="7" width="16" height="14" rx="3"/><circle cx="12" cy="5.5" r="2"/><path d="M9 12a3 3 0 0 1 6 0"/></>),
    thermo: I(<><path d="M10 13.5V5a2 2 0 1 1 4 0v8.5a4 4 0 1 1-4 0z"/><circle cx="12" cy="17" r="1.4" fill="currentColor" stroke="none"/></>),
    family: I(<><circle cx="8" cy="8" r="2.6"/><circle cx="16" cy="9" r="2.2"/><path d="M3.5 19a4.5 4.5 0 0 1 9 0M13 19a4 4 0 0 1 7.5-2"/></>),
    sliders: I(<><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h7M15 18h5"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="13" cy="18" r="2"/></>),
    leaf: I(<><path d="M5 19c0-7 5-12 14-13 0 9-5 14-12 14a4 4 0 0 1-4-4M5 19c2-4 5-6 9-7"/></>),
    print: I(<><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7" rx="1"/></>),
    download: I(<><path d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14"/></>),
  };

  window.Icon = function Icon({ name, ...rest }) {
    const C = Icons[name];
    return C ? <C {...rest} /> : null;
  };
})();

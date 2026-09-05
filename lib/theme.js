// ============================================================================
// lib/theme.js — per-account appearance: mode, accent, font, animations.
//
// The promise this file has to keep is that a staff member CANNOT make the
// system unreadable. They pick a colour they like; the shades around it are
// computed here so the contrast always holds. Somebody choosing a bright
// yellow gets a yellow app, not a white page with invisible buttons — and
// crucially, if that went wrong it would go wrong on THEIR screen, where we
// would never see it, and they would conclude the system was broken rather
// than that a setting of theirs was.
//
// So the hue is theirs and the lightness is ours. WCAG AA (4.5:1) against the
// text that sits on the colour, worked out per mode, every time.
// ============================================================================

// ---- colour maths ----------------------------------------------------------
// sRGB relative luminance, per WCAG 2.1. Needed because "how light does this
// look" is not the L in HSL — #ffff00 and #0000ff have the same HSL lightness
// and nothing like the same brightness to an eye.
function luminance({ r, g, b }) {
  const f = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const toHex = ({ r, g, b }) =>
  "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");

function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

function hslToRgb({ h, s, l }) {
  if (s === 0) { const v = Math.round(l * 255); return { r: v, g: v, b: v }; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return { r: Math.round(hue(h + 1 / 3) * 255), g: Math.round(hue(h) * 255), b: Math.round(hue(h - 1 / 3) * 255) };
}

const WHITE = { r: 255, g: 255, b: 255 };

// Walk the lightness until the colour clears `min` contrast against `against`.
// A search rather than a formula because luminance is not linear in L and the
// distance depends entirely on the hue: yellow has to travel a very long way
// down to carry white text, blue barely moves at all.
function fit(hsl, against, min, direction) {
  let best = hslToRgb(hsl);
  for (let i = 0; i < 100; i++) {
    if (contrast(best, against) >= min) return rgbToHsl(best);
    const l = rgbToHsl(best).l + direction * 0.01;
    if (l <= 0 || l >= 1) break;
    best = hslToRgb({ h: hsl.h, s: hsl.s, l });
  }
  return rgbToHsl(best);
}

const shift = (hsl, dl) => ({ h: hsl.h, s: hsl.s, l: Math.max(0, Math.min(1, hsl.l + dl)) });
const desat = (hsl, l, s) => ({ h: hsl.h, s: Math.min(hsl.s, s), l });

// Build the four accent tokens plus the colour of text that sits ON the accent.
//
// The two modes are not mirror images. In light mode the accent is a button
// background under white text, so it must be dark enough. In dark mode that
// same accent would disappear into the page when used AS text — and it is used
// as text, for the step numbers and the error code — so the accent goes light
// and the text on it goes dark instead. That is why --on-accent exists at all.
function accentRamp(hex, dark) {
  const base = rgbToHsl(hexToRgb(hex) || hexToRgb("#3b6cf5"));
  // The saturation floor is low on purpose. It was 0.35 first, to stop a
  // washed-out pick producing a colourless theme — but a grey has no hue at
  // all, so HSL reports hue 0, and forcing saturation onto hue 0 turned every
  // grey into a muddy red. Choose white, get red: contrast fine, result
  // absurd. Below the floor the colour is left alone and a neutral slate
  // theme is a perfectly good answer to "I picked grey".
  const h = base.s < 0.12 ? base : { h: base.h, s: Math.max(base.s, 0.3), l: base.l };

  if (!dark) {
    const accent = fit(h, WHITE, 4.5, -1);           // white text sits on it
    return {
      "--accent": toHex(hslToRgb(accent)),
      "--accent-strong": toHex(hslToRgb(shift(accent, -0.09))),
      "--accent-soft": toHex(hslToRgb(desat(accent, 0.92, 0.7))),
      "--accent-softer": toHex(hslToRgb(desat(accent, 0.965, 0.55))),
      "--on-accent": "#ffffff",
    };
  }

  // Dark: the accent has to read against a near-black page, so it is fitted
  // upward against the surface instead, and carries dark text.
  const surface = { r: 26, g: 32, b: 46 };
  const accent = fit(shift(h, 0.2), surface, 4.5, +1);
  const ink = contrast(hslToRgb(accent), WHITE) >= 4.5 ? "#ffffff" : "#101828";
  return {
    "--accent": toHex(hslToRgb(accent)),
    "--accent-strong": toHex(hslToRgb(shift(accent, 0.08))),
    "--accent-soft": toHex(hslToRgb(desat(accent, 0.22, 0.5))),
    "--accent-softer": toHex(hslToRgb(desat(accent, 0.16, 0.4))),
    "--on-accent": ink,
  };
}

// ---- what people can choose ------------------------------------------------
const DEFAULT_ACCENT = "#3b6cf5";

const PRESETS = [
  { id: "sampaguita", label: "Sampaguita", hex: DEFAULT_ACCENT, note: "the default" },
  { id: "malachite", label: "Malachite", hex: "#18a571" },
  { id: "tanglaw", label: "Tanglaw", hex: "#d99411" },
  { id: "gumamela", label: "Gumamela", hex: "#e1474d" },
  { id: "dagat", label: "Dagat", hex: "#2c8fb8" },
  { id: "ube", label: "Ube", hex: "#7b5cf0" },
  { id: "kape", label: "Kape", hex: "#8a5a3b" },
  { id: "damo", label: "Damo", hex: "#5b8c2a" },
];

// Every one of these is on Google Fonts and is loaded only when chosen, so
// picking a font costs one stylesheet, never six.
const FONTS = [
  { id: "jakarta", label: "Plus Jakarta Sans", note: "the default",
    google: "Plus+Jakarta+Sans:wght@400;500;600;700;800",
    stack: '"Plus Jakarta Sans", system-ui, sans-serif' },
  { id: "inter", label: "Inter", note: "made for screens",
    google: "Inter:wght@400;500;600;700;800",
    stack: '"Inter", system-ui, sans-serif' },
  { id: "lato", label: "Lato", note: "softer, rounder",
    google: "Lato:wght@400;700;900",
    stack: '"Lato", system-ui, sans-serif' },
  { id: "atkinson", label: "Atkinson Hyperlegible", note: "for tired eyes — every letter is shaped differently",
    google: "Atkinson+Hyperlegible:wght@400;700",
    stack: '"Atkinson Hyperlegible", system-ui, sans-serif' },
  { id: "serif", label: "Source Serif 4", note: "reads like a document",
    google: "Source+Serif+4:wght@400;600;700",
    stack: '"Source Serif 4", Georgia, serif' },
  { id: "mono", label: "JetBrains Mono", note: "every character the same width",
    google: "JetBrains+Mono:wght@400;500;700",
    stack: '"JetBrains Mono", ui-monospace, monospace' },
];

const MODES = ["light", "dark", "auto"];

// ---- reading and writing ---------------------------------------------------
// Everything that comes back out of the database goes through here. The column
// is JSONB and nothing stops a bad row, so a preference that is not recognised
// falls back to the default rather than reaching a template.
function normalize(raw) {
  const p = raw && typeof raw === "object" ? raw : {};
  const mode = MODES.includes(p.mode) ? p.mode : "light";
  const preset = PRESETS.find((x) => x.id === p.preset);
  const custom = hexToRgb(p.accent) ? String(p.accent).toLowerCase() : null;
  const font = FONTS.find((f) => f.id === p.font) ? p.font : "jakarta";
  return {
    mode,
    preset: preset ? preset.id : custom ? "custom" : "sampaguita",
    accent: custom || (preset ? preset.hex : DEFAULT_ACCENT),
    font,
    animations: p.animations === false ? false : true,
  };
}

// From a submitted form. Same validation, but the accent is only kept when the
// person actually asked for a custom one.
function fromForm(body) {
  const b = body || {};
  const wantsCustom = b.preset === "custom";
  const preset = PRESETS.find((x) => x.id === b.preset);
  return normalize({
    mode: b.mode,
    preset: wantsCustom ? undefined : preset && preset.id,
    accent: wantsCustom ? b.accent : undefined,
    font: b.font,
    animations: b.animations === "on" || b.animations === "true" || b.animations === true,
  });
}

// The <style> block the layout drops in the head. Written server-side and
// inline on purpose: a stylesheet or a script would arrive after the first
// paint, and the page would flash the default theme before switching. On
// "auto" both palettes are emitted and prefers-color-scheme picks.
function cssFor(prefs) {
  const p = normalize(prefs);
  const light = accentRamp(p.accent, false);
  const dark = accentRamp(p.accent, true);
  const font = FONTS.find((f) => f.id === p.font) || FONTS[0];
  const vars = (o) => Object.entries(o).map(([k, v]) => `${k}:${v}`).join(";");
  const family = `--font-app:${font.stack}`;

  // Written as :root[data-theme="…"] to match the weight of the dark palette
  // in public/css/src.css. Equal specificity, and this arrives later in the
  // head, so the account's own accent wins. A bare :root here would lose.
  if (p.mode === "light") return `:root[data-theme="light"]{${vars(light)};${family}}`;
  if (p.mode === "dark") return `:root[data-theme="dark"]{${vars(dark)};${family}}`;
  return `:root[data-theme="auto"]{${vars(light)};${family}}` +
         `@media (prefers-color-scheme: dark){:root[data-theme="auto"]{${vars(dark)}}}`;
}

// The Google Fonts URL for the chosen face. JetBrains Mono is always included
// because the app uses it for numbers regardless of this setting.
function fontHref(prefs) {
  const font = FONTS.find((f) => f.id === normalize(prefs).font) || FONTS[0];
  const families = [font.google];
  if (font.id !== "mono") families.push("JetBrains+Mono:wght@400;500");
  return "https://fonts.googleapis.com/css2?" +
    families.map((f) => "family=" + f).join("&") + "&display=swap";
}

// What the layout needs, in one object.
//
// Memoised because this runs on every rendered page and the accent ramp walks
// the lightness a step at a time looking for the contrast threshold — cheap,
// but pointless to repeat for a preference that has not changed. The key is
// the resolved preference itself, so two staff with the same taste share an
// entry and a change invalidates on its own. Bounded because the key space is
// a free-text hex; a clinic has a handful of accounts, so this never fills,
// but an unbounded cache keyed on user input is how a slow leak starts.
const cache = new Map();
const CACHE_MAX = 200;

function forUser(rawPrefs) {
  const p = normalize(rawPrefs);
  const key = `${p.mode}|${p.accent}|${p.font}|${p.animations}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = { mode: p.mode, css: cssFor(p), fontHref: fontHref(p), animations: p.animations, prefs: p };
    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(key, hit);
  }
  return hit;
}

// Every face at once, for the settings page only. The list there shows each
// option set in its own typeface, which is the only useful way to choose one —
// and without this they would all render in whichever font is already active,
// so every row would look identical and the preview would be worthless. One
// extra stylesheet, on one page, that nobody loads twice.
function allFontsHref() {
  return "https://fonts.googleapis.com/css2?" +
    FONTS.map((f) => "family=" + f.google).join("&") + "&display=swap";
}

module.exports = {
  PRESETS, FONTS, MODES, DEFAULT_ACCENT, allFontsHref,
  normalize, fromForm, cssFor, fontHref, forUser, accentRamp, contrast, hexToRgb,
};

// sound-settings.js — one volume setting for the whole game: master, music and effects sliders plus a
// mute switch, remembered on this device. Every part of the game that makes sound (the level music in
// music.js, the home screen, the prologue and the cutscenes) multiplies its own levels by these, so the
// player sets their volume once and it holds everywhere.
//
//   sound.musicGain() / sound.effectsGain()   0..1, ready to put on a GainNode (mute and master included)
//   sound.subscribe(fn)                        call fn whenever a setting changes; returns an unsubscribe
//   sound.set({ master, music, effects, muted })
//   mountSoundWidget()                         the speaker button and slider panel (always on top)

const KEY = "clearpath-sound";
const DEFAULTS = { master: 0.8, music: 0.7, effects: 0.85, muted: false };

let settings = { ...DEFAULTS };
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || "null");
  if (saved) settings = { ...DEFAULTS, ...saved };
  else if (localStorage.getItem("clearpath-music") === "off") settings.muted = true; // the older on/off setting
} catch { /* no storage: defaults */ }

const listeners = new Set();
// Sliders feel even when the gain follows the square of the slider (ears hear loudness logarithmically).
const curve = (v) => v * v;

export const sound = {
  get() { return { ...settings }; },
  set(patch) {
    settings = { ...settings, ...patch };
    for (const k of ["master", "music", "effects"]) settings[k] = Math.max(0, Math.min(1, Number(settings[k]) || 0));
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* not saved */ }
    for (const fn of listeners) fn(settings);
  },
  toggleMute() { sound.set({ muted: !settings.muted }); return !settings.muted; },
  get on() { return !settings.muted; },
  musicGain() { return settings.muted ? 0 : curve(settings.master) * curve(settings.music) / (curve(DEFAULTS.master) * curve(DEFAULTS.music)); },
  effectsGain() { return settings.muted ? 0 : curve(settings.master) * curve(settings.effects) / (curve(DEFAULTS.master) * curve(DEFAULTS.effects)); },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

/** Smoothly set a GainNode to base × the current music or effects level, and keep it there. */
export function followVolume(ac, gainNode, kind, base = 1) {
  const apply = () => {
    const v = base * (kind === "music" ? sound.musicGain() : sound.effectsGain());
    try { gainNode.gain.setTargetAtTime(v, ac.currentTime, 0.04); } catch { /* context closed */ }
  };
  gainNode.gain.value = base * (kind === "music" ? sound.musicGain() : sound.effectsGain());
  return sound.subscribe(apply);
}

// ---------- The widget: a speaker button in the corner that opens three sliders and a mute switch ----------
let mounted = false;
export function mountSoundWidget() {
  if (mounted) return;
  mounted = true;
  const style = document.createElement("style");
  style.textContent = `
    #sound-widget { position: fixed; top: 12px; right: 12px; z-index: 2147483000; font: 600 13px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif; color: #e8eef8; }
    #sound-widget .sw-btn { width: 40px; height: 40px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.25); background: rgba(10,14,22,0.82);
      color: inherit; cursor: pointer; display: grid; place-items: center; box-shadow: 0 6px 16px rgba(0,0,0,0.4); }
    #sound-widget .sw-btn:hover, #sound-widget .sw-btn:focus-visible { border-color: #ffd166; outline: none; }
    #sound-widget .sw-btn svg { width: 20px; height: 20px; }
    #sound-widget .sw-panel { position: absolute; top: 48px; right: 0; width: 230px; padding: 12px 14px 10px; border-radius: 12px;
      background: rgba(10,14,22,0.94); border: 1px solid rgba(255,255,255,0.18); box-shadow: 0 14px 34px rgba(0,0,0,0.55); }
    #sound-widget .sw-panel[hidden] { display: none; }
    #sound-widget h2 { margin: 0 0 8px; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: #93a3bb; }
    #sound-widget label { display: grid; grid-template-columns: 62px 1fr 34px; align-items: center; gap: 8px; margin: 6px 0; }
    #sound-widget input[type=range] { width: 100%; accent-color: #ffd166; }
    #sound-widget output { text-align: right; font-variant-numeric: tabular-nums; color: #93a3bb; }
    #sound-widget .sw-mute { margin-top: 6px; width: 100%; padding: 7px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2);
      background: rgba(255,255,255,0.06); color: inherit; font: inherit; cursor: pointer; }
    #sound-widget .sw-mute[aria-pressed="true"] { background: #ff5a6e; border-color: #ff5a6e; color: #1a0508; }
    #sound-widget .sw-hint { margin: 6px 0 0; font-weight: 400; font-size: 11px; color: #93a3bb; }
    @media (max-width: 820px) { #sound-widget { top: auto; bottom: 12px; right: auto; left: 12px; } #sound-widget .sw-panel { top: auto; bottom: 48px; left: 0; right: auto; } }
  `;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.id = "sound-widget";
  root.innerHTML = `
    <button class="sw-btn" type="button" aria-label="Sound settings" aria-expanded="false" title="Sound settings"></button>
    <div class="sw-panel" role="dialog" aria-label="Sound settings" hidden>
      <h2>Sound</h2>
      <label>Volume <input type="range" min="0" max="100" step="1" data-k="master" aria-label="Overall volume"><output></output></label>
      <label>Music <input type="range" min="0" max="100" step="1" data-k="music" aria-label="Music volume"><output></output></label>
      <label>Effects <input type="range" min="0" max="100" step="1" data-k="effects" aria-label="Sound effects volume"><output></output></label>
      <button class="sw-mute" type="button" aria-pressed="false">Mute all</button>
      <p class="sw-hint">In a level, N mutes and unmutes.</p>
    </div>`;
  document.body.appendChild(root);
  const btn = root.querySelector(".sw-btn"), panel = root.querySelector(".sw-panel"), mute = root.querySelector(".sw-mute");

  const icon = (on, level) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/>${on ? (level > 0.05 ? '<path d="M16 9a4 4 0 0 1 0 6"/>' : "") + (level > 0.45 ? '<path d="M18.5 6.5a8 8 0 0 1 0 11"/>' : "") : '<path d="M16 9l5 6M21 9l-5 6"/>'}</svg>`;
  const render = (s) => {
    for (const input of root.querySelectorAll("input")) {
      const v = Math.round(s[input.dataset.k] * 100);
      if (Number(input.value) !== v) input.value = String(v);
      input.nextElementSibling.textContent = `${v}`;
    }
    mute.setAttribute("aria-pressed", String(s.muted));
    mute.textContent = s.muted ? "Muted: click to unmute" : "Mute all";
    btn.innerHTML = icon(!s.muted, s.master);
  };
  render(settings);
  sound.subscribe(render);

  root.addEventListener("input", (e) => {
    const k = e.target.dataset?.k;
    if (k) sound.set({ [k]: Number(e.target.value) / 100, ...(settings.muted && Number(e.target.value) > 0 ? { muted: false } : {}) });
  });
  mute.addEventListener("click", () => sound.toggleMute());
  const open = (on) => { panel.hidden = !on; btn.setAttribute("aria-expanded", String(on)); };
  btn.addEventListener("click", () => open(panel.hidden));
  document.addEventListener("pointerdown", (e) => { if (!root.contains(e.target)) open(false); });
  // Keys used on the panel (arrows on a slider; Enter, Space or Escape on its buttons) are the panel's:
  // stop them reaching the game, the home screen or a cutscene. Other keys (N, moving) still get through.
  // Registered first, in the capture phase, so it runs before everyone else's key handlers.
  window.addEventListener("keydown", (e) => {
    if (!root.contains(e.target)) return;
    if (e.target.tagName !== "INPUT" && !["Enter", " ", "Escape"].includes(e.key)) return;
    e.stopImmediatePropagation();
    if (e.key === "Escape") { open(false); btn.blur(); }
  }, true);
}

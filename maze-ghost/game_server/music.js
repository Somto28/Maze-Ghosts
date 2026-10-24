// music.js — the soundtrack while you play, and the game's sound effects. Everything is synthesized
// live with the Web Audio API (no audio files).
//
// The track, "Floor Plan", is a slow, swung, late-night groove in the spirit of a casino-lounge card
// game theme: a woozy, slightly detuned lead over jazzy ninth chords. It mixes:
//   * chillwave / chillsynth: wide detuned-saw pads that pump with the beat, tape hiss and a slow
//     tape "wow" that bends every note a few cents;
//   * nu jazz: a Rhodes-style electric piano comping minor-ninth chords, swung 16ths, a walking bass;
//   * progressive electronic: a filtered 16th-note arpeggio that builds level by level and opens up
//     when a Warden gets close;
//   * ambient dub: offbeat chord "skanks" and rimshots thrown into a dotted-eighth echo, long reverb.
// It's a 16-bar loop (two 8-bar sections), and it grows with the levels: Level 1 is sparse, and each
// level adds layers, nudges the tempo up and, from Level 4, shifts the key up.
//
//   music.start()              after the first click or key press (browsers block sound before that)
//   music.setLevel(i)          0-5: picks the arrangement
//   music.setActive(on)        fade out while a cutscene or the menu has its own sound
//   music.setTension(0..1)     how close the nearest enemy is
//   music.caught()             a tape-stop on the music plus the "caught" sting
//   music.resume()             start again after a catch
//   music.escaped()            a short rising chime
//   music.toggle()             mute / unmute everything (remembered in localStorage)

const KEY = "clearpath-music";

// ---------- The score (MIDI note numbers, D minor; 16 steps per bar) ----------
// Section A: Dm9 | Bbmaj9 | Gm9 | A7(b13), twice. Section B: Dm9 | Fmaj9 | Em7(b5) | A7(b9), twice.
const CHORDS = {
  Dm9: { bass: 38, voicing: [65, 69, 72, 76], scale: [62, 64, 65, 67, 69, 71, 72] },
  Bbmaj9: { bass: 34, voicing: [62, 65, 69, 72], scale: [62, 65, 67, 69, 70, 72, 74] },
  Gm9: { bass: 31, voicing: [58, 62, 65, 69], scale: [62, 65, 67, 69, 70, 72, 74] },
  A7b13: { bass: 33, voicing: [55, 61, 65, 69], scale: [61, 64, 65, 67, 69, 70, 73] },
  Fmaj9: { bass: 29, voicing: [57, 60, 64, 67], scale: [60, 62, 64, 65, 67, 69, 72] },
  Em7b5: { bass: 28, voicing: [55, 58, 62, 64], scale: [62, 64, 65, 67, 70, 72, 74] },
  A7b9: { bass: 33, voicing: [55, 61, 64, 70], scale: [61, 64, 67, 69, 70, 73, 76] },
};
const FORM = ["Dm9", "Bbmaj9", "Gm9", "A7b13", "Dm9", "Bbmaj9", "Gm9", "A7b13", "Dm9", "Fmaj9", "Em7b5", "A7b9", "Dm9", "Fmaj9", "Em7b5", "A7b9"];

// The lead: a lazy, bluesy line, [step, note, length in steps]; one 4-bar phrase per section.
const LEAD_A = [
  [[0, 69, 6], [6, 67, 2], [8, 65, 4], [12, 64, 2], [14, 62, 2]],
  [[0, 65, 8], [10, 62, 2], [12, 65, 2], [14, 69, 2]],
  [[0, 70, 6], [6, 69, 2], [8, 67, 6], [14, 65, 2]],
  [[0, 64, 4], [4, 61, 4], [8, 64, 2], [10, 67, 2], [12, 69, 4]],
];
const LEAD_B = [
  [[0, 74, 4], [4, 72, 2], [6, 69, 6], [12, 65, 4]],
  [[0, 69, 6], [6, 67, 2], [8, 64, 8]],
  [[0, 67, 4], [4, 70, 4], [8, 69, 4], [12, 67, 4]],
  [[0, 70, 3], [3, 69, 3], [6, 67, 2], [8, 65, 2], [10, 64, 2], [12, 61, 4]],
];

// Each level's arrangement. tempo in BPM, key shift in semitones.
const LEVELS = [
  { tempo: 86, key: 0, drums: 1, rim: false, lead: true, arp: false, skank: false, shaker: false },
  { tempo: 88, key: 0, drums: 1, rim: true, lead: true, arp: false, skank: false, shaker: false },
  { tempo: 90, key: 0, drums: 2, rim: true, lead: true, arp: false, skank: true, shaker: false },
  { tempo: 91, key: 2, drums: 2, rim: true, lead: true, arp: true, skank: true, shaker: true },
  { tempo: 92, key: 2, drums: 2, rim: true, lead: true, arp: true, skank: true, shaker: true },
  { tempo: 94, key: 5, drums: 3, rim: true, lead: true, arp: true, skank: true, shaker: true },
];

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

let AC = null, out = null, musicIn = null, musicFilter = null, sfxBus = null, padBus = null;
let reverb = null, echo = null, echoTime = null, pitch = null, noiseBuf = null, hiss = null;
let level = LEVELS[0], levelIndex = 0, tension = 0, smoothTension = 0;
let timer = 0, nextTime = 0, step = 0, state = "off"; // off | playing | paused | stopped
let wanted = true, active = true;
try { wanted = localStorage.getItem(KEY) !== "off"; } catch { /* no storage: default on */ }

// ---------- Setup ----------
function setup() {
  if (AC) return true;
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch { return false; }
  const comp = AC.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
  out = AC.createGain(); out.gain.value = wanted ? 1 : 0;
  out.connect(comp).connect(AC.destination);

  musicFilter = AC.createBiquadFilter(); musicFilter.type = "lowpass"; musicFilter.frequency.value = 18000;
  musicIn = AC.createGain(); musicIn.gain.value = 0;
  musicIn.connect(musicFilter);
  const musicLevel = AC.createGain(); musicLevel.gain.value = 0.42;
  musicFilter.connect(musicLevel).connect(out);
  sfxBus = AC.createGain(); sfxBus.gain.value = 1; sfxBus.connect(out);

  // Reverb: a generated impulse (decaying stereo noise).
  reverb = AC.createConvolver();
  reverb.buffer = impulse(3.2, 2.6);
  const revOut = AC.createGain(); revOut.gain.value = 0.55;
  reverb.connect(revOut).connect(musicIn);

  // Dub echo: dotted-eighth delay, filtered and fed back, so each repeat gets darker.
  echo = AC.createDelay(2); echoTime = echo.delayTime;
  const fb = AC.createGain(); fb.gain.value = 0.48;
  const tone = AC.createBiquadFilter(); tone.type = "lowpass"; tone.frequency.value = 2200;
  const hp = AC.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 220;
  echo.connect(tone).connect(hp).connect(fb).connect(echo);
  const echoOut = AC.createGain(); echoOut.gain.value = 0.5;
  hp.connect(echoOut).connect(musicIn);
  echoOut.connect(reverb);

  // Tape wow: every music voice's pitch follows this (a slow drift of a few cents; the tape stop
  // when you're caught pulls it down two octaves).
  pitch = AC.createConstantSource(); pitch.offset.value = 0; pitch.start();
  const wow = AC.createOscillator(); wow.frequency.value = 0.31;
  const wowDepth = AC.createGain(); wowDepth.gain.value = 7;
  wow.connect(wowDepth).connect(pitch.offset); wow.start();

  padBus = AC.createGain(); padBus.gain.value = 1; padBus.connect(musicIn);

  noiseBuf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  // Tape hiss bed.
  hiss = AC.createBufferSource(); hiss.buffer = noiseBuf; hiss.loop = true;
  const hf = AC.createBiquadFilter(); hf.type = "bandpass"; hf.frequency.value = 4200; hf.Q.value = 0.6;
  const hg = AC.createGain(); hg.gain.value = 0.022;
  hiss.connect(hf).connect(hg).connect(musicIn); hiss.start();

  document.addEventListener("visibilitychange", () => {
    if (!AC) return;
    if (document.hidden) AC.suspend(); else if (wanted) AC.resume();
  });
  return true;
}

function impulse(seconds, decay) {
  const len = Math.floor(AC.sampleRate * seconds), buf = AC.createBuffer(2, len, AC.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

// ---------- Voices ----------
// Connect a voice to the dry mix and, optionally, the reverb and the echo.
function route(node, { dry = 1, verb = 0, dub = 0, bus = musicIn } = {}) {
  if (dry) { const g = AC.createGain(); g.gain.value = dry; node.connect(g).connect(bus); }
  if (verb) { const g = AC.createGain(); g.gain.value = verb; node.connect(g).connect(reverb); }
  if (dub) { const g = AC.createGain(); g.gain.value = dub; node.connect(g).connect(echo); }
}
function osc(type, freq, t, end, { detune = 0, wow = true } = {}) {
  const o = AC.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
  if (wow) pitch.connect(o.detune);
  o.start(t); o.stop(end);
  o.onended = () => { try { pitch.disconnect(o.detune); } catch { /* already gone */ } };
  return o;
}
function env(t, a, peak, d, sustain, release, end) {
  const g = AC.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.setTargetAtTime(sustain, t + a, d);
  g.gain.setTargetAtTime(0, end, release);
  return g;
}

// Electric piano: a sine with a little FM for the bell attack.
function rhodes(note, t, len, vel, sends) {
  const f = mtof(note), end = t + len;
  const car = osc("sine", f, t, end + 1.2), mod = osc("sine", f, t, end + 1.2);
  const depth = AC.createGain();
  depth.gain.setValueAtTime(f * 1.6 * vel, t); depth.gain.setTargetAtTime(f * 0.15, t, 0.12);
  mod.connect(depth).connect(car.frequency);
  const g = env(t, 0.005, 0.17 * vel, 0.35, 0.075 * vel, 0.25, end);
  car.connect(g);
  route(g, sends);
}

// Pad: two detuned saws per note, through one soft lowpass per chord.
function pad(notes, t, len) {
  const lp = AC.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 0.7;
  lp.frequency.setValueAtTime(1100, t); lp.frequency.linearRampToValueAtTime(2400, t + len * 0.6); lp.frequency.linearRampToValueAtTime(1300, t + len);
  const g = env(t, 0.5, 0.06, 1, 0.055, 0.6, t + len);
  lp.connect(g);
  for (const n of notes) for (const dt of [-9, 9]) osc("sawtooth", mtof(n), t, t + len + 2.5, { detune: dt }).connect(lp);
  g.connect(padBus);
  const v = AC.createGain(); v.gain.value = 0.6; g.connect(v).connect(reverb);
}

function bassNote(note, t, len) {
  const f = mtof(note), end = t + len;
  // Triangle for the body, a little saw so it still reads on laptop speakers, a quiet sub underneath.
  const a = osc("triangle", f, t, end + 0.3), b = osc("sine", f / 2, t, end + 0.3), c = osc("sawtooth", f, t, end + 0.3);
  const lp = AC.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1100;
  const g = env(t, 0.008, 0.2, 0.25, 0.14, 0.06, end);
  const sub = AC.createGain(); sub.gain.value = 0.25;
  const grit = AC.createGain(); grit.gain.value = 0.35; c.connect(grit).connect(lp);
  a.connect(lp); b.connect(sub).connect(lp); lp.connect(g);
  route(g, { dry: 1, verb: 0.05 });
}

// The lead: square and saw, detuned, with vibrato that fades in and a little slide into each note.
let lastLead = 0;
function lead(note, t, len) {
  const f = mtof(note), end = t + len;
  const from = lastLead ? mtof(lastLead) : f;
  lastLead = note;
  const lp = AC.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2800; lp.Q.value = 1.4;
  const vib = AC.createOscillator(); vib.frequency.value = 5.2;
  const vibDepth = AC.createGain(); vibDepth.gain.setValueAtTime(0, t); vibDepth.gain.linearRampToValueAtTime(16, t + Math.min(0.5, len));
  vib.connect(vibDepth); vib.start(t); vib.stop(end + 0.5);
  for (const [type, dt, lvl] of [["square", -6, 0.5], ["sawtooth", 7, 0.5], ["sine", 0, 0.7]]) {
    const o = osc(type, from, t, end + 0.5, { detune: dt });
    o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    vibDepth.connect(o.detune);
    const lv = AC.createGain(); lv.gain.value = lvl; o.connect(lv).connect(lp);
  }
  const g = env(t, 0.03, 0.085, 0.4, 0.065, 0.12, end);
  lp.connect(g);
  route(g, { dry: 1, verb: 0.45, dub: 0.22 });
}

function arpNote(note, t, cutoff) {
  const lp = AC.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 6;
  lp.frequency.setValueAtTime(cutoff * 2.2, t); lp.frequency.exponentialRampToValueAtTime(cutoff, t + 0.09);
  osc("sawtooth", mtof(note), t, t + 0.3).connect(lp);
  const g = env(t, 0.002, 0.05, 0.06, 0.0, 0.03, t + 0.12);
  lp.connect(g);
  route(g, { dry: 1, verb: 0.2, dub: 0.35 });
}

function noise(t, len, type, freq, q, vol, sends = { dry: 1 }) {
  const src = AC.createBufferSource(); src.buffer = noiseBuf;
  if (src.detune) {
    pitch.connect(src.detune);
    src.onended = () => { try { pitch.disconnect(src.detune); } catch { /* gone */ } };
  }
  const f = AC.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = AC.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + len);
  src.connect(f).connect(g);
  src.start(t, Math.random()); src.stop(t + len + 0.05);
  route(g, sends);
}
function kick(t, vol = 1) {
  const o = osc("sine", 120, t, t + 0.45);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
  const g = AC.createGain(); g.gain.setValueAtTime(0.3 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.36);
  o.connect(g); route(g, { dry: 1 });
}
function rim(t, vol, dub) {
  noise(t, 0.12, "bandpass", 2100, 1.2, 0.26 * vol, { dry: 1, verb: 0.35, dub });
  const o = osc("triangle", 360, t, t + 0.08); o.frequency.exponentialRampToValueAtTime(190, t + 0.05);
  const g = AC.createGain(); g.gain.setValueAtTime(0.06 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  o.connect(g); route(g, { dry: 1, verb: 0.2, dub });
}

// ---------- The sequencer ----------
const beatLen = () => 60 / level.tempo;
const stepLen = () => beatLen() / 4;

function scheduleStep(s, t) {
  const bar = Math.floor(s / 16) % FORM.length, st = s % 16, cycle = Math.floor(s / (16 * FORM.length));
  const sectionB = bar >= 8;
  const ch = CHORDS[FORM[bar]], k = level.key;
  const nextCh = CHORDS[FORM[(bar + 1) % FORM.length]];
  const swing = st % 2 === 1 ? stepLen() * 0.28 : 0; // swung 16ths
  const at = t + swing;
  const intro = cycle === 0 && bar < 2; // the first two bars: pads and keys only
  const T = smoothTension;

  // Pad: the whole bar, pumping with the beat (chillwave sidechain).
  if (st === 0) pad(ch.voicing.map((n) => n + k - 12), t, beatLen() * 4);
  if (st % 4 === 0) {
    padBus.gain.setValueAtTime(0.45, t);
    padBus.gain.linearRampToValueAtTime(1, t + beatLen() * 0.55);
  }

  // Electric piano: nu-jazz comping in section A, dub "skanks" on the offbeats in section B.
  const skank = level.skank && sectionB;
  const comp = skank ? [2, 6, 10, 14] : bar % 2 === 0 ? [0, 3, 10] : [6, 11, 14];
  if (comp.includes(st)) {
    const vel = st === 0 ? 0.9 : 0.6 + Math.random() * 0.2;
    const len = skank ? stepLen() * 1.2 : stepLen() * (st === 0 ? 6 : 2.5);
    for (const n of ch.voicing) rhodes(n + k, at, len, vel, { dry: 1, verb: 0.35, dub: skank ? 0.4 : 0.12 });
  }

  // Bass: root and fifth with a chromatic walk into the next chord.
  if (!intro) {
    const r = ch.bass + k, next = nextCh.bass + k;
    const line = bar % 2 === 0
      ? [[0, r, 5], [6, r + 7, 2], [10, r + 12, 2], [14, next + (next > r ? -1 : 1), 2]]
      : [[0, r, 3], [3, r, 2], [8, r + 7, 3], [12, r + 10, 2], [14, next + 2, 2]];
    for (const [s0, n, len] of line) if (s0 === st) bassNote(n, at, stepLen() * len * 0.95);
  }

  // Drums.
  if (!intro && level.drums) {
    if (st === 0 || st === 10 || (level.drums > 1 && st === 7 && bar % 4 === 3)) kick(at, st === 0 ? 1 : 0.75);
    if (level.rim && (st === 4 || st === 12)) rim(at, 1, st === 12 && bar % 4 === 3 ? 0.6 : 0.05);
    if (level.drums > 1 && (st === 9 || st === 15) && Math.random() < 0.35) rim(at, 0.3, 0); // ghost notes
    const hatOn = level.drums > 1 || T > 0.4 ? st % 2 === 0 || T > 0.7 : st % 4 === 2;
    if (hatOn) noise(at, st === 14 && bar % 2 === 1 ? 0.18 : 0.035, "highpass", 6500, 0.7, (st % 4 === 2 ? 0.2 : 0.12) * (0.7 + T * 0.6), { dry: 1, verb: 0.1 });
    if (level.shaker && st % 2 === 1) noise(at, 0.06, "bandpass", 5200, 2, 0.05, { dry: 1 });
  }

  // Lead: plays in every other pass of each section, so the groove gets room to breathe.
  if (level.lead && !intro && Math.floor(bar / 4) % 2 === 1) {
    const phrase = (sectionB ? LEAD_B : LEAD_A)[bar % 4];
    for (const [s0, n, len] of phrase) if (s0 === st) lead(n + k, at, stepLen() * len * 0.92);
  }

  // Arpeggio: chord tones climbing in 16ths; brighter when a Warden is close.
  if ((level.arp || T > 0.55) && !intro) {
    const tones = [...ch.voicing, ...ch.voicing.map((n) => n + 12)];
    const order = [0, 2, 1, 3, 4, 6, 5, 7];
    const vol = level.arp ? 1 : T;
    if (vol > 0.2) arpNote(tones[order[st % 8]] + k, at, 500 + 900 * (bar % 8) / 8 + 2600 * T);
  }

  // Close Wardens: a soft low heartbeat on the beat.
  if (T > 0.6 && st % 4 === 0) {
    const o = osc("sine", 55, t, t + 0.3); o.frequency.exponentialRampToValueAtTime(40, t + 0.2);
    const g = AC.createGain(); g.gain.setValueAtTime(0.14 * T, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    o.connect(g).connect(musicIn);
  }

  // Vinyl crackle, now and then.
  if (Math.random() < 0.18) noise(t + Math.random() * stepLen(), 0.012, "highpass", 3000, 0.5, 0.05 + Math.random() * 0.05, { dry: 1 });
}

function tick() {
  if (state !== "playing") return;
  smoothTension += (tension - smoothTension) * 0.08;
  const now = AC.currentTime;
  if (nextTime < now - 0.1) nextTime = now + 0.05; // the tab was asleep: don't try to catch up
  while (nextTime < now + 0.3) {
    scheduleStep(step, nextTime);
    nextTime += stepLen();
    step++;
  }
}

function play(fromStep) {
  if (!AC || state === "playing") return;
  if (fromStep !== undefined) step = fromStep;
  const now = AC.currentTime;
  pitch.offset.cancelScheduledValues(now); pitch.offset.setValueAtTime(0, now);
  musicFilter.frequency.cancelScheduledValues(now); musicFilter.frequency.setValueAtTime(18000, now);
  musicIn.gain.cancelScheduledValues(now); musicIn.gain.setValueAtTime(musicIn.gain.value, now);
  musicIn.gain.linearRampToValueAtTime(1, now + 1.2);
  echoTime.setValueAtTime(beatLen() * 0.75, now);
  nextTime = now + 0.08;
  state = "playing";
  clearInterval(timer);
  timer = setInterval(tick, 40);
}

function fadeOut(seconds, next) {
  clearInterval(timer);
  state = next;
  if (!AC) return;
  const now = AC.currentTime;
  musicIn.gain.cancelScheduledValues(now); musicIn.gain.setValueAtTime(musicIn.gain.value, now);
  musicIn.gain.linearRampToValueAtTime(0, now + seconds);
}

// ---------- Sound effects ----------
function sfxTone(type, f0, f1, t, len, vol, { verb = 0.3 } = {}) {
  const o = AC.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + len);
  const g = AC.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + len);
  o.connect(g); o.start(t); o.stop(t + len + 0.05);
  g.connect(sfxBus);
  if (verb) { const v = AC.createGain(); v.gain.value = verb; g.connect(v).connect(reverb); }
}
function sfxNoise(t, len, type, freq, vol) {
  const src = AC.createBufferSource(); src.buffer = noiseBuf;
  const f = AC.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const g = AC.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + len);
  src.connect(f).connect(g).connect(sfxBus); src.start(t, Math.random()); src.stop(t + len + 0.05);
}

// Caught: a heavy hit, the Warden's lock-on chatter, a falling two-tone alarm and a dark, detuned chord.
function caughtSting() {
  const t = AC.currentTime + 0.02;
  sfxTone("sine", 150, 45, t, 0.45, 0.45, { verb: 0 }); // impact
  sfxNoise(t, 0.25, "lowpass", 1400, 0.5);
  for (let i = 0; i < 9; i++) sfxTone("square", 600 + Math.random() * 1800, 600 + Math.random() * 1800, t + 0.05 + i * 0.032, 0.028, 0.09, { verb: 0.1 }); // lock-on data chatter
  sfxTone("square", 880, 698, t + 0.34, 0.22, 0.15); // "uh-" ...
  sfxTone("square", 659, 415, t + 0.58, 0.42, 0.15); // ... "-oh", bending down
  for (const [n, dt] of [[50, -14], [53, 12], [56, -8], [63, 10]]) { // Dm(b5, b9) stab, closing down
    const f = mtof(n), o = AC.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.detune.value = dt;
    o.frequency.setValueAtTime(f, t + 0.6); o.frequency.exponentialRampToValueAtTime(f * 0.94, t + 2.2);
    const lp = AC.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(2400, t + 0.6); lp.frequency.exponentialRampToValueAtTime(180, t + 2.1);
    const g = AC.createGain(); g.gain.setValueAtTime(0, t + 0.6); g.gain.linearRampToValueAtTime(0.08, t + 0.64); g.gain.exponentialRampToValueAtTime(0.0008, t + 2.3);
    o.connect(lp).connect(g); o.start(t + 0.6); o.stop(t + 2.4);
    g.connect(sfxBus); const v = AC.createGain(); v.gain.value = 0.6; g.connect(v).connect(reverb);
  }
}

function escapeChime() {
  const t = AC.currentTime + 0.02, k = level.key;
  [62, 65, 69, 72, 76, 81].forEach((n, i) => sfxTone("triangle", mtof(n + k), mtof(n + k), t + i * 0.07, 0.6, 0.07, { verb: 0.5 }));
  sfxTone("sine", mtof(86 + k), mtof(86 + k), t + 0.45, 1.2, 0.04, { verb: 0.8 });
}

// ---------- Public ----------
export const music = {
  /** Call from a click or key press. Safe to call again. */
  start() {
    if (!setup()) return;
    if (AC.state === "suspended" && wanted) AC.resume?.().catch?.(() => {});
    if (state === "off" && active) play(0);
  },
  setLevel(i) {
    const n = Math.max(0, Math.min(LEVELS.length - 1, i));
    if (n === levelIndex && level === LEVELS[n]) return;
    levelIndex = n; level = LEVELS[n];
    if (AC) echoTime.setValueAtTime(beatLen() * 0.75, AC.currentTime);
  },
  setTension(x) { tension = Math.max(0, Math.min(1, x)); },
  /** false while a cutscene, the prologue or the home screen is up (they have their own sound). */
  setActive(on) {
    if (on === active) return;
    active = on;
    if (!AC) return;
    if (!on && state === "playing") fadeOut(0.6, "paused");
    else if (on && state === "paused") play();
    else if (on && state === "off" && AC.state !== "closed") play(0); // started while the menu was up
  },
  /** The music tape-stops and the caught sting plays. resume() brings the music back. */
  caught() {
    if (!AC) return;
    if (state === "playing") {
      const now = AC.currentTime;
      pitch.offset.cancelScheduledValues(now); pitch.offset.setValueAtTime(0, now);
      pitch.offset.linearRampToValueAtTime(-2400, now + 0.9);
      musicFilter.frequency.cancelScheduledValues(now); musicFilter.frequency.setValueAtTime(18000, now);
      musicFilter.frequency.exponentialRampToValueAtTime(250, now + 0.9);
      fadeOut(0.95, "stopped");
    }
    caughtSting();
  },
  /** After a catch (or a restart): the groove comes back in from bar 3. */
  resume() {
    if (!AC || !active) return;
    if (state === "stopped") play(32);
  },
  escaped() { if (AC) escapeChime(); },
  toggle() {
    wanted = !wanted;
    try { localStorage.setItem(KEY, wanted ? "on" : "off"); } catch { /* not saved */ }
    if (AC) {
      out.gain.setTargetAtTime(wanted ? 1 : 0, AC.currentTime, 0.05);
      if (wanted) AC.resume();
    }
    return wanted;
  },
  get on() { return wanted; },
  get state() { return state; }, // "off" | "playing" | "paused" | "stopped"
  /** Testing and previews: schedule everything up to `seconds` now (e.g. on an OfflineAudioContext). */
  _scheduleUntil(seconds) { while (state === "playing" && nextTime < seconds) { scheduleStep(step, nextTime); nextTime += stepLen(); step++; } },
};

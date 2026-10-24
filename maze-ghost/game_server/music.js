// music.js — the soundtrack while you play, and the game's sound effects. Everything is synthesized
// live with the Web Audio API (no audio files).
//
// Every level has its own track. They're one family: they share a five-note "Warden motif" (fifth,
// fourth, minor third, root, second: in A minor, E-D-C-A-B), the same synth palette, a slow tape wobble
// on every note and a dub echo. Each track then fits its place in the story:
//
//   1 The Basement     "Lights Out"       A minor, 80 BPM. Ambient dub: dark pulse-width pads, dub chord
//                                           stabs echoing into the dark, sub bass, water drips and the hum
//                                           of a failing tube light. Lonely: you've just found the lab.
//   2 The Server Halls "Racks"            E minor, 98 BPM. Chillsynth: pumping supersaw pads, a square-wave
//                                           data arpeggio, blinking-LED blips, four-on-the-floor, fan noise.
//                                           The Wardens are starting to predict you.
//   3 The Core         "Proving Ground"   D minor, 108 BPM. Progressive electronic: a driving octave bass
//                                           whose filter keeps opening, gated supersaw stabs, metallic
//                                           percussion, a robotic formant lead, scanner sweeps and machine
//                                           rumble. Dr. Voss has just fed them your data.
//   4 The Data Vault   "Cold Storage"     F# minor, 88 BPM. Chillwave: glassy FM bells, a shimmering
//                                           high pad, a slow reese bass, a half-time beat and cold air.
//                                           A careful heist.
//   5 The Archive      "Floor 88"         D minor, 90 BPM, swung. Nu jazz on synths: FM electric piano,
//                                           a juno-style chorus pad, a plucked synth bass walking between
//                                           ninth chords, dub skanks, and the woozy, detuned lead of a
//                                           casino lounge. You're sneaking through the bosses' floor.
//   6 The Uplink       "Broadcast"        G minor, 116 BPM. Synthwave finale: huge sidechained supersaws,
//                                           a filtered arpeggio, punchy drums and tom fills, a soaring saw
//                                           lead with the motif as an anthem, radio static and morse beeps.
//
// Each track runs 32 bars: an intro, a groove (A), the lead (B), a breakdown with a riser, and
// everything together (C). Then it starts again from the top, for as long as you're on the level. It
// keeps playing through catches and retries; it only changes when the level does, and then the old
// track and all its echoes stop at once. The music also reacts to danger: when an enemy is close, a
// low heartbeat and a filtered arpeggio come in and the hats double up.
//
// Volume: everything follows the player's settings in sound-settings.js (master, music, effects, mute).
//
//   music.start()              after the first click or key press (browsers block sound before that)
//   music.setLevel(i)          0-5: picks the track
//   music.setActive(on)        fade out while a cutscene or the menu has its own sound
//   music.setTension(0..1)     how close the nearest enemy is
//   music.caught()             the "caught" sting; the music dips for a moment and keeps going
//   music.escaped()            a short rising chime
//   music.toggle()             mute / unmute all of the game's sound

import { followVolume, sound } from "./sound-settings.js";

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Shared nodes. musicIn / reverb / echo / pump point at the CURRENT track's own chain (see newChain):
// each track has its own reverb and echo, so when the level changes the old track's notes, echoes and
// reverb tails are cut off with it and never bleed into the next level.
let AC = null, out = null, musicMaster = null, musicFilter = null, sfxBus = null, sfxReverb = null;
let musicIn = null, reverb = null, echo = null, pump = null, chain = null, irBuffer = null;
let pitch = null, noiseBuf = null, lastLead = null;
let track = null, trackIndex = -1, tension = 0, smoothTension = 0;
let timer = 0, nextTime = 0, step = 0, state = "off"; // off | playing | paused
let active = true;

// ---------- Setup ----------
function setup() {
  if (AC) return true;
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch { return false; }
  // A gentle compressor on everything, so music and effects sit at an even level. (Web Audio's compressor
  // adds its own make-up gain; the levels below were set by measuring the output, see the README.)
  const comp = AC.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
  out = AC.createGain(); out.gain.value = 1;
  out.connect(comp).connect(AC.destination);

  // Music: track chains -> master (pause fades, the duck when you're caught) -> level -> player's volume.
  musicMaster = AC.createGain(); musicMaster.gain.value = 0;
  musicFilter = AC.createBiquadFilter(); musicFilter.type = "lowpass"; musicFilter.frequency.value = 18000;
  const musicLevel = AC.createGain(); musicLevel.gain.value = 0.42;
  const musicVol = AC.createGain();
  followVolume(AC, musicVol, "music");
  musicMaster.connect(musicFilter).connect(musicLevel).connect(musicVol).connect(out);

  sfxBus = AC.createGain();
  followVolume(AC, sfxBus, "effects");
  sfxBus.connect(out);
  irBuffer = impulse(3.4, 2.5);
  sfxReverb = AC.createConvolver(); sfxReverb.buffer = irBuffer;
  const sfxRev = AC.createGain(); sfxRev.gain.value = 0.5;
  sfxReverb.connect(sfxRev).connect(sfxBus);

  // Tape wow: every voice's pitch drifts a few cents with this.
  pitch = AC.createConstantSource(); pitch.offset.value = 0; pitch.start();
  const wow = AC.createOscillator(); wow.frequency.value = 0.31;
  const wowDepth = AC.createGain(); wowDepth.gain.value = 7;
  wow.connect(wowDepth).connect(pitch.offset); wow.start();

  noiseBuf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  document.addEventListener("visibilitychange", () => {
    if (!AC) return;
    if (document.hidden) AC.suspend(); else AC.resume?.().catch?.(() => {});
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

// One track's private signal chain: its own bus, reverb, dub echo (filtered in the feedback loop so
// each repeat gets darker) and sidechain pump. Retired chains fade out fast and are disconnected.
function newChain() {
  const c = { stops: [] };
  c.gain = AC.createGain(); c.gain.gain.value = track.gain; c.gain.connect(musicMaster);
  c.bus = AC.createGain(); c.bus.connect(c.gain);
  c.reverb = AC.createConvolver(); c.reverb.buffer = irBuffer;
  const revOut = AC.createGain(); revOut.gain.value = 0.55;
  c.reverb.connect(revOut).connect(c.bus);
  c.echo = AC.createDelay(2);
  c.echo.delayTime.value = (60 / track.tempo) * track.echo;
  const fb = AC.createGain(); fb.gain.value = 0.46;
  const lp = AC.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2400;
  const hp = AC.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 240;
  c.echo.connect(lp).connect(hp).connect(fb).connect(c.echo);
  const echoOut = AC.createGain(); echoOut.gain.value = 0.5;
  hp.connect(echoOut).connect(c.bus);
  echoOut.connect(c.reverb);
  c.pump = AC.createGain(); c.pump.gain.value = 1; c.pump.connect(c.bus);
  chain = c;
  musicIn = c.bus; reverb = c.reverb; echo = c.echo; pump = c.pump;
  startAmbience(track.ambience);
  lastLead = null;
  return c;
}
function retireChain(c, seconds = 0.12) {
  if (!c) return;
  const now = AC.currentTime;
  c.gain.gain.cancelScheduledValues(now); c.gain.gain.setValueAtTime(c.gain.gain.value, now);
  c.gain.gain.linearRampToValueAtTime(0, now + seconds);
  setTimeout(() => { for (const st of c.stops) { try { st.stop(); } catch { /* done */ } } try { c.gain.disconnect(); } catch { /* gone */ } }, seconds * 1000 + 400);
  if (chain === c) chain = null;
}

// ---------- Building blocks ----------
// Send a voice to the dry mix (or the pump) and optionally the reverb and the echo.
function route(node, { dry = 1, verb = 0, dub = 0, bus = musicIn } = {}) {
  if (dry) { const g = AC.createGain(); g.gain.value = dry; node.connect(g).connect(bus); }
  if (verb) { const g = AC.createGain(); g.gain.value = verb; node.connect(g).connect(reverb); }
  if (dub) { const g = AC.createGain(); g.gain.value = dub; node.connect(g).connect(echo); }
}
function osc(type, freq, t, end, detune = 0) {
  const o = AC.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
  pitch.connect(o.detune);
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
function filter(type, freq, q = 0.7) { const f = AC.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; }
function noiseSrc(t, end, rate = 1) {
  const src = AC.createBufferSource(); src.buffer = noiseBuf; src.loop = true; src.playbackRate.value = rate;
  src.start(t, Math.random() * 1.5); src.stop(end);
  return src;
}

// ---------- Instruments ----------
const I = {
  // Supersaw: several detuned saws per note. Chords, pads and stabs.
  supersaw(notes, t, len, { vol = 0.05, cut = 2400, cutTo = cut, attack = 0.02, release = 0.4, voices = 5, spread = 22, verb = 0.4, dub = 0, pumped = true } = {}) {
    const lp = filter("lowpass", cut, 0.8);
    lp.frequency.setValueAtTime(cut, t); lp.frequency.linearRampToValueAtTime(cutTo, t + len);
    const g = env(t, attack, vol, Math.max(0.05, len * 0.4), vol * 0.8, release, t + len);
    lp.connect(g);
    for (const n of notes) for (let v = 0; v < voices; v++) {
      const dt = voices === 1 ? 0 : (v / (voices - 1) - 0.5) * 2 * spread;
      const o = osc("sawtooth", mtof(n), t, t + len + release * 5, dt);
      const lv = AC.createGain(); lv.gain.value = 1 / Math.sqrt(voices); o.connect(lv).connect(lp);
    }
    route(g, { dry: 1, verb, dub, bus: pumped ? pump : musicIn });
  },
  // Pulse-width-style pad: two squares a few cents apart, dark and slow.
  pwmPad(notes, t, len, { vol = 0.035, cut = 900, verb = 0.6 } = {}) {
    const lp = filter("lowpass", cut, 0.6);
    lp.frequency.setValueAtTime(cut * 0.7, t); lp.frequency.linearRampToValueAtTime(cut * 1.3, t + len * 0.6); lp.frequency.linearRampToValueAtTime(cut, t + len);
    const g = env(t, 0.6, vol, 1, vol * 0.9, 0.8, t + len);
    lp.connect(g);
    for (const n of notes) for (const dt of [-11, 11]) osc("square", mtof(n), t, t + len + 4, dt).connect(lp);
    route(g, { dry: 1, verb, bus: pump });
  },
  // Pluck: a bright saw (or square) with a fast filter envelope. Arps, stabs, plucked bass.
  pluck(note, t, { vol = 0.05, cut = 900, peak = 5000, decay = 0.12, type = "sawtooth", len = 0.25, q = 4, verb = 0.2, dub = 0, bus = musicIn } = {}) {
    const lp = filter("lowpass", peak, q);
    lp.frequency.setValueAtTime(peak, t); lp.frequency.exponentialRampToValueAtTime(cut, t + decay);
    osc(type, mtof(note), t, t + len + 0.3).connect(lp);
    const g = env(t, 0.003, vol, decay * 1.5, vol * 0.15, 0.05, t + len);
    lp.connect(g);
    route(g, { dry: 1, verb, dub, bus });
  },
  // FM bell / glass: a sine modulated at a bright ratio, ringing out.
  bell(note, t, { vol = 0.05, ratio = 3.5, index = 2.2, decay = 1.6, verb = 0.6, dub = 0.25 } = {}) {
    const f = mtof(note);
    const car = osc("sine", f, t, t + decay * 2), mod = osc("sine", f * ratio, t, t + decay * 2);
    const depth = AC.createGain(); depth.gain.setValueAtTime(f * index, t); depth.gain.exponentialRampToValueAtTime(f * 0.05, t + decay);
    mod.connect(depth).connect(car.frequency);
    const g = AC.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + decay * 2);
    car.connect(g);
    route(g, { dry: 1, verb, dub });
  },
  // FM electric piano (Rhodes-like).
  ep(note, t, len, { vol = 0.15, verb = 0.35, dub = 0.12 } = {}) {
    const f = mtof(note), end = t + len;
    const car = osc("sine", f, t, end + 1.2), mod = osc("sine", f, t, end + 1.2);
    const depth = AC.createGain(); depth.gain.setValueAtTime(f * 1.6, t); depth.gain.setTargetAtTime(f * 0.15, t, 0.12);
    mod.connect(depth).connect(car.frequency);
    const g = env(t, 0.005, vol, 0.35, vol * 0.45, 0.25, end);
    car.connect(g);
    route(g, { dry: 1, verb, dub });
  },
  sub(note, t, len, { vol = 0.22 } = {}) {
    const g = env(t, 0.01, vol, 0.3, vol * 0.8, 0.08, t + len);
    osc("sine", mtof(note), t, t + len + 0.5).connect(g);
    route(g, { dry: 1 });
  },
  // Reese: two detuned saws through a slowly moving lowpass. Deep and restless.
  reese(note, t, len, { vol = 0.1, cut = 380 } = {}) {
    const lp = filter("lowpass", cut, 2);
    lp.frequency.setValueAtTime(cut * 0.6, t); lp.frequency.linearRampToValueAtTime(cut * 1.5, t + len * 0.5); lp.frequency.linearRampToValueAtTime(cut * 0.7, t + len);
    for (const dt of [-16, 16]) osc("sawtooth", mtof(note), t, t + len + 0.6, dt).connect(lp);
    osc("sine", mtof(note), t, t + len + 0.6).connect(lp);
    const g = env(t, 0.05, vol, 0.4, vol * 0.85, 0.15, t + len);
    lp.connect(g);
    route(g, { dry: 1, verb: 0.05 });
  },
  // Synth bass: saw + sub with a short filter pluck.
  bass(note, t, len, { vol = 0.16, cut = 500, peak = 1800, q = 3 } = {}) {
    const lp = filter("lowpass", peak, q);
    lp.frequency.setValueAtTime(peak, t); lp.frequency.exponentialRampToValueAtTime(cut, t + 0.15);
    osc("sawtooth", mtof(note), t, t + len + 0.3).connect(lp);
    const s = osc("sine", mtof(note - 12), t, t + len + 0.3), sg = AC.createGain(); sg.gain.value = 0.35; s.connect(sg).connect(lp);
    const g = env(t, 0.005, vol, 0.2, vol * 0.7, 0.05, t + len);
    lp.connect(g);
    route(g, { dry: 1 });
  },
  // Leads. "woozy": square + saw + sine, slow vibrato (the lounge lead). "saw": bright and soaring.
  // "glass": soft triangle with lots of echo. "robot": a saw through two vowel-like bandpasses.
  lead(note, t, len, { kind = "woozy", vol = 0.08, from = null, verb = 0.45, dub = 0.22 } = {}) {
    const f = mtof(note), end = t + len, start = from ? mtof(from) : f;
    const mix = { woozy: [["square", -6, 0.5], ["sawtooth", 7, 0.5], ["sine", 0, 0.7]], saw: [["sawtooth", -9, 0.6], ["sawtooth", 9, 0.6], ["square", 0, 0.35]],
      glass: [["triangle", 0, 1], ["sine", 1200, 0.25]], robot: [["sawtooth", 0, 0.9], ["square", -12, 0.3]], whistle: [["sine", 0, 1], ["triangle", 5, 0.4]] }[kind];
    const vib = AC.createOscillator(); vib.frequency.value = kind === "robot" ? 0 : 5.2;
    const vibDepth = AC.createGain(); vibDepth.gain.setValueAtTime(0, t); vibDepth.gain.linearRampToValueAtTime(kind === "glass" ? 8 : 16, t + Math.min(0.5, len));
    vib.connect(vibDepth); vib.start(t); vib.stop(end + 0.6);
    const sum = AC.createGain();
    for (const [type, dt, lvl] of mix) {
      const o = osc(type, start, t, end + 0.6, dt);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
      vibDepth.connect(o.detune);
      const lv = AC.createGain(); lv.gain.value = lvl; o.connect(lv).connect(sum);
    }
    let tail = sum;
    if (kind === "robot") {
      const merge = AC.createGain();
      for (const [fq, lvl] of [[800, 1], [1500, 0.8], [2600, 0.4]]) { const bp = filter("bandpass", fq, 5); const lg = AC.createGain(); lg.gain.value = lvl * 3; sum.connect(bp).connect(lg).connect(merge); }
      tail = merge;
    } else {
      const lp = filter("lowpass", kind === "saw" ? 4200 : kind === "glass" ? 3200 : 2800, 1.2);
      sum.connect(lp); tail = lp;
    }
    const g = env(t, kind === "glass" ? 0.06 : 0.025, vol, 0.4, vol * 0.75, 0.15, end);
    tail.connect(g);
    route(g, { dry: 1, verb, dub });
  },
};

// ---------- Drums and effects ----------
function noiseHit(t, len, type, freq, q, vol, sends = { dry: 1 }) {
  const src = AC.createBufferSource(); src.buffer = noiseBuf;
  if (src.detune) { pitch.connect(src.detune); src.onended = () => { try { pitch.disconnect(src.detune); } catch { /* gone */ } }; }
  const f = filter(type, freq, q);
  const g = AC.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + len);
  src.connect(f).connect(g);
  src.start(t, Math.random()); src.stop(t + len + 0.05);
  route(g, sends);
}
const D = {
  kick(t, { vol = 1, from = 130, to = 42, decay = 0.36, pumpIt = true } = {}) {
    const o = osc("sine", from, t, t + decay + 0.1);
    o.frequency.exponentialRampToValueAtTime(to, t + 0.12);
    const g = AC.createGain(); g.gain.setValueAtTime(0.24 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    o.connect(g); route(g, { dry: 1 });
    noiseHit(t, 0.012, "highpass", 3000, 0.7, 0.06 * vol); // click
    if (pumpIt) { pump.gain.cancelScheduledValues(t); pump.gain.setValueAtTime(0.3, t); pump.gain.setTargetAtTime(1, t + 0.03, 0.09); }
  },
  snare(t, { vol = 1, verb = 0.3, dub = 0 } = {}) {
    noiseHit(t, 0.18, "bandpass", 1800, 0.8, 0.22 * vol, { dry: 1, verb, dub });
    const o = osc("triangle", 220, t, t + 0.12); o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    const g = AC.createGain(); g.gain.setValueAtTime(0.12 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(g); route(g, { dry: 1, verb: verb * 0.5 });
  },
  clap(t, { vol = 1, verb = 0.35 } = {}) {
    for (const dt of [0, 0.011, 0.022]) noiseHit(t + dt, dt === 0.022 ? 0.16 : 0.02, "bandpass", 1300, 1.4, 0.2 * vol, { dry: 1, verb });
  },
  rim(t, { vol = 1, dub = 0.05 } = {}) {
    noiseHit(t, 0.1, "bandpass", 2100, 1.2, 0.22 * vol, { dry: 1, verb: 0.35, dub });
    const o = osc("triangle", 360, t, t + 0.08); o.frequency.exponentialRampToValueAtTime(190, t + 0.05);
    const g = AC.createGain(); g.gain.setValueAtTime(0.06 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.connect(g); route(g, { dry: 1, verb: 0.2, dub });
  },
  hat(t, { vol = 1, open = false } = {}) { noiseHit(t, open ? 0.22 : 0.045, "highpass", 6500, 0.7, 0.19 * vol, { dry: 1, verb: 0.08 }); },
  shaker(t, vol = 1) { noiseHit(t, 0.06, "bandpass", 5400, 2, 0.05 * vol); },
  // Metallic hit: inharmonic FM, like a hammer on a steel panel.
  metal(t, { vol = 1, f = 420 } = {}) {
    const car = osc("square", f, t, t + 0.3), mod = osc("square", f * 1.47, t, t + 0.3);
    const depth = AC.createGain(); depth.gain.value = f * 2.5; mod.connect(depth).connect(car.frequency);
    const bp = filter("bandpass", 3200, 1.5);
    const g = AC.createGain(); g.gain.setValueAtTime(0.05 * vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.22);
    car.connect(bp).connect(g); route(g, { dry: 1, verb: 0.25, dub: 0.15 });
  },
  tom(t, note, vol = 1) {
    const o = osc("sine", mtof(note) * 1.6, t, t + 0.4); o.frequency.exponentialRampToValueAtTime(mtof(note), t + 0.1);
    const g = AC.createGain(); g.gain.setValueAtTime(0.22 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g); route(g, { dry: 1, verb: 0.3 });
  },
};
const FX = {
  riser(t, len, { vol = 0.06 } = {}) { // noise sweeping up into the next section
    const src = noiseSrc(t, t + len + 0.1);
    const bp = filter("bandpass", 300, 3); bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(7000, t + len);
    const g = AC.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + len); g.gain.linearRampToValueAtTime(0, t + len + 0.05);
    src.connect(bp).connect(g); route(g, { dry: 1, verb: 0.3 });
  },
  drip(t, note, vol = 0.05) { // a water drop: a sine that falls in pitch, into the echo
    const o = osc("sine", mtof(note), t, t + 0.2); o.frequency.exponentialRampToValueAtTime(mtof(note - 7), t + 0.06);
    const g = AC.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.15);
    o.connect(g); route(g, { dry: 1, verb: 0.5, dub: 0.6 });
  },
  blip(t, note, vol = 0.025) { // a blinking LED
    const o = osc("square", mtof(note), t, t + 0.06);
    const g = AC.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.05);
    o.connect(g); route(g, { dry: 1, verb: 0.2, dub: 0.3 });
  },
  sweep(t, len, vol = 0.03) { // a scanner passing
    const o = osc("sine", 300, t, t + len + 0.1); o.frequency.exponentialRampToValueAtTime(2400, t + len * 0.5); o.frequency.exponentialRampToValueAtTime(300, t + len);
    const g = AC.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + len * 0.5); g.gain.linearRampToValueAtTime(0, t + len);
    o.connect(g); route(g, { dry: 1, verb: 0.4, dub: 0.3 });
  },
  static(t, len, vol = 0.03) { // a burst of radio static
    noiseHit(t, len, "bandpass", 2500 + Math.random() * 2000, 1, vol, { dry: 1, dub: 0.2 });
  },
  morse(t, unit, pattern, note = 93, vol = 0.03) { // "." and "-" as short sine beeps
    let at = t;
    for (const ch of pattern) {
      if (ch === " ") { at += unit * 2; continue; }
      const len = ch === "-" ? unit * 3 : unit;
      const o = osc("sine", mtof(note), at, at + len + 0.02);
      const g = AC.createGain(); g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vol, at + 0.005); g.gain.setValueAtTime(vol, at + len); g.gain.linearRampToValueAtTime(0, at + len + 0.01);
      o.connect(g); route(g, { dry: 1, dub: 0.3 });
      at += len + unit;
    }
  },
  heartbeat(t, vol) {
    for (const dt of [0, 0.18]) {
      const o = osc("sine", 58, t + dt, t + dt + 0.3); o.frequency.exponentialRampToValueAtTime(40, t + dt + 0.2);
      const g = AC.createGain(); g.gain.setValueAtTime(vol * (dt ? 0.6 : 1), t + dt); g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.25);
      o.connect(g).connect(musicIn);
    }
  },
};

// A continuous background texture per track (hum, fans, air, rain, wind), fading in on the track's chain.
function startAmbience(def) {
  if (!def) return;
  const now = AC.currentTime;
  const gain = AC.createGain(); gain.gain.setValueAtTime(0, now); gain.gain.setTargetAtTime(1, now, 0.8);
  gain.connect(musicIn);
  for (const layer of def) {
    const lv = AC.createGain(); lv.gain.value = layer.vol;
    if (layer.tone) { // a mains hum
      const o = AC.createOscillator(); o.type = "sawtooth"; o.frequency.value = layer.tone;
      const lp = filter("lowpass", layer.freq ?? 400, 1); o.connect(lp).connect(lv); o.start(); chain.stops.push(o);
    } else {
      const src = AC.createBufferSource(); src.buffer = noiseBuf; src.loop = true; src.playbackRate.value = layer.rate ?? 1;
      const f = filter(layer.type, layer.freq, layer.q ?? 0.7);
      src.connect(f).connect(lv); src.start(); chain.stops.push(src);
      if (layer.lfo) { // slow swell
        const l = AC.createOscillator(); l.frequency.value = layer.lfo; const ld = AC.createGain(); ld.gain.value = layer.vol * 0.8;
        l.connect(ld).connect(lv.gain); l.start(); chain.stops.push(l);
      }
    }
    lv.connect(gain);
  }
}

// ---------- The tracks ----------
// Chords are relative to the track's tonic: root (for the bass) and tones (the voicing, in semitones).
// Melodies: per bar of the 8-bar form, [step, semitones above the tonic an octave up, length in steps].
// The Warden motif is the opening of every melody: 7, 5, 3, 0, 2.
const TRACKS = [
  { // ---- 1. The Basement: "Lights Out" ----
    name: "Lights Out", tonic: 57, tempo: 80, swing: 0.16, echo: 0.75, gain: 1.05,
    ambience: [{ tone: 100, freq: 300, vol: 0.006 }, { type: "bandpass", freq: 900, q: 0.5, vol: 0.012, rate: 0.5 }],
    form: [["Am9", 0, [3, 7, 10, 14]], ["Am9", 0, [3, 7, 10, 14]], ["Fmaj9#11", -4, [0, 3, 7, 14]], ["Fmaj9#11", -4, [0, 3, 7, 14]],
      ["Dm9", 5, [8, 12, 15, 19]], ["Dm9", 5, [8, 12, 15, 19]], ["E7sus", 7, [10, 12, 14, 19]], ["E7b9", 7, [11, 14, 17, 20]]],
    melody: [[[0, 7, 8], [8, 5, 4], [12, 3, 4]], [[0, 0, 12], [12, 2, 4]], [[0, 3, 6], [6, 7, 2], [8, 8, 8]], [[0, 7, 16]],
      [[0, 12, 6], [6, 10, 2], [8, 8, 4], [12, 7, 4]], [[0, 5, 8], [8, 3, 8]], [[0, 2, 8], [8, 3, 4], [12, 5, 4]], [[0, 11, 8], [8, 7, 8]]],
    play(x) {
      const { st, ch, sec, t, n } = x;
      if (st === 0) I.pwmPad(ch.tones.map((s) => n(s)), t, x.barLen, { cut: sec === "C" ? 1300 : 900 });
      if (sec !== "intro" && st === 0) I.sub(n(ch.root - 12), t, x.barLen * 0.9, { vol: 0.2 });
      if (sec !== "intro" && sec !== "break" && st === 8) I.reese(n(ch.root - 12), t, x.stepLen * 7, { vol: 0.06, cut: 300 });
      // Dub chord stabs, echoing off into the dark.
      if ((sec === "A" || sec === "C" || sec === "B") && (st === 6 || st === 14) && x.bar % 2 === 1) for (const s of ch.tones.slice(1)) I.pluck(n(s), t, { type: "square", vol: 0.03, cut: 700, peak: 2400, decay: 0.08, len: 0.1, verb: 0.4, dub: 0.7 });
      if (sec !== "intro" && sec !== "break") {
        if (st === 0 || st === 11) D.kick(t, { vol: 0.8, from: 100, decay: 0.45, pumpIt: false });
        if (st === 8) D.rim(t, { vol: 0.9, dub: x.bar % 4 === 3 ? 0.7 : 0.15 });
        if (st % 4 === 2) D.hat(t, { vol: 0.55 });
      }
      if (Math.random() < 0.06) FX.drip(t + Math.random() * x.stepLen, n(31 + Math.floor(Math.random() * 6) * 2), 0.04);
      if (x.lead) x.melodyNote((note, len) => I.lead(note, t, len, { kind: "whistle", vol: 0.06, verb: 0.6, dub: 0.35 }));
    },
  },
  { // ---- 2. The Server Halls: "Racks" ----
    name: "Racks", tonic: 52, tempo: 98, swing: 0, echo: 0.75, gain: 1.65,
    ambience: [{ type: "lowpass", freq: 420, vol: 0.05, rate: 0.7, lfo: 0.07 }, { type: "bandpass", freq: 6000, q: 3, vol: 0.006 }],
    form: [["Em9", 0, [3, 7, 10, 14]], ["Em9", 0, [3, 7, 10, 14]], ["Cmaj9", -4, [0, 3, 7, 10]], ["Cmaj9", -4, [0, 3, 7, 10]],
      ["Am9", 5, [8, 12, 15, 19]], ["Am9", 5, [8, 12, 15, 19]], ["B7sus", 7, [10, 12, 14, 17]], ["B7", 7, [11, 14, 17, 19]]],
    melody: [[[0, 7, 2], [2, 5, 2], [4, 3, 2], [6, 0, 6], [12, 2, 4]], [[0, 3, 4], [4, 7, 4], [8, 10, 8]], [[0, 12, 6], [6, 10, 2], [8, 7, 8]], [[0, 8, 4], [4, 7, 4], [8, 5, 8]],
      [[0, 7, 2], [2, 5, 2], [4, 3, 2], [6, 0, 2], [8, 3, 2], [10, 7, 2], [12, 12, 4]], [[0, 14, 8], [8, 12, 8]], [[0, 15, 4], [4, 14, 4], [8, 12, 4], [12, 10, 4]], [[0, 11, 8], [8, 14, 8]]],
    play(x) {
      const { st, ch, sec, t, n } = x;
      if (st === 0) I.supersaw(ch.tones.map((s) => n(s)), t, x.barLen, { vol: 0.045, cut: sec === "intro" ? 900 : 1800, cutTo: 2600, attack: 0.25 });
      // The data arpeggio: square plucks over two octaves, with the odd "flipped bit".
      if (sec !== "break") {
        const tones = [...ch.tones, ...ch.tones.map((s) => s + 12)];
        const k = [0, 2, 4, 1, 3, 5, 7, 6][st % 8], flip = Math.random() < 0.08 ? 12 : 0;
        I.pluck(n(tones[k] + flip), t, { type: "square", vol: sec === "intro" ? 0.02 : 0.03, cut: 1400, peak: 4500, decay: 0.07, len: x.stepLen * 0.8, dub: 0.15 });
      }
      if (sec !== "intro" && sec !== "break") {
        if (st % 4 === 0) D.kick(t, { vol: 0.85 });
        if (st === 4 || st === 12) D.clap(t, { vol: 0.8 });
        if (st % 4 === 2) D.hat(t, { vol: 0.8 }); else if (st % 2 === 1) D.hat(t, { vol: 0.35 });
        if (st % 2 === 0) I.bass(n(ch.root - 12 + (st % 4 === 2 ? 12 : 0)), t, x.stepLen * 1.6, { vol: 0.12, cut: 450, peak: 1500 });
      } else if (sec === "break" && st === 0) I.sub(n(ch.root - 12), t, x.barLen, { vol: 0.09 });
      if (Math.random() < 0.12) FX.blip(t, n(36 + [0, 3, 7, 10, 12][Math.floor(Math.random() * 5)]), 0.02);
      if (sec === "break" && x.secBar === 3 && st === 0) FX.riser(t, x.barLen, { vol: 0.05 });
      if (x.lead) x.melodyNote((note, len, from) => I.lead(note, t, len, { kind: "saw", vol: 0.055, from, dub: 0.25 }));
    },
  },
  { // ---- 3. The Core: "Proving Ground" ----
    name: "Proving Ground", tonic: 50, tempo: 108, swing: 0, echo: 0.5, gain: 1.75,
    ambience: [{ type: "lowpass", freq: 140, vol: 0.12, rate: 0.5, lfo: 0.11 }, { tone: 50, freq: 200, vol: 0.004 }],
    form: [["Dm", 0, [3, 7, 12, 15]], ["Dm", 0, [3, 7, 12, 15]], ["Bb", -4, [0, 3, 8, 12]], ["Bb", -4, [0, 3, 8, 12]],
      ["C", -2, [2, 5, 10, 14]], ["C", -2, [2, 5, 10, 14]], ["Am", 7, [7, 10, 14, 19]], ["A7", 7, [7, 11, 14, 17]]],
    melody: [[[0, 7, 3], [3, 5, 3], [6, 3, 2], [8, 0, 4], [12, 2, 4]], [[0, 3, 2], [2, 3, 2], [4, 7, 4], [8, 5, 8]], [[0, 8, 3], [3, 7, 3], [6, 5, 2], [8, 3, 8]], [[0, 0, 8], [8, -2, 4], [12, 0, 4]],
      [[0, 10, 3], [3, 7, 3], [6, 5, 2], [8, 2, 8]], [[0, 5, 4], [4, 7, 4], [8, 10, 8]], [[0, 12, 3], [3, 10, 3], [6, 7, 2], [8, 3, 8]], [[0, 11, 4], [4, 14, 4], [8, 7, 8]]],
    play(x) {
      const { st, ch, sec, t, n } = x;
      const build = (x.cycleBar % 8) / 8; // the filter keeps opening through each 8 bars
      // Driving octave bass, every 8th.
      if (sec !== "break" && st % 2 === 0) I.bass(n(ch.root - 12 + (st % 4 === 2 ? 12 : 0)), t, x.stepLen * 1.5, { vol: 0.13, cut: 300 + 900 * build, peak: 1200 + 2500 * build, q: 6 });
      // Gated supersaw stabs on a fixed rhythm.
      if (sec !== "intro" && [0, 3, 6, 10, 12].includes(st)) I.supersaw(ch.tones.map((s) => n(s)), t, x.stepLen * 1.4, { vol: 0.04, cut: 1200 + 2800 * build, attack: 0.005, release: 0.05, voices: 4, verb: 0.25 });
      if (sec === "break" && st === 0) I.supersaw(ch.tones.map((s) => n(s)), t, x.barLen, { vol: 0.04, cut: 800, cutTo: 3000, attack: 0.5 });
      if (sec !== "intro" && sec !== "break") {
        if (st % 4 === 0) D.kick(t, { vol: 1, from: 150, decay: 0.3 });
        if (st === 4 || st === 12) { D.clap(t, { vol: 0.8 }); D.snare(t, { vol: 0.5 }); }
        D.hat(t, { vol: st % 4 === 2 ? 0.8 : 0.35 });
        if (st === 2 || st === 7 || st === 14) D.metal(t, { vol: 0.8, f: 380 + 40 * (st % 3) });
      }
      if (x.secBar % 4 === 0 && st === 8) FX.sweep(t, x.barLen * 0.5);
      if (sec === "break" && x.secBar === 3 && st === 0) FX.riser(t, x.barLen, { vol: 0.07 });
      if (x.lead) x.melodyNote((note, len) => I.lead(note, t, Math.min(len, 3) * x.stepLen, { kind: "robot", vol: 0.05, dub: 0.3 }), true);
    },
  },
  { // ---- 4. The Data Vault: "Cold Storage" ----
    name: "Cold Storage", tonic: 54, tempo: 88, swing: 0.08, echo: 0.75, gain: 1.8,
    ambience: [{ type: "highpass", freq: 5000, vol: 0.02, lfo: 0.05 }, { type: "bandpass", freq: 1200, q: 0.4, vol: 0.008, rate: 0.6 }],
    form: [["F#m9", 0, [3, 7, 10, 14]], ["F#m9", 0, [3, 7, 10, 14]], ["Dmaj9", -4, [0, 3, 7, 10]], ["Dmaj9", -4, [0, 3, 7, 10]],
      ["Bm9", 5, [8, 12, 15, 19]], ["Bm9", 5, [8, 12, 15, 19]], ["C#7sus", 7, [12, 14, 17, 19]], ["C#7b9", 7, [11, 14, 17, 20]]],
    melody: [[[0, 7, 6], [6, 5, 2], [8, 3, 6], [14, 0, 2]], [[0, 2, 8], [8, 3, 8]], [[0, 7, 6], [6, 10, 2], [8, 12, 8]], [[0, 10, 16]],
      [[0, 15, 6], [6, 14, 2], [8, 12, 6], [14, 10, 2]], [[0, 12, 8], [8, 7, 8]], [[0, 14, 4], [4, 12, 4], [8, 10, 4], [12, 7, 4]], [[0, 11, 8], [8, 7, 8]]],
    play(x) {
      const { st, ch, sec, t, n } = x;
      if (st === 0) I.supersaw(ch.tones.map((s) => n(s + 12)), t, x.barLen, { vol: 0.03, cut: 3500, attack: 0.8, release: 1.2, verb: 0.8, pumped: false });
      if (st === 0 && sec !== "intro") I.reese(n(ch.root - 12), t, x.barLen, { vol: 0.055, cut: 340 });
      // Glass bells: a slow arpeggio, every dotted 8th.
      if (st % 3 === 0 && st < 15) I.bell(n(ch.tones[(st / 3 + x.bar) % 4] + 12), t, { vol: sec === "intro" ? 0.03 : 0.04, decay: 1.4 });
      // Crystal arp in the full section.
      if (sec === "C" && st % 2 === 1) I.pluck(n(ch.tones[(st >> 1) % 4] + 24), t, { type: "triangle", vol: 0.025, cut: 3000, peak: 8000, decay: 0.08, dub: 0.3 });
      if (sec !== "intro" && sec !== "break") {
        if (st === 0 || st === 10) D.kick(t, { vol: 0.85, decay: 0.45 });
        if (st === 8) D.snare(t, { vol: 0.8, verb: 0.7 });
        if (st % 2 === 0) D.hat(t, { vol: st % 4 === 2 ? 0.6 : 0.3 });
        if (st >= 13 && x.bar % 4 === 3) D.hat(t + x.stepLen / 2, { vol: 0.3 });
      }
      if (sec === "break" && x.secBar === 3 && st === 0) FX.riser(t, x.barLen, { vol: 0.04 });
      if (x.lead) x.melodyNote((note, len) => I.lead(note, t, len, { kind: "glass", vol: 0.06, verb: 0.7, dub: 0.4 }));
    },
  },
  { // ---- 5. The Archive (Floor 88): "Floor 88" ----
    name: "Floor 88", tonic: 50, tempo: 90, swing: 0.28, echo: 0.75, gain: 1.05,
    ambience: [{ type: "bandpass", freq: 3000, q: 0.5, vol: 0.014, rate: 0.8, lfo: 0.09 }, { type: "lowpass", freq: 600, vol: 0.02, rate: 0.4 }],
    form: [["Dm9", 0, [15, 19, 22, 26]], ["Bbmaj9", -4, [12, 15, 19, 22]], ["Gm9", 5, [8, 12, 15, 19]], ["A7b13", 7, [5, 11, 15, 19]],
      ["Dm9", 0, [15, 19, 22, 26]], ["Fmaj9", 3, [7, 10, 14, 17]], ["Em7b5", 2, [5, 8, 12, 14]], ["A7b9", 7, [5, 11, 14, 20]]],
    melody: [[[0, 7, 6], [6, 5, 2], [8, 3, 4], [12, 2, 2], [14, 0, 2]], [[0, 3, 8], [10, 0, 2], [12, 3, 2], [14, 7, 2]], [[0, 8, 6], [6, 7, 2], [8, 5, 6], [14, 3, 2]], [[0, 2, 4], [4, -1, 4], [8, 2, 2], [10, 5, 2], [12, 7, 4]],
      [[0, 12, 4], [4, 10, 2], [6, 7, 6], [12, 3, 4]], [[0, 7, 6], [6, 5, 2], [8, 2, 8]], [[0, 5, 4], [4, 8, 4], [8, 7, 4], [12, 5, 4]], [[0, 8, 3], [3, 7, 3], [6, 5, 2], [8, 3, 2], [10, 2, 2], [12, -1, 4]]],
    play(x) {
      const { st, ch, sec, t, n } = x;
      if (st === 0) I.supersaw(ch.tones.map((s) => n(s - 12)), t, x.barLen, { vol: 0.03, cut: 1600, cutTo: 2200, attack: 0.4, voices: 3, spread: 14, verb: 0.6 });
      // FM electric piano comping in A; dub skanks on the offbeats in C.
      const skank = sec === "C";
      const comp = skank ? [2, 6, 10, 14] : x.bar % 2 === 0 ? [0, 3, 10] : [6, 11, 14];
      if (sec !== "break" && comp.includes(st)) for (const s of ch.tones) I.ep(n(s), t, x.stepLen * (skank ? 1.2 : st === 0 ? 6 : 2.5), { vol: 0.13, dub: skank ? 0.4 : 0.12 });
      if (sec === "break" && st === 0) for (const s of ch.tones) I.ep(n(s), t, x.barLen, { vol: 0.11, dub: 0.3 });
      // A plucked synth bass walking into the next chord.
      if (sec !== "intro" && sec !== "break") {
        const r = n(ch.root - 12), next = n(x.next.root - 12);
        const line = x.bar % 2 === 0 ? [[0, r, 5], [6, r + 7, 2], [10, r + 12, 2], [14, next + (next > r ? -1 : 1), 2]] : [[0, r, 3], [3, r, 2], [8, r + 7, 3], [12, r + 10, 2], [14, next + 2, 2]];
        for (const [s0, note, len] of line) if (s0 === st) I.bass(note, t, x.stepLen * len * 0.95, { vol: 0.14, cut: 380, peak: 1400, q: 2 });
        if (st === 0 || st === 10) D.kick(t, { vol: 0.75, pumpIt: false });
        if (st === 4 || st === 12) D.rim(t, { vol: 1, dub: st === 12 && x.bar % 4 === 3 ? 0.6 : 0.05 });
        if ((st === 9 || st === 15) && Math.random() < 0.35) D.rim(t, { vol: 0.3, dub: 0 });
        if (st % 2 === 0) D.hat(t, { vol: st % 4 === 2 ? 0.7 : 0.4, open: st === 14 && x.bar % 2 === 1 });
        if (st % 2 === 1) D.shaker(t, 0.8);
      }
      if (Math.random() < 0.15) noiseHit(t + Math.random() * x.stepLen, 0.012, "highpass", 3000, 0.5, 0.05); // vinyl crackle
      if (x.lead) x.melodyNote((note, len, from) => I.lead(note, t, len, { kind: "woozy", vol: 0.08, from }));
    },
  },
  { // ---- 6. The Uplink: "Broadcast" ----
    name: "Broadcast", tonic: 55, tempo: 116, swing: 0, echo: 0.75, gain: 1.5,
    ambience: [{ type: "bandpass", freq: 300, q: 0.4, vol: 0.05, rate: 0.6, lfo: 0.13 }, { type: "bandpass", freq: 3500, q: 2, vol: 0.006 }],
    form: [["Gm", 0, [3, 7, 12, 15]], ["Eb", -4, [0, 3, 8, 12]], ["Bb", 3, [7, 10, 15, 19]], ["F", -2, [2, 5, 10, 14]],
      ["Cm", 5, [8, 12, 17, 20]], ["Eb", -4, [0, 3, 8, 12]], ["F", -2, [2, 5, 10, 14]], ["D7", 7, [11, 14, 17, 19]]],
    melody: [[[0, 7, 4], [4, 5, 2], [6, 3, 2], [8, 0, 4], [12, 2, 4]], [[0, 3, 6], [6, 7, 2], [8, 8, 8]], [[0, 10, 4], [4, 12, 4], [8, 14, 8]], [[0, 12, 4], [4, 10, 4], [8, 9, 8]],
      [[0, 12, 4], [4, 15, 4], [8, 17, 4], [12, 15, 4]], [[0, 14, 4], [4, 12, 4], [8, 10, 8]], [[0, 12, 6], [6, 10, 2], [8, 9, 8]], [[0, 14, 4], [4, 11, 4], [8, 7, 4], [12, 11, 4]]],
    play(x) {
      const { st, ch, sec, t, n } = x;
      // Huge chords, pumping with the kick.
      if (st === 0) I.supersaw(ch.tones.map((s) => n(s)), t, x.barLen, { vol: sec === "intro" ? 0.035 : 0.05, cut: sec === "C" ? 4200 : 2400, attack: sec === "intro" ? 0.6 : 0.02, voices: 6, spread: 26 });
      // Filtered arpeggio in 16ths, its filter swinging slowly.
      if (sec !== "intro") {
        const tones = [...ch.tones, ...ch.tones.map((s) => s + 12)];
        const lfo = 0.5 + 0.5 * Math.sin((x.cycleBar * 16 + st) / 24);
        I.pluck(n(tones[[0, 1, 2, 3, 4, 3, 2, 1][st % 8]] + 12), t, { vol: 0.028, cut: 600 + 2400 * lfo, peak: 3000 + 4000 * lfo, decay: 0.09, len: x.stepLen * 0.9, dub: 0.2 });
      }
      if (sec !== "intro" && sec !== "break") {
        if (st % 4 === 0) D.kick(t, { vol: 1.05, from: 150, decay: 0.32 });
        if (st === 4 || st === 12) { D.snare(t, { vol: 0.7, verb: 0.4 }); D.clap(t, { vol: 0.7 }); }
        if (st % 4 === 2) D.hat(t, { vol: 0.8, open: true }); else D.hat(t, { vol: 0.35 });
        if (st % 2 === 0) I.bass(n(ch.root - 12 + (st % 4 === 2 ? 12 : 0)), t, x.stepLen * 1.6, { vol: 0.13, cut: 550, peak: 2000 });
        if (x.bar % 8 === 7 && st >= 12) D.tom(t, n(-12 + (15 - st) * 3), 0.9); // a fill into the next phrase
      }
      if (sec === "break" && st === 0) I.sub(n(ch.root - 12), t, x.barLen, { vol: 0.1 });
      if (sec === "break" && x.secBar === 3 && st === 0) FX.riser(t, x.barLen, { vol: 0.08 });
      if (Math.random() < 0.025) FX.static(t, 0.08 + Math.random() * 0.2, 0.025);
      if (x.bar % 4 === 2 && st === 0 && sec !== "C") FX.morse(t, x.stepLen * 0.5, "... --- ...", 93, 0.022); // the signal going out
      if (x.lead) x.melodyNote((note, len, from) => I.lead(note, t, len, { kind: "saw", vol: 0.065, from, verb: 0.5, dub: 0.25 }));
    },
  },
];

// Sections of each track, in bars: intro, A (groove), B (lead), break (with a riser), C (lead + all).
// That's the whole track (32 bars); at the end it starts again from the top, intro included.
const SECTIONS = [["intro", 4], ["A", 8], ["B", 8], ["break", 4], ["C", 8]];
const TRACK_BARS = SECTIONS.reduce((a, [, n]) => a + n, 0);
function sectionAt(bar) {
  let k = bar % TRACK_BARS;
  const cycleBar = k;
  for (const [sec, len] of SECTIONS) { if (k < len) return { sec, secBar: k, cycleBar }; k -= len; }
  return { sec: "A", secBar: 0, cycleBar };
}

// ---------- The sequencer ----------
const beatLen = () => 60 / track.tempo;
const stepLen = () => beatLen() / 4;
function scheduleStep(s, t0) {
  const bar = Math.floor(s / 16), st = s % 16;
  const { sec, secBar, cycleBar } = sectionAt(bar);
  const fi = secBar % track.form.length, // every section starts on the first chord
   [, root, tones] = track.form[fi], [, nroot] = track.form[(fi + 1) % track.form.length];
  const t = t0 + (st % 2 === 1 ? stepLen() * track.swing : 0);
  const n = (semi) => track.tonic + semi;
  const lead = sec === "B" || sec === "C";
  const x = {
    st, bar, sec, secBar, cycleBar, t, n, stepLen: stepLen(), barLen: beatLen() * 4, lead,
    ch: { root, tones }, next: { root: nroot },
    // Play this bar's melody note on this step, if there is one (an octave up from the tonic).
    melodyNote(play, staccato = false) {
      for (const [s0, semi, len] of track.melody[fi % track.melody.length]) {
        if (s0 !== st) continue;
        const note = n(semi + 12);
        play(note, staccato ? len : stepLen() * len * 0.92, lastLead);
        lastLead = note;
      }
    },
  };
  track.play(x);

  // Shared reactions to danger.
  const T = smoothTension;
  if (T > 0.6 && st % 8 === 0) FX.heartbeat(t0, 0.18 * T);
  if (T > 0.45 && st % 2 === 0) {
    const arp = [...tones, ...tones.map((v) => v + 12)];
    I.pluck(n(arp[(st >> 1) % 8] + 12), t, { vol: 0.02 * T, cut: 400 + 3000 * T, peak: 2500 + 4000 * T, decay: 0.06, dub: 0.25 });
  }
  if (T > 0.7 && st % 2 === 1) D.hat(t, { vol: 0.3 * T });
}

function tick() {
  if (state !== "playing") return;
  smoothTension += (tension - smoothTension) * 0.08;
  const now = AC.currentTime;
  if (nextTime < now - 0.1) nextTime = now + 0.05; // the tab was asleep: don't try to catch up
  while (nextTime < now + 0.3) {
    scheduleStep(step, nextTime);
    nextTime += stepLen();
    step = (step + 1) % (TRACK_BARS * 16); // the end of the track loops back to its start
  }
}

function play() {
  if (!AC || state === "playing") return;
  const now = AC.currentTime;
  if (!chain) newChain();
  musicMaster.gain.cancelScheduledValues(now); musicMaster.gain.setValueAtTime(musicMaster.gain.value, now);
  musicMaster.gain.linearRampToValueAtTime(1, now + 1);
  nextTime = now + 0.08;
  state = "playing";
  clearInterval(timer);
  timer = setInterval(tick, 40);
}

function pause(seconds) {
  clearInterval(timer);
  state = "paused";
  const now = AC.currentTime;
  musicMaster.gain.cancelScheduledValues(now); musicMaster.gain.setValueAtTime(musicMaster.gain.value, now);
  musicMaster.gain.linearRampToValueAtTime(0, now + seconds);
}

// ---------- Sound effects ----------
function sfxTone(type, f0, f1, t, len, vol, { verb = 0.3 } = {}) {
  const o = AC.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + len);
  const g = AC.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + len);
  o.connect(g); o.start(t); o.stop(t + len + 0.05);
  g.connect(sfxBus);
  if (verb) { const v = AC.createGain(); v.gain.value = verb; g.connect(v).connect(sfxReverb); }
}
function sfxNoise(t, len, type, freq, vol) {
  const src = AC.createBufferSource(); src.buffer = noiseBuf;
  const f = filter(type, freq);
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
  for (const [nn, dt] of [[50, -14], [53, 12], [56, -8], [63, 10]]) { // Dm(b5, b9) stab, closing down
    const f = mtof(nn), o = AC.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.detune.value = dt;
    o.frequency.setValueAtTime(f, t + 0.6); o.frequency.exponentialRampToValueAtTime(f * 0.94, t + 2.2);
    const lp = filter("lowpass", 2400); lp.frequency.setValueAtTime(2400, t + 0.6); lp.frequency.exponentialRampToValueAtTime(180, t + 2.1);
    const g = AC.createGain(); g.gain.setValueAtTime(0, t + 0.6); g.gain.linearRampToValueAtTime(0.08, t + 0.64); g.gain.exponentialRampToValueAtTime(0.0008, t + 2.3);
    o.connect(lp).connect(g); o.start(t + 0.6); o.stop(t + 2.4);
    g.connect(sfxBus); const v = AC.createGain(); v.gain.value = 0.6; g.connect(v).connect(sfxReverb);
  }
}

// Escaped: the Warden motif turned upside down and up a key: a rising chime in this track's key.
function escapeChime() {
  const t = AC.currentTime + 0.02, k = (track?.tonic ?? 57) + 12;
  [0, 3, 7, 10, 14, 19].forEach((s, i) => sfxTone("triangle", mtof(k + s), mtof(k + s), t + i * 0.07, 0.6, 0.07, { verb: 0.5 }));
  sfxTone("sine", mtof(k + 24), mtof(k + 24), t + 0.45, 1.2, 0.04, { verb: 0.8 });
}

// ---------- Public ----------
export const music = {
  /** Call from a click or key press. Safe to call again. */
  start() {
    if (!setup()) return;
    if (!track) music.setLevel(0);
    if (AC.state === "suspended") AC.resume?.().catch?.(() => {});
    if (state === "off" && active) play();
  },
  /** Switch to a level's track, from its start. The old track (and its echoes) stops at once. */
  setLevel(i) {
    const n = Math.max(0, Math.min(TRACKS.length - 1, i));
    if (n === trackIndex) return;
    trackIndex = n; track = TRACKS[n];
    step = 0;
    if (!AC) return;
    retireChain(chain);
    if (state === "playing") { newChain(); nextTime = AC.currentTime + 0.05; }
  },
  setTension(x) { tension = Math.max(0, Math.min(1, x)); },
  /** false while a cutscene, the prologue or the home screen is up (they have their own sound). */
  setActive(on) {
    if (on === active) return;
    active = on;
    if (!AC) return;
    if (!on && state === "playing") pause(0.5);
    else if (on && state !== "playing") play();
  },
  /** Caught: the caught sting plays over the music, which dips for a moment and carries on. */
  caught() {
    if (!AC) return;
    if (state === "playing") {
      const now = AC.currentTime, g = musicMaster.gain;
      g.cancelScheduledValues(now); g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0.35, now + 0.08); g.setValueAtTime(0.35, now + 1.1); g.linearRampToValueAtTime(1, now + 2.6);
    }
    caughtSting();
  },
  /** Kept for callers from before: the music no longer stops when you're caught, so nothing to do. */
  resume() {},
  escaped() { if (AC) escapeChime(); },
  /** Mute or unmute all of the game's sound (the same switch as the sound panel's). */
  toggle() { return sound.toggleMute(); },
  get on() { return sound.on; },
  get state() { return state; }, // "off" | "playing" | "paused"
  get track() { return track?.name ?? null; },
  /** The tracks' names, in level order. */
  get tracks() { return TRACKS.map((tr) => tr.name); },
  /** Testing and previews: schedule everything up to `seconds` now (e.g. on an OfflineAudioContext). */
  _scheduleUntil(seconds) { while (state === "playing" && nextTime < seconds) { scheduleStep(step, nextTime); nextTime += stepLen(); step = (step + 1) % (TRACK_BARS * 16); } },
};

// title-screen.js — the home screen for Clearpath: pixel-art title, menu, and a chiptune theme.
//
// The monitor on the right is a live demo, not a recording: a simple bot plays Level 1 or 2 against the
// real Warden AI from ../src (minimax with alpha-beta), and the red dots are the future the Warden predicts.
//
//   import { showTitleScreen, titleActive } from "./title-screen.js";
//   const choice = await showTitleScreen({ levels: game.levels });
//   // choice = { mode: "story" }  or  { mode: "level", index: 0 .. levels.length - 1 }
//
// While it's open it covers the screen and swallows every key, so the maze underneath can't move.
// Drawn in code on a 320×180 canvas (no image files); music is synthesized with the Web Audio API.

import { MazeGame, describeLevel, distancesFrom, playerMoves } from "../src/index.js";
import { followVolume, sound } from "./sound-settings.js";

const W = 320, H = 180;
const RM = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
let ctx = null;
let active = false;

/** True while the title screen is on screen (the 3D view pauses its rendering meanwhile). */
export const titleActive = () => active;

/* ---------- drawing helpers ---------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
function R(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
function A(x, y, w, h, c, a) { if (a <= 0) return; ctx.globalAlpha = Math.min(1, a); R(x, y, w, h, c); ctx.globalAlpha = 1; }

// 3×5 pixel font (same glyphs as cutscene.js).
const G = {A:"010101111101101",B:"110101110101110",C:"011100100100011",D:"110101101101110",E:"111100110100111",F:"111100110100100",G:"011100101101011",H:"101101111101101",I:"111010010010111",J:"001001001101010",K:"101101110101101",L:"100100100100111",M:"101111111101101",N:"110101101101101",O:"010101101101010",P:"110101110100100",Q:"010101101110011",R:"110101110101101",S:"011100010001110",T:"111010010010010",U:"101101101101111",V:"101101101101010",W:"101101111111101",X:"101101010101101",Y:"101101010010010",Z:"111001010100111",
  "0":"111101101101111","1":"010110010010111","2":"110001010100111","3":"110001010001110","4":"101101111001001","5":"111100110001110","6":"011100111101111","7":"111001010010010","8":"111101111101111","9":"111101111001110",
  ".":"000000000000010",":":"000010000010000","-":"000000111000000","_":"000000000000111","/":"001001010100100",">":"100010001010100","!":"010010010000010","?":"110001010000010",",":"000000000010100","+":"000010111010000","(":"010100100100010",")":"010001001001010"," ":"000000000000000"};
function txt(s, x, y, c, sc = 1) {
  s = String(s).toUpperCase(); ctx.fillStyle = c; let cx = Math.round(x); y = Math.round(y);
  for (const ch of s) { const g = G[ch]; if (g) for (let i = 0; i < 15; i++) if (g[i] === "1") ctx.fillRect(cx + (i % 3) * sc, y + Math.floor(i / 3) * sc, sc, sc); cx += 4 * sc; }
}
const tw = (s, sc = 1) => String(s).length * 4 * sc - sc;
const txtC = (s, cx, y, c, sc = 1) => txt(s, Math.round(cx - tw(s, sc) / 2), y, c, sc);

/* ---------- audio ---------- */
let AC = null, master = null, musicBus = null, sfxBus = null, NB = null, unfollow = [];
const TRIM = { music: 8, effects: 8 }; // evens this screen out with the rest of the game (see sound-settings.js)
const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);

function ensureAudio() {
  try {
    if (!AC) {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      master = AC.createGain(); master.gain.value = 0.4; master.connect(AC.destination);
      musicBus = AC.createGain(); musicBus.connect(master);
      sfxBus = AC.createGain(); sfxBus.connect(master);
      // The player's volume settings (and mute) apply here too.
      unfollow = [followVolume(AC, musicBus, "music", 0.6 * TRIM.music), followVolume(AC, sfxBus, "effects", 0.9 * TRIM.effects)];
    }
    if (AC.state === "suspended") AC.resume();
  } catch { AC = null; }
}
function tone(f, d, type, v, { at = 0, slide = 0, bus = sfxBus } = {}) {
  if (!AC) return;
  const t = Math.max(at || 0, AC.currentTime), o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.linearRampToValueAtTime(Math.max(20, f + slide), t + d);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(bus); o.start(t); o.stop(t + d + 0.03);
}
function noise(d, v, ff, ft = "lowpass", { at = 0, bus = sfxBus } = {}) {
  if (!AC) return;
  if (!NB) { NB = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); const a = NB.getChannelData(0); for (let i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1; }
  const t = Math.max(at || 0, AC.currentTime), s = AC.createBufferSource(), fl = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = NB; fl.type = ft; fl.frequency.value = ff;
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(d, 0.95));
  s.connect(fl).connect(g).connect(bus); s.start(t, Math.random() * 0.2); s.stop(t + Math.min(d, 0.95) + 0.03);
}
const SFX = {
  move: () => tone(660, 0.05, "square", 0.05),
  select: () => { tone(523, 0.07, "square", 0.07); tone(784, 0.12, "square", 0.07, { at: AC ? AC.currentTime + 0.07 : 0 }); },
  back: () => { tone(523, 0.06, "square", 0.05); tone(392, 0.1, "square", 0.05, { at: AC ? AC.currentTime + 0.06 : 0 }); },
  start: () => { [57, 60, 64, 69].forEach((n, i) => tone(mf(n), 1.2, "square", 0.05, { at: AC ? AC.currentTime + i * 0.06 : 0 })); noise(0.9, 0.12, 500); },
  caught: () => { tone(220, 0.35, "sawtooth", 0.05, { slide: -120 }); },
  escaped: () => { tone(784, 0.08, "square", 0.04); tone(1047, 0.14, "square", 0.04, { at: AC ? AC.currentTime + 0.08 : 0 }); },
};

// Title theme, "Lookahead": A minor, 96 BPM, an 8-bar loop. Arpeggio and bass first,
// drums join at bar 3, the melody at bar 5. A radar ping marks the top of every loop.
const BPM = 96, STEP = 60 / BPM / 4;
const CHORDS = [[57, "m"], [53, "M"], [48, "M"], [55, "M"], [57, "m"], [53, "M"], [52, "M"], [52, "M"]];
const MEL = [[76,0,72,0,71,0,69,0],[69,0,72,0,77,0,76,0],[76,0,74,72,74,0,72,0],[71,0,0,0,67,0,71,0],
             [76,0,72,0,71,0,69,0],[77,0,76,0,72,0,69,0],[68,0,71,0,74,0,76,0],[76,0,0,0,0,0,0,0]];
const ARP = [0, 2, 1, 2, 3, 2, 1, 2, 0, 2, 1, 2, 3, 2, 1, 2];
let seqStep = 0, nextTime = 0, seqTimer = null;
function playStep(s, t) {
  const bar = Math.floor(s / 16) % 8, st = s % 16, [root, q] = CHORDS[bar];
  const notes = [root, root + (q === "m" ? 3 : 4), root + 7, root + 12];
  tone(mf(notes[ARP[st]] + 12), STEP * 0.9, "triangle", 0.05, { at: t, bus: musicBus });
  if (st === 0 || st === 8) tone(mf(root - 12), STEP * 6, "triangle", 0.12, { at: t, bus: musicBus });
  if (st === 6 || st === 14) tone(mf(root - 12), STEP * 1.5, "triangle", 0.06, { at: t, bus: musicBus });
  if (s >= 32) {
    if (st === 0 || st === 8) tone(120, 0.18, "sine", 0.22, { at: t, slide: -80, bus: musicBus });
    if (st === 4 || st === 12) noise(0.12, 0.09, 1800, "bandpass", { at: t, bus: musicBus });
    if (st % 2 === 0 && st % 4 !== 0) noise(0.03, 0.025, 7000, "highpass", { at: t, bus: musicBus });
  }
  if (s >= 64 && st % 2 === 0) {
    const m = MEL[bar][st / 2];
    if (m) { tone(mf(m), STEP * 1.8, "square", 0.035, { at: t, bus: musicBus }); tone(mf(m), STEP * 1.8, "square", 0.012, { at: t + STEP * 3, bus: musicBus }); }
  }
  if (bar === 0 && st === 0) { tone(1760, 0.08, "sine", 0.05, { at: t, bus: musicBus }); tone(1760, 0.08, "sine", 0.02, { at: t + 0.24, bus: musicBus }); }
}
function startMusic() {
  if (!AC || seqTimer) return;
  seqStep = 0; nextTime = AC.currentTime + 0.08;
  seqTimer = setInterval(() => { if (!AC) return; while (nextTime < AC.currentTime + 0.15) { playStep(seqStep, nextTime); nextTime += STEP; seqStep++; } }, 25);
}
function closeAudio() {
  clearInterval(seqTimer); seqTimer = null;
  unfollow.forEach((stop) => stop()); unfollow = [];
  if (!AC) return;
  const ac = AC;
  try { master.gain.setTargetAtTime(0.0001, ac.currentTime, 0.12); } catch {}
  setTimeout(() => { try { ac.close(); } catch {} }, 700);
  AC = null; master = musicBus = sfxBus = NB = null;
}

/* ---------- attract-mode demo: a bot plays against the real Warden AI ---------- */
const DEMO_LEVELS = [0, 1]; // Level 3's two wardens think too long for a background animation on a Chromebook
const demo = { game: null, li: 0, player: null, ghosts: [], dots: [], visits: new Map(), next: 0, banner: null, bannerT: 0, turns: 0, futures: 0 };
const actor = (p) => ({ fr: p.r, fc: p.c, tr: p.r, tc: p.c, t0: 0 });
function setTarget(a, p, now) { const cur = actorPos(a, now); a.fr = cur.r; a.fc = cur.c; a.tr = p.r; a.tc = p.c; a.t0 = now; }
function actorPos(a, now) { const k = ease(clamp((now - a.t0) / 0.2, 0, 1)); return { r: lerp(a.fr, a.tr, k), c: lerp(a.fc, a.tc, k) }; }

function demoReset(li, now) {
  demo.game = new MazeGame();
  demo.game.startLevel(DEMO_LEVELS[li]);
  demo.li = li;
  const s = demo.game.state;
  demo.player = actor(s.player);
  demo.ghosts = s.ghosts.map(actor);
  demo.dots = []; demo.visits = new Map(); demo.banner = null; demo.turns = 0; demo.futures = 0;
  demo.next = now + 0.8;
}

// The demo player: head for the exit, keep away from the Warden, avoid going in circles, with a little randomness.
function botMove(game) {
  const s = game.state, grid = s.grid, cols = grid[0].length;
  const exitD = s.exits.map((e) => distancesFrom(grid, e, "player"));
  const ghostD = s.ghosts.map((g) => distancesFrom(grid, g, "ghost"));
  let best = null, bs = -Infinity;
  for (const m of playerMoves(s)) {
    if (grid[m.r][m.c] === "E") return m.dir;
    const k = m.r * cols + m.c;
    const de = Math.min(...exitD.map((d) => (d[k] < 0 ? 99 : d[k])));
    const dg = Math.min(...ghostD.map((d) => (d[k] < 0 ? 99 : d[k])));
    let sc = -de + Math.min(dg, 5) * 1.4 - (demo.visits.get(k) || 0) * 0.9 + Math.random() * 1.2;
    if (dg <= 1) sc -= 40;
    if (sc > bs) { bs = sc; best = m.dir; }
  }
  return best ?? "up";
}

function demoEnd(kind, now) { demo.banner = kind; demo.bannerT = now; if (kind === "CAUGHT") SFX.caught(); else SFX.escaped(); }

function demoUpdate(now) {
  if (!demo.game) demoReset(0, now);
  if (demo.banner) { if (now - demo.bannerT > 2.2) demoReset((demo.li + 1) % DEMO_LEVELS.length, now); return; }
  if (now < demo.next) return;
  const g = demo.game;
  if (g.state.turn === "player") {
    const r = g.playerMove(botMove(g));
    setTarget(demo.player, g.state.player, now);
    const cols = g.state.grid[0].length, k = g.state.player.r * cols + g.state.player.c;
    demo.visits.set(k, (demo.visits.get(k) || 0) + 1);
    demo.turns++;
    if (r.event === "escaped") return demoEnd("ESCAPED", now);
    if (r.event === "caught") return demoEnd("CAUGHT", now);
    demo.next = now + 0.28;
  } else {
    const m = g.ghostMove();
    m.to.forEach((p, i) => setTarget(demo.ghosts[i], p, now));
    demo.futures = m.thinking?.futuresConsidered ?? 0;
    const chosen = m.thinking?.options.find((o) => o.chosen);
    demo.dots = (chosen?.plan.slice(1, 9) ?? []).flatMap((step, i) =>
      (step.who === "ghost" ? step.at : [step.at]).map((at) => ({ r: at.r, c: at.c, ghost: step.who === "ghost", i })));
    if (m.event === "caught") return demoEnd("CAUGHT", now);
    if (demo.turns > 60) return demoEnd("CAUGHT", now);
    demo.next = now + 0.45;
  }
}

/* ---------- scene ---------- */
const MOTES = Array.from({ length: 26 }, (_, i) => ({ x: 180 + hash(i) * 130, s: 4 + hash(i + 40) * 8, p: hash(i + 80) * 200, d: hash(i + 9) > 0.5 ? "1" : "0" }));

function drawRoom(now) {
  R(0, 0, W, H, "#0a0d13");
  for (let r = 0; r < 16; r++) { const y = r * 10; R(0, y, W, 1, "#0d1119"); for (let x = (r % 2) * 12; x < W; x += 24) R(x, y, 1, 10, "#0d1119"); }
  R(0, 0, W, 6, "#06080c"); R(0, 6, W, 3, "#1a212c"); R(0, 7, W, 1, "#2a3341");
  for (const px of [30, 150, 300]) R(px, 9, 2, 14, "#161c26");
  // the same swinging bulb as Level 1's basement
  const a = RM ? 0.08 : Math.sin(now * 1.1) * 0.22, bx = 96 + Math.sin(a) * 34, by = 9 + Math.cos(a) * 34;
  const steps = 34; for (let i = 0; i <= steps; i++) R(lerp(96, bx, i / steps), lerp(9, by, i / steps), 1, 1, "#2a2f3a");
  const grd = ctx.createRadialGradient(bx, by + 2, 2, bx, by + 30, 120);
  grd.addColorStop(0, "rgba(255,196,110,0.16)"); grd.addColorStop(1, "rgba(255,196,110,0)");
  ctx.fillStyle = grd; ctx.fillRect(0, 0, 176, 180);
  R(bx - 1, by - 1, 3, 2, "#3a3a3a"); R(bx - 1, by + 1, 3, 3, "#ffd27a"); A(bx - 3, by - 1, 7, 7, "#ffd27a", 0.25);
  // floor
  R(0, 160, W, 20, "#07090d"); R(0, 160, W, 1, "#1a212c");
  for (let x = 0; x < W; x += 20) R(x, 166, 1, 14, "#0b0e14");
  // slow red alarm sweep every few seconds
  const sw = (now % 9) / 9; if (!RM && sw < 0.18) A(0, 0, W, H, "#ff1e2e", 0.05 * Math.sin((sw / 0.18) * Math.PI));
}

function drawLogo(now) {
  const glitch = !RM && (now % 5.3) < 0.12;
  txt("CASE FILE 0417 // SUB-LEVEL 7", 14, 14, "#3a8f88");
  const layer = (dx, dy, c) => { txt("CLEAR", 14 + dx, 22 + dy, c, 5); txt("PATH", 14 + dx, 50 + dy, c, 5); };
  layer(2, 2, "#05211e");
  if (glitch) { layer(-2, 0, "#ff2e3e"); layer(2, 0, "#3fd0c9"); }
  layer(1, 1, "#1f8f87");
  layer(0, 0, "#e6f7f6");
  // the hole in the P of PATH is a Warden's visor; its eye looks left and right
  R(19, 55, 5, 5, "#06080b");
  const ex = 19 + Math.round(((RM ? 0 : Math.sin(now * 1.6)) + 1));
  R(ex, 56, 3, 3, "#ff2e3e"); R(ex, 56, 1, 1, "#ffb0b6");
  // after PATH: a runner on a track, with the Warden's predicted moves (red) placed ahead of it
  const x0 = 94, len = 54, y = 62;
  R(x0, y - 1, len, 5, "#0b1f1d"); R(x0, y - 1, len, 1, "#123a35");
  const run = RM ? 18 : (now * 14) % (len - 4);
  for (let k = 1; k <= 3; k++) { const dx = run + k * 7; if (dx < len - 2) A(x0 + dx, y + 1, 2, 2, "#ff3b4a", 0.9 - k * 0.22); }
  R(x0 + run, y, 3, 3, "#5ab0ff"); R(x0 + run + 1, y, 1, 1, "#cfe6ff");
  R(x0 + len, y - 2, 3, 7, "#4ade80");
  if (glitch) { R(14, 36, 80, 2, "#0a0d13"); R(30, 62, 50, 1, "#0a0d13"); }
  txt("THEY PREDICT YOUR EVERY MOVE.", 14, 81, "#ffb347");
}

function drawMonitor(now) {
  const X = 176, Y = 14, MW = 136, MH = 146;
  R(236, MH + Y, 16, 4, "#151b24"); R(226, 158, 36, 2, "#1b222d");
  A(X - 8, Y - 6, MW + 16, MH + 12, "#39f5c4", 0.04);
  R(X, Y, MW, MH, "#1b222d"); R(X, Y, MW, 1, "#2c3644"); R(X + 2, Y + 2, MW - 4, MH - 4, "#11161e");
  const sx = X + 6, sy = Y + 6, sw = MW - 12, sh = MH - 18;
  R(sx, sy, sw, sh, "#041512");
  R(sx, sy, sw, 9, "#0b3b33"); txt("WARDEN_NET // LIVE", sx + 3, sy + 2, "#39f5c4");
  R(sx + sw - 6, sy + 3, 3, 3, Math.floor(now * 2) % 2 ? "#ff3b4a" : "#3a1015");
  txt("CLEARPATH", X + 6, Y + MH - 9, "#2c3644"); R(X + MW - 12, Y + MH - 8, 3, 2, "#39f5c4");

  const g = demo.game, s = g.state, grid = s.grid, rows = grid.length, cols = grid[0].length;
  const ts = Math.floor(Math.min((sw - 8) / cols, (sh - 30) / rows)), mw = ts * cols, mh = ts * rows;
  const ox = sx + Math.floor((sw - mw) / 2), oy = sy + 12 + Math.floor((sh - 30 - mh) / 2);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = ox + c * ts, y = oy + r * ts, t = grid[r][c];
    if (t === "#") { R(x, y, ts, ts, "#0e3a34"); R(x, y, ts, 1, "#1d6b60"); }
    else if (t === "E") R(x, y, ts, ts, Math.floor(now * 2) % 2 ? "#4ade80" : "#1f8f4a");
    else { R(x, y, ts, ts, "#06201c"); R(x + (ts >> 1), y + (ts >> 1), 1, 1, "#0b2f29"); }
  }
  for (const d of demo.dots) {
    const x = ox + d.c * ts + (ts >> 1) + (d.ghost ? 1 : -2), y = oy + d.r * ts + (ts >> 1) - 1;
    A(x, y, 2, 2, d.ghost ? "#ff3b4a" : "#ffb347", Math.max(0.25, 0.95 - d.i * 0.1));
  }
  const p = actorPos(demo.player, now), pcx = ox + p.c * ts + ts / 2, pcy = oy + p.r * ts + ts / 2;
  R(pcx - 1, pcy - 4, 3, 3, "#e3a978"); R(pcx - 1, pcy - 4, 3, 1, "#3b2416"); R(pcx - 2, pcy - 1, 4, 4, "#9cc3e6"); R(pcx - 1, pcy + 3, 1, 1, "#2b3046"); R(pcx + 1, pcy + 3, 1, 1, "#2b3046");
  demo.ghosts.forEach((gh) => {
    const q = actorPos(gh, now), cx = ox + q.c * ts + ts / 2, cy = oy + q.r * ts + ts / 2, look = Math.sign(p.c - q.c);
    A(cx - 5, cy - 5, 10, 10, "#ff2e3e", 0.18);
    R(cx - 3, cy - 3, 6, 6, "#3a4150"); R(cx - 3, cy - 3, 6, 1, "#55607a"); R(cx - 2, cy - 1, 4, 2, "#06080b"); R(cx - 1 + look, cy - 1, 2, 1, "#ff2e3e");
  });
  const lv = g.level;
  txt(`LEVEL ${lv.id}  LOOKAHEAD ${lv.lookahead}`, sx + 3, sy + sh - 15, "#7fd8cc");
  txt(`FUTURES CHECKED ${demo.futures}`, sx + 3, sy + sh - 8, "#39f5c4");
  if (demo.banner) {
    const caught = demo.banner === "CAUGHT", c = caught ? "#ff3b4a" : "#4ade80", by = oy + (mh >> 1) - 10;
    R(sx + 6, by, sw - 12, 20, "#041512"); R(sx + 6, by, sw - 12, 1, c); R(sx + 6, by + 19, sw - 12, 1, c);
    txtC(demo.banner, sx + sw / 2, by + 4, c, 2);
    txtC(caught ? "THE WARDEN PREDICTED IT" : "OUTSMARTED THE AI", sx + sw / 2, by + 13, "#d9dfeb");
  }
  for (let y = sy; y < sy + sh; y += 2) A(sx, y, sw, 1, "#000000", 0.16);
  // data drifting up off the screen
  for (const m of MOTES) {
    const y = 150 - ((now * m.s + m.p) % 160);
    if (y > 10 && y < 150) { ctx.globalAlpha = 0.1; txt(m.d, m.x, y, "#39f5c4"); ctx.globalAlpha = 1; }
  }
}

function drawWarden(now, look) {
  const cx = 161, gy = 178, P = (x, y, w, h, c) => R(cx + x, gy + y, w, h, c), e = 0.75 + 0.25 * Math.sin(now * 3);
  P(-9, -6, 7, 6, "#151920"); P(2, -6, 7, 6, "#151920"); P(-6, -10, 12, 4, "#20252f");
  P(-13, -23, 3, 10, "#2c323e"); P(10, -23, 3, 10, "#2c323e"); P(-14, -13, 2, 3, "#555e6e"); P(12, -13, 2, 3, "#555e6e");
  P(-10, -25, 20, 15, "#3a4150"); P(-10, -25, 20, 2, "#55607a"); P(-10, -12, 20, 2, "#262b36"); P(-6, -19, 12, 2, "#ff3b4a");
  P(-2, -27, 4, 2, "#20252f"); P(-8, -36, 16, 9, "#3a4150"); P(-8, -36, 16, 1, "#5b6578"); P(-6, -34, 12, 5, "#06080b");
  const ex = Math.round(look * 3);
  P(-2 + ex, -33, 4, 2, "#ff2e3e"); P(-1 + ex, -33, 2, 1, "#ffb0b6"); A(cx - 6 + ex, gy - 35, 12, 6, "#ff2e3e", 0.14 * e);
  P(5, -40, 1, 4, "#4a5262"); P(5, -41, 1, 1, Math.floor(now * 3) % 2 ? "#ff3b4a" : "#2a2f3a");
}

/* ---------- the screen ---------- */
// ---------- Level cards: each level's colour and a little map of its maze ----------
const LEVEL_ACCENT = { basement: "#ffb347", "server-halls": "#5ab0ff", core: "#f2c230", executive: "#c9a85c", uplink: "#ff4656" };
const MAP_TILE = { "#": null, ".": "#0b1716", P: "#3fd0c9", E: "#2bd36a", G: "#ff4656", D: "#ffb020", K: "#5ab0ff" };
/** Paint a level's maze into a canvas, one 4-pixel block per tile (scaled up crisp by CSS). */
function drawLevelMap(canvas, level) {
  const rows = level.maze, S = 4;
  canvas.width = rows[0].length * S; canvas.height = rows.length * S;
  const g = canvas.getContext("2d"), acc = LEVEL_ACCENT[level.theme?.style] ?? "#3fd0c9";
  rows.forEach((row, r) => [...row].forEach((ch, c) => {
    const x = c * S, y = r * S;
    if (ch === "#") { g.fillStyle = acc; g.globalAlpha = 0.32; g.fillRect(x, y, S, S); g.globalAlpha = 0.55; g.fillRect(x, y, S, 1); g.globalAlpha = 1; return; }
    g.fillStyle = MAP_TILE["."]; g.fillRect(x, y, S, S);
    if (/[1-4]/.test(ch)) { g.fillStyle = "#8891a6"; g.fillRect(x + 1, y + 1, 2, 2); return; } // a vent
    const col = MAP_TILE[ch];
    if (col) { g.fillStyle = col; ch === "E" ? g.fillRect(x, y, S, S) : g.fillRect(x + 1, y + 1, 2, 2); }
  }));
}

/**
 * Show the home screen. Resolves with what the player picked.
 * @param {{ levels: ReadonlyArray<{ id: number, name: string, lookahead: number, maze: readonly string[], enemy?: string }>, skipPress?: boolean }} options
 *   skipPress: open straight on the menu (use when the player opened it with a key, so sound is already allowed).
 * @returns {Promise<{ mode: "story" } | { mode: "level", index: number }>}
 */
export function showTitleScreen({ levels, skipPress = false }) {
  if (active) return Promise.reject(new Error("Title screen is already open"));
  active = true;
  return new Promise((resolve) => {
    const root = document.createElement("div");
    root.className = "title-screen";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "Clearpath main menu");
    // One card per level, filling the panel: number and name, a map of the maze, the new idea and who's hunting.
    const levelCards = levels.map((l, i) => {
      const detail = describeLevel(l).short;
      const accent = LEVEL_ACCENT[l.theme?.style] ?? "#3fd0c9";
      return `<button type="button" class="ts-level" data-level="${i}" style="--acc: ${accent}">
        <span class="ts-lhead"><span class="ts-num">${l.id}</span><span class="ts-lname"></span></span>
        <canvas class="ts-map" aria-hidden="true"></canvas>
        <span class="ts-lfoot"><span class="ts-concept"></span><span class="ts-ldetail">${detail}</span></span>
      </button>`;
    }).join("");
    root.innerHTML = `
      <div class="ts-stage">
        <canvas width="320" height="180" aria-hidden="true"></canvas>
        <h1 class="ts-sr">Clearpath</h1>
        <nav class="ts-menu" aria-label="Main menu" hidden>
          <button type="button" data-act="story">Start story</button>
          <button type="button" data-act="levels">Choose level</button>
          <button type="button" data-act="learn">How the Wardens think</button>
          <button type="button" data-act="sound" aria-pressed="${!sound.on}">Sound: ${sound.on ? "on" : "off"}</button>
        </nav>
        <button type="button" class="ts-press" aria-label="Press any key to start"></button>
        <section class="ts-panel" data-panel="levels" hidden aria-label="Choose a level">
          <h2>Choose a level</h2>
          <p class="ts-note">Jumps straight into the maze and skips the story.</p>
          <div class="ts-levels">${levelCards}</div>
          <button type="button" class="ts-back">‹ Back</button>
        </section>
        <section class="ts-panel" data-panel="learn" hidden aria-label="How the Wardens think">
          <h2>How the Wardens think</h2>
          <div class="ts-cards">
            <article><h3><span>1</span> Predict</h3><p>A Warden doesn't chase where you are. It imagines your smartest move, then its best answer, then your reply. This back-and-forth guessing is called <b>adversarial search</b>, or <b>minimax</b>.</p></article>
            <article><h3><span>2</span> Look ahead</h3><p>The <b class="red">red dots</b> are the future it expects; the <b class="amber">gold dots</b> are the moves it thinks you'll make. Level 1's Warden looks 1 move ahead. On Level 3, two Wardens look 3 moves ahead and plan as a team. By Level 5, they learn from every attempt where they caught you.</p></article>
            <article><h3><span>3</span> Whose data?</h3><p>Clearpath made the Wardens better at predicting people by training them on private records nobody agreed to share. Accurate isn't the same as fair. Who should decide what an AI is allowed to learn from?</p></article>
          </div>
          <p class="ts-tip">Tip: a Warden assumes you'll make the smartest move, and it can only see a few moves ahead. Plan further than it does.</p>
          <button type="button" class="ts-back">‹ Back</button>
        </section>
        <p class="ts-keys">↑ ↓ choose · Enter select · Esc back</p>
      </div>`;
    root.querySelectorAll(".ts-lname").forEach((el, i) => { el.textContent = levels[i].name; });
    root.querySelectorAll(".ts-concept").forEach((el, i) => { el.textContent = levels[i].concept ?? ""; });
    root.querySelectorAll(".ts-map").forEach((c, i) => drawLevelMap(c, levels[i]));
    root.querySelector(".ts-levels").style.setProperty("--n", String(levels.length));
    document.body.appendChild(root);

    const q = (sel) => root.querySelector(sel);
    const canvas = q("canvas"), menu = q(".ts-menu"), press = q(".ts-press"), soundBtn = q('[data-act="sound"]');
    ctx = canvas.getContext("2d"); ctx.imageSmoothingEnabled = false;
    let pressed = false, raf = 0, openPanel = null, lookMenu = false;
    const t0 = performance.now();

    function enterMenu() {
      if (pressed) return;
      pressed = true;
      press.hidden = true; menu.hidden = false;
      ensureAudio(); startMusic(); SFX.select();
      menu.querySelector("button").focus();
    }
    function show(panel) {
      openPanel = panel;
      for (const p of root.querySelectorAll(".ts-panel")) p.hidden = p.dataset.panel !== panel;
      menu.hidden = !!panel;
      if (panel) (q(`[data-panel="${panel}"] button`))?.focus();
      else menu.querySelector(`[data-act="${lastPanel}"]`)?.focus();
    }
    let lastPanel = "levels";
    // Keep the Sound button in step with the mute switch (it can also change from the sound panel).
    const showSound = () => { soundBtn.textContent = `Sound: ${sound.on ? "on" : "off"}`; soundBtn.setAttribute("aria-pressed", String(!sound.on)); };
    const unsubSound = sound.subscribe(showSound);
    function done(choice) {
      if (!active) return;
      active = false;
      unsubSound();
      SFX.start();
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey, true);
      setTimeout(closeAudio, 500);
      root.classList.add("ts-out");
      setTimeout(() => root.remove(), 450);
      resolve(choice);
    }

    menu.addEventListener("click", (e) => {
      const act = e.target.closest("button")?.dataset.act;
      if (!act) return;
      if (act === "story") done({ mode: "story" });
      else if (act === "sound") {
        sound.toggleMute(); // the same mute as the sound panel in the corner
      } else { lastPanel = act; SFX.select(); show(act); }
    });
    root.querySelectorAll(".ts-back").forEach((b) => b.addEventListener("click", () => { SFX.back(); show(null); }));
    root.querySelectorAll(".ts-level").forEach((b) => b.addEventListener("click", () => done({ mode: "level", index: Number(b.dataset.level) })));
    press.addEventListener("click", enterMenu);
    root.addEventListener("pointerover", (e) => { if (e.target.closest(".ts-menu button, .ts-level")) { lookMenu = true; } });
    root.addEventListener("focusin", (e) => { if (pressed && e.target.closest("button")) { lookMenu = true; SFX.move(); } });

    // Capture phase on window runs before the game's own keydown listener, so no key reaches the maze.
    function onKey(e) {
      e.stopImmediatePropagation();
      if (!pressed) { e.preventDefault(); enterMenu(); return; }
      const scope = openPanel ? q(`[data-panel="${openPanel}"]`) : menu;
      const items = [...scope.querySelectorAll("button")];
      const i = items.indexOf(document.activeElement);
      if (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === "s") { e.preventDefault(); items[(i + 1 + items.length) % items.length].focus(); }
      else if (e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "w") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      else if (e.key === "Escape" && openPanel) { e.preventDefault(); SFX.back(); show(null); }
      else if ((e.key === "Enter" || e.key === " ") && i < 0) { e.preventDefault(); items[0].focus(); }
    }
    window.addEventListener("keydown", onKey, true);

    if (skipPress) enterMenu(); else press.focus();

    function frame() {
      if (!active) return;
      const now = (performance.now() - t0) / 1000;
      demoUpdate(now);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawRoom(now);
      drawMonitor(now);
      drawLogo(now);
      drawWarden(now, lookMenu && pressed ? -1 : Math.sin(now * 0.7) > 0 ? 1 : 0);
      if (!pressed && Math.floor(now * 1.6) % 2 === 0) { txtC("PRESS ANY KEY", 77, 120, "#d9dfeb", 2); txtC("OR CLICK TO START", 77, 136, "#8891a6"); }
      txt("ADVERSARIAL SEARCH", 14, 164, "#3a8f88");
      txt("MINIMAX / LOOKAHEAD / PREDICTION", 14, 171, "#3a4458");
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  });
}

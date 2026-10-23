// prologue.js — the story's prologue, "Know the Next Move". Plays when the player picks Start story,
// before the "After Hours" cutscene.
//
// Part 1 is a Clearpath TV ad hosted by Pip, a friendly mascot robot. It doubles as the game's tutorial:
//   1. Prediction = spotting patterns (Maya walks her dog at 7:00 every day; 92% sure about Saturday)
//   2. Minimax (a two-move points game: the greedy 9 is really a 1, so Pip picks the safe 4)
//   3. Lookahead and pruning (5, 25, 125, 625 futures; skip branches that can't win)
//   4. The chase (red dots = Pip's plan, gold dots = the moves it predicts you'll make)
//   5. Products and fine print (the data question), then the logo
// Part 2 zooms out of the TV into a dark living room. Someone on the couch, seen from behind, thinks about
// the ad, and the player answers for them: four comprehension questions and two ethics questions with no
// wrong answer. Every answer gets a short reply that explains the idea, so a wrong pick still teaches.
// Then the smart speaker says goodnight, a text from Clearpath HR reveals it's Sam the night before his
// first day, and a "Six months later" card hands off to "After Hours".
//
//   import { playPrologue, prologueActive } from "./prologue.js";
//   await playPrologue({ autoStart: true });   // autoStart: the player just clicked, so sound is allowed
//
// Drawn in code on a 320×180 canvas (no image files); sound is synthesized with the Web Audio API.
// It reuses the stage, dialogue box and control bar styles from cutscene.css; prologue.css adds the thought bubbles.
// Text lives in STEPS (the ad's lines and the questions), so it's easy to edit.

import { logger } from "./log.js";

const W = 320, H = 180;
const RM = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
let ctx = null; // whichever canvas is being drawn right now
let active = false;

/** True while the prologue is on screen (the 3D view pauses its rendering meanwhile). */
export const prologueActive = () => active;

/* ---------- drawing helpers ---------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
function R(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
function A(x, y, w, h, c, a) { if (a <= 0) return; ctx.globalAlpha = Math.min(1, a); R(x, y, w, h, c); ctx.globalAlpha = 1; }
function line(x0, y0, x1, y1, c, w = 1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy; ctx.fillStyle = c;
  for (;;) { ctx.fillRect(x0, y0, w, w); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
}
const G = {A:"010101111101101",B:"110101110101110",C:"011100100100011",D:"110101101101110",E:"111100110100111",F:"111100110100100",G:"011100101101011",H:"101101111101101",I:"111010010010111",J:"001001001101010",K:"101101110101101",L:"100100100100111",M:"101111111101101",N:"110101101101101",O:"010101101101010",P:"110101110100100",Q:"010101101110011",R:"110101110101101",S:"011100010001110",T:"111010010010010",U:"101101101101111",V:"101101101101010",W:"101101111111101",X:"101101010101101",Y:"101101010010010",Z:"111001010100111",
  "0":"111101101101111","1":"010110010010111","2":"110001010100111","3":"110001010001110","4":"101101111001001","5":"111100110001110","6":"011100111101111","7":"111001010010010","8":"111101111101111","9":"111101111001110",
  ".":"000000000000010",":":"000010000010000","-":"000000111000000","_":"000000000000111","/":"001001010100100",">":"100010001010100","<":"001010100010001","!":"010010010000010","?":"110001010000010","%":"101001010100101","#":"101111101111101","=":"000111000111000",",":"000000000010100","*":"000101010101000","+":"000010111010000","(":"010100100100010",")":"010001001001010","'":"010010000000000"," ":"000000000000000"};
function txt(s, x, y, c, sc = 1) {
  s = String(s).toUpperCase(); ctx.fillStyle = c; let cx = Math.round(x); y = Math.round(y);
  for (const ch of s) { const g = G[ch]; if (g) for (let i = 0; i < 15; i++) if (g[i] === "1") ctx.fillRect(cx + (i % 3) * sc, y + Math.floor(i / 3) * sc, sc, sc); cx += 4 * sc; }
}
const tw = (s, sc = 1) => String(s).length * 4 * sc - sc;
const txtC = (s, cx, y, c, sc = 1) => txt(s, Math.round(cx - tw(s, sc) / 2), y, c, sc);
const typed = (s, t, at, cps = 38) => s.slice(0, Math.max(0, Math.floor((t - at) * cps)));
function logo(cx, cy, c, s) {
  const q = (x, y, w, h) => R(cx + x * s, cy + y * s, w * s, h * s, c);
  q(-2, -4, 5, 1); q(-2, 4, 5, 1); q(-4, -2, 1, 5); q(4, -2, 1, 5); q(-3, -3, 1, 1); q(3, -3, 1, 1); q(-3, 3, 1, 1); q(3, 3, 1, 1);
  for (let i = -2; i <= 1; i++) q(i, -i, 1, 1); q(1, -2, 2, 1); q(2, -2, 1, 2);
}

/* ---------- the ad's palette and characters ---------- */
const AD = { bg: "#eaf6f5", stripe: "#dcefed", deep: "#0b5c57", teal: "#3fd0c9", ink: "#1b2a3a", soft: "#7d8d92", line: "#9fb3b8", amber: "#ffb347", amberD: "#c47a10", red: "#ff4656", green: "#2bd36a", white: "#ffffff", blue: "#5ab0ff", skin: "#e3a978" };

/** Pip, Clearpath's mascot: a small floating robot. o.red flashes its eyes red (a hint of the Wardens). */
function pip(x, y, o = {}) {
  const t = o.t || 0; y += Math.round(Math.sin(t * 3) * 1.5);
  A(x - 7, y + 15, 14, 2, "#000000", 0.1);
  R(x - 7, y - 9, 14, 18, AD.white); R(x - 8, y - 7, 16, 14, AD.white); R(x - 8, y + 4, 16, 3, "#dbe7ea"); R(x - 7, y + 7, 14, 2, "#dbe7ea");
  R(x - 6, y - 6, 12, 7, "#0b2f3a"); R(x - 5, y - 7, 10, 1, "#0b2f3a");
  const ec = o.red ? "#ff2e3e" : AD.teal, blink = !RM && (t % 3.1) < 0.12;
  if (blink) { R(x - 4, y - 3, 3, 1, ec); R(x + 1, y - 3, 3, 1, ec); } else { R(x - 4, y - 4, 3, 3, ec); R(x + 1, y - 4, 3, 3, ec); R(x - 4, y - 4, 1, 1, "#d6fffb"); R(x + 1, y - 4, 1, 1, "#d6fffb"); }
  R(x, y - 12, 1, 3, AD.line); R(x - 1, y - 14, 3, 2, ec);
  const w = o.wave ? Math.round(Math.sin(t * 10) * 2) : 0;
  R(x - 10, y - 1, 2, 5, AD.white); R(x + 8, y - 4 + w, 2, 5, AD.white);
  R(x - 1, y + 3, 2, 2, AD.teal);
}
function pipMini(cx, cy, red) { R(cx - 3, cy - 3, 6, 6, AD.white); R(cx - 3, cy + 2, 6, 1, "#dbe7ea"); R(cx - 2, cy - 2, 4, 2, "#0b2f3a"); R(cx - 1, cy - 2, 2, 1, red ? "#ff2e3e" : AD.teal); }
function runner(cx, cy) { R(cx - 1, cy - 4, 3, 3, AD.skin); R(cx - 1, cy - 4, 3, 1, "#3b2416"); R(cx - 2, cy - 1, 4, 4, AD.blue); R(cx - 1, cy + 3, 1, 1, AD.ink); R(cx + 1, cy + 3, 1, 1, AD.ink); }
function adBg(t) {
  R(0, 0, W, H, AD.bg);
  const off = RM ? 0 : Math.floor(t * 6) % 12;
  for (let x = -24 + off; x < W + 24; x += 12) for (let y = 0; y < H; y += 2) if ((x + y) % 12 < 2) R(x + y / 2, y, 2, 2, AD.stripe);
}
function titleBar(s) { R(0, 4, W, 12, AD.deep); R(0, 15, W, 1, AD.teal); txt(s, 8, 8, AD.white); }
function tri(x, y, up, c) { for (let i = 0; i < 6; i++) R(x - i, up ? y - 3 + i : y + 2 - i, 2 * i + 1, 1, c); }

/* ---------- ad shots (drawn into the TV) ---------- */
function adLogo(t) {
  if (t < 0.8) { R(0, 0, W, H, "#1a1d22"); for (let i = 0; i < 900; i++) { const k = hash(i + Math.floor(t * 30) * 977); R(Math.floor(k * W), Math.floor(hash(i * 3.1 + k) * H), 2, 1, k > 0.5 ? "#c9ced6" : "#4a4f58"); } return; }
  adBg(t);
  const k = ease(seg(t, 0.8, 1.5));
  ctx.globalAlpha = k; logo(160, 36, AD.deep, 3);
  txtC("CLEARPATH", 160, 56, AD.deep, 3); txtC("PREDICTIONS", 160, 76, AD.teal, 2); ctx.globalAlpha = 1;
  if (t > 1.8) txtC("KNOW THE NEXT MOVE.", 160, 94, AD.ink);
  if (t > 2.2) pip(262, lerp(140, 104, ease(seg(t, 2.2, 2.8))), { t, wave: true });
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + t, r = 50 + Math.sin(t * 2 + i) * 3; if (t > 1.2) R(160 + Math.cos(a) * r * 1.6, 60 + Math.sin(a) * r * 0.5, 2, 2, i % 2 ? AD.amber : AD.teal); }
}

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];
function clockIcon(x, y, c) { R(x, y, 9, 9, c); R(x + 1, y + 1, 7, 7, AD.white); R(x + 4, y + 2, 1, 3, AD.ink); R(x + 4, y + 4, 2, 1, AD.ink); }
function walker(x, y, a = 1) {
  ctx.globalAlpha = a;
  R(x, y, 3, 3, AD.skin); R(x, y, 3, 1, "#3b2416"); R(x - 1, y + 3, 5, 6, "#c86fd1"); R(x, y + 9, 1, 3, AD.ink); R(x + 2, y + 9, 1, 3, AD.ink);
  line(x + 4, y + 5, x + 10, y + 9, AD.soft);
  R(x + 10, y + 8, 7, 3, "#8a5a3a"); R(x + 16, y + 6, 3, 3, "#8a5a3a"); R(x + 17, y + 6, 1, 1, AD.ink); R(x + 9, y + 7, 1, 2, "#8a5a3a"); R(x + 10, y + 11, 1, 1, "#8a5a3a"); R(x + 15, y + 11, 1, 1, "#8a5a3a");
  ctx.globalAlpha = 1;
}
function adPrediction(t) {
  adBg(t); titleBar("1  PREDICTION = SPOTTING PATTERNS");
  DAYS.forEach((d, i) => {
    const x = 10 + i * 44, y = 26, a = i < 5 ? seg(t, 3.4 + i * 0.5, 3.6 + i * 0.5) : seg(t, 7, 7.3);
    if (a <= 0) return;
    ctx.globalAlpha = a;
    R(x, y, 40, 54, AD.white); R(x, y + 53, 40, 1, AD.line); R(x, y, 40, 9, i < 5 ? AD.teal : AD.amber); txtC(d, x + 20, y + 2, "#0b2f3a");
    if (i < 5) { clockIcon(x + 4, y + 13, AD.deep); txt("7:00", x + 16, y + 15, AD.ink); walker(x + 9, y + 32, a); }
    else if (t < 10.4) txtC("?", x + 20, y + 22, AD.amber, 3);
    else { clockIcon(x + 4, y + 13, AD.amberD); txt("7:00", x + 16, y + 15, AD.amberD); walker(x + 9, y + 32, 0.45 * a); }
    ctx.globalAlpha = 1;
  });
  if (t > 7.4) { const k = seg(t, 7.4, 8.2); R(10, 84, 216 * k, 2, AD.teal); if (k >= 1) txt("SAME TIME, EVERY DAY = A PATTERN", 10, 89, AD.deep); }
  if (t > 10.6) {
    const k = ease(seg(t, 10.6, 11.8)), pct = Math.round(92 * k);
    txt("SURE?", 230, 84, AD.ink); R(230, 91, 40, 6, AD.stripe); R(230, 91, Math.round(40 * 0.92 * k), 6, AD.green); txt(pct + "%", 252, 84, AD.ink);
  }
  if (t > 12.2) txtC("PAST PATTERN  +  HOW SURE  =  A SMART GUESS", 160, 108, AD.deep);
  pip(294, 52, { t, wave: t < 2.6 });
}

// The points game: Pip (MAX) moves, then the opponent (MIN) replies. Leaf numbers are points for Pip.
const TREE = { root: [150, 32], mids: [[95, 62], [205, 62]], leaves: [[70, 96, 9], [120, 96, 1], [180, 96, 5], [230, 96, 4]] };
function adMinimax(t) {
  adBg(t); titleBar("2  WHEN SOMEONE PLAYS AGAINST YOU");
  const [rx, ry] = TREE.root, grow = seg(t, 0.4, 2.2);
  const edge = (x0, y0, x1, y1, c, w = 1) => { if (grow > 0) line(x0, y0, lerp(x0, x1, grow), lerp(y0, y1, grow), c, w); };
  const greedy = t > 8.6 && t < 12.2, opp = t > 12.2, fin = t > 15.8;
  TREE.mids.forEach(([mx, my], i) => {
    const c = fin && i === 1 ? AD.green : greedy && i === 0 ? AD.amber : AD.line;
    edge(rx, ry + 3, mx, my - 4, c, fin && i === 1 ? 2 : 1);
    [0, 1].forEach((j) => {
      const [lx, ly] = TREE.leaves[i * 2 + j];
      const chosen = (opp && i === 0 && j === 1) || (t > 13.6 && i === 1 && j === 1);
      edge(mx, my + 4, lx, ly - 6, chosen ? AD.red : greedy && i === 0 && j === 0 ? AD.amber : AD.line, chosen ? 2 : 1);
    });
  });
  if (grow >= 1) {
    tri(rx, ry, true, AD.teal); txt("PIP", rx + 8, ry - 3, AD.deep);
    TREE.mids.forEach(([mx, my], i) => { tri(mx, my, false, AD.red); txt(i ? "MOVE B" : "MOVE A", i ? mx + 9 : mx - 32, my - 2, AD.ink); });
  }
  if (t > 4.6) TREE.leaves.forEach(([lx, ly, v], i) => {
    const a = seg(t, 4.6 + i * 0.25, 4.8 + i * 0.25); if (a <= 0) return;
    ctx.globalAlpha = a;
    const hot = greedy && i === 0;
    R(lx - 8, ly - 6, 16, 14, hot ? "#fff3df" : AD.white); R(lx - 8, ly + 7, 16, 1, hot ? AD.amber : AD.line);
    if (hot) { R(lx - 9, ly - 7, 18, 1, AD.amber); R(lx - 9, ly + 8, 18, 1, AD.amber); R(lx - 9, ly - 7, 1, 16, AD.amber); R(lx + 8, ly - 7, 1, 16, AD.amber); }
    txtC(String(v), lx, ly - 4, AD.ink, 2);
    ctx.globalAlpha = 1;
  });
  const badge = (x, y, v, c) => { R(x, y, 13, 9, c); txtC("=" + v, x + 7, y + 2, AD.white); };
  if (t > 12.6) badge(TREE.mids[0][0] + 8, TREE.mids[0][1] + 2, 1, AD.red);
  if (t > 13.8) badge(TREE.mids[1][0] - 21, TREE.mids[1][1] + 2, 4, AD.red);
  if (fin) badge(rx + 8, ry + 3, 4, AD.green);
  tri(14, 114, true, AD.teal); txt("MAX: PIP WANTS BIG", 22, 112, AD.ink);
  tri(110, 114, false, AD.red); txt("MIN: OPPONENT WANTS SMALL", 118, 112, AD.ink);
  if (fin) { const k = ease(seg(t, 15.8, 16.3)); R(238, 98, 72 * k, 22, AD.deep); if (k >= 1) { txtC("MINIMAX", 274, 102, AD.white, 2); txtC("PICK B = 4", 274, 113, AD.teal); } }
  pip(292, 40, { t });
}

const LEVELS_AHEAD = [["NOW", 1], ["MY MOVE", 5], ["YOUR REPLY", 25], ["MY NEXT MOVE", 125], ["YOUR NEXT", 625]];
function adLookahead(t) {
  adBg(t); titleBar("3  HOW FAR AHEAD?");
  const cx = 188, pos = [];
  LEVELS_AHEAD.forEach(([lab, n], i) => {
    const y = 26 + i * 16, a = i === 0 ? seg(t, 0.4, 0.8) : seg(t, 4.4 + (i - 1) * 0.7, 4.7 + (i - 1) * 0.7);
    if (a <= 0) { pos.push(null); return; }
    const w = Math.min(196, n * 6), x0 = cx - w / 2;
    pos.push({ y, n, x0, w });
    ctx.globalAlpha = a;
    txt(lab, 8, y, AD.ink); txt(n.toLocaleString("en-US"), 64, y, AD.deep);
    if (n <= 25) for (let k = 0; k < n; k++) R(x0 + (k + 0.5) * (w / n) - 1, y, 3, 3, i % 2 ? AD.red : AD.teal);
    else if (n <= 125) for (let k = 0; k < n; k++) R(x0 + k * (w / n), y + 1, 1, 2, AD.teal);
    else for (let x = 0; x < w; x++) if (x % 2 === 0) R(x0 + x, y + 1, 1, 2, AD.red);
    ctx.globalAlpha = 1;
  });
  for (let i = 1; i < 3; i++) { const p = pos[i - 1], c = pos[i]; if (!p || !c) continue;
    for (let k = 0; k < c.n; k++) { const par = Math.floor(k / (c.n / p.n)); line(p.x0 + (par + 0.5) * (p.w / p.n), p.y + 3, c.x0 + (k + 0.5) * (c.w / c.n), c.y, "#c2d6d8"); } }
  if (t > 8.6) {
    const k = seg(t, 8.6, 9.6);
    for (const [a, b] of [[0.12, 0.3], [0.55, 0.7], [0.82, 0.95]]) for (const row of [3, 4]) { const p = pos[row]; if (!p) continue;
      const x = p.x0 + p.w * a, w = p.w * (b - a) * k; A(x, p.y - 1, w, 5, AD.bg, 0.85); if (k >= 1) { line(x + w / 2 - 2, p.y - 1, x + w / 2 + 2, p.y + 3, AD.red); line(x + w / 2 + 2, p.y - 1, x + w / 2 - 2, p.y + 3, AD.red); } }
    if (k >= 1) txt("SKIPPED: CAN'T BEAT MY BEST PLAN = PRUNING", 96, 100, AD.red);
  }
  if (t > 11.9) {
    const k = ease(seg(t, 11.9, 12.4));
    R(8, 110, 92 * k, 13, AD.teal); R(108, 110, 120 * k, 13, AD.amber);
    if (k >= 1) { txt("BASIC: 1 MOVE AHEAD", 13, 114, "#06302c"); txt("PREMIUM: 3 MOVES AHEAD", 113, 114, "#4a2a00"); }
  }
  pip(292, 104, { t });
}

const MAZE = ["###########", "#.........#", "#.#######.#", "#.#######.E", "#.#######.#", "#.........#", "###########"];
const RUN = [[3, 1], [2, 1], [1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [1, 7], [1, 8], [1, 9]];
const PIPP = [[5, 6], [5, 7], [5, 8], [5, 9], [4, 9], [3, 9], [3, 9], [3, 9], [3, 9], [2, 9], [2, 9], [1, 9]];
const CHASE_START = 8.9, CHASE_STEP = 0.42;
function along(path, k) { const i = Math.min(Math.floor(k), path.length - 1), j = Math.min(i + 1, path.length - 1), f = ease(clamp(k - i, 0, 1)); return [lerp(path[i][0], path[j][0], f), lerp(path[i][1], path[j][1], f)]; }
function adChase(t) {
  adBg(t); titleBar("4  THE CHASE");
  const ts = 10, ox = 105, oy = 30;
  MAZE.forEach((row, r) => [...row].forEach((ch, c) => {
    const x = ox + c * ts, y = oy + r * ts;
    if (ch === "#") { R(x, y, ts, ts, AD.deep); R(x, y, ts, 1, "#147a73"); }
    else if (ch === "E") R(x, y, ts, ts, Math.floor(t * 2) % 2 ? AD.green : "#1d9f50");
    else R(x, y, ts, ts, AD.white);
  }));
  const k = clamp((t - CHASE_START) / CHASE_STEP, 0, PIPP.length - 1), idx = Math.floor(k);
  const center = ([r, c]) => [ox + c * ts + ts / 2, oy + r * ts + ts / 2];
  if (t > 8.7) {
    for (let d = 1; d <= 4; d++) {
      const pp = PIPP[idx + d], rp = RUN[idx + d];
      if (pp) { const [x, y] = center(pp); A(x, y - 1, 2, 2, AD.red, 1 - d * 0.18); }
      if (rp) { const [x, y] = center(rp); A(x - 3, y - 1, 2, 2, AD.amber, 1 - d * 0.18); }
    }
  }
  const [rr, rc] = along(RUN, Math.min(k, RUN.length - 1)), [pr, pc] = along(PIPP, k);
  const [rx, ry] = center([rr, rc]), [px, py] = center([pr, pc]);
  const caught = k >= PIPP.length - 1;
  if (!caught) runner(rx, ry);
  pipMini(px, py);
  if (idx >= 10 && !caught) txt("!", rx - 1, ry - 11, AD.red);
  if (caught) { const p = seg(t, CHASE_START + (PIPP.length - 1) * CHASE_STEP, CHASE_START + (PIPP.length - 1) * CHASE_STEP + 0.3); R(ox + 30, oy + 26, 50, 18, AD.amber); txtC("GOTCHA!", ox + 55, oy + 32 - Math.round((1 - p) * 4), AD.ink); }
  if (t > 4.7) {
    txt("SCORE EVERY", 224, 32, AD.ink); txt("FUTURE:", 224, 39, AD.ink);
    txt("+ PIP NEAR YOU", 224, 50, "#178a46"); txt("- YOU NEAR EXIT", 224, 58, AD.red);
    txt("PIP PICKS THE", 224, 72, AD.soft); txt("BEST SCORE", 224, 79, AD.soft);
  }
  if (t > 8.7) {
    R(8, 32, 3, 3, AD.red); txt("PIP'S PLAN", 14, 32, AD.ink);
    R(8, 44, 3, 3, AD.amber); txt("WHERE PIP", 14, 44, AD.ink); txt("THINKS YOU", 14, 51, AD.ink); txt("WILL GO", 14, 58, AD.ink);
  }
}

const FINE = "*DATA FROM YOUR DEVICES, PURCHASES, LOCATION AND PRIVATE MESSAGES MAY BE USED TO TRAIN CLEARPATH MODELS. OPTING OUT MAY NOT BE AVAILABLE. CLEARPATH IS NOT RESPONSIBLE FOR HOW ITS PREDICTIONS ARE USED.";
function adProducts(t) {
  adBg(t); titleBar("CLEARPATH PRODUCTS");
  const cards = [["CLEARPATH HOME", "KNOWS WHEN YOU", "GET HOME", AD.teal], ["CLEARPATH SHOP", "KNOWS WHAT YOU", "WILL BUY NEXT", AD.amber], ["CLEARPATH WARDEN", "SECURITY THAT IS", "ONE STEP AHEAD", "#55607a"]];
  cards.forEach(([title, s1, s2, col], i) => {
    const k = ease(seg(t, 0.5 + i * 2.1, 1.0 + i * 2.1)); if (k <= 0) return;
    const x = 12 + i * 100, y = 26 + Math.round((1 - k) * 20), cx = x + 48, cy = y + 28;
    ctx.globalAlpha = k;
    R(x, y, 96, 72, AD.white); R(x, y, 96, 4, col); R(x, y + 71, 96, 1, AD.line);
    if (i === 0) { for (let r = 0; r < 8; r++) R(cx - 2 - r, cy - 12 + r, 5 + r * 2, 1, "#c0392b"); R(cx - 9, cy - 4, 19, 14, "#f4e3c1"); R(cx - 2, cy + 3, 5, 7, "#8a5a3a"); R(cx + 4, cy - 1, 4, 4, "#9fd4ff"); clockIcon(cx + 12, cy - 10, AD.deep); }
    if (i === 1) { R(cx - 10, cy - 6, 18, 10, AD.amber); R(cx - 10, cy - 6, 18, 1, AD.amberD); line(cx + 8, cy - 6, cx + 12, cy - 11, AD.ink); R(cx - 8, cy + 6, 3, 3, AD.ink); R(cx + 3, cy + 6, 3, 3, AD.ink); R(cx - 6, cy - 10, 4, 4, AD.red); R(cx, cy - 11, 4, 5, AD.green); }
    if (i === 2) { R(cx - 8, cy - 12, 16, 9, "#3a4150"); R(cx - 6, cy - 10, 12, 4, "#06080b"); R(cx - 2, cy - 9, 4, 2, AD.teal); R(cx - 10, cy - 2, 20, 12, "#3a4150"); R(cx - 6, cy + 2, 12, 2, AD.teal); R(cx - 13, cy - 1, 3, 8, "#2c323e"); R(cx + 10, cy - 1, 3, 8, "#2c323e"); }
    txtC(title, cx, y + 48, AD.ink); txtC(s1, cx, y + 57, AD.soft); txtC(s2, cx, y + 63, AD.soft);
    ctx.globalAlpha = 1;
  });
  if (t > 8.6) { const x = 320 - (t - 8.6) * 150; R(0, 102, W, 9, "#f6fbfa"); txt(FINE, x, 104, AD.soft); }
  pip(296, 112, { t });
}

function adEnd(t) {
  const glitch = !RM && t > 3.6 && t < 3.78;
  adBg(t);
  logo(160, 34, AD.deep, 3); txtC("CLEARPATH", 160, 54, AD.deep, 3); txtC("WE SEE WHAT COMES NEXT.", 160, 76, AD.teal);
  pip(160, 104, { t, wave: t < 2.5, red: glitch });
  if (glitch) { for (let i = 0; i < 6; i++) { const y = Math.floor(hash(i + 7) * H); R(0, y, W, 2, i % 2 ? "#ff2e3e" : AD.deep); } }
}
/** What the TV shows once the ad is over: the end card, still glowing. */
// Drawn large because the room shows it at under a third of its size.
function tvIdle(t) { R(0, 0, W, H, AD.bg); logo(160, 62, AD.deep, 7); txtC("CLEARPATH", 160, 112, AD.deep, 6); R(60, 150, 200, 8, AD.teal); }

/* ---------- the living room (seen from behind the couch) ---------- */
const TV = { x: 176, y: 30, w: 96, h: 54 };
const RAIN = Array.from({ length: 40 }, (_, i) => ({ x: 22 + hash(i) * 70, s: 60 + hash(i + 9) * 50, p: hash(i + 3) * 100 }));
function drawRoom(now, o) {
  R(0, 0, W, 104, "#151b30"); for (let x = 0; x < W; x += 16) R(x, 0, 1, 104, "#18203a");
  R(0, 100, W, 4, "#10141f");
  // window with rain and the Clearpath tower in the distance
  R(18, 18, 78, 70, "#0d1122"); R(22, 22, 70, 62, "#0a0f24");
  for (let i = 0; i < 9; i++) { const x = 24 + i * 8, h = 10 + Math.floor(hash(i + 50) * 18); R(x, 84 - h, 7, h, "#121a36"); }
  R(60, 38, 10, 46, "#16204a"); R(64, 32, 2, 6, "#16204a"); logo(65, 46, Math.floor(now * 1.2) % 2 ? "#3fd0c9" : "#1f8f87", 1); R(64, 31, 2, 1, Math.floor(now * 1.5) % 2 ? "#ff3b4a" : "#4a1a20");
  for (let r = 0; r < 8; r++) for (let c = 0; c < 2; c++) R(62 + c * 4, 54 + r * 4, 2, 2, hash(r * 3 + c) > 0.6 ? "#ffcf6b" : "#1d2654");
  for (const d of RAIN) { const y = 22 + ((now * d.s + d.p) % 62); A(d.x, y, 1, 3, "#7f9ad1", 0.35); }
  R(56, 22, 2, 62, "#0d1122"); R(22, 52, 70, 2, "#0d1122");
  R(10, 14, 10, 80, "#241a33"); R(94, 14, 10, 80, "#241a33"); R(8, 12, 98, 3, "#2c2240");
  // clock
  R(214, 8, 20, 9, "#0d1122"); txt("11:58", 215, 10, "#ff5a5a");
  // floor and rug
  R(0, 104, W, 76, "#0f0d14"); R(110, 128, 210, 52, "#1c1626"); for (let x = 112; x < 320; x += 6) R(x, 128, 3, 1, "#2a2036");
  // TV, stand and console
  R(TV.x - 4, TV.y - 4, TV.w + 8, TV.h + 8, "#08080a"); R(TV.x - 4, TV.y - 4, TV.w + 8, 1, "#22232a");
  ctx.imageSmoothingEnabled = false; ctx.drawImage(o.tv, 0, 0, W, H, TV.x, TV.y, TV.w, TV.h);
  if (o.tvDim) A(TV.x, TV.y, TV.w, TV.h, "#000000", o.tvDim);
  R(220, TV.y + TV.h + 4, 8, 4, "#08080a");
  R(162, 92, 124, 14, "#1d1712"); R(162, 92, 124, 1, "#2e251d"); R(166, 106, 3, 6, "#130f0b"); R(279, 106, 3, 6, "#130f0b");
  R(198, 96, 20, 5, "#0b0b0e"); R(214, 97, 2, 1, "#3fd0c9"); R(168, 84, 6, 8, "#3a2a20"); R(166, 76, 3, 8, "#2f6b4a"); R(170, 74, 3, 10, "#3f8a5e");
  // TV glow over the room
  const glow = ctx.createRadialGradient(224, 60, 4, 224, 90, 170);
  glow.addColorStop(0, `rgba(170,236,230,${0.16 * (o.glow ?? 1)})`); glow.addColorStop(1, "rgba(170,236,230,0)");
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  // side table and the Clearpath Home speaker
  R(108, 124, 30, 3, "#2a2117"); R(110, 127, 2, 20, "#1f1810"); R(134, 127, 2, 20, "#1f1810");
  const ring = o.speaker ? 0.6 + 0.4 * Math.sin(now * 8) : 0.35 + 0.15 * Math.sin(now * 1.3);
  R(116, 106, 12, 18, "#1e2433"); R(116, 106, 12, 2, "#2d3548"); A(116, 108, 12, 2, "#3fd0c9", ring); if (o.speaker) A(104, 94, 36, 30, "#3fd0c9", 0.12 * ring);
  // couch back, arms and the phone
  R(126, 128, 178, 52, "#1b1824"); R(126, 128, 178, 2, "#2a2534"); R(120, 120, 14, 60, "#17141f"); R(296, 120, 14, 60, "#17141f"); R(120, 120, 14, 2, "#28232f"); R(296, 120, 14, 2, "#28232f");
  R(298, 117, 9, 3, "#0a0a0d"); if (o.phone) { A(298, 117, 9, 3, "#9fd4ff", 0.9); A(292, 108, 22, 16, "#9fd4ff", 0.18 * (0.6 + 0.4 * Math.sin(now * 12))); }
  // the person on the couch, from behind, rim-lit by the TV
  const fx = o.flinch ? Math.round(Math.sin(now * 60)) : 0, hx = 206 + fx, hy = 104;
  R(hx - 18, hy + 12, 36, 18, "#07070b"); R(hx - 20, hy + 16, 40, 14, "#07070b");
  R(hx - 5, hy + 8, 10, 6, "#07070b");
  for (let r = -9; r <= 9; r++) { const w = Math.round(Math.sqrt(81 - r * r)); R(hx - w, hy + r, w * 2, 1, "#07070b"); }
  R(hx - 7, hy - 11, 3, 3, "#07070b"); R(hx + 2, hy - 12, 4, 3, "#07070b"); R(hx - 2, hy - 11, 3, 2, "#07070b");
  const rim = "#5fb8c8", ra = 0.55 * (o.glow ?? 1) * (0.85 + 0.15 * Math.sin(now * 7));
  for (let r = -9; r <= -2; r++) { const w = Math.round(Math.sqrt(81 - r * r)); A(hx - w, hy + r, 1, 1, rim, ra); A(hx + w - 1, hy + r, 1, 1, rim, ra); }
  A(hx - 6, hy - 10, 12, 1, rim, ra); A(hx - 18, hy + 12, 36, 1, rim, ra * 0.8);
}
function drawPhone(k, now) {
  const x = 210, y = Math.round(lerp(190, 38, ease(k)));
  R(x, y, 96, 132, "#101218"); R(x + 2, y + 2, 92, 128, "#1a1d26"); R(x + 4, y + 8, 88, 112, "#e9eef2"); R(x + 40, y + 4, 16, 2, "#2a2d36");
  R(x + 4, y + 8, 88, 11, "#0b5c57"); txt("CLEARPATH HR", x + 8, y + 11, "#ffffff");
  R(x + 8, y + 24, 80, 58, "#ffffff"); R(x + 8, y + 81, 80, 1, "#c9d3dc");
  const L = ["WELCOME TO THE TEAM,", "SAM!", "", "FIRST DAY: TOMORROW,", "9:00 AM.", "BADGE #0417", "", "PIP SAYS HI!"];
  L.forEach((s, i) => txt(s, x + 11, y + 27 + i * 7, s.startsWith("PIP") ? "#0b5c57" : "#1b2a3a"));
  txt("NOW", x + 74, y + 86, "#7d8d92");
  if (Math.floor(now * 2) % 2) R(x + 44, y + 122, 8, 2, "#3a3d46");
}

/* ---------- audio ---------- */
let AC = null, master = null, musicBus = null, sfxBus = null, NB = null, rainNode = null, soundOn = true;
const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
function ensureAudio() {
  try {
    if (!AC) {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      master = AC.createGain(); master.gain.value = soundOn ? 0.42 : 0; master.connect(AC.destination);
      musicBus = AC.createGain(); musicBus.gain.value = 0.5; musicBus.connect(master);
      sfxBus = AC.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
    }
    if (AC.state === "suspended") AC.resume();
  } catch { AC = null; }
}
function tone(f, d, type, v, { at = 0, slide = 0, bus = sfxBus } = {}) {
  if (!AC) return;
  const t = Math.max(at || 0, AC.currentTime), o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.linearRampToValueAtTime(Math.max(20, f + slide), t + d);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(bus); o.start(t); o.stop(t + d + 0.03);
}
function noiseBuf() { if (!NB) { NB = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate); const a = NB.getChannelData(0); for (let i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1; } return NB; }
function noise(d, v, ff, ft = "lowpass", { at = 0, bus = sfxBus } = {}) {
  if (!AC) return;
  const t = Math.max(at || 0, AC.currentTime), s = AC.createBufferSource(), fl = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = noiseBuf(); fl.type = ft; fl.frequency.value = ff;
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(d, 1.9));
  s.connect(fl).connect(g).connect(bus); s.start(t, Math.random() * 0.1); s.stop(t + Math.min(d, 1.9) + 0.03);
}
function rain(on) {
  if (!AC) return;
  if (on && !rainNode) {
    const s = AC.createBufferSource(), fl = AC.createBiquadFilter(), g = AC.createGain();
    s.buffer = noiseBuf(); s.loop = true; fl.type = "bandpass"; fl.frequency.value = 1400; fl.Q.value = 0.6; g.gain.value = 0.0001;
    g.gain.setTargetAtTime(0.05, AC.currentTime, 1.2);
    s.connect(fl).connect(g).connect(musicBus); s.start(); rainNode = { s, g };
  } else if (!on && rainNode) { const r = rainNode; rainNode = null; r.g.gain.setTargetAtTime(0.0001, AC.currentTime, 0.4); setTimeout(() => { try { r.s.stop(); } catch {} }, 1500); }
}
const at = (s) => (AC ? AC.currentTime + s : 0);
const SFX = {
  static: () => noise(0.8, 0.12, 3000, "highpass"),
  jingle: () => [72, 76, 79, 84].forEach((n, i) => { tone(mf(n), 0.35, "square", 0.05, { at: at(i * 0.11) }); tone(mf(n - 12), 0.35, "triangle", 0.06, { at: at(i * 0.11) }); }),
  pop: () => tone(880, 0.08, "sine", 0.06, { slide: 400 }),
  tick: () => tone(1320, 0.04, "square", 0.03),
  whoosh: () => noise(0.4, 0.05, 900, "bandpass"),
  ding: () => { tone(1047, 0.25, "sine", 0.07); tone(1568, 0.4, "sine", 0.05, { at: at(0.1) }); },
  buzz: () => { tone(110, 0.12, "square", 0.05); tone(110, 0.12, "square", 0.05, { at: at(0.2) }); },
  gotcha: () => { tone(784, 0.08, "square", 0.05); tone(659, 0.08, "square", 0.05, { at: at(0.09) }); tone(1047, 0.2, "square", 0.05, { at: at(0.18) }); },
  glitch: () => { for (let i = 0; i < 4; i++) tone(200 + i * 230, 0.04, "sawtooth", 0.05, { at: at(i * 0.04) }); },
  choose: () => tone(660, 0.06, "square", 0.04),
  right: () => { tone(784, 0.12, "sine", 0.07); tone(1175, 0.25, "sine", 0.06, { at: at(0.1) }); },
  hmm: () => { tone(392, 0.14, "triangle", 0.06); tone(330, 0.22, "triangle", 0.05, { at: at(0.12) }); },
  think: () => tone(523, 0.18, "sine", 0.03, { slide: 120 }),
  speaker: () => [72, 75, 79, 84].forEach((n, i) => tone(mf(n - 5), 0.6, "sine", 0.05, { at: at(i * 0.22) })),
  phone: () => { for (let i = 0; i < 2; i++) { tone(150, 0.18, "square", 0.05, { at: at(i * 0.35) }); tone(155, 0.18, "square", 0.04, { at: at(i * 0.35) }); } },
  card: () => tone(mf(45), 2.4, "triangle", 0.08),
  blip: () => tone(900 + Math.random() * 300, 0.025, "square", 0.012),
};
// Music: "ad" is a bright C-major jingle (112 BPM); "room" is a slow A-minor pad under the rain.
const MUSIC = {
  ad: { step: 60 / 112 / 4, play(s, t) {
    const bar = Math.floor(s / 16) % 4, st = s % 16, root = [60, 55, 57, 53][bar], third = [4, 4, 3, 4][bar];
    const notes = [root, root + third, root + 7, root + 12];
    if (st % 2 === 0) tone(mf(notes[(st / 2) % 4] + 12), 0.12, "triangle", 0.04, { at: t, bus: musicBus });
    if (st === 0 || st === 6 || st === 8 || st === 14) tone(mf(root - 12), 0.16, "square", 0.035, { at: t, bus: musicBus });
    if (st % 4 === 2) noise(0.03, 0.02, 7000, "highpass", { at: t, bus: musicBus });
  } },
  room: { step: 60 / 60 / 4, play(s, t) {
    if (s % 16 !== 0) return;
    const ch = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 55, 59, 64], [52, 56, 59, 62]][Math.floor(s / 16) % 4];
    ch.forEach((n) => tone(mf(n - 12), 4.2, "sine", 0.02, { at: t, bus: musicBus }));
  } },
};
let musicMode = null, seqStep = 0, nextTime = 0, seqTimer = null;
function setMusic(mode) {
  if (mode === musicMode) return;
  musicMode = mode; seqStep = 0;
  if (!AC) return;
  nextTime = AC.currentTime + 0.05;
  if (!seqTimer) seqTimer = setInterval(() => {
    if (!AC || !musicMode) return;
    const m = MUSIC[musicMode];
    while (nextTime < AC.currentTime + 0.15) { m.play(seqStep, nextTime); nextTime += m.step; seqStep++; }
  }, 25);
}
function closeAudio() {
  clearInterval(seqTimer); seqTimer = null; musicMode = null; rainNode = null;
  if (!AC) return;
  const ac = AC;
  try { master.gain.setTargetAtTime(0.0001, ac.currentTime, 0.1); } catch {}
  setTimeout(() => { try { ac.close(); } catch {} }, 600);
  AC = null; master = musicBus = sfxBus = NB = null;
}

/* ---------- the script ---------- */
// kinds: "ad" (a shot on the TV, full screen), "zoom" (pull back into the room), "think" (a thought, auto-advances),
// "ask" (a question the player answers for the person on the couch), "say" (someone else speaks),
// "phone" (the text message), "card" (black title card). A choice with `right: true` is the answer the ad taught;
// ethics questions have no right answer.
const STEPS = [
  { kind: "ad", draw: adLogo, dur: 4.6, ev: [[0, "static"], [0.85, "jingle"], [2.2, "pop"]], lines: [] },
  { kind: "ad", draw: adPrediction, dur: 15, ev: [[3.4, "tick"], [3.9, "tick"], [4.4, "tick"], [4.9, "tick"], [5.4, "tick"], [7, "pop"], [10.4, "ding"]], lines: [
    [0.3, 3.1, "PIP", "Hi! I'm Pip from Clearpath. My job is guessing what happens next!"],
    [3.3, 6.9, "PIP", "This is Maya. Every morning this week, she walked her dog at 7:00."],
    [7.1, 10.2, "PIP", "I spot the PATTERN. So what will she do on Saturday?"],
    [10.4, 15, "PIP", "Probably 7:00 again! I'm 92% sure. That's prediction: past patterns make a smart guess."],
  ] },
  { kind: "ad", draw: adMinimax, dur: 20.5, ev: [[0.4, "whoosh"], [4.6, "tick"], [4.85, "tick"], [5.1, "tick"], [5.35, "tick"], [8.6, "pop"], [12.2, "hmm"], [15.8, "ding"]], lines: [
    [0.3, 4.1, "PIP", "But some things fight back! Like a game where my opponent moves right after me."],
    [4.3, 8.4, "PIP", "The numbers are points for me. I want BIG numbers. My opponent wants SMALL ones."],
    [8.6, 12, "PIP", "A greedy guess says: \"Move A! It has a 9!\""],
    [12.2, 15.6, "PIP", "But my opponent won't let me have 9. They'll pick 1! So Move A is really worth 1."],
    [15.8, 20.5, "PIP", "Move B is worth 4 no matter what. I pick B! That's MINIMAX: expect their best move, then make yours."],
  ] },
  { kind: "ad", draw: adLookahead, dur: 15.5, ev: [[4.4, "tick"], [5.1, "tick"], [5.8, "tick"], [6.5, "tick"], [8.6, "glitch"], [11.9, "ding"]], lines: [
    [0.3, 4.1, "PIP", "The further ahead I look, the better I predict. But the futures add up fast!"],
    [4.3, 8.4, "PIP", "Each turn has 5 choices: up, down, left, right, or wait. 5, then 25, then 125, then 625..."],
    [8.6, 11.7, "PIP", "My trick is PRUNING: if a branch can't beat a plan I already found, I skip it!"],
    [11.9, 15.5, "PIP", "Basic Pip looks 1 move ahead. Premium Pip looks 3 moves ahead!"],
  ] },
  { kind: "ad", draw: adChase, dur: 16.5, ev: [[0.3, "whoosh"], [CHASE_START + (PIPP.length - 1) * CHASE_STEP, "gotcha"]], lines: [
    [0.3, 4.5, "PIP", "Now the real thing: a chase! I give every future I can imagine a score."],
    [4.7, 8.5, "PIP", "Me close to you is good for me. You close to the exit is bad for me."],
    [8.7, 12.6, "PIP", "Red dots are my plan. Gold dots are the moves I predict YOU will make."],
    [12.8, 16.5, "PIP", "You ran for the exit, just like I predicted. Gotcha! (In a friendly way.)"],
  ] },
  { kind: "ad", draw: adProducts, dur: 13.5, ev: [[0.5, "pop"], [2.6, "pop"], [4.7, "pop"]], lines: [
    [0.5, 4.5, "PIP", "Clearpath Home knows when you'll get home. Clearpath Shop knows what you'll buy next."],
    [4.7, 8.5, "PIP", "And Clearpath Wardens keep buildings safe by staying one step ahead."],
    [8.7, 13.5, "PIP", "The more we know about you, the better we predict!*"],
  ] },
  { kind: "ad", draw: adEnd, dur: 5.2, ev: [[0.2, "jingle"], [3.6, "glitch"]], lines: [] },
  { kind: "zoom", dur: 4.5, ev: [[0.2, "whoosh"]] },
  { kind: "think", text: "...Huh. So that's how it works." },
  { kind: "ask", q: "Wait. How did Pip know what Maya would do on Saturday?", choices: [
    { text: "It saw the same pattern every day", right: true, reply: "Right. Same walk, same time, every morning. It just watched long enough to spot the pattern. And 92% means it could still be wrong." },
    { text: "It can see the future", reply: "Nah. It noticed Maya does the same thing every morning. That's a pattern in the data, not magic. And 92% means it could still be wrong." },
    { text: "It guessed at random", reply: "Not random. It saw the same thing five days in a row and bet on a sixth. Prediction is spotting patterns, then guessing how sure you are." },
  ] },
  { kind: "ask", q: "In that points game, why didn't Pip go for the 9?", choices: [
    { text: "The opponent would never let it get 9", right: true, reply: "Exactly. Plan for the other side's best move, not the outcome you're hoping for. That's minimax." },
    { text: "Pip made a mistake", reply: "It wasn't a mistake. Move A looked great, but the opponent would steer it to 1. Move B was a sure 4. That's minimax." },
    { text: "Nine is too many points", reply: "Ha. No, more is better for Pip. But the opponent picks next, and they'd pick the 1. Always expect their best move." },
  ] },
  { kind: "ask", q: "And those red dots in the maze were...", choices: [
    { text: "Pip's plan for where to go next", right: true, reply: "Yep. Red was its plan, and gold was where it thought the runner would go. It was planning around a guess about you." },
    { text: "The path to the exit", reply: "No, red was Pip's own plan. The gold dots were its guess about where the runner would go." },
    { text: "Where the runner had already been", reply: "Those were future moves, not old ones. Red was Pip's plan. Gold was its guess about the runner's next moves." },
  ] },
  { kind: "ask", q: "So if one of those things ever chased me... how would I get away?", choices: [
    { text: "Think further ahead than it can", right: true, reply: "Right. It only looks a few moves ahead. If I can see further than that, I can slip past where it expects me to be." },
    { text: "Run straight for the exit", reply: "That's exactly what it expects. The runner did that and got caught. It only sees a few moves ahead, so I'd need to see further." },
    { text: "Stand still and wait", reply: "Waiting just lets it close in. It only looks a few moves ahead, so the trick is planning further than it does." },
  ] },
  { kind: "think", text: "Still... something about that ad bugs me." },
  { kind: "ask", ethics: true, q: "\"The more we know about you...\" Where would they even get all that data?", choices: [
    { text: "From people who agreed to share it", reply: "Maybe. But that fine print said opting out \"may not be available.\" Can you really agree to something you can't say no to?" },
    { text: "From everyone, whether they agreed or not", reply: "Phones, shopping, location, private messages... and nobody really asked. That's a lot to know about a person." },
    { text: "Who cares, if the predictions work?", reply: "It works for Clearpath. But the people being predicted never got a say. A good prediction isn't the same as a fair one." },
  ] },
  { kind: "ask", ethics: true, q: "Should a company be allowed to predict where someone will be... without asking them?", choices: [
    { text: "No, never", reply: "But some prediction helps, like weather alerts or keeping a building safe. Maybe the real question is who gets to decide." },
    { text: "Only if people say yes first", reply: "Yeah. Ask first, explain what it's for, and let people opt out. That seems fair." },
    { text: "Yes, if it keeps people safe", reply: "Maybe... but safe for who? If something is always watching you, who's watching it?" },
  ] },
  { kind: "say", dur: 4.8, who: "CLEARPATH HOME", text: "Prediction: you are still awake. Rest well, Sam.", ev: [[0, "speaker"]] },
  { kind: "think", text: "...I never told it my name." },
  { kind: "phone", dur: 6.5, ev: [[0, "phone"]] },
  { kind: "think", text: "Well. Guess I'll find out how it really works from the inside." },
  { kind: "card", dur: 4.2, ev: [[0.3, "card"]] },
];

/* ---------- player ---------- */
/**
 * Play the prologue full-screen. Resolves when it ends or the player skips it.
 * @param {{ autoStart?: boolean }} [options] autoStart: begin right away (only when the player just clicked or
 *   pressed a key, since browsers block sound until then). Otherwise it waits on a start button.
 */
export function playPrologue({ autoStart = false } = {}) {
  if (active) return Promise.resolve();
  active = true;
  return new Promise((resolve) => {
    const root = document.createElement("div");
    root.className = "cutscene prologue";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "Prologue");
    root.innerHTML = `
      <div class="cs-stage">
        <canvas width="320" height="180" aria-label="Pixel-art prologue: a Clearpath TV ad, then a living room at night"></canvas>
        <div class="cs-dlg" hidden><span class="cs-who"></span><span class="cs-line"></span></div>
        <div class="pl-think" hidden>
          <div class="pl-bubble"><p class="pl-q"></p><p class="pl-tag" hidden>No wrong answer. Just think about it.</p></div>
          <div class="pl-choices" role="group" aria-label="Answer for them"></div>
          <div class="pl-bubble pl-reply" hidden><p></p></div>
          <button type="button" class="pl-next" hidden>Continue ›</button>
        </div>
        <button class="cs-start" type="button" ${autoStart ? "hidden" : ""}><span class="cs-tri" aria-hidden="true"></span><span>Start the story</span><small>Click or press any key · sound on</small></button>
      </div>
      <div class="cs-bar">
        <button type="button" class="cs-btn cs-sound" aria-pressed="true">Sound on</button>
        <span class="cs-hint">1 2 3 answer · Enter continue · Space pause · Esc skip</span>
        <button type="button" class="cs-btn cs-skip">Skip prologue ›</button>
      </div>`;
    document.body.appendChild(root);
    const q = (sel) => root.querySelector(sel);
    const canvas = q("canvas"), main = canvas.getContext("2d");
    const dlg = q(".cs-dlg"), who = q(".cs-who"), lineEl = q(".cs-line"), startBtn = q(".cs-start");
    const think = q(".pl-think"), qEl = q(".pl-q"), tag = q(".pl-tag"), choicesEl = q(".pl-choices"), replyBox = q(".pl-reply"), replyEl = q(".pl-reply p"), nextBtn = q(".pl-next");
    const mk = () => { const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d"); x.imageSmoothingEnabled = false; return [c, x]; };
    const [tvCv, tvCtx] = mk(), [roomCv, roomCtx] = mk();
    main.imageSmoothingEnabled = false;

    let si = 0, lt = 0, clock = 0, playing = false, started = false, last = null, raf = 0;
    let ask = null; // { phase: "q" | "choose" | "reply", choice, replyAt, readFor }
    let dlgKey = "", prevTyped = 0;

    function enterStep(i) {
      si = i; lt = 0; ask = null; prevTyped = 0;
      const s = STEPS[si];
      if (!s) return finish();
      think.hidden = true; replyBox.hidden = true; nextBtn.hidden = true; choicesEl.innerHTML = ""; tag.hidden = true;
      setMusic(s.kind === "ad" ? "ad" : s.kind === "card" ? null : "room");
      if (s.kind === "zoom") rain(true);
      if (s.kind === "card") rain(false);
      if (s.kind === "think" || s.kind === "ask") {
        think.hidden = false; qEl.textContent = ""; SFX.think();
        if (s.kind === "ask") {
          ask = { phase: "q" };
          tag.hidden = !s.ethics;
          s.choices.forEach((c, k) => {
            const b = document.createElement("button");
            b.type = "button"; b.className = "pl-choice"; b.hidden = true;
            b.innerHTML = `<span class="pl-key">${k + 1}</span><span></span>`;
            b.lastChild.textContent = c.text;
            b.addEventListener("click", () => answer(k));
            choicesEl.appendChild(b);
          });
        }
      }
    }
    const thinkDur = (s) => 1.2 + s.text.length / 30 + 1.6;
    const qTyped = () => STEPS[si].q.length / 45 + 0.2;

    function showChoices() {
      ask.phase = "choose"; qEl.textContent = STEPS[si].q;
      [...choicesEl.children].forEach((b, k) => { b.hidden = false; b.style.animationDelay = `${k * 0.08}s`; });
      choicesEl.firstChild?.focus({ preventScroll: true });
    }
    function answer(k) {
      if (!ask || ask.phase !== "choose") return;
      const s = STEPS[si], c = s.choices[k];
      // q1-q4 are the comprehension questions, q5-q6 the ethics ones (no wrong answer, so correct = true).
      const qNum = STEPS.slice(0, si + 1).filter((x) => x.kind === "ask").length;
      logger.recordAnswer(`q${qNum}`, "ABC"[k] ?? String(k), s.ethics ? true : !!c.right);
      ask.phase = "reply"; ask.choice = k; ask.replyAt = lt; ask.readFor = 2.2 + c.reply.length / 16;
      [...choicesEl.children].forEach((b, j) => {
        b.disabled = true;
        if (j === k) b.classList.add(s.ethics ? "pl-picked" : c.right ? "pl-right" : "pl-other"); else b.hidden = true;
      });
      replyBox.hidden = false; replyBox.classList.toggle("pl-good", !!c.right); replyEl.textContent = "";
      nextBtn.hidden = false; nextBtn.focus({ preventScroll: true });
      if (s.ethics) SFX.think(); else (c.right ? SFX.right : SFX.hmm)();
    }
    // Enter / Continue: finish typing first, then move on.
    function advance() {
      const s = STEPS[si]; if (!s || !started) return;
      if (s.kind === "think") { const full = s.text.length / 38 + 0.2; if (lt < full) lt = full; else enterStep(si + 1); }
      else if (s.kind === "ask") {
        if (ask.phase === "q") { lt = qTyped(); showChoices(); }
        else if (ask.phase === "reply") { const full = ask.replyAt + STEPS[si].choices[ask.choice].reply.length / 40 + 0.1; if (lt < full) lt = full; else enterStep(si + 1); }
      } else if (s.kind === "say" || s.kind === "phone") { if (lt > 1.2) enterStep(si + 1); }
    }
    nextBtn.addEventListener("click", advance);

    function begin() {
      if (started) return;
      started = true; startBtn.hidden = true; ensureAudio(); playing = true; last = null; enterStep(0);
    }
    function finish() {
      if (!active) return;
      active = false; cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey, true);
      closeAudio();
      root.classList.add("cs-out"); setTimeout(() => root.remove(), 350);
      resolve();
    }
    function onKey(e) {
      e.stopImmediatePropagation();
      if (e.key === "Escape") { e.preventDefault(); finish(); return; }
      if (!started) { e.preventDefault(); begin(); return; }
      if (ask && ask.phase === "choose" && /^[1-3]$/.test(e.key)) { e.preventDefault(); answer(Number(e.key) - 1); return; }
      if (e.key === " ") {
        const s = STEPS[si];
        if (s && (s.kind === "ad" || s.kind === "zoom")) { e.preventDefault(); playing = !playing; last = null; }
        return;
      }
      if (e.key === "Enter") {
        const onChoice = document.activeElement?.classList?.contains("pl-choice") && ask?.phase === "choose";
        if (!onChoice && document.activeElement !== nextBtn) { e.preventDefault(); advance(); }
      }
      if (ask && ask.phase === "choose" && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault(); const items = [...choicesEl.children], i = items.indexOf(document.activeElement);
        items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus();
      }
    }
    window.addEventListener("keydown", onKey, true);
    startBtn.addEventListener("click", begin);
    q(".cs-skip").addEventListener("click", finish);
    q(".cs-sound").addEventListener("click", (e) => {
      soundOn = !soundOn; e.currentTarget.textContent = soundOn ? "Sound on" : "Sound off"; e.currentTarget.setAttribute("aria-pressed", String(soundOn));
      if (soundOn) ensureAudio();
      if (master) master.gain.setTargetAtTime(soundOn ? 0.42 : 0, AC.currentTime, 0.05);
    });

    function setDialogue(line, s) {
      const text = line ? typed(line[3], lt, line[0]) : "";
      const key = line ? `${si}|${line[2]}|${text}` : "";
      if (key === dlgKey) return;
      dlgKey = key; dlg.hidden = !line;
      if (!line) return;
      who.textContent = line[2] === "PIP" ? "PIP · CLEARPATH AD" : line[2]; lineEl.textContent = text;
      if (line[2] === "PIP" && soundOn && text.length > prevTyped && text.length % 3 === 0) SFX.blip();
      prevTyped = text.length;
    }

    function update(dt) {
      const s = STEPS[si]; if (!s) return;
      const prev = lt; lt += dt;
      for (const [t, n] of s.ev ?? []) if (t > prev - 1e-6 && t <= lt && (prev > 0 || t >= 0)) SFX[n]?.();
      if (s.kind === "ad" || s.kind === "zoom" || s.kind === "card") { if (lt >= s.dur) enterStep(si + 1); }
      else if (s.kind === "say" || s.kind === "phone") { if (lt >= s.dur) enterStep(si + 1); }
      else if (s.kind === "think") { if (lt >= thinkDur(s)) enterStep(si + 1); }
      else if (s.kind === "ask") {
        if (ask.phase === "q" && lt >= qTyped()) showChoices();
        if (ask.phase === "reply" && lt - ask.replyAt >= ask.readFor) enterStep(si + 1);
      }
    }

    function composeRoom(o, crop) {
      ctx = roomCtx; drawRoom(clock, { tv: tvCv, ...o });
      ctx = main;
      const [cx, cy, cw, ch] = crop;
      main.drawImage(roomCv, cx, cy, cw, ch, 0, 0, W, H);
      if (cw < W - 0.5) { const sc = W / cw; main.drawImage(tvCv, 0, 0, W, H, (TV.x - cx) * sc, (TV.y - cy) * sc, TV.w * sc, TV.h * sc); }
    }
    function crt() { for (let y = 0; y < H; y += 2) A(0, y, W, 1, "#000000", 0.08); A(0, 0, W, 3, "#000000", 0.25); }

    function render() {
      const s = STEPS[si];
      main.setTransform(1, 0, 0, 1, 0, 0); main.globalAlpha = 1;
      ctx = main; R(0, 0, W, H, "#000000");
      if (!started) { ctx = tvCtx; adLogo(3); ctx = main; main.drawImage(tvCv, 0, 0); crt(); dlg.hidden = true; return; }
      if (!s) return;
      if (s.kind === "ad") {
        ctx = tvCtx; s.draw(lt); ctx = main; main.drawImage(tvCv, 0, 0); crt();
        txt("CPN", 296, 8, "rgba(255,255,255,0.6)"); txt("AD", 8, 170, "rgba(255,255,255,0.5)");
        if (lt < 0.3 && si > 0) A(0, 0, W, H, "#ffffff", 0.35 * (1 - lt / 0.3));
        setDialogue(s.lines.find((l) => lt >= l[0] && lt < l[1]), s);
        return;
      }
      setDialogue(s.kind === "say" ? [0, s.dur, s.who, s.text] : null, s);
      ctx = tvCtx; tvIdle(clock); ctx = main;
      if (s.kind === "card") {
        R(0, 0, W, H, "#000000"); ctx.globalAlpha = seg(lt, 0.3, 1.2) * (1 - seg(lt, s.dur - 0.8, s.dur));
        txtC("SIX MONTHS LATER", 160, 84, "#d9dfeb", 2); ctx.globalAlpha = 1; return;
      }
      if (s.kind === "zoom") {
        const k = ease(seg(lt, 0.4, s.dur));
        composeRoom({ glow: k }, [lerp(TV.x, 0, k), lerp(TV.y, 0, k), lerp(TV.w, W, k), lerp(TV.h, H, k)]);
        return;
      }
      const lastStep = STEPS.length - 1;
      const o = { speaker: s.kind === "say", flinch: s.kind === "say" && lt > 1.6 && lt < 2.1, phone: s.kind === "phone" || (si === lastStep - 1), tvDim: si >= lastStep - 3 ? 0.35 : 0 };
      composeRoom(o, [0, 0, W, H]);
      if (s.kind === "phone") drawPhone(seg(lt, 0.4, 1.2), clock);
      if (s.kind === "think" || s.kind === "ask") {
        for (const [x, y, r] of [[194, 92, 1.5], [184, 87, 2.2], [172, 81, 3]]) for (const [rr, c] of [[r + 1, "#000000"], [r, "#f3efe4"]]) for (let dy = -Math.floor(rr); dy <= Math.floor(rr); dy++) { const w = Math.round(Math.sqrt(rr * rr - dy * dy)); R(x - w, y + dy, w * 2 + 1, 1, c); }
        if (s.kind === "think") qEl.textContent = typed(s.text, lt, 0.2);
        else if (ask.phase === "q") qEl.textContent = typed(s.q, lt, 0.2, 45);
        else if (ask.phase === "reply") replyEl.textContent = typed(s.choices[ask.choice].reply, lt, ask.replyAt, 40);
      }
      if (si === lastStep - 1) { const d = thinkDur(s), f = seg(lt, d - 1.2, d); A(0, 0, W, H, "#000000", f); think.style.opacity = String(1 - f); }
      else think.style.opacity = "";
    }

    function frame(nowMs) {
      if (!active) return;
      const dt = last == null ? 0 : Math.min(0.1, (nowMs - last) / 1000); last = nowMs;
      if (started && playing) { clock += dt; update(dt); }
      if (active) render();
      raf = requestAnimationFrame(frame);
    }
    if (autoStart) begin(); else startBtn.focus();
    raf = requestAnimationFrame(frame);
  });
}

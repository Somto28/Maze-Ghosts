// three-view.js — a 3D view of the game using Three.js.
// All rules and AI come from ../src; this file only draws and handles input.

import * as THREE from "three";
import { MazeGame, buildLayout3D, chooseGhostMoves, describeLevel, dronePhase, gridToWorld } from "../src/index.js";
import { canvasTexture, floorDecal } from "./art-kit.js";
import { buildBasement } from "./basement.js";
import { buildCore } from "./core.js";
import { buildServerHalls } from "./server-halls.js";
import { buildVault } from "./vault.js";
import { buildExecutive } from "./executive.js";
import { buildUplink } from "./uplink.js";
import { createQuality } from "./quality.js";
import { makeActor, SPRITE_DEPTH } from "./sprites.js";
import { music } from "./music.js";
import { mountSoundWidget } from "./sound-settings.js";
import { cutsceneActive, playCutscene } from "./cutscene.js";
import { showTitleScreen, titleActive } from "./title-screen.js";
import { playPrologue, prologueActive } from "./prologue.js";
import { logger } from "./log.js";

const TILE = 1;
const STEP_MS = 220; // pause between your move and the ghosts', so the turns are visible
const PLAYER_Y = 0, WARDEN_Y = 0, DRONE_Y = 0.42; // the characters stand on the floor; drones hover
// theme.style -> custom art for that level
const LOOKS = { basement: buildBasement, "server-halls": buildServerHalls, core: buildCore, vault: buildVault, executive: buildExecutive, uplink: buildUplink };
const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// ?level=2 starts on Level 2, ?fps shows the frame rate, ?res=1 pins the render resolution (testing),
// ?intro=0 skips the story cutscenes, ?title=0 skips the home screen, ?glitch=1 unlocks the glitch,
// ?scene=core previews the Level 3 cutscene.
const params = new URLSearchParams(location.search);

const game = new MazeGame();
// ?glitch=1 starts with the glitch already unlocked on every level (for testing and demos).
if (params.get("glitch") === "1") game.catches.fill(game.glitchAfter);
const startAt = Number(params.get("level")) - 1;
if (startAt > 0 && startAt < game.levels.length) game.startLevel(startAt);
const $ = (id) => document.getElementById(id);

// Smoothness: drawing cost is mostly pixels, so on sharp (high-DPI) screens skip multisampling,
// which costs a lot there and adds little, and let quality.js pick the resolution.
const dpr = window.devicePixelRatio || 1;
const renderer = new THREE.WebGLRenderer({ antialias: dpr < 1.5, powerPreference: "high-performance" });
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false; // redrawn only when something that casts a shadow moves
$("view").appendChild(renderer.domElement);

const quality = createQuality({
  maxRatio: Math.min(dpr, 2),
  fixed: Number(params.get("res")) || undefined,
  onChange(ratio) {
    renderer.setPixelRatio(ratio);
    renderer.setSize(window.innerWidth, window.innerHeight);
  },
});
quality.start();

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
let scene, layout, look, player, playerGlow, ghosts, ghostGlows, blobs, planDots;
let drives = [], exitPads = []; // evidence drives, exit pads (red while locked)
let builtLevel = -1;
let busy = false;
let turnToken = 0; // bumped on restart so a late answer from the worker is ignored

// What the HUD calls the enemies on this level ("warden" unless the level says otherwise).
function enemy(level = game.level) {
  const one = level.enemy ?? "warden";
  const { name } = describeLevel(level);
  return { one, many: `${one}s`, name, Name: name.replace(/^./, (ch) => ch.toUpperCase()), plural: name.endsWith("s") };
}
const isDrone = (i) => game.state.roles?.[i] === "drone";

// ---------- The ghosts think in a Web Worker, so the animation never stalls while they plan ----------
let worker = null;
try {
  worker = new Worker(new URL("./ghost-worker.js", import.meta.url), { type: "module" });
} catch {
  worker = null; // no workers: think on the main thread instead
}
const waiting = new Map();
let nextId = 0;
worker?.addEventListener("message", ({ data }) => { waiting.get(data.id)?.(data.decision); waiting.delete(data.id); });
worker?.addEventListener("error", () => { worker = null; for (const done of waiting.values()) done(null); waiting.clear(); });

/** Ask for the ghosts' decision; resolves to null if it has to be worked out on the main thread. */
function thinkInBackground() {
  if (!worker) return Promise.resolve(null);
  const { state, lookahead, options } = game.ghostSearch;
  const id = nextId++;
  return new Promise((done) => {
    waiting.set(id, done);
    worker.postMessage({ type: "think", id, state, lookahead, options: { pruning: options.pruning, weights: options.weights, habits: options.habits } });
  });
}

// Free the GPU memory held by the previous level.
function disposeScene() {
  look?.dispose?.();
  scene?.traverse((o) => {
    o.geometry?.dispose();
    for (const m of [o.material].flat()) {
      if (!m) continue;
      for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
      m.dispose();
    }
  });
}

// The plain look: soft sky light plus a sun that casts shadows.
function defaultLights(t, c, span) {
  const sun = new THREE.DirectionalLight(0xffffff, 2.0 * t.light);
  sun.position.set(c.x - span * 0.4, span * 1.2, c.z - span * 0.3);
  sun.target.position.set(c.x, 0, c.z);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 0.5, far: span * 4 });
  const lights = new THREE.Group();
  lights.add(new THREE.HemisphereLight(0xc8dcff, 0x1a2030, 1.4 * t.light), sun, sun.target);
  return lights;
}

// Vents: a numbered grate on the floor in its vent's colour (you fit, they don't).
const VENT_COLORS = { 1: "#2ee6c8", 2: "#b48cff", 3: "#c6f35a", 4: "#ff8ad8" };
function ventTexture(id) {
  const color = VENT_COLORS[id] ?? "#9fe";
  return canvasTexture(THREE, 128, (g, w) => {
    g.fillStyle = "#11161c"; g.fillRect(0, 0, w, w);
    g.fillStyle = "#3a4552";
    for (let i = 12; i < w - 8; i += 16) g.fillRect(i, 12, 7, w - 24);
    g.strokeStyle = color; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, w - 12);
    g.fillStyle = color; g.font = "bold 64px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.shadowColor = "#000"; g.shadowBlur = 8;
    g.fillText(String(id), w / 2, w / 2 + 4);
  }, { wrap: false });
}

// A dashed arc over the walls joining a vent's two grates, so you can see where it comes out.
function ventArc(a, b, color, height) {
  const pa = gridToWorld(a, TILE), pb = gridToWorld(b, TILE);
  const mid = new THREE.Vector3((pa.x + pb.x) / 2, height, (pa.z + pb.z) / 2);
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(pa.x, 0.1, pa.z), mid, new THREE.Vector3(pb.x, 0.1, pb.z));
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(curve.getPoints(48)),
    new THREE.LineDashedMaterial({ color, dashSize: 0.25, gapSize: 0.18, transparent: true, opacity: 0.85 }),
  );
  line.computeLineDistances();
  return line;
}

// Evidence drives and the exit lock follow the game state.
function drawEvidence() {
  const { exitOpen } = game.evidence;
  const s = game.state;
  drives.forEach((d, i) => { d.visible = !((s.collected >> i) & 1); });
  for (const pad of exitPads) pad.material.color.set(exitOpen ? 0x2bd36a : 0xd23b3b);
  look?.setExitOpen?.(exitOpen); // e.g. the Uplink's beam turns from red to cyan
}

// ---------- Scene from the level's 3D layout ----------
function buildScene() {
  disposeScene();
  builtLevel = game.levelIndex;
  layout = buildLayout3D(game.level, { tileSize: TILE });
  const t = layout.theme;
  const c = layout.floor.position;
  const span = Math.max(layout.floor.size.x, layout.floor.size.z);
  look = LOOKS[t.style]?.(THREE, layout, { still });
  document.body.dataset.style = t.style ?? ""; // lets the page restyle the HUD to match
  document.body.dataset.level = String(game.level.id); // levels that reuse a look relabel its HUD
  // Looks without real shadows paint their shade into textures; actors then get soft blob shadows.
  renderer.shadowMap.enabled = look?.shadows ?? true;

  scene = new THREE.Scene();
  const bg = new THREE.Color(t.floorColor).multiplyScalar(0.6);
  // A look can paint its own backdrop (the vault hall, the executive suite's windows, the night skyline).
  scene.background = look?.background ?? bg;
  scene.fog = new THREE.FogExp2(look?.fogColor ? new THREE.Color(look.fogColor) : bg, t.fog);
  scene.add(look ? look.group : defaultLights(t, c, span));

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(layout.floor.size.x, layout.floor.size.z),
    look?.floorMaterial ?? new THREE.MeshStandardMaterial({ color: t.floorColor, roughness: 0.95 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(c.x, 0, c.z);
  floor.receiveShadow = true;
  scene.add(floor);

  if (look?.walls) {
    scene.add(look.walls);
  } else {
    // One InstancedMesh draws every wall in a single call (fast on school Chromebooks).
    const walls = new THREE.InstancedMesh(
      new THREE.BoxGeometry(TILE, t.wallHeight, TILE),
      look?.wallMaterial ?? new THREE.MeshStandardMaterial({ color: t.wallColor, roughness: 0.7 }),
      layout.walls.length,
    );
    const m = new THREE.Matrix4();
    layout.walls.forEach((w, i) => walls.setMatrixAt(i, m.makeTranslation(w.position.x, w.position.y, w.position.z)));
    walls.castShadow = walls.receiveShadow = true;
    scene.add(walls);
  }

  // Glows are soft patches on the floor rather than point lights: a real light costs every pixel on screen.
  exitPads = [];
  for (const e of layout.exits) {
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(TILE * 0.9, 0.04, TILE * 0.9),
      new THREE.MeshBasicMaterial({ color: 0x2bd36a }),
    );
    pad.position.set(e.position.x, 0.02, e.position.z);
    const glow = floorDecal(THREE, { color: 0x4ade80, size: 2.6, opacity: 0.55 });
    glow.position.set(e.position.x, 0.05, e.position.z);
    exitPads.push(pad);
    scene.add(pad, glow);
  }

  // Vents: a numbered grate at each end, a glow in the vent's colour, and an arc joining the pair.
  for (const { id, a, b } of layout.vents) {
    const color = VENT_COLORS[id] ?? "#9fe";
    const material = new THREE.MeshBasicMaterial({ map: ventTexture(id) });
    for (const end of [a, b]) {
      const { x, z } = gridToWorld(end, TILE);
      const grate = new THREE.Mesh(new THREE.PlaneGeometry(TILE * 0.86, TILE * 0.86).rotateX(-Math.PI / 2), material);
      grate.position.set(x, 0.025, z);
      const glow = floorDecal(THREE, { color, size: 1.8, opacity: 0.45, y: 0.03 });
      glow.position.set(x, 0.03, z);
      scene.add(grate, glow);
    }
    scene.add(ventArc(a, b, color, t.wallHeight + 1.2));
  }

  // Evidence drives: small glowing cases floating over their tiles.
  drives = layout.keys.map((k) => {
    const drive = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.12, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x7fe6ff, emissive: 0x29b6ff, emissiveIntensity: 0.9 }),
    );
    const glow = floorDecal(THREE, { color: 0x29b6ff, size: 1.6, opacity: 0.6, y: -0.38 });
    drive.add(box, glow);
    drive.position.set(k.position.x, 0.42, k.position.z);
    drive.userData.spin = (t) => { box.rotation.y = t * 1.6; box.position.y = Math.sin(t * 2.4) * 0.05; };
    scene.add(drive);
    return drive;
  });

  // The characters: animated pixel-art sprites (game_server/sprites.js).
  player = makeActor(THREE, "player");
  player.userData.hover = PLAYER_Y;
  playerGlow = floorDecal(THREE, { color: 0x5ab0ff, size: 1.7, opacity: 0.4, y: 0.015 });
  ghosts = layout.ghostStarts.map((start) => {
    const drone = start.role === "drone";
    const g = drone ? makeActor(THREE, "drone", { color: t.droneColor ?? "#ffb020" }) : makeActor(THREE, "warden", { color: t.ghostColor });
    g.userData.hover = drone ? DRONE_Y : WARDEN_Y;
    return g;
  });
  ghostGlows = ghosts.map((_, i) => floorDecal(THREE, { color: layout.ghostStarts[i].role === "drone" ? t.droneColor ?? "#ffb020" : t.ghostColor, size: 3, opacity: 0.5, y: 0.015 }));
  // Sprites don't cast real shadows, so every character gets a soft contact shadow.
  blobs = [player, ...ghosts].map((actor, i) => {
    const drone = i > 0 && layout.ghostStarts[i - 1].role === "drone";
    const blob = floorDecal(THREE, { color: 0x000000, size: drone ? 0.6 : i === 0 ? 0.75 : 0.95, opacity: drone ? 0.45 : 0.6, additive: false, y: 0.02 });
    blob.userData.actor = actor;
    return blob;
  });
  planDots = { ghost: makeDots(0xff5a6e, ghosts.length), player: makeDots(0xffd166, 1) };
  scene.add(player, playerGlow, ...ghosts, ...ghostGlows, ...blobs, planDots.ghost, planDots.player);

  resetActors();
  resize();
  renderer.compile(scene, camera); // compile every shader now, not mid-move
  quality.reset();
}

function resetActors() {
  turnToken++;
  busy = false;
  placeAt(player, game.state.player, PLAYER_Y, true);
  game.state.ghosts.forEach((g, i) => placeAt(ghosts[i], g, ghosts[i].userData.hover, true));
  drawPlan(null);
  drawEvidence();
  renderer.shadowMap.needsUpdate = true;
}

// Builds the scene only when the level changes; restarting the same level just resets the actors.
function showLevel(message) {
  logger.startAttempt(game.level.id); // every start, restart and next level is a new attempt
  music.setLevel(game.levelIndex); // a new level switches track; a retry keeps the music going
  if (game.levelIndex === builtLevel) resetActors();
  else buildScene();
  updateHud(message);
}

// Actors glide toward their target tile each frame instead of jumping.
function placeAt(mesh, pos, y, instant = false) {
  const { x, z } = gridToWorld(pos, TILE);
  mesh.userData.target = new THREE.Vector3(x, y, z);
  mesh.userData.queue = [];
  if (instant) mesh.position.copy(mesh.userData.target);
}

// A drone's dash covers two tiles: glide through each one so it never cuts through a wall.
function placeAlong(mesh, path, y) {
  if (path.length <= 1) return path.length ? placeAt(mesh, path[0], y) : undefined;
  placeAt(mesh, path[0], y);
  mesh.userData.queue = path.slice(1).map((p) => { const { x, z } = gridToWorld(p, TILE); return new THREE.Vector3(x, y, z); });
}

// ---------- Camera: fit the whole maze into the part of the screen the panels don't cover ----------
function safeArea(w, h) {
  const hud = $("hud").getBoundingClientRect();
  const pad = $("pad").getBoundingClientRect();
  if (w > 820) return { left: hud.right + 16, top: 16, right: pad.left - 12, bottom: h - 16 };
  return { left: 12, top: hud.bottom + 8, right: w - 12, bottom: pad.top - 8 };
}

function fitCamera() {
  const w = window.innerWidth, h = window.innerHeight;
  const safe = safeArea(w, h);
  // Shift the picture so the maze is centred in the safe area.
  const cx = (safe.left + safe.right) / 2, cy = (safe.top + safe.bottom) / 2;
  camera.aspect = w / h;
  camera.setViewOffset(w, h, w / 2 - cx, h / 2 - cy, w, h);

  // Same viewing angle as the layout suggests; find the closest distance where every corner fits.
  const c = new THREE.Vector3(layout.floor.position.x, 0, layout.floor.position.z);
  const dir = new THREE.Vector3(layout.camera.position.x, layout.camera.position.y, layout.camera.position.z).sub(c).normalize();
  const hx = layout.floor.size.x / 2, hz = layout.floor.size.z / 2, top = layout.theme.wallHeight;
  const corners = [];
  for (const x of [-hx, hx]) for (const z of [-hz, hz]) for (const y of [0, top]) corners.push(new THREE.Vector3(c.x + x, y, c.z + z));

  const fits = (dist) => {
    camera.position.copy(c).addScaledVector(dir, dist);
    camera.lookAt(c);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    return corners.every((p) => {
      const v = p.clone().project(camera);
      const sx = ((v.x + 1) / 2) * w, sy = ((1 - v.y) / 2) * h;
      return v.z < 1 && sx >= safe.left && sx <= safe.right && sy >= safe.top && sy <= safe.bottom;
    });
  };
  let lo = 1, hi = 400;
  for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
  fits(hi);

  // The character cards face the camera, so they lean back over the tile behind them. For depth they're
  // pulled toward the camera far enough to clear the wall behind, but not so far that the wall in front
  // stops hiding them (see sprites.js).
  const tilt = Math.asin(Math.min(1, dir.y)), sin = Math.sin(tilt), cos = Math.cos(tilt);
  const half = layout.tileSize / 2;
  SPRITE_DEPTH.pull.value = Math.max(0.2, Math.min(top * sin - half * cos + 0.12, half / cos - 0.06));
}

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (layout) fitCamera();
}
window.addEventListener("resize", resize);

// ---------- The ghosts' predicted future, drawn on the floor ----------
// Two instanced meshes (one per colour) draw every dot in two calls, and they're created with the
// level, so the first ghost move doesn't stall while a new shader compiles.
const MAX_STEPS = 2 * Math.max(...game.levels.map((l) => l.lookahead)) + 2;

function makeDots(color, perStep) {
  const count = MAX_STEPS * perStep;
  // Drawn over everything (depthTest off): a character or a wall must never hide the prediction.
  const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false }), count);
  dots.renderOrder = 20;
  dots.userData.color = new THREE.Color(color);
  for (let i = 0; i < count; i++) dots.setColorAt(i, dots.userData.color);
  dots.count = 0;
  dots.frustumCulled = false;
  return dots;
}

const dotMatrix = new THREE.Matrix4(), dotColor = new THREE.Color();
const dotSpot = new THREE.Vector3(), dotScale = new THREE.Vector3(), noTurn = new THREE.Quaternion();

function drawPlan(thinking) {
  const chosen = thinking?.options.find((o) => o.chosen);
  for (const dots of Object.values(planDots)) dots.count = 0;
  // plan[0] is the move they just made; the rest is what they expect to happen next.
  // A ghosts' step lists every ghost's tile; a player step is one tile.
  (chosen?.plan.slice(1) ?? []).forEach((step, i) => {
    const isGhost = step.who === "ghost";
    const dots = isGhost ? planDots.ghost : planDots.player;
    for (const at of isGhost ? step.at : [step.at]) {
      const { x, z } = gridToWorld(at, TILE);
      dotSpot.set(x + (isGhost ? 0.14 : -0.14), 0.12, z);
      dotScale.setScalar(Math.max(0.5, 1 - i * 0.06)); // further into the future = smaller and dimmer
      dots.setMatrixAt(dots.count, dotMatrix.compose(dotSpot, noTurn, dotScale));
      dots.setColorAt(dots.count, dotColor.copy(dots.userData.color).multiplyScalar(Math.max(0.3, 0.95 - i * 0.07)));
      dots.count++;
    }
  });
  for (const dots of Object.values(planDots)) {
    dots.instanceMatrix.needsUpdate = true;
    dots.instanceColor.needsUpdate = true;
  }
}

// ---------- HUD ----------
function updateHud(message) {
  const { id, name } = game.level;
  const e = enemy();
  const about = describeLevel(game.level);
  $("level-name").textContent = `Level ${id} · ${name}`;
  // Bold the numbers: "2 wardens plan together, 3 moves ahead".
  $("depth").innerHTML = about.line.replace(/(\d+ (?:moves?|tiles?|wardens?|ghosts?))/g, "<b>$1</b>");
  $("legend-enemy").textContent = `${possessive(e.Name)} plan`;
  $("legend-vent").hidden = !about.vents;
  if (message !== undefined) $("message").textContent = message;

  // Status chips: evidence, drone charge, what learning wardens know.
  const chips = [];
  const ev = game.evidence;
  if (ev.total) chips.push(`<span class="chip ${ev.exitOpen ? "ok" : ""}">Evidence ${ev.held}/${ev.total} · exit ${ev.exitOpen ? "unlocked" : "locked"}</span>`);
  if (about.drones) {
    const charged = (game.level.dronePattern ?? [2])[dronePhase(game.state)] > 0;
    chips.push(`<span class="chip ${charged ? "warn" : ""}">Drone: ${charged ? "dash ready" : "recharging"}</span>`);
  }
  // Standing next to a vent grate: say how to use it.
  const { r, c } = game.state.player, grid = game.state.grid;
  const ventNear = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].map(([y, x]) => grid[y]?.[x]).find((tile) => tile >= "1" && tile <= "4");
  if (ventNear && game.status === "playing") chips.push(`<span class="chip vent">Vent ${ventNear} next to you: step onto the grate to crawl out of the other grate ${ventNear}</span>`);
  if (game.glitchUnlocked) {
    const label = game.glitchArmed ? "⚡ Glitch armed: your next move is free" : game.glitchUsed ? "⚡ Glitch used this attempt" : "⚡ Glitch ready: press G";
    chips.push(`<span class="chip glitch ${game.glitchArmed ? "armed" : ""}">${label}</span>`);
  }
  updateGlitchButton();
  if (game.level.learns) {
    const n = game.attemptsStudied;
    chips.push(`<span class="chip ${n ? "warn" : ""}">${n ? `Studied ${n} of your attempts` : "No data on you yet"}</span>`);
  }
  $("status").innerHTML = chips.join("");
  $("status").hidden = chips.length === 0;

  const t = game.lastThinking;
  $("thinking").innerHTML = t
    ? `<div class="title">${e.Name} checked ${t.futuresConsidered} possible futures (${t.branchesPruned} skipped by pruning)</div>` +
      t.options.slice(0, 3).map((o) =>
        `<div class="opt${o.chosen ? " chosen" : ""}"><span>${o.chosen ? "▶ " : ""}${o.dir}</span>` +
        `<span>expects you: ${o.predictedPlayerReply ?? "–"}${o.fromHabit ? ' <em class="habit">habit</em>' : ""}</span><span>${o.score}</span></div>`).join("")
    : `<div class="title">After your first move, the ${possessive(e.name)} options and scores show up here.</div>`;
}

const possessive = (word) => (word.endsWith("s") ? `${word}'` : `${word}'s`); // "ghost's", "wardens'"

let overlayAction = null;
function showOverlay(kind, title, text, button, action, hint = "") {
  $("overlay").dataset.kind = kind; // "lose", "win" or "brief", for styling
  $("overlay-title").textContent = title;
  $("overlay-text").textContent = text;
  $("overlay-hint").textContent = hint;
  $("overlay-hint").hidden = !hint;
  $("overlay-btn").textContent = button;
  overlayAction = action;
  $("overlay").classList.add("show");
  $("overlay-btn").focus();
}
function hideOverlay() {
  overlayAction = null;
  $("overlay").classList.remove("show");
}
$("overlay-btn").addEventListener("click", () => overlayAction?.());

// ---------- Actions ----------
function restart(message = "Restarted.") {
  game.restartLevel(); hideOverlay(); showLevel(message);
}
// Some levels open with a story scene (Level 3: Dr. Voss feeds the Wardens Sam's data). It plays between
// the "Escaped!" card and the next level, unless ?intro=0. Then the level's briefing comes up.
async function goToNextLevel() {
  const next = game.levels[game.levelIndex + 1];
  hideOverlay();
  const scene = next?.cutscene && params.get("intro") !== "0";
  if (scene) await playCutscene({ autoStart: true, scene: next.cutscene });
  game.nextLevel(); showLevel(startMessage());
  if (scene) showBriefing();
}

// Before a level: what's new and what to think about. The briefing is the level's lesson.
function showBriefing() {
  const l = game.level;
  showOverlay("brief", l.name, l.briefing ?? startMessage(), `Start Level ${l.id}`, hideOverlay, l.concept ? `New idea: ${l.concept}` : "");
}

// ---------- Home screen ----------
const startMessage = () => {
  const e = enemy();
  const goal = game.evidence.total ? `Grab ${game.evidence.total === 1 ? "the evidence drive" : `all ${game.evidence.total} evidence drives`}, then reach the exit.` : "Reach the green exit.";
  return `${goal} The ${e.name} move${e.plural ? "" : "s"} after you.`;
};

// The story before Level 1: the prologue (Clearpath's ad and the living room), then "After Hours".
// autoStart: the player just clicked, so both can start with sound straight away.
async function playStory(autoStart) {
  await playPrologue({ autoStart });
  await playCutscene({ autoStart: true });
}

// Opens the home screen, then starts whatever the player picked: the story (cutscene, then Level 1) or a level.
// skipPress opens it straight on the menu, for when the player opened it with a key or button.
async function openMenu(skipPress = true) {
  if (titleActive() || cutsceneActive() || prologueActive()) return;
  hideOverlay();
  const choice = await showTitleScreen({ levels: game.levels, skipPress });
  if (choice.mode === "story") {
    game.startLevel(0);
    showLevel(startMessage());
    if (params.get("intro") !== "0") await playStory(true);
  } else {
    game.startLevel(choice.index);
    showLevel(startMessage());
  }
  showBriefing();
}

async function takeTurn(dir) {
  if (busy || game.status !== "playing") return;
  const result = game.playerMove(dir);
  if (result.event === "blocked") return updateHud("That's a wall.");
  if (result.event === "locked") return updateHud(`The exit is locked: you still need ${game.evidence.total - game.evidence.held} evidence drive${game.evidence.total - game.evidence.held === 1 ? "" : "s"}.`);
  const glitching = game.glitchArmed; // this move gets no reply: the enemies lose their turn
  if (glitching) logger.recordMove("glitch");
  logger.recordMove(dir);
  placeAt(player, game.state.player, PLAYER_Y, !!result.vent); // a vent crawl pops you out of the other grate
  if (result.pickedUp) drawEvidence();
  if (result.event !== "moved") return finish();

  busy = true;
  const token = turnToken;
  updateHud(glitching ? "GLITCH!" : `${enemy().Name} ${enemy().plural ? "are" : "is"} thinking…`);
  // Think while the player's move animates; wait at least STEP_MS so the turns stay readable.
  const [decision] = await Promise.all([glitching ? null : thinkInBackground(), new Promise((r) => setTimeout(r, STEP_MS))]);
  if (token !== turnToken) return; // restarted while they were thinking

  const g = glitching
    ? game.ghostMove()
    : game.ghostMove(decision ?? chooseGhostMoves(game.ghostSearch.state, game.ghostSearch.lookahead, game.ghostSearch.options));
  if (g.event === "glitched") {
    playGlitchEffect();
    drawPlan(null);
    const their = enemy().plural ? "their" : "its";
    updateHud(`${picked(result)}GLITCH! The ${enemy().name} froze and lost ${their} turn. Your move.`);
    busy = false;
    return;
  }
  g.paths.forEach((path, i) => placeAlong(ghosts[i], path.length ? path : [g.to[i]], ghosts[i].userData.hover));
  drawPlan(g.thinking);
  updateTension();
  updateHud(g.event === "caught" ? "" : `${picked(result)}${enemy().Name} moved ${g.dir}.`);
  busy = false;
  if (g.event === "caught") finish();
}

// The music leans in when an enemy is close: 1 when one is next to you, 0 at 5+ tiles away.
function updateTension() {
  const { r, c } = game.state.player;
  const near = Math.min(...game.state.ghosts.map((g) => Math.abs(g.r - r) + Math.abs(g.c - c)));
  music.setTension((5 - near) / 4);
}

// What happened on your own move, for the HUD message.
const picked = (result) => (result.vent ? `You crawled through vent ${result.vent}. ` : "") +
  (result.pickedUp ? `Evidence drive picked up${game.evidence.exitOpen ? ": the exit is unlocked!" : "."} ` : "");

// ---------- The glitch (unlocks after GLITCH_AFTER catches on a level; see src/game.js) ----------
function toggleGlitch() {
  if (busy || overlayAction || game.status !== "playing") return;
  if (!game.glitchUnlocked) return;
  if (game.glitchUsed) return updateHud("You've used your glitch this attempt. You get a new one if they catch you.");
  const armed = game.toggleGlitch();
  updateHud(armed ? "Glitch armed: your next move gets no reply. Pick it carefully." : "Glitch disarmed.");
}

let glitchUntil = 0;
function playGlitchEffect() {
  glitchUntil = clock.getElapsedTime() + 0.9;
  document.body.classList.remove("glitching");
  void document.body.offsetWidth; // restart the CSS animation
  document.body.classList.add("glitching");
  setTimeout(() => document.body.classList.remove("glitching"), 900);
}

function updateGlitchButton() {
  const btn = $("glitch-btn");
  btn.hidden = !game.glitchUnlocked;
  btn.disabled = game.glitchUsed || game.status !== "playing";
  btn.classList.toggle("armed", game.glitchArmed);
  btn.setAttribute("aria-pressed", String(game.glitchArmed));
}

// Caught: say HOW they caught you, then one nudge to think about their prediction.
let catches = 0;
function finish() {
  const n = game.level.lookahead;
  const e = enemy();
  if (game.status === "caught") {
    music.caught();
    logger.endAttempt("death", { x: game.state.player.c, y: game.state.player.r });
    const hints = game.level.hints ?? [];
    const hint = hints.length ? hints[catches++ % hints.length] : "";
    const byDrone = game.state.ghosts.some((g, i) => isDrone(i) && g.r === game.state.player.r && g.c === game.state.player.c);
    const reactive = game.level.weights?.cutoff === 0; // Level 1's warden only chases, it doesn't predict
    let text = byDrone
      ? "The drone dashed straight at you. It never plans, but it's fast."
      : reactive
        ? `The ${e.name} caught you. It doesn't plan: it just steps toward wherever you are, every single turn.`
        : `The ${e.name} predicted your moves ${n} step${n > 1 ? "s" : ""} ahead.`;
    if (game.level.learns) text += ` They've now studied ${game.attemptsStudied} of your attempts.`;
    if (game.catches[game.levelIndex] === game.glitchAfter) {
      // The moment the glitch unlocks: explain it instead of the usual hint.
      text += ` That's ${game.glitchAfter} catches on this level, so you've unlocked a new ability.`;
      showOverlay("lose", "Caught! · Glitch unlocked", text, "Try again", () => restart("Glitch ready: press G or the ⚡ button, then move."),
        `GLITCH: once per attempt, press G (or the ⚡ button), then make a move. The ${e.name} ${e.plural ? "glitch and lose their" : "glitches and loses its"} turn, so you get one free move. ${e.plural ? "Their" : "Its"} whole plan assumes ${e.plural ? "they get" : "it gets"} to answer every move you make.`);
      return;
    }
    showOverlay("lose", "Caught!", text, "Try again", () => restart("Try again!"), hint);
  } else if (game.status === "levelComplete") {
    music.escaped();
    logger.endAttempt("win", { x: game.state.player.c, y: game.state.player.r });
    catches = 0;
    const next = game.levels[game.levelIndex + 1];
    if (next.cutscene && params.get("intro") !== "0") showOverlay("win", "Escaped!", `You made it out. Next: Level ${next.id} · ${next.name}. But someone was watching...`, "Continue", goToNextLevel);
    else showOverlay("win", "Escaped!", `Next: Level ${next.id} · ${next.name}. ${next.briefing ?? describeLevel(next).line}`, `Start Level ${next.id}`, goToNextLevel, next.concept ? `New idea: ${next.concept}` : "");
  } else if (game.status === "gameComplete") {
    music.escaped();
    showOverlay("win", "Evidence uploaded!", `You outthought every ${e.one} and the world can finally see what Clearpath was doing. Every Warden was only ever as good as its predictions, and you learned to read them.`, "Main menu", () => openMenu());
  }
}

// ---------- Input: keyboard and on-screen buttons ----------
const KEYS = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right" };

// Browsers only allow sound after a click or key press, so the music starts on the first one.
for (const type of ["keydown", "pointerdown"]) window.addEventListener(type, () => music.start(), { capture: true });

// The sound panel (volume, music, effects, mute) sits in the corner on every screen; N mutes in a level.
mountSoundWidget();
function toggleMusic() {
  const on = music.toggle();
  if (!overlayAction) updateHud(on ? "Sound on." : "Sound muted. Press N or use the speaker button to turn it back on.");
}

window.addEventListener("keydown", (e) => {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (key === "n" && !titleActive() && !cutsceneActive() && !prologueActive()) return toggleMusic();
  if (overlayAction) {
    if (key === "Enter" || key === " ") { e.preventDefault(); overlayAction(); }
    else if (key === "r" && game.status === "caught") restart("Try again!");
    return;
  }
  if (key === "r") return restart();
  if (key === "m") return openMenu();
  if (key === "g") return toggleGlitch();
  if (key in KEYS) { e.preventDefault(); takeTurn(KEYS[key]); }
});

for (const btn of document.querySelectorAll("#pad button[data-dir]")) {
  btn.addEventListener("click", () => takeTurn(btn.dataset.dir));
}
$("glitch-btn").addEventListener("click", toggleGlitch);

// ---------- Render loop ----------
const clock = new THREE.Clock();
const fpsLabel = params.has("fps") ? $("fps") : null;
if (fpsLabel) fpsLabel.hidden = false;
let frame = 0;

renderer.setAnimationLoop((now) => {
  const storyUp = cutsceneActive() || titleActive() || prologueActive();
  music.setActive(!storyUp); // the cutscenes and the home screen play their own music
  if (storyUp) return; // a full-screen scene is up; give the device's time to it instead of the maze
  quality.frame(now);
  const time = clock.getElapsedTime();

  let moved = false;
  const charged = (game.level.dronePattern ?? [2])[dronePhase(game.state)] > 0;
  for (const mesh of [player, ...ghosts]) {
    let to = mesh.userData.target;
    // Multi-tile moves (drone dashes): once close to this waypoint, head for the next one.
    if (mesh.userData.queue?.length && Math.abs(mesh.position.x - to.x) + Math.abs(mesh.position.z - to.z) < 0.12) {
      to = mesh.userData.target = mesh.userData.queue.shift();
    }
    const dx = to.x - mesh.position.x, dz = to.z - mesh.position.z;
    const away = Math.abs(dx) + Math.abs(dz);
    if (away > 0.002) moved = true;
    const k = mesh.userData.queue?.length ? 0.35 : 0.22;
    mesh.position.x += dx * k; mesh.position.z += dz * k;
    // Walk toward where it's going; keep facing that way once it gets there.
    const facing = away > 0.02 ? (Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? "right" : "left") : (dz > 0 ? "down" : "up")) : null;
    mesh.userData.animate({ time, facing, moving: away > 0.02, step: away * k, charged });
  }
  for (const d of drives) d.userData.spin(time);
  const glitchy = time < glitchUntil && !still;
  player.position.y = PLAYER_Y;
  playerGlow.position.x = player.position.x;
  playerGlow.position.z = player.position.z;
  ghosts.forEach((g, i) => {
    // Drones bob as they hover (lower and slower while recharging), out of step with each other.
    g.position.y = isDrone(i) ? g.userData.hover - (charged ? 0 : 0.1) + Math.sin(time * (charged ? 4 : 2) + i * 1.7) * 0.05 : g.userData.hover;
    // Glitching: they stutter sideways, flicker between colours and blink out for a frame here and there.
    g.visible = !glitchy || Math.random() > 0.25;
    if (glitchy) g.position.x += (Math.random() - 0.5) * 0.08;
    g.userData.setTint(glitchy ? (Math.random() < 0.5 ? "#ff6bf0" : "#6bf3ff") : null);
    ghostGlows[i].position.x = g.position.x;
    ghostGlows[i].position.z = g.position.z;
  });
  for (const blob of blobs) {
    blob.position.x = blob.userData.actor.position.x;
    blob.position.z = blob.userData.actor.position.z;
  }

  // Shadows are only redrawn when something moves. A swinging light redraws every frame,
  // or every other frame once the quality has had to drop.
  const lightMoved = look?.update(time, player.position);
  if (moved || (lightMoved && (!quality.low || frame % 2 === 0))) renderer.shadowMap.needsUpdate = true;
  frame++;

  renderer.render(scene, camera);
  if (fpsLabel && frame % 30 === 0) fpsLabel.textContent = `${quality.fps || "…"} fps · ${quality.ratio}× res`;
});

buildScene();
updateHud(startMessage());
music.setLevel(game.levelIndex);
logger.startAttempt(game.level.id);
if (params.has("level") || params.get("title") === "0") showBriefing();

// The home screen opens first. ?level= or ?title=0 go straight into the game (the story still plays
// before Level 1 unless ?intro=0).
if (params.get("scene")) {
  playCutscene({ scene: params.get("scene") }).then(showBriefing); // ?scene=core previews a story scene
} else if (params.has("level") || params.get("title") === "0") {
  if (game.levelIndex === 0 && params.get("intro") !== "0") playStory(false);
} else {
  openMenu(false);
}

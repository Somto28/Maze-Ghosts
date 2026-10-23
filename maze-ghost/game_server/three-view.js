// three-view.js — a 3D view of the game using Three.js.
// All rules and AI come from ../src; this file only draws and handles input.

import * as THREE from "three";
import { MazeGame, buildLayout3D, chooseGhostMoves, describeLevel, dronePhase, gridToWorld } from "../src/index.js";
import { canvasTexture, floorDecal } from "./art-kit.js";
import { buildBasement } from "./basement.js";
import { buildCore } from "./core.js";
import { buildServerHalls } from "./server-halls.js";
import { buildVault } from "./vault.js";
import { buildArchive } from "./archive.js";
import { buildUplink } from "./uplink.js";
import { createQuality } from "./quality.js";
import { cutsceneActive, playCutscene } from "./cutscene.js";
import { showTitleScreen, titleActive } from "./title-screen.js";
import { playPrologue, prologueActive } from "./prologue.js";
import { logger } from "./log.js";

const TILE = 1;
const STEP_MS = 220; // pause between your move and the ghosts', so the turns are visible
// theme.style -> custom art for that level
const LOOKS = { basement: buildBasement, "server-halls": buildServerHalls, core: buildCore, vault: buildVault, archive: buildArchive, uplink: buildUplink };
const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// ?level=2 starts on Level 2, ?fps shows the frame rate, ?res=1 pins the render resolution (testing),
// ?intro=0 skips the opening cutscene, ?title=0 skips the home screen.
const params = new URLSearchParams(location.search);

const game = new MazeGame();
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
let scene, layout, look, player, ghosts, ghostGlows, blobs, planDots;
let drives = [], exitPads = [], habitMarks = null; // evidence drives, exit pads (red while locked), learned-habit arrows
let builtLevel = -1;
let busy = false;
let turnToken = 0; // bumped on restart so a late answer from the worker is ignored

// What the HUD calls the enemies on this level ("ghost" unless the level says otherwise).
function enemy(level = game.level) {
  const one = level.enemy ?? "ghost";
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

// The plain ghost: a glowing sphere. A look can supply its own model with makeGhost(color).
function defaultGhost(color) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 24, 16),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, transparent: true, opacity: 0.9 }),
  );
}

// The drone: a small flying wedge with a spinning rotor ring. Brighter when its dash is charged.
function makeDrone(color) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.2, 0),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.4 }),
  );
  body.scale.set(1.25, 0.6, 1.25);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.3, 0.025, 6, 24).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color }),
  );
  group.add(body, ring);
  group.userData.spin = (t) => { ring.rotation.y = t * 9; body.rotation.y = t * 2; };
  group.userData.charge = (on) => { body.material.emissiveIntensity = on ? 1.4 : 0.25; ring.material.color.set(on ? color : 0x555555); };
  return group;
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

// Learned habits: a red arrow on each tile where the wardens expect you to repeat yourself.
const ARROW_TURN = { up: 0, down: Math.PI, left: Math.PI / 2, right: -Math.PI / 2 };
function makeHabitMarks(max) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.28); shape.lineTo(0.2, -0.05); shape.lineTo(0.07, -0.05); shape.lineTo(0.07, -0.26);
  shape.lineTo(-0.07, -0.26); shape.lineTo(-0.07, -0.05); shape.lineTo(-0.2, -0.05); shape.closePath();
  const marks = new THREE.InstancedMesh(
    new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xff3b5c, transparent: true, opacity: 0.75, depthWrite: false }),
    Math.max(1, max),
  );
  marks.count = 0;
  marks.frustumCulled = false;
  return marks;
}

function drawHabits() {
  if (!habitMarks) return;
  const habits = game.habits ?? {};
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  habitMarks.count = 0;
  for (const [tile, dir] of Object.entries(habits)) {
    if (habitMarks.count >= habitMarks.instanceMatrix.count) break;
    const [r, c] = tile.split(",").map(Number);
    const { x, z } = gridToWorld({ r, c }, TILE);
    // The arrow points "up" the screen (toward -z) by default; turn it to the habit's direction.
    q.setFromAxisAngle(up, ARROW_TURN[dir] ?? 0);
    habitMarks.setMatrixAt(habitMarks.count++, m.compose(new THREE.Vector3(x, 0.03, z), q, one));
  }
  habitMarks.instanceMatrix.needsUpdate = true;
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
  // A look can paint its own backdrop (the vault hall, the archive stacks, the night skyline).
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

  player = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.22, 0.3, 6, 16),
    new THREE.MeshStandardMaterial({ color: 0x5ab0ff, emissive: 0x1d4ed8, emissiveIntensity: 0.4 }),
  );
  player.castShadow = true;
  ghosts = layout.ghostStarts.map((start) => {
    const g = start.role === "drone"
      ? makeDrone(t.droneColor ?? "#ffb020")
      : look?.makeGhost?.(t.ghostColor) ?? defaultGhost(t.ghostColor);
    g.traverse((o) => { o.castShadow = true; });
    g.userData.hover = start.role === "drone" ? 0.85 : 0.45;
    return g;
  });
  ghostGlows = ghosts.map((_, i) => floorDecal(THREE, { color: layout.ghostStarts[i].role === "drone" ? t.droneColor ?? "#ffb020" : t.ghostColor, size: 3, opacity: 0.5, y: 0.015 }));
  blobs = renderer.shadowMap.enabled ? [] : [player, ...ghosts].map((actor) => {
    const blob = floorDecal(THREE, { color: 0x000000, size: 0.9, opacity: 0.6, additive: false, y: 0.02 });
    blob.userData.actor = actor;
    return blob;
  });
  planDots = { ghost: makeDots(0xff5a6e, ghosts.length), player: makeDots(0xffd166, 1) };
  scene.add(player, ...ghosts, ...ghostGlows, ...blobs, planDots.ghost, planDots.player);
  habitMarks = game.level.learns ? makeHabitMarks(layout.floorTiles.length) : null;
  if (habitMarks) scene.add(habitMarks);

  resetActors();
  resize();
  renderer.compile(scene, camera); // compile every shader now, not mid-move
  quality.reset();
}

function resetActors() {
  turnToken++;
  busy = false;
  placeAt(player, game.state.player, 0.37, true);
  game.state.ghosts.forEach((g, i) => placeAt(ghosts[i], g, ghosts[i].userData.hover, true));
  drawPlan(null);
  drawEvidence();
  drawHabits();
  renderer.shadowMap.needsUpdate = true;
}

// Builds the scene only when the level changes; restarting the same level just resets the actors.
function showLevel(message) {
  logger.startAttempt(game.level.id); // every start, restart and next level is a new attempt
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
  const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshBasicMaterial(), count);
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
function goToNextLevel() {
  game.nextLevel(); hideOverlay(); showLevel(startMessage());
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
  logger.recordMove(dir);
  placeAt(player, game.state.player, 0.37, !!result.vent); // a vent crawl pops you out of the other grate
  if (result.pickedUp) drawEvidence();
  if (result.event !== "moved") return finish();

  busy = true;
  const token = turnToken;
  updateHud(`${enemy().Name} ${enemy().plural ? "are" : "is"} thinking…`);
  // Think while the player's move animates; wait at least STEP_MS so the turns stay readable.
  const [decision] = await Promise.all([thinkInBackground(), new Promise((r) => setTimeout(r, STEP_MS))]);
  if (token !== turnToken) return; // restarted while they were thinking

  const g = game.ghostMove(decision ?? chooseGhostMoves(game.ghostSearch.state, game.ghostSearch.lookahead, game.ghostSearch.options));
  g.paths.forEach((path, i) => placeAlong(ghosts[i], path.length ? path : [g.to[i]], ghosts[i].userData.hover));
  drawPlan(g.thinking);
  const picked = (result.vent ? `You crawled through vent ${result.vent}. ` : "") +
    (result.pickedUp ? `Evidence drive picked up${game.evidence.exitOpen ? ": the exit is unlocked!" : "."} ` : "");
  updateHud(g.event === "caught" ? "" : `${picked}${enemy().Name} moved ${g.dir}.`);
  busy = false;
  if (g.event === "caught") finish();
}

// Caught: say HOW they caught you, then one nudge to think about their prediction.
let catches = 0;
function finish() {
  const n = game.level.lookahead;
  const e = enemy();
  if (game.status === "caught") {
    logger.endAttempt("death", { x: game.state.player.c, y: game.state.player.r });
    const hints = game.level.hints ?? [];
    const hint = hints.length ? hints[catches++ % hints.length] : "";
    const byDrone = game.state.ghosts.some((g, i) => isDrone(i) && g.r === game.state.player.r && g.c === game.state.player.c);
    const reactive = game.level.weights?.cutoff === 0; // Level 1's ghost only chases, it doesn't predict
    let text = byDrone
      ? "The drone dashed straight at you. It never plans, but it's fast."
      : reactive
        ? `The ${e.name} caught you. It doesn't plan: it just steps toward wherever you are, every single turn.`
        : `The ${e.name} predicted your moves ${n} step${n > 1 ? "s" : ""} ahead.`;
    if (game.level.learns) text += ` They've now studied ${game.attemptsStudied} of your attempts.`;
    showOverlay("lose", "Caught!", text, "Try again", () => restart("Try again!"), hint);
  } else if (game.status === "levelComplete") {
    logger.endAttempt("win", { x: game.state.player.c, y: game.state.player.r });
    catches = 0;
    const next = game.levels[game.levelIndex + 1];
    showOverlay("win", "Escaped!", `Next: Level ${next.id} · ${next.name}. ${next.briefing ?? describeLevel(next).line}`, `Start Level ${next.id}`, goToNextLevel, next.concept ? `New idea: ${next.concept}` : "");
  } else if (game.status === "gameComplete") {
    showOverlay("win", "Evidence uploaded!", `You outthought every ${e.one} and the world can finally see what Clearpath was doing. Every Warden was only ever as good as its predictions, and you learned to read them.`, "Main menu", () => openMenu());
  }
}

// ---------- Input: keyboard and on-screen buttons ----------
const KEYS = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right" };

window.addEventListener("keydown", (e) => {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (overlayAction) {
    if (key === "Enter" || key === " ") { e.preventDefault(); overlayAction(); }
    else if (key === "r" && game.status === "caught") restart("Try again!");
    return;
  }
  if (key === "r") return restart();
  if (key === "m") return openMenu();
  if (key in KEYS) { e.preventDefault(); takeTurn(KEYS[key]); }
});

for (const btn of document.querySelectorAll("#pad button")) {
  btn.addEventListener("click", () => takeTurn(btn.dataset.dir));
}

// ---------- Render loop ----------
const clock = new THREE.Clock();
const fpsLabel = params.has("fps") ? $("fps") : null;
if (fpsLabel) fpsLabel.hidden = false;
let frame = 0;

renderer.setAnimationLoop((now) => {
  if (cutsceneActive() || titleActive() || prologueActive()) return; // a full-screen scene is up; give the device's time to it instead of the maze
  quality.frame(now);
  const time = clock.getElapsedTime();

  let moved = false;
  for (const mesh of [player, ...ghosts]) {
    let to = mesh.userData.target;
    // Multi-tile moves (drone dashes): once close to this waypoint, head for the next one.
    if (mesh.userData.queue?.length && Math.abs(mesh.position.x - to.x) + Math.abs(mesh.position.z - to.z) < 0.12) {
      to = mesh.userData.target = mesh.userData.queue.shift();
    }
    if (Math.abs(mesh.position.x - to.x) + Math.abs(mesh.position.z - to.z) > 0.002) moved = true;
    mesh.position.lerp(to, mesh.userData.queue?.length ? 0.35 : 0.22);
  }
  for (const d of drives) d.userData.spin(time);
  const charged = (game.level.dronePattern ?? [2])[dronePhase(game.state)] > 0;
  ghosts.forEach((g, i) => {
    g.position.y = g.userData.hover + Math.sin(time * 3 + i * 1.7) * 0.05; // gentle hover, out of step with each other
    g.userData.charge?.(charged);
    g.userData.spin?.(time + i);
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
logger.startAttempt(game.level.id);
if (params.has("level") || params.get("title") === "0") showBriefing();

// The home screen opens first. ?level= or ?title=0 go straight into the game (the story still plays
// before Level 1 unless ?intro=0).
if (params.has("level") || params.get("title") === "0") {
  if (game.levelIndex === 0 && params.get("intro") !== "0") playStory(false);
} else {
  openMenu(false);
}

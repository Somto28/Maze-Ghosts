// three-view.js — a 3D view of the game using Three.js.
// All rules and AI come from ../src; this file only draws and handles input.

import * as THREE from "three";
import { MazeGame, buildLayout3D, chooseGhostMoves, gridToWorld } from "../src/index.js";
import { floorDecal } from "./art-kit.js";
import { buildBasement } from "./basement.js";
import { buildCore } from "./core.js";
import { buildServerHalls } from "./server-halls.js";
import { createQuality } from "./quality.js";

const TILE = 1;
const STEP_MS = 220; // pause between your move and the ghosts', so the turns are visible
const LOOKS = { basement: buildBasement, "server-halls": buildServerHalls, core: buildCore }; // theme.style -> custom art
const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// ?level=2 starts on Level 2, ?fps shows the frame rate, ?res=1 pins the render resolution (testing).
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
let builtLevel = -1;
let busy = false;
let turnToken = 0; // bumped on restart so a late answer from the worker is ignored

// What the HUD calls the enemies on this level ("ghost" unless the level says otherwise).
function enemy(level = game.level, count = game.state.ghosts.length) {
  const one = level.enemy ?? "ghost";
  return { one, many: `${one}s`, name: count > 1 ? `${one}s` : one, Name: (count > 1 ? `${one}s` : one).replace(/^./, (ch) => ch.toUpperCase()) };
}

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
    worker.postMessage({ type: "think", id, state, lookahead, options: { pruning: options.pruning, weights: options.weights } });
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
  // Looks without real shadows paint their shade into textures; actors then get soft blob shadows.
  renderer.shadowMap.enabled = look?.shadows ?? true;

  scene = new THREE.Scene();
  const bg = new THREE.Color(t.floorColor).multiplyScalar(0.6);
  scene.background = bg;
  scene.fog = new THREE.FogExp2(bg, t.fog);
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
  for (const e of layout.exits) {
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(TILE * 0.9, 0.04, TILE * 0.9),
      new THREE.MeshBasicMaterial({ color: 0x2bd36a }),
    );
    pad.position.set(e.position.x, 0.02, e.position.z);
    const glow = floorDecal(THREE, { color: 0x4ade80, size: 2.6, opacity: 0.55 });
    glow.position.set(e.position.x, 0.05, e.position.z);
    scene.add(pad, glow);
  }

  player = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.22, 0.3, 6, 16),
    new THREE.MeshStandardMaterial({ color: 0x5ab0ff, emissive: 0x1d4ed8, emissiveIntensity: 0.4 }),
  );
  player.castShadow = true;
  ghosts = layout.ghostStarts.map(() => {
    const g = look?.makeGhost?.(t.ghostColor) ?? defaultGhost(t.ghostColor);
    g.traverse((o) => { o.castShadow = true; });
    return g;
  });
  ghostGlows = ghosts.map(() => floorDecal(THREE, { color: t.ghostColor, size: 3, opacity: 0.5, y: 0.015 }));
  blobs = renderer.shadowMap.enabled ? [] : [player, ...ghosts].map((actor) => {
    const blob = floorDecal(THREE, { color: 0x000000, size: 0.9, opacity: 0.6, additive: false, y: 0.02 });
    blob.userData.actor = actor;
    return blob;
  });
  planDots = { ghost: makeDots(0xff5a6e, ghosts.length), player: makeDots(0xffd166, 1) };
  scene.add(player, ...ghosts, ...ghostGlows, ...blobs, planDots.ghost, planDots.player);

  resetActors();
  resize();
  renderer.compile(scene, camera); // compile every shader now, not mid-move
  quality.reset();
}

function resetActors() {
  turnToken++;
  busy = false;
  placeAt(player, game.state.player, 0.37, true);
  game.state.ghosts.forEach((g, i) => placeAt(ghosts[i], g, 0.45, true));
  drawPlan(null);
  renderer.shadowMap.needsUpdate = true;
}

// Builds the scene only when the level changes; restarting the same level just resets the actors.
function showLevel(message) {
  if (game.levelIndex === builtLevel) resetActors();
  else buildScene();
  updateHud(message);
}

// Actors glide toward their target tile each frame instead of jumping.
function placeAt(mesh, pos, y, instant = false) {
  const { x, z } = gridToWorld(pos, TILE);
  mesh.userData.target = new THREE.Vector3(x, y, z);
  if (instant) mesh.position.copy(mesh.userData.target);
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
  const { id, name, lookahead } = game.level;
  const n = game.state.ghosts.length;
  const e = enemy();
  const moves = `${lookahead} move${lookahead === 1 ? "" : "s"}`;
  $("level-name").textContent = `Level ${id} · ${name}`;
  $("depth").innerHTML = n > 1
    ? `<b>${n}</b> ${e.many} plan together, <b>${moves}</b> ahead`
    : `${e.Name} looks <b>${moves}</b> ahead`;
  $("legend-enemy").textContent = `${possessive(e.Name)} plan`;
  if (message !== undefined) $("message").textContent = message;

  const t = game.lastThinking;
  $("thinking").innerHTML = t
    ? `<div class="title">${e.Name} checked ${t.futuresConsidered} possible futures (${t.branchesPruned} skipped by pruning)</div>` +
      t.options.slice(0, 3).map((o) =>
        `<div class="opt${o.chosen ? " chosen" : ""}"><span>${o.chosen ? "▶ " : ""}${o.dir}</span>` +
        `<span>expects you: ${o.predictedPlayerReply ?? "–"}</span><span>${o.score}</span></div>`).join("")
    : `<div class="title">After your first move, the ${possessive(e.name)} options and scores show up here.</div>`;
}

const possessive = (word) => (word.endsWith("s") ? `${word}'` : `${word}'s`); // "ghost's", "wardens'"

let overlayAction = null;
function showOverlay(kind, title, text, button, action) {
  $("overlay").dataset.kind = kind; // "lose" or "win", for styling
  $("overlay-title").textContent = title;
  $("overlay-text").textContent = text;
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
  game.nextLevel(); hideOverlay(); showLevel(game.state.ghosts.length > 1 ? `Careful: there are ${game.state.ghosts.length} ${enemy().many} now.` : "The ghost is thinking further ahead now…");
}
function playAgain() {
  game.startLevel(0); hideOverlay(); showLevel("Back to Level 1.");
}

async function takeTurn(dir) {
  if (busy || game.status !== "playing") return;
  const result = game.playerMove(dir);
  if (result.event === "blocked") return updateHud("That's a wall.");
  placeAt(player, game.state.player, 0.37);
  if (result.event !== "moved") return finish();

  busy = true;
  const token = turnToken;
  updateHud(`${enemy().Name} ${game.state.ghosts.length > 1 ? "are" : "is"} thinking…`);
  // Think while the player's move animates; wait at least STEP_MS so the turns stay readable.
  const [decision] = await Promise.all([thinkInBackground(), new Promise((r) => setTimeout(r, STEP_MS))]);
  if (token !== turnToken) return; // restarted while they were thinking

  const g = game.ghostMove(decision ?? chooseGhostMoves(game.ghostSearch.state, game.ghostSearch.lookahead, game.ghostSearch.options));
  g.to.forEach((pos, i) => placeAt(ghosts[i], pos, 0.45));
  drawPlan(g.thinking);
  updateHud(g.event === "caught" ? "" : `${enemy().Name} moved ${g.dir}.`);
  busy = false;
  if (g.event === "caught") finish();
}

function finish() {
  const n = game.level.lookahead;
  const e = enemy();
  if (game.status === "caught") {
    showOverlay("lose", "Caught!", `The ${e.name} predicted your moves ${n} step${n > 1 ? "s" : ""} ahead.`, "Try again", () => restart("Try again!"));
  } else if (game.status === "levelComplete") {
    const next = game.levels[game.levelIndex + 1];
    const count = (next.maze.join("").match(/G/g) ?? []).length;
    const ne = enemy(next, count);
    const text = count > 1
      ? `On Level ${next.id}, ${count} ${ne.many} plan together, ${next.lookahead} moves ahead.`
      : `On Level ${next.id} the ${ne.one} looks ${next.lookahead} moves ahead.`;
    showOverlay("win", "Escaped!", text, `Start Level ${next.id}`, goToNextLevel);
  } else if (game.status === "gameComplete") {
    showOverlay("win", `You beat the ${e.many}!`, "You escaped every level.", "Play again", playAgain);
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
  quality.frame(now);
  const time = clock.getElapsedTime();

  let moved = false;
  for (const mesh of [player, ...ghosts]) {
    const to = mesh.userData.target;
    if (Math.abs(mesh.position.x - to.x) + Math.abs(mesh.position.z - to.z) > 0.002) moved = true;
    mesh.position.lerp(to, 0.22);
  }
  ghosts.forEach((g, i) => {
    g.position.y = 0.45 + Math.sin(time * 3 + i * 1.7) * 0.05; // gentle hover, out of step with each other
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
updateHud(`Reach the green exit. The ${enemy().name} move${game.state.ghosts.length > 1 ? "" : "s"} after you.`);

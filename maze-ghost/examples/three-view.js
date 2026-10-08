// three-view.js — a 3D view of the game using Three.js.
// All rules and AI come from ../src; this file only draws and handles input.

import * as THREE from "three";
import { MazeGame, buildLayout3D, gridToWorld } from "../src/index.js";

const TILE = 1;
const STEP_MS = 220; // pause between your move and the ghost's, so the turns are visible

const game = new MazeGame();
const $ = (id) => document.getElementById(id);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$("view").appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
let scene, layout, player, ghost, ghostLight, planDots;
let busy = false;

// ---------- Scene from the level's 3D layout ----------
function buildScene() {
  layout = buildLayout3D(game.level, { tileSize: TILE });
  const t = layout.theme;
  const c = layout.floor.position;
  const span = Math.max(layout.floor.size.x, layout.floor.size.z);

  scene = new THREE.Scene();
  const bg = new THREE.Color(t.floorColor).multiplyScalar(0.6);
  scene.background = bg;
  scene.fog = new THREE.FogExp2(bg, t.fog);

  scene.add(new THREE.HemisphereLight(0xc8dcff, 0x1a2030, 1.4 * t.light));
  const sun = new THREE.DirectionalLight(0xffffff, 2.0 * t.light);
  sun.position.set(c.x - span * 0.4, span * 1.2, c.z - span * 0.3);
  sun.target.position.set(c.x, 0, c.z);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 0.5, far: span * 4 });
  scene.add(sun, sun.target);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(layout.floor.size.x, layout.floor.size.z),
    new THREE.MeshStandardMaterial({ color: t.floorColor, roughness: 0.95 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(c.x, 0, c.z);
  floor.receiveShadow = true;
  scene.add(floor);

  // One InstancedMesh draws every wall in a single call (fast on school Chromebooks).
  const walls = new THREE.InstancedMesh(
    new THREE.BoxGeometry(TILE, t.wallHeight, TILE),
    new THREE.MeshStandardMaterial({ color: t.wallColor, roughness: 0.7 }),
    layout.walls.length,
  );
  const m = new THREE.Matrix4();
  layout.walls.forEach((w, i) => walls.setMatrixAt(i, m.makeTranslation(w.position.x, w.position.y, w.position.z)));
  walls.castShadow = walls.receiveShadow = true;
  scene.add(walls);

  for (const e of layout.exits) {
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(TILE * 0.9, 0.04, TILE * 0.9),
      new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 0.9 }),
    );
    pad.position.set(e.position.x, 0.02, e.position.z);
    const glow = new THREE.PointLight(0x4ade80, 2, 3);
    glow.position.set(e.position.x, 0.6, e.position.z);
    scene.add(pad, glow);
  }

  player = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.22, 0.3, 6, 16),
    new THREE.MeshStandardMaterial({ color: 0x5ab0ff, emissive: 0x1d4ed8, emissiveIntensity: 0.4 }),
  );
  player.castShadow = true;
  ghost = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 24, 16),
    new THREE.MeshStandardMaterial({ color: t.ghostColor, emissive: t.ghostColor, emissiveIntensity: 0.6, transparent: true, opacity: 0.9 }),
  );
  ghost.castShadow = true;
  ghostLight = new THREE.PointLight(t.ghostColor, 2.5, 3.5);
  planDots = new THREE.Group();
  scene.add(player, ghost, ghostLight, planDots);

  placeAt(player, game.state.player, 0.37, true);
  placeAt(ghost, game.state.ghost, 0.45, true);
  resize();
  updateHud();
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

// ---------- The ghost's predicted future, drawn on the floor ----------
function drawPlan(thinking) {
  planDots.clear();
  const chosen = thinking?.options.find((o) => o.chosen);
  if (!chosen) return;
  // plan[0] is the move it just made; the rest is what it expects to happen next.
  chosen.plan.slice(1).forEach((step, i) => {
    const color = step.who === "ghost" ? 0xff5a6e : 0xffd166;
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(0.05, 0.1 - i * 0.006), 12, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: Math.max(0.3, 0.95 - i * 0.07) }),
    );
    const { x, z } = gridToWorld(step.at, TILE);
    dot.position.set(x + (step.who === "ghost" ? 0.14 : -0.14), 0.12, z);
    planDots.add(dot);
  });
}

// ---------- HUD ----------
function updateHud(message) {
  const { id, name, lookahead } = game.level;
  $("level-name").textContent = `Level ${id} · ${name}`;
  $("lookahead").textContent = lookahead;
  $("moves-word").textContent = lookahead === 1 ? "move" : "moves";
  if (message !== undefined) $("message").textContent = message;

  const t = game.lastThinking;
  $("thinking").innerHTML = t
    ? `<div class="title">Ghost checked ${t.futuresConsidered} possible futures (${t.branchesPruned} skipped by pruning)</div>` +
      t.options.slice(0, 3).map((o) =>
        `<div class="opt${o.chosen ? " chosen" : ""}"><span>${o.chosen ? "▶ " : ""}${o.dir}</span>` +
        `<span>expects you: ${o.predictedPlayerReply ?? "–"}</span><span>${o.score}</span></div>`).join("")
    : `<div class="title">After your first move, the ghost's options and scores show up here.</div>`;
}

let overlayAction = null;
function showOverlay(title, text, button, action) {
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
  game.restartLevel(); hideOverlay(); planDots.clear(); buildScene(); updateHud(message);
}
function goToNextLevel() {
  game.nextLevel(); hideOverlay(); buildScene(); updateHud("The ghost is thinking further ahead now…");
}
function playAgain() {
  game.startLevel(0); hideOverlay(); buildScene(); updateHud("Back to Level 1.");
}

function takeTurn(dir) {
  if (busy || game.status !== "playing") return;
  const result = game.playerMove(dir);
  if (result.event === "blocked") return updateHud("That's a wall.");
  placeAt(player, game.state.player, 0.37);
  if (result.event !== "moved") return finish();

  busy = true;
  updateHud("Ghost is thinking…");
  setTimeout(() => {
    const g = game.ghostMove();
    placeAt(ghost, game.state.ghost, 0.45);
    drawPlan(g.thinking);
    updateHud(g.event === "caught" ? "" : `Ghost moved ${g.dir}.`);
    busy = false;
    if (g.event === "caught") finish();
  }, STEP_MS);
}

function finish() {
  const n = game.level.lookahead;
  if (game.status === "caught") {
    showOverlay("Caught!", `The ghost predicted your moves ${n} step${n > 1 ? "s" : ""} ahead.`, "Try again", () => restart("Try again!"));
  } else if (game.status === "levelComplete") {
    const next = game.levels[game.levelIndex + 1];
    showOverlay("Escaped!", `On Level ${next.id} the ghost looks ${next.lookahead} moves ahead.`, `Start Level ${next.id}`, goToNextLevel);
  } else if (game.status === "gameComplete") {
    showOverlay("You beat the ghost!", "You escaped every level.", "Play again", playAgain);
  }
}

// ---------- Input: keyboard and on-screen buttons ----------
const KEYS = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right", " ": "wait" };

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
renderer.setAnimationLoop(() => {
  const time = clock.getElapsedTime();
  for (const mesh of [player, ghost]) mesh.position.lerp(mesh.userData.target, 0.22);
  ghost.position.y = 0.45 + Math.sin(time * 3) * 0.05; // gentle hover
  ghostLight.position.copy(ghost.position);
  renderer.render(scene, camera);
});

buildScene();

// core.js — Level 3's look: the Core's Warden proving ground (Test Floor 3), where Clearpath builds,
// trains and field-tests its Wardens. Grey lab partitions with hazard-striped skirts and status LEDs,
// and on top of them the work of the floor: benches with half-built Warden heads, dormant prototypes
// charging in their cradles, training-cluster racks, shipping crates, prediction consoles and sensor
// masts. A graphite epoxy floor with painted test-lane lines, a calibration grid, coordinates and
// charging bays where the Wardens start. Amber beacons turn and a scanner beam sweeps the floor.
// three-view.js picks this up when a level's theme has `style: "core"`.
//
// Built to stay fast like the other looks: lighting is painted into the floor once (no shadow maps),
// the partitions are two merged meshes, and the animation is a few material tweaks per frame.

import { backdrop, canvasTexture, exitSigns, floorDecal, paintWallShadows, seededRandom, wallGeometry } from "./art-kit.js";

const PX = 96; // floor texture pixels per tile
const S = 256; // atlas cell size
const SIDE_CELLS = 4; // lab panel, access hatch, rack front, end sign
const TOPS = ["bench", "cradle", "rack", "crate", "console", "mast", "barrier"];
const YELLOW = "#f2c230", INK = "#16181c";

/**
 * @returns {{ group, walls, floorMaterial, shadows: false, background, fogColor, update(time: number): boolean, dispose(): void }}
 */
export function buildCore(THREE, layout, { still = false } = {}) {
  const rnd = seededRandom(3);
  const t = layout.theme;
  const c = layout.floor.position;
  const group = new THREE.Group();
  const disposables = [];

  // ---------- Light: cool high-bay work lights ----------
  group.add(new THREE.HemisphereLight(0xeef4ff, 0x15171c, 1.55 * t.light));
  const key = new THREE.DirectionalLight(0xfff6e8, 1.25 * t.light);
  key.position.set(c.x - 5, 12, c.z + 7);
  key.target.position.set(c.x, 0, c.z);
  group.add(key, key.target);

  // ---------- Partitions: lab panels on the sides, the floor's equipment on top ----------
  const faceH = Math.round((S * t.wallHeight) / layout.tileSize);
  const sideMap = canvasTexture(THREE, S * SIDE_CELLS, (g, w, h) => paintSides(g, h), { height: faceH, wrap: false });
  const sideGlow = canvasTexture(THREE, S * SIDE_CELLS, (g, w, h) => paintSideGlow(g, h), { height: faceH, wrap: false });
  const sideMaterial = new THREE.MeshLambertMaterial({ map: sideMap, emissive: 0xffffff, emissiveMap: sideGlow });
  const topMap = canvasTexture(THREE, S * TOPS.length, (g, w, h) => paintTops(g, h), { height: S, wrap: false });
  const topGlow = canvasTexture(THREE, S * TOPS.length, (g, w, h) => paintTopGlow(g, h), { height: S, wrap: false });
  const topMaterial = new THREE.MeshLambertMaterial({ map: topMap, emissive: 0xffffff, emissiveMap: topGlow });

  const edge = (r, col) => r === 0 || col === 0 || r === layout.rows - 1 || col === layout.cols - 1;
  const inner = [0, 1, 2, 3, 4, 5]; // bench, cradle, rack, crate, console, mast
  const weights = [3, 2, 2, 2, 2, 1];
  const pickInner = () => {
    let k = rnd() * weights.reduce((a, b) => a + b, 0);
    for (const i of inner) { k -= weights[i]; if (k < 0) return i; }
    return 0;
  };
  const geo = wallGeometry(THREE, layout, {
    sideCells: SIDE_CELLS, topCells: TOPS.length,
    pickSide: (r, col, f) => (f.end ? 3 : edge(r, col) ? (rnd() < 0.8 ? 0 : 1) : [0, 0, 1, 2][Math.floor(rnd() * 4)]),
    pickTop: (r, col) => (edge(r, col) ? 6 : pickInner()),
  });
  const walls = new THREE.Group();
  walls.add(new THREE.Mesh(geo.sides, sideMaterial), new THREE.Mesh(geo.tops, topMaterial));

  // ---------- Floor ----------
  const floorMap = canvasTexture(THREE, layout.cols * PX, (g) => paintFloor(g, layout, rnd), { height: layout.rows * PX, wrap: false });
  const floorMaterial = new THREE.MeshBasicMaterial({ map: floorMap });

  for (const sign of exitSigns(THREE, layout, t.wallHeight + 0.45)) group.add(sign);

  // ---------- Amber beacons on the corners of the floor (they turn, so they flash) ----------
  const H = t.wallHeight;
  const corners = layout.walls.filter((w) => edge(w.r, w.c) && (w.r === 0 || w.r === layout.rows - 1) && (w.c === 0 || w.c === layout.cols - 1));
  const mids = layout.walls.filter((w) => edge(w.r, w.c) && ((w.r === 0 || w.r === layout.rows - 1) ? w.c === Math.floor(layout.cols / 2) : w.r === Math.floor(layout.rows / 2)));
  const beaconBase = new THREE.MeshLambertMaterial({ color: 0x2b2f36 });
  const beacons = [...corners, ...mids].map((w, i) => {
    const b = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.08, 14), beaconBase);
    const domeMaterial = new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.95 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), domeMaterial);
    dome.position.y = 0.04;
    const halo = floorDecal(THREE, { color: 0xffa31a, size: 1.5, opacity: 0.5, y: 0.01 });
    b.add(base, dome, halo);
    b.position.set(w.position.x, H + 0.04, w.position.z);
    b.userData = { dome: domeMaterial, halo: halo.material, phase: i * 0.37 };
    group.add(b);
    return b;
  });

  // ---------- The scanner beam: a thin pale-blue line sweeping the floor, front to back ----------
  const span = layout.floor.size;
  const beamTex = canvasTexture(THREE, 8, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "rgba(160,220,255,0)");
    grad.addColorStop(0.47, "rgba(160,220,255,0.35)");
    grad.addColorStop(0.5, "rgba(235,250,255,1)");
    grad.addColorStop(0.53, "rgba(160,220,255,0.35)");
    grad.addColorStop(1, "rgba(160,220,255,0)");
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  }, { height: 64, wrap: false });
  const beam = new THREE.Mesh(
    new THREE.PlaneGeometry(span.x, 0.9).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  beam.position.set(c.x, 0.045, c.z);
  group.add(beam);

  // Pools of cold light under the high bays.
  for (let i = 0; i < 5; i++) {
    const f = layout.floorTiles[Math.floor(rnd() * layout.floorTiles.length)];
    const pool = floorDecal(THREE, { color: 0xcfe6ff, size: 3 + rnd() * 1.5, opacity: 0.12, y: 0.03 });
    pool.position.set(f.position.x, 0.03, f.position.z);
    group.add(pool);
  }

  // ---------- Background: the hangar the floor sits in ----------
  const background = backdrop(THREE, paintBackdrop);
  disposables.push(background);

  function update(time) {
    if (still) return false;
    for (const b of beacons) { // a turning lamp: a short bright flash once a turn
      const k = Math.pow(Math.max(0, Math.sin((time * 1.6 + b.userData.phase) * Math.PI)), 6);
      b.userData.dome.opacity = 0.55 + k * 0.45;
      b.userData.halo.opacity = 0.12 + k * 0.6;
    }
    const sweep = (time % 9) / 9; // back and forth across the floor every 9 s
    beam.position.z = c.z + (Math.abs(sweep * 2 - 1) - 0.5) * span.z;
    topMaterial.emissiveIntensity = 0.95 + Math.sin(time * 2.1) * 0.08 + (Math.sin(time * 23) > 0.96 ? 0.15 : 0);
    sideMaterial.emissiveIntensity = 0.8 + Math.sin(time * 3.3) * 0.2;
    return false;
  }
  update(0);

  return {
    group, walls, floorMaterial, shadows: false, background, fogColor: "#0d0f13", update,
    dispose() { for (const d of disposables) d.dispose(); },
  };
}

// ---------- Painting helpers ----------

function hazard(g, x, y, w, h, { size = 14, a = YELLOW, b = INK } = {}) {
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = b; g.fillRect(x, y, w, h);
  g.fillStyle = a;
  for (let k = -h; k < w + h; k += size * 2) {
    g.beginPath(); g.moveTo(x + k, y + h); g.lineTo(x + k + size, y + h); g.lineTo(x + k + size + h, y); g.lineTo(x + k + h, y); g.closePath(); g.fill();
  }
  g.restore();
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function bolts(g, x, y, w, h, inset = 10) {
  g.fillStyle = "rgba(0,0,0,0.35)";
  for (const [bx, by] of [[x + inset, y + inset], [x + w - inset, y + inset], [x + inset, y + h - inset], [x + w - inset, y + h - inset]]) {
    g.beginPath(); g.arc(bx, by, 4, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = "rgba(255,255,255,0.35)";
  for (const [bx, by] of [[x + inset, y + inset], [x + w - inset, y + inset], [x + inset, y + h - inset], [x + w - inset, y + h - inset]]) {
    g.beginPath(); g.arc(bx - 1, by - 1, 2, 0, Math.PI * 2); g.fill();
  }
}

// A Warden pictogram (head with visor, antenna), for signs and stencils.
function wardenIcon(g, cx, cy, s, color, eye = color) {
  g.fillStyle = color;
  g.fillRect(cx - s * 0.5, cy - s * 0.35, s, s * 0.7);
  g.fillRect(cx + s * 0.22, cy - s * 0.62, s * 0.08, s * 0.27);
  g.fillStyle = "rgba(0,0,0,0.85)";
  g.fillRect(cx - s * 0.36, cy - s * 0.18, s * 0.72, s * 0.28);
  g.fillStyle = eye;
  g.fillRect(cx - s * 0.12, cy - s * 0.1, s * 0.24, s * 0.12);
}

// ---------- Partition sides (256 × faceH per cell) ----------

function paintSides(g, h) {
  for (let i = 0; i < SIDE_CELLS; i++) {
    const x0 = i * S;
    g.save();
    g.beginPath(); g.rect(x0, 0, S, h); g.clip();
    const cap = Math.round(h * 0.07), skirt = Math.round(h * 0.17), led = Math.round(h * 0.05);
    if (i === 2) { // training-cluster rack front
      g.fillStyle = "#1b1e24"; g.fillRect(x0, 0, S, h);
      const units = 7, uh = (h - cap - skirt - 16) / units;
      for (let u = 0; u < units; u++) {
        const y = cap + 8 + u * uh;
        g.fillStyle = u % 2 ? "#262a31" : "#2c3038"; g.fillRect(x0 + 16, y, S - 32, uh - 4);
        g.fillStyle = "#14161a"; for (let k = 0; k < 9; k++) g.fillRect(x0 + 26 + k * 12, y + 4, 7, uh - 12); // drive bays
        g.fillStyle = "#3a3f48"; g.fillRect(x0 + S - 70, y + 4, 40, uh - 12);
      }
    } else {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#d3d7dc"); grad.addColorStop(0.6, "#bfc4ca"); grad.addColorStop(1, "#9ea4ab");
      g.fillStyle = grad; g.fillRect(x0, 0, S, h);
      g.fillStyle = "rgba(0,0,0,0.12)"; g.fillRect(x0, 0, 2, h); g.fillRect(x0 + S - 2, 0, 2, h); // panel seams
      g.fillRect(x0 + S / 2 - 1, cap + led, 2, h - cap - led - skirt);
      if (i === 0) { // stencil ID and a small warning label
        g.fillStyle = "rgba(40,44,52,0.75)";
        g.font = "bold 30px system-ui, sans-serif"; g.textAlign = "left";
        g.fillText(`T3-${String(11 + ((x0 / S) * 7) % 40).padStart(2, "0")}`, x0 + 18, cap + led + 44);
        g.fillStyle = YELLOW; g.fillRect(x0 + S - 70, cap + led + 18, 48, 40);
        g.strokeStyle = INK; g.lineWidth = 3; g.strokeRect(x0 + S - 66, cap + led + 22, 40, 32);
        wardenIcon(g, x0 + S - 46, cap + led + 40, 22, INK, INK);
      } else if (i === 1) { // access hatch
        g.fillStyle = "#aeb4bb"; roundRect(g, x0 + 54, cap + led + 14, S - 108, h - cap - led - skirt - 30, 8); g.fill();
        g.strokeStyle = "rgba(0,0,0,0.25)"; g.lineWidth = 3; g.stroke();
        bolts(g, x0 + 54, cap + led + 14, S - 108, h - cap - led - skirt - 30, 12);
        g.fillStyle = "#2b2f36"; g.fillRect(x0 + S / 2 - 22, cap + led + 30, 44, 10); // handle
        g.fillStyle = "#d23b3b"; g.font = "bold 16px system-ui, sans-serif"; g.textAlign = "center";
        g.fillText("HIGH VOLTAGE", x0 + S / 2, h - skirt - 26);
      } else { // end panel: the test-zone sign
        g.fillStyle = YELLOW; g.fillRect(x0 + 20, cap + led + 10, S - 40, h - cap - led - skirt - 22);
        g.fillStyle = INK; g.fillRect(x0 + 26, cap + led + 16, S - 52, 30);
        g.fillStyle = YELLOW; g.font = "bold 20px system-ui, sans-serif"; g.textAlign = "center";
        g.fillText("CAUTION", x0 + S / 2, cap + led + 38);
        g.beginPath(); g.moveTo(x0 + S / 2, cap + led + 56); g.lineTo(x0 + S / 2 + 42, cap + led + 120); g.lineTo(x0 + S / 2 - 42, cap + led + 120); g.closePath();
        g.fillStyle = INK; g.fill();
        wardenIcon(g, x0 + S / 2, cap + led + 100, 26, YELLOW, "#d23b3b");
        g.fillStyle = INK; g.font = "bold 15px system-ui, sans-serif";
        g.fillText("AUTONOMOUS UNITS", x0 + S / 2, cap + led + 146);
        g.fillText("IN TESTING", x0 + S / 2, cap + led + 164);
      }
    }
    // Top cap with the LED strip under it, and the hazard skirt at the foot.
    g.fillStyle = "#2b2f36"; g.fillRect(x0, 0, S, cap);
    g.fillStyle = "#0e1013"; g.fillRect(x0, cap, S, led);
    hazard(g, x0, h - skirt, S, skirt, { size: 16 });
    g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(x0, h - skirt, S, 3);
    g.restore();
  }
}

// Emissive: the LED strip (mostly cyan, the odd amber), rack lights and the sign's red eye.
function paintSideGlow(g, h) {
  g.fillStyle = "#000"; g.fillRect(0, 0, S * SIDE_CELLS, h);
  const cap = Math.round(h * 0.07), led = Math.round(h * 0.05), skirt = Math.round(h * 0.17);
  for (let i = 0; i < SIDE_CELLS; i++) {
    const x0 = i * S;
    for (let k = 8; k < S - 8; k += 16) {
      g.fillStyle = (k / 16 + i) % 7 === 3 ? "#ffb020" : "#5fe3ff";
      g.fillRect(x0 + k, cap + led / 2 - 2, 8, 4);
    }
    if (i === 2) {
      const units = 7, uh = (h - cap - skirt - 16) / units;
      for (let u = 0; u < units; u++) {
        const y = cap + 8 + u * uh;
        for (let k = 0; k < 4; k++) { g.fillStyle = ["#3dff8a", "#3dff8a", "#ffb020", "#5fe3ff"][(u + k) % 4]; g.fillRect(x0 + S - 66 + k * 9, y + 6, 5, 5); }
      }
    }
    if (i === 3) { g.fillStyle = "#ff2e3e"; g.fillRect(x0 + S / 2 - 3, cap + led + 97, 7, 3); }
  }
}

// ---------- Partition tops (256 × 256 per cell): the equipment of the test floor ----------

function paintTops(g, s) {
  TOPS.forEach((kind, i) => {
    const x0 = i * s;
    g.save();
    g.translate(x0, 0);
    g.beginPath(); g.rect(0, 0, s, s); g.clip();
    // Every module sits in a dark steel frame.
    g.fillStyle = "#30353d"; g.fillRect(0, 0, s, s);
    g.fillStyle = "#3b414a"; g.fillRect(6, 6, s - 12, s - 12);
    TOP_PAINT[kind](g, s);
    g.restore();
  });
}

const TOP_PAINT = {
  bench(g, s) { // workbench with a half-built Warden head
    g.fillStyle = "#8d949d"; g.fillRect(12, 12, s - 24, s - 24);
    g.fillStyle = "rgba(255,255,255,0.07)"; for (let y = 14; y < s - 14; y += 4) g.fillRect(12, y, s - 24, 1);
    g.fillStyle = "#1f5a43"; g.fillRect(30, 40, 150, 120); // cutting mat
    g.strokeStyle = "rgba(255,255,255,0.18)"; g.lineWidth = 1;
    for (let k = 40; k < 180; k += 15) { g.beginPath(); g.moveTo(k, 40); g.lineTo(k, 160); g.stroke(); }
    for (let k = 40; k < 160; k += 15) { g.beginPath(); g.moveTo(30, k); g.lineTo(180, k); g.stroke(); }
    // The head: grey shell, black visor, a dead red eye (lit in the glow map), opened panel and wires.
    g.fillStyle = "#3a4150"; roundRect(g, 54, 62, 104, 76, 10); g.fill();
    g.fillStyle = "#5b6578"; g.fillRect(58, 64, 96, 8);
    g.fillStyle = "#06080b"; g.fillRect(66, 86, 80, 28);
    g.fillStyle = "#5a1218"; g.fillRect(96, 94, 20, 10);
    g.fillStyle = "#1a1d24"; g.fillRect(134, 120, 20, 14); // open service panel
    g.strokeStyle = "#e0413b"; g.lineWidth = 3; g.beginPath(); g.moveTo(144, 128); g.bezierCurveTo(170, 150, 150, 176, 196, 186); g.stroke();
    g.strokeStyle = "#3aa0ff"; g.beginPath(); g.moveTo(140, 130); g.bezierCurveTo(160, 170, 128, 186, 170, 206); g.stroke();
    g.fillStyle = "#4a5262"; g.fillRect(126, 44, 6, 22); // antenna, unplugged
    // Tools and parts.
    g.fillStyle = "#9aa3ad"; g.fillRect(196, 42, 10, 74); g.beginPath(); g.arc(201, 40, 12, 0, Math.PI * 2); g.fill(); // wrench
    g.fillStyle = "#3b414a"; g.beginPath(); g.arc(201, 38, 5, 0, Math.PI * 2); g.fill();
    g.fillStyle = YELLOW; g.fillRect(214, 70, 12, 40); g.fillStyle = "#c6ccd3"; g.fillRect(218, 110, 4, 30); // screwdriver
    g.fillStyle = "#2b2f36"; for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(46 + k * 20, 196, 6, 0, Math.PI * 2); g.fill(); } // servos
    g.fillStyle = "#d8dce1"; g.fillRect(150, 178, 64, 44); g.fillStyle = "#7d8590"; for (let k = 0; k < 4; k++) g.fillRect(156, 186 + k * 9, 50 - k * 8, 3); // spec sheet
  },
  cradle(g, s) { // a dormant Warden prototype on its charging cradle
    g.fillStyle = "#1e2126"; g.fillRect(12, 12, s - 24, s - 24);
    g.strokeStyle = YELLOW; g.lineWidth = 4; g.setLineDash([16, 10]); g.strokeRect(24, 24, s - 48, s - 48); g.setLineDash([]);
    // The robot lying on its back, head up: legs, torso, arms, head with visor.
    g.fillStyle = "#151920"; g.fillRect(96, 168, 24, 52); g.fillRect(136, 168, 24, 52);
    g.fillStyle = "#3a4150"; roundRect(g, 76, 96, 104, 78, 8); g.fill();
    g.fillStyle = "#55607a"; g.fillRect(80, 98, 96, 6);
    g.fillStyle = "#1c2f33"; g.fillRect(100, 128, 56, 10); // chest light bar (lit in the glow map)
    g.fillStyle = "#2c323e"; g.fillRect(56, 104, 16, 66); g.fillRect(184, 104, 16, 66);
    g.fillStyle = "#3a4150"; roundRect(g, 94, 40, 68, 50, 8); g.fill();
    g.fillStyle = "#06080b"; g.fillRect(102, 56, 52, 18);
    // Charger and thick cables.
    hazard(g, 196, 196, 40, 40, { size: 8 });
    g.strokeStyle = "#0b0c0e"; g.lineWidth = 7;
    g.beginPath(); g.moveTo(128, 150); g.bezierCurveTo(170, 160, 190, 190, 210, 206); g.stroke();
    g.beginPath(); g.moveTo(170, 110); g.bezierCurveTo(220, 120, 222, 170, 222, 200); g.stroke();
    g.fillStyle = "#0e1013"; g.fillRect(30, 212, 70, 14); // charge meter frame
  },
  rack(g, s) { // training-cluster node: vent grilles and status lights
    g.fillStyle = "#15171b"; g.fillRect(12, 12, s - 24, s - 24);
    for (let r = 0; r < 3; r++) {
      g.fillStyle = "#22252b"; g.fillRect(24, 26 + r * 70, s - 48, 58);
      g.fillStyle = "#0b0c0f"; for (let k = 0; k < 16; k++) g.fillRect(32 + k * 12, 34 + r * 70, 6, 42);
    }
    g.fillStyle = "#7d8590"; g.font = "bold 13px system-ui, sans-serif"; g.textAlign = "left";
    g.fillText("TRAINING NODE", 26, s - 18);
  },
  crate(g, s) { // a shipping crate for a finished Warden
    g.fillStyle = "#b98a52"; g.fillRect(12, 12, s - 24, s - 24);
    for (let k = 12; k < s - 12; k += 33) { g.fillStyle = "rgba(0,0,0,0.12)"; g.fillRect(12, k, s - 24, 2); g.fillStyle = "rgba(255,255,255,0.06)"; g.fillRect(12, k + 2, s - 24, 2); }
    g.fillStyle = "#8a6337"; g.fillRect(12, 12, s - 24, 14); g.fillRect(12, s - 26, s - 24, 14); g.fillRect(12, 12, 14, s - 24); g.fillRect(s - 26, 12, 14, s - 24);
    g.fillStyle = "#1a1a1a"; g.fillRect(s * 0.33, 12, 10, s - 24); g.fillRect(s * 0.62, 12, 10, s - 24); // straps
    g.fillStyle = "rgba(30,24,16,0.85)"; g.font = "bold 30px system-ui, sans-serif"; g.textAlign = "center";
    g.fillText("W-UNIT", s / 2, s * 0.44);
    g.font = "bold 17px system-ui, sans-serif"; g.fillText("CLEARPATH ROBOTICS", s / 2, s * 0.56);
    g.fillStyle = "rgba(190,40,30,0.9)"; g.font = "bold 22px system-ui, sans-serif"; g.fillText("FRAGILE", s / 2, s * 0.74);
    wardenIcon(g, s * 0.2, s * 0.2, 26, "rgba(30,24,16,0.8)", "rgba(30,24,16,0.8)");
  },
  console(g, s) { // a prediction console: three screens, a keyboard and a cold coffee
    g.fillStyle = "#2a2e35"; g.fillRect(12, 12, s - 24, s - 24);
    g.fillStyle = "#0a0c0f";
    g.fillRect(22, 30, 64, 92); g.fillRect(96, 22, 64, 100); g.fillRect(170, 30, 64, 92);
    g.fillStyle = "#3a3f48"; g.fillRect(60, 150, 136, 34);
    g.fillStyle = "#4d535d"; for (let r = 0; r < 3; r++) for (let k = 0; k < 11; k++) g.fillRect(65 + k * 12, 154 + r * 10, 9, 7);
    g.fillStyle = "#e9e6df"; g.beginPath(); g.arc(214, 200, 14, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#3b2414"; g.beginPath(); g.arc(214, 200, 10, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#d8dce1"; g.fillRect(30, 196, 48, 30);
  },
  mast(g, s) { // a lidar sensor mast
    g.fillStyle = "#4a5160"; g.fillRect(12, 12, s - 24, s - 24);
    bolts(g, 12, 12, s - 24, s - 24, 22);
    g.fillStyle = "#2b2f36"; g.beginPath(); g.arc(s / 2, s / 2, 86, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#14161a"; g.beginPath(); g.arc(s / 2, s / 2, 70, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#5b6578"; g.lineWidth = 3;
    for (const r of [30, 50]) { g.beginPath(); g.arc(s / 2, s / 2, r, 0, Math.PI * 2); g.stroke(); }
    hazard(g, 12, s - 34, s - 24, 22, { size: 10 });
  },
  barrier(g, s) { // the floor's outer barrier: a dark tread-plate deck with one amber marker light
    g.fillStyle = "#262a31"; g.fillRect(0, 0, s, s);
    g.fillStyle = "#2f343c"; g.fillRect(14, 14, s - 28, s - 28);
    g.fillStyle = "rgba(255,255,255,0.045)";
    for (let y = 22; y < s - 22; y += 18) for (let x = 22 + ((y / 18) % 2) * 9; x < s - 22; x += 18) g.fillRect(x, y, 10, 3); // tread
    g.strokeStyle = "rgba(242,194,48,0.55)"; g.lineWidth = 3; g.strokeRect(14, 14, s - 28, s - 28);
    g.fillStyle = "#1a1d22"; g.beginPath(); g.arc(s / 2, s / 2, 16, 0, Math.PI * 2); g.fill();
    bolts(g, 14, 14, s - 28, s - 28, 14);
  },
};

function paintTopGlow(g, s) {
  g.fillStyle = "#000"; g.fillRect(0, 0, s * TOPS.length, s);
  const at = (kind) => TOPS.indexOf(kind) * s;
  // Bench: the half-built head's eye, faintly.
  g.fillStyle = "#b0212d"; g.fillRect(at("bench") + 96, 94, 20, 10);
  // Cradle: chest light bar and the charge meter.
  let x = at("cradle");
  g.fillStyle = "#3fd0c9"; g.fillRect(x + 100, 128, 56, 10);
  for (let k = 0; k < 5; k++) { g.fillStyle = k < 4 ? "#3fd0c9" : "#0b3b38"; g.fillRect(x + 34 + k * 13, 215, 10, 8); }
  // Rack: rows of status LEDs.
  x = at("rack");
  for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) { g.fillStyle = ["#3dff8a", "#3dff8a", "#ffb020", "#3dff8a", "#5fe3ff", "#ff3b4a"][(k + r * 2) % 6]; g.fillRect(x + s - 44, 30 + r * 70 + k * 8, 6, 4); }
  // Console: a prediction tree, a radar and a bar chart.
  x = at("console");
  g.strokeStyle = "#ff4656"; g.lineWidth = 2;
  const tree = (px, py, d, w) => { if (d > 3) return; for (const dx of [-w, w]) { g.beginPath(); g.moveTo(px, py); g.lineTo(px + dx, py + 20); g.stroke(); tree(px + dx, py + 20, d + 1, w / 2); } };
  tree(x + 128, 32, 0, 22);
  g.strokeStyle = "#3fd0c9"; g.beginPath(); g.arc(x + 54, 76, 24, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(x + 54, 76, 12, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(x + 54, 76); g.lineTo(x + 74, 62); g.stroke();
  g.fillStyle = "#ff4656"; g.fillRect(x + 62, 64, 4, 4);
  g.fillStyle = "#ffb020"; for (let k = 0; k < 5; k++) g.fillRect(x + 178 + k * 11, 110 - (k * 17) % 60 - 14, 7, (k * 17) % 60 + 14);
  // Mast: the lidar's sweeping wedge.
  x = at("mast");
  const grad = g.createRadialGradient(x + s / 2, s / 2, 4, x + s / 2, s / 2, 70);
  grad.addColorStop(0, "rgba(120,240,255,0.9)"); grad.addColorStop(1, "rgba(120,240,255,0.1)");
  g.fillStyle = grad; g.beginPath(); g.moveTo(x + s / 2, s / 2); g.arc(x + s / 2, s / 2, 70, -0.9, -0.2); g.closePath(); g.fill();
  g.fillStyle = "#ff3b4a"; g.beginPath(); g.arc(x + s / 2, s / 2, 6, 0, Math.PI * 2); g.fill();
  // Barrier: a pair of amber marker lights.
  x = at("barrier");
  g.fillStyle = "#a86a00"; g.beginPath(); g.arc(x + s / 2, s / 2, 9, 0, Math.PI * 2); g.fill();
}

// ---------- Floor: graphite epoxy, test lanes, calibration grid, charging bays ----------

function paintFloor(g, layout, rnd) {
  const { rows, cols } = layout;
  const W = cols * PX, H = rows * PX;
  const isWall = new Set(layout.walls.map((w) => `${w.r},${w.c}`));
  const wallAt = (r, c) => isWall.has(`${r},${c}`);

  g.fillStyle = "#23272d"; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 1400; i++) { // mottled epoxy
    g.fillStyle = `rgba(${rnd() < 0.5 ? "255,255,255" : "0,0,0"},${0.02 + rnd() * 0.03})`;
    const r = 2 + rnd() * 10; g.beginPath(); g.arc(rnd() * W, rnd() * H, r, 0, Math.PI * 2); g.fill();
  }
  // Concrete slab joints every three tiles.
  g.fillStyle = "rgba(0,0,0,0.45)";
  for (let c = 0; c <= cols; c += 3) g.fillRect(c * PX - 1, 0, 2, H);
  for (let r = 0; r <= rows; r += 3) g.fillRect(0, r * PX - 1, W, 2);
  // Calibration grid: faint tile lines with a crosshair at each corner and a coordinate on each tile.
  g.fillStyle = "rgba(255,255,255,0.035)";
  for (let c = 0; c <= cols; c++) g.fillRect(c * PX, 0, 1, H);
  for (let r = 0; r <= rows; r++) g.fillRect(0, r * PX, W, 1);
  g.fillStyle = "rgba(242,194,48,0.35)";
  for (let r = 1; r < rows; r++) for (let c = 1; c < cols; c++) { g.fillRect(c * PX - 6, r * PX - 1, 12, 2); g.fillRect(c * PX - 1, r * PX - 6, 2, 12); }
  g.font = `bold ${Math.round(PX * 0.12)}px system-ui, sans-serif`;
  g.textAlign = "left";
  g.fillStyle = "rgba(242,194,48,0.22)";
  for (const f of layout.floorTiles) g.fillText(`${String.fromCharCode(65 + f.c)}${f.r}`, f.c * PX + 7, f.r * PX + PX * 0.18);

  // Tread scuffs from Wardens on test runs.
  g.strokeStyle = "rgba(0,0,0,0.28)"; g.lineWidth = 3;
  for (let i = 0; i < 26; i++) {
    const f = layout.floorTiles[Math.floor(rnd() * layout.floorTiles.length)];
    const x = (f.c + 0.2 + rnd() * 0.6) * PX, y = (f.r + 0.2 + rnd() * 0.6) * PX, a = rnd() * Math.PI * 2;
    g.beginPath(); g.arc(x, y, PX * (0.3 + rnd() * 0.4), a, a + 0.8 + rnd()); g.stroke();
  }

  // High-bay light pools.
  g.globalCompositeOperation = "lighter";
  for (let r = 1; r < rows; r += 3) {
    for (let c = 1; c < cols; c += 3) {
      const x = (c + 0.5) * PX, y = (r + 0.5) * PX, radius = PX * 1.5;
      const grad = g.createRadialGradient(x, y, 0, x, y, radius);
      grad.addColorStop(0, "rgba(210,230,255,0.13)");
      grad.addColorStop(1, "rgba(210,230,255,0)");
      g.fillStyle = grad; g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  }
  g.globalCompositeOperation = "source-over";
  paintWallShadows(g, layout, PX, { steps: 6, alpha: 0.09, spread: 3 });

  // Test-lane edge lines: safety yellow, inset from every wall that borders a corridor.
  const inset = PX * 0.1;
  g.fillStyle = "rgba(242,194,48,0.6)";
  for (const f of layout.floorTiles) {
    const x = f.c * PX, y = f.r * PX;
    if (wallAt(f.r - 1, f.c)) g.fillRect(x, y + inset, PX, 3);
    if (wallAt(f.r + 1, f.c)) g.fillRect(x, y + PX - inset - 3, PX, 3);
    if (wallAt(f.r, f.c - 1)) g.fillRect(x + inset, y, 3, PX);
    if (wallAt(f.r, f.c + 1)) g.fillRect(x + PX - inset - 3, y, 3, PX);
  }

  // Charging bays where the Wardens start.
  layout.ghostStarts.forEach((s, i) => {
    const x = s.c * PX, y = s.r * PX, m = PX * 0.1;
    g.fillStyle = "rgba(242,194,48,0.12)"; g.fillRect(x + m, y + m, PX - 2 * m, PX - 2 * m);
    g.strokeStyle = "rgba(242,194,48,0.85)"; g.lineWidth = 3; g.strokeRect(x + m, y + m, PX - 2 * m, PX - 2 * m);
    for (const [cx, cy] of [[x + m, y + m], [x + PX - m - 14, y + m], [x + m, y + PX - m - 14], [x + PX - m - 14, y + PX - m - 14]]) hazard(g, cx, cy, 14, 14, { size: 5 });
    g.fillStyle = "rgba(242,194,48,0.9)"; g.textAlign = "center";
    g.font = `bold ${Math.round(PX * 0.13)}px system-ui, sans-serif`;
    g.fillText(`BAY W-0${i + 1}`, x + PX / 2, y + PX * 0.86);
  });

  // The way out: a blast-door threshold with chevrons.
  for (const e of layout.exits) {
    const x = e.c * PX, y = e.r * PX;
    hazard(g, x, y, PX, PX, { size: 12, a: "#c99a1e", b: "#14161a" });
  }
}

// ---------- Backdrop: the hangar around the floor ----------
function paintBackdrop(g, w, h) {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#0b0d11"); grad.addColorStop(0.55, "#14171c"); grad.addColorStop(1, "#08090c");
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  const rnd = seededRandom(33);
  // Roof trusses.
  g.strokeStyle = "rgba(120,132,150,0.14)"; g.lineWidth = 3;
  for (let x = -40; x < w + 80; x += 160) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 80, 110); g.lineTo(x + 160, 0); g.stroke();
  }
  g.beginPath(); g.moveTo(0, 110); g.lineTo(w, 110); g.stroke();
  // High-bay lights with cones.
  for (let x = 90; x < w; x += 220) {
    const cone = g.createLinearGradient(0, 110, 0, h * 0.8);
    cone.addColorStop(0, "rgba(220,235,255,0.12)"); cone.addColorStop(1, "rgba(220,235,255,0)");
    g.fillStyle = cone; g.beginPath(); g.moveTo(x - 14, 116); g.lineTo(x + 14, 116); g.lineTo(x + 120, h * 0.8); g.lineTo(x - 120, h * 0.8); g.closePath(); g.fill();
    g.fillStyle = "#dfe9f5"; g.fillRect(x - 16, 110, 32, 6);
  }
  // Rows of Warden prototypes on test stands along the back wall, red eyes in the dark.
  for (let i = 0; i < 18; i++) {
    const x = 30 + i * 72 + rnd() * 10, y = h * 0.5 + (i % 2) * 8, sc = 0.9 + rnd() * 0.2;
    g.fillStyle = "rgba(30,34,42,0.95)";
    g.fillRect(x - 14 * sc, y - 46 * sc, 28 * sc, 20 * sc); // head
    g.fillRect(x - 18 * sc, y - 24 * sc, 36 * sc, 28 * sc); // body
    g.fillRect(x - 12 * sc, y + 4 * sc, 8 * sc, 18 * sc); g.fillRect(x + 4 * sc, y + 4 * sc, 8 * sc, 18 * sc);
    g.fillStyle = "rgba(50,56,68,0.95)"; g.fillRect(x - 24 * sc, y + 22 * sc, 48 * sc, 6 * sc); // stand
    if (rnd() < 0.7) { g.fillStyle = "rgba(255,46,62,0.85)"; g.fillRect(x - 4 * sc, y - 39 * sc, 8 * sc, 3 * sc); g.fillStyle = "rgba(255,46,62,0.12)"; g.beginPath(); g.arc(x, y - 38 * sc, 14 * sc, 0, Math.PI * 2); g.fill(); }
  }
  // Painted wall lettering and a hazard band.
  g.fillStyle = "rgba(242,194,48,0.08)"; g.font = "bold 88px system-ui, sans-serif"; g.textAlign = "center";
  g.fillText("PROVING GROUND 3", w / 2, h * 0.36);
  hazard(g, 0, h * 0.62, w, 14, { size: 18, a: "rgba(242,194,48,0.22)", b: "rgba(0,0,0,0)" });
  // Dust in the light.
  for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(220,230,245,${0.05 + rnd() * 0.15})`; g.fillRect(rnd() * w, rnd() * h, 1.5, 1.5); }
}

// executive.js — Level 4's look: the Archive on Floor 88, Clearpath's executive suite, where the chiefs
// keep the company's most confidential files. Walnut and black-glass partitions with brass trim and
// warm cove lights; biometric records cabinets marked EYES ONLY; the CEO's desk with a holographic
// subject file; a boardroom table; data safes; leather lounges and designer planters. A midnight
// carpet with an art-deco pattern, black-marble borders with gold inlay, and floor-to-ceiling windows
// onto the city at night, with rain running down the glass. Holograms of people's files turn slowly
// over the holo-tables.
// three-view.js picks this up when a level's theme has `style: "executive"`.
//
// Built like the other looks: light is painted into the floor (no shadow maps), the partitions are two
// merged meshes, and the holograms are a handful of textured planes.

import { backdrop, canvasTexture, exitSigns, floorDecal, paintWallShadows, seededRandom, wallGeometry } from "./art-kit.js";

const PX = 96; // floor texture pixels per tile
const S = 256; // atlas cell size
const SIDE_CELLS = 4; // walnut panel, smart glass, secure cabinet, marble end cap
const TOPS = ["ceoDesk", "boardroom", "cabinet", "lounge", "planter", "holotable", "safe", "sill"];
const GOLD = "#c9a85c", GOLD_L = "#f1d999", HOLO = "#5fe3ff";
const PEOPLE = ["S. REYES", "M. OKAFOR", "J. CHEN", "A. PATEL", "L. GARCIA", "K. TANAKA", "D. NGUYEN", "R. KIM"];

/**
 * @returns {{ group, walls, floorMaterial, shadows: false, background, fogColor, update(time: number): boolean, dispose(): void }}
 */
export function buildExecutive(THREE, layout, { still = false } = {}) {
  const rnd = seededRandom(5);
  const t = layout.theme;
  const c = layout.floor.position;
  const group = new THREE.Group();
  const disposables = [];

  // ---------- Light: warm interior light against the cold night outside ----------
  group.add(new THREE.HemisphereLight(0xfff0dc, 0x10131c, 1.45 * t.light));
  const key = new THREE.DirectionalLight(0xffe9cc, 1.2 * t.light);
  key.position.set(c.x - 5, 11, c.z + 7);
  key.target.position.set(c.x, 0, c.z);
  group.add(key, key.target);

  // ---------- Partitions ----------
  const faceH = Math.round((S * t.wallHeight) / layout.tileSize);
  const sideMap = canvasTexture(THREE, S * SIDE_CELLS, (g, w, h) => paintSides(g, h, rnd), { height: faceH, wrap: false });
  const sideGlow = canvasTexture(THREE, S * SIDE_CELLS, (g, w, h) => paintSideGlow(g, h), { height: faceH, wrap: false });
  const sideMaterial = new THREE.MeshLambertMaterial({ map: sideMap, emissive: 0xffffff, emissiveMap: sideGlow });
  const topMap = canvasTexture(THREE, S * TOPS.length, (g, w, h) => paintTops(g, h, rnd), { height: S, wrap: false });
  const topGlow = canvasTexture(THREE, S * TOPS.length, (g, w, h) => paintTopGlow(g, h), { height: S, wrap: false });
  const topMaterial = new THREE.MeshLambertMaterial({ map: topMap, emissive: 0xffffff, emissiveMap: topGlow });

  const edge = (r, col) => r === 0 || col === 0 || r === layout.rows - 1 || col === layout.cols - 1;
  const holoTables = [];
  const weights = [2, 2, 4, 2, 2, 0, 2]; // ceoDesk … safe (holo-tables are placed separately, spread out)
  const pick = () => {
    let k = rnd() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < weights.length; i++) { k -= weights[i]; if (k < 0) return i; }
    return 2;
  };
  const geo = wallGeometry(THREE, layout, {
    sideCells: SIDE_CELLS, topCells: TOPS.length,
    pickSide: (r, col, f) => (f.end ? 3 : edge(r, col) ? (rnd() < 0.75 ? 0 : 2) : [0, 0, 1, 1, 2][Math.floor(rnd() * 5)]),
    pickTop: (r, col) => {
      if (edge(r, col)) return 7;
      if (rnd() < 0.2 && holoTables.every((h) => Math.abs(h.r - r) + Math.abs(h.c - col) > 3)) { holoTables.push({ r, c: col }); return 5; }
      return pick();
    },
  });
  const walls = new THREE.Group();
  walls.add(new THREE.Mesh(geo.sides, sideMaterial), new THREE.Mesh(geo.tops, topMaterial));

  // ---------- Floor ----------
  const floorMap = canvasTexture(THREE, layout.cols * PX, (g) => paintFloor(g, layout, rnd), { height: layout.rows * PX, wrap: false });
  const floorMaterial = new THREE.MeshBasicMaterial({ map: floorMap });

  for (const sign of exitSigns(THREE, layout, t.wallHeight + 0.45)) group.add(sign);

  // ---------- Holograms: a person's file turning slowly over each holo-table ----------
  const H = t.wallHeight;
  const beamMaterial = new THREE.MeshBasicMaterial({ color: 0x5fe3ff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const holos = holoTables.map((h, i) => {
    const tex = canvasTexture(THREE, 128, (g, w, hh) => paintHoloCard(g, w, hh, PEOPLE[i % PEOPLE.length], i), { height: 160, wrap: false });
    disposables.push(tex);
    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.78),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    const x = h.c * layout.tileSize, z = h.r * layout.tileSize;
    card.position.set(x, H + 0.62, z);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.08, 0.5, 18, 1, true), beamMaterial);
    beam.position.set(x, H + 0.25, z);
    const glow = floorDecal(THREE, { color: 0x5fe3ff, size: 1.2, opacity: 0.5, y: 0 });
    glow.position.set(x, H + 0.015, z);
    group.add(card, beam, glow);
    return { card, phase: i * 1.3 };
  });

  // Warm glow spilling from the cove lights and the desk lamps.
  for (let i = 0; i < 7; i++) {
    const f = layout.floorTiles[Math.floor(rnd() * layout.floorTiles.length)];
    const pool = floorDecal(THREE, { color: 0xffd9a0, size: 2.6 + rnd() * 1.2, opacity: 0.13, y: 0.03 });
    pool.position.set(f.position.x, 0.03, f.position.z);
    group.add(pool);
  }

  // ---------- Background: floor-to-ceiling windows onto the city at night, rain on the glass ----------
  const background = backdrop(THREE, paintBackdrop);
  disposables.push(background);

  function update(time) {
    if (still) return false;
    for (const h of holos) {
      h.card.rotation.y = time * 0.6 + h.phase;
      h.card.position.y = H + 0.62 + Math.sin(time * 1.4 + h.phase) * 0.04;
      h.card.material.opacity = 0.95 + Math.sin(time * 9 + h.phase) * 0.05 + (Math.sin(time * 31 + h.phase) > 0.97 ? -0.35 : 0);
    }
    topMaterial.emissiveIntensity = 0.92 + Math.sin(time * 1.3) * 0.06;
    sideMaterial.emissiveIntensity = 0.85 + Math.sin(time * 0.8) * 0.08;
    return false;
  }
  update(0);

  return {
    group, walls, floorMaterial, shadows: false, background, fogColor: "#0b0d14", update,
    dispose() { for (const d of disposables) d.dispose(); },
  };
}

// ---------- Painting helpers ----------

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// Black marble: a dark base with soft white and gold veins.
function marble(g, x, y, w, h, rnd, { base = "#121318", veins = 6 } = {}) {
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = base; g.fillRect(x, y, w, h);
  for (let i = 0; i < veins; i++) {
    g.strokeStyle = i % 3 === 0 ? "rgba(201,168,92,0.35)" : "rgba(235,235,245,0.12)";
    g.lineWidth = 0.8 + rnd() * 1.6;
    g.beginPath();
    let px = x + rnd() * w, py = y;
    g.moveTo(px, py);
    while (py < y + h) { px += (rnd() - 0.5) * 30; py += 10 + rnd() * 20; g.lineTo(px, py); }
    g.stroke();
  }
  g.restore();
}

// Walnut veneer with fine grain.
function walnut(g, x, y, w, h, rnd, vertical = true) {
  const grad = vertical ? g.createLinearGradient(x, 0, x + w, 0) : g.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, "#4a2c1a"); grad.addColorStop(0.5, "#5e3a22"); grad.addColorStop(1, "#43271a");
  g.fillStyle = grad; g.fillRect(x, y, w, h);
  g.strokeStyle = "rgba(20,10,4,0.28)"; g.lineWidth = 1;
  for (let k = 0; k < (vertical ? w : h); k += 3 + rnd() * 4) {
    g.beginPath();
    if (vertical) { g.moveTo(x + k, y); g.bezierCurveTo(x + k + 6, y + h * 0.3, x + k - 6, y + h * 0.7, x + k + 2, y + h); }
    else { g.moveTo(x, y + k); g.bezierCurveTo(x + w * 0.3, y + k + 6, x + w * 0.7, y + k - 6, x + w, y + k + 2); }
    g.stroke();
  }
}

// ---------- Partition sides (256 × faceH per cell) ----------

function paintSides(g, h, rnd) {
  for (let i = 0; i < SIDE_CELLS; i++) {
    const x0 = i * S;
    g.save();
    g.beginPath(); g.rect(x0, 0, S, h); g.clip();
    const cove = Math.round(h * 0.06), plinth = Math.round(h * 0.1);
    if (i === 0) { // walnut panel with a brass reveal
      walnut(g, x0, 0, S, h, rnd);
      g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(x0 + S / 2 - 1, cove, 2, h - cove - plinth);
      g.fillStyle = GOLD; g.fillRect(x0, Math.round(h * 0.62), S, 3);
      g.fillStyle = GOLD_L; g.fillRect(x0, Math.round(h * 0.62), S, 1);
    } else if (i === 1) { // smart glass, frosted for privacy
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#2a3346"); grad.addColorStop(1, "#1a2030");
      g.fillStyle = grad; g.fillRect(x0, 0, S, h);
      g.fillStyle = "rgba(255,255,255,0.05)";
      for (let k = 0; k < 18; k++) g.fillRect(x0 + k * 16 - 20, 0, 3, h); // faint reflections
      g.strokeStyle = "rgba(201,168,92,0.9)"; g.lineWidth = 3; g.strokeRect(x0 + 8, cove + 6, S - 16, h - cove - plinth - 12);
      g.fillStyle = "rgba(220,230,255,0.35)"; g.font = "600 15px Georgia, serif"; g.textAlign = "center";
      g.fillText("CLEARPATH", x0 + S / 2, h * 0.45);
      g.fillStyle = "rgba(220,230,255,0.18)"; g.font = "600 11px system-ui, sans-serif";
      g.fillText("PRIVATE OFFICE", x0 + S / 2, h * 0.45 + 18);
    } else if (i === 2) { // secure records cabinet
      g.fillStyle = "#15161b"; g.fillRect(x0, 0, S, h);
      const rows = 3, dh = (h - cove - plinth - 12) / rows;
      for (let r = 0; r < rows; r++) {
        const y = cove + 6 + r * dh;
        g.fillStyle = "#1d1f26"; g.fillRect(x0 + 10, y, S - 20, dh - 6);
        g.fillStyle = "rgba(255,255,255,0.05)"; g.fillRect(x0 + 10, y, S - 20, 2);
        g.fillStyle = GOLD; g.fillRect(x0 + S / 2 - 28, y + dh / 2 - 5, 56, 5); // brass pull
        g.fillStyle = "#0b0c0f"; roundRect(g, x0 + S - 44, y + dh / 2 - 12, 22, 22, 4); g.fill(); // fingerprint pad (lit in glow)
      }
      g.fillStyle = "#b3261e"; g.font = "bold 13px system-ui, sans-serif"; g.textAlign = "left";
      g.fillText("EYES ONLY", x0 + 16, cove + 22);
    } else { // marble end cap with a brass plaque
      marble(g, x0, 0, S, h, rnd, { veins: 9 });
      g.fillStyle = GOLD; roundRect(g, x0 + 40, h * 0.3, S - 80, 54, 4); g.fill();
      g.fillStyle = GOLD_L; g.fillRect(x0 + 44, h * 0.3 + 4, S - 88, 2);
      g.fillStyle = "#2a1d08"; g.font = "600 16px Georgia, serif"; g.textAlign = "center";
      g.fillText("EXECUTIVE SUITE", x0 + S / 2, h * 0.3 + 25);
      g.font = "600 12px Georgia, serif"; g.fillText("FLOOR 88 · C-SUITE", x0 + S / 2, h * 0.3 + 43);
    }
    // Cove light at the top and a black plinth at the foot.
    g.fillStyle = "#0e0f13"; g.fillRect(x0, 0, S, cove);
    g.fillStyle = "#0c0c0f"; g.fillRect(x0, h - plinth, S, plinth);
    g.fillStyle = GOLD; g.fillRect(x0, h - plinth, S, 2);
    g.restore();
  }
}

function paintSideGlow(g, h) {
  g.fillStyle = "#000"; g.fillRect(0, 0, S * SIDE_CELLS, h);
  const cove = Math.round(h * 0.06), plinth = Math.round(h * 0.1);
  for (let i = 0; i < SIDE_CELLS; i++) {
    const x0 = i * S;
    const grad = g.createLinearGradient(0, 0, 0, cove + 10);
    grad.addColorStop(0, "rgba(255,214,150,0.9)"); grad.addColorStop(1, "rgba(255,214,150,0)");
    g.fillStyle = grad; g.fillRect(x0, cove - 2, S, 12);
    if (i === 1) { // smart glass edge light
      g.strokeStyle = "rgba(160,200,255,0.55)"; g.lineWidth = 2; g.strokeRect(x0 + 12, cove + 10, S - 24, h - cove - plinth - 20);
    }
    if (i === 2) {
      const rows = 3, dh = (h - cove - plinth - 12) / rows;
      for (let r = 0; r < rows; r++) {
        const y = cove + 6 + r * dh;
        g.strokeStyle = HOLO; g.lineWidth = 2;
        g.beginPath(); g.arc(x0 + S - 33, y + dh / 2 - 1, 6, 0, Math.PI * 2); g.stroke();
      }
    }
  }
}

// ---------- Partition tops (256 × 256 per cell): the furniture of the floor ----------

function paintTops(g, s, rnd) {
  TOPS.forEach((kind, i) => {
    g.save();
    g.translate(i * s, 0);
    g.beginPath(); g.rect(0, 0, s, s); g.clip();
    g.fillStyle = "#0e0f13"; g.fillRect(0, 0, s, s); // every module sits on a dark plinth with a brass edge
    g.strokeStyle = GOLD; g.lineWidth = 3; g.strokeRect(3, 3, s - 6, s - 6);
    TOP_PAINT[kind](g, s, rnd);
    g.restore();
  });
}

const TOP_PAINT = {
  ceoDesk(g, s, rnd) { // the CEO's desk: walnut slab, leather chair, holo display over the desk
    walnut(g, 18, 70, s - 36, 110, rnd, false);
    g.fillStyle = GOLD; g.fillRect(18, 176, s - 36, 4);
    g.fillStyle = "#1c1410"; roundRect(g, s / 2 - 34, 190, 68, 52, 14); g.fill(); // chair
    g.fillStyle = "#2c1f17"; roundRect(g, s / 2 - 26, 196, 52, 30, 10); g.fill();
    g.fillStyle = "#06121a"; g.fillRect(52, 84, 152, 54); // holo display glass (lit in glow)
    g.fillStyle = "#1a1d24"; g.fillRect(84, 146, 88, 14); // keyboard
    g.fillStyle = GOLD_L; g.fillRect(190, 150, 30, 4); // pen
    g.fillStyle = GOLD; g.fillRect(30, 150, 44, 16); g.fillStyle = "#2a1d08"; g.font = "bold 10px Georgia, serif"; g.textAlign = "center"; g.fillText("CEO", 52, 162);
    g.fillStyle = "#f2efe6"; g.fillRect(200, 92, 30, 40); g.fillStyle = "#b3261e"; g.fillRect(200, 92, 30, 6); // a confidential file
  },
  boardroom(g, s) { // a slice of the boardroom table: black glass, chairs, tablets, a holo chart
    g.fillStyle = "#1a1c22"; g.fillRect(0, 0, s, s);
    g.fillStyle = "#08090c"; roundRect(g, 46, 20, s - 92, s - 40, 18); g.fill();
    g.fillStyle = "rgba(255,255,255,0.06)"; g.fillRect(56, 26, s - 112, 8);
    for (const y of [40, 104, 168]) for (const x of [14, s - 44]) { g.fillStyle = "#2c1f17"; roundRect(g, x, y, 30, 42, 8); g.fill(); }
    for (const y of [50, 116, 180]) for (const x of [62, s - 92]) { g.fillStyle = "#1f2430"; g.fillRect(x, y, 30, 20); }
    g.fillStyle = "#0a1a20"; g.beginPath(); g.arc(s / 2, s / 2, 34, 0, Math.PI * 2); g.fill();
  },
  cabinet(g, s) { // biometric records cabinet with a classified folder on top
    g.fillStyle = "#15161b"; g.fillRect(12, 12, s - 24, s - 24);
    g.fillStyle = "#1d1f26"; for (let k = 0; k < 4; k++) g.fillRect(24, 24 + k * 54, s - 48, 46);
    g.fillStyle = GOLD; for (let k = 0; k < 4; k++) g.fillRect(s / 2 - 30, 44 + k * 54, 60, 5);
    g.save(); g.translate(150, 120); g.rotate(-0.18);
    g.fillStyle = "#e8dcc0"; g.fillRect(-46, -34, 92, 68);
    g.fillStyle = "#b3261e"; g.fillRect(-46, -34, 92, 10);
    g.strokeStyle = "#b3261e"; g.lineWidth = 3; g.strokeRect(-30, -6, 60, 22);
    g.fillStyle = "#b3261e"; g.font = "bold 12px system-ui, sans-serif"; g.textAlign = "center"; g.fillText("CLASSIFIED", 0, 10);
    g.restore();
    g.fillStyle = "#0b0c0f"; roundRect(g, 36, 186, 30, 30, 6); g.fill(); // fingerprint pad (lit in glow)
  },
  lounge(g, s) { // a leather sofa and a marble side table
    g.fillStyle = "#1b1d24"; g.fillRect(12, 12, s - 24, s - 24);
    g.fillStyle = "#6b3a1f"; roundRect(g, 26, 50, s - 52, 110, 20); g.fill();
    g.fillStyle = "#83492a"; for (let k = 0; k < 3; k++) { roundRect(g, 42 + k * 60, 80, 54, 70, 10); g.fill(); }
    g.fillStyle = "#5a2f18"; roundRect(g, 26, 50, s - 52, 26, 12); g.fill();
    g.fillStyle = "#e9e6df"; g.beginPath(); g.arc(s / 2, 206, 26, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "rgba(160,140,100,0.5)"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(s / 2 - 20, 196); g.lineTo(s / 2 + 16, 214); g.stroke();
    g.fillStyle = "#2a3346"; g.fillRect(s / 2 - 8, 198, 16, 12); // a tablet
  },
  planter(g, s) { // a stone planter with a sculpted tree
    g.fillStyle = "#1b1d24"; g.fillRect(12, 12, s - 24, s - 24);
    g.fillStyle = "#d9d4c9"; g.beginPath(); g.arc(s / 2, s / 2, 92, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#2a2018"; g.beginPath(); g.arc(s / 2, s / 2, 78, 0, Math.PI * 2); g.fill();
    for (let k = 0; k < 34; k++) {
      const a = k * 2.4, r = 16 + (k * 7) % 56;
      g.fillStyle = ["#2f6b3b", "#3f8a4a", "#24552f", "#58a160"][k % 4];
      g.beginPath(); g.ellipse(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r, 20, 10, a, 0, Math.PI * 2); g.fill();
    }
  },
  holotable(g, s) { // a round holo-table (the hologram floats above it)
    g.fillStyle = "#15161b"; g.fillRect(12, 12, s - 24, s - 24);
    g.fillStyle = "#0b0c10"; g.beginPath(); g.arc(s / 2, s / 2, 96, 0, Math.PI * 2); g.fill();
    g.strokeStyle = GOLD; g.lineWidth = 4; g.stroke();
    g.fillStyle = "#06121a"; g.beginPath(); g.arc(s / 2, s / 2, 54, 0, Math.PI * 2); g.fill();
  },
  safe(g, s) { // a data safe for Project Warden
    g.fillStyle = "#5d636c"; g.fillRect(14, 14, s - 28, s - 28);
    g.fillStyle = "rgba(255,255,255,0.05)"; for (let k = 16; k < s - 16; k += 4) g.fillRect(14, k, s - 28, 1);
    g.fillStyle = "#3a3f47"; g.fillRect(34, 34, s - 68, s - 68);
    g.fillStyle = GOLD; g.beginPath(); g.arc(s / 2, s / 2, 42, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#2a1d08"; g.beginPath(); g.arc(s / 2, s / 2, 30, 0, Math.PI * 2); g.fill();
    g.strokeStyle = GOLD_L; g.lineWidth = 3;
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; g.beginPath(); g.moveTo(s / 2 + Math.cos(a) * 32, s / 2 + Math.sin(a) * 32); g.lineTo(s / 2 + Math.cos(a) * 40, s / 2 + Math.sin(a) * 40); g.stroke(); }
    g.fillStyle = "#e8e2d2"; g.font = "bold 13px system-ui, sans-serif"; g.textAlign = "center";
    g.fillText("PROJECT WARDEN", s / 2, 64); g.fillStyle = "#e05a4f"; g.fillText("CONFIDENTIAL", s / 2, s - 52);
  },
  sill(g, s, rnd) { // the window sill around the floor: black granite with a brass rail
    marble(g, 0, 0, s, s, rnd, { base: "#16171c", veins: 4 });
    g.fillStyle = GOLD; g.fillRect(0, s / 2 - 3, s, 6);
    g.fillStyle = GOLD_L; g.fillRect(0, s / 2 - 3, s, 2);
  },
};

function paintTopGlow(g, s) {
  g.fillStyle = "#000"; g.fillRect(0, 0, s * TOPS.length, s);
  const at = (k) => TOPS.indexOf(k) * s;
  // CEO desk: the holo display shows a person's file.
  let x = at("ceoDesk");
  g.fillStyle = "rgba(95,227,255,0.35)"; g.fillRect(x + 52, 84, 152, 54);
  g.fillStyle = HOLO; g.fillRect(x + 60, 92, 30, 38);
  for (let k = 0; k < 4; k++) g.fillRect(x + 98, 96 + k * 9, 60 + (k * 23) % 40, 3);
  g.fillStyle = "#ff4656"; g.fillRect(x + 98, 132, 40, 3);
  // Boardroom: a holographic pie chart.
  x = at("boardroom");
  for (const [a0, a1, col] of [[0, 2.2, HOLO], [2.2, 4, "#c9a85c"], [4, 6.28, "#ff4656"]]) {
    g.fillStyle = col; g.beginPath(); g.moveTo(x + s / 2, s / 2); g.arc(x + s / 2, s / 2, 28, a0, a1); g.closePath(); g.fill();
  }
  for (const y of [50, 116, 180]) for (const dx of [62, s - 92]) { g.fillStyle = "rgba(95,227,255,0.6)"; g.fillRect(x + dx + 3, y + 3, 24, 14); }
  // Cabinet: the fingerprint pad.
  x = at("cabinet");
  g.strokeStyle = HOLO; g.lineWidth = 2;
  for (const r of [5, 9]) { g.beginPath(); g.arc(x + 51, 201, r, 0, Math.PI * 2); g.stroke(); }
  // Holo-table: the projector ring.
  x = at("holotable");
  const grad = g.createRadialGradient(x + s / 2, s / 2, 6, x + s / 2, s / 2, 54);
  grad.addColorStop(0, "rgba(200,250,255,1)"); grad.addColorStop(1, "rgba(95,227,255,0.15)");
  g.fillStyle = grad; g.beginPath(); g.arc(x + s / 2, s / 2, 54, 0, Math.PI * 2); g.fill();
  // Safe: a status light.
  x = at("safe");
  g.fillStyle = "#ff4656"; g.beginPath(); g.arc(x + s / 2, s / 2, 5, 0, Math.PI * 2); g.fill();
}

// A hologram card: a person's file, the kind of data this floor keeps on everyone.
function paintHoloCard(g, w, h, name, i) {
  g.clearRect(0, 0, w, h);
  g.strokeStyle = "rgba(95,227,255,0.9)"; g.lineWidth = 2; g.strokeRect(3, 3, w - 6, h - 6);
  g.fillStyle = "rgba(95,227,255,0.22)"; g.fillRect(3, 3, w - 6, h - 6);
  // Face outline.
  g.strokeStyle = "rgba(170,240,255,0.95)"; g.lineWidth = 2;
  g.beginPath(); g.ellipse(w / 2, 50, 20, 25, 0, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(w / 2, 108, 34, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
  g.fillStyle = "rgba(170,240,255,0.95)"; g.fillRect(w / 2 - 9, 46, 4, 3); g.fillRect(w / 2 + 5, 46, 4, 3);
  for (let y = 0; y < h; y += 4) { g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(0, y, w, 1); } // scanlines
  g.fillStyle = "#bff6ff"; g.font = "bold 11px system-ui, sans-serif"; g.textAlign = "center";
  g.fillText(name, w / 2, 98);
  g.fillStyle = "rgba(191,246,255,0.75)"; g.font = "9px system-ui, sans-serif";
  g.fillText(`RISK ${(37 + i * 17) % 90}%  ·  PRED ${(71 + i * 7) % 30 + 70}%`, w / 2, 114);
  for (let k = 0; k < 4; k++) { g.fillStyle = "rgba(95,227,255,0.6)"; g.fillRect(16, 124 + k * 7, 40 + ((k + i) * 19) % 56, 3); }
  g.fillStyle = "#ff6b78"; g.font = "bold 9px system-ui, sans-serif"; g.fillText("EYES ONLY", w / 2, h - 8);
}

// ---------- Floor: midnight carpet, black-marble borders with gold inlay ----------

function paintFloor(g, layout, rnd) {
  const { rows, cols } = layout;
  const W = cols * PX, H = rows * PX;
  const isWall = new Set(layout.walls.map((w) => `${w.r},${w.c}`));
  const wallAt = (r, c) => isWall.has(`${r},${c}`);

  // Carpet with a faint art-deco fan pattern.
  g.fillStyle = "#151a2a"; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 2200; i++) { g.fillStyle = `rgba(${rnd() < 0.3 ? "255,255,255" : "0,0,0"},0.02)`; g.fillRect(rnd() * W, rnd() * H, 3, 3); }
  g.strokeStyle = "rgba(201,168,92,0.09)"; g.lineWidth = 1.5;
  const F = PX * 0.5;
  for (let y = 0, row = 0; y < H + F; y += F / 2, row++) {
    for (let x = (row % 2) * F / 2; x < W + F; x += F) {
      for (const r of [F * 0.5, F * 0.32, F * 0.14]) { g.beginPath(); g.arc(x, y, r, Math.PI, Math.PI * 2); g.stroke(); }
    }
  }

  // Warm downlight pools.
  g.globalCompositeOperation = "lighter";
  for (let r = 1; r < rows; r += 3) {
    for (let c = 1; c < cols; c += 3) {
      const x = (c + 0.5) * PX, y = (r + 0.5) * PX, radius = PX * 1.4;
      const grad = g.createRadialGradient(x, y, 0, x, y, radius);
      grad.addColorStop(0, "rgba(255,214,160,0.14)");
      grad.addColorStop(1, "rgba(255,214,160,0)");
      g.fillStyle = grad; g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  }
  g.globalCompositeOperation = "source-over";

  // Black-marble border along every wall, with a gold inlay line.
  const b = PX * 0.14;
  for (const f of layout.floorTiles) {
    const x = f.c * PX, y = f.r * PX;
    const sides = [
      [wallAt(f.r - 1, f.c), x, y, PX, b, x, y + b - 3, PX, 2],
      [wallAt(f.r + 1, f.c), x, y + PX - b, PX, b, x, y + PX - b + 1, PX, 2],
      [wallAt(f.r, f.c - 1), x, y, b, PX, x + b - 3, y, 2, PX],
      [wallAt(f.r, f.c + 1), x + PX - b, y, b, PX, x + PX - b + 1, y, 2, PX],
    ];
    for (const [on, mx, my, mw, mh, gx, gy, gw, gh] of sides) {
      if (!on) continue;
      marble(g, mx, my, mw, mh, rnd, { veins: 1 });
      g.fillStyle = "rgba(201,168,92,0.85)"; g.fillRect(gx, gy, gw, gh);
    }
  }
  paintWallShadows(g, layout, PX, { steps: 6, alpha: 0.09, spread: 3 });

  // The evidence drives sit in brass-ringed secure ports.
  for (const k of layout.keys) {
    const x = (k.c + 0.5) * PX, y = (k.r + 0.5) * PX;
    g.strokeStyle = GOLD; g.lineWidth = 4; g.beginPath(); g.arc(x, y, PX * 0.38, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = "rgba(201,168,92,0.5)"; g.lineWidth = 2; g.beginPath(); g.arc(x, y, PX * 0.3, 0, Math.PI * 2); g.stroke();
    g.fillStyle = "rgba(201,168,92,0.9)"; g.font = `bold ${Math.round(PX * 0.1)}px Georgia, serif`; g.textAlign = "center";
    g.fillText("EYES ONLY", x, y + PX * 0.47);
  }
  // The security drone's dock.
  g.font = `bold ${Math.round(PX * 0.11)}px system-ui, sans-serif`;
  for (const s of layout.ghostStarts) {
    if (s.role !== "drone") continue;
    const x = (s.c + 0.5) * PX, y = (s.r + 0.5) * PX;
    g.strokeStyle = "rgba(255,176,32,0.8)"; g.lineWidth = 3; g.setLineDash([8, 6]);
    g.beginPath(); g.arc(x, y, PX * 0.4, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    g.fillStyle = "rgba(255,176,32,0.9)"; g.textAlign = "center"; g.fillText("SECURITY DOCK", x, (s.r + 1) * PX - 6);
  }
  // The way out: the executives' private lift, brass doors.
  for (const e of layout.exits) {
    const x = e.c * PX, y = e.r * PX;
    const grad = g.createLinearGradient(x, 0, x + PX, 0);
    grad.addColorStop(0, "#8a6d33"); grad.addColorStop(0.5, GOLD_L); grad.addColorStop(1, "#8a6d33");
    g.fillStyle = grad; g.fillRect(x, y, PX, PX);
    g.fillStyle = "#3a2c10"; g.fillRect(x + PX / 2 - 1, y, 2, PX);
  }
}

// ---------- Backdrop: floor-to-ceiling windows, the city at night, rain on the glass ----------
function paintBackdrop(g, w, h) {
  const rnd = seededRandom(88);
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#05070d"); sky.addColorStop(0.55, "#0d1424"); sky.addColorStop(1, "#1a1626");
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  // Skyline: towers with lit windows, a few with red aircraft lights.
  for (let i = 0; i < 46; i++) {
    const bw = 30 + rnd() * 70, bh = h * (0.18 + rnd() * 0.5), x = rnd() * w, y = h - bh;
    g.fillStyle = `rgb(${12 + rnd() * 10},${15 + rnd() * 10},${26 + rnd() * 12})`;
    g.fillRect(x, y, bw, bh);
    for (let wy = y + 6; wy < h - 4; wy += 8) for (let wx = x + 4; wx < x + bw - 4; wx += 7) {
      if (rnd() < 0.32) { g.fillStyle = rnd() < 0.8 ? "rgba(255,214,150,0.55)" : "rgba(150,210,255,0.5)"; g.fillRect(wx, wy, 3, 3); }
    }
    if (rnd() < 0.25) { g.fillStyle = "#ff3b4a"; g.fillRect(x + bw / 2, y - 3, 3, 3); }
  }
  // City haze.
  const haze = g.createLinearGradient(0, h * 0.5, 0, h);
  haze.addColorStop(0, "rgba(120,90,160,0)"); haze.addColorStop(1, "rgba(120,90,160,0.22)");
  g.fillStyle = haze; g.fillRect(0, 0, w, h);
  // Rain running down the glass.
  for (let i = 0; i < 420; i++) {
    const x = rnd() * w, y = rnd() * h, len = 6 + rnd() * 26;
    g.strokeStyle = `rgba(200,220,255,${0.05 + rnd() * 0.12})`; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + len * 0.12, y + len); g.stroke();
  }
  for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(220,235,255,${0.12 + rnd() * 0.2})`; g.beginPath(); g.arc(rnd() * w, rnd() * h, 0.8 + rnd() * 1.6, 0, Math.PI * 2); g.fill(); }
  // Window mullions, a ceiling band with linear lights, and the reflection of the room's warm light.
  g.fillStyle = "#07080b";
  for (let x = 0; x < w; x += 182) g.fillRect(x, 0, 10, h);
  g.fillRect(0, 0, w, 26);
  for (let x = 30; x < w; x += 182) { g.fillStyle = "rgba(255,226,180,0.8)"; g.fillRect(x, 10, 120, 3); }
  const warm = g.createRadialGradient(w * 0.55, h * 0.95, 20, w * 0.55, h * 0.95, w * 0.6);
  warm.addColorStop(0, "rgba(255,190,120,0.12)"); warm.addColorStop(1, "rgba(255,190,120,0)");
  g.fillStyle = warm; g.fillRect(0, 0, w, h);
  g.fillStyle = "rgba(201,168,92,0.08)"; g.font = "600 64px Georgia, serif"; g.textAlign = "center";
  g.fillText("CLEARPATH", w / 2, h * 0.28);
}

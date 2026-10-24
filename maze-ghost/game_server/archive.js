// archive.js — Level 5's look: the Archive, the records room where Clearpath keeps a file on everyone
// it has ever predicted. Tall wooden shelves packed with binders and banker's boxes (each labelled with
// a name), green banker's lamps on the shelf tops, warm lamplight pooling on a worn parquet floor
// scattered with loose papers, and dust drifting in the light. The two evidence drives are hidden here.
// three-view.js picks this up when a level's theme has `style: "archive"`.
//
// Built like the other looks: light is painted into the floor (no shadow maps), shelves are two merged
// meshes, the lamps' glow is an emissive texture plus floor decals, and the dust is one Points object.

import { backdrop, canvasTexture, exitSigns, floorDecal, paintWallShadows, seededRandom, wallGeometry } from "./art-kit.js";

const PX = 80; // floor texture pixels per tile
const SIDE_CELLS = 5; // 4 shelf fronts + the plain end panel
const TOP_CELLS = 3; // papers, box lids, a green banker's lamp
const LAMP = 2;
const SPINES = ["#7a2e2a", "#a8742c", "#55663a", "#2e4560", "#c9b27a", "#6b4a6e", "#8c3d1f", "#3f5a52", "#d8c9a0"];
const NAMES = ["ADAMS", "BAKER", "CHEN", "DIAZ", "EVANS", "FOX", "GARCIA", "HALL", "IBRAHIM", "JONES", "KIM", "LOPEZ", "MAYA", "NGUYEN", "OKAFOR", "PATEL", "REYES", "SAM", "TANAKA", "VOSS"];

/**
 * @returns {{ group, walls, floorMaterial, shadows: false, background, fogColor, update(time: number): boolean, dispose(): void }}
 */
export function buildArchive(THREE, layout, { still = false } = {}) {
  const rnd = seededRandom(5);
  const t = layout.theme;
  const c = layout.floor.position;
  const group = new THREE.Group();
  const disposables = [];

  // ---------- Light: warm and low, like an old reading room ----------
  group.add(new THREE.HemisphereLight(0xffe7bf, 0x1c120a, 1.5 * t.light));
  const key = new THREE.DirectionalLight(0xffe2b8, 1.2 * t.light);
  key.position.set(c.x - 5, 11, c.z + 6);
  key.target.position.set(c.x, 0, c.z);
  group.add(key, key.target);

  // ---------- Shelves ----------
  const faceH = Math.round((256 * t.wallHeight) / layout.tileSize);
  const sideMap = canvasTexture(THREE, 256 * SIDE_CELLS, (g, w, h) => paintShelves(g, h, rnd), { height: faceH, wrap: false });
  const sideMaterial = new THREE.MeshLambertMaterial({ map: sideMap });
  const topMap = canvasTexture(THREE, 256 * TOP_CELLS, (g, w, h) => paintTops(g, h, rnd), { height: 256, wrap: false });
  const topGlow = canvasTexture(THREE, 256 * TOP_CELLS, (g, w, h) => paintTopGlow(g, h), { height: 256, wrap: false });
  const topMaterial = new THREE.MeshLambertMaterial({ map: topMap, emissive: 0xffffff, emissiveMap: topGlow, emissiveIntensity: 1 });

  // A lamp every few shelves, spread out so the light pools don't merge.
  const lamps = [];
  const geo = wallGeometry(THREE, layout, {
    sideCells: SIDE_CELLS, topCells: TOP_CELLS,
    pickSide: (r, col, f) => (f.end ? SIDE_CELLS - 1 : Math.floor(rnd() * (SIDE_CELLS - 1))),
    pickTop: (r, col) => {
      const interior = r > 0 && col > 0 && r < layout.rows - 1 && col < layout.cols - 1;
      if (interior && rnd() < 0.16 && lamps.every((l) => Math.abs(l.r - r) + Math.abs(l.c - col) > 3)) { lamps.push({ r, c: col }); return LAMP; }
      return rnd() < 0.5 ? 0 : 1;
    },
  });
  const walls = new THREE.Group();
  walls.add(new THREE.Mesh(geo.sides, sideMaterial), new THREE.Mesh(geo.tops, topMaterial));

  // ---------- Floor: worn parquet, lamp pools, loose papers ----------
  const floorMap = canvasTexture(THREE, layout.cols * PX, (g) => paintFloor(g, layout, rnd, lamps), { height: layout.rows * PX, wrap: false });
  const floorMaterial = new THREE.MeshBasicMaterial({ map: floorMap });

  // ---------- Props ----------
  for (const sign of exitSigns(THREE, layout, t.wallHeight + 0.45)) group.add(sign);

  // Each lamp: a green glass shade glowing over its shelf, and a warm glow on the floor around it.
  const shadeMaterial = new THREE.MeshBasicMaterial({ color: 0x3fb36a });
  for (const l of lamps) {
    const x = l.c * layout.tileSize, z = l.r * layout.tileSize;
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.22, 0.14, 12, 1, true), shadeMaterial);
    shade.position.set(x, t.wallHeight + 0.32, z);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6), new THREE.MeshLambertMaterial({ color: 0xb8913c }));
    stem.position.set(x, t.wallHeight + 0.15, z);
    const glow = floorDecal(THREE, { color: 0xffc977, size: 1.3, opacity: 0.55, y: 0 });
    glow.position.set(x, t.wallHeight + 0.02, z);
    group.add(shade, stem, glow);
  }

  // Dust motes drifting in the lamplight.
  const DUST = 260;
  const dustPos = new Float32Array(DUST * 3);
  const dustSeed = new Float32Array(DUST);
  for (let i = 0; i < DUST; i++) {
    dustPos[i * 3] = rnd() * layout.floor.size.x - 0.5;
    dustPos[i * 3 + 1] = 0.2 + rnd() * (t.wallHeight + 0.8);
    dustPos[i * 3 + 2] = rnd() * layout.floor.size.z - 0.5;
    dustSeed[i] = rnd() * 100;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0xffe2b0, size: 0.05, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  group.add(dust);
  const base = dustPos.slice();

  // ---------- Background: more stacks fading into the dark, lit by distant lamps ----------
  const background = backdrop(THREE, paintBackdrop);
  disposables.push(background);

  function update(time) {
    if (still) return false;
    for (let i = 0; i < DUST; i++) {
      const s = dustSeed[i];
      dustPos[i * 3] = base[i * 3] + Math.sin(time * 0.15 + s) * 0.25;
      dustPos[i * 3 + 1] = base[i * 3 + 1] + Math.sin(time * 0.22 + s * 1.7) * 0.12;
      dustPos[i * 3 + 2] = base[i * 3 + 2] + Math.cos(time * 0.12 + s) * 0.25;
    }
    dustGeo.attributes.position.needsUpdate = true;
    topMaterial.emissiveIntensity = 0.95 + Math.sin(time * 3.1) * 0.03 + Math.sin(time * 7.3) * 0.02; // a faint lamp flicker
    return false;
  }

  return {
    group, walls, floorMaterial, shadows: false, background, fogColor: "#140d08", update,
    dispose() { for (const d of disposables) d.dispose(); },
  };
}

// ---------- Canvas painting ----------

// Shelf fronts: a dark oak frame with four shelves of binders and labelled banker's boxes.
function paintShelves(g, h, rnd) {
  const s = 256;
  for (let i = 0; i < SIDE_CELLS; i++) {
    const x0 = i * s;
    g.fillStyle = "#3a2516"; // oak
    g.fillRect(x0, 0, s, h);
    g.fillStyle = "rgba(255,220,170,0.05)";
    for (let y = 0; y < h; y += 5) g.fillRect(x0, y, s, 2);
    if (i === SIDE_CELLS - 1) { // end panel: a brass label holder with the drawer range
      g.fillStyle = "#4a3020";
      g.fillRect(x0 + 14, 14, s - 28, h - 28);
      g.fillStyle = "#b8913c";
      g.fillRect(x0 + s / 2 - 50, h * 0.3, 100, 44);
      g.fillStyle = "#f3e9cf";
      g.fillRect(x0 + s / 2 - 44, h * 0.3 + 6, 88, 32);
      g.fillStyle = "#2a1c12";
      g.font = "bold 24px 'Courier New', monospace";
      g.textAlign = "center";
      const a = NAMES[Math.floor(rnd() * NAMES.length)][0];
      g.fillText(`${a} – ${String.fromCharCode(Math.min(90, a.charCodeAt(0) + 3))}`, x0 + s / 2, h * 0.3 + 30);
      continue;
    }
    const shelves = 4, sh = (h - 16) / shelves;
    for (let k = 0; k < shelves; k++) {
      const y0 = 8 + k * sh;
      g.fillStyle = "#170e08"; // the dark back of the shelf
      g.fillRect(x0 + 10, y0, s - 20, sh - 8);
      let x = x0 + 12;
      while (x < x0 + s - 16) {
        if (rnd() < 0.22) { // a banker's box with a name label
          const bw = 52 + rnd() * 18;
          if (x + bw > x0 + s - 12) break;
          g.fillStyle = "#c8a874";
          g.fillRect(x, y0 + 6, bw, sh - 14);
          g.fillStyle = "#f3e9cf";
          g.fillRect(x + 8, y0 + sh * 0.35, bw - 16, 16);
          g.fillStyle = "#3a2a1a";
          g.font = "bold 11px 'Courier New', monospace";
          g.textAlign = "center";
          g.fillText(NAMES[Math.floor(rnd() * NAMES.length)], x + bw / 2, y0 + sh * 0.35 + 12);
          x += bw + 3;
        } else { // a binder spine
          const bw = 10 + rnd() * 10;
          g.fillStyle = SPINES[Math.floor(rnd() * SPINES.length)];
          const top = y0 + 2 + rnd() * 10;
          g.fillRect(x, top, bw, y0 + sh - 8 - top);
          g.fillStyle = "rgba(255,255,255,0.35)"; // spine label
          g.fillRect(x + 2, top + (y0 + sh - top) * 0.3, bw - 4, 8);
          x += bw + 1;
        }
      }
      g.fillStyle = "#5a3b24"; // shelf board
      g.fillRect(x0 + 6, y0 + sh - 8, s - 12, 8);
    }
  }
}

// Tops: stacks of papers, box lids, and (cell 2) a green banker's lamp.
function paintTops(g, s, rnd) {
  for (let i = 0; i < TOP_CELLS; i++) {
    const x0 = i * s;
    g.fillStyle = "#4a3020";
    g.fillRect(x0, 0, s, s);
    g.fillStyle = "rgba(255,220,170,0.06)";
    for (let y = 4; y < s; y += 9) g.fillRect(x0, y, s, 3);
    if (i === 0) { // a neat stack of folders and one loose sheet on the oak top
      g.fillStyle = "#3a2516";
      g.fillRect(x0 + 6, 6, s - 12, s - 12);
      for (let k = 0; k < 4; k++) { // stacked folders, slightly offset
        g.fillStyle = ["#c9a96a", "#b88f52", "#d8bf86", "#a8742c"][k];
        g.fillRect(x0 + 52 + k * 4, 60 - k * 5, 120, 86);
      }
      g.save();
      g.translate(x0 + 170, 176);
      g.rotate(0.35);
      g.fillStyle = "#efe6cf";
      g.fillRect(-30, -22, 60, 44);
      g.fillStyle = "rgba(60,40,20,0.35)";
      for (let y = -14; y < 16; y += 7) g.fillRect(-22, y, 40, 2);
      g.restore();
    } else if (i === 1) { // box lids
      for (const [bx, by] of [[18, 18], [132, 30], [40, 136], [140, 142]]) {
        g.fillStyle = "#c8a874"; g.fillRect(x0 + bx, by, 96, 96);
        g.strokeStyle = "#8f7246"; g.lineWidth = 4; g.strokeRect(x0 + bx + 6, by + 6, 84, 84);
      }
    } else { // lamp: brass base and green shade, seen from above
      g.fillStyle = "#b8913c";
      g.beginPath(); g.arc(x0 + s / 2, s / 2, 40, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#2f8f55";
      g.beginPath(); g.ellipse(x0 + s / 2, s / 2, 92, 52, 0, 0, Math.PI * 2); g.fill();
    }
  }
}

function paintTopGlow(g, s) {
  g.fillStyle = "#000";
  g.fillRect(0, 0, s * TOP_CELLS, s);
  const cx = LAMP * s + s / 2, cy = s / 2;
  const grad = g.createRadialGradient(cx, cy, 10, cx, cy, s * 0.6);
  grad.addColorStop(0, "rgba(255,226,150,1)");
  grad.addColorStop(0.45, "rgba(255,190,90,0.6)");
  grad.addColorStop(1, "rgba(255,190,90,0)");
  g.fillStyle = grad;
  g.fillRect(LAMP * s, 0, s, s);
  g.fillStyle = "rgba(90,230,140,0.75)"; // the green shade glows too
  g.beginPath(); g.ellipse(cx, cy, 90, 50, 0, 0, Math.PI * 2); g.fill();
}

function paintFloor(g, layout, rnd, lamps) {
  const { rows, cols } = layout;
  // Herringbone-ish parquet: short planks, alternating direction per half tile.
  const P = PX / 2;
  for (let r = 0; r < rows * 2; r++) {
    for (let c = 0; c < cols * 2; c++) {
      const x = c * P, y = r * P, l = 20 + rnd() * 6;
      const horizontal = (r + c) % 2 === 0;
      for (let k = 0; k < 4; k++) {
        g.fillStyle = `hsl(${26 + rnd() * 6}, ${38 + rnd() * 10}%, ${l - 3 + rnd() * 6}%)`;
        if (horizontal) g.fillRect(x, y + k * (P / 4), P, P / 4 - 1);
        else g.fillRect(x + k * (P / 4), y, P / 4 - 1, P);
      }
    }
  }
  // A darker, worn runner rug down the middle row of the room.
  g.fillStyle = "rgba(90,20,18,0.35)";
  const mid = Math.floor(rows / 2);
  g.fillRect(PX, mid * PX + PX * 0.15, (cols - 2) * PX, PX * 0.7);
  // Warm pools of light under each lamp and dim light everywhere else.
  g.fillStyle = "rgba(10,5,0,0.35)";
  g.fillRect(0, 0, cols * PX, rows * PX);
  g.globalCompositeOperation = "lighter";
  for (const l of lamps) {
    const x = (l.c + 0.5) * PX, y = (l.r + 0.5) * PX, radius = PX * 2.4;
    const grad = g.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0, "rgba(255,200,120,0.32)");
    grad.addColorStop(1, "rgba(255,200,120,0)");
    g.fillStyle = grad;
    g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  g.globalCompositeOperation = "source-over";
  paintWallShadows(g, layout, PX, { steps: 7, alpha: 0.08 });
  // Loose papers dropped on the floor.
  const isWall = new Set(layout.walls.map((w) => `${w.r},${w.c}`));
  for (let k = 0; k < Math.round(rows * cols * 0.18); k++) {
    const r = Math.floor(rnd() * rows), c = Math.floor(rnd() * cols);
    if (isWall.has(`${r},${c}`)) continue;
    g.save();
    g.translate((c + 0.2 + rnd() * 0.6) * PX, (r + 0.2 + rnd() * 0.6) * PX);
    g.rotate(rnd() * Math.PI);
    g.fillStyle = "rgba(242,234,214,0.85)";
    g.fillRect(-9, -12, 18, 24);
    g.fillStyle = "rgba(60,40,20,0.4)";
    for (let y = -8; y < 10; y += 4) g.fillRect(-6, y, 12, 1);
    g.restore();
  }
  // The way out: a brass threshold plate with "RECORDS ROOM" stencilled on it.
  for (const e of layout.exits) {
    g.fillStyle = "#8f7232";
    g.fillRect(e.c * PX + 4, e.r * PX + 4, PX - 8, PX - 8);
    g.strokeStyle = "#d8b85a";
    g.lineWidth = 3;
    g.strokeRect(e.c * PX + 8, e.r * PX + 8, PX - 16, PX - 16);
  }
}

// The backdrop: rows of shelves receding into darkness, a few lamps glowing far away.
function paintBackdrop(g, w, h) {
  const rnd = seededRandom(55);
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#0c0704");
  grad.addColorStop(0.5, "#22150c");
  grad.addColorStop(1, "#0a0603");
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  for (let layer = 0; layer < 3; layer++) { // silhouettes of shelving, nearer = darker and taller
    const top = h * (0.18 + layer * 0.12), alpha = 0.25 + layer * 0.2;
    for (let x = -20; x < w; x += 60 + layer * 30) {
      const sw = 40 + layer * 20 + rnd() * 20;
      g.fillStyle = `rgba(8,4,2,${alpha})`;
      g.fillRect(x, top + rnd() * 20, sw, h);
      g.fillStyle = `rgba(160,110,60,${0.05 + layer * 0.03})`; // shelf lines catching the light
      for (let y = top + 30; y < h; y += 36) g.fillRect(x, y, sw, 2);
    }
  }
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 9; i++) { // distant lamps
    const x = rnd() * w, y = h * (0.25 + rnd() * 0.4), r = 40 + rnd() * 60;
    const lamp = g.createRadialGradient(x, y, 0, x, y, r);
    lamp.addColorStop(0, "rgba(255,200,120,0.35)");
    lamp.addColorStop(0.2, "rgba(120,230,150,0.12)");
    lamp.addColorStop(1, "rgba(255,200,120,0)");
    g.fillStyle = lamp;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 200; i++) { // dust
    g.fillStyle = `rgba(255,226,176,${0.1 + rnd() * 0.3})`;
    g.fillRect(rnd() * w, rnd() * h, 1.5, 1.5);
  }
  g.globalCompositeOperation = "source-over";
}

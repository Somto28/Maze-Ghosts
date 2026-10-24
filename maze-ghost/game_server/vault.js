// vault.js — Level 4's look: the Data Vault, Clearpath's cold-storage vault deep under the tower,
// where every piece of data the company has collected is kept. A clean, high-tech sci-fi vault:
// frosted steel data monoliths with glowing teal seams (data visibly streams up them), glowing
// hexagonal cooling ports on top, holographic data cubes hovering over the stacks, a polished black
// floor with a teal hex grid and cold mist, and a giant circular vault door at the way out.
// three-view.js picks this up when a level's theme has `style: "vault"`.
//
// Built to stay fast on school Chromebooks like the other looks: lighting and reflections are painted
// into the floor once (no shadow maps), all the monoliths are two merged meshes, and the "data stream"
// is one emissive texture whose offset scrolls (no per-frame geometry work).

import { backdrop, canvasTexture, exitSigns, floorDecal, paintWallShadows, seededRandom, wallGeometry } from "./art-kit.js";

const PX = 80; // floor texture pixels per tile
const SIDE_CELLS = 4; // monolith face variants (the last one is the plain end panel)
const TOP_CELLS = 2; // hexagonal cooling port, sealed lid

/**
 * @returns {{ group, walls, floorMaterial, shadows: false, background, fogColor, update(time: number): boolean, dispose(): void }}
 */
export function buildVault(THREE, layout, { still = false } = {}) {
  const rnd = seededRandom(4);
  const t = layout.theme;
  const c = layout.floor.position;
  const group = new THREE.Group();
  const disposables = [];

  // ---------- Light: cold, clean and bright (it's a clean room) ----------
  group.add(new THREE.HemisphereLight(0xdff6ff, 0x08131c, 1.6 * t.light));
  const key = new THREE.DirectionalLight(0xe8fbff, 1.3 * t.light);
  key.position.set(c.x + 4, 12, c.z + 8);
  key.target.position.set(c.x, 0, c.z);
  group.add(key, key.target);

  // ---------- Monoliths ----------
  const faceH = Math.round((256 * t.wallHeight) / layout.tileSize);
  const sideMap = canvasTexture(THREE, 256 * SIDE_CELLS, (g, w, h) => paintFaces(g, h, rnd), { height: faceH, wrap: false });
  // Emissive: the light seams. Painted once, then its offset scrolls upward = data streaming up.
  const seams = canvasTexture(THREE, 256 * SIDE_CELLS, (g, w, h) => paintSeams(g, h), { height: 256 });
  seams.wrapS = THREE.ClampToEdgeWrapping;
  const sideMaterial = new THREE.MeshLambertMaterial({ map: sideMap, emissive: 0xffffff, emissiveMap: seams, emissiveIntensity: 1.2 });
  const topMap = canvasTexture(THREE, 256 * TOP_CELLS, (g, w, h) => paintTops(g, h), { height: 256, wrap: false });
  const topGlow = canvasTexture(THREE, 256 * TOP_CELLS, (g, w, h) => paintTopGlow(g, h), { height: 256, wrap: false });
  const topMaterial = new THREE.MeshLambertMaterial({ map: topMap, emissive: 0xffffff, emissiveMap: topGlow, emissiveIntensity: 1.1 });

  const geo = wallGeometry(THREE, layout, {
    sideCells: SIDE_CELLS, topCells: TOP_CELLS,
    pickSide: (r, col, f) => (f.end ? SIDE_CELLS - 1 : Math.floor(rnd() * (SIDE_CELLS - 1))),
    pickTop: () => (rnd() < 0.55 ? 0 : 1),
  });
  const walls = new THREE.Group();
  walls.add(new THREE.Mesh(geo.sides, sideMaterial), new THREE.Mesh(geo.tops, topMaterial));

  // ---------- Floor: polished black tiles, teal hex grid, painted reflections ----------
  const floorMap = canvasTexture(THREE, layout.cols * PX, (g) => paintFloor(g, layout, rnd), { height: layout.rows * PX, wrap: false });
  const floorMaterial = new THREE.MeshBasicMaterial({ map: floorMap });

  // ---------- Props ----------
  for (const sign of exitSigns(THREE, layout, t.wallHeight + 0.45)) group.add(sign);

  // Holographic data cubes hovering over some of the stacks.
  const cubeSpots = layout.walls.filter(() => rnd() < 0.12).slice(0, 18);
  const cubeMaterial = new THREE.MeshBasicMaterial({ color: 0x5ff6ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const cubes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), cubeMaterial, Math.max(1, cubeSpots.length));
  cubes.count = cubeSpots.length;
  const cubeEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(0.34, 0.34, 0.34)),
    new THREE.LineBasicMaterial({ color: 0xbff6ff, transparent: true, opacity: 0.8 }),
  );
  const edgeSet = cubeSpots.map(() => cubeEdges.clone());
  edgeSet.forEach((e) => group.add(e));
  group.add(cubes);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), at = new THREE.Vector3();
  const placeCubes = (time) => {
    cubeSpots.forEach((w, i) => {
      at.set(w.position.x, t.wallHeight + 0.45 + Math.sin(time * 1.4 + i) * 0.06, w.position.z);
      e.set(time * 0.7 + i, time * 0.9 + i * 0.5, 0);
      q.setFromEuler(e);
      cubes.setMatrixAt(i, m4.compose(at, q, one));
      edgeSet[i].position.copy(at);
      edgeSet[i].quaternion.copy(q);
    });
    cubes.instanceMatrix.needsUpdate = true;
  };
  placeCubes(0);

  // Cold mist pooling on the floor in a few places.
  for (let i = 0; i < 6; i++) {
    const f = layout.floorTiles[Math.floor(rnd() * layout.floorTiles.length)];
    const mist = floorDecal(THREE, { color: 0x9fe9ff, size: 3.2 + rnd() * 2, opacity: 0.16, y: 0.03 });
    mist.position.set(f.position.x, 0.03, f.position.z);
    group.add(mist);
  }

  // Teal light ring around the vault door at each exit.
  for (const ex of layout.exits) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.7, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x2ff3e0, transparent: true, opacity: 0.85 }),
    );
    ring.position.set(ex.position.x, 0.045, ex.position.z);
    group.add(ring);
  }

  // ---------- Background: the vault hall stretching off into cold darkness ----------
  const background = backdrop(THREE, paintBackdrop);
  disposables.push(background);

  // ---------- Animation: data streams up the seams; cubes turn and bob ----------
  function update(time) {
    if (still) return false;
    seams.offset.y = -time * 0.35;
    topMaterial.emissiveIntensity = 1.0 + Math.sin(time * 2.2) * 0.15;
    placeCubes(time);
    return false;
  }

  return {
    group, walls, floorMaterial, shadows: false, background, fogColor: "#061019", update,
    dispose() { for (const d of disposables) d.dispose(); },
  };
}

// ---------- Canvas painting ----------

// Monolith faces: frosted brushed steel, a recessed storage-blade bay, status pips and a stencil.
function paintFaces(g, h, rnd) {
  const s = 256;
  for (let i = 0; i < SIDE_CELLS; i++) {
    const x0 = i * s;
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#c9d6df");
    grad.addColorStop(0.5, "#a7b7c3");
    grad.addColorStop(1, "#6f818f");
    g.fillStyle = grad;
    g.fillRect(x0, 0, s, h);
    g.fillStyle = "rgba(255,255,255,0.06)"; // brushed lines
    for (let y = 0; y < h; y += 3) g.fillRect(x0, y, s, 1);
    if (i === SIDE_CELLS - 1) { // end panel: a plain plate with a vault stencil
      g.fillStyle = "#33414d";
      g.fillRect(x0 + 18, 16, s - 36, h - 32);
      g.fillStyle = "#c9d6df";
      g.font = "bold 34px system-ui, sans-serif";
      g.textAlign = "center";
      g.fillText("V-07", x0 + s / 2, h * 0.35);
      g.fillStyle = "#e8a32a"; // hazard band
      for (let k = 0; k < s - 36; k += 18) g.fillRect(x0 + 18 + k, h - 46, 9, 12);
      continue;
    }
    // Recessed bay of storage blades.
    g.fillStyle = "#111a22";
    g.fillRect(x0 + 22, 22, s - 44, h - 60);
    const blades = 6 + i * 2;
    const bw = (s - 52) / blades;
    for (let b = 0; b < blades; b++) {
      g.fillStyle = b % 2 ? "#1d2a35" : "#22313d";
      g.fillRect(x0 + 26 + b * bw, 26, bw - 3, h - 68);
      // A tiny status pip at the top of each blade (lit ones glow in the emissive map).
      g.fillStyle = rnd() < 0.8 ? "#2ff3e0" : "#ff4d6d";
      g.fillRect(x0 + 26 + b * bw + bw / 2 - 3, 32, 6, 6);
    }
    // Kick plate.
    g.fillStyle = "#2a3540";
    g.fillRect(x0, h - 30, s, 30);
    g.fillStyle = "#e8a32a";
    g.fillRect(x0, h - 30, s, 3);
  }
}

// Emissive seams: two bright vertical channels per face with brighter "packets" (scroll = data flows).
function paintSeams(g, h) {
  const s = 256;
  g.fillStyle = "#000";
  g.fillRect(0, 0, s * SIDE_CELLS, h);
  for (let i = 0; i < SIDE_CELLS; i++) {
    const x0 = i * s;
    for (const sx of [10, s - 16]) {
      g.fillStyle = "rgba(47,243,224,0.45)";
      g.fillRect(x0 + sx, 0, 6, h);
      for (let k = 0; k < 4; k++) { // data packets
        const y = ((k * 67 + i * 31 + sx) % h);
        const grad = g.createLinearGradient(0, y, 0, y + 40);
        grad.addColorStop(0, "rgba(220,255,252,0)");
        grad.addColorStop(1, "rgba(220,255,252,1)");
        g.fillStyle = grad;
        g.fillRect(x0 + sx - 1, y, 8, 40);
      }
    }
  }
}

// Tops: a hexagonal cooling port (with a fan) or a sealed lid with a data-core sigil.
function paintTops(g, s) {
  for (let i = 0; i < TOP_CELLS; i++) {
    const x0 = i * s, cx = x0 + s / 2, cy = s / 2;
    g.fillStyle = "#b8c7d2";
    g.fillRect(x0, 0, s, s);
    g.fillStyle = "#8d9eab";
    g.fillRect(x0 + 10, 10, s - 20, s - 20);
    if (i === 0) {
      hexPath(g, cx, cy, 86);
      g.fillStyle = "#0d151c";
      g.fill();
      g.strokeStyle = "#dfe9ef";
      g.lineWidth = 6;
      g.stroke();
      g.strokeStyle = "#2a3946"; // fan blades
      g.lineWidth = 10;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(a) * 62, cy + Math.sin(a) * 62);
        g.stroke();
      }
    } else {
      g.fillStyle = "#6f818f";
      for (let k = 0; k < 4; k++) g.fillRect(x0 + 24 + k * 54, 24, 30, 8); // vents
      hexPath(g, cx, cy + 10, 46);
      g.strokeStyle = "#33414d";
      g.lineWidth = 8;
      g.stroke();
    }
  }
}

function paintTopGlow(g, s) {
  g.fillStyle = "#000";
  g.fillRect(0, 0, s * TOP_CELLS, s);
  // Cooling port: a teal glow inside the hex.
  const cx = s / 2, cy = s / 2;
  const grad = g.createRadialGradient(cx, cy, 6, cx, cy, 80);
  grad.addColorStop(0, "rgba(200,255,250,1)");
  grad.addColorStop(0.5, "rgba(47,243,224,0.65)");
  grad.addColorStop(1, "rgba(47,243,224,0)");
  hexPath(g, cx, cy, 80);
  g.fillStyle = grad;
  g.fill();
  // Lid: its sigil glows faintly.
  hexPath(g, s + s / 2, s / 2 + 10, 46);
  g.strokeStyle = "rgba(47,243,224,0.8)";
  g.lineWidth = 4;
  g.stroke();
}

function hexPath(g, cx, cy, r) {
  g.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    k ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath();
}

function paintFloor(g, layout, rnd) {
  const { rows, cols } = layout;
  const W = cols * PX, H = rows * PX;
  // Polished black-blue base with big square tiles.
  g.fillStyle = "#0a1219";
  g.fillRect(0, 0, W, H);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      g.fillStyle = `hsl(205, 30%, ${7 + rnd() * 2.5}%)`;
      g.fillRect(c * PX + 1, r * PX + 1, PX - 2, PX - 2);
    }
  }
  // Teal hexagon grid etched into the floor.
  g.strokeStyle = "rgba(47,243,224,0.13)";
  g.lineWidth = 1.5;
  const R = PX * 0.36, dx = R * Math.sqrt(3), dy = R * 1.5;
  for (let y = 0, row = 0; y < H + R; y += dy, row++) {
    for (let x = (row % 2) * (dx / 2); x < W + dx; x += dx) { hexPath(g, x, y, R); g.stroke(); }
  }
  // Painted reflections: soft bright streaks spilling from each monolith onto the floor.
  g.globalCompositeOperation = "lighter";
  const isWall = new Set(layout.walls.map((w) => `${w.r},${w.c}`));
  for (const { r, c } of layout.walls) {
    for (const [dr, dc] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      if (isWall.has(`${r + dr},${c + dc}`) || r + dr < 0 || c + dc < 0 || r + dr >= rows || c + dc >= cols) continue;
      const len = PX * 0.45;
      const x0 = dc > 0 ? (c + 1) * PX : c * PX, y0 = dr > 0 ? (r + 1) * PX : r * PX;
      const grad = dc ? g.createLinearGradient(x0, 0, x0 + dc * len, 0) : g.createLinearGradient(0, y0, 0, y0 + dr * len);
      grad.addColorStop(0, "rgba(47,243,224,0.22)");
      grad.addColorStop(1, "rgba(47,243,224,0)");
      g.fillStyle = grad;
      if (dc) g.fillRect(Math.min(x0, x0 + dc * len), r * PX + PX * 0.2, len, PX * 0.6);
      else g.fillRect(c * PX + PX * 0.2, Math.min(y0, y0 + dr * len), PX * 0.6, len);
    }
  }
  // Pools of cold white light from above.
  for (let r = 1; r < rows; r += 3) {
    for (let c = 1; c < cols; c += 3) {
      const x = (c + 0.5) * PX, y = (r + 0.5) * PX, radius = PX * 1.6;
      const grad = g.createRadialGradient(x, y, 0, x, y, radius);
      grad.addColorStop(0, "rgba(190,240,255,0.14)");
      grad.addColorStop(1, "rgba(190,240,255,0)");
      g.fillStyle = grad;
      g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  }
  g.globalCompositeOperation = "source-over";
  paintWallShadows(g, layout, PX, { steps: 6, alpha: 0.08 });

  // The vault door at each exit: concentric rings, locking bolts and a teal core.
  for (const e of layout.exits) {
    const x = (e.c + 0.5) * PX, y = (e.r + 0.5) * PX;
    g.save();
    g.beginPath();
    g.rect(e.c * PX, e.r * PX, PX, PX);
    g.clip();
    g.fillStyle = "#58666f";
    g.beginPath(); g.arc(x, y, PX * 0.48, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#c3d0d8"; g.lineWidth = 4;
    for (const rr of [0.46, 0.34, 0.2]) { g.beginPath(); g.arc(x, y, PX * rr, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = "#c3d0d8";
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; g.fillRect(x + Math.cos(a) * PX * 0.4 - 3, y + Math.sin(a) * PX * 0.4 - 3, 6, 6); }
    g.restore();
  }
  // "Authorised personnel" lettering next to the drone dock (the drone's start), if there is one.
  g.font = `bold ${Math.round(PX * 0.15)}px system-ui, sans-serif`;
  g.textAlign = "center";
  for (const s of layout.ghostStarts) {
    if (s.role !== "drone") continue;
    g.strokeStyle = "rgba(232,163,42,0.8)";
    g.lineWidth = 3;
    g.setLineDash([7, 5]);
    g.beginPath(); g.arc((s.c + 0.5) * PX, (s.r + 0.5) * PX, PX * 0.42, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
    g.fillStyle = "rgba(232,163,42,0.9)";
    g.fillText("DRONE DOCK", (s.c + 0.5) * PX, (s.r + 1) * PX - 6);
  }
}

// The backdrop: a deep teal-black hall, a faint hex lattice, distant columns of light and frost.
function paintBackdrop(g, w, h) {
  const grad = g.createRadialGradient(w * 0.55, h * 0.45, 40, w * 0.55, h * 0.5, w * 0.75);
  grad.addColorStop(0, "#0d2b33");
  grad.addColorStop(0.55, "#071820");
  grad.addColorStop(1, "#02070b");
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  // Distant data columns.
  const rnd = seededRandom(44);
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 26; i++) {
    const x = rnd() * w, cw = 6 + rnd() * 18, alpha = 0.05 + rnd() * 0.12;
    const col = g.createLinearGradient(0, 0, 0, h);
    col.addColorStop(0, "rgba(47,243,224,0)");
    col.addColorStop(0.5, `rgba(47,243,224,${alpha})`);
    col.addColorStop(1, "rgba(47,243,224,0)");
    g.fillStyle = col;
    g.fillRect(x, 0, cw, h);
  }
  // Floating motes of frost.
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(191,246,255,${0.15 + rnd() * 0.5})`;
    const r = rnd() * 1.8 + 0.4;
    g.beginPath(); g.arc(rnd() * w, rnd() * h, r, 0, Math.PI * 2); g.fill();
  }
  g.globalCompositeOperation = "source-over";
  // A faint hex lattice over everything.
  g.strokeStyle = "rgba(127,212,255,0.05)";
  g.lineWidth = 1;
  const R = 34, dx = R * Math.sqrt(3), dy = R * 1.5;
  for (let y = 0, row = 0; y < h + R; y += dy, row++) for (let x = (row % 2) * (dx / 2); x < w + dx; x += dx) { hexPath(g, x, y, R); g.stroke(); }
  // Frost creeping in from the corners.
  for (const [cx, cy] of [[0, 0], [w, 0], [0, h], [w, h]]) {
    const f = g.createRadialGradient(cx, cy, 0, cx, cy, w * 0.35);
    f.addColorStop(0, "rgba(220,250,255,0.10)");
    f.addColorStop(1, "rgba(220,250,255,0)");
    g.fillStyle = f;
    g.fillRect(0, 0, w, h);
  }
}

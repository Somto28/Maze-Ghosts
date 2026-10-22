// core.js — Level 3's look: the executive floor, where senior staff work and the company's
// AI wardens are field-tested. Glass-walled offices with desks, monitors and planters behind the
// glass, dark carpet under warm downlights, and violet "test zone" markings where the wardens start.
// three-view.js picks this up when a level's theme has `style: "core"`.
//
// Built like the server halls to stay fast: lighting is painted into the floor once (no shadow
// maps), the office furniture is one merged mesh, and the glass is one unlit, see-through mesh.
// The glass also means the tall walls on this level never hide you from the camera.

import { canvasTexture, exitSigns, seededRandom } from "./art-kit.js";

const PX = 80; // floor texture pixels per tile
const BASE = 0.55; // height of the furniture under the glass
const KINDS = ["desk", "desk", "planter", "cabinet", "terminal", "desk"]; // furniture tops (atlas cells)

/**
 * @returns {{ group, walls, floorMaterial, shadows: false, makeGhost(color): object, update(time: number): boolean }}
 */
export function buildCore(THREE, layout, { still = false } = {}) {
  const rnd = seededRandom(3);
  const t = layout.theme;
  const c = layout.floor.position;
  const group = new THREE.Group();

  // ---------- Light: warm office ambience and one soft key light. No shadows. ----------
  group.add(new THREE.HemisphereLight(0xfff1e0, 0x1a1620, 1.5 * t.light));
  const key = new THREE.DirectionalLight(0xfff4e8, 1.4 * t.light);
  key.position.set(c.x - 4, 10, c.z + 6);
  key.target.position.set(c.x, 0, c.z);
  group.add(key, key.target);

  // ---------- Walls: furniture at the bottom, frosted glass above ----------
  const topAtlas = canvasTexture(THREE, 128 * KINDS.length, (g, w, h) => paintFurnitureTops(g, h), { height: 128, wrap: false });
  const screenGlow = canvasTexture(THREE, 128 * KINDS.length, (g, w, h) => paintScreens(g, h), { height: 128, wrap: false });
  const furnitureTops = new THREE.MeshLambertMaterial({ map: topAtlas, emissive: 0xffffff, emissiveMap: screenGlow });
  const furnitureSides = new THREE.MeshLambertMaterial({ map: canvasTexture(THREE, 128, paintCabinetSide, { height: Math.round(128 * BASE) }) });
  const glass = new THREE.MeshBasicMaterial({
    map: canvasTexture(THREE, 128, paintGlass, { height: Math.round((128 * (t.wallHeight - BASE)) / layout.tileSize) }),
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });

  const geo = officeGeometry(THREE, layout, rnd);
  const walls = new THREE.Group();
  const glassMesh = new THREE.Mesh(geo.glass, glass);
  glassMesh.renderOrder = 2; // after the actors, so they show through it
  walls.add(new THREE.Mesh(geo.sides, furnitureSides), new THREE.Mesh(geo.tops, furnitureTops), glassMesh);

  // ---------- Floor: carpet tiles with the lighting painted in ----------
  const floorMap = canvasTexture(THREE, layout.cols * PX, (g) => paintFloor(g, layout, rnd), { height: layout.rows * PX, wrap: false });
  const floorMaterial = new THREE.MeshBasicMaterial({ map: floorMap });

  for (const sign of exitSigns(THREE, layout, t.wallHeight + 0.4)) group.add(sign);

  // ---------- Wardens: a glowing core inside a spinning scanner ring ----------
  function makeGhost(color) {
    const warden = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 20, 14),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9 }),
    );
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xd9ccff });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 8, 32), ringMaterial);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.018, 8, 32), new THREE.MeshBasicMaterial({ color }));
    warden.add(core, ring, ring2);
    warden.userData.spin = (time) => {
      ring.rotation.set(Math.PI / 2 + Math.sin(time * 1.3) * 0.5, time * 1.8, 0);
      ring2.rotation.set(Math.sin(time * 0.9) * 0.6, 0, time * 2.4);
    };
    warden.userData.spin(0);
    return warden;
  }

  // ---------- Animation: monitors breathe gently ----------
  function update(time) {
    if (!still) furnitureTops.emissiveIntensity = 0.9 + Math.sin(time * 1.7) * 0.1;
    return false;
  }

  return { group, walls, floorMaterial, shadows: false, makeGhost, update };
}

// ---------- Geometry: furniture sides, furniture tops and glass, each one merged mesh ----------

function officeGeometry(THREE, layout, rnd) {
  const H = layout.theme.wallHeight;
  const h = layout.tileSize / 2;
  const isWall = new Set(layout.walls.map((w) => `${w.r},${w.c}`));
  const wallAt = (r, c) => isWall.has(`${r},${c}`);
  const buffers = { sides: newBuffer(), tops: newBuffer(), glass: newBuffer() };

  // Corners go bottom-left, bottom-right, top-right, top-left as seen from outside the face.
  const FACES = [
    { dr: 0, dc: 1, n: [1, 0, 0], corners: (x, z, y0, y1) => [[x + h, y0, z + h], [x + h, y0, z - h], [x + h, y1, z - h], [x + h, y1, z + h]] },
    { dr: 0, dc: -1, n: [-1, 0, 0], corners: (x, z, y0, y1) => [[x - h, y0, z - h], [x - h, y0, z + h], [x - h, y1, z + h], [x - h, y1, z - h]] },
    { dr: 1, dc: 0, n: [0, 0, 1], corners: (x, z, y0, y1) => [[x - h, y0, z + h], [x + h, y0, z + h], [x + h, y1, z + h], [x - h, y1, z + h]] },
    { dr: -1, dc: 0, n: [0, 0, -1], corners: (x, z, y0, y1) => [[x + h, y0, z - h], [x - h, y0, z - h], [x - h, y1, z - h], [x + h, y1, z - h]] },
  ];
  const FULL = [[0, 0], [1, 0], [1, 1], [0, 1]];

  for (const { r, c, position: { x, z } } of layout.walls) {
    for (const f of FACES) {
      if (wallAt(r + f.dr, c + f.dc)) continue; // pressed against the next wall tile: never visible
      quad(buffers.sides, f.corners(x, z, 0, BASE), f.n, FULL);
      quad(buffers.glass, f.corners(x, z, BASE, H), f.n, FULL);
    }
    // The furniture top: a desk, planter, cabinet or test terminal, picked from the atlas.
    const k = Math.floor(rnd() * KINDS.length);
    const u0 = k / KINDS.length, u1 = (k + 1) / KINDS.length;
    quad(buffers.tops, [[x - h, BASE, z + h], [x + h, BASE, z + h], [x + h, BASE, z - h], [x - h, BASE, z - h]], [0, 1, 0],
      [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
  }

  const out = {};
  for (const [name, b] of Object.entries(buffers)) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(b.nrm, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
    g.setIndex(b.idx);
    out[name] = g;
  }
  return out;
}

const newBuffer = () => ({ pos: [], nrm: [], uv: [], idx: [] });
function quad(buf, corners, normal, uvs) {
  const base = buf.pos.length / 3;
  corners.forEach((p, i) => { buf.pos.push(...p); buf.nrm.push(...normal); buf.uv.push(...uvs[i]); });
  buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

// ---------- Canvas painting ----------

function paintFurnitureTops(g, s) {
  KINDS.forEach((kind, i) => {
    const x0 = i * s;
    g.save();
    g.translate(x0, 0);
    g.beginPath();
    g.rect(0, 0, s, s);
    g.clip();
    if (kind === "desk") {
      g.fillStyle = "#6b4a32"; // walnut desktop
      g.fillRect(0, 0, s, s);
      g.fillStyle = "rgba(255,255,255,0.05)";
      for (let y = 4; y < s; y += 9) g.fillRect(0, y, s, 2); // grain
      g.fillStyle = "#15171c"; // monitor
      g.fillRect(s * 0.2, s * 0.14, s * 0.6, s * 0.12);
      g.fillStyle = "#2b2f38"; // keyboard
      g.fillRect(s * 0.28, s * 0.5, s * 0.44, s * 0.13);
      g.fillStyle = "#eef0f4"; // papers and a mug
      g.fillRect(s * 0.08, s * 0.66, s * 0.22, s * 0.26);
      g.beginPath();
      g.arc(s * 0.82, s * 0.72, s * 0.07, 0, Math.PI * 2);
      g.fill();
    } else if (kind === "planter") {
      g.fillStyle = "#e9e6df";
      g.fillRect(0, 0, s, s);
      g.fillStyle = "#3b2c22";
      g.fillRect(8, 8, s - 16, s - 16);
      for (let k = 0; k < 26; k++) { // leaves
        g.fillStyle = ["#2f6b3b", "#3f8a4a", "#24552f", "#58a160"][k % 4];
        g.beginPath();
        g.ellipse(14 + ((k * 37) % (s - 28)), 14 + ((k * 53) % (s - 28)), 14, 7, (k * 0.9) % Math.PI, 0, Math.PI * 2);
        g.fill();
      }
    } else if (kind === "cabinet") {
      g.fillStyle = "#d9dbe0";
      g.fillRect(0, 0, s, s);
      g.fillStyle = "#c3c6cd";
      g.fillRect(6, 6, s - 12, s - 12);
      g.fillStyle = "#8b6cff"; // a folder in the company colour
      g.fillRect(s * 0.18, s * 0.3, s * 0.3, s * 0.22);
      g.fillStyle = "#f3f4f7";
      g.fillRect(s * 0.52, s * 0.52, s * 0.3, s * 0.2);
    } else if (kind === "terminal") { // a warden test station
      g.fillStyle = "#1b1726";
      g.fillRect(0, 0, s, s);
      g.strokeStyle = "#4b3d7a";
      g.lineWidth = 3;
      g.strokeRect(6, 6, s - 12, s - 12);
      g.fillStyle = "#0c0a14";
      g.fillRect(s * 0.16, s * 0.16, s * 0.68, s * 0.4);
    }
    g.restore();
  });
}

// Emissive map for the furniture tops: monitor screens and the violet test terminals.
function paintScreens(g, s) {
  g.fillStyle = "#000";
  g.fillRect(0, 0, s * KINDS.length, s);
  KINDS.forEach((kind, i) => {
    const x0 = i * s;
    if (kind === "desk") {
      g.fillStyle = "#4a6c9a";
      g.fillRect(x0 + s * 0.22, s * 0.16, s * 0.56, s * 0.08);
    } else if (kind === "terminal") {
      g.fillStyle = "#6d4dff";
      g.fillRect(x0 + s * 0.18, s * 0.18, s * 0.64, s * 0.36);
      g.fillStyle = "#c9b8ff";
      for (let y = s * 0.24; y < s * 0.5; y += 7) g.fillRect(x0 + s * 0.22, y, s * (0.2 + ((y * 13) % 30) / 100), 2);
      g.fillStyle = "#3d2a99";
      g.fillRect(x0 + 6, s - 12, s - 12, 4);
    }
  });
}

function paintCabinetSide(g, w, h) {
  g.fillStyle = "#e4e2dd"; // white lacquer
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#6b4a32"; // walnut top edge
  g.fillRect(0, 0, w, 6);
  g.fillStyle = "rgba(0,0,0,0.12)"; // two cabinet doors
  g.fillRect(w / 2 - 1, 8, 2, h - 18);
  g.fillStyle = "#9aa0aa";
  g.fillRect(w / 2 - 10, h * 0.45, 6, 12);
  g.fillRect(w / 2 + 4, h * 0.45, 6, 12);
  g.fillStyle = "#1c1b20"; // kick plinth
  g.fillRect(0, h - 9, w, 9);
}

// Mostly clear glass: a faint tint, a frosted privacy band, and aluminium frame lines.
function paintGlass(g, w, h) {
  g.clearRect(0, 0, w, h);
  g.fillStyle = "rgba(190,215,255,0.07)";
  g.fillRect(0, 0, w, h);
  const bandY = h * 0.55, bandH = h * 0.14;
  g.fillStyle = "rgba(240,244,255,0.22)";
  g.fillRect(0, bandY, w, bandH);
  g.fillStyle = "rgba(255,255,255,0.35)";
  for (let y = bandY + 3; y < bandY + bandH - 2; y += 6) for (let x = 3; x < w; x += 6) g.fillRect(x, y, 2, 2);
  g.fillStyle = "rgba(205,210,220,0.9)";
  g.fillRect(0, 0, w, 4); // top rail
  g.fillRect(0, h - 3, w, 3); // bottom rail
  g.fillRect(0, 0, 3, h); // mullions at each panel edge
  g.fillRect(w - 3, 0, 3, h);
}

function paintFloor(g, layout, rnd) {
  const { rows, cols } = layout;
  const P = PX / 2; // carpet tiles: 2 × 2 per maze tile, laid in alternating directions

  for (let r = 0; r < rows * 2; r++) {
    for (let c = 0; c < cols * 2; c++) {
      const x = c * P, y = r * P;
      g.fillStyle = (r + c) % 2 ? `hsl(250, 8%, ${15 + rnd() * 2}%)` : `hsl(250, 9%, ${17 + rnd() * 2}%)`;
      g.fillRect(x, y, P, P);
      g.fillStyle = "rgba(255,255,255,0.025)"; // pile direction
      for (let k = 3; k < P; k += 5) (r + c) % 2 ? g.fillRect(x + k, y, 1, P) : g.fillRect(x, y + k, P, 1);
    }
  }

  // Warm downlights in a regular ceiling grid.
  g.globalCompositeOperation = "lighter";
  for (let r = 1; r < rows; r += 2) {
    for (let c = 1; c < cols; c += 2) {
      const x = (c + 0.5) * PX, y = (r + 0.5) * PX, radius = PX * 1.1;
      const grad = g.createRadialGradient(x, y, 0, x, y, radius);
      grad.addColorStop(0, "rgba(255,214,160,0.13)");
      grad.addColorStop(1, "rgba(255,214,160,0)");
      g.fillStyle = grad;
      g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  }
  g.globalCompositeOperation = "source-over";

  // Soft shadow at the foot of every piece of furniture.
  for (const { r, c } of layout.walls) {
    for (let k = 1; k <= 7; k++) {
      g.fillStyle = "rgba(0,0,0,0.07)";
      g.fillRect(c * PX - k * 3, r * PX - k * 3, PX + k * 6, PX + k * 6);
    }
  }

  // The warden test zones: a violet dashed square around each warden's starting tile.
  g.setLineDash([8, 6]);
  g.lineWidth = 3;
  g.strokeStyle = "rgba(140,110,255,0.75)";
  for (const s of layout.ghostStarts) g.strokeRect((s.c - 0.5) * PX + 6, (s.r - 0.5) * PX + 6, PX * 2 - 12, PX * 2 - 12);
  g.setLineDash([]);
  g.font = `bold ${Math.round(PX * 0.16)}px system-ui, sans-serif`;
  g.textAlign = "center";
  g.fillStyle = "rgba(170,150,255,0.85)";
  layout.ghostStarts.forEach((s, i) => g.fillText(`TEST ${i + 1}`, (s.c + 0.5) * PX, (s.r + 0.5) * PX + PX * 0.38));

  // A pale stone threshold at the way out.
  for (const e of layout.exits) {
    g.fillStyle = "#cfcac0";
    g.fillRect(e.c * PX, e.r * PX, PX, PX);
  }
}

// server-halls.js — Level 2's look: the company's server floor. Rows of humming racks with
// blinking status lights, cold raised-floor tiles, data pulses running along the cable trays,
// and security cameras sweeping the aisles.
// three-view.js picks this up when a level's theme has `style: "server-halls"`.
//
// Built to stay fast on school Chromebooks:
//   - Light and shade are painted into the floor texture once (soft shadow at the foot of every
//     rack, pools of overhead light), so there are no shadow maps and the floor needs no lighting.
//   - Racks are one merged mesh that skips faces hidden against a neighbouring rack.
//   - Blinking LEDs swap between three pre-painted glow textures instead of adding lights.

import { canvasTexture, exitSigns, seededRandom } from "./art-kit.js";

const PX = 80; // floor texture pixels per tile
const CELL = 256; // rack texture width per variant
const FRONTS = 4; // rack front variants; the atlas cell after them is the plain end panel
const BLINK_SECONDS = 0.22;

/**
 * @returns {{ group, walls, floorMaterial, shadows: false, update(time: number): boolean, dispose(): void }}
 */
export function buildServerHalls(THREE, layout, { still = false } = {}) {
  const rnd = seededRandom(2);
  const t = layout.theme;
  const c = layout.floor.position;
  const group = new THREE.Group();

  // ---------- Light: cold ambient plus one key light. No shadows. ----------
  group.add(new THREE.HemisphereLight(0xcfe3ff, 0x0d1522, 1.4 * t.light));
  const key = new THREE.DirectionalLight(0xe6f0ff, 1.5 * t.light);
  key.position.set(c.x - 3, 10, c.z + 7);
  key.target.position.set(c.x, 0, c.z);
  group.add(key, key.target);

  // ---------- Racks ----------
  const atlasWidth = CELL * (FRONTS + 1);
  const rackHeight = Math.round((CELL * t.wallHeight) / layout.tileSize); // square pixels on a tall face
  const leds = [];
  const rackMap = canvasTexture(THREE, atlasWidth, (g, w, h) => paintRacks(g, h, rnd, leds), { height: rackHeight, wrap: false });
  const blinkFrames = [0, 1, 2].map((frame) =>
    canvasTexture(THREE, atlasWidth, (g, w, h) => paintLeds(g, w, h, leds, frame), { height: rackHeight, wrap: false }));
  const rackMaterial = new THREE.MeshLambertMaterial({ map: rackMap, emissive: 0xffffff, emissiveMap: blinkFrames[0], emissiveIntensity: 1.5 });

  const pulses = canvasTexture(THREE, 256, (g, w, h) => paintPulses(g, w, h, rnd), { height: 64 });
  const topMaterial = new THREE.MeshLambertMaterial({ map: canvasTexture(THREE, 128, paintRackTop), emissive: 0xffffff, emissiveMap: pulses });

  const [sideGeometry, topGeometry] = rackGeometry(THREE, layout, rnd);
  const walls = new THREE.Group();
  walls.add(new THREE.Mesh(sideGeometry, rackMaterial), new THREE.Mesh(topGeometry, topMaterial));

  // ---------- Floor: raised tiles with the lighting painted in ----------
  const floorMap = canvasTexture(THREE, layout.cols * PX, (g) => paintFloor(g, layout, rnd), { height: layout.rows * PX, wrap: false });
  const floorMaterial = new THREE.MeshBasicMaterial({ map: floorMap });

  // ---------- Props ----------
  for (const sign of exitSigns(THREE, layout, t.wallHeight + 0.45)) group.add(sign);

  // Security cameras on the two back corners, sweeping the floor.
  const cameras = [];
  const body = new THREE.MeshLambertMaterial({ color: 0xd7dde5 });
  const ledMaterial = new THREE.MeshBasicMaterial({ color: 0xff2a3d });
  // A yaw of θ points the lens along (cos θ, 0, −sin θ): −π/4 faces into the maze from the left corner.
  for (const [col, sweepCentre] of [[0, -Math.PI * 0.25], [layout.cols - 1, -Math.PI * 0.75]]) {
    const mount = new THREE.Group();
    mount.position.set(col * layout.tileSize, t.wallHeight + 0.12, 0);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.13, 0.15), body);
    housing.position.x = 0.12;
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), ledMaterial);
    led.position.set(0.3, 0.03, 0);
    mount.add(housing, led);
    mount.userData.centre = sweepCentre;
    mount.rotation.set(0, sweepCentre, -0.35);
    cameras.push(mount);
    group.add(mount);
  }

  // ---------- Animation ----------
  let shownFrame = 0;

  function update(time) {
    if (still) return false;
    const frame = Math.floor(time / BLINK_SECONDS) % 3;
    if (frame !== shownFrame) {
      rackMaterial.emissiveMap = blinkFrames[frame]; // swapping textures doesn't recompile anything
      shownFrame = frame;
    }
    pulses.offset.x = -time * 0.35;
    cameras.forEach((cam, i) => { cam.rotation.y = cam.userData.centre + Math.sin(time * 0.45 + i * 2) * 0.55; });
    ledMaterial.color.setHex(time % 1.6 < 0.2 ? 0x4a0a10 : 0xff2a3d);
    return false; // nothing here casts shadows
  }

  function dispose() {
    for (const tex of blinkFrames) tex.dispose();
  }

  return { group, walls, floorMaterial, shadows: false, update, dispose };
}

// ---------- Geometry: every rack in two merged meshes (fronts/sides, tops) ----------

function rackGeometry(THREE, layout, rnd) {
  const H = layout.theme.wallHeight;
  const h = layout.tileSize / 2;
  const isWall = new Set(layout.walls.map((w) => `${w.r},${w.c}`));
  const wallAt = (r, c) => isWall.has(`${r},${c}`);
  const sides = { pos: [], nrm: [], uv: [], idx: [] };
  const tops = { pos: [], nrm: [], uv: [], idx: [] };

  // Corners go bottom-left, bottom-right, top-right, top-left as seen from outside the face.
  const quad = (buf, corners, normal, uvs) => {
    const base = buf.pos.length / 3;
    corners.forEach((p, i) => { buf.pos.push(...p); buf.nrm.push(...normal); buf.uv.push(...uvs[i]); });
    buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const FACES = [
    { dr: 0, dc: 1, n: [1, 0, 0], corners: (x, z) => [[x + h, 0, z + h], [x + h, 0, z - h], [x + h, H, z - h], [x + h, H, z + h]] },
    { dr: 0, dc: -1, n: [-1, 0, 0], corners: (x, z) => [[x - h, 0, z - h], [x - h, 0, z + h], [x - h, H, z + h], [x - h, H, z - h]] },
    { dr: 1, dc: 0, n: [0, 0, 1], corners: (x, z) => [[x - h, 0, z + h], [x + h, 0, z + h], [x + h, H, z + h], [x - h, H, z + h]] },
    { dr: -1, dc: 0, n: [0, 0, -1], corners: (x, z) => [[x + h, 0, z - h], [x - h, 0, z - h], [x - h, H, z - h], [x + h, H, z - h]] },
  ];

  for (const { r, c, position: { x, z } } of layout.walls) {
    const alongX = wallAt(r, c - 1) || wallAt(r, c + 1);
    const alongZ = wallAt(r - 1, c) || wallAt(r + 1, c);
    for (const f of FACES) {
      if (wallAt(r + f.dr, c + f.dc)) continue; // pressed against the next rack: never visible
      // The end of a straight row gets a plain side panel; faces along the aisle get rack fronts.
      const end = f.dc !== 0 ? alongX && !alongZ : alongZ && !alongX;
      const cell = end ? FRONTS : Math.floor(rnd() * FRONTS);
      const u0 = cell / (FRONTS + 1), u1 = (cell + 1) / (FRONTS + 1);
      quad(sides, f.corners(x, z), f.n, [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
    }
    // Tops: the cable tray (texture u) follows the row's direction so the data pulses flow along it.
    const uv = alongZ && !alongX ? [[0, 0], [0, 1], [1, 1], [1, 0]] : [[0, 0], [1, 0], [1, 1], [0, 1]];
    quad(tops, [[x - h, H, z + h], [x + h, H, z + h], [x + h, H, z - h], [x - h, H, z - h]], [0, 1, 0], uv);
  }

  return [sides, tops].map((b) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(b.nrm, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
    g.setIndex(b.idx);
    return g;
  });
}

// ---------- Canvas painting ----------

const pick = (rnd, list) => list[Math.floor(rnd() * list.length)];

function paintRacks(g, h, rnd, leds) {
  for (let v = 0; v < FRONTS; v++) paintRackFront(g, v * CELL, h, rnd, leds);
  paintEndPanel(g, FRONTS * CELL, h);
}

function paintRackFront(g, x0, h, rnd, leds) {
  const frame = 12, plinth = 16;
  const left = x0 + frame + 12, right = x0 + CELL - frame - 12, width = right - left;
  g.fillStyle = "#0a0e14";
  g.fillRect(x0, 0, CELL, h);
  g.fillStyle = "#131922";
  g.fillRect(x0 + frame, frame, CELL - frame * 2, h - frame - plinth);
  // Mounting rails with screw holes.
  g.fillStyle = "#1f2733";
  g.fillRect(x0 + frame, frame, 8, h - frame - plinth);
  g.fillRect(x0 + CELL - frame - 8, frame, 8, h - frame - plinth);
  g.fillStyle = "#0a0e14";
  for (let y = frame + 4; y < h - plinth; y += 11) {
    g.fillRect(x0 + frame + 3, y, 2, 2);
    g.fillRect(x0 + CELL - frame - 5, y, 2, 2);
  }
  g.fillStyle = "#05070a";
  g.fillRect(x0, h - plinth, CELL, plinth);

  // Fill the rack with equipment, top to bottom. 1U = 11 px.
  const U = 11;
  let y = frame + 4;
  while (true) {
    const units = pick(rnd, [1, 1, 1, 2, 2, 2, 3, 4]);
    const uh = units * U - 2;
    if (y + uh > h - plinth - 4) break;
    const kind = rnd();
    if (kind < 0.1) { // blanking panel
      g.fillStyle = "#0e131a";
      g.fillRect(left, y, width, uh);
    } else if (kind < 0.22 && units === 1) { // patch panel with coloured cables
      g.fillStyle = "#1b222c";
      g.fillRect(left, y, width, uh);
      for (let i = 0; i < 24; i++) {
        g.fillStyle = pick(rnd, ["#2b6cb0", "#2b6cb0", "#d69e2e", "#38a169", "#8a94a3", "#b83280"]);
        g.fillRect(left + 6 + i * ((width - 12) / 24), y + 2, 4, uh - 4);
      }
    } else { // a server
      g.fillStyle = pick(rnd, ["#202834", "#1b222d", "#262f3c", "#2b3443"]);
      g.fillRect(left, y, width, uh);
      g.fillStyle = "rgba(255,255,255,0.07)";
      g.fillRect(left, y, width, 1);
      g.fillStyle = "rgba(0,0,0,0.45)";
      for (let vx = left + 46; vx < right - 40; vx += 5) g.fillRect(vx, y + 3, 2, uh - 6); // vents
      if (units >= 2) { // drive bays, each with its own activity light
        for (let bx = left + 46; bx < right - 40 - 14; bx += 16) {
          if (rnd() < 0.5) continue;
          g.fillStyle = "#11161d";
          g.fillRect(bx, y + 2, 13, uh - 4);
          leds.push({ x: bx + 4, y: y + uh - 7, w: 4, h: 3, color: "#4cc3ff", pattern: Math.floor(rnd() * 8) });
        }
      }
      const count = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < count; i++) {
        const blinking = rnd() < 0.45;
        leds.push({
          x: left + 6 + i * 9, y: y + uh / 2 - 2.5, w: 5, h: 5,
          color: pick(rnd, ["#3cf08c", "#3cf08c", "#3cf08c", "#4cc3ff", "#ffb340"]),
          pattern: blinking ? 1 + Math.floor(rnd() * 6) : 7, // bit k = lit in blink frame k
        });
      }
      if (units >= 2 && rnd() < 0.3) { // a small status screen
        leds.push({ x: right - 36, y: y + 3, w: 28, h: uh - 6, color: "#29d3ff", pattern: 7, screen: true });
      }
    }
    y += units * U;
  }

  // LEDs look like dark lenses when they're off.
  g.fillStyle = "#07090c";
  for (const led of leds) if (led.x >= x0 && led.x < x0 + CELL) g.fillRect(led.x, led.y, led.w, led.h);
}

function paintEndPanel(g, x0, h) {
  g.fillStyle = "#0a0e14";
  g.fillRect(x0, 0, CELL, h);
  g.fillStyle = "#161d27";
  g.fillRect(x0 + 10, 10, CELL - 20, h - 26);
  g.fillStyle = "rgba(0,0,0,0.4)"; // vent slots
  for (let y = 30; y < h - 40; y += 7) g.fillRect(x0 + CELL / 2 - 50, y, 100, 3);
  g.fillStyle = "#2bb7e6"; // a blue accent stripe, like a corporate colour band
  g.fillRect(x0 + 10, 18, CELL - 20, 5);
  g.fillStyle = "#d9dee5"; // asset label
  g.fillRect(x0 + 24, 34, 50, 18);
  g.fillStyle = "#59616d";
  g.fillRect(x0 + 28, 39, 32, 2);
  g.fillRect(x0 + 28, 44, 24, 2);
  g.fillStyle = "#05070a";
  g.fillRect(x0, h - 16, CELL, 16);
}

function paintLeds(g, w, h, leds, frame) {
  g.fillStyle = "#000";
  g.fillRect(0, 0, w, h);
  for (const led of leds) {
    if (!((led.pattern >> frame) & 1)) continue;
    g.shadowColor = led.color;
    g.shadowBlur = led.screen ? 4 : 8;
    g.fillStyle = led.screen ? "#0a3a4a" : led.color;
    g.fillRect(led.x, led.y, led.w, led.h);
    if (led.screen) { // a few lines of "text" on the status screen
      g.shadowBlur = 0;
      g.fillStyle = led.color;
      for (let ly = led.y + 2; ly < led.y + led.h - 2; ly += 4) g.fillRect(led.x + 3, ly, 6 + ((ly * 7 + frame * 5) % 16), 2);
    }
  }
  g.shadowBlur = 0;
}

function paintRackTop(g, s) {
  g.fillStyle = "#121821";
  g.fillRect(0, 0, s, s);
  g.fillStyle = "#0a0e14"; // perforations
  for (let y = 4; y < s; y += 8) for (let x = 4; x < s; x += 8) g.fillRect(x, y, 3, 3);
  // Cable tray across the middle, running along the row.
  g.fillStyle = "#0b0f15";
  g.fillRect(0, s * 0.32, s, s * 0.36);
  g.fillStyle = "#344052";
  g.fillRect(0, s * 0.32, s, 3);
  g.fillRect(0, s * 0.68 - 3, s, 3);
  const cables = ["#24456e", "#3a4656", "#24456e", "#6b5a22", "#3a4656"];
  cables.forEach((color, i) => {
    g.fillStyle = color;
    g.fillRect(0, s * 0.37 + i * 6, s, 4);
  });
}

// Emissive map for the rack tops: dim cyan tray edges plus bright pulses that scroll along the row.
function paintPulses(g, w, h, rnd) {
  g.fillStyle = "#000";
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#0b4a5c";
  g.fillRect(0, h * 0.32, w, 2);
  g.fillRect(0, h * 0.68 - 2, w, 2);
  for (let i = 0; i < 3; i++) {
    const x = rnd() * w, len = 22 + rnd() * 30;
    for (const dx of [0, -w]) { // drawn twice so pulses wrap across the texture edge
      const grad = g.createLinearGradient(x + dx, 0, x + dx + len, 0);
      grad.addColorStop(0, "rgba(95,225,255,0)");
      grad.addColorStop(1, "rgba(160,240,255,1)");
      g.fillStyle = grad;
      g.fillRect(x + dx, h / 2 - 2, len, 4);
    }
  }
}

function paintFloor(g, layout, rnd) {
  const { rows, cols } = layout;
  const isWall = new Set(layout.walls.map((w) => `${w.r},${w.c}`));
  const P = PX / 2; // raised-floor panels: 2 × 2 per tile

  // Panels, some of them perforated vents breathing cold air.
  for (let r = 0; r < rows * 2; r++) {
    for (let c = 0; c < cols * 2; c++) {
      const x = c * P, y = r * P;
      g.fillStyle = `hsl(213, 17%, ${14 + rnd() * 3.5}%)`;
      g.fillRect(x, y, P, P);
      if (rnd() < 0.16) {
        g.fillStyle = "rgba(70,190,255,0.07)";
        g.fillRect(x, y, P, P);
        g.fillStyle = "#0c1219";
        for (let py = y + 5; py < y + P - 3; py += 5) for (let px = x + 5; px < x + P - 3; px += 5) g.fillRect(px, py, 2, 2);
      }
      g.strokeStyle = "#0a0f15";
      g.lineWidth = 1.5;
      g.strokeRect(x + 0.75, y + 0.75, P - 1.5, P - 1.5);
    }
  }

  // Pools of cold overhead light.
  g.globalCompositeOperation = "lighter";
  for (let r = 1; r < rows; r += 3) {
    for (let c = 1; c < cols; c += 3) {
      const x = (c + 0.5) * PX, y = (r + 0.5) * PX, radius = PX * 1.7;
      const grad = g.createRadialGradient(x, y, 0, x, y, radius);
      grad.addColorStop(0, "rgba(150,190,235,0.16)");
      grad.addColorStop(1, "rgba(150,190,235,0)");
      g.fillStyle = grad;
      g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  }
  g.globalCompositeOperation = "source-over";

  // Soft shadow where every rack meets the floor (stacked, growing rectangles ≈ a blur).
  for (const { r, c } of layout.walls) {
    for (let k = 1; k <= 8; k++) {
      g.fillStyle = "rgba(0,0,0,0.075)";
      g.fillRect(c * PX - k * 3, r * PX - k * 3, PX + k * 6, PX + k * 6);
    }
  }

  // Cyan kick-strip glow along the base of each rack, on the aisle side.
  g.globalCompositeOperation = "lighter";
  for (const { r, c } of layout.walls) {
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      if (isWall.has(`${r + dr},${c + dc}`) || r + dr < 0 || c + dc < 0 || r + dr >= rows || c + dc >= cols) continue;
      const len = 9;
      const x0 = dc > 0 ? (c + 1) * PX : c * PX, y0 = dr > 0 ? (r + 1) * PX : r * PX;
      const grad = dc ? g.createLinearGradient(x0, 0, x0 + dc * len, 0) : g.createLinearGradient(0, y0, 0, y0 + dr * len);
      grad.addColorStop(0, "rgba(60,190,255,0.35)");
      grad.addColorStop(1, "rgba(60,190,255,0)");
      g.fillStyle = grad;
      if (dc) g.fillRect(Math.min(x0, x0 + dc * len), r * PX, len, PX);
      else g.fillRect(c * PX, Math.min(y0, y0 + dr * len), PX, len);
    }
  }
  g.globalCompositeOperation = "source-over";

  // Hazard tape across the threshold of each exit.
  for (const e of layout.exits) {
    const x = e.c * PX, y = e.r * PX;
    g.save();
    g.beginPath();
    g.rect(x, y, PX, PX);
    g.clip();
    for (let k = -PX; k < PX * 2; k += 14) {
      g.fillStyle = "#c9a227";
      g.beginPath();
      g.moveTo(x + k, y);
      g.lineTo(x + k + 7, y);
      g.lineTo(x + k + 7 - PX, y + PX);
      g.lineTo(x + k - PX, y + PX);
      g.fill();
    }
    g.restore();
  }
}

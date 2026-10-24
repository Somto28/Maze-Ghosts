// uplink.js — Level 6's look: the Uplink, the roof of Clearpath's tower at night, where the evidence
// gets broadcast to the world. Rooftop equipment (HVAC units, electrical cabinets, solar panels) forms
// the maze; antenna masts with blinking red aviation lights rise between them; the floor is wet roofing
// with painted walkway lines and puddles catching the city's glow; a satellite dish waits beside the way
// out, and a beam of light shoots up from the exit: red while it's locked, bright cyan once you hold
// the evidence and the uplink is ready. The city skyline and the stars fill the background.
// three-view.js picks this up when a level's theme has `style: "uplink"`.
//
// Cheap like the other looks: light is painted into the floor, the equipment is two merged meshes,
// masts and their lights are instanced, and the beam is one additive cylinder.

import { backdrop, canvasTexture, exitSigns, floorDecal, paintWallShadows, seededRandom, wallGeometry } from "./art-kit.js";

const PX = 80; // floor texture pixels per tile
const SIDE_CELLS = 5; // HVAC unit, electrical cabinet, broadcast rack, crate, plain parapet (end panel)
const TOP_CELLS = 4; // fan, solar panel, gravel, hatch

/**
 * @returns {{ group, walls, floorMaterial, shadows: false, background, fogColor,
 *             update(time: number): boolean, setExitOpen(open: boolean): void, dispose(): void }}
 */
export function buildUplink(THREE, layout, { still = false } = {}) {
  const rnd = seededRandom(6);
  const t = layout.theme;
  const c = layout.floor.position;
  const group = new THREE.Group();
  const disposables = [];

  // ---------- Light: cold moonlight from above, a warm city glow from one side ----------
  group.add(new THREE.HemisphereLight(0xa9bbff, 0x120c1a, 1.45 * t.light));
  const moon = new THREE.DirectionalLight(0xc8d6ff, 1.2 * t.light);
  moon.position.set(c.x - 6, 12, c.z - 4);
  moon.target.position.set(c.x, 0, c.z);
  const city = new THREE.DirectionalLight(0xff9a5a, 0.5 * t.light);
  city.position.set(c.x + 10, 3, c.z + 8);
  city.target.position.set(c.x, 0, c.z);
  group.add(moon, moon.target, city, city.target);

  // ---------- Rooftop equipment ----------
  const faceH = Math.round((256 * t.wallHeight) / layout.tileSize);
  const sideMap = canvasTexture(THREE, 256 * SIDE_CELLS, (g, w, h) => paintSides(g, h, rnd), { height: faceH, wrap: false });
  const sideGlow = canvasTexture(THREE, 256 * SIDE_CELLS, (g, w, h) => paintSideGlow(g, h), { height: faceH, wrap: false });
  const sideMaterial = new THREE.MeshLambertMaterial({ map: sideMap, emissive: 0xffffff, emissiveMap: sideGlow, emissiveIntensity: 1 });
  const topMap = canvasTexture(THREE, 256 * TOP_CELLS, (g, w, h) => paintTops(g, h), { height: 256, wrap: false });
  const topMaterial = new THREE.MeshLambertMaterial({ map: topMap });

  const geo = wallGeometry(THREE, layout, {
    sideCells: SIDE_CELLS, topCells: TOP_CELLS,
    pickSide: (r, col, f) => {
      const border = r === 0 || col === 0 || r === layout.rows - 1 || col === layout.cols - 1;
      return border || f.end ? SIDE_CELLS - 1 : Math.floor(rnd() * (SIDE_CELLS - 1));
    },
    pickTop: (r, col) => {
      const border = r === 0 || col === 0 || r === layout.rows - 1 || col === layout.cols - 1;
      return border ? 2 : [0, 1, 1, 2, 3][Math.floor(rnd() * 5)];
    },
  });
  const walls = new THREE.Group();
  walls.add(new THREE.Mesh(geo.sides, sideMaterial), new THREE.Mesh(geo.tops, topMaterial));

  // ---------- Floor: wet roofing, walkway lines, puddles ----------
  const floorMap = canvasTexture(THREE, layout.cols * PX, (g) => paintFloor(g, layout, rnd), { height: layout.rows * PX, wrap: false });
  const floorMaterial = new THREE.MeshBasicMaterial({ map: floorMap });

  for (const sign of exitSigns(THREE, layout, t.wallHeight + 0.45)) group.add(sign);

  // ---------- Antenna masts with blinking aviation lights ----------
  const interior = layout.walls.filter((w) => w.r > 0 && w.c > 0 && w.r < layout.rows - 1 && w.c < layout.cols - 1);
  const masts = [];
  for (const w of interior) if (rnd() < 0.1 && masts.every((m) => Math.abs(m.r - w.r) + Math.abs(m.c - w.c) > 3)) masts.push(w);
  const mastGeo = new THREE.CylinderGeometry(0.025, 0.04, 1, 6).translate(0, 0.5, 0);
  const mastMesh = new THREE.InstancedMesh(mastGeo, new THREE.MeshLambertMaterial({ color: 0x9aa3b5 }), Math.max(1, masts.length));
  const lightsA = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  const lightsB = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  const beacons = [];
  const m4 = new THREE.Matrix4();
  masts.forEach((w, i) => {
    const height = 0.9 + rnd() * 0.9;
    mastMesh.setMatrixAt(i, m4.compose(new THREE.Vector3(w.position.x, t.wallHeight, w.position.z), new THREE.Quaternion(), new THREE.Vector3(1, height, 1)));
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), i % 2 ? lightsA : lightsB);
    bulb.position.set(w.position.x, t.wallHeight + height + 0.03, w.position.z);
    const halo = floorDecal(THREE, { color: 0xff3030, size: 0.6, opacity: 0.7, y: 0 });
    halo.rotation.x = 0;
    halo.position.copy(bulb.position);
    beacons.push({ halo, group: i % 2 });
    group.add(bulb);
  });
  mastMesh.count = masts.length;
  group.add(mastMesh);

  // ---------- The uplink: a dish next to each exit and a beam of light straight up ----------
  const beamMaterial = new THREE.MeshBasicMaterial({ color: 0xff3a4a, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const isWall = new Set(layout.walls.map((w) => `${w.r},${w.c}`));
  for (const e of layout.exits) {
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.4, 6, 20, 1, true).translate(0, 3, 0), beamMaterial);
    beam.position.set(e.position.x, 0, e.position.z);
    group.add(beam);
    // The dish sits on the nearest wall tile beside the exit, tilted up at the sky.
    const spot = [[0, -1], [-1, 0], [1, 0], [0, 1]].map(([dr, dc]) => ({ r: e.r + dr, c: e.c + dc })).find((p) => isWall.has(`${p.r},${p.c}`));
    if (spot) {
      const dish = new THREE.Group();
      const bowl = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.32),
        new THREE.MeshLambertMaterial({ color: 0xe9edf5, side: THREE.DoubleSide }),
      );
      bowl.rotation.x = Math.PI; // open side up
      bowl.position.y = 0.42;
      const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 6), new THREE.MeshLambertMaterial({ color: 0x8a93a5 }));
      feed.position.y = 0.28;
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.3, 8), new THREE.MeshLambertMaterial({ color: 0x5b6375 }));
      stand.position.y = 0.0;
      dish.add(bowl, feed, stand);
      dish.rotation.set(-0.5, Math.atan2(e.c - spot.c, e.r - spot.r), 0, "YXZ");
      dish.position.set(spot.c * layout.tileSize, t.wallHeight + 0.15, spot.r * layout.tileSize);
      group.add(dish);
    }
  }

  const background = backdrop(THREE, paintBackdrop);
  disposables.push(background);

  let open = false;
  function setExitOpen(isOpen) {
    open = isOpen;
    beamMaterial.color.set(isOpen ? 0x5ff6ff : 0xff3a4a);
  }

  // ---------- Animation: aviation lights blink in two alternating groups; the beam pulses ----------
  function update(time) {
    if (still) return false;
    const on = (time % 1.6) < 0.25, on2 = ((time + 0.8) % 1.6) < 0.25;
    lightsA.color.set(on ? 0xff2a2a : 0x3a0808);
    lightsB.color.set(on2 ? 0xff2a2a : 0x3a0808);
    for (const b of beacons) b.halo.material.opacity = (b.group ? on : on2) ? 0.7 : 0;
    beamMaterial.opacity = open ? 0.3 + Math.sin(time * 5) * 0.08 : 0.1 + Math.sin(time * 2) * 0.03;
    return false;
  }

  return {
    group, walls, floorMaterial, shadows: false, background, fogColor: "#0b0b1a", update, setExitOpen,
    dispose() { for (const d of disposables) d.dispose(); },
  };
}

// ---------- Canvas painting ----------

function paintSides(g, h, rnd) {
  const s = 256;
  for (let i = 0; i < SIDE_CELLS; i++) {
    const x0 = i * s;
    if (i === 0) { // HVAC unit: grey sheet metal with louvers
      g.fillStyle = "#7d8493"; g.fillRect(x0, 0, s, h);
      g.fillStyle = "#5d6372";
      for (let y = 20; y < h - 30; y += 12) g.fillRect(x0 + 20, y, s - 40, 6);
      g.fillStyle = "#9aa1af"; g.fillRect(x0, 0, s, 8);
    } else if (i === 1) { // electrical cabinet with a hazard sticker
      g.fillStyle = "#596173"; g.fillRect(x0, 0, s, h);
      g.strokeStyle = "#3f4554"; g.lineWidth = 4; g.strokeRect(x0 + 14, 14, s / 2 - 20, h - 28); g.strokeRect(x0 + s / 2 + 6, 14, s / 2 - 20, h - 28);
      g.fillStyle = "#f2c230";
      g.beginPath(); g.moveTo(x0 + s / 2, h * 0.3); g.lineTo(x0 + s / 2 + 26, h * 0.3 + 44); g.lineTo(x0 + s / 2 - 26, h * 0.3 + 44); g.fill();
      g.fillStyle = "#1a1a1a"; g.font = "bold 30px system-ui"; g.textAlign = "center"; g.fillText("!", x0 + s / 2, h * 0.3 + 40);
    } else if (i === 2) { // broadcast rack: dark, with a row of status lights
      g.fillStyle = "#262b38"; g.fillRect(x0, 0, s, h);
      g.fillStyle = "#1a1e28";
      for (let y = 18; y < h - 20; y += 26) g.fillRect(x0 + 16, y, s - 32, 18);
      g.fillStyle = "#3a4152"; g.fillRect(x0, 0, s, 6);
    } else if (i === 3) { // a steel equipment crate with stencilling
      g.fillStyle = "#6a5a44"; g.fillRect(x0, 0, s, h);
      g.strokeStyle = "#4b3f30"; g.lineWidth = 8; g.strokeRect(x0 + 8, 8, s - 16, h - 16);
      g.beginPath(); g.moveTo(x0 + 8, 8); g.lineTo(x0 + s - 8, h - 8); g.stroke();
      g.fillStyle = "rgba(240,230,210,0.7)"; g.font = "bold 22px 'Courier New', monospace"; g.textAlign = "center";
      g.fillText("CLEARPATH", x0 + s / 2, h * 0.55);
    } else { // parapet: wet concrete with drip stains and a steel cap
      g.fillStyle = "#4a4e5c"; g.fillRect(x0, 0, s, h);
      for (let k = 0; k < 14; k++) { g.fillStyle = `rgba(20,22,30,${0.15 + rnd() * 0.2})`; g.fillRect(x0 + rnd() * s, 10, 3 + rnd() * 5, h * (0.3 + rnd() * 0.6)); }
      g.fillStyle = "#8a90a0"; g.fillRect(x0, 0, s, 10);
    }
    g.fillStyle = "rgba(0,0,0,0.35)"; // grime where it meets the roof
    g.fillRect(x0, h - 14, s, 14);
  }
}

function paintSideGlow(g, h) {
  const s = 256;
  g.fillStyle = "#000"; g.fillRect(0, 0, s * SIDE_CELLS, h);
  // Broadcast rack status lights (orange and green).
  for (let y = 24, k = 0; y < h - 20; y += 26, k++) {
    g.fillStyle = k % 3 === 0 ? "#3dff7a" : "#ff9a2a";
    for (let x = 0; x < 6; x++) g.fillRect(2 * s + 26 + x * 16, y + 5, 6, 6);
  }
  // A thin red strip on the cabinet: "power on".
  g.fillStyle = "#ff3030"; g.fillRect(s + 22, h - 40, 30, 5);
}

function paintTops(g, s) {
  for (let i = 0; i < TOP_CELLS; i++) {
    const x0 = i * s, cx = x0 + s / 2, cy = s / 2;
    if (i === 0) { // HVAC fan from above
      g.fillStyle = "#8a91a0"; g.fillRect(x0, 0, s, s);
      g.fillStyle = "#1b1e26"; g.beginPath(); g.arc(cx, cy, 96, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "#5c6372"; g.lineWidth = 6;
      for (let r = 30; r < 96; r += 18) { g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke(); }
      g.fillStyle = "#3b404d";
      for (let k = 0; k < 5; k++) { g.save(); g.translate(cx, cy); g.rotate((k / 5) * Math.PI * 2); g.fillRect(-10, 0, 20, 84); g.restore(); }
    } else if (i === 1) { // solar panel
      g.fillStyle = "#c4cad6"; g.fillRect(x0, 0, s, s);
      g.fillStyle = "#1b2a5a"; g.fillRect(x0 + 12, 12, s - 24, s - 24);
      g.strokeStyle = "#7f93c9"; g.lineWidth = 2;
      for (let k = 1; k < 6; k++) { const p = 12 + (k * (s - 24)) / 6; g.beginPath(); g.moveTo(x0 + p, 12); g.lineTo(x0 + p, s - 12); g.moveTo(x0 + 12, p); g.lineTo(x0 + s - 12, p); g.stroke(); }
      const shine = g.createLinearGradient(x0, 0, x0 + s, s); shine.addColorStop(0, "rgba(255,255,255,0.18)"); shine.addColorStop(0.5, "rgba(255,255,255,0)");
      g.fillStyle = shine; g.fillRect(x0 + 12, 12, s - 24, s - 24);
    } else if (i === 2) { // gravel / parapet cap
      g.fillStyle = "#595e6c"; g.fillRect(x0, 0, s, s);
      for (let k = 0; k < 500; k++) { g.fillStyle = `rgba(${150 + (k % 60)},${150 + (k % 50)},${165 + (k % 40)},0.35)`; g.fillRect(x0 + ((k * 73) % s), (k * 151) % s, 3, 3); }
    } else { // access hatch
      g.fillStyle = "#7d8493"; g.fillRect(x0, 0, s, s);
      g.fillStyle = "#4b505e"; g.fillRect(x0 + 40, 40, s - 80, s - 80);
      g.strokeStyle = "#f2c230"; g.lineWidth = 6; g.strokeRect(x0 + 40, 40, s - 80, s - 80);
      g.fillStyle = "#c4cad6"; g.fillRect(cx - 30, cy - 6, 60, 12);
    }
  }
}

function paintFloor(g, layout, rnd) {
  const { rows, cols } = layout;
  const W = cols * PX, H = rows * PX;
  // Dark, wet roofing membrane with a speckle of grit.
  g.fillStyle = "#1c1e28"; g.fillRect(0, 0, W, H);
  for (let k = 0; k < rows * cols * 30; k++) { g.fillStyle = `rgba(255,255,255,${0.02 + rnd() * 0.04})`; g.fillRect(rnd() * W, rnd() * H, 2, 2); }
  // Seams between the roofing sheets.
  g.fillStyle = "rgba(0,0,0,0.35)";
  for (let y = PX; y < H; y += PX * 2) g.fillRect(0, y - 1, W, 2);
  // Painted walkway: a dashed yellow line along the middle of every open tile, joining neighbours.
  const isWall = new Set(layout.walls.map((w) => `${w.r},${w.c}`));
  const open = (r, c) => r >= 0 && c >= 0 && r < rows && c < cols && !isWall.has(`${r},${c}`);
  g.strokeStyle = "rgba(242,194,48,0.55)"; g.lineWidth = 3; g.setLineDash([10, 9]);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (!open(r, c)) continue;
    const x = (c + 0.5) * PX, y = (r + 0.5) * PX;
    if (open(r, c + 1)) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + PX, y); g.stroke(); }
    if (open(r + 1, c)) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + PX); g.stroke(); }
  }
  g.setLineDash([]);
  // Puddles catching the sky and the city's glow.
  g.globalCompositeOperation = "lighter";
  for (let k = 0; k < Math.round(rows * cols * 0.06); k++) {
    const x = rnd() * W, y = rnd() * H, rx = PX * (0.3 + rnd() * 0.5), ry = rx * (0.5 + rnd() * 0.3);
    const grad = g.createRadialGradient(x, y, 0, x, y, rx);
    grad.addColorStop(0, rnd() < 0.5 ? "rgba(120,150,255,0.18)" : "rgba(255,140,90,0.16)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.beginPath(); g.ellipse(x, y, rx, ry, rnd() * Math.PI, 0, Math.PI * 2); g.fill();
  }
  // Moonlight wash.
  const moon = g.createLinearGradient(0, 0, W, H);
  moon.addColorStop(0, "rgba(150,170,255,0.10)"); moon.addColorStop(1, "rgba(255,140,90,0.06)");
  g.fillStyle = moon; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = "source-over";
  paintWallShadows(g, layout, PX, { steps: 6, alpha: 0.09 });
  // The uplink pad at each exit: concentric orange rings and "UPLINK" lettering.
  for (const e of layout.exits) {
    const x = (e.c + 0.5) * PX, y = (e.r + 0.5) * PX;
    g.save(); g.beginPath(); g.rect(e.c * PX, e.r * PX, PX, PX); g.clip();
    g.fillStyle = "#2a2d3a"; g.fillRect(e.c * PX, e.r * PX, PX, PX);
    g.strokeStyle = "#ff9a2a"; g.lineWidth = 3;
    for (const rr of [0.42, 0.3, 0.18]) { g.beginPath(); g.arc(x, y, PX * rr, 0, Math.PI * 2); g.stroke(); }
    g.restore();
  }
  // A helipad "H" in the most open spot near the start, for a sense of place.
  const p = layout.playerStart;
  g.strokeStyle = "rgba(255,255,255,0.12)"; g.lineWidth = 4;
  g.beginPath(); g.arc((p.c + 0.5) * PX, (p.r + 0.5) * PX, PX * 0.42, 0, Math.PI * 2); g.stroke();
}

// The backdrop: night sky, stars and the moon above, the city skyline glowing below.
function paintBackdrop(g, w, h) {
  const rnd = seededRandom(66);
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#05061a");
  sky.addColorStop(0.45, "#17133a");
  sky.addColorStop(0.62, "#3a1f4a");
  sky.addColorStop(0.72, "#6b3346");
  sky.addColorStop(1, "#0b0b14");
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 420; i++) { // stars
    const y = rnd() * h * 0.6;
    g.fillStyle = `rgba(255,255,255,${(0.2 + rnd() * 0.8) * (1 - y / (h * 0.65))})`;
    const r = rnd() < 0.08 ? 1.6 : 0.8;
    g.beginPath(); g.arc(rnd() * w, y, r, 0, Math.PI * 2); g.fill();
  }
  // Moon with a soft halo.
  const mx = w * 0.18, my = h * 0.18;
  const halo = g.createRadialGradient(mx, my, 10, mx, my, 140);
  halo.addColorStop(0, "rgba(220,230,255,0.45)"); halo.addColorStop(1, "rgba(220,230,255,0)");
  g.fillStyle = halo; g.fillRect(mx - 140, my - 140, 280, 280);
  g.fillStyle = "#eef2ff"; g.beginPath(); g.arc(mx, my, 30, 0, Math.PI * 2); g.fill();
  g.fillStyle = "rgba(170,180,210,0.5)"; g.beginPath(); g.arc(mx + 8, my - 6, 7, 0, Math.PI * 2); g.arc(mx - 10, my + 9, 5, 0, Math.PI * 2); g.fill();
  // City skyline: three layers of towers, the nearest with lit windows.
  const horizon = h * 0.72;
  [["#1d1630", 0.55], ["#140f24", 0.75], ["#0a0814", 1]].forEach(([col, k], layer) => {
    let x = -10;
    while (x < w) {
      const bw = 24 + rnd() * 60, bh = (40 + rnd() * 160) * k;
      g.fillStyle = col; g.fillRect(x, horizon - bh + layer * 18, bw, h);
      if (layer === 2) {
        for (let wy = horizon - bh + 26; wy < h; wy += 9) for (let wx = x + 4; wx < x + bw - 4; wx += 7) {
          if (rnd() < 0.32) { g.fillStyle = rnd() < 0.8 ? "rgba(255,210,140,0.75)" : "rgba(150,200,255,0.7)"; g.fillRect(wx, wy, 3, 4); }
        }
        if (bh > 150 && rnd() < 0.6) { g.fillStyle = "#ff3030"; g.fillRect(x + bw / 2 - 2, horizon - bh + 36, 4, 4); } // aviation light
      }
      x += bw + 2 + rnd() * 8;
    }
  });
  // Orange city haze along the horizon.
  const haze = g.createLinearGradient(0, horizon - 80, 0, horizon + 40);
  haze.addColorStop(0, "rgba(255,120,70,0)"); haze.addColorStop(0.7, "rgba(255,120,70,0.22)"); haze.addColorStop(1, "rgba(255,120,70,0)");
  g.globalCompositeOperation = "lighter"; g.fillStyle = haze; g.fillRect(0, horizon - 80, w, 120); g.globalCompositeOperation = "source-over";
}

// basement.js — Level 1's look: a dark, damp secret basement lit by one swinging bulb.
// three-view.js picks this up when a level's theme has `style: "basement"`.
//
// Kept cheap: two lights in total (dim ambience + the bulb), matte Lambert surfaces, and the
// player's phone light and other glows are floor decals rather than real lights.

import { canvasTexture, drawGlow, exitSigns, floorDecal, seededRandom, wrapped } from "./art-kit.js";

const BULB_POWER = 50;
const BULB_HEIGHT = 2.6;
const CORD_LENGTH = 6;

/**
 * Builds the basement set for one level.
 * @returns {{ group, wallMaterial, floorMaterial, shadows: true, update(time: number, playerPos: {x, z}): boolean }}
 *   update() returns true when the bulb moved, i.e. the shadows need redrawing.
 */
export function buildBasement(THREE, layout, { still = false } = {}) {
  const rnd = seededRandom(1);
  const t = layout.theme;
  const c = layout.floor.position;
  const group = new THREE.Group();

  // ---------- Surfaces ----------
  const bricks = canvasTexture(THREE, 256, (g, s) => drawBricks(g, s, rnd));
  const cap = canvasTexture(THREE, 128, (g, s) => drawConcrete(g, s, rnd, { base: "#24201c", cracks: 1, joints: false }));
  // No bump map: it cost ~15% of the frame, and the bricks already have painted edges.
  const wallMaterial = new THREE.MeshLambertMaterial({ map: bricks });

  // Concrete caps laid on top of the brick. They're separate meshes because a multi-material
  // InstancedMesh breaks the shadow pass.
  const caps = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(layout.tileSize, layout.tileSize).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ map: cap }),
    layout.walls.length,
  );
  const m = new THREE.Matrix4();
  layout.walls.forEach((wall, i) => caps.setMatrixAt(i, m.makeTranslation(wall.position.x, t.wallHeight + 0.002, wall.position.z)));
  caps.receiveShadow = true;
  group.add(caps);

  // One concrete slab per 3 × 3 tiles, with a dark seam between slabs.
  const concrete = canvasTexture(THREE, 512, (g, s) => drawConcrete(g, s, rnd, { base: "#34302a", cracks: 5, joints: true }), {
    repeat: [layout.floor.size.x / 3, layout.floor.size.z / 3],
  });
  const floorMaterial = new THREE.MeshLambertMaterial({ map: concrete });

  // ---------- Light: dim cellar ambience and one bare bulb ----------
  group.add(new THREE.HemisphereLight(0x8a7660, 0x1a130d, 1.5 * t.light));

  // The bulb hangs on a long cord from a pivot above the frame, so it can swing.
  const pendulum = new THREE.Group();
  pendulum.position.set(c.x, BULB_HEIGHT + CORD_LENGTH, c.z);
  const cord = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, CORD_LENGTH, 4),
    new THREE.MeshBasicMaterial({ color: 0x0d0b09 }),
  );
  cord.position.y = -CORD_LENGTH / 2;
  const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.08, 10), new THREE.MeshBasicMaterial({ color: 0x1a1612 }));
  socket.position.y = -CORD_LENGTH + 0.08;
  const glassMaterial = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  const glass = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), glassMaterial);
  glass.position.y = -CORD_LENGTH;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: canvasTexture(THREE, 128, drawGlow), color: 0xffb066, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  halo.scale.setScalar(1.4);
  halo.position.y = -CORD_LENGTH;
  // A wide spotlight aimed straight down: one shadow pass instead of a point light's six,
  // which is cheaper on Chromebooks and still throws swinging shadows.
  const bulb = new THREE.SpotLight(0xffb46b, BULB_POWER, 0, 1.25, 0.9, 2);
  bulb.position.y = -CORD_LENGTH - 0.05;
  bulb.target.position.y = -CORD_LENGTH - 5;
  bulb.castShadow = true;
  bulb.shadow.mapSize.set(1024, 1024);
  bulb.shadow.bias = -0.002;
  bulb.shadow.camera.near = 0.1;
  bulb.shadow.camera.far = 25;
  pendulum.add(cord, socket, glass, halo, bulb, bulb.target);
  group.add(pendulum);

  // The player's phone light: a cool glow on the floor that follows them.
  const phoneLight = floorDecal(THREE, { color: 0xbcd4ff, size: 2.6, opacity: 0.4, y: 0.012 });
  group.add(phoneLight);

  // ---------- Props ----------
  const rust = new THREE.MeshStandardMaterial({ color: 0x5a3826, metalness: 0.55, roughness: 0.65 });
  const pipe = (radius, length, x, y, z, alongZ) => {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 12), rust);
    p.rotation[alongZ ? "x" : "z"] = Math.PI / 2;
    p.position.set(x, y, z);
    p.castShadow = true;
    group.add(p);
  };
  const { x: w, z: d } = layout.floor.size;
  pipe(0.07, w, c.x, t.wallHeight + 0.09, -0.3, false); // along the back wall
  pipe(0.04, w, c.x, t.wallHeight + 0.06, -0.08, false);
  pipe(0.05, d, -0.3, t.wallHeight + 0.07, c.z, true); // along the left wall

  // Puddles: dark and glossy, so the bulb glints in them as it swings.
  const puddleMaterial = new THREE.MeshStandardMaterial({ color: 0x1c1813, metalness: 0.2, roughness: 0.04, transparent: true, opacity: 0.45, depthWrite: false });
  const spots = layout.floorTiles.filter((f) => !f.isExit && !(f.r === layout.playerStart.r && f.c === layout.playerStart.c));
  for (let i = 0; i < 3; i++) {
    const f = spots[Math.floor(rnd() * spots.length)];
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.3, 24), puddleMaterial);
    puddle.rotation.x = -Math.PI / 2;
    puddle.scale.set(0.8 + rnd() * 0.6, 0.6 + rnd() * 0.4, 1);
    puddle.position.set(f.position.x + (rnd() - 0.5) * 0.3, 0.004, f.position.z + (rnd() - 0.5) * 0.3);
    puddle.receiveShadow = true;
    group.add(puddle);
  }

  for (const sign of exitSigns(THREE, layout, t.wallHeight + 0.45)) group.add(sign);

  // Dust drifting through the light.
  const DUST = 220;
  const dust = new Float32Array(DUST * 3);
  const drift = [];
  for (let i = 0; i < DUST; i++) {
    dust.set([c.x + (rnd() - 0.5) * w, 0.2 + rnd() * 2.6, c.z + (rnd() - 0.5) * d], i * 3);
    drift.push(rnd() * Math.PI * 2);
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dust, 3));
  const motes = new THREE.Points(dustGeometry, new THREE.PointsMaterial({
    map: canvasTexture(THREE, 32, drawGlow), color: 0xffcf99, size: 0.05, transparent: true, opacity: 0.45,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  group.add(motes);

  // ---------- Animation ----------
  let flickerUntil = 0;
  let nextFlicker = 4;

  function update(time, playerPos) {
    phoneLight.position.x = playerPos.x;
    phoneLight.position.z = playerPos.z;
    if (still) return false;

    // A slow, uneven swing.
    pendulum.rotation.z = Math.sin(time * 0.9) * 0.05;
    pendulum.rotation.x = Math.sin(time * 0.63 + 1) * 0.025;

    // Every few seconds the bulb stutters.
    if (time > nextFlicker) {
      flickerUntil = time + 0.2 + Math.random() * 0.4;
      nextFlicker = time + 5 + Math.random() * 8;
    }
    const level = time < flickerUntil ? (Math.random() < 0.5 ? 0.15 : 0.85) : 1 + Math.sin(time * 17) * 0.025;
    bulb.intensity = BULB_POWER * level;
    halo.material.opacity = level;
    glassMaterial.color.setRGB(1, 0.85, 0.63).multiplyScalar(0.3 + level * 0.7);

    for (let i = 0; i < DUST; i++) {
      dust[i * 3] += Math.sin(time * 0.3 + drift[i]) * 0.0015;
      dust[i * 3 + 1] += Math.cos(time * 0.2 + drift[i]) * 0.0008;
    }
    dustGeometry.attributes.position.needsUpdate = true;
    return true; // the bulb swung, so its shadows moved
  }

  return { group, wallMaterial, floorMaterial, shadows: true, update };
}

// ---------- Canvas painting ----------

function speckle(g, s, rnd, count, alpha) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = rnd() < 0.5 ? `rgba(0,0,0,${alpha * rnd()})` : `rgba(255,235,210,${alpha * 0.5 * rnd()})`;
    g.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
}

function drawBricks(g, s, rnd) {
  const rows = 8, bh = s / rows, bw = s / 4, gap = 3;
  g.fillStyle = "#1d1714"; // mortar
  g.fillRect(0, 0, s, s);
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (bw / 2);
    for (let i = -1; i <= 4; i++) {
      const x = i * bw + offset, y = r * bh;
      g.fillStyle = `hsl(${8 + rnd() * 14}, ${28 + rnd() * 20}%, ${19 + rnd() * 11}%)`;
      g.fillRect(x + gap / 2, y + gap / 2, bw - gap, bh - gap);
      // A lighter top edge and darker bottom edge give each brick a little depth.
      g.fillStyle = "rgba(255,210,170,0.06)";
      g.fillRect(x + gap / 2, y + gap / 2, bw - gap, 2);
      g.fillStyle = "rgba(0,0,0,0.25)";
      g.fillRect(x + gap / 2, y + bh - gap / 2 - 2, bw - gap, 2);
      if (rnd() < 0.12) { // a chipped corner
        g.fillStyle = "#1d1714";
        g.beginPath();
        g.arc(x + (rnd() < 0.5 ? gap : bw - gap), y + (rnd() < 0.5 ? gap : bh - gap), 3 + rnd() * 4, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  speckle(g, s, rnd, 2500, 0.35);

  // Damp streaks running down from the top.
  for (let i = 0; i < 6; i++) {
    const x = rnd() * s, len = s * (0.3 + rnd() * 0.6), wdt = 4 + rnd() * 10;
    const grad = g.createLinearGradient(0, 0, 0, len);
    grad.addColorStop(0, "rgba(10,8,6,0.45)");
    grad.addColorStop(1, "rgba(10,8,6,0)");
    g.fillStyle = grad;
    g.fillRect(x, 0, wdt, len);
  }

  // Grime and a hint of mould where the wall meets the floor.
  const grime = g.createLinearGradient(0, s * 0.55, 0, s);
  grime.addColorStop(0, "rgba(8,7,5,0)");
  grime.addColorStop(0.7, "rgba(14,16,8,0.45)");
  grime.addColorStop(1, "rgba(6,6,4,0.8)");
  g.fillStyle = grime;
  g.fillRect(0, 0, s, s);
}

function drawConcrete(g, s, rnd, { base, cracks, joints }) {
  g.fillStyle = base;
  g.fillRect(0, 0, s, s);

  // Blotchy stains, darker and lighter.
  for (let i = 0; i < s / 6; i++) {
    const x = rnd() * s, y = rnd() * s, r = s * (0.03 + rnd() * 0.18);
    const color = rnd() < 0.7 ? `rgba(8,6,4,${0.05 + rnd() * 0.14})` : `rgba(200,180,150,${0.02 + rnd() * 0.04})`;
    wrapped(s, x, y, (px, py) => {
      const grad = g.createRadialGradient(px, py, 0, px, py, r);
      grad.addColorStop(0, color);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.fillRect(px - r, py - r, r * 2, r * 2);
    });
  }
  speckle(g, s, rnd, s * 10, 0.4);

  // Hairline cracks: short random walks.
  g.lineCap = "round";
  for (let i = 0; i < cracks; i++) {
    let x = rnd() * s, y = rnd() * s, angle = rnd() * Math.PI * 2;
    const steps = 10 + Math.floor(rnd() * 25);
    g.strokeStyle = "rgba(6,5,4,0.7)";
    g.lineWidth = 1 + rnd();
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < steps; k++) {
      angle += (rnd() - 0.5) * 0.9;
      x += Math.cos(angle) * 6;
      y += Math.sin(angle) * 6;
      g.lineTo(x, y);
    }
    g.stroke();
  }

  if (joints) {
    g.fillStyle = "rgba(5,4,3,0.75)";
    g.fillRect(0, 0, s, 2);
    g.fillRect(0, 0, 2, s);
  }
}

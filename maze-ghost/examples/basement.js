// basement.js — Level 1's look: a dark, damp secret basement lit by one swinging bulb.
// Every texture is painted in code on a <canvas>, so there are no image files to load.
// three-view.js picks this up when a level's theme has `style: "basement"`.

const BULB_POWER = 30;
const BULB_HEIGHT = 2.6;
const CORD_LENGTH = 6;

/**
 * Builds the basement set for one level.
 * @returns {{ group, wallMaterial, floorMaterial, update(time: number, playerPos: {x, z}): void }}
 */
export function buildBasement(THREE, layout, { still = false } = {}) {
  const rnd = seededRandom(1);
  const t = layout.theme;
  const c = layout.floor.position;
  const group = new THREE.Group();

  // ---------- Surfaces ----------
  const bricks = canvasTexture(THREE, 256, (g, s) => drawBricks(g, s, rnd));
  const cap = canvasTexture(THREE, 128, (g, s) => drawConcrete(g, s, rnd, { base: "#24201c", cracks: 1, joints: false }));
  const wallMaterial = new THREE.MeshStandardMaterial({ map: bricks, bumpMap: bricks, bumpScale: 3, roughness: 0.9 });

  // Concrete caps laid on top of the brick. They're separate meshes because a multi-material
  // InstancedMesh breaks the shadow pass.
  const caps = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(layout.tileSize, layout.tileSize).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: cap, roughness: 0.95 }),
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
  const floorMaterial = new THREE.MeshStandardMaterial({ map: concrete, bumpMap: concrete, bumpScale: 1.5, roughness: 0.92 });

  // ---------- Light: dim cellar ambience, one bare bulb, and the player's phone light ----------
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

  const phoneLight = new THREE.PointLight(0xcfe0ff, 1.6, 2.4, 1.5);
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

  // A glowing EXIT sign over the way out, turned toward the camera.
  const signTexture = canvasTexture(THREE, 256, drawExitSign);
  signTexture.repeat.set(1, 0.375);
  signTexture.offset.set(0, 0.3125);
  for (const e of layout.exits) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.27), new THREE.MeshBasicMaterial({ map: signTexture, transparent: true }));
    sign.position.set(e.position.x, t.wallHeight + 0.45, e.position.z);
    sign.lookAt(layout.camera.position.x, layout.camera.position.y, layout.camera.position.z);
    group.add(sign);
  }

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
    phoneLight.position.set(playerPos.x, 0.6, playerPos.z);
    if (still) return;

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
  }

  return { group, wallMaterial, floorMaterial, update };
}

// ---------- Canvas painting ----------

function canvasTexture(THREE, size, draw, { repeat = [1, 1] } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  draw(canvas.getContext("2d"), size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(...repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Draw something at (x, y) and at its copies one canvas-width away, so the texture tiles without seams.
function wrapped(s, x, y, draw) {
  for (const dx of [-s, 0, s]) for (const dy of [-s, 0, s]) draw(x + dx, y + dy);
}

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

function drawGlow(g, s) {
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.35)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
}

// Painted in the middle band of a square canvas (the texture's offset/repeat crop to it).
function drawExitSign(g, s) {
  const y = s * 0.3125, h = s * 0.375;
  g.fillStyle = "#06170c";
  g.fillRect(0, y, s, h);
  g.strokeStyle = "#1f6b3a";
  g.lineWidth = 6;
  g.strokeRect(5, y + 5, s - 10, h - 10);
  g.font = "bold 58px 'Arial Black', Arial, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.shadowColor = "#4ade80";
  g.shadowBlur = 16;
  g.fillStyle = "#86f7ad";
  g.fillText("EXIT", s / 2, y + h / 2 + 3);
}

// Same art every time you load the level.
function seededRandom(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

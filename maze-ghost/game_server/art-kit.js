// art-kit.js — small helpers shared by the level looks (basement.js, server-halls.js) and three-view.js.
// Textures are painted in code on a <canvas>, so there are no image files to load.

export function canvasTexture(THREE, width, draw, { height = width, repeat = [1, 1], wrap = true } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d"), width, height);
  const tex = new THREE.CanvasTexture(canvas);
  if (wrap) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(...repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Draw something at (x, y) and at its copies one canvas-width away, so the texture tiles without seams.
export function wrapped(s, x, y, draw) {
  for (const dx of [-s, 0, s]) for (const dy of [-s, 0, s]) draw(x + dx, y + dy);
}

export function drawGlow(g, s) {
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.35)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
}

/**
 * A soft round patch lying on the floor. Additive = a glow (replaces a real point light, which
 * would cost every pixel on screen); not additive with a black colour = a soft contact shadow.
 */
export function floorDecal(THREE, { color, size, opacity = 1, additive = true, y = 0.01 }) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      map: canvasTexture(THREE, 64, drawGlow, { wrap: false }), color, opacity, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }),
  );
  mesh.position.y = y;
  return mesh;
}

/** A glowing EXIT sign above each exit, turned toward the camera. */
export function exitSigns(THREE, layout, height) {
  const tex = canvasTexture(THREE, 256, drawExitSign, { height: 96, wrap: false });
  const material = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  const { x, y, z } = layout.camera.position;
  return layout.exits.map((e) => {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.27), material);
    sign.position.set(e.position.x, height, e.position.z);
    sign.lookAt(x, y, z);
    return sign;
  });
}

function drawExitSign(g, w, h) {
  g.fillStyle = "#06170c";
  g.fillRect(0, 0, w, h);
  g.strokeStyle = "#1f6b3a";
  g.lineWidth = 6;
  g.strokeRect(5, 5, w - 10, h - 10);
  g.font = "bold 58px 'Arial Black', Arial, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.shadowColor = "#4ade80";
  g.shadowBlur = 16;
  g.fillStyle = "#86f7ad";
  g.fillText("EXIT", w / 2, h / 2 + 3);
}

// Same art every time you load the level.
export function seededRandom(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Merged geometry for every visible wall face, for the level looks. Faces pressed against another wall
 * tile are skipped (never visible), and each face picks a cell from a horizontal texture atlas.
 *   sides: pickSide(r, c, face) -> atlas cell for a side face (face.dc / face.dr say which way it faces;
 *          face.end is true on the end of a straight row, where a plain panel looks right)
 *   tops:  pickTop(r, c) -> atlas cell for the top face, or -1 for none
 * Returns { sides, tops } BufferGeometries (either may be empty).
 */
export function wallGeometry(THREE, layout, { y0 = 0, y1, sideCells = 1, topCells = 1, pickSide = () => 0, pickTop = () => 0 }) {
  const h = layout.tileSize / 2;
  const top = y1 ?? layout.theme.wallHeight;
  const isWall = new Set(layout.walls.map((w) => `${w.r},${w.c}`));
  const wallAt = (r, c) => isWall.has(`${r},${c}`);
  const sides = { pos: [], nrm: [], uv: [], idx: [] };
  const tops = { pos: [], nrm: [], uv: [], idx: [] };
  const quad = (buf, corners, normal, uvs) => {
    const base = buf.pos.length / 3;
    corners.forEach((p, i) => { buf.pos.push(...p); buf.nrm.push(...normal); buf.uv.push(...uvs[i]); });
    buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  // Corners go bottom-left, bottom-right, top-right, top-left as seen from outside the face.
  const FACES = [
    { dr: 0, dc: 1, n: [1, 0, 0], corners: (x, z) => [[x + h, y0, z + h], [x + h, y0, z - h], [x + h, top, z - h], [x + h, top, z + h]] },
    { dr: 0, dc: -1, n: [-1, 0, 0], corners: (x, z) => [[x - h, y0, z - h], [x - h, y0, z + h], [x - h, top, z + h], [x - h, top, z - h]] },
    { dr: 1, dc: 0, n: [0, 0, 1], corners: (x, z) => [[x - h, y0, z + h], [x + h, y0, z + h], [x + h, top, z + h], [x - h, top, z + h]] },
    { dr: -1, dc: 0, n: [0, 0, -1], corners: (x, z) => [[x + h, y0, z - h], [x - h, y0, z - h], [x - h, top, z - h], [x + h, top, z - h]] },
  ];
  for (const { r, c, position: { x, z } } of layout.walls) {
    const alongX = wallAt(r, c - 1) || wallAt(r, c + 1);
    const alongZ = wallAt(r - 1, c) || wallAt(r + 1, c);
    for (const f of FACES) {
      if (wallAt(r + f.dr, c + f.dc)) continue;
      const end = f.dc !== 0 ? alongX && !alongZ : alongZ && !alongX;
      const cell = pickSide(r, c, { dr: f.dr, dc: f.dc, end });
      const u0 = cell / sideCells, u1 = (cell + 1) / sideCells;
      quad(sides, f.corners(x, z), f.n, [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
    }
    const cell = pickTop(r, c);
    if (cell < 0) continue;
    const u0 = cell / topCells, u1 = (cell + 1) / topCells;
    quad(tops, [[x - h, top, z + h], [x + h, top, z + h], [x + h, top, z - h], [x - h, top, z - h]], [0, 1, 0], [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
  }
  const toGeometry = (b) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(b.nrm, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
    g.setIndex(b.idx);
    return g;
  };
  return { sides: toGeometry(sides), tops: toGeometry(tops) };
}

/** A full-screen backdrop painted on a canvas (used as scene.background). 16:9, stretched to the window. */
export function backdrop(THREE, draw, { width = 1280, height = 720 } = {}) {
  const tex = canvasTexture(THREE, width, (g, w, h) => draw(g, w, h), { height, wrap: false });
  tex.anisotropy = 1;
  return tex;
}

/** Soft blur-free "shadow" at the foot of every wall: stacked, growing translucent rectangles. */
export function paintWallShadows(g, layout, px, { steps = 7, alpha = 0.07, spread = 3 } = {}) {
  for (const { r, c } of layout.walls) {
    for (let k = 1; k <= steps; k++) {
      g.fillStyle = `rgba(0,0,0,${alpha})`;
      g.fillRect(c * px - k * spread, r * px - k * spread, px + k * spread * 2, px + k * spread * 2);
    }
  }
}

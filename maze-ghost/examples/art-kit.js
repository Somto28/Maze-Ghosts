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

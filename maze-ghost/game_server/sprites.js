// sprites.js — the animated characters in the maze: Sam (the player), the Wardens and the drones.
// They're pixel art in the same style as the cutscenes, painted in code onto a sprite sheet (no image
// files), and drawn in the 3D maze as cards that always face the camera.
//
//   const sam = makeActor(THREE, "player");
//   const warden = makeActor(THREE, "warden", { color: "#ff1f3d" }); // the eye and chest light
//   const drone = makeActor(THREE, "drone", { color: "#ffb020" });   // the body
//   each frame: actor.userData.animate({ time, facing, moving, step, charged })
//
// Animation: Sam and the Wardens have a 4-frame walk cycle in four directions (left is right, mirrored),
// an idle breath, and Sam blinks; a Warden's eye sweeps its visor while it waits. Drones spin their
// rotors and go dark while they recharge.
//
// Depth: a card that faces the camera would lean back into the wall behind its tile, so each card is
// drawn as if it stood a little closer to the camera (SPRITE_DEPTH.pull, set per level by three-view.js
// from the wall height and camera angle). Walls behind a character never cut into it; walls in front
// still hide it. Where they do, a soft coloured silhouette shows through, so you never lose anyone.

export const SHEETS = new Map(); // one painted sheet per kind and colour, shared by every actor that uses it
/** How far (world units) cards are pulled toward the camera for depth testing. */
export const SPRITE_DEPTH = { pull: { value: 0.6 } };

const SPEC = {
  // fw × fh pixels per frame; frames per direction row; on-screen height in tiles
  player: { fw: 24, fh: 32, rows: ["down", "up", "side"], frames: ["idle0", "idle1", "blink", "walk0", "walk1", "walk2", "walk3"], height: 0.9, silhouette: "#5ab0ff" },
  warden: { fw: 32, fh: 40, rows: ["down", "up", "side"], frames: ["idle0", "idle1", "idle2", "idle3", "walk0", "walk1", "walk2", "walk3"], height: 1.05, silhouette: "#ff4d5e" },
  drone: { fw: 32, fh: 26, rows: ["front"], frames: ["on0", "on1", "on2", "on3", "off0", "off1", "off2", "off3"], height: 0.85, silhouette: "#ffc04d" },
};

const VERTEX = /* glsl */ `
  uniform vec2 size;
  uniform vec4 frame; // u0, v0, u1, v1 of the current frame in the sheet
  uniform float flip, pull;
  varying vec2 vUv;
  void main() {
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += (position.xy + vec2(0.0, 0.5)) * size; // camera-facing, anchored at the feet
    vec4 clip = projectionMatrix * mv;
    vec4 near = projectionMatrix * vec4(mv.xy, mv.z + pull, 1.0); // same spot, a little closer: depth only
    clip.z = near.z / near.w * clip.w;
    gl_Position = clip;
    vec2 k = vec2(flip > 0.5 ? 1.0 - uv.x : uv.x, uv.y);
    vUv = mix(frame.xy, frame.zw, k);
  }`;
const FRAGMENT = /* glsl */ `
  uniform sampler2D map;
  uniform vec3 tint;
  uniform float opacity;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(map, vUv);
    if (c.a < 0.05) discard;
    gl_FragColor = vec4(c.rgb * tint, c.a * opacity);
    #include <colorspace_fragment>
  }`;

/** An animated character. kind: "player" | "warden" | "drone"; color: the Warden's eye or the drone's body. */
export function makeActor(THREE, kind, { color } = {}) {
  const spec = SPEC[kind];
  const sheet = getSheet(THREE, kind, color);
  const size = new THREE.Vector2(spec.height * (spec.fw / spec.fh), spec.height);
  const frame = new THREE.Vector4(0, 0, 1, 1), flip = { value: 0 };
  const shared = { size: { value: size }, frame: { value: frame }, flip, pull: SPRITE_DEPTH.pull };
  const geometry = new THREE.PlaneGeometry(1, 1);

  const tint = new THREE.Color(0xffffff);
  const body = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
    uniforms: { ...shared, map: { value: sheet.texture }, tint: { value: tint }, opacity: { value: 1 } },
    vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true,
  }));
  // The see-through silhouette: drawn only where something is in front of the character.
  const xray = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
    uniforms: { ...shared, map: { value: sheet.silhouette }, tint: { value: new THREE.Color(spec.silhouette) }, opacity: { value: 0.45 } },
    vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthWrite: false, depthFunc: THREE.GreaterDepth,
  }));
  body.renderOrder = 10;
  xray.renderOrder = 11;
  body.frustumCulled = xray.frustumCulled = false; // the shader moves the corners, so the plane's bounds don't apply
  const actor = new THREE.Group();
  actor.add(body, xray);

  let facing = kind === "drone" ? "front" : "down", phase = 0, shown = -1, lastTime = 0;
  const cols = spec.frames.length, rows = spec.rows.length;
  const setFrame = (index, mirrored) => {
    flip.value = mirrored ? 1 : 0;
    if (index === shown) return;
    shown = index;
    const col = index % cols, row = Math.floor(index / cols);
    frame.set(col / cols, 1 - (row + 1) / rows, (col + 1) / cols, 1 - row / rows);
  };
  const frameIndex = (row, name) => spec.rows.indexOf(row) * cols + spec.frames.indexOf(name);

  actor.userData.animate = ({ time, facing: f, moving = false, step = 0, charged = true }) => {
    const dt = Math.min(0.1, Math.max(0, time - lastTime));
    lastTime = time;
    if (f && kind !== "drone") facing = f;
    if (kind === "drone") {
      const spin = Math.floor(time * (charged ? 22 : 9)) % 4;
      return setFrame(frameIndex("front", `${charged ? "on" : "off"}${spin}`), false);
    }
    const row = facing === "left" || facing === "right" ? "side" : facing;
    const mirrored = facing === "left";
    if (moving) {
      phase += step * 4 + dt * 2; // about one walk cycle per tile
      return setFrame(frameIndex(row, `walk${Math.floor(phase) % 4}`), mirrored);
    }
    phase = 0;
    if (kind === "player") {
      const blink = time % 3.7 < 0.13 && row !== "up";
      return setFrame(frameIndex(row, blink ? "blink" : `idle${Math.floor(time * 1.6) % 2}`), mirrored);
    }
    return setFrame(frameIndex(row, `idle${Math.floor(time * 2.2) % 4}`), mirrored); // the eye sweeps the visor
  };
  actor.userData.setTint = (css) => tint.set(css ?? 0xffffff); // e.g. a colour flicker while glitching
  actor.userData.animate({ time: 0 });
  return actor;
}

// ---------- The sheet ----------

function getSheet(THREE, kind, color) {
  const key = `${kind}|${color ?? ""}`;
  if (SHEETS.has(key)) return SHEETS.get(key);
  const spec = SPEC[kind];
  const canvas = document.createElement("canvas");
  canvas.width = spec.fw * spec.frames.length;
  canvas.height = spec.fh * spec.rows.length;
  const g = canvas.getContext("2d");
  spec.rows.forEach((row, r) => spec.frames.forEach((frame, f) => {
    const ox = f * spec.fw, oy = r * spec.fh;
    const P = (x, y, w, h, c, a = 1) => { g.globalAlpha = a; g.fillStyle = c; g.fillRect(ox + x, oy + y, w, h); g.globalAlpha = 1; };
    PAINT[kind](P, row, frame, color);
    outline(g, ox, oy, spec.fw, spec.fh);
  }));
  // The silhouette: every solid pixel white (tinted per kind by the material).
  const sil = document.createElement("canvas");
  sil.width = canvas.width; sil.height = canvas.height;
  const sg = sil.getContext("2d");
  const img = g.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const solid = img.data[i + 3] > 127;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = solid ? 255 : 0;
  }
  sg.putImageData(img, 0, 0);
  const tex = (c) => {
    const t = new THREE.CanvasTexture(c);
    t.magFilter = t.minFilter = THREE.NearestFilter; // crisp pixels
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const out = { texture: tex(canvas), silhouette: tex(sil) };
  SHEETS.set(key, out);
  return out;
}

// A 1-pixel dark outline around every solid pixel, so characters stand out on any floor.
function outline(g, ox, oy, w, h) {
  const img = g.getImageData(ox, oy, w, h), d = img.data;
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 127;
  const add = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > 0) continue; // only fully clear pixels (keeps rotor blur and glows soft)
    if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) add.push(x, y);
  }
  for (let i = 0; i < add.length; i += 2) {
    const k = (add[i + 1] * w + add[i]) * 4;
    d[k] = 10; d[k + 1] = 11; d[k + 2] = 16; d[k + 3] = 255;
  }
  g.putImageData(img, ox, oy);
}

// Lighten or darken a #rrggbb colour (k > 0 toward white, k < 0 toward black).
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)));
  return `#${ch.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// ---------- Sam ----------
const SAM = {
  skin: "#e3a978", skinD: "#b97c55", hair: "#3b2416", hairL: "#5e3b22", eye: "#1a1a1a",
  shirt: "#7fb8ee", shirtD: "#4a86c5", shirtL: "#b5dafc", collar: "#f4f6fa", tie: "#c0392b",
  pants: "#2b3046", pantsD: "#1b1e2c", shoe: "#0f0f12", bag: "#7a4b2a", bagD: "#55331c", badge: "#f2f2f2",
};

// Walk cycle: which foot is lifted and whether the body is up a pixel.
const SAM_POSE = {
  idle0: { bob: 0, lift: [0, 0], swing: 0 }, idle1: { bob: 1, lift: [0, 0], swing: 0 }, blink: { bob: 0, lift: [0, 0], swing: 0, blink: true },
  walk0: { bob: 0, lift: [0, 2], swing: 1 }, walk1: { bob: 1, lift: [0, 0], swing: 0 },
  walk2: { bob: 0, lift: [2, 0], swing: -1 }, walk3: { bob: 1, lift: [0, 0], swing: 0 },
};

function paintSam(P, row, frame) {
  const C = SAM, pose = SAM_POSE[frame], b = pose.bob; // b: the upper body rises a pixel
  if (row === "side") return paintSamSide(P, frame, pose);
  const front = row === "down";
  // Legs and shoes (they don't bob).
  const leg = (x, lift) => { P(x, 24 - lift, 4, 5, C.pants); P(x + (x < 12 ? 0 : 3), 24 - lift, 1, 5, C.pantsD); P(x - (x < 12 ? 1 : 0), 29 - lift, 5, 2, C.shoe); };
  leg(7, pose.lift[0]); leg(13, pose.lift[1]);
  P(7, 23, 10, 2, C.pants);
  // Bag at the hip (on the far side from behind).
  if (front) { P(16, 21 - b, 4, 5, C.bag); P(16, 25 - b, 4, 1, C.bagD); } else { P(4, 21 - b, 4, 5, C.bag); P(4, 25 - b, 4, 1, C.bagD); }
  // Torso.
  P(6, 16 - b, 12, 7, C.shirt); P(7, 15 - b, 10, 1, C.shirt);
  P(6, 16 - b, 1, 7, C.shirtD); P(17, 16 - b, 1, 7, C.shirtD); P(8, 16 - b, 1, 5, C.shirtL);
  P(7, 22 - b, 10, 1, C.pantsD); // belt
  if (front) {
    P(10, 15 - b, 4, 1, C.collar); P(11, 15 - b, 2, 7, C.tie); P(11, 21 - b, 2, 1, shade(C.tie, -0.3));
    P(14, 17 - b, 2, 3, C.badge); P(14, 19 - b, 2, 1, "#5ab0ff");
    for (let k = 0; k < 7; k++) P(8 + k, 15 - b + k, 1, 1, C.bagD); // strap, shoulder to hip
  } else {
    for (let k = 0; k < 7; k++) P(15 - k, 15 - b + k, 1, 1, C.bagD);
    P(9, 17 - b, 6, 1, C.shirtD); // shoulder-blade crease
  }
  // Arms swing opposite to the legs (a raised hand = that arm is forward).
  const arm = (x, up) => { P(x, 16 - b - up, 2, 7, C.shirt); P(x, 16 - b - up, 1, 7, C.shirtD); P(x, 23 - b - up, 2, 2, C.skin); };
  arm(4, Math.max(0, pose.swing)); arm(18, Math.max(0, -pose.swing));
  // Neck and head.
  P(10, 14 - b, 4, 1, C.skinD);
  if (front) {
    P(8, 6 - b, 8, 8, C.skin); P(15, 7 - b, 1, 7, C.skinD); P(9, 13 - b, 6, 1, C.skin);
    P(7, 3 - b, 10, 4, C.hair); P(8, 2 - b, 8, 1, C.hair); P(9, 3 - b, 5, 1, C.hairL);
    P(8, 6 - b, 5, 1, C.hair); P(8, 7 - b, 2, 1, C.hair); P(7, 7 - b, 1, 4, C.hair); P(16, 7 - b, 1, 4, C.hair);
    P(7, 9 - b, 1, 2, C.skinD); P(16, 9 - b, 1, 2, C.skinD);
    if (pose.blink) { P(10, 10 - b, 2, 1, C.eye); P(13, 10 - b, 2, 1, C.eye); }
    else { P(10, 9 - b, 1, 2, C.eye); P(13, 9 - b, 1, 2, C.eye); P(10, 9 - b, 1, 1, "#ffffff", 0.35); }
    P(11, 12 - b, 2, 1, C.skinD);
  } else {
    P(8, 6 - b, 8, 8, C.hair); P(7, 3 - b, 10, 8, C.hair); P(8, 2 - b, 8, 1, C.hair); P(9, 3 - b, 6, 1, C.hairL); P(10, 5 - b, 4, 1, C.hairL);
    P(7, 9 - b, 1, 2, C.skinD); P(16, 9 - b, 1, 2, C.skinD); P(9, 13 - b, 6, 1, C.skinD);
  }
}

function paintSamSide(P, frame, pose) {
  const C = SAM, b = pose.bob;
  // Stride: [back foot x, front foot x] per frame.
  const stride = { walk0: [-3, 3], walk1: [0, 0], walk2: [3, -3], walk3: [0, 0] }[frame] ?? [0, 0];
  const leg = (dx, color, lift) => { P(10 + Math.round(dx / 2), 23, 4, 3, color); P(10 + dx, 26 - lift, 4, 3, color); P(10 + dx, 29 - lift, 6, 2, C.shoe); };
  leg(stride[0], C.pantsD, pose.lift[0] ? 1 : 0);
  // Bag behind, on the hip.
  P(6, 18 - b, 4, 7, C.bag); P(6, 24 - b, 4, 1, C.bagD);
  // Torso.
  P(9, 15 - b, 7, 8, C.shirt); P(9, 15 - b, 1, 8, C.shirtD); P(15, 16 - b, 1, 5, C.tie); P(14, 17 - b, 1, 2, C.badge);
  P(9, 22 - b, 7, 1, C.pantsD);
  for (let k = 0; k < 4; k++) P(10 + k, 15 - b + k, 1, 1, C.bagD);
  leg(stride[1], C.pants, pose.lift[1] ? 1 : 0);
  // Near arm swings forward and back.
  const s = pose.swing;
  P(11 + s, 16 - b, 3, 6, C.shirtD); P(11 + s * 2, 22 - b, 3, 2, C.skin);
  // Head in profile, facing right.
  P(11, 14 - b, 3, 1, C.skinD);
  P(11, 6 - b, 6, 8, C.skin); P(17, 9 - b, 1, 2, C.skin); P(12, 13 - b, 4, 1, C.skin);
  P(8, 3 - b, 9, 4, C.hair); P(9, 2 - b, 7, 1, C.hair); P(10, 3 - b, 5, 1, C.hairL); P(8, 7 - b, 4, 5, C.hair); P(15, 6 - b, 2, 1, C.hair);
  P(11, 9 - b, 1, 2, C.skinD); // ear
  if (pose.blink) P(14, 10 - b, 2, 1, C.eye); else { P(15, 9 - b, 1, 2, C.eye); }
  P(15, 12 - b, 2, 1, C.skinD);
}

// ---------- Warden ----------
const WARDEN = {
  foot: "#151920", footL: "#262c38", pelvis: "#20252f", arm: "#2c323e", body: "#3a4150", bodyL: "#55607a",
  headL: "#5b6578", shade: "#262b36", visor: "#06080b", claw: "#555e6e", antenna: "#4a5262", panel: "#2f3542",
};
const WARDEN_POSE = {
  idle0: { bob: 0, lift: [0, 0], swing: 0, eye: -2, pulse: 1 }, idle1: { bob: 0, lift: [0, 0], swing: 0, eye: 0, pulse: 0.6 },
  idle2: { bob: 0, lift: [0, 0], swing: 0, eye: 2, pulse: 1 }, idle3: { bob: 0, lift: [0, 0], swing: 0, eye: 0, pulse: 0.6 },
  walk0: { bob: 0, lift: [0, 2], swing: 1, eye: 0, pulse: 1 }, walk1: { bob: 1, lift: [0, 0], swing: 0, eye: 0, pulse: 1 },
  walk2: { bob: 0, lift: [2, 0], swing: -1, eye: 0, pulse: 1 }, walk3: { bob: 1, lift: [0, 0], swing: 0, eye: 0, pulse: 1 },
};

function paintWarden(P, row, frame, color = "#ff1f3d") {
  const C = WARDEN, pose = WARDEN_POSE[frame], b = pose.bob;
  const eye = color, eyeL = shade(color, 0.65), eyeD = shade(color, -0.55);
  if (row === "side") return paintWardenSide(P, frame, pose, eye, eyeL, eyeD);
  const front = row === "down";
  // Legs and feet.
  const leg = (x, lift) => { P(x, 30 - lift, 5, 6, C.foot); P(x, 33 - lift, 5, 1, C.footL); P(x - 1, 36 - lift, 7, 2, C.foot); P(x - 1, 36 - lift, 7, 1, C.footL); };
  leg(10, pose.lift[0]); leg(17, pose.lift[1]);
  P(10, 28 - b, 12, 2, C.pelvis);
  // Arms with pincer claws; the forward arm's claw rises.
  const arm = (x, up) => { P(x, 17 - b - up, 3, 11, C.arm); P(x, 16 - b - up, 3, 2, C.claw); P(x - 1, 28 - b - up, 1, 2, C.claw); P(x + 3, 28 - b - up, 1, 2, C.claw); P(x, 28 - b - up, 3, 1, C.claw); };
  arm(2, Math.max(0, pose.swing)); arm(27, Math.max(0, -pose.swing));
  // Torso.
  P(6, 16 - b, 20, 12, C.body); P(6, 16 - b, 20, 1, C.bodyL); P(6, 27 - b, 20, 1, C.shade); P(6, 17 - b, 1, 10, C.arm); P(25, 17 - b, 1, 10, C.arm);
  if (front) {
    P(11, 20 - b, 10, 2, eye, pose.pulse); P(12, 20 - b, 8, 1, eyeL, pose.pulse * 0.8); // chest light bar
    P(10, 24 - b, 12, 1, C.panel); P(10, 25 - b, 1, 2, C.panel); P(21, 25 - b, 1, 2, C.panel);
  } else {
    P(12, 19 - b, 8, 7, C.shade); P(15, 21 - b, 2, 2, eye, pose.pulse); // power-core hatch with a status light
    P(9, 18 - b, 1, 8, C.panel); P(22, 18 - b, 1, 8, C.panel);
  }
  P(13, 15 - b, 6, 1, C.pelvis); // neck
  // Head.
  P(8, 5 - b, 16, 10, C.body); P(9, 5 - b, 14, 1, C.headL); P(8, 6 - b, 1, 8, C.arm); P(23, 6 - b, 1, 8, C.arm); P(9, 14 - b, 14, 1, C.shade);
  const ax = front ? 20 : 11;
  P(ax, 1 - b, 1, 4, C.antenna); P(ax, 0 - b, 1, 1, pose.pulse > 0.8 ? eye : eyeD);
  if (front) {
    P(10, 8 - b, 12, 5, C.visor);
    const ex = 14 + pose.eye;
    P(ex - 1, 9 - b, 6, 3, eye, 0.3); // glow
    P(ex, 10 - b, 4, 2, eye); P(ex + 1, 10 - b, 2, 1, eyeL);
    for (let k = 11; k < 21; k += 2) P(k, 13 - b, 1, 1, C.shade); // cheek vents
  } else {
    for (const y of [8, 10, 12]) P(11, y - b, 10, 1, C.shade); // cooling slats
  }
}

function paintWardenSide(P, frame, pose, eye, eyeL, eyeD) {
  const C = WARDEN, b = pose.bob;
  const stride = { walk0: [-3, 3], walk1: [0, 0], walk2: [3, -3], walk3: [0, 0] }[frame] ?? [0, 0];
  const leg = (dx, color, lift) => { P(13 + Math.round(dx / 2), 30, 5, 3, color); P(13 + dx, 33 - lift, 5, 3, color); P(13 + dx, 36 - lift, 8, 2, C.foot); P(13 + dx, 36 - lift, 8, 1, C.footL); };
  leg(stride[0], "#0e1116", pose.lift[0] ? 1 : 0);
  P(12, 28 - b, 9, 2, C.pelvis);
  // Torso, side on: the light bar wraps onto its front edge.
  P(9, 16 - b, 14, 12, C.body); P(9, 16 - b, 14, 1, C.bodyL); P(9, 27 - b, 14, 1, C.shade); P(9, 17 - b, 1, 10, C.arm);
  P(21, 20 - b, 2, 2, eye, pose.pulse); P(11, 19 - b, 4, 6, C.shade);
  leg(stride[1], C.foot, pose.lift[1] ? 1 : 0);
  // Near arm.
  const s = pose.swing * 2;
  P(14 + s, 17 - b, 4, 10, C.arm); P(14 + s, 16 - b, 4, 2, C.claw); P(13 + s, 27 - b, 6, 1, C.claw); P(13 + s, 28 - b, 1, 2, C.claw); P(18 + s, 28 - b, 1, 2, C.claw);
  P(14, 15 - b, 5, 1, C.pelvis);
  // Head with the visor on its face (right).
  P(9, 5 - b, 15, 10, C.body); P(10, 5 - b, 13, 1, C.headL); P(9, 6 - b, 1, 8, C.arm); P(10, 14 - b, 13, 1, C.shade);
  P(12, 1 - b, 1, 4, C.antenna); P(12, 0 - b, 1, 1, pose.pulse > 0.8 ? eye : eyeD);
  P(17, 8 - b, 7, 5, C.visor);
  const ex = 19 + Math.sign(pose.eye);
  P(ex - 1, 9 - b, 5, 3, eye, 0.3); P(ex, 10 - b, 3, 2, eye); P(ex + 1, 10 - b, 1, 1, eyeL);
  for (let k = 11; k < 16; k += 2) P(k, 9 - b, 1, 3, C.shade); // ear vents
}

// ---------- Drone ----------
function paintDrone(P, row, frame, color = "#ffb020") {
  const on = frame.startsWith("on"), spin = Number(frame.slice(-1));
  const body = on ? color : shade(color, -0.35), bodyD = shade(body, -0.4), bodyL = shade(body, 0.45);
  const metal = "#2b2f36", metalL = "#4a5160";
  // Rotors at the four corners (back pair higher up): hub, a spinning blade and a blur disc.
  const rotor = (cx, cy) => {
    P(cx - 5, cy, 11, 1, "#c8d0da", on ? 0.3 : 0.18); P(cx - 4, cy - 1, 9, 3, "#c8d0da", on ? 0.18 : 0.1);
    const blades = [[[-4, 0], [-3, 0], [-2, 0], [2, 0], [3, 0], [4, 0]], [[-3, -1], [-2, -1], [2, 1], [3, 1]], [[-1, 0], [1, 0]], [[-3, 1], [-2, 1], [2, -1], [3, -1]]][spin];
    for (const [dx, dy] of blades) P(cx + dx, cy + dy, 1, 1, "#d9dee6");
    P(cx - 1, cy, 2, 2, metal); P(cx - 1, cy + 2, 2, 2, metalL);
  };
  // Arms out to the rotors.
  for (const [x, y, w] of [[6, 7, 5], [21, 7, 5], [6, 15, 5], [21, 15, 5]]) P(x, y, w, 2, metal);
  rotor(5, 5); rotor(26, 5);
  // Body.
  P(10, 8, 12, 9, body); P(11, 7, 10, 1, body); P(11, 17, 10, 1, bodyD); P(10, 8, 12, 1, bodyL); P(10, 16, 12, 1, bodyD);
  P(10, 9, 1, 7, bodyD); P(21, 9, 1, 7, bodyD);
  for (let k = 12; k < 20; k += 2) P(k, 14, 1, 1, bodyD); // vents
  // Camera eye.
  P(14, 10, 4, 4, "#0b0c10"); P(15, 11, 2, 2, on ? "#ff3b4a" : "#5a1820"); if (on) P(15, 11, 1, 1, "#ffc2c7");
  // Running lights; while recharging they're off and a red pip blinks.
  P(11, 9, 2, 1, on ? "#fff3c4" : "#5e5130"); P(19, 9, 2, 1, on ? "#fff3c4" : "#5e5130");
  if (!on && spin % 2 === 0) P(16, 7, 1, 1, "#ff3b4a");
  // Landing skids.
  P(12, 18, 1, 3, metal); P(19, 18, 1, 3, metal); P(10, 21, 5, 1, metalL); P(17, 21, 5, 1, metalL);
  rotor(5, 14); rotor(26, 14);
  if (on) { P(12, 23, 8, 1, color, 0.35); P(14, 24, 4, 1, color, 0.2); } // thrust glow
}

const PAINT = { player: (P, row, frame) => paintSam(P, row, frame), warden: paintWarden, drone: paintDrone };

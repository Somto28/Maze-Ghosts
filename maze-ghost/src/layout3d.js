// layout3d.js — turns a level into 3D positions any renderer can use (Three.js, Babylon, A-Frame…).
//
// The game logic stays on a flat grid; only the drawing is 3D.
//   grid column -> x (left/right),  grid row -> z (toward the camera),  y = height.
// One grid tile = `tileSize` world units. Everything sits on the floor at y = 0.

import { parseMaze } from "./maze.js";

/** Grid tile -> world position of the tile's centre on the floor. */
export function gridToWorld(pos, tileSize = 1) {
  return { x: pos.c * tileSize, y: 0, z: pos.r * tileSize };
}

/** World position -> nearest grid tile (e.g. for clicking on the floor). */
export function worldToGrid(point, tileSize = 1) {
  return { r: Math.round(point.z / tileSize), c: Math.round(point.x / tileSize) };
}

/**
 * Everything a 3D scene needs for one level.
 * @param {{ maze: string[], theme?: object }} level
 * @param {{ tileSize?: number }} [options]
 */
export function buildLayout3D(level, { tileSize = 1 } = {}) {
  const { grid, exits, player, ghost } = parseMaze(level.maze);
  const theme = { wallHeight: 1, wallColor: "#5b6b82", floorColor: "#1e2633", ghostColor: "#ff5a5a", fog: 0.02, light: 1, ...level.theme };
  const rows = grid.length;
  const cols = grid[0].length;
  const h = theme.wallHeight;

  const walls = [];
  const floorTiles = [];
  grid.forEach((row, r) =>
    row.forEach((tile, c) => {
      const { x, z } = gridToWorld({ r, c }, tileSize);
      if (tile === "#") {
        // A box: centre at half the wall height so it stands on the floor.
        walls.push({ r, c, position: { x, y: h / 2, z }, size: { x: tileSize, y: h, z: tileSize } });
      } else {
        floorTiles.push({ r, c, position: { x, y: 0, z }, isExit: tile === "E" });
      }
    }),
  );

  const width = cols * tileSize;
  const depth = rows * tileSize;
  const center = { x: (width - tileSize) / 2, y: 0, z: (depth - tileSize) / 2 };
  const span = Math.max(width, depth);

  return {
    tileSize,
    rows,
    cols,
    theme,
    /** The floor plane, centred under the maze. */
    floor: { position: center, size: { x: width, z: depth } },
    walls,
    floorTiles,
    exits: exits.map((e) => ({ ...e, position: gridToWorld(e, tileSize) })),
    playerStart: { ...player, position: gridToWorld(player, tileSize) },
    ghostStart: { ...ghost, position: gridToWorld(ghost, tileSize) },
    /** A tilted overhead camera that fits the whole maze; tall walls get a steeper angle so they don't hide the player. */
    camera: {
      position: { x: center.x, y: span * 0.9 + h * 2, z: center.z + span * (0.8 - h * 0.22) },
      lookAt: center,
      fov: 45,
    },
  };
}

// maze.js — how a maze is represented: tiles, legal moves and walking distance.
//
// Map key:  #  wall    .  floor    E  exit    P  player start    G  ghost start
//
// The grid only holds terrain. The player and ghost positions are stored separately,
// so the grid never changes during a level.

/** @typedef {{ r: number, c: number }} Pos */
/** @typedef {"up" | "down" | "left" | "right" | "wait"} Dir */
/** @typedef {Pos & { dir: Dir }} Move */
/** @typedef {"#" | "." | "E"} Tile */
/** @typedef {ReadonlyArray<ReadonlyArray<Tile>>} Grid */

/** @type {ReadonlyArray<{ dir: Dir, dr: number, dc: number }>} */
export const DIRS = Object.freeze([
  { dir: "up", dr: -1, dc: 0 },
  { dir: "down", dr: 1, dc: 0 },
  { dir: "left", dr: 0, dc: -1 },
  { dir: "right", dr: 0, dc: 1 },
  { dir: "wait", dr: 0, dc: 0 },
]);

/** @param {Pos} a @param {Pos} b */
export const samePos = (a, b) => a.r === b.r && a.c === b.c;

/**
 * Turn a text map into grid + start positions.
 * @param {readonly string[]} lines
 * @returns {{ grid: Grid, exits: Pos[], player: Pos, ghost: Pos }}
 */
export function parseMaze(lines) {
  const width = lines[0]?.length ?? 0;
  if (lines.length === 0 || width === 0) throw new Error("Maze is empty");
  if (lines.some((l) => l.length !== width)) throw new Error("Maze rows must all be the same length");

  /** @type {Pos[]} */ const exits = [];
  /** @type {Pos[]} */ const players = [];
  /** @type {Pos[]} */ const ghosts = [];

  const grid = lines.map((line, r) =>
    Object.freeze(
      [...line].map((ch, c) => {
        switch (ch) {
          case "#": return "#";
          case ".": return ".";
          case "E": exits.push({ r, c }); return "E";
          case "P": players.push({ r, c }); return ".";
          case "G": ghosts.push({ r, c }); return ".";
          default: throw new Error(`Unknown tile '${ch}' at row ${r}, col ${c}`);
        }
      }),
    ),
  );

  if (players.length !== 1) throw new Error("Maze needs exactly one P (player)");
  if (ghosts.length !== 1) throw new Error("Maze needs exactly one G (ghost)");
  if (exits.length === 0) throw new Error("Maze needs at least one E (exit)");

  return { grid: Object.freeze(grid), exits, player: players[0], ghost: ghosts[0] };
}

/** Can this actor stand on (r, c)? The ghost can't pass through exit doors. */
export function canEnter(grid, r, c, who) {
  const tile = grid[r]?.[c];
  if (tile === undefined || tile === "#") return false;
  return !(who === "ghost" && tile === "E");
}

/**
 * Every move an actor can make from `from`. Waiting in place is always allowed.
 * @param {Grid} grid @param {Pos} from @param {"player" | "ghost"} who
 * @returns {Move[]}
 */
export function legalMoves(grid, from, who, allowWait = true) {
  /** @type {Move[]} */ const moves = [];
  for (const d of DIRS) {
    if (!allowWait && d.dir === "wait") continue;
    const r = from.r + d.dr;
    const c = from.c + d.dc;
    if (d.dir === "wait" || canEnter(grid, r, c, who)) moves.push({ dir: d.dir, r, c });
  }
  return moves;
}

// Breadth-first search distances, cached per grid, per actor and per starting tile.
// The grid never changes during a level, so each tile is searched from at most once.
const cache = new WeakMap();

/**
 * Walking distance from `from` to every tile for this actor (index = r * cols + c, -1 = unreachable).
 * @returns {Int32Array}
 */
export function distancesFrom(grid, from, who) {
  const rows = grid.length;
  const cols = grid[0].length;
  let perGrid = cache.get(grid);
  if (!perGrid) cache.set(grid, (perGrid = new Map()));
  const start = from.r * cols + from.c;
  const key = who + ":" + start;
  const hit = perGrid.get(key);
  if (hit) return hit;

  const dist = new Int32Array(rows * cols).fill(-1);
  dist[start] = 0;
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    const here = { r: Math.floor(cur / cols), c: cur % cols };
    for (const m of legalMoves(grid, here, who, false)) {
      const k = m.r * cols + m.c;
      if (dist[k] === -1) {
        dist[k] = dist[cur] + 1;
        queue.push(k);
      }
    }
  }
  perGrid.set(key, dist);
  return dist;
}

/** True walking distance through the maze (not straight-line). Infinity if there's no path. */
export function mazeDistance(grid, a, b, who) {
  const d = distancesFrom(grid, a, who)[b.r * grid[0].length + b.c];
  return d < 0 ? Infinity : d;
}

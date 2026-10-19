// maze.js — how a maze is represented: tiles, legal moves and walking distance.
//
// Map key:  #  wall    .  floor    E  exit    P  player start
//           G  warden start (plans with minimax; one G per warden)
//           D  drone start (fast and rule-based: dashes 2 tiles straight at you every turn)
//           K  evidence drive (pick up every one before the exit unlocks)
//           1-4  vent grates, in pairs: step onto a grate and you crawl out of the grate with the
//              same number (one move). Wardens and drones can't use vents or stand on a grate.
//
// The grid only holds terrain. The player and ghost positions are stored separately,
// so the grid never changes during a level.

/** @typedef {{ r: number, c: number }} Pos */
/** @typedef {"up" | "down" | "left" | "right" | "wait"} Dir */
/** @typedef {Pos & { dir: Dir, vent?: string }} Move  vent: set when this move crawls through a vent (r, c is where you come out) */
/** @typedef {"#" | "." | "E" | "K" | "1" | "2" | "3" | "4"} Tile */
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

/** Wardens plan their moves together, and the work grows ×5 per warden, so keep teams small. */
export const MAX_GHOSTS = 3;
/** Drones follow a fixed rule, so they cost the search almost nothing; two is plenty on screen. */
export const MAX_DRONES = 2;

/**
 * Turn a text map into grid + start positions.
 * @param {readonly string[]} lines
 * `ghosts` lists every enemy (wardens and drones) in reading order; `roles[i]` says which one it is.
 * @returns {{ grid: Grid, exits: Pos[], player: Pos, ghosts: Pos[], roles: ("warden" | "drone")[], keys: Pos[] }}
 */
export function parseMaze(lines) {
  const width = lines[0]?.length ?? 0;
  if (lines.length === 0 || width === 0) throw new Error("Maze is empty");
  if (lines.some((l) => l.length !== width)) throw new Error("Maze rows must all be the same length");

  /** @type {Pos[]} */ const exits = [];
  /** @type {Pos[]} */ const players = [];
  /** @type {Pos[]} */ const ghosts = [];
  /** @type {("warden" | "drone")[]} */ const roles = [];
  /** @type {Pos[]} */ const keys = [];

  const grid = lines.map((line, r) =>
    Object.freeze(
      [...line].map((ch, c) => {
        switch (ch) {
          case "#": return "#";
          case ".": return ".";
          case "E": exits.push({ r, c }); return "E";
          case "P": players.push({ r, c }); return ".";
          case "1": case "2": case "3": case "4": return ch;
          case "K": keys.push({ r, c }); return "K";
          case "G": ghosts.push({ r, c }); roles.push("warden"); return ".";
          case "D": ghosts.push({ r, c }); roles.push("drone"); return ".";
          default: throw new Error(`Unknown tile '${ch}' at row ${r}, col ${c}`);
        }
      }),
    ),
  );

  if (players.length !== 1) throw new Error("Maze needs exactly one P (player)");
  const wardens = roles.filter((r) => r === "warden").length;
  if (ghosts.length === 0) throw new Error("Maze needs at least one G (ghost) or D (drone)");
  if (wardens > MAX_GHOSTS) throw new Error(`Maze can have at most ${MAX_GHOSTS} ghosts`);
  if (ghosts.length - wardens > MAX_DRONES) throw new Error(`Maze can have at most ${MAX_DRONES} drones`);
  if (keys.length > 3) throw new Error("Maze can have at most 3 evidence drives (K)");
  if (exits.length === 0) throw new Error("Maze needs at least one E (exit)");
  for (const [id, ends] of ventsOf(grid)) {
    if (ends.length !== 2) throw new Error(`Vent ${id} needs exactly two grates (found ${ends.length})`);
    for (const e of ends) {
      if (DIRS.some((d) => d.dir !== "wait" && isVent(grid[e.r + d.dr]?.[e.c + d.dc]))) throw new Error(`Vent grates can't touch each other (vent ${id})`);
    }
  }

  return { grid: Object.freeze(grid), exits, player: players[0], ghosts, roles, keys };
}

/** Is this tile a vent grate? */
export const isVent = (tile) => tile >= "1" && tile <= "4";

// Vent pairs per grid: id -> [grate, grate]. The grid never changes, so this is worked out once.
const ventCache = new WeakMap();
function ventsOf(grid) {
  let vents = ventCache.get(grid);
  if (vents) return vents;
  vents = new Map();
  grid.forEach((row, r) => row.forEach((tile, c) => {
    if (!isVent(tile)) return;
    if (!vents.has(tile)) vents.set(tile, []);
    vents.get(tile).push({ r, c });
  }));
  ventCache.set(grid, vents);
  return vents;
}

/** Every vent in the maze: [{ id, a, b }], a and b being its two grates. */
export function ventPairs(grid) {
  return [...ventsOf(grid)].filter(([, ends]) => ends.length === 2).map(([id, [a, b]]) => ({ id, a, b }));
}

/** The grate at the other end of the vent whose grate is at (r, c). */
export function ventExit(grid, r, c) {
  const ends = ventsOf(grid).get(grid[r][c]);
  return ends && (ends[0].r === r && ends[0].c === c ? ends[1] : ends[0]);
}

/** Can this actor stand on (r, c)? Ghosts (wardens and drones) can't pass exit doors or use vents. */
export function canEnter(grid, r, c, who) {
  const tile = grid[r]?.[c];
  if (tile === undefined || tile === "#") return false;
  return !(who === "ghost" && (tile === "E" || isVent(tile)));
}

/**
 * Every move an actor can make from `from`. Waiting in place is always allowed (unless allowWait is false).
 * For the player, stepping onto a vent grate is a crawl: the move lands on the OTHER grate of that vent.
 * @param {Grid} grid @param {Pos} from @param {"player" | "ghost"} who
 * @returns {Move[]}
 */
export function legalMoves(grid, from, who, allowWait = true) {
  /** @type {Move[]} */ const moves = [];
  for (const d of DIRS) {
    if (!allowWait && d.dir === "wait") continue;
    const r = from.r + d.dr;
    const c = from.c + d.dc;
    if (d.dir === "wait") { moves.push({ dir: d.dir, r, c }); continue; }
    if (!canEnter(grid, r, c, who)) continue;
    if (who === "player" && isVent(grid[r][c])) {
      const out = ventExit(grid, r, c);
      moves.push({ dir: d.dir, r: out.r, c: out.c, vent: grid[r][c] });
    } else moves.push({ dir: d.dir, r, c });
  }
  return moves;
}

// Each tile's neighbours (where one move takes you), per grid and actor, as flat index lists.
// `into` is the same graph reversed (where you can come FROM in one move), for distances TO a tile.
const graphCache = new WeakMap();
export function moveGraph(grid, who) {
  let perGrid = graphCache.get(grid);
  if (!perGrid) graphCache.set(grid, (perGrid = {}));
  if (perGrid[who]) return perGrid[who];
  const cols = grid[0].length;
  const size = grid.length * cols;
  const out = Array.from({ length: size }, () => []);
  const into = Array.from({ length: size }, () => []);
  for (let k = 0; k < size; k++) {
    const r = Math.floor(k / cols), c = k % cols;
    if (!canEnter(grid, r, c, who) && !(who === "ghost" && grid[r][c] !== "#")) continue;
    for (const m of legalMoves(grid, { r, c }, who, false)) {
      const t = m.r * cols + m.c;
      out[k].push(t);
      into[t].push(k);
    }
  }
  return (perGrid[who] = { out, into });
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

  const dist = bfs(moveGraph(grid, who).out, start, rows * cols);
  perGrid.set(key, dist);
  return dist;
}

/**
 * Walking distance from every tile TO `to` (index = r * cols + c, -1 = can't get there).
 * Vents make the player's moves one-way (you go in one grate and come out the other), so
 * "from A to B" and "from B to A" can differ; use this when you need the distance to a goal.
 * @returns {Int32Array}
 */
export function distancesTo(grid, to, who) {
  const cols = grid[0].length;
  let perGrid = cache.get(grid);
  if (!perGrid) cache.set(grid, (perGrid = new Map()));
  const start = to.r * cols + to.c;
  const key = who + ">" + start;
  const hit = perGrid.get(key);
  if (hit) return hit;
  const dist = bfs(moveGraph(grid, who).into, start, grid.length * cols);
  perGrid.set(key, dist);
  return dist;
}

function bfs(edges, start, size) {
  const dist = new Int32Array(size).fill(-1);
  dist[start] = 0;
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    for (const k of edges[cur]) {
      if (dist[k] === -1) {
        dist[k] = dist[cur] + 1;
        queue.push(k);
      }
    }
  }
  return dist;
}

/** True walking distance through the maze (not straight-line). Infinity if there's no path. */
export function mazeDistance(grid, a, b, who) {
  const d = distancesFrom(grid, a, who)[b.r * grid[0].length + b.c];
  return d < 0 ? Infinity : d;
}

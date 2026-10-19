// ai.js — the ghosts' brain: ADVERSARIAL SEARCH (minimax with alpha-beta pruning).
//
// The ghosts and the player are opponents taking turns:
//   * The ghosts are MAX: they want the score as HIGH as possible.
//   * The player is MIN: the ghosts assume the player always picks the move that is worst for them.
// The ghosts imagine their move, the player's best reply, their next move, and so on, up to their
// LOOKAHEAD. That lookahead is the difficulty: each level, the ghosts look further ahead.
//
// With several wardens, they plan as ONE team: a "team move" is one step for every warden at once,
// and the search tries every combination. That's what lets them coordinate (one chases, one cuts
// you off) instead of each chasing on its own.
//
// DRONES are different on purpose. They don't search at all: each turn a drone dashes straight at
// where you are NOW (a fixed rule, like Level 1's ghost), as far as its `dronePattern` allows that
// turn: [2, 0] means dash 2 tiles, then recharge for a turn, and repeat.
// The wardens know that rule, so inside their search they move the drones exactly as the drones
// will really move. Fast but predictable vs slow but smart: that contrast is the lesson.
//
// LEARNING wardens (levels with `learns: true`) get `habits`: which way you went on each tile in
// your earlier caught attempts. From any tile they can trace "your usual route" from there. Whenever
// several moves are equally good, they pick the one that best AMBUSHES that route (reaches a tile on
// it before you do). They never play a worse move because of your habits, so learning can only help
// them; it just puts them where you went last time.

import { distancesFrom, isVent, legalMoves, moveGraph, samePos } from "./maze.js";
import { averageSpeed, exitsOpen, goalField, moveGhosts, movePlayer, outcome, playerMoves, speedOf } from "./rules.js";

/** @typedef {import("./rules.js").GameState} GameState */
/** @typedef {import("./maze.js").Move} Move */
/** @typedef {import("./maze.js").Dir} Dir */
/** @typedef {import("./maze.js").Pos} Pos */
/** @typedef {{ dir: string, dirs: string[], to: Pos[], paths: Pos[][] }} TeamMove  dir is a label, e.g. "left" or "left + up"; paths = tiles each enemy passes through */

const DIR_ORDER = ["up", "down", "left", "right"];

/** Score of a catch (or minus this for an escape). Bigger than any normal position. */
export const WIN = 1000;

/**
 * How the ghosts judge a position they can't see past. Change these to change their personality.
 * A level can override any of them with its own `weights`.
 */
export const WEIGHTS = Object.freeze({
  /** Per turn the nearest enemy needs to reach the player (closer is better for the ghosts). */
  chase: 10,
  /** Per tile the player still has to walk: to the exit, via any evidence still on the floor. */
  playerFromExit: 4,
  /** Per tile between each OTHER ghost and the player: brings the whole team in, not just the nearest. */
  pack: 0,
  /** Per floor tile the player can reach before any enemy can (a smaller "safe zone" = cornered). */
  territory: 1,
  /**
   * The big one. If you have a SAFE RUN (a path to the goal where you reach every tile before any
   * enemy could), you will escape no matter what they do, so they treat that position as nearly
   * lost. This is what makes them cut you off and guard the way out instead of chasing your back.
   */
  cutoff: 400,
  /** Learning levels: how much an ambush on your usual route is worth (more for an earlier ambush). */
  habit: 12,
});

/** How far along your usual route the learning wardens look for an ambush. */
const ROUTE_STEPS = 8;
const DIR_STEP = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };

/** Habits as a per-tile lookup (tile index -> next tile index on your usual route, or -1). */
export function habitGrid(grid, habits) {
  const cols = grid[0].length;
  const next = new Int32Array(grid.length * cols).fill(-1);
  for (const [tile, dir] of Object.entries(habits)) {
    const [r, c] = tile.split(",").map(Number);
    if (!DIR_STEP[dir] || grid[r]?.[c] === undefined) continue;
    const m = legalMoves(grid, { r, c }, "player", false).find((x) => x.dir === dir); // a vent move lands at the far grate
    if (m) next[r * cols + c] = m.r * cols + m.c;
  }
  return next;
}

// Scratch space for the safe-run search, reused between calls (it runs at every leaf of the search).
let safeSeen = new Int32Array(0), safeQueue = new Int32Array(0), safeDepth = new Int32Array(0), safeStamp = 0;

/**
 * Where can the player get to SAFELY: arriving on each tile strictly before any enemy could get there
 * (so nobody can be waiting, and nobody can step on them while they pass)? Vent grates and exits are
 * always safe to step on, since enemies can't enter them.
 * @returns {{ size: number, free: boolean }} size = safe tiles; free = the goal is reachable this way.
 */
function safeRun(state, enemyTurns, open) {
  const { grid, player, exits } = state;
  const cols = grid[0].length;
  const size = grid.length * cols;
  if (safeSeen.length < size) {
    safeSeen = new Int32Array(size); safeQueue = new Int32Array(size); safeDepth = new Int32Array(size); safeStamp = 0;
  }
  const stamp = ++safeStamp;
  const out = moveGraph(grid, "player").out;
  const start = player.r * cols + player.c;
  // If it's the enemies' turn, they get one extra move before each of yours.
  const lead = state.turn === "ghost" ? 1 : 0;
  if (lead && !isVent(grid[player.r][player.c]) && enemyTurns(start) <= 1) return { size: 0, free: false };
  let head = 0, tail = 0, count = 0;
  safeSeen[start] = stamp; safeDepth[start] = 0; safeQueue[tail++] = start;
  while (head < tail) {
    const cur = safeQueue[head++];
    const d = safeDepth[cur] + 1; // the move on which the player would arrive
    for (const k of out[cur]) {
      if (safeSeen[k] === stamp) continue;
      const tile = grid[Math.floor(k / cols)][k % cols];
      if (tile === "E") { if (!open) continue; }
      else if (!isVent(tile) && d + lead >= enemyTurns(k)) continue; // an enemy could be there by then
      safeSeen[k] = stamp; safeDepth[k] = d; safeQueue[tail++] = k; count++;
    }
  }
  // Free = every remaining drive is safely reachable, and so is an exit (or the exit already is, if open).
  let free = true;
  const keys = state.keys ?? [];
  keys.forEach((k, i) => { if (!((state.collected >> i) & 1) && safeSeen[k.r * cols + k.c] !== stamp) free = false; });
  if (free) {
    if (open) free = exits.some((e) => safeSeen[e.r * cols + e.c] === stamp);
    else {
      // Exit locked: it isn't in the safe set, so ask whether a tile next to it is.
      free = exits.some((e) => moveGraph(grid, "player").into[e.r * cols + e.c].some((k) => safeSeen[k] === stamp || k === start));
    }
  }
  return { size: count, free };
}

/**
 * Score a position from the ghosts' point of view (higher = better for the ghosts).
 * @param {GameState} state
 * @param {Partial<typeof WEIGHTS>} [weights]
 * @returns {{ total: number, parts: Record<string, number> }}
 */
export function evaluate(state, weights = WEIGHTS, route = null) {
  const w = { ...WEIGHTS, ...weights };
  const end = outcome(state);
  if (end === "caught") return { total: WIN, parts: { caught: WIN } };
  if (end === "escaped") return { total: -WIN, parts: { escaped: -WIN } };

  const { grid, ghosts, player } = state;
  const cols = grid[0].length;
  const far = grid.length * cols; // stands in for "unreachable"
  const p = player.r * cols + player.c;

  // Turns each enemy needs to reach a tile: walking distance divided by its speed (drones are faster).
  const n = ghosts.length;
  const fromGhosts = new Array(n);
  const speeds = new Array(n);
  for (let i = 0; i < n; i++) {
    fromGhosts[i] = distancesFrom(grid, ghosts[i], "ghost");
    speeds[i] = averageSpeed(state, i);
  }
  const turns = (i, tile) => (fromGhosts[i][tile] < 0 ? far : Math.ceil(fromGhosts[i][tile] / speeds[i]));
  let nearest = Infinity, total = 0;
  for (let i = 0; i < n; i++) {
    const t = turns(i, p);
    total += t;
    if (t < nearest) nearest = t;
  }
  const others = total - nearest; // every enemy but the nearest
  const goal = goalField(state)[p];
  const playerToExit = goal < 0 ? far : goal;

  const parts = {
    chase: -w.chase * nearest,
    playerFromExit: w.playerFromExit * playerToExit,
  };
  if (w.pack) parts.pack = -w.pack * others;
  if (w.territory || w.cutoff) {
    const soonest = (tile) => {
      let best = far;
      for (let g = 0; g < n; g++) { const t = turns(g, tile); if (t < best) best = t; }
      return best;
    };
    const run = safeRun(state, soonest, exitsOpen(state));
    if (w.territory) parts.territory = -w.territory * run.size;
    if (w.cutoff && run.free) parts.cutoff = -w.cutoff;
  }
  // Learning wardens: follow your usual route from here and find the first tile on it that an
  // enemy can reach no later than you would. The sooner that ambush, the better for them.
  if (route && w.habit) {
    let tile = p;
    for (let step = 1; step <= ROUTE_STEPS; step++) {
      tile = route[tile];
      if (tile < 0) break;
      let ambush = false;
      for (let i = 0; i < n && !ambush; i++) if (turns(i, tile) <= step) ambush = true;
      if (ambush) { parts.habit = w.habit * (ROUTE_STEPS + 1 - step); break; }
    }
  }
  return { total: Object.values(parts).reduce((a, b) => a + b, 0), parts };
}

/**
 * Decide the ghosts' team move.
 * @param {GameState} state
 * @param {number} lookahead how many of their own moves the ghosts think ahead (1 = just this move + your reply)
 * @param {{ pruning?: boolean, memo?: boolean, rng?: (() => number) | null, weights?: Partial<typeof WEIGHTS>, habits?: Record<string, string> | null }} [options]
 *   pruning: alpha-beta on/off (same answer, off just checks more futures).
 *   memo: remember positions already scored this turn (same answer, fewer futures).
 *   rng: pass a random function to break ties randomly. Default null = always the same choice,
 *        which keeps levels predictable and lets the level checker prove they can be won.
 *   weights: this level's personality (see WEIGHTS).
 *   habits: learned from your earlier attempts, { "row,col": "dir" } (see habitsFrom in learning.js).
 */
export function chooseGhostMoves(state, lookahead, { pruning = true, memo = true, rng = null, weights = WEIGHTS, habits = null } = {}) {
  if (!Number.isInteger(lookahead) || lookahead < 1) throw new RangeError("lookahead must be a whole number ≥ 1");
  const depth = lookahead * 2; // plies: ghosts' move + player reply, repeated
  const root = { ...state, turn: "ghost" };
  const learned = habits && Object.keys(habits).length ? habits : null;
  const ctx = { pruning, table: memo ? new Map() : null, habits: learned, route: learned && habitGrid(state.grid, learned), weights: { ...WEIGHTS, ...weights }, stats: { futures: 0, prunes: 0 } };

  // Every top-level option is searched with a full window so ALL their scores are exact,
  // not only the winner's. That keeps the "what were the ghosts thinking" display honest.
  const options = orderedTeamMoves(root).map((m) => {
    const result = minimax(moveGhosts(root, m.to), depth - 1, -Infinity, Infinity, ctx);
    const reply = result.line[0];
    return {
      dir: m.dir,
      dirs: m.dirs,
      to: m.to,
      score: result.value,
      predictedPlayerReply: reply?.who === "player" ? reply.dir : null,
      /** Learning levels: true when the reply they expect is the move you made on that tile last time. */
      fromHabit: reply?.who === "player" && !!reply.habit,
      /** The future the ghosts expect if they make this move: ghosts, player, ghosts, player... */
      plan: [{ who: "ghost", dir: m.dir, at: m.to }, ...result.line],
      move: m,
    };
  });

  const best = Math.max(...options.map((o) => o.score));
  let ties = options.filter((o) => o.score === best);
  // Learning wardens: among moves that are equally good, take the one that best ambushes the route
  // you took last time. They never play a worse move because of your habits; they just break ties with them.
  if (ctx.route && ties.length > 1) {
    const ambush = (o) => evaluate({ ...moveGhosts(root, o.to), turn: "player" }, ctx.weights, ctx.route).parts.habit ?? 0;
    const top = Math.max(...ties.map(ambush));
    if (top > 0) ties = ties.filter((o) => ambush(o) === top);
  }
  const pick = rng ? ties[Math.min(ties.length - 1, Math.floor(rng() * ties.length))] : ties[0];

  return {
    move: pick.move,
    thinking: {
      lookahead,
      ghosts: state.ghosts.length,
      learned: ctx.habits ? Object.keys(ctx.habits).length : 0,
      futuresConsidered: ctx.stats.futures,
      branchesPruned: ctx.stats.prunes,
      options: options
        .sort((a, b) => b.score - a.score)
        .map(({ move, ...o }) => ({ ...o, chosen: move === pick.move })),
    },
  };
}

/**
 * Minimax score of a position searched `plies` half-moves deep (for tools, tests and hint systems).
 * @param {GameState} state @param {number} plies
 */
export function searchScore(state, plies, pruning = true, weights = WEIGHTS) {
  const ctx = { pruning, table: new Map(), habits: null, route: null, weights: { ...WEIGHTS, ...weights }, stats: { futures: 0, prunes: 0 } };
  return minimax(state, plies, -Infinity, Infinity, ctx).value;
}

// Positions the search has already scored this turn. Different orders of the same moves often lead
// to the same position (two wardens make this very common), so remembering them saves a lot of work.
const EXACT = 0, LOWER = 1, UPPER = 2;
function ttKey(s, depth) {
  const cols = s.grid[0].length, size = s.grid.length * cols;
  // A single number when it fits (much faster than building a string), otherwise a string.
  if (size ** (s.ghosts.length + 1) * 4096 < Number.MAX_SAFE_INTEGER) {
    let k = s.player.r * cols + s.player.c;
    for (const g of s.ghosts) k = k * size + g.r * cols + g.c;
    return ((k * 8 + (s.collected ?? 0)) * 16 + ((s.tick ?? 0) % (s.dronePattern?.length || 1))) * 32 + depth * 2 + (s.turn === "ghost" ? 1 : 0);
  }
  return `${s.turn[0]}${depth}|${s.player.r},${s.player.c}|${s.ghosts.map((g) => `${g.r},${g.c}`).join("|")}|${s.collected ?? 0}|${s.tick ?? 0}`;
}

/**
 * Classic minimax with alpha-beta pruning (and a memory of positions already scored this turn).
 * alpha = best score the ghosts are already guaranteed elsewhere; beta = best the player is guaranteed.
 * Plan steps: ghosts' steps have `at` = every ghost's tile; player steps have `at` = the player's tile.
 */
function minimax(state, depth, alpha, beta, ctx) {
  ctx.stats.futures++;

  // Catching sooner (more depth left) is worth a bit more; an escape sooner is worse for the ghosts.
  const end = outcome(state);
  if (end === "caught") return { value: WIN + depth, line: [] };
  if (end === "escaped") return { value: -WIN - depth, line: [] };
  if (depth === 0) return { value: evaluate(state, ctx.weights).total, line: [] };

  const key = ctx.table && ttKey(state, depth);
  const seen = ctx.table?.get(key);
  if (seen && (seen.flag === EXACT || (seen.flag === LOWER && seen.value >= beta) || (seen.flag === UPPER && seen.value <= alpha))) {
    return seen;
  }
  const alpha0 = alpha, beta0 = beta;

  const ghostTurn = state.turn === "ghost";
  const moves = ghostTurn ? orderedTeamMoves(state) : predictedPlayerMoves(state, ctx.habits);
  let best = null;

  for (const m of moves) {
    const child = ghostTurn ? moveGhosts(state, m.to) : movePlayer(state, m);
    const result = minimax(child, depth - 1, alpha, beta, ctx);

    if (!best || (ghostTurn ? result.value > best.value : result.value < best.value)) {
      const step = ghostTurn
        ? { who: "ghost", dir: m.dir, at: m.to }
        : { who: "player", dir: m.dir, at: { r: m.r, c: m.c }, ...(m.habit ? { habit: true } : {}) };
      best = { value: result.value, line: [step, ...result.line] };
    }
    if (ghostTurn) alpha = Math.max(alpha, result.value);
    else beta = Math.min(beta, result.value);

    // The other side already has a better option elsewhere, so it would never allow this branch.
    if (ctx.pruning && beta <= alpha) {
      ctx.stats.prunes++;
      break;
    }
  }
  // No legal move at all (the player is boxed in): treat it as a catch, it's only a turn away.
  best ??= { value: ghostTurn ? evaluate(state, ctx.weights).total : WIN + depth, line: [] };
  if (ctx.table) ctx.table.set(key, { value: best.value, line: best.line, flag: best.value <= alpha0 ? UPPER : best.value >= beta0 ? LOWER : EXACT });
  return best;
}

/**
 * Where a drone goes this turn: up to its speed this turn (see dronePattern), ending as close to the player as it can.
 * "Close" is the drone's walking distance; if it can't reach you at all (you're in a vent) it hovers
 * at the spot nearest you instead. Ties go up/down/left/right, so drones are fully predictable.
 * @returns {{ to: Pos, path: Pos[] }} path = every tile it passes through, ending on `to`.
 */
export function droneMove(state, i) {
  const { grid, player } = state;
  const cols = grid[0].length;
  const start = state.ghosts[i];
  const speed = speedOf(state, i);
  const chase = distancesFrom(grid, player, "ghost");
  const walk = distancesFrom(grid, player, "player");
  const metric = (k) => (chase[k] >= 0 ? chase[k] : walk[k] >= 0 ? 1000 + walk[k] : 1e6);

  // Short breadth-first search from the drone, at most `speed` steps.
  const startK = start.r * cols + start.c;
  const parent = new Map([[startK, -1]]);
  let frontier = [startK];
  let best = startK;
  for (let step = 0; step < speed && frontier.length; step++) {
    const next = [];
    for (const k of frontier) {
      const here = { r: Math.floor(k / cols), c: k % cols };
      if (samePos(here, player)) continue; // it already reached you: stop there
      for (const m of legalMoves(grid, here, "ghost", false)) {
        const mk = m.r * cols + m.c;
        if (parent.has(mk)) continue;
        parent.set(mk, k);
        next.push(mk);
        if (metric(mk) < metric(best)) best = mk;
      }
    }
    frontier = next;
  }
  const path = [];
  for (let k = best; k !== startK; k = parent.get(k)) path.unshift({ r: Math.floor(k / cols), c: k % cols });
  return { to: path.length ? path[path.length - 1] : { r: start.r, c: start.c }, path };
}

const stepDir = (a, b) => (b.r < a.r ? "up" : b.r > a.r ? "down" : b.c < a.c ? "left" : "right");
const dashLabel = (from, path, speed) => `drone ${path.length ? path.map((p, j) => stepDir(j ? path[j - 1] : from, p)).join("→") : speed ? "hovers" : "recharges"}`;

/**
 * Every team move: one step per warden, all combinations, except two wardens ending on the same tile.
 * Drones aren't choices: they always make their rule-based dash (droneMove), in every combination.
 * Most promising first (wardens closer to the player) so alpha-beta can prune more. Ties keep the
 * fixed up/down/left/right/wait order, so the wardens are fully predictable.
 * @param {GameState} state @returns {TeamMove[]}
 */
export function orderedTeamMoves(state) {
  const { grid, ghosts, player } = state;
  const cols = grid[0].length;
  const far = grid.length * cols;
  const toPlayer = distancesFrom(grid, player, "ghost");
  const d = (m) => (toPlayer[m.r * cols + m.c] < 0 ? far : toPlayer[m.r * cols + m.c]);

  let teams = [{ dirs: [], to: [], paths: [], cost: 0 }];
  ghosts.forEach((g, i) => {
    if (state.roles?.[i] === "drone") {
      const dash = droneMove(state, i);
      const label = dashLabel(g, dash.path, speedOf(state, i));
      for (const t of teams) { t.dirs.push(label); t.to.push(dash.to); t.paths.push(dash.path); }
      return;
    }
    const next = [];
    for (const t of teams) {
      for (const m of legalMoves(grid, g, "ghost")) {
        // Two wardens can't share a tile (drones fly over everyone, so they don't count).
        if (t.to.some((p, j) => state.roles?.[j] !== "drone" && samePos(p, m))) continue;
        const at = { r: m.r, c: m.c };
        next.push({ dirs: [...t.dirs, m.dir], to: [...t.to, at], paths: [...t.paths, m.dir === "wait" ? [] : [at]], cost: t.cost + d(m) });
      }
    }
    teams = next;
  });
  return teams.sort((a, b) => a.cost - b.cost).map(({ dirs, to, paths }) => ({ dir: dirs.join(" + "), dirs, to, paths }));
}

/**
 * The player moves the wardens consider, the ones heading for the goal first. On a learning level
 * the move you made on this tile last time goes first and is marked, so the HUD can say when the
 * reply they expect is "your habit".
 */
function predictedPlayerMoves(state, habits) {
  const moves = orderedPlayerMoves(state);
  const usual = habits?.[`${state.player.r},${state.player.c}`];
  const i = usual ? moves.findIndex((x) => x.dir === usual) : -1;
  if (i < 0) return moves;
  return [{ ...moves[i], habit: true }, ...moves.slice(0, i), ...moves.slice(i + 1)];
}

/** Player moves, the ones heading for the goal (evidence, then exit) first. @param {GameState} state */
function orderedPlayerMoves(state) {
  const field = goalField(state);
  const cols = state.grid[0].length;
  const far = state.grid.length * cols;
  const d = (m) => (field[m.r * cols + m.c] < 0 ? far : field[m.r * cols + m.c]);
  return playerMoves(state).sort((a, b) => d(a) - d(b) || DIR_ORDER.indexOf(a.dir) - DIR_ORDER.indexOf(b.dir));
}

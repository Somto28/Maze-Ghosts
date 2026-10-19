// rules.js — turns, moves and how the game ends.
// Every function returns a NEW state. Nothing is changed in place, which is what lets
// the wardens' search imagine many possible futures without disturbing the real game.
//
// A level can have several enemies. They all move on the enemies' turn (wardens one step each,
// drones as far as their dash pattern allows), and you're caught if any of them reaches your tile.
//
// Evidence drives (K): stepping on one picks it up. The exit stays locked until you hold them all.

import { distancesFrom, legalMoves, samePos } from "./maze.js";

/**
 * @typedef {import("./maze.js").Pos} Pos
 * @typedef {{
 *   grid: import("./maze.js").Grid,
 *   exits: readonly Pos[],
 *   keys: readonly Pos[],
 *   collected: number,
 *   player: Pos,
 *   ghosts: readonly Pos[],
 *   roles: readonly ("warden" | "drone")[],
 *   dronePattern: readonly number[],
 *   tick: number,
 *   turn: "player" | "ghost",
 * }} GameState
 * `collected` is a bitmask: bit i is set once keys[i] has been picked up.
 * `dronePattern` is how far drones move on each enemy turn, repeating: [2, 0] = dash 2, then recharge.
 * `tick` counts enemy turns, so everyone knows where drones are in their pattern.
 * @typedef {"caught" | "escaped" | null} Outcome
 */

/**
 * Can the player stand still for a turn? No: every turn you have to commit to a direction,
 * which is what makes reading the wardens' plan matter. (The wardens can still wait.)
 */
export const PLAYER_CAN_WAIT = false;

const allKeys = (state) => (1 << (state.keys?.length ?? 0)) - 1;
/** True once every evidence drive has been picked up (always true on levels without any). */
export const exitsOpen = (state) => ((state.collected ?? 0) & allKeys(state)) === allKeys(state);
/** How many evidence drives the player is holding. */
export function keysHeld(state) {
  let n = 0;
  for (let m = state.collected ?? 0; m; m &= m - 1) n++;
  return n;
}

/** @param {GameState} state @returns {Outcome} */
export function outcome(state) {
  if (state.ghosts.some((g) => samePos(g, state.player))) return "caught";
  if (exitsOpen(state) && state.exits.some((e) => samePos(e, state.player))) return "escaped";
  return null;
}

/** The player's legal moves: no walls, no waiting, and no stepping onto a locked exit. */
export function playerMoves(state) {
  const open = exitsOpen(state);
  return legalMoves(state.grid, state.player, "player", PLAYER_CAN_WAIT)
    .filter((m) => open || state.grid[m.r][m.c] !== "E");
}

/** Move the player (picking up any evidence there); then it's the enemies' turn. @param {GameState} state @param {Pos} to */
export function movePlayer(state, to) {
  let collected = state.collected ?? 0;
  if (state.grid[to.r][to.c] === "K") {
    const i = state.keys.findIndex((k) => samePos(k, to));
    if (i >= 0) collected |= 1 << i;
  }
  return { ...state, player: { r: to.r, c: to.c }, collected, turn: "ghost" };
}

/**
 * Move every enemy (one destination each, in the same order as state.ghosts); then it's the player's turn.
 * @param {GameState} state @param {readonly Pos[]} to
 */
export function moveGhosts(state, to) {
  return { ...state, ghosts: to.map((p) => ({ r: p.r, c: p.c })), tick: (state.tick ?? 0) + 1, turn: "player" };
}

const pattern = (state) => (state.dronePattern?.length ? state.dronePattern : [2]);
/** How many steps enemy i takes on the enemies' NEXT turn (wardens always 1; drones follow their pattern). */
export function speedOf(state, i) {
  if (state.roles?.[i] !== "drone") return 1;
  const p = pattern(state);
  return p[(state.tick ?? 0) % p.length];
}
/** A drone's average steps per turn (for judging positions beyond the search's horizon). */
export function averageSpeed(state, i) {
  if (state.roles?.[i] !== "drone") return 1;
  const p = pattern(state);
  return Math.max(0.5, p.reduce((a, b) => a + b, 0) / p.length);
}
/** Where drones are in their pattern: 0 = about to do the first entry. */
export const dronePhase = (state) => (state.tick ?? 0) % pattern(state).length;

// ---------- How far the player still has to go ----------
// Without evidence it's the walk to the nearest exit. With evidence left, it's the shortest tour:
// player -> every remaining drive (best order) -> exit. The wardens use this to predict where you
// HAVE to go, which is why they guard the drives.

const goalCache = new WeakMap();

/**
 * Walking distance from every tile to "done" (index = r * cols + c, -1 = can't finish from there),
 * for the drives still on the floor in `state`.
 * @returns {Int32Array}
 */
export function goalField(state) {
  const { grid, exits } = state;
  const keys = state.keys ?? [];
  const cols = grid[0].length;
  const mask = (state.collected ?? 0) & allKeys(state);
  // A level's drives and exits never move, so one cache per grid, indexed by which drives are left.
  let perGrid = goalCache.get(grid);
  if (!perGrid) goalCache.set(grid, (perGrid = []));
  const hit = perGrid[mask];
  if (hit) return hit;

  const size = grid.length * cols;
  const BIG = 1 << 20;
  const exitField = new Int32Array(size).fill(BIG);
  for (const e of exits) {
    const d = distancesFrom(grid, e, "player");
    for (let i = 0; i < size; i++) if (d[i] >= 0 && d[i] < exitField[i]) exitField[i] = d[i];
  }

  const left = keys.map((_, i) => i).filter((i) => !(mask & (1 << i)));
  const fromKey = keys.map((k) => distancesFrom(grid, k, "player"));
  const at = (arr, p) => (arr[p.r * cols + p.c] < 0 ? BIG : arr[p.r * cols + p.c]);
  // Shortest walk that starts on drive k, visits every drive in `rest`, then reaches an exit.
  const tail = (k, rest) => {
    if (rest.length === 0) return at(exitField, keys[k]);
    let best = BIG;
    for (const j of rest) best = Math.min(best, at(fromKey[k], keys[j]) + tail(j, rest.filter((x) => x !== j)));
    return best;
  };

  const field = new Int32Array(size);
  if (left.length === 0) {
    for (let i = 0; i < size; i++) field[i] = exitField[i] >= BIG ? -1 : exitField[i];
  } else {
    const tails = left.map((k) => tail(k, left.filter((x) => x !== k)));
    for (let i = 0; i < size; i++) {
      let best = BIG;
      left.forEach((k, n) => {
        const d = fromKey[k][i];
        if (d >= 0) best = Math.min(best, d + tails[n]);
      });
      field[i] = best >= BIG ? -1 : best;
    }
  }
  perGrid[mask] = field;
  return field;
}

/** Walking distance from `pos` to finishing the level (Infinity if impossible). */
export function goalDistance(state, pos = state.player) {
  const d = goalField(state)[pos.r * state.grid[0].length + pos.c];
  return d < 0 ? Infinity : d;
}

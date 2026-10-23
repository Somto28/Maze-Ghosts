// solver.js — level-design tool: can this maze be beaten against these ghosts?
//
// With tie-breaking turned off (the default), the ghosts always make the same move in the same
// situation. So the whole game is decided by where everyone stands, and a breadth-first search over
// those positions finds the SHORTEST winning route, or proves no route exists.

import { distancesFrom, parseMaze, samePos } from "./maze.js";
import { chooseGhostMoves } from "./ai.js";
import { averageSpeed, exitsOpen, moveGhosts, movePlayer, outcome, playerMoves } from "./rules.js";

/** @typedef {import("./maze.js").Dir} Dir */
/** @typedef {{ maze: string[], lookahead: number, weights?: object, dronePattern?: number[], learns?: boolean }} LevelSpec */

/** Build a fresh game state from a level definition. */
export function stateFromLevel(level) {
  const { grid, exits, player, ghosts, roles, keys } = parseMaze(level.maze);
  return { grid, exits, keys, collected: 0, player, ghosts, roles, dronePattern: level.dronePattern ?? [2], tick: 0, turn: "player" };
}

/** A short text key for "where everyone stands" (and which evidence is picked up). */
export const positionKey = (s) =>
  `${s.player.r},${s.player.c}|${s.ghosts.map((g) => `${g.r},${g.c}`).join("|")}|${s.collected ?? 0}|${(s.tick ?? 0) % (s.dronePattern?.length || 1)}`;

/**
 * The enemies' reply to a position, remembered: they're deterministic, so each position is
 * searched once no matter how many times a solver or playtest reaches it.
 * @param {LevelSpec} level
 * @param {Record<string, string> | null} [habits] what learning wardens know about you (learning.js)
 */
export function ghostBrain(level, habits = null) {
  const memo = new Map();
  return (state) => {
    const k = positionKey(state);
    let move = memo.get(k);
    if (!move) memo.set(k, (move = chooseGhostMoves(state, level.lookahead, { weights: level.weights, habits }).move));
    return move;
  };
}

/**
 * Find the shortest sequence of player moves that escapes, or null if the ghosts always win.
 * @param {LevelSpec} level
 * @param {{ maxStates?: number, brain?: ReturnType<typeof ghostBrain> }} [options]
 * @returns {{ moves: Dir[] | null, statesExplored: number }}
 */
export function solveLevel(level, { maxStates = 200_000, brain = ghostBrain(level) } = {}) {
  const start = stateFromLevel(level);
  const seen = new Map([[positionKey(start), null]]); // key -> { prev, dir }
  const queue = [start];

  for (let head = 0; head < queue.length; head++) {
    if (seen.size > maxStates) throw new Error(`Gave up after ${maxStates} states`);
    const s = queue[head];

    for (const m of playerMoves(s)) {
      const afterPlayer = movePlayer(s, m);
      const end = outcome(afterPlayer);
      if (end === "caught") continue;
      if (end === "escaped") return { moves: [...pathTo(seen, positionKey(s)), m.dir], statesExplored: seen.size };

      const next = moveGhosts(afterPlayer, brain(afterPlayer).to);
      if (outcome(next) === "caught") continue;

      const k = positionKey(next);
      if (!seen.has(k)) {
        seen.set(k, { prev: positionKey(s), dir: m.dir });
        queue.push(next);
      }
    }
  }
  return { moves: null, statesExplored: seen.size };
}

function pathTo(seen, k) {
  const dirs = [];
  for (let step = seen.get(k); step; step = seen.get(step.prev)) dirs.push(step.dir);
  return dirs.reverse();
}

/**
 * Play a fixed list of player moves against this level's ghosts.
 * @param {LevelSpec} level
 * @returns {"escaped" | "caught" | "blocked" | "unfinished"}
 */
export function replay(level, moves, brain = ghostBrain(level)) {
  let s = stateFromLevel(level);
  for (const dir of moves) {
    const m = playerMoves(s).find((x) => x.dir === dir);
    if (!m) return "blocked";
    s = movePlayer(s, m);
    const end = outcome(s);
    if (end) return end;
    s = moveGhosts(s, brain(s).to);
    if (outcome(s)) return "caught";
  }
  return "unfinished";
}

/** Shortest route ignoring the enemies (a "naive" player): every evidence drive, then the exit. */
export function naiveRoute(maze) {
  const start = stateFromLevel({ maze });
  const key = (s) => `${s.player.r},${s.player.c}|${s.collected}`;
  const seen = new Map([[key(start), null]]);
  const queue = [start];
  for (let h = 0; h < queue.length; h++) {
    const s = queue[h];
    if (exitsOpen(s) && s.exits.some((e) => samePos(e, s.player))) return pathTo(seen, key(s));
    for (const m of playerMoves(s)) {
      const next = { ...movePlayer(s, m), turn: "player" };
      const k = key(next);
      if (!seen.has(k)) { seen.set(k, { prev: key(s), dir: m.dir }); queue.push(next); }
    }
  }
  return null;
}

/**
 * How close does an enemy HAVE to get? The largest safety margin d (in enemy turns) such that some
 * winning route keeps every enemy at least d turns away after each of their moves. A small margin
 * (1-2) means every escape is a close dodge; a big one means there's a route that never meets them
 * (the "obvious path that bypasses the wardens"). Explores positions widest-margin first.
 * If it gives up after maxStates, the result is an upper bound (`capped: true`).
 * @param {LevelSpec} level
 * @returns {{ margin: number, capped: boolean }}  margin -1 = not winnable at all
 */
export function safestMargin(level, { maxStates = 60_000, brain = ghostBrain(level), cap = 8 } = {}) {
  const start = stateFromLevel(level);
  const near = (s) => {
    const cols = s.grid[0].length, p = s.player.r * cols + s.player.c;
    let n = cap;
    s.ghosts.forEach((g, i) => {
      const d = distancesFrom(s.grid, g, "ghost")[p];
      if (d >= 0) n = Math.min(n, Math.ceil(d / averageSpeed(s, i)));
    });
    return n;
  };
  const best = new Map([[positionKey(start), cap]]);
  const buckets = Array.from({ length: cap + 1 }, () => []);
  buckets[cap].push([start, cap]);
  let count = 0;
  for (let b = cap; b >= 0; b--) {
    while (buckets[b].length) {
      const [s, B] = buckets[b].pop();
      if (best.get(positionKey(s)) > B) continue;
      if (++count > maxStates) return { margin: b, capped: true };
      for (const m of playerMoves(s)) {
        const a = movePlayer(s, m);
        const end = outcome(a);
        if (end === "escaped") return { margin: B, capped: false };
        if (end) continue;
        const next = moveGhosts(a, brain(a).to);
        if (outcome(next)) continue;
        const nb = Math.min(B, near(next));
        const k = positionKey(next);
        if ((best.get(k) ?? -1) < nb) { best.set(k, nb); buckets[nb].push([next, nb]); }
      }
    }
  }
  return { margin: -1, capped: false };
}

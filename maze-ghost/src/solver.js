// solver.js — level-design tool: can this maze be beaten against a ghost with this lookahead?
//
// With tie-breaking turned off (the default), the ghost always makes the same move in the same
// situation. So the whole game is decided by (player tile, ghost tile), and a breadth-first
// search over those pairs finds the SHORTEST winning route, or proves no route exists.

import { legalMoves, parseMaze, samePos } from "./maze.js";
import { chooseGhostMove } from "./ai.js";
import { moveGhost, movePlayer, outcome } from "./rules.js";

/** @typedef {import("./maze.js").Dir} Dir */

/** Build a fresh game state from a level definition. */
export function stateFromLevel(level) {
  const { grid, exits, player, ghost } = parseMaze(level.maze);
  return { grid, exits, player, ghost, turn: "player" };
}

/**
 * Find the shortest sequence of player moves that escapes, or null if the ghost always wins.
 * @param {{ maze: string[], lookahead: number }} level
 * @param {{ maxStates?: number }} [options]
 * @returns {{ moves: Dir[] | null, statesExplored: number }}
 */
export function solveLevel(level, { maxStates = 200_000 } = {}) {
  const start = stateFromLevel(level);
  const key = (s) => `${s.player.r},${s.player.c}|${s.ghost.r},${s.ghost.c}`;
  const ghostReply = new Map(); // memo: ghost's move for each situation

  const seen = new Map([[key(start), null]]); // key -> { prev, dir }
  const queue = [start];

  for (let head = 0; head < queue.length; head++) {
    if (seen.size > maxStates) throw new Error(`Gave up after ${maxStates} states`);
    const s = queue[head];

    for (const m of legalMoves(s.grid, s.player, "player")) {
      const afterPlayer = movePlayer(s, m);
      const end = outcome(afterPlayer);
      if (end === "caught") continue;
      if (end === "escaped") return { moves: [...pathTo(seen, key(s)), m.dir], statesExplored: seen.size };

      const k1 = key(afterPlayer);
      let g = ghostReply.get(k1);
      if (!g) ghostReply.set(k1, (g = chooseGhostMove(afterPlayer, level.lookahead).move));
      const next = moveGhost(afterPlayer, g);
      if (outcome(next) === "caught") continue;

      const k2 = key(next);
      if (!seen.has(k2)) {
        seen.set(k2, { prev: key(s), dir: m.dir });
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
 * Play a fixed list of player moves against a ghost with the given lookahead.
 * @returns {"escaped" | "caught" | "blocked" | "unfinished"}
 */
export function replay(maze, lookahead, moves) {
  let s = stateFromLevel({ maze });
  for (const dir of moves) {
    const m = legalMoves(s.grid, s.player, "player").find((x) => x.dir === dir);
    if (!m) return "blocked";
    s = movePlayer(s, m);
    const end = outcome(s);
    if (end) return end;
    s = moveGhost(s, chooseGhostMove(s, lookahead).move);
    if (outcome(s)) return "caught";
  }
  return "unfinished";
}

/** Shortest path to an exit ignoring the ghost (a "naive" player). */
export function naiveRoute(maze) {
  const s = stateFromLevel({ maze });
  const seen = new Map([[`${s.player.r},${s.player.c}`, null]]);
  const queue = [s.player];
  for (let h = 0; h < queue.length; h++) {
    const p = queue[h];
    if (s.exits.some((e) => samePos(e, p))) return pathTo(seen, `${p.r},${p.c}`);
    for (const m of legalMoves(s.grid, p, "player", false)) {
      const k = `${m.r},${m.c}`;
      if (!seen.has(k)) { seen.set(k, { prev: `${p.r},${p.c}`, dir: m.dir }); queue.push(m); }
    }
  }
  return null;
}

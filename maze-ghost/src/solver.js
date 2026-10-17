// solver.js — level-design tool: can this maze be beaten against these ghosts?
//
// With tie-breaking turned off (the default), the ghosts always make the same move in the same
// situation. So the whole game is decided by where everyone stands, and a breadth-first search over
// those positions finds the SHORTEST winning route, or proves no route exists.

import { legalMoves, parseMaze, samePos } from "./maze.js";
import { chooseGhostMoves } from "./ai.js";
import { moveGhosts, movePlayer, outcome } from "./rules.js";

/** @typedef {import("./maze.js").Dir} Dir */
/** @typedef {{ maze: string[], lookahead: number, weights?: object }} LevelSpec */

/** Build a fresh game state from a level definition. */
export function stateFromLevel(level) {
  const { grid, exits, player, ghosts } = parseMaze(level.maze);
  return { grid, exits, player, ghosts, turn: "player" };
}

/** A short text key for "where everyone stands". */
export const positionKey = (s) => `${s.player.r},${s.player.c}|${s.ghosts.map((g) => `${g.r},${g.c}`).join("|")}`;

/**
 * The ghosts' reply to a position, remembered: they're deterministic, so each position is
 * searched once no matter how many times a solver or playtest reaches it.
 * @param {LevelSpec} level
 */
export function ghostBrain(level) {
  const memo = new Map();
  return (state) => {
    const k = positionKey(state);
    let move = memo.get(k);
    if (!move) memo.set(k, (move = chooseGhostMoves(state, level.lookahead, { weights: level.weights }).move));
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

    for (const m of legalMoves(s.grid, s.player, "player")) {
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
    const m = legalMoves(s.grid, s.player, "player").find((x) => x.dir === dir);
    if (!m) return "blocked";
    s = movePlayer(s, m);
    const end = outcome(s);
    if (end) return end;
    s = moveGhosts(s, brain(s).to);
    if (outcome(s)) return "caught";
  }
  return "unfinished";
}

/** Shortest path to an exit ignoring the ghosts (a "naive" player). */
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

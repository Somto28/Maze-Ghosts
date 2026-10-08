// rules.js — turns, moves and how the game ends.
// Every function returns a NEW state. Nothing is changed in place, which is what lets
// the ghost's search imagine many possible futures without disturbing the real game.

import { samePos } from "./maze.js";

/**
 * @typedef {import("./maze.js").Pos} Pos
 * @typedef {{
 *   grid: import("./maze.js").Grid,
 *   exits: readonly Pos[],
 *   player: Pos,
 *   ghost: Pos,
 *   turn: "player" | "ghost",
 * }} GameState
 * @typedef {"caught" | "escaped" | null} Outcome
 */

/** @param {GameState} state @returns {Outcome} */
export function outcome(state) {
  if (samePos(state.ghost, state.player)) return "caught";
  if (state.exits.some((e) => samePos(e, state.player))) return "escaped";
  return null;
}

/** Move the player; then it's the ghost's turn. @param {GameState} state @param {Pos} to */
export function movePlayer(state, to) {
  return { ...state, player: { r: to.r, c: to.c }, turn: "ghost" };
}

/** Move the ghost; then it's the player's turn. @param {GameState} state @param {Pos} to */
export function moveGhost(state, to) {
  return { ...state, ghost: { r: to.r, c: to.c }, turn: "player" };
}

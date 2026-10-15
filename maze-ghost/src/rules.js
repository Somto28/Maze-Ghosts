// rules.js — turns, moves and how the game ends.
// Every function returns a NEW state. Nothing is changed in place, which is what lets
// the ghosts' search imagine many possible futures without disturbing the real game.
//
// A level can have several ghosts. They move together on the ghosts' turn (one step each),
// and you're caught if any of them reaches your tile.

import { samePos } from "./maze.js";

/**
 * @typedef {import("./maze.js").Pos} Pos
 * @typedef {{
 *   grid: import("./maze.js").Grid,
 *   exits: readonly Pos[],
 *   player: Pos,
 *   ghosts: readonly Pos[],
 *   turn: "player" | "ghost",
 * }} GameState
 * @typedef {"caught" | "escaped" | null} Outcome
 */

/** @param {GameState} state @returns {Outcome} */
export function outcome(state) {
  if (state.ghosts.some((g) => samePos(g, state.player))) return "caught";
  if (state.exits.some((e) => samePos(e, state.player))) return "escaped";
  return null;
}

/** Move the player; then it's the ghosts' turn. @param {GameState} state @param {Pos} to */
export function movePlayer(state, to) {
  return { ...state, player: { r: to.r, c: to.c }, turn: "ghost" };
}

/**
 * Move every ghost (one destination each, in the same order as state.ghosts); then it's the player's turn.
 * @param {GameState} state @param {readonly Pos[]} to
 */
export function moveGhosts(state, to) {
  return { ...state, ghosts: to.map((p) => ({ r: p.r, c: p.c })), turn: "player" };
}

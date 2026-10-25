// insight.js — "what the wardens think will happen if you go this way". For each move you could make
// right now, it runs the same search the enemies use and reports what they foresee: whether they can
// catch you within their lookahead (and how soon), whether you'd escape, or whether, as far as they
// can see, you'd be safe. It's their own reasoning, turned around to face you, so players can read it
// and pick their move.

import { chooseGhostMoves } from "./ai.js";
import { moveGhosts, movePlayer, outcome, playerMoves } from "./rules.js";

/**
 * @param {object} state  a state where it's the player's turn
 * @param {number} lookahead the enemies' lookahead
 * @param {object} [options] the same search options the enemies use (weights, habits, pruning)
 * @returns {{ dir: string, verdict: "caught" | "escape" | "safe", moves?: number, risk?: number, vent?: string|null }[]}
 *   caught: they can force a catch; `moves` is how many of their turns it takes (1 = right after this move).
 *   escape: you reach the exit and they can't stop it. safe: no catch they can see within their lookahead;
 *   `risk` (0..1) compares the safe moves with each other: higher = they like that position more.
 */
export function foresee(state, lookahead, options = {}) {
  const out = [];
  for (const m of playerMoves({ ...state, turn: "player" })) {
    const next = movePlayer({ ...state, turn: "player" }, m);
    const end = outcome(next);
    if (end === "caught") { out.push({ dir: m.dir, verdict: "caught", moves: 0, vent: m.vent ?? null }); continue; }
    if (end === "escaped") { out.push({ dir: m.dir, verdict: "escape", moves: 0, vent: m.vent ?? null }); continue; }
    const { thinking } = chooseGhostMoves(next, lookahead, options);
    const best = thinking.options.find((o) => o.chosen);
    // Play out the future they expect (both sides playing their best) to see how it ends.
    const ending = playOut(next, best.plan);
    if (ending.end === "caught") out.push({ dir: m.dir, verdict: "caught", moves: ending.enemyTurns, vent: m.vent ?? null, score: best.score });
    else if (ending.end === "escaped") out.push({ dir: m.dir, verdict: "escape", moves: ending.yourMoves, vent: m.vent ?? null, score: best.score });
    else out.push({ dir: m.dir, verdict: "safe", vent: m.vent ?? null, score: best.score });
  }
  const safe = out.filter((o) => o.verdict === "safe");
  const lo = Math.min(...safe.map((o) => o.score)), hi = Math.max(...safe.map((o) => o.score));
  for (const o of safe) o.risk = hi > lo ? (o.score - lo) / (hi - lo) : 0;
  return out;
}

// Replay a plan (alternating enemy and player steps) and report how it ends, if it does.
function playOut(state, plan) {
  let s = state, enemyTurns = 0, yourMoves = 0;
  for (const step of plan) {
    if (step.who === "ghost") { s = moveGhosts(s, step.at); enemyTurns++; }
    else {
      const m = playerMoves(s).find((x) => x.dir === step.dir);
      if (!m) break;
      s = movePlayer(s, m); yourMoves++;
    }
    const end = outcome(s);
    if (end) return { end, enemyTurns, yourMoves };
  }
  return { end: null, enemyTurns, yourMoves };
}

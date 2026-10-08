// ai.js — the ghost's brain: ADVERSARIAL SEARCH (minimax with alpha-beta pruning).
//
// The ghost and the player are opponents taking turns:
//   * The ghost is MAX: it wants the score as HIGH as possible.
//   * The player is MIN: the ghost assumes the player always picks the move that is worst for the ghost.
// The ghost imagines its move, the player's best reply, its next move, and so on, up to its
// LOOKAHEAD. That lookahead is the difficulty: each level, the ghost looks further ahead.

import { distancesFrom, legalMoves } from "./maze.js";
import { moveGhost, movePlayer, outcome } from "./rules.js";

/** @typedef {import("./rules.js").GameState} GameState */
/** @typedef {import("./maze.js").Move} Move */
/** @typedef {import("./maze.js").Dir} Dir */

/** Score of a catch (or minus this for an escape). Bigger than any normal position. */
export const WIN = 1000;

/** How the ghost judges a position it can't see past. Change these to change its personality. */
export const WEIGHTS = Object.freeze({
  /** Per tile between the ghost and the player (closer is better for the ghost). */
  chase: 10,
  /** Per tile the player still has to walk to the nearest exit (further is better for the ghost). */
  playerFromExit: 4,
});

/**
 * Score a position from the ghost's point of view (higher = better for the ghost).
 * @param {GameState} state
 * @returns {{ total: number, parts: Record<string, number> }}
 */
export function evaluate(state) {
  const end = outcome(state);
  if (end === "caught") return { total: WIN, parts: { caught: WIN } };
  if (end === "escaped") return { total: -WIN, parts: { escaped: -WIN } };

  const { grid, ghost, player, exits } = state;
  const cols = grid[0].length;
  const far = grid.length * cols; // stands in for "unreachable"
  const dist = (arr, p) => (arr[p.r * cols + p.c] < 0 ? far : arr[p.r * cols + p.c]);

  const ghostToPlayer = dist(distancesFrom(grid, ghost, "ghost"), player);
  const fromPlayer = distancesFrom(grid, player, "player");
  const playerToExit = Math.min(...exits.map((e) => dist(fromPlayer, e)));

  const parts = {
    chase: -WEIGHTS.chase * ghostToPlayer,
    playerFromExit: WEIGHTS.playerFromExit * playerToExit,
  };
  return { total: parts.chase + parts.playerFromExit, parts };
}

/**
 * Decide the ghost's move.
 * @param {GameState} state
 * @param {number} lookahead how many of its own moves the ghost thinks ahead (1 = just this move + your reply)
 * @param {{ pruning?: boolean, rng?: (() => number) | null }} [options]
 *   pruning: alpha-beta on/off (same answer, off just checks more futures).
 *   rng: pass a random function to break ties randomly. Default null = always the same choice,
 *        which keeps levels predictable and lets the level checker prove they can be won.
 */
export function chooseGhostMove(state, lookahead, { pruning = true, rng = null } = {}) {
  if (!Number.isInteger(lookahead) || lookahead < 1) throw new RangeError("lookahead must be a whole number ≥ 1");
  const depth = lookahead * 2; // plies: ghost move + player reply, repeated
  const root = { ...state, turn: "ghost" };
  const stats = { futures: 0, prunes: 0 };

  // Every top-level option is searched with a full window so ALL their scores are exact,
  // not only the winner's. That keeps the "what was the ghost thinking" display honest.
  const options = orderedMoves(root).map((m) => {
    const after = moveGhost(root, m);
    const result = minimax(after, depth - 1, -Infinity, Infinity, pruning, stats);
    const reply = result.line[0];
    return {
      dir: m.dir,
      to: { r: m.r, c: m.c },
      score: result.value,
      predictedPlayerReply: reply?.who === "player" ? reply.dir : null,
      /** The future the ghost expects if it makes this move: ghost, player, ghost, player... */
      plan: [{ who: "ghost", dir: m.dir, at: { r: m.r, c: m.c } }, ...result.line],
      move: m,
    };
  });

  const best = Math.max(...options.map((o) => o.score));
  const ties = options.filter((o) => o.score === best);
  const pick = rng ? ties[Math.min(ties.length - 1, Math.floor(rng() * ties.length))] : ties[0];

  return {
    move: pick.move,
    thinking: {
      lookahead,
      futuresConsidered: stats.futures,
      branchesPruned: stats.prunes,
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
export function searchScore(state, plies, pruning = true) {
  return minimax(state, plies, -Infinity, Infinity, pruning, { futures: 0, prunes: 0 }).value;
}

/**
 * Classic minimax with alpha-beta pruning.
 * alpha = best score the ghost is already guaranteed elsewhere; beta = best the player is guaranteed.
 * @returns {{ value: number, line: { who: "ghost" | "player", dir: Dir, at: { r: number, c: number } }[] }}
 */
function minimax(state, depth, alpha, beta, pruning, stats) {
  stats.futures++;

  // Catching sooner (more depth left) is worth a bit more; an escape sooner is worse for the ghost.
  const end = outcome(state);
  if (end === "caught") return { value: WIN + depth, line: [] };
  if (end === "escaped") return { value: -WIN - depth, line: [] };
  if (depth === 0) return { value: evaluate(state).total, line: [] };

  const ghostTurn = state.turn === "ghost";
  let best = null;

  for (const m of orderedMoves(state)) {
    const child = ghostTurn ? moveGhost(state, m) : movePlayer(state, m);
    const result = minimax(child, depth - 1, alpha, beta, pruning, stats);

    if (!best || (ghostTurn ? result.value > best.value : result.value < best.value)) {
      const step = { who: ghostTurn ? "ghost" : "player", dir: m.dir, at: { r: m.r, c: m.c } };
      best = { value: result.value, line: [step, ...result.line] };
    }
    if (ghostTurn) alpha = Math.max(alpha, result.value);
    else beta = Math.min(beta, result.value);

    // The other side already has a better option elsewhere, so it would never allow this branch.
    if (pruning && beta <= alpha) {
      stats.prunes++;
      break;
    }
  }
  return best; // never null: waiting is always legal
}

/**
 * Look at the most promising moves first so alpha-beta can prune more.
 * Ghost: moves that get closer to the player. Player: moves that get closer to an exit.
 * Ties keep the fixed up/down/left/right/wait order, so the ghost is fully predictable.
 * @param {GameState} state @returns {Move[]}
 */
function orderedMoves(state) {
  const { grid, ghost, player, exits } = state;
  const cols = grid[0].length;
  const far = grid.length * cols;

  if (state.turn === "ghost") {
    const toPlayer = distancesFrom(grid, player, "ghost");
    const d = (m) => (toPlayer[m.r * cols + m.c] < 0 ? far : toPlayer[m.r * cols + m.c]);
    return legalMoves(grid, ghost, "ghost").sort((a, b) => d(a) - d(b));
  }
  const exitDists = exits.map((e) => distancesFrom(grid, e, "player"));
  const d = (m) => Math.min(...exitDists.map((arr) => (arr[m.r * cols + m.c] < 0 ? far : arr[m.r * cols + m.c])));
  return legalMoves(grid, player, "player").sort((a, b) => d(a) - d(b));
}

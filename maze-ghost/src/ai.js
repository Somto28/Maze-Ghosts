// ai.js — the ghosts' brain: ADVERSARIAL SEARCH (minimax with alpha-beta pruning).
//
// The ghosts and the player are opponents taking turns:
//   * The ghosts are MAX: they want the score as HIGH as possible.
//   * The player is MIN: the ghosts assume the player always picks the move that is worst for them.
// The ghosts imagine their move, the player's best reply, their next move, and so on, up to their
// LOOKAHEAD. That lookahead is the difficulty: each level, the ghosts look further ahead.
//
// With several ghosts, they plan as ONE team: a "team move" is one step for every ghost at once,
// and the search tries every combination. That's what lets them coordinate (one chases, one cuts
// you off) instead of each chasing on its own.

import { distancesFrom, legalMoves, samePos } from "./maze.js";
import { moveGhosts, movePlayer, outcome } from "./rules.js";

/** @typedef {import("./rules.js").GameState} GameState */
/** @typedef {import("./maze.js").Move} Move */
/** @typedef {import("./maze.js").Dir} Dir */
/** @typedef {import("./maze.js").Pos} Pos */
/** @typedef {{ dir: string, dirs: Dir[], to: Pos[] }} TeamMove  dir is a label, e.g. "left" or "left + up" */

/** Score of a catch (or minus this for an escape). Bigger than any normal position. */
export const WIN = 1000;

/**
 * How the ghosts judge a position they can't see past. Change these to change their personality.
 * A level can override any of them with its own `weights`.
 */
export const WEIGHTS = Object.freeze({
  /** Per tile between the nearest ghost and the player (closer is better for the ghosts). */
  chase: 10,
  /** Per tile the player still has to walk to the nearest exit (further is better for the ghosts). */
  playerFromExit: 4,
  /** Per tile between each OTHER ghost and the player: brings the whole team in, not just the nearest. */
  pack: 0,
  /** Per floor tile the player can reach before any ghost can (a smaller "safe zone" = cornered). */
  territory: 0,
});

/**
 * Score a position from the ghosts' point of view (higher = better for the ghosts).
 * @param {GameState} state
 * @param {Partial<typeof WEIGHTS>} [weights]
 * @returns {{ total: number, parts: Record<string, number> }}
 */
export function evaluate(state, weights = WEIGHTS) {
  const w = { ...WEIGHTS, ...weights };
  const end = outcome(state);
  if (end === "caught") return { total: WIN, parts: { caught: WIN } };
  if (end === "escaped") return { total: -WIN, parts: { escaped: -WIN } };

  const { grid, ghosts, player, exits } = state;
  const cols = grid[0].length;
  const far = grid.length * cols; // stands in for "unreachable"
  const at = (arr, i) => (arr[i] < 0 ? far : arr[i]);
  const p = player.r * cols + player.c;

  const fromGhosts = ghosts.map((g) => distancesFrom(grid, g, "ghost"));
  const toPlayer = fromGhosts.map((arr) => at(arr, p)).sort((a, b) => a - b);
  const fromPlayer = distancesFrom(grid, player, "player");
  const playerToExit = Math.min(...exits.map((e) => at(fromPlayer, e.r * cols + e.c)));

  const parts = {
    chase: -w.chase * toPlayer[0],
    playerFromExit: w.playerFromExit * playerToExit,
  };
  if (w.pack) parts.pack = -w.pack * toPlayer.slice(1).reduce((a, b) => a + b, 0);
  if (w.territory) {
    let safe = 0;
    for (let i = 0; i < fromPlayer.length; i++) {
      if (fromPlayer[i] < 0) continue;
      if (fromGhosts.every((arr) => arr[i] < 0 || fromPlayer[i] < arr[i])) safe++;
    }
    parts.territory = -w.territory * safe;
  }
  return { total: Object.values(parts).reduce((a, b) => a + b, 0), parts };
}

/**
 * Decide the ghosts' team move.
 * @param {GameState} state
 * @param {number} lookahead how many of their own moves the ghosts think ahead (1 = just this move + your reply)
 * @param {{ pruning?: boolean, rng?: (() => number) | null, weights?: Partial<typeof WEIGHTS> }} [options]
 *   pruning: alpha-beta on/off (same answer, off just checks more futures).
 *   rng: pass a random function to break ties randomly. Default null = always the same choice,
 *        which keeps levels predictable and lets the level checker prove they can be won.
 *   weights: this level's personality (see WEIGHTS).
 */
export function chooseGhostMoves(state, lookahead, { pruning = true, rng = null, weights = WEIGHTS } = {}) {
  if (!Number.isInteger(lookahead) || lookahead < 1) throw new RangeError("lookahead must be a whole number ≥ 1");
  const depth = lookahead * 2; // plies: ghosts' move + player reply, repeated
  const root = { ...state, turn: "ghost" };
  const ctx = { pruning, weights: { ...WEIGHTS, ...weights }, stats: { futures: 0, prunes: 0 } };

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
      /** The future the ghosts expect if they make this move: ghosts, player, ghosts, player... */
      plan: [{ who: "ghost", dir: m.dir, at: m.to }, ...result.line],
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
      ghosts: state.ghosts.length,
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
  const ctx = { pruning, weights: { ...WEIGHTS, ...weights }, stats: { futures: 0, prunes: 0 } };
  return minimax(state, plies, -Infinity, Infinity, ctx).value;
}

/**
 * Classic minimax with alpha-beta pruning.
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

  const ghostTurn = state.turn === "ghost";
  const moves = ghostTurn ? orderedTeamMoves(state) : orderedPlayerMoves(state);
  let best = null;

  for (const m of moves) {
    const child = ghostTurn ? moveGhosts(state, m.to) : movePlayer(state, m);
    const result = minimax(child, depth - 1, alpha, beta, ctx);

    if (!best || (ghostTurn ? result.value > best.value : result.value < best.value)) {
      const step = ghostTurn
        ? { who: "ghost", dir: m.dir, at: m.to }
        : { who: "player", dir: m.dir, at: { r: m.r, c: m.c } };
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
  return best; // never null: waiting is always legal
}

/**
 * Every team move: one step per ghost, all combinations, except two ghosts ending on the same tile.
 * Most promising first (ghosts closer to the player) so alpha-beta can prune more. Ties keep the
 * fixed up/down/left/right/wait order, so the ghosts are fully predictable.
 * @param {GameState} state @returns {TeamMove[]}
 */
function orderedTeamMoves(state) {
  const { grid, ghosts, player } = state;
  const cols = grid[0].length;
  const far = grid.length * cols;
  const toPlayer = distancesFrom(grid, player, "ghost");
  const d = (m) => (toPlayer[m.r * cols + m.c] < 0 ? far : toPlayer[m.r * cols + m.c]);

  let teams = [{ dirs: [], to: [], cost: 0 }];
  for (const g of ghosts) {
    const next = [];
    for (const t of teams) {
      for (const m of legalMoves(grid, g, "ghost")) {
        if (t.to.some((p) => samePos(p, m))) continue; // two ghosts can't share a tile
        next.push({ dirs: [...t.dirs, m.dir], to: [...t.to, { r: m.r, c: m.c }], cost: t.cost + d(m) });
      }
    }
    teams = next;
  }
  return teams.sort((a, b) => a.cost - b.cost).map(({ dirs, to }) => ({ dir: dirs.join(" + "), dirs, to }));
}

/** Player moves, the ones heading for an exit first. @param {GameState} state @returns {Move[]} */
function orderedPlayerMoves(state) {
  const { grid, player, exits } = state;
  const cols = grid[0].length;
  const far = grid.length * cols;
  const exitDists = exits.map((e) => distancesFrom(grid, e, "player"));
  const d = (m) => Math.min(...exitDists.map((arr) => (arr[m.r * cols + m.c] < 0 ? far : arr[m.r * cols + m.c])));
  return legalMoves(grid, player, "player").sort((a, b) => d(a) - d(b));
}

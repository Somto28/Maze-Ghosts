// playtest.js — simulated players, to measure how hard a level FEELS, not just whether it can be beaten.
//
// The solver proves a level is winnable with perfect play. Real kids don't play perfectly, so this
// plays each level many times with simulated players of different skill and counts how often they
// escape. That turns "too easy" or "too hard" into numbers you can tune against.
//
// A simulated player:
//   * heads for the exit and keeps away from the ghosts,
//   * thinks `depth` moves ahead, assuming each ghost simply steps toward them,
//   * makes a random move `mistakes` of the time, and breaks ties at random,
//   * doesn't like going round in circles (a short memory of tiles it just visited).
// Runs are seeded, so the same level always gives the same numbers.

import { distancesFrom, legalMoves, samePos } from "./maze.js";
import { moveGhosts, movePlayer, outcome } from "./rules.js";
import { ghostBrain, stateFromLevel } from "./solver.js";

// Skill = how far ahead it looks and how often it slips. (Looking 2+ moves ahead with a guessed model
// of the ghosts made simulated players paranoid rather than better, so "strong" means precise.)
export const SKILLS = Object.freeze({
  beginner: { depth: 0, mistakes: 0.15 },
  average: { depth: 1, mistakes: 0.08 },
  strong: { depth: 1, mistakes: 0.01 },
});

/**
 * @param {{ maze: string[], lookahead: number, weights?: object }} level
 * @param {{ skill?: keyof typeof SKILLS, games?: number, seed?: number, maxTurns?: number, brain?: Function }} [options]
 * @returns {{ escaped: number, caught: number, stuck: number, games: number, rate: number }}
 *   stuck = still alive after maxTurns without finding the way out (counts as a loss: a kid would give up).
 */
export function playtest(level, { skill = "average", games = 200, seed = 1, maxTurns = 120, brain = ghostBrain(level) } = {}) {
  const { depth, mistakes } = SKILLS[skill];
  const rnd = seededRandom(seed);
  const tally = { escaped: 0, caught: 0, stuck: 0, games };

  for (let g = 0; g < games; g++) {
    let s = stateFromLevel(level);
    const recent = [];
    let result = "stuck";
    for (let turn = 0; turn < maxTurns; turn++) {
      const moves = legalMoves(s.grid, s.player, "player");
      let pick;
      if (rnd() < mistakes) {
        pick = moves[Math.floor(rnd() * moves.length)];
      } else {
        let best = -Infinity, bests = [];
        for (const m of moves) {
          const v = lookAhead(movePlayer(s, m), depth) - 1.5 * recent.filter((p) => samePos(p, m)).length;
          if (v > best) { best = v; bests = [m]; } else if (v === best) bests.push(m);
        }
        pick = bests[Math.floor(rnd() * bests.length)];
      }
      recent.push({ r: pick.r, c: pick.c });
      if (recent.length > 8) recent.shift();

      s = movePlayer(s, pick);
      if (outcome(s)) { result = outcome(s); break; }
      s = moveGhosts(s, brain(s).to);
      if (outcome(s)) { result = outcome(s); break; }
    }
    tally[result]++;
  }
  return { ...tally, rate: tally.escaped / games };
}

// How good a position looks to the simulated player after its own move (state.turn === "ghost").
// It expects each ghost to either step toward it or hold its position (to cut it off), and plans
// for whichever combination is worse for it.
function lookAhead(s, depth) {
  const end = outcome(s);
  if (end === "caught") return -1000;
  if (end === "escaped") return 1000 + depth;
  let worst = Infinity;
  for (const to of guesses(s)) {
    const after = moveGhosts(s, to);
    let value;
    if (outcome(after) === "caught") value = -1000;
    else if (depth === 0) value = feel(after);
    else {
      value = -Infinity;
      for (const m of legalMoves(after.grid, after.player, "player")) value = Math.max(value, lookAhead(movePlayer(after, m), depth - 1));
    }
    worst = Math.min(worst, value);
    if (worst === -1000) break;
  }
  return worst;
}

// Every combination of "steps toward me" / "stays put" for the ghosts.
function guesses(s) {
  let combos = [[]];
  s.ghosts.forEach((g, i) => {
    const step = greedyStep(s, g, i);
    combos = combos.flatMap((c) => (samePos(step, g) ? [[...c, g]] : [[...c, step], [...c, g]]));
  });
  return combos.filter((to) => to.every((p, i) => to.findIndex((q) => samePos(p, q)) === i));
}

// The simulated player's guess at a ghost's move: one step closer to the player.
function greedyStep(s, ghost, i) {
  const cols = s.grid[0].length;
  const toPlayer = distancesFrom(s.grid, s.player, "ghost");
  let best = ghost, bestD = Infinity;
  for (const m of legalMoves(s.grid, ghost, "ghost")) {
    const d = toPlayer[m.r * cols + m.c];
    if (d >= 0 && d < bestD && !s.ghosts.some((g, j) => j < i && samePos(g, m))) { best = m; bestD = d; }
  }
  return best;
}

// Gut feeling: get closer to the exit, and keep a couple of tiles between you and every ghost.
function feel(s) {
  const cols = s.grid[0].length;
  const far = s.grid.length * cols;
  const fromPlayer = distancesFrom(s.grid, s.player, "player");
  const exit = Math.min(...s.exits.map((e) => (fromPlayer[e.r * cols + e.c] < 0 ? far : fromPlayer[e.r * cols + e.c])));
  let near = far;
  for (const g of s.ghosts) {
    const d = distancesFrom(s.grid, g, "ghost")[s.player.r * cols + s.player.c];
    if (d >= 0) near = Math.min(near, d);
  }
  return -3 * exit + 4 * Math.min(near, 4) - (near <= 1 ? 40 : 0);
}

function seededRandom(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

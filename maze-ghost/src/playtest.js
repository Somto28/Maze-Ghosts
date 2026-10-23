// playtest.js — simulated players, to measure how hard a level FEELS, not just whether it can be beaten.
//
// The solver proves a level is winnable with perfect play. Real kids don't play perfectly, so this
// plays each level many times with simulated players of different skill and counts how often they
// escape. That turns "too easy" or "too hard" into numbers you can tune against.
//
// A simulated player:
//   * heads for the exit (picking up any evidence first) and keeps away from the enemies,
//   * thinks `depth` moves ahead, assuming each warden simply steps toward them (or holds still),
//     and knowing exactly how drones move (their rule is simple enough for a kid to learn),
//   * makes a random move `mistakes` of the time, and breaks ties at random,
//   * doesn't like going round in circles (a short memory of tiles it just visited).
// Runs are seeded, so the same level always gives the same numbers.
//
// On a learning level the wardens remember the simulated player's caught attempts, just as they
// would a real kid's: `attempts` plays several tries in a row and reports how many escape by each try.

import { droneMove } from "./ai.js";
import { distancesFrom, legalMoves, samePos } from "./maze.js";
import { averageSpeed, goalField, moveGhosts, movePlayer, outcome, playerMoves } from "./rules.js";
import { ghostBrain, positionKey, stateFromLevel } from "./solver.js";
import { habitsFrom } from "./learning.js";

// Skill = how far ahead it looks and how often it slips. (Looking 2+ moves ahead with a guessed model
// of the ghosts made simulated players paranoid rather than better, so "strong" means precise.)
//
// The first three only GUESS what the wardens will do ("it steps toward me"). That's a kid who
// ignores the red dots. `thinker` is the kid the game is trying to grow: it READS the wardens'
// prediction (it knows how they'll really answer each move, as the plan dots show) and plans
// `depth` of its own moves ahead with that. Levels are tuned so that guessing gets you caught more
// and more often, while thinking about the wardens' prediction keeps working.
export const SKILLS = Object.freeze({
  beginner: { depth: 0, mistakes: 0.15 },
  average: { depth: 1, mistakes: 0.08 },
  strong: { depth: 1, mistakes: 0.01 },
  thinker: { depth: 3, mistakes: 0.03, reads: true },
  // An adult tester: reads the plan perfectly, looks 4 moves ahead, never slips, and keeps exploring
  // (a long memory of where it has been) instead of circling somewhere safe.
  expert: { depth: 4, mistakes: 0, reads: true, memory: 40, wander: 3 },
});

/**
 * @param {{ maze: string[], lookahead: number, weights?: object, learns?: boolean }} level
 * @param {{ skill?: keyof typeof SKILLS, games?: number, seed?: number, maxTurns?: number, brain?: Function, attempts?: number }} [options]
 *   attempts: tries per simulated player (default 1). Like a real kid, a simulated player remembers
 *   the last two moves before each catch ("going right here got me caught") and tries something
 *   else there next time. On learning levels the wardens also study each caught try.
 *   record: also return every attempt's moves (`played`), e.g. to replay them against learning wardens.
 * @returns {{ escaped: number, caught: number, stuck: number, games: number, rate: number, byAttempt: number[], played?: object[] }}
 *   rate = escaped on the first try. byAttempt[i] = share who had escaped within i + 1 tries.
 *   stuck = still alive after maxTurns without finding the way out (counts as a loss: a kid would give up).
 */
export function playtest(level, { skill = "average", games = 200, seed = 1, maxTurns = 150, brain = null, attempts = 1, record = false } = {}) {
  const { depth, mistakes, reads = false, memory = 8, wander = 1.5 } = SKILLS[skill];
  const rnd = seededRandom(seed);
  const tally = { escaped: 0, caught: 0, stuck: 0, games };
  const escapedBy = new Array(attempts).fill(0);
  const played = []; // record: every attempt's moves and result
  const fixedBrain = level.learns ? null : brain ?? ghostBrain(level);
  const brains = new Map(); // learning levels: one brain per set of habits, shared between players

  for (let g = 0; g < games; g++) {
    const history = [];
    const avoid = new Set(); // "position|dir" that got this player caught before
    for (let a = 0; a < attempts; a++) {
      let think = fixedBrain;
      if (!think) {
        const habits = habitsFrom(history);
        const key = JSON.stringify(habits);
        if (!brains.has(key)) brains.set(key, ghostBrain(level, habits));
        think = brains.get(key);
      }
      const { result, steps, keys } = playOnce(level, think, rnd, depth, mistakes, maxTurns, reads, avoid, memory, wander);
      if (a === 0) tally[result]++;
      if (record) played.push({ result, steps });
      if (result === "escaped") {
        for (let i = a; i < attempts; i++) escapedBy[i]++;
        break;
      }
      history.push(steps);
      if (result === "caught") for (const k of keys.slice(-2)) avoid.add(k);
    }
  }
  return { ...tally, rate: tally.escaped / games, byAttempt: escapedBy.map((n) => n / games), ...(record ? { played } : {}) };
}

function playOnce(level, brain, rnd, depth, mistakes, maxTurns, reads, avoid, memory = 8, wander = 1.5) {
  let s = stateFromLevel(level);
  const recent = [];
  const steps = [];
  const keys = [];
  for (let turn = 0; turn < maxTurns; turn++) {
    const here = positionKey(s);
    const all = playerMoves(s);
    if (all.length === 0) return { result: "caught", steps, keys };
    const fresh = all.filter((m) => !avoid.has(`${here}|${m.dir}`));
    const moves = fresh.length ? fresh : all;
    let pick;
    if (rnd() < mistakes) {
      pick = moves[Math.floor(rnd() * moves.length)];
    } else {
      let best = -Infinity, bests = [];
      for (const m of moves) {
        const after = movePlayer(s, m);
        const v = (reads ? readAhead(after, depth, brain) : lookAhead(after, depth)) - wander * recent.filter((p) => samePos(p, m)).length;
        if (v > best) { best = v; bests = [m]; } else if (v === best) bests.push(m);
      }
      pick = bests[Math.floor(rnd() * bests.length)];
    }
    recent.push({ r: pick.r, c: pick.c });
    if (recent.length > memory) recent.shift();
    steps.push({ r: s.player.r, c: s.player.c, dir: pick.dir });
    keys.push(`${here}|${pick.dir}`);

    s = movePlayer(s, pick);
    if (outcome(s)) return { result: outcome(s), steps, keys };
    s = moveGhosts(s, brain(s).to);
    if (outcome(s)) return { result: outcome(s), steps, keys };
  }
  return { result: "stuck", steps, keys };
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
      for (const m of playerMoves(after)) value = Math.max(value, lookAhead(movePlayer(after, m), depth - 1));
    }
    worst = Math.min(worst, value);
    if (worst === -1000) break;
  }
  return worst;
}

// The thinker: plays out each line against the wardens' REAL replies (what the plan dots reveal).
function readAhead(s, depth, brain) {
  const end = outcome(s);
  if (end === "caught") return -1000;
  if (end === "escaped") return 1000 + depth;
  const after = moveGhosts(s, brain(s).to);
  if (outcome(after) === "caught") return -1000;
  if (depth === 0) return feel(after);
  let best = -1000;
  for (const m of playerMoves(after)) best = Math.max(best, readAhead(movePlayer(after, m), depth - 1, brain));
  return best;
}

// Every combination of "steps toward me" / "stays put" for the wardens. Drones do exactly their dash.
function guesses(s) {
  let combos = [[]];
  s.ghosts.forEach((g, i) => {
    if (s.roles?.[i] === "drone") {
      const dash = droneMove(s, i).to;
      combos = combos.map((c) => [...c, dash]);
      return;
    }
    const step = greedyStep(s, g, i);
    combos = combos.flatMap((c) => (samePos(step, g) ? [[...c, g]] : [[...c, step], [...c, g]]));
  });
  return combos.filter((to) => to.every((p, i) => s.roles?.[i] === "drone" || to.findIndex((q, j) => s.roles?.[j] !== "drone" && samePos(p, q)) === i));
}

// The simulated player's guess at a ghost's move: one step closer to the player.
function greedyStep(s, ghost, i) {
  const cols = s.grid[0].length;
  const toPlayer = distancesFrom(s.grid, s.player, "ghost");
  let best = ghost, bestD = Infinity;
  for (const m of legalMoves(s.grid, ghost, "ghost")) {
    const d = toPlayer[m.r * cols + m.c];
    if (d >= 0 && d < bestD && !s.ghosts.some((g, j) => j < i && s.roles?.[j] !== "drone" && samePos(g, m))) { best = m; bestD = d; }
  }
  return best;
}

// Gut feeling: get closer to the goal, and keep a couple of turns between you and every enemy.
function feel(s) {
  const cols = s.grid[0].length;
  const far = s.grid.length * cols;
  const p = s.player.r * cols + s.player.c;
  const goal = goalField(s)[p];
  const exit = goal < 0 ? far : goal;
  let near = far;
  s.ghosts.forEach((g, i) => {
    const d = distancesFrom(s.grid, g, "ghost")[p];
    if (d >= 0) near = Math.min(near, Math.ceil(d / averageSpeed(s, i)));
  });
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

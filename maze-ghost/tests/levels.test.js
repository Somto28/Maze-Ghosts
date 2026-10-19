// Level design guarantees. If you edit a maze in src/levels.js, these tell you if you broke it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LEVELS, describeLevel, ghostBrain, habitsFrom, moveGhosts, movePlayer, naiveRoute, outcome, playerMoves, playtest, replay, solveLevel, stateFromLevel } from "../src/index.js";

const about = LEVELS.map((level) => describeLevel(level));
const brains = LEVELS.map((level) => ghostBrain(level)); // shared, so each position is only searched once

test("there are 6 levels and each one adds a new idea", () => {
  assert.equal(LEVELS.length, 6);
  const [l1, l2, l3, l4, l5, l6] = about;
  assert.ok(l1.wardens === 1 && !l1.drones, "level 1: one guard");
  assert.ok(LEVELS[1].lookahead > LEVELS[0].lookahead && l2.vents, "level 2: looks further ahead, and vents appear");
  assert.ok(l3.wardens > l2.wardens, "level 3: a team of wardens");
  assert.ok(l4.drones > 0, "level 4: a rule-based drone");
  assert.ok(l5.evidence > 0, "level 5: evidence to collect");
  assert.ok(LEVELS[5].learns && l6.drones && l6.evidence, "level 6: learning wardens, with everything before");
  for (let i = 1; i < LEVELS.length; i++) assert.ok(LEVELS[i].lookahead >= LEVELS[i - 1].lookahead, `level ${i + 1} looks less far ahead`);
  for (const level of LEVELS) assert.ok(level.briefing && level.hints?.length && level.concept, `level ${level.id} needs a briefing, hints and a concept`);
});

test("mazes get bigger each level", () => {
  const area = LEVELS.map((l) => l.maze.length * l.maze[0].length);
  for (let i = 1; i < area.length; i++) assert.ok(area[i] > area[i - 1]);
});

LEVELS.forEach((level, i) => {
  test(`level ${level.id} can be beaten against its own enemies`, () => {
    assert.ok(solveLevel(level, { brain: brains[i] }).moves, "no winning route exists");
  });
});

LEVELS.forEach((level, i) => {
  test(`level ${level.id}: running straight for the exit gets you caught`, () => {
    assert.equal(replay(level, naiveRoute(level.maze), brains[i]), "caught");
  });
});

test("level 2: a route that fools a 1-move warden does NOT get past this level's warden", () => {
  const level = LEVELS[1];
  const shallow = { ...level, lookahead: 1 };
  const beatsShallowGhost = solveLevel(shallow).moves;
  if (!beatsShallowGhost) return; // even a 1-move warden is unbeatable here, so there's no shallow trick to test
  assert.equal(replay(shallow, beatsShallowGhost), "escaped");
  assert.notEqual(replay(level, beatsShallowGhost, brains[1]), "escaped");
});

// The difficulty curve, measured with simulated players (src/playtest.js). Seeded, so always the same numbers.
// Players who only GUESS what the wardens will do almost never escape. A player who READS their
// prediction (the "thinker") can win every level, but less often each level.
test("difficulty curve: near impossible unless you read the prediction, and harder every level", () => {
  const rate = (i, skill, games = 100) => playtest(LEVELS[i], { skill, games, brain: LEVELS[i].learns ? null : brains[i] }).rate;
  const thinker = LEVELS.map((_, i) => rate(i, "thinker"));
  const shown = thinker.map((r) => Math.round(r * 100));
  for (let i = 1; i < thinker.length; i++) assert.ok(thinker[i] < thinker[i - 1], `level ${i + 1} should be harder than level ${i} (${shown})`);
  for (let i = 0; i < LEVELS.length; i++) {
    assert.ok(thinker[i] >= 0.03, `level ${i + 1} should still be winnable by a player who reads the wardens (${shown})`);
    assert.ok(rate(i, "average") <= 0.15, `level ${i + 1}: players who ignore the prediction should almost never escape`);
  }
  assert.ok(thinker[0] <= 0.6, "even level 1 should catch a careful player often");
});

test("level 6: the wardens learn, so repeating a caught route gets you caught sooner", () => {
  // Take simulated players' caught attempts, then replay each exact route. Wardens who studied that
  // attempt never let you get further than wardens who forgot it, and stop some routes sooner.
  const level = LEVELS[5];
  const forgetful = ghostBrain({ ...level, learns: false });
  const caught = playtest({ ...level, learns: false }, { skill: "thinker", games: 20, brain: forgetful, record: true, seed: 5 })
    .played.filter((p) => p.result === "caught");
  const survived = (steps, brain) => {
    let s = stateFromLevel(level);
    for (let i = 0; i < steps.length; i++) {
      const m = playerMoves(s).find((x) => x.dir === steps[i].dir);
      if (!m) return i;
      s = movePlayer(s, m);
      if (outcome(s)) return outcome(s) === "caught" ? i : Infinity;
      s = moveGhosts(s, brain(s).to);
      if (outcome(s)) return i;
    }
    return steps.length;
  };
  let sooner = 0;
  for (const { steps } of caught) {
    const before = survived(steps, forgetful);
    const after = survived(steps, ghostBrain(level, habitsFrom([steps])));
    assert.ok(after <= before, `a repeated route lasted longer against learning wardens (${after} vs ${before})`);
    if (after < before) sooner++;
  }
  assert.ok(caught.length > 0 && sooner >= 1, `learning should catch some repeated routes sooner (${sooner} of ${caught.length})`);
});

// Level design guarantees. If you edit a maze in src/levels.js, these tell you if you broke it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LEVELS, describeLevel, ghostBrain, naiveRoute, playtest, replay, solveLevel } from "../src/index.js";

const about = LEVELS.map((level) => describeLevel(level));
const brains = LEVELS.map((level) => ghostBrain(level)); // shared, so each position is only searched once

test("there are 6 levels and each one adds a new idea", () => {
  assert.equal(LEVELS.length, 6);
  const [l1, l2, l3, l4, l5, l6] = about;
  assert.ok(LEVELS[0].lookahead === 1 && l1.wardens === 1 && !l1.drones, "level 1: one ghost that only reacts");
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
  assert.equal(replay(shallow, beatsShallowGhost), "escaped");
  assert.notEqual(replay(level, beatsShallowGhost, brains[1]), "escaped");
});

// The difficulty curve, measured with simulated players (src/playtest.js). Seeded, so always the same numbers.
// Players who only GUESS what the wardens will do get caught more and more often; a player who READS
// their prediction (the "thinker") can still win every level. That gap is the lesson.
test("difficulty curve: each level is harder than the last, and reading the prediction keeps working", () => {
  const rate = (i, skill, games = 120) => playtest(LEVELS[i], { skill, games, brain: LEVELS[i].learns ? null : brains[i] }).rate;
  const average = LEVELS.map((_, i) => rate(i, "average"));
  for (let i = 1; i < average.length; i++) assert.ok(average[i] < average[i - 1], `level ${i + 1} should be harder than level ${i} (${average.map((r) => Math.round(r * 100))})`);
  assert.ok(average[0] >= 0.5, "level 1 should be a gentle start");
  assert.ok(average[5] <= 0.15, "level 6 should catch most players who don't think about the prediction");
  for (let i = 0; i < LEVELS.length; i++) {
    const thinker = rate(i, "thinker", 80);
    assert.ok(thinker >= 0.5, `level ${i + 1} is too hard even for a player who reads the wardens (${thinker})`);
    if (i >= 3) assert.ok(thinker >= 1.5 * rate(i, "strong"), `level ${i + 1}: reading the prediction should matter much more than reflexes`);
  }
});

test("level 6: the wardens learn, so a player who keeps repeating themselves keeps getting caught", () => {
  // A careful player (1% slips) who mostly plays the same way each try. Wardens that study the
  // caught tries should stop more of them by the third try than wardens that forget everything.
  const level = LEVELS[5];
  const learning = playtest(level, { skill: "strong", games: 60, attempts: 3, seed: 3 }).byAttempt[2];
  const forgetful = playtest({ ...level, learns: false }, { skill: "strong", games: 60, attempts: 3, seed: 3 }).byAttempt[2];
  assert.ok(learning < forgetful, `learning ${learning} vs forgetful ${forgetful}`);
});

// Level design guarantees. If you edit a maze in src/levels.js, these tell you if you broke it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LEVELS, ghostBrain, naiveRoute, playtest, replay, solveLevel } from "../src/index.js";

const ghostCount = (level) => (level.maze.join("").match(/G/g) ?? []).length;
const brains = LEVELS.map((level) => ghostBrain(level)); // shared, so each position is only searched once

test("there are 3 levels and the ghosts get stronger each time: further lookahead or more of them", () => {
  assert.equal(LEVELS.length, 3);
  for (let i = 1; i < LEVELS.length; i++) {
    const [prev, cur] = [LEVELS[i - 1], LEVELS[i]];
    assert.ok(cur.lookahead >= prev.lookahead && ghostCount(cur) >= ghostCount(prev), `level ${cur.id} is weaker somewhere`);
    assert.ok(cur.lookahead > prev.lookahead || ghostCount(cur) > ghostCount(prev), `level ${cur.id} isn't stronger`);
  }
});

test("mazes get bigger each level", () => {
  const area = LEVELS.map((l) => l.maze.length * l.maze[0].length);
  for (let i = 1; i < area.length; i++) assert.ok(area[i] > area[i - 1]);
});

LEVELS.forEach((level, i) => {
  test(`level ${level.id} can be beaten against its own ghosts`, () => {
    assert.ok(solveLevel(level, { brain: brains[i] }).moves, "no winning route exists");
  });
});

LEVELS.forEach((level, i) => {
  test(`level ${level.id}: running straight for the exit gets you caught`, () => {
    assert.equal(replay(level, naiveRoute(level.maze), brains[i]), "caught");
  });
});

test("level 2: a route that fools a 1-move ghost does NOT get past this level's ghost", () => {
  const level = LEVELS[1];
  const shallow = { ...level, lookahead: 1 };
  const beatsShallowGhost = solveLevel(shallow).moves;
  assert.equal(replay(shallow, beatsShallowGhost), "escaped");
  assert.notEqual(replay(level, beatsShallowGhost, brains[1]), "escaped");
});

// The difficulty curve, measured with simulated players (src/playtest.js). Seeded, so always the same numbers.
test("difficulty curve: each level is harder than the last, none is impossible for a strong player", () => {
  const rate = (i, skill) => playtest(LEVELS[i], { skill, games: 150, brain: brains[i] }).rate;
  const average = LEVELS.map((_, i) => rate(i, "average"));
  for (let i = 1; i < average.length; i++) assert.ok(average[i] < average[i - 1], `level ${i + 1} should be harder than level ${i}`);
  assert.ok(average[0] >= 0.7, "level 1 should be a gentle start");
  for (let i = 0; i < LEVELS.length; i++) assert.ok(rate(i, "strong") >= 0.5, `level ${i + 1} is too hard for strong players`);
});

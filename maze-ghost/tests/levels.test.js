// Level design guarantees. If you edit a maze in src/levels.js, these tell you if you broke it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LEVELS, naiveRoute, replay, solveLevel } from "../src/index.js";

test("there are 3 levels and the ghost looks further ahead on each one", () => {
  assert.equal(LEVELS.length, 3);
  for (let i = 1; i < LEVELS.length; i++) assert.ok(LEVELS[i].lookahead > LEVELS[i - 1].lookahead);
});

test("mazes get bigger each level", () => {
  const area = LEVELS.map((l) => l.maze.length * l.maze[0].length);
  for (let i = 1; i < area.length; i++) assert.ok(area[i] > area[i - 1]);
});

for (const level of LEVELS) {
  test(`level ${level.id} can be beaten against its own ghost (lookahead ${level.lookahead})`, () => {
    assert.ok(solveLevel(level).moves, "no winning route exists");
  });
}

for (const level of LEVELS.slice(1)) {
  test(`level ${level.id}: running straight for the exit gets you caught`, () => {
    assert.equal(replay(level.maze, level.lookahead, naiveRoute(level.maze)), "caught");
  });
}

test("level 2: a route that fools a 1-move ghost does NOT fool this level's ghost", () => {
  const level = LEVELS[1];
  const beatsShallowGhost = solveLevel({ maze: level.maze, lookahead: 1 }).moves;
  assert.equal(replay(level.maze, 1, beatsShallowGhost), "escaped");
  assert.equal(replay(level.maze, level.lookahead, beatsShallowGhost), "caught");
});

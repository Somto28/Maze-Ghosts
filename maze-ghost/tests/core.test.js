import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseGhostMove, legalMoves, mazeDistance, parseMaze, searchScore, stateFromLevel, WIN } from "../src/index.js";

const state = (maze) => stateFromLevel({ maze });

test("parseMaze separates terrain from start positions", () => {
  const m = parseMaze(["#####", "#P.G#", "#..E#", "#####"]);
  assert.deepEqual(m.player, { r: 1, c: 1 });
  assert.deepEqual(m.ghost, { r: 1, c: 3 });
  assert.deepEqual(m.exits, [{ r: 2, c: 3 }]);
  assert.deepEqual(m.grid[1], ["#", ".", ".", ".", "#"]);
});

test("parseMaze rejects broken mazes", () => {
  assert.throws(() => parseMaze(["#P.E#", "#..#"]), /same length/);
  assert.throws(() => parseMaze(["#.GE#"]), /one P/);
  assert.throws(() => parseMaze(["#P.E#"]), /one G/);
  assert.throws(() => parseMaze(["#PG.#"]), /exit/);
  assert.throws(() => parseMaze(["#P?GE"]), /Unknown tile/);
});

test("nobody walks through walls, and the ghost can't enter exits", () => {
  const s = state(["#####", "#P.G#", "#.#E#", "#####"]);
  assert.deepEqual(legalMoves(s.grid, s.player, "player").map((m) => m.dir).sort(), ["down", "right", "wait"]);
  assert.deepEqual(legalMoves(s.grid, s.ghost, "ghost").map((m) => m.dir).sort(), ["left", "wait"]);
});

test("distance follows the corridors, not a straight line", () => {
  const s = state(["#####", "#P#G#", "#...#", "#E###", "#####"]);
  assert.equal(mazeDistance(s.grid, s.player, s.ghost, "player"), 4);
});

test("the ghost grabs a player standing next to it", () => {
  const s = { ...state(["######", "#PG.E#", "######"]), turn: "ghost" };
  const { move, thinking } = chooseGhostMove(s, 1);
  assert.equal(move.dir, "left");
  assert.ok(thinking.options[0].score >= WIN);
});

test("the ghost chases down a corridor", () => {
  const s = { ...state(["###########", "#P.....G.E#", "###########"]), turn: "ghost" };
  assert.equal(chooseGhostMove(s, 2).move.dir, "left");
});

test("the ghost explains itself: sorted options, one chosen, a plan that alternates turns", () => {
  const s = { ...state(["#########", "#P..#...#", "#.#.#.#.#", "#...G...E", "#########"]), turn: "ghost" };
  const { move, thinking } = chooseGhostMove(s, 3);
  const scores = thinking.options.map((o) => o.score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  assert.equal(thinking.options.filter((o) => o.chosen).length, 1);
  assert.equal(thinking.options.find((o) => o.chosen).dir, move.dir);
  const plan = thinking.options[0].plan;
  plan.forEach((step, i) => assert.equal(step.who, i % 2 === 0 ? "ghost" : "player"));
});

test("looking further ahead means considering more futures", () => {
  const s = { ...state(["#########", "#P..#...#", "#.#.#.#.#", "#.#...#.#", "#...G...E", "#########"]), turn: "ghost" };
  const counts = [1, 2, 3, 4, 5].map((n) => chooseGhostMove(s, n).thinking.futuresConsidered);
  for (let i = 1; i < counts.length; i++) assert.ok(counts[i] > counts[i - 1], `lookahead ${i + 1} should search more`);
});

test("alpha-beta pruning changes the work, not the answer", () => {
  const s = { ...state(["#########", "#P..#...#", "#.#.#.#.#", "#.#...#.#", "#...G...E", "#########"]), turn: "ghost" };
  for (const n of [1, 2, 3, 4]) {
    const fast = chooseGhostMove(s, n, { pruning: true });
    const slow = chooseGhostMove(s, n, { pruning: false });
    const byDir = (t) => Object.fromEntries(t.options.map((o) => [o.dir, o.score]));
    assert.deepEqual(byDir(fast.thinking), byDir(slow.thinking));
    assert.equal(fast.move.dir, slow.move.dir);
    if (n >= 2) assert.ok(fast.thinking.futuresConsidered < slow.thinking.futuresConsidered);
  }
  assert.equal(searchScore(s, 4, true), searchScore(s, 4, false));
});

test("lookahead must be a whole number of at least 1", () => {
  const s = state(["#####", "#PGE#", "#####"]);
  assert.throws(() => chooseGhostMove(s, 0), RangeError);
  assert.throws(() => chooseGhostMove(s, 1.5), RangeError);
});

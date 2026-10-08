import { test } from "node:test";
import assert from "node:assert/strict";
import { LEVELS, MazeGame, buildLayout3D, gridToWorld, worldToGrid, solveLevel } from "../src/index.js";

const tiny = (maze, lookahead = 1) => [{ id: 1, name: "Test", lookahead, maze }];

test("turns alternate: player, then ghost", () => {
  const game = new MazeGame({ levels: tiny(["#########", "#P.....G#", "#.......E", "#########"]) });
  assert.equal(game.state.turn, "player");
  assert.equal(game.ghostMove().event, "notYourTurn");
  assert.equal(game.playerMove("right").event, "moved");
  assert.equal(game.state.turn, "ghost");
  assert.equal(game.playerMove("right").event, "notYourTurn"); // can't move twice
  assert.equal(game.ghostMove().event, "moved");
  assert.equal(game.state.turn, "player");
});

test("walls block the player without using up the turn", () => {
  const game = new MazeGame({ levels: tiny(["#####", "#P.G#", "#..E#", "#####"]) });
  assert.equal(game.playerMove("up").event, "blocked");
  assert.equal(game.state.turn, "player");
  assert.equal(game.turnNumber, 0);
});

test("walking into the ghost, or the ghost reaching you, ends the level", () => {
  const a = new MazeGame({ levels: tiny(["######", "#PG..#", "#...E#", "######"]) });
  assert.equal(a.playerMove("right").event, "caught");
  assert.equal(a.status, "caught");

  const b = new MazeGame({ levels: tiny(["#######", "#P.G..#", "#....E#", "#######"]) });
  const turn = b.takeTurn("right");
  assert.equal(turn.ghost.event, "caught");
  assert.equal(b.status, "caught");
  assert.equal(b.takeTurn("left").player.event, "notYourTurn");
  b.restartLevel();
  assert.equal(b.status, "playing");
});

test("escaping advances through the levels and the last one wins the game", () => {
  const levels = [
    { id: 1, name: "A", lookahead: 1, maze: ["#####", "#PE.#", "#..G#", "#####"] },
    { id: 2, name: "B", lookahead: 2, maze: ["#####", "#PE.#", "#..G#", "#####"] },
  ];
  const game = new MazeGame({ levels });
  assert.throws(() => game.nextLevel(), /Finish/);
  assert.equal(game.playerMove("right").event, "escaped");
  assert.equal(game.status, "levelComplete");
  game.nextLevel();
  assert.equal(game.level.lookahead, 2);
  game.playerMove("right");
  assert.equal(game.status, "gameComplete");
});

test("the game exposes what the ghost was thinking", () => {
  const game = new MazeGame();
  const { ghost } = game.takeTurn("right");
  assert.equal(ghost.thinking.lookahead, LEVELS[0].lookahead);
  assert.ok(ghost.thinking.futuresConsidered > 0);
  assert.equal(game.lastThinking, ghost.thinking);
});

test("playing the proven winning route through the real game clears every level", () => {
  const game = new MazeGame();
  for (let i = 0; i < LEVELS.length; i++) {
    for (const dir of solveLevel(LEVELS[i]).moves) game.takeTurn(dir);
    assert.equal(game.status, i === LEVELS.length - 1 ? "gameComplete" : "levelComplete", `level ${i + 1}`);
    if (game.status === "levelComplete") game.nextLevel();
  }
});

test("3D layout matches the maze", () => {
  for (const level of LEVELS) {
    const layout = buildLayout3D(level, { tileSize: 2 });
    const wallCount = level.maze.join("").split("").filter((ch) => ch === "#").length;
    assert.equal(layout.walls.length, wallCount);
    assert.equal(layout.walls.length + layout.floorTiles.length, layout.rows * layout.cols);
    for (const w of layout.walls) assert.equal(w.position.y, level.theme.wallHeight / 2); // standing on the floor
    assert.deepEqual(layout.playerStart.position, gridToWorld(layout.playerStart, 2));
    assert.ok(layout.floorTiles.some((t) => t.isExit));
  }
  assert.deepEqual(worldToGrid(gridToWorld({ r: 3, c: 5 }, 2), 2), { r: 3, c: 5 });
});

test("later levels have taller walls", () => {
  const heights = LEVELS.map((l) => buildLayout3D(l).theme.wallHeight);
  assert.deepEqual(heights, [...heights].sort((a, b) => a - b));
});

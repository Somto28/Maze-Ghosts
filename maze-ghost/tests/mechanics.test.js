// The newer mechanics: no waiting, drones, vents, evidence drives, learning wardens, and the
// search's memory of positions it already scored.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DASH_WITHIN, GLITCH_AFTER, MazeGame, foresee, chooseGhostMoves, droneMove, evaluate, exitsOpen, goalDistance, habitGrid, habitsFrom, moveGhosts, movePlayer,
  outcome, parseMaze, playerMoves, speedOf, stateFromLevel, LEVELS, WIN,
} from "../src/index.js";

const state = (maze, extra = {}) => stateFromLevel({ maze, lookahead: 1, ...extra });
const dirs = (moves) => moves.map((m) => m.dir).sort();

test("the player can't stand still (the wardens still can)", () => {
  const s = state(["#####", "#P.G#", "#..E#", "#####"]);
  assert.deepEqual(dirs(playerMoves(s)), ["down", "right"]);
});

test("a drone dashes 2 tiles straight at you, then recharges when its pattern says so", () => {
  const s = { ...state(["##########", "#P.....D.#", "#.......E#", "##########"], { dronePattern: [2, 0] }), turn: "ghost" };
  assert.equal(speedOf(s, 0), 2);
  const dash = droneMove(s, 0);
  assert.deepEqual(dash.to, { r: 1, c: 5 });
  assert.equal(dash.path.length, 2);
  const after = moveGhosts(s, [dash.to]);
  assert.equal(speedOf(after, 0), 0); // recharging next turn
  assert.deepEqual(droneMove({ ...after, turn: "ghost" }, 0).to, dash.to);
});

test("a drone catches you if you're within its dash", () => {
  const s = { ...state(["#######", "#P.D..#", "#....E#", "#######"]), turn: "ghost" };
  assert.equal(outcome(moveGhosts(s, chooseGhostMoves(s, 1).move.to)), "caught");
});

test("vents: step onto a grate and you come out of the matching grate; enemies can't use them", () => {
  const s = state(["#########", "#P1...G.#", "#####.#.#", "#1....#.E", "#########"]);
  const right = playerMoves(s).find((m) => m.dir === "right");
  assert.deepEqual({ r: right.r, c: right.c, vent: right.vent }, { r: 3, c: 1, vent: "1" });
  // Enemies can't stand on a grate, so a drone hovers next to it instead.
  const hiding = { ...state(["#########", "#P1..D..#", "#####.#.#", "#1....#.E", "#########"]), player: { r: 1, c: 2 }, turn: "ghost" };
  const to = droneMove(hiding, 0).to;
  assert.equal(hiding.grid[to.r][to.c], ".");
  // Grates come in pairs and can't touch.
  assert.throws(() => parseMaze(["#####", "#P1G#", "#..E#", "#####"]), /exactly two/);
  assert.throws(() => parseMaze(["######", "#P11G#", "#...E#", "######"]), /touch/);
});

test("wardens cut you off: they guard the only way out instead of chasing", () => {
  // You start near the exit corridor; the warden is far behind you but closer to the corridor's mouth.
  const s = { ...state(["###########", "#P........#", "#.#######.#", "#.#.G...#.#", "#.#.###.#.#", "#.......#.E", "###########"]), turn: "ghost" };
  const { move } = chooseGhostMoves(s, 1);
  const before = goalDistance(s);
  // Its move must not leave you a safe run to the exit.
  assert.ok(Number.isFinite(before));
  const after = moveGhosts(s, move.to);
  const reply = chooseGhostMoves({ ...movePlayer(after, playerMoves(after)[0]), turn: "ghost" }, 1);
  assert.ok(reply.thinking.options[0].score > -WIN, "the warden should still have a way to stop you");
});

test("evidence: the exit stays locked until you hold every drive", () => {
  let s = state(["#######", "#PK..G#", "#.....#", "#E#####"].map((r) => r));
  // Exit at (3,1): blocked while the drive is still on the floor.
  s = { ...s, player: { r: 2, c: 1 } };
  assert.ok(!exitsOpen(s));
  assert.ok(!playerMoves(s).some((m) => m.dir === "down"));
  assert.equal(goalDistance(s), 2 + 3); // to the drive at (1,2), then back down to the exit
  s = { ...movePlayer({ ...s, player: { r: 1, c: 1 } }, { r: 1, c: 2 }), turn: "player" };
  assert.ok(exitsOpen(s));
  assert.equal(goalDistance(s), 3);
});

test("the game reports a locked exit and a picked-up drive", () => {
  const game = new MazeGame({ levels: [{ id: 1, name: "T", lookahead: 1, maze: ["########", "#.K..#G#", "#P...#.#", "#E######", "########"] }] });
  assert.equal(game.playerMove("down").event, "locked");
  const r = game.playerMove("up");
  assert.equal(r.event, "moved");
  game.ghostMove();
  assert.equal(game.playerMove("right").pickedUp, true);
  assert.deepEqual(game.evidence, { total: 1, held: 1, exitOpen: true });
});

test("habits: the direction you took most often on each tile, ties to the latest attempt", () => {
  const habits = habitsFrom([
    [{ r: 1, c: 1, dir: "right" }, { r: 1, c: 2, dir: "down" }],
    [{ r: 1, c: 1, dir: "down" }, { r: 2, c: 1, dir: "right" }],
    [{ r: 1, c: 1, dir: "down" }],
  ]);
  assert.deepEqual(habits, { "1,1": "down", "1,2": "down", "2,1": "right" });
  // Ties go to the most recent attempt.
  assert.deepEqual(habitsFrom([[{ r: 1, c: 1, dir: "right" }], [{ r: 1, c: 1, dir: "up" }]]), { "1,1": "up" });
});

test("learning wardens trace your usual route and value ambushing it", () => {
  const s = state(["#########", "#P......#", "#.#####.#", "#...G...E", "#########"]);
  // Last time you went along the top corridor, then down to the exit.
  const habits = { "1,1": "right", "1,2": "right", "1,3": "right", "1,4": "right", "1,5": "right", "1,6": "right", "1,7": "down", "2,7": "down" };
  const plain = evaluate(s);
  const learned = evaluate(s, undefined, habitGrid(s.grid, habits));
  assert.equal(plain.parts.habit, undefined);
  assert.ok(learned.parts.habit > 0, "the warden can reach your usual route before you do");
  assert.ok(learned.total > plain.total);

  const think = chooseGhostMoves({ ...s, turn: "ghost" }, 2, { habits }).thinking;
  assert.equal(think.learned, Object.keys(habits).length);
  const usual = think.options.find((o) => o.chosen);
  assert.equal(usual.predictedPlayerReply === "right", usual.fromHabit);
});

test("only learning levels record your caught attempts, and they survive a restart", () => {
  const maze = ["######", "#P.G.#", "#...E#", "######"];
  const learning = new MazeGame({ levels: [{ id: 1, name: "L", lookahead: 1, learns: true, maze }] });
  learning.takeTurn("right"); // walks into the warden's reach
  assert.equal(learning.status, "caught");
  learning.restartLevel();
  assert.equal(learning.attemptsStudied, 1);
  assert.deepEqual(learning.habits, { "1,1": "right" });
  assert.equal(learning.ghostSearch.options.habits["1,1"], "right");

  const plain = new MazeGame({ levels: [{ id: 1, name: "P", lookahead: 1, maze }] });
  plain.takeTurn("right");
  plain.restartLevel();
  assert.equal(plain.attemptsStudied, 0);
  assert.equal(plain.habits, null);
});

test("remembering scored positions changes the work, not the answer", () => {
  for (const level of [LEVELS[2], LEVELS[3], LEVELS[4]]) {
    const s = { ...stateFromLevel(level), turn: "ghost" };
    const fast = chooseGhostMoves(s, level.lookahead);
    const slow = chooseGhostMoves(s, level.lookahead, { memo: false });
    const byDir = (t) => Object.fromEntries(t.options.map((o) => [o.dir, o.score]));
    assert.deepEqual(byDir(fast.thinking), byDir(slow.thinking), `level ${level.id}`);
    assert.equal(fast.move.dir, slow.move.dir);
    assert.ok(fast.thinking.futuresConsidered < slow.thinking.futuresConsidered);
  }
});

test("drones' dashes come with the tiles they pass, for animation", () => {
  const game = new MazeGame({ levels: [{ id: 1, name: "D", lookahead: 1, maze: ["###########", "#P.......D#", "#.#######.#", "#........E#", "###########"] }] });
  const { ghost } = game.takeTurn("right");
  assert.equal(ghost.paths[0].length, 2);
  assert.deepEqual(ghost.paths[0][1], ghost.to[0]);
});

// ---------- The glitch (unlocks after GLITCH_AFTER catches on a level) ----------

const glitchLevels = () => [
  { id: 1, name: "G", lookahead: 1, maze: ["#########", "#P.....G#", "#.......E", "#########"] },
  { id: 2, name: "H", lookahead: 1, maze: ["#########", "#P.....G#", "#.......E", "#########"] },
];
// Walk right into the warden until caught; returns how many catches that took (1).
function getCaught(game) {
  while (game.status === "playing") game.takeTurn(game.availableMoves.includes("right") ? "right" : game.availableMoves[0]);
  assert.equal(game.status, "caught");
  game.restartLevel();
}

test("the glitch unlocks after GLITCH_AFTER catches on a level, not before", () => {
  const game = new MazeGame({ levels: glitchLevels() });
  assert.equal(GLITCH_AFTER, 5);
  for (let i = 0; i < GLITCH_AFTER - 1; i++) getCaught(game);
  assert.equal(game.glitchUnlocked, false);
  assert.equal(game.toggleGlitch(), false, "can't arm it yet");
  getCaught(game);
  assert.equal(game.catches[0], GLITCH_AFTER);
  assert.equal(game.glitchUnlocked, true);
  assert.equal(game.glitchReady, true);
});

test("a glitch freezes every enemy for one turn, once per attempt, and comes back after a catch", () => {
  const levels = [{ id: 1, name: "G", lookahead: 1, glitchAfter: 1, dronePattern: [2, 0],
    maze: ["###########", "#P.......G#", "#.......D.#", "#.........E", "###########"] }];
  const game = new MazeGame({ levels });
  getCaught(game);
  assert.ok(game.glitchReady);

  const before = game.state.ghosts.map((g) => ({ ...g }));
  const tick = game.state.tick;
  assert.equal(game.toggleGlitch(), true);
  const { player, ghost } = game.takeTurn("down");
  assert.equal(player.event, "moved");
  assert.equal(ghost.event, "glitched");
  assert.deepEqual(game.state.ghosts, before, "nobody moved, drones included");
  assert.equal(game.state.tick, tick, "the drone's dash pattern didn't advance either");
  assert.equal(game.state.turn, "player");
  assert.equal(game.glitchUsed, true);
  assert.equal(game.glitchReady, false, "only once per attempt");
  assert.equal(game.toggleGlitch(), false);

  assert.equal(game.takeTurn("right").ghost.event === "glitched", false, "the next turn is a normal one");

  getCaught(game);
  assert.equal(game.glitchReady, true, "fresh glitch on the next attempt");
});

test("arming the glitch can be undone before you move, and catches are counted per level", () => {
  const game = new MazeGame({ levels: glitchLevels().map((l) => ({ ...l, glitchAfter: 2 })) });
  getCaught(game); getCaught(game);
  assert.equal(game.toggleGlitch(), true);
  assert.equal(game.toggleGlitch(), false, "disarmed");
  assert.equal(game.takeTurn("down").ghost.event, "moved");
  assert.equal(game.glitchUsed, false, "disarming doesn't spend it");

  // Level 2 starts from zero catches.
  const g2 = new MazeGame({ levels: glitchLevels().map((l) => ({ ...l, glitchAfter: 2 })) });
  getCaught(g2); getCaught(g2);
  g2.state = { ...g2.state }; g2.status = "levelComplete";
  g2.nextLevel();
  assert.equal(g2.glitchUnlocked, false);
});

test("beating a level locks the glitch again, so replaying it starts from zero catches", () => {
  const levels = [
    { id: 1, name: "G", lookahead: 1, glitchAfter: 1, maze: ["#######", "#G..P.E", "#######"] },
    { id: 2, name: "H", lookahead: 1, maze: ["#######", "#G..P.E", "#######"] },
  ];
  const game = new MazeGame({ levels });
  while (game.status === "playing") game.takeTurn("left"); // walk into the warden
  assert.equal(game.status, "caught");
  game.restartLevel();
  assert.equal(game.glitchUnlocked, true);
  game.takeTurn("right"); game.takeTurn("right");
  assert.equal(game.status, "levelComplete");
  assert.equal(game.catches[0], 0);
  game.startLevel(0); // come back to it from the menu
  assert.equal(game.glitchUnlocked, false, "the glitch is locked again after a win");
});

// ---------- The dash (earned by beating a level in DASH_WITHIN tries or fewer) ----------

test("beating a level in under 5 tries earns one dash; more tries earns nothing", () => {
  assert.equal(DASH_WITHIN, 4);
  const easy = { id: 1, name: "E", lookahead: 1, maze: ["#######", "#G..P.E", "#######"] };
  const game = new MazeGame({ levels: [easy, { ...easy, id: 2 }, { ...easy, id: 3 }] });
  assert.equal(game.hasDash, false);
  game.takeTurn("right"); game.takeTurn("right"); // first try
  assert.equal(game.status, "levelComplete");
  assert.equal(game.wonInTries, 1);
  assert.equal(game.dashEarned, true);
  assert.equal(game.hasDash, true);
  // Level 2 in 5 tries: no new dash (and you only ever hold one anyway).
  game.nextLevel();
  for (let i = 0; i < 4; i++) game.restartLevel();
  game.takeTurn("right"); game.takeTurn("right");
  assert.equal(game.wonInTries, 5);
  assert.equal(game.dashEarned, false);
});

test("a dash runs two tiles before the enemies reply, is used up, and works on any level", () => {
  const level = { id: 1, name: "D", lookahead: 1, maze: ["#########", "#P......#", "#......G#", "#.......E", "#########"] };
  const game = new MazeGame({ levels: [level, { ...level, id: 2 }] });
  game.hasDash = true; // as if earned on an earlier level
  assert.equal(game.toggleDash(), true);
  const before = game.state.ghosts.map((g) => ({ ...g }));
  const { player, ghost } = game.takeTurn("right");
  assert.equal(player.dashed, true);
  assert.deepEqual(player.to, { r: 1, c: 3 }, "two tiles in one move");
  assert.equal(player.path.length, 2);
  assert.equal(ghost.event, "moved", "then the enemies get one reply, not two");
  assert.notDeepEqual(game.state.ghosts, before);
  assert.equal(game.hasDash, false, "one use");
  assert.equal(game.toggleDash(), false, "nothing left to arm");
});

test("a dash into a wall after one tile is just a step, and you keep the dash", () => {
  const level = { id: 1, name: "W", lookahead: 1, maze: ["#######", "#P.#..#", "#....G#", "#.....E", "#######"] };
  const game = new MazeGame({ levels: [level] });
  game.hasDash = true;
  game.toggleDash();
  const { player } = game.takeTurn("right");
  assert.deepEqual(player.to, { r: 1, c: 2 });
  assert.equal(player.dashed, false);
  assert.equal(player.dashBlocked, true);
  assert.equal(game.hasDash, true, "kept for later");
  assert.equal(game.dashArmed, false);
});

// ---------- What the enemies foresee for each of your moves (src/insight.js) ----------

test("foresee: a move next to a warden is 'caught next turn', a move into one is caught at once, open floor is safe", () => {
  const s = state(["########", "#..P.G.#", "#......#", "#......E", "########"]);
  const by = Object.fromEntries(foresee(s, 1).map((o) => [o.dir, o]));
  assert.equal(by.right.verdict, "caught");
  assert.equal(by.right.moves, 1, "they step onto you right after");
  assert.equal(by.left.verdict, "safe");
  assert.ok(!by.up, "walls aren't listed");
  const t = state(["#####", "#PG.#", "#...E", "#####"]);
  assert.equal(foresee(t, 1).find((o) => o.dir === "right").moves, 0, "walking into them");
});

test("foresee: stepping onto the open exit is an escape", () => {
  const s = state(["######", "#G..PE", "######"]);
  assert.equal(foresee(s, 1).find((o) => o.dir === "right").verdict, "escape");
});

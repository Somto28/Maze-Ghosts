# Clearpath

*(Prototype name: Maze Ghost. The folder and package names still use it.)*

A turn-based maze escape. You move, then the enemies move. The Wardens use **adversarial search** (minimax with alpha-beta pruning) to predict your moves, and **each level adds one new idea** about how an AI predicts people. You can't stand still: every turn you commit to a direction, so reading the Wardens' plan is how you win.

| Level | Maze | Enemies | New idea | What it feels like |
| --- | --- | --- | --- | --- |
| 1 · The Basement | 9 × 9 | 1 ghost, looks 1 move ahead | Reacting isn't predicting | It chases where you ARE. Lead it away, then run |
| 2 · The Server Halls | 11 × 11 | 1 warden, 3 moves ahead + a vent | Predicting where you'll be | It heads for where you WILL be, and waits at the other end of the vent |
| 3 · The Core | 13 × 13 | 2 wardens, 3 moves ahead | Teamwork | One chases while the other cuts you off |
| 4 · The Data Vault | 13 × 15 | 1 warden + 1 drone + vents | Fast rules vs. slow thinking | The drone dashes 2 tiles at you, then recharges. Fast, but 100% predictable |
| 5 · The Archive | 15 × 15 | 2 wardens + 2 evidence drives | When the AI knows your goal | They guard the drives you need. Grab them in the order they don't expect |
| 6 · The Uplink | 15 × 17 | 2 wardens + drone + evidence | Learning from your data | Every time they catch you, they study your route and expect you to repeat it |

Plain JavaScript (ES modules), no dependencies. The 3D example loads Three.js from a CDN.

```bash
npm test               # 50 tests, including level guarantees and the difficulty curve
npm run play           # play in the terminal (add -- --think to see the ghosts' scores)
npm run 3d             # then open http://localhost:5173/examples/ for the 3D version
npm run check-levels   # after editing a maze: is it still beatable, and how hard does it feel?
```

## How the ghosts think (`src/ai.js`)

The ghosts and the player are opponents. The ghosts are **MAX** (want a high score) and assume you are **MIN** (you'll always pick the move that's worst for them).

1. The ghosts list their legal **team moves**: one step for every ghost at once, every combination (two ghosts can't end on the same tile). With one ghost that's just its own moves.
2. For each one they imagine your best reply, then their next move, then your reply… until they have looked `lookahead` of their own moves ahead (`lookahead × 2` half-moves).
3. At the end of each imagined future they score the position:
   `score = −10 × (turns the nearest enemy needs to reach you) + 4 × (how far you still have to walk)`
   "How far you still have to walk" goes through every evidence drive still on the floor, then to the exit. A catch is +1000 and an escape is −1000. Optional weights (`pack`, `territory`) make the team close in together or shrink the area you can reach first.
4. Alpha-beta pruning skips futures that one side would never allow. It gives the same answer, just faster. The search also remembers positions it already scored this turn (a *transposition table*): two wardens reach the same position in many different orders, so this cuts the work about 3×, again without changing the answer.
5. They pick the highest-scoring team move. Ties always go the same way, so the wardens are predictable and the levels can be checked.

Because the team move is searched as one, two wardens coordinate on their own: in a corridor they squeeze you from both ends instead of following each other. Each extra warden multiplies the work by about 5, so `MAX_GHOSTS` is 3.

Walking distance is measured with breadth-first search through the corridors, not in a straight line. Enemies can't step onto exit tiles (so they can't park on the exit) or into vents.

**You can't wait.** Every turn you must move (`PLAYER_CAN_WAIT` in `src/rules.js`); the wardens can still hold still. That keeps the pressure on and makes the plan dots matter.

### Drones: rules instead of search (Level 4+)

A drone (`D` in a maze) doesn't search at all. Each enemy turn it moves along its `dronePattern` (Levels 4 and 6 use `[2, 0]`: dash 2 tiles, then recharge for a turn) straight toward where you are *now*, ending as close to you as it can. If you're in a vent it hovers at the opening nearest you. The wardens know that rule, so inside their search they move the drones exactly as the drones really will, and plan around them. The contrast is the lesson: the drone is faster than anything, but a player who learns its rule can lead it anywhere.

### Learning wardens (Level 6, `src/learning.js`)

On a level with `learns: true`, every attempt where you're caught is recorded: on each tile, which way you went. `habitsFrom(attempts)` turns that into one habit per tile (most common direction, ties to the latest try). Next attempt, on those tiles the search stops assuming "your smartest move" and assumes "what you did last time". The game draws those tiles as red arrows and marks those predictions `habit` in the HUD. Repeat yourself and they're waiting; change your route and their prediction is wrong. It's also the ethics question in miniature: they got better at predicting you by collecting data about you.

## Using it in your own game (`src/game.js`)

```js
import { MazeGame } from "./src/index.js";

const game = new MazeGame();

const you = game.playerMove("right");   // "moved" | "blocked" | "locked" | "escaped" | "caught" | "notYourTurn"
you.pickedUp;                           // true if you just grabbed an evidence drive
if (you.event === "moved") {
  const ghosts = game.ghostMove();      // runs adversarial search at this level's lookahead
  ghosts.dir;                           // a label: "left", or "left + drone up→up" with a drone
  ghosts.to;                            // where each enemy went: [{ r, c }, ...]
  ghosts.paths;                         // every tile each enemy passed through (a drone's dash covers 2)
  ghosts.thinking;                      // every option they considered, its score, and the future they predicted
}

game.state.ghosts;    // [{ r, c }, ...], one per G or D in the maze; game.state.roles says which is which
game.evidence;        // { total, held, exitOpen }
game.attemptsStudied; // learning levels: how many caught attempts the wardens have studied
game.habits;          // learning levels: { "row,col": "dir" } they expect you to repeat
game.status;          // "playing" | "caught" | "levelComplete" | "gameComplete"
game.restartLevel();  // learning wardens keep what they learned; game.forgetAttempts() wipes it
game.nextLevel();     // only after "levelComplete"
game.level;           // { id, name, lookahead, maze, theme, enemy?, weights?, dronePattern?, learns?, concept, briefing, hints }
```

`game.takeTurn(dir)` does both moves at once. Splitting them lets you animate your move, pause, then animate the ghosts.

The search can run somewhere else (the 3D example uses a Web Worker so the animation never stalls): send `game.ghostSearch` to `chooseGhostMoves(state, lookahead, options)` and pass the result to `game.ghostMove(decision)`.

`thinking.options[i].plan` is the whole future the ghosts expect (ghosts, you, ghosts, you…); a ghosts' step lists every ghost's tile. The 3D example draws it as dots on the floor so players can *see* the adversarial search. `thinking.options[i].fromHabit` is true when the predicted reply came from your recorded habits.

Each level also carries its teaching text: `concept` (the new idea, a few words), `briefing` (shown before the level starts) and `hints` (shown one after another when you're caught, each nudging you to think about how the prediction caught you). `describeLevel(level)` gives the HUD and menu a plain-language summary of the enemies.

## 3D (`src/layout3d.js`)

The rules stay on a flat grid; only the drawing is 3D. `buildLayout3D(level)` returns renderer-agnostic data:

- `walls`: position and size of every wall box (standing on the floor at y = 0)
- `floor`, `floorTiles` (with `isExit` and `isVent`), `exits`, `playerStart`, `ghostStarts` (with `role`: `"warden"` or `"drone"`), `keys` (evidence drives)
- `camera`: a suggested tilted overhead view
- `theme`: wall height, colors, fog and lighting per level. Walls get taller as levels get harder.

Use `gridToWorld({ r, c })` to place a model on a tile and `worldToGrid({ x, z })` to turn a click on the floor back into a tile. `examples/three-view.js` is a complete Three.js version with keyboard and on-screen buttons.

A level's `theme.style` gives it custom art and a matching HUD: `"basement"` (Levels 1 and 5, `examples/basement.*`), `"server-halls"` (Levels 2 and 4, `examples/server-halls.*`) and `"core"` (Levels 3 and 6, `examples/core.*`). Levels 4-6 reuse a look for now; the page sets `body[data-level]` so each CSS file relabels its HUD for them (e.g. "Data Vault" instead of "Server floor"). Drones, evidence drives, vents (floor grates), the locked exit (red until you hold every drive) and learned-habit arrows are drawn by `three-view.js` on top of any look; `theme.droneColor` colours the drone. `examples/quality.js` keeps the frame rate smooth by lowering the render resolution on slower devices, and `examples/ghost-worker.js` does the ghosts' thinking off the main thread.

Handy URL options for the 3D example: `?level=3` starts on Level 3, `?fps` shows the frame rate and resolution, `?res=1` pins the resolution (for comparing performance), `?intro=0` skips the opening cutscene, `?title=0` skips the home screen.

## Home screen (`examples/title-screen.js`)

The game, **Clearpath**, opens on a pixel-art home screen with its own chiptune theme ("Lookahead", A minor, 96 BPM). The menu has **Start story** (prologue, cutscene, then Level 1), **Choose level**, **How the Wardens think** (minimax, lookahead, and the data-consent question in kid-friendly language) and a sound toggle. Press **M** during the game to come back to it.

The monitor on the home screen is a live demo, not a recording: a simple bot plays Level 1 or 2 against the real Warden AI from `src/`, and the red dots are the future the Warden predicts. It skips Level 3 because two wardens take too long to think for a background animation on a Chromebook.

`showTitleScreen({ levels })` resolves with `{ mode: "story" }` or `{ mode: "level", index }`. Like the cutscene, it swallows every key while it's open and `three-view.js` pauses the 3D rendering.

## Prologue (`examples/prologue.js`)

**Start story** begins with the prologue, which doubles as the tutorial. It opens on a Clearpath TV ad hosted by Pip, a friendly mascot robot, that teaches the game's ideas with examples an 8th grader can follow:

1. **Prediction = spotting patterns.** Maya walks her dog at 7:00 every day, so Pip is 92% sure about Saturday.
2. **Minimax.** In a two-move points game, the greedy 9 is really worth 1 because the opponent picks next, so Pip takes the sure 4.
3. **Lookahead and pruning.** Futures multiply (5, 25, 125, 625), so Pip skips branches that can't beat its best plan. "Basic Pip looks 1 move ahead. Premium Pip looks 3."
4. **The chase.** Red dots are Pip's plan and gold dots are the moves it predicts you'll make: the same colours as the in-game HUD.
5. **Products and fine print**, which plants the data-consent question.

The camera then pulls back out of the TV into a dark living room. Someone on the couch, seen from behind, thinks about what they just watched, and the player answers for them: four comprehension questions (one per idea above) and two ethics questions with no wrong answer. Every choice gets a short reply that explains the idea, so a wrong pick still teaches something. The smart speaker says goodnight, a text from Clearpath HR reveals it's Sam the night before his first day, and a "Six months later" card hands off to the cutscene below.

Answers use the mouse or keys 1-3; Enter continues, Space pauses the ad, Esc skips. The questions and the ad's lines are plain text in `STEPS`, so they're easy to edit.

## Opening cutscene (`examples/cutscene.js`)

Before Level 1, a 1:44 pixel-art cutscene ("After Hours") tells the story: a Clearpath employee takes the elevator down to a secret sub-level, finds Dr. Voss feeding private data into the Wardens, and has to run. It ends with a Warden's view of its minimax search and predicted escape routes, which sets up the levels.

- Drawn in code on a 320 × 180 canvas and scaled up without smoothing (no image files); sound is synthesized with the Web Audio API.
- `playCutscene()` returns a promise that resolves when it ends or is skipped. While it's on screen it swallows every key, and `three-view.js` pauses the 3D rendering.
- Players can pause (Space), skip (Esc or the Skip button) and mute it. It waits for a click or key press first because browsers only allow sound after one.
- Each shot in `SHOTS` has its length, dialogue lines, sound cues and a `draw(t)` function. Character and place names are placeholders.

## Level guarantees and difficulty (`tests/levels.test.js`, `src/playtest.js`)

Because the enemies are predictable, `solveLevel()` can search every situation and prove a level is beatable. That says nothing about how hard a level *feels*, so `playtest()` plays each level hundreds of times with simulated players. Runs are seeded, so the numbers never change unless the level does.

- **beginner / average / strong** head for the goal, keep away from the enemies and slip up now and then (15% / 8% / 1% of moves). They only *guess* what the wardens will do ("it steps toward me"): a kid who ignores the red dots.
- **thinker** *reads* the wardens' prediction (it knows how they'll really answer each move, which is what the plan dots show) and plans 3 of its own moves ahead. That's the kid the game is trying to grow.

| First-try escape rate | Beginner | Average | Strong | Thinker |
| --- | --- | --- | --- | --- |
| Level 1 · The Basement | 31% | 66% | 76% | 98% |
| Level 2 · The Server Halls | 21% | 46% | 71% | 90% |
| Level 3 · The Core | 18% | 36% | 56% | 83% |
| Level 4 · The Data Vault | 7% | 28% | 49% | 76% |
| Level 5 · The Archive | 2% | 10% | 26% | 82% |
| Level 6 · The Uplink | 1% | 9% | 24% | 70% |
| *Old Level 1 (before the redesign, same rules)* | *62%* | *85%* | *100%* | *100%* |
| *Old Level 2* | *19%* | *51%* | *99%* | *89%* |

The gap between the guessers and the thinker is the point: from Level 4 on, reflexes alone get you caught most of the time, but reading the prediction still works. On Level 6 the wardens also learn: a strong (but repetitive) player who keeps retrying escapes by try 1-5 only 24% → 40% of the time, against about 73% by try 4 when the wardens forget everything between tries.

Old Level 3 isn't in the table: once waiting was removed it became a single narrow escape at the very start (thinker 0%), so it was rebuilt.

How the mazes were made: each new layout was generated (a random maze with extra loops, then enemies, drives and vents placed by distance) and scored against a target curve with these simulated players; the closest one was kept, then hand-checked for readability. Small changes matter a lot: moving one evidence drive on Level 5 swung the thinker from 84% to 3%. Always run `npm run check-levels` after editing a maze (add a level number, e.g. `npm run check-levels -- 5`, to check just one).

The tests check that:

- every level can be beaten against its own enemies, and running straight for the exit gets you caught;
- each level adds its new idea (lookahead, vents, a team, a drone, evidence, learning) and comes with a briefing and hints;
- on Level 2, a route that fools a 1-move warden doesn't get past the real 3-move warden;
- each level is harder than the last for average players, Level 1 is a gentle start, Level 6 catches most players who don't think about the prediction, a thinker beats every level at least half the time, and from Level 4 on reading the prediction matters much more than reflexes;
- Level 6's learning wardens stop a repeating player more often than wardens that forget.

`npm test` takes about a minute and a half, mostly proving Levels 5 and 6 beatable. These are simulated players; playtesting with real kids is the real test.

## Changing things

- **Difficulty:** change `lookahead` in `src/levels.js`, or add another `G` to a maze. Each extra step or warden multiplies the work by roughly 5; check the thinking time stays short on a Chromebook. Drones (`D`) cost almost nothing to think about, so they're the cheap way to add pressure: `dronePattern: [2, 1]` makes them faster on average than `[2, 0]`, and `[2]` (dash every turn) is brutal.
- **Teaching text:** each level's `concept`, `briefing` and `hints` in `src/levels.js` are plain strings. Hints are shown in order, one per catch.
- **Mazes:** edit the text maps in `src/levels.js`, then run `npm run check-levels`. Small changes matter a lot with two wardens: moving one start tile can swing the strong-player escape rate from 88% to 0%.
- **Ghost personality:** change `WEIGHTS` in `src/ai.js`, or give one level its own `weights`. `territory` is powerful and sensitive: `territory: 1` on Level 2 takes average players from 45% to about 23%.
- **Less predictable ghosts:** `new MazeGame({ rng: Math.random })` breaks ties randomly. The level checker's guarantees then become "usually" instead of "always".

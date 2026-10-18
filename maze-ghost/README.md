# Maze Ghost

A turn-based maze escape. You move, then the ghosts move. They use **adversarial search** (minimax with alpha-beta pruning) to predict your moves, and **each level they get stronger**: they look further ahead, and on the last level there are two of them, planning as a team.

| Level | Maze | Enemies | Lookahead | What it feels like |
| --- | --- | --- | --- | --- |
| 1 · The Basement | 9 × 9 | 1 ghost | 1 move | Reacts to where you are right now |
| 2 · The Server Halls | 11 × 11 | 1 ghost | 3 moves | Starts cutting you off |
| 3 · The Core | 13 × 13 | 2 wardens | 3 moves | One chases while the other cuts you off |

Plain JavaScript (ES modules), no dependencies. The 3D example loads Three.js from a CDN.

```bash
npm test               # 32 tests, including level guarantees and the difficulty curve
npm run play           # play in the terminal (add -- --think to see the ghosts' scores)
npm run 3d             # then open http://localhost:5173/examples/ for the 3D version
npm run check-levels   # after editing a maze: is it still beatable, and how hard does it feel?
```

## How the ghosts think (`src/ai.js`)

The ghosts and the player are opponents. The ghosts are **MAX** (want a high score) and assume you are **MIN** (you'll always pick the move that's worst for them).

1. The ghosts list their legal **team moves**: one step for every ghost at once, every combination (two ghosts can't end on the same tile). With one ghost that's just its own moves.
2. For each one they imagine your best reply, then their next move, then your reply… until they have looked `lookahead` of their own moves ahead (`lookahead × 2` half-moves).
3. At the end of each imagined future they score the position:
   `score = −10 × (nearest ghost's walking distance to you) + 4 × (your walking distance to the exit)`
   A catch is +1000 and an escape is −1000. Optional weights (`pack`, `territory`) make the team close in together or shrink the area you can reach first.
4. Alpha-beta pruning skips futures that one side would never allow. It gives the same answer, just faster.
5. They pick the highest-scoring team move. Ties always go the same way, so the ghosts are predictable and the levels can be checked.

Because the team move is searched as one, two wardens coordinate on their own: in a corridor they squeeze you from both ends instead of following each other. Each extra ghost multiplies the work by about 5, so `MAX_GHOSTS` is 3.

Walking distance is measured with breadth-first search through the corridors, not in a straight line. Ghosts can't step onto exit tiles, so they can't simply park on the exit.

## Using it in your own game (`src/game.js`)

```js
import { MazeGame } from "./src/index.js";

const game = new MazeGame();

const you = game.playerMove("right");   // "moved" | "blocked" | "escaped" | "caught" | "notYourTurn"
if (you.event === "moved") {
  const ghosts = game.ghostMove();      // runs adversarial search at this level's lookahead
  ghosts.dir;                           // a label: "left", or "left + up" for two ghosts
  ghosts.to;                            // where each ghost went: [{ r, c }, ...]
  ghosts.thinking;                      // every option they considered, its score, and the future they predicted
}

game.state.ghosts;  // [{ r, c }, ...], one per G in the maze
game.status;        // "playing" | "caught" | "levelComplete" | "gameComplete"
game.restartLevel();
game.nextLevel();   // only after "levelComplete"
game.level;         // { id, name, lookahead, maze, theme, enemy?, weights? }
```

`game.takeTurn(dir)` does both moves at once. Splitting them lets you animate your move, pause, then animate the ghosts.

The search can run somewhere else (the 3D example uses a Web Worker so the animation never stalls): send `game.ghostSearch` to `chooseGhostMoves(state, lookahead, options)` and pass the result to `game.ghostMove(decision)`.

`thinking.options[i].plan` is the whole future the ghosts expect (ghosts, you, ghosts, you…); a ghosts' step lists every ghost's tile. The 3D example draws it as dots on the floor so players can *see* the adversarial search.

## 3D (`src/layout3d.js`)

The rules stay on a flat grid; only the drawing is 3D. `buildLayout3D(level)` returns renderer-agnostic data:

- `walls`: position and size of every wall box (standing on the floor at y = 0)
- `floor`, `floorTiles`, `exits`, `playerStart`, `ghostStarts`
- `camera`: a suggested tilted overhead view
- `theme`: wall height, colors, fog and lighting per level. Walls get taller as levels get harder.

Use `gridToWorld({ r, c })` to place a model on a tile and `worldToGrid({ x, z })` to turn a click on the floor back into a tile. `examples/three-view.js` is a complete Three.js version with keyboard and on-screen buttons.

A level's `theme.style` gives it custom art and a matching HUD: `"basement"` (Level 1, `examples/basement.*`), `"server-halls"` (Level 2, `examples/server-halls.*`) and `"core"` (Level 3, `examples/core.*`). `examples/quality.js` keeps the frame rate smooth by lowering the render resolution on slower devices, and `examples/ghost-worker.js` does the ghosts' thinking off the main thread.

Handy URL options for the 3D example: `?level=3` starts on Level 3, `?fps` shows the frame rate and resolution, `?res=1` pins the resolution (for comparing performance), `?intro=0` skips the opening cutscene.

## Opening cutscene (`examples/cutscene.js`)

Before Level 1, a 1:44 pixel-art cutscene ("After Hours") tells the story: a Clearpath employee takes the elevator down to a secret sub-level, finds Dr. Voss feeding private data into the Wardens, and has to run. It ends with a Warden's view of its minimax search and predicted escape routes, which sets up the levels.

- Drawn in code on a 320 × 180 canvas and scaled up without smoothing (no image files); sound is synthesized with the Web Audio API.
- `playCutscene()` returns a promise that resolves when it ends or is skipped. While it's on screen it swallows every key, and `three-view.js` pauses the 3D rendering.
- Players can pause (Space), skip (Esc or the Skip button) and mute it. It waits for a click or key press first because browsers only allow sound after one.
- Each shot in `SHOTS` has its length, dialogue lines, sound cues and a `draw(t)` function. Character and place names are placeholders.

## Level guarantees and difficulty (`tests/levels.test.js`, `src/playtest.js`)

Because the ghosts are predictable, `solveLevel()` can search every situation and prove a level is beatable. That says nothing about how hard a level *feels*, so `playtest()` plays each level hundreds of times with simulated players: they head for the exit, keep away from the ghosts, think 0 or 1 moves ahead, and slip up now and then (beginner 15% of moves, average 8%, strong 1%). Runs are seeded, so the numbers never change unless the level does.

| Escape rate | Beginner | Average | Strong |
| --- | --- | --- | --- |
| Level 1 | 56% | 82% | 99% |
| Level 2 | 19% | 45% | 98% |
| Level 3 | 4% | 34% | 88% |
| *Old Level 3 (1 ghost, lookahead 5)* | *27%* | *68%* | *99%* |

The old Level 3 was easier than Level 2. Two wardens in the old maze went the other way (simulated players escaped 3–9% of the time), so Level 3 got a more open maze, chosen by generating candidate layouts and keeping the one closest to the target curve.

The tests check that:

- every level can be beaten against its own ghosts, and running straight for the exit gets you caught;
- each level's ghosts are stronger than the last (further lookahead or more of them);
- on Level 2, a route that fools a 1-move ghost doesn't get past the real 3-move ghost;
- each level is harder than the last for average players, Level 1 is a gentle start, and strong players beat every level at least half the time.

These are simulated players; playtesting with real kids is the real test.

## Changing things

- **Difficulty:** change `lookahead` in `src/levels.js`, or add another `G` to a maze. Each extra step or ghost multiplies the work by roughly 5; check the thinking time stays short on a Chromebook.
- **Mazes:** edit the text maps in `src/levels.js`, then run `npm run check-levels`. Small changes matter a lot with two wardens: moving one start tile can swing the strong-player escape rate from 88% to 0%.
- **Ghost personality:** change `WEIGHTS` in `src/ai.js`, or give one level its own `weights`. `territory` is powerful and sensitive: `territory: 1` on Level 2 takes average players from 45% to about 23%.
- **Less predictable ghosts:** `new MazeGame({ rng: Math.random })` breaks ties randomly. The level checker's guarantees then become "usually" instead of "always".

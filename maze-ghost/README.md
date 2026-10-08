# Maze Ghost

A turn-based maze escape. You move, then the ghost moves. The ghost uses **adversarial search** (minimax with alpha-beta pruning) to predict your moves, and **each level it looks further ahead**. That lookahead is the difficulty setting.

| Level | Maze | Ghost lookahead | What it feels like |
| --- | --- | --- | --- |
| 1 · The Basement | 9 × 9 | 1 move | Reacts to where you are right now |
| 2 · The Server Halls | 11 × 11 | 3 moves | Starts cutting you off |
| 3 · The Core | 13 × 13 | 5 moves | Predicts your route and blocks it |

Plain JavaScript (ES modules), no dependencies. The 3D example loads Three.js from a CDN.

```bash
npm test               # 26 tests, including level guarantees
npm run play           # play in the terminal (add -- --think to see the ghost's scores)
npm run 3d             # then open http://localhost:5173/examples/ for the 3D version
npm run check-levels   # after editing a maze: is it still beatable?
```

## How the ghost thinks (`src/ai.js`)

The ghost and the player are opponents. The ghost is **MAX** (wants a high score) and assumes you are **MIN** (you'll always pick the move that's worst for it).

1. The ghost lists its legal moves.
2. For each one it imagines your best reply, then its next move, then your reply… until it has looked `lookahead` of its own moves ahead (`lookahead × 2` half-moves).
3. At the end of each imagined future it scores the position:
   `score = −10 × (ghost's walking distance to you) + 4 × (your walking distance to the exit)`
   A catch is +1000 and an escape is −1000.
4. Alpha-beta pruning skips futures that one side would never allow. It gives the same answer, just faster: on Level 3 it checks about 950 futures per move instead of several thousand.
5. It picks the highest-scoring move. Ties always go the same way, so the ghost is predictable and the levels can be checked.

Walking distance is measured with breadth-first search through the corridors, not in a straight line. The ghost can't step onto exit tiles, so it can't simply park on the exit.

## Using it in your own game (`src/game.js`)

```js
import { MazeGame } from "./src/index.js";

const game = new MazeGame();

const you = game.playerMove("right");   // "moved" | "blocked" | "escaped" | "caught" | "notYourTurn"
if (you.event === "moved") {
  const ghost = game.ghostMove();       // runs adversarial search at this level's lookahead
  ghost.dir;                            // where it went
  ghost.thinking;                       // every option it considered, its score, and the future it predicted
}

game.status;        // "playing" | "caught" | "levelComplete" | "gameComplete"
game.restartLevel();
game.nextLevel();   // only after "levelComplete"
game.level;         // { id, name, lookahead, maze, theme }
```

`game.takeTurn(dir)` does both moves at once. Splitting them lets you animate your move, pause, then animate the ghost.

`ghost.thinking.options[i].plan` is the whole future the ghost expects (ghost, you, ghost, you…). The 3D example draws it as dots on the floor so players can *see* the adversarial search.

## 3D (`src/layout3d.js`)

The rules stay on a flat grid; only the drawing is 3D. `buildLayout3D(level)` returns renderer-agnostic data:

- `walls`: position and size of every wall box (standing on the floor at y = 0)
- `floor`, `floorTiles`, `exits`, `playerStart`, `ghostStart`
- `camera`: a suggested tilted overhead view
- `theme`: wall height, colors, fog and lighting per level. Walls get taller and the halls darker as levels get harder.

Use `gridToWorld({ r, c })` to place a model on a tile and `worldToGrid({ x, z })` to turn a click on the floor back into a tile. `examples/three-view.js` is a complete Three.js version with keyboard and on-screen buttons.

## Level guarantees (`tests/levels.test.js`)

Because the ghost is predictable, `solveLevel()` can search every situation and prove a level is beatable. The tests check that:

- every level can be beaten against its own ghost;
- running straight for the exit gets you caught on Levels 2 and 3;
- on Level 2, a route that fools a 1-move ghost gets caught by the real 3-move ghost.

When I simulated players of different skill (who think 0 to 3 moves ahead and sometimes make random mistakes), escape rates were roughly 85% on Level 1, 50% on Level 2 and 40% on Level 3. These are rough estimates; playtesting with real kids is the real test.

## Changing things

- **Difficulty:** change `lookahead` in `src/levels.js`. Each extra step multiplies the work by roughly 5; lookahead 6 still takes only about 50 ms per move on a 13 × 13 maze.
- **Mazes:** edit the text maps in `src/levels.js`, then run `npm run check-levels`.
- **Ghost personality:** change `WEIGHTS` in `src/ai.js`.
- **Less predictable ghost:** `new MazeGame({ rng: Math.random })` breaks ties randomly. The level checker's guarantees then become "usually" instead of "always".

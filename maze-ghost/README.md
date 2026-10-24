# Clearpath

*(Prototype name: Maze Ghost. The folder and package names still use it.)*

A turn-based maze escape. You move, then the enemies move. The Wardens use **adversarial search** (minimax with alpha-beta pruning) to predict your moves, and **each level adds one new idea** about how an AI predicts people. You can't stand still: every turn you commit to a direction, so reading the Wardens' plan is how you win.

| Level | Maze | Enemies | New idea | What it feels like |
| --- | --- | --- | --- | --- |
| 1 · The Basement | 9 × 11 | 1 warden that only reacts | Reacting isn't predicting | It chases you everywhere but can't get ahead of you. Lure it, then race it to the exit, and avoid dead ends |
| 2 · The Server Halls | 11 × 11 | 1 warden, 3 moves ahead + 1 vent | Predicting where you'll be | It heads for where you WILL be, including the far end of the vent |
| 3 · The Core | 13 × 13 | 2 wardens + 2 vents | Teamwork | One guards the way out while the other hunts you |
| 4 · The Data Vault | 13 × 15 | 2 wardens + 1 drone + 2 vents | Fast rules vs. slow thinking | The drone dashes 2 tiles at you, then recharges. Lure them, crawl through a vent, sprint for the vault door |
| 5 · The Archive | 15 × 15 | 2 wardens + drone + 2 vents + 2 evidence drives | When the AI knows your goal | They wait where you have to go, and the drone guards the door |
| 6 · The Uplink | 15 × 17 | 2 wardens + drone + 3 vents + evidence | Learning from your data | Every time they catch you, they study your route and set up ambushes on it |

Plain JavaScript (ES modules), no dependencies. The 3D example loads Three.js from a CDN.

```bash
npm test               # 52 tests, including level guarantees and the difficulty curve
npm run play           # play in the terminal (add -- --think to see the ghosts' scores)
npm run 3d             # then open http://localhost:5173/game_server/ for the 3D version
npm run check-levels   # after editing a maze: is it still beatable, and how hard does it feel?
npm run classroom      # how far a simulated class gets in 10 minutes
```

## How the ghosts think (`src/ai.js`)

The ghosts and the player are opponents. The ghosts are **MAX** (want a high score) and assume you are **MIN** (you'll always pick the move that's worst for them).

1. The ghosts list their legal **team moves**: one step for every ghost at once, every combination (two ghosts can't end on the same tile). With one ghost that's just its own moves.
2. For each one they imagine your best reply, then their next move, then your reply… until they have looked `lookahead` of their own moves ahead (`lookahead × 2` half-moves).
3. At the end of each imagined future they judge the position. The most important question is: **does the player have a safe run?** That's a path to the goal where you'd reach every tile before any enemy could. If you do, you'll escape whatever they do, so they treat that position as nearly lost (`cutoff`, −400). That's what makes them get between you and the exit instead of chasing your back. On top of that:
   `score = −10 × (turns the nearest enemy needs to reach you) + 4 × (how far you still have to walk) − 1 × (tiles you can reach safely)`
   "How far you still have to walk" goes through every evidence drive still on the floor, then to the exit. A catch is +1000 and an escape is −1000. All of these are `WEIGHTS` in `src/ai.js`; a level can override them.
4. Alpha-beta pruning skips futures that one side would never allow. It gives the same answer, just faster. The search also remembers positions it already scored this turn (a *transposition table*): two wardens reach the same position in many different orders, so this cuts the work about 3×, again without changing the answer.
5. They pick the highest-scoring team move. Ties always go the same way, so the wardens are predictable and the levels can be checked.

Because the team move is searched as one, two wardens coordinate on their own: in a corridor they squeeze you from both ends instead of following each other. Each extra warden multiplies the work by about 5, so `MAX_GHOSTS` is 3.

**Level 1 is the exception.** Its `weights` switch the safe-run judgment off (`cutoff: 0`, `territory: 0`, `playerFromExit: 0`), so its warden is a pure chaser: it only reacts to where you are now. That's the starting point the later levels improve on, so players feel the jump when Level 2's warden starts predicting.

Walking distance is measured with breadth-first search through the corridors, not in a straight line. Enemies can't step onto exit tiles (so they can't park on the exit) or onto vent grates.

### Vents (Level 2+)

Vent grates come in numbered pairs (`1`-`4` in a maze). Step onto a grate and you crawl through and come out of the grate with the same number, in one move. Enemies can't use vents or stand on a grate, so a grate is also a one-turn safe spot (you still have to move on next turn). The wardens know where every vent comes out, so they include crawls in their search and guard the far end when they predict you'll use it. In the 3D view each pair has its own colour, a big number on the grate and a dashed arc joining the two ends, and the HUD tells you when you're standing next to one.

**You can't wait.** Every turn you must move (`PLAYER_CAN_WAIT` in `src/rules.js`); the wardens can still hold still. That keeps the pressure on and makes the plan dots matter.

### Drones: rules instead of search (Level 4+)

A drone (`D` in a maze) doesn't search at all. Each enemy turn it moves along its `dronePattern` (Levels 4 and 6 use `[2, 0]`: dash 2 tiles, then recharge for a turn) straight toward where you are *now*, ending as close to you as it can. If you're in a vent it hovers at the opening nearest you. The wardens know that rule, so inside their search they move the drones exactly as the drones really will, and plan around them. The contrast is the lesson: the drone is faster than anything, but a player who learns its rule can lead it anywhere.

### Glitch: a lifeline after 10 catches (every level)

Get caught 10 times on the same level and you unlock **Glitch** for the rest of your tries on that level, until you beat it: escaping resets that level's count, so coming back to it later starts with the glitch locked again. Press **G** (or the ⚡ button in the middle of the arrow pad) to arm it; your next move gets no reply, because every enemy (wardens *and* drones) glitches and loses its turn. It's one use per attempt and comes back each time you're caught or restart. Pressing it again before you move puts it away unused. Restarting with **R** doesn't count as a catch, and the count is per level (`game.catches[levelIndex]`), so struggling on Level 4 doesn't unlock it on Level 5. The 10th "Caught!" card announces it. `GLITCH_AFTER` in `src/game.js` sets the number (a level can override it with `glitchAfter`), and `?glitch=1` unlocks it straight away for demos. It's there so nobody spends the whole class stuck on one level; the simulated class in `npm run classroom` doesn't use it.

### Learning wardens (Level 6, `src/learning.js`)

On a level with `learns: true`, every attempt where you're caught is recorded: on each tile, which way you went. `habitsFrom(attempts)` turns that into one habit per tile (most common direction, ties to the latest try). Next attempt, whenever several of their moves are equally good, they pick the one that sets up an ambush on that route (a tile on it they can reach before you). They never play a worse move because of your habits, so learning can only help them. The HUD marks predictions that match your old route `habit` (the route itself isn't drawn on the floor, to keep the maze uncluttered). Repeat yourself and they're waiting. It's also the ethics question in miniature: they got better at predicting you by collecting data about you.

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
game.toggleGlitch();  // after 10 catches on this level: arm (or put away) the glitch; the next ghostMove() returns event "glitched"
game.glitchUnlocked;  // true once this level has caught you game.glitchAfter (10) times; game.glitchReady: usable right now
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

Use `gridToWorld({ r, c })` to place a model on a tile and `worldToGrid({ x, z })` to turn a click on the floor back into a tile. `game_server/three-view.js` is a complete Three.js version with keyboard and on-screen buttons.

Every level has its own art and a matching HUD, picked by `theme.style`, each in a `game_server/<style>.js` (the 3D set) plus `<style>.css` (the HUD skin):

| Level | `style` | The place in the story | The look | The HUD |
| --- | --- | --- | --- | --- |
| 1 | `basement` | The secret sub-level where it starts | Brick, damp concrete, one swinging bulb | A memo taped up under the bulb |
| 2 | `server-halls` | The company's server floor | Racks with blinking LEDs, security cameras | Security camera feed, "REC" light |
| 3 | `core` | The Core's proving ground, Test Floor 3, where the Wardens are built and field-tested | Grey lab partitions with hazard-striped skirts and LED strips; on top, workbenches with half-built Warden heads, prototypes charging in their cradles, training racks, shipping crates, prediction consoles and lidar masts; a graphite floor with yellow test-lane lines, a calibration grid with tile coordinates and charging bays where the Wardens start; turning amber beacons and a scanner beam sweeping the floor; a hangar of Warden prototypes behind | The test controller's console: graphite panels with a hazard stripe, a blinking "TRIAL 03 · LIVE" light, a monospace prediction log, industrial keys, results filed as trial logs |
| 4 | `vault` | The Data Vault: cold storage for everything Clearpath collects | Frosted steel data monoliths with teal seams where data streams up, glowing hex cooling ports, floating holographic data cubes, a hex-etched black floor, a giant vault door at the exit | Chamfered sci-fi terminal, "VAULT-07 // COLD STORAGE", access alerts |
| 5 | `archive` | The records room with a file on everyone | Wooden shelves of binders and name-labelled file boxes, green banker's lamps, drifting dust, loose papers on parquet | A manila case folder with a CONFIDENTIAL stamp, an index card, typewriter keys, stamped results |
| 6 | `uplink` | The roof, where the evidence is broadcast | Rooftop HVAC units and cabinets, antenna masts with blinking red lights, a satellite dish, a light beam at the exit (red while locked, cyan once you hold the evidence), city skyline and stars | A live broadcast feed: "● LIVE", signal bars, a news-ticker message line |

A look can also paint a full-screen `background` (the vault hall, the archive stacks, the night skyline), set the `fogColor`, and react to the exit unlocking (`setExitOpen`). Shared helpers for all of this are in `game_server/art-kit.js`. Drones, evidence drives, vents (floor grates), the locked exit (red until you hold every drive) and the animated characters (`game_server/sprites.js`) are drawn by `three-view.js` on top of any look; `theme.droneColor` colours the drone. `game_server/quality.js` keeps the frame rate smooth by lowering the render resolution on slower devices, and `game_server/ghost-worker.js` does the ghosts' thinking off the main thread.

Handy URL options for the 3D example: `?level=3` starts on Level 3, `?fps` shows the frame rate and resolution, `?res=1` pins the resolution (for comparing performance), `?intro=0` skips the story cutscenes, `?title=0` skips the home screen, `?glitch=1` unlocks the glitch on every level, `?scene=core` previews the Level 3 cutscene.

### The characters (`game_server/sprites.js`)

Sam, the Wardens and the drones are animated pixel-art sprites in the cutscenes' style, painted in code onto a sprite sheet (no image files) and drawn as cards that face the camera:

- **Sam**: blue shirt, red tie, badge and messenger bag. Walks in four directions (a 4-frame cycle, left is right mirrored), breathes and blinks while waiting.
- **Wardens**: the robot from the cutscenes. Walk cycle in four directions; while waiting, the red eye sweeps across the visor and the chest light pulses. The eye uses the level's `theme.ghostColor`.
- **Drones**: an amber quadcopter (`theme.droneColor`) with spinning rotors and a red camera eye. While recharging its lights go dark, its rotors slow, a red pip blinks and it hovers lower.

Each character keeps its coloured glow on the floor (blue for Sam, red for Wardens, amber for drones) and a soft contact shadow. A card that faces the camera leans back over the tile behind it, so for depth it's treated as standing a little closer to the camera (`SPRITE_DEPTH.pull`, worked out per level from the wall height and camera angle): walls behind a character never cut into it, while walls in front still hide it. Where they do, a coloured silhouette shows through the wall. The plan dots are drawn on top of everything, so a character or a wall never hides the prediction. While a glitch fires, the enemies flicker between magenta and cyan.

The browser tab shows a Warden favicon (`game_server/favicon.svg`, with `favicon-32.png` and `apple-touch-icon.png` for browsers and phones that want a PNG): the robot's head from the cutscenes with its red eye lit.

## Home screen (`game_server/title-screen.js`)

The game, **Clearpath**, opens on a pixel-art home screen with its own chiptune theme ("Lookahead", A minor, 96 BPM). The menu has **Start story** (prologue, cutscene, then Level 1), **Choose level**, **How the Wardens think** (minimax, lookahead, and the data-consent question in kid-friendly language) and a sound toggle. Press **M** during the game to come back to it.

The monitor on the home screen is a live demo, not a recording: a simple bot plays Level 1 or 2 against the real Warden AI from `src/`, and the red dots are the future the Warden predicts. It skips Level 3 because two wardens take too long to think for a background animation on a Chromebook.

`showTitleScreen({ levels })` resolves with `{ mode: "story" }` or `{ mode: "level", index }`. Like the cutscene, it swallows every key while it's open and `three-view.js` pauses the 3D rendering.

## Prologue (`game_server/prologue.js`)

**Start story** begins with the prologue, which doubles as the tutorial. It opens on a Clearpath TV ad hosted by Pip, a friendly mascot robot, that teaches the game's ideas with examples an 8th grader can follow:

1. **Prediction = spotting patterns.** Maya walks her dog at 7:00 every day, so Pip is 92% sure about Saturday.
2. **Minimax.** In a two-move points game, the greedy 9 is really worth 1 because the opponent picks next, so Pip takes the sure 4.
3. **Lookahead and pruning.** Futures multiply (5, 25, 125, 625), so Pip skips branches that can't beat its best plan. "Basic Pip looks 1 move ahead. Premium Pip looks 3."
4. **The chase.** Red dots are Pip's plan and gold dots are the moves it predicts you'll make: the same colours as the in-game HUD.
5. **Products and fine print**, which plants the data-consent question.

The camera then pulls back out of the TV into a dark living room. Someone on the couch, seen from behind, thinks about what they just watched, and the player answers for them: four comprehension questions (one per idea above) and two ethics questions with no wrong answer. Every choice gets a short reply that explains the idea, so a wrong pick still teaches something. The smart speaker says goodnight, a text from Clearpath HR reveals it's Sam the night before his first day, and a "Six months later" card hands off to the cutscene below.

Answers use the mouse or keys 1-3; Enter continues, Space pauses the ad, Esc skips. The questions and the ad's lines are plain text in `STEPS`, so they're easy to edit.

## Opening cutscene (`game_server/cutscene.js`)

Before Level 1, a 1:44 pixel-art cutscene ("After Hours") tells the story: a Clearpath employee takes the elevator down to a secret sub-level, finds Dr. Voss feeding private data into the Wardens, and has to run. It ends with a Warden's view of its minimax search and predicted escape routes, which sets up the levels.

- Drawn in code on a 320 × 180 canvas and scaled up without smoothing (no image files); sound is synthesized with the Web Audio API.
- `playCutscene()` returns a promise that resolves when it ends or is skipped. While it's on screen it swallows every key, and `three-view.js` pauses the 3D rendering.
- Players can pause (Space), skip (Esc or the Skip button) and mute it. It waits for a click or key press first because browsers only allow sound after one.
- Each shot in `SHOTS` has its length, dialogue lines, sound cues and a `draw(t)` function. Character and place names are placeholders.

## Level 3 cutscene: "Watching" (`CORE_SHOTS` in `game_server/cutscene.js`)

After escaping Level 2, the "Escaped!" card says someone was watching and a 46-second scene plays before Level 3 (skipped by `?intro=0`; the level's `cutscene: "core"` field in `src/levels.js` triggers it):

1. **Camera 14.** Grainy security-camera footage of the Core's Warden test floor. A vent grate pops off, Sam crawls out and sneaks past a row of dormant Wardens in their charging alcoves, glances up at the camera, and gets tagged: `EMP 0417 S.REYES · FACE MATCH 99.1%`.
2. **Pull back.** The feed shrinks onto a monitor in Dr. Voss's control room. "There you are, Sam. Right on schedule."
3. **Feeding the Wardens.** Voss types Sam's personal data into the Warden model, one fact at a time: employee ID, age, height and weight, two years of badge swipes, usual route, preferences, and what he does when he's scared. After each fact the **prediction confidence** bar climbs (23% → 94%) and the **predicted next move** diagram narrows from four even guesses to one (LEFT). The last rows show the sources (HR file, badge logs, health plan) and **consent: none**.
4. **Upgrade.** A Warden's-eye view: model updated, confidence 23% → 94%, data points 3 → 4,861, two Wardens deployed to the Core as a team.
5. **Level card.** "Level 3 · The Core. They know more about you now."

The lesson for students: more data about a person makes predictions stronger and more confident, and that data can be collected without asking. It sets up Level 3, where two wardens plan together. `playCutscene({ scene: "core" })` plays it; the `SCENES` table at the bottom of the shot lists is where to register another one.

## Level guarantees and difficulty (`tests/levels.test.js`, `src/playtest.js`, `demo/classroom.js`)

Because the enemies are predictable, `solveLevel()` can search every situation and prove a level is beatable. That says nothing about how hard a level *feels*, so the levels are also measured with simulated players and two "feel" checks. Runs are seeded, so the numbers never change unless the level does.

Simulated players (`SKILLS` in `src/playtest.js`):

- **beginner / average / strong** head for the goal, keep away from the enemies and slip now and then (15% / 8% / 1% of moves). They only *guess* what the enemies will do: a kid who ignores the red dots.
- **thinker** *reads* the wardens' prediction (it knows how they'll answer each move, which is what the plan dots show), plans 3 moves ahead and slips 3% of the time. This is the kid the game is trying to grow, and the main difficulty ladder.
- **expert** reads the plan perfectly, plans 4 moves ahead, never slips: an adult tester.

The two feel checks, which matched the team's playtesting (the levels that felt too easy scored badly on both):

- **Threat**: how often an enemy is within 2 moves of you while you play. The levels that felt right sit around 40-45%; the old Levels 1, 4 and 5 had 0%, 22% and 8%.
- **Safest margin** (`safestMargin()` in `src/solver.js`): on the *safest* winning route, how close does an enemy still have to get? 1-2 means every escape is a close dodge. The old Level 1 had 8: a route that walked around the warden.

| Level | Kids who read the plan (first try) | Threat | Safest margin | Shortest escape | Class time (see below) |
| --- | --- | --- | --- | --- | --- |
| 1 · The Basement | 60% | 67% | 2 | 19 moves | 36 s |
| 2 · The Server Halls | 41% | 45% | 2 | 37 moves | 291 s |
| 3 · The Core | 41% | 45% | 4 | 17 moves | 46 s |
| 4 · The Data Vault | 21% | 63% | 2 | 21 moves | 125 s |
| 5 · The Archive | 13% | 46% | 1 | 43 moves | 169 s |
| 6 · The Uplink | 4% | 39% | 2 | 41 moves | 140 s |

Players who don't read the plan almost never escape from Level 2 on. Level 1's warden only reacts, so quick reflexes can beat it (strong players 91%): that's the point of Level 1, and the contrast with Level 2. The expert escapes Level 1 every time, about a quarter of the time on Level 3, almost never on Levels 4 and 6, and usually on Level 5 (a careful adult who reads every plan finds Level 5's dodges; kids rarely do).

**The 10-minute class** (`npm run classroom`): 40 simulated thinkers play the levels in order on a 10-minute clock, retrying each level and remembering what got them caught (1.3 s per move, 4 s per "Caught!" screen, 15 s per briefing; the story is extra). Median tries per level: 1, 2, 2, 3, 7, 6. By the end, 18 of 40 have reached Level 5, 6 have reached Level 6, and none have beaten it. Level 2 is where a class spends the most time: you can circle its warden safely for a long while before you find the vent trick. The story (prologue about 3¾ minutes, opening cutscene 1:44, Level 3 cutscene 46 s) comes on top of the 10 minutes; `?intro=0` skips it.

How the mazes were made: each new layout was generated or adapted (random mazes with loops, then enemies, drives and vents placed by distance), then tuned move by move (moving a wall, an enemy or a drive) against target numbers for every measure above, and finally checked by replaying the winning route. Small changes matter a lot: moving Level 5's drone a few tiles swings kids from 3% to 13%. Always run `npm run check-levels` after editing a maze (`npm run check-levels -- 5` checks just one).

The tests check that:

- every level can be beaten against its own enemies, and running straight for the exit gets you caught;
- no level has a free path: on every level the safest escape still passes close to an enemy;
- each level adds its new idea (a reacting ghost, lookahead and vents, a team, a drone, evidence, learning) and comes with a briefing and hints;
- on Level 2, a route that fools a 1-move warden doesn't get past the real 3-move warden;
- each level is harder than the last for a thinker, in steps of no more than 22 points; every level can still be won by one; from Level 2 on, players who ignore the prediction almost never escape;
- on Level 6, replaying a route that got you caught never gets further against the learning wardens than against forgetful ones, and some get caught sooner.

`npm test` takes about three minutes, mostly proving Levels 5 and 6 beatable. These are simulated players; playtesting with real kids is the real test.

## Gameplay logging (`game_server/gameLogger.js`, `game_server/log.js`)

Each attempt (level 1-6, attempt number, moves, prologue answers, win or death and where) is saved to Firestore by `gameLogger.js`; `clearpath/firestore.rules` checks every record. The game talks to it only through `log.js`, which loads it in the background: if Firebase can't load (offline, a school network that blocks Google's CDN, or the config not filled in yet), the game still starts and logging is simply off. The game engine in `src/` doesn't log anything, so the tests and the level checker run in Node. `firebaseConfig` in `gameLogger.js` still needs the real project values.

## Changing things

- **Difficulty:** change `lookahead` in `src/levels.js`, or add another `G` to a maze. Each extra step or warden multiplies the work by roughly 5; check the thinking time stays short on a Chromebook. Drones (`D`) cost almost nothing to think about, so they're the cheap way to add pressure: `dronePattern: [2, 1]` makes them faster on average than `[2, 0]`, and `[2]` (dash every turn) is brutal.
- **Teaching text:** each level's `concept`, `briefing` and `hints` in `src/levels.js` are plain strings. Hints are shown in order, one per catch.
- **Mazes:** edit the text maps in `src/levels.js`, then run `npm run check-levels`. Small changes matter a lot with two wardens: moving one start tile can swing the strong-player escape rate from 88% to 0%.
- **Ghost personality:** change `WEIGHTS` in `src/ai.js`, or give one level its own `weights`. `territory` is powerful and sensitive: `territory: 1` on Level 2 takes average players from 45% to about 23%.
- **Less predictable ghosts:** `new MazeGame({ rng: Math.random })` breaks ties randomly. The level checker's guarantees then become "usually" instead of "always".

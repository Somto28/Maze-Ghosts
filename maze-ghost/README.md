# Clearpath

*(Prototype name: Maze Ghost. The folder and package names still use it.)*

A turn-based maze escape. You move, then the enemies move. The Wardens use **adversarial search** (minimax with alpha-beta pruning) to predict your moves, and **each level adds one new idea** about how an AI predicts people. You can't stand still: every turn you commit to a direction, so reading the Wardens' plan is how you win.

| Level | Maze | Enemies | New idea | What it feels like |
| --- | --- | --- | --- | --- |
| 1 · The Basement | 9 × 11 | 1 warden that only reacts | Reacting isn't predicting | It chases you everywhere but can't get ahead of you. Lure it, then race it to the exit, and avoid dead ends |
| 2 · The Server Halls | 11 × 11 | 1 warden, 3 moves ahead + 1 vent | Predicting where you'll be | It heads for where you WILL be, including the far end of the vent |
| 3 · The Core | 13 × 13 | 2 wardens + 2 vents | Teamwork | One guards the way out while the other hunts you |
| 4 · The Archive | 15 × 15 | 2 wardens + 1 drone + 2 vents + 2 evidence drives | When the AI knows your goal | They wait where you have to go. And meet the drone, guarding the door: it dashes 2 tiles at you, then recharges, fast but 100% predictable |
| 5 · The Uplink | 15 × 17 | 2 wardens + drone + 3 vents + evidence | Learning from your data | Every time they catch you, they study your route and set up ambushes on it |

Plain JavaScript (ES modules), no dependencies. The 3D example loads Three.js from a CDN.

```bash
npm test               # 59 tests, including level guarantees and the difficulty curve
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

Vent grates come in numbered pairs (`1`-`4` in a maze). Step onto a grate and you crawl through and come out of the grate with the same number, in one move. Enemies can't use vents or stand on a grate, so a grate is also a one-turn safe spot (you still have to move on next turn). The wardens know where every vent comes out, so they include crawls in their search and guard the far end when they predict you'll use it. In the 3D view each pair has its own colour and a big number on the grate, and nothing can hide a vent: a numbered badge floats above every grate, a dashed outline of the grate shows through any wall in front of it, and a glowing arc with dashes flowing along it joins the two ends over the top of the walls. The HUD also tells you when you're standing next to one, and the "If you go…" compass marks moves that go through a vent.

**You can't wait.** Every turn you must move (`PLAYER_CAN_WAIT` in `src/rules.js`); the wardens can still hold still. That keeps the pressure on and makes the plan dots matter.

### Drones: rules instead of search (Levels 4 and 5)

A drone (`D` in a maze) doesn't search at all. Each enemy turn it moves along its `dronePattern` (Levels 4 and 5 use `[2, 0]`: dash 2 tiles, then recharge for a turn) straight toward where you are *now*, ending as close to you as it can. If you're in a vent it hovers at the opening nearest you. The wardens know that rule, so inside their search they move the drones exactly as the drones really will, and plan around them. The contrast is the lesson: the drone is faster than anything, but a player who learns its rule can lead it anywhere.

### Abilities: Glitch and Dash (every level)

Two abilities help students who are stuck, and reward the ones who aren't. The HUD shows both all the time, under the legend, with a progress bar and one line on what each does and how to get it.

**Glitch: unlocked by 5 catches on a level.** The progress bar fills one segment per catch (`0/5 catches on this level...`), and every "Caught!" card says how many more it takes. On the 5th catch the card announces it and explains it. From then on, for the rest of your tries on that level, press **G** (or the ⚡ button in the middle of the arrow pad) to arm it: your next move gets no reply, because every enemy (wardens *and* drones) glitches and skips its turn. One use per try; it comes back each time you're caught or restart. Pressing it again before you move puts it away unused. Restarting with **R** doesn't count as a catch; the count is per level (`game.catches[levelIndex]`) and resets when you beat the level, so a replay starts locked again. `GLITCH_AFTER` in `src/game.js` sets the number (a level can override it with `glitchAfter`); `?glitch=1` unlocks it on every level for demos.

**Dash: earned by beating any level in fewer than 5 tries.** Every start or restart of a level is a try; the bar shows `Try 2 of 4`. Escape within 4 tries and the "Escaped!" card says you've earned a Dash and explains it. Press **F** (or the » button in the pad's top-left corner) to arm it, then a direction: you run **2 tiles** in a straight line in one move, before the enemies reply. It's **one use**, and you can carry it to any level, but you only ever hold one; after using it, earn it again by beating another level in 4 tries or fewer. If only one tile is clear (a wall right after the first), you just take one step and keep the dash. `DASH_WITHIN` in `src/game.js` sets the number of tries.

### Learning wardens (Level 5, `src/learning.js`)

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
game.toggleGlitch();  // after 5 catches on this level: arm (or put away) the glitch; the next ghostMove() returns event "glitched"
game.toggleDash();    // if you hold a dash (game.hasDash): your next playerMove runs 2 tiles (result.dashed, result.path)
game.tries[i];        // tries on level i since you last beat it; game.wonInTries / game.dashEarned after a win
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
| 4 | `executive` | The Archive on Floor 88: the executive suite, where the chiefs keep the company's most confidential files | Walnut and smoked-glass partitions with brass trim and warm cove lights; biometric records cabinets marked EYES ONLY with classified folders; the CEO's desk with a holographic subject file; boardroom tables; Project Warden data safes; leather lounges and planters; holograms of people's files turning over holo-tables; a midnight art-deco carpet with black-marble and gold borders; floor-to-ceiling windows onto the city at night with rain on the glass | Smoked-glass panels with gold hairlines, an EYES ONLY tab, a serif display face, a board-briefing prediction log, results as executive memos |
| 5 | `uplink` | The roof, where the evidence is broadcast | Rooftop HVAC units and cabinets, antenna masts with blinking red lights, a satellite dish, a light beam at the exit (red while locked, cyan once you hold the evidence), city skyline and stars | A live broadcast feed: "● LIVE", signal bars, a news-ticker message line |

A look can also paint a full-screen `background` (the executive suite's windows, the night skyline), set the `fogColor`, and react to the exit unlocking (`setExitOpen`). Shared helpers for all of this are in `game_server/art-kit.js`. Drones, evidence drives, vents (floor grates), the locked exit (red until you hold every drive) and the animated characters (`game_server/sprites.js`) are drawn by `three-view.js` on top of any look; `theme.droneColor` colours the drone. `game_server/quality.js` keeps the frame rate smooth by lowering the render resolution on slower devices, and `game_server/ghost-worker.js` does the ghosts' thinking off the main thread.

Keys while playing: arrows or WASD move, **R** restarts, **M** opens the menu, **G** arms the glitch (once unlocked), **F** arms the dash (once earned), **N** mutes and unmutes. The speaker button in the top-right corner opens the volume sliders.

Handy URL options for the 3D example: `?level=3` starts on Level 3, `?fps` shows the frame rate and resolution, `?res=1` pins the resolution (for comparing performance), `?intro=0` skips the story cutscenes, `?title=0` skips the home screen, `?glitch=1` unlocks the glitch on every level, `?scene=core` previews the Level 3 cutscene, `?scene=decision` the one before Level 5 and `?scene=finale` the ending (`&at=23` starts 23 s in), `?scene=card&level=4` previews a level's title card.

### The characters (`game_server/sprites.js`)

Sam, the Wardens and the drones are animated pixel-art sprites in the cutscenes' style, painted in code onto a sprite sheet (no image files) and drawn as cards that face the camera:

- **Sam**: blue shirt, red tie, badge and messenger bag. Walks in four directions (a 4-frame cycle, left is right mirrored), breathes and blinks while waiting.
- **Wardens**: the robot from the cutscenes. Walk cycle in four directions; while waiting, the red eye sweeps across the visor and the chest light pulses. The eye uses the level's `theme.ghostColor`.
- **Drones**: an amber quadcopter (`theme.droneColor`) with spinning rotors and a red camera eye. While recharging its lights go dark, its rotors slow, a red pip blinks and it hovers lower.

Each character keeps its coloured glow on the floor (blue for Sam, red for Wardens, amber for drones) and a soft contact shadow. A card that faces the camera leans back over the tile behind it, so for depth it's treated as standing a little closer to the camera (`SPRITE_DEPTH.pull`, worked out per level from the wall height and camera angle): walls behind a character never cut into it, while walls in front still hide it. Where they do, a coloured silhouette shows through the wall. The plan dots are drawn on top of everything, so a character or a wall never hides the prediction. While a glitch fires, the enemies flicker between magenta and cyan.

The browser tab shows a Warden favicon (`game_server/favicon.svg`, with `favicon-32.png` and `apple-touch-icon.png` for browsers and phones that want a PNG): the robot's head from the cutscenes with its red eye lit.

## Music and sound in the levels (`game_server/music.js`)

Every level has its own track, synthesized live with the Web Audio API (no audio files). The five tracks are one family: they share a five-note **Warden motif** (fifth, fourth, minor third, root, second; in A minor that's E-D-C-A-B) that opens every lead melody, the same synth palette (supersaws, pulse-width pads, FM bells and electric piano, plucks, reese and acid-style basses, synthesized drums), a slow tape wobble on every note and a dub echo. Each one then fits its place in the story:

| Level | Track | Key, tempo | Sound | Story |
| --- | --- | --- | --- | --- |
| 1 · The Basement | "Lights Out" | A minor, 80 BPM | Ambient dub: dark pulse-width pads, dub chord stabs echoing into the dark, sub and reese bass, a half-time rimshot, water drips, the hum of a failing tube light, a lonely whistle lead | You've just found the lab, alone |
| 2 · The Server Halls | "Racks" | E minor, 98 BPM | Chillsynth: pumping supersaw pads, a square-wave "data" arpeggio with flipped bits, blinking-LED blips, four-on-the-floor, server-fan noise, a bright saw lead | The Wardens start predicting you |
| 3 · The Core | "Proving Ground" | D minor, 108 BPM | Progressive electronic: a driving octave bass whose filter keeps opening, gated supersaw stabs, metallic percussion, a robotic formant lead, scanner sweeps, machine rumble | Dr. Voss has just fed them your data |
| 4 · The Archive | "Floor 88" | D minor, 90 BPM, swung | Nu jazz on synths: FM electric piano, a soft supersaw pad, a plucked synth bass walking between ninth chords, dub skanks, vinyl crackle, the woozy detuned lead of a casino lounge | Sneaking through the bosses' floor |
| 5 · The Uplink | "Broadcast" | G minor, 116 BPM | Synthwave finale: huge sidechained supersaws, a filtered arpeggio, punchy drums with tom fills, a soaring saw lead playing the motif as an anthem, radio static and morse beeps | The evidence goes out to the world |

Each track is 32 bars: an intro, a groove, the lead melody, a breakdown with a noise riser, then everything together. At the end it starts again from the top, for as long as you're on that level. Tracks never bleed into each other: each one plays through its own private reverb and echo, and when the level changes the old track and all its echoes stop at once before the new one starts from its intro. The music also reacts to danger: when an enemy gets within a few tiles, a low heartbeat and a filtered arpeggio come in and the hats double up.

- **Caught:** the caught sting plays (a heavy hit, the Warden's lock-on chatter, a falling two-tone "uh-oh" alarm and a dark detuned chord) while the music dips for a moment. The music keeps going: a failed attempt or a restart never restarts the track.
- **Escaped:** a short rising chime.
- The music fades out while a cutscene, the prologue or the home screen is up (they have their own sound), and starts on your first click or key press (browsers block sound before that).
- **N** mutes and unmutes in a level.

## Sound settings and levels (`game_server/sound-settings.js`)

A speaker button sits in the top-right corner on every screen (the home screen, the prologue, the cutscenes and the levels; bottom-left on phones). It opens three sliders, **Volume** (everything), **Music** and **Effects**, and a **Mute all** switch. The settings are remembered on that device and apply everywhere at once: the level music and effects (`music.js`), the home screen, the prologue and the cutscenes all multiply their own levels by them. The home screen's "Sound: on/off" item, the cutscenes' Sound button and **N** in a level are the same mute switch. Keys pressed on the panel (arrows on a slider, Enter, Escape) stay on the panel, so adjusting the volume never moves Sam or skips a scene.

The game's sound is evened out so nothing jumps out: every part was measured at the default settings (the average loudness of what reaches the speakers) and trimmed (the `TRIM` values in `title-screen.js`, `prologue.js` and `cutscene.js`, and each track's `gain` in `music.js`). The five level tracks sit within about 1.5 dB of each other, the home screen and prologue sit a couple of dB under the levels, and the cutscene score sits about level with the level music in its build-ups and a few dB over it at its peaks. Level music and effects also go through a gentle compressor.

## Inside the Wardens' heads (the HUD panel, `src/insight.js`)

The panel under the HUD turns the adversarial search into something players can read and use:

- **What they did:** "They imagined 1,356 possible futures, up to 3 moves ahead, and skipped 223 that couldn't beat a plan they'd already found" (that's pruning, in plain words), and "They expect you to go → right next" (the gold dots).
- **"What they think happens if you go…":** a compass of your four moves. For each one, `foresee()` runs the enemies' own search from the position after that move and plays out the future they expect: **Walks into them**, **Caught next turn**, **Caught in 3 turns**, **Safe** (green), **Safe, but riskier** (amber: of the safe moves, the one they like best), **Escape!**, or **wall**. The move they expect you to make is outlined in gold and tagged "expected"; vent crawls say which vent.
- A note under it: "Safe" only means they can't see a catch within their lookahead, so players still have to plan beyond it. That's the lesson of the game: read their prediction, then think one step further than they can.

It's worked out in the same Web Worker as their moves (`ghost-worker.js`, message type `"foresee"`), so the page never stalls.

## Level title cards (`playLevelCard` in `game_server/cutscene.js`)

Every level opens with a 5-second pixel-art title card, like the one at the end of the Level 3 cutscene: "LEVEL 4 OF 5", the level's name, two lines on where you are in the story, the new idea, and what's hunting you, over a small animated picture of the place (the swinging bulb in the basement, blinking server racks, Wardens on test stands, rain on the Floor 88 windows, the antenna on the roof). They play between levels (Levels 3 and 5 get their cutscenes instead, which end on their own cards) and when a level is picked from the menu; the opening story ends on Level 1's card. Any key or click moves on; `?intro=0` skips them. The level is built behind the card, so the maze is ready the moment it ends, and then the level's briefing comes up.

## Home screen (`game_server/title-screen.js`)

The game, **Clearpath**, opens on a pixel-art home screen with its own chiptune theme ("Lookahead", A minor, 96 BPM). The menu has **Start story** (prologue, cutscene, then Level 1), **Choose level**, **How the Wardens think** (minimax, lookahead, and the data-consent question in kid-friendly language) and a sound toggle. Press **M** during the game to come back to it.

**Choose level** fills its whole panel with the five levels side by side, one tall card each in the level's own colour: the number and name, a pixel map of the maze (you in teal, Wardens red, the drone amber, evidence blue, vents grey, the exit green), the new idea, and what's hunting you. On a phone they become a scrolling list.

The monitor on the home screen is a live demo, not a recording: a simple bot plays Level 1 or 2 against the real Warden AI from `src/`, and the red dots are the future the Warden predicts. It skips Level 3 because two wardens take too long to think for a background animation on a Chromebook.

`showTitleScreen({ levels })` resolves with `{ mode: "story" }` or `{ mode: "level", index }`. Like the cutscene, it swallows every key while it's open and `three-view.js` pauses the 3D rendering.

## Prologue (`game_server/prologue.js`)

**Start story** begins with the prologue, which doubles as the tutorial. It opens on a Clearpath TV ad hosted by Pip, a friendly mascot robot, that teaches the game's ideas with examples an 8th grader can follow:

1. **Prediction = spotting patterns.** Maya walks her dog at 7:00 on four evenings out of five (once at 5:00), so Pip is 80% sure, not 100%, about Saturday: 4 out of 5.
2. **Minimax.** In a two-move points game, the greedy 9 is really worth 1 because the opponent picks next, so Pip takes the sure 4.
3. **Lookahead and pruning.** Futures multiply (5, 25, 125, 625), so Pip skips branches that can't beat its best plan. "Basic Pip looks 1 move ahead. Premium Pip looks 3."
4. **The chase.** Red dots are Pip's plan and gold dots are the moves it predicts you'll make: the same colours as the in-game HUD.
5. **Products and fine print**, which plants the data-consent question.

The camera then pulls back out of the TV into a dark living room. Sam sits on the couch, seen from behind (his head and shoulders above the couch back, lit by the TV), thinking about what they just watched, and the player answers for them: four comprehension questions (one per idea above) and two ethics questions with no wrong answer. Every choice gets a short reply that explains the idea, so a wrong pick still teaches something. The right answer sits in a different position from question to question (2nd, 3rd, 1st, 2nd), so it can't be found by always picking the first one. The smart speaker says goodnight, a text from Clearpath HR reveals it's Sam the night before his first day, and a "Six months later" card hands off to the cutscene below.

Answers use the mouse or keys 1-3; Enter continues, Space pauses the ad, Esc skips. The questions and the ad's lines are plain text in `STEPS`, so they're easy to edit.

## Opening cutscene (`game_server/cutscene.js`)

Before Level 1, a 1:44 pixel-art cutscene ("After Hours") tells the story: a Clearpath employee takes the elevator down to a secret sub-level, finds Dr. Voss feeding private data into the Wardens, and has to run. It ends with a Warden's view of its minimax search and predicted escape routes, which sets up the levels.

- Drawn in code on a 320 × 180 canvas and scaled up without smoothing (no image files); sound is synthesized with the Web Audio API.
- `playCutscene()` returns a promise that resolves when it ends or is skipped. While it's on screen it swallows every key, and `three-view.js` pauses the 3D rendering.
- Players can pause (Space), skip (Esc or the Skip button) and mute it. It waits for a click or key press first because browsers only allow sound after one.
- Each shot in `SHOTS` has its length, dialogue lines, sound cues and a `draw(t)` function. Character and place names are placeholders.
- From the moment the lift drops past the lobby, the scene is scored like a film (see **The cutscene score** below): the "Precipice" theme builds in four stages as Sam finds the lab, is seen, and runs.

## Level 3 cutscene: "Watching" (`CORE_SHOTS` in `game_server/cutscene.js`)

After escaping Level 2, the "Escaped!" card says someone was watching and a 46-second scene plays before Level 3 (skipped by `?intro=0`; the level's `cutscene: "core"` field in `src/levels.js` triggers it):

1. **Camera 14.** Grainy security-camera footage of the Core's Warden test floor. A vent grate pops off, Sam crawls out and sneaks past a row of dormant Wardens in their charging alcoves, glances up at the camera, and gets tagged: `EMP 0417 S.REYES · FACE MATCH 99.1%`.
2. **Pull back.** The feed shrinks onto a monitor in Dr. Voss's control room. "There you are, Sam. Right on schedule."
3. **Feeding the Wardens.** Voss types Sam's personal data into the Warden model, one fact at a time: employee ID, age, height and weight, two years of badge swipes, usual route, preferences, and what he does when he's scared. After each fact the **prediction confidence** bar climbs (23% → 94%) and the **predicted next move** diagram narrows from four even guesses to one (LEFT). The last rows show the sources (HR file, badge logs, health plan) and **consent: none**.
4. **Upgrade.** A Warden's-eye view: model updated, confidence 23% → 94%, data points 3 → 4,861, two Wardens deployed to the Core as a team.
5. **Level card.** "Level 3 · The Core. They know more about you now."

The lesson for students: more data about a person makes predictions stronger and more confident, and that data can be collected without asking. It sets up Level 3, where two wardens plan together. `playCutscene({ scene: "core" })` plays it; the `SCENES` table at the bottom of the shot lists is where to register another one. It's scored with the "Creeping" theme (below).

## Level 5 cutscene: "The Choice" (`DECISION_SHOTS` in `game_server/cutscene.js`)

After escaping the Archive (Level 4), the "Escaped!" card says "You have the proof. Now Sam has to decide what to do with it..." and an interactive scene plays before Level 5 (the level's `cutscene: "decision"` field; skipped by `?intro=0`):

1. **Floor 88.** Night in the executive suite, rain on the glass. Sam holds up both evidence drives: "Every file they stole." The lockdown alarm goes off.
2. **Wall screen.** Every screen on the floor switches to Dr. Voss: "Down to the street, or up to the roof. Either way, I already know which you'll pick."
3. **The stairwell.** The landing on 88: STREET EXIT down to the left, ROOF / UPLINK up to the right. The frame holds and the player chooses: **1 · Save yourself** (run down to the street; you get out, but the proof stays hidden) or **2 · Upload the evidence** (climb to the roof uplink and expose Clearpath, with the Wardens waiting). Click, or press 1 or 2.

**If Sam runs**, it's exactly what the Wardens predicted: he races down the stairwell (the floor counter dropping from 88), the lobby doors lock as he reaches them, Wardens step out from behind the pillars and Dr. Voss is already there. Close-up: "You always take the stairs. And when you're scared, you run. I didn't have to chase you. I only had to wait where you'd go. 94 percent, Sam." A Warden's view shows *PREDICTION: SUBJECT FLEES DOWNSTAIRS 94% · RESULT: CORRECT · SUBJECT CONTAINED*, then a **CAUGHT** card ("You did exactly what the data said you would. A predictable choice is easy to beat.") offers **Rewind**: a tape-rewind back to the landing, where Sam realises "They knew I'd run. So what's the one thing they don't expect?" and the choice comes up again (run again, and Voss is 97% sure).

**If Sam climbs**, the Wardens' prediction flips to *RESULT: WRONG (subject went up)* and Voss is caught off guard over the PA ("The roof? That's... not what you were supposed to do."). Sam bursts onto the rain-soaked roof and sees the uplink tower; Wardens climb over the parapet and Voss warns that his Wardens learn: every catch makes them better. A Warden's view switches to *LEARNING MODE: every catch = new training data*, and the scene ends on Level 5's card: "They learn from every catch. Don't repeat yourself."

The lesson: a system trained on your past behaviour predicts what you'll *usually* do; the way to beat it is to do what it doesn't expect (exactly what minimax players do against a predictable opponent), and it sets up Level 5's learning Wardens. The choice is logged as a `story_decision` event (every pick in order, the first and final choice, and whether they rewound); `playCutscene` resolves with the picks in order, e.g. `["escape", "rewind", "upload"]`. Skipping the scene goes straight to Level 5. Preview it with `?scene=decision` (add `&at=23` to start at the stairwell).

A shot becomes a choice by adding `choice: { prompt, options: [{ key, label, sub, then }] }`: the frame holds on its last moment (the music keeps playing), and the chosen option's `then()` returns the shots that follow.

## The ending: "Broadcast" (`FINALE_SHOTS` in `game_server/cutscene.js`)

Beating Level 5 brings up "Evidence uploaded!" ("The files are on their way to every newsroom in the world. But Sam is still on the roof, and the Wardens are closing in..."), and **Continue** plays the final scene (about 2 minutes; skipped by `?intro=0`). Then a closing **The End** card leads back to the main menu.

1. **Upload.** The uplink terminal ticks off every file (HR records, medical data, private messages, the Warden training log, Dr. Voss's emails, consent forms: none found) and sends them to 2,114 newsrooms in 96 countries. "It's out. Everyone can see it now."
2. **The world sees.** A TV news report, a phone feed trending #CLEARPATHFILES and a city billboard showing *CONSENT ON FILE: NONE*. "The whole world is watching."
3. **Cornered.** Back on the roof, three Wardens push Sam to the edge and Dr. Voss steps out: "Then you are the only thing left on this roof that I still control. Wardens. Contain him."
4. **No way out.** Warden's view: safe moves left 0, capture in 1 move, confidence 99%.
5. **Pip.** The window-cleaning gondola rises over the edge, driven by Pip, Clearpath's cheerful mascot robot from the prologue's TV ad: "Hi, Sam! I saw the news. Need a lift? ... I clean the windows. And the Wardens have never studied me." The Wardens stall, question marks over their heads, and Sam jumps in.
6. **Unknown.** Warden's view: *UNKNOWN AGENT: PIP-07 · TRAINING DATA ON AGENT: NONE · ROUTE: OUTSIDE WALL, NOT IN MODEL · PREDICTION: ???* "It was never in our data."
7. **Down the wall.** The gondola drops down the outside of the tower: Voss and two Wardens shout down from the roof edge as it slides up out of frame, the windows stream upward, the floor counter runs from 88 to 1 and the street rises to meet them. Pip: "Wardens only predict what they've seen before. Nobody ever showed them me!"
8. **Street.** Police cars, a news van and a crowd with phones up. Sam hands the drives to an officer ("We saw it on the news, Sam. So did every officer in the city.") as police run into the building.
9. **Montage**, as TV news with a BREAKING banner and ticker: the Clearpath tower goes dark behind police tape (*Clearpath shut down*), every Warden powers down one by one (*Wardens shut off*), Dr. Voss is led out in handcuffs past the cameras (*Dr. Voss arrested*), and a court-ordered deletion counts the stolen files down to zero (*Stolen data deleted*; every person is told what was taken).
10. **Talk show.** Months later, on "Tonight Live", the host welcomes "the man who outsmarted the Wardens", with Pip beside him ("Hi! I clean windows!"). "So how do you beat a machine that knows what you'll do next?" "You do the one thing it never saw coming. And it helps to have a friend it never saw coming."
11. **Close-up**, with a lower third (*Sam Reyes, whistleblower, the Clearpath Files*): "The Wardens weren't magic. They were trained on my life... And nobody ever asked me if that was OK. If an AI is going to learn from you, you deserve to be asked first. Your data is yours. Make them ask." Applause, and a slow fade to black.

How Sam gets away is the last lesson of the game: a prediction only covers what the model knows about. The Wardens had studied everything about Sam, but they had no data on Pip and the outside wall wasn't a route in their model, so they couldn't see the escape coming, just like a minimax search can't plan for a move that isn't in its game tree.

## The cutscene score

The story scenes are scored with orchestral-style themes synthesized live (no audio files): staccato and sustained string sections (detuned saws), a formant-filtered choir, timpani, deep booms, distorted power-chord hits, a breathing low drone, FM music-box bells, dissonant high clusters, creaks and a heartbeat, all in a hall reverb with a dark echo. The two main themes were written after studying the two reference tracks the team chose for the mood: their tempo (both 152 BPM), key, harmony, density, loudness curve and frequency balance were measured, and the new themes match those (the melodies and parts are original).

- **"Precipice"** (Sam discovers Dr. Voss's lab, before Level 1): E minor at 152 BPM, rocking between Em and Am in two-bar blocks, with C, D and B for lift. It builds the way the reference does, from quiet pulsing low string chords as the lift drops past the lobby, to the eighth-note string ostinato and choir at the screen, to a boom and a soaring high string line over full choir when Voss turns, to everything at once for the override and the run (sixteenth-note strings, timpani on every eighth and power-chord hits). The theme keeps its place across cuts, so it flows from shot to shot; it stops dead for the can "clank".
- **"Creeping"** (Dr. Voss feeds the Wardens, before Level 3): G minor at 152 BPM, the bass swinging G to E-flat. A low ostinato creeps up a semitone and back without stopping, a music-box line leans on a tritone into the echo, high strings tremble and slide into clusters, creaks and scrapes sit in the reverb, a heartbeat quickens, and a G major chord turns up where G minor should be. Like the reference it stays loud and never lets up; the stages only add layers (choir, then booms and timpani for the upgrade).
- **"The Choice"**: a clock ticking on every beat over a suspended chord and a heartbeat while Sam decides; the Precipice music for the run downstairs, Creeping for the trap; and for the climb, **"Rise"**, the Wardens' E-D-C-A-B motif from the level music turned into an anthem over Em, C, G, D.
- **"Broadcast"** (the ending): Rise carries the upload, Creeping comes back when the Wardens corner Sam and Rise when Pip arrives, and then **"Triumph"**, the same motif in G major (D-C-B-G-A) as a full orchestral anthem over G, D, Em, C, plays under the escape to the street and the news montage. The talk show has its own band sting, a studio audience (modelled on the team's reference recording: a dense wash of hundreds of claps, mostly between 400 Hz and 4 kHz, with falsetto "woo"s and the odd whistle on top) and a warm, laid-back electric-piano groove (**"Talk"**: Fmaj7, Em7, Dm7, G13 with brushed hi-hats), which stops on Sam's last line so the fade to black is quiet.

The score is louder and more intense than before: at its peaks (Voss's turn, the override, the trap) it plays a few dB over the level music, and the quieter build-up sits about level with it (the effects and music sliders still apply). A soft clipper on the cutscene output keeps the biggest hits from distorting.

## Level guarantees and difficulty (`tests/levels.test.js`, `src/playtest.js`, `demo/classroom.js`)

Because the enemies are predictable, `solveLevel()` can search every situation and prove a level is beatable. That says nothing about how hard a level *feels*, so the levels are also measured with simulated players and two "feel" checks. Runs are seeded, so the numbers never change unless the level does.

Simulated players (`SKILLS` in `src/playtest.js`):

- **beginner / average / strong** head for the goal, keep away from the enemies and slip now and then (15% / 8% / 1% of moves). They only *guess* what the enemies will do: a kid who ignores the red dots.
- **thinker** *reads* the wardens' prediction (it knows how they'll answer each move, which is what the plan dots show), plans 3 moves ahead and slips 3% of the time. This is the kid the game is trying to grow, and the main difficulty ladder.
- **expert** reads the plan perfectly, plans 4 moves ahead, never slips: an adult tester.

The two feel checks, which matched the team's playtesting (the levels that felt too easy scored badly on both):

- **Threat**: how often an enemy is within 2 moves of you while you play. The levels that felt right sit around 40-45%; the first versions of the Basement, the Data Vault (since cut) and the Archive had 0%, 22% and 8%.
- **Safest margin** (`safestMargin()` in `src/solver.js`): on the *safest* winning route, how close does an enemy still have to get? 1-2 means every escape is a close dodge. The old Level 1 had 8: a route that walked around the warden.

| Level | Kids who read the plan (first try) | Threat | Safest margin | Shortest escape | Class time (see below) |
| --- | --- | --- | --- | --- | --- |
| 1 · The Basement | 60% | 67% | 2 | 19 moves | 36 s |
| 2 · The Server Halls | 41% | 45% | 2 | 37 moves | 291 s |
| 3 · The Core | 41% | 45% | 4 | 17 moves | 46 s |
| 4 · The Archive | 23% | 45% | 1 | 53 moves | 145 s |
| 5 · The Uplink | 4% | 39% | 2 | 41 moves | 182 s |

Players who don't read the plan almost never escape from Level 2 on. Level 1's warden only reacts, so quick reflexes can beat it (strong players 91%): that's the point of Level 1, and the contrast with Level 2. The expert escapes Level 1 every time, about a quarter of the time on Level 3, usually on Level 4 (a careful adult who reads every plan finds the Archive's dodges; kids less often) and almost never on Level 5.

**The 10-minute class** (`npm run classroom`): 40 simulated thinkers play the levels in order on a 10-minute clock, retrying each level and remembering what got them caught (1.3 s per move, 4 s per "Caught!" screen, 15 s per briefing; the story is extra). Median tries per level: 1, 2, 2, 3, 18. By the end, 26 of 40 have reached Level 4, 19 have reached Level 5, and none have beaten it (the Uplink's learning Wardens are the hardest test in the game). Level 2 is where a class spends the most time: you can circle its warden safely for a long while before you find the vent trick. The story (prologue about 3¾ minutes, opening cutscene 1:44, Level 3 cutscene 46 s, Level 5 cutscene about 1 minute, ending about 2 minutes) comes on top of the 10 minutes; `?intro=0` skips it.

How the mazes were made: each new layout was generated or adapted (random mazes with loops, then enemies, drives and vents placed by distance), then tuned move by move (moving a wall, an enemy or a drive) against target numbers for every measure above, and finally checked by replaying the winning route. Small changes matter a lot: moving the Archive's drone a few tiles swings kids from 3% to 13%, and moving one of its Wardens up a single tile took them from 13% to 23% (that's how the Archive was made a little easier when the Data Vault before it was cut). Always run `npm run check-levels` after editing a maze (`npm run check-levels -- 5` checks just one).

The tests check that:

- every level can be beaten against its own enemies, and running straight for the exit gets you caught;
- no level has a free path: on every level the safest escape still passes close to an enemy;
- each level adds its new idea (a reacting ghost, lookahead and vents, a team, a drone, evidence, learning) and comes with a briefing and hints;
- on Level 2, a route that fools a 1-move warden doesn't get past the real 3-move warden;
- each level is harder than the last for a thinker, in steps of no more than 22 points; every level can still be won by one; from Level 2 on, players who ignore the prediction almost never escape;
- on Level 5, replaying a route that got you caught never gets further against the learning wardens than against forgetful ones, and some get caught sooner.

`npm test` takes about three minutes, mostly proving Levels 4 and 5 beatable. These are simulated players; playtesting with real kids is the real test.

## Gameplay logging (`game_server/gameLogger.js`, `game_server/log.js`)

Each attempt (level 1-5, attempt number, moves, prologue answers, win or death and where) is saved to Firestore by `gameLogger.js`; `clearpath/firestore.rules` checks every record. The game talks to it only through `log.js`, which loads it in the background: if Firebase can't load (offline, a school network that blocks Google's CDN, or the config not filled in yet), the game still starts and logging is simply off. The game engine in `src/` doesn't log anything, so the tests and the level checker run in Node. `firebaseConfig` in `gameLogger.js` still needs the real project values.

## Changing things

- **Difficulty:** change `lookahead` in `src/levels.js`, or add another `G` to a maze. Each extra step or warden multiplies the work by roughly 5; check the thinking time stays short on a Chromebook. Drones (`D`) cost almost nothing to think about, so they're the cheap way to add pressure: `dronePattern: [2, 1]` makes them faster on average than `[2, 0]`, and `[2]` (dash every turn) is brutal.
- **Teaching text:** each level's `concept`, `briefing` and `hints` in `src/levels.js` are plain strings. Hints are shown in order, one per catch.
- **Mazes:** edit the text maps in `src/levels.js`, then run `npm run check-levels`. Small changes matter a lot with two wardens: moving one start tile can swing the strong-player escape rate from 88% to 0%.
- **Ghost personality:** change `WEIGHTS` in `src/ai.js`, or give one level its own `weights`. `territory` is powerful and sensitive: `territory: 1` on Level 2 takes average players from 45% to about 23%.
- **Less predictable ghosts:** `new MazeGame({ rng: Math.random })` breaks ties randomly. The level checker's guarantees then become "usually" instead of "always".

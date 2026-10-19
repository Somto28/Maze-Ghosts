// levels.js — the six levels. Each one adds ONE new idea about how the enemy AI predicts you.
//
//   Level 1  The Basement      1 ghost, 2 exits             It GUARDS the way out instead of chasing you.
//   Level 2  The Server Halls  1 warden, lookahead 3, vent  It PREDICTS where you'll be. New: vents.
//   Level 3  The Core          2 wardens, 2 vents           TEAMWORK: one guards, one hunts.
//   Level 4  The Data Vault    2 wardens + 1 drone, vents   RULES vs SEARCH: the drone is fast but follows a fixed rule.
//   Level 5  The Archive       2 wardens + drone, 2 drives  PREDICTABLE GOALS: they know what you need, so they guard it.
//   Level 6  The Uplink        2 wardens + drone + drive    LEARNING: they study your caught attempts and wait on your old route.
//
// Every enemy uses the same brain (src/ai.js): minimax search plus a judgment of positions that
// treats "the player has a safe run to the goal" as nearly lost, so they cut you off instead of chasing.
// lookahead = how many of their own moves the wardens plan, each followed by your best reply.
//
// Map key:  #  wall    .  floor    E  exit (enemies can't enter)    P  player
//           G  warden (minimax)    D  drone (rule-based, see dronePattern)
//           K  evidence drive (pick up every one before the exit unlocks)
//           1-4  vent grates in pairs: step on one, come out of the other (enemies can't use them)
//
// Every maze is checked by tests/levels.test.js: it must be winnable against its own enemies, running
// straight for the exit must get you caught, and simulated players (src/playtest.js) must find each
// level harder than the last. `npm run check-levels` prints the numbers (see the table in README.md).
//
// Optional fields:
//   enemy         what the HUD calls them (default "ghost")
//   dronePattern  tiles a drone moves on each enemy turn, repeating (default [2]): [2, 0] = dash 2, recharge 1
//   learns        true = the wardens study your caught attempts (src/learning.js)
//   weights       this level's evaluation weights (src/ai.js WEIGHTS)
//   concept       the idea this level teaches, in a few words
//   briefing      shown before the level starts
//   hints         shown when you're caught, one after another: nudges to think about the prediction
//   theme         read by the 3D layout (src/layout3d.js); the game logic ignores it.
//                 `theme.style` picks custom art and HUD styling (examples/<style>.js + .css).

export const LEVELS = Object.freeze([
  {
    id: 1,
    name: "The Basement",
    lookahead: 1,
    concept: "It guards the way out",
    briefing:
      "This ghost only looks 1 move ahead, but it doesn't just chase you. It moves to stand between you and the way out. There are two exits and it can only guard one at a time. Watch where it goes, make it commit, then go for the other one.",
    hints: [
      "It isn't chasing you, it's blocking you. Its red dot shows where it will stand next.",
      "Two exits, one ghost. Head for one until it moves to block it, then switch.",
      "You only get out if you can reach an exit before it can reach your path. Count the tiles.",
    ],
    maze: [
      "#########",
      "#P......#",
      "#.####..#",
      "#....#..#",
      "#...#G#.#",
      "#.##..#.#",
      "#.....#.#",
      "#...#.#.E",
      "#####E###",
    ],
    // style "basement": brick, damp concrete and one swinging bulb (examples/basement.js + basement.css).
    theme: { style: "basement", wallHeight: 1.0, wallColor: "#4a2e24", floorColor: "#17120e", ghostColor: "#ff5a5a", fog: 0.03, light: 1.0 },
  },
  {
    id: 2,
    name: "The Server Halls",
    enemy: "warden",
    lookahead: 3,
    concept: "Predicting where you'll be",
    briefing:
      "This Warden looks 3 moves ahead: it heads for where you WILL be. New: VENTS. Step onto a numbered grate and you crawl through the ducts and pop out of the grate with the same number, all in one move. The dashed arc shows where it comes out. The Warden can't follow you, but it can predict where you'll come out.",
    hints: [
      "Step onto a grate to crawl to its twin with the same number. The dashed arc shows where you'll pop out.",
      "If the Warden's red dots head for the other end of the vent, it has guessed your plan. Go the other way.",
      "It assumes you'll make your smartest move. Make it commit to one route, then take another.",
    ],
    maze: [
      "###########",
      "#P......#.#",
      "#.#.###.#.#",
      "#.#.#.....#",
      "#.#.#.##..#",
      "#.#...#1#.#",
      "####..#...#",
      "##..#...G.#",
      "#.#...#.#.#",
      "#1...##...E",
      "###########",
    ],
    // style "server-halls": racks, raised floor and security cameras (examples/server-halls.js + server-halls.css).
    theme: { style: "server-halls", wallHeight: 1.4, wallColor: "#1a2230", floorColor: "#0b121c", ghostColor: "#ff3b6b", fog: 0.02, light: 1.0 },
  },
  {
    id: 3,
    name: "The Core",
    enemy: "warden",
    lookahead: 3,
    concept: "Teamwork: searching together",
    briefing:
      "Two Wardens plan as ONE team, trying every combination of their moves. Usually one guards the way out while the other hunts you. Use the vents to split them up: they can't guard both ends of every vent at once.",
    hints: [
      "One Warden is guarding, the other is hunting. Which is which? Their red dots tell you.",
      "Two Wardens can squeeze a corridor from both ends. Keep a vent or a loop between you and them.",
      "They plan as a team, so pulling one away can leave a gap. Make the hunter follow you, then use a vent.",
    ],
    maze: [
      "#############",
      "#P..........#",
      "#.#.##2#..###",
      "#.#...#.#...#",
      "#.###.#.###.#",
      "#...........#",
      "#.#.##1###..#",
      "#.#..1#.....#",
      "#.#..##.###.#",
      "#....G#.#2#.#",
      "#.#.#.#.#.#.#",
      "#...#G......E",
      "#############",
    ],
    // style "core": glass offices on the executive floor (examples/core.js + core.css).
    theme: { style: "core", wallHeight: 1.8, wallColor: "#e4e2dd", floorColor: "#17141d", ghostColor: "#ff1f3d", fog: 0.02, light: 1.0 },
  },
  {
    id: 4,
    name: "The Data Vault",
    enemy: "warden",
    lookahead: 3,
    dronePattern: [2, 0],
    concept: "Fast rules vs. slow thinking",
    briefing:
      "Meet the Drone. It doesn't think at all: it dashes 2 tiles straight at where you are, then recharges for a turn. Fast, but 100% predictable. The two Wardens think 3 moves ahead and know exactly how the Drone will move. Drones can't use vents either.",
    hints: [
      "The Drone always flies the shortest way to where you are now: 2 tiles, then it rests. Count its turns.",
      "When the HUD says the Drone is recharging, it can't move this turn. That's your window.",
      "Speed isn't intelligence: the Drone gets there first, but only the Wardens plan. Lead the Drone, outthink the Wardens.",
    ],
    maze: [
      "###############",
      "#P........#...#",
      "###.#.###.#.#.#",
      "#1#.#...#...#.#",
      "#.#.#.#.#.#.#.#",
      "#.....#...#...#",
      "#.#.#.#.###.#.#",
      "#.#.#...#..D#.#",
      "#.#.2##.#.###.#",
      "#...#2..#.#1#.#",
      "#G#.#####.#.#.#",
      "#...G.....#...E",
      "###############",
    ],
    // Reuses Level 2's server look (the Vault is where Clearpath stores the data it collects).
    theme: { style: "server-halls", wallHeight: 1.8, wallColor: "#1a2230", floorColor: "#081018", ghostColor: "#ff3b6b", droneColor: "#ffb020", fog: 0.024, light: 0.95 },
  },
  {
    id: 5,
    name: "The Archive",
    enemy: "warden",
    lookahead: 3,
    dronePattern: [2, 0],
    // These wardens only guard the drives and the door; they don't also try to box you in.
    weights: { territory: 0 },
    concept: "When the AI knows your goal",
    briefing:
      "You need proof. Grab both evidence drives (the glowing blue cases) before the exit unlocks. The Wardens know exactly what you need, so they don't chase you: they guard the drives and the door. When an AI knows your goal, your moves become easy to predict.",
    hints: [
      "They predict your route from your goal: drive, drive, exit. Grab the drives in the order they don't expect.",
      "Watch which drive their red dots head for. Go for the other one first.",
      "The exit stays locked until you hold every drive, and they know it. Don't rush the door.",
    ],
    maze: [
      "###############",
      "#P#1........#2#",
      "#.###.###.#.#.#",
      "#......1#...#.#",
      "#.#.#####G#.#.#",
      "#.#.....#.#.#.#",
      "#.###.#K#.#.#.#",
      "#.....#.#.#...#",
      "#.#.###.#.2##.#",
      "#.......#.#...#",
      "#.#####.#K#.###",
      "#.G.....#.#.#.#",
      "#.#.###.#.#D#.#",
      "#.........#...E",
      "###############",
    ],
    // No custom look yet (the basement look is too dark for a maze this big): plain lit walls in archive colours,
    // kept low so solid walls never hide you.
    theme: { wallHeight: 1.1, wallColor: "#8a6a4a", floorColor: "#2a2018", ghostColor: "#ff4d5e", droneColor: "#ffb020", fog: 0.018, light: 1.1 },
  },
  {
    id: 6,
    name: "The Uplink",
    enemy: "warden",
    lookahead: 3,
    dronePattern: [2, 0],
    learns: true,
    // The final test: they care twice as much about keeping you from the goal, and close in harder.
    weights: { playerFromExit: 8, chase: 12 },
    concept: "Learning from your data",
    briefing:
      "Upload the evidence and the world will know. But these Wardens LEARN. Every time they catch you, they record your route, and next time they lie in wait along it. The red arrows show what they've learned about you. Same route, same result.",
    hints: [
      "The red arrows are your old route. That's exactly where they'll be waiting. Take a different way.",
      "'habit' in their plan means they expect you to repeat what you did on that tile last time. Do something else.",
      "You never agreed to let them record you. Should an AI be allowed to learn from data people didn't choose to share?",
    ],
    maze: [
      "#################",
      "#P..............#",
      "#.#.####1######.#",
      "#.......#G......#",
      "#.#.#.#.#.#.#####",
      "#.....#.........#",
      "#.###.#.##3##.#.#",
      "#...#...#1#....G#",
      "###.#.###.#.#####",
      "#2#...#...#.#...#",
      "#.3####.###.#.#.#",
      "#.#.....#...#.#.#",
      "#.#.###.#.#.#.#.#",
      "#....2#K.....D#.E",
      "#################",
    ],
    // Reuses Level 3's glass look: the broadcast studio at the top of the tower.
    theme: { style: "core", wallHeight: 2.0, wallColor: "#e4e2dd", floorColor: "#120f18", ghostColor: "#ff1f3d", droneColor: "#ffb020", fog: 0.02, light: 1.0 },
  },
]);

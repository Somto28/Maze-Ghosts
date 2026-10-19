// levels.js — the six levels. Each one adds ONE new idea about how the enemy AI predicts you.
//
//   Level 1  The Basement      1 ghost,  lookahead 1   It only REACTS: steps toward where you are now. Lead it away.
//   Level 2  The Server Halls  1 warden, lookahead 3   It PREDICTS: heads for where you'll be. New: vents.
//   Level 3  The Core          2 wardens, lookahead 3  TEAMWORK: they search every combination of their moves together.
//   Level 4  The Data Vault    2 wardens + 1 drone     RULES vs SEARCH: the drone is fast but follows a fixed rule.
//   Level 5  The Archive       2 wardens, 2 evidence   PREDICTABLE GOALS: they know what you need, so they guard it.
//   Level 6  The Uplink        2 wardens + drone       LEARNING: they study your caught attempts and expect repeats.
//
// lookahead = how many of their own moves the wardens plan, each followed by your best reply.
//
// Map key:  #  wall    .  floor    E  exit (enemies can't enter)    P  player
//           G  warden (minimax)    D  drone (rule-based, see dronePattern)
//           K  evidence drive (pick up every one before the exit unlocks)
//           v  vent (you can crawl through, enemies can't)
//
// Every maze is checked by tests/levels.test.js: it must be winnable against its own enemies, running
// straight for the exit must get you caught, and simulated players (src/playtest.js) must find each
// level harder than the last but never out of reach for a player who reads the wardens' plan.
// `npm run check-levels` prints the numbers (see the table in README.md).
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
    concept: "Reacting is not predicting",
    briefing:
      "This ghost only looks 1 move ahead: every turn it steps toward wherever you are RIGHT NOW. It can't plan, so you can lead it. Pull it away from the exit, then make your break.",
    hints: [
      "It always steps toward where you are now, never where you're going. Lead it around a loop, then run.",
      "Running straight for the exit is exactly what it's waiting for. Make it chase you somewhere else first.",
      "Watch the gold dot: that's the move it expects from you. Surprise it.",
    ],
    maze: [
      "#########",
      "#P....#.#",
      "#.###.#.#",
      "#.....#.#",
      "#...#...#",
      "#...#G..#",
      "##...##.#",
      "##....#.E",
      "#########",
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
      "This Warden looks 3 moves ahead. It imagines your best route and heads to where you WILL be, not where you are. New: vents (the grates). You can crawl through them; the Warden can't follow, but it can predict where you'll come out.",
    hints: [
      "Its red dots end where it expects to catch you. If they point at the exit, it has already guessed your route.",
      "It assumes you'll take your best route. Make it commit to guarding one way, then use another.",
      "It can't follow you into a vent, but it can wait at the other end. Check its red dots before you crawl.",
    ],
    maze: [
      "###########",
      "#P.....#..#",
      "#.#.#.##..#",
      "#.#.#.###.#",
      "#.#.##..#.#",
      "#...#.G.#.#",
      "###.###.#v#",
      "#...###...#",
      "#.###.....#",
      "#.......#.E",
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
      "Two Wardens being field-tested. They plan as ONE team, trying every combination of their moves, so one can chase while the other cuts you off. Stay where you have more than one way out.",
    hints: [
      "Two Wardens squeeze a corridor from both ends. Stay near loops where you have two ways out.",
      "Look at how many futures they checked: two Wardens planning together check about 5 times more than one.",
      "Their search assumes you'll make your smartest move. Which move did they score as your best? Is it really?",
    ],
    maze: [
      "#############",
      "#P..#...G...#",
      "#.#.#.###.#.#",
      "#.......#.#.#",
      "#.#.#.#.#.#.#",
      "#.#.......#.#",
      "#.#.#####G#.#",
      "#.#.#...#...#",
      "#.#.#.#.###.#",
      "#.....#.....#",
      "###.#.#.#.#.#",
      "#.....#.....E",
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
      "Meet the Drone. It doesn't think at all: it dashes 2 tiles straight at where you are, then recharges for a turn. Fast, but 100% predictable. The Wardens think 3 moves ahead and know exactly how the Drone will move. Drones can't fit in vents.",
    hints: [
      "The Drone always takes the shortest path to where you are now, 2 tiles, then rests. Count its turns.",
      "When the Drone is recharging, it can't move. That's your window.",
      "Duck into a vent and the Drone can only hover at the opening. The Wardens will try to guess which end you'll use.",
    ],
    maze: [
      "###############",
      "#P#...#...#...#",
      "#.v.#.#.#.#.#.#",
      "#.#.....#...#.#",
      "#.###.#.#####.#",
      "#.....#......G#",
      "#.#.#.##v##.#.#",
      "#.....#.......#",
      "#.###.#.#####.#",
      "#.......#.....#",
      "#.#####.#.#D###",
      "#.......#.....E",
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
    concept: "When the AI knows your goal",
    briefing:
      "You need proof. Grab both evidence drives (the glowing blue cases) before the exit unlocks. The Wardens know what you need, so they don't just chase you: they guard the drives. When an AI knows your goal, your moves become easy to predict.",
    hints: [
      "They predict your route from your goal: drive, drive, exit. Grab the drives in the order they don't expect.",
      "Watch which drive their red dots head for. Go for the other one first.",
      "The exit stays locked until you hold every drive, and they know it. Don't rush the door.",
    ],
    maze: [
      "###############",
      "#P............#",
      "###.#.###.#.#.#",
      "#.......#...#.#",
      "#.##v##.#.#.###",
      "#.#G....#.K...#",
      "#.#.###.###.#.#",
      "#.#..G..K.....#",
      "#.###########.#",
      "#.............#",
      "#.#.#.#.###.#.#",
      "#.#.......#...#",
      "#.#.###.#.#.#.#",
      "#.........#...E",
      "###############",
    ],
    // No custom look yet (the basement look is too dark for a maze this big): plain lit walls in archive colours,
    // kept low so solid walls never hide you.
    theme: { wallHeight: 1.1, wallColor: "#8a6a4a", floorColor: "#2a2018", ghostColor: "#ff4d5e", fog: 0.018, light: 1.1 },
  },
  {
    id: 6,
    name: "The Uplink",
    enemy: "warden",
    lookahead: 3,
    dronePattern: [2, 0],
    learns: true,
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
      "#P#.............#",
      "#.###.#.###.#.#.#",
      "#.#...#...#.....#",
      "#.#.#####G#.###.#",
      "#..........K..#.#",
      "#.###.#.###.#.#.#",
      "#...#.........#.#",
      "#.#.#.###.###.#.#",
      "#.....v...#...#.#",
      "#.#v###.#.#.#.#.#",
      "#.#...#G....D.#.#",
      "#.#.#.#.###.#.#.#",
      "#.......#.......E",
      "#################",
    ],
    // Reuses Level 3's glass look: the broadcast studio at the top of the tower.
    theme: { style: "core", wallHeight: 2.0, wallColor: "#e4e2dd", floorColor: "#120f18", ghostColor: "#ff1f3d", droneColor: "#ffb020", fog: 0.02, light: 1.0 },
  },
]);

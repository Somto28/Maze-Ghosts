// levels.js — the three levels. The ghosts' LOOKAHEAD and how many there are set the difficulty.
//
//   lookahead = how many of their own moves the ghosts plan, each followed by your best reply.
//   Level 1: 1 ghost,   1 move  — reacts to where you are right now
//   Level 2: 1 ghost,   3 moves — starts cutting you off
//   Level 3: 2 wardens, 3 moves — plan together as a team: one chases while the other cuts you off
//
// Map key:  #  wall    .  floor    E  exit (ghosts can't enter)    P  player    G  ghost (one per ghost)
//
// Every maze is checked by tests/levels.test.js: it must be winnable against its own ghosts, running
// straight for the exit must get you caught, and simulated players (src/playtest.js) must find each
// level harder than the last but never impossible. `npm run check-levels` prints the numbers:
//
//                  escape rate for simulated players:  beginner · average · strong
//   Level 1                                                56%       82%     100%
//   Level 2                                                20%       44%      99%
//   Level 3 (old maze, 1 ghost, lookahead 5, was easier)   27%       68%      99%
//   Level 3                                                 4%       35%      87%
//
// `enemy` is what the HUD calls them (default "ghost"). `theme` is read by the 3D layout
// (src/layout3d.js); the game logic ignores it. An optional `theme.style` picks custom art and HUD styling.

export const LEVELS = Object.freeze([
  {
    id: 1,
    name: "The Basement",
    lookahead: 1,
    maze: [
      "#########",
      "#P..#...#",
      "#.#.#.#.#",
      "#.#...#.#",
      "#.###.#.#",
      "#...G...#",
      "#.#.###.#",
      "#.......E",
      "#########",
    ],
    // style "basement": brick, damp concrete and one swinging bulb (examples/basement.js + basement.css).
    theme: { style: "basement", wallHeight: 1.0, wallColor: "#4a2e24", floorColor: "#17120e", ghostColor: "#ff5a5a", fog: 0.03, light: 1.0 },
  },
  {
    id: 2,
    name: "The Server Halls",
    lookahead: 3,
    maze: [
      "###########",
      "#P....#...#",
      "#.###.#.#.#",
      "#.#...#.#.#",
      "#.#.###.#.#",
      "#...#.G...#",
      "###.#.#####",
      "#...#.....#",
      "#.#####.#.#",
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
    // Two AI wardens being field-tested, starting on both sides of you. The maze is more open than
    // before (more loops and side routes), because two wardens in the old maze won 90%+ of games.
    lookahead: 3,
    maze: [
      "#############",
      "#P....#.G...#",
      "#.#.#.###.#.#",
      "#.........#.#",
      "#.##.######.#",
      "#.....#.....#",
      "#.###.#.#.#.#",
      "#.........#.#",
      "#G###.###.#.#",
      "#.#.#.......#",
      "#.#...###.#.#",
      "#...#.......E",
      "#############",
    ],
    // style "core": glass offices on the executive floor (examples/core.js + core.css).
    theme: { style: "core", wallHeight: 1.8, wallColor: "#e4e2dd", floorColor: "#17141d", ghostColor: "#ff1f3d", fog: 0.02, light: 1.0 },
  },
]);

// levels.js — the three levels. The ghost's LOOKAHEAD is the difficulty setting.
//
//   lookahead = how many of its own moves the ghost plans, each followed by your best reply.
//   Level 1: 1 move  (2 half-moves searched)  — reacts to where you are right now
//   Level 2: 3 moves (6 half-moves searched)  — starts cutting you off
//   Level 3: 5 moves (10 half-moves searched) — predicts your route and blocks it
//
// Map key:  #  wall    .  floor    E  exit (the ghost can't enter)    P  player    G  ghost
//
// Every maze is checked by tests/levels.test.js: it must be winnable against its own ghost,
// and running straight for the exit must get you caught on Levels 2 and 3.
// `theme` is read by the 3D layout (src/layout3d.js); the game logic ignores it.

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
    theme: { wallHeight: 1.0, wallColor: "#64748b", floorColor: "#1e2633", ghostColor: "#ff5a5a", fog: 0.012, light: 1.0 },
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
    theme: { wallHeight: 1.4, wallColor: "#4f6a8a", floorColor: "#172030", ghostColor: "#ff3b6b", fog: 0.02, light: 0.92 },
  },
  {
    id: 3,
    name: "The Core",
    lookahead: 5,
    maze: [
      "#############",
      "#P..#.......#",
      "#.#.#.#####.#",
      "#.#...#...#.#",
      "#.###.#.#.#.#",
      "#.....#.#...#",
      "#.#.#####.#.#",
      "#.#...G...#.#",
      "#.###.#.###.#",
      "#...#.#...#.#",
      "###.#.###.#.#",
      "#.....#.....E",
      "#############",
    ],
    theme: { wallHeight: 1.8, wallColor: "#46557a", floorColor: "#121826", ghostColor: "#ff1f3d", fog: 0.028, light: 0.85 },
  },
]);

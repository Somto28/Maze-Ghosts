export { MazeGame } from "./game.js";
export { LEVELS } from "./levels.js";
export { chooseGhostMove, evaluate, searchScore, WEIGHTS, WIN } from "./ai.js";
export { DIRS, parseMaze, legalMoves, canEnter, mazeDistance, distancesFrom, samePos } from "./maze.js";
export { outcome, movePlayer, moveGhost } from "./rules.js";
export { buildLayout3D, gridToWorld, worldToGrid } from "./layout3d.js";
export { solveLevel, replay, naiveRoute, stateFromLevel } from "./solver.js";

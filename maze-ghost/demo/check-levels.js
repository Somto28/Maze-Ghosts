// Check every level after editing a maze:  npm run check-levels
// Proves each level can be beaten, and shows how a straight run and a "shallow" strategy do.

import { LEVELS, naiveRoute, replay, solveLevel } from "../src/index.js";

for (const level of LEVELS) {
  const t = performance.now();
  const win = solveLevel(level);
  const ms = Math.round(performance.now() - t);
  console.log(`\nLevel ${level.id}: ${level.name} (ghost lookahead ${level.lookahead})`);
  if (!win.moves) {
    console.log("  ✗ NOT BEATABLE: the ghost wins from every route. Open up the maze.");
    continue;
  }
  console.log(`  ✓ beatable: shortest escape is ${win.moves.length} moves (checked ${win.statesExplored} positions in ${ms} ms)`);
  console.log(`  straight run to the exit: ${replay(level.maze, level.lookahead, naiveRoute(level.maze))}`);
  for (let shallow = 1; shallow < level.lookahead; shallow++) {
    const route = solveLevel({ maze: level.maze, lookahead: shallow }).moves;
    console.log(`  route that beats a ${shallow}-move ghost: ${replay(level.maze, level.lookahead, route)}`);
  }
  console.log(`  winning route: ${win.moves.join(" ")}`);
}

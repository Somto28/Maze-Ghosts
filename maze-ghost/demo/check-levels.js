// Check every level after editing a maze:  npm run check-levels
// Proves each level can be beaten, shows how a straight run and a "shallow" strategy do, and
// measures how hard it FEELS: how often simulated players of each skill escape (see src/playtest.js).

import { LEVELS, SKILLS, ghostBrain, naiveRoute, playtest, replay, solveLevel } from "../src/index.js";

for (const level of LEVELS) {
  const ghosts = (level.maze.join("").match(/G/g) ?? []).length;
  const brain = ghostBrain(level); // shared, so each position is only searched once
  const t = performance.now();
  const win = solveLevel(level, { brain });
  const ms = Math.round(performance.now() - t);
  console.log(`\nLevel ${level.id}: ${level.name} (${ghosts} ${level.enemy ?? "ghost"}${ghosts > 1 ? "s" : ""}, lookahead ${level.lookahead})`);
  if (!win.moves) {
    console.log("  ✗ NOT BEATABLE: the ghosts win from every route. Open up the maze.");
    continue;
  }
  console.log(`  ✓ beatable: shortest escape is ${win.moves.length} moves (checked ${win.statesExplored} positions in ${ms} ms)`);
  console.log(`  straight run to the exit: ${replay(level, naiveRoute(level.maze), brain)}`);
  for (let shallow = 1; shallow < level.lookahead; shallow++) {
    const route = solveLevel({ ...level, lookahead: shallow }).moves;
    console.log(`  route that beats a ${shallow}-move search: ${route ? replay(level, route, brain) : "(none exists)"}`);
  }
  const rates = Object.keys(SKILLS).map((skill) => `${skill} ${Math.round(playtest(level, { skill, games: 300, brain }).rate * 100)}%`);
  console.log(`  simulated players who escape: ${rates.join(" · ")}`);
  console.log(`  winning route: ${win.moves.join(" ")}`);
}

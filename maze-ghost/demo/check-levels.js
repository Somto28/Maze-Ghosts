// Check every level after editing a maze:  npm run check-levels   (or: npm run check-levels -- 4  for one level)
// Proves each level can be beaten, shows how a straight run and a "shallow" strategy do, and
// measures how hard it FEELS: how often simulated players of each skill escape (see src/playtest.js).
//   beginner / average / strong  guess what the wardens will do (they ignore the red dots)
//   thinker                      reads the wardens' plan and thinks 3 moves ahead
// On a learning level it also shows how a thinker does over several tries while the wardens study it.

import { LEVELS, SKILLS, describeLevel, ghostBrain, naiveRoute, playtest, replay, solveLevel } from "../src/index.js";

const only = Number(process.argv[2]) || null;
for (const level of LEVELS) {
  if (only && level.id !== only) continue;
  const brain = ghostBrain(level); // shared, so each position is only searched once
  const t = performance.now();
  const win = solveLevel(level, { brain });
  const ms = Math.round(performance.now() - t);
  console.log(`\nLevel ${level.id}: ${level.name} (${describeLevel(level).short})`);
  if (!win.moves) {
    console.log("  ✗ NOT BEATABLE: the enemies win from every route. Open up the maze.");
    continue;
  }
  console.log(`  ✓ beatable: shortest escape is ${win.moves.length} moves (checked ${win.statesExplored} positions in ${ms} ms)`);
  console.log(`  straight run to the exit: ${replay(level, naiveRoute(level.maze), brain)}`);
  for (let shallow = 1; shallow < level.lookahead; shallow++) {
    const route = solveLevel({ ...level, lookahead: shallow }).moves;
    console.log(`  route that beats a ${shallow}-move search: ${route ? replay(level, route, brain) : "(none exists)"}`);
  }
  const rates = Object.keys(SKILLS).map((skill) => `${skill} ${Math.round(playtest(level, { skill, games: 300, brain }).rate * 100)}%`);
  console.log(`  simulated players who escape (first try): ${rates.join(" · ")}`);
  if (level.learns) {
    const tries = playtest(level, { skill: "strong", games: 100, attempts: 5 }).byAttempt.map((r) => `${Math.round(r * 100)}%`);
    console.log(`  strong player retrying while the wardens learn, escaped by try 1-5: ${tries.join(" ")}`);
  }
  console.log(`  winning route: ${win.moves.join(" ")}`);
}

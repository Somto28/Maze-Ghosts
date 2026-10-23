// A simulated 10-minute class:  npm run classroom
// Simulated kids who read the wardens' plan (the "thinker" player in src/playtest.js: thinks 3 moves
// ahead, slips 3% of the time) play the levels in order on a clock. Each kid retries a level until
// they escape, remembering the moves that got them caught. Prints how many tries a level takes, how
// long kids spend on it, and how far a class gets in the time.
//
// Time model (change with env vars): SEC_PER_MOVE (default 1.3 s: deciding + the 0.22 s animation),
// 4 s on each "Caught!" screen, 15 s reading each briefing, BUDGET seconds of play (default 600).
// The story (prologue + cutscene, about 5½ minutes) is NOT included: it's extra, or skip it with ?intro=0.

import { LEVELS, ghostBrain, playtest } from "../src/index.js";

const SEC_PER_MOVE = Number(process.env.SEC_PER_MOVE ?? 1.3);
const CATCH_SEC = 4, BRIEF_SEC = 15, BUDGET = Number(process.env.BUDGET ?? 600);
const KIDS = Number(process.env.KIDS ?? 40), MAX_TRIES = 25;

const perLevel = LEVELS.map((level, i) => {
  const brain = level.learns ? null : ghostBrain(level);
  const r = playtest(level, { skill: "thinker", games: KIDS, attempts: MAX_TRIES, brain, record: true, seed: 100 + i, maxTurns: 120 });
  const kids = [];
  let cur = [];
  for (const p of r.played) {
    cur.push({ moves: p.steps.length, won: p.result === "escaped" });
    if (p.result === "escaped" || cur.length === MAX_TRIES) { kids.push(cur); cur = []; }
  }
  return kids;
});

const cleared = new Array(LEVELS.length + 1).fill(0);
const timeOn = LEVELS.map(() => []);
for (let k = 0; k < KIDS; k++) {
  let t = 0, lvl = 0;
  for (; lvl < LEVELS.length; lvl++) {
    t += BRIEF_SEC;
    const start = t;
    let won = false;
    for (const a of perLevel[lvl][k]) {
      t += a.moves * SEC_PER_MOVE;
      if (t > BUDGET) break;
      if (a.won) { won = true; break; }
      t += CATCH_SEC;
    }
    timeOn[lvl].push(Math.min(t, BUDGET) - start);
    if (!won || t > BUDGET) break;
  }
  cleared[lvl]++;
}

console.log(`A class of ${KIDS} simulated kids, ${BUDGET / 60} minutes of play, ${SEC_PER_MOVE} s per move\n`);
LEVELS.forEach((l, i) => {
  const tries = perLevel[i].map((a) => (a.at(-1).won ? a.length : null)).filter((n) => n !== null).sort((a, b) => a - b);
  const median = tries.length ? tries[Math.floor(tries.length / 2)] : "-";
  const lens = perLevel[i].flat();
  const avgMoves = Math.round(lens.reduce((a, b) => a + b.moves, 0) / lens.length);
  const there = timeOn[i].length;
  const avgTime = there ? Math.round(timeOn[i].reduce((a, b) => a + b, 0) / there) : "-";
  console.log(`  Level ${l.id} ${l.name.padEnd(17)} median ${String(median).padStart(2)} tries · ${String(avgMoves).padStart(3)} moves a try · kids who got here: ${String(there).padStart(2)} · avg ${avgTime} s on it`);
});
console.log(`\n  Levels cleared by the end: ${cleared.map((n, i) => `${i}: ${n} kid${n === 1 ? "" : "s"}`).join(" · ")}`);

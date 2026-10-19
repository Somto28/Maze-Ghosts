// learning.js — how the Level 6 wardens learn from you.
//
// Clearpath's pitch is "our AI knows what people will do." On a level with `learns: true`, every
// attempt where you get caught is recorded: on each tile you stood on, which way you went next.
// Next attempt, the wardens' search uses that record: from wherever you are, they trace "your usual
// route", and whenever several of their moves are equally good they pick the one that gets them to a
// tile on that route before you (an ambush). See `habit` in ai.js WEIGHTS and chooseGhostMoves.
//
// That makes them deadly against players who repeat themselves, while players who notice and
// change their route walk around the ambush. (It's also the ethics question in miniature: the
// wardens got better at predicting you by collecting data about you.)

/** @typedef {{ r: number, c: number, dir: string }} Step  one move: from tile (r, c), went `dir` */

/**
 * Turn recorded attempts into habits: for each tile, the direction you took most often.
 * Ties go to the most recent attempt.
 * @param {ReadonlyArray<ReadonlyArray<Step>>} attempts oldest first
 * @returns {Record<string, string>} { "row,col": "dir" }
 */
export function habitsFrom(attempts) {
  const counts = new Map(); // tile -> Map(dir -> { n, last })
  attempts.forEach((attempt, a) => {
    const seen = new Set(); // count each tile once per attempt, so pacing back and forth doesn't dominate
    for (let i = attempt.length - 1; i >= 0; i--) {
      const { r, c, dir } = attempt[i];
      const tile = `${r},${c}`;
      if (seen.has(tile)) continue; // the LAST thing you did on a tile in an attempt is what counts
      seen.add(tile);
      if (!counts.has(tile)) counts.set(tile, new Map());
      const byDir = counts.get(tile);
      const entry = byDir.get(dir) ?? { n: 0, last: -1 };
      byDir.set(dir, { n: entry.n + 1, last: a });
    }
  });
  const habits = {};
  for (const [tile, byDir] of counts) {
    let best = null;
    for (const [dir, e] of byDir) {
      if (!best || e.n > best.n || (e.n === best.n && e.last > best.last)) best = { dir, ...e };
    }
    habits[tile] = best.dir;
  }
  return habits;
}

/** How many tiles of yours the wardens have a habit for (for the HUD). */
export const habitCount = (habits) => (habits ? Object.keys(habits).length : 0);

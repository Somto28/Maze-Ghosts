// ghost-worker.js — runs the ghosts' search off the main thread, so the 3D view keeps animating
// smoothly while several wardens think ahead (that can take a few hundred ms on a slow Chromebook).
//
// Messages in:  { type: "think", id, state, lookahead, options }     the enemies' move
//               { type: "foresee", id, state, lookahead, options }   what they foresee for each of your moves
// Messages out: { id, decision }  (what chooseGhostMoves or foresee returns)

import { chooseGhostMoves } from "../src/ai.js";
import { foresee } from "../src/insight.js";

let grid = null; // kept between moves so the walking-distance cache (keyed by grid) is reused

self.onmessage = ({ data }) => {
  if (data.type !== "think" && data.type !== "foresee") return;
  // Same maze as last time? Reuse our copy of the grid and with it every distance already worked out.
  if (!grid || JSON.stringify(grid) !== JSON.stringify(data.state.grid)) grid = data.state.grid;
  const state = { ...data.state, grid };
  const run = data.type === "think" ? chooseGhostMoves : foresee;
  self.postMessage({ id: data.id, decision: run(state, data.lookahead, data.options) });
};

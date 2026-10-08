// Play in the terminal:  npm run play
// Arrow keys or WASD to move, space to wait, r to restart, q to quit.
// Add --think to see the ghost's options and scores after each move.

import readline from "node:readline";
import { MazeGame, samePos } from "../src/index.js";

const showThinking = process.argv.includes("--think");
const game = new MazeGame();
let message = "Reach the exit (E). The ghost (G) moves after you.";

const KEYS = { up: "up", down: "down", left: "left", right: "right", w: "up", s: "down", a: "left", d: "right", space: "wait" };

function draw() {
  const { grid, player, ghost } = game.state;
  const rows = grid.map((row, r) =>
    row.map((tile, c) => {
      const here = { r, c };
      if (samePos(here, player) && samePos(here, ghost)) return "\x1b[41m X \x1b[0m";
      if (samePos(here, player)) return "\x1b[44m P \x1b[0m";
      if (samePos(here, ghost)) return "\x1b[31m G \x1b[0m";
      if (tile === "#") return "\x1b[100m   \x1b[0m";
      if (tile === "E") return "\x1b[42m E \x1b[0m";
      return " · ";
    }).join(""),
  );
  console.clear();
  const { id, name, lookahead } = game.level;
  console.log(`Level ${id}: ${name}  |  Ghost looks ${lookahead} move${lookahead > 1 ? "s" : ""} ahead  |  Turn ${game.turnNumber}\n`);
  console.log(rows.join("\n"));
  console.log(`\n${message}`);
  const t = game.lastThinking;
  if (showThinking && t) {
    console.log(`\nGhost considered ${t.futuresConsidered} futures (${t.branchesPruned} branches pruned):`);
    for (const o of t.options) {
      console.log(`  ${o.chosen ? "->" : "  "} ${o.dir.padEnd(5)} score ${String(o.score).padStart(5)}   expects you to go: ${o.predictedPlayerReply ?? "-"}`);
    }
  }
  console.log("\nArrows/WASD move · space wait · r restart · q quit");
}

readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);

process.stdin.on("keypress", (_str, key) => {
  if (!key) return;
  if (key.name === "q" || (key.ctrl && key.name === "c")) process.exit(0);

  if (game.status === "caught" && key.name === "r") { game.restartLevel(); message = "Try again!"; return draw(); }
  if (game.status === "levelComplete") { game.nextLevel(); message = "The ghost is thinking further ahead now..."; return draw(); }
  if (game.status === "gameComplete") process.exit(0);
  if (key.name === "r") { game.restartLevel(); message = "Restarted."; return draw(); }

  const dir = KEYS[key.name];
  if (!dir) return;
  const { player, ghost } = game.takeTurn(dir);
  if (player.event === "blocked") message = "That's a wall.";
  else if (game.status === "caught") message = "CAUGHT! Press r to try again.";
  else if (game.status === "levelComplete") message = "ESCAPED! Press any key for the next level.";
  else if (game.status === "gameComplete") message = "You escaped every level! Press any key to quit.";
  else message = `Ghost moved ${ghost.dir}.`;
  draw();
});

draw();

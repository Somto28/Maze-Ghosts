// Play in the terminal:  npm run play
// Arrow keys or WASD to move, r to restart, q to quit.
// Add --think to see the ghost's options and scores after each move.

import readline from "node:readline";
import { MazeGame, describeLevel, samePos } from "../src/index.js";

const showThinking = process.argv.includes("--think");
const game = new MazeGame();
let message = "Reach the exit (E). The ghost (G) moves after you.";

const KEYS = { up: "up", down: "down", left: "left", right: "right", w: "up", s: "down", a: "left", d: "right" };

function draw() {
  const { grid, player, ghosts, roles, keys, collected } = game.state;
  const rows = grid.map((row, r) =>
    row.map((tile, c) => {
      const here = { r, c };
      const ghostHere = ghosts.findIndex((g) => samePos(here, g));
      if (samePos(here, player) && ghostHere >= 0) return "\x1b[41m X \x1b[0m";
      if (samePos(here, player)) return "\x1b[44m P \x1b[0m";
      if (ghostHere >= 0) return roles[ghostHere] === "drone" ? "\x1b[33m D \x1b[0m" : "\x1b[31m G \x1b[0m";
      if (tile === "#") return "\x1b[100m   \x1b[0m";
      if (tile === "E") return game.evidence.exitOpen ? "\x1b[42m E \x1b[0m" : "\x1b[41m E \x1b[0m";
      if (tile === "K") return (collected >> keys.findIndex((k) => samePos(k, here))) & 1 ? " · " : "\x1b[36m K \x1b[0m";
      if (tile === "v") return "\x1b[90m ≡ \x1b[0m";
      return " · ";
    }).join(""),
  );
  console.clear();
  const { id, name } = game.level;
  const n = ghosts.length;
  const ev = game.evidence;
  console.log(`Level ${id}: ${name}  |  ${describeLevel(game.level).line}  |  Turn ${game.turnNumber}${ev.total ? `  |  Evidence ${ev.held}/${ev.total}` : ""}\n`);
  console.log(rows.join("\n"));
  console.log(`\n${message}`);
  const t = game.lastThinking;
  if (showThinking && t) {
    console.log(`\n${n > 1 ? "They" : "It"} considered ${t.futuresConsidered} futures (${t.branchesPruned} branches pruned):`);
    for (const o of t.options.slice(0, 8)) {
      console.log(`  ${o.chosen ? "->" : "  "} ${o.dir.padEnd(n > 1 ? 15 : 5)} score ${String(o.score).padStart(5)}   expects you to go: ${o.predictedPlayerReply ?? "-"}`);
    }
  }
  console.log("\nArrows/WASD move · r restart · q quit");
}

readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);

process.stdin.on("keypress", (_str, key) => {
  if (!key) return;
  if (key.name === "q" || (key.ctrl && key.name === "c")) process.exit(0);

  if (game.status === "caught" && key.name === "r") { game.restartLevel(); message = "Try again!"; return draw(); }
  if (game.status === "levelComplete") { game.nextLevel(); message = game.level.briefing ?? "Next level."; return draw(); }
  if (game.status === "gameComplete") process.exit(0);
  if (key.name === "r") { game.restartLevel(); message = "Restarted."; return draw(); }

  const dir = KEYS[key.name];
  if (!dir) return;
  const { player, ghost } = game.takeTurn(dir);
  if (player.event === "blocked") message = "That's a wall.";
  else if (player.event === "locked") message = "The exit is locked: grab every evidence drive (K) first.";
  else if (game.status === "caught") message = `CAUGHT! ${(game.level.hints ?? [])[0] ?? ""} Press r to try again.`;
  else if (game.status === "levelComplete") message = "ESCAPED! Press any key for the next level.";
  else if (game.status === "gameComplete") message = "You escaped every level! Press any key to quit.";
  else message = `${game.state.ghosts.length > 1 ? "They" : "It"} moved ${ghost.dir}.`;
  draw();
});

draw();

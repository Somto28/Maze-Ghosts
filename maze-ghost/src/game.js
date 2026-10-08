// game.js — the game controller. Enforces turns (player, then ghost) and moves through the levels.
//
// Typical loop in a 3D game:
//   const result = game.playerMove("up");       // animate the player
//   if (result.event === "moved") {
//     const ghost = game.ghostMove();            // animate the ghost, show ghost.thinking
//   }
// Or call game.takeTurn("up") to do both at once.

import { legalMoves } from "./maze.js";
import { chooseGhostMove } from "./ai.js";
import { LEVELS } from "./levels.js";
import { moveGhost, movePlayer, outcome } from "./rules.js";
import { stateFromLevel } from "./solver.js";

/** @typedef {import("./maze.js").Dir} Dir */
/** @typedef {"playing" | "caught" | "levelComplete" | "gameComplete"} Status */

export class MazeGame {
  /**
   * @param {{ levels?: typeof LEVELS, pruning?: boolean, rng?: (() => number) | null }} [options]
   *   rng: pass Math.random to make the ghost break ties randomly (less predictable, but then
   *        the level checker's guarantees no longer apply exactly).
   */
  constructor({ levels = LEVELS, pruning = true, rng = null } = {}) {
    if (levels.length === 0) throw new Error("Need at least one level");
    this.levels = levels;
    this.searchOptions = { pruning, rng };
    this.startLevel(0);
  }

  get level() { return this.levels[this.levelIndex]; }
  get isLastLevel() { return this.levelIndex === this.levels.length - 1; }
  /** Directions the player can move right now (for disabling buttons, or hints). */
  get availableMoves() {
    if (this.status !== "playing" || this.state.turn !== "player") return [];
    return legalMoves(this.state.grid, this.state.player, "player").map((m) => m.dir);
  }

  /** @param {number} index */
  startLevel(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.levels.length) throw new RangeError(`No level ${index}`);
    this.levelIndex = index;
    this.state = stateFromLevel(this.level);
    /** @type {Status} */
    this.status = "playing";
    this.turnNumber = 0;
    this.lastThinking = null;
    return this.state;
  }

  restartLevel() { return this.startLevel(this.levelIndex); }

  nextLevel() {
    if (this.status !== "levelComplete") throw new Error("Finish this level first");
    return this.startLevel(this.levelIndex + 1);
  }

  /**
   * The player's turn.
   * @param {Dir} dir
   * @returns {{ event: "blocked" | "moved" | "escaped" | "caught" | "notYourTurn", from: object, to: object, status: Status }}
   */
  playerMove(dir) {
    const from = this.state.player;
    if (this.status !== "playing" || this.state.turn !== "player") {
      return { event: "notYourTurn", from, to: from, status: this.status };
    }
    const move = legalMoves(this.state.grid, from, "player").find((m) => m.dir === dir);
    if (!move) return { event: "blocked", from, to: from, status: this.status };

    this.state = movePlayer(this.state, move);
    this.turnNumber++;
    const end = outcome(this.state);
    if (end === "escaped") this.status = this.isLastLevel ? "gameComplete" : "levelComplete";
    if (end === "caught") this.status = "caught";
    return { event: end ?? "moved", from, to: this.state.player, status: this.status };
  }

  /**
   * The ghost's turn: it runs adversarial search with this level's lookahead.
   * `thinking` holds every option it considered, its scores and the future it predicted.
   */
  ghostMove() {
    const from = this.state.ghost;
    if (this.status !== "playing" || this.state.turn !== "ghost") {
      return { event: "notYourTurn", from, to: from, thinking: null, status: this.status };
    }
    const { move, thinking } = chooseGhostMove(this.state, this.level.lookahead, this.searchOptions);
    this.state = moveGhost(this.state, move);
    this.lastThinking = thinking;
    if (outcome(this.state) === "caught") this.status = "caught";
    return {
      event: this.status === "caught" ? "caught" : "moved",
      dir: move.dir,
      from,
      to: this.state.ghost,
      thinking,
      status: this.status,
    };
  }

  /** Player moves, then (if the game is still on) the ghost moves. */
  takeTurn(dir) {
    const player = this.playerMove(dir);
    const ghost = player.event === "moved" ? this.ghostMove() : null;
    return { player, ghost, status: this.status };
  }
}

// game.js — the game controller. Enforces turns (player, then ghost) and moves through the levels.
//
// Typical loop in a 3D game:
//   const result = game.playerMove("up");       // animate the player
//   if (result.event === "moved") {
//     const ghost = game.ghostMove();            // animate the ghost, show ghost.thinking
//   }
// Or call game.takeTurn("up") to do both at once.

import { chooseGhostMoves } from "./ai.js";
import { LEVELS } from "./levels.js";
import { habitsFrom } from "./learning.js";
import { exitsOpen, keysHeld, moveGhosts, movePlayer, outcome, playerMoves } from "./rules.js";
import { stateFromLevel } from "./solver.js";

/** @typedef {import("./maze.js").Dir} Dir */
/** @typedef {"playing" | "caught" | "levelComplete" | "gameComplete"} Status */

/**
 * GLITCH: after this many catches on one level, the player gets a "glitch" for every later attempt
 * on that level. Arm it, then move: every enemy (wardens and drones) loses its next turn, so you get
 * one free move. Once per attempt; being caught (or restarting) gives you a fresh one.
 * Beating the level resets its count, so a replay starts without the glitch.
 * A level can set its own `glitchAfter`.
 */
export const GLITCH_AFTER = 10;

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
    /** Learning levels: every caught attempt, per level index (see learning.js). Kept across restarts. */
    this.attempts = levels.map(() => []);
    /** How many times you've been caught on each level (unlocks the glitch). Kept across restarts. */
    this.catches = levels.map(() => 0);
    this.startLevel(0);
  }

  get level() { return this.levels[this.levelIndex]; }
  /** Everything chooseGhostMoves needs for the ghosts' current turn (to run it somewhere else). */
  get ghostSearch() {
    return { state: this.state, lookahead: this.level.lookahead, options: { ...this.searchOptions, weights: this.level.weights, habits: this.habits } };
  }
  /** What learning wardens know about you on this level: { "row,col": "dir" }, or null. */
  get habits() {
    if (!this.level.learns) return null;
    const attempts = this.attempts[this.levelIndex];
    return attempts.length ? habitsFrom(attempts) : null;
  }
  /** How many of your caught attempts the wardens have studied on this level. */
  get attemptsStudied() { return this.level.learns ? this.attempts[this.levelIndex].length : 0; }
  /** Evidence on this level: how many there are and how many you hold. */
  get evidence() { return { total: this.state.keys.length, held: keysHeld(this.state), exitOpen: exitsOpen(this.state) }; }
  get isLastLevel() { return this.levelIndex === this.levels.length - 1; }
  /** Catches needed on this level before the glitch unlocks. */
  get glitchAfter() { return this.level.glitchAfter ?? GLITCH_AFTER; }
  /** True once you've been caught `glitchAfter` times on this level (stays true for this level). */
  get glitchUnlocked() { return this.catches[this.levelIndex] >= this.glitchAfter; }
  /** Can you arm the glitch right now? (Unlocked, not used yet this attempt, and it's your turn.) */
  get glitchReady() {
    return this.glitchUnlocked && !this.glitchUsed && !this.glitchArmed && this.status === "playing" && this.state.turn === "player";
  }
  /** Directions the player can move right now (for disabling buttons, or hints). */
  get availableMoves() {
    if (this.status !== "playing" || this.state.turn !== "player") return [];
    return playerMoves(this.state).map((m) => m.dir);
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
    /** Your moves this attempt, so learning wardens can study them if you're caught. */
    this.currentAttempt = [];
    /** Glitch state for this attempt: armed = your next move freezes the enemies; used = spent. */
    this.glitchArmed = false;
    this.glitchUsed = false;
    return this.state;
  }

  /**
   * Arm the glitch (or disarm it again before you move). Your next move then gets no reply:
   * the enemies lose that turn. Returns true if it's armed afterwards.
   */
  toggleGlitch() {
    if (this.glitchArmed) this.glitchArmed = false;
    else if (this.glitchReady) this.glitchArmed = true;
    return this.glitchArmed;
  }

  restartLevel() { return this.startLevel(this.levelIndex); }

  /** Learning wardens forget everything (e.g. a "reset their data" button). */
  forgetAttempts() { this.attempts[this.levelIndex] = []; }

  // Caught: count it (for the glitch); on a learning level the wardens also keep a record of this attempt.
  recordCatch() {
    this.catches[this.levelIndex]++;
    if (this.level.learns && this.currentAttempt.length) this.attempts[this.levelIndex].push(this.currentAttempt);
    this.currentAttempt = [];
  }

  nextLevel() {
    if (this.status !== "levelComplete") throw new Error("Finish this level first");
    return this.startLevel(this.levelIndex + 1);
  }

  /**
   * The player's turn.
   * @param {Dir} dir
   * @returns {{ event: "blocked" | "locked" | "moved" | "escaped" | "caught" | "notYourTurn", from: object, to: object, status: Status, pickedUp?: boolean }}
   *   locked: tried to step onto the exit before picking up every evidence drive. pickedUp: grabbed a drive.
   *   vent: the vent's number if this move crawled through one (`to` is the grate you came out of).
   */
  playerMove(dir) {
    const from = this.state.player;
    if (this.status !== "playing" || this.state.turn !== "player") {
      return { event: "notYourTurn", from, to: from, status: this.status };
    }
    const move = playerMoves(this.state).find((m) => m.dir === dir);
    if (!move) {
      const locked = !exitsOpen(this.state) && this.state.grid[from.r + (dir === "down") - (dir === "up")]?.[from.c + (dir === "right") - (dir === "left")] === "E";
      return { event: locked ? "locked" : "blocked", from, to: from, status: this.status };
    }

    const heldBefore = keysHeld(this.state);
    this.state = movePlayer(this.state, move);
    this.currentAttempt.push({ r: from.r, c: from.c, dir });
    this.turnNumber++;
    const end = outcome(this.state);
    if (end === "escaped") { this.status = this.isLastLevel ? "gameComplete" : "levelComplete"; this.catches[this.levelIndex] = 0; } // beaten: the glitch locks again
    if (end === "caught") { this.status = "caught"; this.recordCatch(); }
    const pickedUp = keysHeld(this.state) > heldBefore;
    return { event: end ?? "moved", from, to: this.state.player, status: this.status, pickedUp, vent: move.vent ?? null };
  }

  /**
   * The ghosts' turn: they run adversarial search with this level's lookahead and move together.
   * `thinking` holds every team move they considered, its score and the future they predicted.
   * `dirs`, `from` and `to` have one entry per ghost; `dir` is a label like "left" or "left + up".
   * @param {ReturnType<typeof chooseGhostMoves>} [decision] the search result, if it was already worked out
   *   elsewhere (e.g. in a Web Worker so the page stays smooth). See `ghostSearch` for its inputs.
   * If the glitch is armed, the enemies lose this turn instead: event "glitched", nobody moves.
   */
  ghostMove(decision) {
    const from = this.state.ghosts;
    if (this.status !== "playing" || this.state.turn !== "ghost") {
      return { event: "notYourTurn", from, to: from, thinking: null, status: this.status };
    }
    if (this.glitchArmed) {
      // The enemies glitch: they stay where they are and it's your turn again. (Drones don't advance
      // their dash pattern either: the whole turn is lost.)
      this.glitchArmed = false;
      this.glitchUsed = true;
      this.state = { ...this.state, turn: "player" };
      this.lastThinking = null;
      return { event: "glitched", dir: "glitched", dirs: from.map(() => "glitched"), from, to: from, paths: from.map(() => []), thinking: null, status: this.status };
    }
    const { move, thinking } = decision ?? chooseGhostMoves(this.state, this.level.lookahead, this.ghostSearch.options);
    this.state = moveGhosts(this.state, move.to);
    this.lastThinking = thinking;
    if (outcome(this.state) === "caught") {
      this.status = "caught";
      this.recordCatch();
    }
    return {
      event: this.status === "caught" ? "caught" : "moved",
      dir: move.dir,
      dirs: move.dirs,
      from,
      to: this.state.ghosts,
      /** Every tile each enemy passed through (drones can cover two), for animating step by step. */
      paths: move.paths ?? move.to.map((p) => [p]),
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

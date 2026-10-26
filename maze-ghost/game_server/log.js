// log.js — the study logger: records what each student does in Clearpath, for the research paper.
//
// WHAT IS SAVED (Firestore collections; see maze-ghost/research/README.md for every field):
//   participants/{participantId}  first + last name ONLY. Nothing else in the database holds a name.
//   sessions/{sessionId}          one per page load: which participant, test flag, screen size
//   attempts/{attemptId}          one per try at a level: result, every move with what the AI predicted,
//                                 abilities used, wall bumps, timing
//   events/{eventId}              prologue answers, the final decision, skips, level/game completion
//
// The research export (research/export.js) swaps each participantId for a code like P007 and writes the
// name ↔ code key to a separate file, so names never reach the analysis spreadsheets.
//
// SAFETY NETS
//   • Firebase loads in the background (gameLogger.js). If it can't, the game still plays.
//   • Every record waits in localStorage until Firestore confirms it, and is retried on the next load,
//     every 30 s and whenever the network comes back. Records have fixed IDs, so a retry never duplicates.
//   • Ctrl+Shift+L downloads whatever is still unsent on this device as a JSON file (export.js can read it).
//   • Ctrl+Shift+N starts a new player on this device (asks for the next student's name).
//   • ?nolog=1 turns logging off completely (for the team's own testing).
//
// The game calls (all safe to call before anything has loaded):
//   logger.beginSession({ firstName, lastName })   from the name screen
//   logger.startAttempt(level)                     a level starts or restarts
//   logger.ready()                                 the player can move again (for "thinking time")
//   logger.recordMove(dir, context)                a move was made (context: what the AI predicted, etc.)
//   logger.recordBump("wall" | "locked")           a move that didn't happen
//   logger.endAttempt(result, details)             "win" | "death" | "restart" | "menu" | "abandoned"
//   logger.event(type, data, level?)               anything else (prologue answers, the decision, ...)

const params = new URLSearchParams(location.search);
export const LOGGING_ON = params.get("nolog") !== "1";
const GAME_VERSION = "study-2026-10";

const PENDING_KEY = "clearpath_pending_v1";
const PLAYER_KEY = "clearpath_player_v1"; // sessionStorage: survives a refresh, not a new tab
const MAX_MOVES = 2000; // must match firestore.rules
const URL_TEST_FLAGS = ["level", "glitch", "intro", "title", "scene", "at", "res"];

const id = () => (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
const now = () => performance.now();

// ---------------------------------------------------------------- the outbox (localStorage) + sink
let sink = null;
let sinkFailed = false;
let flushing = false;

// The outbox lives in memory and is mirrored to localStorage, so it survives a closed tab. Other tabs on
// the same device share it; that's fine, because a record sent twice is simply refused the second time.
let outbox = [];
try { outbox = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]"); } catch { outbox = []; }

function readPending() {
  try {
    const stored = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
    // Merge in anything another tab added, keeping our own unsaved items.
    const ids = new Set(stored.map((p) => p.id));
    outbox = stored.concat(outbox.filter((p) => !ids.has(p.id)));
  } catch { /* storage unavailable: memory only */ }
  return outbox;
}
function writePending(list) {
  outbox = list;
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(list)); }
  catch (err) { console.warn("Study log: couldn't back up records on this device:", err?.message ?? err); }
}

function enqueue(collection, docId, data) {
  if (!LOGGING_ON) return;
  // JSON round trip: Firestore refuses `undefined`, JSON turns it into null / drops the key.
  const item = { collection, id: docId, data: JSON.parse(JSON.stringify(data)) };
  writePending([...readPending(), item]);
  flush();
}

async function flush() {
  if (!sink || flushing) return;
  flushing = true;
  let offline = false;
  try {
    for (const item of readPending()) {
      try {
        await sink.write(item.collection, item.id, item.data);
        // Saved (or refused for good): take it out of the outbox.
        writePending(readPending().filter((p) => p.id !== item.id));
      } catch (err) {
        console.warn("Study log: will retry later:", err?.message ?? err);
        offline = true;
        break; // probably offline; keep the rest for the next try
      }
    }
  } finally {
    flushing = false;
  }
  // Records added while we were sending: send those too.
  if (!offline && readPending().length) flush();
}

if (LOGGING_ON) {
  import("./gameLogger.js")
    .then((m) => { sink = m; flush(); })
    .catch((err) => {
      sinkFailed = true;
      console.warn("Study log: Firebase didn't load; records are kept on this device (Ctrl+Shift+L downloads them).", err?.message ?? err);
    });
  setInterval(flush, 30_000);
  window.addEventListener("online", flush);
}

/** Download every record this device hasn't managed to send (researcher fallback). */
function downloadPending() {
  const blob = new Blob([JSON.stringify(readPending(), null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `clearpath-unsent-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------------------------------------------------------------- the logger
class StudyLogger {
  constructor() {
    this.player = this.#loadPlayer(); // { participantId } or null
    this.sessionId = id();
    this.sessionStart = now();
    this.sessionOpen = false;
    this.attemptCounts = {}; // level -> attempts so far this session
    this.current = null;
    this.readyAt = now();
    this.test = URL_TEST_FLAGS.some((f) => params.has(f));
    if (this.player) this.#openSession(); // a refresh: same student, new session
  }

  #loadPlayer() {
    try { return JSON.parse(sessionStorage.getItem(PLAYER_KEY) || "null"); } catch { return null; }
  }

  /** True once a student's name has been entered on this tab (or logging is off). */
  get hasPlayer() { return !LOGGING_ON || !!this.player; }

  get #t() { return Math.round(now() - this.sessionStart); }

  /** The name screen: the only place a name is stored, in its own collection. */
  beginSession({ firstName, lastName }) {
    if (!LOGGING_ON) return;
    const participantId = id();
    this.player = { participantId };
    try { sessionStorage.setItem(PLAYER_KEY, JSON.stringify(this.player)); } catch { /* private mode */ }
    enqueue("participants", participantId, {
      firstName: String(firstName).trim().slice(0, 60),
      lastName: String(lastName).trim().slice(0, 60),
      firstSessionId: this.sessionId,
      clientTime: new Date().toISOString(),
    });
    this.#openSession();
  }

  #openSession() {
    if (!LOGGING_ON || this.sessionOpen || !this.player) return;
    this.sessionOpen = true;
    enqueue("sessions", this.sessionId, {
      participantId: this.player.participantId,
      gameVersion: GAME_VERSION,
      test: this.test,
      urlFlags: location.search.slice(0, 200),
      screen: `${screen.width}x${screen.height}`,
      viewport: `${innerWidth}x${innerHeight}`,
      touch: matchMedia?.("(pointer: coarse)").matches ?? false,
      clientTime: new Date().toISOString(),
    });
  }

  #base() {
    return { participantId: this.player?.participantId ?? "none", sessionId: this.sessionId };
  }

  /** Anything that isn't a move: prologue answers, story decisions, skips, completions. */
  event(type, data = {}, level = 0) {
    if (!LOGGING_ON || !this.player) return;
    enqueue("events", id(), { ...this.#base(), type: String(type), level, tMs: this.#t, data, clientTime: new Date().toISOString() });
  }

  /**
   * A level starts or restarts. info: { name, lookahead, learns, attemptsStudied, glitchAvailable,
   * dashHeld, evidenceTotal, enemies, drones } (whatever the game knows).
   * An attempt still open with moves in it is saved as "restart"; one with no moves is dropped.
   */
  startAttempt(level, info = {}) {
    if (this.current) this.endAttempt("restart");
    this.attemptCounts[level] = (this.attemptCounts[level] || 0) + 1;
    this.current = {
      level,
      attemptNumber: this.attemptCounts[level],
      info,
      moves: [],
      wallBumps: 0,
      lockedBumps: 0,
      glitchUses: 0,
      dashUses: 0,
      startedAt: now(),
      firstMoveAt: null,
      startedAtMs: this.#t,
    };
    this.readyAt = now();
  }

  /** The player can act again (a level/briefing opened, or the enemies finished their turn). */
  ready() { this.readyAt = now(); }

  /**
   * One move. ctx (all optional):
   *   aiPredicted   the direction the enemy AI expected you to take ("up" | ... | null)
   *   aiFromHabit   that prediction came from your past attempts (Level 6's learning wardens)
   *   verdict       what the "inside their heads" panel showed for this direction:
   *                 "escape" | "safe" | "risky" | "caught" | null (panel not ready yet)
   *   caughtIn      if verdict is "caught": how many turns until the catch
   *   safeOptions   how many directions the panel showed as safe or escape at that moment
   *   nearestEnemy  tiles (Manhattan) to the closest enemy before the move
   *   ability       "glitch" | "dash" | null
   *   vent          vent number crawled through, or null
   *   pickedUp      picked up an evidence drive
   */
  recordMove(dir, ctx = {}) {
    const a = this.current;
    if (!a) return;
    const t = now();
    if (a.firstMoveAt === null) a.firstMoveAt = t;
    if (ctx.ability === "glitch") a.glitchUses++;
    if (ctx.ability === "dash") a.dashUses++;
    if (a.moves.length >= MAX_MOVES) return;
    a.moves.push({
      dir: String(dir),
      tMs: Math.round(t - a.startedAt),
      thinkMs: Math.round(t - this.readyAt),
      aiPredicted: ctx.aiPredicted ?? null,
      aiFromHabit: !!ctx.aiFromHabit,
      matchedPrediction: ctx.aiPredicted ? ctx.aiPredicted === dir : null,
      verdict: ctx.verdict ?? null,
      caughtIn: ctx.caughtIn ?? null,
      safeOptions: ctx.safeOptions ?? null,
      nearestEnemy: ctx.nearestEnemy ?? null,
      ability: ctx.ability ?? null,
      vent: ctx.vent ?? null,
      pickedUp: !!ctx.pickedUp,
    });
  }

  /** A move that didn't happen: into a wall, or onto the exit while it's still locked. */
  recordBump(kind) {
    if (!this.current) return;
    if (kind === "locked") this.current.lockedBumps++;
    else this.current.wallBumps++;
  }

  /**
   * End the attempt. result: "win" | "death" | "restart" | "menu" | "abandoned".
   * details: { endPosition: {x, y}, caughtBy: "warden" | "drone", evidenceHeld }
   * Attempts that ended without a single move (e.g. a restart straight away) aren't saved.
   */
  endAttempt(result, details = {}) {
    const a = this.current;
    if (!a) return;
    this.current = null;
    if (!LOGGING_ON || !this.player) return;
    if (a.moves.length === 0 && result !== "win" && result !== "death") return;

    const end = now();
    const predicted = a.moves.filter((m) => m.aiPredicted);
    const judged = a.moves.filter((m) => m.verdict);
    enqueue("attempts", id(), {
      ...this.#base(),
      level: a.level,
      attemptNumber: a.attemptNumber,
      result,
      caughtBy: details.caughtBy ?? null,
      moveCount: a.moves.length,
      moves: a.moves,
      wallBumps: a.wallBumps,
      lockedBumps: a.lockedBumps,
      glitchUses: a.glitchUses,
      dashUses: a.dashUses,
      // Handy summaries (the raw moves above are the source of truth):
      predictedMoves: predicted.length,
      matchedPredictions: predicted.filter((m) => m.matchedPrediction).length,
      judgedMoves: judged.length,
      movesIntoCatch: judged.filter((m) => m.verdict === "caught").length,
      avoidableCatchMoves: judged.filter((m) => m.verdict === "caught" && m.safeOptions > 0).length,
      evidenceHeld: details.evidenceHeld ?? null,
      endPosition: details.endPosition ?? null,
      levelInfo: a.info,
      durationSec: Math.round((end - a.startedAt) / 1000),
      activeSec: a.firstMoveAt === null ? 0 : Math.round((end - a.firstMoveAt) / 1000),
      startedAtMs: a.startedAtMs,
      clientTime: new Date().toISOString(),
    });
  }

  /** Researcher shortcut: next student on this device. */
  newPlayer() {
    if (this.current?.moves.length) this.endAttempt("abandoned");
    try { sessionStorage.removeItem(PLAYER_KEY); } catch { /* ignore */ }
    location.reload();
  }
}

export const logger = new StudyLogger();
window.studyLogger = logger; // handy in the browser console while testing

// Closing the tab mid-level: save what they did (the outbox keeps it until it can be sent).
window.addEventListener("pagehide", () => {
  if (logger.current?.moves.length) logger.endAttempt("abandoned");
});

window.addEventListener("keydown", (e) => {
  if (!e.ctrlKey || !e.shiftKey) return;
  const k = e.key.toLowerCase();
  if (k === "l") { e.preventDefault(); e.stopImmediatePropagation(); downloadPending(); }
  if (k === "n") { e.preventDefault(); e.stopImmediatePropagation(); if (confirm("Start a new player on this device?")) logger.newPlayer(); }
}, true);

/** For the name screen / debugging: is Firestore reachable, and how many records are waiting? */
export const logStatus = () => ({ on: LOGGING_ON, connected: !!sink, failed: sinkFailed, unsent: readPending().length });

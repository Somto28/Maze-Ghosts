// research/export.js — download the study data from Firestore and turn it into anonymized CSV files.
//
//   node maze-ghost/research/export.js                      # everything, test sessions left out
//   node maze-ghost/research/export.js --include-tests      # keep sessions started with ?level=, ?glitch=, ...
//   node maze-ghost/research/export.js --extra a.json b.json   # also read "unsent" files saved with Ctrl+Shift+L
//   node maze-ghost/research/export.js --since 2026-11-03   # only records from that day on (drops your own testing)
//   node maze-ghost/research/export.js --offline --extra a.json   # no Firestore at all: just the saved files
//   node maze-ghost/research/export.js --purge-names --yes  # AFTER a good export: delete the names from Firestore
//
// Needs a service-account key (Firebase console → Project settings → Service accounts → Generate new
// private key) saved as serviceAccount.json at the repo root (it's in .gitignore), or pointed to by
// GOOGLE_APPLICATION_CREDENTIALS. With FIRESTORE_EMULATOR_HOST set it reads the local emulator instead.
//
// Output (maze-ghost/research/output/, ignored by git):
//   PRIVATE_participant_key.csv   code ↔ name. Keep it off GitHub and out of the paper. The ONLY file with names.
//   students.csv    one row per student: the headline numbers
//   levels.csv      one row per student per level
//   attempts.csv    one row per attempt
//   moves.csv       one row per move (with the AI's prediction and the compass verdict)
//   answers.csv     prologue answers
//   decisions.csv   the final-cutscene decision
//   sessions.csv    one row per page load
// Every file except the key uses codes like P007 instead of names or database IDs.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const extraFiles = (() => { const i = args.indexOf("--extra"); return i < 0 ? [] : args.slice(i + 1).filter((a) => !a.startsWith("--")); })();
const OUT = path.join(here, "output");
const OFFLINE = flag("--offline");
const SINCE = (() => { const i = args.indexOf("--since"); return i < 0 ? "" : args[i + 1]; })();
const PROJECT_ID = "clearpath-3fb96";

// ---------------------------------------------------------------- connect
function connect() {
  if (process.env.FIRESTORE_EMULATOR_HOST) return initializeApp({ projectId: PROJECT_ID });
  const keyFile = [process.env.GOOGLE_APPLICATION_CREDENTIALS, path.join(here, "../../serviceAccount.json")].find((f) => f && fs.existsSync(f));
  if (!keyFile) {
    console.error("No service-account key found. Save it as serviceAccount.json at the repo root (see the top of this file).");
    process.exit(1);
  }
  return initializeApp({ credential: process.env.GOOGLE_APPLICATION_CREDENTIALS ? applicationDefault() : cert(JSON.parse(fs.readFileSync(keyFile, "utf8"))), projectId: PROJECT_ID });
}
if (!OFFLINE) connect();
const db = OFFLINE ? null : getFirestore();

async function load(name) {
  if (OFFLINE) return [];
  const snap = await db.collection(name).get();
  return snap.docs.map((d) => {
    const data = d.data();
    return { id: d.id, ...data, createdAt: data.createdAt?.toDate?.().toISOString() ?? data.createdAt ?? data.clientTime };
  });
}

// ---------------------------------------------------------------- CSV
const cell = (v) => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") v = JSON.stringify(v);
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function writeCsv(file, rows, columns = rows.length ? Object.keys(rows[0]) : []) {
  const text = [columns.join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))].join("\n");
  fs.writeFileSync(path.join(OUT, file), text + "\n");
  console.log(`  ${file.padEnd(30)} ${rows.length} rows`);
}
const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : "");
const sum = (xs, f) => xs.reduce((n, x) => n + (f(x) || 0), 0);

// ---------------------------------------------------------------- main
const [participants, sessions, attemptsRaw, eventsRaw] = await Promise.all(["participants", "sessions", "attempts", "events"].map(load));

// Records that never reached Firestore but were saved on a device with Ctrl+Shift+L.
for (const file of extraFiles) {
  const items = JSON.parse(fs.readFileSync(file, "utf8"));
  const lists = { participants, sessions, attempts: attemptsRaw, events: eventsRaw };
  let added = 0;
  for (const it of items) {
    const list = lists[it.collection];
    if (list && !list.some((x) => x.id === it.id)) { list.push({ id: it.id, ...it.data, createdAt: it.data.clientTime }); added++; }
  }
  console.log(`Read ${added} extra records from ${file}`);
}

// One code per student. Same name typed in two tabs (or after a crash) = same student.
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, " ").trim();
const testSessions = new Set(sessions.filter((s) => s.test).map((s) => s.id));
// Older records from before the study logger (no participantId) and anything before --since are left out.
const keep = (r) => !!r.participantId && String(r.createdAt) >= SINCE && (flag("--include-tests") || !testSessions.has(r.sessionId));

const byName = new Map();
for (const p of participants.filter((p) => String(p.createdAt) >= SINCE).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))) {
  const key = `${norm(p.firstName)}|${norm(p.lastName)}`;
  if (!byName.has(key)) byName.set(key, { firstName: p.firstName, lastName: p.lastName, ids: [], firstSeen: p.createdAt });
  byName.get(key).ids.push(p.id);
}
const codeOf = new Map(); // participantId -> P001
const key = [];
[...byName.values()].forEach((person, i) => {
  const code = `P${String(i + 1).padStart(3, "0")}`;
  for (const pid of person.ids) codeOf.set(pid, code);
  key.push({ code, firstName: person.firstName, lastName: person.lastName, firstSeen: person.firstSeen, participantIds: person.ids.join(" ") });
});
const code = (pid) => codeOf.get(pid) ?? "UNKNOWN";

// Session numbers per student (S1, S2, ... in time order), so sessions can be told apart without IDs.
const sessionNo = new Map();
const sessionsByStudent = {};
for (const s of [...sessions].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))) {
  const c = code(s.participantId);
  sessionsByStudent[c] = (sessionsByStudent[c] ?? 0) + 1;
  sessionNo.set(s.id, sessionsByStudent[c]);
}

const attempts = attemptsRaw.filter(keep).sort((a, b) =>
  code(a.participantId).localeCompare(code(b.participantId)) || (sessionNo.get(a.sessionId) ?? 0) - (sessionNo.get(b.sessionId) ?? 0) || a.startedAtMs - b.startedAtMs);
const events = eventsRaw.filter(keep);

fs.mkdirSync(OUT, { recursive: true });
console.log(`\n${key.length} students, ${sessions.length} sessions (${testSessions.size} test), ${attempts.length} attempts, ${events.length} events\nWriting ${OUT}:`);

writeCsv("PRIVATE_participant_key.csv", key);

writeCsv("sessions.csv", sessions.filter((s) => keep({ ...s, sessionId: s.id })).map((s) => ({
  student: code(s.participantId), session: sessionNo.get(s.id), group: s.group ?? "", startedAt: s.createdAt, test: s.test,
  screen: s.screen, viewport: s.viewport, touch: s.touch, urlFlags: s.urlFlags, gameVersion: s.gameVersion,
})));

// Attempt order within each student + level (1st try, 2nd try, ... across sessions).
const tryNo = new Map();
const counter = {};
for (const a of attempts) {
  const k = `${code(a.participantId)}|${a.level}`;
  counter[k] = (counter[k] ?? 0) + 1;
  tryNo.set(a.id, counter[k]);
}

writeCsv("attempts.csv", attempts.map((a) => ({
  student: code(a.participantId), session: sessionNo.get(a.sessionId), group: a.group ?? "", level: a.level, levelName: a.levelInfo?.name,
  attemptOnLevel: tryNo.get(a.id), result: a.result, caughtBy: a.caughtBy, moveCount: a.moveCount,
  wallBumps: a.wallBumps, lockedBumps: a.lockedBumps, glitchUses: a.glitchUses, dashUses: a.dashUses,
  glitchAvailable: a.levelInfo?.glitchAvailable, dashHeld: a.levelInfo?.dashHeld,
  predictedMoves: a.predictedMoves, matchedPredictions: a.matchedPredictions, predictionMatchPct: pct(a.matchedPredictions, a.predictedMoves),
  judgedMoves: a.judgedMoves, movesIntoCatch: a.movesIntoCatch, avoidableCatchMoves: a.avoidableCatchMoves,
  avgThinkMs: a.moves?.length ? Math.round(sum(a.moves, (m) => m.thinkMs) / a.moves.length) : "",
  evidenceHeld: a.evidenceHeld, evidenceTotal: a.levelInfo?.evidenceTotal,
  lookahead: a.levelInfo?.lookahead, learns: a.levelInfo?.learns, attemptsStudied: a.levelInfo?.attemptsStudied,
  durationSec: a.durationSec, activeSec: a.activeSec, endX: a.endPosition?.x, endY: a.endPosition?.y, startedAt: a.createdAt,
})));

const moveRows = [];
for (const a of attempts) {
  (a.moves ?? []).forEach((m, i) => moveRows.push({
    student: code(a.participantId), level: a.level, attemptOnLevel: tryNo.get(a.id), result: a.result, moveNo: i + 1,
    dir: m.dir, tMs: m.tMs, thinkMs: m.thinkMs, aiPredicted: m.aiPredicted, matchedPrediction: m.matchedPrediction, aiFromHabit: m.aiFromHabit,
    verdict: m.verdict, caughtIn: m.caughtIn, safeOptions: m.safeOptions, nearestEnemy: m.nearestEnemy,
    ability: m.ability, vent: m.vent, pickedUp: m.pickedUp,
  }));
}
writeCsv("moves.csv", moveRows);

const ev = (type) => events.filter((e) => e.type === type);
writeCsv("answers.csv", ev("prologue_answer").map((e) => ({
  student: code(e.participantId), questionId: e.data.questionId, kind: e.data.kind, choice: e.data.choiceLetter,
  choiceText: e.data.choiceText, correct: e.data.correct, responseMs: e.data.responseMs, question: e.data.question,
})).sort((a, b) => a.student.localeCompare(b.student) || a.questionId.localeCompare(b.questionId)));

writeCsv("decisions.csv", ev("story_decision").map((e) => ({
  student: code(e.participantId), scene: e.data.scene, firstChoice: e.data.firstChoice, finalChoice: e.data.finalChoice,
  rewound: e.data.rewound, skipped: e.data.skipped, picks: (e.data.picks ?? []).join(" > "),
})));

// ---------------------------------------------------------------- per student + level
const levelRows = [];
const studentRows = [];
for (const { code: c } of key) {
  const mine = attempts.filter((a) => code(a.participantId) === c);
  const myEvents = events.filter((e) => code(e.participantId) === c);
  const levelsPlayed = [...new Set(mine.map((a) => a.level))].sort((x, y) => x - y);

  for (const level of levelsPlayed) {
    const tries = mine.filter((a) => a.level === level);
    const winIdx = tries.findIndex((a) => a.result === "win");
    const first = tries[0], last = tries[tries.length - 1];
    levelRows.push({
      student: c, level, attempts: tries.length, completed: winIdx >= 0,
      attemptsToWin: winIdx >= 0 ? winIdx + 1 : "",
      deaths: tries.filter((a) => a.result === "death").length,
      restarts: tries.filter((a) => a.result === "restart").length,
      deathsBeforeWin: winIdx >= 0 ? tries.slice(0, winIdx).filter((a) => a.result === "death").length : "",
      movesInWinningAttempt: winIdx >= 0 ? tries[winIdx].moveCount : "",
      totalMoves: sum(tries, (a) => a.moveCount),
      wallBumps: sum(tries, (a) => a.wallBumps),
      glitchUses: sum(tries, (a) => a.glitchUses), dashUses: sum(tries, (a) => a.dashUses),
      predictionMatchPct: pct(sum(tries, (a) => a.matchedPredictions), sum(tries, (a) => a.predictedMoves)),
      firstAttemptMatchPct: pct(first.matchedPredictions, first.predictedMoves),
      lastAttemptMatchPct: pct(last.matchedPredictions, last.predictedMoves),
      avoidableCatchMovePct: pct(sum(tries, (a) => a.avoidableCatchMoves), sum(tries, (a) => a.judgedMoves)),
      firstAttemptAvoidablePct: pct(first.avoidableCatchMoves, first.judgedMoves),
      lastAttemptAvoidablePct: pct(last.avoidableCatchMoves, last.judgedMoves),
      timeSec: sum(tries, (a) => a.durationSec),
    });
  }

  const answers = myEvents.filter((e) => e.type === "prologue_answer");
  const latest = new Map(); // a question answered twice (the prologue replayed): keep the FIRST answer
  for (const a of answers.sort((x, y) => String(x.createdAt).localeCompare(String(y.createdAt)))) if (!latest.has(a.data.questionId)) latest.set(a.data.questionId, a);
  const comp = [...latest.values()].filter((a) => a.data.kind === "comprehension");
  const decision = myEvents.find((e) => e.type === "story_decision" && e.data.scene === "decision");
  const allMoves = mine.flatMap((a) => a.moves ?? []);
  const half = Math.floor(allMoves.length / 2);
  const early = allMoves.slice(0, half), late = allMoves.slice(half);
  const matchPct = (ms) => pct(ms.filter((m) => m.matchedPrediction).length, ms.filter((m) => m.aiPredicted).length);
  const avoidPct = (ms) => pct(ms.filter((m) => m.verdict === "caught" && m.safeOptions > 0).length, ms.filter((m) => m.verdict).length);
  studentRows.push({
    student: c,
    group: [...new Set(sessions.filter((s) => code(s.participantId) === c).map((s) => s.group).filter(Boolean))].join(" "),
    sessions: sessionsByStudent[c] ?? 0,
    levelsCompleted: levelRows.filter((r) => r.student === c && r.completed).length,
    gameCompleted: myEvents.some((e) => e.type === "game_complete"),
    usedLevelSelect: myEvents.some((e) => e.type === "menu_choice" && e.data.mode === "level"),
    totalAttempts: mine.length,
    totalDeaths: mine.filter((a) => a.result === "death").length,
    totalMoves: allMoves.length,
    glitchUses: sum(mine, (a) => a.glitchUses), dashUses: sum(mine, (a) => a.dashUses),
    prologueCorrect: comp.filter((a) => a.data.correct).length, prologueComprehensionAnswered: comp.length,
    ethicsQ5: latest.get("q5")?.data.choiceLetter ?? "", ethicsQ6: latest.get("q6")?.data.choiceLetter ?? "",
    finalDecisionFirstChoice: decision?.data.firstChoice ?? "",
    predictionMatchPctFirstHalf: matchPct(early), predictionMatchPctSecondHalf: matchPct(late),
    avoidableCatchPctFirstHalf: avoidPct(early), avoidableCatchPctSecondHalf: avoidPct(late),
    playTimeSec: sum(mine, (a) => a.durationSec),
  });
}
writeCsv("levels.csv", levelRows);
writeCsv("students.csv", studentRows);

// ---------------------------------------------------------------- optional: delete the names
if (flag("--purge-names") && !OFFLINE) {
  if (!flag("--yes")) {
    console.log("\n--purge-names needs --yes as well. Check PRIVATE_participant_key.csv first: after this, it's the only copy of the names.");
  } else {
    for (let i = 0; i < participants.length; i += 400) { // a batch holds at most 500 writes
      const batch = db.batch();
      participants.slice(i, i + 400).forEach((p) => batch.delete(db.collection("participants").doc(p.id)));
      await batch.commit();
    }
    console.log(`\nDeleted ${participants.length} name records from Firestore. The key file is now the only copy.`);
  }
}
console.log("\nDone. Don't commit or share PRIVATE_participant_key.csv.");
process.exit(0);

// log.js — a safe front door to gameLogger.js (Firestore gameplay logging).
//
// gameLogger.js loads Firebase from Google's CDN. If that can't load (offline, a school network that
// blocks it, or Firebase not configured yet), a normal `import` of it would stop the whole game from
// starting. This file loads it in the background instead: calls made before it's ready are queued, and
// if it never loads, logging is simply off and the game plays normally.
//
//   import { logger } from "./log.js";
//   logger.startAttempt(levelId);   // levelId is 1-6 (firestore.rules only accepts 1-6)
//   logger.recordMove("up");
//   logger.recordAnswer("q1", "B", true);
//   logger.endAttempt("win" | "death", { x, y });

let real = null;
let failed = false;
const queue = [];

import("./gameLogger.js")
  .then((m) => {
    real = m.logger;
    for (const [method, args] of queue.splice(0)) real[method](...args);
  })
  .catch((err) => {
    failed = true;
    queue.length = 0;
    console.warn("Gameplay logging is off (gameLogger.js didn't load):", err?.message ?? err);
  });

const call = (method) => (...args) => {
  if (real) return real[method](...args);
  if (!failed && queue.length < 5000) queue.push([method, args]);
};

export const logger = {
  startAttempt: call("startAttempt"),
  recordAnswer: call("recordAnswer"),
  recordMove: call("recordMove"),
  endAttempt: call("endAttempt"),
};

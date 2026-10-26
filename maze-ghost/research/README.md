# Clearpath study data

How the game records each student's play, and how to turn it into anonymized spreadsheets for the paper.

## Before study day

1. **Deploy the rules.** From `clearpath/`: `firebase deploy --only firestore:rules`. The game can't save anything until the new rules are live.
2. **Run one full test** with your own name, then check the Firestore console: you should see `participants`, `sessions`, `attempts` and `events`.
3. **Note the date of study day.** Export with `--since <that date>` so your own testing is left out.

When the team is just testing, add `?nolog=1` to the URL and nothing is saved. Any URL with `?level=`, `?glitch=`, `?intro=`, `?title=` or `?scene=` is marked `test: true` and left out of the export unless you pass `--include-tests`.

## On study day

- Each student starts on the **name screen** (first + last name). A refresh keeps the same student; a new tab asks again.
- **One link per class period:** add `?group=periodA` (letters, numbers, `-`, `_`). Every record from that tab is tagged with it, and the export has a `group` column. It doesn't mark the session as a test.
- **Is this device saving?** Press **Ctrl+Shift+S**: it shows whether the database is connected and how many records are waiting.
- **Next student on the same Chromebook:** close the tab and open a new one, or press **Ctrl+Shift+N**.
- **If the school network blocks Firebase,** the game still runs and every record waits on the device. It sends them automatically once the network allows it. As a backup, press **Ctrl+Shift+L** on each device before you leave: it downloads the unsent records as a JSON file that the export script can read.

## After study day: export

1. Firebase console → Project settings → Service accounts → **Generate new private key**. Save it as `serviceAccount.json` at the repo root (it's git-ignored). Don't share it.
2. From the repo root: `npm install`, then:

   ```
   node maze-ghost/research/export.js --since 2026-11-03
   ```

   Add `--extra file1.json file2.json` for any Ctrl+Shift+L files.
3. The CSVs land in `maze-ghost/research/output/` (git-ignored). Every file uses codes like `P007` instead of names, except `PRIVATE_participant_key.csv`. Keep that file off GitHub, out of shared drives you don't control, and out of the paper.
4. Once you've checked the key file, you can delete the names from Firestore:

   ```
   node maze-ghost/research/export.js --purge-names --yes
   ```

If a student typed their name in two tabs, both are merged into one code (same first + last name, ignoring capitals and accents).

## Don't replace `gameLogger.js`

`log.js` decides what's recorded and loads `gameLogger.js` only to send records to Firestore through its `write()` function. If that file is swapped for a different logger, nothing reaches the database (records pile up on each device instead). To change what's recorded, edit `log.js` and `clearpath/firestore.rules` together, then redeploy the rules.

## What's recorded

| Collection | One record per | What's in it |
|---|---|---|
| `participants` | student (per tab where a name was entered) | first name, last name. **The only place names exist.** |
| `sessions` | page load | participant ID, test flag, screen size, touch or not |
| `attempts` | try at a level | result, every move (below), wall bumps, Glitch/Dash uses, timing |
| `events` | everything else | prologue answers, prologue skipped, final decision, menu choice, level/game completed |

**Level numbers changed on 26 Oct 2026.** The game went from six levels to five when the Data Vault was cut, so the Archive is now Level 4 and the Uplink Level 5. Sessions saved before that have `gameVersion` `study-2026-10` (Archive = 5, Uplink = 6); later ones have `study-2026-10-5levels`. If both are in the data, compare levels by `levelName` (in `attempts.csv`), not by number.

### Each attempt

`result` is `win`, `death`, `restart` (pressed R), `menu` (left to the menu) or `abandoned` (closed the tab mid-level). Attempts with zero moves aren't saved. Also: `caughtBy` (warden/drone), `moveCount`, `wallBumps`, `lockedBumps` (tried the exit before collecting evidence), `glitchUses`, `dashUses`, `durationSec` (including reading the briefing), `activeSec` (first move to the end), and `levelInfo` (lookahead, whether the wardens learn, whether the Glitch/Dash were available).

### Each move

| Field | Meaning |
|---|---|
| `dir` | up / down / left / right |
| `thinkMs` | time since the player could move: how long they deliberated |
| `aiPredicted` | the move the Warden AI expected them to make (the "expected" tag on the compass) |
| `matchedPrediction` | did they do what the AI predicted? |
| `aiFromHabit` | the prediction came from their earlier attempts (Level 5, the Uplink) |
| `verdict` | what the compass showed for that direction: `escape`, `safe`, `risky`, `caught`, or empty if it hadn't loaded yet |
| `safeOptions` | how many directions were not `caught` at that moment |
| `nearestEnemy` | tiles to the closest enemy before the move |
| `ability` | `glitch` or `dash` if used on this move |
| `vent`, `pickedUp` | crawled through a vent / picked up an evidence drive |

`verdict = caught` while `safeOptions > 0` is an **avoidable catch move**: the game showed a safe way and they walked into the AI's catch anyway.

## Measures that speak to learning

These are computed in `levels.csv` and `students.csv`:

- **Prediction match rate** (`predictionMatchPct`, first vs last attempt, first vs second half of play). If students learn how the AI predicts, they should increasingly *not* do what it expects. A falling match rate is direct evidence they're reading and countering the prediction.
- **Avoidable catch rate**: moves into a shown catch when a safe option existed. Should fall as they learn to read the compass.
- **Attempts / deaths to clear each level**, especially Level 1 (reactive, lookahead 1) vs Level 2+ (predicts 3 ahead). Clearing the predicting levels in few tries shows they adapted to lookahead.
- **Thinking time** (`thinkMs`): longer pauses near enemies suggest planning ahead rather than reacting.
- **Glitch timing**: was it used with an enemy close (`nearestEnemy` ≤ 2)? Using it at the right moment shows they understand the AI assumes it always gets a reply.
- **Prologue comprehension (q1–q4)** and **ethics answers (q5–q6)**, plus the **final decision's first choice** (`escape` is what the Wardens predicted; `upload` is the move they didn't expect).

The prologue questions come right after the ad teaches each idea, so they show immediate comprehension, not learning from the maze itself. For a pre/post comparison, ask the same kind of questions again at the end (a short in-game quiz or a paper exit ticket keyed by the same P-codes).

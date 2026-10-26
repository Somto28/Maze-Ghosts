// name-entry.js — the first screen: the student types their first and last name.
//
// The name goes to its own Firestore collection (participants) and nowhere else; every gameplay record
// carries only a random participant ID. The research export swaps that ID for a code like P007.
//
//   import { askForName } from "./name-entry.js";
//   await askForName();   // resolves once a name is entered (straight away if one already was on this tab)
//
// While it's open it swallows every key except typing, so the maze underneath can't move.

import { logger, LOGGING_ON } from "./log.js";

const CSS = `
.name-entry { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 16px;
  background: radial-gradient(ellipse at 50% 30%, #12233a 0%, #06090f 70%); color: #e8eef8; }
.name-entry form { width: min(420px, 100%); padding: 28px 26px 24px; border-radius: 14px;
  background: rgba(10, 14, 22, 0.92); border: 1px solid rgba(90, 176, 255, 0.35); box-shadow: 0 0 40px rgba(90, 176, 255, 0.12); }
.name-entry .ne-brand { margin: 0; font: 400 15px/1 "Silkscreen", ui-monospace, monospace; letter-spacing: 3px; color: #5ab0ff; }
.name-entry h1 { margin: 8px 0 6px; font: 800 26px/1.15 "Manrope", system-ui, sans-serif; }
.name-entry p.ne-sub { margin: 0 0 20px; color: #93a3bb; font-size: 14px; line-height: 1.45; }
.name-entry label { display: block; margin: 0 0 14px; font: 600 12px/1 "JetBrains Mono", ui-monospace, monospace; letter-spacing: 1px; text-transform: uppercase; color: #93a3bb; }
.name-entry input { display: block; width: 100%; margin-top: 7px; padding: 11px 12px; border-radius: 9px;
  border: 1px solid rgba(255, 255, 255, 0.16); background: #0b111b; color: #e8eef8; font: 500 17px/1.2 system-ui, sans-serif; }
.name-entry input:focus { outline: none; border-color: #5ab0ff; box-shadow: 0 0 0 3px rgba(90, 176, 255, 0.25); }
.name-entry button { width: 100%; margin-top: 6px; padding: 12px; border: 0; border-radius: 10px; background: #5ab0ff; color: #04121f;
  font: 700 16px/1 "Manrope", system-ui, sans-serif; cursor: pointer; }
.name-entry button:disabled { opacity: 0.45; cursor: default; }
.name-entry .ne-err { min-height: 1.3em; margin: 2px 0 6px; color: #ff8a98; font-size: 13px; }
.name-entry .ne-note { margin: 16px 0 0; color: #6f7f96; font-size: 12px; line-height: 1.4; }
`;

let open = false;
export const nameEntryActive = () => open;

export function askForName() {
  if (logger.hasPlayer || !LOGGING_ON) return Promise.resolve();
  open = true;
  return new Promise((resolve) => {
    const style = document.createElement("style");
    style.textContent = CSS;
    const root = document.createElement("div");
    root.className = "name-entry";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "Enter your name");
    root.innerHTML = `
      <form novalidate autocomplete="off">
        <p class="ne-brand">CLEARPATH</p>
        <h1>Before you start</h1>
        <p class="ne-sub">Type your first and last name so we can match your game to you.</p>
        <label>First name<input name="first" maxlength="40" required autocapitalize="words" spellcheck="false"></label>
        <label>Last name<input name="last" maxlength="40" required autocapitalize="words" spellcheck="false"></label>
        <p class="ne-err" aria-live="polite"></p>
        <button type="submit">Start</button>
        <p class="ne-note">Only the research team sees your name. It's replaced with a code number before anything is written up.</p>
      </form>`;
    document.head.appendChild(style);
    document.body.appendChild(root);

    const form = root.querySelector("form");
    const first = form.elements.first, last = form.elements.last, err = root.querySelector(".ne-err");
    const clean = (s) => s.replace(/\s+/g, " ").trim();
    // Letters (any language), spaces, hyphens, apostrophes and periods.
    const valid = (s) => /^[\p{L}][\p{L}\p{M} .'’-]{0,39}$/u.test(s);

    // Keep keys away from the maze (arrows/WASD would move the player), but let typing through.
    const swallow = (e) => {
      if (e.ctrlKey && e.shiftKey) return; // researcher shortcuts in log.js
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", swallow, true);

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const f = clean(first.value), l = clean(last.value);
      if (!f || !l) { err.textContent = "Please type both your first and last name."; (f ? last : first).focus(); return; }
      if (!valid(f) || !valid(l)) { err.textContent = "Names can only use letters, spaces, hyphens and apostrophes."; return; }
      logger.beginSession({ firstName: f, lastName: l });
      window.removeEventListener("keydown", swallow, true);
      open = false;
      root.remove();
      style.remove();
      resolve();
    });
    setTimeout(() => first.focus(), 0);
  });
}

// quality.js — keeps the game smooth by lowering the render resolution when frames get slow.
//
// Drawing cost is mostly "how many pixels", so resolution is the most effective dial. Every
// ~3/4 second it looks at the average frame time:
//   slower than SLOW_MS  -> drop one step, and never go back up to the step that was too slow
//   faster than GOOD_MS for a few checks in a row -> try one step sharper
// The chosen step is remembered on this device, so the next visit starts at the right quality.

const STEPS = [2, 1.5, 1.25, 1, 0.85, 0.7]; // render pixels per CSS pixel
const SLOW_MS = 21; // below ~48 fps
const GOOD_MS = 17.5; // a steady 60 fps (or better on 120 Hz screens)
const WINDOW = 45; // frames per check
const KEY = "maze-ghost-quality";

/**
 * @param {{ maxRatio: number, onChange: (ratio: number) => void, fixed?: number }} options
 *   fixed: always render at this ratio and never adapt (for testing).
 */
export function createQuality({ maxRatio, onChange, fixed }) {
  if (fixed) maxRatio = fixed;
  const steps = [...new Set([maxRatio, ...STEPS.filter((s) => s < maxRatio)])];
  // First visit: start at 1.5x at most; a fast device climbs from there.
  let step = fixed ? 0 : Math.min(load() ?? steps.findIndex((s) => s <= 1.5), steps.length - 1);
  let best = 0; // sharpest step we may still try
  let frames = 0, total = 0, goodChecks = 0, last = 0, fps = 0;

  function set(next) {
    step = next;
    goodChecks = 0;
    save(step);
    onChange(steps[step]);
  }

  return {
    get ratio() { return steps[step]; },
    get fps() { return fps; },
    /** True on the lower steps, where the scene should also skip some expensive extras. */
    get low() { return steps[step] < 1; },

    /** Call once per frame with the animation-frame timestamp. */
    frame(now) {
      const dt = now - last;
      last = now;
      if (!(dt > 0) || dt > 100) return; // first frame, a hidden tab, or a one-off hitch (loading a level)
      frames++;
      total += dt;
      if (frames < WINDOW) return;
      const avg = total / frames;
      fps = Math.round(1000 / avg);
      frames = total = 0;
      if (fixed) return;
      if (avg > SLOW_MS && step < steps.length - 1) {
        best = Math.max(best, step + 1);
        set(step + 1);
      } else if (avg < GOOD_MS && step > best && ++goodChecks >= 6) {
        set(step - 1);
      }
    },

    /** Forget the current measurement window (after loading a level, which causes one slow frame). */
    reset() { frames = total = 0; last = 0; },
    start() { onChange(steps[step]); },
  };
}

function load() {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === null ? null : Number(saved) || 0;
  } catch { return null; }
}
function save(step) {
  try { localStorage.setItem(KEY, String(step)); } catch {}
}

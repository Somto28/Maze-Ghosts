// describe.js — plain-language descriptions of a level's enemies, shared by the HUD and the menu.

import { parseMaze, ventPairs } from "./maze.js";

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const cap = (s) => s.replace(/^./, (ch) => ch.toUpperCase());

/** How a drone's dash pattern reads: [2] "dashes 2 tiles every turn", [2, 0] "dashes 2 tiles, then recharges". */
export function droneRule(pattern = [2]) {
  if (pattern.length === 1) return `dashes ${plural(pattern[0], "tile")} every turn`;
  if (pattern.length === 2 && pattern[1] === 0) return `dashes ${plural(pattern[0], "tile")}, then recharges for a turn`;
  return `moves ${pattern.join(", then ")} tiles, repeating`;
}

/**
 * @param {{ maze: readonly string[], lookahead: number, enemy?: string, dronePattern?: number[], learns?: boolean }} level
 * @returns {{ wardens: number, drones: number, evidence: number, vents: boolean, name: string, line: string, short: string }}
 *   name: what to call the enemies ("ghost", "wardens"...). line: one HUD-sized sentence. short: for the level menu.
 */
export function describeLevel(level) {
  const { roles, keys, grid } = parseMaze(level.maze);
  const wardens = roles.filter((r) => r === "warden").length;
  const drones = roles.length - wardens;
  const one = level.enemy ?? "ghost";
  const moves = plural(level.lookahead, "move");
  const ventCount = ventPairs(grid).length;
  const vents = ventCount > 0;

  const parts = [];
  if (wardens > 1) parts.push(`${wardens} ${one}s plan together, ${moves} ahead`);
  else if (wardens === 1) parts.push(`${cap(one)} looks ${moves} ahead`);
  if (drones) parts.push(`${drones > 1 ? `${drones} drones` : "Drone"} ${droneRule(level.dronePattern)}`);
  if (level.learns) parts.push(`${wardens > 1 ? "they" : "it"} learn${wardens > 1 ? "" : "s"} from your attempts`);

  const extras = [drones && plural(drones, "drone"), ventCount && plural(ventCount, "vent"), keys.length && plural(keys.length, "evidence drive"), level.learns && "learns from you"].filter(Boolean);
  const short = `${wardens > 1 ? `${wardens} ${one}s` : `1 ${one}`}, ${moves} ahead${extras.length ? ` · ${extras.join(" · ")}` : ""}`;

  return { wardens, drones, evidence: keys.length, vents, name: wardens > 1 || (drones && wardens) ? `${one}s` : one, line: parts.join(" · "), short };
}

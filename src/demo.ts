import { type AccentId, intentForTension, type MusicIntent } from "./music/driver.ts";

export interface DemoStep {
  /** Offset from the start of the arc, in milliseconds. */
  atMs: number;
  /** Caption shown on the page (and the conceptual dev event). */
  label: string;
  /** Target tension for this beat of the arc. */
  tension: number;
  /** One-shot hit to fire on this beat. */
  accent?: AccentId;
  /** Show the branded "npx buildbeat" end card on this beat (for the clip). */
  endcard?: boolean;
}

/** The reproducible launch-clip arc. This is the product: calm -> a type error
 * darkens it -> tests FAIL and it goes tense -> git commit resolves it. Driving
 * the page from this fixed timeline makes the demo a script, not a lucky take. */
export const DEMO_ARC: DemoStep[] = [
  { atMs: 0, label: "all green, calm lo-fi", tension: 0.05 },
  { atMs: 4000, label: "type error: a nervous pulse enters", tension: 0.35 },
  {
    atMs: 9000,
    label: "tests FAIL: strings go tense and dissonant",
    tension: 0.85,
    accent: "fail",
  },
  { atMs: 15000, label: "fixing it...", tension: 0.55 },
  { atMs: 18000, label: "git commit: clean major-key resolution", tension: 0.0, accent: "commit" },
  { atMs: 23000, label: "your codebase has a soundtrack", tension: 0.06, endcard: true },
];

/** Total arc length plus a tail, so the loop breathes before repeating. */
export const DEMO_ARC_MS: number = (DEMO_ARC.at(-1)?.atMs ?? 0) + 6000;

export function intentAt(step: DemoStep): MusicIntent {
  return intentForTension(step.tension);
}

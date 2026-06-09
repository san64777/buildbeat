// The mapping engine: dev events -> a tension value -> MusicIntent. THIS is the
// product (good = a film composer, bad = a gimmick). Day-2 is a sane first cut;
// Day-3 is the taste pass. It keeps one piece of state (tension) that settles
// toward a baseline, and events push it: a fail spikes and HOLDS tension until
// green; a commit resolves it.

import type { BuildEvent } from "../events/types.ts";
import { type AccentId, clamp01, intentForTension, type MusicIntent } from "../music/driver.ts";

export interface MappingState {
  intent: MusicIntent;
  /** Human caption for the page + the daemon log. */
  label: string;
  /** A one-shot hit to play on top, set only on the event that earns it. */
  accent?: AccentId;
}

export interface MappingEngine {
  /** Fold an event into the state and return the new MusicIntent + label. */
  handle: (event: BuildEvent) => MappingState;
  /** Ease tension toward its baseline; returns a new state, or null if settled. */
  tick: () => MappingState | null;
  /** The current state without changing anything. */
  current: () => MappingState;
}

export function makeMappingEngine(): MappingEngine {
  let tension = 0.06;
  let baseline = 0.06; // where tension settles; rises and HOLDS while tests fail
  let label = "idle";

  const state = (): MappingState => ({ intent: intentForTension(tension), label });

  return {
    handle(event) {
      let accent: AccentId | undefined;
      switch (event.kind) {
        case "save":
          // a small focus nudge above wherever we are settling (no accent: a
          // tick on every keystroke-save would grate)
          tension = clamp01(Math.max(tension, baseline) + 0.06);
          label = "editing";
          break;
        case "test:start":
          tension = Math.max(tension, 0.4);
          label = "running tests...";
          break;
        case "test:fail": {
          const n = event.failed ?? 0;
          const severity = n > 0 ? clamp01(0.8 + 0.03 * n) : 0.85;
          tension = severity;
          baseline = severity; // stay tense until it goes green
          label = n > 0 ? `${n} failing` : "tests failing";
          accent = "fail";
          break;
        }
        case "test:pass":
          tension = 0.05;
          baseline = 0.06; // relief, settle back to calm
          label = event.passed != null ? `all green (${event.passed} passing)` : "all green";
          accent = "green";
          break;
        case "commit":
          tension = 0.0;
          baseline = 0.06; // resolution
          label = `committed: ${event.message}`.slice(0, 64);
          accent = "commit";
          break;
      }
      return accent ? { ...state(), accent } : state();
    },

    tick() {
      if (Math.abs(tension - baseline) < 0.005) return null;
      tension += (baseline - tension) * 0.15;
      return state();
    },

    current: state,
  };
}

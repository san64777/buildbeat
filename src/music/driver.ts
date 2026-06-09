// The MusicDriver contract: the one swappable seam between buildbeat's mapping
// engine and whatever actually makes sound (StemsDriver today; MagentaRT2Driver
// on Apple Silicon, or hosted LyriaDriver, later). The mapping engine only ever
// speaks MusicIntent; it never knows which backend is playing.

export type MoodId = "calm" | "focus" | "tense" | "fail" | "resolve";

/** A transient one-shot hit layered over the bed at a key moment (a relief bell
 * on green, a warm resolve on commit, a low thud on fail). Not a steady state. */
export type AccentId = "fail" | "green" | "commit";

/** What the soundtrack should feel like right now. The whole product is the
 * quality of the event -> MusicIntent mapping; this is its output type. */
export interface MusicIntent {
  /** 0 = fully calm, 1 = maximum tension. The single make-or-break morph axis. */
  tension: number;
  /** Discrete mood label, for the UI and coarse selection. */
  mood: MoodId;
  /** 0..1 layering / intensity (how much is stacked on top of the bed). */
  density: number;
  /** 0..1 timbral brightness (filter openness). */
  brightness: number;
  /** Tempo, beats per minute. */
  bpm: number;
  /** Musical key, e.g. "C major" / "A minor". */
  key: string;
}

/** A backend that turns a stream of MusicIntent into continuous, seam-free audio. */
export interface MusicDriver {
  /** Begin continuous playback at the given starting intent. */
  start(intent: MusicIntent): Promise<void> | void;
  /** Morph the soundtrack toward a new intent. MUST be seam-free (no click/gap). */
  steer(intent: MusicIntent): Promise<void> | void;
  /** Stop playback and release resources. */
  stop(): Promise<void> | void;
}

/** Default crossfade length, in milliseconds. Long enough to hide a seam,
 * short enough to feel reactive (the "morph in <2s" gate). */
export const DEFAULT_CROSSFADE_MS = 1500;

export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Equal-power crossfade gains for a blend position p in [0,1].
 * Returns [gainA, gainB] with gainA^2 + gainB^2 === 1, so the perceived
 * loudness stays constant across the morph (no mid-crossfade dip = no seam). */
export function equalPowerGains(p: number): [number, number] {
  const x = clamp01(p);
  return [Math.cos((x * Math.PI) / 2), Math.sin((x * Math.PI) / 2)];
}

/** Map the single 0..1 tension knob to a full MusicIntent. This is the
 * stand-in mapping for the make-or-break proof; the real event-driven mapping
 * engine (Day 3) will be far richer but emit the same MusicIntent shape. */
export function intentForTension(t: number): MusicIntent {
  const tension = clamp01(t);
  const mood: MoodId =
    tension < 0.15 ? "calm" : tension < 0.45 ? "focus" : tension < 0.8 ? "tense" : "fail";
  return {
    tension,
    mood,
    density: 0.3 + 0.6 * tension,
    brightness: 0.7 - 0.4 * tension,
    bpm: Math.round(72 + 36 * tension),
    key: tension < 0.5 ? "C major" : "A minor",
  };
}

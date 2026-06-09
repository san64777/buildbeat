// Wraps the user's test command: run it, read the exit code (the reliable
// signal), best-effort parse pass/fail counts, and emit test:start ->
// test:pass | test:fail. Debounced and self-coalescing so a burst of saves
// triggers exactly one trailing run.

import { spawn } from "node:child_process";
import type { BuildEvent } from "./types.ts";

export interface TestRunner {
  /** Schedule a debounced run (call on every relevant save). */
  trigger: () => void;
  stop: () => void;
}

export function makeTestRunner(
  command: string,
  onEvent: (event: BuildEvent) => void,
  debounceMs = 350,
): TestRunner {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let queued = false;

  async function run(): Promise<void> {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    onEvent({ kind: "test:start" });
    const proc = spawn("sh", ["-c", command]);
    let out = "";
    proc.stdout?.on("data", (d: Buffer) => {
      out += d.toString();
    });
    proc.stderr?.on("data", (d: Buffer) => {
      out += d.toString();
    });
    const code = await new Promise<number>((resolve) => {
      proc.on("close", (c) => resolve(c ?? 0));
      proc.on("error", () => resolve(1));
    });
    const counts = parseCounts(out);
    if (code === 0) onEvent({ kind: "test:pass", passed: counts.passed });
    else onEvent({ kind: "test:fail", failed: counts.failed, passed: counts.passed });
    running = false;
    if (queued) {
      queued = false;
      void run();
    }
  }

  return {
    trigger() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void run(), debounceMs);
    },
    stop() {
      if (timer) clearTimeout(timer);
    },
  };
}

/** Best-effort across bun test / vitest / jest output ("N pass", "N fail"). */
export function parseCounts(out: string): { passed: number | null; failed: number | null } {
  const pass = out.match(/(\d+)\s+pass/i);
  const fail = out.match(/(\d+)\s+fail/i);
  return {
    passed: pass?.[1] ? Number(pass[1]) : null,
    failed: fail?.[1] ? Number(fail[1]) : null,
  };
}

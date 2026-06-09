import { expect, test } from "bun:test";
import { makeTestRunner, parseCounts } from "./test-runner.ts";
import type { BuildEvent } from "./types.ts";

function collectFrom(command: string): Promise<BuildEvent[]> {
  return new Promise((resolve) => {
    const events: BuildEvent[] = [];
    const runner = makeTestRunner(
      command,
      (e) => {
        events.push(e);
        if (e.kind === "test:pass" || e.kind === "test:fail") resolve(events);
      },
      5,
    );
    runner.trigger();
    setTimeout(() => resolve(events), 4000);
  });
}

test("exit 0 emits test:start then test:pass", async () => {
  const events = await collectFrom("exit 0");
  expect(events[0]?.kind).toBe("test:start");
  expect(events.at(-1)?.kind).toBe("test:pass");
});

test("a nonzero exit emits test:fail", async () => {
  const events = await collectFrom("exit 1");
  expect(events.at(-1)?.kind).toBe("test:fail");
});

test("parseCounts reads bun/vitest/jest-style summaries", () => {
  expect(parseCounts("5 pass\n0 fail")).toEqual({ passed: 5, failed: 0 });
  expect(parseCounts("Tests  2 failed | 7 passed")).toEqual({ passed: 7, failed: 2 });
  expect(parseCounts("no summary here")).toEqual({ passed: null, failed: null });
});

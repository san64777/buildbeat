// Wires the live loop: event sources -> mapping engine -> MusicIntent ->
// broadcast to the page. This is `buildbeat watch`: your real saves, test
// runs, and commits drive the score instead of the slider.

import { makeTestRunner } from "./events/test-runner.ts";
import type { BuildEvent } from "./events/types.ts";
import { watchProject } from "./events/watcher.ts";
import { type MappingState, makeMappingEngine } from "./mapping/engine.ts";
import { type ServerHandle, startServer } from "./server.ts";

export interface WatchOptions {
  port?: number;
  /** Shell command to run on save (e.g. "bun test"); omit to skip test scoring. */
  testCommand?: string | null;
  root?: string;
  log?: (msg: string) => void;
}

export interface WatchHandle {
  server: ServerHandle;
  stop: () => Promise<void>;
}

export function startWatch(opts: WatchOptions = {}): WatchHandle {
  const root = opts.root ?? process.cwd();
  const log = opts.log ?? (() => {});
  const mapping = makeMappingEngine();
  const toMsg = (s: MappingState) => ({
    type: "intent",
    intent: s.intent,
    label: s.label,
    accent: s.accent,
  });
  // Greet each new page with the current mood (no silent gap on connect).
  const server = startServer(opts.port ?? 7777, () => toMsg(mapping.current()));

  const push = (s: MappingState): void => server.broadcast(toMsg(s));

  const onEvent = (event: BuildEvent): void => {
    log(describe(event));
    push(mapping.handle(event));
  };

  const runner = opts.testCommand ? makeTestRunner(opts.testCommand, onEvent) : null;
  const watchers = watchProject(root, onEvent, () => runner?.trigger());

  // Ease tension back toward baseline between events so it breathes.
  const ticker = setInterval(() => {
    const s = mapping.tick();
    if (s) push(s);
  }, 400);

  return {
    server,
    async stop() {
      clearInterval(ticker);
      runner?.stop();
      await watchers.close();
      server.stop();
    },
  };
}

function describe(event: BuildEvent): string {
  switch (event.kind) {
    case "save":
      return `save     ${event.path}`;
    case "test:start":
      return "test     running...";
    case "test:pass":
      return `test     PASS${event.passed != null ? ` (${event.passed})` : ""}`;
    case "test:fail":
      return `test     FAIL${event.failed != null ? ` (${event.failed} failing)` : ""}`;
    case "commit":
      return `commit   ${event.message}`;
  }
}

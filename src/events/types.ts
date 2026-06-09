// The one typed event stream every source funnels into. The mapping engine
// consumes only BuildEvent; it never knows whether the signal came from
// chokidar, a test wrapper, or a git hook.

export type BuildEvent =
  | { kind: "save"; path: string }
  | { kind: "test:start" }
  | { kind: "test:pass"; passed: number | null }
  | { kind: "test:fail"; failed: number | null; passed: number | null }
  | { kind: "commit"; message: string };

export type BuildEventHandler = (event: BuildEvent) => void;

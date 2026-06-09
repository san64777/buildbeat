import { expect, test } from "bun:test";
import { makeMappingEngine } from "./engine.ts";

test("starts calm", () => {
  const m = makeMappingEngine();
  expect(m.current().intent.tension).toBeLessThan(0.15);
  expect(m.current().intent.mood).toBe("calm");
});

test("a failing test run spikes tension and holds it until green", () => {
  const m = makeMappingEngine();
  const fail = m.handle({ kind: "test:fail", failed: 2, passed: 3 });
  expect(fail.intent.tension).toBeGreaterThan(0.8);
  expect(fail.label).toContain("2 failing");

  // ticking does NOT relax tension while still failing (baseline stayed high)
  for (let i = 0; i < 20; i++) m.tick();
  expect(m.current().intent.tension).toBeGreaterThan(0.8);
});

test("more failures read as more tension", () => {
  const a = makeMappingEngine().handle({ kind: "test:fail", failed: 1, passed: 0 });
  const b = makeMappingEngine().handle({ kind: "test:fail", failed: 5, passed: 0 });
  expect(b.intent.tension).toBeGreaterThan(a.intent.tension);
});

test("going green is relief; tick settles back to calm", () => {
  const m = makeMappingEngine();
  m.handle({ kind: "test:fail", failed: 1, passed: 0 });
  const pass = m.handle({ kind: "test:pass", passed: 4 });
  expect(pass.intent.tension).toBeLessThan(0.15);
  expect(pass.label).toContain("all green");
  for (let i = 0; i < 30; i++) m.tick();
  expect(m.current().intent.tension).toBeLessThan(0.12);
});

test("a commit resolves to the calmest point", () => {
  const m = makeMappingEngine();
  m.handle({ kind: "test:fail", failed: 3, passed: 0 });
  const commit = m.handle({ kind: "commit", message: "fix the thing" });
  expect(commit.intent.tension).toBe(0);
  expect(commit.label).toContain("fix the thing");
});

test("a save nudges focus up a touch", () => {
  const m = makeMappingEngine();
  const before = m.current().intent.tension;
  const after = m.handle({ kind: "save", path: "src/x.ts" });
  expect(after.intent.tension).toBeGreaterThan(before);
  expect(after.label).toBe("editing");
});

test("accents fire only on the moments that earn them", () => {
  const m = makeMappingEngine();
  expect(m.handle({ kind: "save", path: "a.ts" }).accent).toBeUndefined();
  expect(m.handle({ kind: "test:start" }).accent).toBeUndefined();
  expect(m.handle({ kind: "test:fail", failed: 1, passed: 0 }).accent).toBe("fail");
  expect(m.handle({ kind: "test:pass", passed: 1 }).accent).toBe("green");
  expect(m.handle({ kind: "commit", message: "x" }).accent).toBe("commit");
  // accents are one-shot: a decay tick never carries one
  expect(m.tick()?.accent).toBeUndefined();
});

test("tick returns null once settled", () => {
  const m = makeMappingEngine();
  let guard = 0;
  while (m.tick() !== null && guard < 100) guard++;
  expect(m.tick()).toBeNull();
});

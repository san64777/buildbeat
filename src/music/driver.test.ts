import { expect, test } from "bun:test";
import { clamp01, equalPowerGains, intentForTension } from "./driver.ts";

test("equalPowerGains keeps constant power across the whole crossfade (no audible dip)", () => {
  for (let p = 0; p <= 1.0001; p += 0.05) {
    const [a, b] = equalPowerGains(p);
    expect(a * a + b * b).toBeCloseTo(1, 5);
  }
});

test("equalPowerGains endpoints are full-calm and full-tense", () => {
  expect(equalPowerGains(0)).toEqual([1, 0]);
  const [a, b] = equalPowerGains(1);
  expect(a).toBeCloseTo(0, 5);
  expect(b).toBeCloseTo(1, 5);
});

test("equalPowerGains clamps out-of-range blend positions", () => {
  expect(equalPowerGains(-1)).toEqual([1, 0]);
  const [a, b] = equalPowerGains(2);
  expect(a).toBeCloseTo(0, 5);
  expect(b).toBeCloseTo(1, 5);
});

test("clamp01 clamps to [0,1]", () => {
  expect(clamp01(-2)).toBe(0);
  expect(clamp01(2)).toBe(1);
  expect(clamp01(0.5)).toBe(0.5);
});

test("intentForTension maps the single knob to a coherent intent", () => {
  expect(intentForTension(0).mood).toBe("calm");
  expect(intentForTension(1).mood).toBe("fail");
  expect(intentForTension(2).tension).toBe(1);
  expect(intentForTension(0.9).bpm).toBeGreaterThan(intentForTension(0.1).bpm);
  expect(intentForTension(0.9).brightness).toBeLessThan(intentForTension(0.1).brightness);
});

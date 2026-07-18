import assert from "node:assert/strict";
import test from "node:test";
import { isHighQuality } from "../src/fixQuality";
import { applySpeedGate, type Fix, type ValidationState } from "../src/speedGate";

const now = Date.parse("2026-07-18T12:00:00.000Z");
const emptyState: ValidationState = { previousFix: null, unlockingStatus: "unlocking", lastSpeedKph: null };

function fix(offsetMeters: number, offsetSeconds: number, accuracy = 5): Fix {
  return {
    latitude: (offsetMeters / 6_371_000) * (180 / Math.PI),
    longitude: 0,
    horizontalAccuracy: accuracy,
    timestamp: new Date(now + offsetSeconds * 1_000).toISOString(),
    precise: true,
  };
}

test("allows movement below the 15 km/h cap", () => {
  const result = applySpeedGate([fix(0, 0), fix(41, 10)], emptyState, 15);
  assert.equal(result.eligiblePairs.length, 1);
  assert.equal(result.state.unlockingStatus, "unlocking");
  assert.ok((result.state.lastSpeedKph ?? Infinity) < 15);
});

test("allows movement exactly at the 15 km/h cap", () => {
  const result = applySpeedGate([fix(0, 0), fix(15 / 3.6 * 10, 10)], emptyState, 15);
  assert.equal(result.eligiblePairs.length, 1);
  assert.equal(result.state.unlockingStatus, "unlocking");
});

test("pauses over-cap movement and requires two later eligible fixes", () => {
  const fast = applySpeedGate([fix(0, 0), fix(42, 10)], emptyState, 15);
  assert.equal(fast.eligiblePairs.length, 0);
  assert.equal(fast.state.unlockingStatus, "paused_for_speed");
  assert.equal(fast.state.previousFix, null);

  const baseline = applySpeedGate([fix(84, 20)], fast.state, 15);
  assert.equal(baseline.eligiblePairs.length, 0);
  assert.equal(baseline.state.unlockingStatus, "paused_for_speed");

  const resumed = applySpeedGate([fix(124, 30)], baseline.state, 15);
  assert.equal(resumed.eligiblePairs.length, 1);
  assert.equal(resumed.state.unlockingStatus, "unlocking");
});

test("rejects non-monotonic timestamp pairs", () => {
  const result = applySpeedGate([fix(0, 0), fix(5, 0)], emptyState, 15);
  assert.equal(result.eligiblePairs.length, 0);
  assert.equal(result.state.previousFix, null);
});

test("accepts only precise, fresh, accurate fixes", () => {
  const policy = { maxHorizontalAccuracyMeters: 10, maxFixAgeSeconds: 30 };
  assert.equal(isHighQuality(fix(0, 0), policy, now), true);
  assert.equal(isHighQuality(fix(0, 0, 11), policy, now), false);
  assert.equal(isHighQuality({ ...fix(0, 0), precise: false }, policy, now), false);
  assert.equal(isHighQuality(fix(0, -31), policy, now), false);
  assert.equal(isHighQuality({ ...fix(0, 0), timestamp: "" }, policy, now), false);
});

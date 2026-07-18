import type { Fix } from "./speedGate";

export type FixQualityPolicy = {
  maxHorizontalAccuracyMeters: number;
  maxFixAgeSeconds: number;
};

export function isHighQuality(fix: Fix, policy: FixQualityPolicy, now = Date.now()): boolean {
  const timestamp = Date.parse(fix.timestamp);
  return (
    fix.precise &&
    Number.isFinite(fix.latitude) &&
    Number.isFinite(fix.longitude) &&
    Number.isFinite(fix.horizontalAccuracy) &&
    fix.horizontalAccuracy >= 0 &&
    fix.horizontalAccuracy <= policy.maxHorizontalAccuracyMeters &&
    Number.isFinite(timestamp) &&
    Math.abs(now - timestamp) <= policy.maxFixAgeSeconds * 1_000
  );
}

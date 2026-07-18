export type Fix = {
  latitude: number;
  longitude: number;
  horizontalAccuracy: number;
  timestamp: string;
  precise: boolean;
};

export type UnlockingStatus = "unlocking" | "paused_for_speed";

export type ValidationState = {
  previousFix: Fix | null;
  unlockingStatus: UnlockingStatus;
  lastSpeedKph: number | null;
};

export type EligibleFixPair = { previous: Fix; current: Fix };

export type SpeedGateResult = {
  eligiblePairs: EligibleFixPair[];
  state: ValidationState;
};

export function metersBetween(a: Fix, b: Fix): number {
  const radians = (value: number) => (value * Math.PI) / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function applySpeedGate(
  qualifiedFixes: Fix[],
  previousState: ValidationState,
  maxSpeedKph: number,
): SpeedGateResult {
  const eligiblePairs: EligibleFixPair[] = [];
  let previousFix = previousState.previousFix;
  let unlockingStatus = previousState.unlockingStatus;
  let lastSpeedKph = previousState.lastSpeedKph;

  for (const current of qualifiedFixes) {
    if (!previousFix) {
      previousFix = current;
      continue;
    }

    const elapsedMilliseconds = Date.parse(current.timestamp) - Date.parse(previousFix.timestamp);
    if (!Number.isFinite(elapsedMilliseconds) || elapsedMilliseconds <= 0) {
      // Never interpolate across a malformed or non-monotonic timestamp.
      previousFix = null;
      continue;
    }

    const speedKph = (metersBetween(previousFix, current) / elapsedMilliseconds) * 3_600;
    // Retain an inclusive cap despite insignificant floating-point rounding in
    // the distance calculation (for example, a mathematically exact 15 km/h).
    if (!Number.isFinite(speedKph) || speedKph > maxSpeedKph + 1e-9) {
      // Discard both sides of a fast segment. The next valid fix is only a new
      // baseline, so a vehicle trip can never be bridged by interpolation.
      previousFix = null;
      unlockingStatus = "paused_for_speed";
      lastSpeedKph = Number.isFinite(speedKph) ? speedKph : null;
      continue;
    }

    eligiblePairs.push({ previous: previousFix, current });
    previousFix = current;
    unlockingStatus = "unlocking";
    lastSpeedKph = speedKph;
  }

  return { eligiblePairs, state: { previousFix, unlockingStatus, lastSpeedKph } };
}

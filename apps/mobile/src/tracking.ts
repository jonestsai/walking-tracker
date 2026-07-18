import { Alert } from "react-native";
import * as Location from "expo-location";
import { api } from "./api";
import { hasPreciseLocationAccess } from "./locationPermissions";
import { activeWalk, clearActiveWalk, initialiseQueue, nextBatch, removeBatch, setActiveWalk } from "./locationQueue";
import { LOCATION_TASK } from "./locationTask";
import type { UnlockingStatus } from "./api";

export type FlushResult = { awardedCells: string[]; unlockingStatus: UnlockingStatus | null; speedKph: number | null };

export async function startWalk(): Promise<string> {
  initialiseQueue();
  let foreground = await Location.getForegroundPermissionsAsync();
  if (!foreground.granted) foreground = await Location.requestForegroundPermissionsAsync();
  console.info("Walk foreground location permission", {
    granted: foreground.granted,
    status: foreground.status,
    canAskAgain: foreground.canAskAgain,
  });
  if (!foreground.granted) throw new Error("Precise foreground location is required to start a Walk.");

  let background = await Location.getBackgroundPermissionsAsync();
  if (!background.granted) {
    const continueToBackgroundPermission = await new Promise<boolean>((resolve) => {
      Alert.alert("Track with phone locked", "Choose “Change to Always Allow” in the next prompt.", [
        { text: "Not now", style: "cancel", onPress: () => resolve(false) },
        { text: "Continue", onPress: () => resolve(true) },
      ]);
    });
    if (!continueToBackgroundPermission) throw new Error("Location permission setup cancelled.");
    await Location.requestBackgroundPermissionsAsync();
    // iOS can dismiss the authorization sheet before Core Location exposes the
    // updated status to the app. It is normally available a fraction of a
    // second later, so don't send a user who chose "Always Allow" to Settings.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      background = await Location.getBackgroundPermissionsAsync();
      if (background.granted || attempt === 4) break;
      await new Promise<void>((resolve) => setTimeout(resolve, 250));
    }
  }
  console.info("Walk background location permission", {
    granted: background.granted,
    status: background.status,
    canAskAgain: background.canAskAgain,
  });
  if (!background.granted) throw new Error("Background location is required to track a Walk while your phone is locked.");
  if (!await hasPreciseLocationAccess()) throw new Error("Precise foreground location is required to start a Walk.");

  const session = await api.startTrackingSession("background_walk");
  setActiveWalk(session.id);
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    distanceInterval: 3,
    deferredUpdatesDistance: 5,
    deferredUpdatesInterval: 5_000,
    activityType: Location.ActivityType.Fitness,
    pausesUpdatesAutomatically: true,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "Walk tracking active",
      notificationBody: "Walking Tracker is unlocking explored cells.",
    },
  });
  return session.id;
}

export async function flushQueuedFixes(): Promise<FlushResult> {
  const sessionId = activeWalk();
  if (!sessionId) return { awardedCells: [], unlockingStatus: null, speedKph: null };
  const awarded: string[] = [];
  let unlockingStatus: UnlockingStatus | null = null;
  let speedKph: number | null = null;
  while (true) {
    const batch = nextBatch(sessionId);
    if (batch.length === 0) break;
    const result = await api.uploadFixes(sessionId, batch.map((entry) => entry.fix));
    removeBatch(batch.map((entry) => entry.id));
    awarded.push(...result.awarded.map((cell) => cell.h3_index));
    unlockingStatus = result.unlockingStatus;
    speedKph = result.speedKph;
  }
  return { awardedCells: awarded, unlockingStatus, speedKph };
}

export async function endWalk(): Promise<void> {
  const sessionId = activeWalk();
  if (!sessionId) return;
  await flushQueuedFixes();
  await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  await api.endWalk(sessionId);
  clearActiveWalk();
}

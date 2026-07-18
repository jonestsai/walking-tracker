import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import type { FixPayload } from "./api";
import { activeWalk, enqueueFixes, initialiseQueue } from "./locationQueue";

export const LOCATION_TASK = "active-walk-location-task";

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  initialiseQueue();
  const sessionId = activeWalk();
  if (!sessionId) return;
  const locations = (data as { locations: Location.LocationObject[] }).locations;
  const fixes: FixPayload[] = locations.map((location) => ({
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    horizontalAccuracy: location.coords.accuracy ?? -1,
    timestamp: new Date(location.timestamp).toISOString(),
    precise: true,
  }));
  enqueueFixes(sessionId, fixes);
});

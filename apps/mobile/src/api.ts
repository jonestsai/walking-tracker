import { config } from "./config";
import { getAccessToken } from "./auth";

export type FixPayload = {
  latitude: number;
  longitude: number;
  horizontalAccuracy: number;
  timestamp: string;
  precise: boolean;
};

export type AwardedCell = { h3_index: string };
export type UnlockingStatus = "unlocking" | "paused_for_speed";
export type TrackingMode = "foreground_explore" | "background_walk";
export type ProgressSummary = { total_tiles: number; tiles_today: number; current_streak: number };
export type RecentSession = { id: string; tracking_mode: TrackingMode; started_at: string; ended_at: string | null; awarded_cell_count: number };
export type CityProgress = { city_id: string; city_name: string; country_code: "US" | "CA"; subdivision_code: string; tile_count: number };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const response = await fetch(`${config.apiUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as T;
}

export const api = {
  startTrackingSession: (mode: TrackingMode) => request<{ id: string }>("/v1/tracking-sessions", { method: "POST", body: JSON.stringify({ mode }) }),
  endWalk: (sessionId: string) => request<{ id: string }>(`/v1/walk-sessions/${sessionId}/end`, { method: "POST" }),
  uploadFixes: (sessionId: string, fixes: FixPayload[]) =>
    request<{ candidateCell: string | null; awarded: AwardedCell[]; unlockingStatus: UnlockingStatus; speedKph: number | null }>(`/v1/walk-sessions/${sessionId}/fixes`, {
      method: "POST",
      body: JSON.stringify({ fixes }),
    }),
  exploredCells: (bounds: { west: number; south: number; east: number; north: number }) => {
    const query = new URLSearchParams(Object.entries(bounds).map(([key, value]) => [key, String(value)]));
    return request<{ cells: string[] }>(`/v1/explored-cells?${query}`);
  },
  progress: () => request<{ summary: ProgressSummary; sessions: RecentSession[] }>("/v1/progress"),
  cities: () => request<{ cities: CityProgress[] }>("/v1/cities"),
};

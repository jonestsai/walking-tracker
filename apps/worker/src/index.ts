import {
  cellToBoundary,
  cellToLatLng,
  gridPathCells,
  latLngToCell,
} from "h3-js";

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
  H3_RESOLUTION: string;
  MAX_HORIZONTAL_ACCURACY_METERS: string;
  MAX_FIX_AGE_SECONDS: string;
  MAX_INTERPOLATION_GAP_METERS: string;
};

type Fix = {
  latitude: number;
  longitude: number;
  horizontalAccuracy: number;
  timestamp: string;
  precise: boolean;
};

type AwardCell = {
  h3Index: string;
  boundary: { type: "Polygon"; coordinates: number[][][] };
  centroid: { type: "Point"; coordinates: [number, number] };
};

type SupabaseUser = { id: string };
type TrackingMode = "foreground_explore" | "background_walk";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const metersBetween = (a: Fix, b: Fix) => {
  const radians = (value: number) => (value * Math.PI) / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

function isHighQuality(fix: Fix, env: Env): boolean {
  const timestamp = Date.parse(fix.timestamp);
  const maxAge = Number(env.MAX_FIX_AGE_SECONDS) * 1_000;
  return (
    fix.precise &&
    Number.isFinite(fix.latitude) &&
    Number.isFinite(fix.longitude) &&
    Number.isFinite(fix.horizontalAccuracy) &&
    fix.horizontalAccuracy >= 0 &&
    fix.horizontalAccuracy <= Number(env.MAX_HORIZONTAL_ACCURACY_METERS) &&
    Number.isFinite(timestamp) &&
    Math.abs(Date.now() - timestamp) <= maxAge
  );
}

function toAwardCell(h3Index: string): AwardCell {
  const ring = cellToBoundary(h3Index, true);
  const [longitude, latitude] = cellToLatLng(h3Index);
  return {
    h3Index,
    boundary: { type: "Polygon", coordinates: [ring] },
    centroid: { type: "Point", coordinates: [longitude, latitude] },
  };
}

function cellsFromFixes(fixes: Fix[], env: Env): AwardCell[] {
  const resolution = Number(env.H3_RESOLUTION);
  const maxGap = Number(env.MAX_INTERPOLATION_GAP_METERS);
  const qualified = fixes.filter((fix) => isHighQuality(fix, env));
  const confirmed = new Set<string>();

  for (let index = 1; index < qualified.length; index += 1) {
    const previous = qualified[index - 1];
    const current = qualified[index];
    if (!previous || !current) continue;

    const previousCell = latLngToCell(previous.latitude, previous.longitude, resolution);
    const currentCell = latLngToCell(current.latitude, current.longitude, resolution);

    // Two high-quality observations in the same cell confirm an unlock.
    if (previousCell === currentCell) {
      confirmed.add(currentCell);
      continue;
    }

    // A short high-quality move may traverse one or more cells. Never fill a long gap.
    if (metersBetween(previous, current) <= maxGap) {
      try {
        for (const cell of gridPathCells(previousCell, currentCell)) confirmed.add(cell);
      } catch {
        // Rare pentagon-path failures should never reject an otherwise valid batch.
      }
    }
  }

  return [...confirmed].map(toAwardCell);
}

async function requireUser(request: Request, env: Env): Promise<SupabaseUser | null> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_SECRET_KEY,
      authorization,
    },
  });
  if (!response.ok) return null;
  return (await response.json()) as SupabaseUser;
}

async function rpc<T>(env: Env, name: string, body: unknown): Promise<T> {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SECRET_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as T;
}

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/health") return json({ ok: true });

  const user = await requireUser(request, env);
  if (!user) return json({ error: "Unauthorized" }, 401);

  if (request.method === "POST" && url.pathname === "/v1/tracking-sessions") {
    const payload = (await request.json()) as { mode?: TrackingMode };
    if (payload.mode !== "foreground_explore" && payload.mode !== "background_walk") {
      return json({ error: "Provide a valid tracking mode." }, 400);
    }
    const session = await rpc<{ id: string }>(env, "start_tracking_session", {
      p_user_id: user.id,
      p_tracking_mode: payload.mode,
    });
    return json(session, 201);
  }

  if (request.method === "GET" && url.pathname === "/v1/progress") {
    const [summaryRows, sessions] = await Promise.all([
      rpc<Array<{ total_tiles: number; tiles_today: number; current_streak: number }>>(env, "user_progress_summary", { p_user_id: user.id }),
      rpc<Array<{ id: string; tracking_mode: TrackingMode; started_at: string; ended_at: string | null; awarded_cell_count: number }>>(env, "recent_tracking_sessions", { p_user_id: user.id, p_limit: 8 }),
    ]);
    const summary = summaryRows[0] ?? { total_tiles: 0, tiles_today: 0, current_streak: 0 };
    return json({ summary, sessions });
  }

  if (request.method === "GET" && url.pathname === "/v1/explored-cells") {
    const west = Number(url.searchParams.get("west"));
    const south = Number(url.searchParams.get("south"));
    const east = Number(url.searchParams.get("east"));
    const north = Number(url.searchParams.get("north"));
    if (![west, south, east, north].every(Number.isFinite) || west >= east || south >= north) {
      return json({ error: "Provide a valid west, south, east, and north viewport." }, 400);
    }
    const cells = await rpc<Array<{ h3_index: string }>>(env, "visible_user_h3_cells", {
      p_user_id: user.id,
      p_west: west,
      p_south: south,
      p_east: east,
      p_north: north,
    });
    return json({ cells: cells.map((cell) => cell.h3_index) });
  }

  const fixesMatch = url.pathname.match(/^\/v1\/walk-sessions\/([\w-]+)\/fixes$/);
  if (request.method === "POST" && fixesMatch) {
    const payload = (await request.json()) as { fixes?: Fix[] };
    const fixes = Array.isArray(payload.fixes) ? payload.fixes : [];
    if (fixes.length === 0 || fixes.length > 100) {
      return json({ error: "Provide 1 to 100 location fixes." }, 400);
    }
    const cells = cellsFromFixes(fixes, env);
    const awarded = await rpc<Array<{ h3_index: string }>>(env, "award_h3_cells", {
      p_user_id: user.id,
      p_session_id: fixesMatch[1],
      p_cells: cells,
    });
    const latest = fixes.at(-1);
    return json({ candidateCell: latest ? latLngToCell(latest.latitude, latest.longitude, Number(env.H3_RESOLUTION)) : null, awarded });
  }

  const endMatch = url.pathname.match(/^\/v1\/walk-sessions\/([\w-]+)\/end$/);
  if (request.method === "POST" && endMatch) {
    const session = await rpc<{ id: string }>(env, "end_walk_session", {
      p_user_id: user.id,
      p_session_id: endMatch[1],
    });
    return json(session);
  }

  return json({ error: "Not found" }, 404);
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env).catch((error: unknown) => {
      console.error(error);
      return json({ error: "Internal server error" }, 500);
    });
  },
};

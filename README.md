# Walking Tracker

> Turn every walk into an adventure: unlock map tiles as you discover the world on foot.

Walking Tracker is an iOS walking exploration app. Start a walk, unlock precise H3 hexagonal tiles as you move, then see your progress on a personal map and by city. It is designed around exploration rather than routes, pace, or calories.

## What it does

- Tracks an active walk in the background, including while the phone is locked.
- Unlocks previously unexplored H3 resolution-12 tiles from verified location fixes.
- Shows unlocked tiles on an interactive MapLibre map.
- Summarizes total tiles, today's tiles, day streak, recent walks, and tiles by supported city.
- Queues location fixes in SQLite and syncs them when connectivity returns.
- Pauses tile unlocking above the configured walking-speed limit, preventing progress while driving.

## Architecture

| Component | Technology | Responsibility |
| --- | --- | --- |
| Mobile app | Expo, React Native, TypeScript, MapLibre | Background location, offline queue, map, and progress UI |
| API | Cloudflare Worker, TypeScript, H3 | JWT verification, fix-quality checks, speed gate, and tile awarding |
| Data | Supabase, PostgreSQL, PostGIS | Users, walk sessions, tile ownership, geometry, and city attribution |
| City import | Node.js, official Census and Statistics Canada data | Versioned municipal-boundary loading and H3-to-city assignment |

## Prerequisites

- Node.js 20 or later
- A Supabase project with the PostGIS extension available
- A Cloudflare account for the Worker
- A MapTiler style URL or another MapLibre-compatible style URL
- An iPhone and Apple developer account for background-location testing

> [!IMPORTANT]
> The app requires an Expo development build. Expo Go cannot run the iOS background-location workflow.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. In Supabase, enable the PostGIS extension and enable **Anonymous Sign-Ins** under Authentication providers. The app creates an anonymous account on first launch; no sample user data is needed.

3. Apply the SQL migrations in filename order from [`supabase/migrations`](./supabase/migrations). The initial migration creates the core schema; later migrations add walk modes, progress, speed validation, and city attribution.

4. Configure the Worker:

   ```bash
   cp apps/worker/.dev.vars.example apps/worker/.dev.vars
   ```

   Set the following values in `apps/worker/.dev.vars`:

   ```dotenv
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SECRET_KEY=sb_secret_your-worker-specific-key
   ```

   Create a worker-specific Supabase secret key. Never put this key in the mobile app.

5. Configure the mobile app:

   ```bash
   cp apps/mobile/.env.example apps/mobile/.env
   ```

   Set the Worker URL, Supabase URL, Supabase publishable key, and map style URL:

   ```dotenv
   EXPO_PUBLIC_API_URL=http://127.0.0.1:8787
   EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
   EXPO_PUBLIC_MAP_STYLE_URL=https://api.maptiler.com/maps/streets-v2/style.json?key=your-key
   ```

   When testing on a physical iPhone, `EXPO_PUBLIC_API_URL` must be a reachable deployed Worker URL, not `127.0.0.1`.

6. Load city boundaries (optional for core tile unlocking, required for the **Tiles by city** view). Follow the documented procedure in [`supabase/city-boundaries`](./supabase/city-boundaries/README.md). It loads the reviewed North American roster and refreshes H3 city assignments.

7. Run the services:

   ```bash
   npm run dev:worker
   npm run dev:mobile
   ```

8. Build and install the iOS development app:

   ```bash
   npm --workspace @walking-tracker/mobile run ios
   ```

## Testing

### Automated checks

Run type checks across both workspaces:

```bash
npm run typecheck
```

Run the Worker test suite:

```bash
npm --workspace @walking-tracker/worker test
```

The tests cover H3 GeoJSON coordinate serialization, the city roster, GPS quality requirements, and walking-speed validation.

### Manual app test

1. Use the iOS development build on a physical iPhone.
2. Grant **Precise Location** and **Always Allow** location access when prompted.
3. On the **Explore** tab, select **Start Walk** and walk outside for several minutes.
4. Confirm green hexagons appear on the map and the in-walk tile count increases.
5. End the walk, then open **Progress** to confirm the session and tile counts are recorded.
6. To verify the fairness rule, move faster than the configured 15 km/h limit (for example, in a car). Unlocking should show as paused until two later, walking-speed fixes re-establish a valid movement segment.

## Sample data

No seed user data is required. Each install begins with an anonymous account and creates its own walk and tile records. The optional city import uses the committed [`launch roster`](./supabase/city-boundaries/launch-roster.json) and retrieves its reviewed official boundaries as described in the city-boundary guide.

## Key product and engineering decisions

- **H3 resolution 12:** roughly 20-metre tiles make a short detour feel rewarding while helping reduce random GPS-drift unlocks. H3's hierarchy also allows future aggregation into larger tiles without losing existing progress.
- **Server-authoritative awarding:** the app can queue and display fixes, but the Worker applies the quality and speed rules before awarding a tile.
- **Walking-speed gate:** movement above 15 km/h pauses unlocking. The cap is configured in the Worker, so it can be tuned without shipping a new mobile build.
- **Versioned city attribution:** H3 tiles remain stable while supported-city boundaries can be updated and reclassified independently. This avoids coupling an unlock to a changing reverse-geocoding response.
- **Offline-first capture:** SQLite prevents an interrupted network connection from discarding an active walk.

## Built with Codex and GPT-5.6 Terra

Codex with GPT-5.6 Terra was an active partner from product planning through implementation and verification. I used Plan Mode to explore alternatives, make explicit tradeoffs, and turn those decisions into the app's architecture.

| Workflow | How Codex and GPT-5.6 Terra contributed | Result in Walking Tracker |
| --- | --- | --- |
| Tile design | Evaluated tile size against GPS drift, walking progress, and the ability to change the presentation later. | H3 resolution 12, with cells roughly 20 metres across. The H3 hierarchy preserves the option to aggregate existing progress into larger tiles later. |
| Fair-play rules | Worked through GPS quality requirements and how to prevent a vehicle trip from being mistaken for a walk. | The Worker accepts only precise, recent, accurate fixes and pauses awarding above 15 km/h. It requires a new valid pair of fixes after a fast segment before unlocking resumes. |
| City attribution | Compared reverse geocoding with a versioned-boundary approach and identified the need to keep city classification separate from durable tile ownership. | A PostGIS model with versioned municipal-boundary catalogs and independent H3-to-city assignments. |
| Official city data | Planned and implemented the automated import workflow: retrieve the exact reviewed municipal features from U.S. Census and Statistics Canada services, convert them to WGS84 GeoJSON, validate matches and overlaps, and load them into Supabase/Postgres. | [`scripts/import-city-boundaries.mjs`](./scripts/import-city-boundaries.mjs) and the committed launch roster automate the city-boundary pipeline instead of relying on manual map data preparation. |
| Mobile and API implementation | Accelerated the Expo/React Native app structure, background-location permissions, SQLite queue, Cloudflare Worker endpoints, H3 geometry serialization, and PostGIS migrations. | A working loop from starting a walk through server-verified tile awards to map and progress views. |
| Verification | Helped create tests around the edge cases that matter for a location game. | Automated tests for H3 GeoJSON coordinate order, city-roster integrity, GPS-quality gates, and speed-gate behavior. |

GPT-5.6 Terra was used through Codex throughout this workflow. Codex helped connect high-level product questions to implementation details, while I made the final product and engineering decisions.

## Project layout

- [`apps/mobile`](./apps/mobile): Expo/React Native iOS app.
- [`apps/worker`](./apps/worker): Cloudflare Worker API and H3 validation/awarding logic.
- [`supabase/migrations`](./supabase/migrations): PostgreSQL/PostGIS schema, functions, and RLS policies.
- [`supabase/city-boundaries`](./supabase/city-boundaries): versioned city roster and official-boundary import procedure.

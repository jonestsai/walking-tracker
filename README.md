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

Codex with GPT-5.6 Terra was used as an active development partner, not merely for code generation. In Plan Mode, it helped evaluate the core design tradeoffs around tile size, GPS quality, city attribution, and fair-play validation. Those conversations informed the H3 resolution-12 grid, backend speed gate, and versioned city-boundary model.

During implementation, Codex accelerated the Expo/React Native app structure, background-location and offline-queue flows, Cloudflare Worker API, H3 geometry serialization, PostGIS migrations, official-boundary import pipeline, and the automated tests for GPS quality and speed behavior. GPT-5.6 Terra was used through Codex in this development workflow.

## Project layout

- [`apps/mobile`](./apps/mobile): Expo/React Native iOS app.
- [`apps/worker`](./apps/worker): Cloudflare Worker API and H3 validation/awarding logic.
- [`supabase/migrations`](./supabase/migrations): PostgreSQL/PostGIS schema, functions, and RLS policies.
- [`supabase/city-boundaries`](./supabase/city-boundaries): versioned city roster and official-boundary import procedure.

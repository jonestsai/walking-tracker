# Location Tracker

Privacy-first walking exploration app. H3 resolution 12 is the canonical v1 unlock grid.

## Layout

- `apps/mobile`: Expo/React Native iOS application.
- `apps/worker`: Cloudflare Worker API and H3 validation/awarding logic.
- `supabase/migrations`: Postgres/PostGIS schema, RPCs, and RLS policies.

## Setup

1. Create a Supabase project and enable the PostGIS extension.
2. Apply `supabase/migrations/202607160001_initial.sql` using the Supabase CLI or SQL editor.
3. Create a worker-specific Supabase Secret key, then copy `apps/worker/.dev.vars.example` to `apps/worker/.dev.vars` and provide it there. Never expose this key to the mobile app.
4. Copy `apps/mobile/.env.example` to `apps/mobile/.env` and provide the Worker URL, Supabase URL, and Supabase Publishable key.
5. Install dependencies with `npm install`, then run `npm run dev:mobile` or `npm run dev:worker`.

The app must run in an Expo development build, not Expo Go, because iOS background location is required.

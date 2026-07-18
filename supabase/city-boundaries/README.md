# City-boundary import

`launch-roster.json` is the reviewed launch list: 100 U.S. incorporated municipalities, 25 Canadian Census Subdivisions, and the curated District of North Vancouver demo expansion. It intentionally contains names and jurisdiction codes, not hand-copied geometry or guessed identifiers.

For `north-america-municipal-2025-v1`:

Run the automated importer instead of manually converting files:

```sh
node scripts/import-city-boundaries.mjs --output /private/tmp/north-america-cities.geojson
SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/import-city-boundaries.mjs --load
```

It reads the committed roster, downloads its exact features from the official 2025 Census incorporated-places and Statistics Canada CSD services, converts them to WGS84 GeoJSON, loads them through `upsert_supported_city_boundary`, rejects duplicate/missing matches and unapproved overlaps, then refreshes H3 assignments. Shared-water overlap centroids are intentionally left unassigned. Apply every city-attribution migration before using `--load`.

The loader must fail if a roster entry has no exact official-source match or more than one match; it must never select a nearest city. When publishing a later catalog, load and validate it first, change the active catalog in one transaction, then run the refresh function for the new catalog.

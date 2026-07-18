#!/usr/bin/env node
/**
 * Downloads the exact launch roster from the official 2025 government boundary
 * services. With --load it calls the Supabase service-role RPCs added by the
 * city-attribution migration, validates overlap, and refreshes H3 assignments.
 *
 * Usage:
 *   node scripts/import-city-boundaries.mjs --output /private/tmp/cities.geojson
 *   SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/import-city-boundaries.mjs --load
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import roster from "../supabase/city-boundaries/launch-roster.json" with { type: "json" };

const US_PLACES_URL = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer/4/query";
const CANADA_CSD_URL = "https://geo.statcan.gc.ca/geo_wa/rest/services/2025/lcsd000a25s_e/MapServer/0/query";

const stateFips = {
  AK: "02", AZ: "04", CA: "06", CO: "08", DC: "11", FL: "12", GA: "13", HI: "15", ID: "16", IL: "17", IN: "18", KS: "20", KY: "21", LA: "22", MA: "25", MD: "24", MI: "26", MN: "27", MO: "29", NC: "37", NE: "31", NJ: "34", NM: "35", NV: "32", NY: "36", OH: "39", OK: "40", OR: "41", PA: "42", TN: "47", TX: "48", VA: "51", WA: "53", WI: "55",
};

const provinceUids = { AB: "48", BC: "59", MB: "46", NS: "12", ON: "35", QC: "24", SK: "47" };

// The legal source uses these official base names instead of the common names
// in the product roster. Every exception remains explicit and reviewable.
const sourceNameOverrides = {
  "US:IN:Indianapolis": "Indianapolis city (balance)",
  "US:KY:Louisville": "Louisville/Jefferson County metro government (balance)",
  "US:TN:Nashville": "Nashville-Davidson metropolitan government (balance)",
  "US:ID:Boise": "Boise City",
  "US:MN:Saint Paul": "St. Paul",
  "CA:BC:District of North Vancouver": "North Vancouver",
};

const sourceCsdTypeOverrides = {
  "CA:ON:Hamilton": "C",
  "CA:BC:District of North Vancouver": "DM",
};

const args = new Set(process.argv.slice(2));
const outputIndex = process.argv.indexOf("--output");
const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
if (outputIndex >= 0 && !outputPath) throw new Error("--output requires a path");

function sourceName(city) {
  return sourceNameOverrides[`${city.country}:${city.subdivision}:${city.name}`] ?? city.name;
}

async function officialFeature(url, where, outFields) {
  const query = new URLSearchParams({ where, outFields, returnGeometry: "true", outSR: "4326", f: "geojson" });
  let response;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    response = await fetch(`${url}?${query}`);
    if (response.ok || (response.status !== 403 && response.status !== 429 && response.status < 500)) break;
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  if (!response.ok) throw new Error(`Official boundary request failed (${response.status}): ${where}`);
  const collection = await response.json();
  if (!Array.isArray(collection.features) || collection.features.length !== 1) {
    throw new Error(`Expected one official feature for ${where}; found ${collection.features?.length ?? "an error"}`);
  }
  const [feature] = collection.features;
  if (!feature?.geometry || !feature.properties) throw new Error(`Official feature has no geometry for ${where}`);
  return feature;
}

async function fetchCity(city) {
  if (city.country === "US") {
    const fips = stateFips[city.subdivision];
    if (!fips) throw new Error(`No state FIPS mapping for ${city.subdivision}`);
    const feature = await officialFeature(
      US_PLACES_URL,
      `STATE='${fips}' AND BASENAME='${sourceName(city).replaceAll("'", "''")}'`,
      "STATE,PLACE,NAME,BASENAME",
    );
    return {
      type: "Feature",
      properties: {
        country: city.country,
        subdivision: city.subdivision,
        source_id: `${feature.properties.STATE}${feature.properties.PLACE}`,
        name: feature.properties.NAME,
        roster_name: city.name,
      },
      geometry: feature.geometry,
    };
  }

  const provinceUid = provinceUids[city.subdivision];
  if (!provinceUid) throw new Error(`No province UID mapping for ${city.subdivision}`);
  const feature = await officialFeature(
    CANADA_CSD_URL,
    `PRUID='${provinceUid}' AND CSDNAME='${sourceName(city).replaceAll("'", "''")}'${sourceCsdTypeOverrides[`${city.country}:${city.subdivision}:${city.name}`] ? ` AND CSDTYPE='${sourceCsdTypeOverrides[`${city.country}:${city.subdivision}:${city.name}`]}'` : ""}`,
    "PRUID,CSDUID,CSDNAME,CSDTYPE",
  );
  return {
    type: "Feature",
    properties: {
      country: city.country,
      subdivision: city.subdivision,
      source_id: feature.properties.CSDUID,
      name: feature.properties.CSDNAME,
      roster_name: city.name,
      csd_type: feature.properties.CSDTYPE,
    },
    geometry: feature.geometry,
  };
}

async function supabaseRequest(path, body, method = "POST") {
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required with --load");
  const curl = spawn("curl", [
    "--fail-with-body", "--silent", "--show-error", "--request", method, `${url}${path}`,
    "--header", `apikey: ${secret}`,
    "--header", `authorization: Bearer ${secret}`,
    ...(method === "GET" ? [] : ["--header", "content-type: application/json", "--data-binary", "@-"]),
  ]);
  const stdout = [];
  const stderr = [];
  curl.stdout.on("data", (chunk) => stdout.push(chunk));
  curl.stderr.on("data", (chunk) => stderr.push(chunk));
  const completion = new Promise((resolve, reject) => {
    curl.on("error", reject);
    curl.on("close", resolve);
  });
  if (method !== "GET") curl.stdin.end(JSON.stringify(body));
  else curl.stdin.end();
  const exitCode = await completion;
  if (exitCode !== 0) throw new Error(`Supabase ${path} failed: ${Buffer.concat(stderr).toString()}`);
  const text = Buffer.concat(stdout).toString();
  return text ? JSON.parse(text) : null;
}

async function load(features) {
  for (const feature of features) {
    await supabaseRequest("/rest/v1/rpc/upsert_supported_city_boundary", {
      p_catalog_version: roster.catalogVersion,
      p_country_code: feature.properties.country,
      p_subdivision_code: feature.properties.subdivision,
      p_source_id: feature.properties.source_id,
      p_name: feature.properties.name,
      p_geometry: feature.geometry,
    });
  }

  const [catalog] = await supabaseRequest(`/rest/v1/city_boundary_catalogs?version=eq.${encodeURIComponent(roster.catalogVersion)}&select=id`, undefined, "GET");
  if (!catalog?.id) throw new Error(`City catalog ${roster.catalogVersion} was not found`);

  const overlaps = await supabaseRequest("/rest/v1/rpc/city_boundary_overlap_issues", { p_catalog_id: catalog.id });
  if (Array.isArray(overlaps) && overlaps.length > 0) throw new Error(`Boundary import has ${overlaps.length} overlapping city pair(s)`);
  await supabaseRequest("/rest/v1/rpc/refresh_h3_cell_city_assignments", {});
}

async function mapWithConcurrency(items, limit, task) {
  const results = new Array(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(items[index]);
    }
  }));
  return results;
}

const features = await mapWithConcurrency(roster.cities, 4, fetchCity);
if (features.length !== roster.cities.length) throw new Error(`Expected ${roster.cities.length} features, found ${features.length}`);

if (outputPath) {
  const target = resolve(outputPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify({ type: "FeatureCollection", features })}\n`);
  console.log(`Wrote ${features.length} official boundaries to ${target}`);
}
if (args.has("--load")) {
  await load(features);
  console.log(`Loaded ${features.length} official boundaries and refreshed H3 city assignments.`);
}
if (!outputPath && !args.has("--load")) console.log(`Validated ${features.length} official boundaries. Add --output and/or --load to persist them.`);

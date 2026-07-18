import assert from "node:assert/strict";
import test from "node:test";
import roster from "../../../supabase/city-boundaries/launch-roster.json" with { type: "json" };

type RosterCity = { country: "US" | "CA"; subdivision: string; name: string; rank?: number };

test("the roster has the launch cities plus the District of North Vancouver demo expansion", () => {
  const cities = roster.cities as RosterCity[];
  assert.equal(roster.catalogVersion, "north-america-municipal-2025-v1");
  assert.equal(cities.filter((city) => city.country === "US").length, 100);
  assert.equal(cities.filter((city) => city.country === "CA").length, 26);
  assert.deepEqual(cities.find((city) => city.country === "CA" && city.subdivision === "BC" && city.name === "District of North Vancouver"), {
    country: "CA", subdivision: "BC", name: "District of North Vancouver",
  });

  const keys = cities.map((city) => `${city.country}:${city.subdivision}:${city.name}`);
  assert.equal(new Set(keys).size, cities.length, "each roster entry is unique within its jurisdiction");
});

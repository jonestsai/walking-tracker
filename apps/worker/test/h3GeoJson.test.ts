import assert from "node:assert/strict";
import test from "node:test";
import { toAwardCell } from "../src/index";

test("serializes H3 centroids as GeoJSON longitude/latitude", () => {
  const cell = toAwardCell("8c28de10ca937ff");
  const [longitude, latitude] = cell.centroid.coordinates;

  assert.ok(longitude < -123 && longitude > -124);
  assert.ok(latitude > 49 && latitude < 50);
});

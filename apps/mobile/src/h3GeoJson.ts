import { cellToBoundary, polygonToCells } from "h3-js";

type Position = [number, number];

export type FeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { h3Index: string; state?: "fog" | "visited" };
    geometry: { type: "Polygon"; coordinates: Position[][] };
  }>;
};

export function cellsToFeatureCollection(cells: Iterable<string>): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [...new Set(cells)].map((h3Index) => ({
      type: "Feature",
      properties: { h3Index },
      geometry: { type: "Polygon", coordinates: [cellToBoundary(h3Index, true) as Position[]] },
    })),
  };
}

export function cellsInBounds(bounds: [number, number, number, number]): string[] {
  const [west, south, east, north] = bounds;
  return polygonToCells(
    [
      [south, west],
      [south, east],
      [north, east],
      [north, west],
    ],
    12
  );
}

export function fogOfWarFeatureCollection(
  visibleCells: Iterable<string>,
  unlockedCells: Iterable<string>
): FeatureCollection {
  const unlocked = new Set(unlockedCells);
  return {
    type: "FeatureCollection",
    features: [...new Set(visibleCells)].map((h3Index) => ({
      type: "Feature",
      properties: {
        h3Index,
        // Explored cells are deliberately transparent: the base map is the reward.
        state: unlocked.has(h3Index) ? "visited" : "fog",
      },
      geometry: { type: "Polygon", coordinates: [cellToBoundary(h3Index, true) as Position[]] },
    })),
  };
}

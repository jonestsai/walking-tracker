-- h3-js returns cell centers as [latitude, longitude], while GeoJSON/PostGIS
-- requires [longitude, latitude]. Repair only centroids that are outside their
-- own canonical H3 polygon and become covered after swapping their ordinates.
update public.h3_cells
set centroid = extensions.st_setsrid(
  extensions.st_makepoint(extensions.st_y(centroid), extensions.st_x(centroid)),
  4326
)::extensions.geometry(Point, 4326)
where not extensions.st_covers(boundary, centroid)
  and extensions.st_covers(
    boundary,
    extensions.st_setsrid(
      extensions.st_makepoint(extensions.st_y(centroid), extensions.st_x(centroid)),
      4326
    )
  );

-- Re-evaluate every known tile using the repaired centroids.
select public.refresh_h3_cell_city_assignments();

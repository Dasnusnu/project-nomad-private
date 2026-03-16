# Project Nomad — Backlog

Items that have been considered and scoped but are not yet scheduled.

---

## Maps

### Contour / Terrain Maps
**Difficulty:** Medium

Add hillshade and contour line layers to the offline map viewer using DEM (Digital Elevation Model) raster tiles.

**Approach:**
- Source terrain tiles in `raster-dem` format (Mapzen Terrarium or AWS Terrain Tiles, available as PMTiles)
- Add a new `raster-dem` source to the MapLibre style alongside the existing vector sources
- Add a `hillshade` layer for shaded relief rendering
- Add a contour line layer (requires a client-side contour generator or pre-computed contour tiles)
- Integrate terrain PMTiles into the existing map download infrastructure (same pattern as regular map tiles)
- Add a layer toggle button in the map UI to switch terrain on/off

**Notes:**
- Fits the existing PMTiles download system with minimal backend changes
- Terrain tiles are much smaller than satellite imagery
- Contour lines may require a separate tile set or client-side computation via MapLibre's terrain API

### Routing Data Download UI
**Difficulty:** Low-Medium

Add a settings page (similar to `settings/maps`) for downloading OSM PBF routing data files into `/storage/valhalla/`. The `collections/routing.json` file already contains all US state download URLs from Geofabrik; this item is just the UI and download management.

**Depends on:** Route Planning (Valhalla) service — already implemented.

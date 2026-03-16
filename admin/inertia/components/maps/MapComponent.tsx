import Map, {
  FullscreenControl,
  NavigationControl,
  MapProvider,
  Marker,
  Source,
  Layer,
} from 'react-map-gl/maplibre'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Protocol } from 'pmtiles'
import { useEffect } from 'react'
import type { MapMouseEvent } from 'react-map-gl/maplibre'
import type { GeoJSON } from 'geojson'

interface MapComponentProps {
  /** 'start' | 'end' activates crosshair cursor and captures the next click */
  clickMode?: 'start' | 'end' | null
  startCoord?: [number, number] | null
  endCoord?: [number, number] | null
  /** GeoJSON Feature (LineString) for the calculated route */
  routeGeoJSON?: GeoJSON | null
  /** Called when the user clicks the map while clickMode is active */
  onPointSet?: (coord: [number, number]) => void
}

export default function MapComponent({
  clickMode = null,
  startCoord = null,
  endCoord = null,
  routeGeoJSON = null,
  onPointSet,
}: MapComponentProps) {
  useEffect(() => {
    const protocol = new Protocol()
    maplibregl.addProtocol('pmtiles', protocol.tile)
    return () => {
      maplibregl.removeProtocol('pmtiles')
    }
  }, [])

  const handleMapClick = (e: MapMouseEvent) => {
    if (clickMode && onPointSet) {
      onPointSet([e.lngLat.lng, e.lngLat.lat])
    }
  }

  return (
    <MapProvider>
      <Map
        reuseMaps
        style={{ width: '100%', height: '100vh' }}
        mapStyle={`http://${window.location.hostname}:${window.location.port}/api/maps/styles`}
        mapLib={maplibregl}
        initialViewState={{ longitude: -101, latitude: 40, zoom: 3.5 }}
        cursor={clickMode ? 'crosshair' : 'auto'}
        onClick={handleMapClick}
      >
        <NavigationControl style={{ marginTop: '110px', marginRight: '36px' }} />
        <FullscreenControl style={{ marginTop: '30px', marginRight: '36px' }} />

        {/* Route line — white casing underneath the blue line for legibility */}
        {routeGeoJSON && (
          <Source id="route" type="geojson" data={routeGeoJSON}>
            <Layer
              id="route-line-casing"
              type="line"
              paint={{ 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.85 }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
            <Layer
              id="route-line"
              type="line"
              paint={{ 'line-color': '#2563eb', 'line-width': 4 }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
          </Source>
        )}

        {/* Start marker (green) */}
        {startCoord && (
          <Marker longitude={startCoord[0]} latitude={startCoord[1]} color="#16a34a" />
        )}

        {/* End / destination marker (red) */}
        {endCoord && (
          <Marker longitude={endCoord[0]} latitude={endCoord[1]} color="#dc2626" />
        )}
      </Map>
    </MapProvider>
  )
}

import { useState, useCallback } from 'react'
import MapsLayout from '~/layouts/MapsLayout'
import { Head, Link } from '@inertiajs/react'
import MapComponent from '~/components/maps/MapComponent'
import DirectionsPanel from '~/components/maps/DirectionsPanel'
import StyledButton from '~/components/StyledButton'
import { IconArrowLeft, IconRoute } from '@tabler/icons-react'
import { FileEntry } from '../../types/files'
import Alert from '~/components/Alert'
import type { GeoJSON } from 'geojson'

export default function Maps(props: {
  maps: { baseAssetsExist: boolean; regionFiles: FileEntry[] }
}) {
  const alertMessage = !props.maps.baseAssetsExist
    ? 'The base map assets have not been installed. Please download them first to enable map functionality.'
    : props.maps.regionFiles.length === 0
      ? 'No map regions have been downloaded yet. Please download some regions to enable map functionality.'
      : null

  // Directions state — lifted here so MapComponent and DirectionsPanel can share it
  const [directionsOpen, setDirectionsOpen] = useState(false)
  const [clickMode, setClickMode] = useState<'start' | 'end' | null>(null)
  const [startCoord, setStartCoord] = useState<[number, number] | null>(null)
  const [endCoord, setEndCoord] = useState<[number, number] | null>(null)
  const [routeGeoJSON, setRouteGeoJSON] = useState<GeoJSON | null>(null)

  /** Called when the user clicks the map while a click mode is active */
  const handlePointSet = useCallback(
    (coord: [number, number]) => {
      if (clickMode === 'start') {
        setStartCoord(coord)
      } else if (clickMode === 'end') {
        setEndCoord(coord)
      }
      setClickMode(null)
    },
    [clickMode]
  )

  function closeDirections() {
    setDirectionsOpen(false)
    setClickMode(null)
    setStartCoord(null)
    setEndCoord(null)
    setRouteGeoJSON(null)
  }

  return (
    <MapsLayout>
      <Head title="Maps" />
      <div className="relative w-full h-screen overflow-hidden">

        {/* Nav bar — overlaid at the top */}
        <div className="absolute top-0 left-0 right-0 z-50 flex justify-between p-4 bg-gray-50 backdrop-blur-sm shadow-sm print:hidden">
          <Link href="/home" className="flex items-center">
            <IconArrowLeft className="mr-2" size={24} />
            <p className="text-lg text-gray-600">Back to Home</p>
          </Link>
          <div className="flex items-center gap-3 mr-4">
            <StyledButton
              variant={directionsOpen ? 'primary' : 'outline'}
              icon="IconRoute"
              onClick={() => setDirectionsOpen((o) => !o)}
            >
              Directions
            </StyledButton>
            <Link href="/settings/maps">
              <StyledButton variant="secondary" icon="IconSettings">
                Manage Map Regions
              </StyledButton>
            </Link>
          </div>
        </div>

        {/* Map region / base assets alert */}
        {alertMessage && (
          <div className="absolute top-20 left-4 right-4 z-50 print:hidden">
            <Alert
              title={alertMessage}
              type="warning"
              variant="solid"
              className="w-full"
              buttonProps={{
                variant: 'secondary',
                children: 'Go to Map Settings',
                icon: 'IconSettings',
                onClick: () => {
                  window.location.href = '/settings/maps'
                },
              }}
            />
          </div>
        )}

        {/* Directions panel — floats over the map on the left */}
        {directionsOpen && (
          <div className="absolute top-20 left-4 z-40 print:hidden">
            <DirectionsPanel
              clickMode={clickMode}
              startCoord={startCoord}
              endCoord={endCoord}
              onClickModeChange={setClickMode}
              onStartCoordChange={setStartCoord}
              onEndCoordChange={setEndCoord}
              onRouteChange={setRouteGeoJSON}
              onClose={closeDirections}
            />
          </div>
        )}

        {/* Map canvas */}
        <div className="absolute inset-0">
          <MapComponent
            clickMode={clickMode}
            startCoord={startCoord}
            endCoord={endCoord}
            routeGeoJSON={routeGeoJSON}
            onPointSet={handlePointSet}
          />
        </div>
      </div>
    </MapsLayout>
  )
}

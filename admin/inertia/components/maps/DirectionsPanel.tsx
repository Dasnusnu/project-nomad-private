import { useState, useEffect, useRef } from 'react'
import {
  IconX,
  IconCar,
  IconWalk,
  IconBike,
  IconRoute,
  IconArrowUp,
  IconArrowUpRight,
  IconArrowUpLeft,
  IconCornerDownRight,
  IconCornerDownLeft,
  IconArrowBigRight,
  IconArrowBigLeft,
  IconArrowBackUp,
  IconFlag,
  IconMapPin,
  IconPrinter,
  IconLoader2,
  IconAlertCircle,
  IconCircleDotted,
  IconPointFilled,
} from '@tabler/icons-react'
import type { GeoJSON } from 'geojson'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TravelMode = 'auto' | 'pedestrian' | 'bicycle'

export interface DirectionsPanelProps {
  /** Which waypoint is being set by the next map click */
  clickMode: 'start' | 'end' | null
  startCoord: [number, number] | null
  endCoord: [number, number] | null
  onClickModeChange: (mode: 'start' | 'end' | null) => void
  onStartCoordChange: (coord: [number, number] | null) => void
  onEndCoordChange: (coord: [number, number] | null) => void
  onRouteChange: (route: GeoJSON | null) => void
  onClose: () => void
}

interface ValhallaManeuver {
  type: number
  instruction: string
  length: number   // miles
  time: number     // seconds
  street_names?: string[]
}

interface ValhallaLeg {
  maneuvers: ValhallaManeuver[]
  shape: { type: 'LineString'; coordinates: [number, number][] }
  summary: { length: number; time: number }
}

interface ValhallaRoute {
  trip: {
    legs: ValhallaLeg[]
    summary: { length: number; time: number }
    units: string
    language: string
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`
}

function formatDistance(miles: number): string {
  if (miles < 0.1) return `${Math.round(miles * 5280)} ft`
  return `${miles.toFixed(1)} mi`
}

function formatCoord(coord: [number, number]): string {
  return `${coord[1].toFixed(5)}, ${coord[0].toFixed(5)}`
}

/** Map a Valhalla maneuver type integer to a descriptive Tabler icon */
function ManeuverIcon({ type, size = 16 }: { type: number; size?: number }) {
  const props = { size, className: 'flex-shrink-0 text-blue-600' }
  switch (type) {
    case 1:  // depart
    case 2:  // depart right
    case 3:  // depart left
      return <IconMapPin {...props} className="flex-shrink-0 text-green-600" />
    case 4:  // arrive
    case 5:  // arrive right
    case 6:  // arrive left
      return <IconFlag {...props} className="flex-shrink-0 text-red-500" />
    case 9:  // slight right
      return <IconArrowUpRight {...props} />
    case 10: // right
      return <IconCornerDownRight {...props} />
    case 11: // sharp right
      return <IconArrowBigRight {...props} />
    case 12: // uturn right
    case 13: // uturn left
      return <IconArrowBackUp {...props} />
    case 14: // sharp left
      return <IconArrowBigLeft {...props} />
    case 15: // left
      return <IconCornerDownLeft {...props} />
    case 16: // slight left
      return <IconArrowUpLeft {...props} />
    default: // straight / continue / ramp / merge / roundabout / etc.
      return <IconArrowUp {...props} />
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DirectionsPanel({
  clickMode,
  startCoord,
  endCoord,
  onClickModeChange,
  onStartCoordChange,
  onEndCoordChange,
  onRouteChange,
  onClose,
}: DirectionsPanelProps) {
  const [mode, setMode] = useState<TravelMode>('auto')
  const [route, setRoute] = useState<ValhallaRoute | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [valhallaUp, setValhallaUp] = useState<boolean | null>(null)
  const printRef = useRef<HTMLDivElement>(null)

  // Check if the routing service is reachable on mount
  useEffect(() => {
    fetch('/api/routing/status')
      .then((r) => r.json())
      .then((d) => setValhallaUp(d.available))
      .catch(() => setValhallaUp(false))
  }, [])

  async function getDirections() {
    if (!startCoord || !endCoord) return
    setLoading(true)
    setError(null)
    setRoute(null)
    onRouteChange(null)

    try {
      const res = await fetch('/api/routing/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locations: [
            { lon: startCoord[0], lat: startCoord[1] },
            { lon: endCoord[0], lat: endCoord[1] },
          ],
          costing: mode,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not calculate route.')
        return
      }

      const routeData = data as ValhallaRoute
      setRoute(routeData)

      // Build a single GeoJSON FeatureCollection from all leg shapes so
      // MapComponent can render the route line directly
      const allCoords = routeData.trip.legs.flatMap((leg) => leg.shape.coordinates)
      onRouteChange({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: allCoords },
        properties: {},
      })
    } catch {
      setError('Route Planning service is unavailable. Install the service and download routing data first.')
    } finally {
      setLoading(false)
    }
  }

  function clearAll() {
    onStartCoordChange(null)
    onEndCoordChange(null)
    onRouteChange(null)
    onClickModeChange(null)
    setRoute(null)
    setError(null)
  }

  function handlePrint() {
    window.print()
  }

  const canRoute = !!startCoord && !!endCoord && !loading
  const summary = route?.trip.summary

  const modeLabel: Record<TravelMode, string> = {
    auto: 'Driving',
    pedestrian: 'Walking',
    bicycle: 'Cycling',
  }

  // Flatten all maneuvers across legs for the step list
  const allManeuvers: ValhallaManeuver[] = route?.trip.legs.flatMap((l) => l.maneuvers) ?? []

  // -------------------------------------------------------------------------
  // The hidden printable section (only visible to the browser print dialog)
  // The rest of the UI is hidden via @media print styles defined below
  // -------------------------------------------------------------------------
  const PrintView = () => (
    <div id="nomad-directions-print" className="hidden print:block">
      <style>{`
        @media print {
          /* Hide everything on the page except our print section */
          body > * { display: none !important; }
          #nomad-directions-print { display: block !important; }

          /* Reset page styles */
          #nomad-directions-print {
            font-family: Arial, Helvetica, sans-serif;
            font-size: 11pt;
            color: #000;
            padding: 16px;
            max-width: 100%;
          }
        }
      `}</style>

      <div style={{ borderBottom: '2px solid #333', paddingBottom: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Directions</div>
        <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>
          <strong>From:</strong> {startCoord ? formatCoord(startCoord) : '—'}
          &nbsp;&nbsp;
          <strong>To:</strong> {endCoord ? formatCoord(endCoord) : '—'}
        </div>
        {summary && (
          <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
            <strong>Mode:</strong> {modeLabel[mode]}
            &nbsp;&nbsp;
            <strong>Distance:</strong> {formatDistance(summary.length)}
            &nbsp;&nbsp;
            <strong>Est. time:</strong> {formatDuration(summary.time)}
          </div>
        )}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ backgroundColor: '#f0f0f0' }}>
            <th style={{ width: 28, textAlign: 'center', padding: '4px 6px', border: '1px solid #ccc' }}>#</th>
            <th style={{ textAlign: 'left', padding: '4px 6px', border: '1px solid #ccc' }}>Direction</th>
            <th style={{ width: 70, textAlign: 'right', padding: '4px 6px', border: '1px solid #ccc' }}>Distance</th>
          </tr>
        </thead>
        <tbody>
          {allManeuvers.map((m, i) => (
            <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#f9f9f9' }}>
              <td style={{ textAlign: 'center', padding: '4px 6px', border: '1px solid #ccc', fontSize: 10 }}>{i + 1}</td>
              <td style={{ padding: '4px 6px', border: '1px solid #ccc' }}>{m.instruction}</td>
              <td style={{ textAlign: 'right', padding: '4px 6px', border: '1px solid #ccc', fontSize: 10, whiteSpace: 'nowrap' }}>
                {m.length > 0 ? formatDistance(m.length) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 12, fontSize: 9, color: '#888' }}>
        Generated by Project Nomad &bull; Powered by Valhalla &amp; OpenStreetMap contributors
      </div>
    </div>
  )

  // -------------------------------------------------------------------------
  // Main panel UI
  // -------------------------------------------------------------------------
  return (
    <>
      {/* Print-only content, always mounted but hidden on screen */}
      {route && <PrintView />}

      {/* Directions panel card */}
      <div className="flex flex-col bg-white shadow-xl rounded-lg overflow-hidden w-72 max-h-[calc(100vh-140px)] print:hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-2 font-semibold text-gray-700 text-sm">
            <IconRoute size={16} />
            Directions
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer" aria-label="Close directions">
            <IconX size={16} />
          </button>
        </div>

        {/* Valhalla not available warning */}
        {valhallaUp === false && (
          <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-800">
            <IconAlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            <span>
              Route Planning service not running. Install it from the Apps page, then
              download routing data (OSM PBF) into <code>/storage/valhalla/</code>.
            </span>
          </div>
        )}

        <div className="flex flex-col gap-0 overflow-y-auto flex-1 min-h-0">

          {/* Waypoint selectors */}
          <div className="px-3 pt-3 pb-2 flex flex-col gap-2">
            {/* Start */}
            <div className="flex items-center gap-2">
              <IconPointFilled size={14} className="flex-shrink-0 text-green-600" />
              <button
                onClick={() => onClickModeChange(clickMode === 'start' ? null : 'start')}
                className={`flex-1 text-left text-xs px-2 py-1.5 rounded border transition-colors cursor-pointer ${
                  clickMode === 'start'
                    ? 'border-green-500 bg-green-50 text-green-700 font-medium'
                    : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300'
                }`}
              >
                {startCoord
                  ? formatCoord(startCoord)
                  : clickMode === 'start'
                  ? 'Click on the map to set start...'
                  : 'Click to set start point'}
              </button>
              {startCoord && (
                <button onClick={() => { onStartCoordChange(null); onRouteChange(null); setRoute(null) }} className="text-gray-300 hover:text-gray-500 cursor-pointer" aria-label="Clear start">
                  <IconX size={12} />
                </button>
              )}
            </div>

            {/* End */}
            <div className="flex items-center gap-2">
              <IconCircleDotted size={14} className="flex-shrink-0 text-red-500" />
              <button
                onClick={() => onClickModeChange(clickMode === 'end' ? null : 'end')}
                className={`flex-1 text-left text-xs px-2 py-1.5 rounded border transition-colors cursor-pointer ${
                  clickMode === 'end'
                    ? 'border-red-400 bg-red-50 text-red-700 font-medium'
                    : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300'
                }`}
              >
                {endCoord
                  ? formatCoord(endCoord)
                  : clickMode === 'end'
                  ? 'Click on the map to set destination...'
                  : 'Click to set destination'}
              </button>
              {endCoord && (
                <button onClick={() => { onEndCoordChange(null); onRouteChange(null); setRoute(null) }} className="text-gray-300 hover:text-gray-500 cursor-pointer" aria-label="Clear destination">
                  <IconX size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Travel mode */}
          <div className="px-3 pb-3 flex gap-1.5">
            {(['auto', 'pedestrian', 'bicycle'] as TravelMode[]).map((m) => {
              const Icon = m === 'auto' ? IconCar : m === 'pedestrian' ? IconWalk : IconBike
              return (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  title={modeLabel[m]}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer ${
                    mode === m
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <Icon size={13} />
                  {modeLabel[m]}
                </button>
              )
            })}
          </div>

          {/* Action buttons */}
          <div className="px-3 pb-3 flex gap-2">
            <button
              onClick={getDirections}
              disabled={!canRoute}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                canRoute
                  ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              {loading ? (
                <><IconLoader2 size={13} className="animate-spin" /> Routing...</>
              ) : (
                <><IconRoute size={13} /> Get Directions</>
              )}
            </button>
            {route && (
              <button
                onClick={handlePrint}
                title="Print directions"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors cursor-pointer"
              >
                <IconPrinter size={13} />
                Print
              </button>
            )}
            {(startCoord || endCoord || route) && (
              <button
                onClick={clearAll}
                title="Clear route"
                className="flex items-center px-2 py-1.5 rounded text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <IconX size={13} />
              </button>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="mx-3 mb-3 flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
              <IconAlertCircle size={13} className="flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Route summary */}
          {summary && (
            <div className="mx-3 mb-1 px-3 py-2 bg-blue-50 border border-blue-100 rounded text-xs text-blue-800 flex justify-between">
              <span className="font-semibold">{formatDistance(summary.length)}</span>
              <span>{formatDuration(summary.time)}</span>
              <span className="text-blue-500">{modeLabel[mode]}</span>
            </div>
          )}

          {/* Turn-by-turn list */}
          {allManeuvers.length > 0 && (
            <div className="flex flex-col divide-y divide-gray-100 border-t border-gray-100 mt-1">
              {allManeuvers.map((maneuver, i) => (
                <div key={i} className="flex items-start gap-2.5 px-3 py-2 hover:bg-gray-50 transition-colors">
                  <div className="flex-shrink-0 w-5 flex items-center justify-center mt-0.5">
                    <ManeuverIcon type={maneuver.type} size={15} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-700 leading-snug">{maneuver.instruction}</p>
                    {maneuver.length > 0 && (
                      <p className="text-[10px] text-gray-400 mt-0.5">{formatDistance(maneuver.length)}</p>
                    )}
                  </div>
                  <span className="flex-shrink-0 text-[10px] text-gray-300 mt-0.5 tabular-nums">{i + 1}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'

// Valhalla runs as a local Docker service on port 8002
const VALHALLA_BASE = 'http://localhost:8002'

export default class RoutingController {
  /**
   * Proxy a route request to the local Valhalla instance.
   *
   * Accepts a Valhalla-compatible request body and forwards it with
   * sensible defaults (miles, GeoJSON shape format) so the frontend
   * can pass coords and a costing mode without knowing Valhalla internals.
   *
   * Returns a 503 with a human-readable message when Valhalla is not running
   * (e.g. service not yet installed, still building routing tiles on first boot).
   */
  async route({ request, response }: HttpContext) {
    const body = request.body()

    try {
      const res = await fetch(`${VALHALLA_BASE}/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...body,
          // Return route geometry as GeoJSON so the frontend can feed it
          // directly to MapLibre without a polyline decode step
          shape_format: 'geojson',
          directions_options: { units: 'miles' },
        }),
        signal: AbortSignal.timeout(30_000),
      })

      const data = await res.json()

      if (!res.ok) {
        return response.status(res.status).json(data)
      }

      return response.json(data)
    } catch (error) {
      logger.warn(`Valhalla routing request failed: ${error.message}`)
      return response.status(503).json({
        error:
          'Route Planning service is unavailable. ' +
          'Please install the Route Planning service and ensure routing data has been downloaded.',
      })
    }
  }

  /**
   * Quick liveness check for the Valhalla service.
   * Returns { available: true } if the service responds, { available: false } otherwise.
   * Used by the DirectionsPanel to show an appropriate prompt to the user.
   */
  async status({ response }: HttpContext) {
    try {
      const res = await fetch(`${VALHALLA_BASE}/status`, {
        signal: AbortSignal.timeout(3_000),
      })
      return response.json({ available: res.ok })
    } catch {
      return response.json({ available: false })
    }
  }
}

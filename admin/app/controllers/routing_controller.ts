import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { RoutingService } from '#services/routing_service'
import {
  assertNotPrivateUrl,
  downloadCollectionValidator,
  filenameParamValidator,
  remoteDownloadValidator,
} from '#validators/common'
import { inject } from '@adonisjs/core'

// Valhalla runs as a Docker service on the shared project-nomad network
const VALHALLA_BASE = 'http://nomad_valhalla:8002'

@inject()
export default class RoutingController {
  constructor(private routingService: RoutingService) {}

  /**
   * Proxy a route request to the local Valhalla instance.
   */
  async route({ request, response }: HttpContext) {
    const body = request.body()

    try {
      const res = await fetch(`${VALHALLA_BASE}/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...body,
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

  async listCuratedCollections({}: HttpContext) {
    return await this.routingService.listCuratedCollections()
  }

  async listPbfFiles({}: HttpContext) {
    return { files: await this.routingService.listPbfFiles() }
  }

  async downloadCollection({ request }: HttpContext) {
    const payload = await request.validateUsing(downloadCollectionValidator)
    const resources = await this.routingService.downloadCollection(payload.slug)
    return {
      message: 'Collection download started successfully',
      slug: payload.slug,
      resources,
    }
  }

  async downloadRemote({ request }: HttpContext) {
    const payload = await request.validateUsing(remoteDownloadValidator)
    assertNotPrivateUrl(payload.url)
    const filename = await this.routingService.downloadRemote(payload.url)
    return {
      message: 'Download started successfully',
      filename,
      url: payload.url,
    }
  }

  async downloadRemotePreflight({ request }: HttpContext) {
    const payload = await request.validateUsing(remoteDownloadValidator)
    assertNotPrivateUrl(payload.url)
    const info = await this.routingService.downloadRemotePreflight(payload.url)
    return info
  }

  async fetchLatestCollections({}: HttpContext) {
    const success = await this.routingService.fetchLatestCollections()
    return { success }
  }

  async delete({ request, response }: HttpContext) {
    const payload = await request.validateUsing(filenameParamValidator)

    try {
      await this.routingService.delete(payload.params.filename)
    } catch (error) {
      if (error.message === 'not_found') {
        return response.status(404).send({
          message: `Routing file with key ${payload.params.filename} not found`,
        })
      }
      throw error
    }

    return { message: 'Routing file deleted successfully' }
  }
}

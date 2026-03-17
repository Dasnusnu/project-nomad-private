import { join, resolve, sep } from 'path'
import { RunDownloadJob } from '#jobs/run_download_job'
import logger from '@adonisjs/core/services/logger'
import InstalledResource from '#models/installed_resource'
import { CollectionManifestService } from './collection_manifest_service.js'
import {
  listDirectoryContents,
  getFileStatsIfExists,
  deleteFileIfExists,
  ensureDirectoryExists,
} from '../utils/fs.js'
import type { CollectionWithStatus, RoutingSpec } from '../../types/collections.js'
import type { FileEntry, DownloadRemoteSuccessCallback } from '../../types/files.js'
import Docker from 'dockerode'
import { SERVICE_NAMES } from '../../constants/service_names.js'

const PBF_MIME_TYPES = [
  'application/octet-stream',
  'application/x-protobuf',
  'application/vnd.openstreetmap.data+pbf',
]

interface IRoutingService {
  downloadRemoteSuccessCallback: DownloadRemoteSuccessCallback
}

export class RoutingService implements IRoutingService {
  private readonly storagePath = '/storage/valhalla'
  private readonly baseDirPath = join(process.cwd(), this.storagePath)

  async listPbfFiles(): Promise<FileEntry[]> {
    await ensureDirectoryExists(this.baseDirPath)
    const items = await listDirectoryContents(this.baseDirPath)
    return items.filter((item) => item.type === 'file' && item.name.endsWith('.osm.pbf'))
  }

  async downloadCollection(slug: string): Promise<string[] | null> {
    const manifestService = new CollectionManifestService()
    const spec = await manifestService.getSpecWithFallback<RoutingSpec>('routing')
    if (!spec) return null

    const collection = spec.collections.find((c) => c.slug === slug)
    if (!collection) return null

    const installed = await InstalledResource.query().where('resource_type', 'routing')
    const installedIds = new Set(installed.map((r) => r.resource_id))
    const toDownload = collection.resources.filter((r) => !installedIds.has(r.id))

    if (toDownload.length === 0) return null

    const downloadFilenames: string[] = []

    for (const resource of toDownload) {
      const existing = await RunDownloadJob.getByUrl(resource.url)
      if (existing) {
        logger.warn(`[RoutingService] Download already in progress for URL ${resource.url}, skipping.`)
        continue
      }

      const filename = resource.url.split('/').pop()
      if (!filename) {
        logger.warn(`[RoutingService] Could not determine filename from URL ${resource.url}, skipping.`)
        continue
      }

      downloadFilenames.push(filename)
      const filepath = join(this.baseDirPath, filename)

      await RunDownloadJob.dispatch({
        url: resource.url,
        filepath,
        timeout: 30000,
        allowedMimeTypes: PBF_MIME_TYPES,
        forceNew: true,
        filetype: 'routing',
        resourceMetadata: {
          resource_id: resource.id,
          version: resource.version,
          collection_ref: slug,
        },
      })
    }

    return downloadFilenames.length > 0 ? downloadFilenames : null
  }

  async downloadRemote(url: string): Promise<{ filename: string; jobId?: string }> {
    const parsed = new URL(url)
    if (!parsed.pathname.endsWith('.osm.pbf')) {
      throw new Error(`Invalid PBF file URL: ${url}. URL must end with .osm.pbf`)
    }

    const existing = await RunDownloadJob.getByUrl(url)
    if (existing) {
      throw new Error(`Download already in progress for URL ${url}`)
    }

    const filename = url.split('/').pop()
    if (!filename) {
      throw new Error('Could not determine filename from URL')
    }

    const filepath = join(this.baseDirPath, filename)

    // Try to find resource metadata from the spec
    const manifestService = new CollectionManifestService()
    const spec = await manifestService.getCachedSpec<RoutingSpec>('routing')
    let resourceMetadata: { resource_id: string; version: string; collection_ref: null } | undefined

    if (spec) {
      for (const collection of spec.collections) {
        const match = collection.resources.find((r) => r.url === url)
        if (match) {
          resourceMetadata = { resource_id: match.id, version: match.version, collection_ref: null }
          break
        }
      }
    }

    const result = await RunDownloadJob.dispatch({
      url,
      filepath,
      timeout: 30000,
      allowedMimeTypes: PBF_MIME_TYPES,
      forceNew: true,
      filetype: 'routing',
      resourceMetadata,
    })

    if (!result.job) {
      throw new Error('Failed to dispatch download job')
    }

    logger.info(`[RoutingService] Dispatched download job ${result.job.id} for URL ${url}`)

    return { filename, jobId: result.job?.id }
  }

  async downloadRemotePreflight(
    url: string
  ): Promise<{ filename: string; size: number } | { message: string }> {
    try {
      const parsed = new URL(url)
      if (!parsed.pathname.endsWith('.osm.pbf')) {
        throw new Error(`Invalid PBF file URL: ${url}. URL must end with .osm.pbf`)
      }

      const filename = url.split('/').pop()
      if (!filename) throw new Error('Could not determine filename from URL')

      const { default: axios } = await import('axios')
      const response = await axios.head(url)

      if (response.status !== 200) {
        throw new Error(`Failed to fetch file info: ${response.status} ${response.statusText}`)
      }

      const contentLength = response.headers['content-length']
      const size = contentLength ? parseInt(contentLength, 10) : 0

      return { filename, size }
    } catch (error: any) {
      return { message: `Preflight check failed: ${error.message}` }
    }
  }

  async downloadRemoteSuccessCallback(urls: string[], _: boolean) {
    const manifestService = new CollectionManifestService()
    const spec = await manifestService.getCachedSpec<RoutingSpec>('routing')

    // Build a URL -> resource map for quick lookups
    const urlToResource = new Map<string, { id: string; version: string }>()
    if (spec) {
      for (const collection of spec.collections) {
        for (const resource of collection.resources) {
          urlToResource.set(resource.url, { id: resource.id, version: resource.version })
        }
      }
    }

    for (const url of urls) {
      const filename = url.split('/').pop()
      if (!filename) continue

      const specResource = urlToResource.get(url)
      const resource_id = specResource?.id ?? filename.replace('.osm.pbf', '')
      const version = specResource?.version ?? 'latest'

      const filepath = join(this.baseDirPath, filename)
      const stats = await getFileStatsIfExists(filepath)

      try {
        const { DateTime } = await import('luxon')
        await InstalledResource.updateOrCreate(
          { resource_id, resource_type: 'routing' },
          {
            version,
            url,
            file_path: filepath,
            file_size_bytes: stats ? Number(stats.size) : null,
            installed_at: DateTime.now(),
          }
        )
        logger.info(`[RoutingService] Created InstalledResource entry for: ${resource_id}`)
      } catch (error) {
        logger.error(`[RoutingService] Failed to create InstalledResource for ${filename}:`, error)
      }
    }

    await this.restartValhalla()
  }

  async delete(file: string): Promise<void> {
    let fileName = file
    if (!fileName.endsWith('.osm.pbf')) {
      fileName += '.osm.pbf'
    }

    const basePath = resolve(this.baseDirPath)
    const fullPath = resolve(join(basePath, fileName))

    if (!fullPath.startsWith(basePath + sep)) {
      throw new Error('Invalid filename')
    }

    const exists = await getFileStatsIfExists(fullPath)
    if (!exists) {
      throw new Error('not_found')
    }

    await deleteFileIfExists(fullPath)

    // Clean up InstalledResource entry by file path or filename-derived id
    const resource_id = fileName.replace('.osm.pbf', '')
    await InstalledResource.query()
      .where('resource_type', 'routing')
      .where((q) => {
        q.where('resource_id', resource_id).orWhere('file_path', fullPath)
      })
      .delete()

    logger.info(`[RoutingService] Deleted PBF file: ${fileName}`)

    await this.restartValhalla()
  }

  async listCuratedCollections(): Promise<CollectionWithStatus[]> {
    const manifestService = new CollectionManifestService()
    return manifestService.getRoutingCollectionsWithStatus()
  }

  async fetchLatestCollections(): Promise<boolean> {
    const manifestService = new CollectionManifestService()
    return manifestService.fetchAndCacheSpec('routing')
  }

  private async restartValhalla(): Promise<void> {
    try {
      const isWindows = process.platform === 'win32'
      const docker = new Docker({
        socketPath: isWindows ? '//./pipe/docker_engine' : '/var/run/docker.sock',
      })
      const containers = await docker.listContainers({ all: true })
      const container = containers.find((c) =>
        c.Names.includes(`/${SERVICE_NAMES.VALHALLA}`)
      )
      if (!container) {
        logger.warn('[RoutingService] Valhalla container not found, skipping restart')
        return
      }
      await docker.getContainer(container.Id).restart()
      logger.info('[RoutingService] Valhalla container restarted to rebuild routing tiles')
    } catch (error) {
      logger.error('[RoutingService] Failed to restart Valhalla container:', error)
    }
  }
}

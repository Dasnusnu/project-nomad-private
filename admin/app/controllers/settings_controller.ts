import KVStore from '#models/kv_store'
import { BenchmarkService } from '#services/benchmark_service'
import { MapService } from '#services/map_service'
import { OllamaService } from '#services/ollama_service'
import { RagService } from '#services/rag_service'
import { RoutingService } from '#services/routing_service'
import { SystemService } from '#services/system_service'
import { getSettingSchema, updateSettingSchema } from '#validators/settings'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'

@inject()
export default class SettingsController {
  constructor(
    private systemService: SystemService,
    private mapService: MapService,
    private benchmarkService: BenchmarkService,
    private ollamaService: OllamaService,
    private ragService: RagService,
    private routingService: RoutingService
  ) {}

  async system({ inertia }: HttpContext) {
    const systemInfo = await this.systemService.getSystemInfo()
    return inertia.render('settings/system', {
      system: {
        info: systemInfo,
      },
    })
  }

  async apps({ inertia }: HttpContext) {
    const services = await this.systemService.getServices({ installedOnly: false })
    return inertia.render('settings/apps', {
      system: {
        services,
      },
    })
  }

  async legal({ inertia }: HttpContext) {
    return inertia.render('settings/legal')
  }

  async support({ inertia }: HttpContext) {
    return inertia.render('settings/support')
  }

  async maps({ inertia }: HttpContext) {
    const baseAssetsCheck = await this.mapService.ensureBaseAssets()
    const regionFiles = await this.mapService.listRegions()
    return inertia.render('settings/maps', {
      maps: {
        baseAssetsExist: baseAssetsCheck,
        regionFiles: regionFiles.files,
      },
    })
  }

  async models({ inertia }: HttpContext) {
    const availableModels = await this.ollamaService.getAvailableModels({
      sort: 'pulls',
      recommendedOnly: false,
      query: null,
      limit: 15,
    })
    const installedModels = await this.ollamaService.getModels().catch(() => [])
    const chatSuggestionsEnabled = await KVStore.getValue('chat.suggestionsEnabled')
    const aiAssistantCustomName = await KVStore.getValue('ai.assistantCustomName')
    const remoteOllamaUrl = await KVStore.getValue('ai.remoteOllamaUrl')
    const ollamaFlashAttention = await KVStore.getValue('ai.ollamaFlashAttention')
    return inertia.render('settings/models', {
      models: {
        availableModels: availableModels?.models || [],
        installedModels: installedModels || [],
        settings: {
          chatSuggestionsEnabled: chatSuggestionsEnabled ?? false,
          aiAssistantCustomName: aiAssistantCustomName ?? '',
          remoteOllamaUrl: remoteOllamaUrl ?? '',
          ollamaFlashAttention: ollamaFlashAttention ?? true,
        },
      },
    })
  }

  async update({ inertia }: HttpContext) {
    const updateInfo = await this.systemService.checkLatestVersion()
    return inertia.render('settings/update', {
      system: {
        updateAvailable: updateInfo.updateAvailable,
        latestVersion: updateInfo.latestVersion,
        currentVersion: updateInfo.currentVersion,
      },
    })
  }

  async routing({ inertia }: HttpContext) {
    const pbfFiles = await this.routingService.listPbfFiles()
    return inertia.render('settings/routing', {
      routing: {
        pbfFiles,
      },
    })
  }

  async zim({ inertia }: HttpContext) {
    return inertia.render('settings/zim/index')
  }

  async zimRemote({ inertia }: HttpContext) {
    return inertia.render('settings/zim/remote-explorer')
  }

  async benchmark({ inertia }: HttpContext) {
    const latestResult = await this.benchmarkService.getLatestResult()
    const status = this.benchmarkService.getStatus()
    return inertia.render('settings/benchmark', {
      benchmark: {
        latestResult,
        status: status.status,
        currentBenchmarkId: status.benchmarkId,
      },
    })
  }

  async getSetting({ request, response }: HttpContext) {
    const { key } = await getSettingSchema.validate({ key: request.qs().key })
    const value = await KVStore.getValue(key)
    return response.status(200).send({ key, value })
  }

  async updateSetting({ request, response }: HttpContext) {
    const reqData = await request.validateUsing(updateSettingSchema)
    await this.systemService.updateSetting(reqData.key, reqData.value)

    // When a remote Ollama URL is saved, trigger RAG doc discovery if docs have not
    // been embedded yet. This handles the case where a user configures a remote
    // Ollama instance without ever installing the local Ollama container (which is
    // the normal trigger for discoverNomadDocs).
    if (reqData.key === 'ai.remoteOllamaUrl' && reqData.value) {
      const alreadyEmbedded = await KVStore.getValue('rag.docsEmbedded')
      if (!alreadyEmbedded) {
        logger.info('[SettingsController] Remote Ollama URL saved and docs not yet embedded — triggering RAG discovery')
        this.ragService.discoverNomadDocs().catch((err) => {
          logger.error('[SettingsController] RAG discovery triggered by remote URL save failed:', err)
        })
      }
    }

    return response.status(200).send({ success: true, message: 'Setting updated successfully' })
  }
}

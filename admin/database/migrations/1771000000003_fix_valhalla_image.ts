import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    await this.db
      .from('services')
      .where('service_name', 'nomad_valhalla')
      .update({
        container_image: 'ghcr.io/nilsnolde/docker-valhalla/valhalla:latest',
        source_repo: 'https://github.com/nilsnolde/docker-valhalla',
      })
  }

  async down() {
    await this.db
      .from('services')
      .where('service_name', 'nomad_valhalla')
      .update({
        container_image: 'ghcr.io/gis-ops/docker-valhalla:latest',
        source_repo: 'https://github.com/gis-ops/docker-valhalla',
      })
  }
}

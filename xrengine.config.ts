import type { ProjectConfigInterface } from '@ir-engine/projects/ProjectConfigInterface'

const config: ProjectConfigInterface = {
  thumbnail: '/static/ir-engine_thumbnail.jpg',
  worldInjection: () => import('./src/worldInjection')
}

export default config

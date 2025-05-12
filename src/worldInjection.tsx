import { useEffect } from 'react'

import {
  createEntity,
  defineSystem,
  EntityID,
  EntityTreeComponent,
  PresentationSystemGroup,
  removeEntity,
  setComponent,
  SourceID,
  UUIDComponent
} from '@ir-engine/ecs'
import { useMutableState } from '@ir-engine/hyperflux'
import { ReferenceSpaceState, TransformComponent } from '@ir-engine/spatial'
import { NameComponent } from '@ir-engine/spatial/src/common/NameComponent'
import { MeshComponent } from '@ir-engine/spatial/src/renderer/components/MeshComponent'
import { VisibleComponent } from '@ir-engine/spatial/src/renderer/components/VisibleComponent'
import { Mesh, MeshLambertMaterial, Vector3 } from 'three'
import { createChunkGrid } from './chunk/ChunkGrid'

defineSystem({
  uuid: 'hexafield.marching-cubes.MarchingCubesSystem',
  insert: { after: PresentationSystemGroup },
  reactor: () => {
    const originEntity = useMutableState(ReferenceSpaceState).originEntity.value

    useEffect(() => {
      if (!originEntity) return

      const gridEntity = createEntity()
      setComponent(gridEntity, UUIDComponent, {
        entitySourceID: 'source' as SourceID,
        entityID: 'marching-cubes-grid' as EntityID
      })
      setComponent(gridEntity, TransformComponent, { position: new Vector3(0, 0.5, 0) })
      setComponent(gridEntity, EntityTreeComponent, { parentEntity: originEntity })
      setComponent(gridEntity, NameComponent, 'Marching Cubes Grid')
      setComponent(gridEntity, VisibleComponent)

      // Create a grid of chunks
      const chunkGrid = createChunkGrid({
        gridSize: [8, 8, 8],
        chunkSize: 16,
        chunkResolution: 16,
        seed: 1337,
        isolevel: 0.0,
        center: [0, 0, 0]
      })

      // Create entities for each chunk
      const entities: any[] = []

      ;[...chunkGrid.chunkMap.keys()].forEach((key, index: number) => {
        const entity = createEntity()
        setComponent(entity, UUIDComponent, {
          entitySourceID: 'source' as SourceID,
          entityID: `marching-cubes-chunk-${index}` as EntityID
        })
        const [x, y, z] = key.split(',').map(Number)
        setComponent(entity, TransformComponent, { position: chunkGrid.getOffset(x, y, z, _vec3) })
        setComponent(entity, EntityTreeComponent, { parentEntity: gridEntity })
        const xzDistanceFromCenter = Math.sqrt(x * x + z * z)
        // scale distance from range to powers of 2
        const simplificationFactor = Math.pow(2, Math.floor(xzDistanceFromCenter / 2))
        console.log({ key, xzDistanceFromCenter, simplificationFactor })
        const geometry = chunkGrid.generateGeometry(x, y, z, simplificationFactor)
        setComponent(entity, MeshComponent, new Mesh(geometry, new MeshLambertMaterial({ color: 0x00ff00 })))
        setComponent(entity, NameComponent, `Marching Cubes Chunk ${index}`)
        setComponent(entity, VisibleComponent)

        entities.push(entity)
      })

      return () => {
        // Clean up all entities when the system is destroyed
        entities.forEach((entity) => removeEntity(entity))
      }
    }, [originEntity])

    return null
  }
})

const _vec3 = new Vector3()

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
import { Mesh, Vector3 } from 'three'
import { createGridMesh } from './marchingcubes/MarchingCubesMesh'
import { GridData } from './marchingcubes/triangulation'

/**
 * Creates a simple sphere using marching cubes
 * @param center The center position of the sphere [x, y, z]
 * @param radius The radius of the sphere
 * @param resolution The resolution of the grid (higher = more detailed)
 * @param isolevel The isolevel value that determines the surface
 * @returns The created mesh
 */
export function createMarchingCubesSphere(
  center: [number, number, number] = [0, 0, 0],
  radius: number = 1,
  resolution: number = 16,
  isolevel: number = 0.5
): Mesh {
  // Create a grid for the sphere
  const grid = createSphereGrid(center, radius, resolution)

  // Create a mesh using marching cubes
  const mesh = createGridMesh(grid, isolevel)

  return mesh
}

/**
 * Creates a grid for a sphere
 * @param center The center position of the sphere
 * @param radius The radius of the sphere
 * @param resolution The resolution of the grid (higher = more detailed)
 * @returns A grid data structure containing scalar values for the sphere
 */
function createSphereGrid(center: [number, number, number], radius: number, resolution: number): GridData {
  const [cx, cy, cz] = center

  // Create a grid with resolution+1 points in each dimension
  // (we need one more point than the number of cells)
  const gridSize = resolution + 1

  // Initialize the 3D array of scalar values
  const values: number[][][] = Array(gridSize)
    .fill(null)
    .map(() =>
      Array(gridSize)
        .fill(null)
        .map(() => Array(gridSize).fill(0))
    )

  // Calculate the size of the grid
  const size = radius * 2

  // Calculate the step size between grid points
  const step = size / resolution

  // Fill the grid with scalar values
  for (let x = 0; x < gridSize; x++) {
    for (let y = 0; y < gridSize; y++) {
      for (let z = 0; z < gridSize; z++) {
        // Calculate the position of this grid point
        const px = cx - radius + x * step
        const py = cy - radius + y * step
        const pz = cz - radius + z * step

        // Calculate the distance from the center
        const dx = px - cx
        const dy = py - cy
        const dz = pz - cz
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)

        // Value is negative inside the sphere, positive outside
        // This creates an isosurface at value = 0
        values[x][y][z] = distance - radius
      }
    }
  }

  // Return the grid data
  return {
    values,
    origin: { x: cx - radius, y: cy - radius, z: cz - radius },
    cellSize: { x: step, y: step, z: step }
  }
}

defineSystem({
  uuid: 'hexafield.marching-cubes.MarchingCubesSystem',
  insert: { after: PresentationSystemGroup },
  reactor: () => {
    const originEntity = useMutableState(ReferenceSpaceState).originEntity.value

    useEffect(() => {
      if (!originEntity) return

      // Create a more detailed sphere with the new grid-based approach
      const mesh = createMarchingCubesSphere([0, 0, 0], 1, 16, 0.0)

      const entity = createEntity()
      setComponent(entity, UUIDComponent, {
        entitySourceID: 'source' as SourceID,
        entityID: 'marching-cubes-sphere' as EntityID
      })
      setComponent(entity, TransformComponent, { position: new Vector3(0, 1, 0) })
      setComponent(entity, EntityTreeComponent, { parentEntity: originEntity })
      setComponent(entity, MeshComponent, mesh)
      setComponent(entity, NameComponent, 'Marching Cubes Sphere')
      setComponent(entity, VisibleComponent)

      return () => {
        removeEntity(entity)
      }
    }, [originEntity])

    return null
  }
})

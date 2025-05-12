/**
 * Utility for creating Three.js meshes from marching cubes data
 */
import { BufferGeometry, Mesh, MeshStandardMaterial } from 'three'
import { GridData, polygoniseGrid } from './triangulation'

/**
 * Creates a Three.js mesh from a grid of scalar values using marching cubes.
 */
export function createGridMesh(grid: GridData, isolevel: number, material?: MeshStandardMaterial): Mesh {
  const { positions, indices } = polygoniseGrid(grid, isolevel)
  const geometry = new BufferGeometry()

  geometry.setAttribute('position', positions)
  geometry.setIndex(indices)
  geometry.computeVertexNormals()

  const meshMaterial =
    material ||
    new MeshStandardMaterial({
      color: 0x3399ff,
      roughness: 0.5,
      metalness: 0.2
    })

  return new Mesh(geometry, meshMaterial)
}

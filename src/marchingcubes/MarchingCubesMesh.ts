/**
 * Utility for creating Three.js meshes from marching cubes data
 *
 * This implementation uses an efficient normal calculation based on the gradient
 * of the scalar field, as described in Paul Bourke's algorithm:
 * https://paulbourke.net/geometry/polygonise/
 *
 * The normals are calculated during the marching cubes process, which is more
 * efficient than computing them after the fact using Three.js's computeVertexNormals().
 */
import { BufferGeometry, Mesh, MeshStandardMaterial } from 'three'
import { GridData, polygoniseGrid } from './triangulation'

/**
 * Creates a Three.js mesh from a grid of scalar values using marching cubes.
 * Uses gradient-based normals for more efficient and accurate rendering.
 */
export function createGridMesh(grid: GridData, isolevel: number, material?: MeshStandardMaterial): Mesh {
  const { positions, indices, normals } = polygoniseGrid(grid, isolevel)
  const geometry = new BufferGeometry()

  geometry.setAttribute('position', positions)
  geometry.setIndex(indices)

  // Use the calculated normals if available, otherwise compute them
  if (normals) {
    geometry.setAttribute('normal', normals)
  } else {
    geometry.computeVertexNormals()
  }

  const meshMaterial =
    material ||
    new MeshStandardMaterial({
      color: 0x3399ff,
      roughness: 0.5,
      metalness: 0.2
    })

  return new Mesh(geometry, meshMaterial)
}

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
import { BufferGeometry } from 'three'
import { GridData, polygoniseGrid } from './triangulation'

/**
 * Takes a grid, and simplifies it by returning a new grid with only a subset of the original cells
 * @param grid
 * @param simplificationFactor
 */
function simplifyGrid(grid: GridData, simplificationFactor: number): GridData {
  const { values, origin, cellSize } = grid

  const newValues = values
    .filter((_, i) => i % simplificationFactor === 0)
    .map((row) =>
      row
        .filter((_, i) => i % simplificationFactor === 0)
        .map((cell) => cell.filter((_, i) => i % simplificationFactor === 0))
    )

  const newOrigin = {
    x: origin.x + (cellSize.x * (simplificationFactor - 1)) / 2,
    y: origin.y + (cellSize.y * (simplificationFactor - 1)) / 2,
    z: origin.z + (cellSize.z * (simplificationFactor - 1)) / 2
  }

  const newCellSize = {
    x: cellSize.x * simplificationFactor,
    y: cellSize.y * simplificationFactor,
    z: cellSize.z * simplificationFactor
  }

  return {
    values: newValues,
    origin: newOrigin,
    cellSize: newCellSize
  }
}

/**
 * Creates a Three.js geometry from a grid of scalar values using marching cubes.
 * Uses gradient-based normals for more efficient and accurate rendering.
 */
export function createGridGeometry(grid: GridData, isolevel: number, simplificationFactor: number): BufferGeometry {
  const simplifiedGrid = simplifyGrid(grid, simplificationFactor)

  console.log({ grid, simplifiedGrid })
  const { positions, indices, normals } = polygoniseGrid(simplifiedGrid, isolevel * simplificationFactor)
  const geometry = new BufferGeometry()

  geometry.setAttribute('position', positions)
  geometry.setIndex(indices)

  // Use the calculated normals if available, otherwise compute them
  if (normals) {
    geometry.setAttribute('normal', normals)
  } else {
    geometry.computeVertexNormals()
  }

  return geometry
}

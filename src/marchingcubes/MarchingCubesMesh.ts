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
 * Ensures that boundary vertices are preserved for proper stitching between chunks
 * @param grid
 * @param simplificationFactor
 */
function simplifyGrid(grid: GridData, simplificationFactor: number): GridData {
  const { values, origin, cellSize } = grid

  // Get the dimensions of the grid
  const sizeX = values.length
  const sizeY = values[0].length
  const sizeZ = values[0][0].length

  // Create arrays to store which indices to keep in each dimension
  const keepX: number[] = []
  const keepY: number[] = []
  const keepZ: number[] = []

  // Determine which indices to keep in each dimension
  for (let i = 0; i < sizeX; i++) {
    if (i === 0 || i === sizeX - 1 || i % simplificationFactor === 0) {
      keepX.push(i)
    }
  }

  for (let j = 0; j < sizeY; j++) {
    if (j === 0 || j === sizeY - 1 || j % simplificationFactor === 0) {
      keepY.push(j)
    }
  }

  for (let k = 0; k < sizeZ; k++) {
    if (k === 0 || k === sizeZ - 1 || k % simplificationFactor === 0) {
      keepZ.push(k)
    }
  }

  // Create the new simplified grid
  const newSizeX = keepX.length
  const newSizeY = keepY.length
  const newSizeZ = keepZ.length

  // Create a new 3D array with the simplified dimensions
  const newValues: number[][][] = Array(newSizeX)
    .fill(null)
    .map(() =>
      Array(newSizeY)
        .fill(null)
        .map(() => Array(newSizeZ).fill(0))
    )

  // Fill the new array with values from the original grid
  for (let i = 0; i < newSizeX; i++) {
    for (let j = 0; j < newSizeY; j++) {
      for (let k = 0; k < newSizeZ; k++) {
        newValues[i][j][k] = values[keepX[i]][keepY[j]][keepZ[k]]
      }
    }
  }

  // Calculate the new cell size
  // We need to adjust the cell size based on the actual distance between points
  const newCellSize = {
    x: cellSize.x * simplificationFactor,
    y: cellSize.y * simplificationFactor,
    z: cellSize.z * simplificationFactor
  }

  // The origin remains the same to ensure proper alignment
  return {
    values: newValues,
    origin: origin,
    cellSize: newCellSize
  }
}

/**
 * Creates a Three.js geometry from a grid of scalar values using marching cubes.
 * Uses gradient-based normals for more efficient and accurate rendering.
 */
export function createGridGeometry(grid: GridData, isolevel: number, simplificationFactor: number): BufferGeometry {
  // Only simplify if the factor is greater than 1
  const simplifiedGrid = simplificationFactor > 1 ? simplifyGrid(grid, simplificationFactor) : grid

  // The isolevel should not be multiplied by the simplification factor
  // as that would change the shape of the isosurface
  const { positions, indices, normals } = polygoniseGrid(simplifiedGrid, isolevel)
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

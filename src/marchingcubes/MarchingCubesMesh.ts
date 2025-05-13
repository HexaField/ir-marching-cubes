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
import { generateTransvoxelMesh } from './transvoxelImplementation'
import { GridData } from './triangulation'

/**
 * Simplifies a grid by keeping only a subset of points based on the simplification factor.
 * Ensures that boundary vertices are preserved for proper stitching between chunks.
 *
 * For the Transvoxel algorithm, we need to ensure that:
 * 1. We keep all boundary points for proper stitching
 * 2. We maintain a power-of-two relationship between simplification levels
 * 3. The cell size is adjusted correctly
 *
 * @param grid The original grid data
 * @param simplificationFactor The factor by which to simplify (must be a power of 2)
 * @returns A new simplified grid
 */
function simplifyGrid(grid: GridData, simplificationFactor: number): GridData {
  const { values, origin, cellSize } = grid

  // Ensure simplificationFactor is a power of 2
  if (simplificationFactor & (simplificationFactor - 1)) {
    console.warn('Simplification factor should be a power of 2 for optimal results with Transvoxel algorithm')
    // Find the nearest power of 2
    simplificationFactor = Math.pow(2, Math.round(Math.log2(simplificationFactor)))
  }

  // Get the dimensions of the grid
  const sizeX = values.length
  const sizeY = values[0].length
  const sizeZ = values[0][0].length

  // Create arrays to store which indices to keep in each dimension
  const keepX: number[] = []
  const keepY: number[] = []
  const keepZ: number[] = []

  // Determine which indices to keep in each dimension
  // For Transvoxel, we need to keep points at regular intervals based on the simplification factor
  // IMPORTANT: We must keep the first and last points in each dimension for proper boundary handling
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

  // Ensure we have at least 2 points in each dimension
  if (keepX.length < 2) keepX.push(sizeX - 1)
  if (keepY.length < 2) keepY.push(sizeY - 1)
  if (keepZ.length < 2) keepZ.push(sizeZ - 1)

  // Sort the arrays to ensure points are in order
  keepX.sort((a, b) => a - b)
  keepY.sort((a, b) => a - b)
  keepZ.sort((a, b) => a - b)

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
        // Ensure we don't access out of bounds
        const x = Math.min(keepX[i], sizeX - 1)
        const y = Math.min(keepY[j], sizeY - 1)
        const z = Math.min(keepZ[k], sizeZ - 1)
        newValues[i][j][k] = values[x][y][z]
      }
    }
  }

  // Calculate the new cell size
  // For Transvoxel, the cell size needs to be adjusted by the simplification factor
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
 * Creates a Three.js geometry from a grid of scalar values using the Transvoxel algorithm.
 * This handles both regular cells and transition cells for LOD boundaries.
 *
 * @param grid The grid data containing scalar values
 * @param isolevel The isolevel value that defines the surface
 * @param simplificationFactor The factor by which to simplify the grid (must be a power of 2)
 * @returns A Three.js BufferGeometry representing the isosurface
 */
export function createGridGeometry(grid: GridData, isolevel: number, simplificationFactor: number): BufferGeometry {
  // Ensure simplificationFactor is a power of 2
  if (simplificationFactor > 1 && simplificationFactor & (simplificationFactor - 1)) {
    console.warn('Simplification factor should be a power of 2 for optimal results with Transvoxel algorithm')
    // Find the nearest power of 2
    simplificationFactor = Math.pow(2, Math.round(Math.log2(simplificationFactor)))
  }

  // Only simplify if the factor is greater than 1
  const simplifiedGrid = simplificationFactor > 1 ? simplifyGrid(grid, simplificationFactor) : grid

  // Calculate the LOD index (log base 2 of the simplification factor)
  // This is used by the Transvoxel algorithm to determine the level of detail
  const lodIndex = simplificationFactor > 1 ? Math.log2(simplificationFactor) : 0

  try {
    // Generate the mesh using the Transvoxel algorithm
    // This handles both regular cells and transition cells for LOD boundaries
    const { positions, indices, normals } = generateTransvoxelMesh(simplifiedGrid, isolevel, lodIndex)

    // Create a new Three.js geometry
    const geometry = new BufferGeometry()

    // Set the position and index attributes
    geometry.setAttribute('position', positions)
    geometry.setIndex(indices)

    // Use the calculated normals if available, otherwise compute them
    if (normals) {
      geometry.setAttribute('normal', normals)
    } else {
      geometry.computeVertexNormals()
    }

    return geometry
  } catch (error) {
    console.error('Error generating geometry with Transvoxel algorithm:', error)

    // Fallback to a simple empty geometry
    return new BufferGeometry()
  }
}

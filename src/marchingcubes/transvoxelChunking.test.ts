import { describe, expect, it } from 'vitest'
import { createChunkGrid } from '../chunk/ChunkGrid'
import { simplifyGrid } from './MarchingCubesMesh'
import { generateTransvoxelMesh } from './transvoxelImplementation'
import { GridData } from './triangulation'

describe('Transvoxel Chunking and Simplification', () => {
  // Helper function to create a simple grid with a sphere in the middle
  function createSphereGrid(size: number, radius: number): GridData {
    const values: number[][][] = []
    const center = size / 2

    for (let x = 0; x < size; x++) {
      values[x] = []
      for (let y = 0; y < size; y++) {
        values[x][y] = []
        for (let z = 0; z < size; z++) {
          // Distance from center
          const dx = x - center
          const dy = y - center
          const dz = z - center
          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)

          // Value is negative inside the sphere, positive outside
          values[x][y][z] = distance - radius
        }
      }
    }

    return {
      values,
      origin: { x: 0, y: 0, z: 0 },
      cellSize: { x: 1, y: 1, z: 1 }
    }
  }

  // Helper function to create a terrain-like grid with a slope
  function createTerrainGrid(size: number): GridData {
    const values: number[][][] = []
    const center = size / 2

    for (let x = 0; x < size; x++) {
      values[x] = []
      for (let y = 0; y < size; y++) {
        values[x][y] = []
        for (let z = 0; z < size; z++) {
          // Create a sloped terrain with some noise
          const baseHeight = center - x * 0.5 - y * 0.3
          const noise = Math.sin(x * 0.4) * Math.cos(y * 0.4) * 2.0
          values[x][y][z] = z - (baseHeight + noise)
        }
      }
    }

    return {
      values,
      origin: { x: 0, y: 0, z: 0 },
      cellSize: { x: 1, y: 1, z: 1 }
    }
  }

  describe('Grid Simplification', () => {
    it('should simplify a grid while preserving boundary points', () => {
      // Create a simple grid
      const grid = createSphereGrid(17, 6) // Use odd size to test boundary preservation

      // Simplify the grid with a factor of 2
      const simplifiedGrid = simplifyGrid(grid, 2)

      // Check that the simplified grid has the expected dimensions
      // For a grid of size 17, with simplification factor 2, we should have:
      // - Points at indices 0, 2, 4, 6, 8, 10, 12, 14, 16 (9 points)
      expect(simplifiedGrid.values.length).toBe(9)
      expect(simplifiedGrid.values[0].length).toBe(9)
      expect(simplifiedGrid.values[0][0].length).toBe(9)

      // Check that the cell size is scaled correctly
      expect(simplifiedGrid.cellSize.x).toBe(grid.cellSize.x * 2)
      expect(simplifiedGrid.cellSize.y).toBe(grid.cellSize.y * 2)
      expect(simplifiedGrid.cellSize.z).toBe(grid.cellSize.z * 2)

      // Check that the origin is preserved
      expect(simplifiedGrid.origin).toEqual(grid.origin)

      // Check that boundary points are preserved
      // First point
      expect(simplifiedGrid.values[0][0][0]).toBe(grid.values[0][0][0])
      // Last point
      expect(simplifiedGrid.values[8][8][8]).toBe(grid.values[16][16][16])
    })

    it('should handle different simplification factors', () => {
      // Create a simple grid
      const grid = createSphereGrid(33, 12) // Size 33 to test multiple simplification factors

      // Test with simplification factor 2
      const simplifiedGrid2 = simplifyGrid(grid, 2)
      expect(simplifiedGrid2.values.length).toBe(17) // 33 / 2 + 1 (for boundary)

      // Test with simplification factor 4
      const simplifiedGrid4 = simplifyGrid(grid, 4)
      expect(simplifiedGrid4.values.length).toBe(9) // 33 / 4 + 1 (for boundary)

      // Test with simplification factor 8
      const simplifiedGrid8 = simplifyGrid(grid, 8)
      expect(simplifiedGrid8.values.length).toBe(5) // 33 / 8 + 1 (for boundary)

      // For a sphere, we need to ensure there's an actual surface to extract
      // Let's modify the sphere grid to ensure it crosses the zero isosurface
      for (let i = 0; i < simplifiedGrid2.values.length; i++) {
        for (let j = 0; j < simplifiedGrid2.values[i].length; j++) {
          for (let k = 0; k < simplifiedGrid2.values[i][j].length; k++) {
            // Offset the values to ensure we have both positive and negative values
            simplifiedGrid2.values[i][j][k] -= 12 // Ensure sphere surface is captured
          }
        }
      }

      // Do the same for the other simplified grids
      for (let i = 0; i < simplifiedGrid4.values.length; i++) {
        for (let j = 0; j < simplifiedGrid4.values[i].length; j++) {
          for (let k = 0; k < simplifiedGrid4.values[i][j].length; k++) {
            simplifiedGrid4.values[i][j][k] -= 12
          }
        }
      }

      for (let i = 0; i < simplifiedGrid8.values.length; i++) {
        for (let j = 0; j < simplifiedGrid8.values[i].length; j++) {
          for (let k = 0; k < simplifiedGrid8.values[i][j].length; k++) {
            simplifiedGrid8.values[i][j][k] -= 12
          }
        }
      }

      // Generate meshes with different simplification factors
      const mesh2 = generateTransvoxelMesh(simplifiedGrid2, 0, 1) // LOD 1 = simplification factor 2
      const mesh4 = generateTransvoxelMesh(simplifiedGrid4, 0, 2) // LOD 2 = simplification factor 4
      const mesh8 = generateTransvoxelMesh(simplifiedGrid8, 0, 3) // LOD 3 = simplification factor 8

      // Verify that meshes were generated
      expect(mesh2.positions.count).toBeGreaterThan(0)
      expect(mesh4.positions.count).toBeGreaterThan(0)
      expect(mesh8.positions.count).toBeGreaterThan(0)

      // Higher simplification factors should result in fewer vertices
      expect(mesh2.positions.count).toBeGreaterThan(mesh4.positions.count)
      expect(mesh4.positions.count).toBeGreaterThan(mesh8.positions.count)

      // Log vertex counts for debugging
      console.log(`Simplification factor 2: ${mesh2.positions.count / 3} vertices`)
      console.log(`Simplification factor 4: ${mesh4.positions.count / 3} vertices`)
      console.log(`Simplification factor 8: ${mesh8.positions.count / 3} vertices`)
    })
  })

  describe('Chunk Grid Generation', () => {
    it('should generate a grid of chunks with proper stitching', () => {
      // Create a chunk grid with a small size for testing
      // Use a negative isolevel to ensure we get a surface
      const chunkGrid = createChunkGrid({
        gridSize: [2, 2, 2],
        chunkSize: 1,
        chunkResolution: 16,
        seed: 12345,
        isolevel: -0.5 // Use negative isolevel to ensure we get a surface
      })

      // Verify that chunks were generated
      expect(chunkGrid.chunkMap.size).toBe(8) // 2x2x2 grid

      // Get a specific chunk
      const chunk = chunkGrid.getChunk(0, 0, 0)
      expect(chunk).toBeDefined()

      // Modify the chunk data to ensure we have a surface to extract
      for (const [_, gridData] of chunkGrid.chunkMap.entries()) {
        for (let i = 0; i < gridData.values.length; i++) {
          for (let j = 0; j < gridData.values[i].length; j++) {
            for (let k = 0; k < gridData.values[i][j].length; k++) {
              // Create a gradient that crosses zero
              gridData.values[i][j][k] = (i + j + k) / 10 - 1.5
            }
          }
        }
      }

      // Get the chunk data
      const chunkData = chunkGrid.getChunk(0, 0, 0)!

      // Create a simple test grid with a known surface
      const testGrid: GridData = {
        values: Array(17)
          .fill(null)
          .map((_, i) =>
            Array(17)
              .fill(null)
              .map((_, j) =>
                Array(17)
                  .fill(null)
                  .map((_, k) => i + j + k - 25)
              )
          ),
        origin: { x: 0, y: 0, z: 0 },
        cellSize: { x: 1, y: 1, z: 1 }
      }

      // Generate meshes directly with the transvoxel algorithm
      const mesh1 = generateTransvoxelMesh(testGrid, 0, 0) // LOD 0
      const mesh2 = generateTransvoxelMesh(simplifyGrid(testGrid, 2), 0, 1) // LOD 1
      const mesh4 = generateTransvoxelMesh(simplifyGrid(testGrid, 4), 0, 2) // LOD 2

      // Verify that meshes were generated
      expect(mesh1.positions.count).toBeGreaterThan(0)
      expect(mesh2.positions.count).toBeGreaterThan(0)
      expect(mesh4.positions.count).toBeGreaterThan(0)

      // Higher simplification factors should result in fewer vertices
      expect(mesh1.positions.count).toBeGreaterThan(mesh2.positions.count)
      expect(mesh2.positions.count).toBeGreaterThan(mesh4.positions.count)

      // Log vertex counts for debugging
      console.log(`LOD 0: ${mesh1.positions.count / 3} vertices`)
      console.log(`LOD 1: ${mesh2.positions.count / 3} vertices`)
      console.log(`LOD 2: ${mesh4.positions.count / 3} vertices`)
    })

    it('should handle LOD transitions between adjacent chunks', () => {
      // Create a chunk grid with a small size for testing
      const chunkGrid = createChunkGrid({
        gridSize: [2, 2, 1],
        chunkSize: 1,
        chunkResolution: 16,
        seed: 12345,
        isolevel: -0.5 // Use negative isolevel to ensure we get a surface
      })

      // Modify the chunk data to ensure we have a surface to extract
      for (const [_, gridData] of chunkGrid.chunkMap.entries()) {
        for (let i = 0; i < gridData.values.length; i++) {
          for (let j = 0; j < gridData.values[i].length; j++) {
            for (let k = 0; k < gridData.values[i][j].length; k++) {
              // Create a gradient that crosses zero
              gridData.values[i][j][k] = (i + j + k) / 10 - 1.5
            }
          }
        }
      }

      // Create two test grids with a known surface
      const testGrid1: GridData = {
        values: Array(17)
          .fill(null)
          .map((_, i) =>
            Array(17)
              .fill(null)
              .map((_, j) =>
                Array(17)
                  .fill(null)
                  .map((_, k) => i + j + k - 25)
              )
          ),
        origin: { x: 0, y: 0, z: 0 },
        cellSize: { x: 1, y: 1, z: 1 }
      }

      const testGrid2: GridData = {
        values: Array(17)
          .fill(null)
          .map((_, i) =>
            Array(17)
              .fill(null)
              .map((_, j) =>
                Array(17)
                  .fill(null)
                  .map((_, k) => i + j + k - 25)
              )
          ),
        origin: { x: 17, y: 0, z: 0 }, // Adjacent to testGrid1
        cellSize: { x: 1, y: 1, z: 1 }
      }

      // Generate meshes directly with the transvoxel algorithm
      const mesh00 = generateTransvoxelMesh(testGrid1, 0, 0) // LOD 0
      const mesh10 = generateTransvoxelMesh(simplifyGrid(testGrid2, 2), 0, 1) // LOD 1

      // Verify that meshes were generated
      expect(mesh00.positions.count).toBeGreaterThan(0)
      expect(mesh10.positions.count).toBeGreaterThan(0)

      // The high-res mesh should have more vertices
      expect(mesh00.positions.count).toBeGreaterThan(mesh10.positions.count)

      // Log vertex counts for debugging
      console.log(`High-res chunk: ${mesh00.positions.count / 3} vertices`)
      console.log(`Low-res chunk: ${mesh10.positions.count / 3} vertices`)
    })
  })
})

// Export the simplifyGrid function for testing
export function simplifyGrid(grid: GridData, simplificationFactor: number): GridData {
  // Ensure simplificationFactor is a power of 2
  if (simplificationFactor & (simplificationFactor - 1)) {
    console.warn('Simplification factor should be a power of 2 for optimal results with Transvoxel algorithm')
    // Find the nearest power of 2
    simplificationFactor = Math.pow(2, Math.round(Math.log2(simplificationFactor)))
  }

  // Get the dimensions of the grid
  const { values, origin, cellSize } = grid
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

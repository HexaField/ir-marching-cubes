import { Vector3 } from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as MarchingCubesMesh from '../marchingcubes/MarchingCubesMesh'
import * as TransvoxelImplementation from '../marchingcubes/transvoxelImplementation'
import { ChunkGridOptions, createChunkGrid } from './ChunkGrid'

// Create spies for the actual functions
vi.spyOn(MarchingCubesMesh, 'createGridGeometry')
vi.spyOn(TransvoxelImplementation, 'generateTransvoxelMesh')

describe('ChunkGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create a grid with the specified dimensions', () => {
    const options: Partial<ChunkGridOptions> = {
      gridSize: [2, 2, 2],
      chunkSize: 1,
      chunkResolution: 8
    }

    const grid = createChunkGrid(options)

    // Check that we have the expected number of chunks
    expect(grid.chunkMap.size).toBe(8) // 2x2x2 grid

    // Check that we can retrieve chunks by coordinates
    expect(grid.getChunk(0, 0, 0)).toBeDefined()
    expect(grid.getChunk(1, 1, 1)).toBeDefined()
    expect(grid.getChunk(2, 2, 2)).toBeUndefined() // Outside the grid
  })

  it('should correctly calculate chunk offsets', () => {
    const options: Partial<ChunkGridOptions> = {
      gridSize: [3, 3, 3],
      chunkSize: 2,
      center: [0, 0, 0]
    }

    const grid = createChunkGrid(options)
    const out = new Vector3()

    // Check center chunk offset
    grid.getOffset(1, 1, 1, out)
    expect(out.x).toBeCloseTo(-1)
    expect(out.y).toBeCloseTo(-1)
    expect(out.z).toBeCloseTo(-1)

    // Check corner chunk offset
    grid.getOffset(0, 0, 0, out)
    expect(out.x).toBeCloseTo(-3)
    expect(out.y).toBeCloseTo(-3)
    expect(out.z).toBeCloseTo(-3)
  })

  it('should generate geometry with the correct parameters', () => {
    const options: Partial<ChunkGridOptions> = {
      gridSize: [2, 2, 2],
      chunkSize: 1,
      chunkResolution: 8,
      isolevel: 0.5
    }

    const grid = createChunkGrid(options)

    // Generate geometry for a chunk
    const geometry = grid.generateGeometry(0, 0, 0, 2)

    // Check that createGridGeometry was called with the correct parameters
    expect(MarchingCubesMesh.createGridGeometry).toHaveBeenCalledWith(
      expect.anything(),
      0.5, // isolevel
      2 // simplificationFactor
    )

    // Check that the geometry was created and has the expected properties
    expect(geometry).toBeDefined()
    if (geometry) {
      expect(geometry.attributes.position).toBeDefined()
      expect(geometry.attributes.normal).toBeDefined()
      expect(geometry.index).toBeDefined()
    }
  })

  it('should pass the correct LOD index to generateTransvoxelMesh and generate valid geometry', () => {
    const options: Partial<ChunkGridOptions> = {
      gridSize: [2, 2, 2],
      chunkSize: 1,
      chunkResolution: 8,
      isolevel: 0.5
    }

    const grid = createChunkGrid(options)

    // Generate geometry with different simplification factors
    const geometry1 = grid.generateGeometry(0, 0, 0, 1)
    expect(TransvoxelImplementation.generateTransvoxelMesh).toHaveBeenCalledWith(
      expect.anything(),
      0.5, // isolevel
      0 // lodIndex for simplificationFactor = 1
    )

    const geometry2 = grid.generateGeometry(0, 0, 0, 2)
    expect(TransvoxelImplementation.generateTransvoxelMesh).toHaveBeenCalledWith(
      expect.anything(),
      0.5, // isolevel
      1 // lodIndex for simplificationFactor = 2
    )

    const geometry4 = grid.generateGeometry(0, 0, 0, 4)
    expect(TransvoxelImplementation.generateTransvoxelMesh).toHaveBeenCalledWith(
      expect.anything(),
      0.5, // isolevel
      2 // lodIndex for simplificationFactor = 4
    )

    // Verify that all geometries were created
    expect(geometry1).toBeDefined()
    expect(geometry2).toBeDefined()
    expect(geometry4).toBeDefined()

    // Verify that the geometries have the expected properties
    if (geometry1) {
      expect(geometry1.attributes.position).toBeDefined()
      expect(geometry1.attributes.normal).toBeDefined()
      expect(geometry1.index).toBeDefined()
    }

    if (geometry2) {
      expect(geometry2.attributes.position).toBeDefined()
      expect(geometry2.attributes.normal).toBeDefined()
      expect(geometry2.index).toBeDefined()
    }

    if (geometry4) {
      expect(geometry4.attributes.position).toBeDefined()
      expect(geometry4.attributes.normal).toBeDefined()
      expect(geometry4.index).toBeDefined()
    }
  })

  it('should create grid data with the correct dimensions', () => {
    const options: Partial<ChunkGridOptions> = {
      gridSize: [1, 1, 1],
      chunkSize: 1,
      chunkResolution: 4
    }

    const grid = createChunkGrid(options)
    const chunk = grid.getChunk(0, 0, 0)

    // Check that the grid data has the correct dimensions
    expect(chunk).toBeDefined()
    if (chunk) {
      expect(chunk.values.length).toBe(5) // chunkResolution + 1
      expect(chunk.values[0].length).toBe(5)
      expect(chunk.values[0][0].length).toBe(5)

      // Check that the cell size is correct
      expect(chunk.cellSize.x).toBeCloseTo(0.25) // chunkSize / chunkResolution
      expect(chunk.cellSize.y).toBeCloseTo(0.25)
      expect(chunk.cellSize.z).toBeCloseTo(0.25)
    }
  })

  it('should handle geometry generation with the Transvoxel implementation', () => {
    // Create a grid with a specific pattern
    const options: Partial<ChunkGridOptions> = {
      gridSize: [1, 1, 1],
      chunkSize: 1,
      chunkResolution: 16,
      // Use a different isolevel to ensure we get some geometry
      isolevel: -0.5,
      seed: 12345
    }

    const grid = createChunkGrid(options)

    // Generate geometry with different LOD levels
    const geometry1 = grid.generateGeometry(0, 0, 0, 1)
    const geometry2 = grid.generateGeometry(0, 0, 0, 2)
    const geometry4 = grid.generateGeometry(0, 0, 0, 4)

    // Verify that all geometries were created
    expect(geometry1).toBeDefined()
    expect(geometry2).toBeDefined()
    expect(geometry4).toBeDefined()

    // Verify that the geometries have the expected structure
    if (geometry1) {
      expect(geometry1.attributes.position).toBeDefined()
      expect(geometry1.attributes.normal).toBeDefined()
      expect(geometry1.index).toBeDefined()

      // If we have geometry, verify it's valid
      if (geometry1.attributes.position.count > 0) {
        expect(geometry1.attributes.normal.count).toBe(geometry1.attributes.position.count)

        if (geometry1.index) {
          // Verify that the number of indices is a multiple of 3 (triangles)
          expect(geometry1.index.count % 3).toBe(0)
        }
      }
    }

    if (geometry2) {
      expect(geometry2.attributes.position).toBeDefined()
      expect(geometry2.attributes.normal).toBeDefined()
      expect(geometry2.index).toBeDefined()

      // If we have geometry, verify it's valid
      if (geometry2.attributes.position.count > 0) {
        expect(geometry2.attributes.normal.count).toBe(geometry2.attributes.position.count)

        if (geometry2.index) {
          // Verify that the number of indices is a multiple of 3 (triangles)
          expect(geometry2.index.count % 3).toBe(0)
        }
      }
    }

    if (geometry4) {
      expect(geometry4.attributes.position).toBeDefined()
      expect(geometry4.attributes.normal).toBeDefined()
      expect(geometry4.index).toBeDefined()

      // If we have geometry, verify it's valid
      if (geometry4.attributes.position.count > 0) {
        expect(geometry4.attributes.normal.count).toBe(geometry4.attributes.position.count)

        if (geometry4.index) {
          // Verify that the number of indices is a multiple of 3 (triangles)
          expect(geometry4.index.count % 3).toBe(0)
        }
      }
    }

    // Note: We don't assert on the relative sizes of the geometries
    // as that depends on the specific data and isolevel
  })
})

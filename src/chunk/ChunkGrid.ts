import { BufferGeometry, Vector3 } from 'three'
import { createGridGeometry } from '../marchingcubes/MarchingCubesMesh'
import { createGridGeometryWithLODTransitions, determineTransitionDirections } from '../marchingcubes/TransvoxelMesh'
import { GridData } from '../marchingcubes/triangulation'
import { createNoise } from './generateChunks'

export interface ChunkGridOptions {
  /** Size of the grid in chunks (x, y, z) */
  gridSize: [number, number, number]
  /** Size of each chunk in world units */
  chunkSize: number
  /** Resolution of each chunk (number of cells per dimension) */
  chunkResolution: number
  /** Seed for the noise generator */
  seed: number
  /** Isolevel for the marching cubes algorithm */
  isolevel: number
  /** Center position of the grid */
  center?: [number, number, number]
}

export interface ChunkGridResult {
  /** Map of chunk coordinates to meshes */
  chunkMap: Map<string, GridData>
  /** Get a specific chunk by its coordinates */
  getChunk: (x: number, y: number, z: number) => GridData | undefined
  /** Get the offset position for a specific chunk */
  getOffset: (x: number, y: number, z: number, out: Vector3) => Vector3
  /** Generate a mesh for a specific chunk */
  generateGeometry: (x: number, y: number, z: number, simplificationFactor: number) => BufferGeometry | undefined
  /** Generate a mesh with LOD transitions for a specific chunk */
  getChunkData: (x: number, y: number, z: number) => GridData | undefined
}

/**
 * Convert chunk data to GridData for marching cubes
 */
function createGridData(chunkData: number[], chunkResolution: number, chunkSize: number): GridData {
  // We now have chunkResolution + 1 points in each dimension
  const resolution = chunkResolution + 1
  // The cell size remains the same - it's the distance between adjacent points
  const cellSize = chunkSize / chunkResolution

  // Create a 3D array of values from the 1D array
  const values: number[][][] = Array(resolution)
    .fill(null)
    .map(() =>
      Array(resolution)
        .fill(null)
        .map(() => Array(resolution).fill(0))
    )

  // Fill the 3D array with values from the chunk data
  let index = 0
  for (let i = 0; i < resolution; i++) {
    for (let j = 0; j < resolution; j++) {
      for (let k = 0; k < resolution; k++) {
        // In the generateChunks.ts file, the data is generated in i,j,k order
        // We need to map this to x,y,z in our 3D array
        values[i][j][k] = chunkData[index++]
      }
    }
  }

  // Create the grid data
  return {
    values,
    origin: {
      x: 0,
      y: 0,
      z: 0
    },
    cellSize: {
      x: cellSize,
      y: cellSize,
      z: cellSize
    }
  }
}

/**
 * Creates a grid of chunks, each with its own marching cubes mesh
 * @param options Configuration options for the chunk grid
 * @returns Object containing the generated meshes and utility functions
 */
export function createChunkGrid(options: Partial<ChunkGridOptions> = {}): ChunkGridResult {
  // Apply default options
  const config: ChunkGridOptions = {
    gridSize: [3, 3, 3],
    chunkSize: 1,
    chunkResolution: 16,
    seed: 1337,
    isolevel: 0.0,
    center: [0, 0, 0],
    ...options
  }

  // Initialize the noise generator
  const noiseGenerator = createNoise(config.seed)

  // Create storage for chunks
  const chunkMap = new Map<string, GridData>()

  // Extract configuration values
  const [gridX, gridY, gridZ] = config.gridSize

  // Generate each chunk in the grid
  for (let x = 0; x < gridX; x++) {
    for (let y = 0; y < gridY; y++) {
      for (let z = 0; z < gridZ; z++) {
        const chunkKey = `${x},${y},${z}`

        // Generate the chunk data
        const chunkData = noiseGenerator(x, y, z)

        // Convert to grid data for marching cubes
        const gridData = createGridData(chunkData, config.chunkResolution, config.chunkSize)

        // Store the chunk
        chunkMap.set(chunkKey, gridData)
      }
    }
  }

  // Return the result object with meshes and utility functions
  return {
    chunkMap,
    getChunk: (x: number, y: number, z: number) => chunkMap.get(`${x},${y},${z}`),
    getChunkData: (x: number, y: number, z: number) => chunkMap.get(`${x},${y},${z}`),
    getOffset: (x: number, y: number, z: number, out: Vector3) => {
      const [centerX, centerY, centerZ] = config.center || [0, 0, 0]
      const offsetX = centerX - (gridX * config.chunkSize) / 2
      const offsetY = centerY - (gridY * config.chunkSize) / 2
      const offsetZ = centerZ - (gridZ * config.chunkSize) / 2
      return out.set(offsetX + x * config.chunkSize, offsetY + y * config.chunkSize, offsetZ + z * config.chunkSize)
    },
    generateGeometry: (x: number, y: number, z: number, simplificationFactor: number) => {
      const chunkKey = `${x},${y},${z}`
      const chunk = chunkMap.get(chunkKey)
      if (!chunk) return

      // Calculate distance from center for LOD determination
      const xzDistanceFromCenter = Math.sqrt(x * x + z * z)

      // Determine if we need transition cells
      const transitionDirections = determineTransitionDirections(
        x,
        y,
        z,
        xzDistanceFromCenter,
        Math.floor(xzDistanceFromCenter / 2) * 2 // Transition at LOD boundaries
      )

      // If we need transition cells, use the Transvoxel algorithm
      if (transitionDirections !== 0) {
        return createGridGeometryWithLODTransitions(
          chunk,
          config.isolevel,
          simplificationFactor,
          transitionDirections,
          0.5 // transitionScale
        )
      }

      // Otherwise, use the standard marching cubes algorithm
      return createGridGeometry(chunk, config.isolevel, simplificationFactor)
    }
  }
}

import { Noise } from 'noisejs'

/**
 * Generate a value for a single point in the grid
 * @param x X coordinate
 * @param y Y coordinate
 * @param z Z coordinate
 * @param noise Noise generator
 * @returns A scalar value for this point
 */
const generateCube = (x: number, y: number, z: number, noise: Noise) => {
  // Scale the coordinates to get more interesting terrain
  const scale = 0.1
  const scaledX = x * scale
  const scaledY = y * scale
  const scaledZ = z * scale

  // Generate base noise value (range: -1 to 1)
  const simplex3 = noise.simplex3(scaledX, scaledY, scaledZ) as number

  // Add height falloff to create terrain with a ground level
  // This makes values more negative as y increases, creating a surface
  const heightFalloff = (y - 4) * 0.1

  // Combine noise with height falloff
  return simplex3 - heightFalloff
}

/**
 * Generate a chunk of noise values
 * @param x Chunk X coordinate
 * @param y Chunk Y coordinate
 * @param z Chunk Z coordinate
 * @param noise Noise generator
 * @returns Array of scalar values for this chunk
 */
const generateChunk = (x: number, y: number, z: number, noise: Noise) => {
  const chunk = [] as number[]
  const chunkSize = 16
  // We need to include an extra cell in each direction for proper stitching
  // This means we'll generate a grid of size (chunkSize+1) x (chunkSize+1) x (chunkSize+1)

  for (let i = 0; i <= chunkSize; i++) {
    for (let j = 0; j <= chunkSize; j++) {
      for (let k = 0; k <= chunkSize; k++) {
        // Calculate global coordinates
        const globalX = x * chunkSize + i
        const globalY = y * chunkSize + j
        const globalZ = z * chunkSize + k

        // Generate and store the value
        chunk.push(generateCube(globalX, globalY, globalZ, noise))
      }
    }
  }

  return chunk
}

/**
 * Create a noise generator function
 * @param seed Random seed
 * @returns Function that generates noise values for a chunk
 */
export const createNoise = (seed: number) => {
  const noise = new Noise(seed)

  return (chunkX: number, chunkY: number, chunkZ: number) => {
    return generateChunk(chunkX, chunkY, chunkZ, noise)
  }
}

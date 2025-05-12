/**
 * Tests for the marching cubes triangulation implementation
 */
import { describe, expect, it } from 'vitest'
import { GridData, Vector3, polygoniseGrid } from './triangulation'

describe('Marching Cubes Triangulation', () => {
  // Create a simple test grid with a sphere in the middle
  function createTestSphereGrid(resolution: number = 8): GridData {
    const values: number[][][] = []
    const radius = 0.5
    const center: Vector3 = { x: 0.5, y: 0.5, z: 0.5 }
    const origin: Vector3 = { x: 0, y: 0, z: 0 }
    const cellSize: Vector3 = { x: 1 / resolution, y: 1 / resolution, z: 1 / resolution }

    // Initialize the grid with values
    for (let x = 0; x <= resolution; x++) {
      values[x] = []
      for (let y = 0; y <= resolution; y++) {
        values[x][y] = []
        for (let z = 0; z <= resolution; z++) {
          // Calculate position in 0-1 space
          const px = x / resolution
          const py = y / resolution
          const pz = z / resolution

          // Calculate distance from center
          const dx = px - center.x
          const dy = py - center.y
          const dz = pz - center.z
          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)

          // Inside sphere = positive value, outside = negative value
          values[x][y][z] = radius - distance
        }
      }
    }

    return { values, origin, cellSize }
  }

  it('should generate triangles for a sphere', () => {
    const grid = createTestSphereGrid(8)
    const isolevel = 0
    const result = polygoniseGrid(grid, isolevel)

    // Verify we have positions, indices, and normals
    expect(result.positions).toBeDefined()
    expect(result.indices).toBeDefined()
    expect(result.normals).toBeDefined()

    // Verify we have a non-empty mesh
    expect(result.positions.count).toBeGreaterThan(0)
    expect(result.indices.count).toBeGreaterThan(0)
    expect(result.normals?.count).toBeGreaterThan(0)

    // Verify positions and normals have the same count
    expect(result.positions.count).toEqual(result.normals?.count)
  })

  it('should generate normals pointing outward from the sphere', () => {
    const grid = createTestSphereGrid(8)
    const isolevel = 0
    const result = polygoniseGrid(grid, isolevel)

    // Get the positions and normals as arrays
    const positions = result.positions.array as Float32Array
    const normals = result.normals?.array as Float32Array

    // Check a sample of vertices to ensure normals point outward
    // For a sphere, the normal at any point should point in approximately the same direction
    // as the vector from the center to that point
    const center: Vector3 = { x: 0.5, y: 0.5, z: 0.5 }
    let correctNormalCount = 0
    const sampleSize = Math.min(100, positions.length / 3) // Check up to 100 vertices

    for (let i = 0; i < sampleSize; i++) {
      const idx = Math.floor(Math.random() * (positions.length / 3)) * 3

      // Get position and normal
      const pos: Vector3 = {
        x: positions[idx],
        y: positions[idx + 1],
        z: positions[idx + 2]
      }

      const normal: Vector3 = {
        x: normals[idx],
        y: normals[idx + 1],
        z: normals[idx + 2]
      }

      // Calculate expected normal direction (from center to position)
      const expectedDir: Vector3 = {
        x: pos.x - center.x,
        y: pos.y - center.y,
        z: pos.z - center.z
      }

      // Normalize expected direction
      const length = Math.sqrt(
        expectedDir.x * expectedDir.x + expectedDir.y * expectedDir.y + expectedDir.z * expectedDir.z
      )

      if (length > 0.0001) {
        expectedDir.x /= length
        expectedDir.y /= length
        expectedDir.z /= length

        // Calculate dot product between actual normal and expected direction
        const dotProduct = normal.x * expectedDir.x + normal.y * expectedDir.y + normal.z * expectedDir.z

        // Dot product should be positive if normals point in similar direction
        // Allow for some error due to interpolation and grid resolution
        if (dotProduct > 0) {
          correctNormalCount++
        }
      }
    }

    // At least 90% of normals should point in the expected direction
    const correctPercentage = (correctNormalCount / sampleSize) * 100
    expect(correctPercentage).toBeGreaterThan(90)
  })
})

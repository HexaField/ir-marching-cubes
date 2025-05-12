/**
 * Tests for the Transvoxel algorithm implementation
 */
import { describe, expect, it } from 'vitest'
import { createGridGeometryWithLODTransitions, determineTransitionDirections } from './TransvoxelMesh'
import { TransitionCell, TransitionCellDirection, processTransitionCell } from './transvoxelTriangulation'
import { GridData, Vector3 } from './triangulation'

describe('Transvoxel Triangulation', () => {
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
          // Calculate distance from center
          const dx = x / resolution - center.x
          const dy = y / resolution - center.y
          const dz = z / resolution - center.z
          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)

          // Value is negative inside the sphere, positive outside
          values[x][y][z] = distance - radius
        }
      }
    }

    return { values, origin, cellSize }
  }

  it('should process a transition cell correctly', () => {
    // Create a simple transition cell
    const cell: TransitionCell = {
      points: [
        // High-resolution side (9 corners)
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0.5, z: 0 },
        { x: 0, y: 1, z: 0 },
        { x: 0, y: 0, z: 0.5 },
        { x: 0, y: 0.5, z: 0.5 },
        { x: 0, y: 1, z: 0.5 },
        { x: 0, y: 0, z: 1 },
        { x: 0, y: 0.5, z: 1 },
        { x: 0, y: 1, z: 1 },
        // Low-resolution side (4 corners)
        { x: 0.5, y: 0, z: 0 },
        { x: 0.5, y: 1, z: 0 },
        { x: 0.5, y: 0, z: 1 },
        { x: 0.5, y: 1, z: 1 }
      ],
      values: [
        // Values for a simple case where the isosurface passes through the cell
        -1, -1, 1, -1, 1, 1, 1, 1, 1, -1, 1, 1, 1
      ],
      direction: TransitionCellDirection.POS_X
    }

    // Process the cell
    const result = processTransitionCell(cell, 0)

    // Expect some triangles to be generated
    expect(result.triangles.length).toBeGreaterThan(0)
  })

  it('should determine transition directions correctly', () => {
    // Test with a chunk at the center
    const centerDirections = determineTransitionDirections(0, 0, 0, 0, 2)
    expect(centerDirections).toBe(TransitionCellDirection.NONE)

    // Test with a chunk at the boundary
    const boundaryDirections = determineTransitionDirections(2, 0, 0, 4, 4)
    expect(boundaryDirections & TransitionCellDirection.POS_X).toBeTruthy()
  })

  it('should create grid geometry with LOD transitions', () => {
    // Create a test grid
    const grid = createTestSphereGrid(16)

    // Create geometry with no transitions
    const geometryNoTransitions = createGridGeometryWithLODTransitions(grid, 0, 1, TransitionCellDirection.NONE, 0.5)

    // Expect the geometry to have positions and indices
    expect(geometryNoTransitions.attributes.position).toBeDefined()
    expect(geometryNoTransitions.index).toBeDefined()

    // Create geometry with transitions
    const geometryWithTransitions = createGridGeometryWithLODTransitions(grid, 0, 2, TransitionCellDirection.POS_X, 0.5)

    // Expect the geometry to have positions and indices
    expect(geometryWithTransitions.attributes.position).toBeDefined()
    expect(geometryWithTransitions.index).toBeDefined()
  })
})

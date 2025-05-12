/**
 * Implementation of the Transvoxel Algorithm for seamless LOD transitions
 * Based on Eric Lengyel's paper: https://transvoxel.org/
 */
import { BufferAttribute, BufferGeometry, Float32BufferAttribute } from 'three'
import { TransitionCell, TransitionCellDirection, processTransitionCell } from './transvoxelTriangulation'
import { GridData, MarchingCubesBuffers, Vector3, polygoniseGrid } from './triangulation'

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
 * Determine which faces of a chunk need transition cells based on its position and LOD level
 * @param x X coordinate of the chunk
 * @param y Y coordinate of the chunk
 * @param z Z coordinate of the chunk
 * @param distanceFromCenter Distance from the center of the grid
 * @param lodBoundary The distance at which LOD transitions occur
 * @returns Bit flags indicating which faces need transition cells
 */
export function determineTransitionDirections(
  x: number,
  y: number,
  z: number,
  distanceFromCenter: number,
  lodBoundary: number
): TransitionCellDirection {
  let directions = TransitionCellDirection.NONE

  // Calculate the LOD level for this chunk
  const currentLOD = Math.floor(distanceFromCenter / 2)

  // Check each neighboring chunk to see if it has a different LOD level
  // +X neighbor
  if (Math.floor(Math.sqrt((x + 1) * (x + 1) + z * z) / 2) > currentLOD) {
    directions |= TransitionCellDirection.POS_X
  }

  // -X neighbor
  if (Math.floor(Math.sqrt((x - 1) * (x - 1) + z * z) / 2) > currentLOD) {
    directions |= TransitionCellDirection.NEG_X
  }

  // +Y neighbor (usually not needed for terrain, but included for completeness)
  if (Math.floor(Math.sqrt(x * x + (y + 1) * (y + 1) + z * z) / 2) > currentLOD) {
    directions |= TransitionCellDirection.POS_Y
  }

  // -Y neighbor
  if (Math.floor(Math.sqrt(x * x + (y - 1) * (y - 1) + z * z) / 2) > currentLOD) {
    directions |= TransitionCellDirection.NEG_Y
  }

  // +Z neighbor
  if (Math.floor(Math.sqrt(x * x + (z + 1) * (z + 1)) / 2) > currentLOD) {
    directions |= TransitionCellDirection.POS_Z
  }

  // -Z neighbor
  if (Math.floor(Math.sqrt(x * x + (z - 1) * (z - 1)) / 2) > currentLOD) {
    directions |= TransitionCellDirection.NEG_Z
  }

  return directions
}

/**
 * Create transition cells for a specific face of the grid
 * @param grid The grid data
 * @param direction The direction of the face
 * @param isolevel The isolevel for the isosurface
 * @param transitionScale The scale of the transition cell (usually 0.5)
 * @returns Triangles for the transition cells
 */
function createTransitionCells(
  grid: GridData,
  direction: TransitionCellDirection,
  isolevel: number,
  transitionScale: number
): MarchingCubesBuffers {
  const { values, origin, cellSize } = grid
  const sizeX = values.length - 1
  const sizeY = values[0].length - 1
  const sizeZ = values[0][0].length - 1
  const allTriangles: any[] = []

  // Determine which face we're processing
  let faceX = 0,
    faceY = 0,
    faceZ = 0
  let faceSize = [0, 0]

  switch (direction) {
    case TransitionCellDirection.POS_X:
      faceX = sizeX
      faceSize = [sizeY, sizeZ]
      break
    case TransitionCellDirection.NEG_X:
      faceX = 0
      faceSize = [sizeY, sizeZ]
      break
    case TransitionCellDirection.POS_Y:
      faceY = sizeY
      faceSize = [sizeX, sizeZ]
      break
    case TransitionCellDirection.NEG_Y:
      faceY = 0
      faceSize = [sizeX, sizeZ]
      break
    case TransitionCellDirection.POS_Z:
      faceZ = sizeZ
      faceSize = [sizeX, sizeY]
      break
    case TransitionCellDirection.NEG_Z:
      faceZ = 0
      faceSize = [sizeX, sizeY]
      break
    default:
      return {
        positions: null!,
        indices: null!,
        normals: null!,
        triangles: []
      }
  }

  // Process each cell on the face
  for (let i = 0; i < faceSize[0]; i++) {
    for (let j = 0; j < faceSize[1]; j++) {
      // Create a transition cell based on the direction
      const cell = createTransitionCell(grid, direction, i, j, faceX, faceY, faceZ, transitionScale)

      // Process the cell to generate triangles
      const { triangles } = processTransitionCell(cell, isolevel)

      if (triangles.length > 0) {
        allTriangles.push(...triangles)
      }
    }
  }

  // Create buffer attributes from the triangles
  return {
    positions: null!,
    indices: null!,
    normals: null!,
    triangles: allTriangles
  }
}

/**
 * Create a transition cell for a specific position on a face
 */
function createTransitionCell(
  grid: GridData,
  direction: TransitionCellDirection,
  i: number,
  j: number,
  faceX: number,
  faceY: number,
  faceZ: number,
  transitionScale: number
): TransitionCell {
  const { values, origin, cellSize } = grid
  const points: Vector3[] = []
  const cellValues: number[] = []

  // The transition cell has 13 corners: 9 on the high-resolution side and 4 on the low-resolution side
  // The exact arrangement depends on the direction of the face

  switch (direction) {
    case TransitionCellDirection.POS_X: {
      // High-resolution side (9 corners)
      for (let y = 0; y < 3; y++) {
        for (let z = 0; z < 3; z++) {
          const cornerY = faceY + i + y * transitionScale
          const cornerZ = faceZ + j + z * transitionScale

          points.push({
            x: origin.x + faceX * cellSize.x,
            y: origin.y + cornerY * cellSize.y,
            z: origin.z + cornerZ * cellSize.z
          })

          // Get the value at this corner
          const gridY = Math.min(Math.max(Math.floor(cornerY), 0), values[0].length - 1)
          const gridZ = Math.min(Math.max(Math.floor(cornerZ), 0), values[0][0].length - 1)

          cellValues.push(values[faceX][gridY][gridZ])
        }
      }

      // Low-resolution side (4 corners)
      for (let y = 0; y < 2; y++) {
        for (let z = 0; z < 2; z++) {
          const cornerY = faceY + i + y
          const cornerZ = faceZ + j + z

          points.push({
            x: origin.x + (faceX + transitionScale) * cellSize.x,
            y: origin.y + cornerY * cellSize.y,
            z: origin.z + cornerZ * cellSize.z
          })

          // Get the value at this corner
          const gridY = Math.min(Math.max(cornerY, 0), values[0].length - 1)
          const gridZ = Math.min(Math.max(cornerZ, 0), values[0][0].length - 1)

          // For the low-resolution side, we might need to sample from the next chunk
          const gridX = Math.min(faceX + 1, values.length - 1)

          cellValues.push(values[gridX][gridY][gridZ])
        }
      }
      break
    }

    case TransitionCellDirection.NEG_X: {
      // High-resolution side (9 corners)
      for (let y = 0; y < 3; y++) {
        for (let z = 0; z < 3; z++) {
          const cornerY = faceY + i + y * transitionScale
          const cornerZ = faceZ + j + z * transitionScale

          points.push({
            x: origin.x + faceX * cellSize.x,
            y: origin.y + cornerY * cellSize.y,
            z: origin.z + cornerZ * cellSize.z
          })

          // Get the value at this corner
          const gridY = Math.min(Math.max(Math.floor(cornerY), 0), values[0].length - 1)
          const gridZ = Math.min(Math.max(Math.floor(cornerZ), 0), values[0][0].length - 1)

          cellValues.push(values[faceX][gridY][gridZ])
        }
      }

      // Low-resolution side (4 corners)
      for (let y = 0; y < 2; y++) {
        for (let z = 0; z < 2; z++) {
          const cornerY = faceY + i + y
          const cornerZ = faceZ + j + z

          points.push({
            x: origin.x + (faceX - transitionScale) * cellSize.x,
            y: origin.y + cornerY * cellSize.y,
            z: origin.z + cornerZ * cellSize.z
          })

          // Get the value at this corner
          const gridY = Math.min(Math.max(cornerY, 0), values[0].length - 1)
          const gridZ = Math.min(Math.max(cornerZ, 0), values[0][0].length - 1)

          // For the low-resolution side, we might need to sample from the next chunk
          const gridX = Math.max(faceX - 1, 0)

          cellValues.push(values[gridX][gridY][gridZ])
        }
      }
      break
    }

    case TransitionCellDirection.POS_Y: {
      // High-resolution side (9 corners)
      for (let x = 0; x < 3; x++) {
        for (let z = 0; z < 3; z++) {
          const cornerX = faceX + i + x * transitionScale
          const cornerZ = faceZ + j + z * transitionScale

          points.push({
            x: origin.x + cornerX * cellSize.x,
            y: origin.y + faceY * cellSize.y,
            z: origin.z + cornerZ * cellSize.z
          })

          // Get the value at this corner
          const gridX = Math.min(Math.max(Math.floor(cornerX), 0), values.length - 1)
          const gridZ = Math.min(Math.max(Math.floor(cornerZ), 0), values[0][0].length - 1)

          cellValues.push(values[gridX][faceY][gridZ])
        }
      }

      // Low-resolution side (4 corners)
      for (let x = 0; x < 2; x++) {
        for (let z = 0; z < 2; z++) {
          const cornerX = faceX + i + x
          const cornerZ = faceZ + j + z

          points.push({
            x: origin.x + cornerX * cellSize.x,
            y: origin.y + (faceY + transitionScale) * cellSize.y,
            z: origin.z + cornerZ * cellSize.z
          })

          // Get the value at this corner
          const gridX = Math.min(Math.max(cornerX, 0), values.length - 1)
          const gridZ = Math.min(Math.max(cornerZ, 0), values[0][0].length - 1)

          // For the low-resolution side, we might need to sample from the next chunk
          const gridY = Math.min(faceY + 1, values[0].length - 1)

          cellValues.push(values[gridX][gridY][gridZ])
        }
      }
      break
    }

    case TransitionCellDirection.NEG_Y: {
      // High-resolution side (9 corners)
      for (let x = 0; x < 3; x++) {
        for (let z = 0; z < 3; z++) {
          const cornerX = faceX + i + x * transitionScale
          const cornerZ = faceZ + j + z * transitionScale

          points.push({
            x: origin.x + cornerX * cellSize.x,
            y: origin.y + faceY * cellSize.y,
            z: origin.z + cornerZ * cellSize.z
          })

          // Get the value at this corner
          const gridX = Math.min(Math.max(Math.floor(cornerX), 0), values.length - 1)
          const gridZ = Math.min(Math.max(Math.floor(cornerZ), 0), values[0][0].length - 1)

          cellValues.push(values[gridX][faceY][gridZ])
        }
      }

      // Low-resolution side (4 corners)
      for (let x = 0; x < 2; x++) {
        for (let z = 0; z < 2; z++) {
          const cornerX = faceX + i + x
          const cornerZ = faceZ + j + z

          points.push({
            x: origin.x + cornerX * cellSize.x,
            y: origin.y + (faceY - transitionScale) * cellSize.y,
            z: origin.z + cornerZ * cellSize.z
          })

          // Get the value at this corner
          const gridX = Math.min(Math.max(cornerX, 0), values.length - 1)
          const gridZ = Math.min(Math.max(cornerZ, 0), values[0][0].length - 1)

          // For the low-resolution side, we might need to sample from the next chunk
          const gridY = Math.max(faceY - 1, 0)

          cellValues.push(values[gridX][gridY][gridZ])
        }
      }
      break
    }

    case TransitionCellDirection.POS_Z: {
      // High-resolution side (9 corners)
      for (let x = 0; x < 3; x++) {
        for (let y = 0; y < 3; y++) {
          const cornerX = faceX + i + x * transitionScale
          const cornerY = faceY + j + y * transitionScale

          points.push({
            x: origin.x + cornerX * cellSize.x,
            y: origin.y + cornerY * cellSize.y,
            z: origin.z + faceZ * cellSize.z
          })

          // Get the value at this corner
          const gridX = Math.min(Math.max(Math.floor(cornerX), 0), values.length - 1)
          const gridY = Math.min(Math.max(Math.floor(cornerY), 0), values[0].length - 1)

          cellValues.push(values[gridX][gridY][faceZ])
        }
      }

      // Low-resolution side (4 corners)
      for (let x = 0; x < 2; x++) {
        for (let y = 0; y < 2; y++) {
          const cornerX = faceX + i + x
          const cornerY = faceY + j + y

          points.push({
            x: origin.x + cornerX * cellSize.x,
            y: origin.y + cornerY * cellSize.y,
            z: origin.z + (faceZ + transitionScale) * cellSize.z
          })

          // Get the value at this corner
          const gridX = Math.min(Math.max(cornerX, 0), values.length - 1)
          const gridY = Math.min(Math.max(cornerY, 0), values[0].length - 1)

          // For the low-resolution side, we might need to sample from the next chunk
          const gridZ = Math.min(faceZ + 1, values[0][0].length - 1)

          cellValues.push(values[gridX][gridY][gridZ])
        }
      }
      break
    }

    case TransitionCellDirection.NEG_Z: {
      // High-resolution side (9 corners)
      for (let x = 0; x < 3; x++) {
        for (let y = 0; y < 3; y++) {
          const cornerX = faceX + i + x * transitionScale
          const cornerY = faceY + j + y * transitionScale

          points.push({
            x: origin.x + cornerX * cellSize.x,
            y: origin.y + cornerY * cellSize.y,
            z: origin.z + faceZ * cellSize.z
          })

          // Get the value at this corner
          const gridX = Math.min(Math.max(Math.floor(cornerX), 0), values.length - 1)
          const gridY = Math.min(Math.max(Math.floor(cornerY), 0), values[0].length - 1)

          cellValues.push(values[gridX][gridY][faceZ])
        }
      }

      // Low-resolution side (4 corners)
      for (let x = 0; x < 2; x++) {
        for (let y = 0; y < 2; y++) {
          const cornerX = faceX + i + x
          const cornerY = faceY + j + y

          points.push({
            x: origin.x + cornerX * cellSize.x,
            y: origin.y + cornerY * cellSize.y,
            z: origin.z + (faceZ - transitionScale) * cellSize.z
          })

          // Get the value at this corner
          const gridX = Math.min(Math.max(cornerX, 0), values.length - 1)
          const gridY = Math.min(Math.max(cornerY, 0), values[0].length - 1)

          // For the low-resolution side, we might need to sample from the next chunk
          const gridZ = Math.max(faceZ - 1, 0)

          cellValues.push(values[gridX][gridY][gridZ])
        }
      }
      break
    }
  }

  return {
    points,
    values: cellValues,
    direction
  }
}

/**
 * Creates a Three.js geometry from a grid of scalar values using marching cubes
 * with transition cells for LOD boundaries.
 */
export function createGridGeometryWithLODTransitions(
  grid: GridData,
  isolevel: number,
  simplificationFactor: number,
  transitionDirections: TransitionCellDirection,
  transitionScale: number = 0.5
): BufferGeometry {
  // Only simplify if the factor is greater than 1
  const simplifiedGrid = simplificationFactor > 1 ? simplifyGrid(grid, simplificationFactor) : grid

  // Generate the main mesh using standard marching cubes
  const mainMesh = polygoniseGrid(simplifiedGrid, isolevel)

  // If no transition cells are needed, return the main mesh
  if (transitionDirections === TransitionCellDirection.NONE) {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', mainMesh.positions)
    geometry.setIndex(mainMesh.indices)
    geometry.setAttribute('normal', mainMesh.normals!)
    return geometry
  }

  // Collect all triangles from the main mesh
  const allTriangles = [...mainMesh.triangles!]

  // Generate transition cells for each direction
  const allDirections = [
    TransitionCellDirection.POS_X,
    TransitionCellDirection.NEG_X,
    TransitionCellDirection.POS_Y,
    TransitionCellDirection.NEG_Y,
    TransitionCellDirection.POS_Z,
    TransitionCellDirection.NEG_Z
  ]

  // For each direction, check if we need transition cells
  for (const direction of allDirections) {
    if (transitionDirections & direction) {
      // Generate transition cells for this direction
      const transitionMesh = createTransitionCells(grid, direction, isolevel, transitionScale)

      // Add the transition triangles to our collection
      if (transitionMesh.triangles && transitionMesh.triangles.length > 0) {
        allTriangles.push(...transitionMesh.triangles)
      }
    }
  }

  // Create buffer attributes from all triangles
  const vertexMap = new Map<string, number>()
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []

  for (const triangle of allTriangles) {
    for (let i = 0; i < 3; i++) {
      const vertex = triangle.vertices[i]
      const normal = triangle.normals ? triangle.normals[i] : { x: 0, y: 1, z: 0 }
      const key = `${vertex.x},${vertex.y},${vertex.z}`

      if (!vertexMap.has(key)) {
        positions.push(vertex.x, vertex.y, vertex.z)
        normals.push(normal.x, normal.y, normal.z)
        vertexMap.set(key, vertexMap.size)
      }

      indices.push(vertexMap.get(key)!)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(positions), 3))
  geometry.setIndex(
    new BufferAttribute(indices.length > 65535 ? new Uint32Array(indices) : new Uint16Array(indices), 1)
  )
  geometry.setAttribute('normal', new Float32BufferAttribute(new Float32Array(normals), 3))

  return geometry
}

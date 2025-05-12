/**
 * Transvoxel Algorithm implementation based on Eric Lengyel's paper
 * Reference: https://transvoxel.org/
 *
 * This implementation handles the transition cells between different LOD levels
 * in a voxel grid, allowing for seamless connections between meshes of different
 * resolutions.
 */
import { BufferAttribute, Float32BufferAttribute } from 'three'
import { transitionCellClass, transitionCellData, transitionVertexData } from './transvoxel'
import { GridData, MarchingCubesBuffers, Triangle, Vector3 } from './triangulation'

/**
 * Represents the direction of a transition cell
 */
export enum TransitionCellDirection {
  NONE = 0,
  POS_X = 1 << 0, // +X face
  NEG_X = 1 << 1, // -X face
  POS_Y = 1 << 2, // +Y face
  NEG_Y = 1 << 3, // -Y face
  POS_Z = 1 << 4, // +Z face
  NEG_Z = 1 << 5 // -Z face
}

/**
 * Interface for a transition cell
 */
export interface TransitionCell {
  points: Vector3[] // The 13 corner points of the transition cell
  values: number[] // The scalar values at each corner
  direction: TransitionCellDirection // The direction this cell faces
}

/**
 * Create buffer attributes from triangles
 */
function createBufferAttributes(triangles: Triangle[]): MarchingCubesBuffers {
  if (triangles.length === 0) {
    return {
      positions: new Float32BufferAttribute(new Float32Array(0), 3),
      indices: new BufferAttribute(new Uint16Array(0), 1),
      normals: new Float32BufferAttribute(new Float32Array(0), 3),
      triangles: []
    }
  }

  const vertexMap = new Map<string, number>()
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []

  for (const triangle of triangles) {
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

  const positionAttribute = new Float32BufferAttribute(new Float32Array(positions), 3)
  const normalAttribute = new Float32BufferAttribute(new Float32Array(normals), 3)
  const indexAttribute = new BufferAttribute(
    indices.length > 65535 ? new Uint32Array(indices) : new Uint16Array(indices),
    1
  )

  return {
    positions: positionAttribute,
    indices: indexAttribute,
    normals: normalAttribute,
    triangles
  }
}

/**
 * Interpolate between two points to find where the isosurface intersects an edge
 */
function vertexInterp(isolevel: number, p1: Vector3, p2: Vector3, valp1: number, valp2: number): Vector3 {
  const EPSILON = 0.00001

  if (Math.abs(isolevel - valp1) < EPSILON) return { ...p1 }
  if (Math.abs(isolevel - valp2) < EPSILON) return { ...p2 }
  if (Math.abs(valp1 - valp2) < EPSILON) return { ...p1 }

  const mu = (isolevel - valp1) / (valp2 - valp1)
  return {
    x: p1.x + mu * (p2.x - p1.x),
    y: p1.y + mu * (p2.y - p1.y),
    z: p1.z + mu * (p2.z - p1.z)
  }
}

/**
 * Calculate the gradient at a specific point in the grid
 * This is used to determine the normal vector at that point
 */
function calculateGradient(grid: GridData, x: number, y: number, z: number): Vector3 {
  const { values, cellSize } = grid
  const sizeX = values.length
  const sizeY = values[0].length
  const sizeZ = values[0][0].length

  // Calculate gradient using central differences
  // For boundary points, use forward or backward differences
  const gx =
    x > 0 && x < sizeX - 1
      ? (values[x + 1][y][z] - values[x - 1][y][z]) / (2 * cellSize.x)
      : x === 0
      ? (values[x + 1][y][z] - values[x][y][z]) / cellSize.x
      : (values[x][y][z] - values[x - 1][y][z]) / cellSize.x

  const gy =
    y > 0 && y < sizeY - 1
      ? (values[x][y + 1][z] - values[x][y - 1][z]) / (2 * cellSize.y)
      : y === 0
      ? (values[x][y + 1][z] - values[x][y][z]) / cellSize.y
      : (values[x][y][z] - values[x][y - 1][z]) / cellSize.y

  const gz =
    z > 0 && z < sizeZ - 1
      ? (values[x][y][z + 1] - values[x][y][z - 1]) / (2 * cellSize.z)
      : z === 0
      ? (values[x][y][z + 1] - values[x][y][z]) / cellSize.z
      : (values[x][y][z] - values[x][y][z - 1]) / cellSize.z

  // Normalize the gradient
  const length = Math.sqrt(gx * gx + gy * gy + gz * gz)
  if (length < 0.00001) {
    return { x: 0, y: 1, z: 0 } // Default normal if gradient is too small
  }

  return {
    x: -gx / length, // Negative because we want the normal to point outward
    y: -gy / length,
    z: -gz / length
  }
}

/**
 * Interpolate between two normals
 */
function interpolateNormal(n1: Vector3, n2: Vector3, mu: number): Vector3 {
  // Linear interpolation of normals
  const x = n1.x + mu * (n2.x - n1.x)
  const y = n1.y + mu * (n2.y - n1.y)
  const z = n1.z + mu * (n2.z - n1.z)

  // Normalize the result
  const length = Math.sqrt(x * x + y * y + z * z)
  if (length < 0.00001) {
    return { x: 0, y: 1, z: 0 } // Default normal if length is too small
  }

  return {
    x: x / length,
    y: y / length,
    z: z / length
  }
}

/**
 * Process a transition cell to generate triangles for the isosurface
 */
export function processTransitionCell(
  cell: TransitionCell,
  isolevel: number,
  gradients?: Vector3[]
): { triangles: Triangle[] } {
  if (cell.points.length !== 13 || cell.values.length !== 13) {
    throw new Error('Transition cell must have exactly 13 points and 13 values')
  }

  const triangles: Triangle[] = []

  // Create a 9-bit case index from the first 9 corners (high-resolution side)
  let caseIndex = 0
  for (let i = 0; i < 9; i++) {
    if (cell.values[i] < isolevel) {
      caseIndex |= 1 << i
    }
  }

  // Get the equivalence class for this case
  let classIndex = transitionCellClass[caseIndex]

  // Check if we need to reverse triangle winding
  const reverseWinding = (classIndex & 0x80) !== 0

  // Remove the high bit to get the actual class index
  classIndex &= 0x7f

  // Get the cell data for this class
  const cellData = transitionCellData[classIndex]
  if (!cellData || !cellData[1] || cellData[1].length === 0) {
    return { triangles: [] }
  }

  // Get the vertex count and triangle indices
  const geometryCounts = cellData[0]
  const vertexCount = geometryCounts >> 4
  const triangleCount = geometryCounts & 0x0f
  const vertexIndices = cellData[1]

  // Get the vertex data for this case
  const vertexData = transitionVertexData[caseIndex]
  if (!vertexData || vertexData.length === 0) {
    return { triangles: [] }
  }

  // Create vertices by interpolating along edges
  const vertices: Vector3[] = []
  const vertexNormals: Vector3[] = []

  for (let i = 0; i < vertexCount; i++) {
    const edgeData = vertexData[i]
    const edge1 = edgeData & 0x0f
    const edge2 = (edgeData >> 4) & 0x0f

    // Interpolate between the two corners of this edge
    const v = vertexInterp(isolevel, cell.points[edge1], cell.points[edge2], cell.values[edge1], cell.values[edge2])

    vertices.push(v)

    // Calculate normal if gradients are provided
    if (gradients) {
      const mu = (isolevel - cell.values[edge1]) / (cell.values[edge2] - cell.values[edge1])
      const normal = interpolateNormal(gradients[edge1], gradients[edge2], mu)
      vertexNormals.push(normal)
    } else {
      vertexNormals.push({ x: 0, y: 1, z: 0 }) // Default normal
    }
  }

  // Create triangles from the vertices
  for (let i = 0; i < triangleCount * 3; i += 3) {
    let v1 = vertexIndices[i]
    let v2 = vertexIndices[i + 1]
    let v3 = vertexIndices[i + 2]

    // Reverse winding if needed
    if (reverseWinding) {
      ;[v2, v3] = [v3, v2]
    }

    const triangle: Triangle = {
      vertices: [vertices[v1], vertices[v2], vertices[v3]] as [Vector3, Vector3, Vector3],
      normals: [vertexNormals[v1], vertexNormals[v2], vertexNormals[v3]] as [Vector3, Vector3, Vector3]
    }

    triangles.push(triangle)
  }

  return { triangles }
}

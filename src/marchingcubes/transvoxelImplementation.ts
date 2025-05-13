/**
 * Transvoxel Algorithm implementation based on Eric Lengyel's algorithm
 * Reference: https://transvoxel.org/
 *
 * This implementation handles both regular cells and transition cells
 * for seamless LOD transitions in voxel terrain.
 */
import { BufferAttribute, Float32BufferAttribute } from 'three'
import {
  regularCellClass,
  regularCellData,
  regularVertexData,
  transitionCellClass,
  transitionCellData,
  transitionCornerData,
  transitionVertexData
} from './transvoxel'

// Constants
const BLOCK_WIDTH = 16
const PRIMARY = 0
const SECONDARY = 1
const S = 1.0 / 256.0
const UNUSED = { x: 1000, y: 1000, z: 1000 }

// Predefined tables for the algorithm
const CORNER_INDEX: Vector3i[] = [
  { x: 0, y: 0, z: 0 }, // 0
  { x: 1, y: 0, z: 0 }, // 1
  { x: 0, y: 1, z: 0 }, // 2
  { x: 1, y: 1, z: 0 }, // 3
  { x: 0, y: 0, z: 1 }, // 4
  { x: 1, y: 0, z: 1 }, // 5
  { x: 0, y: 1, z: 1 }, // 6
  { x: 1, y: 1, z: 1 } // 7
]

// Basic data structures
export interface Vector3 {
  x: number
  y: number
  z: number
}

export interface Vector3i {
  x: number
  y: number
  z: number
}

// Matrix3x3 class for proper matrix math
export class Matrix3x3 {
  private data: number[][]

  constructor(
    m00: number = 1,
    m01: number = 0,
    m02: number = 0,
    m10: number = 0,
    m11: number = 1,
    m12: number = 0,
    m20: number = 0,
    m21: number = 0,
    m22: number = 1
  ) {
    this.data = [
      [m00, m01, m02],
      [m10, m11, m12],
      [m20, m21, m22]
    ]
  }

  // Create a matrix from three column vectors
  static fromColumns(v0: Vector3, v1: Vector3, v2: Vector3): Matrix3x3 {
    return new Matrix3x3(v0.x, v1.x, v2.x, v0.y, v1.y, v2.y, v0.z, v1.z, v2.z)
  }

  // Multiply matrix by a vector
  multiply(v: Vector3): Vector3 {
    return {
      x: this.data[0][0] * v.x + this.data[0][1] * v.y + this.data[0][2] * v.z,
      y: this.data[1][0] * v.x + this.data[1][1] * v.y + this.data[1][2] * v.z,
      z: this.data[2][0] * v.x + this.data[2][1] * v.y + this.data[2][2] * v.z
    }
  }

  // Multiply matrix by a vector3i and return a vector3i
  multiplyVector3i(v: Vector3i): Vector3i {
    const result = this.multiply({ x: v.x, y: v.y, z: v.z })
    return {
      x: Math.round(result.x),
      y: Math.round(result.y),
      z: Math.round(result.z)
    }
  }
}

export interface Triangle {
  vertices: [Vector3, Vector3, Vector3]
  normals?: [Vector3, Vector3, Vector3]
}

export interface GridCell {
  points: Vector3[]
  values: number[]
}

export interface GridData {
  values: number[][][]
  origin: Vector3
  cellSize: Vector3
}

export interface MarchingCubesBuffers {
  positions: BufferAttribute
  indices: BufferAttribute
  normals?: BufferAttribute
  triangles?: Triangle[]
}

export interface Vertex {
  primary: Vector3
  secondary: Vector3
  normal: Vector3
  near: number
}

export enum Direction {
  POSITIVE_X,
  NEGATIVE_X,
  POSITIVE_Y,
  NEGATIVE_Y,
  POSITIVE_Z,
  NEGATIVE_Z
}

// Cache structures for vertex reuse
export interface RegularCellInfo {
  caseIndex: number
  verts: number[]
}

export interface TransitionCellInfo {
  caseIndex: number
  verts: number[]
}

export class RegularCache {
  private cache: Map<string, RegularCellInfo> = new Map()

  public get(xyz: Vector3i): RegularCellInfo {
    const key = `${xyz.x},${xyz.y},${xyz.z}`
    if (!this.cache.has(key)) {
      this.cache.set(key, { caseIndex: 0, verts: new Array(12).fill(-1) })
    }
    return this.cache.get(key)!
  }

  public set(xyz: Vector3i, info: RegularCellInfo): void {
    const key = `${xyz.x},${xyz.y},${xyz.z}`
    this.cache.set(key, info)
  }
}

export class TransitionCache {
  private cache: Map<string, TransitionCellInfo> = new Map()

  public get(x: number, y: number): TransitionCellInfo {
    const key = `${x},${y}`
    if (!this.cache.has(key)) {
      this.cache.set(key, { caseIndex: 0, verts: new Array(12).fill(-1) })
    }
    return this.cache.get(key)!
  }

  public set(x: number, y: number, info: TransitionCellInfo): void {
    const key = `${x},${y}`
    this.cache.set(key, info)
  }
}

// Utility functions
function hiNibble(b: number): number {
  return (b >> 4) & 0x0f
}

function loNibble(b: number): number {
  return b & 0x0f
}

function sign(b: number): number {
  return (b >> 7) & 1
}

function prevOffset(dir: number): Vector3i {
  return {
    x: -(dir & 1),
    y: -((dir >> 1) & 1),
    z: -((dir >> 2) & 1)
  }
}

function add(a: Vector3, b: Vector3): Vector3 {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
    z: a.z + b.z
  }
}

function multiply(a: Vector3, s: number): Vector3 {
  return {
    x: a.x * s,
    y: a.y * s,
    z: a.z * s
  }
}

function normalize(v: Vector3): Vector3 {
  // Handle NaN values
  if (isNaN(v.x) || isNaN(v.y) || isNaN(v.z)) {
    return { x: 0, y: 1, z: 0 }
  }

  const length = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
  if (length < 0.00001) {
    return { x: 0, y: 1, z: 0 }
  }

  // Ensure we don't divide by zero
  const invLength = 1.0 / length
  return {
    x: v.x * invLength,
    y: v.y * invLength,
    z: v.z * invLength
  }
}

/**
 * Calculate gradient at a point using central difference
 * This matches the C# implementation's approach
 */
function calculateGradient(samples: number[][][], p: Vector3i): Vector3 {
  // Ensure we have valid samples array
  if (!samples || !samples.length || !samples[0] || !samples[0].length || !samples[0][0] || !samples[0][0].length) {
    return { x: 0, y: 1, z: 0 } // Default normal pointing up
  }

  // Clamp coordinates to valid range
  const sizeX = samples.length
  const sizeY = samples[0].length
  const sizeZ = samples[0][0].length

  // Safely get sample values with bounds checking
  const getSample = (pos: Vector3i): number => {
    const x = Math.min(Math.max(0, pos.x), sizeX - 1)
    const y = Math.min(Math.max(0, pos.y), sizeY - 1)
    const z = Math.min(Math.max(0, pos.z), sizeZ - 1)
    return samples[x][y][z]
  }

  // Calculate gradient using central difference
  const nx = (getSample({ x: p.x + 1, y: p.y, z: p.z }) - getSample({ x: p.x - 1, y: p.y, z: p.z })) * 0.5
  const ny = (getSample({ x: p.x, y: p.y + 1, z: p.z }) - getSample({ x: p.x, y: p.y - 1, z: p.z })) * 0.5
  const nz = (getSample({ x: p.x, y: p.y, z: p.z + 1 }) - getSample({ x: p.x, y: p.y, z: p.z - 1 })) * 0.5

  // Handle NaN values
  const gradient: Vector3 = {
    x: isNaN(nx) ? 0 : nx,
    y: isNaN(ny) ? 1 : ny,
    z: isNaN(nz) ? 0 : nz
  }

  return normalize(gradient)
}

function interp(
  v0: Vector3,
  v1: Vector3,
  p0: Vector3i,
  p1: Vector3i,
  samples: number[][][],
  lodIndex: number = 0
): Vector3 {
  // Safely get sample values
  const getSample = (p: Vector3i): number => {
    const x = Math.min(Math.max(0, p.x), samples.length - 1)
    const y = Math.min(Math.max(0, p.y), samples[0].length - 1)
    const z = Math.min(Math.max(0, p.z), samples[0][0].length - 1)
    return samples[x][y][z]
  }

  // Get initial sample values
  let s0 = getSample(p0)
  let s1 = getSample(p1)

  // Make copies of the input vectors since we'll modify them
  let v0Copy: Vector3 = { x: v0.x, y: v0.y, z: v0.z }
  let v1Copy: Vector3 = { x: v1.x, y: v1.y, z: v1.z }
  let p0Copy: Vector3i = { x: p0.x, y: p0.y, z: p0.z }
  let p1Copy: Vector3i = { x: p1.x, y: p1.y, z: p1.z }

  // Calculate interpolation factor
  let t = (s1 << 8) / (s1 - s0)
  let u = 0x0100 - t

  // If the vertex lies at one of the corners, no need to subdivide
  if ((t & 0x00ff) === 0) {
    // The generated vertex lies at one of the corners
    if (t === 0) {
      return { x: v1Copy.x, y: v1Copy.y, z: v1Copy.z }
    }
    return { x: v0Copy.x, y: v0Copy.y, z: v0Copy.z }
  } else {
    // Recursive subdivision for LOD levels
    for (let i = 0; i < lodIndex; ++i) {
      // Calculate midpoint of the edge
      const vm: Vector3 = {
        x: (v0Copy.x + v1Copy.x) / 2,
        y: (v0Copy.y + v1Copy.y) / 2,
        z: (v0Copy.z + v1Copy.z) / 2
      }

      // Calculate midpoint of the sample positions
      const pm: Vector3i = {
        x: Math.floor((p0Copy.x + p1Copy.x) / 2),
        y: Math.floor((p0Copy.y + p1Copy.y) / 2),
        z: Math.floor((p0Copy.z + p1Copy.z) / 2)
      }

      // Get the sample value at the midpoint
      const sm = getSample(pm)

      // Determine which of the sub-intervals contains the intersection with the isosurface
      if ((s0 < 0 && sm >= 0) || (s0 >= 0 && sm < 0)) {
        // Intersection is in the first half
        v1Copy = vm
        p1Copy = pm
        s1 = sm
      } else {
        // Intersection is in the second half
        v0Copy = vm
        p0Copy = pm
        s0 = sm
      }
    }

    // Recalculate interpolation factor after subdivision
    t = (s1 << 8) / (s1 - s0)
    u = 0x0100 - t

    const t0 = t * S
    const t1 = u * S

    // Linear interpolation of vertex position
    return {
      x: v0Copy.x * t0 + v1Copy.x * t1,
      y: v0Copy.y * t0 + v1Copy.y * t1,
      z: v0Copy.z * t0 + v1Copy.z * t1
    }
  }
}

function computeDelta(v: Vector3, k: number, s: number): Vector3 {
  const p2k = Math.pow(2.0, k) // 1 << k would be more efficient
  const wk = Math.pow(2.0, k - 2.0) // 1 << (k-2)
  const delta: Vector3 = { x: 0, y: 0, z: 0 }

  if (k < 1) {
    return delta
  }

  // x
  const p2mk = Math.pow(2.0, -k)
  if (v.x < p2k) {
    // The vertex is inside the minimum cell
    delta.x = (1.0 - p2mk * v.x) * wk
  } else if (v.x > p2k * (s - 1)) {
    // The vertex is inside the maximum cell
    delta.x = (p2k * s - 1.0 - v.x) * wk
  }

  // y
  if (v.y < p2k) {
    delta.y = (1.0 - p2mk * v.y) * wk
  } else if (v.y > p2k * (s - 1)) {
    delta.y = (p2k * s - 1.0 - v.y) * wk
  }

  // z
  if (v.z < p2k) {
    delta.z = (1.0 - p2mk * v.z) * wk
  } else if (v.z > p2k * (s - 1)) {
    delta.z = (p2k * s - 1.0 - v.z) * wk
  }

  return delta
}

function projectNormal(n: Vector3, delta: Vector3): Vector3 {
  // Create a projection matrix using Matrix3x3
  const mat = new Matrix3x3(
    1.0 - n.x * n.x,
    -n.x * n.y,
    -n.x * n.z,
    -n.x * n.y,
    1.0 - n.y * n.y,
    -n.y * n.z,
    -n.x * n.z,
    -n.y * n.z,
    1.0 - n.z * n.z
  )

  // Apply the projection matrix to the delta vector
  return mat.multiply(delta)
}

// Create buffer attributes from triangles - used by tests
export function createBufferAttributes(triangles: Triangle[]): MarchingCubesBuffers {
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
 * Process a regular cell to generate triangles using the Transvoxel algorithm
 */
export function polygonizeRegularCell(
  min: Vector3i,
  offset: Vector3,
  xyz: Vector3i,
  samples: number[][][],
  lodIndex: number,
  _cellSize: number, // Not used but kept for API consistency
  verts: Vertex[],
  indices: number[],
  cache: RegularCache
): number {
  const lodScale = 1 << lodIndex
  const last = 15 * lodScale
  const directionMask = (xyz.x > 0 ? 1 : 0) | ((xyz.y > 0 ? 1 : 0) << 1) | ((xyz.z > 0 ? 1 : 0) << 2)
  let near = 0

  // Compute which of the six faces of the block that the vertex is near
  // (near is defined as being in boundary cell)
  // Check X axis (i=0)
  if (min.x === 0) {
    near |= 1 << 0
  }
  if (min.x === last) {
    near |= 1 << 1
  }
  // Check Y axis (i=1)
  if (min.y === 0) {
    near |= 1 << 2
  }
  if (min.y === last) {
    near |= 1 << 3
  }
  // Check Z axis (i=2)
  if (min.z === 0) {
    near |= 1 << 4
  }
  if (min.z === last) {
    near |= 1 << 5
  }

  // Define corner positions using the predefined table
  const cornerPositions: Vector3i[] = CORNER_INDEX.map((corner) => ({
    x: min.x + corner.x * lodScale,
    y: min.y + corner.y * lodScale,
    z: min.z + corner.z * lodScale
  }))

  // Retrieve sample values for all the corners with safety checks
  const cornerSamples = cornerPositions.map((p) => {
    // Make sure we don't access out of bounds
    const x = Math.min(Math.max(0, p.x), samples.length - 1)
    const y = Math.min(Math.max(0, p.y), samples[0].length - 1)
    const z = Math.min(Math.max(0, p.z), samples[0][0].length - 1)
    return samples[x][y][z]
  })

  // Calculate case index
  const caseCode =
    ((cornerSamples[0] >> 7) & 0x01) |
    ((cornerSamples[1] >> 6) & 0x02) |
    ((cornerSamples[2] >> 5) & 0x04) |
    ((cornerSamples[3] >> 4) & 0x08) |
    ((cornerSamples[4] >> 3) & 0x10) |
    ((cornerSamples[5] >> 2) & 0x20) |
    ((cornerSamples[6] >> 1) & 0x40) |
    (cornerSamples[7] & 0x80)

  const cellInfo = cache.get(xyz)
  cellInfo.caseIndex = caseCode
  cache.set(xyz, cellInfo)

  // If all corners are inside or outside, there's no surface
  if ((caseCode ^ ((cornerSamples[7] >> 7) & 0xff)) === 0) {
    return 0
  }

  // Compute the normals at the cell corners using central difference
  const cornerNormals: Vector3[] = cornerPositions.map((p) => {
    // Calculate gradient with central difference
    return calculateGradient(samples, p)
  })

  // Get the equivalence class for this case
  const classIndex = regularCellClass[caseCode]
  const data = regularCellData[classIndex]

  // Extract the vertex and triangle counts
  const triangleCount = Number(data[0]) & 0x0f
  const vertexCount = Number(data[0]) >> 4

  // Array to map local vertex indices to global vertex indices
  const localVertexMapping: number[] = new Array(12).fill(-1)

  // Generate all the vertex positions by interpolating along edges
  for (let i = 0; i < vertexCount; i++) {
    const edgeCode = regularVertexData[caseCode][i]
    const v0 = hiNibble(edgeCode & 0xff)
    const v1 = loNibble(edgeCode & 0xff)

    const p0 = cornerPositions[v0]
    const p1 = cornerPositions[v1]
    const n0 = cornerNormals[v0]
    const n1 = cornerNormals[v1]

    // Safely get sample values
    const x0 = Math.min(Math.max(0, p0.x), samples.length - 1)
    const y0 = Math.min(Math.max(0, p0.y), samples[0].length - 1)
    const z0 = Math.min(Math.max(0, p0.z), samples[0][0].length - 1)
    const d0 = samples[x0][y0][z0]

    const x1 = Math.min(Math.max(0, p1.x), samples.length - 1)
    const y1 = Math.min(Math.max(0, p1.y), samples[0].length - 1)
    const z1 = Math.min(Math.max(0, p1.z), samples[0][0].length - 1)
    const d1 = samples[x1][y1][z1]

    const t = (d1 << 8) / (d1 - d0)
    const u = 0x0100 - t

    const t0 = t * S
    const t1 = u * S

    if ((t & 0x00ff) !== 0) {
      // Vertex lies in the interior of the edge
      const dir = hiNibble(edgeCode >> 8)
      const idx = loNibble(edgeCode >> 8)
      const present = (dir & directionMask) === dir

      if (present) {
        const prev = cache.get({
          x: xyz.x + prevOffset(dir).x,
          y: xyz.y + prevOffset(dir).y,
          z: xyz.z + prevOffset(dir).z
        })

        // Check if previous cell has geometry
        if (prev.caseIndex === 0 || prev.caseIndex === 255) {
          localVertexMapping[i] = -1
        } else {
          localVertexMapping[i] = prev.verts[idx]
        }
      }

      if (!present || localVertexMapping[i] < 0) {
        // Need to create a new vertex
        localVertexMapping[i] = verts.length

        // Interpolate vertex position
        const p0Vec: Vector3 = { x: p0.x, y: p0.y, z: p0.z }
        const p1Vec: Vector3 = { x: p1.x, y: p1.y, z: p1.z }
        const pi = interp(p0Vec, p1Vec, p0, p1, samples, lodIndex)

        // Create vertex
        const vertex: Vertex = {
          primary: add(offset, pi),
          normal: add(multiply(n0, t0), multiply(n1, t1)),
          near,
          secondary: UNUSED
        }

        // Apply displacement for boundary vertices
        if (near > 0) {
          const delta = computeDelta(pi, lodIndex, 16)
          vertex.secondary = add(vertex.primary, projectNormal(vertex.normal, delta))
        }

        verts.push(vertex)

        // Store the generated vertex for reuse
        if ((dir & 8) !== 0) {
          cellInfo.verts[idx] = localVertexMapping[i]
          cache.set(xyz, cellInfo)
        }
      }
    } else if (t === 0 && v1 === 7) {
      // This cell owns the vertex at corner 7
      localVertexMapping[i] = verts.length

      const p1Vec: Vector3 = { x: p1.x, y: p1.y, z: p1.z }
      const pi = add(multiply(p1Vec, t0), multiply(p1Vec, t1))

      // Create vertex
      const vertex: Vertex = {
        primary: add(offset, pi),
        normal: add(multiply(n0, t0), multiply(n1, t1)),
        near,
        secondary: UNUSED
      }

      // Apply displacement for boundary vertices
      if (near > 0) {
        const delta = computeDelta(pi, lodIndex, 16)
        vertex.secondary = add(vertex.primary, projectNormal(vertex.normal, delta))
      }

      verts.push(vertex)
      cellInfo.verts[0] = localVertexMapping[i]
      cache.set(xyz, cellInfo)
    } else {
      // Vertex is at a corner
      const dir = t === 0 ? v1 ^ 7 : v0 ^ 7
      const present = (dir & directionMask) === dir

      if (present) {
        const prev = cache.get({
          x: xyz.x + prevOffset(dir).x,
          y: xyz.y + prevOffset(dir).y,
          z: xyz.z + prevOffset(dir).z
        })

        // Check if previous cell has geometry
        if (prev.caseIndex === 0 || prev.caseIndex === 255) {
          localVertexMapping[i] = -1
        } else {
          localVertexMapping[i] = prev.verts[0]
        }
      }

      if (!present || localVertexMapping[i] < 0) {
        // Need to create a new vertex
        localVertexMapping[i] = verts.length

        const p0Vec: Vector3 = { x: p0.x, y: p0.y, z: p0.z }
        const p1Vec: Vector3 = { x: p1.x, y: p1.y, z: p1.z }
        const pi = add(multiply(p0Vec, t0), multiply(p1Vec, t1))

        // Create vertex
        const vertex: Vertex = {
          primary: add(offset, pi),
          normal: add(multiply(n0, t0), multiply(n1, t1)),
          near,
          secondary: UNUSED
        }

        // Apply displacement for boundary vertices
        if (near > 0) {
          const delta = computeDelta(pi, lodIndex, 16)
          vertex.secondary = add(vertex.primary, projectNormal(vertex.normal, delta))
        }

        verts.push(vertex)
      }
    }
  }

  // Generate triangles
  for (let t = 0; t < triangleCount; t++) {
    for (let i = 0; i < 3; i++) {
      indices.push(localVertexMapping[data[1][t * 3 + i]])
    }
  }

  return triangleCount
}

/**
 * Process a transition cell to generate triangles using the Transvoxel algorithm
 */
export function polygonizeTransitionCell(
  offset: Vector3,
  origin: Vector3i,
  localX: Vector3i,
  localY: Vector3i,
  localZ: Vector3i,
  x: number,
  y: number,
  _cellSize: number, // Not used but kept for API consistency
  lodIndex: number,
  axis: number,
  directionMask: number,
  samples: number[][][],
  verts: Vertex[],
  indices: number[],
  cache: TransitionCache
): number {
  // const lodStep = 1 << lodIndex // Unused
  const sampleStep = 1 << (lodIndex - 1)
  const lodScale = 1 << lodIndex
  const last = 16 * lodScale
  let near = 0

  // Compute which of the six faces of the block that the vertex is near
  // Check X axis
  if (origin.x === 0) near |= 1 << 0
  if (origin.x === last) near |= 1 << 1

  // Check Y axis
  if (origin.y === 0) near |= 1 << 2
  if (origin.y === last) near |= 1 << 3

  // Check Z axis
  if (origin.z === 0) near |= 1 << 4
  if (origin.z === last) near |= 1 << 5

  // Define the 13 coordinates for the transition cell
  const coords: Vector3i[] = [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 2, y: 0, z: 0 }, // High-res lower row
    { x: 0, y: 1, z: 0 },
    { x: 1, y: 1, z: 0 },
    { x: 2, y: 1, z: 0 }, // High-res middle row
    { x: 0, y: 2, z: 0 },
    { x: 1, y: 2, z: 0 },
    { x: 2, y: 2, z: 0 }, // High-res upper row
    { x: 0, y: 0, z: 2 },
    { x: 2, y: 0, z: 2 }, // Low-res lower row
    { x: 0, y: 2, z: 2 },
    { x: 2, y: 2, z: 2 } // Low-res upper row
  ]

  // Transform coordinates to sample positions using Matrix3x3
  const mx: Vector3 = { x: localX.x * sampleStep, y: localX.y * sampleStep, z: localX.z * sampleStep }
  const my: Vector3 = { x: localY.x * sampleStep, y: localY.y * sampleStep, z: localY.z * sampleStep }
  const mz: Vector3 = { x: localZ.x * sampleStep, y: localZ.y * sampleStep, z: localZ.z * sampleStep }

  // Create a basis matrix from the three vectors
  const basis = Matrix3x3.fromColumns(mx, my, mz)

  // Calculate positions for all 13 points using the basis matrix
  const pos: Vector3i[] = coords.map((coord) => {
    const transformed = basis.multiplyVector3i(coord)
    return {
      x: origin.x + transformed.x,
      y: origin.y + transformed.y,
      z: origin.z + transformed.z
    }
  })

  // Calculate normals for the first 9 points (high-res side)
  const normals: Vector3[] = []
  for (let i = 0; i < 9; i++) {
    // Calculate gradient with central difference
    normals.push(calculateGradient(samples, pos[i]))
  }

  // Copy normals for the low-res side
  normals[9] = normals[0]
  normals[10] = normals[2]
  normals[11] = normals[6]
  normals[12] = normals[8]

  // Helper function to safely get sample value
  const getSafeValue = (p: Vector3i) => {
    // Make sure we don't access out of bounds
    const x = Math.min(Math.max(0, p.x), samples.length - 1)
    const y = Math.min(Math.max(0, p.y), samples[0].length - 1)
    const z = Math.min(Math.max(0, p.z), samples[0][0].length - 1)
    return samples[x][y][z]
  }

  // Calculate case index based on which corners are inside/outside
  const caseCode =
    (sign(getSafeValue(pos[0])) * 0x001) |
    (sign(getSafeValue(pos[1])) * 0x002) |
    (sign(getSafeValue(pos[2])) * 0x004) |
    (sign(getSafeValue(pos[5])) * 0x008) |
    (sign(getSafeValue(pos[8])) * 0x010) |
    (sign(getSafeValue(pos[7])) * 0x020) |
    (sign(getSafeValue(pos[6])) * 0x040) |
    (sign(getSafeValue(pos[3])) * 0x080) |
    (sign(getSafeValue(pos[4])) * 0x100)

  // If all corners are inside or outside, there's no surface
  if (caseCode === 0 || caseCode === 511) {
    return 0
  }

  const cellInfo = cache.get(x, y)
  cellInfo.caseIndex = caseCode
  cache.set(x, y, cellInfo)

  // Get the equivalence class and inversion flag
  const classIndex = transitionCellClass[caseCode]
  const data = transitionCellData[classIndex & 0x7f]
  const inverse = (classIndex & 128) !== 0

  // Extract the vertex and triangle counts
  const vertexCount = Number(data[0]) >> 4
  const triangleCount = Number(data[0]) & 0x0f

  // Array to map local vertex indices to global vertex indices
  const localVertexMapping: number[] = new Array(12).fill(-1)

  // Generate vertices
  for (let i = 0; i < vertexCount; i++) {
    const edgeCode = transitionVertexData[caseCode][i]
    const v0 = hiNibble(edgeCode)
    const v1 = loNibble(edgeCode)
    const lowside = v0 > 8 && v1 > 8

    const d0 = getSafeValue(pos[v0])
    const d1 = getSafeValue(pos[v1])

    const t = (d1 << 8) / (d1 - d0)
    const u = 0x0100 - t
    const t0 = t * S
    const t1 = u * S

    const n0 = normals[v0]
    const n1 = normals[v1]

    // Create vertex
    const vertex: Vertex = {
      primary: UNUSED,
      secondary: UNUSED,
      normal: add(multiply(n0, t0), multiply(n1, t1)),
      near
    }

    if ((t & 0x00ff) !== 0) {
      // Vertex lies in the interior of the edge
      const dir = hiNibble(edgeCode >> 8)
      const idx = loNibble(edgeCode >> 8)
      const present = (dir & directionMask) === dir

      if (present) {
        // Try to reuse vertex from previous cell
        const prev = cache.get(x - (dir & 1), y - ((dir >> 1) & 1))

        if (prev.caseIndex === 0 || prev.caseIndex === 511) {
          // Previous cell has no geometry
          localVertexMapping[i] = -1
        } else {
          // Reuse vertex from previous cell
          localVertexMapping[i] = prev.verts[idx]
        }
      }

      if (!present || localVertexMapping[i] < 0) {
        // Need to create a new vertex
        const p0Vec: Vector3 = { x: pos[v0].x, y: pos[v0].y, z: pos[v0].z }
        const p1Vec: Vector3 = { x: pos[v1].x, y: pos[v1].y, z: pos[v1].z }

        // Interpolate vertex position
        const pi = interp(p0Vec, p1Vec, pos[v0], pos[v1], samples, lowside ? lodIndex : lodIndex - 1)

        if (lowside) {
          // Vertex is on the low-resolution side
          // Adjust position based on axis
          switch (axis) {
            case 0:
              pi.x = origin.x
              break
            case 1:
              pi.y = origin.y
              break
            case 2:
              pi.z = origin.z
              break
          }

          // Apply displacement
          const delta = computeDelta(pi, lodIndex, 16)
          const proj = projectNormal(vertex.normal, delta)

          vertex.primary = UNUSED
          vertex.secondary = add(add(offset, pi), proj)
        } else {
          // Vertex is on the high-resolution side
          vertex.near = 0
          vertex.primary = add(offset, pi)
          vertex.secondary = UNUSED
        }

        localVertexMapping[i] = verts.length
        verts.push(vertex)

        // Store vertex for potential reuse
        if ((dir & 8) !== 0) {
          cellInfo.verts[idx] = localVertexMapping[i]
          cache.set(x, y, cellInfo)
        }
      }
    } else {
      // Vertex is at a corner
      const v = t === 0 ? v1 : v0
      const cornerData = transitionCornerData[v]
      const dir = hiNibble(cornerData)
      const idx = loNibble(cornerData)
      const present = (dir & directionMask) === dir

      if (present) {
        // Try to reuse vertex from previous cell
        const prev = cache.get(x - (dir & 1), y - ((dir >> 1) & 1))

        if (prev.caseIndex === 0 || prev.caseIndex === 511) {
          // Previous cell has no geometry
          localVertexMapping[i] = -1
        } else {
          // Reuse vertex from previous cell
          localVertexMapping[i] = prev.verts[idx]
        }
      }

      if (!present || localVertexMapping[i] < 0) {
        // Need to create a new vertex
        const pi: Vector3 = { x: pos[v].x, y: pos[v].y, z: pos[v].z }

        if (v > 8) {
          // Vertex is on the low-resolution side
          // Adjust position based on axis
          switch (axis) {
            case 0:
              pi.x = origin.x
              break
            case 1:
              pi.y = origin.y
              break
            case 2:
              pi.z = origin.z
              break
          }

          // Apply displacement
          const delta = computeDelta(pi, lodIndex, 16)
          const proj = projectNormal(vertex.normal, delta)

          vertex.primary = UNUSED
          vertex.secondary = add(add(offset, pi), proj)
        } else {
          // Vertex is on the high-resolution side
          vertex.near = 0
          vertex.primary = add(offset, pi)
          vertex.secondary = UNUSED
        }

        localVertexMapping[i] = verts.length
        cellInfo.verts[idx] = localVertexMapping[i]
        verts.push(vertex)
      }
    }
  }

  // Generate triangles
  for (let t = 0; t < triangleCount; t++) {
    if (inverse) {
      // Reverse winding order for inverted cases
      indices.push(localVertexMapping[data[1][t * 3 + 2]])
      indices.push(localVertexMapping[data[1][t * 3 + 1]])
      indices.push(localVertexMapping[data[1][t * 3 + 0]])
    } else {
      indices.push(localVertexMapping[data[1][t * 3 + 0]])
      indices.push(localVertexMapping[data[1][t * 3 + 1]])
      indices.push(localVertexMapping[data[1][t * 3 + 2]])
    }
  }

  return triangleCount
}

/**
 * Main function to generate a mesh from a grid using the Transvoxel algorithm
 * This handles both regular cells and transition cells at LOD boundaries
 */
export function generateTransvoxelMesh(
  grid: GridData,
  isolevel: number = 0,
  lodIndex: number = 0
): MarchingCubesBuffers {
  const { values, origin, cellSize } = grid
  const sizeX = values.length - 1
  const sizeY = values[0].length - 1
  const sizeZ = values[0][0].length - 1

  // Create caches for vertex reuse
  const regularCache = new RegularCache()
  const transitionCache = new TransitionCache()

  // Arrays to store vertices and indices
  const vertices: Vertex[] = []
  const indices: number[] = []

  // Process regular cells
  for (let x = 0; x < sizeX; x++) {
    for (let y = 0; y < sizeY; y++) {
      for (let z = 0; z < sizeZ; z++) {
        // Skip cells at LOD boundaries - these will be handled by transition cells
        if (isLODBoundary(x, y, z, lodIndex, sizeX, sizeY, sizeZ)) {
          continue
        }

        // Check if this cell intersects the isosurface
        const cellValues = [
          values[x][y][z],
          values[x + 1][y][z],
          values[x][y + 1][z],
          values[x + 1][y + 1][z],
          values[x][y][z + 1],
          values[x + 1][y][z + 1],
          values[x][y + 1][z + 1],
          values[x + 1][y + 1][z + 1]
        ]

        // Skip cells that don't intersect the isosurface
        if (cellValues.every((v) => v >= isolevel) || cellValues.every((v) => v < isolevel)) {
          continue
        }

        const min: Vector3i = { x, y, z }
        const xyz: Vector3i = { x, y, z }
        const offset: Vector3 = {
          x: origin.x + x * cellSize.x,
          y: origin.y + y * cellSize.y,
          z: origin.z + z * cellSize.z
        }

        polygonizeRegularCell(
          min,
          offset,
          xyz,
          values,
          lodIndex,
          Math.max(cellSize.x, cellSize.y, cellSize.z),
          vertices,
          indices,
          regularCache
        )
      }
    }
  }

  // Process transition cells at LOD boundaries
  if (lodIndex > 0) {
    // For each face direction
    for (let axis = 0; axis < 3; axis++) {
      // For each face (positive and negative)
      for (let face = 0; face < 2; face++) {
        const directionMask = 1 << (axis * 2 + face)

        // Determine the local coordinate system for this face
        let localX: Vector3i, localY: Vector3i, localZ: Vector3i

        switch (axis) {
          case 0: // X axis
            localX = { x: 0, y: 0, z: face === 0 ? 1 : -1 }
            localY = { x: 0, y: 1, z: 0 }
            localZ = { x: face === 0 ? -1 : 1, y: 0, z: 0 }
            break
          case 1: // Y axis
            localX = { x: 1, y: 0, z: 0 }
            localY = { x: 0, y: 0, z: face === 0 ? 1 : -1 }
            localZ = { x: 0, y: face === 0 ? -1 : 1, z: 0 }
            break
          case 2: // Z axis
            localX = { x: 1, y: 0, z: 0 }
            localY = { x: 0, y: 1, z: 0 }
            localZ = { x: 0, y: 0, z: face === 0 ? -1 : 1 }
            break
          default:
            continue
        }

        // Determine the range of cells to process for this face
        const rangeX = axis === 0 ? 1 : sizeX - 1
        const rangeY = axis === 1 ? 1 : sizeY - 1

        // Process transition cells for this face
        for (let x = 0; x < rangeX; x += 2) {
          for (let y = 0; y < rangeY; y += 2) {
            // Determine the origin of the transition cell
            let origin: Vector3i

            switch (axis) {
              case 0: // X axis
                origin = {
                  x: face === 0 ? 0 : sizeX - 1,
                  y: y,
                  z: x
                }
                break
              case 1: // Y axis
                origin = {
                  x: x,
                  y: face === 0 ? 0 : sizeY - 1,
                  z: y
                }
                break
              case 2: // Z axis
                origin = {
                  x: x,
                  y: y,
                  z: face === 0 ? 0 : sizeZ - 1
                }
                break
              default:
                continue
            }

            // Calculate offset for this cell
            const offset: Vector3 = {
              x: origin.x * cellSize.x,
              y: origin.y * cellSize.y,
              z: origin.z * cellSize.z
            }

            // Check if this transition cell might intersect the isosurface
            // This is a simplified check - a more accurate check would examine all 13 points
            const samplePoints = [
              { x: origin.x, y: origin.y, z: origin.z },
              { x: origin.x + localX.x * 2, y: origin.y + localX.y * 2, z: origin.z + localX.z * 2 },
              { x: origin.x + localY.x * 2, y: origin.y + localY.y * 2, z: origin.z + localY.z * 2 },
              {
                x: origin.x + localX.x * 2 + localY.x * 2,
                y: origin.y + localX.y * 2 + localY.y * 2,
                z: origin.z + localX.z * 2 + localY.z * 2
              }
            ]

            // Safely get sample values with bounds checking
            const sampleValues = samplePoints.map((p) => {
              const x = Math.min(Math.max(0, p.x), values.length - 1)
              const y = Math.min(Math.max(0, p.y), values[0].length - 1)
              const z = Math.min(Math.max(0, p.z), values[0][0].length - 1)
              return values[x][y][z]
            })

            // Skip if all sample points are on the same side of the isosurface
            if (sampleValues.every((v) => v >= isolevel) || sampleValues.every((v) => v < isolevel)) {
              continue
            }

            polygonizeTransitionCell(
              offset,
              origin,
              localX,
              localY,
              localZ,
              x,
              y,
              Math.max(cellSize.x, cellSize.y, cellSize.z),
              lodIndex,
              axis,
              directionMask,
              values,
              vertices,
              indices,
              transitionCache
            )
          }
        }
      }
    }
  }

  // Convert vertices and indices to buffer attributes
  return createBuffersFromVertices(vertices, indices)
}

/**
 * Check if a cell is at an LOD boundary
 *
 * This function determines if a cell is at the boundary between different LOD levels.
 * For the Transvoxel algorithm, we need to identify cells that are at the edge of a
 * chunk that would transition to a lower LOD level.
 *
 * The logic is based on the binary representation of coordinates:
 * - For a cell to be at an LOD boundary, one of its coordinates must be at a power-of-two boundary
 * - We use a bitmask to check if the coordinate is at such a boundary
 * - We also check that the cell is not at the edge of the grid
 */
function isLODBoundary(
  x: number,
  y: number,
  z: number,
  lodIndex: number,
  sizeX: number,
  sizeY: number,
  sizeZ: number
): boolean {
  // If LOD is 0, there are no LOD transitions
  if (lodIndex === 0) {
    return false
  }

  // Check if the cell is at a grid boundary
  const isGridBoundary = x === 0 || x === sizeX - 1 || y === 0 || y === sizeY - 1 || z === 0 || z === sizeZ - 1

  // If the cell is at a grid boundary, it's not an LOD boundary
  if (isGridBoundary) {
    return false
  }

  // Calculate the LOD step size (e.g., for LOD 2, step is 4)
  const lodStep = 1 << lodIndex

  // Check if this cell is at the edge of a chunk that would transition to a lower LOD
  // A cell is at an LOD boundary if any of its coordinates is at a power-of-two boundary
  // that corresponds to the current LOD level

  // Check if x is at an LOD boundary (divisible by lodStep)
  const xBoundary = x % lodStep === 0 || x % lodStep === lodStep - 1

  // Check if y is at an LOD boundary (divisible by lodStep)
  const yBoundary = y % lodStep === 0 || y % lodStep === lodStep - 1

  // Check if z is at an LOD boundary (divisible by lodStep)
  const zBoundary = z % lodStep === 0 || z % lodStep === lodStep - 1

  // A cell is at an LOD boundary if any of its coordinates is at a boundary
  return xBoundary || yBoundary || zBoundary
}

/**
 * Convert vertices and indices to buffer attributes
 */
function createBuffersFromVertices(vertices: Vertex[], indices: number[]): MarchingCubesBuffers {
  // Remove debug logging
  // console.log(vertices, indices)

  if (vertices.length === 0 || indices.length === 0) {
    return {
      positions: new Float32BufferAttribute(new Float32Array(0), 3),
      indices: new BufferAttribute(new Uint16Array(0), 1),
      normals: new Float32BufferAttribute(new Float32Array(0), 3)
    }
  }

  // Create position and normal arrays
  const positions: number[] = []
  const normals: number[] = []

  // Process vertices
  for (const vertex of vertices) {
    // Use primary position if available, otherwise use secondary
    const position = vertex.primary !== UNUSED ? vertex.primary : vertex.secondary

    // Handle NaN values in positions
    const px = isNaN(position.x) ? 0 : position.x
    const py = isNaN(position.y) ? 0 : position.y
    const pz = isNaN(position.z) ? 0 : position.z

    positions.push(px, py, pz)

    // Handle NaN values in normals
    const nx = isNaN(vertex.normal.x) ? 0 : vertex.normal.x
    const ny = isNaN(vertex.normal.y) ? 1 : vertex.normal.y
    const nz = isNaN(vertex.normal.z) ? 0 : vertex.normal.z

    // Normalize the normal vector
    const length = Math.sqrt(nx * nx + ny * ny + nz * nz)
    if (length < 0.00001) {
      normals.push(0, 1, 0) // Default normal if length is too small
    } else {
      normals.push(nx / length, ny / length, nz / length)
    }
  }

  // Filter out invalid indices
  const validIndices = indices.filter((index) => index >= 0 && index < vertices.length)

  // Create buffer attributes
  const positionAttribute = new Float32BufferAttribute(new Float32Array(positions), 3)
  const normalAttribute = new Float32BufferAttribute(new Float32Array(normals), 3)
  const indexAttribute = new BufferAttribute(
    validIndices.length > 65535 ? new Uint32Array(validIndices) : new Uint16Array(validIndices),
    1
  )

  return {
    positions: positionAttribute,
    indices: indexAttribute,
    normals: normalAttribute
  }
}

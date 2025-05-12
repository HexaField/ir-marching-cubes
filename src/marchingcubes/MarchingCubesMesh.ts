/**
 * Utility class for creating Three.js meshes from marching cubes data
 */
import { BufferAttribute, BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial } from 'three'
import { GridCell, GridData, MarchingCubesBuffers, polygonise, polygoniseGrid } from './triangulation'

/**
 * Creates a Three.js mesh from a grid cell and isolevel using marching cubes
 * @deprecated Use createGridMesh instead for better performance
 */
export function createMarchingCubesMesh(grid: GridCell, isolevel: number, material?: MeshStandardMaterial): Mesh {
  // Get buffer attributes from marching cubes algorithm
  const { positions, indices } = polygonise(grid, isolevel)

  // Create a new buffer geometry
  const geometry = new BufferGeometry()

  // Set the attributes
  geometry.setAttribute('position', positions)
  geometry.setIndex(indices)

  // Compute vertex normals
  geometry.computeVertexNormals()

  // Create a default material if none provided
  const meshMaterial =
    material ||
    new MeshStandardMaterial({
      color: 0x3399ff,
      roughness: 0.5,
      metalness: 0.2
    })

  // Create and return the mesh
  return new Mesh(geometry, meshMaterial)
}

/**
 * Creates a Three.js mesh from multiple grid cells
 * @deprecated Use createGridMesh instead for better performance
 */
export function createMultiCellMesh(grids: GridCell[], isolevel: number, material?: MeshStandardMaterial): Mesh {
  // If no grids, return an empty mesh
  if (grids.length === 0) {
    return new Mesh(new BufferGeometry(), material || new MeshStandardMaterial())
  }

  // Process all grid cells
  const buffers: MarchingCubesBuffers[] = grids.map((grid) => polygonise(grid, isolevel))

  // Combine all buffer attributes
  const combinedGeometry = new BufferGeometry()

  // Count total vertices and indices
  const totalVertices = buffers.reduce((sum, buffer) => sum + buffer.positions.count, 0)
  const totalIndices = buffers.reduce((sum, buffer) => sum + buffer.indices.count, 0)

  // Create combined arrays
  const combinedPositions = new Float32Array(totalVertices * 3)
  const combinedIndices = totalIndices > 65535 ? new Uint32Array(totalIndices) : new Uint16Array(totalIndices)

  // Copy data and adjust indices
  let vertexOffset = 0
  let indexOffset = 0

  for (const buffer of buffers) {
    // Copy positions
    const posArray = buffer.positions.array as Float32Array
    combinedPositions.set(posArray, vertexOffset * 3)

    // Copy and adjust indices
    const indexArray = buffer.indices.array as Uint16Array | Uint32Array
    for (let i = 0; i < indexArray.length; i++) {
      combinedIndices[indexOffset + i] = indexArray[i] + vertexOffset
    }

    // Update offsets
    vertexOffset += buffer.positions.count
    indexOffset += buffer.indices.count
  }

  // Set attributes
  combinedGeometry.setAttribute('position', new Float32BufferAttribute(combinedPositions, 3))
  combinedGeometry.setIndex(new BufferAttribute(combinedIndices, 1))

  // Compute vertex normals
  combinedGeometry.computeVertexNormals()

  // Create a default material if none provided
  const meshMaterial =
    material ||
    new MeshStandardMaterial({
      color: 0x3399ff,
      roughness: 0.5,
      metalness: 0.2
    })

  // Create and return the mesh
  return new Mesh(combinedGeometry, meshMaterial)
}

/**
 * Creates a Three.js mesh from a grid of scalar values using marching cubes.
 * This is more efficient than processing each cell individually.
 *
 * @param grid The grid data containing scalar values and grid information
 * @param isolevel The isolevel value that determines the surface
 * @param material Optional material to use for the mesh
 * @returns A Three.js mesh representing the isosurface
 */
export function createGridMesh(grid: GridData, isolevel: number, material?: MeshStandardMaterial): Mesh {
  // Get buffer attributes from marching cubes algorithm
  const { positions, indices } = polygoniseGrid(grid, isolevel)

  // Create a new buffer geometry
  const geometry = new BufferGeometry()

  // Set the attributes
  geometry.setAttribute('position', positions)
  geometry.setIndex(indices)

  // Compute vertex normals
  geometry.computeVertexNormals()

  // Create a default material if none provided
  const meshMaterial =
    material ||
    new MeshStandardMaterial({
      color: 0x3399ff,
      roughness: 0.5,
      metalness: 0.2
    })

  // Create and return the mesh
  return new Mesh(geometry, meshMaterial)
}

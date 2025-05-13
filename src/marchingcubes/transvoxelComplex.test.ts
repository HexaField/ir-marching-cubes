import { BufferGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { createChunkGrid } from '../chunk/ChunkGrid'
import { simplifyGrid } from './transvoxelChunking.test'
import { generateTransvoxelMesh } from './transvoxelImplementation'
import { GridData } from './triangulation'

describe('Transvoxel Complex Real-World Scenarios', () => {
  // Helper function to create a complex terrain grid with mountains, valleys, and caves
  function createComplexTerrainGrid(size: number): GridData {
    const values: number[][][] = []
    const center = size / 2

    for (let x = 0; x < size; x++) {
      values[x] = []
      for (let y = 0; y < size; y++) {
        values[x][y] = []
        for (let z = 0; z < size; z++) {
          // Base terrain with mountains and valleys
          const mountainHeight =
            Math.sin(x * 0.2) * Math.cos(y * 0.2) * 10.0 + Math.sin(x * 0.1 + 1.5) * Math.cos(y * 0.1 + 0.5) * 5.0

          // Add some caves (spherical holes)
          const cave1 =
            Math.sqrt(Math.pow(x - center * 0.7, 2) + Math.pow(y - center * 0.7, 2) + Math.pow(z - center * 0.7, 2)) -
            5.0

          const cave2 =
            Math.sqrt(Math.pow(x - center * 1.3, 2) + Math.pow(y - center * 1.3, 2) + Math.pow(z - center * 0.5, 2)) -
            4.0

          // Combine terrain and caves (using smooth min function)
          const k = 2.0 // Smoothing factor
          const terrainValue = z - (center * 0.5 + mountainHeight)
          const caveValue = Math.min(cave1, cave2)

          // Smooth min function
          const h = Math.max(k - Math.abs(terrainValue - caveValue), 0.0) / k
          const smoothMin = Math.min(terrainValue, caveValue) - h * h * k * 0.25

          values[x][y][z] = smoothMin
        }
      }
    }

    return {
      values,
      origin: { x: 0, y: 0, z: 0 },
      cellSize: { x: 1, y: 1, z: 1 }
    }
  }

  // Helper function to check mesh quality
  function checkMeshQuality(geometry: BufferGeometry): {
    vertexCount: number
    triangleCount: number
    nonManifoldEdges: number
  } {
    const positions = geometry.attributes.position.array
    const indices = geometry.index?.array || []

    const vertexCount = positions.length / 3
    const triangleCount = indices.length / 3

    // Count non-manifold edges (edges shared by more than 2 triangles)
    // This is a simple heuristic for mesh quality
    const edges = new Map<string, number>()

    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i]
      const b = indices[i + 1]
      const c = indices[i + 2]

      // Add each edge to the map
      const addEdge = (v1: number, v2: number) => {
        const key = v1 < v2 ? `${v1}-${v2}` : `${v2}-${v1}`
        edges.set(key, (edges.get(key) || 0) + 1)
      }

      addEdge(a, b)
      addEdge(b, c)
      addEdge(c, a)
    }

    // Count edges that appear more than twice (non-manifold)
    let nonManifoldEdges = 0
    for (const count of edges.values()) {
      if (count > 2) {
        nonManifoldEdges++
      }
    }

    return { vertexCount, triangleCount, nonManifoldEdges }
  }

  describe('Complex Terrain Tests', () => {
    it('should generate high-quality meshes for complex terrain', () => {
      // Create a complex terrain grid
      const grid = createComplexTerrainGrid(33)

      // Generate a mesh with no simplification
      const highResMesh = generateTransvoxelMesh(grid, 0, 0)

      // Verify that the mesh was generated
      expect(highResMesh.positions.count).toBeGreaterThan(0)
      expect(highResMesh.indices.count).toBeGreaterThan(0)

      // Create a Three.js geometry for quality checking
      const geometry = new BufferGeometry()
      geometry.setAttribute('position', highResMesh.positions)
      geometry.setIndex(highResMesh.indices)

      // Check mesh quality
      const quality = checkMeshQuality(geometry)

      // Log quality metrics
      console.log(`High-res mesh quality:`)
      console.log(`- Vertices: ${quality.vertexCount}`)
      console.log(`- Triangles: ${quality.triangleCount}`)
      console.log(`- Non-manifold edges: ${quality.nonManifoldEdges}`)

      // Verify that the mesh has acceptable quality
      expect(quality.nonManifoldEdges).toBeLessThan(quality.triangleCount * 0.01) // Less than 1% non-manifold edges
    })

    it('should maintain mesh quality across different LOD levels', () => {
      // Create a complex terrain grid
      const grid = createComplexTerrainGrid(33)

      // Generate meshes with different LOD levels
      const lod0Mesh = generateTransvoxelMesh(grid, 0, 0) // No simplification

      // Simplify the grid for LOD 1
      const simplifiedGrid1 = simplifyGrid(grid, 2)
      const lod1Mesh = generateTransvoxelMesh(simplifiedGrid1, 0, 1)

      // Simplify the grid for LOD 2
      const simplifiedGrid2 = simplifyGrid(grid, 4)
      const lod2Mesh = generateTransvoxelMesh(simplifiedGrid2, 0, 2)

      // Create Three.js geometries for quality checking
      const createGeometry = (mesh: any) => {
        const geometry = new BufferGeometry()
        geometry.setAttribute('position', mesh.positions)
        geometry.setIndex(mesh.indices)
        return geometry
      }

      const geometry0 = createGeometry(lod0Mesh)
      const geometry1 = createGeometry(lod1Mesh)
      const geometry2 = createGeometry(lod2Mesh)

      // Check mesh quality for each LOD level
      const quality0 = checkMeshQuality(geometry0)
      const quality1 = checkMeshQuality(geometry1)
      const quality2 = checkMeshQuality(geometry2)

      // Log quality metrics
      console.log(`LOD 0 mesh quality:`)
      console.log(`- Vertices: ${quality0.vertexCount}`)
      console.log(`- Triangles: ${quality0.triangleCount}`)
      console.log(`- Non-manifold edges: ${quality0.nonManifoldEdges}`)

      console.log(`LOD 1 mesh quality:`)
      console.log(`- Vertices: ${quality1.vertexCount}`)
      console.log(`- Triangles: ${quality1.triangleCount}`)
      console.log(`- Non-manifold edges: ${quality1.nonManifoldEdges}`)

      console.log(`LOD 2 mesh quality:`)
      console.log(`- Vertices: ${quality2.vertexCount}`)
      console.log(`- Triangles: ${quality2.triangleCount}`)
      console.log(`- Non-manifold edges: ${quality2.nonManifoldEdges}`)

      // Verify that mesh quality is maintained across LOD levels
      // Higher LOD levels should have fewer vertices and triangles
      expect(quality0.vertexCount).toBeGreaterThan(quality1.vertexCount)
      expect(quality1.vertexCount).toBeGreaterThan(quality2.vertexCount)

      // Non-manifold edges should remain a small percentage of triangles
      expect(quality0.nonManifoldEdges).toBeLessThan(quality0.triangleCount * 0.01)
      expect(quality1.nonManifoldEdges).toBeLessThan(quality1.triangleCount * 0.01)
      expect(quality2.nonManifoldEdges).toBeLessThan(quality2.triangleCount * 0.01)
    })
  })

  describe('Multi-Chunk LOD Tests', () => {
    it('should handle a grid of chunks with varying LOD levels', () => {
      // Create a chunk grid with a larger size for testing
      const chunkGrid = createChunkGrid({
        gridSize: [3, 3, 3],
        chunkSize: 1,
        chunkResolution: 16,
        seed: 12345,
        isolevel: 0.0
      })

      // Generate geometries for chunks with different LOD levels
      // Center chunk at high resolution, surrounding chunks at lower resolution
      const geometries: BufferGeometry[] = []

      for (let x = 0; x < 3; x++) {
        for (let y = 0; y < 3; y++) {
          for (let z = 0; z < 3; z++) {
            // Calculate distance from center
            const dx = x - 1
            const dy = y - 1
            const dz = z - 1
            const distanceFromCenter = Math.sqrt(dx * dx + dy * dy + dz * dz)

            // Determine LOD level based on distance from center
            let lodLevel = 1
            if (distanceFromCenter < 0.1) {
              lodLevel = 1 // Center chunk at highest resolution
            } else if (distanceFromCenter < 1.5) {
              lodLevel = 2 // Adjacent chunks at medium resolution
            } else {
              lodLevel = 4 // Corner chunks at lowest resolution
            }

            // Generate geometry for this chunk
            const geometry = chunkGrid.generateGeometry(x, y, z, lodLevel)
            if (geometry) {
              geometries.push(geometry)
            }
          }
        }
      }

      // Verify that geometries were generated for all chunks
      expect(geometries.length).toBe(27) // 3x3x3 grid

      // Check quality of each geometry
      let totalVertices = 0
      let totalTriangles = 0
      let totalNonManifoldEdges = 0

      for (const geometry of geometries) {
        const quality = checkMeshQuality(geometry)
        totalVertices += quality.vertexCount
        totalTriangles += quality.triangleCount
        totalNonManifoldEdges += quality.nonManifoldEdges
      }

      // Log overall quality metrics
      console.log(`Multi-chunk mesh quality:`)
      console.log(`- Total vertices: ${totalVertices}`)
      console.log(`- Total triangles: ${totalTriangles}`)
      console.log(`- Total non-manifold edges: ${totalNonManifoldEdges}`)

      // Verify that the overall mesh has acceptable quality
      expect(totalNonManifoldEdges).toBeLessThan(totalTriangles * 0.01) // Less than 1% non-manifold edges
    })
  })
})

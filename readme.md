# marching-cubes

This project implements marching cubes for iR Engine.

## References

https://paulbourke.net/geometry/polygonise/

## Basic Information

- Uses a 3D grid of sample points (voxels)
- Each cube has 8 vertices at its corners
- Each vertex has a scalar value (typically representing density)
- Algorithm processes one cube at a time
- 256 possible configurations (2^8) reduced to 15 unique cases with symmetry
- Each cube requires 256 bits of data
- Each chunk is 16x16x16 cubes
- Each chunk is 256x256x256 bits
- Each chunk is 32KB
- 32 chunks is 1MB
- 32,768 chunks is 1GB

## Data Storage

- Each vertex stores a scalar value (typically density or distance field value)
- Vertices are shared between adjacent cubes to optimize memory usage
- For a grid of size n×n×n, we need (n+1)³ scalar values
- Isosurface is determined by a threshold value that separates "inside" from "outside"
- Edge intersections are calculated using linear interpolation between vertex values
- Triangulation patterns are pre-computed for all 256 possible configurations
- Normal vectors can be calculated from the gradient of the scalar field

## Architecture

- Stores objects in cube chunks, such that terrain can be generated infinitely in any direction

## Progress

- [ ] Marching cubes triangulation function
- [ ] Create an ECS component that takes a cube dataset, triangulates it and creates a mesh
- [ ] Add uv data for each point for texturing
- [ ] Higher level LOD triangulation generation
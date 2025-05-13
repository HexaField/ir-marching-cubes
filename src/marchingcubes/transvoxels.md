Let's say you have an area of very dense voxel samples near your player's camera, and some distance away you want to drop down to half the resolution, and further out to a quarter res:

(Visualized here in 2D for simplicity)

Diagram of voxel data at progressively decreasing resolution, with Transvoxel "adapters" inserted where cells border two different-resolution grids

Within the body of each of these regions you have a regular grid of potential samples you can turn into a mesh with the conventional marching cubes algorithm - no problem. (Cells in blue above)

But where these grids of different resolutions butt up against one another, you have these weird voxel cells that have more samples along one face than the others. (Cells in green above)

If we ignore these mid-edge/mid-face samples and just build our mesh for the cell using the samples at the corners as usual, then we risk mis-matching the adjacent mesh formed from the higher resolution sample grid, which does include this information.

So instead, we use the lookup table provided by Transvoxel to select and fit the correct adapter mesh into these border cells, taking into account dense samples on one side, and sparse samples at the other corners.

Its operation is very similar to marching cubes, it just considers a different arrangement of sample points and so has a different collection of mesh templates it uses to bridge them.
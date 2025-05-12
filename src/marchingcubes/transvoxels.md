12

The transvoxel paper is a fairly in-depth work, discussing a variety of topics on how to create an entire voxel terrain system, including an overview of marching cubes, how to fix the ambiguity problem, vertex sharing, triplanar texturing, and texture splatting. The area you are interested in is covered in chapter 4, Level of Detail.

It introduces 512 new types of marching cubes, which are adapters between a voxel of one level of detail and another with half the level of detail. For example, a 16 unit voxel with a 32 unit voxel.

The new marching cubes can be constructed using the lookup tables provided on the transvoxel's homepage. The lookup tables are structured differently than the one used by the original marching cubes. I will walk through the first shape as an example, and it should be pretty easy to figure out the rest.

The values in transitionCellClass define which of the 56 equivalence classes the shape belongs to. (With the high bit set to indicate that the triangles should be winded in reverse) The value at index 1 is 0x01, telling us that its equivalence class is 1.

The transitionCellData array is information about the equivalence classes, containing the vertex count, triangle count, and the order of the vertexes. If we look up the value at index 1 (which we got from transitionCellClass) we see the following:

{0x42, {0, 1, 3, 1, 2, 3}}

0x42 in binary is 0100 0010, which means there are 4 vertices, and 2 triangles. And the rest that the ordering of the vertices for triangle 1 is 0, 1, 3; and the ordering for triangle 2 is 1, 2, 3.

What remains to be calculated is the actual edges these vertices and triangles are on. This is contained in the transitionVertexData array. Looking up index 1 (this is the shape number not the equivalence class) we see the following:

{0x2301, 0x1503, 0x199B, 0x289A}

These numbers define the vertex reuse in the high nibble and the vertex edges in the low. In binary (which makes the structure more apparent) it looks like this:

0010 0011 0000 0001, 0001 0101 0000 0011, 0001 1001 1001 1011, 0010 1000 1001 1010

Throwing away the information we aren't interested in at the moment, we are left with:

0000 0001, 0000 0011, 1001 1011, 1001 1010

or:

0, 1, 0, 3, 9, B, 9, A

In other words vertex 0 is between corner 0 and 1; vertex 1 between 0 and 3; vertex 2 between 9 and B, and vertex 3 between 9 and A.

In marching cubes there were 12 edges between 8 corners, and in transvoxels there are 16 edges between 13 corners. 9 facing the higher detail and 4 the lower.

enter image description here

You could if you wanted, assign each edge a number like in the original, as follows:

0 -> 1 = 0

0 -> 3 = 2

9 -> A = 12

9 -> B = 13

It would then be pretty trivial using these edge numbers to combine the data and put them into a single table like the original marching cubes. The first shape would look like the following:

{0, 2, 12, 2, 13, 12, 0}

Using this new table, you can build it the exact same way as you did in the original.

Now that you have these 512 shapes, what do you do with them? Wherever the level of detail changes, you have to insert transition cubes between (previous answer has an excellent picture of this) For each side of the cube that faces a higher level of detail, you place a transition cell.

enter image description here

Each transition cell is constructed by taking the sign values of the 9 corners of the side facing the high detail voxels, and creating a lookup value the same way you did with the original marching cubes, and creating the shape using the lookup tables, as I explained. The transition cells should be a percentage of the cube, like .25 or .125. And of course it has to be reoriented to face to appropriate side. Both of these transformations can be done when converting the edges to world coordinates.

After you add each of the transition cells, you can then place a regular marching cube scrunched up right in the center of the transition cells, using the standard eight corner lookup.
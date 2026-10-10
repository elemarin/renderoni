/**
 * renderoni/terrain: large, streamed heightfield terrain.
 *
 * - `TiledHeightfield`: a lazily tiled, LRU-evicted cache over an expensive analytic height
 *   function with bilinear `heightAt`, `slopeAt` and `prewarm`. Deterministic: tiles are a pure
 *   function of the sampler, so an evicted tile rebuilds identically.
 * - `TerrainMesh`: chunked, distance-LOD three.js mesh with skirts, a per-update build budget,
 *   unloading and ray picking. Presentation only; any material and per-vertex attributes.
 * - `TileCache`, `Buckets`: the underlying sample-tile cache and a uniform-grid spatial hash.
 */
export { TileCache, Buckets, type Tile, type TileFill } from './tiles.js';
export { TiledHeightfield, type HeightSource, type TiledHeightfieldOptions, type TiledHeightfieldStats } from './heightfield.js';
export {
  TerrainMesh,
  type TerrainMeshOptions,
  type TerrainShading,
  type TerrainAttribute,
  type TerrainChunkInfo,
  type TerrainVertex,
  type TerrainChunk,
  type TerrainRaymarchOptions,
} from './mesh.js';

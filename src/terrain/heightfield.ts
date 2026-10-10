import { TileCache, type Tile } from './tiles.js';

/** Anything a terrain mesh can be built from: a square world centred on the origin. */
export interface HeightSource {
  /** World side length; the surface spans [-size/2, size/2] on x and z. */
  readonly size: number;
  heightAt(x: number, z: number): number;
}

export interface TiledHeightfieldOptions {
  /** World side length; the surface spans [-size/2, size/2] on x and z. */
  size: number;
  /**
   * The expensive analytic height. Must be a pure function of (x, z) so an evicted tile
   * rebuilds identically. Omit it when subclassing and overriding `analytic` instead.
   */
  sample?: (x: number, z: number) => number;
  /** Distance between cached samples (metres). Default 9.4. */
  step?: number;
  /** Lattice cells per tile side. Default 64 (≈ 600 m at the default step). */
  tileSamples?: number;
  /** Maximum resident tiles before the oldest quarter is evicted. Default 512 (≈ 8.5 MB per channel). */
  cacheTiles?: number;
  /**
   * Channels cached per sample, height included. Default 1. Channels 1.. are written by
   * `extra` (or an overridden `sampleExtra`) and read back bilinearly with `channel()`.
   */
  channels?: number;
  /** Writes channels 1..channels-1 for world (x, z) into `out[offset]`, `out[offset + 1]`, ... */
  extra?: (x: number, z: number, out: Float32Array, offset: number) => void;
  /** Half-width of the finite-difference stencil in `slopeAt` (metres). Default 2. */
  slopeDelta?: number;
}

export interface TiledHeightfieldStats {
  /** Resident height tiles. */
  tiles: number;
  /** Tile fills so far (a refill after eviction counts again). */
  builds: number;
  /** Resident tile cap. */
  cap: number;
}

/**
 * A tiled cache of an expensive analytic height function.
 *
 * Nothing is precomputed for the whole world: heights live in lazily filled, LRU-evicted
 * tiles (see `TileCache`), so construction is O(1) and memory stays flat at any world size.
 * `heightAt` is a bilinear lookup and allocation-free; consecutive lookups in the same tile
 * skip the hash map entirely.
 *
 * Supply the analytic function as `sample`, or subclass and override `analytic`. Tiles fill
 * on first use, never in the constructor, so a subclass may read its own fields in `analytic`.
 * Methods here that need the cached surface (`slopeAt`, `prewarm`) read the tiles directly,
 * so a subclass may override `heightAt` (for example to add a detail term) without changing them.
 */
export class TiledHeightfield implements HeightSource {
  readonly size: number;
  readonly step: number;
  readonly channels: number;
  protected readonly tiles: TileCache;
  private readonly sampleFn: ((x: number, z: number) => number) | undefined;
  private readonly extraFn: ((x: number, z: number, out: Float32Array, offset: number) => void) | undefined;
  private readonly slopeDelta: number;

  constructor(options: TiledHeightfieldOptions) {
    this.size = options.size;
    this.step = options.step ?? 9.4;
    this.channels = Math.max(1, options.channels ?? 1);
    this.sampleFn = options.sample;
    this.extraFn = options.extra;
    this.slopeDelta = options.slopeDelta ?? 2;
    this.tiles = new TileCache(options.tileSamples ?? 64, this.step, this.channels, options.cacheTiles ?? 512, this.size / 2, (t, x0, z0) => this.fillTile(t, x0, z0));
  }

  /** The uncached analytic height. Override in a subclass, or pass `sample` to the constructor. */
  analytic(x: number, z: number): number {
    if (!this.sampleFn) throw new Error('TiledHeightfield: pass `sample` or override `analytic`');
    return this.sampleFn(x, z);
  }

  /** Writes channels 1..channels-1 at (x, z). Override in a subclass, or pass `extra`. */
  protected sampleExtra(x: number, z: number, out: Float32Array, offset: number): void {
    this.extraFn?.(x, z, out, offset);
  }

  private fillTile(t: Tile, x0: number, z0: number) {
    const W = this.tiles.W, step = this.step, s = this.channels, d = t.data;
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
      const x = x0 + i * step, z = z0 + j * step, k = (j * W + i) * s;
      d[k] = this.analytic(x, z);
      if (s > 1) this.sampleExtra(x, z, d, k + 1);
    }
  }

  /** Bilinearly interpolated cached height. */
  heightAt(x: number, z: number): number { return this.tiles.sample(0, x, z); }

  /** Bilinearly interpolated cached channel `ch` (0 is height). */
  channel(ch: number, x: number, z: number): number { return this.tiles.sample(ch, x, z); }

  /**
   * Ground slope (rise per metre). Central differences over the cached surface; `coarse`
   * instead takes forward differences of the analytic surface (three samples, no tile touched),
   * for far-from-camera work that must not churn the cache.
   */
  slopeAt(x: number, z: number, coarse = false): number {
    const d = this.slopeDelta;
    if (coarse) {
      const h0 = this.analytic(x, z);
      return Math.hypot(this.analytic(x + d, z) - h0, this.analytic(x, z + d) - h0) / d;
    }
    const T = this.tiles;
    const dx = T.sample(0, x + d, z) - T.sample(0, x - d, z);
    const dz = T.sample(0, x, z + d) - T.sample(0, x, z - d);
    return Math.hypot(dx, dz) / (2 * d);
  }

  /** Build every tile overlapping the square of half-width `r` around (x, z), e.g. before the first frame. */
  prewarm(x: number, z: number, r: number): void {
    const T = this.tiles, span = T.T * this.step, half = this.size / 2;
    const i0 = Math.floor((x - r + half) / span), i1 = Math.floor((x + r + half) / span);
    const j0 = Math.floor((z - r + half) / span), j1 = Math.floor((z + r + half) / span);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) T.tile(i, j);
  }

  /** Resident tile counts (diagnostics). */
  get stats(): TiledHeightfieldStats { return { tiles: this.tiles.resident, builds: this.tiles.builds, cap: this.tiles.cap }; }

  /** Drop every cached tile (e.g. after the analytic function's inputs change). */
  clear(): void { this.tiles.clear(); }
}

/**
 * Lazily filled, LRU-evicted sample tiles over an unbounded 2-D lattice.
 *
 * A tile holds (T + 1) × (T + 1) samples with `stride` channels each, so a bilinear lookup
 * always finds all four corners in one tile. Tiles are filled on first touch by `fill` and
 * dropped (oldest first) once more than `cap` are resident, which keeps memory flat however
 * large the world is. Filling must be a pure function of the tile coordinates so an evicted
 * tile rebuilds identically (determinism across runs and clients).
 *
 * The lattice origin is `-half` on both axes, so a world centred on the origin with side
 * `2 * half` starts at tile (0, 0). Tile indices must stay within ±32768.
 */
export interface Tile {
  ti: number;
  tj: number;
  /** `W * W * stride` samples, row-major by z then x; zero-filled before `fill` runs. */
  data: Float32Array;
  use: number;
}

/** Fills a fresh tile whose first sample sits at world (x0, z0). */
export type TileFill = (tile: Tile, x0: number, z0: number) => void;

const tileKey = (ti: number, tj: number) => (ti + 32768) * 65536 + (tj + 32768);

export class TileCache {
  private tiles = new Map<number, Tile>();
  private tick = 0;
  private last: Tile | null = null;
  /** Samples per tile side (T + 1). */
  readonly W: number;
  /** Number of tile fills so far (diagnostics). */
  builds = 0;

  /**
   * @param T      lattice cells per tile side
   * @param step   world distance between samples
   * @param stride channels per sample
   * @param cap    maximum resident tiles before the oldest quarter is evicted
   * @param half   world offset of the lattice origin (samples start at -half)
   * @param fill   pure function of the tile coordinates that writes `tile.data`
   */
  constructor(
    readonly T: number,
    readonly step: number,
    readonly stride: number,
    readonly cap: number,
    readonly half: number,
    private fill: TileFill,
  ) {
    this.W = T + 1;
  }

  /** The tile at tile coordinates (ti, tj), filling it on first touch. */
  tile(ti: number, tj: number): Tile {
    const last = this.last;
    if (last && last.ti === ti && last.tj === tj) { last.use = ++this.tick; return last; }
    const key = tileKey(ti, tj);
    let t = this.tiles.get(key);
    if (!t) {
      if (this.tiles.size >= this.cap) this.evict();
      t = { ti, tj, data: new Float32Array(this.W * this.W * this.stride), use: 0 };
      this.fill(t, -this.half + ti * this.T * this.step, -this.half + tj * this.T * this.step);
      this.builds++;
      this.tiles.set(key, t);
    }
    t.use = ++this.tick; this.last = t;
    return t;
  }

  /** Bilinear sample of channel `ch` at world (x, z). */
  sample(ch: number, x: number, z: number): number {
    const fx = (x + this.half) / this.step, fz = (z + this.half) / this.step;
    const gi = Math.floor(fx), gj = Math.floor(fz);
    const tx = fx - gi, tz = fz - gj;
    const T = this.T, ti = Math.floor(gi / T), tj = Math.floor(gj / T);
    const t = this.tile(ti, tj), d = t.data, W = this.W, s = this.stride;
    const k = ((gj - tj * T) * W + (gi - ti * T)) * s + ch;
    const a = d[k], b = d[k + s], c = d[k + W * s], e = d[k + W * s + s];
    return (a + (b - a) * tx) + ((c + (e - c) * tx) - (a + (b - a) * tx)) * tz;
  }

  /** Whether tile (ti, tj) is resident (does not fill or touch it). */
  has(ti: number, tj: number): boolean { return this.tiles.has(tileKey(ti, tj)); }

  /** Drop the oldest quarter of resident tiles. */
  private evict() {
    const arr = [...this.tiles.entries()].sort((a, b) => a[1].use - b[1].use);
    const n = Math.max(1, arr.length >> 2);
    for (let i = 0; i < n; i++) this.tiles.delete(arr[i][0]);
    if (this.last && !this.tiles.has(tileKey(this.last.ti, this.last.tj))) this.last = null;
  }

  get resident(): number { return this.tiles.size; }
  clear(): void { this.tiles.clear(); this.last = null; }
}

/**
 * Uniform-grid spatial hash for things with a bounding box (settlements, road segments).
 * Items are inserted into every cell their box overlaps; a query returns the items of the
 * one cell containing the point (the caller does the exact test). Cell indices must stay
 * within ±4096.
 */
export class Buckets<T> {
  private map = new Map<number, T[]>();
  constructor(readonly cell: number) {}
  private key(bi: number, bj: number) { return (bi + 4096) * 8192 + (bj + 4096); }
  insert(minX: number, minZ: number, maxX: number, maxZ: number, item: T): void {
    const i0 = Math.floor(minX / this.cell), i1 = Math.floor(maxX / this.cell), j0 = Math.floor(minZ / this.cell), j1 = Math.floor(maxZ / this.cell);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = this.key(i, j); let l = this.map.get(k); if (!l) { l = []; this.map.set(k, l); } l.push(item);
    }
  }
  /** Items whose box overlaps the cell containing (x, z); `undefined` when the cell is empty. */
  query(x: number, z: number): T[] | undefined { return this.map.get(this.key(Math.floor(x / this.cell), Math.floor(z / this.cell))); }
  /** Number of non-empty cells. */
  get cells(): number { return this.map.size; }
  clear(): void { this.map.clear(); }
}

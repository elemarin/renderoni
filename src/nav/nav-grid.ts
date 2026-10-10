/**
 * Renderoni Nav Grid
 *
 * Tiled, lazily sampled grid navigation for large worlds. The world is a square of side
 * `field.size` metres centred on the origin, divided into square cells. Cell costs live in
 * tiles (tileSize × tileSize cells) that are built on first touch, so nothing world-sized is
 * ever allocated: each cell asks the game's cost field once (NaN marks "not sampled yet"),
 * respects any rectangular blockers that overlap it, and the least recently used tiles are
 * evicted when too many are resident. Blockers are kept outside the tiles, so a rebuilt tile
 * is identical to the evicted one.
 *
 * A* runs inside a bounded window around the start and goal with persistent,
 * generation-stamped scratch (no per-search allocation beyond the returned waypoints).
 * Requests longer than the window, or that exhaust `maxNodes`, return the best partial path
 * with `lastPathComplete = false`. A per-step `budget` bounds how many searches run; callers
 * refused for lack of budget (`refused = true`) retry on a later step.
 *
 * Deterministic: results are a pure function of the cost field, the blockers and the query.
 */
import { Vector2 } from 'three';

/** The game's cost rules. Sampled at cell centres, once per cell while its tile is resident. */
export interface NavCostField {
  /** World side length in metres; the world spans [-size/2, size/2) on x and z. */
  readonly size: number;
  /** Traversal multiplier at a cell centre: 0 (or NaN / negative) = blocked, 1 = normal, >1 slow, <1 fast. */
  cellCost(x: number, z: number): number;
  /**
   * Cheap far-field check used by `walkable(x, z, true)` and `nearestWalkable(x, z, true)`;
   * should not touch expensive data. Defaults to `walkableFast`.
   */
  coarseWalkable?(x: number, z: number): boolean;
  /**
   * Terrain-only passability at a cell centre (no blockers). Used by `terrainPassable` and
   * `walkableFast` for cells whose tile is not resident. Defaults to `cellCost(x, z) > 0`;
   * supply it when it is cheaper than the full cost (e.g. skips road lookups).
   */
  passable?(x: number, z: number): boolean;
}

export interface NavGridOptions {
  /** Metres per cell. Default 6. */
  cell?: number;
  /** Cells per tile side; a power of two. Default 64. */
  tileSize?: number;
  /** Maximum resident tiles before LRU eviction (at least 4). Default 512. */
  tileCap?: number;
  /** A* search window side in cells. Default 256. */
  window?: number;
  /** Initial per-step search budget. Default 8. */
  budget?: number;
  /** `lineClear` rejects cells costlier than this. Default 2. */
  easyCost?: number;
  /** Metres of slack around thick blockers (thin ones get half a cell). Default 1. */
  blockerSlack?: number;
  /** `nearestWalkable` ring search radius in cells. Default 12. */
  nearestRadius?: number;
}

export interface NavPoint {
  x: number;
  z: number;
}

export interface NavCell {
  i: number;
  j: number;
}

interface NavTile {
  ti: number;
  tj: number;
  cost: Float32Array;
  base: Float32Array;
  use: number;
}

interface Blocker {
  cells: Int32Array;
  tiles: number[];
}

/** Unit directions for the coarse nearestWalkable probe. */
const PROBE_DIRS: ReadonlyArray<readonly [number, number]> = Array.from({ length: 8 }, (_, k) => {
  const a = (k / 8) * Math.PI * 2;
  return [Math.cos(a), Math.sin(a)] as const;
});

export class NavGrid {
  /** Metres per cell. */
  readonly cell: number;
  /** Cells per world side. */
  readonly n: number;
  /** World side length in metres. */
  readonly size: number;
  /** A* searches allowed in the current step; reset it each step. Refused callers retry later. */
  budget: number;
  /** True when the last findPath was refused for lack of budget. */
  refused = false;
  /** Blocker generation; bumps on every add/remove so cached routes can invalidate. */
  revision = 0;
  /** True when the last findPath reached its goal (false for partial paths). */
  lastPathComplete = false;
  /** Nodes expanded by the last findPath (diagnostics). */
  lastExpanded = 0;
  /** Tile builds so far (diagnostics). */
  builds = 0;

  private readonly field: NavCostField;
  private readonly half: number;
  private readonly tn: number;
  private readonly shift: number;
  private readonly mask: number;
  private readonly tileCap: number;
  private readonly win: number;
  private readonly margin: number;
  private readonly easyCost: number;
  private readonly slack: number;
  private readonly nearestRadius: number;

  private tiles = new Map<number, NavTile>();
  private pool: NavTile[] = [];
  private useTick = 0;
  private last: NavTile | null = null;
  private tileBlockers = new Map<number, Set<string>>();
  private blockers = new Map<string, Blocker>();

  // Windowed A* scratch, indexed by window-local cell; `sstamp`/`sclosed` hold the generation
  // that last wrote an entry, so nothing is cleared between searches.
  private sg: Float32Array;
  private sparent: Int32Array;
  private sstamp: Uint32Array;
  private sclosed: Uint32Array;
  private gen = 0;
  private heap = new NavHeap();
  private trail = new Int32Array(256);

  constructor(field: NavCostField, options: NavGridOptions = {}) {
    const tn = options.tileSize ?? 64;
    if (!Number.isInteger(tn) || tn < 1 || (tn & (tn - 1)) !== 0) {
      throw new Error(`NavGrid tileSize must be a power of two, got ${tn}`);
    }
    this.field = field;
    this.size = field.size;
    this.half = field.size / 2;
    this.cell = options.cell ?? 6;
    this.n = Math.ceil(this.size / this.cell);
    this.tn = tn;
    this.shift = Math.log2(tn);
    this.mask = tn - 1;
    this.tileCap = Math.max(4, options.tileCap ?? 512);
    this.win = options.window ?? 256;
    this.margin = this.win >> 3;
    this.budget = options.budget ?? 8;
    this.easyCost = options.easyCost ?? 2;
    this.slack = options.blockerSlack ?? 1;
    this.nearestRadius = options.nearestRadius ?? 12;
    const area = this.win * this.win;
    this.sg = new Float32Array(area);
    this.sparent = new Int32Array(area);
    this.sstamp = new Uint32Array(area);
    this.sclosed = new Uint32Array(area);
  }

  // ---- tiles ----

  private tileKey(ti: number, tj: number): number {
    return ti * 65536 + tj;
  }

  private tile(ti: number, tj: number): NavTile {
    const last = this.last;
    if (last && last.ti === ti && last.tj === tj) return last;
    const key = this.tileKey(ti, tj);
    let t = this.tiles.get(key);
    if (!t) {
      if (this.tiles.size >= this.tileCap) this.evict();
      t = this.buildTile(ti, tj);
      this.tiles.set(key, t);
    }
    t.use = ++this.useTick;
    this.last = t;
    return t;
  }

  private buildTile(ti: number, tj: number): NavTile {
    const tn = this.tn, n = this.n, shift = this.shift;
    const t = this.pool.pop() ?? { ti, tj, cost: new Float32Array(tn * tn), base: new Float32Array(tn * tn), use: 0 };
    t.ti = ti;
    t.tj = tj;
    t.use = 0;
    // NaN means unsampled; zero is a real obstruction. Cells past the world edge are blocked.
    const base = t.base;
    base.fill(NaN);
    const i0 = ti * tn, j0 = tj * tn;
    if (i0 + tn > n || j0 + tn > n) {
      for (let j = 0; j < tn; j++) for (let i = 0; i < tn; i++) if (i0 + i >= n || j0 + j >= n) base[j * tn + i] = 0;
    }
    const cost = t.cost;
    cost.set(base);
    const ids = this.tileBlockers.get(this.tileKey(ti, tj));
    if (ids) {
      for (const id of ids) {
        const b = this.blockers.get(id);
        if (!b) continue;
        for (const k of b.cells) {
          const i = k % n, j = (k / n) | 0;
          if (i >> shift === ti && j >> shift === tj) cost[this.local(i, j)] = 0;
        }
      }
    }
    this.builds++;
    return t;
  }

  private evict(): void {
    const arr = [...this.tiles.entries()].sort((a, b) => a[1].use - b[1].use);
    for (let i = 0, count = Math.max(1, arr.length >> 2); i < count; i++) {
      this.tiles.delete(arr[i][0]);
      this.pool.push(arr[i][1]);
    }
    if (this.last && this.tiles.get(this.tileKey(this.last.ti, this.last.tj)) !== this.last) this.last = null;
  }

  /** Tile-local index of a global cell. */
  private local(i: number, j: number): number {
    return (j & this.mask) * this.tn + (i & this.mask);
  }

  private tileCost(t: NavTile, i: number, j: number): number {
    const index = this.local(i, j), cached = t.cost[index];
    if (cached === cached) return cached; // not NaN
    let cost = this.field.cellCost(-this.half + (i + 0.5) * this.cell, -this.half + (j + 0.5) * this.cell);
    if (!(cost > 0)) cost = 0;
    // A blocker zeroes `cost` before this is reached. Removing a blocker from an unsampled cell
    // restores its NaN base, so the field is sampled on the next read.
    t.base[index] = cost;
    t.cost[index] = cost;
    return t.cost[index];
  }

  private costIJ(i: number, j: number): number {
    return this.tileCost(this.tile(i >> this.shift, j >> this.shift), i, j);
  }

  private blockedByBlocker(tileKey: number, k: number): boolean {
    const ids = this.tileBlockers.get(tileKey);
    if (ids) for (const id of ids) if (this.blockers.get(id)?.cells.includes(k)) return true;
    return false;
  }

  private terrainAt(x: number, z: number): boolean {
    return this.field.passable ? this.field.passable(x, z) : this.field.cellCost(x, z) > 0;
  }

  /** Resident tile count (diagnostics). */
  get resident(): number {
    return this.tiles.size;
  }

  // ---- cells ----

  private ci(x: number): number {
    return Math.max(0, Math.min(this.n - 1, Math.floor((x + this.half) / this.cell)));
  }

  private cj(z: number): number {
    return Math.max(0, Math.min(this.n - 1, Math.floor((z + this.half) / this.cell)));
  }

  /** Cell containing a world point, clamped to the grid. */
  toCell(x: number, z: number): NavCell {
    return { i: this.ci(x), j: this.cj(z) };
  }

  /** World-space centre of a cell. */
  cellCenter(i: number, j: number): NavPoint {
    return { x: -this.half + (i + 0.5) * this.cell, z: -this.half + (j + 0.5) * this.cell };
  }

  inBounds(x: number, z: number): boolean {
    return Number.isFinite(x) && Number.isFinite(z) && Math.abs(x) < this.half && Math.abs(z) < this.half;
  }

  /** Current cost of a cell (0 = blocked), building its tile if needed. */
  cost(i: number, j: number): number {
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return 0;
    return this.costIJ(i, j);
  }

  // ---- queries ----

  /**
   * Is the cell open? `coarse` answers from `field.coarseWalkable` alone (no blockers, no tile
   * builds): use it for places nobody can see, where exact answers would build tiles world-wide.
   */
  walkable(x: number, z: number, coarse = false): boolean {
    if (!this.inBounds(x, z)) return false;
    if (coarse) return this.field.coarseWalkable ? this.field.coarseWalkable(x, z) : this.walkableFast(x, z);
    return this.costIJ(this.ci(x), this.cj(z)) > 0;
  }

  /** Terrain passability of the containing cell, ignoring blockers. */
  terrainPassable(x: number, z: number): boolean {
    if (!this.inBounds(x, z)) return false;
    const i = this.ci(x), j = this.cj(z);
    return this.terrainAt(-this.half + (i + 0.5) * this.cell, -this.half + (j + 0.5) * this.cell);
  }

  /** Exact single-cell test that never builds a tile; for offscreen sweeps. Agrees with `walkable`. */
  walkableFast(x: number, z: number): boolean {
    if (!this.inBounds(x, z)) return false;
    const i = this.ci(x), j = this.cj(z);
    const key = this.tileKey(i >> this.shift, j >> this.shift), cached = this.tiles.get(key);
    if (cached) return this.tileCost(cached, i, j) > 0;
    if (this.blockedByBlocker(key, j * this.n + i)) return false;
    return this.terrainAt(-this.half + (i + 0.5) * this.cell, -this.half + (j + 0.5) * this.cell);
  }

  /** True when movement between the points crosses no blocked cell (and cuts no blocked corner). */
  segmentWalkable(ax: number, az: number, bx: number, bz: number, fast = false): boolean {
    if (!this.inBounds(ax, az) || !this.inBounds(bx, bz)) return false;
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / (this.cell * 0.25)));
    let pi = this.ci(ax), pj = this.cj(az);
    for (let s = 0; s <= steps; s++) {
      const x = ax + ((bx - ax) * s) / steps, z = az + ((bz - az) * s) / steps;
      if (!(fast ? this.walkableFast(x, z) : this.walkable(x, z))) return false;
      const i = this.ci(x), j = this.cj(z);
      if (i !== pi && j !== pj) {
        const ax2 = -this.half + (i + 0.5) * this.cell, az2 = -this.half + (pj + 0.5) * this.cell;
        const bx2 = -this.half + (pi + 0.5) * this.cell, bz2 = -this.half + (j + 0.5) * this.cell;
        const open = fast
          ? this.walkableFast(ax2, az2) && this.walkableFast(bx2, bz2)
          : this.walkable(ax2, az2) && this.walkable(bx2, bz2);
        if (!open) return false;
      }
      pi = i;
      pj = j;
    }
    return true;
  }

  /** Build every tile within `r` metres of a point up front. */
  prewarm(x: number, z: number, r: number): void {
    const s = this.tn * this.cell;
    for (let zz = z - r; zz <= z + r + s; zz += s) for (let xx = x - r; xx <= x + r + s; xx += s) this.walkable(xx, zz);
  }

  /** Nearest walkable cell centre to a point (the point itself when already walkable). */
  nearestWalkable(x: number, z: number, coarse = false): NavPoint {
    if (coarse) {
      if (this.walkable(x, z, true)) return { x, z };
      for (let r = this.cell * 2; r <= this.cell * 16; r *= 2) {
        for (const [dx, dz] of PROBE_DIRS) {
          const px = x + dx * r, pz = z + dz * r;
          if (this.walkable(px, pz, true)) return { x: px, z: pz };
        }
      }
      return { x, z };
    }
    const i = this.ci(x), j = this.cj(z), n = this.n;
    if (this.costIJ(i, j) > 0) return { x, z };
    for (let r = 1; r < this.nearestRadius; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
          if (this.costIJ(ii, jj) > 0) return this.cellCenter(ii, jj);
        }
      }
    }
    return { x, z };
  }

  /** True when a straight walk between the points crosses only open cells no costlier than `easyCost`. */
  lineClear(x0: number, z0: number, x1: number, z1: number): boolean {
    if (!this.inBounds(x0, z0) || !this.inBounds(x1, z1)) return false;
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / (this.cell * 0.5)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const c = this.costIJ(this.ci(x0 + (x1 - x0) * t), this.cj(z0 + (z1 - z0) * t));
      if (c <= 0 || c > this.easyCost) return false;
    }
    return true;
  }

  // ---- blockers ----

  /**
   * Register a rectangular blocker of footprint `w` × `d` metres centred on (cx, cz), rotated
   * `rotY` radians. Thin blockers (walls) get half a cell of slack so a wall between cell centres
   * still blocks; thick ones (houses) only `blockerSlack`, so their doors stay reachable.
   * Re-adding an existing id replaces it.
   */
  addBlocker(id: string, cx: number, cz: number, w: number, d: number, rotY: number): void {
    if (this.blockers.has(id)) this.removeBlocker(id);
    this.revision++;
    const cells: number[] = [];
    const hw = w / 2, hd = d / 2;
    const cos = Math.cos(rotY), sin = Math.sin(rotY);
    const sx = w < this.cell ? this.cell * 0.5 : this.slack, sz = d < this.cell ? this.cell * 0.5 : this.slack;
    const r = Math.hypot(hw + sx, hd + sz);
    const i0 = this.ci(cx - r), j0 = this.cj(cz - r), i1 = this.ci(cx + r), j1 = this.cj(cz + r);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = -this.half + (i + 0.5) * this.cell, z = -this.half + (j + 0.5) * this.cell;
        const lx = (x - cx) * cos - (z - cz) * sin, lz = (x - cx) * sin + (z - cz) * cos;
        if (Math.abs(lx) <= hw + sx && Math.abs(lz) <= hd + sz) cells.push(j * this.n + i);
      }
    }
    const tiles: number[] = [];
    for (let tj = j0 >> this.shift; tj <= j1 >> this.shift; tj++) {
      for (let ti = i0 >> this.shift; ti <= i1 >> this.shift; ti++) {
        const key = this.tileKey(ti, tj);
        tiles.push(key);
        let set = this.tileBlockers.get(key);
        if (!set) this.tileBlockers.set(key, (set = new Set()));
        set.add(id);
      }
    }
    this.blockers.set(id, { cells: Int32Array.from(cells), tiles });
    for (const k of cells) {
      const i = k % this.n, j = (k / this.n) | 0;
      const t = this.tiles.get(this.tileKey(i >> this.shift, j >> this.shift));
      if (t) t.cost[this.local(i, j)] = 0;
    }
  }

  removeBlocker(id: string): void {
    const b = this.blockers.get(id);
    if (!b) return;
    this.blockers.delete(id);
    this.revision++;
    for (const key of b.tiles) {
      const set = this.tileBlockers.get(key);
      if (set) {
        set.delete(id);
        if (!set.size) this.tileBlockers.delete(key);
      }
    }
    for (const k of b.cells) {
      const i = k % this.n, j = (k / this.n) | 0;
      const key = this.tileKey(i >> this.shift, j >> this.shift), t = this.tiles.get(key);
      if (!t) continue;
      const l = this.local(i, j);
      t.cost[l] = this.blockedByBlocker(key, k) ? 0 : t.base[l];
    }
  }

  hasBlocker(id: string): boolean {
    return this.blockers.has(id);
  }

  // ---- A* ----

  /**
   * A* with 8-connectivity and no corner cutting. Returns string-pulled world-space waypoints
   * (excluding the start; `Vector2.y` is world z), or null when out of bounds, refused, the goal is
   * blocked, or no progress is possible. Check `lastPathComplete` before treating the last
   * waypoint as the goal. `maxNodes` defaults to a budget that grows with distance.
   */
  findPath(sx: number, sz: number, tx: number, tz: number, maxNodes?: number): Vector2[] | null {
    this.refused = false;
    this.lastPathComplete = false;
    this.lastExpanded = 0;
    if (!this.inBounds(sx, sz) || !this.inBounds(tx, tz)) return null;
    if (this.budget <= 0) {
      this.refused = true;
      return null;
    }
    this.budget--;
    // Search budget grows with distance so short hops fail fast when boxed in.
    if (maxNodes === undefined) {
      const dc = Math.hypot(tx - sx, tz - sz) / this.cell;
      maxNodes = Math.max(2500, Math.min(24000, Math.round(dc * dc * 0.6 + dc * 60)));
    }
    const target = this.nearestWalkable(tx, tz);
    tx = target.x;
    tz = target.z;
    if (this.lineClear(sx, sz, tx, tz) && this.segmentWalkable(sx, sz, tx, tz)) {
      this.lastPathComplete = true;
      return [new Vector2(tx, tz)];
    }
    const n = this.n, W = this.win, M = this.margin, shift = this.shift;
    const si = this.ci(sx), sj = this.cj(sz), gi = this.ci(tx), gj = this.cj(tz);
    if (this.costIJ(gi, gj) <= 0) return null;
    // Window: the start/goal bounding box padded for detours, clamped to W cells and the world.
    // A request longer than the window keeps the start inside and reaches toward the goal.
    const bi0 = Math.min(si, gi), bi1 = Math.max(si, gi), bj0 = Math.min(sj, gj), bj1 = Math.max(sj, gj);
    let wi0 = bi1 - bi0 < W - 2 * M ? Math.round((bi0 + bi1) / 2 - W / 2) : gi > si ? si - M : si + M - W;
    let wj0 = bj1 - bj0 < W - 2 * M ? Math.round((bj0 + bj1) / 2 - W / 2) : gj > sj ? sj - M : sj + M - W;
    wi0 = Math.max(0, Math.min(n - W, wi0));
    wj0 = Math.max(0, Math.min(n - W, wj0));
    const wi1 = Math.min(n, wi0 + W), wj1 = Math.min(n, wj0 + W);
    const sIdx = sj * n + si, gIdx = gj * n + gi;

    const gen = ++this.gen;
    if (gen === 0xffffffff) {
      this.sstamp.fill(0);
      this.sclosed.fill(0);
      this.gen = 1;
    }
    const stamp = this.gen;
    const sg = this.sg, sparent = this.sparent, sstamp = this.sstamp, sclosed = this.sclosed;
    const heap = this.heap;
    heap.clear();
    const sL = (sj - wj0) * W + (si - wi0);
    sg[sL] = 0;
    sstamp[sL] = stamp;
    sparent[sL] = -1;
    heap.push(sIdx, this.h(sIdx, gIdx));
    let expanded = 0;
    let best = sIdx, bestH = Infinity;
    while (heap.size > 0) {
      const cur = heap.pop();
      const ci = cur % n, cj = (cur / n) | 0;
      const cL = (cj - wj0) * W + (ci - wi0);
      if (sclosed[cL] === stamp) continue;
      sclosed[cL] = stamp;
      if (cur === gIdx) {
        best = cur;
        break;
      }
      if (++expanded > maxNodes) break;
      const hh = this.h(cur, gIdx);
      if (hh < bestH) {
        bestH = hh;
        best = cur;
      }
      const tile = this.tile(ci >> shift, cj >> shift);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = ci + di, nj = cj + dj;
          if (ni < wi0 || nj < wj0 || ni >= wi1 || nj >= wj1) continue;
          const nL = (nj - wj0) * W + (ni - wi0);
          if (sclosed[nL] === stamp) continue;
          // Same tile in the common case; fall back to the lookup at tile borders.
          const c = ni >> shift === tile.ti && nj >> shift === tile.tj ? this.tileCost(tile, ni, nj) : this.costIJ(ni, nj);
          if (c <= 0) continue;
          if (di && dj && (this.costIJ(ni, cj) <= 0 || this.costIJ(ci, nj) <= 0)) continue; // no corner cutting
          const ng = sg[cL] + (di && dj ? 1.4142 : 1) * c;
          if (sstamp[nL] !== stamp || ng < sg[nL]) {
            sg[nL] = ng;
            sstamp[nL] = stamp;
            sparent[nL] = cur;
            const nIdx = nj * n + ni;
            heap.push(nIdx, ng + this.h(nIdx, gIdx));
          }
        }
      }
    }
    this.lastExpanded = expanded;
    const complete = best === gIdx;
    this.lastPathComplete = complete;
    if (best === sIdx && !complete) return null;

    // Reconstruct into the persistent trail: trail[count - 1] is the start cell, trail[0] is `best`.
    let count = 0;
    for (let c = best; c !== -1; c = sparent[(((c / n) | 0) - wj0) * W + ((c % n) - wi0)]) {
      if (count === this.trail.length) {
        const grown = new Int32Array(this.trail.length * 2);
        grown.set(this.trail);
        this.trail = grown;
      }
      this.trail[count++] = c;
    }
    const trail = this.trail;
    const px = (k: number) => (complete && k === 0 ? tx : -this.half + ((trail[k] % n) + 0.5) * this.cell);
    const pz = (k: number) => (complete && k === 0 ? tz : -this.half + (((trail[k] / n) | 0) + 0.5) * this.cell);

    // String pulling: from each anchor, jump to the farthest waypoint reachable in a straight, easy line.
    const out: Vector2[] = [];
    let ax = sx, az = sz;
    let k = count - 1;
    while (k >= 0) {
      let far = k;
      for (let m = 0; m < k; m++) {
        const mx = px(m), mz = pz(m);
        if (this.lineClear(ax, az, mx, mz) && this.segmentWalkable(ax, az, mx, mz)) {
          far = m;
          break;
        }
      }
      ax = px(far);
      az = pz(far);
      out.push(new Vector2(ax, az));
      k = far - 1;
    }
    return out;
  }

  /** Octile distance heuristic between two global cell indices. */
  private h(a: number, b: number): number {
    const n = this.n;
    const dx = Math.abs((a % n) - (b % n)), dz = Math.abs(((a / n) | 0) - ((b / n) | 0));
    return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz);
  }
}

/** Binary min-heap of cell indices keyed by f-score, on growable typed arrays. */
class NavHeap {
  private items = new Int32Array(1024);
  private keys = new Float64Array(1024);
  size = 0;

  clear(): void {
    this.size = 0;
  }

  push(v: number, k: number): void {
    if (this.size === this.items.length) {
      const items = new Int32Array(this.size * 2), keys = new Float64Array(this.size * 2);
      items.set(this.items);
      keys.set(this.keys);
      this.items = items;
      this.keys = keys;
    }
    const items = this.items, keys = this.keys;
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= k) break;
      items[i] = items[p];
      keys[i] = keys[p];
      i = p;
    }
    items[i] = v;
    keys[i] = k;
  }

  pop(): number {
    const items = this.items, keys = this.keys;
    const top = items[0];
    const n = --this.size;
    if (n > 0) {
      const v = items[n], k = keys[n];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = -1, mk = k;
        if (l < n && keys[l] < mk) {
          m = l;
          mk = keys[l];
        }
        if (r < n && keys[r] < mk) m = r;
        if (m < 0) break;
        items[i] = items[m];
        keys[i] = keys[m];
        i = m;
      }
      items[i] = v;
      keys[i] = k;
    }
    return top;
  }
}

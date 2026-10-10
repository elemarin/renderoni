import * as THREE from 'three';
import type { HeightSource } from './heightfield.js';

/** One extra per-vertex attribute written by a `TerrainShading`. */
export interface TerrainAttribute {
  /** Geometry attribute name, e.g. `color` or a custom `layer` read by the material's shader. */
  name: string;
  itemSize: number;
  /** Skirt vertices copy their edge vertex's value times this factor. Default 1 (a colour might use 0.8). */
  skirtScale?: number;
}

/** The chunk being meshed, passed to `TerrainShading.beginChunk` and on every `TerrainVertex`. */
export interface TerrainChunkInfo {
  i: number;
  j: number;
  lod: number;
  /** World position of the chunk's (0, 0) vertex. */
  x0: number;
  z0: number;
  /** Chunk side length (metres). */
  size: number;
  /** Vertex spacing (metres). */
  step: number;
  /** Quads per side. */
  segs: number;
}

/**
 * The vertex being written. One object is reused for every vertex of every chunk, so read what
 * you need and do not keep a reference.
 */
export interface TerrainVertex {
  chunk: TerrainChunkInfo;
  /** World position. */
  x: number;
  y: number;
  z: number;
  /** Position relative to the chunk origin. */
  lx: number;
  lz: number;
  /** Grid index within the chunk (0..segs). */
  gi: number;
  gj: number;
  /** Heights one step to the left (-x), right (+x), down (-z) and up (+z). */
  hl: number;
  hr: number;
  hd: number;
  hu: number;
  /** Unit normal from central differences. */
  nx: number;
  ny: number;
  nz: number;
  /** Rise per metre. */
  slope: number;
}

/**
 * Per-vertex attributes beyond position and normal (colour, texture-layer weights, ...).
 * `vertex` is called once per grid vertex with the attribute arrays in `attributes` order;
 * write `itemSize` values at `index * itemSize`. Skirt vertices are copied from the edge.
 */
export interface TerrainShading {
  attributes: TerrainAttribute[];
  /** Called before a chunk's vertices; the place to gather per-chunk data (nearby roads, a coarse colour grid). */
  beginChunk?(chunk: TerrainChunkInfo): void;
  vertex(v: TerrainVertex, out: Float32Array[], index: number): void;
  /** Called after a chunk's vertices. */
  endChunk?(chunk: TerrainChunkInfo): void;
}

export interface TerrainMeshOptions {
  /** Material for every chunk. Default: a `MeshStandardMaterial` (vertex colours on when a `color` attribute is shaded), disposed with the mesh. A supplied material is never disposed here. */
  material?: THREE.Material;
  shading?: TerrainShading;
  /** Vertex spacing per LOD (metres). Default [2.5, 6.25, 18.75]. */
  lodSpacing?: number[];
  /** Outer distance from the target per LOD; the last is the streaming radius. Default [220, 520, 1150]. */
  lodRadius?: number[];
  /** Target chunk side (metres); the world is split into round(size / chunkSize) chunks per side. Default 187.5. */
  chunkSize?: number;
  /** How far skirts hang below chunk edges (metres). Default 6. */
  skirt?: number;
  /** Chunk builds per `update`; a LOD-0 chunk costs 2. Default 2. */
  buildBudget?: number;
  /** Chunks farther than the streaming radius plus this are unloaded. Default 2 chunk sides. */
  unloadMargin?: number;
  /** Chunks at this LOD or finer cast shadows. Default 0. */
  castShadowMaxLod?: number;
  receiveShadow?: boolean;
  /** Mesh name for every chunk. Default `terrain`. */
  name?: string;
  /** Clock for the `buildMs` statistic. Default `performance.now`. */
  now?: () => number;
}

export interface TerrainChunk {
  i: number;
  j: number;
  lod: number;
  mesh: THREE.Mesh;
}

export interface TerrainRaymarchOptions {
  /** Farthest distance along the ray (metres). Default 4000. */
  maxDist?: number;
  /** Surface floor, e.g. a water level: the ray stops at max(floor, height). Default -Infinity. */
  floor?: number;
  /** An upward ray starting above this height cannot hit and returns null at once. Default Infinity. */
  ceiling?: number;
}

interface Pending { i: number; j: number; lod: number; d: number }

const DEFAULT_SPACING = [2.5, 6.25, 18.75];
const DEFAULT_RADIUS = [220, 520, 1150];

/**
 * Streaming, level-of-detail terrain mesh over any `HeightSource`.
 *
 * The world is split into a grid of chunks. Each chunk is meshed lazily at a vertex spacing that
 * depends on its distance from the target and re-meshed when it should change level; a small
 * build budget per `update` keeps the frame time flat. Chunks carry a skirt hanging down their
 * edges so different LODs never show cracks. Normals come from finite differences of the height
 * on a padded grid, so LOD borders shade identically.
 *
 * Presentation only: it reads heights, never writes simulation state.
 */
export class TerrainMesh {
  readonly group = new THREE.Group();
  readonly material: THREE.Material;
  /** Chunks per side. */
  readonly n: number;
  /** Actual chunk side (metres). */
  readonly chunkSize: number;
  readonly lodSpacing: readonly number[];
  readonly lodRadius: readonly number[];
  /** Build statistics (diagnostics). */
  readonly stats = { builds: 0, buildMs: 0 };

  private readonly chunks = new Map<number, TerrainChunk>();
  private pending: Pending[] = [];
  private pendingAt = 0;
  private lastCx = NaN;
  private lastCz = NaN;
  private readonly ownsMaterial: boolean;
  private readonly shading: TerrainShading | undefined;
  private readonly skirt: number;
  private readonly buildBudget: number;
  private readonly unloadMargin: number;
  private readonly castShadowMaxLod: number;
  private readonly receiveShadow: boolean;
  private readonly name: string;
  private readonly now: () => number;
  private readonly vtx: TerrainVertex;
  private readonly info: TerrainChunkInfo = { i: 0, j: 0, lod: 0, x0: 0, z0: 0, size: 0, step: 0, segs: 0 };
  private readonly raycaster = new THREE.Raycaster();
  private readonly hits: THREE.Intersection[] = [];
  private readonly p = new THREE.Vector3();

  constructor(readonly source: HeightSource, options: TerrainMeshOptions = {}) {
    this.lodSpacing = options.lodSpacing ?? DEFAULT_SPACING;
    this.lodRadius = options.lodRadius ?? DEFAULT_RADIUS;
    if (this.lodSpacing.length === 0 || this.lodSpacing.length !== this.lodRadius.length) throw new Error('TerrainMesh: lodSpacing and lodRadius must be non-empty and the same length');
    this.n = Math.max(1, Math.round(source.size / (options.chunkSize ?? 187.5)));
    this.chunkSize = source.size / this.n;
    this.shading = options.shading;
    this.skirt = options.skirt ?? 6;
    this.buildBudget = options.buildBudget ?? 2;
    this.unloadMargin = options.unloadMargin ?? this.chunkSize * 2;
    this.castShadowMaxLod = options.castShadowMaxLod ?? 0;
    this.receiveShadow = options.receiveShadow ?? true;
    this.name = options.name ?? 'terrain';
    this.now = options.now ?? (() => performance.now());
    this.ownsMaterial = !options.material;
    this.material = options.material ?? new THREE.MeshStandardMaterial({ vertexColors: !!this.shading?.attributes.some((a) => a.name === 'color'), roughness: 0.96, metalness: 0 });
    this.group.name = this.name;
    this.vtx = { chunk: this.info, x: 0, y: 0, z: 0, lx: 0, lz: 0, gi: 0, gj: 0, hl: 0, hr: 0, hd: 0, hu: 0, nx: 0, ny: 1, nz: 0, slope: 0 };
  }

  /** Loaded chunk meshes (for picking). */
  get meshes(): THREE.Mesh[] { return this.group.children as THREE.Mesh[]; }
  /** Number of loaded chunks. */
  get loaded(): number { return this.chunks.size; }
  /** Chunk builds still queued for the current target cell. */
  get queued(): number { return this.pending.length - this.pendingAt; }
  getChunk(i: number, j: number): TerrainChunk | undefined { return this.chunks.get(this.key(i, j)); }

  /** Chunk indices containing world (x, z), clamped to the grid. */
  chunkOf(x: number, z: number): { i: number; j: number } {
    const h = this.source.size / 2, n = this.n;
    return { i: Math.min(n - 1, Math.max(0, Math.floor((x + h) / this.chunkSize))), j: Math.min(n - 1, Math.max(0, Math.floor((z + h) / this.chunkSize))) };
  }

  /** LOD for a distance: the first ring whose radius exceeds it, else the coarsest. */
  lodFor(d: number): number {
    const R = this.lodRadius;
    for (let k = 0; k < R.length - 1; k++) if (d < R[k]) return k;
    return R.length - 1;
  }

  private key(i: number, j: number) { return j * this.n + i; }
  private centreX(i: number) { return -this.source.size / 2 + (i + 0.5) * this.chunkSize; }

  /**
   * Stream chunks around a target (typically the camera target). Call every frame. The queue is
   * rebuilt when the target enters a new chunk; at most `budget` chunk costs are built per call
   * (pass Infinity to build everything queued, e.g. before the first frame).
   */
  update(target: { x: number; z: number }, budget: number = this.buildBudget): void {
    const h = this.source.size / 2, cs = this.chunkSize, n = this.n;
    const tx = target.x, tz = target.z;
    const cx = Math.floor((tx + h) / cs), cz = Math.floor((tz + h) / cs);
    const far = this.lodRadius[this.lodRadius.length - 1];
    if (cx !== this.lastCx || cz !== this.lastCz) {
      this.lastCx = cx; this.lastCz = cz;
      this.pending.length = 0; this.pendingAt = 0;
      const reach = Math.ceil(far / cs) + 1;
      for (let j = Math.max(0, cz - reach); j <= Math.min(n - 1, cz + reach); j++) for (let i = Math.max(0, cx - reach); i <= Math.min(n - 1, cx + reach); i++) {
        const d = Math.hypot(this.centreX(i) - tx, this.centreX(j) - tz) - cs * 0.7;
        if (d > far) continue;
        const lod = this.lodFor(Math.max(0, d));
        const cur = this.chunks.get(this.key(i, j));
        if (!cur || cur.lod !== lod) this.pending.push({ i, j, lod, d });
      }
      this.pending.sort((a, b) => a.d - b.d);
      // unload chunks well outside the streaming radius
      for (const [k, c] of this.chunks) {
        if (Math.hypot(this.centreX(c.i) - tx, this.centreX(c.j) - tz) > far + this.unloadMargin) { this.disposeChunk(c); this.chunks.delete(k); }
      }
    }
    while (budget > 0 && this.pendingAt < this.pending.length) {
      const p = this.pending[this.pendingAt++];
      const k = this.key(p.i, p.j);
      const cur = this.chunks.get(k);
      if (cur && cur.lod === p.lod) continue;
      const t0 = this.now();
      const mesh = this.buildChunk(p.i, p.j, p.lod);
      this.stats.builds++; this.stats.buildMs += this.now() - t0;
      if (cur) this.disposeChunk(cur);
      this.chunks.set(k, { i: p.i, j: p.j, lod: p.lod, mesh });
      this.group.add(mesh);
      // static: skipped by the per-frame matrix walk
      mesh.matrixAutoUpdate = false; mesh.updateMatrixWorld(true); mesh.matrixWorldAutoUpdate = false;
      budget -= p.lod === 0 ? 2 : 1;
    }
  }

  private disposeChunk(c: TerrainChunk) { this.group.remove(c.mesh); c.mesh.geometry.dispose(); }

  /** Mesh one chunk at a LOD. Public so callers can build a chunk outside streaming (tests, map previews). */
  buildChunk(ci: number, cj: number, lod: number): THREE.Mesh {
    const src = this.source, cs = this.chunkSize, half = src.size / 2;
    const x0 = -half + ci * cs, z0 = -half + cj * cs;
    const segs = Math.max(3, Math.round(cs / this.lodSpacing[lod]));
    const step = cs / segs;
    const nv = segs + 1;
    // exactly the edge ring: spare zeroed vertices would drag the bounding sphere to the origin
    const gridCount = nv * nv, skirtCount = (nv - 1) * 4;
    const total = gridCount + skirtCount;
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
    const shading = this.shading, attrs = shading?.attributes ?? [];
    const out: Float32Array[] = attrs.map((a) => new Float32Array(total * a.itemSize));

    const info = this.info;
    info.i = ci; info.j = cj; info.lod = lod; info.x0 = x0; info.z0 = z0; info.size = cs; info.step = step; info.segs = segs;
    shading?.beginChunk?.(info);

    // one height sample per vertex on a padded grid; normals come from neighbours
    const pn = nv + 2;
    const H = new Float32Array(pn * pn);
    for (let j = 0; j < pn; j++) for (let i = 0; i < pn; i++) H[j * pn + i] = src.heightAt(x0 + (i - 1) * step, z0 + (j - 1) * step);
    const v = this.vtx;
    for (let gj = 0; gj < nv; gj++) for (let gi = 0; gi < nv; gi++) {
      const idx = gj * nv + gi;
      const lx = gi * step, lz = gj * step;
      const y = H[(gj + 1) * pn + gi + 1];
      const hl = H[(gj + 1) * pn + gi], hr = H[(gj + 1) * pn + gi + 2], hd = H[gj * pn + gi + 1], hu = H[(gj + 2) * pn + gi + 1];
      const hx = hr - hl, hz = hu - hd;
      const nx = -hx, ny = 2 * step, nz = -hz, nl = Math.hypot(nx, ny, nz) || 1;
      pos[idx * 3] = x0 + lx; pos[idx * 3 + 1] = y; pos[idx * 3 + 2] = z0 + lz;
      nor[idx * 3] = nx / nl; nor[idx * 3 + 1] = ny / nl; nor[idx * 3 + 2] = nz / nl;
      if (shading) {
        v.x = x0 + lx; v.y = y; v.z = z0 + lz; v.lx = lx; v.lz = lz; v.gi = gi; v.gj = gj;
        v.hl = hl; v.hr = hr; v.hd = hd; v.hu = hu;
        v.nx = nx / nl; v.ny = ny / nl; v.nz = nz / nl; v.slope = Math.hypot(hx, hz) / (2 * step);
        shading.vertex(v, out, idx);
      }
    }
    shading?.endChunk?.(info);

    // skirt ring: copy edge vertices, drop them by `skirt`
    const edge = new Int32Array(skirtCount);
    let e = 0;
    for (let i = 0; i < nv; i++) edge[e++] = i;                        // bottom row (j = 0)
    for (let j = 1; j < nv; j++) edge[e++] = j * nv + nv - 1;          // right column
    for (let i = nv - 2; i >= 0; i--) edge[e++] = (nv - 1) * nv + i;   // top row reversed
    for (let j = nv - 2; j >= 1; j--) edge[e++] = j * nv;              // left column reversed
    for (let q = 0; q < skirtCount; q++) {
      const src3 = edge[q] * 3, s = gridCount + q, s3 = s * 3;
      pos[s3] = pos[src3]; pos[s3 + 1] = pos[src3 + 1] - this.skirt; pos[s3 + 2] = pos[src3 + 2];
      nor[s3] = nor[src3]; nor[s3 + 1] = nor[src3 + 1]; nor[s3 + 2] = nor[src3 + 2];
      for (let a = 0; a < attrs.length; a++) {
        const w = attrs[a].itemSize, f = attrs[a].skirtScale ?? 1, arr = out[a];
        for (let c = 0; c < w; c++) arr[s * w + c] = arr[edge[q] * w + c] * f;
      }
    }

    const index = new (total > 65535 ? Uint32Array : Uint16Array)(segs * segs * 6 + skirtCount * 12);
    let t = 0;
    for (let j = 0; j < segs; j++) for (let i = 0; i < segs; i++) {
      const a = j * nv + i, b = a + 1, c = a + nv, d = c + 1;
      index[t++] = a; index[t++] = c; index[t++] = b; index[t++] = b; index[t++] = c; index[t++] = d;
    }
    for (let q = 0; q < skirtCount; q++) {
      const q2 = (q + 1) % skirtCount;
      const a = edge[q], b = edge[q2], sa = gridCount + q, sb = gridCount + q2;
      // both windings: skirts are seen from either side
      index[t++] = a; index[t++] = b; index[t++] = sa; index[t++] = b; index[t++] = sb; index[t++] = sa;
      index[t++] = a; index[t++] = sa; index[t++] = b; index[t++] = b; index[t++] = sa; index[t++] = sb;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    for (let a = 0; a < attrs.length; a++) geo.setAttribute(attrs[a].name, new THREE.BufferAttribute(out[a], attrs[a].itemSize));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.receiveShadow = this.receiveShadow;
    mesh.castShadow = lod <= this.castShadowMaxLod;
    mesh.name = this.name;
    mesh.userData.chunk = { i: ci, j: cj, lod };
    return mesh;
  }

  /**
   * Ray/terrain intersection. Loaded chunks are hit-tested first (exact to the displayed
   * triangles); if none is hit, falls back to `raymarch` against the height source.
   * Writes into `out` and returns it, or returns null.
   */
  pick(ray: THREE.Ray, out: THREE.Vector3 = new THREE.Vector3(), options?: TerrainRaymarchOptions): THREE.Vector3 | null {
    const rc = this.raycaster, hits = this.hits;
    rc.set(ray.origin, ray.direction);
    rc.far = options?.maxDist ?? 4000;
    hits.length = 0;
    rc.intersectObjects(this.group.children, false, hits);
    if (hits.length) {
      const p = hits[0].point;
      hits.length = 0;
      const floor = options?.floor;
      if (floor === undefined || p.y >= floor) return out.copy(p);
    }
    return this.raymarch(ray, out, options);
  }

  /** Analytic ray/heightfield intersection by marching with growing steps, then bisecting the crossing. */
  raymarch(ray: THREE.Ray, out: THREE.Vector3 = new THREE.Vector3(), options?: TerrainRaymarchOptions): THREE.Vector3 | null {
    const src = this.source, o = ray.origin, dir = ray.direction;
    const maxDist = options?.maxDist ?? 4000, floor = options?.floor ?? -Infinity, ceiling = options?.ceiling ?? Infinity;
    if (dir.y >= 0 && o.y > ceiling) return null;
    const p = this.p;
    let t = 0, step = 2;
    let prevAbove = o.y - Math.max(floor, src.heightAt(o.x, o.z)) > 0;
    while (t < maxDist) {
      t += step;
      p.copy(o).addScaledVector(dir, t);
      const above = p.y - Math.max(floor, src.heightAt(p.x, p.z)) > 0;
      if (prevAbove && !above) {
        let lo = t - step, hi = t;
        for (let k = 0; k < 8; k++) {
          const m = (lo + hi) / 2;
          p.copy(o).addScaledVector(dir, m);
          if (p.y - Math.max(floor, src.heightAt(p.x, p.z)) > 0) lo = m; else hi = m;
        }
        return out.copy(o).addScaledVector(dir, hi);
      }
      prevAbove = above;
      step = Math.min(24, step * 1.08);
    }
    return null;
  }

  /** Dispose every chunk's geometry, detach the group, and dispose the material if this mesh created it. */
  dispose(): void {
    for (const c of this.chunks.values()) this.disposeChunk(c);
    this.chunks.clear(); this.pending.length = 0; this.pendingAt = 0;
    this.lastCx = NaN; this.lastCz = NaN;
    this.group.parent?.remove(this.group);
    if (this.ownsMaterial) this.material.dispose();
  }
}

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Buckets, TileCache, TiledHeightfield, TerrainMesh, type HeightSource, type TerrainShading } from '../src/terrain/index.js';

const wavy = (x: number, z: number) => Math.sin(x * 0.013) * 40 + Math.cos(z * 0.021) * 25 + Math.sin((x + z) * 0.002) * 60;
const plane = (x: number, z: number) => 0.3 * x - 0.4 * z + 5;

describe('Terrain', () => {
  describe('TileCache', () => {
    it('fills a tile once and serves repeat lookups from cache', () => {
      let fills = 0;
      const cache = new TileCache(4, 1, 1, 8, 0, (t, x0, z0) => {
        fills++;
        for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) t.data[j * 5 + i] = x0 + i + (z0 + j) * 100;
      });
      expect(cache.sample(0, 1.5, 2)).toBeCloseTo(201.5, 5);
      expect(cache.sample(0, 3, 3.25)).toBeCloseTo(328, 5);
      expect(fills).toBe(1);
      expect(cache.has(0, 0)).toBe(true);
      expect(cache.has(1, 0)).toBe(false);
      expect(cache.resident).toBe(1);
    });

    it('evicts the oldest quarter once the cap is reached', () => {
      const cache = new TileCache(2, 1, 1, 8, 0, () => {});
      for (let i = 0; i < 8; i++) cache.tile(i, 0);
      expect(cache.resident).toBe(8);
      cache.tile(8, 0);
      expect(cache.resident).toBe(7);
      expect(cache.has(0, 0)).toBe(false);
      expect(cache.has(1, 0)).toBe(false);
      expect(cache.has(7, 0)).toBe(true);
    });
  });

  describe('TiledHeightfield', () => {
    it('rebuilds evicted tiles bit-identically', () => {
      const hf = new TiledHeightfield({ size: 4000, sample: wavy, tileSamples: 8, step: 5, cacheTiles: 4 });
      const pts: number[] = [];
      for (let k = 0; k < 400; k++) pts.push(-1900 + ((k * 7919) % 3800), -1900 + ((k * 104729) % 3800));
      const first = pts.filter((_, k) => k % 2 === 0).map((x, k) => hf.heightAt(x, pts[k * 2 + 1]));
      const builds = hf.stats.builds;
      expect(hf.stats.tiles).toBeLessThanOrEqual(4);
      const second = pts.filter((_, k) => k % 2 === 0).map((x, k) => hf.heightAt(x, pts[k * 2 + 1]));
      expect(hf.stats.builds).toBeGreaterThan(builds);
      expect(second).toEqual(first);

      const fresh = new TiledHeightfield({ size: 4000, sample: wavy, tileSamples: 8, step: 5, cacheTiles: 1024 });
      const third = pts.filter((_, k) => k % 2 === 0).map((x, k) => fresh.heightAt(x, pts[k * 2 + 1]));
      expect(third).toEqual(first);
    });

    it('interpolates bilinearly: exact on a plane and at lattice points, close on a smooth surface', () => {
      const flat = new TiledHeightfield({ size: 1000, sample: plane, step: 4 });
      for (const [x, z] of [[0, 0], [1.3, -7.9], [123.4, 321.1], [-499, 499]]) expect(flat.heightAt(x, z)).toBeCloseTo(plane(x, z), 3);

      const hf = new TiledHeightfield({ size: 1000, sample: wavy, step: 4 });
      // lattice point: -500 + 4k
      expect(hf.heightAt(-500 + 4 * 37, -500 + 4 * 91)).toBeCloseTo(wavy(-500 + 4 * 37, -500 + 4 * 91), 4);
      let worst = 0;
      for (let x = -480; x < 480; x += 13.7) for (let z = -480; z < 480; z += 17.3) worst = Math.max(worst, Math.abs(hf.heightAt(x, z) - wavy(x, z)));
      // bilinear error ≤ step² · max|f''| / 8 per axis ≈ 16 · (40·0.013² + 25·0.021²) / 8
      expect(worst).toBeLessThan(0.05);
      expect(hf.analytic(12.5, 3)).toBe(wavy(12.5, 3));
    });

    it('computes slope from the cached surface and coarse slope without building tiles', () => {
      const hf = new TiledHeightfield({ size: 1000, sample: plane });
      expect(hf.slopeAt(10, 20, true)).toBeCloseTo(0.5, 6);
      expect(hf.stats.builds).toBe(0);
      expect(hf.slopeAt(10, 20)).toBeCloseTo(0.5, 3);
      expect(hf.stats.builds).toBeGreaterThan(0);

      const level = new TiledHeightfield({ size: 1000, sample: () => 3 });
      expect(level.slopeAt(0, 0)).toBe(0);
      expect(level.slopeAt(0, 0, true)).toBe(0);
    });

    it('prewarms every tile around a point so later lookups build nothing', () => {
      const hf = new TiledHeightfield({ size: 6000, sample: wavy, tileSamples: 16, step: 10 });   // 160 m tiles
      hf.prewarm(100, -200, 500);
      const built = hf.stats.builds;
      // x: [-400, 600] + 3000 → tiles 16..22; z: [-700, 300] + 3000 → tiles 14..20
      expect(built).toBe(7 * 7);
      for (let x = -400; x <= 600; x += 25) for (let z = -700; z <= 300; z += 25) hf.heightAt(x, z);
      expect(hf.stats.builds).toBe(built);
      expect(hf.stats.tiles).toBe(built);
      hf.clear();
      expect(hf.stats.tiles).toBe(0);
    });

    it('caches extra channels alongside height', () => {
      const hf = new TiledHeightfield({ size: 1000, sample: plane, channels: 3, extra: (x, _z, out, o) => { out[o] = x * 0.5; out[o + 1] = 7; } });
      expect(hf.channel(1, 10.5, 3)).toBeCloseTo(5.25, 4);
      expect(hf.channel(2, -200, 100)).toBe(7);
      expect(hf.heightAt(10.5, 3)).toBeCloseTo(plane(10.5, 3), 3);
    });

    it('supports subclassing: override analytic, then heightAt, without changing slope', () => {
      class Game extends TiledHeightfield {
        private readonly bias = 2;
        constructor() { super({ size: 1000 }); }
        override analytic(x: number, z: number) { return plane(x, z) + this.bias; }
        override heightAt(x: number, z: number, detail = true) { return super.heightAt(x, z) + (detail ? 100 : 0); }
      }
      const g = new Game();
      expect(g.heightAt(0, 0, false)).toBeCloseTo(7, 4);
      expect(g.heightAt(0, 0)).toBeCloseTo(107, 4);
      expect(g.slopeAt(0, 0)).toBeCloseTo(0.5, 3);
      expect(() => new TiledHeightfield({ size: 10 }).heightAt(0, 0)).toThrow(/sample/);
    });
  });

  describe('Buckets', () => {
    it('returns every item whose box overlaps the query cell', () => {
      const b = new Buckets<string>(100);
      b.insert(-50, -50, 50, 50, 'centre');     // cells (-1..0, -1..0)
      b.insert(120, 10, 180, 20, 'east');       // cell (1, 0)
      b.insert(-250, 250, -210, 260, 'far');    // cell (-3, 2)
      expect(b.query(10, 10)).toEqual(['centre']);
      expect(b.query(-10, -10)).toEqual(['centre']);
      expect(b.query(150, 90)).toEqual(['east']);
      expect(b.query(-220, 299)).toEqual(['far']);
      expect(b.query(500, 500)).toBeUndefined();
      b.insert(0, 0, 150, 10, 'wide');
      expect(b.query(150, 5)).toEqual(['east', 'wide']);
      expect(b.cells).toBe(6);
      b.clear();
      expect(b.query(10, 10)).toBeUndefined();
    });
  });

  describe('TerrainMesh', () => {
    const flat: HeightSource = { size: 2000, heightAt: () => 4 };
    const sloped: HeightSource = { size: 2000, heightAt: plane };
    const small = { chunkSize: 200, lodSpacing: [5, 20, 50], lodRadius: [150, 400, 700] };

    it('builds a chunk with a skirt ring and exact vertex counts', () => {
      const tm = new TerrainMesh(flat, small);
      expect(tm.n).toBe(10);
      expect(tm.chunkSize).toBe(200);
      for (const [lod, segs] of [[0, 40], [1, 10], [2, 4]]) {
        const geo = tm.buildChunk(3, 4, lod).geometry;
        const nv = segs + 1;
        expect(geo.getAttribute('position').count).toBe(nv * nv + 4 * segs);
        expect(geo.getIndex()!.count).toBe(segs * segs * 6 + 4 * segs * 12);
        const pos = geo.getAttribute('position');
        for (let k = nv * nv; k < pos.count; k++) expect(pos.getY(k)).toBe(4 - 6);
        for (let k = 0; k < nv * nv; k++) expect(pos.getY(k)).toBe(4);
        expect(geo.getAttribute('normal').getY(0)).toBe(1);
        geo.dispose();
      }
      // chunk (3, 4) spans x ∈ [-400, -200], z ∈ [-200, 0]
      const box = new THREE.Box3().setFromBufferAttribute(tm.buildChunk(3, 4, 2).geometry.getAttribute('position') as THREE.BufferAttribute);
      expect(box.min.toArray()).toEqual([-400, -2, -200]);
      expect(box.max.toArray()).toEqual([-200, 4, 0]);
    });

    it('follows a sloped surface with matching positions and normals', () => {
      const tm = new TerrainMesh(sloped, { ...small, skirt: 10 });
      const geo = tm.buildChunk(5, 5, 1).geometry;
      const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal');
      const nv = 11;
      for (let k = 0; k < nv * nv; k++) expect(pos.getY(k)).toBeCloseTo(plane(pos.getX(k), pos.getZ(k)), 3);
      for (let k = nv * nv; k < pos.count; k++) expect(pos.getY(k)).toBeCloseTo(plane(pos.getX(k), pos.getZ(k)) - 10, 3);
      const n = new THREE.Vector3(-0.3, 1, 0.4).normalize();
      expect(nor.getX(60)).toBeCloseTo(n.x, 5);
      expect(nor.getY(60)).toBeCloseTo(n.y, 5);
      expect(nor.getZ(60)).toBeCloseTo(n.z, 5);
    });

    it('streams chunks by distance, spends the build budget, and picks LODs by ring', () => {
      const tm = new TerrainMesh(flat, small);
      tm.update({ x: 0, z: 0 });
      expect(tm.stats.builds).toBe(1);   // the nearest chunk is LOD 0 and costs the whole budget
      expect(tm.queued).toBeGreaterThan(0);
      while (tm.queued > 0) tm.update({ x: 0, z: 0 });
      expect(tm.getChunk(5, 5)!.lod).toBe(0);
      expect(tm.getChunk(4, 4)!.lod).toBe(0);
      expect(tm.getChunk(7, 5)!.lod).toBe(1);   // centre 500 m away, minus 140 → 360
      expect(tm.getChunk(8, 5)!.lod).toBe(2);   // 560 m
      expect(tm.getChunk(9, 5)).toBeUndefined(); // 760 m, beyond the streaming radius
      expect(tm.getChunk(0, 0)).toBeUndefined();
      for (const m of tm.meshes) {
        const c = m.userData.chunk as { i: number; j: number; lod: number };
        const d = Math.hypot(-1000 + (c.i + 0.5) * 200, -1000 + (c.j + 0.5) * 200) - 140;
        expect(d).toBeLessThanOrEqual(700);
        expect(tm.lodFor(Math.max(0, d))).toBe(c.lod);
        expect(m.castShadow).toBe(c.lod === 0);
        expect(m.receiveShadow).toBe(true);
      }
      expect(tm.meshes.length).toBe(tm.loaded);
    });

    it('re-meshes at a new LOD and unloads chunks as the target moves', () => {
      const tm = new TerrainMesh(flat, small);
      tm.update({ x: -900, z: -900 }, Infinity);
      const corner = tm.getChunk(0, 0)!;
      expect(corner.lod).toBe(0);
      const geo = corner.mesh.geometry;
      let disposed = false;
      geo.addEventListener('dispose', () => { disposed = true; });
      tm.update({ x: -500, z: -900 }, Infinity);
      expect(tm.getChunk(0, 0)!.lod).toBe(1);
      expect(disposed).toBe(true);
      tm.update({ x: 900, z: 900 }, Infinity);
      // unload beyond 700 + 2 · 200 from the target
      expect(tm.getChunk(0, 0)).toBeUndefined();
      for (const m of tm.meshes) {
        const c = m.userData.chunk as { i: number; j: number };
        expect(Math.hypot(-1000 + (c.i + 0.5) * 200 - 900, -1000 + (c.j + 0.5) * 200 - 900)).toBeLessThanOrEqual(1100);
      }
      const scene = new THREE.Scene();
      scene.add(tm.group);
      tm.dispose();
      expect(tm.loaded).toBe(0);
      expect(tm.group.parent).toBeNull();
    });

    it('writes caller attributes per vertex and copies them to the skirt', () => {
      let chunks = 0;
      const shading: TerrainShading = {
        attributes: [{ name: 'color', itemSize: 3, skirtScale: 0.5 }, { name: 'layer', itemSize: 4 }],
        beginChunk: () => { chunks++; },
        vertex(v, out, i) {
          out[0][i * 3] = v.slope; out[0][i * 3 + 1] = v.y / 100; out[0][i * 3 + 2] = 1;
          out[1][i * 4] = v.gi; out[1][i * 4 + 1] = v.gj; out[1][i * 4 + 2] = v.chunk.lod; out[1][i * 4 + 3] = v.lx;
        },
      };
      const tm = new TerrainMesh(sloped, { ...small, shading });
      expect((tm.material as THREE.MeshStandardMaterial).vertexColors).toBe(true);
      const geo = tm.buildChunk(2, 2, 2).geometry;
      expect(chunks).toBe(1);
      const col = geo.getAttribute('color'), lay = geo.getAttribute('layer');
      expect(lay.itemSize).toBe(4);
      expect(col.getX(7)).toBeCloseTo(0.5, 4);
      expect(lay.getX(7)).toBe(2);
      expect(lay.getY(7)).toBe(1);
      expect(lay.getW(7)).toBe(100);
      const nv = 5, first = nv * nv;   // skirt vertex 0 copies grid vertex 0
      expect(col.getZ(first)).toBe(0.5);
      expect(col.getY(first)).toBeCloseTo(col.getY(0) * 0.5, 6);
      expect(lay.getZ(first)).toBe(2);
    });

    it('uses a caller material and leaves it undisposed', () => {
      const material = new THREE.MeshBasicMaterial();
      let disposed = false;
      material.addEventListener('dispose', () => { disposed = true; });
      const tm = new TerrainMesh(flat, { ...small, material });
      tm.update({ x: 0, z: 0 }, Infinity);
      expect(tm.meshes.every((m) => m.material === material)).toBe(true);
      tm.dispose();
      expect(disposed).toBe(false);
    });

    it('picks against loaded chunks and falls back to analytic marching', () => {
      const tm = new TerrainMesh(sloped, small);
      const ray = new THREE.Ray(new THREE.Vector3(30, 400, -20), new THREE.Vector3(0.2, -1, 0.1).normalize());
      const marched = tm.pick(ray);
      expect(marched).not.toBeNull();
      expect(marched!.y).toBeCloseTo(plane(marched!.x, marched!.z), 1);

      tm.update({ x: 0, z: 0 }, Infinity);
      const out = new THREE.Vector3();
      const hit = tm.pick(ray, out);
      expect(hit).toBe(out);
      expect(out.y).toBeCloseTo(plane(out.x, out.z), 3);
      expect(out.distanceTo(marched!)).toBeLessThan(0.2);

      const flatTm = new TerrainMesh(flat, small);
      const down = new THREE.Ray(new THREE.Vector3(0, 50, 0), new THREE.Vector3(0, -1, 0));
      expect(flatTm.raymarch(down)!.y).toBeCloseTo(4, 1);
      expect(flatTm.raymarch(down, undefined, { floor: 10 })!.y).toBeCloseTo(10, 1);
      const up = new THREE.Ray(new THREE.Vector3(0, 300, 0), new THREE.Vector3(0, 1, 0));
      expect(flatTm.raymarch(up, undefined, { ceiling: 200 })).toBeNull();
      expect(flatTm.raymarch(new THREE.Ray(new THREE.Vector3(0, 50, 0), new THREE.Vector3(1, 0, 0)), undefined, { maxDist: 500 })).toBeNull();
    });
  });
});

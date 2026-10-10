import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { ExpeditionRouter, NavGrid, SpatialHash, type NavCostField } from '../src/nav/index.js';

const here = dirname(fileURLToPath(import.meta.url));

function field(size: number, cellCost: (x: number, z: number) => number = () => 1): NavCostField {
  return { size, cellCost };
}

/** Every leg from the start through the waypoints is walkable. */
function legsWalkable(nav: NavGrid, sx: number, sz: number, path: { x: number; y: number }[]): boolean {
  let ax = sx, az = sz;
  for (const p of path) {
    if (!nav.segmentWalkable(ax, az, p.x, p.y)) return false;
    ax = p.x;
    az = p.y;
  }
  return true;
}

describe('NavGrid', () => {
  it('is published as the renderoni/nav subpath', () => {
    const pkg = JSON.parse(readFileSync(resolve(here, '../package.json'), 'utf-8'));
    expect(pkg.exports['./nav']).toEqual({ types: './dist/nav/index.d.ts', import: './dist/nav/index.js' });
  });

  it('maps points to cells and back', () => {
    const nav = new NavGrid(field(600));
    expect(nav.n).toBe(100);
    expect(nav.toCell(-300, -300)).toEqual({ i: 0, j: 0 });
    expect(nav.toCell(299.9, 1e9)).toEqual({ i: 99, j: 99 });
    expect(nav.cellCenter(50, 50)).toEqual({ x: 3, z: 3 });
    expect(nav.inBounds(300, 0)).toBe(false);
    expect(nav.inBounds(Number.NaN, 0)).toBe(false);
  });

  it('paths around a blocker', () => {
    const nav = new NavGrid(field(600));
    nav.addBlocker('wall', 0, 0, 4, 120, 0); // thin north-south wall
    expect(nav.walkable(0, 0)).toBe(false);
    const path = nav.findPath(-60, 0, 60, 0)!;
    expect(path).not.toBeNull();
    expect(nav.lastPathComplete).toBe(true);
    expect(path.length).toBeGreaterThan(1);
    const end = path[path.length - 1];
    expect(end.x).toBeCloseTo(60);
    expect(end.y).toBeCloseTo(0);
    expect(legsWalkable(nav, -60, 0, path)).toBe(true);
    expect(path.some((p) => Math.abs(p.y) >= 60)).toBe(true);
  });

  it('returns a straight single waypoint when the line is clear', () => {
    const nav = new NavGrid(field(600));
    const path = nav.findPath(-60, 0, 60, 10)!;
    expect(path.map((p) => [p.x, p.y])).toEqual([[60, 10]]);
    expect(nav.lastPathComplete).toBe(true);
  });

  it('returns the best partial path with lastPathComplete=false for an unreachable goal', () => {
    // A ring of blocked terrain around (150, 0) with an open interior.
    const nav = new NavGrid(field(600, (x, z) => {
      const d = Math.hypot(x - 150, z);
      return d > 30 && d < 45 ? 0 : 1;
    }));
    const path = nav.findPath(-200, 0, 150, 0)!;
    expect(path).not.toBeNull();
    expect(nav.lastPathComplete).toBe(false);
    const end = path[path.length - 1];
    expect(Math.hypot(end.x - 150, end.y)).toBeLessThan(50);
    expect(legsWalkable(nav, -200, 0, path)).toBe(true);
  });

  it('keeps long requests inside the search window and returns a partial path', () => {
    // Cost 3 everywhere: never "easy", so lineClear fails and A* must run.
    const nav = new NavGrid(field(6000, () => 3));
    const path = nav.findPath(-2800, 0, 2800, 0)!;
    expect(path).not.toBeNull();
    expect(nav.lastPathComplete).toBe(false);
    const end = path[path.length - 1];
    expect(end.x).toBeGreaterThan(-2800 + 500); // real progress toward the goal
    expect(end.x).toBeLessThan(-3000 + (33 - 32 + 256) * 6); // window: start cell 33, margin 32
    expect(nav.resident).toBeLessThan(40);
    // Unlimited nodes: the search fills the window and stops at its far edge.
    const edge = nav.findPath(-2800, 0, 2800, 0, 1e7)!;
    expect(nav.lastPathComplete).toBe(false);
    expect(edge[edge.length - 1].x).toBeGreaterThan(-3000 + 250 * 6);
    expect(edge[edge.length - 1].x).toBeLessThan(-3000 + 257 * 6);
  });

  it('refuses searches beyond the per-step budget', () => {
    const nav = new NavGrid(field(600), { budget: 1 });
    expect(nav.findPath(-60, 0, 60, 0)).not.toBeNull();
    expect(nav.refused).toBe(false);
    expect(nav.budget).toBe(0);
    expect(nav.findPath(-60, 0, 60, 0)).toBeNull();
    expect(nav.refused).toBe(true);
    nav.budget = 1;
    expect(nav.findPath(-60, 0, 60, 0)).not.toBeNull();
    expect(nav.refused).toBe(false);
  });

  it('restores costs when blockers are removed, including overlaps', () => {
    const nav = new NavGrid(field(600, (x) => (x > 100 ? 2 : 1)));
    const r0 = nav.revision;
    nav.addBlocker('a', 0, 0, 20, 20, 0);
    nav.addBlocker('b', 10, 0, 20, 20, 0);
    expect(nav.revision).toBe(r0 + 2);
    expect(nav.walkable(5, 0)).toBe(false);
    nav.removeBlocker('a');
    expect(nav.walkable(-8, 0)).toBe(true);
    expect(nav.walkable(5, 0)).toBe(false); // still covered by b
    nav.removeBlocker('b');
    expect(nav.walkable(5, 0)).toBe(true);
    const { i, j } = nav.toCell(5, 0);
    expect(nav.cost(i, j)).toBe(1);
    expect(nav.revision).toBe(r0 + 4);
    nav.removeBlocker('missing');
    expect(nav.revision).toBe(r0 + 4);
  });

  it('keeps blockers across tile eviction and rebuild', () => {
    const nav = new NavGrid(field(6000), { tileCap: 4 });
    nav.addBlocker('house', 0, 0, 20, 20, 0); // tile not built yet
    expect(nav.walkable(0, 0)).toBe(false);
    // Touch many other tiles so the blocker's tile is evicted.
    for (let k = 0; k < 12; k++) nav.walkable(-2900 + k * 400, 2900);
    expect(nav.resident).toBeLessThanOrEqual(4);
    const builds = nav.builds;
    expect(nav.walkable(0, 0)).toBe(false); // rebuilt with the blocker applied
    expect(nav.builds).toBe(builds + 1);
    // Remove while evicted, then rebuild: open again.
    for (let k = 0; k < 12; k++) nav.walkable(-2900 + k * 400, -2900);
    nav.removeBlocker('house');
    expect(nav.walkable(0, 0)).toBe(true);
    expect(nav.walkableFast(0, 0)).toBe(true);
  });

  it('finds the nearest walkable cell', () => {
    const nav = new NavGrid(field(600));
    expect(nav.nearestWalkable(1, 2)).toEqual({ x: 1, z: 2 });
    nav.addBlocker('block', 0, 0, 30, 30, 0);
    const p = nav.nearestWalkable(0, 0);
    expect(nav.walkable(p.x, p.z)).toBe(true);
    expect(Math.hypot(p.x, p.z)).toBeLessThan(40);
    // coarse answers from coarseWalkable without building tiles
    const coarse = new NavGrid({ size: 600, cellCost: () => 1, coarseWalkable: (x) => x > 20 });
    const q = coarse.nearestWalkable(0, 0, true);
    expect(q.x).toBeGreaterThan(20);
    expect(coarse.resident).toBe(0);
  });

  it('checks lines and segments', () => {
    const nav = new NavGrid(field(600, (x, z) => (x > 50 && x < 60 && z > 0 ? 5 : 1)));
    expect(nav.lineClear(-100, 0, 100, -10)).toBe(true);
    expect(nav.lineClear(-100, 20, 100, 20)).toBe(false); // crosses the costly strip
    expect(nav.segmentWalkable(-100, 20, 100, 20)).toBe(true); // costly is still walkable
    nav.addBlocker('wall', 0, 0, 2, 400, 0);
    expect(nav.segmentWalkable(-10, 0, 10, 0)).toBe(false);
    expect(nav.segmentWalkable(-10, 0, 10, 0, true)).toBe(false);
    expect(nav.lineClear(-10, 0, 10, 0)).toBe(false);
    expect(nav.segmentWalkable(-10, 0, -10, 50)).toBe(true);
    expect(nav.segmentWalkable(-10, 0, 400, 0)).toBe(false); // out of bounds
  });

  it('rejects diagonal moves that cut a blocked corner', () => {
    const nav = new NavGrid(field(60, (x, z) => (x > 0 && z < 0) || (x < 0 && z > 0) ? 0 : 1), { cell: 6 });
    expect(nav.segmentWalkable(-3, -3, 3, 3)).toBe(false);
  });

  it('walkableFast agrees with walkable, before and after tiles are built', () => {
    const cost = (x: number, z: number) => (Math.sin(x * 0.05) + Math.cos(z * 0.07) > 1.2 ? 0 : 1);
    const nav = new NavGrid(field(1200, cost), { tileCap: 8 });
    nav.addBlocker('a', 100, 100, 40, 12, 0.6);
    nav.addBlocker('b', -300, 50, 3, 80, 0);
    const pts: [number, number][] = [];
    for (let z = -590; z < 600; z += 37) for (let x = -590; x < 600; x += 29) pts.push([x, z]);
    const cold = pts.map(([x, z]) => nav.walkableFast(x, z));
    expect(nav.resident).toBe(0);
    const exact = pts.map(([x, z]) => nav.walkable(x, z));
    const warm = pts.map(([x, z]) => nav.walkableFast(x, z));
    expect(cold).toEqual(exact);
    expect(warm).toEqual(exact);
    expect(exact.some((w) => !w)).toBe(true);
    for (const [x, z] of pts) expect(nav.terrainPassable(x, z)).toBe(cost(nav.cellCenter(nav.toCell(x, z).i, nav.toCell(x, z).j).x, nav.cellCenter(nav.toCell(x, z).i, nav.toCell(x, z).j).z) > 0);
  });

  it('is deterministic: identical queries give identical paths', () => {
    const cost = (x: number, z: number) => 1 + Math.abs((Math.floor(x / 18) * 7 + Math.floor(z / 18) * 13) % 5) * 0.4;
    const make = () => {
      const nav = new NavGrid(field(1200, cost), { budget: 100 });
      nav.addBlocker('w1', 0, 0, 3, 300, 0);
      nav.addBlocker('w2', 100, 50, 200, 3, 0.3);
      return nav;
    };
    const a = make(), b = make();
    const run = (nav: NavGrid) => nav.findPath(-250, -20, 260, 120, 60000)!.map((p) => [p.x, p.y]);
    const first = run(a);
    expect(first.length).toBeGreaterThan(1);
    expect(a.lastPathComplete).toBe(true);
    expect(run(a)).toEqual(first);
    expect(run(b)).toEqual(first);
  });
});

describe('SpatialHash', () => {
  const item = (x: number, z: number) => ({ position: { x, z } });

  it('answers radius queries and rebuilds cleanly', () => {
    const hash = new SpatialHash<ReturnType<typeof item>>(16);
    const a = item(0, 0), b = item(10, 0), c = item(30, 30), d = item(-100, 5);
    hash.rebuild([a, b, c, d]);
    expect(hash.within(0, 0, 12)).toEqual([a, b]);
    expect(hash.within(0, 0, 50).sort((p, q) => p.position.x - q.position.x)).toEqual([a, b, c]);
    const seen: unknown[] = [];
    hash.each(0, 0, 1, (o) => seen.push(o));
    expect(seen).toContain(a);
    expect(seen).not.toContain(d);
    b.position.x = -95;
    hash.rebuild([a, b, c, d]);
    expect(new Set(hash.within(-100, 5, 10))).toEqual(new Set([b, d]));
    expect(hash.within(0, 0, 12)).toEqual([a]);
  });
});

describe('ExpeditionRouter', () => {
  // A 3 km world split by a north-south river with a single ford near the south edge.
  const river = (x: number, z: number) => (Math.abs(x) < 20 && z < 1100 ? 0 : 1);

  function drive(nav: NavGrid, router: ExpeditionRouter, done: () => boolean, maxTicks = 2000): number {
    for (let tick = 1; tick <= maxTicks; tick++) {
      nav.budget = 14;
      router.update(tick);
      if (done()) return tick;
    }
    return -1;
  }

  it('joins complete local paths into a corridor around a long obstacle', () => {
    const nav = new NavGrid(field(3000, river));
    const router = new ExpeditionRouter(nav);
    const ticket = router.request({ x: -1200, z: -1200 }, { x: 1200, z: -1200 }, true);
    expect(ticket.state).toBe('planning');
    expect(drive(nav, router, () => ticket.state !== 'planning')).toBeGreaterThan(0);
    expect(ticket.state).toBe('ready');
    const end = ticket.points[ticket.points.length - 1];
    expect(Math.hypot(end.x - 1200, end.z + 1200)).toBeLessThan(1);
    let ax = -1200, az = -1200;
    for (const p of ticket.points) {
      expect(nav.segmentWalkable(ax, az, p.x, p.z)).toBe(true);
      ax = p.x;
      az = p.z;
    }
    expect(ticket.points.some((p) => p.z > 1100)).toBe(true);
  });

  it('gives priority requests more turns without starving ordinary ones', () => {
    const nav = new NavGrid(field(3000, river));
    const router = new ExpeditionRouter(nav);
    const ordinary = router.request({ x: -1200, z: -1000 }, { x: 1200, z: -1000 }, false);
    const priority = router.request({ x: -1200, z: -1000 }, { x: 1200, z: -1000 }, true);
    const readyAt = { ordinary: -1, priority: -1 };
    let tick = 0;
    drive(nav, router, () => {
      tick++;
      if (priority.state === 'ready' && readyAt.priority < 0) readyAt.priority = tick;
      if (ordinary.state === 'ready' && readyAt.ordinary < 0) readyAt.ordinary = tick;
      return ordinary.state !== 'planning' && priority.state !== 'planning';
    });
    expect(priority.state).toBe('ready');
    expect(ordinary.state).toBe('ready');
    expect(readyAt.priority).toBeLessThan(readyAt.ordinary);
    expect(priority.points).toEqual(ordinary.points);
  });

  it('cancels planning requests when blockers change', () => {
    const nav = new NavGrid(field(3000, river));
    const router = new ExpeditionRouter(nav);
    const ticket = router.request({ x: -1200, z: -1200 }, { x: 1200, z: -1200 });
    nav.budget = 14;
    router.update(1);
    nav.addBlocker('gate', 0, 1200, 60, 10, 0);
    router.update(2);
    expect(ticket.state).toBe('cancelled');
    expect(router.pending).toBe(0);
  });

  it('abandons requests whose owner no longer wants them', () => {
    const nav = new NavGrid(field(3000, river));
    const router = new ExpeditionRouter(nav);
    let wanted = true;
    const ticket = router.request({ x: -1200, z: -1200 }, { x: 1200, z: -1200 }, false, () => wanted);
    expect(router.pending).toBe(1);
    wanted = false;
    router.update(1);
    expect(ticket.state).toBe('cancelled');
  });
});

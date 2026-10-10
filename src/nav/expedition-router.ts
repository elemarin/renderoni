/**
 * Renderoni Expedition Router
 *
 * Sparse hierarchical A* for trips longer than one NavGrid search window. A coarse lattice of
 * waypoints (`spacing` metres apart, snapped to walkable cells) is searched with A*, and every
 * lattice edge is verified by a complete local `findPath`, so a finished corridor consists only
 * of real, walkable paths. Searches are incremental: `update(time)` advances all pending
 * requests a little each step, sharing the nav grid's per-step search budget, with priority
 * requests (e.g. the player's) receiving `priorityTurns` turns for each ordinary turn.
 *
 * Edge results are cached per nav `revision`; any blocker change cancels in-flight requests.
 * Deterministic for a deterministic sequence of requests and `update` times.
 */
import type { NavPoint } from './nav-grid.js';

/** The subset of NavGrid the router needs. */
export interface RouterNav {
  readonly size: number;
  readonly revision: number;
  readonly budget: number;
  readonly lastPathComplete: boolean;
  inBounds(x: number, z: number): boolean;
  walkable(x: number, z: number): boolean;
  nearestWalkable(x: number, z: number): NavPoint;
  /** Waypoints use `.y` for world z, as NavGrid's Vector2 results do. */
  findPath(sx: number, sz: number, tx: number, tz: number, maxNodes?: number): ReadonlyArray<{ x: number; y: number }> | null;
}

export type RoutePoint = NavPoint;

export interface RouteTicket {
  state: 'planning' | 'ready' | 'blocked' | 'cancelled';
  points: RoutePoint[];
  reason: string | null;
  revision: number;
  expanded: number;
  connections: number;
}

export interface ExpeditionRouterOptions {
  /** Initial lattice spacing in metres. Default 192. */
  spacing?: number;
  /** Failed searches retry at half spacing down to (but not below) this. Default 48. */
  minSpacing?: number;
  /** Pending requests beyond this are rejected as blocked. Default 128. */
  maxPending?: number;
  /** Local A* node budget for edges touching the start or goal. Default 7000. */
  endpointNodes?: number;
  /** Local A* node budget for lattice-to-lattice edges. Default 2200. */
  latticeNodes?: number;
  /** Connection limit per search: [priority, ordinary]. Default [9000, 1800]. */
  connectionLimit?: readonly [number, number];
  /** Attempt limit per search: [priority, ordinary]. Default [90000, 18000]. */
  attemptLimit?: readonly [number, number];
  /** Stop advancing while nav.budget is at or below this, leaving searches for direct callers. Default 3. */
  budgetReserve?: number;
  /** Maximum advances per update. Default 256. */
  workPerUpdate?: number;
  /** Priority turns per ordinary turn. Default 3. */
  priorityTurns?: number;
  /** Cached lattice points and edges (each). Default 16000. */
  cacheCap?: number;
}

interface Node {
  id: number;
  point: RoutePoint;
  g: number;
  parent: number | null;
  edge: RoutePoint[];
}

interface Search {
  ticket: RouteTicket;
  start: RoutePoint;
  goal: RoutePoint;
  spacing: number;
  width: number;
  nodes: Map<number, Node>;
  closed: Set<number>;
  open: StableHeap;
  current: Node | null;
  neighbours: number[];
  edgeIndex: number;
  attempts: number;
  priority: boolean;
  isCurrent: () => boolean;
}

interface Edge {
  points: RoutePoint[];
  length: number;
}

const START = -1;
const GOAL = -2;

export class ExpeditionRouter {
  private requests: Search[] = [];
  private priorityCursor = 0;
  private ordinaryCursor = 0;
  private lastTime = -Infinity;
  private revision = -1;
  private points = new Map<string, RoutePoint | null>();
  private edges = new Map<string, Edge | null>();
  private readonly opts: Required<ExpeditionRouterOptions>;

  constructor(private nav: RouterNav, options: ExpeditionRouterOptions = {}) {
    this.opts = {
      spacing: 192,
      minSpacing: 48,
      maxPending: 128,
      endpointNodes: 7000,
      latticeNodes: 2200,
      connectionLimit: [9000, 1800],
      attemptLimit: [90000, 18000],
      budgetReserve: 3,
      workPerUpdate: 256,
      priorityTurns: 3,
      cacheCap: 16000,
      ...options,
    };
  }

  /** Requests still planning whose owner still wants them. */
  get pending(): number {
    return this.requests.filter((s) => s.ticket.state === 'planning' && s.isCurrent()).length;
  }

  /** Cached edge count (diagnostics). */
  get cacheSize(): number {
    return this.edges.size;
  }

  /**
   * Start planning a route. The returned ticket updates in place as `update` runs. `isCurrent`
   * lets the owner abandon the request implicitly (e.g. when its order changes).
   */
  request(start: RoutePoint, goal: RoutePoint, priority = false, isCurrent: () => boolean = () => true): RouteTicket {
    this.syncRevision();
    const ticket: RouteTicket = { state: 'planning', points: [], reason: 'Planning a terrain route', revision: this.nav.revision, expanded: 0, connections: 0 };
    if (this.pending >= this.opts.maxPending) {
      ticket.state = 'blocked';
      ticket.reason = 'Route planner busy; waiting to retry';
      return ticket;
    }
    this.requests.push(this.search(ticket, start, goal, this.opts.spacing, priority, isCurrent));
    return ticket;
  }

  cancel(ticket: RouteTicket | null): void {
    if (ticket?.state === 'planning') ticket.state = 'cancelled';
  }

  /** Advance pending searches; runs at most once per distinct `time` (pass the sim tick or time). */
  update(time: number): void {
    this.syncRevision();
    if (time === this.lastTime) return;
    this.lastTime = time;
    this.requests = this.requests.filter((s) => {
      if (!s.isCurrent()) s.ticket.state = 'cancelled';
      return s.ticket.state === 'planning';
    });
    const priority = this.requests.filter((s) => s.priority), ordinary = this.requests.filter((s) => !s.priority);
    const turns = this.opts.priorityTurns + 1;
    let work = 0;
    while ((priority.length || ordinary.length) && this.nav.budget > this.opts.budgetReserve && work < this.opts.workPerUpdate) {
      const preferred = work++ % turns !== turns - 1;
      const group = priority.length && (preferred || !ordinary.length) ? priority : ordinary;
      const cursor = group === priority ? this.priorityCursor++ : this.ordinaryCursor++;
      const index = cursor % group.length, search = group[index];
      this.advance(search);
      if (search.ticket.state !== 'planning') group.splice(index, 1);
    }
  }

  private search(ticket: RouteTicket, start: RoutePoint, goal: RoutePoint, spacing: number, priority: boolean, isCurrent: () => boolean): Search {
    const first: Node = { id: START, point: { ...start }, g: 0, parent: null, edge: [] };
    const open = new StableHeap();
    open.push(START, 0);
    return {
      ticket, start, goal, spacing, width: Math.ceil(this.nav.size / spacing), nodes: new Map([[START, first]]), closed: new Set(), open,
      current: null, neighbours: [], edgeIndex: 0, attempts: 0, priority, isCurrent,
    };
  }

  private syncRevision(): void {
    if (this.revision === this.nav.revision) return;
    this.revision = this.nav.revision;
    this.points.clear();
    this.edges.clear();
    for (const s of this.requests) {
      s.ticket.state = 'cancelled';
      s.ticket.reason = 'Terrain obstacles changed';
    }
    this.requests = [];
    this.priorityCursor = 0;
    this.ordinaryCursor = 0;
  }

  private point(s: Search, id: number): RoutePoint | null {
    if (id === START) return s.start;
    if (id === GOAL) return s.goal;
    const key = `${s.spacing}:${id}`;
    if (this.points.has(key)) return this.points.get(key)!;
    const half = this.nav.size / 2;
    const x = -half + ((id % s.width) + 0.5) * s.spacing, z = -half + (Math.floor(id / s.width) + 0.5) * s.spacing;
    let result: RoutePoint | null = null;
    if (this.nav.inBounds(x, z)) {
      const p = this.nav.nearestWalkable(x, z);
      if (this.nav.walkable(p.x, p.z)) result = p;
    }
    if (this.points.size >= this.opts.cacheCap) this.points.delete(this.points.keys().next().value!);
    this.points.set(key, result);
    return result;
  }

  private adjacent(s: Search, node: Node): number[] {
    const half = this.nav.size / 2;
    const x = node.id >= 0 ? node.id % s.width : Math.floor((node.point.x + half) / s.spacing);
    const z = node.id >= 0 ? Math.floor(node.id / s.width) : Math.floor((node.point.z + half) / s.spacing);
    const out: number[] = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, nz = z + dz;
        if (nx >= 0 && nz >= 0 && nx < s.width && nz < s.width && nz * s.width + nx !== node.id) out.push(nz * s.width + nx);
      }
    }
    if (Math.hypot(node.point.x - s.goal.x, node.point.z - s.goal.z) <= s.spacing * 2) out.unshift(GOAL);
    return out;
  }

  private connection(s: Search, from: Node, id: number, to: RoutePoint): Edge | null {
    const cacheable = from.id >= 0 && id >= 0;
    const reverse = from.id > id, key = `${s.spacing}:${Math.min(from.id, id)}:${Math.max(from.id, id)}`;
    if (cacheable && this.edges.has(key)) {
      const edge = this.edges.get(key);
      if (!edge) return null;
      if (!reverse) return edge;
      return { length: edge.length, points: [...edge.points.slice(0, -1).reverse(), { ...to }] };
    }
    const path = this.nav.findPath(from.point.x, from.point.z, to.x, to.z, from.id < 0 || id < 0 ? this.opts.endpointNodes : this.opts.latticeNodes);
    s.ticket.connections++;
    if (!path || !this.nav.lastPathComplete) {
      if (cacheable) this.cache(key, null);
      return null;
    }
    const points = path.map((p) => ({ x: p.x, z: p.y }));
    let length = 0, previous = from.point;
    for (const p of points) {
      length += Math.hypot(p.x - previous.x, p.z - previous.z);
      previous = p;
    }
    const edge = { points, length };
    if (cacheable) this.cache(key, reverse ? { length, points: [...points.slice(0, -1).reverse(), { ...from.point }] } : edge);
    return edge;
  }

  private cache(key: string, edge: Edge | null): void {
    if (this.edges.size >= this.opts.cacheCap) this.edges.delete(this.edges.keys().next().value!);
    this.edges.set(key, edge);
  }

  private advance(s: Search): void {
    const which = s.priority ? 0 : 1;
    const connectionLimit = this.opts.connectionLimit[which], attemptLimit = this.opts.attemptLimit[which];
    if (!s.current || s.edgeIndex >= s.neighbours.length) {
      s.current = null;
      while (s.open.size) {
        const id = s.open.pop();
        if (s.closed.has(id)) continue;
        const node = s.nodes.get(id)!;
        if (id === GOAL) {
          this.finish(s, node);
          return;
        }
        s.closed.add(id);
        s.ticket.expanded++;
        s.current = node;
        s.neighbours = this.adjacent(s, node);
        s.edgeIndex = 0;
        break;
      }
      if (!s.current || s.ticket.connections >= connectionLimit || s.attempts >= attemptLimit) {
        if (!s.current && s.spacing > this.opts.minSpacing && s.ticket.connections < connectionLimit) {
          Object.assign(s, this.search(s.ticket, s.start, s.goal, s.spacing / 2, s.priority, s.isCurrent));
          s.ticket.reason = 'Checking narrower terrain passages';
          return;
        }
        s.ticket.state = 'blocked';
        s.ticket.reason = s.current ? 'Route search limit reached; try a waypoint or retry' : 'No terrain route found; try another waypoint';
        return;
      }
    }
    s.attempts++;
    const from = s.current, id = s.neighbours[s.edgeIndex++];
    if (s.closed.has(id)) return;
    const to = this.point(s, id);
    if (!to) return;
    const edge = this.connection(s, from, id, to);
    if (!edge) return;
    const g = from.g + edge.length, previous = s.nodes.get(id);
    if (!previous || g < previous.g) {
      s.nodes.set(id, { id, point: to, g, parent: from.id, edge: edge.points });
      s.open.push(id, g + Math.hypot(to.x - s.goal.x, to.z - s.goal.z));
    }
  }

  private finish(s: Search, node: Node): void {
    const edges: RoutePoint[][] = [];
    let current: Node | undefined = node;
    while (current?.parent != null) {
      edges.push(current.edge);
      current = s.nodes.get(current.parent);
    }
    s.ticket.points = edges.reverse().flat();
    s.ticket.state = 'ready';
    s.ticket.reason = null;
  }
}

/** Stable binary heap: equal priorities pop in insertion order, keeping choices deterministic. */
class StableHeap {
  private data: { id: number; priority: number; sequence: number }[] = [];
  private sequence = 0;

  get size(): number {
    return this.data.length;
  }

  push(id: number, priority: number): void {
    this.data.push({ id, priority, sequence: this.sequence++ });
    let i = this.data.length - 1;
    while (i) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      [this.data[i], this.data[p]] = [this.data[p], this.data[i]];
      i = p;
    }
  }

  pop(): number {
    const first = this.data[0], last = this.data.pop()!;
    if (this.data.length) {
      this.data[0] = last;
      let i = 0;
      for (;;) {
        let m = i;
        const a = i * 2 + 1, b = a + 1;
        if (a < this.data.length && this.less(a, m)) m = a;
        if (b < this.data.length && this.less(b, m)) m = b;
        if (m === i) break;
        [this.data[i], this.data[m]] = [this.data[m], this.data[i]];
        i = m;
      }
    }
    return first.id;
  }

  private less(a: number, b: number): boolean {
    const x = this.data[a], y = this.data[b];
    return x.priority < y.priority || (x.priority === y.priority && x.sequence < y.sequence);
  }
}

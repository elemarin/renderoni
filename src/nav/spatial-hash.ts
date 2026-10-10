/**
 * Renderoni Spatial Hash
 *
 * Uniform grid over item positions on the x/z plane, rebuilt once per step; makes radius
 * queries O(k). Items only need a `position` with `x` and `z` (a THREE.Vector3 works).
 * Iteration order is the rebuild order within a cell and row-major (z, then x) across cells,
 * so queries are deterministic for a deterministic rebuild order.
 */

export interface Positioned {
  position: { x: number; z: number };
}

export class SpatialHash<T extends Positioned> {
  private cells = new Map<number, T[]>();
  private spare: T[][] = [];

  constructor(public readonly cell = 16) {}

  private key(cx: number, cz: number): number {
    return (cx + 32768) * 65536 + (cz + 32768);
  }

  /** Replace the contents with `items`. Bucket arrays are reused across rebuilds. */
  rebuild(items: Iterable<T>): void {
    for (const arr of this.cells.values()) {
      arr.length = 0;
      this.spare.push(arr);
    }
    this.cells.clear();
    for (const item of items) {
      const k = this.key(Math.floor(item.position.x / this.cell), Math.floor(item.position.z / this.cell));
      let arr = this.cells.get(k);
      if (!arr) {
        arr = this.spare.pop() ?? [];
        this.cells.set(k, arr);
      }
      arr.push(item);
    }
  }

  /** Visit every item in the cells overlapping the square of half-side `r` around (x, z); may include items slightly beyond `r`. */
  each(x: number, z: number, r: number, fn: (item: T) => void): void {
    const c0x = Math.floor((x - r) / this.cell), c1x = Math.floor((x + r) / this.cell);
    const c0z = Math.floor((z - r) / this.cell), c1z = Math.floor((z + r) / this.cell);
    for (let cz = c0z; cz <= c1z; cz++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const arr = this.cells.get(this.key(cx, cz));
        if (!arr) continue;
        for (const item of arr) fn(item);
      }
    }
  }

  /** Collect the items within exactly `r` of (x, z) into `out` (cleared first) and return it. */
  within(x: number, z: number, r: number, out: T[] = []): T[] {
    out.length = 0;
    const r2 = r * r;
    this.each(x, z, r, (item) => {
      const dx = item.position.x - x, dz = item.position.z - z;
      if (dx * dx + dz * dz <= r2) out.push(item);
    });
    return out;
  }
}

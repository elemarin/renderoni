import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { createRenderoni, type RenderoniEngine, type RenderoniConfig } from '../../src/index.js';
import { body, mesh, model, sensor } from '../../src/presets/index.js';

/**
 * Lifecycle and leak gate.
 *
 * A long play session is thousands of spawn/despawn cycles. This gate keeps the
 * cheap, high-signal invariants in CI: the world returns to its starting size,
 * init can be called again, overlap bookkeeping closes out, a throwing listener
 * cannot strand resources, ownership refcounts survive any removal order, and
 * canonical state follows native moves.
 */

interface Baseline {
  bodies: number;
  colliders: number;
  sceneChildren: number;
  trackedEntities: number;
}

function snapshot(game: RenderoniEngine): Baseline {
  return {
    bodies: game.native.world.bodies.len(),
    colliders: game.native.world.colliders.len(),
    sceneChildren: game.native.scene.children.length,
    trackedEntities: game.ownership.entityCount,
  };
}

describe('Lifecycle gate: baseline and repeated init', () => {
  it('returns bodies, colliders, scene children and slots to baseline after repeated cycles', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 101 });
    const baseline = snapshot(game);
    let peakSlot = -1;

    for (let cycle = 0; cycle < 3; cycle++) {
      const ids: string[] = [];
      for (let i = 0; i < 10; i++) {
        ids.push(game.add(body({ id: `crate_${cycle}_${i}`, type: 'dynamic', position: [i, 5, 0] })).id);
        ids.push(game.add(sensor({ id: `zone_${cycle}_${i}`, size: [2, 2, 2], position: [i, 1, 0] })).id);
        ids.push(
          game.add(mesh({ id: `prop_${cycle}_${i}`, geometry: 'box', physics: 'static', position: [i, 0, 3] })).id
        );
      }

      game.step(20);
      expect(snapshot(game).bodies).toBeGreaterThan(baseline.bodies);
      for (const id of ids) {
        const slot = game.entities.get(id)?.slot;
        if (slot !== undefined) peakSlot = Math.max(peakSlot, slot);
      }

      for (const id of ids) game.remove(id);

      expect(snapshot(game)).toEqual(baseline);
      expect(game.entities.list()).toHaveLength(0);
      for (const id of ids) expect(game.transformPipeline.hasSlot(id)).toBe(false);
      expect(game.physics.getActiveContacts()).toHaveLength(0);
      expect(game.physics.getActiveSensorOverlaps()).toHaveLength(0);
    }

    // Slots are recycled, so three cycles never push the canonical buffer past
    // the high-water mark of a single cycle.
    expect(peakSlot).toBeLessThan(30);
    const recycled = game.add(body({ id: 'recycled', type: 'dynamic', position: [0, 4, 0] }));
    expect(recycled.slot).toBeLessThanOrEqual(peakSlot);

    game.dispose();
  });

  it('keeps a second init a no-op instead of rebuilding the world', async () => {
    let subsystemRuns = 0;
    const config: RenderoniConfig = {
      mode: 'headless',
      seed: 102,
      subsystems: [() => { subsystemRuns++; }],
    };

    const game = await createRenderoni(config);
    const world = game.native.world;
    const crate = game.add(body({ id: 'crate', type: 'dynamic', position: [0, 3, 0] }));
    const bodies = world.bodies.len();

    await game.init();
    await game.init(config);

    expect(subsystemRuns).toBe(1);
    expect(game.native.world).toBe(world);
    expect(game.native.world.bodies.len()).toBe(bodies);
    expect(game.physics.getBodyByEntity('crate')).toBe(crate.native.rapier!.body);
    expect(game.diagnostics.getRecords().filter((record) => record.code === 'RND_0402')).toHaveLength(2);

    game.step(5);
    expect(game.entities.get('crate')!.position[1]).toBeLessThan(3);
    game.dispose();
  });
});

describe('Lifecycle gate: overlap exit and throwing listeners', () => {
  it('synthesizes a sensor exit when an overlapping entity is destroyed, exactly once', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 103 });
    const exits: string[] = [];
    game.events.on('sensor.exit', (payload) => exits.push(`${payload.sensor.id}->${payload.target.id}`));

    game.add(sensor({ id: 'zone', shape: 'box', size: [6, 8, 6], position: [0, 4, 0] }));
    const ball = game.add(
      body({ id: 'ball', shape: 'sphere', type: 'dynamic', radius: 0.5, position: [0, 6, 0] })
    );

    game.step(10);
    expect(game.entities.get('zone')!.state.overlappingCount).toBe(1);

    ball.destroy();

    expect(exits).toEqual(['zone->ball']);
    expect(game.physics.getActiveSensorOverlaps()).toHaveLength(0);
    expect(game.entities.get('zone')!.state.overlappingCount).toBe(0);

    game.step(10);
    expect(exits).toEqual(['zone->ball']);
    game.dispose();
  });

  it('finishes cleanup when a teardown listener throws', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 104 });
    let laterListenerRuns = 0;

    game.add(sensor({ id: 'zone', shape: 'box', size: [6, 8, 6], position: [0, 4, 0] }));
    const withZone = snapshot(game);
    game.add(body({ id: 'ball', shape: 'sphere', type: 'dynamic', radius: 0.5, position: [0, 6, 0] }));

    game.events.on('sensor.exit', () => {
      throw new Error('exit listener exploded');
    });
    game.events.on('sensor.exit', () => {
      laterListenerRuns++;
    });

    game.step(10);
    expect(game.entities.get('zone')!.state.overlappingCount).toBe(1);

    expect(() => game.remove('ball')).toThrow(AggregateError);

    // The failure is reported, and it stops nothing.
    expect(laterListenerRuns).toBe(1);
    expect(game.entities.has('ball')).toBe(false);
    expect(game.transformPipeline.hasSlot('ball')).toBe(false);
    expect(game.physics.getBodyByEntity('ball')).toBeUndefined();
    expect(game.entities.get('zone')!.state.overlappingCount).toBe(0);
    expect(snapshot(game)).toEqual(withZone);
    expect(
      game.diagnostics.getRecords().some((record) => record.code === 'RND_0407' && record.entityId === 'ball')
    ).toBe(true);

    expect(() => game.remove('ball')).not.toThrow();
    game.dispose();
  });
});

describe('Lifecycle gate: resource ownership order', () => {
  it('disposes engine-created resources once and never touches caller-provided ones', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 105 });

    const sharedGeometry = new THREE.BoxGeometry(1, 1, 1);
    const sharedMaterial = new THREE.MeshStandardMaterial({ color: 0x223344 });
    const borrowedGeometryDispose = vi.spyOn(sharedGeometry, 'dispose');
    const borrowedMaterialDispose = vi.spyOn(sharedMaterial, 'dispose');

    game.add(mesh({ id: 'wall', customGeometry: sharedGeometry, material: sharedMaterial }));
    const owned = game.add(mesh({ id: 'crate', geometry: 'box', color: 0x884422 }));
    const ownedObject = owned.native.three!.object as THREE.Mesh;
    const ownedGeometryDispose = vi.spyOn(ownedObject.geometry, 'dispose');
    const ownedMaterialDispose = vi.spyOn(ownedObject.material as THREE.Material, 'dispose');

    game.remove('wall');
    game.remove('crate');

    expect(borrowedGeometryDispose).not.toHaveBeenCalled();
    expect(borrowedMaterialDispose).not.toHaveBeenCalled();
    expect(ownedGeometryDispose).toHaveBeenCalledTimes(1);
    expect(ownedMaterialDispose).toHaveBeenCalledTimes(1);

    game.dispose();
    expect(borrowedGeometryDispose).not.toHaveBeenCalled();
    expect(ownedGeometryDispose).toHaveBeenCalledTimes(1);

    sharedGeometry.dispose();
    sharedMaterial.dispose();
  });

  it('refcounts shared resources so any removal order is safe', async () => {
    for (const order of [['a', 'b', 'c'], ['c', 'a', 'b'], ['b', 'c', 'a']]) {
      const game = await createRenderoni({ mode: 'headless', seed: 106 });
      const source = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0x00ff88 })
      );
      const geometryDispose = vi.spyOn(source.geometry, 'dispose');
      const materialDispose = vi.spyOn(source.material as THREE.Material, 'dispose');

      for (const id of ['a', 'b', 'c']) {
        game.add(model({ id: `clone_${id}`, object: source.clone() }));
      }
      expect(game.ownership.getOwnedRefCount(source.geometry)).toBe(3);

      for (const [index, id] of order.entries()) {
        game.remove(`clone_${id}`);
        const last = index === order.length - 1;
        expect(geometryDispose, `order ${order.join('')} after ${id}`).toHaveBeenCalledTimes(last ? 1 : 0);
        expect(materialDispose).toHaveBeenCalledTimes(last ? 1 : 0);
      }

      game.dispose();
      expect(geometryDispose).toHaveBeenCalledTimes(1);
    }
  });
});

describe('Lifecycle gate: canonical state follows native moves', () => {
  it('follows an invalidated fixed-body move without a stale-state report', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 107 });
    const platform = game.add(body({ id: 'platform', type: 'fixed', size: [4, 0.5, 4], position: [0, 1, 0] }));

    game.step(2);
    platform.native.rapier!.body!.setTranslation({ x: 0, y: 5, z: 0 }, true);
    game.physics.markDirty('platform');
    game.step(1);

    expect(game.transformPipeline.getPosition(platform.slot!)[1]).toBeCloseTo(5, 5);
    expect(game.diagnostics.getRecords().some((record) => record.code === 'RND_0408')).toBe(false);
    game.dispose();
  });

  it('repairs and reports an uninvalidated fixed-body move before it can be hashed', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 108 });
    const platform = game.add(body({ id: 'platform', type: 'fixed', size: [4, 0.5, 4], position: [0, 1, 0] }));

    game.step(2);
    const before = game.getStateHash();

    platform.native.rapier!.body!.setTranslation({ x: 0, y: 9, z: 0 }, true);
    game.step(1);
    const after = game.getStateHash();

    expect(after).not.toBe(before);
    expect(game.transformPipeline.getPosition(platform.slot!)[1]).toBeCloseTo(9, 5);
    expect(
      game.diagnostics
        .getRecords()
        .some((record) => record.code === 'RND_0408' && record.entityId === 'platform')
    ).toBe(true);
    expect(game.getStateHash()).toBe(after);
    game.dispose();
  });
});

describe('Lifecycle gate: deep suite stays in CI', () => {
  it('keeps the full lifecycle scenarios wired into the default test run', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const suite = readFileSync(resolve(here, '../core_lifecycle.test.ts'), 'utf8');
    const vitestConfig = readFileSync(resolve(here, '../../vitest.config.ts'), 'utf8');

    for (const scenario of [
      'returns bodies, colliders, scene children, slots and records to baseline',
      'keeps init idempotent without replacing the world or rerunning subsystems',
      'rolls back partial resources when a factory fails mid-creation',
      'synthesizes sensor.exit when an overlapping entity is destroyed',
      'finishes removal when teardown listeners throw',
      'disposes a mixed owned/borrowed resource after the owner leaves first',
      'never hashes stale canonical state after an uninvalidated native move',
    ]) {
      expect(suite, `tests/core_lifecycle.test.ts must keep: ${scenario}`).toContain(scenario);
    }

    expect(vitestConfig).toContain("'tests/**/*.test.ts'");
  });
});

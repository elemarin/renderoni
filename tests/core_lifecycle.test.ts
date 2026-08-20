import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Type } from '@sinclair/typebox';
import { createRenderoni, RenderoniEngine, type RenderoniConfig } from '../src/index.js';
import { body, sensor, mesh, model, definePreset, type EntityContext } from '../src/presets/index.js';

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

const TrapSchema = Type.Object({});

/** Preset that hardcodes its id inside ctx.entity(), bypassing options.id. */
const idTrap = definePreset({
  name: 'test.idTrap',
  version: 1,
  schema: TrapSchema,
  create(ctx: EntityContext) {
    const rigidBody = ctx.native.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 2, 0)
    );
    const collider = ctx.native.world.createCollider(RAPIER.ColliderDesc.ball(0.5), rigidBody);
    const object = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 6, 6),
      new THREE.MeshStandardMaterial({ color: 0x445566 })
    );

    return ctx.entity({
      id: 'trapped',
      tags: ['trap'],
      native: {
        three: { object, ownership: 'owned' },
        rapier: {
          body: rigidBody,
          colliders: [collider],
          colliderHandles: [collider.handle],
          ownership: 'owned',
        },
      },
    });
  },
});

describe('Lifecycle: leaks and cleanup', () => {
  it('returns bodies, colliders, scene children, slots and records to baseline', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 11 });
    const baseline = snapshot(game);

    const ids: string[] = [];
    for (let i = 0; i < 12; i++) {
      ids.push(game.add(body({ id: `crate_${i}`, type: 'dynamic', position: [i, 4, 0] })).id);
      ids.push(game.add(sensor({ id: `zone_${i}`, size: [2, 2, 2], position: [i, 1, 0] })).id);
      ids.push(
        game.add(mesh({ id: `prop_${i}`, geometry: 'box', physics: 'static', position: [i, 0, 3] })).id
      );
    }
    game.add(body({ id: 'floor', type: 'fixed', size: [40, 1, 40], position: [0, 0, 0] }));
    ids.push('floor');

    game.step(30);

    const loaded = snapshot(game);
    expect(loaded.bodies).toBeGreaterThan(baseline.bodies + 30);
    expect(loaded.colliders).toBeGreaterThan(baseline.colliders + 30);

    const slots = ids
      .map((id) => game.entities.get(id)?.slot)
      .filter((slot): slot is number => slot !== undefined);
    expect(slots.length).toBe(ids.length);

    for (const id of ids) game.remove(id);

    expect(snapshot(game)).toEqual(baseline);
    expect(game.entities.list()).toHaveLength(0);
    for (const id of ids) expect(game.transformPipeline.hasSlot(id)).toBe(false);
    expect(game.physics.getActiveContacts()).toHaveLength(0);
    expect(game.physics.getActiveSensorOverlaps()).toHaveLength(0);

    // Released slots are recycled instead of growing the canonical buffer.
    const recycled = game.add(body({ id: 'recycled', type: 'dynamic', position: [0, 6, 0] }));
    expect(recycled.slot).toBeLessThan(slots.length);

    game.remove('recycled');
    expect(snapshot(game)).toEqual(baseline);
    game.dispose();
  });

  it('tracks collider-only entities from their actual colliders', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 12 });
    const baseline = snapshot(game);

    const collider = game.native.world.createCollider(RAPIER.ColliderDesc.cuboid(1, 1, 1));
    game.add({
      id: 'free_trigger',
      tags: ['trigger'],
      native: { rapier: { colliders: [collider], ownership: 'owned' } },
    });

    expect(game.native.world.colliders.len()).toBe(baseline.colliders + 1);
    expect(game.physics.getEntityByColliderHandle(collider.handle)).toBe('free_trigger');

    game.remove('free_trigger');

    expect(game.native.world.colliders.len()).toBe(baseline.colliders);
    expect(game.physics.getEntityByColliderHandle(collider.handle)).toBeUndefined();
    game.dispose();
  });

  it('keeps init idempotent without replacing the world or rerunning subsystems', async () => {
    let subsystemRuns = 0;
    const config: RenderoniConfig = {
      mode: 'headless',
      seed: 13,
      subsystems: [
        (engine) => {
          subsystemRuns++;
          engine.actions.register({ name: 'test.noop', handle: () => {} });
        },
      ],
    };

    const game = await createRenderoni(config);
    const world = game.native.world;
    const crate = game.add(body({ id: 'crate', type: 'dynamic', position: [0, 3, 0] }));
    const bodiesAfterAdd = world.bodies.len();

    await game.init();
    await game.init(config);

    expect(subsystemRuns).toBe(1);
    expect(game.native.world).toBe(world);
    expect(game.native.world.bodies.len()).toBe(bodiesAfterAdd);
    expect(game.physics.getBodyByEntity('crate')).toBe(crate.native.rapier!.body);
    expect(game.diagnostics.getRecords().filter((r) => r.code === 'RND_0402')).toHaveLength(2);

    game.step(5);
    expect(game.entities.get('crate')?.position[1]).toBeLessThan(3);
    game.dispose();
  });

  it('rejects duplicate ids from factories without leaking native resources', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 14 });

    const first = game.add(idTrap({}));
    const afterFirst = snapshot(game);

    expect(() => game.add(idTrap({}))).toThrow(/RND_0401: entity id already exists: "trapped"/);

    expect(snapshot(game)).toEqual(afterFirst);
    expect(game.entities.get('trapped')).toBe(first);
    expect(game.diagnostics.getRecords().some((r) => r.code === 'RND_0401')).toBe(true);

    // The surviving entity keeps simulating with its own resources intact.
    game.step(5);
    expect(first.position[1]).toBeLessThan(2);

    game.remove('trapped');
    expect(game.native.world.bodies.len()).toBe(afterFirst.bodies - 1);
    game.dispose();
  });

  it('skips duplicate queued spawns and reports them without breaking the tick', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 15 });
    const survivor = game.add(body({ id: 'queued', type: 'dynamic', position: [0, 4, 0] }));

    game.commands.spawn('queued', ['duplicate']);
    game.commands.spawn('fresh', ['ok']);
    game.step(2);

    expect(game.entities.get('queued')).toBe(survivor);
    expect(game.entities.get('fresh')?.tags.has('ok')).toBe(true);
    expect(game.tick).toBe(2);
    expect(
      game.diagnostics.getRecords().some((r) => r.code === 'RND_0404' && r.entityId === 'queued')
    ).toBe(true);
    game.dispose();
  });

  it('rolls back partial resources when a factory fails mid-creation', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 16 });
    const baseline = snapshot(game);

    expect(() =>
      game.add((ctx: EntityContext) => {
        const rigidBody = ctx.native.world.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 2, 0)
        );
        const collider = ctx.native.world.createCollider(RAPIER.ColliderDesc.ball(0.5), rigidBody);
        const object = new THREE.Mesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshStandardMaterial()
        );
        ctx.entity({
          id: 'half_built',
          native: {
            three: { object, ownership: 'owned' },
            rapier: { body: rigidBody, colliders: [collider], ownership: 'owned' },
          },
        });
        throw new Error('factory exploded');
      })
    ).toThrow('factory exploded');

    expect(snapshot(game)).toEqual(baseline);
    expect(game.entities.has('half_built')).toBe(false);
    expect(game.transformPipeline.hasSlot('half_built')).toBe(false);

    // The rejected id is free again.
    expect(game.add({ id: 'half_built' }).id).toBe('half_built');
    game.dispose();
  });
});

describe('Lifecycle: resource ownership', () => {
  it('never disposes caller-provided geometry and materials', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 21 });

    const sharedGeometry = new THREE.BoxGeometry(1, 1, 1);
    const sharedMaterial = new THREE.MeshStandardMaterial({ color: 0x223344 });
    const geometryDispose = vi.spyOn(sharedGeometry, 'dispose');
    const materialDispose = vi.spyOn(sharedMaterial, 'dispose');

    game.add(
      mesh({ id: 'wall_a', customGeometry: sharedGeometry, material: sharedMaterial, position: [0, 0, 0] })
    );
    game.add(
      mesh({ id: 'wall_b', customGeometry: sharedGeometry, material: sharedMaterial, position: [2, 0, 0] })
    );

    game.remove('wall_a');
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();

    // The surviving wall still renders with the shared resources.
    const survivor = game.entities.get('wall_b')!.native.three!.object as THREE.Mesh;
    expect(survivor.geometry).toBe(sharedGeometry);
    expect(survivor.material).toBe(sharedMaterial);

    game.remove('wall_b');
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();

    game.dispose();
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();

    sharedGeometry.dispose();
    sharedMaterial.dispose();
  });

  it('disposes engine-created resources exactly once', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 22 });

    const crate = game.add(mesh({ id: 'crate', geometry: 'box', color: 0x884422 }));
    const object = crate.native.three!.object as THREE.Mesh;
    const geometryDispose = vi.spyOn(object.geometry, 'dispose');
    const materialDispose = vi.spyOn(object.material as THREE.Material, 'dispose');

    game.remove('crate');

    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    game.dispose();
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });

  it('refcounts resources shared by clones so one removal never breaks the others', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 23 });

    const source = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x00ff88 })
    );
    const geometryDispose = vi.spyOn(source.geometry, 'dispose');
    const materialDispose = vi.spyOn(source.material as THREE.Material, 'dispose');

    // Three.js clones share geometry and material instances.
    game.add(model({ id: 'clone_a', object: source.clone(), position: [0, 0, 0] }));
    game.add(model({ id: 'clone_b', object: source.clone(), position: [2, 0, 0] }));
    game.add(model({ id: 'clone_c', object: source.clone(), position: [4, 0, 0] }));

    expect(game.ownership.getOwnedRefCount(source.geometry)).toBe(3);

    game.remove('clone_a');
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();

    game.remove('clone_b');
    expect(geometryDispose).not.toHaveBeenCalled();

    game.remove('clone_c');
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);

    game.dispose();
    expect(geometryDispose).toHaveBeenCalledTimes(1);
  });

  it('leaves borrowed model objects alone while still freeing their physics', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 24 });
    const baseline = snapshot(game);

    const reusable = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 6, 6),
      new THREE.MeshStandardMaterial({ color: 0xff00ff })
    );
    const geometryDispose = vi.spyOn(reusable.geometry, 'dispose');

    game.add(
      model({ id: 'borrowed', object: reusable, ownership: 'borrowed', physics: 'static', position: [0, 1, 0] })
    );
    expect(game.native.world.bodies.len()).toBe(baseline.bodies + 1);

    game.remove('borrowed');

    expect(geometryDispose).not.toHaveBeenCalled();
    expect(snapshot(game)).toEqual(baseline);
    game.dispose();
    reusable.geometry.dispose();
  });

  it('disposes a mixed owned/borrowed resource after the owner leaves first', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 25 });

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0x123456 });
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');

    // Engine-owned object graph and a caller-provided reference to the same
    // geometry and material.
    game.add(model({ id: 'owner', object: new THREE.Mesh(geometry, material) }));
    game.add(mesh({ id: 'borrower', customGeometry: geometry, material, position: [2, 0, 0] }));

    expect(game.ownership.getOwnedRefCount(geometry)).toBe(1);

    game.remove('owner');
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
    expect(game.ownership.isDisposalPending(geometry)).toBe(true);
    expect(game.ownership.isDisposalPending(material)).toBe(true);

    game.remove('borrower');
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(game.ownership.isDisposalPending(geometry)).toBe(false);

    game.dispose();
    expect(geometryDispose).toHaveBeenCalledTimes(1);
  });

  it('disposes a mixed owned/borrowed resource after the owner when the borrower leaves first', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 26 });

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0x654321 });
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');

    game.add(model({ id: 'owner', object: new THREE.Mesh(geometry, material) }));
    game.add(mesh({ id: 'borrower', customGeometry: geometry, material, position: [2, 0, 0] }));

    game.remove('borrower');
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(game.ownership.isDisposalPending(geometry)).toBe(false);
    expect(game.ownership.getOwnedRefCount(geometry)).toBe(1);

    game.remove('owner');
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);

    game.dispose();
    expect(geometryDispose).toHaveBeenCalledTimes(1);
  });
});

describe('Lifecycle: texture ownership', () => {
  it('never disposes textures reachable from a caller-provided material', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 61 });

    const texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map: texture });
    const textureDispose = vi.spyOn(texture, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');

    game.add(mesh({ id: 'wall_a', material, position: [0, 0, 0] }));
    game.add(mesh({ id: 'wall_b', material, position: [2, 0, 0] }));

    // Attached after registration: the caller still owns it.
    const lateTexture = new THREE.Texture();
    material.emissiveMap = lateTexture;
    const lateDispose = vi.spyOn(lateTexture, 'dispose');

    game.remove('wall_a');
    expect(textureDispose).not.toHaveBeenCalled();
    expect(lateDispose).not.toHaveBeenCalled();

    game.remove('wall_b');
    expect(textureDispose).not.toHaveBeenCalled();
    expect(lateDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();

    game.dispose();
    expect(textureDispose).not.toHaveBeenCalled();
    expect(lateDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();

    texture.dispose();
    lateTexture.dispose();
    material.dispose();
  });

  it('keeps caller textures when the borrowed material is removed in either order', async () => {
    const texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map: texture });
    const textureDispose = vi.spyOn(texture, 'dispose');

    for (const order of [
      ['first', 'second'],
      ['second', 'first'],
    ]) {
      const game = await createRenderoni({ mode: 'headless', seed: 62 });
      game.add(mesh({ id: 'first', material, position: [0, 0, 0] }));
      game.add(mesh({ id: 'second', customGeometry: new THREE.BoxGeometry(1, 1, 1), material }));

      for (const id of order) {
        game.remove(id);
        expect(textureDispose).not.toHaveBeenCalled();
      }

      game.dispose();
      expect(textureDispose).not.toHaveBeenCalled();
    }

    texture.dispose();
    material.dispose();
  });

  it('disposes textures attached to an engine-owned material after registration', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 63 });

    const crate = game.add(mesh({ id: 'crate', geometry: 'box' }));
    const material = (crate.native.three!.object as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const texture = new THREE.Texture();
    material.map = texture;
    const textureDispose = vi.spyOn(texture, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');

    game.remove('crate');

    expect(textureDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);

    game.dispose();
    expect(textureDispose).toHaveBeenCalledTimes(1);
  });

  it('refcounts a late-attached texture shared by two owned materials in either order', async () => {
    for (const order of [
      ['a', 'b'],
      ['b', 'a'],
    ]) {
      const game = await createRenderoni({ mode: 'headless', seed: 64 });
      const first = game.add(mesh({ id: 'a', geometry: 'box' }));
      const second = game.add(mesh({ id: 'b', geometry: 'box', position: [2, 0, 0] }));

      const texture = new THREE.Texture();
      const textureDispose = vi.spyOn(texture, 'dispose');
      for (const entity of [first, second]) {
        const material = (entity.native.three!.object as THREE.Mesh).material as THREE.MeshStandardMaterial;
        material.map = texture;
      }

      game.remove(order[0]);
      expect(textureDispose).not.toHaveBeenCalled();
      expect(game.ownership.getOwnedRefCount(texture)).toBe(1);

      game.remove(order[1]);
      expect(textureDispose).toHaveBeenCalledTimes(1);

      game.dispose();
      expect(textureDispose).toHaveBeenCalledTimes(1);
    }
  });
});

describe('Lifecycle: failing resource disposal', () => {
  it('reports throwing geometry, material and texture disposal without stranding cleanup', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 65 });
    const baseline = snapshot(game);

    const crate = game.add(mesh({ id: 'crate', geometry: 'box', physics: 'static' }));
    const object = crate.native.three!.object as THREE.Mesh;
    const material = object.material as THREE.MeshStandardMaterial;
    const texture = new THREE.Texture();
    material.map = texture;

    vi.spyOn(object.geometry, 'dispose').mockImplementation(() => {
      throw new Error('geometry dispose exploded');
    });
    vi.spyOn(texture, 'dispose').mockImplementation(() => {
      throw new Error('texture dispose exploded');
    });
    const materialDispose = vi.spyOn(material, 'dispose');

    let thrown: unknown;
    try {
      game.remove('crate');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AggregateError);
    expect((thrown as AggregateError).errors).toHaveLength(2);
    expect((thrown as Error).message).toMatch(/RND_0409/);

    // Cleanup and bookkeeping still finished for everything else.
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(game.entities.has('crate')).toBe(false);
    expect(game.ownership.entityCount).toBe(0);
    expect(game.transformPipeline.hasSlot('crate')).toBe(false);
    expect(snapshot(game)).toEqual(baseline);
    expect(
      game.diagnostics.getRecords().some((r) => r.code === 'RND_0409' && r.entityId === 'crate')
    ).toBe(true);

    game.dispose();
  });

  it('reports throwing disposal during engine dispose and still frees the world', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 66 });
    const scene = game.native.scene;

    const crate = game.add(mesh({ id: 'crate', geometry: 'box', physics: 'static' }));
    const object = crate.native.three!.object as THREE.Mesh;
    vi.spyOn(object.material as THREE.Material, 'dispose').mockImplementation(() => {
      throw new Error('material dispose exploded');
    });
    const geometryDispose = vi.spyOn(object.geometry, 'dispose');

    expect(() => game.dispose()).toThrow(AggregateError);

    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(game.disposed).toBe(true);
    expect(scene.children).toHaveLength(0);
    expect(game.physics.hasWorld).toBe(false);
    expect(game.ownership.entityCount).toBe(0);
    expect(game.diagnostics.getRecords().some((r) => r.code === 'RND_0409')).toBe(true);
    expect(game.diagnostics.getRecords().some((r) => r.code === 'RND_0406')).toBe(true);
    expect(() => game.dispose()).not.toThrow();
  });
});

describe('Lifecycle: overlap exits and destroy hooks', () => {
  it('synthesizes sensor.exit when an overlapping entity is destroyed', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 31 });
    let overlapping = 0;
    const exits: string[] = [];

    game.events.on('sensor.enter', () => overlapping++);
    game.events.on('sensor.exit', (payload) => {
      overlapping--;
      exits.push(`${payload.sensor.id}->${payload.target.id}`);
    });

    game.add(sensor({ id: 'zone', shape: 'box', size: [6, 8, 6], position: [0, 4, 0] }));
    const ball = game.add(
      body({ id: 'ball', shape: 'sphere', type: 'dynamic', radius: 0.5, position: [0, 6, 0] })
    );

    game.step(10);
    expect(overlapping).toBe(1);
    expect(game.physics.getActiveSensorOverlaps()).toHaveLength(1);
    expect(game.entities.get('zone')!.state.overlappingCount).toBe(1);

    ball.destroy();

    expect(overlapping).toBe(0);
    expect(exits).toEqual(['zone->ball']);
    expect(game.physics.getActiveSensorOverlaps()).toHaveLength(0);
    expect(game.entities.get('zone')!.state.overlappingCount).toBe(0);

    // No duplicate exit is replayed once the world keeps stepping.
    game.step(10);
    expect(exits).toEqual(['zone->ball']);
    expect(overlapping).toBe(0);
    game.dispose();
  });

  it('clears overlap counts for entities whose several colliders share a sensor', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 36 });
    let enters = 0;
    let exits = 0;
    game.events.on('sensor.enter', () => enters++);
    game.events.on('sensor.exit', () => exits++);

    game.add(sensor({ id: 'zone', shape: 'box', size: [8, 8, 8], position: [0, 4, 0] }));
    game.add((ctx: EntityContext) => {
      const rigidBody = ctx.native.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 4, 0)
      );
      const colliders = [-0.6, 0.6].map((offset) => {
        const desc = RAPIER.ColliderDesc.ball(0.4).setTranslation(offset, 0, 0);
        desc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
        desc.setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL);
        return ctx.native.world.createCollider(desc, rigidBody);
      });

      return ctx.entity({
        id: 'multi',
        native: { rapier: { body: rigidBody, colliders, ownership: 'owned' } },
      });
    });

    game.step(5);

    // Two collider overlaps collapse into one entity-pair transition.
    expect(enters).toBe(1);
    expect(game.physics.getActiveSensorOverlaps()).toHaveLength(1);
    expect(game.entities.get('zone')!.state.overlappingCount).toBe(1);

    game.remove('multi');

    expect(exits).toBe(1);
    expect(game.physics.getActiveSensorOverlaps()).toHaveLength(0);
    expect(game.entities.get('zone')!.state.overlappingCount).toBe(0);

    game.step(5);
    expect(game.entities.get('zone')!.state.overlappingCount).toBe(0);
    game.dispose();
  });

  it('finishes removal when teardown listeners throw', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 37 });
    const baseline = snapshot(game);
    let laterListenerRuns = 0;

    game.add(sensor({ id: 'zone', shape: 'box', size: [6, 8, 6], position: [0, 4, 0] }));
    const zoneBaseline = snapshot(game);
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
    expect(() => game.remove('ball')).not.toThrow();

    // A failing listener neither hides the event from the others nor stops cleanup.
    expect(laterListenerRuns).toBe(1);
    expect(game.entities.has('ball')).toBe(false);
    expect(game.transformPipeline.hasSlot('ball')).toBe(false);
    expect(game.physics.getBodyByEntity('ball')).toBeUndefined();
    expect(game.physics.getActiveSensorOverlaps()).toHaveLength(0);
    expect(game.entities.get('zone')!.state.overlappingCount).toBe(0);
    expect(snapshot(game)).toEqual(zoneBaseline);
    expect(
      game.diagnostics.getRecords().some((r) => r.code === 'RND_0407' && r.entityId === 'ball')
    ).toBe(true);

    game.remove('zone');
    expect(snapshot(game)).toEqual(baseline);
    game.dispose();
  });

  it('synthesizes contact.end for open contacts when an entity is removed', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 32 });
    const ended: string[] = [];
    game.events.on('contact.end', (payload) => ended.push(`${payload.a.id}|${payload.b.id}`));

    game.add(body({ id: 'floor', type: 'fixed', size: [20, 1, 20], position: [0, 0, 0] }));
    game.add(body({ id: 'crate', type: 'dynamic', size: [1, 1, 1], position: [0, 1.2, 0] }));

    game.step(90);
    expect(game.physics.getActiveContacts().map((c) => `${c.entityA}|${c.entityB}`)).toEqual([
      'crate|floor',
    ]);

    game.remove('crate');

    expect(ended).toEqual(['crate|floor']);
    expect(game.physics.getActiveContacts()).toHaveLength(0);
    game.dispose();
  });

  it('completes cleanup when an onDestroy hook throws', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 33 });
    const baseline = snapshot(game);

    const doomed = game.add((ctx: EntityContext) => {
      const rigidBody = ctx.native.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 3, 0)
      );
      const collider = ctx.native.world.createCollider(RAPIER.ColliderDesc.ball(0.5), rigidBody);
      const object = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 6, 6),
        new THREE.MeshStandardMaterial()
      );
      return ctx.entity({
        id: 'doomed',
        native: {
          three: { object, ownership: 'owned' },
          rapier: { body: rigidBody, colliders: [collider], ownership: 'owned' },
        },
        onDestroy: () => {
          throw new Error('hook exploded');
        },
      });
    });

    const geometryDispose = vi.spyOn(
      (doomed.native.three!.object as THREE.Mesh).geometry,
      'dispose'
    );

    expect(() => game.remove('doomed')).toThrow(/RND_0403/);

    expect(game.entities.has('doomed')).toBe(false);
    expect(game.transformPipeline.hasSlot('doomed')).toBe(false);
    expect(game.physics.getBodyByEntity('doomed')).toBeUndefined();
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(snapshot(game)).toEqual(baseline);
    expect(game.diagnostics.getRecords().some((r) => r.code === 'RND_0403')).toBe(true);

    game.dispose();
  });

  it('disposes every engine resource even when destroy hooks throw', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 34 });
    const scene = game.native.scene;

    const crate = game.add(body({ id: 'crate', type: 'dynamic', position: [0, 3, 0] }));
    const crateGeometryDispose = vi.spyOn(
      (crate.native.three!.object as THREE.Mesh).geometry,
      'dispose'
    );
    game.add({
      id: 'angry',
      onDestroy: () => {
        throw new Error('teardown exploded');
      },
    });
    game.systems.add({ update: () => {} });
    game.actions.register({ name: 'test.action', handle: () => {} });

    expect(() => game.dispose()).toThrow(AggregateError);

    expect(game.disposed).toBe(true);
    expect(game.entities.list()).toHaveLength(0);
    expect(scene.children).toHaveLength(0);
    expect(crateGeometryDispose).toHaveBeenCalledTimes(1);
    expect(game.physics.hasWorld).toBe(false);
    expect(game.physics.getBodyByEntity('crate')).toBeUndefined();
    expect(game.ownership.entityCount).toBe(0);
    expect(game.events.getRecentEvents()).toHaveLength(0);
    expect(game.diagnostics.getRecords().some((r) => r.code === 'RND_0406')).toBe(true);

    // A second dispose is a safe no-op.
    expect(() => game.dispose()).not.toThrow();
  });
});

describe('Lifecycle: disposed engines', () => {
  it('rejects simulation on a disposed engine and stays disposable', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 41 });
    game.add(body({ id: 'crate', type: 'dynamic', position: [0, 3, 0] }));
    game.actions.register({ name: 'test.action', handle: () => {} });
    game.step(2);

    game.dispose();

    expect(game.disposed).toBe(true);
    expect(() => game.step(1)).toThrow(/RND_0405/);
    expect(() => game.add(body({ id: 'later' }))).toThrow(/RND_0405/);
    expect(() => game.act({ name: 'test.action' })).toThrow(/RND_0405/);
    expect(() => game.remove('crate')).toThrow(/RND_0405/);
    await expect(game.init()).rejects.toThrow(/RND_0405/);
    expect(() => game.dispose()).not.toThrow();
    expect(game.entities.list()).toHaveLength(0);
  });

  it('drops action handler closures on dispose', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 42 });
    let handlerRuns = 0;
    game.actions.register({ name: 'test.count', handle: () => handlerRuns++ });

    game.act({ name: 'test.count' });
    game.step(1);
    expect(handlerRuns).toBe(1);

    game.dispose();

    game.actions.dispatch('test.count');
    game.actions.drain(game);
    expect(handlerRuns).toBe(1);
  });
});

describe('Lifecycle: canonical sync cost', () => {
  it('skips resting bodies while keeping canonical state exact', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 51 });
    const floor = game.add(body({ id: 'floor', type: 'fixed', size: [20, 1, 20], position: [0, 0, 0] }));
    const crate = game.add(body({ id: 'crate', type: 'dynamic', size: [1, 1, 1], position: [0, 4, 0] }));

    game.step(1);
    const afterFirst = game.physics.getSyncStats();
    expect(afterFirst.skipped).toBe(1); // the fixed floor is read once, then skipped
    expect(afterFirst.synced).toBe(1);

    game.step(400);
    const settled = game.physics.getSyncStats();
    expect(settled.skipped).toBe(2); // the crate fell asleep on the floor
    expect(settled.synced).toBe(0);

    const rapierBody = crate.native.rapier!.body!;
    expect(game.transformPipeline.getPosition(crate.slot!)[1]).toBeCloseTo(
      rapierBody.translation().y,
      6
    );
    expect(game.transformPipeline.getPosition(floor.slot!)[1]).toBeCloseTo(0, 6);
    expect(game.transformPipeline.getLinearVelocity(crate.slot!)[1]).toBeCloseTo(
      rapierBody.linvel().y,
      6
    );

    // Waking the body resumes syncing immediately.
    rapierBody.applyImpulse({ x: 0, y: 12, z: 0 }, true);
    game.step(2);
    expect(game.physics.getSyncStats().synced).toBeGreaterThanOrEqual(1);
    expect(game.transformPipeline.getPosition(crate.slot!)[1]).toBeCloseTo(
      rapierBody.translation().y,
      6
    );
    game.dispose();
  });

  it('keeps canonical state exact for kinematic bodies that move after resting', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 52 });
    const platform = game.add(
      body({ id: 'platform', type: 'kinematicPositionBased', size: [2, 0.5, 2], position: [0, 1, 0] })
    );

    game.step(300);
    const rapierBody = platform.native.rapier!.body!;
    expect(game.transformPipeline.getPosition(platform.slot!)[1]).toBeCloseTo(
      rapierBody.translation().y,
      6
    );

    rapierBody.setNextKinematicTranslation({ x: 0, y: 3, z: 0 });
    game.step(1);

    expect(rapierBody.translation().y).toBeCloseTo(3, 3);
    expect(game.transformPipeline.getPosition(platform.slot!)[1]).toBeCloseTo(
      rapierBody.translation().y,
      6
    );
    expect(platform.position[1]).toBeCloseTo(3, 3);
    game.dispose();
  });

  it('follows native fixed-body moves that use the invalidation contract', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 53 });
    const platform = game.add(
      body({ id: 'platform', type: 'fixed', size: [4, 0.5, 4], position: [0, 1, 0] })
    );

    game.step(2);
    expect(game.physics.getSyncStats().skipped).toBe(1);

    const rapierBody = platform.native.rapier!.body!;
    rapierBody.setTranslation({ x: 0, y: 5, z: 0 }, true);
    game.physics.markDirty('platform');
    game.step(1);

    expect(game.transformPipeline.getPosition(platform.slot!)[1]).toBeCloseTo(5, 5);
    expect(platform.position[1]).toBeCloseTo(5, 5);
    expect(
      game.diagnostics.getRecords().some((r) => r.code === 'RND_0408')
    ).toBe(false);
    game.dispose();
  });

  it('never hashes stale canonical state after an uninvalidated native move', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 54 });
    const platform = game.add(
      body({ id: 'platform', type: 'fixed', size: [4, 0.5, 4], position: [0, 1, 0] })
    );

    game.step(2);
    const before = game.getStateHash();

    // Native move without markDirty: the audit must repair and report it.
    platform.native.rapier!.body!.setTranslation({ x: 0, y: 9, z: 0 }, true);
    game.step(1);
    const after = game.getStateHash();

    expect(after).not.toBe(before);
    expect(game.transformPipeline.getPosition(platform.slot!)[1]).toBeCloseTo(9, 5);
    expect(platform.position[1]).toBeCloseTo(9, 5);
    expect(
      game.diagnostics.getRecords().some((r) => r.code === 'RND_0408' && r.entityId === 'platform')
    ).toBe(true);

    // Repaired state is stable and reported only while it is actually stale.
    const records = game.diagnostics.getRecords().filter((r) => r.code === 'RND_0408').length;
    expect(game.getStateHash()).toBe(after);
    expect(game.diagnostics.getRecords().filter((r) => r.code === 'RND_0408')).toHaveLength(records);
    game.dispose();
  });

  it('repairs stale canonical state during simulation without a hash call', async () => {
    const game = await createRenderoni({ mode: 'headless', seed: 55 });
    const platform = game.add(
      body({ id: 'platform', type: 'fixed', size: [4, 0.5, 4], position: [0, 1, 0] })
    );

    game.step(2);
    platform.native.rapier!.body!.setTranslation({ x: 0, y: 7, z: 0 }, true);
    game.step(60);

    expect(game.transformPipeline.getPosition(platform.slot!)[1]).toBeCloseTo(7, 5);
    expect(
      game.diagnostics.getRecords().some((r) => r.code === 'RND_0408' && r.entityId === 'platform')
    ).toBe(true);
    game.dispose();
  });
});

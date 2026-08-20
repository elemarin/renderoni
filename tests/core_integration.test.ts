import { describe, it, expect, afterEach, vi } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { createRenderoni } from '../src/index.js';
import { body } from '../src/presets/index.js';

/** One presentation frame, comfortably longer than the 60 Hz fixed step. */
const FRAME_MS = 20;

interface PostPhysicsRun {
  hash: string;
  canonicalLinVelY: number;
  canonicalY: number;
}

async function runWithPostPhysicsVelocity(velocityY: number): Promise<PostPhysicsRun> {
  const game = await createRenderoni({ mode: 'headless', seed: 42 });
  const crate = game.add(body({ id: 'crate', shape: 'box', type: 'dynamic', position: [0, 5, 0] }));

  game.systems.add({
    phase: 'postPhysics',
    update: () => {
      crate.native.rapier!.body!.setLinvel({ x: 0, y: velocityY, z: 0 }, true);
    },
  });

  game.step(3);

  const result: PostPhysicsRun = {
    hash: game.getStateHash(),
    canonicalLinVelY: game.transformPipeline.getLinearVelocity(crate.slot!)[1],
    canonicalY: game.transformPipeline.getPosition(crate.slot!)[1],
  };

  game.dispose();
  return result;
}

async function addMovingBody(velocity: number) {
  const game = await createRenderoni({ mode: 'headless', seed: 42 });
  const mover = game.add((ctx) => {
    const rigidBody = ctx.native.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, 5, 0)
        .setLinvel(0, velocity, 0)
        .setAngvel({ x: 0, y: velocity, z: 0 })
    );
    const collider = ctx.native.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5),
      rigidBody
    );
    return ctx.entity({
      id: 'mover',
      native: { rapier: { body: rigidBody, colliders: [collider] } },
    });
  });

  return { game, mover };
}

function installFrameDriver() {
  const pending: Array<(time: number) => void> = [];
  vi.stubGlobal('requestAnimationFrame', (cb: (time: number) => void) => {
    pending.push(cb);
    return pending.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});

  let now = performance.now();
  return {
    advance(frames: number, frameMs: number): void {
      for (let i = 0; i < frames; i++) {
        const cb = pending.shift();
        if (!cb) return;
        now += frameMs;
        cb(now);
      }
    },
  };
}

describe('Core integration', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('post-physics canonical sync', () => {
    it('captures post-physics velocity writes in canonical state and the hash', async () => {
      const slower = await runWithPostPhysicsVelocity(7);
      const faster = await runWithPostPhysicsVelocity(8);

      expect(slower.canonicalLinVelY).toBeCloseTo(7, 5);
      expect(faster.canonicalLinVelY).toBeCloseTo(8, 5);
      expect(faster.hash).not.toBe(slower.hash);
      expect(faster.canonicalY).not.toBe(slower.canonicalY);
    });

    it('captures post-physics impulses in canonical velocity', async () => {
      const game = await createRenderoni({ mode: 'headless', seed: 42 });
      const crate = game.add(body({ id: 'crate', shape: 'box', type: 'dynamic', position: [0, 5, 0] }));

      let applied = false;
      game.systems.add({
        phase: 'postPhysics',
        update: () => {
          if (applied) return;
          applied = true;
          crate.native.rapier!.body!.applyImpulse({ x: 0, y: 40, z: 0 }, true);
        },
      });

      game.step(1);

      // Without a post-physics re-sync the canonical row would still hold the
      // downward velocity Rapier produced before the impulse.
      expect(game.transformPipeline.getLinearVelocity(crate.slot!)[1]).toBeGreaterThan(0);

      game.dispose();
    });

    it('captures post-physics teleports in canonical position', async () => {
      const game = await createRenderoni({ mode: 'headless', seed: 42 });
      const crate = game.add(body({ id: 'crate', shape: 'box', type: 'dynamic', position: [0, 5, 0] }));

      game.systems.add({
        phase: 'postPhysics',
        update: () => {
          crate.native.rapier!.body!.setTranslation({ x: 2, y: 6, z: -1 }, true);
        },
      });

      game.step(1);

      const canonical = game.transformPipeline.getPosition(crate.slot!);
      expect(canonical[0]).toBeCloseTo(2, 5);
      expect(canonical[1]).toBeCloseTo(6, 5);
      expect(canonical[2]).toBeCloseTo(-1, 5);

      game.dispose();
    });
  });

  describe('initial canonical velocity', () => {
    it('seeds canonical velocity from the rigid body before the first step', async () => {
      const slower = await addMovingBody(7);
      const faster = await addMovingBody(8);

      expect(slower.game.tick).toBe(0);
      expect(faster.game.tick).toBe(0);

      expect(slower.game.transformPipeline.getLinearVelocity(slower.mover.slot!)).toEqual([0, 7, 0]);
      expect(slower.game.transformPipeline.getAngularVelocity(slower.mover.slot!)).toEqual([0, 7, 0]);
      expect(faster.game.transformPipeline.getLinearVelocity(faster.mover.slot!)).toEqual([0, 8, 0]);
      expect(faster.game.transformPipeline.getAngularVelocity(faster.mover.slot!)).toEqual([0, 8, 0]);

      // Same transform, different motion: the pre-step hashes must differ.
      expect(faster.game.getStateHash()).not.toBe(slower.game.getStateHash());

      slower.game.dispose();
      faster.game.dispose();
    });

    it('keeps a resting body at zero canonical velocity', async () => {
      const still = await addMovingBody(0);

      expect(still.game.transformPipeline.getLinearVelocity(still.mover.slot!)).toEqual([0, 0, 0]);
      expect(still.game.transformPipeline.getAngularVelocity(still.mover.slot!)).toEqual([0, 0, 0]);

      still.game.dispose();
    });

    it('rejects a non-finite body at creation and releases the canonical slot', async () => {
      const game = await createRenderoni({ mode: 'headless', seed: 42 });

      expect(() =>
        game.add((ctx) => {
          const rigidBody = ctx.native.world.createRigidBody(
            RAPIER.RigidBodyDesc.dynamic()
              .setTranslation(0, 5, 0)
              .setLinvel(0, Number.POSITIVE_INFINITY, 0)
          );
          const collider = ctx.native.world.createCollider(
            RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5),
            rigidBody
          );
          return ctx.entity({
            id: 'broken',
            native: { rapier: { body: rigidBody, colliders: [collider] } },
          });
        })
      ).toThrow(/RND_030[13]/);

      expect(game.entities.has('broken')).toBe(false);
      expect(game.transformPipeline.hasSlot('broken')).toBe(false);

      game.dispose();
    });
  });

  describe('presentation loop gating', () => {    it('renders without advancing fixed simulation while the match loop is ready', async () => {
      const frames = installFrameDriver();
      const game = await createRenderoni({ mode: 'headless', seed: 42, loop: true });
      const crate = game.add(body({ id: 'crate', shape: 'box', type: 'dynamic', position: [0, 5, 0] }));

      let presentationFrames = 0;
      game.start(() => {
        presentationFrames += 1;
      });

      frames.advance(5, 200);

      expect(game.loop.phase).toBe('ready');
      expect(game.tick).toBe(0);
      expect(crate.position[1]).toBeCloseTo(5, 5);
      // Presentation keeps running so menus and scenery still render.
      expect(presentationFrames).toBe(5);

      game.stop();
      game.dispose();
    });

    it('does not replay a backlog of ticks when the match starts', async () => {
      const frames = installFrameDriver();
      const game = await createRenderoni({ mode: 'headless', seed: 42, loop: true });
      game.add(body({ id: 'crate', shape: 'box', type: 'dynamic', position: [0, 5, 0] }));

      game.start();
      frames.advance(10, 250);
      expect(game.tick).toBe(0);

      game.loop.start();
      frames.advance(1, FRAME_MS);

      // One 20ms frame after Start must produce ~1 tick, not a clamped burst of
      // the 2.5s that elapsed while the match sat in `ready`.
      expect(game.tick).toBe(1);

      game.stop();
      game.dispose();
    });

    it('freezes simulation on win and resumes it on restart', async () => {
      const frames = installFrameDriver();
      const game = await createRenderoni({ mode: 'headless', seed: 42, loop: true });
      const crate = game.add(body({ id: 'crate', shape: 'box', type: 'dynamic', position: [0, 5, 0] }));

      game.start();
      game.loop.start();
      frames.advance(6, FRAME_MS);

      const playingTick = game.tick;
      expect(playingTick).toBeGreaterThan(0);

      game.loop.win('Escaped');
      frames.advance(6, 200);

      const frozenY = crate.position[1];
      expect(game.loop.phase).toBe('won');
      expect(game.tick).toBe(playingTick);

      game.loop.restart();
      frames.advance(6, FRAME_MS);

      expect(game.loop.phase).toBe('playing');
      expect(game.tick).toBeGreaterThan(playingTick);
      expect(crate.position[1]).toBeLessThan(frozenY);

      game.stop();
      game.dispose();
    });

    it('keeps advancing every frame when no match loop is enabled', async () => {
      const frames = installFrameDriver();
      const game = await createRenderoni({ mode: 'headless', seed: 42 });
      game.add(body({ id: 'crate', shape: 'box', type: 'dynamic', position: [0, 5, 0] }));

      game.start();
      frames.advance(4, FRAME_MS);

      expect(game.loop.enabled).toBe(false);
      expect(game.tick).toBeGreaterThan(0);

      game.stop();
      game.dispose();
    });

    it('keeps headless step() semantics while the match loop is ready', async () => {
      const game = await createRenderoni({ mode: 'headless', seed: 42, loop: true });
      game.add(body({ id: 'crate', shape: 'box', type: 'dynamic', position: [0, 5, 0] }));

      expect(game.loop.phase).toBe('ready');
      game.step(10);

      expect(game.tick).toBe(10);

      game.dispose();
    });
  });
});

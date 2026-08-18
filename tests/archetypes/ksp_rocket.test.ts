import { describe, it, expect } from 'vitest';
import { createRenderoni } from '../../src/index.js';
import { body } from '../../src/presets/index.js';
import { audio } from '../../src/audio/index.js';
import { vfx } from '../../src/vfx/index.js';
import RAPIER from '@dimforge/rapier3d-compat';
import '../../src/testing/matchers.js';

describe('Reference Archetype A: KSP Rocket & Space Simulator', () => {
  it('executes rocket launch, thrust physics, and staging decoupling headlessly (Gate 6A)', async () => {
    const game = await createRenderoni({
      mode: 'headless',
      seed: 42,
      subsystems: [audio(), vfx()],
      gravity: [0, -9.81, 0],
    });

    // 1. Build Capsule (payload) & Booster (first stage)
    const capsule = game.add(
      body({
        id: 'capsule',
        shape: 'cylinder',
        size: [1, 2],
        mass: 500,
        position: [0, 10, 0],
        type: 'dynamic',
      })
    );

    const booster = game.add(
      body({
        id: 'booster',
        shape: 'cylinder',
        size: [1.2, 6],
        mass: 2000,
        position: [0, 6, 0],
        type: 'dynamic',
      })
    );

    booster.state.fuel = 100.0;
    booster.state.throttle = 1.0;

    // 2. Connect stage with Rapier Fixed Impulse Joint
    const decouplerJoint = game.native.world.createImpulseJoint(
      RAPIER.JointData.fixed(
        { x: 0, y: -1, z: 0 },
        { w: 1, x: 0, y: 0, z: 0 },
        { x: 0, y: 3, z: 0 },
        { w: 1, x: 0, y: 0, z: 0 }
      ),
      (capsule.native.rapier?.body as RAPIER.RigidBody),
      (booster.native.rapier?.body as RAPIER.RigidBody),
      true
    );

    // 3. Thrust & Flight Physics System
    game.systems.add({
      phase: 'prePhysics',
      update: (ctx) => {
        const fuel = booster.state.fuel as number;
        const throttle = booster.state.throttle as number;
        if (fuel > 0 && throttle > 0) {
          const thrustForce = throttle * 45000;
          (booster.native.rapier?.body as RAPIER.RigidBody).addForceAtPoint(
            { x: 0, y: thrustForce, z: 0 },
            { x: booster.position[0], y: booster.position[1], z: booster.position[2] },
            true
          );
          (booster.state.fuel as number) -= ctx.dt * 10;
          ctx.events.emit('vfx.particles', { type: 'exhaustPlume', position: booster.position });
        }
      },
    });

    // 4. Staging Action
    game.actions.register({
      name: 'rocket.stage',
      handle: () => {
        game.native.world.removeImpulseJoint(decouplerJoint, true);
        (game as any).audio.play('stage_decouple');
        game.events.emit('stage.separated', { stage: 1 });
      },
    });

    // 5. Simulate 5s of burn (300 ticks)
    game.step(300);
    expect(capsule.position[1]).toBeGreaterThan(30);

    // Trigger staging
    game.act({ name: 'rocket.stage' });
    game.step(60);

    expect(game).toEmitEvent('stage.separated', { stage: 1 });
    expect(game).toEmitEvent('audio.play', { clip: 'stage_decouple' });

    game.dispose();
  });
});

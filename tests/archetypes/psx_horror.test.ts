import { describe, it, expect } from 'vitest';
import { createRenderoni } from '../../src/index.js';
import { kccPlayer, sensor, light, body } from '../../src/presets/index.js';
import { vfx } from '../../src/vfx/index.js';
import { audio } from '../../src/audio/index.js';
import { ui } from '../../src/ui/index.js';
import '../../src/testing/matchers.js';

describe('Reference Archetype C: PSX 1st-Person Horror Game', () => {
  it('executes dark atmospheric horror quest chain and trigger delivery headlessly (Gate 6C)', async () => {
    const game = await createRenderoni({
      mode: 'headless',
      seed: 42,
      subsystems: [
        vfx({
          pixelResolution: [320, 240],
          affineTextureWarp: true,
          dithering: true,
        }),
        audio(),
        ui(),
      ],
    });

    // Forest path floor (top at y = 0.5)
    game.add(body({ id: 'path', shape: 'box', type: 'fixed', size: [10, 1, 60], position: [0, 0, 15] }));

    // 1. Delivery Driver Player (rest on floor at y = 1.7)
    const hero = game.add(
      kccPlayer({
        id: 'delivery_driver',
        position: [0, 1.7, 0],
        moveSpeed: 5.0,
        state: { battery: 100, packageDelivered: false },
      })
    );

    // 2. Flashlight Spotlight
    game.add(
      light({
        id: 'flashlight',
        type: 'spot',
        position: [0, 2.0, 0],
        intensity: 2.5,
        angle: Math.PI / 6,
        castShadow: true,
      })
    );

    // 3. Cabin Porch Dropoff Trigger Sensor Zone at z = 15
    game.add(
      sensor({
        id: 'cabin_porch',
        shape: 'box',
        size: [6, 4, 6],
        position: [0, 2, 15],
      })
    );

    // 4. Quest & Atmosphere Triggers
    game.events.on('sensor.enter', ({ sensor: s, target: t }) => {
      if (s.id === 'cabin_porch' && t.id === 'delivery_driver') {
        hero.state.packageDelivered = true;
        (game as any).audio.play('creepy_door_knock', { position: [0, 1, 15] });
        (game as any).ui.showSubtitle('Delivery complete... but you feel watched.');
      }
    });

    // Move player toward cabin porch
    hero.actions.move({ x: 0, z: 1 });
    game.step(240); // 4s at 5m/s covers 20m, easily entering sensor at z=15

    expect(hero.state.packageDelivered).toBe(true);
    expect(game).toEmitEvent('audio.play', { clip: 'creepy_door_knock' });
    expect(game).toEmitEvent('ui.subtitle');
    expect(game).toHavePassedDiagnostics();

    game.dispose();
  });
});

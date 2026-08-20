import { describe, it, expect, beforeEach } from 'vitest';
import {
  SimulationClock,
  PRNG,
  StructuralCommandQueue,
  DualBufferTransformPipeline,
  StateHasher,
  ResourceOwnershipTracker,
  DiagnosticLogger,
  PhysicsEngine,
  quantize,
  dequantize,
} from '../src/core/index.js';
import RAPIER from '@dimforge/rapier3d-compat';

describe('L0 Deterministic Kernel', () => {
  describe('SimulationClock', () => {
    it('initializes with default 60Hz tick rate and zero accumulator', () => {
      const clock = new SimulationClock();
      expect(clock.tickRateHz).toBe(60);
      expect(clock.fixedDt).toBeCloseTo(1 / 60, 5);
      expect(clock.tick).toBe(0);
      expect(clock.accumulator).toBe(0);
      expect(clock.alpha).toBe(0);
    });

    it('steps ticks directly in batch mode', () => {
      const clock = new SimulationClock();
      clock.stepTicks(10);
      expect(clock.tick).toBe(10);
    });

    it('accumulates presentation dt without advancing simulation state', () => {
      const clock = new SimulationClock({ tickRateHz: 60 });
      // 0.0333s = ~2 ticks at 60Hz
      const ticksRun = clock.advancePresentation(0.034);
      expect(ticksRun).toBe(2);
      expect(clock.tick).toBe(0);
      expect(clock.accumulator).toBeGreaterThanOrEqual(0);
    });
  });

  describe('PRNG Hierarchy', () => {
    it('produces identical sequences given the same seed', () => {
      const prng1 = new PRNG('renderoni-test-seed');
      const prng2 = new PRNG('renderoni-test-seed');

      for (let i = 0; i < 50; i++) {
        expect(prng1.nextFloat()).toBe(prng2.nextFloat());
        expect(prng1.nextInt(1, 100)).toBe(prng2.nextInt(1, 100));
        expect(prng1.nextBool(0.7)).toBe(prng2.nextBool(0.7));
      }
    });

    it('forks isolated child streams that remain deterministic', () => {
      const parent1 = new PRNG(12345);
      const parent2 = new PRNG(12345);

      const child1 = parent1.fork('subsystem_a');
      const child2 = parent2.fork('subsystem_a');

      for (let i = 0; i < 20; i++) {
        expect(child1.nextFloat()).toBe(child2.nextFloat());
      }
    });

    it('exports and restores state correctly', () => {
      const prng = new PRNG(999);
      for (let i = 0; i < 10; i++) prng.nextUint32();

      const saved = prng.exportState();
      const val1 = prng.nextFloat();
      const val2 = prng.nextFloat();

      prng.restoreState(saved);
      expect(prng.nextFloat()).toBe(val1);
      expect(prng.nextFloat()).toBe(val2);
    });
  });

  describe('StructuralCommandQueue', () => {
    it('defers mutations and drains in deterministic order', () => {
      const queue = new StructuralCommandQueue();
      const log: string[] = [];

      queue.spawn('hero', ['player'], { health: 100 });
      queue.addTag('hero', 'alive');
      queue.destroy('enemy');

      expect(queue.size).toBe(3);

      const drainedCount = queue.drain({
        onSpawnEntity: (cmd) => log.push(`spawn:${cmd.entityId}`),
        onDestroyEntity: (cmd) => log.push(`destroy:${cmd.entityId}`),
        onAddTag: (cmd) => log.push(`addTag:${cmd.entityId}:${cmd.tag}`),
        onRemoveTag: () => {},
        onSetState: () => {},
      });

      expect(drainedCount).toBe(3);
      expect(queue.size).toBe(0);
      expect(log).toEqual(['spawn:hero', 'addTag:hero:alive', 'destroy:enemy']);
    });
  });

  describe('DualBufferTransformPipeline', () => {
    let pipeline: DualBufferTransformPipeline;

    beforeEach(() => {
      pipeline = new DualBufferTransformPipeline(8);
    });

    it('allocates and releases transform slots', () => {
      const slotHero = pipeline.allocateSlot('hero');
      const slotEnemy = pipeline.allocateSlot('enemy');
      expect(slotHero).toBe(0);
      expect(slotEnemy).toBe(1);

      pipeline.releaseSlot('hero');
      expect(pipeline.hasSlot('hero')).toBe(false);

      const slotNew = pipeline.allocateSlot('crate');
      expect(slotNew).toBe(0); // Reuses released slot
    });

    it('interpolates transforms using alpha slerp and lerp', () => {
      const slot = pipeline.allocateSlot('player');
      pipeline.setTransform(slot, 0, 0, 0, 0, 0, 0, 1);
      pipeline.commitTick(); // previous = [0, 0, 0]

      pipeline.setTransform(slot, 10, 20, 30, 0, 0, 0, 1); // current = [10, 20, 30]

      const outPos: [number, number, number] = [0, 0, 0];
      const outQuat: [number, number, number, number] = [0, 0, 0, 1];

      pipeline.interpolate(slot, 0.5, outPos, outQuat);
      expect(outPos[0]).toBeCloseTo(5.0);
      expect(outPos[1]).toBeCloseTo(10.0);
      expect(outPos[2]).toBeCloseTo(15.0);
    });
  });

  describe('Quantized State Hashing', () => {
    it('quantizes and dequantizes correctly', () => {
      const original = 12.3456;
      const q = quantize(original);
      const deq = dequantize(q);
      expect(deq).toBeCloseTo(original, 2);
    });

    it('computes identical XXH3 hashes across independent runs', async () => {
      const hasher1 = new StateHasher();
      const hasher2 = new StateHasher();
      await hasher1.init();
      await hasher2.init();

      const pipeline = new DualBufferTransformPipeline(4);
      const slot = pipeline.allocateSlot('box1');
      pipeline.setTransform(slot, 1.5, 2.5, 3.5, 0, 0, 0, 1);

      const entities = [{ id: 'box1', slot }];
      const hash1 = hasher1.computeHash(entities, pipeline.currentBuffer);
      const hash2 = hasher2.computeHash(entities, pipeline.currentBuffer);

      expect(hash1).toBe(hash2);
      expect(hash1.startsWith('0x')).toBe(true);
    });
  });

  describe('ResourceOwnershipTracker', () => {
    it('tracks owned resources and cleans up on dispose', () => {
      const tracker = new ResourceOwnershipTracker();
      let geomDisposed = false;
      let matDisposed = false;

      const mockMesh = {
        geometry: { dispose: () => { geomDisposed = true; } },
        material: { dispose: () => { matDisposed = true; } },
      };

      tracker.addThreeObject('crate', mockMesh, 'owned');
      tracker.disposeEntity('crate');

      expect(geomDisposed).toBe(true);
      expect(matDisposed).toBe(true);
    });
  });

  describe('DiagnosticLogger', () => {
    it('records diagnostics with severity and provides error status', () => {
      const logger = new DiagnosticLogger();
      logger.emit('RND_1001', 'Missing collider', { severity: 'warning', tick: 10 });
      logger.emit('RND_1002', 'Fatal crash', { severity: 'error', tick: 12 });

      expect(logger.hasErrors()).toBe(true);
      expect(logger.getRecords('error').length).toBe(1);
      expect(logger.getRecords().length).toBe(2);
    });
  });

  describe('PhysicsEngine (Rapier 3D)', () => {
    it('initializes Rapier, steps world, and copies transforms to transform buffer', async () => {
      const physics = new PhysicsEngine();
      await physics.init();

      const pipeline = new DualBufferTransformPipeline(8);
      const slot = pipeline.allocateSlot('falling_ball');

      // Create a dynamic falling sphere
      const bodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 10, 0);
      const body = physics.world.createRigidBody(bodyDesc);
      const colliderDesc = RAPIER.ColliderDesc.ball(0.5);
      const collider = physics.world.createCollider(colliderDesc, body);

      physics.registerEntityBody('falling_ball', body);
      physics.registerEntityCollider('falling_ball', collider);

      // Step physics 10 times
      for (let i = 0; i < 10; i++) {
        physics.step(pipeline);
      }

      const currentPos = pipeline.getPosition(slot);
      // Under -9.81 m/s^2 gravity, y should have decreased from 10
      expect(currentPos[1]).toBeLessThan(10.0);

      physics.dispose();
    });
  });
});

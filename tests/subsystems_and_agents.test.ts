import { describe, it, expect } from 'vitest';
import { createRenderoni } from '../src/index.js';
import { body, kccPlayer } from '../src/presets/index.js';
import { AssetManager } from '../src/assets/index.js';
import { animation } from '../src/animation/index.js';
import { audio } from '../src/audio/index.js';
import { ui } from '../src/ui/index.js';
import { vfx } from '../src/vfx/index.js';
import { network, LoopbackTransport } from '../src/network/index.js';
import { ObservationEngine } from '../src/core/observations.js';
import { createMCPServer } from '../src/mcp/index.js';
import { ReplayRecorder } from '../src/replays/index.js';
import '../src/testing/matchers.js';

describe('Modular Subsystems (L1) & Agent Tooling (L2)', () => {
  describe('Asset Management Pipeline', () => {
    it('loads manifest with progress tracking and headless mocks', async () => {
      const assets = new AssetManager();
      const progressList: number[] = [];

      assets.onProgress((p) => {
        progressList.push(p.percent);
      });

      const loaded = await assets.loadManifest({
        models: { hero: 'models/hero.glb', crate: 'models/crate.glb' },
        audio: { coin: 'audio/coin.mp3' },
        textures: { ground: 'textures/ground.png' },
      });

      expect(loaded.models.has('hero')).toBe(true);
      expect(loaded.audio.has('coin')).toBe(true);
      expect(progressList.length).toBe(4);
      expect(progressList[progressList.length - 1]).toBe(100);

      // Ref count release
      assets.retain('hero');
      assets.retain('hero');
      expect(assets.release('hero')).toBe(1);
      expect(assets.release('hero')).toBe(0);
    });
  });

  describe('Animation Subsystem', () => {
    it('advances deterministic state machine and calculates blend weights', async () => {
      const game = await createRenderoni({
        mode: 'headless',
        subsystems: [animation()],
      });

      const fsm = (game as any).animation.createStateMachine({
        clips: {
          idle: { name: 'idle', duration: 1.0, loop: true },
          run: { name: 'run', duration: 0.8, loop: true },
        },
        defaultState: 'idle',
      });

      expect(fsm.activeStateName).toBe('idle');
      fsm.update(0.5);
      expect(fsm.normalizedTime).toBeCloseTo(0.5, 2);

      // Cross-fade to run over 0.2s
      fsm.play('run', { crossFadeDuration: 0.2 });
      expect(fsm.activeStateName).toBe('run');

      fsm.update(0.1); // Halfway through transition
      expect(fsm.normalizedTime).toBeCloseTo(0.1 / 0.8, 2);

      game.dispose();
    });
  });

  describe('Audio Subsystem', () => {
    it('emits audio events and records headless logs', async () => {
      const game = await createRenderoni({
        mode: 'headless',
        subsystems: [audio({ volume: 0.8 })],
      });

      (game as any).audio.play('coin_pickup', { volume: 0.9, position: [1, 2, 3] });

      expect(game).toEmitEvent('audio.play', { clip: 'coin_pickup', volume: 0.9 });
      game.dispose();
    });
  });

  describe('UI Subsystem', () => {
    it('supports reactive state subscriptions and screen anchors', async () => {
      const game = await createRenderoni({
        mode: 'headless',
        subsystems: [ui()],
      });

      let observedHealth = 0;
      (game as any).ui.subscribe('hero.health', (val: number) => {
        observedHealth = val;
      });

      (game as any).ui.notify('hero.health', 85);
      expect(observedHealth).toBe(85);

      const anchor = (game as any).ui.createAnchor({ target: 'hero', offset: [0, 2, 0] });
      const proj = anchor.update([0, 0, 0]);
      expect(proj.isVisible).toBe(true);

      game.dispose();
    });
  });

  describe('VFX Subsystem', () => {
    it('emits screen shake and particle burst events', async () => {
      const game = await createRenderoni({
        mode: 'headless',
        subsystems: [vfx({ bloom: true })],
      });

      (game as any).vfx.screenShake(0.8, 0.4);
      (game as any).vfx.spawnParticles({ count: 50, position: [0, 1, 0] });

      expect(game).toEmitEvent('vfx.screenShake');
      expect(game).toEmitEvent('vfx.particles');

      game.dispose();
    });
  });

  describe('Network Subsystem', () => {
    it('transmits frames between loopback transport peers and subsystem', async () => {
      const transportA = new LoopbackTransport();
      const transportB = new LoopbackTransport();
      transportA.connectPeer(transportB);

      const game = await createRenderoni({
        mode: 'headless',
        subsystems: [network({ transport: transportA })],
      });

      let receivedPacket: any = null;
      transportB.onMessage((data) => {
        receivedPacket = JSON.parse(data.toString());
      });

      (game as any).network.sendFrame({ tick: 120, actions: [{ name: 'jump' }] });
      expect(receivedPacket).toEqual({ tick: 120, actions: [{ name: 'jump' }] });

      game.dispose();
    });
  });

  describe('Tier 0 Observation Economics & Agent Protocol', () => {
    it('produces high-density Markdown observation under 500 bytes (Gate 4)', async () => {
      const game = await createRenderoni({ mode: 'headless', seed: 42 });
      game.add(body({ id: 'ground', position: [0, 0, 0] }));
      game.add(kccPlayer({ id: 'hero', position: [0, 1, 0] }));

      game.step(10);

      const obs = ObservationEngine.generateTier0(game);
      expect(obs.markdown).toContain('# Tick: 10');
      expect(obs.markdown).toContain('hero: pos[');
      expect(obs.bytes).toBeLessThan(500); // Guarantees <=500 byte budget!

      game.dispose();
    });
  });

  describe('Model Context Protocol (MCP) Server', () => {
    it('completes the initialize handshake without a game attached', async () => {
      const mcp = createMCPServer();

      const init = await mcp.handleRequest({
        method: 'initialize',
        params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test' } },
      });

      expect(init.protocolVersion).toBe('2025-11-25');
      expect(init.capabilities.tools).toEqual({});
      expect(init.serverInfo.name).toBe('renderoni');
      expect(init.instructions).toContain('describe');

      await expect(mcp.handleRequest({ method: 'notifications/initialized' })).resolves.toEqual({});
      await expect(mcp.handleRequest({ method: 'ping' })).resolves.toEqual({});

      const listed = await mcp.handleRequest({ method: 'tools/list' });
      expect(listed.tools.map((t: { name: string }) => t.name)).toEqual([
        'describe',
        'observe',
        'act',
        'step',
        'check',
      ]);
      expect(listed.tools[0].inputSchema).toEqual({ type: 'object', properties: {} });
      expect(listed.tools.find((t: { name: string }) => t.name === 'act').inputSchema.required).toEqual([
        'name',
      ]);
    });

    it('handles tools/list and tools/call for describe, act, step, check', async () => {
      const game = await createRenderoni({ mode: 'headless', seed: 42 });
      game.add(body({ id: 'cube', position: [0, 10, 0] }));

      const mcp = createMCPServer({ game });

      // 1. List tools
      const toolList = await mcp.handleRequest({ method: 'tools/list' });
      expect(toolList.tools.length).toBeGreaterThanOrEqual(5);
      expect(toolList.tools[0].inputSchema.type).toBe('object');

      // 2. Call describe
      const descRes = await mcp.handleRequest({
        method: 'tools/call',
        params: { name: 'describe' },
      });
      expect(descRes.content[0].text).toContain('cube');

      // 3. Call step
      const stepRes = await mcp.handleRequest({
        method: 'tools/call',
        params: { name: 'step', arguments: { ticks: 5 } },
      });
      expect(stepRes.content[0].text).toContain('"tick":5');

      // 4. Call check
      const checkRes = await mcp.handleRequest({
        method: 'tools/call',
        params: {
          name: 'check',
          arguments: {
            assertions: [{ op: 'greaterThan', path: 'entities.cube.position.y', value: 0 }],
          },
        },
      });
      expect(checkRes.content[0].text).toContain('"passed":true');

      game.dispose();
    });
  });

  describe('Replay Engine', () => {
    it('records actions and savestate keyframes for seeking', async () => {
      const game = await createRenderoni({ mode: 'headless', seed: 42 });
      game.add(body({ id: 'box', position: [0, 5, 0] }));

      const recorder = new ReplayRecorder(42, 60);
      recorder.recordAction(0, 'spawn_box');
      recorder.captureKeyframe(game);

      const bundle = recorder.exportBundle();
      expect(bundle.seed).toBe(42);
      expect(bundle.keyframes.length).toBe(1);
      expect(bundle.keyframes[0].entityPositions.box).toEqual([0, 5, 0]);

      game.dispose();
    });
  });
});

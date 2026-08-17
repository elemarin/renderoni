/**
 * Renderoni Core Preset: Light
 *
 * Implements Three.js lighting presets (directional, point, spot, ambient)
 * with shadow configuration and headless mock support.
 */

import { Type, type Static } from '@sinclair/typebox';
import * as THREE from 'three';
import { definePreset, type EntityContext } from './define-preset.js';

export const LightTypeSchema = Type.Union([
  Type.Literal('directional'),
  Type.Literal('point'),
  Type.Literal('spot'),
  Type.Literal('ambient'),
]);

export const LightOptionsSchema = Type.Object({
  id: Type.Optional(Type.String()),
  type: Type.Optional(LightTypeSchema),
  color: Type.Optional(Type.Number()),
  intensity: Type.Optional(Type.Number()),
  position: Type.Optional(Type.Tuple([Type.Number(), Type.Number(), Type.Number()])),
  target: Type.Optional(Type.Tuple([Type.Number(), Type.Number(), Type.Number()])),
  distance: Type.Optional(Type.Number()),
  decay: Type.Optional(Type.Number()),
  angle: Type.Optional(Type.Number()),
  penumbra: Type.Optional(Type.Number()),
  castShadow: Type.Optional(Type.Boolean()),
  shadowMapSize: Type.Optional(Type.Number()),
  tags: Type.Optional(Type.Array(Type.String())),
});

export type LightOptions = Static<typeof LightOptionsSchema>;

export const light = definePreset({
  name: 'renderoni.light',
  version: 1,
  schema: LightOptionsSchema,
  create(ctx: EntityContext, options: LightOptions) {
    const lightType = options.type ?? 'directional';
    const color = options.color ?? 0xffffff;
    const intensity = options.intensity ?? 1.0;
    const pos = options.position ?? [0, 5, 0];

    let lightObj: THREE.Light;

    if (lightType === 'point') {
      lightObj = new THREE.PointLight(color, intensity, options.distance ?? 0, options.decay ?? 2);
    } else if (lightType === 'spot') {
      lightObj = new THREE.SpotLight(
        color,
        intensity,
        options.distance ?? 0,
        options.angle ?? Math.PI / 3,
        options.penumbra ?? 0,
        options.decay ?? 2
      );
    } else if (lightType === 'ambient') {
      lightObj = new THREE.AmbientLight(color, intensity);
    } else {
      // Default: directional
      lightObj = new THREE.DirectionalLight(color, intensity);
      if (options.target) {
        (lightObj as THREE.DirectionalLight).target.position.set(
          options.target[0],
          options.target[1],
          options.target[2]
        );
      }
    }

    lightObj.position.set(pos[0], pos[1], pos[2]);

    if (options.castShadow && 'castShadow' in lightObj) {
      lightObj.castShadow = true;
      if (options.shadowMapSize && lightObj.shadow) {
        lightObj.shadow.mapSize.width = options.shadowMapSize;
        lightObj.shadow.mapSize.height = options.shadowMapSize;
      }
    }

    const tags = ['light', lightType, ...(options.tags ?? [])];

    return ctx.entity({
      id: options.id,
      tags,
      state: { intensity, color },
      native: {
        three: { object: lightObj, ownership: 'owned' },
      },
    });
  },
});

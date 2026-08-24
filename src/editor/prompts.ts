/**
 * System prompts sent to the Copilot SDK for each editor tab.
 *
 * The shared factory-contract rules (self-contained, zero-arg, must-return-
 * Object3D, models-vs-terrain distinction, etc.) are the SAME rules a
 * coding-agent session gets from `.agents/skills/prompt-to-scene/SKILL.md`
 * ("Factory contract" section) — this module loads that section from disk at
 * runtime instead of hand-duplicating it, so the CLI/agent workflow and the
 * in-browser editor can never drift apart. If the skill file can't be found
 * (e.g. a published package without the repo's `.agents/` dir), a baked-in
 * fallback copy of the same rules is used instead.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EDITOR_TABS = ['model', 'terrain', 'level'] as const;
export type EditorTab = (typeof EDITOR_TABS)[number];

const FALLBACK_SHARED_RULES = `
You are generating source for the Renderoni 3D game engine (Three.js + Rapier physics).
Renderoni conventions you MUST follow:
- Never call Math.random(), Date.now(), performance.now(), or requestAnimationFrame().
  If you need pseudo-randomness, derive it deterministically from a small local
  hash/seed function baked in at construction time.
- Only use the "three" package (import * as THREE from 'three') plus plain
  JS/TS. Do not import any other package, and do not import from any other
  project file, relative path, or sibling module — the file MUST be fully
  self-contained (no "createPortraitTexture is not defined" style errors).
  If you need a texture, generate it inline in this same file with a small
  canvas/DataTexture helper function defined right here.
- The exported factory function signature MUST be exactly one of:
    export function create<PascalCaseName>Model(): THREE.Object3D
    export function create<PascalCaseName>Terrain(): THREE.Object3D
  Zero required parameters. Never require (engine, x, y, z) or any other
  arguments — this function must be independently previewable and callable
  with no arguments to get a fully-formed, ready-to-render object back.
- The function MUST return a THREE.Object3D (a THREE.Group, THREE.Mesh, or
  subclass) directly — never return a texture, material, plain object, or
  undefined. If you build multiple meshes, add them all to one THREE.Group
  and return that group.
- Models are a single placeable prop/item (key, clock, chair, door), never a
  whole room or building. Terrain is the static environment shell (floor,
  ceiling, walls, ground) a room sits inside — prefer one room/hallway
  segment/ground patch per factory rather than a giant multi-room structure.
- Respond with EXACTLY ONE fenced code block and nothing else — no prose,
  no explanation, no markdown outside the fence.
`.trim();

/**
 * Locate `.agents/skills/prompt-to-scene/SKILL.md` by walking up from this
 * module's directory. Works both from `src/editor` (ts-node/dev) and
 * `dist/editor` (built), since the `.agents` dir lives at the repo root in
 * both cases relative to this file's ancestry.
 */
function findSkillFile(): string | null {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, '.agents/skills/prompt-to-scene/SKILL.md');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** Extracts the "## Factory contract" section (binding rules for both the
 * CLI agent and this editor) out of the prompt-to-scene skill markdown. */
function extractFactoryContract(markdown: string): string | null {
  const match = /^##\s+Factory contract[^\n]*\n([\s\S]*?)(?=\n## |$(?![\s\S]))/m.exec(markdown);
  if (!match) return null;
  return match[1].trim();
}

let cachedSharedRules: string | null = null;

function loadSharedRules(): string {
  if (cachedSharedRules) return cachedSharedRules;
  try {
    const skillPath = findSkillFile();
    if (skillPath) {
      const markdown = readFileSync(skillPath, 'utf-8');
      const contract = extractFactoryContract(markdown);
      if (contract) {
        cachedSharedRules =
          `You are generating source for the Renderoni 3D game engine (Three.js + Rapier physics).\n` +
          `The following is the exact "Factory contract" from Renderoni's prompt-to-scene skill — ` +
          `follow it exactly, it is binding for both coding-agent sessions and this editor:\n\n${contract}`;
        return cachedSharedRules;
      }
    }
  } catch {
    // fall through to baked-in fallback below
  }
  cachedSharedRules = FALLBACK_SHARED_RULES;
  return cachedSharedRules;
}

function modelPrompt(): string {
  return `
${loadSharedRules()}

Task: reconstruct a single visual prop as a Three.js factory function, in the
same spirit as an img2threejs reconstruction (primitive geometries composed
into a group, not an imported mesh asset).

A "model" is a self-contained prop/item/piece of furniture that a player can
see and interact with individually (e.g. a key, a clock, a chair, a door).
Do NOT generate whole rooms, whole buildings, or multi-room structures here —
those belong in the Terrain tab (see below). Keep models to a single object
a level-designer would place at one position.

Output a single \`\`\`ts fenced block shaped exactly like:

  import * as THREE from 'three';

  export function create<PascalCaseName>Model(): THREE.Object3D {
    const group = new THREE.Group();
    // ... build from THREE.BoxGeometry / CylinderGeometry / SphereGeometry / etc.
    return group;
  }

Keep it under ~120 lines. If a texture is needed, define a small local
canvas-based helper in this same file (see example below) — never import one.
If a reference image is attached, match its silhouette, proportions, and
material colors as closely as primitives allow.

Example of a correct, fully self-contained model with an inline texture:

  import * as THREE from 'three';

  function createInlineWoodTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#5c3a21';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#3e2612';
    for (let y = 0; y < 64; y += 8) ctx.fillRect(0, y, 64, 1);
    return new THREE.CanvasTexture(canvas);
  }

  export function createSimpleCrateModel(): THREE.Object3D {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ map: createInlineWoodTexture() });
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    group.add(box);
    return group;
  }
`.trim();
}

function terrainPrompt(): string {
  return `
${loadSharedRules()}

Task: generate a Three.js terrain factory suitable for a ground/floor/room
shell (walls, floors, ceilings) in a Renderoni scene.

A "terrain" is the static environment shell a room or area sits inside —
floors, ceilings, walls, doorframes, ground meshes. It is NOT a placeable
prop (that's the Models tab). Prefer building ONE room, hallway segment, or
ground patch per factory rather than an entire multi-room building, so level
designers can mix and re-tile pieces; if the request clearly describes a
single small area, one factory covering it is fine.

Output a single \`\`\`ts fenced block shaped exactly like:

  import * as THREE from 'three';

  export function create<PascalCaseName>Terrain(): THREE.Object3D {
    const group = new THREE.Group();
    // ... build a floor/wall/ceiling from THREE.BoxGeometry or a displaced
    // THREE.PlaneGeometry, plus any inline texture helpers defined in this file
    return group;
  }

Prefer a THREE.PlaneGeometry with vertices displaced by a small deterministic
local hash/noise function (never Math.random()), plus a MeshStandardMaterial.
If a texture is needed, define a small local canvas-based helper function in
this same file (see the Models tab example for the pattern) — never import
one. Keep it under ~150 lines.
`.trim();
}

function levelPrompt(): string {
  return `
${loadSharedRules()}

Task: produce a Renderoni SceneInventory JSON that lays out a level.

SceneInventory shape:
{
  "version": 1,
  "prompt": string,
  "seed": number,
  "elements": [
    {
      "id": string,
      "factory": string,
      "kind": "terrain" | "prop" | "actor" | "pickup" | "decor",
      "position": [x, y, z],
      "rotation"?: [x, y, z, w],
      "scale"?: number,
      "collider"?: {
        "shape": "box" | "sphere" | "capsule" | "cylinder",
        "size"?: number[],
        "radius"?: number,
        "sensor"?: boolean
      },
      "tags"?: string[],
      "role"?: string
    }
  ]
}

Prefer factory keys from the "available factories" list the user supplies (if
any). If nothing fits, invent a short camelCase factory name — it will be
generated later via the Models tab. Output a single \`\`\`json fenced block
containing ONLY the JSON object, no comments, no trailing prose.
`.trim();
}

export function buildSystemPrompt(tab: EditorTab): string {
  switch (tab) {
    case 'model':
      return modelPrompt();
    case 'terrain':
      return terrainPrompt();
    case 'level':
      return levelPrompt();
    default: {
      const exhaustive: never = tab;
      throw new Error(`Unknown editor tab: ${String(exhaustive)}`);
    }
  }
}

export function defaultFenceLanguage(tab: EditorTab): 'ts' | 'json' {
  return tab === 'level' ? 'json' : 'ts';
}

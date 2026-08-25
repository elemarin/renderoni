import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ASSET_KINDS = ['model', 'terrain', 'scene', 'level'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const EDITOR_TABS = ['model', 'terrain', 'scene', 'level'] as const;
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
  self-contained.
  If you need a texture, generate it inline in this same file with a small
  canvas/DataTexture helper function defined right here.
- The exported factory function signature MUST be exactly one of:
    export function create<PascalCaseName>Model(): THREE.Object3D
    export function create<PascalCaseName>Terrain(): THREE.Object3D
  Zero required parameters. Never require (engine, x, y, z) or any other
  arguments.
- The function MUST return a THREE.Object3D (a THREE.Group, THREE.Mesh, or
  subclass) directly.
- Models are a single placeable prop/item (key, clock, chair, door).
  Terrain is the static environment shell (floor, ceiling, walls, ground).
- Respond with EXACTLY ONE fenced code block and nothing else.
`.trim();

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

function extractFactoryContract(markdown: string): string | null {
  const match = /^##\s+Factory contract[^\n]*\n([\s\S]*?)(?=\n## |$(?![\s\S]))/m.exec(markdown);
  if (!match) return null;
  return match[1].trim();
}

let cachedSharedRules: string | null = null;

export function loadSharedRules(): string {
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

export function modelPrompt(): string {
  return `
${loadSharedRules()}

Task: reconstruct a single visual prop as a Three.js factory function (primitive geometries composed into a group).

A "model" is a self-contained prop/item/piece of furniture that a player can see and interact with individually (e.g. a key, a clock, a chair, a door, a lantern).
Do NOT generate whole rooms or buildings here.

Output a single \`\`\`ts fenced block shaped exactly like:

  import * as THREE from 'three';

  export function create<PascalCaseName>Model(): THREE.Object3D {
    const group = new THREE.Group();
    // ... build from THREE.BoxGeometry / CylinderGeometry / SphereGeometry / etc.
    return group;
  }

Keep it under ~120 lines. If a texture is needed, define a small local canvas helper inline in this file.
`.trim();
}

export function terrainPrompt(): string {
  return `
${loadSharedRules()}

Task: generate a Three.js terrain factory suitable for a ground/floor/room shell (walls, floors, ceilings) in a Renderoni scene.

A "terrain" is the static environment shell a room or area sits inside — floors, ceilings, walls, doorframes, ground meshes. It is NOT a placeable prop. Prefer building ONE room, hallway segment, or ground patch per factory.

Output a single \`\`\`ts fenced block shaped exactly like:

  import * as THREE from 'three';

  export function create<PascalCaseName>Terrain(): THREE.Object3D {
    const group = new THREE.Group();
    // ... build a floor/wall/ceiling from THREE.BoxGeometry or a displaced THREE.PlaneGeometry
    return group;
  }

Keep it under ~150 lines.
`.trim();
}

export function scenePrompt(): string {
  return `
${loadSharedRules()}

Task: produce a Renderoni SceneInventory JSON that lays out a single playable or cinematic scene space.

SceneInventory shape:
{
  "version": 1,
  "id": string,
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

Prefer factory keys from the "available factories" context the user supplies (if any).
Output a single \`\`\`json fenced block containing ONLY the JSON object.
`.trim();
}

export function levelPrompt(): string {
  return `
${loadSharedRules()}

Task: produce a Renderoni LevelDefinition JSON that defines a progression level referencing multiple scenes.

LevelDefinition JSON shape:
{
  "version": 1,
  "id": string,
  "name"?: string,
  "startScene": string,
  "scenes": [
    {
      "id": string,
      "name"?: string,
      "file": string
    }
  ]
}

Ensure "startScene" matches the "id" of one of the entries in the "scenes" array.
Output a single \`\`\`json fenced block containing ONLY the JSON object.
`.trim();
}

export function buildSystemPrompt(kindOrTab: AssetKind | string): string {
  switch (kindOrTab) {
    case 'model':
      return modelPrompt();
    case 'terrain':
      return terrainPrompt();
    case 'scene':
      return scenePrompt();
    case 'level':
      return levelPrompt();
    default:
      return modelPrompt();
  }
}

export function defaultFenceLanguage(kindOrTab: AssetKind | string): 'ts' | 'json' {
  return kindOrTab === 'scene' || kindOrTab === 'level' ? 'json' : 'ts';
}

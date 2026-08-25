export type AssetKind = 'model' | 'terrain' | 'scene' | 'level';

export interface ScaffoldResult {
  kind: AssetKind;
  filename: string;
  defaultRelativePath: string;
  content: string;
  language: 'ts' | 'json';
}

function toPascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^([a-z])/, (_, chr) => chr.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '');
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');
}

export function scaffoldAsset(kind: AssetKind, name: string): ScaffoldResult {
  const cleanName = name.trim();
  if (!cleanName) {
    throw new Error('Asset name cannot be empty.');
  }

  switch (kind) {
    case 'model': {
      const pascal = toPascalCase(cleanName.replace(/Model$/i, ''));
      const filename = `${pascal}.ts`;
      const defaultRelativePath = `models/${filename}`;
      const content = `import * as THREE from 'three';

export function create${pascal}Model(): THREE.Object3D {
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const mesh = new THREE.Mesh(geometry, material);
  group.add(mesh);
  return group;
}
`;
      return { kind, filename, defaultRelativePath, content, language: 'ts' };
    }

    case 'terrain': {
      const pascal = toPascalCase(cleanName.replace(/Terrain$/i, ''));
      const filename = `${pascal}.ts`;
      const defaultRelativePath = `models/terrain/${filename}`;
      const content = `import * as THREE from 'three';

export function create${pascal}Terrain(): THREE.Object3D {
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry(10, 0.2, 10);
  const material = new THREE.MeshStandardMaterial({ color: 0x444444 });
  const floor = new THREE.Mesh(geometry, material);
  group.add(floor);
  return group;
}
`;
      return { kind, filename, defaultRelativePath, content, language: 'ts' };
    }

    case 'scene': {
      const kebab = toKebabCase(cleanName);
      const filename = 'scene.json';
      const defaultRelativePath = `scenes/${kebab}/${filename}`;
      const content = JSON.stringify(
        {
          version: 1,
          id: kebab,
          prompt: `${kebab} scene`,
          seed: 42,
          elements: [],
        },
        null,
        2
      ) + '\n';
      return { kind, filename, defaultRelativePath, content, language: 'json' };
    }

    case 'level': {
      const kebab = toKebabCase(cleanName);
      const filename = 'level.json';
      const defaultRelativePath = `levels/${kebab}/${filename}`;
      const content = JSON.stringify(
        {
          version: 1,
          id: kebab,
          startScene: 'main',
          scenes: [
            {
              id: 'main',
              file: `scenes/${kebab}-main/scene.json`,
            },
          ],
        },
        null,
        2
      ) + '\n';
      return { kind, filename, defaultRelativePath, content, language: 'json' };
    }

    default: {
      const exhaustive: never = kind;
      throw new Error(`Unsupported asset kind: ${String(exhaustive)}`);
    }
  }
}

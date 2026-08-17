/**
 * Renderoni UI Subsystem (renderoni/ui)
 *
 * Reactive state store for fine-grained UI data bindings and 3D-to-2D CSS screen anchor projections.
 */

import * as THREE from 'three';

export interface ScreenAnchorOptions {
  target: string; // entity ID
  offset?: [number, number, number];
}

export interface ScreenAnchorProjection {
  screenX: number;
  screenY: number;
  isVisible: boolean;
  depth: number;
}

export class ScreenAnchor {
  readonly target: string;
  readonly offset: [number, number, number];
  private listeners: Set<(projection: ScreenAnchorProjection) => void> = new Set();

  constructor(options: ScreenAnchorOptions) {
    this.target = options.target;
    this.offset = options.offset ?? [0, 0, 0];
  }

  onChange(listener: (projection: ScreenAnchorProjection) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  update(
    worldPos: [number, number, number],
    camera?: THREE.Camera,
    viewportWidth: number = 800,
    viewportHeight: number = 600
  ): ScreenAnchorProjection {
    let screenX = 0;
    let screenY = 0;
    let isVisible = true;
    let depth = 0;

    if (camera) {
      const vec = new THREE.Vector3(
        worldPos[0] + this.offset[0],
        worldPos[1] + this.offset[1],
        worldPos[2] + this.offset[2]
      );

      vec.project(camera);

      screenX = ((vec.x + 1) * viewportWidth) / 2;
      screenY = ((-vec.y + 1) * viewportHeight) / 2;
      depth = vec.z;
      isVisible = vec.z < 1.0 && vec.z > -1.0;
    }

    const proj: ScreenAnchorProjection = { screenX, screenY, isVisible, depth };
    for (const listener of this.listeners) {
      listener(proj);
    }
    return proj;
  }
}

export class ReactiveUIStore {
  private subscribers: Map<string, Set<(value: any) => void>> = new Map();

  subscribe(path: string, callback: (value: any) => void): () => void {
    let set = this.subscribers.get(path);
    if (!set) {
      set = new Set();
      this.subscribers.set(path, set);
    }
    set.add(callback);
    return () => set!.delete(callback);
  }

  notify(path: string, value: unknown): void {
    const set = this.subscribers.get(path);
    if (set) {
      for (const cb of set) {
        cb(value);
      }
    }
  }

  clear(): void {
    this.subscribers.clear();
  }
}

export function ui() {
  return (game: any) => {
    const store = new ReactiveUIStore();
    const anchors: ScreenAnchor[] = [];

    game.ui = {
      subscribe: (path: string, cb: (value: any) => void) => store.subscribe(path, cb),
      notify: (path: string, value: unknown) => store.notify(path, value),
      createAnchor: (options: ScreenAnchorOptions) => {
        const anchor = new ScreenAnchor(options);
        anchors.push(anchor);
        return anchor;
      },
      showSubtitle: (text: string, durationMs: number = 3000) => {
        store.notify('subtitle', { text, durationMs, visible: true });
        game.events.emit('ui.subtitle', { text, durationMs }, game.tick);
      },
    };
  };
}

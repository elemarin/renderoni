/**
 * Renderoni Input Manager
 *
 * Provides a unified abstraction layer mapping Keyboard WASD, Mouse / PointerLock,
 * Touch joysticks, Gamepads, and programmatic agent actions to continuous vectors and discrete buttons.
 */

export interface InputVector2D {
  x: number;
  z: number;
}

export interface LookDelta {
  dx: number;
  dy: number;
}

export class InputManager {
  private moveVector: InputVector2D = { x: 0, z: 0 };
  private lookDelta: LookDelta = { dx: 0, dy: 0 };
  private buttons: Map<string, boolean> = new Map();
  private isListening = false;

  private cleanupListeners: Array<() => void> = [];

  /**
   * Attaches browser DOM event listeners if running interactively in a window environment.
   */
  attachDOM(_element?: HTMLElement): void {
    if (typeof window === 'undefined' || this.isListening) return;
    this.isListening = true;

    const keysDown = new Set<string>();

    const updateMove = () => {
      let x = 0;
      let z = 0;
      if (keysDown.has('KeyW') || keysDown.has('ArrowUp')) z += 1;
      if (keysDown.has('KeyS') || keysDown.has('ArrowDown')) z -= 1;
      if (keysDown.has('KeyA') || keysDown.has('ArrowLeft')) x -= 1;
      if (keysDown.has('KeyD') || keysDown.has('ArrowRight')) x += 1;

      // Normalize if diagonal
      const len = Math.hypot(x, z);
      if (len > 0) {
        this.moveVector.x = x / len;
        this.moveVector.z = z / len;
      } else {
        this.moveVector.x = 0;
        this.moveVector.z = 0;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      keysDown.add(e.code);
      if (e.code === 'Space') {
        this.buttons.set('jump', true);
      }
      updateMove();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysDown.delete(e.code);
      if (e.code === 'Space') {
        this.buttons.set('jump', false);
      }
      updateMove();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement) {
        this.lookDelta.dx += e.movementX;
        this.lookDelta.dy += e.movementY;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);

    this.cleanupListeners.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
    });
  }

  /**
   * Sets move vector programmatically (e.g. for AI agents, virtual joysticks, or unit tests).
   */
  setMoveVector(x: number, z: number): void {
    const len = Math.hypot(x, z);
    if (len > 1.0) {
      this.moveVector.x = x / len;
      this.moveVector.z = z / len;
    } else {
      this.moveVector.x = x;
      this.moveVector.z = z;
    }
  }

  getMoveVector(): InputVector2D {
    return { ...this.moveVector };
  }

  setButton(buttonName: string, pressed: boolean): void {
    this.buttons.set(buttonName, pressed);
  }

  isButtonPressed(buttonName: string): boolean {
    return this.buttons.get(buttonName) ?? false;
  }

  consumeLookDelta(): LookDelta {
    const delta = { ...this.lookDelta };
    this.lookDelta.dx = 0;
    this.lookDelta.dy = 0;
    return delta;
  }

  reset(): void {
    this.moveVector = { x: 0, z: 0 };
    this.lookDelta = { dx: 0, dy: 0 };
    this.buttons.clear();
  }

  dispose(): void {
    for (const cleanup of this.cleanupListeners) {
      cleanup();
    }
    this.cleanupListeners = [];
    this.isListening = false;
  }
}

declare module 'nipplejs' {
  interface JoystickData {
    vector?: { x: number; y: number };
  }

  interface JoystickManager {
    on(event: 'move' | 'end', callback: (event: Event, data: JoystickData) => void): JoystickManager;
    destroy(): void;
  }

  interface JoystickOptions {
    zone: HTMLElement;
    mode?: 'dynamic' | 'semi' | 'static';
    position?: { left?: string; top?: string };
    color?: string;
    size?: number;
    restOpacity?: number;
    fadeTime?: number;
  }

  const nipplejs: {
    create(options: JoystickOptions): JoystickManager;
  };

  export default nipplejs;
}

import type { InputManager } from './input-manager.js';

export interface MobileActionButton {
  name: string;
  label: string;
  ariaLabel?: string;
}

export interface MobileControlsOptions {
  parent?: HTMLElement;
  buttons?: MobileActionButton[];
  lookElement?: HTMLElement;
  force?: boolean;
  joystickColor?: string;
}

const STYLE_ID = 'renderoni-mobile-controls-styles';

function installStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .renderoni-mobile-controls{position:fixed;inset:0;z-index:80;pointer-events:none;
      padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}
    .renderoni-mobile-stick{position:absolute;left:max(18px,env(safe-area-inset-left));bottom:max(18px,env(safe-area-inset-bottom));
      width:150px;height:150px;pointer-events:auto;touch-action:none}
    .renderoni-mobile-actions{position:absolute;right:max(18px,env(safe-area-inset-right));bottom:max(22px,env(safe-area-inset-bottom));
      width:160px;display:flex;flex-wrap:wrap-reverse;justify-content:flex-end;gap:12px;pointer-events:auto}
    .renderoni-mobile-action{width:68px;height:68px;border:2px solid rgba(255,255,255,.9);border-radius:50%;
      background:rgba(9,9,11,.68);color:#fff;font:700 13px/1 sans-serif;box-shadow:0 3px 0 rgba(0,0,0,.7);
      touch-action:none;-webkit-tap-highlight-color:transparent;user-select:none}
    .renderoni-mobile-action.is-pressed{background:#facc15;color:#111;transform:translateY(2px);box-shadow:none}
    @media (min-width:901px) and (pointer:fine){.renderoni-mobile-controls{display:none}}
    @media (max-width:480px){.renderoni-mobile-stick{width:126px;height:126px}.renderoni-mobile-actions{width:144px}
      .renderoni-mobile-action{width:62px;height:62px;font-size:12px}}
  `;
  document.head.append(style);
}

export class MobileControls {
  readonly active: boolean;
  private readonly root?: HTMLDivElement;
  private joystick?: ReturnType<(typeof import('nipplejs'))['default']['create']>;
  private readonly cleanup: Array<() => void> = [];
  private disposed = false;

  constructor(private readonly input: InputManager, options: MobileControlsOptions = {}) {
    this.active = typeof window !== 'undefined'
      && (options.force === true
        || navigator.maxTouchPoints > 0
        || window.matchMedia?.('(any-pointer: coarse)').matches === true);
    if (!this.active) return;

    installStyles();
    const root = document.createElement('div');
    root.className = 'renderoni-mobile-controls';
    root.setAttribute('aria-label', 'Touch game controls');

    const stick = document.createElement('div');
    stick.className = 'renderoni-mobile-stick';
    stick.setAttribute('aria-label', 'Movement joystick');
    root.append(stick);

    const actions = document.createElement('div');
    actions.className = 'renderoni-mobile-actions';
    for (const config of options.buttons ?? []) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'renderoni-mobile-action';
      button.textContent = config.label;
      button.setAttribute('aria-label', config.ariaLabel ?? config.label);

      const press = (event: PointerEvent) => {
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        button.classList.add('is-pressed');
        this.input.setButton(config.name, true);
      };
      const release = (event: PointerEvent) => {
        event.preventDefault();
        button.classList.remove('is-pressed');
        this.input.setButton(config.name, false);
      };
      button.addEventListener('pointerdown', press);
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      this.cleanup.push(() => {
        button.removeEventListener('pointerdown', press);
        button.removeEventListener('pointerup', release);
        button.removeEventListener('pointercancel', release);
      });
      actions.append(button);
    }
    root.append(actions);
    (options.parent ?? document.body).append(root);
    this.root = root;

    void this.createJoystick(stick, options.joystickColor);

    if (options.lookElement) this.bindLook(options.lookElement);
  }

  private async createJoystick(stick: HTMLElement, color?: string): Promise<void> {
    const { default: nipplejs } = await import('nipplejs');
    if (this.disposed) return;
    this.joystick = nipplejs.create({
      zone: stick,
      mode: 'static',
      position: { left: '50%', top: '50%' },
      color: color ?? '#facc15',
      size: 112,
      restOpacity: 0.65,
      fadeTime: 0,
    });
    this.joystick.on('move', (_event, data) => {
      this.input.setMoveVector(data.vector?.x ?? 0, data.vector?.y ?? 0);
    });
    this.joystick.on('end', () => this.input.setMoveVector(0, 0));
  }

  private bindLook(element: HTMLElement): void {
    let pointerId: number | null = null;
    let lastX = 0;
    let lastY = 0;
    const down = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' || pointerId !== null) return;
      pointerId = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
    };
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      this.input.addLookDelta(event.clientX - lastX, event.clientY - lastY);
      lastX = event.clientX;
      lastY = event.clientY;
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId === pointerId) pointerId = null;
    };
    element.addEventListener('pointerdown', down);
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', up);
    this.cleanup.push(() => {
      element.removeEventListener('pointerdown', down);
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', up);
      element.removeEventListener('pointercancel', up);
    });
  }

  dispose(): void {
    this.disposed = true;
    this.input.setMoveVector(0, 0);
    this.joystick?.destroy();
    for (const cleanup of this.cleanup) cleanup();
    this.root?.remove();
  }
}

import type { InputManager } from './input-manager.js';

export interface MobileActionButton {
  name: string;
  label: string;
  ariaLabel?: string;
}

export interface MobileControlsOptions {
  parent?: HTMLElement;
  buttons?: MobileActionButton[];
  /** A real touch on this element activates and lazy-loads the controls. */
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
    .renderoni-mobile-stick{position:absolute;bottom:max(18px,env(safe-area-inset-bottom));
      width:150px;height:150px;pointer-events:auto;touch-action:none}
    .renderoni-mobile-stick--move{left:max(18px,env(safe-area-inset-left))}
    .renderoni-mobile-stick--look{right:max(18px,env(safe-area-inset-right))}
    .renderoni-mobile-actions{position:absolute;right:max(18px,env(safe-area-inset-right));bottom:max(184px,calc(env(safe-area-inset-bottom) + 184px));
      width:160px;display:flex;flex-wrap:wrap-reverse;justify-content:flex-end;gap:12px;pointer-events:auto}
    .renderoni-mobile-action{width:68px;height:68px;border:2px solid rgba(255,255,255,.9);border-radius:50%;
      background:rgba(9,9,11,.68);color:#fff;font:700 13px/1 sans-serif;box-shadow:0 3px 0 rgba(0,0,0,.7);
      touch-action:none;-webkit-tap-highlight-color:transparent;user-select:none}
    .renderoni-mobile-action.is-pressed{background:#facc15;color:#111;transform:translateY(2px);box-shadow:none}
    @media (max-width:480px){.renderoni-mobile-stick{width:126px;height:126px}.renderoni-mobile-actions{width:144px;bottom:max(156px,calc(env(safe-area-inset-bottom) + 156px))}
      .renderoni-mobile-action{width:62px;height:62px;font-size:12px}}
  `;
  document.head.append(style);
}

export class MobileControls {
  private root?: HTMLDivElement;
  private moveJoystick?: ReturnType<(typeof import('nipplejs'))['default']['create']>;
  private lookJoystick?: ReturnType<(typeof import('nipplejs'))['default']['create']>;
  private readonly cleanup: Array<() => void> = [];
  private activationCleanup?: () => void;
  private activated = false;
  private disposed = false;

  constructor(private readonly input: InputManager, options: MobileControlsOptions = {}) {
    if (typeof window === 'undefined') return;
    if (options.force === true) {
      this.activate(options);
      return;
    }

    const activationTarget: HTMLElement | Document = options.lookElement ?? document;
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch') this.activate(options);
    };
    const onTouchStart = () => this.activate(options);
    activationTarget.addEventListener('pointerdown', onPointerDown as EventListener, true);
    activationTarget.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    this.activationCleanup = () => {
      activationTarget.removeEventListener('pointerdown', onPointerDown as EventListener, true);
      activationTarget.removeEventListener('touchstart', onTouchStart, true);
      this.activationCleanup = undefined;
    };
  }

  get active(): boolean {
    return this.activated;
  }

  private activate(options: MobileControlsOptions): void {
    if (this.activated || this.disposed) return;
    this.activated = true;
    this.activationCleanup?.();
    installStyles();

    const root = document.createElement('div');
    root.className = 'renderoni-mobile-controls';
    root.setAttribute('aria-label', 'Touch game controls');

    const moveStick = document.createElement('div');
    moveStick.className = 'renderoni-mobile-stick renderoni-mobile-stick--move';
    moveStick.setAttribute('aria-label', 'Movement joystick');
    root.append(moveStick);

    let lookStick: HTMLDivElement | undefined;
    if (options.lookElement) {
      lookStick = document.createElement('div');
      lookStick.className = 'renderoni-mobile-stick renderoni-mobile-stick--look';
      lookStick.setAttribute('aria-label', 'Look joystick');
      root.append(lookStick);
    }

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

    void this.createJoysticks(moveStick, lookStick, options.joystickColor);
  }

  private async createJoysticks(
    moveStick: HTMLElement,
    lookStick: HTMLElement | undefined,
    color?: string
  ): Promise<void> {
    const { default: nipplejs } = await import('nipplejs');
    if (this.disposed) return;

    this.moveJoystick = nipplejs.create({
      zone: moveStick,
      mode: 'static',
      position: { left: '50%', top: '50%' },
      color: color ?? '#facc15',
      size: 112,
      restOpacity: 0.65,
      fadeTime: 0,
    });
    this.moveJoystick.on('move', (_event, data) => {
      this.input.setMoveVector(data.vector?.x ?? 0, data.vector?.y ?? 0);
    });
    this.moveJoystick.on('end', () => this.input.setMoveVector(0, 0));

    if (lookStick) {
      this.lookJoystick = nipplejs.create({
        zone: lookStick,
        mode: 'static',
        position: { left: '50%', top: '50%' },
        color: color ?? '#facc15',
        size: 112,
        restOpacity: 0.65,
        fadeTime: 0,
      });
      this.lookJoystick.on('move', (_event, data) => {
        this.input.setLookVector(data.vector?.x ?? 0, data.vector?.y ?? 0);
      });
      this.lookJoystick.on('end', () => this.input.setLookVector(0, 0));
    }
  }

  dispose(): void {
    this.disposed = true;
    this.activationCleanup?.();
    this.input.setMoveVector(0, 0);
    this.input.setLookVector(0, 0);
    this.moveJoystick?.destroy();
    this.lookJoystick?.destroy();
    for (const cleanup of this.cleanup) cleanup();
    this.root?.remove();
  }
}

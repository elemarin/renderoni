export interface VFXSubsystemOptions {
  bloom?: boolean;
}

export function vfx(_options: VFXSubsystemOptions = {}) {
  return { name: 'vfx' };
}

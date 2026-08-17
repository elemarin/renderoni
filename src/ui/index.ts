export interface UISubsystemOptions {
  enabled?: boolean;
}

export function ui(_options: UISubsystemOptions = {}) {
  return { name: 'ui' };
}

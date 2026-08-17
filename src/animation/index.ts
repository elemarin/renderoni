export interface AnimationSubsystemOptions {
  enabled?: boolean;
}

export function animation(_options: AnimationSubsystemOptions = {}) {
  return { name: 'animation' };
}

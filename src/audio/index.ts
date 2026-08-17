export interface AudioSubsystemOptions {
  volume?: number;
}

export function audio(_options: AudioSubsystemOptions = {}) {
  return { name: 'audio' };
}

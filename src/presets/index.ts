export interface PresetDefinition<TOptions = unknown> {
  name: string;
  version: number;
  schema?: unknown;
  create: (ctx: unknown, options: TOptions) => unknown;
}

export function definePreset<TOptions>(def: PresetDefinition<TOptions>): PresetDefinition<TOptions> {
  return def;
}

export type ResourceOwnership = 'owned' | 'borrowed' | 'shared' | 'transferred';

export interface EntityRecord {
  id: string;
  tags: string[];
  state: Record<string, unknown>;
}

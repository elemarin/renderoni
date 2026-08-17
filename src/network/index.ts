export interface NetworkTransport {
  connect(url: string): Promise<void>;
  send(data: Uint8Array): void;
  disconnect(): void;
}

export function network() {
  return { name: 'network' };
}

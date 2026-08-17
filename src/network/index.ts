/**
 * Renderoni Networking Subsystem (renderoni/network)
 *
 * Pluggable transport abstraction supporting Authoritative Server + Prediction
 * and Deterministic Rollback architectures.
 */

export interface NetworkTransport {
  connect(url: string): Promise<void>;
  send(data: Uint8Array | string): void;
  onMessage(callback: (data: Uint8Array | string) => void): void;
  disconnect(): void;
}

export class LoopbackTransport implements NetworkTransport {
  private peer: LoopbackTransport | null = null;
  private messageCallback: ((data: Uint8Array | string) => void) | null = null;

  connectPeer(peer: LoopbackTransport): void {
    this.peer = peer;
    peer.peer = this;
  }

  async connect(_url: string): Promise<void> {
    return Promise.resolve();
  }

  send(data: Uint8Array | string): void {
    if (this.peer?.messageCallback) {
      this.peer.messageCallback(data);
    }
  }

  onMessage(callback: (data: Uint8Array | string) => void): void {
    this.messageCallback = callback;
  }

  disconnect(): void {
    this.peer = null;
    this.messageCallback = null;
  }
}

export interface NetworkFramePacket {
  tick: number;
  actions: Array<{ name: string; payload?: unknown }>;
  stateHash?: string;
}

export function network(options: { transport?: NetworkTransport } = {}) {
  return (game: any) => {
    const transport = options.transport ?? new LoopbackTransport();

    game.network = {
      transport,
      sendFrame: (packet: NetworkFramePacket) => {
        transport.send(JSON.stringify(packet));
        game.events.emit('network.sendFrame', packet, game.tick);
      },
    };
  };
}

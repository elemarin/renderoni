export interface MCPServerOptions {
  transport?: 'stdio' | 'sse';
}

export function createMCPServer(_options: MCPServerOptions = {}) {
  return { name: 'mcp-server' };
}

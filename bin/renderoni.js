#!/usr/bin/env node

/**
 * Renderoni CLI Binary
 */

import { createRenderoni } from '../dist/index.js';
import { createMCPServer } from '../dist/mcp/index.js';
import * as readline from 'readline';

const args = process.argv.slice(2);
const command = args[0];

if (command === 'mcp') {
  // Start headless MCP server over stdio
  const game = await createRenderoni({ mode: 'headless' });
  const server = createMCPServer({ transport: 'stdio', game });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  rl.on('line', async (line) => {
    if (!line.trim()) return;
    try {
      const request = JSON.parse(line);
      const response = await server.handleRequest(request);
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: response }) + '\n');
    } catch (err) {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', error: { message: err.message } }) + '\n');
    }
  });
} else if (command === '--version' || command === '-v') {
  console.log('renderoni v0.1.0');
} else {
  console.log(`
🍝 Renderoni — The Agent-Native 3D Game Engine for TypeScript

Usage:
  renderoni mcp         Start the Model Context Protocol (MCP) server over stdio
  renderoni --version   Print the current version
  renderoni --help      Show this help message
`);
}

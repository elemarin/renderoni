#!/usr/bin/env node

/**
 * Renderoni CLI Binary
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRenderoni } from '../dist/index.js';
import { serveStdio } from '../dist/mcp/index.js';

// Derive the CLI version from package.json (the release source of truth) so it
// never drifts from a second hardcoded literal.
const __dirname = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

const args = process.argv.slice(2);
const command = args[0];

if (command === 'mcp') {
  // Answer MCP initialize immediately; create the headless world on first tool call.
  await serveStdio({
    transport: 'stdio',
    createGame: () => createRenderoni({ mode: 'headless' }),
  });
} else if (command === '--version' || command === '-v') {
  console.log(`renderoni v${version}`);
} else {
  console.log(`
🍝 Renderoni — The Agent-Native 3D Game Engine for TypeScript

Usage:
  renderoni mcp         Start the Model Context Protocol (MCP) server over stdio
  renderoni --version   Print the current version
  renderoni --help      Show this help message
`);
}

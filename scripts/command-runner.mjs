import { execFileSync } from 'node:child_process';

const WINDOWS_BATCH_COMMANDS = new Map([
  ['npm', 'npm.cmd'],
  ['npx', 'npx.cmd'],
]);

/**
 * Builds an execFile-compatible invocation. Node cannot directly exec .cmd
 * files on Windows, so npm and npx are run through cmd.exe there. Keeping the
 * batch command and each argument separate lets execFile preserve quoting.
 */
export function resolveCommand(command, args = [], {
  platform = process.platform,
  comSpec = process.env.ComSpec ?? process.env.COMSPEC ?? 'cmd.exe',
} = {}) {
  if (platform !== 'win32' || !WINDOWS_BATCH_COMMANDS.has(command)) {
    return { command, args: [...args] };
  }
  const executable = WINDOWS_BATCH_COMMANDS.get(command);

  return {
    command: comSpec,
    args: ['/d', '/v:off', '/s', '/c', executable, ...args],
  };
}

export function runCommandSync(command, args = [], options = {}) {
  const { command: executable, args: invocationArgs } = resolveCommand(command, args);
  return execFileSync(executable, invocationArgs, options);
}

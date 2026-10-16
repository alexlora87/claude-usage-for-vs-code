import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { UsageError } from '../shared/types';

const run = promisify(execFile);
const KEYCHAIN_SERVICE = 'Claude Code-credentials';

export function extractToken(raw: string): string | undefined {
  try {
    const token = JSON.parse(raw)?.claudeAiOauth?.accessToken;
    return typeof token === 'string' && token ? token : undefined;
  } catch {
    return undefined;
  }
}

async function fromFile(): Promise<string | undefined> {
  const dir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
  try {
    return extractToken(await readFile(join(dir, '.credentials.json'), 'utf8'));
  } catch {
    return undefined;
  }
}

async function fromKeychain(): Promise<string | undefined> {
  if (process.platform !== 'darwin') {
    return undefined;
  }
  try {
    const { stdout } = await run('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w']);
    return extractToken(stdout.trim());
  } catch {
    return undefined;
  }
}

/** Reads the Claude Code OAuth access token. It is never cached or logged. */
export async function readAccessToken(): Promise<string> {
  const token = (await fromFile()) ?? (await fromKeychain());
  if (!token) {
    throw new UsageError('no-credentials', 'Claude Code credentials not found; sign in to Claude Code first');
  }
  return token;
}

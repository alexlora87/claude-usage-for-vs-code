import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { t } from '@vscode/l10n';
import { UsageError } from '../shared/types';

const run = promisify(execFile);
const KEYCHAIN_SERVICE = 'Claude Code-credentials';
const KEYCHAIN_TIMEOUT_MS = 10_000;

interface Credentials {
  token: string;
  /** Epoch milliseconds, when Claude Code recorded it. */
  expiresAt?: number;
}

export function configDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
}

export function extractCredentials(raw: string): Credentials | undefined {
  try {
    const oauth = JSON.parse(raw)?.claudeAiOauth;
    if (typeof oauth?.accessToken !== 'string' || !oauth.accessToken) {
      return undefined;
    }
    return { token: oauth.accessToken, expiresAt: typeof oauth.expiresAt === 'number' ? oauth.expiresAt : undefined };
  } catch {
    return undefined;
  }
}

async function fromFile(): Promise<Credentials | undefined> {
  try {
    return extractCredentials(await readFile(join(configDir(), '.credentials.json'), 'utf8'));
  } catch {
    return undefined;
  }
}

async function fromKeychain(): Promise<Credentials | undefined> {
  if (process.platform !== 'darwin') {
    return undefined;
  }
  try {
    const { stdout } = await run('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'], {
      timeout: KEYCHAIN_TIMEOUT_MS,
    });
    return extractCredentials(stdout.trim());
  } catch {
    return undefined;
  }
}

/** Reads the Claude Code OAuth access token. It is never cached or logged. */
export async function readAccessToken(now = Date.now()): Promise<string> {
  const credentials = (await fromFile()) ?? (await fromKeychain());
  if (!credentials) {
    throw new UsageError('no-credentials', t('Claude Code credentials not found; sign in to Claude Code first'));
  }
  if (credentials.expiresAt !== undefined && credentials.expiresAt <= now) {
    throw new UsageError('token-expired', t('The Claude Code token expired; open Claude Code to refresh it'));
  }
  return credentials.token;
}

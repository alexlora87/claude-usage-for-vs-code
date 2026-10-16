import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readAccessToken } from './credentials';

const original = process.env.CLAUDE_CONFIG_DIR;

function configWith(oauth: object): void {
  const dir = mkdtempSync(join(tmpdir(), 'cu-creds-'));
  writeFileSync(join(dir, '.credentials.json'), JSON.stringify({ claudeAiOauth: oauth }));
  process.env.CLAUDE_CONFIG_DIR = dir;
}

afterEach(() => {
  process.env.CLAUDE_CONFIG_DIR = original;
});

describe('readAccessToken', () => {
  it('returns a valid token', async () => {
    configWith({ accessToken: 'abc', expiresAt: 2_000 });
    expect(await readAccessToken(1_000)).toBe('abc');
  });

  it('fails with token-expired when expiresAt has passed', async () => {
    configWith({ accessToken: 'abc', expiresAt: 500 });
    await expect(readAccessToken(1_000)).rejects.toMatchObject({ kind: 'token-expired' });
  });

  it.skipIf(process.platform === 'darwin')('fails with no-credentials when the file is missing', async () => {
    process.env.CLAUDE_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'cu-creds-'));
    await expect(readAccessToken()).rejects.toMatchObject({ kind: 'no-credentials' });
  });
});

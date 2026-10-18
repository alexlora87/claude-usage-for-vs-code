import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearMute, muteChoices, muteFile, readMutedUntil, writeMute } from './mute';

const MIN = 60_000;
const HOUR = 60 * MIN;
const now = new Date(2026, 9, 16, 12, 0).getTime();

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mute-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('the mute file', () => {
  it('is per account', () => {
    expect(muteFile(dir, 'a')).not.toBe(muteFile(dir, 'b'));
  });

  it('reads back what was written, and nothing once it expires', () => {
    const path = muteFile(dir, 'a');
    expect(writeMute(path, now + HOUR)).toBe(true);
    expect(readMutedUntil(path, now)).toBe(now + HOUR);
    expect(readMutedUntil(path, now + HOUR)).toBeUndefined();
    expect(readMutedUntil(path, now + 2 * HOUR)).toBeUndefined();
  });

  it('leaves no temporary file behind', () => {
    writeMute(muteFile(dir, 'a'), now + HOUR);
    expect(readdirSync(dir)).toEqual(['muted-a.json']);
  });

  it('creates the folder and replaces an earlier mute', () => {
    const path = join(dir, 'nested', 'muted-a.json');
    expect(writeMute(path, now + HOUR)).toBe(true);
    expect(writeMute(path, now + 2 * HOUR)).toBe(true);
    expect(readMutedUntil(path, now)).toBe(now + 2 * HOUR);
  });

  it('is not muted without a file or with a file that cannot be understood', () => {
    const path = muteFile(dir, 'a');
    expect(readMutedUntil(path, now)).toBeUndefined();
    for (const content of ['not json', 'null', '{}', '{"until":"soon"}', '{"until":null}']) {
      writeFileSync(path, content);
      expect(readMutedUntil(path, now)).toBeUndefined();
    }
  });

  it('reports a mute that could not be saved', () => {
    // A file where the folder should be.
    writeFileSync(join(dir, 'file'), '');
    expect(writeMute(join(dir, 'file', 'muted-a.json'), now + HOUR)).toBe(false);
  });

  it('is cleared, also when there was nothing to clear', () => {
    const path = muteFile(dir, 'a');
    writeMute(path, now + HOUR);
    clearMute(path);
    expect(existsSync(path)).toBe(false);
    expect(() => clearMute(path)).not.toThrow();
  });
});

describe('muteChoices', () => {
  const usage = {
    session: { percent: 50, resetsAt: new Date(now + 2 * HOUR) },
    weekly: { percent: 20, resetsAt: new Date(now + 3 * 24 * HOUR) },
  };
  const all = { windows: 'both' as const, showSpend: true };

  it('offers an hour, and the reset of each window', () => {
    const choices = muteChoices(usage, all, now);
    expect(choices.map((c) => [c.label, c.until])).toEqual([
      ['Mute for 1 hour', now + HOUR],
      ['Mute until the session resets', now + 2 * HOUR],
      ['Mute until the weekly window resets', now + 3 * 24 * HOUR],
    ]);
    expect(choices[1].description).toBe('today at 14:00');
  });

  it('leaves out the windows the settings hide', () => {
    expect(muteChoices(usage, { windows: 'weekly', showSpend: true }, now).map((c) => c.label)).toEqual(['Mute for 1 hour', 'Mute until the weekly window resets']);
  });

  it('leaves out a window without reset time or already reset, and offers only the hour without usage', () => {
    expect(muteChoices({ session: { percent: 5 }, weekly: { percent: 5, resetsAt: new Date(now - 1) } }, all, now).map((c) => c.label)).toEqual(['Mute for 1 hour']);
    expect(muteChoices(undefined, all, now).map((c) => c.label)).toEqual(['Mute for 1 hour']);
  });
});

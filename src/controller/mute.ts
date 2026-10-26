import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { t } from '../shared/l10n';
import { Usage } from '../shared/types';
import { formatResetTime, ViewOptions, visibleUsage } from './format';

const HOUR = 60 * 60_000;

/** Where the mute of an account is kept, so every VS Code window sees it. */
export function muteFile(dir: string, account: string): string {
  return join(dir, `muted-${account}.json`);
}

/** When the mute ends, or undefined when notifications are not muted (no file, expired or unreadable). */
export function readMutedUntil(path: string, now: number): number | undefined {
  try {
    const until = (JSON.parse(readFileSync(path, 'utf8')) as { until?: unknown } | null)?.until;
    return typeof until === 'number' && Number.isFinite(until) && until > now ? until : undefined;
  } catch {
    return undefined;
  }
}

/** False when the mute could not be saved, so the caller can say so. */
export function writeMute(path: string, until: number): boolean {
  const temp = `${path}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(temp, JSON.stringify({ until }), { flag: 'wx', mode: 0o600 });
    renameSync(temp, path);
    return true;
  } catch {
    try {
      unlinkSync(temp);
    } catch {
      // The temporary file was never created.
    }
    return false;
  }
}

export function clearMute(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    // Already unmuted, maybe from another window.
  }
}

export interface MuteChoice {
  label: string;
  description?: string;
  /** When the mute ends, ms since epoch. */
  until: number;
}

/** How long to mute: an hour, or until a visible window resets. */
export function muteChoices(usage: Usage | undefined, options: Pick<ViewOptions, 'windows' | 'showSpend'>, now: number): MuteChoice[] {
  const choices: MuteChoice[] = [{ label: t('Mute for 1 hour'), until: now + HOUR }];
  const { session, weekly } = usage ? visibleUsage(usage, options) : { session: undefined, weekly: undefined };
  for (const [label, window] of [[t('Mute until the session resets'), session], [t('Mute until the weekly window resets'), weekly]] as const) {
    if (window?.resetsAt && window.resetsAt.getTime() > now) {
      choices.push({ label, description: formatResetTime(window.resetsAt, now), until: window.resetsAt.getTime() });
    }
  }
  return choices;
}

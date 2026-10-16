import { Usage, UsageError, UsageWindow } from '../shared/types';

const URL = 'https://api.anthropic.com/api/oauth/usage';
const TIMEOUT_MS = 15_000;
const MAX_RETRY_AFTER_MS = 60 * 60_000;

type Fetch = typeof fetch;
type RawLimit = { kind?: unknown; group?: unknown; percent?: unknown; utilization?: unknown; resets_at?: unknown };

function toWindow(raw: RawLimit | null | undefined): UsageWindow | undefined {
  const percent = raw?.percent ?? raw?.utilization;
  if (typeof percent !== 'number' || !Number.isFinite(percent)) {
    return undefined;
  }
  const window: UsageWindow = { percent: Math.min(100, Math.max(0, percent)) };
  if (typeof raw?.resets_at === 'string') {
    const date = new Date(raw.resets_at);
    if (!Number.isNaN(date.getTime())) {
      window.resetsAt = date;
    }
  }
  return window;
}

/** Prefers the exact `kind`; `group` is only a fallback, since groups may hold per-model limits. */
function findLimit(limits: RawLimit[], kind: string, group: string): RawLimit | undefined {
  return limits.find((l) => l?.kind === kind) ?? limits.find((l) => l?.group === group);
}

export function parseUsage(body: unknown): Usage {
  const data = body as { limits?: unknown; five_hour?: RawLimit; seven_day?: RawLimit } | null;
  const limits = Array.isArray(data?.limits) ? (data.limits as RawLimit[]) : [];
  const usage: Usage = {
    session: toWindow(findLimit(limits, 'session', 'session')) ?? toWindow(data?.five_hour),
    weekly: toWindow(findLimit(limits, 'weekly_all', 'weekly')) ?? toWindow(data?.seven_day),
  };
  if (!usage.session && !usage.weekly) {
    throw new UsageError('unknown', 'Unexpected usage response format');
  }
  return usage;
}

/** Parses a Retry-After header (seconds or HTTP date) into milliseconds, capped at one hour. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) {
    return undefined;
  }
  const seconds = Number(value);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
  return Number.isNaN(ms) ? undefined : Math.min(MAX_RETRY_AFTER_MS, Math.max(0, ms));
}

export async function fetchUsage(token: string, fetchFn: Fetch = fetch): Promise<Usage> {
  let response: Response;
  try {
    response = await fetchFn(URL, {
      headers: { Authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new UsageError('offline', 'Could not reach the Anthropic API');
  }
  if (response.status === 429) {
    throw new UsageError('rate-limited', 'Rate limited by the API', parseRetryAfter(response.headers.get('retry-after')));
  }
  if (response.status === 401 || response.status === 403) {
    throw new UsageError('unauthorized', 'Claude Code credentials were rejected; open Claude Code to sign in again');
  }
  if (!response.ok) {
    throw new UsageError('unknown', `Usage request failed (HTTP ${response.status})`);
  }
  return parseUsage(await response.json());
}

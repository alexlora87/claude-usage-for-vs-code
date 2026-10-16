import { Usage, UsageError, UsageWindow } from '../shared/types';

const BASE_URL = 'https://api.anthropic.com';
const PRIMARY_PATH = '/api/oauth/usage';
const FALLBACK_PATH = '/api/usage';
const FALLBACK_STATUSES = [404, 405, 501];

type Fetch = typeof fetch;

function toWindow(limit: { percent?: unknown; resets_at?: unknown }): UsageWindow | undefined {
  if (typeof limit.percent !== 'number' || !Number.isFinite(limit.percent)) {
    return undefined;
  }
  const window: UsageWindow = { percent: Math.min(100, Math.max(0, limit.percent)) };
  if (typeof limit.resets_at === 'string') {
    const date = new Date(limit.resets_at);
    if (!Number.isNaN(date.getTime())) {
      window.resetsAt = date;
    }
  }
  return window;
}

export function parseUsage(body: unknown): Usage {
  const limits = (body as { limits?: unknown })?.limits;
  if (!Array.isArray(limits)) {
    throw new UsageError('unknown', 'Unexpected usage response format');
  }
  const usage: Usage = {};
  for (const limit of limits) {
    if (limit?.group === 'session' || limit?.kind === 'session') {
      usage.session ??= toWindow(limit);
    } else if (limit?.group === 'weekly' || limit?.kind === 'weekly_all') {
      usage.weekly ??= toWindow(limit);
    }
  }
  return usage;
}

/** Parses a Retry-After header (seconds or HTTP date) into milliseconds. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) {
    return undefined;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

async function request(path: string, token: string, fetchFn: Fetch): Promise<Response> {
  try {
    return await fetchFn(BASE_URL + path, {
      headers: { Authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20' },
    });
  } catch {
    throw new UsageError('offline', 'Could not reach the Anthropic API');
  }
}

export async function fetchUsage(token: string, fetchFn: Fetch = fetch): Promise<Usage> {
  let response = await request(PRIMARY_PATH, token, fetchFn);
  if (FALLBACK_STATUSES.includes(response.status)) {
    response = await request(FALLBACK_PATH, token, fetchFn);
  }
  if (response.status === 429) {
    throw new UsageError('rate-limited', 'Rate limited by the API', parseRetryAfter(response.headers.get('retry-after')));
  }
  if (response.status === 401 || response.status === 403) {
    throw new UsageError('unauthorized', 'Claude Code credentials were rejected; sign in again');
  }
  if (!response.ok) {
    throw new UsageError('unknown', `Usage request failed (HTTP ${response.status})`);
  }
  return parseUsage(await response.json());
}

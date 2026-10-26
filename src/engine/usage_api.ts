import { t } from '../shared/l10n';
import { Spend, Usage, UsageError, UsageWindow } from '../shared/types';

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

type RawExtraUsage = {
  is_enabled?: unknown;
  monthly_limit?: unknown;
  used_credits?: unknown;
  decimal_places?: unknown;
  currency?: unknown;
  spend_limit_reached?: unknown;
};

/** Decimal digits of a currency's minor unit (2 for USD, 0 for JPY). */
function currencyDigits(currency: string): number {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** Amounts arrive in minor units of the currency (cents for USD). Only enabled spend with a limit counts. */
function toSpend(raw: RawExtraUsage | null | undefined): Spend | undefined {
  if (!raw?.is_enabled) {
    return undefined;
  }
  const { monthly_limit: limit, used_credits: used } = raw;
  if (typeof limit !== 'number' || typeof used !== 'number' || !(limit > 0) || !Number.isFinite(used)) {
    return undefined;
  }
  const currency = typeof raw.currency === 'string' && raw.currency ? raw.currency : 'USD';
  const places = raw.decimal_places;
  const digits = typeof places === 'number' && Number.isInteger(places) && places >= 0 && places <= 4 ? places : currencyDigits(currency);
  const scale = 10 ** digits;
  return {
    used: used / scale,
    limit: limit / scale,
    currency,
    percent: Math.min(100, Math.max(0, (used / limit) * 100)),
    limitReached: raw.spend_limit_reached === true || used >= limit,
  };
}

export function parseUsage(body: unknown): Usage {
  const data = body as { limits?: unknown; five_hour?: RawLimit; seven_day?: RawLimit; extra_usage?: RawExtraUsage } | null;
  const limits = Array.isArray(data?.limits) ? (data.limits as RawLimit[]) : [];
  const usage: Usage = {
    session: toWindow(findLimit(limits, 'session', 'session')) ?? toWindow(data?.five_hour),
    weekly: toWindow(findLimit(limits, 'weekly_all', 'weekly')) ?? toWindow(data?.seven_day),
    spend: toSpend(data?.extra_usage),
  };
  if (!usage.session && !usage.weekly && !usage.spend) {
    throw new UsageError('unknown', t('Unexpected usage response format'));
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
    throw new UsageError('offline', t('Could not reach the Anthropic API'));
  }
  if (response.status === 429) {
    throw new UsageError('rate-limited', t('Rate limited by the API'), parseRetryAfter(response.headers.get('retry-after')));
  }
  if (response.status === 401 || response.status === 403) {
    throw new UsageError('unauthorized', t('Claude Code credentials were rejected; open Claude Code to sign in again'));
  }
  if (!response.ok) {
    throw new UsageError('unknown', t('Usage request failed (HTTP {0})', response.status));
  }
  return parseUsage(await response.json());
}

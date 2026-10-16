import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { UsageError } from '../shared/types';
import { extractCredentials } from './credentials';
import { fetchUsage, parseRetryAfter, parseUsage } from './usage_api';

const sample = JSON.parse(readFileSync('docs/samples/usage-response.json', 'utf8'));

function respond(status: number, body: unknown = sample, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

describe('parseUsage', () => {
  it('parses the real response sample', () => {
    const usage = parseUsage(sample);
    expect(usage.session?.percent).toBe(7);
    expect(usage.session?.resetsAt?.toISOString()).toBe('2026-10-16T23:40:00.021Z');
    expect(usage.weekly?.percent).toBe(12);
  });

  it('leaves resetsAt undefined when missing or invalid', () => {
    const usage = parseUsage({ limits: [{ kind: 'session', percent: 5 }, { group: 'weekly', percent: 6, resets_at: 'x' }] });
    expect(usage.session?.resetsAt).toBeUndefined();
    expect(usage.weekly?.resetsAt).toBeUndefined();
  });

  it('rejects a response without any usable window', () => {
    expect(() => parseUsage({})).toThrow(UsageError);
  });

  it('prefers the exact kind over the first entry of a group', () => {
    const usage = parseUsage({
      limits: [
        { kind: 'weekly_opus', group: 'weekly', percent: 90 },
        { kind: 'weekly_all', group: 'weekly', percent: 12 },
      ],
    });
    expect(usage.weekly?.percent).toBe(12);
  });

  it('falls back to five_hour and seven_day when limits is missing', () => {
    const usage = parseUsage({ five_hour: { utilization: 7, resets_at: '2026-10-16T23:40:00Z' }, seven_day: { utilization: 12 } });
    expect(usage.session?.percent).toBe(7);
    expect(usage.weekly?.percent).toBe(12);
  });
});

describe('parseRetryAfter', () => {
  it('reads seconds and HTTP dates', () => {
    expect(parseRetryAfter('30')).toBe(30_000);
    expect(parseRetryAfter('Thu, 01 Jan 1970 00:01:00 GMT', 0)).toBe(60_000);
    expect(parseRetryAfter('3600000')).toBe(3_600_000);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('soon')).toBeUndefined();
  });
});

describe('fetchUsage', () => {
  it('sends the bearer token and beta header', async () => {
    const fetchFn = vi.fn().mockResolvedValue(respond(200));
    await fetchUsage('tok', fetchFn);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/api/oauth/usage');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.headers).toEqual({ Authorization: 'Bearer tok', 'anthropic-beta': 'oauth-2025-04-20' });
  });

  it('maps 429 with Retry-After', async () => {
    const fetchFn = vi.fn().mockResolvedValue(respond(429, {}, { 'retry-after': '45' }));
    await expect(fetchUsage('tok', fetchFn)).rejects.toMatchObject({ kind: 'rate-limited', retryAfterMs: 45_000 });
  });

  it('maps 401 and network failures', async () => {
    await expect(fetchUsage('tok', vi.fn().mockResolvedValue(respond(401)))).rejects.toMatchObject({ kind: 'unauthorized' });
    await expect(fetchUsage('tok', vi.fn().mockRejectedValue(new Error('down')))).rejects.toMatchObject({ kind: 'offline' });
  });

  it('never includes the token in error messages', async () => {
    const error = await fetchUsage('secret-token', vi.fn().mockResolvedValue(respond(500))).catch((e) => e);
    expect(error.message).not.toContain('secret-token');
  });
});

describe('extractCredentials', () => {
  it('reads the token and expiry', () => {
    expect(extractCredentials('{"claudeAiOauth":{"accessToken":"abc","expiresAt":123}}')).toEqual({ token: 'abc', expiresAt: 123 });
  });

  it('returns undefined for bad input', () => {
    expect(extractCredentials('not json')).toBeUndefined();
    expect(extractCredentials('{"claudeAiOauth":{}}')).toBeUndefined();
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { UsageError } from '../shared/types';
import { extractToken } from './credentials';
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

  it('rejects a response without limits', () => {
    expect(() => parseUsage({})).toThrow(UsageError);
  });
});

describe('parseRetryAfter', () => {
  it('reads seconds and HTTP dates', () => {
    expect(parseRetryAfter('30')).toBe(30_000);
    expect(parseRetryAfter('Thu, 01 Jan 1970 00:01:00 GMT', 0)).toBe(60_000);
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
    expect(init.headers).toEqual({ Authorization: 'Bearer tok', 'anthropic-beta': 'oauth-2025-04-20' });
  });

  it('falls back to /api/usage on 404', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(respond(404)).mockResolvedValueOnce(respond(200));
    await fetchUsage('tok', fetchFn);
    expect(fetchFn.mock.calls[1][0]).toBe('https://api.anthropic.com/api/usage');
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

describe('extractToken', () => {
  it('reads claudeAiOauth.accessToken', () => {
    expect(extractToken('{"claudeAiOauth":{"accessToken":"abc"}}')).toBe('abc');
  });

  it('returns undefined for bad input', () => {
    expect(extractToken('not json')).toBeUndefined();
    expect(extractToken('{"claudeAiOauth":{}}')).toBeUndefined();
  });
});

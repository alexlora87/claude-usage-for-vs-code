import { describe, expect, it } from 'vitest';
import { Sample } from '../engine/history';
import { escapeHtml, renderHistoryHtml, segments } from './history_html';

const MIN = 60_000;
const HOUR = 60 * MIN;
const now = new Date(2026, 9, 16, 12, 0).getTime();
const reset = now + 3 * HOUR;
const session = (t: number, percent: number, resetsAt = reset): Sample => ({ t, session: { percent, resetsAt } });

describe('segments', () => {
  it('keeps readings of one cycle in one line', () => {
    const result = segments([session(now - 20 * MIN, 10), session(now - 10 * MIN, 12)], 'session', now);
    expect(result).toHaveLength(1);
    expect(result[0].points.map((p) => p.percent)).toEqual([10, 12]);
  });

  it('cuts the line at a gap and at a new cycle', () => {
    const gap = [session(now - 3 * HOUR, 10), session(now - 2 * HOUR, 12)];
    expect(segments(gap, 'session', now)).toHaveLength(2);
    const reseted = [session(now - 20 * MIN, 90, reset - 5 * HOUR), session(now - 10 * MIN, 2)];
    expect(segments(reseted, 'session', now)).toHaveLength(2);
  });

  it('does not cut for small jitter in the reset time', () => {
    expect(segments([session(now - 20 * MIN, 10), session(now - 10 * MIN, 12, reset + 1000)], 'session', now)).toHaveLength(1);
  });

  it('cuts the spend line when the spend drops', () => {
    const spend = (t: number, used: number): Sample => ({ t, spend: { percent: used / 8, used, limit: 800 } });
    expect(segments([spend(now - 20 * MIN, 700), spend(now - 10 * MIN, 3)], 'spend', now)).toHaveLength(2);
  });

  it('ignores readings older than 7 days', () => {
    expect(segments([session(now - 8 * 24 * HOUR, 10)], 'session', now)).toEqual([]);
  });
});

describe('renderHistoryHtml', () => {
  it('draws one line per series with data and a legend', () => {
    const html = renderHistoryHtml([session(now - 20 * MIN, 10), session(now - 10 * MIN, 12)], now, 'abc');
    expect(html).toContain('<polyline class="session"');
    expect(html).not.toContain('<polyline class="weekly"');
    expect(html).toContain('Session (5hr)');
    expect(html).toContain('<title>Session (5hr): 12%');
  });

  it('draws only the allowed series', () => {
    const samples: Sample[] = [{ t: now - 10 * MIN, session: { percent: 10, resetsAt: reset }, weekly: { percent: 3, resetsAt: reset } }];
    const html = renderHistoryHtml(samples, now, 'abc', ['weekly']);
    expect(html).toContain('<polyline class="weekly"');
    expect(html).not.toContain('<polyline class="session"');
  });

  it('says there is no history yet', () => {
    expect(renderHistoryHtml([], now, 'abc')).toContain('No history yet');
  });

  it('allows no scripts and styles only with the nonce', () => {
    const html = renderHistoryHtml([], now, 'abc');
    expect(html).toContain("default-src 'none'; style-src 'nonce-abc'");
    expect(html).toContain('<style nonce="abc">');
    expect(html).not.toContain('<script');
    expect(html).not.toMatch(/style="/);
  });

  it('escapes text', () => {
    expect(escapeHtml('<b>"x"&\'</b>')).toBe('&#60;b&#62;&#34;x&#34;&#38;&#39;&#60;/b&#62;');
  });
});

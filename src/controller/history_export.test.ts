import { describe, expect, it } from 'vitest';
import { reviveSamples, Sample } from '../engine/history';
import { exportFileName, forExport, toCsv, toJson } from './history_export';

const t0 = Date.UTC(2026, 9, 16, 12, 0);
const samples: Sample[] = [
  { t: t0, session: { percent: 42, resetsAt: t0 + 3_600_000 }, weekly: { percent: 71.5, resetsAt: t0 + 86_400_000 }, spend: { percent: 36.45, used: 7.29, limit: 20 } },
  { t: t0 + 300_000, session: { percent: 43 } },
];

describe('toCsv', () => {
  it('writes a header and one row per reading, with ISO times and empty cells for what was not read', () => {
    expect(toCsv(samples).split('\r\n')).toEqual([
      'time,session_percent,session_resets_at,weekly_percent,weekly_resets_at,spend_percent,spend_used,spend_limit',
      '2026-10-16T12:00:00.000Z,42,2026-10-16T13:00:00.000Z,71.5,2026-10-17T12:00:00.000Z,36.45,7.29,20',
      '2026-10-16T12:05:00.000Z,43,,,,,,',
      '',
    ]);
  });

  it('has only the header without readings', () => {
    expect(toCsv([])).toBe('time,session_percent,session_resets_at,weekly_percent,weekly_resets_at,spend_percent,spend_used,spend_limit\r\n');
  });
});

describe('toJson', () => {
  it('keeps every reading so that it can be read back', () => {
    const parsed = JSON.parse(toJson(samples, t0 + 1000));
    expect(parsed.exportedAt).toBe('2026-10-16T12:00:01.000Z');
    expect(reviveSamples(parsed.samples)).toEqual(reviveSamples(samples));
    expect(parsed.samples).toHaveLength(2);
  });
});

describe('forExport', () => {
  it('leaves the spend out when it is hidden, and nothing else', () => {
    const [first] = forExport(samples, false);
    expect(first).toEqual({ t: t0, session: samples[0].session, weekly: samples[0].weekly });
    expect('spend' in first).toBe(false);
    expect(toCsv(forExport(samples, false)).split('\r\n')[1]).toBe('2026-10-16T12:00:00.000Z,42,2026-10-16T13:00:00.000Z,71.5,2026-10-17T12:00:00.000Z,,,');
  });

  it('keeps the spend when it is shown', () => {
    expect(forExport(samples, true)).toEqual(samples);
  });
});

describe('exportFileName', () => {
  it('uses the local date', () => {
    expect(exportFileName(new Date(2026, 0, 5, 23, 59).getTime())).toBe('claude-usage-history-2026-01-05');
  });
});

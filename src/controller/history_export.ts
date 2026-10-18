import { Sample } from '../engine/history';

const COLUMNS = ['time', 'session_percent', 'session_resets_at', 'weekly_percent', 'weekly_resets_at', 'spend_percent', 'spend_used', 'spend_limit'];

const iso = (t: number | undefined) => (t === undefined ? '' : new Date(t).toISOString());
const cell = (value: number | undefined) => (value === undefined ? '' : String(value));

/** The readings as the user's settings allow: the spend is left out when it is hidden. */
export function forExport(samples: Sample[], includeSpend: boolean): Sample[] {
  return includeSpend ? samples : samples.map(({ spend: _spend, ...rest }) => rest);
}

/** One row per reading, times in ISO 8601 UTC, an empty cell where a window was not read. */
export function toCsv(samples: Sample[]): string {
  const rows = samples.map((s) => [
    iso(s.t),
    cell(s.session?.percent),
    iso(s.session?.resetsAt),
    cell(s.weekly?.percent),
    iso(s.weekly?.resetsAt),
    cell(s.spend?.percent),
    cell(s.spend?.used),
    cell(s.spend?.limit),
  ]);
  return [COLUMNS, ...rows].map((row) => row.join(',')).join('\r\n') + '\r\n';
}

/** The readings as they are stored (times in ms since epoch), with when they were exported. */
export function toJson(samples: Sample[], now: number): string {
  return JSON.stringify({ exportedAt: iso(now), samples }, null, 2) + '\n';
}

/** `claude-usage-history-2026-10-16`, with the local date. */
export function exportFileName(now: number): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `claude-usage-history-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

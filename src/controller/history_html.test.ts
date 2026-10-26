import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Sample } from '../engine/history';
import { setLanguage } from '../shared/l10n';
import { renderHistoryHtml } from './history_html';

const MIN = 60_000;
const HOUR = 60 * MIN;
const now = new Date(2026, 9, 16, 12, 0).getTime();
const reset = now + 3 * HOUR;
const session = (t: number, percent: number, resetsAt = reset): Sample => ({ t, session: { percent, resetsAt } });

describe('renderHistoryHtml', () => {
  it('draws the panels of the series that have data', () => {
    const html = renderHistoryHtml([session(now - 20 * MIN, 10), session(now - 10 * MIN, 12)], now, 'abc');
    expect(html).toContain('Sessions (5hr)');
    expect(html).not.toContain('Weekly (7 day)');
    expect(html).toContain('Session in progress · 12% so far');
  });

  it('draws only the allowed series', () => {
    const samples: Sample[] = [{ t: now - 10 * MIN, session: { percent: 10, resetsAt: reset }, weekly: { percent: 3, resetsAt: reset } }];
    const html = renderHistoryHtml(samples, now, 'abc', ['weekly']);
    expect(html).toContain('Weekly (7 day)');
    expect(html).not.toContain('Sessions (5hr)');
  });

  it('labels each day once across a daylight saving change', () => {
    const zone = process.env.TZ;
    process.env.TZ = 'Europe/Madrid';
    try {
      const html = renderHistoryHtml([], Date.UTC(2026, 9, 28, 12), 'abc');
      expect(html).toContain('No history yet');
      const withData = renderHistoryHtml([{ t: Date.UTC(2026, 9, 28, 11), session: { percent: 5, resetsAt: Date.UTC(2026, 9, 28, 15) } }], Date.UTC(2026, 9, 28, 12), 'abc');
      const labels = [...withData.matchAll(/text-anchor="middle">([^<]+)</g)].map((m) => m[1]);
      expect(labels).toEqual(['Thu 22', 'Fri 23', 'Sat 24', 'Sun 25', 'Mon 26', 'Tue 27', 'Wed 28']);
    } finally {
      if (zone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = zone;
      }
    }
  });

  it('says there is no history yet', () => {
    expect(renderHistoryHtml([], now, 'abc')).toContain('No history yet');
  });

  it('allows no scripts and styles only with the nonce, also with the charts drawn', () => {
    const hot = { t: now - 5 * 60_000, session: { percent: 95, resetsAt: now + 60 * 60_000 }, weekly: { percent: 40, resetsAt: now + 24 * 60 * 60_000 } };
    const html = renderHistoryHtml([hot], now, 'abc');
    expect(html).toContain('hot-hatch');
    expect(html).toContain('class="pace"');
    expect(html).toContain("default-src 'none'; style-src 'nonce-abc'");
    expect(html).toContain('<style nonce="abc">');
    expect(html).not.toContain('<script');
    expect(html).not.toMatch(/style="/);
  });
});

describe('renderHistoryHtml in Spanish', () => {
  beforeEach(() => setLanguage('es'));
  afterEach(() => setLanguage('en'));

  it('writes the page and the charts in Spanish', () => {
    const html = renderHistoryHtml([session(now - 20 * MIN, 10), session(now - 10 * MIN, 12)], now, 'abc');
    expect(html).toContain('<html lang="es">');
    expect(html).toContain('<h1>Historial de Claude Usage</h1>');
    expect(html).toContain('Sesiones (5 h)');
    expect(html).toContain('Sesión en curso · 12% hasta ahora');
    expect(html).toContain('Últimos 7 días · 1 sesión, 0 al 90% o más');
  });

  it('says there is no history yet', () => {
    expect(renderHistoryHtml([], now, 'abc')).toContain('Todavía no hay historial');
  });
});

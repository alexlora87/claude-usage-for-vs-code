const STEP = 5;

export type Indicator = 'ring' | 'bar';

/** Glyph of the bundled icon font in the chosen style, rounded to the nearest 5%. */
export function iconFor(percent: number, indicator: Indicator): string {
  const clamped = Math.min(100, Math.max(0, percent));
  const step = String(Math.round(clamped / STEP) * STEP).padStart(2, '0');
  return `$(claude-usage-${indicator}-${step})`;
}

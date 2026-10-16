const STEP = 5;

/** Ring glyph from the bundled icon font, rounded to the nearest 5%. */
export function iconFor(percent: number): string {
  const clamped = Math.min(100, Math.max(0, percent));
  const step = String(Math.round(clamped / STEP) * STEP).padStart(2, '0');
  return `$(claude-usage-ring-${step})`;
}

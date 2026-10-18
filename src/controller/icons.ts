const STEP = 5;

/** Glyph set of the icon font: the ring, or the progress bar in one of its three lengths. */
export type IconStyle = 'ring' | 'bar-small' | 'bar-medium' | 'bar-big';

/** Glyph of the bundled icon font in the chosen style, rounded to the nearest 5%. */
export function iconFor(percent: number, style: IconStyle): string {
  const clamped = Math.min(100, Math.max(0, percent));
  const step = String(Math.round(clamped / STEP) * STEP).padStart(2, '0');
  return `$(claude-usage-${style}-${step})`;
}

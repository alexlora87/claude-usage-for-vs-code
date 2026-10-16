const STEPS = ['○', '◔', '◑', '◕', '●'];

/** Quarter-step circle for a usage percentage. */
export function iconFor(percent: number): string {
  return STEPS[Math.min(STEPS.length - 1, Math.round(percent / 25))];
}

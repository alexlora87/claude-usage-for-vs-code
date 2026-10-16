export interface UsageWindow {
  /** Percentage of the window already used, 0-100. */
  percent: number;
  /** Reset time, when the API provides it. */
  resetsAt?: Date;
}

export interface Usage {
  session?: UsageWindow;
  weekly?: UsageWindow;
}

export type UsageErrorKind = 'no-credentials' | 'unauthorized' | 'rate-limited' | 'offline' | 'unknown';

export class UsageError extends Error {
  constructor(
    readonly kind: UsageErrorKind,
    message: string,
    /** Milliseconds to wait before retrying, from a Retry-After header. */
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

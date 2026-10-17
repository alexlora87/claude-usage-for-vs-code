export interface UsageWindow {
  /** Percentage of the window already used, 0-100. */
  percent: number;
  /** Reset time, when the API provides it. */
  resetsAt?: Date;
}

/** Monthly extra-usage spend, as on accounts billed by money instead of by window. */
export interface Spend {
  /** Amounts in major units of `currency`, e.g. 7.29. */
  used: number;
  limit: number;
  currency: string;
  /** Percentage of the monthly limit already spent, 0-100. */
  percent: number;
  limitReached: boolean;
}

export interface Usage {
  session?: UsageWindow;
  weekly?: UsageWindow;
  spend?: Spend;
}

export type UsageErrorKind = 'no-credentials' | 'token-expired' | 'unauthorized' | 'rate-limited' | 'offline' | 'unknown';

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

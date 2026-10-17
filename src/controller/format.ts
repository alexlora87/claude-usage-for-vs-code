import type { ViewState } from '../engine/scheduler';
import { Spend, Usage, UsageErrorKind, UsageWindow } from '../shared/types';

export type Level = 'ok' | 'warning' | 'critical';

const WARNING_AT = 70;
const CRITICAL_AT = 90;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function levelFor(percent: number): Level {
  if (percent >= CRITICAL_AT) {
    return 'critical';
  }
  return percent >= WARNING_AT ? 'warning' : 'ok';
}

/** Worst level across the available windows and the monthly spend. */
export function worstLevel(usage: Usage): Level {
  if (usage.spend?.limitReached) {
    return 'critical';
  }
  const percents = [usage.session, usage.weekly, usage.spend].flatMap((w) => (w ? [w.percent] : []));
  return levelFor(Math.max(0, ...percents));
}

/** `$7.29`; falls back to `7.29 XYZ` for codes Intl does not know. */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function formatSpend(spend: Spend, extended: boolean, icon: string): string {
  const amounts = `${formatMoney(spend.used, spend.currency)} ${extended ? 'of' : '/'} ${formatMoney(spend.limit, spend.currency)}`;
  const text = `${extended ? 'Monthly spend' : 'Spend'} ${amounts} ${icon} ${Math.round(spend.percent)}%`;
  return spend.limitReached ? `${text} · limit reached` : text;
}

/** Time left as `0h 7m`; for the long window `6d 21h`, and just minutes under an hour. */
export function formatRemaining(ms: number, longWindow = false): string {
  const total = Math.max(0, ms);
  const days = Math.floor(total / DAY);
  const hours = Math.floor((total % DAY) / HOUR);
  const minutes = Math.floor((total % HOUR) / MINUTE);
  if (longWindow) {
    if (days > 0) {
      return `${days}d ${hours}h`;
    }
    if (hours === 0) {
      return `${minutes}m`;
    }
  }
  return `${days * 24 + hours}h ${minutes}m`;
}

export interface WindowStyle {
  label: string;
  icon: string;
  resetsPrefix: string;
  longWindow: boolean;
}

export function formatWindow(window: UsageWindow, style: WindowStyle, now: number): string {
  let text = `${style.label} ${style.icon} ${Math.round(window.percent)}%`;
  if (window.resetsAt) {
    text += ` · ${style.resetsPrefix}${formatRemaining(window.resetsAt.getTime() - now, style.longWindow)}`;
  }
  return text;
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** Exact local reset time in 24-hour format, e.g. `today at 18:45` or `Fri, Oct 23 at 22:10`. */
export function formatResetTime(date: Date, now: number): string {
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  const days = Math.round((startOfDay(date) - startOfDay(new Date(now))) / DAY);
  if (days <= 0) {
    return `today at ${time}`;
  }
  if (days === 1 && date.getTime() - now < DAY) {
    return `tomorrow at ${time}`;
  }
  const day = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return `${day} at ${time}`;
}

/** Markdown for the hover: one line per window, joined with a hard line break. */
export function formatTooltip(usage: Usage, now: number): string | undefined {
  const lines: string[] = [];
  if (usage.session?.resetsAt) {
    lines.push(`Session (5hr) · resets ${formatResetTime(usage.session.resetsAt, now)}`);
  }
  if (usage.weekly?.resetsAt) {
    lines.push(`Weekly (7 day) · resets ${formatResetTime(usage.weekly.resetsAt, now)}`);
  }
  if (usage.spend) {
    const { used, limit, currency, limitReached } = usage.spend;
    lines.push(`Monthly spend · ${formatMoney(used, currency)} of ${formatMoney(limit, currency)}${limitReached ? ' · limit reached' : ''}`);
  }
  return lines.length ? lines.join('  \n') : undefined;
}

const ERROR_TEXT: Record<UsageErrorKind, string> = {
  'no-credentials': 'Sign in to Claude Code',
  'token-expired': 'Open Claude Code',
  unauthorized: 'Sign in again',
  'rate-limited': 'Rate limited',
  offline: 'Offline',
  unknown: 'Error',
};

export interface StatusView {
  text: string;
  tooltip?: string;
  level: Level;
}

export const PREFIX = '$(sparkle) Claude Usage';

export interface ViewOptions {
  extended: boolean;
  showSpend: boolean;
}

/** Builds everything the status bar shows from the current state. */
export function buildView(state: ViewState, options: ViewOptions, icon: (percent: number) => string, now: number): StatusView {
  const { extended } = options;
  if (!state.usage) {
    if (state.error) {
      return { text: `${PREFIX}: ${ERROR_TEXT[state.error.kind]}`, tooltip: errorTooltip(state, now), level: 'ok' };
    }
    return { text: `${PREFIX}: loading…`, level: 'ok' };
  }

  const usage: Usage = options.showSpend ? state.usage : { ...state.usage, spend: undefined };
  const { session, weekly, spend } = usage;
  const parts: string[] = [];
  if (session) {
    parts.push(formatWindow(session, {
      label: extended ? 'Session (5hr)' : '5h',
      icon: icon(session.percent),
      resetsPrefix: extended ? 'Resets in ' : '',
      longWindow: false,
    }, now));
  }
  if (weekly) {
    parts.push(formatWindow(weekly, {
      label: extended ? 'Weekly (7 day)' : '7d',
      icon: icon(weekly.percent),
      resetsPrefix: extended ? 'Resets in ' : '',
      longWindow: true,
    }, now));
  }

  if (spend) {
    parts.push(formatSpend(spend, extended, icon(spend.percent)));
  }

  const body = parts.length ? parts.join(' | ') : state.usage.spend ? 'spend hidden' : 'no data';
  const tooltip = [formatTooltip(usage, now), state.stale ? errorTooltip(state, now) : undefined]
    .filter(Boolean)
    .join('\n\n') || undefined;
  return { text: `${PREFIX} · ${state.stale ? '~' : ''}${body}`, tooltip, level: worstLevel(usage) };
}

function errorTooltip(state: ViewState, now: number): string | undefined {
  if (!state.error) {
    return undefined;
  }
  let text = state.error.message;
  if (state.retryAt) {
    const seconds = Math.max(1, Math.ceil((state.retryAt - now) / 1000));
    text += `  \nRetrying in ${seconds >= 60 ? `${Math.ceil(seconds / 60)}m` : `${seconds}s`}`;
  }
  return text;
}

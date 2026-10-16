import type { ViewState } from '../engine/scheduler';
import { Usage, UsageErrorKind, UsageWindow } from '../shared/types';

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

/** Worst level across the available windows. */
export function worstLevel(usage: Usage): Level {
  const percents = [usage.session, usage.weekly].flatMap((w) => (w ? [w.percent] : []));
  return levelFor(Math.max(0, ...percents));
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

const LABEL_WIDTH = 14;

/** Markdown for the hover: the reset lines sit in a code block so the two columns line up. */
export function formatTooltip(usage: Usage, now: number): string | undefined {
  const lines: string[] = [];
  if (usage.session?.resetsAt) {
    lines.push(`${'Session (5hr)'.padEnd(LABEL_WIDTH)}  resets ${formatResetTime(usage.session.resetsAt, now)}`);
  }
  if (usage.weekly?.resetsAt) {
    lines.push(`${'Weekly (7 day)'.padEnd(LABEL_WIDTH)}  resets ${formatResetTime(usage.weekly.resetsAt, now)}`);
  }
  return lines.length ? `\`\`\`\n${lines.join('\n')}\n\`\`\`` : undefined;
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

/** Builds everything the status bar shows from the current state. */
export function buildView(state: ViewState, extended: boolean, icon: (percent: number) => string, now: number): StatusView {
  if (!state.usage) {
    if (state.error) {
      return { text: `${PREFIX}: ${ERROR_TEXT[state.error.kind]}`, tooltip: errorTooltip(state, now), level: 'ok' };
    }
    return { text: `${PREFIX}: loading…`, level: 'ok' };
  }

  const { session, weekly } = state.usage;
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

  const body = parts.length ? parts.join(' | ') : 'no data';
  const tooltip = [formatTooltip(state.usage, now), state.stale ? errorTooltip(state, now) : undefined]
    .filter(Boolean)
    .join('\n\n') || undefined;
  return { text: `${PREFIX} ${state.stale ? '~' : ''}${body}`, tooltip, level: worstLevel(state.usage) };
}

function errorTooltip(state: ViewState, now: number): string | undefined {
  if (!state.error) {
    return undefined;
  }
  let text = state.error.message;
  if (state.retryAt) {
    const seconds = Math.max(1, Math.ceil((state.retryAt - now) / 1000));
    text += `\n\nRetrying in ${seconds >= 60 ? `${Math.ceil(seconds / 60)}m` : `${seconds}s`}`;
  }
  return text;
}

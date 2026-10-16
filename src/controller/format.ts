import { Usage, UsageWindow } from '../shared/types';

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

/** Exact local reset time in 24-hour format, e.g. `today at 18:45` or `Fri, Oct 23 at 22:10`. */
export function formatResetTime(date: Date, now: number): string {
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (date.getTime() - now < DAY) {
    return `today at ${time}`;
  }
  const day = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return `${day} at ${time}`;
}

export function formatTooltip(usage: Usage, now: number): string | undefined {
  const lines: string[] = [];
  if (usage.session?.resetsAt) {
    lines.push(`Session (5hr)    resets ${formatResetTime(usage.session.resetsAt, now)}`);
  }
  if (usage.weekly?.resetsAt) {
    lines.push(`Weekly (7 day)   resets ${formatResetTime(usage.weekly.resetsAt, now)}`);
  }
  return lines.length ? lines.join('\n') : undefined;
}

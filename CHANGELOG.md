# Changelog

## 1.0.0

- Click the status bar item for a menu (refresh, extended view, history, settings). `Ctrl+Alt+U` still refreshes directly.
- Notification once per window cycle when usage reaches the warning or critical threshold (`claudeUsage.notifications`).
- The hover projects when a window or the monthly limit fills up at the current pace.
- **Claude Usage: Show History** shows a chart of the last 7 days. Readings are kept locally for 30 days.
- Settings `claudeUsage.windows`, `claudeUsage.warningThreshold` and `claudeUsage.criticalThreshold`. `windows` also decides which windows color the bar, notify and appear in the history.

## 0.2.1

- The monthly spend hover also shows the amount remaining and the percentage with one decimal.

## 0.2.0

- Monthly credits and limit for accounts billed by money (for example Enterprise), shown only when the account has extra usage enabled with a limit.
- `claudeUsage.showSpend` setting (`auto` or `never`).
- The spend counts for the 70 % and 90 % warning colors, and shows when the limit is reached.

## 0.1.0

- Status bar usage for the 5-hour session and the 7-day window, with ring icons, percentage and time until reset.
- Compact and extended views (`claudeUsage.extendedView`).
- Hover with the exact local reset time of each window (24-hour format).
- Warning colors at 70 % and 90 %.
- Reads Claude Code credentials on Windows, Linux and macOS (credentials file or keychain).
- Windows of the same account share one request through a cache file; exponential backoff on HTTP 429.
- The last good value stays visible, marked with `~`, while a refresh fails (up to 30 minutes).
- Distinct error states (no credentials, expired token, rate limited, offline) with the reason and retry time in the hover.
- Refresh command and `claudeUsage.refreshInterval` setting.

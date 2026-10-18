# Changelog

## 1.4.0

### Added

- **Claude Usage: Mute Notifications…** (also in the menu): silences the notifications for an hour, or until the session or the weekly window resets. Every VS Code window follows it and the hover says until when. What is still above a threshold is notified at the next refresh after the mute ends. **Claude Usage: Unmute Notifications** ends it earlier.
- **Claude Usage: Copy Usage Summary** (also in the menu): copies the usage as one line, for example `Session (5hr) 42% · resets in 2h 10m | Weekly (7 day) 71% · resets in 2d 4h`. It follows `windows` and `showSpend`.
- **Claude Usage: Export History…**: saves the stored readings as CSV or JSON. The spend is left out when `showSpend` is `never`.
- The weekly panel of the history draws up to four earlier cycles as faint lines, at the same time since the start of the cycle, and lists their peaks.
- The history charts are described for screen readers, and the session bars that reached 90 % are striped, so they no longer depend on the red alone.

## 1.3.1

### Added

- `claudeUsage.historyChartSize` setting: `small`, `medium` (default) or `large`, the size of the panels of **Claude Usage: Show History**. The percent axis has a line every 25, 20 or 10 points.

### Changed

- The history panels are taller by default (260 px instead of 190), and the percent axis has a line every 20 points instead of every 25.
- `claudeUsage.barSize` defaults to `medium` (it was `small`).

## 1.3.0

### Changed

- **Claude Usage: Show History** shows separate panels instead of one chart: Sessions (5hr), Weekly (7 day) and Monthly Credits (only for accounts with spend), in that order. The single chart that mixed both windows is gone.
- Sessions: one bar per session of the last 7 days, with the most it reached (red from 90 %).
- Weekly: the current cycle, from its start to its reset, against an even pace, with a mark for now and the projection (where it is on pace to end, or in red when it would fill up before the reset). Readings more than 30 minutes apart are joined with a dotted line, and a cycle that has already ended is shown as the last one.
- Monthly Credits: as before, a line over the last 7 days.

## 1.2.0

### Added

- The hover shows the percent each window is on pace to end at when it resets (`on pace to end at ~55%`), when it would not fill up before.

### Changed

- The projection is also shown when usage is idle (it keeps the current percent), where it used to show nothing. It still needs 3 readings spanning 20 minutes (session) or 6 hours (weekly), and the end percent is hidden in the last 10 minutes before the reset.

## 1.1.0

### Added

- `claudeUsage.indicator` setting: `ring` (default, as before) or `bar`, a progress bar next to each percentage.
- `claudeUsage.barSize` setting: `small` (default), `medium` or `large`, the length of the bar.

### Changed

- The Settings editor lists the settings in a logical order (refresh, view, spend, alerts) instead of alphabetically.

## 1.0.0

### Added

- Click the status bar item for a menu (refresh, extended view, history, settings). `Ctrl+Alt+U` still refreshes directly.
- Notification once per window cycle when usage reaches the warning or critical threshold (`claudeUsage.notifications`).
- The hover projects when a window or the monthly limit fills up at the current pace.
- **Claude Usage: Show History** shows a chart of the last 7 days. Readings are kept locally for 30 days.
- Settings `claudeUsage.windows`, `claudeUsage.warningThreshold` and `claudeUsage.criticalThreshold`. `windows` also decides which windows color the bar, notify and appear in the history.

### Fixed

- A manual refresh pressed while a request was in flight was ignored; it now runs right after that request.
- A failed write of the shared cache left a temporary file in the extension storage.

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

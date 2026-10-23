# Claude Usage for VS Code

Shows your Claude Code plan usage in the VS Code status bar: the 5-hour session and the 7-day window (with the percentage used and the time until each resets), and the monthly spend on accounts billed by money.

> **Unofficial.** Not affiliated with or endorsed by Anthropic. "Claude" is a trademark of Anthropic.

```
✦ Claude Usage · 5h ◔ 32% · 0h 7m | 7d ◔ 4% · 6d 21h
```

With `claudeUsage.extendedView` enabled:

```
✦ Claude Usage · Session (5hr) ◔ 32% · Resets in 0h 7m | Weekly (7 day) ◔ 4% · Resets in 6d 21h
```

## Features

- Reads the credentials Claude Code already stores; there is no separate login.
- A ring next to each percentage, or a progress bar if you prefer it, in three lengths (`claudeUsage.indicator`, `claudeUsage.barSize`).
- Accounts billed by money (for example Enterprise) get their monthly credits and limit: `✦ Claude Usage · Credits $7.29 / $800.00 ◔ 1%`. The hover adds the amount remaining and the exact percentage. It only appears when the account has extra usage enabled with a limit.
- The status bar turns yellow from 70 % and red from 90 % (the worst of the windows and the monthly spend). Both thresholds are settings.
- Hover for the exact local reset time of each window (24-hour format). At the current pace, the hover also says when a window would fill up before it resets, or else the percent it is on pace to end at when it resets (`on pace to end at ~55%`); for the monthly limit, when it would be reached.
- A notification the first time a window reaches the warning or the critical threshold in each cycle (once, even with several VS Code windows open).
- **Claude Usage: Show History** shows the last 7 days in panels: a bar per session with the most it reached, the current weekly cycle against an even pace with where it is on pace to end (and up to four earlier cycles, faint, to compare), and the monthly credits if your account has them. The charts are described for screen readers, and the bars at 90 % or more are striped, not only red. The readings are stored only on your computer (30 days).
- Several VS Code windows share one request through a cache file, and back off on rate limits (HTTP 429). While a refresh is failing, the last good value stays visible marked with `~`.
- Click the status bar item for a menu: refresh, switch between the compact and the extended view, history, a usage summary to copy, mute notifications, settings. **Claude Usage: Refresh** (`Ctrl+Alt+U`, `Cmd+Alt+U` on macOS) refreshes directly.
- **Claude Usage: Copy Usage Summary** (also in the menu) puts the usage on the clipboard as one line, for example `Session (5hr) 42% · resets in 2h 10m | Weekly (7 day) 71% · resets in 2d 4h`. It follows `windows` and `showSpend`.
- **Claude Usage: Mute Notifications…** (also in the menu) silences the notifications for an hour, or until the session or the weekly window resets. All your VS Code windows follow it, and the hover says until when. What is still above a threshold is notified at the next refresh after the mute ends. **Claude Usage: Unmute Notifications** ends it earlier.
- **Claude Usage: Export History…** saves the stored readings as CSV or JSON, whichever file name you choose. The spend is left out when `showSpend` is `never`.

## Settings

| Setting | Default | Description |
|---|---|---|
| `claudeUsage.refreshInterval` | `120` | Seconds between usage requests (30-3600). |
| `claudeUsage.windows` | `both` | `both`, `session` or `weekly`: which windows the status bar, the notifications and the history show. |
| `claudeUsage.extendedView` | `false` | Show full labels instead of the compact ones. |
| `claudeUsage.indicator` | `ring` | `ring` or `bar`: what is drawn next to each percentage. |
| `claudeUsage.barSize` | `medium` | `small`, `medium` or `large`: length of the bar (only with `indicator` set to `bar`). |
| `claudeUsage.showSpend` | `auto` | `auto` shows the monthly spend when the account has it; `never` hides it. |
| `claudeUsage.notifications` | `true` | Notify when a threshold is reached. |
| `claudeUsage.criticalModal` | `false` | Show the critical notification as a modal dialog (it blocks VS Code until closed) instead of a toast. |
| `claudeUsage.warningThreshold` | `70` | Percentage from which the status bar turns yellow. |
| `claudeUsage.criticalThreshold` | `90` | Percentage from which it turns red. Must be higher than the warning threshold. |
| `claudeUsage.historyChartSize` | `medium` | `small`, `medium` or `large`: size of the panels of **Show History**; the percent axis has a line every 25, 20 or 10 points. |

## How it works, and its limits

The extension calls `GET https://api.anthropic.com/api/oauth/usage` with your Claude Code OAuth token. This endpoint is **undocumented**, so it can change or disappear without notice and the extension may stop working. The token is only sent to `api.anthropic.com`, is never cached or logged, and the extension collects no telemetry.

In remote windows (SSH, WSL, containers) the extension runs on the remote host, so it reads that host's credentials. Credentials are read from `~/.claude/.credentials.json` (or `$CLAUDE_CONFIG_DIR`), or from the macOS keychain item `Claude Code-credentials`.

## Development

```
npm install
npm run build     # bundle to out/extension.js
npm test          # unit tests
npm run icons     # regenerate the icon font (rename it if glyphs change)
npm run package   # build a .vsix
```

Press `F5` in VS Code to launch an Extension Development Host.

## License

[MIT](LICENSE)

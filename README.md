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
- Accounts billed by money (for example Enterprise) get their monthly credits and limit: `✦ Claude Usage · Credits $7.29 / $800.00 ◔ 1%`. The hover adds the amount remaining and the exact percentage. It only appears when the account has extra usage enabled with a limit.
- The status bar turns yellow from 70 % and red from 90 % (the worst of the windows and the monthly spend). Both thresholds are settings.
- Hover for the exact local reset time of each window (24-hour format). When a window would fill up before it resets, the hover also says when, at the current pace; the same for the monthly limit.
- A notification the first time a window reaches the warning or the critical threshold in each cycle (once, even with several VS Code windows open).
- **Claude Usage: Show History** charts the last 7 days. The readings are stored only on your computer (30 days).
- Several VS Code windows share one request through a cache file, and back off on rate limits (HTTP 429). While a refresh is failing, the last good value stays visible marked with `~`.
- Click the status bar item for a menu: refresh, switch between the compact and the extended view, history, settings. **Claude Usage: Refresh** (`Ctrl+Alt+U`, `Cmd+Alt+U` on macOS) refreshes directly.

## Settings

| Setting | Default | Description |
|---|---|---|
| `claudeUsage.refreshInterval` | `120` | Seconds between usage requests (30-3600). |
| `claudeUsage.extendedView` | `false` | Show full labels instead of the compact ones. |
| `claudeUsage.showSpend` | `auto` | `auto` shows the monthly spend when the account has it; `never` hides it. |
| `claudeUsage.windows` | `both` | `both`, `session` or `weekly`: which windows the status bar, the notifications and the history show. |
| `claudeUsage.warningThreshold` | `70` | Percentage from which the status bar turns yellow. |
| `claudeUsage.criticalThreshold` | `90` | Percentage from which it turns red. Must be higher than the warning threshold. |
| `claudeUsage.notifications` | `true` | Notify when a threshold is reached. |

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

import { Sample } from '../engine/history';
import { ChartSize, renderPanels, SeriesKey } from './history_charts';

export type { SeriesKey } from './history_charts';

export function renderHistoryHtml(samples: Sample[], now: number, nonce: string, allowed: SeriesKey[] = ['session', 'weekly', 'spend'], size: ChartSize = 'medium'): string {
  const panels = renderPanels(samples, now, allowed, size);
  const body = panels || '<p>No history yet. It fills up as the extension reads your usage.</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Claude Usage History</title>
<style nonce="${nonce}">
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 16px; }
h1 { font-size: 1.3em; font-weight: 600; margin: 0 0 4px; }
h2 { font-size: 1.05em; font-weight: 600; margin: 24px 0 2px; }
.sub { color: var(--vscode-descriptionForeground); margin: 0 0 8px; }
svg { width: 100%; max-width: 900px; height: auto; }
.grid { stroke: var(--vscode-editorWidget-border, #8884); stroke-width: 1; opacity: 0.6; }
.grid.major { opacity: 1; }
.axis { fill: var(--vscode-descriptionForeground); font-size: 11px; }
polyline { fill: none; stroke-width: 2; stroke-linejoin: round; }
circle { fill: transparent; }
circle:hover { fill: currentColor; }
.weekly { stroke: var(--vscode-charts-orange); color: var(--vscode-charts-orange); }
.spend { stroke: var(--vscode-charts-green); color: var(--vscode-charts-green); }
.weekly-dot { color: var(--vscode-charts-orange); }
.point { fill: currentColor; }
.spend-dot { color: var(--vscode-charts-green); }
.connector { stroke: var(--vscode-charts-orange); stroke-dasharray: 2 4; opacity: 0.7; }
.pace { stroke: var(--vscode-descriptionForeground); stroke-dasharray: 2 5; stroke-width: 1.5; }
.projection { stroke: var(--vscode-charts-orange); stroke-dasharray: 6 4; }
.projection.full { stroke: var(--vscode-charts-red); }
.now { stroke: var(--vscode-descriptionForeground); stroke-width: 1; stroke-dasharray: 1 3; }
.bar { fill: var(--vscode-charts-blue); opacity: 0.9; }
.bar.hot { fill: var(--vscode-charts-red); }
.bar:hover { opacity: 1; }
.bar-hatch { pointer-events: none; }
.hatch { stroke: var(--vscode-editor-background); stroke-width: 2; }
.legend { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; color: var(--vscode-descriptionForeground); margin: 4px 0 0; }
.swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-left: 10px; }
.swatch:first-child { margin-left: 0; }
.session-bg { background: var(--vscode-charts-blue); }
.weekly-bg { background: var(--vscode-charts-orange); }
.spend-bg { background: var(--vscode-charts-green); }
.hot-bg { background: repeating-linear-gradient(45deg, var(--vscode-charts-red) 0 2px, var(--vscode-editor-background) 2px 4px); }
.pace-bg { background: var(--vscode-descriptionForeground); }
.projection-bg { background: var(--vscode-charts-orange); opacity: 0.6; }
</style>
</head>
<body>
<h1>Claude Usage History</h1>
<p class="sub">Stored only on this computer.</p>
${body}
</body>
</html>`;
}

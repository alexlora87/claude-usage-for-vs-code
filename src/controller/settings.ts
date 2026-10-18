import * as vscode from 'vscode';
import { Forecasts } from './forecast';
import { ChartSize, chartSizeFrom } from './history_charts';
import { thresholdsFrom, ViewOptions, WindowsOption } from './format';
import { IconStyle, iconStyleFrom } from './icons';

export const SETTINGS_KEYS = ['extendedView', 'showSpend', 'windows', 'indicator', 'barSize', 'warningThreshold', 'criticalThreshold', 'notifications', 'historyChartSize'];

export function readOptions(forecasts?: Forecasts): ViewOptions {
  const config = vscode.workspace.getConfiguration('claudeUsage');
  return {
    extended: config.get<boolean>('extendedView', false),
    showSpend: config.get<string>('showSpend', 'auto') !== 'never',
    windows: config.get<WindowsOption>('windows', 'both'),
    thresholds: thresholdsFrom(config.get<number>('warningThreshold', 70), config.get<number>('criticalThreshold', 90)),
    forecasts,
  };
}

export function readIconStyle(): IconStyle {
  const config = vscode.workspace.getConfiguration('claudeUsage');
  return iconStyleFrom(config.get<string>('indicator', 'ring'), config.get<string>('barSize', 'medium'));
}

export function readChartSize(): ChartSize {
  return chartSizeFrom(vscode.workspace.getConfiguration('claudeUsage').get<string>('historyChartSize', 'medium'));
}

export function notificationsEnabled(): boolean {
  return vscode.workspace.getConfiguration('claudeUsage').get<boolean>('notifications', true);
}

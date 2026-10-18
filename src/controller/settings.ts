import * as vscode from 'vscode';
import { Forecasts } from './forecast';
import { thresholdsFrom, ViewOptions, WindowsOption } from './format';
import { Indicator } from './icons';

export const SETTINGS_KEYS = ['extendedView', 'showSpend', 'windows', 'indicator', 'warningThreshold', 'criticalThreshold', 'notifications'];

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

export function readIndicator(): Indicator {
  return vscode.workspace.getConfiguration('claudeUsage').get<string>('indicator', 'ring') === 'bar' ? 'bar' : 'ring';
}

export function notificationsEnabled(): boolean {
  return vscode.workspace.getConfiguration('claudeUsage').get<boolean>('notifications', true);
}

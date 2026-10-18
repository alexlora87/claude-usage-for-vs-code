import * as vscode from 'vscode';
import { Forecasts } from './forecast';
import { thresholdsFrom, ViewOptions, WindowsOption } from './format';
import { IconStyle } from './icons';

export const SETTINGS_KEYS = ['extendedView', 'showSpend', 'windows', 'indicator', 'barSize', 'warningThreshold', 'criticalThreshold', 'notifications'];

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

const BAR_SIZES: IconStyle[] = ['bar-small', 'bar-medium', 'bar-big'];

/** What is drawn next to each percentage; the bar size only counts with the bar, and unknown values fall back to the defaults. */
export function readIconStyle(): IconStyle {
  const config = vscode.workspace.getConfiguration('claudeUsage');
  if (config.get<string>('indicator', 'ring') !== 'bar') {
    return 'ring';
  }
  const style = `bar-${config.get<string>('barSize', 'small')}` as IconStyle;
  return BAR_SIZES.includes(style) ? style : 'bar-small';
}

export function notificationsEnabled(): boolean {
  return vscode.workspace.getConfiguration('claudeUsage').get<boolean>('notifications', true);
}

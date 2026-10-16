import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.text = '$(sparkle) Claude Usage';
  item.command = 'claudeUsage.refresh';
  item.show();

  context.subscriptions.push(
    item,
    vscode.commands.registerCommand('claudeUsage.refresh', () => {}),
  );
}

export function deactivate(): void {}

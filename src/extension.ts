import * as vscode from "vscode";
import { DashboardViewProvider } from "./dashboardPanel";
import { runHuntd, isHuntdInstalled } from "./huntdRunner";

let statusBarItem: vscode.StatusBarItem;
let dashboardProvider: DashboardViewProvider;
let refreshTimer: NodeJS.Timeout | undefined;
let fileWatcher: vscode.FileSystemWatcher | undefined;

export function activate(context: vscode.ExtensionContext) {
  // Register sidebar webview provider
  dashboardProvider = new DashboardViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      DashboardViewProvider.viewType,
      dashboardProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // Status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    50
  );
  statusBarItem.command = "huntd.openDashboard";
  statusBarItem.tooltip = "huntd — click to open dashboard";
  context.subscriptions.push(statusBarItem);

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand("huntd.openDashboard", () => {
      vscode.commands.executeCommand("huntd.dashboardView.focus");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("huntd.refresh", () => {
      refreshDashboard();
    })
  );

  // File watcher for .git changes (auto-refresh on commit)
  const config = vscode.workspace.getConfiguration("huntd");
  if (config.get<boolean>("autoRefresh", true)) {
    fileWatcher = vscode.workspace.createFileSystemWatcher(
      "**/.git/refs/heads/*"
    );
    fileWatcher.onDidChange(() => refreshDashboard());
    fileWatcher.onDidCreate(() => refreshDashboard());
    context.subscriptions.push(fileWatcher);

    // Periodic refresh
    const interval = config.get<number>("refreshInterval", 60) * 1000;
    refreshTimer = setInterval(() => refreshDashboard(), interval);
  }

  // Initial load
  refreshDashboard();
}

async function refreshDashboard() {
  const config = vscode.workspace.getConfiguration("huntd");

  // Determine scan path
  let scanPath = config.get<string>("scanPath", "");
  if (!scanPath && vscode.workspace.workspaceFolders?.length) {
    scanPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
  }
  if (!scanPath) {
    dashboardProvider.showError("No workspace folder open. Open a folder or set huntd.scanPath in settings.");
    statusBarItem.text = "$(graph) huntd";
    statusBarItem.show();
    return;
  }

  // Check huntd is installed
  const installed = await isHuntdInstalled();
  if (!installed) {
    dashboardProvider.showError("huntd CLI not found. Install it with: pip install huntd");
    statusBarItem.text = "$(graph) huntd: not installed";
    statusBarItem.show();
    return;
  }

  dashboardProvider.showLoading();

  try {
    const author = config.get<string>("authorFilter", "") || undefined;
    const data = await runHuntd(scanPath, author);

    dashboardProvider.updateData(data);

    // Update status bar with streak
    const fire = data.streaks.current > 0 ? "\uD83D\uDD25" : "";
    statusBarItem.text = `$(graph) ${fire} ${data.streaks.current}d streak`;
    statusBarItem.show();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    dashboardProvider.showError(message);
    statusBarItem.text = "$(graph) huntd: error";
    statusBarItem.show();
  }
}

export function deactivate() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
  if (fileWatcher) {
    fileWatcher.dispose();
  }
  statusBarItem?.dispose();
}

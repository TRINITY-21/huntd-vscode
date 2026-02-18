import * as vscode from "vscode";
import { HuntdData } from "./huntdRunner";

export class DashboardViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "huntd.dashboardView";

  private _view?: vscode.WebviewView;
  private _data?: HuntdData;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getLoadingHtml();

    webviewView.webview.onDidReceiveMessage((message) => {
      if (message.command === "refresh") {
        vscode.commands.executeCommand("huntd.refresh");
      }
    });
  }

  public updateData(data: HuntdData) {
    this._data = data;
    if (this._view) {
      this._view.webview.html = this._getDashboardHtml(data);
    }
  }

  public showError(message: string) {
    if (this._view) {
      this._view.webview.html = this._getErrorHtml(message);
    }
  }

  public showLoading() {
    if (this._view) {
      this._view.webview.html = this._getLoadingHtml();
    }
  }

  private _getLoadingHtml(): string {
    return `<!DOCTYPE html>
<html><head>${this._getStyles()}</head>
<body>
  <div class="loading">
    <div class="spinner"></div>
    <p>Scanning repos...</p>
  </div>
</body></html>`;
  }

  private _getErrorHtml(message: string): string {
    return `<!DOCTYPE html>
<html><head>${this._getStyles()}</head>
<body>
  <div class="error">
    <span class="error-icon">!</span>
    <p>${this._escapeHtml(message)}</p>
    <button onclick="vscode.postMessage({command:'refresh'})">Retry</button>
  </div>
  <script>const vscode = acquireVsCodeApi();</script>
</body></html>`;
  }

  private _getDashboardHtml(data: HuntdData): string {
    const streakFire = data.streaks.current > 0 ? "&#x1F525;" : "";
    const topLangs = Object.entries(data.languages)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    const totalLines = topLangs.reduce((s, [, v]) => s + v, 0) || 1;

    const langColors: Record<string, string> = {
      Python: "#3572A5",
      JavaScript: "#f1e05a",
      TypeScript: "#3178c6",
      Go: "#00ADD8",
      Rust: "#dea584",
      Java: "#b07219",
      "C++": "#f34b7d",
      C: "#555555",
      Ruby: "#701516",
      PHP: "#4F5D95",
      Swift: "#F05138",
      Kotlin: "#A97BFF",
      Dart: "#00B4AB",
      Shell: "#89e051",
      HTML: "#e34c26",
      CSS: "#563d7c",
      Markdown: "#083fa1",
      TOML: "#9c4221",
    };

    const langBars = topLangs
      .map(([lang, lines]) => {
        const pct = ((lines / totalLines) * 100).toFixed(1);
        const color = langColors[lang] || "#8b949e";
        return `<div class="lang-row">
          <span class="lang-name">${this._escapeHtml(lang)}</span>
          <div class="lang-bar-bg"><div class="lang-bar" style="width:${pct}%;background:${color}"></div></div>
          <span class="lang-pct">${pct}%</span>
        </div>`;
      })
      .join("");

    const repoRows = data.repos
      .slice(0, 10)
      .map(
        (r) => `<tr>
          <td class="repo-name">${this._escapeHtml(r.name)}</td>
          <td class="num">${r.commits}</td>
          <td><span class="health-badge ${r.health_score >= 80 ? "green" : r.health_score >= 50 ? "yellow" : "red"}">${r.health_score}</span></td>
        </tr>`
      )
      .join("");

    const heatmapHtml = this._buildHeatmap(data.heatmap);

    const achievementsHtml = data.achievements
      .map(
        (a) =>
          `<span class="achievement ${a.unlocked ? "unlocked" : "locked"}" title="${this._escapeHtml(a.description)}">${a.unlocked ? a.icon : "&#x1F512;"} ${this._escapeHtml(a.name)}</span>`
      )
      .join("");

    const hourLabels = Array.from({ length: 24 }, (_, i) => i);
    const maxHour = Math.max(...data.activity.commits_by_hour, 1);
    const hourBars = hourLabels
      .map((h) => {
        const val = data.activity.commits_by_hour[h] || 0;
        const height = Math.round((val / maxHour) * 40);
        return `<div class="hour-bar" style="height:${height}px" title="${h}:00 — ${val} commits"></div>`;
      })
      .join("");

    const velocityHtml = this._buildVelocity(data.code_velocity);

    const focusLabel =
      data.focus_score.interpretation === "deep focus"
        ? "&#x1F3AF; deep focus"
        : data.focus_score.interpretation === "balanced"
          ? "&#x2696;&#xFE0F; balanced"
          : "&#x1F300; scattered";

    return `<!DOCTYPE html>
<html><head>${this._getStyles()}</head>
<body>
  <div class="dashboard">
    <div class="header">
      <h1>&#x1F43A; huntd</h1>
      <button class="refresh-btn" onclick="vscode.postMessage({command:'refresh'})" title="Refresh">&#x21BB;</button>
    </div>

    <div class="section overview">
      <div class="stat-grid">
        <div class="stat"><span class="stat-val">${data.total_repos}</span><span class="stat-label">repos</span></div>
        <div class="stat"><span class="stat-val">${data.total_commits.toLocaleString()}</span><span class="stat-label">commits</span></div>
        <div class="stat"><span class="stat-val">${data.total_languages}</span><span class="stat-label">languages</span></div>
        <div class="stat"><span class="stat-val">${streakFire} ${data.streaks.current}d</span><span class="stat-label">streak</span></div>
        <div class="stat"><span class="stat-val">${data.streaks.longest}d</span><span class="stat-label">longest</span></div>
        <div class="stat"><span class="stat-val">${data.activity.avg_commits_per_day.toFixed(1)}</span><span class="stat-label">per day</span></div>
      </div>
    </div>

    <div class="section">
      <h2>Contributions</h2>
      <div class="heatmap-container">${heatmapHtml}</div>
    </div>

    <div class="section">
      <h2>Languages</h2>
      ${langBars}
    </div>

    <div class="section">
      <h2>Repositories</h2>
      <table class="repo-table">
        <thead><tr><th>Repo</th><th>Commits</th><th>Health</th></tr></thead>
        <tbody>${repoRows}</tbody>
      </table>
    </div>

    <div class="section">
      <h2>Activity</h2>
      <div class="activity-meta">
        <span>Busiest: <strong>${this._escapeHtml(data.activity.busiest_day)}</strong> at <strong>${data.activity.busiest_hour}:00</strong></span>
      </div>
      <div class="hour-chart">${hourBars}</div>
      <div class="hour-labels"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span></div>
    </div>

    <div class="section">
      <h2>Velocity</h2>
      ${velocityHtml}
    </div>

    <div class="section">
      <h2>Focus</h2>
      <div class="focus-card">
        <span class="focus-val">${data.focus_score.avg_repos_per_day.toFixed(1)} repos/day</span>
        <span class="focus-label">${focusLabel}</span>
      </div>
    </div>

    <div class="section">
      <h2>Work Split</h2>
      <div class="split-bar">
        <div class="split-weekday" style="width:${data.workday_split.weekday_pct}%"></div>
      </div>
      <div class="split-labels">
        <span>Weekday ${data.workday_split.weekday_pct.toFixed(0)}%</span>
        <span>Weekend ${data.workday_split.weekend_pct.toFixed(0)}%</span>
      </div>
    </div>

    <div class="section">
      <h2>Achievements</h2>
      <div class="achievements-grid">${achievementsHtml}</div>
    </div>

    <div class="footer">
      <span>huntd — your coding fingerprint</span>
    </div>
  </div>

  <script>const vscode = acquireVsCodeApi();</script>
</body></html>`;
  }

  private _buildHeatmap(heatmap: number[][]): string {
    if (!heatmap || heatmap.length === 0) {
      return '<div class="empty">No heatmap data</div>';
    }

    const allVals = heatmap.flat();
    const maxVal = Math.max(...allVals, 1);
    const weeks = heatmap[0]?.length || 0;
    const days = ["M", "T", "W", "T", "F", "S", "S"];

    let html = '<div class="heatmap">';
    for (let d = 0; d < 7; d++) {
      html += '<div class="heatmap-row">';
      html += `<span class="heatmap-day">${days[d]}</span>`;
      // Show last 20 weeks max to fit sidebar
      const startWeek = Math.max(0, weeks - 20);
      for (let w = startWeek; w < weeks; w++) {
        const val = heatmap[d]?.[w] || 0;
        const level =
          val === 0
            ? 0
            : val <= maxVal * 0.25
              ? 1
              : val <= maxVal * 0.5
                ? 2
                : val <= maxVal * 0.75
                  ? 3
                  : 4;
        html += `<span class="heatmap-cell level-${level}" title="${val} commits"></span>`;
      }
      html += "</div>";
    }
    html += "</div>";
    return html;
  }

  private _buildVelocity(cv: HuntdData["code_velocity"]): string {
    const weeks = Object.keys(cv.commits_by_week).sort().slice(-12);
    if (weeks.length === 0) {
      return '<div class="empty">No velocity data</div>';
    }

    const values = weeks.map((w) => cv.commits_by_week[w] || 0);
    const maxVal = Math.max(...values, 1);
    const trendIcon =
      cv.trend === "up" ? "&#x2191;" : cv.trend === "down" ? "&#x2193;" : "&#x2194;";
    const trendColor =
      cv.trend === "up" ? "#39d353" : cv.trend === "down" ? "#f85149" : "#58a6ff";

    const bars = values
      .map((v, i) => {
        const height = Math.round((v / maxVal) * 50);
        const label = weeks[i].replace(/^\d{4}-W/, "W");
        return `<div class="vel-col"><div class="vel-bar" style="height:${height}px;background:${trendColor}"></div><span class="vel-label">${label}</span></div>`;
      })
      .join("");

    return `<div class="velocity-meta"><span style="color:${trendColor}">${trendIcon} ${cv.trend}</span> &middot; Peak: ${cv.peak_week} (${cv.peak_commits})</div>
      <div class="velocity-chart">${bars}</div>`;
  }

  private _getStyles(): string {
    return `<style>
      :root {
        --bg: #0d1117;
        --surface: #161b22;
        --border: #30363d;
        --text: #e6edf3;
        --text-dim: #8b949e;
        --green: #39d353;
        --cyan: #58a6ff;
        --purple: #bc8cff;
        --yellow: #e3b341;
        --red: #f85149;
        --orange: #f0883e;
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        background: var(--bg);
        color: var(--text);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 12px;
        padding: 8px;
        overflow-x: hidden;
      }
      .loading, .error {
        display: flex; flex-direction: column; align-items: center;
        justify-content: center; height: 200px; color: var(--text-dim);
      }
      .spinner {
        width: 24px; height: 24px; border: 2px solid var(--border);
        border-top-color: var(--green); border-radius: 50%;
        animation: spin 0.8s linear infinite; margin-bottom: 12px;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      .error-icon {
        width: 32px; height: 32px; border-radius: 50%; background: var(--red);
        display: flex; align-items: center; justify-content: center;
        font-weight: bold; font-size: 18px; margin-bottom: 8px;
      }
      .error button, .refresh-btn {
        background: var(--surface); border: 1px solid var(--border);
        color: var(--text); padding: 4px 12px; border-radius: 4px;
        cursor: pointer; margin-top: 8px; font-size: 12px;
      }
      .error button:hover, .refresh-btn:hover { border-color: var(--cyan); }

      .header {
        display: flex; justify-content: space-between; align-items: center;
        padding: 4px 0 8px; border-bottom: 1px solid var(--border); margin-bottom: 8px;
      }
      .header h1 { font-size: 16px; font-weight: 600; }
      .refresh-btn { background: none; border: none; color: var(--text-dim); font-size: 16px; cursor: pointer; padding: 2px 6px; }
      .refresh-btn:hover { color: var(--cyan); }

      .section { margin-bottom: 16px; }
      .section h2 {
        font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;
        color: var(--text-dim); margin-bottom: 8px; padding-bottom: 4px;
        border-bottom: 1px solid var(--border);
      }

      .stat-grid {
        display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px;
      }
      .stat {
        background: var(--surface); border: 1px solid var(--border);
        border-radius: 6px; padding: 8px; text-align: center;
      }
      .stat-val { display: block; font-size: 16px; font-weight: 700; color: var(--green); }
      .stat-label { display: block; font-size: 10px; color: var(--text-dim); margin-top: 2px; }

      .heatmap-container { overflow-x: auto; }
      .heatmap { display: flex; flex-direction: column; gap: 2px; }
      .heatmap-row { display: flex; align-items: center; gap: 2px; }
      .heatmap-day { width: 12px; font-size: 9px; color: var(--text-dim); text-align: center; }
      .heatmap-cell {
        width: 10px; height: 10px; border-radius: 2px;
      }
      .level-0 { background: var(--surface); }
      .level-1 { background: #0e4429; }
      .level-2 { background: #006d32; }
      .level-3 { background: #26a641; }
      .level-4 { background: #39d353; }

      .lang-row { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
      .lang-name { width: 70px; font-size: 11px; color: var(--text-dim); text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .lang-bar-bg { flex: 1; height: 8px; background: var(--surface); border-radius: 4px; overflow: hidden; }
      .lang-bar { height: 100%; border-radius: 4px; transition: width 0.3s; }
      .lang-pct { width: 36px; font-size: 10px; color: var(--text-dim); }

      .repo-table { width: 100%; border-collapse: collapse; font-size: 11px; }
      .repo-table th {
        text-align: left; padding: 4px 6px; color: var(--text-dim);
        border-bottom: 1px solid var(--border); font-weight: 500;
      }
      .repo-table td { padding: 4px 6px; border-bottom: 1px solid var(--surface); }
      .repo-name { color: var(--cyan); max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .num { text-align: right; }
      .health-badge {
        display: inline-block; padding: 1px 6px; border-radius: 10px;
        font-size: 10px; font-weight: 600;
      }
      .health-badge.green { background: #0e4429; color: var(--green); }
      .health-badge.yellow { background: #3d2e00; color: var(--yellow); }
      .health-badge.red { background: #3d0c0c; color: var(--red); }

      .activity-meta { font-size: 11px; color: var(--text-dim); margin-bottom: 6px; }
      .hour-chart {
        display: flex; align-items: flex-end; gap: 1px; height: 40px;
        background: var(--surface); border-radius: 4px; padding: 4px 2px;
      }
      .hour-bar { flex: 1; background: var(--cyan); border-radius: 1px; min-height: 1px; }
      .hour-labels { display: flex; justify-content: space-between; font-size: 9px; color: var(--text-dim); margin-top: 2px; }

      .velocity-meta { font-size: 11px; color: var(--text-dim); margin-bottom: 6px; }
      .velocity-chart {
        display: flex; align-items: flex-end; gap: 2px; height: 60px;
      }
      .vel-col { display: flex; flex-direction: column; align-items: center; flex: 1; }
      .vel-bar { width: 100%; border-radius: 2px 2px 0 0; min-height: 2px; }
      .vel-label { font-size: 8px; color: var(--text-dim); margin-top: 2px; }

      .focus-card {
        background: var(--surface); border: 1px solid var(--border);
        border-radius: 6px; padding: 10px; text-align: center;
      }
      .focus-val { display: block; font-size: 18px; font-weight: 700; color: var(--cyan); }
      .focus-label { display: block; font-size: 11px; color: var(--text-dim); margin-top: 4px; }

      .split-bar {
        height: 10px; background: var(--surface); border-radius: 5px;
        overflow: hidden; margin-bottom: 4px;
      }
      .split-weekday { height: 100%; background: var(--cyan); border-radius: 5px 0 0 5px; }
      .split-labels { display: flex; justify-content: space-between; font-size: 10px; color: var(--text-dim); }

      .achievements-grid { display: flex; flex-wrap: wrap; gap: 4px; }
      .achievement {
        display: inline-block; padding: 3px 8px; border-radius: 12px;
        font-size: 10px; border: 1px solid var(--border);
      }
      .achievement.unlocked { background: #0e4429; border-color: #26a641; color: var(--green); }
      .achievement.locked { background: var(--surface); color: var(--text-dim); }

      .footer {
        text-align: center; color: var(--text-dim); font-size: 10px;
        padding: 12px 0 4px; border-top: 1px solid var(--border); margin-top: 8px;
      }

      .empty { color: var(--text-dim); font-style: italic; text-align: center; padding: 12px; }
    </style>`;
  }

  private _escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}

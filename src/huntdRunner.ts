import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface HuntdData {
  total_repos: number;
  total_commits: number;
  total_languages: number;
  streaks: { current: number; longest: number; today_commits: number };
  heatmap: number[][];
  languages: Record<string, number>;
  repos: {
    name: string;
    commits: number;
    primary_language: string;
    health_score: number;
    lines_added: number;
    lines_removed: number;
  }[];
  activity: {
    busiest_day: string;
    busiest_hour: number;
    avg_commits_per_day: number;
    commits_by_hour: number[];
    commits_by_dow: number[];
  };
  code_velocity: {
    commits_by_week: Record<string, number>;
    trend: string;
    peak_week: string;
    peak_commits: number;
  };
  language_evolution: {
    monthly: Record<string, Record<string, number>>;
    top_languages: string[];
  };
  focus_score: {
    avg_repos_per_day: number;
    most_focused_day: string;
    most_scattered_day: string;
    interpretation: string;
  };
  workday_split: {
    weekday_commits: number;
    weekend_commits: number;
    weekday_pct: number;
    weekend_pct: number;
    weekday_lines: number;
    weekend_lines: number;
  };
  file_hotspots: { path: string; churn: number; touches: number }[];
  achievements: { name: string; icon: string; description: string; unlocked: boolean }[];
}

export async function runHuntd(
  scanPath: string,
  author?: string
): Promise<HuntdData> {
  const args = [scanPath, "--json"];
  if (author) {
    args.push("--author", author);
  }

  try {
    const { stdout } = await execFileAsync("huntd", args, {
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return JSON.parse(stdout) as HuntdData;
  } catch (err: unknown) {
    const error = err as Error & { code?: string };
    if (error.code === "ENOENT") {
      throw new Error(
        "huntd not found. Install it with: pip install huntd"
      );
    }
    throw new Error(`huntd failed: ${error.message}`);
  }
}

export async function isHuntdInstalled(): Promise<boolean> {
  try {
    await execFileAsync("huntd", ["--version"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

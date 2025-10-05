import type { APIRoute } from "astro";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const CACHE_DIR = join(process.cwd(), ".git-cache");
const MAX_DEPTH = 2048;

function sanitizePositiveInt(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.max(1, Math.floor(value));
}

async function ensureDir(path: string) {
  await mkdir(path, { recursive: true });
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function runGit(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return stdout.toString();
}

function sanitizeDepth(value: number): number {
  const sanitized = sanitizePositiveInt(value, 50);
  return Math.min(MAX_DEPTH, sanitized);
}

function sanitizeRepoUrl(repoUrl: string | null): string | null {
  if (!repoUrl) return null;
  try {
    const parsed = new URL(repoUrl);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function sanitizePath(filePath: string | null): string | null {
  if (!filePath) return null;
  if (filePath.includes("..")) return null;
  if (filePath.startsWith("/") || filePath.startsWith("\\")) return null;
  return filePath;
}

async function ensureRepository(repoUrl: string, depth: number): Promise<string> {
  await ensureDir(CACHE_DIR);
  const repoHash = createHash("sha1").update(repoUrl).digest("hex");
  const repoPath = join(CACHE_DIR, `${repoHash}.git`);
  const sanitizedDepth = sanitizeDepth(depth);

  if (!(await pathExists(repoPath))) {
    await runGit([
      "clone",
      "--bare",
      "--filter=blob:none",
      `--depth=${sanitizedDepth}`,
      repoUrl,
      repoPath,
    ]);
  } else {
    await runGit([
      "--git-dir",
      repoPath,
      "fetch",
      "--depth",
      String(sanitizedDepth),
      "--update-shallow",
      "--prune",
      "--filter=blob:none",
      "origin",
    ]);
  }

  await runGit(["--git-dir", repoPath, "remote", "set-head", "origin", "-a"]);
  return repoPath;
}

type HistoryEntry = { date: string; commits: any[] };

function parseHistoryOutput(rawLog: string): HistoryEntry[] {
  const entries = rawLog.split("\u001e").map((entry) => entry.trim());
  const result: HistoryEntry[] = [];
  let currentGroup: HistoryEntry | undefined;

  for (const entry of entries) {
    if (!entry) continue;
    const [sha, authorName, authorEmail, authorDate, message] = entry.split(
      "\u001f",
    );
    if (!sha || !authorDate) continue;
    const dateKey = authorDate.split("T")[0];
    if (!currentGroup || currentGroup.date !== dateKey) {
      currentGroup = { date: dateKey, commits: [] };
      result.push(currentGroup);
    }
    currentGroup.commits.push({
      sha,
      message: message ?? "",
      commit_date: authorDate,
      author: { name: authorName ?? "", html_url: null },
      html_url: null,
      author_email: authorEmail ?? "",
    });
  }

  return result;
}

async function getHistory(
  repoPath: string,
  page: number,
  perPage: number,
): Promise<{ date: string; commits: any[] }[]> {
  const skip = Math.max(0, (page - 1) * perPage);
  const logOutput = await runGit([
    "--git-dir",
    repoPath,
    "log",
    `--skip=${skip}`,
    `--max-count=${perPage}`,
    "--date=iso-strict",
    "--pretty=format:%H%x1f%an%x1f%aE%x1f%aI%x1f%B%x1e",
    "origin/HEAD",
  ]);
  return parseHistoryOutput(logOutput.trim());
}

async function getCommit(repoPath: string, sha: string) {
  const output = await runGit([
    "--git-dir",
    repoPath,
    "show",
    "--quiet",
    `--pretty=format:%H%x1f%an%x1f%aE%x1f%aI%x1f%cn%x1f%cE%x1f%cI%x1f%B`,
    sha,
  ]);
  const [
    commitSha,
    authorName,
    authorEmail,
    authorDate,
    committerName,
    committerEmail,
    committerDate,
    message,
  ] = output.split("\u001f");

  if (!commitSha) {
    return undefined;
  }

  return {
    sha: commitSha,
    html_url: null,
    commit: {
      message: message ?? "",
      author: {
        name: authorName ?? "",
        email: authorEmail ?? "",
        date: authorDate ?? "",
      },
      committer: {
        name: committerName ?? "",
        email: committerEmail ?? "",
        date: committerDate ?? "",
      },
    },
  };
}

async function getLatestSha(repoPath: string) {
  const sha = (await runGit(["--git-dir", repoPath, "rev-parse", "origin/HEAD"]))
    .trim()
    .toLowerCase();
  return { sha };
}

async function getFile(repoPath: string, filePath: string) {
  const content = await runGit([
    "--git-dir",
    repoPath,
    "show",
    `origin/HEAD:${filePath}`,
  ]);
  return { content };
}

function jsonResponse(payload: any, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const repoUrl = sanitizeRepoUrl(url.searchParams.get("repoUrl"));

  if (!repoUrl) {
    return jsonResponse({ error: "Invalid repository URL" }, 400);
  }

  try {
    switch (action) {
      case "history": {
        const page = sanitizePositiveInt(
          Number(url.searchParams.get("page") || 1),
          1,
        );
        const perPage = sanitizePositiveInt(
          Number(url.searchParams.get("perPage") || 30),
          30,
        );
        const repoPath = await ensureRepository(repoUrl, page * perPage + perPage);
        const history = await getHistory(repoPath, page, perPage);
        return jsonResponse(history);
      }
      case "commit": {
        const sha = url.searchParams.get("sha");
        if (!sha) {
          return jsonResponse({ error: "Missing commit SHA" }, 400);
        }
        const repoPath = await ensureRepository(repoUrl, 50);
        const commit = await getCommit(repoPath, sha);
        if (!commit) {
          return jsonResponse({ error: "Commit not found" }, 404);
        }
        return jsonResponse(commit);
      }
      case "latest": {
        const repoPath = await ensureRepository(repoUrl, 1);
        const payload = await getLatestSha(repoPath);
        return jsonResponse(payload);
      }
      case "file": {
        const filePath = sanitizePath(url.searchParams.get("path"));
        if (!filePath) {
          return jsonResponse({ error: "Invalid file path" }, 400);
        }
        const repoPath = await ensureRepository(repoUrl, 1);
        try {
          const file = await getFile(repoPath, filePath);
          return jsonResponse(file);
        } catch {
          return jsonResponse({ error: "File not found" }, 404);
        }
      }
      default:
        return jsonResponse({ error: "Unsupported action" }, 400);
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected git error";
    return jsonResponse({ error: message }, 500);
  }
};

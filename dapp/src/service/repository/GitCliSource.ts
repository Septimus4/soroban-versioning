/**
 * Git CLI-based repository source implementation
 */

import type {
  RepositorySource,
  CredentialManager,
  GitUrlParser,
  Commit,
  TreeEntry,
  GitBlob,
  Diff,
  RepositoryInfo,
  ListCommitsOptions,
  DiffOptions,
} from "./interfaces";

export class GitCliSource implements RepositorySource {
  private localDir: string = "";
  private remoteUrl: string = "";
  private repoInfo: RepositoryInfo | null = null;

  constructor(
    private credentialManager: CredentialManager,
    private urlParser: GitUrlParser,
  ) {}

  async init(localDir: string, remoteUrl: string): Promise<void> {
    this.localDir = localDir;
    this.remoteUrl = remoteUrl;
    this.repoInfo = this.urlParser.parse(remoteUrl);

    // Dynamically import Node.js modules
    const { existsSync, mkdirSync } = await import("fs");
    const { dirname } = await import("path");

    // Ensure directory exists
    if (!existsSync(localDir)) {
      mkdirSync(localDir, { recursive: true });
    }

    // Check if already initialized
    const gitDir = `${localDir}/.git`;
    if (existsSync(gitDir)) {
      // Already initialized, just update remote if changed
      const currentRemote = (await this.execGit(["config", "--get", "remote.origin.url"])).trim();
      if (currentRemote !== remoteUrl) {
        await this.execGit(["remote", "set-url", "origin", remoteUrl]);
      }
      return;
    }

    // Clone the repository
    const credentials = await this.credentialManager.forHost(this.repoInfo.host);
    const cloneUrl = await this.buildAuthenticatedUrl(remoteUrl, credentials);

    try {
      // Use partial clone for better performance
      await this.execGit([
        "clone",
        "--filter=blob:none", // Partial clone - don't download blobs initially
        "--no-checkout", // Don't checkout working tree
        cloneUrl,
        localDir,
      ], { cwd: dirname(localDir) });
    } catch (error) {
      // Fallback to regular clone if partial clone fails
      console.warn("Partial clone failed, falling back to regular clone:", error);
      await this.execGit([
        "clone",
        "--no-checkout",
        cloneUrl,
        localDir,
      ], { cwd: dirname(localDir) });
    }
  }

  async update(refs?: string[]): Promise<void> {
    const credentials = await this.credentialManager.forHost(this.repoInfo!.host);
    const env = await this.buildGitEnvironment(credentials);

    const refSpecs = refs || ["refs/heads/*:refs/remotes/origin/*"];
    await this.execGit(["fetch", "origin", ...refSpecs], { env });
  }

  async resolveRef(ref: string): Promise<string> {
    try {
      return (await this.execGit(["rev-parse", ref])).trim();
    } catch {
      // Try with origin/ prefix for remote branches
      return (await this.execGit(["rev-parse", `origin/${ref}`])).trim();
    }
  }

  async listCommits(opts: ListCommitsOptions = {}): Promise<Commit[]> {
    const args = ["rev-list"];
    
    if (opts.topo) {
      args.push("--topo-order");
    }
    
    if (opts.maxCount) {
      args.push(`--max-count=${opts.maxCount}`);
    }
    
    if (opts.skip) {
      args.push(`--skip=${opts.skip}`);
    }

    // Add commit range or default to HEAD
    if (opts.from && opts.to) {
      args.push(`${opts.from}..${opts.to}`);
    } else if (opts.from) {
      args.push(`${opts.from}..HEAD`);
    } else if (opts.to) {
      args.push(opts.to);
    } else {
      args.push("HEAD");
    }

    const commitShas = (await this.execGit(args))
      .trim()
      .split("\n")
      .filter(Boolean);

    // Get full commit info for each SHA
    const commits = await Promise.all(
      commitShas.map((sha) => this.getCommit(sha))
    );

    return commits;
  }

  async getCommit(oid: string): Promise<Commit> {
    const commitData = await this.execGit(["cat-file", "-p", oid]);
    return this.parseCommitData(oid, commitData);
  }

  async getTree(oid: string, path?: string): Promise<TreeEntry[]> {
    const args = ["ls-tree", "-r"];
    
    if (path) {
      args.push(oid, path);
    } else {
      args.push(oid);
    }

    const treeData = await this.execGit(args);
    return this.parseTreeData(treeData);
  }

  async getBlob(oid: string): Promise<GitBlob> {
    const content = await this.execGit(["cat-file", "-p", oid]);
    const size = parseInt((await this.execGit(["cat-file", "-s", oid])).trim(), 10);

    return {
      oid,
      size,
      content,
    };
  }

  async diff(base: string, head: string, opts: DiffOptions = {}): Promise<Diff> {
    const args = ["diff-tree", "-p"];
    
    if (opts.includeRenames) {
      args.push("-M");
    }
    
    if (opts.includeCopies) {
      args.push("-C");
    }
    
    if (opts.contextLines !== undefined) {
      args.push(`-U${opts.contextLines}`);
    }

    args.push(base, head);

    const diffData = await this.execGit(args);
    return this.parseDiffData(base, head, diffData);
  }

  async getRepositoryInfo(): Promise<RepositoryInfo> {
    if (this.repoInfo) {
      // Try to detect actual default branch
      try {
        const defaultBranch = (await this.execGit([
          "symbolic-ref",
          "refs/remotes/origin/HEAD",
        ]))
          .trim()
          .replace("refs/remotes/origin/", "");
        
        return { ...this.repoInfo, defaultBranch };
      } catch {
        // Fallback to common defaults
        const branches = ["main", "master", "develop"];
        for (const branch of branches) {
          try {
            await this.execGit(["rev-parse", `origin/${branch}`]);
            return { ...this.repoInfo, defaultBranch: branch };
          } catch {
            continue;
          }
        }
      }
    }

    return this.repoInfo!;
  }

  private async execGit(args: string[], options: { cwd?: string; env?: Record<string, string> } = {}): Promise<string> {
    const { execSync } = await import("child_process");
    const cwd = options.cwd || this.localDir;
    const env = { ...process.env, ...options.env };

    try {
      return execSync(`git ${args.join(" ")}`, {
        cwd,
        env,
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });
    } catch (error: any) {
      throw new Error(`Git command failed: git ${args.join(" ")}\n${error.message}`);
    }
  }

  private async buildAuthenticatedUrl(url: string, credentials: any): Promise<string> {
    // For public repositories, use the URL as-is
    // Convert SSH URLs to HTTPS for public access
    if (url.startsWith("git@")) {
      const repoInfo = this.urlParser.parse(url);
      return this.toHttpsUrl(repoInfo);
    }
    
    return url;
  }

  private async buildGitEnvironment(credentials: any): Promise<Record<string, string>> {
    // For public repositories, no special environment needed
    return {};
  }

  private toHttpsUrl(repoInfo: RepositoryInfo): string {
    if (repoInfo.host === "dev.azure.com") {
      // Azure DevOps special case
      const [org, project] = repoInfo.owner.split("/");
      return `https://dev.azure.com/${org}/${project}/_git/${repoInfo.name}`;
    }

    return `https://${repoInfo.host}/${repoInfo.owner}/${repoInfo.name}`;
  }

  private parseCommitData(oid: string, data: string): Commit {
    const lines = data.split("\n");
    const commit: Partial<Commit> = { id: oid, parents: [] };
    
    let messageStart = -1;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line === "") {
        messageStart = i + 1;
        break;
      }
      
      if (line.startsWith("parent ")) {
        commit.parents!.push(line.substring(7));
      } else if (line.startsWith("author ")) {
        const match = line.match(/^author (.+) <(.+)> (\d+) ([+-]\d{4})$/);
        if (match) {
          commit.author = {
            name: match[1],
            email: match[2],
            timestamp: new Date(parseInt(match[3]) * 1000).toISOString(),
          };
        }
      } else if (line.startsWith("committer ")) {
        const match = line.match(/^committer (.+) <(.+)> (\d+) ([+-]\d{4})$/);
        if (match) {
          commit.committer = {
            name: match[1],
            email: match[2],
            timestamp: new Date(parseInt(match[3]) * 1000).toISOString(),
          };
        }
      }
    }
    
    if (messageStart >= 0) {
      commit.message = lines.slice(messageStart).join("\n").trim();
    }

    return commit as Commit;
  }

  private parseTreeData(data: string): TreeEntry[] {
    return data
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(\d+) (blob|tree|commit) ([a-f0-9]+)\t(.+)$/);
        if (!match) {
          throw new Error(`Invalid tree line: ${line}`);
        }

        const [, mode, type, oid, path] = match;
        return {
          mode,
          type: type === "commit" ? "submodule" : (type as "blob" | "tree"),
          oid,
          path,
        };
      });
  }

  private parseDiffData(base: string, head: string, data: string): Diff {
    // Simple diff parsing - could be enhanced
    const files: any[] = [];
    
    // This is a simplified parser - a full implementation would parse
    // the complete diff format including hunks, renames, etc.
    const lines = data.split("\n");
    let currentFile: any = null;
    
    for (const line of lines) {
      if (line.startsWith("diff --git")) {
        if (currentFile) {
          files.push(currentFile);
        }
        const match = line.match(/diff --git a\/(.+) b\/(.+)/);
        if (match) {
          currentFile = {
            path: match[2],
            oldPath: match[1] !== match[2] ? match[1] : undefined,
            status: "modified",
            patch: "",
          };
        }
      } else if (currentFile) {
        currentFile.patch += line + "\n";
        
        if (line.startsWith("new file mode")) {
          currentFile.status = "added";
        } else if (line.startsWith("deleted file mode")) {
          currentFile.status = "deleted";
        }
      }
    }
    
    if (currentFile) {
      files.push(currentFile);
    }

    return {
      fromCommit: base,
      toCommit: head,
      files,
    };
  }
}
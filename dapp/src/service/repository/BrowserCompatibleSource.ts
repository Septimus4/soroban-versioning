/**
 * Browser-compatible repository source that falls back to HTTP requests
 * when Git CLI is not available
 */

import type {
  RepositorySource,
  Commit,
  TreeEntry,
  GitBlob,
  Diff,
  RepositoryInfo,
  ListCommitsOptions,
  DiffOptions,
} from "./interfaces";

export class BrowserCompatibleSource implements RepositorySource {
  private repoInfo: RepositoryInfo | null = null;

  constructor(private fallbackToHttp: boolean = true) {}

  async init(localDir: string, remoteUrl: string): Promise<void> {
    // Parse the repository URL
    this.repoInfo = this.parseGitHubUrl(remoteUrl);
    
    if (!this.repoInfo) {
      throw new Error(`Unsupported repository URL: ${remoteUrl}`);
    }
  }

  async update(refs?: string[]): Promise<void> {
    // No-op for browser implementation
  }

  async resolveRef(ref: string): Promise<string> {
    if (!this.repoInfo) {
      throw new Error("Repository not initialized");
    }

    // Use GitHub API to resolve ref
    const url = `https://api.github.com/repos/${this.repoInfo.owner}/${this.repoInfo.name}/commits/${ref}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to resolve ref ${ref}: ${response.statusText}`);
    }

    const data = await response.json();
    return data.sha;
  }

  async listCommits(opts: ListCommitsOptions = {}): Promise<Commit[]> {
    if (!this.repoInfo) {
      throw new Error("Repository not initialized");
    }

    // Use GitHub API to list commits
    const params = new URLSearchParams();
    
    if (opts.maxCount) {
      params.set("per_page", opts.maxCount.toString());
    }
    
    if (opts.skip) {
      const page = Math.floor(opts.skip / (opts.maxCount || 30)) + 1;
      params.set("page", page.toString());
    }

    const url = `https://api.github.com/repos/${this.repoInfo.owner}/${this.repoInfo.name}/commits?${params}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to list commits: ${response.statusText}`);
    }

    const data = await response.json();
    return data.map(this.formatGitHubCommit);
  }

  async getCommit(oid: string): Promise<Commit> {
    if (!this.repoInfo) {
      throw new Error("Repository not initialized");
    }

    const url = `https://api.github.com/repos/${this.repoInfo.owner}/${this.repoInfo.name}/commits/${oid}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to get commit ${oid}: ${response.statusText}`);
    }

    const data = await response.json();
    return this.formatGitHubCommit(data);
  }

  async getTree(oid: string, path?: string): Promise<TreeEntry[]> {
    if (!this.repoInfo) {
      throw new Error("Repository not initialized");
    }

    // Use GitHub API to get tree
    const url = `https://api.github.com/repos/${this.repoInfo.owner}/${this.repoInfo.name}/git/trees/${oid}?recursive=1`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to get tree ${oid}: ${response.statusText}`);
    }

    const data = await response.json();
    return data.tree.map((item: any): TreeEntry => ({
      path: item.path,
      mode: item.mode,
      oid: item.sha,
      type: item.type === "tree" ? "tree" : item.type === "commit" ? "submodule" : "blob",
    }));
  }

  async getBlob(oid: string): Promise<GitBlob> {
    if (!this.repoInfo) {
      throw new Error("Repository not initialized");
    }

    const url = `https://api.github.com/repos/${this.repoInfo.owner}/${this.repoInfo.name}/git/blobs/${oid}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to get blob ${oid}: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Decode base64 content
    const content = data.encoding === "base64" 
      ? atob(data.content.replace(/\s/g, ""))
      : data.content;

    return {
      oid,
      size: data.size,
      content,
    };
  }

  async diff(base: string, head: string, opts: DiffOptions = {}): Promise<Diff> {
    if (!this.repoInfo) {
      throw new Error("Repository not initialized");
    }

    // Use GitHub API to get diff
    const url = `https://api.github.com/repos/${this.repoInfo.owner}/${this.repoInfo.name}/compare/${base}...${head}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to get diff ${base}...${head}: ${response.statusText}`);
    }

    const data = await response.json();
    
    return {
      fromCommit: base,
      toCommit: head,
      files: data.files.map((file: any) => ({
        path: file.filename,
        status: file.status,
        oldPath: file.previous_filename,
        patch: file.patch,
      })),
    };
  }

  async getRepositoryInfo(): Promise<RepositoryInfo> {
    if (!this.repoInfo) {
      throw new Error("Repository not initialized");
    }

    // Use GitHub API to get repository information
    const url = `https://api.github.com/repos/${this.repoInfo.owner}/${this.repoInfo.name}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to get repository info: ${response.statusText}`);
    }

    const data = await response.json();
    
    return {
      ...this.repoInfo,
      defaultBranch: data.default_branch,
    };
  }

  private parseGitHubUrl(url: string): RepositoryInfo | null {
    // Handle GitHub URLs
    const githubMatch = url.match(/https?:\/\/github\.com\/([^\/]+)\/([^\/]+?)(?:\/.*)?$/);
    if (githubMatch) {
      return {
        url: url.replace(/\.git$/, ""),
        host: "github.com",
        owner: githubMatch[1],
        name: githubMatch[2].replace(/\.git$/, ""),
        defaultBranch: "main", // Will be detected later
      };
    }

    return null;
  }

  private formatGitHubCommit(data: any): Commit {
    return {
      id: data.sha,
      parents: data.parents?.map((p: any) => p.sha) || [],
      author: {
        name: data.commit.author.name,
        email: data.commit.author.email,
        timestamp: data.commit.author.date,
      },
      committer: {
        name: data.commit.committer.name,
        email: data.commit.committer.email,
        timestamp: data.commit.committer.date,
      },
      message: data.commit.message,
    };
  }
}
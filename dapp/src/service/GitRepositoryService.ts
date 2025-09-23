/**
 * Git repository service that replaces GitHub API calls with Git operations
 * Maintains compatibility with existing FormattedCommit interface
 */

import type { FormattedCommit } from "../types/github";
import type { RepositorySource } from "./repository/interfaces";
import { RepositoryFactory } from "./repository/RepositoryFactory";
import {
  getAuthorRepo,
  getGithubContentUrlFromReadmeUrl,
} from "../utils/editLinkFunctions";

class GitRepositoryServiceImpl {
  private repositoryCache = new Map<string, RepositorySource>();

  /**
   * Get or create a repository source for the given URL
   */
  private async getRepository(configUrl: string): Promise<RepositorySource | null> {
    const { username, repoName } = getAuthorRepo(configUrl);
    if (!username || !repoName) {
      return null;
    }

    // Build the repository URL
    const repoUrl = `https://github.com/${username}/${repoName}`;
    
    if (this.repositoryCache.has(repoUrl)) {
      return this.repositoryCache.get(repoUrl)!;
    }

    try {
      const repo = RepositoryFactory.createRepositorySource();
      
      // Only use local directory for Git CLI sources in Node.js environment
      let localDir = "";
      if (typeof process !== "undefined" && process.versions && process.versions.node) {
        // Dynamically import Node.js modules
        const { join } = await import("path");
        const { tmpdir } = await import("os");
        localDir = join(tmpdir(), "git-repos", `${username}-${repoName}`);
      }
      
      await repo.init(localDir, repoUrl);
      await repo.update();
      
      this.repositoryCache.set(repoUrl, repo);
      return repo;
    } catch (error) {
      console.warn(`Failed to initialize repository ${repoUrl}:`, error);
      return null;
    }
  }

  /**
   * Convert Git commit to FormattedCommit interface
   */
  private formatCommit(commit: any, repoInfo: { username: string; repoName: string }): FormattedCommit {
    return {
      message: commit.message,
      author: {
        name: commit.author.name,
        html_url: `https://github.com/${commit.author.name}`, // Best effort GitHub link
      },
      commit_date: commit.author.timestamp,
      html_url: `https://github.com/${repoInfo.username}/${repoInfo.repoName}/commit/${commit.id}`,
      sha: commit.id,
    };
  }

  /**
   * Get commit history (replaces GitHub API call)
   */
  async getCommitHistory(
    username: string,
    repo: string,
    page: number = 1,
    perPage: number = 30,
  ): Promise<{ date: string; commits: FormattedCommit[] }[] | null> {
    try {
      const repoUrl = `https://github.com/${username}/${repo}`;
      
      // Check cache first
      if (this.repositoryCache.has(repoUrl)) {
        const repository = this.repositoryCache.get(repoUrl)!;
        const skip = (page - 1) * perPage;
        const commits = await repository.listCommits({
          maxCount: perPage,
          skip,
          topo: true,
        });

        const formattedCommits = commits.map(commit => 
          this.formatCommit(commit, { username, repoName: repo })
        );

        return this.groupCommitsByDate(formattedCommits);
      }

      // Create new repository instance
      const repository = RepositoryFactory.createRepositorySource();
      
      // Only use local directory for Git CLI sources in Node.js environment
      let localDir = "";
      if (typeof process !== "undefined" && process.versions && process.versions.node) {
        // Dynamically import Node.js modules
        const { join } = await import("path");
        const { tmpdir } = await import("os");
        localDir = join(tmpdir(), "git-repos", `${username}-${repo}`);
      }
      
      await repository.init(localDir, repoUrl);
      await repository.update();
      
      this.repositoryCache.set(repoUrl, repository);

      const skip = (page - 1) * perPage;
      const commits = await repository.listCommits({
        maxCount: perPage,
        skip,
        topo: true,
      });

      const formattedCommits = commits.map(commit => 
        this.formatCommit(commit, { username, repoName: repo })
      );

      return this.groupCommitsByDate(formattedCommits);
    } catch (error) {
      console.warn(`Failed to get commit history for ${username}/${repo}:`, error);
      return null;
    }
  }

  /**
   * Group commits by date
   */
  private groupCommitsByDate(formattedCommits: FormattedCommit[]): { date: string; commits: FormattedCommit[] }[] {
    // Group commits by date (same logic as original)
    const groupedCommits = formattedCommits.reduce(
      (acc: Record<string, FormattedCommit[]>, commit: FormattedCommit) => {
        const date = new Date(commit.commit_date).toISOString().split("T")[0];
        if (!date) {
          return acc;
        }
        if (!acc[date]) {
          acc[date] = [];
        }
        acc[date].push(commit);
        return acc;
      },
      {},
    );

    // Convert grouped commits to array format
    return Object.entries(groupedCommits).map(([date, commits]) => ({
      date,
      commits: commits as FormattedCommit[],
    }));
  }

  /**
   * Get commit data from SHA (replaces GitHub API call)
   */
  async getCommitDataFromSha(
    owner: string,
    repo: string,
    sha: string,
  ): Promise<any> {
    try {
      const repoUrl = `https://github.com/${owner}/${repo}`;
      const repository = await this.getRepository(repoUrl);
      
      if (!repository) {
        return undefined;
      }

      const commit = await repository.getCommit(sha);
      
      // Format to match GitHub API response structure
      return {
        sha: commit.id,
        commit: {
          message: commit.message,
          author: {
            name: commit.author.name,
            email: commit.author.email,
            date: commit.author.timestamp,
          },
          committer: {
            name: commit.committer.name,
            email: commit.committer.email,
            date: commit.committer.timestamp,
          },
        },
        author: {
          login: commit.author.name,
          html_url: `https://github.com/${commit.author.name}`,
        },
        html_url: `https://github.com/${owner}/${repo}/commit/${commit.id}`,
        parents: commit.parents.map(p => ({ sha: p })),
      };
    } catch (error) {
      console.warn("Failed to get commit data:", error);
      return undefined;
    }
  }

  /**
   * Get latest commit data (replaces GitHub API call)
   */
  async getLatestCommitData(
    configUrl: string,
    sha: string,
  ): Promise<any> {
    const { username, repoName } = getAuthorRepo(configUrl);
    if (!username || !repoName) {
      return undefined;
    }

    return await this.getCommitDataFromSha(username, repoName, sha);
  }

  /**
   * Get latest commit hash (replaces GitHub API calls)
   */
  async getLatestCommitHash(
    configUrl: string,
  ): Promise<string | undefined> {
    try {
      const repository = await this.getRepository(configUrl);
      if (!repository) {
        return undefined;
      }

      const repoInfo = await repository.getRepositoryInfo();
      const latestSha = await repository.resolveRef(repoInfo.defaultBranch);
      
      return latestSha;
    } catch (error) {
      console.warn("Failed to get latest commit hash:", error);
      return undefined;
    }
  }

  /**
   * Fetch readme content from config URL
   * This still uses HTTP fetch for simplicity, but could be replaced with Git operations
   */
  async fetchReadmeContentFromConfigUrl(configUrl: string): Promise<string | undefined> {
    try {
      // For now, keep the same logic as the original
      // This could be enhanced to use Git operations to fetch the file
      const url = getGithubContentUrlFromReadmeUrl(configUrl);

      if (url) {
        const response = await fetch(url);

        if (!response.ok) {
          return undefined;
        }

        const tomlText = await response.text();
        return tomlText;
      }

      return undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Alternative implementation using Git operations to fetch file content
   */
  async fetchFileContentFromGit(
    configUrl: string,
    filePath: string,
    ref: string = "HEAD"
  ): Promise<string | undefined> {
    try {
      const repository = await this.getRepository(configUrl);
      if (!repository) {
        return undefined;
      }

      // Resolve the ref to a commit SHA
      const commitSha = await repository.resolveRef(ref);
      
      // Get the tree for the commit
      const treeEntries = await repository.getTree(commitSha);
      
      // Find the file in the tree
      const fileEntry = treeEntries.find(entry => entry.path === filePath);
      if (!fileEntry || fileEntry.type !== "blob") {
        return undefined;
      }

      // Get the blob content
      const blob = await repository.getBlob(fileEntry.oid);
      return typeof blob.content === "string" ? blob.content : undefined;
    } catch (error) {
      console.warn("Failed to fetch file content from Git:", error);
      return undefined;
    }
  }
}

// Create singleton instance
const GitRepositoryService = new GitRepositoryServiceImpl();

export {
  GitRepositoryService,
  type FormattedCommit,
};

// Export the same functions as the original GithubService for drop-in replacement
export const getCommitHistory = GitRepositoryService.getCommitHistory.bind(GitRepositoryService);
export const getCommitDataFromSha = GitRepositoryService.getCommitDataFromSha.bind(GitRepositoryService);
export const getLatestCommitData = GitRepositoryService.getLatestCommitData.bind(GitRepositoryService);
export const getLatestCommitHash = GitRepositoryService.getLatestCommitHash.bind(GitRepositoryService);
export const fetchReadmeContentFromConfigUrl = GitRepositoryService.fetchReadmeContentFromConfigUrl.bind(GitRepositoryService);
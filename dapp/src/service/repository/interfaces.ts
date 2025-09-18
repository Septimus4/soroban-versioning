/**
 * Core interfaces for Git repository abstraction
 */

import type {
  Commit,
  TreeEntry,
  GitBlob,
  Diff,
  RepositoryInfo,
  CredentialInfo,
  ListCommitsOptions,
  DiffOptions,
} from "./types";

// Re-export types
export type {
  Commit,
  TreeEntry,
  GitBlob,
  Diff,
  RepositoryInfo,
  CredentialInfo,
  ListCommitsOptions,
  DiffOptions,
};

/**
 * Generic repository source that works with any Git provider
 */
export interface RepositorySource {
  /**
   * Initialize the repository source with local directory and remote URL
   */
  init(localDir: string, remoteUrl: string): Promise<void>;

  /**
   * Update/fetch the latest changes from remote
   */
  update(refs?: string[]): Promise<void>;

  /**
   * Resolve a ref (branch, tag, etc.) to a commit SHA
   */
  resolveRef(ref: string): Promise<string>;

  /**
   * List commits with various options
   */
  listCommits(opts?: ListCommitsOptions): Promise<Commit[]>;

  /**
   * Get a specific commit by its SHA
   */
  getCommit(oid: string): Promise<Commit>;

  /**
   * Get tree entries (files/directories) for a commit and optional path
   */
  getTree(oid: string, path?: string): Promise<TreeEntry[]>;

  /**
   * Get blob (file) content
   */
  getBlob(oid: string): Promise<GitBlob>;

  /**
   * Get diff between two commits
   */
  diff(base: string, head: string, opts?: DiffOptions): Promise<Diff>;

  /**
   * Get repository info
   */
  getRepositoryInfo(): Promise<RepositoryInfo>;
}

/**
 * Manages credentials for different Git hosts
 */
export interface CredentialManager {
  /**
   * Get credentials for a specific host
   */
  forHost(host: string): Promise<CredentialInfo>;
}

/**
 * URL parser and normalizer for Git URLs
 */
export interface GitUrlParser {
  /**
   * Parse and normalize a Git URL
   */
  parse(url: string): RepositoryInfo;

  /**
   * Validate if a URL is a supported Git URL
   */
  isValidGitUrl(url: string): boolean;
}
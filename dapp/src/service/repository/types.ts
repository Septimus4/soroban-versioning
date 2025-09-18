/**
 * Core domain types for Git repository abstraction
 */

export interface Commit {
  id: string;
  parents: string[];
  author: {
    name: string;
    email: string;
    timestamp: string;
  };
  committer: {
    name: string;
    email: string;
    timestamp: string;
  };
  message: string;
}

export interface TreeEntry {
  path: string;
  mode: string;
  oid: string;
  type: "blob" | "tree" | "submodule";
}

export interface GitBlob {
  oid: string;
  size: number;
  content: string | ReadableStream;
}

export interface DiffFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed" | "copied";
  oldPath?: string;
  patch?: string;
}

export interface Diff {
  fromCommit: string;
  toCommit: string;
  files: DiffFile[];
}

export interface RepositoryInfo {
  url: string;
  defaultBranch: string;
  host: string;
  owner: string;
  name: string;
}

export interface CredentialInfo {
  type: "https" | "ssh";
  username?: string;
  tokenOrPassword?: string;
  privateKeyPath?: string;
  passphrase?: string;
  sshAgent?: string;
}

export interface ListCommitsOptions {
  from?: string;
  to?: string;
  topo?: boolean;
  maxCount?: number;
  skip?: number;
}

export interface DiffOptions {
  includeRenames?: boolean;
  includeCopies?: boolean;
  contextLines?: number;
}
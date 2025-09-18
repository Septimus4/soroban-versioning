/**
 * Git URL parser that supports various Git providers and protocols
 */

import type { GitUrlParser, RepositoryInfo } from "./interfaces";

export class GitUrlParserImpl implements GitUrlParser {
  private readonly supportedHosts = [
    "github.com",
    "gitlab.com",
    "bitbucket.org",
    "dev.azure.com",
    "vs-ssh.visualstudio.com",
  ];

  parse(url: string): RepositoryInfo {
    // Remove trailing slash and .git suffix
    const cleanUrl = url.replace(/\/$/, "").replace(/\.git$/, "");

    // Handle HTTPS URLs (https://github.com/owner/repo)
    const httpsMatch = cleanUrl.match(
      /^https?:\/\/([^/]+)\/(.+?)\/([^/]+?)(?:\/.*)?$/,
    );
    if (httpsMatch) {
      const [, host, owner, name] = httpsMatch;
      return {
        url: cleanUrl,
        host,
        owner,
        name,
        defaultBranch: "main", // Will be detected later
      };
    }

    // Handle SSH URLs (git@github.com:owner/repo.git)
    const sshMatch = cleanUrl.match(/^git@([^:]+):(.+?)\/([^/]+?)(?:\.git)?$/);
    if (sshMatch) {
      const [, host, owner, name] = sshMatch;
      return {
        url: cleanUrl,
        host,
        owner,
        name,
        defaultBranch: "main", // Will be detected later
      };
    }

    // Handle Azure DevOps SSH format (git@ssh.dev.azure.com:v3/org/project/repo)
    const azureSshMatch = cleanUrl.match(
      /^git@ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/([^/]+)$/,
    );
    if (azureSshMatch) {
      const [, org, project, name] = azureSshMatch;
      return {
        url: cleanUrl,
        host: "dev.azure.com",
        owner: `${org}/${project}`,
        name,
        defaultBranch: "main",
      };
    }

    // Handle file:// URLs for local repositories
    const fileMatch = cleanUrl.match(/^file:\/\/(.+)$/);
    if (fileMatch) {
      const [, path] = fileMatch;
      const pathParts = path.split("/");
      const name = pathParts[pathParts.length - 1];
      return {
        url: cleanUrl,
        host: "localhost",
        owner: "local",
        name,
        defaultBranch: "main",
      };
    }

    throw new Error(`Unsupported Git URL format: ${url}`);
  }

  isValidGitUrl(url: string): boolean {
    try {
      this.parse(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if the host is a known Git provider
   */
  isSupportedHost(host: string): boolean {
    return this.supportedHosts.includes(host.toLowerCase());
  }

  /**
   * Convert SSH URL to HTTPS URL for the same repository
   */
  toHttpsUrl(repoInfo: RepositoryInfo): string {
    if (repoInfo.host === "dev.azure.com") {
      // Azure DevOps special case
      const [org, project] = repoInfo.owner.split("/");
      return `https://dev.azure.com/${org}/${project}/_git/${repoInfo.name}`;
    }

    return `https://${repoInfo.host}/${repoInfo.owner}/${repoInfo.name}`;
  }

  /**
   * Convert HTTPS URL to SSH URL for the same repository
   */
  toSshUrl(repoInfo: RepositoryInfo): string {
    if (repoInfo.host === "dev.azure.com") {
      return `git@ssh.dev.azure.com:v3/${repoInfo.owner}/${repoInfo.name}`;
    }

    return `git@${repoInfo.host}:${repoInfo.owner}/${repoInfo.name}.git`;
  }
}
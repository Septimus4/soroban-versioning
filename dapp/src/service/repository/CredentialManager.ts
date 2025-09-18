/**
 * Simple credential manager for Git operations
 */

import type { CredentialManager, CredentialInfo } from "./interfaces";

export class SimpleCredentialManager implements CredentialManager {
  private credentials: Map<string, CredentialInfo> = new Map();

  constructor() {
    // Add default credentials from environment variables
    this.addFromEnvironment();
  }

  async forHost(host: string): Promise<CredentialInfo> {
    const creds = this.credentials.get(host.toLowerCase());
    if (creds) {
      return creds;
    }

    // Default to SSH for unknown hosts
    return {
      type: "ssh",
      sshAgent: "default",
    };
  }

  /**
   * Add credentials for a specific host
   */
  addCredentials(host: string, credentials: CredentialInfo): void {
    this.credentials.set(host.toLowerCase(), credentials);
  }

  /**
   * Load credentials from environment variables
   */
  private addFromEnvironment(): void {
    // GitHub
    const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (githubToken) {
      this.addCredentials("github.com", {
        type: "https",
        username: "token",
        tokenOrPassword: githubToken,
      });
    }

    // GitLab
    const gitlabToken = process.env.GITLAB_TOKEN || process.env.CI_JOB_TOKEN;
    if (gitlabToken) {
      this.addCredentials("gitlab.com", {
        type: "https",
        username: "oauth2",
        tokenOrPassword: gitlabToken,
      });
    }

    // Bitbucket
    const bitbucketToken = process.env.BITBUCKET_TOKEN;
    if (bitbucketToken) {
      this.addCredentials("bitbucket.org", {
        type: "https",
        username: "x-token-auth",
        tokenOrPassword: bitbucketToken,
      });
    }

    // Azure DevOps
    const azureToken = process.env.AZURE_DEVOPS_TOKEN;
    if (azureToken) {
      this.addCredentials("dev.azure.com", {
        type: "https",
        username: "",
        tokenOrPassword: azureToken,
      });
    }
  }
}
/**
 * Comprehensive credential manager for Git operations across different providers
 */

import type { CredentialManager, CredentialInfo } from "./interfaces";

export class EnhancedCredentialManager implements CredentialManager {
  private credentials: Map<string, CredentialInfo> = new Map();
  private defaultCredentials: Map<string, CredentialInfo> = new Map();

  constructor() {
    // Initialize with environment variables and defaults
    this.initializeDefaults();
    this.loadFromEnvironment();
  }

  async forHost(host: string): Promise<CredentialInfo> {
    const normalizedHost = host.toLowerCase();
    
    // Check for specific credentials
    const creds = this.credentials.get(normalizedHost);
    if (creds) {
      return creds;
    }

    // Check for default credentials for known providers
    const defaultCreds = this.defaultCredentials.get(normalizedHost);
    if (defaultCreds) {
      return defaultCreds;
    }

    // Return SSH default for unknown hosts
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
   * Add credentials for a specific repository URL
   */
  addRepositoryCredentials(repoUrl: string, credentials: CredentialInfo): void {
    try {
      const url = new URL(repoUrl);
      this.addCredentials(url.hostname, credentials);
    } catch (error) {
      console.warn(`Invalid repository URL: ${repoUrl}`);
    }
  }

  /**
   * Load credentials from various sources
   */
  loadCredentialsFromConfig(config: {
    [host: string]: CredentialInfo;
  }): void {
    for (const [host, creds] of Object.entries(config)) {
      this.addCredentials(host, creds);
    }
  }

  /**
   * Initialize default credential strategies for known Git providers
   */
  private initializeDefaults(): void {
    // GitHub - prefer HTTPS with token
    this.defaultCredentials.set("github.com", {
      type: "https",
      username: "token",
      tokenOrPassword: "", // Will be populated from env vars
    });

    // GitLab - prefer HTTPS with oauth2
    this.defaultCredentials.set("gitlab.com", {
      type: "https", 
      username: "oauth2",
      tokenOrPassword: "",
    });

    // Bitbucket - prefer HTTPS with app password
    this.defaultCredentials.set("bitbucket.org", {
      type: "https",
      username: "x-token-auth", 
      tokenOrPassword: "",
    });

    // Azure DevOps - prefer HTTPS with PAT
    this.defaultCredentials.set("dev.azure.com", {
      type: "https",
      username: "",
      tokenOrPassword: "",
    });

    // SSH variant hosts
    this.defaultCredentials.set("ssh.dev.azure.com", {
      type: "ssh",
      sshAgent: "default",
    });

    // Gitea (common self-hosted)
    this.defaultCredentials.set("gitea.io", {
      type: "https",
      username: "token",
      tokenOrPassword: "",
    });

    // Codeberg (Gitea-based)
    this.defaultCredentials.set("codeberg.org", {
      type: "https", 
      username: "token",
      tokenOrPassword: "",
    });
  }

  /**
   * Load credentials from environment variables with multiple naming conventions
   */
  private loadFromEnvironment(): void {
    const envVars = [
      // GitHub
      { host: "github.com", tokens: ["GITHUB_TOKEN", "GH_TOKEN", "GITHUB_PAT"] },
      // GitLab
      { host: "gitlab.com", tokens: ["GITLAB_TOKEN", "CI_JOB_TOKEN", "GITLAB_PAT"] },
      // Bitbucket
      { host: "bitbucket.org", tokens: ["BITBUCKET_TOKEN", "BITBUCKET_APP_PASSWORD"] },
      // Azure DevOps
      { host: "dev.azure.com", tokens: ["AZURE_DEVOPS_TOKEN", "AZURE_PAT", "ADO_TOKEN"] },
      // Generic Git token
      { host: "*", tokens: ["GIT_TOKEN", "SCM_TOKEN"] },
    ];

    for (const { host, tokens } of envVars) {
      for (const tokenVar of tokens) {
        const token = this.getEnvVar(tokenVar);
        if (token) {
          if (host === "*") {
            // Apply generic token to all known hosts that don't have specific tokens
            for (const knownHost of Array.from(this.defaultCredentials.keys())) {
              const defaultCreds = this.defaultCredentials.get(knownHost)!;
              if (defaultCreds.type === "https" && !defaultCreds.tokenOrPassword) {
                this.addCredentials(knownHost, {
                  ...defaultCreds,
                  tokenOrPassword: token,
                });
              }
            }
          } else {
            const defaultCreds = this.defaultCredentials.get(host);
            if (defaultCreds && defaultCreds.type === "https") {
              this.addCredentials(host, {
                ...defaultCreds,
                tokenOrPassword: token,
              });
            }
          }
          break; // Use first available token
        }
      }
    }

    // Load SSH configurations
    this.loadSshCredentials();
  }

  /**
   * Load SSH-specific credentials
   */
  private loadSshCredentials(): void {
    const sshKey = this.getEnvVar("SSH_PRIVATE_KEY_PATH") || this.getEnvVar("GIT_SSH_KEY");
    const sshPassphrase = this.getEnvVar("SSH_PASSPHRASE");
    const sshAgent = this.getEnvVar("SSH_AUTH_SOCK");

    if (sshKey) {
      // Apply SSH credentials to all hosts that support SSH
      const sshCreds: CredentialInfo = {
        type: "ssh",
        privateKeyPath: sshKey,
        passphrase: sshPassphrase,
        sshAgent: sshAgent || "default",
      };

      // Apply to known SSH hosts
      const sshHosts = ["github.com", "gitlab.com", "bitbucket.org", "ssh.dev.azure.com"];
      for (const host of sshHosts) {
        // Only set SSH if no HTTPS token is available
        if (!this.credentials.has(host)) {
          this.addCredentials(host, sshCreds);
        }
      }
    }
  }

  /**
   * Get environment variable with fallbacks
   */
  private getEnvVar(name: string): string | undefined {
    // Check if we're in a Node.js environment
    if (typeof process !== "undefined" && process.env) {
      return process.env[name];
    }

    // Check for browser-based configuration (could be set by build tools)
    if (typeof window !== "undefined" && (window as any).ENV) {
      return (window as any).ENV[name];
    }

    return undefined;
  }

  /**
   * Validate credentials for a specific host
   */
  async validateCredentials(host: string): Promise<boolean> {
    try {
      const creds = await this.forHost(host);
      
      if (creds.type === "https") {
        return !!(creds.tokenOrPassword || creds.username);
      }
      
      if (creds.type === "ssh") {
        return !!(creds.privateKeyPath || creds.sshAgent);
      }
      
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Get authentication method priority for a host
   */
  getAuthenticationStrategy(host: string): "https" | "ssh" | "none" {
    const normalizedHost = host.toLowerCase();
    
    const creds = this.credentials.get(normalizedHost) || 
                  this.defaultCredentials.get(normalizedHost);
    
    if (creds) {
      return creds.type;
    }
    
    return "ssh"; // Default fallback
  }

  /**
   * Clear all credentials (useful for testing)
   */
  clearCredentials(): void {
    this.credentials.clear();
  }

  /**
   * Get debug information about loaded credentials (without exposing secrets)
   */
  getDebugInfo(): { [host: string]: { type: string; hasToken: boolean; hasKey: boolean } } {
    const info: { [host: string]: { type: string; hasToken: boolean; hasKey: boolean } } = {};
    
    for (const host of Array.from(this.credentials.keys())) {
      const creds = this.credentials.get(host)!;
      info[host] = {
        type: creds.type,
        hasToken: !!(creds.tokenOrPassword),
        hasKey: !!(creds.privateKeyPath),
      };
    }
    
    return info;
  }
}

// Create singleton instance but also export the class for custom instances
export const SimpleCredentialManager = EnhancedCredentialManager;
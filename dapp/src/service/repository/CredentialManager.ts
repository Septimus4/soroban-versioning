/**
 * Simple credential manager for public Git repositories
 */

import type { CredentialManager, CredentialInfo } from "./interfaces";

export class SimpleCredentialManager implements CredentialManager {
  async forHost(host: string): Promise<CredentialInfo> {
    // For public repositories, we don't need credentials
    // Default to HTTPS for known providers, no authentication required
    const normalizedHost = host.toLowerCase();
    
    if (this.isKnownPublicProvider(normalizedHost)) {
      return {
        type: "https",
      };
    }

    // For unknown hosts, assume public HTTPS access
    return {
      type: "https",
    };
  }

  /**
   * Check if the host is a known public Git provider
   */
  private isKnownPublicProvider(host: string): boolean {
    const publicProviders = [
      "github.com",
      "gitlab.com",
      "bitbucket.org", 
      "codeberg.org",
      "git.sr.ht",
      "gitea.io",
    ];
    
    return publicProviders.includes(host);
  }
}
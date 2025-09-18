/**
 * Factory for creating repository sources
 */

import type { RepositorySource } from "./interfaces";
import { GitCliSource } from "./GitCliSource";
import { BrowserCompatibleSource } from "./BrowserCompatibleSource";
import { SimpleCredentialManager } from "./CredentialManager";
import { GitUrlParserImpl } from "./GitUrlParser";

export class RepositoryFactory {
  private static credentialManager = new SimpleCredentialManager();
  private static urlParser = new GitUrlParserImpl();

  /**
   * Create the best available repository source for the current environment
   */
  static createRepositorySource(): RepositorySource {
    // Check if we're in a Node.js environment with Git CLI available
    if (this.isNodeEnvironment() && this.isGitAvailable()) {
      return new GitCliSource(this.credentialManager, this.urlParser);
    }

    // Fallback to browser-compatible HTTP-based source
    return new BrowserCompatibleSource();
  }

  /**
   * Create a Git CLI-based repository source (for server-side use)
   */
  static createGitCliSource(): RepositorySource {
    return new GitCliSource(this.credentialManager, this.urlParser);
  }

  /**
   * Create a browser-compatible repository source
   */
  static createBrowserSource(): RepositorySource {
    return new BrowserCompatibleSource();
  }

  /**
   * Get the URL parser instance
   */
  static getUrlParser() {
    return this.urlParser;
  }

  /**
   * Get the credential manager instance
   */
  static getCredentialManager() {
    return this.credentialManager;
  }

  private static isNodeEnvironment(): boolean {
    return typeof process !== "undefined" && 
           process.versions != null && 
           typeof process.versions.node === "string";
  }

  private static isGitAvailable(): boolean {
    if (!this.isNodeEnvironment()) {
      return false;
    }

    try {
      // Try to check if git is available
      const { execSync } = require("child_process");
      execSync("git --version", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }
}
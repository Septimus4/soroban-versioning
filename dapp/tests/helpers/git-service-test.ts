/**
 * Standalone test utility for Git Repository Service
 * Can be run independently to validate the service functionality
 */

export interface TestResult {
  name: string;
  success: boolean;
  error?: string;
  details?: any;
}

export class GitRepositoryServiceTester {
  private results: TestResult[] = [];

  async runAllTests(): Promise<TestResult[]> {
    this.results = [];

    await this.testUrlParsing();
    await this.testCredentialManager();
    await this.testRepositoryFactory();
    await this.testBrowserCompatibleSource();
    await this.testMultiProviderSupport();

    return this.results;
  }

  private async testUrlParsing(): Promise<void> {
    try {
      const { GitUrlParserImpl } = await import("../../src/service/repository/GitUrlParser.ts");
      const parser = new GitUrlParserImpl();

      const testCases = [
        { url: "https://github.com/octocat/Hello-World", expectedHost: "github.com", expectedOwner: "octocat", expectedName: "Hello-World" },
        { url: "git@github.com:octocat/Hello-World.git", expectedHost: "github.com", expectedOwner: "octocat", expectedName: "Hello-World" },
        { url: "https://gitlab.com/gitlab-org/gitlab-foss", expectedHost: "gitlab.com", expectedOwner: "gitlab-org", expectedName: "gitlab-foss" },
        { url: "https://bitbucket.org/atlassian/stash-example-plugin", expectedHost: "bitbucket.org", expectedOwner: "atlassian", expectedName: "stash-example-plugin" },
      ];

      const results = [];
      for (const testCase of testCases) {
        const parsed = parser.parse(testCase.url);
        const matches = (
          parsed.host === testCase.expectedHost &&
          parsed.owner === testCase.expectedOwner &&
          parsed.name === testCase.expectedName
        );
        
        results.push({
          url: testCase.url,
          matches,
          parsed: { host: parsed.host, owner: parsed.owner, name: parsed.name }
        });
      }

      const allMatch = results.every(r => r.matches);
      
      this.results.push({
        name: "URL Parsing",
        success: allMatch,
        details: results,
        error: allMatch ? undefined : "Some URLs failed to parse correctly"
      });
    } catch (error) {
      this.results.push({
        name: "URL Parsing",
        success: false,
        error: error.message
      });
    }
  }

  private async testCredentialManager(): Promise<void> {
    try {
      const { SimpleCredentialManager } = await import("../../src/service/repository/CredentialManager.ts");
      const credManager = new SimpleCredentialManager();

      const hosts = ["github.com", "gitlab.com", "bitbucket.org", "unknown-host.com"];
      const results = [];

      for (const host of hosts) {
        const creds = await credManager.forHost(host);
        results.push({
          host,
          type: creds.type,
          isHttps: creds.type === "https",
          hasNoToken: !creds.tokenOrPassword // Should be true for public repos
        });
      }

      const allHttps = results.every(r => r.isHttps);
      const allNoTokens = results.every(r => r.hasNoToken);

      this.results.push({
        name: "Credential Manager",
        success: allHttps && allNoTokens,
        details: results,
        error: (!allHttps || !allNoTokens) ? "Credentials not configured correctly for public repos" : undefined
      });
    } catch (error) {
      this.results.push({
        name: "Credential Manager", 
        success: false,
        error: error.message
      });
    }
  }

  private async testRepositoryFactory(): Promise<void> {
    try {
      const { RepositoryFactory } = await import("../../src/service/repository/RepositoryFactory.ts");
      
      const source = RepositoryFactory.createRepositorySource();
      const urlParser = RepositoryFactory.getUrlParser();
      const credManager = RepositoryFactory.getCredentialManager();

      const hasRequiredMethods = (
        typeof source.init === "function" &&
        typeof source.listCommits === "function" &&
        typeof source.getCommit === "function" &&
        typeof source.getRepositoryInfo === "function"
      );

      const factoryWorks = (
        !!source &&
        !!urlParser &&
        !!credManager &&
        hasRequiredMethods
      );

      this.results.push({
        name: "Repository Factory",
        success: factoryWorks,
        details: {
          sourceCreated: !!source,
          urlParserCreated: !!urlParser,
          credManagerCreated: !!credManager,
          hasRequiredMethods
        },
        error: factoryWorks ? undefined : "Factory failed to create required components"
      });
    } catch (error) {
      this.results.push({
        name: "Repository Factory",
        success: false,
        error: error.message
      });
    }
  }

  private async testBrowserCompatibleSource(): Promise<void> {
    try {
      const { BrowserCompatibleSource } = await import("../../src/service/repository/BrowserCompatibleSource.ts");
      
      const source = new BrowserCompatibleSource();

      // Test initialization (this shouldn't fail)
      await source.init("", "https://github.com/octocat/Hello-World");

      const hasRequiredMethods = (
        typeof source.listCommits === "function" &&
        typeof source.getCommit === "function" &&
        typeof source.getRepositoryInfo === "function" &&
        typeof source.resolveRef === "function"
      );

      this.results.push({
        name: "Browser Compatible Source",
        success: hasRequiredMethods,
        details: {
          initialized: true,
          hasRequiredMethods
        },
        error: hasRequiredMethods ? undefined : "Source missing required methods"
      });
    } catch (error) {
      this.results.push({
        name: "Browser Compatible Source",
        success: false,
        error: error.message
      });
    }
  }

  private async testMultiProviderSupport(): Promise<void> {
    try {
      const { GitUrlParserImpl } = await import("../../src/service/repository/GitUrlParser.ts");
      const parser = new GitUrlParserImpl();

      const providers = [
        { host: "github.com", expectedName: "GitHub" },
        { host: "gitlab.com", expectedName: "GitLab.com" },
        { host: "bitbucket.org", expectedName: "Bitbucket" },
        { host: "dev.azure.com", expectedName: "Azure DevOps" },
        { host: "codeberg.org", expectedName: "Codeberg" },
        { host: "git.sr.ht", expectedName: "SourceHut" },
      ];

      const results = providers.map(({ host, expectedName }) => {
        const info = parser.getProviderInfo(host);
        return {
          host,
          name: info.name,
          matches: info.name === expectedName,
          supportsApi: info.supportsApi
        };
      });

      const allMatch = results.every(r => r.matches);

      this.results.push({
        name: "Multi-Provider Support",
        success: allMatch,
        details: results,
        error: allMatch ? undefined : "Some providers not configured correctly"
      });
    } catch (error) {
      this.results.push({
        name: "Multi-Provider Support",
        success: false,
        error: error.message
      });
    }
  }

  getSuccessRate(): number {
    if (this.results.length === 0) return 0;
    const successCount = this.results.filter(r => r.success).length;
    return (successCount / this.results.length) * 100;
  }

  getSummary(): string {
    const total = this.results.length;
    const passed = this.results.filter(r => r.success).length;
    const failed = total - passed;
    const rate = this.getSuccessRate();

    return `Git Repository Service Tests: ${passed}/${total} passed (${rate.toFixed(1)}% success rate)${failed > 0 ? `, ${failed} failed` : ''}`;
  }
}
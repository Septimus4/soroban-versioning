import { test, expect } from "@playwright/test";

test.describe("Git Repository Service - Integration Validation", () => {
  test("Service can be imported and basic functions work", async ({ page }) => {
    await page.goto("http://localhost:4321");

    const result = await page.evaluate(async () => {
      try {
        // Test service imports
        const gitRepoService = await import("/src/service/GitRepositoryService.ts");
        const { RepositoryFactory } = await import("/src/service/repository/RepositoryFactory.ts");
        const { GitUrlParserImpl } = await import("/src/service/repository/GitUrlParser.ts");
        const { SimpleCredentialManager } = await import("/src/service/repository/CredentialManager.ts");

        // Test basic functionality
        const parser = new GitUrlParserImpl();
        const credManager = new SimpleCredentialManager();
        const factory = RepositoryFactory.createRepositorySource();

        // Test URL parsing
        const parsed = parser.parse("https://github.com/octocat/Hello-World");
        
        // Test credential management
        const creds = await credManager.forHost("github.com");
        
        // Test provider info
        const providerInfo = parser.getProviderInfo("github.com");

        return {
          success: true,
          imports: {
            gitRepoService: typeof gitRepoService === "object",
            repositoryFactory: typeof RepositoryFactory === "function",
            urlParser: typeof GitUrlParserImpl === "function",
            credManager: typeof SimpleCredentialManager === "function",
          },
          functionality: {
            urlParsing: {
              host: parsed.host,
              owner: parsed.owner,
              name: parsed.name,
            },
            credentials: {
              type: creds.type,
              noToken: !creds.tokenOrPassword,
            },
            providerInfo: {
              name: providerInfo.name,
              supportsApi: providerInfo.supportsApi,
            },
            factoryCreated: !!factory,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
        };
      }
    });

    // Validate imports work
    expect(result.success).toBe(true);
    expect(result.imports.gitRepoService).toBe(true);
    expect(result.imports.repositoryFactory).toBe(true);
    expect(result.imports.urlParser).toBe(true);
    expect(result.imports.credManager).toBe(true);

    // Validate basic functionality
    expect(result.functionality.urlParsing.host).toBe("github.com");
    expect(result.functionality.urlParsing.owner).toBe("octocat");
    expect(result.functionality.urlParsing.name).toBe("Hello-World");
    
    expect(result.functionality.credentials.type).toBe("https");
    expect(result.functionality.credentials.noToken).toBe(true);
    
    expect(result.functionality.providerInfo.name).toBe("GitHub");
    expect(result.functionality.providerInfo.supportsApi).toBe(true);
    
    expect(result.functionality.factoryCreated).toBe(true);
  });

  test("Service maintains API compatibility", async ({ page }) => {
    await page.goto("http://localhost:4321");

    // Mock GitHub API for testing
    await page.route("**/api.github.com/**", (route) => {
      const url = route.request().url();
      
      if (url.includes("/commits")) {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              sha: "abc123",
              commit: {
                message: "Test commit message",
                author: {
                  name: "Test Author",
                  email: "test@example.com",
                  date: "2024-01-01T00:00:00Z",
                },
              },
              author: {
                login: "test-author",
                html_url: "https://github.com/test-author",
              },
              html_url: "https://github.com/test/repo/commit/abc123",
            },
          ]),
        });
      } else if (url.includes("/repos/")) {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            default_branch: "main",
          }),
        });
      } else {
        route.continue();
      }
    });

    const result = await page.evaluate(async () => {
      try {
        const { 
          getCommitHistory, 
          getLatestCommitHash,
          getLatestCommitData,
          fetchReadmeContentFromConfigUrl 
        } = await import("/src/service/GitRepositoryService.ts");

        // Test the main functions that components use
        const history = await getCommitHistory("test", "repo", 1, 10);
        const latestHash = await getLatestCommitHash("https://github.com/test/repo");

        return {
          success: true,
          api: {
            getCommitHistory: {
              available: typeof getCommitHistory === "function",
              works: !!history && Array.isArray(history) && history.length > 0,
              hasCorrectStructure: history?.[0]?.commits?.[0]?.sha === "abc123",
            },
            getLatestCommitHash: {
              available: typeof getLatestCommitHash === "function", 
              works: typeof latestHash === "string",
            },
            getLatestCommitData: {
              available: typeof getLatestCommitData === "function",
            },
            fetchReadmeContentFromConfigUrl: {
              available: typeof fetchReadmeContentFromConfigUrl === "function",
            },
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
        };
      }
    });

    expect(result.success).toBe(true);
    
    // Validate all required functions are available
    expect(result.api.getCommitHistory.available).toBe(true);
    expect(result.api.getLatestCommitHash.available).toBe(true);
    expect(result.api.getLatestCommitData.available).toBe(true);
    expect(result.api.fetchReadmeContentFromConfigUrl.available).toBe(true);

    // Validate functions work correctly
    expect(result.api.getCommitHistory.works).toBe(true);
    expect(result.api.getCommitHistory.hasCorrectStructure).toBe(true);
    expect(result.api.getLatestCommitHash.works).toBe(true);
  });

  test("Error handling works correctly", async ({ page }) => {
    await page.goto("http://localhost:4321");

    // Mock error responses
    await page.route("**/api.github.com/**", (route) => {
      route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ message: "Not Found" }),
      });
    });

    const result = await page.evaluate(async () => {
      try {
        const { getCommitHistory, getLatestCommitHash } = await import("/src/service/GitRepositoryService.ts");

        // Test error handling - should not throw, should return null/undefined
        const history = await getCommitHistory("nonexistent", "repo", 1, 10);
        const latestHash = await getLatestCommitHash("https://github.com/nonexistent/repo");

        return {
          success: true,
          errorHandling: {
            historyReturnsNull: history === null,
            hashReturnsUndefined: latestHash === undefined,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
        };
      }
    });

    expect(result.success).toBe(true);
    expect(result.errorHandling.historyReturnsNull).toBe(true);
    expect(result.errorHandling.hashReturnsUndefined).toBe(true);
  });
});
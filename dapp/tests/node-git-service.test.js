#!/usr/bin/env node

/**
 * Node.js test runner for Git Repository Service
 * Tests core functionality without requiring browser environment
 */

import { pathToFileURL } from 'url';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const srcPath = join(__dirname, '../src/service/repository');

class NodeGitServiceTester {
  constructor() {
    this.results = [];
  }

  async runAllTests() {
    console.log('🧪 Running Git Repository Service Tests (Node.js)...\n');
    
    await this.testUrlParsing();
    await this.testCredentialManager();
    await this.testRepositoryFactory();
    await this.testProviderInfo();
    
    this.printResults();
    return this.results;
  }

  async testUrlParsing() {
    try {
      const { GitUrlParserImpl } = await import(pathToFileURL(join(srcPath, 'GitUrlParser.ts')).href);
      const parser = new GitUrlParserImpl();

      const testCases = [
        { 
          url: "https://github.com/octocat/Hello-World", 
          expected: { host: "github.com", owner: "octocat", name: "Hello-World" }
        },
        { 
          url: "git@github.com:octocat/Hello-World.git", 
          expected: { host: "github.com", owner: "octocat", name: "Hello-World" }
        },
        { 
          url: "https://gitlab.com/gitlab-org/gitlab-foss", 
          expected: { host: "gitlab.com", owner: "gitlab-org", name: "gitlab-foss" }
        },
        { 
          url: "https://bitbucket.org/atlassian/stash-example-plugin", 
          expected: { host: "bitbucket.org", owner: "atlassian", name: "stash-example-plugin" }
        },
        { 
          url: "https://dev.azure.com/myorg/myproject/_git/myrepo", 
          expected: { host: "dev.azure.com", owner: "myorg/myproject", name: "myrepo" }
        },
        { 
          url: "https://codeberg.org/user/project", 
          expected: { host: "codeberg.org", owner: "user", name: "project" }
        },
      ];

      let passed = 0;
      let failed = 0;

      for (const { url, expected } of testCases) {
        try {
          const parsed = parser.parse(url);
          const matches = (
            parsed.host === expected.host &&
            parsed.owner === expected.owner &&
            parsed.name === expected.name
          );
          
          if (matches) {
            passed++;
            console.log(`  ✅ ${url} → ${parsed.host}/${parsed.owner}/${parsed.name}`);
          } else {
            failed++;
            console.log(`  ❌ ${url} → Expected ${expected.host}/${expected.owner}/${expected.name}, got ${parsed.host}/${parsed.owner}/${parsed.name}`);
          }
        } catch (error) {
          failed++;
          console.log(`  ❌ ${url} → Error: ${error.message}`);
        }
      }

      this.results.push({
        name: "URL Parsing",
        success: failed === 0,
        passed,
        failed,
        total: testCases.length
      });

    } catch (error) {
      console.log(`  ❌ URL Parsing test failed: ${error.message}`);
      this.results.push({
        name: "URL Parsing", 
        success: false,
        error: error.message
      });
    }
  }

  async testCredentialManager() {
    try {
      const { SimpleCredentialManager } = await import(pathToFileURL(join(srcPath, 'CredentialManager.ts')).href);
      const credManager = new SimpleCredentialManager();

      const hosts = ["github.com", "gitlab.com", "bitbucket.org", "codeberg.org", "unknown-host.com"];
      let passed = 0;
      let failed = 0;

      for (const host of hosts) {
        try {
          const creds = await credManager.forHost(host);
          
          if (creds.type === "https" && !creds.tokenOrPassword) {
            passed++;
            console.log(`  ✅ ${host} → HTTPS, no token (public repo)`);
          } else {
            failed++;
            console.log(`  ❌ ${host} → Expected HTTPS with no token, got ${creds.type} with token: ${!!creds.tokenOrPassword}`);
          }
        } catch (error) {
          failed++;
          console.log(`  ❌ ${host} → Error: ${error.message}`);
        }
      }

      this.results.push({
        name: "Credential Manager",
        success: failed === 0,
        passed,
        failed,
        total: hosts.length
      });

    } catch (error) {
      console.log(`  ❌ Credential Manager test failed: ${error.message}`);
      this.results.push({
        name: "Credential Manager",
        success: false,
        error: error.message
      });
    }
  }

  async testRepositoryFactory() {
    try {
      const { RepositoryFactory } = await import(pathToFileURL(join(srcPath, 'RepositoryFactory.ts')).href);
      
      const source = RepositoryFactory.createRepositorySource();
      const urlParser = RepositoryFactory.getUrlParser();
      const credManager = RepositoryFactory.getCredentialManager();

      const tests = [
        { name: "Source created", check: !!source },
        { name: "URL parser created", check: !!urlParser },
        { name: "Credential manager created", check: !!credManager},
        { name: "Source has init method", check: typeof source.init === "function" },
        { name: "Source has listCommits method", check: typeof source.listCommits === "function" },
        { name: "Source has getCommit method", check: typeof source.getCommit === "function" },
        { name: "Source has getRepositoryInfo method", check: typeof source.getRepositoryInfo === "function" },
      ];

      let passed = 0;
      let failed = 0;

      tests.forEach(({ name, check }) => {
        if (check) {
          passed++;
          console.log(`  ✅ ${name}`);
        } else {
          failed++;
          console.log(`  ❌ ${name}`);
        }
      });

      this.results.push({
        name: "Repository Factory",
        success: failed === 0,
        passed,
        failed,
        total: tests.length
      });

    } catch (error) {
      console.log(`  ❌ Repository Factory test failed: ${error.message}`);
      this.results.push({
        name: "Repository Factory",
        success: false,
        error: error.message
      });
    }
  }

  async testProviderInfo() {
    try {
      const { GitUrlParserImpl } = await import(pathToFileURL(join(srcPath, 'GitUrlParser.ts')).href);
      const parser = new GitUrlParserImpl();

      const providers = [
        { host: "github.com", expectedName: "GitHub", expectedApi: true },
        { host: "gitlab.com", expectedName: "GitLab.com", expectedApi: true },
        { host: "bitbucket.org", expectedName: "Bitbucket", expectedApi: true },
        { host: "dev.azure.com", expectedName: "Azure DevOps", expectedApi: true },
        { host: "codeberg.org", expectedName: "Codeberg", expectedApi: true },
        { host: "git.sr.ht", expectedName: "SourceHut", expectedApi: true },
        { host: "unknown-host.com", expectedName: "Git Provider", expectedApi: false },
      ];

      let passed = 0;
      let failed = 0;

      providers.forEach(({ host, expectedName, expectedApi }) => {
        try {
          const info = parser.getProviderInfo(host);
          
          if (info.name === expectedName && info.supportsApi === expectedApi) {
            passed++;
            console.log(`  ✅ ${host} → ${info.name} (API: ${info.supportsApi})`);
          } else {
            failed++;
            console.log(`  ❌ ${host} → Expected ${expectedName} (API: ${expectedApi}), got ${info.name} (API: ${info.supportsApi})`);
          }
        } catch (error) {
          failed++;
          console.log(`  ❌ ${host} → Error: ${error.message}`);
        }
      });

      this.results.push({
        name: "Provider Info",
        success: failed === 0,
        passed,
        failed,
        total: providers.length
      });

    } catch (error) {
      console.log(`  ❌ Provider Info test failed: ${error.message}`);
      this.results.push({
        name: "Provider Info",
        success: false,
        error: error.message
      });
    }
  }

  printResults() {
    console.log('\n📊 Test Results:');
    console.log('================');

    let totalPassed = 0;
    let totalFailed = 0;
    let testSuitesPassed = 0;

    this.results.forEach(result => {
      const status = result.success ? '✅' : '❌';
      const details = result.passed !== undefined ? 
        ` (${result.passed}/${result.total} passed)` : 
        (result.error ? ` - ${result.error}` : '');
      
      console.log(`${status} ${result.name}${details}`);
      
      if (result.success) testSuitesPassed++;
      if (result.passed !== undefined) {
        totalPassed += result.passed;
        totalFailed += result.failed;
      }
    });

    const overallSuccess = testSuitesPassed === this.results.length;
    const successRate = this.results.length > 0 ? (testSuitesPassed / this.results.length * 100).toFixed(1) : 0;

    console.log('\n🎯 Summary:');
    console.log(`   Test Suites: ${testSuitesPassed}/${this.results.length} passed (${successRate}%)`);
    if (totalPassed + totalFailed > 0) {
      console.log(`   Individual Tests: ${totalPassed}/${totalPassed + totalFailed} passed`);
    }
    console.log(`   Overall: ${overallSuccess ? '✅ PASS' : '❌ FAIL'}`);

    return overallSuccess;
  }
}

// Run tests if this file is executed directly
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const tester = new NodeGitServiceTester();
  tester.runAllTests()
    .then((results) => {
      const success = results.every(r => r.success);
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('Test runner failed:', error);
      process.exit(1);
    });
}

export { NodeGitServiceTester };
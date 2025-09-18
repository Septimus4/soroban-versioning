# Repository Service

Provider-agnostic Git repository abstraction for public repositories.

## Architecture

- **`RepositorySource`** - Generic Git operations interface
- **`GitCliSource`** - Server-side Git CLI implementation  
- **`BrowserCompatibleSource`** - Browser HTTP API fallback
- **`SimpleCredentialManager`** - Basic credential handling for public repos
- **`GitUrlParser`** - Universal Git URL parsing

## Usage

```typescript
import { getCommitHistory } from "../GitRepositoryService";

// Works with any public Git provider
const history = await getCommitHistory("owner", "repo", 1, 30);
```

The system automatically detects the environment and uses the appropriate implementation:
- **Node.js**: Git CLI operations
- **Browser**: HTTP API fallback

## Supported Providers

- GitHub, GitLab, Bitbucket, Azure DevOps, Codeberg, SourceHut, Gitea
- Any public Git remote over HTTPS
- Self-hosted Git servers

For comprehensive documentation, see the [Git Repository Service guide](/docs/developers/git_repository_service).
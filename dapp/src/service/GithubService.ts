import type { FormattedCommit } from "../types/github";
const GIT_API_ENDPOINT = "/api/git";

function buildGitApiUrl(params: Record<string, string | number>): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    searchParams.set(key, String(value));
  });
  return `${GIT_API_ENDPOINT}?${searchParams.toString()}`;
}

async function getCommitHistory(
  repositoryUrl: string,
  page: number = 1,
  perPage: number = 30,
): Promise<{ date: string; commits: FormattedCommit[] }[]> {
  if (!repositoryUrl) {
    return [];
  }

  try {
    const response = await fetch(
      buildGitApiUrl({
        action: "history",
        repoUrl: repositoryUrl,
        page,
        perPage,
      }),
    );

    if (!response.ok) {
      return [];
    }

    const history = await response.json();
    if (!Array.isArray(history)) {
      return [];
    }

    return history as { date: string; commits: FormattedCommit[] }[];
  } catch {
    return [];
  }
}

async function getCommitDataFromSha(
  repositoryUrl: string,
  sha: string,
): Promise<any> {
  if (!repositoryUrl || !sha) {
    return undefined;
  }

  try {
    const response = await fetch(
      buildGitApiUrl({ action: "commit", repoUrl: repositoryUrl, sha }),
    );

    if (!response.ok) {
      return undefined;
    }

    return await response.json();
  } catch {
    return undefined;
  }
}

async function getLatestCommitData(
  configUrl: string,
  sha: string,
): Promise<any> {
  return await getCommitDataFromSha(configUrl, sha);
}

async function getLatestCommitHash(
  configUrl: string,
): Promise<string | undefined> {
  if (!configUrl) {
    return undefined;
  }

  try {
    const response = await fetch(
      buildGitApiUrl({ action: "latest", repoUrl: configUrl }),
    );
    if (!response.ok) {
      return undefined;
    }

    const payload = await response.json();
    if (payload && typeof payload.sha === "string") {
      return payload.sha;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

async function fetchReadmeContentFromConfigUrl(configUrl: string) {
  if (!configUrl) {
    return undefined;
  }

  try {
    const response = await fetch(
      buildGitApiUrl({ action: "file", repoUrl: configUrl, path: "README.md" }),
    );

    if (!response.ok) {
      return undefined;
    }

    const payload = await response.json();
    if (payload && typeof payload.content === "string") {
      return payload.content;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export {
  getCommitHistory,
  fetchReadmeContentFromConfigUrl,
  getLatestCommitData,
  getLatestCommitHash,
};

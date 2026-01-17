import type { GitlabProjectInfo, GitlabTag, GitlabBranch, GitlabRelease } from "./types";

export async function fetchProjectInfo(owner: string, project: string, token?: string): Promise<GitlabProjectInfo | null> {
  const projectPath = encodeURIComponent(`${owner}/${project}`);
  const url = `https://gitlab.com/api/v4/projects/${projectPath}`;
  const res = await gitlabRequest(url, token);
  if (!res.ok) return null;
  const data = await res.json();
  return {
    id: data.id,
    path: data.path ?? project,
    pathWithNamespace: data.path_with_namespace ?? `${owner}/${project}`,
    defaultBranch: data.default_branch ?? "main",
  };
}

export async function fetchProjectInfoWithStatus(
  owner: string,
  project: string,
  token?: string,
): Promise<{ info: GitlabProjectInfo | null; status: number; rateLimited: boolean }> {
  const projectPath = encodeURIComponent(`${owner}/${project}`);
  const url = `https://gitlab.com/api/v4/projects/${projectPath}`;
  const res = await gitlabRequest(url, token);
  const rateLimited = res.status === 429;
  if (!res.ok) return { info: null, status: res.status, rateLimited };
  const data = await res.json();
  return {
    info: {
      id: data.id,
      path: data.path ?? project,
      pathWithNamespace: data.path_with_namespace ?? `${owner}/${project}`,
      defaultBranch: data.default_branch ?? "main",
    },
    status: res.status,
    rateLimited: false,
  };
}

export async function fetchBranches(owner: string, project: string, token?: string): Promise<GitlabBranch[]> {
  const projectPath = encodeURIComponent(`${owner}/${project}`);
  const url = `https://gitlab.com/api/v4/projects/${projectPath}/repository/branches?per_page=100`;
  const res = await gitlabRequest(url, token);
  if (!res.ok) return [];
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.map((branch) => ({
    name: branch?.name ?? "",
    protected: Boolean(branch?.protected),
  })).filter((b) => b.name);
}

export async function fetchStableTags(owner: string, project: string, token?: string): Promise<GitlabTag[]> {
  const projectPath = encodeURIComponent(`${owner}/${project}`);
  
  // Try releases first
  const releasesUrl = `https://gitlab.com/api/v4/projects/${projectPath}/releases?per_page=100`;
  const releasesRes = await gitlabRequest(releasesUrl, token);
  if (releasesRes.ok) {
    const releases = await releasesRes.json();
    if (Array.isArray(releases)) {
      const stable = releases
        .slice(0, 30)
        .map((r) => ({
          name: String(r?.tag_name ?? "").trim(),
          createdAt: r?.released_at ?? null,
        }))
        .filter((t) => t.name && !isPrereleaseTag(t.name));
      if (stable.length > 0) return stable;
    }
  }

  // Fall back to tags
  const tagsUrl = `https://gitlab.com/api/v4/projects/${projectPath}/repository/tags?per_page=100`;
  const tagsRes = await gitlabRequest(tagsUrl, token);
  if (!tagsRes.ok) return [];
  const tags = await tagsRes.json();
  if (!Array.isArray(tags)) return [];
  return tags
    .slice(0, 30)
    .map((t) => ({ name: String(t?.name ?? "").trim(), createdAt: t?.created_at ?? null }))
    .filter((t) => t.name && !isPrereleaseTag(t.name));
}

function isPrereleaseTag(tag: string): boolean {
  const lower = tag.toLowerCase();
  const patterns = [
    "-alpha",
    "-beta",
    "-rc",
    "-canary",
    "-dev",
    "-nightly",
    "-preview",
    "-pre",
    "-next",
    "-snapshot",
    "-unstable",
  ];
  if (patterns.some((pattern) => lower.includes(pattern))) return true;
  const exact = ["canary", "next", "nightly", "latest", "dev", "master", "main"];
  return exact.includes(lower);
}

async function gitlabRequest(url: string, token?: string): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "librarian",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(url, { headers });
}

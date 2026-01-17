export type GitlabUrlParts = {
  owner: string;
  project: string;
  ref?: string;
  path?: string;
};

export function parseGitlabUrl(url: string): GitlabUrlParts | null {
  try {
    const u = new URL(url);
    if (u.hostname !== "gitlab.com") return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const owner = parts[0];
    const projectPart = parts[1];
    if (!owner || !projectPart) return null;
    const project = projectPart.replace(/\.git$/, "");

    if (parts[2] === "-" && parts[3] === "tree") {
      const ref = parts[4];
      const pathParts = parts.slice(5);
      return { owner, project, ref, path: pathParts.join("/") };
    }

    if (parts[2] === "-" && parts[3] === "blob") {
      const ref = parts[4];
      const pathParts = parts.slice(5);
      return { owner, project, ref, path: pathParts.join("/") };
    }

    return { owner, project };
  } catch {
    return null;
  }
}

export function normalizeDocsPath(pathValue: string | null): string | null {
  if (!pathValue) return null;
  const trimmed = pathValue.trim().replace(/^\//, "").replace(/\/$/, "");
  return trimmed || null;
}

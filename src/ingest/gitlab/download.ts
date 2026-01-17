import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";

export async function downloadGitlabArchive(input: {
  owner: string;
  project: string;
  ref: string;
  token?: string;
  previousEtag?: string | null;
}): Promise<{ path: string; etag: string | null } | { notModified: true; etag: string | null }> {
  const projectPath = encodeURIComponent(`${input.owner}/${input.project}`);
  const refEncoded = encodeURIComponent(input.ref);
  const url = `https://gitlab.com/api/v4/projects/${projectPath}/repository/archive.tar.gz?sha=${refEncoded}`;
  
  const headers: Record<string, string> = {
    "User-Agent": "librarian",
  };
  if (input.token) {
    headers.Authorization = `Bearer ${input.token}`;
  }
  if (input.previousEtag) {
    headers["If-None-Match"] = input.previousEtag;
  }

  const res = await fetch(url, { headers });
  const etag = res.headers.get("etag");

  if (res.status === 304) {
    return { notModified: true, etag };
  }

  if (!res.ok) {
    throw new Error(`GitLab archive download failed: ${res.status} ${res.statusText}`);
  }

  const tmpDir = join(tmpdir(), `librarian-gitlab-${randomBytes(8).toString("hex")}`);
  await mkdir(tmpDir, { recursive: true });
  const archivePath = join(tmpDir, "archive.tar.gz");
  const buffer = await res.arrayBuffer();
  await Bun.write(archivePath, buffer);

  return { path: archivePath, etag };
}

export async function cleanupDownload(path: string): Promise<void> {
  const dir = join(path, "..");
  if (existsSync(dir)) {
    await rm(dir, { recursive: true, force: true });
  }
}

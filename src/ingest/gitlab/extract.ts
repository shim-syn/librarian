import { promises as fs } from "node:fs";
import * as path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import type { ExtractedFile } from "./types";

export type ExtractResult = {
  tempDir: string;
  topLevelDir?: string;
};

export async function extractToTemp(archivePath: string): Promise<ExtractResult> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "librarian-gl-"));
  
  // Extract tar.gz using tar command
  const result = spawnSync("tar", ["-xzf", archivePath, "-C", tempDir], {
    encoding: "utf-8",
  });
  
  if (result.error || result.status !== 0) {
    throw new Error(`Failed to extract GitLab archive: ${result.stderr || result.error}`);
  }

  // Detect top-level directory
  const entries = await fs.readdir(tempDir);
  const topPrefix = entries.length === 1 && (await fs.stat(path.join(tempDir, entries[0]))).isDirectory() 
    ? entries[0] + "/"
    : null;

  return {
    tempDir,
    topLevelDir: topPrefix ? topPrefix.replace(/\/+$/, "") : undefined,
  };
}

export async function listFiles(root: string, basePath?: string): Promise<ExtractedFile[]> {
  const base = basePath ? path.join(root, basePath) : root;
  const results: ExtractedFile[] = [];

  async function walk(current: string) {
    let entries: string[];
    try {
      entries = await fs.readdir(current);
    } catch {
      return;
    }
    for (const name of entries) {
      const abs = path.join(current, name);
      const stat = await fs.lstat(abs).catch(() => null);
      if (!stat) continue;
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (!stat.isFile()) continue;
      const rel = path.relative(root, abs);
      results.push({ absPath: abs, relPath: rel.replace(/\\/g, "/") });
    }
  }

  await walk(base);
  results.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return results;
}

export async function cleanupTemp(tempDir: string) {
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}

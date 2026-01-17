import { downloadGitlabArchive, cleanupDownload } from "./download";
import { cleanupTemp, extractToTemp, listFiles } from "./extract";
import { filterAndLoadFiles, type FilterOptions } from "../github/filter";
import { buildRepoTree } from "../github/tree";
import type { LoadedFile, SkippedFile } from "./types";

export type GitlabSourceConfig = {
  owner: string;
  project: string;
  ref?: string;
  basePath?: string;
  ext?: string[];
  include?: string[];
  exclude?: string[];
};

export type GitlabSyncInput = {
  config: GitlabSourceConfig;
  token?: string;
  previousEtag?: string | null;
  force?: boolean;
  filter?: FilterOptions;
  onFile?: (file: LoadedFile) => Promise<void> | void;
};

export type GitlabSyncResult =
  | {
      status: "not-modified";
      etag?: string;
      processedFiles?: number;
    }
  | {
      status: "ok";
      etag?: string;
      tree: string;
      files: LoadedFile[];
      skipped: SkippedFile[];
      processedFiles: number;
    };

export async function syncGitlabRepo(input: GitlabSyncInput): Promise<GitlabSyncResult> {
  let extractDir: string | null = null;
  let archivePath: string | null = null;

  try {
    const download = await downloadGitlabArchive({
      owner: input.config.owner,
      project: input.config.project,
      ref: input.config.ref ?? "main",
      token: input.token,
      previousEtag: input.previousEtag ?? null,
    });

    if ("notModified" in download && download.notModified) {
      return {
        status: "not-modified",
        etag: download.etag ?? undefined,
        processedFiles: 0,
      };
    }

    if (!("path" in download)) {
      throw new Error("Unexpected download result");
    }

    archivePath = download.path;
    const extracted = await extractToTemp(download.path);
    extractDir = extracted.tempDir;

    const files = await listFiles(extracted.tempDir, input.config.basePath);
    const streamedPaths: string[] = [];
    let collected: LoadedFile[] = [];

    const { loaded, skipped } = await filterAndLoadFiles(
      files,
      {
        extensions: input.config.ext,
        include: input.config.include,
        exclude: input.config.exclude,
        maxFileBytes: input.filter?.maxFileBytes,
      },
      input.onFile
        ? async (file) => {
            streamedPaths.push(file.relPath);
            await input.onFile?.(file);
          }
        : undefined,
    );

    if (!input.onFile) {
      collected = loaded;
      for (const file of loaded) {
        streamedPaths.push(file.relPath);
      }
    }

    const tree = buildRepoTree([
      ...streamedPaths,
      ...skipped.map((skip) => skip.relPath),
    ]);

    return {
      status: "ok",
      etag: download.etag ?? undefined,
      tree,
      files: collected,
      skipped,
      processedFiles: streamedPaths.length,
    };
  } finally {
    if (extractDir) await cleanupTemp(extractDir);
    if (archivePath) await cleanupDownload(archivePath);
  }
}

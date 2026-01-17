export type GitlabProjectInfo = {
  id: number;
  path: string;
  pathWithNamespace: string;
  defaultBranch: string;
};

export type GitlabTag = {
  name: string;
  createdAt?: string | null;
};

export type GitlabBranch = {
  name: string;
  protected?: boolean;
};

export type GitlabRelease = {
  tagName: string;
  releasedAt?: string | null;
};

export type ExtractedFile = {
  relPath: string;
  absPath: string;
};

export type LoadedFile = {
  relPath: string;
  content: string;
  lang?: string;
  hash: string;
  byteSize: number;
};

export type SkippedFile = {
  relPath: string;
  size: number;
  maxBytes: number;
  reason: "file_too_large";
};

export { ingestGitlabSource } from "./ingest";
export { syncGitlabRepo } from "./sync";
export { parseGitlabUrl, normalizeDocsPath } from "./parse";
export { fetchProjectInfo, fetchBranches, fetchStableTags } from "./api";
export { extractMajorVersion, pickDefaultVersion } from "./versioning";
export type { GitlabUrlParts } from "./parse";
export type { GitlabProjectInfo, GitlabTag, GitlabBranch } from "./types";

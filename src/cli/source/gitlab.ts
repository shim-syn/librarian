import type { Store } from "../../store/db";
import { addGitlabSource } from "../../store";
import { loadConfig } from "../../core/config";
import { promptLine } from "../../core/prompt";
import { parseGitlabUrl, normalizeDocsPath } from "../../ingest/gitlab/parse";
import { fetchProjectInfo, fetchProjectInfoWithStatus, fetchStableTags, fetchBranches } from "../../ingest/gitlab/api";
import { pickDefaultVersion, extractMajorVersion } from "../../ingest/gitlab/versioning";
import { parseFlags } from "../flags";
import { selectRefAndLabel } from "../gitlab";
import { printError, printSourceHelp } from "../help";

export async function cmdSourceAddGitlab(store: Store, args: string[]): Promise<number | null> {
  const flags = parseFlags(args);
  const url = args[0];
  if (!url || url.startsWith("-")) {
    if (flags.noprompt) {
      printError("you need a GitLab URL");
      printSourceHelp();
      process.exitCode = 1;
      return null;
    }
    return await cmdSourceAddGitlabInteractive(store, args);
  }

  let normalizedUrl = url;
  if (!normalizedUrl.includes("://") && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(normalizedUrl)) {
    normalizedUrl = `https://gitlab.com/${normalizedUrl}`;
  }
  const parsed = parseGitlabUrl(normalizedUrl);
  if (!parsed) {
    printError("that does not look like a GitLab URL or owner/project");
    printSourceHelp();
    process.exitCode = 1;
    return null;
  }

  const listRefs = Boolean(flags["list-refs"]);
  const refsTypeRaw = String(flags["refs-type"] ?? "both").toLowerCase();
  const refsLimitRaw = flags["refs-limit"] ?? "20";
  const refsLimit = Number.parseInt(String(refsLimitRaw), 10) || 20;
  const refsFilter = typeof flags["refs-filter"] === "string" ? String(flags["refs-filter"]).trim() : "";
  if (listRefs) {
    await printProjectRefs(parsed.owner, parsed.project, {
      token: loadConfig().gitlab?.token,
      refsType: refsTypeRaw,
      refsLimit,
      refsFilter,
    });
    return null;
  }

  const name = flags.name ?? `${parsed.owner}/${parsed.project}`;
  const tag = flags.tag ? String(flags.tag) : null;
  let ref = flags.ref ?? parsed.ref ?? tag ?? null;
  let docsPath = normalizeDocsPath(flags.docs ?? parsed.path ?? null);
  const ingestMode = flags.mode ?? "docs";
  let versionLabel = flags.version ?? null;

  if (ref && !versionLabel) {
    versionLabel = extractMajorVersion(ref);
  }

  const config = loadConfig();
  const noPrompt = Boolean(flags.noprompt);
  if (!noPrompt && process.stdin.isTTY && config.gitlab?.token && !ref && !versionLabel) {
    const pick = await selectRefAndLabel(parsed.owner, parsed.project, config.gitlab.token);
    ref = pick.ref;
    versionLabel = pick.label;
  } else if (!ref || !versionLabel) {
    const projectInfo = await fetchProjectInfo(parsed.owner, parsed.project, config.gitlab?.token);
    if (projectInfo) {
      const tags = await fetchStableTags(parsed.owner, parsed.project, config.gitlab?.token);
      const pick = pickDefaultVersion({
        defaultBranch: projectInfo.defaultBranch,
        tags: tags.map((t) => t.name),
      });
      if (!ref) ref = pick.ref;
      if (!versionLabel) versionLabel = pick.label;
    }
  }
  if (!noPrompt && process.stdin.isTTY && !docsPath) {
    const docsInput = await promptLine("Docs path (optional): ");
    docsPath = normalizeDocsPath(docsInput || null);
  }

  const id = addGitlabSource(store.db, {
    name,
    owner: parsed.owner,
    repo: parsed.project,
    ref,
    docsPath,
    ingestMode,
    versionLabel,
  });
  console.log(`Added source ${id}: ${name}`);
  return id;
}

async function printProjectRefs(
  owner: string,
  project: string,
  input: { token?: string; refsType: string; refsLimit: number; refsFilter: string },
): Promise<void> {
  const refsType = input.refsType;
  const showTags = refsType === "both" || refsType === "tag" || refsType === "tags";
  const showBranches = refsType === "both" || refsType === "branch" || refsType === "branches";
  if (!showTags && !showBranches) {
    printError("refs type must be tag, branch, or both");
    printSourceHelp();
    process.exitCode = 1;
    return;
  }

  const projectInfoResult = await fetchProjectInfoWithStatus(owner, project, input.token);
  if (!projectInfoResult.info) {
    if (!input.token && projectInfoResult.rateLimited) {
      printError("GitLab is blocking extra requests. Add a token and try again.");
      process.exitCode = 1;
      return;
    }
    printError("project not found or access denied");
    process.exitCode = 1;
    return;
  }

  const tagsRaw = showTags ? await fetchStableTags(owner, project, input.token) : [];
  const branchesRaw = showBranches ? await fetchBranches(owner, project, input.token) : [];
  const tagsAll = tagsRaw.map((t) => t.name);
  const branchesAll = branchesRaw.map((b) => b.name);

  const filter = input.refsFilter ? input.refsFilter.toLowerCase() : "";
  const filterList = (items: string[]) =>
    filter ? items.filter((item) => item.toLowerCase().includes(filter)) : items;

  const tagsFiltered = filterList(tagsAll);
  const branchesFiltered = filterList(branchesAll);
  const limit = input.refsLimit > 0 ? input.refsLimit : 20;

  const pick = pickDefaultVersion({
    defaultBranch: projectInfoResult.info.defaultBranch,
    tags: tagsAll,
  });
  const defaultType = tagsAll.length > 0 ? "tag" : "branch";
  console.log(`Default: ${defaultType} ${pick.ref} (label ${pick.label})`);
  console.log("Use --tag <name> or --ref <name> to skip prompts.");
  if (filter) {
    console.log(`Filter: ${input.refsFilter}`);
  }

  if (showTags) {
    printRefList("Tags", tagsFiltered, tagsAll.length, limit);
  }

  if (showBranches) {
    const orderedBranches = reorderDefaultFirst(branchesFiltered, projectInfoResult.info.defaultBranch);
    printRefList("Branches", orderedBranches, branchesAll.length, limit);
  }
}

function printRefList(title: string, items: string[], total: number, limit: number): void {
  console.log(`${title}:`);
  if (items.length === 0) {
    console.log("  none");
    return;
  }
  const shown = items.slice(0, limit);
  shown.forEach((item, index) => {
    console.log(`  ${index + 1}. ${item}`);
  });
  if (total > shown.length) {
    console.log(`  ... and ${total - shown.length} more. Use --refs-limit or --refs-filter.`);
  }
}

function reorderDefaultFirst(items: string[], defaultBranch: string): string[] {
  if (!defaultBranch) return items;
  const idx = items.indexOf(defaultBranch);
  if (idx <= 0) return items;
  return [defaultBranch, ...items.slice(0, idx), ...items.slice(idx + 1)];
}

async function cmdSourceAddGitlabInteractive(store: Store, args: string[]): Promise<number | null> {
  const flags = parseFlags(args);
  const config = loadConfig();
  const token = config.gitlab?.token;

  const owner = await promptLine("Owner: ");
  const project = await promptLine("Project: ");
  if (!owner || !project) {
    printError("owner and project are required");
    printSourceHelp();
    process.exitCode = 1;
    return null;
  }

  if (flags.noprompt) {
    printError("--noprompt requires a URL");
    printSourceHelp();
    process.exitCode = 1;
    return null;
  }

  if (!token) {
    console.log("No GitLab token set. Public projects only.");
    console.log("GitLab may block extra requests if you use this a lot.");
  }

  const projectInfoResult = await fetchProjectInfoWithStatus(owner, project, token);
  if (!projectInfoResult.info) {
    if (!token && projectInfoResult.rateLimited) {
      printError("GitLab is blocking extra requests. Add a token and try again.");
      process.exitCode = 1;
      return null;
    }
    if (!token) {
      printError("project not found or access denied. Add a GitLab token for private projects.");
      process.exitCode = 1;
      return null;
    }
    printError("project not found or access denied.");
    process.exitCode = 1;
    return null;
  }

  const pick = await selectRefAndLabel(owner, project, token, projectInfoResult.info);
  const ref = pick.ref;
  const versionLabel = pick.label;
  const docsInput = await promptLine("Docs path (optional): ");
  const docsPath = normalizeDocsPath(docsInput || null);
  const ingestMode = flags.mode ?? "docs";
  const name = flags.name ?? `${owner}/${project}`;

  const id = addGitlabSource(store.db, {
    name,
    owner,
    repo: project,
    ref,
    docsPath,
    ingestMode,
    versionLabel,
  });
  console.log(`Added source ${id}: ${name}`);
  return id;
}

const VERSION_PATTERNS = [
  /^v?(\d+)\.(\d+)\.(\d+)$/,
  /^v?(\d+)\.(\d+)$/,
  /^v?(\d+)$/,
];

export function extractMajorVersion(ref: string): string {
  for (const pattern of VERSION_PATTERNS) {
    const match = ref.match(pattern);
    if (match) {
      const major = match[1];
      return `${major}.x`;
    }
  }
  return ref;
}

export function parseSeriesLabel(label: string): { major: number | null; original: string } {
  const match = label.match(/^(\d+)\.x$/);
  if (match) return { major: Number(match[1]), original: label };
  return { major: null, original: label };
}

export function pickDefaultVersion(input: {
  defaultBranch: string;
  tags: string[];
}): { ref: string; label: string } {
  if (input.tags.length > 0) {
    const tag = input.tags[0];
    return { ref: tag, label: extractMajorVersion(tag) };
  }
  return { ref: input.defaultBranch, label: input.defaultBranch };
}

export function getLatestTagByMajor(tags: string[], major: number): string | null;
export function getLatestTagByMajor(tags: string[]): Map<number, string>;
export function getLatestTagByMajor(tags: string[], major?: number): string | null | Map<number, string> {
  if (major !== undefined) {
    const filtered = tags.filter((tag) => {
      const label = extractMajorVersion(tag);
      const parsed = parseSeriesLabel(label);
      return parsed.major === major;
    });
    return filtered[0] ?? null;
  }
  
  // Return map of major version to latest tag
  const map = new Map<number, string>();
  for (const tag of tags) {
    const label = extractMajorVersion(tag);
    const parsed = parseSeriesLabel(label);
    if (parsed.major !== null && !map.has(parsed.major)) {
      map.set(parsed.major, tag);
    }
  }
  return map;
}

export function pickLatestForSeries(input: {
  versionLabel: string;
  tags: string[];
  defaultBranch: string;
}): string {
  const parsed = parseSeriesLabel(input.versionLabel);
  if (parsed.major !== null) {
    const latest = getLatestTagByMajor(input.tags, parsed.major);
    if (latest) return latest;
  }
  if (input.versionLabel === input.defaultBranch) {
    return input.defaultBranch;
  }
  const matchingTag = input.tags.find((t) => extractMajorVersion(t) === input.versionLabel);
  return matchingTag ?? input.defaultBranch;
}

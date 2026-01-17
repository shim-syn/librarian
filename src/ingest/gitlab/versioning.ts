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

export function parseSeriesLabel(label: string): number | null {
  const match = label.trim().match(/^v?(\d+)\.x$/i);
  if (!match) return null;
  return Number(match[1]);
}

export function pickDefaultVersion(input: {
  defaultBranch: string;
  tags: string[];
}): { ref: string; label: string } {
  if (input.tags.length === 0) {
    return { ref: input.defaultBranch, label: input.defaultBranch };
  }
  const tag = input.tags[0] ?? input.defaultBranch;
  return { ref: tag, label: extractMajorVersion(tag) };
}

export function getLatestTagByMajor(tags: string[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const tag of tags) {
    const label = extractMajorVersion(tag);
    const major = parseSeriesLabel(label);
    if (major !== null && !map.has(major)) {
      map.set(major, tag);
    }
  }
  return map;
}

export function pickLatestForSeries(input: {
  tags: string[];
  seriesLabel: string;
}): string | null {
  const major = parseSeriesLabel(input.seriesLabel);
  if (major === null) return null;
  const filtered = input.tags.filter((tag) => {
    const label = extractMajorVersion(tag);
    const tagMajor = parseSeriesLabel(label);
    return tagMajor === major;
  });
  return filtered[0] ?? null;
}

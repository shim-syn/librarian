import { describe, expect, test } from "bun:test";
import { parseGitlabUrl, normalizeDocsPath } from "../src/ingest/gitlab/parse";

describe("gitlab url parse", () => {
  test("parses basic project url", () => {
    const parsed = parseGitlabUrl("https://gitlab.com/foo/bar");
    expect(parsed?.owner).toBe("foo");
    expect(parsed?.project).toBe("bar");
  });

  test("parses tree url with path", () => {
    const parsed = parseGitlabUrl("https://gitlab.com/foo/bar/-/tree/main/docs");
    expect(parsed?.ref).toBe("main");
    expect(parsed?.path).toBe("docs");
  });

  test("parses blob url with path", () => {
    const parsed = parseGitlabUrl("https://gitlab.com/foo/bar/-/blob/main/README.md");
    expect(parsed?.ref).toBe("main");
    expect(parsed?.path).toBe("README.md");
  });

  test("normalizes docs path", () => {
    expect(normalizeDocsPath("/docs/")).toBe("docs");
  });

  test("returns null for non-gitlab urls", () => {
    expect(parseGitlabUrl("https://github.com/foo/bar")).toBeNull();
  });
});

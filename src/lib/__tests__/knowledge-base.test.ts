import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { KnowledgeBase, indexSections, isRestrictedPath } from "../knowledge-base";

let root: string;
let outside: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "snarl-kb-"));
  outside = fs.mkdtempSync(path.join(os.tmpdir(), "snarl-outside-"));
  fs.mkdirSync(path.join(root, "public", "places"), { recursive: true });
  fs.mkdirSync(path.join(root, "restricted"), { recursive: true });
  fs.mkdirSync(path.join(root, "notes"), { recursive: true });

  fs.writeFileSync(
    path.join(root, "public", "places", "sharn.md"),
    "# Sharn\n\nThe City of Towers rises above the Dagger River.\n\n## Districts\n\nUpper Menthis is famed for theatres.\n"
  );
  fs.writeFileSync(
    path.join(root, "restricted", "lyralei.md"),
    "# Lyralei\n\nPraetor Lyralei Siberclaw bound the Fragment with a sundering ritual.\n"
  );
  // A top-level file and a sibling directory that is not `public/`: both must
  // be treated as restricted.
  fs.writeFileSync(path.join(root, "README.md"), "# Zarantyr\n\nThe moon Zarantyr is secret.\n");
  fs.writeFileSync(path.join(root, "notes", "vol.md"), "# Vol\n\nThe lich Vol hides here.\n");
  // A symlink inside public/ pointing outside the tree must fail closed.
  fs.writeFileSync(path.join(outside, "leak.md"), "# Mordain\n\nMordain the Fleshweaver is hidden.\n");
  fs.symlinkSync(path.join(outside, "leak.md"), path.join(root, "public", "leak.md"));
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

describe("isRestrictedPath", () => {
  it("treats only files under public/ as public", () => {
    expect(isRestrictedPath(root, path.join(root, "public", "places", "sharn.md"))).toBe(false);
    expect(isRestrictedPath(root, path.join(root, "restricted", "lyralei.md"))).toBe(true);
    expect(isRestrictedPath(root, path.join(root, "README.md"))).toBe(true);
    expect(isRestrictedPath(root, path.join(root, "notes", "vol.md"))).toBe(true);
  });

  it("resolves symlinks and fails closed on anything outside the root", () => {
    expect(isRestrictedPath(root, path.join(root, "public", "leak.md"))).toBe(true);
    expect(isRestrictedPath(root, path.join(root, "public", "does-not-exist.md"))).toBe(true);
    expect(isRestrictedPath(root, path.join(outside, "leak.md"))).toBe(true);
  });

  it("is not fooled by a directory name that merely contains 'public'", () => {
    const dir = path.join(root, "publicity");
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, "x.md");
    fs.writeFileSync(f, "# Publicity Stunt\n\nhidden\n");
    expect(isRestrictedPath(root, f)).toBe(true);
  });
});

describe("indexSections", () => {
  it("keeps every section when a heading repeats within one file", () => {
    const md = "# Intro\n\nfirst\n\n## Notes\n\nalpha\n\n## Notes\n\nbeta\n";
    const sections = indexSections("/kb/public/a.md", md, false);
    expect(sections.map((s) => [s.title, s.content])).toEqual([
      ["Intro", "first"],
      ["Notes", "alpha"],
      ["Notes", "beta"],
    ]);
  });

  it("titles the preamble after the file name", () => {
    const sections = indexSections("/kb/public/a.md", "preamble text\n\n# H\n\nbody\n", false);
    expect(sections[0]).toMatchObject({ title: "a.md", content: "preamble text" });
  });
});

describe("KnowledgeBase.search", () => {
  it("hides restricted, top-level, sibling and symlinked content before the unlock", () => {
    const kb = new KnowledgeBase(root);
    for (const q of ["Lyralei", "Zarantyr", "Vol", "Mordain"]) {
      expect(kb.search(q, 3, 2000, false), q).toEqual([]);
    }
    expect(kb.search("Sharn", 3, 2000, false).map((r) => r.title)).toContain("Sharn");
  });

  it("opens restricted/ after the unlock", () => {
    const kb = new KnowledgeBase(root);
    expect(kb.search("Lyralei", 3, 2000, true).map((r) => r.title)).toContain("Lyralei");
  });

  it("returns nothing for an empty or whitespace query", () => {
    const kb = new KnowledgeBase(root);
    expect(kb.search("", 3, 2000, true)).toEqual([]);
    expect(kb.search("   ", 3, 2000, true)).toEqual([]);
    expect(kb.getContext("  \n ", 2000, true)).toBeNull();
  });

  it("returns null context when nothing matches", () => {
    const kb = new KnowledgeBase(root);
    expect(kb.getContext("xyzzy-nothing", 2000, true)).toBeNull();
  });
});

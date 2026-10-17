import fs from "fs";
import path from "path";

interface Section {
  title: string;
  content: string;
  source: string;
  restricted: boolean;
}

export interface SearchResult {
  score: number;
  title: string;
  content: string;
  source: string;
}

/**
 * Everything that is not under `public/` is restricted. Resolved through
 * symlinks and relative to the knowledge root, so a top-level file, a symlink
 * out of `public/`, or anything unexpected fails closed.
 */
export function isRestrictedPath(knowledgeRoot: string, filePath: string): boolean {
  let root: string;
  let real: string;
  try {
    root = fs.realpathSync(knowledgeRoot);
    real = fs.realpathSync(filePath);
  } catch {
    return true;
  }
  const rel = path.relative(root, real);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return true;
  const [first] = rel.split(path.sep);
  return first !== "public";
}

/** Split a markdown file into heading-delimited sections, keyed by position
 * so a repeated heading never overwrites an earlier section. */
export function indexSections(filepath: string, content: string, isRestricted: boolean): Section[] {
  // Leading newline so a heading on the first line starts its own section.
  const parts = ("\n" + content).split(/\n(#{1,3})\s+(.+)/);
  let currentTitle = path.basename(filepath);
  const out: Section[] = [];

  for (let i = 0; i < parts.length; i += 3) {
    const text = parts[i].trim();
    if (text) {
      out.push({ title: currentTitle, content: text, source: filepath, restricted: isRestricted });
    }
    if (i + 2 < parts.length) {
      currentTitle = parts[i + 2].trim();
    }
  }
  return out;
}

export class KnowledgeBase {
  private sections: Section[] | null = null;

  constructor(private readonly root: string) {}

  private load(): Section[] {
    if (this.sections) return this.sections;
    const out: Section[] = [];
    if (fs.existsSync(this.root)) {
      const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath);
          } else if (entry.name.endsWith(".md")) {
            const content = fs.readFileSync(fullPath, "utf-8");
            out.push(...indexSections(fullPath, content, isRestrictedPath(this.root, fullPath)));
          }
        }
      };
      walk(this.root);
    }
    this.sections = out;
    return out;
  }

  search(query: string, maxResults = 3, maxChars = 2000, allowRestricted = false): SearchResult[] {
    const queryLower = query.trim().toLowerCase();
    if (!queryLower) return [];

    const sections = this.load();
    if (sections.length === 0) return [];

    const keywords = queryLower.match(/\w+/g)?.filter((w) => w.length > 2) ?? [];
    const results: SearchResult[] = [];

    for (const section of sections) {
      if (section.restricted && !allowRestricted) continue;

      const contentLower = section.content.toLowerCase();
      const titleLower = section.title.toLowerCase();
      let score = 0;

      // Exact title match
      if (queryLower.includes(titleLower) || titleLower.includes(queryLower)) {
        score += 20;
      }

      for (const keyword of keywords) {
        score += (titleLower.split(keyword).length - 1) * 3;
        score += contentLower.split(keyword).length - 1;
      }

      if (score > 0) {
        results.push({
          score,
          title: section.title,
          content: section.content.slice(0, maxChars),
          source: section.source,
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, maxResults);
  }

  getContext(query: string, maxChars = 2000, allowRestricted = false): string | null {
    const results = this.search(query, 3, maxChars, allowRestricted);
    if (results.length === 0) return null;
    return results.map((r) => `[From ${r.title}]\n${r.content}`).join("\n\n");
  }
}

let defaultKb: KnowledgeBase | null = null;

function getDefault(): KnowledgeBase {
  if (!defaultKb) defaultKb = new KnowledgeBase(path.join(process.cwd(), "knowledge"));
  return defaultKb;
}

export function search(query: string, maxResults = 3, maxChars = 2000, allowRestricted = false) {
  return getDefault().search(query, maxResults, maxChars, allowRestricted);
}

export function getContext(query: string, maxChars = 2000, allowRestricted = false) {
  return getDefault().getContext(query, maxChars, allowRestricted);
}

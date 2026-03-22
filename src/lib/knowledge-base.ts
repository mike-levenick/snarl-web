import fs from "fs";
import path from "path";

interface Section {
  title: string;
  content: string;
  source: string;
  restricted: boolean;
}

interface SearchResult {
  score: number;
  title: string;
  content: string;
  source: string;
}

let sections: Map<string, Section> | null = null;

function indexSections(
  filepath: string,
  content: string,
  isRestricted: boolean,
  map: Map<string, Section>
) {
  const parts = content.split(/\n(#{1,3})\s+(.+)/);
  let currentTitle = path.basename(filepath);

  for (let i = 0; i < parts.length; i += 3) {
    const text = parts[i].trim();
    if (text) {
      const key = `${filepath}:${currentTitle}`;
      map.set(key, {
        title: currentTitle,
        content: text,
        source: filepath,
        restricted: isRestricted,
      });
    }
    if (i + 2 < parts.length) {
      currentTitle = parts[i + 2].trim();
    }
  }
}

function loadDocuments(): Map<string, Section> {
  const map = new Map<string, Section>();
  const knowledgeDir = path.join(process.cwd(), "knowledge");

  if (!fs.existsSync(knowledgeDir)) return map;

  function walkDir(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.name.endsWith(".md")) {
        const content = fs.readFileSync(fullPath, "utf-8");
        const isRestricted = fullPath.includes("/restricted/");
        indexSections(fullPath, content, isRestricted, map);
      }
    }
  }

  walkDir(knowledgeDir);
  return map;
}

function getSections(): Map<string, Section> {
  if (!sections) {
    sections = loadDocuments();
  }
  return sections;
}

export function search(
  query: string,
  maxResults = 3,
  maxChars = 2000,
  allowRestricted = false
): SearchResult[] {
  const sectionMap = getSections();
  if (sectionMap.size === 0) return [];

  const queryLower = query.toLowerCase();
  const keywords = queryLower.match(/\w+/g)?.filter((w) => w.length > 2) ?? [];

  const results: SearchResult[] = [];

  for (const section of sectionMap.values()) {
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

export function getContext(
  query: string,
  maxChars = 1000,
  allowRestricted = false
): string | null {
  const results = search(query, 2, maxChars, allowRestricted);

  if (results.length === 0) return null;

  return results
    .map((r) => `[From ${r.title}]\n${r.content}`)
    .join("\n\n");
}

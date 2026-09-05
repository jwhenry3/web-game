import { marked } from "marked";

export type ContentMeta = {
  title: string;
  date?: string;
  summary?: string;
  slug: string;
  body: string;
};

type RawModule = { default: string };

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const trimmed = raw.replace(/^\uFEFF/, "");
  if (!trimmed.startsWith("---")) {
    return { meta: {}, body: trimmed.trim() };
  }
  const end = trimmed.indexOf("\n---", 3);
  if (end < 0) return { meta: {}, body: trimmed.trim() };
  const block = trimmed.slice(3, end).trim();
  const body = trimmed.slice(end + 4).trim();
  const meta: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    const val = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    meta[key] = val;
  }
  return { meta, body };
}

function slugFromPath(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.replace(/\.md$/i, "");
}

function loadCollection(modules: Record<string, RawModule>): ContentMeta[] {
  const items: ContentMeta[] = [];
  for (const [path, mod] of Object.entries(modules)) {
    const { meta, body } = parseFrontmatter(mod.default);
    const slug = meta.slug || slugFromPath(path);
    items.push({
      title: meta.title || slug,
      date: meta.date,
      summary: meta.summary,
      slug,
      body,
    });
  }
  items.sort((a, b) => {
    if (a.date && b.date) return b.date.localeCompare(a.date);
    if (a.date) return -1;
    if (b.date) return 1;
    return a.title.localeCompare(b.title);
  });
  return items;
}

const newsModules = import.meta.glob("../../content/news/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

const wikiModules = import.meta.glob("../../content/wiki/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

const guideModules = import.meta.glob("../../content/guide/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

function wrapRaw(modules: Record<string, string>): Record<string, RawModule> {
  const out: Record<string, RawModule> = {};
  for (const [k, v] of Object.entries(modules)) out[k] = { default: v };
  return out;
}

export const newsPosts = loadCollection(wrapRaw(newsModules));
export const wikiArticles = loadCollection(wrapRaw(wikiModules));
export const guideArticles = loadCollection(wrapRaw(guideModules));

export function findBySlug(items: ContentMeta[], slug: string): ContentMeta | undefined {
  return items.find((i) => i.slug === slug);
}

export function renderMarkdown(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

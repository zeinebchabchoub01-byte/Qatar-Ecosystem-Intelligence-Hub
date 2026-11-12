import { decodeHTML } from "entities";
import { createHash } from "node:crypto";
import Parser from "rss-parser";
import sanitize from "sanitize-html";
import { parseDocument } from "htmlparser2";
import { findAll, getOuterHTML } from "domutils";
import type { Article, Feed } from "../src/types";
import { passesQualityChecks } from "./quality";
export const hash = (v: string) => createHash("sha256").update(v).digest("hex");
export const text = (v: string = "") =>
  decodeHTML(sanitize(v, { allowedTags: [], allowedAttributes: {} }))
    .replace(/\s+/g, " ")
    .trim();
// Keep paragraph boundaries until after extracting the excerpt. contentSnippet
// has already flattened them and can contain the entire article.
export function firstParagraph(value: string = "") {
  const clean = sanitize(value, {
    allowedTags: ["p", "br"],
    allowedAttributes: {},
  });
  const paragraphs = findAll((node) => node.name === "p", parseDocument(clean).children);
  for (const paragraph of paragraphs) {
    const excerpt = text(getOuterHTML(paragraph));
    if (excerpt) return excerpt;
  }
  return text(clean.split(/(?:\r?\n\s*){2,}|(?:<br\s*\/?>(?:\s*)){2,}/i)[0]);
}
export function articleUrl(raw: string) {
  let u = new URL(raw);
  if (/(^|\.)google\.[a-z.]+$/.test(u.hostname) && u.pathname === "/url") {
    const target = u.searchParams.get("url") || u.searchParams.get("q");
    if (target) u = new URL(target);
  }
  if (!["https:", "http:"].includes(u.protocol))
    throw new Error("Unsafe article URL");
  return u.href;
}
export function canonical(raw: string) {
  const u = new URL(articleUrl(raw));
  u.hash = "";
  for (const key of [...u.searchParams.keys()])
    if (/^(utm_|gclid|fbclid)/i.test(key)) u.searchParams.delete(key);
  u.searchParams.sort();
  u.pathname = u.pathname.replace(/\/$/, "") || "/";
  return u.href;
}
export function detectLanguage(
  title: string,
  description: string,
): "English" | "Arabic" {
  const value = title || description;
  const ar = (value.match(/[\u0620-\u064a\u066e-\u06d3]/g) || []).length;
  const latin = (value.match(/[a-z]/gi) || []).length;
  return ar > latin ? "Arabic" : "English";
}
export async function parse(
  xml: string,
  feed: Feed,
  now = new Date().toISOString(),
): Promise<Article[]> {
  const parsed = await new Parser().parseString(xml);
  const articles: Article[] = [];
  for (const item of parsed.items) {
    try {
      if (!item.link || !text(item.title)) continue;
      const url = articleUrl(item.link);
      const date = item.isoDate || item.pubDate;
      const publishedAt =
        date && Number.isFinite(Date.parse(date))
          ? new Date(date).toISOString()
          : null;
      const description = [
        item["content:encoded"], item.content, item.summary, item.contentSnippet,
      ].map((value) => firstParagraph(value || "")).find(Boolean) || "";
      const title = text(item.title);
      if (!passesQualityChecks({ title, description })) continue;
      const publisher =
        text((item as any).creator || "") ||
        new URL(url).hostname.replace(/^www\./, "");
      articles.push({
        id: hash(item.guid || canonical(url)),
        guids: item.guid ? [item.guid] : [],
        url,
        title,
        description,
        publisher,
        publishedAt,
        collectedAt: now,
        language: detectLanguage(title, description),
        categories: [feed.category],
        sourceIds: [feed.id],
      });
    } catch {
      /* Skip malformed entry; preserve other entries. */
    }
  }
  return articles;
}
export function mergeArticles(existing: Article[], incoming: Article[]) {
  const out = [...existing];
  const byUrl = new Map(out.map((a) => [canonical(a.url), a]));
  const byGuid = new Map(
    out.flatMap((a) => a.guids.map((g) => [g, a] as const)),
  );
  let added = 0;
  for (const a of incoming) {
    const prior =
      a.guids.map((g) => byGuid.get(g)).find(Boolean) ||
      byUrl.get(canonical(a.url));
    if (prior) {
      prior.title = a.title;
      prior.description = a.description;
      prior.language = a.language;
      prior.sourceIds = [...new Set([...prior.sourceIds, ...a.sourceIds])];
      prior.categories = [...new Set([...prior.categories, ...a.categories])];
      prior.guids = [...new Set([...prior.guids, ...a.guids])];
      byUrl.set(canonical(a.url), prior);
      for (const g of prior.guids) byGuid.set(g, prior);
    } else {
      out.push(a);
      byUrl.set(canonical(a.url), a);
      for (const g of a.guids) byGuid.set(g, a);
      added++;
    }
  }
  return { articles: out, added };
}
export async function fetchFeed(feed: Feed) {
  const isFalakPage = [
    "falak-network",
    "falak-reports",
  ].includes(feed.id);
  const response = await fetch(feed.url, {
    signal: AbortSignal.timeout(12000),
    headers: {
      Accept: isFalakPage
        ? "text/html"
        : "application/atom+xml, application/rss+xml, application/xml",
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty response");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > 3_000_000) {
      await reader.cancel();
      throw new Error("Feed exceeds 3 MB limit");
    }
    chunks.push(value);
  }
  const content = Buffer.concat(chunks).toString("utf8");
  if (isFalakPage) {
    const { parseFalakPage } = await import("./falak");
    return parseFalakPage(content, feed);
  }
  return parse(content, feed);
}

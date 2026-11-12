import { parseDocument } from "htmlparser2";
import { findAll, getOuterHTML, hasAttrib } from "domutils";
import type { Element } from "domhandler";
import type { Article, Feed } from "../src/types";
import { canonical, detectLanguage, hash, text } from "./rss";
import { passesQualityChecks } from "./quality";

export const networkUnavailable =
  "Falak’s network page currently has no incubator or accelerator listings; it displays Knowledge Hub content instead.";
const hasClass = (node: Element, name: string) =>
  (node.attribs.class || "").split(/\s+/).includes(name);

// Only parse public listing cards, never navigation, scripts or unrelated blog links.
export function parseFalakPage(
  html: string,
  feed: Feed,
  now = new Date().toISOString(),
): Article[] {
  const document = parseDocument(html);
  const main = findAll((n) => n.name === "main", document.children)[0];
  if (!main) throw new Error("Falak listing markup unavailable");
  const network = feed.id === "falak-network";
  const cards = findAll(
    (n) =>
      hasClass(n, "product-card") || (network && hasClass(n, "network-card")),
    main.children,
  );
  const entries = new Map<string, Article>();
  for (const card of cards) {
    const titles = findAll(
      (n) =>
        hasClass(n, "product-card__title") ||
        (network && /^h[2-6]$/.test(n.name)),
      [card],
    );
    const titleNode = titles[0];
    if (!titleNode) continue;
    const anchor =
      titleNode.name === "a"
        ? titleNode
        : findAll(
            (n) => n.name === "a" && hasAttrib(n, "href"),
            titleNode.children,
          )[0];
    if (!anchor) continue;
    let url: URL;
    try {
      url = new URL(anchor.attribs.href, feed.url);
    } catch {
      continue;
    }
    if (
      url.protocol !== "https:" ||
      !["falak.qa", "www.falak.qa"].includes(url.hostname) ||
      (!network && !url.pathname.startsWith("/products/"))
    )
      continue;
    const title = text(getOuterHTML(titleNode));
    const descriptionNode = findAll(
      (n) =>
        hasClass(n, "product-details") || hasClass(n, "product-description"),
      card.children,
    )[0];
    const description = descriptionNode
      ? text(getOuterHTML(descriptionNode))
      : "";
    if (!title || !passesQualityChecks({ title, description })) continue;
    const cleanUrl = canonical(url.href);
    entries.set(cleanUrl, {
      id: hash(cleanUrl),
      guids: [],
      url: cleanUrl,
      title,
      description,
      publisher: "Falak",
      publishedAt: null,
      collectedAt: now,
      language: detectLanguage(title, description),
      categories: [feed.category],
      sourceIds: [feed.id],
    });
  }
  if (!entries.size)
    throw new Error(
      network ? networkUnavailable : "Falak listing markup unavailable",
    );
  return [...entries.values()];
}

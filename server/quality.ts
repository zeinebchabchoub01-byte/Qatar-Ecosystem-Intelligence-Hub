import type { Article } from "../src/types";

const months = "january|february|march|april|may|june|july|august|september|october|november|december|janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro";
const dateOnly = new RegExp(
  `^(?:\\d{1,2}\\s+(?:de\\s+)?(?:${months})\\s+(?:de\\s+)?\\d{4}|(?:${months})\\s+\\d{1,2},?\\s+\\d{4}|\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}|\\d{1,2}[-/.]\\d{1,2}[-/.]\\d{4})$`,
  "iu",
);

// Conservative quality checks, not a topic-relevance or factual-accuracy verdict.
export function passesQualityChecks(article: Pick<Article, "title" | "description">) {
  const title = article.title.trim().replace(/\s*[-–—|]\s*YouTube\s*$/iu, "").trim();
  if (!title || /^youtube$/iu.test(title) || dateOnly.test(title)) return false;
  const description = article.description.replace(/\s+/g, " ").trim();
  return !/^share your videos with friends, family, and the world[.!]?$/iu.test(description);
}

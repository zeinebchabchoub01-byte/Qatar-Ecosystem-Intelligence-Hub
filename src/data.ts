import type { Article } from "./types";
export interface Filters {
  keyword: string;
  category: string;
  language: string;
  source: string;
  from: string;
  to: string;
  sort: string;
}
export const emptyFilters: Filters = {
  keyword: "",
  category: "",
  language: "",
  source: "",
  from: "",
  to: "",
  sort: "newest",
};
export function filterArticles(articles: Article[], f: Filters) {
  return articles
    .filter(
      (a) =>
        (!f.keyword ||
          `${a.title} ${a.description} ${a.publisher}`
            .toLocaleLowerCase()
            .includes(f.keyword.toLocaleLowerCase())) &&
        (!f.category || a.categories.includes(f.category)) &&
        (!f.language || a.language === f.language) &&
        (!f.source || a.sourceIds.includes(f.source)) &&
        (!f.from ||
          (!!a.publishedAt &&
            Date.parse(a.publishedAt) >=
              Date.parse(`${f.from}T00:00:00+03:00`))) &&
        (!f.to ||
          (!!a.publishedAt &&
            Date.parse(a.publishedAt) <
              Date.parse(`${f.to}T00:00:00+03:00`) + 86400000)),
    )
    .sort((a, b) => {
      if (!a.publishedAt) return b.publishedAt ? 1 : 0;
      if (!b.publishedAt) return -1;
      return (
        (Date.parse(a.publishedAt) - Date.parse(b.publishedAt)) *
        (f.sort === "oldest" ? 1 : -1)
      );
    });
}
export function csv(articles: Article[]) {
  const cell = (v: string) =>
    '"' + (/^[\s]*[=+@\-]/.test(v) ? "'" + v : v).replaceAll('"', '""') + '"';
  return (
    "\uFEFF" +
    [
      [
        "Headline",
        "Description",
        "Publisher",
        "Categories",
        "Language",
        "Publication date",
        "Original URL",
      ],
      ...articles.map((a) => [
        a.title,
        a.description,
        a.publisher,
        a.categories.join("; "),
        a.language,
        a.publishedAt || "Unavailable",
        a.url,
      ]),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n")
  );
}
export const qatarDay = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Qatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
export function weekStart(now = new Date()) {
  const d = new Date(now.getTime() + 10800000);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

import type { Article } from "../src/types";
import { builtInFeeds } from "./sources";

export const isDirectoryArticle = (article: Article) =>
  article.sourceIds.includes("falak-startups");

// Apply current source labels to historical entries as well as new collections.
export function currentArticles(articles: Article[]): Article[] {
  return articles.filter((article) => !isDirectoryArticle(article)).map((article) => {
    const falakFeeds = builtInFeeds.filter((feed) => article.sourceIds.includes(feed.id));
    if (!falakFeeds.length) return article;
    const oldLabels = new Set(falakFeeds.map((feed) => feed.category.replace(/^falaq\//, "")));
    return {
      ...article,
      categories: [...new Set([
        ...article.categories.filter((category) => !oldLabels.has(category)),
        ...falakFeeds.map((feed) => feed.category),
      ])],
    };
  });
}

import { networkUnavailable } from "./falak";
import { randomUUID } from "node:crypto";
import { store, read, list } from "./storage";
import { enabledFeeds } from "./sources";
import { fetchFeed, mergeArticles } from "./rss";
import { currentArticles, isDirectoryArticle } from "./article-sources";
import type { Article, SyncRun, Feed } from "../src/types";
// Atomic lease avoids concurrent read/merge/write sync runs. Worker finishes in < 5 minutes.
export async function synchronize(
  fetcher: (f: Feed) => Promise<Article[]> = fetchFeed,
) {
  const db = store();
  const now = Date.now();
  const lease = await db.getWithMetadata("sync-lock", { type: "json" });
  if (lease && (lease.data as { expires: number }).expires > now)
    return { busy: true };
  const lock = await db.setJSON(
    "sync-lock",
    { expires: now + 12 * 60_000 },
    { ...(lease ? { onlyIfMatch: lease.etag } : { onlyIfNew: true }) },
  );
  if (!lock.modified) return { busy: true };
  const run: SyncRun = {
    id: randomUUID(),
    startedAt: new Date().toISOString(),
    status: "running",
    successful: 0,
    failed: 0,
    added: 0,
  };
  try {
    await db.setJSON("sync-current", run);
    const stored = await list<Article>("article/");
    for (const article of stored.filter(isDirectoryArticle)) {
      await db.delete(`article/${article.id}`);
      await db.delete(`bookmark/${article.id}`);
    }
    await db.delete("status/falak-startups");
    await db.delete("enabled/falak-startups");
    const feeds = await enabledFeeds();
    if (!feeds.length)
      throw new Error(
        "No enabled, configured feeds. Import your feed inventory in Sources.",
      );
    const incoming: Article[] = [];
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(5, feeds.length) }, async () => {
        while (next < feeds.length) {
          const feed = feeds[next++];
          const lastAttempt = new Date().toISOString();
          try {
            const articles = await fetcher(feed);
            incoming.push(...articles);
            await db.setJSON(`status/${feed.id}`, {
              lastAttempt,
              lastSuccess: new Date().toISOString(),
              lastError: null,
              items: articles.length,
            });
            run.successful++;
          } catch (e) {
            run.failed++;
            const prior = await read<Record<string, unknown>>(
              `status/${feed.id}`,
              {},
            );
            await db.setJSON(`status/${feed.id}`, {
              ...prior,
              lastAttempt,
              lastError:
                e instanceof Error &&
                (/^HTTP \d+$/.test(e.message) ||
                  e.message === networkUnavailable)
                  ? e.message
                  : "Feed fetch or parsing failed; check the RSS URL and retry.",
            });
          }
        }
      }),
    );
    const existing = currentArticles(stored);
    const merged = mergeArticles(existing, currentArticles(incoming));
    run.added = merged.added;
    for (let i = 0; i < merged.articles.length; i += 20) {
      await Promise.all(
        merged.articles
          .slice(i, i + 20)
          .map((a) => db.setJSON(`article/${a.id}`, a)),
      );
    }
    run.status = run.failed
      ? run.successful
        ? "partial"
        : "failed"
      : "success";
    if (run.status === "success")
      await db.setJSON("last-success", new Date().toISOString());
  } catch (e) {
    run.status = "failed";
    run.error = e instanceof Error ? e.message : "Synchronization failed";
  } finally {
    run.finishedAt = new Date().toISOString();
    await db.setJSON("sync-current", run);
    await db.setJSON(`run/${run.id}`, run);
    await db.delete("sync-lock");
  }
  return run;
}

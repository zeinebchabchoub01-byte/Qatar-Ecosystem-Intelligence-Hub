import { createHash, randomUUID } from "node:crypto";
import { and, eq, lte, ne, or, sql } from "drizzle-orm";
import { database } from "../db/index.js";
import { eventCollections } from "../db/schema.js";
import { eventFeeds, eventMarkupError } from "./events";
import { eventRecordsUnavailable, incubatorUnverified } from "./event-sources";
import { enabledFeeds } from "./sources";
import { fetchFeed } from "./rss";
import { saveEvents } from "./event-storage";
import { dispatch } from "./auth";
import type { Article, EventCollection, Feed, QatarEvent } from "../src/types";

const version = createHash("sha256")
  .update(JSON.stringify(eventFeeds))
  .digest("hex");
const expiration = (ms: number) => new Date(Date.now() + ms).toISOString();
export const collectionRepository = {
  async load(): Promise<EventCollection | null> {
    return (
      (
        await database()
          .select()
          .from(eventCollections)
          .where(eq(eventCollections.id, "events"))
      )[0]?.details ?? null
    );
  },
  async claim(run: EventCollection) {
    const values = {
      id: "events",
      version,
      expiresAt: expiration(5 * 60_000),
      details: run,
    };
    const rows = await database()
      .insert(eventCollections)
      .values(values)
      .onConflictDoUpdate({
        target: eventCollections.id,
        set: values,
        setWhere: or(
          lte(eventCollections.expiresAt, new Date().toISOString()),
          and(
            ne(eventCollections.version, version),
            sql`${eventCollections.details}->>'status' NOT IN ('queued', 'running')`,
          ),
        ),
      })
      .returning({ id: eventCollections.id });
    return rows.length > 0;
  },
  async update(
    run: EventCollection,
    cooldown: number,
    expectedStatus?: EventCollection["status"],
  ) {
    await database()
      .update(eventCollections)
      .set({ details: run, expiresAt: expiration(cooldown) })
      .where(
        and(
          eq(eventCollections.id, "events"),
          sql`${eventCollections.details}->>'id' = ${run.id}`,
          expectedStatus
            ? sql`${eventCollections.details}->>'status' = ${expectedStatus}`
            : undefined,
        ),
      );
  },
  async start(id: string): Promise<EventCollection | null> {
    const rows = await database()
      .update(eventCollections)
      .set({
        details: sql`jsonb_set(${eventCollections.details}, '{status}', '"running"'::jsonb)`,
        expiresAt: expiration(5 * 60_000),
      })
      .where(
        and(
          eq(eventCollections.id, "events"),
          sql`${eventCollections.details}->>'id' = ${id}`,
          sql`${eventCollections.details}->>'status' = 'queued'`,
        ),
      )
      .returning({ details: eventCollections.details });
    return rows[0]?.details ?? null;
  },
};
export interface EventCollectionDependencies {
  repository: typeof collectionRepository;
  dispatch: (id: string, deploymentOrigin?: string) => Promise<void>;
  feeds: () => Promise<Feed[]>;
  fetch: (feed: Feed) => Promise<Article[]>;
  save: (events: QatarEvent[]) => Promise<void>;
}
const defaults: EventCollectionDependencies = {
  repository: collectionRepository,
  dispatch,
  feeds: enabledFeeds,
  fetch: fetchFeed,
  save: saveEvents,
};

// The database claim serializes visitors and provides a cooldown across function
// instances. It is isolated to this deployment's database branch, including previews.
export async function ensureEventCollection(
  deps = defaults,
  deploymentOrigin?: string,
): Promise<EventCollection> {
  const previous = await deps.repository.load();
  const run: EventCollection = {
    id: randomUUID(),
    status: "queued",
    startedAt: new Date().toISOString(),
    sources: previous?.sources ?? [],
  };
  if (!(await deps.repository.claim(run)))
    return (await deps.repository.load()) ?? run;
  try {
    await deps.dispatch(run.id, deploymentOrigin);
  } catch {
    run.status = "failed";
    run.finishedAt = new Date().toISOString();
    run.error =
      "Event collection could not start. It retries automatically shortly.";
    await deps.repository.update(run, 60_000, "queued");
    return (await deps.repository.load()) ?? run;
  }
  return run;
}
export async function collectEvents(id: string, deps = defaults) {
  const run = await deps.repository.start(id);
  if (!run) return;
  try {
    const feeds = (await deps.feeds()).filter(
      (feed) =>
        feed.id.startsWith("events-") && feed.configured && feed.enabled,
    );
    const prior = new Map(run.sources.map((source) => [source.id, source]));
    run.sources = [];
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(3, feeds.length) }, async () => {
        while (next < feeds.length) {
          const feed = feeds[next++];
          const { url: _url, ...source } = feed;
          const lastAttempt = new Date().toISOString();
          try {
            const events = (await deps.fetch(feed)).flatMap((article) =>
              article.event ? [article.event] : [],
            );
            await deps.save(events);
            run.sources.push({
              ...source,
              lastAttempt,
              lastSuccess: new Date().toISOString(),
              lastError: undefined,
              items: events.length,
            });
          } catch (error) {
            const message =
              error instanceof Error &&
              (/^HTTP \d+$/.test(error.message) ||
                [
                  eventMarkupError,
                  eventRecordsUnavailable,
                  incubatorUnverified,
                ].includes(error.message))
                ? error.message
                : "Source could not supply or save verified events. Previously collected events are preserved.";
            run.sources.push({
              ...source,
              lastAttempt,
              lastSuccess: prior.get(feed.id)?.lastSuccess,
              lastError: message,
            });
          }
        }
      }),
    );
    const successful = run.sources.filter((source) => !source.lastError).length;
    run.status = !feeds.length
      ? "success"
      : successful === feeds.length
        ? "success"
        : successful
          ? "partial"
          : "failed";
  } catch {
    run.status = "failed";
    run.error = "Event collection failed. It retries automatically shortly.";
  }
  run.finishedAt = new Date().toISOString();
  await deps.repository.update(
    run,
    run.status === "failed" ? 60_000 : 30 * 60_000,
  );
}

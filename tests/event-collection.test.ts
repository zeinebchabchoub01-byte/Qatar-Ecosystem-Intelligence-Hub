import { readFileSync } from "node:fs";
import { fetchFeed } from "../server/rss";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ensureEventCollection,
  collectEvents,
  type EventCollectionDependencies,
} from "../server/event-collection";
import { eventFeeds } from "../server/events";
import { parseStructuredEvents } from "../server/event-sources";
import type { EventCollection, QatarEvent } from "../src/types";

function fixture() {
  let state: EventCollection | null = null;
  let eligible = true;
  let dispatched = 0;
  let cooldown = 0;
  const stored = new Map<string, QatarEvent>();
  const feed = eventFeeds.find((f) => f.id === "events-allevents")!;
  const deps: EventCollectionDependencies = {
    repository: {
      load: async () => state && structuredClone(state),
      claim: async (run) => {
        if (!eligible) return false;
        eligible = false;
        state = structuredClone(run);
        return true;
      },
      update: async (run, ms, expected) => {
        if (state?.id === run.id && (!expected || state.status === expected)) {
          state = structuredClone(run);
          cooldown = ms;
        }
      },
      start: async (id) => {
        if (state?.id !== id || state.status !== "queued") return null;
        state.status = "running";
        return structuredClone(state);
      },
    },
    dispatch: async () => {
      dispatched++;
    },
    feeds: async () => [feed],
    fetch: async (source) =>
      parseStructuredEvents(
        `<script type="application/ld+json">${JSON.stringify({ "@type": "Event", name: "Startup founders networking", startDate: "2026-11-28", location: "Mondrian Doha", url: "https://allevents.in/doha/founders/123", description: "Meet founders and investors" })}</script>`,
        source,
      ).map((event) => ({
        id: event.id,
        title: event.title,
        description: event.description,
        event,
        publishedAt: null,
        collectedAt: event.collectedAt,
        url: event.url,
        publisher: event.organizer,
        language: "English",
        categories: [],
        sourceIds: [source.id],
        guids: [],
      })),
    save: async (events) => {
      events.forEach((event) => stored.set(event.id, event));
    },
  };
  return {
    deps,
    stored,
    feed,
    state: () => state,
    dispatched: () => dispatched,
    cooldown: () => cooldown,
    expire: () => {
      eligible = true;
    },
  };
}
test("opening Events queues one job across visitors, worker saves a verified upcoming event, polling respects cooldown", async () => {
  const f = fixture();
  await Promise.all(
    Array.from({ length: 10 }, () => ensureEventCollection(f.deps)),
  );
  assert.equal(f.dispatched(), 1);
  const id = f.state()!.id;
  await Promise.all([collectEvents(id, f.deps), collectEvents(id, f.deps)]);
  assert.equal(f.stored.size, 1);
  assert.equal([...f.stored.values()][0].startsOn, "2026-11-28");
  assert.equal(f.state()?.status, "success");
  assert.equal(f.state()?.sources[0].items, 1);
  assert.equal(f.cooldown(), 30 * 60_000);
  await ensureEventCollection(f.deps);
  assert.equal(f.dispatched(), 1);
  f.expire();
  const next = await ensureEventCollection(f.deps);
  await collectEvents(next.id, f.deps);
  assert.equal(f.stored.size, 1);
});
test("blocked source stays visible while another source saves events; unverified sources never run", async () => {
  const f = fixture();
  const blocked = eventFeeds.find((f) => f.id === "events-eventbrite")!;
  const unverified = eventFeeds.find((f) => f.id === "events-incubator")!;
  f.deps.feeds = async () => [f.feed, blocked, unverified];
  const fetch = f.deps.fetch;
  f.deps.fetch = async (feed) => {
    assert.notEqual(feed.id, unverified.id);
    if (feed.id === blocked.id) throw new Error("HTTP 403");
    return fetch(feed);
  };
  const run = await ensureEventCollection(f.deps);
  await collectEvents(run.id, f.deps);
  assert.equal(f.state()?.status, "partial");
  assert.equal(f.stored.size, 1);
  assert.equal(
    f.state()?.sources.find((s) => s.id === blocked.id)?.lastError,
    "HTTP 403",
  );
  assert.ok(!JSON.stringify(f.state()).includes("https://allevents.in"));
});
test("dispatch failure is reported and a worker that already started is not overwritten by dispatch timeout", async () => {
  const f = fixture();
  f.deps.dispatch = async () => {
    throw new Error("private runtime detail");
  };
  const failed = await ensureEventCollection(f.deps);
  assert.equal(failed.status, "failed");
  assert.equal(f.cooldown(), 60_000);
  assert.ok(!JSON.stringify(failed).includes("private runtime detail"));
  f.expire();
  f.deps.dispatch = async (id) => {
    await f.deps.repository.start(id);
    throw new Error("timeout");
  };
  const running = await ensureEventCollection(f.deps);
  assert.equal(running.status, "running");
});
test("expired or duplicate worker deliveries cannot save events or overwrite the current job", async () => {
  const f = fixture();
  const run = await ensureEventCollection(f.deps);
  await collectEvents("stale-job", f.deps);
  assert.equal(f.stored.size, 0);
  await collectEvents(run.id, f.deps);
  const fetch = f.deps.fetch;
  f.deps.fetch = async () => {
    throw new Error("must not run");
  };
  await collectEvents(run.id, f.deps);
  assert.equal(f.state()?.status, "success");
  f.deps.fetch = fetch;
});
test("failed collection preserves saved events and last successful source timestamp", async () => {
  const f = fixture();
  const first = await ensureEventCollection(f.deps);
  await collectEvents(first.id, f.deps);
  const success = f.state()!.sources[0].lastSuccess;
  f.expire();
  f.deps.save = async () => {
    throw new Error("database unavailable");
  };
  const second = await ensureEventCollection(f.deps);
  await collectEvents(second.id, f.deps);
  assert.equal(f.state()?.status, "failed");
  assert.equal(f.state()?.sources[0].lastSuccess, success);
  assert.equal(f.stored.size, 1);
});

test("event job forwards the serving deployment origin instead of relying on stale runtime settings", async () => {
  const f = fixture();
  let dispatchedOrigin: string | undefined;
  f.deps.dispatch = async (_id, origin) => {
    dispatchedOrigin = origin;
  };
  await ensureEventCollection(f.deps, "https://preview-request.example");
  assert.equal(dispatchedOrigin, "https://preview-request.example");
});

test("WSJ organizer HTML reaches the saved calendar through the queued event job", async () => {
  const f = fixture();
  const wsj = eventFeeds.find((feed) => feed.id === "events-wsj-qatar")!;
  const html = readFileSync(
    new URL("./fixtures/wsj-qatar.html", import.meta.url),
    "utf8",
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.equal(String(input), wsj.url);
    return new Response(html);
  };
  f.deps.feeds = async () => [wsj];
  f.deps.fetch = fetchFeed;
  try {
    const run = await ensureEventCollection(
      f.deps,
      "https://preview-request.example",
    );
    await collectEvents(run.id, f.deps);
    const [saved] = [...f.stored.values()];
    assert.equal(saved.sourceId, "events-wsj-qatar");
    assert.equal(saved.startsOn, "2026-11-30");
    assert.equal(saved.endsOn, "2026-12-02");
    assert.match(saved.location, /Waldorf Astoria/);
    assert.equal(f.state()?.sources[0].items, 1);
    assert.equal(f.state()?.status, "success");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

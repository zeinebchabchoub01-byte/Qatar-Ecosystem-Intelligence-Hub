import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { BlobsServer } from "@netlify/blobs/server";
import { setEnvironmentContext } from "@netlify/blobs";
import { parse, mergeArticles, canonical } from "../server/rss";
import { filterArticles, emptyFilters, csv } from "../src/data";
import { synchronize } from "../server/sync";
import { store, read, list } from "../server/storage";
import {
  builtInFeeds,
  enabledFeeds,
  inventory,
  sources,
} from "../server/sources";
import api from "../netlify/functions/api";
import scheduled from "../netlify/functions/daily-sync";
import deploySync from "../netlify/functions/deploy-sync.mjs";
import type { DeploySucceededEvent } from "@netlify/functions";
import { admin } from "../server/auth";
import { queueSync } from "../server/queue";
import type { Article, Feed } from "../src/types";
import { passesQualityChecks } from "../server/quality";
let directory: string;
let server: BlobsServer;
const feed = {
  id: "one",
  name: "Core",
  category: "Core players",
  description: "Original",
  query: "QSTP",
  language: "English",
  url: "https://www.google.com/alerts/feeds/123/456",
  enabled: true,
  configured: true,
} satisfies Feed;
const rss = `<rss version="2.0"><channel><title>Alerts</title><item><guid>shared</guid><title>Qatar &amp; growth</title><link>https://example.com/story?utm_source=alerts</link><description>&lt;b&gt;Investment&lt;/b&gt; news</description><pubDate>Thu, 12 Nov 2026 08:00:00 GMT</pubDate></item><item><title>Undated</title><link>https://example.com/undated</link></item><item><title>Unsafe</title><link>javascript:alert(1)</link></item></channel></rss>`;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "qatar-hub-test-"));
  server = new BlobsServer({ directory, logger: () => {} });
  const { port } = await server.start();
  setEnvironmentContext({
    siteID: "test-site",
    token: "test-token",
    edgeURL: `http://localhost:${port}`,
    uncachedEdgeURL: `http://localhost:${port}`,
  });
  process.env.RSS_FEEDS_JSON = JSON.stringify([feed]);
  process.env.ADMIN_PASSWORD = "test-only-password-with-at-least-32-characters";
  process.env.SESSION_SECRET =
    "test-only-session-secret-with-at-least-32-characters";
});
after(async () => {
  await server.stop();
  await rm(directory, { recursive: true, force: true });
});
test("worker loads and sanitizes feed content without CommonJS require(ESM) support", () => {
  execFileSync(
    process.execPath,
    [
      "--no-experimental-require-module",
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `import assert from "node:assert/strict";
     await import("./netlify/functions/sync-background.ts");
     const { text } = await import("./server/rss.ts");
     assert.equal(text('<b>Qatar &amp; growth</b><script>alert(1)</script>'), 'Qatar & growth');`,
    ],
    { cwd: new URL("..", import.meta.url), stdio: "pipe" },
  );
});
test("RSS parses actual dates, missing dates, sanitized descriptions and skips unsafe links", async () => {
  const a = await parse(rss, feed);
  assert.equal(a.length, 2);
  assert.equal(a[0].title, "Qatar & growth");
  assert.equal(a[0].description, "Investment news");
  assert.equal(a[0].publishedAt, "2026-11-12T08:00:00.000Z");
  assert.equal(a[1].publishedAt, null);
});
test("quality checks reject generic video entries but preserve meaningful videos and undated articles", async () => {
  for (const title of [
    "11 de novembro de 2026 - YouTube",
    "November 11, 2026 – YouTube",
    "2026-11-11",
    "YouTube",
  ]) {
    assert.equal(passesQualityChecks({ title, description: "" }), false);
  }
  const xml = `<rss version="2.0"><channel><title>Alerts</title>
    <item><title>11 de novembro de 2026 - YouTube</title><link>https://www.youtube.com/watch?v=generic</link><description>Share your videos with friends, family, and the world.</description></item>
    <item><title>Uninformative upload</title><link>https://www.youtube.com/watch?v=boilerplate</link><description>Share your videos with friends, family, and the world.</description></item>
    <item><title>Qatar startup investment panel - YouTube</title><link>https://www.youtube.com/watch?v=panel</link><description>Founders discuss investment in Qatar.</description></item>
    <item><title>قطر تدعم الشركات الناشئة</title><link>https://example.com/arabic</link></item>
    </channel></rss>`;
  const articles = await parse(xml, feed);
  assert.equal(articles.length, 2);
  assert.match(articles[0].title, /investment panel/);
  assert.equal(articles[1].language, "Arabic");
});
test("snapshot hides previously collected low-quality entries without deleting stored records", async () => {
  const id = "quality-check-test";
  const bad = {
    ...(await parse(rss, feed))[0],
    id,
    title: "11 de novembro de 2026 - YouTube",
  };
  await store().setJSON(`article/${id}`, bad);
  try {
    const response = await api(
      new Request("http://localhost/.netlify/functions/api"),
      {},
    );
    assert.equal(response.status, 200);
    const snapshot = await response.json();
    assert.ok(!snapshot.articles.some((a: Article) => a.id === id));
    assert.ok(await read(`article/${id}`, null));
  } finally {
    await store().delete(`article/${id}`);
  }
});
test("Atom handles Arabic and unwraps Google redirect preserving original URL", async () => {
  const a = await parse(
    `<feed xmlns="http://www.w3.org/2005/Atom"><title>Alerts</title><entry><id>ar1</id><title>قطر تدعم الشركات الناشئة</title><link href="https://www.google.com/url?url=https%3A%2F%2Fexample.com%2Far&amp;ct=ga"/><content type="html">أخبار الاستثمار</content><published>2026-11-12T01:00:00Z</published></entry></feed>`,
    feed,
  );
  assert.equal(a[0].language, "Arabic");
  assert.equal(a[0].url, "https://example.com/ar");
});
test("deduplicates GUID and normalized URL while retaining sources and categories", async () => {
  const a = (await parse(rss, feed))[0];
  const b = {
    ...a,
    id: "second",
    guids: ["different"],
    url: "https://example.com/story?utm_source=other",
    sourceIds: ["two"],
    categories: ["Capital"],
  };
  const result = mergeArticles(
    [],
    [a, b, { ...b, guids: ["shared"], url: "https://example.com/changed" }],
  );
  assert.equal(result.added, 1);
  assert.deepEqual(result.articles[0].categories, ["Core players", "Capital"]);
  assert.deepEqual(result.articles[0].sourceIds, ["one", "two"]);
  assert.equal(canonical(b.url), "https://example.com/story");
});
test("combined filters use Qatar dates and exports escape formula injection", async () => {
  const a = await parse(rss, feed);
  assert.equal(
    filterArticles(a, {
      ...emptyFilters,
      keyword: "growth",
      category: "Core players",
      language: "English",
      source: "one",
      from: "2026-11-12",
      to: "2026-11-12",
    }).length,
    1,
  );
  assert.equal(
    filterArticles(a, { ...emptyFilters, from: "2026-11-13" }).length,
    0,
  );
  assert.ok(csv([{ ...a[0], title: "=1+1" }]).includes('"\'=1+1"'));
});
test("real Blobs emulator persists across store instances, worker preserves history and bookmarks", async () => {
  await store().setJSON("bookmark/test", { savedAt: "today" });
  const first = await synchronize(async (f) => parse(rss, f));
  assert.equal("status" in first && first.status, "success");
  assert.equal((await list<Article>("article/")).length, 2);
  assert.deepEqual(await read("bookmark/test", null), { savedAt: "today" });
  const second = await synchronize(async (f) => parse(rss, f));
  assert.equal("added" in second && second.added, 0);
  assert.equal((await list<Article>("article/")).length, 2);
});
test("failed feeds do not erase history or last successful sync; disabled feeds excluded", async () => {
  const last = await read("last-success", null);
  const failed = await synchronize(async () => {
    throw new Error("timeout");
  });
  assert.equal("status" in failed && failed.status, "failed");
  assert.equal(await read("last-success", null), last);
  assert.equal((await list<Article>("article/")).length, 2);
  const status = (await sources()).find((s) => s.id === "one");
  assert.ok(status?.lastError);
  await store().setJSON("enabled/one", false);
  for (const f of builtInFeeds) await store().setJSON(`enabled/${f.id}`, false);
  const run = await synchronize(async () => {
    throw new Error("should not execute");
  });
  assert.equal(
    "error" in run && run.error,
    "No enabled, configured feeds. Import your feed inventory in Sources.",
  );
  await store().setJSON("enabled/one", true);
  for (const f of builtInFeeds) await store().delete(`enabled/${f.id}`);
});
test("lease rejects overlapping syncs", async () => {
  await store().setJSON("sync-lock", { expires: Date.now() + 60000 });
  assert.deepEqual(await synchronize(), { busy: true });
  await store().delete("sync-lock");
});
test("API rejects unauthenticated and cross-origin mutations; login is HttpOnly; snapshot hides URLs", async () => {
  const req = (
    action: string,
    body: unknown,
    headers: Record<string, string> = {},
  ) =>
    new Request(`http://localhost/.netlify/functions/api?action=${action}`, {
      method: "POST",
      headers: {
        origin: "http://localhost",
        "content-type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    });
  assert.equal(
    (await api(req("source", { id: "one", enabled: false }), {})).status,
    401,
  );
  assert.equal(
    (
      await api(
        req(
          "login",
          { password: process.env.ADMIN_PASSWORD },
          { origin: "https://evil.example" },
        ),
        {},
      )
    ).status,
    403,
  );
  const response = await api(
    req("login", { password: process.env.ADMIN_PASSWORD }),
    {},
  );
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie")!;
  assert.ok(cookie.includes("HttpOnly"));
  assert.ok(admin(new Request("http://localhost", { headers: { cookie } })));
  const toggle = await api(
    req("source", { id: "one", enabled: false }, { cookie }),
    {},
  );
  assert.equal(toggle.status, 200);
  await store().setJSON("enabled/one", true);
  for (const f of builtInFeeds) await store().delete(`enabled/${f.id}`);
  const snapshot = await api(
    new Request("http://localhost/.netlify/functions/api"),
    {},
  );
  const json = await snapshot.text();
  assert.ok(!json.includes("/alerts/feeds/"));
  assert.ok(!json.includes(process.env.SESSION_SECRET!));
});
test("scheduled function records dispatch failures, never claims success", async () => {
  delete process.env.APP_URL;
  await assert.rejects(() => scheduled());
  const run = await read<any>("sync-current", null);
  assert.equal(run.status, "failed");
  assert.ok(run.error.includes("Configure"));
});
test("inventory refuses non-Google backend fetch URLs", () => {
  process.env.RSS_FEEDS_JSON = JSON.stringify([
    { ...feed, url: "https://localhost/private" },
  ]);
  assert.throws(() => inventory());
  process.env.RSS_FEEDS_JSON = JSON.stringify([feed]);
});

test("authenticated inventory import persists privately and rejects unsafe URLs", async () => {
  const req = (feeds: unknown, cookie = "") =>
    new Request("http://localhost/.netlify/functions/api?action=import", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        "content-type": "application/json",
        cookie,
      },
      body: JSON.stringify({ feeds }),
    });
  assert.equal((await api(req([feed]), {})).status, 401);
  const { cookie } = await import("../server/auth");
  const session = cookie(new Request("http://localhost"));
  assert.equal(
    (
      await api(
        req([{ ...feed, url: "http://127.0.0.1/private" }], session),
        {},
      )
    ).status,
    400,
  );
  assert.equal((await api(req([feed], session), {})).status, 200);
  delete process.env.RSS_FEEDS_JSON;
  assert.equal((await sources())[0].configured, true);
  const result = await api(
    new Request("http://localhost/.netlify/functions/api"),
    {},
  );
  assert.ok(!(await result.text()).includes("/alerts/feeds/"));
});
test("mixed feed outcomes produce partial status and preserve successful content", async () => {
  await store().setJSON("feed-inventory", [
    feed,
    {
      ...feed,
      id: "two",
      url: "https://www.google.com/alerts/feeds/123/789",
      category: "Capital",
    },
  ]);
  const last = await read("last-success", null);
  const run = await synchronize(async (f) => {
    if (f.id === "two") throw new Error("network");
    return parse(rss, f);
  });
  assert.equal("status" in run && run.status, "partial");
  assert.equal("successful" in run && run.successful, 1 + builtInFeeds.length);
  assert.equal("failed" in run && run.failed, 1);
  assert.equal(await read("last-success", null), last);
  await store().setJSON("feed-inventory", [feed]);
});

test("published production deploy queues sync, excludes previews, suppresses repeats, and allows retry after timeout", async () => {
  const originalFetch = globalThis.fetch;
  const originalURL = process.env.APP_URL;
  const originalSecret = process.env.SYNC_SECRET;
  const previous = await read("sync-current", null);
  let calls = 0;
  process.env.APP_URL = "https://example.com";
  process.env.SYNC_SECRET =
    "test-only-worker-secret-with-at-least-32-characters";
  globalThis.fetch = async (input, init) => {
    if (
      String(input) === "https://example.com/.netlify/functions/sync-background"
    ) {
      calls++;
      return new Response(null, { status: 202 });
    }
    return originalFetch(input, init);
  };
  try {
    await store().delete("sync-current");
    const event = (context: string, publishedAt: string | null) =>
      ({ deploy: { context, publishedAt } }) as DeploySucceededEvent;
    await deploySync.deploySucceeded(event("deploy-preview", new Date().toISOString()));
    await deploySync.deploySucceeded(event("branch-deploy", new Date().toISOString()));
    await deploySync.deploySucceeded(event("production", null));
    assert.equal(calls, 0);
    assert.equal(await read("sync-current", null), null);
    await deploySync.deploySucceeded(event("production", new Date().toISOString()));
    const queued = await read<any>("sync-current", null);
    assert.equal(queued.status, "queued");
    await queueSync();
    assert.equal(calls, 1);
    await store().setJSON("sync-current", {
      ...queued,
      startedAt: new Date(Date.now() - 3 * 60_000).toISOString(),
    });
    await queueSync();
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalURL === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = originalURL;
    if (originalSecret === undefined) delete process.env.SYNC_SECRET;
    else process.env.SYNC_SECRET = originalSecret;
    await store().setJSON("sync-current", previous);
  }
});

test("inventory remains imported when automatic dispatch fails, with a visible failure status", async () => {
  const { cookie } = await import("../server/auth");
  const response = await api(
    new Request("http://localhost/.netlify/functions/api?action=import", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        "content-type": "application/json",
        cookie: cookie(new Request("http://localhost")),
      },
      body: JSON.stringify({ feeds: [feed] }),
    }),
    {},
  );
  assert.equal(response.status, 200);
  assert.match((await response.json()).message, /feeds imported.*Configure/);
  assert.equal((await sources())[0].configured, true);
  assert.equal((await read<any>("sync-current", null)).status, "failed");
});

test("Falak feeds stay configured without inventory and respect source toggles", async () => {
  const saved = await read<Feed[] | null>("feed-inventory", null);
  const raw = process.env.RSS_FEEDS_JSON;
  try {
    await store().delete("feed-inventory");
    delete process.env.RSS_FEEDS_JSON;
    const all = await sources();
    for (const feed of builtInFeeds) {
      assert.equal(all.find((s) => s.id === feed.id)?.configured, true);
      assert.ok((await enabledFeeds()).some((f) => f.id === feed.id));
    }
    await store().setJSON("enabled/falak-news", false);
    assert.ok(!(await enabledFeeds()).some((f) => f.id === "falak-news"));
    await store().setJSON("feed-inventory", [feed]);
    assert.ok(
      (await enabledFeeds()).some((f) => f.id === "falak-knowledge-hub"),
    );
    process.env.RSS_FEEDS_JSON = JSON.stringify([
      { ...feed, id: "falak-news" },
    ]);
    assert.throws(() => inventory());
  } finally {
    await store().delete("enabled/falak-news");
    if (saved) await store().setJSON("feed-inventory", saved);
    else await store().delete("feed-inventory");
    if (raw === undefined) delete process.env.RSS_FEEDS_JSON;
    else process.env.RSS_FEEDS_JSON = raw;
  }
});

test("removed directory entries disappear immediately and synchronization deletes their content and bookmarks", async () => {
  const [base] = await parse(rss, feed);
  const directory = { ...base, id: "d".repeat(64), sourceIds: ["falak-startups"], categories: ["Startups’ Directory"] };
  const news = { ...base, id: "e".repeat(64), sourceIds: ["falak-news"], categories: ["The Newsroom"] };
  await store().setJSON(`article/${directory.id}`, directory);
  await store().setJSON(`bookmark/${directory.id}`, { savedAt: new Date().toISOString() });
  await store().setJSON(`article/${news.id}`, news);
  await store().setJSON("status/falak-startups", { items: 71 });
  const response = await api(new Request("https://hub.test/api"), {});
  const snapshot = await response.json();
  assert.ok(!snapshot.articles.some((a: Article) => a.id === directory.id));
  assert.ok(!snapshot.bookmarks.includes(directory.id));
  assert.deepEqual(snapshot.articles.find((a: Article) => a.id === news.id).categories, ["falaq/The Newsroom"]);
  assert.ok(!snapshot.sources.some((s: Feed) => s.id === "falak-startups"));
  assert.ok(snapshot.sources.filter((s: Feed) => s.id.startsWith("falak-")).every((s: Feed) => s.category.startsWith("falaq/") && s.name.startsWith("falaq/")));
  await synchronize(async () => []);
  assert.equal(await read(`article/${directory.id}`, null), null);
  assert.equal(await read(`bookmark/${directory.id}`, null), null);
  assert.equal(await read("status/falak-startups", null), null);
  assert.deepEqual((await read<Article>(`article/${news.id}`, news)).categories, ["falaq/The Newsroom"]);
});

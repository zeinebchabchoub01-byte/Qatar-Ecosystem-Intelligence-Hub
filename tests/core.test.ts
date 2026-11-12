import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BlobsServer } from "@netlify/blobs/server";
import { setEnvironmentContext } from "@netlify/blobs";
import { parse, mergeArticles, canonical } from "../server/rss";
import { filterArticles, emptyFilters, csv } from "../src/data";
import { synchronize } from "../server/sync";
import { store, read, list } from "../server/storage";
import { inventory, sources } from "../server/sources";
import api from "../netlify/functions/api";
import scheduled from "../netlify/functions/daily-sync";
import { admin } from "../server/auth";
import type { Article, Feed } from "../src/types";
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
test("RSS parses actual dates, missing dates, sanitized descriptions and skips unsafe links", async () => {
  const a = await parse(rss, feed);
  assert.equal(a.length, 2);
  assert.equal(a[0].title, "Qatar & growth");
  assert.equal(a[0].description, "Investment news");
  assert.equal(a[0].publishedAt, "2026-11-12T08:00:00.000Z");
  assert.equal(a[1].publishedAt, null);
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
  const run = await synchronize(async () => {
    throw new Error("should not execute");
  });
  assert.equal(
    "error" in run && run.error,
    "No enabled, configured feeds. Import your feed inventory in Sources.",
  );
  await store().setJSON("enabled/one", true);
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
  assert.equal("successful" in run && run.successful, 1);
  assert.equal("failed" in run && run.failed, 1);
  assert.equal(await read("last-success", null), last);
  await store().setJSON("feed-inventory", [feed]);
});

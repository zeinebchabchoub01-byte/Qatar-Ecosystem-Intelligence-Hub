import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eventFeeds, eventMarkupError } from "../server/events";
import { parseWsjQatar, parseStructuredEvents } from "../server/event-sources";
import { fetchFeed } from "../server/rss";
const feed = eventFeeds.find((f) => f.id === "events-wsj-qatar")!;
const html = readFileSync(
  new URL("./fixtures/wsj-qatar.html", import.meta.url),
  "utf8",
);

test("official WSJ page without Event JSON-LD yields the full conference dates and main venue", () => {
  assert.equal(feed.configured, true);
  assert.equal(feed.enabled, true);
  assert.equal(parseStructuredEvents(html, feed).length, 0);
  const [event] = parseWsjQatar(html, feed);
  assert.equal(event.title, "WSJ TECH: QATAR");
  assert.equal(event.startsOn, "2026-11-30");
  assert.equal(event.endsOn, "2026-12-02");
  assert.equal(event.location, "Waldorf Astoria Doha Lusail, Doha, Qatar");
  assert.equal(event.organizer, "WSJ Tech");
  assert.equal(event.url, "https://wsjtechevent.wsj.com/qatar/");
  assert.match(event.description, /investors and innovators/);
});
test("WSJ parsing ignores article publication dates and refuses malformed or missing event dates", () => {
  for (const date of [
    "",
    "Nov 31-Dec 2, 2026",
    "Nov 30-Nov 29, 2026",
    "Nov 30-Dec 2",
    "Foo 30-Bar 2, 2026",
  ]) {
    assert.throws(
      () => parseWsjQatar(html.replace("Nov 30-Dec 2, 2026", date), feed),
      { message: eventMarkupError },
    );
  }
  assert.throws(
    () => parseWsjQatar(html.replace('id="venue"', 'id="removed"'), feed),
    { message: eventMarkupError },
  );
  assert.throws(
    () =>
      parseWsjQatar(
        html
          .replaceAll("Doha, Qatar", "London, UK")
          .replaceAll("Waldorf Astoria Doha Lusail", "London hotel"),
        feed,
      ),
    { message: eventMarkupError },
  );
});
test("WSJ live-shaped HTML flows through the same event collection feed contract", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.equal(String(input), feed.url);
    return new Response(html);
  };
  try {
    const [article] = await fetchFeed(feed);
    assert.equal(article.event?.startsOn, "2026-11-30");
    assert.equal(article.event?.endsOn, "2026-12-02");
    assert.equal(article.event?.sourceId, feed.id);
    assert.equal(article.publishedAt, null);
    assert.deepEqual(article.sourceIds, [feed.id]);
  } finally {
    globalThis.fetch = original;
  }
});

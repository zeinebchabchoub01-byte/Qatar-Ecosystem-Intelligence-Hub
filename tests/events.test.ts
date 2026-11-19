import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStartupEvents, eventMarkupError } from "../server/events";
import { fetchFeed } from "../server/rss";
import { eventFeeds } from "../server/events";

const card = (attributes = "", date = "23 Feb,2025 - 26 Feb,2025") =>
  `<div class="card-event mb-4"><button id="web-summit-qatar-2025" data-title="Web Summit Qatar 2025" data-description="&lt;p&gt;Startup founders and investors in Qatar.&lt;/p&gt;" data-popup-title="${date}" data-organizer="Web Summit" data-location="Doha Exhibition and Convention Center (DECC)" data-type="In-Person" ${attributes}></button></div>`;
test("event collection uses real event dates, cleans text and deduplicates repeated cards", () => {
  const [event, ...rest] = parseStartupEvents(card() + card());
  assert.equal(rest.length, 0);
  assert.equal(event.startsOn, "2025-02-23");
  assert.equal(event.endsOn, "2025-02-26");
  assert.equal(event.description, "Startup founders and investors in Qatar.");
  assert.equal(event.organizer, "Web Summit");
  assert.equal(
    event.url,
    "https://startupqatar.qa/en/events#web-summit-qatar-2025",
  );
  assert.notEqual(event.collectedAt.slice(0, 10), event.startsOn);
});
test("events exclude online listings, invalid dates and unsafe destination links", () => {
  assert.equal(
    parseStartupEvents(
      card().replace('data-type="In-Person"', 'data-type="Online"'),
    ).length,
    0,
  );
  assert.equal(parseStartupEvents(card("", "31 Feb,2025")).length, 0);
  assert.equal(
    parseStartupEvents(card("", "26 Feb,2025 - 23 Feb,2025")).length,
    0,
  );
  assert.equal(
    parseStartupEvents(
      card().replace(
        "Doha Exhibition and Convention Center (DECC)",
        "Lisbon, Portugal",
      ),
    ).length,
    0,
  );
  const [event] = parseStartupEvents(
    card('data-external-link="javascript:alert(1)"'),
  );
  assert.ok(event.url.startsWith("https://startupqatar.qa/"));
  assert.throws(() => parseStartupEvents("<main>Unavailable</main>"), {
    message: eventMarkupError,
  });
});
test("event source uses bounded HTML collection and keeps events out of article publication dates", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(card());
  try {
    const [article] = await fetchFeed(eventFeeds[0]);
    assert.equal(article.publishedAt, null);
    assert.equal(article.event?.startsOn, "2025-02-23");
    globalThis.fetch = async () => new Response(null, { status: 503 });
    await assert.rejects(fetchFeed(eventFeeds[0]), /HTTP 503/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

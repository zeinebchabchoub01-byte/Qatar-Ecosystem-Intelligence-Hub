import { test } from "node:test";
import assert from "node:assert/strict";
import { eventFeeds } from "../server/events";
import {
  parseStructuredEvents,
  eventDetailLinks,
  collectEventPage,
  eventRecordsUnavailable,
  incubatorUnverified,
} from "../server/event-sources";
import { fetchFeed } from "../server/rss";
const feed = eventFeeds.find((f) => f.id === "events-allevents")!;
const raw = {
  "@type": "BusinessEvent",
  name: "Founders &amp; Investors Networking",
  description: "<p>Meet startup founders.</p>",
  startDate: "2026-11-28T19:00:00+03:00",
  endDate: "2026-11-28T22:00:00+03:00",
  url: "https://allevents.in/doha/founders/123",
  location: {
    "@type": "Place",
    name: "Mondrian Doha",
    address: { addressLocality: "Doha", addressCountry: "QA" },
  },
  organizer: { name: "Startup community" },
};
const markup = (value: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(value)}</script>`;
const card = (url = raw.url) =>
  `<li class="event-card" data-name="Founder networking" data-link="${url}"><h3>Founder networking</h3></li>`;
test("structured event graphs preserve source dates, sanitize text and deduplicate", () => {
  const events = parseStructuredEvents(
    markup({
      "@graph": [
        raw,
        { "@type": "ItemList", itemListElement: [{ item: raw }] },
      ],
    }),
    feed,
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].startsOn, "2026-11-28");
  assert.equal(events[0].description, "Meet startup founders.");
  assert.equal(events[0].title, "Founders & Investors Networking");
  assert.equal(events[0].organizer, "Startup community");
  assert.equal(events[0].sourceId, feed.id);
});
test("structured events reject invalid dates, foreign venues, online, canceled and unrelated listings", () => {
  const invalid = [
    { startDate: "2026-02-30" },
    { endDate: "2026-11-27" },
    { startDate: "28 November" },
    { eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode" },
    { eventStatus: "https://schema.org/EventCancelled" },
    { eventStatus: "https://schema.org/EventPostponed" },
    {
      location: {
        name: "Qatar investor meetup in London",
        address: { addressCountry: "GB" },
      },
    },
    { location: "Virtual, Doha" },
    { url: "javascript:alert(1)" },
    { name: "Music concert", description: "Live performances" },
  ];
  for (const change of invalid)
    assert.equal(
      parseStructuredEvents(markup({ ...raw, ...change }), feed).length,
      0,
      JSON.stringify(change),
    );
  assert.equal(
    parseStructuredEvents(
      '<script type="application/ld+json">broken</script>' + markup(raw),
      feed,
    ).length,
    1,
  );
});
test("detail discovery deduplicates, bounds requests, and rejects external or unrelated links", () => {
  const html =
    card() +
    card() +
    card("https://evil.example/doha/founders/123") +
    card("https://allevents.in@evil.example/doha/founders/123") +
    card().replaceAll("Founder networking", "Music concert");
  assert.deepEqual(eventDetailLinks(html, feed), [raw.url]);
  assert.equal(
    eventDetailLinks(
      Array.from({ length: 30 }, (_, i) =>
        card(`https://allevents.in/doha/founders/${i}`),
      ).join(""),
      feed,
    ).length,
    12,
  );
});
test("collection follows listing cards and persists events through the existing feed contract", async () => {
  const original = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return new Response(String(input) === feed.url ? card() : markup(raw));
  };
  try {
    const [article] = await fetchFeed(feed);
    assert.equal(article.event?.startsOn, "2026-11-28");
    assert.equal(article.publishedAt, null);
    assert.deepEqual(requests, [feed.url, raw.url]);
    globalThis.fetch = async () => new Response(null, { status: 403 });
    await assert.rejects(collectEventPage(card(), feed), {
      message: eventRecordsUnavailable,
    });
  } finally {
    globalThis.fetch = original;
  }
});
test("empty Eventbrite HTML and relative-date incubator calendars report limitations", async () => {
  const eventbrite = eventFeeds.find((f) => f.id === "events-eventbrite")!;
  await assert.rejects(collectEventPage(markup({}), eventbrite), {
    message: eventRecordsUnavailable,
  });
  const incubator = eventFeeds.find((f) => f.id === "events-incubator")!;
  assert.equal(incubator.enabled, false);
  assert.equal(incubator.configured, false);
  await assert.rejects(collectEventPage("<div id='root'></div>", incubator), {
    message: incubatorUnverified,
  });
});
test("Eventbrite JSON-LD and embedded result data share geographic and relevance checks", () => {
  const eventbrite = eventFeeds.find((f) => f.id === "events-eventbrite")!;
  assert.equal(parseStructuredEvents(markup(raw), eventbrite).length, 1);
  const data = {
    search_data: {
      events: {
        results: [
          {
            name: raw.name,
            summary: raw.description,
            start_date: raw.startDate,
            end_date: raw.endDate,
            url: raw.url,
            primary_venue: raw.location,
            primary_organizer: raw.organizer,
          },
          { name: raw.name, is_online_event: true },
        ],
      },
    },
  };
  assert.equal(
    parseStructuredEvents(
      `<script>window.__SERVER_DATA__ = ${JSON.stringify(data)};\n</script>`,
      eventbrite,
    ).length,
    1,
  );
});

test("recognized AllEvents empty categories succeed without disguising inaccessible pages", async () => {
  assert.deepEqual(
    await collectEventPage(
      '<span class="empty_sub_text">Oops! No active events here at the moment</span>',
      feed,
    ),
    [],
  );
  assert.deepEqual(
    await collectEventPage(
      card().replaceAll("Founder networking", "Music concert"),
      feed,
    ),
    [],
  );
  await assert.rejects(collectEventPage("<main>Access denied</main>", feed), {
    message: eventRecordsUnavailable,
  });
});

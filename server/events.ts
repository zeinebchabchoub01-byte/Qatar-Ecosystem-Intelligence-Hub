import { parseDocument } from "htmlparser2";
import { findAll, textContent } from "domutils";
import { createHash } from "node:crypto";
import { decodeHTML } from "entities";
import sanitize from "sanitize-html";
import type { Feed, QatarEvent } from "../src/types";

export const eventFeeds: Feed[] = [
  {
    id: "events-startup-qatar",
    name: "Startup Qatar events",
    category: "Entrepreneurship events",
    query: "Qatar entrepreneurship events",
    language: "English + Arabic",
    description:
      "Automatic collection from Startup Qatar’s public ecosystem event calendar. Dates and venues are supplied by the source.",
    url: "https://startupqatar.qa/en/events",
    enabled: true,
    configured: true,
  },
  ...[
    [
      "wsj-qatar",
      "WSJ Tech: Qatar",
      "https://wsjtechevent.wsj.com/qatar/",
      "Official WSJ Tech Qatar event page. Collects the published conference dates, venue and overview directly from the organizer.",
    ],
    [
      "allevents",
      "AllEvents Doha",
      "https://allevents.in/doha-qa/all",
      "Public Doha listings, filtered for entrepreneurship, founders, investors, business networking and innovation.",
    ],
    [
      "allevents-business",
      "AllEvents Doha business",
      "https://allevents.in/doha-qa/business",
      "Business listings with dates and venues verified on individual event pages.",
    ],
    [
      "allevents-startups",
      "AllEvents Doha startups",
      "https://allevents.in/doha-qa/startups",
      "Startup listings with dates and venues verified on individual event pages.",
    ],
    [
      "allevents-entrepreneurship",
      "AllEvents Doha entrepreneurship",
      "https://allevents.in/doha-qa/entrepreneurship",
      "Entrepreneurship listings with dates and venues verified on individual event pages.",
    ],
    [
      "eventbrite",
      "Eventbrite Qatar",
      "https://www.eventbrite.com/d/qatar--doha/qatar/",
      "Public Qatar listings. Reports an unavailable source when Eventbrite supplies no readable event records.",
    ],
    [
      "eventbrite-business",
      "Eventbrite Doha business",
      "https://www.eventbrite.com/d/qatar--doha/business--events/",
      "Public business listings filtered for physical Qatar entrepreneurship events.",
    ],
    [
      "qstp",
      "Qatar Science & Technology Park events",
      "https://www.qstp.org.qa/",
      "Official QSTP event links. Individual pages may block automated access; failures are reported without removing saved events.",
    ],
    [
      "incubator",
      "Qatar Incubator calendar (unverified)",
      "https://incubator.qa/",
      "Checked calendar: event dates are generated relative to the viewing day, rather than fixed organizer dates. Automatic collection is unavailable until verifiable listings are published.",
    ],
  ].map(([id, name, url, description]): Feed => ({
    id: `events-${id}`,
    name,
    url,
    description,
    category: "Entrepreneurship events",
    query: "Qatar entrepreneurship events",
    language: "English + Arabic",
    enabled: id !== "incubator",
    configured: id !== "incubator",
  })),
];
export const clean = (value = "") =>
  decodeHTML(
    sanitize(decodeHTML(value), { allowedTags: [], allowedAttributes: {} }),
  )
    .replace(/\s+/g, " ")
    .trim();
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const months = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
function day(value: string) {
  const match = value.trim().match(/^(\d{1,2})\s+([A-Za-z]{3}),?\s*(\d{4})$/);
  if (!match) return null;
  const month = months.indexOf(match[2].toLowerCase()) + 1;
  if (!month) return null;
  const iso = `${match[3]}-${String(month).padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === iso
    ? iso
    : null;
}
export const eventMarkupError =
  "Event listings could not be read. The source page may have changed; previously collected events are preserved.";
export function parseStartupEvents(
  html: string,
  feed = eventFeeds[0],
  now = new Date().toISOString(),
): QatarEvent[] {
  const document = parseDocument(html);
  const cards = findAll(
    (n) => (n.attribs.class || "").split(/\s+/).includes("card-event"),
    document.children,
  );
  if (!cards.length) throw new Error(eventMarkupError);
  const items = new Map<string, QatarEvent>();
  for (const card of cards) {
    const node = findAll(
      (n) => n.name === "button" && !!n.attribs["data-title"],
      card.children,
    )[0];
    if (!node) continue;
    const a = node.attribs;
    const title = clean(a["data-title"] || textContent(node));
    const range = (a["data-popup-title"] || "").split(/\s+[-–]\s+/);
    const startsOn = day(range[0] || "");
    const endsOn = day(range[1] || range[0] || "");
    const location = clean(a["data-location"]);
    const description = clean(a["data-description"]);
    // Only physical Qatar events: the national startup calendar also lists online/global content.
    if (
      !title ||
      !startsOn ||
      !endsOn ||
      endsOn < startsOn ||
      /online|virtual/i.test(`${location} ${a["data-type"] || ""}`) ||
      !location
    )
      continue;
    if (!/qatar|doha|lusail|الدوحة|قطر|\bdecc\b|\bqncc\b/i.test(location))
      continue;
    if (
      !/startup|entrepreneur|founder|invest|innovation|innovator|business|sme|summit|ريادة|أعمال|ناشئة/i.test(
        `${title} ${description}`,
      )
    )
      continue;
    let url = `${feed.url}#${encodeURIComponent(a.id || "")}`;
    try {
      const external = new URL(a["data-external-link"]);
      if (external.protocol === "https:") url = external.href;
    } catch {
      /* A listing anchor is the source link when no event website is provided. */
    }
    const id = digest(
      `${title.toLowerCase()}|${startsOn}|${location.toLowerCase()}`,
    );
    items.set(id, {
      id,
      title,
      description,
      startsOn,
      endsOn,
      location,
      organizer: clean(a["data-organizer"]) || "Not specified",
      url,
      sourceId: feed.id,
      sourceName: feed.name,
      sourceUrl: feed.url,
      collectedAt: now,
    });
  }
  return [...items.values()];
}

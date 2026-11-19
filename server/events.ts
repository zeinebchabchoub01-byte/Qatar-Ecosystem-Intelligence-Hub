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
];
const clean = (value = "") =>
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

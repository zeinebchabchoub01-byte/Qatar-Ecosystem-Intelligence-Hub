import { parseDocument } from "htmlparser2";
import { findAll, textContent } from "domutils";
import { createHash } from "node:crypto";
import type { Feed, QatarEvent } from "../src/types";
import { clean, eventMarkupError } from "./events";

export const eventRecordsUnavailable =
  "No verifiable event records were supplied by this source. Listings may require JavaScript or block automated access; previously collected events are preserved.";
export const incubatorUnverified =
  "This calendar generates relative dates rather than fixed organizer dates. Events cannot be verified and are not imported.";
const relevant = (value: string) =>
  /startup|start-up|entrepreneur|founder|investor|venture|fintech|innovation|innovator|business|\bsme\b|pitch|ريادة|أعمال|ناشئة/i.test(
    value,
  );
const inQatar = (value: string) =>
  /qatar|doha|lusail|الدوحة|قطر|\bdecc\b|\bqncc\b/i.test(value);
const classes = (value = "") => value.split(/\s+/);
function isoDay(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})(?:$|T)/);
  if (!match) return null;
  const date = new Date(`${match[1]}T00:00:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== match[1]
  )
    return null;
  if (value.includes("T") && !Number.isFinite(Date.parse(value))) return null;
  return match[1];
}
function safeUrl(value: unknown, base: string) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value, base);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
function eventRecord(raw: any, feed: Feed, now: string): QatarEvent | null {
  const title = clean(typeof raw.name === "string" ? raw.name : "");
  const description = clean(
    typeof raw.description === "string" ? raw.description : "",
  );
  const startsOn = isoDay(raw.startDate);
  const endsOn = raw.endDate ? isoDay(raw.endDate) : startsOn;
  const place = Array.isArray(raw.location) ? raw.location[0] : raw.location;
  const address = typeof place?.address === "object" ? place.address : {};
  const country =
    typeof address.addressCountry === "object"
      ? address.addressCountry.name
      : address.addressCountry;
  const location = clean(
    typeof place === "string"
      ? place
      : [
          place?.name,
          typeof place?.address === "string"
            ? place.address
            : address.streetAddress,
          address.addressLocality,
          country,
        ]
          .filter((v) => typeof v === "string")
          .join(", "),
  );
  const url = safeUrl(raw.url || raw["@id"], feed.url);
  if (
    !title ||
    !startsOn ||
    !endsOn ||
    endsOn < startsOn ||
    !location ||
    !url ||
    !relevant(`${title} ${description}`)
  )
    return null;
  if (
    /OnlineEventAttendanceMode|VirtualLocation/.test(
      `${raw.eventAttendanceMode} ${place?.["@type"]}`,
    ) ||
    /\bonline\b|\bvirtual\b/i.test(location) ||
    /EventCancelled|EventPostponed/.test(raw.eventStatus || "")
  )
    return null;
  if (country && !/^(QA|QAT|Qatar|قطر)$/i.test(country)) return null;
  if (!inQatar(location) && !/^QA$/i.test(country || "")) return null;
  const organizer = Array.isArray(raw.organizer)
    ? raw.organizer[0]
    : raw.organizer;
  return {
    id: createHash("sha256")
      .update(`${title.toLowerCase()}|${startsOn}|${location.toLowerCase()}`)
      .digest("hex"),
    title,
    description,
    startsOn,
    endsOn,
    location,
    url,
    organizer:
      clean(
        typeof organizer === "string" ? organizer : organizer?.name || "",
      ) || "Not specified",
    sourceId: feed.id,
    sourceName: feed.name,
    sourceUrl: feed.url,
    collectedAt: now,
  };
}
// WSJ publishes a WebPage schema, not Event JSON-LD. Read the organizer's
// visible conference header and venue section; article dates are never used.
export function parseWsjQatar(
  html: string,
  feed: Feed,
  now = new Date().toISOString(),
): QatarEvent[] {
  const document = parseDocument(html);
  const withClass = (name: string, children = document.children) =>
    findAll((n) => classes(n.attribs.class).includes(name), children)[0];
  const titleNode = withClass("hero-secondary__title");
  const dateNode = withClass("hero-secondary__date");
  const cityNode = withClass("hero-secondary__location");
  const venueSection = findAll(
    (n) => n.attribs.id === "venue",
    document.children,
  )[0];
  const venueNode =
    venueSection && withClass("image-texts__title", venueSection.children);
  const overview = findAll(
    (n) => n.attribs.id === "overview",
    document.children,
  )[0];
  const descriptionNode =
    overview && withClass("intro__text", overview.children);
  const title = titleNode ? clean(textContent(titleNode)) : "";
  const date = dateNode ? clean(textContent(dateNode)) : "";
  const range = date.match(
    /^([A-Za-z]+)\s+(\d{1,2})\s*[-–—]\s*(?:([A-Za-z]+)\s+)?(\d{1,2}),?\s+(\d{4})$/,
  );
  if (!range || !venueNode || !cityNode) throw new Error(eventMarkupError);
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
  const firstMonth = months.indexOf(range[1].slice(0, 3).toLowerCase()) + 1;
  const lastMonth =
    months.indexOf((range[3] || range[1]).slice(0, 3).toLowerCase()) + 1;
  if (!firstMonth || !lastMonth) throw new Error(eventMarkupError);
  const year = Number(range[5]);
  const firstYear = firstMonth > lastMonth ? year - 1 : year;
  const format = (y: number, m: number, d: string) =>
    `${y}-${String(m).padStart(2, "0")}-${d.padStart(2, "0")}`;
  const event = eventRecord(
    {
      name: title,
      description: descriptionNode ? clean(textContent(descriptionNode)) : "",
      startDate: format(firstYear, firstMonth, range[2]),
      endDate: format(year, lastMonth, range[4]),
      location: `${clean(textContent(venueNode))}, ${clean(textContent(cityNode))}`,
      organizer: "WSJ Tech",
      url: feed.url,
    },
    feed,
    now,
  );
  if (!event) throw new Error(eventMarkupError);
  return [event];
}

// JSON is parsed as data only; scripts from third-party pages are never executed.
export function parseStructuredEvents(
  html: string,
  feed: Feed,
  now = new Date().toISOString(),
) {
  const document = parseDocument(html);
  const records: QatarEvent[] = [];
  function visit(value: any) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const types = Array.isArray(value["@type"])
      ? value["@type"]
      : [value["@type"]];
    if (
      types.some(
        (t: unknown) => typeof t === "string" && /^(?:[A-Za-z]*Event)$/.test(t),
      )
    ) {
      const event = eventRecord(value, feed, now);
      if (event) records.push(event);
    }
    Object.values(value).forEach(visit);
  }
  for (const script of findAll(
    (n) => n.name === "script" && n.attribs.type === "application/ld+json",
    document.children,
  )) {
    try {
      visit(JSON.parse(textContent(script)));
    } catch {
      /* Ignore malformed independent blocks. */
    }
  }
  // Eventbrite sometimes embeds search results instead of Event JSON-LD.
  if (feed.id.startsWith("events-eventbrite")) {
    for (const script of findAll(
      (n) => n.name === "script",
      document.children,
    )) {
      const match = textContent(script).match(
        /window\.__SERVER_DATA__\s*=\s*({[^]*?});\s*(?:\n|$)/,
      );
      if (!match) continue;
      try {
        const data = JSON.parse(match[1]);
        for (const raw of data.search_data?.events?.results || []) {
          if (raw.is_online_event) continue;
          const event = eventRecord(
            {
              name: raw.name,
              description: raw.summary,
              startDate: raw.start_date,
              endDate: raw.end_date,
              url: raw.url,
              location: {
                name: raw.primary_venue?.name,
                address: raw.primary_venue?.address
                  ? {
                      ...raw.primary_venue.address,
                      addressLocality:
                        raw.primary_venue.address.addressLocality ||
                        raw.primary_venue.address.city,
                      addressCountry:
                        raw.primary_venue.address.addressCountry ||
                        raw.primary_venue.address.country ||
                        raw.primary_venue.address.country_code,
                      streetAddress:
                        raw.primary_venue.address.streetAddress ||
                        raw.primary_venue.address.address_1,
                    }
                  : undefined,
              },
              organizer: raw.primary_organizer,
            },
            feed,
            now,
          );
          if (event) records.push(event);
        }
      } catch {
        /* A changed hydration format is reported as unavailable below. */
      }
    }
  }
  return [...new Map(records.map((e) => [e.id, e])).values()];
}
export function eventDetailLinks(html: string, feed: Feed) {
  const document = parseDocument(html);
  const links: string[] = [];
  const isAllEvents = feed.id.startsWith("events-allevents");
  for (const node of findAll(
    (n) =>
      isAllEvents
        ? classes(n.attribs.class).includes("event-card")
        : n.name === "a",
    document.children,
  )) {
    if (
      isAllEvents &&
      !relevant(`${node.attribs["data-name"] || ""} ${textContent(node)}`)
    )
      continue;
    const url = safeUrl(
      node.attribs["data-link"] || node.attribs.href,
      feed.url,
    );
    if (!url) continue;
    const parsed = new URL(url);
    if (
      isAllEvents
        ? parsed.hostname === "allevents.in" &&
          /^\/[^/]+\/[^/]+\/\d+\/?$/.test(parsed.pathname)
        : feed.id === "events-qstp"
          ? /^(?:www\.)?(?:qstp\.qa|qstp\.org\.qa)$/.test(parsed.hostname) &&
            /^\/events\/[^/]+\/?$/.test(parsed.pathname)
          : /^(?:www\.)?eventbrite\.com$/.test(parsed.hostname) &&
            parsed.pathname.startsWith("/e/")
    )
      links.push(url);
  }
  return [...new Set(links)].slice(0, 12);
}
export async function fetchEventHtml(url: string) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(12000),
    headers: { Accept: "text/html" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty response");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > 3_000_000) {
      await reader.cancel();
      throw new Error("Feed exceeds 3 MB limit");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
export async function collectEventPage(html: string, feed: Feed) {
  if (feed.id === "events-incubator") throw new Error(incubatorUnverified);
  const events = parseStructuredEvents(html, feed);
  if (feed.id === "events-wsj-qatar")
    return events.length ? events : parseWsjQatar(html, feed);
  if (feed.id.startsWith("events-allevents")) {
    const document = parseDocument(html);
    const listingCards = findAll(
      (n) => classes(n.attribs.class).includes("event-card"),
      document.children,
    );
    const explicitEmpty =
      findAll(
        (n) =>
          classes(n.attribs.class).includes("empty_sub_text") &&
          /No active events here/i.test(textContent(n)),
        document.children,
      ).length > 0;
    if (
      !events.length &&
      (explicitEmpty ||
        (listingCards.length > 0 && !eventDetailLinks(html, feed).length))
    )
      return [];
  }
  const links = eventDetailLinks(html, feed);
  let next = 0;
  let successfulDetails = 0;
  let failedDetails = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, links.length) }, async () => {
      while (next < links.length) {
        const url = links[next++];
        try {
          events.push(
            ...parseStructuredEvents(await fetchEventHtml(url), feed),
          );
          successfulDetails++;
        } catch {
          failedDetails++;
        }
      }
    }),
  );
  // A partial detail crawl is retried on the next sync. Never silently label an
  // entirely inaccessible or client-rendered calendar as a successful empty feed.
  if (!events.length && (!successfulDetails || failedDetails))
    throw new Error(eventRecordsUnavailable);
  if (!events.length && !links.length) throw new Error(eventMarkupError);
  return [...new Map(events.map((event) => [event.id, event])).values()];
}

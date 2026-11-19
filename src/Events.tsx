import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ExternalLink, MapPin } from "lucide-react";
import type { QatarEvent, Source, EventCollection } from "./types";
import { qatarDay } from "./data";
import { dateLabel } from "./components";
const dayLabel = (day: string) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "Asia/Qatar",
  }).format(new Date(`${day}T00:00:00+03:00`));
export default function Events({ sources }: { sources: Source[] }) {
  const [events, setEvents] = useState<QatarEvent[] | null>(null);
  const [collection, setCollection] = useState<EventCollection | null>(null);
  const [collectionError, setCollectionError] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState("upcoming");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/.netlify/functions/api?action=events", {
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(
            "Events are temporarily unavailable. Try again shortly.",
          );
        const result = await response.json();
        if (!controller.signal.aborted) {
          setEvents(result.events);
          setCollection(result.collection ?? null);
          setCollectionError(
            result.collectionError || result.collection?.error || "",
          );
          setError("");
        }
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      }
    }
    load();
    const timer = setInterval(load, 15000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [attempt]);
  const today = qatarDay();
  const years = [
    ...new Set((events || []).map((event) => event.startsOn.slice(0, 4))),
  ].sort((a, b) => b.localeCompare(a));
  const hasFilters = Boolean(query || month || year);
  const showAll = () => {
    setPeriod("all");
    setQuery("");
    setMonth("");
    setYear("");
  };
  const visible = useMemo(
    () =>
      (events || [])
        .filter(
          (event) =>
            (period === "all" ||
              (period === "upcoming"
                ? event.endsOn >= today
                : event.endsOn < today)) &&
            (!month || event.startsOn.slice(5, 7) === month) &&
            (!year || event.startsOn.slice(0, 4) === year) &&
            `${event.title} ${event.description} ${event.organizer} ${event.location}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort((a, b) => b.startsOn.localeCompare(a.startsOn)),
    [events, period, query, month, year, today],
  );
  const collecting =
    collection?.status === "queued" || collection?.status === "running";
  const eventSources = sources
    .filter((source) => source.id.startsWith("events-"))
    .map((source) => {
      const collected = collection?.sources.find(
        (item) => item.id === source.id,
      );
      return collected
        ? {
            ...source,
            lastAttempt: collected.lastAttempt,
            lastSuccess: collected.lastSuccess,
            lastError: collected.lastError,
            items: collected.items,
          }
        : source;
    });
  return (
    <section className="panel events-panel">
      <div className="panel-heading">
        <h2>
          <CalendarDays size={22} /> Qatar entrepreneurship events
        </h2>
        <span>
          {collecting && !visible.length
            ? "Checking sources…"
            : events
              ? `${visible.length} ${visible.length === 1 ? "event" : "events"}`
              : "Loading…"}
        </span>
      </div>
      <p className="source-note">
        Collected daily from enabled Qatar calendars, AllEvents and Eventbrite
        where verifiable listings are available. Dates are the organizer’s event
        dates. Confirm availability on the source website.
      </p>
      <div className="event-controls">
        <input
          type="search"
          aria-label="Search events"
          placeholder="Search events, organizers or venues"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="Event period"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          <option value="upcoming">Upcoming & ongoing</option>
          <option value="past">Past events</option>
          <option value="all">All events</option>
        </select>
        <select
          aria-label="Event start month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        >
          <option value="">All months</option>
          {Array.from({ length: 12 }, (_, index) => (
            <option key={index} value={String(index + 1).padStart(2, "0")}>
              {new Intl.DateTimeFormat("en-GB", {
                month: "long",
                timeZone: "UTC",
              }).format(new Date(Date.UTC(2026, index, 1)))}
            </option>
          ))}
        </select>
        <select
          aria-label="Event start year"
          value={year}
          onChange={(e) => setYear(e.target.value)}
        >
          <option value="">All years</option>
          {years.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>
      <p className="source-note">
        Newest start date first. Month and year filters use the event’s start
        date.
      </p>
      {eventSources.map((source) => (
        <p
          key={source.id}
          className={source.lastError ? "error-text" : "source-note"}
        >
          {source.name} · {source.enabled ? "Enabled" : "Collection disabled"} ·
          {source.lastSuccess
            ? `Last collected: ${dateLabel(source.lastSuccess)}`
            : source.lastAttempt
              ? "No successful collection yet"
              : "No collection run yet"}
          {!source.configured && ` · ${source.description}`}
          {source.lastError && ` · ${source.lastError}`}
        </p>
      ))}
      {collecting && (
        <p className="source-note" role="status">
          Collecting events from the enabled sources. New listings appear
          automatically as collection finishes.
        </p>
      )}
      {collectionError && (
        <p className="error-text" role="alert">
          {collectionError}
        </p>
      )}
      {error && (
        <div className="notice error" role="alert">
          {error}
          <button onClick={() => setAttempt((value) => value + 1)}>
            Retry
          </button>
        </div>
      )}
      {!events && !error && (
        <div className="empty" role="status">
          Loading collected events…
        </div>
      )}
      {events && !visible.length && (
        <div className="empty">
          <CalendarDays size={48} strokeWidth={1.5} />
          <h3>
            {collecting && !hasFilters
              ? "Checking event sources"
              : hasFilters
                ? "No matching events"
                : period === "upcoming"
                  ? "No upcoming events collected yet"
                  : "No events in this view"}
          </h3>
          <p>
            {collecting && !hasFilters
              ? "Collection is in progress. This page updates automatically; you do not need to start a separate sync."
              : hasFilters
                ? "Try another search, month or year, or view all collected events."
                : period === "upcoming" && events.length
                  ? `${events.length} past ${events.length === 1 ? "event is" : "events are"} saved. Choose All events to view them. This is the saved collection, not a count of all events in Qatar.`
                  : "No verified listings are saved for this view yet. Source access failures are shown above; an empty collection does not mean there are no events in Qatar."}
          </p>
          {(period !== "all" || hasFilters) && (
            <button onClick={showAll}>View all collected events</button>
          )}
        </div>
      )}
      {visible.map((event) => (
        <article className="article event-row" key={event.id}>
          <div className="event-date">
            <strong>{dayLabel(event.startsOn)}</strong>
            {event.endsOn !== event.startsOn && (
              <span>to {dayLabel(event.endsOn)}</span>
            )}
            <small>
              {event.endsOn < today
                ? "Past event"
                : event.startsOn <= today
                  ? "Ongoing"
                  : "Upcoming"}
            </small>
          </div>
          <div>
            <div className="article-meta">
              <span>{event.organizer}</span>
              <span>
                <MapPin size={14} /> {event.location}
              </span>
            </div>
            <div className="article-title">
              <a
                href={event.url}
                target="_blank"
                rel="noopener noreferrer"
                dir="auto"
              >
                {event.title}
                <ExternalLink size={14} />
              </a>
            </div>
            <p dir="auto">{event.description}</p>
            <a
              className="event-source"
              href={event.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Source: {event.sourceName} <ExternalLink size={12} />
            </a>
            <small className="event-collected">
              Last seen {dateLabel(event.collectedAt)}
            </small>
          </div>
        </article>
      ))}
    </section>
  );
}

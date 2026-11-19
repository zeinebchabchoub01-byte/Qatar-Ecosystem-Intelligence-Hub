import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ExternalLink, MapPin } from "lucide-react";
import type { QatarEvent, Source } from "./types";
import { qatarDay } from "./data";
import { dateLabel } from "./components";
const dayLabel = (day: string) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "Asia/Qatar",
  }).format(new Date(`${day}T00:00:00+03:00`));
export default function Events({ sources }: { sources: Source[] }) {
  const [events, setEvents] = useState<QatarEvent[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState("upcoming");
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
  const visible = useMemo(
    () =>
      (events || [])
        .filter(
          (event) =>
            (period === "all" ||
              (period === "upcoming"
                ? event.endsOn >= today
                : event.endsOn < today)) &&
            `${event.title} ${event.description} ${event.organizer} ${event.location}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort((a, b) =>
          period === "past"
            ? b.startsOn.localeCompare(a.startsOn)
            : a.startsOn.localeCompare(b.startsOn),
        ),
    [events, period, query, today],
  );
  const eventSources = sources.filter((source) =>
    source.id.startsWith("events-"),
  );
  return (
    <section className="panel events-panel">
      <div className="panel-heading">
        <h2>
          <CalendarDays size={22} /> Qatar entrepreneurship events
        </h2>
        <span>
          {events
            ? `${visible.length} ${visible.length === 1 ? "event" : "events"}`
            : "Loading…"}
        </span>
      </div>
      <p className="source-note">
        Automatically collected from Startup Qatar’s public calendar during
        daily synchronization. Dates are the organizer’s event dates. Confirm
        availability on the source website.
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
      </div>
      {eventSources.map((source) => (
        <p
          key={source.id}
          className={source.lastError ? "error-text" : "source-note"}
        >
          {source.name} · {source.enabled ? "Enabled" : "Collection disabled"} ·
          Last collected: {dateLabel(source.lastSuccess)}
          {source.lastError && ` · ${source.lastError}`}
        </p>
      ))}
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
            {query
              ? "No matching events"
              : period === "upcoming"
                ? "No upcoming events collected yet"
                : "No events in this view"}
          </h3>
          <p>
            {query
              ? "Try a different event, organizer or venue."
              : "Collection runs daily. The source may currently list only past events; check All events or review its status in Sources."}
          </p>
          {period !== "all" && (
            <button onClick={() => setPeriod("all")}>
              View all collected events
            </button>
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

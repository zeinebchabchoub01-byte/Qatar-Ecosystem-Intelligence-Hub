import { useState } from "react";
import { Search, FileText, Bookmark, ExternalLink, Tag } from "lucide-react";
import type { Article, Source } from "./types";
import type { Filters } from "./data";
export const dateLabel = (date?: string | null) =>
  date
    ? new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Qatar",
      }).format(new Date(date)) + " Qatar"
    : "Unavailable";
export function FiltersBar({
  filters,
  setFilters,
  categories,
  sources,
}: {
  filters: Filters;
  setFilters: (v: Filters) => void;
  categories: string[];
  sources: Source[];
}) {
  const update = (key: keyof Filters, value: string) =>
    setFilters({ ...filters, [key]: value });
  return (
    <section className="panel filters" aria-label="Article filters">
      <label className="search">
        <Search size={19} />
        <input
          aria-label="Search articles"
          placeholder="Search by keyword (e.g., funding, QSTP, startup)"
          value={filters.keyword}
          onChange={(e) => update("keyword", e.target.value)}
        />
      </label>
      <select
        aria-label="Category"
        value={filters.category}
        onChange={(e) => update("category", e.target.value)}
      >
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      <select
        aria-label="Language"
        value={filters.language}
        onChange={(e) => update("language", e.target.value)}
      >
        <option value="">All languages</option>
        <option>English</option>
        <option>Arabic</option>
      </select>
      <select
        aria-label="Source"
        value={filters.source}
        onChange={(e) => update("source", e.target.value)}
      >
        <option value="">All sources</option>
        {sources.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <div className="date-controls">
        <label>
          From
          <input
            type="date"
            value={filters.from}
            onChange={(e) => update("from", e.target.value)}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={filters.to}
            min={filters.from}
            onChange={(e) => update("to", e.target.value)}
          />
        </label>
        <button
          className="text-button"
          onClick={() =>
            setFilters({
              keyword: "",
              category: "",
              language: "",
              source: "",
              from: "",
              to: "",
              sort: "newest",
            })
          }
        >
          Clear filters
        </button>
      </div>
    </section>
  );
}
export function ArticleList({
  articles,
  total,
  saved,
  onSave,
  onRefresh,
  sort,
  onSort,
  pageTitle,
}: {
  articles: Article[];
  total: number;
  saved: string[];
  onSave: (id: string, saved: boolean) => void;
  onRefresh: () => void;
  sort: string;
  onSort: (s: string) => void;
  pageTitle: string;
}) {
  const [limit, setLimit] = useState(30);
  return (
    <section className="panel intelligence">
      <div className="panel-heading">
        <h2>{pageTitle}</h2>
        <select
          aria-label="Sort articles"
          value={sort}
          onChange={(e) => onSort(e.target.value)}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>
      {articles.length ? (
        <>
          <p className="result-count">
            {articles.length.toLocaleString()} matching articles
          </p>
          {articles.slice(0, limit).map((a) => (
            <article className="article" key={a.id}>
              <div className="article-meta">
                <span>{a.publisher}</span>
                <span>{dateLabel(a.publishedAt)}</span>
                <span>{a.language}</span>
              </div>
              <div className="article-title">
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  dir="auto"
                >
                  {a.title}
                  <ExternalLink size={14} />
                </a>
                <button
                  className={
                    "icon-button " + (saved.includes(a.id) ? "is-saved" : "")
                  }
                  aria-label={
                    saved.includes(a.id) ? "Remove bookmark" : "Save article"
                  }
                  aria-pressed={saved.includes(a.id)}
                  onClick={() => onSave(a.id, !saved.includes(a.id))}
                >
                  <Bookmark size={20} />
                </button>
              </div>
              <p dir="auto">
                {a.description || "No excerpt provided by this feed."}
              </p>
              <div className="tags">
                {a.categories.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
            </article>
          ))}
          {limit < articles.length && (
            <button
              className="load-more"
              onClick={() => setLimit((l) => l + 30)}
            >
              Load more articles
            </button>
          )}
        </>
      ) : (
        <div className="empty">
          <FileText size={54} strokeWidth={1.5} />
          <h3>
            {total
              ? "No articles match this view"
              : "No intelligence collected yet"}
          </h3>
          <p>
            {total
              ? "Try adjusting your filters or saving an article to your reading list."
              : "Run your first sync to collect intelligence from your registered sources."}
          </p>
          {!total && (
            <>
              <div className="first-run">
                <h4>Run your first sync</h4>
                <ol>
                  <li>
                    Review the registered feeds in <strong>Sources</strong>.
                  </li>
                  <li>
                    Sign in as admin and click <strong>Refresh</strong>.
                  </li>
                  <li>
                    Collected intelligence will appear here, newest first.
                  </li>
                </ol>
              </div>
              <button className="primary" onClick={onRefresh}>
                Run first sync
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
export function Coverage({
  categories,
  articles,
  onCategory,
}: {
  categories: string[];
  articles: Article[];
  onCategory: (c: string) => void;
}) {
  return (
    <aside className="coverage">
      <section className="panel">
        <h2>Category coverage</h2>
        <p>Collected articles by category.</p>
        <div className="coverage-list">
          {categories.map((c) => (
            <button key={c} onClick={() => onCategory(c)}>
              <Tag size={15} />
              <span>{c}</span>
              <strong>
                {articles.filter((a) => a.categories.includes(c)).length}
              </strong>
            </button>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2>Language coverage</h2>
        <p>Original English and Arabic reporting.</p>
        {["English", "Arabic"].map((l) => (
          <div className="language-row" key={l}>
            <b>{l === "English" ? "EN" : "AR"}</b>
            <span>{l}</span>
            <strong>{articles.filter((a) => a.language === l).length}</strong>
          </div>
        ))}
      </section>
    </aside>
  );
}
export function Sources({
  sources,
  admin,
  onToggle,
}: {
  sources: Source[];
  admin: boolean;
  onToggle: (id: string, enabled: boolean) => void;
}) {
  return (
    <section className="panel sources">
      <div className="panel-heading">
        <h2>Registered sources</h2>
        <span>{sources.length} feeds</span>
      </div>
      <p className="source-note">
        Feed URLs stay on the server.{" "}
        {admin
          ? "Use each switch to enable or disable collection."
          : "Admin login is required to change source settings."}
      </p>
      {sources.map((s) => (
        <article className="source-row" key={s.id}>
          <div>
            <div className="source-label">
              <span className="tag">{s.category}</span>
              <span>{s.language}</span>
              <span
                className={
                  "status " +
                  (s.lastError ? "bad" : s.lastSuccess ? "good" : "")
                }
              >
                {!s.configured
                  ? "Needs configuration"
                  : !s.enabled
                    ? "Disabled"
                    : s.lastError
                      ? "Fetch failed"
                      : s.lastSuccess
                        ? "Healthy"
                        : "Not fetched"}
              </span>
            </div>
            <h3 dir="auto">{s.name}</h3>
            <p>{s.description}</p>
            <small>Last successful fetch: {dateLabel(s.lastSuccess)}</small>
            {s.lastError && <p className="error-text">{s.lastError}</p>}
          </div>
          <label className="toggle">
            <input
              aria-label={`Enable ${s.name}`}
              type="checkbox"
              checked={s.enabled}
              disabled={!admin}
              onChange={(e) => onToggle(s.id, e.target.checked)}
            />
            <span>{s.enabled ? "Enabled" : "Disabled"}</span>
          </label>
        </article>
      ))}
    </section>
  );
}

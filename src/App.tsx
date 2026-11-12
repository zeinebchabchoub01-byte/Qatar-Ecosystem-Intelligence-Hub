import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Home,
  FileText,
  Layers,
  Bookmark,
  Database,
  Download,
  RefreshCw,
  LogIn,
  LogOut,
  CalendarDays,
  Info,
  X,
  Menu,
} from "lucide-react";
import type { Snapshot } from "./types";
import { filterArticles, emptyFilters, csv, qatarDay, weekStart } from "./data";
import {
  ArticleList,
  Coverage,
  FiltersBar,
  Sources,
  dateLabel,
} from "./components";
const nav = [
  ["Overview", Home],
  ["Latest intelligence", FileText],
  ["Categories", Layers],
  ["Saved articles", Bookmark],
  ["Sources", Database],
] as const;
async function request(action: string, body?: unknown) {
  const res = await fetch(
    `/.netlify/functions/api?action=${action}`,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}
export default function App() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [view, setView] = useState("Overview");
  const [filters, setFilters] = useState(emptyFilters);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [login, setLogin] = useState(false);
  const [password, setPassword] = useState("");
  const [mobile, setMobile] = useState(false);
  const load = useCallback(async () => {
    try {
      setData(await request("snapshot"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);
  const categories = useMemo(
    () => [...new Set(data?.sources.map((s) => s.category) || [])],
    [data?.sources],
  );
  const filtered = useMemo(
    () =>
      filterArticles(
        view === "Saved articles"
          ? data?.articles.filter((a) => data.bookmarks.includes(a.id)) || []
          : data?.articles || [],
        filters,
      ),
    [data, filters, view],
  );
  async function mutate(action: string, body: unknown) {
    setBusy(true);
    setActionError("");
    setMessage("");
    try {
      const result = await request(action, body);
      if (result.message) setMessage(result.message);
      await load();
      return true;
    } catch (e) {
      setActionError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function refresh() {
    if (!data?.admin) {
      return;
    }
    mutate("refresh", {});
  }
  function exportCsv() {
    const blob = new Blob([csv(filtered)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qatar-intelligence-${qatarDay()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const run = data?.run;
  const queued =
    run?.status === "queued" &&
    Date.parse(run.startedAt) > Date.now() - 2 * 60_000;
  const running =
    run?.status === "running" &&
    !run.finishedAt &&
    Date.parse(run.startedAt) > Date.now() - 12 * 60_000;
  const title = view === "Overview" ? "Ecosystem overview" : view;
  return (
    <div className="app">
      <aside className={"sidebar " + (mobile ? "open" : "")}>
        <a className="brand" href="#" onClick={() => setView("Overview")}>
          <span>Q</span>
          <b>
            Qatar Ecosystem
            <br />
            Intelligence Hub
          </b>
        </a>
        <nav aria-label="Main navigation">
          {nav.map(([name, Icon]) => (
            <button
              key={name}
              className={view === name ? "active" : ""}
              onClick={() => {
                setView(name);
                setMobile(false);
              }}
            >
              <Icon size={21} />
              {name}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="small-dot" />
          Daily collection · 06:00 Qatar
          <p>
            Independent ecosystem intelligence.
            <br />
            Public dashboard · shared reading list.
          </p>
          <button
            onClick={() =>
              data?.admin ? mutate("logout", {}) : setLogin(true)
            }
          >
            {data?.admin ? <LogOut size={17} /> : <LogIn size={17} />}{" "}
            {data?.admin ? "Sign out" : "Admin login"}
          </button>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <button
              className="mobile-menu icon-button"
              aria-label="Toggle navigation"
              onClick={() => setMobile(!mobile)}
            >
              <Menu />
            </button>
            <h1>{title}</h1>
            <p>Qatar entrepreneurship, innovation & investment</p>
          </div>
          <div className="actions">
            <button onClick={exportCsv} disabled={!data}>
              <Download size={18} />
              Export CSV
            </button>
            {data?.admin && (
              <button
                className="primary"
                disabled={busy || running || queued}
                onClick={refresh}
              >
                <RefreshCw size={18} className={running ? "spin" : ""} />
                {running
                  ? "Syncing…"
                  : queued
                    ? "Sync queued…"
                    : !run || !data?.articles.length
                      ? "Start sync"
                      : "Refresh"}
              </button>
            )}
          </div>
        </header>
        {(error || actionError) && (
          <div role="alert" className="notice error">
            {actionError || error}
            <button
              onClick={() => {
                setActionError("");
                load();
              }}
            >
              Dismiss
            </button>
          </div>
        )}
        {message && (
          <div role="status" className="notice">
            {message}
            <button
              className="icon-button"
              aria-label="Dismiss notification"
              onClick={() => setMessage("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {!data ? (
          <section className="panel loading">
            {error
              ? "The service is unavailable. Check your Netlify environment settings."
              : "Loading ecosystem intelligence…"}
          </section>
        ) : (
          <>
            <section className="metrics" aria-label="Overview metrics">
              {[
                [FileText, "Articles", data.articles.length],
                [
                  CalendarDays,
                  "Today",
                  data.articles.filter(
                    (a) =>
                      a.publishedAt &&
                      qatarDay(new Date(a.publishedAt)) === qatarDay(),
                  ).length,
                ],
                [
                  CalendarDays,
                  "This week",
                  data.articles.filter(
                    (a) =>
                      a.publishedAt &&
                      qatarDay(new Date(a.publishedAt)) >= weekStart() &&
                      qatarDay(new Date(a.publishedAt)) <= qatarDay(),
                  ).length,
                ],
                [
                  Database,
                  "Active RSS sources",
                  data.sources.filter((s) => s.enabled && s.configured).length,
                ],
              ].map(([Icon, label, value]: any) => (
                <div className="metric" key={label}>
                  <Icon size={26} />
                  <div>
                    <span>{label}</span>
                    <strong>{value.toLocaleString()}</strong>
                  </div>
                </div>
              ))}
            </section>
            <section
              className={
                "sync-status " +
                (data.admin &&
                (run?.status === "failed" || run?.status === "partial")
                  ? "warning"
                  : "")
              }
            >
              <Info size={23} />
              {data.admin && (
                <>
                  <strong>
                    {queued
                      ? "Synchronization queued"
                      : run?.status === "queued"
                        ? "Synchronization did not start"
                        : !run
                          ? "Not synchronized yet"
                          : running
                            ? "Synchronization in progress"
                            : run.status === "running"
                              ? "Previous sync interrupted"
                              : run.status === "success"
                                ? "Synchronization complete"
                                : run.status === "partial"
                                  ? "Partially synchronized"
                                  : "Synchronization failed"}
                  </strong>
                  <span>
                    {run?.status === "queued"
                      ? queued
                        ? "Waiting for the collection worker to start…"
                        : "The worker has not started. Click Start sync to retry. If this continues, check the sync-background function logs."
                      : run
                        ? `${run.successful} successful · ${run.failed} failed · ${run.added} new articles${run.error ? " · " + run.error : ""}`
                        : data.sources.some((s) => s.configured && s.enabled)
                          ? "Your feeds are ready. Start sync to collect your first articles."
                          : "Import your feed inventory in Sources to start collecting articles."}
                  </span>
                  {!running &&
                    !queued &&
                    data.sources.some((s) => s.configured && s.enabled) && (
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={refresh}
                      >
                        {run ? "Retry sync" : "Start first sync"}
                      </button>
                    )}
                </>
              )}
              <small>
                Last successful sync:{" "}
                {data.lastSuccess
                  ? dateLabel(data.lastSuccess)
                  : "Not synchronized yet"}
                <br />
                {data.admin &&
                  run?.finishedAt &&
                  `Last attempt: ${dateLabel(run.finishedAt)}`}
              </small>
            </section>
            {view === "Sources" ? (
              <>
                <section className="panel import-panel">
                  <div>
                    <h2>Feed inventory</h2>
                    <p>
                      Import your private feeds.json file. URLs are saved
                      securely on the server.
                    </p>
                  </div>
                  {data.admin ? (
                    <label className="import-button">
                      Import inventory
                      <input
                        type="file"
                        accept=".json,application/json"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 200000) {
                            setActionError("Inventory file exceeds 200 KB.");
                            return;
                          }
                          try {
                            await mutate("import", {
                              feeds: JSON.parse(await file.text()),
                            });
                          } catch {
                            setActionError(
                              "Please select a valid JSON inventory file.",
                            );
                          }
                          e.target.value = "";
                        }}
                      />
                    </label>
                  ) : (
                    <button onClick={() => setLogin(true)}>
                      Admin login to import
                    </button>
                  )}
                </section>
                <Sources
                  sources={data.sources}
                  admin={data.admin}
                  onToggle={(id, enabled) => {
                    setData((d) =>
                      d
                        ? {
                            ...d,
                            sources: d.sources.map((s) =>
                              s.id === id ? { ...s, enabled } : s,
                            ),
                          }
                        : d,
                    );
                    mutate("source", { id, enabled }).then((ok) => {
                      if (!ok) load();
                    });
                  }}
                />
              </>
            ) : (
              <>
                <FiltersBar
                  filters={filters}
                  setFilters={setFilters}
                  categories={categories}
                  sources={data.sources}
                />
                <div className="content-grid">
                  <ArticleList
                    articles={filtered}
                    total={data.articles.length}
                    saved={data.bookmarks}
                    onSave={(id, saved) => {
                      if (!data.admin) {
                        setLogin(true);
                        return;
                      }
                      mutate("bookmark", { id, saved });
                    }}
                    onRefresh={data.admin ? refresh : undefined}
                    sort={filters.sort}
                    onSort={(sort) => setFilters((f) => ({ ...f, sort }))}
                    pageTitle={
                      view === "Saved articles"
                        ? "Saved articles"
                        : "Latest intelligence"
                    }
                  />
                  <Coverage
                    categories={categories}
                    articles={data.articles}
                    onCategory={(category) => {
                      setFilters((f) => ({ ...f, category }));
                      setView("Categories");
                    }}
                  />
                </div>
              </>
            )}
            <footer>
              Daily synchronization at 06:00 Qatar (03:00 UTC). Publication
              dates come from the feeds. Category totals may overlap.
            </footer>
          </>
        )}
      </main>
      {login && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setLogin(false);
          }}
        >
          <section
            className="login panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close icon-button"
              aria-label="Close login"
              onClick={() => {
                setLogin(false);
              }}
            >
              <X />
            </button>
            <h2 id="login-title">Admin access</h2>
            <p>
              Sign in to refresh feeds, manage sources, and edit the shared
              reading list.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (await mutate("login", { password })) {
                  setPassword("");
                  setLogin(false);
                }
              }}
            >
              <label>
                Admin password
                <input
                  autoFocus
                  required
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <button className="primary" disabled={busy}>
                Sign in
              </button>
              {error && (
                <p role="alert" className="error-text">
                  {error}
                </p>
              )}
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

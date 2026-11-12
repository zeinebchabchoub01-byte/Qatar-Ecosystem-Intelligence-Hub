# Qatar Ecosystem Intelligence Hub

A working React + Vite + TypeScript dashboard for Qatar entrepreneurship, innovation, startup funding, policy, research, GCC developments, and Arabic reporting. It collects your **46 unique Google Alerts RSS/Atom feeds**, with the categories, queries, languages and descriptions from your inventory.

The dashboard is public to anyone who has its URL. It is **not a private research room**. Feed URLs and admin credentials remain server-side. An administrator can refresh, enable/disable feeds, and maintain one **shared reading list**. Anyone can read that list or export articles. Individual user accounts are not included.

## How it works

1. React displays articles fetched from a Netlify Function. Combined keyword, category, language, source and publication-date filters run in your browser. Date ranges and overview counters use Qatar time; weeks start Monday. Undated articles show “Unavailable” and are excluded from date filters.
2. The daily scheduled function runs at **03:00 UTC / 06:00 Qatar**, only on the published production deployment. It dispatches an authenticated background worker. This avoids trying to collect 46 feeds within the scheduler's 30-second limit.
3. The worker fetches five feeds at a time, with a 12-second timeout and 3 MB response limit per feed. Each feed failure is recorded independently. It parses RSS and Atom, removes HTML from excerpts, unwraps Google article redirects, and uses feed publication dates.
4. GUIDs identify entries when available; normalized article URLs are an additional cross-feed deduplication key. Original article URLs remain available; tracking parameters are removed only for deduplication. Every matching category and source is retained.
5. Articles, bookmarks, source switches, fetch status, sync history and an atomic synchronization lease are stored in the **site-wide `qatar-ecosystem-v1` Netlify Blobs store** with strong consistency. Nothing relies on a production local filesystem. Deployments of the same Netlify project keep their stored data.
6. The browser polls the API every 15 seconds. A run is successful only when every enabled feed succeeds. Partial runs retain collected articles and identify failed feeds. Last successful sync updates only after a fully successful run.

## Project files

| Path | Purpose |
| --- | --- |
| `src/` | React dashboard, responsive styling, filtering and CSV export |
| `server/` | Server-only ingestion, storage, configuration and authentication |
| `server/source-catalog.json` | Safe source metadata from your inventory, without feed URLs |
| `netlify/functions/api.ts` | Dashboard data, admin session, bookmarks and source controls |
| `netlify/functions/daily-sync.ts` | Daily scheduled dispatcher |
| `netlify/functions/sync-background.ts` | Authenticated asynchronous RSS worker |
| `netlify.toml` | Build, schedule, function bundling, local dev and security headers |
| `scripts/dev.ts` | Local function runner with the official Blobs emulator |
| `scripts/import-inventory.ts` | Converts your tab-separated inventory into private configuration |
| `scripts/check-bundle.ts` | Checks built frontend for private configuration leaks |
| `tests/core.test.ts` | Parsing, deduplication, storage, sync and API regression tests |
| `.env.example` | Variable names and example values; contains no real secrets |
| `private/feeds.json` | Your actual feed URLs; generated locally and **excluded from Git** |
| `docs/` | Design reference and verification report |

## Accounts and requirements

- A GitHub account and a Netlify account with permission to connect a repository.
- Node.js **22 or newer** for local development. Install the LTS release from [nodejs.org](https://nodejs.org/).
- Your Google Alerts feeds must remain active and accessible. No additional news API account is needed.
- Netlify Functions, Background Functions and Blobs must be available for your account. Review current usage and pricing in your Netlify dashboard before sharing widely.

## 1. Put the project on GitHub

**Recommended: use a private repository.** Public repositories are also supported, since the feed URL list is excluded. Safe source descriptions and alert queries will still be visible in a public repository.

### Option A: Git (recommended)

1. On GitHub, select **New repository**, name it `qatar-ecosystem-intelligence-hub`, and choose Private or Public.
2. Leave “Add README”, license and gitignore unchecked because this project already contains its own files.
3. Open a terminal in this project folder. Run:

   ```sh
   git status --short
   git add .
   git diff --cached --name-only
   ```

4. Review the staged filenames. **Do not proceed if `.env`, `private/`, `.netlify/` or `node_modules/` appears.** `.env.example` is safe. `.gitignore` already excludes private files.
5. Then run (replace YOUR-USERNAME):

   ```sh
   git commit -m "Build Qatar ecosystem intelligence hub"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/qatar-ecosystem-intelligence-hub.git
   git push -u origin main
   ```

   If an `origin` remote already exists, check it with `git remote -v`; use the intended repository instead of adding another.

### Option B: GitHub website upload

1. Create the repository and choose **uploading an existing file**.
2. Upload `src`, `server`, `netlify`, `scripts`, `tests`, `docs`, `public`, `package.json`, `package-lock.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, `netlify.toml`, `README.md`, `.gitignore`, and `.env.example`.
3. **Never drag the entire folder without checking its contents. Browser uploads do not apply `.gitignore`.** Exclude `.env`, `private`, `node_modules`, `dist`, `.git` and `.netlify`.
4. Commit the upload. Confirm `src` and `netlify` are at the repository root, not buried in an extra parent folder.

If a real secret is accidentally uploaded, delete it from GitHub and rotate it in Netlify. Deleting it from the latest commit does not remove it from repository history.

## 2. Connect GitHub to Netlify

1. Log in at [Netlify](https://app.netlify.com/).
2. Choose **Add new project → Import an existing project** (wording may vary).
3. Choose **GitHub**, authorize access and select the repository.
4. Select `main` as the production branch.
5. Leave Base directory empty. Build command: **`npm run build`**. Publish directory: **`dist`**. Functions directory: **`netlify/functions`**. `netlify.toml` normally supplies these automatically.
6. Add the four environment variables below before deploying, if the import screen offers that option. Otherwise deploy once, add them under **Project configuration → Environment variables**, then deploy again.
7. Deploy. A successful build ends with Vite output and deployed functions.
8. Open the project's production URL (for example `https://your-project.netlify.app`). Find it on the Project overview page.
9. Set `APP_URL` to that exact production origin, then redeploy if you changed the variable. Do not use a deploy-preview URL.
10. Every later push to `main` triggers a new production build automatically. Article data remains in the same site's Blobs store.

## 3. Configure environment variables and storage

Add these variables in Netlify under **Project configuration → Environment variables**. Give them the **Functions** scope and **Production** context. If your plan does not offer granular scopes, set the values for runtime access, but never prefix any of them with `VITE_`. Redeploy after changes.

| Variable | What to put in it |
| --- | --- |
| `ADMIN_PASSWORD` | A unique random password at least 32 characters long. This is the admin login password. |
| `SESSION_SECRET` | A different random secret, at least 32 characters, for signing the eight-hour HttpOnly session cookie. |
| `SYNC_SECRET` | A third random secret, at least 32 characters, authenticating worker dispatch. Never enter it in the dashboard. |
| `APP_URL` | Your production origin, e.g. `https://your-project.netlify.app`, without trailing slash. |


To generate a secret locally, run the following **three times**, using a different result for each secret:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

After deployment, sign in as admin, open Sources, choose **Import inventory**, and select the locally provided `private/feeds.json`. The full inventory is stored privately in Netlify Blobs. Do not paste the inventory into an environment variable: Netlify limits each value to 5,000 characters, while this inventory is larger. Never put this file on GitHub or in `public/`. The provided local `.env` is for development only; use fresh production credentials. There is no `VITE_` variable required.

**Storage initialization:** no database signup, schema or access token is required in production. Netlify injects its Blobs access context into deployed Functions. The first successful run creates records in the site-wide store automatically. Source metadata can display before import or collection. Feed URLs are initialized by the authenticated inventory import. Bookmarks and enable/disable choices persist immediately. A new Netlify project is a new database; deleting the project loses access to that store. Deploy Previews should not be given production secrets or used for mutating production data.

## 4. First synchronization and daily checks

1. Open the production dashboard. Before a sync, counts are zero; this is a truthful empty state.
2. Open **Sources**. Before importing, the safe catalog shows the 46 feeds as “Needs configuration”.
3. Choose **Admin login** and enter `ADMIN_PASSWORD`. Credentials are sent over HTTPS and stored only as a signed HttpOnly session cookie, not in JavaScript or local storage.
4. In Sources, choose **Import inventory** and select `private/feeds.json`. All 46 feeds should now be configured. Click **Refresh**. The app queues a worker and reports that it is queued. **Queued does not mean completed.** Within a polling cycle the run should change to “Synchronization in progress”.
5. Wait for completion. The dashboard reports successful feeds, failed feeds and added articles. Open Sources to see individual failures. A zero-item feed can be healthy: Google Alerts may have no recent matching results.
6. Verify **Last successful sync**. A partial or failed run does not overwrite the timestamp of the last fully successful run.

### Verify the daily job

In Netlify, open **Functions → daily-sync**. It should have a **Scheduled** badge and a next execution at **03:00 UTC**. The schedule is `0 3 * * *`. It runs only on the published production deploy; local development and deploy previews do not run it automatically.

Use **Run now** in the scheduled function's Netlify page to test the actual dispatcher. Then open **sync-background** logs and check the dashboard's final status. The scheduler's successful invocation only confirms dispatch, not feed collection. You can also trigger the same worker via the authenticated dashboard Refresh button.

For local manual invocation, use the admin Refresh button. The local runner also supports POST to `/.netlify/functions/daily-sync` with `Authorization: Bearer <your local SYNC_SECRET>` to test the dispatcher. This test route is local only. Never rely on hitting the production scheduler URL: scheduled functions cannot be directly invoked that way.

If one feed fails, other feeds continue; collected data remains visible. The source row records a safe error message and keeps its last successful fetch timestamp. Try again later or disable the failing source. Runs are retained under `run/` keys in Blobs. An atomic 12-minute lease prevents overlapping workers. A crashed run can show interrupted after that lease expires; the next invocation can recover.

## 5. Using the dashboard

- **Overview:** all-time, today and Monday-to-today counts, enabled/configured source count, sync status, category and language coverage. Metrics use the entire archive, while filters affect the article list/export.
- **Latest intelligence:** original linked headlines, feed-provided excerpts, publisher/domain, feed date, language and all matched categories. Links open in a new tab.
- **Categories:** choose a category from the coverage list or filter. Articles can belong to multiple categories; totals overlap.
- Combine keyword, language, source and inclusive date ranges. Date filters exclude undated entries. Choose newest or oldest; undated items remain at the end. Clear filters resets all controls.
- **Saved articles:** an admin clicks a bookmark to save/remove it in the shared reading list. The list persists across refreshes and devices; another device sees it without login. Editing requires admin login to prevent public visitors altering the research list.
- **Sources:** admin toggles immediately change which feeds are included in the next sync, without code edits or deployment. Old articles are retained when a feed is disabled.
- **Export CSV:** downloads every article matching the current filters/view, including articles beyond the visible pagination. UTF-8 BOM supports Arabic in spreadsheet apps. Formula-like cells are escaped for spreadsheet safety.

## 6. Add, edit or remove feeds

**Disable/enable:** use Sources while logged in. No GitHub push or redeploy required.

**Add/edit URL, query, category, language or description:** the canonical inventory is your tab-separated file. Keep five columns: Group, Alert query, RSS, Language, What it catches.

1. Edit a copy of your inventory locally.
2. Run `npm run inventory -- "path/to/inventory.txt"`.
3. The importer accepts unique HTTPS Google Alerts URLs only. It regenerates the ignored `private/feeds.json` and the safe `server/source-catalog.json`. It preserves your categories and descriptions; it never invents feeds.
4. Sign in as admin and import the regenerated `private/feeds.json` through Sources → Import inventory. Changes are immediately persistent.
5. Optionally commit/push the safe catalog change, so an empty/new installation has the latest catalog. A deployment is **not required** for the live inventory import. Do **not** commit the private file. Existing source toggles survive for unchanged feed URLs/IDs.
6. Run Refresh and inspect Sources. Changing the URL creates a new source ID. Imported inventory replaces the active list; archived articles and bookmarks are retained.

Inventory imports and runtime switches require no deploy. Regenerating the safe fallback catalog in GitHub requires a deploy. Feed URLs are never returned through the dashboard API.

## 7. Local development and tests

```sh
npm ci
# Copy .env.example to .env, then set all variables; use APP_URL=http://localhost:8888
npm start
```

The local runner serves the full app at **http://localhost:8888**, executes the actual function handlers, and uses the official Netlify Blobs emulator. It avoids an upstream Netlify CLI GET-proxy bug found during verification. `npm run dev` by itself starts only the Vite frontend, so the backend will be unavailable there. Local Blobs data stays in `.netlify/` and is separate from production. The local emulator's filesystem is a development implementation, never the production database.

```sh
npm test
npm run build
npm run check:bundle
```

Tests use the official Blobs emulator in an isolated temporary directory. They verify RSS/Atom, unsafe links, missing dates, Arabic, deduplication, combined filters, CSV escaping, persistent records across store instances, repeat synchronization, failure preservation, leases, auth and private URL redaction. Test fixtures are never loaded by the dashboard. See `docs/verification.md` for the actual delivery checks and unverified production steps.

## 8. Troubleshooting

| Symptom | What to check |
| --- | --- |
| Build fails | Repository root contains package.json, lockfile, src and netlify.toml. Use Node 22+, `npm ci`, then `npm run build`. Read the first error in the deploy log. |
| Dashboard says Service unavailable | Check function runtime environment scope, Blobs availability and Function logs. Environment changes require a deploy. |
| Zero active sources / Needs configuration | Sign in as admin and use Sources → Import inventory to upload private/feeds.json. |
| Admin login unavailable | ADMIN_PASSWORD and SESSION_SECRET must each be at least 32 characters. Use the production context and redeploy. |
| Refresh rejected / worker never starts | APP_URL must match the production URL, SYNC_SECRET must be set, and sync-background must deploy as Background. Inspect daily-sync and sync-background logs. |
| Partial / failed sync | Open Sources. HTTP 404/403/429 can mean deleted feeds, access restrictions or Google rate limiting. Retry later or replace/disable the affected feed. |
| Healthy feed has no items | Google Alerts can return an empty feed. No articles are invented. Check it directly in your private browser using the URL from your inventory. |
| Last successful sync is old | A partial run does not count as full success. Check feed errors and the scheduled function logs. |
| No automatic daily updates | Verify published production deploy, Scheduled badge, cron expression and plan/account usage limits. Preview deploys do not run schedules. |
| A run remains in progress | A hard process termination can interrupt status recording. After 12 minutes the UI marks it interrupted and a new run can acquire the expired lease. |
| Bookmarks missing on another device | Confirm both devices use the same Netlify project. Bookmarks are shared, not stored in the browser. |
| Blobs access error | Production must use Netlify Functions with automatic Blobs context. Do not run functions on a generic static host. Local testing uses `npm start`. |
| Public URL exposes sensitive research | This version has public read access. Add real user authentication before collecting confidential material. Admin authentication only protects mutations. |

## 9. Costs, scale and limitations

- GitHub and Netlify have free/paid tiers. Functions, background execution, bandwidth and Blobs storage/operations consume account allowances or credits. Check [Netlify pricing](https://www.netlify.com/pricing/) and your account's **Usage & billing** before launch; quotas/prices change, so no fixed free allowance is promised here.
- Netlify documents scheduled executions at 30 seconds and Background Functions at up to 15 minutes. This app uses a short dispatcher and bounded ingestion worker. See [scheduled functions](https://docs.netlify.com/build/functions/scheduled-functions/), [background functions](https://docs.netlify.com/build/functions/background-functions/) and [Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/).
- Google controls feed availability, coverage, freshness, ordering and item retention. RSS does not guarantee complete news coverage, old history or full article content. Publisher is the feed creator when supplied, otherwise the original article hostname. Mixed-language feeds retain their inventory designation; individual language is estimated from the dominant Arabic/Latin script in the supplied headline (or excerpt when no headline exists).
- A scheduled job collects what Google currently returns; it cannot recover older articles that disappeared before the first run.
- This is a small-team research archive: all article metadata is loaded for filtering, and synchronization currently reads/writes the archive. As it grows to tens of thousands of records, add server-side pagination/search, incremental writes and a relational index before performance or worker limits become a problem. No automated deletion is applied.
- Bookmarks are one shared owner-managed list, not personal accounts. There is no password recovery email, multiuser permissions, or full-dashboard access gate. Rotate ADMIN_PASSWORD **and SESSION_SECRET** to revoke all existing sessions. Sessions expire after eight hours. The API uses Netlify IP/domain rate limiting; local runtime behavior can differ.
- Production deployment, actual cloud persistence and daily scheduler execution must be verified in your own Netlify account. Local tests cannot prove account permissions, billing or tomorrow's scheduled run.

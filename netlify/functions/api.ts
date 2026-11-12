import { admin, cookie, equal, sameOrigin, dispatch } from "../../server/auth";
import { sources, validateInventory } from "../../server/sources";
import { store, read, list } from "../../server/storage";
import type { Article, SyncRun } from "../../src/types";
const json = (
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
export default async (req: Request, context: any) => {
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "snapshot";
    if (req.method === "GET" && action === "snapshot") {
      return json({
        articles: await list<Article>("article/"),
        sources: await sources(),
        run: await read<SyncRun | null>("sync-current", null),
        lastSuccess: await read("last-success", null),
        bookmarks: (await store().list({ prefix: "bookmark/" })).blobs.map(
          (b) => b.key.slice(9),
        ),
        admin: admin(req),
      });
    }
    if (req.method !== "POST")
      return json({ error: "Method not allowed" }, 405);
    if (!sameOrigin(req)) return json({ error: "Origin rejected" }, 403);
    const body = await req.json();
    if (action === "login") {
      const configured = process.env.ADMIN_PASSWORD;
      if (!configured || configured.length < 32)
        return json(
          { error: "Configure a 32+ character ADMIN_PASSWORD first." },
          503,
        );
      if (!equal(String(body.password || ""), configured))
        return json({ error: "Incorrect password" }, 401);
      return json({ ok: true }, 200, { "Set-Cookie": cookie(req) });
    }
    if (action === "logout")
      return json({ ok: true }, 200, {
        "Set-Cookie":
          "hub_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
      });
    if (!admin(req)) return json({ error: "Admin login required" }, 401);
    if (action === "import") {
      try {
        const feeds = validateInventory(body.feeds);
        if (!feeds.length) return json({ error: "Inventory is empty" }, 400);
        await store().setJSON("feed-inventory", feeds);
        return json({
          ok: true,
          message:
            feeds.length + " feeds imported. Run Refresh to collect articles.",
        });
      } catch {
        return json(
          {
            error:
              "Invalid inventory. Use the generated private/feeds.json file.",
          },
          400,
        );
      }
    }
    if (action === "refresh") {
      await dispatch();
      return json(
        {
          ok: true,
          message: "Refresh queued. Status will update when the worker starts.",
        },
        202,
      );
    }
    if (action === "source") {
      if (
        !(await sources()).some((s) => s.id === body.id) ||
        typeof body.enabled !== "boolean"
      )
        return json({ error: "Invalid source" }, 400);
      await store().setJSON(`enabled/${body.id}`, body.enabled);
      return json({ ok: true });
    }
    if (action === "bookmark") {
      if (
        !/^[a-f0-9]{64}$/.test(body.id) ||
        !(await read(`article/${body.id}`, null)) ||
        typeof body.saved !== "boolean"
      )
        return json({ error: "Invalid article" }, 400);
      if (body.saved)
        await store().setJSON(`bookmark/${body.id}`, {
          savedAt: new Date().toISOString(),
        });
      else await store().delete(`bookmark/${body.id}`);
      return json({ ok: true });
    }
    return json({ error: "Unknown action" }, 404);
  } catch (e) {
    console.error("API error", e instanceof Error ? e.name : "unknown");
    return json(
      {
        error:
          "Service unavailable. Check Netlify configuration and function logs.",
      },
      503,
    );
  }
};
export const config = {
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ["ip", "domain"] },
};

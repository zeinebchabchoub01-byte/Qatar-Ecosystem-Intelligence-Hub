import catalog from "./source-catalog.json";
import type { Feed, Source } from "../src/types";
import { read } from "./storage";
export function validateInventory(data: unknown): Feed[] {
  if (!Array.isArray(data) || data.length > 250)
    throw new Error("Inventory must contain no more than 250 feeds");
  const seen = new Set<string>(),
    ids = new Set<string>();
  return data
    .map((f: any) => {
      const url = new URL(f.url);
      if (
        url.protocol !== "https:" ||
        !/^www\.google\.com(\.qa)?$/.test(url.hostname) ||
        !/^\/alerts\/feeds\/\d+\/\d+$/.test(url.pathname)
      )
        throw new Error("Invalid Google Alerts URL");
      if (
        !/^[a-zA-Z0-9_-]{1,64}$/.test(f.id) ||
        !f.category ||
        !f.language ||
        !f.description ||
        !f.name ||
        !f.query
      )
        throw new Error("Incomplete feed configuration");
      return {
        id: f.id,
        name: String(f.name),
        category: String(f.category),
        query: String(f.query),
        description: String(f.description),
        language: String(f.language),
        url: url.href,
        enabled: true,
        configured: true,
      };
    })
    .filter((f: Feed) => {
      if (seen.has(f.url)) return false;
      if (ids.has(f.id)) throw new Error("Duplicate feed ID");
      seen.add(f.url);
      ids.add(f.id);
      return true;
    });
}
export function inventory(): Feed[] {
  const raw = process.env.RSS_FEEDS_JSON;
  return raw ? validateInventory(JSON.parse(raw)) : [];
}
export async function loadInventory(): Promise<Feed[]> {
  const saved = await read<Feed[] | null>("feed-inventory", null);
  return saved ? validateInventory(saved) : inventory();
}
export async function sources(): Promise<Source[]> {
  const feeds = await loadInventory();
  const known = new Map(feeds.map((f) => [f.id, f]));
  const all = feeds.length ? feeds : catalog;
  return Promise.all(
    all.map(async (f) => {
      const { url, ...safe } = { ...f, url: undefined } as any;
      return {
        ...safe,
        configured: known.has(f.id),
        enabled: await read(`enabled/${f.id}`, true),
        ...(await read(`status/${f.id}`, {})),
      };
    }),
  );
}
export async function enabledFeeds(): Promise<Feed[]> {
  const s = await sources();
  return (await loadInventory()).filter(
    (f) => s.find((x) => x.id === f.id)?.enabled,
  );
}

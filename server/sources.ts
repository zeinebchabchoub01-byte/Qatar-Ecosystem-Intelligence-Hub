import catalog from "./source-catalog.json";
import type { Feed, Source } from "../src/types";
import { read } from "./storage";
export const builtInFeeds: Feed[] = [
  {
    id: "falak-news",
    name: "Falak — The Newsroom",
    category: "The Newsroom",
    query: "Falak Qatar news",
    language: "English + Arabic",
    description: "Qatar startup, investment and innovation news from falak.qa",
    url: "https://www.falak.qa/blogs/news-12.atom",
    enabled: true,
    configured: true,
  },
  {
    id: "falak-knowledge-hub",
    name: "Falak — Knowledge Hub",
    category: "Knowledge Hub",
    query: "Falak Qatar knowledge hub",
    language: "English + Arabic",
    description:
      "Founder resources, SME support and ecosystem analysis from falak.qa",
    url: "https://www.falak.qa/blogs/knowledge-hub.atom",
    enabled: true,
    configured: true,
  },
];
builtInFeeds.push(
  {
    id: "falak-startups",
    name: "Falak — Startups’ Directory",
    category: "Startups’ Directory",
    query: "Falak startups ecosystem",
    language: "English + Arabic",
    description: "Startup profiles listed in Falak’s directory",
    url: "https://www.falak.qa/collections/startups-directory",
    enabled: true,
    configured: true,
  },
  {
    id: "falak-network",
    name: "Falak — Incubators and Accelerators Network",
    category: "Incubators and Accelerators Network",
    query: "Falak incubators and accelerators",
    language: "English + Arabic",
    description:
      "Falak’s network listings; reports a source error when the page has no network listings",
    url: "https://www.falak.qa/pages/qatar-business-incubators-and-accelerator-map",
    enabled: true,
    configured: true,
  },
  {
    id: "falak-reports",
    name: "Falak — Whitepapers & Reports",
    category: "Whitepapers & Reports",
    query: "Falak whitepapers and reports",
    language: "English + Arabic",
    description:
      "Whitepapers and reports listed by Falak, linking to the original report pages",
    url: "https://www.falak.qa/pages/whitepaper",
    enabled: true,
    configured: true,
  },
);
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
        builtInFeeds.some((builtIn) => builtIn.id === f.id) ||
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
  return [...(saved ? validateInventory(saved) : inventory()), ...builtInFeeds];
}
export async function sources(): Promise<Source[]> {
  const feeds = await loadInventory();
  const known = new Map(feeds.map((f) => [f.id, f]));
  const all =
    feeds.length > builtInFeeds.length ? feeds : [...catalog, ...builtInFeeds];
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

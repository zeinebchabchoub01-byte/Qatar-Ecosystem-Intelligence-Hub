import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
const path = process.argv[2];
if (!path)
  throw new Error('Usage: npm run inventory -- "path/to/inventory.txt"');
const lines = readFileSync(path, "utf8").split(/\r?\n/);
const seen = new Set<string>();
const feeds = lines.flatMap((line) => {
  const cells = line.split("\t");
  if (cells.length !== 5 || !cells[2].startsWith("https://")) return [];
  const [category, query, url, language, description] = cells;
  const u = new URL(url);
  if (
    !/^www\.google\.com(\.qa)?$/.test(u.hostname) ||
    !u.pathname.startsWith("/alerts/feeds/")
  )
    throw new Error("Unexpected feed host");
  if (seen.has(url)) return [];
  seen.add(url);
  return [
    {
      id: createHash("sha256").update(url).digest("hex").slice(0, 16),
      name: query,
      category,
      query,
      url,
      language,
      description,
    },
  ];
});
if (!feeds.length) throw new Error("No valid feeds");
mkdirSync("private", { recursive: true });
writeFileSync("private/feeds.json", JSON.stringify(feeds));
writeFileSync(
  "server/source-catalog.json",
  JSON.stringify(
    feeds.map(({ url, ...f }) => f),
    null,
    2,
  ),
);
console.log(
  `Imported ${feeds.length} unique feeds. Private URLs saved only to ignored private/feeds.json.`,
);

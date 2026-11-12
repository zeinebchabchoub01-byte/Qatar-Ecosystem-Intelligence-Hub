import { readFileSync, readdirSync, statSync } from "node:fs";
const files = (p: string): string[] =>
  readdirSync(p).flatMap((n) =>
    statSync(`${p}/${n}`).isDirectory() ? files(`${p}/${n}`) : [`${p}/${n}`],
  );
for (const path of files("dist")) {
  const s = readFileSync(path, "utf8");
  if (
    /alerts\/feeds\/\d+|RSS_FEEDS_JSON|ADMIN_PASSWORD|SESSION_SECRET|SYNC_SECRET/.test(
      s,
    )
  )
    throw new Error(`Private configuration leaked in ${path}`);
  for (const key of ["ADMIN_PASSWORD", "SESSION_SECRET", "SYNC_SECRET"])
    if (process.env[key] && s.includes(process.env[key]!))
      throw new Error(`Secret leaked in ${path}`);
}
console.log(
  "PASS: production bundle contains no RSS URLs, private configuration keys, or configured secrets.",
);

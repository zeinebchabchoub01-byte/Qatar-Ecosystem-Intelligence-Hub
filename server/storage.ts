import { getStore } from "@netlify/blobs";
export const store = () =>
  getStore({ name: "qatar-ecosystem-v1", consistency: "strong" });
export async function read<T>(key: string, fallback: T): Promise<T> {
  return ((await store().get(key, { type: "json" })) as T | null) ?? fallback;
}
export async function list<T>(prefix: string): Promise<T[]> {
  const { blobs } = await store().list({ prefix });
  const out: T[] = [];
  for (let i = 0; i < blobs.length; i += 20) {
    const batch = await Promise.all(
      blobs.slice(i, i + 20).map((b) => read<T | null>(b.key, null)),
    );
    for (const value of batch) if (value !== null) out.push(value as T);
  }
  return out;
}

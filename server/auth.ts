import { createHmac, timingSafeEqual } from "node:crypto";
export function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32)
    throw new Error("Configure SESSION_SECRET with 32+ characters");
  return s;
}
const sign = (v: string) =>
  createHmac("sha256", secret()).update(v).digest("hex");
export function cookie(req: Request) {
  const value = String(Date.now() + 8 * 60 * 60 * 1000);
  return `hub_session=${value}.${sign(value)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${new URL(req.url).protocol === "https:" ? "; Secure" : ""}`;
}
export function admin(req: Request) {
  const value = req.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)hub_session=([^;]+)/)?.[1];
  if (!value) return false;
  const [exp, sig] = value.split(".");
  return (
    Number(exp) > Date.now() &&
    Number(exp) < Date.now() + 9 * 60 * 60 * 1000 &&
    !!sig &&
    equal(sig, sign(exp))
  );
}
export function sameOrigin(req: Request) {
  return req.headers.get("origin") === new URL(req.url).origin;
}
export function workerAuth(req: Request) {
  const s = process.env.SYNC_SECRET;
  return (
    !!s &&
    s.length >= 32 &&
    equal(req.headers.get("authorization") || "", `Bearer ${s}`)
  );
}
export async function dispatch(eventRunId?: string, deploymentOrigin?: string) {
  // Use this deployment's worker, even when APP_URL still names an old site.
  const runtime = (
    globalThis as typeof globalThis & {
      Netlify?: { env: { get(name: string): string | undefined } };
    }
  ).Netlify?.env;
  const url =
    deploymentOrigin ||
    runtime?.get("DEPLOY_URL") ||
    runtime?.get("URL") ||
    process.env.APP_URL;
  const s = runtime?.get("SYNC_SECRET") || process.env.SYNC_SECRET;
  if (!url || !s || s.length < 32)
    throw new Error("Configure APP_URL and SYNC_SECRET");
  const target = new URL("/.netlify/functions/sync-background", url);
  if (
    target.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(target.hostname)
  )
    throw new Error("APP_URL must use HTTPS");
  const res = await fetch(target, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${s}`,
      "Content-Type": "application/json",
    },
    ...(eventRunId ? { body: JSON.stringify({ eventRunId }) } : {}),
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (res.status !== 202)
    throw new Error(`Worker dispatch rejected (${res.status})`);
}

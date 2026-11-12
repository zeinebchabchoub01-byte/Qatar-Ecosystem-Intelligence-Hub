/** Local-only harness. Production storage and execution are supplied by Netlify. */
import { createServer } from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createServer as createViteServer } from "vite";
import { BlobsServer } from "@netlify/blobs/server";
import { setEnvironmentContext } from "@netlify/blobs";
import api from "../netlify/functions/api";
import worker from "../netlify/functions/sync-background";
import scheduled from "../netlify/functions/daily-sync";
import { workerAuth } from "../server/auth";
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  if (!line || line.startsWith("#")) continue;
  const i = line.indexOf("=");
  if (i > 0 && !process.env[line.slice(0, i)])
    process.env[line.slice(0, i)] = line.slice(i + 1);
}
const blobs = new BlobsServer({
  directory: resolve(".netlify/local-blobs"),
  logger: () => {},
});
const { port } = await blobs.start();
setEnvironmentContext({
  siteID: "local-hub",
  token: "local-only",
  edgeURL: `http://localhost:${port}`,
  uncachedEdgeURL: `http://localhost:${port}`,
});
const vite = await createViteServer({
  server: { middlewareMode: true, hmr: { port: 24679 } },
  appType: "spa",
});
const server = createServer(async (req, res) => {
  if (!req.url?.startsWith("/.netlify/functions/"))
    return vite.middlewares(req, res, () => {
      res.statusCode = 404;
      res.end();
    });
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 250000) {
        res.writeHead(413);
        res.end();
        return;
      }
      chunks.push(chunk);
    }
    const request = new Request(`http://${req.headers.host}${req.url}`, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      ...(["GET", "HEAD"].includes(req.method || "GET")
        ? {}
        : { body: Buffer.concat(chunks) }),
    });
    let response: Response;
    const path = new URL(request.url).pathname;
    if (path.endsWith("/api")) response = await api(request, {});
    else if (path.endsWith("/sync-background")) {
      if (!workerAuth(request))
        response = new Response("Unauthorized", { status: 401 });
      else {
        response = new Response(null, { status: 202 });
        setImmediate(() =>
          worker(request).catch((e) => console.error("Worker failed:", e)),
        );
      }
    } else if (path.endsWith("/daily-sync")) {
      if (!workerAuth(request))
        response = new Response("Unauthorized", { status: 401 });
      else {
        await scheduled();
        response = new Response("Scheduled dispatcher invoked");
      }
    } else response = new Response("Not found", { status: 404 });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (e) {
    console.error(e);
    res.writeHead(500);
    res.end("Local service error");
  }
});
server.listen(8888, "localhost", () =>
  console.log(
    "Qatar Hub ready at http://localhost:8888 (real functions + official local Blobs emulator)",
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    server.close();
    await vite.close();
    await blobs.stop();
    process.exit(0);
  });

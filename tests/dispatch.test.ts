import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatch } from "../server/auth";

test("dispatch uses the deployed worker instead of a stale configured URL", async () => {
  const globals = globalThis as unknown as {
    Netlify?: { env: { get(name: string): string | undefined } };
  };
  const originalRuntime = globals.Netlify;
  const originalFetch = globalThis.fetch;
  const originalURL = process.env.APP_URL;
  process.env.APP_URL = "https://old-site.example";
  const values: Record<string, string> = {
    DEPLOY_URL: "https://current-deploy.example",
    URL: "https://published-site.example",
    SYNC_SECRET: "test-only-worker-secret-with-at-least-32-characters",
  };
  globals.Netlify = { env: { get: (name) => values[name] } };
  let status = 202;
  let expectedOrigin = values.DEPLOY_URL;
  globalThis.fetch = async (input, init) => {
    assert.equal(
      String(input),
      `${expectedOrigin}/.netlify/functions/sync-background`,
    );
    assert.equal(init?.method, "POST");
    assert.equal(init?.redirect, "error");
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      `Bearer ${values.SYNC_SECRET}`,
    );
    return new Response(null, { status });
  };
  try {
    await dispatch();
    delete values.DEPLOY_URL;
    expectedOrigin = values.URL;
    await dispatch();
    delete values.URL;
    expectedOrigin = process.env.APP_URL;
    await dispatch();
    status = 404;
    await assert.rejects(dispatch(), /Worker dispatch rejected \(404\)/);
    status = 200;
    await assert.rejects(dispatch(), /Worker dispatch rejected \(200\)/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalRuntime === undefined) delete globals.Netlify;
    else globals.Netlify = originalRuntime;
    if (originalURL === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = originalURL;
  }
});

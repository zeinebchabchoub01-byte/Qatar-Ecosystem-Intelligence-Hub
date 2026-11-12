import { randomUUID } from "node:crypto";
import { dispatch } from "./auth";
import { read, store } from "./storage";
import type { SyncRun } from "../src/types";

// Record dispatch separately from collection so an accepted job cannot look idle.
export async function queueSync() {
  const current = await read<SyncRun | null>("sync-current", null);
  const age = current ? Date.now() - Date.parse(current.startedAt) : Infinity;
  if (
    current &&
    !current.finishedAt &&
    ((current.status === "running" && age < 12 * 60_000) ||
      (current.status === "queued" && age < 2 * 60_000))
  )
    return;
  const run: SyncRun = {
    id: randomUUID(),
    startedAt: new Date().toISOString(),
    status: "queued",
    successful: 0,
    failed: 0,
    added: 0,
  };
  await store().setJSON("sync-current", run);
  try {
    await dispatch();
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    const message =
      /^(Configure APP_URL and SYNC_SECRET|APP_URL must use HTTPS|Worker dispatch rejected \(\d+\))$/.test(
        detail,
      )
        ? detail
        : "Could not reach the synchronization worker. Check the deployed sync-background function and try again.";
    // Do not overwrite a worker that started before the dispatch response timed out.
    const latest = await read<SyncRun | null>("sync-current", null);
    if (latest?.id !== run.id) return;
    await store().setJSON("sync-current", {
      ...run,
      status: "failed",
      finishedAt: new Date().toISOString(),
      error: message,
    });
    throw new Error(message);
  }
}

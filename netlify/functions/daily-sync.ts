import { dispatch } from "../../server/auth";
import { store } from "../../server/storage";
export default async () => {
  try {
    await dispatch();
  } catch (e) {
    await store().setJSON("sync-current", {
      id: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      status: "failed",
      successful: 0,
      failed: 0,
      added: 0,
      error: e instanceof Error ? e.message : "Dispatch failed",
    });
    throw e;
  }
};

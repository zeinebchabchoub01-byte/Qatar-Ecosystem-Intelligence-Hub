import type { DeploySucceededEvent } from "@netlify/functions";
import { queueSync } from "../../server/queue";

export default {
  async deploySucceeded({ deploy }: DeploySucceededEvent) {
    // Previews must not dispatch collection against the production worker.
    if (deploy.context !== "production" || !deploy.publishedAt) return;
    await queueSync();
  },
};

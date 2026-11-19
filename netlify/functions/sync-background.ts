import { workerAuth } from "../../server/auth";
import { synchronize } from "../../server/sync";
export default async (req: Request) => {
  if (!workerAuth(req)) return new Response("Unauthorized", { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.eventRunId === "string") {
    const { collectEvents } = await import("../../server/event-collection");
    await collectEvents(body.eventRunId);
    return;
  }
  await synchronize();
};
export const config = { background: true };

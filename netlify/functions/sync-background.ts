import { workerAuth } from "../../server/auth";
import { synchronize } from "../../server/sync";
export default async (req: Request) => {
  if (!workerAuth(req)) return new Response("Unauthorized", { status: 401 });
  await synchronize();
};
export const config = { background: true };

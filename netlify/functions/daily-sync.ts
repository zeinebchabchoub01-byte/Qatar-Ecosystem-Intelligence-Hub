import { queueSync } from "../../server/queue";
export default async () => {
  await queueSync();
};

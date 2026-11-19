import { asc } from "drizzle-orm";
import { database } from "../db/index.js";
import { events } from "../db/schema.js";
import type { QatarEvent } from "../src/types";

export async function saveEvents(items: QatarEvent[]) {
  if (!items.length) return;
  const db = database();
  // A transaction keeps a failed source from leaving a partly updated listing.
  await db.transaction(async (tx) => {
    for (const event of items) {
      const record = {
        id: event.id,
        startsOn: event.startsOn,
        endsOn: event.endsOn,
        sourceId: event.sourceId,
        details: event,
      };
      await tx
        .insert(events)
        .values(record)
        .onConflictDoUpdate({ target: events.id, set: record });
    }
  });
}
export async function loadEvents() {
  return (
    await database().select().from(events).orderBy(asc(events.startsOn))
  ).map((row) => row.details);
}

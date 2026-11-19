import { pgTable, text, jsonb } from "drizzle-orm/pg-core";
import type { QatarEvent } from "../src/types";

export const events = pgTable("qatar_events", {
  id: text().primaryKey(),
  startsOn: text("starts_on").notNull(),
  endsOn: text("ends_on").notNull(),
  sourceId: text("source_id").notNull(),
  details: jsonb().$type<QatarEvent>().notNull(),
});

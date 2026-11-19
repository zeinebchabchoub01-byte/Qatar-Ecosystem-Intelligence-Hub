import { pgTable, text, jsonb } from "drizzle-orm/pg-core";
import type { QatarEvent, EventCollection } from "../src/types";

export const events = pgTable("qatar_events", {
  id: text().primaryKey(),
  startsOn: text("starts_on").notNull(),
  endsOn: text("ends_on").notNull(),
  sourceId: text("source_id").notNull(),
  details: jsonb().$type<QatarEvent>().notNull(),
});

export const eventCollections = pgTable("event_collections", {
  id: text().primaryKey(),
  version: text().notNull(),
  expiresAt: text("expires_at").notNull(),
  details: jsonb().$type<EventCollection>().notNull(),
});

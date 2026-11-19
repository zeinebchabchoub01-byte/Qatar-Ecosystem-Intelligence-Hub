CREATE TABLE "qatar_events" (
	"id" text PRIMARY KEY,
	"starts_on" text NOT NULL,
	"ends_on" text NOT NULL,
	"source_id" text NOT NULL,
	"details" jsonb NOT NULL
);

CREATE TABLE "event_collections" (
	"id" text PRIMARY KEY,
	"version" text NOT NULL,
	"expires_at" text NOT NULL,
	"details" jsonb NOT NULL
);

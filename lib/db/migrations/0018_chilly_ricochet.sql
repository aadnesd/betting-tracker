CREATE TABLE IF NOT EXISTS "FootballMatch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp NOT NULL,
	"externalId" numeric(10, 0) NOT NULL,
	"homeTeam" text NOT NULL,
	"awayTeam" text NOT NULL,
	"competition" text NOT NULL,
	"competitionCode" varchar(10),
	"matchDate" timestamp NOT NULL,
	"status" varchar DEFAULT 'SCHEDULED' NOT NULL,
	"homeScore" numeric(3, 0),
	"awayScore" numeric(3, 0),
	"lastSyncedAt" timestamp NOT NULL,
	CONSTRAINT "FootballMatch_externalId_unique" UNIQUE("externalId")
);
--> statement-breakpoint
ALTER TABLE "MatchedBet" ADD COLUMN "matchId" uuid;
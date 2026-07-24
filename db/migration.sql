-- Jodi Crypto Scanner — full schema (better-auth + app tables)
-- Run this on a fresh Supabase (SQL editor) to set up the database.

CREATE TABLE IF NOT EXISTS "user" (
  "id" text NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "emailVerified" boolean NOT NULL,
  "image" text,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  UNIQUE ("email")
);

CREATE TABLE IF NOT EXISTS "account" (
  "id" text NOT NULL,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope" text,
  "password" text,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "session" (
  "id" text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "token" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL,
  PRIMARY KEY ("id"),
  UNIQUE ("token"),
  FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id" text NOT NULL,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "iv_history" (
  "user_id" text NOT NULL,
  "strategy_key" text NOT NULL,
  "t" bigint NOT NULL,
  "call_iv" double precision,
  "put_iv" double precision,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "strategy_key", "t")
);

CREATE TABLE IF NOT EXISTS "alert_history" (
  "id" text NOT NULL,
  "user_id" text NOT NULL,
  "created_at" bigint NOT NULL,
  "type" text,
  "message" text,
  "created_ts" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS alert_history_user_idx ON alert_history (user_id, created_at DESC);

-- Enable Row Level Security. The app connects as the "postgres" role via
-- DATABASE_URL (table owner), which bypasses RLS, so the app keeps working with
-- no policies; this only denies the public anon/PostgREST API. "user" MUST be
-- quoted (reserved keyword) — Supabase's auto "enable RLS" option gets this wrong.
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "verification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "iv_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "alert_history" ENABLE ROW LEVEL SECURITY;

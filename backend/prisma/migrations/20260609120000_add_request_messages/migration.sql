CREATE TABLE IF NOT EXISTS "request_messages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "request_id" UUID NOT NULL,
  "sender_profile_id" UUID,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "request_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_request_messages_request_created"
  ON "request_messages"("request_id", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'request_messages_request_id_fkey'
  ) THEN
    ALTER TABLE "request_messages"
      ADD CONSTRAINT "request_messages_request_id_fkey"
      FOREIGN KEY ("request_id") REFERENCES "requests"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'request_messages_sender_profile_id_fkey'
  ) THEN
    ALTER TABLE "request_messages"
      ADD CONSTRAINT "request_messages_sender_profile_id_fkey"
      FOREIGN KEY ("sender_profile_id") REFERENCES "profiles"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

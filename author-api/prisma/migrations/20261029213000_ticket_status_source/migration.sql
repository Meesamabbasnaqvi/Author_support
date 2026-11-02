-- Add provenance tracking for status changes.
ALTER TABLE "Ticket"
ADD COLUMN "statusSource" "FieldSource" NOT NULL DEFAULT 'DEFAULT';

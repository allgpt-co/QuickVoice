-- Persist user-safe knowledge processing failures so the console can explain
-- why a source failed and what the user can do next.
ALTER TABLE "KnowledgeSource"
  ADD COLUMN "errorCode" TEXT,
  ADD COLUMN "errorMessage" TEXT,
  ADD COLUMN "errorRetryable" BOOLEAN;

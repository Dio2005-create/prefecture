BEGIN;

CREATE TABLE "ChatConversation" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "titre" TEXT NOT NULL DEFAULT 'Nouvelle discussion',
  "utilisateurId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RequeteUtilisateur" ADD COLUMN "conversationId" TEXT;

WITH legacy AS MATERIALIZED (
  SELECT
    "id" AS "messageId",
    gen_random_uuid()::text AS "conversationId",
    "utilisateurId",
    LEFT(COALESCE(NULLIF(BTRIM(regexp_replace("texte", '\s+', ' ', 'g')), ''), 'Discussion'), 80) AS "titre",
    "date" AS "createdAt"
  FROM "RequeteUtilisateur"
  WHERE "utilisateurId" IS NOT NULL
), created AS (
  INSERT INTO "ChatConversation" ("id", "titre", "utilisateurId", "createdAt", "updatedAt")
  SELECT "conversationId", "titre", "utilisateurId", "createdAt", "createdAt"
  FROM legacy
  RETURNING "id"
)
UPDATE "RequeteUtilisateur" AS message
SET "conversationId" = legacy."conversationId"
FROM legacy
JOIN created ON created."id" = legacy."conversationId"
WHERE message."id" = legacy."messageId";

ALTER TABLE "ChatConversation"
  ADD CONSTRAINT "ChatConversation_utilisateurId_fkey"
  FOREIGN KEY ("utilisateurId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RequeteUtilisateur"
  ADD CONSTRAINT "RequeteUtilisateur_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ChatConversation_utilisateurId_updatedAt_idx" ON "ChatConversation"("utilisateurId", "updatedAt");
CREATE INDEX "RequeteUtilisateur_conversationId_date_idx" ON "RequeteUtilisateur"("conversationId", "date");

COMMIT;
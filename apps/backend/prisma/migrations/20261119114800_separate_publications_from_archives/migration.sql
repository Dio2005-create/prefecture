ALTER TABLE "DocumentAdministratif"
ADD COLUMN "isPublication" BOOLEAN NOT NULL DEFAULT false;

UPDATE "DocumentAdministratif"
SET "isPublication" = true
WHERE "type" IN ('ARRETE'::"TypeDocument", 'COURRIER'::"TypeDocument")
  AND "statut" IN ('VALIDE'::"StatutDocument", 'ARCHIVE'::"StatutDocument");

CREATE INDEX "DocumentAdministratif_isPublication_idx"
ON "DocumentAdministratif"("isPublication");

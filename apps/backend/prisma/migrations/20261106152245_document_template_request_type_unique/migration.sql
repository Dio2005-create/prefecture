WITH ranked_templates AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "requestType"
            ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC
        ) AS duplicate_rank
    FROM "DocumentTemplate"
)
DELETE FROM "DocumentTemplate"
WHERE "id" IN (
    SELECT "id"
    FROM ranked_templates
    WHERE duplicate_rank > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS "DocumentTemplate_requestType_key"
ON "DocumentTemplate"("requestType");

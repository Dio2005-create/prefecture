ALTER TABLE "Appointment" ADD COLUMN "ticketReference" TEXT;

WITH ranked_appointments AS (
  SELECT
    "id",
    ("startsAt" + INTERVAL '3 hours')::date AS "localDate",
    ROW_NUMBER() OVER (
      PARTITION BY ("startsAt" + INTERVAL '3 hours')::date
      ORDER BY "createdAt", "id"
    ) AS "dailySequence"
  FROM "Appointment"
)
UPDATE "Appointment" AS appointment
SET "ticketReference" = 'RDV-' || LPAD(ranked."dailySequence"::text, 3, '0')
  || '-' || EXTRACT(DAY FROM ranked."localDate")::integer::text
FROM ranked_appointments AS ranked
WHERE appointment."id" = ranked."id";

CREATE INDEX "Appointment_ticketReference_idx" ON "Appointment"("ticketReference");

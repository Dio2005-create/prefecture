CREATE TABLE "AppointmentAvailability" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "slotDurationMinutes" INTEGER NOT NULL,
    "breakStart" TEXT,
    "breakEnd" TEXT,
    "office" TEXT NOT NULL DEFAULT 'Guichet général',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppointmentAvailability_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AppointmentAvailability_slotDurationMinutes_check" CHECK ("slotDurationMinutes" > 0),
    CONSTRAINT "AppointmentAvailability_break_check" CHECK (("breakStart" IS NULL) = ("breakEnd" IS NULL))
);

CREATE UNIQUE INDEX "AppointmentAvailability_date_key" ON "AppointmentAvailability"("date");

ALTER TABLE "AppointmentSlot" ADD COLUMN "availabilityId" TEXT;

CREATE INDEX "AppointmentSlot_availabilityId_startsAt_isActive_idx"
ON "AppointmentSlot"("availabilityId", "startsAt", "isActive");

ALTER TABLE "AppointmentSlot"
ADD CONSTRAINT "AppointmentSlot_availabilityId_fkey"
FOREIGN KEY ("availabilityId") REFERENCES "AppointmentAvailability"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "AppointmentSlot" (
    "id" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "office" TEXT NOT NULL DEFAULT 'Guichet général',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppointmentSlot_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Appointment" ADD COLUMN "slotId" TEXT;

CREATE UNIQUE INDEX "AppointmentSlot_startsAt_endsAt_key" ON "AppointmentSlot"("startsAt", "endsAt");
CREATE INDEX "AppointmentSlot_startsAt_isActive_idx" ON "AppointmentSlot"("startsAt", "isActive");
CREATE INDEX "Appointment_slotId_status_idx" ON "Appointment"("slotId", "status");

ALTER TABLE "Appointment"
ADD CONSTRAINT "Appointment_slotId_fkey"
FOREIGN KEY ("slotId") REFERENCES "AppointmentSlot"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

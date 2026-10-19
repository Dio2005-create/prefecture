CREATE TYPE "FirearmRequestType" AS ENUM (
  'HOLDING_PERMIT',
  'CARRY_PERMIT',
  'REGISTER_FIREARM',
  'RENEW_PERMIT',
  'DEREGISTER_FIREARM',
  'TRANSFER_FIREARM'
);

CREATE TYPE "FirearmRequestStatus" AS ENUM (
  'PENDING',
  'IN_REVIEW',
  'NEEDS_INFO',
  'APPROVED',
  'REJECTED',
  'CANCELLED'
);

CREATE TYPE "FirearmPermitType" AS ENUM ('HOLDING', 'CARRY');
CREATE TYPE "FirearmPermitStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'REPLACED');

CREATE TABLE "Firearm" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "weaponType" TEXT NOT NULL,
  "brand" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "serialNumber" TEXT NOT NULL,
  "caliber" TEXT,
  "acquiredAt" DATE NOT NULL,
  "origin" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Firearm_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FirearmRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "firearmId" TEXT,
  "type" "FirearmRequestType" NOT NULL,
  "status" "FirearmRequestStatus" NOT NULL DEFAULT 'PENDING',
  "data" JSONB NOT NULL DEFAULT '{}',
  "decisionComment" TEXT,
  "decidedById" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FirearmRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FirearmRequestAttachment" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "mimeType" TEXT,
  "size" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FirearmRequestAttachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FirearmPermit" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "firearmId" TEXT,
  "requestId" TEXT NOT NULL,
  "type" "FirearmPermitType" NOT NULL,
  "status" "FirearmPermitStatus" NOT NULL DEFAULT 'ACTIVE',
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "reminderSentAt" TIMESTAMP(3),
  "renewedFromId" TEXT,
  CONSTRAINT "FirearmPermit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FirearmControlHistory" (
  "id" TEXT NOT NULL,
  "firearmId" TEXT,
  "requestId" TEXT,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "details" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FirearmControlHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Firearm_serialNumber_key" ON "Firearm"("serialNumber");
CREATE INDEX "Firearm_ownerId_isActive_idx" ON "Firearm"("ownerId", "isActive");
CREATE INDEX "Firearm_serialNumber_idx" ON "Firearm"("serialNumber");
CREATE INDEX "FirearmRequest_userId_createdAt_idx" ON "FirearmRequest"("userId", "createdAt");
CREATE INDEX "FirearmRequest_status_createdAt_idx" ON "FirearmRequest"("status", "createdAt");
CREATE INDEX "FirearmRequest_firearmId_idx" ON "FirearmRequest"("firearmId");
CREATE INDEX "FirearmRequestAttachment_requestId_idx" ON "FirearmRequestAttachment"("requestId");
CREATE UNIQUE INDEX "FirearmPermit_requestId_key" ON "FirearmPermit"("requestId");
CREATE INDEX "FirearmPermit_userId_status_expiresAt_idx" ON "FirearmPermit"("userId", "status", "expiresAt");
CREATE INDEX "FirearmPermit_firearmId_idx" ON "FirearmPermit"("firearmId");
CREATE INDEX "FirearmControlHistory_firearmId_createdAt_idx" ON "FirearmControlHistory"("firearmId", "createdAt");
CREATE INDEX "FirearmControlHistory_requestId_createdAt_idx" ON "FirearmControlHistory"("requestId", "createdAt");
CREATE INDEX "FirearmControlHistory_actorId_createdAt_idx" ON "FirearmControlHistory"("actorId", "createdAt");

ALTER TABLE "Firearm" ADD CONSTRAINT "Firearm_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FirearmRequest" ADD CONSTRAINT "FirearmRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FirearmRequest" ADD CONSTRAINT "FirearmRequest_firearmId_fkey"
  FOREIGN KEY ("firearmId") REFERENCES "Firearm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FirearmRequest" ADD CONSTRAINT "FirearmRequest_decidedById_fkey"
  FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FirearmRequestAttachment" ADD CONSTRAINT "FirearmRequestAttachment_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "FirearmRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FirearmPermit" ADD CONSTRAINT "FirearmPermit_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FirearmPermit" ADD CONSTRAINT "FirearmPermit_firearmId_fkey"
  FOREIGN KEY ("firearmId") REFERENCES "Firearm"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FirearmPermit" ADD CONSTRAINT "FirearmPermit_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "FirearmRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FirearmPermit" ADD CONSTRAINT "FirearmPermit_renewedFromId_fkey"
  FOREIGN KEY ("renewedFromId") REFERENCES "FirearmPermit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FirearmControlHistory" ADD CONSTRAINT "FirearmControlHistory_firearmId_fkey"
  FOREIGN KEY ("firearmId") REFERENCES "Firearm"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FirearmControlHistory" ADD CONSTRAINT "FirearmControlHistory_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "FirearmRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FirearmControlHistory" ADD CONSTRAINT "FirearmControlHistory_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

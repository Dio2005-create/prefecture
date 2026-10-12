ALTER TYPE "UserStatus" RENAME VALUE 'INACTIVE' TO 'DISABLED';
ALTER TYPE "UserStatus" ADD VALUE 'REACTIVATION_REQUESTED';
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

CREATE TYPE "ReactivationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "CitizenComplaintStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'RESOLVED', 'REJECTED');

CREATE TABLE "AccountReactivationRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT,
    "status" "ReactivationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AccountReactivationRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PasswordResetOtp" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetOtp_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CitizenComplaint" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentRequestId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" "CitizenComplaintStatus" NOT NULL DEFAULT 'PENDING',
    "adminResponse" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CitizenComplaint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComplaintAttachment" (
    "id" TEXT NOT NULL,
    "complaintId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ComplaintAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccountReactivationRequest_status_createdAt_idx" ON "AccountReactivationRequest"("status", "createdAt");
CREATE INDEX "AccountReactivationRequest_userId_status_idx" ON "AccountReactivationRequest"("userId", "status");
CREATE INDEX "PasswordResetOtp_userId_createdAt_idx" ON "PasswordResetOtp"("userId", "createdAt");
CREATE INDEX "PasswordResetOtp_expiresAt_idx" ON "PasswordResetOtp"("expiresAt");
CREATE INDEX "CitizenComplaint_status_createdAt_idx" ON "CitizenComplaint"("status", "createdAt");
CREATE INDEX "CitizenComplaint_userId_createdAt_idx" ON "CitizenComplaint"("userId", "createdAt");
CREATE INDEX "ComplaintAttachment_complaintId_idx" ON "ComplaintAttachment"("complaintId");

ALTER TABLE "AccountReactivationRequest" ADD CONSTRAINT "AccountReactivationRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountReactivationRequest" ADD CONSTRAINT "AccountReactivationRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PasswordResetOtp" ADD CONSTRAINT "PasswordResetOtp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CitizenComplaint" ADD CONSTRAINT "CitizenComplaint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CitizenComplaint" ADD CONSTRAINT "CitizenComplaint_documentRequestId_fkey" FOREIGN KEY ("documentRequestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComplaintAttachment" ADD CONSTRAINT "ComplaintAttachment_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "CitizenComplaint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

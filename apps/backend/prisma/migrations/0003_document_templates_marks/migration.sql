CREATE TABLE "DocumentTemplate" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "requestType" "RequestType" NOT NULL,
    "name" TEXT NOT NULL,
    "bodyText" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OfficialMark" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OfficialMark_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentTemplate_requestType_key" ON "DocumentTemplate"("requestType");
CREATE INDEX "OfficialMark_kind_isActive_idx" ON "OfficialMark"("kind", "isActive");
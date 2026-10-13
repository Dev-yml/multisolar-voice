-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN     "nextCallAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Call" ADD COLUMN     "answeredAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Lead_nextCallAt_idx" ON "Lead"("nextCallAt");


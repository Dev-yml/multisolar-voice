-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mfaEnabledAt" TIMESTAMP(3),
ADD COLUMN     "mfaLastStep" INTEGER,
ADD COLUMN     "mfaRecovery" JSONB,
ADD COLUMN     "mfaSecret" VARCHAR(200),
ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;


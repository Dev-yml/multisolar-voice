-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'SALES_ADMIN', 'SALES_EXECUTIVE', 'SUPPORT');

-- CreateEnum
CREATE TYPE "Segment" AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'INTERESTED', 'SITE_VISIT', 'NOT_INTERESTED', 'WON', 'LOST', 'DNC');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "Outcome" AS ENUM ('SITE_VISIT_BOOKED', 'INTERESTED', 'CALLBACK', 'NOT_INTERESTED', 'ESCALATED', 'DNC', 'WRONG_NUMBER', 'COMPLETED', 'NO_ANSWER', 'BUSY', 'FAILED');

-- CreateEnum
CREATE TYPE "Speaker" AS ENUM ('AGENT', 'CUSTOMER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "EscalationStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('BOOKED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DocStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(190) NOT NULL,
    "passwordHash" VARCHAR(100) NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'SALES_EXECUTIVE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(120),
    "phone" VARCHAR(20) NOT NULL,
    "city" VARCHAR(80),
    "pincode" VARCHAR(6),
    "segment" "Segment",
    "monthlyBill" INTEGER,
    "language" VARCHAR(2),
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "source" VARCHAR(40) NOT NULL DEFAULT 'manual',
    "consentAt" TIMESTAMP(3),
    "notes" TEXT,
    "assignedToId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Call" (
    "id" SERIAL NOT NULL,
    "direction" "Direction" NOT NULL,
    "fromNumber" VARCHAR(20),
    "toNumber" VARCHAR(20),
    "leadId" INTEGER,
    "providerCallId" VARCHAR(80),
    "providerRefId" VARCHAR(80),
    "language" VARCHAR(2) NOT NULL DEFAULT 'en',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER,
    "outcome" "Outcome",
    "summary" TEXT,
    "recordingUrl" VARCHAR(500),
    "costPaise" INTEGER,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "state" JSONB,

    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallTurn" (
    "id" SERIAL NOT NULL,
    "callId" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "speaker" "Speaker" NOT NULL,
    "text" TEXT NOT NULL,
    "language" VARCHAR(2),
    "tool" VARCHAR(40),
    "toolData" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Escalation" (
    "id" SERIAL NOT NULL,
    "callId" INTEGER,
    "leadId" INTEGER,
    "reason" VARCHAR(30) NOT NULL,
    "question" TEXT NOT NULL,
    "status" "EscalationStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToId" INTEGER,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Escalation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteVisit" (
    "id" SERIAL NOT NULL,
    "leadId" INTEGER,
    "callId" INTEGER,
    "date" DATE NOT NULL,
    "slot" VARCHAR(12) NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "status" "VisitStatus" NOT NULL DEFAULT 'BOOKED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Callback" (
    "id" SERIAL NOT NULL,
    "leadId" INTEGER,
    "callId" INTEGER,
    "date" DATE NOT NULL,
    "slot" VARCHAR(12),
    "label" VARCHAR(80) NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Callback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoNotCall" (
    "phone" VARCHAR(20) NOT NULL,
    "reason" VARCHAR(120) NOT NULL DEFAULT 'customer request',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoNotCall_pkey" PRIMARY KEY ("phone")
);

-- CreateTable
CREATE TABLE "PriceRow" (
    "id" SERIAL NOT NULL,
    "segment" "Segment" NOT NULL,
    "kw" DOUBLE PRECISION NOT NULL,
    "priceMin" INTEGER NOT NULL,
    "priceMax" INTEGER NOT NULL,
    "includesGst" BOOLEAN NOT NULL DEFAULT true,
    "sample" BOOLEAN NOT NULL DEFAULT true,
    "note" VARCHAR(200),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SizingRow" (
    "id" SERIAL NOT NULL,
    "kw" DOUBLE PRECISION NOT NULL,
    "billMin" INTEGER NOT NULL,
    "billMax" INTEGER NOT NULL,
    "roofSqftMin" INTEGER NOT NULL,
    "roofSqftMax" INTEGER NOT NULL,
    "unitsMin" INTEGER NOT NULL,
    "unitsMax" INTEGER NOT NULL,

    CONSTRAINT "SizingRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubsidyRule" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "scope" VARCHAR(10) NOT NULL,
    "state" VARCHAR(40),
    "segment" "Segment" NOT NULL DEFAULT 'RESIDENTIAL',
    "perKwFirst" INTEGER NOT NULL,
    "firstKw" DOUBLE PRECISION NOT NULL,
    "perKwNext" INTEGER NOT NULL DEFAULT 0,
    "nextKw" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cap" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source" VARCHAR(300),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubsidyRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeDocument" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "category" VARCHAR(40) NOT NULL,
    "version" VARCHAR(40) NOT NULL,
    "status" "DocStatus" NOT NULL DEFAULT 'ACTIVE',
    "fileName" VARCHAR(200),
    "uploadedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeChunk" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "heading" VARCHAR(200),
    "text" TEXT NOT NULL,

    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "agentName" VARCHAR(80) NOT NULL DEFAULT 'Multi Solar Voice Agent',
    "voice" VARCHAR(10) NOT NULL DEFAULT 'female',
    "startLanguage" VARCHAR(2) NOT NULL DEFAULT 'en',
    "callingStart" VARCHAR(5) NOT NULL DEFAULT '09:00',
    "callingEnd" VARCHAR(5) NOT NULL DEFAULT '21:00',
    "escalationHours" INTEGER NOT NULL DEFAULT 48,
    "transferNumber" VARCHAR(20),
    "monthlyBudget" INTEGER NOT NULL DEFAULT 15000,
    "outboundEnabled" BOOLEAN NOT NULL DEFAULT false,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "retryGapMinutes" INTEGER NOT NULL DEFAULT 240,
    "maxConcurrent" INTEGER NOT NULL DEFAULT 3,

    CONSTRAINT "AgentSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "action" VARCHAR(60) NOT NULL,
    "entity" VARCHAR(40),
    "entityId" VARCHAR(40),
    "detail" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_phone_key" ON "Lead"("phone");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Call_providerCallId_key" ON "Call"("providerCallId");

-- CreateIndex
CREATE INDEX "Call_startedAt_idx" ON "Call"("startedAt");

-- CreateIndex
CREATE INDEX "Call_outcome_idx" ON "Call"("outcome");

-- CreateIndex
CREATE INDEX "CallTurn_callId_seq_idx" ON "CallTurn"("callId", "seq");

-- CreateIndex
CREATE INDEX "Escalation_status_dueAt_idx" ON "Escalation"("status", "dueAt");

-- CreateIndex
CREATE INDEX "SiteVisit_date_idx" ON "SiteVisit"("date");

-- CreateIndex
CREATE UNIQUE INDEX "PriceRow_segment_kw_key" ON "PriceRow"("segment", "kw");

-- CreateIndex
CREATE UNIQUE INDEX "SizingRow_kw_key" ON "SizingRow"("kw");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_documentId_ordinal_idx" ON "KnowledgeChunk"("documentId", "ordinal");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallTurn" ADD CONSTRAINT "CallTurn_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteVisit" ADD CONSTRAINT "SiteVisit_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteVisit" ADD CONSTRAINT "SiteVisit_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Security: Supabase exposes the public schema through its REST API. This app talks to the
-- database only through Prisma (table owner), so switch RLS on everywhere with no policies:
-- the API keys (anon / authenticated) can read or write nothing.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Lead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Call" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CallTurn" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Escalation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SiteVisit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Callback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DoNotCall" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PriceRow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SizingRow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubsidyRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KnowledgeDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KnowledgeChunk" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = '_prisma_migrations') THEN
    EXECUTE 'ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated';
  END IF;
END $$;

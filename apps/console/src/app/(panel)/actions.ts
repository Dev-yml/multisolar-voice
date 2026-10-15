"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth/guard";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/auth/session";
import { decryptSecret, hashRecovery, newRecoveryCodes, verifyCode } from "@/lib/auth/totp";
import { CLAUDE_MODELS, TTS_MODELS } from "@/lib/calls";
import { prisma } from "@/lib/db";
import { ingestFile, ingestText, invalidateKnowledge } from "@/lib/knowledge";
import { ADMINS, MANAGERS, ROLES, SALES } from "@/lib/roles";
import { normalizePhone } from "@/lib/util";
import { dialLead, voiceServerConfigured } from "@/lib/voice-server";

export type ActionState = { ok?: string; error?: string; at?: number } | undefined;

const ok = (msg: string): ActionState => ({ ok: msg, at: Date.now() });
const fail = (msg: string): ActionState => ({ error: msg, at: Date.now() });
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => Number(str(fd, k));

async function audit(userId: number, action: string, entity?: string, entityId?: string | number, detail?: Prisma.InputJsonValue) {
  await prisma.auditLog.create({ data: { userId, action, entity, entityId: entityId === undefined ? undefined : String(entityId), detail } });
}

// --- Leads ---------------------------------------------------------------------

const SEGMENTS = ["RESIDENTIAL", "COMMERCIAL", "INDUSTRIAL"] as const;

export async function addLead(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(SALES);
  const phone = normalizePhone(str(fd, "phone"));
  if (!phone) return fail("Enter a valid 10-digit Indian mobile number.");
  const segment = SEGMENTS.find((s) => s === str(fd, "segment"));
  const bill = num(fd, "monthlyBill");
  const consent = fd.get("consent") === "on";
  const exists = await prisma.lead.findUnique({ where: { phone } });
  if (exists) return fail("A lead with this number already exists.");
  const lead = await prisma.lead.create({
    data: {
      phone,
      name: str(fd, "name").slice(0, 120) || null,
      city: str(fd, "city").slice(0, 80) || null,
      segment: segment ?? null,
      monthlyBill: bill > 0 ? Math.round(bill) : null,
      source: "manual",
      consentAt: consent ? new Date() : null,
    },
  });
  await audit(user.id, "lead.create", "Lead", lead.id);
  revalidatePath("/leads");
  return ok("Lead added.");
}

/** CSV with a header row: name, phone, city, segment, monthly_bill, consent (yes/no). */
export async function importLeads(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(SALES);
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Choose a CSV file.");
  if (file.size > 2_000_000) return fail("CSV is too large (max 2 MB).");
  const lines = (await file.text()).split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return fail("The CSV needs a header row and at least one lead.");
  const split = (l: string) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  const head = split(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  const col = (row: string[], name: string) => row[head.indexOf(name)] ?? "";
  if (!head.includes("phone")) return fail('The header row must include a "phone" column.');
  let added = 0;
  let skipped = 0;
  for (const line of lines.slice(1, 5001)) {
    const row = split(line);
    const phone = normalizePhone(col(row, "phone"));
    if (!phone) { skipped++; continue; }
    const seg = col(row, "segment").toUpperCase();
    const bill = Number(col(row, "monthly_bill").replace(/[^\d.]/g, ""));
    if (await prisma.lead.findUnique({ where: { phone }, select: { id: true } })) { skipped++; continue; }
    await prisma.lead.create({
      data: {
        phone,
        name: col(row, "name").slice(0, 120) || null,
        city: col(row, "city").slice(0, 80) || null,
        segment: SEGMENTS.find((s) => s === seg) ?? null,
        monthlyBill: bill > 0 ? Math.round(bill) : null,
        source: "csv",
        consentAt: /^(y|yes|true|1)$/i.test(col(row, "consent")) ? new Date() : null,
      },
    });
    added++;
  }
  await audit(user.id, "lead.import", "Lead", undefined, { added, skipped });
  revalidatePath("/leads");
  return ok(`Imported ${added} new lead${added === 1 ? "" : "s"}${skipped ? `, skipped ${skipped} (duplicate or invalid number)` : ""}.`);
}

export async function updateLead(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(SALES);
  const id = num(fd, "id");
  const status = z.enum(["NEW", "CONTACTED", "INTERESTED", "SITE_VISIT", "NOT_INTERESTED", "WON", "LOST", "DNC"]).safeParse(str(fd, "status"));
  if (!status.success) return fail("Choose a valid status.");
  const lead = await prisma.lead.update({ where: { id }, data: { status: status.data, notes: str(fd, "notes").slice(0, 5000) || null } });
  if (status.data === "DNC") await prisma.doNotCall.upsert({ where: { phone: lead.phone }, update: {}, create: { phone: lead.phone, reason: "marked by staff" } });
  await audit(user.id, "lead.update", "Lead", id, { status: status.data });
  revalidatePath("/leads");
  return ok("Saved.");
}

/** "Call now": asks the Voice Agent server to dial this lead immediately (consent, DNC and hours still apply). */
export async function callNow(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(SALES);
  if (!voiceServerConfigured()) return fail("The voice server is not connected yet (VOICE_SERVER_URL).");
  const id = num(fd, "id");
  const r = await dialLead(id);
  if (!r) return fail("Could not reach the voice server.");
  if (!r.ok) return fail(r.message ?? "Could not start the call.");
  await audit(user.id, "lead.call_now", "Lead", id);
  revalidatePath("/calls");
  return ok("Calling… the phone will ring in a few seconds.");
}

// --- Escalations ---------------------------------------------------------------

export async function updateEscalation(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(SALES);
  const id = num(fd, "id");
  const status = z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]).safeParse(str(fd, "status"));
  if (!status.success) return fail("Choose a valid status.");
  const resolution = str(fd, "resolution").slice(0, 5000);
  if (status.data === "RESOLVED" && !resolution) return fail("Write what the customer was told before resolving.");
  const assignee = str(fd, "assignedToId");
  const esc = await prisma.escalation.update({
    where: { id },
    data: {
      status: status.data,
      resolution: resolution || null,
      resolvedAt: status.data === "RESOLVED" ? new Date() : null,
      assignedToId: assignee ? Number(assignee) : null,
    },
  });
  // Teach the agent: the answer becomes part of the knowledge base.
  if (status.data === "RESOLVED" && fd.get("addToKnowledge") === "on") {
    await ingestText({ title: `Sales answer: ${esc.question.slice(0, 80)}`, category: "faq", version: new Date().toISOString().slice(0, 10), text: `${esc.question}\n\n${resolution}`, userId: user.id });
  }
  await audit(user.id, "escalation.update", "Escalation", id, { status: status.data });
  revalidatePath("/escalations");
  return ok("Saved.");
}

// --- Knowledge -----------------------------------------------------------------

export async function uploadKnowledge(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(MANAGERS);
  const file = fd.get("file");
  const text = str(fd, "text");
  const title = str(fd, "title").slice(0, 200);
  const category = str(fd, "category") || "general";
  const version = str(fd, "version").slice(0, 40) || new Date().toISOString().slice(0, 10);
  if (!title) return fail("Give the document a title.");
  try {
    let doc;
    if (file instanceof File && file.size > 0) {
      if (file.size > 10_000_000) return fail("File is too large (max 10 MB).");
      doc = await ingestFile(file, { title, category, version, userId: user.id });
    } else if (text) {
      doc = await ingestText({ title, category, version, text, userId: user.id });
    } else return fail("Choose a file or paste some text.");
    await audit(user.id, "knowledge.add", "KnowledgeDocument", doc.id);
    revalidatePath("/knowledge");
    return ok(`Added "${doc.title}" (${doc._count.chunks} passages). The agent can use it now.`);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not read this file.");
  }
}

export async function setDocumentStatus(fd: FormData) {
  const user = await requireUser(MANAGERS);
  const id = num(fd, "id");
  const status = str(fd, "status") === "ARCHIVED" ? "ARCHIVED" : "ACTIVE";
  await prisma.knowledgeDocument.update({ where: { id }, data: { status } });
  invalidateKnowledge();
  await audit(user.id, "knowledge.status", "KnowledgeDocument", id, { status });
  revalidatePath("/knowledge");
}

// --- Prices, sizing and subsidy -----------------------------------------------------

export async function savePrice(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(MANAGERS);
  const segment = SEGMENTS.find((s) => s === str(fd, "segment"));
  const kw = num(fd, "kw");
  const priceMin = num(fd, "priceMin");
  const priceMax = num(fd, "priceMax");
  if (!segment || !(kw > 0) || !(priceMin > 0) || priceMax < priceMin) return fail("Check the size and price range.");
  const data = { priceMin: Math.round(priceMin), priceMax: Math.round(priceMax), includesGst: fd.get("includesGst") === "on", sample: fd.get("sample") === "on", note: str(fd, "note").slice(0, 200) || null };
  await prisma.priceRow.upsert({ where: { segment_kw: { segment, kw } }, update: data, create: { segment, kw, ...data } });
  await audit(user.id, "price.save", "PriceRow", `${segment}:${kw}`, data);
  revalidatePath("/pricing");
  return ok(`Saved ${kw} kW.`);
}

export async function deletePrice(fd: FormData) {
  const user = await requireUser(MANAGERS);
  const id = num(fd, "id");
  await prisma.priceRow.delete({ where: { id } });
  await audit(user.id, "price.delete", "PriceRow", id);
  revalidatePath("/pricing");
}

export async function saveSizing(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(MANAGERS);
  const vals = ["kw", "billMin", "billMax", "roofSqftMin", "roofSqftMax", "unitsMin", "unitsMax"].map((k) => num(fd, k));
  if (vals.some((v) => !(v > 0)) || vals[2] < vals[1]) return fail("All numbers must be positive and the bill range valid.");
  const [kw, billMin, billMax, roofSqftMin, roofSqftMax, unitsMin, unitsMax] = vals;
  const data = { billMin, billMax, roofSqftMin, roofSqftMax, unitsMin, unitsMax };
  await prisma.sizingRow.upsert({ where: { kw }, update: data, create: { kw, ...data } });
  await audit(user.id, "sizing.save", "SizingRow", kw, data);
  revalidatePath("/pricing");
  return ok(`Saved ${kw} kW.`);
}

export async function saveSubsidy(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(MANAGERS);
  const id = num(fd, "id");
  const scope = str(fd, "scope") === "STATE" ? "STATE" : "CENTRAL";
  const data = {
    name: str(fd, "name").slice(0, 80),
    scope,
    state: scope === "STATE" ? str(fd, "state").toLowerCase().slice(0, 40) || null : null,
    perKwFirst: num(fd, "perKwFirst"),
    firstKw: num(fd, "firstKw"),
    perKwNext: num(fd, "perKwNext") || 0,
    nextKw: num(fd, "nextKw") || 0,
    cap: num(fd, "cap"),
    active: fd.get("active") === "on",
    source: str(fd, "source").slice(0, 300) || null,
  };
  if (!data.name || !(data.perKwFirst >= 0) || !(data.firstKw > 0) || !(data.cap >= 0)) return fail("Fill name, amount per kW, kW and cap.");
  if (scope === "STATE" && !data.state) return fail("Enter the state name for a state rule.");
  if (id) await prisma.subsidyRule.update({ where: { id }, data });
  else await prisma.subsidyRule.create({ data });
  await audit(user.id, "subsidy.save", "SubsidyRule", id || data.name, data);
  revalidatePath("/pricing");
  return ok("Saved.");
}

// --- Agent settings -----------------------------------------------------------------

export async function saveSettings(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(MANAGERS);
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  const data = {
    agentName: str(fd, "agentName").slice(0, 80) || "Multi Solar Voice Agent",
    voice: str(fd, "voice") === "male" ? "male" : "female",
    startLanguage: str(fd, "startLanguage") === "hi" ? "hi" : "en",
    callingStart: str(fd, "callingStart"),
    callingEnd: str(fd, "callingEnd"),
    escalationHours: Math.round(num(fd, "escalationHours")),
    transferNumber: normalizePhone(str(fd, "transferNumber")) ?? null,
    salesHeadNumber: normalizePhone(str(fd, "salesHeadNumber")) ?? null,
    crmNumber: normalizePhone(str(fd, "crmNumber")) ?? null,
    keypadMenu: fd.get("keypadMenu") === "on",
    maxCallSeconds: Math.round(num(fd, "maxCallSeconds")),
    brain: str(fd, "brain") === "rules" ? "rules" : "claude",
    claudeModel: CLAUDE_MODELS.some((m) => m.id === str(fd, "claudeModel")) ? str(fd, "claudeModel") : "claude-opus-5-5",
    ttsModel: TTS_MODELS.some((m) => m.id === str(fd, "ttsModel")) ? str(fd, "ttsModel") : "bulbul:v3",
    ttsSpeaker: /^[a-z0-9_-]{2,60}$/i.test(str(fd, "ttsSpeaker")) ? str(fd, "ttsSpeaker").toLowerCase() : null,
    monthlyBudget: Math.round(num(fd, "monthlyBudget")),
    outboundEnabled: fd.get("outboundEnabled") === "on",
    maxAttempts: Math.round(num(fd, "maxAttempts")),
    retryGapMinutes: Math.round(num(fd, "retryGapMinutes")),
    maxConcurrent: Math.round(num(fd, "maxConcurrent")),
  };
  if (!time.test(data.callingStart) || !time.test(data.callingEnd)) return fail("Calling hours must look like 09:00.");
  if (data.callingStart < "09:00" || data.callingEnd > "21:00") return fail("Telemarketing calls are allowed only between 09:00 and 21:00.");
  if (!(data.escalationHours >= 1 && data.escalationHours <= 168)) return fail("Callback promise must be 1–168 hours.");
  if (!(data.maxAttempts >= 1 && data.maxAttempts <= 5) || !(data.maxConcurrent >= 1 && data.maxConcurrent <= 50)) return fail("Check attempts (1–5) and concurrent calls (1–50).");
  if (!(data.maxCallSeconds >= 60 && data.maxCallSeconds <= 600)) return fail("Target call length must be 60–600 seconds.");
  for (const [field, label] of [["transferNumber", "Sales"], ["salesHeadNumber", "Sales Head"], ["crmNumber", "Customer care"]] as const)
    if (str(fd, field) && !data[field]) return fail(`${label} number: enter a valid 10-digit Indian mobile number.`);
  await prisma.agentSettings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  await audit(user.id, "settings.save", "AgentSettings", 1, data);
  revalidatePath("/settings");
  return ok("Settings saved.");
}

// --- Users ----------------------------------------------------------------------------

export async function createUser(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(ADMINS);
  const email = str(fd, "email").toLowerCase();
  const name = str(fd, "name").slice(0, 120);
  const password = String(fd.get("password") ?? "");
  const role = ROLES.find((r) => r === str(fd, "role"));
  if (!name || !z.string().email().safeParse(email).success) return fail("Enter a name and a valid email.");
  const problem = passwordProblem(password);
  if (problem) return fail(problem);
  if (!role) return fail("Choose a role.");
  if (await prisma.user.findUnique({ where: { email } })) return fail("A user with this email already exists.");
  const created = await prisma.user.create({ data: { email, name, role, passwordHash: await hashPassword(password) } });
  await audit(user.id, "user.create", "User", created.id, { role });
  revalidatePath("/users");
  return ok(`Created ${name}.`);
}

export async function toggleUser(fd: FormData) {
  const user = await requireUser(ADMINS);
  const id = num(fd, "id");
  if (id === user.id) return; // never lock yourself out
  const target = await prisma.user.findUniqueOrThrow({ where: { id } });
  await prisma.user.update({ where: { id }, data: { active: !target.active, sessionVersion: { increment: 1 } } });
  await audit(user.id, target.active ? "user.deactivate" : "user.activate", "User", id);
  revalidatePath("/users");
}

/** Anyone signed in can change their own password (the seeded admin password should be changed after first sign-in). */
export async function changeOwnPassword(_p: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireUser();
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("next") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
  if (!(await verifyPassword(current, user.passwordHash))) return fail("Current password is wrong.");
  const problem = passwordProblem(next);
  if (problem) return fail(problem);
  if (next !== confirm) return fail("The new passwords do not match.");
  if (next === current) return fail("Choose a password you have not used here.");
  // New password → every other signed-in browser is signed out; this one gets a fresh session.
  const updated = await prisma.user.update({ where: { id: me.id }, data: { passwordHash: await hashPassword(next), sessionVersion: { increment: 1 } } });
  await reissueSession(updated);
  await audit(me.id, "user.password_changed", "User", me.id);
  return ok("Password changed. Other devices were signed out.");
}

async function reissueSession(u: { id: number; role: (typeof ROLES)[number]; name: string; sessionVersion: number }) {
  const token = await signSession({ sub: String(u.id), role: u.role, name: u.name, v: u.sessionVersion, mfa: true });
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);
}

export type RecoveryState = { ok?: string; error?: string; codes?: string[]; at?: number } | undefined;

/** New set of recovery codes (old ones stop working). Needs a current authenticator code. */
export async function regenerateRecoveryCodes(_p: RecoveryState, fd: FormData): Promise<RecoveryState> {
  const me = await requireUser();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
  if (!user.mfaSecret) return { error: "Two-factor sign-in is not set up." };
  const step = verifyCode(decryptSecret(user.mfaSecret), String(fd.get("code") ?? ""), user.mfaLastStep);
  if (step === null) {
    await audit(me.id, "mfa.failed", "User", me.id);
    return { error: "That code is not right." };
  }
  const claimed = await prisma.user.updateMany({
    where: { id: me.id, OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: step } }] },
    data: { mfaLastStep: step },
  });
  if (claimed.count !== 1) return { error: "That code was already used — wait for the next one." };
  const codes = newRecoveryCodes();
  await prisma.user.update({ where: { id: me.id }, data: { mfaRecovery: codes.map(hashRecovery) } });
  await audit(me.id, "mfa.recovery_regenerated", "User", me.id);
  return { codes, ok: "New recovery codes — the old ones no longer work.", at: Date.now() };
}

/** Super Admin: remove someone's authenticator (lost phone). They must set it up again at next sign-in. */
export async function resetUserMfa(fd: FormData) {
  const admin = await requireUser(ADMINS);
  const id = num(fd, "id");
  if (id === admin.id) return; // use My account instead — never lock yourself out
  await prisma.user.update({
    where: { id },
    data: { mfaSecret: null, mfaEnabledAt: null, mfaRecovery: Prisma.DbNull, mfaLastStep: null, sessionVersion: { increment: 1 } },
  });
  await audit(admin.id, "mfa.reset", "User", id);
  revalidatePath("/users");
}

/**
 * "A day of calling" in a few minutes, without Tata or Sarvam:
 *
 *   npm run sim:day
 *
 * Adds 10 pretend leads (source "sim", with consent), switches outbound calling on, and lets the
 * real dialer + real agent call them through the fake Smartflo. Retries happen after seconds instead
 * of hours. Results appear in the Voice Console (Calls / Leads / Escalations), marked as tests.
 * Your Agent settings are put back afterwards. Real leads are never dialled by the simulation.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const envFile = join(here, "../../../console/.env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const PORT = process.env.SIM_PORT ?? "8090";
Object.assign(process.env, {
  SMARTFLO_MODE: "sim",
  SPEECH_PROVIDER: "mock",
  PORT,
  PUBLIC_URL: `http://localhost:${PORT}`,
  SIM_SPEED: process.env.SIM_SPEED ?? "0.05",
  SILENCE_TIMEOUT_SEC: "30",
});

const { prisma, getSettings } = await import("@msv/data");
const { assertConfig } = await import("../config");
const { createVoiceServer } = await import("../server");
const { Dialer } = await import("../dialer");
const { SimulatedLine } = await import("./fake-smartflo");
const { MockSTT, MockTTS } = await import("../providers/speech");
const { PERSONAS } = await import("./personas");

const problems = assertConfig();
if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`);
  process.exit(1);
}

const t0 = Date.now();
const log = (m: string) => console.log(`  ${String(Math.round((Date.now() - t0) / 1000)).padStart(3)}s  ${m}`);

// 1. Ten pretend leads, reset so the simulation can be run again. Earlier simulated calls are kept
//    (Calls page) but detached from the leads, so each run starts with a clean history.
const simLeads = await prisma.lead.findMany({ where: { phone: { in: PERSONAS.map((p) => p.phone) } }, select: { id: true } });
const ids = simLeads.map((l) => l.id);
if (ids.length) {
  await prisma.call.updateMany({ where: { leadId: { in: ids } }, data: { leadId: null } });
  await prisma.escalation.updateMany({ where: { leadId: { in: ids } }, data: { leadId: null, status: "RESOLVED", resolution: "Simulation reset" } });
  await prisma.siteVisit.updateMany({ where: { leadId: { in: ids } }, data: { leadId: null, status: "CANCELLED" } });
  await prisma.callback.updateMany({ where: { leadId: { in: ids } }, data: { leadId: null, done: true } });
}
for (const p of PERSONAS) {
  await prisma.doNotCall.deleteMany({ where: { phone: p.phone } });
  await prisma.lead.upsert({
    where: { phone: p.phone },
    update: { status: "NEW", attempts: 0, lastAttemptAt: null, nextCallAt: null, language: null, segment: null, monthlyBill: null, consentAt: new Date() },
    create: { phone: p.phone, name: p.name, city: p.city, source: "sim", consentAt: new Date() },
  });
}

// 2. Outbound on for the run (restored at the end).
const before = await getSettings();
await prisma.agentSettings.update({ where: { id: 1 }, data: { outboundEnabled: true, maxConcurrent: 3, maxAttempts: 3 } });

// 3. Real server + real dialer + fake Smartflo.
const line = new SimulatedLine({ log });
const dialer = new Dialer(line, { tickMs: 1500, ignoreHours: true, retryGapMs: 5000, unansweredAfterSec: 20, isTest: true, leadSource: "sim", log });
const server = createVoiceServer({ stt: new MockSTT(), tts: new MockTTS(), line, dialer, sim: true, log });
await new Promise<void>((r) => server.listen(Number(PORT), r));
console.log(`\nSimulating a calling day for ${PERSONAS.length} leads (3 lines at a time, retry after 5 s instead of 4 h)…\n`);
dialer.start();

// 4. Wait until every lead is finished: closed, out of attempts, or a callback booked for later.
const phones = PERSONAS.map((p) => p.phone);
const done = async () => {
  const leads = await prisma.lead.findMany({ where: { phone: { in: phones } }, include: { calls: { select: { endedAt: true, answeredAt: true } } } });
  return leads.every(
    (l) =>
      l.calls.every((c) => c.endedAt) &&
      (l.calls.some((c) => c.answeredAt) || l.attempts >= 3 || (l.nextCallAt && l.nextCallAt > new Date()) || !["NEW", "CONTACTED", "INTERESTED"].includes(l.status)),
  );
};
const deadline = Date.now() + 6 * 60_000;
while (!(await done()) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 1500));
dialer.stop();
await new Promise((r) => setTimeout(r, 1500));

// 5. Report.
const leads = await prisma.lead.findMany({
  where: { phone: { in: phones } },
  include: { calls: { orderBy: { startedAt: "desc" }, take: 1 }, escalations: { where: { status: { not: "RESOLVED" } } }, visits: true },
  orderBy: { phone: "asc" },
});
const dnc = new Set((await prisma.doNotCall.findMany({ where: { phone: { in: phones } } })).map((d) => d.phone));
console.log("\nResult");
console.log("Lead              Tries  Last call           Lead status     Follow-up");
for (const l of leads) {
  const c = l.calls[0];
  const follow = [
    l.visits.length ? "site visit booked" : "",
    l.nextCallAt && l.nextCallAt > new Date() ? `callback ${l.nextCallAt.toISOString().slice(0, 16).replace("T", " ")} UTC` : "",
    l.escalations.length ? `${l.escalations.length} question(s) for sales` : "",
    dnc.has(l.phone) ? "on Do-Not-Call list" : "",
  ].filter(Boolean).join(", ");
  console.log(`${(l.name ?? "").padEnd(18)}${String(l.attempts).padEnd(7)}${(c?.outcome ?? "-").padEnd(20)}${l.status.padEnd(16)}${follow}`);
}
console.log(`\nDone in ${Math.round((Date.now() - t0) / 1000)} s. Open the Voice Console → Calls to read every conversation.`);

await prisma.agentSettings.update({
  where: { id: 1 },
  data: { outboundEnabled: before.outboundEnabled, maxConcurrent: before.maxConcurrent, maxAttempts: before.maxAttempts },
});
server.close();
await prisma.$disconnect();
process.exit(0);

import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth/guard";
import { startCall } from "@/lib/calls";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/util";
import { testCallLimit } from "@/lib/test-calls";

const Body = z.object({
  direction: z.enum(["INBOUND", "OUTBOUND"]),
  name: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(20).optional(),
  language: z.enum(["en", "hi"]).optional(),
});

/** Browser test call: same agent and tools as a phone call, saved with isTest = true. */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!testCallLimit(user.id, "start").ok) return NextResponse.json({ message: "Too many test calls — wait a few minutes." }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Invalid request" }, { status: 400 });
  const { direction, name, language } = parsed.data;

  let leadId: number | null = null;
  const phone = parsed.data.phone ? normalizePhone(parsed.data.phone) : null;
  if (parsed.data.phone && !phone) return NextResponse.json({ message: "Enter a valid 10-digit mobile number, or leave it empty." }, { status: 400 });
  if (phone) {
    if (direction === "OUTBOUND" && (await prisma.doNotCall.findUnique({ where: { phone } })))
      return NextResponse.json({ message: "This number is on the Do-Not-Call list. The agent will never call it." }, { status: 409 });
    const lead = await prisma.lead.upsert({
      where: { phone },
      update: name ? { name } : {},
      create: { phone, name: name || null, source: "test-call" },
    });
    leadId = lead.id;
  }

  const res = await startCall({
    direction,
    leadId,
    isTest: true,
    fromNumber: direction === "INBOUND" ? (phone ?? "browser") : undefined,
    toNumber: direction === "OUTBOUND" ? (phone ?? "browser") : undefined,
    startLanguage: language,
    customerName: name,
  });
  return NextResponse.json(res);
}

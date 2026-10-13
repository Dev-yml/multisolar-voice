import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth/guard";
import { endCall } from "@/lib/calls";
import { ownTestCall } from "@/lib/test-calls";

export async function POST(req: Request) {
  if (!(await getUser())) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const parsed = z.object({ callId: z.number().int().positive() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Invalid request" }, { status: 400 });
  if (!(await ownTestCall(parsed.data.callId))) return NextResponse.json({ message: "Not a browser test call." }, { status: 403 });
  await endCall(parsed.data.callId, "Tester ended the call");
  return NextResponse.json({ ok: true });
}

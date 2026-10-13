import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth/guard";
import { callTurn } from "@/lib/calls";
import { ownTestCall, testCallLimit } from "@/lib/test-calls";

const Body = z.object({ callId: z.number().int().positive(), text: z.string().trim().min(1).max(1000) });

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!testCallLimit(user.id, "turn").ok) return NextResponse.json({ message: "Too many messages — wait a few minutes." }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Invalid request" }, { status: 400 });
  if (!(await ownTestCall(parsed.data.callId))) return NextResponse.json({ message: "Not a browser test call." }, { status: 403 });
  try {
    return NextResponse.json(await callTurn(parsed.data.callId, parsed.data.text));
  } catch (e) {
    console.error("[test-call] turn failed:", e instanceof Error ? e.message : "unknown error");
    return NextResponse.json({ message: "The agent could not answer. Check the server log." }, { status: 500 });
  }
}

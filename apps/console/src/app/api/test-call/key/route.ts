import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth/guard";
import { pressKey } from "@/lib/calls";
import { forBrowser, ownTestCall, testCallLimit } from "@/lib/test-calls";

/** The AI may take a few seconds (and look things up); allow up to a minute on Vercel. */
export const maxDuration = 60;

const Body = z.object({ callId: z.number().int().positive(), digit: z.enum(["1", "2", "3"]) });

/** Browser test call: the tester presses 1 / 2 / 3 like on a phone keypad. Nothing is dialled. */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!testCallLimit(user.id, "turn").ok) return NextResponse.json({ message: "Too many messages — wait a few minutes." }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Invalid request" }, { status: 400 });
  if (!(await ownTestCall(parsed.data.callId))) return NextResponse.json({ message: "Not a browser test call." }, { status: 403 });
  const res = await pressKey(parsed.data.callId, parsed.data.digit);
  if (!res) return NextResponse.json({ message: "The call has already ended." }, { status: 409 });
  return NextResponse.json(forBrowser(res));
}

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MFA_COOKIE, verifyMfaTicket } from "@/lib/auth/session";
import { AuthShell } from "../AuthShell";
import { VerifyForm } from "./VerifyForm";

export const metadata: Metadata = { title: "Verification code" };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!(await verifyMfaTicket((await cookies()).get(MFA_COOKIE)?.value))) redirect("/login");
  const { next } = await searchParams;
  return (
    <AuthShell>
      <h1 className="mt-8 text-[1.6rem] font-bold leading-tight tracking-[-0.02em]">Enter your code</h1>
      <p className="mt-1.5 text-sm text-muted">Open your authenticator app (Google / Microsoft Authenticator) and type the 6-digit code for <b>Multi Solar Voice</b>.</p>
      <VerifyForm next={next} />
    </AuthShell>
  );
}

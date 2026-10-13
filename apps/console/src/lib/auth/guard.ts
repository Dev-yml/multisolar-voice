import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/db";
import type { RoleValue } from "@/lib/roles";
import { SESSION_COOKIE, verifySession } from "./session";

export type CurrentUser = { id: number; name: string; email: string; role: RoleValue };

/**
 * Who is signed in, and how far: "full" = password + authenticator code, "enroll" = password only and
 * the account has no authenticator yet (may only open /setup-mfa). Every other state is "none".
 * The DB lookup makes deactivation, role changes and session revocation (sessionVersion) immediate.
 */
export const getSession = cache(async (): Promise<{ user: CurrentUser; state: "full" | "enroll" } | null> => {
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const u = await prisma.user.findUnique({
    where: { id: Number(session.sub) },
    select: { id: true, name: true, email: true, role: true, active: true, sessionVersion: true, mfaEnabledAt: true },
  });
  if (!u?.active || u.sessionVersion !== session.v) return null;
  const user = { id: u.id, name: u.name, email: u.email, role: u.role };
  if (u.mfaEnabledAt) return session.mfa ? { user, state: "full" } : null;
  return { user, state: "enroll" };
});

/** Fully signed-in user (MFA passed), or null. API routes use this. */
export const getUser = cache(async (): Promise<CurrentUser | null> => {
  const s = await getSession();
  return s?.state === "full" ? s.user : null;
});

export async function requireUser(roles?: RoleValue[]): Promise<CurrentUser> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.state === "enroll") redirect("/setup-mfa"); // two-factor sign-in is required for everyone
  if (roles && !roles.includes(s.user.role)) redirect("/?denied=1");
  return s.user;
}

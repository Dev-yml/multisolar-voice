"use server";

import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import type { Role } from "@prisma/client";
import { getSession } from "@/lib/auth/guard";
import { getDummyHash, verifyPassword } from "@/lib/auth/password";
import {
  MFA_COOKIE, SESSION_COOKIE, mfaCookieOptions, sessionCookieOptions, signMfaTicket, signSession, verifyMfaTicket,
} from "@/lib/auth/session";
import {
  decryptSecret, encryptSecret, hashRecovery, newRecoveryCodes, newSecret, otpauthUrl, verifyCode,
} from "@/lib/auth/totp";
import { prisma } from "@/lib/db";
import { hit } from "@/lib/rate-limit";

export type LoginState = { error?: string; email?: string } | undefined;

/** Only redirect back inside the console (prevents open redirects, incl. "/\\evil.com"). */
function safeNext(next: unknown) {
  return typeof next === "string" && /^\/(?![\/\\])[^\s\\]*$/.test(next) && !next.startsWith("/login") ? next : "/";
}

const WINDOW_MS = 15 * 60_000;
const emailKey = (email: string) => createHash("sha256").update(email).digest("hex").slice(0, 40);
/** Every failed attempt costs 0.4–0.8 s extra. */
const failureDelay = () => new Promise((r) => setTimeout(r, 400 + Math.random() * 400));

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

/**
 * Failed sign-ins are kept in the audit log, so the limit holds across server instances
 * (Vercel runs many): 5 failures per account or 20 per IP address in 15 minutes.
 */
async function tooManyFailures(email: string, ip: string) {
  const since = new Date(Date.now() - WINDOW_MS);
  const [byEmail, byIp] = await Promise.all([
    prisma.auditLog.count({ where: { action: "login.failed", entityId: emailKey(email), at: { gte: since } } }),
    prisma.auditLog.count({ where: { action: "login.failed", at: { gte: since }, detail: { path: ["ip"], equals: ip } } }),
  ]);
  return byEmail >= 5 || byIp >= 20;
}

async function startSession(user: { id: number; role: Role; name: string; sessionVersion: number }, mfa: boolean) {
  const token = await signSession({ sub: String(user.id), role: user.role, name: user.name, v: user.sessionVersion, mfa });
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);
}

async function completeSignIn(userId: number) {
  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  await prisma.auditLog.create({ data: { userId, action: "login", detail: { ip: await clientIp() } } });
}

// ---------------------------------------------------------------- step 1: password

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password.", email };

  const ip = await clientIp();
  const limit = hit(`${ip}:${email}`);
  if (!limit.ok || (await tooManyFailures(email, ip))) {
    await failureDelay();
    return { error: "Too many attempts. Try again in 15 minutes.", email };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  // Always run bcrypt so timing doesn't reveal which emails exist.
  const valid = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !user.active || !valid) {
    await prisma.auditLog.create({ data: { userId: user?.id, action: "login.failed", entity: "User", entityId: emailKey(email), detail: { ip } } });
    await failureDelay();
    return { error: "Incorrect email or password.", email };
  }

  const next = safeNext(formData.get("next"));
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  if (user.mfaEnabledAt) {
    // Password is right — now the authenticator code (5-minute ticket, no session yet).
    jar.set(MFA_COOKIE, await signMfaTicket(String(user.id), user.sessionVersion), mfaCookieOptions);
    redirect(`/login/verify${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`);
  }
  // No authenticator yet: a limited session that can only open the setup page.
  await startSession(user, false);
  redirect("/setup-mfa");
}

export async function logout() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(MFA_COOKIE);
  redirect("/login");
}

// ---------------------------------------------------------------- step 2: authenticator code

export type MfaState = { error?: string } | undefined;

export async function verifyMfa(_prev: MfaState, formData: FormData): Promise<MfaState> {
  const jar = await cookies();
  const expired = { error: "This sign-in expired. Go back and enter your password again." };
  const ticket = await verifyMfaTicket(jar.get(MFA_COOKIE)?.value);
  if (!ticket) return expired;
  const user = await prisma.user.findUnique({ where: { id: Number(ticket.sub) } });
  if (!user || !user.active || !user.mfaEnabledAt || !user.mfaSecret || user.sessionVersion !== ticket.v) {
    jar.delete(MFA_COOKIE);
    return expired;
  }

  const since = new Date(Date.now() - WINDOW_MS);
  const failures = await prisma.auditLog.count({ where: { userId: user.id, action: "mfa.failed", at: { gte: since } } });
  if (failures >= 5) {
    jar.delete(MFA_COOKIE);
    await failureDelay();
    return { error: "Too many wrong codes. Wait 15 minutes, then sign in again." };
  }

  const input = String(formData.get("code") ?? "").trim();
  let ok = false;
  let usedRecovery = false;

  const step = verifyCode(decryptSecret(user.mfaSecret), input, user.mfaLastStep);
  if (step !== null) {
    // Atomic: only one request can claim this time step (no replay, even in parallel).
    const res = await prisma.user.updateMany({
      where: { id: user.id, OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: step } }] },
      data: { mfaLastStep: step },
    });
    ok = res.count === 1;
  } else if (input.replace(/[^A-Za-z0-9]/g, "").length >= 12) {
    const hashes = (user.mfaRecovery as string[] | null) ?? [];
    const h = hashRecovery(input);
    if (hashes.includes(h)) {
      await prisma.user.update({ where: { id: user.id }, data: { mfaRecovery: hashes.filter((x) => x !== h) } });
      ok = usedRecovery = true;
    }
  }

  if (!ok) {
    await prisma.auditLog.create({ data: { userId: user.id, action: "mfa.failed", detail: { ip: await clientIp() } } });
    await failureDelay();
    return { error: "That code is not right. Check the newest code in your authenticator app (or the recovery code)." };
  }

  jar.delete(MFA_COOKIE);
  await startSession(user, true);
  await completeSignIn(user.id);
  if (usedRecovery) await prisma.auditLog.create({ data: { userId: user.id, action: "mfa.recovery_used" } });
  redirect(safeNext(formData.get("next")));
}

// ---------------------------------------------------------------- first-time setup

const SETUP_COOKIE = "msv_mfa_setup";

export type SetupStart = { secret?: string; qr?: string; error?: string } | undefined;
export type SetupDone = { codes?: string[]; error?: string } | undefined;

export async function beginMfaSetup(): Promise<SetupStart> {
  const s = await getSession();
  if (!s || s.state !== "enroll") return { error: "Sign in again to set up two-factor sign-in." };
  const secret = newSecret();
  (await cookies()).set(SETUP_COOKIE, encryptSecret(secret), { ...mfaCookieOptions, maxAge: 10 * 60 });
  const qr = await QRCode.toDataURL(otpauthUrl(secret, s.user.email), { margin: 1, width: 220, errorCorrectionLevel: "M" });
  return { secret: secret.replace(/(.{4})/g, "$1 ").trim(), qr };
}

export async function confirmMfaSetup(_prev: SetupDone, formData: FormData): Promise<SetupDone> {
  const s = await getSession();
  if (!s || s.state !== "enroll") return { error: "Sign in again to set up two-factor sign-in." };
  const jar = await cookies();
  const blob = jar.get(SETUP_COOKIE)?.value;
  if (!blob) return { error: "Setup expired — press “Start setup” again." };
  const secret = decryptSecret(blob);
  const step = verifyCode(secret, String(formData.get("code") ?? ""), null);
  if (step === null) return { error: "That code is not right. Wait for a new code in the app and try again." };

  const codes = newRecoveryCodes();
  const user = await prisma.user.update({
    where: { id: s.user.id },
    data: {
      mfaSecret: encryptSecret(secret),
      mfaEnabledAt: new Date(),
      mfaLastStep: step,
      mfaRecovery: codes.map(hashRecovery),
      sessionVersion: { increment: 1 }, // the half-signed-in session stops working
    },
  });
  jar.delete(SETUP_COOKIE);
  await startSession(user, true);
  await prisma.auditLog.create({ data: { userId: user.id, action: "mfa.enabled" } });
  await completeSignIn(user.id);
  return { codes };
}

import { jwtVerify, SignJWT } from "jose";
import type { RoleValue } from "@/lib/roles";

/**
 * Admin session token: a short-lived HS256 JWT in an HTTP-only cookie.
 * Edge-safe (used by middleware) — no Node-only imports here.
 */

export const SESSION_COOKIE = "msv_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

/** v = user's sessionVersion when signed in; mfa = the second step (authenticator code) was passed. */
export type SessionPayload = { sub: string; role: RoleValue; name: string; v: number; mfa: boolean };

function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must be set (32+ characters)");
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload, ttlSeconds = SESSION_TTL_SECONDS): Promise<string> {
  return new SignJWT({ role: payload.role, name: payload.name, v: payload.v, mfa: payload.mfa, typ: "session" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .setIssuer("multisolar-voice")
    .sign(key());
}

/** Returns the payload, or null for missing / expired / tampered tokens. */
export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { issuer: "multisolar-voice", algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.role !== "string" || payload.typ !== "session") return null;
    return { sub: payload.sub, role: payload.role as RoleValue, name: String(payload.name ?? ""), v: Number(payload.v ?? 0), mfa: payload.mfa === true };
  } catch {
    return null;
  }
}

/**
 * HTTP-only (no JavaScript access), Secure in production, SameSite=Strict:
 * the browser never sends the admin cookie on requests started by another site.
 */
export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};

// ---------------------------------------------------------------- second sign-in step

/** After a correct password the browser gets this 5-minute ticket — it only opens the code page. */
export const MFA_COOKIE = "msv_mfa";
export const MFA_TTL_SECONDS = 5 * 60;

export async function signMfaTicket(sub: string, v: number): Promise<string> {
  return new SignJWT({ typ: "mfa", v })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(`${MFA_TTL_SECONDS}s`)
    .setIssuer("multisolar-voice")
    .sign(key());
}

export async function verifyMfaTicket(token: string | undefined): Promise<{ sub: string; v: number } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { issuer: "multisolar-voice", algorithms: ["HS256"] });
    if (payload.typ !== "mfa" || !payload.sub) return null;
    return { sub: payload.sub, v: Number(payload.v ?? 0) };
  } catch {
    return null;
  }
}

export const mfaCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: MFA_TTL_SECONDS,
};

import bcrypt from "bcryptjs";

/** bcrypt cost factor — ~100 ms per hash on a modern server. */
const COST = 12;

export const MIN_PASSWORD_LENGTH = 12;
/** bcrypt only uses the first 72 bytes — longer passwords would silently be cut. */
export const MAX_PASSWORD_BYTES = 72;

export function passwordProblem(plain: string): string | null {
  if (plain.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (Buffer.byteLength(plain, "utf8") > MAX_PASSWORD_BYTES) return `Password must be at most ${MAX_PASSWORD_BYTES} bytes.`;
  return null;
}

export async function hashPassword(plain: string): Promise<string> {
  const problem = passwordProblem(plain);
  if (problem) throw new Error(problem);
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

let dummyHash: Promise<string> | null = null;
/**
 * A real bcrypt hash (same cost) compared when the e-mail doesn't exist, so a
 * login attempt takes the same time whether or not the account exists.
 */
export function getDummyHash(): Promise<string> {
  dummyHash ??= bcrypt.hash(crypto.randomUUID(), COST);
  return dummyHash;
}

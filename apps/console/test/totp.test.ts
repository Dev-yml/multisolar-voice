import { beforeAll, describe, expect, it } from "vitest";
import {
  base32Decode, base32Encode, codeAt, currentStep, decryptSecret, encryptSecret, hashRecovery, newRecoveryCodes, newSecret, otpauthUrl, verifyCode,
} from "../src/lib/auth/totp";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-123";
});

// RFC 6238 appendix B (SHA-1 seed "12345678901234567890"), last 6 digits.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));
const VECTORS: [number, string][] = [
  [59, "287082"], [1111111109, "081804"], [1111111111, "050471"], [1234567890, "005924"], [2000000000, "279037"], [20000000000, "353130"],
];

describe("TOTP", () => {
  it("matches the RFC 6238 test vectors", () => {
    for (const [t, code] of VECTORS) expect(codeAt(RFC_SECRET, Math.floor(t / 30))).toBe(code);
  });
  it("base32 round-trips", () => {
    const b = Buffer.from([0, 1, 2, 250, 255, 128, 64]);
    expect(base32Decode(base32Encode(b)).equals(b)).toBe(true);
    expect(newSecret()).toMatch(/^[A-Z2-7]{32}$/);
  });
  it("accepts the current code and ±1 step, rejects others and replays", () => {
    const s = newSecret();
    const now = Date.now();
    const step = currentStep(now);
    expect(verifyCode(s, codeAt(s, step), null, now)).toBe(step);
    expect(verifyCode(s, codeAt(s, step - 1), null, now)).toBe(step - 1);
    expect(verifyCode(s, codeAt(s, step + 3), null, now)).toBeNull();
    expect(verifyCode(s, codeAt(s, step), step, now)).toBeNull(); // already used
    expect(verifyCode(s, "12345", null, now)).toBeNull();
    expect(verifyCode(s, "abcdef", null, now)).toBeNull();
  });
  it("encrypts the secret at rest", () => {
    const s = newSecret();
    const blob = encryptSecret(s);
    expect(blob).not.toContain(s);
    expect(decryptSecret(blob)).toBe(s);
    const tampered = blob.slice(0, -2) + (blob.endsWith("A") ? "BB" : "AA");
    expect(() => decryptSecret(tampered)).toThrow();
  });
  it("recovery codes are unique and hashed ignoring case/dashes", () => {
    const codes = newRecoveryCodes();
    expect(new Set(codes).size).toBe(8);
    expect(codes[0]).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(hashRecovery(codes[0])).toBe(hashRecovery(codes[0].toLowerCase().replace(/-/g, " ")));
  });
  it("builds an authenticator URL", () => {
    expect(otpauthUrl("ABC", "a@b.c")).toBe("otpauth://totp/Multi%20Solar%20Voice%3Aa%40b.c?secret=ABC&issuer=Multi%20Solar%20Voice&algorithm=SHA1&digits=6&period=30");
  });
});

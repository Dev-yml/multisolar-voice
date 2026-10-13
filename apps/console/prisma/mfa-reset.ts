/**
 * Emergency: remove two-factor sign-in from one account (e.g. the only Super Admin lost the phone
 * and the recovery codes). Needs the database password, so only someone with apps/console/.env can run it.
 *
 *   npm run mfa:reset -- someone@company.com
 */
import { Prisma, PrismaClient } from "@prisma/client";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("Usage: npm run mfa:reset -- <email>");
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error(`No user with email ${email}`);
    await prisma.user.update({
      where: { id: user.id },
      data: { mfaSecret: null, mfaEnabledAt: null, mfaRecovery: Prisma.DbNull, mfaLastStep: null, sessionVersion: { increment: 1 } },
    });
    await prisma.auditLog.create({ data: { userId: user.id, action: "mfa.reset", detail: { by: "mfa-reset script" } } });
    console.log(`✓ Two-factor sign-in removed for ${email}. They set it up again at next sign-in.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});

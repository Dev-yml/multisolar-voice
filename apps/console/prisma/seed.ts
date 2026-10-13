/**
 * Starting data for a fresh Voice Console database. Safe to run again:
 * it only adds what is missing and never overwrites edits made in the Console.
 *
 *   npm run db:seed
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { chunkSections } from "@msv/core";

const prisma = new PrismaClient();

/** Published residential size guide from multisolar.in (Residential → system sizes). */
const SIZING = [
  { kw: 1, billMin: 800, billMax: 1200, roofSqftMin: 80, roofSqftMax: 100, unitsMin: 100, unitsMax: 120 },
  { kw: 2, billMin: 1500, billMax: 2200, roofSqftMin: 160, roofSqftMax: 200, unitsMin: 220, unitsMax: 260 },
  { kw: 3, billMin: 2500, billMax: 3500, roofSqftMin: 250, roofSqftMax: 300, unitsMin: 300, unitsMax: 400 },
  { kw: 5, billMin: 4500, billMax: 6500, roofSqftMin: 400, roofSqftMax: 500, unitsMin: 600, unitsMax: 650 },
  { kw: 10, billMin: 9000, billMax: 13000, roofSqftMin: 800, roofSqftMax: 1000, unitsMin: 1200, unitsMax: 1300 },
];

/** Indicative costs shown on multisolar.in. Marked sample until the official price sheet is entered. */
const PRICES = [
  { kw: 1, priceMin: 65000, priceMax: 85000 },
  { kw: 2, priceMin: 120000, priceMax: 150000 },
  { kw: 3, priceMin: 150000, priceMax: 180000 },
  { kw: 5, priceMin: 260000, priceMax: 320000 },
  { kw: 10, priceMin: 500000, priceMax: 600000 },
];

async function main() {
  // 1. First admin (from .env). Existing accounts are left alone.
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "";
  if (email && password.length >= 12) {
    const exists = await prisma.user.findUnique({ where: { email } });
    if (!exists) {
      await prisma.user.create({ data: { email, name: process.env.SEED_ADMIN_NAME || "Admin", role: "SUPER_ADMIN", passwordHash: await bcrypt.hash(password, 12) } });
      console.log(`✓ admin user created: ${email}`);
    } else console.log(`• admin user exists: ${email}`);
  } else console.warn("! SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD (12+ chars) not set — no admin created");

  // 2. Agent settings singleton.
  await prisma.agentSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  // 3. Size guide and sample prices.
  for (const s of SIZING) await prisma.sizingRow.upsert({ where: { kw: s.kw }, update: {}, create: s });
  for (const p of PRICES)
    await prisma.priceRow.upsert({
      where: { segment_kw: { segment: "RESIDENTIAL", kw: p.kw } },
      update: {},
      create: { segment: "RESIDENTIAL", ...p, includesGst: true, sample: true, note: "Indicative cost from multisolar.in — replace with the official sheet" },
    });
  console.log(`✓ ${SIZING.length} sizes, ${PRICES.length} sample prices`);

  // 4. PM Surya Ghar central subsidy (residential rooftop).
  if ((await prisma.subsidyRule.count()) === 0) {
    await prisma.subsidyRule.create({
      data: {
        name: "PM Surya Ghar: Muft Bijli Yojana (central)",
        scope: "CENTRAL",
        segment: "RESIDENTIAL",
        perKwFirst: 30000,
        firstKw: 2,
        perKwNext: 18000,
        nextKw: 1,
        cap: 78000,
        source: "https://pmsuryaghar.gov.in",
      },
    });
    console.log("✓ central subsidy rule");
  }

  // 5. Knowledge: the content multisolar.in already publishes (products, process, FAQs, contact).
  if ((await prisma.knowledgeDocument.count()) === 0) {
    const file = JSON.parse(readFileSync(join(__dirname, "seed-data", "website-knowledge.json"), "utf8")) as {
      exportedAt: string;
      docs: { title: string; category: string; url: string; sections: { heading?: string; text: string }[] }[];
    };
    let passages = 0;
    for (const d of file.docs) {
      const chunks = chunkSections(d.sections);
      passages += chunks.length;
      await prisma.knowledgeDocument.create({
        data: {
          title: d.title,
          category: d.category,
          version: `website ${file.exportedAt}`,
          fileName: d.url,
          chunks: { create: chunks.map((c, i) => ({ ordinal: i, heading: c.heading?.slice(0, 200) ?? null, text: c.text })) },
        },
      });
    }
    console.log(`✓ knowledge: ${file.docs.length} documents, ${passages} passages from the website`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

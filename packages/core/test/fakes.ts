import { Bm25Index, priceFor, sizeFromBill, subsidyFor, type PriceRow, type SizingRow, type SubsidyRule, type Tools } from "../src";

/** Published Multi Solar residential guide (multisolar.in) used as test data. */
export const SIZING: SizingRow[] = [
  { kw: 1, billMin: 800, billMax: 1200, roofSqftMin: 80, roofSqftMax: 100, unitsMin: 100, unitsMax: 120 },
  { kw: 2, billMin: 1500, billMax: 2200, roofSqftMin: 160, roofSqftMax: 200, unitsMin: 220, unitsMax: 260 },
  { kw: 3, billMin: 2500, billMax: 3500, roofSqftMin: 250, roofSqftMax: 300, unitsMin: 300, unitsMax: 400 },
  { kw: 5, billMin: 4500, billMax: 6500, roofSqftMin: 400, roofSqftMax: 500, unitsMin: 600, unitsMax: 650 },
  { kw: 10, billMin: 9000, billMax: 13000, roofSqftMin: 800, roofSqftMax: 1000, unitsMin: 1200, unitsMax: 1300 },
];

export const PRICES: PriceRow[] = [
  { segment: "RESIDENTIAL", kw: 1, priceMin: 65000, priceMax: 85000, includesGst: true, sample: true },
  { segment: "RESIDENTIAL", kw: 2, priceMin: 120000, priceMax: 150000, includesGst: true, sample: true },
  { segment: "RESIDENTIAL", kw: 3, priceMin: 150000, priceMax: 180000, includesGst: true, sample: true },
  { segment: "RESIDENTIAL", kw: 5, priceMin: 260000, priceMax: 320000, includesGst: true, sample: true },
  { segment: "RESIDENTIAL", kw: 10, priceMin: 500000, priceMax: 600000, includesGst: true, sample: true },
];

export const SUBSIDY: SubsidyRule[] = [
  { name: "PM Surya Ghar", scope: "CENTRAL", segment: "RESIDENTIAL", perKwFirst: 30000, firstKw: 2, perKwNext: 18000, nextKw: 1, cap: 78000, active: true },
];

const KB = new Bm25Index([
  { id: 1, heading: "Warranty", text: "Multi Solar modules carry a long-term performance warranty. Product warranty terms are shared with the quotation.", title: "Warranty" },
  { id: 3, heading: "Do you provide installation, or only panels?", text: "Q: Do you provide installation, or only panels?\nA: Both. We manufacture the panels and deliver complete EPC, including design, installation, net metering and commissioning.", title: "FAQ" },
  { id: 2, heading: "TOPCon panels", text: "TOPCon panels use tunnel-oxide passivated contact technology for higher efficiency and stronger low-light performance.", title: "Products" },
]);

export function fakeTools() {
  const log: { name: string; input: unknown }[] = [];
  let nextEsc = 100;
  const tools: Tools = {
    async estimateSystem(i) { log.push({ name: "estimateSystem", input: i }); return sizeFromBill(SIZING, i.monthlyBill); },
    async getPrice(i) { log.push({ name: "getPrice", input: i }); return priceFor(PRICES, i.kw, i.segment); },
    async getSubsidy(i) { log.push({ name: "getSubsidy", input: i }); return subsidyFor(SUBSIDY, i.kw, i.segment, i.city); },
    async searchKnowledge(q) {
      log.push({ name: "searchKnowledge", input: q });
      return KB.search(q, 3).map((h) => ({ title: h.item.title, heading: h.item.heading, text: h.item.text, score: h.score, confidence: h.matched }));
    },
    async bookSiteVisit(i) { log.push({ name: "bookSiteVisit", input: i }); return { ok: true }; },
    async escalate(i) { log.push({ name: "escalate", input: i }); return { id: nextEsc++, dueHours: 48 }; },
    async scheduleCallback(i) { log.push({ name: "scheduleCallback", input: i }); },
    async markDoNotCall() { log.push({ name: "markDoNotCall", input: {} }); },
    async saveLead(s) { log.push({ name: "saveLead", input: s }); },
  };
  return { tools, log };
}

import { describe, expect, it } from "vitest";
import { formatINR, nlu, NumberAllowlist, priceFor, sizeFromBill, subsidyAmount, subsidyFor } from "../src";
import { PRICES, SIZING, SUBSIDY } from "./fakes";

describe("parseAmount understands bills in English, Hindi and Hinglish", () => {
  it.each([
    ["3500", 3500],
    ["around 3,500 rupees", 3500],
    ["₹3.5k", 3500],
    ["teen-saade teen hazaar", 3500],
    ["saade teen hazaar", 3500],
    ["साढ़े तीन हज़ार", 3500],
    ["लगभग चार हजार रुपये", 4000],
    ["pandrah sau", 1500],
    ["dedh lakh", 150000],
    ["dhai hazar", 2500],
    ["2 hazaar", 2000],
    ["pata nahi", null],
  ])("%s → %s", (text, expected) => {
    expect(nlu.parseAmount(text as string)).toBe(expected);
  });
});

describe("intents", () => {
  it("yes / no, including Hindi tags", () => {
    expect(nlu.isYes("Haan ji, boliye")).toBe(true);
    expect(nlu.isYes("theek hai na")).toBe(true);
    expect(nlu.isYes("नहीं")).toBe(false);
    expect(nlu.isNo("nahi abhi nahi")).toBe(true);
  });
  it("do-not-call, human, busy, wrong number", () => {
    expect(nlu.wantsNoCalls("please dobara call mat karna")).toBe(true);
    expect(nlu.wantsHuman("kisi insaan se baat karao")).toBe(true);
    expect(nlu.isBusy("abhi busy hoon, baad mein")).toBe(true);
    expect(nlu.wrongNumber("galat number hai")).toBe(true);
  });
  it("topics", () => {
    expect(nlu.topicOf("battery backup bhi milega kya?")).toBe("OUT_OF_SCOPE");
    expect(nlu.topicOf("subsidy kitni milegi")).toBe("SUBSIDY");
    expect(nlu.topicOf("kitne ka padega")).toBe("PRICE");
    expect(nlu.topicOf("thoda discount kar do")).toBe("NEGOTIATION");
    expect(nlu.topicOf("what is the warranty?")).toBe("QUESTION");
  });
  it("segment, day and slot", () => {
    expect(nlu.detectSegment("ghar ke liye")).toBe("RESIDENTIAL");
    expect(nlu.detectSegment("meri dukaan hai")).toBe("COMMERCIAL");
    expect(nlu.detectSegment("फैक्ट्री के लिए")).toBe("INDUSTRIAL");
    expect(nlu.detectDayOffset("kal shaam", 3)).toBe(1);
    expect(nlu.detectSlot("kal shaam")).toBe("EVENING");
    expect(nlu.detectDayOffset("parson subah", 3)).toBe(2);
    expect(nlu.detectDayOffset("saturday", 3)).toBe(3);
    expect(nlu.parsePincode("122002 hai mera pin")).toBe("122002");
  });
});

describe("pricing tables", () => {
  it("sizes from the published bill guide", () => {
    expect(sizeFromBill(SIZING, 3500)?.kw).toBe(3);
    expect(sizeFromBill(SIZING, 2300)?.kw).toBe(2);
    expect(sizeFromBill(SIZING, 6000)?.kw).toBe(5);
    expect(sizeFromBill(SIZING, 22000)!.kw).toBeGreaterThan(10);
  });
  it("PM Surya Ghar central subsidy: 30k/kW to 2 kW, 18k for the 3rd kW, capped at 78k", () => {
    const rule = SUBSIDY[0];
    expect(subsidyAmount(rule, 1)).toBe(30000);
    expect(subsidyAmount(rule, 2)).toBe(60000);
    expect(subsidyAmount(rule, 3)).toBe(78000);
    expect(subsidyAmount(rule, 10)).toBe(78000);
    expect(subsidyFor(SUBSIDY, 3, "COMMERCIAL").eligible).toBe(false);
  });
  it("prices only from the sheet", () => {
    expect(priceFor(PRICES, 3, "RESIDENTIAL")?.priceMin).toBe(150000);
    expect(priceFor(PRICES, 4, "RESIDENTIAL")).toBeNull();
  });
  it("formats rupees the way the agent speaks", () => {
    expect(formatINR(65000)).toBe("₹65,000");
    expect(formatINR(150000)).toBe("₹1.5 lakh");
    expect(formatINR(180000, "hi")).toBe("₹1.8 लाख");
  });
});

describe("number guard", () => {
  it("blocks numbers no tool produced", () => {
    const a = new NumberAllowlist([48]).addFrom({ priceMin: 150000, total: 78000 }).add(1.5);
    expect(a.violations("Our team will call within 48 hours.")).toEqual([]);
    expect(a.violations("Subsidy is ₹78,000 and price ₹1.5 lakh.")).toEqual([]);
    expect(a.violations("You will save 40% every month.")).toEqual(["40"]);
  });
});

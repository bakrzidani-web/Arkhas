import { test } from "node:test";
import assert from "node:assert/strict";
process.env.DB_PATH = ":memory:";
process.env.MOCK = "1";
const { tokens, queryKey } = await import("../server/core/normalize.js");
const { matchOffer } = await import("../server/core/match.js");
const { parseAmount, detectCurrency, toAED } = await import("../server/core/currency.js");
const { search } = await import("../server/core/engine.js");

test("Arabic and English titles normalize to the same tokens", () => {
  assert.equal(queryKey("آيفون 17 برو 256 جيجا"), queryKey("Apple iPhone 17 Pro 256GB".replace("Apple ", "")));
  assert.ok(tokens("ماك بوك اير M4 13 إنش").includes("macbook"));
  assert.ok(tokens("١٢٨ جيجابايت").includes("128gb"));
  assert.ok(tokens("Samsung 65\" TV").includes("65inch"));
  assert.ok(tokens("AppleAirPods Pro 3").includes("airpods"));
});

test("matcher keeps the same product and rejects the rest", () => {
  const q = "iphone 17 pro 256gb";
  assert.equal(matchOffer(q, "Apple iPhone 17 Pro 256GB Deep Blue").ok, true);
  assert.equal(matchOffer(q, "ايفون 17 برو 256 جيجا").ok, true);
  assert.equal(matchOffer(q, "Apple iPhone 17 Pro Max 256GB").reason, "variant");
  assert.equal(matchOffer(q, "Apple iPhone 17 Pro 1TB").reason, "storage");
  assert.equal(matchOffer(q, "Apple iPhone 16 Pro 256GB").reason, "model");
  assert.equal(matchOffer(q, "Apple iPhone 17 Pro 256GB (Renewed)").reason, "used");
  assert.equal(matchOffer(q, "Tempered Glass Screen Protector iPhone 17 Pro").reason, "accessory");
  assert.equal(matchOffer(q, "Case for iPhone 17 Pro").reason, "accessory");
  assert.equal(matchOffer(q, "Apple iPhone 17 Pro 256 GB: 6.3-inch display, A19 Pro chip, 48MP Pro Fusion camera with Ultra Wide, Cosmic Orange").ok, true);
  assert.equal(matchOffer("iphone 17 pro", "Apple iPhone 17 Pro Max 512GB Silver").reason, "variant");
  assert.equal(matchOffer("playstation 5 pro", "Sony PlayStation 5 Pro Console Digital Edition 2TB").ok, true);
  assert.equal(matchOffer("playstation 5 slim", "PS5 Slim Digital Edition").reason, "variant");
  assert.equal(matchOffer("apple watch series 11 46mm", "Apple Watch Series 11 GPS 46mm Aluminium Case with Sport Band").ok, true);
  assert.equal(matchOffer("ps5 pro", "Sony PlayStation 5 Pro Console with DualSense Controller").ok, true);
  assert.equal(matchOffer("playstation 5 pro", "Sony PlayStation 5 Pro Console with DualSense Controller").ok, true);
});

test("prices and currencies parse", () => {
  assert.equal(parseAmount("AED 4,699.00"), 4699);
  assert.equal(parseAmount("1.299,50 €"), 1299.5);
  assert.equal(parseAmount("٣٥٣٫٥"), 353);
  assert.equal(detectCurrency("353.500 د.ك", "AED"), "KWD");
  assert.equal(detectCurrency("SAR 4,279", "AED"), "SAR");
  assert.ok(Math.abs(toAED(3.75, "SAR") - 3.6725) < 1e-9);
});

test("engine ranks by delivered price and filters decoys (mock data)", async () => {
  const r = await search({ q: "آيفون 17 برو 256 جيجا", country: "AE", scope: "gcc" });
  assert.ok(r.best, "has a best offer");
  assert.equal(r.best.deliverable, true);
  const deliverable = r.offers.filter(o => o.inStock && o.deliverable);
  for (let i = 1; i < deliverable.length; i++) assert.ok(deliverable[i].totalAED >= deliverable[i - 1].totalAED);
  assert.ok(r.offers.every(o => !/renewed|case/i.test(o.title)));
  assert.ok(r.dropped.length > 0, "decoys were dropped");
  const ids = r.offers.map(o => o.store.id + o.country);
  assert.equal(new Set(ids).size, ids.length, "one offer per store");
});

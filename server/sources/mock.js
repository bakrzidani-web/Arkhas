// Demo source used when no real source is configured (or MOCK=1).
// Produces believable but invented offers, plus a few decoys (accessories, used units, other storage)
// so the matching filter can be seen working. The UI shows a "demo data" banner while this is active.
import { searchText } from "../core/normalize.js";
import { AED_PER } from "../core/currency.js";
import { COUNTRIES } from "../config.js";

export const id = "mock";

const SELLERS = {
  AE: [["amazon.ae", "api"], ["noon", "agg"], ["Sharaf DG", "scrape"], ["Carrefour", "agg"], ["Lulu", "scrape"]],
  SA: [["amazon.sa", "api"], ["noon", "agg"], ["Jarir", "scrape"], ["eXtra", "agg"]],
  KW: [["Xcite", "scrape"], ["Blink", "agg"]],
  QA: [["Carrefour", "agg"], ["Jumbo", "scrape"]],
  BH: [["Sharaf DG", "scrape"], ["Lulu", "agg"]],
  OM: [["Lulu", "scrape"], ["Sharaf DG", "agg"]]
};
const LEVEL = { AE: 1, SA: 0.97, KW: 0.955, QA: 0.99, BH: 0.965, OM: 0.98 };
const GUESS = [
  [/iphone.*pro/, 4699], [/iphone/, 3399], [/galaxy.*ultra|s2\d ultra/, 4199], [/galaxy/, 2899], [/airpods/, 949],
  [/playstation|ps5/, 2299], [/switch/, 1849], [/macbook/, 3999], [/watch/, 1699], [/tv|65inch/, 2199],
  [/dyson/, 2899], [/nespresso|coffee/, 449], [/milk|baby/, 129], [/tide|detergent/, 54]
];

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = hash(seed); return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const title = s => s.replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/(\d+)gb\b/gi, "$1GB").replace(/\bIphone\b/g, "iPhone").replace(/\bIpad\b/g, "iPad").replace(/\bPlaystation\b/g, "PlayStation").replace(/\bAirpods\b/g, "AirPods").replace(/\bMacbook\b/g, "MacBook");

export async function search(q, country) {
  const text = searchText(q);
  const base = (GUESS.find(([re]) => re.test(text)) || [0, 150 + (hash(text) % 3000)])[1];
  const cur = COUNTRIES[country].cur;
  const out = [];
  for (const [seller, src] of SELLERS[country]) {
    const r = rng(text + "|" + country + "|" + seller);
    if (r() < 0.12) continue;
    const local = Math.round(base * LEVEL[country] * (1 + (r() * 0.15 - 0.09)) / AED_PER[cur] * (cur === "KWD" || cur === "BHD" || cur === "OMR" ? 10 : 1)) / (cur === "KWD" || cur === "BHD" || cur === "OMR" ? 10 : 1);
    out.push({ source: src, country, seller, title: title(text), price: local, currency: cur, url: "", image: "", deliveryFee: null, condition: "", inStock: r() > 0.1, mock: true });
    if (r() < 0.35) out.push({ source: src, country, seller, title: title(text) + " (Renewed)", price: +(local * 0.8).toFixed(2), currency: cur, url: "", image: "", deliveryFee: null, condition: "", inStock: true, mock: true });
    if (r() < 0.35) out.push({ source: src, country, seller, title: "Silicone Case for " + title(text), price: +(49 / AED_PER[cur]).toFixed(2), currency: cur, url: "", image: "", deliveryFee: null, condition: "", inStock: true, mock: true });
    if (/\d+gb/.test(text) && r() < 0.4) out.push({ source: src, country, seller, title: title(text.replace(/(\d+)gb/, (m, n) => n * 2 + "gb")), price: +(local * 1.18).toFixed(2), currency: cur, url: "", image: "", deliveryFee: null, condition: "", inStock: true, mock: true });
  }
  await new Promise(r => setTimeout(r, 250 + Math.random() * 300));
  return out;
}

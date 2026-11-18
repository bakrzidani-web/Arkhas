// Search inside one store's website: a Google search limited to that domain (site:noon.com …),
// through SerpApi. Works for any store whose product pages show a price in Google's results,
// so the user can add stores by their web address. Each store costs one SerpApi search.
import { config, COUNTRIES } from "../config.js";
import { detectCurrency, parseAmount } from "../core/currency.js";

export const id = "store";

const PRICE_RE = /(AED|SAR|KWD|QAR|BHD|OMR|د\.?\s?إ|ر\.?\s?س|د\.?\s?ك|ر\.?\s?ق|د\.?\s?ب|ر\.?\s?ع)\s?[\d.,]+|[\d.,]+\s?(AED|SAR|KWD|QAR|BHD|OMR|د\.?\s?إ|ر\.?\s?س|د\.?\s?ك|ر\.?\s?ق)/i;

/** Country of an offer from its link (noon.com/uae-en/…, trendyol …/sa/…, .ae, .sa …). */
export function countryFromUrl(url, fallback) {
  const u = String(url || "").toLowerCase();
  if (/\/(uae|ae)[-_/]|\.ae(\/|$)|[?&](country|region)=ae/.test(u)) return "AE";
  if (/\/(saudi|ksa|sa)[-_/]|\.sa(\/|$)|[?&](country|region)=sa/.test(u)) return "SA";
  if (/\/(kuwait|kw)[-_/]|\.kw(\/|$)/.test(u)) return "KW";
  if (/\/(qatar|qa)[-_/]|\.qa(\/|$)/.test(u)) return "QA";
  if (/\/(bahrain|bh)[-_/]|\.bh(\/|$)/.test(u)) return "BH";
  if (/\/(oman|om)[-_/]|\.om(\/|$)/.test(u)) return "OM";
  return fallback;
}

function priceOf(r) {
  const ext = [r.rich_snippet?.top?.detected_extensions, r.rich_snippet?.bottom?.detected_extensions, r.detected_extensions].filter(Boolean);
  for (const e of ext) {
    if (e.price != null) return { amount: Number(e.price), currencyText: e.currency || "" };
  }
  const texts = [r.price, ...(r.rich_snippet?.top?.extensions || []), ...(r.rich_snippet?.bottom?.extensions || []), r.snippet].filter(Boolean);
  for (const t of texts) {
    const m = String(t).match(PRICE_RE);
    if (m) return { amount: parseAmount(m[0]), currencyText: m[0] };
  }
  return null;
}

export async function search(q, country, domain) {
  if (!config.serpapiKey) return [];
  const c = COUNTRIES[country];
  const url = new URL("https://serpapi.com/search.json");
  url.search = new URLSearchParams({
    engine: "google", q: `site:${domain} ${q}`, gl: c.gl, hl: "en", google_domain: c.domain, num: "20", api_key: config.serpapiKey
  }).toString();
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    if (/hasn't returned any results/i.test(json.error || "")) return [];
    throw new Error(json.error || `Site search HTTP ${res.status}`);
  }
  const out = [];
  for (const r of json.organic_results || []) {
    const p = priceOf(r);
    if (!p || !(p.amount > 0)) continue;
    const offerCountry = countryFromUrl(r.link, country);
    out.push({
      source: id,
      country: offerCountry,
      seller: domain,
      title: r.title || "",
      price: p.amount,
      currency: detectCurrency(p.currencyText, COUNTRIES[offerCountry].cur),
      url: r.link || "",
      image: r.thumbnail || "",
      deliveryFee: null,
      condition: "",
      inStock: !/out of stock|غير متوفر|sold out/i.test(JSON.stringify(r.rich_snippet || {}))
    });
  }
  return out;
}

// Amazon UAE / Saudi search results through SerpApi's Amazon engine (same SERPAPI_KEY).
// Docs: https://serpapi.com/amazon-search-api
import { config, COUNTRIES } from "../config.js";
import { detectCurrency, parseAmount } from "../core/currency.js";

export const id = "store";
export const DOMAINS = { AE: "amazon.ae", SA: "amazon.sa" };

export async function search(q, country) {
  const domain = DOMAINS[country];
  if (!domain || !config.serpapiKey) return [];
  const url = new URL("https://serpapi.com/search.json");
  url.search = new URLSearchParams({ engine: "amazon", k: q, amazon_domain: domain, language: "en_AE", api_key: config.serpapiKey }).toString();
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    if (/hasn't returned any results|no results/i.test(json.error || "")) return [];
    throw new Error(json.error || `Amazon HTTP ${res.status}`);
  }
  const cur = COUNTRIES[country].cur;
  return (json.organic_results || []).filter(r => !r.sponsored).map(r => ({
    source: id,
    country,
    seller: domain,
    title: r.title || "",
    price: r.extracted_price ?? parseAmount(r.price),
    currency: detectCurrency(r.price, cur),
    url: r.link_clean || r.link || "",
    image: r.thumbnail || "",
    deliveryFee: null,
    condition: "",
    inStock: !/unavailable|out of stock/i.test(r.stock || "")
  })).filter(o => o.price > 0 && o.title);
}

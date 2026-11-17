// Source 1 — aggregated search: Google Shopping results through SerpApi.
// Docs: https://serpapi.com/google-shopping-api
import { config, COUNTRIES } from "../config.js";
import { detectCurrency, parseAmount } from "../core/currency.js";

export const id = "agg";
export const enabled = () => !!config.serpapiKey;

function parseDeliveryFee(delivery, cur) {
  if (!delivery) return null;
  const s = String(delivery);
  if (/free|مجان/i.test(s)) return { amount: 0, cur };
  const amt = parseAmount(s);
  return amt != null ? { amount: amt, cur: detectCurrency(s, cur) } : null;
}

export async function search(q, country) {
  const c = COUNTRIES[country];
  const url = new URL("https://serpapi.com/search.json");
  url.search = new URLSearchParams({
    engine: "google_shopping", q, gl: c.gl, hl: config.serpapiHl, google_domain: c.domain, api_key: config.serpapiKey
  }).toString();
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    // "Google hasn't returned any results" is a normal empty result, not a failure
    if (/hasn't returned any results/i.test(json.error || "")) return [];
    throw new Error(json.error || `SerpApi HTTP ${res.status}`);
  }
  const rows = [...(json.shopping_results || []), ...(json.inline_shopping_results || [])];
  return rows.map(r => {
    const cur = detectCurrency(r.price, c.cur);
    return {
      source: id,
      country,
      seller: r.source || r.merchant || "",
      title: r.title || "",
      price: r.extracted_price ?? parseAmount(r.price),
      currency: cur,
      url: r.link || r.product_link || "",
      image: r.thumbnail || r.serpapi_thumbnail || "",
      deliveryFee: parseDeliveryFee(r.delivery, cur),
      condition: r.second_hand_condition || "",
      inStock: true
    };
  }).filter(o => o.price > 0 && o.title);
}

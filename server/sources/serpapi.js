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

/**
 * Google Shopping fills its first page with the most popular sibling (e.g. "Pro Max" for an
 * "iPhone 17 Pro" search) and with used units. Excluding those up front leaves room for the
 * listings the user actually wants.
 */
export function refine(q) {
  const t = q.split(" ");
  const neg = [];
  if (t.includes("pro") && !t.includes("max")) neg.push("-max");
  if (t.some(w => /^s\d{2}$/.test(w)) && !t.some(w => ["ultra", "plus", "edge", "fe"].includes(w))) neg.push("-ultra", "-plus", "-edge");
  if (!t.some(w => ["used", "renewed", "refurbished"].includes(w))) neg.push("-renewed", "-refurbished", "-used");
  return [q, ...neg].join(" ");
}

export async function search(q, country) {
  const rows = await fetchRows(refine(q), country);
  // if the exclusions left nothing, fall back to the plain query
  return rows.length ? rows : fetchRows(q, country);
}

async function fetchRows(q, country) {
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
      inStock: true,
      pageToken: r.immersive_product_page_token || ""
    };
  }).filter(o => o.price > 0 && o.title);
}

/**
 * All the stores Google lists for one product (its "compare prices" panel), e.g. noon, Amazon,
 * Sharaf DG for the same iPhone. One SerpApi search per product.
 * Docs: https://serpapi.com/google-immersive-product-api
 */
export async function productStores(pageToken, country, fallbackTitle) {
  const c = COUNTRIES[country];
  const url = new URL("https://serpapi.com/search.json");
  url.search = new URLSearchParams({ engine: "google_immersive_product", page_token: pageToken, more_stores: "true", hl: config.serpapiHl, gl: c.gl, api_key: config.serpapiKey }).toString();
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error || `Product stores HTTP ${res.status}`);
  const p = json.product_results || {};
  return (p.stores || []).map(st => {
    const cur = detectCurrency(st.price, c.cur);
    const ship = st.shipping_extracted != null ? { amount: Number(st.shipping_extracted), cur } : parseDeliveryFee(st.shipping, cur);
    return {
      source: id,
      country,
      seller: st.name || "",
      title: st.title || p.title || fallbackTitle || "",
      price: st.extracted_price ?? parseAmount(st.price),
      currency: cur,
      url: st.link || "",
      image: (p.thumbnails || [])[0] || "",
      deliveryFee: ship,
      condition: "",
      inStock: !/out of stock|غير متوفر/i.test((st.details_and_offers || []).join(" "))
    };
  }).filter(o => o.price > 0 && o.title);
}

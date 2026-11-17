// Source 2 — official store API: Amazon Creators API (successor of PA-API 5, which Amazon retired in 2026).
// Covers amazon.ae and amazon.sa. Requires an approved Amazon Associates account in each marketplace.
// Docs: https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction
import { config, COUNTRIES } from "../config.js";

export const id = "api";
const A = config.amazon;
export const enabled = () => !!(A.clientId && A.clientSecret && (A.partnerTags.AE || A.partnerTags.SA));
export const countries = () => Object.keys(A.partnerTags).filter(k => A.partnerTags[k]);

let token = null, tokenExp = 0;
async function getToken() {
  if (token && Date.now() < tokenExp - 60_000) return token;
  const res = await fetch(A.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: A.clientId, client_secret: A.clientSecret, scope: "creatorsapi::default" }),
    signal: AbortSignal.timeout(10000)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) throw new Error(`Amazon token: ${json.error_description || json.error || res.status}`);
  token = json.access_token; tokenExp = Date.now() + (json.expires_in || 3600) * 1000;
  return token;
}

export async function search(q, country) {
  const tag = A.partnerTags[country];
  if (!tag) return [];
  const marketplace = COUNTRIES[country].amazon;
  const res = await fetch(A.apiBase + A.searchPath, {
    method: "POST",
    headers: { Authorization: `Bearer ${await getToken()}`, "Content-Type": "application/json", "x-marketplace": marketplace },
    body: JSON.stringify({
      partnerTag: tag, keywords: q, marketplace, itemCount: 10, availability: "IncludeOutOfStock",
      resources: ["itemInfo.title", "images.primary.medium", "offersV2.listings.price", "offersV2.listings.availability", "offersV2.listings.condition"]
    }),
    signal: AbortSignal.timeout(12000)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Amazon search: ${json.message || json.errors?.[0]?.message || res.status}`);
  const items = json.searchResult?.items || json.SearchResult?.Items || [];
  const out = [];
  for (const it of items) {
    const listings = it.offersV2?.listings || it.offers?.listings || [];
    const l = listings[0];
    const money = l?.price?.money || l?.price;
    if (!money?.amount) continue;
    out.push({
      source: id,
      country,
      seller: country === "SA" ? "amazon.sa" : "amazon.ae",
      title: it.itemInfo?.title?.displayValue || "",
      price: Number(money.amount),
      currency: money.currency || COUNTRIES[country].cur,
      url: it.detailPageURL || "",
      image: it.images?.primary?.medium?.url || "",
      deliveryFee: null,
      condition: l.condition?.value || l.condition?.type || "",
      inStock: !/OUT_OF_STOCK|UNAVAILABLE/i.test(l.availability?.type || "")
    });
  }
  return out;
}

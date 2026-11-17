// Known Gulf stores: Arabic display name and delivery estimates.
// Delivery numbers are estimates from each store's general policy: edit them in config/stores.json
// when a store changes its terms. Offers from unknown stores still appear; their delivery shows as "حسب المتجر".
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../config.js";

const FILE = path.join(ROOT, "config", "stores.json");
let STORES = [];
export function loadStores() {
  try { STORES = JSON.parse(fs.readFileSync(FILE, "utf8")).stores || []; }
  catch (e) { console.warn("[stores] could not read config/stores.json:", e.message); STORES = []; }
  return STORES;
}
loadStores();

const clean = s => String(s || "").toLowerCase().replace(/^www\./, "").replace(/[^a-z0-9؀-ۿ.]+/g, " ").trim();

function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } }

/**
 * Identify a store from the seller name returned by a source and/or the offer URL.
 * @returns {{id, name, known, country, domestic?: {freeOver, fee, days}, shipsTo: string[]}}
 */
export function identifyStore(sourceName, country, url) {
  const name = clean(sourceName), host = hostOf(url);
  for (const s of STORES) {
    if (s.country && s.country !== country) continue;
    const hit = (s.match || []).some(m => name.includes(m) || (host && host.includes(m)));
    if (hit) return { ...s, known: true };
  }
  const label = String(sourceName || host || "متجر").trim();
  return { id: (country + "-" + clean(label)).replace(/\s+/g, "-"), name: label, known: false, country, shipsTo: [] };
}

/** Delivery cost (AED) and days for an offer going to `userCountry`. */
export function delivery(store, offerCountry, userCountry, priceAED, parsedFeeAED) {
  if (offerCountry === userCountry) {
    if (parsedFeeAED != null) return { feeAED: parsedFeeAED, days: store.domestic?.days ?? null, known: true, deliverable: true, estimated: false };
    if (store.domestic) {
      const d = store.domestic;
      return { feeAED: priceAED >= (d.freeOverAED ?? Infinity) ? 0 : d.feeAED, days: d.days ?? null, known: true, deliverable: true, estimated: true };
    }
    return { feeAED: null, days: null, known: false, deliverable: true, estimated: true };
  }
  const cb = (store.crossBorder || {})[userCountry];
  if (cb) return { feeAED: cb.feeAED, days: cb.days ?? null, known: true, deliverable: true, estimated: true };
  return { feeAED: null, days: null, known: false, deliverable: false, estimated: true };
}

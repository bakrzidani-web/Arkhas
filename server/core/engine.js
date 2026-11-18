// The search pipeline:
//   1) ask every enabled source, for every country in scope, in parallel
//   2) keep only offers that are the same product (match.js)
//   3) convert to AED, identify the store, add delivery to the user's country
//   4) drop duplicates and price outliers, rank by the price that actually reaches the user
import { config, COUNTRIES } from "../config.js";
import { queryKey, searchText } from "./normalize.js";
import { parse, matchOffer, REASON_AR } from "./match.js";
import { toAED } from "./currency.js";
import { identifyStore, delivery } from "./stores.js";
import * as db from "./db.js";
import * as serpapi from "../sources/serpapi.js";
import * as amazon from "../sources/amazon.js";
import * as scraper from "../sources/scraper.js";
import * as mock from "../sources/mock.js";

const SOURCE_RANK = { api: 0, agg: 1, scrape: 2, mock: 3 };

export function activeSources() {
  const real = [
    { mod: serpapi, countries: Object.keys(COUNTRIES) },
    { mod: amazon, countries: amazon.countries() },
    { mod: scraper, countries: scraper.countries() }
  ].filter(s => s.mod.enabled());
  if (config.forceMock || real.length === 0) return { mock: true, list: [{ mod: mock, countries: Object.keys(COUNTRIES) }] };
  return { mock: false, list: real };
}

const cache = new Map();
function cached(key) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < config.cacheMinutes * 60_000) return hit.value;
  cache.delete(key);
  return null;
}
function remember(key, value) {
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
}

/** Raw offers for a query in a set of countries. Cached per query+country. */
async function collect(q, countries) {
  const { list, mock: isMock } = activeSources();
  const text = searchText(q) || q;
  const statuses = {};
  const offers = [];
  await Promise.all(countries.map(async (country) => {
    const key = `${queryKey(q)}|${country}|${isMock}`;
    let entry = cached(key);
    if (!entry) {
      entry = { offers: [], status: {} };
      await Promise.all(list.filter(s => s.countries.includes(country)).map(async ({ mod }) => {
        const t0 = Date.now();
        try {
          const rows = await mod.search(text, country);
          entry.offers.push(...rows);
          entry.status[mod.id] = { ok: true, count: rows.length, ms: Date.now() - t0 };
        } catch (e) {
          console.warn(`[${mod.id}] ${country}:`, e.message);
          entry.status[mod.id] = { ok: false, error: e.message, count: 0, ms: Date.now() - t0 };
        }
      }));
      // only cache when at least one source answered, so a temporary outage isn't remembered
      if (Object.values(entry.status).some(s => s.ok)) remember(key, entry);
    }
    offers.push(...entry.offers);
    for (const [src, st] of Object.entries(entry.status)) {
      const agg = statuses[src] ||= { ok: false, count: 0, errors: 0 };
      agg.ok ||= st.ok; agg.count += st.count; if (!st.ok) agg.errors++;
    }
  }));
  return { offers, statuses, mock: isMock };
}

const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/**
 * @param {{q: string, country: string, scope?: "local"|"gcc", markets?: string[]}} p
 *   markets: the countries whose stores to search (the user picks them); defaults from scope.
 */
export async function search({ q, country, scope, markets }) {
  const qkey = queryKey(q);
  const countries = markets && markets.length ? [...new Set(markets)] : scope === "gcc" ? Object.keys(COUNTRIES) : [country];
  const histKey = country + (countries.length === 1 && countries[0] === country ? "" : ":" + [...countries].sort().join(","));
  const { offers: raw, statuses, mock: isMock } = await collect(q, countries);
  const qp = parse(q);
  const dropped = {};
  const samples = {};
  const drop = (reason, title) => {
    dropped[reason] = (dropped[reason] || 0) + 1;
    if (title && (samples[reason] ||= []).length < 3) samples[reason].push(String(title).slice(0, 120));
  };

  let offers = [];
  for (const o of raw) {
    const m = matchOffer(qp, o.title, { condition: o.condition });
    if (!m.ok) { drop(m.reason, o.title); continue; }
    const priceAED = toAED(o.price, o.currency);
    if (priceAED == null) { drop("currency"); continue; }
    const store = identifyStore(o.seller, o.country, o.url);
    const feeAED = o.deliveryFee ? toAED(o.deliveryFee.amount, o.deliveryFee.currency) : null;
    const d = delivery(store, o.country, country, priceAED, feeAED);
    offers.push({
      store: { id: store.id, name: store.name, known: store.known },
      country: o.country, source: o.source, title: o.title, url: o.url, image: o.image,
      price: o.price, currency: o.currency, priceAED,
      deliveryAED: d.feeAED, deliveryKnown: d.known, deliveryEstimated: d.estimated, days: d.days,
      deliverable: d.deliverable, domestic: o.country === country,
      totalAED: priceAED + (d.feeAED || 0),
      inStock: o.inStock !== false, suspect: !!m.suspect, score: m.score
    });
  }

  // outliers: accessories that slipped through and listing errors. The reference price comes from
  // the most trustworthy offers: known stores first, then any non-suspect offer.
  const pick = (f) => offers.filter(f).map(o => o.priceAED);
  const trusted = pick(o => !o.suspect && o.store.known);
  const med = median(trusted.length >= 2 ? trusted : pick(o => !o.suspect)) || median(pick(() => true));
  offers = offers.filter(o => {
    const low = o.suspect ? 0.7 : 0.45;
    if (med && (o.priceAED < med * low || o.priceAED > med * 2.5)) { drop("outlier", o.title); return false; }
    return true;
  });

  // one offer per store and country: the cheapest in-stock one; on a tie, the most trusted source
  offers.sort((a, b) => SOURCE_RANK[a.source] - SOURCE_RANK[b.source]);
  const perStore = new Map();
  for (const o of offers) {
    const k = `${o.store.id}|${o.country}`, p = perStore.get(k);
    const better = !p || (o.inStock && !p.inStock) || (o.inStock === p.inStock && o.priceAED < p.priceAED - 0.5);
    if (better) perStore.set(k, o);
  }
  if (offers.length > perStore.size) dropped.duplicate = (dropped.duplicate || 0) + offers.length - perStore.size;
  offers = [...perStore.values()];

  offers.sort((a, b) => (b.inStock - a.inStock) || (b.deliverable - a.deliverable) || a.totalAED - b.totalAED);
  const ranked = offers.filter(o => o.inStock && o.deliverable);
  const best = ranked[0] || null;
  const localBest = offers.find(o => o.inStock && o.domestic) || null;

  if (best) {
    try { db.recordBest(qkey, histKey, best.totalAED, best.store.name); } catch (e) { console.warn("[db]", e.message); }
  }
  try { if (raw.length) db.logSearch(qkey, q.trim()); } catch { /* ignore */ }

  const avg = ranked.length ? ranked.reduce((s, o) => s + o.totalAED, 0) / ranked.length : null;
  return {
    q, qkey, country, markets: countries, mock: isMock,
    fetchedAt: new Date().toISOString(),
    image: (best && best.image) || (offers.find(o => o.image) || {}).image || "",
    best, localBest,
    stats: {
      offers: ranked.length,
      stores: new Set(offers.map(o => o.store.id)).size,
      countries: new Set(offers.map(o => o.country)).size,
      avgAED: avg,
      maxAED: ranked.length ? ranked[ranked.length - 1].totalAED : null
    },
    offers,
    dropped: Object.entries(dropped).map(([reason, count]) => ({ reason, label: REASON_AR[reason] || reason, count, samples: samples[reason] || [] })),
    sources: statuses,
    history: db.history(qkey, histKey)
  };
}

/** Lowest deliverable total (AED) for an alert check. */
export async function bestPrice(q, country) {
  const r = await search({ q, country, scope: "local" });
  return r.best ? r.best.totalAED : null;
}

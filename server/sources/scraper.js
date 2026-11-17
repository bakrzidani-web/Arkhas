// Source 3 — reading store pages, for stores with no API and little Google Shopping coverage.
// Each store is configured in config/scrapers.json and starts disabled. Before enabling one:
//   1) check the store's terms of use allow automated reading, 2) fill in its CSS selectors,
//   3) test it with:  node server/sources/scraper.js <storeId> "iphone 17 pro"
// robots.txt is checked on every run; a disallowed path is skipped.
import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import { ROOT, config } from "../config.js";
import { parseAmount, detectCurrency } from "../core/currency.js";

export const id = "scrape";
const FILE = path.join(ROOT, "config", "scrapers.json");
const UA = `ArkhasPriceBot/1.0 (+${config.scraperContact || "price comparison"})`;

function load() {
  try { return (JSON.parse(fs.readFileSync(FILE, "utf8")).stores || []).filter(s => s.enabled); }
  catch { return []; }
}
export const enabled = () => load().length > 0;
export const countries = () => [...new Set(load().map(s => s.country))];

const robotsCache = new Map();
async function allowed(urlStr) {
  const u = new URL(urlStr);
  let rules = robotsCache.get(u.origin);
  if (!rules) {
    rules = [];
    try {
      const txt = await (await fetch(u.origin + "/robots.txt", { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(5000) })).text();
      let applies = false;
      for (const line of txt.split(/\r?\n/)) {
        const [k, ...rest] = line.split(":"); const v = rest.join(":").trim();
        if (/^user-agent$/i.test(k.trim())) applies = v === "*" || /arkhas/i.test(v);
        else if (applies && /^disallow$/i.test(k.trim()) && v) rules.push(v);
      }
    } catch { /* no robots.txt: allowed */ }
    robotsCache.set(u.origin, rules);
  }
  return !rules.some(r => (u.pathname + u.search).startsWith(r.replace(/\*.*$/, "")));
}

function fromJsonLd($, store) {
  const out = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    let data; try { data = JSON.parse($(el).contents().text()); } catch { return; }
    const list = [].concat(data["@graph"] || data);
    for (const node of list) {
      const items = node["@type"] === "ItemList" ? (node.itemListElement || []).map(x => x.item || x) : [node];
      for (const p of items) {
        if (p?.["@type"] !== "Product") continue;
        const offer = [].concat(p.offers || [])[0] || {};
        const price = parseAmount(offer.price ?? offer.lowPrice);
        if (!price) continue;
        out.push({ title: p.name, price, currency: offer.priceCurrency || store.currency, url: p.url || offer.url, image: [].concat(p.image || [])[0] || "", inStock: !/OutOfStock/i.test(offer.availability || "") });
      }
    }
  });
  return out;
}

async function searchStore(store, q) {
  const url = store.searchUrl.replace("{q}", encodeURIComponent(q));
  if (!(await allowed(url))) throw new Error(`${store.id}: blocked by robots.txt`);
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ar,en;q=0.8" }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`${store.id}: HTTP ${res.status}`);
  const $ = cheerio.load(await res.text());
  let rows = fromJsonLd($, store);
  const S = store.selectors || {};
  if (!rows.length && S.item) {
    $(S.item).slice(0, 20).each((_, el) => {
      const $el = $(el);
      const priceText = $el.find(S.price).first().text();
      const href = $el.find(S.link).first().attr("href") || "";
      rows.push({
        title: $el.find(S.title).first().text().trim(),
        price: parseAmount(priceText),
        currency: detectCurrency(priceText, store.currency),
        url: href ? new URL(href, url).toString() : url,
        image: $el.find(S.image).first().attr("src") || "",
        inStock: S.outOfStock ? $el.find(S.outOfStock).length === 0 : true
      });
    });
  }
  return rows.filter(r => r.title && r.price > 0).map(r => ({
    source: id, country: store.country, seller: store.sellerName || store.id, deliveryFee: null, condition: "", ...r
  }));
}

export async function search(q, country) {
  const stores = load().filter(s => s.country === country);
  const settled = await Promise.allSettled(stores.map(s => searchStore(s, q)));
  const out = [];
  settled.forEach((r, i) => r.status === "fulfilled" ? out.push(...r.value) : console.warn("[scrape]", stores[i].id, r.reason?.message));
  return out;
}

// CLI test: node server/sources/scraper.js <storeId> "<query>"
if (process.argv[1] && process.argv[1].endsWith("scraper.js") && process.argv[2]) {
  const all = JSON.parse(fs.readFileSync(FILE, "utf8")).stores;
  const s = all.find(x => x.id === process.argv[2]);
  if (!s) { console.error("unknown store id"); process.exit(1); }
  searchStore(s, process.argv[3] || "iphone").then(r => console.log(r.slice(0, 5)), e => console.error(e.message));
}

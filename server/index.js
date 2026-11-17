import express from "express";
import path from "node:path";
import { config, COUNTRIES, ROOT } from "./config.js";
import { search, activeSources } from "./core/engine.js";
import { queryKey } from "./core/normalize.js";
import { toAED } from "./core/currency.js";
import * as db from "./core/db.js";
import { startAlertChecker } from "./alerts.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "20kb" }));
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(self)"
  });
  next();
});

// simple per-IP limiter for the search endpoint (protects the SerpApi quota)
const hits = new Map();
function limit(req, res, next) {
  const ip = req.ip, now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < 60_000);
  if (arr.length >= config.rateLimitPerMinute) return res.status(429).json({ error: "طلبات كثيرة، جرّب بعد دقيقة" });
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  next();
}

const validCountry = c => (COUNTRIES[c] ? c : "AE");

app.get("/api/config", (req, res) => {
  const { mock, list } = activeSources();
  res.json({
    mock,
    sources: Object.fromEntries(list.map(s => [s.mod.id, s.countries])),
    countries: COUNTRIES
  });
});

app.get("/api/search", limit, async (req, res) => {
  const q = String(req.query.q || "").trim().slice(0, 120);
  if (q.length < 2) return res.status(400).json({ error: "اكتب اسم المنتج" });
  try {
    res.json(await search({ q, country: validCountry(req.query.country), scope: req.query.scope === "gcc" ? "gcc" : "local" }));
  } catch (e) {
    console.error("[search]", e);
    res.status(500).json({ error: "صار خطأ أثناء البحث، جرّب مرة ثانية" });
  }
});

app.get("/api/suggest", (req, res) => {
  const t = String(req.query.q || "").trim().slice(0, 60);
  res.json({ suggestions: t ? db.suggest(t) : [], popular: db.popularSearches() });
});

app.post("/api/alerts", (req, res) => {
  const { q, country, target, contact } = req.body || {};
  const c = validCountry(country);
  const t = Number(target);
  if (!q || !(t > 0)) return res.status(400).json({ error: "بيانات التنبيه ناقصة" });
  const targetAED = toAED(t, COUNTRIES[c].cur);
  const id = db.addAlert({ q: String(q).slice(0, 120), qkey: queryKey(q), country: c, targetAED, contact: contact ? String(contact).slice(0, 120) : null });
  res.json({ id });
});

app.get("/api/alerts", (req, res) => {
  const ids = String(req.query.ids || "").split(",").map(Number).filter(Boolean).slice(0, 50);
  res.json({ alerts: ids.map(id => db.alertById(id)).filter(Boolean).map(a => ({
    id: a.id, q: a.q, country: a.country, targetAED: a.target_aed, lastBestAED: a.last_best_aed,
    lastCheckedAt: a.last_checked_at, triggeredAt: a.triggered_at
  })) });
});

app.delete("/api/alerts/:id", (req, res) => { db.deleteAlert(Number(req.params.id)); res.json({ ok: true }); });

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use(express.static(path.join(ROOT, "public"), { maxAge: "1h", index: "index.html" }));

app.listen(config.port, () => {
  const { mock, list } = activeSources();
  console.log(`أرخص يشتغل على http://localhost:${config.port}`);
  console.log(mock ? "⚠ وضع تجريبي: ما فيه مصدر أسعار مفعّل. أضف SERPAPI_KEY في ملف .env" : `المصادر المفعّلة: ${list.map(s => s.mod.id).join(", ")}`);
  startAlertChecker();
});

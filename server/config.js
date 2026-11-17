// Central configuration. Values come from environment variables (.env is loaded automatically).
import { fileURLToPath } from "node:url";
import path from "node:path";

try { process.loadEnvFile(); } catch { /* no .env file: rely on the real environment */ }

const env = (k, d) => (process.env[k] ?? "").trim() || d;
const num = (k, d) => { const v = Number(process.env[k]); return Number.isFinite(v) && v > 0 ? v : d; };

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const COUNTRIES = {
  AE: { name: "الإمارات", cur: "AED", gl: "ae", domain: "google.ae", amazon: "www.amazon.ae" },
  SA: { name: "السعودية", cur: "SAR", gl: "sa", domain: "google.com.sa", amazon: "www.amazon.sa" },
  KW: { name: "الكويت", cur: "KWD", gl: "kw", domain: "google.com.kw" },
  QA: { name: "قطر", cur: "QAR", gl: "qa", domain: "google.com.qa" },
  BH: { name: "البحرين", cur: "BHD", gl: "bh", domain: "google.com.bh" },
  OM: { name: "عُمان", cur: "OMR", gl: "om", domain: "google.com.om" }
};

export const config = {
  port: num("PORT", 3000),
  serpapiKey: env("SERPAPI_KEY", ""),
  serpapiHl: env("SERPAPI_HL", "en"),
  amazon: {
    clientId: env("AMAZON_CLIENT_ID", ""),
    clientSecret: env("AMAZON_CLIENT_SECRET", ""),
    // Credential version 3.2 (EU region) covers amazon.ae and amazon.sa
    tokenUrl: env("AMAZON_TOKEN_URL", "https://api.amazon.co.uk/auth/o2/token"),
    apiBase: env("AMAZON_API_BASE", "https://creatorsapi.amazon"),
    searchPath: env("AMAZON_SEARCH_PATH", "/catalog/v1/searchItems"),
    partnerTags: { AE: env("AMAZON_PARTNER_TAG_AE", ""), SA: env("AMAZON_PARTNER_TAG_SA", "") }
  },
  scraperContact: env("SCRAPER_CONTACT", ""),
  forceMock: env("MOCK", "") === "1",
  cacheMinutes: num("CACHE_MINUTES", 30),
  alertCheckHours: num("ALERT_CHECK_HOURS", 6),
  alertWebhook: env("ALERT_WEBHOOK_URL", ""),
  kwdToAed: num("KWD_TO_AED", 11.95),
  dbPath: env("DB_PATH", path.join(ROOT, "data", "arkhas.db")),
  rateLimitPerMinute: num("RATE_LIMIT_PER_MINUTE", 30)
};

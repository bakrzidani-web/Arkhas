// Re-checks every pending price alert on a schedule. When the best price reaches the target,
// the alert is marked as triggered (the app shows it), and if ALERT_WEBHOOK_URL is set a JSON
// message is posted there. A webhook can forward to WhatsApp, Telegram or email through
// services such as Make, Zapier or n8n.
import { config, COUNTRIES } from "./config.js";
import { bestPrice } from "./core/engine.js";
import { AED_PER } from "./core/currency.js";
import * as db from "./core/db.js";

async function notify(alert, bestAED) {
  if (!config.alertWebhook) return;
  const cur = COUNTRIES[alert.country].cur;
  const local = (v) => +(v / AED_PER[cur]).toFixed(cur === "AED" || cur === "SAR" || cur === "QAR" ? 2 : 3);
  try {
    await fetch(config.alertWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "price_alert", alertId: alert.id, product: alert.q, country: alert.country, currency: cur,
        target: local(alert.target_aed), price: local(bestAED), contact: alert.contact,
        message: `نزل سعر ${alert.q} إلى ${local(bestAED)} ${cur}`
      }),
      signal: AbortSignal.timeout(10000)
    });
  } catch (e) { console.warn("[alerts] webhook failed:", e.message); }
}

export async function checkAlerts() {
  const list = db.pendingAlerts();
  for (const a of list) {
    try {
      const best = await bestPrice(a.q, a.country);
      const hit = best != null && best <= a.target_aed;
      db.updateAlert(a.id, best, hit);
      if (hit) await notify(a, best);
    } catch (e) { console.warn("[alerts]", a.id, e.message); }
  }
  if (list.length) console.log(`[alerts] checked ${list.length}`);
}

export function startAlertChecker() {
  const every = config.alertCheckHours * 3600_000;
  setTimeout(() => checkAlerts(), 60_000);
  setInterval(() => checkAlerts(), every).unref();
}

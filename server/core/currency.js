// GCC currencies are pegged to the US dollar (Kuwait uses a basket), so fixed rates are accurate enough.
import { config } from "../config.js";

const USD = 3.6725;
export const AED_PER = {
  AED: 1,
  USD,
  SAR: USD / 3.75,
  QAR: USD / 3.64,
  BHD: USD / 0.376,
  OMR: USD / 0.3845,
  KWD: config.kwdToAed
};

const SYMBOLS = [
  [/\bAED\b|د\.?\s?إ|درهم/i, "AED"],
  [/\bSAR\b|ر\.?\s?س|ريال سعودي|﷼/i, "SAR"],
  [/\bKWD\b|د\.?\s?ك|دينار كويتي/i, "KWD"],
  [/\bQAR\b|ر\.?\s?ق|ريال قطري/i, "QAR"],
  [/\bBHD\b|د\.?\s?ب|دينار بحريني/i, "BHD"],
  [/\bOMR\b|ر\.?\s?ع|ريال عماني/i, "OMR"],
  [/\bUSD\b|US\$|\$/i, "USD"]
];

export function detectCurrency(str, fallback) {
  for (const [re, c] of SYMBOLS) if (re.test(str || "")) return c;
  return fallback;
}

/** "AED 4,699.00" → 4699 ; "1.299,50" → 1299.5 */
export function parseAmount(str) {
  if (typeof str === "number") return str;
  const m = String(str || "").replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).match(/\d[\d.,\s]*/);
  if (!m) return null;
  let s = m[0].replace(/\s/g, "");
  if (/,\d{1,2}$/.test(s) && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : null;
}

export const toAED = (amount, cur) => (AED_PER[cur] ? amount * AED_PER[cur] : null);

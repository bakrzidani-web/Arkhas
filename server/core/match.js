// Decides whether an offer title is the same product the user searched for.
// This is the step that keeps "iPhone 17 Pro 256GB" from being compared with a
// "Pro Max", a 512GB model, a used unit or a phone case.
import { tokens, STOP } from "./normalize.js";

const VARIANTS = new Set(["pro", "max", "ultra", "plus", "mini", "air", "lite", "fe", "slim", "digital", "oled", "se", "edge", "fold", "flip"]);
// Words that often mean an accessory. Some also appear in real product titles
// ("Apple Watch … Aluminium Case with Sport Band"), so on their own they only mark an offer as suspect;
// the engine then rejects suspects priced far below the real product.
const ACCESSORY = new Set(["case", "cases", "cover", "covers", "protector", "protectors", "glass", "tempered", "charger", "chargers", "cable", "cables", "adapter", "strap", "straps", "band", "bands", "skin", "skins", "sticker", "stickers", "holder", "stand", "mount", "sleeve", "pouch", "dock", "lens", "controller", "controllers", "faceplate", "decal", "keychain", "toy", "replica", "dummy"]);
const ACCESSORY_STRONG = new Set(["compatible", "replacement", "protector", "protectors", "tempered", "sticker", "stickers", "skin", "skins", "decal", "faceplate", "replica", "dummy", "keychain"]);
const USED = new Set(["used", "renewed", "refurbished", "preowned", "pre", "owned", "openbox", "مستعمل", "مجدد"]);
const STORAGE = /^\d+(gb|tb)$/;
const SIZE = /^\d+(\.\d+)?(inch|mm|l|ml|g)$/;
const MODEL = /\d/; // any token with a digit: 17, s25, m4, v15, 65inch…

export function parse(text) {
  const t = tokens(text).filter(w => !STOP.has(w));
  const set = new Set(t);
  return {
    set,
    list: t,
    storage: t.filter(w => STORAGE.test(w)),
    sizes: t.filter(w => SIZE.test(w)),
    models: t.filter(w => MODEL.test(w) && !STORAGE.test(w) && !SIZE.test(w)),
    variants: t.filter(w => VARIANTS.has(w)),
    words: t.filter(w => !MODEL.test(w) && !VARIANTS.has(w)),
    wantsAccessory: t.some(w => ACCESSORY.has(w)),
    wantsUsed: t.some(w => USED.has(w))
  };
}

/**
 * @returns {{ok: boolean, reason?: string, score: number, suspect?: boolean}}
 * reasons: accessory | used | storage | size | variant | model | irrelevant
 */
export function matchOffer(query, title, { condition } = {}) {
  const q = typeof query === "string" ? parse(query) : query;
  const t = parse(title);

  if (!q.wantsUsed && (t.set.has("used") || t.set.has("renewed") || t.set.has("refurbished") || t.set.has("مستعمل") || t.set.has("مجدد") || (condition && !/new|جديد/i.test(condition))))
    return { ok: false, reason: "used", score: 0 };

  let suspect = false;
  if (!q.wantsAccessory) {
    const raw = tokens(title);
    if (raw.some(w => ACCESSORY_STRONG.has(w))) return { ok: false, reason: "accessory", score: 0 };
    const forIdx = raw.indexOf("for");
    // "Case for iPhone 17 Pro" / "Charger for PS5": an accessory word before "for"
    if (forIdx > 0 && raw.slice(0, forIdx).some(w => ACCESSORY.has(w))) return { ok: false, reason: "accessory", score: 0 };
    suspect = raw.some(w => ACCESSORY.has(w));
  }

  if (q.storage.length && t.storage.length && !q.storage.some(s => t.storage.includes(s))) return { ok: false, reason: "storage", score: 0 };
  if (q.sizes.length && t.sizes.length && !q.sizes.some(s => t.sizes.includes(s))) return { ok: false, reason: "size", score: 0 };

  for (const v of q.variants) if (!t.set.has(v)) return { ok: false, reason: "variant", score: 0 };
  // A variant word in the title only means a different product when it sits right after the
  // product name ("iPhone 17 Pro MAX"); long store titles also mention "Ultra Wide camera" etc.
  if (variantAfterName(q, t.list)) return { ok: false, reason: "variant", score: 0 };

  for (const m of q.models) if (!t.set.has(m)) return { ok: false, reason: "model", score: 0 };

  const words = q.words.filter(w => !STORAGE.test(w));
  const hit = words.filter(w => t.set.has(w)).length;
  const score = words.length ? hit / words.length : 1;
  // brand words may be missing from the title (e.g. "iPhone 17 Pro" without "Apple"), so require most, not all
  if (score < 0.5) return { ok: false, reason: "irrelevant", score };
  return { ok: true, score, suspect };
}

function variantAfterName(q, titleTokens) {
  const anchors = [...q.models, ...q.variants];
  if (!anchors.length) return false;
  for (let i = 0; i < titleTokens.length; i++) {
    if (!anchors.includes(titleTokens[i])) continue;
    // walk past the run of query tokens (e.g. "17 pro"), then look at the next token
    let j = i;
    while (j + 1 < titleTokens.length && (anchors.includes(titleTokens[j + 1]) || q.set.has(titleTokens[j + 1]))) j++;
    const next = titleTokens[j + 1];
    if (next && VARIANTS.has(next) && !q.variants.includes(next)) return true;
    i = j;
  }
  return false;
}

export const REASON_AR = {
  accessory: "إكسسوارات",
  used: "مستعمل أو مجدد",
  storage: "سعة مختلفة",
  size: "مقاس مختلف",
  variant: "نسخة مختلفة",
  model: "موديل مختلف",
  irrelevant: "منتج مختلف",
  outlier: "سعر غير منطقي",
  currency: "عملة غير معروفة",
  duplicate: "عرض مكرر"
};

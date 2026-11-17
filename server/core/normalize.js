// Text normalization shared by the matcher, the cache key and the history key.
// Arabic and English product titles are mapped onto one vocabulary so that
// "آيفون 17 برو 256 جيجا" and "Apple iPhone 17 Pro 256GB" compare token by token.

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

// Arabic (already normalized: أإآ→ا, ة→ه, ى→ي) → English token(s)
const DICT = {
  "ايفون": "iphone", "ابل": "apple", "سامسونج": "samsung", "جالكسي": "galaxy", "جالاكسي": "galaxy", "غالاكسي": "galaxy",
  "برو": "pro", "ماكس": "max", "الترا": "ultra", "بلس": "plus", "ميني": "mini", "اير": "air", "لايت": "lite",
  "ماك": "mac", "بوك": "book", "ماكبوك": "macbook", "ايباد": "ipad", "ساعه": "watch", "ايربودز": "airpods", "ايربود": "airpods",
  "بلايستيشن": "playstation", "بلاستيشن": "playstation", "سوني": "sony", "نينتندو": "nintendo", "سويتش": "switch",
  "اكس": "x", "بوكس": "box", "اكسبوكس": "xbox", "دايسون": "dyson", "مكنسه": "vacuum", "تلفزيون": "tv", "تلفاز": "tv",
  "هواوي": "huawei", "شاومي": "xiaomi", "لينوفو": "lenovo", "ديل": "dell", "اتش": "h", "بي": "p", "لابتوب": "laptop",
  "حليب": "milk", "اطفال": "baby", "نسبريسو": "nespresso", "نسبرسو": "nespresso", "قهوه": "coffee", "تايد": "tide",
  "اسود": "black", "ابيض": "white", "ازرق": "blue", "ذهبي": "gold", "فضي": "silver", "رمادي": "gray", "وردي": "pink",
  "جراب": "case", "كفر": "case", "غطاء": "cover", "حمايه": "protector", "شاحن": "charger", "كيبل": "cable", "سلك": "cable",
  "حزام": "strap", "ستاند": "stand", "لاصقه": "protector", "مستعمل": "used", "مجدد": "refurbished",
  "سماعه": "headphones", "سماعات": "headphones",
  "ps5": "playstation 5", "ps4": "playstation 4", "بس5": "playstation 5"
};
const UNITS = [
  [/^(جيجا|جيجابايت|غيغابايت|جيجابايت|gb|g\.b)$/, "gb"],
  [/^(تيرا|تيرابايت|tb)$/, "tb"],
  [/^(انش|بوصه|inch|inches|in)$/, "inch"],
  [/^(مم|mm)$/, "mm"],
  [/^(لتر|l|ltr|litre|liter)$/, "l"],
  [/^(جم|جرام|غرام|g|gm|gram|grams)$/, "g"],
  [/^(مل|ml)$/, "ml"]
];
const JOIN = [["mac book", "macbook"], ["play station", "playstation"], ["air pods", "airpods"], ["x box", "xbox"], ["h p", "hp"]];
export const STOP = new Set(["و", "مع", "من", "في", "على", "جديد", "اصلي", "نسخه", "لون", "new", "original", "with", "and", "the", "for", "in", "of", "by", "a", "an", "-", "|", "جوال", "هاتف", "موبايل", "phone", "smartphone", "mobile", "5g", "4g", "dual", "sim", "nano", "esim", "version", "international", "middle", "east", "ksa", "uae", "gcc"]);

export function basic(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[٠-٩]/g, d => String(AR_DIGITS.indexOf(d)))
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
    .replace(/(\d),(\d{3})/g, "$1$2")
    .replace(/["”“″]/g, " inch ")
    .replace(/[^\p{L}\p{N}.]+/gu, " ")
    .replace(/\.(?!\d)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokens(s) {
  let t = basic(s)
    // split letters glued to numbers: "256gb"→"256 gb", "iphone17"→"iphone 17" (keep short model codes like s25, m4, v15)
    .replace(/(\d)([a-z؀-ۿ]{1,})/g, "$1 $2")
    .replace(/([a-z]{3,})(\d)/g, "$1 $2")
    .replace(/([؀-ۿ]{2,})(\d)/g, "$1 $2")
    .split(" ").filter(Boolean)
    .flatMap(w => (DICT[w] ?? (w.startsWith("ال") && DICT[w.slice(2)] ? DICT[w.slice(2)] : w)).split(" "));
  let joined = " " + t.join(" ") + " ";
  for (const [a, b] of JOIN) joined = joined.replaceAll(" " + a + " ", " " + b + " ");
  t = joined.trim().split(" ").filter(Boolean);
  // join number + unit → "256gb"
  const out = [];
  for (let i = 0; i < t.length; i++) {
    const w = t[i], next = t[i + 1];
    if (/^\d+(\.\d+)?$/.test(w) && next) {
      const unit = UNITS.find(([re]) => re.test(next));
      if (unit) { out.push(w + unit[1]); i++; continue; }
    }
    const unitAlone = UNITS.find(([re]) => re.test(w));
    if (unitAlone && /^\d+(\.\d+)?$/.test(out[out.length - 1] || "")) { out[out.length - 1] += unitAlone[1]; continue; }
    out.push(w);
  }
  // 1tb == 1024gb
  return out.map(w => w === "1tb" ? "1024gb" : w === "2tb" ? "2048gb" : w);
}

/** Stable key for cache/history: meaningful tokens, sorted. */
export function queryKey(q) {
  return [...new Set(tokens(q).filter(w => !STOP.has(w)))].sort().join(" ");
}

/** Query text sent to search engines: Arabic brand words become English, which Google Shopping matches better in the Gulf. */
export function searchText(q) {
  return tokens(q).filter(w => !STOP.has(w)).join(" ");
}

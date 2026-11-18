// أرخص — front end. Talks to the server's /api endpoints; all price logic lives on the server.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- Reference data ---------- */
const COUNTRIES = {
  AE: { name: "الإمارات", cur: "AED" }, SA: { name: "السعودية", cur: "SAR" }, KW: { name: "الكويت", cur: "KWD" },
  QA: { name: "قطر", cur: "QAR" }, BH: { name: "البحرين", cur: "BHD" }, OM: { name: "عُمان", cur: "OMR" }
};
const USD = 3.6725;
const CUR = {
  AED: { s: "د.إ", d: 0, aed: 1 }, SAR: { s: "ر.س", d: 0, aed: USD / 3.75 }, QAR: { s: "ر.ق", d: 0, aed: USD / 3.64 },
  KWD: { s: "د.ك", d: 3, aed: 11.95 }, BHD: { s: "د.ب", d: 3, aed: USD / 0.376 }, OMR: { s: "ر.ع", d: 3, aed: USD / 0.3845 },
  USD: { s: "$", d: 2, aed: USD }
};
const SRC = { api: "واجهة رسمية", agg: "خدمة بحث", store: "بحث في المتجر", scrape: "سحب من الموقع", mock: "تجريبي" };
// Stores the user can turn on. "amazon" uses Amazon's own search; the rest are searched by web address.
const STORE_CHOICES = [
  { id: "amazon", name: "أمازون" }, { id: "noon.com", name: "نون" }, { id: "trendyol.com", name: "ترينديول" },
  { id: "sharafdg.com", name: "شرف دي جي" }, { id: "carrefouruae.com", name: "كارفور" }, { id: "jarir.com", name: "جرير" },
  { id: "extra.com", name: "إكسترا" }, { id: "xcite.com", name: "إكسايت" }, { id: "luluhypermarket.com", name: "لولو" },
  { id: "namshi.com", name: "نمشي" }
];
const MAX_STORES = 6;
const FALLBACK_POPULAR = ["آيفون 17 برو 256", "بلايستيشن 5 برو", "AirPods Pro 3", "نينتندو سويتش 2", "سامسونج S25 ألترا", "دايسون V15"];

/* ---------- Flags (hoist on the left, as flown) ---------- */
function zig(valley, tip, n, h) { const pts = [[0, 0], [valley, 0]]; for (let i = 0; i < n; i++) { pts.push([tip, (i + .5) * h / n]); pts.push([valley, (i + 1) * h / n]); } pts.push([0, h]); return pts.map(p => p[0].toFixed(2) + "," + p[1].toFixed(2)).join(" "); }
const FLAGS = {
  AE: '<svg viewBox="0 0 12 6" preserveAspectRatio="none"><rect width="12" height="2" fill="#00732F"/><rect y="2" width="12" height="2" fill="#fff"/><rect y="4" width="12" height="2" fill="#000"/><rect width="3" height="6" fill="#FF0000"/></svg>',
  SA: '<svg viewBox="0 0 12 8" preserveAspectRatio="none"><rect width="12" height="8" fill="#006C35"/><path d="M3.3 3.4q.45-.9.9 0t.9 0 .9 0 .9 0 .9 0 .9 0" fill="none" stroke="#fff" stroke-width=".55"/><path d="M3.4 5.4h5.4M8.8 5.1v.6" stroke="#fff" stroke-width=".45"/></svg>',
  KW: '<svg viewBox="0 0 12 6" preserveAspectRatio="none"><rect width="12" height="2" fill="#007A3D"/><rect y="2" width="12" height="2" fill="#fff"/><rect y="4" width="12" height="2" fill="#CE1126"/><polygon points="0,0 3,2 3,4 0,6" fill="#000"/></svg>',
  QA: '<svg viewBox="0 0 28 11" preserveAspectRatio="none"><rect width="28" height="11" fill="#8A1538"/><polygon points="' + zig(8, 10.5, 9, 11) + '" fill="#fff"/></svg>',
  BH: '<svg viewBox="0 0 5 3" preserveAspectRatio="none"><rect width="5" height="3" fill="#CE1126"/><polygon points="' + zig(1.25, 1.95, 5, 3) + '" fill="#fff"/></svg>',
  OM: '<svg viewBox="0 0 12 6" preserveAspectRatio="none"><rect width="12" height="6" fill="#DB161B"/><rect x="3.4" width="8.6" height="2" fill="#fff"/><rect x="3.4" y="4" width="8.6" height="2" fill="#008000"/><circle cx="1.7" cy="1.25" r=".55" fill="none" stroke="#fff" stroke-width=".3"/></svg>'
};
const flag = (c, sm) => `<span class="flag${sm ? " sm" : ""}" role="img" aria-label="علم ${COUNTRIES[c].name}">${FLAGS[c]}</span>`;
const TAG_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>';

/* ---------- Formatting ---------- */
function fmt(v, cur) {
  const d = CUR[cur].d === 3 ? 3 : (v < 200 ? 2 : 0);
  const dd = d === 2 && Math.abs(v - Math.round(v)) < 0.005 ? 0 : d;
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: dd, maximumFractionDigits: dd }).format(dd === 0 ? Math.round(v) : v);
}
const money = (aed, cur) => `<span class="num">${fmt(aed / CUR[cur].aed, cur)}</span> ${CUR[cur].s}`;
const moneyLocal = (v, cur) => CUR[cur] ? `<span class="num">${fmt(v, cur)}</span> ${CUR[cur].s}` : `<span class="num">${v}</span> ${esc(cur)}`;
const days = (n) => n == null ? "" : n <= 1 ? "يوصل بكرة" : n === 2 ? "يومين" : `${n} أيام`;

/* ---------- Storage ---------- */
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } }
};

/* ---------- State ---------- */
const S = {
  user: COUNTRIES[store.get("arkhas-country")] ? store.get("arkhas-country") : "AE",
  markets: null, // countries whose stores to search; set below
  stores: store.get("arkhas-stores", ["amazon", "noon.com", "trendyol.com"]),
  knownOnly: store.get("arkhas-known", true),
  sort: "total", src: {}, // source filter: a source is shown unless switched off (false)
  q: "", data: null, mode: "home", cfg: null, alertIds: store.get("arkhas-alerts", [])
};
const dispCur = () => COUNTRIES[S.user].cur;
{
  const saved = store.get("arkhas-markets", null);
  S.markets = Array.isArray(saved) && saved.filter(c => COUNTRIES[c]).length ? saved.filter(c => COUNTRIES[c])
    : store.get("arkhas-scope", "local") === "gcc" ? Object.keys(COUNTRIES) : [S.user];
}
const allMarkets = () => S.markets.length === Object.keys(COUNTRIES).length;
const marketsLabel = () => allMarkets() ? "الخليج كله" : S.markets.map(c => COUNTRIES[c].name).join(" و");

async function api(path, opts) {
  const res = await fetch(path, opts);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "تعذّر الاتصال بالخادم");
  return json;
}

/* ---------- Views ---------- */
function render() {
  $("#view").innerHTML = `<div style="display:flex;flex-direction:column;gap:12px">${S.mode === "results" && S.data ? viewResults() : viewHome()}</div>`;
  if (S.mode === "home") loadHomeData();
}

let homeCache = { popular: null, alerts: null };
function viewHome() {
  const pop = homeCache.popular?.length ? homeCache.popular : FALLBACK_POPULAR;
  const cur = dispCur();
  let alerts = '<div class="card empty">ما عندك تنبيهات. ابحث عن أي منتج واضغط «نبّهني».</div>';
  if (homeCache.alerts?.length) {
    alerts = homeCache.alerts.map(a => {
      const hit = !!a.triggeredAt;
      return `<div class="card alert">
        <span class="tile sm">${TAG_ICON}</span>
        <button type="button" class="info" data-q="${esc(a.q)}" style="background:none;border:0;padding:0;text-align:start">
          <b>${esc(a.q)}</b><span>الهدف ${money(a.targetAED, cur)}${a.lastBestAED ? ` · آخر سعر ${money(a.lastBestAED, cur)}` : " · ننتظر أول فحص"}</span>
        </button>
        <span class="pill ${hit ? "good" : "deal"}">${hit ? "وصل للسعر" : "ننتظر"}</span>
        <button type="button" class="x" data-del="${a.id}" aria-label="حذف التنبيه">×</button>
      </div>`;
    }).join("");
  }
  return `
    <div class="section-h">${homeCache.popular?.length ? "الأكثر بحثاً" : "جرّب تبحث عن"}</div>
    <div class="chips">${pop.map(q => `<button type="button" class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div>
    <div class="section-h">تنبيهات الأسعار <small>نفحص الأسعار كل كم ساعة</small></div>
    <div class="alerts">${alerts}</div>
    <button type="button" class="btn" data-how>كيف يجيب التطبيق الأسعار؟</button>`;
}

let homeLoading = false;
async function loadHomeData() {
  if (homeLoading) return; homeLoading = true;
  try {
    const [sg, al] = await Promise.all([
      api("/api/suggest?q="),
      S.alertIds.length ? api("/api/alerts?ids=" + S.alertIds.join(",")) : Promise.resolve({ alerts: [] })
    ]);
    const changed = JSON.stringify(sg.popular) !== JSON.stringify(homeCache.popular) || JSON.stringify(al.alerts) !== JSON.stringify(homeCache.alerts);
    homeCache = { popular: sg.popular, alerts: al.alerts };
    // forget alerts the server no longer has
    const ids = al.alerts.map(a => a.id); if (ids.length !== S.alertIds.length) { S.alertIds = ids; store.set("arkhas-alerts", ids); }
    if (changed && S.mode === "home") { homeLoading = false; render(); return; }
  } catch { /* offline: keep fallback */ }
  homeLoading = false;
}

function viewLoading() {
  const srcs = S.cfg ? Object.keys(S.cfg.sources) : ["agg"];
  return `<div class="card loading" aria-live="polite">
    <div class="phead"><span class="tile">${TAG_ICON}</span><div><h1>${esc(S.q)}</h1><p style="direction:rtl;text-align:start">نبحث في متاجر ${marketsLabel()}…</p></div></div>
    ${srcs.map(k => `<div class="srow"><span><span class="pill src-${k === "mock" ? "agg" : k}">${SRC[k]}</span></span><span style="color:var(--muted)">جاري البحث</span><div class="bar"><i class="grow"></i></div></div>`).join("")}
  </div>`;
}

function srcChips(offers) {
  const present = [...new Set(offers.map(o => o.source))];
  if (present.length < 2) return "";
  return `<div class="chips" role="group" aria-label="المصادر">${present.map(k => `<button type="button" class="chip" data-src="${k}" aria-pressed="${S.src[k] !== false}">${SRC[k]}</button>`).join("")}</div>`;
}

function viewResults() {
  const D = S.data, cur = dispCur(), uname = COUNTRIES[S.user].name;
  const visible = D.offers.filter(o => S.src[o.source] !== false && (!S.knownOnly || o.store.known));
  const hiddenUnknown = S.knownOnly ? D.offers.filter(o => !o.store.known).length : 0;
  const sorters = { total: (a, b) => a.totalAED - b.totalAED, fast: (a, b) => (a.days ?? 99) - (b.days ?? 99) || a.totalAED - b.totalAED };
  // every in-stock offer in one list, cheapest first; offers from other countries carry a shipping note
  const ranked = visible.filter(o => o.inStock).sort(sorters[S.sort]);
  const abroad = [];
  const oos = visible.filter(o => !o.inStock && o.deliverable);
  const best = [...ranked].sort(sorters.total)[0];

  const controls = `
    <div class="markets" role="group" aria-label="ابحث في متاجر">
      <span class="markets-h">ابحث في:</span>
      <button type="button" class="chip" data-market="all" aria-pressed="${allMarkets()}">كل الدول</button>
      ${Object.keys(COUNTRIES).map(c => `<button type="button" class="chip mk" data-market="${c}" aria-pressed="${!allMarkets() && S.markets.includes(c)}">${flag(c, 1)} ${COUNTRIES[c].name}</button>`).join("")}
    </div>
    <div class="markets">
      <button type="button" class="chip" data-stores>المتاجر (${S.stores.length})</button>
      <button type="button" class="chip" data-known aria-pressed="${S.knownOnly}">متاجر معروفة بس</button>
      ${hiddenUnknown ? `<span class="markets-h">أخفينا ${hiddenUnknown} عرض من بائعين غير معروفين</span>` : ""}
    </div>`;
  const head = `<div class="card phead">${D.image ? `<img src="${esc(D.image)}" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'tile',innerHTML:this.dataset.i}))" data-i="${esc(TAG_ICON)}">` : `<span class="tile">${TAG_ICON}</span>`}<div><h1>${esc(D.q)}</h1><p style="direction:rtl;text-align:start">${ranked.length} عرض من ${D.stats.stores} متجر</p></div></div>`;

  const srcLine = Object.entries(D.sources || {}).map(([k, s]) => `<span class="pill ${s.ok ? "src-" + (k === "mock" ? "agg" : k) : "err"}">${SRC[k] || k}: ${s.ok ? s.count : "تعذّر"}</span>`).join("");
  const droppedTotal = D.dropped.reduce((s, d) => s + d.count, 0);
  const droppedLine = droppedTotal ? `<p class="note">استبعدنا ${droppedTotal} نتيجة ما تطابق بحثك (${D.dropped.map(d => `${d.label} ${d.count}`).join("، ")}).</p>` : "";

  if (!best) {
    return `${head}${controls}${srcChips(D.offers)}
      <div class="card empty">${hiddenUnknown ? "ما فيه عروض من متاجر معروفة. اضغط «متاجر معروفة بس» عشان تشوف عروض البائعين الثانيين." : D.offers.length ? "ما فيه عرض متوفر بهذي الفلاتر." : "ما لقينا عروض تطابق بحثك."}<br>جرّب اسم أدق للمنتج (الموديل والسعة)، أو «الخليج كله».</div>
      ${abroad.length ? abroadSection(abroad, cur) : ""}${droppedLine}<div class="srcline">المصادر: ${srcLine}</div>`;
  }

  const avg = ranked.reduce((s, o) => s + o.totalAED, 0) / ranked.length, saveAvg = avg - best.totalAED, pct = Math.round(saveAvg / avg * 100);
  const localBest = ranked.filter(o => o.domestic).sort(sorters.total)[0];
  const shipText = !best.deliverable ? "والشحن لبلدك غير مؤكد" : best.deliveryKnown ? (best.deliveryAED ? `شامل التوصيل (${money(best.deliveryAED, cur)})` : "والتوصيل مجاني") : "التوصيل حسب المتجر";
  const alertDefault = Math.floor(best.totalAED * 0.95 / CUR[cur].aed);

  return `
    ${head}
    ${controls}
    <div class="card best">
      <span class="label"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 21l1.6-7L2 9.2l7.1-.6z"/></svg>${S.markets.length === 1 ? `أرخص سعر في ${COUNTRIES[S.markets[0]].name}` : allMarkets() ? "أرخص سعر في الخليج" : "أرخص سعر في الدول المختارة"}</span>
      <div class="price"><span class="num">${fmt(best.totalAED / CUR[cur].aed, cur)}</span><span class="cur">${CUR[cur].s}</span></div>
      <div class="from">من <b>${esc(best.store.name)}</b> ${best.domestic ? "" : `في ${COUNTRIES[best.country].name} `}${flag(best.country, 1)}، ${shipText}</div>
      <div class="meta">${best.days ? `<span>${days(best.days)}</span>` : ""}<span class="pill src-${best.source === "mock" ? "agg" : best.source}">${SRC[best.source]}</span>${best.deliveryEstimated && best.deliveryKnown ? '<span class="est" title="رسوم التوصيل تقديرية حسب سياسة المتجر">التوصيل تقديري</span>' : ""}</div>
      <div class="save">
        ${saveAvg > 1 && ranked.length > 1 ? `<span class="pill deal">أرخص من متوسط العروض بـ ${money(saveAvg, cur)} (${pct}%)</span>` : ""}
        ${verdict(D.history, best.totalAED)}
      </div>
      ${(!best.domestic && localBest && S.markets.includes(S.user)) ? `<div class="localbest">${flag(S.user, 1)} أرخص سعر داخل ${uname}: <b>${money(localBest.totalAED, cur)}</b> من ${esc(localBest.store.name)}، والفرق ${money(localBest.totalAED - best.totalAED, cur)}.</div>` : ""}
      <div class="row-actions">
        ${best.url ? `<a class="btn primary grow" href="${esc(best.url)}" target="_blank" rel="noopener nofollow sponsored">روح للمتجر</a>` : `<button type="button" class="btn primary grow" disabled>الرابط غير متوفر</button>`}
        <button type="button" class="btn grow" id="alertToggle">نبّهني لما ينزل</button>
      </div>
      <form class="alertform" id="alertForm">
        <label for="alertTarget">نبّهني إذا صار أقل من</label>
        <input id="alertTarget" type="number" inputmode="decimal" step="any" min="0" value="${alertDefault}">
        <span>${CUR[cur].s}</span>
        <input class="contact" id="alertContact" type="text" placeholder="واتساب أو إيميل (اختياري)" aria-label="وسيلة التواصل">
        <button type="submit" class="btn primary">حفظ التنبيه</button>
      </form>
    </div>

    ${historyCard(D.history, cur)}

    <div class="section-h">كل العروض من الأرخص <small>${ranked.length} عرض</small></div>
    <div class="chips" role="group" aria-label="الترتيب">
      <button type="button" class="chip" data-sort="total" aria-pressed="${S.sort === "total"}">الأرخص شامل التوصيل</button>
      <button type="button" class="chip" data-sort="fast" aria-pressed="${S.sort === "fast"}">الأسرع توصيلاً</button>
    </div>
    ${srcChips(D.offers)}
    <div class="offers">${ranked.map((o, i) => offerCard(o, i, cur, best)).join("")}${oos.map(o => offerCard(o, -1, cur, best)).join("")}</div>
    ${abroad.length ? abroadSection(abroad, cur) : ""}
    ${droppedLine}
    <div class="srcline">المصادر: ${srcLine}</div>`;
}

function abroadSection(list, cur) {
  return `<div class="section-h">في دول ثانية <small>الشحن لبلدك غير مؤكد</small></div>
    <p class="note">هذي العروض أسعارها للي في بلد المتجر. تأكد من المتجر إذا يشحن لـ${COUNTRIES[S.user].name} قبل الشراء.</p>
    <div class="offers">${list.map(o => offerCard(o, -1, cur, null)).join("")}</div>`;
}

function verdict(hist, now) {
  if (!hist || hist.length < 5) return "";
  const vals = hist.map(h => h.bestAED), min = Math.min(...vals), med = [...vals].sort((a, b) => a - b)[Math.floor(vals.length / 2)];
  if (now <= min * 1.005) return `<span class="pill good">أقل سعر خلال ${hist.length} يوم</span>`;
  if (now <= med) return '<span class="pill good">سعر جيد الحين</span>';
  return '<span class="pill warn">أعلى من المعتاد، ممكن تنتظر</span>';
}

function historyCard(hist, cur) {
  if (!hist || hist.length < 2) {
    return `<div class="card hist"><div class="section-h" style="margin:0 0 4px">تاريخ السعر</div>
      <div class="empty-h">بدأنا نتابع سعر هذا المنتج${hist?.length ? " اليوم" : ""}. كل يوم يبحث فيه أحد عنه نسجّل أرخص سعر، والمخطط يكتمل مع الأيام.</div></div>`;
  }
  const v = hist.map(h => h.bestAED), W = 300, H = 84, pad = 6;
  const hmin = Math.min(...v), hmax = Math.max(...v), span = (hmax - hmin) || 1;
  const pts = v.map((x, i) => [W - i / (v.length - 1) * W, pad + (hmax - x) / span * (H - 2 * pad)]); // RTL: today on the left
  const line = pts.map((q, i) => (i ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1)).join(" ");
  const end = pts[pts.length - 1];
  const grid = [0.25, 0.5, 0.75].map(f => `<line x1="0" x2="${W}" y1="${H * f}" y2="${H * f}" stroke="var(--line)" stroke-dasharray="2 4"/>`).join("");
  const d0 = new Date(hist[0].day).toLocaleDateString("ar", { day: "numeric", month: "short" });
  return `<div class="card hist">
    <div class="section-h" style="margin:0 0 8px">أرخص سعر يومياً <small>آخر ${hist.length} يوم مسجّل</small></div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="تاريخ السعر">${grid}
      <path d="${line} L0 ${H} L${W} ${H} Z" fill="var(--accent)" opacity=".12"/>
      <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
      <circle cx="${end[0].toFixed(1)}" cy="${end[1].toFixed(1)}" r="4" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/></svg>
    <div class="axis"><span>${d0}</span><span>اليوم</span></div>
    <div class="stats"><span>أقل: <b>${money(hmin, cur)}</b></span><span>أعلى: <b>${money(hmax, cur)}</b></span><span>الحين: <b>${money(v[v.length - 1], cur)}</b></span></div>
  </div>`;
}

function offerCard(o, i, cur, best) {
  const first = i === 0 && S.sort === "total";
  const ship = o.deliverable
    ? (o.deliveryKnown ? (o.deliveryAED ? `توصيل ${money(o.deliveryAED, cur)}` : "توصيل مجاني") + (o.deliveryEstimated ? ' <span class="est" title="تقدير حسب سياسة المتجر">تقديري</span>' : "") : "التوصيل حسب المتجر")
    : `<span class="pill warn">الشحن إلى ${COUNTRIES[S.user].name} غير مؤكد</span>`;
  return `<div class="card offer ${first ? "first" : ""} ${o.inStock ? "" : "oos"}">
    <div class="store">${i >= 0 ? `<span class="rank num">${i + 1}</span>` : ""}${esc(o.store.name)} <span class="cc">${flag(o.country, 1)} ${COUNTRIES[o.country].name}</span>${best && o === best && !first ? '<span class="pill deal">الأرخص</span>' : ""}</div>
    <div class="total">${o.inStock ? money(o.totalAED, cur) : "<small>غير متوفر</small>"}</div>
    <div class="ptitle" dir="auto">${esc(o.title)}</div>
    <div class="break">
      <span>السعر ${moneyLocal(o.price, o.currency)}${o.currency !== cur ? ` <small>(≈ ${money(o.priceAED, cur)})</small>` : ""}</span>
      <span>${ship}</span>
      ${o.days ? `<span>${days(o.days)}</span>` : ""}
    </div>
    <div class="go"><span class="meta" style="margin:0"><span class="pill src-${o.source === "mock" ? "agg" : o.source}">${SRC[o.source]}</span></span>
    ${o.url ? `<a class="btn" href="${esc(o.url)}" target="_blank" rel="noopener nofollow sponsored">روح للمتجر</a>` : ""}</div>
  </div>`;
}

/* ---------- Search ---------- */
let searchSeq = 0;
async function search(q) {
  q = String(q || "").trim();
  if (q.length < 2) { toast("اكتب اسم المنتج"); return; }
  S.q = q; S.mode = "results"; $("#q").value = q; hideSuggest();
  const seq = ++searchSeq;
  $("#view").innerHTML = viewLoading();
  requestAnimationFrame(() => document.querySelectorAll(".bar i.grow").forEach(b => { b.style.transition = "width 6s cubic-bezier(.1,.7,.2,1)"; b.style.width = "92%"; }));
  try {
    const data = await api(`/api/search?q=${encodeURIComponent(q)}&country=${S.user}&countries=${S.markets.join(",")}&stores=${encodeURIComponent(S.stores.join(","))}`);
    if (seq !== searchSeq) return;
    S.data = data;
    if (data.mock) $("#demoBanner").hidden = false;
    render();
  } catch (e) {
    if (seq !== searchSeq) return;
    $("#view").innerHTML = `<div class="card empty err-card">${esc(e.message)}<div style="margin-top:10px"><button type="button" class="btn" data-q="${esc(q)}">حاول مرة ثانية</button></div></div>`;
  }
}

/* ---------- Suggestions ---------- */
let sugIdx = -1, sugList = [], sugTimer;
function showSuggest() {
  clearTimeout(sugTimer);
  const q = $("#q").value.trim();
  if (q.length < 2) { hideSuggest(); return; }
  sugTimer = setTimeout(async () => {
    try {
      const { suggestions } = await api("/api/suggest?q=" + encodeURIComponent(q));
      sugList = suggestions.filter(s => s !== q).slice(0, 5); sugIdx = -1;
      if (!sugList.length || $("#q").value.trim() !== q) { hideSuggest(); return; }
      $("#suggest").innerHTML = sugList.map((s, i) => `<button type="button" role="option" data-q="${esc(s)}" id="sg-${i}"><span class="tile sm">${TAG_ICON}</span><span>${esc(s)}</span></button>`).join("");
      $("#suggest").classList.add("on");
    } catch { hideSuggest(); }
  }, 180);
}
function hideSuggest() { $("#suggest").classList.remove("on"); }

/* ---------- Toast & sheets ---------- */
function toast(html) { const t = $("#toast"); t.innerHTML = html; t.classList.add("on"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), 2800); }
function openSheet(id) { $(id).classList.add("on"); $(id).querySelector("[data-close]")?.focus(); }
function closeSheets() {
  stopScan(); document.querySelectorAll(".scrim").forEach(s => s.classList.remove("on"));
  if (typeof storesChanged !== "undefined" && storesChanged) { storesChanged = false; if (S.mode === "results" && S.q) search(S.q); }
}

/* ---------- Barcode scanning ---------- */
let scanStream = null, scanRaf = 0;
async function startScan() {
  openSheet("#scanSheet");
  const lead = $("#scanLead"), box = $("#scanBox");
  if (!("BarcodeDetector" in window) || !navigator.mediaDevices?.getUserMedia) {
    lead.textContent = "متصفحك ما يدعم قراءة الباركود بالكاميرا. اكتب الرقم المكتوب تحت الباركود."; box.style.display = "none"; return;
  }
  box.style.display = "";
  try {
    const detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    const video = $("#scanVideo"); video.srcObject = scanStream; await video.play();
    lead.textContent = "وجّه الكاميرا على الباركود.";
    const tick = async () => {
      if (!scanStream) return;
      try {
        const codes = await detector.detect(video);
        if (codes[0]?.rawValue) { const code = codes[0].rawValue; closeSheets(); toast("قرأنا الباركود " + esc(code)); search(code); return; }
      } catch { /* frame not ready */ }
      scanRaf = requestAnimationFrame(tick);
    };
    tick();
  } catch {
    lead.textContent = "ما قدرنا نفتح الكاميرا. اسمح للموقع باستخدامها، أو اكتب رقم الباركود."; box.style.display = "none";
  }
}
function stopScan() { cancelAnimationFrame(scanRaf); scanStream?.getTracks().forEach(t => t.stop()); scanStream = null; }

/* ---------- Country picker ---------- */
function renderCountry() {
  const c = COUNTRIES[S.user];
  $("#cTrigger").innerHTML = `${flag(S.user)}<span>${c.name}</span><small>${CUR[c.cur].s}</small><svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`;
  $("#cMenu").innerHTML = Object.entries(COUNTRIES).map(([k, v]) => `<button type="button" role="option" data-country="${k}" aria-selected="${k === S.user}">${flag(k)}<span>${v.name}</span><small>${CUR[v.cur].s}</small></button>`).join("");
}
function toggleMenu(on) { $("#cMenu").classList.toggle("on", on); $("#cTrigger").setAttribute("aria-expanded", String(on)); }

/* ---------- Theme ---------- */
const PALETTES = [
  { n: "زمردي", c: "#0B7A64" }, { n: "أزرق", c: "#1F5FD1" }, { n: "بنفسجي", c: "#6B3FC4" }, { n: "وردي", c: "#C2366F" },
  { n: "برتقالي", c: "#C25A0A" }, { n: "عنابي", c: "#8A1538" }, { n: "فحمي", c: "#2B3533" }
];
const TH = Object.assign({ accent: "#0B7A64", mode: "auto", custom: false }, store.get("arkhas-theme", {}));
if (!/^#[0-9a-f]{6}$/i.test(TH.accent)) TH.accent = "#0B7A64";
function lum(hex) { const n = parseInt(hex.slice(1), 16); const ch = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * ch[0] + .7152 * ch[1] + .0722 * ch[2]; }
function applyTheme() {
  const a = TH.accent, L = lum(a);
  const dark = `--accent:color-mix(in srgb, ${a} 62%, #fff);--accent-text:color-mix(in srgb, ${a} 62%, #fff);--accent-ink:#071311;--accent-soft:color-mix(in srgb, ${a} 24%, #13201D);`;
  let el = $("#themeVars"); if (!el) { el = document.createElement("style"); el.id = "themeVars"; document.head.appendChild(el); }
  el.textContent = `:root{--accent:${a};--accent-text:${L > 0.3 ? `color-mix(in srgb, ${a} 55%, #000)` : a};--accent-ink:${L > 0.4 ? "#10201D" : "#FFFFFF"};--accent-soft:color-mix(in srgb, ${a} 12%, #fff);}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${dark}}}
:root[data-theme="dark"]{${dark}}`;
  if (TH.mode === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", TH.mode);
  document.querySelector('meta[name="theme-color"]').content = a;
  store.set("arkhas-theme", TH);
  $("#swatches").innerHTML = PALETTES.map(p => `<button type="button" class="sw" data-accent="${p.c}" aria-pressed="${!TH.custom && p.c.toLowerCase() === TH.accent.toLowerCase()}"><i style="background:${p.c}"></i>${p.n}</button>`).join("")
    + `<label class="sw custom" aria-pressed="${TH.custom}"><i>${TH.custom ? `<span style="position:absolute;inset:9px;border-radius:50%;background:${TH.accent};box-shadow:0 0 0 2px #fff"></span>` : ""}<input type="color" id="customColor" value="${TH.accent}" aria-label="لون من اختيارك"></i>لونك</label>`;
  document.querySelectorAll("#modeSeg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === TH.mode)));
}

/* ---------- Events ---------- */
$("#q").addEventListener("input", () => { showSuggest(); if (!$("#q").value.trim() && S.mode !== "home") { S.mode = "home"; render(); } });
$("#q").addEventListener("keydown", e => {
  if (!$("#suggest").classList.contains("on")) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault(); sugIdx = (sugIdx + (e.key === "ArrowDown" ? 1 : -1) + sugList.length) % sugList.length;
    document.querySelectorAll("#suggest button").forEach((b, i) => b.classList.toggle("hl", i === sugIdx));
  }
  if (e.key === "Escape") hideSuggest();
});
$("#searchForm").addEventListener("submit", e => { e.preventDefault(); search(sugIdx >= 0 ? sugList[sugIdx] : $("#q").value); });
$("#manualForm").addEventListener("submit", e => { e.preventDefault(); const c = $("#manualCode").value.replace(/\D/g, ""); if (c.length < 8) { toast("رقم الباركود عادةً 8 أو 13 رقم"); return; } closeSheets(); search(c); });

document.addEventListener("input", e => { if (e.target.id === "customColor") { TH.accent = e.target.value; TH.custom = true; applyTheme(); } });

document.addEventListener("click", async e => {
  if (!e.target.closest(".searchwrap")) hideSuggest();
  if (!e.target.closest(".cpick")) toggleMenu(false);
  const t = e.target.closest("button");
  if (!t) return;
  const d = t.dataset;
  if (t.id === "cTrigger") return toggleMenu(!$("#cMenu").classList.contains("on"));
  if (d.country) {
    const prev = S.user;
    S.user = d.country; store.set("arkhas-country", S.user); toggleMenu(false); renderCountry();
    if (S.markets.length === 1 && S.markets[0] === prev) { S.markets = [S.user]; store.set("arkhas-markets", S.markets); }
    toast(`${flag(S.user, 1)} صارت الأسعار بـ${CUR[dispCur()].s} وشاملة التوصيل لـ${COUNTRIES[S.user].name}`);
    return S.mode === "results" ? search(S.q) : render();
  }
  if (d.q) { window.scrollTo({ top: 0, behavior: "smooth" }); return search(d.q); }
  if (d.known !== undefined) { S.knownOnly = !S.knownOnly; store.set("arkhas-known", S.knownOnly); return render(); }
  if (d.stores !== undefined) { renderStores(); return openSheet("#storesSheet"); }
  if (d.storeToggle) {
    const id = d.storeToggle;
    if (S.stores.includes(id)) S.stores = S.stores.filter(x => x !== id);
    else if (S.stores.length >= MAX_STORES) return toast(`تقدر تختار ${MAX_STORES} متاجر بالكثير`);
    else S.stores = [...S.stores, id];
    store.set("arkhas-stores", S.stores); storesChanged = true; return renderStores();
  }
  if (d.market) {
    // one country, or all of them
    S.markets = d.market === "all" ? Object.keys(COUNTRIES) : [d.market];
    store.set("arkhas-markets", S.markets);
    return search(S.q);
  }
  if (d.sort) { S.sort = d.sort; return render(); }
  if (d.src) { S.src[d.src] = S.src[d.src] === false; return render(); }
  if (d.del) {
    try { await api("/api/alerts/" + d.del, { method: "DELETE" }); } catch { /* already gone */ }
    S.alertIds = S.alertIds.filter(id => String(id) !== d.del); store.set("arkhas-alerts", S.alertIds);
    homeCache.alerts = (homeCache.alerts || []).filter(a => String(a.id) !== d.del); render(); return toast("انحذف التنبيه");
  }
  if (t.id === "alertToggle") { $("#alertForm").classList.toggle("on"); return $("#alertTarget")?.focus(); }
  if (d.how !== undefined) return openSheet("#howSheet");
  if (t.id === "themeBtn") return openSheet("#themeSheet");
  if (d.accent) { TH.accent = d.accent; TH.custom = false; return applyTheme(); }
  if (d.mode) { TH.mode = d.mode; return applyTheme(); }
  if (t.id === "themeReset") { Object.assign(TH, { accent: "#0B7A64", mode: "auto", custom: false }); applyTheme(); return toast("رجعت الألوان الأصلية"); }
  if (t.id === "scanBtn") return startScan();
  if (t.hasAttribute("data-close")) return closeSheets();
});

/* ---------- Stores picker ---------- */
let storesChanged = false;
function storeName(id) { return (STORE_CHOICES.find(s => s.id === id) || {}).name || id; }
function renderStores() {
  const custom = S.stores.filter(id => !STORE_CHOICES.some(s => s.id === id));
  $("#storesList").innerHTML = [...STORE_CHOICES.map(s => s.id), ...custom].map(id =>
    `<button type="button" class="chip" data-store-toggle="${esc(id)}" aria-pressed="${S.stores.includes(id)}">${esc(storeName(id))}${id === "amazon" || !STORE_CHOICES.some(s => s.id === id) ? "" : ` <small dir="ltr">${esc(id)}</small>`}</button>`).join("");
  $("#storesCount").textContent = `${S.stores.length} من ${MAX_STORES}`;
}
$("#addStoreForm").addEventListener("submit", e => {
  e.preventDefault();
  const v = $("#newStore").value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v)) return toast("اكتب عنوان موقع المتجر، مثلاً: noon.com");
  if (S.stores.includes(v)) return toast("المتجر موجود");
  if (S.stores.length >= MAX_STORES) return toast(`تقدر تختار ${MAX_STORES} متاجر بالكثير`);
  S.stores = [...S.stores, v]; store.set("arkhas-stores", S.stores); storesChanged = true;
  $("#newStore").value = ""; renderStores(); toast(`انضاف ${esc(v)}`);
});

document.addEventListener("submit", async e => {
  if (e.target.id !== "alertForm") return;
  e.preventDefault();
  const v = parseFloat($("#alertTarget").value);
  if (!(v > 0)) return toast("اكتب سعر أكبر من صفر");
  try {
    const { id } = await api("/api/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q: S.q, country: S.user, target: v, contact: $("#alertContact").value.trim() }) });
    S.alertIds = [id, ...S.alertIds.filter(x => x !== id)]; store.set("arkhas-alerts", S.alertIds);
    homeCache.alerts = null;
    $("#alertForm").classList.remove("on");
    toast(`بنبّهك لما يصير أقل من ${moneyLocal(v, dispCur())}`);
  } catch (err) { toast(esc(err.message)); }
});

document.querySelectorAll(".scrim").forEach(s => s.addEventListener("click", e => { if (e.target === s) closeSheets(); }));
document.addEventListener("keydown", e => { if (e.key === "Escape") { closeSheets(); toggleMenu(false); } });

/* ---------- Start ---------- */
renderCountry();
applyTheme();
api("/api/config").then(cfg => { S.cfg = cfg; $("#demoBanner").hidden = !cfg.mock; }).catch(() => {});
const initial = new URLSearchParams(location.search).get("q");
if (initial) search(initial); else render();

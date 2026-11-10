// Carga el catálogo de una tienda a partir de su link (portada, categoría o búsqueda).
// Prueba, en orden: API pública de Shopify, WooCommerce y VTEX; datos estructurados de la página;
// listados de Magento; y por último entra a cada link de producto que encuentre.
const { readProduct, toNumber } = require("./scraper");

const UA = "Mozilla/5.0 (compatible; PrecioZona/1.0; +https://preciozona.onrender.com)";
const MAX = 60;

async function get(url, accept, ms = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": UA, "Accept": accept || "text/html,application/xhtml+xml", "Accept-Language": "es-UY,es;q=0.9" } });
  } finally { clearTimeout(t); }
}
async function getJson(url) {
  try { const r = await get(url, "application/json"); if (!r.ok) return null; const ct = r.headers.get("content-type") || ""; if (!/json/.test(ct)) return null; return await r.json(); }
  catch { return null; }
}
const ok = p => Number.isFinite(p) && p >= 20 && p <= 200000;
const decode = s => String(s || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// ---------- Plataformas con API pública ----------
async function shopify(origin) {
  const j = await getJson(`${origin}/products.json?limit=250`);
  if (!j || !Array.isArray(j.products)) return null;
  return j.products.slice(0, MAX).map(p => ({ name: p.title, url: `${origin}/products/${p.handle}`, price: toNumber(p.variants && p.variants[0] && p.variants[0].price) })).filter(x => ok(x.price));
}
async function woocommerce(origin) {
  const j = await getJson(`${origin}/wp-json/wc/store/v1/products?per_page=100`);
  if (!Array.isArray(j)) return null;
  return j.slice(0, MAX).map(p => {
    const pr = p.prices || {}; const minor = Number(pr.currency_minor_unit || 0);
    return { name: decode(p.name), url: p.permalink, price: Number(pr.price) / Math.pow(10, minor) };
  }).filter(x => ok(x.price));
}
async function vtex(u) {
  const term = u.searchParams.get("_q") || u.searchParams.get("q") || decodeURIComponent(u.pathname.split("/").filter(Boolean)[0] || "");
  const items = [];
  for (let from = 0; from < MAX; from += 50) {
    const q = term && !/\/p$/.test(u.pathname) ? `ft=${encodeURIComponent(term)}&` : "";
    const j = await getJson(`${u.origin}/api/catalog_system/pub/products/search?${q}_from=${from}&_to=${Math.min(from + 49, MAX - 1)}`);
    if (!Array.isArray(j) || !j.length) break;
    j.forEach(p => {
      const offer = p.items && p.items[0] && p.items[0].sellers && p.items[0].sellers[0] && p.items[0].sellers[0].commertialOffer;
      items.push({ name: p.productName, url: p.link, price: offer ? toNumber(offer.Price) : null });
    });
    if (j.length < 50) break;
  }
  const valid = items.filter(x => ok(x.price));
  return valid.length ? valid : null;
}

// ---------- Lectura de la página ----------
function fromJsonLd(html, origin) {
  const out = [];
  const blocks = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
  const walk = n => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(walk);
    const type = [].concat(n["@type"] || []).join(" ");
    if (/Product/i.test(type) && n.name) {
      const offers = [].concat(n.offers || []);
      const price = offers.map(o => toNumber(o.price || o.lowPrice)).find(ok);
      if (price) out.push({ name: decode(n.name), url: n.url ? new URL(n.url, origin).href : "", price });
    }
    Object.values(n).forEach(walk);
  };
  blocks.forEach(b => { try { walk(JSON.parse(b.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, ""))); } catch { } });
  return out;
}
function fromMagento(html, origin) {
  const out = [];
  const re = /<li[^>]*class="[^"]*product-item[^"]*"[\s\S]*?<\/li>/gi;
  (html.match(re) || []).forEach(block => {
    const a = block.match(/class="[^"]*product-item-link[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i) || block.match(/href="([^"]+)"[^>]*class="[^"]*product-item-link[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    const p = block.match(/data-price-amount="([\d.]+)"/i);
    if (a && p) out.push({ name: decode(a[2]), url: new URL(a[1], origin).href, price: Number(p[1]) });
  });
  return out.filter(x => ok(x.price));
}
function productLinks(html, origin) {
  const set = new Set();
  const re = /href="([^"#?]+)"/gi; let m;
  while ((m = re.exec(html))) {
    let href; try { href = new URL(m[1], origin); } catch { continue; }
    if (href.origin !== origin) continue;
    const p = href.pathname;
    if (/\/p\/?$|\/products?\/[^/]+\/?$|\/producto\/[^/]+\/?$|\/[a-z0-9-]{8,}\.html$/i.test(p) && !/(checkout|cart|carrito|login|cuenta|account|categor)/i.test(p)) set.add(href.href);
  }
  return [...set].slice(0, MAX);
}
async function pool(list, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) { const k = i++; out[k] = await fn(list[k]); } }));
  return out;
}

async function crawlCatalog(link) {
  let u; try { u = new URL(link); } catch { return { ok: false, error: "El link no es válido.", items: [], blocked: [] }; }
  for (const [name, fn] of [["Shopify", () => shopify(u.origin)], ["WooCommerce", () => woocommerce(u.origin)], ["VTEX", () => vtex(u)]]) {
    const items = await fn().catch(() => null);
    if (items && items.length) return { ok: true, source: name, items, blocked: [] };
  }
  let r;
  try { r = await get(u.href); } catch { return { ok: false, error: "No se pudo conectar con la tienda.", items: [], blocked: [] }; }
  if (r.status === 403 || r.status === 429) return { ok: false, blockedAll: true, error: "La tienda bloquea la lectura automática.", items: [], blocked: [] };
  if (!r.ok) return { ok: false, error: `La página respondió con error ${r.status}.`, items: [], blocked: [] };
  const html = await r.text();
  let items = fromJsonLd(html, u.origin);
  if (items.length < 2) items = fromMagento(html, u.origin).length ? fromMagento(html, u.origin) : items;
  if (items.length >= 2) return { ok: true, source: "página", items: items.slice(0, MAX), blocked: [] };
  // Último recurso: entrar a cada producto
  const links = productLinks(html, u.origin);
  if (!links.length) {
    const single = await readProduct(u.href);
    return single.ok ? { ok: true, source: "página de producto", items: [{ name: single.name || u.pathname, url: u.href, price: single.price }], blocked: [] }
      : { ok: false, error: "No se encontraron productos en esa página. Probá con el link de una categoría o de una búsqueda.", items: [], blocked: [] };
  }
  const res = await pool(links, 5, async url => ({ url, r: await readProduct(url) }));
  const found = res.filter(x => x.r.ok).map(x => ({ name: x.r.name || x.url, url: x.url, price: x.r.price }));
  const blocked = res.filter(x => !x.r.ok).map(x => ({ url: x.url, name: x.r.name || decodeURIComponent(x.url.split("/").filter(Boolean).pop()).replace(/\.html?$/, "").replace(/[-_]+/g, " "), error: x.r.error }));
  return { ok: found.length > 0 || blocked.length > 0, source: "páginas de producto", items: found, blocked };
}

module.exports = { crawlCatalog };

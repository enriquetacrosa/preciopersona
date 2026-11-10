// Lee el precio de un producto desde la página de una tienda online.
// Prueba, en orden: datos estructurados para Google (JSON-LD), etiquetas meta,
// atributos de precio de Magento y la API pública de tiendas VTEX.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function toNumber(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return raw;
  let s = String(raw).replace(/[^\d.,]/g, "");
  if (!s) return null;
  // "1.635,00" → 1635.00 · "1,635.00" → 1635.00 · "1635.00" → 1635 · "1.635" → 1635
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
  else if (lastDot > lastComma && lastComma >= 0) s = s.replace(/,/g, "");
  else if (lastComma === -1 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

const valid = n => n !== null && n >= 50 && n <= 50000;

// Busca "price" dentro de cualquier objeto Offer del JSON-LD
function priceFromJsonLd(html) {
  const blocks = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
  const prices = [], lows = [];
  const walk = node => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(walk);
    const type = [].concat(node["@type"] || []).join(" ");
    if (/Offer/i.test(type) || node.offers) {
      const p = toNumber(node.price); if (valid(p)) prices.push(p);
      const l = toNumber(node.lowPrice); if (valid(l)) lows.push(l);
    }
    Object.values(node).forEach(walk);
  };
  for (const b of blocks) {
    const json = b.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    try { walk(JSON.parse(json)); } catch { /* bloque inválido, se ignora */ }
  }
  // Se prefiere el precio de lista ("price"); "lowPrice" solo si no hay otro
  if (prices.length) return prices[0];
  return lows.length ? Math.min(...lows) : null;
}

function priceFromMeta(html) {
  const patterns = [
    /<meta[^>]+(?:property|name)=["'](?:product:price:amount|og:price:amount)["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:product:price:amount|og:price:amount)["']/i,
    /itemprop=["']price["'][^>]*content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]*itemprop=["']price["']/i,
    /data-price-amount=["']([\d.,]+)["']/i
  ];
  for (const re of patterns) {
    const m = html.match(re);
    const n = m && toNumber(m[1]);
    if (valid(n)) return n;
  }
  return null;
}

async function get(url, timeoutMs, accept) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: "follow",
      headers: { "User-Agent": UA, "Accept": accept || "text/html,application/xhtml+xml", "Accept-Language": "es-UY,es;q=0.9" } });
    return r;
  } finally { clearTimeout(t); }
}

// Tiendas VTEX (por ejemplo Farmacity): /<slug>/p → API pública de catálogo
async function priceFromVtex(url, timeoutMs) {
  const u = new URL(url);
  const m = u.pathname.match(/^\/(.+)\/p\/?$/);
  if (!m) return null;
  const api = `${u.origin}/api/catalog_system/pub/products/search/${m[1]}/p`;
  const r = await get(api, timeoutMs, "application/json");
  if (!r.ok) return null;
  const data = await r.json();
  const offer = data && data[0] && data[0].items && data[0].items[0] && data[0].items[0].sellers && data[0].items[0].sellers[0] && data[0].items[0].sellers[0].commertialOffer;
  const n = offer ? toNumber(offer.Price) : null;
  return valid(n) ? n : null;
}

function extractPrice(html) {
  return priceFromJsonLd(html) || priceFromMeta(html);
}

const decode = s => String(s).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

// Nombre del producto: JSON-LD Product.name → og:title → <title>
function extractName(html) {
  const blocks = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
  let name = null;
  const walk = node => {
    if (name || !node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (/Product/i.test([].concat(node["@type"] || []).join(" ")) && typeof node.name === "string") { name = node.name; return; }
    Object.values(node).forEach(walk);
  };
  for (const b of blocks) {
    try { walk(JSON.parse(b.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "").trim())); } catch { /* sigue */ }
  }
  if (!name) { const m = html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i); if (m) name = m[1]; }
  if (!name) { const m = html.match(/<title[^>]*>([^<]+)<\/title>/i); if (m) name = m[1].split(/\s[|–-]\s/)[0]; }
  return name ? decode(name).slice(0, 120) : null;
}

// Lee nombre y precio de la página de un producto
async function readProduct(url, timeoutMs = 9000) {
  if (!/^https?:\/\//i.test(url || "")) return { ok: false, error: "Falta el link" };
  try {
    const r = await get(url, timeoutMs);
    if (r.status === 403 || r.status === 429) return { ok: false, error: "La tienda rechazó la lectura automática" };
    if (!r.ok) return { ok: false, error: `La página respondió con error ${r.status}` };
    const html = await r.text();
    const name = extractName(html);
    let price = extractPrice(html);
    if (!price) { try { price = await priceFromVtex(url, timeoutMs); } catch { /* sigue */ } }
    if (!price) return { ok: false, name, error: "No se encontró el precio en la página" };
    return { ok: true, name, price: Math.round(price) };
  } catch (e) {
    return { ok: false, error: e.name === "AbortError" ? "La tienda tardó demasiado en responder" : "No se pudo conectar con la tienda" };
  }
}
const readPrice = readProduct;

module.exports = { readPrice, readProduct, extractPrice, extractName, toNumber };

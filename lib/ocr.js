// Lee productos y precios desde capturas de pantalla (OCR gratuito, sin servicios pagos).
// Funciona con grillas de productos: usa la posición de cada texto para unir
// cada precio con el nombre que tiene arriba, en la misma columna.
const { createWorker } = require("tesseract.js");
const path = require("path");
const os = require("os");

const LANG_PATH = path.join(path.dirname(require.resolve("@tesseract.js-data/spa/package.json")), "4.0.0_best_int");
const PRICE = /^(?:precio\s*)?(?:u?\$|\$u|uyu)\s?(\d{1,3}(?:[.\s]\d{3})+|\d{2,6})(?:[.,](\d{2}))?/i;
const NOISE = /^(agregar|comprar|añadir|anadir|ver|ver más|ver mas|envío|envio|retiro|oferta|nuevo|stock|disponible|cuotas?|hasta|filtrar|ordenar|buscar)\b/i;

let workerPromise = null;
function getWorker() {
  if (!workerPromise) workerPromise = createWorker("spa", 1, { langPath: LANG_PATH, gzip: true, cachePath: os.tmpdir(), logger: () => {} });
  return workerPromise;
}
const toNum = s => Number(String(s).replace(/[.\s]/g, ""));
const clean = s => s.replace(/[|_~*•·®™]+/g, " ").replace(/\s+/g, " ").trim();

// Parte cada línea donde hay un espacio grande entre palabras (columnas distintas)
function segments(data) {
  const out = [];
  (data.blocks || []).forEach(b => (b.paragraphs || []).forEach(p => (p.lines || []).forEach(l => {
    const words = (l.words || []).filter(w => w.text && w.text.trim());
    if (!words.length) return;
    const h = Math.max(8, l.bbox.y1 - l.bbox.y0);
    let cur = null;
    words.forEach(w => {
      if (cur && w.bbox.x0 - cur.x1 > h * 1.6) { out.push(cur); cur = null; }
      if (!cur) cur = { words: [], x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1, h };
      cur.words.push(w.text); cur.x1 = Math.max(cur.x1, w.bbox.x1); cur.y0 = Math.min(cur.y0, w.bbox.y0); cur.y1 = Math.max(cur.y1, w.bbox.y1);
    });
    if (cur) out.push(cur);
  })));
  out.forEach(s => { s.text = clean(s.words.join(" ")); const m = s.text.match(PRICE); s.price = m ? toNum(m[1]) : null; });
  return out.filter(s => s.text);
}

function pairs(segs) {
  const prices = segs.filter(s => s.price && s.price >= 20 && s.price <= 200000).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const texts = segs.filter(s => !s.price && (/[a-záéíóúñ]{3,}/i.test(s.text) || /\d+\s*(ml|cc|g|gr|grs|kg|l)\b/i.test(s.text)) && !NOISE.test(s.text));
  const used = new Set(), rows = [];
  prices.forEach(pr => {
    const h = pr.h;
    // Textos de la misma columna, arriba del precio y cerca
    const above = texts.filter(t => t.y1 <= pr.y0 + h * 0.4 && pr.y0 - t.y1 < h * 7 &&
      t.x0 < pr.x0 + h * 10 && t.x1 > pr.x0 - h * 0.5 && Math.abs(t.x0 - pr.x0) < h * 6).sort((a, b) => b.y1 - a.y1);
    // Si entre el precio y el nombre hay otro precio, este es un segundo precio (descuento): se ignora
    const nearest = above[0];
    if (!nearest || used.has(nearest)) return;
    const between = prices.some(o => o !== pr && o.y0 < pr.y0 && o.y0 > nearest.y1 - h * 0.2 && Math.abs(o.x0 - pr.x0) < h * 6);
    if (between) return;
    const group = [nearest]; let last = nearest;
    for (const t of above.slice(1)) { if (group.length >= 3 || last.y0 - t.y1 > h * 1.8 || used.has(t)) break; group.push(t); last = t; }
    group.forEach(t => used.add(t));
    const name = clean(group.reverse().map(t => t.text).join(" "));
    if (name.length >= 4) rows.push({ name: name.slice(0, 120), price: pr.price });
  });
  return rows;
}

async function readImage(buffer) {
  const worker = await getWorker();
  const { data } = await worker.recognize(buffer, {}, { blocks: true, text: false });
  return pairs(segments(data));
}

module.exports = { readImage };

// Lee productos y precios desde capturas de pantalla (OCR gratuito, sin servicios pagos).
const { createWorker } = require("tesseract.js");
const path = require("path");
const os = require("os");

const LANG_PATH = path.join(path.dirname(require.resolve("@tesseract.js-data/spa/package.json")), "4.0.0_best_int");
const PRICE = /\$\s?U?\s?(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:,(\d{2}))?/;

let workerPromise = null;
function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker("spa", 1, { langPath: LANG_PATH, gzip: true, cachePath: os.tmpdir(), logger: () => {} });
  }
  return workerPromise;
}

const clean = s => s.replace(/[|_~*•·]+/g, " ").replace(/\s+/g, " ").trim();
const toNum = s => Number(String(s).replace(/[.\s]/g, ""));

// Arma pares nombre-precio: el nombre está en la misma línea antes del precio, o en las líneas de arriba
function parseText(text) {
  const lines = text.split(/\r?\n/).map(clean).filter(Boolean);
  const rows = [];
  let pending = [];
  for (const line of lines) {
    const m = line.match(PRICE);
    if (m) {
      const price = toNum(m[1]);
      const before = clean(line.slice(0, m.index));
      const name = clean((before.length >= 6 ? before : [...pending, before].join(" ")));
      if (name.length >= 4 && price >= 20 && price <= 100000) rows.push({ name: name.slice(0, 120), price });
      pending = [];
    } else if (/[a-záéíóúñ]{3,}/i.test(line)) {
      pending.push(line);
      if (pending.length > 2) pending.shift(); // el nombre suele ocupar 1 o 2 líneas
    }
  }
  return rows;
}

async function readImage(buffer) {
  const worker = await getWorker();
  const { data } = await worker.recognize(buffer);
  return parseText(data.text || "");
}

module.exports = { readImage, parseText };

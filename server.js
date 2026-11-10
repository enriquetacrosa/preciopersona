const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const E = require("./public/engine.js");
const { crawlCatalog } = require("./lib/crawler");
const { readImage } = require("./lib/ocr");

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "20mb" }));

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ort2026";
const DB_FILE = path.join(__dirname, "data", "db.json");
const STALE_MS = 12 * 60 * 60 * 1000;

// ================= Base de datos (archivo JSON) =================
let db;
try { db = JSON.parse(fs.readFileSync(DB_FILE, "utf8")); } catch { db = E.freshDb(); }
function save() {
  try { fs.mkdirSync(path.dirname(DB_FILE), { recursive: true }); fs.writeFileSync(DB_FILE, JSON.stringify(db)); }
  catch (e) { console.error("No se pudo guardar:", e.message); }
}
const now = () => new Date().toISOString();

// ================= Lectura de tiendas =================
async function scanCompany(site) {
  db.company.site = site;
  const r = await crawlCatalog(site);
  if (!r.ok) {
    db.company.blocked = r.blockedAll ? { count: db.products.length || 1, total: db.products.length || 1, all: true } : db.company.blocked;
    db.company.lastScan = now();
    save();
    throw new Error(r.error);
  }
  const old = Object.fromEntries(db.products.map(p => [p.id, p]));
  const items = r.items.map(it => ({ ...it, status: "ok" })).concat(r.blocked.map(b => ({ name: b.name, url: b.url, price: null, status: "bloqueado", note: b.error })));
  const seen = new Set();
  db.products = items.map(it => {
    let id = E.slug(it.name); while (seen.has(id)) id += "-2"; seen.add(id);
    const prev = old[id] || {};
    const keepManual = it.status === "bloqueado" && prev.status === "manual";
    return { id, name: it.name, url: it.url, currentPrice: keepManual ? prev.currentPrice : it.price, cost: prev.cost ?? null,
      status: keepManual ? "manual" : it.status, note: it.note || "", simulated: false, updated: now() };
  });
  const nb = db.products.filter(p => p.status === "bloqueado").length;
  db.company.blocked = nb ? { count: nb, total: db.products.length } : null;
  db.company.lastScan = now();
  db.company.source = r.source;
  save();
}
async function scanCompetitors() {
  await Promise.all(db.chains.map(async c => {
    c.lastScan = now();
    if (c.manualCatalog && c.manualCatalog.length) { matchChain(c, c.manualCatalog); c.status = "capturas"; c.note = `${c.manualCatalog.length} productos cargados desde capturas`; return; }
    const r = await crawlCatalog(c.site).catch(() => ({ ok: false, error: "No se pudo conectar." }));
    if (!r.ok || !r.items.length) { c.matches = {}; c.status = "error"; c.note = r.blockedAll || (r.blocked && r.blocked.length) ? "La tienda bloquea la lectura automática. Cargala con capturas de pantalla." : (r.error || "No se encontraron productos.") + " También podés usar capturas."; return; }
    matchChain(c, r.items); c.status = "ok"; c.note = `${r.items.length} productos analizados`;
  }));
  db.lastScrape = now();
  save();
}
function matchChain(c, cat) { c.matches = {}; db.products.forEach(p => { const m = E.bestMatch(p, cat); if (m) c.matches[p.id] = m; }); }

let refreshing = false;
async function refreshIfStale() {
  if (refreshing || !db.setupDone) return;
  if (db.lastScrape && Date.now() - new Date(db.lastScrape).getTime() < STALE_MS) return;
  refreshing = true;
  try { if (db.company.site) await scanCompany(db.company.site).catch(() => {}); await scanCompetitors(); } finally { refreshing = false; }
}

// ================= Utilidades =================
function cookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach(part => { const i = part.indexOf("="); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); });
  return out;
}
const ipCache = new Map();
async function deptFromIp(ip) {
  const clean = String(ip || "").replace("::ffff:", "");
  if (!clean || clean === "::1" || /^(127\.|10\.|192\.168\.)/.test(clean)) return null;
  if (ipCache.has(clean)) return ipCache.get(clean);
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 1500);
    const r = await fetch(`https://ipapi.co/${clean}/json/`, { signal: ctrl.signal }); clearTimeout(t);
    const j = await r.json();
    const out = j && j.country_code === "UY" ? j.region : (j && j.country_name) || null;
    ipCache.set(clean, out); return out;
  } catch { return null; }
}
function locToZone(loc) {
  if (typeof loc !== "string") return null;
  if (loc.startsWith("b:")) { const b = db.barrios[+loc.slice(2)]; return b ? { zoneId: b.zoneId, label: b.name } : null; }
  if (loc.startsWith("p:")) { const p = db.pickups.find(x => "p:" + x.id === loc); return p ? { zoneId: p.zoneId, label: p.name } : null; }
  return null;
}

// ================= Back-office =================
const sessions = new Set();
const isAdmin = req => sessions.has(cookies(req).adm);
app.post("/api/admin/login", (req, res) => {
  if ((req.body || {}).password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Contraseña incorrecta." });
  const token = crypto.randomBytes(24).toString("hex"); sessions.add(token);
  res.setHeader("Set-Cookie", `adm=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800`);
  res.json({ ok: true });
});
app.post("/api/admin/logout", (req, res) => { sessions.delete(cookies(req).adm); res.setHeader("Set-Cookie", "adm=; Path=/; Max-Age=0"); res.json({ ok: true }); });
app.get("/api/admin/session", (req, res) => res.json({ ok: isAdmin(req) }));
app.use("/api/admin", (req, res, next) => isAdmin(req) ? next() : res.status(401).json({ error: "Iniciá sesión de nuevo." }));

app.get("/api/admin/data", (req, res) => { refreshIfStale(); res.json(db); });
app.put("/api/admin/data", (req, res) => {
  const b = req.body || {};
  if (!Array.isArray(b.products) || !Array.isArray(b.chains) || !b.params) return res.status(400).json({ error: "Datos incompletos." });
  // Los visitantes y pedidos que llegaron desde la web de la tienda no se pisan: se combinan por id
  const custs = new Map(db.customers.map(c => [c.id, c]));
  (Array.isArray(b.customers) ? b.customers : []).forEach(c => { if (c && c.id) custs.set(c.id, c); });
  const orders = new Map(db.orders.map(o => [o.id, o]));
  (Array.isArray(b.orders) ? b.orders : []).forEach(o => { if (o && o.id) orders.set(o.id, o); });
  db = { ...b, customers: [...custs.values()], orders: [...orders.values()].sort((x, y) => String(y.date).localeCompare(String(x.date))) };
  save(); res.json(db);
});
app.post("/api/admin/scan-company", async (req, res) => {
  try {
    const site = String((req.body || {}).site || "").trim();
    if (!/^https?:\/\//i.test(site)) return res.status(400).json({ error: "Pegá un link que empiece con https://" });
    if (req.body.unblocked) db.company.unblocked = true;
    await scanCompany(site); res.json(db);
  } catch (e) { res.status(400).json({ error: e.message, db }); }
});
app.post("/api/admin/scan-competitors", async (req, res) => {
  const sites = (req.body || {}).sites || [];
  db.chains.forEach((c, i) => { if (sites[i]) c.site = String(sites[i]).trim(); });
  await scanCompetitors(); res.json(db);
});
// Capturas: recibe imágenes en base64 y devuelve la lista de productos y precios leídos
app.post("/api/admin/ocr", async (req, res) => {
  try {
    const images = ((req.body || {}).images || []).slice(0, 8);
    if (!images.length) return res.status(400).json({ error: "No llegaron imágenes." });
    const rows = [];
    for (const dataUrl of images) {
      const b64 = String(dataUrl).split(",").pop();
      (await readImage(Buffer.from(b64, "base64"))).forEach(r => rows.push(r));
    }
    res.json({ rows });
  } catch (e) { console.error(e); res.status(500).json({ error: "No se pudieron leer las imágenes. Probá con capturas más nítidas." }); }
});
app.get("/api/admin/export.csv", (req, res) => {
  const csv = E.exportRows(db).map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="precios-por-zona.csv"');
  res.send("﻿" + csv);
});
app.post("/api/admin/reset", (req, res) => { db = E.freshDb(); save(); res.json(db); });
app.post("/api/admin/clear-visitors", (req, res) => { db.customers = db.customers.filter(c => c.fictional); db.orders = db.orders.filter(o => db.customers.some(c => c.id === o.customerId)); save(); res.json(db); });

// ================= API pública para la web de la tienda (la usa preciozona.js) =================
app.use(["/api/public", "/api/precio"], (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
function customer(id) { return db.customers.find(c => c.id === id); }

// Datos para armar la tienda: productos (sin precio), barrios y sucursales
app.get("/api/public/config", (req, res) => {
  res.json({ company: db.company.name, ready: !!db.setupDone,
    products: db.products.filter(p => E.ready(db, p)).map(p => ({ id: p.id, name: p.name, url: p.url })),
    barrios: db.barrios.map((b, i) => ({ loc: "b:" + i, name: b.name })).sort((a, b) => a.name.localeCompare(b.name, "es")),
    pickups: db.pickups.map(p => ({ loc: "p:" + p.id, name: p.name })) });
});
// Alta o actualización del visitante, con su decisión sobre las cookies y los datos del navegador
app.post("/api/public/visitor", async (req, res) => {
  const b = req.body || {};
  let c = b.visitorId && customer(b.visitorId);
  if (!c) { c = { id: "v-" + crypto.randomBytes(6).toString("hex"), name: "", fictional: false, consent: null, locks: {}, signals: { visitas: 0, vistos: [], carritosAbandonados: 0 }, created: now() }; db.customers.push(c); c.name = "Visitante " + db.customers.filter(x => !x.fictional).length; }
  if (typeof b.consent === "boolean") { c.consent = b.consent; c.consentDate = now(); }
  if (c.consent && b.signals && typeof b.signals === "object") {
    const s = b.signals, t = c.signals;
    t.dispositivo = s.dispositivo || t.dispositivo; t.idioma = s.idioma || t.idioma; t.zonaHoraria = s.zonaHoraria || t.zonaHoraria;
    t.origen = s.origen || t.origen; t.hora = Number.isFinite(s.hora) ? s.hora : t.hora; t.visitas = (t.visitas || 0) + 1;
    t.departamentoIP = (await deptFromIp(req.ip)) || t.departamentoIP;
    if (Number.isFinite(s.lat) && Number.isFinite(s.lon)) {
      const z = E.zoneFromCoords(s.lat, s.lon);
      t.ubicaciones = (t.ubicaciones || []).concat([{ lat: Math.round(s.lat * 1000) / 1000, lon: Math.round(s.lon * 1000) / 1000, zona: z, fecha: now() }]).slice(-20);
      if (z) t.zonasFrecuentes = [...new Set([...(t.zonasFrecuentes || []), z])];
    }
  }
  save();
  res.json({ visitorId: c.id, consent: c.consent });
});
// Eventos: producto visto, carrito abandonado, zona elegida
app.post("/api/public/track", (req, res) => {
  const b = req.body || {}, c = customer(b.visitorId);
  if (!c || !c.consent) return res.json({ ok: false });
  const t = c.signals;
  if (b.event === "view" && db.products.some(p => p.id === b.productId)) { t.vistos = t.vistos || []; if (!t.vistos.includes(b.productId)) t.vistos.push(b.productId); }
  if (b.event === "abandon") t.carritosAbandonados = (t.carritosAbandonados || 0) + 1;
  if (b.event === "zone") { const z = locToZone(b.loc); if (z) t.zonaEntrega = z.zoneId; }
  save(); res.json({ ok: true });
});
// Precios para un visitante: sin consentimiento no hay precio
app.get("/api/public/prices", (req, res) => {
  const c = customer(req.query.visitor);
  if (!c || !c.consent) return res.json({ consent: false, prices: {} });
  const z = locToZone(req.query.loc);
  const zone = E.findZone(db, z ? z.zoneId : c.signals.zonaEntrega);
  const prices = {};
  db.products.filter(p => E.ready(db, p)).forEach(p => { const r = E.personalPrice(db, p, zone, c); prices[p.id] = { price: r.final, locked: r.locked }; });
  res.json({ consent: true, zone: zone.name, prices });
});
app.post("/api/public/order", (req, res) => {
  const b = req.body || {}, c = customer(b.visitorId);
  if (!c || !c.consent) return res.status(403).json({ error: "Para comprar hay que aceptar las cookies.", needConsent: true });
  const z = locToZone(b.loc) || (c.signals.zonaEntrega ? { zoneId: c.signals.zonaEntrega } : null);
  if (!z) return res.status(400).json({ error: "Elegí tu barrio o una sucursal." });
  const zone = E.findZone(db, z.zoneId);
  const items = (b.items || []).map(it => ({ p: db.products.find(p => p.id === it.id), q: Math.max(1, Math.min(20, parseInt(it.q, 10) || 1)) })).filter(x => x.p && E.ready(db, x.p));
  if (!items.length) return res.status(400).json({ error: "El carrito está vacío." });
  let total = 0;
  items.forEach(({ p, q }) => { const r = E.personalPrice(db, p, zone, c); total += r.final * q; c.locks[p.id] = c.locks[p.id] || r.final; });
  c.signals.zonaEntrega = zone.id;
  if (["credito", "debito", "transferencia", "efectivo"].includes(b.pago)) c.signals.pago = b.pago;
  c.signals.hora = new Date().getHours();
  const order = { id: "PZ-" + (1001 + db.orders.length), date: now(), customerId: c.id, total, items: items.map(({ p, q }) => ({ id: p.id, q })) };
  db.orders.unshift(order); save();
  res.json({ id: order.id, total });
});
// Consulta simple de precio (para integraciones)
app.get("/api/precio", (req, res) => {
  const p = db.products.find(x => x.id === req.query.producto);
  if (!p || !E.ready(db, p)) return res.status(404).json({ error: "Producto no encontrado o sin precio." });
  let zoneId = req.query.zona;
  if (req.query.barrio) { const b = db.barrios.find(x => E.norm(x.name) === E.norm(req.query.barrio)); if (b) zoneId = b.zoneId; }
  const zone = E.findZone(db, zoneId), c = req.query.cliente ? customer(req.query.cliente) : null;
  if (c && !c.consent) return res.json({ producto: p.name, consent: false, precio: null });
  const r = E.personalPrice(db, p, zone, c);
  res.json({ producto: p.name, zona: zone.name, precio: c ? r.final : r.price });
});

// ================= Páginas =================
const APP_HTML = fs.readFileSync(path.join(__dirname, "public", "app.html"), "utf8").replace('window.CC_MODE = "local";', 'window.CC_MODE = "server";');
app.get("/", (req, res) => res.type("html").send(APP_HTML));
app.get("/admin", (req, res) => res.redirect("/#admin"));
app.get("/preciozona.js", (req, res) => { res.setHeader("Access-Control-Allow-Origin", "*"); res.sendFile(path.join(__dirname, "public", "preciozona.js")); });
app.use(express.static(path.join(__dirname, "public"), { index: false }));

app.listen(PORT, () => console.log(`PrecioZona corriendo en http://localhost:${PORT}`));

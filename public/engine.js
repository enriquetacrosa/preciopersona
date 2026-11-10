// PrecioZona · motor de precios para cualquier tienda online.
// Lo usan el servidor (Render) y el navegador (vista previa).
// 1) Precio por zona: depende de dónde se entrega el producto.
// 2) Precio personal: con consentimiento, se ajusta según el perfil de cada comprador.
(function (root) {
  const E = {};

  E.SEED = {
    setupDone: false,
    company: { name: "Farmashop", site: "https://tienda.farmashop.com.uy", lastScan: null },
    params: { margenMin: 0.25, tope: 0.15, costoPct: 0.65, maxAumento: 0.15, umbralPerfil: 40 },
    products: [],
    // Competencia: link de la tienda y productos encontrados (mismos o similares)
    chains: [
      { name: "San Roque", site: "https://www.sanroque.com.uy", lastScan: null, status: "pendiente", note: "", matches: {} },
      { name: "Farmacity", site: "https://www.farmacity.com.uy", lastScan: null, status: "pendiente", note: "", matches: {} },
      { name: "Pigalle", site: "https://www.pigalle.com.uy", lastScan: null, status: "pendiente", note: "", matches: {} }
    ],
    zones: [
      { id: "costa-este", name: "Costa Este", dept: "Montevideo", chains: ["San Roque", "Farmacity"], factor: 0.98, days: "24 h", nivel: 1.0 },
      { id: "costa", name: "Costa", dept: "Montevideo", chains: ["San Roque", "Farmacity"], factor: 0.95, days: "24 h", nivel: 0.8 },
      { id: "centro", name: "Centro", dept: "Montevideo", chains: ["Pigalle", "San Roque"], factor: 0.98, days: "24 h", nivel: 0.5 },
      { id: "oeste-norte", name: "Oeste y Norte", dept: "Montevideo", chains: ["Pigalle"], factor: 0.82, days: "48 h", nivel: 0.2 },
      { id: "canelones", name: "Ciudad de la Costa", dept: "Canelones", chains: ["San Roque"], factor: 0.90, days: "48 h", nivel: 0.6 },
      { id: "maldonado", name: "Punta del Este", dept: "Maldonado", chains: ["San Roque"], factor: 1.04, days: "48 h", nivel: 0.9 },
      { id: "tacuarembo", name: "Tacuarembó", dept: "Tacuarembó", chains: [], factor: 1.0, days: "3 a 4 días", nivel: 0.3 }
    ],
    barrios: [
      ["Ciudad Vieja","centro"],["Centro","centro"],["Barrio Sur","centro"],["Cordón","centro"],["Palermo","centro"],
      ["Parque Rodó","costa"],["Punta Carretas","costa"],["Pocitos","costa"],["Buceo","costa"],["Parque Batlle, Villa Dolores","costa"],
      ["Malvín","costa"],["Malvín Norte","oeste-norte"],["Punta Gorda","costa-este"],["Carrasco","costa-este"],["Carrasco Norte","costa-este"],
      ["Bañados de Carrasco","oeste-norte"],["Maroñas, Parque Guaraní","oeste-norte"],["Flor de Maroñas","oeste-norte"],["Las Canteras","oeste-norte"],
      ["Punta Rieles, Bella Italia","oeste-norte"],["Jardines del Hipódromo","oeste-norte"],["Ituzaingó","oeste-norte"],["Unión","centro"],
      ["Villa Española","oeste-norte"],["Mercado Modelo, Bolívar","centro"],["Castro, P. Castellanos","oeste-norte"],["Cerrito","oeste-norte"],
      ["Las Acacias","oeste-norte"],["Aires Puros","oeste-norte"],["Casavalle","oeste-norte"],["Piedras Blancas","oeste-norte"],
      ["Manga, Toledo Chico","oeste-norte"],["Paso de las Duranas","oeste-norte"],["Peñarol, Lavalleja","oeste-norte"],["Cerro","oeste-norte"],
      ["Casabó, Pajas Blancas","oeste-norte"],["La Paloma, Tomkinson","oeste-norte"],["La Teja","oeste-norte"],["Prado, Nueva Savona","centro"],
      ["Capurro, Bella Vista","oeste-norte"],["Aguada","centro"],["Reducto","centro"],["Atahualpa","centro"],["Jacinto Vera","centro"],
      ["La Figurita","centro"],["Larrañaga","centro"],["La Blanqueada","centro"],["Villa Muñoz, Retiro","centro"],["La Comercial","centro"],
      ["Tres Cruces","centro"],["Brazo Oriental","centro"],["Sayago","oeste-norte"],["Conciliación","oeste-norte"],["Belvedere","oeste-norte"],
      ["Nuevo París","oeste-norte"],["Tres Ombúes, Victoria","oeste-norte"],["Paso de la Arena","oeste-norte"],["Colón Sureste, Abayubá","oeste-norte"],
      ["Colón Centro y Noroeste","oeste-norte"],["Lezica, Melilla","oeste-norte"],["Villa García, Manga Rural","oeste-norte"],["Manga","oeste-norte"]
    ].map(([name, zoneId]) => ({ name, zoneId })),
    pickups: [
      { id: "s-carrasco", name: "Sucursal Carrasco", zoneId: "costa-este" },
      { id: "s-pocitos", name: "Sucursal Pocitos", zoneId: "costa" },
      { id: "s-centro", name: "Sucursal Centro", zoneId: "centro" },
      { id: "s-cerro", name: "Sucursal Cerro", zoneId: "oeste-norte" },
      { id: "s-costa", name: "Sucursal Ciudad de la Costa", zoneId: "canelones" },
      { id: "s-pde", name: "Sucursal Punta del Este", zoneId: "maldonado" },
      { id: "s-tacua", name: "Sucursal Tacuarembó", zoneId: "tacuarembo" }
    ],
    overrides: {},
    customers: [],
    orders: [],
    lastScrape: null
  };

  // Clientes ficticios para la demo
  E.DEMO_CUSTOMERS = [
    { id: "lucia", name: "Lucía", fictional: true, consent: true, locks: {},
      signals: { zonaEntrega: "costa-este", zonasFrecuentes: ["costa-este", "costa", "maldonado"], comprasPrevias: 9, ticketPrevio: 2400,
        vistos: ["crema-sebamed-corporal-200-ml", "crema-hidratante-cerave-corporal-454-g"], dispositivo: { tipo: "celular", os: "iPhone (iOS 18)", navegador: "Safari", pantalla: "430 × 932", memoria: null, nucleos: 6 },
        pago: "credito", origen: "instagram", hora: 11, carritosAbandonados: 0, visitas: 23, departamentoIP: "Montevideo", idioma: "es-UY" } },
    { id: "sofia", name: "Sofía", fictional: true, consent: true, locks: {},
      signals: { zonaEntrega: "costa", zonasFrecuentes: ["costa", "centro"], comprasPrevias: 4, ticketPrevio: 1200,
        vistos: ["crema-corporal-nivea-reafirmante-q10-plus-250-ml"], dispositivo: { tipo: "computadora", os: "Windows 11", navegador: "Chrome", pantalla: "1920 × 1080", memoria: 8, nucleos: 8 },
        pago: "credito", origen: "directo", hora: 15, carritosAbandonados: 1, visitas: 9, departamentoIP: "Montevideo", idioma: "es-UY" } },
    { id: "martin", name: "Martín", fictional: true, consent: true, locks: {},
      signals: { zonaEntrega: "oeste-norte", zonasFrecuentes: ["oeste-norte", "centro"], comprasPrevias: 1, ticketPrevio: 500,
        vistos: ["crema-corporal-six-leche-de-coco-195-g"], dispositivo: { tipo: "celular", os: "Android 12", navegador: "Chrome", pantalla: "360 × 800", memoria: 3, nucleos: 8 },
        pago: "debito", origen: "google", hora: 22, carritosAbandonados: 3, visitas: 4, departamentoIP: "Montevideo", idioma: "es-UY" } }
  ];

  E.clone = o => JSON.parse(JSON.stringify(o));
  E.round9 = p => Math.ceil(p / 10) * 10 - 1;
  E.slug = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "producto";
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

  // ================= COINCIDENCIA DE PRODUCTOS (comparación de palabras) =================
  const STOP = new Set("x de del la el los las y con para en por al un una gr grs g ml cc l kg lt un unid unidades pack".split(" "));
  // Palabras de categoría: cuentan la mitad (no alcanzan solas para decir que dos productos se parecen)
  const GENERIC = new Set("crema cremas corporal corporales locion hidratante hidratantes body cuerpo piel remera remeras pantalon jean buzo campera".split(" "));
  E.norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  E.size = name => {
    const m = E.norm(name).match(/(\d+(?:[.,]\d+)?)\s*(ml|cc|l|lt|g|gr|grs|kg)\b/);
    if (!m) return null;
    let v = parseFloat(m[1].replace(",", ".")); const u = m[2];
    if (u === "l" || u === "lt") v *= 1000; if (u === "kg") v *= 1000;
    return { value: v, unit: ["ml", "cc", "l", "lt"].includes(u) ? "ml" : "g" };
  };
  E.tokens = name => E.norm(name).replace(/(\d+(?:[.,]\d+)?)\s*(ml|cc|l|lt|g|gr|grs|kg)\b/g, " ")
    .split(/[^a-z0-9]+/).filter(t => t && !STOP.has(t) && !/^\d+$/.test(t));
  E.similarity = (a, b) => {
    const A = new Set(E.tokens(a)), B = new Set(E.tokens(b));
    const w = t => GENERIC.has(t) ? 0.5 : 1;
    let inter = 0, uni = 0;
    new Set([...A, ...B]).forEach(t => { uni += w(t); if (A.has(t) && B.has(t)) inter += w(t); });
    return uni ? inter / uni : 0;
  };
  // Mejor coincidencia de un producto propio dentro del catálogo de un competidor
  E.bestMatch = (product, catalog) => {
    let best = null;
    const sa = E.size(product.name);
    catalog.forEach(item => {
      const score = E.similarity(product.name, item.name);
      const sb = E.size(item.name);
      const sameSize = sa && sb && sa.unit === sb.unit && Math.abs(sa.value - sb.value) / sa.value < 0.05;
      let kind = null;
      if (score >= 0.75 && (sameSize || (!sa && !sb))) kind = "mismo";
      else if (score >= 0.4) kind = "similar";
      if (!kind) return;
      const rank = (kind === "mismo" ? 1 : 0) + score;
      if (!best || rank > best.rank) {
        // Precio equivalente: si el tamaño es distinto, se lleva al tamaño del producto propio
        const equiv = sa && sb && sa.unit === sb.unit && !sameSize ? item.price * sa.value / sb.value : item.price;
        const sizeNote = !sa || !sb ? "sin tamaño para comparar" : sa.unit !== sb.unit ? "tamaños no comparables (ml y g)" : sameSize ? "" : `llevado a ${sa.value} ${sa.unit}`;
        best = { rank, kind, score: Math.round(score * 100) / 100, name: item.name, url: item.url || "", price: item.price, equivPrice: Math.round(equiv), sizeNote, simulated: !!item.simulated };
      }
    });
    if (best) delete best.rank;
    return best;
  };

  // ================= PRECIO POR ZONA =================
  E.estZone = db => ({ id: "estimado", name: "Sin zona elegida", dept: "Montevideo", chains: db.chains.map(c => c.name), factor: 1, days: "24 a 48 h", nivel: 0.5, estimated: true });
  E.allZones = db => [...db.zones, E.estZone(db)];
  E.findZone = (db, id) => db.zones.find(z => z.id === id) || E.estZone(db);
  E.costOf = (db, p) => Number(p.cost) > 0 ? Number(p.cost) : (Number(p.currentPrice) > 0 ? Number(p.currentPrice) * db.params.costoPct : null);
  E.ready = (db, p) => Number(p.currentPrice) > 0 && E.costOf(db, p) > 0;

  const compPrices = (db, p, names) => db.chains
    .filter(c => !names || names.includes(c.name))
    .map(c => c.matches && c.matches[p.id] && c.matches[p.id].equivPrice).filter(n => n > 0);

  E.compFor = (db, p, zone) => {
    const inZone = zone.estimated ? [] : compPrices(db, p, zone.chains);
    if (inZone.length) return { value: Math.min(...inZone), basis: "zona" };
    const all = compPrices(db, p);
    if (all.length) return { value: all.reduce((a, b) => a + b, 0) / all.length, basis: "promedio" };
    return { value: Number(p.currentPrice), basis: "propio" };
  };

  E.suggest = (db, p, zone) => {
    const { margenMin, tope } = db.params;
    const cost = E.costOf(db, p);
    const floor = cost / (1 - margenMin);
    const c = E.compFor(db, p, zone);
    const base = Number(p.currentPrice);
    const target = c.value * zone.factor;
    const capped = Math.min(base * (1 + tope), Math.max(base * (1 - tope), target));
    let price = E.round9(Math.max(floor, capped));
    if (price < floor) price += 10;
    return { cost, floor, comp: c.value, compBasis: c.basis, base, target, capped, price, belowFloor: capped < floor };
  };
  E.evaluate = (db, p, price, s) => {
    const margin = (price - s.cost) / price;
    let light = "verde";
    if (price < s.floor || (s.belowFloor && price <= s.price)) light = "rojo";
    else if (price > s.comp * 1.01) light = "amarillo";
    return { margin, light };
  };
  E.current = (db, p, zone) => {
    const s = E.suggest(db, p, zone);
    const manual = db.overrides && db.overrides[p.id] && Number(db.overrides[p.id][zone.id]);
    const price = manual > 0 ? manual : s.price;
    return { ...s, suggested: s.price, price, manual: manual > 0, ...E.evaluate(db, p, price, s) };
  };

  // ================= PERFIL DEL COMPRADOR =================
  // Cada factor da un puntaje de 0 a 1; el índice es el promedio ponderado (0 a 100)
  E.FACTORS = [
    { k: "zonaEntrega", label: "Zona de entrega", w: 18 },
    { k: "zonasFrecuentes", label: "Zonas por donde se mueve", w: 14 },
    { k: "ticket", label: "Gasto promedio por compra", w: 14 },
    { k: "frecuencia", label: "Cantidad de compras", w: 12 },
    { k: "nivelVisto", label: "Precio de lo que mira", w: 10 },
    { k: "dispositivo", label: "Dispositivo", w: 10 },
    { k: "pago", label: "Medio de pago", w: 7 },
    { k: "origen", label: "De dónde llegó", w: 5 },
    { k: "horario", label: "Horario de compra", w: 4 },
    { k: "sensibilidad", label: "Carritos abandonados", w: 6 }
  ];
  E.zoneNivel = (db, zoneId) => (db.zones.find(z => z.id === zoneId) || { nivel: 0.5 }).nivel;
  E.catalogAvg = db => { const p = db.products.filter(x => x.currentPrice > 0).map(x => x.currentPrice); return p.length ? p.reduce((a, b) => a + b, 0) / p.length : 1; };

  E.profileScores = (db, c) => {
    const s = c.signals || {};
    const avg = E.catalogAvg(db);
    const orders = db.orders.filter(o => o.customerId === c.id);
    const spent = orders.reduce((a, o) => a + o.total, 0) + (s.comprasPrevias || 0) * (s.ticketPrevio || 0);
    const nOrders = orders.length + (s.comprasPrevias || 0);
    const ticket = nOrders ? spent / nOrders : 0;
    const viewed = (s.vistos || []).map(id => (db.products.find(p => p.id === id) || {}).currentPrice).filter(Boolean);
    const dev = s.dispositivo || {};
    let disp = 0.5;
    if (/iphone|ipad|mac/i.test(dev.os || "")) disp = 0.95;
    else if (dev.tipo === "computadora") disp = 0.65;
    else if (dev.memoria && dev.memoria <= 3) disp = 0.2;
    else if (dev.tipo === "celular") disp = 0.45;
    const pago = { credito: 1, debito: 0.55, transferencia: 0.5, efectivo: 0.25 }[s.pago] ?? 0.5;
    const origen = { instagram: 0.7, google: 0.5, directo: 0.6, email: 0.6, otro: 0.5 }[s.origen] ?? 0.5;
    const hora = s.hora; // hora habitual de compra
    const horario = hora == null ? 0.5 : (hora >= 9 && hora <= 18 ? 0.6 : hora >= 19 && hora <= 23 ? 0.5 : 0.3);
    const fz = (s.zonasFrecuentes || []).map(z => E.zoneNivel(db, z));
    return {
      zonaEntrega: s.zonaEntrega ? E.zoneNivel(db, s.zonaEntrega) : 0.5,
      zonasFrecuentes: fz.length ? fz.reduce((a, b) => a + b, 0) / fz.length : 0.5,
      ticket: nOrders ? clamp(ticket / (avg * 2.5)) : 0.3,
      frecuencia: clamp(nOrders / 12),
      nivelVisto: viewed.length ? clamp((viewed.reduce((a, b) => a + b, 0) / viewed.length) / (avg * 1.6)) : 0.5,
      dispositivo: disp,
      pago,
      origen,
      horario,
      sensibilidad: 1 - clamp((s.carritosAbandonados || 0) / 4)
    };
  };
  E.profile = (db, c) => {
    const sc = E.profileScores(db, c);
    const total = E.FACTORS.reduce((a, f) => a + f.w, 0);
    const index = Math.round(E.FACTORS.reduce((a, f) => a + sc[f.k] * f.w, 0) / total * 100);
    const { maxAumento, umbralPerfil } = db.params;
    const adj = index <= umbralPerfil ? 0 : maxAumento * (index - umbralPerfil) / (100 - umbralPerfil);
    return { scores: sc, index, adj };
  };

  // Precio final para una persona: precio de su zona + ajuste personal.
  // Si ya compró ese producto, se le mantiene el precio de la primera compra.
  E.personalPrice = (db, p, zone, c) => {
    const z = E.current(db, p, zone);
    if (!c || !c.consent) return { ...z, personal: null, final: null, locked: false };
    const lock = c.locks && c.locks[p.id];
    if (lock) return { ...z, personal: E.profile(db, c), final: lock, locked: true };
    const pr = E.profile(db, c);
    return { ...z, personal: pr, final: E.round9(z.price * (1 + pr.adj)), locked: false };
  };

  E.freshDb = () => { const s = E.clone(E.SEED); s.customers = E.clone(E.DEMO_CUSTOMERS); return s; };

  // Ubicación del dispositivo → zona de precio más cercana (punto de referencia aproximado de cada zona)
  E.ZONE_POINTS = { "costa-este": [-34.885, -56.06], "costa": [-34.911, -56.155], "centro": [-34.903, -56.185], "oeste-norte": [-34.86, -56.23],
    "canelones": [-34.82, -55.95], "maldonado": [-34.94, -54.94], "tacuarembo": [-31.72, -55.98] };
  E.zoneFromCoords = (lat, lon) => {
    let best = null, bd = Infinity;
    Object.entries(E.ZONE_POINTS).forEach(([id, [a, b]]) => { const d = (a - lat) ** 2 + (b - lon) ** 2; if (d < bd) { bd = d; best = id; } });
    return bd < 1.5 ? best : null; // fuera de Uruguay: sin zona
  };

  // Planilla de precios por zona
  E.exportRows = db => {
    const zones = E.allZones(db);
    return [["Producto", "Link", "Precio actual", ...zones.map(z => z.name)],
      ...db.products.filter(p => E.ready(db, p)).map(p => [p.name, p.url, p.currentPrice, ...zones.map(z => E.current(db, p, z).price)])];
  };

  if (typeof module !== "undefined" && module.exports) module.exports = E;
  else root.Engine = E;
})(typeof window !== "undefined" ? window : globalThis);

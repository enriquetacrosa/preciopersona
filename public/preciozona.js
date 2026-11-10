/* PrecioZona · script para la web de la tienda.
   Uso: <script src="https://TU-SITIO.onrender.com/preciozona.js"></script>
   Muestra el cartel de cookies, junta los datos del comprador (con su consentimiento)
   y le pide al back-office el precio para esa persona. */
(function () {
  const script = document.currentScript;
  const BASE = script ? new URL(script.src).origin : "";
  const KEY = "pz_visitor";
  const read = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

  let visitorId = read(KEY), consent = read(KEY + "_consent"), company = "la tienda";
  consent = consent === "1" ? true : consent === "0" ? false : null;
  let checkoutStarted = false;
  const listeners = [];

  async function call(path, method, body) {
    const r = await fetch(BASE + path, { method: method || "GET", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || "Error"); e.data = j; throw e; }
    return j;
  }

  // Datos que permite el navegador
  function signals() {
    const ua = navigator.userAgent;
    const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad (iOS)" : /Mac OS X/.test(ua) ? "Mac (macOS)" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Otro";
    const nav = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : "Otro";
    const ref = document.referrer || "", q = new URLSearchParams(location.search), utm = (q.get("utm_source") || "").toLowerCase();
    const origen = /instagram|facebook|fb/.test(utm + ref) ? "instagram" : /google/.test(utm + ref) ? "google" : /mail|newsletter/.test(utm + ref) ? "email" : ref ? "otro" : "directo";
    return {
      dispositivo: { tipo: /Mobi|Android|iPhone/.test(ua) ? "celular" : "computadora", os, navegador: nav, pantalla: `${screen.width} × ${screen.height}`, memoria: navigator.deviceMemory || null, nucleos: navigator.hardwareConcurrency || null },
      idioma: navigator.language, zonaHoraria: Intl.DateTimeFormat().resolvedOptions().timeZone, origen, hora: new Date().getHours()
    };
  }
  async function sendVisitor(extra) {
    const r = await call("/api/public/visitor", "POST", { visitorId, consent, signals: consent ? { ...signals(), ...(extra || {}) } : undefined });
    visitorId = r.visitorId; write(KEY, visitorId);
  }
  function askLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos => sendVisitor({ lat: pos.coords.latitude, lon: pos.coords.longitude }).catch(() => {}), () => {}, { timeout: 8000, maximumAge: 600000 });
  }

  // ---------- Cartel de cookies ----------
  const css = `#pz-ck{position:fixed;inset:0;background:rgba(10,16,18,.55);display:flex;align-items:flex-end;justify-content:center;padding:16px;z-index:2147483000;font-family:system-ui,-apple-system,"Segoe UI",Arial,sans-serif}
  #pz-ck .b{background:#fff;color:#1d2a2e;border-radius:16px;max-width:620px;width:100%;padding:22px;max-height:calc(100% - 16px);overflow:auto}
  #pz-ck h3{margin:0 0 6px;font-size:21px}#pz-ck p{margin:0;font-size:15px;line-height:1.5}
  #pz-ck .lk{background:none;border:0;padding:0;color:#2f6f73;text-decoration:underline;cursor:pointer;font-size:13px;margin-top:8px}
  #pz-ck .t{font-size:11px;line-height:1.45;color:#56666b;max-height:220px;overflow:auto;border:1px solid #d6dfdc;border-radius:8px;padding:8px 10px;margin-top:8px}
  #pz-ck .t p{font-size:11px;margin:0 0 6px}#pz-ck .a{display:flex;gap:10px;margin-top:14px}
  #pz-ck .a button{flex:1;border-radius:10px;padding:11px;font-weight:700;font-size:15px;cursor:pointer}
  #pz-ck .r{background:#fff;border:1px solid #d6dfdc;color:#1d2a2e}#pz-ck .ok{background:#2f6f73;border:0;color:#fff}`;
  function terms() {
    return `<div class="t" hidden>
      <p><b>Términos y condiciones de uso de cookies de ${company}.</b> Al aceptar, autorizás a ${company} y a su proveedor tecnológico a almacenar cookies en tu dispositivo y a tratar los datos que se detallan, conforme a la Ley N° 18.331 de Protección de Datos Personales.</p>
      <p><b>1. Cookies técnicas.</b> Necesarias para el funcionamiento del sitio, el carrito y la sesión.</p>
      <p><b>2. Cookies de preferencias.</b> Guardan tu barrio o sucursal de entrega y tus elecciones anteriores.</p>
      <p><b>3. Cookies de análisis y personalización.</b> Recolectan: barrio o sucursal de entrega, ubicación aproximada según tu conexión, ubicación del dispositivo cuando la autorizás, zonas desde las que accedés al sitio, compras realizadas en esta tienda y montos, productos visitados, carritos no finalizados, cantidad y horario de visitas, tipo de dispositivo, sistema operativo, navegador, pantalla, memoria y procesador, idioma, zona horaria, sitio de origen de la visita y medio de pago elegido. Estos datos se usan para elaborar un perfil de compra y <b>personalizar los precios y ofertas que se te muestran</b>, que pueden variar entre usuarios. El precio que se muestra antes de confirmar la compra es el precio final.</p>
      <p><b>4. Conservación y derechos.</b> Los datos se conservan mientras mantengas la aceptación. Podés retirarla en cualquier momento borrando las cookies del sitio, y ejercer tus derechos de acceso, rectificación y supresión ante ${company}.</p>
      <p><b>5. Rechazo.</b> Si no aceptás las cookies de análisis y personalización, podés navegar el catálogo, pero no ver precios ni finalizar compras, porque el precio se calcula para cada usuario.</p></div>`;
  }
  function banner(reason) {
    return new Promise(resolve => {
      if (!document.getElementById("pz-style")) { const s = document.createElement("style"); s.id = "pz-style"; s.textContent = css; document.head.appendChild(s); }
      const old = document.getElementById("pz-ck"); if (old) old.remove();
      const el = document.createElement("div"); el.id = "pz-ck"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Aviso de cookies");
      el.innerHTML = `<div class="b"><h3>Usamos cookies</h3><p>${reason || "Usamos cookies propias y de terceros para que el sitio funcione, recordar tu carrito y mejorar tu experiencia de compra. Para ver precios y comprar es necesario aceptarlas."}</p>
        <button class="lk" type="button">Ver términos y condiciones de cookies</button>${terms()}
        <div class="a"><button class="r" type="button">Rechazar</button><button class="ok" type="button">Aceptar</button></div></div>`;
      document.body.appendChild(el);
      el.querySelector(".lk").onclick = () => { const t = el.querySelector(".t"); t.hidden = !t.hidden; el.querySelector(".lk").textContent = (t.hidden ? "Ver" : "Ocultar") + " términos y condiciones de cookies"; };
      const decide = async ok => {
        consent = ok; write(KEY + "_consent", ok ? "1" : "0"); el.remove();
        await sendVisitor().catch(() => {});
        if (ok) askLocation();
        listeners.forEach(f => f({ consent }));
        resolve(ok);
      };
      el.querySelector(".ok").onclick = () => decide(true);
      el.querySelector(".r").onclick = () => decide(false);
      el.querySelector(".ok").focus();
    });
  }

  // Si el comprador deja el pago a medias, se registra como carrito abandonado
  window.addEventListener("pagehide", () => {
    if (checkoutStarted && consent && visitorId && navigator.sendBeacon)
      navigator.sendBeacon(BASE + "/api/public/track", new Blob([JSON.stringify({ visitorId, event: "abandon" })], { type: "application/json" }));
  });

  window.PrecioZona = {
    // Arranca: trae productos, barrios y sucursales; muestra el cartel si todavía no decidió
    async init() {
      const cfg = await call("/api/public/config");
      company = cfg.company || company;
      if (consent === null) banner(); else sendVisitor().catch(() => {});
      return cfg;
    },
    consent: () => consent,
    onConsent(fn) { listeners.push(fn); },
    showBanner: reason => banner(reason),
    // Precios para este comprador. loc = "b:<n°>" (barrio) o "p:<id>" (sucursal)
    async prices(loc) {
      if (!consent || !visitorId) return { consent: false, prices: {} };
      return call(`/api/public/prices?visitor=${encodeURIComponent(visitorId)}&loc=${encodeURIComponent(loc || "")}`);
    },
    view(productId) { if (consent && visitorId) call("/api/public/track", "POST", { visitorId, event: "view", productId }).catch(() => {}); },
    setLocation(loc) { if (consent && visitorId) call("/api/public/track", "POST", { visitorId, event: "zone", loc }).catch(() => {}); },
    startCheckout() { checkoutStarted = true; },
    // Confirma la compra. Si no aceptó las cookies, vuelve a mostrar el cartel.
    async checkout(items, loc, pago) {
      if (!consent) {
        const ok = await banner("Para comprar necesitamos calcular tu precio, y para eso tenés que aceptar las cookies.");
        if (!ok) throw new Error("Sin aceptar las cookies no se puede comprar.");
      }
      const r = await call("/api/public/order", "POST", { visitorId, items, loc, pago });
      checkoutStarted = false;
      return r;
    },
    // Para probar: olvida al visitante y vuelve a mostrar el cartel
    reset() { try { localStorage.removeItem(KEY); localStorage.removeItem(KEY + "_consent"); } catch (e) {} visitorId = null; consent = null; return banner(); }
  };
})();

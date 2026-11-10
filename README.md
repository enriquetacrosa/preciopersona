# PrecioZona · motor de precios para tiendas online

Proyecto académico (Introducción a la Tecnología, ORT 2026). Farmashop se usa como caso de ejemplo, sin relación con la empresa.

## Qué hace

- **Back-office** (`/`, contraseña por defecto `ort2026`):
  1. **Tu tienda:** con el link de la tienda (portada, categoría o búsqueda) carga todos sus productos y precios. Si la tienda bloquea la lectura, pide habilitar el acceso.
  2. **Competencia:** con el link de cada tienda competidora busca los mismos productos o similares (comparando palabras). Si una tienda bloquea la lectura, se carga con capturas de pantalla, que se leen con OCR.
  3. **Precios de venta:** sugiere un precio por zona; se usan los sugeridos o se cargan a mano.
  4. **Clientes:** perfil de cada comprador con su índice de 0 a 100 y su precio personal.
  5. **Exportar:** planilla CSV (Excel o Google Sheets) y conexión directa con la web de la tienda.
- **Script para la web de la tienda** (`/preciozona.js`): muestra el cartel de cookies, junta los datos del comprador y pide su precio.

## Subirlo a Render

1. Subí esta carpeta a un repositorio de GitHub (sin `node_modules`).
2. En Render: **New → Web Service**, elegí el repositorio.
3. Runtime **Node**, Build Command `npm install`, Start Command `npm start`, Instance Type **Free**.
4. Opcional: variable `ADMIN_PASSWORD` en **Environment**.

## Conectar la web de una tienda

```html
<script src="https://TU-SITIO.onrender.com/preciozona.js"></script>
<script>
  const cfg = await PrecioZona.init();          // productos, barrios y sucursales; muestra el cartel
  const r = await PrecioZona.prices("b:7");      // precios para este comprador (b: barrio, p: sucursal)
  PrecioZona.view(productId);                    // producto visto
  PrecioZona.startCheckout();                    // empezó a pagar (si se va, cuenta como carrito abandonado)
  await PrecioZona.checkout([{ id, q: 1 }], "b:7", "credito");  // compra (pide cookies si no aceptó)
</script>
```

Consulta simple: `GET /api/precio?producto=<id>&barrio=Pocitos&cliente=<id>`

## A tener en cuenta

- Plan gratis de Render: se apaga a los 15 minutos sin uso y tarda alrededor de un minuto en arrancar. La base (`data/db.json`) se borra al reiniciar.
- La primera lectura de capturas tarda unos segundos más (carga el idioma español).
- `node build-preview.js` arma la versión de una sola página que se usa como vista previa.

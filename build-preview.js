// Arma la versión de una sola página (vista previa) a partir de public/app.html
const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "public", "app.html"), "utf8");
const engine = fs.readFileSync(path.join(__dirname, "public", "engine.js"), "utf8");
const out = html
  .replace(/<!--SERVER-START-->[\s\S]*?<!--SERVER-END-->/g, "")
  .replace(/<!--ENGINE-->[\s\S]*?<!--\/ENGINE-->/, () => `<script>\n${engine}\n</script>`)
  .trim() + "\n";
const dest = process.argv[2] || path.join(__dirname, "preview.html");
fs.writeFileSync(dest, out);
console.log("Vista previa escrita en", dest);

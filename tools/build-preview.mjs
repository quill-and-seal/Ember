// Construit docs/preview.html : la page d'aperçu en un seul fichier (moteur + presets intégrés).
// Usage : npm install && npm run build:preview
import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";

const result = await build({
  entryPoints: ["preview/preview.js"],
  bundle: true,
  format: "iife",
  minify: true,
  write: false,
  target: "es2022"
});

const bundle = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const template = await readFile("preview/template.html", "utf8");
await mkdir("docs", { recursive: true });
await writeFile("docs/preview.html", template.replace("/*__BUNDLE__*/", () => bundle));
console.log(`docs/preview.html (${(bundle.length / 1024).toFixed(1)} Ko de script)`);

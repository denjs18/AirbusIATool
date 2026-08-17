// Copie le worker pdf.js dans /public.
// On sert le worker en statique plutot que de le faire resoudre par le bundler :
// c'est ce qui garantit que l'extraction PDF tourne 100 % dans le navigateur,
// sans upload des documents vers un serveur.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

try {
  const pdfjsEntry = require.resolve("pdfjs-dist/package.json");
  const root = dirname(pdfjsEntry);
  const candidates = [
    join(root, "build", "pdf.worker.min.mjs"),
    join(root, "build", "pdf.worker.mjs"),
  ];
  const source = candidates.find((p) => existsSync(p));
  if (!source) {
    console.warn("[copy-pdf-worker] worker introuvable, etape ignoree");
    process.exit(0);
  }
  mkdirSync("public", { recursive: true });
  copyFileSync(source, join("public", "pdf.worker.min.mjs"));
  console.log("[copy-pdf-worker] public/pdf.worker.min.mjs ecrit");
} catch (err) {
  console.warn("[copy-pdf-worker] etape ignoree:", err.message);
}

/**
 * Test de non-regression : worker de pdf.js totalement indisponible.
 *
 * Deux mecanismes sont neutralises ensemble :
 *  - la creation d'un worker de type module, absente avant Safari 15 ;
 *  - le chargement reseau du fichier worker, dont pdf.js se sert pour son
 *    propre repli via un import dynamique annote `webpackIgnore` (directive
 *    propre a webpack, donc sans garantie avec un autre bundler).
 *
 * Ce chemin n'est jamais emprunte sur un poste de bureau, ou le worker dedie
 * fonctionne toujours. Le test verifie que la lecture de PDF aboutit malgre
 * tout, grace au module worker embarque dans l'application et charge dans le
 * thread principal.
 *
 * Prerequis :
 *   npm run build && npx next start -p 3210
 *   npm install --no-save playwright
 */
import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE ?? "http://localhost:3210";

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });

const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

// Neutralise les workers de type module avant tout script de la page.
await page.addInitScript(() => {
  const Original = window.Worker;
  // @ts-expect-error remplacement volontaire
  window.Worker = function (url, options) {
    if (options && options.type === "module") {
      throw new Error("module workers indisponibles (simulation)");
    }
    return new Original(url, options);
  };
});

// Rend aussi le fichier worker inaccessible par le reseau, pour que le repli
// interne de pdf.js echoue et que celui de l'application soit reellement
// exerce. Le diagnostic telecharge ce fichier a titre informatif : on ne
// bloque que les requetes de script.
await page.route("**/pdf.worker.min.mjs", (route) =>
  route.request().resourceType() === "script" ? route.abort() : route.continue(),
);

await page.goto(BASE, { waitUntil: "networkidle" });

await page.getByRole("button", { name: "Charger l'ACP fictif" }).click();
await page.getByText("Exigences extraites", { exact: false }).waitFor({ timeout: 60000 });
const rows = await page.locator("table tbody tr").count();
console.log("Sans worker dedie : lignes d'exigences =", rows);
if (rows < 20) throw new Error(`extraction incomplete : ${rows} lignes`);

// La page de diagnostic doit annoncer le chemin de repli.
await page.goto(`${BASE}/diagnostic`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Lancer le test" }).click();
await page
  .waitForFunction(() => !document.body.innerText.includes("Test en cours"), null, { timeout: 60000 })
  .catch(() => {});
const report = await page.locator("pre").last().innerText();
const chain = (report.split("CHAINE DE LECTURE PDF")[1] ?? "").trim();
console.log(chain);
if (!chain.includes("thread principal")) {
  throw new Error("le diagnostic n'annonce pas le repli dans le thread principal");
}
// Les etapes 1 a 5 sollicitent pdf.js en direct et peuvent echouer dans cette
// simulation : ce qui compte est que le chemin applicatif, lui, aboutisse.
// Les etapes 3 a 7 sollicitent pdf.js en direct et peuvent echouer dans cette
// simulation : ce qui compte est que le chemin applicatif (1 et 2) aboutisse.
for (const line of chain.split("\n")) {
  if (/^\s*ECHEC\s+[12]\./.test(line)) {
    throw new Error(`etape applicative en echec : ${line.trim()}`);
  }
}

console.log("ERREURS CONSOLE :", errors.length ? errors : "aucune");
await browser.close();

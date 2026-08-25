/**
 * Test de non-regression : compatibilite navigateur ancien.
 *
 * Un iPhone anterieur a iOS 17.4 n'a pas Promise.withResolvers. Le build par
 * defaut de pdf.js appelle cette API sans repli, ce qui faisait echouer le
 * chargement d'un PDF avec un message incomprehensible. On simule ce moteur en
 * supprimant l'API avant tout chargement de script, et on verifie que les
 * modules qui lisent des PDF fonctionnent quand meme.
 *
 * Prerequis :
 *   npm run build && npx next start -p 3210
 *   npm install --no-save playwright
 * Puis :
 *   node scripts/smoke-legacy.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE ?? "http://localhost:3210";

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });

const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

// Retire l'API avant l'execution de tout script de la page et de ses workers.
await page.addInitScript(() => {
  // @ts-expect-error suppression volontaire pour simuler un moteur ancien
  delete Promise.withResolvers;
});

await page.goto(BASE, { waitUntil: "networkidle" });

const hasApi = await page.evaluate(() => typeof Promise.withResolvers);
console.log("Promise.withResolvers au chargement :", hasApi, hasApi === "undefined" ? "(OK, absente)" : "(ATTENTION, presente)");

// Module 1 : lecture d'un PDF, le chemin qui echouait sur iPhone.
await page.getByRole("button", { name: "Charger l'ACP fictif" }).click();
await page.getByText("Exigences extraites", { exact: false }).waitFor({ timeout: 40000 });
const rows = await page.locator("table tbody tr").count();
console.log("Module 1 sur moteur ancien : lignes d'exigences =", rows);
if (rows < 20) throw new Error(`extraction incomplete : ${rows} lignes`);

// Module 2 atteignable directement, sans repasser par le module 1.
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /2\. Trames de coversheets/ }).click();
await page.getByRole("button", { name: "Charger l'ACP fictif" }).click();
await page.getByText("Trames generees", { exact: false }).waitFor({ timeout: 40000 });
const sheets = await page.locator("ul li button span.font-mono").count();
console.log("Module 2 charge seul : trames =", sheets);
if (sheets < 20) throw new Error(`generation incomplete : ${sheets} trames`);

// Module 5 atteignable directement lui aussi.
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /5\. Recoupement/ }).click();
await page.getByRole("button", { name: "Charger l'ACP fictif" }).click();
await page.getByText("Registre des coversheets", { exact: false }).waitFor({ timeout: 40000 });
await page.getByRole("button", { name: "Charger le registre fictif" }).click();
await page.getByText("Resultat du recoupement", { exact: false }).waitFor({ timeout: 20000 });
const coverage = await page.locator("text=Couverture du plan").locator("..").innerText();
console.log("Module 5 charge seul :", coverage.replace(/\n/g, " "));

console.log("ERREURS CONSOLE :", errors.length ? errors : "aucune");
if (errors.length) process.exitCode = 1;
await browser.close();

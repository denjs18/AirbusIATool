/**
 * Smoke test de bout en bout dans un vrai navigateur.
 *
 * Complete la suite vitest : celle-ci valide la logique metier, celui-ci valide
 * que la demonstration se deroule reellement (lecture PDF cote client, worker
 * pdf.js servi correctement, enchainement des cinq modules, zero erreur console).
 *
 * Prerequis :
 *   npm run build && npx next start -p 3210
 *   npm install --no-save playwright
 * Puis :
 *   node scripts/smoke.mjs
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3210";
const OUT = process.env.SMOKE_OUT ?? "screenshots";

import { mkdirSync } from "node:fs";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
});
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(BASE, { waitUntil: "networkidle" });

// --- Module 1 : plan de certification -------------------------------------
await page.getByRole("button", { name: "Charger l'ACP fictif" }).click();
await page.getByText("Exigences extraites", { exact: false }).waitFor({ timeout: 30000 });
const reqCount = await page.locator("table tbody tr").count();
const pages = await page.locator("text=Pages analysees").locator("..").innerText();
console.log("MODULE 1 : lignes d'exigences =", reqCount, "|", pages.replace(/\n/g, " "));
await page.screenshot({ path: `${OUT}/01-plan.png`, fullPage: false });

// --- Module 2 : trames ----------------------------------------------------
await page.getByRole("button", { name: /2\. Trames de coversheets/ }).click();
await page.getByText("Trames generees", { exact: false }).waitFor();
const sheets = await page.locator("ul li button span.font-mono").count();
const md = await page.locator("pre").innerText();
console.log("MODULE 2 : trames =", sheets, "| trame contient [A REDIGER] :", md.includes("[A REDIGER]"));
await page.screenshot({ path: `${OUT}/02-trames.png` });

// --- Module 3 : coherence des renvois -------------------------------------
await page.getByRole("button", { name: /3\. Coherence des renvois/ }).click();
await page.getByRole("button", { name: "Charger la coversheet fictive" }).click();
await page.getByText("CVS-27-FCS-0001_Iss2.pdf", { exact: false }).waitFor({ timeout: 30000 });
await page.getByRole("button", { name: "Charger le dossier de securite fictif" }).click();
await page.getByText("chapitres detectes", { exact: false }).waitFor({ timeout: 30000 });
await page.getByRole("button", { name: "Verifier les renvois" }).click();
await page.getByText("Resultats du controle", { exact: false }).waitFor();
const badges = await page.locator("section >> text=Resultats du controle").locator("..").innerText();
console.log("MODULE 3 :", badges.split("\n").slice(0, 12).join(" | "));
const results3 = await page.locator("ul li").filter({ hasText: "Chapitre" }).allInnerTexts();
console.log("MODULE 3 detail :", results3.map((r) => r.split("\n").slice(0, 2).join(" ")).join(" // "));
await page.screenshot({ path: `${OUT}/03-coherence.png` });

// --- Module 4 : en-tetes --------------------------------------------------
await page.getByRole("button", { name: /4\. Controle des en-tetes/ }).click();
await page.getByRole("button", { name: "Coversheet fictive (defauts)" }).click();
await page.getByText("Champs lus dans l'en-tete", { exact: false }).waitFor({ timeout: 30000 });
const checks4 = await page.locator("ul li").allInnerTexts();
console.log("MODULE 4 :", checks4.map((c) => c.split("\n").slice(0, 2).join(" ")).join(" // "));
await page.screenshot({ path: `${OUT}/04-entetes.png` });

// --- Module 5 : recoupement ----------------------------------------------
await page.getByRole("button", { name: /5\. Recoupement/ }).click();
await page.getByRole("button", { name: "Charger le registre fictif" }).click();
await page.getByText("Resultat du recoupement", { exact: false }).waitFor({ timeout: 30000 });
const metrics5 = await page.locator("text=Couverture du plan").locator("../..").innerText();
console.log("MODULE 5 :", metrics5.replace(/\n/g, " | "));
await page.screenshot({ path: `${OUT}/05-recoupement.png` });


// Option de couverture au niveau du paragraphe
await page.getByRole("checkbox").check();
await page.waitForTimeout(400);
const metrics5b = await page.locator("text=Couverture du plan").locator("../..").innerText();
console.log("MODULE 5 (option paragraphe) :", metrics5b.replace(/\n/g, " | "));
await page.screenshot({ path: `${OUT}/05b-recoupement-option.png` });

console.log("ERREURS CONSOLE :", errors.length ? errors : "aucune");
if (errors.length) process.exitCode = 1;
await browser.close();

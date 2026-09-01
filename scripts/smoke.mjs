/**
 * Smoke test de bout en bout dans un vrai navigateur.
 *
 * Complete la suite vitest : celle-ci valide la logique metier, celui-ci valide
 * que la demonstration se deroule reellement (lecture PDF cote client, worker
 * pdf.js servi correctement, enchainement des modules, zero erreur console).
 *
 * Le coeur du test est le parcours du module 2 : documents de certification
 * issus du classeur, exigences du document choisi, validation, restitution du
 * texte. C'est le seul endroit ou l'on verifie que la selection commande bien
 * le texte, dans le navigateur et non dans une fonction pure.
 *
 * Prerequis :
 *   npm run build && npx next start -p 3210
 *   npm install --no-save playwright
 * Puis :
 *   node scripts/smoke.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = "http://localhost:3210";
const OUT = process.env.SMOKE_OUT ?? "screenshots";

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

const fail = (message) => {
  errors.push(`ASSERTION : ${message}`);
  console.log("ECHEC :", message);
};

await page.goto(BASE, { waitUntil: "networkidle" });

// --- Module 1 : extraction des exigences de l'ACP -------------------------
await page.getByRole("button", { name: "Charger l'ACP fictif" }).click();
await page.getByText("Exigences extraites", { exact: false }).waitFor({ timeout: 30000 });
const reqCount = await page.locator("table tbody tr").count();
console.log("MODULE 1 : lignes d'exigences =", reqCount);
if (reqCount === 0) fail("aucune exigence extraite de l'ACP fictif");
await page.screenshot({ path: `${OUT}/01-plan.png` });

// --- Parametres : chargement de la bibliotheque ---------------------------
await page.getByRole("button", { name: /Parametres/ }).click();
await page.getByRole("button", { name: "Charger l'exemple fictif" }).click();
await page.getByText("Blocs types", { exact: false }).first().waitFor();
await page.waitForTimeout(300);
const documentsCount = await page
  .locator("text=Documents de certification")
  .locator("..")
  .innerText();
console.log("PARAMETRES :", documentsCount.replace(/\n/g, " "));
await page.screenshot({ path: `${OUT}/00-parametres.png` });

// --- Module 2 : preparer une coversheet -----------------------------------
await page.getByRole("button", { name: /2\. Preparer une coversheet/ }).click();
await page.getByText("1. Document de certification", { exact: false }).waitFor();

// Les documents proposes viennent du classeur, pas de l'ACP.
const carte = (titre) =>
  page.locator("section").filter({ has: page.getByRole("heading", { name: titre }) });

const documents = await carte("1. Document de certification")
  .locator("button span.font-mono")
  .allInnerTexts();
console.log("MODULE 2 : documents proposes =", documents.join(", "));
if (!documents.includes("SYDMP")) fail("SYDMP absent des documents proposes");

await page.getByRole("button", { name: /^SYDMP/ }).click();
await page.getByText("2. Exigences de SYDMP", { exact: false }).waitFor();

const exigences = await carte(/^2\. Exigences/).locator("label span.font-mono").allInnerTexts();
console.log("MODULE 2 : exigences de SYDMP =", exigences.join(" | "));
// Le qualifieur saisi dans le classeur doit survivre jusqu'a l'ecran.
if (!exigences.some((e) => e.includes("Amdt 23"))) {
  fail("le qualifieur du classeur ne remonte pas dans la liste des exigences");
}

/** Coche les exigences citees, valide, et rend la coversheet produite. */
async function valider(citations) {
  await page.getByRole("button", { name: "Vider" }).click();
  for (const citation of citations) {
    await page.locator("label").filter({ hasText: citation }).getByRole("checkbox").check();
  }
  await page.getByRole("button", { name: "Valider" }).click();
  await page.getByText("5. Coversheet", { exact: false }).waitFor();
  return page.locator("pre").last().innerText();
}

// Avant validation, rien n'est produit : la trame ne doit pas exister.
if (await page.getByText("5. Coversheet", { exact: false }).count()) {
  fail("la coversheet apparait avant toute validation");
}

const ensemble = await valider(["CS 25.671(a) Amdt 23", "JAR 25.1301(a) ch. 11"]);
console.log("MODULE 2 : trame {A,B} =", ensemble.split("\n").length, "lignes");
await page.screenshot({ path: `${OUT}/02-coversheet.png`, fullPage: true });

const seule = await valider(["CS 25.671(a) Amdt 23"]);
console.log("MODULE 2 : trame {A} =", seule.split("\n").length, "lignes");

if (ensemble === seule) fail("la selection ne change pas le texte restitue");
if (!ensemble.includes("§x.x")) fail("les reperes de paragraphe ne sont pas restitues");
if (!ensemble.includes("Amdt 23")) fail("la citation produite a perdu son qualifieur");
console.log(
  "MODULE 2 : textes distincts =",
  ensemble !== seule,
  "| qualifieur cite =",
  ensemble.includes("Amdt 23"),
);

// La meme exigence, sous un autre document de certification, doit donner un
// autre texte : c'est la regle de la ligne, verifiee de bout en bout.
await page.getByRole("button", { name: /^SSA/ }).click();
await page.getByText("2. Exigences de SSA", { exact: false }).waitFor();
const sousSsa = await valider(["CS 25.671(a) Amdt 23"]);
if (sousSsa === seule) fail("la meme exigence donne le meme texte sous SSA et sous SYDMP");
console.log("MODULE 2 : CS 25.671(a) donne un texte propre a la SSA =", sousSsa !== seule);

// --- Module 3 : coherence des renvois -------------------------------------
await page.getByRole("button", { name: /3\. Coherence des renvois/ }).click();
await page.getByRole("button", { name: "Charger la coversheet fictive" }).click();
await page.getByText("CVS-27-FCS-0001_Iss2.pdf", { exact: false }).waitFor({ timeout: 30000 });
await page.getByRole("button", { name: "Charger le dossier de securite fictif" }).click();
await page.getByText("chapitres detectes", { exact: false }).waitFor({ timeout: 30000 });
await page.getByRole("button", { name: "Verifier les renvois" }).click();
await page.getByText("Resultats du controle", { exact: false }).waitFor();
console.log("MODULE 3 : controle execute");
await page.screenshot({ path: `${OUT}/03-coherence.png` });

// --- Module 4 : recoupement ----------------------------------------------
await page.getByRole("button", { name: /4\. Recoupement/ }).click();
await page.getByRole("button", { name: "Charger le registre fictif" }).click();
await page.getByText("Resultat du recoupement", { exact: false }).waitFor({ timeout: 30000 });
const metrics = await page.locator("text=Couverture du plan").locator("../..").innerText();
console.log("MODULE 4 :", metrics.replace(/\n/g, " | "));
await page.screenshot({ path: `${OUT}/04-recoupement.png` });

// --- Pointage des chapitres ----------------------------------------------
//
// Le coeur de la saisie : chaque §x.x devient un champ dans la phrase, guide
// par l'indication de l'edition precedente. Ce qui est verifie ici, c'est que
// l'indication guide sans jamais sortir dans le document produit.
await page.getByRole("button", { name: /2\. Preparer une coversheet/ }).click();
await page.getByRole("button", { name: /^SYDMP/ }).click();
await valider(["CS 25.671(a) Amdt 23", "JAR 25.1301(a) ch. 11"]);

const champs = carte(/^4\. Pointer les chapitres/).locator("input[data-repere]");
const nb = await champs.count();
const indications = await champs.evaluateAll((els) =>
  els.map((el) => el.getAttribute("placeholder")),
);
console.log("SAISIE : champs =", nb, "| indications =", indications.join(", "));
if (nb === 0) fail("aucun champ de saisie a la place des reperes");
if (!indications.includes("5.4")) fail("l'indication de l'edition precedente n'est pas proposee");

/**
 * Fuite d'indication : un crochet contenant un numero de chapitre. Distinct des
 * "[A COMPLETER]" que la trame porte legitimement.
 */
const fuiteIndication = (texte) => /\[\s*(?:ch\.?\s*)?\d[^\]]*\]/.test(texte);

// Une indication est proposee, pas affirmee : tant que rien n'est saisi, elle
// ne doit pas se retrouver dans la trame.
let trame = await page.locator("pre").last().innerText();
if (fuiteIndication(trame)) fail("une indication non verifiee est sortie dans la coversheet");
if (/§\s*5\.4/.test(trame)) fail("l'indication a ete prise pour un chapitre cite");

await champs.nth(0).fill("6.1");
await page.waitForTimeout(400);
trame = await page.locator("pre").last().innerText();
if (!trame.includes("§6.1")) fail("le chapitre saisi n'apparait pas dans la trame");
if (fuiteIndication(trame)) fail("une indication est restee dans la trame");

const restants = await carte(/^4\. Pointer les chapitres/)
  .locator("text=Reperes restants")
  .locator("..")
  .innerText();
console.log("SAISIE :", restants.replace(/\n/g, " "), "| §6.1 dans la trame :", trame.includes("§6.1"));
await page.screenshot({ path: `${OUT}/02b-pointage.png`, fullPage: true });

// Le brouillon doit survivre a un aller-retour vers un autre onglet : pointer
// un chapitre demande de lire le document joint, donc de quitter l'ecran.
await page.getByRole("button", { name: /Parametres/ }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: /2\. Preparer une coversheet/ }).click();
await page.waitForTimeout(500);
const repris = await carte(/^4\. Pointer les chapitres/)
  .locator("input[data-repere]")
  .nth(0)
  .inputValue()
  .catch(() => "");
console.log("BROUILLON : chapitre repris apres changement d'onglet =", repris || "(perdu)");
if (repris !== "6.1") fail("la saisie est perdue au changement d'onglet");

// --- Bibliotheque laissee par une version anterieure -----------------------
//
// Le poste d'un utilisateur garde la bibliotheque du jour ou il a ouvert
// l'outil pour la derniere fois. Une mise en ligne qui change la forme de cette
// donnee doit donc encore savoir la relire : rendue telle quelle, elle a detruit
// les deux onglets qui la lisent, alors que tout etait vert au build.
await page.evaluate(
  (v) => localStorage.setItem("airbus-ia-tool.block-templates", v),
  JSON.stringify({
    templates: [
      { documentType: "SYDMP", requirementIds: ["CS 25.671(a)"], text: "Voir §x.x." },
    ],
  }),
);
await page.reload({ waitUntil: "networkidle" });

for (const onglet of [/Parametres/, /2\. Preparer une coversheet/]) {
  try {
    await page.getByRole("button", { name: onglet }).click({ timeout: 5000 });
    await page.waitForTimeout(500);
    const sections = await page.locator("section").count();
    if (sections === 0) fail(`onglet ${onglet} vide avec une bibliotheque au format anterieur`);
  } catch {
    fail(`onglet ${onglet} inaccessible avec une bibliotheque au format anterieur`);
  }
}
// L'exigence historique doit ressortir convertie, pas ignoree.
await page.getByRole("button", { name: /^SYDMP/ }).click();
const reprises = await carte(/^2\. Exigences/).locator("label span.font-mono").allInnerTexts();
console.log("FORMAT ANTERIEUR : exigences relues =", reprises.join(" | ") || "(aucune)");
if (!reprises.some((e) => e.includes("CS 25.671(a)"))) {
  fail("une bibliotheque au format anterieur ne rend plus ses exigences");
}

console.log("ERREURS :", errors.length ? errors : "aucune");
if (errors.length) process.exitCode = 1;
await browser.close();

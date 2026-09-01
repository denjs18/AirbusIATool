/**
 * Lecture du classeur reellement genere.
 *
 * Le modele telechargeable et le lecteur forment un contrat : intitules des
 * colonnes, nom de la feuille, format des cellules. Ce test les confronte sur
 * le fichier produit, faute de quoi une retouche du modele passerait inapercue
 * jusqu'a ce qu'un utilisateur charge un fichier qui ne donne rien.
 */
import { describe, expect, it } from "vitest";
import readXlsxFile from "read-excel-file/node";
import { DATA_SHEET, parseWorkbookRows, readSheets } from "../lib/workbook";
import { applyTemplates, documentTypesOf, knownRequirementsFor } from "../lib/templates";

const MODEL = "public/modele-blocs-types.xlsx";

// Le lecteur rend toutes les feuilles en une passe : { sheet, data }.
const sheets = await readXlsxFile(MODEL);
const sheetNames = sheets.map((sheet) => sheet.sheet);
const dataRows = sheets.find((sheet) => sheet.sheet === DATA_SHEET)!.data;
const exampleSheet = sheetNames.find((name) => name.toLowerCase().startsWith("exemple"))!;
const exampleRows = sheets.find((sheet) => sheet.sheet === exampleSheet)!.data;

describe("classeur modele", () => {
  it("porte la feuille que l'application vient lire", () => {
    expect(sheetNames).toContain(DATA_SHEET);
  });

  it("porte une notice et une feuille d'exemples", () => {
    expect(sheetNames).toContain("Notice");
    expect(exampleSheet).toBeDefined();
  });

  it("livre la feuille de saisie vide, en-tetes exploitables", () => {
    const { library, issues, rowsRead } = parseWorkbookRows(dataRows);
    expect(rowsRead).toBe(0);
    expect(library.templates).toEqual([]);
    // Aucune plainte : les en-tetes sont reconnus, il n'y a simplement rien a lire.
    expect(issues).toEqual([]);
  });
});

describe("feuille d'exemples du classeur", () => {
  const { library, issues } = parseWorkbookRows(exampleRows);

  it("se lit sans aucune anomalie", () => {
    expect(issues).toEqual([]);
    expect(library.templates.length).toBeGreaterThanOrEqual(3);
  });

  /**
   * La regle de la ligne, verifiee sur le modele lui-meme : une exigence
   * partagee par deux documents de certification occupe deux lignes, avec deux
   * redactions. Les confondre reviendrait a faire dire a la SSA ce que dit le
   * SyDMP.
   */
  it("traite une exigence partagee par deux documents sur deux lignes distinctes", () => {
    const partagee = library.templates.filter((template) =>
      template.requirements.some((requirement) => requirement.id === "CS 25.671(a)"),
    );
    const documents = partagee.map((template) => template.documentType);
    expect(documents).toContain("SYDMP");
    expect(documents).toContain("SSA");

    const sydmpSeule = partagee.find(
      (t) => t.documentType === "SYDMP" && t.requirements.length === 1,
    );
    const ssaSeule = partagee.find((t) => t.documentType === "SSA");
    expect(sydmpSeule?.text).toBeDefined();
    expect(ssaSeule?.text).toBeDefined();
    expect(sydmpSeule?.text).not.toBe(ssaSeule?.text);
  });

  it("montre la meme exigence traitee seule puis accompagnee", () => {
    const sydmp = library.templates.filter((t) => t.documentType === "SYDMP");
    expect(sydmp).toHaveLength(2);

    const seule = sydmp.find((t) => t.requirements.length === 1);
    const accompagnee = sydmp.find((t) => t.requirements.length === 2);
    expect(seule?.requirements.map((r) => r.id)).toEqual(["CS 25.671(a)"]);
    expect(accompagnee?.requirements.map((r) => r.id)).toContain("CS 25.671(a)");
    expect(seule?.text).not.toBe(accompagnee?.text);
  });

  it("conserve les sauts de ligne des redactions", () => {
    const multi = library.templates.find((t) => (t.text ?? "").includes("\n"));
    expect(multi, "au moins une redaction multi-ligne dans les exemples").toBeDefined();
  });

  it("laisse des reperes de paragraphe a pointer partout", () => {
    for (const template of library.templates) {
      expect(template.text).toMatch(/§\s*x/i);
    }
  });
});

describe("choix de la feuille", () => {
  it("lit la feuille de saisie et non celle des exemples", () => {
    // Le modele livre la feuille de saisie vide : rien ne doit etre charge,
    // surtout pas les exemples de la feuille voisine.
    const { library } = readSheets(sheets);
    expect(library.templates).toEqual([]);
  });

  it("retient la feuille de saisie une fois remplie", () => {
    const remplie = sheets.map((sheet) =>
      sheet.sheet === DATA_SHEET ? { ...sheet, data: exampleRows } : sheet,
    );
    const { library } = readSheets(remplie);
    expect(library.templates.length).toBeGreaterThanOrEqual(3);
  });

  it("n'ecarte pas un onglet renomme s'il est le seul exploitable", () => {
    const renomme = [{ sheet: "Ma bibliotheque", data: exampleRows }];
    expect(readSheets(renomme).library.templates.length).toBeGreaterThanOrEqual(3);
  });
});

/**
 * Parcours du module 2, sur le classeur reellement genere.
 *
 * On part de la liste des documents de certification, on ouvre l'un d'eux, on
 * coche des exigences, on valide : le texte restitue doit etre celui de la
 * ligne correspondante, et rien d'autre. C'est tout ce que l'onglet fait, donc
 * tout ce qu'il y a a verifier.
 */
describe("preparation d'une coversheet depuis le classeur", () => {
  const { library } = parseWorkbookRows(exampleRows);

  it("propose les documents de certification declares", () => {
    expect(documentTypesOf(library)).toEqual(["SSA", "SYDMP"]);
  });

  it("n'ouvre que les exigences du document choisi", () => {
    const sydmp = knownRequirementsFor(library, "SYDMP").map((r) => r.id);
    const ssa = knownRequirementsFor(library, "SSA").map((r) => r.id);
    expect(sydmp).toEqual(["CS 25.671(a)", "JAR 25.1301(a)"]);
    expect(ssa).toContain("CS 25.1309(b)");
    // Une exigence propre a la SSA ne doit pas apparaitre sous le SyDMP.
    expect(sydmp).not.toContain("CS 25.1309(b)");
  });

  it("restitue le texte de la combinaison validee, et un autre quand elle change", () => {
    const sydmp = knownRequirementsFor(library, "SYDMP");
    const a = sydmp.find((r) => r.id === "CS 25.671(a)")!;
    const b = sydmp.find((r) => r.id === "JAR 25.1301(a)")!;

    const ensemble = applyTemplates("SYDMP", [a, b], library).blocks;
    const seule = applyTemplates("SYDMP", [a], library).blocks;

    expect(ensemble).toHaveLength(1);
    expect(seule).toHaveLength(1);
    expect(ensemble[0].justification).not.toBe(seule[0].justification);
  });

  it("donne au meme choix d'exigence un autre texte sous un autre document", () => {
    const [a] = knownRequirementsFor(library, "SSA").filter((r) => r.id === "CS 25.671(a)");
    const sousSsa = applyTemplates("SSA", [a], library).blocks[0].justification;
    const sousSydmp = applyTemplates("SYDMP", [a], library).blocks[0].justification;
    expect(sousSsa).toBeDefined();
    expect(sousSsa).not.toBe(sousSydmp);
  });

  it("signale une combinaison qu'aucune ligne ne declare, plutot que d'en inventer une", () => {
    const ssa = knownRequirementsFor(library, "SSA");
    const isolee = ssa.find((r) => r.id === "CS 25.1309(b)")!;
    const { blocks, uncovered } = applyTemplates("SSA", [isolee], library);
    expect(uncovered.map((r) => r.id)).toEqual(["CS 25.1309(b)"]);
    expect(blocks[0].justification).toBeUndefined();
  });
});

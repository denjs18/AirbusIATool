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

  it("montre la meme exigence traitee seule puis accompagnee", () => {
    const sydmp = library.templates.filter((t) => t.documentType === "SYDMP");
    expect(sydmp).toHaveLength(2);

    const seule = sydmp.find((t) => t.requirementIds.length === 1);
    const accompagnee = sydmp.find((t) => t.requirementIds.length === 2);
    expect(seule?.requirementIds).toEqual(["CS 25.671(a)"]);
    expect(accompagnee?.requirementIds).toContain("CS 25.671(a)");
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

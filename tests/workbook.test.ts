import { describe, expect, it } from "vitest";
import { parseWorkbookRows } from "../lib/workbook";

const HEADERS = [
  "Famille de coversheet",
  "Exigences",
  "Moyens de conformite",
  "Redaction",
  "Coversheet source",
];

const row = (
  famille: string,
  exigences: string,
  moc = "",
  redaction = "",
  source = "",
) => [famille, exigences, moc, redaction, source];

describe("parseWorkbookRows", () => {
  it("lit une ligne complete", () => {
    const { library, issues, rowsRead } = parseWorkbookRows([
      HEADERS,
      row("SYDMP", "CS 25.0671(a) amdt. 23 ; JAR 25.1301(a) ch. 11", "0", "Voir §x.x.", "CVS-1"),
    ]);

    expect(issues).toEqual([]);
    expect(rowsRead).toBe(1);
    expect(library.templates).toHaveLength(1);
    expect(library.templates[0]).toMatchObject({
      documentType: "SYDMP",
      requirements: [
        expect.objectContaining({ id: "CS 25.671(a)" }),
        expect.objectContaining({ id: "JAR 25.1301(a)" }),
      ],
      text: "Voir §x.x.",
      mocIds: ["0"],
      source: "CVS-1",
    });
  });

  it("accepte les separateurs usuels entre exigences", () => {
    for (const cell of [
      "CS 25.671(a) ; JAR 25.1301(a)",
      "CS 25.671(a), JAR 25.1301(a)",
      "CS 25.671(a)\nJAR 25.1301(a)",
    ]) {
      const { library } = parseWorkbookRows([HEADERS, row("SSA", cell, "", "texte")]);
      expect(library.templates[0].requirements.map((r) => r.id)).toEqual([
        "CS 25.671(a)",
        "JAR 25.1301(a)",
      ]);
    }
  });

  it("ne depend pas de l'ordre des colonnes", () => {
    const { library } = parseWorkbookRows([
      ["Redaction", "Exigences", "Famille"],
      ["Voir §x.x.", "CS 25.672", "SSA"],
    ]);
    expect(library.templates[0]).toMatchObject({
      documentType: "SSA",
      requirements: [expect.objectContaining({ id: "CS 25.672" })],
      text: "Voir §x.x.",
    });
  });

  it("tolere les accents et la casse des en-tetes", () => {
    const { library } = parseWorkbookRows([
      ["FAMILLE DE COVERSHEET", "Exigences", "Rédaction"],
      ["vvs", "CS 25.143", "Voir §x.x."],
    ]);
    expect(library.templates).toHaveLength(1);
  });

  it("saute les lignes vides sans les compter", () => {
    const { rowsRead, issues } = parseWorkbookRows([
      HEADERS,
      row("SSA", "CS 25.672", "", "texte"),
      ["", "", "", "", ""],
      [],
    ]);
    expect(rowsRead).toBe(1);
    expect(issues).toEqual([]);
  });

  it("signale un document de certification absent avec son numero de ligne", () => {
    const { issues, library } = parseWorkbookRows([
      HEADERS,
      row("", "CS 25.672", "", "texte"),
    ]);
    expect(library.templates).toHaveLength(0);
    expect(issues[0].row).toBe(2);
    expect(issues[0].message).toContain("Document de certification");
  });

  it("signale une exigence non reconnue plutot que de l'ignorer", () => {
    const { issues, library } = parseWorkbookRows([
      HEADERS,
      row("SSA", "voir le chapitre securite", "", "texte"),
    ]);
    expect(library.templates).toHaveLength(0);
    expect(issues[0].message).toContain("Aucune exigence reconnue");
    expect(issues[0].message).toContain("voir le chapitre securite");
  });

  it("retient le regroupement mais signale une redaction vide", () => {
    const { issues, library } = parseWorkbookRows([
      HEADERS,
      row("SSA", "CS 25.672", "3", ""),
    ]);
    expect(library.templates).toHaveLength(1);
    expect(library.templates[0].text).toBeUndefined();
    expect(issues[0].message).toContain("Redaction vide");
  });

  it("signale un doublon de combinaison au lieu de l'ecraser en silence", () => {
    const { issues, library } = parseWorkbookRows([
      HEADERS,
      row("SSA", "CS 25.672", "", "premier"),
      row("ssa", "CS 25.672", "", "second"),
    ]);
    expect(library.templates).toHaveLength(1);
    expect(library.templates[0].text).toBe("second");
    expect(issues[0].message).toContain("ligne 2");
  });

  it("distingue une exigence seule de la meme accompagnee", () => {
    const { library } = parseWorkbookRows([
      HEADERS,
      row("SYDMP", "CS 25.671(a)", "", "seule"),
      row("SYDMP", "CS 25.671(a) ; JAR 25.1301(a)", "", "accompagnee"),
    ]);
    expect(library.templates).toHaveLength(2);
  });

  it("lit les moyens de conformite sous leurs differentes formes", () => {
    const moc = (cell: string) =>
      parseWorkbookRows([HEADERS, row("SSA", "CS 25.672", cell, "t")]).library.templates[0].mocIds;
    expect(moc("0")).toEqual(["0"]);
    expect(moc("4, 6")).toEqual(["4", "6"]);
    expect(moc("MoC 3")).toEqual(["3"]);
    expect(moc("S")).toEqual(["S"]);
    expect(moc("")).toBeUndefined();
  });

  it("preserve les sauts de ligne de la redaction", () => {
    const texte = "Premiere ligne §x.x.\n\nSeconde ligne §x.x.";
    const { library } = parseWorkbookRows([HEADERS, row("SSA", "CS 25.672", "", texte)]);
    expect(library.templates[0].text).toBe(texte);
  });

  it("refuse un classeur sans en-tetes exploitables", () => {
    const { library, issues } = parseWorkbookRows([
      ["Colonne A", "Colonne B"],
      ["x", "y"],
    ]);
    expect(library.templates).toEqual([]);
    expect(issues[0].message).toContain("En-tetes introuvables");
  });
});

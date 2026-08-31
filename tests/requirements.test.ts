import { describe, expect, it } from "vitest";
import {
  dedupeRequirements,
  extractMocIds,
  extractOccurrencesFromPage,
  formatRequirementId,
  groupByParagraph,
  normalizeExtractedText,
  normalizeParagraph,
  sortRequirements,
} from "../lib/requirements";

describe("normalizeExtractedText", () => {
  it("recolle les coupures de ligne et reduit les espaces", () => {
    expect(normalizeExtractedText("CS\n  25.671   general")).toBe("CS 25.671 general");
  });

  it("remplace les espaces insecables et les tirets typographiques", () => {
    expect(normalizeExtractedText("AMC 25–11")).toBe("AMC 25-11");
  });
});

describe("extractOccurrencesFromPage", () => {
  it("detecte les paragraphes CS-25 avec et sans sous-alinea", () => {
    const ids = extractOccurrencesFromPage(
      "Applicable: CS 25.671, CS 25.1309(b)(1) and CS-25.143.",
      4,
    ).map((occurrence) => occurrence.id);

    expect(ids).toEqual(["CS 25.671", "CS 25.1309(b)(1)", "CS 25.143"]);
  });

  it("recolle une reference coupee par l'extraction PDF", () => {
    const occurrences = extractOccurrencesFromPage("compliance with CS 25 . 671 is shown", 1);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].id).toBe("CS 25.671");
  });

  it("detecte AMC, SC, CRI et ESF", () => {
    const ids = extractOccurrencesFromPage(
      "See AMC 25.1309, AMC 25-11, SC F-12, CRI B-14 and ESF F-03.",
      2,
    ).map((occurrence) => occurrence.id);

    expect(ids).toEqual([
      "AMC 25.1309",
      "AMC 25-11",
      "SC F-12",
      "CRI B-14",
      "ESF F-03",
    ]);
  });

  it("ne compte qu'une occurrence pour 'Special Condition F-12'", () => {
    const occurrences = extractOccurrencesFromPage("Special Condition F-12 applies.", 1);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].kind).toBe("SC");
  });

  it("conserve la page et l'amendement cite a proximite", () => {
    const [occurrence] = extractOccurrencesFromPage("CS 25.671 at Amdt 27 applies", 12);
    expect(occurrence.page).toBe(12);
    expect(occurrence.qualifier).toBe("Amdt 27");
  });

  it("remonte les MoC du contexte de la citation", () => {
    const [occurrence] = extractOccurrencesFromPage(
      "- CS 25.671 General, control systems. MoC: 1, 2, 3 and 6.",
      3,
    );
    expect(occurrence.mocIds).toEqual(["1", "2", "3", "6"]);
  });

  it("ignore un texte sans reference", () => {
    expect(extractOccurrencesFromPage("This page contains no requirement.", 1)).toEqual([]);
  });
});

describe("extractMocIds", () => {
  it("accepte les formes directes et les listes", () => {
    expect(extractMocIds("MC1 / MoC 3")).toEqual(["1", "3"]);
    expect(extractMocIds("Means of compliance: 4/6")).toEqual(["4", "6"]);
    expect(extractMocIds("MoC : 2, 3 et 5")).toEqual(["2", "3", "5"]);
  });

  it("ne renvoie rien en l'absence de code", () => {
    expect(extractMocIds("design review performed")).toEqual([]);
  });
});

describe("dedupeRequirements", () => {
  it("fusionne les occurrences et conserve l'amendement rencontre", () => {
    const occurrences = [
      ...extractOccurrencesFromPage("CS 25.671 applies", 1),
      ...extractOccurrencesFromPage("CS 25.671 at Amdt 27 applies", 8),
    ];
    const requirements = dedupeRequirements(occurrences);

    expect(requirements).toHaveLength(1);
    expect(requirements[0].qualifier).toBe("Amdt 27");
  });
});

describe("groupByParagraph", () => {
  it("regroupe les sous-alineas sous leur paragraphe", () => {
    const occurrences = extractOccurrencesFromPage(
      "CS 25.1309(b) and CS 25.1309(c) apply, as does CS 25.671.",
      1,
    );
    const groups = groupByParagraph(occurrences);

    expect([...groups.keys()].sort()).toEqual(["CS 25.1309", "CS 25.671"]);
    expect(groups.get("CS 25.1309")).toHaveLength(2);
  });
});

describe("formatRequirementId", () => {
  it("normalise les identifiants", () => {
    expect(formatRequirementId("CS", "25.671", "(c)")).toBe("CS 25.671(c)");
    expect(formatRequirementId("SC", "f-12")).toBe("SC F-12");
  });
});

describe("sortRequirements", () => {
  it("ordonne par nature puis par numero croissant", () => {
    const ids = sortRequirements(
      dedupeRequirements(
        extractOccurrencesFromPage("CS 25.1309, CRI F-01, CS 25.143, AMC 25.1309", 1),
      ),
    ).map((requirement) => requirement.id);

    expect(ids).toEqual(["CS 25.143", "CS 25.1309", "AMC 25.1309", "CRI F-01"]);
  });
});

/**
 * Formats reellement rencontres dans les coversheets de programme.
 *
 * Ces cas viennent de coversheets existantes : ce sont eux qui font foi, et
 * chacun d'eux echouait avant l'alignement du parser. Seules des references
 * reglementaires publiques figurent ici, aucun contenu de programme.
 */
describe("formats reels des coversheets", () => {
  const idsOf = (line: string) =>
    extractOccurrencesFromPage(line, 1).map((occurrence) => occurrence.id);

  it("reconnait les paragraphes JAR au meme titre que les CS", () => {
    expect(idsOf("JAR 25.0671(c) CH 11")).toEqual(["JAR 25.671(c)"]);
    expect(idsOf("JAR 25.1309(b)(c)(d) CH 11")).toEqual(["JAR 25.1309(b)(c)(d)"]);
  });

  it("accepte l'espace entre le paragraphe et le sous-alinea", () => {
    expect(idsOf("CS 25.671 (a) amdt 23")).toEqual(["CS 25.671(a)"]);
    expect(idsOf("JAR 25.1301 (a) ch 11, JAR 25.1309 (a) ch 11")).toEqual([
      "JAR 25.1301(a)",
      "JAR 25.1309(a)",
    ]);
  });

  it("identifie 25.0671 et 25.671 comme un seul et meme paragraphe", () => {
    expect(idsOf("CS 25.0671(a) amdt. 23")).toEqual(["CS 25.671(a)"]);
    expect(idsOf("CS25.0672(a) amdt. 23")).toEqual(["CS 25.672(a)"]);
    expect(normalizeParagraph("25.0671")).toBe(normalizeParagraph("25.671"));
  });

  it("lit une ligne melangeant CS et JAR", () => {
    expect(idsOf("CS 25.0671(a) amdt. 23, JAR 25.1301(a) ch. 11")).toEqual([
      "CS 25.671(a)",
      "JAR 25.1301(a)",
    ]);
  });

  it("distingue l'amendement d'un CS du chapitre d'un JAR", () => {
    const [cs, jar] = extractOccurrencesFromPage(
      "CS 25.0672(a)(c) Amdt 23 and JAR 25.0672(b) CH 11",
      1,
    );
    expect(cs.qualifier).toBe("Amdt 23");
    expect(jar.qualifier).toBe("ch. 11");
  });

  it("reconnait les CRI quelle que soit leur ponctuation", () => {
    expect(idsOf("compliance with CRI-SE 20 issue 2 and CRI SE 25 issue 3")).toEqual([
      "CRI SE-20",
      "CRI SE-25",
    ]);
    expect(idsOf("The Compliance of CRI F-34 has been demonstrated")).toEqual(["CRI F-34"]);
  });

  it("retient les appendices cites, qui distinguent deux justifications", () => {
    const [occurrence] = extractOccurrencesFromPage(
      "as interpreted by CRI F-28 Appendix 1 & 3",
      1,
    );
    expect(occurrence.id).toBe("CRI F-28");
    expect(occurrence.appendices).toEqual(["1", "3"]);
  });
});

describe("moyens de conformite des coversheets reelles", () => {
  it("lit une liste sans separateur explicite", () => {
    expect(extractMocIds("representing MoC 4,6")).toEqual(["4", "6"]);
  });

  it("lit la forme en toutes lettres", () => {
    expect(extractMocIds("provided as Mean of Compliance n°1 for compliance")).toEqual(["1"]);
  });

  it("accepte un MoC designe par une lettre", () => {
    expect(extractMocIds("VVS MoC S")).toEqual(["S"]);
  });

  it("s'arrete au premier jeton qui n'est pas un identifiant", () => {
    expect(extractMocIds("representing MoC 2, that participates to demonstrate")).toEqual(["2"]);
  });

  it("ne confond pas un MoC avec le texte qui le suit", () => {
    expect(extractMocIds("MoC 9, that participate to demonstrate compliance")).toEqual(["9"]);
  });
});

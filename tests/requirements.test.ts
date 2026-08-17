import { describe, expect, it } from "vitest";
import {
  dedupeRequirements,
  extractMocCodes,
  extractOccurrencesFromPage,
  formatRequirementId,
  groupByParagraph,
  normalizeExtractedText,
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
    expect(occurrence.amendment).toBe("Amdt 27");
  });

  it("remonte les MoC du contexte de la citation", () => {
    const [occurrence] = extractOccurrencesFromPage(
      "- CS 25.671 General, control systems. MoC: 1, 2, 3 and 6.",
      3,
    );
    expect(occurrence.mocCodes).toEqual(["MC1", "MC2", "MC3", "MC6"]);
  });

  it("ignore un texte sans reference", () => {
    expect(extractOccurrencesFromPage("This page contains no requirement.", 1)).toEqual([]);
  });
});

describe("extractMocCodes", () => {
  it("accepte les formes directes et les listes", () => {
    expect(extractMocCodes("MC1 / MoC 3")).toEqual(["MC1", "MC3"]);
    expect(extractMocCodes("Means of compliance: 4/6")).toEqual(["MC4", "MC6"]);
    expect(extractMocCodes("MoC : 2, 3 et 5")).toEqual(["MC2", "MC3", "MC5"]);
  });

  it("ne renvoie rien en l'absence de code", () => {
    expect(extractMocCodes("design review performed")).toEqual([]);
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
    expect(requirements[0].amendment).toBe("Amdt 27");
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

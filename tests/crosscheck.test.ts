import { describe, expect, it } from "vitest";
import { crossCheck, renderCrossCheckCsv } from "../lib/crosscheck";
import { parsePlan } from "../lib/parse-acp";
import { isRegistryFile, registryToCoverage } from "../lib/registry";
import type { PdfDocumentText } from "../lib/types";

const PLAN: PdfDocumentText = {
  sourceName: "ACP-fictif.pdf",
  pageCount: 1,
  pages: [
    {
      page: 1,
      text: [
        "Document reference: ACP-27-CER-0114",
        "Programme: A32N-DEMO",
        "ATA chapter: 27",
        "2.1 Primary requirements",
        "- CS 25.671 amdt 27 General. MoC: 1, 2, 3 and 6.",
        "- CS 25.675 Stops. MoC: 1, 4.",
        "- CS 25.703 Takeoff warning system. MoC: 1, 5, 6.",
      ].join("\n"),
    },
  ],
};

const plan = parsePlan(PLAN);

const registry = {
  programme: "A32N-DEMO",
  ataChapter: "27",
  coversheets: [
    // MoC incomplets par rapport au plan (MC3 et MC6 manquants).
    { documentRef: "CVS-27-FCS-0001", requirement: "CS 25.671", qualifier: "Amdt 26", moc: ["1", "2"] },
    { documentRef: "CVS-27-FCS-0003", requirement: "CS 25.675", moc: ["1", "4"] },
    // Doublon sur CS 25.675.
    { documentRef: "CVS-27-FCS-0022", requirement: "CS 25.675", moc: ["1", "4"] },
    // Exigence absente du plan.
    { documentRef: "CVS-27-FCS-0021", requirement: "CS 25.1329", moc: ["1", "6"] },
  ],
};

describe("registryToCoverage", () => {
  it("valide la forme du registre", () => {
    expect(isRegistryFile(registry)).toBe(true);
    expect(isRegistryFile({ coversheets: [{ documentRef: 1 }] })).toBe(false);
    expect(isRegistryFile(null)).toBe(false);
  });

  it("normalise les identifiants d'exigence comme le plan", () => {
    const coversheets = registryToCoverage(registry);
    expect(coversheets[0].requirement.id).toBe("CS 25.671");
    expect(coversheets[0].requirement.qualifier).toBe("Amdt 26");
  });

  it("ecarte les codes MoC inconnus", () => {
    const [coversheet] = registryToCoverage({
      coversheets: [{ documentRef: "CVS-1", requirement: "CS 25.671", moc: ["1", "MC42"] }],
    });
    expect(coversheet.mocIds).toEqual(["1"]);
  });
});

describe("crossCheck", () => {
  const report = crossCheck({ plan, coversheets: registryToCoverage(registry) });

  it("detecte une exigence du plan sans coversheet", () => {
    expect(report.uncovered).toEqual(["CS 25.703"]);
    const result = report.results.find((r) => r.id === "crosscheck.uncovered.CS 25.703");
    expect(result?.status).toBe("error");
    expect(result?.detail).toContain("ACP-fictif.pdf");
  });

  it("detecte une coversheet hors perimetre du plan", () => {
    expect(report.orphans).toEqual(["CS 25.1329"]);
    expect(report.results.find((r) => r.id === "crosscheck.orphan.CS 25.1329")?.status).toBe(
      "warning",
    );
  });

  it("detecte un doublon de couverture", () => {
    expect(report.duplicated).toEqual(["CS 25.675"]);
  });

  it("detecte des MoC manquants dans la coversheet", () => {
    const moc = report.results.find((r) => r.id.startsWith("crosscheck.moc.CS 25.671"));
    expect(moc?.status).toBe("error");
    expect(moc?.detail).toContain("3");
    expect(moc?.detail).toContain("6");
  });

  it("detecte un amendement divergent", () => {
    const amendment = report.results.find((r) => r.id === "crosscheck.amendment.CS 25.671");
    expect(amendment?.status).toBe("warning");
    expect(amendment?.detail).toContain("Amdt 27");
    expect(amendment?.detail).toContain("Amdt 26");
  });

  it("calcule le taux de couverture", () => {
    expect(report.coverageRatio).toBeCloseTo(2 / 3, 5);
  });

  it("conclut positivement quand les perimetres sont alignes", () => {
    const aligned = crossCheck({
      plan,
      coversheets: registryToCoverage({
        coversheets: [
          { documentRef: "A", requirement: "CS 25.671", qualifier: "Amdt 27", moc: ["1", "2", "3", "6"] },
          { documentRef: "B", requirement: "CS 25.675", moc: ["1", "4"] },
          { documentRef: "C", requirement: "CS 25.703", moc: ["1", "5", "6"] },
        ],
      }),
    });

    expect(aligned.results).toHaveLength(1);
    expect(aligned.results[0].status).toBe("ok");
    expect(aligned.coverageRatio).toBe(1);
  });
});

describe("renderCrossCheckCsv", () => {
  it("produit un CSV echappe exploitable en revue", () => {
    const csv = renderCrossCheckCsv(crossCheck({ plan, coversheets: registryToCoverage(registry) }));
    expect(csv.split("\n")[0]).toBe("Statut;Controle;Detail;Action proposee");
    expect(csv).toContain('"error"');
  });
});

describe("crossCheck - couverture au niveau du paragraphe", () => {
  const PLAN_SUB: PdfDocumentText = {
    sourceName: "ACP-sous-alinea.pdf",
    pageCount: 1,
    pages: [
      {
        page: 1,
        text: [
          "Document reference: ACP-27-CER-0114",
          "2.1 Primary requirements",
          "- CS 25.671 General. MoC: 1, 2.",
          "- CS 25.671(c)(1) specific failure conditions. MoC: 3.",
        ].join("\n"),
      },
    ],
  };

  const planSub = parsePlan(PLAN_SUB);
  const sheets = registryToCoverage({
    coversheets: [{ documentRef: "CVS-27-FCS-0001", requirement: "CS 25.671", moc: ["1", "2"] }],
  });

  it("compte le sous-alinea comme non couvert par defaut", () => {
    const report = crossCheck({ plan: planSub, coversheets: sheets });
    expect(report.uncovered).toEqual(["CS 25.671(c)(1)"]);
  });

  it("admet la couverture par le paragraphe quand l'option est active", () => {
    const report = crossCheck({ plan: planSub, coversheets: sheets, paragraphLevelCoverage: true });
    expect(report.uncovered).toEqual([]);
    expect(report.coverageRatio).toBe(1);
  });

  it("signale explicitement la couverture heritee", () => {
    const report = crossCheck({ plan: planSub, coversheets: sheets, paragraphLevelCoverage: true });
    const inherited = report.results.find(
      (r) => r.id === "crosscheck.paragraphLevel.CS 25.671(c)(1)",
    );
    expect(inherited?.status).toBe("info");
    expect(inherited?.detail).toContain("CVS-27-FCS-0001");
    expect(inherited?.suggestion).toContain("granularite");
  });

  it("ne rejoue pas les controles de MoC sur le sous-alinea couvert par heritage", () => {
    const report = crossCheck({ plan: planSub, coversheets: sheets, paragraphLevelCoverage: true });
    expect(report.results.some((r) => r.id.includes("moc.CS 25.671(c)(1)"))).toBe(false);
  });

  it("n'ecarte du hors-plan que les coversheets dont un sous-alinea est au plan", () => {
    const withOrphan = registryToCoverage({
      coversheets: [
        { documentRef: "CVS-A", requirement: "CS 25.671", moc: ["1", "2"] },
        { documentRef: "CVS-B", requirement: "CS 25.1329", moc: ["1"] },
      ],
    });
    const report = crossCheck({
      plan: planSub,
      coversheets: withOrphan,
      paragraphLevelCoverage: true,
    });
    expect(report.orphans).toEqual(["CS 25.1329"]);
  });
});

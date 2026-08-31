import { describe, expect, it } from "vitest";
import {
  buildCoversheet,
  buildCoversheetsFromPlan,
  coversheetRef,
  renderCoversheetIndex,
  renderCoversheetMarkdown,
  TO_BE_WRITTEN,
} from "../lib/coversheet";
import { parsePlan } from "../lib/parse-acp";
import type { PdfDocumentText } from "../lib/types";

const PLAN: PdfDocumentText = {
  sourceName: "ACP-fictif.pdf",
  pageCount: 2,
  pages: [
    {
      page: 1,
      text: [
        "Document reference: ACP-27-CER-0114",
        "Title: Certification plan",
        "Issue: 3",
        "Date: 12/03/2026",
        "ATA chapter: 27",
        "Programme: A32N-DEMO",
      ].join("\n"),
    },
    {
      page: 2,
      text: [
        "2.1 Primary requirements",
        "- CS 25.671 amdt 27 General, control systems. MoC: 1, 2, 3 and 6.",
        "- CS 25.675 Stops. MoC: 1, 4.",
        "- CS 25.703 Takeoff warning system.",
      ].join("\n"),
    },
  ],
};

const OPTIONS = { issueDate: "2026-08-17", author: "D. Testeur" };

describe("coversheetRef", () => {
  it("numerote sur quatre chiffres", () => {
    expect(coversheetRef("CVS-27-FCS", 3)).toBe("CVS-27-FCS-0003");
  });
});

describe("buildCoversheet", () => {
  const plan = parsePlan(PLAN);

  it("reprend les MoC annonces dans le plan", () => {
    const requirement = plan.requirements.find((r) => r.id === "CS 25.671")!;
    const coversheet = buildCoversheet(
      requirement,
      plan.occurrences.filter((o) => o.id === requirement.id),
      plan.header,
      OPTIONS,
    );
    expect(coversheet.mocIds).toEqual(["1", "2", "3", "6"]);
    expect(coversheet.header.moc).toBe("MoC 1, MoC 2, MoC 3, MoC 6");
  });

  it("propose des MoC par defaut quand le plan n'en cite pas", () => {
    const requirement = plan.requirements.find((r) => r.id === "CS 25.703")!;
    const coversheet = buildCoversheet(requirement, [], plan.header, OPTIONS);
    expect(coversheet.mocIds.length).toBeGreaterThan(0);
  });

  it("herite du programme et de l'ATA du plan", () => {
    const coversheet = buildCoversheet(plan.requirements[0], [], plan.header, OPTIONS);
    expect(coversheet.header.programme).toBe("A32N-DEMO");
    expect(coversheet.header.ataChapter).toBe("27");
  });

  it("reporte l'amendement dans la reference d'exigence", () => {
    const requirement = plan.requirements.find((r) => r.id === "CS 25.671")!;
    const coversheet = buildCoversheet(requirement, [], plan.header, OPTIONS);
    expect(coversheet.header.requirementRef).toBe("CS 25.671 (Amdt 27)");
  });

  it("laisse vides les champs qui relevent du jugement d'ingenierie", () => {
    const coversheet = buildCoversheet(plan.requirements[0], [], plan.header, OPTIONS);
    expect(coversheet.complianceStatement).toBeUndefined();
    expect(coversheet.citations).toEqual([]);
    expect(coversheet.header.checker).toBe(TO_BE_WRITTEN);
    expect(coversheet.header.approver).toBe(TO_BE_WRITTEN);
  });

  it("est deterministe a options egales", () => {
    const build = () => buildCoversheet(plan.requirements[0], [], plan.header, OPTIONS, 2);
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });
});

describe("buildCoversheetsFromPlan", () => {
  it("genere une trame par exigence, numerotee en sequence", () => {
    const plan = parsePlan(PLAN);
    const coversheets = buildCoversheetsFromPlan(plan, OPTIONS);

    expect(coversheets).toHaveLength(plan.requirements.length);
    expect(coversheets[0].header.documentRef).toBe("CVS-27-FCS-0001");
    expect(coversheets[1].header.documentRef).toBe("CVS-27-FCS-0002");
  });
});

describe("renderCoversheetMarkdown", () => {
  const plan = parsePlan(PLAN);
  const requirement = plan.requirements.find((r) => r.id === "CS 25.671")!;
  const markdown = renderCoversheetMarkdown(
    buildCoversheet(
      requirement,
      plan.occurrences.filter((o) => o.id === requirement.id),
      plan.header,
      OPTIONS,
    ),
    plan.sourceName,
  );

  it("produit les sept sections de la trame", () => {
    for (const heading of [
      "## 1. Objet",
      "## 2. Exigence applicable",
      "## 3. Moyens de conformite retenus",
      "## 4. Documents de substantiation",
      "## 5. Enonce de conformite",
      "## 6. Hypotheses et limitations",
      "## 7. Tracabilite de la generation",
    ]) {
      expect(markdown).toContain(heading);
    }
  });

  it("liste les documents de substantiation attendus pour les MoC retenus", () => {
    expect(markdown).toContain("Note de conception");
    expect(markdown).toContain("FHA");
  });

  it("balise explicitement les champs a rediger", () => {
    expect(markdown).toContain(TO_BE_WRITTEN);
    expect(markdown).toContain("Aucun contenu technique n'a ete produit par l'outil.");
  });

  it("trace le plan source", () => {
    expect(markdown).toContain("ACP-fictif.pdf");
  });
});

describe("renderCoversheetIndex", () => {
  it("produit un sommaire tabulaire du lot", () => {
    const index = renderCoversheetIndex(buildCoversheetsFromPlan(parsePlan(PLAN), OPTIONS));
    expect(index).toContain("| Reference | Exigence | MoC |");
    expect(index).toContain("CS 25.671");
  });
});

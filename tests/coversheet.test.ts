import { describe, expect, it } from "vitest";
import {
  buildCoversheet,
  formatGroupHeading,
  formatRequirementCitation,
  renderCoversheetMarkdown,
  TO_BE_COMPLETED,
} from "../lib/coversheet";
import { applyTemplates, EMPTY_LIBRARY, mergeTemplates } from "../lib/templates";
import { dedupeRequirements, extractOccurrencesFromPage } from "../lib/requirements";

const SELECTION = dedupeRequirements(
  extractOccurrencesFromPage(
    "CS 25.0671(a) amdt. 23, JAR 25.1301(a) ch. 11, JAR 25.1309(b)(c)(d) CH 11",
    1,
  ),
);

const OPTIONS = {
  documentType: "SSA",
  enclosed: [
    { ref: "DOC-SAF-0142", issue: "4", title: "Flight control system safety assessment" },
  ],
  mocIds: ["3"],
  programme: "PROG-DEMO",
  ataChapter: "27",
  ref: "CVS-SSA-001",
  issue: "1",
  date: "2026-08-31",
};

const groupsOf = (templates: Parameters<typeof mergeTemplates>[1] = []) =>
  applyTemplates("SSA", SELECTION, mergeTemplates(EMPTY_LIBRARY, templates)).blocks;

describe("formatRequirementCitation", () => {
  it("restitue l'exigence telle qu'elle se cite, avec son qualifieur", () => {
    const [cs, jar] = SELECTION;
    expect(formatRequirementCitation(cs)).toBe("CS 25.671(a) Amdt 23");
    expect(formatRequirementCitation(jar)).toBe("JAR 25.1301(a) ch. 11");
  });

  it("reporte les appendices d'un CRI", () => {
    const [cri] = dedupeRequirements(
      extractOccurrencesFromPage("as interpreted by CRI F-28 Appendix 1 & 3", 1),
    );
    expect(formatRequirementCitation(cri)).toBe("CRI F-28 Appendix 1 & 3");
  });
});

describe("formatGroupHeading", () => {
  it("cite toutes les exigences d'un bloc sur une ligne", () => {
    const groups = groupsOf([
      { documentType: "SSA", requirementIds: ["CS 25.671(a)", "JAR 25.1301(a)"] },
    ]);
    expect(formatGroupHeading(groups[0])).toBe("CS 25.671(a) Amdt 23, JAR 25.1301(a) ch. 11");
  });
});

describe("buildCoversheet", () => {
  it("produit une coversheet pour un document, pas pour une exigence", () => {
    const coversheet = buildCoversheet(groupsOf(), OPTIONS);
    expect(coversheet.documentType).toBe("SSA");
    expect(coversheet.enclosed[0].ref).toBe("DOC-SAF-0142");
    expect(coversheet.groups).toHaveLength(SELECTION.length);
  });

  it("rassemble les exigences groupees dans un meme bloc", () => {
    const coversheet = buildCoversheet(
      groupsOf([{ documentType: "SSA", requirementIds: ["CS 25.671(a)", "JAR 25.1301(a)"] }]),
      OPTIONS,
    );
    expect(coversheet.groups).toHaveLength(2);
    expect(coversheet.groups[0].requirements).toHaveLength(2);
  });

  it("attribue les MoC du document aux blocs qui n'en portent pas", () => {
    const coversheet = buildCoversheet(groupsOf(), OPTIONS);
    expect(coversheet.groups.every((group) => group.mocIds.join() === "3")).toBe(true);
  });

  it("conserve les MoC propres a un bloc quand ils sont precises", () => {
    const groups = groupsOf();
    groups[0].mocIds = ["4", "6"];
    const coversheet = buildCoversheet(groups, OPTIONS);
    expect(coversheet.groups[0].mocIds).toEqual(["4", "6"]);
  });

  it("ne remplit aucune justification", () => {
    const coversheet = buildCoversheet(groupsOf(), OPTIONS);
    expect(coversheet.groups.every((group) => group.justification === undefined)).toBe(true);
  });

  it("est deterministe a entrees egales", () => {
    const build = () => JSON.stringify(buildCoversheet(groupsOf(), OPTIONS));
    expect(build()).toBe(build());
  });
});

describe("renderCoversheetMarkdown", () => {
  const markdown = renderCoversheetMarkdown(
    buildCoversheet(
      groupsOf([{ documentType: "SSA", requirementIds: ["CS 25.671(a)", "JAR 25.1301(a)"] }]),
      OPTIONS,
    ),
  );

  it("reprend la structure d'une coversheet reelle", () => {
    expect(markdown).toContain("# Compliance coversheet - SSA");
    expect(markdown).toContain("## Enclosed document(s)");
    expect(markdown).toContain("## Compliance Statement");
    expect(markdown).toContain("Mean of Compliance n°3");
  });

  it("cite le document joint avec sa reference et son issue", () => {
    expect(markdown).toContain("DOC-SAF-0142");
    expect(markdown).toContain("Flight control system safety assessment");
  });

  it("produit un bloc par groupe, exigences groupees sur une meme ligne", () => {
    expect(markdown).toContain("### 1. CS 25.671(a) Amdt 23, JAR 25.1301(a) ch. 11");
    expect(markdown).toContain("### 2. JAR 25.1309(b)(c)(d) ch. 11");
  });

  it("laisse chaque justification a completer", () => {
    const blocs = markdown.split("### ").length - 1;
    const aCompleter = markdown.split(TO_BE_COMPLETED).length - 1;
    expect(blocs).toBe(2);
    expect(aCompleter).toBeGreaterThanOrEqual(blocs);
  });

  it("recapitule ce qui reste a completer", () => {
    expect(markdown).toContain("## Reste a completer");
    expect(markdown).toContain("2 justifications");
  });

  it("dit explicitement que les paragraphes cites ne sont pas deduits", () => {
    expect(markdown).toContain("ne sont pas deduits");
  });
});

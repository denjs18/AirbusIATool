import { describe, expect, it } from "vitest";
import {
  applyTemplates,
  countPlaceholders,
  documentTypesOf,
  EMPTY_LIBRARY,
  forgetTemplate,
  isTemplateLibrary,
  knownRequirementsFor,
  learnFromBlocks,
  mergeTemplates,
  templatesFor,
  type BlockTemplate,
} from "../lib/templates";
import { dedupeRequirements, extractOccurrencesFromPage } from "../lib/requirements";

const requirementsOf = (line: string) =>
  dedupeRequirements(extractOccurrencesFromPage(line, 1));

const A_B_C = requirementsOf(
  "CS 25.0671(a) amdt. 23, JAR 25.1301(a) ch. 11, JAR 25.1309(c) ch. 11",
);
const [A, B] = A_B_C;

/** Texte type d'un bloc a deux exigences, avec ses reperes de paragraphe. */
const TEXT_AB = `The enclosed document describes in §x.x the design intentions for the
modifications, and identifies in §x.x the configuration retained.`;

/** Redaction differente quand la meme exigence est traitee seule. */
const TEXT_A = "The enclosed document covers this requirement alone in §x.x.";

const TPL_AB: BlockTemplate = {
  documentType: "SYDMP",
  requirementIds: [A.id, B.id],
  text: TEXT_AB,
  source: "CVS-SyDMP issue 1",
};
const TPL_A: BlockTemplate = {
  documentType: "SYDMP",
  requirementIds: [A.id],
  text: TEXT_A,
};

const library = mergeTemplates(EMPTY_LIBRARY, [TPL_AB, TPL_A]);

describe("applyTemplates", () => {
  it("restitue le texte du bloc quand toutes ses exigences sont selectionnees", () => {
    const { blocks } = applyTemplates("SyDMP", [A, B], library);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].requirements.map((r) => r.id)).toEqual([A.id, B.id]);
    expect(blocks[0].justification).toBe(TEXT_AB);
  });

  it("restitue une autre redaction quand l'exigence est seule", () => {
    const { blocks } = applyTemplates("SyDMP", [A], library);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].justification).toBe(TEXT_A);
  });

  it("n'applique pas un bloc dont une exigence manque a la selection", () => {
    // B seule : ni le bloc {A, B} ni le bloc {A} ne peuvent s'appliquer.
    const { blocks, uncovered } = applyTemplates("SyDMP", [B], library);
    expect(blocks[0].justification).toBeUndefined();
    expect(uncovered.map((r) => r.id)).toEqual([B.id]);
  });

  it("privilegie le bloc le plus large sur celui qui le recoupe", () => {
    const { blocks } = applyTemplates("SyDMP", A_B_C, library);
    expect(blocks[0].requirements.map((r) => r.id)).toEqual([A.id, B.id]);
    expect(blocks[0].justification).toBe(TEXT_AB);
    // L'exigence restante n'a pas de bloc type : elle reste a rediger.
    expect(blocks[1].justification).toBeUndefined();
  });

  it("laisse sans texte une exigence inconnue de la bibliotheque", () => {
    const { blocks, uncovered } = applyTemplates("SyDMP", A_B_C, library);
    expect(uncovered).toHaveLength(1);
    expect(blocks.filter((b) => !b.justification)).toHaveLength(1);
  });

  it("n'applique pas les blocs d'une autre famille de document", () => {
    const { blocks } = applyTemplates("SSA", [A, B], library);
    expect(blocks.every((block) => block.justification === undefined)).toBe(true);
  });

  it("ignore la casse de la famille de document", () => {
    expect(applyTemplates("sydmp", [A, B], library).blocks[0].justification).toBe(TEXT_AB);
  });

  it("conserve l'ordre de la selection", () => {
    const { blocks } = applyTemplates("SyDMP", A_B_C, library);
    expect(blocks.map((block) => block.requirements[0].id)).toEqual([A.id, A_B_C[2].id]);
  });

  it("rend la bibliotheque vide sans texte et sans regroupement", () => {
    const { blocks } = applyTemplates("SyDMP", A_B_C, EMPTY_LIBRARY);
    expect(blocks).toHaveLength(3);
    expect(blocks.every((block) => block.justification === undefined)).toBe(true);
  });
});

describe("countPlaceholders", () => {
  it("compte les reperes de paragraphe a pointer", () => {
    expect(countPlaceholders(TEXT_AB)).toBe(2);
    expect(countPlaceholders(TEXT_A)).toBe(1);
  });

  it("accepte les variantes d'ecriture", () => {
    expect(countPlaceholders("voir §x, §X.X et § x.x.x")).toBe(3);
  });

  it("ne compte pas un paragraphe deja renseigne", () => {
    expect(countPlaceholders("described in §3.3.5 and §4.1")).toBe(0);
  });

  it("rend zero pour un texte absent", () => {
    expect(countPlaceholders(undefined)).toBe(0);
  });
});

describe("bibliotheque", () => {
  it("liste les familles de documents", () => {
    const wider = mergeTemplates(library, [{ ...TPL_A, documentType: "ssa" }]);
    expect(documentTypesOf(wider)).toEqual(["SSA", "SYDMP"]);
  });

  it("liste les exigences qu'une famille sait couvrir", () => {
    expect(knownRequirementsFor(library, "SyDMP").sort()).toEqual([A.id, B.id].sort());
  });

  it("remplace un bloc type de meme jeu d'exigences", () => {
    const updated = mergeTemplates(library, [{ ...TPL_AB, text: "nouvelle redaction" }]);
    expect(templatesFor(updated, "SyDMP")).toHaveLength(2);
    expect(
      templatesFor(updated, "SyDMP").find((t) => t.requirementIds.length === 2)?.text,
    ).toBe("nouvelle redaction");
  });

  it("considere un bloc identique quel que soit l'ordre des exigences", () => {
    const reversed = { ...TPL_AB, requirementIds: [B.id, A.id] };
    expect(mergeTemplates(library, [reversed]).templates).toHaveLength(2);
  });

  it("retire un bloc type", () => {
    expect(forgetTemplate(library, TPL_A).templates).toHaveLength(1);
  });

  it("capitalise des blocs montes a la main", () => {
    const blocks = [{ requirements: [A, B], mocIds: [], justification: "redige" }];
    const learned = learnFromBlocks("SyDMP", blocks, "CVS-1");
    expect(learned[0].requirementIds).toEqual([A.id, B.id]);
    expect(learned[0].text).toBe("redige");
  });

  it("boucle : ce qui est capitalise est restitue", () => {
    const blocks = [{ requirements: [A, B], mocIds: [], justification: "redige en §x.x" }];
    const next = mergeTemplates(EMPTY_LIBRARY, learnFromBlocks("SyDMP", blocks));
    expect(applyTemplates("SyDMP", [A, B], next).blocks[0].justification).toBe("redige en §x.x");
  });

  it("valide la forme d'une bibliotheque", () => {
    expect(isTemplateLibrary({ templates: [TPL_AB] })).toBe(true);
    expect(isTemplateLibrary({ templates: [{ documentType: "X", requirementIds: [1] }] })).toBe(false);
    expect(isTemplateLibrary(null)).toBe(false);
  });
});

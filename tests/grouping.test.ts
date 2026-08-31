import { describe, expect, it } from "vitest";
import {
  applyGrouping,
  EMPTY_MEMORY,
  forgetRule,
  isGroupingMemory,
  learnFromGroups,
  mergeMemory,
} from "../lib/grouping";
import { dedupeRequirements, extractOccurrencesFromPage } from "../lib/requirements";
import type { RequirementGroup } from "../lib/types";

const requirementsOf = (line: string) =>
  dedupeRequirements(extractOccurrencesFromPage(line, 1));

const SELECTION = requirementsOf(
  "CS 25.0671(a) amdt. 23, JAR 25.1301(a) ch. 11, CS 25.0672(a) amdt. 23, JAR 25.1309(c) ch. 11",
);

const RULE = {
  documentType: "SSA",
  requirementIds: ["CS 25.671(a)", "JAR 25.1301(a)"],
  source: "CVS-SSA issue 3",
};

describe("applyGrouping", () => {
  it("laisse chaque exigence seule quand rien n'a ete appris", () => {
    const { groups, applied } = applyGrouping("SSA", SELECTION, EMPTY_MEMORY);
    expect(groups).toHaveLength(SELECTION.length);
    expect(groups.every((group) => group.requirements.length === 1)).toBe(true);
    expect(applied).toEqual([]);
  });

  it("rejoue un regroupement appris", () => {
    const memory = mergeMemory(EMPTY_MEMORY, [RULE]);
    const { groups, applied } = applyGrouping("SSA", SELECTION, memory);

    expect(groups[0].requirements.map((r) => r.id)).toEqual([
      "CS 25.671(a)",
      "JAR 25.1301(a)",
    ]);
    expect(groups).toHaveLength(3);
    expect(applied).toEqual([RULE]);
  });

  it("n'applique pas une regle d'un autre type de document", () => {
    const memory = mergeMemory(EMPTY_MEMORY, [{ ...RULE, documentType: "VVS" }]);
    const { groups } = applyGrouping("SSA", SELECTION, memory);
    expect(groups.every((group) => group.requirements.length === 1)).toBe(true);
  });

  it("ignore la casse du type de document", () => {
    const memory = mergeMemory(EMPTY_MEMORY, [{ ...RULE, documentType: "ssa" }]);
    const { applied } = applyGrouping("SSA", SELECTION, memory);
    expect(applied).toHaveLength(1);
  });

  it("n'applique pas une regle dont une seule exigence est selectionnee", () => {
    const partial = requirementsOf("CS 25.0671(a) amdt. 23, CS 25.0672(a) amdt. 23");
    const memory = mergeMemory(EMPTY_MEMORY, [RULE]);
    const { groups, applied } = applyGrouping("SSA", partial, memory);

    expect(applied).toEqual([]);
    expect(groups.every((group) => group.requirements.length === 1)).toBe(true);
  });

  it("privilegie la regle la plus large sur une regle qui la recoupe", () => {
    const large = {
      documentType: "SSA",
      requirementIds: ["CS 25.671(a)", "JAR 25.1301(a)", "CS 25.672(a)"],
    };
    const memory = mergeMemory(EMPTY_MEMORY, [RULE, large]);
    const { groups } = applyGrouping("SSA", SELECTION, memory);

    expect(groups[0].requirements.map((r) => r.id)).toEqual([
      "CS 25.671(a)",
      "JAR 25.1301(a)",
      "CS 25.672(a)",
    ]);
  });

  it("conserve l'ordre de la selection", () => {
    const memory = mergeMemory(EMPTY_MEMORY, [
      { documentType: "SSA", requirementIds: ["CS 25.672(a)", "JAR 25.1309(c)"] },
    ]);
    const { groups } = applyGrouping("SSA", SELECTION, memory);
    const first = groups.map((group) => group.requirements[0].id);
    expect(first).toEqual(["CS 25.671(a)", "JAR 25.1301(a)", "CS 25.672(a)"]);
  });
});

describe("learnFromGroups", () => {
  const groups: RequirementGroup[] = [
    { requirements: SELECTION.slice(0, 2), mocIds: [] },
    { requirements: SELECTION.slice(2, 3), mocIds: [] },
  ];

  it("n'apprend rien d'un bloc a une seule exigence", () => {
    const rules = learnFromGroups("SSA", groups, "CVS-SSA issue 3");
    expect(rules).toHaveLength(1);
    expect(rules[0].requirementIds).toEqual(["CS 25.671(a)", "JAR 25.1301(a)"]);
    expect(rules[0].source).toBe("CVS-SSA issue 3");
  });

  it("normalise le type de document", () => {
    expect(learnFromGroups(" ssa ", groups)[0].documentType).toBe("SSA");
  });

  it("boucle avec applyGrouping : ce qui est appris est rejoue", () => {
    const memory = mergeMemory(EMPTY_MEMORY, learnFromGroups("SSA", groups));
    const { groups: replayed } = applyGrouping("SSA", SELECTION, memory);
    expect(replayed[0].requirements.map((r) => r.id)).toEqual(
      groups[0].requirements.map((r) => r.id),
    );
  });
});

describe("mergeMemory et forgetRule", () => {
  it("n'enregistre pas deux fois la meme regle", () => {
    const once = mergeMemory(EMPTY_MEMORY, [RULE]);
    const twice = mergeMemory(once, [{ ...RULE, source: "autre coversheet" }]);
    expect(twice.rules).toHaveLength(1);
    expect(twice.rules[0].source).toBe("autre coversheet");
  });

  it("considere une regle identique quel que soit l'ordre des exigences", () => {
    const reversed = { ...RULE, requirementIds: [...RULE.requirementIds].reverse() };
    expect(mergeMemory(mergeMemory(EMPTY_MEMORY, [RULE]), [reversed]).rules).toHaveLength(1);
  });

  it("retire une regle", () => {
    expect(forgetRule(mergeMemory(EMPTY_MEMORY, [RULE]), RULE).rules).toEqual([]);
  });
});

describe("isGroupingMemory", () => {
  it("valide la forme attendue", () => {
    expect(isGroupingMemory({ rules: [RULE] })).toBe(true);
    expect(isGroupingMemory({ rules: [{ documentType: 1 }] })).toBe(false);
    expect(isGroupingMemory(null)).toBe(false);
  });
});

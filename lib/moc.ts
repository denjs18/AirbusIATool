/**
 * Moyens de conformite EASA (Means of Compliance) MC0..MC9.
 *
 * Sert deux usages dans l'outil :
 *  - proposer les documents de substantiation attendus quand on genere une trame ;
 *  - signaler les incoherences entre le MoC annonce dans l'ACP et celui de la coversheet.
 */
import type { MocCode, MocDefinition } from "./types";

export const MOC_DEFINITIONS: Record<MocCode, MocDefinition> = {
  MC0: {
    code: "MC0",
    labelFr: "Declaration de conformite",
    labelEn: "Compliance statement",
    expectedEvidence: ["Declaration de conformite signee"],
  },
  MC1: {
    code: "MC1",
    labelFr: "Revue de conception",
    labelEn: "Design review",
    expectedEvidence: ["Note de conception", "Compte rendu de revue"],
  },
  MC2: {
    code: "MC2",
    labelFr: "Calcul / analyse",
    labelEn: "Calculation / analysis",
    expectedEvidence: ["Note de calcul", "Rapport d'analyse"],
  },
  MC3: {
    code: "MC3",
    labelFr: "Analyse de securite",
    labelEn: "Safety assessment",
    expectedEvidence: ["FHA", "PSSA / SSA", "CCA", "FMEA"],
  },
  MC4: {
    code: "MC4",
    labelFr: "Essais en laboratoire",
    labelEn: "Laboratory tests",
    expectedEvidence: ["Procedure d'essai", "Rapport d'essai laboratoire"],
  },
  MC5: {
    code: "MC5",
    labelFr: "Essais au sol sur avion",
    labelEn: "Ground tests on aircraft",
    expectedEvidence: ["Procedure d'essai sol", "Rapport d'essai sol"],
  },
  MC6: {
    code: "MC6",
    labelFr: "Essais en vol",
    labelEn: "Flight tests",
    expectedEvidence: ["Programme d'essais en vol", "Rapport d'essais en vol"],
  },
  MC7: {
    code: "MC7",
    labelFr: "Inspection de conception / evaluation avion",
    labelEn: "Aircraft or simulator evaluation",
    expectedEvidence: ["Compte rendu d'inspection", "Rapport d'evaluation"],
  },
  MC8: {
    code: "MC8",
    labelFr: "Simulation",
    labelEn: "Simulation",
    expectedEvidence: ["Rapport de simulation", "Justification du modele"],
  },
  MC9: {
    code: "MC9",
    labelFr: "Qualification d'equipement",
    labelEn: "Equipment qualification",
    expectedEvidence: ["DDP", "Rapport de qualification (DO-160)"],
  },
};

export const ALL_MOC_CODES = Object.keys(MOC_DEFINITIONS) as MocCode[];

export function isMocCode(value: string): value is MocCode {
  return value in MOC_DEFINITIONS;
}

export function describeMoc(code: MocCode): string {
  const def = MOC_DEFINITIONS[code];
  return `${def.code} - ${def.labelFr}`;
}

/** Documents de substantiation attendus pour un ensemble de MoC, dedupliques. */
export function expectedEvidenceFor(codes: MocCode[]): string[] {
  const seen = new Set<string>();
  for (const code of codes) {
    for (const item of MOC_DEFINITIONS[code].expectedEvidence) seen.add(item);
  }
  return [...seen];
}

/**
 * MoC habituellement retenus pour une exigence donnee.
 * Utilise uniquement comme proposition par defaut quand l'ACP ne precise rien :
 * la decision reste au redacteur, l'outil ne fait que pre-remplir.
 */
export function suggestMocForRequirement(requirementId: string): MocCode[] {
  const paragraph = requirementId.replace(/^[A-Z]+\s*/, "").split("(")[0];
  const suggestions: Record<string, MocCode[]> = {
    "25.671": ["MC1", "MC2", "MC3", "MC6"],
    "25.672": ["MC1", "MC3", "MC6"],
    "25.675": ["MC1", "MC4"],
    "25.677": ["MC1", "MC4", "MC6"],
    "25.679": ["MC1", "MC5"],
    "25.681": ["MC2", "MC4"],
    "25.683": ["MC5"],
    "25.685": ["MC1", "MC4"],
    "25.689": ["MC1", "MC4"],
    "25.693": ["MC1"],
    "25.697": ["MC1", "MC5", "MC6"],
    "25.699": ["MC1", "MC5"],
    "25.701": ["MC1", "MC2", "MC4"],
    "25.703": ["MC1", "MC5", "MC6"],
    "25.143": ["MC2", "MC6", "MC8"],
    "25.1301": ["MC1", "MC9"],
    "25.1309": ["MC2", "MC3", "MC9"],
    "25.1322": ["MC1", "MC7"],
    "25.1329": ["MC1", "MC6", "MC8"],
  };
  return suggestions[paragraph] ?? ["MC0", "MC1"];
}

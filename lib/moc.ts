/**
 * Moyens de conformite EASA (Means of Compliance) MC0..MC9.
 *
 * Sert deux usages dans l'outil :
 *  - proposer les documents de substantiation attendus quand on genere une trame ;
 *  - signaler les incoherences entre le MoC annonce dans l'ACP et celui de la coversheet.
 */
import type { MocDefinition, MocId } from "./types";

export const MOC_DEFINITIONS: Record<MocId, MocDefinition> = {
  "0": {
    id: "0",
    labelFr: "Declaration de conformite",
    labelEn: "Compliance statement",
    expectedEvidence: ["Declaration de conformite signee"],
  },
  "1": {
    id: "1",
    labelFr: "Revue de conception",
    labelEn: "Design review",
    expectedEvidence: ["Note de conception", "Compte rendu de revue"],
  },
  "2": {
    id: "2",
    labelFr: "Calcul / analyse",
    labelEn: "Calculation / analysis",
    expectedEvidence: ["Note de calcul", "Rapport d'analyse"],
  },
  "3": {
    id: "3",
    labelFr: "Analyse de securite",
    labelEn: "Safety assessment",
    expectedEvidence: ["FHA", "PSSA / SSA", "CCA", "FMEA"],
  },
  "4": {
    id: "4",
    labelFr: "Essais en laboratoire",
    labelEn: "Laboratory tests",
    expectedEvidence: ["Procedure d'essai", "Rapport d'essai laboratoire"],
  },
  "5": {
    id: "5",
    labelFr: "Essais au sol sur avion",
    labelEn: "Ground tests on aircraft",
    expectedEvidence: ["Procedure d'essai sol", "Rapport d'essai sol"],
  },
  "6": {
    id: "6",
    labelFr: "Essais en vol",
    labelEn: "Flight tests",
    expectedEvidence: ["Programme d'essais en vol", "Rapport d'essais en vol"],
  },
  "7": {
    id: "7",
    labelFr: "Inspection de conception / evaluation avion",
    labelEn: "Aircraft or simulator evaluation",
    expectedEvidence: ["Compte rendu d'inspection", "Rapport d'evaluation"],
  },
  "8": {
    id: "8",
    labelFr: "Simulation",
    labelEn: "Simulation",
    expectedEvidence: ["Rapport de simulation", "Justification du modele"],
  },
  "9": {
    id: "9",
    labelFr: "Qualification d'equipement",
    labelEn: "Equipment qualification",
    expectedEvidence: ["DDP", "Rapport de qualification (DO-160)"],
  },
};

export const ALL_MOC_IDS = Object.keys(MOC_DEFINITIONS);

/**
 * Un identifiant de MoC connu porte une definition ; les autres restent
 * valides et sont affiches tels quels. Les plans utilisent en effet des
 * libelles internes (ex. "S") qu'il serait faux de rejeter.
 */
export function isKnownMoc(value: string): boolean {
  return value in MOC_DEFINITIONS;
}

/** Libelle affichable d'un MoC, y compris pour un identifiant non repertorie. */
export function describeMoc(id: MocId): string {
  const def = MOC_DEFINITIONS[id];
  return def ? `MoC ${def.id} - ${def.labelFr}` : `MoC ${id}`;
}

/** Documents de substantiation attendus pour un ensemble de MoC, dedupliques. */
export function expectedEvidenceFor(ids: MocId[]): string[] {
  const seen = new Set<string>();
  for (const id of ids) {
    for (const item of MOC_DEFINITIONS[id]?.expectedEvidence ?? []) seen.add(item);
  }
  return [...seen];
}

/**
 * MoC habituellement retenus pour une exigence donnee.
 * Utilise uniquement comme proposition par defaut quand l'ACP ne precise rien :
 * la decision reste au redacteur, l'outil ne fait que pre-remplir.
 */
export function suggestMocForRequirement(requirementId: string): MocId[] {
  const paragraph = requirementId.replace(/^[A-Z]+\s*/, "").split("(")[0];
  const suggestions: Record<string, MocId[]> = {
    "25.671": ["1", "2", "3", "6"],
    "25.672": ["1", "3", "6"],
    "25.675": ["1", "4"],
    "25.677": ["1", "4", "6"],
    "25.679": ["1", "5"],
    "25.681": ["2", "4"],
    "25.683": ["5"],
    "25.685": ["1", "4"],
    "25.689": ["1", "4"],
    "25.693": ["1"],
    "25.697": ["1", "5", "6"],
    "25.699": ["1", "5"],
    "25.701": ["1", "2", "4"],
    "25.703": ["1", "5", "6"],
    "25.143": ["2", "6", "8"],
    "25.1301": ["1", "9"],
    "25.1309": ["2", "3", "9"],
    "25.1322": ["1", "7"],
    "25.1329": ["1", "6", "8"],
  };
  return suggestions[paragraph] ?? ["0", "1"];
}

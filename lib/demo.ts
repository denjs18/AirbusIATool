/**
 * Jeux de donnees fictifs de demonstration.
 *
 * Centralises ici pour deux raisons : les chemins ne sont declares qu'une fois,
 * et chaque module peut charger l'exemple dont il a besoin sans dependre du
 * module precedent. En demonstration, on ne veut jamais avoir a expliquer
 * "il faut d'abord aller dans l'onglet 1".
 */
import { parsePlan } from "./parse-acp";
import { extractPdfText } from "./pdf";
import type { ParsedPlan } from "./types";

export const DEMO_FILES = {
  acp: "/fixtures/ACP-27-CER-0114_Iss3.pdf",
  substantiation: "/fixtures/DOC-27-SAF-0142_Iss2.pdf",
  coversheet: "/fixtures/CVS-27-FCS-0001_Iss2.pdf",
  registry: "/fixtures/coversheets-registry.json",
  templates: "/fixtures/blocs-types.json",
} as const;

/** Charge un PDF fictif servi par l'application et en extrait le texte. */
export async function loadDemoPdf(path: string) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Exemple fictif introuvable (${path}).`);
  }
  return extractPdfText(await response.arrayBuffer(), path.split("/").pop());
}

/** Charge l'ACP fictif et le convertit en plan exploitable. */
export async function loadDemoPlan(): Promise<ParsedPlan> {
  return parsePlan(await loadDemoPdf(DEMO_FILES.acp));
}

/**
 * Message d'erreur exploitable par un utilisateur non developpeur.
 * Un "undefined is not a function" ne dit rien a personne ; on nomme la cause
 * probable et l'action possible.
 */
export function describeLoadError(cause: unknown): string {
  const raw = cause instanceof Error ? cause.message : String(cause);

  if (/withResolvers|not a function|undefined is not/i.test(raw)) {
    return `Le lecteur PDF n'a pas pu demarrer sur ce navigateur. Mettez-le a jour si possible, ou ouvrez l'outil depuis un ordinateur. (detail technique : ${raw})`;
  }
  if (/introuvable|404|Failed to fetch|NetworkError|Load failed/i.test(raw)) {
    return `Le fichier n'a pas pu etre recupere. Verifiez la connexion, puis reessayez. (detail technique : ${raw})`;
  }
  if (/password|encrypted/i.test(raw)) {
    return "Ce PDF est protege par mot de passe : l'outil ne peut pas en lire le texte.";
  }
  if (/Invalid PDF|corrupt|structure/i.test(raw)) {
    return "Ce fichier n'est pas un PDF lisible, ou il est endommage.";
  }
  return `Lecture du document impossible. (detail technique : ${raw})`;
}

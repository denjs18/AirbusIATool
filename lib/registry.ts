/**
 * Chargement d'un registre de coversheets existantes.
 *
 * Simule ce qu'on obtiendrait par export du referentiel documentaire : une
 * liste plate (reference, exigence, MoC). Permet le recoupement sans avoir a
 * ouvrir chaque coversheet.
 */
import { isKnownMoc } from "./moc";
import {
  dedupeRequirements,
  extractOccurrencesFromPage,
  formatRequirementId,
} from "./requirements";
import type { Coversheet, MocId, RequirementRef } from "./types";

export interface RegistryEntry {
  documentRef: string;
  requirement: string;
  /** Amendement CS ou chapitre JAR applicable. */
  qualifier?: string;
  moc?: string[];
  issue?: string;
}

export interface RegistryFile {
  programme?: string;
  ataChapter?: string;
  coversheets: RegistryEntry[];
}

/**
 * Analyse la chaine d'exigence d'une entree de registre.
 * On reutilise l'extracteur du plan pour garantir des identifiants strictement
 * comparables entre les deux sources.
 */
export function parseRequirementString(value: string): RequirementRef {
  const occurrences = extractOccurrencesFromPage(value, 0);
  const [requirement] = dedupeRequirements(occurrences);
  if (requirement) return requirement;

  // Repli : on conserve la valeur brute pour ne jamais perdre silencieusement
  // une entree du registre, elle ressortira comme coversheet hors plan.
  return {
    id: value.trim(),
    kind: "CS",
    paragraph: value.trim(),
    raw: value.trim(),
  };
}

export function registryToCoversheets(file: RegistryFile): Coversheet[] {
  return file.coversheets.map((entry) => {
    const requirement = parseRequirementString(entry.requirement);
    const mocIds = (entry.moc ?? []).filter((code) => isKnownMoc(code));

    return {
      requirement: entry.qualifier ? { ...requirement, qualifier: entry.qualifier } : requirement,
      header: {
        documentRef: entry.documentRef,
        issue: entry.issue ?? "1",
        programme: file.programme,
        ataChapter: file.ataChapter,
        requirementRef: entry.qualifier
          ? `${requirement.id} (${entry.qualifier})`
          : requirement.id,
        moc: mocIds.join(", "),
      },
      mocIds,
      citations: [],
    };
  });
}

/** Verifie qu'une valeur inconnue a la forme attendue d'un registre. */
export function isRegistryFile(value: unknown): value is RegistryFile {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { coversheets?: unknown };
  return (
    Array.isArray(candidate.coversheets) &&
    candidate.coversheets.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as RegistryEntry).documentRef === "string" &&
        typeof (entry as RegistryEntry).requirement === "string",
    )
  );
}

/** Identifiant canonique d'une exigence, expose pour les affichages. */
export const canonicalRequirementId = formatRequirementId;

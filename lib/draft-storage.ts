/**
 * Conservation de la coversheet en cours de preparation.
 *
 * Pointer les paragraphes d'un document joint demande de le lire : on quitte
 * l'onglet, on revient. Sans cela le travail deja saisi disparaitrait au
 * moindre changement d'onglet, ce qui rendrait la saisie inutilisable.
 *
 * Le brouillon vit dans sessionStorage et non dans localStorage : c'est un
 * travail en cours, pas un parametrage. Il s'efface avec l'onglet du
 * navigateur, ce qui evite de retrouver la coversheet d'un collegue sur un
 * poste partage.
 */

const STORAGE_KEY = "airbus-ia-tool.coversheet-draft";

export interface CoversheetDraft {
  documentType: string;
  /** Identifiants des exigences cochees. */
  selected: string[];
  validated: boolean;
  /** Chapitres saisis, par bloc et par rang de repere. */
  fills: Record<string, string>;
  documentRef: string;
  documentIssue: string;
  documentTitle: string;
  moc: string;
}

export const EMPTY_DRAFT: CoversheetDraft = {
  documentType: "",
  selected: [],
  validated: false,
  fills: {},
  documentRef: "",
  documentIssue: "",
  documentTitle: "",
  moc: "",
};

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

/** Relit le brouillon, en verifiant sa forme comme celle d'un fichier. */
export function loadDraft(): CoversheetDraft {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (typeof parsed !== "object" || parsed === null) return EMPTY_DRAFT;
    const candidate = parsed as Partial<CoversheetDraft>;

    const selected = Array.isArray(candidate.selected)
      ? candidate.selected.filter((id): id is string => typeof id === "string")
      : [];
    const text = (value: unknown) => (typeof value === "string" ? value : "");

    return {
      documentType: text(candidate.documentType),
      selected,
      validated: candidate.validated === true,
      fills: isStringRecord(candidate.fills) ? candidate.fills : {},
      documentRef: text(candidate.documentRef),
      documentIssue: text(candidate.documentIssue),
      documentTitle: text(candidate.documentTitle),
      moc: text(candidate.moc),
    };
  } catch {
    return EMPTY_DRAFT;
  }
}

export function saveDraft(draft: CoversheetDraft): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Stockage refuse : la saisie reste valable tant que l'onglet est ouvert.
  }
}

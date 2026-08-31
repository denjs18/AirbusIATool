/**
 * Lecture de l'en-tete d'un document de certification.
 *
 * Sert a identifier un document a partir de sa page de garde : reference,
 * issue, programme, chapitre ATA. Il n'y a volontairement aucun controle de
 * ces champs : verifier une page de garde n'est pas une tache qui coute du
 * temps aux equipes.
 */
import { normalizeExtractedText } from "./requirements";
import type { DocumentHeader } from "./types";

/** Etiquettes rencontrees dans les trames FR et EN, par champ normalise. */
const FIELD_LABELS: Record<keyof DocumentHeader, string[]> = {
  documentRef: ["document reference", "reference document", "doc ref", "reference", "document no", "document number"],
  title: ["title", "titre", "document title"],
  issue: ["issue", "revision", "indice", "version", "iss"],
  date: ["date", "date d'emission", "issue date"],
  ataChapter: ["ata", "ata chapter", "chapitre ata", "ata ref"],
  programme: ["programme", "program", "aircraft", "aircraft type", "avion", "type avion"],
  requirementRef: ["requirement", "exigence", "requirement reference", "cs paragraph", "paragraphe"],
  moc: ["moc", "mc", "means of compliance", "moyen de conformite", "moyens de conformite"],
  author: ["author", "auteur", "prepared by", "redige par", "written by"],
  checker: ["checker", "verificateur", "checked by", "verifie par", "reviewed by"],
  approver: ["approver", "approbateur", "approved by", "approuve par"],
  classification: ["classification", "confidentialite", "confidentiality"],
};

const FIELD_KEYS = Object.keys(FIELD_LABELS) as (keyof DocumentHeader)[];

function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Lit les champs d'en-tete d'un texte au format "Etiquette : valeur".
 * Tolerant sur les separateurs (":", "=", tabulation) et sur l'ordre des champs.
 */
/** Nombre de lignes examinees : l'en-tete est en tete de page de garde. */
const HEADER_SCAN_LINES = 40;

/**
 * Longueur maximale d'une etiquette lors de la passe permissive.
 * Sans cette borne, une ligne de corps comme
 * "- CS 25.671 General, control systems, at Amdt 27. MoC: 1, 2, 3 and 6."
 * serait lue comme un champ "MoC" de l'en-tete.
 */
const MAX_LABEL_LENGTH = 34;

/**
 * Lignes qui ne peuvent pas porter un champ d'en-tete : puces et enumerations
 * du corps du document, ou etiquettes contenant une reference d'exigence.
 */
const RE_BULLET = /^\s*(?:[-*•·]|[a-z]\)|\d{1,2}[).])\s/i;
const RE_LABEL_HAS_REQUIREMENT = /\b(?:CS|AMC|FAR|CFR)[\s-]?\d{2}[.-]\d/i;

function isHeaderCandidate(line: string, rawLabel: string): boolean {
  return !RE_BULLET.test(line) && !RE_LABEL_HAS_REQUIREMENT.test(rawLabel);
}

export function parseHeader(rawText: string, maxLines = HEADER_SCAN_LINES): DocumentHeader {
  const header: DocumentHeader = {};
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxLines);

  for (const line of lines) {
    const separatorMatch = line.match(/^(.{2,60}?)\s*[::=]\s*(.+)$/);
    if (!separatorMatch) continue;
    if (!isHeaderCandidate(line, separatorMatch[1])) continue;

    const label = normalizeLabel(separatorMatch[1]);
    const value = normalizeExtractedText(separatorMatch[2]);
    if (!value) continue;

    for (const key of FIELD_KEYS) {
      if (header[key] !== undefined) continue;
      const aliases = FIELD_LABELS[key];
      // Egalite exacte d'abord : "date" ne doit pas capter "issue date".
      if (aliases.includes(label)) {
        header[key] = value;
        break;
      }
    }
  }

  // Deuxieme passe, plus permissive, pour les etiquettes composees restantes.
  for (const line of lines) {
    const separatorMatch = line.match(/^(.{2,60}?)\s*[::=]\s*(.+)$/);
    if (!separatorMatch) continue;
    if (!isHeaderCandidate(line, separatorMatch[1])) continue;

    const label = normalizeLabel(separatorMatch[1]);
    const value = normalizeExtractedText(separatorMatch[2]);
    if (!value) continue;

    if (label.length > MAX_LABEL_LENGTH) continue;

    for (const key of FIELD_KEYS) {
      if (header[key] !== undefined) continue;
      // L'alias doit border l'etiquette ("issue date", "date d emission"),
      // pas apparaitre au milieu d'une phrase.
      const matches = FIELD_LABELS[key].some(
        (alias) => label.startsWith(alias) || label.endsWith(alias),
      );
      if (matches) {
        header[key] = value;
        break;
      }
    }
  }

  return header;
}

/**
 * Controle des en-tetes de documents (les "premieres lignes").
 *
 * Objectif : eliminer les reprises pour cause de champ oublie, de reference mal
 * formee ou d'incoherence entre l'en-tete et le contenu du document.
 */
import { ALL_MOC_CODES, isMocCode } from "./moc";
import { normalizeExtractedText } from "./requirements";
import type { CheckResult, DocumentHeader } from "./types";

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

export interface HeaderRules {
  /** Chapitre ATA attendu, ex. "27". */
  expectedAta?: string;
  /** Programmes autorises, ex. ["A320neo", "A350"]. */
  allowedProgrammes?: string[];
  /** Champs obligatoires. Par defaut : ref, titre, issue, date, ATA, programme. */
  requiredFields?: (keyof DocumentHeader)[];
  /** Motif de reference documentaire attendu. */
  documentRefPattern?: RegExp;
  /** Date de reference pour detecter les dates futures. Injectable pour les tests. */
  today?: Date;
}

const DEFAULT_REQUIRED: (keyof DocumentHeader)[] = [
  "documentRef",
  "title",
  "issue",
  "date",
  "ataChapter",
  "programme",
];

/** Motif Airbus-like utilise dans les jeux de donnees fictives du POC. */
export const DEFAULT_DOC_REF_PATTERN = /^[A-Z]{2,4}-\d{2}-[A-Z]{2,4}-\d{3,5}$/;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, fev: 2, mar: 3, apr: 4, avr: 4, may: 5, mai: 5, jun: 6, juin: 6,
  jul: 7, juil: 7, aug: 8, aou: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Analyse une date en tolerant les formats FR, EN et ISO. */
export function parseHeaderDate(value: string): Date | undefined {
  const trimmed = value.trim();

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return buildDate(+iso[1], +iso[2], +iso[3]);

  const dmy = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmy) return buildDate(+dmy[3], +dmy[2], +dmy[1]);

  const textual = trimmed
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .match(/^(\d{1,2})\s+([a-z]{3,9})\.?\s+(\d{4})$/);
  if (textual) {
    const month = MONTHS[textual[2].slice(0, 3)];
    if (month) return buildDate(+textual[3], month, +textual[1]);
  }

  return undefined;
}

function buildDate(year: number, month: number, day: number): Date | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const date = new Date(Date.UTC(year, month - 1, day));
  // Rejette les jours qui debordent sur le mois suivant (ex. 31/02).
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return date;
}

/**
 * Controle l'en-tete et retourne un diagnostic par champ.
 * L'outil ne corrige jamais de lui-meme : il signale et propose.
 */
export function checkHeader(
  header: DocumentHeader,
  rules: HeaderRules = {},
): CheckResult[] {
  const results: CheckResult[] = [];
  const required = rules.requiredFields ?? DEFAULT_REQUIRED;
  const pattern = rules.documentRefPattern ?? DEFAULT_DOC_REF_PATTERN;
  const today = rules.today ?? new Date();

  for (const field of required) {
    if (!header[field]) {
      results.push({
        id: `header.missing.${field}`,
        status: "error",
        label: `Champ obligatoire absent : ${field}`,
        detail: `Le champ "${field}" n'a pas ete trouve dans l'en-tete.`,
        location: { field },
        suggestion: "Completer le champ avant emission.",
      });
    }
  }

  if (header.documentRef && !pattern.test(header.documentRef)) {
    results.push({
      id: "header.documentRef.format",
      status: "warning",
      label: "Format de reference documentaire inattendu",
      detail: `"${header.documentRef}" ne suit pas le motif attendu ${pattern}.`,
      location: { field: "documentRef" },
      suggestion: "Verifier la reference dans le referentiel documentaire.",
    });
  }

  if (header.issue && !/^\d{1,3}(\.\d{1,2})?$|^Iss(?:ue)?\.?\s*\d{1,3}$|^[A-Z]$/i.test(header.issue.trim())) {
    results.push({
      id: "header.issue.format",
      status: "warning",
      label: "Indice de revision inattendu",
      detail: `Indice lu : "${header.issue}". Formats admis : 1, 1.2, Issue 3, A.`,
      location: { field: "issue" },
    });
  }

  if (header.date) {
    const parsed = parseHeaderDate(header.date);
    if (!parsed) {
      results.push({
        id: "header.date.format",
        status: "error",
        label: "Date illisible",
        detail: `"${header.date}" n'est pas une date reconnue (attendu JJ/MM/AAAA, AAAA-MM-JJ ou 12 March 2026).`,
        location: { field: "date" },
      });
    } else if (parsed.getTime() > today.getTime()) {
      results.push({
        id: "header.date.future",
        status: "warning",
        label: "Date d'emission dans le futur",
        detail: `La date ${header.date} est posterieure a la date du jour.`,
        location: { field: "date" },
      });
    }
  }

  if (rules.expectedAta && header.ataChapter) {
    const normalized = header.ataChapter.match(/\d{2}/)?.[0];
    if (normalized !== rules.expectedAta) {
      results.push({
        id: "header.ata.mismatch",
        status: "error",
        label: "Chapitre ATA incoherent",
        detail: `En-tete : ATA ${header.ataChapter}. Attendu : ATA ${rules.expectedAta}.`,
        location: { field: "ataChapter" },
      });
    }
  }

  if (rules.allowedProgrammes?.length && header.programme) {
    const match = rules.allowedProgrammes.some(
      (p) => p.toLowerCase() === header.programme?.toLowerCase().trim(),
    );
    if (!match) {
      results.push({
        id: "header.programme.unknown",
        status: "warning",
        label: "Programme non reconnu",
        detail: `"${header.programme}" n'est pas dans la liste ${rules.allowedProgrammes.join(", ")}.`,
        location: { field: "programme" },
      });
    }
  }

  if (header.moc) {
    // On capture la suite complete de chiffres : "MC12" doit etre signale comme
    // invalide, pas interprete comme "MC1" suivi d'un 2.
    const codes = [...header.moc.matchAll(/M(?:C|oC)\s*\.?\s*(\d+)/gi)].map((m) => m[1]);
    const normalized = codes.map((digits) => `MC${digits}`);
    const invalid = normalized.filter((c) => !isMocCode(c));
    if (!normalized.length) {
      results.push({
        id: "header.moc.unreadable",
        status: "warning",
        label: "Moyen de conformite non identifie",
        detail: `Champ MoC lu : "${header.moc}". Aucun code MC0..MC9 detecte.`,
        location: { field: "moc" },
      });
    } else if (invalid.length) {
      results.push({
        id: "header.moc.invalid",
        status: "error",
        label: "Code MoC invalide",
        detail: `Codes non reconnus : ${invalid.join(", ")}. Valeurs admises : ${ALL_MOC_CODES.join(", ")}.`,
        location: { field: "moc" },
      });
    }
  }

  // Separation des roles : un meme nom ne peut pas rediger et approuver.
  if (header.author && header.approver && sameName(header.author, header.approver)) {
    results.push({
      id: "header.roles.conflict",
      status: "error",
      label: "Redacteur et approbateur identiques",
      detail: `"${header.author}" apparait comme auteur et comme approbateur.`,
      location: { field: "approver" },
      suggestion: "Faire approuver par une personne distincte du redacteur.",
    });
  }

  if (!results.length) {
    results.push({
      id: "header.ok",
      status: "ok",
      label: "En-tete conforme",
      detail: "Tous les champs controles sont presents et coherents.",
    });
  }

  return results;
}

function sameName(a: string, b: string): boolean {
  const norm = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z ]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .sort()
      .join(" ");
  return norm(a) === norm(b);
}

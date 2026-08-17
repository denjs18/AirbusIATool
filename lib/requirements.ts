/**
 * Extraction et normalisation des references reglementaires.
 *
 * Tout est deterministe et testable : aucune IA n'intervient ici. C'est le
 * socle sur lequel reposent la generation de trames et les recoupements, donc
 * il doit etre reproductible a l'identique d'une execution a l'autre.
 */
import type {
  MocCode,
  RequirementKind,
  RequirementOccurrence,
  RequirementRef,
} from "./types";

/**
 * Le texte extrait d'un PDF arrive avec des coupures de ligne et des espaces
 * parasites au milieu des references ("CS 25 .\n671"). On normalise avant de
 * chercher, sinon on perd une part importante des occurrences.
 */
export function normalizeExtractedText(input: string): string {
  return input
    .replace(/\u00a0/g, " ")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Recolle les references coupees par l'extraction : "CS 25 . 671" -> "CS 25.671".
 * Applique uniquement autour des motifs numeriques de paragraphes CS-25.
 */
function repairParagraphSpacing(input: string): string {
  return input.replace(
    /\b(CS|AMC|FAR|CFR)\s*[-\s]?\s*(\d{2})\s*\.\s*(\d{1,4})/gi,
    (_m, prefix: string, part: string, num: string) =>
      `${prefix.toUpperCase()} ${part}.${num}`,
  );
}

const SUBPARAGRAPH = /(?:\(\s*[a-z0-9]{1,3}\s*\))+/i;

/** CS 25.671(c)(2), CS-25.1309, CS25.1322 */
const RE_CS = new RegExp(
  String.raw`\bCS[\s-]?(\d{2}\.\d{1,4})(${SUBPARAGRAPH.source})?`,
  "gi",
);
/** AMC 25.1309, AMC 25-11, AMC 20-115 */
const RE_AMC = new RegExp(
  String.raw`\bAMC[\s-]?(\d{2}(?:\.\d{1,4}|-\d{1,4}))(${SUBPARAGRAPH.source})?`,
  "gi",
);
/** 14 CFR 25.671, FAR 25.671 */
const RE_FAR = new RegExp(
  String.raw`\b(?:14\s*CFR|FAR)[\s-]?(?:Part\s*)?(\d{2}\.\d{1,4})(${SUBPARAGRAPH.source})?`,
  "gi",
);
/** CRI F-01, CRI B-14 Issue 2 */
const RE_CRI = /\bCRI[\s-]?([A-Z]{1,2}-?\d{1,3})/gi;
/** SC F-12, Special Condition F-12 */
const RE_SC = /\b(?:SC|Special\s+Condition)[\s-]?([A-Z]{1,2}-?\d{1,3})/gi;
/** ESF F-03, Equivalent Safety Finding F-03 */
const RE_ESF = /\b(?:ESF|Equivalent\s+Safety\s+Finding)[\s-]?([A-Z]{1,2}-?\d{1,3})/gi;

/** CS-25 Amdt 27, Amendment 26, at Amdt 27 */
const RE_AMENDMENT = /\bAm(?:d?t|endment)\.?\s*(\d{1,3})\b/i;

interface RawMatch {
  kind: RequirementKind;
  paragraph: string;
  subparagraph?: string;
  raw: string;
  index: number;
}

function cleanSubparagraph(sub: string | undefined): string | undefined {
  if (!sub) return undefined;
  const cleaned = sub.replace(/\s+/g, "").toLowerCase();
  return cleaned.length ? cleaned : undefined;
}

function collect(
  text: string,
  regex: RegExp,
  kind: RequirementKind,
  hasSubparagraph: boolean,
): RawMatch[] {
  const out: RawMatch[] = [];
  regex.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    out.push({
      kind,
      paragraph: m[1].replace(/\s+/g, ""),
      subparagraph: hasSubparagraph ? cleanSubparagraph(m[2]) : undefined,
      raw: m[0].replace(/\s+/g, " ").trim(),
      index: m.index,
    });
  }
  return out;
}

/** Forme canonique servant de cle de rapprochement entre documents. */
export function formatRequirementId(
  kind: RequirementKind,
  paragraph: string,
  subparagraph?: string,
): string {
  const sub = subparagraph ?? "";
  if (kind === "CRI" || kind === "SC" || kind === "ESF") {
    return `${kind} ${paragraph.toUpperCase()}`;
  }
  return `${kind} ${paragraph}${sub}`;
}

/**
 * Codes MoC presents dans un fragment de texte.
 * Accepte "MC2", "MC 2", "MoC 2", "MoC: 2, 4", "MC1/MC3".
 */
export function extractMocCodes(fragment: string): MocCode[] {
  const found = new Set<MocCode>();

  const direct = /\bM(?:C|oC)\s*\.?\s*([0-9])\b/gi;
  let m: RegExpExecArray | null;
  while ((m = direct.exec(fragment)) !== null) {
    found.add(`MC${m[1]}` as MocCode);
  }

  // Listes du type "MoC : 2, 3 et 5", "Means of compliance: 4/6",
  // "Moyens de conformite : 1 et 4".
  const list =
    /\b(?:M(?:C|oC)s?|Means?\s+of\s+compliance|Moyens?\s+de\s+conformite)\s*[:=]\s*([0-9][0-9,;/\s&]*(?:et|and)?[0-9,;/\s]*)/gi;
  while ((m = list.exec(fragment)) !== null) {
    for (const digit of m[1].match(/[0-9]/g) ?? []) {
      found.add(`MC${digit}` as MocCode);
    }
  }

  return [...found].sort();
}

function amendmentNear(text: string, index: number, raw: string): string | undefined {
  const window = text.slice(index, index + raw.length + 40);
  const m = RE_AMENDMENT.exec(window);
  return m ? `Amdt ${m[1]}` : undefined;
}

/** Une ligne se terminant par un debut de reference se poursuit sur la suivante. */
const RE_DANGLING_REF = /\b(?:CS|AMC|FAR|CFR|SC|CRI|ESF)[\s-]?\d{0,2}\.?\s*$/i;

/**
 * Decoupe une page en segments d'une ligne logique.
 *
 * Le decoupage par ligne est essentiel : dans un tableau de synthese d'ACP, les
 * lignes voisines portent d'autres exigences avec d'autres MoC. Une fenetre de
 * contexte en nombre de caracteres melangerait les MoC de plusieurs exigences,
 * ce qui produirait des trames fausses.
 */
export function pageToSegments(rawText: string): string[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const segments: string[] = [];
  for (const line of lines) {
    const previous = segments[segments.length - 1];
    if (previous !== undefined && RE_DANGLING_REF.test(previous)) {
      // Reference coupee par la mise en page : on recolle avec la ligne suivante.
      segments[segments.length - 1] = `${previous} ${line}`;
    } else {
      segments.push(line);
    }
  }

  return segments.map((segment) => repairParagraphSpacing(normalizeExtractedText(segment)));
}

/** Une ligne dediee aux moyens de conformite prolonge la citation precedente. */
const RE_MOC_CONTINUATION =
  /^\s*(?:M(?:C|oC)s?|Means?\s+of\s+compliance|Moyens?\s+de\s+conformite)\b/i;

/** Extrait toutes les occurrences d'exigences d'une page de texte. */
export function extractOccurrencesFromPage(
  rawText: string,
  page: number,
): RequirementOccurrence[] {
  const segments = pageToSegments(rawText);
  const occurrences: RequirementOccurrence[] = [];

  segments.forEach((segment, segmentIndex) => {
    const matches: RawMatch[] = [
      ...collect(segment, RE_CS, "CS", true),
      ...collect(segment, RE_AMC, "AMC", true),
      ...collect(segment, RE_FAR, "FAR", true),
      ...collect(segment, RE_CRI, "CRI", false),
      ...collect(segment, RE_SC, "SC", false),
      ...collect(segment, RE_ESF, "ESF", false),
    ].sort((a, b) => a.index - b.index);

    // "Special Condition F-12" matche aussi SC ; on ecarte les doublons de position.
    const seenPositions = new Set<number>();

    // Les MoC sont cherches dans la ligne de la citation, et dans la ligne
    // suivante uniquement si celle-ci est dediee aux moyens de conformite.
    const next = segments[segmentIndex + 1];
    let mocScope = segment;
    if (!extractMocCodes(segment).length && next && RE_MOC_CONTINUATION.test(next)) {
      mocScope = `${segment} ${next}`;
    }
    const mocCodes = extractMocCodes(mocScope);

    for (const match of matches) {
      if (seenPositions.has(match.index)) continue;
      seenPositions.add(match.index);

      occurrences.push({
        id: formatRequirementId(match.kind, match.paragraph, match.subparagraph),
        kind: match.kind,
        paragraph: match.paragraph,
        subparagraph: match.subparagraph,
        amendment: amendmentNear(segment, match.index, match.raw),
        raw: match.raw,
        page,
        context: segment,
        // Une ligne citant plusieurs exigences ne permet pas d'attribuer les MoC
        // a l'une plutot qu'a l'autre : on ne devine pas, on laisse vide.
        mocCodes: matches.length > 1 ? [] : mocCodes,
      });
    }
  });

  return occurrences;
}

/**
 * Deduplique les occurrences en exigences uniques.
 * Les MoC et amendements rencontres sur plusieurs occurrences sont fusionnes.
 */
export function dedupeRequirements(
  occurrences: RequirementOccurrence[],
): RequirementRef[] {
  const byId = new Map<string, RequirementRef>();
  for (const occ of occurrences) {
    const existing = byId.get(occ.id);
    if (!existing) {
      byId.set(occ.id, {
        id: occ.id,
        kind: occ.kind,
        paragraph: occ.paragraph,
        subparagraph: occ.subparagraph,
        amendment: occ.amendment,
        raw: occ.raw,
      });
    } else if (!existing.amendment && occ.amendment) {
      existing.amendment = occ.amendment;
    }
  }
  return [...byId.values()];
}

/**
 * Regroupe les occurrences par paragraphe (sans sous-alinea).
 * Utile pour les coversheets emises au niveau du paragraphe.
 */
export function groupByParagraph(
  occurrences: RequirementOccurrence[],
): Map<string, RequirementOccurrence[]> {
  const groups = new Map<string, RequirementOccurrence[]>();
  for (const occ of occurrences) {
    const key = `${occ.kind} ${occ.paragraph}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(occ);
    else groups.set(key, [occ]);
  }
  return groups;
}

/** Tri de lecture : par nature puis par numero de paragraphe croissant. */
export function sortRequirements(refs: RequirementRef[]): RequirementRef[] {
  const kindOrder: RequirementKind[] = ["CS", "AMC", "FAR", "SC", "CRI", "ESF"];
  return [...refs].sort((a, b) => {
    const byKind = kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind);
    if (byKind !== 0) return byKind;
    const numA = Number(a.paragraph.replace(/[^0-9.]/g, "").split(".")[1] ?? 0);
    const numB = Number(b.paragraph.replace(/[^0-9.]/g, "").split(".")[1] ?? 0);
    if (numA !== numB) return numA - numB;
    return (a.subparagraph ?? "").localeCompare(b.subparagraph ?? "");
  });
}

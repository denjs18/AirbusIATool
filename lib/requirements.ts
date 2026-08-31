/**
 * Extraction et normalisation des references reglementaires.
 *
 * Tout est deterministe et testable : aucune IA n'intervient ici. C'est le
 * socle sur lequel reposent la generation de trames et les recoupements, donc
 * il doit etre reproductible a l'identique d'une execution a l'autre.
 */
import type {
  MocId,
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
    /\b(CS|JAR|AMC|FAR|CFR)\s*[-\s]?\s*(\d{2})\s*\.\s*(\d{1,4})/gi,
    (_m, prefix: string, part: string, num: string) =>
      `${prefix.toUpperCase()} ${part}.${num}`,
  );
}

/**
 * Sous-alineas, eventuellement multiples et separes du numero par un espace :
 * "(a)", "(b)(c)(d)", "25.1301 (a)".
 */
const SUBPARAGRAPH = /(?:\s*\(\s*[a-z0-9]{1,3}\s*\))+/i;

/** CS 25.671(c)(2), CS-25.1309, CS25.1322, CS 25.0671 (a) */
const RE_CS = new RegExp(
  String.raw`\bCS[\s-]?(\d{2}\.\d{1,4})(${SUBPARAGRAPH.source})?`,
  "gi",
);
/** JAR 25.1301(a) ch. 11, JAR 25.1309 (b)(c)(d) CH 11 */
const RE_JAR = new RegExp(
  String.raw`\bJAR[\s-]?(\d{2}\.\d{1,4})(${SUBPARAGRAPH.source})?`,
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
/**
 * CRI F-28, CRI-SE 20, CRI SE 25, CRI F-34.
 * La partie lettre et la partie numero sont capturees separement pour produire
 * un identifiant unique quelle que soit la ponctuation d'origine.
 */
const RE_CRI = /\bCRI[\s-]?([A-Z]{1,3})[\s-]?(\d{1,3})\b/gi;
/** SC F-12, Special Condition F-12 */
const RE_SC = /\b(?:SC|Special\s+Condition)[\s-]?([A-Z]{1,3})[\s-]?(\d{1,3})\b/gi;
/** ESF F-03, Equivalent Safety Finding F-03 */
const RE_ESF =
  /\b(?:ESF|Equivalent\s+Safety\s+Finding)[\s-]?([A-Z]{1,3})[\s-]?(\d{1,3})\b/gi;

/**
 * Qualifieur de version de l'exigence, immediatement apres la reference.
 * Un paragraphe CS porte un amendement ("amdt. 23"), un paragraphe JAR porte
 * un chapitre ("ch. 11") : les deux jouent le meme role et sont stockes tels
 * quels, sans etre reduits l'un a l'autre.
 */
const RE_QUALIFIER = /\b(?:(Am(?:d?t|endment))\.?\s*(\d{1,3})|(ch)(?:apter)?\.?\s*(\d{1,3}))\b/i;

/** "Appendix 1", "Appendix 1 & 3", "Appendices 1 and 3" */
const RE_APPENDIX = /\bAppendi(?:x|ces)\s*((?:\d{1,2}(?:\s*(?:&|and|et|,)\s*)?)+)/i;

/**
 * Numero de paragraphe canonique : les zeros de tete de la partie decimale
 * sont retires. "25.0671" et "25.671" designent le meme paragraphe et doivent
 * donc porter le meme identifiant, sans quoi les recoupements les comptent
 * comme deux exigences distinctes.
 */
export function normalizeParagraph(paragraph: string): string {
  const [head, tail] = paragraph.split(".");
  if (tail === undefined) return paragraph;
  return `${head}.${tail.replace(/^0+/, "") || "0"}`;
}

interface RawMatch {
  kind: RequirementKind;
  paragraph: string;
  subparagraph?: string;
  raw: string;
  index: number;
}

/**
 * Forme du motif :
 *  - "paragraph" : un numero de paragraphe et un sous-alinea optionnel (CS, JAR, AMC, FAR) ;
 *  - "item" : une lettre et un numero, reassembles (CRI, SC, ESF).
 */
type MatchShape = "paragraph" | "item";

function cleanSubparagraph(sub: string | undefined): string | undefined {
  if (!sub) return undefined;
  const cleaned = sub.replace(/\s+/g, "").toLowerCase();
  return cleaned.length ? cleaned : undefined;
}

function collect(
  text: string,
  regex: RegExp,
  kind: RequirementKind,
  shape: MatchShape,
): RawMatch[] {
  const out: RawMatch[] = [];
  regex.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const paragraph =
      shape === "item"
        ? `${m[1].toUpperCase()}-${m[2]}`
        : normalizeParagraph(m[1].replace(/\s+/g, ""));

    out.push({
      kind,
      paragraph,
      subparagraph: shape === "paragraph" ? cleanSubparagraph(m[2]) : undefined,
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
  if (kind === "CRI" || kind === "SC" || kind === "ESF") {
    return `${kind} ${paragraph.toUpperCase()}`;
  }
  return `${kind} ${normalizeParagraph(paragraph)}${subparagraph ?? ""}`;
}

/**
 * Moyens de conformite cites dans un fragment de texte.
 *
 * Les formes rencontrees vont bien au-dela des codes numeriques : "MoC 4,6"
 * pour un document qui en couvre deux, "MoC S" pour une famille interne,
 * "Mean of Compliance n°1" en toutes lettres. Un identifiant est donc soit un
 * chiffre, soit une lettre, et jamais une valeur devinee.
 */
const RE_MOC_INTRO =
  /\b(?:M(?:C|oC)s?|Means?\s+of\s+[Cc]ompliance|Moyens?\s+de\s+conformite)\s*(?:n\s*°|no\.?|#)?\s*[:=]?\s*/gi;

/** Un identifiant de MoC : un chiffre, ou une lettre isolee. */
const RE_MOC_ID = /^(?:[0-9]|[A-Z])$/;

/** Separateurs admis entre deux identifiants d'une meme liste. */
const RE_MOC_SEPARATOR = /^(?:[,;/&+]|and|et)$/i;

export function extractMocIds(fragment: string): MocId[] {
  const found = new Set<MocId>();

  RE_MOC_INTRO.lastIndex = 0;
  let intro: RegExpExecArray | null;
  while ((intro = RE_MOC_INTRO.exec(fragment)) !== null) {
    const after = fragment.slice(intro.index + intro[0].length);
    // On avance tant qu'on lit des identifiants separes par des separateurs
    // admis, et on s'arrete au premier jeton qui n'en est pas un : "MoC 2, that
    // participates" ne doit pas absorber le mot suivant.
    const tokens = after.split(/\s+/).flatMap((word) => word.split(/([,;/&+])/)).filter(Boolean);

    let expectId = true;
    for (const token of tokens) {
      const clean = token.replace(/[.:]$/, "");
      if (expectId) {
        if (!RE_MOC_ID.test(clean)) break;
        found.add(clean.toUpperCase());
        expectId = false;
      } else if (RE_MOC_SEPARATOR.test(clean)) {
        expectId = true;
      } else {
        break;
      }
    }
  }

  return [...found].sort();
}

/** Qualifieur ("Amdt 23", "ch. 11") lu juste apres la reference. */
function qualifierNear(text: string, index: number, raw: string): string | undefined {
  const window = text.slice(index + raw.length, index + raw.length + 24);
  const m = RE_QUALIFIER.exec(window);
  if (!m) return undefined;
  return m[1] ? `Amdt ${m[2]}` : `ch. ${m[4]}`;
}

/** Appendices cites juste apres la reference, pour les CRI notamment. */
function appendicesNear(text: string, index: number, raw: string): string[] | undefined {
  const window = text.slice(index + raw.length, index + raw.length + 40);
  const m = RE_APPENDIX.exec(window);
  const numbers = m?.[1].match(/\d{1,2}/g);
  return numbers?.length ? numbers : undefined;
}

/** Une ligne se terminant par un debut de reference se poursuit sur la suivante. */
const RE_DANGLING_REF = /\b(?:CS|JAR|AMC|FAR|CFR|SC|CRI|ESF)[\s-]?\d{0,2}\.?\s*$/i;

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
      ...collect(segment, RE_CS, "CS", "paragraph"),
      ...collect(segment, RE_JAR, "JAR", "paragraph"),
      ...collect(segment, RE_AMC, "AMC", "paragraph"),
      ...collect(segment, RE_FAR, "FAR", "paragraph"),
      ...collect(segment, RE_CRI, "CRI", "item"),
      ...collect(segment, RE_SC, "SC", "item"),
      ...collect(segment, RE_ESF, "ESF", "item"),
    ].sort((a, b) => a.index - b.index);

    // "Special Condition F-12" matche aussi SC ; on ecarte les doublons de position.
    const seenPositions = new Set<number>();

    // Les MoC sont cherches dans la ligne de la citation, et dans la ligne
    // suivante uniquement si celle-ci est dediee aux moyens de conformite.
    const next = segments[segmentIndex + 1];
    let mocScope = segment;
    if (!extractMocIds(segment).length && next && RE_MOC_CONTINUATION.test(next)) {
      mocScope = `${segment} ${next}`;
    }
    const mocIds = extractMocIds(mocScope);

    for (const match of matches) {
      if (seenPositions.has(match.index)) continue;
      seenPositions.add(match.index);

      occurrences.push({
        id: formatRequirementId(match.kind, match.paragraph, match.subparagraph),
        kind: match.kind,
        paragraph: match.paragraph,
        subparagraph: match.subparagraph,
        qualifier: qualifierNear(segment, match.index, match.raw),
        appendices: appendicesNear(segment, match.index, match.raw),
        raw: match.raw,
        page,
        context: segment,
        // Une ligne citant plusieurs exigences ne permet pas d'attribuer les MoC
        // a l'une plutot qu'a l'autre : on ne devine pas, on laisse vide.
        mocIds: matches.length > 1 ? [] : mocIds,
      });
    }
  });

  return occurrences;
}

/**
 * Deduplique les occurrences en exigences uniques.
 * Les qualifieurs et appendices rencontres sont conserves a la premiere
 * occurrence qui les porte.
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
        qualifier: occ.qualifier,
        appendices: occ.appendices,
        raw: occ.raw,
      });
    } else {
      existing.qualifier ??= occ.qualifier;
      existing.appendices ??= occ.appendices;
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
  const kindOrder: RequirementKind[] = ["CS", "JAR", "AMC", "FAR", "SC", "CRI", "ESF"];
  return [...refs].sort((a, b) => {
    const byKind = kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind);
    if (byKind !== 0) return byKind;
    const numA = Number(a.paragraph.replace(/[^0-9.]/g, "").split(".")[1] ?? 0);
    const numB = Number(b.paragraph.replace(/[^0-9.]/g, "").split(".")[1] ?? 0);
    if (numA !== numB) return numA - numB;
    return (a.subparagraph ?? "").localeCompare(b.subparagraph ?? "");
  });
}

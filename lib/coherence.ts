/**
 * Verification de coherence des renvois : un chapitre cite correspond-il
 * reellement au contenu du document cite ?
 *
 * C'est le controle le plus couteux a faire a la main (il faut ouvrir chaque
 * document de substantiation et verifier chaque renvoi un par un) et c'est
 * entierement mecanisable. Aucune IA : comparaison lexicale deterministe.
 */
import { normalizeExtractedText } from "./requirements";
import type { ChapterCitation, CheckResult, DocumentChapter, PdfPage } from "./types";

const DOC_REF = String.raw`[A-Z]{2,4}-\d{2}-[A-Z]{2,4}-\d{3,5}`;
const RE_DOC_REF = new RegExp(DOC_REF, "g");
const RE_ISSUE_NEAR = /\b(?:Iss(?:ue)?\.?|Rev\.?|Indice)\s*([0-9]{1,3}[A-Z]?)/i;

/** Reperage des renvois de chapitre : §4.3.2, chapter 4.3, para. 5.1, section 2. */
const RE_CHAPTER_TOKEN =
  /(?:§+\s*|\b(?:chapters?|chapitres?|sections?|paras?graphs?|paras?\.?|clauses?)\s+)(\d+(?:\.\d+){0,4})\b/gi;

const STOPWORDS = new Set([
  "le", "la", "les", "de", "des", "du", "un", "une", "et", "ou", "a", "au", "aux",
  "pour", "par", "dans", "sur", "the", "of", "and", "or", "for", "in", "on", "to",
  "with", "at", "as", "is", "are", "be", "by", "from", "this", "that",
]);

/** Tokenisation robuste aux accents, a la casse et a la ponctuation. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

/**
 * Similarite lexicale entre deux libelles, dans [0, 1].
 * Indice de Jaccard sur les tokens significatifs : symetrique et reproductible.
 */
export function titleSimilarity(a: string, b: string): number {
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));
  if (!tokensA.size || !tokensB.size) return 0;

  let intersection = 0;
  for (const token of tokensA) if (tokensB.has(token)) intersection += 1;
  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Une ligne de sommaire ("4.3.2 Titre ......... 14") n'est pas un vrai chapitre. */
function isTableOfContentsLine(line: string): boolean {
  return /\.{3,}\s*\d{1,4}\s*$/.test(line) || /\s{3,}\d{1,4}\s*$/.test(line);
}

const RE_HEADING = /^(\d+(?:\.\d+){0,4})\.?\s+(\S.{2,140})$/;

/**
 * Reconstitue la structure en chapitres d'un document a partir de ses pages.
 * Les titres sont detectes en debut de ligne ; le corps court jusqu'au titre suivant.
 */
export function extractChapters(pages: PdfPage[]): DocumentChapter[] {
  const chapters: DocumentChapter[] = [];
  let current: DocumentChapter | undefined;

  for (const { page, text } of pages) {
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;

      const heading = line.match(RE_HEADING);
      const isHeading =
        heading !== null &&
        !isTableOfContentsLine(line) &&
        /[a-zA-Z]{3}/.test(heading[2]) &&
        // Un titre ne se termine pas par un point de phrase.
        !/[.;,]$/.test(heading[2].trim());

      if (isHeading) {
        current = {
          number: heading[1],
          title: normalizeExtractedText(heading[2]),
          page,
          body: "",
        };
        chapters.push(current);
      } else if (current) {
        // Corps borne : on ne garde que de quoi controler la presence de mots-cles.
        if (current.body.length < 4000) {
          current.body = `${current.body} ${line}`.trim();
        }
      }
    }
  }

  return chapters;
}

/**
 * Releve les renvois de chapitre d'un texte, avec le document et le titre
 * annonces a proximite immediate.
 */
export function extractCitations(rawText: string): ChapterCitation[] {
  const text = normalizeExtractedText(rawText);
  const citations: ChapterCitation[] = [];

  RE_CHAPTER_TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = RE_CHAPTER_TOKEN.exec(text)) !== null) {
    const chapter = match[1];
    const windowStart = Math.max(0, match.index - 160);
    const windowEnd = Math.min(text.length, match.index + match[0].length + 160);
    const before = text.slice(windowStart, match.index);
    const after = text.slice(match.index + match[0].length, windowEnd);

    citations.push({
      chapter,
      documentRef: nearestDocRef(before, after),
      documentIssue: RE_ISSUE_NEAR.exec(`${before} ${after}`)?.[1],
      claimedTitle: claimedTitleNear(after, before),
      raw: text.slice(windowStart, windowEnd).trim(),
    });
  }

  return citations;
}

/**
 * Fenetre avant, volontairement courte.
 * Un renvoi s'ecrit "DOC-X chapitre Y" (reference en amont) ou "chapitre Y de
 * DOC-X" (reference immediatement en aval). Chercher plus loin en aval
 * rattacherait "section 2" a la reference documentaire du renvoi suivant.
 */
const FORWARD_DOC_REF_WINDOW = 40;

/** Reference documentaire la plus proche du renvoi, en privilegiant l'amont. */
function nearestDocRef(before: string, after: string): string | undefined {
  const beforeRefs = [...before.matchAll(RE_DOC_REF)];
  if (beforeRefs.length) return beforeRefs[beforeRefs.length - 1][0];

  // La reference doit appartenir a la meme phrase que le renvoi : une
  // reference situee apres un point termine une autre proposition et concerne
  // un autre renvoi.
  const forward = after.slice(0, FORWARD_DOC_REF_WINDOW).split(/[.;:]\s/)[0];
  const afterMatch = new RegExp(DOC_REF).exec(forward);
  return afterMatch?.[0];
}

/** Guillemets ouvrants et fermants rencontres dans les documents FR et EN. */
const QUOTE_CHARS = "«»“”„‘’‹›\"'";
const OPENING_QUOTED_TITLE = new RegExp(
  `^\\s*[${QUOTE_CHARS}]\\s*([^${QUOTE_CHARS}]{3,140})\\s*[${QUOTE_CHARS}]`,
);
const TRAILING_QUOTED_TITLE = new RegExp(
  `[${QUOTE_CHARS}]\\s*([^${QUOTE_CHARS}]{3,140})\\s*[${QUOTE_CHARS}]\\s*$`,
);

/**
 * Titre annonce par la citation : entre guillemets, ou entre parentheses,
 * ou introduit par un tiret juste apres le numero de chapitre.
 */
function claimedTitleNear(after: string, before: string): string | undefined {
  const quoted =
    after.match(OPENING_QUOTED_TITLE) ?? before.match(TRAILING_QUOTED_TITLE);
  if (quoted) return normalizeExtractedText(quoted[1]);

  const parenthesised = after.match(/^\s*\(([^)]{3,140})\)/);
  if (parenthesised) return normalizeExtractedText(parenthesised[1]);

  const dashed = after.match(/^\s*[-–—]\s*([A-Za-z][^.;()]{2,140})/);
  if (dashed) return normalizeExtractedText(dashed[1]);

  return undefined;
}

/** Seuils de decision de la comparaison de titres. */
export const SIMILARITY_OK = 0.6;
export const SIMILARITY_DOUBT = 0.3;

export interface CoherenceOptions {
  /** Reference du document de substantiation reellement fourni. */
  actualDocumentRef?: string;
  /** Issue du document reellement fourni. */
  actualDocumentIssue?: string;
}

/**
 * Confronte chaque renvoi a la structure reelle du document fourni.
 * Retourne un diagnostic par renvoi, jamais une correction automatique.
 */
export function checkCitations(
  citations: ChapterCitation[],
  chapters: DocumentChapter[],
  options: CoherenceOptions = {},
): CheckResult[] {
  const byNumber = new Map(chapters.map((chapter) => [chapter.number, chapter]));
  const results: CheckResult[] = [];

  citations.forEach((citation, index) => {
    const id = `coherence.${index}.${citation.chapter}`;

    // Sans reference documentaire a proximite, le renvoi designe le document
    // courant ("voir section 2"). Le controle ne s'applique pas.
    if (options.actualDocumentRef && !citation.documentRef) {
      results.push({
        id: `${id}.internal`,
        status: "info",
        label: `Renvoi interne (section ${citation.chapter})`,
        detail:
          "Aucun document n'est cite a proximite : le renvoi est considere comme interne au document analyse, il n'a pas ete confronte au document de substantiation.",
        location: { section: citation.chapter },
      });
      return;
    }

    if (
      options.actualDocumentRef &&
      citation.documentRef &&
      citation.documentRef !== options.actualDocumentRef
    ) {
      results.push({
        id: `${id}.document`,
        status: "info",
        label: `Renvoi vers un autre document (${citation.documentRef})`,
        detail: `Le renvoi cite ${citation.documentRef}, le PDF fourni est ${options.actualDocumentRef}. Controle non effectue.`,
        location: { section: citation.chapter },
        suggestion: "Fournir le PDF correspondant pour verifier ce renvoi.",
      });
      return;
    }

    const chapter = byNumber.get(citation.chapter);
    if (!chapter) {
      const nearby = suggestNearestChapters(citation.chapter, chapters);
      results.push({
        id: `${id}.missing`,
        status: "error",
        label: `Chapitre ${citation.chapter} introuvable`,
        detail: `Le document fourni ne contient pas de chapitre ${citation.chapter}.${
          nearby.length ? ` Chapitres voisins : ${nearby.join(", ")}.` : ""
        }`,
        location: { section: citation.chapter },
        suggestion: nearby.length
          ? `Verifier s'il s'agit de ${nearby[0]}.`
          : "Verifier la reference du chapitre cite.",
      });
      return;
    }

    if (
      options.actualDocumentIssue &&
      citation.documentIssue &&
      citation.documentIssue !== options.actualDocumentIssue
    ) {
      results.push({
        id: `${id}.issue`,
        status: "warning",
        label: `Issue citee obsolete (${citation.documentIssue})`,
        detail: `Le renvoi cite l'issue ${citation.documentIssue}, le document fourni est en issue ${options.actualDocumentIssue}.`,
        location: { page: chapter.page, section: citation.chapter },
        suggestion: `Mettre a jour le renvoi vers l'issue ${options.actualDocumentIssue}.`,
      });
    }

    if (!citation.claimedTitle) {
      results.push({
        id: `${id}.exists`,
        status: "info",
        label: `Chapitre ${citation.chapter} present, titre non annonce`,
        detail: `Chapitre trouve page ${chapter.page} : "${chapter.title}". Le renvoi n'annonce pas de titre, la coherence du contenu n'a pas pu etre controlee.`,
        location: { page: chapter.page, section: citation.chapter },
        suggestion: "Ajouter le titre du chapitre dans le renvoi pour permettre le controle.",
      });
      return;
    }

    const score = titleSimilarity(citation.claimedTitle, chapter.title);
    const percent = Math.round(score * 100);

    if (score >= SIMILARITY_OK) {
      results.push({
        id: `${id}.ok`,
        status: "ok",
        label: `Chapitre ${citation.chapter} coherent (${percent} %)`,
        detail: `Renvoi : "${citation.claimedTitle}". Document page ${chapter.page} : "${chapter.title}".`,
        location: { page: chapter.page, section: citation.chapter },
      });
      return;
    }

    // Titre eloigne : le renvoi pointe peut-etre le bon contenu sous un autre libelle.
    const keywordsInBody = tokenize(citation.claimedTitle).filter((token) =>
      chapter.body.toLowerCase().includes(token),
    );
    const status = score >= SIMILARITY_DOUBT || keywordsInBody.length >= 2 ? "warning" : "error";

    results.push({
      id: `${id}.mismatch`,
      status,
      label: `Titre du chapitre ${citation.chapter} divergent (${percent} %)`,
      detail:
        `Renvoi : "${citation.claimedTitle}". Document page ${chapter.page} : "${chapter.title}".` +
        (keywordsInBody.length
          ? ` Termes du renvoi retrouves dans le corps du chapitre : ${keywordsInBody.join(", ")}.`
          : " Aucun terme du renvoi retrouve dans le corps du chapitre."),
      location: { page: chapter.page, section: citation.chapter },
      suggestion:
        status === "error"
          ? "Renvoi probablement errone : verifier le numero de chapitre."
          : "Verifier que le renvoi designe bien ce contenu.",
    });
  });

  if (!results.length) {
    results.push({
      id: "coherence.none",
      status: "info",
      label: "Aucun renvoi detecte",
      detail:
        "Aucun renvoi de chapitre n'a ete trouve dans le texte fourni (formats reconnus : §4.3.2, chapter 4.3, para. 5.1).",
    });
  }

  return results;
}

/** Chapitres les plus proches d'un numero absent : parent, puis meme prefixe. */
function suggestNearestChapters(target: string, chapters: DocumentChapter[]): string[] {
  const parts = target.split(".");
  const parent = parts.slice(0, -1).join(".");
  const candidates = new Set<string>();

  for (const chapter of chapters) {
    if (parent && chapter.number === parent) candidates.add(chapter.number);
  }
  for (const chapter of chapters) {
    if (parent && chapter.number.startsWith(`${parent}.`)) candidates.add(chapter.number);
  }
  return [...candidates].slice(0, 4);
}

/** Compteurs par statut, pour les bandeaux de synthese de l'interface. */
export function summarize(results: CheckResult[]): Record<string, number> {
  return results.reduce<Record<string, number>>((acc, result) => {
    acc[result.status] = (acc[result.status] ?? 0) + 1;
    return acc;
  }, {});
}

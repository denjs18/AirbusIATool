/**
 * Recherche du chapitre qui repond, dans le document joint.
 *
 * C'est le dernier geste reellement manuel de la preparation d'une coversheet :
 * ouvrir le document, parcourir des dizaines de pages, et retrouver ou se
 * trouve ce que la redaction annonce. L'outil ne peut pas le decider a la place
 * de l'ingenieur, mais il peut lui proposer les chapitres les plus proches et
 * dire pourquoi.
 *
 * Deux principes, qui ne bougeront pas quelle que soit la methode de calcul :
 *
 *  - Le classement est une PROPOSITION. Rien n'est jamais rempli tout seul.
 *  - Le classement est EXPLIQUE : chaque candidat affiche les termes qui l'ont
 *    fait remonter. Une suggestion qu'on ne peut pas critiquer n'a pas sa place
 *    dans une chaine de certification.
 *
 * La methode de calcul, elle, est remplacable : voir ChapterScorer. La version
 * lexicale ci-dessous ne demande aucun telechargement et reste deterministe ;
 * une version semantique (vecteurs calcules localement) viendra derriere la
 * meme interface, sans rien changer a l'interface utilisateur.
 */
import { tokenize } from "./coherence";
import { splitPlaceholders } from "./placeholders";
import type { DocumentChapter } from "./types";

/** Chapitre candidat, avec de quoi juger la proposition. */
export interface ScoredChapter {
  chapter: DocumentChapter;
  /** Score brut. Comparable entre candidats d'une meme recherche, pas au-dela. */
  score: number;
  /** Termes de la requete retrouves dans ce chapitre, par ordre de poids. */
  matched: string[];
}

/**
 * Methode de classement. Asynchrone des maintenant : une methode semantique
 * doit charger son modele, et l'interface ne doit pas changer ce jour-la.
 */
export interface ChapterScorer {
  id: string;
  label: string;
  rank(query: string, chapters: DocumentChapter[]): Promise<ScoredChapter[]>;
}

/**
 * Requete associee a un repere.
 *
 * La phrase qui entoure le repere EST la question : "The SyDMP references in
 * §x.x the other plans describing the activities to be performed" demande le
 * chapitre qui liste les plans. L'utilisateur n'a donc rien a saisir.
 *
 * On decoupe a la proposition et non a la phrase, parce qu'une phrase porte
 * souvent deux reperes ("classified in §x.x, and probabilities demonstrated in
 * §x.x") : prendre la phrase entiere donnerait deux fois la meme requete, donc
 * deux fois le meme classement, ce qui n'aiderait personne.
 */
const CLAUSE_BREAK = /(?:[.!?]|;|,\s+(?:and|or|et|ou|which|while)\b)/gi;

/** Nombre minimal de termes significatifs pour qu'une requete vaille la peine. */
const MIN_QUERY_TOKENS = 3;

/**
 * Caractere neutre substitue aux reperes pendant l'analyse.
 *
 * Indispensable : un repere s'ecrit "§x.x" et porte donc un point. Laisse tel
 * quel, ce point est lu comme une fin de phrase et coupe la requete en plein
 * milieu ("...demonstrated in §x"), ce qui prive la recherche de la moitie de
 * sa question.
 */
const SLOT_SENTINEL = "\u0001";

function tidy(text: string): string {
  return text.split(SLOT_SENTINEL).join(" ").replace(/\s+/g, " ").trim();
}

export function queryForSlot(text: string, slotIndex: number): string {
  let plain = "";
  let found: number | undefined;

  // Texte sans les reperes ni leurs indications : ni l'un ni l'autre ne fait
  // partie de la question posee au document.
  for (const part of splitPlaceholders(text)) {
    if (part.kind === "text") {
      plain += part.text;
      continue;
    }
    if (part.index === slotIndex) found = plain.length;
    plain += SLOT_SENTINEL;
  }
  if (found === undefined) return "";

  // Bornes de la proposition qui contient le repere.
  CLAUSE_BREAK.lastIndex = 0;
  let start = 0;
  let end = plain.length;
  let match: RegExpExecArray | null;
  while ((match = CLAUSE_BREAK.exec(plain)) !== null) {
    if (match.index + match[0].length <= found) {
      start = match.index + match[0].length;
    } else {
      end = match.index;
      break;
    }
  }

  let segment = plain.slice(start, end);

  // Deux reperes dans une meme proposition, sans virgule pour les separer :
  // "tests (§x.x) and the good functioning in flight test (§x.x)". Leur donner
  // la proposition entiere reviendrait a poser deux fois la meme question. On
  // resserre alors sur les mots qui entourent le repere.
  if (segment.split(SLOT_SENTINEL).length > 2) {
    segment = windowAround(segment, found - start);
  }

  const clause = tidy(segment);
  // Proposition trop maigre pour discriminer : on reprend le texte entier.
  return tokenize(clause).length >= MIN_QUERY_TOKENS ? clause : tidy(plain);
}

/** Mots conserves de part et d'autre du repere quand la proposition en porte plusieurs. */
const WINDOW_WORDS = 6;

/** Fenetre de mots centree sur une position, sans couper de mot. */
function windowAround(segment: string, position: number): string {
  const words = [...segment.matchAll(/\S+/g)];
  if (!words.length) return segment;

  let center = words.findIndex((word) => (word.index ?? 0) >= position);
  if (center < 0) center = words.length - 1;

  const first = Math.max(0, center - WINDOW_WORDS);
  const last = Math.min(words.length, center + WINDOW_WORDS + 1);
  return words
    .slice(first, last)
    .map((word) => word[0])
    .join(" ");
}

/* ------------------------------------------------------------------ */
/* Classement lexical                                                  */
/* ------------------------------------------------------------------ */

/**
 * Mots de structure, sans valeur discriminante.
 *
 * Ils s'ajoutent a ceux deja ecartes par tokenize. Sur un corpus de quelques
 * dizaines de chapitres, un auxiliaire rare prendrait un poids eleve et ferait
 * remonter un chapitre pour de mauvaises raisons.
 */
const EXTRA_STOPWORDS = new Set([
  "have", "has", "had", "been", "being", "was", "were", "will", "shall", "can",
  "could", "may", "might", "must", "should", "would", "its", "their", "there",
  "these", "those", "such", "any", "all", "not", "also", "into", "each", "other",
  "which", "while", "when", "where", "then", "than", "here", "both", "same",
]);

/**
 * Racine approchee d'un terme.
 *
 * L'anglais technique fait alterner "classified" et "classification",
 * "failure" et "failures", "demonstrate" et "demonstrated". Sans rapprochement
 * morphologique, une recherche lexicale rate la moitie des correspondances
 * evidentes.
 *
 * Le procede est volontairement grossier : pluriel retire, puis troncature a
 * six caracteres. Un vrai desuffixage (Porter) ne rapprocherait toujours pas
 * "classifi" de "classific" ; la troncature, si. Elle rapproche aussi quelques
 * mots sans rapport ("particulier" et "particule"), ce qui reste sans gravite
 * pour une proposition classee que l'ingenieur juge.
 *
 * C'est exactement ce bricolage qu'une recherche semantique rendra inutile :
 * elle compare des sens, pas des chaines de caracteres.
 */
const STEM_LENGTH = 6;

export function stemKey(token: string): string {
  let root = token;
  if (root.endsWith("ies") && root.length > 4) root = `${root.slice(0, -3)}y`;
  else if (/(?:sses|shes|ches|xes)$/.test(root)) root = root.slice(0, -2);
  else if (root.endsWith("s") && !/(?:ss|us)$/.test(root) && root.length > 3) {
    root = root.slice(0, -1);
  }
  return root.slice(0, STEM_LENGTH);
}

/** Racines d'un texte, dans l'ordre, doublons compris (les frequences comptent). */
function stems(text: string): string[] {
  return tokenize(text)
    .filter((token) => !EXTRA_STOPWORDS.has(token))
    .map(stemKey);
}

/** Poids du titre : un chapitre dont le titre repond est un meilleur candidat. */
const TITLE_WEIGHT = 3;

// Parametres BM25 usuels. Ils ne sont pas regles finement : a cette echelle
// (quelques dizaines de chapitres) le classement est robuste a leur valeur.
const K1 = 1.2;
const B = 0.75;

interface IndexedChapter {
  chapter: DocumentChapter;
  freq: Map<string, number>;
  length: number;
}

function indexChapter(chapter: DocumentChapter): IndexedChapter {
  const title = stems(chapter.title);
  const tokens = [
    ...Array.from({ length: TITLE_WEIGHT }, () => title).flat(),
    ...stems(chapter.body),
  ];
  const freq = new Map<string, number>();
  for (const token of tokens) freq.set(token, (freq.get(token) ?? 0) + 1);
  return { chapter, freq, length: tokens.length };
}

/**
 * Classement lexical BM25 sur titre et corps.
 *
 * Deterministe et sans dependance : meme document, meme requete, meme ordre.
 * Sa limite est connue et assumee : il ne rapproche que des mots partages. Un
 * chapitre qui dit la meme chose avec d'autres mots ne remonte pas. C'est
 * exactement ce qu'une recherche semantique apportera.
 */
export function rankLexical(
  query: string,
  chapters: DocumentChapter[],
  limit = 5,
): ScoredChapter[] {
  // Racine -> mot d'origine, pour que l'explication affiche le mot de la
  // requete et non sa troncature.
  const wordOf = new Map<string, string>();
  for (const word of tokenize(query).filter((token) => !EXTRA_STOPWORDS.has(token))) {
    const key = stemKey(word);
    if (!wordOf.has(key)) wordOf.set(key, word);
  }
  const terms = [...wordOf.keys()];
  if (!terms.length || !chapters.length) return [];

  const indexed = chapters.map(indexChapter);
  const averageLength =
    indexed.reduce((sum, entry) => sum + entry.length, 0) / indexed.length || 1;

  const idf = new Map<string, number>();
  for (const term of terms) {
    const documentFrequency = indexed.filter((entry) => entry.freq.has(term)).length;
    idf.set(
      term,
      Math.log(1 + (indexed.length - documentFrequency + 0.5) / (documentFrequency + 0.5)),
    );
  }

  const scored = indexed.map((entry) => {
    const contributions: { term: string; weight: number }[] = [];
    let score = 0;

    for (const term of terms) {
      const frequency = entry.freq.get(term) ?? 0;
      if (!frequency) continue;
      const weight =
        (idf.get(term) ?? 0) *
        ((frequency * (K1 + 1)) /
          (frequency + K1 * (1 - B + (B * entry.length) / averageLength)));
      score += weight;
      contributions.push({ term, weight });
    }

    contributions.sort((a, b) => b.weight - a.weight);
    return {
      chapter: entry.chapter,
      score,
      matched: contributions.map(
        (contribution) => wordOf.get(contribution.term) ?? contribution.term,
      ),
    };
  });

  return scored
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) =>
      b.score - a.score ||
      // Depart a egalite stable : l'ordre du document, pour que deux executions
      // identiques donnent exactement la meme liste.
      a.chapter.number.localeCompare(b.chapter.number, "en", { numeric: true }),
    )
    .slice(0, limit);
}

export const lexicalScorer: ChapterScorer = {
  id: "lexical",
  label: "Recherche lexicale",
  rank: async (query, chapters) => rankLexical(query, chapters),
};

/** Classement des chapitres candidats pour un repere donne. */
export async function suggestForSlot(
  text: string,
  slotIndex: number,
  chapters: DocumentChapter[],
  scorer: ChapterScorer = lexicalScorer,
): Promise<ScoredChapter[]> {
  const query = queryForSlot(text, slotIndex);
  if (!query) return [];
  return scorer.rank(query, chapters);
}

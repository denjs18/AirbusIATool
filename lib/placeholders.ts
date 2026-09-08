/**
 * Reperes de paragraphe d'une redaction.
 *
 * Le redacteur ecrit "§x.x" la ou un chapitre du document joint devra etre
 * pointe. D'une issue a l'autre le document est reedite : le chapitre change de
 * numero, mais rarement de place. L'endroit ou il se trouvait dans l'issue
 * precedente est donc l'indication la plus utile pour le retrouver.
 *
 * Cette indication s'ecrit entre crochets, collee au repere : "§x.x[5.4]".
 *
 * Collee plutot que rangee dans une colonne separee, pour une raison precise :
 * une liste "5.4 ; 9 ; 2.1" mise en face du texte se decale d'un cran des qu'un
 * repere est insere au milieu, sans que rien ne le signale, et l'indication
 * designe alors le mauvais paragraphe. Attachee au repere, elle ne peut pas se
 * desynchroniser.
 *
 * L'indication est une aide a la recherche, jamais une reponse : elle vient
 * d'une edition anterieure du document et doit etre verifiee. Elle ne sort donc
 * jamais dans la coversheet produite.
 */

/**
 * Un repere, avec son indication facultative.
 *
 * La partie "[...]" est optionnelle : sans elle, le repere se comporte comme
 * avant, ce qui laisse les redactions deja ecrites valables telles quelles.
 *
 * Le repere ne se termine jamais par un point. Sans cette precaution, un repere
 * place en fin de phrase ("demonstrated in §x.x.") avale la ponctuation : le
 * chapitre saisi remplacait alors le repere ET le point, et la coversheet
 * partait avec une phrase sans fin.
 */
const PLACEHOLDER_SOURCE = String.raw`§\s*[\dxX]*[xX](?:[\dxX.]*[\dxX])?(?:\s*\[\s*([^\]\n]{1,80}?)\s*\])?`;

/** Motif global. Recree a chaque usage : un motif global garde son lastIndex. */
export function placeholderPattern(): RegExp {
  return new RegExp(PLACEHOLDER_SOURCE, "g");
}

export const PLACEHOLDER_PATTERN = placeholderPattern();

export function countPlaceholders(text: string | undefined): number {
  if (!text) return 0;
  return text.match(placeholderPattern())?.length ?? 0;
}

/** Repere isole dans une redaction. */
export interface PlaceholderSlot {
  kind: "slot";
  /** Rang du repere dans le texte, a partir de 0. Sert de cle de saisie. */
  index: number;
  /** Chapitre ou se trouvait l'information dans une edition anterieure. */
  hint?: string;
  /** Repere seul, indication retiree : ce qui ressort tant que rien n'est saisi. */
  marker: string;
}

interface LiteralPart {
  kind: "text";
  text: string;
}

export type TextPart = LiteralPart | PlaceholderSlot;

/**
 * Decoupe une redaction en morceaux de texte et en reperes.
 *
 * Permet d'afficher la phrase telle qu'elle est ecrite, avec un champ de saisie
 * a la place de chaque repere : on remplit le trou en le lisant dans son
 * contexte, plutot que dans une liste detachee du texte.
 */
export function splitPlaceholders(text: string): TextPart[] {
  const parts: TextPart[] = [];
  const pattern = placeholderPattern();
  let cursor = 0;
  let index = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      parts.push({ kind: "text", text: text.slice(cursor, match.index) });
    }
    const hint = match[1]?.trim();
    parts.push({
      kind: "slot",
      index,
      hint: hint || undefined,
      // Le repere sans son indication : "§x.x[5.4]" laisse "§x.x".
      marker: match[0].replace(/\s*\[[^\]]*\]$/, ""),
    });
    cursor = match.index + match[0].length;
    index += 1;
  }

  if (cursor < text.length) parts.push({ kind: "text", text: text.slice(cursor) });
  return parts;
}

/** Indications rencontrees, dans l'ordre des reperes. */
export function placeholderHints(text: string | undefined): (string | undefined)[] {
  if (!text) return [];
  return splitPlaceholders(text)
    .filter((part): part is PlaceholderSlot => part.kind === "slot")
    .map((slot) => slot.hint);
}

/** Normalise ce que l'utilisateur saisit : "§5.4", " 5.4 " et "5.4" se valent. */
export function normalizeChapter(value: string): string {
  return value.trim().replace(/^§\s*/, "").trim();
}

/**
 * Remplace les reperes par les chapitres saisis.
 *
 * Un repere sans saisie reste un repere, indication retiree : la coversheet
 * produite montre alors "§x.x", donc un trou visible en relecture. Une
 * indication laissee dans le document final se lirait comme un chapitre cite,
 * alors qu'elle vient d'une edition anterieure et n'a pas ete verifiee.
 */
export function fillPlaceholders(
  text: string,
  values: Record<number, string | undefined>,
): string {
  return splitPlaceholders(text)
    .map((part) => {
      if (part.kind === "text") return part.text;
      const value = normalizeChapter(values[part.index] ?? "");
      return value ? `§${value}` : part.marker;
    })
    .join("");
}

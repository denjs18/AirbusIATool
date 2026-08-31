/**
 * Modele de donnees du POC.
 *
 * Volontairement independant de tout format de fichier Airbus : les parsers
 * (lib/parse-acp.ts, lib/pdf.ts) convertissent le texte extrait vers ces types,
 * et tout le reste de l'outil ne travaille que sur ces structures.
 */

/** Reference reglementaire citee dans un document de certification. */
export type RequirementKind =
  | "CS" // CS-25 paragraph, ex. CS 25.671
  | "JAR" // JAR-25 paragraph, ex. JAR 25.1301(a) ch. 11
  | "AMC" // Acceptable Means of Compliance, ex. AMC 25.1309
  | "SC" // Special Condition
  | "CRI" // Certification Review Item
  | "ESF" // Equivalent Safety Finding
  | "FAR"; // 14 CFR Part 25, si double certification

export interface RequirementRef {
  /** Forme normalisee, ex. "CS 25.671(c)". Sert de cle de rapprochement. */
  id: string;
  kind: RequirementKind;
  /** Numero de paragraphe sans le prefixe, ex. "25.671". */
  paragraph: string;
  /** Sous-alinea eventuel, ex. "(c)(2)". */
  subparagraph?: string;
  /**
   * Version de l'exigence citee a proximite : amendement pour un paragraphe CS
   * ("Amdt 23"), chapitre pour un paragraphe JAR ("ch. 11"). Les deux jouent le
   * meme role et ne sont pas reduits l'un a l'autre.
   */
  qualifier?: string;
  /**
   * Appendices cites, pour les CRI notamment. Un meme CRI interprete par deux
   * appendices differents donne lieu a deux justifications distinctes dans une
   * coversheet : l'appendice fait donc partie de la citation.
   */
  appendices?: string[];
  /** Texte exact tel que rencontre dans le document source. */
  raw: string;
}

/** Occurrence d'une exigence dans un document, avec sa localisation. */
export interface RequirementOccurrence extends RequirementRef {
  page: number;
  /** Extrait de contexte pour permettre la relecture humaine. */
  context: string;
  /** Moyens de conformite detectes dans le contexte immediat. */
  mocIds: MocId[];
  /** Titre de section du document ou l'occurrence a ete trouvee, si connu. */
  section?: string;
}

/**
 * Identifiant de moyen de conformite.
 *
 * "0".."9" pour les MoC EASA, mais pas seulement : les plans rencontres
 * utilisent aussi des lettres pour designer une famille de documents (ex.
 * "S" pour une synthese de validation et verification couvrant les MoC 4 et 6).
 * Le type reste donc ouvert, et seuls les MoC connus portent une definition.
 */
export type MocId = string;

export interface MocDefinition {
  id: MocId;
  labelFr: string;
  labelEn: string;
  /** Documents de substantiation typiquement attendus pour ce MoC. */
  expectedEvidence: string[];
}

/** En-tete normalise d'un document de certification (coversheet, ACP, OCP). */
export interface DocumentHeader {
  documentRef?: string;
  title?: string;
  issue?: string;
  date?: string;
  ataChapter?: string;
  programme?: string;
  requirementRef?: string;
  moc?: string;
  author?: string;
  checker?: string;
  approver?: string;
  classification?: string;
}

/** Renvoi vers un chapitre d'un document de substantiation. */
export interface ChapterCitation {
  /** Numero de chapitre tel que cite, ex. "4.3.2". */
  chapter: string;
  /** Titre annonce par la citation, si present. */
  claimedTitle?: string;
  /** Reference du document cite, ex. "DOC-27-SAF-0142". */
  documentRef?: string;
  /** Issue du document cite si precisee. */
  documentIssue?: string;
  raw: string;
}

/** Chapitre reellement trouve dans un PDF de substantiation. */
export interface DocumentChapter {
  number: string;
  title: string;
  page: number;
  /** Texte du corps du chapitre, tronque. */
  body: string;
}

export type CheckStatus = "ok" | "warning" | "error" | "info";

/** Resultat unitaire d'un controle, affichable et exportable. */
export interface CheckResult {
  id: string;
  status: CheckStatus;
  /** Libelle court du controle effectue. */
  label: string;
  /** Explication destinee au redacteur : ce qui est attendu, ce qui est vu. */
  detail: string;
  /** Localisation pour permettre la verification manuelle. */
  location?: { page?: number; section?: string; field?: string };
  /** Action proposee au redacteur. Jamais appliquee automatiquement. */
  suggestion?: string;
}

/** Coversheet de demonstration de conformite. */
export interface Coversheet {
  requirement: RequirementRef;
  header: DocumentHeader;
  mocIds: MocId[];
  citations: ChapterCitation[];
  /** Enonce de conformite. Vide dans une trame generee. */
  complianceStatement?: string;
}

/** Document ACP/OCP apres analyse. */
export interface ParsedPlan {
  header: DocumentHeader;
  occurrences: RequirementOccurrence[];
  /** Exigences dedupliquees, dans l'ordre d'apparition. */
  requirements: RequirementRef[];
  pageCount: number;
  /** Nom du fichier source, pour tracabilite dans les exports. */
  sourceName: string;
}

/** Page de texte extraite d'un PDF. */
export interface PdfPage {
  page: number;
  text: string;
}

export interface PdfDocumentText {
  sourceName: string;
  pages: PdfPage[];
  pageCount: number;
}

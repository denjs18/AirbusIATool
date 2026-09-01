/**
 * Bibliotheque de blocs types.
 *
 * D'un standard au suivant, une coversheet reprend la meme redaction : seuls
 * les paragraphes cites changent, parce que le document joint a ete reedite.
 * L'outil ne redige donc rien : il restitue le texte deja ecrit, avec ses
 * reperes de paragraphe laisses en blanc.
 *
 * Un bloc type associe un jeu d'exigences a son texte, pour un seul document
 * de certification. Le regroupement et la redaction ne sont pas deux notions
 * distinctes : dire que deux exigences vont ensemble, c'est dire qu'elles
 * partagent une justification.
 *
 * Une meme exigence traitee par deux documents donne deux blocs distincts :
 * la SSA et le SyDMP n'en disent pas la meme chose, et c'est le document qui
 * porte la redaction, pas l'exigence.
 *
 * Le texte depend de la combinaison retenue : les exigences A et B ensemble
 * appellent une redaction, l'exigence A seule en appelle une autre. Un bloc
 * type ne s'applique donc que si toutes ses exigences sont selectionnees.
 */
import { parseRequirementList, sortRequirements } from "./requirements";
import type { MocId, RequirementGroup, RequirementRef } from "./types";

export interface BlockTemplate {
  /** Document de certification auquel le bloc appartient, ex. "SyDMP". */
  documentType: string;
  /**
   * Exigences couvertes par ce bloc, toutes requises pour qu'il s'applique.
   *
   * Les references sont conservees entieres, qualifieur et appendices compris :
   * c'est ce bloc qui dicte la citation produite dans la coversheet, donc
   * "CS 25.671(a) Amdt 23" doit ressortir tel qu'il a ete saisi. L'identifiant
   * seul ne sert qu'au rapprochement.
   */
  requirements: RequirementRef[];
  /** Redaction memorisee, reperes de paragraphe compris. */
  text?: string;
  /**
   * Moyens de conformite propres au bloc.
   * Certaines coversheets les precisent bloc par bloc, quand ils different de
   * ceux du document ; a defaut, ceux du document s'appliquent.
   */
  mocIds?: MocId[];
  /** Coversheet d'origine, pour pouvoir remonter a la source. */
  source?: string;
}

export interface TemplateLibrary {
  templates: BlockTemplate[];
}

export const EMPTY_LIBRARY: TemplateLibrary = { templates: [] };

/** Normalise un document de certification : la casse ne doit pas separer deux blocs. */
export function normalizeDocumentType(documentType: string): string {
  return documentType.trim().toUpperCase();
}

/** Identifiants des exigences d'un bloc, cle de rapprochement. */
export function requirementIdsOf(template: BlockTemplate): string[] {
  return template.requirements.map((requirement) => requirement.id);
}

function templateKey(template: BlockTemplate): string {
  const ids = requirementIdsOf(template).sort().join("|");
  return `${normalizeDocumentType(template.documentType)}::${ids}`;
}

/**
 * Repere de paragraphe a completer.
 *
 * Le redacteur ecrit "§x.x" la ou il devra pointer un chapitre du document
 * joint. On les compte pour pouvoir dire combien il en reste, sans jamais
 * chercher a les deviner : ils dependent du contenu du document.
 */
export const PLACEHOLDER_PATTERN = /§\s*[\dxX]*[xX][\dxX.]*/g;

export function countPlaceholders(text: string | undefined): number {
  if (!text) return 0;
  return text.match(PLACEHOLDER_PATTERN)?.length ?? 0;
}

/** Documents de certification presents dans la bibliotheque, tries. */
export function documentTypesOf(library: TemplateLibrary): string[] {
  return [...new Set(library.templates.map((t) => normalizeDocumentType(t.documentType)))].sort();
}

/** Blocs types d'un document de certification. */
export function templatesFor(library: TemplateLibrary, documentType: string): BlockTemplate[] {
  const type = normalizeDocumentType(documentType);
  return library.templates.filter((t) => normalizeDocumentType(t.documentType) === type);
}

/**
 * Toutes les exigences qu'un document de certification sait couvrir.
 *
 * C'est la liste proposee au moment de preparer sa coversheet. Une exigence
 * citee par plusieurs blocs n'y figure qu'une fois : la citation retenue pour
 * l'affichage est la premiere rencontree, mais elle n'engage rien, car chaque
 * bloc produit cite ses propres references.
 */
export function knownRequirementsFor(
  library: TemplateLibrary,
  documentType: string,
): RequirementRef[] {
  const byId = new Map<string, RequirementRef>();
  for (const template of templatesFor(library, documentType)) {
    for (const requirement of template.requirements) {
      const kept = byId.get(requirement.id);
      // A defaut de qualifieur sur la premiere rencontre, on retient celle qui
      // en porte un : elle est plus proche de la citation attendue.
      if (!kept || (!kept.qualifier && requirement.qualifier)) {
        byId.set(requirement.id, requirement);
      }
    }
  }
  return sortRequirements([...byId.values()]);
}

/**
 * Bloc type correspondant exactement a un jeu d'exigences.
 * Sert lorsqu'un bloc est constitue a la main : s'il retombe sur une
 * combinaison connue, la redaction memorisee doit revenir.
 */
export function findTemplate(
  library: TemplateLibrary,
  documentType: string,
  requirementIds: string[],
): BlockTemplate | undefined {
  const wanted = [...requirementIds].sort().join("|");
  return templatesFor(library, documentType).find(
    (template) => requirementIdsOf(template).sort().join("|") === wanted,
  );
}

/** Ajoute ou remplace des blocs types, un meme jeu d'exigences n'existant qu'une fois. */
export function mergeTemplates(
  library: TemplateLibrary,
  templates: BlockTemplate[],
): TemplateLibrary {
  const byKey = new Map(library.templates.map((t) => [templateKey(t), t]));
  for (const template of templates) {
    byKey.set(templateKey(template), {
      ...template,
      documentType: normalizeDocumentType(template.documentType),
    });
  }
  return { templates: [...byKey.values()] };
}

/** Retire un bloc type de la bibliotheque. */
export function forgetTemplate(
  library: TemplateLibrary,
  template: BlockTemplate,
): TemplateLibrary {
  const key = templateKey(template);
  return { templates: library.templates.filter((t) => templateKey(t) !== key) };
}

export interface AppliedBlock extends RequirementGroup {
  /** Bloc type a l'origine du texte, absent si rien n'etait memorise. */
  template?: BlockTemplate;
}

export interface TemplateMatch {
  blocks: AppliedBlock[];
  /** Exigences selectionnees sans bloc type connu. */
  uncovered: RequirementRef[];
}

/**
 * Confronte une selection d'exigences a la bibliotheque.
 *
 * Un bloc type ne s'applique que si toutes ses exigences sont selectionnees :
 * c'est ce qui permet a {A, B} et a {A} seule d'appeler deux redactions
 * differentes. Les blocs les plus larges sont essayes d'abord, sinon {A}
 * consommerait A avant que {A, B} n'ait sa chance.
 *
 * Un bloc retenu cite ses propres references, pas celles de la selection : la
 * coversheet reprend ainsi mot pour mot ce qui a ete saisi dans le classeur.
 *
 * Les exigences sans bloc type connu forment chacune leur propre bloc, sans
 * texte : l'outil ne redige pas a la place du redacteur.
 */
export function applyTemplates(
  documentType: string,
  requirements: RequirementRef[],
  library: TemplateLibrary,
): TemplateMatch {
  const position = new Map(requirements.map((requirement, index) => [requirement.id, index]));
  const remaining = new Set(requirements.map((requirement) => requirement.id));

  const candidates = templatesFor(library, documentType)
    .slice()
    .sort((a, b) => b.requirements.length - a.requirements.length);

  const blocks: AppliedBlock[] = [];

  for (const template of candidates) {
    const complete = template.requirements.every((requirement) => remaining.has(requirement.id));
    if (!complete) continue;

    const picked = [...template.requirements].sort(
      (a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0),
    );
    for (const requirement of picked) remaining.delete(requirement.id);

    blocks.push({
      requirements: picked,
      mocIds: template.mocIds ?? [],
      justification: template.text,
      template,
    });
  }

  const uncovered = requirements.filter((requirement) => remaining.has(requirement.id));
  for (const requirement of uncovered) {
    blocks.push({ requirements: [requirement], mocIds: [] });
  }

  // Ordre de lecture : celui de la selection, porte par la premiere exigence.
  blocks.sort(
    (a, b) =>
      (position.get(a.requirements[0].id) ?? 0) - (position.get(b.requirements[0].id) ?? 0),
  );

  return { blocks, uncovered };
}

/**
 * Deduit des blocs types de blocs rediges, pour capitaliser une coversheet
 * qui vient d'etre montee.
 */
export function learnFromBlocks(
  documentType: string,
  blocks: RequirementGroup[],
  source?: string,
): BlockTemplate[] {
  return blocks.map((block) => ({
    documentType: normalizeDocumentType(documentType),
    requirements: block.requirements,
    text: block.justification,
    mocIds: block.mocIds.length ? block.mocIds : undefined,
    source,
  }));
}

/**
 * Relit une bibliotheque venue d'un fichier JSON.
 *
 * Trois formes sont acceptees pour les exigences d'un bloc : les references
 * completes telles que l'outil les exporte, des citations en clair pour un
 * fichier ecrit a la main ("CS 25.671(a) Amdt 23"), et le champ
 * "requirementIds" des exports produits avant que les blocs ne portent leurs
 * references entieres. Un ancien fichier est relu plutot que rejete, quitte a
 * ne pas retrouver un qualifieur qu'il n'avait jamais enregistre.
 *
 * Renvoie undefined si la forme n'est pas exploitable du tout.
 */
export function coerceLibrary(value: unknown): TemplateLibrary | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = (value as { templates?: unknown }).templates;
  if (!Array.isArray(candidate)) return undefined;

  const templates: BlockTemplate[] = [];
  for (const entry of candidate) {
    if (typeof entry !== "object" || entry === null) return undefined;
    const raw = entry as Record<string, unknown>;
    if (typeof raw.documentType !== "string") return undefined;

    const cited = Array.isArray(raw.requirements) ? raw.requirements : raw.requirementIds;
    if (!Array.isArray(cited) || cited.length === 0) return undefined;

    const requirements: RequirementRef[] = [];
    for (const item of cited) {
      if (typeof item === "string") {
        // Citation en clair : relue par le meme analyseur que les documents,
        // donc "CS 25.0671(a) amdt. 23" donne la meme exigence qu'ailleurs.
        const parsed = parseRequirementList(item);
        if (parsed.length !== 1) return undefined;
        requirements.push(parsed[0]);
      } else if (
        typeof item === "object" &&
        item !== null &&
        typeof (item as RequirementRef).id === "string"
      ) {
        requirements.push(item as RequirementRef);
      } else {
        return undefined;
      }
    }

    templates.push({
      documentType: raw.documentType,
      requirements,
      text: typeof raw.text === "string" ? raw.text : undefined,
      mocIds: Array.isArray(raw.mocIds) ? raw.mocIds.map(String) : undefined,
      source: typeof raw.source === "string" ? raw.source : undefined,
    });
  }

  return { templates };
}

/** Verifie qu'une valeur inconnue a la forme attendue d'une bibliotheque. */
export function isTemplateLibrary(value: unknown): value is TemplateLibrary {
  return coerceLibrary(value) !== undefined;
}

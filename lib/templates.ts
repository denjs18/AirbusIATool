/**
 * Bibliotheque de blocs types.
 *
 * D'un standard au suivant, une coversheet reprend la meme redaction : seuls
 * les paragraphes cites changent, parce que le document joint a ete reedite.
 * L'outil ne redige donc rien : il restitue le texte deja ecrit, avec ses
 * reperes de paragraphe laisses en blanc.
 *
 * Un bloc type associe un jeu d'exigences a son texte. Le regroupement et la
 * redaction ne sont pas deux notions distinctes : dire que deux exigences vont
 * ensemble, c'est dire qu'elles partagent une justification.
 *
 * Le texte depend de la combinaison retenue : les exigences A et B ensemble
 * appellent une redaction, l'exigence A seule en appelle une autre. Un bloc
 * type ne s'applique donc que si toutes ses exigences sont selectionnees.
 */
import type { RequirementGroup, RequirementRef } from "./types";

export interface BlockTemplate {
  /** Famille de document a laquelle le bloc appartient, ex. "SyDMP". */
  documentType: string;
  /** Exigences couvertes par ce bloc, toutes requises pour qu'il s'applique. */
  requirementIds: string[];
  /** Redaction memorisee, reperes de paragraphe compris. */
  text?: string;
  /** Coversheet d'origine, pour pouvoir remonter a la source. */
  source?: string;
}

export interface TemplateLibrary {
  templates: BlockTemplate[];
}

export const EMPTY_LIBRARY: TemplateLibrary = { templates: [] };

/** Normalise une famille de document : la casse ne doit pas separer deux blocs. */
export function normalizeDocumentType(documentType: string): string {
  return documentType.trim().toUpperCase();
}

function templateKey(template: BlockTemplate): string {
  const ids = [...template.requirementIds].sort().join("|");
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

/** Familles de documents presentes dans la bibliotheque, triees. */
export function documentTypesOf(library: TemplateLibrary): string[] {
  return [...new Set(library.templates.map((t) => normalizeDocumentType(t.documentType)))].sort();
}

/** Blocs types d'une famille de documents. */
export function templatesFor(library: TemplateLibrary, documentType: string): BlockTemplate[] {
  const type = normalizeDocumentType(documentType);
  return library.templates.filter((t) => normalizeDocumentType(t.documentType) === type);
}

/**
 * Toutes les exigences qu'une famille de coversheet sait couvrir.
 * Sert a proposer la bonne liste au moment de preparer une coversheet.
 */
export function knownRequirementsFor(
  library: TemplateLibrary,
  documentType: string,
): string[] {
  const ids = new Set<string>();
  for (const template of templatesFor(library, documentType)) {
    for (const id of template.requirementIds) ids.add(id);
  }
  return [...ids];
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
    (template) => [...template.requirementIds].sort().join("|") === wanted,
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
 * Les exigences sans bloc type connu forment chacune leur propre bloc, sans
 * texte : l'outil ne redige pas a la place du redacteur.
 */
export function applyTemplates(
  documentType: string,
  requirements: RequirementRef[],
  library: TemplateLibrary,
): TemplateMatch {
  const position = new Map(requirements.map((requirement, index) => [requirement.id, index]));
  const remaining = new Map(requirements.map((requirement) => [requirement.id, requirement]));

  const candidates = templatesFor(library, documentType)
    .slice()
    .sort((a, b) => b.requirementIds.length - a.requirementIds.length);

  const blocks: AppliedBlock[] = [];

  for (const template of candidates) {
    const complete = template.requirementIds.every((id) => remaining.has(id));
    if (!complete) continue;

    const picked = template.requirementIds
      .map((id) => remaining.get(id)!)
      .sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));
    for (const requirement of picked) remaining.delete(requirement.id);

    blocks.push({
      requirements: picked,
      mocIds: [],
      justification: template.text,
      template,
    });
  }

  const uncovered = [...remaining.values()];
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
    requirementIds: block.requirements.map((requirement) => requirement.id),
    text: block.justification,
    source,
  }));
}

/** Verifie qu'une valeur inconnue a la forme attendue d'une bibliotheque. */
export function isTemplateLibrary(value: unknown): value is TemplateLibrary {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { templates?: unknown };
  return (
    Array.isArray(candidate.templates) &&
    candidate.templates.every(
      (template) =>
        typeof template === "object" &&
        template !== null &&
        typeof (template as BlockTemplate).documentType === "string" &&
        Array.isArray((template as BlockTemplate).requirementIds) &&
        (template as BlockTemplate).requirementIds.every((id) => typeof id === "string"),
    )
  );
}

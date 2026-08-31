/**
 * Memoire des regroupements d'exigences.
 *
 * Dans une coversheet, plusieurs exigences peuvent partager une meme
 * justification quand elles vont ensemble. Ce choix appartient au redacteur,
 * mais il se reconduit : si deux exigences ont ete groupees dans la coversheet
 * d'un document, elles le resteront pour les standards suivants du meme
 * document.
 *
 * L'outil ne decide donc rien. Il observe les regroupements des coversheets
 * precedentes et les rejoue, en indiquant a chaque fois d'ou vient la regle.
 */
import type { RequirementGroup, RequirementRef } from "./types";

export interface GroupingRule {
  /** Famille de document ou le regroupement a ete observe, ex. "SSA". */
  documentType: string;
  /** Identifiants d'exigences apparues dans un meme bloc. */
  requirementIds: string[];
  /** Coversheet d'ou la regle est tiree, pour pouvoir la justifier. */
  source?: string;
}

export interface GroupingMemory {
  rules: GroupingRule[];
}

export const EMPTY_MEMORY: GroupingMemory = { rules: [] };

/** Normalise une famille de document : la casse ne doit pas separer deux regles. */
export function normalizeDocumentType(documentType: string): string {
  return documentType.trim().toUpperCase();
}

function ruleKey(rule: GroupingRule): string {
  return `${normalizeDocumentType(rule.documentType)}::${[...rule.requirementIds].sort().join("|")}`;
}

/**
 * Deduit les regles de regroupement de blocs observes.
 * Un bloc d'une seule exigence n'apprend rien : il ne produit pas de regle.
 */
export function learnFromGroups(
  documentType: string,
  groups: RequirementGroup[],
  source?: string,
): GroupingRule[] {
  return groups
    .filter((group) => group.requirements.length > 1)
    .map((group) => ({
      documentType: normalizeDocumentType(documentType),
      requirementIds: group.requirements.map((requirement) => requirement.id),
      source,
    }));
}

/** Fusionne deux memoires en ecartant les regles identiques. */
export function mergeMemory(
  memory: GroupingMemory,
  rules: GroupingRule[],
): GroupingMemory {
  const byKey = new Map(memory.rules.map((rule) => [ruleKey(rule), rule]));
  for (const rule of rules) {
    byKey.set(ruleKey(rule), rule);
  }
  return { rules: [...byKey.values()] };
}

/** Retire une regle de la memoire. */
export function forgetRule(memory: GroupingMemory, rule: GroupingRule): GroupingMemory {
  const key = ruleKey(rule);
  return { rules: memory.rules.filter((candidate) => ruleKey(candidate) !== key) };
}

export interface GroupingResult {
  groups: RequirementGroup[];
  /** Regles effectivement appliquees, pour affichage et tracabilite. */
  applied: GroupingRule[];
}

/**
 * Applique les regles connues a une selection d'exigences.
 *
 * Les regles les plus larges sont essayees d'abord : une regle de trois
 * exigences prime sur une regle de deux qui en recouvre une partie, sinon le
 * regroupement obtenu dependrait de l'ordre de stockage des regles.
 *
 * Une regle ne s'applique que si au moins deux de ses exigences sont
 * selectionnees. Les exigences restantes forment chacune leur propre bloc :
 * l'outil ne groupe jamais de sa propre initiative.
 */
export function applyGrouping(
  documentType: string,
  requirements: RequirementRef[],
  memory: GroupingMemory,
): GroupingResult {
  const type = normalizeDocumentType(documentType);
  const position = new Map(requirements.map((requirement, index) => [requirement.id, index]));
  const remaining = new Map(requirements.map((requirement) => [requirement.id, requirement]));

  const candidates = memory.rules
    .filter((rule) => normalizeDocumentType(rule.documentType) === type)
    .slice()
    .sort((a, b) => b.requirementIds.length - a.requirementIds.length);

  const groups: RequirementGroup[] = [];
  const applied: GroupingRule[] = [];

  for (const rule of candidates) {
    const present = rule.requirementIds
      .map((id) => remaining.get(id))
      .filter((requirement): requirement is RequirementRef => requirement !== undefined);

    if (present.length < 2) continue;

    for (const requirement of present) remaining.delete(requirement.id);
    groups.push({
      requirements: present.sort(
        (a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0),
      ),
      mocIds: [],
    });
    applied.push(rule);
  }

  for (const requirement of remaining.values()) {
    groups.push({ requirements: [requirement], mocIds: [] });
  }

  // Ordre de lecture : celui de la selection, porte par la premiere exigence.
  groups.sort(
    (a, b) =>
      (position.get(a.requirements[0].id) ?? 0) - (position.get(b.requirements[0].id) ?? 0),
  );

  return { groups, applied };
}

/** Verifie qu'une valeur inconnue a la forme attendue d'une memoire. */
export function isGroupingMemory(value: unknown): value is GroupingMemory {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { rules?: unknown };
  return (
    Array.isArray(candidate.rules) &&
    candidate.rules.every(
      (rule) =>
        typeof rule === "object" &&
        rule !== null &&
        typeof (rule as GroupingRule).documentType === "string" &&
        Array.isArray((rule as GroupingRule).requirementIds),
    )
  );
}

/**
 * Preparation des trames de coversheet a partir des exigences citees dans l'ACP.
 *
 * Principe directeur : l'outil met en place la structure, pre-remplit ce qui est
 * mecaniquement deductible et laisse explicitement vides les champs qui relevent
 * du jugement d'ingenierie. Les zones a rediger sont balisees "[A REDIGER]" pour
 * qu'aucune trame ne puisse etre emise par inadvertance en l'etat.
 */
import { expectedEvidenceFor, MOC_DEFINITIONS, suggestMocForRequirement } from "./moc";
import type {
  Coversheet,
  DocumentHeader,
  MocCode,
  ParsedPlan,
  RequirementOccurrence,
  RequirementRef,
} from "./types";

export const TO_BE_WRITTEN = "[A REDIGER]";

export interface TemplateOptions {
  /** Programme avion. Repris de l'ACP si absent. */
  programme?: string;
  /** Chapitre ATA, ex. "27". */
  ataChapter?: string;
  /** Redacteur pressenti, pre-rempli dans l'en-tete. */
  author?: string;
  /** Prefixe des references de coversheet generees, ex. "CVS-27-FCS". */
  refPrefix?: string;
  /** Premier numero de la serie. */
  refStart?: number;
  /** Date d'emission au format ISO. Injectable pour rendre les tests stables. */
  issueDate?: string;
  /** Mention de classification a reporter dans l'en-tete. */
  classification?: string;
}

const DEFAULTS: Required<Pick<TemplateOptions, "refPrefix" | "refStart" | "classification">> = {
  refPrefix: "CVS-27-FCS",
  refStart: 1,
  classification: "Airbus Protect - donnees fictives (POC)",
};

/** Reference de coversheet de la serie, ex. CVS-27-FCS-0003. */
export function coversheetRef(prefix: string, index: number): string {
  return `${prefix}-${String(index).padStart(4, "0")}`;
}

/**
 * Construit une trame pour une exigence.
 * Les MoC proviennent de l'ACP quand il les precise, sinon d'une proposition
 * par defaut clairement identifiee comme telle dans le rendu.
 */
export function buildCoversheet(
  requirement: RequirementRef,
  occurrences: RequirementOccurrence[],
  planHeader: DocumentHeader,
  options: TemplateOptions = {},
  index = 1,
): Coversheet {
  const prefix = options.refPrefix ?? DEFAULTS.refPrefix;
  const mocFromPlan = [
    ...new Set(occurrences.flatMap((occurrence) => occurrence.mocCodes)),
  ].sort() as MocCode[];
  const mocCodes = mocFromPlan.length ? mocFromPlan : suggestMocForRequirement(requirement.id);

  const header: DocumentHeader = {
    documentRef: coversheetRef(prefix, (options.refStart ?? DEFAULTS.refStart) + index - 1),
    title: `Compliance coversheet - ${requirement.id}`,
    issue: "1",
    date: options.issueDate ?? new Date().toISOString().slice(0, 10),
    ataChapter: options.ataChapter ?? planHeader.ataChapter ?? "27",
    programme: options.programme ?? planHeader.programme ?? TO_BE_WRITTEN,
    requirementRef: requirement.amendment
      ? `${requirement.id} (${requirement.amendment})`
      : requirement.id,
    moc: mocCodes.join(", "),
    author: options.author ?? TO_BE_WRITTEN,
    checker: TO_BE_WRITTEN,
    approver: TO_BE_WRITTEN,
    classification: options.classification ?? DEFAULTS.classification,
  };

  return {
    requirement,
    header,
    mocCodes,
    // Les renvois vers les documents de substantiation restent a etablir :
    // c'est une decision d'ingenierie, pas une deduction mecanique.
    citations: [],
    complianceStatement: undefined,
  };
}

/** Genere une trame par exigence du plan, dans l'ordre de tri du plan. */
export function buildCoversheetsFromPlan(
  plan: ParsedPlan,
  options: TemplateOptions = {},
): Coversheet[] {
  return plan.requirements.map((requirement, position) =>
    buildCoversheet(
      requirement,
      plan.occurrences.filter((occurrence) => occurrence.id === requirement.id),
      plan.header,
      options,
      position + 1,
    ),
  );
}

const HEADER_ROWS: [keyof DocumentHeader, string][] = [
  ["documentRef", "Reference document"],
  ["title", "Titre"],
  ["issue", "Issue"],
  ["date", "Date"],
  ["programme", "Programme"],
  ["ataChapter", "ATA"],
  ["requirementRef", "Exigence"],
  ["moc", "Moyens de conformite"],
  ["author", "Redige par"],
  ["checker", "Verifie par"],
  ["approver", "Approuve par"],
  ["classification", "Classification"],
];

/**
 * Rendu Markdown de la trame, directement collable dans le gabarit Word.
 * Le format Markdown est volontaire : il reste lisible, diffable et
 * convertible, sans dependance a un format binaire.
 */
export function renderCoversheetMarkdown(
  coversheet: Coversheet,
  planSource?: string,
): string {
  const { header, requirement, mocCodes } = coversheet;
  const lines: string[] = [];

  lines.push(`# Compliance coversheet - ${requirement.id}`, "");
  lines.push("## En-tete", "");
  lines.push("| Champ | Valeur |", "| --- | --- |");
  for (const [key, label] of HEADER_ROWS) {
    lines.push(`| ${label} | ${header[key] ?? TO_BE_WRITTEN} |`);
  }
  lines.push("");

  lines.push("## 1. Objet", "");
  lines.push(
    `Demonstration de conformite a l'exigence ${requirement.id}` +
      (requirement.amendment ? ` (${requirement.amendment})` : "") +
      ".",
    "",
  );

  lines.push("## 2. Exigence applicable", "");
  lines.push(`- Reference : ${requirement.id}`);
  lines.push(`- Nature : ${requirement.kind}`);
  if (requirement.amendment) lines.push(`- Amendement : ${requirement.amendment}`);
  lines.push(`- Texte de l'exigence : ${TO_BE_WRITTEN} (reporter l'enonce depuis le referentiel)`);
  lines.push("");

  lines.push("## 3. Moyens de conformite retenus", "");
  lines.push("| Code | Libelle | Retenu |", "| --- | --- | --- |");
  for (const code of mocCodes) {
    lines.push(`| ${code} | ${MOC_DEFINITIONS[code].labelFr} | X |`);
  }
  lines.push("");

  lines.push("## 4. Documents de substantiation", "");
  lines.push(
    "| Type attendu | Reference | Issue | Chapitre | Titre du chapitre |",
    "| --- | --- | --- | --- | --- |",
  );
  for (const evidence of expectedEvidenceFor(mocCodes)) {
    lines.push(`| ${evidence} | ${TO_BE_WRITTEN} | | | |`);
  }
  lines.push("");
  lines.push(
    "> Les renvois saisis dans ce tableau sont controlables via le module " +
      "Coherence des renvois (verification chapitre cite / contenu reel).",
    "",
  );

  lines.push("## 5. Enonce de conformite", "");
  lines.push(`${TO_BE_WRITTEN}`, "");
  lines.push(
    "> Champ volontairement laisse vide : la formulation de l'enonce de " +
      "conformite releve de l'ingenieur de certification.",
    "",
  );

  lines.push("## 6. Hypotheses et limitations", "");
  lines.push(`${TO_BE_WRITTEN}`, "");

  lines.push("## 7. Tracabilite de la generation", "");
  if (planSource) lines.push(`- Plan source : ${planSource}`);
  lines.push(`- Trame generee automatiquement, champs "${TO_BE_WRITTEN}" a completer.`);
  lines.push("- Aucun contenu technique n'a ete produit par l'outil.");

  return lines.join("\n");
}

/** Index Markdown des trames generees, utile comme sommaire de lot. */
export function renderCoversheetIndex(coversheets: Coversheet[]): string {
  const lines = [
    "# Trames de coversheets generees",
    "",
    "| Reference | Exigence | MoC |",
    "| --- | --- | --- |",
  ];
  for (const coversheet of coversheets) {
    lines.push(
      `| ${coversheet.header.documentRef} | ${coversheet.requirement.id} | ${coversheet.mocCodes.join(", ")} |`,
    );
  }
  return lines.join("\n");
}

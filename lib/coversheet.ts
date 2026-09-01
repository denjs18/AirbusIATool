/**
 * Preparation d'une coversheet de document de certification.
 *
 * Une coversheet accompagne un document de certification et rassemble toutes
 * les exigences que ce document traite. Chaque bloc du Compliance Statement
 * cite une ou plusieurs exigences, puis explique comment le document joint y
 * repond, en renvoyant a ses chapitres.
 *
 * Ce que l'outil sait faire : monter la structure, formater les references,
 * reprendre les regroupements des coversheets precedentes, rappeler les MoC.
 *
 * Ce que l'outil ne sait pas et n'invente pas : ou pointer dans le document
 * joint. Les paragraphes cites relevent de la lecture du document par
 * l'ingenieur, et restent donc a completer.
 */
import { describeMoc } from "./moc";
import { countPlaceholders } from "./placeholders";
import type {
  Coversheet,
  DocumentHeader,
  EnclosedDocument,
  MocId,
  RequirementGroup,
  RequirementRef,
} from "./types";

/**
 * Marqueur des zones a completer.
 *
 * En francais dans un document redige en anglais : il doit sauter aux yeux
 * pour qu'une trame ne parte jamais en revue avec ses trous.
 */
export const TO_BE_COMPLETED = "[A COMPLETER]";

export interface CoversheetOptions {
  /** Famille du document, ex. "SSA", "SyDAS", "VVS". */
  documentType: string;
  /** Document(s) joint(s). Un seul dans la plupart des cas. */
  enclosed: EnclosedDocument[];
  /** Moyens de conformite du document. */
  mocIds: MocId[];
  programme?: string;
  ataChapter?: string;
  /** Reference propre de la coversheet. */
  ref?: string;
  issue?: string;
  /** Date d'emission. Injectable pour rendre les tests stables. */
  date?: string;
  author?: string;
}

/** Assemble la coversheet a partir des blocs deja constitues. */
export function buildCoversheet(
  groups: RequirementGroup[],
  options: CoversheetOptions,
): Coversheet {
  const header: DocumentHeader = {
    documentRef: options.ref ?? TO_BE_COMPLETED,
    title: `Compliance coversheet - ${options.documentType}`,
    issue: options.issue ?? "1",
    date: options.date ?? new Date().toISOString().slice(0, 10),
    ataChapter: options.ataChapter,
    programme: options.programme,
    moc: options.mocIds.map((id) => `MoC ${id}`).join(", "),
    author: options.author,
  };

  return {
    documentType: options.documentType,
    enclosed: options.enclosed,
    mocIds: options.mocIds,
    // Les MoC d'un bloc valent ceux du document tant que le redacteur n'en
    // decide pas autrement : certaines coversheets les precisent bloc par bloc.
    groups: groups.map((group) => ({
      ...group,
      mocIds: group.mocIds.length ? group.mocIds : options.mocIds,
    })),
    header,
  };
}

/** Reference d'exigence telle qu'elle est citee dans une coversheet. */
export function formatRequirementCitation(requirement: RequirementRef): string {
  const appendices = requirement.appendices?.length
    ? ` Appendix ${requirement.appendices.join(" & ")}`
    : "";
  const qualifier = requirement.qualifier ? ` ${requirement.qualifier}` : "";
  return `${requirement.id}${qualifier}${appendices}`;
}

/** Ligne d'exigences d'un bloc, telle qu'elle apparait apres la puce. */
export function formatGroupHeading(group: RequirementGroup): string {
  return group.requirements.map(formatRequirementCitation).join(", ");
}

const HEADER_ROWS: [keyof DocumentHeader, string][] = [
  ["documentRef", "Coversheet reference"],
  ["issue", "Issue"],
  ["date", "Date"],
  ["programme", "Programme"],
  ["ataChapter", "ATA"],
  ["moc", "Means of compliance"],
  ["author", "Prepared by"],
];

/**
 * Rendu Markdown de la coversheet, calque sur la structure des coversheets
 * existantes : en-tete, Compliance Statement, puis un bloc par groupe.
 */
export function renderCoversheetMarkdown(coversheet: Coversheet): string {
  const lines: string[] = [];
  const { header, enclosed, groups, mocIds, documentType } = coversheet;

  lines.push(`# Compliance coversheet - ${documentType}`, "");

  lines.push("| Field | Value |", "| --- | --- |");
  for (const [key, label] of HEADER_ROWS) {
    lines.push(`| ${label} | ${header[key] ?? TO_BE_COMPLETED} |`);
  }
  lines.push("");

  lines.push("## Enclosed document(s)", "");
  lines.push("| Reference | Issue | Title |", "| --- | --- | --- |");
  for (const document of enclosed) {
    lines.push(
      `| ${document.ref} | ${document.issue ?? TO_BE_COMPLETED} | ${document.title ?? TO_BE_COMPLETED} |`,
    );
  }
  lines.push("");

  lines.push("## Compliance Statement", "");
  lines.push(
    `The enclosed document provides ${TO_BE_COMPLETED} (objet du document joint).`,
    "",
  );
  // Sans moyen de conformite renseigne, la phrase doit reclamer l'information
  // plutot que se refermer sur un blanc que la relecture ne verrait pas.
  const mocPhrase = mocIds.length
    ? mocIds.map((id) => `Mean of Compliance n°${id}`).join(", ")
    : TO_BE_COMPLETED;
  lines.push(
    `This document is used as ${mocPhrase} for compliance demonstration with the ` +
      "following certification requirements:",
    "",
  );

  groups.forEach((group, index) => {
    lines.push(`### ${index + 1}. ${formatGroupHeading(group)}`, "");
    if (group.mocIds.length && group.mocIds.join() !== mocIds.join()) {
      lines.push(`- ${group.mocIds.map((id) => `MoC ${id}`).join(", ")}`, "");
    }
    if (group.justification) {
      // Redaction memorisee, restituee telle quelle. Les reperes de paragraphe
      // qu'elle contient restent a completer : ils dependent de l'edition en
      // cours du document joint.
      lines.push(group.justification.trim(), "");
    } else {
      lines.push(
        `${TO_BE_COMPLETED} : aucun bloc type memorise pour ` +
          (group.requirements.length > 1 ? "ces exigences." : "cette exigence."),
        "",
      );
    }
  });

  lines.push("---", "");
  lines.push("## Reste a completer", "");
  lines.push("- Objet du document joint.");
  if (!mocIds.length) lines.push("- Moyens de conformite du document.");
  for (const document of enclosed) {
    if (!document.issue) lines.push(`- Issue du document ${document.ref}.`);
    if (!document.title) lines.push(`- Titre du document ${document.ref}.`);
  }

  const placeholders = countPlaceholders(
    groups.map((group) => group.justification ?? "").join(" "),
  );
  if (placeholders) {
    lines.push(`- ${placeholders} repere${placeholders > 1 ? "s" : ""} de paragraphe a pointer.`);
  }

  const blank = groups.filter((group) => !group.justification).length;
  if (blank) {
    lines.push(
      `- ${blank} justification${blank > 1 ? "s" : ""} a rediger, sans bloc type memorise.`,
    );
  }

  lines.push("");
  lines.push(
    "> Les paragraphes cites ne sont pas deduits : ils dependent du contenu du " +
      "document joint et relevent de sa lecture par l'ingenieur.",
  );

  return lines.join("\n");
}

/** Nombre de reperes de paragraphe restant a pointer dans une coversheet. */
export function remainingPlaceholders(coversheet: Coversheet): number {
  return countPlaceholders(
    coversheet.groups.map((group) => group.justification ?? "").join(" "),
  );
}

/** Rappel des moyens de conformite retenus, pour l'interface. */
export function describeMocList(mocIds: MocId[]): string {
  return mocIds.map(describeMoc).join(" · ");
}

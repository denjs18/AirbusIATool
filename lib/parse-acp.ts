/**
 * Analyse d'un plan de certification (ACP / OCP).
 *
 * Un ACP fait couramment plusieurs centaines de pages et cite les exigences de
 * facon dispersee. L'objectif est d'en sortir une liste exploitable, avec la
 * page et la section d'origine de chaque citation pour permettre la relecture.
 */
import { parseHeader } from "./headers";
import {
  dedupeRequirements,
  extractOccurrencesFromPage,
  sortRequirements,
} from "./requirements";
import type {
  ParsedPlan,
  PdfDocumentText,
  RequirementOccurrence,
} from "./types";

const RE_HEADING = /^(\d+(?:\.\d+){0,4})\.?\s+(\S.{2,140})$/;

interface TextBlock {
  page: number;
  section?: string;
  text: string;
}

/**
 * Decoupe le document en blocs rattaches a leur section.
 * Contrairement a extractChapters, aucun corps n'est tronque : on ne veut
 * perdre aucune citation d'exigence.
 */
export function splitIntoBlocks(pages: PdfDocumentText["pages"]): TextBlock[] {
  const blocks: TextBlock[] = [];
  let section: string | undefined;

  for (const { page, text } of pages) {
    let buffer: string[] = [];

    const flush = () => {
      if (buffer.length) {
        blocks.push({ page, section, text: buffer.join("\n") });
        buffer = [];
      }
    };

    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;

      const heading = line.match(RE_HEADING);
      const isSommaire = /\.{3,}\s*\d{1,4}\s*$/.test(line);
      if (heading && !isSommaire && /[a-zA-Z]{3}/.test(heading[2])) {
        flush();
        section = `${heading[1]} ${heading[2]}`.trim();
      }
      buffer.push(line);
    }
    flush();
  }

  return blocks;
}

/** Convertit le texte extrait d'un ACP en plan exploitable. */
export function parsePlan(document: PdfDocumentText): ParsedPlan {
  // L'en-tete est sur la page de garde. On n'elargit a la page suivante que si
  // la premiere n'a rien donne, sinon le corps du document (qui cite des MoC et
  // des exigences) viendrait polluer les champs d'en-tete.
  let header = parseHeader(document.pages[0]?.text ?? "");
  if (!header.documentRef && document.pages[1]) {
    header = parseHeader(`${document.pages[0]?.text ?? ""}\n${document.pages[1].text}`);
  }

  const occurrences: RequirementOccurrence[] = [];
  for (const block of splitIntoBlocks(document.pages)) {
    for (const occurrence of extractOccurrencesFromPage(block.text, block.page)) {
      occurrences.push({ ...occurrence, section: block.section });
    }
  }

  return {
    header,
    occurrences,
    requirements: sortRequirements(dedupeRequirements(occurrences)),
    pageCount: document.pageCount,
    sourceName: document.sourceName,
  };
}

/** Occurrences d'une exigence donnee, dans l'ordre des pages. */
export function occurrencesOf(plan: ParsedPlan, requirementId: string): RequirementOccurrence[] {
  return plan.occurrences
    .filter((occurrence) => occurrence.id === requirementId)
    .sort((a, b) => a.page - b.page);
}

/** Statistiques de synthese affichees apres import. */
export function planStats(plan: ParsedPlan) {
  const byKind = plan.requirements.reduce<Record<string, number>>((acc, requirement) => {
    acc[requirement.kind] = (acc[requirement.kind] ?? 0) + 1;
    return acc;
  }, {});

  const withoutMoc = plan.requirements.filter(
    (requirement) =>
      !plan.occurrences.some(
        (occurrence) => occurrence.id === requirement.id && occurrence.mocIds.length > 0,
      ),
  );

  return {
    pageCount: plan.pageCount,
    occurrenceCount: plan.occurrences.length,
    requirementCount: plan.requirements.length,
    byKind,
    withoutMoc: withoutMoc.map((requirement) => requirement.id),
  };
}

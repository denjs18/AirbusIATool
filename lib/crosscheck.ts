/**
 * Recoupement ACP <-> coversheets.
 *
 * Repond a la question posee en revue : "est-ce que toutes les exigences du plan
 * sont couvertes, et est-ce que les coversheets ne couvrent que des exigences du
 * plan ?". Fait a la main, c'est une comparaison ligne a ligne entre un plan de
 * plusieurs centaines de pages et des dizaines de coversheets.
 */
import type { CheckResult, Coversheet, MocId, ParsedPlan } from "./types";

export interface CrossCheckInput {
  plan: ParsedPlan;
  coversheets: Coversheet[];
  /**
   * Admet qu'une coversheet emise au niveau du paragraphe couvre ses
   * sous-alineas : une coversheet CS 25.671 couvre alors CS 25.671(c)(1).
   *
   * C'est une convention de programme, pas une regle universelle : selon le
   * gabarit retenu, une demonstration peut etre exigee alinea par alinea. Le
   * choix est donc expose et non fige, et la couverture ainsi obtenue est
   * signalee pour rester relisible en revue.
   */
  paragraphLevelCoverage?: boolean;
}

/** Paragraphe porteur d'un identifiant : "CS 25.671(c)(1)" -> "CS 25.671". */
function paragraphKey(requirementId: string): string {
  return requirementId.replace(/\(.*$/, "").trim();
}

export interface CrossCheckReport {
  results: CheckResult[];
  /** Exigences du plan sans coversheet. */
  uncovered: string[];
  /** Coversheets dont l'exigence n'est pas citee dans le plan. */
  orphans: string[];
  /** Exigences couvertes par plusieurs coversheets. */
  duplicated: string[];
  coverageRatio: number;
}

function mocOf(coversheet: Coversheet): MocId[] {
  return [...coversheet.mocIds].sort() as MocId[];
}

/**
 * Compare le perimetre du plan et celui des coversheets.
 * Les ecarts sont classes par gravite : exigence non couverte (bloquant),
 * coversheet orpheline (a justifier), divergence de MoC (a arbitrer).
 */
export function crossCheck({
  plan,
  coversheets,
  paragraphLevelCoverage = false,
}: CrossCheckInput): CrossCheckReport {
  const results: CheckResult[] = [];

  const planIds = new Set(plan.requirements.map((requirement) => requirement.id));
  const planParagraphs = new Set(plan.requirements.map((r) => paragraphKey(r.id)));
  const coversheetsByRequirement = new Map<string, Coversheet[]>();
  for (const coversheet of coversheets) {
    const key = coversheet.requirement.id;
    const bucket = coversheetsByRequirement.get(key);
    if (bucket) bucket.push(coversheet);
    else coversheetsByRequirement.set(key, [coversheet]);
  }

  const uncovered: string[] = [];
  const orphans: string[] = [];
  const duplicated: string[] = [];

  for (const requirement of plan.requirements) {
    let matching = coversheetsByRequirement.get(requirement.id) ?? [];

    // Couverture au niveau du paragraphe, quand la convention l'autorise.
    const parent = paragraphKey(requirement.id);
    if (!matching.length && paragraphLevelCoverage && parent !== requirement.id) {
      const parentSheets = coversheetsByRequirement.get(parent) ?? [];
      if (parentSheets.length) {
        results.push({
          id: `crosscheck.paragraphLevel.${requirement.id}`,
          status: "info",
          label: `${requirement.id} : couverte au niveau du paragraphe`,
          detail: `Aucune coversheet dediee. ${parentSheets
            .map((sheet) => sheet.header.documentRef ?? "sans reference")
            .join(", ")} couvre ${parent}, sous-alineas inclus.`,
          suggestion: "Confirmer que la convention du programme admet cette granularite.",
        });
        // La coversheet parente est controlee sur sa propre ligne : on ne
        // rejoue pas ici les controles de MoC, de doublon et d'amendement, qui
        // porteraient sur le paragraphe et non sur le sous-alinea.
        continue;
      }
    }

    if (!matching.length) {
      uncovered.push(requirement.id);
      const pages = [
        ...new Set(
          plan.occurrences
            .filter((occurrence) => occurrence.id === requirement.id)
            .map((occurrence) => occurrence.page),
        ),
      ];
      results.push({
        id: `crosscheck.uncovered.${requirement.id}`,
        status: "error",
        label: `${requirement.id} : aucune coversheet`,
        detail: `Exigence citee dans ${plan.sourceName}${
          pages.length ? ` (page${pages.length > 1 ? "s" : ""} ${pages.join(", ")})` : ""
        } mais aucune coversheet ne la couvre.`,
        location: { page: pages[0] },
        suggestion: "Generer la trame correspondante ou justifier la non-applicabilite.",
      });
      continue;
    }

    if (matching.length > 1) {
      duplicated.push(requirement.id);
      results.push({
        id: `crosscheck.duplicate.${requirement.id}`,
        status: "warning",
        label: `${requirement.id} : ${matching.length} coversheets`,
        detail: `Plusieurs coversheets couvrent la meme exigence : ${matching
          .map((coversheet) => coversheet.header.documentRef ?? "sans reference")
          .join(", ")}.`,
        suggestion: "Verifier qu'il ne s'agit pas d'un doublon d'indice.",
      });
    }

    // Divergence de moyens de conformite entre le plan et la coversheet.
    const planMoc = [
      ...new Set(
        plan.occurrences
          .filter((occurrence) => occurrence.id === requirement.id)
          .flatMap((occurrence) => occurrence.mocIds),
      ),
    ].sort();

    if (planMoc.length) {
      for (const coversheet of matching) {
        const sheetMoc = mocOf(coversheet);
        const missing = planMoc.filter((code) => !sheetMoc.includes(code as MocId));
        const extra = sheetMoc.filter((code) => !planMoc.includes(code));

        if (missing.length || extra.length) {
          results.push({
            id: `crosscheck.moc.${requirement.id}.${coversheet.header.documentRef ?? "na"}`,
            status: missing.length ? "error" : "warning",
            label: `${requirement.id} : MoC divergents`,
            detail:
              `Plan : ${planMoc.join(", ") || "aucun"}. Coversheet ${
                coversheet.header.documentRef ?? ""
              } : ${sheetMoc.join(", ") || "aucun"}.` +
              (missing.length ? ` Manquants dans la coversheet : ${missing.join(", ")}.` : "") +
              (extra.length ? ` En plus dans la coversheet : ${extra.join(", ")}.` : ""),
            suggestion: missing.length
              ? "Completer la coversheet ou mettre l'ACP a jour."
              : "Verifier si l'ACP doit etre mis a jour.",
          });
        }
      }
    }

    // Divergence d'amendement CS-25 entre le plan et la coversheet.
    for (const coversheet of matching) {
      const sheetRef = coversheet.header.requirementRef ?? "";
      const sheetAmendment = sheetRef.match(/Am(?:d?t|endment)\.?\s*(\d{1,3})/i)?.[1];
      const planAmendment = requirement.qualifier?.match(/(\d{1,3})/)?.[1];
      if (planAmendment && sheetAmendment && planAmendment !== sheetAmendment) {
        results.push({
          id: `crosscheck.amendment.${requirement.id}`,
          status: "warning",
          label: `${requirement.id} : amendement divergent`,
          detail: `Plan : Amdt ${planAmendment}. Coversheet : Amdt ${sheetAmendment}.`,
          suggestion: "Aligner l'amendement applicable entre les deux documents.",
        });
      }
    }
  }

  for (const [requirementId, sheets] of coversheetsByRequirement) {
    if (planIds.has(requirementId)) continue;
    // Une coversheet emise au niveau du paragraphe n'est pas hors plan si le
    // plan cite un de ses sous-alineas.
    if (paragraphLevelCoverage && planParagraphs.has(paragraphKey(requirementId))) continue;
    orphans.push(requirementId);
    results.push({
      id: `crosscheck.orphan.${requirementId}`,
      status: "warning",
      label: `${requirementId} : coversheet hors plan`,
      detail: `${sheets
        .map((sheet) => sheet.header.documentRef ?? "sans reference")
        .join(", ")} couvre ${requirementId}, exigence non citee dans ${plan.sourceName}.`,
      suggestion: "Ajouter l'exigence au plan ou retirer la coversheet du perimetre.",
    });
  }

  const covered = plan.requirements.length - uncovered.length;
  const coverageRatio = plan.requirements.length ? covered / plan.requirements.length : 0;

  if (!results.length) {
    results.push({
      id: "crosscheck.ok",
      status: "ok",
      label: "Perimetres alignes",
      detail: `Les ${plan.requirements.length} exigences du plan sont couvertes, sans coversheet hors plan.`,
    });
  }

  return { results, uncovered, orphans, duplicated, coverageRatio };
}

/** Export CSV du recoupement, format attendu pour une revue de certification. */
export function renderCrossCheckCsv(report: CrossCheckReport): string {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const rows = [["Statut", "Controle", "Detail", "Action proposee"].join(";")];
  for (const result of report.results) {
    rows.push(
      [
        escape(result.status),
        escape(result.label),
        escape(result.detail),
        escape(result.suggestion ?? ""),
      ].join(";"),
    );
  }
  return rows.join("\n");
}

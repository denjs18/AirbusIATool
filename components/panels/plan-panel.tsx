"use client";

/**
 * Module 1 : extraction des exigences d'un plan de certification.
 *
 * Repond au besoin "structurer l'information d'un document de plusieurs
 * centaines de pages" : on obtient la liste des exigences citees, avec page,
 * section et moyens de conformite, relisible ligne a ligne.
 */
import { useState } from "react";
import { Button, Card, Empty, FileInput, Metric } from "../ui";
import { DEMO_FILES, describeLoadError, loadDemoPdf } from "@/lib/demo";
import { downloadText, safeFileName } from "@/lib/download";
import { parsePlan, planStats } from "@/lib/parse-acp";
import { extractPdfText } from "@/lib/pdf";
import type { ParsedPlan, RequirementKind } from "@/lib/types";

const KIND_LABEL: Record<RequirementKind, string> = {
  CS: "Paragraphes CS-25",
  JAR: "Paragraphes JAR-25",
  AMC: "AMC",
  FAR: "FAR / 14 CFR",
  SC: "Special Conditions",
  CRI: "CRI",
  ESF: "ESF",
};

export default function PlanPanel({
  plan,
  onPlan,
}: {
  plan?: ParsedPlan;
  onPlan: (plan: ParsedPlan) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [filter, setFilter] = useState("");

  async function load(source: File | string) {
    setBusy(true);
    setError(undefined);
    try {
      const document =
        typeof source === "string" ? await loadDemoPdf(source) : await extractPdfText(source);
      onPlan(parsePlan(document));
    } catch (cause) {
      setError(describeLoadError(cause));
    } finally {
      setBusy(false);
    }
  }

  const stats = plan ? planStats(plan) : undefined;
  const rows = plan
    ? plan.requirements.filter((requirement) =>
        requirement.id.toLowerCase().includes(filter.toLowerCase()),
      )
    : [];

  return (
    <div className="flex flex-col gap-5">
      <Card
        title="Import du plan de certification (ACP / OCP)"
        subtitle="Le PDF est lu dans le navigateur. Aucun televersement, aucun stockage serveur."
      >
        <FileInput
          label="Fichier PDF"
          accept="application/pdf"
          busy={busy}
          loaded={plan?.sourceName}
          onFile={(file) => load(file)}
          onDemo={() => load(DEMO_FILES.acp)}
          demoLabel="Charger l'ACP fictif"
        />
        {error && <p className="mt-3 text-sm text-err-500">{error}</p>}
      </Card>

      {!plan && !busy && (
        <Card>
          <Empty>
            Importez un ACP ou chargez l&apos;exemple fictif pour extraire les exigences citees.
          </Empty>
        </Card>
      )}

      {plan && stats && (
        <>
          <Card title="Synthese de l'extraction">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Pages analysees" value={stats.pageCount} />
              <Metric label="Exigences distinctes" value={stats.requirementCount} />
              <Metric label="Citations relevees" value={stats.occurrenceCount} />
              <Metric
                label="Sans MoC identifie"
                value={stats.withoutMoc.length}
                tone={stats.withoutMoc.length ? "warning" : "ok"}
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {Object.entries(stats.byKind).map(([kind, count]) => (
                <span
                  key={kind}
                  className="rounded border px-2 py-1 text-xs"
                  style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                >
                  {KIND_LABEL[kind as RequirementKind] ?? kind} : {count}
                </span>
              ))}
            </div>

            {stats.withoutMoc.length > 0 && (
              <p className="mt-4 text-sm">
                <span className="font-medium">Exigences sans moyen de conformite explicite : </span>
                <span className="font-mono text-xs">{stats.withoutMoc.join(", ")}</span>
              </p>
            )}
          </Card>

          <Card
            title={`Exigences extraites (${rows.length})`}
            subtitle="Chaque ligne renvoie a sa page et a sa section d'origine, pour relecture."
            actions={
              <>
                <input
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder="Filtrer (ex. 25.13)"
                  className="rounded-md border px-2 py-1 text-sm"
                  style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                />
                <Button
                  variant="secondary"
                  onClick={() =>
                    downloadText(
                      safeFileName(`exigences-${plan.sourceName}`, "csv"),
                      renderRequirementsCsv(plan),
                      "text/csv",
                    )
                  }
                >
                  Export CSV
                </Button>
              </>
            }
          >
            {rows.length === 0 ? (
              <Empty>Aucune exigence ne correspond au filtre.</Empty>
            ) : (
              <div className="scroll-x">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="text-left" style={{ color: "var(--text-muted)" }}>
                      <th className="pb-2 font-medium">Exigence</th>
                      <th className="pb-2 font-medium">Nature</th>
                      <th className="pb-2 font-medium">Amdt</th>
                      <th className="pb-2 font-medium">MoC</th>
                      <th className="pb-2 font-medium">Pages</th>
                      <th className="pb-2 font-medium">Sections</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((requirement) => {
                      const occurrences = plan.occurrences.filter(
                        (occurrence) => occurrence.id === requirement.id,
                      );
                      const moc = [
                        ...new Set(occurrences.flatMap((occurrence) => occurrence.mocIds)),
                      ].sort();
                      const pages = [
                        ...new Set(occurrences.map((occurrence) => occurrence.page)),
                      ];
                      const sections = [
                        ...new Set(
                          occurrences
                            .map((occurrence) => occurrence.section)
                            .filter((section): section is string => Boolean(section)),
                        ),
                      ];

                      return (
                        <tr key={requirement.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                          <td className="py-2 font-mono text-xs font-semibold">{requirement.id}</td>
                          <td className="py-2">{requirement.kind}</td>
                          <td className="py-2">{requirement.qualifier ?? "-"}</td>
                          <td className="py-2 font-mono text-xs">
                            {moc.length ? moc.join(" ") : <span className="text-warn-500">-</span>}
                          </td>
                          <td className="py-2 tabular-nums">{pages.join(", ")}</td>
                          <td className="py-2 text-xs" style={{ color: "var(--text-muted)" }}>
                            {sections.length ? sections.join(" | ") : "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function renderRequirementsCsv(plan: ParsedPlan): string {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const rows = [["Exigence", "Nature", "Amendement", "MoC", "Pages", "Sections"].join(";")];

  for (const requirement of plan.requirements) {
    const occurrences = plan.occurrences.filter((occurrence) => occurrence.id === requirement.id);
    rows.push(
      [
        escape(requirement.id),
        escape(requirement.kind),
        escape(requirement.qualifier ?? ""),
        escape([...new Set(occurrences.flatMap((o) => o.mocIds))].sort().join(" ")),
        escape([...new Set(occurrences.map((o) => o.page))].join(", ")),
        escape(
          [...new Set(occurrences.map((o) => o.section).filter(Boolean))].join(" | "),
        ),
      ].join(";"),
    );
  }

  return rows.join("\n");
}

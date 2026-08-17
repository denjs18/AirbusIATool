"use client";

/**
 * Module 5 : recoupement ACP / coversheets emises.
 *
 * Le registre attendu est un export plat du referentiel documentaire
 * (reference, exigence, MoC). C'est le controle qui repond a la question de
 * revue : "le perimetre est-il couvert, sans coversheet hors plan ?".
 */
import { useMemo, useState } from "react";
import { Button, Card, Empty, FileInput, Metric, ResultList } from "../ui";
import { crossCheck, renderCrossCheckCsv } from "@/lib/crosscheck";
import { downloadText, safeFileName } from "@/lib/download";
import { isRegistryFile, registryToCoversheets } from "@/lib/registry";
import type { RegistryFile } from "@/lib/registry";
import type { ParsedPlan } from "@/lib/types";

const DEMO_REGISTRY = "/fixtures/coversheets-registry.json";

export default function CrossCheckPanel({ plan }: { plan?: ParsedPlan }) {
  const [registry, setRegistry] = useState<RegistryFile>();
  const [registryName, setRegistryName] = useState<string>();
  const [paragraphLevel, setParagraphLevel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function load(source: File | string) {
    setBusy(true);
    setError(undefined);
    try {
      const text =
        typeof source === "string" ? await (await fetch(source)).text() : await source.text();
      const parsed: unknown = JSON.parse(text);
      if (!isRegistryFile(parsed)) {
        throw new Error(
          'Format inattendu. Attendu : { "coversheets": [ { "documentRef": "...", "requirement": "CS 25.671", "moc": ["MC1"] } ] }',
        );
      }
      setRegistry(parsed);
      setRegistryName(typeof source === "string" ? source.split("/").pop() : source.name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Lecture du registre impossible.");
    } finally {
      setBusy(false);
    }
  }

  const report = useMemo(
    () =>
      plan && registry
        ? crossCheck({
            plan,
            coversheets: registryToCoversheets(registry),
            paragraphLevelCoverage: paragraphLevel,
          })
        : undefined,
    [plan, registry, paragraphLevel],
  );

  if (!plan) {
    return (
      <Card title="Recoupement ACP / coversheets">
        <Empty>Importez d&apos;abord un plan de certification dans l&apos;onglet 1.</Empty>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Card
        title="Registre des coversheets emises"
        subtitle="Export JSON du referentiel documentaire : reference, exigence couverte, moyens de conformite."
      >
        <FileInput
          label="Fichier JSON"
          accept="application/json,.json"
          busy={busy}
          loaded={registryName}
          onFile={(file) => load(file)}
          onDemo={() => load(DEMO_REGISTRY)}
          demoLabel="Charger le registre fictif"
        />

        <label className="mt-4 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={paragraphLevel}
            onChange={(event) => setParagraphLevel(event.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">
              Une coversheet au niveau du paragraphe couvre ses sous-alineas
            </span>
            <span className="mt-0.5 block text-xs" style={{ color: "var(--text-muted)" }}>
              Exemple : une coversheet CS 25.671 couvre CS 25.671(c)(1). Convention a arbitrer avec
              le programme : selon le gabarit retenu, la demonstration peut etre exigee alinea par
              alinea. Les couvertures obtenues par cette regle sont signalees separement.
            </span>
          </span>
        </label>

        {error && <p className="mt-3 text-sm text-err-500">{error}</p>}
      </Card>

      {!report && (
        <Card>
          <Empty>
            Chargez le registre fictif : le recoupement detecte une exigence non couverte, une
            coversheet hors plan, un doublon et des moyens de conformite divergents.
          </Empty>
        </Card>
      )}

      {report && (
        <Card
          title="Resultat du recoupement"
          subtitle={`${plan.requirements.length} exigences au plan ${plan.header.documentRef ?? plan.sourceName}`}
          actions={
            <Button
              variant="secondary"
              onClick={() =>
                downloadText(
                  safeFileName("recoupement-acp-coversheets", "csv"),
                  renderCrossCheckCsv(report),
                  "text/csv",
                )
              }
            >
              Export CSV
            </Button>
          }
        >
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric
              label="Couverture du plan"
              value={`${Math.round(report.coverageRatio * 100)} %`}
              tone={report.coverageRatio === 1 ? "ok" : "warning"}
            />
            <Metric
              label="Exigences non couvertes"
              value={report.uncovered.length}
              tone={report.uncovered.length ? "error" : "ok"}
            />
            <Metric
              label="Coversheets hors plan"
              value={report.orphans.length}
              tone={report.orphans.length ? "warning" : "ok"}
            />
            <Metric
              label="Doublons de couverture"
              value={report.duplicated.length}
              tone={report.duplicated.length ? "warning" : "ok"}
            />
          </div>
          <ResultList results={report.results} />
        </Card>
      )}
    </div>
  );
}

"use client";

/**
 * Module 4 : controle des en-tetes.
 *
 * Les reprises de documents pour un champ oublie ou une reference mal formee
 * sont frequentes et sans valeur ajoutee. Le controle est parametrable pour
 * coller aux regles du programme (ATA attendu, liste des programmes).
 */
import { useState } from "react";
import { Button, Card, Empty, FileInput, Metric, ResultList } from "../ui";
import { summarize } from "@/lib/coherence";
import { DEMO_FILES, describeLoadError, loadDemoPdf } from "@/lib/demo";
import { checkHeader, parseHeader } from "@/lib/headers";
import { extractPdfText } from "@/lib/pdf";
import type { CheckResult, DocumentHeader } from "@/lib/types";

const DEMOS = [
  { label: "Coversheet fictive (defauts)", path: DEMO_FILES.coversheet },
  { label: "ACP fictif (conforme)", path: DEMO_FILES.acp },
];

const FIELD_LABELS: [keyof DocumentHeader, string][] = [
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

export default function HeaderPanel() {
  const [header, setHeader] = useState<DocumentHeader>();
  const [results, setResults] = useState<CheckResult[]>();
  const [sourceName, setSourceName] = useState<string>();
  const [expectedAta, setExpectedAta] = useState("27");
  const [programmes, setProgrammes] = useState("A32N-DEMO");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  function analyse(parsed: DocumentHeader) {
    setHeader(parsed);
    setResults(
      checkHeader(parsed, {
        expectedAta: expectedAta.trim() || undefined,
        allowedProgrammes: programmes
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      }),
    );
  }

  async function load(source: File | string) {
    setBusy(true);
    setError(undefined);
    try {
      const document =
        typeof source === "string" ? await loadDemoPdf(source) : await extractPdfText(source);
      setSourceName(document.sourceName);
      analyse(parseHeader(document.pages[0]?.text ?? ""));
    } catch (cause) {
      setError(describeLoadError(cause));
    } finally {
      setBusy(false);
    }
  }

  const summary = results ? summarize(results) : undefined;

  return (
    <div className="flex flex-col gap-5">
      <Card
        title="Document a controler"
        subtitle="Seule la premiere page est analysee : l'en-tete se trouve sur la page de garde."
      >
        <FileInput
          label="Fichier PDF"
          accept="application/pdf"
          busy={busy}
          loaded={sourceName}
          onFile={(file) => load(file)}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {DEMOS.map((demo) => (
            <Button key={demo.path} variant="secondary" onClick={() => load(demo.path)} disabled={busy}>
              {demo.label}
            </Button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Chapitre ATA attendu</span>
            <input
              value={expectedAta}
              onChange={(event) => setExpectedAta(event.target.value)}
              className="w-24 rounded-md border px-2 py-1 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Programmes autorises (separes par des virgules)</span>
            <input
              value={programmes}
              onChange={(event) => setProgrammes(event.target.value)}
              className="rounded-md border px-2 py-1 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            />
          </label>
          <Button onClick={() => header && analyse(header)} disabled={!header}>
            Reappliquer les regles
          </Button>
        </div>

        {error && <p className="mt-3 text-sm text-err-500">{error}</p>}
      </Card>

      {!header && !busy && (
        <Card>
          <Empty>
            Chargez la coversheet fictive : le controle detecte un champ Programme absent, un
            approbateur identique au redacteur et une date d&apos;emission future.
          </Empty>
        </Card>
      )}

      {header && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Champs lus dans l'en-tete">
            <div className="scroll-x">
              <table className="w-full text-sm">
                <tbody>
                  {FIELD_LABELS.map(([key, label]) => (
                    <tr key={key} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="py-1.5 pr-4" style={{ color: "var(--text-muted)" }}>
                        {label}
                      </td>
                      <td className="py-1.5 font-mono text-xs">
                        {header[key] ?? <span className="text-err-500">absent</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {results && (
            <Card title={`Controles (${results.length})`}>
              <div className="mb-4 grid grid-cols-3 gap-3">
                <Metric label="Conformes" value={summary?.ok ?? 0} tone="ok" />
                <Metric label="A verifier" value={summary?.warning ?? 0} tone="warning" />
                <Metric label="Non conformes" value={summary?.error ?? 0} tone="error" />
              </div>
              <ResultList results={results} />
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

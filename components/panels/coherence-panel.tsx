"use client";

/**
 * Module 3 : verification de coherence des renvois.
 *
 * On fournit d'un cote la coversheet (ou tout document citant des chapitres) et
 * de l'autre le document de substantiation. L'outil confronte chaque renvoi a la
 * structure reelle du document cite.
 */
import { useState } from "react";
import { Button, Card, Empty, FileInput, Metric, ResultList } from "../ui";
import { checkCitations, extractChapters, extractCitations, summarize } from "@/lib/coherence";
import { downloadText, safeFileName } from "@/lib/download";
import { parseHeader } from "@/lib/headers";
import { extractPdfText, textToDocument } from "@/lib/pdf";
import type { CheckResult, DocumentChapter, PdfDocumentText } from "@/lib/types";

const DEMO_COVERSHEET = "/fixtures/CVS-27-FCS-0001_Iss2.pdf";
const DEMO_SUBSTANTIATION = "/fixtures/DOC-27-SAF-0142_Iss2.pdf";

async function loadPdf(source: File | string): Promise<PdfDocumentText> {
  if (typeof source === "string") {
    const response = await fetch(source);
    return extractPdfText(await response.arrayBuffer(), source.split("/").pop());
  }
  return extractPdfText(source);
}

export default function CoherencePanel() {
  const [citing, setCiting] = useState<PdfDocumentText>();
  const [substantiation, setSubstantiation] = useState<PdfDocumentText>();
  const [chapters, setChapters] = useState<DocumentChapter[]>([]);
  const [results, setResults] = useState<CheckResult[]>();
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState<"citing" | "substantiation" | undefined>();
  const [error, setError] = useState<string>();

  async function loadCiting(source: File | string) {
    setBusy("citing");
    setError(undefined);
    try {
      const document = await loadPdf(source);
      setCiting(document);
      setResults(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Lecture impossible.");
    } finally {
      setBusy(undefined);
    }
  }

  async function loadSubstantiation(source: File | string) {
    setBusy("substantiation");
    setError(undefined);
    try {
      const document = await loadPdf(source);
      setSubstantiation(document);
      setChapters(extractChapters(document.pages));
      setResults(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Lecture impossible.");
    } finally {
      setBusy(undefined);
    }
  }

  function run() {
    const source = pasted.trim()
      ? textToDocument(pasted, "saisie manuelle")
      : citing;
    if (!source || !substantiation) return;

    const header = parseHeader(substantiation.pages[0]?.text ?? "");
    const citations = extractCitations(source.pages.map((page) => page.text).join("\n"));

    setResults(
      checkCitations(citations, chapters, {
        actualDocumentRef: header.documentRef,
        actualDocumentIssue: header.issue,
      }),
    );
  }

  const summary = results ? summarize(results) : undefined;
  const ready = Boolean((citing || pasted.trim()) && substantiation);

  return (
    <div className="flex flex-col gap-5">
      <Card
        title="Documents a confronter"
        subtitle="Les deux PDF sont lus localement. Le second sert de reference : sa structure en chapitres est reconstituee."
      >
        <div className="flex flex-col gap-3">
          <FileInput
            label="Document citant des chapitres (coversheet)"
            accept="application/pdf"
            busy={busy === "citing"}
            loaded={citing?.sourceName}
            onFile={(file) => loadCiting(file)}
            onDemo={() => loadCiting(DEMO_COVERSHEET)}
            demoLabel="Charger la coversheet fictive"
          />
          <FileInput
            label="Document de substantiation cite"
            accept="application/pdf"
            busy={busy === "substantiation"}
            loaded={
              substantiation
                ? `${substantiation.sourceName} - ${chapters.length} chapitres detectes`
                : undefined
            }
            onFile={(file) => loadSubstantiation(file)}
            onDemo={() => loadSubstantiation(DEMO_SUBSTANTIATION)}
            demoLabel="Charger le dossier de securite fictif"
          />
        </div>

        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium">
            Ou coller directement le texte des renvois
          </summary>
          <textarea
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            rows={4}
            placeholder={'DOC-27-SAF-0142 Iss. 1 chapter 4.3.2 "Functional hazard assessment results"'}
            className="mt-2 w-full rounded-md border p-2 font-mono text-xs"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          />
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            Utile pour un PDF scanne sans couche texte. Le texte colle prend le pas sur le fichier.
          </p>
        </details>

        {error && <p className="mt-3 text-sm text-err-500">{error}</p>}

        <div className="mt-4">
          <Button onClick={run} disabled={!ready}>
            Verifier les renvois
          </Button>
          {!ready && (
            <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
              Chargez les deux documents pour lancer le controle.
            </p>
          )}
        </div>
      </Card>

      {results && (
        <Card
          title={`Resultats du controle (${results.length})`}
          actions={
            <Button
              variant="secondary"
              onClick={() =>
                downloadText(
                  safeFileName("controle-renvois", "csv"),
                  renderResultsCsv(results),
                  "text/csv",
                )
              }
            >
              Export CSV
            </Button>
          }
        >
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Conformes" value={summary?.ok ?? 0} tone="ok" />
            <Metric label="A verifier" value={summary?.warning ?? 0} tone="warning" />
            <Metric label="Non conformes" value={summary?.error ?? 0} tone="error" />
            <Metric label="Informations" value={summary?.info ?? 0} tone="info" />
          </div>
          <ResultList results={results} />
        </Card>
      )}

      {substantiation && chapters.length > 0 && (
        <Card
          title={`Structure reconstituee de ${substantiation.sourceName}`}
          subtitle="C'est cette structure qui sert de reference au controle."
        >
          <div className="scroll-x">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-left" style={{ color: "var(--text-muted)" }}>
                  <th className="pb-2 font-medium">Chapitre</th>
                  <th className="pb-2 font-medium">Titre</th>
                  <th className="pb-2 font-medium">Page</th>
                </tr>
              </thead>
              <tbody>
                {chapters.map((chapter) => (
                  <tr
                    key={`${chapter.number}-${chapter.page}`}
                    className="border-t"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <td className="py-1.5 font-mono text-xs">{chapter.number}</td>
                    <td className="py-1.5">{chapter.title}</td>
                    <td className="py-1.5 tabular-nums">{chapter.page}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!results && !substantiation && (
        <Card>
          <Empty>
            Chargez les deux exemples fictifs pour voir le controle detecter un chapitre inexistant,
            un titre divergent et une issue obsolete.
          </Empty>
        </Card>
      )}
    </div>
  );
}

function renderResultsCsv(results: CheckResult[]): string {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const rows = [["Statut", "Controle", "Detail", "Action proposee"].join(";")];
  for (const result of results) {
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

"use client";

/**
 * Onglet Parametres : bibliotheque de blocs types.
 *
 * On y declare, pour chaque famille de coversheet, quelles exigences vont
 * ensemble et quelle redaction leur correspond. C'est ce parametrage qui rend
 * la preparation d'une coversheet quasi automatique : le texte est deja ecrit,
 * seuls les reperes de paragraphe restent a pointer.
 *
 * Rien n'est devine ici. Tout ce que l'outil restituera plus tard a d'abord ete
 * saisi a cet endroit.
 */
import { useEffect, useMemo, useState } from "react";
import { Button, Card, Empty, Metric } from "../ui";
import { downloadText, safeFileName } from "@/lib/download";
import { loadLibrary, saveLibrary } from "@/lib/library-storage";
import { dedupeRequirements, extractOccurrencesFromPage } from "@/lib/requirements";
import {
  countPlaceholders,
  documentTypesOf,
  EMPTY_LIBRARY,
  forgetTemplate,
  isTemplateLibrary,
  mergeTemplates,
  normalizeDocumentType,
  templatesFor,
  type BlockTemplate,
  type TemplateLibrary,
} from "@/lib/templates";

const DEMO_LIBRARY = "/fixtures/blocs-types.json";

export default function TemplatesPanel() {
  const [library, setLibrary] = useState<TemplateLibrary>(EMPTY_LIBRARY);
  const [documentType, setDocumentType] = useState("");
  const [requirementsInput, setRequirementsInput] = useState("");
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<BlockTemplate>();
  const [error, setError] = useState<string>();

  useEffect(() => setLibrary(loadLibrary()), []);

  const types = documentTypesOf(library);
  const current = documentType ? templatesFor(library, documentType) : library.templates;

  /** Les exigences saisies sont normalisees par le meme parseur que l'ACP. */
  const parsed = useMemo(
    () => dedupeRequirements(extractOccurrencesFromPage(requirementsInput, 1)),
    [requirementsInput],
  );

  function persist(next: TemplateLibrary) {
    setLibrary(next);
    saveLibrary(next);
  }

  function submit() {
    if (!documentType.trim()) {
      setError("Indiquez la famille de document (SyDMP, SSA, VVS...).");
      return;
    }
    if (!parsed.length) {
      setError("Aucune exigence reconnue. Exemple : CS 25.0671(a) amdt. 23, JAR 25.1301(a) ch. 11");
      return;
    }
    setError(undefined);
    persist(
      mergeTemplates(editing ? forgetTemplate(library, editing) : library, [
        {
          documentType: normalizeDocumentType(documentType),
          requirementIds: parsed.map((requirement) => requirement.id),
          text: text.trim() || undefined,
        },
      ]),
    );
    setRequirementsInput("");
    setText("");
    setEditing(undefined);
  }

  async function importLibrary(source: File | string) {
    setError(undefined);
    try {
      const raw =
        typeof source === "string" ? await (await fetch(source)).text() : await source.text();
      const parsedFile: unknown = JSON.parse(raw);
      if (!isTemplateLibrary(parsedFile)) {
        throw new Error(
          'Format inattendu. Attendu : { "templates": [ { "documentType": "SyDMP", "requirementIds": ["CS 25.671(a)"], "text": "..." } ] }',
        );
      }
      persist(mergeTemplates(library, parsedFile.templates));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Fichier illisible.");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card
        title="Bibliotheque de blocs types"
        subtitle="Pour chaque famille de coversheet : quelles exigences vont ensemble, et la redaction qui leur correspond."
        actions={
          <>
            <Button variant="secondary" onClick={() => importLibrary(DEMO_LIBRARY)}>
              Charger l&apos;exemple fictif
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                downloadText(
                  safeFileName("blocs-types", "json"),
                  JSON.stringify(library, null, 2),
                  "application/json",
                )
              }
            >
              Exporter
            </Button>
            <label
              className="cursor-pointer rounded-md border px-3 py-1.5 text-sm"
              style={{ borderColor: "var(--border)" }}
            >
              Importer
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) importLibrary(file);
                }}
              />
            </label>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Familles de documents" value={types.length} />
          <Metric label="Blocs types" value={library.templates.length} />
          <Metric
            label="Blocs a plusieurs exigences"
            value={library.templates.filter((t) => t.requirementIds.length > 1).length}
          />
          <Metric
            label="Blocs sans redaction"
            value={library.templates.filter((t) => !t.text).length}
            tone={library.templates.some((t) => !t.text) ? "warning" : "ok"}
          />
        </div>

        {types.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>
              Filtrer :
            </span>
            <Button variant="secondary" onClick={() => setDocumentType("")}>
              Toutes
            </Button>
            {types.map((type) => (
              <Button key={type} variant="secondary" onClick={() => setDocumentType(type)}>
                {type}
              </Button>
            ))}
          </div>
        )}
      </Card>

      <Card
        title={editing ? "Modifier un bloc type" : "Ajouter un bloc type"}
        subtitle="Les exigences saisies ensemble forment un bloc : elles ne declencheront ce texte que si elles sont toutes selectionnees."
        actions={
          editing && (
            <Button
              variant="secondary"
              onClick={() => {
                setEditing(undefined);
                setRequirementsInput("");
                setText("");
              }}
            >
              Annuler
            </Button>
          )
        }
      >
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Famille de document</span>
            <input
              value={documentType}
              onChange={(event) => setDocumentType(event.target.value)}
              placeholder="SyDMP"
              list="familles-connues"
              className="max-w-xs rounded-md border px-2 py-1 font-mono text-xs"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            />
            <datalist id="familles-connues">
              {types.map((type) => (
                <option key={type} value={type} />
              ))}
            </datalist>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Exigences du bloc</span>
            <input
              value={requirementsInput}
              onChange={(event) => setRequirementsInput(event.target.value)}
              placeholder="CS 25.0671(a) amdt. 23, JAR 25.1301(a) ch. 11"
              className="rounded-md border px-2 py-1 font-mono text-xs"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            />
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {parsed.length
                ? `Reconnues : ${parsed.map((r) => r.id).join(", ")}`
                : "Collez les references telles qu'elles sont citees."}
            </span>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Redaction</span>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={8}
              placeholder={
                "The enclosed document describes in §x.x the activities to be performed,\nand references in §x.x the associated plans."
              }
              className="w-full rounded-md border p-2 font-mono text-xs leading-relaxed"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            />
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Ecrivez <span className="font-mono">§x.x</span> partout ou un chapitre devra etre
              pointe : {countPlaceholders(text)} repere{countPlaceholders(text) > 1 ? "s" : ""}{" "}
              dans ce texte.
            </span>
          </label>

          {error && <p className="text-sm text-err-500">{error}</p>}

          <div>
            <Button onClick={submit}>{editing ? "Enregistrer" : "Ajouter le bloc type"}</Button>
          </div>
        </div>
      </Card>

      <Card title={`Blocs types enregistres (${current.length})`}>
        {current.length === 0 ? (
          <Empty>
            Aucun bloc type. Chargez l&apos;exemple fictif, ou ajoutez-en un ci-dessus.
          </Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {current.map((template) => (
              <li
                key={`${template.documentType}-${template.requirementIds.join("|")}`}
                className="rounded-md border p-3"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <span className="rounded bg-brand-500 px-2 py-0.5 text-xs font-semibold text-white">
                      {template.documentType}
                    </span>
                    <span className="ml-2 font-mono text-xs">
                      {template.requirementIds.join(" + ")}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setEditing(template);
                        setDocumentType(template.documentType);
                        setRequirementsInput(template.requirementIds.join(", "));
                        setText(template.text ?? "");
                      }}
                    >
                      Modifier
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => persist(forgetTemplate(library, template))}
                    >
                      Supprimer
                    </Button>
                  </div>
                </div>
                {template.text ? (
                  <>
                    <pre
                      className="mt-2 max-h-40 overflow-y-auto rounded border p-2 text-[11px] leading-relaxed whitespace-pre-wrap"
                      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                    >
                      {template.text}
                    </pre>
                    <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                      {countPlaceholders(template.text)} repere
                      {countPlaceholders(template.text) > 1 ? "s" : ""} de paragraphe a pointer
                      {template.source ? ` · source : ${template.source}` : ""}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-warn-500">
                    Regroupement connu, redaction non renseignee.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

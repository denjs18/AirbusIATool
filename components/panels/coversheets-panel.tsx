"use client";

/**
 * Module 2 : preparation d'une coversheet.
 *
 * On choisit les exigences a couvrir, on designe le document de certification,
 * et l'outil restitue la redaction deja memorisee pour chaque combinaison
 * d'exigences. Il ne reste qu'a pointer les paragraphes du document joint.
 *
 * Le texte n'est jamais invente : il vient de la bibliotheque de blocs types,
 * renseignee dans l'onglet Parametres.
 */
import { useEffect, useMemo, useState } from "react";
import PlanRequired from "./plan-required";
import { Button, Card, Empty, Metric } from "../ui";
import {
  buildCoversheet,
  formatRequirementCitation,
  remainingPlaceholders,
  renderCoversheetMarkdown,
  TO_BE_COMPLETED,
} from "@/lib/coversheet";
import { downloadText, safeFileName } from "@/lib/download";
import { loadLibrary, saveLibrary } from "@/lib/library-storage";
import { dedupeRequirements, extractOccurrencesFromPage } from "@/lib/requirements";
import {
  applyTemplates,
  countPlaceholders,
  findTemplate,
  documentTypesOf,
  EMPTY_LIBRARY,
  knownRequirementsFor,
  learnFromBlocks,
  mergeTemplates,
  type AppliedBlock,
  type TemplateLibrary,
} from "@/lib/templates";
import type { ParsedPlan, RequirementRef } from "@/lib/types";

export default function CoversheetsPanel({
  plan,
  onPlan,
}: {
  plan?: ParsedPlan;
  onPlan: (plan: ParsedPlan) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [pasted, setPasted] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [documentRef, setDocumentRef] = useState("");
  const [documentIssue, setDocumentIssue] = useState("");
  const [documentTitle, setDocumentTitle] = useState("");
  const [moc, setMoc] = useState("");
  const [library, setLibrary] = useState<TemplateLibrary>(EMPTY_LIBRARY);
  const [manual, setManual] = useState<string[][]>();
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    const loaded = loadLibrary();
    setLibrary(loaded);
    const types = documentTypesOf(loaded);
    if (types.length) setDocumentType((current) => current || types[0]);
  }, []);

  const available: RequirementRef[] = useMemo(() => {
    if (pasted.trim()) return dedupeRequirements(extractOccurrencesFromPage(pasted, 1));
    return plan?.requirements ?? [];
  }, [pasted, plan]);

  /** Exigences que cette famille de coversheet sait deja traiter. */
  const known = useMemo(
    () => new Set(knownRequirementsFor(library, documentType)),
    [library, documentType],
  );

  const chosen = useMemo(
    () => available.filter((requirement) => selected.includes(requirement.id)),
    [available, selected],
  );

  const mocIds = useMemo(
    () =>
      moc
        .split(/[,;/\s]+/)
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean),
    [moc],
  );

  const match = useMemo(
    () => applyTemplates(documentType, chosen, library),
    [documentType, chosen, library],
  );

  const blocks: AppliedBlock[] = useMemo(() => {
    if (!manual) return match.blocks;

    const byId = new Map(chosen.map((requirement) => [requirement.id, requirement]));
    // Un bloc constitue a la main peut retomber sur une combinaison connue :
    // dans ce cas la redaction memorisee revient d'elle-meme.
    const toBlock = (requirements: RequirementRef[]): AppliedBlock => {
      const template = findTemplate(
        library,
        documentType,
        requirements.map((requirement) => requirement.id),
      );
      return { requirements, mocIds: [], justification: template?.text, template };
    };

    const assembled = manual
      .map((ids) => ids.map((id) => byId.get(id)).filter(Boolean) as RequirementRef[])
      .filter((requirements) => requirements.length > 0)
      .map(toBlock);

    const covered = new Set(assembled.flatMap((b) => b.requirements.map((r) => r.id)));
    for (const requirement of chosen) {
      if (!covered.has(requirement.id)) assembled.push(toBlock([requirement]));
    }
    return assembled;
  }, [manual, match.blocks, chosen, library, documentType]);

  const coversheet = useMemo(
    () =>
      buildCoversheet(blocks, {
        documentType: documentType || TO_BE_COMPLETED,
        enclosed: [
          {
            ref: documentRef.trim() || TO_BE_COMPLETED,
            issue: documentIssue.trim() || undefined,
            title: documentTitle.trim() || undefined,
          },
        ],
        mocIds,
        programme: plan?.header.programme,
        ataChapter: plan?.header.ataChapter,
      }),
    [blocks, documentType, documentRef, documentIssue, documentTitle, mocIds, plan],
  );

  if (!plan && !pasted.trim()) {
    return (
      <div className="flex flex-col gap-5">
        <PlanRequired
          title="Preparer une coversheet"
          explanation="Les exigences a couvrir viennent du plan de certification. Chargez l'ACP fictif, ou collez ci-dessous les exigences du tableau de conformite."
          onPlan={onPlan}
        />
        <Card title="Ou coller les exigences du tableau de l'ACP">
          <textarea
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            rows={4}
            placeholder={"CS 25.0671(a) amdt. 23, JAR 25.1301(a) ch. 11\nJAR 25.1309(b)(c)(d) CH 11"}
            className="w-full rounded-md border p-2 font-mono text-xs"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          />
        </Card>
      </div>
    );
  }

  const markdown = renderCoversheetMarkdown(coversheet);
  const withText = blocks.filter((block) => block.justification).length;
  const placeholders = remainingPlaceholders(coversheet);

  return (
    <div className="flex flex-col gap-5">
      <Card
        title="1. Document de certification"
        subtitle="La coversheet porte sur ce document. Sa famille determine les blocs types applicables."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Famille</span>
            <input
              value={documentType}
              onChange={(event) => setDocumentType(event.target.value)}
              list="familles-coversheet"
              placeholder="SyDMP"
              className="rounded-md border px-2 py-1 font-mono text-xs"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            />
            <datalist id="familles-coversheet">
              {documentTypesOf(library).map((type) => (
                <option key={type} value={type} />
              ))}
            </datalist>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {known.size
                ? `${known.size} exigence${known.size > 1 ? "s" : ""} connue${known.size > 1 ? "s" : ""} pour cette famille`
                : "Aucun bloc type pour cette famille (onglet Parametres)"}
            </span>
          </label>
          <Field label="Reference" value={documentRef} onChange={setDocumentRef} mono
                 placeholder={TO_BE_COMPLETED} />
          <Field label="Issue" value={documentIssue} onChange={setDocumentIssue} mono />
          <Field label="Titre" value={documentTitle} onChange={setDocumentTitle} />
          <Field label="Moyens de conformite" value={moc} onChange={setMoc} mono
                 hint="ex. 3, ou 4 6, ou S" />
        </div>
      </Card>

      <Card
        title="2. Exigences a couvrir"
        subtitle="Celles que le tableau de l'ACP rattache a ce document."
        actions={
          <>
            {known.size > 0 && (
              <Button
                variant="secondary"
                onClick={() => {
                  setManual(undefined);
                  setSelected(available.filter((r) => known.has(r.id)).map((r) => r.id));
                }}
              >
                Selectionner les exigences connues
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => {
                setManual(undefined);
                setSelected([]);
              }}
            >
              Vider
            </Button>
          </>
        }
      >
        {available.length === 0 ? (
          <Empty>Aucune exigence disponible.</Empty>
        ) : (
          <ul className="grid max-h-72 gap-1 overflow-y-auto sm:grid-cols-2">
            {available.map((requirement) => (
              <li key={requirement.id}>
                <label className="flex items-start gap-2 rounded px-2 py-1 text-sm hover:bg-ink-100 dark:hover:bg-ink-800">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.includes(requirement.id)}
                    onChange={() => {
                      setManual(undefined);
                      setSelected((current) =>
                        current.includes(requirement.id)
                          ? current.filter((id) => id !== requirement.id)
                          : [...current, requirement.id],
                      );
                    }}
                  />
                  <span className="font-mono text-xs">
                    {formatRequirementCitation(requirement)}
                  </span>
                  {known.has(requirement.id) && (
                    <span className="rounded bg-ok-100 px-1.5 text-[10px] font-semibold text-ok-500 uppercase">
                      connue
                    </span>
                  )}
                </label>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title={`3. Blocs de justification (${blocks.length})`}
        subtitle="La redaction memorisee est restituee ; il reste a pointer les paragraphes."
        actions={
          <>
            <Button
              variant="secondary"
              disabled={picked.length < 2}
              onClick={() => {
                setManual(() => {
                  const rest = blocks
                    .map((block) =>
                      block.requirements.map((r) => r.id).filter((id) => !picked.includes(id)),
                    )
                    .filter((ids) => ids.length > 0);
                  return [picked, ...rest];
                });
                setPicked([]);
              }}
            >
              Grouper la selection
            </Button>
            <Button
              variant="secondary"
              disabled={!blocks.length}
              onClick={() => {
                const next = mergeTemplates(
                  library,
                  learnFromBlocks(documentType, blocks, documentRef || undefined),
                );
                setLibrary(next);
                saveLibrary(next);
              }}
            >
              Enregistrer comme blocs types
            </Button>
          </>
        }
      >
        {blocks.length === 0 ? (
          <Empty>Selectionnez au moins une exigence.</Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {blocks.map((block, index) => {
              const justification = block.justification;
              return (
                <li
                  key={block.requirements.map((r) => r.id).join("|")}
                  className="rounded-md border p-3"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      Bloc {index + 1}
                      {justification ? (
                        <span className="ml-2 rounded bg-ok-100 px-1.5 py-0.5 text-[10px] font-semibold text-ok-500 uppercase">
                          redaction restituee
                        </span>
                      ) : (
                        <span className="ml-2 rounded bg-warn-100 px-1.5 py-0.5 text-[10px] font-semibold text-warn-500 uppercase">
                          a rediger
                        </span>
                      )}
                    </span>
                    <div className="flex gap-2">
                      {block.requirements.length > 1 && (
                        <Button
                          variant="secondary"
                          onClick={() =>
                            setManual(
                              blocks.flatMap((candidate) =>
                                candidate === block
                                  ? candidate.requirements.map((r) => [r.id])
                                  : [candidate.requirements.map((r) => r.id)],
                              ),
                            )
                          }
                        >
                          Separer
                        </Button>
                      )}
                    </div>
                  </div>

                  <ul className="mt-2 flex flex-col gap-1">
                    {block.requirements.map((requirement) => (
                      <li key={requirement.id}>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={picked.includes(requirement.id)}
                            onChange={() =>
                              setPicked((current) =>
                                current.includes(requirement.id)
                                  ? current.filter((id) => id !== requirement.id)
                                  : [...current, requirement.id],
                              )
                            }
                          />
                          <span className="font-mono text-xs">
                            {formatRequirementCitation(requirement)}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>

                  {justification ? (
                    <>
                      <pre
                        className="mt-2 max-h-48 overflow-y-auto rounded border p-2 text-[11px] leading-relaxed whitespace-pre-wrap"
                        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                      >
                        {justification}
                      </pre>
                      <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                        {countPlaceholders(justification)} repere
                        {countPlaceholders(justification) > 1 ? "s" : ""} de paragraphe a pointer
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
                      Aucun bloc type memorise pour cette combinaison. Renseignez-le dans
                      l&apos;onglet Parametres pour qu&apos;il soit restitue la prochaine fois.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Blocs" value={blocks.length} />
          <Metric
            label="Redactions restituees"
            value={withText}
            tone={withText ? "ok" : "info"}
          />
          <Metric
            label="A rediger"
            value={blocks.length - withText}
            tone={blocks.length - withText ? "warning" : "ok"}
          />
          <Metric
            label="Reperes a pointer"
            value={placeholders}
            tone={placeholders ? "warning" : "ok"}
          />
        </div>
      </Card>

      <Card
        title="4. Trame de la coversheet"
        actions={
          <Button
            disabled={!blocks.length}
            onClick={() =>
              downloadText(
                safeFileName(`coversheet-${documentRef || documentType || "sans-ref"}`, "md"),
                markdown,
                "text/markdown",
              )
            }
          >
            Telecharger
          </Button>
        }
      >
        {blocks.length === 0 ? (
          <Empty>La trame apparait des qu&apos;une exigence est selectionnee.</Empty>
        ) : (
          <pre
            className="scroll-x max-h-[520px] overflow-y-auto rounded-md border p-3 text-xs leading-relaxed"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            {markdown}
          </pre>
        )}
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
  mono,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  mono?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={`rounded-md border px-2 py-1 ${mono ? "font-mono text-xs" : "text-sm"}`}
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      />
      {hint && (
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {hint}
        </span>
      )}
    </label>
  );
}

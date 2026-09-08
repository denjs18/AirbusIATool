"use client";

/**
 * Module 2 : preparation d'une coversheet.
 *
 * Le point de depart est le classeur charge dans l'onglet Parametres : il dit
 * quels documents de certification sont connus, quelles exigences chacun
 * couvre, et quelle redaction correspond a chaque combinaison.
 *
 * Le parcours suit celui du redacteur : on designe le document dont on prepare
 * la coversheet, on coche les exigences qu'il traite pour ce standard, on
 * valide, puis on pointe les chapitres du document joint dans le texte
 * restitue.
 *
 * Le texte n'est jamais invente. Tout ce qui sort d'ici a d'abord ete ecrit
 * dans le classeur, ou saisi a l'ecran par le redacteur.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Empty, FileInput, Metric } from "../ui";
import { suggestForSlot, type ScoredChapter } from "@/lib/chapter-search";
import { extractChapters } from "@/lib/coherence";
import { DEMO_FILES, describeLoadError, loadDemoPdf } from "@/lib/demo";
import { extractPdfText } from "@/lib/pdf";
import {
  buildCoversheet,
  formatRequirementCitation,
  remainingPlaceholders,
  renderCoversheetMarkdown,
  TO_BE_COMPLETED,
} from "@/lib/coversheet";
import { downloadText, safeFileName } from "@/lib/download";
import { EMPTY_DRAFT, loadDraft, saveDraft } from "@/lib/draft-storage";
import { loadLibrary } from "@/lib/library-storage";
import {
  countPlaceholders,
  fillPlaceholders,
  splitPlaceholders,
  type PlaceholderSlot,
} from "@/lib/placeholders";
import {
  applyTemplates,
  documentTypesOf,
  EMPTY_LIBRARY,
  knownRequirementsFor,
  requirementIdsOf,
  templatesFor,
  type AppliedBlock,
  type TemplateLibrary,
} from "@/lib/templates";
import type { DocumentChapter, ParsedPlan, PdfDocumentText } from "@/lib/types";

/** Identifie un bloc de facon stable, pour rattacher les chapitres saisis. */
function blockKey(block: AppliedBlock): string {
  return block.requirements.map((requirement) => requirement.id).join("|");
}

export default function CoversheetsPanel({ plan }: { plan?: ParsedPlan }) {
  const [library, setLibrary] = useState<TemplateLibrary>(EMPTY_LIBRARY);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  /** Le brouillon est relu avant d'etre reenregistre, sinon on l'ecraserait vide. */
  const [restored, setRestored] = useState(false);
  const blocksRef = useRef<HTMLUListElement>(null);

  /**
   * Document joint charge pour la recherche de chapitres.
   *
   * Garde en memoire seulement, jamais dans le stockage du navigateur : c'est
   * du contenu de document, pas de la saisie. Le rouvrir coute un clic ; le
   * laisser trainer dans sessionStorage n'apporterait rien et ferait de l'outil
   * un endroit ou dorment des documents de certification.
   */
  const [enclosed, setEnclosed] = useState<PdfDocumentText>();
  const [chapters, setChapters] = useState<DocumentChapter[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  /** Repere dont les candidats sont ouverts, et les candidats correspondants. */
  const [openSlot, setOpenSlot] = useState<string>();
  const [candidates, setCandidates] = useState<ScoredChapter[]>([]);

  const { documentType, selected, validated, fills } = draft;

  useEffect(() => {
    setLibrary(loadLibrary());
    setDraft(loadDraft());
    setRestored(true);
  }, []);

  useEffect(() => {
    if (restored) saveDraft(draft);
  }, [draft, restored]);

  const patch = (change: Partial<typeof draft>) =>
    setDraft((current) => ({ ...current, ...change }));

  const documents = useMemo(() => documentTypesOf(library), [library]);

  /** Exigences que ce document de certification sait couvrir, d'apres le classeur. */
  const available = useMemo(
    () => (documentType ? knownRequirementsFor(library, documentType) : []),
    [library, documentType],
  );

  /** Combinaisons declarees pour ce document : ce qui va ensemble, et ce qui va seul. */
  const combinations = useMemo(
    () => (documentType ? templatesFor(library, documentType) : []),
    [library, documentType],
  );

  const chosen = useMemo(
    () => available.filter((requirement) => selected.includes(requirement.id)),
    [available, selected],
  );

  const mocIds = useMemo(
    () =>
      draft.moc
        .split(/[,;/\s]+/)
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean),
    [draft.moc],
  );

  const blocks = useMemo(
    () => applyTemplates(documentType, chosen, library).blocks,
    [documentType, chosen, library],
  );

  /** Chapitres saisis pour un bloc, ranges par rang de repere. */
  const valuesOf = (block: AppliedBlock): Record<number, string> => {
    const key = blockKey(block);
    const values: Record<number, string> = {};
    for (const [field, value] of Object.entries(fills)) {
      const [owner, rank] = field.split("#");
      if (owner === key) values[Number(rank)] = value;
    }
    return values;
  };

  /**
   * Blocs tels qu'ils partiront dans la coversheet : reperes remplaces par les
   * chapitres saisis, indications retirees. Une indication vient d'une edition
   * anterieure et n'a pas ete verifiee : elle ne doit pas ressortir comme un
   * chapitre cite.
   */
  const written = useMemo(
    () =>
      blocks.map((block) => ({
        ...block,
        justification: block.justification
          ? fillPlaceholders(block.justification, valuesOf(block))
          : undefined,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [blocks, fills],
  );

  const coversheet = useMemo(
    () =>
      buildCoversheet(written, {
        documentType: documentType || TO_BE_COMPLETED,
        enclosed: [
          {
            ref: draft.documentRef.trim() || TO_BE_COMPLETED,
            issue: draft.documentIssue.trim() || undefined,
            title: draft.documentTitle.trim() || undefined,
          },
        ],
        mocIds,
        programme: plan?.header.programme,
        ataChapter: plan?.header.ataChapter,
      }),
    [
      written,
      documentType,
      draft.documentRef,
      draft.documentIssue,
      draft.documentTitle,
      mocIds,
      plan,
    ],
  );

  /** Charge le document joint et en releve la structure en chapitres. */
  async function loadEnclosed(source: File | string) {
    setLoading(true);
    setLoadError(undefined);
    setOpenSlot(undefined);
    try {
      const document =
        typeof source === "string" ? await loadDemoPdf(source) : await extractPdfText(source);
      setEnclosed(document);
      setChapters(extractChapters(document.pages));
    } catch (cause) {
      setLoadError(describeLoadError(cause));
    } finally {
      setLoading(false);
    }
  }

  /** Propose les chapitres les plus proches de ce que la phrase annonce. */
  async function search(field: string, text: string, slotIndex: number) {
    if (openSlot === field) {
      setOpenSlot(undefined);
      return;
    }
    setOpenSlot(field);
    setCandidates(await suggestForSlot(text, slotIndex, chapters));
  }

  /** Toute modification de la selection invalide la trame deja produite. */
  const pick = (name: string) =>
    patch({ documentType: name, selected: [], validated: false });

  const toggle = (id: string) =>
    patch({
      validated: false,
      selected: selected.includes(id)
        ? selected.filter((value) => value !== id)
        : [...selected, id],
    });

  const selectExactly = (ids: string[]) => patch({ validated: false, selected: ids });

  /** Amene au premier repere encore vide, pour n'en oublier aucun. */
  function goToNextGap() {
    const inputs = blocksRef.current?.querySelectorAll<HTMLInputElement>("input[data-repere]");
    const next = [...(inputs ?? [])].find((input) => !input.value.trim());
    next?.focus();
    next?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  if (documents.length === 0) {
    return (
      <Card
        title="Preparer une coversheet"
        subtitle="Les documents de certification et leurs exigences viennent du classeur."
      >
        <Empty>
          Aucun document de certification connu. Chargez votre classeur Excel dans
          l&apos;onglet <strong>Parametres</strong> : il porte les exigences de chaque document
          et les redactions associees.
        </Empty>
      </Card>
    );
  }

  const markdown = renderCoversheetMarkdown(coversheet);
  const withText = blocks.filter((block) => block.justification).length;
  const total = blocks.reduce((sum, block) => sum + countPlaceholders(block.justification), 0);
  const remaining = remainingPlaceholders(coversheet);

  return (
    <div className="flex flex-col gap-5">
      <Card
        title="1. Document de certification"
        subtitle="Ceux que votre classeur declare. La coversheet porte sur l'un d'eux."
      >
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((type) => {
            const active = type === documentType;
            const count = knownRequirementsFor(library, type).length;
            const blocCount = templatesFor(library, type).length;
            return (
              <li key={type}>
                <button
                  type="button"
                  onClick={() => pick(type)}
                  className={`w-full rounded-md border p-3 text-left transition ${
                    active ? "bg-brand-500 text-white" : "hover:bg-ink-100 dark:hover:bg-ink-800"
                  }`}
                  style={{ borderColor: active ? "transparent" : "var(--border)" }}
                >
                  <span className="block font-mono text-sm font-semibold">{type}</span>
                  <span
                    className={`block text-xs ${active ? "text-white/80" : ""}`}
                    style={active ? undefined : { color: "var(--text-muted)" }}
                  >
                    {count} exigence{count > 1 ? "s" : ""} · {blocCount} bloc
                    {blocCount > 1 ? "s" : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      {documentType && (
        <Card
          title={`2. Exigences de ${documentType} (${selected.length}/${available.length})`}
          subtitle="Cochez celles que ce document traite pour ce standard, puis validez."
          actions={
            <>
              <Button
                variant="secondary"
                onClick={() => selectExactly(available.map((requirement) => requirement.id))}
              >
                Tout selectionner
              </Button>
              <Button variant="secondary" onClick={() => selectExactly([])}>
                Vider
              </Button>
              <Button disabled={selected.length === 0} onClick={() => patch({ validated: true })}>
                Valider
              </Button>
            </>
          }
        >
          <ul className="grid max-h-72 gap-1 overflow-y-auto sm:grid-cols-2">
            {available.map((requirement) => (
              <li key={requirement.id}>
                <label className="flex items-start gap-2 rounded px-2 py-1 text-sm hover:bg-ink-100 dark:hover:bg-ink-800">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.includes(requirement.id)}
                    onChange={() => toggle(requirement.id)}
                  />
                  <span className="font-mono text-xs">
                    {formatRequirementCitation(requirement)}
                  </span>
                </label>
              </li>
            ))}
          </ul>

          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium">
              Combinaisons declarees pour {documentType} ({combinations.length})
            </summary>
            <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
              Une redaction ne sort que si toutes les exigences de sa ligne sont cochees. C&apos;est
              ce qui permet a une exigence seule et a la meme exigence accompagnee d&apos;appeler
              deux textes differents.
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {combinations.map((template) => {
                const ids = requirementIdsOf(template);
                const complete = ids.every((id) => selected.includes(id));
                return (
                  <li
                    key={ids.join("|")}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border px-2 py-1"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <span className="font-mono text-xs">
                      {template.requirements.map(formatRequirementCitation).join(" + ")}
                      {!template.text && (
                        <span className="ml-2 rounded bg-warn-100 px-1.5 text-[10px] font-semibold text-warn-500 uppercase">
                          sans redaction
                        </span>
                      )}
                    </span>
                    <Button variant="secondary" onClick={() => selectExactly(ids)}>
                      {complete ? "Selectionnee" : "Selectionner ce bloc"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </details>
        </Card>
      )}

      {validated && (
        <>
          <Card
            title="3. Document joint"
            subtitle="Ce que l'outil ne peut pas savoir : la reference exacte de l'edition couverte."
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Reference" mono placeholder={TO_BE_COMPLETED}
                     value={draft.documentRef}
                     onChange={(documentRef) => patch({ documentRef })} />
              <Field label="Issue" mono value={draft.documentIssue}
                     onChange={(documentIssue) => patch({ documentIssue })} />
              <Field label="Titre" value={draft.documentTitle}
                     onChange={(documentTitle) => patch({ documentTitle })} />
              <Field label="Moyens de conformite" mono hint="ex. 3, ou 4 6, ou S"
                     value={draft.moc} onChange={(moc) => patch({ moc })} />
            </div>

            <div className="mt-4">
              <FileInput
                label="Charger le document joint (PDF) pour retrouver ses chapitres"
                accept="application/pdf,.pdf"
                busy={loading}
                onFile={(file) => loadEnclosed(file)}
                demoLabel="Charger le dossier de securite fictif"
                onDemo={() => loadEnclosed(DEMO_FILES.substantiation)}
                loaded={
                  enclosed
                    ? `${enclosed.sourceName} - ${chapters.length} chapitre(s) sur ${enclosed.pageCount} page(s)`
                    : undefined
                }
              />
              <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
                Facultatif. Le document est lu dans le navigateur et n&apos;est pas conserve : il
                sert seulement a proposer, pour chaque repere, les chapitres les plus proches de ce
                que la phrase annonce.
              </p>
              {loadError && <p className="mt-2 text-sm text-err-500">{loadError}</p>}
            </div>
          </Card>

          <Card
            title={`4. Pointer les chapitres (${total - remaining}/${total})`}
            subtitle={
              chapters.length
                ? "Chaque §x.x est un chapitre a designer. L'indication grisee rappelle ou il se trouvait a l'edition precedente ; « chercher » propose les chapitres du document charge. Les deux sont des pistes, pas des reponses."
                : "Chaque §x.x est un chapitre du document joint a designer. L'indication grisee rappelle ou il se trouvait a l'edition precedente : elle est a verifier, pas a recopier. Chargez le document joint ci-dessus pour que l'outil propose des chapitres."
            }
            actions={
              remaining > 0 && (
                <Button variant="secondary" onClick={goToNextGap}>
                  Aller au repere suivant
                </Button>
              )
            }
          >
            <ul ref={blocksRef} className="flex flex-col gap-2">
              {blocks.map((block, index) => {
                const values = valuesOf(block);
                const key = blockKey(block);
                const count = countPlaceholders(block.justification);
                const done = Object.entries(values).filter(([, v]) => v.trim()).length;
                const parts = block.justification ? splitPlaceholders(block.justification) : [];
                const openIndex = openSlot?.startsWith(`${key}#`)
                  ? Number(openSlot.slice(key.length + 1))
                  : undefined;
                const openHint = parts.find(
                  (part): part is PlaceholderSlot => part.kind === "slot" && part.index === openIndex,
                )?.hint;
                return (
                  <li
                    key={key}
                    className="rounded-md border p-3"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">Bloc {index + 1}</span>
                      {block.justification ? (
                        <span className="rounded bg-ok-100 px-1.5 py-0.5 text-[10px] font-semibold text-ok-500 uppercase">
                          redaction restituee
                        </span>
                      ) : (
                        <span className="rounded bg-warn-100 px-1.5 py-0.5 text-[10px] font-semibold text-warn-500 uppercase">
                          a rediger
                        </span>
                      )}
                      <span className="font-mono text-xs">
                        {block.requirements.map(formatRequirementCitation).join(", ")}
                      </span>
                    </div>

                    {block.justification ? (
                      <>
                        <div
                          className="mt-2 rounded border p-2 font-mono text-[11px] leading-loose whitespace-pre-wrap"
                          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                        >
                          {parts.map((part, position) =>
                            part.kind === "text" ? (
                              <span key={position}>{part.text}</span>
                            ) : (
                              <ChapterInput
                                key={position}
                                slot={part}
                                value={values[part.index] ?? ""}
                                onChange={(value) =>
                                  patch({ fills: { ...fills, [`${key}#${part.index}`]: value } })
                                }
                                open={openSlot === `${key}#${part.index}`}
                                onSearch={
                                  chapters.length
                                    ? () =>
                                        search(
                                          `${key}#${part.index}`,
                                          block.justification!,
                                          part.index,
                                        )
                                    : undefined
                                }
                              />
                            ),
                          )}
                        </div>

                        {openIndex !== undefined && (
                          <Candidates
                            rank={openIndex + 1}
                            hint={openHint}
                            candidates={candidates}
                            onChoose={(chapter) => {
                              patch({ fills: { ...fills, [openSlot!]: chapter } });
                              setOpenSlot(undefined);
                            }}
                            onClose={() => setOpenSlot(undefined)}
                          />
                        )}
                        <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                          {done}/{count} repere{count > 1 ? "s" : ""} pointe{done > 1 ? "s" : ""}
                          {block.template?.source ? ` · source : ${block.template.source}` : ""}
                        </p>
                      </>
                    ) : (
                      <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
                        Aucune ligne du classeur ne correspond a cette exigence prise ainsi.
                        Ajoutez-la pour ce document dans l&apos;onglet Parametres, ou completez la
                        selection pour retomber sur une combinaison declaree.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Blocs" value={blocks.length} />
              <Metric label="Redactions restituees" value={withText} tone={withText ? "ok" : "info"} />
              <Metric
                label="A rediger"
                value={blocks.length - withText}
                tone={blocks.length - withText ? "warning" : "ok"}
              />
              <Metric
                label="Reperes restants"
                value={remaining}
                tone={remaining ? "warning" : "ok"}
              />
            </div>
          </Card>

          <Card
            title="5. Coversheet"
            subtitle={
              remaining
                ? `${remaining} repere${remaining > 1 ? "s" : ""} encore a pointer : la trame sortira avec ses trous.`
                : "Tous les reperes sont pointes."
            }
            actions={
              <Button
                onClick={() =>
                  downloadText(
                    safeFileName(`coversheet-${draft.documentRef || documentType}`, "md"),
                    markdown,
                    "text/markdown",
                  )
                }
              >
                Telecharger
              </Button>
            }
          >
            <pre
              className="scroll-x max-h-[520px] overflow-y-auto rounded-md border p-3 text-xs leading-relaxed"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              {markdown}
            </pre>
          </Card>
        </>
      )}
    </div>
  );
}

/**
 * Champ de saisie d'un chapitre, a la place du repere, dans la phrase.
 *
 * On lit le trou dans son contexte plutot que dans une liste detachee du texte,
 * et l'indication de l'edition precedente s'affiche en grise tant que rien
 * n'est saisi : elle guide la recherche sans jamais se substituer a elle.
 */
function ChapterInput({
  slot,
  value,
  onChange,
  onSearch,
  open,
}: {
  slot: PlaceholderSlot;
  value: string;
  onChange: (value: string) => void;
  /** Absent tant qu'aucun document joint n'est charge : il n'y a rien a chercher. */
  onSearch?: () => void;
  open?: boolean;
}) {
  const width = Math.max(4, (value || slot.hint || "x.x").length + 2);
  const filled = value.trim().length > 0;
  return (
    <span className="inline-flex items-baseline">
      <span>§</span>
      <input
        data-repere
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={slot.hint ?? "x.x"}
        title={
          slot.hint
            ? `Edition precedente : ${slot.hint} — a verifier dans le document joint`
            : "Aucune indication : chapitre a rechercher dans le document joint"
        }
        style={{
          width: `${width}ch`,
          borderColor: filled ? "var(--border)" : "var(--warn-500, #b45309)",
        }}
        className="mx-0.5 rounded border px-1 py-0 text-center font-mono text-[11px]"
      />
      {onSearch && (
        <button
          type="button"
          onClick={onSearch}
          title="Proposer les chapitres du document joint les plus proches de cette phrase"
          className={`ml-0.5 rounded border px-1 text-[10px] leading-tight ${
            open ? "bg-brand-500 text-white" : "hover:bg-ink-100 dark:hover:bg-ink-800"
          }`}
          style={{ borderColor: open ? "transparent" : "var(--border)" }}
        >
          chercher
        </button>
      )}
    </span>
  );
}

/**
 * Chapitres proposes pour un repere.
 *
 * Chaque candidat affiche les termes qui l'ont fait remonter : une suggestion
 * qu'on ne peut pas critiquer n'a pas sa place dans une chaine de
 * certification. Quand un candidat porte le numero de l'indication laissee par
 * l'edition precedente, c'est signale : les deux pistes convergent, la
 * verification sera rapide.
 */
function Candidates({
  rank,
  hint,
  candidates,
  onChoose,
  onClose,
}: {
  rank: number;
  hint?: string;
  candidates: ScoredChapter[];
  onChoose: (chapter: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="mt-2 rounded-md border p-2"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium">
          Chapitres proposes pour le repere {rank}
          {hint && (
            <span className="ml-2 font-normal" style={{ color: "var(--text-muted)" }}>
              indication de l&apos;edition precedente : {hint}
            </span>
          )}
        </span>
        <Button variant="secondary" onClick={onClose}>
          Fermer
        </Button>
      </div>

      {candidates.length === 0 ? (
        <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
          Aucun chapitre ne partage de terme avec cette phrase. C&apos;est une reponse, pas une
          panne : le chapitre existe peut-etre sous un autre vocabulaire, et reste a trouver a la
          lecture.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {candidates.map((candidate) => (
            <li
              key={candidate.chapter.number}
              data-candidat={candidate.chapter.number}
              className="flex flex-wrap items-center justify-between gap-2 rounded border px-2 py-1"
              style={{ borderColor: "var(--border)" }}
            >
              <span className="text-xs">
                <span className="font-mono font-semibold">{candidate.chapter.number}</span>{" "}
                {candidate.chapter.title}{" "}
                <span style={{ color: "var(--text-muted)" }}>
                  · p. {candidate.chapter.page} · termes : {candidate.matched.slice(0, 4).join(", ")}
                </span>
                {hint === candidate.chapter.number && (
                  <span className="ml-2 rounded bg-ok-100 px-1.5 text-[10px] font-semibold text-ok-500 uppercase">
                    = indication
                  </span>
                )}
              </span>
              <Button variant="secondary" onClick={() => onChoose(candidate.chapter.number)}>
                Choisir
              </Button>
            </li>
          ))}
        </ul>
      )}
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

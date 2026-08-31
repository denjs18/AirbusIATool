"use client";

/**
 * Module 2 : preparation d'une coversheet.
 *
 * Deroule le processus reel : on choisit les exigences a couvrir, on designe le
 * document de certification qui les traite, et l'outil monte la coversheet en
 * reprenant les regroupements des coversheets precedentes.
 *
 * Ce qui reste a completer est explicitement liste : l'outil ne sait pas ou
 * pointer dans le document joint.
 */
import { useEffect, useMemo, useState } from "react";
import PlanRequired from "./plan-required";
import { Button, Card, Empty, Metric } from "../ui";
import {
  buildCoversheet,
  formatRequirementCitation,
  renderCoversheetMarkdown,
  TO_BE_COMPLETED,
} from "@/lib/coversheet";
import { downloadText, safeFileName } from "@/lib/download";
import {
  applyGrouping,
  EMPTY_MEMORY,
  isGroupingMemory,
  learnFromGroups,
  mergeMemory,
  type GroupingMemory,
} from "@/lib/grouping";
import { dedupeRequirements, extractOccurrencesFromPage } from "@/lib/requirements";
import type { ParsedPlan, RequirementGroup, RequirementRef } from "@/lib/types";

const MEMORY_KEY = "airbus-ia-tool.grouping-memory";

/** La memoire ne quitte pas le poste : elle vit dans le navigateur. */
function loadMemory(): GroupingMemory {
  try {
    const raw = window.localStorage.getItem(MEMORY_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isGroupingMemory(parsed) ? parsed : EMPTY_MEMORY;
  } catch {
    return EMPTY_MEMORY;
  }
}

function saveMemory(memory: GroupingMemory) {
  try {
    window.localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
  } catch {
    // Navigation privee ou stockage refuse : la memoire reste en session.
  }
}

export default function CoversheetsPanel({
  plan,
  onPlan,
}: {
  plan?: ParsedPlan;
  onPlan: (plan: ParsedPlan) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [pasted, setPasted] = useState("");
  const [documentType, setDocumentType] = useState("SSA");
  const [documentRef, setDocumentRef] = useState("");
  const [documentIssue, setDocumentIssue] = useState("");
  const [documentTitle, setDocumentTitle] = useState("");
  const [moc, setMoc] = useState("3");
  const [memory, setMemory] = useState<GroupingMemory>(EMPTY_MEMORY);
  /** Regroupement force par le redacteur, qui prime sur la memoire. */
  const [manualGroups, setManualGroups] = useState<string[][]>();
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => setMemory(loadMemory()), []);

  /** Exigences disponibles : celles du plan, ou celles collees a la main. */
  const available: RequirementRef[] = useMemo(() => {
    if (pasted.trim()) {
      return dedupeRequirements(extractOccurrencesFromPage(pasted, 1));
    }
    return plan?.requirements ?? [];
  }, [pasted, plan]);

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

  const auto = useMemo(
    () => applyGrouping(documentType, chosen, memory),
    [documentType, chosen, memory],
  );

  const groups: RequirementGroup[] = useMemo(() => {
    if (!manualGroups) return auto.groups;
    const byId = new Map(chosen.map((requirement) => [requirement.id, requirement]));
    const assembled = manualGroups
      .map((ids) => ids.map((id) => byId.get(id)).filter(Boolean) as RequirementRef[])
      .filter((requirements) => requirements.length > 0)
      .map((requirements) => ({ requirements, mocIds: [] }));
    // Une exigence cochee apres coup n'appartient encore a aucun bloc force.
    const covered = new Set(assembled.flatMap((g) => g.requirements.map((r) => r.id)));
    for (const requirement of chosen) {
      if (!covered.has(requirement.id)) {
        assembled.push({ requirements: [requirement], mocIds: [] });
      }
    }
    return assembled;
  }, [manualGroups, auto.groups, chosen]);

  const coversheet = useMemo(
    () =>
      buildCoversheet(groups, {
        documentType,
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
    [groups, documentType, documentRef, documentIssue, documentTitle, mocIds, plan],
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
  const togglePicked = (id: string) =>
    setPicked((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  return (
    <div className="flex flex-col gap-5">
      <Card
        title="1. Exigences a couvrir"
        subtitle="Celles que le tableau de l'ACP rattache au document de certification."
        actions={
          <>
            <Button variant="secondary" onClick={() => setSelected(available.map((r) => r.id))}>
              Tout selectionner
            </Button>
            <Button variant="secondary" onClick={() => { setSelected([]); setManualGroups(undefined); }}>
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
                      setManualGroups(undefined);
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
                </label>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>
          {chosen.length} exigence{chosen.length > 1 ? "s" : ""} selectionnee
          {chosen.length > 1 ? "s" : ""}.
        </p>
      </Card>

      <Card
        title="2. Document de certification"
        subtitle="La coversheet porte sur ce document, et couvre toutes les exigences selectionnees."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Famille" value={documentType} onChange={setDocumentType} mono
                 hint="SSA, SyDAS, VVS, SyDMP... sert de cle aux regroupements" />
          <Field label="Reference" value={documentRef} onChange={setDocumentRef} mono
                 placeholder={TO_BE_COMPLETED} />
          <Field label="Issue" value={documentIssue} onChange={setDocumentIssue} mono />
          <Field label="Titre" value={documentTitle} onChange={setDocumentTitle} />
          <Field label="Moyens de conformite" value={moc} onChange={setMoc} mono
                 hint="ex. 3, ou 4 6, ou S" />
        </div>
      </Card>

      <Card
        title={`3. Blocs de justification (${groups.length})`}
        subtitle="Un bloc par justification a rediger. Les regroupements connus sont rejoues automatiquement."
        actions={
          <>
            <Button
              variant="secondary"
              disabled={picked.length < 2}
              onClick={() => {
                setManualGroups(() => {
                  const rest = groups
                    .map((group) => group.requirements.map((r) => r.id).filter((id) => !picked.includes(id)))
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
              disabled={!chosen.length}
              onClick={() => {
                const rules = learnFromGroups(documentType, groups, documentRef || undefined);
                const next = mergeMemory(memory, rules);
                setMemory(next);
                saveMemory(next);
              }}
            >
              Memoriser ces regroupements
            </Button>
          </>
        }
      >
        {groups.length === 0 ? (
          <Empty>Selectionnez au moins une exigence.</Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {groups.map((group, index) => (
              <li
                key={group.requirements.map((r) => r.id).join("|")}
                className="rounded-md border p-3"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">Bloc {index + 1}</span>
                  {group.requirements.length > 1 && (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        setManualGroups(
                          groups.flatMap((candidate) =>
                            candidate === group
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
                <ul className="mt-2 flex flex-col gap-1">
                  {group.requirements.map((requirement) => (
                    <li key={requirement.id}>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={picked.includes(requirement.id)}
                          onChange={() => togglePicked(requirement.id)}
                        />
                        <span className="font-mono text-xs">
                          {formatRequirementCitation(requirement)}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Blocs" value={groups.length} />
          <Metric
            label="Regroupements rejoues"
            value={auto.applied.length}
            tone={auto.applied.length ? "ok" : "info"}
          />
          <Metric label="Regles en memoire" value={memory.rules.length} />
          <Metric label="Justifications a rediger" value={groups.length} tone="warning" />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() =>
              downloadText(
                safeFileName("regroupements", "json"),
                JSON.stringify(memory, null, 2),
                "application/json",
              )
            }
          >
            Exporter la memoire
          </Button>
          <label className="cursor-pointer rounded-md border px-3 py-1.5 text-sm"
                 style={{ borderColor: "var(--border)" }}>
            Importer une memoire
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                try {
                  const parsed: unknown = JSON.parse(await file.text());
                  if (!isGroupingMemory(parsed)) return;
                  const next = mergeMemory(memory, parsed.rules);
                  setMemory(next);
                  saveMemory(next);
                } catch {
                  // Fichier illisible : la memoire courante reste en place.
                }
              }}
            />
          </label>
        </div>
      </Card>

      <Card
        title="4. Trame de la coversheet"
        actions={
          <Button
            disabled={!chosen.length}
            onClick={() =>
              downloadText(
                safeFileName(`coversheet-${documentRef || documentType}`, "md"),
                markdown,
                "text/markdown",
              )
            }
          >
            Telecharger
          </Button>
        }
      >
        {chosen.length === 0 ? (
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

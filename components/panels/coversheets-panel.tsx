"use client";

/**
 * Module 2 : preparation des trames de coversheets.
 *
 * L'outil met en place la structure a partir des exigences EASA citees dans
 * l'ACP. Les champs relevant du jugement d'ingenierie restent explicitement
 * marques "[A REDIGER]" : c'est ce qui distingue une aide a la redaction d'une
 * redaction automatique.
 */
import { useMemo, useState } from "react";
import { Button, Card, Empty, Metric } from "../ui";
import { downloadText, safeFileName } from "@/lib/download";
import {
  buildCoversheetsFromPlan,
  renderCoversheetIndex,
  renderCoversheetMarkdown,
  TO_BE_WRITTEN,
} from "@/lib/coversheet";
import { MOC_DEFINITIONS } from "@/lib/moc";
import type { ParsedPlan } from "@/lib/types";

export default function CoversheetsPanel({ plan }: { plan?: ParsedPlan }) {
  const [author, setAuthor] = useState("");
  const [prefix, setPrefix] = useState("CVS-27-FCS");
  const [selected, setSelected] = useState(0);

  const coversheets = useMemo(
    () =>
      plan
        ? buildCoversheetsFromPlan(plan, {
            author: author.trim() || undefined,
            refPrefix: prefix.trim() || undefined,
          })
        : [],
    [plan, author, prefix],
  );

  if (!plan) {
    return (
      <Card title="Trames de coversheets">
        <Empty>Importez d&apos;abord un plan de certification dans l&apos;onglet 1.</Empty>
      </Card>
    );
  }

  const current = coversheets[Math.min(selected, coversheets.length - 1)];
  const markdown = current ? renderCoversheetMarkdown(current, plan.sourceName) : "";
  const fromPlan = coversheets.filter((sheet) =>
    plan.occurrences.some(
      (occurrence) => occurrence.id === sheet.requirement.id && occurrence.mocCodes.length > 0,
    ),
  ).length;

  return (
    <div className="flex flex-col gap-5">
      <Card
        title={`Trames generees a partir de ${plan.sourceName}`}
        subtitle="Une trame par exigence citee dans le plan. Rien n'est emis : les trames sont a completer par le redacteur."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() =>
                downloadText(
                  safeFileName("index-coversheets", "md"),
                  renderCoversheetIndex(coversheets),
                  "text/markdown",
                )
              }
            >
              Export sommaire
            </Button>
            <Button
              onClick={() =>
                downloadText(
                  safeFileName("trames-coversheets", "md"),
                  coversheets
                    .map((sheet) => renderCoversheetMarkdown(sheet, plan.sourceName))
                    .join("\n\n---\n\n"),
                  "text/markdown",
                )
              }
            >
              Export du lot complet
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Trames preparees" value={coversheets.length} />
          <Metric label="MoC reprises de l'ACP" value={fromPlan} tone="ok" />
          <Metric
            label="MoC proposees par defaut"
            value={coversheets.length - fromPlan}
            tone={coversheets.length - fromPlan ? "warning" : "ok"}
          />
          <Metric label="Champs a rediger par trame" value="5" tone="info" />
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Prefixe des references</span>
            <input
              value={prefix}
              onChange={(event) => setPrefix(event.target.value)}
              className="rounded-md border px-2 py-1 font-mono text-xs"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Redacteur pressenti (optionnel)</span>
            <input
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              placeholder={TO_BE_WRITTEN}
              className="rounded-md border px-2 py-1 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            />
          </label>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <Card title="Lot de trames">
          <ul className="flex max-h-[520px] flex-col gap-1 overflow-y-auto">
            {coversheets.map((sheet, index) => {
              const active = index === Math.min(selected, coversheets.length - 1);
              return (
                <li key={sheet.header.documentRef}>
                  <button
                    type="button"
                    onClick={() => setSelected(index)}
                    className={`w-full rounded px-2 py-1.5 text-left text-sm transition ${
                      active ? "bg-brand-500 text-white" : "hover:bg-ink-100 dark:hover:bg-ink-800"
                    }`}
                  >
                    <span className="block font-mono text-xs">{sheet.header.documentRef}</span>
                    <span className={`block text-xs ${active ? "text-white/80" : ""}`}
                      style={active ? undefined : { color: "var(--text-muted)" }}>
                      {sheet.requirement.id} - {sheet.mocCodes.join(" ")}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        {current && (
          <Card
            title={`Trame ${current.header.documentRef}`}
            subtitle={`Exigence ${current.requirement.id}`}
            actions={
              <Button
                variant="secondary"
                onClick={() =>
                  downloadText(
                    safeFileName(current.header.documentRef ?? "coversheet", "md"),
                    markdown,
                    "text/markdown",
                  )
                }
              >
                Telecharger cette trame
              </Button>
            }
          >
            <div className="mb-4 flex flex-wrap gap-2">
              {current.mocCodes.map((code) => (
                <span
                  key={code}
                  className="rounded border px-2 py-1 text-xs"
                  style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                  title={MOC_DEFINITIONS[code].labelEn}
                >
                  {code} - {MOC_DEFINITIONS[code].labelFr}
                </span>
              ))}
            </div>
            <pre
              className="scroll-x max-h-[460px] overflow-y-auto rounded-md border p-3 text-xs leading-relaxed"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              {markdown}
            </pre>
          </Card>
        )}
      </div>
    </div>
  );
}
